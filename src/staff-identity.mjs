/**
 * ---------------------------------------------------------------------------
 * G-132. THE PERSON, NOT THE PERSONA.
 *
 * Verifies a staff member's bearer token against a managed identity
 * provider's OIDC-issued JWT, and nothing else. This file does not create
 * accounts, does not store a password, does not run MFA -- ruling 1
 * (`_decisions/2026-09-14_staff_identity_and_department_rbac.md`) puts all of
 * that on a managed provider's admin API. This module is the RESOURCE-SERVER
 * half only: given a bearer a browser already holds, is it a real, current,
 * unexpired credential issued by the provider this deployment trusts, and if
 * so who is it and what role claim does it carry.
 *
 * PROVIDER-AGNOSTIC BY CONSTRUCTION. `SHELL_IDENTITY_PROVIDER` (already
 * defined by G-90, unset on every deployment today) is read as an OIDC
 * issuer URL. Any provider that speaks standard OIDC discovery
 * (`<issuer>/.well-known/openid-configuration` -> jwks_uri) works without a
 * code change here -- the provider choice itself (WorkOS/Auth0/Clerk/Cognito
 * class) is named in this lane's close as an operator decision, not decided
 * in code. `STAFF_ROLE_CLAIM` / `STAFF_TENANT_CLAIM` name which JWT claims
 * carry the role and the tenant, because providers disagree on custom-claim
 * naming (some require a namespaced URI) and that must not leak into this
 * file's logic either.
 *
 * SUPPORTED ALGORITHM: RS256 only, hardcoded, never read from the token to
 * pick a verification path. Accepting `alg` from an unverified token to
 * choose how to verify it is the classic algorithm-confusion hole (and
 * `alg:"none"` the classic bypass); both are refused unconditionally here
 * before a single crypto operation runs.
 *
 * FAIL CLOSED, EVERY BRANCH. Every failure path below returns a typed
 * refusal ({ok:false, error, message, status:401}); nothing throws past this
 * module's boundary, and nothing here ever returns {ok:true} on a code path
 * that could not positively verify a signature against a key this deployment
 * was told to trust. `verifyStaffToken` returns `null` -- not a refusal --
 * only when the presented bearer is not JWT-shaped at all, which is the
 * signal callers use to fall through to the existing (unrelated) service-key
 * bearer check; a JWT-shaped bearer that fails verification is ALWAYS a
 * refusal, never a silent pass-through.
 * ---------------------------------------------------------------------------
 */

const RS256 = "RS256";
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;

/** Module-level cache, injectable so tests never share state and never hit a network. */
const defaultJwksCache = new Map(); // issuer -> { keys, fetchedAt }

function b64urlToBuffer(seg) {
  const padded = seg.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function looksLikeJwt(value) {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

function refuse(error, message) {
  return { ok: false, error, message, status: 401 };
}

/**
 * Parses header+payload WITHOUT verifying anything. Never trust a field read
 * here for an access decision until verifySignature below has run -- this
 * function exists only to know WHICH key and issuer to check against.
 */
function decodeUnverified(token) {
  const [h, p] = token.split(".");
  const header = JSON.parse(b64urlToBuffer(h).toString("utf8"));
  const payload = JSON.parse(b64urlToBuffer(p).toString("utf8"));
  return { header, payload };
}

async function discoverJwksUri(issuer, fetchImpl) {
  const res = await fetchImpl(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`oidc discovery HTTP ${res.status}`);
  const doc = await res.json();
  if (typeof doc?.jwks_uri !== "string" || !doc.jwks_uri) {
    throw new Error("oidc discovery document carries no jwks_uri");
  }
  return doc.jwks_uri;
}

async function loadJwks(issuer, env, deps, { forceRefresh = false } = {}) {
  const cache = deps.jwksCache || defaultJwksCache;
  const cached = cache.get(issuer);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const override = String(env.STAFF_IDENTITY_JWKS_URL || "").trim();
  const jwksUri = override || (await discoverJwksUri(issuer, fetchImpl));
  const res = await fetchImpl(jwksUri, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`jwks fetch HTTP ${res.status}`);
  const body = await res.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  cache.set(issuer, { keys, fetchedAt: Date.now() });
  return keys;
}

async function verifySignature(token, jwk) {
  const [h, p, s] = token.split(".");
  const signingInput = `${h}.${p}`;
  const signature = b64urlToBuffer(s);
  const { createPublicKey, verify } = await import("node:crypto");
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  return verify("RSA-SHA256", Buffer.from(signingInput, "utf8"), publicKey, signature);
}

/**
 * Verifies one presented bearer as a staff identity.
 *
 * Returns:
 *   - `null`                         bearer is not JWT-shaped; not a staff-token attempt at all.
 *   - `{ok:false, error, ...}`       JWT-shaped but refused. ALWAYS terminal -- callers must not
 *                                    fall back to any other resolution when this is returned.
 *   - `{ok:true, identity}`          verified. identity: {sub, role, tenant, email, name, iss, exp}.
 */
export async function verifyStaffToken(bearerValue, env = process.env, deps = {}) {
  if (!looksLikeJwt(bearerValue)) return null;

  const issuer = String(env.SHELL_IDENTITY_PROVIDER || "").trim();
  if (!issuer) {
    return refuse(
      "identity_provider_not_configured",
      "SHELL_IDENTITY_PROVIDER is unset on this deployment; a staff bearer cannot be verified against no issuer.",
    );
  }

  let header, payload;
  try {
    ({ header, payload } = decodeUnverified(bearerValue));
  } catch {
    return refuse("malformed_token", "the presented bearer could not be decoded as a JWT.");
  }

  if (header?.alg !== RS256) {
    return refuse(
      "unsupported_algorithm",
      `this deployment verifies ${RS256} only; the token declared '${header?.alg}'.`,
    );
  }
  if (typeof header?.kid !== "string" || !header.kid) {
    return refuse("malformed_token", "the token header carries no key id (kid).");
  }

  const tokenIssuer = typeof payload?.iss === "string" ? payload.iss.trim() : "";
  if (!tokenIssuer || tokenIssuer.replace(/\/$/, "") !== issuer.replace(/\/$/, "")) {
    return refuse(
      "unknown_issuer",
      `the token's issuer does not match SHELL_IDENTITY_PROVIDER for this deployment.`,
    );
  }

  const now = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  if (typeof payload.exp !== "number") {
    return refuse("malformed_token", "the token carries no exp claim.");
  }
  if (payload.exp <= now) {
    return refuse("expired_token", "the token's exp has passed.");
  }
  if (typeof payload.nbf === "number" && payload.nbf > now) {
    return refuse("expired_token", "the token is not yet valid (nbf is in the future).");
  }

  let keys;
  try {
    keys = await loadJwks(issuer, env, deps);
  } catch (err) {
    return refuse("issuer_unreachable", `could not load signing keys for this issuer: ${String(err?.message || err)}`);
  }

  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Key rotation: one forced refresh before giving up, never more than one.
    try {
      keys = await loadJwks(issuer, env, deps, { forceRefresh: true });
    } catch (err) {
      return refuse("issuer_unreachable", `could not refresh signing keys for this issuer: ${String(err?.message || err)}`);
    }
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) {
    return refuse("unknown_key", "no signing key on this issuer matches the token's kid.");
  }
  if (jwk.kty !== "RSA" || (jwk.alg && jwk.alg !== RS256) || (jwk.use && jwk.use !== "sig")) {
    return refuse("unknown_key", "the matched key is not an RSA signing key for RS256.");
  }

  let signatureOk;
  try {
    signatureOk = await verifySignature(bearerValue, jwk);
  } catch (err) {
    return refuse("malformed_token", `signature verification failed: ${String(err?.message || err)}`);
  }
  if (!signatureOk) {
    return refuse("invalid_signature", "the token's signature does not verify against this issuer's published key.");
  }

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub) {
    return refuse("malformed_token", "the token carries no sub claim; there is no person to identify.");
  }

  if (typeof deps.isRevoked === "function") {
    let revoked;
    try {
      revoked = await deps.isRevoked(sub, { env, payload });
    } catch (err) {
      return refuse("revocation_check_failed", `could not confirm this identity is still active: ${String(err?.message || err)}`);
    }
    if (revoked) {
      return refuse("revoked", "this account has been disabled.");
    }
  }

  const roleClaim = String(env.STAFF_ROLE_CLAIM || "role").trim() || "role";
  const tenantClaim = String(env.STAFF_TENANT_CLAIM || "org_id").trim() || "org_id";
  const role = typeof payload[roleClaim] === "string" ? payload[roleClaim].trim() : "";
  const tenant = typeof payload[tenantClaim] === "string" ? payload[tenantClaim].trim() : "";

  if (!role) {
    // Named, not silently dropped: the ruling requires the claim to EXIST and be readable.
    // A verified person with no role claim is a real, expected state (see close leave_behind)
    // -- provisioning a person before assigning them a lens role -- and is surfaced, not hidden.
    return {
      ok: true,
      identity: { sub, role: null, roleBasis: `token carries no readable '${roleClaim}' claim`, tenant: tenant || null, email: typeof payload.email === "string" ? payload.email : null, name: typeof payload.name === "string" ? payload.name : null, iss: tokenIssuer, exp: payload.exp },
    };
  }

  return {
    ok: true,
    identity: {
      sub,
      role,
      tenant: tenant || null,
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
      iss: tokenIssuer,
      exp: payload.exp,
    },
  };
}

/** The nine-lens vocabulary (ruling 2), named here ONLY so a role claim can be checked for
 *  well-formedness at the point of issuance/display. G-132 does not enforce lens access --
 *  that is G-127's shared enforcement package, consuming the identity this module verifies. */
export const NINE_LENSES = [
  "overview",
  "citizen",
  "development-services",
  "finance",
  "public-works",
  "parks",
  "police",
  "fire-ems",
  "fleet",
];
export const DEPARTMENT_ROLES = ["development-services", "finance", "public-works", "parks", "police", "fire-ems", "fleet"];
export const TIER_ROLES = [...DEPARTMENT_ROLES, "city-manager", "admin"];

export function isKnownRole(role) {
  return typeof role === "string" && TIER_ROLES.includes(role);
}

export { looksLikeJwt, JWKS_CACHE_TTL_MS };
