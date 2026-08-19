import { resolveStaffMapQuery } from "/staff-map.mjs";
import { resolveStaffLensQuery } from "/staff-review.mjs";

const LENS_LABELS = {
  "city-manager": "Overview",
  "development-services": "Development services",
  finance: "Finance",
  citizen: "Citizen",
  "public-works": "Public works",
  parks: "Parks",
  police: "Police",
  "fire-ems": "Fire and EMS",
  fleet: "Fleet",
};

const TAB_LABELS = {
  pipeline: "Pipeline",
  place: "Place",
  review: "Review",
  inspections: "Inspections",
  "code-enforcement": "Code enforcement",
  licenses: "Licenses",
};

const WORK_LABELS = {
  files: "Files",
  review: "Plan review",
  records: "Records search",
  assets: "Assets",
  connections: "Connections",
  people: "People and access",
};

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

function renderScope() {
  setText("cp-source-scope", `${currentPackName()} · ${viewLabel}`);
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
   * The footer figure is about the pack being viewed, and its counting rule
   * travels beside it. The register's product-wide figure stays on Connections.
   */
  const sources = identity.sources || {};
  if (sources.label) setText("nav-sources", sources.label);
  if (sources.rule) setText("nav-sources-rule", sources.rule);

  if (identity.documentTitle) document.title = identity.documentTitle;
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
    if (this.state === "presented") {
      const w = Math.min(1080, vw - 64);
      const h = Math.min(760, vh - 96);
      return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
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
    this.el.classList.toggle("is-presented", state === "presented");
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
  open.el.classList.remove("is-presented", "is-max");
}

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
    const present = event.target.closest("[data-stage-present]");
    const max = event.target.closest("[data-stage-max]");
    if (!present && !max) return;
    const name = (present || max).dataset.stagePresent || (present || max).dataset.stageMax;
    const stage = stages.get(name);
    if (!stage || !stage.mounted) return;
    event.preventDefault();
    const want = present ? "presented" : "max";
    setText("stage-esc-label", stage.label);
    stage.transitionTo(stage.state === want ? "collapsed" : want);
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

/**
 * The nav badge and the page-header chip are a paired control and a ui test
 * asserts they agree. Both read this one function, so they cannot diverge at
 * runtime the way two careful edits eventually would.
 */
function packStateLabel(pipeline) {
  return pipeline && pipeline.generated ? "Demo records" : "Empty";
}

function applyPackState(pipeline) {
  const label = packStateLabel(pipeline);
  const chip = document.getElementById("ds-state-chip");
  if (chip) chip.textContent = label;
  const badge = document.querySelector('.navitem[data-lens="development-services"] .badge');
  if (badge) badge.textContent = label;
}

function td(text, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
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

function dueCell(record) {
  const cell = document.createElement("td");
  const value = document.createElement("span");
  value.className = "t-data";
  value.textContent = record.dueLabel;
  cell.append(value);
  return cell;
}

function renderPipelineMetrics(pipeline) {
  for (const metric of pipeline.metrics || []) {
    const el = document.querySelector(`#ds-metrics .metric[data-metric="${metric.id}"]`);
    if (!el) continue;
    const value = el.querySelector(".v");
    const note = el.querySelector(".n");
    if (!pipeline.generated) {
      el.classList.remove("has-value");
      if (value) {
        value.classList.add("word");
        value.textContent = "Not read";
      }
      if (note) note.textContent = "No permit source";
      continue;
    }
    el.classList.add("has-value");
    if (value) {
      value.classList.remove("word");
      value.textContent = String(metric.count);
    }
    /** The counting rule travels with the number, next to the number. */
    if (note) note.textContent = `of ${pipeline.recordCount} generated cases in flight`;
  }
}

function renderPipeline(pipeline) {
  const empty = document.getElementById("ds-pipeline-empty");
  const wrap = document.getElementById("ds-pipeline-records");
  const rows = document.getElementById("ds-pipeline-rows");
  const mark = document.getElementById("ds-pipeline-mark");
  const prov = document.getElementById("ds-pipeline-prov");
  const caption = document.getElementById("ds-pipeline-caption");
  const basis = document.getElementById("ds-pipeline-basis");
  const emptyHead = document.getElementById("ds-pipeline-empty-head");
  const emptyBasis = document.getElementById("ds-pipeline-empty-basis");

  applyPackState(pipeline);
  renderPipelineMetrics(pipeline);
  /**
   * The Development services breadcrumb used to be written from here, which
   * made the pipeline a second writer of the city's identity. It is now a
   * [data-pack-name] element like every other crumb, with applyIdentity as its
   * only writer, and a test asserts the two paths agree on displayName.
   */

  const records = Array.isArray(pipeline.records) ? pipeline.records : [];
  const statusLabels = {};
  for (const metric of pipeline.metrics || []) {
    statusLabels[metric.id] = { label: metric.label, severity: metric.severity };
  }

  if (records.length === 0) {
    show(empty, true);
    show(wrap, false);
    if (rows) rows.replaceChildren();
    show(mark, false);
    show(prov, false);
    if (caption) caption.textContent = "Cases in flight";
    if (emptyHead) {
      emptyHead.textContent = `No cases are in flight on ${pipeline.cityKey || "this pack"}.`;
    }
    /** The absence carries the basis the pack itself stated. */
    if (emptyBasis && pipeline.basis) emptyBasis.textContent = `Basis: ${pipeline.basis}`;
    return;
  }

  show(empty, false);
  show(wrap, true);
  show(mark, true);
  show(prov, true);
  if (caption) caption.textContent = `${records.length} cases in flight`;
  if (basis) basis.textContent = `Basis: ${pipeline.basis}`;
  if (!rows) return;
  rows.replaceChildren(
    ...records.map((record) => {
      const row = document.createElement("tr");
      row.append(
        td(record.recordId, "id"),
        td(record.subject, "subj"),
        td(STAGE_LABELS[record.stage] || record.stage),
        td(record.place && record.place.label ? record.place.label : ""),
        dueCell(record),
        statusCell(record, statusLabels),
      );
      return row;
    }),
  );
}

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
  /**
   * A failed read is not an empty city. It renders as a stated failure with its
   * own basis rather than as a city that has no cases.
   */
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

/* ---------------------------------------------------------------- routing */

function applyLens(staffLens) {
  const { lens, tab, work, assetTab } = staffLens;
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

  const atoms = data.atoms || {};
  const types = Array.isArray(atoms.types) ? atoms.types.join(", ") : "";
  setText("atoms-basis", atoms.basis || data.smartsite?.basis || "");
  if (atoms.status === "ok" && Number(atoms.atomCount) > 0) {
    setText("atoms-read", `${atoms.atomCount} records read`);
    setText("atoms-summary", `${atoms.atomCount} records on the map subject. Types: ${types || "none named"}`);
  } else {
    setText("atoms-read", "Not read");
    setText("atoms-summary", atoms.status ? `Records ${atoms.status}` : "");
  }
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

/* ------------------------------------------------------------------- boot */

const staffLens = resolveStaffLensQuery(window.location.search);
const staffMap = resolveStaffMapQuery(window.location.search);

applyLens(staffLens);
const resettle = bindStages();
bindCompass();
bindMenu();
loadIdentity(staffMap.cityKey);
composeGoldMap(staffMap.parcelNodeId, staffMap.cityKey);
loadPipeline(staffMap.cityKey);
if (resettle) resettle();
