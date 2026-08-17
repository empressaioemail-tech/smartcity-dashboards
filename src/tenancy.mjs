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

export function canReadPack(pack, caller, envMap = process.env) {
  if (!pack) return false;
  const policy = ACCESS_POLICIES.has(pack.accessPolicy)
    ? pack.accessPolicy
    : "public-free";
  if (policy === "tenant-private") {
    return caller?.kind === "tenant" && caller.tenant === pack.cityKey;
  }
  if (caller?.kind === "tenant" || caller?.kind === "service") return true;
  const serviceKey = String(envMap.DASHBOARDS_API_KEY || "").trim();
  return !serviceKey;
}

export function packReadStatus(pack, caller, envMap = process.env) {
  if (!pack) return 404;
  if (canReadPack(pack, caller, envMap)) return 200;
  return caller?.kind === "anonymous" ? 401 : 403;
}

export function atomVisibleToCaller(atom, caller, cityKey) {
  if (!atom || typeof atom !== "object") return false;
  const raw = atom.accessPolicy;
  if (raw == null || String(raw).trim() === "") return true;
  const policy = String(raw).trim();
  if (policy === "public-free") return true;
  if (policy === "tenant-private") {
    return caller?.kind === "tenant" && caller.tenant === cityKey;
  }
  return false;
}
