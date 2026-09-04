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

/**
 * G-117 full-parity follow-up. The shared 52-layer catalog (colors,
 * categories, minZoom, the 6 styled-override functions, the 10 view
 * templates), served plainly at /property-map-catalog.mjs -- see
 * src/property-map-catalog.mjs's own header for why this is a real import
 * rather than a second, hand-duplicated copy of 52 layer definitions here.
 */
import {
  LAYER_CATALOG,
  VIEW_TEMPLATES,
  getAllLayerKeys,
  getDefaultVisibility,
  styleForLayer,
} from "/property-map-catalog.mjs";

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
 * G-117 full-parity follow-up. All 52 toggleable GIS overlay layers this
 * page can render over the CURRENT viewport, independent of the
 * address-search parcel result below -- production's own "GIS & Property
 * Intelligence" map shows the same catalog (minus its MyGov-backed
 * "overlays" category: permits/violations/heatmap, a different source/shape,
 * out of scope for this GIS-layer effort) as individually toggleable
 * layers grouped into 7 categories. Real key/name/category/color/fillColor/
 * fillOpacity/weight/dashArray/minZoom values all come from the shared
 * catalog module (src/property-map-catalog.mjs), copied exactly from
 * smartcity-os's client/src/components/maps/layerCatalog.ts, not
 * approximated here a second time.
 */
const ALL_LAYERS = LAYER_CATALOG.flatMap((cat) => cat.layers);
const ALL_LAYER_KEYS = getAllLayerKeys();

/**
 * key -> boolean. Starts at production's own default template (parcels,
 * zoning, city-limits, etj -- permits/violations dropped, out of scope; see
 * DEFAULT_VISIBLE_LAYERS's own header in property-map-catalog.mjs) and is
 * mutated in place by checkbox toggles, per-category show/hide-all, and
 * view-template presets -- never re-derived from the DOM, so it stays the
 * single source of truth refreshOverlayLayers() reads.
 */
const layerVisibility = getDefaultVisibility();

const overlayGroups = {}; // key -> the L.geoJSON instance currently on the map, or null
const overlayGeneration = {}; // key -> a counter guarding against a slow, now-superseded fetch clobbering a newer one for the same key

/**
 * Per-layer row bookkeeping, populated once by buildLayersPanel() below.
 * Deliberately NOT addressed by id -- the checkbox element itself is held
 * here directly, keyed by the layer's own catalog key, rather than assigned
 * a DOM id and re-found later through getElementById. 52 dynamically
 * created rows would otherwise be 52 ids no served script may create
 * (src/addressability.test.mjs's CREATED-ids gate asserts that set stays
 * empty today), so this keeps that gate meaningful rather than widening it.
 */
const layerRows = []; // { key, name, description, minZoom, checkbox, rowEl, zoomWarnEl }
const categoryInfos = []; // { id, name, wrapperEl, headerEl, bodyEl, toggleBtn, countEl, collapsed, layers }
let currentSearchQuery = "";

const layersControlEl = document.getElementById("pm-layers");
if (layersControlEl) {
  // Without these, dragging or scrolling to interact with the layers panel
  // pans/zooms the map underneath it -- the control sits inside #pm-map on
  // purpose (top-right overlay, see property-map.css), so it has to opt out
  // of the map's own drag/scroll handling explicitly.
  L.DomEvent.disableClickPropagation(layersControlEl);
  L.DomEvent.disableScrollPropagation(layersControlEl);
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
 *
 * Styled with styleForLayer(key, feature) -- a PER-FEATURE function, not a
 * flat object, so the 6 layers production drives off a feature property
 * (zoning, future-land-use, fema-flood-zones, subdivisions,
 * parcels-one-click, pci) render with their real color buckets while every
 * other layer gets its catalog entry's flat swatch, unchanged either way.
 * pointToLayer routes that same per-feature color through a circle marker
 * for point-geometry layers -- Leaflet's `style` option is a no-op on
 * points, so a fire hydrant or fire station would otherwise render with
 * Leaflet's default blue-pin icon regardless of its real catalog color.
 */
async function refreshOverlayLayer(layerDef) {
  const { key, minZoom } = layerDef;
  if (!layerVisibility[key]) {
    removeOverlayLayer(key);
    return { key, state: "hidden" };
  }
  if (minZoom != null && map.getZoom() < minZoom) {
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
  overlayGroups[key] = L.geoJSON(data.result, {
    style: (feature) => styleForLayer(key, feature),
    pointToLayer: (feature, latlng) => {
      const s = styleForLayer(key, feature);
      return L.circleMarker(latlng, {
        radius: 6,
        color: s.color || "#3b82f6",
        fillColor: s.fillColor || s.color || "#3b82f6",
        fillOpacity: s.fillOpacity != null ? s.fillOpacity : 0.8,
        weight: s.weight != null ? s.weight : 2,
      });
    },
  }).addTo(map);
  return { key, state: "ok" };
}

/**
 * Refreshes every one of the 52 catalog layers for the current viewport
 * (each still gated by its own visibility + minZoom inside
 * refreshOverlayLayer, so only checked-on, in-zoom layers ever reach the
 * network) and composes one honest status line out of the real per-layer
 * outcomes -- a real error basis takes priority; otherwise, if every visible
 * layer is below its own minZoom, a real "zoom in" hint; otherwise blank
 * (nothing wrong to say). Same aggregation rule the original 4-layer
 * mechanism used, just driven by the full catalog instead of a 4-entry
 * array.
 */
async function refreshOverlayLayers() {
  const results = await Promise.all(ALL_LAYERS.map((layerDef) => refreshOverlayLayer(layerDef)));
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

/**
 * Updates the per-row "zoom in to see this layer" indicator, immediately on
 * every zoomend (not debounced -- this is a cheap DOM-only update, unlike
 * the network refresh above) -- matches production's LayerManager.tsx own
 * UX signal (isLayerBelowMinZoom): dim + a real "Zoom in to z{n}+" line,
 * shown only for a layer that is both checked on AND below its own minZoom.
 */
function updateZoomWarnings() {
  const zoom = map.getZoom();
  for (const row of layerRows) {
    const below = row.minZoom != null && zoom < row.minZoom;
    const show = below && layerVisibility[row.key];
    row.zoomWarnEl.hidden = !show;
    row.rowEl.classList.toggle("pm-layers-row-dim", show);
  }
}
map.on("zoomend", updateZoomWarnings);

/** The total-active and per-category-active counts shown in the panel. */
function updateActiveCount() {
  const countEl = document.getElementById("pm-layers-count");
  if (countEl) {
    const total = ALL_LAYER_KEYS.filter((k) => layerVisibility[k]).length;
    countEl.textContent = `${total} active`;
  }
  for (const cat of categoryInfos) {
    const active = cat.layers.filter((l) => layerVisibility[l.key]).length;
    cat.countEl.textContent = `${active}/${cat.layers.length}`;
  }
}

/**
 * Sets layerVisibility to EXACTLY the given key set (every other catalog
 * key goes false), syncs every checkbox to match, and refreshes the map.
 * The one function behind per-category show-all/hide-all and every
 * view-template preset button -- each just computes a different target set.
 */
function applyVisibility(targetKeys) {
  for (const key of ALL_LAYER_KEYS) layerVisibility[key] = targetKeys.has(key);
  for (const row of layerRows) row.checkbox.checked = layerVisibility[row.key];
  updateActiveCount();
  updateZoomWarnings();
  refreshOverlayLayers();
}

/** Shows/hides a category's rows against the current search query, and
 *  collapses/expands its body -- search always wins over a manual collapse
 *  while a query is active, so a match is never hidden by a stale toggle. */
function renderCategoryVisibility(catInfo) {
  const q = currentSearchQuery;
  let anyMatch = false;
  for (const row of catInfo.layers) {
    const haystack = `${row.name} ${row.description}`.toLowerCase();
    const match = !q || haystack.includes(q);
    row.rowEl.hidden = !match;
    if (match) anyMatch = true;
  }
  catInfo.wrapperEl.hidden = !anyMatch;
  catInfo.bodyEl.hidden = q ? !anyMatch : catInfo.collapsed;
}

function setCategoryCollapsed(catInfo, collapsed) {
  catInfo.collapsed = collapsed;
  catInfo.toggleBtn.textContent = `${collapsed ? "▸" : "▾"} ${catInfo.name}`;
  renderCategoryVisibility(catInfo);
}

/** Builds the 10 view-template preset buttons (production's own
 *  VIEW_TEMPLATES, layerCatalog.ts) -- each just calls applyVisibility with
 *  that preset's real layer list. */
function buildTemplatesPanel() {
  const container = document.getElementById("pm-layers-templates");
  if (!container) return;
  for (const template of VIEW_TEMPLATES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pm-layers-template";
    btn.textContent = template.name;
    btn.title = template.description;
    btn.addEventListener("click", () => applyVisibility(new Set(template.layers)));
    container.appendChild(btn);
  }
}

/**
 * Builds the categorized, searchable layer panel: 7 category sections
 * (production's own LAYER_CATALOG order), each with a collapse toggle, a
 * show-all/hide-all pair, and one row per layer -- a real checkbox, a color
 * swatch in that layer's own catalog color, the layer's name, and a
 * (normally hidden) minZoom warning line. No id is ever assigned to any of
 * these elements; every reference is held directly in layerRows/
 * categoryInfos instead.
 */
function buildLayersPanel() {
  const container = document.getElementById("pm-layers-categories");
  if (!container) return;
  container.textContent = "";

  for (const cat of LAYER_CATALOG) {
    const wrapperEl = document.createElement("div");
    wrapperEl.className = "pm-layers-category";

    const headerEl = document.createElement("div");
    headerEl.className = "pm-layers-category-head";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "pm-layers-category-toggle";
    toggleBtn.textContent = `▾ ${cat.name}`;

    const countEl = document.createElement("span");
    countEl.className = "pm-layers-category-count";

    const showAllBtn = document.createElement("button");
    showAllBtn.type = "button";
    showAllBtn.className = "pm-layers-link";
    showAllBtn.textContent = "Show all";

    const hideAllBtn = document.createElement("button");
    hideAllBtn.type = "button";
    hideAllBtn.className = "pm-layers-link";
    hideAllBtn.textContent = "Hide all";

    headerEl.append(toggleBtn, countEl, showAllBtn, hideAllBtn);

    const bodyEl = document.createElement("ul");
    bodyEl.className = "pm-layers-list";

    const catInfo = { id: cat.id, name: cat.name, wrapperEl, headerEl, bodyEl, toggleBtn, countEl, collapsed: false, layers: [] };

    for (const layer of cat.layers) {
      const li = document.createElement("li");
      li.className = "pm-layers-item";

      const label = document.createElement("label");
      label.className = "pm-layers-label";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!layerVisibility[layer.key];

      const swatch = document.createElement("span");
      swatch.className = "pm-layers-swatch";
      swatch.style.background = layer.color;

      const nameEl = document.createElement("span");
      nameEl.className = "pm-layers-name";
      nameEl.textContent = layer.name;

      const zoomWarnEl = document.createElement("span");
      zoomWarnEl.className = "pm-layers-zoomwarn";
      zoomWarnEl.textContent = layer.minZoom != null ? `Zoom in to z${layer.minZoom}+` : "";
      zoomWarnEl.hidden = true;

      label.append(checkbox, swatch, nameEl, zoomWarnEl);
      li.appendChild(label);
      bodyEl.appendChild(li);

      const rowInfo = {
        key: layer.key,
        name: layer.name,
        description: layer.description || "",
        minZoom: layer.minZoom,
        checkbox,
        rowEl: li,
        zoomWarnEl,
      };
      layerRows.push(rowInfo);
      catInfo.layers.push(rowInfo);

      // A checkbox toggle is one deliberate action, not a spam of
      // intermediate frames -- refreshes just the one layer it controls,
      // not a debounced refetch of all 52.
      checkbox.addEventListener("change", () => {
        layerVisibility[layer.key] = checkbox.checked;
        updateActiveCount();
        updateZoomWarnings();
        refreshOverlayLayer(layer);
      });
    }

    toggleBtn.addEventListener("click", () => setCategoryCollapsed(catInfo, !catInfo.collapsed));
    showAllBtn.addEventListener("click", () => {
      const target = new Set(ALL_LAYER_KEYS.filter((k) => layerVisibility[k]));
      for (const l of cat.layers) target.add(l.key);
      applyVisibility(target);
    });
    hideAllBtn.addEventListener("click", () => {
      const drop = new Set(cat.layers.map((l) => l.key));
      const target = new Set(ALL_LAYER_KEYS.filter((k) => layerVisibility[k] && !drop.has(k)));
      applyVisibility(target);
    });

    wrapperEl.append(headerEl, bodyEl);
    container.appendChild(wrapperEl);
    categoryInfos.push(catInfo);
  }
}

const layersSearchEl = document.getElementById("pm-layers-search");
if (layersSearchEl) {
  layersSearchEl.addEventListener("input", () => {
    currentSearchQuery = layersSearchEl.value.trim().toLowerCase();
    for (const cat of categoryInfos) renderCategoryVisibility(cat);
  });
}

buildTemplatesPanel();
buildLayersPanel();
updateActiveCount();
updateZoomWarnings();

// Initial draw for the default view -- honest either way: refreshOverlayLayers
// composes its status line from whatever the real per-layer outcomes are,
// with no assumption baked in about which default-visible layer is above or
// below its own minZoom at the starting city-wide zoom.
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
