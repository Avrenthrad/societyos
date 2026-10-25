import { addDays, daysBetween, startOfDay, startOfWeek } from "./dates.js";

/**
 * A small RFC 5545 RRULE reader and next-date finder. Covers the rules quick
 * add can produce: FREQ (DAILY/WEEKLY/MONTHLY/YEARLY), INTERVAL, BYDAY (with
 * ordinals like 2WE or -1FR) and BYMONTHDAY. Dates are walked in local wall
 * time, so a 9:00 repeat stays at 9:00 through daylight-saving changes.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Rule {
  freq: Freq;
  interval: number;
  byDay?: { wd: Weekday; nth?: number }[];
  byMonthDay?: number[];
}

export function parseRRule(rrule: string): Rule {
  const parts = Object.fromEntries(
    rrule
      .replace(/^RRULE:/i, "")
      .split(";")
      .filter(Boolean)
      .map((p) => p.split("=") as [string, string]),
  );
  const freq = (parts.FREQ ?? "DAILY").toUpperCase() as Freq;
  const rule: Rule = { freq, interval: Math.max(1, Number(parts.INTERVAL ?? 1)) };
  if (parts.BYDAY) {
    rule.byDay = parts.BYDAY.split(",").map((s: string) => {
      const m = /^([+-]?\d+)?([A-Z]{2})$/i.exec(s.trim());
      if (!m) throw new Error(`Bad BYDAY: ${s}`);
      return { wd: m[2]!.toUpperCase() as Weekday, nth: m[1] ? Number(m[1]) : undefined };
    });
  }
  if (parts.BYMONTHDAY) rule.byMonthDay = parts.BYMONTHDAY.split(",").map(Number);
  return rule;
}

export function formatRRule(rule: Rule): string {
  const out = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) out.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay?.length) out.push(`BYDAY=${rule.byDay.map((d) => `${d.nth ?? ""}${d.wd}`).join(",")}`);
  if (rule.byMonthDay?.length) out.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  return out.join(";");
}

function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function nthWeekdayMatches(day: Date, nth: number) {
  const date = day.getDate();
  if (nth > 0) return Math.ceil(date / 7) === nth;
  const daysInMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  return Math.ceil((daysInMonth - date + 1) / 7) === -nth;
}

/** Does `day` hold an occurrence of `rule` for a series that started on `start`? */
export function occursOn(rule: Rule, start: Date, day: Date): boolean {
  if (daysBetween(start, day) < 0) return false;
  const wd = WEEKDAYS[day.getDay()]!;
  switch (rule.freq) {
    case "DAILY":
      return daysBetween(start, day) % rule.interval === 0;
    case "WEEKLY": {
      const weeks = daysBetween(startOfWeek(start), startOfWeek(day)) / 7;
      if (weeks % rule.interval !== 0) return false;
      return rule.byDay ? rule.byDay.some((d) => d.wd === wd) : day.getDay() === start.getDay();
    }
    case "MONTHLY": {
      if (monthsBetween(start, day) % rule.interval !== 0) return false;
      if (rule.byMonthDay) return rule.byMonthDay.includes(day.getDate());
      if (rule.byDay) return rule.byDay.some((d) => d.wd === wd && (d.nth === undefined || nthWeekdayMatches(day, d.nth)));
      return day.getDate() === start.getDate();
    }
    case "YEARLY":
      return (
        (day.getFullYear() - start.getFullYear()) % rule.interval === 0 &&
        day.getMonth() === start.getMonth() &&
        day.getDate() === start.getDate()
      );
  }
}

/**
 * The first occurrence strictly after `after` (or at it, when `inclusive`),
 * for a series starting at `start`. Keeps `start`'s time of day.
 */
export function nextOccurrence(rrule: string, start: Date, after: Date, inclusive = false): Date | undefined {
  const rule = parseRRule(rrule);
  const at = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), start.getHours(), start.getMinutes());
  let day = startOfDay(after < start ? start : after);
  for (let i = 0; i < 366 * 10; i++, day = addDays(day, 1)) {
    if (!occursOn(rule, start, day)) continue;
    const t = at(day);
    if (t > after || (inclusive && t.getTime() === after.getTime())) return t;
  }
  return undefined;
}

/** "Every 3 days" style: count from `from` (when it was done), keep `start`'s time. */
export function addInterval(rrule: string, start: Date, from: Date): Date {
  const { freq, interval } = parseRRule(rrule);
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate(), start.getHours(), start.getMinutes());
  switch (freq) {
    case "DAILY":
      return addDays(base, interval);
    case "WEEKLY":
      return addDays(base, interval * 7);
    case "MONTHLY":
      return new Date(base.getFullYear(), base.getMonth() + interval, base.getDate(), base.getHours(), base.getMinutes());
    case "YEARLY":
      return new Date(base.getFullYear() + interval, base.getMonth(), base.getDate(), base.getHours(), base.getMinutes());
  }
}

const WD_NAME: Record<Weekday, string> = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };
const ORD = (n: number) => (n === -1 ? "last" : `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`);

/** Plain-English summary, e.g. "Monthly on the 1st", "Every 3 days after done". */
export function describeRRule(rrule: string, afterCompletion = false): string {
  const r = parseRRule(rrule);
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[r.freq];
  let s: string;
  if (r.freq === "WEEKLY" && r.byDay && r.interval === 1) {
    const days = r.byDay.map((d) => d.wd).join(",");
    s = days === "MO,TU,WE,TH,FR" ? "Every weekday" : `Every ${r.byDay.map((d) => WD_NAME[d.wd]).join(", ")}`;
  } else if (r.freq === "MONTHLY" && r.byMonthDay) {
    s = `Monthly on the ${r.byMonthDay.map(ORD).join(" & ")}`;
  } else if (r.freq === "MONTHLY" && r.byDay) {
    const nths = r.byDay.map((d) => (d.nth ? ORD(d.nth) : "every")).join(" & ");
    s = `${nths} ${WD_NAME[r.byDay[0]!.wd]} monthly`;
    s = s[0]!.toUpperCase() + s.slice(1);
  } else {
    s = r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
  }
  return afterCompletion ? `${s} after done` : s;
}
