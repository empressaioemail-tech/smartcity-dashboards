import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  listCityPacks,
  getCityPack,
  assertCityPackShape,
  getPacksStore,
  TEMPLATE_CITY,
} from "./city-pack.mjs";

describe("city packs", () => {
  it("ships a template city pack, not Bastrop and not a repo", async () => {
    assert.equal(getPacksStore({}), "memory");
    const listed = await listCityPacks({});
    assert.equal(listed.length, 1);
    assert.equal(listed[0].cityKey, "template-city");
    const pack = await getCityPack("template-city", {});
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

  it("reads packs from a Neon-shaped store without a live DSN when query is injected", async () => {
    const neonEnv = {
      DATABASE_URL:
        "postgres://u:p@ep-example-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require",
    };
    assert.equal(getPacksStore(neonEnv), "neon");
    const rows = [];
    const query = async (sql, params = []) => {
      if (/CREATE TABLE IF NOT EXISTS city_packs/i.test(sql)) {
        assert.equal(/repo/i.test(sql), false);
        return { rows: [] };
      }
      if (/INSERT INTO city_packs/i.test(sql)) {
        rows.splice(0, rows.length, {
          city_key: params[0],
          jurisdiction_fips: params[1],
          display_name: params[2],
          lenses: JSON.parse(params[3]),
          granted_adapters: JSON.parse(params[4]),
          notes: params[5],
        });
        return { rows: [] };
      }
      if (/FROM city_packs/i.test(sql) && /city_key = \$1/.test(sql)) {
        return { rows: rows.filter((r) => r.city_key === params[0]) };
      }
      if (/FROM city_packs/i.test(sql)) {
        return { rows };
      }
      throw new Error(`unexpected sql ${sql}`);
    };
    const listed = await listCityPacks(neonEnv, { query });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].cityKey, TEMPLATE_CITY.cityKey);
    const pack = await getCityPack("template-city", neonEnv, { query });
    assert.equal(pack.displayName, TEMPLATE_CITY.displayName);
    assert.equal("repo" in pack, false);
    assertCityPackShape(pack);
  });

  it("refuses a supplier DSN before any pack read", async () => {
    await assert.rejects(
      () =>
        listCityPacks({
          DATABASE_URL: "postgres://u:p@ep-x.tiny-art-63602898.aws.neon.tech/neondb",
        }),
      /refusing supplier or city DSN/,
    );
  });
});
