// Driver onboarding (profile, vehicles, documents, submit) and admin review.
import type { Driver, Prisma } from "@prisma/client";
import { z } from "zod";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, saveFile, signedFileUrl, sniffMime } from "../adapters/storage.js";
import { prisma } from "../db.js";
import { age, bankAccountNo, email, gender, ifsc, personName, upiId, uuid, vehicleReg } from "../domain/validators.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { audit } from "./audit.js";
import { encrypt } from "./crypto.js";

export const profileInput = z
  .object({
    name: personName,
    email: email.optional(),
    age: age.optional(),
    gender: gender.optional(),
    homeCityId: uuid,
    bankAccountName: personName.optional(),
    bankAccountNo: bankAccountNo.optional(),
    bankIfsc: ifsc.optional(),
    upiId: upiId.optional(),
  })
  .partial()
  .refine((v) => !v.bankAccountNo || (v.bankIfsc && v.bankAccountName), {
    message: "Add the account holder name and IFSC with the account number",
    path: ["bankIfsc"],
  });

const currentYear = new Date().getFullYear();
export const vehicleInput = z.object({
  vehicleTypeId: uuid,
  registrationNo: vehicleReg,
  make: z.string().trim().min(2).max(40),
  model: z.string().trim().min(1).max(40),
  year: z.number().int().min(currentYear - 20).max(currentYear + 1),
  colour: z.string().trim().min(3).max(30),
  plateType: z.enum(["YELLOW", "WHITE"]),
});

const driverInclude = {
  user: true,
  homeCity: true,
  vehicles: { include: { vehicleType: true }, orderBy: { createdAt: "asc" } },
  documents: { include: { documentType: true }, orderBy: { createdAt: "desc" } },
} satisfies Prisma.DriverInclude;

type FullDriver = Prisma.DriverGetPayload<{ include: typeof driverInclude }>;

/** Latest document per (type, vehicle). Older uploads are kept for the record but not shown as current. */
function currentDocuments(d: FullDriver) {
  const seen = new Set<string>();
  return d.documents.filter((doc) => {
    const k = `${doc.documentTypeId}:${doc.vehicleId ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** What still needs uploading before the driver can submit. */
export async function documentChecklist(d: FullDriver) {
  const types = await prisma.documentType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const docs = currentDocuments(d);
  const anyYellow = d.vehicles.some((v) => v.plateType === "YELLOW");
  const needed = (t: (typeof types)[number], plate?: "YELLOW" | "WHITE") =>
    t.required && (!t.requiredIfPlate || (plate ? plate === t.requiredIfPlate : t.requiredIfPlate === "YELLOW" && anyYellow));

  const item = (t: (typeof types)[number], vehicleId: string | null, required: boolean) => {
    const doc = docs.find((x) => x.documentTypeId === t.id && x.vehicleId === vehicleId);
    return { documentTypeId: t.id, code: t.code, label: t.label, vehicleId, required, hasExpiry: t.hasExpiry, documentId: doc?.id ?? null, status: doc?.status ?? null, rejectReason: doc?.rejectReason ?? null };
  };
  const driverItems = types.filter((t) => t.appliesTo === "DRIVER").map((t) => item(t, null, needed(t)));
  const vehicleItems = d.vehicles.flatMap((v) =>
    types.filter((t) => t.appliesTo === "VEHICLE").map((t) => item(t, v.id, needed(t, v.plateType))),
  );
  const all = [...driverItems, ...vehicleItems];
  return { items: all, missing: all.filter((i) => i.required && (!i.documentId || i.status === "REJECTED")) };
}

async function loadByUser(userId: string) {
  const d = await prisma.driver.findUnique({ where: { userId }, include: driverInclude });
  if (!d) throw notFound("Driver profile");
  return d;
}

function view(d: FullDriver) {
  return {
    id: d.id,
    status: d.status,
    rejectionReason: d.rejectionReason,
    name: d.user.name,
    phone: d.user.phone,
    email: d.user.email,
    age: d.user.age,
    gender: d.user.gender,
    homeCity: d.homeCity ? { id: d.homeCity.id, name: d.homeCity.name } : null,
    bank: {
      accountName: d.bankAccountName,
      accountNoLast4: d.bankAccountNoLast4,
      ifsc: d.bankIfsc,
      upiId: d.upiId,
    },
    vehicles: d.vehicles.map((v) => ({
      id: v.id,
      type: { id: v.vehicleType.id, name: v.vehicleType.name, passengerSeats: v.vehicleType.passengerSeats },
      registrationNo: v.registrationNo,
      make: v.make,
      model: v.model,
      year: v.year,
      colour: v.colour,
      plateType: v.plateType,
      status: v.status,
      rejectionReason: v.rejectionReason,
    })),
    submittedAt: d.submittedAt,
    approvedAt: d.approvedAt,
  };
}

export async function getMyDriverProfile(userId: string) {
  const d = await loadByUser(userId);
  return { ...view(d), documents: await documentChecklist(d) };
}

export async function updateMyDriverProfile(userId: string, input: z.infer<typeof profileInput>) {
  const d = await loadByUser(userId);
  if (d.status === "SUSPENDED") throw forbidden("Your account is suspended. Contact support.");
  if (input.homeCityId) {
    const city = await prisma.city.findUnique({ where: { id: input.homeCityId } });
    if (!city?.active) throw badRequest("INVALID_CITY", "Choose a city from the list");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { name: input.name, email: input.email, age: input.age, gender: input.gender },
    }),
    prisma.driver.update({
      where: { id: d.id },
      data: {
        homeCityId: input.homeCityId,
        bankAccountName: input.bankAccountName,
        bankIfsc: input.bankIfsc,
        upiId: input.upiId,
        ...(input.bankAccountNo ? { bankAccountNoEnc: encrypt(input.bankAccountNo), bankAccountNoLast4: input.bankAccountNo.slice(-4) } : {}),
      },
    }),
  ]);
  return getMyDriverProfile(userId);
}

export async function addVehicle(userId: string, input: z.infer<typeof vehicleInput>) {
  const d = await loadByUser(userId);
  if (d.status === "SUSPENDED") throw forbidden("Your account is suspended. Contact support.");
  const type = await prisma.vehicleType.findUnique({ where: { id: input.vehicleTypeId } });
  if (!type?.active) throw badRequest("INVALID_VEHICLE_TYPE", "Choose a vehicle type from the list");
  if (await prisma.vehicle.findUnique({ where: { registrationNo: input.registrationNo } })) {
    throw conflict("VEHICLE_EXISTS", "This vehicle number is already registered");
  }
  const v = await prisma.vehicle.create({ data: { ...input, driverId: d.id } });
  return v;
}

/** Editing a vehicle sends it back for review. */
export async function updateVehicle(userId: string, vehicleId: string, input: Partial<z.infer<typeof vehicleInput>>) {
  const d = await loadByUser(userId);
  const v = d.vehicles.find((x) => x.id === vehicleId);
  if (!v) throw notFound("Vehicle");
  const active = await prisma.ride.count({ where: { vehicleId, status: { in: ["OPEN", "FULL", "STARTED", "PENDING_APPROVAL"] } } });
  if (active > 0) throw conflict("VEHICLE_IN_USE", "This vehicle has upcoming rides. Cancel them before editing.");
  if (input.registrationNo && input.registrationNo !== v.registrationNo && (await prisma.vehicle.findUnique({ where: { registrationNo: input.registrationNo } }))) {
    throw conflict("VEHICLE_EXISTS", "This vehicle number is already registered");
  }
  return prisma.vehicle.update({ where: { id: vehicleId }, data: { ...input, status: "PENDING", rejectionReason: null } });
}

export async function uploadDocument(
  userId: string,
  meta: { documentTypeId: string; vehicleId?: string | null; expiryDate?: Date | null },
  file: { data: Buffer; declaredMime: string },
) {
  const d = await loadByUser(userId);
  if (d.status === "SUSPENDED") throw forbidden("Your account is suspended. Contact support.");
  const type = await prisma.documentType.findUnique({ where: { id: meta.documentTypeId } });
  if (!type?.active) throw badRequest("INVALID_DOCUMENT_TYPE", "Unknown document type");
  if (type.appliesTo === "VEHICLE" && !meta.vehicleId) throw badRequest("VEHICLE_REQUIRED", "Choose which vehicle this document is for");
  if (type.appliesTo === "DRIVER" && meta.vehicleId) throw badRequest("NOT_A_VEHICLE_DOCUMENT", "This is a driver document");
  if (meta.vehicleId && !d.vehicles.some((v) => v.id === meta.vehicleId)) throw notFound("Vehicle");
  if (type.hasExpiry && !meta.expiryDate) throw badRequest("EXPIRY_REQUIRED", `Enter the expiry date of the ${type.label}`);

  if (file.data.length === 0) throw badRequest("EMPTY_FILE", "The file is empty");
  if (file.data.length > MAX_UPLOAD_BYTES) throw badRequest("FILE_TOO_LARGE", "Files must be 5 MB or smaller");
  const mime = sniffMime(file.data);
  if (!mime || !ALLOWED_MIME[mime]) throw badRequest("FILE_TYPE", "Upload a JPG, PNG or PDF file");

  const key = await saveFile(`drivers/${d.id}`, mime, file.data);
  const doc = await prisma.document.create({
    data: {
      ownerType: type.appliesTo,
      driverId: d.id,
      vehicleId: meta.vehicleId ?? null,
      documentTypeId: type.id,
      fileKey: key,
      mimeType: mime,
      sizeBytes: file.data.length,
      expiryDate: meta.expiryDate ?? null,
    },
  });
  // A new document on an approved profile or vehicle needs another review.
  if (type.appliesTo === "DRIVER" && d.status === "APPROVED") {
    await prisma.driver.update({ where: { id: d.id }, data: { status: "PENDING" } });
    await audit({ actorType: "DRIVER", actorId: userId, action: "driver.reverify", entity: "driver", entityId: d.id, after: { document: type.code } });
  }
  if (meta.vehicleId) await prisma.vehicle.updateMany({ where: { id: meta.vehicleId, status: "APPROVED" }, data: { status: "PENDING" } });
  return { id: doc.id, status: doc.status, documentType: type.code };
}

export async function submitForReview(userId: string) {
  const d = await loadByUser(userId);
  if (!["DRAFT", "REJECTED"].includes(d.status)) throw conflict("ALREADY_SUBMITTED", "Your profile is already submitted");
  const problems: string[] = [];
  if (!d.user.name) problems.push("your name");
  if (!d.homeCityId) problems.push("your home city");
  if (!d.bankAccountNoEnc && !d.upiId) problems.push("bank account or UPI ID");
  if (d.vehicles.length === 0) problems.push("at least one vehicle");
  const { missing } = await documentChecklist(d);
  for (const m of missing) problems.push(m.label);
  if (problems.length) throw badRequest("ONBOARDING_INCOMPLETE", `Still needed: ${problems.join(", ")}`, { missing: problems });

  await prisma.driver.update({ where: { id: d.id }, data: { status: "PENDING", submittedAt: new Date(), rejectionReason: null } });
  await audit({ actorType: "DRIVER", actorId: userId, action: "driver.submitted", entity: "driver", entityId: d.id });
  return getMyDriverProfile(userId);
}

// ---- Admin side ----

export async function adminListDrivers(opts: { status?: Driver["status"]; q?: string; cityIds: string[] | null; page: number; limit: number }) {
  const where: Prisma.DriverWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.cityIds ? { homeCityId: { in: opts.cityIds } } : {}),
    ...(opts.q
      ? {
          OR: [
            { user: { name: { contains: opts.q, mode: "insensitive" } } },
            { user: { phone: { contains: opts.q } } },
            { vehicles: { some: { registrationNo: { contains: opts.q.toUpperCase().replace(/\s/g, "") } } } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.driver.count({ where }),
    prisma.driver.findMany({
      where,
      include: { user: true, homeCity: true, vehicles: { include: { vehicleType: true } } },
      orderBy: [{ submittedAt: "asc" }, { createdAt: "desc" }],
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
  ]);
  return {
    total,
    page: opts.page,
    items: rows.map((d) => ({
      id: d.id,
      name: d.user.name,
      phone: d.user.phone,
      status: d.status,
      homeCity: d.homeCity?.name ?? null,
      vehicles: d.vehicles.map((v) => `${v.vehicleType.name} · ${v.registrationNo}`),
      submittedAt: d.submittedAt,
    })),
  };
}

export async function adminGetDriver(driverId: string, cityIds: string[] | null) {
  const d = await prisma.driver.findUnique({ where: { id: driverId }, include: driverInclude });
  if (!d || (cityIds && (!d.homeCityId || !cityIds.includes(d.homeCityId)))) throw notFound("Driver");
  const checklist = await documentChecklist(d);
  return {
    ...view(d),
    documents: currentDocuments(d).map((doc) => ({
      id: doc.id,
      type: doc.documentType.label,
      code: doc.documentType.code,
      vehicleId: doc.vehicleId,
      mimeType: doc.mimeType,
      status: doc.status,
      expiryDate: doc.expiryDate,
      uploadedAt: doc.createdAt,
      rejectReason: doc.rejectReason,
    })),
    checklist,
  };
}

/** Approves a pending driver together with their pending documents and vehicles. */
export async function adminApproveDriver(driverId: string, adminId: string, ip?: string) {
  const d = await prisma.driver.findUnique({ where: { id: driverId }, include: driverInclude });
  if (!d) throw notFound("Driver");
  if (d.status !== "PENDING") throw conflict("NOT_PENDING", "This driver isn't waiting for approval");
  const { missing } = await documentChecklist(d);
  if (missing.length) throw conflict("DOCUMENTS_MISSING", `Missing or rejected: ${missing.map((m) => m.label).join(", ")}`);
  const now = new Date();
  const currentIds = currentDocuments(d).map((x) => x.id);
  await prisma.$transaction([
    prisma.driver.update({ where: { id: d.id }, data: { status: "APPROVED", approvedAt: now, approvedById: adminId, rejectionReason: null } }),
    prisma.document.updateMany({ where: { id: { in: currentIds }, status: "PENDING" }, data: { status: "APPROVED", reviewedAt: now, reviewedById: adminId } }),
    prisma.vehicle.updateMany({ where: { driverId: d.id, status: "PENDING" }, data: { status: "APPROVED" } }),
  ]);
  await audit({ actorType: "ADMIN", actorId: adminId, action: "driver.approved", entity: "driver", entityId: d.id, before: { status: d.status }, after: { status: "APPROVED" }, ip });
  return adminGetDriver(d.id, null);
}

export async function adminSetDriverStatus(
  driverId: string,
  adminId: string,
  action: "reject" | "suspend" | "reinstate",
  reason: string | undefined,
  ip?: string,
) {
  const d = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!d) throw notFound("Driver");
  const rules = {
    reject: { from: ["PENDING"], to: "REJECTED" },
    suspend: { from: ["APPROVED", "PENDING"], to: "SUSPENDED" },
    reinstate: { from: ["SUSPENDED"], to: "APPROVED" },
  } as const;
  const rule = rules[action];
  if (!(rule.from as readonly string[]).includes(d.status)) throw conflict("INVALID_STATUS", `Can't ${action} a driver who is ${d.status.toLowerCase()}`);
  if (action !== "reinstate" && !reason) throw badRequest("REASON_REQUIRED", "Give a reason");
  await prisma.driver.update({ where: { id: d.id }, data: { status: rule.to, rejectionReason: action === "reinstate" ? null : reason } });
  await audit({ actorType: "ADMIN", actorId: adminId, action: `driver.${action}`, entity: "driver", entityId: d.id, before: { status: d.status }, after: { status: rule.to, reason }, ip });
  return adminGetDriver(d.id, null);
}

export async function adminReviewDocument(docId: string, adminId: string, decision: "APPROVED" | "REJECTED", reason?: string, ip?: string) {
  if (decision === "REJECTED" && !reason) throw badRequest("REASON_REQUIRED", "Tell the driver what's wrong with the document");
  const doc = await prisma.document.update({
    where: { id: docId },
    data: { status: decision, rejectReason: decision === "REJECTED" ? reason : null, reviewedAt: new Date(), reviewedById: adminId },
  }).catch(() => null);
  if (!doc) throw notFound("Document");
  await audit({ actorType: "ADMIN", actorId: adminId, action: `document.${decision.toLowerCase()}`, entity: "document", entityId: docId, after: { reason }, ip });
  return { id: doc.id, status: doc.status };
}

export async function adminReviewVehicle(vehicleId: string, adminId: string, decision: "APPROVED" | "REJECTED", reason?: string, ip?: string) {
  if (decision === "REJECTED" && !reason) throw badRequest("REASON_REQUIRED", "Give a reason");
  const v = await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: decision, rejectionReason: decision === "REJECTED" ? reason : null } }).catch(() => null);
  if (!v) throw notFound("Vehicle");
  if (decision === "APPROVED") {
    await prisma.document.updateMany({ where: { vehicleId, status: "PENDING" }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: adminId } });
  }
  await audit({ actorType: "ADMIN", actorId: adminId, action: `vehicle.${decision.toLowerCase()}`, entity: "vehicle", entityId: vehicleId, after: { reason }, ip });
  return { id: v.id, status: v.status };
}

/** Short-lived link to view a document. Every view is audit-logged. */
export async function adminDocumentUrl(docId: string, adminId: string, ip?: string) {
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) throw notFound("Document");
  await audit({ actorType: "ADMIN", actorId: adminId, action: "document.viewed", entity: "document", entityId: docId, ip });
  return { url: signedFileUrl(doc.fileKey, 300), expiresInSeconds: 300, mimeType: doc.mimeType };
}
