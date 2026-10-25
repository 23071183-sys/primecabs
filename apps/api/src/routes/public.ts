import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { tierLabel } from "../domain/refund.js";
import { getSettings } from "../services/settings.js";

export async function publicRoutes(r: FastifyInstance) {
  r.get("/cities", async () => {
    const cities = await prisma.city.findMany({
      where: { active: true },
      include: { pickupPoints: { where: { active: true }, orderBy: { extraFare: "asc" } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    return cities.map((c) => ({
      id: c.id,
      name: c.name,
      state: c.state,
      type: c.type,
      hubCityId: c.hubCityId,
      homePickupAllowed: c.type === "SPOKE" && c.homePickupAllowed,
      homePickupFee: c.homePickupFee,
      homePickupRadiusKm: c.homePickupRadiusKm,
      pickupPoints: c.pickupPoints.map((p) => ({ id: p.id, name: p.name, kind: p.kind, extraFare: p.extraFare })),
    }));
  });

  r.get("/routes", async () => {
    const routes = await prisma.route.findMany({ where: { active: true, fromCity: { active: true }, toCity: { active: true } } });
    return routes.map((x) => ({ id: x.id, fromCityId: x.fromCityId, toCityId: x.toCityId, distanceKm: x.distanceKm, durationMinutes: x.durationMinutes }));
  });

  r.get("/vehicle-types", async () =>
    prisma.vehicleType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, code: true, name: true, passengerSeats: true } }),
  );

  r.get("/document-types", async () =>
    prisma.documentType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, label: true, appliesTo: true, required: true, requiredIfPlate: true, hasExpiry: true },
    }),
  );

  /** Settings the apps need to show (hold timer, refund policy, GST wording, support contact). */
  r.get("/config", async () => {
    const s = await getSettings();
    return {
      seatHoldMinutes: s.seatHoldMinutes,
      bookingHorizonDays: s.bookingHorizonDays,
      bookingCutoffMinutes: s.bookingCutoffMinutes,
      gst: s.gst,
      refundPolicy: s.refundTiers
        .slice()
        .sort((a, b) => b.minHoursBefore - a.minHoursBefore)
        .map((t, i) => ({ ...t, label: tierLabel(s.refundTiers, i) })),
      support: s.support,
    };
  });
}
