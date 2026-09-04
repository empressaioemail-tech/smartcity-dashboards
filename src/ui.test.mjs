import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";
import { ROSTER_LENS_IDS } from "./staff-review.mjs";
import { TEMPLATE_CITY, environmentBadgeLabel } from "./city-pack.mjs";
import {
  BAKE_SOURCES,
  KNOWN_UNSTYLED,
  MARKUP_SOURCES,
  SERVED_ASSETS,
  STYLESHEET_SOURCES,
  classesUsed,
  readMarkupSources,
  readSource,
  root,
  stylesheetClasses,
  stylesheetClassesWithoutCommentStrip,
  strayClasses,
} from "./served-surface.mjs";

const html = readSource("web/index.html");
const app = readSource("web/app.js");
const shell = readSource("web/shell.css");
const kit = readSource("web/sc-kit.css");
const surface = html + "\n" + app;

const serverSrc = readSource("src/server.mjs");

/**
 * ---------------------------------------------------------------------------
 * THE CLASS GATE'S INSTRUMENTS (G-88 item 3, consolidated at G-88 item 7)
 *
 * Everything the gate needs - the served-source derivation, the DEFINED-set
 * counting rule, the USED-set extractors, the stray diff and the exclusion set -
 * now lives in ONE place, src/served-surface.mjs, and this file calls it.
 *
 * It used to live here in a hardened form AND in src/city-identity.test.mjs in a
 * weaker one: no CSS comment strip, two markup sources instead of five, and only
 * the classList extractor. Two implementations of one rule is the CTRL-1 shape,
 * and the second copy carried the exact comment-strip hole item 3 was written to
 * close - an injected class="hidden" passed it while failing this one, measured
 * both ways before the consolidation. The fix is one implementation, not two
 * careful edits (DEV_PROCESS 2.4).
 * ---------------------------------------------------------------------------
 */

describe("G-66 four-lens shell", () => {
  it("presents four lead lenses as views without a parcel form or Compose click", () => {
    assert.match(html, /href="\/\?lens=city-manager"/);
    assert.match(html, /href="\/\?lens=development-services"/);
    assert.match(html, /href="\/\?lens=finance"/);
    assert.match(html, /href="\/\?lens=citizen"/);
    assert.match(html, /id="lens-city-manager"/);
    assert.match(html, /id="lens-development-services"/);
    assert.match(html, /id="lens-finance"/);
    assert.match(html, /id="lens-citizen"/);
    assert.equal(html.includes("compose-form"), false);
    assert.equal(html.includes("Compose"), false);
    assert.equal(html.includes('name="parcelNodeId"'), false);
    assert.equal(html.includes('id="parcel-node-id"'), false);
    assert.match(html, /id="env-badge">Demo</);
    assert.match(html, /class="env demo"/);
  });

  it("keeps finance honest-empty with a source register and citizen without payment theater", () => {
    assert.match(html, /id="finance-source-register"/);
    assert.match(html, /Permit fee revenue/);
    assert.match(html, />Partial</);
    assert.match(html, /That is not a zero balance/);
    assert.equal(html.includes("$0"), false);
    assert.equal(html.includes("$0.00"), false);
    assert.match(html, /id="citizen-payments"/);
    assert.match(html, /Online payment is not available/);
    assert.match(html, /does not invent a street/);
    assert.equal(html.includes("Chestnut"), false);
    assert.match(html, /Payments unclaimed/);
    assert.equal(html.includes("Payment Complete"), false);
    assert.equal(html.includes("Pay now"), false);
    assert.equal(html.includes("handlePayment"), false);
    for (const s of FORBIDDEN_PRODUCT_STRINGS) {
      assert.equal(surface.includes(s), false, s);
    }
  });

  it("presents Compass as a top-bar sheet with city and lens scope, and has no /compass route", () => {
    assert.match(html, /id="cp-source"/);
    assert.match(html, /id="cp-sheet"/);
    assert.match(html, /id="cp-scope-city"/);
    assert.match(html, /id="cp-scope-lens"/);
    assert.match(app, /prefers-reduced-motion/);
    assert.match(app, /stiffness|springEase/);
    assert.equal(html.includes('href="/compass"'), false);
    assert.equal(app.includes('"/compass"'), false);
  });

  it("keeps demo identity on template-city and does not leak live ops names", () => {
    /**
     * G-80 moved the city key off the markup. It was a baked attribute and a
     * baked basis line, both of which named template-city on every pack; the
     * shell now carries the resolved key and the basis reads a pack hook.
     */
    assert.match(app, /shell\.dataset\.cityKey = key/);
    assert.match(html, /cityKey <span data-pack-key>/);
    assert.match(html, /48021:34137/);
    assert.match(html, /Demo fixture/);
    /**
     * THE CITY-NAME GATE, widened at G-88 item 7.
     *
     * It used to be `html.includes("Bastrop")` and a lowercased check for one
     * two-word phrase: case-sensitive, and scoped to web/index.html alone. Both
     * halves of that hole were proven by injection before this edit - a
     * lowercase `bastrop` in web/index.html AND a literal "Bastrop" in
     * web/app.js each shipped green through all 209 tests.
     *
     * Counting rule: case-insensitive, across every markup source the product
     * puts in front of a browser, derived from server.mjs rather than listed
     * here. Measured before widening: zero occurrences in all five, so this is
     * green on merge rather than a red gate somebody has to negotiate with.
     *
     * The gold parcel 48021:34137 is a Bastrop County parcel and stays: it is
     * ruled, positively asserted two lines above, and carries a Demo fixture
     * label. It contains no city name, which is the thing this rule is about.
     */
    const NEVER_NAMED = "Bastrop";
    const markup = readMarkupSources();
    const named = Object.entries(markup)
      .filter(([, text]) => text.toLowerCase().includes(NEVER_NAMED.toLowerCase()))
      .map(([source]) => source);
    assert.deepEqual(named, []);
    // Watched firing, on each source and in a case the old rule let through.
    for (const source of MARKUP_SOURCES) {
      const injected = { ...markup, [source]: `${markup[source]}\n<!-- ${NEVER_NAMED.toLowerCase()} -->\n` };
      assert.deepEqual(
        Object.entries(injected)
          .filter(([, text]) => text.toLowerCase().includes(NEVER_NAMED.toLowerCase()))
          .map(([name]) => name),
        [source],
        `a lowercase city name in ${source} did not fire the gate`,
      );
    }
    assert.equal(html.includes("morning-brief"), false);
    assert.equal(html.includes("25-000280"), false);
    assert.equal(html.includes("Christy Hunn"), false);
    assert.equal(html.includes("Locate Water"), false);
    assert.match(html, /id="overview-meetings"/);
    assert.match(html, /id="overview-meetings-honesty"[^>]*>Partial</);
    assert.equal(html.includes("Public Library Board"), false);
    assert.equal(html.includes("Regular City Council Meeting"), false);
  });

  it("presents Work Files as a link to /?work=files and mounts the Files host", () => {
    assert.match(html, /href="\/\?work=files"/);
    assert.match(html, /id="work-files"/);
    assert.match(html, /id="files-site"/);
    assert.match(html, /title="Smart Files embed"/);
    assert.equal(html.includes('class="navitem unbuilt">Files'), false);
    assert.equal(html.includes("compose-form"), false);
    assert.equal(html.includes("$0"), false);
    assert.equal(html.includes("Bring files"), false);
    assert.equal(html.includes("file-list"), false);
    assert.equal(html.includes("share-link"), false);
    assert.match(app, /smartFiles/);
    assert.match(app, /WORK_LABELS/);
  });

  it("names Parks, Records search, Assets, Connections, and People in the nav", () => {
    /**
     * G-100. The nav names all seven, and it no longer says the same thing
     * about all seven.
     *
     * This assertion USED to require "Not built" on every one of them, which is
     * how four rendering lenses kept a badge saying their surface did not exist
     * for three waves after they shipped. The words were never the defect: the
     * defect is a state claim typed into markup with nothing connecting it to
     * what decides it. So the partition is DERIVED from the domain registry in
     * src/lens-claims.test.mjs, and what is asserted here is that each of the
     * seven is present and carries a badge, plus the three whose surface really
     * does not exist.
     */
    for (const label of ["Parks", "Records search", "People and access", "Public works", "Police", "Fire and EMS", "Fleet"]) {
      assert.match(html, new RegExp(`>${label}<span class="grow"></span><span class="badge">[^<]+</span>`), label);
    }
    for (const label of ["Parks", "Records search", "People and access"]) {
      assert.match(html, new RegExp(`>${label}<span class="grow"></span><span class="badge">Not built</span>`), label);
    }
    assert.match(html, /href="\/\?work=assets"/);
    assert.match(html, /href="\/\?work=connections"/);
    assert.match(html, /<div class="gl">City<\/div>/);
    assert.equal(html.includes('class="navitem unbuilt">Assets'), false);
    assert.match(html, /id="work-assets"/);
    assert.match(html, /id="work-connections"/);
    assert.match(html, /No city-owned asset records for <span data-pack-key>/);
    assert.match(html, /G-24 stays zero/);
    assert.equal(html.includes("sample inventory presented"), false);
    assert.equal(/\bSamsara\b/.test(html.match(/id="work-assets"[\s\S]*?id="work-connections"/)?.[0] || ""), false);
  });

  it("uses kit tokens only and does not fork sc-kit.css", () => {
    assert.match(kit, /--sc-atom:/);
    assert.equal(shell.includes(":root"), false);
    assert.equal(shell.includes("--sc-canvas:"), false);
    assert.equal(shell.includes("--sc-accent:"), false);
    assert.match(shell, /var\(--sc-canvas\)/);
    assert.match(shell, /var\(--sc-accent\)/);
    assert.match(html, /href="\/sc-kit.css"/);
    assert.match(html, /href="\/shell.css"/);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(shell.replace(/\/\*[\s\S]*?\*\//g, "")), false);
    assert.equal(/\brgba?\(/.test(shell), false);
  });
});

describe("G-75 shell, mounts and motion", () => {
  it("gives every roster department a real view instead of a dead chip", () => {
    for (const lens of ROSTER_LENS_IDS) {
      assert.match(html, new RegExp(`href="/\\?lens=${lens}"`), lens);
      assert.match(html, new RegExp(`id="lens-${lens}"`), lens);
    }
    assert.equal(html.includes('class="navitem unbuilt"'), false);
    assert.match(html, /id="work-records"/);
    assert.match(html, /id="work-people"/);
    assert.match(html, /id="work-review"/);
    assert.match(html, /href="\/\?work=review"/);
  });

  it("mounts each product in a persistent stage outside the receding surface", () => {
    for (const name of ["map", "review", "files"]) {
      assert.match(html, new RegExp(`id="${name}-stage"`), name);
    }
    assert.match(html, /id="map-site"/);
    assert.match(html, /id="review-site"/);
    assert.match(html, /id="files-site"/);
    // One SmartSite iframe serves both the Overview rail and the Place rail.
    assert.equal((html.match(/id="map-site"/g) || []).length, 1);
    assert.equal((html.match(/<iframe /g) || []).length, 3);
    /**
     * anchor-ds-review LEFT this list at G-97 (OPS-17 A-076, operator ruling
     * 2026-08-19): the Review tab left Development services, because DS mirrors
     * what the MyGov system a city already runs shows and Plan review is the
     * native console that aspirationally replaces it. The MOUNT is not cut and
     * that is what the next two assertions establish rather than assume: the
     * review stage still exists, and anchor-work-review still carries
     * data-stage="review", so MountStage.findAnchor() still resolves one.
     */
    for (const anchor of ["anchor-overview-map", "anchor-place-map", "anchor-work-review", "anchor-files"]) {
      assert.match(html, new RegExp(`id="${anchor}"`), anchor);
    }
    assert.equal(html.includes('id="anchor-ds-review"'), false, "the Development services Review tab left at G-97");
    assert.equal((html.match(/data-stage="review"/g) || []).length, 1, "exactly one anchor remains for the review stage");
    // The stages are siblings of .cp-recede, never inside it: a transformed or
    // filtered ancestor would break position: fixed and force a reparent.
    const recede = html.match(/<div class="cp-recede"[\s\S]*?<\/main>\s*<\/div>\s*<\/div>/)?.[0] || "";
    assert.equal(recede.includes('id="map-stage"'), false);
    assert.equal(recede.includes('id="files-stage"'), false);
    assert.match(app, /class MountStage/);
    // mount() is idempotent on src, so a re-render never reloads the product,
    // and no code path appends the frame somewhere else.
    assert.match(app, /this\.frame\.dataset\.src === src/);
    assert.equal(/appendChild\([^)]*(frame|iframe)/i.test(app), false);
  });

  it("fills the mount container instead of pinning it to a 220px canvas", () => {
    assert.equal(shell.includes("min-height: 220px"), false);
    assert.equal(shell.includes("min-height: 280px"), false);
    assert.match(shell, /\.shell \{[^}]*height: 100dvh/);
    assert.match(shell, /\.shell-regions \{[^}]*align-items: stretch/);
    assert.match(shell, /\.region \{[^}]*height: 100%/);
    assert.match(shell, /\.region-canvas \{[^}]*flex: 1/);
    assert.match(shell, /\.stage > iframe \{[^}]*position: absolute/);
    assert.equal(/align-items: start/.test(shell), false);
  });

  it("reuses the one named spring and honours reduced motion", () => {
    assert.match(app, /springEase\(320, 32, 0\.9, 60\)/);
    assert.equal((app.match(/springEase\(/g) || []).length, 2);
    assert.match(app, /CONTENT_FADE_AT = 0\.35/);
    assert.match(app, /scale\(1\.03\)/);
    assert.match(app, /brightness\(0\.72\)/);
    assert.match(app, /function reducedMotion/);
    assert.match(app, /return reducedMotion\(\) \? 0 : SPRING\.duration/);
    assert.match(app, /transitionTo\(state\)/);
    for (const state of ["collapsed", "presented", "max"]) {
      assert.ok(app.includes(`"${state}"`), state);
    }
    assert.match(html, /data-stage-present="map"/);
    assert.match(html, /data-stage-max="map"/);
    assert.match(html, /id="stage-scrim"/);
    assert.match(app, /event\.key !== "Escape"/);
  });

  it("keeps exactly one nav item current and does not flip the document theme", () => {
    // A Work item no longer carries a lens, so it cannot light up beside the
    // lens item it navigated into.
    assert.equal(/data-work="[a-z]+"[^>]*data-lens=/.test(html), false);
    assert.equal(/data-lens="[a-z-]+"[^>]*data-work=/.test(html), false);
    assert.equal(html.includes('data-tab="review" href="/?work'), false);
    assert.match(app, /!el\.dataset\.work && el\.dataset\.lens === lens/);
    assert.equal(app.includes("documentElement.dataset.theme"), false);
    // The light scope covers the whole citizen surface, ground included, or the
    // copy outside a panel renders light-theme ink on the dark canvas.
    assert.match(html, /class="cz-scroll sc-light"/);
    assert.match(shell, /\.cz-scroll \{[^}]*background: var\(--sc-canvas\)/);
  });

  it("does not offer a control that does nothing", () => {
    // Record search contradicts a Not built nav item unless it says so too.
    assert.match(html, /id="record-search"[^>]*disabled/);
    assert.match(html, /class="badge-off">Not built</);
    assert.match(html, /id="citizen-address"[^>]*disabled/);
    assert.match(html, /id="citizen-lookup"[^>]*disabled/);
    assert.match(html, /Lookup returns nothing today/);
    // Compass generates no answers, so it carries no maximize.
    assert.equal(html.includes('id="cp-max"'), false);
    assert.equal(html.includes(">Maximize<"), false);
    assert.match(html, /Chrome only/);
    // "Viewing as" read as a persona switcher and was a breadcrumb echo.
    assert.equal(html.includes("Viewing as"), false);
    assert.equal(html.includes("lensswitch"), false);
    assert.equal(app.includes("lens-switch-label"), false);
  });

  it("agrees between the nav badge and the page header chip", () => {
    const expected = {
      "lens-city-manager": "Empty",
      "lens-development-services": "Empty",
      "lens-finance": "Empty",
      "lens-citizen": "Preview",
      "work-review": "Preview",
      "work-files": "Preview",
      "work-records": "Not built",
      "work-assets": "Empty",
      "work-people": "Not built",
      /**
       * G-100. The four rendering roster lenses were absent from this map,
       * which is how their nav badge and their page chip could disagree
       * without anything going red. Their static value is the unread
       * fallback on both sides; applyLensState writes the resolved word to
       * both at boot.
       */
      "lens-public-works": "Not read",
      "lens-police": "Not read",
      "lens-fire-ems": "Not read",
      "lens-fleet": "Not read",
    };
    for (const [id, chip] of Object.entries(expected)) {
      // Citizen is a public light surface with no staff page header, so its
      // state chip sits in its own hero instead.
      const stop = id === "lens-citizen" ? "</p>" : "</header>";
      const section = html.match(new RegExp(`id="${id}"[\\s\\S]*?${stop}`))?.[0] || "";
      assert.ok(section.includes(`>${chip}<`), `${id} page chip should be ${chip}`);
    }
    const nav = html.match(/<nav class="shell-nav"[\s\S]*?<\/nav>/)?.[0] || "";
    for (const [label, badge] of [
      ["Overview", "Empty"],
      ["Development services", "Empty"],
      ["Finance", "Empty"],
      ["Citizen", "Preview"],
      ["Plan review", "Preview"],
      ["Files", "Preview"],
      ["Records search", "Not built"],
      ["Assets", "Empty"],
      ["People and access", "Not built"],
      ["Public works", "Not read"],
      ["Police", "Not read"],
      ["Fire and EMS", "Not read"],
      ["Fleet", "Not read"],
    ]) {
      assert.ok(
        nav.includes(`>${label}<span class="grow"></span><span class="badge">${badge}</span>`),
        `${label} nav badge should be ${badge}`,
      );
    }
  });

  it("ships the Assets chrome complete with the fixture behind an explicit label", () => {
    for (const id of ["atab-inventory", "atab-map", "atab-fixture"]) {
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.match(html, /No asset layer/);
    assert.match(html, /Vendor fleet telemetry is not an asset layer/);
    const fixture = html.match(/id="atab-fixture"[\s\S]*?<\/section>/)?.[0] || "";
    assert.match(fixture, /class="env demo">Demo fixture</);
    assert.match(fixture, /not a city asset/);
    assert.match(fixture, /Live state/);
    assert.equal(/\bSamsara\b/.test(fixture), false);
    assert.equal(html.includes("$0"), false);
    assert.equal(/\bhydrant\b/.test(html.replace(/No hydrant, fleet, or sample inventory/g, "")), false);
  });

  it("states every metric as unread rather than as a zero", () => {
    const metrics = html.match(/<div class="metrics"[\s\S]*?<\/div>\s*<\/div>/g) || [];
    assert.ok(metrics.length >= 2);
    for (const strip of metrics) {
      assert.equal(/class="v[^"]*">\s*0\s*</.test(strip), false);
      assert.match(strip, /Not read/);
    }
    assert.match(html, /Needs a decision/);
    assert.match(html, /Overdue reviews/);
    assert.match(html, /Permits in flight/);
    assert.match(html, /Meetings this week/);
    assert.match(html, /Ready to issue/);
  });

  it("accounts for every lens on the roster in the Across departments panel", () => {
    const panel = html.match(/id="overview-source-register"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || "";
    for (const label of [
      "Development services",
      "Finance",
      "Citizen",
      "Plan review",
      "Files",
      "Records search",
      "Public works",
      "Parks",
      "Police",
      "Fire and EMS",
      "Fleet",
      "Assets",
      "Connections",
      "People and access",
    ]) {
      assert.ok(panel.includes(`<b>${label}</b>`), `Across departments is missing ${label}`);
    }
  });
});

describe("G-77 fixture pack on Development services", () => {
  /**
   * The section this card owns. Lane B76 owns web/shell.css, the top bar and the
   * left nav, so every assertion below reads the Development services lens, the
   * app script, or the declared rule, never those blocks.
   */
  const ds = html.match(/id="lens-development-services"[\s\S]*?id="lens-finance"/)?.[0] || "";

  it("renders the environment badge the pack's records dimension declares", () => {
    // The divergence test for labelling gate item 1: the shipped chrome is
    // measured against the rule in city-pack.mjs, not against itself.
    const shipped = html.match(/id="env-badge"[^>]*>([^<]*)</)?.[1] || "";
    assert.equal(TEMPLATE_CITY.generatesFixtures, true);
    assert.equal(shipped, environmentBadgeLabel(TEMPLATE_CITY));
    assert.equal(shipped, "Demo");
  });

  it("wires the four tiles and the queue to the generated records", () => {
    for (const id of ["overdue", "in-review", "awaiting-applicant", "ready-to-issue"]) {
      assert.match(ds, new RegExp(`data-metric="${id}"`), id);
    }
    assert.match(ds, /id="ds-pipeline-rows"/);
    assert.match(ds, /<table class="dt">/);
    assert.match(app, /loadPipeline\(staffMap\.cityKey\)/);
    assert.match(app, /\/api\/lenses\/development-services\/pipeline\?cityKey=/);
    assert.match(app, /function renderPipelineMetrics/);
    // A metric with no records keeps saying Not read rather than showing a zero.
    assert.match(app, /value\.textContent = "Not read"/);
    assert.match(app, /of \$\{pipeline\.recordCount\} generated cases in flight/);
  });

  it("G-116 close: real domains rebuild their metric tiles from realStatusCounts instead of forcing them into the fixture's fixed named slots", () => {
    assert.match(app, /function renderRealStatusTiles/);
    // Both the generic per-domain renderer and the Pipeline's own renderer
    // check for a real breakdown before falling back to the fixture path.
    assert.match(app, /Array\.isArray\(extras\.realStatusCounts\)/);
    assert.match(app, /Array\.isArray\(pipeline\.realStatusCounts\)/);
  });

  it("G-116 close: a real record's missing fixture-only fields render blank, never the literal word undefined", () => {
    assert.match(app, /text == null \? "" : text/);
    assert.match(app, /record\.dueLabel \|\| ""/);
    assert.match(app, /label \|\| ""/);
    // The SLA cell is built from two numbers before it ever reaches a cell
    // helper, so it needs its own guard rather than a shared one.
    assert.match(app, /slaElapsedHours != null && record\.slaTargetHours != null/);
  });

  it("G-116 close: every static nav href threads the active pack's cityKey forward, so navigation cannot drop a non-default pack", () => {
    /**
     * Every shipped nav href is a static /?lens=... or /?work=... link with
     * no cityKey of its own -- correct by coincidence for template-city
     * (the default staffMap.cityKey falls back to) and silently wrong for
     * bastrop_tx or any other real pack: one click on any nav item lost the
     * pack and landed the visitor back on the demo. Confirmed still true of
     * the shipped markup (would be a stale test otherwise): every one of
     * these hrefs carries no cityKey param.
     */
    const hrefs = [...html.matchAll(/href="(\/\?[^"]*)"/g)].map((m) => m[1]);
    assert.ok(hrefs.length > 0, "expected at least one static nav href");
    for (const href of hrefs) {
      assert.equal(href.includes("cityKey="), false, href);
    }
    // The fix: rewritten once at boot from the same staffMap.cityKey every
    // loader on this page already uses, gated so it is a no-op for the
    // default pack (byte-identical behaviour for template-city).
    assert.match(app, /staffMap\.cityKey !== DEFAULT_CITY_KEY/);
    assert.match(app, /querySelectorAll\('a\[href\^="\/\?"\]'\)/);
    assert.match(app, /url\.searchParams\.set\("cityKey", staffMap\.cityKey\)/);
  });

  it("G-116 close: a real 'ok' region is never labelled Demo records, on the panel, the nav badge, the chip or the register row", () => {
    /**
     * Found live on the operator's own QA pass: 75 real Samsara vehicles
     * under a "Demo records" pill and a sidebar badge that also said
     * Demo records, because renderRegion/renderPipeline showed the
     * fixture-only mark on any ok payload with no real/fixture check, and
     * sourcedLabel (driving the nav badge, the page chip and the register
     * row) had the same gap.
     */
    assert.match(app, /const isReal = payload\.source === "live";\s*\n\s*show\(mark, ok && !isReal\);\s*\n\s*show\(prov, ok && !isReal\);/);
    assert.match(app, /const isReal = Array\.isArray\(pipeline\.realStatusCounts\);\s*\n\s*show\(empty, false\);\s*\n\s*show\(wrap, true\);\s*\n\s*show\(mark, !isReal\);\s*\n\s*show\(prov, !isReal\);/);
    assert.match(app, /if \(status === "ok" && regions\.some\(\(r\) => r && r\.source === "live"\)\) return "Live records";/);
    // The guarded five-word vocabulary itself is untouched -- src/lens-claims.test.mjs
    // holds LENS_BADGE/LENS_BADGE_ORDER equal to the fixture seam's own states,
    // and this fix does not add a sixth word to either.
    assert.match(app, /const LENS_BADGE = \{\s*\n\s*ok: "Demo records",\s*\n\s*"granted-empty": "No records",\s*\n\s*ungranted: "No source",\s*\n\s*"no-fixture-source": "Empty",\s*\n\s*"did-not-read": "Not read",\s*\n\s*\};/);
  });

  it("G-116 close: the Pipeline route dispatches to a real source exactly like /api/domains/:id and /api/city-domains do", () => {
    assert.match(
      serverSrc,
      /url\.pathname === "\/api\/lenses\/development-services\/pipeline"[\s\S]{0,1500}REAL_LIVE_DOMAINS\["permits-pipeline"\][\s\S]{0,300}composePipeline\(pack, real\)/,
    );
  });

  it("G-116 field enrichment: the five MyGov tables carry the new real-feed-only columns, additively", () => {
    /**
     * A comparison of the real staff dashboard (smartcity-os's own
     * DevelopmentServicesDashboard.tsx) against what this product mapped
     * for the same five live MyGov domains found genuine field gaps: real
     * columns/fields smartcity-os's platform routes already return (or, for
     * work orders, now return after a narrow smartcity-os fix) that this
     * product was not reading or displaying. Each new column is additive --
     * the six/seven/etc. columns each table already had are untouched.
     */
    assert.match(ds, /<th scope="col">Applicant<\/th>/);
    assert.match(ds, /<th scope="col">Contractor<\/th>/);
    assert.match(ds, /<th scope="col">Owner<\/th>/);
    assert.match(ds, /<th scope="col">Fees<\/th>/);
    assert.match(ds, /<th scope="col">Assigned to<\/th>/);
    assert.match(ds, /<th scope="col">Comments<\/th>/);
    assert.match(ds, /<th scope="col">Resolved<\/th>/);
    assert.match(ds, /<th scope="col">Type<\/th>/);

    // Permits (the pipeline table): applicant, contractor, owner, fees.
    assert.match(app, /td\(record\.applicant, "t-data"\)/);
    assert.match(app, /td\(record\.contractor, "t-data"\)/);
    assert.match(app, /td\(record\.ownerName, "t-data"\)/);
    // Work orders: assignedTo, contractor, fees (contractor/fees share the
    // permit row's own pattern above, so only the work-order-only one is
    // pinned again here).
    assert.match(app, /td\(record\.assignedTo, "t-data"\)/);
    // Inspections: comments.
    assert.match(app, /td\(record\.comments, "t-data"\)/);
    // Code violations: resolvedDate.
    assert.match(app, /td\(record\.resolvedDate, "t-data"\)/);
    // Business licenses: licenseType.
    assert.match(app, /td\(record\.licenseType, "t-data"\)/);

    // Itemized fees ({type, amount}[]) render as a joined line, not a bare
    // total -- production shows a real fees array, not just a total.
    assert.match(app, /function feesLabel\(fees\)/);
    assert.match(app, /td\(feesLabel\(record\.fees\), "t-data"\)/);
    // feesLabel itself uses td()'s same null/absence discipline: an absent
    // or empty array renders blank, never "undefined" or "$0.00".
    assert.match(app, /if \(!Array\.isArray\(fees\) \|\| fees\.length === 0\) return "";/);
  });

  it("composes existing kit classes and declares no new one", () => {
    /**
     * THE CLASS GATE. Hardened at G-88 item 3, before any design pass shipped a
     * screen through it, because the gate had three defects and each was
     * measured rather than suspected.
     *
     * Counting rule for the DEFINED set, stated here where its output is read:
     * the served stylesheets, CRLF-normalized, CSS COMMENTS STRIPPED, then every
     * "." followed by an identifier, deduplicated. The comment strip is the
     * whole point. Without it the rule counts six words that appear only inside
     * CSS comments as shipped classes - css, hidden, html, md, mjs, test - so an
     * injected class="hidden" did not fire this gate at all.
     *
     * THE DENOMINATOR IS MEASURED HERE, NOT QUOTED. This comment used to assert
     * "115 tokens under the old rule, 109 under this one". That was true when it
     * was written and G-88 item 2 falsified it in the same session by landing the
     * cite, mx, atomchip and finding families in web/shell.css. The historical
     * pair is kept as the illustration it is - the six-word gap was worth 115
     * versus 109 then - and the LIVE numbers are asserted below against the
     * stylesheets as they ship, so this can never go stale again. A comment that
     * asserts a stale count next to a live rule is the cheapest kind of wrong.
     *
     * Counting rule for the USED set: every class token in every markup source
     * the product serves, plus the bake source, with ${...} spans blanked.
     *
     * The gate is watched FIRING in this same test. A clean arm and an injected
     * arm living in different tests let an unrun check and a passing check look
     * alike, which is the failure this program keeps paying for.
     */
    const defined = stylesheetClasses();
    const loose = stylesheetClassesWithoutCommentStrip();
    const commentOnly = [...loose].filter((cls) => !defined.has(cls)).sort();

    /**
     * THE INVARIANT IS ASSERTED; THE SET IS REPORTED. This deliberately does NOT
     * pin the membership of commentOnly, and the reason is a measured one.
     *
     * It used to read assert.deepEqual(commentOnly, ["css","hidden","html","md",
     * "mjs","test"]). G-89 wrote a CSS comment explaining that app.js is a
     * module, the word `js` became the seventh member, and the pin went red for
     * a change that was not a defect in either direction. That pin re-arms every
     * time anyone writes a comment containing a dotted filename, which makes it
     * a gate that goes red only for prose - the DEV_PROCESS 2.0 shape, where a
     * gate nobody can keep green stops being read.
     *
     * What is load-bearing is not WHICH words are comment-only. It is that
     * `hidden` is one of them, because that is the whole reason an injected
     * class="hidden" fires this gate and did not fire the weaker rule; and that
     * the two counting rules differ by exactly the comment-only set, which is
     * the structural claim the comment strip makes. Both are asserted. The set
     * itself is checked for shape rather than membership, so a broken strip
     * cannot fill it with real classes.
     */
    assert.ok(commentOnly.includes("hidden"), "the probe class must be comment-only, or arm B proves nothing");
    assert.equal(
      defined.size + commentOnly.length,
      loose.size,
      "the two counting rules must differ by exactly the comment-only words",
    );
    assert.ok(defined.size > 0 && loose.size > defined.size);
    // Every comment-only word must really be inside a comment. Positive
    // determination: this fails if the loose rule starts inventing members.
    const commentText = [...STYLESHEET_SOURCES.map((rel) => readSource(rel)).join("\n").matchAll(/\/\*[\s\S]*?\*\//g)]
      .map((m) => m[0])
      .join("\n");
    for (const word of commentOnly) {
      assert.ok(commentText.includes(word), `${word} is counted as comment-only but appears in no comment`);
    }

    /**
     * Arm A, the real sources: the stray list must be empty. KNOWN_UNSTYLED is
     * stated once in src/served-surface.mjs beside the rule it excuses, and
     * imported here, so the two callers of the rule cannot excuse different
     * things. roster-lens is a DELETION TICKET, not permanent amnesty.
     */
    const sources = readMarkupSources();
    assert.deepEqual(Object.keys(sources).sort(), MARKUP_SOURCES);
    assert.deepEqual([...KNOWN_UNSTYLED], ["roster-lens"]);
    assert.deepEqual(strayClasses(sources, defined, KNOWN_UNSTYLED), []);

    /**
     * Arm B, the injected violations, run against every scanned source so the
     * gate is proven able to fire on each one rather than on the single source
     * somebody remembered to test.
     *
     * mx-card is a class a design pass would introduce; it appears in neither
     * design spec, so it cannot become real underneath this arm. hidden is the
     * regression this card exists for: the old rule counted it as defined
     * because the word appears inside a CSS comment, so this exact injection
     * used to pass.
     */
    const PROBES = ["mx-card", "hidden"];
    for (const probe of PROBES) {
      assert.equal(
        defined.has(probe),
        false,
        `${probe} is now a defined class and can no longer serve as a probe; pick one the stylesheets do not define`,
      );
    }
    for (const probe of PROBES) {
      for (const file of MARKUP_SOURCES) {
        const injected = { ...sources, [file]: `${sources[file]}\n<div class="${probe}"></div>\n` };
        assert.deepEqual(
          strayClasses(injected, defined, KNOWN_UNSTYLED),
          [probe],
          `injecting class="${probe}" into ${file} did not fire the gate naming exactly that class`,
        );
      }
    }

    // The severity map turns a declared meaning into a kit pill and nothing else.
    for (const cls of ["p-crit", "p-warn", "p-info", "p-ok", "p-quiet"]) {
      assert.ok(defined.has(cls), cls);
      assert.ok(app.includes(cls), cls);
    }
  });

  it("derives the scanned source list from server.mjs's sendFile call sites", () => {
    /**
     * Defect 2 of three: the gate used to read web/index.html and web/app.js and
     * nothing else, which is two of the five markup sources this product puts in
     * front of a browser.
     *
     * The list is DERIVED from server.mjs rather than hardcoded, so an asset
     * added to the server after this test was written cannot dodge the gate by
     * being new. The assertions below are the tripwire on that derivation: they
     * fail loudly when the served set changes, which is a decision to make
     * rather than a detail to discover three months later.
     */
    /**
     * G-90 moved this pin by one, which is the tripwire doing its job rather
     * than a nuisance. src/theme.mjs is served at /theme.mjs and imported by
     * web/app.js: it declares the theme vocabulary the inline head script has
     * to carry a second copy of, because a script that imports is a module and
     * a module is deferred, which is the G-89 defect. A new served asset is a
     * decision, so it is recorded here rather than discovered later.
     */
    assert.deepEqual(SERVED_ASSETS, [
      "src/staff-map.mjs",
      "src/staff-review.mjs",
      "src/theme.mjs",
      "web/app.js",
      "web/index.html",
      "web/property-map.css",
      "web/property-map.html",
      "web/property-map.js",
      "web/sc-kit.css",
      "web/shell.css",
    ]);

    /**
     * No call site dodges the parser. Counted rather than trusted: a refactor of
     * sendFile's shape would otherwise leave the derivation matching nothing and
     * the gate scanning nothing, silently, which is this program's own defect
     * class rather than a hypothetical.
     */
    const calls = (serverSrc.match(/\bsendFile\(/g) || []).length;
    const definitions = (serverSrc.match(/function sendFile\(/g) || []).length;
    assert.equal(definitions, 1, "sendFile is defined exactly once");
    assert.equal(
      SERVED_ASSETS.length,
      calls - definitions,
      "a sendFile call site was not parsed by the scan-list derivation",
    );

    // The stylesheets the counting rule reads ARE the stylesheets the product
    // serves. A newly served stylesheet fails here rather than going uncounted.
    assert.deepEqual(STYLESHEET_SOURCES, ["web/property-map.css", "web/sc-kit.css", "web/shell.css"]);
    assert.deepEqual(
      SERVED_ASSETS.filter((rel) => rel.endsWith(".css")),
      STYLESHEET_SOURCES,
    );

    /**
     * The five scanned markup sources. Four are served directly. src/shell-homes.mjs
     * is served by nobody: it generates the connections register as a server
     * template string and reaches the browser only through
     * scripts/bake-connections.mjs, whose output is never byte-asserted, so a
     * class renamed there without a re-bake ships stale and passes every test.
     * It is named here with its basis rather than folded quietly into the list.
     */
    assert.deepEqual(BAKE_SOURCES, ["src/shell-homes.mjs"]);
    assert.deepEqual(MARKUP_SOURCES, [
      "src/shell-homes.mjs",
      "src/staff-map.mjs",
      "src/staff-review.mjs",
      "src/theme.mjs",
      "web/app.js",
      "web/index.html",
      "web/property-map.html",
      "web/property-map.js",
    ]);
    for (const rel of [...SERVED_ASSETS, ...BAKE_SOURCES]) {
      assert.ok(fs.existsSync(path.join(root, rel)), `${rel} is scanned but does not exist`);
    }

    /**
     * staff-map.mjs, staff-review.mjs and theme.mjs assign no classes today,
     * which is exactly why nobody noticed the first two were unscanned. Written
     * as a positive determination with its basis, because an empty result is not
     * an absence. theme.mjs joins the list on the same footing: it is a pure
     * vocabulary and resolver module with no markup and no DOM, and the day it
     * grows either, this fails rather than the scan silently shrinking.
     */
    const sources = readMarkupSources();
    for (const rel of ["src/staff-map.mjs", "src/staff-review.mjs", "src/theme.mjs"]) {
      assert.equal(classesUsed(sources[rel]).size, 0, `${rel} has started assigning classes`);
    }
    assert.ok(classesUsed(sources["src/shell-homes.mjs"]).size > 0, "shell-homes assigns classes");
  });

  it("marks the queue as generated in the chrome as well as in the payload", () => {
    assert.match(ds, /id="ds-pipeline-mark"[^>]*>Demo records</);
    assert.match(ds, /class="pill p-warn" id="ds-pipeline-mark"/);
    assert.match(ds, /Generated fixture/);
    assert.match(ds, /MyGov output contract/);
    assert.match(app, /basis\.textContent = `Basis: \$\{pipeline\.basis\}`/);
    // No invented freshness anywhere on this lens.
    assert.equal(/last sync|last read|last updated/i.test(ds), false);
    assert.equal(ds.includes("$"), false);
  });

  it("keeps the honest-empty screen reachable and states its basis", () => {
    assert.match(ds, /id="ds-pipeline-empty"/);
    assert.match(ds, /class="state" id="ds-pipeline-empty"/);
    assert.match(ds, /id="ds-pipeline-empty-basis"/);
    assert.match(app, /if \(records\.length === 0\) \{/);
    assert.match(app, /show\(empty, true\)/);
    assert.match(app, /show\(wrap, false\)/);
    assert.match(app, /emptyBasis\.textContent = `Basis: \$\{pipeline\.basis\}`/);
    // A failed read renders as a stated failure, not as a city with no cases.
    assert.match(app, /the pipeline did not read for \$\{key\}/);
  });

  it("drives the nav badge, the page chip and the register row from one label", () => {
    /**
     * Paired control: renderings of one fact need a single source, not careful
     * edits (DEV_PROCESS 2.4).
     *
     * G-100 grew this from two renderings to three and, more to the point, took
     * Development services OFF its own private label function. packStateLabel
     * read pipeline.generated, a boolean, so an ungranted pack and a pack that
     * generates nothing produced the same badge - the collapse ruling 1 exists
     * to close, surviving in the one lens nobody re-checked. Both it and
     * applyPackState are gone; DS resolves through sourcedLabel like every other
     * lens, off the sourceStatus the compose has carried since G-91.
     */
    assert.equal(app.includes("function packStateLabel"), false, "the second label function is back");
    assert.equal(app.includes("function applyPackState"), false, "the second apply function is back");
    const applyState = app.match(/function applyLensState[\s\S]*?\n\}/)?.[0] || "";
    assert.ok(applyState, "applyLensState must exist");
    assert.equal((applyState.match(/\.textContent = label/g) || []).length, 3);
    assert.match(applyState, /getElementById\(chipId\)/);
    assert.match(applyState, /navitem\[data-lens="\$\{lensId\}"\] \.badge/);
    assert.match(applyState, /\[data-lens-row="\$\{lensId\}"\] \.pill/);
    // And the pipeline is one of its callers, with the seam's own status
    // (source travels alongside it now, G-116, so a real pipeline is not
    // mislabelled through the same call).
    assert.match(app, /applyLensState\(\s*"ds-state-chip",\s*"development-services",\s*sourcedLabel\(\[\{ status, source: [\s\S]{0,120}\}\]\),?\s*\);/);
    // The static value is the unread fallback on every lens this rule drives.
    assert.match(ds, /id="ds-state-chip">Empty</);
    for (const id of ["pw-state-chip", "police-state-chip", "fire-ems-state-chip", "fleet-state-chip"]) {
      assert.match(html, new RegExp(`id="${id}">Not read<`), id);
    }
  });

  it("hides through a mechanism that actually works on this kit", () => {
    /**
     * The hidden attribute was inert on any component the kit gives an explicit
     * display, which is how an amber Partial pill shipped beside the words
     * "no meeting packet has been read". G-81 fixed that at the root with one
     * global [hidden] rule in shell.css and retired the two per-component
     * patches; src/hidden-rule.test.mjs owns that rule and measures it. show()
     * stays as the belt and braces, and every toggle still goes through it.
     */
    assert.match(app, /function show\(el, on\)/);
    for (const cls of ["pill", "prov", "state"]) {
      assert.match(shell, new RegExp(`\\.${cls} \\{[^}]*display:`), cls);
      assert.equal(shell.includes(`.${cls}[hidden]`), false, cls);
    }
    assert.match(shell, /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/);
    for (const name of ["honesty", "state", "empty", "wrap", "mark", "prov", "list"]) {
      assert.match(app, new RegExp(`show\\(${name}, `), name);
      assert.equal(new RegExp(`\\b${name}\\.hidden = `).test(app), false, name);
    }
    // Before the script runs, the markup agrees with the attribute.
    for (const id of ["ds-pipeline-mark", "ds-pipeline-prov", "overview-meetings-honesty"]) {
      assert.match(html, new RegExp(`id="${id}" hidden style="display:none"`), id);
    }
  });

  it("keeps G-24 at zero and grants nothing on any pack", () => {
    assert.match(html, /No city-owned asset records for <span data-pack-key>/);
    // Generation is server side. The browser renders records, never invents them.
    assert.equal(/generatePipelineRecords|composePipeline/.test(app), false);
    // The one asset row on this lens stays an honest Empty, on every pack.
    assert.match(
      ds,
      /<b>Assets<\/b><span>City-owned records at this place<\/span><\/span><span class="pill p-quiet">Empty</,
    );
  });
});

describe("G-116 CIP enrichment: real phase/Gantt fields on Capital projects", () => {
  it("shows the real currentPhase for a live record without disturbing the fixture's own phase id", () => {
    // record.phase is the fixture's invented phase id (STATUS_PHASES in
    // src/domains/cip-projects.mjs); record.currentPhase is the real value
    // getCIPProjectData() returns. The cell prefers whichever one the record
    // actually carries -- never both, never one relabeled as the other.
    assert.match(app, /td\(record\.phase \|\| record\.currentPhase\)/);
  });

  it("adds a Completion column and formats it as a real percent, blank (not 0%/undefined) when absent", () => {
    assert.match(html, /<th scope="col">Completion<\/th>/);
    assert.match(app, /function pctText\(value\)/);
    assert.match(app, /typeof value !== "number" \|\| !Number\.isFinite\(value\)\) return null/);
    assert.match(app, /td\(pctText\(record\.completion\), "t-data"\)/);
  });

  it("renders the real per-task Gantt rows in a table distinct from the fixture's phase-count summary", () => {
    // The fixture's own aggregate table (extras.phases: phase + count, see
    // phaseSummary() in src/domains/cip-projects.mjs) is untouched --
    // pw-cip-phase-rows still exists and is built from extras.phases alone.
    assert.match(app, /Array\.isArray\(extras\.phases\) \? extras\.phases : \[\]/);
    // The new per-task table reads each record's OWN phases array (the real
    // Gantt rows), never extras.phases -- a different question, a different
    // source, a different table.
    assert.match(app, /const ganttRows = records\.flatMap\(/);
    assert.match(app, /Array\.isArray\(record\.phases\) \? record\.phases : \[\]/);
    assert.match(html, /id="pw-cip-gantt-rows"/);
    assert.match(html, /<th scope="col">Task<\/th>/);
    assert.match(html, /<th scope="col">Duration \(days\)<\/th>/);
    // Fixture packs never populate a record's `phases` array; the table
    // itself is hidden for them (a th-has-data-cells violation otherwise --
    // header cells with no data row anywhere is a real defect, not honesty),
    // and only the caption states the absence.
    assert.match(html, /Per-task phase data has not been read for this pack/);
  });

  it("G-116 CIP a11y fix: the Gantt table is hidden (not left visible with an empty body) when no real phase rows exist", () => {
    assert.match(html, /<table class="dt" id="pw-cip-gantt-table" hidden style="display:none">/);
    assert.match(app, /show\(document\.getElementById\("pw-cip-gantt-table"\), ganttRows\.length > 0\);/);
  });

  it("prints no money figure and no new kit class in the new Completion/Gantt markup", () => {
    const works = html.match(/id="lens-public-works"[\s\S]*?<\/section>/)?.[0] || "";
    assert.equal(/\$\s?\d/.test(works), false, "a money figure reached the Capital projects register");
    for (const column of ["Budget", "Spend", "Cost"]) {
      assert.equal(works.includes(`<th scope="col">${column}</th>`), false, `${column} column`);
    }
  });
});

describe("G-116 fleet-enrich: DVIR, 7-day safety events, mileage/fuel flags", () => {
  it("adds the three new columns to the vehicle roster table header, additive to the existing five", () => {
    const table = html.match(/id="fleet-roster-records"[\s\S]*?<tbody id="fleet-roster-rows">/)?.[0] || "";
    assert.match(table, /<th scope="col">Vehicle<\/th>/);
    assert.match(table, /<th scope="col">Unit<\/th>/);
    assert.match(table, /<th scope="col">Status<\/th>/);
    assert.match(table, /<th scope="col">Operator<\/th>/);
    assert.match(table, /<th scope="col">Odometer<\/th>/);
    assert.match(table, /<th scope="col">DVIR<\/th>/);
    assert.match(table, /<th scope="col">Safety \(7d\)<\/th>/);
    assert.match(table, /<th scope="col">Flags<\/th>/);
    // Additive, not a redesign: still exactly eight columns, none removed.
    const headCount = (table.match(/<th scope="col">/g) || []).length;
    assert.equal(headCount, 8);
  });

  it("renderFleet reads the new record fields, none fabricated from something else", () => {
    const renderFleet = app.match(/function renderFleet\(payload\)[\s\S]*?\n\}/)?.[0] || "";
    assert.ok(renderFleet, "renderFleet must exist");
    assert.match(renderFleet, /fleetDvirLabel\(record\)/);
    assert.match(renderFleet, /record\.safetyEvents7d/);
    assert.match(renderFleet, /fleetFlagsLabel\(record\)/);
  });

  it("fleetDvirLabel renders blank (not 'Clear') when there is no DVIR data, and 'Clear' only for a real zero", () => {
    const fn = app.match(/function fleetDvirLabel\(record\)[\s\S]*?\n\}/)?.[0] || "";
    assert.ok(fn, "fleetDvirLabel must exist");
    assert.match(fn, /dvirUnresolvedDefects == null/);
    assert.match(fn, /return null/);
    assert.match(fn, /"Clear"/);
  });

  it("fleetFlagsLabel only ever asserts a flag on a real === true, never on a merely-truthy or unknown value", () => {
    const fn = app.match(/function fleetFlagsLabel\(record\)[\s\S]*?\n\}/)?.[0] || "";
    assert.ok(fn, "fleetFlagsLabel must exist");
    assert.match(fn, /record\.highMileage === true/);
    assert.match(fn, /record\.lowFuel === true/);
  });

  it("uses the shared td() helper for the new cells, so a missing value renders blank rather than the literal word undefined", () => {
    const renderFleet = app.match(/function renderFleet\(payload\)[\s\S]*?\n\}/)?.[0] || "";
    assert.match(renderFleet, /td\(fleetDvirLabel\(record\)\)/);
    assert.match(renderFleet, /td\(record\.safetyEvents7d == null \? null : String\(record\.safetyEvents7d\)\)/);
    assert.match(renderFleet, /td\(fleetFlagsLabel\(record\)\)/);
  });
});
