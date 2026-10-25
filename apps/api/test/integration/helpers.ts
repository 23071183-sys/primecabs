// Builders for integration tests. Each test starts from an empty database.
import { prisma } from "../../src/db.js";

let n = 0;
const uniq = () => ++n;

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function seedBasics() {
  const ertiga = await prisma.vehicleType.create({ data: { code: "ERTIGA_7S", name: "Ertiga", passengerSeats: 6 } });
  const sedan = await prisma.vehicleType.create({ data: { code: "SEDAN", name: "Sedan", passengerSeats: 4 } });
  const nagpur = await prisma.city.create({ data: { name: "Nagpur", state: "Maharashtra", type: "HUB" } });
  const seoni = await prisma.city.create({
    data: { name: "Seoni", state: "Madhya Pradesh", type: "SPOKE", hubCityId: nagpur.id, homePickupAllowed: true, homePickupFee: 5_000 },
  });
  const station = await prisma.pickupPoint.create({ data: { cityId: nagpur.id, name: "Railway Station", kind: "RAILWAY" } });
  const airport = await prisma.pickupPoint.create({ data: { cityId: nagpur.id, name: "Airport", kind: "AIRPORT", extraFare: 10_000 } });
  const busStand = await prisma.pickupPoint.create({ data: { cityId: seoni.id, name: "Seoni Bus Stand", kind: "BUS_STAND" } });
  const route = await prisma.route.create({ data: { fromCityId: nagpur.id, toCityId: seoni.id, distanceKm: 130, durationMinutes: 165 } });
  const back = await prisma.route.create({ data: { fromCityId: seoni.id, toCityId: nagpur.id, distanceKm: 130, durationMinutes: 165 } });
  return { ertiga, sedan, nagpur, seoni, station, airport, busStand, route, back };
}

export type Basics = Awaited<ReturnType<typeof seedBasics>>;

export async function makeDriver(b: Basics, opts: { plate?: "YELLOW" | "WHITE" } = {}) {
  const i = uniq();
  const user = await prisma.user.create({ data: { phone: `+9180000${String(i).padStart(5, "0")}`, role: "DRIVER", name: `Driver ${i}` } });
  const driver = await prisma.driver.create({ data: { userId: user.id, status: "APPROVED", homeCityId: b.nagpur.id, upiId: "d@upi" } });
  const vehicle = await prisma.vehicle.create({
    data: {
      driverId: driver.id,
      vehicleTypeId: b.ertiga.id,
      registrationNo: `MH31AB${String(1000 + i)}`,
      make: "Maruti",
      model: "Ertiga",
      year: 2022,
      colour: "White",
      plateType: opts.plate ?? "YELLOW",
      status: "APPROVED",
    },
  });
  return { user, driver, vehicle };
}

export async function makeRide(
  b: Basics,
  d: Awaited<ReturnType<typeof makeDriver>>,
  opts: { seats?: number; fare?: number; departureInMinutes?: number } = {},
) {
  const seats = opts.seats ?? 6;
  const departureAt = new Date(Date.now() + (opts.departureInMinutes ?? 48 * 60) * 60_000);
  return prisma.ride.create({
    data: {
      driverId: d.driver.id,
      vehicleId: d.vehicle.id,
      routeId: b.route.id,
      departureAt,
      arrivalAt: new Date(departureAt.getTime() + 165 * 60_000),
      totalSeats: seats,
      availableSeats: seats,
      proposedSeatFare: opts.fare ?? 55_000,
      seatFare: opts.fare ?? 55_000,
      status: "OPEN",
    },
  });
}

export async function makeCustomer() {
  const i = uniq();
  return prisma.user.create({
    data: { phone: `+9170000${String(i).padStart(5, "0")}`, role: "CUSTOMER", name: `Customer ${i}`, email: `c${i}@example.com`, age: 30, gender: "FEMALE" },
  });
}

export const passengers = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ name: `Traveller ${String.fromCharCode(65 + i)}`, phone: "+919812345678", age: 30 + i, gender: "MALE" as const }));

export function bookingBody(b: Basics, rideId: string, seats: number) {
  return { rideId, seats, pickup: { pointId: b.station.id }, drop: { pointId: b.busStand.id }, passengers: passengers(seats) };
}

/** Moves a ride's departure so refund tiers can be tested at exact hour offsets. */
export async function setDeparture(rideId: string, hoursFromNow: number) {
  const departureAt = new Date(Date.now() + hoursFromNow * 3_600_000);
  await prisma.ride.update({ where: { id: rideId }, data: { departureAt, arrivalAt: new Date(departureAt.getTime() + 165 * 60_000) } });
}
