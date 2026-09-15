/**
 * ---------------------------------------------------------------------------
 * G-134 GAP 5. SIGN-IN, THE FIRST HALF OF "STAFF CAN ACTUALLY USE THIS."
 *
 * Staff cannot sign in without this, no matter how correct staff-identity.mjs
 * and staff-admin-client.mjs are -- there was no route that got a browser
 * from "nothing" to "a bearer resolveCaller can verify." This is that route,
 * as a redirect-based OIDC authorization-code flow against WorkOS AuthKit's
 * hosted login -- no password form lives in this codebase, by ruling 1's own
 * logic (the provider holds credentials; we never build a login form that
 * would have to).
 *
 * BUILD NOW, VERIFY LATER (operator direction, 2026-09-15), same as
 * staff-admin-client.mjs -- no WorkOS account exists to redirect to or
 * exchange a code against. The authorize-URL shape and the token-exchange
 * request below are WorkOS's documented User Management API; NEITHER has
 * been exercised against a real WorkOS organization. State this in the
 * close.
 *
 * WHY A COOKIE, NOT LOCALSTORAGE. This shell renders server-side routes
 * (`GET /?lens=...`); an HttpOnly cookie is invisible to any script running
 * on the page, which is the right property for a bearer token, and it rides
 * every subsequent request automatically -- no client JS has to remember to
 * attach it. tenancy.mjs's resolveCaller reads this exact cookie
 * (STAFF_SESSION_COOKIE) when no Authorization header is present.
 *
 * SELF-REGISTRATION STAYS OFF. `screen_hint=sign-in` is passed so AuthKit's
 * hosted UI does not offer a sign-up path; the actual enforcement is
 * structural, not this flag -- this codebase has no code path that creates a
 * WorkOS user from an unauthenticated request (that is staff-admin-client.mjs,
 * an admin-only call), so there is no self-registration surface here to turn
 * off even if this flag were ignored.
 *
 * CSRF: `state` is a random nonce minted at /auth/sign-in, stored in its own
 * short-lived cookie, and checked byte-for-byte at /auth/callback before any
 * code exchange happens. A callback whose state does not match the cookie is
 * refused before WorkOS is even called.
 * ---------------------------------------------------------------------------
 */
import { randomBytes } from "node:crypto";

const DEFAULT_API_BASE = "https://api.workos.com";
export const STATE_COOKIE = "sc_signin_state";

function apiBase(env) {
  return String(env.WORKOS_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, "");
}

function requireConfig(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured; sign-in cannot start.`);
  return value;
}

export function generateState() {
  return randomBytes(24).toString("base64url");
}

/**
 * Builds the URL to redirect the browser to. Throws (never redirects to a
 * malformed or unconfigured destination) if WORKOS_CLIENT_ID or
 * WORKOS_REDIRECT_URI is missing -- a sign-in button that redirects to
 * "undefined" is a worse failure than one that never renders.
 */
export function buildAuthorizeUrl(env, state) {
  const clientId = requireConfig(env, "WORKOS_CLIENT_ID");
  const redirectUri = requireConfig(env, "WORKOS_REDIRECT_URI");
  const url = new URL(`${apiBase(env)}/user_management/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("provider", "authkit");
  url.searchParams.set("screen_hint", "sign-in");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Exchanges an authorization code for tokens. Returns the raw access token
 * string this deployment's staff-identity.mjs will later verify as any other
 * OIDC bearer -- this function does not itself decide the caller is valid,
 * it only completes the code exchange. A non-2xx or a body with no
 * access_token throws; the callback route below never sets a cookie from a
 * value that did not come back this way.
 */
export async function exchangeCodeForToken(code, env = process.env, deps = {}) {
  const clientId = requireConfig(env, "WORKOS_CLIENT_ID");
  const clientSecret = requireConfig(env, "WORKOS_API_KEY");
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const res = await fetchImpl(`${apiBase(env)}/user_management/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code }),
    signal: AbortSignal.timeout(10000),
  });
  const text = typeof res.text === "function" ? await res.text() : "";
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(`WorkOS token exchange failed: ${res.status} ${json?.message || text}`);
  }
  const accessToken = json?.access_token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("WorkOS token exchange returned no access_token; refusing to start a session from it.");
  }
  return accessToken;
}

/** Serializes the two cookies this flow ever writes. HttpOnly + Secure + SameSite=Lax on
 *  both: Lax (not Strict) because the callback IS a top-level cross-site GET redirect
 *  arriving FROM WorkOS, which Strict would drop the cookie on. maxAgeSeconds omitted
 *  for the session cookie (0) makes it a browser-session cookie, matching an access
 *  token's own short lifetime rather than inventing a separate, longer-lived one here. */
export function serializeCookie(name, value, { maxAgeSeconds = 0 } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "HttpOnly", "Secure", "SameSite=Lax", "Path=/"];
  if (maxAgeSeconds > 0) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}

/** Clears a cookie by expiring it immediately -- used for both sign-out and a rejected
 *  callback's state cookie. */
export function clearCookie(name) {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
