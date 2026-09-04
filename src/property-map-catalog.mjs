/* ------------------------------------------------ property map layer catalog

G-117 full-parity follow-up. The native property map's complete layer
vocabulary -- every one of the 52 keys the widened platform-internal bridge
allowlists, grouped into the same 7 categories production uses, plus the 10
named view-template presets and the 6 per-feature styled overrides.

PORTED, NOT RECONSTRUCTED. Every key/name/category/geometryType/color/
fillColor/fillOpacity/weight/dashArray/minZoom value below, and every color
bucket/threshold/property-key lookup in the six styled-override functions, is
copied field-for-field from smartcity-os's own client/src/components/maps/
layerCatalog.ts (LAYER_CATALOG, VIEW_TEMPLATES) and client/src/pages/
DevelopmentServicesDashboard.tsx (STYLED_LAYERS and its ZONING_COLORS/
FLU_COLORS/FEMA_ZONE_COLORS/SUBDIVISION_PALETTE and the parcels-one-click/pci
functions) -- the exact real production values, not approximated or reasoned
about from memory.

EXPLICITLY EXCLUDED: "permits", "violations", "heatmap". Production's own
"overlays" category composes those three from MyGov data through a different
route/shape than every other layer here (server-composed GIS FeatureCollections
via the platform-internal property-intel bridge); they are out of scope for
this GIS-layer effort and are named here, not silently dropped. The "overlays"
category itself is therefore absent from LAYER_CATALOG below -- once those
three keys are removed it would otherwise be an empty category, which is not
a category production has either.

SERVED PLAIN. This module is imported both by src/property-map.mjs (the
server-side allowlist, Node) and directly by the browser at /property-map-
catalog.mjs (see src/server.mjs's sendFile route and web/property-map.js's
import) -- same convention as src/theme.mjs, a plain ESM module with no
Node-only built-ins so one file works unmodified in both runtimes.

NOTHING HERE TOUCHES THE DOM. Pure data and pure per-feature style functions,
same posture as src/theme.mjs and src/staff-map.mjs: testable in Node with no
browser, and the addressability gate can state as a positive determination
that this module addresses nothing (it assigns no ids, reads no elements).
*/

/**
 * The 7 layer categories, in production's own order. "overlays" (permits,
 * violations, heatmap) is deliberately absent -- see the module header.
 */
export const LAYER_CATALOG = [
  {
    id: "public-safety",
    name: "Public Safety / Emergency",
    description: "Fire stations, critical facilities, emergency districts, flood zones",
    layers: [
      { key: "fire-stations", name: "Fire Stations", geometryType: "point", color: "#dc2626", description: "Fire station locations with contact info" },
      { key: "critical-facilities", name: "Critical Facilities", geometryType: "point", color: "#b91c1c", description: "Fire, police, 911 centers with addresses and contacts" },
      { key: "emergency-service-districts", name: "Emergency Service Districts", geometryType: "polygon", color: "#f87171", fillColor: "#fca5a5", fillOpacity: 0.15, weight: 2, dashArray: "8 4", description: "Fire, law, medical, first responder boundaries" },
      { key: "fema-flood-zones", name: "FEMA Flood Zones (SFHA)", geometryType: "polygon", color: "#0284c7", fillColor: "#38bdf8", fillOpacity: 0.25, weight: 2, minZoom: 13, description: "Special Flood Hazard Areas from DFIRM data" },
      { key: "fire-districts", name: "Fire Districts", geometryType: "polygon", color: "#ef4444", fillColor: "#fca5a5", fillOpacity: 0.12, weight: 2, dashArray: "6 4", description: "Emergency service fire district boundaries" },
      { key: "low-water-crossings", name: "Low Water Crossings", geometryType: "point", color: "#0ea5e9", description: "Low water crossing locations with real-time open/closed status" },
      { key: "live-stream-gauges", name: "Live Stream Gauges", geometryType: "point", color: "#06b6d4", description: "NOAA/USGS live stream gauges — stage, flow, flood status" },
      { key: "befco-flood-points", name: "BEFCO Flood Monitoring Points", geometryType: "point", color: "#0369a1", description: "Flood Control Organization monitoring points" },
      { key: "evacuation-routes", name: "Evacuation Routes", geometryType: "line", color: "#f59e0b", weight: 4, description: "Designated evacuation routes (active during incidents)" },
      { key: "shelters", name: "Shelters", geometryType: "point", color: "#22c55e", description: "Emergency shelter locations (active during incidents)" },
      { key: "incident-points", name: "Incident Points", geometryType: "point", color: "#dc2626", description: "Active incident locations (populated during incidents)" },
      { key: "road-blocks", name: "Road Blocks", geometryType: "point", color: "#b91c1c", description: "Road block/closure points (active during incidents)" },
      { key: "detours", name: "Detour Routes", geometryType: "line", color: "#f97316", weight: 3, dashArray: "8 4", description: "Detour routes around road closures" },
      { key: "impacted-areas", name: "Impacted Areas", geometryType: "polygon", color: "#dc2626", fillColor: "#fca5a5", fillOpacity: 0.2, weight: 2, description: "Areas impacted by active incidents" },
    ],
  },
  {
    id: "water-supply",
    name: "Water Supply Infrastructure",
    description: "Hydrants, valves, wells, storage tanks",
    layers: [
      { key: "hydrants", name: "Fire Hydrants", geometryType: "point", color: "#dc2626", description: "Fire hydrant valve locations" },
      { key: "system-valves", name: "System Valves", geometryType: "point", color: "#2563eb", description: "Water system valve locations" },
      { key: "water-wells", name: "Water Wells", geometryType: "point", color: "#0891b2", description: "Water well locations" },
      { key: "storage-tanks", name: "Storage Tanks", geometryType: "point", color: "#6366f1", description: "Water storage tank locations" },
    ],
  },
  {
    id: "infrastructure",
    name: "Infrastructure / Utilities",
    description: "Electrical grid, storm drainage, water systems, CIP projects",
    layers: [
      { key: "water-mains", name: "Water Mains", geometryType: "line", color: "#2563eb", weight: 3, minZoom: 15, description: "City water main lines" },
      { key: "wastewater", name: "Wastewater Lines", geometryType: "line", color: "#92400e", weight: 3, minZoom: 15, description: "Wastewater/sewer main lines" },
      { key: "storm-drainage", name: "Storm Drainage", geometryType: "line", color: "#0891b2", weight: 3, minZoom: 15, description: "Storm water drainage mains" },
      { key: "cip-projects", name: "CIP Projects", geometryType: "point", color: "#f97316", minZoom: 13, description: "Capital Improvement Projects with status" },
      { key: "street-lights", name: "Street Lights", geometryType: "point", color: "#fbbf24", minZoom: 16, description: "Street light locations" },
      { key: "electrical-lines", name: "Electrical Lines (Overhead)", geometryType: "line", color: "#facc15", weight: 2, minZoom: 16, description: "Primary overhead electrical lines" },
      { key: "electrical-underground", name: "Electrical Lines (Underground)", geometryType: "line", color: "#a16207", weight: 2, dashArray: "6 4", minZoom: 16, description: "Primary underground electrical lines" },
      { key: "transformers", name: "Transformers", geometryType: "point", color: "#ca8a04", minZoom: 16, description: "Electrical transformer locations" },
      { key: "substations", name: "Substations", geometryType: "point", color: "#854d0e", description: "Electrical substation locations" },
      { key: "water-zones", name: "Pressure Planes / Water Zones", geometryType: "polygon", color: "#3b82f6", fillColor: "#93c5fd", fillOpacity: 0.1, weight: 2, dashArray: "6 4", description: "Water pressure zone boundaries" },
    ],
  },
  {
    id: "planning",
    name: "Planning / Development",
    description: "Zoning, subdivisions, future land use, development projects, historic districts",
    layers: [
      { key: "zoning", name: "Zoning Districts", geometryType: "polygon", color: "#7c3aed", fillOpacity: 0.35, minZoom: 14, description: "Place Type zoning districts (Core, Mix, Rural, etc.)" },
      { key: "future-land-use", name: "Future Land Use", geometryType: "polygon", color: "#8b5cf6", fillColor: "#c4b5fd", fillOpacity: 0.2, weight: 2, minZoom: 13, description: "Comprehensive plan future land use designations" },
      { key: "development-projects", name: "Development Projects", geometryType: "polygon", color: "#d946ef", fillColor: "#f0abfc", fillOpacity: 0.2, weight: 2, minZoom: 13, description: "Active and planned development projects" },
      { key: "subdivisions", name: "Subdivisions / Final Plats", geometryType: "polygon", color: "#1e40af", fillColor: "#3b82f6", fillOpacity: 0.4, weight: 3, minZoom: 12, description: "Recorded subdivision plats — high-contrast colors per subdivision" },
      { key: "historical-district", name: "Historical District", geometryType: "polygon", color: "#b45309", fillColor: "#fcd34d", fillOpacity: 0.15, weight: 2, dashArray: "8 4", description: "Commercial Historic District boundary" },
      { key: "pci", name: "Pavement Condition Index", geometryType: "line", color: "#059669", weight: 4, minZoom: 15, description: "Road pavement condition scores (PCI)" },
      { key: "parcels-one-click", name: "Parcels One Click", geometryType: "polygon", color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.15, weight: 1.5, minZoom: 14, description: "Parcels with zoning, setbacks, ownership, utilities, and ordinance links" },
    ],
  },
  {
    id: "parks-community",
    name: "Parks / Recreation / Community",
    description: "Parks, trails, sidewalks, points of interest, watersheds",
    layers: [
      { key: "parks", name: "Parks", geometryType: "polygon", color: "#16a34a", fillColor: "#86efac", fillOpacity: 0.3, weight: 2, description: "City parks with names and types" },
      { key: "trails", name: "Trails", geometryType: "line", color: "#15803d", weight: 3, dashArray: "6 3", description: "Walking and hiking trail network" },
      { key: "sidewalks", name: "Sidewalks", geometryType: "line", color: "#a3a3a3", weight: 2, minZoom: 16, description: "Sidewalk network with condition and ADA compliance" },
      { key: "points-of-interest", name: "Points of Interest", geometryType: "point", color: "#7c3aed", description: "City Hall, landmarks, and notable locations" },
      { key: "creeks", name: "Creeks", geometryType: "line", color: "#0ea5e9", weight: 3, description: "Creek and waterway network" },
      { key: "watersheds", name: "Watersheds", geometryType: "polygon", color: "#0369a1", fillColor: "#7dd3fc", fillOpacity: 0.1, weight: 2, dashArray: "10 4", description: "Watershed drainage boundaries" },
    ],
  },
  {
    id: "administrative",
    name: "Administrative / Boundaries",
    description: "City limits, ETJ, annexations, utility districts, subdivisions",
    layers: [
      { key: "city-limits", name: "City Limits", geometryType: "polygon", color: "#0d9488", fillOpacity: 0, weight: 3, dashArray: "10 6", description: "Incorporated city limits boundary" },
      { key: "etj", name: "ETJ Boundary", geometryType: "polygon", color: "#9ca3af", fillOpacity: 0, weight: 2, dashArray: "4 4", description: "Extraterritorial jurisdiction boundary" },
      { key: "address-points", name: "911 Address Points", geometryType: "point", color: "#059669", minZoom: 15, description: "911 address point locations (city & county assigned addresses)" },
      { key: "county-addresses", name: "County Addresses", geometryType: "point", color: "#0d9488", minZoom: 15, description: "County address points outside city limits" },
      { key: "parcels", name: "Parcels (CAD)", geometryType: "polygon", color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.1, weight: 2, minZoom: 15, description: "CAD parcel boundaries with property data" },
      { key: "proposed-annexations", name: "Proposed Annexations", geometryType: "polygon", color: "#e11d48", fillColor: "#fda4af", fillOpacity: 0.15, weight: 2, dashArray: "8 4", description: "Areas proposed for annexation into city limits" },
      { key: "settlement-agreements", name: "Settlement / Dev Agreements", geometryType: "polygon", color: "#9333ea", fillColor: "#d8b4fe", fillOpacity: 0.1, weight: 2, description: "ETJ development and settlement agreement areas" },
      { key: "subdivision-review", name: "Subdivision Review Jurisdictions", geometryType: "polygon", color: "#0891b2", fillColor: "#67e8f9", fillOpacity: 0.1, weight: 2, dashArray: "6 4", description: "Areas under subdivision review jurisdiction" },
      { key: "municipal-utility-districts", name: "Municipal Utility Districts", geometryType: "polygon", color: "#7c3aed", fillColor: "#c4b5fd", fillOpacity: 0.1, weight: 2, description: "MUD boundary districts" },
      { key: "road-closures", name: "Road Closures / Disruptions", geometryType: "line", color: "#ef4444", weight: 4, description: "Active road closures and disruptions" },
      { key: "traffic-counts", name: "Traffic Counts", geometryType: "point", color: "#8b5cf6", description: "Traffic count monitoring locations with volume data" },
    ],
  },
];

/**
 * The 10 named view-template presets, production's own ids/names/layer lists
 * verbatim (client/src/components/maps/layerCatalog.ts's VIEW_TEMPLATES) --
 * EXCEPT "default", whose real layer list is
 * ["parcels","zoning","city-limits","etj","permits","violations"]; permits
 * and violations are dropped here, the one preset the permits/violations
 * exclusion touches (checked against every other preset's list -- none of
 * the other nine references permits, violations, or heatmap).
 */
export const VIEW_TEMPLATES = [
  { id: "default", name: "Default View", description: "Parcels, zoning, city boundaries", layers: ["parcels", "zoning", "city-limits", "etj"] },
  { id: "public-safety", name: "Public Safety", description: "Emergency facilities, flood zones, fire stations", layers: ["fire-stations", "critical-facilities", "emergency-service-districts", "fema-flood-zones", "city-limits"] },
  { id: "infrastructure", name: "Infrastructure", description: "Water, wastewater, electrical, storm drainage", layers: ["water-mains", "wastewater", "storm-drainage", "street-lights", "cip-projects", "city-limits"] },
  { id: "planning", name: "Planning & Development", description: "Zoning, future land use, subdivisions, development projects", layers: ["zoning", "future-land-use", "subdivisions", "development-projects", "historical-district", "parcels", "parcels-one-click", "city-limits"] },
  { id: "parks-recreation", name: "Parks & Recreation", description: "Parks, trails, sidewalks, points of interest", layers: ["parks", "trails", "sidewalks", "points-of-interest", "creeks", "city-limits"] },
  { id: "environmental", name: "Environmental", description: "Flood zones, watersheds, creeks", layers: ["fema-flood-zones", "watersheds", "creeks", "parks", "city-limits"] },
  { id: "roads-pavement", name: "Roads & Pavement", description: "Road condition, closures, sidewalks", layers: ["pci", "road-closures", "sidewalks", "city-limits"] },
  { id: "all-boundaries", name: "All Boundaries", description: "City limits, ETJ, MUDs, subdivisions, annexations", layers: ["city-limits", "etj", "proposed-annexations", "settlement-agreements", "subdivisions", "subdivision-review", "municipal-utility-districts"] },
  { id: "emergency-response", name: "Emergency Response", description: "Fire stations, stream gauges, flood zones, low-water crossings, incident management", layers: ["fire-stations", "critical-facilities", "fire-districts", "fema-flood-zones", "live-stream-gauges", "low-water-crossings", "befco-flood-points", "evacuation-routes", "shelters", "incident-points", "road-blocks", "detours", "impacted-areas", "emergency-service-districts", "city-limits"] },
  { id: "parcels-one-click", name: "Parcels One Click", description: "Parcels with zoning, setbacks, ownership, utilities, and ordinance links", layers: ["parcels-one-click", "zoning", "city-limits"] },
];

/** Every layer key across all 7 categories, flattened -- the single source
 *  the server-side allowlist and the client panel both derive from. */
export function getAllLayerKeys() {
  return LAYER_CATALOG.flatMap((cat) => cat.layers.map((l) => l.key));
}

/** One layer's catalog entry (with its category id attached), or undefined. */
export function getLayerConfig(key) {
  for (const cat of LAYER_CATALOG) {
    const found = cat.layers.find((l) => l.key === key);
    if (found) return { ...found, category: cat.id };
  }
  return undefined;
}

/**
 * The default-visible set, production's own rule: everything in
 * VIEW_TEMPLATES[0] ("default"), which is exactly
 * DEFAULT_VISIBLE_LAYERS below (permits/violations already dropped there).
 */
export const DEFAULT_VISIBLE_LAYERS = VIEW_TEMPLATES[0].layers;

export function getDefaultVisibility() {
  const vis = {};
  for (const key of getAllLayerKeys()) vis[key] = DEFAULT_VISIBLE_LAYERS.includes(key);
  return vis;
}

/* ===========================================================================
 * THE SIX STYLED OVERRIDES
 *
 * Ported field-for-field from DevelopmentServicesDashboard.tsx's
 * getZoningStyle/getFluStyle/getPciStyle/getFloodStyle/getSubdivisionStyle/
 * getParcelsOneClickStyle and their color tables. Each takes one GeoJSON
 * Feature and returns a Leaflet path-style object; used both as the `style`
 * option (polygons/lines) and, via styleForLayer below, to color point
 * features through pointToLayer (Leaflet's `style` option is a no-op on
 * point geometries, so a point-typed layer needs its color routed through
 * pointToLayer to render at all -- see web/property-map.js).
 * ======================================================================== */

const ZONING_COLORS = {
  "P-5": { fill: "#9333ea", stroke: "#7e22ce", label: "Core" },
  "P-4": { fill: "#3b82f6", stroke: "#2563eb", label: "Mix" },
  "P-EC": { fill: "#f97316", stroke: "#ea580c", label: "Employment Center" },
  "P-2": { fill: "#22c55e", stroke: "#16a34a", label: "Rural" },
  "PDD": { fill: "#eab308", stroke: "#ca8a04", label: "Planned Development" },
  "P-3": { fill: "#06b6d4", stroke: "#0891b2", label: "General" },
  "P-1": { fill: "#84cc16", stroke: "#65a30d", label: "Natural" },
};

export function getZoningStyle(feature) {
  const placeTypeClass = feature?.properties?.placeTypeClass || "";
  const zoningInfo = ZONING_COLORS[placeTypeClass];
  return {
    color: zoningInfo?.stroke || "#6b7280",
    weight: 2,
    fillColor: zoningInfo?.fill || "#6b7280",
    fillOpacity: 0.35,
  };
}

const FLU_COLORS = {
  "PROFSERV": "#8b5cf6",
  "SFR": "#22c55e",
  "MFR": "#06b6d4",
  "COMMERCIAL": "#f97316",
  "INDUSTRIAL": "#6b7280",
  "PUBLIC": "#3b82f6",
  "OPENSPACE": "#16a34a",
  "MIXED": "#a855f7",
};

export function getFluStyle(feature) {
  const code = feature?.properties?.LANDUSECOD || "";
  const color = FLU_COLORS[code] || "#8b5cf6";
  return { color, weight: 2, fillColor: color, fillOpacity: 0.2 };
}

export function getPciStyle(feature) {
  const pci = parseInt(feature?.properties?.PCIG || feature?.properties?.F2022_PCI || "50", 10);
  let color = "#ef4444";
  if (pci >= 80) color = "#22c55e";
  else if (pci >= 60) color = "#eab308";
  else if (pci >= 40) color = "#f97316";
  return { color, weight: 4, opacity: 0.8 };
}

const FEMA_ZONE_COLORS = {
  "AE_FLOODWAY": { fill: "#7b2d8e", stroke: "#5c1f6e", label: "100-Year Floodway" },
  "AE": { fill: "#9b7bc7", stroke: "#7b5ba7", label: "100-Year Floodplain" },
  "A": { fill: "#b8a0d8", stroke: "#9880b8", label: "100-Year Floodplain" },
  "AO": { fill: "#6e9fd4", stroke: "#4e7fb4", label: "100-Year Floodplain (Shallow)" },
  "VE": { fill: "#1a3a6e", stroke: "#0a2a5e", label: "Coastal 100-Year Floodway" },
  "V": { fill: "#3366b3", stroke: "#1a4a93", label: "Coastal 100-Year Floodplain" },
  "X_500": { fill: "#e8c84a", stroke: "#c8a82a", label: "500-Year Floodplain" },
  "X_MINIMAL": { fill: "#e8985a", stroke: "#c8784a", label: "Outside Special Flood Hazard Area" },
  "D": { fill: "#7abfb0", stroke: "#5a9f90", label: "Undetermined" },
};

export function getFloodZoneKey(feature) {
  const zone = feature?.properties?.FLD_ZONE || "";
  const subtype = (feature?.properties?.ZONE_SUBTY || "").trim();
  if (zone === "AE" && subtype === "FLOODWAY") return "AE_FLOODWAY";
  if (zone === "X" && subtype.includes("0.2")) return "X_500";
  if (zone === "X") return "X_MINIMAL";
  return zone || "X_MINIMAL";
}

export function getFloodStyle(feature) {
  const key = getFloodZoneKey(feature);
  const colors = FEMA_ZONE_COLORS[key] || FEMA_ZONE_COLORS["X_MINIMAL"];
  return { color: colors.stroke, weight: 2, fillColor: colors.fill, fillOpacity: 0.45, opacity: 0.8 };
}

const SUBDIVISION_PALETTE = [
  { fill: "#1e40af", stroke: "#1e3a8a" },
  { fill: "#7c3aed", stroke: "#6d28d9" },
  { fill: "#b91c1c", stroke: "#991b1b" },
  { fill: "#047857", stroke: "#065f46" },
  { fill: "#c2410c", stroke: "#9a3412" },
  { fill: "#0e7490", stroke: "#155e75" },
  { fill: "#7e22ce", stroke: "#6b21a8" },
  { fill: "#be123c", stroke: "#9f1239" },
  { fill: "#0369a1", stroke: "#075985" },
  { fill: "#4338ca", stroke: "#3730a3" },
  { fill: "#15803d", stroke: "#166534" },
  { fill: "#a16207", stroke: "#854d0e" },
  { fill: "#9333ea", stroke: "#7e22ce" },
  { fill: "#dc2626", stroke: "#b91c1c" },
  { fill: "#0284c7", stroke: "#0369a1" },
];

export function getSubdivisionStyle(feature) {
  const name = feature?.properties?.Name || "";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const palette = SUBDIVISION_PALETTE[Math.abs(hash) % SUBDIVISION_PALETTE.length];
  return { color: palette.stroke, weight: 3, fillColor: palette.fill, fillOpacity: 0.45, opacity: 0.9 };
}

const PARCELS_ONE_CLICK_ZONE_COLORS = {
  "SF District": "#3b82f6",
  "GC District": "#f97316",
  "MU District": "#8b5cf6",
  "IND District": "#6366f1",
  "PI District": "#14b8a6",
  "RR District": "#22c55e",
  "Planned development": "#ec4899",
};

export function getParcelsOneClickStyle(feature) {
  const placeType = feature?.properties?.PlaceTypeDesc || "";
  let color = "#94a3b8";
  for (const [key, c] of Object.entries(PARCELS_ONE_CLICK_ZONE_COLORS)) {
    if (placeType.toLowerCase().includes(key.toLowerCase())) {
      color = c;
      break;
    }
  }
  return { color, weight: 1.5, opacity: 0.8, fillColor: color, fillOpacity: 0.15 };
}

/** key -> per-feature style function, the 6 layers production renders with a
 *  style driven by a feature property rather than the catalog's flat swatch. */
export const STYLED_LAYER_FUNCTIONS = {
  "zoning": getZoningStyle,
  "future-land-use": getFluStyle,
  "pci": getPciStyle,
  "fema-flood-zones": getFloodStyle,
  "subdivisions": getSubdivisionStyle,
  "parcels-one-click": getParcelsOneClickStyle,
};

/** Drop undefined-valued keys so a Leaflet style object carries only the
 *  fields the catalog entry actually declared, same as production's own
 *  layerCatalog entries (fillColor/weight/dashArray are simply absent where
 *  the source has none, never guessed). */
function compact(style) {
  const out = {};
  for (const [k, v] of Object.entries(style)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * The one entry point web/property-map.js calls per feature, for any of the
 * 52 layers. The 6 styled layers get their real per-feature function; every
 * other layer gets its catalog entry's flat color/fillColor/fillOpacity/
 * weight/dashArray, unchanged across every feature -- exactly the two
 * rendering modes production itself has (STYLED_LAYERS vs. the catalog's
 * plain swatch).
 */
export function styleForLayer(key, feature) {
  const styled = STYLED_LAYER_FUNCTIONS[key];
  if (styled) return styled(feature);
  const layer = getLayerConfig(key);
  if (!layer) return {};
  return compact({
    color: layer.color,
    fillColor: layer.fillColor,
    fillOpacity: layer.fillOpacity,
    weight: layer.weight,
    dashArray: layer.dashArray,
  });
}
