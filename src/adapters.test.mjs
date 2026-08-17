import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTER_KINDS,
  assertAdapterKindShape,
  listAdapterKinds,
} from "./adapters.mjs";
import { TEMPLATE_CITY } from "./city-pack.mjs";
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

  it("does not treat a catalogued kind as a city grant", () => {
    assert.deepEqual(TEMPLATE_CITY.grantedAdapters, []);
    assert.equal(listAdapterKinds().length > 0, true);
  });
});
