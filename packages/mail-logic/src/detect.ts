/**
 * Find dates and times in an email so one tap can put them in Today:
 * "Dinner Friday at 7pm?", "your appointment on Tue 28 Oct at 3:30pm",
 * "can you send it by Thursday", "Nov 12 from 2pm to 3:30pm".
 *
 * Relative words ("tomorrow", "Friday") are read from the day the email was
 * sent, not the day it is read. Month names only count next to a day number,
 * so "you may" and "march on" are left alone.
 */

export interface Detected {
  /** Character range in the text. */
  start: number;
  end: number;
  text: string;
  /** Local midnight of the day. */
  date: Date;
  time?: { h: number; m: number };
  durationMin?: number;
  /** "by Friday", "due Thursday": a deadline rather than a time to block out. */
  deadline: boolean;
}

const WD = "(?:mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)(?![a-z])";
// "sat" and "sun" alone are everyday words ("I sat", "the sun"), so the short
// forms only count with a date after them ("Sat 1 Nov").
const WD_BARE = "(?:mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|saturday|sunday)(?![a-z])";
const MON =
  "(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)(?![a-z])";
const ORD = "(?:\\d{1,2})(?:st|nd|rd|th)?";
const TIME = "(?:(?:\\d{1,2})(?::\\d{2})?\\s?(?:am|pm|a\\.m\\.|p\\.m\\.)|(?:[01]?\\d|2[0-3]):[0-5]\\d|noon|midday)";

// A bare hour only counts as the start of a range: "2-3pm".
const TIME1 = `(?:${TIME}|\\d{1,2}(?::\\d{2})?(?=\\s*(?:-|–|to)\\s*\\d))`;

const DAY = [
  `(?:today|tonight|tomorrow|tmrw)`,
  `${WD}\\s+(?:the\\s+)?${ORD}(?!\\s?(?:am|pm|a\\.m|p\\.m|:\\d|\\d|[-–]|to\\b))(?:\\s+(?:of\\s+)?${MON})?`,
  `(?:(?:this|next)\\s+)?${WD_BARE}`,
  `${ORD}\\s+(?:of\\s+)?${MON}(?:\\s+\\d{4})?`,
  `${MON}\\s+${ORD}(?:,?\\s+\\d{4})?`,
].join("|");

// [by|due|before] [on] DAY [at|,|from] [TIME [to|-|until TIME]]
// or TIME [on] DAY
const PATTERN = new RegExp(
  [
    `(?<lead>\\b(?:by|due|before)\\s+)?(?:\\bon\\s+)?(?<day>${DAY})(?:(?:\\s*,\\s*|\\s+(?:at|from|@)\\s+|\\s+)(?<t1>${TIME1})(?:\\s*(?:-|–|to|until|till)\\s*(?<t2>${TIME}))?)?`,
    `(?<t1b>${TIME1})(?:\\s*(?:-|–|to)\\s*(?<t2b>${TIME}))?\\s+(?:on\\s+)?(?<dayb>${DAY})`,
  ].join("|"),
  "gi",
);

const WD_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function readTime(s: string | undefined, hint?: "am" | "pm"): { h: number; m: number } | undefined {
  if (!s) return undefined;
  const t = s.toLowerCase().replace(/\./g, "");
  if (t === "noon" || t === "midday") return { h: 12, m: 0 };
  const m = /^(\d{1,2})(?::(\d{2}))?\s?(am|pm)?$/.exec(t);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = (m[3] as "am" | "pm" | undefined) ?? (m[2] ? undefined : hint);
  if (h > 23 || min > 59) return undefined;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return { h, m: min };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function readDay(s: string, ref: Date): Date | undefined {
  const t = s.toLowerCase().replace(/\s+/g, " ").trim();
  const today = startOfDay(ref);
  if (t === "today" || t === "tonight") return today;
  if (t === "tomorrow" || t === "tmrw") return addDays(today, 1);

  const wd = new RegExp(`^(?:(this|next) )?(${WD})(?: (?:the )?(\\d{1,2})(?:st|nd|rd|th)?(?: (?:of )?(${MON}))?)?$`).exec(t);
  if (wd) {
    const target = WD_INDEX[wd[2]!.slice(0, 3)]!;
    // "Friday 31st October": trust the date.
    if (wd[3]) return readDay(`${wd[3]} ${wd[4] ?? MONTHS[ref.getMonth()]}`, ref);
    let diff = (target - today.getDay() + 7) % 7;
    if (wd[1] === "next") {
      // "next Friday": the Friday of next week (Monday-start weeks).
      const daysToNextMonday = ((8 - today.getDay()) % 7) || 7;
      if (diff < daysToNextMonday) diff += 7;
    }
    return addDays(today, diff);
  }

  const dm = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MON})(?: (\\d{4}))?$`).exec(t);
  const md = new RegExp(`^(${MON}) (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?$`).exec(t);
  const day = dm ? Number(dm[1]) : md ? Number(md[2]) : NaN;
  const monthName = dm ? dm[2] : md ? md[1] : undefined;
  const year = dm?.[3] ?? md?.[3];
  if (!monthName || !(day >= 1 && day <= 31)) return undefined;
  const month = MONTHS.indexOf(monthName.slice(0, 3));
  let d = new Date(year ? Number(year) : today.getFullYear(), month, day);
  if (d.getMonth() !== month) return undefined; // 31 Feb
  // No year and already well past: it means next year ("3 Jan" read in December).
  if (!year && d < addDays(today, -60)) d = new Date(today.getFullYear() + 1, month, day);
  return d;
}

/** Every date in the text, in order. `sentAt` is when the email was sent. */
export function detectDates(text: string, sentAt: Date = new Date()): Detected[] {
  const out: Detected[] = [];
  PATTERN.lastIndex = 0;
  for (let m = PATTERN.exec(text); m; m = PATTERN.exec(text)) {
    const g = m.groups!;
    const dayText = g.day ?? g.dayb!;
    // Whole words only: the character before the match must not be a letter.
    const before = text[m.index - 1];
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if ((before && /[a-z0-9]/i.test(before)) || /^[a-z]|^\.[a-z]/i.test(rest)) {
      PATTERN.lastIndex = m.index + 1;
      continue;
    }
    const date = readDay(dayText, sentAt);
    if (!date) continue;
    const t2raw = g.t2 ?? g.t2b;
    const t2 = readTime(t2raw);
    // "2-3pm": the first time takes the second's am/pm.
    const hint = t2raw && /p\.?m/i.test(t2raw) ? "pm" : t2raw && /a\.?m/i.test(t2raw) ? "am" : undefined;
    const time = readTime(g.t1 ?? g.t1b, hint);
    let durationMin: number | undefined;
    if (time && t2) {
      const d = t2.h * 60 + t2.m - (time.h * 60 + time.m);
      if (d > 0) durationMin = d;
    }
    const start = m.index;
    out.push({
      start,
      end: start + m[0].length,
      text: m[0],
      date,
      time,
      durationMin,
      deadline: !!g.lead,
    });
  }
  return out;
}

/** When a detected date starts, as a Date (midnight when it has no time). */
export function detectedStart(d: Detected): Date {
  return d.time ? new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), d.time.h, d.time.m) : d.date;
}
