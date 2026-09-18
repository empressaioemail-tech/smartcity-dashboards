import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RECORD_SHAPES, assertRecordShape, recordShapeFor, declaredRecordShapes } from "./adapters.mjs";
import { mapRealBudgetRecord, BUDGET_RECORD_TYPE } from "./opengov-budget.mjs";

/**
 * THE REAL RECORD, VERBATIM FROM CP1
 * (`_inbox/2026-09-18_g159-finance-bridge_cp1.json`), read live on 2026-09-18.
 *
 * These are the bridge's OWN served fields (the shape of
 * `/api/platform/opengov/budgets` and `.../amounts-summary` after Step 1), not
 * the vendor's raw JSON:API envelope, because that is what the decoder in
 * src/opengov-budget.mjs actually receives. The figures are the live vendor's,
 * and CP1 records that they reproduce the operator capture's page-1/page-2
 * figures at the digit -- expenses $69,579,851 against a captured $69.6M and
 * revenues $74,568,390 against $74.6M.
 *
 * `derived.netPositionProposed` is INCLUDED here on purpose. The bridge does
 * publish it (with its own "never consumed as measured" note), so leaving it in
 * the input is what makes the "the record does not carry it" assertion below a
 * test of the decoder rather than of an input I quietly trimmed.
 */
const LIVE_BUDGET = {
  id: "130231",
  name: "FY2027 Operating Budget (WORKING)",
  entityId: "3c8981ac-1a8b-463d-b26b-5ef37c66734f",
  coaId: "a9996b7f-17a2-4b25-b521-7ba73ba09f61",
  updatedAt: "2026-09-15T23:05:38.814-07:00",
};

const LIVE_AMOUNTS_SUMMARY = {
  ok: true,
  budgetId: "130231",
  expenses: { base: 74349204, adjustment: -4769353, proposed: 69579851 },
  revenues: { base: 73425092, adjustment: 1143298, proposed: 74568390 },
  derived: {
    netPositionProposed: 4988539,
    of: "revenues.proposed - expenses.proposed",
    note: "Not a field OpenGov returns. Published as derived so it is never consumed as measured.",
  },
  actuals: {
    state: "unavailable",
    basis:
      "GET /api/v1/budgets/<id>/actuals-summary and /actual-amounts both answered HTTP 500 on 2026-09-18 (CP1). Actuals are unaccounted at the source, not merely unconsumed.",
  },
  source: "live",
};

const CITY_KEY = "bastrop_tx";

const map = (overrides = {}) =>
  mapRealBudgetRecord({
    budget: LIVE_BUDGET,
    amountsSummary: LIVE_AMOUNTS_SUMMARY,
    cityKey: CITY_KEY,
    readAt: "2026-09-18T12:00:00.000Z",
    ...overrides,
  });

describe("G-159 opengov budget: the declared shape", () => {
  it("declares the kind in the catalog instead of the G-91 basis that blocked the finance lens", () => {
    const shape = RECORD_SHAPES.opengov;
    assert.equal(shape.declared, true);
    assert.equal(shape.recordType, "budget");
    assert.equal(shape.writesTo, "files", "must agree with ADAPTER_KINDS.opengov.writesTo");
    assert.equal(shape.basis, undefined, "a declared shape carries fields, not an undeclared basis");
  });

  it("declares itself feed-only, with the route it is read from, and declares no status vocabulary", () => {
    const shape = RECORD_SHAPES.opengov;
    assert.equal(shape.feedOnly, true);
    assert.match(shape.feedSource, /\/api\/platform\/opengov\/budgets/);
    assert.equal(shape.statusValues, null);
    assert.match(shape.statusValuesBasis, /\S/);
  });

  it("states a basis for the two fields it names and refuses to carry", () => {
    const shape = recordShapeFor("opengov", BUDGET_RECORD_TYPE);
    for (const name of ["fiscalYear", "netPosition"]) {
      const field = shape.fields.find((f) => f.name === name);
      assert.ok(field, `${name} must be a declared field`);
      assert.equal(field.required, false, `${name} is not published by the live record and must not be required`);
      assert.match(field.basis, /\S/, `${name} carries no basis for its absence`);
    }
  });

  it("keeps every amount whole-dollar, so a fractional ledger figure refuses rather than rounds", () => {
    const shape = recordShapeFor("opengov", BUDGET_RECORD_TYPE);
    const amounts = shape.fields.filter((f) => /Amount$/.test(f.name));
    assert.equal(amounts.length, 6);
    for (const f of amounts) assert.equal(f.type, "integer", f.name);
  });
});

describe("G-159 opengov budget: mapping the real record", () => {
  it("maps the live Bastrop budget and its amounts, digit for digit", () => {
    const record = map();
    assert.equal(record.recordId, "130231");
    assert.equal(record.kind, "opengov");
    assert.equal(record.recordType, "budget");
    assert.equal(record.cityKey, "bastrop_tx");
    assert.equal(record.origin, "feed");
    assert.equal(record.accessPolicy, "tenant-private");
    assert.equal(record.name, "FY2027 Operating Budget (WORKING)");
    assert.equal(record.entityId, "3c8981ac-1a8b-463d-b26b-5ef37c66734f");
    assert.equal(record.coaId, "a9996b7f-17a2-4b25-b521-7ba73ba09f61");
    assert.equal(record.expensesBaseAmount, 74349204);
    assert.equal(record.expensesAdjustmentAmount, -4769353);
    assert.equal(record.expensesProposedAmount, 69579851);
    assert.equal(record.revenuesBaseAmount, 73425092);
    assert.equal(record.revenuesAdjustmentAmount, 1143298);
    assert.equal(record.revenuesProposedAmount, 74568390);
  });

  it("maps no figure it was not given and marks nothing as a fixture", () => {
    const record = map();
    assert.equal(record.fixture, undefined, "a feed record carries no fixture mark");
    assert.equal(record.fixtureBasis, undefined);
    assert.equal(Object.values(record).includes(0), false, "no amount was defaulted to zero");
  });

  it("does NOT carry the bridge's derived net position, even though the input carries it", () => {
    /**
     * THE VIOLATION DIRECTION FOR A DERIVED FIGURE. `derived.netPositionProposed`
     * is on the input and is a real, correctly-computed number (4,988,539, the
     * capture's $5.0M). Promoting it onto the record would put a derived value
     * in a column that reads like a reading, which is why the shape's own basis
     * refuses it. This asserts the decoder drops it rather than trusting a
     * comment to.
     */
    const record = map();
    assert.equal(record.netPosition, undefined);
    assert.equal(record.netPositionProposed, undefined);
    assert.equal(LIVE_AMOUNTS_SUMMARY.derived.netPositionProposed, 4988539, "the input really did carry it");
  });

  it("carries no fiscal year rather than parsing one out of the budget's display name", () => {
    const record = map();
    assert.equal(record.fiscalYear, undefined);
    assert.match(record.name, /FY2027/, "the year is in the name text and stays there");
  });

  it("produces a record the product's own contract accepts", () => {
    assert.equal(assertRecordShape(map()), true);
  });

  it("records where each half was read from", () => {
    const record = map();
    assert.match(record.provenance.source, /opengov\/budgets/);
    assert.equal(record.provenance.readAt, "2026-09-18T12:00:00.000Z");
    assert.match(record.provenance.readAtBasis, /\S/);
  });
});

describe("G-159 opengov budget: refusals, proven by violation", () => {
  const cases = [
    ["a missing budget", { budget: undefined }, "budget"],
    ["a missing amounts-summary, because the budget alone carries no figures", { amountsSummary: undefined }, "amountsSummary"],
    ["a missing cityKey, so no record is ever stamped with an unnamed pack", { cityKey: undefined }, "cityKey"],
    ["a blank cityKey", { cityKey: "   " }, "cityKey"],
    ["a budget with no id", { budget: { ...LIVE_BUDGET, id: undefined } }, "id"],
    ["a budget with no name", { budget: { ...LIVE_BUDGET, name: undefined } }, "name"],
    ["a budget whose entity id is absent", { budget: { ...LIVE_BUDGET, entityId: undefined } }, "entityId"],
    ["a budget whose chart of accounts is absent", { budget: { ...LIVE_BUDGET, coaId: undefined } }, "coaId"],
  ];

  for (const [label, overrides, field] of cases) {
    it(`refuses ${label}`, () => {
      assert.throws(
        () => map(overrides),
        (err) => err.code === "budget_record_refused" && err.field === field,
        `expected a refusal naming ${field}`,
      );
    });
  }

  /**
   * THE SIX AMOUNTS, EACH REFUSED THREE WAYS. Ten ways to render a figure and
   * none of them is a default: absent, null (the bridge's own honest "the vendor
   * gave no finite number"), a string, and a fractional number.
   */
  const AMOUNTS = [
    ["expensesBaseAmount", "expenses", "base"],
    ["expensesAdjustmentAmount", "expenses", "adjustment"],
    ["expensesProposedAmount", "expenses", "proposed"],
    ["revenuesBaseAmount", "revenues", "base"],
    ["revenuesAdjustmentAmount", "revenues", "adjustment"],
    ["revenuesProposedAmount", "revenues", "proposed"],
  ];

  for (const [field, side, key] of AMOUNTS) {
    const withAmount = (value) => ({
      amountsSummary: { ...LIVE_AMOUNTS_SUMMARY, [side]: { ...LIVE_AMOUNTS_SUMMARY[side], [key]: value } },
    });

    it(`refuses an absent ${field} rather than defaulting it to zero`, () => {
      assert.throws(
        () => map(withAmount(undefined)),
        (err) => err.code === "budget_record_refused" && err.field === `${side}.${key}` && /zero/.test(err.message),
        `${field}: an absent amount must refuse, and must say why zero was not used`,
      );
    });

    it(`refuses a null ${field}, which is the bridge saying the vendor returned no number`, () => {
      assert.throws(
        () => map(withAmount(null)),
        (err) => err.code === "budget_record_refused" && err.field === `${side}.${key}`,
      );
    });

    it(`refuses a non-numeric ${field}`, () => {
      assert.throws(
        () => map(withAmount("69579851")),
        (err) => err.code === "budget_record_refused" && err.field === `${side}.${key}`,
      );
    });

    it(`refuses a fractional ${field} rather than rounding a ledger figure`, () => {
      assert.throws(
        () => map(withAmount(69579851.5)),
        (err) => err.code === "budget_record_refused" && err.field === `${side}.${key}` && /whole dollars/.test(err.message),
      );
    });
  }

  it("refuses a budget that is not an object at all", () => {
    assert.throws(() => map({ budget: "130231" }), (err) => err.code === "budget_record_refused");
  });

  it("refuses rather than returning a partial record, so a caller cannot read a figure off a refusal", () => {
    let returned;
    try {
      returned = map({ amountsSummary: { ...LIVE_AMOUNTS_SUMMARY, expenses: {} } });
    } catch {
      returned = undefined;
    }
    assert.equal(returned, undefined, "a refused map returns nothing at all, not a record with holes in it");
  });

  it("names the offending field in the error, not only in the message", () => {
    try {
      map({ budget: { ...LIVE_BUDGET, coaId: undefined } });
      assert.fail("expected a refusal");
    } catch (err) {
      assert.equal(err.field, "coaId");
      assert.equal(err.name, "BudgetRecordRefused");
    }
  });
});

describe("G-159 opengov budget: the shape table is the contract, and it fires", () => {
  it("refuses a record whose amount is missing, through assertRecordShape and not only the decoder", () => {
    const good = map();
    const { revenuesProposedAmount, ...withoutAmount } = good;
    assert.equal(revenuesProposedAmount, 74568390);
    assert.throws(() => assertRecordShape(withoutAmount), /requires revenuesProposedAmount/);
  });

  it("refuses a record whose amount is a string, through assertRecordShape", () => {
    assert.throws(() => assertRecordShape({ ...map(), expensesProposedAmount: "69579851" }), /must be an integer/);
  });

  it("refuses a record with no cityKey, through assertRecordShape", () => {
    const record = map();
    assert.throws(() => assertRecordShape({ ...record, cityKey: "" }), /record requires cityKey/);
  });

  it("refuses a record claiming origin fixture without the marks a fixture must carry", () => {
    assert.throws(() => assertRecordShape({ ...map(), origin: "fixture" }), /fixture/);
  });

  it("keeps the budget shape on the declared list now that it is declared", () => {
    assert.ok(
      declaredRecordShapes().some((d) => d.kind === "opengov" && d.recordType === "budget"),
      "a declared shape that declaredRecordShapes() cannot see is a shape nothing else can find",
    );
  });
});
