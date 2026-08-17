export const DEVELOPMENT_SERVICES_LENS = "development-services";
export const CITY_MANAGER_LENS = "city-manager";
export const DEFAULT_PLAN_REVIEW_ORIGIN = "https://plan-review-app-ten.vercel.app";

export function resolveStaffLensQuery(search) {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search || new URLSearchParams();
  const lens = String(params.get("lens") || "").trim();
  const isDevelopmentServices = lens === DEVELOPMENT_SERVICES_LENS;
  return {
    lens: isDevelopmentServices ? DEVELOPMENT_SERVICES_LENS : CITY_MANAGER_LENS,
    isDevelopmentServices,
  };
}

export function planReviewIframeSrc(origin) {
  const base = String(origin || DEFAULT_PLAN_REVIEW_ORIGIN).replace(/\/$/, "");
  return `${base}/`;
}
