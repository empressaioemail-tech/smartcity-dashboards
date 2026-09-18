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
import { opaqueRefs, refusalBasis } from "./record-identity.mjs";

/**
 * G-126 defect 2. smartcity-os's platform route (server/routes/mygov.ts,
 * read 2026-09-14, ABSOLUTE NO-TOUCH) hardcodes its own query to
 * `eq(mygovPermits.tenantId, await getBastropTenantId())` server-side and
 * accepts no tenant parameter from the caller -- and dbPermitToApi, the
 * exact shape this route returns, drops tenantId from its output entirely.
 * There is no field on `row` a caller can compare against its own pack.
 * "Build the paired control" (this mission's own instruction) therefore
 * cannot mean a per-row check here without inventing a field or changing
 * smartcity-os, both explicitly out of bounds. What CAN be built, entirely
 * inside this repo: this feed is verified correct for exactly the one
 * tenant that hardcoded query serves, so refuse to run it for any other
 * pack rather than silently stamping that pack's cityKey onto Bastrop's
 * real rows.
 *
 * This is reachable without any smartcity-os change. mygovPermitsGrantFor /
 * platformGrantForKind (adapters.mjs) gate this feed on a pack merely
 * HOLDING a `{ kind: "mygov" }` object in grantedAdapters; PLATFORM_MYGOV_
 * PERMITS_GRANT is one city-agnostic constant, and for a DB-backed pack
 * grantedAdapters comes straight off a `granted_adapters` column
 * (city-pack.mjs) -- settable by an ordinary row write, no code review, no
 * deploy. Nothing before this check stops a second pack from acquiring
 * that same grant and reaching mapRealPermitRecord.
 *
 * WHAT WOULD ACTUALLY CLOSE THE UPSTREAM GAP (out of this mission's scope,
 * recorded for whoever picks it up): smartcity-os's dbPermitToApi would
 * need to surface the row's own tenantId (or a public-safe city identifier
 * derived from it) so a caller-side check could compare the RECORD's
 * tenant, not just the feed's known-good default.
 */
export const VERIFIED_MYGOV_PERMITS_TENANT = "bastrop_tx";
export function assertVerifiedMygovTenant(cityKey) {
  if (cityKey !== VERIFIED_MYGOV_PERMITS_TENANT) {
    throw new Error(
      `mygov real feed is verified live for ${VERIFIED_MYGOV_PERMITS_TENANT} only ` +
        `(smartcity-os hardcodes its own tenant query and returns no tenant field to ` +
        `check a record against); refusing to stamp its rows onto ${cityKey}`,
    );
  }
}

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
  assertVerifiedMygovTenant(cityKey);
  const recordId = String(row.permitNumber || row.id || "").trim();
  return {
    recordId: recordId || `unknown-${row.id ?? "0"}`,
    kind: "mygov",
    recordType: "permit-case",
    cityKey,
    origin: "feed",
    accessPolicy,
    /**
     * G-123 PII finding: row.description is the vendor's free-text field and
     * the class of column this lane's dispatch names by example (citizen
     * names, phone numbers). It must never back a rendered field, so the
     * fallback chain stops at row.type rather than reaching for it -- a
     * permit with neither a title nor a type states that absence instead.
     */
    subject: row.title || row.type || "Untitled permit",
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
    //
    // G-154. `applicant` IS NOT THE VENDOR'S STRING ANY MORE, and the Pipeline
    // table is why: it renders this field in its own column, immediately beside
    // the permit's address, and for a residential permit the applicant is the
    // homeowner. It used to be `row.applicant || null` and reached the cell
    // verbatim. composeRealPermits now writes a deterministic `APP-01`
    // reference in its place - the same value the design folder's Pipeline
    // artboard draws in that cell - and the refusal is a refusal rather than a
    // test because "Hill Country Homes" and "Deborah Ann Moore" have one shape.
    // See src/record-identity.mjs.
    applicant: null,
    contractor: row.contractor || null,
    /**
     * LEFT AS READ, DELIBERATELY, AND IT IS NOT THE APPLICANT. The first pass at
     * this lane cleared `ownerName` on the theory that it is the same human as
     * the applicant; the real row disproves it - the feature's own sample row
     * (src/mygov-permits.test.mjs) has applicant "Redwood Development LLC" and
     * ownerName "Bastrop County", two different entities, one of them not a
     * person at all. Measured, `record.ownerName` has zero reads in web/, so it
     * backs no cell and there is nothing to refuse. Refusing it on a guess about
     * its content would be a change no later reader could audit. Its content
     * population is recorded as OPEN in this lane's close instead.
     */
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
  // G-126 defect 2: checked before the network call, not just inside the
  // row mapper -- a mis-granted pack should not spend the platform key on
  // a read this feed can never correctly serve it.
  assertVerifiedMygovTenant(pack.cityKey);
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
  /**
   * G-154. The applicant refusal, written back onto the field the Pipeline row
   * builder already renders (`record.applicant`) rather than onto a new one:
   * web/app.js is shared rendering and this lane does not edit it, and the
   * artboard draws the reference in that same cell, so the surface does not
   * need to learn a second field name.
   */
  const applicantRefs = opaqueRefs(
    "applicant",
    fetched.records.map((row) => row && row.applicant),
  );
  const applicantBasis = applicantRefs.size
    ? `${refusalBasis("applicant", "row.applicant")}; ${applicantRefs.size} distinct applicant name(s) refused on this read`
    : "the source named no applicant on this read";
  for (let i = 0; i < records.length; i += 1) {
    const name = fetched.records[i] ? fetched.records[i].applicant : null;
    records[i].applicant =
      typeof name === "string" && applicantRefs.has(name) ? applicantRefs.get(name) : null;
    records[i].applicantBasis = applicantBasis;
  }
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
