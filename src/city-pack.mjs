import { LEAD_LENSES } from "./lenses.mjs";
import { getPool } from "./db.mjs";
import { assertNoSupplierDsn } from "./mounts.mjs";

const memoryPacks = new Map();

export const TEMPLATE_CITY = {
  cityKey: "template-city",
  jurisdictionFips: null,
  displayName: "Template city",
  lenses: LEAD_LENSES.map((l) => l.id),
  grantedAdapters: [],
  notes:
    "Fixture only. Real cities onboard as packs in this service. Bastrop is not this pack. Cutover is a later WDLL.",
};

memoryPacks.set(TEMPLATE_CITY.cityKey, TEMPLATE_CITY);

const CREATE_CITY_PACKS_SQL = `
CREATE TABLE IF NOT EXISTS city_packs (
  city_key TEXT PRIMARY KEY,
  jurisdiction_fips TEXT NULL,
  display_name TEXT NOT NULL,
  lenses JSONB NOT NULL,
  granted_adapters JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

const UPSERT_TEMPLATE_SQL = `
INSERT INTO city_packs (city_key, jurisdiction_fips, display_name, lenses, granted_adapters, notes)
VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
ON CONFLICT (city_key) DO UPDATE SET
  jurisdiction_fips = EXCLUDED.jurisdiction_fips,
  display_name = EXCLUDED.display_name,
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

function rowToPack(row) {
  const pack = {
    cityKey: row.city_key,
    jurisdictionFips: row.jurisdiction_fips ?? null,
    displayName: row.display_name,
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
    lensCount: pack.lenses.length,
    grantedAdapterCount: pack.grantedAdapters.length,
  };
}

export async function ensureCityPacksTable(envMap = process.env, deps = {}) {
  assertNoSupplierDsn(envMap);
  await runQuery(envMap, CREATE_CITY_PACKS_SQL, [], deps);
  await runQuery(
    envMap,
    UPSERT_TEMPLATE_SQL,
    [
      TEMPLATE_CITY.cityKey,
      TEMPLATE_CITY.jurisdictionFips,
      TEMPLATE_CITY.displayName,
      JSON.stringify(TEMPLATE_CITY.lenses),
      JSON.stringify(TEMPLATE_CITY.grantedAdapters),
      TEMPLATE_CITY.notes,
    ],
    deps,
  );
  return true;
}

export async function listCityPacks(envMap = process.env, deps = {}) {
  if (getPacksStore(envMap) === "neon") {
    await ensureCityPacksTable(envMap, deps);
    const result = await runQuery(
      envMap,
      `SELECT city_key, jurisdiction_fips, display_name, lenses, granted_adapters, notes
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
      `SELECT city_key, jurisdiction_fips, display_name, lenses, granted_adapters, notes
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
  if ("repo" in pack) {
    throw new Error("cities are packs, not repos");
  }
  if (!Array.isArray(pack.lenses)) {
    throw new Error("city pack requires lenses[]");
  }
  if (!Array.isArray(pack.grantedAdapters)) {
    throw new Error("city pack requires grantedAdapters[]");
  }
  return true;
}
