import type { Recurrence } from "@societyos/core";
import { addDays, localTz, parseQuickAdd, startOfDay, type KnownPerson } from "@societyos/today-logic";
import { CATEGORIES } from "./categorize.js";
import { formatMoney, parseAmount } from "./money.js";

/**
 * Quick money entry in plain words, like Today's quick add:
 *   "Coffee 4.50 at Bean Co"            spend, place
 *   "Dinner with Sam 86 yesterday #fun" spend, person, date, category
 *   "+2500 salary"                      money in
 *   "Rent 520 every month on the 1st"   a bill: repeats, so it becomes a task in Today
 * Dates, repeats and known people come from Today's parser, so the two
 * apps read words the same way. Each understood piece is a token the
 * person can undo before saving.
 */

export type MoneyTokenKind = "amount" | "income" | "date" | "repeat" | "person" | "new-person" | "place" | "category";

export interface MoneyToken {
  kind: MoneyTokenKind;
  start: number;
  end: number;
  text: string;
  label: string;
}

export interface KnownPlace {
  id: string;
  name: string;
}

export interface EntryOptions {
  now?: Date;
  tz?: string;
  currency?: string;
  people?: KnownPerson[];
  places?: KnownPlace[];
  ignore?: number[];
}

export interface MoneyEntry {
  description: string;
  /** Signed minor units; undefined until an amount is typed. */
  amountMinor?: number;
  date: Date;
  /** Present when it repeats: save it as a bill. */
  recurrence?: Recurrence;
  personIds: string[];
  /** Names after "with" that are not in People yet. */
  newPeople: string[];
  place?: { id?: string; name: string };
  category?: string;
  tokens: MoneyToken[];
}

const ALIASES: Record<string, string> = {
  food: "Eating out", eat: "Eating out", eatingout: "Eating out", coffee: "Eating out", drinks: "Eating out",
  grocery: "Groceries", groceries: "Groceries", shop: "Shopping", shopping: "Shopping",
  transport: "Transport", travel: "Travel", car: "Transport", fuel: "Transport",
  bill: "Bills", bills: "Bills", home: "Home", rent: "Home", health: "Health", fun: "Fun",
  income: "Income", pay: "Income", transfer: "Transfers", other: "Other",
};

function categoryFor(tag: string): string {
  const t = tag.toLowerCase();
  const exact = CATEGORIES.find((c) => c.toLowerCase().replace(/\s/g, "") === t);
  if (exact) return exact;
  if (ALIASES[t]) return ALIASES[t]!;
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

const INCOME_WORDS = /(^|\s)(received|got paid|paid me|income|refund|refunded)(?=$|[\s,.;])/i;

export function parseMoneyEntry(text: string, opts: EntryOptions = {}): MoneyEntry {
  const now = opts.now ?? new Date();
  const currency = opts.currency;
  const ignore = new Set(opts.ignore ?? []);
  const taken = new Array<boolean>(text.length).fill(false);
  const take = (s: number, e: number) => {
    for (let i = s; i < e; i++) taken[i] = true;
  };
  const free = (s: number, e: number) => !taken.slice(s, e).some(Boolean);
  const tokens: MoneyToken[] = [];
  const out: MoneyEntry = { description: "", date: startOfDay(now), personIds: [], newPeople: [], tokens };

  // Dates, repeats and known people: Today's parser.
  const q = parseQuickAdd(text, { now, tz: opts.tz ?? localTz(), people: opts.people, ignore: [...ignore] });
  for (const t of q.tokens) {
    if (t.kind === "date" || t.kind === "repeat") {
      take(t.start, t.end);
      tokens.push({ kind: t.kind, start: t.start, end: t.end, text: t.text, label: t.label });
    } else if (t.kind === "person") {
      tokens.push({ kind: "person", start: t.start, end: t.end, text: t.text, label: t.label });
    }
  }
  if (q.date && tokens.some((t) => t.kind === "date" || t.kind === "repeat")) out.date = q.date;
  // Spends are often logged after the fact, so "yesterday" counts here too.
  const yday = /(^|\s)(yesterday|yday)(?=$|[\s,.;])/i.exec(text);
  if (yday && !tokens.some((t) => t.kind === "date" || t.kind === "repeat")) {
    const start = yday.index + yday[1]!.length;
    const end = start + yday[2]!.length;
    if (!ignore.has(start) && free(start, end)) {
      take(start, end);
      out.date = addDays(startOfDay(now), -1);
      tokens.push({ kind: "date", start, end, text: yday[2]!, label: "Yesterday" });
    }
  }
  if (q.recurrence && tokens.some((t) => t.kind === "repeat")) out.recurrence = q.recurrence;
  out.personIds = q.personIds;

  // Amount: prefer one written like money ("$4.50", "4.50"), else a plain number.
  const amountRe = /(^|\s)([+-]?\$?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|[+-]?\$?\d+(?:\.\d{1,2})?)(?=$|[\s,;]|\.(?:\s|$))/g;
  const candidates: { start: number; end: number; raw: string; strong: boolean }[] = [];
  for (let m = amountRe.exec(text); m; m = amountRe.exec(text)) {
    const start = m.index + m[1]!.length;
    const end = start + m[2]!.length;
    if (ignore.has(start) || !free(start, end)) continue;
    candidates.push({ start, end, raw: m[2]!, strong: /[$.]/.test(m[2]!) || /^[+-]/.test(m[2]!) });
  }
  const pick = candidates.find((c) => c.strong) ?? candidates[0];
  let incomeHint = false;
  if (pick) {
    const minor = parseAmount(pick.raw.replace(/^\+/, ""));
    if (minor !== undefined) {
      take(pick.start, pick.end);
      incomeHint = pick.raw.startsWith("+");
      out.amountMinor = -Math.abs(minor);
      tokens.push({ kind: "amount", start: pick.start, end: pick.end, text: pick.raw, label: "" });
    }
  }
  const inc = INCOME_WORDS.exec(text);
  if (!incomeHint && inc) {
    const start = inc.index + inc[1]!.length;
    if (!ignore.has(start)) {
      incomeHint = true;
      tokens.push({ kind: "income", start, end: start + inc[2]!.length, text: inc[2]!, label: "Money in" });
    }
  } else if (incomeHint && pick) {
    tokens.find((t) => t.kind === "amount")!.label = "";
  }
  if (incomeHint && out.amountMinor !== undefined) out.amountMinor = Math.abs(out.amountMinor);

  // Category: "#food".
  const cat = /(^|\s)#([\p{L}][\p{L}\d-]*)/u.exec(text);
  if (cat) {
    const start = cat.index + cat[1]!.length;
    const end = start + cat[2]!.length + 1;
    if (!ignore.has(start) && free(start, end)) {
      take(start, end);
      out.category = categoryFor(cat[2]!);
      tokens.push({ kind: "category", start, end, text: text.slice(start, end), label: out.category });
    }
  }

  // Place: "at Bean Co" (capitalised) or "at <a place you've used>".
  const lower = text.toLowerCase();
  let placeFound = false;
  for (const p of [...(opts.places ?? [])].sort((a, b) => b.name.length - a.name.length)) {
    const i = lower.indexOf(`at ${p.name.toLowerCase()}`);
    const end = i + 3 + p.name.length;
    if (i < 0 || (i > 0 && !/\s/.test(text[i - 1]!)) || (end < text.length && !/[\s,.;]/.test(text[end]!))) continue;
    if (ignore.has(i) || !free(i, end)) continue;
    take(i, end);
    out.place = { id: p.id, name: p.name };
    tokens.push({ kind: "place", start: i, end, text: text.slice(i, end), label: `Place: ${p.name}` });
    placeFound = true;
    break;
  }
  if (!placeFound) {
    const pm = /(^|\s)at\s+([A-Z0-9][\w'&.-]*(?:\s+(?:[A-Z0-9&][\w'&.-]*|&))*)/.exec(text);
    if (pm) {
      const start = pm.index + pm[1]!.length;
      const name = pm[2]!.replace(/[.,;]+$/, "");
      const end = start + 3 + name.length;
      if (!ignore.has(start) && free(start, end) && !/^\d+(\.\d+)?$/.test(name)) {
        take(start, end);
        out.place = { name };
        tokens.push({ kind: "place", start, end, text: text.slice(start, end), label: `New place: ${name}` });
      }
    }
  }

  // "with Alex": a person not in People yet. The name stays in the text.
  const withRe = /(^|\s)with\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?)/gu;
  for (let m = withRe.exec(text); m; m = withRe.exec(text)) {
    const start = m.index + m[1]!.length + 5;
    const end = start + m[2]!.length;
    if (ignore.has(start) || tokens.some((t) => t.kind === "person" && t.start < end && t.end > start)) continue;
    out.newPeople.push(m[2]!);
    tokens.push({ kind: "new-person", start, end, text: m[2]!, label: `New person: ${m[2]}` });
  }

  for (const t of tokens) {
    if (t.kind === "amount") {
      const a = out.amountMinor ?? 0;
      t.label = a > 0 ? `In ${formatMoney(a, currency)}` : formatMoney(-a, currency);
    }
  }
  tokens.sort((a, b) => a.start - b.start);
  out.description = text
    .split("")
    .filter((_, i) => !taken[i])
    .join("")
    .replace(/\s+/g, " ")
    .replace(/(^|\s)(on|at|for|by|,)$/i, "")
    .replace(/^(on|for|,)\s/i, "")
    .trim();
  if (!out.description && out.place) out.description = out.place.name;
  return out;
}
