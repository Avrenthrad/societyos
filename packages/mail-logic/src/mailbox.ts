import { baseSubject } from "./address.js";
import { inFolder, matchesQuery, parseQuery } from "./search.js";
import type { Address, Draft, FolderId, Location, MailMessage, MailState, Tab } from "./types.js";

/**
 * Everything the screens need from a mailbox, as pure functions: which
 * threads a view shows, unread counts, and changes (archive, star, snooze,
 * labels, send). Each change is an `Op` so the same thing can be written back
 * to Outlook or Gmail by a provider.
 */

export interface View {
  folder: FolderId;
  /** Only this account (unified inbox when unset). */
  accountId?: string;
  /** A label view instead of a folder. */
  labelId?: string;
  /** Inbox only: Focused or Other. */
  tab?: Tab;
  query?: string;
}

export interface ThreadSummary {
  id: string;
  subject: string;
  /** Messages shown when the thread is opened, oldest first. */
  messages: MailMessage[];
  /** Newest message that put the thread in this view. */
  latest: MailMessage;
  /** People in the thread, senders first. */
  participants: Address[];
  unread: boolean;
  starred: boolean;
  labels: string[];
  hasAttachments: boolean;
  snoozedUntil?: string;
  accountIds: string[];
  tab: Tab;
}

const NEWSLETTER = /(^|[._-])(no-?reply|do-?not-?reply|newsletter|news|notifications?|notify|marketing|updates|mailer|digest|promo|offers)([._-]|@)/i;

export interface TabOptions {
  /** Emails of people in People: always Focused. */
  knownEmails?: Set<string>;
}

/** Focused or Other, the way Outlook splits an inbox. */
export function tabFor(state: MailState, msg: MailMessage, opts: TabOptions = {}): Tab {
  const email = msg.from.email.toLowerCase();
  const override = state.tabOverrides[email];
  if (override) return override;
  if (opts.knownEmails?.has(email)) return "focused";
  if (state.accounts.some((a) => a.email.toLowerCase() === email)) return "focused";
  if (msg.listUnsubscribe || NEWSLETTER.test(email)) return "other";
  return "focused";
}

function groupThreads(messages: MailMessage[]) {
  const byThread = new Map<string, MailMessage[]>();
  for (const m of messages) {
    const list = byThread.get(m.threadId);
    if (list) list.push(m);
    else byThread.set(m.threadId, [m]);
  }
  return byThread;
}

const byDate = (a: MailMessage, b: MailMessage) => a.date.localeCompare(b.date);

export function listThreads(state: MailState, view: View, now: Date = new Date(), opts: TabOptions = {}): ThreadSummary[] {
  const q = view.query?.trim() ? parseQuery(view.query) : undefined;
  // A search looks through everything except bin and spam, unless it names a folder.
  const folder: FolderId = q ? (q.folder ?? "all") : view.folder;
  const binView = folder === "trash" || folder === "spam";
  const out: ThreadSummary[] = [];

  for (const [id, all] of groupThreads(state.messages)) {
    const scoped = view.accountId ? all.filter((m) => m.accountId === view.accountId) : all;
    const members = scoped.filter((m) => {
      if (view.labelId && !q) return m.labels.includes(view.labelId) && inFolder(m, "all", now);
      if (!inFolder(m, folder, now)) return false;
      return !q || matchesQuery(q, m, state, now);
    });
    if (!members.length) continue;

    const shown = scoped
      .filter((m) => (binView ? m.location === folder : m.location !== "trash" && m.location !== "spam"))
      .filter((m) => folder === "drafts" || m.location !== "drafts" || members.includes(m))
      .sort(byDate);
    members.sort(byDate);
    const latest = members[members.length - 1]!;
    const tab: Tab = members.some((m) => tabFor(state, m, opts) === "focused") ? "focused" : "other";
    if (folder === "inbox" && view.tab && !q && tab !== view.tab) continue;

    const participants: Address[] = [];
    for (const m of [...shown].reverse()) {
      if (!participants.some((p) => p.email === m.from.email)) participants.push(m.from);
    }
    const snoozes = members.map((m) => m.snoozedUntil).filter((s): s is string => !!s && new Date(s) > now);
    out.push({
      id,
      subject: baseSubject(latest.subject) || "(no subject)",
      messages: shown.length ? shown : members,
      latest,
      participants,
      unread: shown.some((m) => !m.read),
      starred: shown.some((m) => m.starred),
      labels: [...new Set(shown.flatMap((m) => m.labels))],
      hasAttachments: shown.some((m) => m.attachments.length > 0),
      snoozedUntil: snoozes.sort()[0],
      accountIds: [...new Set(shown.map((m) => m.accountId))],
      tab,
    });
  }
  return out.sort((a, b) => b.latest.date.localeCompare(a.latest.date));
}

export interface Counts {
  inbox: number;
  focused: number;
  other: number;
  starred: number;
  snoozed: number;
  drafts: number;
  spam: number;
  labels: Record<string, number>;
}

/** Unread thread counts for the sidebar (drafts: how many). */
export function folderCounts(state: MailState, now: Date = new Date(), opts: TabOptions = {}, accountId?: string): Counts {
  const unread = (v: View) => listThreads(state, { ...v, accountId }, now, opts).filter((t) => t.unread).length;
  const inbox = listThreads(state, { folder: "inbox", accountId }, now, opts);
  const labels: Record<string, number> = {};
  for (const l of state.labels) labels[l.id] = unread({ folder: "all", labelId: l.id });
  return {
    inbox: inbox.filter((t) => t.unread).length,
    focused: inbox.filter((t) => t.unread && t.tab === "focused").length,
    other: inbox.filter((t) => t.unread && t.tab === "other").length,
    starred: unread({ folder: "starred" }),
    snoozed: listThreads(state, { folder: "snoozed", accountId }, now, opts).length,
    drafts: listThreads(state, { folder: "drafts", accountId }, now, opts).length,
    spam: unread({ folder: "spam" }),
    labels,
  };
}

// ---- Changes -------------------------------------------------------------

export type Op =
  | { kind: "read"; ids: string[]; read: boolean }
  | { kind: "star"; ids: string[]; starred: boolean }
  | { kind: "move"; ids: string[]; to: Location }
  | { kind: "label"; ids: string[]; labelId: string; on: boolean }
  | { kind: "snooze"; ids: string[]; until?: string }
  | { kind: "delete"; ids: string[] };

export function applyOp(state: MailState, op: Op): MailState {
  const ids = new Set(op.ids);
  if (op.kind === "delete") return { ...state, messages: state.messages.filter((m) => !ids.has(m.id)) };
  return {
    ...state,
    messages: state.messages.map((m) => {
      if (!ids.has(m.id)) return m;
      switch (op.kind) {
        case "read":
          return { ...m, read: op.read };
        case "star":
          return { ...m, starred: op.starred };
        case "move":
          return { ...m, location: op.to, snoozedUntil: undefined };
        case "label":
          return { ...m, labels: op.on ? [...new Set([...m.labels, op.labelId])] : m.labels.filter((l) => l !== op.labelId) };
        case "snooze":
          return { ...m, snoozedUntil: op.until };
      }
    }),
  };
}

function inThreads(state: MailState, threadIds: string[], pick: (m: MailMessage) => boolean = () => true) {
  const set = new Set(threadIds);
  return state.messages.filter((m) => set.has(m.threadId) && pick(m)).map((m) => m.id);
}

const live = (m: MailMessage) => m.location !== "trash" && m.location !== "spam" && m.location !== "drafts";

/** Thread-level actions, each as the ops it takes. */
export const threadOps = {
  markRead: (s: MailState, t: string[], read = true): Op[] => [{ kind: "read", ids: inThreads(s, t, (m) => m.read !== read), read }],
  star: (s: MailState, t: string[], starred: boolean): Op[] => {
    if (!starred) return [{ kind: "star", ids: inThreads(s, t, (m) => m.starred), starred }];
    // Star the newest message, like Gmail.
    const latest = t.flatMap((id) => {
      const ms = s.messages.filter((m) => m.threadId === id && live(m)).sort(byDate);
      return ms.length ? [ms[ms.length - 1]!.id] : [];
    });
    return [{ kind: "star", ids: latest, starred }];
  },
  archive: (s: MailState, t: string[]): Op[] => [{ kind: "move", ids: inThreads(s, t, (m) => m.location === "inbox"), to: "archive" }],
  /** Back to the inbox; your own messages go back to Sent. */
  toInbox: (s: MailState, t: string[]): Op[] => {
    const mine = new Set(s.accounts.map((a) => a.email.toLowerCase()));
    const out = (m: MailMessage) => ["archive", "spam", "trash"].includes(m.location);
    return [
      { kind: "move", ids: inThreads(s, t, (m) => out(m) && !mine.has(m.from.email.toLowerCase())), to: "inbox" },
      { kind: "move", ids: inThreads(s, t, (m) => out(m) && mine.has(m.from.email.toLowerCase())), to: "sent" },
    ];
  },
  trash: (s: MailState, t: string[]): Op[] => [
    { kind: "move", ids: inThreads(s, t, (m) => m.location !== "drafts" && m.location !== "trash"), to: "trash" },
    { kind: "delete", ids: inThreads(s, t, (m) => m.location === "drafts") },
  ],
  spam: (s: MailState, t: string[]): Op[] => [{ kind: "move", ids: inThreads(s, t, (m) => m.location === "inbox" || m.location === "archive"), to: "spam" }],
  deleteForever: (s: MailState, t: string[]): Op[] => [{ kind: "delete", ids: inThreads(s, t, (m) => m.location === "trash" || m.location === "spam") }],
  snooze: (s: MailState, t: string[], until: Date): Op[] => [{ kind: "snooze", ids: inThreads(s, t, (m) => m.location === "inbox"), until: until.toISOString() }],
  unsnooze: (s: MailState, t: string[]): Op[] => [{ kind: "snooze", ids: inThreads(s, t, (m) => !!m.snoozedUntil), until: undefined }],
  label: (s: MailState, t: string[], labelId: string, on: boolean): Op[] => [
    { kind: "label", ids: inThreads(s, t, (m) => live(m) || m.location === "sent"), labelId, on },
  ],
};

export function applyOps(state: MailState, ops: Op[]): MailState {
  return ops.filter((o) => o.ids.length).reduce(applyOp, state);
}

/** Snoozed mail whose time has come: back to the top of the inbox, unread. */
export function wakeSnoozed(state: MailState, now: Date = new Date()): MailState | undefined {
  const due = state.messages.filter((m) => m.snoozedUntil && new Date(m.snoozedUntil) <= now);
  if (!due.length) return undefined;
  const ids = new Set(due.map((m) => m.id));
  return {
    ...state,
    messages: state.messages.map((m) => (ids.has(m.id) ? { ...m, snoozedUntil: undefined, read: false, date: m.snoozedUntil! } : m)),
  };
}

/** Snooze presets: later today, tomorrow morning, this weekend, next week. */
export function snoozeOptions(now: Date = new Date()): { label: string; until: Date }[] {
  const at = (d: number, h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, 0);
  const out: { label: string; until: Date }[] = [];
  const later = new Date(now.getTime() + 3 * 3_600_000);
  if (later.getDate() === now.getDate() && later.getHours() < 21) {
    out.push({ label: "Later today", until: new Date(later.getFullYear(), later.getMonth(), later.getDate(), later.getHours(), 0) });
  }
  out.push({ label: "Tomorrow", until: at(1, 8) });
  const dow = now.getDay();
  if (dow >= 1 && dow <= 4) out.push({ label: "This weekend", until: at(6 - dow, 9) });
  out.push({ label: "Next week", until: at(((8 - dow) % 7) || 7, 8) });
  return out;
}

export function setTab(state: MailState, email: string, tab: Tab): MailState {
  return { ...state, tabOverrides: { ...state.tabOverrides, [email.toLowerCase()]: tab } };
}

export function createLabel(state: MailState, name: string, color: string, id: string = globalThis.crypto.randomUUID()): MailState {
  if (state.labels.some((l) => l.name.toLowerCase() === name.trim().toLowerCase())) return state;
  return { ...state, labels: [...state.labels, { id, name: name.trim(), color }] };
}

// ---- Compose -------------------------------------------------------------

function draftToMessage(state: MailState, d: Draft, location: Location, now: Date): MailMessage {
  const account = state.accounts.find((a) => a.id === d.accountId);
  const from: Address = account ? { name: account.name, email: account.email } : { email: "me" };
  return {
    id: d.id,
    accountId: d.accountId,
    threadId: d.threadId ?? d.id,
    from,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    body: d.body,
    date: now.toISOString(),
    read: true,
    starred: false,
    location,
    labels: [],
    attachments: [],
    messageIdHeader: `<${d.id}@societyos>`,
  };
}

export function saveDraft(state: MailState, d: Draft, now: Date = new Date()): MailState {
  const msg = draftToMessage(state, d, "drafts", now);
  return { ...state, messages: [...state.messages.filter((m) => m.id !== d.id), msg] };
}

export function discardDraft(state: MailState, draftId: string): MailState {
  return { ...state, messages: state.messages.filter((m) => !(m.id === draftId && m.location === "drafts")) };
}

/** Put a sent message in Sent (and its thread), replacing its draft. */
export function recordSent(state: MailState, d: Draft, now: Date = new Date()): MailState {
  const msg = draftToMessage(state, d, "sent", now);
  return { ...state, messages: [...state.messages.filter((m) => m.id !== d.id), msg] };
}

export function draftFromMessage(m: MailMessage): Draft {
  return {
    id: m.id,
    accountId: m.accountId,
    to: m.to,
    cc: m.cc,
    bcc: m.bcc ?? [],
    subject: m.subject,
    body: m.body,
    threadId: m.threadId === m.id ? undefined : m.threadId,
  };
}

const quote = (m: MailMessage) => {
  const when = new Date(m.date).toLocaleString();
  const who = m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email;
  return `\n\nOn ${when}, ${who} wrote:\n${m.body.split("\n").map((l) => `> ${l}`).join("\n")}`;
};

/** A reply, reply-all or forward, ready to edit. */
export function replyDraft(
  state: MailState,
  m: MailMessage,
  mode: "reply" | "replyAll" | "forward",
  id: string = globalThis.crypto.randomUUID(),
): Draft {
  const account = state.accounts.find((a) => a.id === m.accountId);
  const me = account?.email.toLowerCase();
  const fromMe = m.from.email.toLowerCase() === me;
  const notMe = (a: Address) => a.email.toLowerCase() !== me;
  let to: Address[] = [];
  let cc: Address[] = [];
  if (mode === "reply") to = fromMe ? m.to : [m.from];
  if (mode === "replyAll") {
    to = fromMe ? m.to : [m.from, ...m.to.filter(notMe)];
    cc = m.cc.filter(notMe);
  }
  const subj = baseSubject(m.subject);
  const sig = state.signature ? `\n\n${state.signature}` : "";
  return {
    id,
    accountId: m.accountId,
    to,
    cc,
    bcc: [],
    subject: mode === "forward" ? `Fwd: ${subj}` : `Re: ${subj}`,
    body: mode === "forward" ? `${sig}\n\n---------- Forwarded message ----------\nFrom: ${m.from.name ?? ""} <${m.from.email}>\nSubject: ${m.subject}\n\n${m.body}` : `${sig}${quote(m)}`,
    threadId: mode === "forward" ? undefined : m.threadId,
    inReplyTo: mode === "forward" ? undefined : m.messageIdHeader,
  };
}

/**
 * Merge a page of mail from a provider. Matches on `remoteId`, keeps what is
 * only stored here (snooze), and leaves other accounts alone.
 */
export function mergeRemote(state: MailState, accountId: string, incoming: MailMessage[]): MailState {
  const existing = new Map(state.messages.filter((m) => m.accountId === accountId && m.remoteId).map((m) => [m.remoteId!, m]));
  const merged = new Map<string, MailMessage>();
  for (const m of incoming) {
    const old = existing.get(m.remoteId!);
    merged.set(m.remoteId!, old ? { ...m, id: old.id, snoozedUntil: old.snoozedUntil } : m);
  }
  const kept = state.messages.filter((m) => !(m.accountId === accountId && m.remoteId && merged.has(m.remoteId)));
  return { ...state, messages: [...kept, ...merged.values()] };
}

/** The ops that undo `ops`, worked out from the state before they ran. Deletes can't be undone remotely and are skipped. */
export function inverseOps(before: MailState, ops: Op[]): Op[] {
  const byId = new Map(before.messages.map((m) => [m.id, m]));
  const out: Op[] = [];
  const grouped = <K extends string | boolean | undefined>(ids: string[], key: (m: MailMessage) => K, make: (k: K, ids: string[]) => Op) => {
    const groups = new Map<K, string[]>();
    for (const id of ids) {
      const m = byId.get(id);
      if (!m) continue;
      const k = key(m);
      groups.set(k, [...(groups.get(k) ?? []), id]);
    }
    for (const [k, g] of groups) out.push(make(k, g));
  };
  for (const op of [...ops].reverse()) {
    switch (op.kind) {
      case "read":
        grouped(op.ids, (m) => m.read, (read, ids) => ({ kind: "read", ids, read }));
        break;
      case "star":
        grouped(op.ids, (m) => m.starred, (starred, ids) => ({ kind: "star", ids, starred }));
        break;
      case "move":
        grouped(op.ids, (m) => m.location, (to, ids) => ({ kind: "move", ids, to }));
        grouped(op.ids.filter((id) => byId.get(id)?.snoozedUntil), (m) => m.snoozedUntil, (until, ids) => ({ kind: "snooze", ids, until }));
        break;
      case "label":
        grouped(op.ids, (m) => m.labels.includes(op.labelId), (on, ids) => ({ kind: "label", ids, labelId: op.labelId, on }));
        break;
      case "snooze":
        grouped(op.ids, (m) => m.snoozedUntil, (until, ids) => ({ kind: "snooze", ids, until }));
        break;
      case "delete":
        break;
    }
  }
  return out;
}
