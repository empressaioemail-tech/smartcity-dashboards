export const DEVELOPMENT_SERVICES_LENS = "development-services";
export const CITY_MANAGER_LENS = "city-manager";
export const FINANCE_LENS = "finance";
export const CITIZEN_LENS = "citizen";
export const DEFAULT_PLAN_REVIEW_ORIGIN = "https://plan-review-app-ten.vercel.app";
export const DEFAULT_SMART_FILES_ORIGIN = "https://smart-files-app.vercel.app";
export const FILES_WORK = "files";
export const REVIEW_WORK = "review";
export const RECORDS_WORK = "records";
export const ASSETS_WORK = "assets";
export const CONNECTIONS_WORK = "connections";
export const PEOPLE_WORK = "people";
export const WORK_IDS = [
  FILES_WORK,
  REVIEW_WORK,
  RECORDS_WORK,
  ASSETS_WORK,
  CONNECTIONS_WORK,
  PEOPLE_WORK,
];

export const LEAD_LENS_IDS = [
  CITY_MANAGER_LENS,
  DEVELOPMENT_SERVICES_LENS,
  FINANCE_LENS,
  CITIZEN_LENS,
];

/** Roster departments named in the nav and routable to an honest Not built view. */
export const ROSTER_LENS_IDS = ["public-works", "parks", "police", "fire-ems", "fleet"];

export const ALL_LENS_IDS = [...LEAD_LENS_IDS, ...ROSTER_LENS_IDS];

/**
 * The Development services tabs.
 *
 * `review` LEFT this list at G-97 (OPS-17 A-076 / A-081, operator ruling
 * 2026-08-19). DS mirrors what the MyGov system a city already runs shows, and
 * Plan review is the native console that aspirationally replaces it and is a
 * long way from doing so, so it is its own Work lens rather than a second door
 * inside the lens it intends to supersede. The MOUNT is not cut: Work / Plan
 * review keeps #anchor-work-review carrying data-stage="review", so the stage
 * still resolves an anchor and the live path is intact. What left is a
 * duplicate door, not a product.
 *
 * `work-orders` JOINED, because the domain existed and had no tab at all. It is
 * one of the five Development services domains in DOMAIN_REGISTRY and the live
 * dashboard reads it across work-orders/{daily-queue,geo-clusters,sla,stats}.
 *
 * The inline head script in web/index.html carries a SECOND COPY of this list,
 * because a script that imports is a module and a module is deferred, which is
 * the G-89 defect. src/first-paint.test.mjs is the divergence test that holds
 * the two equal, textually and behaviourally.
 */
export const DS_TABS = [
  "pipeline",
  "place",
  "inspections",
  "work-orders",
  "code-enforcement",
  "licenses",
];

export const ASSET_TABS = ["inventory", "map", "fixture"];

/** Work views that mount a foreign product surface in a stage. */
export const MOUNT_WORK_IDS = [FILES_WORK, REVIEW_WORK];

export function resolveStaffLensQuery(search) {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search || new URLSearchParams();
  const raw = String(params.get("lens") || "").trim();
  const lens = ALL_LENS_IDS.includes(raw) ? raw : CITY_MANAGER_LENS;
  const rawTab = String(params.get("tab") || "").trim();
  const tab =
    lens === DEVELOPMENT_SERVICES_LENS
      ? DS_TABS.includes(rawTab)
        ? rawTab
        : "pipeline"
      : "";
  const rawWork = String(params.get("work") || "").trim();
  const work = WORK_IDS.includes(rawWork) ? rawWork : "";
  const rawAssetTab = String(params.get("atab") || "").trim();
  const assetTab =
    work === ASSETS_WORK
      ? ASSET_TABS.includes(rawAssetTab)
        ? rawAssetTab
        : "inventory"
      : "";
  return {
    lens,
    isDevelopmentServices: lens === DEVELOPMENT_SERVICES_LENS,
    isRosterLens: ROSTER_LENS_IDS.includes(lens),
    isFilesWork: work === FILES_WORK,
    isReviewWork: work === REVIEW_WORK,
    tab,
    assetTab,
    work,
  };
}

function withEmbedQuery(raw, fallback) {
  const value = String(raw || fallback).trim();
  try {
    const url = new URL(value);
    if (!url.searchParams.has("embed")) url.searchParams.set("embed", "1");
    return url.toString();
  } catch {
    const base = value.replace(/\/$/, "");
    return `${base}/?embed=1`;
  }
}

/**
 * Plan Review is mounted at city altitude, so it must render without its own
 * product top bar. The host already ships html[data-embed="1"] rules; passing
 * embed=1 is what sets the attribute. Mirrors smartFilesIframeSrc.
 */
export function planReviewIframeSrc(origin) {
  return withEmbedQuery(origin, DEFAULT_PLAN_REVIEW_ORIGIN);
}

export function smartFilesIframeSrc(origin) {
  return withEmbedQuery(origin, DEFAULT_SMART_FILES_ORIGIN);
}
