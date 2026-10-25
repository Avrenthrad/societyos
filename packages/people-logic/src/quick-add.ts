import { parseBirthday } from "./birthdays.js";

/**
 * One line adds a whole person:
 * "Sam Lee bday 12 Mar every 2 weeks #friends sam@lee.com 0412 345 678".
 * Everything not recognised is the name.
 */
export interface PersonQuickAdd {
  name: string;
  emails: string[];
  phones: string[];
  birthday?: string;
  keepInTouchDays?: number;
  tags: string[];
  /** What was picked out, for showing as chips before saving. */
  tokens: { kind: "email" | "phone" | "birthday" | "keep-in-touch" | "tag"; text: string; label: string }[];
}

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, fortnight: 14, month: 30, year: 365 };
const WORD_CADENCE: Record<string, number> = { daily: 1, weekly: 7, fortnightly: 14, monthly: 30, quarterly: 90, yearly: 365, annually: 365 };

export function parsePersonQuickAdd(input: string): PersonQuickAdd {
  const out: PersonQuickAdd = { name: "", emails: [], phones: [], tags: [], tokens: [] };
  let s = ` ${input} `;
  /** fn returns false to leave the match alone, or a string to put back in its place. */
  const take = (re: RegExp, fn: (m: RegExpExecArray) => false | string | void) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    s = s.replace(g, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      const r = fn(m);
      return r === false ? m[0] : ` ${r ?? ""} `;
    });
  };

  take(/\s([^\s@]+@[^\s@]+\.[^\s@]+)(?=\s)/, (m) => {
    out.emails.push(m[1]!);
    out.tokens.push({ kind: "email", text: m[1]!, label: m[1]! });
  });

  take(/\s#([\p{L}\p{N}_-]+)(?=\s)/u, (m) => {
    out.tags.push(m[1]!.toLowerCase());
    out.tokens.push({ kind: "tag", text: `#${m[1]}`, label: `#${m[1]!.toLowerCase()}` });
  });

  take(/\s(?:birthday|bday|b'day|born)\s+((?:\S+\s+){0,2}\S+)(?=\s)/i, (m) => {
    // Try the longest date phrase first: "12 March 1990", then "12 March", then "12/03".
    const words = m[1]!.split(/\s+/);
    for (let n = words.length; n > 0; n--) {
      const b = parseBirthday(words.slice(0, n).join(" "));
      if (b) {
        out.birthday = b;
        out.tokens.push({ kind: "birthday", text: m[0].trim().split(/\s+/).slice(0, n + 1).join(" "), label: `Birthday ${words.slice(0, n).join(" ")}` });
        return words.slice(n).join(" "); // give back words that weren't part of the date
      }
    }
    return false;
  });

  take(/\s(?:keep in touch\s+|catch up\s+)?every\s+(\d+\s+)?(day|week|fortnight|month|year)s?(?=\s)/i, (m) => {
    out.keepInTouchDays = (m[1] ? Number(m[1]) : 1) * UNIT_DAYS[m[2]!.toLowerCase()]!;
    out.tokens.push({ kind: "keep-in-touch", text: m[0].trim(), label: `Keep in touch ${m[0].trim().replace(/^(keep in touch|catch up)\s+/i, "")}` });
  });
  take(/\s(daily|weekly|fortnightly|monthly|quarterly|yearly|annually)(?=\s)/i, (m) => {
    if (out.keepInTouchDays) return false;
    out.keepInTouchDays = WORD_CADENCE[m[1]!.toLowerCase()];
    out.tokens.push({ kind: "keep-in-touch", text: m[1]!, label: `Keep in touch ${m[1]!.toLowerCase()}` });
  });

  // Phone last, so a birthday like 12/03/1990 isn't read as a number.
  take(/\s(\+?\d[\d\s().-]{6,}\d)(?=\s)/, (m) => {
    if (m[1]!.replace(/\D/g, "").length < 8) return false;
    out.phones.push(m[1]!.trim());
    out.tokens.push({ kind: "phone", text: m[1]!.trim(), label: m[1]!.trim() });
  });

  out.name = s.replace(/\s+/g, " ").trim();
  return out;
}
