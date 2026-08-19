import { VEHICLE_STATUS_VALUES } from "../adapters.mjs";
import { defineDomain, fixtureBasisFor, mulberry32, pick } from "../fixture-seam.mjs";

/* -------------------------------------------------- domain: patrol vehicles

The gated-but-ungranted exemplar, and it is the one that proves ruling 1 is
implemented rather than described.

Everything about this domain is BUILT. It declares a record shape, it registers
in the registry, it carries a working generator, and its region is named on the
Police lens. The only thing it does not have is a source: spireon is not on
template-city's fixtureGrants, so composeDomain returns status ungranted with a
basis that says the region exists and has no source.

That is a different sentence from "Police is not built", and until G-91 the
product could only say the second one. It is also a different sentence from
"Spireon is granted here and returned nothing", which is what composeDomain
returns as granted-empty; collapsing those two is the defect ruling 1 closes,
so this file deliberately carries a generator that WOULD produce records. If the
generator were a stub, ungranted and not-built would be indistinguishable again
one layer down, which is how the original misreading happened.

To watch it populate, add "spireon" to a pack's fixtureGrants. Nothing else
changes. src/domains.test.mjs does exactly that on a throwaway pack, so the
region is proven reachable rather than assumed reachable.
*/

export const PATROL_VOCABULARY = [
  "Patrol sedan",
  "Patrol SUV",
  "Traffic unit",
  // "K9 transport" was the first entry here and it failed UNIT_LABEL_FORMAT on
  // its digit. Renamed rather than widening the format: a format loosened to
  // admit one string is loosened for every domain that inherits it.
  "Canine transport",
  "Supervisor unit",
  "Unmarked unit",
];

export const PATROL_FIXTURE_PLAN = [
  { status: "out-of-service", count: 1 },
  { status: "inspection-due", count: 2 },
  { status: "in-shop", count: 1 },
  { status: "in-service", count: 6 },
];

export const PATROL_ID_FORMAT = /^FIX-PV-\d{4}$/;
export const UNIT_LABEL_FORMAT = /^[A-Z][A-Za-z ]+ unit \d{2}$/;
export const OPERATOR_REF_FORMAT = /^OPR-\d{2}$/;
export const OPERATOR_COUNT = 3;

export const PATROL_BASIS = fixtureBasisFor("spireon");

export const OPERATOR_BASIS =
  "a generated record names no person; the operator is an opaque reference and a granted feed is where a name would come from";

function severityRank(statusId) {
  const value = VEHICLE_STATUS_VALUES.find((s) => s.id === statusId);
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(value?.severity || "quiet");
}

export function generatePatrolRecords({ cityKey, accessPolicy = "public-free", seed = 0 } = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const rand = mulberry32(seed);
  const records = [];
  let seq = 0;
  for (const row of PATROL_FIXTURE_PLAN) {
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      records.push({
        recordId: `FIX-PV-${String(1000 + seq * 9).padStart(4, "0")}`,
        kind: "spireon",
        recordType: "patrol-vehicle",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: PATROL_BASIS,
        accessPolicy,
        unitLabel: `${pick(rand, PATROL_VOCABULARY)} unit ${String(20 + seq).padStart(2, "0")}`,
        status: row.status,
        operatorRef: `OPR-${String(1 + ((seq - 1) % OPERATOR_COUNT)).padStart(2, "0")}`,
        operatorBasis: OPERATOR_BASIS,
        provenance: {
          source: "Spireon output contract",
          basis: PATROL_BASIS,
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

export function patrolMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return VEHICLE_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule:
      "patrol vehicles whose status equals this tile, over the generated spireon patrol-vehicle records on this pack",
  }));
}

export const PATROL_VEHICLES_DOMAIN = defineDomain({
  id: "patrol-vehicles",
  lensId: "police",
  region: "Patrol roster",
  gatedBy: "spireon",
  recordType: "patrol-vehicle",
  vocabulary: [...VEHICLE_STATUS_VALUES.map((s) => s.id), OPERATOR_BASIS],
  formats: [PATROL_ID_FORMAT, UNIT_LABEL_FORMAT, OPERATOR_REF_FORMAT],
  generate(pack, seedFor) {
    const records = generatePatrolRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("spireon:patrol-vehicle"),
    });
    return { records, extras: { metrics: patrolMetrics(records) } };
  },
});
