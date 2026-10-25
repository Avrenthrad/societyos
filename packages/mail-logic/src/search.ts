import type { FolderId, MailMessage, MailState } from "./types.js";

/**
 * Search the way Gmail and Outlook people already type it:
 *   from:sam  to:me  subject:invoice  "exact phrase"  -word
 *   is:unread  is:read  is:starred  is:snoozed  has:attachment
 *   in:sent  label:work  before:2026-11-01  after:2026-10-01  account:work
 * Plain words must all appear somewhere (sender, recipients, subject, body,
 * attachment names). Case does not matter.
 */

export interface Term {
  field: "text" | "from" | "to" | "subject" | "is" | "has" | "in" | "label" | "before" | "after" | "account";
  value: string;
  negate: boolean;
}

export interface Query {
  terms: Term[];
  /** The `in:` folder if one was given, so search can look outside the inbox. */
  folder?: FolderId;
}

const FIELDS = new Set(["from", "to", "subject", "is", "has", "in", "label", "before", "after", "account"]);
const FOLDERS = new Set(["inbox", "starred", "snoozed", "sent", "drafts", "archive", "spam", "trash", "all"]);

export function parseQuery(input: string): Query {
  const terms: Term[] = [];
  const re = /(-)?(?:(\w+):)?(?:"([^"]*)"|(\S+))/g;
  for (let m = re.exec(input); m; m = re.exec(input)) {
    const negate = !!m[1];
    let field = m[2]?.toLowerCase();
    let value = (m[3] ?? m[4] ?? "").toLowerCase();
    if (field && !FIELDS.has(field)) {
      // "re:thing" or a URL: treat the whole thing as text.
      value = `${field}:${value}`;
      field = undefined;
    }
    if (!value) continue;
    terms.push({ field: (field ?? "text") as Term["field"], value, negate });
  }
  const inTerm = terms.find((t) => t.field === "in" && !t.negate && FOLDERS.has(t.value));
  return { terms, folder: inTerm?.value as FolderId | undefined };
}

const addr = (a: { name?: string; email: string }) => `${a.name ?? ""} ${a.email}`.toLowerCase();

function dayValue(s: string): number | undefined {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

function matchTerm(t: Term, msg: MailMessage, state: MailState, now: Date): boolean {
  const v = t.value;
  switch (t.field) {
    case "from":
      return addr(msg.from).includes(v);
    case "to":
      return [...msg.to, ...msg.cc, ...(msg.bcc ?? [])].some((a) => addr(a).includes(v));
    case "subject":
      return msg.subject.toLowerCase().includes(v);
    case "is":
      if (v === "unread") return !msg.read;
      if (v === "read") return msg.read;
      if (v === "starred") return msg.starred;
      if (v === "snoozed") return !!msg.snoozedUntil && new Date(msg.snoozedUntil) > now;
      return false;
    case "has":
      return v.startsWith("attach") ? msg.attachments.length > 0 : false;
    case "in":
      return inFolder(msg, v as FolderId, now);
    case "label": {
      const ids = state.labels.filter((l) => l.name.toLowerCase().includes(v)).map((l) => l.id);
      return msg.labels.some((id) => ids.includes(id));
    }
    case "account": {
      const acc = state.accounts.find((a) => a.id === msg.accountId);
      return !!acc && (acc.name.toLowerCase().includes(v) || acc.email.toLowerCase().includes(v));
    }
    case "before": {
      const d = dayValue(v);
      return d !== undefined && new Date(msg.date).getTime() < d;
    }
    case "after": {
      const d = dayValue(v);
      return d !== undefined && new Date(msg.date).getTime() >= d;
    }
    case "text": {
      const hay = [addr(msg.from), ...msg.to.map(addr), ...msg.cc.map(addr), msg.subject, msg.body, ...msg.attachments.map((a) => a.name)]
        .join(" ")
        .toLowerCase();
      return hay.includes(v);
    }
  }
}

export function matchesQuery(q: Query, msg: MailMessage, state: MailState, now: Date = new Date()): boolean {
  return q.terms.every((t) => matchTerm(t, msg, state, now) !== t.negate);
}

/** Which folders a single message shows in. */
export function inFolder(msg: MailMessage, folder: FolderId, now: Date = new Date()): boolean {
  const snoozed = !!msg.snoozedUntil && new Date(msg.snoozedUntil) > now;
  const binned = msg.location === "trash" || msg.location === "spam";
  switch (folder) {
    case "inbox":
      return msg.location === "inbox" && !snoozed;
    case "starred":
      return msg.starred && !binned;
    case "snoozed":
      return snoozed && !binned;
    case "all":
      return !binned && msg.location !== "drafts";
    default:
      return msg.location === folder;
  }
}
