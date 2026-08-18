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
  it("catalogues the seven named kinds with writesTo and accessPolicy", () => {
    const kinds = listAdapterKinds();
    assert.deepEqual(
      kinds.map((k) => k.id),
      ["mygov", "samsara", "opengov", "esri", "municode", "firstdue", "verkada"],
    );
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
