/* ------------------------------------------------------ mygov permits (live)

G-116 Phase 2. The first genuinely real (non-fixture) domain feed on this
product. Reads smartcity-os's platform-internal endpoint
(GET /api/platform/mygov/permits) server-to-server -- Bastrop's own,
already-synced, already-repaired active permits.

Deliberately a SEPARATE module from fixture-seam.mjs, not a branch inside
composeDomain: that file's own header states its contract plainly --
"it is not a feed: nothing here reads a city, a vendor, or a network" --
and composeDomain's guards (assertNoRealWorldContent,
assertDeclaredVocabulary, the FIX-#### format) exist specifically to catch
a FIXTURE that looks real. Running genuinely real Bastrop permit data
through those same guards would be a category error, not a safety check.

REAL STATUS VALUES, NOT MAPPED ONTO THE FIXTURE TAXONOMY -- READ THIS
BEFORE "FIXING" IT. This service's own permits-pipeline domain
(src/domains/permits-pipeline.mjs) uses an invented four-value pipeline
stage (overdue / in-review / awaiting-applicant / ready-to-issue). Real
Bastrop MyGov permits carry a completely different, real vocabulary
(sampled live 2026-09-03: active, in-review, pending, completed -- only
one value overlaps). smartcity-os's OWN mygov.ts names the field these
come from ("status_normalized") as "unreliable for permits -- do not use
for counts" in its own documented data-accuracy contract. Guessing a
mapping onto the fixture's four stages would assert a confidence
smartcity-os's own team explicitly disclaims for this exact field. Real
records carry their REAL status as-is; the fixture's CASE_STATUS_VALUES
severity/label lookup (permits-pipeline.mjs's severityRank, RECORD_SHAPES.
mygov's enum in adapters.mjs) does not apply to them and is not forced to.
This is a named, deliberate residual, not an oversight -- see G-116's
close artifact for the honest coverage picture.
*/

const DEFAULT_MYGOV_PLATFORM_URL = "https://smartcity-api-7dyaiy7wha-uc.a.run.app/api/platform/mygov/permits";

function platformUrl(env = process.env) {
  return String(env.MYGOV_PLATFORM_URL || DEFAULT_MYGOV_PLATFORM_URL).trim();
}

function platformKey(env = process.env) {
  return String(env.PLATFORM_INTERNAL_API_KEY || "").trim();
}

/**
 * Maps one real dbPermitToApi-shaped row (smartcity-os's own existing shape,
 * reused rather than re-derived) onto this product's record envelope
 * (RECORD_ENVELOPE_FIELDS, adapters.mjs). origin "feed", never "fixture" --
 * that single field is the whole honesty mechanism the rest of this product
 * already keys off of.
 */
export function mapRealPermitRecord(row, cityKey, accessPolicy) {
  const recordId = String(row.permitNumber || row.id || "").trim();
  return {
    recordId: recordId || `unknown-${row.id ?? "0"}`,
    kind: "mygov",
    recordType: "permit-case",
    cityKey,
    origin: "feed",
    accessPolicy,
    subject: row.title || row.description || row.type || "Untitled permit",
    // Real, not fixture -- see module header. Not one of CASE_STATUS_VALUES.
    status: String(row.derivedStatus || row.status || "unknown"),
    place: {
      label: row.address || "Address not on record",
      parcelNodeId: row.parcelId || null,
      parcelBasis: row.parcelId ? undefined : "no parcel id on the source permit record",
    },
    department: row.department || null,
    manager: row.manager || null,
    // dbPermitToApi (smartcity-os) already reads these straight off the
    // mygov_permits row -- applicant/contractor/ownerName are real columns
    // and fees is a real jsonb {type, amount}[] column populated from the
    // MyGov fee reports (see that file's own DATA ACCURACY CONTRACT header:
    // "FEES: mygov_fees table"). Not previously read here even though the
    // platform route already returned them.
    applicant: row.applicant || null,
    contractor: row.contractor || null,
    ownerName: row.ownerName || null,
    fees: Array.isArray(row.fees) ? row.fees : [],
    submittedDate: row.submittedDate || null,
    issuedDate: row.issuedDate || null,
    expirationDate: row.expirationDate || null,
    provenance: {
      source: "smartcity-os /api/platform/mygov/permits",
      basis: "in_mygov_active_list=true, per that service's own documented accuracy contract",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not cached, not generated",
    },
  };
}

/** Groups real records by their REAL status value. Not the fixture's tiles. */
export function realStatusCounts(records) {
  const counts = {};
  for (const r of records) {
    const key = r.status || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The one live HTTP call. No query params sent -- the source endpoint
 * accepts none by design (see its own comment: a fixed, correct query, not
 * a filtering surface for an external caller).
 */
export async function fetchRealPermits({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const url = platformUrl(env);
  const key = platformKey(env);
  if (!key) {
    return { status: "unavailable", basis: "PLATFORM_INTERNAL_API_KEY unset", records: [] };
  }
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { status: "unavailable", basis: `mygov platform fetch failed: ${err.message}`, records: [] };
  }
  if (!res.ok) {
    return { status: "unavailable", basis: `mygov platform HTTP ${res.status}`, records: [] };
  }
  const body = await res.json();
  const rows = Array.isArray(body?.permits) ? body.permits : [];
  return { status: "ok", basis: body?.contract || "live", records: rows };
}

/**
 * The real-branch equivalent of composeDomain's success envelope -- same
 * field names, so the compose layer and any caller reading the JSON does
 * not need to know which branch produced it, except via `source`. `status`
 * here is this envelope's OWN status (ok/unavailable/no-fixture-source-
 * equivalent), unrelated to each record's own real permit status field.
 */
export async function composeRealPermits(pack, domain, grant, { env = process.env, fetchImpl } = {}) {
  const base = {
    domainId: domain.id,
    lensId: domain.lensId,
    region: domain.region,
    cityKey: pack.cityKey,
    displayName: pack.displayName,
    environment: pack.environment,
    kind: domain.gatedBy,
    recordType: domain.recordType,
    gatedBy: domain.gatedBy,
    source: "live",
  };
  const fetched = await fetchRealPermits({ env, fetchImpl });
  if (fetched.status !== "ok") {
    return {
      ...base,
      granted: true,
      generated: false,
      status: "unavailable",
      basis: fetched.basis,
      recordCount: 0,
      countingRule: `no records: ${fetched.basis}`,
      records: [],
      extras: {},
    };
  }
  const records = fetched.records.map((row) => mapRealPermitRecord(row, pack.cityKey, grant.accessPolicy));
  if (records.length === 0) {
    return {
      ...base,
      granted: true,
      generated: false,
      status: "granted-empty",
      basis: `mygov is granted on ${pack.cityKey} and the live read returned zero active permits`,
      recordCount: 0,
      countingRule: `no records: ${fetched.basis}`,
      records: [],
      extras: {},
    };
  }
  return {
    ...base,
    granted: true,
    generated: false,
    status: "ok",
    basis: fetched.basis,
    recordCount: records.length,
    countingRule: `${records.length} real active permit records read live from smartcity-os for ${pack.cityKey}, one row per permit`,
    records,
    extras: { realStatusCounts: realStatusCounts(records) },
  };
}
