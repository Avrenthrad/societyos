import {
  AuthExpiredError,
  GmailProvider,
  GraphProvider,
  googleAuthUrl,
  mergeRemote,
  microsoftAuthUrl,
  microsoftRedeem,
  microsoftRefresh,
  randomString,
  readRedirect,
  type Draft,
  type MailAccount,
  type MailMessage,
  type MailProvider,
  type Op,
  type Tokens,
} from "@societyos/mail-logic";
import { Platform } from "react-native";
import { deviceStorage, mailbox } from "./store";

/**
 * Connecting real accounts. Sign-in happens in a popup that comes back to
 * this same page, so nothing secret is needed and the app keeps its place.
 * Tokens stay on this device.
 */

const kv = deviceStorage();
const AUTH_KEY = "societyos:inbox:auth";
const PENDING_KEY = "societyos:inbox:pending";
const IDS_KEY = "societyos:inbox:client-ids";

export type Connectable = "outlook" | "gmail";

interface Pending {
  provider: Connectable;
  state: string;
  verifier?: string;
  /** Re-signing in an existing account. */
  accountId?: string;
}

type AuthTable = Record<string, { provider: Connectable; tokens: Tokens }>;

const readJson = <T,>(k: string, fallback: T): T => {
  try {
    const raw = kv.getItem(k);
    return raw && typeof raw === "string" ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (k: string, v: unknown) => void kv.setItem(k, JSON.stringify(v));

/** App ids registered with Microsoft and Google. Built in, or pasted in Settings while testing. */
export function clientIds(): { outlook: string; gmail: string } {
  const saved = readJson<{ outlook?: string; gmail?: string }>(IDS_KEY, {});
  return {
    outlook: saved.outlook || process.env.EXPO_PUBLIC_MS_CLIENT_ID || "",
    gmail: saved.gmail || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "",
  };
}

export function saveClientIds(ids: { outlook?: string; gmail?: string }) {
  writeJson(IDS_KEY, { ...readJson(IDS_KEY, {}), ...ids });
}

/** This page's address, which is what gets registered as the sign-in redirect. */
export function redirectUri(): string {
  if (Platform.OS !== "web" || typeof location === "undefined") return "";
  return `${location.origin}${location.pathname.replace(/[^/]*$/, "")}`;
}

export const canConnect = () => Platform.OS === "web";

async function authUrl(p: Pending, loginHint?: string, silent = false) {
  const ids = clientIds();
  const cfg = { clientId: p.provider === "outlook" ? ids.outlook : ids.gmail, redirectUri: redirectUri() };
  if (!cfg.clientId) throw new Error(`No ${p.provider === "outlook" ? "Microsoft" : "Google"} app id yet. See Settings.`);
  return p.provider === "outlook"
    ? microsoftAuthUrl(cfg, p.state, p.verifier!, loginHint)
    : googleAuthUrl(cfg, p.state, { loginHint, silent });
}

/** Open the provider's sign-in. Resolves once the account is connected. */
export async function connect(provider: Connectable, account?: MailAccount): Promise<void> {
  const pending: Pending = { provider, state: randomString(16), verifier: provider === "outlook" ? randomString(48) : undefined, accountId: account?.id };
  writeJson(PENDING_KEY, pending);
  const url = await authUrl(pending, account?.email, !!account && provider === "gmail");
  const popup = window.open(url, "societyos-signin", "width=520,height=680");
  if (!popup) {
    // Popups blocked: go there in this tab; we finish on the way back.
    location.assign(url);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.type !== "societyos-auth") return;
      window.removeEventListener("message", onMessage);
      finishSignIn(e.data.url).then(resolve, reject);
    };
    window.addEventListener("message", onMessage);
  });
}

/**
 * Call on start. In the sign-in popup: hand the result to the main window and
 * close. In the main window after a full-page redirect: finish here.
 */
export async function handleRedirect(): Promise<"popup" | "done" | undefined> {
  if (Platform.OS !== "web" || typeof location === "undefined") return undefined;
  const r = readRedirect(location.href);
  if (!r) return undefined;
  if (window.opener && window.opener !== window) {
    window.opener.postMessage({ type: "societyos-auth", url: location.href }, location.origin);
    window.close();
    return "popup";
  }
  const href = location.href;
  history.replaceState(null, "", redirectUri());
  await finishSignIn(href);
  return "done";
}

async function finishSignIn(url: string) {
  const r = readRedirect(url);
  const pending = readJson<Pending | null>(PENDING_KEY, null);
  kv.setItem(PENDING_KEY, "null");
  if (!r || !pending || r.state !== pending.state) throw new Error("Sign-in didn't match. Please try again.");
  if (r.kind === "error") throw new Error(r.error);
  let tokens: Tokens;
  if (r.kind === "code") {
    tokens = await microsoftRedeem({ clientId: clientIds().outlook, redirectUri: redirectUri() }, r.code, pending.verifier!);
  } else {
    tokens = { accessToken: r.accessToken, expiresAt: Date.now() + r.expiresIn * 1000 };
  }
  const provider = providerFor(pending.provider, async () => tokens.accessToken);
  const me = await provider.profile();
  const existing = mailbox.state.accounts.find((a) => a.id === pending.accountId || (a.provider === pending.provider && a.email === me.email));
  const account: MailAccount = existing
    ? { ...existing, error: undefined }
    : { id: `${pending.provider}:${me.email}`, provider: pending.provider, email: me.email, name: me.name, color: pending.provider === "outlook" ? "#0F6CBD" : "#D93025" };
  const auth = readJson<AuthTable>(AUTH_KEY, {});
  auth[account.id] = { provider: pending.provider, tokens };
  writeJson(AUTH_KEY, auth);
  const s = mailbox.state;
  mailbox.set({ ...s, accounts: existing ? s.accounts.map((a) => (a.id === account.id ? account : a)) : [...s.accounts, account] });
  await syncAccount(account);
}

async function tokenFor(accountId: string): Promise<string> {
  const auth = readJson<AuthTable>(AUTH_KEY, {});
  const entry = auth[accountId];
  if (!entry) throw new AuthExpiredError(accountId);
  if (entry.tokens.expiresAt - 60_000 > Date.now()) return entry.tokens.accessToken;
  if (entry.provider === "outlook" && entry.tokens.refreshToken) {
    const tokens = await microsoftRefresh({ clientId: clientIds().outlook, redirectUri: redirectUri() }, entry.tokens.refreshToken);
    auth[accountId] = { ...entry, tokens };
    writeJson(AUTH_KEY, auth);
    return tokens.accessToken;
  }
  throw new AuthExpiredError(entry.provider);
}

function providerFor(kind: Connectable, token: () => Promise<string>): MailProvider & { fetchLabels(): Promise<{ id: string; name: string; color: string }[]> } {
  return kind === "outlook" ? new GraphProvider(token) : new GmailProvider(token);
}

function provider(account: MailAccount) {
  if (account.provider !== "outlook" && account.provider !== "gmail") return undefined;
  return providerFor(account.provider, () => tokenFor(account.id));
}

function setAccount(id: string, patch: Partial<MailAccount>) {
  const s = mailbox.state;
  mailbox.set({ ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
}

const friendly = (e: unknown) => (e instanceof AuthExpiredError ? "Sign in again" : e instanceof Error ? e.message : String(e));

export async function syncAccount(account: MailAccount) {
  const p = provider(account);
  if (!p) return;
  try {
    const [labels, messages] = await Promise.all([p.fetchLabels().catch(() => []), p.fetchRecent(account)]);
    const s = mailbox.state;
    const known = new Set(s.labels.map((l) => l.id));
    mailbox.set({
      ...mergeRemote(s, account.id, messages),
      labels: [...s.labels, ...labels.filter((l) => !known.has(l.id))],
      accounts: s.accounts.map((a) => (a.id === account.id ? { ...a, lastSyncAt: new Date().toISOString(), error: undefined } : a)),
    });
  } catch (e) {
    setAccount(account.id, { error: friendly(e) });
  }
}

export async function syncAll() {
  mailbox.wake();
  await Promise.all(mailbox.state.accounts.map(syncAccount));
}

/** Write a change back to every account it touches. Local state has already changed. */
export async function pushOps(ops: Op[], before: MailMessage[]) {
  for (const account of mailbox.state.accounts) {
    const p = provider(account);
    if (!p) continue;
    for (const op of ops) {
      const msgs = before.filter((m) => m.accountId === account.id && op.ids.includes(m.id));
      if (!msgs.length) continue;
      try {
        await p.apply(op, msgs);
      } catch (e) {
        setAccount(account.id, { error: friendly(e) });
      }
    }
  }
}

/** Send through the account's provider (sample accounts just file it in Sent). */
export async function sendDraft(d: Draft, replyTo?: MailMessage) {
  const account = mailbox.state.accounts.find((a) => a.id === d.accountId);
  const p = account && provider(account);
  if (p && account) {
    await p.send(account, d, replyTo);
    void syncAccount(account);
  }
}

export function disconnect(account: MailAccount) {
  const auth = readJson<AuthTable>(AUTH_KEY, {});
  delete auth[account.id];
  writeJson(AUTH_KEY, auth);
  const s = mailbox.state;
  mailbox.set({ ...s, accounts: s.accounts.filter((a) => a.id !== account.id), messages: s.messages.filter((m) => m.accountId !== account.id) });
}
