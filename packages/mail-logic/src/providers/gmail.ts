import { formatAddress, parseAddressList } from "../address.js";
import type { Op } from "../mailbox.js";
import type { Draft, Location, MailAccount, MailLabel, MailMessage } from "../types.js";
import { call, htmlToText, pool, type Fetch, type MailProvider } from "./provider.js";

/**
 * Gmail through the Gmail API, from the browser with a sign-in token.
 * Uses the gmail.modify scope: read, label, archive, bin and send. It
 * cannot delete for good, so "delete forever" moves to Gmail's bin, which
 * empties itself after 30 days.
 */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface Part {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate: string;
  payload?: Part;
}

export function b64urlDecode(data: string): string {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const b64 = (text: string) => b64urlEncode(text).replace(/-/g, "+").replace(/_/g, "/");

export const gmailLabelId = (id: string) => `gl:${id}`;

function locationOf(labels: string[]): Location {
  if (labels.includes("TRASH")) return "trash";
  if (labels.includes("SPAM")) return "spam";
  if (labels.includes("DRAFT")) return "drafts";
  if (labels.includes("INBOX")) return "inbox";
  if (labels.includes("SENT")) return "sent";
  return "archive";
}

function walk(p: Part | undefined, visit: (p: Part) => void) {
  if (!p) return;
  visit(p);
  for (const c of p.parts ?? []) walk(c, visit);
}

export function fromGmail(g: GmailMessage, accountId: string): MailMessage {
  const headers = new Map((g.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  let text = "";
  let html = "";
  const attachments: MailMessage["attachments"] = [];
  walk(g.payload, (p) => {
    if (p.filename && p.body?.attachmentId) {
      attachments.push({ id: p.body.attachmentId, name: p.filename, mimeType: p.mimeType ?? "application/octet-stream", sizeBytes: p.body.size ?? 0 });
    } else if (p.mimeType === "text/plain" && p.body?.data && !text) text = b64urlDecode(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = b64urlDecode(p.body.data);
  });
  const labels = g.labelIds ?? [];
  const from = parseAddressList(headers.get("from") ?? "")[0] ?? { email: "unknown" };
  return {
    id: `${accountId}:${g.id}`,
    accountId,
    remoteId: g.id,
    threadId: `${accountId}:${g.threadId}`,
    from,
    to: parseAddressList(headers.get("to") ?? ""),
    cc: parseAddressList(headers.get("cc") ?? ""),
    subject: headers.get("subject") ?? "",
    body: text || htmlToText(html),
    html: html || undefined,
    date: new Date(Number(g.internalDate)).toISOString(),
    read: !labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    location: locationOf(labels),
    labels: labels.filter((l) => l.startsWith("Label_")).map(gmailLabelId),
    attachments,
    listUnsubscribe: headers.get("list-unsubscribe"),
    messageIdHeader: headers.get("message-id"),
  };
}

const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** An RFC 5322 message for Gmail's send endpoint. */
export function buildRaw(from: { name?: string; email: string }, d: Draft, replyTo?: MailMessage): string {
  const lines = [
    `From: ${formatAddress(from)}`,
    `To: ${d.to.map(formatAddress).join(", ")}`,
    d.cc.length ? `Cc: ${d.cc.map(formatAddress).join(", ")}` : "",
    d.bcc.length ? `Bcc: ${d.bcc.map(formatAddress).join(", ")}` : "",
    `Subject: ${encodeHeader(d.subject)}`,
    replyTo?.messageIdHeader ? `In-Reply-To: ${replyTo.messageIdHeader}` : "",
    replyTo?.messageIdHeader ? `References: ${replyTo.messageIdHeader}` : "",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  const body = (b64(d.body).match(/.{1,76}/g) ?? []).join("\r\n");
  return b64urlEncode(`${lines.join("\r\n")}\r\n\r\n${body}`);
}

export class GmailProvider implements MailProvider {
  kind = "gmail" as const;
  constructor(
    private token: () => Promise<string>,
    private f: Fetch = fetch,
  ) {}

  private async req<T>(path: string, init: RequestInit = {}) {
    return call<T>(this.f, "Gmail", await this.token(), `${API}${path}`, init);
  }

  async profile() {
    const p = await this.req<{ emailAddress: string }>("/profile");
    return { email: p.emailAddress.toLowerCase(), name: p.emailAddress };
  }

  async fetchLabels(): Promise<MailLabel[]> {
    const res = await this.req<{ labels: { id: string; name: string; type: string; color?: { backgroundColor?: string } }[] }>("/labels");
    return res.labels
      .filter((l) => l.type === "user")
      .map((l) => ({ id: gmailLabelId(l.id), name: l.name, color: l.color?.backgroundColor ?? "#546E7A" }));
  }

  async fetchRecent(account: MailAccount, opts: { perFolder?: number } = {}) {
    const max = (opts.perFolder ?? 50) * 2;
    const list = await this.req<{ messages?: { id: string }[] }>(`/messages?maxResults=${max}&includeSpamTrash=true`);
    const full = await pool(list.messages ?? [], 6, (m) => this.req<GmailMessage>(`/messages/${m.id}?format=full`));
    return full.map((g) => fromGmail(g, account.id));
  }

  async send(account: MailAccount, d: Draft, replyTo?: MailMessage) {
    const raw = buildRaw({ name: account.name, email: account.email }, d, replyTo);
    const threadId = replyTo?.threadId.split(":").slice(1).join(":");
    await this.req("/messages/send", { method: "POST", body: JSON.stringify(threadId ? { raw, threadId } : { raw }) });
  }

  async apply(op: Op, messages: MailMessage[]) {
    const remote = messages.filter((m) => m.remoteId);
    const modify = (m: MailMessage, add: string[], remove: string[]) =>
      this.req(`/messages/${m.remoteId}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }) });
    const untrash = (m: MailMessage) => (m.location === "trash" ? this.req(`/messages/${m.remoteId}/untrash`, { method: "POST" }) : undefined);
    await pool(remote, 4, async (m) => {
      switch (op.kind) {
        case "read":
          return op.read ? modify(m, [], ["UNREAD"]) : modify(m, ["UNREAD"], []);
        case "star":
          return op.starred ? modify(m, ["STARRED"], []) : modify(m, [], ["STARRED"]);
        case "label":
          if (!op.labelId.startsWith("gl:")) return;
          return op.on ? modify(m, [op.labelId.slice(3)], []) : modify(m, [], [op.labelId.slice(3)]);
        case "move":
          switch (op.to) {
            case "trash":
              return this.req(`/messages/${m.remoteId}/trash`, { method: "POST" });
            case "inbox":
              await untrash(m);
              return modify(m, ["INBOX"], ["SPAM"]);
            case "archive":
              await untrash(m);
              return modify(m, [], ["INBOX", "SPAM"]);
            case "spam":
              return modify(m, ["SPAM"], ["INBOX"]);
            case "sent":
              await untrash(m);
              return modify(m, [], ["SPAM"]);
            default:
              return;
          }
        case "delete":
          // gmail.modify can't delete for good: bin it (Gmail empties the bin after 30 days).
          return m.location === "trash" ? undefined : this.req(`/messages/${m.remoteId}/trash`, { method: "POST" });
        case "snooze":
          return; // kept in SocietyOS; the Gmail API has no snooze
      }
    });
  }
}
