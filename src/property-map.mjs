/* ------------------------------------------------------ property map (live)

G-117. The native Bastrop property map's own read path. Reads smartcity-os's
platform-internal endpoint (GET /api/platform/property-intel/summary) server-
to-server, the same authenticated-fetch pattern mygov-permits.mjs/
vendor-live.mjs already use for every other real domain -- address in,
geocoded parcel + zoning + flood risk + real permits/inspections/code-cases
out.

DELIBERATELY NOT A composeDomain-STYLE FEED. Every other real-live module in
this product composes a bounded RECORD LIST at page-load time for a known
pack (REAL_LIVE_DOMAINS, src/server.mjs). This is a live, user-typed SEARCH:
the property map's own page asks "what's at 123 Main St" on demand, address
by address, not "every permit this pack is granted." So this module exposes
one on-demand lookup function rather than a composeRealX(pack, domain) entry
in REAL_LIVE_DOMAINS -- there is no fixture equivalent for it to sit beside,
and no fixture-seam.mjs guard applies to it for the same reason none apply to
mygov-permits.mjs's own real feed.

REAL VALUES, NOT MAPPED ONTO AN INVENTED TAXONOMY -- same stance as every
other real module in this product (see mygov-permits.mjs's own header).
Zoning is smartcity-os's own PlaceTypeDesc string, flood zone is FEMA's own
zone code, permit/violation status are MyGov's own real values. None of it is
forced onto this product's fixture vocabulary, and nothing here re-derives
smartcity-os's own address-matching -- that logic lives once, server-side, in
smartcity-os's getPropertySummary(), and this module only reshapes what that
function already returned.

BASTROP-ONLY, STATED, NOT ASSUMED. The upstream platform route's own parcel/
zoning/flood queries are hardcoded to Bastrop's ArcGIS services (see
smartcity-os's server/routes/esri.ts) -- there is no second city's data
behind this route today. composePropertyIntelSummary refuses (status:
"unavailable") for any cityKey other than "bastrop_tx" rather than silently
returning Bastrop's data mislabeled as belonging to some other pack.

LEAFLET, THE RENDERING LIBRARY -- NOT NAMED HERE. This module is the
server-side data path only; it never touches a map widget. The map lives
entirely in web/property-map.html/.js, the one narrow, decision-backed
exception to this product's "No Leaflet island" rule (README.md, G-61; see
the dated 2026-09-04 operator decision record in doc_repo's _decisions/
directory for the reasoning and reversal criteria).
*/

const DEFAULT_PROPERTY_INTEL_PLATFORM_URL =
  "https://smartcity-api-7dyaiy7wha-uc.a.run.app/api/platform/property-intel/summary";

export const NATIVE_PROPERTY_MAP_CITY_KEY = "bastrop_tx";

function platformUrl(env = process.env) {
  return String(env.PROPERTY_INTEL_PLATFORM_URL || DEFAULT_PROPERTY_INTEL_PLATFORM_URL).trim();
}

function platformKey(env = process.env) {
  return String(env.PLATFORM_INTERNAL_API_KEY || "").trim();
}

/**
 * The one live HTTP call. address is the only input threaded through --
 * smartcity-os's own route also accepts lat/lng, but this product's search
 * box only ever collects an address, so that's the only shape this module
 * needs to send.
 */
export async function fetchPropertyIntelSummary(
  address,
  { env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  const key = platformKey(env);
  if (!key) {
    return { status: "unavailable", basis: "PLATFORM_INTERNAL_API_KEY unset", body: null };
  }
  const url = `${platformUrl(env)}?address=${encodeURIComponent(address)}`;
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { status: "unavailable", basis: `property-intel platform fetch failed: ${err.message}`, body: null };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const basis = body?.message || body?.error || `property-intel platform HTTP ${res.status}`;
    return { status: "unavailable", basis, body };
  }
  return { status: "ok", basis: "live", body };
}

/**
 * One real record (permit, code case, or inspection), tagged with this
 * product's own honesty markers. All three share the same real-field-family
 * shape out of smartcity-os's own getPropertySummary() (real status/type/
 * date fields, no fixture taxonomy applied), so one mapper covers all three
 * rather than three near-duplicates.
 */
function tagFeedRecord(row, recordType, cityKey) {
  return {
    ...row,
    origin: "feed",
    recordType,
    cityKey,
  };
}

/**
 * Reshapes smartcity-os's platform-route response body (found/match/parcel/
 * summary) into this product's own result shape. Real field values are kept
 * exactly as the source gives them -- nothing here re-derives zoning, flood
 * risk, or status; it only adds origin/cityKey tags and drops nothing that
 * was there.
 */
export function mapRealPropertyResult(body, cityKey) {
  const summary = body?.summary || {};
  const snapshot = summary.snapshot || {};
  const risks = summary.risks || {};
  return {
    match: body?.match
      ? {
          address: body.match.address || null,
          lat: body.match.lat ?? null,
          lng: body.match.lng ?? null,
        }
      : null,
    parcel: {
      found: !!body?.parcel?.found,
      geometry: body?.parcel?.geometry || null,
    },
    snapshot: {
      address: snapshot.address || "",
      parcelId: snapshot.parcelId || "",
      owner: snapshot.owner || "",
      zoning: snapshot.zoning || "",
      zoningCode: snapshot.zoningCode || "",
      acreage: snapshot.acreage || "",
      subdivision: snapshot.subdivision || "",
      legalDesc: snapshot.legalDesc || "",
      lot: snapshot.lot || "",
      block: snapshot.block || "",
      floodZone: snapshot.floodZone || null,
      futureLandUse: snapshot.futureLandUse || null,
    },
    permits: (summary.permits || []).map((r) => tagFeedRecord(r, "permit-case", cityKey)),
    violations: (summary.violations || []).map((r) => tagFeedRecord(r, "code-case", cityKey)),
    inspections: (summary.inspections || []).map((r) => tagFeedRecord(r, "inspection", cityKey)),
    risks: (risks.risks || []).map((r) => ({ ...r, origin: "feed" })),
  };
}

/**
 * The one entry point the property-map API route (src/server.mjs) calls.
 * Same envelope shape family as every other real composer in this product
 * (source: "live", a real basis string on every non-ok outcome) even though
 * this is a one-shot lookup rather than a page-load feed -- so a caller
 * reading this JSON does not need a second vocabulary for "the search found
 * nothing" versus "the domain read failed".
 */
export async function composePropertyIntelSummary({ address, cityKey, env = process.env, fetchImpl } = {}) {
  const trimmedAddress = String(address || "").trim();
  const city = String(cityKey || "").trim();
  const base = { cityKey: city, source: "live", query: trimmedAddress };

  if (city !== NATIVE_PROPERTY_MAP_CITY_KEY) {
    return {
      ...base,
      status: "unavailable",
      basis: `native property map has a real source for ${NATIVE_PROPERTY_MAP_CITY_KEY} only`,
      found: false,
      result: null,
    };
  }
  if (!trimmedAddress) {
    return { ...base, status: "unavailable", basis: "address is required", found: false, result: null };
  }

  const fetched = await fetchPropertyIntelSummary(trimmedAddress, { env, fetchImpl });
  if (fetched.status !== "ok") {
    return { ...base, status: "unavailable", basis: fetched.basis, found: false, result: null };
  }
  const body = fetched.body || {};
  if (!body.found) {
    return { ...base, status: "no_match", basis: body.message || "no address match found", found: false, result: null };
  }
  return {
    ...base,
    status: "ok",
    basis: body.match?.address ? `matched: ${body.match.address}` : "live",
    found: true,
    result: mapRealPropertyResult(body, city),
  };
}
