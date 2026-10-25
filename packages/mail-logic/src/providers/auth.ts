import type { Fetch } from "./provider.js";

/**
 * Sign-in for Outlook and Gmail from a static web page. Neither needs a
 * client secret, so nothing secret lives in this public repo:
 * - Microsoft: authorization code + PKCE for a "single-page application".
 *   Refresh tokens last 24 hours, then the person signs in again.
 * - Google: the browser token flow. Tokens last an hour; the app renews
 *   them without a prompt while the person stays signed in to Google.
 */

export interface OAuthConfig {
  clientId: string;
  /** Exactly as registered, e.g. https://avrenthrad.github.io/societyos/inbox/ */
  redirectUri: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  /** ms since epoch */
  expiresAt: number;
}

export const MS_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"];
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/gmail.modify", "email", "profile"];

const MS_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(bytes = 32) {
  return b64url(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string) {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
}

/** The Microsoft sign-in page. Keep `verifier` and `state` until the redirect comes back. */
export async function microsoftAuthUrl(cfg: OAuthConfig, state: string, verifier: string, loginHint?: string) {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${MS_AUTH}/authorize?${p}`;
}

async function msToken(f: Fetch, body: Record<string, string>): Promise<Tokens> {
  const res = await f(`${MS_AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? `Microsoft sign-in failed (${res.status})`);
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
}

export function microsoftRedeem(cfg: OAuthConfig, code: string, verifier: string, f: Fetch = fetch) {
  return msToken(f, {
    client_id: cfg.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: verifier,
    scope: MS_SCOPES.join(" "),
  });
}

export function microsoftRefresh(cfg: OAuthConfig, refreshToken: string, f: Fetch = fetch) {
  return msToken(f, { client_id: cfg.clientId, grant_type: "refresh_token", refresh_token: refreshToken, scope: MS_SCOPES.join(" ") });
}

/** The Google sign-in page. `prompt: "none"` renews silently. */
export function googleAuthUrl(cfg: OAuthConfig, state: string, opts: { loginHint?: string; silent?: boolean } = {}) {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "token",
    redirect_uri: cfg.redirectUri,
    scope: GOOGLE_SCOPES.join(" "),
    state,
    include_granted_scopes: "true",
    prompt: opts.silent ? "none" : "select_account",
  });
  if (opts.loginHint) p.set("login_hint", opts.loginHint);
  return `${GOOGLE_AUTH}?${p}`;
}

export type Redirect =
  | { kind: "code"; code: string; state: string }
  | { kind: "token"; accessToken: string; expiresIn: number; state: string }
  | { kind: "error"; error: string; state?: string };

/** Read what the sign-in page sent back in the URL (query for Microsoft, #fragment for Google). */
export function readRedirect(url: string): Redirect | undefined {
  const u = new URL(url);
  const q = u.searchParams;
  const h = new URLSearchParams(u.hash.replace(/^#/, ""));
  const err = q.get("error") ?? h.get("error");
  if (err) return { kind: "error", error: q.get("error_description") ?? h.get("error_description") ?? err, state: q.get("state") ?? h.get("state") ?? undefined };
  if (q.get("code") && q.get("state")) return { kind: "code", code: q.get("code")!, state: q.get("state")! };
  if (h.get("access_token") && h.get("state")) {
    return { kind: "token", accessToken: h.get("access_token")!, expiresIn: Number(h.get("expires_in") ?? 3600), state: h.get("state")! };
  }
  return undefined;
}
