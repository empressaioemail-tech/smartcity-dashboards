import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  listCityPacks,
  getCityPack,
  assertCityPackShape,
  getPacksStore,
  TEMPLATE_CITY,
  FIXTURE_CITY,
} from "./city-pack.mjs";

describe("city packs", () => {
  it("ships template-city public-free and fixture-city tenant-private, not Bastrop", async () => {
    assert.equal(getPacksStore({}), "memory");
    const listed = await listCityPacks({});
    assert.equal(listed.length, 2);
    const keys = listed.map((p) => p.cityKey).sort();
    assert.deepEqual(keys, ["fixture-city", "template-city"]);
    const template = await getCityPack("template-city", {});
    const fixture = await getCityPack("fixture-city", {});
    assert.equal(template.accessPolicy, "public-free");
    assert.equal(fixture.accessPolicy, "tenant-private");
    assert.deepEqual(template.grantedAdapters, []);
    assert.deepEqual(fixture.grantedAdapters, []);
    assert.notEqual(template.cityKey, "bastrop");
    assert.notEqual(fixture.cityKey, "bastrop");
    assert.equal("repo" in template, false);
    assertCityPackShape(template);
    assertCityPackShape(fixture);
    assert.equal(TEMPLATE_CITY.cityKey, "template-city");
    assert.equal(FIXTURE_CITY.cityKey, "fixture-city");
  });

  it("rejects a pack that claims to be a repo", () => {
    assert.throws(
      () =>
        assertCityPackShape({
          cityKey: "x",
          repo: "some-city",
          accessPolicy: "public-free",
          lenses: [],
          grantedAdapters: [],
        }),
      /not repos/,
    );
  });

  it("rejects a Bastrop pack key", () => {
    assert.throws(
      () =>
        assertCityPackShape({
          cityKey: "bastrop",
          accessPolicy: "tenant-private",
          lenses: [],
          grantedAdapters: [],
        }),
      /Bastrop is not a pack/,
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
      if (/ADD COLUMN IF NOT EXISTS access_policy/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO city_packs/i.test(sql)) {
        const row = {
          city_key: params[0],
          jurisdiction_fips: params[1],
          display_name: params[2],
          access_policy: params[3],
          lenses: JSON.parse(params[4]),
          granted_adapters: JSON.parse(params[5]),
          notes: params[6],
        };
        const idx = rows.findIndex((r) => r.city_key === row.city_key);
        if (idx >= 0) rows[idx] = row;
        else rows.push(row);
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
    assert.equal(listed.length, 2);
    const fixture = await getCityPack("fixture-city", neonEnv, { query });
    const template = await getCityPack("template-city", neonEnv, { query });
    assert.equal(fixture.accessPolicy, "tenant-private");
    assert.deepEqual(fixture.grantedAdapters, []);
    assert.deepEqual(template.grantedAdapters, []);
    assertCityPackShape(fixture);
    assertCityPackShape(template);
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
