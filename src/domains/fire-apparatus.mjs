import { VEHICLE_STATUS_VALUES } from "../adapters.mjs";
import {
  PLACE_VOCABULARY,
  between,
  defineDomain,
  fixtureBasisFor,
  mulberry32,
} from "../fixture-seam.mjs";

/* -------------------------------------------------- domain: fire apparatus

FirstDue apparatus on the Fire and EMS lens: a roster with a station dimension.

WHY THIS REUSES VEHICLE_STATUS_VALUES, stated here because a reader will notice
it and should not have to guess. Apparatus readiness is the same four bands a
vehicle carries — out of service, inspection due, in shop, in service — and
declaring a second identical set under a different name would be two
implementations of one rule, which is the shape DEV_PROCESS 2.4 names. Cameras
DO get their own set in the same card, because a camera is never in shop and a
truck is never in signal loss. The test is whether the bands differ, not whether
the department differs.

A CREW IS A ROSTER OF PEOPLE. A granted FirstDue feed carries assigned crew; a
generated record names nobody, and says so in its own basis rather than leaving
the field quietly missing. Same discipline as the fleet operator reference, for
the same reason.

WHAT IS NOT HERE. The live vendor also exposes occupancies (pre-fire plans over
real buildings), map-data and a summary rollup. Those are out of scope for this
domain rather than unmentioned: an occupancy record is a real building with a
real address, which is the one thing a fixture pack cannot generate honestly, and
the seam's own address guard would reject it. Preplans and water supply belong to
the VFD family and are a separate domain nobody has scoped.
*/

export const APPARATUS_TYPE_VALUES = [
  "Engine",
  "Ladder",
  "Rescue",
  "Tanker",
  "Brush truck",
  "Ambulance",
  "Command",
];

export const APPARATUS_FIXTURE_PLAN = [
  { status: "out-of-service", count: 1 },
  { status: "inspection-due", count: 2 },
  { status: "in-shop", count: 1 },
  { status: "in-service", count: 8 },
];

/** How many stations the roster groups across. */
export const STATION_COUNT = 3;

export const APPARATUS_ID_FORMAT = /^FIX-FA-\d{4}$/;
export const UNIT_LABEL_FORMAT = /^[A-Z][A-Za-z ]+ unit \d{2}$/;
export const STATION_LABEL_FORMAT = /^[A-Z][A-Za-z ]+ station \d{2}$/;
export const STATION_REF_FORMAT = /^STN-\d{2}$/;

export const APPARATUS_BASIS = fixtureBasisFor("firstdue");

export const CREW_BASIS =
  "a generated record names no person; a granted feed is where an assigned crew would come from and a roster of real firefighters is not a fixture";

export const STATION_COUNTING_RULE =
  "apparatus whose stationRef equals this station, over the generated firstdue fire-apparatus records on this pack, one row per record";

export const READY_COUNTING_RULE =
  "apparatus whose status is the resolved in-service band, over the generated firstdue fire-apparatus records on this pack; the unavailable classes are counted separately and never derived by subtracting this one";

function severityRank(statusId) {
  const value = VEHICLE_STATUS_VALUES.find((s) => s.id === statusId);
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(value?.severity || "quiet");
}

/**
 * The stations, derived once so a station's label is stable across every
 * apparatus housed in it.
 */
export function apparatusStations(seed = 0) {
  const rand = mulberry32(seed);
  const stations = [];
  for (let i = 0; i < STATION_COUNT; i += 1) {
    const name = PLACE_VOCABULARY[(i + between(rand, 0, PLACE_VOCABULARY.length - 1)) % PLACE_VOCABULARY.length];
    stations.push({
      stationRef: `STN-${String(i + 1).padStart(2, "0")}`,
      stationLabel: `${name} station ${String(i + 1).padStart(2, "0")}`,
    });
  }
  return stations;
}

export function generateApparatusRecords({ cityKey, accessPolicy = "public-free", seed = 0 } = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const stations = apparatusStations(seed);
  const typeStart = seed % APPARATUS_TYPE_VALUES.length;
  const TYPE_STRIDE = 3;
  const records = [];
  let seq = 0;
  for (const row of APPARATUS_FIXTURE_PLAN) {
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const station = stations[(seq - 1) % stations.length];
      const apparatusType =
        APPARATUS_TYPE_VALUES[(typeStart + (seq - 1) * TYPE_STRIDE) % APPARATUS_TYPE_VALUES.length];
      records.push({
        recordId: `FIX-FA-${String(1000 + seq * 11).padStart(4, "0")}`,
        kind: "firstdue",
        recordType: "fire-apparatus",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: APPARATUS_BASIS,
        accessPolicy,
        unitLabel: `${apparatusType} unit ${String(30 + seq).padStart(2, "0")}`,
        apparatusType,
        status: row.status,
        stationRef: station.stationRef,
        stationLabel: station.stationLabel,
        crewBasis: CREW_BASIS,
        provenance: {
          source: "FirstDue output contract",
          basis: APPARATUS_BASIS,
          readAt: null,
          readAtBasis: "nothing was read; this record was generated",
        },
      });
    }
  }
  records.sort((a, b) => {
    const rank = severityRank(a.status) - severityRank(b.status);
    if (rank !== 0) return rank;
    return a.recordId.localeCompare(b.recordId);
  });
  return records;
}

export function apparatusMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return VEHICLE_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule:
      "apparatus whose status equals this tile, over the generated firstdue fire-apparatus records on this pack",
  }));
}

/** The station dimension, counted off the records and naming nobody. */
export function stationRoster(records) {
  const list = Array.isArray(records) ? records : [];
  const refs = [...new Set(list.map((r) => r.stationRef))].sort();
  return refs.map((stationRef) => {
    const housed = list.filter((r) => r.stationRef === stationRef);
    return {
      stationRef,
      stationLabel: housed[0]?.stationLabel ?? null,
      apparatusCount: housed.length,
      /**
       * Counted per station rather than reported city-wide only, because a city
       * with every out-of-service truck in one station is a different fact from
       * a city with one in each, and a rollup cannot say which.
       */
      readyCount: housed.filter((r) => r.status === "in-service").length,
      crewBasis: CREW_BASIS,
      countingRule: STATION_COUNTING_RULE,
    };
  });
}

export const FIRE_APPARATUS_DOMAIN = defineDomain({
  id: "fire-apparatus",
  lensId: "fire-ems",
  region: "Apparatus and stations",
  gatedBy: "firstdue",
  recordType: "fire-apparatus",
  vocabulary: [
    ...VEHICLE_STATUS_VALUES.map((s) => s.id),
    ...APPARATUS_TYPE_VALUES,
    CREW_BASIS,
  ],
  formats: [APPARATUS_ID_FORMAT, UNIT_LABEL_FORMAT, STATION_LABEL_FORMAT, STATION_REF_FORMAT],
  generate(pack, seedFor) {
    const records = generateApparatusRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("firstdue:fire-apparatus"),
    });
    return {
      records,
      extras: {
        metrics: apparatusMetrics(records),
        stations: stationRoster(records),
        readyCountingRule: READY_COUNTING_RULE,
      },
    };
  },
});
