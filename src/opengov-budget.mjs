/* ------------------------------------------------------------ opengov budget

G-159. The DECODE HALF of the OpenGov budget bridge: it turns the record the v1
platform route serves into a record this product's own shape table declares
(`RECORD_SHAPES.opengov`, src/adapters.mjs).

WHY THIS FILE REFUSES INSTEAD OF DEFAULTING, WHICH IS A DIFFERENT STANCE FROM
src/vendor-live.mjs. The mappers beside this one do carry fallbacks -- a missing
vehicle name becomes the visible string "Unnamed unit", a missing telemetry
status becomes "unknown". Those are labels, and a label that says it does not
know is honest on a screen. AN AMOUNT IS NOT A LABEL. `expenses.proposed ?? 0`
does not read as "unknown" anywhere downstream; it reads as a figure, it enters
a sum, and it lands under a MEASURED badge on the finance lens, which is the one
defect that lens was written to refuse. So every required field below either
comes back from the bridge as a real value or this module throws. There is no
`?? 0`, no `|| 0`, and no numeric coercion anywhere in this file, and
src/opengov-budget.test.mjs proves each refusal by violation rather than
asserting that one is possible.

WHAT IT DOES NOT DO YET, ON PURPOSE. Nothing composes this mapper in the product
today, because the grant that would call it is deliberately not added (G-159
STEP 2b): a grant pointing at a route this deployment cannot reach would put a
failing fetch on the product, and the v1 route is unreachable from here until
OPS-25 D-13 and D-14 land. Declaring the shape and proving the decoder is what
makes the grant a one-line addition for whoever lands after those two rows --
which is why the shape is in the contract now and the grant is in the close's
`leave_behind`.
*/

import { assertRecordShape } from "./adapters.mjs";

/** The record type this module maps, and the one declared in RECORD_SHAPES.opengov. */
export const BUDGET_RECORD_TYPE = "budget";

/**
 * A refusal, with the field that caused it named in the error rather than only
 * in the message. A caller deciding what to tell a reader needs to know WHICH
 * part of the budget did not arrive; "invalid record" is not actionable.
 */
function refuse(field, message) {
  const err = new Error(message);
  err.name = "BudgetRecordRefused";
  err.code = "budget_record_refused";
  err.field = field;
  return err;
}

function requireString(source, path, label) {
  const parts = path.split(".");
  let value = source;
  for (const part of parts) {
    if (value === null || typeof value !== "object") value = undefined;
    else value = value[part];
  }
  if (typeof value !== "string" || !value.trim()) {
    throw refuse(
      path,
      `${label} is required and the bridge did not return it (${path} was ${value === undefined ? "absent" : JSON.stringify(value)}); a budget record is refused rather than filled in, because a default here would be a figure or an identity this product invented`,
    );
  }
  return value.trim();
}

/**
 * Whole dollars only. `null` from the bridge is a REFUSAL and not a zero: the
 * bridge itself only writes null where the vendor returned something that is
 * not a finite number, so a null here means the real value is unknown. A
 * fractional value is refused too -- see RECORD_SHAPES.opengov's own note.
 */
function requireInteger(source, path) {
  const parts = path.split(".");
  let value = source;
  for (const part of parts) {
    if (value === null || typeof value !== "object") value = undefined;
    else value = value[part];
  }
  if (value === undefined) {
    throw refuse(path, `${path} is required and the bridge did not return it; refusing rather than defaulting an amount to zero`);
  }
  if (value === null) {
    throw refuse(path, `${path} came back null, meaning the vendor returned no finite number for it; refusing rather than defaulting an amount to zero`);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw refuse(path, `${path} must be a finite number, got ${JSON.stringify(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw refuse(path, `${path} must be whole dollars, got ${value}; rounding a ledger figure to fit a type is not a reading`);
  }
  return value;
}

/**
 * One budget record from the bridge's two reads: the budget itself and its
 * amounts-summary. `cityKey` is a required argument rather than a defaulted one
 * for the same reason: a record stamped with a city nobody passed in is the
 * silent-city-default defect the preamble's rule 3 names.
 */
export function mapRealBudgetRecord({ budget, amountsSummary, cityKey, readAt = new Date().toISOString() } = {}) {
  if (!budget || typeof budget !== "object") throw refuse("budget", "the budget record is required and was not supplied");
  if (!amountsSummary || typeof amountsSummary !== "object") {
    throw refuse("amountsSummary", "the amounts-summary is required and was not supplied; the budget alone carries no figures");
  }
  if (typeof cityKey !== "string" || !cityKey.trim()) {
    throw refuse("cityKey", "cityKey is required; a budget record is never stamped with a pack that was not named");
  }

  const recordId = requireString(budget, "id", "the vendor's budget id");
  const name = requireString(budget, "name", "the budget name");
  const entityId = requireString(budget, "entityId", "the entity id the budget belongs to");
  const coaId = requireString(budget, "coaId", "the chart of accounts the budget's account numbers use");

  const record = {
    recordId,
    kind: "opengov",
    recordType: BUDGET_RECORD_TYPE,
    cityKey,
    origin: "feed",
    accessPolicy: "tenant-private",

    name,
    entityId,
    coaId,

    expensesBaseAmount: requireInteger(amountsSummary, "expenses.base"),
    expensesAdjustmentAmount: requireInteger(amountsSummary, "expenses.adjustment"),
    expensesProposedAmount: requireInteger(amountsSummary, "expenses.proposed"),
    revenuesBaseAmount: requireInteger(amountsSummary, "revenues.base"),
    revenuesAdjustmentAmount: requireInteger(amountsSummary, "revenues.adjustment"),
    revenuesProposedAmount: requireInteger(amountsSummary, "revenues.proposed"),

    provenance: {
      source: "smartcity-os /api/platform/opengov/budgets + /api/platform/opengov/budgets/:budgetId/amounts-summary",
      basis:
        "read live from OpenGov Budgeting & Performance through the v1 platform route; the route's own `source: \"live\"` and `contract` fields name the vendor endpoint each half came from",
      readAt,
      readAtBasis: "read for this request; not generated",
    },
  };

  /**
   * The shape table is the contract and it is the thing that decides, so this
   * decoder does not keep a second copy of the required-field list: it builds
   * the record and hands it to the same validator every other producer uses.
   * A field added to RECORD_SHAPES.opengov is enforced here without an edit,
   * which is the CTRL-1 property (one rule, not two).
   */
  assertRecordShape(record);
  return record;
}
