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
async function composeLiveResource(pack, domain, { path, listKey, mapRow, opts = {} }) {
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

export function mapRealWorkOrderRecord(row, cityKey) {
  return {
    recordId: String(row.workOrderNumber || row.externalId || row.id || "").trim() || `unknown-${row.id ?? "0"}`,
    kind: "mygov",
    recordType: "work-order",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    subject: row.title || row.type || "Untitled work order",
    status: String(row.statusNormalized || row.status || "unknown"),
    place: {
      label: row.address || "Address not on record",
      parcelNodeId: null,
      parcelBasis: "work orders are not attached to a parcel id on the source system",
    },
    department: row.department || null,
    assignedTo: row.assignedTo || null,
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
    inspector: row.inspector || null,
    scheduledDate: row.scheduledDate || null,
    completedDate: row.completedDate || null,
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
    subject: row.type || row.description || "Untitled violation",
    status: String(row.status || "unknown"),
    place: {
      label: row.address || "Address not on record",
      parcelNodeId: row.parcelId || null,
      parcelBasis: row.parcelId ? undefined : "no parcel id on the source violation record",
    },
    assignedOfficer: row.assignedOfficer || null,
    reportedDate: row.reportedDate || null,
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
  });
}

/* ------------------------------------------------------- business licenses */

export function mapRealBusinessLicenseRecord(row, cityKey) {
  return {
    recordId: String(row.licenseNumber || row.id || "").trim() || `unknown-license`,
    kind: "mygov",
    recordType: "business-license",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    subject: row.businessName || row.type || "Untitled license",
    status: String(row.status || "unknown"),
    place: {
      label: row.address || "Address not on record",
      parcelNodeId: null,
      parcelBasis: "business licenses are not attached to a parcel id on the source system",
    },
    owner: row.owner || null,
    issuedDate: row.issuedDate || null,
    expirationDate: row.expirationDate || null,
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
  });
}
