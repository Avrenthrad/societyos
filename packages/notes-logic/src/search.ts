import type { Entity, EntityType } from "@societyos/core";
import type { Store } from "@societyos/sync";
import { plain } from "./parse.js";

export interface Hit {
  entity: Entity;
  /** What to show as the result's name. */
  title: string;
  /** The line the match was found on, for context. */
  snippet: string;
  /** Which app it lives in, for the label. */
  app: "Notes" | "Today" | "People" | "Inbox" | "Finance" | "Places" | "Files";
  score: number;
}

type Source = { type: EntityType; app: Hit["app"]; title: (e: any) => string; text: (e: any) => (string | undefined)[] };

/** What can be searched in each app, and how it is named in results. */
const SOURCES: Source[] = [
  { type: "note", app: "Notes", title: (e) => e.title || "Untitled", text: (e) => [e.body, ...e.tags.map((t: string) => `#${t}`)] },
  { type: "task", app: "Today", title: (e) => e.title, text: (e) => [e.notes] },
  { type: "event", app: "Today", title: (e) => e.title, text: (e) => [e.location] },
  { type: "person", app: "People", title: (e) => e.name, text: (e) => [...e.emails, ...e.phones, e.notes] },
  { type: "message", app: "Inbox", title: (e) => e.subject || "Message", text: (e) => [e.body] },
  { type: "transaction", app: "Finance", title: (e) => e.description, text: (e) => [e.category] },
  { type: "place", app: "Places", title: (e) => e.name, text: (e) => [e.address] },
  { type: "file", app: "Files", title: (e) => e.name, text: () => [] },
];

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

/** How well `text` matches one word: whole word > start of a word > inside a word. */
function wordScore(text: string, w: string): number {
  const i = text.indexOf(w);
  if (i === -1) return 0;
  const before = text[i - 1];
  const after = text[i + w.length];
  const startsWord = i === 0 || !/[\p{L}\p{N}]/u.test(before!);
  const endsWord = !after || !/[\p{L}\p{N}]/u.test(after);
  return startsWord ? (endsWord ? 3 : 2) : 1;
}

function snippetFor(lines: string[], ws: string[], max = 140): string {
  const line = lines.find((l) => ws.some((w) => l.toLowerCase().includes(w))) ?? "";
  const p = plain(line);
  if (p.length <= max) return p;
  const at = Math.max(0, p.toLowerCase().indexOf(ws[0]!) - 40);
  return `${at > 0 ? "…" : ""}${p.slice(at, at + max)}…`;
}

/**
 * Search every app at once. Every word must appear somewhere (in any
 * order); title matches and whole words rank higher, then fresher items.
 * Runs on the device, so it works offline and needs no server.
 */
export async function searchEverything(store: Store, query: string, now = new Date(), limit = 50): Promise<Hit[]> {
  const ws = words(query);
  if (!ws.length) return [];
  const hits: Hit[] = [];
  for (const src of SOURCES) {
    for (const e of await store.list(src.type)) {
      const title = src.title(e) ?? "";
      const t = title.toLowerCase();
      const body = src.text(e).filter((x): x is string => !!x).join("\n");
      const b = body.toLowerCase();
      let score = 0;
      let all = true;
      for (const w of ws) {
        const inTitle = wordScore(t, w);
        const inBody = wordScore(b, w);
        if (!inTitle && !inBody) {
          all = false;
          break;
        }
        score += inTitle ? 10 + inTitle * 2 : inBody;
      }
      if (!all) continue;
      if (t === ws.join(" ")) score += 20;
      const ageDays = (now.getTime() - new Date(e.updatedAt).getTime()) / 86_400_000;
      score += Math.max(0, 3 - ageDays / 30); // a small nudge for recent things
      hits.push({ entity: e, title, snippet: snippetFor(body.split("\n"), ws), app: src.app, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
