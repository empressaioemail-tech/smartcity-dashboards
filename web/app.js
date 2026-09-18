import { resolveStaffMapQuery } from "/staff-map.mjs";
import {
  LENS_LABELS,
  TAB_LABELS,
  WORK_LABELS,
  resolveStaffLensQuery,
  surfaceTitle,
} from "/staff-review.mjs";
import {
  THEME_STORAGE_KEY,
  nextTheme,
  resolveTheme,
  themeToggleLabel,
  themeToggleTitle,
} from "/theme.mjs";

/**
 * G-116. Real Hauska tenant-key bootstrap, for real (tenant-private) city
 * packs. No login UI exists yet -- real staff auth is a named,
 * deliberately-unbuilt future item (src/shell-state.mjs, badged "Not
 * built") -- this is the smallest bridge to let an already-issued Hauska
 * key reach this browser's API calls, not a login system.
 *
 * A ?hauskaKey=... query param seeds localStorage once, then the browser
 * drops the param from the visible URL/history via replaceState (so the
 * raw key doesn't linger past the one load that set it); every same-origin
 * /api/ fetch after that carries the header from localStorage. Nothing
 * changes for any public-free demo pack: no key is ever set for one, and
 * this wrapper is a no-op when localStorage holds nothing.
 */
const HAUSKA_KEY_STORAGE = "hauska_key";
(function bootstrapHauskaKey() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("hauskaKey");
    if (fromUrl) {
      window.localStorage.setItem(HAUSKA_KEY_STORAGE, fromUrl);
      params.delete("hauskaKey");
      const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", clean);
    }
  } catch {
    // localStorage unavailable (private browsing, etc.) -- the key simply
    // won't attach; every existing public-free pack call is unaffected.
  }
})();

const _originalFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  let key = "";
  try {
    key = window.localStorage.getItem(HAUSKA_KEY_STORAGE) || "";
  } catch {
    key = "";
  }
  const url = typeof input === "string" ? input : input?.url || "";
  const sameOriginApi = url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
  if (!key || !sameOriginApi) return _originalFetch(input, init);
  const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
  headers.set("x-hauska-key", key);
  return _originalFetch(input, { ...init, headers });
};

/*
  G-95. The three label maps that used to live here now live in
  src/staff-review.mjs, and they moved rather than being copied.

  The document title has to name the surface (2.4.2), and three readers need
  that name: this file, the inline head script in web/index.html, and the CI
  accessibility gate. A fourth copy here would have made the chrome and the
  title able to disagree about what a surface is called - the crumb saying
  Licenses while the title said Development services - which is the CTRL-1
  shape this repo has already paid for. The head script's copy is forced (an
  importing script is a module, a module is deferred, and that is the G-89
  defect) and src/first-paint.test.mjs holds it equal.
*/

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

/**
 * Show or hide an element.
 *
 * The hidden attribute alone does not work on this kit. web/shell.css gives
 * .pill, .prov and .state an explicit display, and an author display rule beats
 * the user-agent [hidden] rule, so `el.hidden = true` on any of them is inert.
 * The stage learned this already and patched it one component at a time
 * (.stage[hidden] and .stage-esc[hidden] in shell.css); everything else stayed
 * broken, which is why the Overview meetings panel shipped an amber Partial pill
 * beside the words "no meeting packet has been read".
 *
 * The right fix is one [hidden] rule in the kit. That file belongs to another
 * lane on this wave, so this keeps the attribute honest for anything reading the
 * DOM and forces the display alongside it.
 */
function show(el, on) {
  if (!el) return;
  el.hidden = !on;
  el.style.display = on ? "" : "none";
}

/* --------------------------------------------------------------- identity

The chrome follows the pack. Every surface that names the city reads one
resolved identity: the top bar name and state suffix, the seal, the environment
badge on the top bar and in the Compass sheet, the document title, the Compass
scope, the nav footer figure, and every breadcrumb and absence basis that names
a pack.

Two attributes carry it. [data-pack-name] takes the pack's displayName and
[data-pack-key] takes its cityKey, so a surface added later opts in by markup
rather than by remembering to add an id here.

This file carries NO fallback city vocabulary of its own. Before the pack
resolves, the fallback IS the static markup, and currentPackName reads it back
out of the DOM. One rule, one implementation: src/city-identity.mjs declares the
allowed fallback vocabulary and a test holds web/index.html to it.
*/

function currentPackName() {
  const el = document.querySelector(".brandcity [data-pack-name]");
  return el ? el.textContent.trim() : "";
}

/** The view label applyLens resolved, so the scope line can be re-rendered. */
let viewLabel = "";
/** The surface the screen is currently painting, kept so the document title can
 *  be recomposed when the pack identity resolves. Initialised to the resolver's
 *  own answer for this URL, so a title composed before applyLens has run names
 *  the same surface the head script already stamped. */
let currentSurface = resolveStaffLensQuery(window.location.search);

function renderScope() {
  setText("cp-source-scope", `${currentPackName()} · ${viewLabel}`);
}

/**
 * G-120. Connections promotes to the top of Overview's content stack while a
 * pack reads no sources, carrying a lead paragraph that explains the quiet,
 * and demotes to the bottom once the pack is actually connected to something
 * - so a zero-record city reads as "here is what to connect next" rather
 * than as a broken page.
 *
 * Keyed on "granted" (src/city-identity.mjs packSources()), not
 * "demonstrated". Measured at source rather than assumed: the product's own
 * public demo pack carries granted 0 but demonstrated a positive count
 * (generatesFixtures true) - it is a DEMO pack, not the honest-empty one, and
 * a second shipped pack is granted 0 and demonstrated 0 on purpose so the
 * empty states stay reachable. Every other figure on this page - the metric
 * tiles, the across-departments grid, this same panel's own row pills -
 * answers "is a real source connected", off grantedAdapters, and is honestly
 * "Not read"/"no source connected" on the demo pack regardless of its
 * generated fixture records. Keying this panel's placement on "demonstrated"
 * would have demoted Connections there while every sibling panel on the same
 * load still read empty - a page that visibly disagreed with itself.
 * "Granted" is the one figure every honest-empty claim on Overview already
 * shares, so promotion tracks it too.
 */
function placeOverviewConnections(sources) {
  const panel = document.getElementById("overview-connections");
  const lead = document.getElementById("overview-connections-lead");
  if (!panel) return;
  const total = Number(sources?.total) || 0;
  const granted = Number(sources?.granted) || 0;
  setText("overview-connections-count", `${granted} of ${total}`);
  const connected = granted > 0;
  if (lead) show(lead, !connected);
  const stack = panel.parentElement;
  if (!stack) return;
  if (connected) {
    const register = document.getElementById("overview-source-register");
    if (register && panel.nextElementSibling !== register) stack.insertBefore(panel, register);
  } else {
    const metrics = document.getElementById("overview-metrics");
    if (metrics && metrics.nextElementSibling !== panel) stack.insertBefore(panel, metrics.nextElementSibling);
  }
}

function applyIdentity(identity) {
  if (!identity) return;
  const name = String(identity.displayName || "").trim();
  const key = String(identity.cityKey || "").trim();
  if (name) {
    for (const el of document.querySelectorAll("[data-pack-name]")) el.textContent = name;
  }
  if (key) {
    for (const el of document.querySelectorAll("[data-pack-key]")) el.textContent = key;
    const shell = document.getElementById("app-shell");
    if (shell) shell.dataset.cityKey = key;
  }
  setText("city-seal", identity.seal || "");

  /**
   * No pack carries a jurisdiction today, so the suffix is absent rather than
   * asserting a state for a city that is nowhere. identity.stateBasis states why.
   */
  const stateEl = document.getElementById("brand-state");
  if (stateEl) {
    const code = String(identity.stateCode || "").trim();
    stateEl.textContent = code ? `· ${code}` : "";
    show(stateEl, Boolean(code));
  }

  /**
   * Labelling gate item 1: the badge reads Demo on any pack whose records are
   * generated, and a pack that is not demo does not render Demo. Both badges
   * read the one resolved value, so they cannot diverge into two careful edits.
   */
  for (const id of ["env-badge", "cp-env-badge"]) {
    const badge = document.getElementById(id);
    if (!badge) continue;
    badge.textContent = identity.environmentBadge || "";
    badge.classList.toggle("demo", identity.isDemo === true);
  }

  /**
   * The footer figures are about the pack being viewed, and each counting rule
   * travels beside its own figure. The register's product-wide figure stays on
   * Connections.
   *
   * G-93: granted and demonstrated are separate claims and are rendered
   * separately. Neither number is computed here - both arrive resolved from
   * src/city-identity.mjs, so there is one implementation of each rule.
   */
  const sources = identity.sources || {};
  if (sources.label) setText("nav-sources", sources.label);
  if (sources.rule) setText("nav-sources-rule", sources.rule);
  if (sources.demonstratedLabel) setText("nav-demonstrated", sources.demonstratedLabel);
  if (sources.demonstratedRule) setText("nav-demonstrated-rule", sources.demonstratedRule);
  placeOverviewConnections(sources);

  /**
   * G-95, 2.4.2 Page Titled. The pack-level title is the TAIL, never the whole
   * title: the surface name is what distinguishes twenty-three pages that all
   * belong to one city, and it is stamped at first paint by the head script so
   * it is never late. What arrives here is the city, which cannot be known
   * before the pack reads and which this product does not assert unread.
   */
  if (identity.documentTitle) document.title = surfaceTitle(currentSurface, identity.documentTitle);
  renderScope();
}

async function loadIdentity(cityKey) {
  const key = String(cityKey || "").trim();
  let identity = null;
  try {
    const q = key ? `?cityKey=${encodeURIComponent(key)}` : "";
    const res = await fetch(`/api/city-identity${q}`);
    identity = res.ok ? (await res.json()).identity : null;
  } catch {
    identity = null;
  }
  /**
   * A failed read leaves the chrome on its fallback, which names no city, and
   * states the absence with its basis instead of leaving a figure standing.
   */
  if (!identity) {
    setText("nav-sources-rule", `pack identity did not read for ${key || "the default pack"}`);
    setText("nav-demonstrated-rule", `pack identity did not read for ${key || "the default pack"}`);
    return;
  }
  applyIdentity(identity);
}

/* ------------------------------------------------------------------ motion */

/**
 * Spring sampled into a linear() easing. 30b names one spring for the whole
 * system (stiffness 320, damping 32, mass 0.9) and 30c makes the shared-element
 * transition the single named exception to the 180ms cap. Everything that grows
 * from a control reuses this; nothing introduces a second easing.
 */
function springEase(k, c, m, steps) {
  const w0 = Math.sqrt(k / m);
  const z = c / (2 * Math.sqrt(k * m));
  const wd = w0 * Math.sqrt(Math.max(1 - z * z, 1e-6));
  const dur = (7 / (z * w0)) * 1000;
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * (dur / 1000);
    const x = 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
    out.push(Math.round(x * 10000) / 10000);
  }
  return { easing: `linear(${out.join(",")})`, duration: Math.round(dur) };
}

const SPRING = springEase(320, 32, 0.9, 60);
const CONTENT_FADE_AT = 0.35;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function motionDuration() {
  return reducedMotion() ? 0 : SPRING.duration;
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/* ------------------------------------------------------------------ stages */

/**
 * A mount stage is one persistent iframe positioned over whichever anchor is
 * currently on screen. It lives outside .cp-recede on purpose: a transformed or
 * filtered ancestor would break position: fixed, and reparenting the iframe to
 * grow it would reload the mounted product. The iframe is created once, never
 * moved in the DOM, and never resized by a layout change it did not ask for.
 */
const OFFSCREEN = -100000;

class MountStage {
  constructor(name, { label, radiusCollapsed, radiusOpen }) {
    this.name = name;
    this.label = label;
    this.el = document.getElementById(`${name}-stage`);
    this.frame = this.el ? this.el.querySelector("iframe") : null;
    this.state = "collapsed";
    this.anchor = null;
    this.animation = null;
    this.radiusCollapsed = radiusCollapsed;
    this.radiusOpen = radiusOpen;
    this.mounted = false;
  }

  mount(src) {
    if (!this.frame || !src || this.frame.dataset.src === src) return;
    this.frame.dataset.src = src;
    this.frame.src = src;
    this.mounted = true;
    if (this.el) this.el.hidden = false;
  }

  /** The visible anchor for this stage, or null when no view shows one. */
  findAnchor() {
    const anchors = document.querySelectorAll(`[data-stage="${this.name}"]`);
    for (const el of anchors) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) return el;
    }
    return null;
  }

  /** Destination rect for the current state. */
  targetRect() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (this.state === "max") {
      /**
       * Read the frame from layout, not from a bounding rect. The receding
       * surface is scaled while a stage is open, which inflates every rect
       * measured through it and would drift maximize by a few pixels a time.
       */
      const nav = document.querySelector(".shell-nav");
      const navShown = nav && getComputedStyle(nav).display !== "none";
      const navRight = navShown ? nav.offsetWidth : 0;
      const top = document.querySelector(".shell-top");
      const topBottom = top ? top.offsetHeight : 0;
      const inset = 12;
      return {
        x: navRight + inset,
        y: topBottom + inset,
        w: Math.max(240, vw - navRight - inset * 2),
        h: Math.max(200, vh - topBottom - inset * 2),
      };
    }
    const anchor = this.findAnchor();
    this.anchor = anchor;
    if (!anchor) return null;
    return rectOf(anchor);
  }

  place(rect) {
    if (!this.el) return;
    this.el.style.width = `${Math.round(rect.w)}px`;
    this.el.style.height = `${Math.round(rect.h)}px`;
    this.el.style.transform = `translate(${Math.round(rect.x)}px, ${Math.round(rect.y)}px)`;
  }

  park() {
    if (!this.el) return;
    this.el.style.transform = `translate(${OFFSCREEN}px, 0px)`;
    this.el.style.pointerEvents = "none";
  }

  /** Re-position without animating. Used on view change and on resize. */
  settle() {
    if (!this.el || !this.mounted) return;
    const rect = this.targetRect();
    if (!rect) {
      this.park();
      return;
    }
    this.el.style.pointerEvents = "";
    this.place(rect);
    this.el.style.borderRadius = this.state === "collapsed" ? this.radiusCollapsed : this.radiusOpen;
  }

  /** FLIP from where the stage looks now to where the new state puts it. */
  transitionTo(state) {
    if (!this.el || !this.mounted) return;
    const from = rectOf(this.el);
    const fromRadius = getComputedStyle(this.el).borderRadius;
    const wasOpen = this.state !== "collapsed";
    this.state = state;
    /**
     * Clear the recession before measuring. Collapsing reads the anchor rect,
     * and the anchor lives inside the surface that is still scaled up, so a
     * dismiss measured here would land the stage 3 percent too large.
     */
    clearRecede();
    const to = this.targetRect();
    if (!to) {
      this.state = "collapsed";
      this.park();
      return;
    }
    const isOpen = state !== "collapsed";
    this.el.classList.toggle("is-max", state === "max");
    this.el.style.pointerEvents = "";
    this.place(to);
    const toRadius = isOpen ? this.radiusOpen : this.radiusCollapsed;
    this.el.style.borderRadius = toRadius;

    const duration = motionDuration();
    if (this.animation) this.animation.cancel();
    if (duration === 0 || (from.w < 2 && from.h < 2)) {
      this.animation = null;
      receded(isOpen, 0);
      return;
    }
    const sx = Math.max(from.w / to.w, 0.01);
    const sy = Math.max(from.h / to.h, 0.01);
    this.animation = this.el.animate(
      [
        {
          transform: `translate(${from.x}px, ${from.y}px) scale(${sx}, ${sy})`,
          borderRadius: fromRadius,
        },
        {
          transform: `translate(${Math.round(to.x)}px, ${Math.round(to.y)}px) scale(1, 1)`,
          borderRadius: toRadius,
        },
      ],
      { duration, easing: SPRING.easing },
    );
    if (this.frame) {
      this.frame.animate(
        [
          { opacity: 0.5 },
          { opacity: 0.5, offset: CONTENT_FADE_AT },
          { opacity: 1 },
        ],
        { duration, easing: "linear" },
      );
    }
    // Presented to maximized stays open, so the recession is re-applied rather
    // than re-animated; only crossing the open boundary animates it.
    receded(isOpen, wasOpen === isOpen ? 0 : duration);
  }
}

const stages = new Map();

function stageRadius() {
  const s = getComputedStyle(document.documentElement);
  return {
    collapsed: s.getPropertyValue("--sc-r").trim() || "6px",
    open: s.getPropertyValue("--sc-r-lg").trim() || "8px",
  };
}

function openStage() {
  for (const stage of stages.values()) {
    if (stage.state !== "collapsed") return stage;
  }
  return null;
}

function clearRecede() {
  const recede = document.getElementById("cp-recede");
  if (!recede) return;
  recede.style.transform = "";
  recede.style.filter = "";
}

/** Background recession: the launching surface scales up slightly and dims. */
function receded(on, duration) {
  const recede = document.getElementById("cp-recede");
  const scrim = document.getElementById("stage-scrim");
  const esc = document.getElementById("stage-esc");
  if (scrim) scrim.hidden = !on;
  if (esc) esc.hidden = !on;
  if (!recede) return;
  const frames = on
    ? [
        { transform: "scale(1)", filter: "brightness(1)" },
        { transform: "scale(1.03)", filter: "brightness(0.72)" },
      ]
    : [
        { transform: "scale(1.03)", filter: "brightness(0.72)" },
        { transform: "scale(1)", filter: "brightness(1)" },
      ];
  if (duration === 0) {
    recede.style.transform = on ? "scale(1.03)" : "";
    recede.style.filter = on ? "brightness(0.72)" : "";
    return;
  }
  recede.style.transform = on ? "scale(1.03)" : "";
  recede.style.filter = on ? "brightness(0.72)" : "";
  recede.animate(frames, { duration, easing: SPRING.easing });
}

function closeStages() {
  const open = openStage();
  if (!open) return;
  open.transitionTo("collapsed");
  open.el.classList.remove("is-max");
  if (open.name === "map") revertMapStageIfFlood();
}

/* ------------------------------------------------- G-129 flood capability
 *
 * The "map" stage already hosts whichever page shows this pack's map (the
 * real SmartSite/PE embed, or this product's own native-property-map
 * stopgap per G-117) -- this capability points that SAME stage at the PE
 * flood-drainage embed instead of building a second map surface: "a view
 * mode of the map area in Full," per this row's dispatch. Reachable from
 * Public works, Development services and Fire and EMS -- built once, wired
 * from the one composeGoldMap() boot call every lens already shares, not
 * recomputed per lens.
 */
let floodDrainageCapability = null; // null until composeGoldMap resolves once
let defaultMapStageUrl = "";
let mapStageIsFlood = false;

function floodCapabilityBasis() {
  if (!floodDrainageCapability) return "Map has not loaded yet for this pack.";
  if (!floodDrainageCapability.available) return floodDrainageCapability.reason;
  return "";
}

/** One id per lens this capability reaches (Development services, Public
 *  works, Fire and EMS) -- explicit, addressable ids, not a shared attribute
 *  selector, so the addressability gate can trace each one by name. */
const FLOOD_CAPABILITY_BASIS_IDS = [
  "ds-flood-capability-basis",
  "pw-flood-capability-basis",
  "fire-flood-capability-basis",
];

function renderFloodCapability() {
  const basis = floodCapabilityBasis();
  const available = Boolean(floodDrainageCapability && floodDrainageCapability.available);
  document.querySelectorAll("[data-flood-capability]").forEach((btn) => {
    btn.disabled = !available;
    btn.title = available ? "" : basis;
  });
  for (const id of FLOOD_CAPABILITY_BASIS_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = basis;
    show(el, !available);
  }
}

function openFloodDrainageCapability() {
  if (!floodDrainageCapability || !floodDrainageCapability.available) return;
  const mapStage = stages.get("map");
  if (!mapStage) return;
  mapStageIsFlood = true;
  mapStage.mount(floodDrainageCapability.url);
  mapStage.transitionTo("max");
}

/** Closing the capability returns the map stage to whichever page normally
 *  shows this pack's map -- never leaves a lens's map anchor stuck showing
 *  the flood report after the staff member is done with it. */
function revertMapStageIfFlood() {
  if (!mapStageIsFlood) return;
  mapStageIsFlood = false;
  const mapStage = stages.get("map");
  if (mapStage && defaultMapStageUrl) mapStage.mount(defaultMapStageUrl);
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-flood-capability]");
  if (!trigger || trigger.disabled) return;
  event.preventDefault();
  openFloodDrainageCapability();
});

function bindStages() {
  const radius = stageRadius();
  for (const name of ["map", "review", "files"]) {
    const el = document.getElementById(`${name}-stage`);
    if (!el) continue;
    stages.set(
      name,
      new MountStage(name, {
        label: name === "map" ? "Map" : name === "review" ? "Plan review" : "Files",
        radiusCollapsed: radius.collapsed,
        radiusOpen: radius.open,
      }),
    );
  }

  document.addEventListener("click", (event) => {
    const max = event.target.closest("[data-stage-max]");
    if (!max) return;
    const name = max.dataset.stageMax;
    const stage = stages.get(name);
    if (!stage || !stage.mounted) return;
    event.preventDefault();
    setText("stage-esc-label", stage.label);
    stage.transitionTo(stage.state === "max" ? "collapsed" : "max");
  });

  const scrim = document.getElementById("stage-scrim");
  if (scrim) scrim.addEventListener("click", closeStages);
  const escBtn = document.getElementById("stage-esc-btn");
  if (escBtn) escBtn.addEventListener("click", closeStages);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (openStage()) closeStages();
  });

  let frame = 0;
  const resettle = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      for (const stage of stages.values()) stage.settle();
    });
  };
  window.addEventListener("resize", resettle);
  /**
   * Anchors move when a column scrolls, and below 900px the whole work surface
   * becomes one scrolling column with the map stacked under the content. Capture
   * catches scrolls in any container; the rAF above coalesces them.
   */
  document.addEventListener("scroll", resettle, { passive: true, capture: true });
  /**
   * Watch the anchors themselves, not just the frame. A panel above the rail
   * growing by one row moves the anchor without changing the main region, and a
   * stage that missed it would sit a few pixels off its own container.
   */
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(resettle);
    document.querySelectorAll("[data-stage]").forEach((el) => observer.observe(el));
    const main = document.querySelector(".shell-main");
    if (main) observer.observe(main);
  }
  document.fonts?.ready?.then(resettle).catch(() => {});
  return resettle;
}

/* ----------------------------------------------------------------- records */

function renderMeetings(meetings) {
  const records = Array.isArray(meetings?.records) ? meetings.records : [];
  const state = document.getElementById("overview-meetings-state");
  const list = document.getElementById("overview-meetings-list");
  const honesty = document.getElementById("overview-meetings-honesty");
  const conn = document.getElementById("overview-meetings-conn");
  if (conn) conn.textContent = records.length ? "read" : "unread";
  /**
   * Partial means some records arrived and some did not. With zero records the
   * state block below already says why, and a Partial chip beside "no meeting
   * packet has been read" claims data that is not there.
   */
  show(honesty, records.length > 0 && meetings?.honesty === "partial");
  if (records.length === 0) {
    show(state, true);
    if (list) {
      show(list, false);
      list.replaceChildren();
    }
    /**
     * Only a basis that was actually read overwrites the markup. With no basis
     * the static line stands, and it names no city, so a compose failure can no
     * longer put another pack's name under an empty panel.
     */
    if (meetings?.basis) setText("overview-meetings-basis", `Basis: ${meetings.basis}`);
    return;
  }
  show(state, false);
  if (!list) return;
  show(list, true);
  list.replaceChildren(
    ...records.map((record) => {
      const row = document.createElement("div");
      row.className = "srcreg";
      const rail = document.createElement("i");
      rail.className = "rail";
      const name = document.createElement("span");
      name.className = "nm";
      const title = document.createElement("b");
      title.textContent = record.title || "Untitled meeting";
      const when = document.createElement("span");
      when.textContent = record.when || "";
      name.append(title, when);
      const prov = document.createElement("span");
      prov.className = "prov";
      const source = document.createElement("b");
      source.textContent = record.source || "clerk calendar";
      prov.append(source);
      row.append(rail, name, prov);
      return row;
    }),
  );
}

/* --------------------------------------------------------------- pipeline */

/**
 * Semantic meaning to kit carrier. The contract in src/adapters.mjs declares the
 * meaning (crit, warn, info, ok) and this is the only place that turns a meaning
 * into a class, so the record contract never names a stylesheet.
 */
const SEVERITY_PILL = {
  crit: "p-crit",
  warn: "p-warn",
  info: "p-info",
  ok: "p-ok",
  quiet: "p-quiet",
};

const STAGE_LABELS = {
  intake: "Intake",
  routing: "Routing",
  review: "Review",
  revisions: "Revisions",
  issuance: "Issuance",
};

/*
G-100. Development services no longer carries its own state label.

packStateLabel and applyPackState were a second implementation of the rule
sourcedLabel and applyLensState already carry for the other four lenses, and
they were a WEAKER one: the label came off pipeline.generated, a boolean, so a
pack that had not granted MyGov and a pack that generates nothing produced the
same badge - the collapse the lens bodies had already been fixed to avoid. The
compose has carried sourceStatus since G-91 and this path never read it.

Both are deleted rather than kept in sync. renderPipeline resolves the same
status the region renderer does and calls applyLensState with it, so the DS
badge, its chip and its Overview register row are the same three renderings of
one label that every other lens gets. src/public-safety-lenses.test.mjs holds
sourcedLabel and applyLensState to one declaration each; this is what makes that
count true across the whole product rather than across four fifths of it.
*/

function td(text, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  /**
   * A real record legitimately lacks fields the fixture always carried
   * (permits-pipeline's stage, e.g.) -- an absent value renders blank,
   * never the literal word "undefined".
   */
  cell.textContent = text == null ? "" : text;
  return cell;
}

/**
 * A real completion fraction (0..1) rendered as a whole-number percent.
 * Anything not a finite number (missing, or a fixture record that never
 * carries this field) is null so td() renders it blank, not "undefined"
 * and not a fabricated 0%.
 */
function pctText(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${Math.round(value * 100)}%`;
}

function statusCell(record, statusLabels) {
  const cell = document.createElement("td");
  const pill = document.createElement("span");
  const meta = statusLabels[record.status] || { label: record.status, severity: "quiet" };
  pill.className = `pill ${SEVERITY_PILL[meta.severity] || "p-quiet"}`;
  pill.textContent = meta.label;
  cell.append(pill);
  return cell;
}

/* ------------------------------------------------------------- G-123 tables

Shared client-side filter/paginate for every Development services table. The
seam still returns the full record set in one read -- G-97's own constraint
("The browser renders records; it never generates them") stands, and this
only slices what is already in hand. No domain here carries enough real rows
to make a server-side page cheaper than the request it would add, and the
shipped demo pack is at most a few dozen rows.
*/

const DS_PAGE_SIZE = 50;
const dsState = Object.create(null);
/** The last successful payload per tab, so a filter/page change re-derives
 *  from what was already fetched rather than re-fetching. */
const dsLast = Object.create(null);

function dsStateFor(prefix) {
  return dsState[prefix] || (dsState[prefix] = { page: 0, search: "", status: "", extra: {} });
}

function fieldValue(record, path) {
  return path.split(".").reduce((v, k) => (v == null ? v : v[k]), record);
}

function dsFilterPage(prefix, records, searchFields) {
  const state = dsStateFor(prefix);
  let rows = records;
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((r) =>
      searchFields.some((f) => String(fieldValue(r, f) || "").toLowerCase().includes(q)),
    );
  }
  if (state.status) rows = rows.filter((r) => r.status === state.status);
  for (const key of Object.keys(state.extra)) {
    const value = state.extra[key];
    if (value) rows = rows.filter((r) => String(fieldValue(r, key) || "") === value);
  }
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / DS_PAGE_SIZE));
  if (state.page >= pageCount) state.page = pageCount - 1;
  if (state.page < 0) state.page = 0;
  const start = state.page * DS_PAGE_SIZE;
  return { pageRows: rows.slice(start, start + DS_PAGE_SIZE), total, page: state.page, pageCount };
}

function renderPager(prefix, page, pageCount, total) {
  const prev = document.getElementById(`${prefix}-prev`);
  const next = document.getElementById(`${prefix}-next`);
  const pos = document.getElementById(`${prefix}-pos`);
  if (pos) {
    pos.textContent = total === 0 ? "0 results" : `Page ${page + 1} of ${pageCount} · ${total} total`;
  }
  if (prev) prev.disabled = page <= 0;
  if (next) next.disabled = page >= pageCount - 1;
}

/** Fills a <select> with the declared status vocabulary (or, for a real feed
 *  with unknown cardinality, whatever distinct values the records carry),
 *  keeping the caller's current selection if it still exists. */
function populateSelect(id, options) {
  const select = document.getElementById(id);
  if (!select) return;
  const current = select.value;
  const placeholder = select.options[0];
  select.replaceChildren(placeholder);
  for (const opt of options) {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.label;
    select.append(el);
  }
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

/**
 * Consumes the filter an attention-row tile (or, per G-120, an Overview
 * tile) carried, per that same lane's own mechanism: applyLens writes it
 * once onto the root as data-filter, and a destination lens that has filter
 * UI reads it from there rather than re-parsing location.search itself. An
 * unrecognised value -- a filter naming a status this tab's own vocabulary
 * does not have, e.g. Pipeline's current "active"/"expiring" -- is a silent
 * no-op, the same discipline G-120's own author documented for an unbuilt
 * destination: "a destination that does not recognise the value simply
 * does not act on it, the same as an unrecognised tab falls back rather
 * than throwing."
 */
function applyPendingDsFilter(prefix, statusSelectId) {
  const wanted = document.documentElement.getAttribute("data-filter") || "";
  if (!wanted) return;
  const select = document.getElementById(statusSelectId);
  if (!select) return;
  if (![...select.options].some((o) => o.value === wanted)) return;
  select.value = wanted;
  dsStateFor(prefix).status = wanted;
}

function distinctValues(records, field) {
  return [...new Set(records.map((r) => fieldValue(r, field)).filter(Boolean))].sort();
}

/**
 * A table's re-render entry point: reads the current filter-bar controls into
 * state, re-derives the page from the cached payload, and repaints rows and
 * the pager. Registered once per prefix so every control (search, selects,
 * reset, prev/next) can call the same function.
 */
const dsRerender = Object.create(null);

/**
 * The universal three: search, status, reset, plus pagination. Every id here
 * is a literal template built from `prefix` alone (never from a runtime
 * array of control names) so the addressability gate can resolve every one
 * of them against the served markup by static inspection. A tab's OWN extra
 * controls (a type select, a sort order, a manager filter) are wired
 * separately, right beside the tab that owns them, for the same reason: a
 * shared loop over a config array is exactly the shape src/addressability.
 * test.mjs cannot trace an id through.
 *
 * `onReset` lets a caller clear its own extra controls in the same click;
 * it is a plain function reference, not an id lookup, so it carries no
 * addressing risk.
 */
function wireDsFilterBar(prefix, { onReset } = {}) {
  const search = document.getElementById(`${prefix}-search`);
  const status = document.getElementById(`${prefix}-status`);
  const reset = document.getElementById(`${prefix}-reset`);
  const prev = document.getElementById(`${prefix}-prev`);
  const next = document.getElementById(`${prefix}-next`);
  const go = () => {
    const state = dsStateFor(prefix);
    state.page = 0;
    if (search) state.search = search.value.trim();
    if (status) state.status = status.value;
    dsRerender[prefix]?.();
  };
  search?.addEventListener("input", go);
  status?.addEventListener("change", go);
  reset?.addEventListener("click", () => {
    const state = dsStateFor(prefix);
    state.page = 0;
    state.search = "";
    state.status = "";
    state.extra = {};
    if (search) search.value = "";
    if (status) status.value = "";
    onReset?.();
    dsRerender[prefix]?.();
  });
  prev?.addEventListener("click", () => {
    const state = dsStateFor(prefix);
    if (state.page > 0) {
      state.page -= 1;
      dsRerender[prefix]?.();
    }
  });
  // next's own bound is enforced by renderPager disabling the button at the
  // last page, so a click here always has a next page to move to.
  next?.addEventListener("click", () => {
    const state = dsStateFor(prefix);
    state.page += 1;
    dsRerender[prefix]?.();
  });
}

/**
 * One extra filter select, wired by its OWN already-concatenated literal id
 * -- never `${prefix}-${id}` from two separately-varying parameters. Two
 * independent parameters feeding one getElementById template is exactly
 * what produced ds-ce-manager, ds-lic-officer and the other combinations
 * nothing ever calls: the gate correctly cannot tell which (prefix, id)
 * PAIRS actually occur together, only that each has appeared somewhere, so
 * it checks the full cross product. A single, fully-known id string per
 * call site has no such ambiguity.
 */
function wireDsExtraSelect(fullId, prefix, field) {
  document.getElementById(fullId)?.addEventListener("change", () => {
    const state = dsStateFor(prefix);
    state.page = 0;
    const el = document.getElementById(fullId);
    if (el) state.extra[field] = el.value;
    dsRerender[prefix]?.();
  });
}

/** A control that re-renders on change without filtering anything itself
 *  (Inspections' sort order is a re-ordering, not a dsFilterPage filter). */
function wireDsExtraTrigger(fullId, prefix) {
  document.getElementById(fullId)?.addEventListener("change", () => {
    dsRerender[prefix]?.();
  });
}

/** The one load component: inspector, manager, and officer load are the same
 *  shape (work distributed across people), so this is the only renderer. */
function renderLoadStrip(prefix, payload, cfg) {
  const head = document.getElementById(`${prefix}-load-head`);
  const summary = document.getElementById(`${prefix}-load-summary`);
  const body = document.getElementById(`${prefix}-load`);
  if (!body) return;
  const ok = payload.status === "ok";
  const rows = ok ? extrasOf(payload)[cfg.extrasKey] || [] : [];
  show(head, rows.length > 0);
  if (rows.length === 0) {
    body.replaceChildren();
    return;
  }
  const totalOpen = rows.reduce((sum, r) => sum + (r.openCount || 0), 0);
  if (summary) {
    summary.textContent = `${rows.length} ${cfg.noun}${rows.length === 1 ? "" : "s"} · ${totalOpen} open`;
  }
  const max = Math.max(...rows.map((r) => r[cfg.countField] || 0), 1);
  body.replaceChildren(
    ...rows.map((row) => {
      const card = document.createElement("div");
      card.className = "loadcard";
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = row[cfg.refField];
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = `${row.openCount} open`;
      const bar = document.createElement("div");
      bar.className = "bar";
      const barFill = document.createElement("i");
      barFill.style.width = `${Math.round(((row[cfg.countField] || 0) / max) * 100)}%`;
      bar.append(barFill);
      rowEl.append(n, bar);
      card.append(who, rowEl);
      return card;
    }),
  );
}

/**
 * The tab metric strip (tier 3): compact, secondary, no cards. Reads the
 * region's own declared metrics by id; a tile the payload has no source for
 * keeps saying "Not read" rather than a zero, same discipline the old card
 * strip carried.
 */
function renderMetricBar(strip, payload) {
  if (!strip) return;
  const ok = payload.status === "ok";
  const extras = payload.extras || {};
  if (ok && Array.isArray(extras.realStatusCounts)) {
    strip.replaceChildren(
      ...extras.realStatusCounts.map(({ status, count }) => {
        const item = document.createElement("div");
        item.className = "metricbar-item";
        const v = document.createElement("span");
        v.className = "v";
        v.textContent = String(count);
        const k = document.createElement("span");
        k.className = "k";
        k.textContent = status;
        item.append(v, k);
        return item;
      }),
    );
    return;
  }
  const metrics = ok && Array.isArray(extras.metrics) ? extras.metrics : [];
  const byId = {};
  for (const metric of metrics) byId[metric.id] = metric;
  for (const item of strip.querySelectorAll(".metricbar-item[data-metric]")) {
    const metric = byId[item.dataset.metric];
    const value = item.querySelector(".v");
    if (!value) continue;
    if (!metric) {
      value.classList.add("word");
      value.textContent = "Not read";
      continue;
    }
    value.classList.remove("word");
    value.textContent = String(metric.count);
  }
}

/* ------------------------------------------------------ attention row (G-123)

Tier 1: the six filtered entry points named in the approved design. Three
(WO overdue, WO due today, and -- when the vocabulary matches -- WO active)
are computed off data this lens already reads; two (Pipeline active,
Pipeline expiring) and one (Plan review active) have no source this lens can
read without either guessing at an unverified status taxonomy or reaching
into a separate product's own data. Acceptance is the click, not the number:
every tile still navigates, and an uncomputed one states "Not read" rather
than a zero, exactly like every other unread source on this product.
*/

function setAttnTile(id, text, isWord) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("word", Boolean(isWord));
}

function renderWorkOrderAttnTiles(payload) {
  const ok = payload.status === "ok";
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  if (!ok) return;
  const overdue = records.filter((r) => typeof r.dueOffsetDays === "number" && r.dueOffsetDays < 0);
  const dueToday = records.filter((r) => r.dueOffsetDays === 0);
  setAttnTile("attn-wo-overdue-v", String(overdue.length), false);
  setAttnTile("attn-wo-due-today-v", String(dueToday.length), false);
  // "active" has no analogue in the current work-order status vocabulary
  // (past-sla/at-risk/scheduled/closed) -- see this lane's close.
}

/* -------------------------------------------------------------- tab strip */

function setTabCount(id, count) {
  const el = document.getElementById(id);
  if (el) el.textContent = count == null ? "" : String(count);
}

/* -------------------------------------------------------------- pipeline */

function renderPipeline(pipeline) {
  const status = String(pipeline.sourceStatus || "did-not-read");
  const empty = document.getElementById("ds-pipeline-empty");
  const emptyKicker = document.getElementById("ds-pipeline-empty-kicker");
  const emptyHead = document.getElementById("ds-pipeline-empty-head");
  const emptyBasis = document.getElementById("ds-pipeline-empty-basis");
  const wrap = document.getElementById("ds-pipeline-records");
  const rows = document.getElementById("ds-pipeline-rows");
  const mark = document.getElementById("ds-pipeline-mark");
  const prov = document.getElementById("ds-pipeline-prov");
  const caption = document.getElementById("ds-pipeline-caption");
  const basis = document.getElementById("ds-pipeline-basis");
  const filterbar = document.getElementById("ds-pipeline-filterbar");

  renderMetricBar(document.getElementById("ds-metrics"), {
    status: pipeline.generated || Array.isArray(pipeline.realStatusCounts) ? "ok" : status,
    extras: { metrics: pipeline.metrics, realStatusCounts: pipeline.realStatusCounts },
  });

  /**
   * The Development services breadcrumb is a [data-pack-name] element like
   * every other crumb, with applyIdentity as its only writer -- this
   * function does not write it, and a test asserts the two paths agree on
   * displayName.
   */
  applyLensState(
    "ds-state-chip",
    "development-services",
    sourcedLabel([{ status, source: Array.isArray(pipeline.realStatusCounts) ? "live" : undefined }]),
  );
  if (emptyKicker) emptyKicker.textContent = REGION_KICKER[status] || REGION_KICKER["did-not-read"];
  if (emptyHead) emptyHead.textContent = regionHead(status, "Pipeline", pipeline.cityKey);
  if (emptyBasis && pipeline.basis) emptyBasis.textContent = `Basis: ${pipeline.basis}`;

  const records = Array.isArray(pipeline.records) ? pipeline.records : [];
  const statusLabels = statusLabelsFor({ extras: { metrics: pipeline.metrics } });

  setTabCount("tabcount-pipeline", records.length || null);
  setAttnTile("attn-pipeline-active-v", "Not read", true);
  setAttnTile("attn-pipeline-expiring-v", "Not read", true);

  if (records.length === 0) {
    show(empty, true);
    show(wrap, false);
    show(filterbar, false);
    if (rows) rows.replaceChildren();
    show(mark, false);
    show(prov, false);
    if (caption) caption.textContent = "Cases in flight";
    renderPager("ds-pipeline", 0, 1, 0);
    return;
  }

  const isReal = Array.isArray(pipeline.realStatusCounts);
  show(empty, false);
  show(wrap, true);
  show(mark, !isReal);
  show(prov, !isReal);
  show(filterbar, true);
  if (caption) caption.textContent = `${records.length} cases in flight`;
  if (basis) basis.textContent = `Basis: ${pipeline.basis}`;

  populateSelect(
    "ds-pipeline-status",
    distinctValues(records, "status").map((id) => ({
      value: id,
      label: (statusLabels[id] || { label: id }).label,
    })),
  );
  applyPendingDsFilter("ds-pipeline", "ds-pipeline-status");

  dsLast["ds-pipeline"] = { records, statusLabels };
  dsRerender["ds-pipeline"]();
}

function pipelineRow(record, statusLabels) {
  const row = document.createElement("tr");
  row.append(
    td(record.recordId, "id"),
    td(record.subject, "subj"),
    td(record.place && record.place.label ? record.place.label : ""),
    td(record.applicant, "t-data"),
    statusCell(record, statusLabels),
    td(record.submittedDate, "t-data"),
  );
  return row;
}

dsRerender["ds-pipeline"] = () => {
  const cache = dsLast["ds-pipeline"];
  if (!cache) return;
  const { pageRows, total, page, pageCount } = dsFilterPage("ds-pipeline", cache.records, [
    "recordId",
    "subject",
    "place.label",
  ]);
  const rowsEl = document.getElementById("ds-pipeline-rows");
  if (rowsEl) fill(rowsEl, pageRows.map((r) => pipelineRow(r, cache.statusLabels)));
  renderPager("ds-pipeline", page, pageCount, total);
  setText("ds-pipeline-resultcount", `${total} results`);
};

async function loadPipeline(cityKey) {
  const key = String(cityKey || "").trim();
  let data = null;
  try {
    const res = await fetch(
      `/api/lenses/development-services/pipeline?cityKey=${encodeURIComponent(key)}`,
    );
    data = res.ok ? await res.json() : null;
  } catch {
    data = null;
  }
  if (!data) {
    renderPipeline({
      cityKey: key,
      generated: false,
      records: [],
      metrics: [],
      basis: `the pipeline did not read for ${key}`,
    });
    return;
  }
  renderPipeline(data);
}

/* -------------------------------------------------- shared region helpers */

function extrasOf(payload) {
  return payload && payload.extras && typeof payload.extras === "object" ? payload.extras : {};
}

function pillCell(label, severity) {
  const cell = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = `pill ${SEVERITY_PILL[severity] || "p-quiet"}`;
  pill.textContent = label || "";
  cell.append(pill);
  return cell;
}

function dataCell(text) {
  const cell = document.createElement("td");
  const value = document.createElement("span");
  value.className = "t-data";
  value.textContent = text;
  cell.append(value);
  return cell;
}

/** A cell that carries an absence rather than a blank, in the record's own words. */
function basisCell(text) {
  const cell = document.createElement("td");
  const note = document.createElement("span");
  note.className = "t-caption";
  note.textContent = text;
  cell.append(note);
  return cell;
}

function placeCell(record) {
  return td(record.place && record.place.label ? record.place.label : "");
}

function renderRegister(containerId, basisId, payload, buildRows, rule) {
  const container = document.getElementById(containerId);
  const basis = document.getElementById(basisId);
  const ok = payload.status === "ok";
  if (container) {
    container.replaceChildren(
      ...(ok ? buildRows(payload) : []).map((row) => {
        const el = document.createElement("div");
        el.className = "srcreg";
        const rail = document.createElement("i");
        rail.className = "rail";
        const name = document.createElement("span");
        name.className = "nm";
        const title = document.createElement("b");
        title.textContent = row.title;
        name.append(title);
        if (row.sub) {
          const sub = document.createElement("span");
          sub.textContent = row.sub;
          name.append(sub);
        }
        const pill = document.createElement("span");
        pill.className = `pill ${SEVERITY_PILL[row.severity] || "p-quiet"}`;
        pill.textContent = String(row.value);
        el.append(rail, name, pill);
        return el;
      }),
    );
  }
  if (basis) basis.textContent = `Basis: ${ok ? rule(payload) : payload.basis}`;
}

function renderKeyValues(containerId, basisId, payload, buildPairs, rule) {
  const container = document.getElementById(containerId);
  const basis = document.getElementById(basisId);
  const ok = payload.status === "ok";
  if (container) {
    const children = [];
    for (const [key, value] of ok ? buildPairs(payload) : []) {
      const dt = document.createElement("dt");
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.textContent = String(value);
      children.push(dt, dd);
    }
    container.replaceChildren(...children);
  }
  if (basis) basis.textContent = `Basis: ${ok ? rule(payload) : payload.basis}`;
}

function firstOf(list, field) {
  const rows = Array.isArray(list) ? list : [];
  for (const row of rows) if (row && row[field]) return row[field];
  return "";
}

/* ---------------------------------------------------------- inspections */

function inspectionRow(record, payload) {
  const row = document.createElement("tr");
  const results = {};
  for (const result of extrasOf(payload).results || []) {
    results[result.id] = { label: result.label, severity: result.severity };
  }
  const result = results[record.result] || { label: record.result, severity: "quiet" };
  row.append(
    td(record.recordId, "id"),
    td(record.inspectionType, "subj"),
    placeCell(record),
    /** Inspector, replacing the old free-text Comments column -- G-123 PII
     *  finding: a real inspection's row.comments carries citizen names and
     *  phone numbers verbatim and must never render in a list. inspectorRef
     *  is the opaque fixture reference; a real feed's own inspector name (a
     *  staff identifier, not citizen PII) renders when present. */
    td(record.inspector || record.inspectorRef, "t-data"),
    pillCell(result.label, result.severity),
    record.dayLabel ? dataCell(record.dayLabel) : basisCell(record.scheduleBasis || ""),
  );
  return row;
}

function inspectionDerivedMetrics(records) {
  const completed = records.filter((r) => r.status === "completed" || r.result !== "not-inspected");
  const decided = completed.filter((r) => r.result === "passed" || r.result === "failed" || r.result === "corrections");
  const passed = decided.filter((r) => r.result === "passed");
  const passRate = decided.length > 0 ? `${Math.round((passed.length / decided.length) * 100)}%` : null;
  const withDay = completed.filter((r) => typeof r.dayOffset === "number");
  const avgDays =
    withDay.length > 0
      ? (withDay.reduce((sum, r) => sum + Math.abs(r.dayOffset), 0) / withDay.length).toFixed(1)
      : null;
  return { passRate, avgDays };
}

function renderInspections(payload) {
  const ok = renderRegion("ds-insp", payload);
  renderMetricBar(document.getElementById("ds-insp-metrics"), payload);
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  const { passRate, avgDays } = inspectionDerivedMetrics(records);
  setAttnTile("ds-insp-passrate", passRate || "Not read", !passRate);
  setAttnTile("ds-insp-avgdays", avgDays ? `${avgDays} days` : "Not read", !avgDays);
  setTabCount("tabcount-inspections", ok ? records.length : null);

  renderLoadStrip("ds-insp", payload, {
    extrasKey: "inspectorLoad",
    refField: "inspectorRef",
    countField: "inspectionCount",
    noun: "inspector",
  });

  show(document.getElementById("ds-insp-filterbar"), records.length > 0);
  if (records.length > 0) {
    const labels = statusLabelsFor(payload);
    populateSelect(
      "ds-insp-status",
      distinctValues(records, "status").map((id) => ({ value: id, label: (labels[id] || { label: id }).label })),
    );
    populateSelect(
      "ds-insp-type",
      distinctValues(records, "inspectionType").map((v) => ({ value: v, label: v })),
    );
    applyPendingDsFilter("ds-insp", "ds-insp-status");
  }

  dsLast["ds-insp"] = { records, payload };
  dsRerender["ds-insp"]();

  renderRegister(
    "ds-insp-results",
    "ds-insp-results-basis",
    payload,
    (data) =>
      (extrasOf(data).results || []).map((result) => ({
        title: result.label,
        sub: result.basis || "",
        value: result.count,
        severity: result.severity,
      })),
    (data) => firstOf(extrasOf(data).results, "countingRule") || data.basis,
  );
}

dsRerender["ds-insp"] = () => {
  const cache = dsLast["ds-insp"];
  if (!cache) return;
  const sortSelect = document.getElementById("ds-insp-sort");
  let records = cache.records;
  if (sortSelect?.value === "scheduled") {
    records = [...records].sort((a, b) => (a.dayOffset ?? 999) - (b.dayOffset ?? 999));
  } else if (sortSelect?.value === "type") {
    records = [...records].sort((a, b) => (a.inspectionType || "").localeCompare(b.inspectionType || ""));
  }
  const { pageRows, total, page, pageCount } = dsFilterPage("ds-insp", records, [
    "recordId",
    "inspectionType",
    "place.label",
  ]);
  const rowsEl = document.getElementById("ds-insp-rows");
  if (rowsEl) fill(rowsEl, pageRows.map((r) => inspectionRow(r, cache.payload)));
  renderPager("ds-insp", page, pageCount, total);
  setText("ds-insp-resultcount", `${total} results`);
};

/* --------------------------------------------------------- work orders */

function workOrderRow(record) {
  const row = document.createElement("tr");
  row.append(
    td(record.recordId, "id"),
    td(record.subject, "subj"),
    placeCell(record),
    /** Real-feed-only column -- see mapRealWorkOrderRecord. */
    td(record.department, "t-data"),
    dataCell((WORK_ORDER_STATUS_LABELS[record.status] || { label: record.status }).label || record.status),
    dataCell(record.dueLabel || ""),
  );
  return row;
}

function renderWorkOrders(payload) {
  const ok = renderRegion("ds-wo", payload);
  renderMetricBar(document.getElementById("ds-wo-metrics"), payload);
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  setTabCount("tabcount-work-orders", ok ? records.length : null);
  renderWorkOrderAttnTiles(payload);
  setAttnTile("attn-wo-active-v", "Not read", true);

  renderLoadStrip("ds-wo", payload, {
    extrasKey: "managerLoad",
    refField: "managerRef",
    countField: "workOrderCount",
    noun: "manager",
  });

  show(document.getElementById("ds-wo-filterbar"), records.length > 0);
  if (records.length > 0) {
    const labels = statusLabelsFor(payload);
    populateSelect(
      "ds-wo-status",
      distinctValues(records, "status").map((id) => ({ value: id, label: (labels[id] || { label: id }).label })),
    );
    populateSelect(
      "ds-wo-manager",
      distinctValues(records, "managerRef").map((v) => ({ value: v, label: v })),
    );
    applyPendingDsFilter("ds-wo", "ds-wo-status");
  }

  dsLast["ds-wo"] = { records, payload };
  dsRerender["ds-wo"]();

  renderKeyValues(
    "ds-wo-sla",
    "ds-wo-sla-basis",
    payload,
    (data) => {
      const sla = extrasOf(data).sla || {};
      return [
        ["Target", `${sla.targetHours} hours`],
        ["Breached", sla.breached],
        ["At risk", sla.atRisk],
        ["Within", sla.within],
        ["Measured", sla.measured],
      ];
    },
    (data) => (extrasOf(data).sla || {}).countingRule || data.basis,
  );
  renderRegister(
    "ds-wo-daily",
    "ds-wo-daily-basis",
    payload,
    (data) =>
      (extrasOf(data).dailyQueue || []).map((day) => ({
        title: day.dayLabel,
        sub: "",
        value: day.count,
        severity: "quiet",
      })),
    (data) => firstOf(extrasOf(data).dailyQueue, "countingRule") || data.basis,
  );
}

dsRerender["ds-wo"] = () => {
  const cache = dsLast["ds-wo"];
  if (!cache) return;
  const { pageRows, total, page, pageCount } = dsFilterPage("ds-wo", cache.records, [
    "recordId",
    "subject",
    "place.label",
  ]);
  const rowsEl = document.getElementById("ds-wo-rows");
  if (rowsEl) fill(rowsEl, pageRows.map((r) => workOrderRow(r)));
  renderPager("ds-wo", page, pageCount, total);
  setText("ds-wo-resultcount", `${total} results`);
};

function wireWorkOrderViewModes() {
  const seg = document.getElementById("ds-wo-viewmode");
  if (!seg) return;
  seg.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-view]");
    if (!btn) return;
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-selected", String(b === btn));
    const view = btn.dataset.view;
    show(document.getElementById("ds-wo-view-list"), view === "list");
    show(document.getElementById("ds-wo-view-map"), view === "map");
    show(document.getElementById("ds-wo-view-performance"), view === "performance");
  });
}

/* ---------------------------------------------------- code enforcement */

function codeViolationRow(record, payload) {
  const row = document.createElement("tr");
  const rungs = {};
  for (const rung of extrasOf(payload).escalation || []) {
    rungs[rung.id] = { label: rung.label, severity: rung.severity };
  }
  row.append(
    td(record.recordId, "id"),
    td(record.violationType, "subj"),
    placeCell(record),
    statusCell(record, statusLabelsFor(payload)),
    dataCell(String(record.escalationStep)),
    /** Real-feed-only column -- see mapRealCodeViolationRecord. */
    td(record.assignedOfficer || record.officerRef, "t-data"),
    /** Real-feed-only column -- see mapRealCodeViolationRecord. */
    td(record.reportedDate, "t-data"),
  );
  return row;
}

function renderCodeEnforcement(payload) {
  const ok = renderRegion("ds-ce", payload);
  renderMetricBar(document.getElementById("ds-ce-metrics"), payload);
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  setTabCount("tabcount-code-enforcement", ok ? records.length : null);
  setAttnTile("ds-ce-total", ok ? String(records.length) : "Not read", !ok);

  renderLoadStrip("ds-ce", payload, {
    extrasKey: "officerLoad",
    refField: "officerRef",
    countField: "caseCount",
    noun: "officer",
  });

  show(document.getElementById("ds-ce-filterbar"), records.length > 0);
  if (records.length > 0) {
    const labels = statusLabelsFor(payload);
    populateSelect(
      "ds-ce-status",
      distinctValues(records, "status").map((id) => ({ value: id, label: (labels[id] || { label: id }).label })),
    );
    populateSelect(
      "ds-ce-type",
      distinctValues(records, "violationType").map((v) => ({ value: v, label: v })),
    );
    populateSelect(
      "ds-ce-officer",
      distinctValues(records, "officerRef").map((v) => ({ value: v, label: v })),
    );
    applyPendingDsFilter("ds-ce", "ds-ce-status");
  }

  dsLast["ds-ce"] = { records, payload };
  dsRerender["ds-ce"]();
}

dsRerender["ds-ce"] = () => {
  const cache = dsLast["ds-ce"];
  if (!cache) return;
  const { pageRows, total, page, pageCount } = dsFilterPage("ds-ce", cache.records, [
    "recordId",
    "violationType",
    "place.label",
  ]);
  const rowsEl = document.getElementById("ds-ce-rows");
  if (rowsEl) fill(rowsEl, pageRows.map((r) => codeViolationRow(r, cache.payload)));
  renderPager("ds-ce", page, pageCount, total);
  setText("ds-ce-resultcount", `${total} results`);
};

/* ------------------------------------------------------------ licences */

function licenceRow(record) {
  const row = document.createElement("tr");
  row.append(
    td(record.recordId, "id"),
    /** A generated record names no business (holderRef, opaque); a real
     *  record's own subject (business name) is the licence holder's real,
     *  self-declared identity on their own licence -- not citizen PII. */
    dataCell(record.subject || record.holderRef),
    td(record.type, "t-data"),
    placeCell(record),
    /** Real-feed-only column -- see mapRealBusinessLicenseRecord. */
    td(record.issuedDate, "t-data"),
    dataCell(record.expiryLabel || record.expirationDate || ""),
    statusCell(record, LICENSE_STATUS_LABELS),
  );
  return row;
}

function renderLicences(payload) {
  const ok = renderRegion("ds-lic", payload);
  renderMetricBar(document.getElementById("ds-lic-metrics"), payload);
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  /** licenseType (real feed) and licenseCategory (fixture) are the same
   *  concept under two names; normalized once here so every downstream
   *  read -- the column, the filter, the distinct-types count -- uses one
   *  field rather than repeating the `||` fallback at each call site. */
  for (const record of records) record.type = record.licenseType || record.licenseCategory;
  setTabCount("tabcount-licenses", ok ? records.length : null);
  setAttnTile("ds-lic-total", ok ? String(records.length) : "Not read", !ok);
  const expiringSoon = records.filter((r) => r.status === "expiring").length;
  setAttnTile("ds-lic-expiringsoon", ok ? String(expiringSoon) : "Not read", !ok);
  const types = distinctValues(records, "type");
  setAttnTile("ds-lic-types", ok ? String(types.length) : "Not read", !ok);

  show(document.getElementById("ds-lic-filterbar"), records.length > 0);
  if (records.length > 0) {
    populateSelect(
      "ds-lic-status",
      distinctValues(records, "status").map((id) => ({
        value: id,
        label: (LICENSE_STATUS_LABELS[id] || { label: id }).label,
      })),
    );
    populateSelect("ds-lic-type", types.map((v) => ({ value: v, label: v })));
    applyPendingDsFilter("ds-lic", "ds-lic-status");
  }

  dsLast["ds-lic"] = { records };
  dsRerender["ds-lic"]();

  const chargesBasis = extrasOf(payload).chargesBasis;
  const holderBasis = firstOf(payload.records, "holderBasis");
  setText(
    "ds-lic-recordsbasis",
    `Basis: ${[payload.basis, chargesBasis, holderBasis].filter(Boolean).join(" | ")}`,
  );
}

dsRerender["ds-lic"] = () => {
  const cache = dsLast["ds-lic"];
  if (!cache) return;
  const { pageRows, total, page, pageCount } = dsFilterPage("ds-lic", cache.records, [
    "recordId",
    "subject",
    "holderRef",
    "place.label",
  ]);
  const rowsEl = document.getElementById("ds-lic-rows");
  if (rowsEl) fill(rowsEl, pageRows.map((r) => licenceRow(r)));
  renderPager("ds-lic", page, pageCount, total);
  setText("ds-lic-resultcount", `${total} results`);
};

/* ----------------------------------------------------------- DS controls */

const WORK_ORDER_STATUS_LABELS = Object.fromEntries(
  [
    { id: "past-sla", label: "Past SLA" },
    { id: "at-risk", label: "At risk" },
    { id: "scheduled", label: "Scheduled" },
    { id: "closed", label: "Closed" },
  ].map((v) => [v.id, v]),
);

const LICENSE_STATUS_LABELS = Object.fromEntries(
  [
    { id: "expired", label: "Expired", severity: "crit" },
    { id: "expiring", label: "Expiring", severity: "warn" },
    { id: "renewal-submitted", label: "Renewal submitted", severity: "info" },
    { id: "active", label: "Active", severity: "ok" },
  ].map((v) => [v.id, v]),
);

/** Wires every static DS control once, at page init. */
function wireDsControls() {
  wireDsFilterBar("ds-pipeline");

  wireDsFilterBar("ds-insp", {
    onReset: () => {
      const type = document.getElementById("ds-insp-type");
      if (type) type.value = "";
      const sort = document.getElementById("ds-insp-sort");
      if (sort) sort.value = "default";
    },
  });
  wireDsExtraSelect("ds-insp-type", "ds-insp", "inspectionType");
  wireDsExtraTrigger("ds-insp-sort", "ds-insp");

  wireDsFilterBar("ds-wo", {
    onReset: () => {
      const manager = document.getElementById("ds-wo-manager");
      if (manager) manager.value = "";
    },
  });
  wireDsExtraSelect("ds-wo-manager", "ds-wo", "managerRef");

  wireDsFilterBar("ds-ce", {
    onReset: () => {
      const type = document.getElementById("ds-ce-type");
      if (type) type.value = "";
      const officer = document.getElementById("ds-ce-officer");
      if (officer) officer.value = "";
    },
  });
  wireDsExtraSelect("ds-ce-type", "ds-ce", "violationType");
  wireDsExtraSelect("ds-ce-officer", "ds-ce", "officerRef");

  wireDsFilterBar("ds-lic", {
    onReset: () => {
      const type = document.getElementById("ds-lic-type");
      if (type) type.value = "";
    },
  });
  wireDsExtraSelect("ds-lic-type", "ds-lic", "type");

  wireWorkOrderViewModes();
}

/**
 * The lens. Four regions off the route the product already serves, in
 * parallel, plus the fifth (pipeline) loaded separately since it long
 * predates this batch and keeps its own route.
 */
async function loadDevelopmentServices(cityKey) {
  const [inspections, workOrders, codeViolations, licences] = await Promise.all([
    loadDomain("inspections", cityKey),
    loadDomain("work-orders", cityKey),
    loadDomain("code-violations", cityKey),
    loadDomain("business-licenses", cityKey),
  ]);
  renderInspections(inspections || unreadRegion("Inspections", cityKey));
  renderWorkOrders(workOrders || unreadRegion("Work orders", cityKey));
  renderCodeEnforcement(codeViolations || unreadRegion("Code enforcement", cityKey));
  renderLicences(licences || unreadRegion("Licenses", cityKey));
}

/* --------------------------------------------------------- G-128 map dock
 *
 * Property detail and on-this-parcel records for the persistent map rail,
 * fetched by the shell itself from the SAME /api/property-map/summary route
 * web/property-map.js's own iframe already calls (src/property-map.mjs's
 * composePropertyIntelSummary) -- no new server route, no map-engine change.
 *
 * Queried address: the product's established gold parcel is
 * GOLD_PARCEL_NODE_ID "48021:34137" (src/staff-map.mjs), and the approved
 * design mockup (_design/smartcity-map-dock/) pairs that exact parcel id
 * with "908 Pine St" as the address the panel shows. That address is not
 * itself a constant anywhere in this repo -- composePropertyIntelSummary
 * takes an address, not a parcel id, and no fixture equivalent exists for a
 * live ArcGIS-backed search (see that module's own header). Verify this
 * resolves against the real geocoder for this pack's one served city as
 * part of this row's live probe; if it does not, this panel renders the
 * honest not-read/no-match state below rather than fabricated data either
 * way.
 */
const DS_PROPERTY_DOCK_ADDRESS = "908 Pine St";

/** Real values only -- never the free-text description field a permit,
 * code case, or inspection record may also carry (same rule as G-123's
 * tables). Only id/subject/status cross into the row. */
function propertyRecordRow(record) {
  const id = record.permitNumber || record.caseNumber || "";
  return [
    td(id, "id"),
    td(record.type, "subj"),
    td(record.status),
  ];
}

function renderPropertyDetail(result) {
  const rows = document.getElementById("ds-property-detail-rows");
  if (!rows) return;
  const snapshot = (result && result.snapshot) || {};
  const items = [
    { k: "Zoning district", v: snapshot.zoning, basis: snapshot.zoningCode ? `zoning code: ${snapshot.zoningCode}` : null },
    { k: "Flood zone", v: snapshot.floodZone, basis: null },
    {
      k: "Buildable area",
      v: "Refused",
      basis: "Refused by ruling R-2: the envelope draws, the figure is withheld until an envelope atom backs it",
    },
  ];
  rows.replaceChildren(
    ...items.map((item) => {
      const row = document.createElement("div");
      row.className = "pdl-row";
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = item.k;
      const v = document.createElement("span");
      v.className = "v";
      v.textContent = item.v == null || item.v === "" ? "—" : item.v;
      row.append(k, v);
      if (item.basis) {
        const b = document.createElement("span");
        b.className = "basis";
        b.textContent = item.basis;
        row.append(b);
      }
      return row;
    }),
  );
}

/**
 * A11y: th-has-data-cells fired on this table when it rendered with real
 * headers and an empty tbody -- headers describing nothing is not a pass.
 * Same shape as ds-pipeline-empty/ds-pipeline-records elsewhere on this
 * lens: the table and its honest-empty sibling are mutually hidden, never
 * both, and never a headers-only table left visible with zero rows.
 */
function renderPropertyRecords(result, basisText) {
  const rowsEl = document.getElementById("ds-property-records-rows");
  const countEl = document.getElementById("ds-property-records-count");
  const body = document.getElementById("ds-property-records-body");
  const empty = document.getElementById("ds-property-records-empty");
  const emptyBasis = document.getElementById("ds-property-records-basis");
  if (!rowsEl) return;
  const records = result
    ? [...(result.permits || []), ...(result.violations || []), ...(result.inspections || [])]
    : [];
  if (records.length === 0) {
    if (countEl) countEl.textContent = "";
    if (emptyBasis) emptyBasis.textContent = `Basis: ${basisText || "no records on file for this parcel"}`;
    show(empty, true);
    show(body, false);
    rowsEl.replaceChildren();
    return;
  }
  show(empty, false);
  show(body, true);
  if (countEl) countEl.textContent = `${records.length} records`;
  rowsEl.replaceChildren(
    ...records.map((record) => {
      const row = document.createElement("tr");
      row.append(...propertyRecordRow(record));
      return row;
    }),
  );
}

/**
 * Single-city-only, stated not assumed -- same refusal composePropertyIntelSummary
 * itself returns for any cityKey outside its one real ArcGIS-backed pack,
 * rendered honestly here rather than an empty map that looks broken
 * (constraint named in this row's dispatch).
 */
async function loadPropertyDock(cityKey) {
  const params = new URLSearchParams({ address: DS_PROPERTY_DOCK_ADDRESS, cityKey: cityKey || "" });
  let data = null;
  try {
    const res = await fetch(`/api/property-map/summary?${params}`);
    data = res.ok ? await res.json() : null;
  } catch {
    data = null;
  }
  if (!data || data.status !== "ok" || !data.found || !data.result) {
    renderPropertyDetail(null);
    renderPropertyRecords(null, `Not read: ${(data && data.basis) || "property intel did not read for this pack"}`);
    return;
  }
  renderPropertyDetail(data.result);
  renderPropertyRecords(data.result, null);
}

/**
 * The map's own Dock/Expand/Full pill lives inside property-map.js (the
 * iframe), overlaying the map itself -- see THE LAYERS RULE in this row's
 * dispatch for why the layers panel has to live there too. It posts its
 * mode as UI STATE, never map-engine data (no parcel, no click, nothing the
 * map found), and the shell's only job is to reflow the lens CSS around
 * whichever anchor is currently showing the map and re-settle the floating
 * iframe onto its new size -- settle(), not transitionTo(), since this is a
 * same-anchor resize, not the modal-style open/close FLIP animation max
 * still uses for Plan review and Files.
 */
function bindMapDockMode() {
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.type !== "sc-map-dock-mode") return;
    const mode = event.data.mode;
    if (mode !== "dock" && mode !== "expand" && mode !== "full") return;
    const mapStage = stages.get("map");
    const anchor = mapStage ? mapStage.findAnchor() : null;
    const wrapper = anchor ? anchor.closest(".shell-regions") : null;
    if (wrapper) wrapper.setAttribute("data-map-mode", mode);
    requestAnimationFrame(() => {
      if (mapStage) mapStage.settle();
    });
  });
}

/* ---------------------------------------------------------------- routing */

function applyLens(staffLens) {
  const { lens, tab, work, assetTab, filter } = staffLens;
  const workOn = Boolean(work);

  /**
   * G-89. The root attributes are what decide visibility at FIRST PAINT, stamped
   * by the inline script in the head of index.html before this module has run.
   * They are rewritten here, from the same staffLens fields the class toggles
   * below read, for one reason: if the attribute governed and this function only
   * moved a class, the class would be decorative and any future JS-driven lens
   * change would silently do nothing. One writer, one source, so the attribute
   * and the class can never disagree - and both stay live.
   */
  const root = document.documentElement;
  root.setAttribute("data-surface", workOn ? `work-${work}` : `lens-${lens}`);
  root.setAttribute("data-tab", tab);
  root.setAttribute("data-atab", assetTab);
  /**
   * G-120. The filter an Overview tile carried arrives here, not read again
   * from location.search by whatever destination wants it: one resolver, one
   * writer, same as data-tab above. A destination lens that has no filter UI
   * yet simply carries the attribute unused, same as data-atab does off the
   * assets lens.
   */
  root.setAttribute("data-filter", filter || "");

  document.querySelectorAll(".lens").forEach((el) => {
    if (el.id.startsWith("work-")) {
      el.classList.toggle("on", workOn && el.id === `work-${work}`);
    } else {
      el.classList.toggle("on", !workOn && el.id === `lens-${lens}`);
    }
  });

  /**
   * Exactly one nav item is current. A Work item that also carries a lens and a
   * tab used to light up alongside the lens item it navigated into, so "you are
   * here" pointed at two places at once.
   */
  document.querySelectorAll(".navitem[data-lens], .navitem[data-work]").forEach((el) => {
    const on = workOn ? el.dataset.work === work : !el.dataset.work && el.dataset.lens === lens;
    el.classList.toggle("on", on);
  });

  document.querySelectorAll(".tabs [data-tab]").forEach((el) => {
    el.setAttribute("aria-selected", el.dataset.tab === tab ? "true" : "false");
  });
  document.querySelectorAll(".ds-tab").forEach((el) => {
    el.classList.toggle("on", el.id === `tab-${tab}`);
  });
  document.querySelectorAll(".tabs [data-atab]").forEach((el) => {
    el.setAttribute("aria-selected", el.dataset.atab === assetTab ? "true" : "false");
  });
  document.querySelectorAll(".assets-tab").forEach((el) => {
    el.classList.toggle("on", el.id === `atab-${assetTab}`);
  });

  /**
   * The theme is not a consequence of navigation. Citizen is a light surface
   * because its section carries .sc-light, which is the kit's scoped mechanism.
   * Flipping documentElement dragged the staff chrome light on a lens change.
   */
  /**
   * The resolved surface is kept so the title can be recomposed when the pack
   * resolves. Read from the same model that painted the screen, so the title
   * cannot name a surface other than the one showing.
   */
  currentSurface = staffLens;
  const label = workOn ? WORK_LABELS[work] || work : LENS_LABELS[lens] || lens;
  viewLabel = label;
  renderScope();
  setText("cp-scope-lens", label);
  if (!workOn) setText("ds-crumb", TAB_LABELS[tab] || "Pipeline");
}

async function composeGoldMap(parcelNodeId, cityKey) {
  const params = new URLSearchParams();
  if (parcelNodeId) params.set("parcelNodeId", parcelNodeId);
  if (cityKey) params.set("cityKey", cityKey);
  let data = {};
  try {
    const res = await fetch(`/api/lenses/city-manager/compose?${params}`);
    data = await res.json();
  } catch {
    data = {};
  }

  stages.get("map")?.mount(data.smartsite?.url || "");
  stages.get("review")?.mount(data.planReview?.url || "");
  stages.get("files")?.mount(data.smartFiles?.url || "");
  // G-129: capture the map stage's own default src so the flood capability
  // can revert to it on close, and render every lens's capability trigger
  // from this one composed answer.
  defaultMapStageUrl = data.smartsite?.url || "";
  floodDrainageCapability = data.floodDrainage || null;
  renderFloodCapability();

  /**
   * G-120. The right rail's lower panel used to show data.atoms's own
   * vocabulary (atom types on the demo parcel) under "Sources" - engine
   * language a city manager has no use for. It is now "On the map", scoped to
   * located records (permits, reviews, work orders, enforcement cases with an
   * address). No composition in this repo yet produces an address-bearing
   * record, so the panel ships its honest-empty state on every pack rather
   * than repainting atom types under a friendlier heading; wiring a real
   * located-records source is left open (see the G-120 close).
   */
  renderMeetings(data.meetings);
  for (const stage of stages.values()) stage.settle();
}

/* ---------------------------------------------------------------- compass */

function bindCompass() {
  const src = document.getElementById("cp-source");
  const sheet = document.getElementById("cp-sheet");
  const scrim = document.getElementById("cp-scrim");
  const close = document.getElementById("cp-close");
  if (!src || !sheet || !scrim) return;
  let open = false;

  function sheetRect() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(400, vw);
    const top = 64;
    return { x: vw - w - 16, y: top, w, h: vh - top - 16 };
  }

  function present() {
    if (open) return;
    open = true;
    const from = rectOf(src);
    const to = sheetRect();
    sheet.hidden = false;
    scrim.hidden = false;
    sheet.style.width = `${to.w}px`;
    sheet.style.height = `${to.h}px`;
    sheet.style.transform = `translate(${to.x}px, ${to.y}px)`;
    sheet.style.borderRadius = getComputedStyle(document.documentElement).getPropertyValue("--sc-r-lg").trim() || "8px";
    src.setAttribute("aria-expanded", "true");
    const duration = motionDuration();
    if (duration === 0) return;
    sheet.animate(
      [
        {
          transform: `translate(${from.x}px, ${from.y}px) scale(${from.w / to.w}, ${from.h / to.h})`,
          borderRadius: "4px",
        },
        { transform: `translate(${to.x}px, ${to.y}px) scale(1, 1)`, borderRadius: "8px" },
      ],
      { duration, easing: SPRING.easing },
    );
    document.getElementById("cp-inner")?.animate(
      [{ opacity: 0 }, { opacity: 0, offset: CONTENT_FADE_AT }, { opacity: 1 }],
      { duration, easing: "linear" },
    );
    scrim.animate([{ opacity: 0 }, { opacity: 0.34 }], { duration, easing: SPRING.easing });
  }

  function dismiss() {
    if (!open) return;
    open = false;
    src.setAttribute("aria-expanded", "false");
    const duration = motionDuration();
    const from = rectOf(sheet);
    const to = rectOf(src);
    if (duration === 0) {
      sheet.hidden = true;
      scrim.hidden = true;
      return;
    }
    const anim = sheet.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(1, 1)`, borderRadius: "8px" },
        {
          transform: `translate(${to.x}px, ${to.y}px) scale(${to.w / from.w}, ${to.h / from.h})`,
          borderRadius: "4px",
        },
      ],
      { duration, easing: SPRING.easing },
    );
    scrim.animate([{ opacity: 0.34 }, { opacity: 0 }], { duration, easing: SPRING.easing });
    anim.finished
      .then(() => {
        if (open) return;
        sheet.hidden = true;
        scrim.hidden = true;
      })
      .catch(() => {});
  }

  src.addEventListener("click", () => (open ? dismiss() : present()));
  scrim.addEventListener("click", dismiss);
  close?.addEventListener("click", dismiss);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open && !openStage()) dismiss();
  });
  window.addEventListener("resize", () => {
    if (!open) return;
    const to = sheetRect();
    sheet.style.width = `${to.w}px`;
    sheet.style.height = `${to.h}px`;
    sheet.style.transform = `translate(${to.x}px, ${to.y}px)`;
  });
}

function bindMenu() {
  const btn = document.getElementById("menu-btn");
  const nav = document.getElementById("shell-nav");
  if (!btn || !nav) return;
  btn.addEventListener("click", () => nav.classList.toggle("open"));
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) nav.classList.remove("open");
  });
}

/* -------------------------------------------------------------------- theme

G-90. The toggle, and ONLY the toggle.

The theme is RESOLVED in the inline head script in web/index.html, before the
parser reaches the body, because CSS cannot read storage and a module cannot run
before first paint. Resolving it here instead would paint the default palette on
every navigation and then repaint the chosen one, which is the G-89 defect one
attribute over.

So this file is the WRITER and the head script is the READER. The split is the
whole design: one place decides what paints, one place records what the staff
member chose, and src/theme.mjs holds the vocabulary both of them use so the two
copies of the rule can be compared rather than trusted.

Reading the current theme off the root rather than out of storage is deliberate.
The root is what the head script actually resolved, including the case where
storage was unreadable and it fell back; toggling from storage would toggle from
a value the screen is not showing.
*/

function currentTheme() {
  return resolveTheme(document.documentElement.getAttribute("data-theme"));
}

function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute("data-theme", resolved);
  setText("theme-toggle-label", themeToggleLabel(resolved));
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.title = themeToggleTitle(resolved);
  return resolved;
}

function bindTheme() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  // The label describes where the control GOES, not where it is, so it is
  // rendered from the theme the head script resolved rather than from markup.
  applyTheme(currentTheme());
  btn.addEventListener("click", () => {
    const resolved = applyTheme(nextTheme(currentTheme()));
    /**
     * A blocked or partitioned storage context throws on setItem exactly as it
     * throws on getItem. The theme still changes for this page; only the
     * persistence is lost, and losing it silently is better than an exception
     * that stops the rest of the handler.
     */
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, resolved);
    } catch (err) {
      /* persistence unavailable in this context */
    }
  });
}

/* --------------------------------------------------------------- top menus

Notifications and the account menu. Two disclosure buttons, one behaviour: at
most one open at a time, dismissed by Escape or by a click outside, and
aria-expanded kept in step with what is actually shown.
*/

const TOP_MENU_IDS = ["notif", "account"];

function closeTopMenus(exceptName) {
  for (const name of TOP_MENU_IDS) {
    if (name === exceptName) continue;
    const btn = document.getElementById(`${name}-btn`);
    const pop = document.getElementById(`${name}-pop`);
    if (!btn || !pop) continue;
    show(pop, false);
    btn.setAttribute("aria-expanded", "false");
  }
}

function bindTopMenus() {
  for (const name of TOP_MENU_IDS) {
    const btn = document.getElementById(`${name}-btn`);
    const pop = document.getElementById(`${name}-pop`);
    if (!btn || !pop) continue;
    show(pop, false);
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = btn.getAttribute("aria-expanded") === "true";
      closeTopMenus(name);
      show(pop, !open);
      btn.setAttribute("aria-expanded", open ? "false" : "true");
    });
    pop.addEventListener("click", (event) => event.stopPropagation());
  }
  document.addEventListener("click", () => closeTopMenus(""));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTopMenus("");
  });
}

/* ------------------------------------------------------------- shell state

Every control the shell grew this card has a dependency that does not exist yet,
and the honest rendering of that is a disabled control with a stated reason. The
failure mode of a stated reason is that it is written by hand in markup, is true
on the day it is typed, and is never checked again.

So the state and the sentence both come from GET /api/shell, which derives them
from the deployment's configuration and from the caller the request actually
resolved to. The static markup ships every entry disabled with "not read", which
is what is true before the answer arrives and what stays true if it never does.
*/

function applyCapability(id, capability) {
  const el = document.getElementById(id);
  if (!el) return;
  const available = capability && capability.available === true;
  el.disabled = !available;
  // The reason is on the control as well as in the group's basis line, so a
  // pointer user gets it without reading the whole menu.
  el.title = available ? "" : String((capability && capability.basis) || "");
}

function applyShellState(state) {
  const session = state.session || {};
  const caps = state.capabilities || {};
  const notifications = state.notifications || {};

  setText("session-label", session.label || "");
  setText("session-pill", session.staffUser === true ? "Staff session" : "No staff session");
  setText("session-basis", `Basis: ${session.basis || ""}`);

  applyCapability("acct-account", caps.account);
  applyCapability("acct-profile", caps.account);
  applyCapability("acct-settings", caps.account);
  applyCapability("acct-support", caps.support);
  applyCapability("acct-feedback", caps.feedback);
  applyCapability("acct-signin", caps.signIn);
  applyCapability("acct-signout", caps.signOut);

  setText("acct-account-basis", `Basis: ${(caps.account || {}).basis || ""}`);
  setText("acct-support-basis", `Basis: ${(caps.support || {}).basis || ""}`);
  setText("acct-feedback-basis", `Basis: ${(caps.feedback || {}).basis || ""}`);
  setText("acct-signin-basis", `Basis: ${(caps.signIn || {}).basis || ""}`);
  setText("acct-signout-basis", `Basis: ${(caps.signOut || {}).basis || ""}`);

  /**
   * The record-search stub is wired to the same mechanism as everything else,
   * so it stops being a stub the day a record index exists rather than the day
   * somebody remembers to delete the sentence.
   */
  const search = document.getElementById("record-search");
  const searchCap = caps.recordSearch || {};
  if (search) {
    search.disabled = searchCap.available !== true;
    search.title = searchCap.available === true ? "" : String(searchCap.basis || "");
  }
  setText("record-search-note", searchCap.basis || "");

  /**
   * NO COUNT. The server sends no count field and this renders none: not a
   * number, not a dot, not a badge. What it renders is the positive
   * determination of why the tray is empty, and the counting rule behind it.
   */
  setText("notif-basis", `Basis: ${notifications.basis || ""}`);
  setText("notif-rule", `Counting rule: ${notifications.rule || ""}`);
  const items = Array.isArray(notifications.items) ? notifications.items : [];
  setText("notif-empty", items.length === 0 ? "No notifications." : `${items.length} notifications.`);
}

async function loadShellState(cityKey) {
  const key = String(cityKey || "").trim();
  let state = null;
  try {
    const q = key ? `?cityKey=${encodeURIComponent(key)}` : "";
    const res = await fetch(`/api/shell${q}`);
    state = res.ok ? await res.json() : null;
  } catch {
    state = null;
  }
  /**
   * A failed read leaves every control disabled and every basis line saying it
   * was not read, then states the failure with its cause. An empty result is
   * not an absence, so nothing here writes "no notifications" off a fetch that
   * never answered.
   */
  if (!state) {
    setText("session-basis", `Basis: the shell state did not read for ${key || "the default pack"}`);
    setText("notif-basis", `Basis: the shell state did not read for ${key || "the default pack"}`);
    return;
  }
  applyShellState(state);
}

/* ------------------------------------------------------------- finance lens

G-156. THE FINANCE LENS, AND THE ONE WORD THAT IS NOT THE SHELL'S.

The four source states are the design's own vocabulary - MEASURED, UNACCOUNTED,
REFUSED, CONFLICT, PARTIAL - and they are NOT spliced into LENS_BADGE. That map
stays the fixture seam's five words and src/lens-claims.test.mjs holds it there
by name; a real domain is not a seam status. "Preview" is already a lens chip
word outside that map, so a lens carrying its own state word has precedent here.

The lens chip and the nav badge stay ONE paired value, as they are for every
other lens, because a header and a nav that disagree in the one place a reader
looks first is the defect that pairing exists to prevent.

NOTHING BELOW AUTHORS A SENTENCE. Every state word, basis line, refusal reason
and acquisition path is written in src/finance-lens.mjs and arrives in the
payload; this file places them and builds nodes, because the repo contains no
innerHTML anywhere and a lens is no reason to add the first one.
*/

/** State to pill class. The word is always on the row; colour never carries it alone. */
const FINANCE_PILL = {
  MEASURED: "p-ok",
  PARTIAL: "p-warn",
  UNACCOUNTED: "p-quiet",
  REFUSED: "p-crit",
  CONFLICT: "p-crit",
};

function setFinancePill(state, element) {
  if (!element) return;
  element.textContent = state;
  element.className = `pill ${FINANCE_PILL[state] || "p-quiet"}`;
}

function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The v1 capture quotation, built as nodes from the payload.
 *
 * It is rendered ONLY when the server sends it, and the server sends it only for
 * the pack the capture is about. That gate is the reason the shared document
 * carries no figure: web/index.html ships this panel in its unread state and
 * names no city, so the captured city's v1 screen contents cannot appear on
 * another city's page even if this function is called wrongly - the data is not
 * there to render.
 */
function renderFinanceCapture(payload) {
  const host = document.getElementById("finance-capture-body");
  const absence = document.getElementById("finance-capture-absence");
  const pillEl = document.getElementById("finance-capture-pill");
  if (!host) return;
  const capture = payload.capture;
  host.replaceChildren();
  /**
   * The two states of the panel, and the reason the shared document can hold it
   * without holding a figure: the absence line is what ships, and it is hidden
   * only when the server has sent a quotation for THIS pack.
   */
  if (absence) absence.hidden = Boolean(capture);
  if (pillEl) pillEl.textContent = capture ? "Quotation" : "Not read";
  if (!capture) return;

  host.append(makeEl("p", "t-caption", payload.captureIntro));
  for (const row of capture) {
    const block = makeEl("div", "finding");
    const title = makeEl("span", "ftitle");
    row.figures.forEach((figure, i) => {
      if (i) title.append(makeEl("span", "sep", "|"));
      /**
       * ONE FIGURE PER NODE, because that is how the artboards draw them: a
       * figure in its own cell with nothing glued to it, never a figure written
       * into a sentence. The first version of this renderer put them in prose,
       * and this lane's ad-hoc comparison against capture-figures.json read
       * "$244,119,103.40 " - with the space - and called it untraceable. The
       * design check's own money() trims each token and would have passed it,
       * so the near miss was in this lane's instrument and not in the check's;
       * the drawn shape is what the renderer now matches, and the episode is in
       * this lane's close rather than buried here.
       */
      title.append(makeEl("span", "t-data", figure));
    });
    title.append(makeEl("span", "grow"));
    const pill = makeEl("span", "");
    setFinancePill(row.state, pill);
    title.append(pill);
    block.append(title);
    block.append(makeEl("span", "fmeta", `v1, capture page ${Array.isArray(row.page) ? row.page.join(" and ") : row.page}`));
    block.append(makeEl("p", "f", `v1 said: ${row.v1Said}. This lens: ${row.whatThisLensDoes}`));
    host.append(block);
  }
  host.append(makeEl("p", "t-caption", payload.captureCaveat));
}

function applyFinanceLens(payload) {
  const finance = payload.finance;
  if (!finance) return;

  setText("finance-sources-rule", `Counting rule: ${finance.rule}`);
  setText("finance-counts-label", finance.label);
  setText("finance-counts-rule", `Basis: ${finance.rule}`);
  setText("finance-appropriation-note", finance.appropriationNote);
  setText("finance-fund-basis", finance.fundBasis);
  /**
   * THE TABLE AND ITS HONEST-EMPTY SIBLING, mutually hidden and never both.
   * The a11y gate settled this on the first build of this panel: a table with a
   * thead and no data rows is an unresolved conformance check, not a pass. The
   * fund list is the adopted budget feed's own output, so it is empty on every
   * pack today, and this toggle is what keeps the two states from ever being
   * visible together.
   */
  const fundRows = Array.isArray(finance.funds) ? finance.funds : [];
  show(document.getElementById("finance-fund-body"), fundRows.length > 0);
  show(document.getElementById("finance-fund-empty"), fundRows.length === 0);
  setFinancePill(finance.lens, document.getElementById("finance-state-chip"));
  /**
   * The paired half. Same word, written in the same place, so the nav and the
   * header cannot drift apart.
   */
  const badge = document.querySelector('.navitem[data-lens="finance"] .badge');
  if (badge) badge.textContent = finance.lens;

  for (const source of finance.sources) {
    const stateEl = document.querySelector(`[data-finance-state="${source.id}"]`);
    if (stateEl) {
      /**
       * A measured source shows its FIGURE and an unmeasured one shows its
       * state word, and a measured zero shows 0. Printing the word beside a
       * zero, or printing nothing at all, would blur the one difference this
       * lens exists to draw.
       */
      if (source.value !== undefined) {
        stateEl.textContent = String(source.value);
        stateEl.className = "v t-data";
      } else {
        stateEl.textContent = source.state;
        stateEl.className = "v word";
      }
    }
    const basisEl = document.querySelector(`[data-finance-basis="${source.id}"]`);
    if (basisEl) basisEl.textContent = source.basis;
    const pillEl = document.querySelector(`[data-finance-pill="${source.id}"]`);
    if (pillEl) setFinancePill(source.state, pillEl);
  }

  for (const refusal of payload.refusals || []) {
    const el = document.querySelector(`[data-finance-refusal-reason="${refusal.id}"]`);
    if (el) el.textContent = refusal.reason;
    const state = document.querySelector(`[data-finance-refusal-state="${refusal.id}"]`);
    if (state) setFinancePill(refusal.state, state);
  }

  renderFinanceCapture(payload);
}

async function loadFinanceLens(cityKey) {
  const key = String(cityKey || "").trim();
  let payload = null;
  try {
    const q = key ? `?cityKey=${encodeURIComponent(key)}` : "";
    const res = await fetch(`/api/lenses/finance/sources${q}`);
    payload = res.ok ? await res.json() : null;
  } catch {
    payload = null;
  }
  /**
   * An unread state is not an unaccounted one, and the difference is the whole
   * point of this lens. A failed read leaves the four states saying they were
   * NOT READ and says so with its cause, rather than leaving four cells that
   * look acquired and empty.
   */
  if (!payload || !payload.finance) {
    setText(
      "finance-sources-rule",
      `Basis: the finance source states did not read for ${key || "an unnamed pack"}, so the four states below are unread and this page claims nothing about them`,
    );
    return;
  }
  applyFinanceLens(payload);
}

/* ---------------------------------------------------------------- feedback

`accepted` means DELIVERED. The server is the only thing that can say so, and
this renders its answer verbatim rather than a thank-you of its own. The typed
text is left in the box on every non-delivery, because a report that vanishes
into a failed send is worse than one that was never offered.
*/

function bindFeedback() {
  const entry = document.getElementById("acct-feedback");
  const form = document.getElementById("feedback-form");
  const send = document.getElementById("feedback-send");
  const text = document.getElementById("feedback-text");
  const result = document.getElementById("feedback-result");
  if (!entry || !form || !send || !text || !result) return;
  show(form, false);
  entry.addEventListener("click", () => {
    show(form, true);
    text.focus();
  });
  send.addEventListener("click", async () => {
    const message = text.value.trim();
    if (!message) {
      result.textContent = "Basis: nothing was typed, so nothing was sent";
      return;
    }
    send.disabled = true;
    result.textContent = "Basis: sending";
    let answer = null;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, surface: location.search || "/" }),
      });
      answer = await res.json();
    } catch (err) {
      answer = { accepted: false, basis: `the request failed: ${String(err.message || err)}` };
    }
    send.disabled = false;
    result.textContent = `Basis: ${answer.basis || "the server gave no basis"}`;
    if (answer.accepted === true) text.value = "";
  });
}

/* ------------------------------------------- G-97 Fleet and Public works

Three registered domains reach a pixel here for the first time. Everything
below READS the seam this product already serves at /api/domains/<id>; nothing
below generates, seeds, fetches a vendor, or invents a shape the generator does
not return. A second data path would be the defect, not the feature.

THE FOUR SOURCE STATES ARE FOUR SENTENCES, and that is the whole point of this
block. src/fixture-seam.mjs has distinguished ok, granted-empty, ungranted and
no-fixture-source since G-91, and until now no customer could see the
difference, because no lens rendered any of them. Collapsing ungranted into
granted-empty re-creates the exact defect ruling 1 exists to close: "this city
has not granted the source" and "the source is granted and returned nothing"
are different sentences to a city, and a single "empty" says neither.

So each state gets its own KICKER and its own HEAD, and the BASIS is always the
payload's own words rather than a sentence composed here. A fifth branch,
did-not-read, follows the pipeline precedent: a failed read is not an empty
city, and an empty result is not an absence.

ONE RENDERER, THREE REGIONS. The region identity is a prefix parameter rather
than three copies of one rule (DEV_PROCESS 2.4), and the addressability gate
resolves getElementById(`${prefix}-<slot>`) as the cross product of the three
call-site literals with the nine slots. The cross product IS the required id
set, so a slot missing on one region fails the gate by name.
*/

const REGION_KICKER = {
  ok: "Records generated",
  ungranted: "No source",
  "granted-empty": "Source returned nothing",
  "no-fixture-source": "Not generating",
  "did-not-read": "Region did not read",
};

/** The tile note per state. A tile with no source says which absence it is. */
const REGION_TILE_NOTE = {
  ungranted: "No source granted",
  "granted-empty": "Source returned nothing",
  "no-fixture-source": "Pack generates nothing",
  "did-not-read": "Region did not read",
};

/**
 * The head sentence per state. Every value in it comes off the payload, so this
 * function names no vendor, no city and no freshness of its own.
 */
function regionHead(status, region, cityKey) {
  const name = region || "this";
  const pack = cityKey || "this pack";
  if (status === "ungranted") return `No source is granted for the ${name} region on ${pack}.`;
  if (status === "granted-empty") {
    return `The source for ${name} is granted on ${pack} and returned no records.`;
  }
  if (status === "no-fixture-source") {
    return `${pack} generates no records, so the ${name} region has nothing to show.`;
  }
  if (status === "did-not-read") return `The ${name} region did not read on ${pack}.`;
  return `The ${name} region is generating records on ${pack}.`;
}

/** A read that failed. Stated as its own determination, never as an empty city. */
function unreadRegion(region, cityKey) {
  const pack = String(cityKey || "").trim();
  return {
    status: "did-not-read",
    region,
    cityKey: pack,
    recordType: "",
    recordCount: 0,
    countingRule: "",
    basis: `the ${region} region did not read for ${pack}`,
    records: [],
    extras: {},
  };
}

/**
 * THE SEAM READER. One registered domain, for one pack, off the route the
 * product already serves. A non-ok response resolves to null and the caller
 * turns that into did-not-read with a basis.
 */
async function loadDomain(domainId, cityKey) {
  const key = String(cityKey || "").trim();
  try {
    const res = await fetch(
      `/api/domains/${encodeURIComponent(domainId)}?cityKey=${encodeURIComponent(key)}`,
    );
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** The four-state renderer. Returns whether the region is carrying records. */
function renderRegion(prefix, payload) {
  const mark = document.getElementById(`${prefix}-mark`);
  const prov = document.getElementById(`${prefix}-prov`);
  const caption = document.getElementById(`${prefix}-caption`);
  const state = document.getElementById(`${prefix}-state`);
  const kicker = document.getElementById(`${prefix}-kicker`);
  const head = document.getElementById(`${prefix}-head`);
  const basis = document.getElementById(`${prefix}-basis`);
  const records = document.getElementById(`${prefix}-records`);
  const recordsBasis = document.getElementById(`${prefix}-recordsbasis`);

  const status = String(payload.status || "did-not-read");
  const ok = status === "ok";
  /**
   * The mark/prov pair's shipped markup literally reads "Demo records" /
   * "Generated fixture" -- correct on every ok payload back when ok only
   * ever meant fixture, and a false claim now that a real composer can
   * also return ok. Real composers are the only ones that set
   * payload.source ("live"); fixture's composeDomain never does. Shown
   * only on the fixture path -- never claiming "Demo records" over a real
   * one, and not (yet) claiming anything in its place for a real one
   * either, since inventing a new real-provenance label is a design
   * decision this fix does not make unilaterally.
   */
  const isReal = payload.source === "live";
  show(mark, ok && !isReal);
  show(prov, ok && !isReal);
  show(records, ok);
  show(state, !ok);

  if (caption) {
    caption.textContent = ok
      ? `${payload.recordCount} ${payload.recordType} records`
      : "Not read";
  }
  if (kicker) kicker.textContent = REGION_KICKER[status] || REGION_KICKER["did-not-read"];
  if (head) head.textContent = regionHead(status, payload.region, payload.cityKey);

  /** The absence carries the basis the SEAM stated, never one written here. */
  const line = payload.basis
    ? `Basis: ${payload.basis}`
    : "Basis: no region payload has been read for this pack";
  if (basis) basis.textContent = line;
  /** A count travels with its counting rule, next to the count. */
  if (recordsBasis) {
    recordsBasis.textContent = ok ? `${line}. Counting rule: ${payload.countingRule}` : line;
  }
  return ok;
}

/**
 * The status tiles for a region. A tile with no records keeps saying Not read
 * and never shows a zero, because a zero here would be a claim the city has not
 * made. Every value that does render carries its denominator.
 */
/**
 * Real domains carry no fixture tile vocabulary to match against.
 * mygov-permits.mjs's own header says it plainly: real status values don't
 * line up with a domain's invented fixture taxonomy except by coincidence,
 * so nothing populates extras.metrics for a real payload -- only
 * extras.realStatusCounts, an honest count per REAL value, unknown
 * cardinality. Forcing that into the fixture's fixed, named tile slots
 * would be the same category error the compose layer already refuses to
 * make; the strip is rebuilt instead, one tile per real value actually
 * returned, labelled with that real value.
 */
function renderRealStatusTiles(strip, counts, noteText) {
  if (!strip) return;
  strip.replaceChildren(
    ...counts.map(({ status, count }) => {
      const tile = document.createElement("div");
      tile.className = "metric has-value";
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = status;
      const v = document.createElement("span");
      v.className = "v";
      v.textContent = String(count);
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = noteText;
      tile.append(k, v, n);
      return tile;
    }),
  );
}

function renderRegionMetrics(strip, payload) {
  if (!strip) return;
  const ok = payload.status === "ok";
  const extras = payload.extras || {};
  if (ok && Array.isArray(extras.realStatusCounts)) {
    renderRealStatusTiles(
      strip,
      extras.realStatusCounts,
      `of ${payload.recordCount} real ${payload.recordType} records`,
    );
    return;
  }
  const metrics = ok && Array.isArray(extras.metrics) ? extras.metrics : [];
  const byId = {};
  for (const metric of metrics) byId[metric.id] = metric;
  for (const tile of strip.querySelectorAll(".metric")) {
    const metric = byId[tile.dataset.metric];
    const value = tile.querySelector(".v");
    const note = tile.querySelector(".n");
    if (!metric) {
      tile.classList.remove("has-value");
      if (value) {
        value.classList.add("word");
        value.textContent = "Not read";
      }
      if (note) note.textContent = REGION_TILE_NOTE[payload.status] || "Not read";
      continue;
    }
    tile.classList.add("has-value");
    if (value) {
      value.classList.remove("word");
      value.textContent = String(metric.count);
    }
    if (note) note.textContent = `of ${payload.recordCount} generated ${payload.recordType} records`;
  }
}

/**
 * The severity vocabulary a region's own tiles declare, turned into the carrier
 * its status cells use.
 *
 * A RESOLVED STATUS RENDERS QUIET, and this is the visual law rather than a
 * preference: quiet surfaces, loud exceptions, and applicability is inverted so
 * that a pass is quiet. On a roster where eight of fourteen vehicles are in
 * service, eight coloured pills are the loudest thing on the page and they are
 * the rows that need nobody. The record contract has carried a resolved flag
 * on every status vocabulary since G-77 and no renderer had ever read it; this
 * is the first one that does.
 *
 * IT ALSO AVOIDED A MEASURED KIT DEFECT, WHICH IS NOW FIXED, and the retired
 * reason is recorded rather than deleted so that nobody re-derives it. When this
 * rule was written, --sc-ok #2F7A52 on --sc-ok-wash #E3F0E8 was 4.44:1 in the
 * light theme against 12px/500 text needing 4.5:1 - 0.06 short - and the token
 * lived in web/sc-kit.css, byte-identical across three repos, so no Dashboards
 * PR could touch it. G-98 fixed it as a product-line change: the light token is
 * #2E7750, a computed 4.623:1, landed as identical bytes in smartcity-dashboards,
 * smart-files, plan-review and the kit's vendored copy. The dark pair never
 * failed (#55BE86 composites to 6.171:1 as rendered) and did not move.
 *
 * SO THIS RULE NOW RESTS ON THE VISUAL LAW ALONE. The two reasons were always
 * separate and only one has expired; the rendering rule and the token fix are
 * INDEPENDENT and must not be read as coupled. src/render-lenses.test.mjs
 * computes the ratio live and now asserts the floor is MET, so a kit regression
 * turns the suite red from the other direction.
 *
 * ONE AXIS IS STILL UNSETTLED, and it is a different one rather than the same
 * divergence. src/adapters.mjs INSPECTION_RESULT_VALUES declares `inspected`
 * rather than `resolved`, so this function cannot see it and `passed` renders
 * through p-ok while every resolved band renders quiet. G-98 routed that to the
 * planner instead of settling it: `inspected` is also true for `failed` and
 * `corrections`, so quieting on that flag would quiet a failed inspection, and
 * the correct generalisation - one satisfied-band predicate across both
 * vocabularies - is a rule change rather than a value change.
 */
function statusLabelsFor(payload) {
  const out = {};
  const extras = payload.extras || {};
  for (const metric of Array.isArray(extras.metrics) ? extras.metrics : []) {
    out[metric.id] = { label: metric.label, severity: metric.resolved ? "quiet" : metric.severity };
  }
  return out;
}

function fill(tbody, rows) {
  if (tbody) tbody.replaceChildren(...rows);
}

/* ----------------------------------------------------------------- fleet */

/**
 * G-116 fleet-enrich. "Clear"/"N unresolved" is itself the DVIR summary --
 * a vehicle absent from Samsara's DVIR data (no inspection on record)
 * renders blank, never "Clear" (that would claim a pass that never
 * happened). dvirLastInspection is carried on the record for callers that
 * want it but is not forced into its own column here -- see rule against
 * redesigning this table.
 */
function fleetDvirLabel(record) {
  if (record.dvirUnresolvedDefects == null) return null;
  return record.dvirUnresolvedDefects > 0 ? `${record.dvirUnresolvedDefects} unresolved` : "Clear";
}

/** Real, independent threshold flags -- never fabricated when the reading behind either is unknown (both stay out of the label, not defaulted to absent). */
function fleetFlagsLabel(record) {
  const flags = [];
  if (record.highMileage === true) flags.push("High mileage");
  if (record.lowFuel === true) flags.push("Low fuel");
  return flags.join(", ");
}

function renderFleet(payload) {
  const ok = renderRegion("fleet-roster", payload);
  renderRegionMetrics(document.getElementById("fleet-metrics"), payload);
  const extras = payload.extras || {};
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  const labels = statusLabelsFor(payload);
  fill(
    document.getElementById("fleet-roster-rows"),
    records.map((record) => {
      const row = document.createElement("tr");
      row.append(
        td(record.recordId, "id"),
        td(record.unitLabel, "subj"),
        statusCell(record, labels),
        td(record.operatorRef, "id"),
        td(record.odometerBand),
        td(fleetDvirLabel(record)),
        td(record.safetyEvents7d == null ? null : String(record.safetyEvents7d)),
        td(fleetFlagsLabel(record)),
      );
      return row;
    }),
  );
  const operators = ok && Array.isArray(extras.operators) ? extras.operators : [];
  fill(
    document.getElementById("fleet-operator-rows"),
    operators.map((operator) => {
      const row = document.createElement("tr");
      row.append(td(operator.operatorRef, "id"), td(String(operator.vehicleCount)));
      return row;
    }),
  );
  /**
   * A VEHICLE IS NOT AN ASSET, said on the surface rather than only in the
   * payload. G-24 stays at zero and this is the lens that would leak into it.
   */
  if (extras.inventoryBasis) setText("fleet-roster-inventory", `Basis: ${extras.inventoryBasis}`);
  const operator = operators[0];
  if (operator) {
    setText("fleet-operator-basis", `Basis: ${operator.operatorBasis}`);
    setText("fleet-operator-rule", operator.countingRule);
  }
}

async function loadFleetLens(cityKey) {
  const payload = (await loadDomain("fleet-vehicles", cityKey)) || unreadRegion("Vehicle roster", cityKey);
  renderFleet(payload);
  applyLensState("fleet-state-chip", "fleet", sourcedLabel([payload]));
  setText("fleet-region-rule", sourcedRule([payload]));
}

/* ---------------------------------------------------------- public works */

function renderCapitalProjects(payload) {
  const ok = renderRegion("pw-cip", payload);
  renderRegionMetrics(document.getElementById("pw-cip-metrics"), payload);
  const extras = payload.extras || {};
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  const labels = statusLabelsFor(payload);
  fill(
    document.getElementById("pw-cip-rows"),
    records.map((record) => {
      const row = document.createElement("tr");
      const place = record.place && record.place.label ? record.place.label : "";
      row.append(
        td(record.recordId, "id"),
        td(record.subject, "subj"),
        /**
         * The fixture's own invented phase id (planning/design/bid/...) or,
         * for a real record, the real currentPhase getCIPProjectData()
         * computed -- never both, and never one relabeled as the other.
         */
        td(record.phase || record.currentPhase),
        td(place),
        td(record.scheduleLabel, "t-data"),
        statusCell(record, labels),
        td(pctText(record.completion), "t-data"),
      );
      return row;
    }),
  );
  const phases = ok && Array.isArray(extras.phases) ? extras.phases : [];
  fill(
    document.getElementById("pw-cip-phase-rows"),
    phases.map((phase) => {
      const row = document.createElement("tr");
      row.append(td(phase.phase, "subj"), td(String(phase.count)));
      return row;
    }),
  );
  const firstPhase = phases[0];
  if (firstPhase) setText("pw-cip-phase-rule", firstPhase.countingRule);
  /**
   * Two MEASURED classes, printed as two. Neither is the remainder of the
   * other, so the pair can be reconciled against the measured total rather than
   * agreeing by construction.
   */
  const schedule = extras.schedule;
  if (schedule) {
    setText(
      "pw-cip-schedule",
      `Behind ${schedule.behind}, on or ahead ${schedule.onOrAhead}, measured ${schedule.measured}. Counting rule: ${schedule.countingRule}`,
    );
  }
  /** No money on this register, and the refusal is stated rather than implied. */
  if (extras.budgetBasis) setText("pw-cip-budget", `Basis: ${extras.budgetBasis}`);
  /**
   * Per-task Gantt rows. Real records carry their own `phases` array
   * (getCIPProjectData()'s msdyn_projecttask summary tasks); the fixture
   * never does, so this is empty on a generated pack -- same honest-empty
   * stance as the rest of this domain. The TABLE itself is hidden in that
   * case, not left visible with an empty body: a table with header cells
   * and zero data rows is a real, separate defect (th-has-data-cells) from
   * "no fixture source" honesty, and the fix for one is not a fix for the
   * other. Hidden, the static caption below already states the absence.
   */
  const ganttRows = records.flatMap((record) =>
    (Array.isArray(record.phases) ? record.phases : []).map((phase) => ({
      ...phase,
      projectLabel: record.projectName || record.subject || record.recordId,
    })),
  );
  fill(
    document.getElementById("pw-cip-gantt-rows"),
    ganttRows.map((phase) => {
      const row = document.createElement("tr");
      row.append(
        td(phase.projectLabel, "subj"),
        td(phase.task),
        td(phase.phaseStart, "t-data"),
        td(phase.phaseEnd, "t-data"),
        td(pctText(phase.completion), "t-data"),
        td(phase.taskDuration, "t-data"),
      );
      return row;
    }),
  );
  show(document.getElementById("pw-cip-gantt-table"), ganttRows.length > 0);
  if (ganttRows.length > 0) {
    setText(
      "pw-cip-gantt-basis",
      `Basis: ${ganttRows.length} per-task phase rows read live from smartcity-os's getCIPProjectData() (services/powerbi.ts), across ${records.length} capital projects.`,
    );
  }
}

/**
 * Call analytics. AGGREGATE ONLY: the record IS a queue volume for one relative
 * day, so there is no call row to render and nothing here builds one. No
 * recording, no caller reference, no extension-to-person mapping - none of the
 * three is in the payload and none is added.
 */
function renderCallAnalytics(payload) {
  const ok = renderRegion("pw-calls", payload);
  const extras = payload.extras || {};
  const queues = ok && Array.isArray(extras.queues) ? extras.queues : [];
  fill(
    document.getElementById("pw-calls-queue-rows"),
    queues.map((queue) => {
      const row = document.createElement("tr");
      row.append(
        td(queue.queueRef, "id"),
        td(String(queue.callsOffered)),
        td(String(queue.callsAnswered)),
        td(String(queue.callsAbandoned)),
        td(String(queue.bucketCount)),
      );
      return row;
    }),
  );
  const daily = ok && Array.isArray(extras.daily) ? extras.daily : [];
  fill(
    document.getElementById("pw-calls-day-rows"),
    daily.map((day) => {
      const row = document.createElement("tr");
      row.append(
        td(day.dayLabel, "subj"),
        td(String(day.callsOffered)),
        td(String(day.callsAnswered)),
        td(String(day.callsAbandoned)),
        td(String(day.bucketCount)),
      );
      return row;
    }),
  );
  const firstQueue = queues[0];
  if (firstQueue) setText("pw-calls-queue-rule", firstQueue.countingRule);
  const firstDay = daily[0];
  if (firstDay) setText("pw-calls-day-rule", firstDay.countingRule);
  const totals = extras.totals;
  if (totals) {
    setText(
      "pw-calls-totals",
      `Offered ${totals.callsOffered}, answered ${totals.callsAnswered}, abandoned ${totals.callsAbandoned}, measured ${totals.measured}. Counting rule: ${totals.countingRule}`,
    );
  }
  /** Excluded because it must not exist, not because nobody got to it. */
  if (extras.excludedFamilies) setText("pw-calls-excluded", `Basis: ${extras.excludedFamilies}`);
}

async function loadPublicWorksLens(cityKey) {
  const projects = (await loadDomain("cip-projects", cityKey)) || unreadRegion("Capital projects", cityKey);
  const calls = (await loadDomain("call-analytics", cityKey)) || unreadRegion("Call analytics", cityKey);
  renderCapitalProjects(projects);
  renderCallAnalytics(calls);
  const regions = [projects, calls];
  applyLensState("pw-state-chip", "public-works", sourcedLabel(regions));
  setText("pw-region-rule", sourcedRule(regions));
}

/* ------------------------------------------------------------ lens state

G-100. THE BADGE IS DERIVED, BECAUSE A HAND-WRITTEN ONE GOES STALE.

Five nav badges shipped the words "Not built" for lenses that render. The
mistake was not the words. It was that a state claim about a lens was TYPED into
web/index.html, where nothing connects it to the thing that decides it, so it
stayed true for exactly as long as it took the next lane to ship a renderer.
This repo has paid for the hand-declared shape twice already, and the fix is
never a better literal.

So the static markup carries the UNREAD FALLBACK and nothing else, and every
state word on a lens is written from here, off the status the seam resolved.

WHY FIVE WORDS AND NOT TWO. sourcedLabel used to answer ok or not-ok, which put
ungranted, granted-empty and no-fixture-source behind one word - the exact
collapse ruling 1 exists to close, re-created in the nav after the lens bodies
had been fixed. A city whose Spireon grant is missing and a city that generates
nothing are not in the same state and the nav must not say they are. The keys
are the seam's own DOMAIN_STATUSES plus did-not-read, and src/lens-claims.test.mjs
reads both sides so a state added to the seam and not to this map fails by name.
*/

/**
 * One word per determination. Five determinations, five words, none shared.
 * "Empty" is kept for no-fixture-source deliberately: that is the word the
 * empty pack already renders, and a state that has not changed must not change
 * its sentence just because the vocabulary around it grew.
 */
const LENS_BADGE = {
  ok: "Demo records",
  "granted-empty": "No records",
  ungranted: "No source",
  "no-fixture-source": "Empty",
  "did-not-read": "Not read",
};

/**
 * How a lens with more than one region resolves to one word.
 *
 * This is a ROLLUP and it is stated as one rather than left to be discovered.
 * Police carries two regions on the shipped demo pack: cameras generate, and
 * patrol is the deliberately ungranted exemplar. The lens badge says
 * "Demo records" because the lens does render records - and the figure that
 * says how many of its regions are sourced is sourcedRule, which the page
 * header prints immediately beside the chip, while the ungranted region states
 * its own absence in full on the region itself. The badge is a single word by
 * the shape of the slot; the counting rule is never left to it.
 *
 * Order is DOMAIN_STATUSES order with did-not-read last, and the test holds it
 * equal to the seam's array rather than to a copy written here.
 */
const LENS_BADGE_ORDER = ["ok", "granted-empty", "ungranted", "no-fixture-source", "did-not-read"];

/** The one status a set of regions resolves to. */
function lensStatus(regions) {
  const present = new Set(regions.map((region) => String(region.status || "did-not-read")));
  return LENS_BADGE_ORDER.find((status) => present.has(status)) || "did-not-read";
}

/**
 * The lens label. Same vocabulary the pipeline already uses on the shell.
 *
 * LENS_BADGE/LENS_BADGE_ORDER stay exactly the fixture seam's own five
 * words (src/lens-claims.test.mjs holds them equal to DOMAIN_STATUSES) --
 * a real domain is not a seam status and does not get a sixth word spliced
 * into that guarded vocabulary. "Demo records" is still the true word for
 * an "ok" fixture region; it is a false one for a real "ok" region (any
 * composer that sets source: "live"), so that one case is answered before
 * the guarded lookup rather than inside it. Every fixture-composed region
 * in the existing coverage carries no source field at all, so this is a
 * pure addition: nothing already asserted about the five-word map changes.
 */
function sourcedLabel(regions) {
  const status = lensStatus(regions);
  if (status === "ok" && regions.some((r) => r && r.source === "live")) return "Live records";
  return LENS_BADGE[status] || LENS_BADGE["did-not-read"];
}

/** The figure, with its denominator and its counting rule at the point of use. */
function sourcedRule(regions) {
  const sourced = regions.filter((region) => region.status === "ok").length;
  const noun = regions.length === 1 ? "region" : "regions";
  return `${sourced} of ${regions.length} ${noun} sourced; a region is sourced when its kind is granted on this pack and it returned records`;
}

/**
 * The page chip, the nav badge and the Overview register row are one paired
 * control, so they read one function and cannot diverge at runtime the way
 * three careful edits would.
 *
 * G-100 added the third rendering. The Overview register is the page that
 * answers "every lens on the roster, and whether it read", and it was answering
 * it from typed markup while two other renderings of the same fact were already
 * derived - which is how it came to file four rendering lenses under a heading
 * that said they were not built. A row that carries no data-lens-row is left
 * exactly as the document wrote it, so this can only ever speak for a lens the
 * registry knows about.
 */
function applyLensState(chipId, lensId, label) {
  const chip = document.getElementById(chipId);
  if (chip) chip.textContent = label;
  const badge = document.querySelector(`.navitem[data-lens="${lensId}"] .badge`);
  if (badge) badge.textContent = label;
  const row = document.querySelector(`[data-lens-row="${lensId}"] .pill`);
  if (row) row.textContent = label;
}


/* ------------------------------------------ G-97 Police and Fire and EMS

Three more registered domains reach a pixel. Everything below READS the seam the
product already serves at /api/domains/<id> and composes it with the SAME
renderer G-97 R3 landed for Fleet and Public works: renderRegion, its kicker and
head tables, renderRegionMetrics, statusLabelsFor, applyLensState, sourcedLabel
and sourcedRule are reused rather than re-implemented.

THAT REUSE IS THE POINT OF THIS BLOCK'S SHAPE, and it is a correction. This lane
first shipped its own four-state resolver in a served src/ module, which was
defensible while it was the only one; R3 merged first with the copy inline, and
two implementations of one rule on one page is the CTRL-1 shape this program has
paid for twice. Converging on the merged one costs this lane its Node-testable
resolver and buys the product a single sentence per state across four lenses.
The behavioural proof of all four states moves to the lane's rendered walk, which
is where R3's proof already lives, and the close carries it.

WHAT IS DIFFERENT HERE, and it is only the data. Police carries TWO regions, one
of which is the single deliberately ungranted region in the product: spireon is
kept off the demonstration axis on purpose, so patrol-vehicles renders BUILT and
sourceless on the shipped demo pack. Fire and EMS carries one region with a
station dimension. Nothing below invents a field the generators do not return:
the camera domain carries no plate read, no person of interest and no counted
occupancy, and the apparatus domain names no crew.
*/

/**
 * The camera region. The site and occupancy dimensions are counted off the
 * records by the generator and rendered as they arrive; occupancy is a BAND and
 * one of the bands is "occupancy not measured", rendered as itself, because a
 * camera that is not reporting has no occupancy and a zero there would be a
 * count of people nobody took.
 */
function renderPoliceCameras(payload) {
  const ok = renderRegion("police-cameras", payload);
  renderRegionMetrics(document.getElementById("police-cameras-metrics"), payload);
  const extras = payload.extras || {};
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  const labels = statusLabelsFor(payload);
  fill(
    document.getElementById("police-cameras-rows"),
    records.map((record) => {
      const row = document.createElement("tr");
      row.append(
        td(record.recordId, "id"),
        statusCell(record, labels),
        td(record.siteRef, "id"),
        td(record.placement),
        td(record.occupancyBand),
      );
      return row;
    }),
  );
  const sites = ok && Array.isArray(extras.sites) ? extras.sites : [];
  fill(
    document.getElementById("police-cameras-site-rows"),
    sites.map((site) => {
      const row = document.createElement("tr");
      row.append(td(site.siteRef, "id"), td(site.placement), td(String(site.cameraCount)));
      return row;
    }),
  );
  const occupancy = (ok && extras.occupancy) || {};
  const bands = Array.isArray(occupancy.bands) ? occupancy.bands : [];
  fill(
    document.getElementById("police-cameras-occupancy-rows"),
    bands.map((band) => {
      const row = document.createElement("tr");
      row.append(td(band.band, "subj"), td(String(band.count)));
      return row;
    }),
  );
  /** Every figure with its rule, at the point of use. */
  setText(
    "police-cameras-sites-rule",
    sites.length ? sites[0].countingRule : "An opaque site reference, never an address",
  );
  setText(
    "police-cameras-occupancy-basis",
    occupancy.countingRule || "The occupancy dimension has not been read for this pack",
  );
  /**
   * The privacy exclusion is a POSITIVE statement on the surface rather than a
   * gap in it, and the words are the record contract's rather than this file's.
   */
  setText(
    "police-cameras-privacy",
    extras.excludedFamilies || "The excluded record families have not been read for this pack",
  );
  setText(
    "police-cameras-inventory",
    extras.inventoryBasis || "The inventory position has not been read for this pack",
  );
}

/**
 * The "Inactive in NSpire" badge from the real staff fleet page, ported
 * additively. record.activeInNspire is a tri-state (true/false/null) real
 * field -- a fixture record or a real one read without include_inactive
 * carries null here, and the cell renders blank rather than a false badge.
 */
function nspireStatusCell(record) {
  const cell = document.createElement("td");
  if (record.activeInNspire === false) {
    const pill = document.createElement("span");
    pill.className = `pill ${SEVERITY_PILL.quiet}`;
    pill.textContent = "Inactive in NSpire";
    cell.append(pill);
  }
  return cell;
}

/**
 * The patrol roster, and it is the region this row exists to make visible. On
 * the shipped demo pack it renders ungranted: BUILT, instrumented, and with no
 * source, which is a different sentence from a region that does not exist and a
 * different sentence again from a source that returned nothing.
 */
function renderPatrolRoster(payload) {
  const ok = renderRegion("patrol-vehicles", payload);
  renderRegionMetrics(document.getElementById("patrol-vehicles-metrics"), payload);
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  const labels = statusLabelsFor(payload);
  fill(
    document.getElementById("patrol-vehicles-rows"),
    records.map((record) => {
      const row = document.createElement("tr");
      row.append(
        td(record.unitLabel, "subj"),
        statusCell(record, labels),
        td(record.operatorRef, "id"),
        nspireStatusCell(record),
        td(record.maintenanceAlertCount),
        td(record.recentAlertCount),
      );
      return row;
    }),
  );
  setText(
    "patrol-vehicles-operator",
    (records[0] && records[0].operatorBasis) || "The operator reference has not been read for this pack",
  );
}

async function loadPoliceLens(cityKey) {
  const regions = await Promise.all([
    loadDomain("police-cameras", cityKey),
    loadDomain("patrol-vehicles", cityKey),
  ]);
  const cameras = regions[0] || unreadRegion("camera inventory", cityKey);
  const patrol = regions[1] || unreadRegion("patrol roster", cityKey);
  renderPoliceCameras(cameras);
  renderPatrolRoster(patrol);
  applyLensState("police-state-chip", "police", sourcedLabel([cameras, patrol]));
  setText("police-region-rule", sourcedRule([cameras, patrol]));
}

/**
 * The apparatus region. Readiness is counted PER STATION rather than city wide,
 * because a city with every out of service truck in one station is a different
 * fact from a city with one in each, and the rollup cannot say which.
 */
function renderFireApparatus(payload) {
  const ok = renderRegion("fire-apparatus", payload);
  renderRegionMetrics(document.getElementById("fire-apparatus-metrics"), payload);
  const extras = payload.extras || {};
  const records = ok && Array.isArray(payload.records) ? payload.records : [];
  const labels = statusLabelsFor(payload);
  fill(
    document.getElementById("fire-apparatus-rows"),
    records.map((record) => {
      const row = document.createElement("tr");
      row.append(
        td(record.unitLabel, "subj"),
        td(record.apparatusType),
        statusCell(record, labels),
        td(record.stationLabel),
      );
      return row;
    }),
  );
  const stations = ok && Array.isArray(extras.stations) ? extras.stations : [];
  fill(
    document.getElementById("fire-apparatus-station-rows"),
    stations.map((station) => {
      const row = document.createElement("tr");
      row.append(
        td(station.stationLabel, "subj"),
        td(String(station.apparatusCount)),
        td(String(station.readyCount)),
      );
      return row;
    }),
  );
  setText(
    "fire-apparatus-stations-rule",
    stations.length ? stations[0].countingRule : "Readiness per station, never a city-wide rollup",
  );
  setText(
    "fire-apparatus-ready-rule",
    extras.readyCountingRule || "The readiness counting rule has not been read for this pack",
  );
  /** A generated record names nobody, and says so rather than leaving a gap. */
  setText(
    "fire-apparatus-crew",
    (stations[0] && stations[0].crewBasis) || "The crew position has not been read for this pack",
  );
}

async function loadFireEmsLens(cityKey) {
  const payload = (await loadDomain("fire-apparatus", cityKey)) || unreadRegion("apparatus", cityKey);
  renderFireApparatus(payload);
  applyLensState("fire-ems-state-chip", "fire-ems", sourcedLabel([payload]));
  setText("fire-ems-region-rule", sourcedRule([payload]));
}

/**
 * G-161. THE STATED NO-CITY STATE.
 *
 * Reveals the panel web/index.html ships hidden for this branch, and hides every
 * lens surface, so the two can never be on screen together.
 *
 * It hides surfaces with the bare [hidden] attribute rather than with a class of
 * its own. web/shell.css carries exactly one rule that outranks the lens
 * show/hide enumeration ([hidden] with !important, added after two components
 * had each bought a private patch for this), and a second visibility mechanism
 * for one question is the defect that comment says has already been paid for
 * twice. The class-based enumeration still runs underneath and still tracks the
 * address; it just cannot win against a hidden attribute, which is correct,
 * because hidden means hidden.
 *
 * Nothing here is written from a response. The panel's words are the static
 * ones, so a build whose enumeration returned 401 or never arrived says exactly
 * what a build that got an empty list says - which is the truth in all three
 * cases: this surface was not told which city to read.
 */
function showNoCityState() {
  for (const el of document.querySelectorAll(".lens")) show(el, false);
  show(document.getElementById("no-city-state"), true);
}

/* ------------------------------------------------------------------- boot */

const staffLens = resolveStaffLensQuery(window.location.search);
const staffMap = resolveStaffMapQuery(window.location.search);

/**
 * G-161. THE CITY IS NAMED, IN THIS ORDER, OR THE SURFACE SAYS SO.
 *
 * resolveStaffMapQuery() used to end in `cityKey: cityKey || DEFAULT_CITY_KEY`,
 * so a visit that named no city resolved to the DEMO pack and every loader below
 * booted against it: one city's name, seal, counts and records rendered for a
 * visitor who had asked for none of them. The server half of that defect (the
 * seven keyless route defaults) went in this same lane; this is the half that
 * made a BARE VISIT land on the demo, and it goes with it.
 *
 * The order is the lane's, and it is the only order that never invents a city:
 *
 *   1. An EXPLICIT choice. ?cityKey in the address, already resolved into
 *      staffMap.cityKey by resolveStaffMapQuery above.
 *   2. Otherwise the CALLER'S OWN RESOLVED TENANT. A Hauska product key or a
 *      staff sign-in names a city SERVER-side, and this module cannot work that
 *      out for itself - src/city-identity.test.mjs forbids web/app.js from
 *      carrying any shipped pack's key as a literal, and it should. So it asks
 *      GET /api/city-packs, the one route it may call WITHOUT naming a city
 *      because it is an enumeration, and reads back the tenant the server has
 *      already resolved. A null there is a real state rather than an error: it
 *      is a caller who is the subject of nothing (src/tenancy.mjs).
 *   3. Otherwise NOTHING, and no loader is called at all. showNoCityState()
 *      reveals the stated no-city panel and hides the lens surfaces, so the boot
 *      reads no city rather than the wrong one.
 *
 * It never falls back to the demo pack, and it never sends an empty cityKey to a
 * route: a keyless route call is a 400 as of this lane, and a client still
 * making one would be relying on that refusal to keep working.
 */
async function callerTenantCityKey() {
  try {
    const res = await fetch("/api/city-packs");
    if (!res.ok) return "";
    const body = await res.json();
    return String((body && body.caller && body.caller.tenant) || "").trim();
  } catch (err) {
    /**
     * An unreachable enumeration is not a licence to guess a city. The surface
     * falls to the no-city state, which is honest about what it does not know.
     */
    return "";
  }
}

staffMap.cityKey = staffMap.cityKey || (await callerTenantCityKey());

/**
 * Every nav href shipped in index.html (all 24 of them: every lens, every
 * work item, every tab) is a static /?lens=... or /?work=... link with no
 * cityKey of its own. That was correct by coincidence for the one pack
 * that used to exist -- the boot's default is what staffMap.cityKey fell
 * back to with no query at all -- and silently wrong for any other:
 * clicking ANY nav item drops the visitor back onto the default pack,
 * discarding whatever real pack they were actually looking at. The Hauska
 * key survives navigation because it persists in localStorage (see the
 * bootstrap above); cityKey deliberately does not persist anywhere and is
 * re-read from the URL on every load, so navigation is the one thing that
 * has to carry it forward instead. Threaded through once at boot from the
 * same staffMap.cityKey every loader below already uses.
 *
 * G-161 widened the guard. It used to thread only when the key DIFFERED from
 * the default, because the default pack's own visitors were already where the
 * links pointed. There is no default any more, and a pack named explicitly -
 * including the demo pack - must keep its visitor on that pack, so the guard is
 * now simply "a city resolved". A no-city visit keeps the static hrefs, which
 * carry no city, which is exactly right: the next page is a no-city page too.
 */
if (staffMap.cityKey) {
  for (const a of document.querySelectorAll('a[href^="/?"]')) {
    const url = new URL(a.getAttribute("href"), window.location.origin);
    if (!url.searchParams.has("cityKey")) {
      url.searchParams.set("cityKey", staffMap.cityKey);
      a.setAttribute("href", `${url.pathname}?${url.searchParams.toString()}`);
    }
  }
}

applyLens(staffLens);
const resettle = bindStages();
bindMapDockMode();
bindCompass();
bindMenu();
bindTheme();
bindTopMenus();
bindFeedback();

/**
 * G-161. THE LOADERS SIT ON ONE SIDE OF ONE BRANCH, AND THAT IS THE WHOLE FIX.
 *
 * Every call below takes the city as its first argument and none of them has a
 * city to take when the resolution above returned nothing. Calling them anyway
 * would send an empty cityKey, which the routes now refuse 400 - so the branch
 * is not tidiness, it is the difference between a surface that reads no city and
 * a surface that fires twelve failing requests and renders "not read" for each
 * of them as if the city had answered.
 *
 * The chrome's bindings above stay outside the branch on purpose: the menu, the
 * theme toggle, the compass and the top menus are this PRODUCT's controls rather
 * than any city's, and a no-city surface must still be operable.
 */
if (staffMap.cityKey) {
  loadShellState(staffMap.cityKey);
  loadFinanceLens(staffMap.cityKey);
  loadIdentity(staffMap.cityKey);
  composeGoldMap(staffMap.parcelNodeId, staffMap.cityKey);
  wireDsControls();
  loadPipeline(staffMap.cityKey);
  loadDevelopmentServices(staffMap.cityKey);
  loadPropertyDock(staffMap.cityKey);
  loadFleetLens(staffMap.cityKey);
  loadPublicWorksLens(staffMap.cityKey);
  loadPoliceLens(staffMap.cityKey);
  loadFireEmsLens(staffMap.cityKey);
} else {
  showNoCityState();
}
if (resettle) resettle();
