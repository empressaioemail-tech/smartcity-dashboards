import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listCityPacks,
  getCityPack,
  assertCityPackShape,
  getPacksStore,
  TEMPLATE_CITY,
  FIXTURE_CITY,
  EMPTY_CITY,
  BASTROP_TX,
  PACK_COLUMNS,
} from "./city-pack.mjs";

describe("city packs", () => {
  it("ships four packs: template-city public-free, empty-city public-free, fixture-city tenant-private, bastrop_tx tenant-private (real, staging) — none of them the literal 'bastrop' key", async () => {
    assert.equal(getPacksStore({}), "memory");
    const listed = await listCityPacks({});
    assert.equal(listed.length, 4);
    const keys = listed.map((p) => p.cityKey).sort();
    assert.deepEqual(keys, ["bastrop_tx", "empty-city", "fixture-city", "template-city"]);
    const template = await getCityPack("template-city", {});
    const empty = await getCityPack("empty-city", {});
    const fixture = await getCityPack("fixture-city", {});
    const bastrop = await getCityPack("bastrop_tx", {});
    assert.equal(template.accessPolicy, "public-free");
    assert.equal(empty.accessPolicy, "public-free");
    assert.equal(fixture.accessPolicy, "tenant-private");
    assert.equal(bastrop.accessPolicy, "tenant-private");
    assert.deepEqual(template.grantedAdapters, []);
    assert.deepEqual(empty.grantedAdapters, []);
    assert.deepEqual(fixture.grantedAdapters, []);
    assert.notEqual(template.cityKey, "bastrop");
    assert.notEqual(fixture.cityKey, "bastrop");
    assert.notEqual(bastrop.cityKey, "bastrop");
    // G-116: real, not a demo/fixture, and not yet live — a go-live is its own,
    // later, explicit item (same shape as G-115's item 6).
    assert.equal(bastrop.generatesFixtures, false);
    assert.equal(bastrop.environment, "staging");
    assert.equal(bastrop.jurisdictionFips, "48021");
    // G-116 Phase 1: the one real feed already proven end to end (G-71/G-74)
    // now lives on the real pack instead of being held off it. Phase 2: the
    // real mygov permits feed joins it.
    assert.equal(bastrop.grantedAdapters.length, 2);
    const bastropKinds = bastrop.grantedAdapters.map((g) => g.kind).sort();
    assert.deepEqual(bastropKinds, ["municode", "mygov"]);
    const municodeGrant = bastrop.grantedAdapters.find((g) => g.kind === "municode");
    assert.equal(municodeGrant.sourceUrl, "https://bastrop-tx.municodemeetings.com/");
    const mygovGrant = bastrop.grantedAdapters.find((g) => g.kind === "mygov");
    assert.equal(mygovGrant.purpose, "permits");
    assert.equal(mygovGrant.accessPolicy, "tenant-private");
    assert.equal("repo" in template, false);
    assertCityPackShape(template);
    assertCityPackShape(empty);
    assertCityPackShape(fixture);
    assertCityPackShape(bastrop);
    assert.equal(TEMPLATE_CITY.cityKey, "template-city");
    assert.equal(FIXTURE_CITY.cityKey, "fixture-city");
    assert.equal(EMPTY_CITY.cityKey, "empty-city");
    assert.equal(BASTROP_TX.cityKey, "bastrop_tx");
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
      // G-91. This branch firing on a new column is the column-drift gate
      // working: an ALTER the stub does not know about reaches its throw below.
      if (/ADD COLUMN IF NOT EXISTS fixture_grants/i.test(sql)) {
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
          fixture_grants: JSON.parse(params[9]),
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
    assert.equal(listed.length, 4);
    const fixture = await getCityPack("fixture-city", neonEnv, { query });
    const template = await getCityPack("template-city", neonEnv, { query });
    const empty = await getCityPack("empty-city", neonEnv, { query });
    const bastrop = await getCityPack("bastrop_tx", neonEnv, { query });
    assert.equal(fixture.accessPolicy, "tenant-private");
    assert.deepEqual(fixture.grantedAdapters, []);
    assert.deepEqual(template.grantedAdapters, []);
    // G-116 Phase 1/2: both real grants round-trip through Neon too.
    assert.equal(bastrop.grantedAdapters.length, 2);
    assert.deepEqual(bastrop.grantedAdapters.map((g) => g.kind).sort(), ["municode", "mygov"]);
    // The records dimension survives the round trip through the store, so a
    // deployment reading Neon cannot lose the fixture declaration.
    assert.equal(template.generatesFixtures, true);
    assert.equal(empty.generatesFixtures, false);
    assert.equal(fixture.generatesFixtures, false);
    assert.equal(bastrop.generatesFixtures, false);
    assert.equal(template.environment, "demo");
    assert.equal(bastrop.environment, "staging");
    // And so does the demonstration axis, which is the failure generatesFixtures
    // itself had before G-79: written, never selected, silently false on Neon.
    assert.deepEqual(template.fixtureGrants, [
      "mygov",
      "samsara",
      "verkada",
      "firstdue",
      "powerbi",
      "goto",
    ]);
    assert.deepEqual(empty.fixtureGrants, []);
    assert.deepEqual(fixture.fixtureGrants, []);
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

describe("G-79 pack read path", () => {
  it("selects every column rowToPack consumes, so a stored pack round-trips", async () => {
    // Structural, not a needle list: whatever rowToPack reads must be selected.
    const source = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "city-pack.mjs"),
      "utf8",
    );
    const body = source.slice(source.indexOf("function rowToPack"));
    const consumed = new Set(
      [...body.slice(0, body.indexOf("\n}")).matchAll(/row\.([a-z_]+)/g)].map((m) => m[1]),
    );
    assert.ok(consumed.size >= 8, "expected rowToPack to read the pack columns");
    const selected = new Set(PACK_COLUMNS.split(",").map((c) => c.trim()));
    for (const col of consumed) {
      assert.ok(selected.has(col), `SELECT omits ${col}, which rowToPack reads`);
    }
  });

  it("round-trips generatesFixtures and environment through an injected Neon row", async () => {
    const envMap = { DATABASE_URL: "postgres://user:pw@ep-x.neon.tech/neondb" };
    const seen = [];
    const query = async (sql, params) => {
      seen.push(sql);
      if (!/^SELECT/.test(sql.trim())) return { rows: [] };
      return {
        rows: [
          {
            city_key: "template-city",
            jurisdiction_fips: null,
            display_name: "Template city",
            access_policy: "public-free",
            lenses: ["city-manager"],
            granted_adapters: [],
            notes: "stored row",
            environment: "demo",
            generates_fixtures: true,
          },
        ],
      };
    };
    const pack = await getCityPack("template-city", envMap, { query });
    assert.equal(pack.generatesFixtures, true, "stored true must survive the read");
    assert.equal(pack.environment, "demo");
    const select = seen.find((s) => /^SELECT/.test(s.trim()));
    assert.match(select, /generates_fixtures/);
    assert.match(select, /environment/);
    assert.match(select, /fixture_grants/, "the demonstration axis must be selected too");
    /**
     * The row above predates the column, and the rule for that case is STATED
     * rather than defaulted quietly: a pack that declares no fixtureGrants
     * demonstrates nothing, so every built region on it renders ungranted with a
     * basis. Asserted here so the rule is a measured behaviour and not a comment.
     */
    assert.deepEqual(pack.fixtureGrants, []);
  });

  it("gates the demonstration axis: catalogued kinds only, and never on a pack that generates nothing", () => {
    const base = {
      cityKey: "would-be-city",
      accessPolicy: "public-free",
      environment: "demo",
      generatesFixtures: true,
      lenses: [],
      grantedAdapters: [],
      fixtureGrants: ["mygov"],
    };
    assertCityPackShape(base);
    assert.throws(
      () => assertCityPackShape({ ...base, fixtureGrants: ["not-a-kind"] }),
      /not a catalogued adapter kind/,
    );
    assert.throws(
      () => assertCityPackShape({ ...base, fixtureGrants: "mygov" }),
      /fixtureGrants must be an array/,
    );
    assert.throws(
      () => assertCityPackShape({ ...base, generatesFixtures: false }),
      /generates no fixtures declares no fixtureGrants/,
    );
    // A pack that omits the field entirely is legal and demonstrates nothing,
    // which is what makes the gate above a gate rather than a required field.
    const omitted = { ...base };
    delete omitted.fixtureGrants;
    assertCityPackShape(omitted);
    /**
     * The two axes stay orthogonal, and the G-74 gate is untouched by G-91: a
     * pack that generates fixtures still grants no live adapter, whatever it
     * demonstrates.
     */
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
  });
});
