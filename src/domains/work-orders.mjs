import { WORK_ORDER_STAGE_VALUES, WORK_ORDER_STATUS_VALUES } from "../adapters.mjs";
import {
  PLACE_VOCABULARY,
  between,
  dayLabelFor,
  defineDomain,
  dueLabelFor,
  fixtureBasisFor,
  mulberry32,
  pick,
} from "../fixture-seam.mjs";

/* ------------------------------------------------------ domain: work orders

MyGov work orders, and the reason this domain is one of the three exemplars is
that it is COMPOUND. The live Bastrop surface carries work-orders alongside
daily-queue, geo-clusters, sla and stats, so a flat list would be a shape the
lens cannot be built against. The seam therefore has to carry extras beside
records, and this domain is the proof that it does.

Every figure below is measured off the records after they exist. Nothing is
declared and then asserted: the SLA block counts the queue, the daily slice
counts the queue, and a test reconciles both against the queue length. Deriving
either by subtraction is the DEV_PROCESS 1.3 defect and would be invisible here.
*/

export const WORK_ORDER_SUBJECT_VOCABULARY = [
  "Water main leak repair",
  "Street light outage",
  "Pothole repair",
  "Traffic signal fault",
  "Storm drain blockage",
  "Sidewalk panel replacement",
  "Park irrigation fault",
  "Sign replacement",
  "Hydrant flow test",
  "Alley grading request",
  "Culvert clearing",
  "Playground surface repair",
];

/**
 * The declared queue. Same discipline as the pipeline plan: counts are declared
 * so the tiles can be reconciled against them, never drawn.
 */
export const WORK_ORDER_FIXTURE_PLAN = [
  { status: "past-sla", count: 2 },
  { status: "at-risk", count: 3 },
  { status: "scheduled", count: 6 },
  { status: "closed", count: 4 },
];

/**
 * Hours, per status band, against a declared target. Elapsed is drawn inside the
 * band the status names, so a past-SLA order can never render inside its target
 * and a scheduled one can never render past it.
 */
export const SLA_TARGET_HOURS = 72;
export const SLA_BANDS = {
  "past-sla": { from: 74, to: 140, state: "breached" },
  "at-risk": { from: 58, to: 71, state: "at-risk" },
  scheduled: { from: 2, to: 40, state: "within" },
  closed: { from: 1, to: 60, state: "within" },
};

export const STATUS_STAGES = {
  "past-sla": ["triaged", "in-field"],
  "at-risk": ["scheduled", "in-field"],
  scheduled: ["reported", "triaged", "scheduled"],
  closed: ["closed"],
};

export const WORK_ORDER_BASIS = fixtureBasisFor("mygov");

export const DUE_LABEL_FORMAT = /^(due today|due in \d+ days?|\d+ days? past due)$/;
export const DAY_LABEL_FORMAT = /^(today|in \d+ days?)$/;
export const WORK_ORDER_ID_FORMAT = /^FIX-WO-\d{4}$/;

/** Five days, because a daily queue that is one day is not a daily queue. */
export const DAILY_QUEUE_DAYS = 5;

export const SLA_COUNTING_RULE =
  "work orders whose slaElapsedHours falls in this band, over the generated mygov work-order records on this pack, against a declared 72 hour target";

export const DAILY_QUEUE_COUNTING_RULE =
  "work orders whose dayOffset equals this day, over the generated mygov work-order records on this pack, one row per record";

function severityRank(statusId) {
  const value = WORK_ORDER_STATUS_VALUES.find((s) => s.id === statusId);
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(value?.severity || "quiet");
}

function slaStateFor(elapsedHours) {
  if (elapsedHours > SLA_TARGET_HOURS) return "breached";
  if (elapsedHours >= SLA_TARGET_HOURS - 14) return "at-risk";
  return "within";
}

/** The queue. Measured, never declared: every extra below counts this array. */
export function generateWorkOrderRecords({ cityKey, accessPolicy = "public-free", seed = 0 } = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const rand = mulberry32(seed);
  const subjectStart = seed % WORK_ORDER_SUBJECT_VOCABULARY.length;
  const SUBJECT_STRIDE = 5;
  const records = [];
  let seq = 0;
  for (const row of WORK_ORDER_FIXTURE_PLAN) {
    const band = SLA_BANDS[row.status];
    if (!band) throw new Error(`no SLA band declared for status ${row.status}`);
    const stages = STATUS_STAGES[row.status];
    if (!stages) throw new Error(`no stages declared for status ${row.status}`);
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const slaElapsedHours = between(rand, band.from, band.to);
      const dueOffsetDays = row.status === "past-sla" ? between(rand, -6, -1) : between(rand, 0, 9);
      const dayOffset = between(rand, 0, DAILY_QUEUE_DAYS - 1);
      records.push({
        recordId: `FIX-WO-${String(1000 + seq * 3).padStart(4, "0")}`,
        kind: "mygov",
        recordType: "work-order",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: WORK_ORDER_BASIS,
        accessPolicy,
        subject:
          WORK_ORDER_SUBJECT_VOCABULARY[
            (subjectStart + (seq - 1) * SUBJECT_STRIDE) % WORK_ORDER_SUBJECT_VOCABULARY.length
          ],
        stage: pick(rand, stages),
        status: row.status,
        place: {
          label: `${pick(rand, PLACE_VOCABULARY)} Block ${between(rand, 1, 9)}, Lot ${between(rand, 1, 40)}`,
          parcelNodeId: null,
          parcelBasis:
            "a generated record is not attached to a parcel, because a parcel is a real record",
        },
        dueOffsetDays,
        dueLabel: dueLabelFor(dueOffsetDays),
        dayOffset,
        dayLabel: dayLabelFor(dayOffset),
        slaTargetHours: SLA_TARGET_HOURS,
        slaElapsedHours,
        slaState: slaStateFor(slaElapsedHours),
        provenance: {
          source: "MyGov output contract",
          basis: WORK_ORDER_BASIS,
          readAt: null,
          readAtBasis: "nothing was read; this record was generated",
        },
      });
    }
  }
  records.sort((a, b) => {
    const rank = severityRank(a.status) - severityRank(b.status);
    if (rank !== 0) return rank;
    if (a.slaElapsedHours !== b.slaElapsedHours) return b.slaElapsedHours - a.slaElapsedHours;
    return a.recordId.localeCompare(b.recordId);
  });
  return records;
}

/** The status tiles, counted off the records. */
export function workOrderMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return WORK_ORDER_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule:
      "work orders whose status equals this tile, over the generated mygov work-order records on this pack",
  }));
}

/**
 * The SLA dimension, counted off the records against a declared target.
 *
 * Three measured classes, never two plus a subtraction, so a record that somehow
 * matched no band would show up as a reconciliation failure rather than being
 * absorbed into whichever class was derived last.
 */
export function slaSummary(records) {
  const list = Array.isArray(records) ? records : [];
  const inState = (state) => list.filter((r) => r.slaState === state).length;
  return {
    targetHours: SLA_TARGET_HOURS,
    breached: inState("breached"),
    atRisk: inState("at-risk"),
    within: inState("within"),
    measured: list.length,
    countingRule: SLA_COUNTING_RULE,
  };
}

/** The daily slice, counted off the records. Relative days only; no calendar date. */
export function dailyQueue(records) {
  const list = Array.isArray(records) ? records : [];
  const days = [];
  for (let dayOffset = 0; dayOffset < DAILY_QUEUE_DAYS; dayOffset += 1) {
    days.push({
      dayOffset,
      dayLabel: dayLabelFor(dayOffset),
      count: list.filter((r) => r.dayOffset === dayOffset).length,
      countingRule: DAILY_QUEUE_COUNTING_RULE,
    });
  }
  return days;
}

export const WORK_ORDERS_DOMAIN = defineDomain({
  id: "work-orders",
  lensId: "development-services",
  region: "Work orders",
  tab: "work-orders",
  gatedBy: "mygov",
  recordType: "work-order",
  vocabulary: [
    ...WORK_ORDER_SUBJECT_VOCABULARY,
    ...PLACE_VOCABULARY,
    ...WORK_ORDER_STAGE_VALUES,
    ...WORK_ORDER_STATUS_VALUES.map((s) => s.id),
    "within",
    "at-risk",
    "breached",
  ],
  formats: [
    WORK_ORDER_ID_FORMAT,
    /^[A-Z][A-Za-z ]+ Block \d+, Lot \d+$/,
    DUE_LABEL_FORMAT,
    DAY_LABEL_FORMAT,
  ],
  generate(pack, seedFor) {
    const records = generateWorkOrderRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("mygov:work-order"),
    });
    return {
      records,
      extras: {
        metrics: workOrderMetrics(records),
        sla: slaSummary(records),
        dailyQueue: dailyQueue(records),
      },
    };
  },
});
