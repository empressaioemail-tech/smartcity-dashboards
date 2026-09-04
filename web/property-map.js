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

const map = L.map("pm-map", { zoomControl: true }).setView([30.28, -97.5], 9);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

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
