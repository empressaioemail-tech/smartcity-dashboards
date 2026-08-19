import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTER_KINDS,
  assertAdapterKindShape,
  assertGrantedAdapterShape,
  assertPublicFeedSourceUrl,
  listAdapterKinds,
} from "./adapters.mjs";
import { FIXTURE_CITY, TEMPLATE_CITY } from "./city-pack.mjs";
import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";

describe("adapter kinds", () => {
  it("catalogues the ten named kinds with writesTo and accessPolicy", () => {
    /**
     * RE-SCOPED AT G-91, 7 to 10. Live Bastrop integrates spireon, goto and
     * powerbi and the catalog did not name them, so the nav footer denominator
     * was short against reality and three built regions could only read as "not
     * built". The list stays EXPLICIT rather than becoming a length check: a
     * count assertion would let an eleventh kind arrive unnoticed, and the
     * denominator of a customer-facing ratio is not a number that should be able
     * to move quietly.
     *
     * It is 10 and not the 11 the brief expected. The eleventh live vendor family
     * is Anthropic, which the G-18 register dispositions as chrome only and
     * explicitly not a city feed; a kind that writes no record is not an adapter.
     */
    const kinds = listAdapterKinds();
    assert.deepEqual(
      kinds.map((k) => k.id),
      [
        "mygov",
        "samsara",
        "opengov",
        "esri",
        "municode",
        "firstdue",
        "verkada",
        "spireon",
        "goto",
        "powerbi",
      ],
    );
    assert.equal(kinds.length, 10);
    for (const kind of kinds) {
      assertAdapterKindShape(kind);
      assert.ok(kind.writesTo === "spine" || kind.writesTo === "files");
      assert.equal(kind.defaultAccessPolicy, "tenant-private");
    }
    const samsara = kinds.find((k) => k.id === "samsara");
    assert.equal(samsara.writesTo, "files");
  });

  it("refuses a CRM id and a local table as the write target", () => {
    assert.equal(
      ADAPTER_KINDS.some((k) => FORBIDDEN_PRODUCT_STRINGS.includes(k.id)),
      false,
    );
    assert.throws(
      () =>
        assertAdapterKindShape({
          id: "pipedrive",
          writesTo: "spine",
          defaultAccessPolicy: "tenant-private",
        }),
      /not a city feed/,
    );
    assert.throws(
      () =>
        assertAdapterKindShape({
          id: "mygov",
          writesTo: "mygov_permits",
          defaultAccessPolicy: "tenant-private",
        }),
      /spine or files/,
    );
  });

  it("holds the municode calendar grant off template-city and refuses a Bastrop clerk host", () => {
    const municode = listAdapterKinds().find((k) => k.id === "municode");
    assert.equal(municode.writesTo, "spine");
    assert.deepEqual(TEMPLATE_CITY.grantedAdapters, []);
    assert.throws(
      () => assertPublicFeedSourceUrl("https://bastrop-tx.municodemeetings.com/"),
      /Bastrop clerk host/,
    );
    assert.deepEqual(FIXTURE_CITY.grantedAdapters, []);
    assert.throws(
      () =>
        assertGrantedAdapterShape({
          kind: "pipedrive",
          purpose: "calendar",
          writesTo: "files",
          accessPolicy: "public-free",
          sourceUrl: "https://bastrop-tx.municodemeetings.com/",
        }),
      /not a city feed/,
    );
  });
});
