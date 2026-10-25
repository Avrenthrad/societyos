import type { Op } from "../mailbox.js";
import type { Draft, MailAccount, MailMessage, ProviderKind } from "../types.js";

/**
 * One mail service (Outlook, Gmail, IMAP). Inbox keeps its own copy of the
 * mail, so the app is instant and works offline; a provider pulls new mail
 * in and writes the person's changes back.
 */
export interface MailProvider {
  kind: ProviderKind;
  /** Who is signed in. */
  profile(): Promise<{ email: string; name: string }>;
  /** Recent mail from every folder that matters (inbox, sent, drafts, archive, spam, bin). */
  fetchRecent(account: MailAccount, opts?: { perFolder?: number }): Promise<MailMessage[]>;
  send(account: MailAccount, draft: Draft, replyTo?: MailMessage): Promise<void>;
  /** Write a change (read, star, move, label) back. `messages` are the ones in the op, before it applied. */
  apply(op: Op, messages: MailMessage[]): Promise<void>;
}

/** Thrown when the sign-in has expired: the app asks the person to sign in again. */
export class AuthExpiredError extends Error {
  constructor(provider: string) {
    super(`${provider} sign-in expired`);
    this.name = "AuthExpiredError";
  }
}

export type Fetch = typeof fetch;

/** JSON request with a bearer token. 401 becomes AuthExpiredError. */
export async function call<T>(f: Fetch, provider: string, token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await f(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 401) throw new AuthExpiredError(provider);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${provider} ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 202 || res.status === 204) return undefined as T;
  const body = await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

/** Run promises a few at a time so we don't trip rate limits. */
export async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Plain text from HTML, for snippets, search and the text view. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
