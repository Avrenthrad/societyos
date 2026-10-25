import type { Person } from "@societyos/core";

/**
 * Birthdays are stored as "YYYY-MM-DD", or "--MM-DD" when the year is not
 * known (the vCard convention, so phone exports import as they are).
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function valid(month: number, day: number, year?: number) {
  if (month < 1 || month > 12 || day < 1) return false;
  // Year unknown: allow 29 Feb (a leap-year birthday).
  const max = new Date(year ?? 2000, month, 0).getDate();
  return day <= max;
}

function format(month: number, day: number, year?: number) {
  if (!valid(month, day, year)) return undefined;
  return year ? `${year}-${pad(month)}-${pad(day)}` : `--${pad(month)}-${pad(day)}`;
}

function monthFromWord(w: string) {
  const i = MONTHS.indexOf(w.slice(0, 3).toLowerCase());
  return i === -1 ? undefined : i + 1;
}

/**
 * Read a birthday typed in any common way: "12 Mar", "March 12",
 * "12/03/1990" (day first), "1990-03-12", "19900312", "--03-12".
 */
export function parseBirthday(input: string): string | undefined {
  const s = input.trim().replace(/(\d)(st|nd|rd|th)\b/gi, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s))) return format(+m[2]!, +m[3]!, +m[1]!);
  if ((m = /^--(\d{2})-?(\d{2})$/.exec(s))) return format(+m[1]!, +m[2]!);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?$/.exec(s))) return format(+m[2]!, +m[1]!, m[3] ? +m[3] : undefined);
  if ((m = /^(\d{1,2}) ([a-z]{3,9})(?: (\d{4}))?$/i.exec(s))) {
    const mon = monthFromWord(m[2]!);
    return mon ? format(mon, +m[1]!, m[3] ? +m[3] : undefined) : undefined;
  }
  if ((m = /^([a-z]{3,9}) (\d{1,2})(?: (\d{4}))?$/i.exec(s))) {
    const mon = monthFromWord(m[1]!);
    return mon ? format(mon, +m[2]!, m[3] ? +m[3] : undefined) : undefined;
  }
  return undefined;
}

export function splitBirthday(b: string): { year?: number; month: number; day: number } | undefined {
  const m = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(b);
  if (!m) return undefined;
  return { year: m[1] ? +m[1] : undefined, month: +m[2]!, day: +m[3]! };
}

/** "12 March" or "12 March 1990". */
export function formatBirthday(b: string): string {
  const p = splitBirthday(b);
  if (!p) return b;
  const name = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][p.month - 1];
  return p.year ? `${p.day} ${name} ${p.year}` : `${p.day} ${name}`;
}

/** The day the birthday falls on in a given year; 29 Feb becomes 28 Feb in other years. */
function inYear(month: number, day: number, year: number) {
  const max = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, max));
}

export interface NextBirthday {
  date: Date;
  daysUntil: number;
  /** Age they turn on that day, when the year is known. */
  turning?: number;
}

/** The next birthday on or after today. */
export function nextBirthday(b: string, now: Date = new Date()): NextBirthday | undefined {
  const p = splitBirthday(b);
  if (!p) return undefined;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date = inYear(p.month, p.day, today.getFullYear());
  if (date < today) date = inYear(p.month, p.day, today.getFullYear() + 1);
  const daysUntil = Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000,
  );
  return { date, daysUntil, turning: p.year ? date.getFullYear() - p.year : undefined };
}

export interface UpcomingBirthday extends NextBirthday {
  person: Person;
}

/** Birthdays in the next `withinDays` days (today counts), soonest first. */
export function upcomingBirthdays(people: Person[], now: Date = new Date(), withinDays = 30): UpcomingBirthday[] {
  const out: UpcomingBirthday[] = [];
  for (const person of people) {
    const next = person.birthday ? nextBirthday(person.birthday, now) : undefined;
    if (next && next.daysUntil <= withinDays) out.push({ ...next, person });
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil || a.person.name.localeCompare(b.person.name));
}

/** "Today", "Tomorrow", "in 5 days", "in 3 weeks". */
export function formatDaysUntil(n: number): string {
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 14) return `in ${n} days`;
  return `in ${Math.round(n / 7)} weeks`;
}
