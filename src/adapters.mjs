import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";

export const WRITE_TARGETS = new Set(["spine", "files"]);

export const ACCESS_POLICIES = new Set([
  "public-free",
  "public-paid",
  "platform-internal",
  "tenant-private",
  "tenant-shared",
]);

export const ADAPTER_KINDS = [
  {
    id: "mygov",
    displayName: "MyGov",
    writesTo: "spine",
    defaultAccessPolicy: "tenant-private",
    notes: "Permit and work-order records onto spine. Not a copied table.",
  },
  {
    id: "samsara",
    displayName: "Samsara",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Fleet ops records onto files. Not Asset Management Tier 1 nodes.",
  },
  {
    id: "opengov",
    displayName: "OpenGov",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Budget and finance records onto files.",
  },
  {
    id: "esri",
    displayName: "Esri",
    writesTo: "spine",
    defaultAccessPolicy: "tenant-private",
    notes: "Place geometry and GIS facts onto spine.",
  },
  {
    id: "municode",
    displayName: "municode",
    writesTo: "spine",
    defaultAccessPolicy: "tenant-private",
    notes: "Code and calendar records onto spine.",
  },
  {
    id: "firstdue",
    displayName: "FirstDue",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Fire and EMS incident records onto files.",
  },
  {
    id: "verkada",
    displayName: "Verkada",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Camera and door ops records onto files.",
  },
  /**
   * G-91 additions. Live Bastrop integrates these three vendor families and the
   * catalog did not name them, so the nav footer's denominator was short against
   * reality and every one of these regions could only read as "not built".
   *
   * Counting rule for the figure this changes: DISTINCT adapter kinds granted on
   * a pack, over the kinds in this array. The array goes 7 to 10, so the footer
   * denominator goes 7 to 10.
   *
   * It does NOT go to 11. The eleventh vendor family on the live surface is
   * Anthropic, which the G-18 register dispositions as chrome only and
   * explicitly not a city feed; cataloguing it would declare an adapter kind
   * that writes no records anywhere.
   */
  {
    id: "spireon",
    displayName: "Spireon",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Police vehicle telemetry records onto files. Not Asset Management Tier 1 nodes.",
  },
  {
    id: "goto",
    displayName: "GoTo",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Phone and call-handling records onto files.",
  },
  {
    id: "powerbi",
    displayName: "Power BI",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "CIP and reporting records onto files. An embed is not a record.",
  },
];

/* --------------------------------------------------------------- record shapes

ADAPTER_KINDS says where a kind writes and under what access policy, and stopped
there. With no declared record shape nothing downstream could generate a record,
validate one, or render one, so the fixture pack ruling
(_decisions/2026-08-18_template_city_becomes_fixture_city.md) had no contract to
generate from.

The declaration below is that contract, and it is deliberately data beside
ADAPTER_KINDS rather than logic inside a generator. Generated fixtures and a
granted adapter's real records are then the same shape, which is what makes
swapping a real city in a pack switch instead of a surface change.

A kind with no declared shape says so with a basis. An undeclared shape is a
positive determination, never a blank.
*/

export const RECORD_ORIGINS = ["feed", "fixture"];

/** Fields every record of every kind carries, whatever produced it. */
export const RECORD_ENVELOPE_FIELDS = [
  { name: "recordId", type: "identifier", required: true },
  { name: "kind", type: "adapter-kind", required: true },
  { name: "recordType", type: "text", required: true },
  { name: "cityKey", type: "text", required: true },
  { name: "origin", type: "enum", required: true, values: RECORD_ORIGINS },
  { name: "accessPolicy", type: "access-policy", required: true },
  { name: "provenance", type: "provenance", required: true },
];

/**
 * Marks a generated record carries IN THE PAYLOAD. Labelling gate item 2: a
 * record that escapes its surface still says what it is, so the chrome label is
 * additional and never the only mark.
 */
export const FIXTURE_MARK_FIELDS = [
  { name: "fixture", type: "true", required: true },
  { name: "fixtureBasis", type: "text", required: true },
];

/**
 * The four in-flight states 30c names on the Development services metric strip.
 * Severity is the 30b semantic meaning, not a class name: the contract declares
 * meaning and the renderer chooses the carrier.
 */
export const CASE_STATUS_VALUES = [
  { id: "overdue", label: "Overdue", severity: "crit", resolved: false },
  { id: "in-review", label: "In review", severity: "info", resolved: false },
  { id: "awaiting-applicant", label: "Awaiting applicant", severity: "warn", resolved: false },
  { id: "ready-to-issue", label: "Ready to issue", severity: "ok", resolved: true },
];

export const CASE_STAGE_VALUES = ["intake", "routing", "review", "revisions", "issuance"];

/**
 * Work orders, G-91. A SECOND record type under the mygov kind, which is why
 * RECORD_SHAPES grew variants: one adapter kind emits several record types on
 * the live surface (permits, work orders, inspections, code violations and
 * business licenses all arrive from MyGov), and a shape table keyed by kind
 * alone can express exactly one of them.
 *
 * The SLA dimension is stated in whole hours against a declared target rather
 * than as a percentage, because a percentage with no denominator beside it is
 * the figure DEV_PROCESS 1.1 exists to stop.
 */
export const WORK_ORDER_STATUS_VALUES = [
  { id: "past-sla", label: "Past SLA", severity: "crit", resolved: false },
  { id: "at-risk", label: "At risk", severity: "warn", resolved: false },
  { id: "scheduled", label: "Scheduled", severity: "info", resolved: false },
  { id: "closed", label: "Closed", severity: "ok", resolved: true },
];

export const WORK_ORDER_STAGE_VALUES = ["reported", "triaged", "scheduled", "in-field", "closed"];

/** Fleet, G-91. Vendor telemetry, and explicitly not a city-owned asset node. */
export const VEHICLE_STATUS_VALUES = [
  { id: "out-of-service", label: "Out of service", severity: "crit", resolved: false },
  { id: "inspection-due", label: "Inspection due", severity: "warn", resolved: false },
  { id: "in-shop", label: "In shop", severity: "info", resolved: false },
  { id: "in-service", label: "In service", severity: "ok", resolved: true },
];

/**
 * Devices, G-92. Cameras and doors, and the reason this is its own set rather
 * than a reuse of VEHICLE_STATUS_VALUES is that the bands genuinely differ: a
 * camera is never "in shop" and a vehicle is never "signal loss". Fire apparatus
 * DOES reuse the vehicle set, and that asymmetry is deliberate and stated in
 * src/domains/fire-apparatus.mjs where it is read.
 */
export const DEVICE_STATUS_VALUES = [
  { id: "offline", label: "Offline", severity: "crit", resolved: false },
  { id: "signal-loss", label: "Signal loss", severity: "warn", resolved: false },
  { id: "firmware-due", label: "Firmware due", severity: "info", resolved: false },
  { id: "online", label: "Online", severity: "ok", resolved: true },
];

/**
 * Capital projects, G-92. A CIP register carries a PHASE beside its status, and
 * the two are different questions: phase is where the project is in its own
 * lifecycle, status is whether it is in trouble. Collapsing them would lose the
 * dimension the lens exists to show.
 */
export const PROJECT_STATUS_VALUES = [
  { id: "stalled", label: "Stalled", severity: "crit", resolved: false },
  { id: "at-risk", label: "At risk", severity: "warn", resolved: false },
  { id: "in-progress", label: "In progress", severity: "info", resolved: false },
  { id: "complete", label: "Complete", severity: "ok", resolved: true },
];

export const PROJECT_PHASE_VALUES = ["planning", "design", "bid", "construction", "closeout"];
/* ------------------------------------------------- G-92 development services

Three more record types under the mygov kind, and the reason they are here is
the operator's requirement rather than a shape exercise: Development services
must match the data the PRODUCTION Bastrop dashboard displays today, because it
monitors the MyGov system the city already runs. Live carries MyGov across
sixteen endpoints and this product modelled two of them, permits and work
orders. inspections, code-violations (with its stats companion) and
business-licenses are the three that close the gap
(_inbox/2026-08-19_template_city_lens_build_sheet.md, entry 2; tab roster in
30c_smartcity_platform_ia.md).

Each carries a QUEUE STATE and one further dimension, and the two are declared
separately on purpose. A queue state answers "where is this in the process" and
the dimension answers "what came of it", and folding either into the other is
how a surface ends up unable to say that a scheduled inspection has no result
yet - which is the same shape as the ungranted/granted-empty collapse ruling 1
exists to close, one layer down.

Every one of these blocks stays additive to the arrays above. Nothing here
changes permits or work orders, and no feed is connected by declaring a shape.
*/

/**
 * Inspections, the queue state. Four in-flight states matching the strip the
 * other DS domains already declare, and the loud end is first so a renderer
 * sorting on severity puts exceptions at the top without a second rule.
 */
export const INSPECTION_STATUS_VALUES = [
  { id: "past-due", label: "Past due", severity: "crit", resolved: false },
  { id: "unscheduled", label: "Unscheduled", severity: "warn", resolved: false },
  { id: "scheduled", label: "Scheduled", severity: "info", resolved: false },
  { id: "completed", label: "Completed", severity: "ok", resolved: true },
];

/**
 * Inspections, the result dimension. A SEPARATE axis from the queue state, and
 * not-inspected is a declared value rather than a missing field: an inspection
 * that has not happened has a positive determination about its result, and it
 * carries a basis on the record. A null here would read as an oversight, which
 * is the absence-with-no-basis defect this program hunts.
 *
 * `inspected` is what makes the pairing testable: a completed inspection must
 * carry an inspected result and an uncompleted one must not.
 */
export const INSPECTION_RESULT_VALUES = [
  { id: "failed", label: "Failed", severity: "crit", inspected: true },
  { id: "corrections", label: "Corrections required", severity: "warn", inspected: true },
  { id: "passed", label: "Passed", severity: "ok", inspected: true },
  { id: "not-inspected", label: "Not inspected", severity: "quiet", inspected: false },
];

/** Code enforcement, the case state. Live mygov/code-violations. */
export const CODE_CASE_STATUS_VALUES = [
  { id: "past-compliance", label: "Past compliance date", severity: "crit", resolved: false },
  { id: "awaiting-reinspection", label: "Awaiting reinspection", severity: "warn", resolved: false },
  { id: "notice-issued", label: "Notice issued", severity: "info", resolved: false },
  { id: "closed-compliant", label: "Closed compliant", severity: "ok", resolved: true },
];

/**
 * Code enforcement, the escalation dimension. An ORDERED ladder, so `step` is
 * declared data rather than the array index: a renderer or a test that needs the
 * order must not have to know how this array happens to be written, and a rung
 * inserted later must not silently renumber the ones above it.
 *
 * No rung names money. A city's escalation ladder ends in an assessed figure and
 * this product has read no ledger, so the record states that absence with a
 * basis instead of printing a number it cannot stand behind.
 */
export const CODE_ESCALATION_VALUES = [
  { id: "courtesy-notice", label: "Courtesy notice", step: 1, severity: "quiet" },
  { id: "formal-notice", label: "Formal notice", step: 2, severity: "info" },
  { id: "final-notice", label: "Final notice", step: 3, severity: "warn" },
  { id: "hearing-referral", label: "Referred to hearing", step: 4, severity: "crit" },
];

/**
 * Business licences, the roll state. The expiry dimension itself is banded in
 * src/domains/business-licenses.mjs, beside the plan that produces it, for the
 * same reason the SLA bands live beside the work-order plan: a band is derived
 * presentation and a status is contract.
 */
export const LICENSE_STATUS_VALUES = [
  { id: "expired", label: "Expired", severity: "crit", resolved: false },
  { id: "expiring", label: "Expiring", severity: "warn", resolved: false },
  { id: "renewal-submitted", label: "Renewal submitted", severity: "info", resolved: false },
  { id: "active", label: "Active", severity: "ok", resolved: true },
];

export const RECORD_SHAPES = {
  mygov: {
    declared: true,
    recordType: "permit-case",
    writesTo: "spine",
    statusValues: CASE_STATUS_VALUES,
    fields: [
      { name: "subject", type: "text", required: true },
      { name: "stage", type: "enum", required: true, values: CASE_STAGE_VALUES },
      { name: "place", type: "place", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        values: CASE_STATUS_VALUES.map((s) => s.id),
      },
      { name: "dueOffsetDays", type: "integer", required: true },
      {
        name: "dueDate",
        type: "date",
        required: false,
        basis:
          "a granted feed carries the absolute due date; a generated record carries the offset only, because a fixture must not print a calendar date",
      },
    ],
  },
  samsara: {
    declared: true,
    recordType: "fleet-vehicle",
    writesTo: "files",
    statusValues: VEHICLE_STATUS_VALUES,
    fields: [
      { name: "unitLabel", type: "text", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        values: VEHICLE_STATUS_VALUES.map((s) => s.id),
      },
      { name: "operatorRef", type: "text", required: true },
      { name: "odometerBand", type: "text", required: true },
      {
        name: "operatorName",
        type: "text",
        required: false,
        basis:
          "a granted feed carries the driver name; a generated record carries an opaque operator reference only, because a fixture must not name a person",
      },
    ],
  },
  spireon: {
    declared: true,
    recordType: "patrol-vehicle",
    writesTo: "files",
    statusValues: VEHICLE_STATUS_VALUES,
    fields: [
      { name: "unitLabel", type: "text", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        values: VEHICLE_STATUS_VALUES.map((s) => s.id),
      },
      { name: "operatorRef", type: "text", required: true },
    ],
  },
  opengov: { declared: false, basis: "budget record shape is not declared on G-91" },
  esri: { declared: false, basis: "place geometry record shape is not declared on G-91" },
  municode: {
    declared: false,
    basis: "meeting record shape ships in municode-calendar.mjs and is not restated here",
  },
  /**
   * G-92. Four shapes that read `declared: false` at G-91 and now carry a
   * contract, because four department lenses generate against them.
   *
   * Each one declares at least one field it will NEVER carry, with a basis. That
   * is not decoration. An optional field with a stated basis is how this table
   * says "a granted feed has this and a generated record does not, and here is
   * why" — the pattern samsara.operatorName established, applied to the two
   * families that are genuinely dangerous rather than merely absent.
   */
  firstdue: {
    declared: true,
    recordType: "fire-apparatus",
    writesTo: "files",
    statusValues: VEHICLE_STATUS_VALUES,
    fields: [
      { name: "unitLabel", type: "text", required: true },
      { name: "apparatusType", type: "text", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        values: VEHICLE_STATUS_VALUES.map((s) => s.id),
      },
      { name: "stationRef", type: "text", required: true },
      { name: "stationLabel", type: "text", required: true },
      {
        name: "crew",
        type: "text",
        required: false,
        basis:
          "a granted feed carries the assigned crew; a generated record names no person, because a roster of real firefighters is not a demo fixture",
      },
    ],
  },
  verkada: {
    declared: true,
    recordType: "camera-device",
    writesTo: "files",
    statusValues: DEVICE_STATUS_VALUES,
    fields: [
      { name: "deviceLabel", type: "text", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        values: DEVICE_STATUS_VALUES.map((s) => s.id),
      },
      { name: "siteRef", type: "text", required: true },
      { name: "placement", type: "text", required: true },
      { name: "occupancyBand", type: "text", required: true },
      {
        name: "plateReads",
        type: "text",
        required: false,
        basis:
          "the live vendor exposes a plate-read family; a generated record carries none, because a plate read is a surveillance record about an identifiable person and a demo fixture pack does not carry one",
      },
      {
        name: "personsOfInterest",
        type: "text",
        required: false,
        basis:
          "the live vendor exposes a persons-of-interest family; a generated record carries none, for the same reason as plateReads and with the same force",
      },
      {
        name: "occupancyCount",
        type: "integer",
        required: false,
        basis:
          "a granted feed carries a counted occupancy; a generated record carries a band only, because a specific head count is a specific claim about a specific place at a specific moment",
      },
    ],
  },
  goto: {
    declared: true,
    recordType: "call-volume",
    writesTo: "files",
    statusValues: null,
    statusValuesBasis:
      "a call-volume record is an aggregate bucket and has no in-flight status; the volume is the fact, and inventing a status band for it would put a severity on a number that carries none",
    fields: [
      { name: "queueRef", type: "text", required: true },
      { name: "queueLabel", type: "text", required: true },
      { name: "dayOffset", type: "integer", required: true },
      { name: "callsOffered", type: "integer", required: true },
      { name: "callsAnswered", type: "integer", required: true },
      { name: "callsAbandoned", type: "integer", required: true },
      {
        name: "recording",
        type: "text",
        required: false,
        basis:
          "the live vendor exposes call recordings; a generated record carries none, because a recording is a conversation with an identifiable resident",
      },
      {
        name: "callerRef",
        type: "text",
        required: false,
        basis:
          "the live vendor exposes individual call detail; a generated record aggregates to a queue and a relative day and never to a call",
      },
      {
        name: "extensionOwner",
        type: "text",
        required: false,
        basis:
          "the live vendor exposes an extension directory; a generated record maps no extension to a person, because that mapping is a staff roster",
      },
    ],
  },
  powerbi: {
    declared: true,
    recordType: "capital-project",
    writesTo: "files",
    statusValues: PROJECT_STATUS_VALUES,
    fields: [
      { name: "subject", type: "text", required: true },
      { name: "phase", type: "enum", required: true, values: PROJECT_PHASE_VALUES },
      {
        name: "status",
        type: "enum",
        required: true,
        values: PROJECT_STATUS_VALUES.map((s) => s.id),
      },
      { name: "place", type: "place", required: true },
      { name: "scheduleOffsetDays", type: "integer", required: true },
      {
        name: "budget",
        type: "integer",
        required: false,
        basis:
          "a granted feed carries the project budget; a generated record carries no figure, because a money number beside a city name is a claim about that city's finances and this record was generated",
      },
    ],
  },
};

/**
 * The work-order variant, attached after the object literal so the table above
 * stays one readable declaration. Variants live UNDER their kind so there is one
 * shape table and not two: two tables for one rule is the CTRL-1 shape
 * (DEV_PROCESS 2.4).
 */
RECORD_SHAPES.mygov.variants = {
  "work-order": {
    declared: true,
    recordType: "work-order",
    writesTo: "spine",
    statusValues: WORK_ORDER_STATUS_VALUES,
    fields: [
      { name: "subject", type: "text", required: true },
      { name: "stage", type: "enum", required: true, values: WORK_ORDER_STAGE_VALUES },
      { name: "place", type: "place", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        values: WORK_ORDER_STATUS_VALUES.map((s) => s.id),
      },
      { name: "dueOffsetDays", type: "integer", required: true },
      { name: "dayOffset", type: "integer", required: true },
      { name: "slaTargetHours", type: "integer", required: true },
      { name: "slaElapsedHours", type: "integer", required: true },
    ],
  },
};

/**
 * The three G-92 variants, attached to the SAME variants object rather than to a
 * second table. Two tables for one rule is the CTRL-1 shape (DEV_PROCESS 2.4),
 * so there is still exactly one shape table and recordShapeFor is still its only
 * reader; this is a second attachment statement, not a second source of truth.
 *
 * Attaching rather than editing the literal above is deliberate and mechanical:
 * two wave-2 lanes edit this file concurrently, and an append rebases where an
 * in-place edit of a shared literal conflicts.
 *
 * Every one of these declares the field a GRANTED feed would carry and a
 * generated record must not, with the basis stated on the field. That pattern is
 * the reason a fixture and a real record are the same shape: what differs is
 * which optional fields are filled, never the contract.
 */
Object.assign(RECORD_SHAPES.mygov.variants, {
  inspection: {
    declared: true,
    recordType: "inspection",
    writesTo: "spine",
    statusValues: INSPECTION_STATUS_VALUES,
    resultValues: INSPECTION_RESULT_VALUES,
    fields: [
      { name: "inspectionType", type: "text", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        values: INSPECTION_STATUS_VALUES.map((s) => s.id),
      },
      {
        name: "result",
        type: "enum",
        required: true,
        values: INSPECTION_RESULT_VALUES.map((r) => r.id),
      },
      { name: "place", type: "place", required: true },
      { name: "inspectorRef", type: "text", required: true },
      {
        name: "dayOffset",
        type: "integer",
        required: false,
        basis:
          "an unscheduled inspection carries no day at all and states that as its own basis; a scheduled or completed one carries the offset",
      },
      {
        name: "inspectorName",
        type: "text",
        required: false,
        basis:
          "a granted feed carries the inspector name; a generated record carries an opaque inspector reference only, because a fixture must not name a person",
      },
      {
        name: "inspectedOn",
        type: "date",
        required: false,
        basis:
          "a granted feed carries the absolute inspection date; a generated record carries the offset only, because a fixture must not print a calendar date",
      },
    ],
  },
  "code-violation": {
    declared: true,
    recordType: "code-violation",
    writesTo: "spine",
    statusValues: CODE_CASE_STATUS_VALUES,
    escalationValues: CODE_ESCALATION_VALUES,
    fields: [
      { name: "violationType", type: "text", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        values: CODE_CASE_STATUS_VALUES.map((s) => s.id),
      },
      {
        name: "escalation",
        type: "enum",
        required: true,
        values: CODE_ESCALATION_VALUES.map((e) => e.id),
      },
      { name: "escalationStep", type: "integer", required: true },
      { name: "place", type: "place", required: true },
      { name: "dueOffsetDays", type: "integer", required: true },
      {
        name: "assessedPenalty",
        type: "text",
        required: false,
        basis:
          "a granted feed and a city ledger are where an assessed figure comes from; a generated record states the absence and prints no figure",
      },
      {
        name: "complianceDate",
        type: "date",
        required: false,
        basis:
          "a granted feed carries the absolute compliance date; a generated record carries the offset only, because a fixture must not print a calendar date",
      },
    ],
  },
  "business-license": {
    declared: true,
    recordType: "business-license",
    writesTo: "spine",
    statusValues: LICENSE_STATUS_VALUES,
    fields: [
      { name: "licenseCategory", type: "text", required: true },
      {
        name: "status",
        type: "enum",
        required: true,
        values: LICENSE_STATUS_VALUES.map((s) => s.id),
      },
      { name: "place", type: "place", required: true },
      { name: "holderRef", type: "text", required: true },
      { name: "expiryOffsetDays", type: "integer", required: true },
      {
        name: "holderName",
        type: "text",
        required: false,
        basis:
          "a granted feed carries the licensed business name; a generated record carries an opaque holder reference only, because a fixture must not name a real business",
      },
      {
        name: "expiresOn",
        type: "date",
        required: false,
        basis:
          "a granted feed carries the absolute expiry date; a generated record carries the offset only, because a fixture must not print a calendar date",
      },
    ],
  },
});

/**
 * Resolves a shape for a kind, and for a specific record type within that kind.
 *
 * One argument returns the kind PRIMARY shape, which is what every pre-G-91
 * caller wants and gets unchanged. Two arguments resolve a variant, and return
 * null when the kind exists but declares nothing of that record type - which
 * assertRecordShape reports as its own error rather than folding into
 * "undeclared kind", because the two are different findings.
 */
export function recordShapeFor(kindId, recordType) {
  const primary = RECORD_SHAPES[kindId] || null;
  if (!primary) return null;
  if (recordType === undefined || recordType === null) return primary;
  if (primary.recordType === recordType) return primary;
  return primary.variants?.[recordType] || null;
}

/** Every declared shape in the table, kind and record type, flattened. */
export function declaredRecordShapes() {
  const out = [];
  for (const [kindId, shape] of Object.entries(RECORD_SHAPES)) {
    if (shape.declared) out.push({ kind: kindId, recordType: shape.recordType });
    for (const [recordType, variant] of Object.entries(shape.variants || {})) {
      if (variant.declared) out.push({ kind: kindId, recordType });
    }
  }
  return out.sort((a, b) =>
    (a.kind + ":" + a.recordType).localeCompare(b.kind + ":" + b.recordType),
  );
}

export function caseStatusValue(statusId) {
  return CASE_STATUS_VALUES.find((s) => s.id === statusId) || null;
}

function fieldPresent(record, field) {
  const value = record[field.name];
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && !value.trim()) return false;
  return true;
}

/**
 * Validates a record against the declared shape for its kind. The generator runs
 * this over everything it emits, so a fixture that drifts from the contract
 * fails at the source rather than on a surface.
 */
export function assertRecordShape(record) {
  if (!record || typeof record !== "object") {
    throw new Error("record requires an object");
  }
  const kindEntry = RECORD_SHAPES[record.kind];
  if (!kindEntry) throw new Error(`no record shape declared for kind ${record.kind}`);
  if (!kindEntry.declared) {
    throw new Error(`record shape for ${record.kind} is undeclared: ${kindEntry.basis}`);
  }
  const shape = recordShapeFor(record.kind, record.recordType);
  if (!shape) {
    const known = [kindEntry.recordType, ...Object.keys(kindEntry.variants || {})].join(", ");
    throw new Error(
      `${record.kind} declares no ${record.recordType} record type; it declares ${known}`,
    );
  }
  if (!shape.declared) {
    throw new Error(
      `record shape for ${record.kind} ${record.recordType} is undeclared: ${shape.basis}`,
    );
  }
  for (const field of RECORD_ENVELOPE_FIELDS) {
    if (field.required && !fieldPresent(record, field)) {
      throw new Error(`record requires ${field.name}`);
    }
  }
  if (!RECORD_ORIGINS.includes(record.origin)) {
    throw new Error("record origin must be feed or fixture");
  }
  if (!ACCESS_POLICIES.has(record.accessPolicy)) {
    throw new Error("record requires a contract accessPolicy");
  }
  if (record.origin === "fixture") {
    if (record.fixture !== true) {
      throw new Error("a generated record must carry fixture true in the payload");
    }
    if (typeof record.fixtureBasis !== "string" || !record.fixtureBasis.trim()) {
      throw new Error("a generated record must carry fixtureBasis");
    }
  }
  for (const field of shape.fields) {
    if (field.required && !fieldPresent(record, field)) {
      throw new Error(`${shape.recordType} requires ${field.name}`);
    }
    if (field.type === "enum" && fieldPresent(record, field)) {
      if (!field.values.includes(record[field.name])) {
        throw new Error(`${field.name} must be one of ${field.values.join(", ")}`);
      }
    }
    if (field.type === "integer" && fieldPresent(record, field)) {
      if (!Number.isInteger(record[field.name])) {
        throw new Error(`${field.name} must be an integer`);
      }
    }
    if (field.type === "place" && fieldPresent(record, field)) {
      const place = record[field.name];
      if (typeof place.label !== "string" || !place.label.trim()) {
        throw new Error("place requires a label");
      }
      if (!("parcelNodeId" in place)) {
        throw new Error("place must state its parcelNodeId, null included");
      }
      if (place.parcelNodeId === null && (typeof place.parcelBasis !== "string" || !place.parcelBasis.trim())) {
        throw new Error("a place with no parcel states the basis for the absence");
      }
    }
  }
  return true;
}

export function assertAdapterKindShape(kind) {
  if (!kind || typeof kind.id !== "string" || !kind.id) {
    throw new Error("adapter kind requires id");
  }
  if (FORBIDDEN_PRODUCT_STRINGS.includes(kind.id)) {
    throw new Error(`${kind.id} is not a city feed`);
  }
  if (!WRITE_TARGETS.has(kind.writesTo)) {
    throw new Error("writesTo must be spine or files, not a local table");
  }
  if (!ACCESS_POLICIES.has(kind.defaultAccessPolicy)) {
    throw new Error("adapter kind requires a contract accessPolicy");
  }
  return true;
}

export function listAdapterKinds() {
  return ADAPTER_KINDS.map((kind) => {
    assertAdapterKindShape(kind);
    return {
      id: kind.id,
      displayName: kind.displayName,
      writesTo: kind.writesTo,
      defaultAccessPolicy: kind.defaultAccessPolicy,
      notes: kind.notes,
    };
  });
}

export const TEMPLATE_MUNICODE_CALENDAR_GRANT = {
  kind: "municode",
  purpose: "calendar",
  writesTo: "files",
  accessPolicy: "public-free",
  writesToOverrideReason:
    "L26 holds the atoms slot; catalog municode defaults to spine",
  sourceUrl: "https://bastrop-tx.municodemeetings.com/",
};

/**
 * G-116. cityKey is the pack this URL is being evaluated FOR, not a label on
 * the URL itself. The Bastrop clerk host is held (refused) on every pack
 * except the one real, ratified Bastrop pack (`bastrop_tx`,
 * `_decisions/2026-09-03_bastrop_tx_dashboards_pack_ratified.md`) -- the
 * G-74 finding this function exists for (real Bastrop government data
 * landing on the public demo pack) stays fully closed for template-city,
 * fixture-city, empty-city, and any future pack that isn't bastrop_tx.
 * Omitting cityKey defaults to held, matching every call site's behaviour
 * before this change -- "refuse rather than guess" when identity is unknown.
 */
export function isIdentityHeldClerkHost(sourceUrl, cityKey) {
  const raw = String(sourceUrl || "").trim();
  let isClerkHost;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    isClerkHost = host === "bastrop-tx.municodemeetings.com" || host.includes("bastrop");
  } catch {
    isClerkHost = /bastrop/i.test(raw);
  }
  if (!isClerkHost) return false;
  return cityKey !== "bastrop_tx";
}

export function adapterKindById(id) {
  return ADAPTER_KINDS.find((kind) => kind.id === id) || null;
}

export function assertPublicFeedSourceUrl(sourceUrl, cityKey) {
  const raw = String(sourceUrl || "").trim();
  if (!raw) throw new Error("grant requires sourceUrl");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("grant sourceUrl must be an absolute URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("grant sourceUrl must be https");
  }
  const host = parsed.hostname.toLowerCase();
  const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
  if (host === "smartcityos.io" || host.endsWith(".smartcityos.io")) {
    throw new Error("refusing smartcityos.io calendar host");
  }
  if (isIdentityHeldClerkHost(parsed.href, cityKey)) {
    throw new Error(`refusing Bastrop clerk host on ${cityKey || "an unidentified pack"}`);
  }
  if (path.includes("/api/calendar/")) {
    throw new Error("refusing city /api/calendar/ path");
  }
  return true;
}

export function assertGrantedAdapterShape(grant, cityKey) {
  if (!grant || typeof grant !== "object") {
    throw new Error("grant requires an object");
  }
  if (FORBIDDEN_PRODUCT_STRINGS.includes(grant.kind)) {
    throw new Error(`${grant.kind} is not a city feed`);
  }
  const kind = adapterKindById(grant.kind);
  if (!kind) throw new Error("grant kind must be a catalogued adapter");
  if (grant.purpose !== "calendar" && grant.kind === "municode" && grant.writesTo === "files") {
    throw new Error("municode files grant on this card is calendar only");
  }
  if (typeof grant.purpose !== "string" || !grant.purpose.trim()) {
    throw new Error("grant requires purpose");
  }
  if (!WRITE_TARGETS.has(grant.writesTo)) {
    throw new Error("writesTo must be spine or files, not a local table");
  }
  if (!ACCESS_POLICIES.has(grant.accessPolicy)) {
    throw new Error("grant requires a contract accessPolicy");
  }
  if (grant.writesTo !== kind.writesTo) {
    if (typeof grant.writesToOverrideReason !== "string" || !grant.writesToOverrideReason.trim()) {
      throw new Error("writesTo override requires a named reason");
    }
  }
  assertPublicFeedSourceUrl(grant.sourceUrl, cityKey);
  return true;
}

export function calendarGrantFor(pack) {
  const grants = Array.isArray(pack?.grantedAdapters) ? pack.grantedAdapters : [];
  return (
    grants.find((g) => g && g.kind === "municode" && g.purpose === "calendar") || null
  );
}
