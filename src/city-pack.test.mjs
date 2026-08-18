import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  listCityPacks,
  getCityPack,
  assertCityPackShape,
  getPacksStore,
  TEMPLATE_CITY,
  FIXTURE_CITY,
  EMPTY_CITY,
} from "./city-pack.mjs";

describe("city packs", () => {
  it("ships three packs: template-city public-free, empty-city public-free, fixture-city tenant-private, none of them Bastrop", async () => {
    assert.equal(getPacksStore({}), "memory");
    const listed = await listCityPacks({});
    assert.equal(listed.length, 3);
    const keys = listed.map((p) => p.cityKey).sort();
    assert.deepEqual(keys, ["empty-city", "fixture-city", "template-city"]);
    const template = await getCityPack("template-city", {});
    const empty = await getCityPack("empty-city", {});
    const fixture = await getCityPack("fixture-city", {});
    assert.equal(template.accessPolicy, "public-free");
    assert.equal(empty.accessPolicy, "public-free");
    assert.equal(fixture.accessPolicy, "tenant-private");
    assert.deepEqual(template.grantedAdapters, []);
    assert.deepEqual(empty.grantedAdapters, []);
    assert.deepEqual(fixture.grantedAdapters, []);
    assert.notEqual(template.cityKey, "bastrop");
    assert.notEqual(fixture.cityKey, "bastrop");
    assert.equal("repo" in template, false);
    assertCityPackShape(template);
    assertCityPackShape(empty);
    assertCityPackShape(fixture);
    assert.equal(TEMPLATE_CITY.cityKey, "template-city");
    assert.equal(FIXTURE_CITY.cityKey, "fixture-city");
    assert.equal(EMPTY_CITY.cityKey, "empty-city");
  });

  it("carries the records dimension: only template-city generates, and only in demo", async () => {
    const listed = await listCityPacks({});
    const generating = listed.filter((p) => p.generatesFixtures).map((p) => p.cityKey);
    // Labelling gate item 5: empty-city generates nothing.
    assert.deepEqual(generating, ["template-city"]);
    assert.equal(EMPTY_CITY.generatesFixtures, false);
    assert.equal(FIXTURE_CITY.generatesFixtures, false);
    // Labelling gate item 1 at the pack: a generating pack is environment demo.
    for (const pack of [TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY]) {
      assert.equal(pack.environment, "demo", pack.cityKey);
    }
  });

  it("can fire: the records dimension rejects a generating pack that is live or granted", () => {
    const base = {
      cityKey: "would-be-city",
      accessPolicy: "public-free",
      environment: "demo",
      generatesFixtures: true,
      lenses: [],
      grantedAdapters: [],
    };
    assertCityPackShape(base);
    assert.throws(
      () => assertCityPackShape({ ...base, environment: "live" }),
      /generates fixtures is environment demo/,
    );
    assert.throws(
      () =>
        assertCityPackShape({
          ...base,
          grantedAdapters: [
            {
              kind: "municode",
              purpose: "calendar",
              writesTo: "spine",
              accessPolicy: "public-free",
              sourceUrl: "https://example.org/calendar",
            },
          ],
        }),
      /generates fixtures grants no adapter/,
    );
    assert.throws(
      () => assertCityPackShape({ ...base, generatesFixtures: "yes" }),
      /generatesFixtures true or false/,
    );
    assert.throws(
      () => assertCityPackShape({ ...base, environment: "production" }),
      /environment demo, live or staging/,
    );
    // A non-generating live pack is legal, which is what makes the gate above a
    // gate rather than a constant.
    assertCityPackShape({ ...base, environment: "live", generatesFixtures: false });
  });

  it("rejects a pack that claims to be a repo", () => {
    assert.throws(
      () =>
        assertCityPackShape({
          cityKey: "x",
          repo: "some-city",
          accessPolicy: "public-free",
          environment: "demo",
          generatesFixtures: false,
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
          environment: "demo",
          generatesFixtures: false,
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
      if (/ADD COLUMN IF NOT EXISTS environment/i.test(sql)) {
        return { rows: [] };
      }
      if (/ADD COLUMN IF NOT EXISTS generates_fixtures/i.test(sql)) {
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
          environment: params[7],
          generates_fixtures: params[8],
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
    assert.equal(listed.length, 3);
    const fixture = await getCityPack("fixture-city", neonEnv, { query });
    const template = await getCityPack("template-city", neonEnv, { query });
    const empty = await getCityPack("empty-city", neonEnv, { query });
    assert.equal(fixture.accessPolicy, "tenant-private");
    assert.deepEqual(fixture.grantedAdapters, []);
    assert.deepEqual(template.grantedAdapters, []);
    // The records dimension survives the round trip through the store, so a
    // deployment reading Neon cannot lose the fixture declaration.
    assert.equal(template.generatesFixtures, true);
    assert.equal(empty.generatesFixtures, false);
    assert.equal(fixture.generatesFixtures, false);
    assert.equal(template.environment, "demo");
    assertCityPackShape(fixture);
    assertCityPackShape(template);
    assertCityPackShape(empty);
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
