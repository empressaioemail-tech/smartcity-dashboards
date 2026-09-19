/**
 * ---------------------------------------------------------------------------
 * G-151. THE PARKS LENS — the one lens that does not exist, rendered as NOT
 * existing.
 *
 * The design is `_design/smartcity-parks-lens/`, RATIFIED 2026-09-17, two
 * artboards (Main, Difference) and its own `check.mjs`, which reads a surface
 * against `source-state.json` — this product's own composer output. This file is
 * the BUILT side of that comparison.
 *
 * WHY THIS IS NOT A LENS LIKE THE OTHER SIX, said here because every instinct a
 * later lane has will be to make it one. src/domains.mjs draws the line in its
 * own comment above DOMAIN_REGISTRY: absence from that list is "the only
 * surviving meaning of the words not built". Everything in the list is BUILT,
 * and its emptiness on a given pack is a statement about SOURCES with a basis
 * attached. Parks facilities has no vendor at all, so it is not in the list, so
 * this surface asserts that the SURFACE DOES NOT EXIST — a different sentence
 * from "this city has no data for it".
 *
 * The failure mode this file exists to prevent is not an ugly page. It is a page
 * that renders BEAUTIFULLY IN THE WRONG LANGUAGE: a metric tile reading "Not
 * read", or a region strip with an empty state inside it, or a table header with
 * no rows under it. Every one of those is the sentence a BUILT region prints
 * when it has no source, and a city reading it here would go looking for a grant
 * that no vendor exists to give. So this surface carries NO metric tile, NO
 * empty table and NONE of the built-surface vocabulary, and
 * `_design/smartcity-parks-lens/check.mjs --dir` is the instrument that refuses
 * it if a later lane adds one.
 *
 * NOTHING ON THIS PAGE IS TYPED FROM MEMORY. The composer sentence is read from
 * `composeDomainById`, the three refusal messages are the ones the product's own
 * guards actually throw (probed at module load, below), the roster counts come
 * off DOMAIN_REGISTRY, and the catalogue comes off ADAPTER_KINDS. A lane that
 * registers a parks domain, or an eleventh adapter kind, gets a loud
 * disagreement with this page instead of a page nobody notices changed.
 *
 * THE TELL IS THAT IT DOES NOT VARY. `composeDomainById(pack, "parks-facilities")`
 * returns the same basis on the demo pack, on an unconnected city and on the live
 * staging pack, and that sentence names no vendor and no city — because neither
 * is true of it, while every built-but-unfed sentence names both. A state that
 * varies by city is a statement about the city; a state identical on every city
 * is a statement about the PRODUCT. `renderParksLens` therefore takes no pack at
 * all, and `src/parks-lens.test.mjs` asserts the reading is byte-identical across
 * four of them.
 *
 * WHAT THIS FILE MUST NEVER GROW: a region, a record, a count, a figure, a
 * vendor, or an entry in DOMAIN_REGISTRY. Adding an eleventh catalogued adapter
 * kind is a sourcing decision and a contract, not a sprint item, and it is the
 * single move that turns this page into a page.
 * ---------------------------------------------------------------------------
 */

import { DOMAIN_REGISTRY, composeDomainById } from "./domains.mjs";
import { ADAPTER_KINDS, adapterKindById } from "./adapters.mjs";
import { ROSTER_LENS_IDS, LENS_LABELS } from "./staff-review.mjs";
import { assertCityPackShape } from "./city-pack.mjs";
import { composeDomain, defineDomain } from "./fixture-seam.mjs";
import { bakeSectionInto } from "./public-works-lens.mjs";

export const PARKS_LENS_ID = "parks";
export const PARKS_DOMAIN_ID = "parks-facilities";
export const PARKS_REGION_NAME = "Facilities register";
export const PARKS_RECORD_TYPE = "park-facility";

/**
 * The state this surface renders, in the registry's own vocabulary. It is NOT in
 * DOMAIN_STATUSES, and that is the point: a domain absent from DOMAIN_REGISTRY
 * has no entry there on purpose, because "the surface does not exist" is not a
 * fourth way for a region to be empty.
 */
export const NOT_REGISTERED_STATUS = "not-registered";

/** The catalogue, read off the adapter module rather than retyped. */
export const CATALOGUED_KINDS = Object.freeze(ADAPTER_KINDS.map((k) => k.id));

/* ---------------------------------------------------------------------------
 * THE ROSTER, COUNTED. One row per lens on the city roster, and the count is
 * READ OFF THE REGISTRY rather than typed: the design's roster and this one
 * cannot disagree, and a lane that registers a parks domain gets a loud
 * disagreement with the design rather than a page nobody notices changed.
 * ------------------------------------------------------------------------- */

export const ROSTER = Object.freeze(
  ROSTER_LENS_IDS.map((lensId) => {
    const regions = DOMAIN_REGISTRY.filter((d) => d.lensId === lensId);
    return Object.freeze({
      lensId,
      regionCount: regions.length,
      kinds: Object.freeze([...new Set(regions.map((d) => d.gatedBy))]),
    });
  }),
);

/* ---------------------------------------------------------------------------
 * THE THREE REFUSALS, PROBED. Each probe builds the shape that ought to be
 * refused, calls the product's own guard, and keeps the message it threw. A
 * probe that does NOT throw means the seam grew a vendorless path, and this
 * module then refuses to load rather than print a claim that has become false.
 * ------------------------------------------------------------------------- */

function refusal(label, run) {
  try {
    run();
  } catch (err) {
    return Object.freeze({ label, message: err.message });
  }
  throw new Error(
    "parks-lens: " + label + " no longer refuses the shape this surface exists to describe. " +
      "The design is wrong, not stale: re-derive _design/smartcity-parks-lens before shipping this lens.",
  );
}

const PROBE_PACK = {
  cityKey: "probe-city",
  jurisdictionFips: null,
  displayName: "Probe city",
  accessPolicy: "public-free",
  environment: "demo",
  generatesFixtures: true,
  lenses: [],
  grantedAdapters: [],
  fixtureGrants: ["mygov"],
};

/** A domain that is everything Parks would be, plus the gate Parks does not have. */
const VENDORLESS = {
  id: PARKS_DOMAIN_ID,
  lensId: PARKS_LENS_ID,
  region: PARKS_REGION_NAME,
  recordType: PARKS_RECORD_TYPE,
  vocabulary: [],
  generate: () => ({ records: [] }),
};

export const REFUSALS = Object.freeze([
  refusal("assertDomainShape", () => defineDomain({ ...VENDORLESS, gatedBy: PARKS_LENS_ID })),
  refusal("assertCityPackShape", () =>
    assertCityPackShape({ ...PROBE_PACK, fixtureGrants: [PARKS_LENS_ID] }),
  ),
  refusal("composeDomain", () =>
    composeDomain(
      PROBE_PACK,
      defineDomain({
        ...VENDORLESS,
        gatedBy: "mygov",
        generate: () => ({
          records: [{ kind: "samsara", recordType: PARKS_RECORD_TYPE, cityKey: "probe-city" }],
        }),
      }),
    ),
  ),
]);

export const REFUSAL_WHAT_THEY_STOP = Object.freeze([
  "a region whose gate is not one of the catalogued vendor kinds",
  "a city pack that names an uncatalogued kind",
  "a record whose vendor id does not match the region's gate",
]);

/* ---------------------------------------------------------------------------
 * THE ONE THING THAT WOULD CHANGE IT, and it is stated as a decision nobody has
 * made. Three steps, none of them engineering.
 * ------------------------------------------------------------------------- */

export const WOULD_CHANGE_IT = Object.freeze([
  "A parks or facilities system is identified and catalogued as an adapter kind",
  "A domain is written under that kind and appended to DOMAIN_REGISTRY",
  "Only then does this page become a built region that can be empty with a basis",
]);

/* ---------------------------------------------------------------------------
 * THREE NEAR MISSES. Each is a real thing in this product carrying the word
 * Parks, and none of them is this lens. Filling this page with one of them
 * answers a different question and claims coverage this lens does not have.
 * ------------------------------------------------------------------------- */

export const NEAR_MISSES = Object.freeze([
  Object.freeze({
    head: "A map layer",
    body:
      "property-map-catalog.mjs catalogues a parks polygon layer. A geometry layer is not a " +
      "department register, and whether it returns features anywhere is UNESTABLISHED here.",
  }),
  Object.freeze({
    head: "A role",
    body:
      "staff-identity.mjs carries parks in DEPARTMENT_ROLES. A role that can be issued is not a " +
      "surface that can be opened, and lens access is not enforced yet.",
  }),
  Object.freeze({
    head: "A register row",
    body:
      "shell-homes.mjs routes Departments including Parks and Courts here, disposition Not built. " +
      "That row is the pointer, not a source.",
  }),
]);

/* ---------------------------------------------------------------- rendering */

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const CARD = "flex:none; border:1px solid var(--sc-line); border-radius:var(--sc-r); background:var(--sc-surface); overflow:hidden; display:flex; flex-direction:column;";
const CARD_HEAD = "display:flex; align-items:center; gap:var(--sc-2); min-height:40px; padding:var(--sc-1) var(--sc-3); border-bottom:1px solid var(--sc-line-faint);";
const CARD_TITLE = "font:620 15px/22px var(--sc-font-ui); letter-spacing:-.008em; color:var(--sc-ink); white-space:nowrap;";
const CARD_SUB = "font:400 12px/16px var(--sc-font-data); color:var(--sc-ink-3);";
const CARD_ROWS = "display:flex; flex-direction:column; padding:var(--sc-2) 0 var(--sc-3);";
const CELL = "min-width:0; font:400 13px/18px var(--sc-font-data); color:var(--sc-ink);";
const CELL_UI = "min-width:0; font:400 13px/18px var(--sc-font-ui); color:var(--sc-ink-2);";
const CELL_CRIT = "min-width:0; font:400 13px/18px var(--sc-font-data); color:var(--sc-crit);";
const CELL_SOFT = "min-width:0; font:400 13px/18px var(--sc-font-data); color:var(--sc-ink-2);";
const BASIS = "font:400 12px/17px var(--sc-font-data); color:var(--sc-ink-3); border-left:2px solid var(--sc-line); padding-left:var(--sc-3); display:inline-block;";
const FOOT = "padding:var(--sc-2) var(--sc-4) var(--sc-3);";
const BADGE = "flex:none; font:500 12px/16px var(--sc-font-data); color:var(--sc-ink-3); background:var(--sc-quiet-wash); border-radius:var(--sc-r-control); padding:1px 6px; white-space:nowrap;";

const cardHead = (title, sub) =>
  `<div style="${CARD_HEAD}"><span style="${CARD_TITLE}">${esc(title)}</span>` +
  `<span style="${CARD_SUB}">${esc(sub)}</span><div style="flex:1;"></div></div>`;

const cardFoot = (text, maxCh) =>
  `<div style="${FOOT}"><span style="${BASIS} max-width:${maxCh}ch;">${esc(text)}</span></div>`;

/**
 * WHERE THIS SECTION SITS IN web/index.html. The bake hands `render()` the line
 * the marker was on, indentation already stripped, so the first line carries no
 * prefix and every following line carries its own absolute indentation. Without
 * this the whole section lands on one 15 KB line, which is what a bake that
 * ignores the document's shape produces and what none of the other lens
 * sections in that file look like.
 */
const IND = "            ";
const el = (depth, html) => IND + "  ".repeat(depth) + html;

/**
 * A row. `columns` are already-rendered spans, so each row states its own grid
 * rather than sharing a template a reader would have to look up.
 */
const gridRow = (columns, template, first, attrs = "") =>
  `<div${attrs} style="display:grid; grid-template-columns:${template}; gap:var(--sc-3); padding:6px var(--sc-4); align-items:baseline;${
    first ? "" : " border-top:1px solid var(--sc-line-faint);"
  }">${columns.join("")}</div>`;

const span = (style, text) => `<span style="${style}">${esc(text)}</span>`;

/** One card: its head, its body lines, and its basis foot. */
const card = (depth, title, sub, body, foot, footCh) => [
  el(depth, `<section style="${CARD}">`),
  el(depth + 1, cardHead(title, sub)),
  ...body,
  el(depth + 1, cardFoot(foot, footCh)),
  el(depth, `</section>`),
];

/** The rows of a card, wrapped in the column that holds them. */
const rows = (depth, rowLines) => [
  el(depth, `<div style="${CARD_ROWS}">`),
  ...rowLines.map((r) => el(depth + 1, r)),
  el(depth, `</div>`),
];

/* ---------------------------------------------------------------- the body */

/**
 * THE COMPOSER SENTENCE, read from the composer on every render. This is the
 * only sentence on the page that must be VERBATIM from the product, and the
 * instrument refuses the surface if it is paraphrased, so it is never typed
 * here. The pack argument changes nothing about it — that is the finding, and
 * passing a pack is how that is demonstrated rather than asserted.
 */
export function composerSentence(pack) {
  return composeDomainById(pack, PARKS_DOMAIN_ID).basis;
}

export function parksLensModel(pack) {
  const composed = composeDomainById(pack, PARKS_DOMAIN_ID);
  return {
    lensId: PARKS_LENS_ID,
    domainId: PARKS_DOMAIN_ID,
    status: composed.status,
    basis: composed.basis,
    countingRule: composed.countingRule,
    recordCount: composed.recordCount,
    regionCount: ROSTER.find((r) => r.lensId === PARKS_LENS_ID)?.regionCount ?? 0,
    packInvariant: true,
  };
}

/**
 * THE PAGE, as a section. Four cards, in the order the design puts them: what
 * the state IS, why it cannot simply be added, what would change it, and the two
 * columns of what it is not plus the roster counted.
 *
 * NO ARGUMENT, AND THAT IS THE API RATHER THAN AN OVERSIGHT. A pack parameter
 * that the body ignores would invite the next lane to thread one through, and
 * the first thing a pack would change is the one thing that must not vary. The
 * pack is used for AUTHORIZATION, not for rendering: src/server.mjs resolves it,
 * refuses the read, and then serves these same bytes.
 */
export function renderParksLens() {
  const basis = composerSentence(null);
  const parks = ROSTER.find((r) => r.lensId === PARKS_LENS_ID);
  const elsewhere = ROSTER.filter((r) => r.lensId !== PARKS_LENS_ID && r.regionCount > 0)
    .map((r) => `${LENS_LABELS[r.lensId] || r.lensId} carries ${r.regionCount}`)
    .join(", ");

  const rosterRows = ROSTER.map((r, i) =>
    gridRow(
      [
        span(r.lensId === PARKS_LENS_ID ? CELL_CRIT : CELL, r.lensId),
        span(CELL_SOFT, r.regionCount === 0 ? "no region, no vendor" : r.kinds.join(", ")),
        span(r.lensId === PARKS_LENS_ID ? CELL_CRIT : CELL, String(r.regionCount)),
      ],
      "minmax(0,1fr) minmax(0,1.2fr) 28px",
      i === 0,
      ` data-roster-region="${r.lensId}:${r.regionCount}"`,
    ),
  );

  const refusalRows = REFUSALS.map((r, i) =>
    gridRow(
      [span(CELL, r.label), span(CELL_UI, REFUSAL_WHAT_THEY_STOP[i]), span(CELL_CRIT, r.message)],
      "178px minmax(0,1fr) minmax(0,1.5fr)",
      i === 0,
    ),
  );

  const changeRows = WOULD_CHANGE_IT.map((step, i) =>
    gridRow([span(CELL, String(i + 1)), span(CELL_UI, step)], "32px minmax(0,1fr)", i === 0),
  );

  const missRows = NEAR_MISSES.map((m, i) =>
    gridRow([span(CELL_UI, m.head), span(CELL_UI, m.body)], "minmax(0,1fr)", i === 0),
  );

  const lines = [
    `<section class="lens roster-lens" id="lens-parks">`,
    /*
     * THE HEADER IS THE SHELL'S OWN, and this is fidelity rather than tidiness.
     * The design draws the breadcrumb flat on the canvas; every lens in
     * web/index.html states its city through the same `.crumb` hook, and
     * src/city-identity.test.mjs refuses a shipped crumb that has none. The hook
     * resolves in the browser, so the bytes stay pack-invariant: the reading
     * still names no city, it just renders one the way every other page does.
     *
     * The badge keeps the design's inline chip rather than `.pill`, because
     * `_design/smartcity-parks-lens/check.mjs` extracts badges by that exact
     * style and a `.pill` would leave the instrument with NOTHING to scan —
     * which it reports as a refusal, not a pass.
     */
    el(1, `<header class="pagehead">`),
    el(2, `<div class="crumb"><b data-pack-name>This city</b> <span>/</span> Parks</div>`),
    el(2, `<div class="titlerow">`),
    el(3, `<h1>Parks</h1>`),
    el(3, `<span style="${BADGE}">Not built</span>`),
    el(3, `<span class="grow"></span>`),
    el(3, `<span class="t-caption">${esc(String(parks.regionCount))} registered regions. ${esc(elsewhere)}.</span>`),
    el(2, `</div>`),
    el(2, `<p class="lede" style="max-width:100ch;">Parks is a department on the city roster and it is named here so the roster stays honest about coverage rather than hiding behind an overflow menu. There is no region to read, no source to grant and nothing on this page is waiting for a connection.</p>`),
    el(1, `</header>`),
    el(1, `<div style="flex:1; min-height:0; display:flex; gap:var(--sc-4); padding:var(--sc-4) var(--sc-5);">`),
    el(2, `<div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:var(--sc-4);">`),

    /* --- 1. the state this page IS --- */
    ...card(
      3,
      "This surface does not exist yet",
      "and that is a different sentence",
      [
        el(4, `<div style="display:flex; flex-direction:column; align-items:flex-start; gap:var(--sc-3); padding:var(--sc-4) var(--sc-6) var(--sc-3); max-width:92ch;">`),
        el(5, `<div style="font:500 12px/16px var(--sc-font-data); letter-spacing:.1em; text-transform:uppercase; color:var(--sc-crit);">${esc(NOT_REGISTERED_STATUS)}</div>`),
        el(5, `<h2 style="font:650 22px/28px var(--sc-font-ui); letter-spacing:-.016em; margin:0; color:var(--sc-ink);">Parks is named, and it is not built.</h2>`),
        el(5, `<p style="margin:0; font:400 15px/22px var(--sc-font-ui); color:var(--sc-ink-2);">Every other department page on this roster exists and may be waiting for a source. This one is not. Nothing is connected, nothing is pending, and no grant would fill it, because there is no region here to fill. What is in the way is a source that does not exist: the build sheet records Parks facilities as <span style="font-family:var(--sc-font-data); color:var(--sc-ink);">gates: none yet</span>, and the product will not register a region against a vendor it cannot name.</p>`),
        el(4, `</div>`),
      ],
      `Basis, verbatim from the composer: ${basis} Status: ${NOT_REGISTERED_STATUS}, the same on every pack. A state that does not vary by city is a statement about the PRODUCT.`,
      116,
    ),

    /* --- 2. why it cannot simply be added --- */
    ...card(
      3,
      "Why it cannot simply be added",
      "three refusals, in the product",
      rows(4, refusalRows),
      "Basis: each message above was thrown by that guard when this module loaded, so the page cannot quote a " +
        `wording the product has stopped using. src/department-domains.test.mjs pins all three against a probe ` +
        `domain named ${PARKS_DOMAIN_ID}, so the finding is inherited measured rather than re-derived.`,
      116,
    ),

    /* --- 3. what would change it --- */
    ...card(
      3,
      "What would change this",
      "one thing, and it is not engineering",
      rows(4, changeRows),
      `The ${CATALOGUED_KINDS.length} catalogued kinds are ${CATALOGUED_KINDS.join(", ")}. None is a parks ` +
        "system, and an eleventh is a contract rather than a sprint item.",
      116,
    ),

    el(2, `</div>`),
    el(2, `<div style="width:452px; flex:none; display:flex; flex-direction:column; gap:var(--sc-4); min-width:0;">`),

    /* --- 4. the three near misses --- */
    ...card(
      3,
      "What Parks is not",
      "three near misses",
      rows(4, missRows),
      "Each is real, none is this lens. Filling this page with one would claim coverage it does not have.",
      62,
    ),

    /* --- 5. the roster, counted off the registry --- */
    ...card(
      3,
      "The roster, counted",
      "regions per department lens",
      rows(4, rosterRows),
      "Entries in DOMAIN_REGISTRY whose lensId equals this lens, counted off the registry at render time. " +
        "Zero is a different kind of answer, not a low number.",
      62,
    ),

    el(2, `</div>`),
    el(1, `</div>`),
    `</section>`,
  ];

  return lines.join("\n");
}

/**
 * THE SURFACE, as a document: the section above inside a `<main>`, which is the
 * element `_design/smartcity-parks-lens/check.mjs` scopes on. The marker is
 * `data-lens-body`, NOT `data-lens-scope` — the instrument REFUSES (exit 2)
 * rather than degrading if it cannot scope the board, so a rename would turn a
 * check into a non-check.
 *
 * THE DOCUMENT ADDS NO SECOND RENDERING. What is inside `<main>` here IS the
 * bytes of renderParksLens(), the same bytes scripts/bake-parks-lens.mjs puts in
 * web/index.html, asserted by src/parks-lens.test.mjs. A second renderer written
 * for the check would be two implementations of one surface, agreeing today and
 * drifting silently — inside the artifact whose whole job is to detect that.
 *
 * `pack` reaches the document's chrome and nothing else. The reading does not
 * vary by city, which is the finding, so a city named in the `<title>` must not
 * reach the reading.
 */
export function renderParksSurface(pack, { assetBase = "." } = {}) {
  const who = pack?.displayName ? esc(pack.displayName) : "This city";
  return (
    `<!doctype html>\n<html lang="en" data-surface="lens-parks">\n<head>\n<meta charset="utf-8">\n` +
    `<title>Parks · ${who}</title>\n` +
    `<link rel="stylesheet" href="${assetBase}/sc-kit.css">\n` +
    `<link rel="stylesheet" href="${assetBase}/shell.css">\n` +
    `</head>\n<body class="shell">\n` +
    /*
     * `data-surface="lens-parks"` on the `<html>` element is what makes the
     * section VISIBLE here. `.lens` is display:none in shell.css and every
     * shipped lens is turned on by the hash/query boot in web/app.js, which this
     * document does not load; the shell already carries the selector for this
     * id next to the other nine, so the document uses the product's own rule
     * rather than adding `on` and making the exported bytes differ from the
     * ones web/index.html bakes.
     */
    `<main class="shell-main" data-lens-body="parks">${renderParksLens()}</main>\n` +
    `</body>\n</html>\n`
  );
}

/** The payload a caller that wants the state rather than the page reads. */
export function parksLensPayload(pack) {
  return parksLensModel(pack);
}

/**
 * THE BAKE, as a PURE function, for the reason the Finance and Public works
 * bakes are: a transform that lives only in a script cannot be asserted, so a
 * stale document ships green in either direction. It reuses `bakeSectionInto`
 * from src/public-works-lens.mjs rather than restating a second idea of what a
 * section is, and it inherits that function's CRLF preservation, which web/**
 * depends on (D-9: GCP serves these files with CRLF).
 *
 * IT BAKES THE PAGE INTO web/index.html BECAUSE THE ALTERNATIVE IS TWO PARKS
 * PAGES. The shell's nav reaches `/?lens=parks` and the route below serves
 * `/lens/parks`; if the shell kept its one-panel placeholder, a city clicking
 * Parks would get a different page from the one the instrument checks and the
 * one this design was ratified to be.
 */
export function bakeParksLensInto(rawHtml) {
  return bakeSectionInto(rawHtml, {
    marker: '<section class="lens roster-lens" id="lens-parks">',
    next: '<section class="lens" id="lens-police">',
    render: () => renderParksLens(),
  });
}

/** Whether a kind is one of the catalogued ones. Parks has no such kind. */
export function isCataloguedKind(kindId) {
  return adapterKindById(kindId) !== null;
}
