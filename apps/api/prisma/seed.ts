// Seed data for development and the pilot. Safe to run many times (everything is upserted).
// Places and fares are placeholders until the client confirms routes (3.2 was left blank).
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultSettings, settingKeys } from "../src/domain/settings.js";

// Locally, settings come from apps/api/.env; on Render they are environment variables.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // no .env file: use the environment as it is
}
const prisma = new PrismaClient();
const rupees = (r: number) => r * 100;

async function settings() {
  for (const key of settingKeys) {
    // Only create missing keys, so re-seeding never overwrites what admin changed.
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: defaultSettings[key] as Prisma.InputJsonValue },
      update: {},
    });
  }
}

const vehicleTypes = [
  { code: "HATCHBACK", name: "Hatchback", passengerSeats: 4, sortOrder: 1 },
  { code: "SEDAN", name: "Sedan", passengerSeats: 4, sortOrder: 2 },
  { code: "SUV", name: "SUV", passengerSeats: 6, sortOrder: 3 },
  { code: "ERTIGA_7S", name: "Ertiga or similar 7-seater", passengerSeats: 6, sortOrder: 4 },
  { code: "TEMPO_TRAVELLER", name: "Tempo Traveller", passengerSeats: 12, sortOrder: 5 },
  { code: "URBANIA", name: "Force Urbania", passengerSeats: 13, sortOrder: 6 },
];

const documentTypes = [
  { code: "DRIVING_LICENCE", label: "Driving licence", appliesTo: "DRIVER", hasExpiry: true, sortOrder: 1 },
  { code: "AADHAAR", label: "Aadhaar card", appliesTo: "DRIVER", sortOrder: 2 },
  { code: "PAN", label: "PAN card", appliesTo: "DRIVER", sortOrder: 3 },
  { code: "SELFIE", label: "Selfie photo", appliesTo: "DRIVER", sortOrder: 4 },
  { code: "TR_LICENCE", label: "TR (transport) licence", appliesTo: "DRIVER", requiredIfPlate: "YELLOW", hasExpiry: true, sortOrder: 5 },
  { code: "RC", label: "Registration certificate (RC)", appliesTo: "VEHICLE", sortOrder: 10 },
  { code: "INSURANCE", label: "Insurance", appliesTo: "VEHICLE", hasExpiry: true, sortOrder: 11 },
  { code: "ROUTE_PERMIT", label: "Route permit", appliesTo: "VEHICLE", hasExpiry: true, sortOrder: 12 },
  { code: "CAR_PHOTOS", label: "Photos of the car", appliesTo: "VEHICLE", sortOrder: 13 },
] as const;

async function catalogue() {
  for (const t of vehicleTypes) await prisma.vehicleType.upsert({ where: { code: t.code }, create: t, update: {} });
  for (const d of documentTypes) await prisma.documentType.upsert({ where: { code: d.code }, create: d, update: {} });
}

async function places() {
  const city = (data: Prisma.CityUncheckedCreateInput) =>
    prisma.city.upsert({ where: { name_state: { name: data.name, state: data.state } }, create: data, update: {} });

  const nagpur = await city({ name: "Nagpur", state: "Maharashtra", type: "HUB" });
  const seoni = await city({ name: "Seoni", state: "Madhya Pradesh", type: "SPOKE", hubCityId: nagpur.id, homePickupAllowed: true, homePickupFee: 0, homePickupRadiusKm: 10 });
  const chhindwara = await city({ name: "Chhindwara", state: "Madhya Pradesh", type: "SPOKE", hubCityId: nagpur.id, homePickupAllowed: true, homePickupFee: 0, homePickupRadiusKm: 10 });

  const point = (cityId: string, name: string, kind: "RAILWAY" | "BUS_STAND" | "AIRPORT" | "OTHER", extraFare = 0) =>
    prisma.pickupPoint.upsert({ where: { cityId_name: { cityId, name } }, create: { cityId, name, kind, extraFare }, update: {} });

  await point(nagpur.id, "Nagpur Railway Station (east gate)", "RAILWAY");
  await point(nagpur.id, "Ganeshpeth Bus Stand", "BUS_STAND");
  await point(nagpur.id, "Dr. Babasaheb Ambedkar Airport", "AIRPORT", rupees(100));
  await point(seoni.id, "Seoni Bus Stand", "BUS_STAND");
  await point(chhindwara.id, "Chhindwara Bus Stand", "BUS_STAND");
  await point(chhindwara.id, "Chhindwara Railway Station", "RAILWAY");

  const routes = [
    { a: nagpur.id, b: seoni.id, km: 130, minutes: 165 },
    { a: nagpur.id, b: chhindwara.id, km: 125, minutes: 165 },
  ];
  const types = await prisma.vehicleType.findMany();
  const reference: Record<string, number> = { HATCHBACK: 450, SEDAN: 500, SUV: 550, ERTIGA_7S: 550, TEMPO_TRAVELLER: 400, URBANIA: 450 };

  for (const r of routes) {
    for (const [from, to] of [[r.a, r.b], [r.b, r.a]] as const) {
      const route = await prisma.route.upsert({
        where: { fromCityId_toCityId: { fromCityId: from, toCityId: to } },
        create: { fromCityId: from, toCityId: to, distanceKm: r.km, durationMinutes: r.minutes },
        update: {},
      });
      for (const t of types) {
        await prisma.routeFare.upsert({
          where: { routeId_vehicleTypeId: { routeId: route.id, vehicleTypeId: t.id } },
          create: { routeId: route.id, vehicleTypeId: t.id, referenceSeatFare: rupees(reference[t.code] ?? 500) },
          update: {},
        });
      }
    }
  }
  return { nagpur, seoni, chhindwara };
}

async function superAdmin() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set: skipping the super admin");
    return;
  }
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, name: "Super Admin", role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(password, 10) },
    update: {},
  });
}

// A tiny valid PNG used as a stand-in for demo documents.
const PLACEHOLDER_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201d6d9a3f10000000049454e44ae426082",
  "hex",
);

async function demo(c: Awaited<ReturnType<typeof places>>) {
  const password = process.env.ADMIN_PASSWORD!;
  const hash = await bcrypt.hash(password, 10);
  const staff = [
    { email: "location@primecabs.local", name: "Priya Location", role: "LOCATION_ADMIN" as const },
    { email: "support@primecabs.local", name: "Sunita Support", role: "SUPPORT" as const },
    { email: "accounts@primecabs.local", name: "Arun Accounts", role: "ACCOUNTANT" as const },
  ];
  for (const s of staff) {
    const a = await prisma.adminUser.upsert({ where: { email: s.email }, create: { ...s, passwordHash: hash }, update: {} });
    if (s.role === "LOCATION_ADMIN") {
      await prisma.adminCityScope.upsert({
        where: { adminUserId_cityId: { adminUserId: a.id, cityId: c.nagpur.id } },
        create: { adminUserId: a.id, cityId: c.nagpur.id },
        update: {},
      });
    }
  }

  await prisma.user.upsert({
    where: { phone: "+919000000003" },
    create: { phone: "+919000000003", role: "CUSTOMER", name: "Anita Sharma", email: "anita@example.com", age: 34, gender: "FEMALE" },
    update: {},
  });

  const storageDir = resolve(import.meta.dirname, "../storage/demo");
  await mkdir(storageDir, { recursive: true });
  await writeFile(resolve(storageDir, "placeholder.png"), PLACEHOLDER_PNG);
  // Same file for STORAGE_PROVIDER=database (hosted without a disk).
  await prisma.storedFile.upsert({
    where: { key: "demo/placeholder.png" },
    create: { key: "demo/placeholder.png", mimeType: "image/png", data: new Uint8Array(PLACEHOLDER_PNG) },
    update: {},
  });

  const ertiga = await prisma.vehicleType.findUniqueOrThrow({ where: { code: "ERTIGA_7S" } });
  const sedan = await prisma.vehicleType.findUniqueOrThrow({ where: { code: "SEDAN" } });
  const docTypes = await prisma.documentType.findMany();

  const makeDriver = async (opts: {
    phone: string;
    name: string;
    status: "APPROVED" | "PENDING";
    vehicle: { typeId: string; reg: string; make: string; model: string; colour: string; plate: "YELLOW" | "WHITE" };
  }) => {
    const user = await prisma.user.upsert({
      where: { phone: opts.phone },
      create: { phone: opts.phone, role: "DRIVER", name: opts.name, age: 38, gender: "MALE" },
      update: {},
    });
    const existing = await prisma.driver.findUnique({ where: { userId: user.id } });
    if (existing) return existing;
    const approved = opts.status === "APPROVED";
    const driver = await prisma.driver.create({
      data: {
        userId: user.id,
        status: opts.status,
        homeCityId: c.nagpur.id,
        upiId: `${opts.name.split(" ")[0]!.toLowerCase()}@upi`,
        submittedAt: new Date(),
        approvedAt: approved ? new Date() : null,
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        driverId: driver.id,
        vehicleTypeId: opts.vehicle.typeId,
        registrationNo: opts.vehicle.reg,
        make: opts.vehicle.make,
        model: opts.vehicle.model,
        year: 2022,
        colour: opts.vehicle.colour,
        plateType: opts.vehicle.plate,
        status: approved ? "APPROVED" : "PENDING",
      },
    });
    const expiry = new Date(Date.now() + 365 * 86_400_000);
    for (const t of docTypes) {
      if (t.requiredIfPlate && t.requiredIfPlate !== opts.vehicle.plate) continue;
      await prisma.document.create({
        data: {
          ownerType: t.appliesTo,
          driverId: driver.id,
          vehicleId: t.appliesTo === "VEHICLE" ? vehicle.id : null,
          documentTypeId: t.id,
          fileKey: "demo/placeholder.png",
          mimeType: "image/png",
          sizeBytes: PLACEHOLDER_PNG.length,
          expiryDate: t.hasExpiry ? expiry : null,
          status: approved ? "APPROVED" : "PENDING",
        },
      });
    }
    return driver;
  };

  const ramesh = await makeDriver({
    phone: "+919000000001",
    name: "Ramesh Kumar",
    status: "APPROVED",
    vehicle: { typeId: ertiga.id, reg: "MH31AB1234", make: "Maruti Suzuki", model: "Ertiga", colour: "White", plate: "YELLOW" },
  });
  await makeDriver({
    phone: "+919000000002",
    name: "Sunil Tiwari",
    status: "PENDING",
    vehicle: { typeId: sedan.id, reg: "MP28CD5678", make: "Maruti Suzuki", model: "Dzire", colour: "Silver", plate: "WHITE" },
  });

  // One open ride tomorrow 7:30 AM IST (Nagpur -> Seoni) and one waiting for fare approval.
  const hasRides = await prisma.ride.count({ where: { driverId: ramesh.id } });
  if (!hasRides) {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { driverId: ramesh.id } });
    const out = await prisma.route.findFirstOrThrow({ where: { fromCityId: c.nagpur.id, toCityId: c.seoni.id } });
    const back = await prisma.route.findFirstOrThrow({ where: { fromCityId: c.seoni.id, toCityId: c.nagpur.id } });
    const tomorrowIst = new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10);
    const at = (hhmm: string) => new Date(`${tomorrowIst}T${hhmm}:00+05:30`);
    const departureOut = at("07:30");
    const departureBack = at("17:00");
    await prisma.ride.create({
      data: {
        driverId: ramesh.id,
        vehicleId: vehicle.id,
        routeId: out.id,
        departureAt: departureOut,
        arrivalAt: new Date(departureOut.getTime() + out.durationMinutes * 60_000),
        totalSeats: 6,
        availableSeats: 6,
        proposedSeatFare: rupees(550),
        seatFare: rupees(550),
        status: "OPEN",
        fareApprovals: { create: { proposedFare: rupees(550), decision: "APPROVED", approvedFare: rupees(550), decidedAt: new Date() } },
      },
    });
    await prisma.ride.create({
      data: {
        driverId: ramesh.id,
        vehicleId: vehicle.id,
        routeId: back.id,
        departureAt: departureBack,
        arrivalAt: new Date(departureBack.getTime() + back.durationMinutes * 60_000),
        totalSeats: 6,
        availableSeats: 6,
        proposedSeatFare: rupees(550),
        status: "PENDING_APPROVAL",
        fareApprovals: { create: { proposedFare: rupees(550) } },
      },
    });
  }
}

async function main() {
  await settings();
  await catalogue();
  const c = await places();
  await superAdmin();
  if (process.env.SEED_DEMO === "true") {
    if (process.env.NODE_ENV === "production") throw new Error("Refusing to create demo data in production");
    await demo(c);
  }
  const counts = {
    cities: await prisma.city.count(),
    routes: await prisma.route.count(),
    vehicleTypes: await prisma.vehicleType.count(),
    documentTypes: await prisma.documentType.count(),
    admins: await prisma.adminUser.count(),
    drivers: await prisma.driver.count(),
    rides: await prisma.ride.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
