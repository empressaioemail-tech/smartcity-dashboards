/**
 * ---------------------------------------------------------------------------
 * G-158. THE ACCESS LOG: ONE ROW, WRITTEN AT THE MOMENT A SIGNED-IN PERSON
 * READS A CITY'S RECORDS.
 *
 * WHY THIS FILE EXISTS. `_design/smartcity-people-and-access/` drew the audit
 * trail this product could not answer -- "Who looked" renders NOT RECORDED --
 * because a read of this repo found no write path recording a staff read
 * anywhere. It deliberately did not draw an empty table, because an empty table
 * reads as "nobody looked", which is a different answer and a false one. This
 * is the write path that lets that board be redrawn against something real.
 *
 * THE RECORD IS NOT THE POINT; THE REFUSAL IS. A trail with invisible holes is
 * worse than no trail, because it reads as complete. So there is no best-effort
 * write here: recordStaffRead THROWS on every failure rather than returning a
 * "logged nothing, carried on" result, and server.mjs's read gate turns that
 * throw into a typed refusal INSTEAD OF the records. A read that falls back to
 * serving when its log write failed is the defect this row exists to remove,
 * wearing the new code.
 *
 * FIVE THINGS ARE WRITTEN, and the four the row names are the first four:
 *   who           `sub`        the staff identity's own sub, never a display name
 *   which record  `city_key` + `route` + `record_id`
 *   which lens    `lens_id`    null when the read is not of one lens's records
 *   when          `read_at`
 *   whose reads   `tenant`     the READER's tenant: the scoping key
 *
 * `tenant` IS THE READER'S TENANT, NOT THE PACK'S. A bastrop_tx staff member
 * reading the demo pack writes tenant='bastrop_tx', city_key='template-city',
 * so a city's reads are found under the city that did the reading and never
 * under the city that was read. That is the clause this row is judged on: a
 * scoping claim tested only by reading its own tenant has not been tested.
 *
 * A BLANK TENANT IS REFUSED, NEVER WRITTEN AS ''. src/tenancy.mjs's
 * callerIsPackSubject already rules that a blank subject matches a blank
 * caller; a blank row here would appear under EVERY blank-tenant query, which
 * is precisely the cross-tenant appearance this log must not have. A verified
 * person whose token carries no tenant claim is a real, expected state --
 * src/staff-identity.mjs returns tenant: null for exactly that person -- and
 * their reads refuse: there is nowhere to file the record, and filing it
 * nowhere is not the same as filing it somewhere safe.
 *
 * WHY AN IN-MEMORY STORE IS REFUSED ON A DEPLOYED INSTANCE. Every other store
 * in this repo falls back to memory when DATABASE_URL is unset, and losing a
 * pack list or a re-provisionable directory row is an inconvenience. Losing an
 * audit log is not the same kind of thing: it dies with the process, and each
 * instance keeps its own, so "who looked" answers "nobody" for reads that
 * really happened. On a deployed instance (K_SERVICE set -- the same
 * deployment-posture signal src/tenancy.mjs's parseTenantKeyMap already reads)
 * with no DATABASE_URL, there is no durable store, so the write FAILS and the
 * read is refused. That is loud and fail-closed, which is the correct reading
 * of a deployment that cannot keep its own audit trail. Local runs and tests
 * carry no K_SERVICE and use memory, as every other store here does.
 *
 * DB / memory split follows src/staff-directory.mjs's convention exactly.
 * ---------------------------------------------------------------------------
 */
import { getPool } from "./db.mjs";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS staff_access_log (
  id BIGSERIAL PRIMARY KEY,
  sub TEXT NOT NULL,
  tenant TEXT NOT NULL,
  city_key TEXT NOT NULL,
  lens_id TEXT NULL,
  route TEXT NOT NULL,
  record_id TEXT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

const memoryRows = []; // id | sub | tenant | cityKey | lensId | route | recordId | readAt
let memoryNextId = 1;

/**
 * "memory" | "neon" | "none". "none" is not a store that holds nothing -- it is
 * the ABSENCE of a store, which this module refuses to write to or read from.
 * See the header: an unrecordable read is refused, and an unanswerable "who
 * looked" is not "nobody looked".
 */
export function accessLogStore(envMap = process.env) {
  if (String(envMap.DATABASE_URL || "").trim()) return "neon";
  if (String(envMap.K_SERVICE || "").trim()) return "none";
  return "memory";
}

/**
 * THE REFUSAL, TYPED. Thrown, never returned, so a caller cannot forget to
 * check it and serve the read anyway. server.mjs turns `error` and `message`
 * straight into the response body of a non-200, so the person is told this read
 * was refused and why rather than being handed a blank page.
 *
 * THE STATUS CARRIES WHICH KIND OF REFUSAL IT IS, because "you may not" and
 * "this deployment cannot keep its own audit trail" are different findings and
 * collapse badly:
 *   503  the STORE could not take the row. The service is at fault, the caller
 *        did nothing wrong, and the read is retryable exactly as a failing
 *        dependency is. CP1 pre-registered 503 for this case and this is it.
 *   403  the CALLER cannot have a row: a verified person with no tenant claim
 *        has no city to be filed under, and nothing about retrying changes that.
 *   500  this PRODUCT was called wrong -- a route that reached the gate without
 *        naming the city or the route it read. That is a hole in the trail
 *        caused by our own code, and it says so instead of blaming the caller.
 */
const REFUSAL_STATUS = {
  no_durable_store: 503,
  store_error: 503,
  no_tenant_claim: 403,
  no_subject: 403,
  no_city: 500,
  no_route: 500,
};

export class AccessLogWriteRefused extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "AccessLogWriteRefused";
    this.error = "access_log_write_failed";
    this.reason = reason;
    this.status = REFUSAL_STATUS[reason] || 500;
  }
}

async function runQuery(envMap, sql, params = [], deps = {}) {
  if (typeof deps.query === "function") return deps.query(sql, params);
  return getPool(envMap).query(sql, params);
}

export async function ensureStaffAccessLogTable(envMap = process.env, deps = {}) {
  await runQuery(envMap, CREATE_TABLE_SQL, [], deps);
  return true;
}

function rowFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    sub: row.sub,
    tenant: row.tenant,
    cityKey: row.city_key,
    lensId: row.lens_id,
    route: row.route,
    recordId: row.record_id,
    readAt: row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at,
  };
}

/**
 * One row, or a refusal. `entry` is { caller, cityKey, lensId, recordId, route,
 * at }; only a verified staff caller writes anything, and every other caller
 * kind returns `{recorded:false}` WITHOUT refusing, because a product key or an
 * anonymous visitor reading a public pack is not a person looking at a record
 * and was never going to have a row. Only a read that WOULD have a row and
 * cannot get one is refused.
 */
export async function recordStaffRead(entry, envMap = process.env, deps = {}) {
  const caller = entry?.caller;
  if (caller?.kind !== "staff") return { recorded: false, reason: "not_a_staff_read" };

  const sub = String(caller.sub || "").trim();
  if (!sub) {
    throw new AccessLogWriteRefused("no_subject", "the verified staff identity carries no sub, so this read cannot be attributed to anyone and is refused rather than written unattributed.");
  }
  const tenant = String(caller.tenant || "").trim();
  if (!tenant) {
    throw new AccessLogWriteRefused("no_tenant_claim", "this staff identity carries no tenant claim, so the read has no city to be filed under and is refused rather than written unscoped.");
  }
  const cityKey = String(entry?.cityKey || "").trim();
  if (!cityKey) {
    throw new AccessLogWriteRefused("no_city", "this read names no city, so the record would not say which city's records were opened and is refused rather than written vague.");
  }
  const route = String(entry?.route || "").trim();
  if (!route) {
    throw new AccessLogWriteRefused("no_route", "this read names no route, so the record would not say what was opened and is refused rather than written vague.");
  }
  // Shape only, not registry membership: a domain's own lensId is a nine-lens
  // value (police, fleet, ...) and only four lead lenses exist, so validating
  // against the lead list would refuse readings the product really serves.
  const lensId = typeof entry?.lensId === "string" && entry.lensId.trim() ? entry.lensId.trim() : null;
  const recordId = typeof entry?.recordId === "string" && entry.recordId.trim() ? entry.recordId.trim() : null;
  const readAt = (entry?.at instanceof Date ? entry.at : new Date()).toISOString();

  const row = { sub, tenant, cityKey, lensId, route, recordId, readAt };
  const store = accessLogStore(envMap);

  if (store === "none") {
    throw new AccessLogWriteRefused("no_durable_store", "this deployment has no durable store for the access log, so this read cannot be recorded and is refused rather than served unrecorded.");
  }

  let written;
  try {
    if (store === "neon") {
      await ensureStaffAccessLogTable(envMap, deps);
      const result = await runQuery(
        envMap,
        `INSERT INTO staff_access_log (sub, tenant, city_key, lens_id, route, record_id, read_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, sub, tenant, city_key, lens_id, route, record_id, read_at`,
        [row.sub, row.tenant, row.cityKey, row.lensId, row.route, row.recordId, row.readAt],
        deps,
      );
      written = rowFromDb(result.rows?.[0]) || row;
    } else {
      written = { id: memoryNextId++, ...row };
      memoryRows.push(written);
    }
  } catch (err) {
    if (err instanceof AccessLogWriteRefused) throw err;
    throw new AccessLogWriteRefused("store_error", `the access log store refused the write, so this read is refused rather than served unrecorded: ${err?.message || err}`);
  }

  return { recorded: true, row: written };
}

/**
 * The read half. A tenant is REQUIRED and an unscoped listing is not offered:
 * `{tenant: undefined}` answering with every city's rows is the same defect as
 * the blank row, one function over.
 *
 * On a deployment with no durable store this REFUSES rather than returning [].
 * An empty list would read as "nobody looked", which is the one answer this
 * whole file exists to avoid giving -- see DEV_PROCESS 4.3, an absent
 * instrument is not an empty result.
 */
export async function listStaffAccessLog({ tenant } = {}, envMap = process.env, deps = {}) {
  const scope = String(tenant || "").trim();
  if (!scope) {
    throw new Error("listStaffAccessLog requires a tenant: an unscoped read would show one city's reads under another's.");
  }
  const store = accessLogStore(envMap);
  if (store === "none") {
    throw new Error("this deployment has no durable access-log store, so 'who looked' cannot be answered from it; an empty list here would read as 'nobody looked'.");
  }
  if (store === "neon") {
    await ensureStaffAccessLogTable(envMap, deps);
    const result = await runQuery(
      envMap,
      `SELECT id, sub, tenant, city_key, lens_id, route, record_id, read_at
         FROM staff_access_log
        WHERE tenant = $1
        ORDER BY read_at, id`,
      [scope],
      deps,
    );
    return (result.rows || []).map(rowFromDb);
  }
  return memoryRows
    .filter((r) => r.tenant === scope)
    .slice()
    .sort((a, b) => (a.readAt === b.readAt ? a.id - b.id : a.readAt.localeCompare(b.readAt)));
}

/** Test-only: clears the in-memory store between test files/cases. */
export function _resetAccessLogForTests() {
  memoryRows.length = 0;
  memoryNextId = 1;
}
