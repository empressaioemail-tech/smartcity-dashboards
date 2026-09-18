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

import { assertRecordShape, recordShapeFaults } from "./adapters.mjs";
import { odometerBandFor } from "./domains/fleet-vehicles.mjs";
import { PLATFORM_BASE_UNSET_BASIS, PLATFORM_ROUTES, platformRoute } from "./platform-base.mjs";

/* --------------------------------------------------- sentinels, namespaced

SENTINELS ARE NAMESPACED BY THE VENDOR THAT EMITTED THEM, AND THIS IS A
COLLISION FIX RATHER THAN A COSMETIC ONE.

`mapRealFleetVehicleRecord` and `mapRealPatrolVehicleRecord` both fell back to
the LITERAL `"Unnamed unit"` on a row with no name (defect 2 of G-153), and the
same argument applies to every other sentinel in this file. A sentinel that two
vendors share is not an identifier: once Samsara and Spireon both return an
unnamed row, a joined or grouped surface cannot tell one vendor's row from the
other's, and a label that was supposed to say "this row has no name" instead says
"this row is one of the unnamed ones", which is a different and false claim about
which system reported it.

So both sentinels are derived from the adapter KIND, which is the one string in
the record that already distinguishes the vendor and which the catalogue owns.
Two vendors cannot collide by construction rather than by review, and
src/vendor-live.test.mjs feeds an empty row to both mappers and requires the
labels to differ.
*/
const unknownIdFor = (kindId, noun) => `unknown-${kindId}-${noun}`;
const unnamedLabelFor = (kindId, noun) => `Unnamed ${kindId} ${noun}`;

/**
 * A VENDOR STATE, OR NULL WHEN THERE IS NO STATE TO REPORT (G-153 parcel 2).
 *
 * Three different inputs mean the same thing and must not be told apart on a
 * surface: the field never arrived, the field arrived empty, and the field
 * carried the vendor's own `unknown`. None of the three is a state, and the
 * third is the trap -- `unknown` is a WORD, so it survives `||` checks and a
 * truthiness test and reads downstream as a measured value. It reaches a product
 * surface as a tile or a pill and says "we know the state and it is unknown",
 * which is a different and false claim from "the read did not tell us".
 *
 * So the token is normalised HERE, at the boundary where the vendor's word is
 * still recognisable as the vendor's, and the caller records why the state is
 * absent. `RECORD_SHAPES` refuses the token as a state as well, so a record
 * cannot carry it in through a different door -- two checks on one rule, at the
 * two places the rule can be broken.
 */
const NOT_A_STATE = /^(unknown|n\/a|none)$/i;
function vendorStateOrNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || NOT_A_STATE.test(s)) return null;
  return s;
}

/* ------------------------------------------------ THE SHAPE GUARD, LIVE

DEFECT 1 OF G-153, AND THE REASON IT IS HERE RATHER THAN IN A CALLER.

`assertRecordShape` was called from src/fixture-seam.mjs and from tests and from
NOTHING in this file, so the fixture path this product controls was
shape-validated and the live vendor path it does not control was not. By
ENFORCEMENT.md that is a dormant mechanism: built, correct, never reached on the
path that needs it. Run by hand against the real Samsara record it refuses with
three faults, and that record carries twelve undeclared fields including `vin`,
`make`, `model` and `odometerMiles` -- an inventory field set arriving on exactly
the cutover that drops the one sentence saying this is not an inventory.

A REFUSED RECORD IS DROPPED AND COUNTED, NEVER DEFAULTED. The alternative
failures are both worse than an empty region: serving the record anyway is what
this guard exists to stop, and "repairing" it (defaulting a status into the
declared enum, inventing an odometer band) would put this product's own words on
a real vendor's row. So a record that fails is left out of `records`, its faults
are pooled in `extras.refusals`, and the region says so in its basis.

WHAT THIS DOES NOT DO, STATED BECAUSE IT IS A REAL GAP. The guard is wired on the
two composers this row's defects land on, Samsara and Spireon. The other three
live composers in this file (FirstDue, PowerBI, GoTo) are NOT guarded yet, and
they would not pass either -- each is missing required fields of its declared
shape. Wiring them is a change to three lenses that are not this row's (Fire and
EMS is G-152) and each needs its own before/after evidence, so it is named in the
close as an open thread rather than done quietly here.
*/
function guardLiveRecords(mapper, rows, cityKey) {
  const records = [];
  const refusals = [];
  for (const row of rows) {
    const record = mapper(row, cityKey);
    const faults = recordShapeFaults(record);
    if (faults.length) {
      refusals.push({ recordId: record.recordId, faults });
    } else {
      records.push(record);
    }
  }
  return { records, refusals };
}

function platformKey(env = process.env) {
  return String(env.PLATFORM_INTERNAL_API_KEY || "").trim();
}

/**
 * D-13. Takes the platform ROUTE, not a URL. The host is resolved from the one
 * configured base at call time, so this file no longer knows any host at all --
 * which is the whole point: D-13 exists because the host five files silently
 * agreed on turned out to be the copy OPS-25 believed was idle.
 *
 * With no base configured this refuses and names the variable that is missing.
 * It does not fall back to a host, and it does not throw: the caller has an
 * "unavailable" arm and the region is where the reason belongs.
 */
async function fetchLiveJson(platformPath, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const key = platformKey(env);
  if (!key) {
    return { status: "unavailable", basis: "PLATFORM_INTERNAL_API_KEY unset", body: null };
  }
  const url = platformRoute(platformPath, env);
  if (!url) {
    return { status: "unavailable", basis: PLATFORM_BASE_UNSET_BASIS, body: null };
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
    /**
     * A RECORD THAT REPORTS NO STATE IS NOT COUNTED AS ONE (G-153 parcel 2).
     * This line used to be `r.status || "unknown"`, which is the same invention
     * the mappers carried: it turned every unreported state into a tile labelled
     * `unknown`, so the strip showed a value where the read had none. The absent
     * rows are counted separately and named, so the surface can say how many rows
     * report no state without inventing a state for them to report.
     */
    if (!r.status) continue;
    const key = r.status;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

/** Live records that reported no vendor state, so the surface can say how many. */
export function statusNotReportedCount(records) {
  return (Array.isArray(records) ? records : []).filter((r) => !r.status).length;
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

/**
 * A REFUSAL IS ITS OWN RESULT, AND IT IS NOT `granted-empty`.
 *
 * `granted-empty` claims the vendor answered and returned zero records, which is
 * a statement about the VENDOR. When the vendor answers and the records it
 * returned do not satisfy the declared contract, the number of records it
 * returned is not zero and the region must not say that it is -- a refusal
 * wearing a count of zero is the same class of lie as a fabricated value, one
 * layer up. Nor is this `unavailableResult`: that basis reads as a fetch that did
 * not succeed, and here the fetch succeeded and the shape guard is what refused.
 *
 * The status is its OWN value, `refused`, and it is added here rather than borrowed
 * from `unavailable` because a borrowed value renders a false sentence. The
 * renderer (web/app.js) gives each status its own kicker and head; a refusal
 * arriving as `unavailable` would have printed the fall-through head -- "the
 * region is generating records" -- over a state block whose basis says the
 * records were refused, and on this pack that is not an edge case: every live
 * Samsara and Spireon record fails its declared shape today, so a refusal IS the
 * steady state of both regions until the mapping catches up. The vocabulary
 * addition is real and it is named for the design recapture (`source-state.json`
 * declares the live statuses) rather than made silently.
 */
function refusalFaults(refusals) {
  return [...new Set(refusals.flatMap((r) => r.faults))];
}

function refusedResult(base, refusals, denominatorLabel) {
  const faults = refusalFaults(refusals);
  return {
    ...base,
    granted: true,
    generated: false,
    status: "refused",
    basis: `${base.gatedBy} answered and every one of the ${refusals.length} ${denominatorLabel} it returned was refused by the record-shape guard: ${faults.join("; ")}`,
    recordCount: 0,
    countingRule: `no records served: ${refusals.length} ${denominatorLabel} were read live and refused by assertRecordShape`,
    records: [],
    extras: { refusals: refusals.slice(0, 50), refusalCount: refusals.length, refusalFaults: faults },
  };
}

function okResult(base, records, basis, denominatorLabel, extraExtras = {}) {
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
    extras: { realStatusCounts: realStatusCounts(records), statusNotReported: statusNotReportedCount(records), ...extraExtras },
  };
}

/**
 * One reading of a guarded live read, so the two composers cannot answer the
 * three cases (all refused, some refused, none refused) differently.
 */
function guardedRead(base, mapper, rows, basis, denominatorLabel) {
  const { records, refusals } = guardLiveRecords(mapper, rows, base.cityKey);
  if (records.length === 0 && refusals.length > 0) {
    return refusedResult(base, refusals, denominatorLabel);
  }
  /**
   * G-153. `refusalFaults` travels on the PARTIAL refusal too, not only on the
   * total one. Both the region's metric strip and its basis read it, and on this
   * pack the partial case is the live one: 72 of 75 fleet rows are served and the
   * three that are not have no odometer reading, so the fault string is the only
   * place the surface can say WHY three real vehicles are missing from a region
   * that otherwise reads "72 records". Derived by the same helper the total
   * refusal uses, so the two cannot drift into two different lists.
   */
  return okResult(base, records, basis, denominatorLabel,
    refusals.length
      ? { refusals, refusalCount: refusals.length, refusalFaults: refusalFaults(refusals) }
      : {});
}

/* --------------------------------------------------------------- samsara */

export function mapRealFleetVehicleRecord(row, cityKey) {
  return {
    recordId: String(row.id || "").trim() || unknownIdFor("samsara", "vehicle"),
    kind: "samsara",
    recordType: "fleet-vehicle",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    unitLabel: row.name || `${row.make || ""} ${row.model || ""}`.trim() || unnamedLabelFor("samsara", "unit"),
    /**
     * THE VENDOR'S OWN STATE, OR NOTHING -- NEVER AN INVENTED ONE (G-153 parcel 2).
     *
     * This used to read `String(row.stats?.engineState || "unknown")`, and the
     * `|| "unknown"` is a fallback wearing a state's clothes: measured on
     * 2026-09-18 it fired on 75 of 75 live fleet rows, so the entire live fleet
     * reported a state word that no vendor ever sent. The stats batch is not the
     * problem -- the same batch populates `odometerMiles` on 72 of those 75 -- so
     * the read genuinely carries no engine state and the honest record says that
     * instead of naming one. `RECORD_SHAPES.samsara` refuses the upstream token
     * (`notAState`), so the invention cannot come back through this door or any
     * other.
     */
    status: vendorStateOrNull(row.stats?.engineState),
    statusBasis: vendorStateOrNull(row.stats?.engineState)
      ? null
      : "the read reports no engine state for this vehicle: the value the deployed product served on all 75 fleet rows read on 2026-09-18 was this mapper's own fallback token, which says the vendor sent no state rather than naming one, and the route's contract carries engineStates in the same stats batch that populates odometerMiles on 72 of those rows",
    /**
     * OPERATOR REFERENCE: RULED, DECLARED, AND ABSENT WITH ITS REASON (defect 3).
     *
     * Operator references are namespaced by domain since the ruling of
     * 2026-09-17 and Fleet mints `FL-OPR-nn`
     * (src/operator-ref.mjs, the one declaration of the scheme). The field is
     * required by RECORD_SHAPES.samsara and this mapper used to carry no
     * `operatorRef` key at all -- not null, not empty, ABSENT -- so a required
     * field was missing from every live record and nothing said so. The shape
     * guard wired below is what refuses that now.
     *
     * WHY IT IS NOT MINTED HERE RATHER THAN A REFERENCE BEING INVENTED. Minting
     * needs an operator IDENTITY to pseudonymise, and this read carries none: the
     * platform route's own `operator` is null on every row read (empty and
     * populated alike, 2026-09-17). A reference derived from what is left -- the
     * vehicle id -- would be a stable pseudonym for a MACHINE, printed in the
     * column the roster groups PEOPLE by, which is worse than an absent field. So
     * the absence is stated positively, in the record, with its reason.
     */
    operatorRef: null,
    operatorBasis:
      "the live read carries no operator identity to pseudonymise, so no FL-OPR-nn reference is minted; a reference derived from the vehicle would name a machine in the column that groups people, and a reference derived from anything else would be a pseudonym for nobody",
    /**
     * ODOMETER BAND: DERIVED, BECAUSE THE INPUT IS IN THE READ (G-153 parcel 2).
     *
     * This carried `null` with a basis saying that banding the reading "would
     * present this product's bucketing as the vendor's value". The first half of
     * that is right and the second half is why it is now banded: the BAND is this
     * product's declared bucket (`ODOMETER_BANDS`) and the RAW READING stays on
     * the record beside it (`odometerMiles`), so the vendor's own number is not
     * replaced by the bucket -- both are present and each is labelled. Leaving it
     * null cost 75 of 75 live fleet rows their record shape while the reading
     * arrived on 72 of them, which is a mapping that was never done rather than a
     * fact about the source.
     *
     * A ROW WHOSE READING DID NOT ARRIVE IS STILL REFUSED, not banded: the shape
     * keeps `odometerBand` required with no declared-absence escape, so the 3 of
     * 75 with no odometer are refused by name instead of being handed a band no
     * measurement supports. `odometerBandFor` returns null for an unreadable
     * reading and this passes that null through rather than bucketing it into the
     * lowest band.
     */
    odometerBand: odometerBandFor(row.stats?.odometerMiles ?? row.stats?.obdOdometerMiles ?? null),
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
  const fetched = await fetchLiveJson(PLATFORM_ROUTES.samsaraVehicles, opts);
  if (fetched.status !== "ok") return unavailableResult(base, fetched.basis);
  const rows = Array.isArray(fetched.body?.vehicles) ? fetched.body.vehicles : [];
  return guardedRead(base, mapRealFleetVehicleRecord, rows,
    fetched.body?.contract || "live", "fleet-vehicle records");
}

/* -------------------------------------------------------------- spireon */

export function mapRealPatrolVehicleRecord(row, cityKey) {
  return {
    recordId: String(row.spireonId || row.id || "").trim() || unknownIdFor("spireon", "patrol"),
    kind: "spireon",
    recordType: "patrol-vehicle",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    unitLabel: row.name || unnamedLabelFor("spireon", "unit"),
    /**
     * THE VENDOR'S OWN STATE, OR NOTHING (G-153 parcel 2). Same defect as the
     * Samsara mapper's `|| "unknown"` and the same fix, with one more layer of
     * invention to remove: the route itself defaults the field
     * (`smartcity-os server/routes/spireon.ts:177`, `asset.status || "Unknown"`),
     * so `Unknown` is a not-a-state token the product's own read manufactures.
     * The real values -- Stopped, Moving, Idle, 25 of 27 rows read on 2026-09-18
     * -- are carried verbatim, and the two rows where the route fell back say
     * that nothing was reported rather than reporting `Unknown` as a state.
     */
    status: vendorStateOrNull(row.nspireStatus),
    statusBasis: vendorStateOrNull(row.nspireStatus)
      ? null
      : "the read reports no NSpire status for this vehicle: the value the deployed product served on the rows read on 2026-09-18 was the route's own fallback word Unknown, which says nothing was reported rather than naming a state",
    /**
     * OPERATOR REFERENCE (defect 3). Required by RECORD_SHAPES.spireon,
     * `required: true`, and this mapper carried no such key at all -- the field
     * named in the contract was silently absent from every live record. Police
     * mints `PV-OPR-nn` under the ruling of 2026-09-17 (src/operator-ref.mjs).
     *
     * Not minted here for the same reason as the fleet mapper, and the reason is
     * not a shortage of effort: this read carries no operator identity to
     * pseudonymise, and `PV-OPR-nn` is a pseudonym for a PERSON. A reference
     * derived from the patrol unit's own id would name a vehicle in the column
     * the roster groups people by. So the absence is carried with its basis, and
     * the shape guard refuses the record rather than the field going missing.
     */
    operatorRef: null,
    operatorBasis:
      "the live read carries no operator identity to pseudonymise, so no PV-OPR-nn reference is minted; a reference derived from the unit would name a vehicle in the column that groups people, and a reference derived from anything else would be a pseudonym for nobody",
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
  const fetched = await fetchLiveJson(PLATFORM_ROUTES.spireonVehiclesIncludingInactive, opts);
  if (fetched.status !== "ok") return unavailableResult(base, fetched.basis);
  const rows = Array.isArray(fetched.body?.vehicles) ? fetched.body.vehicles : [];
  return guardedRead(base, mapRealPatrolVehicleRecord, rows,
    fetched.body?.contract || "live", "patrol-vehicle records");
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
    recordId: String(row.id || row.unitId || "").trim() || unknownIdFor("firstdue", "apparatus"),
    kind: "firstdue",
    recordType: "fire-apparatus",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    unitLabel: row.name || row.unitName || row.unit_name || row.apparatus_name || unnamedLabelFor("firstdue", "unit"),
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
  const fetched = await fetchLiveJson(PLATFORM_ROUTES.firstdueApparatus, opts);
  if (fetched.status !== "ok") return unavailableResult(base, fetched.basis);
  const rows = Array.isArray(fetched.body?.apparatus) ? fetched.body.apparatus : [];
  const records = rows.map((row) => mapRealFireApparatusRecord(row, pack.cityKey));
  return okResult(base, records, fetched.body?.contract || "live", "fire-apparatus records");
}

/* -------------------------------------------------------------- powerbi */

export function mapRealCipProjectRecord(row, cityKey) {
  return {
    recordId: String(row.name || "").trim() || unknownIdFor("powerbi", "project"),
    kind: "powerbi",
    recordType: "capital-project",
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",
    projectName: row.name || unnamedLabelFor("powerbi", "project"),
    completion: row.overallCompletion ?? null,
    startDate: row.startDate || null,
    endDate: row.endDate || null,
    phaseCount: Array.isArray(row.phases) ? row.phases.length : 0,
    // Real lifecycle phase and status, same stance as every other vendor in
    // this module (see module header): kept as-is, never force-mapped onto
    // the fixture's invented phase/status vocabulary (STATUS_PHASES in
    // src/domains/cip-projects.mjs). "status" matches the exact convention
    // mapRealFleetVehicleRecord/mapRealPatrolVehicleRecord/
    // mapRealFireApparatusRecord already use.
    currentPhase: row.currentPhase || null,
    status: String(row.status || "unknown"),
    // The real per-task Gantt rows getCIPProjectData() already computes
    // (task/phaseStart/phaseEnd/completion/taskDuration) -- passed through
    // unchanged, not relabeled onto any other taxonomy. Distinct from
    // extras.phases on this same domain's FIXTURE path (src/domains/
    // cip-projects.mjs's phaseSummary()), which is an aggregate phase-count
    // table over generated records and answers a different question.
    phases: Array.isArray(row.phases) ? row.phases : [],
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
  const fetched = await fetchLiveJson(PLATFORM_ROUTES.powerbiCipProjects, opts);
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
  const fetched = await fetchLiveJson(PLATFORM_ROUTES.gotoCallSummary, opts);
  if (fetched.status !== "ok") return unavailableResult(base, fetched.basis);
  const summary = fetched.body?.summary;
  const records = summary ? [mapRealCallSummaryRecord(summary, pack.cityKey)] : [];
  return okResult(base, records, fetched.body?.contract || "live", "call-volume aggregate");
}
