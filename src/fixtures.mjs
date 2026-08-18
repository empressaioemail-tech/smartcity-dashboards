import {
  CASE_STAGE_VALUES,
  CASE_STATUS_VALUES,
  assertRecordShape,
  caseStatusValue,
  recordShapeFor,
} from "./adapters.mjs";

/* ------------------------------------------------------------------ fixtures

Generates records from the adapter output contracts in adapters.mjs so the
product demonstrates itself, per
_decisions/2026-08-18_template_city_becomes_fixture_city.md.

Three things this file is not. It is not a feed: nothing here reads a city, a
vendor, or a network. It is not seeded from any city's rows. It is not a claim:
every record it emits carries origin fixture and fixture true in the payload, so
a record that escapes its surface still says what it is.

Determinism is a contract, not a habit. The seed is the cityKey and the kind, the
draw is mulberry32, and no value is derived from the clock. Due dates are stored
as an integer day offset and rendered as a relative phrase, so a screenshot can
never go stale and no calendar date is invented.
*/

/** The one parcel this product presents as a demo fixture. Nothing else. */
export const DEMO_FIXTURE_PARCELS = ["48021:34137"];

/**
 * Every string a generated record can carry comes from one of these lists or
 * from a declared format below. That is the control: content cannot drift into a
 * record because nothing else is reachable.
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

/** Invented place names. No street, no number, no real subdivision. */
export const PLACE_VOCABULARY = [
  "Template Commons",
  "Fixture Ridge",
  "Example Crossing",
  "Sample Bend",
  "Placeholder Heights",
  "Specimen Yard",
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

export const FIXTURE_BASIS =
  "generated from the MyGov adapter output contract; no city rows were read";

export const RECORD_ID_FORMAT = /^FIX-\d{4}$/;
export const PLACE_LABEL_FORMAT = /^[A-Z][A-Za-z ]+ Block \d+, Lot \d+$/;

/* ----------------------------------------------------------- deterministic */

function fnv1a(seed) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32. Same seed, same sequence, on every machine and every run. */
function mulberry32(a) {
  let t = a >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

function between(rand, from, to) {
  return from + Math.floor(rand() * (to - from + 1));
}

/* ------------------------------------------------------------ content gate */

const FORBIDDEN_CONTENT = [
  {
    id: "street-address",
    // Labelling gate item 3: no real street address.
    re: /\b\d+\s+[A-Za-z]+\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|way|ct|court|cir|circle|trail|hwy|highway|pkwy|parkway)\b/i,
    says: "a generated record carries no street address",
  },
  {
    id: "money",
    // Labelling gate item 4: no money collected, no payment completed.
    re: /\$\s?\d|\b\d+(\.\d{2})?\s?(usd|dollars)\b|\bpaid\b|\bpayment (complete|completed|received)\b|\bfees? collected\b/i,
    says: "a generated record presents no money and no completed payment",
  },
  {
    id: "vendor-account",
    re: /\b(account|acct|customer)[-_ ]?(id|number|no)?[-_ :#]*\d{4,}/i,
    says: "a generated record carries no vendor account identifier",
  },
  {
    id: "held-identity",
    // The identities G-74 holds off this pack, plus staff names seen in the
    // live Bastrop surface. Named needles, not a guess.
    re: /\bbastrop\b|\bchristy hunn\b|\bsylvia\b|\bchestnut\b/i,
    says: "a generated record carries no held city identity and no real person",
  },
];

const FORBIDDEN_KEYS = ["confidence", "assignee", "reviewer", "staff", "vendorAccountId", "amount", "fee"];

const PARCEL_RE = /\b\d{5}:[A-Za-z0-9._-]+\b/g;

function walkStrings(value, path, visit) {
  if (typeof value === "string") {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(k)) {
        throw new Error(`a generated record carries no ${k} field`);
      }
      walkStrings(v, path ? `${path}.${k}` : k, visit);
    }
  }
}

/**
 * The labelling gate in code. Runs over every generated record, and is proven
 * able to fire in fixtures.test.mjs against a record carrying each forbidden
 * class. A gate nobody has watched fail is not a gate.
 */
export function assertNoRealWorldContent(record) {
  walkStrings(record, "", (text, path) => {
    for (const rule of FORBIDDEN_CONTENT) {
      if (rule.re.test(text)) {
        throw new Error(`${rule.says} (${rule.id} at ${path || "record"})`);
      }
    }
    const parcels = text.match(PARCEL_RE) || [];
    for (const parcel of parcels) {
      if (!DEMO_FIXTURE_PARCELS.includes(parcel)) {
        throw new Error(
          `a generated record carries no parcel outside the demo fixture range (${parcel} at ${path || "record"})`,
        );
      }
    }
  });
  return true;
}

/**
 * Every string on a generated record traces to a declared vocabulary or a
 * declared format. This is the structural half of gate item 3: a value cannot
 * appear unless it was declared, so the gate does not depend on a needle list
 * being complete.
 */
export function assertDeclaredVocabulary(record) {
  const allowed = new Set([
    ...SUBJECT_VOCABULARY,
    ...CASE_STAGE_VALUES,
    ...CASE_STATUS_VALUES.map((s) => s.id),
    record.kind,
    record.recordType,
    record.cityKey,
    record.origin,
    record.accessPolicy,
    FIXTURE_BASIS,
    record.provenance?.source,
    record.provenance?.basis,
    record.provenance?.readAtBasis,
    record.place?.parcelBasis,
    record.dueLabel,
  ]);
  walkStrings(record, "", (text, path) => {
    if (allowed.has(text)) return;
    if (RECORD_ID_FORMAT.test(text)) return;
    if (PLACE_LABEL_FORMAT.test(text)) return;
    throw new Error(`undeclared string on a generated record: ${text} at ${path || "record"}`);
  });
  return true;
}

/* ---------------------------------------------------------------- generate */

export function dueLabelFor(offsetDays) {
  if (offsetDays < 0) {
    const n = Math.abs(offsetDays);
    return n === 1 ? "1 day past due" : `${n} days past due`;
  }
  if (offsetDays === 0) return "due today";
  return offsetDays === 1 ? "due in 1 day" : `due in ${offsetDays} days`;
}

function severityRank(statusId) {
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(
    caseStatusValue(statusId)?.severity || "quiet",
  );
}

/**
 * Generates the permit-case records for a pack. A pack that does not generate
 * fixtures gets an empty array with a basis, never a silent empty: the caller
 * writes the absence from the pack's own declaration.
 */
export function generatePipelineRecords({
  cityKey,
  generatesFixtures,
  accessPolicy = "public-free",
  plan = PIPELINE_FIXTURE_PLAN,
} = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  if (!generatesFixtures) return [];
  const shape = recordShapeFor("mygov");
  if (!shape?.declared) throw new Error("mygov record shape is not declared");
  const seed = fnv1a(`${cityKey}:mygov:${shape.recordType}`);
  const rand = mulberry32(seed);
  const records = [];
  /**
   * Subjects rotate by a stride coprime with the vocabulary length rather than
   * drawing at random, so a fourteen-row queue reads as fourteen different jobs
   * instead of the same permit type three times.
   */
  const subjectStart = seed % SUBJECT_VOCABULARY.length;
  const SUBJECT_STRIDE = 5;
  let seq = 0;
  for (const row of plan) {
    const band = STATUS_BANDS[row.status];
    if (!band) throw new Error(`no band declared for status ${row.status}`);
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const dueOffsetDays = between(rand, band.dueFrom, band.dueTo);
      const record = {
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
      };
      assertRecordShape(record);
      assertNoRealWorldContent(record);
      assertDeclaredVocabulary(record);
      records.push(record);
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

/** Composes the whole Development services pipeline payload for a pack. */
export function composePipeline(pack) {
  if (!pack) throw new Error("pipeline compose requires a pack");
  const generated = pack.generatesFixtures === true;
  const records = generatePipelineRecords({
    cityKey: pack.cityKey,
    generatesFixtures: generated,
    accessPolicy: pack.accessPolicy,
  });
  const metrics = pipelineMetrics(records);
  return {
    lensId: "development-services",
    tab: "pipeline",
    cityKey: pack.cityKey,
    displayName: pack.displayName,
    environment: pack.environment,
    generated,
    kind: "mygov",
    recordType: recordShapeFor("mygov").recordType,
    status: generated ? "ok" : "empty",
    basis: generated
      ? FIXTURE_BASIS
      : `${pack.cityKey} generates no records and no adapter is granted on it`,
    recordCount: records.length,
    countingRule: generated
      ? `${records.length} generated mygov permit-case records on ${pack.cityKey}, one row per record`
      : "no records: this pack generates none",
    metrics,
    records,
  };
}
