import type { Recurrence, TimeBlock } from "@societyos/core";
import { addDays, addMinutes, formatDay, formatDuration, formatTime, localTz, startOfDay } from "./dates.js";
import { describeRRule, nextOccurrence } from "./recurrence.js";

/**
 * Quick add: turn "Call Sam tomorrow 3pm 30m" into a task.
 *
 * Only whole words are read as dates, so "janky" never becomes January.
 * Every piece that was understood comes back as a token with its position,
 * so the UI can show it before saving and undo any one of them (pass its
 * `start` in `ignore` and it is kept as plain title text instead).
 */

export type TokenKind = "date" | "time" | "duration" | "repeat" | "priority" | "person";

export interface Token {
  kind: TokenKind;
  /** Character range in the original text. */
  start: number;
  end: number;
  text: string;
  /** What it was understood as, e.g. "Tomorrow", "3:00 pm". */
  label: string;
}

export interface KnownPerson {
  id: string;
  name: string;
}

export interface ParseOptions {
  now?: Date;
  tz?: string;
  people?: KnownPerson[];
  /** Token starts the person undid: read those words as plain text. */
  ignore?: number[];
}

export interface QuickAdd {
  title: string;
  tokens: Token[];
  /** Local midnight of the day it is for. */
  date?: Date;
  time?: { h: number; m: number };
  durationMin?: number;
  recurrence?: Recurrence;
  priority: 0 | 1 | 2 | 3;
  personIds: string[];
}

const WD = "(mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)";
const MONTH =
  "(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)";
const ORDN = "(\\d{1,2})(?:st|nd|rd|th)?";
const WD_CODE: Record<string, string> = { mon: "MO", tue: "TU", wed: "WE", thu: "TH", fri: "FR", sat: "SA", sun: "SU" };
const WD_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const wdKey = (s: string) => s.slice(0, 3).toLowerCase();
const monthIndex = (s: string) =>
  ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(s.slice(0, 3).toLowerCase());
const UNIT: Record<string, string> = { day: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" };
const unitOf = (s: string) => UNIT[s.toLowerCase().replace(/s$/, "")]!;

type Found = Partial<Omit<QuickAdd, "title" | "tokens" | "personIds">> & { label: string };
interface Matcher {
  kind: TokenKind;
  /** Body only; whole-word boundaries are added around it. */
  re: string;
  read(m: RegExpExecArray, now: Date): Found | undefined;
}

function nextWeekday(now: Date, wd: number): Date {
  const today = startOfDay(now);
  const diff = (wd - today.getDay() + 7) % 7 || 7;
  return addDays(today, diff);
}

function ordinalList(s: string): number[] {
  return s.split(/\s*(?:,|and|&)\s*/).map((x) => (/last/i.test(x) ? -1 : parseInt(x, 10)));
}

const matchers: Matcher[] = [
  // ---- repeats (longest first) ----
  {
    kind: "repeat",
    re: `every\\s+month\\s+on\\s+the\\s+${ORDN}`,
    read: (m) => ({ recurrence: { rrule: `FREQ=MONTHLY;BYMONTHDAY=${Number(m[2])}`, tz: "" }, label: "" }),
  },
  {
    kind: "repeat",
    re: `every\\s+((?:\\d(?:st|nd|rd|th)|last)(?:\\s*(?:,|and|&)\\s*(?:\\d(?:st|nd|rd|th)|last))*)\\s+${WD}`,
    read: (m) => {
      const code = WD_CODE[wdKey(m[3]!)]!;
      const byDay = ordinalList(m[2]!).map((n) => `${n}${code}`).join(",");
      return { recurrence: { rrule: `FREQ=MONTHLY;BYDAY=${byDay}`, tz: "" }, label: "" };
    },
  },
  {
    kind: "repeat",
    re: `every\\s+weekday`,
    read: () => ({ recurrence: { rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", tz: "" }, label: "" }),
  },
  {
    kind: "repeat",
    re: `every\\s+(${WD.slice(1, -1)}(?:\\s*(?:,|and|&)\\s*${WD.slice(1, -1)})*)`,
    read: (m) => {
      const days = m[2]!.split(/\s*(?:,|and|&)\s*/).map((d) => WD_CODE[wdKey(d)]);
      return { recurrence: { rrule: `FREQ=WEEKLY;BYDAY=${days.join(",")}`, tz: "" }, label: "" };
    },
  },
  {
    kind: "repeat",
    re: `every(!?)\\s+(\\d+)\\s+(days?|weeks?|months?|years?)`,
    read: (m) => ({
      recurrence: { rrule: `FREQ=${unitOf(m[4]!)};INTERVAL=${Number(m[3])}`, tz: "", afterCompletion: m[2] === "!" || undefined },
      label: "",
    }),
  },
  {
    kind: "repeat",
    re: `every(!?)\\s+(day|week|month|year)`,
    read: (m) => ({
      recurrence: { rrule: `FREQ=${unitOf(m[3]!)}`, tz: "", afterCompletion: m[2] === "!" || undefined },
      label: "",
    }),
  },
  // ---- dates ----
  { kind: "date", re: `today|tonight`, read: (_m, now) => ({ date: startOfDay(now), label: "" }) },
  { kind: "date", re: `tomorrow|tmrw|tmr`, read: (_m, now) => ({ date: addDays(startOfDay(now), 1), label: "" }) },
  {
    kind: "date",
    re: `in\\s+(\\d+)\\s+(days?|weeks?)`,
    read: (m, now) => ({ date: addDays(startOfDay(now), Number(m[2]) * (/^w/i.test(m[3]!) ? 7 : 1)), label: "" }),
  },
  {
    kind: "date",
    re: `(?:on\\s+|next\\s+)?${WD}`,
    read: (m, now) => ({ date: nextWeekday(now, WD_INDEX[wdKey(m[2]!)]!), label: "" }),
  },
  {
    kind: "date",
    re: `${ORDN}\\s+(?:of\\s+)?${MONTH}`,
    read: (m, now) => dayMonth(Number(m[2]), monthIndex(m[3]!), now),
  },
  {
    kind: "date",
    re: `${MONTH}\\s+${ORDN}`,
    read: (m, now) => dayMonth(Number(m[3]), monthIndex(m[2]!), now),
  },
  // ---- times ----
  {
    kind: "time",
    re: `(?:at\\s+)?(\\d{1,2})(?::([0-5]\\d))?\\s?(am|pm)`,
    read: (m) => {
      const h12 = Number(m[2]);
      if (h12 < 1 || h12 > 12) return undefined;
      const h = (h12 % 12) + (m[4]!.toLowerCase() === "pm" ? 12 : 0);
      return { time: { h, m: Number(m[3] ?? 0) }, label: "" };
    },
  },
  {
    kind: "time",
    re: `(?:at\\s+)?([01]?\\d|2[0-3]):([0-5]\\d)`,
    read: (m) => ({ time: { h: Number(m[2]), m: Number(m[3]) }, label: "" }),
  },
  {
    kind: "time",
    re: `(?:at\\s+)?(noon|midday|midnight)`,
    read: (m) => ({ time: { h: /night/i.test(m[2]!) ? 0 : 12, m: 0 }, label: "" }),
  },
  // ---- durations ----
  {
    kind: "duration",
    re: `(?:for\\s+)?(\\d+(?:\\.\\d+)?)\\s?(?:h|hr|hrs|hour|hours)(?:\\s?(\\d+)\\s?(?:m|min|mins)?)?`,
    read: (m) => ({ durationMin: Math.round(Number(m[2]) * 60) + Number(m[3] ?? 0), label: "" }),
  },
  {
    kind: "duration",
    re: `(?:for\\s+)?(\\d+)\\s?(?:m|min|mins|minute|minutes)`,
    read: (m) => ({ durationMin: Number(m[2]), label: "" }),
  },
  // ---- priority (Todoist style: p1 is most urgent) ----
  {
    kind: "priority",
    re: `p([1-3])`,
    read: (m) => ({ priority: (4 - Number(m[2])) as 1 | 2 | 3, label: `Priority ${m[2]}` }),
  },
];

function dayMonth(day: number, month: number, now: Date): Found | undefined {
  if (day < 1 || day > 31 || month < 0) return undefined;
  let d = new Date(now.getFullYear(), month, day);
  if (d.getMonth() !== month) return undefined; // e.g. 31 Feb
  if (d < startOfDay(now)) d = new Date(now.getFullYear() + 1, month, day);
  return { date: d, label: "" };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseQuickAdd(text: string, opts: ParseOptions = {}): QuickAdd {
  const now = opts.now ?? new Date();
  const tz = opts.tz ?? localTz();
  const ignore = new Set(opts.ignore ?? []);
  const taken = new Array<boolean>(text.length).fill(false);
  const tokens: Token[] = [];
  const out: QuickAdd = { title: "", tokens, priority: 0, personIds: [] };
  const seen = new Set<TokenKind>();

  for (const mt of matchers) {
    if (seen.has(mt.kind)) continue; // first match of each kind wins
    // (^|\s) before and a word end after: whole words only.
    // Group 1 is the boundary, so a matcher's own groups count from 2.
    const re = new RegExp(`(^|\\s)(?:${mt.re})(?=$|[\\s,.;])`, "gi");
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index + m[1]!.length;
      const end = m.index + m[0].length;
      if (ignore.has(start) || taken.slice(start, end).some(Boolean)) continue;
      const found = mt.read(m, now);
      if (!found) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      const { label, ...fields } = found;
      Object.assign(out, fields);
      tokens.push({ kind: mt.kind, start, end, text: text.slice(start, end), label });
      seen.add(mt.kind);
      break;
    }
  }

  // Repeats without a date start on their first occurrence from today.
  if (out.recurrence) {
    out.recurrence.tz = tz;
    if (!out.date) {
      const first = nextOccurrence(out.recurrence.rrule, startOfDay(now), startOfDay(now), true);
      if (first) out.date = startOfDay(first);
    }
  }
  if (out.time && !out.date) out.date = startOfDay(now);

  // People are linked, but their names stay in the title ("Call Sam").
  for (const p of opts.people ?? []) {
    const re = new RegExp(`(^|[\\s,])(${escapeRe(p.name)})(?=$|[\\s,.;'’])`, "i");
    const m = re.exec(text);
    if (!m) continue;
    const start = m.index + m[1]!.length;
    if (ignore.has(start)) continue;
    out.personIds.push(p.id);
    tokens.push({ kind: "person", start, end: start + m[2]!.length, text: m[2]!, label: `Person: ${p.name}` });
  }

  for (const t of tokens) t.label ||= labelFor(t.kind, out, now);
  tokens.sort((a, b) => a.start - b.start);

  out.title = text
    .split("")
    .filter((_, i) => !taken[i])
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\s+(on|at|for|by|,)$/i, "")
    .trim();
  return out;
}

function labelFor(kind: TokenKind, q: QuickAdd, now: Date): string {
  switch (kind) {
    case "date":
      return formatDay(q.date!, now);
    case "time":
      return formatTime(new Date(2000, 0, 1, q.time!.h, q.time!.m));
    case "duration":
      return formatDuration(q.durationMin!);
    case "repeat":
      return describeRRule(q.recurrence!.rrule, q.recurrence!.afterCompletion);
    default:
      return "";
  }
}

/** Default length of a block when a time is given without one. */
export const DEFAULT_BLOCK_MIN = 30;

/** The task fields a parsed quick add turns into. */
export function quickAddToTask(q: QuickAdd, tz: string = localTz()) {
  let block: TimeBlock | undefined;
  let dueAt: string | undefined;
  let dueAllDay: boolean | undefined;
  if (q.date && q.time) {
    const start = new Date(q.date.getFullYear(), q.date.getMonth(), q.date.getDate(), q.time.h, q.time.m);
    const end = addMinutes(start, q.durationMin ?? DEFAULT_BLOCK_MIN);
    block = { startsAt: start.toISOString(), endsAt: end.toISOString(), tz };
  } else if (q.date) {
    dueAt = q.date.toISOString();
    dueAllDay = true;
  }
  return {
    title: q.title,
    status: "open" as const,
    dueAt,
    dueAllDay,
    block,
    recurrence: q.recurrence,
    priority: q.priority,
  };
}
