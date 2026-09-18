import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";
import { PLATFORM_BASE_UNSET_BASIS, PLATFORM_ROUTES, assertPlatformRoute, platformRoute } from "./platform-base.mjs";

/**
 * D-13. A platform grant's provenance is the configured base plus its route,
 * declared here as a ROUTE rather than as a host.
 *
 * WHY AN ACCESSOR AND NOT A STRING. The dispatch's rule is that `sourceUrl` is
 * provenance and must name the host actually read. A literal cannot do that any
 * more, because the host is a deployment decision that moves; a getter resolves
 * against the current base every time it is read, so it cannot go stale the way
 * a value captured at module load would. It is non-enumerable on purpose:
 * `JSON.stringify` would otherwise freeze today's host into the packs store's
 * JSONB, and the grant read back from that row would then name a host the feed
 * is no longer reading -- the exact failure this field exists to prevent. What
 * round-trips is `platformRoute`; provenance is re-derived from it.
 *
 * With no base configured the accessor returns the refusal basis, so a consumer
 * that prints it prints WHY there is no host rather than an empty string.
 */
function withPlatformProvenance(grant) {
  Object.defineProperty(grant, "sourceUrl", {
    enumerable: false,
    configurable: true,
    get() {
      return platformRoute(grant.platformRoute) ?? PLATFORM_BASE_UNSET_BASIS;
    },
  });
  return grant;
}

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
granted adapter's real records are the same shape IN THE FIELDS THE READ CAN
SUPPLY -- see THE LIVE ARM below, which is where that sentence used to stop and
had to be corrected rather than left to read as a guarantee.

A kind with no declared shape says so with a basis. An undeclared shape is a
positive determination, never a blank.
*/

/* ------------------------------------------------------------------ THE LIVE ARM

G-153 PARCEL 2. THE PREAMBLE ABOVE USED TO SAY, WITHOUT QUALIFICATION, THAT A
GENERATED FIXTURE AND A GRANTED ADAPTER'S REAL RECORD ARE THE SAME SHAPE, "which
is what makes swapping a real city in a pack switch instead of a surface change".

MEASURED 2026-09-18 on the 102 live records the deployed product serves (75
Samsara fleet-vehicle, 27 Spireon patrol-vehicle), judged by
`recordShapeFaults` itself: the sentence is FALSE for both vehicle kinds, and it
was false in three DIFFERENT ways. Three fields differ between the two arms, and
one mechanism does not cover three different reasons, so each is declared where
it belongs rather than papered over with one flag.

  - `status` IS THE VENDOR'S OWN STATE, NOT THIS PRODUCT'S BAND. The declared
    enum is this product's invented readiness vocabulary, drawn from by the
    fixture generator (`FLEET_FIXTURE_PLAN`, `PATROL_FIXTURE_PLAN`) and by
    nothing on the live path. The reads carry a motion or engine state -- Samsara
    `engineStates`, Spireon NSpire `Stopped`/`Idle`/`Moving` -- and no value of
    either is a readiness band: a moving vehicle can be a vehicle in a road test
    and a parked one is not thereby out of service. `LIVE_STATUS_TRANSLATIONS`
    below is the declared, EMPTY table of vendor state -> product band, so the
    guard now REFUSES a live record that asserts one of the four bands instead of
    quietly accepting a fabrication. The lookup is a table rather than a rule so
    that the day a justification exists it is added in one place, in the open.

  - `operatorRef` IS NOT IN THE READ AT ALL. Required by the fixture arm, absent
    on 102 of 102 live rows. `liveDeclaredAbsence` below makes the live arm accept
    an EXPLICIT absence that states its reason and still refuse a bare one, which
    is strictly more than `required: true` checked: the old clause could not tell
    "the read does not carry it" from "the mapper forgot", and both read as the
    same fault.

  - `odometerBand` IS IN THE READ, ONE STEP EARLIER. The raw reading
    (`odometerMiles`) arrives on 72 of the 75 fleet rows and the band is a bucket
    of it, so this field is neither over-declared nor missing upstream: the
    mapping was never done. It stays `required: true` with NO declared-absence
    escape, which is the point -- a row whose reading did not arrive is still
    refused and still says which field it was refused on. Only `operatorRef` gets
    the escape, and only because no further reading of this route can produce it.

WHAT THIS DOES NOT DO. It does not widen the enum, it does not add a band member
for a vendor word, and it does not let a live record omit a field without saying
why. Every direction this file could have taken to make the 102 rows pass by
loosening the guard was refused; what changed is the DECLARATION, deliberately,
with the payload evidence in the close.
*/

/**
 * THE DECLARED TABLE OF VENDOR STATE -> THIS PRODUCT'S READINESS BAND.
 *
 * Empty for both vehicle kinds, and it is empty as a FINDING rather than as a
 * placeholder. Read at source on 2026-09-18: Samsara's `engineStates` stat
 * (`smartcity-os server/routes/samsara.ts:1213`) and Spireon's NSpire `status`
 * (`server/routes/spireon.ts:176-177`) report engine and motion state; the v1
 * page's own `mapStatus` turns those into `active`/`idle`/`off-duty`
 * (`spireon.ts:159-165`), which is an ACTIVITY vocabulary, not a readiness one.
 * Nothing in either read is a statement about whether a vehicle can be put to
 * work today, so there is no row to write and inventing one would put this
 * product's words on a vendor's row.
 *
 * The guard reads this table, so "no mapping is justified" is enforced rather
 * than merely asserted in prose: a live record carrying a band that has no row
 * here is refused BY NAME.
 */
export const LIVE_STATUS_TRANSLATIONS = {
  samsara: {},
  spireon: {},
};

/**
 * THE REASON NO ROW EXISTS, quoted into every refusal so the fault explains
 * itself on the surface rather than only in this file.
 */
export const LIVE_STATUS_TRANSLATION_BASIS =
  "no value in this read is a readiness band: the vendor reports engine or motion state, which cannot answer whether the vehicle can be put to work today";

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
        /**
         * THE LIVE ARM (see THE LIVE ARM above). On a `feed` record the value is
         * the VENDOR'S OWN state, verbatim, and the band enum above does not
         * apply: no row of LIVE_STATUS_TRANSLATIONS.samsara maps a Samsara value
         * onto a band, so a feed record asserting one is refused by name.
         *
         * `notAState` is the token the mapper used to INVENT when the read
         * carried nothing (`String(row.stats?.engineState || "unknown")`); the
         * deployed build served it on 75 of 75 live fleet rows on 2026-09-18.
         * It is a fallback wearing a state's clothes, so carrying it is a fault:
         * the read reported no state and the record says so instead of naming
         * one.
         */
        live: {
          kind: "vendor-state",
          notAState: ["unknown", "Unknown"],
          basisField: "statusBasis",
          translations: LIVE_STATUS_TRANSLATIONS.samsara,
        },
        liveDeclaredAbsence: {
          basisField: "statusBasis",
          why: "the read reports no engine state for this vehicle: the route sets stats.engineState only when the vendor's stats batch carries a value (smartcity-os server/routes/samsara.ts:1213-1214, `if (rawStats.engineStates?.value)`), the deployed product served this mapper's own fallback token on 75 of 75 fleet rows read on 2026-09-18, and the same stats batch populated odometerMiles on 72 of those 75 -- so there is no state to carry and the absence is stated rather than named",
        },
      },
      {
        name: "statusBasis",
        type: "text",
        required: false,
        basis:
          "the other half of status's liveDeclaredAbsence: present and non-empty exactly when status is absent, null when a state was carried. Declared so the shape reads complete rather than naming a basis field it never declares -- the guard reaches it through status's own clause.",
      },
      {
        name: "operatorRef",
        type: "text",
        required: true,
        liveDeclaredAbsence: {
          basisField: "operatorBasis",
          why: "the platform route does not bulk-fetch driver assignment (smartcity-os server/routes/samsara.ts:1133-1137: it is per-vehicle on this vendor and not bulk-fetchable in one call, so it is not included), so the read carries no operator identity to pseudonymise and no FL-OPR-nn can be minted from it",
        },
      },
      {
        name: "operatorBasis",
        type: "text",
        required: false,
        basis:
          "the other half of operatorRef's liveDeclaredAbsence: present and non-empty exactly when operatorRef is absent, null when a reference was minted. Declared for the same reason as statusBasis above.",
      },
      {
        name: "odometerBand",
        type: "text",
        required: true,
        /** No declared-absence escape, deliberately: the reading IS in the read. */
      },
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
        /**
         * The live arm for Spireon. Unlike Samsara this read DOES report states
         * (Stopped 20 / Idle 3 / Moving 2 of 27 on 2026-09-18) and they are
         * carried verbatim; `Unknown` is the route's own default
         * (`spireon.ts:177`, `asset.status || "Unknown"`), so it is a
         * not-a-state token here too and is refused as a state.
         */
        live: {
          kind: "vendor-state",
          notAState: ["unknown", "Unknown"],
          basisField: "statusBasis",
          translations: LIVE_STATUS_TRANSLATIONS.spireon,
        },
        liveDeclaredAbsence: {
          basisField: "statusBasis",
          why: "the route reports no NSpire status for this vehicle and its own fallback word is a not-a-state token, so nothing was reported and the record says so",
        },
      },
      {
        name: "statusBasis",
        type: "text",
        required: false,
        basis:
          "the other half of status's liveDeclaredAbsence: present and non-empty exactly when status is absent, null when the vendor's own state was carried. Declared so the shape reads complete rather than naming a basis field it never declares.",
      },
      {
        name: "operatorRef",
        type: "text",
        required: true,
        liveDeclaredAbsence: {
          basisField: "operatorBasis",
          why: "the live read carries no operator identity to pseudonymise: the route that builds these rows hardcodes the field to an empty string (smartcity-os server/routes/spireon.ts:182, `officer: \"\"`), and PV-OPR-nn is a pseudonym for a person, so a reference derived from the patrol unit would name a vehicle in the column that groups people",
        },
      },
      {
        name: "operatorBasis",
        type: "text",
        required: false,
        basis:
          "the other half of operatorRef's liveDeclaredAbsence: present and non-empty exactly when operatorRef is absent, null when a reference was minted. Declared for the same reason as statusBasis above.",
      },
    ],
  },
  /**
   * G-159. THE BUDGET RECORD, DECLARED AGAINST THE LIVE RECORD AND NOT A FIXTURE.
   *
   * `declared: false` here used to read "budget record shape is not declared on
   * G-91", and the finance lens could not map a granted OpenGov feed onto a cell
   * because of it -- the adopter of this shape was named, the shape was not.
   *
   * The fields below are read off authenticated reads of the real vendor made on
   * 2026-09-18 and filed verbatim as CP1
   * (`_inbox/2026-09-18_g159-finance-bridge_cp1.json`): a JSON:API budget list at
   * `api.bnp.opengov.com/api/v1/budgets?filter[entityId]=<bastrop>` (12 records,
   * attributes name/entityId/coaId/budgetPeriods/workforceId/createdAt/
   * updatedAt) and `/budgets/130231/amounts-summary` (expenses and revenues, each
   * baseAmount/adjustmentAmount/proposedAmount). The names here are the field
   * names of the v1 platform route that serves them
   * (`/api/platform/opengov/budgets`, `.../budgets/:id/amounts-summary`), so the
   * record a future grant maps and the route it reads cannot drift apart
   * silently.
   *
   * EVERY AMOUNT IS WHOLE DOLLARS, AND A FRACTIONAL ONE IS REFUSED RATHER THAN
   * ROUNDED. The live record returns integral JSON numbers (74349204.0). Rounding
   * a ledger figure to fit a type is how a reading stops being a reading, so a
   * fractional amount fails this shape and the caller must handle that rather
   * than this table rounding it away.
   *
   * TWO FIELDS THIS SHAPE NAMES AND REFUSES TO CARRY, both with their basis
   * below, because both are fields a reader of a budget row would expect and the
   * live record does not publish them as fields. Neither is parsed out of
   * display text and neither is derived here; the amounts-summary carries the
   * parts and the consumer derives.
   */
  opengov: {
    declared: true,
    recordType: "budget",
    writesTo: "files",
    /**
     * FEED-ONLY, and G-159 is the first shape in this table that needed the
     * distinction stated. Every other declared shape belongs to a registered
     * domain that GENERATES records for a fixture pack, and
     * src/fixtures.test.mjs holds the registry and this table to each other in
     * both directions. A budget record has no generating domain ON PURPOSE: a
     * domain that invented appropriations for `template-city` would put money
     * beside a city name that never appropriated it, which is the defect class
     * the finance lens exists to refuse. So this shape is reachable from a real
     * grant only, and the divergence test carries a feed arm so the rule still
     * catches a shape declared for nobody at all.
     */
    feedOnly: true,
    feedSource:
      "smartcity-os /api/platform/opengov/budgets + /api/platform/opengov/budgets/:budgetId/amounts-summary, behind requirePlatformInternalKey",
    /**
     * A budget is a static appropriation document, not a thing with an in-flight
     * state, so this shape declares no status vocabulary -- the same stance
     * `goto` takes, for the same reason.
     */
    statusValues: null,
    statusValuesBasis:
      "a budget record is an adopted appropriation and has no in-flight status to report; inventing a lifecycle band for one would put a severity on a document that carries none",
    fields: [
      {
        name: "name",
        type: "text",
        required: true,
        basis: "the vendor's own budget name, e.g. 'FY2026 Operating Budget' -- the city's label, never one this product composed",
      },
      {
        name: "entityId",
        type: "text",
        required: true,
        basis: "the OpenGov entity the budget belongs to; every one of the 12 live records carries Bastrop's entity id, which is what makes this feed Bastrop's",
      },
      {
        name: "coaId",
        type: "text",
        required: true,
        basis: "the chart of accounts the budget's account numbers are drawn from; the live budget points at the 5-segment COA (Funds/Departments/Project/Division/Object)",
      },
      { name: "expensesBaseAmount", type: "integer", required: true },
      { name: "expensesAdjustmentAmount", type: "integer", required: true },
      { name: "expensesProposedAmount", type: "integer", required: true },
      { name: "revenuesBaseAmount", type: "integer", required: true },
      { name: "revenuesAdjustmentAmount", type: "integer", required: true },
      { name: "revenuesProposedAmount", type: "integer", required: true },
      {
        name: "fiscalYear",
        type: "integer",
        required: false,
        basis:
          "the live budget record publishes no numeric fiscal year: the year appears only inside the budget NAME text ('FY2027 Operating Budget (WORKING)') and as a numeric field on the separate budget-amounts resource. A mapped record therefore carries none rather than parsing a year out of a display name and presenting a guess as a field",
      },
      {
        name: "netPosition",
        type: "integer",
        required: false,
        basis:
          "derivable as revenuesProposedAmount minus expensesProposedAmount (the operator capture's $5.0M), and deliberately not carried: the bridge publishes it under `derived` with its own 'never consumed as measured' note, and a mapped record leaves it absent rather than promoting a derived number into a column that reads like a reading",
      },
    ],
  },
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
 * EVERY way a record fails its declared shape, in declaration order; an empty
 * array means it conforms.
 *
 * This exists because the live path needs to report WHICH fields a real vendor
 * record missed rather than only the first one. `assertRecordShape` names the
 * first fault and stops, which is right for a generator that must not emit a
 * record and wrong for a read of somebody else's data where the caller has to be
 * able to say what arrived. The rule itself is written ONCE, here, and
 * `assertRecordShape` is a thin thrower over it -- a second copy of the checks
 * written for the live path would be a second implementation of one contract,
 * which is how the contract and the guard drift apart.
 */
export function recordShapeFaults(record) {
  const faults = [];
  if (!record || typeof record !== "object") return ["record requires an object"];
  const kindEntry = RECORD_SHAPES[record.kind];
  if (!kindEntry) return [`no record shape declared for kind ${record.kind}`];
  if (!kindEntry.declared) {
    return [`record shape for ${record.kind} is undeclared: ${kindEntry.basis}`];
  }
  const shape = recordShapeFor(record.kind, record.recordType);
  if (!shape) {
    const known = [kindEntry.recordType, ...Object.keys(kindEntry.variants || {})].join(", ");
    return [`${record.kind} declares no ${record.recordType} record type; it declares ${known}`];
  }
  if (!shape.declared) {
    return [`record shape for ${record.kind} ${record.recordType} is undeclared: ${shape.basis}`];
  }
  for (const field of RECORD_ENVELOPE_FIELDS) {
    if (field.required && !fieldPresent(record, field)) {
      faults.push(`record requires ${field.name}`);
    }
  }
  if (!RECORD_ORIGINS.includes(record.origin)) {
    faults.push("record origin must be feed or fixture");
  }
  if (!ACCESS_POLICIES.has(record.accessPolicy)) {
    faults.push("record requires a contract accessPolicy");
  }
  if (record.origin === "fixture") {
    if (record.fixture !== true) {
      faults.push("a generated record must carry fixture true in the payload");
    }
    if (typeof record.fixtureBasis !== "string" || !record.fixtureBasis.trim()) {
      faults.push("a generated record must carry fixtureBasis");
    }
  }
  for (const field of shape.fields) {
    const present = fieldPresent(record, field);
    if (field.required && !present) {
      /**
       * THE DECLARED ABSENCE, AND WHY IT IS NOT A LOOSENING (G-153 parcel 2).
       *
       * `required: true` alone cannot tell "the read does not carry this field"
       * from "the mapper forgot it", so on the live path it produced one
       * indistinguishable fault for both and no way to record the honest case.
       * Where a shape declares `liveDeclaredAbsence`, a FEED record may omit the
       * field ONLY by carrying `<basisField>` as a non-empty string; a fixture
       * record may never omit it, and a feed record with a bare null is refused
       * with a fault that says which of the two it is. That is one more refusal
       * than the old clause produced, not one fewer.
       */
      const absence = field.liveDeclaredAbsence;
      const basis = absence ? record[absence.basisField] : null;
      const declaredAbsence =
        record.origin === "feed" &&
        absence &&
        typeof basis === "string" &&
        Boolean(basis.trim());
      if (!declaredAbsence) {
        faults.push(
          absence
            ? `${shape.recordType} requires ${field.name}, or ${absence.basisField} stating why this read does not carry it`
            : `${shape.recordType} requires ${field.name}`,
        );
      }
    }
    if (field.type === "enum" && present) {
      const live = record.origin === "feed" ? field.live : null;
      if (!live) {
        if (!field.values.includes(record[field.name])) {
          faults.push(`${field.name} must be one of ${field.values.join(", ")}`);
        }
      } else {
        const value = record[field.name];
        if (live.notAState.includes(value)) {
          /**
           * A NOT-A-STATE TOKEN IS THE ABSENCE OF A STATE, and carrying it as one
           * is the fabricated-value defect: the reader sees a state word where
           * the vendor reported nothing. It must be a declared absence instead.
           */
          faults.push(
            `${field.name} carries ${JSON.stringify(value)}, which is the absence of a vendor state rather than one; omit ${field.name} and state ${live.basisField}, or carry the vendor's own reported value`,
          );
        } else if (
          field.values.includes(value) &&
          !Object.prototype.hasOwnProperty.call(live.translations, value)
        ) {
          faults.push(
            `${field.name} asserts the product band ${JSON.stringify(value)} on a live ${shape.recordType} with no declared translation: ${LIVE_STATUS_TRANSLATION_BASIS}`,
          );
        }
      }
    }
    if (field.type === "integer" && fieldPresent(record, field)) {
      if (!Number.isInteger(record[field.name])) {
        faults.push(`${field.name} must be an integer`);
      }
    }
    if (field.type === "place" && fieldPresent(record, field)) {
      const place = record[field.name];
      if (typeof place.label !== "string" || !place.label.trim()) {
        faults.push("place requires a label");
      }
      if (!("parcelNodeId" in place)) {
        faults.push("place must state its parcelNodeId, null included");
      }
      if (place.parcelNodeId === null && (typeof place.parcelBasis !== "string" || !place.parcelBasis.trim())) {
        faults.push("a place with no parcel states the basis for the absence");
      }
    }
  }
  return faults;
}

/**
 * Validates a record against the declared shape for its kind. The generator runs
 * this over everything it emits, so a fixture that drifts from the contract
 * fails at the source rather than on a surface.
 *
 * The FIRST fault is thrown, which keeps every existing caller's message and
 * order unchanged; a caller that needs the whole list asks `recordShapeFaults`
 * instead. Same rule, two readings.
 */
export function assertRecordShape(record) {
  const faults = recordShapeFaults(record);
  if (faults.length) throw new Error(faults[0]);
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
 * G-116 Phase 2. The first real feed for a mygov-gated region. writesTo
 * "spine" matches the catalog's own declared shape for this kind
 * (ADAPTER_KINDS above); this grant does not literally write anywhere --
 * it is a live server-to-server read-through, verified live against a real
 * bastrop_tx read (25 real Bastrop permits, 2026-09-03) -- so the field
 * describes the record's conceptual home, not this grant's own mechanism.
 * accessPolicy tenant-private matches mygov's defaultAccessPolicy (real
 * permit records are not public-free the way a municode meeting calendar
 * is). The route is smartcity-os's platform-internal endpoint
 * (`_decisions/2026-09-03_smartcity_os_platform_read_authorization.md`),
 * gated there by PLATFORM_INTERNAL_API_KEY -- this grant object carries no
 * key itself; src/mygov-permits.mjs reads that from its own env at request
 * time, the same separation of "where" from "how authenticated" every
 * other feed in this file already uses.
 *
 * D-13.1: `sourceUrl` used to be a literal naming the GCP host directly, so
 * this grant was the fourth place a cutover had to be made by hand. It now
 * declares the route; the host comes from the one configured base.
 */
export const PLATFORM_MYGOV_PERMITS_GRANT = withPlatformProvenance({
  kind: "mygov",
  purpose: "permits",
  writesTo: "spine",
  accessPolicy: "tenant-private",
  platformRoute: PLATFORM_ROUTES.mygovPermits,
});

/**
 * G-116 Phase 2, third batch. Five more real grants, one per kind (unlike
 * mygov's kind-level grouping across five domains, each of these gates
 * exactly one domain: samsara->fleet-vehicles, spireon->patrol-vehicles,
 * firstdue->fire-apparatus, powerbi->cip-projects, goto->call-analytics).
 * writesTo matches each kind's own catalog declaration (ADAPTER_KINDS
 * above); none of these literally write anywhere, same "conceptual home,
 * not this grant's mechanism" note as the permits grant.
 *
 * FirstDue and GoTo are granted here even though live-verified 2026-09-03
 * to be genuinely unavailable right now (FirstDue: real 403, apparatus/
 * assets API scope not granted to the current credential -- contact
 * dashboards@firstarriving.com; GoTo: OAuth consent never completed, a
 * human action via GET /api/goto/authorize on smartcity-os). The grant
 * describes what smartcity-dashboards is entitled to read, not whether
 * the read currently succeeds -- vendor-side availability is the source
 * route's own honest status field to report each time it's actually
 * called, not something to gate the grant itself on.
 */
export const PLATFORM_SAMSARA_FLEET_GRANT = withPlatformProvenance({
  kind: "samsara",
  purpose: "fleet-vehicles",
  writesTo: "files",
  accessPolicy: "tenant-private",
  platformRoute: PLATFORM_ROUTES.samsaraVehicles,
});

export const PLATFORM_SPIREON_PATROL_GRANT = withPlatformProvenance({
  kind: "spireon",
  purpose: "patrol-vehicles",
  writesTo: "files",
  accessPolicy: "tenant-private",
  platformRoute: PLATFORM_ROUTES.spireonVehicles,
});

export const PLATFORM_FIRSTDUE_APPARATUS_GRANT = withPlatformProvenance({
  kind: "firstdue",
  purpose: "fire-apparatus",
  writesTo: "files",
  accessPolicy: "tenant-private",
  platformRoute: PLATFORM_ROUTES.firstdueApparatus,
});

export const PLATFORM_POWERBI_CIP_GRANT = withPlatformProvenance({
  kind: "powerbi",
  purpose: "cip-projects",
  writesTo: "files",
  accessPolicy: "tenant-private",
  platformRoute: PLATFORM_ROUTES.powerbiCipProjects,
});

export const PLATFORM_GOTO_CALLS_GRANT = withPlatformProvenance({
  kind: "goto",
  purpose: "call-analytics",
  writesTo: "files",
  accessPolicy: "tenant-private",
  platformRoute: PLATFORM_ROUTES.gotoCallSummary,
});

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
  /**
   * D-13.1. A grant names its source one of two ways, and both are checked:
   *
   *  - `platformRoute`, for a read that goes through this product's own v1
   *    platform on whatever base is configured. Checked against the declared
   *    route list, and against being a path -- see assertPlatformRoute.
   *  - `sourceUrl`, for a real third-party public host (municode's clerk
   *    calendar, the one grant that still carries a literal). Checked as
   *    before, host and path rules included.
   *
   * platformRoute wins when both are present, because it is the one that
   * round-trips: a grant read back out of the packs store has no accessor and
   * therefore no sourceUrl to check, and the route it does carry is the whole
   * declaration. Reading the accessor here instead would make an unset base --
   * a fetch-time refusal with a stated basis -- read as a malformed pack.
   */
  if (grant.platformRoute !== undefined) {
    assertPlatformRoute(grant.platformRoute);
  } else {
    assertPublicFeedSourceUrl(grant.sourceUrl, cityKey);
  }
  return true;
}

export function calendarGrantFor(pack) {
  const grants = Array.isArray(pack?.grantedAdapters) ? pack.grantedAdapters : [];
  return (
    grants.find((g) => g && g.kind === "municode" && g.purpose === "calendar") || null
  );
}

export function mygovPermitsGrantFor(pack) {
  const grants = Array.isArray(pack?.grantedAdapters) ? pack.grantedAdapters : [];
  return grants.find((g) => g && g.kind === "mygov" && g.purpose === "permits") || null;
}

/**
 * G-116 second batch. Kind-level, matching how the fixture axis already
 * treats "mygov" -- packFixtureGrants/noFixtureSourceBasis check kind only,
 * so granting mygov once makes every mygov-gated domain (permits,
 * work-orders, inspections, code-violations, business-licenses) generate
 * together, not one grant per domain. The real side follows the same
 * granularity: the platform-internal MyGov key is one credential covering
 * the whole resource family (smartcity-os's own single MyGov login), so
 * any mygov grant on the pack -- today just PLATFORM_MYGOV_PERMITS_GRANT --
 * is sufficient to unlock the other four real reads too. Deliberately does
 * NOT require purpose === "permits": that field still names what the one
 * grant object is FOR (it carries the real sourceUrl for permits
 * specifically), it just isn't the gate for whether mygov as a kind is
 * granted.
 */
export function mygovLiveGrantFor(pack) {
  const grants = Array.isArray(pack?.grantedAdapters) ? pack.grantedAdapters : [];
  return grants.find((g) => g && g.kind === "mygov") || null;
}

/**
 * G-116 Phase 2, third batch. The general form mygovLiveGrantFor is a
 * special case of -- kept as its own named function rather than replaced,
 * since it already shipped and is tested. Any grant matching a kind
 * unlocks that kind's real domain(s); each of samsara/spireon/firstdue/
 * powerbi/goto gates exactly one domain, so this is the whole check.
 */
export function platformGrantForKind(pack, kind) {
  const grants = Array.isArray(pack?.grantedAdapters) ? pack.grantedAdapters : [];
  return grants.find((g) => g && g.kind === kind) || null;
}
