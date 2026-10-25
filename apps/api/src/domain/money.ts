// All money is integer paise. These helpers keep rounding in one place.

export const rupees = (r: number): number => Math.round(r * 100);

/** Percentage as basis points: 5% -> 500, 12.5% -> 1250. */
export const toBp = (percent: number): number => Math.round(percent * 100);

/** amount × bp / 10000, rounded half up to the nearest paisa. */
export const applyBp = (amountPaise: number, bp: number): number =>
  Math.round((amountPaise * bp) / 10000);

/** Round down to a whole rupee. */
export const floorToRupee = (paise: number): number => Math.floor(paise / 100) * 100;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** ₹1,100 or ₹52.38 (no trailing .00). */
export function formatInr(paise: number): string {
  const s = inr.format(paise / 100);
  return s.endsWith(".00") ? s.slice(0, -3) : s;
}
