/**
 * G-161. THE CLIENT'S CITY, AND WHY IT NO LONGER HAS A DEFAULT.
 *
 * This resolver was the whole of the bare-visit defect. It read
 *
 *   export const DEFAULT_CITY_KEY = "template-city";
 *   ...
 *   cityKey: cityKey || DEFAULT_CITY_KEY,
 *
 * so a visit with no `?cityKey` at all resolved to the DEMO pack, web/app.js
 * booted every loader with it, and the surface rendered the demo city's identity
 * and data as though the visitor had asked for it. The server-side half of the
 * same defect (seven `|| "template-city"` route defaults) is fixed in
 * src/server.mjs; this is the half that made a bare visit land on the demo even
 * once the server stopped helping.
 *
 * WHAT IT RETURNS NOW: the caller's EXPLICIT choice, or "" - never a city. The
 * three-step resolution the dispatch states (explicit URL/selection, then the
 * caller's resolved tenant, then a stated no-city state) is deliberately NOT
 * done here, because the second step is a network question and this function is
 * a pure string function that web/app.js also uses for the raw query. The boot
 * in web/app.js takes step 1 from this result and step 2 from
 * GET /api/city-packs, whose response carries the caller's own resolved tenant.
 *
 * The parcel node keeps its default. That asymmetry is the point rather than an
 * oversight: GOLD_PARCEL_NODE_ID is a fixture the map is ABOUT, and the map is a
 * demo surface with one known parcel. A city is not a fixture - it is whose
 * records are being shown - and defaulting it is what this lane deleted.
 *
 * A blank is not a city. `?cityKey=` and `?cityKey=%20` both resolve to "", the
 * same as no parameter, because a caller who supplied a blank did not name a
 * city either.
 */
export const GOLD_PARCEL_NODE_ID = "48021:34137";

export function resolveStaffMapQuery(search) {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search || new URLSearchParams();
  const parcelNodeId = String(params.get("parcelNodeId") || "").trim();
  const cityKey = String(params.get("cityKey") || "").trim();
  return {
    parcelNodeId: parcelNodeId || GOLD_PARCEL_NODE_ID,
    cityKey,
  };
}
