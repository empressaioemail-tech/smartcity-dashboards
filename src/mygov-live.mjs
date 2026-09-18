/* --------------------------------------------------------- mygov live (rest)

G-116 Phase 2, second batch. The other four real MyGov-family reads,
alongside mygov-permits.mjs (left untouched -- already shipped, additive
only, no rebuilding what already works). Same architecture: a separate
module from fixture-seam.mjs/composeDomain, branched at the server.mjs
route level, origin "feed" records, real status values kept as-is rather
than force-mapped onto each domain's own invented fixture taxonomy
(WORK_ORDER_STATUS_VALUES, INSPECTION_STATUS_VALUES/RESULT_VALUES,
CODE_CASE_STATUS_VALUES, LICENSE_STATUS_VALUES -- adapters.mjs). The same
reasoning mygov-permits.mjs's header names for permits applies identically
here: none of these four fixture enums have been checked against real
MyGov vocabulary, and guessing a mapping would assert confidence nobody
has earned. Real records carry their real status; extras.realStatusCounts
groups honestly instead.
*/

import { opaqueRefs, refusalBasis } from "./record-identity.mjs";
import { compareLicenseRoll, expiryLabelFor } from "./domains/business-licenses.mjs";

const DEFAULT_PLATFORM_BASE = "https://smartcity-api-7dyaiy7wha-uc.a.run.app/api/platform/mygov";

function platformBase(env = process.env) {
  return String(env.MYGOV_PLATFORM_BASE || DEFAULT_PLATFORM_BASE).trim();
}

function platformKey(env = process.env) {
  return String(env.PLATFORM_INTERNAL_API_KEY || "").trim();
}

/** Shared fetch for every resource under /api/platform/mygov/<path>. */
async function fetchLiveResource(path, listKey, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const key = platformKey(env);
  if (!key) {
    return { status: "unavailable", basis: "PLATFORM_INTERNAL_API_KEY unset", rows: [] };
  }
  let res;
  try {
    res = await fetchImpl(`${platformBase(env)}/${path}`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { status: "unavailable", basis: `mygov platform fetch failed: ${err.message}`, rows: [] };
  }
  if (!res.ok) {
    return { status: "unavailable", basis: `mygov platform HTTP ${res.status}`, rows: [] };
  }
  const body = await res.json();
  const rows = Array.isArray(body?.[listKey]) ? body[listKey] : [];
  return { status: "ok", basis: body?.contract || "live", rows };
}

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

function envelope(pack, domain) {
  return {
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
}

/** Runs one live resource end to end: fetch, map, wrap in the standard envelope. */
async function composeLiveResource(pack, domain, { path, listKey, mapRow, opts = {}, refuse = null, order = null }) {
  const base = envelope(pack, domain);
  const fetched = await fetchLiveResource(path, listKey, opts);
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
  const records = fetched.rows.map((row) => mapRow(row, pack.cityKey));
  if (refuse) refuseNames(records, fetched.rows, refuse);
  if (order) records.sort(order);
  if (records.length === 0) {
    return {
      ...base,
      granted: true,
      generated: false,
      status: "granted-empty",
      basis: `${domain.gatedBy} is granted on ${pack.cityKey} and the live read returned zero ${domain.recordType} records`,
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
    countingRule: `${records.length} real ${domain.recordType} records read live from smartcity-os for ${pack.cityKey}, one row per record`,
    records,
    extras: { realStatusCounts: realStatusCounts(records) },
  };
}

/* ------------------------------------------------------------ work orders */

/**
 * G-154. THE REFUSAL, APPLIED ONCE PER READ RATHER THAN PER ROW.
 *
 * A reference has to be stable across the rows that share a name - every case
 * assigned to one officer reads OFF-03, not OFF-03 on one row and OFF-05 on the
 * next - so the mapping is built from the whole population before it is written
 * back. See src/record-identity.mjs for the rule itself and for why this is a
 * refusal rather than a classification.
 *
 * `clear` names the field the refusal replaces, and it is set to null rather
 * than left as the vendor's string: a record that still carried the name in a
 * second field would put it one renderer edit away from a cell.
 */
function refuseNames(records, rows, { dimension, rowField, field, clear }) {
  const refs = opaqueRefs(
    dimension,
    rows.map((row) => row && row[rowField]),
  );
  const basis = refs.size
    ? `${refusalBasis(dimension, `row.${rowField}`)}; ${refs.size} distinct ${dimension} name(s) refused on this read`
    : `the source named no ${dimension} on this read`;
  for (let i = 0; i < records.length; i += 1) {
    const name = rows[i] ? rows[i][rowField] : null;
    records[i][field] = typeof name === "string" && refs.has(name) ? refs.get(name) : null;
    if (clear) records[i][clear] = null;
    records[i].nameRefusedBasis = basis;
  }
}

export function mapRealWorkOrderRecord(row, cityKey) {
  return {
    recordId: String(row.workOrderNumber || row.externalId || row.id || "").trim() || `unknown-${row.id ?? "0"}`,
    kind: "mygov",
    recordType: "work-order",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    subject: row.type || "Untitled work order",
    /**
     * G-154, the work-order half of the dispatch's free-text check. This field
     * used to be `row.title || row.type`, and `row.title` is where a citizen
     * writes their name and their phone number: the capture this lens' design
     * was drawn from carries `DEBORAH MOORE, PH#737-762-6252` in exactly this
     * position. A shape test cannot separate that from a legitimate title, so
     * the free-text field backs no rendered cell at all and the declared
     * work-order type takes its place - which is what the design folder's Work
     * orders artboard draws in that column. Same move as the code-violation
     * `description` refusal below (G-123).
     */
    status: String(row.statusNormalized || row.status || "unknown"),
    place: {
      label: row.address || "Address not on record",
      parcelNodeId: null,
      parcelBasis: "work orders are not attached to a parcel id on the source system",
    },
    department: row.department || null,
    assignedTo: row.assignedTo || null,
    // smartcity-os's platform route now maps work-order rows through
    // parseWOEnriched (the same function the real staff dashboard's own
    // session-gated route already used) instead of returning the bare DB
    // row -- contractor is a real column, and fees is the real itemized
    // {type, amount}[] array that only lived inside the row's enrichmentData
    // blob, not a top-level column, until that fix.
    contractor: row.contractor || null,
    fees: row.fees ?? null,
    dueDate: row.dueDate || null,
    provenance: {
      source: "smartcity-os /api/platform/mygov/work-orders",
      basis: "in_mygov_active_list=true, per that service's own documented accuracy contract",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not cached, not generated",
    },
  };
}

export async function composeRealWorkOrders(pack, domain, opts = {}) {
  return composeLiveResource(pack, domain, {
    path: "work-orders",
    listKey: "workOrders",
    mapRow: mapRealWorkOrderRecord,
    opts,
    /**
     * NO refusal descriptor here, and that is a MEASURED decision rather than an
     * omission. The Work orders table's own headers (the design folder's
     * WorkOrders artboard, and web/app.js's row builder) are
     *
     *   WO # | Type | Address | Department | Status | Opened
     *
     * and there is no person column among them, so no staff name has a cell to
     * land in. Each candidate field was checked against the served surface
     * individually rather than assumed:
     *
     *   assignedTo - zero reads in web/app.js or web/index.html. Backs nothing.
     *   contractor - the only occurrence in either file is prose in index.html
     *                ("Applicant / contractor portals"), not a record read.
     *   department - IS rendered, at web/app.js:1448 (td(record.department,
     *                "t-data")), and it SHOULD be: the artboard draws a
     *                department in that column ("Water / Wastewater"), and a
     *                department is an organisational unit, not a person. It is
     *                left rendered deliberately, not overlooked.
     *
     * So the only field here that reached a cell carrying a human was `title`,
     * via `subject`, and that refusal is in the mapper above.
     */
  });
}

/* ------------------------------------------------------------- inspections */

export function mapRealInspectionRecord(row, cityKey) {
  return {
    recordId: String(row.id || "").trim() || `unknown-inspection`,
    kind: "mygov",
    recordType: "inspection",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    subject: row.type || "Untitled inspection",
    status: String(row.status || "unknown"),
    result: row.result || null,
    place: {
      label: row.address || "Address not on record",
      parcelNodeId: null,
      parcelBasis: "inspections are not attached to a parcel id on the source system",
    },
    permitNumber: row.permitNumber || null,
    /**
     * G-154. `row.inspector` is a real staff name and it USED to back this
     * field, which the Inspections table renders in its own column, one cell
     * away from the property address. The design folder's Inspections artboard
     * draws `INS-01` in that cell, and the product's own doctrine for the load
     * dimension next door is "the dimension survives, the person does not". So
     * the mapper carries no name, and composeRealInspections writes a
     * deterministic reference in its place.
     */
    inspector: null,
    scheduledDate: row.scheduledDate || null,
    completedDate: row.completedDate || null,
    // Not in the original field list, but a real field: smartcity-os's
    // dbInspectionToApi already returns it (no OS-side change needed), and
    // the real staff dashboard shows it under each inspection
    // (DevelopmentServicesDashboard.tsx's insp.comments block).
    comments: row.comments || null,
    provenance: {
      source: "smartcity-os /api/platform/mygov/inspections",
      basis: "tenant-scoped, no active-list flag exists for this resource",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not cached, not generated",
    },
  };
}

export async function composeRealInspections(pack, domain, opts = {}) {
  return composeLiveResource(pack, domain, {
    path: "inspections",
    listKey: "inspections",
    mapRow: mapRealInspectionRecord,
    opts,
    refuse: { dimension: "inspector", rowField: "inspector", field: "inspectorRef", clear: "inspector" },
  });
}

/* -------------------------------------------------------- code violations */

export function mapRealCodeViolationRecord(row, cityKey) {
  return {
    recordId: String(row.caseNumber || row.id || "").trim() || `unknown-violation`,
    kind: "mygov",
    recordType: "code-violation",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    /**
     * G-123 PII finding: row.description is the vendor's free-text field
     * (citizen names, complaint addresses per this lane's dispatch) and must
     * never back a rendered field. The fallback chain stops at "Untitled
     * violation" rather than reaching for it.
     */
    subject: row.type || "Untitled violation",
    status: String(row.status || "unknown"),
    place: {
      label: row.address || "Address not on record",
      parcelNodeId: row.parcelId || null,
      parcelBasis: row.parcelId ? undefined : "no parcel id on the source violation record",
    },
    /**
     * G-154. `row.assignedOfficer` is a real staff name and it USED to back
     * this field, which the Code enforcement table renders in its own column,
     * one cell away from the property address. The design folder's Code
     * enforcement artboard draws `OFF-01` in that cell. The name is refused;
     * composeRealCodeViolations writes the reference.
     */
    assignedOfficer: null,
    reportedDate: row.reportedDate || null,
    // dbViolationToApi (smartcity-os) already returns this real column;
    // not previously read here.
    resolvedDate: row.resolvedDate || null,
    isRepeatOffender: row.isRepeatOffender ?? null,
    provenance: {
      source: "smartcity-os /api/platform/mygov/code-violations",
      basis: "tenant-scoped, no active-list flag exists for this resource",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not cached, not generated",
    },
  };
}

export async function composeRealCodeViolations(pack, domain, opts = {}) {
  return composeLiveResource(pack, domain, {
    path: "code-violations",
    listKey: "violations",
    mapRow: mapRealCodeViolationRecord,
    opts,
    refuse: { dimension: "officer", rowField: "assignedOfficer", field: "officerRef", clear: "assignedOfficer" },
  });
}

/* ------------------------------------------------------- business licenses */

/**
 * Days from the read to a licence's real expirationDate, floored to whole days
 * because every label and every band boundary in this lens is an integer.
 *
 * Returns null for anything that is not a readable date, and null is NOT zero:
 * a licence whose date could not be read must sort last and state no label,
 * rather than claim it expires today. Date-only strings are read as UTC
 * midnight so two machines in two timezones do not disagree about which day a
 * licence expires on - which is the same class of bug that made the a11y gate
 * record a typeface witness.
 */
export function expiryOffsetFrom(expirationDate, now = new Date()) {
  if (!expirationDate) return null;
  const text = String(expirationDate).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const then = new Date(dateOnly ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(then.getTime())) return null;
  const MS_PER_DAY = 86400000;
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((then.getTime() - midnight) / MS_PER_DAY);
}

export function mapRealBusinessLicenseRecord(row, cityKey) {
  /**
   * G-154, the sort key. The design folder's Licenses artboard orders the roll
   * by expiry offset within a status band, and the fixture generator has always
   * sorted that way (compareLicenseRoll, src/domains/business-licenses.mjs). The
   * live read carried no offset at all, so there was nothing to order by and
   * the compose below rendered the vendor's own row order. The offset is
   * DERIVED from the record's real expirationDate against the read's own clock,
   * and it is null - never a guess - when the date is missing or unparsable.
   */
  const expiryOffsetDays = expiryOffsetFrom(row.expirationDate);
  return {
    recordId: String(row.licenseNumber || row.id || "").trim() || `unknown-license`,
    kind: "mygov",
    recordType: "business-license",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    /**
     * G-154. `row.businessName` is the vendor's free-text holder name and it
     * USED to back this field, which the Licenses table renders in its Holder
     * column, immediately beside the licence's address. Some business names are
     * businesses and some are a sole trader's own name, and no shape test tells
     * those apart - see src/record-identity.mjs. The name is refused;
     * composeRealBusinessLicenses writes an opaque `HLD-01` reference, which is
     * what the design folder's Licenses artboard draws in that column.
     */
    subject: null,
    status: String(row.status || "unknown"),
    place: {
      label: row.address || "Address not on record",
      parcelNodeId: null,
      parcelBasis: "business licenses are not attached to a parcel id on the source system",
    },
    /** LEFT AS READ, AND NOT CLAIMED TO BE THE HOLDER. It renders nowhere
     *  (zero reads of `record.owner` in web/), and this lane has no evidence of
     *  what a real `row.owner` holds - the licence rows it has seen carry no
     *  `owner` at all. Clearing it would be a refusal justified by a guess, so
     *  it is recorded as an OPEN question in this lane's close instead. */
    owner: row.owner || null,
    issuedDate: row.issuedDate || null,
    expirationDate: row.expirationDate || null,
    expiryOffsetDays,
    expiryLabel: Number.isInteger(expiryOffsetDays) ? expiryLabelFor(expiryOffsetDays) : null,
    // The platform route's business-licenses mapping already returns this
    // real column (row.type); named licenseType here rather than the bare
    // "type" to stay unambiguous next to this record's own fixed
    // recordType ("business-license").
    licenseType: row.type || null,
    provenance: {
      source: "smartcity-os /api/platform/mygov/business-licenses",
      basis: "tenant-scoped, no active-list flag exists for this resource",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not cached, not generated",
    },
  };
}

export async function composeRealBusinessLicenses(pack, domain, opts = {}) {
  return composeLiveResource(pack, domain, {
    path: "business-licenses",
    listKey: "licenses",
    mapRow: mapRealBusinessLicenseRecord,
    opts,
    refuse: { dimension: "holder", rowField: "businessName", field: "holderRef", clear: "subject" },
    /**
     * G-154, acceptance item 3: "the licence rows are in the design's sort
     * order". The generator has always sorted the roll; the live compose
     * rendered the vendor's arrival order. Same comparator, imported rather
     * than re-written, so the two surfaces cannot drift.
     */
    order: compareLicenseRoll,
  });
}
