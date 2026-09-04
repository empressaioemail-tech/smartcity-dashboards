/* ------------------------------------------------ property map (client, G-117)

The native property map's own client script, for the one real, tenant-
private city pack this page currently serves. A separate document in its own
iframe (mounted at the map stage, see src/compose.mjs's nativePropertyMapUrl),
so it needs its own copy of two things the parent shell (web/app.js) already
has: the Hauska-key same-origin fetch attachment, and the blank-not-
"undefined" rendering discipline (td()). Both are duplicated here in
miniature rather than imported, because this page is not a module of
web/app.js and does not share its runtime.

REAL VALUES ONLY. Every value rendered onto this page comes straight off the
JSON src/property-map.mjs's composePropertyIntelSummary() returns -- real
zoning text, real flood zone code, real permit/case status -- never mapped
onto an invented taxonomy. A missing value renders as the td() em-dash, never
the literal word "undefined". A status other than "ok" (no_match,
unavailable) is rendered as a real, stated sentence, never silently as an
empty map.
*/

const HAUSKA_KEY_STORAGE = "hauska_key";

function hauskaKey() {
  try {
    return window.localStorage.getItem(HAUSKA_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

const _originalFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const key = hauskaKey();
  const url = typeof input === "string" ? input : input?.url || "";
  const sameOriginApi = url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
  if (!key || !sameOriginApi) return _originalFetch(input, init);
  const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
  headers.set("x-hauska-key", key);
  return _originalFetch(input, { ...init, headers });
};

function cityKeyFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("cityKey") || "";
}

/** Blank rather than the literal word "undefined" for any absent value. */
function td(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/**
 * A real dollar figure from the county CAD record, formatted for reading.
 * null (no lat/lng to value against, or the county simply has none on file)
 * renders the same em-dash as every other absent value here -- never a
 * guessed $0, which this product has never rendered anywhere for a real
 * reason: a $0 on screen is a claim, and this one would be false.
 */
function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function show(id, visible) {
  const el = document.getElementById(id);
  if (el) el.hidden = !visible;
}

const cityKey = cityKeyFromQuery();

/**
 * Same basemap production's own "GIS & Property Intelligence" map uses --
 * Esri's free public World_Dark_Gray_Base tile service (smartcity-os's
 * BASEMAP_OPTIONS, id "dark"), not a generic OSM tile server. maxNativeZoom
 * 16 matches that config exactly; Leaflet upscales past it the same way
 * production's own map does, so this is not a guessed value.
 */
const map = L.map("pm-map", { zoomControl: true }).setView([30.28, -97.5], 9);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  maxNativeZoom: 16,
  attribution: "Tiles &copy; Esri",
}).addTo(map);

/**
 * G-117 follow-up. The four always-on GIS overlay layers this page renders
 * over the CURRENT viewport, independent of the address-search parcel
 * result below -- production's own "GIS & Property Intelligence" map shows
 * these same four (among others out of scope for a property-records page)
 * as always-visible, individually toggleable polygon layers, not a
 * per-parcel color scheme. Real key/color/fillColor/fillOpacity/weight/
 * minZoom values below are copied exactly from smartcity-os's
 * client/src/components/maps/layerCatalog.ts, not approximated -- fillColor
 * and weight are simply absent from that source for "zoning", so they are
 * absent here too rather than guessed (Leaflet's own defaults then apply,
 * same as production's rendering of that entry).
 */
const OVERLAY_LAYERS = [
  { key: "zoning", label: "Zoning Districts", minZoom: 14, style: { color: "#7c3aed", fillOpacity: 0.35 } },
  {
    key: "future-land-use",
    label: "Future Land Use",
    minZoom: 13,
    style: { color: "#8b5cf6", fillColor: "#c4b5fd", fillOpacity: 0.2, weight: 2 },
  },
  {
    key: "subdivisions",
    label: "Subdivisions / Final Plats",
    minZoom: 12,
    style: { color: "#1e40af", fillColor: "#3b82f6", fillOpacity: 0.4, weight: 3 },
  },
  {
    key: "parcels-one-click",
    label: "Parcels One Click",
    minZoom: 14,
    style: { color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.15, weight: 1.5 },
  },
];

/** Literal getElementById calls, one per real checkbox in property-map.html. */
const overlayCheckboxes = {
  "zoning": document.getElementById("pm-layer-zoning"),
  "future-land-use": document.getElementById("pm-layer-future-land-use"),
  "subdivisions": document.getElementById("pm-layer-subdivisions"),
  "parcels-one-click": document.getElementById("pm-layer-parcels-one-click"),
};

const overlayGroups = {}; // key -> the L.geoJSON instance currently on the map, or null
const overlayGeneration = {}; // key -> a counter guarding against a slow, now-superseded fetch clobbering a newer one for the same key

const layersControlEl = document.getElementById("pm-layers");
if (layersControlEl) {
  // Without these, dragging or scrolling to interact with the checkbox list
  // pans/zooms the map underneath it -- the control sits inside #pm-map on
  // purpose (top-right overlay, see property-map.css), so it has to opt out
  // of the map's own drag/scroll handling explicitly.
  L.DomEvent.disableClickPropagation(layersControlEl);
  L.DomEvent.disableScrollPropagation(layersControlEl);
}

function overlayVisible(key) {
  const box = overlayCheckboxes[key];
  return !box || box.checked;
}

function removeOverlayLayer(key) {
  if (overlayGroups[key]) {
    map.removeLayer(overlayGroups[key]);
    overlayGroups[key] = null;
  }
}

function setLayersStatus(text) {
  const el = document.getElementById("pm-layers-status");
  if (el) el.textContent = text;
}

/**
 * One layer's fetch+render, guarded by the SAME minZoom restraint
 * production's own map uses (layerCatalog.ts): below minZoom the layer is
 * removed from the map and NOTHING is fetched -- not silently left stale,
 * not requested at a payload size nobody asked for. Returns a small status
 * descriptor so callers can compose an honest aggregate message rather than
 * each guessing at the others' state.
 */
async function refreshOverlayLayer(layerDef) {
  const { key, minZoom, style } = layerDef;
  if (!overlayVisible(key)) {
    removeOverlayLayer(key);
    return { key, state: "hidden" };
  }
  if (map.getZoom() < minZoom) {
    removeOverlayLayer(key);
    return { key, state: "below-min-zoom" };
  }

  const bounds = map.getBounds();
  const params = new URLSearchParams({
    cityKey,
    key,
    xmin: String(bounds.getWest()),
    ymin: String(bounds.getSouth()),
    xmax: String(bounds.getEast()),
    ymax: String(bounds.getNorth()),
  });

  const generation = (overlayGeneration[key] || 0) + 1;
  overlayGeneration[key] = generation;

  let data;
  try {
    const res = await fetch(`/api/property-map/layers?${params}`);
    data = await res.json();
  } catch (err) {
    data = { status: "unavailable", basis: `request failed: ${err.message}` };
  }

  // A slower, now-superseded response for this same key must never clobber
  // a later one -- only the most recently issued fetch for a given key is
  // allowed to touch the map.
  if (overlayGeneration[key] !== generation) return { key, state: "stale" };

  if (!data || data.status !== "ok" || !data.found || !data.result) {
    removeOverlayLayer(key);
    return { key, state: "unavailable", basis: (data && data.basis) || "layer not read" };
  }

  removeOverlayLayer(key);
  overlayGroups[key] = L.geoJSON(data.result, { style }).addTo(map);
  return { key, state: "ok" };
}

/**
 * Refreshes all four layers for the current viewport and composes one
 * honest status line out of the real per-layer outcomes -- a real error
 * basis takes priority; otherwise, if every visible layer is below its own
 * minZoom, a real "zoom in" hint; otherwise blank (nothing wrong to say).
 */
async function refreshOverlayLayers() {
  const results = await Promise.all(OVERLAY_LAYERS.map((layerDef) => refreshOverlayLayer(layerDef)));
  const failed = results.find((r) => r.state === "unavailable");
  if (failed) {
    setLayersStatus(`Not read: ${failed.basis}`);
    return;
  }
  const active = results.filter((r) => r.state !== "hidden" && r.state !== "stale");
  if (active.length > 0 && active.every((r) => r.state === "below-min-zoom")) {
    setLayersStatus("Zoom in to see layer boundaries.");
    return;
  }
  setLayersStatus("");
}

/**
 * Debounced -- panning/zooming fires moveend/zoomend many times in a row
 * (a fast pan, a scroll-wheel zoom), and only the settled viewport is worth
 * a request. map.fitBounds() (renderParcel, below) also fires these events,
 * so a successful address search refreshes the overlay layers for the new
 * view automatically, with no separate wiring.
 */
let overlayRefreshTimer = null;
function scheduleOverlayRefresh() {
  if (overlayRefreshTimer) clearTimeout(overlayRefreshTimer);
  overlayRefreshTimer = setTimeout(() => {
    overlayRefreshTimer = null;
    refreshOverlayLayers();
  }, 400);
}

map.on("moveend zoomend", scheduleOverlayRefresh);

for (const layerDef of OVERLAY_LAYERS) {
  const box = overlayCheckboxes[layerDef.key];
  if (box) {
    // A checkbox toggle is one deliberate action, not a spam of intermediate
    // frames -- refreshes just the one layer it controls, not a debounced
    // refetch of all four.
    box.addEventListener("change", () => refreshOverlayLayer(layerDef));
  }
}

// Initial draw for the default view -- honest either way: at the default
// city-wide zoom (9), every layer is below its own minZoom (12-14), so this
// resolves to the same "Zoom in to see layer boundaries." message a real
// user would see, with no wasted fetch.
refreshOverlayLayers();

let parcelLayer = null;

function renderParcel(geometry) {
  if (parcelLayer) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
  }
  if (!geometry) return;
  parcelLayer = L.geoJSON(geometry, {
    style: { color: "#4f9dff", weight: 2, fillOpacity: 0.15 },
  }).addTo(map);
  const bounds = parcelLayer.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { maxZoom: 18, padding: [24, 24] });
}

function renderList(id, items, renderItem) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = "";
  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "pm-empty";
    li.textContent = "None on record.";
    el.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "pm-item";
    li.textContent = renderItem(item);
    el.appendChild(li);
  }
}

function clearResult() {
  renderParcel(null);
  show("pm-summary-section", false);
  show("pm-valuation-section", false);
  show("pm-risks-section", false);
  show("pm-permits-section", false);
  show("pm-violations-section", false);
  show("pm-inspections-section", false);
}

function renderFound(result) {
  show("pm-summary-section", true);
  setText("pm-address", td(result.snapshot.address || result.match?.address));
  setText("pm-owner", td(result.snapshot.owner));
  setText("pm-parcel-id", td(result.snapshot.parcelId));
  setText("pm-zoning", td(result.snapshot.zoning));
  setText("pm-flood", td(result.snapshot.floodZone));
  setText("pm-acreage", td(result.snapshot.acreage));
  setText("pm-subdivision", td(result.snapshot.subdivision));
  const lotBlock = [result.snapshot.lot, result.snapshot.block].filter(Boolean).join(" / ");
  setText("pm-lot-block", td(lotBlock));
  setText("pm-legal-desc", td(result.snapshot.legalDesc));
  setText("pm-future-land-use", td(result.snapshot.futureLandUse));
  show("pm-parcel-note", !result.parcel.found);

  renderParcel(result.parcel.found ? result.parcel.geometry : null);

  const valuation = result.snapshot.valuation;
  const hasValuation = valuation && Object.values(valuation).some((v) => v !== null && v !== undefined);
  show("pm-valuation-section", hasValuation);
  if (hasValuation) {
    setText("pm-appraised-value", money(valuation.appraisedValue));
    setText("pm-market-value", money(valuation.marketValue));
    setText("pm-land-value", money(valuation.landValue));
    setText("pm-improvement-value", money(valuation.improvementValue));
    setText("pm-year-built", td(valuation.yearBuilt));
    setText("pm-living-area", valuation.livingArea != null ? `${valuation.livingArea} sq ft` : "—");
  }

  show("pm-risks-section", true);
  renderList("pm-risks-list", result.risks, (risk) => `${td(risk.label)} — ${td(risk.detail)}`);

  show("pm-permits-section", true);
  renderList("pm-permits-list", result.permits, (p) => `${td(p.permitNumber)} — ${td(p.type)} — ${td(p.status)}`);

  show("pm-violations-section", true);
  renderList("pm-violations-list", result.violations, (v) => `${td(v.caseNumber)} — ${td(v.type)} — ${td(v.status)}`);

  show("pm-inspections-section", true);
  renderList("pm-inspections-list", result.inspections, (i) => `${td(i.permitNumber)} — ${td(i.type)} — ${td(i.status)}`);
}

function renderResult(data) {
  const statusEl = document.getElementById("pm-status");
  if (!statusEl) return;

  if (data && data.status === "ok" && data.found && data.result) {
    statusEl.textContent = `Matched: ${td(data.result.match?.address)}`;
    renderFound(data.result);
    return;
  }

  clearResult();

  if (data && data.status === "no_match") {
    statusEl.textContent = data.basis || "No address match found.";
    return;
  }

  // Honest not-read state -- a real basis string, never a silent blank map.
  statusEl.textContent = `Not read: ${td(data && data.basis)}`;
}

async function search(address) {
  const statusEl = document.getElementById("pm-status");
  if (statusEl) statusEl.textContent = "Searching…";
  const params = new URLSearchParams({ address, cityKey });
  let data;
  try {
    const res = await fetch(`/api/property-map/summary?${params}`);
    data = await res.json();
  } catch (err) {
    data = { status: "unavailable", basis: `request failed: ${err.message}` };
  }
  renderResult(data);
}

const form = document.getElementById("pm-search-form");
if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("pm-address-input");
    const address = (input && input.value ? input.value : "").trim();
    if (!address) return;
    search(address);
  });
}
