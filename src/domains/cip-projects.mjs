import { PROJECT_PHASE_VALUES, PROJECT_STATUS_VALUES } from "../adapters.mjs";
import {
  PLACE_VOCABULARY,
  between,
  defineDomain,
  dueLabelFor,
  fixtureBasisFor,
  mulberry32,
  pick,
} from "../fixture-seam.mjs";

/* ---------------------------------------------------- domain: CIP projects

Power BI capital projects on the Public works lens: a projects register with a
phase dimension.

THE MONEY RULE, and this is the domain where it costs something. A capital
improvement register is a budget document. Every real one leads with a dollar
figure, and this one carries none: not a budget, not a spend, not a percent of
budget, not an encumbrance. The seam's content guard rejects a dollar figure
outright, but the guard is the weaker control. The stronger one is that
src/adapters.mjs declares `budget` on the powerbi shape as a field a generated
record never carries, with the reason attached, so a later lane finds a stated
refusal rather than an omission it might read as an oversight.

A money number beside a city name is a claim about that city's finances. This
record was generated. There is no honest number to print, so it prints none and
says why in budgetBasis.

PHASE AND STATUS ARE TWO QUESTIONS. Phase is where the project sits in its own
lifecycle; status is whether it is in trouble. A register that folds them shows
neither, so both travel and STATUS_PHASES keeps them coherent: a complete
project is in closeout and a stalled one is not.

AN EMBED IS NOT A RECORD. The catalog note on the powerbi kind says so already.
This domain generates records against the CIP output contract; nothing here is a
report embed and no embed token exists anywhere on this path.
*/

export const PROJECT_SUBJECT_VOCABULARY = [
  "Drainage improvement",
  "Street resurfacing",
  "Water line replacement",
  "Wastewater lift station rebuild",
  "Sidewalk connectivity",
  "Signal upgrade",
  "Park restroom rebuild",
  "Fleet facility expansion",
  "Trail extension",
  "Bridge deck repair",
];

export const PROJECT_FIXTURE_PLAN = [
  { status: "stalled", count: 2 },
  { status: "at-risk", count: 3 },
  { status: "in-progress", count: 7 },
  { status: "complete", count: 4 },
];

/**
 * Which phases each status may sit in. A complete project is in closeout and
 * nothing else; a stalled one is anywhere except closeout, because a project
 * cannot be simultaneously finished and stuck.
 */
export const STATUS_PHASES = {
  stalled: ["planning", "design", "bid", "construction"],
  "at-risk": ["design", "bid", "construction"],
  "in-progress": ["planning", "design", "bid", "construction"],
  complete: ["closeout"],
};

export const PROJECT_ID_FORMAT = /^FIX-CIP-\d{4}$/;
export const PLACE_LABEL_FORMAT = /^[A-Z][A-Za-z ]+ Block \d+, Lot \d+$/;
export const SCHEDULE_LABEL_FORMAT = /^(due today|due in \d+ days?|\d+ days? past due)$/;

export const PROJECT_BASIS = fixtureBasisFor("powerbi");

export const BUDGET_BASIS =
  "a generated record carries no budget figure; a granted feed is where a figure would come from, and a money number beside a city name is a claim about that city's finances";

export const PHASE_COUNTING_RULE =
  "projects whose phase equals this phase, over the generated powerbi capital-project records on this pack, one row per record";

export const SCHEDULE_COUNTING_RULE =
  "projects whose scheduleOffsetDays is negative, over the generated powerbi capital-project records on this pack; behind and on-or-ahead are each counted and neither is derived from the other";

function severityRank(statusId) {
  const value = PROJECT_STATUS_VALUES.find((s) => s.id === statusId);
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(value?.severity || "quiet");
}

export function generateProjectRecords({ cityKey, accessPolicy = "public-free", seed = 0 } = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const rand = mulberry32(seed);
  const subjectStart = seed % PROJECT_SUBJECT_VOCABULARY.length;
  const SUBJECT_STRIDE = 3;
  const records = [];
  let seq = 0;
  for (const row of PROJECT_FIXTURE_PLAN) {
    const phases = STATUS_PHASES[row.status];
    if (!phases) throw new Error(`no phases declared for status ${row.status}`);
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const scheduleOffsetDays =
        row.status === "stalled" ? between(rand, -45, -6) : between(rand, -4, 60);
      records.push({
        recordId: `FIX-CIP-${String(1000 + seq * 13).padStart(4, "0")}`,
        kind: "powerbi",
        recordType: "capital-project",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: PROJECT_BASIS,
        accessPolicy,
        subject:
          PROJECT_SUBJECT_VOCABULARY[
            (subjectStart + (seq - 1) * SUBJECT_STRIDE) % PROJECT_SUBJECT_VOCABULARY.length
          ],
        phase: pick(rand, phases),
        status: row.status,
        place: {
          label: `${pick(rand, PLACE_VOCABULARY)} Block ${between(rand, 1, 9)}, Lot ${between(rand, 1, 40)}`,
          parcelNodeId: null,
          parcelBasis:
            "a generated record is not attached to a parcel, because a parcel is a real record",
        },
        scheduleOffsetDays,
        scheduleLabel: dueLabelFor(scheduleOffsetDays),
        budgetBasis: BUDGET_BASIS,
        provenance: {
          source: "Power BI output contract",
          basis: PROJECT_BASIS,
          readAt: null,
          readAtBasis: "nothing was read; this record was generated",
        },
      });
    }
  }
  records.sort((a, b) => {
    const rank = severityRank(a.status) - severityRank(b.status);
    if (rank !== 0) return rank;
    if (a.scheduleOffsetDays !== b.scheduleOffsetDays) return a.scheduleOffsetDays - b.scheduleOffsetDays;
    return a.recordId.localeCompare(b.recordId);
  });
  return records;
}

export function projectMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return PROJECT_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule:
      "projects whose status equals this tile, over the generated powerbi capital-project records on this pack",
  }));
}

/** The phase dimension, counted off the records. Every phase appears, zeros included. */
export function phaseSummary(records) {
  const list = Array.isArray(records) ? records : [];
  return PROJECT_PHASE_VALUES.map((phase) => ({
    phase,
    count: list.filter((r) => r.phase === phase).length,
    countingRule: PHASE_COUNTING_RULE,
  }));
}

/**
 * Schedule variance, two MEASURED classes. Neither is the remainder of the
 * other, so a record that somehow matched neither would show up as a
 * reconciliation failure rather than being absorbed (DEV_PROCESS 1.3).
 */
export function scheduleSummary(records) {
  const list = Array.isArray(records) ? records : [];
  return {
    behind: list.filter((r) => r.scheduleOffsetDays < 0).length,
    onOrAhead: list.filter((r) => r.scheduleOffsetDays >= 0).length,
    measured: list.length,
    countingRule: SCHEDULE_COUNTING_RULE,
  };
}

export const CIP_PROJECTS_DOMAIN = defineDomain({
  id: "cip-projects",
  lensId: "public-works",
  region: "Capital projects",
  gatedBy: "powerbi",
  recordType: "capital-project",
  vocabulary: [
    ...PROJECT_STATUS_VALUES.map((s) => s.id),
    ...PROJECT_PHASE_VALUES,
    ...PROJECT_SUBJECT_VOCABULARY,
    ...PLACE_VOCABULARY,
    BUDGET_BASIS,
  ],
  formats: [PROJECT_ID_FORMAT, PLACE_LABEL_FORMAT, SCHEDULE_LABEL_FORMAT],
  generate(pack, seedFor) {
    const records = generateProjectRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("powerbi:capital-project"),
    });
    return {
      records,
      extras: {
        metrics: projectMetrics(records),
        phases: phaseSummary(records),
        schedule: scheduleSummary(records),
        budgetBasis: BUDGET_BASIS,
      },
    };
  },
});
