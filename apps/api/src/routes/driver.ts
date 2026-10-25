import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "../adapters/storage.js";
import { uuid } from "../domain/validators.js";
import { prisma } from "../db.js";
import { priceBooking } from "../domain/fare.js";
import { getSettings } from "../services/settings.js";
import { badRequest, notFound, parse } from "../errors.js";
import { requireUser } from "../plugins/auth.js";
import {
  addVehicle,
  getMyDriverProfile,
  profileInput,
  submitForReview,
  updateMyDriverProfile,
  updateVehicle,
  uploadDocument,
  vehicleInput,
} from "../services/drivers.js";
import { cancelRide, createRide, driverEarnings, listDriverRides, rideInput, rideUpdate, updateRide } from "../services/rides.js";
import { boardPassenger, completeRide, dropPassenger, getDriverRide, markNoShow } from "../services/trips.js";

const idParam = z.object({ id: uuid });
const passengerParams = z.object({ id: uuid, pid: uuid });
const otpBody = z.object({ otp: z.string().regex(/^\d{4}$/, "Enter the 4-digit code") });

export async function driverRoutes(r: FastifyInstance) {
  await r.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1, fields: 5 } });

  r.get("/me", async (req) => getMyDriverProfile(await requireUser(req, "driver")));

  r.put("/me", async (req) => {
    const id = await requireUser(req, "driver");
    return updateMyDriverProfile(id, parse(profileInput, req.body));
  });

  r.post("/vehicles", async (req, reply) => {
    const id = await requireUser(req, "driver");
    return reply.status(201).send(await addVehicle(id, parse(vehicleInput, req.body)));
  });

  r.put("/vehicles/:id", async (req) => {
    const id = await requireUser(req, "driver");
    return updateVehicle(id, parse(idParam, req.params).id, parse(vehicleInput.partial(), req.body));
  });

  /** multipart/form-data: file, documentTypeId, vehicleId (vehicle documents), expiryDate (YYYY-MM-DD, when required). */
  r.post("/documents", async (req, reply) => {
    const id = await requireUser(req, "driver");
    const part = await req.file();
    if (!part) throw badRequest("FILE_REQUIRED", "Choose a file to upload");
    const data = await part.toBuffer().catch(() => {
      throw badRequest("FILE_TOO_LARGE", "Files must be 5 MB or smaller");
    });
    const field = (name: string) => {
      const f = part.fields[name];
      return f && !Array.isArray(f) && f.type === "field" ? String(f.value) : undefined;
    };
    const meta = parse(
      z.object({ documentTypeId: uuid, vehicleId: uuid.optional(), expiryDate: z.coerce.date().optional() }),
      { documentTypeId: field("documentTypeId"), vehicleId: field("vehicleId") || undefined, expiryDate: field("expiryDate") || undefined },
    );
    return reply.status(201).send(await uploadDocument(id, meta, { data, declaredMime: part.mimetype }));
  });

  r.post("/submit", async (req) => submitForReview(await requireUser(req, "driver")));

  r.get("/rides", async (req) => {
    const id = await requireUser(req, "driver");
    const { scope } = parse(z.object({ scope: z.enum(["upcoming", "past"]).default("upcoming") }), req.query);
    return listDriverRides(id, scope);
  });

  r.post("/rides", async (req, reply) => {
    const id = await requireUser(req, "driver");
    return reply.status(201).send(await createRide(id, parse(rideInput, req.body)));
  });

  r.get("/rides/:id", async (req) => getDriverRide(await requireUser(req, "driver"), parse(idParam, req.params).id));

  r.put("/rides/:id", async (req) => {
    const id = await requireUser(req, "driver");
    return updateRide(id, parse(idParam, req.params).id, parse(rideUpdate, req.body));
  });

  r.post("/rides/:id/cancel", async (req) => {
    const id = await requireUser(req, "driver");
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Give a reason").max(300) }), req.body);
    return cancelRide(parse(idParam, req.params).id, { type: "DRIVER", id }, reason, req.ip);
  });

  r.post("/rides/:id/passengers/:pid/start", async (req) => {
    const id = await requireUser(req, "driver");
    const p = parse(passengerParams, req.params);
    return boardPassenger(id, p.id, p.pid, parse(otpBody, req.body).otp);
  });

  r.post("/rides/:id/passengers/:pid/end", async (req) => {
    const id = await requireUser(req, "driver");
    const p = parse(passengerParams, req.params);
    return dropPassenger(id, p.id, p.pid, parse(otpBody, req.body).otp);
  });

  r.post("/rides/:id/passengers/:pid/no-show", async (req) => {
    const id = await requireUser(req, "driver");
    const p = parse(passengerParams, req.params);
    return markNoShow(id, p.id, p.pid);
  });

  r.post("/rides/:id/complete", async (req) => completeRide(await requireUser(req, "driver"), parse(idParam, req.params).id));

  r.get("/earnings", async (req) => driverEarnings(await requireUser(req, "driver")));

  /** Admin's reference seat fare for a route and one of the driver's vehicles, shown while publishing. */
  r.get("/reference-fare", async (req) => {
    const userId = await requireUser(req, "driver");
    const q = parse(z.object({ routeId: uuid, vehicleId: uuid, seatFare: z.coerce.number().int().positive().max(10_000_000).optional() }), req.query);
    const vehicle = await prisma.vehicle.findFirst({ where: { id: q.vehicleId, driver: { userId } }, include: { vehicleType: true } });
    if (!vehicle) throw notFound("Vehicle");
    const fare = await prisma.routeFare.findUnique({ where: { routeId_vehicleTypeId: { routeId: q.routeId, vehicleTypeId: vehicle.vehicleTypeId } } });
    // What the driver keeps from one seat at the proposed fare, using the same pricing code as bookings.
    const seatFare = q.seatFare ?? fare?.referenceSeatFare;
    const settings = await getSettings();
    const estimate = seatFare
      ? priceBooking({ seatFare, seats: 1, pickupExtra: 0, dropExtra: 0, plateType: vehicle.plateType, gst: settings.gst, commission: settings.commission })
      : null;
    return {
      referenceSeatFare: fare?.referenceSeatFare ?? null,
      passengerSeats: vehicle.vehicleType.passengerSeats,
      perSeat: estimate && { customerPays: estimate.total, gst: estimate.gstAmount, commission: estimate.commissionAmount, commissionPercent: estimate.commissionRateBp / 100, driverEarns: estimate.driverEarning },
    };
  });
}
