// Shapes returned by the PrimeCabs API (see docs/api.md). Money is paise.

export type AdminRole = "SUPER_ADMIN" | "LOCATION_ADMIN" | "SUPPORT" | "ACCOUNTANT";
export type Permission =
  | "drivers.read"
  | "drivers.review"
  | "rides.read"
  | "rides.review"
  | "rides.cancel"
  | "bookings.read"
  | "bookings.cancel"
  | "bookings.fullRefund"
  | "payments.read"
  | "refunds.retry"
  | "config.read"
  | "config.write"
  | "settings.write"
  | "admins.manage"
  | "audit.read";

export interface AdminMe {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  cityIds: string[] | null;
  cities?: { id: string; name: string }[] | null;
  permissions: Permission[];
}

export interface Page<T> {
  total: number;
  page: number;
  items: T[];
}

export type DriverStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type RideStatus = "PENDING_APPROVAL" | "REJECTED" | "OPEN" | "FULL" | "STARTED" | "COMPLETED" | "CANCELLED";
export type BookingStatus = "HELD" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "EXPIRED";

export interface Overview {
  driversPending: number;
  ridesPending: number;
  bookingsLast24h: number;
  revenueLast24h: number;
  commissionLast24h: number;
  refundsFailed: number;
  emptyRidesNext6h: number;
  upcomingRides: {
    id: string;
    from: string;
    to: string;
    departureAt: string;
    status: RideStatus;
    driver: string | null;
    vehicleType: string;
    seatsSold: number;
    totalSeats: number;
  }[];
}

export interface DriverRow {
  id: string;
  name: string | null;
  phone: string;
  status: DriverStatus;
  homeCity: string | null;
  vehicles: string[];
  submittedAt: string | null;
}

export interface Vehicle {
  id: string;
  type: { id: string; name: string; passengerSeats: number };
  registrationNo: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  plateType: "YELLOW" | "WHITE";
  status: ReviewStatus;
  rejectionReason: string | null;
}

export interface DriverDetail {
  id: string;
  status: DriverStatus;
  rejectionReason: string | null;
  name: string | null;
  phone: string;
  email: string | null;
  age: number | null;
  gender: string | null;
  homeCity: { id: string; name: string } | null;
  bank: { accountName: string | null; accountNoLast4: string | null; ifsc: string | null; upiId: string | null };
  vehicles: Vehicle[];
  submittedAt: string | null;
  approvedAt: string | null;
  documents: {
    id: string;
    type: string;
    code: string;
    vehicleId: string | null;
    mimeType: string;
    status: ReviewStatus;
    expiryDate: string | null;
    uploadedAt: string;
    rejectReason: string | null;
  }[];
  checklist: {
    items: { documentTypeId: string; code: string; label: string; vehicleId: string | null; required: boolean; documentId: string | null; status: ReviewStatus | null }[];
    missing: { label: string; vehicleId: string | null }[];
  };
}

export interface RideRow {
  id: string;
  status: RideStatus;
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  driver: { id: string; name: string | null; phone: string };
  vehicle: { type: string; registrationNo: string; plateType: "YELLOW" | "WHITE" };
  totalSeats: number;
  availableSeats: number;
  proposedSeatFare: number;
  seatFare: number | null;
  referenceSeatFare: number | null;
  confirmedBookings: number;
}

export interface BookingRow {
  id: string;
  code: string;
  status: BookingStatus;
  customer: { name: string | null; phone: string };
  from: string;
  to: string;
  departureAt: string;
  seats: number;
  total: number;
  createdAt: string;
}

export interface BookingDetail {
  id: string;
  code: string;
  status: BookingStatus;
  seats: number;
  seatFare: number;
  seatsAmount: number;
  pickupExtra: number;
  dropExtra: number;
  pickupAddress: string | null;
  dropAddress: string | null;
  pickup: string;
  drop: string;
  total: number;
  gstMode: string;
  gstRateBp: number;
  gstAmount: number;
  netAmount: number;
  commissionRateBp: number;
  commissionAmount: number;
  driverEarning: number;
  holdExpiresAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  customer: { id: string; name: string | null; phone: string; email: string | null };
  ride: {
    id: string;
    departureAt: string;
    status: RideStatus;
    route: { fromCity: { name: string }; toCity: { name: string } };
    driver: { user: { name: string | null; phone: string } };
    vehicle: { registrationNo: string };
  };
  passengers: { id: string; name: string; phone: string; age: number; gender: string; status: string; boardedAt: string | null; droppedAt: string | null }[];
  payments: { id: string; provider: string; providerOrderId: string; providerPaymentId: string | null; amount: number; status: string; paidAt: string | null }[];
  refunds: Refund[];
  timeline: { id: string; action: string; actorType: string; createdAt: string; after: Record<string, unknown> | null }[];
}

export interface Refund {
  id: string;
  amount: number;
  percent: number;
  tierLabel: string;
  reason: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
  failureReason: string | null;
  attempts: number;
  initiatedBy: string;
  createdAt: string;
  booking?: { code: string };
}

export interface Payment {
  id: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amount: number;
  status: "CREATED" | "PAID" | "FAILED";
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
  booking: { code: string; status: BookingStatus };
}

export interface PickupPoint {
  id: string;
  cityId: string;
  name: string;
  kind: "RAILWAY" | "BUS_STAND" | "AIRPORT" | "OTHER";
  extraFare: number;
  active: boolean;
}

export interface City {
  id: string;
  name: string;
  state: string;
  type: "HUB" | "SPOKE";
  hubCityId: string | null;
  homePickupAllowed: boolean;
  homePickupFee: number;
  homePickupRadiusKm: number;
  active: boolean;
  pickupPoints: PickupPoint[];
}

export interface VehicleType {
  id: string;
  code: string;
  name: string;
  passengerSeats: number;
  active: boolean;
  sortOrder: number;
}

export interface Route {
  id: string;
  fromCityId: string;
  toCityId: string;
  distanceKm: number;
  durationMinutes: number;
  active: boolean;
  fromCity: City;
  toCity: City;
  fares: { id: string; vehicleTypeId: string; referenceSeatFare: number; vehicleType: VehicleType }[];
}

export interface DocumentType {
  id: string;
  code: string;
  label: string;
  appliesTo: "DRIVER" | "VEHICLE";
  required: boolean;
  requiredIfPlate: "YELLOW" | "WHITE" | null;
  hasExpiry: boolean;
  active: boolean;
  sortOrder: number;
}

export interface Settings {
  gst: { mode: "INCLUDED" | "ADDED"; ratePercent: number };
  commission: { model: "FLAT" | "BY_PLATE"; percent: number; yellowPercent: number; whitePercent: number };
  seatHoldMinutes: number;
  refundTiers: { minHoursBefore: number; percent: number }[];
  bookingHorizonDays: number;
  bookingCutoffMinutes: number;
  boardingOpensMinutesBefore: number;
  loginOtp: { length: number; ttlSeconds: number; maxAttempts: number; resendSeconds: number; maxPerHour: number };
  tripOtpMaxAttempts: number;
  support: { phone: string; email: string };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  cityIds: string[];
  lockedUntil: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}
