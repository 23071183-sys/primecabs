// Shapes returned by the PrimeCabs API for the driver app (see docs/api.md). Money is paise.

export type DriverStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type RideStatus = "PENDING_APPROVAL" | "REJECTED" | "OPEN" | "FULL" | "STARTED" | "COMPLETED" | "CANCELLED";
export type Gender = "MALE" | "FEMALE" | "OTHER";
export type PlateType = "YELLOW" | "WHITE";

export interface Vehicle {
  id: string;
  type: { id: string; name: string; passengerSeats: number };
  registrationNo: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  plateType: PlateType;
  status: ReviewStatus;
  rejectionReason: string | null;
}

export interface ChecklistItem {
  documentTypeId: string;
  code: string;
  label: string;
  vehicleId: string | null;
  required: boolean;
  hasExpiry: boolean;
  documentId: string | null;
  status: ReviewStatus | null;
  rejectReason: string | null;
}

export interface DriverMe {
  id: string;
  status: DriverStatus;
  rejectionReason: string | null;
  name: string | null;
  phone: string;
  email: string | null;
  age: number | null;
  gender: Gender | null;
  homeCity: { id: string; name: string } | null;
  bank: { accountName: string | null; accountNoLast4: string | null; ifsc: string | null; upiId: string | null };
  vehicles: Vehicle[];
  submittedAt: string | null;
  approvedAt: string | null;
  documents: { items: ChecklistItem[]; missing: ChecklistItem[] };
}

export interface City {
  id: string;
  name: string;
  state: string;
  type: "HUB" | "SPOKE";
  pickupPoints: { id: string; name: string; kind: string; extraFare: number }[];
}

export interface RouteRef {
  id: string;
  fromCityId: string;
  toCityId: string;
  distanceKm: number;
  durationMinutes: number;
}

export interface VehicleType {
  id: string;
  code: string;
  name: string;
  passengerSeats: number;
}

export interface DriverRide {
  id: string;
  routeId: string;
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  status: RideStatus;
  cancelReason: string | null;
  vehicle: { id: string; type: string; registrationNo: string };
  totalSeats: number;
  availableSeats: number;
  seatsSold: number;
  proposedSeatFare: number;
  seatFare: number | null;
  fareDecision: { decision: "PENDING" | "APPROVED" | "CHANGED" | "REJECTED"; reason: string | null } | null;
  earnings: number;
}

export type PassengerStatus = "BOOKED" | "ONBOARD" | "DROPPED" | "NO_SHOW";

export interface RideDetail {
  id: string;
  routeId: string;
  vehicleId: string;
  notes: string | null;
  cancelReason: string | null;
  fareDecision: { decision: "PENDING" | "APPROVED" | "CHANGED" | "REJECTED"; reason: string | null; approvedFare: number | null } | null;
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  status: RideStatus;
  seatFare: number | null;
  proposedSeatFare: number;
  totalSeats: number;
  availableSeats: number;
  vehicle: { type: string; registrationNo: string };
  earnings: number;
  passengers: {
    id: string;
    bookingCode: string;
    name: string;
    phone: string;
    age: number;
    gender: Gender;
    status: PassengerStatus;
    pickup: string | null;
    drop: string | null;
  }[];
}

export interface Earnings {
  last7Days: number;
  last30Days: number;
  upcoming: number;
  seatsSoldLast7Days: number;
}

export interface ReferenceFare {
  referenceSeatFare: number | null;
  passengerSeats: number;
  perSeat: { customerPays: number; gst: number; commission: number; commissionPercent: number; driverEarns: number } | null;
}

export interface PublicConfig {
  bookingHorizonDays: number;
  bookingCutoffMinutes: number;
  support: { phone: string; email: string };
}
