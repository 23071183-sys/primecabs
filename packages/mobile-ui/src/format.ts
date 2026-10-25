// Display helpers shared by the mobile apps. Money is integer paise; times are UTC shown in IST.

const IST_OFFSET_MS = 330 * 60_000;

export function inr(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  const [int, dec] = Math.abs(rupees).toFixed(2).split(".") as [string, string];
  // Indian grouping: last 3 digits, then pairs (1,00,000)
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = rest ? `${rest},${last3}` : last3;
  return `${rupees < 0 ? "-" : ""}₹${grouped}${whole ? "" : `.${dec}`}`;
}

/** Rupees typed by a user ("550", "52.5") to paise, or null if not a valid amount. */
export function paiseFromInput(input: string): number | null {
  const v = input.trim().replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

function istParts(d: Date) {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), wd: t.getUTCDay(), h: t.getUTCHours(), min: t.getUTCMinutes() };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toDate = (d: string | Date) => (typeof d === "string" ? new Date(d) : d);

/** "7:30 AM" */
export function time(d: string | Date): string {
  const p = istParts(toDate(d));
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${String(p.min).padStart(2, "0")} ${p.h < 12 ? "AM" : "PM"}`;
}

/** "Sat, 1 Nov" */
export function dayLabel(d: string | Date): string {
  const p = istParts(toDate(d));
  return `${DAYS[p.wd]}, ${p.d} ${MONTHS[p.m]}`;
}

/** "Today", "Tomorrow" or "Sat, 1 Nov" */
export function relativeDay(d: string | Date, now: Date = new Date()): string {
  const a = istParts(toDate(d));
  const b = istParts(now);
  const days = Math.round((Date.UTC(a.y, a.m, a.d) - Date.UTC(b.y, b.m, b.d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return dayLabel(d);
}

/** "Tomorrow, 7:30 AM" */
export const dateTime = (d: string | Date, now?: Date) => `${relativeDay(d, now)}, ${time(d)}`;

/** "2h 45m" */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** "+91 98765 43210" */
export function phone(p: string | null | undefined): string {
  if (!p) return "—";
  const m = /^\+91(\d{5})(\d{5})$/.exec(p);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}

/** Today's IST date as YYYY-MM-DD, plus `addDays`. */
export function istDateString(addDays = 0, now: Date = new Date()): string {
  const p = istParts(new Date(now.getTime() + addDays * 86_400_000));
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** ISO instant for an IST date ("2026-11-01") and time ("07:30"). */
export const istToIso = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

/** IST "YYYY-MM-DD" and "HH:MM" of an instant. */
export function isoToIst(iso: string): { date: string; time: string } {
  const p = istParts(new Date(iso));
  return {
    date: `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`,
    time: `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`,
  };
}

export const initials = (name: string | null | undefined) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
