import type { Transaction } from "@societyos/core";
import { parseAmount } from "./money.js";

/**
 * Bank statement CSV import. Every bank lays its file out differently, so
 * the columns are guessed from the header (or, with no header, from what
 * the values look like), shown to the person, and can be changed before
 * anything is saved. Re-importing an overlapping statement adds nothing
 * twice: each row gets an `importKey` from its date, amount and text.
 */

/** RFC 4180 CSV: quoted fields, "" escapes, commas and newlines in quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = guessDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

function guessDelimiter(src: string): string {
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 1 ? counts[0]![0] : ",";
}

export type DateOrder = "dmy" | "mdy" | "ymd";

export interface ColumnMap {
  date: number;
  description: number;
  /** One signed amount column... */
  amount?: number;
  /** ...or separate money-out and money-in columns. */
  debit?: number;
  credit?: number;
  /** Some banks put the payee in a second column; joined to the description. */
  extra?: number;
}

export interface CsvLayout {
  hasHeader: boolean;
  columns: ColumnMap;
  dateOrder: DateOrder;
  header: string[];
}

const DATE_RE = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/;
const isDate = (s: string) => DATE_RE.test(s) || !Number.isNaN(Date.parse(s)) && /\d{4}/.test(s) && /[a-z]/i.test(s);
const isMoney = (s: string) => s !== "" && parseAmount(s) !== undefined;

const find = (header: string[], ...patterns: RegExp[]) => {
  for (const re of patterns) {
    const i = header.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return undefined;
};

/** Guess which column is which. The person can change any of it. */
export function detectLayout(rows: string[][]): CsvLayout {
  const first = rows[0] ?? [];
  const hasHeader = first.length > 0 && !first.some(isDate) && first.some((f) => /[a-z]/i.test(f));
  const header = hasHeader ? first.map((h) => h.toLowerCase()) : [];
  const body = hasHeader ? rows.slice(1) : rows;
  const sample = body.slice(0, 50);
  const width = Math.max(0, ...rows.map((r) => r.length));
  const share = (i: number, test: (s: string) => boolean) =>
    sample.length ? sample.filter((r) => test(r[i] ?? "")).length / sample.length : 0;

  const columns: Partial<ColumnMap> = {};
  if (hasHeader) {
    columns.date = find(header, /^(transaction |posted |value )?date$/, /date/);
    columns.debit = find(header, /debit|withdraw|money out|paid out|^out$/);
    columns.credit = find(header, /credit|deposit|money in|paid in|^in$/);
    columns.amount = find(header, /^amount$/, /amount|value/);
    columns.description = find(header, /description|narrative|details|memo|particulars|reference|payee|merchant|name/);
    const payee = find(header, /payee|merchant|name/);
    if (payee !== undefined && payee !== columns.description) columns.extra = payee;
    if (columns.debit !== undefined && columns.credit !== undefined) columns.amount = undefined;
    else {
      columns.debit = undefined;
      columns.credit = undefined;
    }
  }
  // Fill gaps from the values themselves (headerless files like CommBank's).
  const cols = Array.from({ length: width }, (_, i) => i);
  if (columns.date === undefined) columns.date = cols.find((i) => share(i, isDate) > 0.8) ?? 0;
  const used = () => new Set(Object.values(columns).filter((v) => v !== undefined));
  if (columns.amount === undefined && columns.debit === undefined) {
    // First money-looking column; the last one is often the running balance.
    const money = cols.filter((i) => !used().has(i) && share(i, isMoney) > 0.8);
    columns.amount = money[0];
  }
  if (columns.description === undefined) {
    const textish = cols.filter((i) => !used().has(i) && share(i, (s) => /[a-z]/i.test(s)) > 0.5);
    textish.sort((a, b) => avgLen(sample, b) - avgLen(sample, a));
    columns.description = textish[0] ?? cols.find((i) => !used().has(i)) ?? 0;
  }

  const dateOrder = detectDateOrder(body.map((r) => r[columns.date!] ?? ""));
  return { hasHeader, columns: columns as ColumnMap, dateOrder, header: hasHeader ? first : [] };
}

const avgLen = (rows: string[][], i: number) => rows.reduce((n, r) => n + (r[i]?.length ?? 0), 0) / (rows.length || 1);

/**
 * Day-first or month-first? Any value over 12 in the first slot settles it.
 * When nothing settles it, day-first (Australia, UK, most of the world).
 */
export function detectDateOrder(values: string[]): DateOrder {
  let dmy = false;
  let mdy = false;
  for (const v of values) {
    const m = DATE_RE.exec(v.trim());
    if (!m) continue;
    if (m[1]!.length === 4) return "ymd";
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  return mdy && !dmy ? "mdy" : "dmy";
}

/** Local midnight for a statement date, or undefined if unreadable. */
export function parseStatementDate(raw: string, order: DateOrder): Date | undefined {
  const s = raw.trim();
  const m = DATE_RE.exec(s);
  if (m) {
    let [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
    let y: number, mo: number, d: number;
    if (order === "ymd" || m[1]!.length === 4) [y, mo, d] = [a, b, c];
    else if (order === "mdy") [mo, d, y] = [a, b, c];
    else [d, mo, y] = [a, b, c];
    if (y < 100) y += 2000;
    const date = new Date(y, mo - 1, d);
    return date.getMonth() === mo - 1 && date.getDate() === d ? date : undefined;
  }
  const t = Date.parse(s); // "25 Oct 2026", "Oct 25, 2026"
  if (Number.isNaN(t)) return undefined;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface ImportRow {
  line: number;
  occurredAt: Date;
  amountMinor: number;
  description: string;
  importKey: string;
  /** Already saved from an earlier import. */
  duplicate: boolean;
}

export interface ImportPreview {
  rows: ImportRow[];
  /** Lines that could not be read, with why. */
  skipped: { line: number; reason: string }[];
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Turn rows into transactions-to-be, marking any already imported. */
export function previewImport(rows: string[][], layout: CsvLayout, existing: Pick<Transaction, "importKey">[] = []): ImportPreview {
  const known = new Set(existing.map((t) => t.importKey).filter(Boolean));
  const seen = new Map<string, number>();
  const out: ImportPreview = { rows: [], skipped: [] };
  const { columns: c, dateOrder } = layout;
  const start = layout.hasHeader ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]!;
    const line = i + 1;
    const date = parseStatementDate(r[c.date] ?? "", dateOrder);
    if (!date) {
      out.skipped.push({ line, reason: `No date in "${r[c.date] ?? ""}"` });
      continue;
    }
    let amount: number | undefined;
    if (c.amount !== undefined) amount = parseAmount(r[c.amount] ?? "");
    else {
      const out_ = parseAmount(r[c.debit!] ?? "");
      const in_ = parseAmount(r[c.credit!] ?? "");
      if (out_ !== undefined && out_ !== 0) amount = -Math.abs(out_);
      else if (in_ !== undefined) amount = Math.abs(in_);
    }
    if (amount === undefined) {
      out.skipped.push({ line, reason: "No amount" });
      continue;
    }
    const parts = [r[c.description], c.extra !== undefined ? r[c.extra] : undefined].filter((p): p is string => !!p);
    const description = [...new Set(parts)].join(" · ") || "(no description)";
    // Two identical coffees on one day are two rows, not a duplicate.
    const baseKey = `${ymd(date)}|${amount}|${normalise(description)}`;
    const n = (seen.get(baseKey) ?? 0) + 1;
    seen.set(baseKey, n);
    const importKey = `${baseKey}|${n}`;
    out.rows.push({ line, occurredAt: date, amountMinor: amount, description, importKey, duplicate: known.has(importKey) });
  }
  return out;
}
