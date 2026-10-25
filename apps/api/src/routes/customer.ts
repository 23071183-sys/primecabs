import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { age, email, gender, personName, uuid } from "../domain/validators.js";
import { notFound, parse } from "../errors.js";
import { requireUser } from "../plugins/auth.js";
import {
  bookingInput,
  cancelBooking,
  cancelPreview,
  createBooking,
  getTicket,
  listCustomerBookings,
  quote,
  quoteInput,
} from "../services/bookings.js";
import { createPaymentOrder, fakeCheckout, verifyPayment } from "../services/payments.js";
import { searchInput, searchRides } from "../services/rides.js";

const idParam = z.object({ id: uuid });
const page = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });

export async function customerRoutes(r: FastifyInstance) {
  r.get("/me", async (req) => {
    const id = await requireUser(req, "customer");
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    return { id: u.id, phone: u.phone, name: u.name, email: u.email, age: u.age, gender: u.gender, profileComplete: !!(u.name && u.email && u.age && u.gender) };
  });

  r.put("/me", async (req) => {
    const id = await requireUser(req, "customer");
    const body = parse(z.object({ name: personName, email, age, gender }), req.body);
    const u = await prisma.user.update({ where: { id }, data: body });
    return { id: u.id, phone: u.phone, name: u.name, email: u.email, age: u.age, gender: u.gender, profileComplete: true };
  });

  r.get("/rides/search", async (req) => searchRides(parse(searchInput, req.query)));

  r.get("/rides/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const ride = await prisma.ride.findUnique({
      where: { id },
      include: {
        route: { include: { fromCity: { include: { pickupPoints: { where: { active: true } } } }, toCity: { include: { pickupPoints: { where: { active: true } } } } } },
        vehicle: { include: { vehicleType: true } },
        driver: { include: { user: { select: { name: true } } } },
      },
    });
    if (!ride || !["OPEN", "FULL"].includes(ride.status)) throw notFound("Ride");
    const city = (c: typeof ride.route.fromCity) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      homePickupAllowed: c.type === "SPOKE" && c.homePickupAllowed,
      homePickupFee: c.homePickupFee,
      pickupPoints: c.pickupPoints.map((p) => ({ id: p.id, name: p.name, kind: p.kind, extraFare: p.extraFare })),
    });
    return {
      id: ride.id,
      departureAt: ride.departureAt,
      arrivalAt: ride.arrivalAt,
      seatFare: ride.seatFare,
      availableSeats: ride.availableSeats,
      totalSeats: ride.totalSeats,
      status: ride.status,
      vehicleType: ride.vehicle.vehicleType.name,
      driverFirstName: ride.driver.user.name?.split(" ")[0] ?? "Driver",
      from: city(ride.route.fromCity),
      to: city(ride.route.toCity),
    };
  });

  r.post("/bookings/quote", async (req) => {
    await requireUser(req, "customer");
    return quote(parse(quoteInput, req.body));
  });

  r.post("/bookings", async (req, reply) => {
    const id = await requireUser(req, "customer");
    const booking = await createBooking(id, parse(bookingInput, req.body));
    return reply.status(201).send(booking);
  });

  r.get("/bookings", async (req) => {
    const id = await requireUser(req, "customer");
    const q = parse(page.extend({ tab: z.enum(["upcoming", "past", "cancelled"]).default("upcoming") }), req.query);
    return listCustomerBookings(id, q.tab, q.page, q.limit);
  });

  r.get("/bookings/:id", async (req) => {
    const customerId = await requireUser(req, "customer");
    return getTicket(parse(idParam, req.params).id, customerId);
  });

  r.post("/bookings/:id/pay", async (req) => {
    const customerId = await requireUser(req, "customer");
    return createPaymentOrder(parse(idParam, req.params).id, customerId);
  });

  r.get("/bookings/:id/cancel-preview", async (req) => {
    const customerId = await requireUser(req, "customer");
    return cancelPreview(parse(idParam, req.params).id, customerId);
  });

  r.post("/bookings/:id/cancel", async (req) => {
    const customerId = await requireUser(req, "customer");
    const body = parse(z.object({ reason: z.string().trim().max(300).default("Cancelled by customer") }), req.body ?? {});
    return cancelBooking(parse(idParam, req.params).id, { type: "CUSTOMER", id: customerId }, { reason: body.reason, ip: req.ip });
  });

  r.post("/payments/verify", async (req) => {
    const customerId = await requireUser(req, "customer");
    const body = parse(
      z.object({ bookingId: uuid, razorpayOrderId: z.string().min(1), razorpayPaymentId: z.string().min(1), razorpaySignature: z.string().min(1) }),
      req.body,
    );
    return verifyPayment(customerId, body);
  });

  /** Development only (PAYMENT_PROVIDER=fake): stands in for the Razorpay checkout sheet. */
  r.post("/payments/fake-checkout", async (req) => {
    const customerId = await requireUser(req, "customer");
    const body = parse(z.object({ bookingId: uuid, orderId: z.string().min(1) }), req.body);
    return fakeCheckout(body.bookingId, customerId, body.orderId);
  });
}
