/**
 * ---------------------------------------------------------------------------
 * G-132. THE LOCAL RECORD OF WHO WE PROVISIONED, AND WHETHER THEY STILL HAVE
 * ACCESS.
 *
 * Ruling 1: SmartCity admin provisions every account through a managed
 * provider's admin API; we hold the admin authority, the provider holds the
 * credential. This file is OUR side of that split -- a local directory row
 * per person we provisioned, written at provisioning time and updated at
 * disable time, so:
 *
 *  (a) the "People and access" lens (read-only for the city manager,
 *      administered by us) has something to read that isn't a live call to a
 *      third party on every page view, and
 *  (b) src/staff-identity.mjs's isRevoked hook has a fast, local answer for
 *      every request rather than a network round-trip to the provider per
 *      call.
 *
 * WHAT THIS IS NOT. Not a credential store -- no password, no MFA secret, no
 * provider API key lives in this table, only the shape of who exists and
 * what their access state is. Not the provisioning mechanism itself -- the
 * actual "call the provider's admin API to create a user" is
 * provider-specific and is the named, unresolved gap in this lane's close
 * (see staff-admin-client.mjs). This table is written BY that call once it
 * exists, and until then is seeded/administered directly.
 *
 * DEFAULT-DENY ON THE UNKNOWN SUB. A verified JWT proves the PROVIDER issued
 * it; it does not prove WE provisioned that person. Self-registration is
 * ruled off, but this table does not trust that promise blindly -- a sub
 * with no local row is treated as not-provisioned-here, refused, and named
 * distinctly from a sub that IS provisioned but disabled. Two different
 * absences, per DEV_PROCESS 4.3, never collapsed.
 *
 * DB / memory split follows src/city-pack.mjs's own convention exactly:
 * DATABASE_URL unset -> in-memory (tests, local dev); set -> Postgres/Neon.
 * ---------------------------------------------------------------------------
 */
import { getPool } from "./db.mjs";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS staff_accounts (
  sub TEXT PRIMARY KEY,
  tenant TEXT NOT NULL,
  role TEXT NULL,
  email TEXT NULL,
  name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  provisioned_by TEXT NOT NULL,
  provisioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ NULL,
  disabled_by TEXT NULL
)`;

const memoryAccounts = new Map(); // sub -> record

export function staffDirectoryStore(envMap = process.env) {
  const url = String(envMap.DATABASE_URL || "").trim();
  return url ? "neon" : "memory";
}

async function runQuery(envMap, sql, params = [], deps = {}) {
  if (typeof deps.query === "function") return deps.query(sql, params);
  return getPool(envMap).query(sql, params);
}

export async function ensureStaffAccountsTable(envMap = process.env, deps = {}) {
  await runQuery(envMap, CREATE_TABLE_SQL, [], deps);
  return true;
}

function rowToRecord(row) {
  return {
    sub: row.sub,
    tenant: row.tenant,
    role: row.role,
    email: row.email,
    name: row.name,
    status: row.status,
    provisionedBy: row.provisioned_by,
    provisionedAt: row.provisioned_at,
    disabledAt: row.disabled_at,
    disabledBy: row.disabled_by,
  };
}

/** Records that WE provisioned a person. Called from the admin-provisioning path (named gap
 *  today; see staff-admin-client.mjs) or directly by an operator seeding a pilot account. */
export async function upsertStaffAccount(record, envMap = process.env, deps = {}) {
  const sub = String(record?.sub || "").trim();
  if (!sub) throw new Error("upsertStaffAccount requires sub");
  const tenant = String(record?.tenant || "").trim();
  if (!tenant) throw new Error("upsertStaffAccount requires tenant");
  const row = {
    sub,
    tenant,
    role: record.role ?? null,
    email: record.email ?? null,
    name: record.name ?? null,
    status: "active",
    provisionedBy: String(record.provisionedBy || "smartcity-admin"),
  };
  if (staffDirectoryStore(envMap) === "neon") {
    await ensureStaffAccountsTable(envMap, deps);
    await runQuery(
      envMap,
      `INSERT INTO staff_accounts (sub, tenant, role, email, name, status, provisioned_by)
       VALUES ($1,$2,$3,$4,$5,'active',$6)
       ON CONFLICT (sub) DO UPDATE SET
         tenant = EXCLUDED.tenant, role = EXCLUDED.role, email = EXCLUDED.email,
         name = EXCLUDED.name, status = 'active', disabled_at = NULL, disabled_by = NULL`,
      [row.sub, row.tenant, row.role, row.email, row.name, row.provisionedBy],
      deps,
    );
    return true;
  }
  memoryAccounts.set(sub, { ...row, provisionedAt: new Date().toISOString(), disabledAt: null, disabledBy: null });
  return true;
}

/**
 * Offboarding, the actual mechanism. Marks the local record disabled
 * immediately -- this is the fast, always-available half of offboarding
 * latency. The provider-side "actually invalidate the session / block new
 * token issuance" call is the named gap (staff-admin-client.mjs); until it
 * is wired to a real provider, THIS function is still what makes access end
 * within this deployment, because every request re-checks isRevoked. An
 * already-issued token with time left on its exp is bounded by the token TTL
 * this deployment configures -- stated explicitly, not assumed away.
 */
export async function disableStaffAccount(sub, { disabledBy = "smartcity-admin" } = {}, envMap = process.env, deps = {}) {
  const key = String(sub || "").trim();
  if (!key) throw new Error("disableStaffAccount requires sub");
  if (staffDirectoryStore(envMap) === "neon") {
    await ensureStaffAccountsTable(envMap, deps);
    const result = await runQuery(
      envMap,
      `UPDATE staff_accounts SET status='disabled', disabled_at=now(), disabled_by=$2 WHERE sub=$1 RETURNING sub`,
      [key, disabledBy],
      deps,
    );
    return (result.rowCount || result.rows?.length || 0) > 0;
  }
  const existing = memoryAccounts.get(key);
  if (!existing) return false;
  memoryAccounts.set(key, { ...existing, status: "disabled", disabledAt: new Date().toISOString(), disabledBy });
  return true;
}

export async function enableStaffAccount(sub, envMap = process.env, deps = {}) {
  const key = String(sub || "").trim();
  if (!key) throw new Error("enableStaffAccount requires sub");
  if (staffDirectoryStore(envMap) === "neon") {
    await ensureStaffAccountsTable(envMap, deps);
    const result = await runQuery(
      envMap,
      `UPDATE staff_accounts SET status='active', disabled_at=NULL, disabled_by=NULL WHERE sub=$1 RETURNING sub`,
      [key],
      deps,
    );
    return (result.rowCount || result.rows?.length || 0) > 0;
  }
  const existing = memoryAccounts.get(key);
  if (!existing) return false;
  memoryAccounts.set(key, { ...existing, status: "active", disabledAt: null, disabledBy: null });
  return true;
}

export async function getStaffAccount(sub, envMap = process.env, deps = {}) {
  const key = String(sub || "").trim();
  if (!key) return null;
  if (staffDirectoryStore(envMap) === "neon") {
    await ensureStaffAccountsTable(envMap, deps);
    const result = await runQuery(envMap, `SELECT * FROM staff_accounts WHERE sub=$1`, [key], deps);
    const row = result.rows?.[0];
    return row ? rowToRecord(row) : null;
  }
  return memoryAccounts.get(key) || null;
}

/**
 * People and access read surface, listing entries filtered by tenant --
 * ruling 1's "Sylvia sees who has access to her city's data at any time
 * without being handed an operational burden," and ruling 2's admin-only
 * gate (enforced by the caller, G-127's territory, not this function).
 */
export async function listStaffAccounts({ tenant } = {}, envMap = process.env, deps = {}) {
  const scope = String(tenant || "").trim();
  if (staffDirectoryStore(envMap) === "neon") {
    await ensureStaffAccountsTable(envMap, deps);
    const result = scope
      ? await runQuery(envMap, `SELECT * FROM staff_accounts WHERE tenant=$1 ORDER BY sub`, [scope], deps)
      : await runQuery(envMap, `SELECT * FROM staff_accounts ORDER BY tenant, sub`, [], deps);
    return (result.rows || []).map(rowToRecord);
  }
  const all = [...memoryAccounts.values()];
  return (scope ? all.filter((r) => r.tenant === scope) : all).sort((a, b) => a.sub.localeCompare(b.sub));
}

/**
 * The isRevoked hook src/staff-identity.mjs calls after every signature
 * verification. Two refusal-worthy states collapse to true here on purpose
 * (boolean is the identity module's contract) but are distinguishable by
 * calling getStaffAccount directly, which the People and access surface and
 * the offboarding-violation script both do rather than relying on this
 * boolean alone.
 */
export async function isStaffAccountRevoked(sub, envMap = process.env, deps = {}) {
  const record = await getStaffAccount(sub, envMap, deps);
  if (!record) return true; // not provisioned by us: refuse, never trust the token alone
  return record.status === "disabled";
}

/** Test-only: clears the in-memory store between test files/cases. */
export function _resetMemoryStoreForTests() {
  memoryAccounts.clear();
}
