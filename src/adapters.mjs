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
  samsara: { declared: false, basis: "fleet ops record shape is not declared on G-77" },
  opengov: { declared: false, basis: "budget record shape is not declared on G-77" },
  esri: { declared: false, basis: "place geometry record shape is not declared on G-77" },
  municode: {
    declared: false,
    basis: "meeting record shape ships in municode-calendar.mjs and is not restated here",
  },
  firstdue: { declared: false, basis: "incident record shape is not declared on G-77" },
  verkada: { declared: false, basis: "camera and door record shape is not declared on G-77" },
};

export function recordShapeFor(kindId) {
  return RECORD_SHAPES[kindId] || null;
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
  const shape = recordShapeFor(record.kind);
  if (!shape) throw new Error(`no record shape declared for kind ${record.kind}`);
  if (!shape.declared) {
    throw new Error(`record shape for ${record.kind} is undeclared: ${shape.basis}`);
  }
  if (record.recordType !== shape.recordType) {
    throw new Error(`record type must be ${shape.recordType}`);
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

export function isIdentityHeldClerkHost(sourceUrl) {
  const raw = String(sourceUrl || "").trim();
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "bastrop-tx.municodemeetings.com" || host.includes("bastrop");
  } catch {
    return /bastrop/i.test(raw);
  }
}

export function adapterKindById(id) {
  return ADAPTER_KINDS.find((kind) => kind.id === id) || null;
}

export function assertPublicFeedSourceUrl(sourceUrl) {
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
  if (isIdentityHeldClerkHost(parsed.href)) {
    throw new Error("refusing Bastrop clerk host on template-city");
  }
  if (path.includes("/api/calendar/")) {
    throw new Error("refusing city /api/calendar/ path");
  }
  return true;
}

export function assertGrantedAdapterShape(grant) {
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
  assertPublicFeedSourceUrl(grant.sourceUrl);
  return true;
}

export function calendarGrantFor(pack) {
  const grants = Array.isArray(pack?.grantedAdapters) ? pack.grantedAdapters : [];
  return (
    grants.find((g) => g && g.kind === "municode" && g.purpose === "calendar") || null
  );
}
