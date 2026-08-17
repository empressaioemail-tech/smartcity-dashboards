import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LEAD_LENSES, listLenses, getLens } from "./lenses.mjs";
import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";

describe("lead lenses", () => {
  it("ships exactly four lead lenses including citizen, not CitizenConnect", () => {
    const ids = LEAD_LENSES.map((l) => l.id);
    assert.deepEqual(ids, [
      "city-manager",
      "development-services",
      "finance",
      "citizen",
    ]);
    assert.equal(LEAD_LENSES[3].skuName, null);
    assert.equal(LEAD_LENSES[3].payments, false);
    assert.equal(getLens("citizen").audience, "resident");
    const listed = listLenses();
    assert.equal(listed.length, 4);
    assert.equal(listed.every((l) => l.payments === false), true);
  });

  it("does not name forbidden product strings in the lens catalog", () => {
    const blob = JSON.stringify(LEAD_LENSES);
    for (const s of FORBIDDEN_PRODUCT_STRINGS) {
      assert.equal(blob.includes(s), false, s);
    }
  });
});
