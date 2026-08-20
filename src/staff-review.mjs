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

/* ------------------------------------------------------------------ titles

G-95. 2.4.2 Page Titled, and the one place the answer is computed.

Every nav item and every tab in this product is a real <a href> full
navigation, so each of them IS A DISTINCT PAGE, and a distinct page owes the
reader a title that says which one it is. The product shipped
<title>SmartCity Dashboards</title> on all twenty-three of them, and axe cannot
see it: axe scans one page at a time, a title was present on every page it
scanned, and `document-title` passed everywhere. Only a comparison ACROSS
surfaces finds it, which is why scripts/a11y-scan.mjs holds them all at once.

The resolver is here rather than in web/app.js because three readers need the
same answer and they must not each carry their own: web/app.js, the inline head
script in web/index.html (which cannot import - an importing script is a module,
a module is deferred, and that is the G-89 defect), and the CI gate. The head
script's copy is held equal by src/first-paint.test.mjs, textually and
behaviourally, exactly as the lens ids and the theme vocabulary already are.

The labels are the ones the nav and the page headings already use. They are
moved here rather than copied: web/app.js imports them from this module, so the
chrome and the title cannot disagree about what a surface is called.
*/

export const PRODUCT_TITLE = "SmartCity Dashboards";

/** The separator, one literal, so the head script's copy has something to be
 *  compared against rather than a punctuation choice made twice. */
export const TITLE_SEP = " · ";

export const LENS_LABELS = {
  "city-manager": "Overview",
  "development-services": "Development services",
  finance: "Finance",
  citizen: "Citizen",
  "public-works": "Public works",
  parks: "Parks",
  police: "Police",
  "fire-ems": "Fire and EMS",
  fleet: "Fleet",
};

export const TAB_LABELS = {
  pipeline: "Pipeline",
  place: "Place",
  inspections: "Inspections",
  "work-orders": "Work orders",
  "code-enforcement": "Code enforcement",
  licenses: "Licenses",
};

export const WORK_LABELS = {
  files: "Files",
  review: "Plan review",
  records: "Records search",
  assets: "Assets",
  connections: "Connections",
  people: "People and access",
};

export const ASSET_TAB_LABELS = {
  inventory: "Inventory",
  map: "Map",
  fixture: "Demo fixture record",
};

/**
 * The surface's own name, most specific part first, as a path.
 *
 * Most specific first because a title is read left to right and a screen reader
 * announces it on load; "Licenses, Development services" tells the listener
 * where they are in two words, and "Development services, Licenses" makes them
 * wait for it.
 */
export function surfaceLabelPath(model) {
  if (model.work) {
    const parts = [];
    if (model.work === ASSETS_WORK && model.assetTab) parts.push(ASSET_TAB_LABELS[model.assetTab]);
    parts.push(WORK_LABELS[model.work] || model.work);
    return parts.filter(Boolean);
  }
  const parts = [];
  if (model.lens === DEVELOPMENT_SERVICES_LENS && model.tab) parts.push(TAB_LABELS[model.tab]);
  parts.push(LENS_LABELS[model.lens] || model.lens);
  return parts.filter(Boolean);
}

/**
 * The document title for a resolved surface.
 *
 * `tail` is what follows the surface name. It defaults to the product name
 * alone, which is what the inline head script can know AT FIRST PAINT: the pack
 * has not been read yet and this product does not name a city it has not read.
 * web/app.js passes the identity's own pack-level title once it resolves, so
 * the title gains the city and never loses the surface. The discriminator -
 * the part 2.4.2 is actually about - is present from the first paint and never
 * changes.
 */
export function surfaceTitle(model, tail = PRODUCT_TITLE) {
  return [...surfaceLabelPath(model), tail].join(TITLE_SEP);
}
