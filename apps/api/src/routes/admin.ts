import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { settingKeys } from "../domain/settings.js";
import { email, personName, uuid } from "../domain/validators.js";
import { badRequest, conflict, forbidden, notFound, parse } from "../errors.js";
import { can, permissionsFor, requireAdmin, type AdminContext } from "../plugins/auth.js";
import { audit } from "../services/audit.js";
import { hashPassword } from "../services/auth.js";
import { cancelBooking } from "../services/bookings.js";
import {
  adminApproveDriver,
  adminDocumentUrl,
  adminGetDriver,
  adminListDrivers,
  adminReviewDocument,
  adminReviewVehicle,
  adminSetDriverStatus,
} from "../services/drivers.js";
import { retryRefund } from "../services/refunds.js";
import { approveRide, cancelRide, rejectRide } from "../services/rides.js";
import { getSettings, updateSetting } from "../services/settings.js";

const idParam = z.object({ id: uuid });
const reasonBody = z.object({ reason: z.string().trim().min(3, "Give a reason").max(500) });
const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
const paise = z.number().int().min(0).max(10_000_000);
const id = (req: FastifyRequest) => parse(idParam, req.params).id;

/** Rides a location admin may see: routes that start or end in one of their cities. */
const rideScope = (a: AdminContext): Prisma.RideWhereInput =>
  a.cityIds ? { route: { OR: [{ fromCityId: { in: a.cityIds } }, { toCityId: { in: a.cityIds } }] } } : {};

async function assertRideInScope(a: AdminContext, rideId: string) {
  const ride = await prisma.ride.findFirst({ where: { id: rideId, ...rideScope(a) }, select: { id: true } });
  if (!ride) throw notFound("Ride");
}

async function assertDriverInScope(a: AdminContext, driverId: string) {
  if (!a.cityIds) return;
  const d = await prisma.driver.findUnique({ where: { id: driverId }, select: { homeCityId: true } });
  if (!d || !d.homeCityId || !a.cityIds.includes(d.homeCityId)) throw notFound("Driver");
}

export async function adminRoutes(r: FastifyInstance) {
  r.get("/me", async (req) => {
    const a = await requireAdmin(req);
    const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: a.id } });
    const cities = a.cityIds ? await prisma.city.findMany({ where: { id: { in: a.cityIds } }, select: { id: true, name: true } }) : null;
    return { id: a.id, email: admin.email, name: admin.name, role: a.role, cityIds: a.cityIds, cities, permissions: permissionsFor(a.role) };
  });

  r.get("/overview", async (req) => {
    const a = await requireAdmin(req);
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const in6h = new Date(now.getTime() + 6 * 3_600_000);
    const paid = { status: { in: ["CONFIRMED", "COMPLETED"] as ("CONFIRMED" | "COMPLETED")[] }, confirmedAt: { gte: dayAgo }, ride: rideScope(a) };
    const [driversPending, ridesPending, bookingsLast24h, revenue, refundsFailed, upcoming, emptySoon] = await Promise.all([
      prisma.driver.count({ where: { status: "PENDING", ...(a.cityIds ? { homeCityId: { in: a.cityIds } } : {}) } }),
      prisma.ride.count({ where: { status: "PENDING_APPROVAL", ...rideScope(a) } }),
      prisma.booking.count({ where: paid }),
      prisma.booking.aggregate({ where: paid, _sum: { total: true, commissionAmount: true } }),
      prisma.refund.count({ where: { status: "FAILED" } }),
      prisma.ride.findMany({
        where: { status: { in: ["OPEN", "FULL", "STARTED"] }, departureAt: { gte: new Date(now.getTime() - 3 * 3_600_000), lte: new Date(now.getTime() + 48 * 3_600_000) }, ...rideScope(a) },
        include: { route: { include: { fromCity: true, toCity: true } }, driver: { include: { user: { select: { name: true } } } }, vehicle: { include: { vehicleType: true } } },
        orderBy: { departureAt: "asc" },
        take: 8,
      }),
      prisma.ride.count({ where: { status: "OPEN", departureAt: { gte: now, lte: in6h }, bookings: { none: { status: "CONFIRMED" } }, ...rideScope(a) } }),
    ]);
    return {
      driversPending,
      ridesPending,
      bookingsLast24h,
      revenueLast24h: revenue._sum.total ?? 0,
      commissionLast24h: revenue._sum.commissionAmount ?? 0,
      refundsFailed,
      emptyRidesNext6h: emptySoon,
      upcomingRides: upcoming.map((x) => ({
        id: x.id,
        from: x.route.fromCity.name,
        to: x.route.toCity.name,
        departureAt: x.departureAt,
        status: x.status,
        driver: x.driver.user.name,
        vehicleType: x.vehicle.vehicleType.name,
        seatsSold: x.totalSeats - x.availableSeats,
        totalSeats: x.totalSeats,
      })),
    };
  });

  // ---- Drivers and documents ----

  r.get("/drivers", async (req) => {
    const a = await requireAdmin(req, "drivers.read");
    const q = parse(paging.extend({ status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(), q: z.string().trim().max(60).optional() }), req.query);
    return adminListDrivers({ ...q, cityIds: a.cityIds });
  });

  r.get("/drivers/:id", async (req) => {
    const a = await requireAdmin(req, "drivers.read");
    return adminGetDriver(id(req), a.cityIds);
  });

  r.post("/drivers/:id/approve", async (req) => {
    const a = await requireAdmin(req, "drivers.review");
    await assertDriverInScope(a, id(req));
    return adminApproveDriver(id(req), a.id, req.ip);
  });

  for (const action of ["reject", "suspend", "reinstate"] as const) {
    r.post(`/drivers/:id/${action}`, async (req) => {
      const a = await requireAdmin(req, "drivers.review");
      await assertDriverInScope(a, id(req));
      const reason = action === "reinstate" ? undefined : parse(reasonBody, req.body).reason;
      return adminSetDriverStatus(id(req), a.id, action, reason, req.ip);
    });
  }

  r.get("/documents/:id/url", async (req) => {
    const a = await requireAdmin(req, "drivers.read");
    const doc = await prisma.document.findUnique({ where: { id: id(req) }, select: { driverId: true } });
    if (!doc) throw notFound("Document");
    await assertDriverInScope(a, doc.driverId);
    return adminDocumentUrl(id(req), a.id, req.ip);
  });

  for (const [path, decision] of [["approve", "APPROVED"], ["reject", "REJECTED"]] as const) {
    r.post(`/documents/:id/${path}`, async (req) => {
      const a = await requireAdmin(req, "drivers.review");
      const doc = await prisma.document.findUnique({ where: { id: id(req) }, select: { driverId: true } });
      if (!doc) throw notFound("Document");
      await assertDriverInScope(a, doc.driverId);
      const reason = decision === "REJECTED" ? parse(reasonBody, req.body).reason : undefined;
      return adminReviewDocument(id(req), a.id, decision, reason, req.ip);
    });
    r.post(`/vehicles/:id/${path}`, async (req) => {
      const a = await requireAdmin(req, "drivers.review");
      const v = await prisma.vehicle.findUnique({ where: { id: id(req) }, select: { driverId: true } });
      if (!v) throw notFound("Vehicle");
      await assertDriverInScope(a, v.driverId);
      const reason = decision === "REJECTED" ? parse(reasonBody, req.body).reason : undefined;
      return adminReviewVehicle(id(req), a.id, decision, reason, req.ip);
    });
  }

  // ---- Rides and fare approvals ----

  r.get("/rides", async (req) => {
    const a = await requireAdmin(req, "rides.read");
    const q = parse(
      paging.extend({ status: z.enum(["PENDING_APPROVAL", "REJECTED", "OPEN", "FULL", "STARTED", "COMPLETED", "CANCELLED"]).optional(), driverId: uuid.optional() }),
      req.query,
    );
    const where: Prisma.RideWhereInput = { ...rideScope(a), ...(q.status ? { status: q.status } : {}), ...(q.driverId ? { driverId: q.driverId } : {}) };
    const [total, rows] = await Promise.all([
      prisma.ride.count({ where }),
      prisma.ride.findMany({
        where,
        include: {
          route: { include: { fromCity: true, toCity: true, fares: true } },
          vehicle: { include: { vehicleType: true } },
          driver: { include: { user: { select: { name: true, phone: true } } } },
          _count: { select: { bookings: { where: { status: { in: ["CONFIRMED", "COMPLETED"] } } } } },
        },
        // Upcoming work soonest first; history newest first.
        orderBy: { departureAt: !q.status || ["PENDING_APPROVAL", "OPEN", "FULL", "STARTED"].includes(q.status) ? "asc" : "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return {
      total,
      page: q.page,
      items: rows.map((x) => ({
        id: x.id,
        status: x.status,
        from: x.route.fromCity.name,
        to: x.route.toCity.name,
        departureAt: x.departureAt,
        arrivalAt: x.arrivalAt,
        driver: { id: x.driverId, name: x.driver.user.name, phone: x.driver.user.phone },
        vehicle: { type: x.vehicle.vehicleType.name, registrationNo: x.vehicle.registrationNo, plateType: x.vehicle.plateType },
        totalSeats: x.totalSeats,
        availableSeats: x.availableSeats,
        proposedSeatFare: x.proposedSeatFare,
        seatFare: x.seatFare,
        referenceSeatFare: x.route.fares.find((f) => f.vehicleTypeId === x.vehicle.vehicleTypeId)?.referenceSeatFare ?? null,
        confirmedBookings: x._count.bookings,
      })),
    };
  });

  r.get("/rides/:id", async (req) => {
    const a = await requireAdmin(req, "rides.read");
    await assertRideInScope(a, id(req));
    return prisma.ride.findUniqueOrThrow({
      where: { id: id(req) },
      include: {
        route: { include: { fromCity: true, toCity: true, fares: true } },
        vehicle: { include: { vehicleType: true } },
        driver: { include: { user: { select: { name: true, phone: true } } } },
        fareApprovals: { orderBy: { createdAt: "desc" } },
        bookings: { select: { id: true, code: true, status: true, seats: true, total: true }, orderBy: { createdAt: "asc" } },
      },
    });
  });

  r.post("/rides/:id/approve", async (req) => {
    const a = await requireAdmin(req, "rides.review");
    await assertRideInScope(a, id(req));
    const body = parse(z.object({ seatFare: paise.positive().optional() }), req.body ?? {});
    return approveRide(id(req), a.id, body.seatFare, req.ip);
  });

  r.post("/rides/:id/reject", async (req) => {
    const a = await requireAdmin(req, "rides.review");
    await assertRideInScope(a, id(req));
    return rejectRide(id(req), a.id, parse(reasonBody, req.body).reason, req.ip);
  });

  r.post("/rides/:id/cancel", async (req) => {
    const a = await requireAdmin(req, "rides.cancel");
    await assertRideInScope(a, id(req));
    return cancelRide(id(req), { type: "ADMIN", id: a.id }, parse(reasonBody, req.body).reason, req.ip);
  });

  // ---- Bookings, payments, refunds ----

  r.get("/bookings", async (req) => {
    const a = await requireAdmin(req, "bookings.read");
    const q = parse(
      paging.extend({ status: z.enum(["HELD", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(), q: z.string().trim().max(40).optional(), rideId: uuid.optional() }),
      req.query,
    );
    const where: Prisma.BookingWhereInput = {
      ride: rideScope(a),
      ...(q.status ? { status: q.status } : {}),
      ...(q.rideId ? { rideId: q.rideId } : {}),
      ...(q.q ? { OR: [{ code: { contains: q.q.toUpperCase() } }, { customer: { phone: { contains: q.q.replace(/\D/g, "") || q.q } } }, { customer: { name: { contains: q.q, mode: "insensitive" } } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        include: { customer: { select: { name: true, phone: true } }, ride: { include: { route: { include: { fromCity: true, toCity: true } } } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return {
      total,
      page: q.page,
      items: rows.map((b) => ({
        id: b.id,
        code: b.code,
        status: b.status,
        customer: b.customer,
        from: b.ride.route.fromCity.name,
        to: b.ride.route.toCity.name,
        departureAt: b.ride.departureAt,
        seats: b.seats,
        total: b.total,
        createdAt: b.createdAt,
      })),
    };
  });

  r.get("/bookings/:id", async (req) => {
    const a = await requireAdmin(req, "bookings.read");
    const b = await prisma.booking.findFirst({
      where: { id: id(req), ride: rideScope(a) },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        ride: { include: { route: { include: { fromCity: true, toCity: true } }, driver: { include: { user: { select: { name: true, phone: true } } } }, vehicle: true } },
        passengers: { select: { id: true, name: true, phone: true, age: true, gender: true, status: true, boardedAt: true, droppedAt: true } },
        payments: true,
        refunds: true,
      },
    });
    if (!b) throw notFound("Booking");
    const timeline = await prisma.auditLog.findMany({ where: { entity: "booking", entityId: b.id }, orderBy: { createdAt: "asc" } });
    const points = await prisma.pickupPoint.findMany({ where: { id: { in: [b.pickupPointId, b.dropPointId].filter((x): x is string => !!x) } } });
    const stop = (pointId: string | null, address: string | null) => (pointId ? (points.find((p) => p.id === pointId)?.name ?? "—") : address ? `Home: ${address}` : "—");
    return { ...b, pickup: stop(b.pickupPointId, b.pickupAddress), drop: stop(b.dropPointId, b.dropAddress), timeline };
  });

  r.post("/bookings/:id/cancel", async (req) => {
    const a = await requireAdmin(req, "bookings.cancel");
    const body = parse(reasonBody.extend({ refund: z.enum(["POLICY", "FULL"]).default("POLICY") }), req.body);
    if (body.refund === "FULL" && !can(a.role, "bookings.fullRefund")) throw forbidden("Your role can only refund by the cancellation policy");
    const b = await prisma.booking.findFirst({ where: { id: id(req), ride: rideScope(a) }, select: { id: true } });
    if (!b) throw notFound("Booking");
    return cancelBooking(b.id, { type: "ADMIN", id: a.id }, { reason: body.reason, refundMode: body.refund, ip: req.ip });
  });

  r.get("/payments", async (req) => {
    await requireAdmin(req, "payments.read");
    const q = parse(paging.extend({ status: z.enum(["CREATED", "PAID", "FAILED"]).optional() }), req.query);
    const where: Prisma.PaymentWhereInput = q.status ? { status: q.status } : {};
    const [total, items] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: { booking: { select: { code: true, status: true } } },
        omit: { raw: true },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return { total, page: q.page, items };
  });

  r.get("/refunds", async (req) => {
    await requireAdmin(req, "payments.read");
    const q = parse(paging.extend({ status: z.enum(["PENDING", "PROCESSED", "FAILED"]).optional() }), req.query);
    const where: Prisma.RefundWhereInput = q.status ? { status: q.status } : {};
    const [total, items] = await Promise.all([
      prisma.refund.count({ where }),
      prisma.refund.findMany({ where, include: { booking: { select: { code: true } } }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    ]);
    return { total, page: q.page, items };
  });

  r.post("/refunds/:id/retry", async (req) => {
    const a = await requireAdmin(req, "refunds.retry");
    return retryRefund(id(req), a.id, req.ip);
  });

  // ---- Configuration (cities, pickup points, routes, fares, vehicle and document types) ----

  const cityInput = z.object({
    name: z.string().trim().min(2).max(60),
    state: z.string().trim().min(2).max(60),
    type: z.enum(["HUB", "SPOKE"]),
    hubCityId: uuid.nullable().optional(),
    homePickupAllowed: z.boolean().default(false),
    homePickupFee: paise.default(0),
    homePickupRadiusKm: z.number().int().min(0).max(50).default(10),
    active: z.boolean().default(true),
  });

  r.get("/cities", async (req) => {
    await requireAdmin(req, "config.read");
    return prisma.city.findMany({ include: { pickupPoints: { orderBy: { name: "asc" } } }, orderBy: [{ type: "asc" }, { name: "asc" }] });
  });

  r.post("/cities", async (req, reply) => {
    const a = await requireAdmin(req, "config.write");
    const body = parse(cityInput, req.body);
    if (body.type === "HUB" && body.homePickupAllowed) throw badRequest("HUB_HOME_PICKUP", "Hubs use fixed pickup points only");
    const city = await prisma.city.create({ data: body }).catch(() => {
      throw conflict("CITY_EXISTS", "This city already exists");
    });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "city.created", entity: "city", entityId: city.id, after: city, ip: req.ip });
    return reply.status(201).send(city);
  });

  r.put("/cities/:id", async (req) => {
    const a = await requireAdmin(req, "config.write");
    const body = parse(cityInput.partial(), req.body);
    const before = await prisma.city.findUnique({ where: { id: id(req) } });
    if (!before) throw notFound("City");
    if ((body.type ?? before.type) === "HUB" && (body.homePickupAllowed ?? before.homePickupAllowed)) {
      throw badRequest("HUB_HOME_PICKUP", "Hubs use fixed pickup points only");
    }
    const city = await prisma.city.update({ where: { id: before.id }, data: body });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "city.updated", entity: "city", entityId: city.id, before, after: city, ip: req.ip });
    return city;
  });

  const pointInput = z.object({
    cityId: uuid,
    name: z.string().trim().min(2).max(80),
    kind: z.enum(["RAILWAY", "BUS_STAND", "AIRPORT", "OTHER"]),
    extraFare: paise.default(0),
    active: z.boolean().default(true),
  });

  r.post("/pickup-points", async (req, reply) => {
    const a = await requireAdmin(req, "config.write");
    const p = await prisma.pickupPoint.create({ data: parse(pointInput, req.body) }).catch(() => {
      throw conflict("POINT_EXISTS", "This pickup point already exists in that city");
    });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "pickup_point.created", entity: "pickup_point", entityId: p.id, after: p, ip: req.ip });
    return reply.status(201).send(p);
  });

  r.put("/pickup-points/:id", async (req) => {
    const a = await requireAdmin(req, "config.write");
    const before = await prisma.pickupPoint.findUnique({ where: { id: id(req) } });
    if (!before) throw notFound("Pickup point");
    const p = await prisma.pickupPoint.update({ where: { id: before.id }, data: parse(pointInput.omit({ cityId: true }).partial(), req.body) });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "pickup_point.updated", entity: "pickup_point", entityId: p.id, before, after: p, ip: req.ip });
    return p;
  });

  const routeInput = z.object({
    fromCityId: uuid,
    toCityId: uuid,
    distanceKm: z.number().int().min(1).max(2000),
    durationMinutes: z.number().int().min(10).max(48 * 60),
    active: z.boolean().default(true),
    createReverse: z.boolean().default(true),
  });

  r.get("/routes", async (req) => {
    await requireAdmin(req, "config.read");
    return prisma.route.findMany({ include: { fromCity: true, toCity: true, fares: { include: { vehicleType: true } } }, orderBy: { createdAt: "asc" } });
  });

  r.post("/routes", async (req, reply) => {
    const a = await requireAdmin(req, "config.write");
    const { createReverse, ...body } = parse(routeInput, req.body);
    if (body.fromCityId === body.toCityId) throw badRequest("SAME_CITY", "From and To must be different cities");
    const created = await prisma.$transaction(async (tx) => {
      const out = [await tx.route.create({ data: body })];
      if (createReverse) {
        const rev = { ...body, fromCityId: body.toCityId, toCityId: body.fromCityId };
        const exists = await tx.route.findUnique({ where: { fromCityId_toCityId: { fromCityId: rev.fromCityId, toCityId: rev.toCityId } } });
        if (!exists) out.push(await tx.route.create({ data: rev }));
      }
      return out;
    }).catch((e) => {
      throw e instanceof Error && "code" in e && e.code === "P2002" ? conflict("ROUTE_EXISTS", "This route already exists") : e;
    });
    for (const x of created) await audit({ actorType: "ADMIN", actorId: a.id, action: "route.created", entity: "route", entityId: x.id, after: x, ip: req.ip });
    return reply.status(201).send(created);
  });

  r.put("/routes/:id", async (req) => {
    const a = await requireAdmin(req, "config.write");
    const before = await prisma.route.findUnique({ where: { id: id(req) } });
    if (!before) throw notFound("Route");
    const route = await prisma.route.update({ where: { id: before.id }, data: parse(routeInput.pick({ distanceKm: true, durationMinutes: true, active: true }).partial(), req.body) });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "route.updated", entity: "route", entityId: route.id, before, after: route, ip: req.ip });
    return route;
  });

  r.put("/route-fares", async (req) => {
    const a = await requireAdmin(req, "config.write");
    const body = parse(z.object({ routeId: uuid, vehicleTypeId: uuid, referenceSeatFare: paise.positive() }), req.body);
    const fare = await prisma.routeFare.upsert({
      where: { routeId_vehicleTypeId: { routeId: body.routeId, vehicleTypeId: body.vehicleTypeId } },
      create: body,
      update: { referenceSeatFare: body.referenceSeatFare },
    });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "route_fare.set", entity: "route_fare", entityId: fare.id, after: fare, ip: req.ip });
    return fare;
  });

  const vehicleTypeInput = z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/),
    name: z.string().trim().min(2).max(40),
    passengerSeats: z.number().int().min(1).max(40),
    active: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  });

  r.get("/vehicle-types", async (req) => {
    await requireAdmin(req, "config.read");
    return prisma.vehicleType.findMany({ orderBy: { sortOrder: "asc" } });
  });

  r.post("/vehicle-types", async (req, reply) => {
    const a = await requireAdmin(req, "config.write");
    const t = await prisma.vehicleType.create({ data: parse(vehicleTypeInput, req.body) }).catch(() => {
      throw conflict("CODE_EXISTS", "A vehicle type with this code already exists");
    });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "vehicle_type.created", entity: "vehicle_type", entityId: t.id, after: t, ip: req.ip });
    return reply.status(201).send(t);
  });

  r.put("/vehicle-types/:id", async (req) => {
    const a = await requireAdmin(req, "config.write");
    const before = await prisma.vehicleType.findUnique({ where: { id: id(req) } });
    if (!before) throw notFound("Vehicle type");
    const t = await prisma.vehicleType.update({ where: { id: before.id }, data: parse(vehicleTypeInput.omit({ code: true }).partial(), req.body) });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "vehicle_type.updated", entity: "vehicle_type", entityId: t.id, before, after: t, ip: req.ip });
    return t;
  });

  const docTypeInput = z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/),
    label: z.string().trim().min(2).max(60),
    appliesTo: z.enum(["DRIVER", "VEHICLE"]),
    required: z.boolean().default(true),
    requiredIfPlate: z.enum(["YELLOW", "WHITE"]).nullable().default(null),
    hasExpiry: z.boolean().default(false),
    active: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  });

  r.get("/document-types", async (req) => {
    await requireAdmin(req, "config.read");
    return prisma.documentType.findMany({ orderBy: { sortOrder: "asc" } });
  });

  r.post("/document-types", async (req, reply) => {
    const a = await requireAdmin(req, "config.write");
    const t = await prisma.documentType.create({ data: parse(docTypeInput, req.body) }).catch(() => {
      throw conflict("CODE_EXISTS", "A document type with this code already exists");
    });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "document_type.created", entity: "document_type", entityId: t.id, after: t, ip: req.ip });
    return reply.status(201).send(t);
  });

  r.put("/document-types/:id", async (req) => {
    const a = await requireAdmin(req, "config.write");
    const before = await prisma.documentType.findUnique({ where: { id: id(req) } });
    if (!before) throw notFound("Document type");
    const t = await prisma.documentType.update({ where: { id: before.id }, data: parse(docTypeInput.omit({ code: true, appliesTo: true }).partial(), req.body) });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "document_type.updated", entity: "document_type", entityId: t.id, before, after: t, ip: req.ip });
    return t;
  });

  // ---- Settings ----

  r.get("/settings", async (req) => {
    await requireAdmin(req, "config.read");
    return getSettings();
  });

  r.put("/settings/:key", async (req) => {
    const a = await requireAdmin(req, "settings.write");
    const { key } = parse(z.object({ key: z.enum(settingKeys as [string, ...string[]]) }), req.params);
    const { value } = parse(z.object({ value: z.unknown() }), req.body);
    return { key, value: await updateSetting(key, value, a.id, req.ip) };
  });

  // ---- Admin users and audit log ----

  const adminInput = z.object({
    email,
    name: personName,
    role: z.enum(["SUPER_ADMIN", "LOCATION_ADMIN", "SUPPORT", "ACCOUNTANT"]),
    password: z.string().min(10, "Use at least 10 characters").max(200),
    cityIds: z.array(uuid).default([]),
  });

  const adminView = (x: Prisma.AdminUserGetPayload<{ include: { cityScopes: true } }>) => ({
    id: x.id,
    email: x.email,
    name: x.name,
    role: x.role,
    active: x.active,
    cityIds: x.cityScopes.map((s) => s.cityId),
    lockedUntil: x.lockedUntil,
    createdAt: x.createdAt,
  });

  r.get("/admin-users", async (req) => {
    await requireAdmin(req, "admins.manage");
    const rows = await prisma.adminUser.findMany({ include: { cityScopes: true }, orderBy: { createdAt: "asc" } });
    return rows.map(adminView);
  });

  r.post("/admin-users", async (req, reply) => {
    const a = await requireAdmin(req, "admins.manage");
    const body = parse(adminInput, req.body);
    if (body.role === "LOCATION_ADMIN" && body.cityIds.length === 0) throw badRequest("CITIES_REQUIRED", "Choose at least one city for a location admin");
    const created = await prisma.adminUser
      .create({
        data: {
          email: body.email,
          name: body.name,
          role: body.role,
          passwordHash: await hashPassword(body.password),
          cityScopes: { create: body.role === "LOCATION_ADMIN" ? body.cityIds.map((cityId) => ({ cityId })) : [] },
        },
        include: { cityScopes: true },
      })
      .catch(() => {
        throw conflict("EMAIL_EXISTS", "An admin with this email already exists");
      });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "admin_user.created", entity: "admin_user", entityId: created.id, after: adminView(created), ip: req.ip });
    return reply.status(201).send(adminView(created));
  });

  r.put("/admin-users/:id", async (req) => {
    const a = await requireAdmin(req, "admins.manage");
    const body = parse(adminInput.omit({ email: true }).partial().extend({ active: z.boolean().optional() }), req.body);
    const before = await prisma.adminUser.findUnique({ where: { id: id(req) }, include: { cityScopes: true } });
    if (!before) throw notFound("Admin user");
    if (before.id === a.id && (body.active === false || (body.role && body.role !== "SUPER_ADMIN"))) {
      throw conflict("SELF_LOCKOUT", "You can't remove your own super admin access");
    }
    const role = body.role ?? before.role;
    const updated = await prisma.$transaction(async (tx) => {
      if (body.cityIds || body.role) {
        await tx.adminCityScope.deleteMany({ where: { adminUserId: before.id } });
        const cities = role === "LOCATION_ADMIN" ? (body.cityIds ?? before.cityScopes.map((s) => s.cityId)) : [];
        if (role === "LOCATION_ADMIN" && cities.length === 0) throw badRequest("CITIES_REQUIRED", "Choose at least one city for a location admin");
        await tx.adminCityScope.createMany({ data: cities.map((cityId) => ({ adminUserId: before.id, cityId })) });
      }
      return tx.adminUser.update({
        where: { id: before.id },
        data: {
          name: body.name,
          role: body.role,
          active: body.active,
          ...(body.password ? { passwordHash: await hashPassword(body.password), failedLogins: 0, lockedUntil: null } : {}),
        },
        include: { cityScopes: true },
      });
    });
    await audit({ actorType: "ADMIN", actorId: a.id, action: "admin_user.updated", entity: "admin_user", entityId: updated.id, before: adminView(before), after: { ...adminView(updated), passwordChanged: !!body.password }, ip: req.ip });
    return adminView(updated);
  });

  r.get("/audit-logs", async (req) => {
    await requireAdmin(req, "audit.read");
    const q = parse(paging.extend({ entity: z.string().max(40).optional(), entityId: z.string().max(60).optional(), actorId: z.string().max(60).optional() }), req.query);
    const where: Prisma.AuditLogWhereInput = { entity: q.entity, entityId: q.entityId, actorId: q.actorId };
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit }),
    ]);
    return { total, page: q.page, items };
  });
}
