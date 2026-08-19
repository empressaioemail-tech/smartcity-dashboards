import { CASE_STAGE_VALUES, CASE_STATUS_VALUES, caseStatusValue, recordShapeFor } from "../adapters.mjs";
import {
  PLACE_VOCABULARY,
  between,
  defineDomain,
  dueLabelFor,
  fixtureBasisFor,
  mulberry32,
  pick,
} from "../fixture-seam.mjs";

/* --------------------------------------------------- domain: permits pipeline

The Development services permit pipeline. This shipped at G-77 as the SHAPE of
src/fixtures.mjs; at G-91 it becomes one registered domain among several, and
nothing about its output moves. The seed label below is byte-identical to the
G-77 derivation on purpose, so the fourteen records a prospect has already been
shown do not silently change under a refactor.
*/

export const SUBJECT_VOCABULARY = [
  "Accessory dwelling unit",
  "Commercial tenant finish-out",
  "Single family addition",
  "Site development permit",
  "Subdivision preliminary plat",
  "Fence and retaining wall",
  "Sign permit",
  "Roof replacement",
  "Residential solar array",
  "Demolition permit",
  "Electrical service upgrade",
  "Food truck park site plan",
  "Patio cover",
  "Water service tap",
];

/**
 * Per-status bands. Stage and due offset are drawn inside the band the status
 * declares, so an overdue case never renders with a future due date and a
 * ready-to-issue case never renders as past due.
 */
export const STATUS_BANDS = {
  overdue: { stages: ["review", "revisions"], dueFrom: -21, dueTo: -2 },
  "in-review": { stages: ["routing", "review"], dueFrom: 2, dueTo: 12 },
  "awaiting-applicant": { stages: ["revisions"], dueFrom: -9, dueTo: 6 },
  "ready-to-issue": { stages: ["issuance"], dueFrom: 3, dueTo: 16 },
};

/**
 * How many of each status a generating pack carries. Declared rather than
 * random so the counts are stable and quotable, and so the metric tiles can be
 * measured against the records and reconciled against this plan.
 */
export const PIPELINE_FIXTURE_PLAN = [
  { status: "overdue", count: 3 },
  { status: "awaiting-applicant", count: 4 },
  { status: "in-review", count: 5 },
  { status: "ready-to-issue", count: 2 },
];

export const FIXTURE_BASIS = fixtureBasisFor("mygov");

/**
 * The relative-due format, declared here rather than allowed by self-reference.
 *
 * The G-77 vocabulary guard listed record.dueLabel among its allowed strings,
 * which allowed the field to authorise itself: any string at all could have been
 * written into dueLabel and the guard would have permitted it, because it was
 * comparing the value to itself. A format closes that, and a wave-2 lane reusing
 * this domain as its template inherits the closed version.
 */
export const DUE_LABEL_FORMAT = /^(due today|due in \d+ days?|\d+ days? past due)$/;

function severityRank(statusId) {
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(
    caseStatusValue(statusId)?.severity || "quiet",
  );
}

/**
 * Generates the permit-case records for a pack. Kept exported with its G-77
 * signature because it is the worked example a wave-2 lane reads, and because
 * src/fixtures.test.mjs probes it directly.
 *
 * It runs NO guard. The seam runs every guard over what this returns, which is
 * the whole point of the seam: a generator cannot forget a step it was never
 * given.
 */
export function generatePipelineRecords({
  cityKey,
  generatesFixtures,
  accessPolicy = "public-free",
  plan = PIPELINE_FIXTURE_PLAN,
  seed,
} = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  if (!generatesFixtures) return [];
  const shape = recordShapeFor("mygov");
  if (!shape?.declared) throw new Error("mygov record shape is not declared");
  const drawSeed = Number.isInteger(seed) ? seed : 0;
  const rand = mulberry32(drawSeed);
  const records = [];
  /**
   * Subjects rotate by a stride coprime with the vocabulary length rather than
   * drawing at random, so a fourteen-row queue reads as fourteen different jobs
   * instead of the same permit type three times.
   */
  const subjectStart = drawSeed % SUBJECT_VOCABULARY.length;
  const SUBJECT_STRIDE = 5;
  let seq = 0;
  for (const row of plan) {
    const band = STATUS_BANDS[row.status];
    if (!band) throw new Error(`no band declared for status ${row.status}`);
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const dueOffsetDays = between(rand, band.dueFrom, band.dueTo);
      records.push({
        recordId: `FIX-${String(1000 + seq * 7).padStart(4, "0")}`,
        kind: "mygov",
        recordType: shape.recordType,
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: FIXTURE_BASIS,
        accessPolicy,
        subject:
          SUBJECT_VOCABULARY[
            (subjectStart + (seq - 1) * SUBJECT_STRIDE) % SUBJECT_VOCABULARY.length
          ],
        stage: pick(rand, band.stages),
        status: row.status,
        place: {
          label: `${pick(rand, PLACE_VOCABULARY)} Block ${between(rand, 1, 9)}, Lot ${between(rand, 1, 40)}`,
          parcelNodeId: null,
          parcelBasis:
            "a generated record is not attached to a parcel, because a parcel is a real record",
        },
        dueOffsetDays,
        dueLabel: dueLabelFor(dueOffsetDays),
        provenance: {
          source: "MyGov output contract",
          basis: FIXTURE_BASIS,
          readAt: null,
          readAtBasis: "nothing was read; this record was generated",
        },
      });
    }
  }
  records.sort((a, b) => {
    const rank = severityRank(a.status) - severityRank(b.status);
    if (rank !== 0) return rank;
    if (a.dueOffsetDays !== b.dueOffsetDays) return a.dueOffsetDays - b.dueOffsetDays;
    return a.recordId.localeCompare(b.recordId);
  });
  return records;
}

export const PIPELINE_COUNTING_RULE =
  "records whose status equals this tile, over the generated mygov permit-case records on this pack";

/**
 * Measures each tile against the records themselves. Never derived from the
 * plan and never by subtraction: DEV_PROCESS 1.3, measure the class you report.
 */
export function pipelineMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return CASE_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule: PIPELINE_COUNTING_RULE,
  }));
}

export const PERMITS_PIPELINE_DOMAIN = defineDomain({
  id: "permits-pipeline",
  lensId: "development-services",
  region: "Pipeline",
  tab: "pipeline",
  gatedBy: "mygov",
  recordType: "permit-case",
  vocabulary: [
    ...SUBJECT_VOCABULARY,
    ...PLACE_VOCABULARY,
    ...CASE_STAGE_VALUES,
    ...CASE_STATUS_VALUES.map((s) => s.id),
  ],
  formats: [/^FIX-\d{4}$/, /^[A-Z][A-Za-z ]+ Block \d+, Lot \d+$/, DUE_LABEL_FORMAT],
  generate(pack, seedFor) {
    // The G-77 label, preserved exactly so the shipped records do not move.
    const records = generatePipelineRecords({
      cityKey: pack.cityKey,
      generatesFixtures: true,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("mygov:permit-case"),
    });
    return { records, extras: { metrics: pipelineMetrics(records) } };
  },
});
