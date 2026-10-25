// Display helpers. Money from the API is integer paise; times are UTC, shown in IST.

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** ₹1,100 or ₹52.38 (no trailing .00). */
export function inrFromPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  const s = inr.format(paise / 100);
  return s.endsWith(".00") ? s.slice(0, -3) : s;
}

/** Rupees typed by an admin ("550", "52.5") to paise, or null if not a valid amount. */
export function paiseFromRupees(input: string): number | null {
  const v = input.trim().replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

export const rupeesFromPaise = (paise: number) => (paise / 100).toString();

const TZ = "Asia/Kolkata";
const dateTime = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const dateOnly = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeOnly = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

const toDate = (d: string | Date) => (typeof d === "string" ? new Date(d) : d);

/** "1 Nov, 7:30 am" */
export const fmtDateTime = (d: string | Date | null | undefined) => (d ? dateTime.format(toDate(d)) : "—");
/** "Sat, 1 Nov 2026" */
export const fmtDate = (d: string | Date | null | undefined) => (d ? dateOnly.format(toDate(d)) : "—");
/** "7:30 am" */
export const fmtTime = (d: string | Date | null | undefined) => (d ? timeOnly.format(toDate(d)) : "—");

/** "in 3 h", "in 25 min", "2 d ago" */
export function fromNow(d: string | Date, now: Date = new Date()): string {
  const ms = toDate(d).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  const label = min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
  if (min === 0) return "now";
  return ms >= 0 ? `in ${label}` : `${label} ago`;
}

/** "+91 98765 43210" */
export function fmtPhone(p: string | null | undefined): string {
  if (!p) return "—";
  const m = /^\+91(\d{5})(\d{5})$/.exec(p);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}

export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^\w/, (c) => c.toUpperCase());

export const initials = (name: string | null | undefined) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
