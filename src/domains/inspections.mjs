import { INSPECTION_RESULT_VALUES, INSPECTION_STATUS_VALUES } from "../adapters.mjs";
import {
  PLACE_LABEL_FORMAT,
  PLACE_VOCABULARY,
  between,
  defineDomain,
  fixtureBasisFor,
  mulberry32,
  pick,
} from "../fixture-seam.mjs";

/* ------------------------------------------------------- domain: inspections

Live `mygov/inspections`, one of the sixteen MyGov endpoints the production
Bastrop dashboard reads and one of the three this product could not express. The
live surface carries it inside the Permits tab beside an inspector load table
(_inbox/2026-08-17_bastrop_dashboard_layout_inventory.md, layout 3); 30c gives it
its own Inspections tab.

The shape this domain exists to prove is a QUEUE WITH A PAIRED SECOND AXIS. Work
orders carry an SLA dimension that every record has; an inspection's result only
exists once the inspection has happened, so the second axis is DEFINED for every
record and MEANINGFUL for a subset, and the domain has to be able to say which
without a null. It says it with `not-inspected` plus a basis on the record, and
the pairing is enforced in both directions rather than described:

  a completed inspection carries an inspected result, and
  an uncompleted inspection carries not-inspected.

Two people are held off this record. The live feed carries an inspector name and
a granted feed is where one would come from; a generated record carries an opaque
reference under a declared format and states why the name is absent, exactly as
the fleet roster holds a driver off a vehicle. The inspector load table is then
still buildable, which is the point: the dimension survives, the person does not.
*/

export const INSPECTION_TYPE_VOCABULARY = [
  "Foundation inspection",
  "Framing inspection",
  "Electrical rough-in",
  "Plumbing rough-in",
  "Mechanical rough-in",
  "Insulation inspection",
  "Drywall inspection",
  "Final building inspection",
  "Fire alarm inspection",
  "Backflow inspection",
  "Erosion control inspection",
  "Driveway approach inspection",
];

/**
 * The declared queue, and the result is declared WITH the status rather than
 * drawn beside it. Drawing a result would make the pairing above a probability
 * rather than a property, and a test that passes because a random draw happened
 * to be legal is not a test.
 */
export const INSPECTION_FIXTURE_PLAN = [
  { status: "past-due", result: "not-inspected", count: 2 },
  { status: "unscheduled", result: "not-inspected", count: 3 },
  { status: "scheduled", result: "not-inspected", count: 6 },
  { status: "completed", result: "failed", count: 2 },
  { status: "completed", result: "corrections", count: 3 },
  { status: "completed", result: "passed", count: 5 },
];

/**
 * When each status sits, relative to today. Negative is behind us, positive is
 * ahead, and unscheduled has no day at all rather than a zero: a zero would
 * render as "today", which is a claim.
 */
export const DAY_BANDS = {
  "past-due": { from: -9, to: -2 },
  unscheduled: null,
  scheduled: { from: 1, to: 8 },
  completed: { from: -14, to: -1 },
};

/** How many opaque inspectors the load table groups across. */
export const INSPECTOR_COUNT = 4;

export const INSPECTION_ID_FORMAT = /^FIX-IN-\d{4}$/;
export const INSPECTOR_REF_FORMAT = /^INS-\d{2}$/;
export const DAY_LABEL_FORMAT = /^(today|in \d+ days?|\d+ days? ago)$/;

export const INSPECTION_BASIS = fixtureBasisFor("mygov");

export const INSPECTOR_BASIS =
  "a generated record names no person; the inspector is an opaque reference and a granted feed is where a name would come from";

export const RESULT_PENDING_BASIS =
  "no result is recorded because this inspection is not completed; a result accrues when it is";

export const UNSCHEDULED_BASIS =
  "this inspection is not scheduled, so it carries no day and none is invented";

export const RESULT_COUNTING_RULE =
  "inspections whose result equals this tile, over the generated mygov inspection records on this pack, one row per record";

export const INSPECTOR_LOAD_COUNTING_RULE =
  "inspections whose inspectorRef equals this inspector, over the generated mygov inspection records on this pack, one row per record";

/**
 * Relative day phrasing in both directions. dayLabelFor on the seam only reaches
 * forward, and an inspections queue is half behind: a completed inspection is in
 * the past and a scheduled one is ahead. Declared here rather than widened on the
 * seam, because a helper loosened for one lens is loosened for every lens that
 * inherits it. No calendar date is invented in either direction.
 */
export function relativeDayLabel(offsetDays) {
  if (!Number.isInteger(offsetDays)) {
    throw new Error("a relative day label requires an integer offset");
  }
  if (offsetDays === 0) return "today";
  if (offsetDays > 0) return offsetDays === 1 ? "in 1 day" : `in ${offsetDays} days`;
  const n = Math.abs(offsetDays);
  return n === 1 ? "1 day ago" : `${n} days ago`;
}

export function inspectionResultValue(resultId) {
  return INSPECTION_RESULT_VALUES.find((r) => r.id === resultId) || null;
}

function severityRank(statusId) {
  const value = INSPECTION_STATUS_VALUES.find((s) => s.id === statusId);
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(value?.severity || "quiet");
}

/** The queue. Every extra below counts THIS array; nothing is declared twice. */
export function generateInspectionRecords({ cityKey, accessPolicy = "public-free", seed = 0 } = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const rand = mulberry32(seed);
  const typeStart = seed % INSPECTION_TYPE_VOCABULARY.length;
  const TYPE_STRIDE = 7;
  const records = [];
  let seq = 0;
  for (const row of INSPECTION_FIXTURE_PLAN) {
    if (!INSPECTION_STATUS_VALUES.some((s) => s.id === row.status)) {
      throw new Error(`no inspection status declared for ${row.status}`);
    }
    if (!inspectionResultValue(row.result)) {
      throw new Error(`no inspection result declared for ${row.result}`);
    }
    const band = DAY_BANDS[row.status];
    if (band === undefined) throw new Error(`no day band declared for status ${row.status}`);
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const dayOffset = band ? between(rand, band.from, band.to) : null;
      const inspected = inspectionResultValue(row.result).inspected;
      records.push({
        recordId: `FIX-IN-${String(1000 + seq * 7).padStart(4, "0")}`,
        kind: "mygov",
        recordType: "inspection",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: INSPECTION_BASIS,
        accessPolicy,
        inspectionType:
          INSPECTION_TYPE_VOCABULARY[
            (typeStart + (seq - 1) * TYPE_STRIDE) % INSPECTION_TYPE_VOCABULARY.length
          ],
        status: row.status,
        result: row.result,
        // A positive determination, not a blank. The basis travels with it.
        ...(inspected ? {} : { resultBasis: RESULT_PENDING_BASIS }),
        place: {
          label: `${pick(rand, PLACE_VOCABULARY)} Block ${between(rand, 1, 9)}, Lot ${between(rand, 1, 40)}`,
          parcelNodeId: null,
          parcelBasis:
            "a generated record is not attached to a parcel, because a parcel is a real record",
        },
        inspectorRef: `INS-${String(1 + ((seq - 1) % INSPECTOR_COUNT)).padStart(2, "0")}`,
        inspectorBasis: INSPECTOR_BASIS,
        dayOffset,
        dayLabel: dayOffset === null ? null : relativeDayLabel(dayOffset),
        ...(dayOffset === null ? { scheduleBasis: UNSCHEDULED_BASIS } : {}),
        provenance: {
          source: "MyGov output contract",
          basis: INSPECTION_BASIS,
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

/** The status tiles, counted off the records. */
export function inspectionMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return INSPECTION_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule:
      "inspections whose status equals this tile, over the generated mygov inspection records on this pack",
  }));
}

/**
 * The result dimension, counted off the records.
 *
 * Four measured classes including not-inspected, never three plus a remainder.
 * Deriving the pending class by subtraction is DEV_PROCESS 1.3 and it would hide
 * exactly the case this domain exists to express: a record that matched no
 * declared result would be absorbed into "pending" and read as normal.
 */
export function inspectionResults(records) {
  const list = Array.isArray(records) ? records : [];
  return INSPECTION_RESULT_VALUES.map((result) => ({
    id: result.id,
    label: result.label,
    severity: result.severity,
    inspected: result.inspected,
    count: list.filter((r) => r.result === result.id).length,
    countingRule: RESULT_COUNTING_RULE,
    ...(result.inspected ? {} : { basis: RESULT_PENDING_BASIS }),
  }));
}

/**
 * The inspector load table, counted off the records and naming nobody.
 *
 * `open` is measured against the DECLARED resolved flag rather than against the
 * literal string "completed". The literal reads identically today and stops
 * being true the moment a fifth state is declared, which is how a count silently
 * starts meaning something else.
 */
export function inspectorLoad(records) {
  const list = Array.isArray(records) ? records : [];
  const openIds = INSPECTION_STATUS_VALUES.filter((s) => !s.resolved).map((s) => s.id);
  const refs = [...new Set(list.map((r) => r.inspectorRef))].sort();
  return refs.map((inspectorRef) => ({
    inspectorRef,
    inspectorBasis: INSPECTOR_BASIS,
    inspectionCount: list.filter((r) => r.inspectorRef === inspectorRef).length,
    openCount: list.filter((r) => r.inspectorRef === inspectorRef && openIds.includes(r.status))
      .length,
    countingRule: INSPECTOR_LOAD_COUNTING_RULE,
  }));
}

export const INSPECTIONS_DOMAIN = defineDomain({
  id: "inspections",
  lensId: "development-services",
  region: "Inspections",
  tab: "inspections",
  gatedBy: "mygov",
  recordType: "inspection",
  vocabulary: [
    ...INSPECTION_TYPE_VOCABULARY,
    ...PLACE_VOCABULARY,
    ...INSPECTION_STATUS_VALUES.map((s) => s.id),
    ...INSPECTION_RESULT_VALUES.map((r) => r.id),
    INSPECTOR_BASIS,
    RESULT_PENDING_BASIS,
    UNSCHEDULED_BASIS,
  ],
  formats: [INSPECTION_ID_FORMAT, PLACE_LABEL_FORMAT, INSPECTOR_REF_FORMAT, DAY_LABEL_FORMAT],
  generate(pack, seedFor) {
    const records = generateInspectionRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("mygov:inspection"),
    });
    return {
      records,
      extras: {
        metrics: inspectionMetrics(records),
        results: inspectionResults(records),
        inspectorLoad: inspectorLoad(records),
      },
    };
  },
});
