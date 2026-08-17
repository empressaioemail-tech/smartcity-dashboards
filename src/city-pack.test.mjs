import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listCityPacks, getCityPack, assertCityPackShape } from "./city-pack.mjs";

describe("city packs", () => {
  it("ships a template city pack, not Bastrop and not a repo", () => {
    const listed = listCityPacks();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].cityKey, "template-city");
    const pack = getCityPack("template-city");
    assert.ok(pack);
    assert.equal("repo" in pack, false);
    assert.notEqual(pack.cityKey, "bastrop");
    assertCityPackShape(pack);
  });

  it("rejects a pack that claims to be a repo", () => {
    assert.throws(
      () => assertCityPackShape({ cityKey: "x", repo: "some-city", lenses: [], grantedAdapters: [] }),
      /not repos/,
    );
  });
});
