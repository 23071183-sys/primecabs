// Booking price: seats + pickup/drop extras, GST (included or added), commission and driver earning.
// Pure function; the server is the only place prices are calculated.
import { applyBp, toBp } from "./money.js";
import type { Settings } from "./settings.js";

export type PlateType = "YELLOW" | "WHITE";

export interface PriceInput {
  seatFare: number; // paise per seat
  seats: number;
  pickupExtra: number; // paise
  dropExtra: number; // paise
  plateType: PlateType;
  gst: Settings["gst"];
  commission: Settings["commission"];
}

export interface PriceBreakdown {
  seatFare: number;
  seats: number;
  seatsAmount: number;
  pickupExtra: number;
  dropExtra: number;
  total: number; // what the customer pays
  gstMode: "INCLUDED" | "ADDED";
  gstRateBp: number;
  gstAmount: number;
  netAmount: number; // total minus GST: the fare the commission is taken from
  commissionModel: "FLAT" | "BY_PLATE";
  commissionRateBp: number;
  commissionAmount: number;
  driverEarning: number;
}

export function commissionRateBp(commission: Settings["commission"], plateType: PlateType): number {
  if (commission.model === "FLAT") return toBp(commission.percent);
  return toBp(plateType === "YELLOW" ? commission.yellowPercent : commission.whitePercent);
}

/** GST contained in a GST-inclusive amount: amount × r / (1 + r). */
export function gstIncludedIn(amount: number, rateBp: number): number {
  return Math.round((amount * rateBp) / (10000 + rateBp));
}

export function priceBooking(input: PriceInput): PriceBreakdown {
  const { seatFare, seats, pickupExtra, dropExtra } = input;
  if (!Number.isInteger(seatFare) || seatFare <= 0) throw new RangeError("seatFare must be positive paise");
  if (!Number.isInteger(seats) || seats <= 0) throw new RangeError("seats must be a positive integer");
  if (pickupExtra < 0 || dropExtra < 0) throw new RangeError("extras cannot be negative");

  const seatsAmount = seatFare * seats;
  const fareAmount = seatsAmount + pickupExtra + dropExtra;
  const gstRateBp = toBp(input.gst.ratePercent);

  let total: number;
  let gstAmount: number;
  if (input.gst.mode === "INCLUDED") {
    total = fareAmount;
    gstAmount = gstIncludedIn(total, gstRateBp);
  } else {
    gstAmount = applyBp(fareAmount, gstRateBp);
    total = fareAmount + gstAmount;
  }
  const netAmount = total - gstAmount;

  const rateBp = commissionRateBp(input.commission, input.plateType);
  const commissionAmount = applyBp(netAmount, rateBp);

  return {
    seatFare,
    seats,
    seatsAmount,
    pickupExtra,
    dropExtra,
    total,
    gstMode: input.gst.mode,
    gstRateBp,
    gstAmount,
    netAmount,
    commissionModel: input.commission.model,
    commissionRateBp: rateBp,
    commissionAmount,
    driverEarning: netAmount - commissionAmount,
  };
}
