import type { Op } from "../mailbox.js";
import type { Address, Draft, Location, MailAccount, MailLabel, MailMessage } from "../types.js";
import { call, htmlToText, pool, type Fetch, type MailProvider } from "./provider.js";

/**
 * Outlook, Hotmail and Microsoft 365 through Microsoft Graph.
 * Runs in the browser with a sign-in token; no server needed.
 * Ids are requested as immutable so they survive moving between folders.
 */

const API = "https://graph.microsoft.com/v1.0";
const FOLDERS: [string, Location][] = [
  ["inbox", "inbox"],
  ["sentitems", "sent"],
  ["drafts", "drafts"],
  ["archive", "archive"],
  ["junkemail", "spam"],
  ["deleteditems", "trash"],
];
const DEST: Record<Location, string> = {
  inbox: "inbox",
  sent: "sentitems",
  drafts: "drafts",
  archive: "archive",
  spam: "junkemail",
  trash: "deleteditems",
};
const SELECT =
  "id,conversationId,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,isRead,flag,body,categories,internetMessageId";

interface GAddr {
  emailAddress?: { name?: string; address?: string };
}
export interface GraphMessage {
  id: string;
  conversationId: string;
  subject?: string;
  from?: GAddr;
  toRecipients?: GAddr[];
  ccRecipients?: GAddr[];
  bccRecipients?: GAddr[];
  receivedDateTime: string;
  isRead: boolean;
  flag?: { flagStatus?: string };
  body?: { contentType?: string; content?: string };
  categories?: string[];
  internetMessageId?: string;
  attachments?: { id: string; name: string; contentType?: string; size?: number }[];
}

const addr = (a?: GAddr): Address => ({
  email: (a?.emailAddress?.address ?? "unknown").toLowerCase(),
  ...(a?.emailAddress?.name ? { name: a.emailAddress.name } : {}),
});
const toG = (a: Address) => ({ emailAddress: { address: a.email, ...(a.name ? { name: a.name } : {}) } });
export const categoryLabelId = (name: string) => `cat:${name}`;

export function fromGraph(g: GraphMessage, accountId: string, location: Location): MailMessage {
  const isHtml = g.body?.contentType?.toLowerCase() === "html";
  const content = g.body?.content ?? "";
  return {
    id: `${accountId}:${g.id}`,
    accountId,
    remoteId: g.id,
    threadId: `${accountId}:${g.conversationId}`,
    from: addr(g.from),
    to: (g.toRecipients ?? []).map(addr),
    cc: (g.ccRecipients ?? []).map(addr),
    bcc: (g.bccRecipients ?? []).map(addr),
    subject: g.subject ?? "",
    body: isHtml ? htmlToText(content) : content,
    html: isHtml ? content : undefined,
    date: g.receivedDateTime,
    read: g.isRead,
    starred: g.flag?.flagStatus === "flagged",
    location,
    labels: (g.categories ?? []).map(categoryLabelId),
    attachments: (g.attachments ?? []).map((a) => ({ id: a.id, name: a.name, mimeType: a.contentType ?? "application/octet-stream", sizeBytes: a.size ?? 0 })),
    messageIdHeader: g.internetMessageId,
  };
}

/** Cut our own "On ... wrote:" quote; Outlook adds its own when replying. */
const withoutQuote = (body: string) => body.replace(/\n\nOn [^\n]*wrote:\n[\s\S]*$/, "").trimEnd();

export class GraphProvider implements MailProvider {
  kind = "outlook" as const;
  constructor(
    private token: () => Promise<string>,
    private f: Fetch = fetch,
  ) {}

  private async req<T>(path: string, init: RequestInit = {}) {
    return call<T>(this.f, "Outlook", await this.token(), `${API}${path}`, {
      ...init,
      headers: { Prefer: 'IdType="ImmutableId"', ...(init.headers ?? {}) },
    });
  }

  async profile() {
    const me = await this.req<{ mail?: string; userPrincipalName: string; displayName?: string }>("/me?$select=mail,userPrincipalName,displayName");
    const email = (me.mail ?? me.userPrincipalName).toLowerCase();
    return { email, name: me.displayName ?? email };
  }

  async fetchLabels(): Promise<MailLabel[]> {
    const res = await this.req<{ value: { displayName: string }[] }>("/me/outlook/masterCategories");
    return res.value.map((c) => ({ id: categoryLabelId(c.displayName), name: c.displayName, color: "#546E7A" }));
  }

  async fetchRecent(account: MailAccount, opts: { perFolder?: number } = {}) {
    const top = opts.perFolder ?? 50;
    const pages = await pool(FOLDERS, 3, async ([folder, location]) => {
      try {
        const res = await this.req<{ value: GraphMessage[] }>(
          `/me/mailFolders/${folder}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${SELECT}&$expand=attachments($select=id,name,contentType,size)`,
        );
        return res.value.map((g) => fromGraph(g, account.id, location));
      } catch (e) {
        // Some accounts have no Archive folder.
        if (folder === "archive" && e instanceof Error && / 404/.test(e.message)) return [];
        throw e;
      }
    });
    return pages.flat();
  }

  async send(_account: MailAccount, d: Draft, replyTo?: MailMessage) {
    const recipients = { toRecipients: d.to.map(toG), ccRecipients: d.cc.map(toG), bccRecipients: d.bcc.map(toG) };
    if (replyTo?.remoteId) {
      await this.req(`/me/messages/${encodeURIComponent(replyTo.remoteId)}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: recipients, comment: withoutQuote(d.body) }),
      });
      return;
    }
    await this.req("/me/sendMail", {
      method: "POST",
      body: JSON.stringify({ message: { subject: d.subject, body: { contentType: "Text", content: d.body }, ...recipients }, saveToSentItems: true }),
    });
  }

  async apply(op: Op, messages: MailMessage[]) {
    const remote = messages.filter((m) => m.remoteId);
    const path = (m: MailMessage) => `/me/messages/${encodeURIComponent(m.remoteId!)}`;
    await pool(remote, 4, async (m) => {
      switch (op.kind) {
        case "read":
          return this.req(path(m), { method: "PATCH", body: JSON.stringify({ isRead: op.read }) });
        case "star":
          return this.req(path(m), { method: "PATCH", body: JSON.stringify({ flag: { flagStatus: op.starred ? "flagged" : "notFlagged" } }) });
        case "move":
          return this.req(`${path(m)}/move`, { method: "POST", body: JSON.stringify({ destinationId: DEST[op.to] }) });
        case "label": {
          if (!op.labelId.startsWith("cat:")) return;
          const names = m.labels.filter((l) => l.startsWith("cat:")).map((l) => l.slice(4));
          const name = op.labelId.slice(4);
          const next = op.on ? [...new Set([...names, name])] : names.filter((n) => n !== name);
          return this.req(path(m), { method: "PATCH", body: JSON.stringify({ categories: next }) });
        }
        case "delete":
          return this.req(path(m), { method: "DELETE" });
        case "snooze":
          return; // kept in SocietyOS; Outlook has no snooze API
      }
    });
  }
}
