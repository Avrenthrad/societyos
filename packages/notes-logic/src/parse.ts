import type { Person } from "@societyos/core";

/**
 * Reading structure out of a note's plain Markdown body. Notes stay plain
 * text (portable, easy to sync and merge); tags, mentions, note links and
 * checklists are all just written inline.
 */

const TAG = /(^|[\s(])#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu;

/** "#work/meetings" style tags, lowercased, no duplicates. "#1" is not a tag. */
export function extractTags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TAG)) {
    const tag = m[2]!.toLowerCase();
    if (!/^\d+$/.test(tag)) out.add(tag);
  }
  return [...out];
}

/** "[[Other note]]" links, by title as written. */
export function extractNoteLinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[\[([^\[\]\n]+)\]\]/g)) out.add(m[1]!.trim());
  return [...out];
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);

/**
 * People mentioned as "@Sam Lee" (full name) or "@Sam" (first name, when
 * only one person has it). Longest name wins, so "@Sam Lee" is Sam Lee
 * and not a different Sam.
 */
export function extractMentions(text: string, people: Person[]): Person[] {
  const firstNames = new Map<string, Person[]>();
  for (const p of people) {
    const first = p.name.trim().split(/\s+/)[0]!.toLowerCase();
    firstNames.set(first, [...(firstNames.get(first) ?? []), p]);
  }
  const candidates: { label: string; person: Person }[] = [];
  for (const p of people) {
    candidates.push({ label: p.name.trim().toLowerCase(), person: p });
    const first = p.name.trim().split(/\s+/)[0]!.toLowerCase();
    if (firstNames.get(first)!.length === 1 && first !== p.name.trim().toLowerCase()) {
      candidates.push({ label: first, person: p });
    }
  }
  candidates.sort((a, b) => b.label.length - a.label.length);

  const lower = text.toLowerCase();
  const found = new Map<string, Person>();
  for (let i = lower.indexOf("@"); i !== -1; i = lower.indexOf("@", i + 1)) {
    if (isWordChar(lower[i - 1])) continue; // an email address, not a mention
    const rest = lower.slice(i + 1);
    const hit = candidates.find((c) => rest.startsWith(c.label) && !isWordChar(rest[c.label.length]));
    if (hit) found.set(hit.person.id, hit.person);
  }
  return [...found.values()];
}

export interface ChecklistItem {
  /** Line number in the body (0-based). */
  line: number;
  text: string;
  done: boolean;
}

const CHECK = /^(\s*[-*] \[)([ xX])(\] )(.*)$/;

/** "- [ ] Call Sam" lines. */
export function checklist(body: string): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  body.split("\n").forEach((l, line) => {
    const m = CHECK.exec(l);
    if (m && m[4]!.trim()) out.push({ line, text: m[4]!.trim(), done: m[2] !== " " });
  });
  return out;
}

/** Tick or untick the checklist item on `line`. Other lines are untouched. */
export function toggleChecklist(body: string, line: number): string {
  const lines = body.split("\n");
  const m = CHECK.exec(lines[line] ?? "");
  if (!m) return body;
  lines[line] = `${m[1]}${m[2] === " " ? "x" : " "}${m[3]}${m[4]}`;
  return lines.join("\n");
}

/** Markdown markers removed, for previews and search snippets. */
export function plain(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*[-*] \[[ xX]\] /, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .trim();
}

const onlyTags = (l: string) => l.split(/\s+/).every((w) => /^#[\p{L}\p{N}_/-]+$/u.test(w));

/** First line worth showing under the title in a list (a line of just #tags is skipped). */
export function preview(body: string, max = 120): string {
  const line = body.split("\n").map(plain).find((l) => l.length > 0 && !onlyTags(l)) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A title for a note written without one: its first line. */
export function titleFromBody(body: string): string {
  return preview(body, 60) || "Untitled";
}
