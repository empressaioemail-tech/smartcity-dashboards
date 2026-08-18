import { LEAD_LENSES } from "./lenses.mjs";
import { getPool } from "./db.mjs";
import { assertNoSupplierDsn } from "./mounts.mjs";
import { assertGrantedAdapterShape } from "./adapters.mjs";

const memoryPacks = new Map();
const ACCESS_POLICIES = new Set(["public-free", "tenant-private"]);

/**
 * The environment badge states, 30b section 3.1. Three identities must never
 * render alike, which is the whole reason the badge exists.
 */
export const ENVIRONMENTS = new Set(["demo", "live", "staging"]);

export const TEMPLATE_CITY = {
  cityKey: "template-city",
  jurisdictionFips: null,
  displayName: "Template city",
  accessPolicy: "public-free",
  environment: "demo",
  generatesFixtures: true,
  lenses: LEAD_LENSES.map((l) => l.id),
  grantedAdapters: [],
  notes:
    "Public fixture pack. Records are generated from the adapter output contracts and marked fixture in the payload. No clerk calendar grant. Bastrop is not this pack. Cutover is a later WDLL.",
};

/**
 * The honest-empty demonstration template-city used to carry. It exists so the
 * absence states stay reachable and testable instead of becoming unreachable
 * code once template-city starts generating records, per
 * _decisions/2026-08-18_template_city_becomes_fixture_city.md.
 */
export const EMPTY_CITY = {
  cityKey: "empty-city",
  jurisdictionFips: null,
  displayName: "Empty city",
  accessPolicy: "public-free",
  environment: "demo",
  generatesFixtures: false,
  lenses: LEAD_LENSES.map((l) => l.id),
  grantedAdapters: [],
  notes:
    "The unconnected city. Generates nothing, grants nothing, and states every absence with a basis.",
};

export const FIXTURE_CITY = {
  cityKey: "fixture-city",
  jurisdictionFips: null,
  displayName: "Fixture city",
  accessPolicy: "tenant-private",
  environment: "demo",
  generatesFixtures: false,
  lenses: LEAD_LENSES.map((l) => l.id),
  grantedAdapters: [],
  notes:
    "Tenant-private tenancy test subject, not the demo. Not Bastrop. Not a connected feed. Generates nothing and grants stay empty.",
};

memoryPacks.set(TEMPLATE_CITY.cityKey, TEMPLATE_CITY);
memoryPacks.set(EMPTY_CITY.cityKey, EMPTY_CITY);
memoryPacks.set(FIXTURE_CITY.cityKey, FIXTURE_CITY);

const CREATE_CITY_PACKS_SQL = `
CREATE TABLE IF NOT EXISTS city_packs (
  city_key TEXT PRIMARY KEY,
  jurisdiction_fips TEXT NULL,
  display_name TEXT NOT NULL,
  access_policy TEXT NOT NULL DEFAULT 'public-free',
  lenses JSONB NOT NULL,
  granted_adapters JSONB NOT NULL DEFAULT '[]',
  environment TEXT NOT NULL DEFAULT 'demo',
  generates_fixtures BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

const ADD_ACCESS_POLICY_SQL = `
ALTER TABLE city_packs ADD COLUMN IF NOT EXISTS access_policy TEXT NOT NULL DEFAULT 'public-free'`;

const ADD_ENVIRONMENT_SQL = `
ALTER TABLE city_packs ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'demo'`;

const ADD_GENERATES_FIXTURES_SQL = `
ALTER TABLE city_packs ADD COLUMN IF NOT EXISTS generates_fixtures BOOLEAN NOT NULL DEFAULT false`;

const UPSERT_PACK_SQL = `
INSERT INTO city_packs (city_key, jurisdiction_fips, display_name, access_policy, lenses, granted_adapters, notes, environment, generates_fixtures)
VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
ON CONFLICT (city_key) DO UPDATE SET
  jurisdiction_fips = EXCLUDED.jurisdiction_fips,
  display_name = EXCLUDED.display_name,
  access_policy = EXCLUDED.access_policy,
  lenses = EXCLUDED.lenses,
  granted_adapters = EXCLUDED.granted_adapters,
  notes = EXCLUDED.notes,
  environment = EXCLUDED.environment,
  generates_fixtures = EXCLUDED.generates_fixtures`;

export function getPacksStore(envMap = process.env) {
  const url = String(envMap.DATABASE_URL || "").trim();
  if (!url) return "memory";
  return "neon";
}

async function runQuery(envMap, sql, params = [], deps = {}) {
  if (typeof deps.query === "function") {
    return deps.query(sql, params);
  }
  return getPool(envMap).query(sql, params);
}

function packParams(pack) {
  return [
    pack.cityKey,
    pack.jurisdictionFips,
    pack.displayName,
    pack.accessPolicy,
    JSON.stringify(pack.lenses),
    JSON.stringify(pack.grantedAdapters),
    pack.notes,
    pack.environment,
    pack.generatesFixtures,
  ];
}

/**
 * The one column list the read path uses, kept beside rowToPack because they
 * have to agree. They did not: the write path learned `environment` and
 * `generates_fixtures` while both SELECTs kept their old explicit lists, so a
 * stored pack came back with generatesFixtures false no matter what the row
 * said. Nothing local caught it, because a local run has no DSN and never
 * takes the SQL path at all.
 */
export const PACK_COLUMNS =
  "city_key, jurisdiction_fips, display_name, access_policy, lenses, granted_adapters, notes, environment, generates_fixtures";

function rowToPack(row) {
  const pack = {
    cityKey: row.city_key,
    jurisdictionFips: row.jurisdiction_fips ?? null,
    displayName: row.display_name,
    accessPolicy: row.access_policy || "public-free",
    environment: row.environment || "demo",
    generatesFixtures: row.generates_fixtures === true,
    lenses: row.lenses,
    grantedAdapters: row.granted_adapters ?? [],
    notes: row.notes ?? null,
  };
  assertCityPackShape(pack);
  return pack;
}

function listItem(pack) {
  return {
    cityKey: pack.cityKey,
    jurisdictionFips: pack.jurisdictionFips,
    displayName: pack.displayName,
    accessPolicy: pack.accessPolicy,
    environment: pack.environment,
    generatesFixtures: pack.generatesFixtures === true,
    lensCount: pack.lenses.length,
    grantedAdapterCount: pack.grantedAdapters.length,
  };
}

export async function ensureCityPacksTable(envMap = process.env, deps = {}) {
  assertNoSupplierDsn(envMap);
  await runQuery(envMap, CREATE_CITY_PACKS_SQL, [], deps);
  await runQuery(envMap, ADD_ACCESS_POLICY_SQL, [], deps);
  await runQuery(envMap, ADD_ENVIRONMENT_SQL, [], deps);
  await runQuery(envMap, ADD_GENERATES_FIXTURES_SQL, [], deps);
  await runQuery(envMap, UPSERT_PACK_SQL, packParams(TEMPLATE_CITY), deps);
  await runQuery(envMap, UPSERT_PACK_SQL, packParams(EMPTY_CITY), deps);
  await runQuery(envMap, UPSERT_PACK_SQL, packParams(FIXTURE_CITY), deps);
  return true;
}

export async function listCityPacks(envMap = process.env, deps = {}) {
  if (getPacksStore(envMap) === "neon") {
    await ensureCityPacksTable(envMap, deps);
    const result = await runQuery(
      envMap,
      `SELECT ${PACK_COLUMNS}
         FROM city_packs
        ORDER BY city_key`,
      [],
      deps,
    );
    return (result.rows || []).map((row) => listItem(rowToPack(row)));
  }
  return [...memoryPacks.values()].map(listItem);
}

export async function getCityPack(cityKey, envMap = process.env, deps = {}) {
  if (getPacksStore(envMap) === "neon") {
    await ensureCityPacksTable(envMap, deps);
    const result = await runQuery(
      envMap,
      `SELECT ${PACK_COLUMNS}
         FROM city_packs
        WHERE city_key = $1`,
      [cityKey],
      deps,
    );
    const row = result.rows?.[0];
    return row ? rowToPack(row) : null;
  }
  return memoryPacks.get(cityKey) || null;
}

/**
 * The environment badge text for a pack, 30b section 3.1. Declared here so the
 * shipped chrome can be tested against the rule rather than against itself:
 * ui.test.mjs asserts the badge in web/index.html equals this for the pack it
 * serves, which is the divergence test between the rule and its rendering.
 */
export function environmentBadgeLabel(pack) {
  const env = pack && ENVIRONMENTS.has(pack.environment) ? pack.environment : "demo";
  return { demo: "Demo", live: "Live", staging: "Staging" }[env];
}

export function assertCityPackShape(pack) {
  if (!pack || typeof pack.cityKey !== "string" || !pack.cityKey) {
    throw new Error("city pack requires cityKey");
  }
  if (pack.cityKey === "bastrop") {
    throw new Error("Bastrop is not a pack on this card");
  }
  if ("repo" in pack) {
    throw new Error("cities are packs, not repos");
  }
  if (!ACCESS_POLICIES.has(pack.accessPolicy)) {
    throw new Error("city pack requires accessPolicy public-free or tenant-private");
  }
  if (!Array.isArray(pack.lenses)) {
    throw new Error("city pack requires lenses[]");
  }
  if (!Array.isArray(pack.grantedAdapters)) {
    throw new Error("city pack requires grantedAdapters[]");
  }
  if (typeof pack.generatesFixtures !== "boolean") {
    throw new Error("city pack requires generatesFixtures true or false");
  }
  if (!ENVIRONMENTS.has(pack.environment)) {
    throw new Error("city pack requires environment demo, live or staging");
  }
  if (pack.generatesFixtures) {
    /**
     * Labelling gate item 1. A pack whose records are generated is a demo, and
     * the badge is the only thing standing between a fixture and a council
     * meeting quoting it as a real number.
     */
    if (pack.environment !== "demo") {
      throw new Error("a pack that generates fixtures is environment demo");
    }
    /**
     * A pack carries generated fixtures or a real city's granted records, never
     * both. Mixing them is the identity collapse G-74 was written to close.
     */
    if (pack.grantedAdapters.length > 0) {
      throw new Error("a pack that generates fixtures grants no adapter");
    }
  }
  for (const grant of pack.grantedAdapters) {
    assertGrantedAdapterShape(grant);
  }
  return true;
}
