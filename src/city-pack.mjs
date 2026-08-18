import { LEAD_LENSES } from "./lenses.mjs";
import { getPool } from "./db.mjs";
import { assertNoSupplierDsn } from "./mounts.mjs";
import { assertGrantedAdapterShape } from "./adapters.mjs";

const memoryPacks = new Map();
const ACCESS_POLICIES = new Set(["public-free", "tenant-private"]);

export const TEMPLATE_CITY = {
  cityKey: "template-city",
  jurisdictionFips: null,
  displayName: "Template city",
  accessPolicy: "public-free",
  lenses: LEAD_LENSES.map((l) => l.id),
  grantedAdapters: [],
  notes:
    "Public template pack. No clerk calendar grant. Bastrop is not this pack. Cutover is a later WDLL.",
};

export const FIXTURE_CITY = {
  cityKey: "fixture-city",
  jurisdictionFips: null,
  displayName: "Fixture city",
  accessPolicy: "tenant-private",
  lenses: LEAD_LENSES.map((l) => l.id),
  grantedAdapters: [],
  notes:
    "Tenant-private fixture pack. Not Bastrop. Not a connected feed. Grants stay empty.",
};

memoryPacks.set(TEMPLATE_CITY.cityKey, TEMPLATE_CITY);
memoryPacks.set(FIXTURE_CITY.cityKey, FIXTURE_CITY);

const CREATE_CITY_PACKS_SQL = `
CREATE TABLE IF NOT EXISTS city_packs (
  city_key TEXT PRIMARY KEY,
  jurisdiction_fips TEXT NULL,
  display_name TEXT NOT NULL,
  access_policy TEXT NOT NULL DEFAULT 'public-free',
  lenses JSONB NOT NULL,
  granted_adapters JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

const ADD_ACCESS_POLICY_SQL = `
ALTER TABLE city_packs ADD COLUMN IF NOT EXISTS access_policy TEXT NOT NULL DEFAULT 'public-free'`;

const UPSERT_PACK_SQL = `
INSERT INTO city_packs (city_key, jurisdiction_fips, display_name, access_policy, lenses, granted_adapters, notes)
VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
ON CONFLICT (city_key) DO UPDATE SET
  jurisdiction_fips = EXCLUDED.jurisdiction_fips,
  display_name = EXCLUDED.display_name,
  access_policy = EXCLUDED.access_policy,
  lenses = EXCLUDED.lenses,
  granted_adapters = EXCLUDED.granted_adapters,
  notes = EXCLUDED.notes`;

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
  ];
}

function rowToPack(row) {
  const pack = {
    cityKey: row.city_key,
    jurisdictionFips: row.jurisdiction_fips ?? null,
    displayName: row.display_name,
    accessPolicy: row.access_policy || "public-free",
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
    lensCount: pack.lenses.length,
    grantedAdapterCount: pack.grantedAdapters.length,
  };
}

export async function ensureCityPacksTable(envMap = process.env, deps = {}) {
  assertNoSupplierDsn(envMap);
  await runQuery(envMap, CREATE_CITY_PACKS_SQL, [], deps);
  await runQuery(envMap, ADD_ACCESS_POLICY_SQL, [], deps);
  await runQuery(envMap, UPSERT_PACK_SQL, packParams(TEMPLATE_CITY), deps);
  await runQuery(envMap, UPSERT_PACK_SQL, packParams(FIXTURE_CITY), deps);
  return true;
}

export async function listCityPacks(envMap = process.env, deps = {}) {
  if (getPacksStore(envMap) === "neon") {
    await ensureCityPacksTable(envMap, deps);
    const result = await runQuery(
      envMap,
      `SELECT city_key, jurisdiction_fips, display_name, access_policy, lenses, granted_adapters, notes
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
      `SELECT city_key, jurisdiction_fips, display_name, access_policy, lenses, granted_adapters, notes
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
  for (const grant of pack.grantedAdapters) {
    assertGrantedAdapterShape(grant);
  }
  return true;
}
