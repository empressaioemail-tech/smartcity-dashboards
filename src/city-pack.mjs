import { LEAD_LENSES } from "./lenses.mjs";

const packs = new Map();

const TEMPLATE_CITY = {
  cityKey: "template-city",
  jurisdictionFips: null,
  displayName: "Template city",
  lenses: LEAD_LENSES.map((l) => l.id),
  grantedAdapters: [],
  notes:
    "Fixture only. Real cities onboard as packs in this service. Bastrop is not this pack. Cutover is a later WDLL.",
};

packs.set(TEMPLATE_CITY.cityKey, TEMPLATE_CITY);

export function listCityPacks() {
  return [...packs.values()].map((p) => ({
    cityKey: p.cityKey,
    jurisdictionFips: p.jurisdictionFips,
    displayName: p.displayName,
    lensCount: p.lenses.length,
    grantedAdapterCount: p.grantedAdapters.length,
  }));
}

export function getCityPack(cityKey) {
  return packs.get(cityKey) || null;
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
