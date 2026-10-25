// Date and time choices for publishing a ride. All in IST.
import { istDateString, istToIso } from "@primecabs/mobile-ui";

export interface DayOption {
  date: string; // YYYY-MM-DD
  weekday: string;
  day: number;
  month: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The next `count` IST days starting today. */
export function nextDays(count: number, now: Date = new Date()): DayOption[] {
  return Array.from({ length: count }, (_, i) => {
    const date = istDateString(i, now);
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { date, weekday: i === 0 ? "Today" : i === 1 ? "Tmrw" : WEEKDAYS[wd]!, day: d, month: MONTHS[m - 1]! };
  });
}

export const HOURS = Array.from({ length: 20 }, (_, i) => i + 4); // 4 AM to 11 PM
export const MINUTES = ["00", "15", "30", "45"] as const;

export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

/** Departure as an ISO instant, or a reason it can't be used. */
export function departureFrom(date: string, hour: number | null, minute: string | null, now: Date, cutoffMinutes: number): { iso: string } | { error: string } {
  if (hour === null || minute === null) return { error: "Choose a departure time" };
  const iso = istToIso(date, `${String(hour).padStart(2, "0")}:${minute}`);
  if (new Date(iso).getTime() - now.getTime() < cutoffMinutes * 60_000) {
    return { error: `Choose a time at least ${cutoffMinutes} minutes from now` };
  }
  return { iso };
}

/** "25/10/2027" -> "2027-10-25", or null if it isn't a real date in the future. */
export function parseExpiry(input: string, now: Date = new Date()): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() < now.getTime()) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
