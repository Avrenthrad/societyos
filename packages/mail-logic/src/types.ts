/**
 * The Inbox app's own mail model.
 *
 * A mailbox holds far more than any other app needs (every newsletter,
 * every receipt), so mail lives here rather than in packages/core. When the
 * person turns an email into something (a task, a note, a person), Inbox
 * writes a core `Message` for it into the shared store and links to it, so
 * the other apps see just the emails that matter.
 */

export type ProviderKind = "demo" | "outlook" | "gmail" | "imap";

export interface Address {
  name?: string;
  email: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

/** Where a message is. Starred, snoozed and labels sit on top of this. */
export type Location = "inbox" | "archive" | "sent" | "drafts" | "spam" | "trash";

export interface MailMessage {
  id: string;
  accountId: string;
  threadId: string;
  /** The id at Outlook / Gmail / the IMAP server, for writing changes back. */
  remoteId?: string;
  from: Address;
  to: Address[];
  cc: Address[];
  bcc?: Address[];
  subject: string;
  /** Plain text body. */
  body: string;
  /** HTML body when the email has one. Shown sandboxed, images off by default. */
  html?: string;
  date: string;
  read: boolean;
  starred: boolean;
  location: Location;
  /** Custom label ids (Gmail labels, Outlook categories). */
  labels: string[];
  snoozedUntil?: string;
  attachments: Attachment[];
  /** A List-Unsubscribe header: a strong newsletter signal. */
  listUnsubscribe?: string;
  /** RFC 5322 Message-ID, used for In-Reply-To when replying. */
  messageIdHeader?: string;
}

export interface MailAccount {
  id: string;
  provider: ProviderKind;
  email: string;
  name: string;
  /** Hex colour, shown as a dot in the unified inbox. */
  color: string;
  lastSyncAt?: string;
  /** Last sync error, shown in settings. */
  error?: string;
}

export interface MailLabel {
  id: string;
  name: string;
  color: string;
}

/** Inbox split: Focused for people, Other for newsletters and notifications. */
export type Tab = "focused" | "other";

export interface MailState {
  version: 1;
  accounts: MailAccount[];
  labels: MailLabel[];
  messages: MailMessage[];
  /** Senders the person moved between Focused and Other. */
  tabOverrides: Record<string, Tab>;
  /** Mail message id -> shared-store Message id, once it has been turned into something. */
  shared: Record<string, string>;
  signature: string;
}

export type FolderId = "inbox" | "starred" | "snoozed" | "sent" | "drafts" | "archive" | "spam" | "trash" | "all";

export interface Draft {
  id: string;
  accountId: string;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  body: string;
  /** Set when replying or forwarding inside a thread. */
  threadId?: string;
  inReplyTo?: string;
}

export function emptyState(): MailState {
  return { version: 1, accounts: [], labels: [], messages: [], tabOverrides: {}, shared: {}, signature: "" };
}
