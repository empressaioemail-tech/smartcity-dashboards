/* -------------------------------------------------------------- vendor live

G-116 Phase 2, third batch. The five non-mygov real feeds: fleet-vehicles
(Samsara), patrol-vehicles (Spireon), fire-apparatus (FirstDue),
cip-projects (PowerBI), call-analytics (GoTo). Same architecture as
mygov-permits.mjs/mygov-live.mjs (both untouched -- additive only): a
separate module from fixture-seam.mjs/composeDomain, branched at the
server.mjs route level, records carry origin "feed".

REAL STATUS VALUES, SAME STANCE AS EVERY MYGOV DOMAIN. Fleet/patrol
vehicle status is not force-mapped onto VEHICLE_STATUS_VALUES (this
product's own invented out-of-service/inspection-due/in-shop/in-service
taxonomy) -- real Samsara/Spireon data has no such classification; it has
raw telemetry (engineState, nspireStatus). Real status is kept as-is.

TWO OF FIVE ARE HONESTLY UNAVAILABLE TODAY, NOT BROKEN. Live-verified
2026-09-03: Samsara, Spireon and PowerBI return real data. FirstDue
returns a real, specific 403 (the source route's own code already
documents this: current API credentials lack apparatus/assets scope,
contact dashboards@firstarriving.com). GoTo returns "not authorized"
(needsAuth: true) -- the OAuth consent flow (GET /api/goto/authorize) has
never been completed by a human. Neither is a code defect; both need a
real-world action outside engineering. This module reports whichever
state is genuinely true each time it's called, not a cached assumption.
*/

function platformKey(env = process.env) {
  return String(env.PLATFORM_INTERNAL_API_KEY || "").trim();
}

async function fetchLiveJson(url, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const key = platformKey(env);
  if (!key) {
    return { status: "unavailable", basis: "PLATFORM_INTERNAL_API_KEY unset", body: null };
  }
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { status: "unavailable", basis: `platform fetch failed: ${err.message}`, body: null };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const basis = body?.message || body?.error || `platform HTTP ${res.status}`;
    return { status: "unavailable", basis, body };
  }
  return { status: "ok", basis: "live", body };
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

function unavailableResult(base, basis) {
  return {
    ...base,
    granted: true,
    generated: false,
    status: "unavailable",
    basis,
    recordCount: 0,
    countingRule: `no records: ${basis}`,
    records: [],
    extras: {},
  };
}

function okResult(base, records, basis, denominatorLabel) {
  if (records.length === 0) {
    return {
      ...base,
      granted: true,
      generated: false,
      status: "granted-empty",
      basis: `${base.gatedBy} is granted on ${base.cityKey} and the live read returned zero ${denominatorLabel}`,
      recordCount: 0,
      countingRule: `no records: ${basis}`,
      records: [],
      extras: {},
    };
  }
  return {
    ...base,
    granted: true,
    generated: false,
    status: "ok",
    basis,
    recordCount: records.length,
    countingRule: `${records.length} real ${denominatorLabel} read live from smartcity-os for ${base.cityKey}`,
    records,
    extras: { realStatusCounts: realStatusCounts(records) },
  };
}

/* --------------------------------------------------------------- samsara */

export function mapRealFleetVehicleRecord(row, cityKey) {
  return {
    recordId: String(row.id || "").trim() || `unknown-vehicle`,
    kind: "samsara",
    recordType: "fleet-vehicle",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    unitLabel: row.name || `${row.make || ""} ${row.model || ""}`.trim() || "Unnamed unit",
    status: String(row.stats?.engineState || "unknown"),
    operator: null,
    department: (row.tags || [])[0] || null,
    make: row.make || null,
    model: row.model || null,
    vin: row.vin || null,
    odometerMiles: row.stats?.odometerMiles ?? row.stats?.obdOdometerMiles ?? null,
    fuelPercent: row.stats?.fuelPercent ?? null,
    /**
     * G-116 fleet-enrich. Real DVIR/safety-event/threshold fields, added to
     * the platform route the same week -- see server/routes/samsara.ts.
     * dvirUnresolvedDefects/dvirLastInspection are null when Samsara has no
     * inspection on record for this vehicle (not the same as zero defects,
     * which the route reports as unresolvedDefectCount: 0). safetyEvents7d
     * is a real trailing-7-day count already scoped by the route; null only
     * if that call itself failed upstream. highMileage/lowFuel are the same
     * >100k mi / <20% fuel threshold flags the real Fleet Management page
     * (smartcity-os client/src/pages/FleetManagement.tsx) already computes
     * from this same stats data -- null when the underlying reading is
     * unknown, never guessed.
     */
    dvirUnresolvedDefects: row.dvir?.unresolvedDefectCount ?? null,
    dvirLastInspection: row.dvir?.lastInspection ?? null,
    safetyEvents7d: row.safetyEvents7d ?? null,
    highMileage: row.stats?.highMileage ?? null,
    lowFuel: row.stats?.lowFuel ?? null,
    provenance: {
      source: "smartcity-os /api/platform/samsara/vehicles",
      basis: "cachedFetch('vehicles', '/fleet/vehicles') + stats batch, 60s TTL, + fetchDvirs()/fetchSafetyEvents() (30-day/7-day windows), 5-min TTL",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not generated",
    },
  };
}

export async function composeRealFleetVehicles(pack, domain, opts = {}) {
  const base = envelope(pack, domain);
  const fetched = await fetchLiveJson("https://smartcity-api-7dyaiy7wha-uc.a.run.app/api/platform/samsara/vehicles", opts);
  if (fetched.status !== "ok") return unavailableResult(base, fetched.basis);
  const rows = Array.isArray(fetched.body?.vehicles) ? fetched.body.vehicles : [];
  const records = rows.map((row) => mapRealFleetVehicleRecord(row, pack.cityKey));
  return okResult(base, records, fetched.body?.contract || "live", "fleet-vehicle records");
}

/* -------------------------------------------------------------- spireon */

export function mapRealPatrolVehicleRecord(row, cityKey) {
  return {
    recordId: String(row.spireonId || row.id || "").trim() || `unknown-patrol`,
    kind: "spireon",
    recordType: "patrol-vehicle",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    unitLabel: row.name || "Unnamed unit",
    status: String(row.nspireStatus || row.status || "unknown"),
    department: row.department || null,
    place: {
      label: row.address || "Address not on record",
      parcelNodeId: null,
      parcelBasis: "vehicle location is a GPS fix, not attached to a parcel id",
    },
    speed: row.speed ?? null,
    odometer: row.odometer ?? null,
    engineHours: row.engineHours ?? null,
    lastUpdate: row.lastUpdate || null,
    /**
     * Three fields the real staff fleet page (PoliceDashboard.tsx) shows
     * that this product's mapping previously dropped on the floor --
     * confirmed real, not invented, against the platform route's own
     * additive enrichment (server/routes/spireon.ts, G-116 close):
     *   - activeInNspire: the source's own `active` flag, honest tri-state
     *     (true/false/null if the field is ever absent). Only observable
     *     as false because the platform route is now called with
     *     include_inactive=true below -- the Spireon API request itself
     *     filters to active-only otherwise, so no vehicle could ever come
     *     back inactive before this. This is what "Inactive in NSpire"
     *     is built from on the real page.
     *   - maintenanceAlertCount / recentAlertCount: real per-vehicle
     *     counts the platform route merges on by id server-side (reusing
     *     deriveMaintenanceAlerts/fetchAlerts, not re-derived here) --
     *     the same NSpire maintenance records and Spireon 7-day asset
     *     alert log the real page's Maintenance/Alerts tabs render.
     *     `?? null`, not `|| 0`, so a real 0 (genuinely no alerts) is
     *     never confused with the field being absent altogether.
     */
    activeInNspire: row.active ?? null,
    maintenanceAlertCount: row.maintenanceAlertCount ?? null,
    recentAlertCount: row.recentAlertCount ?? null,
    provenance: {
      source: "smartcity-os /api/platform/spireon/vehicles?include_inactive=true",
      basis: "getCredentials/fetchLiveVehicles(includeInactive=true) + deriveMaintenanceAlerts/fetchAlerts merged per vehicle by id, 7-day alert window",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not generated",
    },
  };
}

export async function composeRealPatrolVehicles(pack, domain, opts = {}) {
  const base = envelope(pack, domain);
  const fetched = await fetchLiveJson("https://smartcity-api-7dyaiy7wha-uc.a.run.app/api/platform/spireon/vehicles?include_inactive=true", opts);
  if (fetched.status !== "ok") return unavailableResult(base, fetched.basis);
  const rows = Array.isArray(fetched.body?.vehicles) ? fetched.body.vehicles : [];
  const records = rows.map((row) => mapRealPatrolVehicleRecord(row, pack.cityKey));
  return okResult(base, records, fetched.body?.contract || "live", "patrol-vehicle records");
}

/* ------------------------------------------------------------- firstdue */

/**
 * apparatusType/stationLabel below fill two columns ("Type", "Station") the
 * Apparatus and stations table (web/index.html) has carried since the
 * fixture domain shipped them (src/domains/fire-apparatus.mjs,
 * generateApparatusRecords) and web/app.js's renderFireApparatus has always
 * read (td(record.apparatusType), td(record.stationLabel)) -- this live
 * mapper simply never populated either, so a granted feed rendered both
 * columns blank via td()'s existing null-is-blank handling. NOT independently
 * verified against a live 200: the apparatus scope is still 403'd (see
 * composeRealFireApparatus and the module header above), so these field
 * names are unconfirmed. They are not guessed fresh here -- they are the
 * exact fallback chain smartcity-os's OWN EmergencyResponse.tsx already
 * gambles on for this same unverified resource (item.name/unit_name/
 * apparatus_name, item.type, item.station -- client/src/pages/
 * EmergencyResponse.tsx, the apparatus-card and dispatch-apparatus renders),
 * kept in sync rather than re-guessed independently. Left null, never
 * defaulted to an invented string, when absent.
 *
 * OCCUPANCY / PRE-PLAN FIELDS (businessName, constructionClass,
 * requiredFireFlow, isTargetHazard, isHighHazard, buildingUse, numberFloors,
 * etc.) ARE DELIBERATELY NOT HERE. Those belong to FirstDue's /occupancy
 * resource (server/routes/firstdue.ts mapOccupancy(), consumed by
 * VFDPortal.tsx's PrePlan interface), a different endpoint entirely from
 * /apparatus -- not merely a different field set. src/domains/fire-apparatus.mjs
 * already states this boundary ("WHAT IS NOT HERE"): occupancy is a real
 * building with a real address and is out of scope for this domain, not a
 * gap in it. Force-mapping occupancy fields onto apparatus records here would
 * fabricate a shape the FirstDue apparatus API does not have.
 */
export function mapRealFireApparatusRecord(row, cityKey) {
  return {
    recordId: String(row.id || row.unitId || "").trim() || `unknown-apparatus`,
    kind: "firstdue",
    recordType: "fire-apparatus",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    unitLabel: row.name || row.unitName || row.unit_name || row.apparatus_name || "Unnamed apparatus",
    status: String(row.status || "unknown"),
    station: row.station || row.stationName || null,
    apparatusType: row.type || row.apparatusType || row.apparatus_type || null,
    stationLabel: row.station || row.stationName || row.station_name || null,
    provenance: {
      source: "smartcity-os /api/platform/firstdue/apparatus",
      basis: "live",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not generated",
    },
  };
}

export async function composeRealFireApparatus(pack, domain, opts = {}) {
  const base = envelope(pack, domain);
  const fetched = await fetchLiveJson("https://smartcity-api-7dyaiy7wha-uc.a.run.app/api/platform/firstdue/apparatus", opts);
  if (fetched.status !== "ok") return unavailableResult(base, fetched.basis);
  const rows = Array.isArray(fetched.body?.apparatus) ? fetched.body.apparatus : [];
  const records = rows.map((row) => mapRealFireApparatusRecord(row, pack.cityKey));
  return okResult(base, records, fetched.body?.contract || "live", "fire-apparatus records");
}

/* -------------------------------------------------------------- powerbi */

export function mapRealCipProjectRecord(row, cityKey) {
  return {
    recordId: String(row.name || "").trim() || `unknown-project`,
    kind: "powerbi",
    recordType: "capital-project",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    projectName: row.name || "Untitled project",
    completion: row.overallCompletion ?? null,
    startDate: row.startDate || null,
    endDate: row.endDate || null,
    phaseCount: Array.isArray(row.phases) ? row.phases.length : 0,
    provenance: {
      source: "smartcity-os /api/platform/powerbi/cip-projects",
      basis: "getCIPProjectData()",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not generated",
    },
  };
}

export async function composeRealCipProjects(pack, domain, opts = {}) {
  const base = envelope(pack, domain);
  const fetched = await fetchLiveJson("https://smartcity-api-7dyaiy7wha-uc.a.run.app/api/platform/powerbi/cip-projects", opts);
  if (fetched.status !== "ok") return unavailableResult(base, fetched.basis);
  const rows = Array.isArray(fetched.body?.projects) ? fetched.body.projects : [];
  const records = rows.map((row) => mapRealCipProjectRecord(row, pack.cityKey));
  return okResult(base, records, fetched.body?.contract || "live", "capital-project records");
}

/* ------------------------------------------------------------------ goto */

/**
 * Aggregate only, one record representing "all queues, today" -- see
 * module header and the source route's own comment (server-side) for why:
 * real call detail is not exposed, matching this product's own fixture
 * domain drawing the identical line for invented data.
 */
export function mapRealCallSummaryRecord(summary, cityKey) {
  return {
    recordId: `today-${new Date().toISOString().slice(0, 10)}`,
    kind: "goto",
    recordType: "call-volume",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    queueLabel: "All queues",
    dayLabel: "Today",
    callsAnswered: summary.answeredCalls ?? 0,
    callsMissed: summary.missedCalls ?? 0,
    callsOffered: summary.totalCalls ?? 0,
    answerRate: summary.answerRate ?? null,
    avgHandleTimeSec: summary.avgHandleTimeSec ?? null,
    provenance: {
      source: "smartcity-os /api/platform/goto/call-summary",
      basis: "aggregate only, no individual call detail",
      readAt: new Date().toISOString(),
      readAtBasis: "read live for this request; not generated",
    },
  };
}

export async function composeRealCallAnalytics(pack, domain, opts = {}) {
  const base = envelope(pack, domain);
  const fetched = await fetchLiveJson("https://smartcity-api-7dyaiy7wha-uc.a.run.app/api/platform/goto/call-summary", opts);
  if (fetched.status !== "ok") return unavailableResult(base, fetched.basis);
  const summary = fetched.body?.summary;
  const records = summary ? [mapRealCallSummaryRecord(summary, pack.cityKey)] : [];
  return okResult(base, records, fetched.body?.contract || "live", "call-volume aggregate");
}
