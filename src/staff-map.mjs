export const GOLD_PARCEL_NODE_ID = "48021:34137";
export const DEFAULT_CITY_KEY = "template-city";

export function resolveStaffMapQuery(search) {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search || new URLSearchParams();
  const parcelNodeId = String(params.get("parcelNodeId") || "").trim();
  const cityKey = String(params.get("cityKey") || "").trim();
  return {
    parcelNodeId: parcelNodeId || GOLD_PARCEL_NODE_ID,
    cityKey: cityKey || DEFAULT_CITY_KEY,
  };
}
