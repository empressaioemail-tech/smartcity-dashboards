/**
 * ---------------------------------------------------------------------------
 * G-134 GAP 1. THE PROVISIONING CLIENT -- ACTUALLY CALLS THE PROVIDER.
 *
 * staff-directory.mjs named this the missing half: "the actual 'call the
 * provider's admin API to create a user' is provider-specific and is the
 * named, unresolved gap." This file is that call, against WorkOS (operator
 * ruling `_decisions/2026-09-14_staff_identity_and_department_rbac.md`)
 * specifically -- NOT provider-agnostic like staff-identity.mjs, because
 * provisioning (create user, assign a role, issue credentials) is an
 * admin-API action with no OIDC-standard shape, unlike verifying a token
 * (which IS standardized and stays provider-agnostic).
 *
 * BUILD NOW, VERIFY LATER (operator direction, 2026-09-15). No WorkOS
 * account or API key exists anywhere this session could reach at the time
 * this was written -- checked Secret Manager in hauska-prod-497015 and this
 * project's own GCP project, and every repo's own env/code/docs. The
 * endpoint shapes below are WorkOS's documented User Management API,
 * exercised here only against an injectable fetch mock (deps.fetchImpl),
 * same pattern as staff-identity.mjs's deps.fetchImpl. NOTHING in this file
 * has been called against a real WorkOS organization. The first real call
 * this deployment makes to WorkOS -- and the "disable an account, confirm
 * access ends" violation test the mission requires -- has not happened.
 * State this plainly in the close, every time this module is mentioned.
 *
 * SELF-REGISTRATION OFF (ruling 1). Every function here is an admin/operator
 * action; none accepts an unauthenticated or self-service request, and none
 * is reachable from a public route in this repo.
 *
 * MFA ON -- NAMED, NOT SILENTLY ASSUMED DONE. WorkOS's per-organization
 * "Require MFA" enforcement is a dashboard setting with no documented
 * per-user API call this client can make on your behalf. This client cannot
 * turn it on. It MUST be enabled by hand in the WorkOS dashboard once the
 * organization exists -- leave_behind, not silently skipped.
 *
 * WHAT THIS DOES NOT DO. Does not choose the role or tenant -- the caller
 * supplies both; this file only carries them into the local directory row so
 * they are ready to ride the JWT later (STAFF_ROLE_CLAIM / STAFF_TENANT_CLAIM,
 * staff-identity.mjs) once WorkOS is configured to emit them as claims (a
 * WorkOS-dashboard mapping, also named in leave_behind, also unverified).
 * Does not touch the staff_accounts table directly -- calls
 * upsertStaffAccount/disableStaffAccount (staff-directory.mjs) itself, so
 * there remains exactly one write path to that table regardless of caller.
 * ---------------------------------------------------------------------------
 */
import { randomBytes } from "node:crypto";
import { upsertStaffAccount, disableStaffAccount } from "./staff-directory.mjs";

const DEFAULT_API_BASE = "https://api.workos.com";

function apiBase(env) {
  return String(env.WORKOS_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, "");
}

function authHeader(env) {
  const key = String(env.WORKOS_API_KEY || "").trim();
  if (!key) throw new Error("WORKOS_API_KEY is not configured; cannot call WorkOS.");
  return `Bearer ${key}`;
}

async function workosRequest(env, deps, method, path, body) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const res = await fetchImpl(`${apiBase(env)}${path}`, {
    method,
    headers: { Authorization: authHeader(env), "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
    const message = json?.message || json?.error || text || `HTTP ${res.status}`;
    const err = new Error(`WorkOS ${method} ${path} failed: ${res.status} ${message}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/**
 * A one-time credential an admin hands to the new staff member out of band
 * (ruling 1: "we hand over the credentials"). Random, never logged, present
 * exactly once in provisionStaffAccount's return value -- same discipline as
 * hauska-mcp-server's admin.ts key-mint endpoint (raw_key shown once, never
 * stored after).
 */
export function generateTemporaryPassword() {
  return randomBytes(24).toString("base64url");
}

/**
 * Creates the WorkOS-side account for a new staff member and records it
 * locally via upsertStaffAccount, so a half-created account (WorkOS side
 * succeeded, local record did not, or vice versa) is never the silent
 * outcome: the WorkOS call is awaited and checked for an id before the local
 * write runs, and a WorkOS failure throws before any local row exists.
 *
 * Returns { sub, workosUserId, workosOrganizationId, temporaryPassword }.
 * temporaryPassword is present exactly once, in this return value only.
 */
export async function provisionStaffAccount(
  { email, name, tenant, role, organizationId } = {},
  env = process.env,
  deps = {},
) {
  const cleanEmail = String(email || "").trim();
  if (!cleanEmail) throw new Error("provisionStaffAccount requires email");
  const cleanTenant = String(tenant || "").trim();
  if (!cleanTenant) throw new Error("provisionStaffAccount requires tenant");

  const temporaryPassword = deps.generatePassword ? deps.generatePassword() : generateTemporaryPassword();

  const user = await workosRequest(env, deps, "POST", "/user_management/users", {
    email: cleanEmail,
    password: temporaryPassword,
    first_name: name || undefined,
    email_verified: true,
  });
  if (!user?.id) throw new Error("WorkOS user creation returned no id; refusing to record a local account for it.");

  const orgId = organizationId || String(env.WORKOS_ORGANIZATION_ID || "").trim();
  let membership = null;
  if (orgId) {
    membership = await workosRequest(env, deps, "POST", "/user_management/organization_memberships", {
      organization_id: orgId,
      user_id: user.id,
    });
  }

  await upsertStaffAccount(
    {
      sub: user.id,
      tenant: cleanTenant,
      role: role ?? null,
      email: cleanEmail,
      name: name ?? null,
      provisionedBy: "staff-admin-client:workos",
    },
    env,
    deps,
  );

  return {
    sub: user.id,
    workosUserId: user.id,
    workosOrganizationId: membership?.organization_id ?? orgId ?? null,
    temporaryPassword,
  };
}

/**
 * Offboarding, the provider half. Removes the WorkOS organization membership
 * (so a future token carries no valid tenant claim for this person) and
 * marks the local record disabled via disableStaffAccount. Does NOT delete
 * the WorkOS user outright -- membership removal is the narrower, reversible
 * action (re-invite without recreating the identity); deleting the user is a
 * distinct, more destructive operation this function does not perform.
 *
 * This is the provider-side half. The ALREADY-INSTANT half is
 * disableStaffAccount's own local status flip, checked on every request via
 * isRevoked in smartcity-dashboards. plan-review/smart-files have no such
 * store, so for them the effective bound is staff-identity.mjs's own
 * STAFF_TOKEN_MAX_AGE_SECONDS cap (G-134 GAP 3), not this call -- this call
 * still runs there too (belt and suspenders), it is just not the thing doing
 * the real work in those two products.
 *
 * The local disable runs even if no WorkOS membership is found to remove
 * (already-removed, or never had one) -- local revocation must never depend
 * on the remote call having something to do.
 */
export async function offboardStaffAccount(
  sub,
  { disabledBy = "staff-admin-client:workos", membershipId } = {},
  env = process.env,
  deps = {},
) {
  const cleanSub = String(sub || "").trim();
  if (!cleanSub) throw new Error("offboardStaffAccount requires sub");

  let membership = membershipId ?? null;
  if (!membership) {
    const list = await workosRequest(
      env,
      deps,
      "GET",
      `/user_management/organization_memberships?user_id=${encodeURIComponent(cleanSub)}`,
    );
    membership = Array.isArray(list?.data) && list.data.length > 0 ? list.data[0].id : null;
  }
  if (membership) {
    await workosRequest(env, deps, "DELETE", `/user_management/organization_memberships/${encodeURIComponent(membership)}`);
  }

  return disableStaffAccount(cleanSub, { disabledBy }, env, deps);
}
