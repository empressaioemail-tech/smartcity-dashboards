import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";
import { ROSTER_LENS_IDS } from "./staff-review.mjs";
import { TEMPLATE_CITY, environmentBadgeLabel } from "./city-pack.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "web", "app.js"), "utf8");
const shell = fs.readFileSync(path.join(root, "web", "shell.css"), "utf8");
const kit = fs.readFileSync(path.join(root, "web", "sc-kit.css"), "utf8");
const surface = html + "\n" + app;

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
    assert.equal(html.includes("Bastrop"), false);
    assert.equal(html.toLowerCase().includes("bastrop onboarded"), false);
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
    for (const label of ["Parks", "Records search", "People and access", "Public works", "Police", "Fire and EMS", "Fleet"]) {
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
    for (const anchor of ["anchor-overview-map", "anchor-place-map", "anchor-ds-review", "anchor-work-review", "anchor-files"]) {
      assert.match(html, new RegExp(`id="${anchor}"`), anchor);
    }
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

  it("composes existing kit classes and declares no new one", () => {
    const defined = new Set(
      [...(shell + kit).matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]),
    );
    /**
     * Exclusion set, stated where the output is read: roster-lens is a pre-G-77
     * marker class in the nav that carries no style. Nothing else is excused.
     */
    const KNOWN_UNSTYLED = new Set(["roster-lens"]);
    const used = new Set();
    for (const m of html.matchAll(/class="([^"]+)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) used.add(c);
    }
    // Classes the script applies at runtime count too.
    for (const m of app.matchAll(/className = "([^"]+)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) used.add(c);
    }
    for (const m of app.matchAll(/className = `([^`]+)`/g)) {
      for (const c of m[1].replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (c) used.add(c);
    }
    for (const m of app.matchAll(/classList\.(add|remove|toggle)\("([^"]+)"/g)) used.add(m[2]);
    const undefinedClasses = [...used].filter((c) => !defined.has(c) && !KNOWN_UNSTYLED.has(c));
    assert.deepEqual(undefinedClasses, []);
    // The severity map turns a declared meaning into a kit pill and nothing else.
    for (const cls of ["p-crit", "p-warn", "p-info", "p-ok", "p-quiet"]) {
      assert.ok(defined.has(cls), cls);
      assert.ok(app.includes(cls), cls);
    }
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

  it("drives the nav badge and the page chip from one label", () => {
    // Paired control: two renderings of one fact need a single source, not two
    // careful edits (DEV_PROCESS 2.4).
    assert.match(app, /function packStateLabel/);
    const applyState = app.match(/function applyPackState[\s\S]*?\n\}/)?.[0] || "";
    assert.match(applyState, /const label = packStateLabel\(pipeline\)/);
    assert.equal((applyState.match(/= label/g) || []).length, 2);
    assert.match(applyState, /id="ds-state-chip"|getElementById\("ds-state-chip"\)/);
    assert.match(applyState, /navitem\[data-lens="development-services"\] \.badge/);
    assert.match(ds, /id="ds-state-chip">Empty</);
  });

  it("hides through a mechanism that actually works on this kit", () => {
    /**
     * The hidden attribute is inert on any component the kit gives an explicit
     * display. Two of them were already patched one at a time in shell.css; the
     * rest were not, which is how an amber Partial pill shipped beside the words
     * "no meeting packet has been read". Every toggle goes through show().
     */
    assert.match(app, /function show\(el, on\)/);
    for (const cls of ["pill", "prov", "state"]) {
      assert.match(shell, new RegExp(`\\.${cls} \\{[^}]*display:`), cls);
      assert.equal(shell.includes(`.${cls}[hidden]`), false, cls);
    }
    assert.match(shell, /\.stage\[hidden\] \{ display: none; \}/);
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
