import { verifyStaffToken } from "./staff-identity.mjs";
import { isStaffAccountRevoked } from "./staff-directory.mjs";

const ACCESS_POLICIES = new Set(["public-free", "tenant-private"]);

export function headerValue(req, name) {
  const headers = req?.headers || {};
  const lower = String(name).toLowerCase();
  const raw = headers[name] ?? headers[lower] ?? "";
  return String(Array.isArray(raw) ? raw[0] : raw).trim();
}

export const STAFF_SESSION_COOKIE = "sc_staff_token";

/**
 * G-134 GAP 5. A browser signed in via /auth/callback carries its staff
 * bearer in an HttpOnly cookie, not an Authorization header (a page load has
 * no chance to set one). This is a narrow, named cookie lookup -- not a
 * general cookie parser -- so it never becomes a second place request state
 * quietly grows.
 */
export function staffBearerFromCookie(req) {
  const raw = headerValue(req, "cookie");
  if (!raw) return "";
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === STAFF_SESSION_COOKIE) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return "";
}

export function isServiceBearer(req, envMap = process.env) {
  const key = String(envMap.DASHBOARDS_API_KEY || "").trim();
  if (!key) return false;
  return headerValue(req, "authorization") === `Bearer ${key}`;
}

export function parseTenantKeyMap(envMap = process.env) {
  // Local/unit tests only. Cloud Run always resolves via MCP /auth/whoami.
  if (String(envMap.K_SERVICE || "").trim()) return null;
  const raw = String(envMap.HAUSKA_TENANT_KEYS || "").trim();
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("HAUSKA_TENANT_KEYS must be a JSON object of key to cityKey");
  }
  return parsed;
}

export async function resolveHauskaTenant(req, envMap = process.env, deps = {}) {
  const presented = headerValue(req, "x-hauska-key");
  if (!presented) return null;
  if (typeof deps.resolveTenant === "function") {
    return deps.resolveTenant(presented);
  }
  const mapped = parseTenantKeyMap(envMap);
  if (mapped) {
    if (!Object.prototype.hasOwnProperty.call(mapped, presented)) return null;
    const tenant = String(mapped[presented] || "").trim();
    return tenant || null;
  }
  const base = String(envMap.HAUSKA_MCP_URL || "").trim().replace(/\/$/, "");
  if (!base) return null;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const res = await fetchImpl(`${base}/auth/whoami`, {
    headers: { "x-hauska-key": presented, accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const tenant = body?.jurisdiction_tenant;
  return typeof tenant === "string" && tenant.trim() ? tenant.trim() : null;
}

/**
 * G-132. A staff bearer is checked FIRST and, once presented, its outcome is
 * FINAL -- success returns {kind:"staff",...} immediately without consulting
 * x-hauska-key at all (a person's own identity is authoritative over a
 * coarser product-key tenant), and failure refuses immediately without
 * falling through to x-hauska-key, the service key, or anonymous. That is
 * the literal mechanism behind "never fall back to the shared persona and
 * never fall back to tenant-only resolution" -- a caller that attempted to
 * identify itself as a person does not get quietly re-resolved as something
 * coarser just because a weaker credential also happens to be present.
 *
 * A refusal is carried on an {kind:"anonymous"} shape (not a new caller kind)
 * so it flows through every existing kind==="anonymous" branch in this file
 * and in shell-state.mjs unchanged -- refusing tenant-private content and
 * still serving public-free content, which is correct: an invalid staff
 * token does not make PUBLIC content any less public. The `refused` field is
 * what upgrades the response from an indistinguishable-from-plain-anonymous
 * 401 into a typed one (server.mjs reads it to build the response body).
 *
 * A presented bearer that is not JWT-shaped at all (the existing
 * DASHBOARDS_API_KEY opaque service key) is untouched by this branch:
 * verifyStaffToken returns null for it, and resolution proceeds exactly as
 * before.
 */
export async function resolveCaller(req, envMap = process.env, deps = {}) {
  // G-134 GAP 5: a browser sign-in has no Authorization header to set, only the
  // cookie /auth/callback wrote. The header wins when both are somehow present --
  // an explicit Authorization header is a more deliberate assertion than a cookie
  // the browser attaches automatically -- but this is never both at once in
  // practice (a signed-in browser sends only the cookie; a script/tool sends only
  // the header).
  const bearer =
    headerValue(req, "authorization").replace(/^Bearer\s+/i, "").trim() || staffBearerFromCookie(req);
  if (bearer) {
    // isRevoked defaults to the local staff directory (staff-directory.mjs) so every
    // production call site -- none of which pass deps explicitly -- still gets a real,
    // per-request offboarding check without having to be taught about it individually.
    // A caller wanting a different/injected check (tests, this file's own tests) overrides
    // it by passing deps.isRevoked.
    const staffDeps = { ...deps, isRevoked: deps.isRevoked ?? ((sub) => isStaffAccountRevoked(sub, envMap)) };
    const staff = await verifyStaffToken(bearer, envMap, staffDeps);
    if (staff) {
      if (staff.ok) return { kind: "staff", ...staff.identity };
      return { kind: "anonymous", refused: { error: staff.error, message: staff.message, status: staff.status } };
    }
  }
  const tenant = await resolveHauskaTenant(req, envMap, deps);
  if (tenant) return { kind: "tenant", tenant };
  if (isServiceBearer(req, envMap)) return { kind: "service" };
  return { kind: "anonymous" };
}

/** The typed refusal a staff bearer attempt left on an otherwise-anonymous caller, or null. */
export function callerRefusal(caller) {
  return caller?.refused ?? null;
}

/**
 * The body for a non-200 pack-content response, typed rather than a bare
 * "unauthorized"/"forbidden" string. G-132's mission: "A refused request says
 * it was refused and why. A silent empty response is indistinguishable from
 * 'no records'." A caller carrying a refused staff-bearer attempt gets that
 * attempt's own reason; every other 401/403 keeps its existing generic
 * reason, since only a staff-bearer refusal has a more specific one to give.
 */
export function accessRefusalBody(caller, status) {
  const refusal = callerRefusal(caller);
  if (refusal) return { error: refusal.error, message: refusal.message };
  return { error: status === 401 ? "unauthorized" : "forbidden" };
}

/**
 * THE SUBJECT RULE, in one place.
 *
 * "This caller is the tenant this pack belongs to" was written out three times -
 * in canReadPack's tenant-private branch, in atomVisibleToCaller's, and it was
 * about to be written a fourth time for the files room. Three copies of one rule
 * is how one of them ends up widened alone, and a widened tenant test is the
 * whole tenancy control.
 *
 * A blank cityKey is NOT a subject. Without this the empty string would match a
 * caller whose tenant is also blank, which is the shape a defaulted tenant field
 * arrives in.
 */
export function callerIsPackSubject(caller, cityKey) {
  const subject = String(cityKey || "").trim();
  if (!subject) return false;
  if (caller?.kind === "tenant") return caller.tenant === subject;
  // G-132: a verified staff person is a subject of their own tenant's pack, same as a
  // product-key tenant caller -- a real person from bastrop_tx must read what a bastrop_tx
  // product key already could. A staff caller with no tenant claim (see staff-identity.mjs's
  // "provisioned with no role yet" case, which also applies to tenant) is not a subject of
  // anything: null !== a real cityKey, so this refuses rather than guessing.
  if (caller?.kind === "staff") return Boolean(caller.tenant) && caller.tenant === subject;
  return false;
}

export function canReadPack(pack, caller, envMap = process.env) {
  if (!pack) return false;
  const policy = ACCESS_POLICIES.has(pack.accessPolicy)
    ? pack.accessPolicy
    : "public-free";
  if (policy === "tenant-private") {
    return callerIsPackSubject(caller, pack.cityKey);
  }
  if (caller?.kind === "tenant" || caller?.kind === "service" || caller?.kind === "staff") return true;
  const serviceKey = String(envMap.DASHBOARDS_API_KEY || "").trim();
  return !serviceKey;
}

/**
 * Reading the CONTENT of a pack is not the same act as enumerating packs.
 *
 * canReadPack answers the enumeration question, and for a public-free pack it
 * falls through to "is a service key configured", which is deployment posture
 * rather than access policy. That is right for the pack list, where anonymous
 * enumeration of tenants is not wanted, and wrong for content: a public-free
 * pack whose records are unreadable by an anonymous caller is not public-free.
 *
 * It only became visible when template-city started carrying records. Every
 * local run has DASHBOARDS_API_KEY unset, so the gate is open locally and shut
 * in production, and the demo read as honest-empty on the deployed surface
 * while passing every test. Hence packContentReadStatus below, and hence its
 * test runs with the key SET.
 */
export function canReadPackContent(pack, caller, envMap = process.env) {
  if (!pack) return false;
  const policy = ACCESS_POLICIES.has(pack.accessPolicy)
    ? pack.accessPolicy
    : "public-free";
  if (policy === "tenant-private") {
    return canReadPack(pack, caller, envMap);
  }
  return true;
}

export function packContentReadStatus(pack, caller, envMap = process.env) {
  if (!pack) return 404;
  if (canReadPackContent(pack, caller, envMap)) return 200;
  return caller?.kind === "anonymous" ? 401 : 403;
}

export function packReadStatus(pack, caller, envMap = process.env) {
  if (!pack) return 404;
  if (canReadPack(pack, caller, envMap)) return 200;
  return caller?.kind === "anonymous" ? 401 : 403;
}

/**
 * The atom-contract accessPolicy union, as the five values that contract ships.
 * Declared here so an unrecognised sixth value is a value this product cannot
 * reason about rather than a value it silently treats as public.
 */
const ATOM_ACCESS_POLICIES = new Set([
  "public-free",
  "public-paid",
  "platform-internal",
  "tenant-private",
  "tenant-shared",
]);

/**
 * The policy an atom carries, or null when it carries none this product knows.
 *
 * TOTAL BY CONSTRUCTION, and that is the point. atomVisibleToCaller used to read
 * atom.accessPolicy directly and return TRUE for an absent or blank one, which
 * meant a real city's atoms with no policy set were readable by an anonymous
 * caller - the fail-open default this repo's governing defect class is named
 * after. Absence is not a policy; it is the absence of one, and the answer to
 * "may this caller read it" when nothing says so is no.
 *
 * WHY A RESOLUTION FUNCTION RATHER THAN A TYPE. A discriminated union the
 * compiler enforces at every consumer would remove the question entirely, and
 * this repo has no compile step: it is plain ESM run by node. The nearest
 * available structural equivalent is to make the resolution total and to give
 * the decision below no other input, so there is no path from a raw field to a
 * permit. Every allow is an explicitly enumerated branch and the function ends
 * in a refusal, which is default-deny by shape rather than by discipline.
 *
 * Absent, blank and unrecognised deliberately collapse to ONE null here, and
 * that is not the three-states-collapsed defect: all three refuse, so the
 * visibility decision cannot distinguish them anyway. The distinction that does
 * carry information - a chain that returned nothing versus a chain whose atoms
 * were all refused - is preserved by the caller, in src/compose.mjs, where it
 * reaches a basis line a reader sees.
 */
export function resolveAtomAccessPolicy(atom) {
  if (!atom || typeof atom !== "object") return null;
  const raw = atom.accessPolicy;
  if (typeof raw !== "string") return null;
  const policy = raw.trim();
  return ATOM_ACCESS_POLICIES.has(policy) ? policy : null;
}

export function atomVisibleToCaller(atom, caller, cityKey) {
  const policy = resolveAtomAccessPolicy(atom);
  if (policy === null) return false;
  if (policy === "public-free") return true;
  if (policy === "tenant-private") return callerIsPackSubject(caller, cityKey);
  return false;
}
