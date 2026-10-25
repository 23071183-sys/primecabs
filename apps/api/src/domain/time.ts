// India Standard Time helpers. IST is UTC+05:30 all year (no daylight saving).
const IST_OFFSET_MS = 330 * 60_000;

/** UTC range [start, end) covering one IST calendar day, from "YYYY-MM-DD". */
export function istDayRange(date: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError("date must be YYYY-MM-DD");
  const midnightUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Date.UTC rolls 2026-02-30 over to March; reject such dates.
  if (new Date(midnightUtc).toISOString().slice(0, 10) !== date) throw new RangeError("Invalid date");
  const startUtc = midnightUtc - IST_OFFSET_MS;
  return { start: new Date(startUtc), end: new Date(startUtc + 86_400_000) };
}

/** IST calendar parts of a UTC instant. */
export function istParts(d: Date): { year: number; month: number; day: number } {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1, day: ist.getUTCDate() };
}

/** "YYMMDD" for the IST date of `d`. */
export function istYYMMDD(d: Date): string {
  const p = istParts(d);
  return `${String(p.year % 100).padStart(2, "0")}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
}

export const addMinutes = (d: Date, minutes: number): Date => new Date(d.getTime() + minutes * 60_000);
