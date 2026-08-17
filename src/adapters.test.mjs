import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTER_KINDS,
  assertAdapterKindShape,
  assertGrantedAdapterShape,
  listAdapterKinds,
  TEMPLATE_MUNICODE_CALENDAR_GRANT,
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

  it("grants municode calendar onto template-city files and keeps fixture-city empty", () => {
    const municode = listAdapterKinds().find((k) => k.id === "municode");
    assert.equal(municode.writesTo, "spine");
    assertGrantedAdapterShape(TEMPLATE_MUNICODE_CALENDAR_GRANT);
    assert.equal(TEMPLATE_CITY.grantedAdapters.length, 1);
    assert.equal(TEMPLATE_CITY.grantedAdapters[0].kind, "municode");
    assert.equal(TEMPLATE_CITY.grantedAdapters[0].purpose, "calendar");
    assert.equal(TEMPLATE_CITY.grantedAdapters[0].writesTo, "files");
    assert.equal(TEMPLATE_CITY.grantedAdapters[0].accessPolicy, "public-free");
    assert.match(TEMPLATE_CITY.grantedAdapters[0].writesToOverrideReason, /L26/);
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
