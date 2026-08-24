const ACCESS_POLICIES = new Set(["public-free", "tenant-private"]);

export function headerValue(req, name) {
  const headers = req?.headers || {};
  const lower = String(name).toLowerCase();
  const raw = headers[name] ?? headers[lower] ?? "";
  return String(Array.isArray(raw) ? raw[0] : raw).trim();
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

export async function resolveCaller(req, envMap = process.env, deps = {}) {
  const tenant = await resolveHauskaTenant(req, envMap, deps);
  if (tenant) return { kind: "tenant", tenant };
  if (isServiceBearer(req, envMap)) return { kind: "service" };
  return { kind: "anonymous" };
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
  return caller?.kind === "tenant" && caller.tenant === subject;
}

export function canReadPack(pack, caller, envMap = process.env) {
  if (!pack) return false;
  const policy = ACCESS_POLICIES.has(pack.accessPolicy)
    ? pack.accessPolicy
    : "public-free";
  if (policy === "tenant-private") {
    return callerIsPackSubject(caller, pack.cityKey);
  }
  if (caller?.kind === "tenant" || caller?.kind === "service") return true;
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
