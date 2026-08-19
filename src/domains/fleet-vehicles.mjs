import { VEHICLE_STATUS_VALUES } from "../adapters.mjs";
import { defineDomain, fixtureBasisFor, mulberry32, pick } from "../fixture-seam.mjs";

/* --------------------------------------------------- domain: fleet vehicles

Samsara vehicles, and the reason this domain is one of the three exemplars is
that it is SIMPLE and its shape shares almost nothing with the permit queue: a
flat roster, no place, no due date, and one grouping dimension. If the seam only
worked for case-shaped records it would look correct on the pipeline and fail on
the first lens that is not a queue.

Two constraints this domain carries that the queue domains do not.

A DRIVER IS A PERSON. A granted Samsara feed carries driver names; a generated
record must not, so the roster groups on an opaque operator reference under a
declared format and the record states in its own basis why the name is absent.
An absence with no basis is the defect this program hunts, so the absence is
written positively rather than left as a missing field.

A VEHICLE IS NOT AN ASSET. G-24 stays at zero, and fleet telemetry has been the
standing example of the thing that looks like it should fill an asset inventory
and must not. The record type is fleet-vehicle under a files-writing vendor
kind, never a city-owned asset node.
*/

export const VEHICLE_VOCABULARY = [
  "Utility pickup",
  "Street sweeper",
  "Vactor truck",
  "Dump truck",
  "Backhoe loader",
  "Mower tractor",
  "Service van",
  "Water tanker",
  "Bucket truck",
  "Skid steer",
];

/**
 * Mileage as a declared band rather than a number, because a fixture odometer
 * reading is a specific claim about a specific machine and a band is not.
 */
export const ODOMETER_BANDS = [
  "under 20k miles",
  "20k to 60k miles",
  "60k to 120k miles",
  "over 120k miles",
];

export const FLEET_FIXTURE_PLAN = [
  { status: "out-of-service", count: 1 },
  { status: "inspection-due", count: 3 },
  { status: "in-shop", count: 2 },
  { status: "in-service", count: 8 },
];

/** How many opaque operators the roster groups across. */
export const OPERATOR_COUNT = 4;
export const OPERATOR_REF_FORMAT = /^OPR-\d{2}$/;
export const VEHICLE_ID_FORMAT = /^FIX-FL-\d{4}$/;
export const UNIT_LABEL_FORMAT = /^[A-Z][A-Za-z ]+ unit \d{2}$/;

export const FLEET_BASIS = fixtureBasisFor("samsara");

export const OPERATOR_BASIS =
  "a generated record names no person; the operator is an opaque reference and a granted feed is where a name would come from";

export const NOT_AN_ASSET_BASIS =
  "vendor fleet telemetry is not a city-owned inventory node, so nothing here counts toward the city inventory";

export const DRIVER_COUNTING_RULE =
  "vehicles whose operatorRef equals this operator, over the generated samsara fleet-vehicle records on this pack, one row per record";

function severityRank(statusId) {
  const value = VEHICLE_STATUS_VALUES.find((s) => s.id === statusId);
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(value?.severity || "quiet");
}

export function generateFleetRecords({ cityKey, accessPolicy = "public-free", seed = 0 } = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const rand = mulberry32(seed);
  const unitStart = seed % VEHICLE_VOCABULARY.length;
  const UNIT_STRIDE = 3;
  const records = [];
  let seq = 0;
  for (const row of FLEET_FIXTURE_PLAN) {
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const family = VEHICLE_VOCABULARY[(unitStart + (seq - 1) * UNIT_STRIDE) % VEHICLE_VOCABULARY.length];
      records.push({
        recordId: `FIX-FL-${String(1000 + seq * 5).padStart(4, "0")}`,
        kind: "samsara",
        recordType: "fleet-vehicle",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: FLEET_BASIS,
        accessPolicy,
        unitLabel: `${family} unit ${String(10 + seq).padStart(2, "0")}`,
        status: row.status,
        operatorRef: `OPR-${String(1 + ((seq - 1) % OPERATOR_COUNT)).padStart(2, "0")}`,
        operatorBasis: OPERATOR_BASIS,
        odometerBand: pick(rand, ODOMETER_BANDS),
        inventoryBasis: NOT_AN_ASSET_BASIS,
        provenance: {
          source: "Samsara output contract",
          basis: FLEET_BASIS,
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

export function fleetMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return VEHICLE_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule:
      "vehicles whose status equals this tile, over the generated samsara fleet-vehicle records on this pack",
  }));
}

/** The driver dimension, counted off the records and naming nobody. */
export function operatorRoster(records) {
  const list = Array.isArray(records) ? records : [];
  const refs = [...new Set(list.map((r) => r.operatorRef))].sort();
  return refs.map((operatorRef) => ({
    operatorRef,
    operatorBasis: OPERATOR_BASIS,
    vehicleCount: list.filter((r) => r.operatorRef === operatorRef).length,
    countingRule: DRIVER_COUNTING_RULE,
  }));
}

export const FLEET_VEHICLES_DOMAIN = defineDomain({
  id: "fleet-vehicles",
  lensId: "fleet",
  region: "Vehicle roster",
  gatedBy: "samsara",
  recordType: "fleet-vehicle",
  vocabulary: [
    ...VEHICLE_STATUS_VALUES.map((s) => s.id),
    ...ODOMETER_BANDS,
    OPERATOR_BASIS,
    NOT_AN_ASSET_BASIS,
  ],
  formats: [VEHICLE_ID_FORMAT, UNIT_LABEL_FORMAT, OPERATOR_REF_FORMAT],
  generate(pack, seedFor) {
    const records = generateFleetRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("samsara:fleet-vehicle"),
    });
    return {
      records,
      extras: {
        metrics: fleetMetrics(records),
        operators: operatorRoster(records),
        inventoryBasis: NOT_AN_ASSET_BASIS,
      },
    };
  },
});
