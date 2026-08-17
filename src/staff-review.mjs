export const DEVELOPMENT_SERVICES_LENS = "development-services";
export const CITY_MANAGER_LENS = "city-manager";
export const FINANCE_LENS = "finance";
export const CITIZEN_LENS = "citizen";
export const DEFAULT_PLAN_REVIEW_ORIGIN = "https://plan-review-app-ten.vercel.app";

export const LEAD_LENS_IDS = [
  CITY_MANAGER_LENS,
  DEVELOPMENT_SERVICES_LENS,
  FINANCE_LENS,
  CITIZEN_LENS,
];

export const DS_TABS = [
  "pipeline",
  "place",
  "review",
  "inspections",
  "code-enforcement",
  "licenses",
];

export function resolveStaffLensQuery(search) {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search || new URLSearchParams();
  const raw = String(params.get("lens") || "").trim();
  const lens = LEAD_LENS_IDS.includes(raw) ? raw : CITY_MANAGER_LENS;
  const rawTab = String(params.get("tab") || "").trim();
  const tab =
    lens === DEVELOPMENT_SERVICES_LENS
      ? DS_TABS.includes(rawTab)
        ? rawTab
        : "pipeline"
      : "";
  return {
    lens,
    isDevelopmentServices: lens === DEVELOPMENT_SERVICES_LENS,
    tab,
  };
}

export function planReviewIframeSrc(origin) {
  const base = String(origin || DEFAULT_PLAN_REVIEW_ORIGIN).replace(/\/$/, "");
  return `${base}/`;
}
