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
  const emptyKicker = document.getElementById("ds-pipeline-empty-kicker");
  const emptyBasis = document.getElementById("ds-pipeline-empty-basis");

  applyPackState(pipeline);
  renderPipelineMetrics(pipeline);
  /**
   * The Development services breadcrumb used to be written from here, which
   * made the pipeline a second writer of the city's identity. It is now a
   * [data-pack-name] element like every other crumb, with applyIdentity as its
   * only writer, and a test asserts the two paths agree on displayName.
   */

  /**
   * G-97. The state sentence is written on EVERY render, not only when the
   * queue is empty.
   *
   * The pipeline said one sentence for all four source states, so an ungranted
   * region and a city that generates nothing read identically; the compose has
   * carried sourceStatus since G-91 and nothing had ever read it. Writing it
   * unconditionally also stops the hidden block keeping a stale claim: with
   * records on screen the honest-empty text is not displayed, but it is still in
   * the document, and "Pipeline unread" sitting under fourteen rendered cases is
   * a sentence this pack has not earned.
   */
  const sentence = sourceSentence(pipeline.sourceStatus);
  if (emptyKicker) emptyKicker.textContent = sentence.kicker;
  if (emptyHead) emptyHead.textContent = sentence.headline;
  /** The absence carries the basis the pack itself stated. */
  if (emptyBasis && pipeline.basis) emptyBasis.textContent = `Basis: ${pipeline.basis}`;

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

/* ------------------------------------------------- the four source states

RULING 1 AT THE PIXEL (OPS-17 A-076, operator-approved 2026-08-19).

A region is in one of four source states and they are four SENTENCES, not one
sentence with four bases underneath it. The pair that matters is `ungranted`
against `granted-empty`: "this city has granted no MyGov" and "this city granted
MyGov and it returned nothing" are different things to say to a customer, and a
single "empty" says neither. Collapsing them re-creates the exact defect the
ruling exists to close.

ONE map, read by every region on this lens INCLUDING the pipeline, which said
one sentence for all four states until G-97. A per-region copy would be two
implementations of one rule, which is the shape this repo has already paid for
(DEV_PROCESS 2.4).

`read-failed` is the fifth entry and it is not a source state: a fetch that did
not answer is not a city with no records, and it must not borrow that sentence.
`not-registered` is the surface that does not exist, which is the only surviving
meaning of Not built.
*/
const SOURCE_STATE = {
  ok: {
    kicker: "Records",
    headline: "Records are rendering from this pack.",
    metricNote: "records read",
  },
  ungranted: {
    kicker: "Built, no source",
    headline: "This region is built and this pack has granted no source for it.",
    metricNote: "Built, no source",
  },
  "granted-empty": {
    kicker: "Source returned nothing",
    headline: "The source is granted on this pack and it returned no records.",
    metricNote: "Source returned nothing",
  },
  "no-fixture-source": {
    kicker: "No source",
    headline: "This pack generates no records and grants no source.",
    metricNote: "No source on this pack",
  },
  "not-registered": {
    kicker: "Not built",
    headline: "This surface is not built.",
    metricNote: "Not built",
  },
  "read-failed": {
    kicker: "Read failed",
    headline: "This region did not read, which is not the same as a pack with no records.",
    metricNote: "Region did not read",
  },
};

/** The state's sentence. An unknown status is a failed read, never a quiet pass. */
function sourceSentence(status) {
  return SOURCE_STATE[status] || SOURCE_STATE["read-failed"];
}

/**
 * Writes the state sentence into one region's honest-empty block. Called with a
 * literal prefix from every region, so the ids it composes resolve to concrete
 * strings and the addressability gate can see all of them.
 */
function writeSourceSentence(prefix, payload) {
  const sentence = sourceSentence(payload.status);
  const kicker = document.getElementById(`${prefix}-empty-kicker`);
  const head = document.getElementById(`${prefix}-empty-head`);
  const basis = document.getElementById(`${prefix}-empty-basis`);
  if (kicker) kicker.textContent = sentence.kicker;
  if (head) head.textContent = sentence.headline;
  if (basis) basis.textContent = `Basis: ${payload.basis || "no basis was stated"}`;
}

/* ------------------------------------------------------- region rendering */

/** Status id to declared label and severity, taken from the payload's own tiles. */
function labelsFrom(metrics) {
  const out = {};
  for (const metric of Array.isArray(metrics) ? metrics : []) {
    out[metric.id] = { label: metric.label, severity: metric.severity };
  }
  return out;
}

function pillCell(label, severity) {
  const cell = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = `pill ${SEVERITY_PILL[severity] || "p-quiet"}`;
  pill.textContent = label;
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

/**
 * A stage id rendered for reading. Derived from the declared id rather than
 * copied into a second vocabulary here: a display map for work-order stages
 * would be a copy of WORK_ORDER_STAGE_VALUES that nothing keeps in step.
 */
function stageLabel(id) {
  const value = String(id || "");
  if (!value) return "";
  const words = value.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function extrasOf(payload) {
  return payload && payload.extras && typeof payload.extras === "object" ? payload.extras : {};
}

/**
 * The metric strip for a domain region.
 *
 * The tile LABEL is written from the payload rather than trusted from the
 * markup, so the declared vocabulary and the screen cannot drift; the static
 * markup is the pre-read fallback and nothing more. The counting rule travels
 * with the number, in the note under it, exactly as the pipeline's does.
 */
function renderDomainMetrics(stripId, payload, noun) {
  const strip = document.getElementById(stripId);
  if (!strip) return;
  const metrics = Array.isArray(extrasOf(payload).metrics) ? extrasOf(payload).metrics : [];
  const ok = payload.status === "ok";
  const sentence = sourceSentence(payload.status);
  for (const metric of metrics) {
    const el = strip.querySelector(`.metric[data-metric="${metric.id}"]`);
    if (!el) continue;
    const key = el.querySelector(".k");
    const value = el.querySelector(".v");
    const note = el.querySelector(".n");
    if (key) key.textContent = metric.label;
    if (!ok) continue;
    el.classList.add("has-value");
    if (value) {
      value.classList.remove("word");
      value.textContent = String(metric.count);
    }
    if (note) note.textContent = `of ${payload.recordCount} ${noun}`;
  }
  if (ok) return;
  /**
   * Not a zero. A region with no source states that it has no source, on every
   * tile, and the sentence names WHICH of the four states it is.
   */
  for (const el of strip.querySelectorAll(".metric")) {
    el.classList.remove("has-value");
    const value = el.querySelector(".v");
    const note = el.querySelector(".n");
    if (value) {
      value.classList.add("word");
      value.textContent = "Not read";
    }
    if (note) note.textContent = sentence.metricNote;
  }
}

/**
 * The queue panel for a domain region: the demo mark, the provenance chip, the
 * honest-empty block and the records table.
 *
 * `extraBases` are further absences the DOMAIN itself declared - the inspector
 * held off an inspection, the assessed figure held off a case, the renewal
 * charge held off a licence. They are the payload's own strings, joined rather
 * than rewritten, so the region's basis line carries every absence it owns.
 */
function renderDomainQueue(prefix, payload, buildRow, noun, extraBases) {
  const empty = document.getElementById(`${prefix}-empty`);
  const wrap = document.getElementById(`${prefix}-records`);
  const rows = document.getElementById(`${prefix}-rows`);
  const mark = document.getElementById(`${prefix}-mark`);
  const prov = document.getElementById(`${prefix}-prov`);
  const caption = document.getElementById(`${prefix}-caption`);
  const basis = document.getElementById(`${prefix}-basis`);

  writeSourceSentence(prefix, payload);
  const records = Array.isArray(payload.records) ? payload.records : [];

  if (records.length === 0) {
    show(empty, true);
    show(wrap, false);
    if (rows) rows.replaceChildren();
    show(mark, false);
    show(prov, false);
    if (caption) caption.textContent = sourceSentence(payload.status).kicker;
    /**
     * The table's own basis is rewritten even though the table is hidden. A
     * hidden element still carries its text into the DOM and into anything that
     * reads it, and "Basis: generated fixture records" left standing under an
     * unpopulated region is a claim this pack has not earned.
     */
    if (basis) basis.textContent = `Basis: ${payload.basis || "no basis was stated"}`;
    return;
  }

  show(empty, false);
  show(wrap, true);
  show(mark, true);
  show(prov, true);
  if (caption) caption.textContent = `${records.length} ${noun}`;
  if (basis) {
    const parts = [payload.basis, ...(Array.isArray(extraBases) ? extraBases : [])].filter(Boolean);
    basis.textContent = `Basis: ${parts.join(" | ")}`;
  }
  if (rows) rows.replaceChildren(...records.map((record) => buildRow(record, payload)));
}

/**
 * A register of a region's second axis: the result classes, the escalation
 * ladder, the daily slice, the expiry bands, the inspector load.
 *
 * When the region has no source the register is EMPTIED and its basis line
 * carries the pack's own sentence. An empty container plus a stated basis is an
 * absence; an empty container alone is a blank, and a blank is what ruling 1
 * exists to stop.
 */
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

/** A key-value block for a region's summary figures. Same absence discipline. */
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

/* ---------------------------------------------------------- inspections */

function inspectionRow(record, payload) {
  const row = document.createElement("tr");
  const results = labelsFrom(extrasOf(payload).results);
  const statuses = labelsFrom(extrasOf(payload).metrics);
  const result = results[record.result] || { label: record.result, severity: "quiet" };
  row.append(
    td(record.recordId, "id"),
    td(record.inspectionType, "subj"),
    pillCell(result.label, result.severity),
    placeCell(record),
    /**
     * An unscheduled inspection carries no day, so the cell carries the
     * record's own scheduleBasis rather than a blank or an invented date.
     */
    record.dayLabel ? dataCell(record.dayLabel) : basisCell(record.scheduleBasis || ""),
    statusCell(record, statuses),
  );
  return row;
}

function renderInspections(payload) {
  const first = Array.isArray(payload.records) ? payload.records[0] : null;
  renderDomainMetrics("ds-insp-metrics", payload, "generated inspections");
  renderDomainQueue("ds-insp", payload, inspectionRow, "inspections on the board", [
    first && first.inspectorBasis,
  ]);
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
    (data) => (extrasOf(data).results || []).map((r) => r.countingRule)[0] || data.basis,
  );
  renderRegister(
    "ds-insp-load",
    "ds-insp-load-basis",
    payload,
    (data) =>
      (extrasOf(data).inspectorLoad || []).map((load) => ({
        title: load.inspectorRef,
        sub: `${load.openCount} open`,
        value: load.inspectionCount,
        severity: "quiet",
      })),
    (data) =>
      [
        (extrasOf(data).inspectorLoad || []).map((l) => l.countingRule)[0],
        (extrasOf(data).inspectorLoad || []).map((l) => l.inspectorBasis)[0],
      ]
        .filter(Boolean)
        .join(" | ") || data.basis,
  );
}

/* --------------------------------------------------------- work orders */

function workOrderRow(record, payload) {
  const row = document.createElement("tr");
  row.append(
    td(record.recordId, "id"),
    td(record.subject, "subj"),
    td(stageLabel(record.stage)),
    placeCell(record),
    dueCell(record),
    /** The target travels with the elapsed figure, so the number is readable. */
    dataCell(`${record.slaElapsedHours} h of ${record.slaTargetHours} h`),
    statusCell(record, labelsFrom(extrasOf(payload).metrics)),
  );
  return row;
}

function renderWorkOrders(payload) {
  renderDomainMetrics("ds-wo-metrics", payload, "generated work orders");
  renderDomainQueue("ds-wo", payload, workOrderRow, "orders in the queue", []);
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
    (data) => (extrasOf(data).dailyQueue || []).map((d) => d.countingRule)[0] || data.basis,
  );
}

/* ---------------------------------------------------- code enforcement */

function codeViolationRow(record, payload) {
  const row = document.createElement("tr");
  const rungs = labelsFrom(extrasOf(payload).escalation);
  const rung = rungs[record.escalation] || { label: record.escalation, severity: "quiet" };
  row.append(
    td(record.recordId, "id"),
    td(record.violationType, "subj"),
    pillCell(rung.label, rung.severity),
    dataCell(String(record.escalationStep)),
    placeCell(record),
    dueCell(record),
    statusCell(record, labelsFrom(extrasOf(payload).metrics)),
  );
  return row;
}

function renderCodeEnforcement(payload) {
  const stats = extrasOf(payload).stats || {};
  renderDomainMetrics("ds-ce-metrics", payload, "generated cases");
  renderDomainQueue("ds-ce", payload, codeViolationRow, "cases on the ladder", [stats.penaltyBasis]);
  renderRegister(
    "ds-ce-ladder",
    "ds-ce-ladder-basis",
    payload,
    (data) =>
      (extrasOf(data).escalation || []).map((rung) => ({
        title: rung.label,
        /** The step is DATA on the rung, so the order is visible rather than
         *  implied by the position of the row. */
        sub: `Step ${rung.step}`,
        value: rung.count,
        severity: rung.severity,
      })),
    (data) => (extrasOf(data).escalation || []).map((r) => r.countingRule)[0] || data.basis,
  );
  renderKeyValues(
    "ds-ce-stats",
    "ds-ce-stats-basis",
    payload,
    (data) => {
      const figures = extrasOf(data).stats || {};
      return [
        ["Open", figures.open],
        ["Closed", figures.closed],
        ["Measured", figures.measured],
        ["Penalty", figures.penaltyBasis],
      ];
    },
    (data) => (extrasOf(data).stats || {}).countingRule || data.basis,
  );
}

/* ---------------------------------------------------------- licences */

function licenceRow(record, payload) {
  const row = document.createElement("tr");
  row.append(
    td(record.recordId, "id"),
    td(record.licenseCategory, "subj"),
    dataCell(record.holderRef),
    placeCell(record),
    dataCell(record.expiryLabel),
    statusCell(record, labelsFrom(extrasOf(payload).metrics)),
  );
  return row;
}

/** An expiry band's bounds, read off the payload. Null is open-ended. */
function bandBounds(band) {
  if (band.from === null || band.from === undefined) return `up to ${band.to} days`;
  if (band.to === null || band.to === undefined) return `${band.from} days and beyond`;
  return `${band.from} to ${band.to} days`;
}

function renderLicences(payload) {
  const extras = extrasOf(payload);
  renderDomainMetrics("ds-lic-metrics", payload, "generated licences");
  renderDomainQueue("ds-lic", payload, licenceRow, "licences on the roll", [
    extras.chargesBasis,
    Array.isArray(payload.records) && payload.records[0] ? payload.records[0].holderBasis : "",
  ]);
  renderRegister(
    "ds-lic-expiry",
    "ds-lic-expiry-basis",
    payload,
    (data) =>
      (extrasOf(data).expiry || []).map((band) => ({
        title: band.label,
        sub: bandBounds(band),
        value: band.count,
        severity: band.severity,
      })),
    (data) => (extrasOf(data).expiry || []).map((w) => w.countingRule)[0] || data.basis,
  );
}

/* ----------------------------------------------------------- the loader */

/**
 * One registered domain, in full, for a pack.
 *
 * The route has shipped since G-91 and this is its first consumer. No second
 * data path: the browser renders what the seam composed and generates nothing.
 *
 * A read that did not answer is NOT a pack with no records, and it does not get
 * to borrow that sentence. It renders as a stated failure with its own basis,
 * which is the discipline loadPipeline already applies one region over.
 */
async function loadDomain(domainId, cityKey) {
  const key = String(cityKey || "").trim();
  try {
    const res = await fetch(
      `/api/domains/${encodeURIComponent(domainId)}?cityKey=${encodeURIComponent(key)}`,
    );
    const body = res.ok ? await res.json() : null;
    if (body && typeof body.status === "string") return body;
  } catch {
    /* fall through to the stated failure below */
  }
  return {
    domainId,
    cityKey: key,
    status: "read-failed",
    recordCount: 0,
    records: [],
    extras: {},
    basis: `the ${domainId} region did not read for ${key}`,
  };
}

async function loadDevelopmentServices(cityKey) {
  const [inspections, workOrders, codeViolations, licences] = await Promise.all([
    loadDomain("inspections", cityKey),
    loadDomain("work-orders", cityKey),
    loadDomain("code-violations", cityKey),
    loadDomain("business-licenses", cityKey),
  ]);
  renderInspections(inspections);
  renderWorkOrders(workOrders);
  renderCodeEnforcement(codeViolations);
  renderLicences(licences);
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

/* ------------------------------------------------------------------- boot */

const staffLens = resolveStaffLensQuery(window.location.search);
const staffMap = resolveStaffMapQuery(window.location.search);

applyLens(staffLens);
const resettle = bindStages();
bindCompass();
bindMenu();
bindTheme();
bindTopMenus();
bindFeedback();
loadShellState(staffMap.cityKey);
loadIdentity(staffMap.cityKey);
composeGoldMap(staffMap.parcelNodeId, staffMap.cityKey);
loadPipeline(staffMap.cityKey);
loadDevelopmentServices(staffMap.cityKey);
if (resettle) resettle();
