import { CODE_CASE_STATUS_VALUES, CODE_ESCALATION_VALUES } from "../adapters.mjs";
import {
  PLACE_LABEL_FORMAT,
  PLACE_VOCABULARY,
  between,
  defineDomain,
  dueLabelFor,
  fixtureBasisFor,
  mulberry32,
  pick,
} from "../fixture-seam.mjs";

/* --------------------------------------------------- domain: code violations

Live `mygov/code-violations` and `mygov/code-violations/stats`, two of the
sixteen MyGov endpoints the production Bastrop dashboard reads. The build sheet
carries code enforcement twice on purpose - as a Development services tab and as
a department home - and flags that as the one genuine either/or on the sheet.
This domain is the DATA behind both, so the ruling can be made later without
rebuilding anything: it declares `lensId: development-services` and one region,
and a department lens that wants the same records asks for the domain.

The shape this domain exists to prove is a CASE QUEUE WITH AN ORDERED SECOND
AXIS. An escalation ladder is not a set of tiles: rung 3 is further along than
rung 2, the order is contract rather than array position, and a rung inserted
later must not renumber the ones above it. So `step` is declared data on the
value, carried on the record, and reconciled - two numbers that should agree,
which is the cheapest defect available (DEV_PROCESS 1.4).

WHAT THIS DOMAIN DELIBERATELY DOES NOT CARRY. A city's escalation ladder ends in
an assessed figure and this product has read no ledger, so the record states that
absence with a basis and prints no figure. That is the same discipline the
Finance lens is held to and the reason the money gate is a per-pack rule rather
than a markup rule.
*/

export const VIOLATION_TYPE_VOCABULARY = [
  "Tall grass and weeds",
  "Junked vehicle",
  "Illegal dumping",
  "Outdoor storage",
  "Fence in disrepair",
  "Unpermitted structure",
  "Sign without permit",
  "Property maintenance",
  "Overgrown lot",
  "Trash container placement",
  "Inoperable vehicle",
  "Obstructed walkway",
];

/**
 * The declared queue, and the escalation rung is declared WITH the status rather
 * than drawn beside it. The two are not independent on a real ladder - a case
 * past its compliance date has been up the ladder and a freshly noticed one has
 * not - and drawing the rung would make that a probability instead of a
 * property.
 */
export const CODE_FIXTURE_PLAN = [
  { status: "past-compliance", escalation: "hearing-referral", count: 1 },
  { status: "past-compliance", escalation: "final-notice", count: 2 },
  { status: "awaiting-reinspection", escalation: "final-notice", count: 3 },
  { status: "notice-issued", escalation: "formal-notice", count: 4 },
  { status: "notice-issued", escalation: "courtesy-notice", count: 5 },
  { status: "closed-compliant", escalation: "courtesy-notice", count: 4 },
];

/**
 * Where the compliance deadline sits relative to today, per status. Past
 * compliance is behind us by definition; everything else is ahead, including a
 * closed case, which complied before its date rather than after it.
 */
export const COMPLIANCE_BANDS = {
  "past-compliance": { from: -21, to: -2 },
  "awaiting-reinspection": { from: 1, to: 10 },
  "notice-issued": { from: 4, to: 21 },
  "closed-compliant": { from: 0, to: 14 },
};

/**
 * The rungs a case may sit on for each status, as an ASSERTION rather than a
 * comment. The plan above satisfies it today; this is what catches the plan
 * being edited later by someone who does not know the rule.
 */
export const ESCALATION_FLOOR = { "past-compliance": 3 };
export const ESCALATION_CEILING = { "notice-issued": 2 };

/**
 * The floor/ceiling rule, with ONE implementation. The generator calls it and
 * the test calls the same function; a copy in the test would be two
 * implementations of one rule, which is the CTRL-1 shape (DEV_PROCESS 2.4) and
 * would keep passing while the generator's own copy drifted.
 */
export function assertEscalationBand(status, escalation) {
  const rung = escalationValue(escalation);
  if (!rung) throw new Error(`no escalation rung declared for ${escalation}`);
  const floor = ESCALATION_FLOOR[status];
  if (floor !== undefined && rung.step < floor) {
    throw new Error(`${status} sits at or above rung ${floor}, not ${rung.step}`);
  }
  const ceiling = ESCALATION_CEILING[status];
  if (ceiling !== undefined && rung.step > ceiling) {
    throw new Error(`${status} sits at or below rung ${ceiling}, not ${rung.step}`);
  }
  return rung;
}

export const CODE_CASE_ID_FORMAT = /^FIX-CE-\d{4}$/;
export const DUE_LABEL_FORMAT = /^(due today|due in \d+ days?|\d+ days? past due)$/;

export const CODE_BASIS = fixtureBasisFor("mygov");

export const PENALTY_BASIS =
  "a generated record presents no assessed figure; a granted feed and a city ledger are where one would come from";

export const ESCALATION_COUNTING_RULE =
  "cases whose escalation equals this rung, over the generated mygov code-violation records on this pack, one row per record";

export const CODE_STATS_COUNTING_RULE =
  "open and closed are each measured by filtering the generated mygov code-violation records on this pack against the declared resolved flag; neither is derived from the other, and measured is the queue length they must sum to";

export function escalationValue(escalationId) {
  return CODE_ESCALATION_VALUES.find((e) => e.id === escalationId) || null;
}

function severityRank(statusId) {
  const value = CODE_CASE_STATUS_VALUES.find((s) => s.id === statusId);
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(value?.severity || "quiet");
}

function statusValue(statusId) {
  return CODE_CASE_STATUS_VALUES.find((s) => s.id === statusId) || null;
}

/** The queue. Every extra below counts THIS array. */
export function generateCodeViolationRecords({
  cityKey,
  accessPolicy = "public-free",
  seed = 0,
} = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const rand = mulberry32(seed);
  const typeStart = seed % VIOLATION_TYPE_VOCABULARY.length;
  const TYPE_STRIDE = 5;
  const records = [];
  let seq = 0;
  for (const row of CODE_FIXTURE_PLAN) {
    if (!statusValue(row.status)) throw new Error(`no code case status declared for ${row.status}`);
    const rung = assertEscalationBand(row.status, row.escalation);
    const band = COMPLIANCE_BANDS[row.status];
    if (!band) throw new Error(`no compliance band declared for status ${row.status}`);
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const dueOffsetDays = between(rand, band.from, band.to);
      records.push({
        recordId: `FIX-CE-${String(1000 + seq * 4).padStart(4, "0")}`,
        kind: "mygov",
        recordType: "code-violation",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: CODE_BASIS,
        accessPolicy,
        violationType:
          VIOLATION_TYPE_VOCABULARY[
            (typeStart + (seq - 1) * TYPE_STRIDE) % VIOLATION_TYPE_VOCABULARY.length
          ],
        status: row.status,
        escalation: row.escalation,
        escalationStep: rung.step,
        place: {
          label: `${pick(rand, PLACE_VOCABULARY)} Block ${between(rand, 1, 9)}, Lot ${between(rand, 1, 40)}`,
          parcelNodeId: null,
          parcelBasis:
            "a generated record is not attached to a parcel, because a parcel is a real record",
        },
        dueOffsetDays,
        dueLabel: dueLabelFor(dueOffsetDays),
        penaltyBasis: PENALTY_BASIS,
        provenance: {
          source: "MyGov output contract",
          basis: CODE_BASIS,
          readAt: null,
          readAtBasis: "nothing was read; this record was generated",
        },
      });
    }
  }
  records.sort((a, b) => {
    const rank = severityRank(a.status) - severityRank(b.status);
    if (rank !== 0) return rank;
    if (a.escalationStep !== b.escalationStep) return b.escalationStep - a.escalationStep;
    return a.recordId.localeCompare(b.recordId);
  });
  return records;
}

/** The status tiles, counted off the records. */
export function codeViolationMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return CODE_CASE_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule:
      "cases whose status equals this tile, over the generated mygov code-violation records on this pack",
  }));
}

/**
 * The escalation ladder, counted off the records and returned in declared step
 * order. Order is read from `step`, never from the array's position, so a rung
 * added out of order still renders in the right place.
 */
export function escalationLadder(records) {
  const list = Array.isArray(records) ? records : [];
  return [...CODE_ESCALATION_VALUES]
    .sort((a, b) => a.step - b.step)
    .map((rung) => ({
      id: rung.id,
      label: rung.label,
      step: rung.step,
      severity: rung.severity,
      count: list.filter((r) => r.escalation === rung.id).length,
      countingRule: ESCALATION_COUNTING_RULE,
    }));
}

/**
 * The `code-violations/stats` companion the live surface reads, measured off the
 * same array. Open and closed are two measured filters and `measured` is the
 * queue length; a test reconciles all three. Deriving closed as measured minus
 * open would absorb any case whose status fell out of the declared set, which is
 * the class of defect this product has been finding all week.
 */
export function codeViolationStats(records) {
  const list = Array.isArray(records) ? records : [];
  const resolvedIds = CODE_CASE_STATUS_VALUES.filter((s) => s.resolved).map((s) => s.id);
  const openIds = CODE_CASE_STATUS_VALUES.filter((s) => !s.resolved).map((s) => s.id);
  return {
    open: list.filter((r) => openIds.includes(r.status)).length,
    closed: list.filter((r) => resolvedIds.includes(r.status)).length,
    measured: list.length,
    penaltyBasis: PENALTY_BASIS,
    countingRule: CODE_STATS_COUNTING_RULE,
  };
}

export const CODE_VIOLATIONS_DOMAIN = defineDomain({
  id: "code-violations",
  lensId: "development-services",
  region: "Code enforcement",
  tab: "code-enforcement",
  gatedBy: "mygov",
  recordType: "code-violation",
  vocabulary: [
    ...VIOLATION_TYPE_VOCABULARY,
    ...PLACE_VOCABULARY,
    ...CODE_CASE_STATUS_VALUES.map((s) => s.id),
    ...CODE_ESCALATION_VALUES.map((e) => e.id),
    PENALTY_BASIS,
  ],
  formats: [CODE_CASE_ID_FORMAT, PLACE_LABEL_FORMAT, DUE_LABEL_FORMAT],
  generate(pack, seedFor) {
    const records = generateCodeViolationRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("mygov:code-violation"),
    });
    return {
      records,
      extras: {
        metrics: codeViolationMetrics(records),
        escalation: escalationLadder(records),
        stats: codeViolationStats(records),
      },
    };
  },
});
