#!/usr/bin/env node
/**
 * G-153 / D-12 / G-135 parcel 2. A FULL-SHELL AUTHENTICATED PROBE, MEASURED IN A BROWSER.
 *
 * WHY THIS EXISTS, IN ONE SENTENCE FROM THE ROW: G-135 is closed-partial on exactly one
 * unmeasured thing -- "a full-shell authenticated probe on `bastrop_tx` that mounts the map
 * iframe, which has never once happened" -- and the row that inherits it needs the artifact,
 * not the sentence.
 *
 * WHAT MAKES IT A MEASUREMENT AND NOT A FETCH. `scripts/govtech/dolphin-ship-acceptance.mjs`
 * (doc_repo) already grades the deployed surface with the same tenant key, but it grades
 * ROUTES: it presents `x-hauska-key` on `fetch` and reads JSON. Every fact on the dashboards
 * side of a lens is painted by this repo's own `web/app.js` in a BROWSER, from those route
 * payloads, and the map iframe is an `iframe` inside the shell that only mounts after the
 * shell's own compose call answers. None of that is observable from a `fetch`, which is
 * exactly why the map iframe had never been seen mounted by any instrument in this program.
 * So this drives Chromium (playwright-core, the same dependency `scripts/a11y-scan.mjs` and
 * `scripts/export-dev-services-lens.mjs` already use) and reads the painted DOM.
 *
 * THE CREDENTIAL DISCIPLINE IS COPIED, NOT INVENTED (see export-dev-services-lens.mjs:59-78).
 * The key arrives in the environment of the calling shell (`--key-env`, default
 * `HAUSKA_TENANT_KEY`) -- never as an argument, never in the URL, never in a file this script
 * or its artifact writes. It is seeded into the product's own `hauska_key` localStorage slot by
 * an init script, which is the same slot the product's own `?hauskaKey=` bootstrap writes and
 * which its `window.fetch` wrapper reads, so the same `x-hauska-key` header the routes expect
 * reaches every same-origin `/api/` call the page makes -- including the ones made from inside
 * the map iframe. The artifact records only THAT a key was presented (`auth` below), and the
 * run REFUSES to write an artifact whose text contains the key value.
 *
 * USAGE
 *   node --use-system-ca scripts/full-shell-probe.mjs --out <artifact.json> [--base <url>]
 *        [--city bastrop_tx] [--shot-dir <dir>] [--search-address "908 Pine St"]
 *        [--key-env HAUSKA_TENANT_KEY]
 *
 * `--use-system-ca` IS NOT DECORATION ON THIS FLEET (P-347, doc_repo `scripts/surface-probe.mjs`):
 * the fetch-level halves below -- the refusal directions and the domain reads -- FAIL TLS on a host
 * whose Node cannot use the system CA store, and they fail as `fetch failed`, which reads like a
 * refused request. The first run of this file did exactly that and recorded `status: null` for every
 * one of them. The browser half is unaffected (Chromium has its own store), which is why the two
 * halves of one artifact can disagree about whether the host is reachable at all. A fetch error is
 * recorded as `fetchError`, never as a status.
 *
 * `--base` reads ANY deployed app or another worktree's server; the artifact records `mode`
 * ("deployed" vs "external-loopback") so a close cannot cite a deployment it did not touch.
 *
 * WHAT IT DOES **NOT** CLAIM. It is a probe of the deployment it names, on the day it ran, from
 * this machine. A tile layer that does not paint because this machine cannot reach a tile CDN is
 * recorded as the tile count it measured, not as a defect on the surface. Nothing here decides
 * whether a lens is correct; it records what a browser saw.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const val = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const base = String(val("--base", "https://app.smartcityos.io")).replace(/\/$/, "");
const city = String(val("--city", "bastrop_tx"));
const outPath = val("--out");
const shotDir = val("--shot-dir", null);
const searchAddress = String(val("--search-address", "908 Pine St"));
const keyEnvName = String(val("--key-env", "HAUSKA_TENANT_KEY"));
const key = String(process.env[keyEnvName] || "").trim();

if (!outPath) {
  console.error(
    [
      "usage: node scripts/full-shell-probe.mjs --out <artifact.json> [--base <url>] [--city <cityKey>]",
      '       [--shot-dir <dir>] [--search-address "908 Pine St"] [--key-env HAUSKA_TENANT_KEY]',
      "",
      "the tenant key is read from the environment, never from an argument or a URL:",
      `  $env:${keyEnvName} = gcloud secrets versions access latest --secret=<secret> --project=<project>`,
    ].join("\n"),
  );
  process.exit(2);
}

/**
 * `mode` is a PROVENANCE field: a loopback base is not a deployment, and saying so is the
 * difference between an artifact and a claim (export-dev-services-lens.mjs:100).
 */
const loopbackBase = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/.test(base);
const mode = loopbackBase ? "external-loopback" : "deployed";

/** A missing browser is a HARD FAILURE with an instruction, never a skip. */
async function launchChromium() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (err) {
    console.error(`playwright-core did not load (${err.message}). Run: npm ci`);
    process.exit(2);
  }
  try {
    return await chromium.launch();
  } catch (err) {
    console.error("Chromium did not launch, so the probe DID NOT RUN. Install it and run again:");
    console.error("  npx playwright-core install chromium");
    console.error(err.message);
    process.exit(2);
  }
}

/** Bounded poll: returns the moment the predicate holds, and reports what it settled at when it did not. */
async function poll(fn, { timeoutMs, intervalMs = 250 }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return { ok: true, value };
    if (Date.now() > deadline) return { ok: false, value: null };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Read the DOM facts a Fleet-shaped lens region carries. Text only; no interpretation. */
const lensFacts = (page, lensId, prefix) =>
  page.evaluate(
    ({ lensId, prefix: p }) => {
      const txt = (id) => {
        const el = document.getElementById(id);
        return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
      };
      const hidden = (id) => {
        const el = document.getElementById(id);
        return el ? Boolean(el.hidden) : null;
      };
      const rows = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        return [...el.children].map((tr) => [...tr.children].map((td) => td.textContent.replace(/\s+/g, " ").trim()));
      };
      const visible = (id) => {
        const el = document.getElementById(id);
        return el ? el.offsetParent !== null : false;
      };
      return {
        lensId,
        lensSectionPresent: Boolean(document.getElementById(lensId)),
        lensVisible: visible(lensId),
        stateChip: txt(`${p}-state-chip`),
        regionRule: txt(`${p}-region-rule`),
        metrics: [...document.querySelectorAll(`#${p}-metrics .metric`)].map((m) => m.textContent.replace(/\s+/g, " ").trim()),
        roster: {
          /**
           * The mark/prov pair is read with its HIDDEN state, not only its text: the shipped markup
           * says "Demo records" / "Generated fixture" and web/app.js shows them only on the fixture
           * path. A probe that reads text alone would report a live payload as badged demo -- which
           * is a false finding about the surface, produced by the instrument.
           */
          mark: txt(`${p}-roster-mark`),
          markHidden: hidden(`${p}-roster-mark`),
          prov: txt(`${p}-roster-prov`),
          provHidden: hidden(`${p}-roster-prov`),
          caption: txt(`${p}-roster-caption`),
          head: txt(`${p}-roster-head`),
          basis: txt(`${p}-roster-basis`),
          recordsVisible: visible(`${p}-roster-records`),
          recordsBasis: txt(`${p}-roster-recordsbasis`),
          inventory: txt(`${p}-roster-inventory`),
          rows: rows(`${p}-roster-rows`),
          headerCells: [...(document.querySelector(`#${p}-roster-rows`)?.closest("table")?.querySelectorAll("thead th") || [])].map((th) => th.textContent.replace(/\s+/g, " ").trim()),
        },
        operators: {
          rows: rows(`${p}-operator-rows`),
          basis: txt(`${p}-operator-basis`),
          rule: txt(`${p}-operator-rule`),
        },
      };
    },
    { lensId, prefix },
  );

const policeFacts = (page) =>
  page.evaluate(() => {
    const txt = (id) => {
      const el = document.getElementById(id);
      return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
    };
    const hidden = (id) => {
      const el = document.getElementById(id);
      return el ? Boolean(el.hidden) : null;
    };
    const rows = (id) => {
      const el = document.getElementById(id);
      return el ? [...el.children].map((tr) => [...tr.children].map((td) => td.textContent.replace(/\s+/g, " ").trim())) : null;
    };
    const visible = (id) => {
      const el = document.getElementById(id);
      return el ? el.offsetParent !== null : false;
    };
    return {
      lensVisible: visible("lens-police"),
      stateChip: txt("police-state-chip"),
      regionRule: txt("police-region-rule"),
      cameras: {
        mark: txt("police-cameras-mark"),
        markHidden: hidden("police-cameras-mark"),
        prov: txt("police-cameras-prov"),
        provHidden: hidden("police-cameras-prov"),
        caption: txt("police-cameras-caption"),
        head: txt("police-cameras-head"),
        basis: txt("police-cameras-basis"),
        privacy: txt("police-cameras-privacy"),
        inventory: txt("police-cameras-inventory"),
        recordsVisible: visible("police-cameras-records"),
        rows: rows("police-cameras-rows"),
        siteRows: rows("police-cameras-site-rows"),
        occupancyRows: rows("police-cameras-occupancy-rows"),
      },
      patrol: {
        mark: txt("patrol-vehicles-mark"),
        markHidden: hidden("patrol-vehicles-mark"),
        prov: txt("patrol-vehicles-prov"),
        provHidden: hidden("patrol-vehicles-prov"),
        caption: txt("patrol-vehicles-caption"),
        head: txt("patrol-vehicles-head"),
        basis: txt("patrol-vehicles-basis"),
        operator: txt("patrol-vehicles-operator"),
        inventory: txt("patrol-vehicles-inventory"),
        recordsBasis: txt("patrol-vehicles-recordsbasis"),
        recordsVisible: visible("patrol-vehicles-records"),
        rows: rows("patrol-vehicles-rows"),
        headerCells: [...(document.querySelector("#patrol-vehicles-rows")?.closest("table")?.querySelectorAll("thead th") || [])].map((th) => th.textContent.replace(/\s+/g, " ").trim()),
        metrics: [...document.querySelectorAll("#patrol-vehicles-metrics .metric")].map((m) => m.textContent.replace(/\s+/g, " ").trim()),
      },
    };
  });

/**
 * The shell facts: WHICH CITY the session resolved to, and whether the shell said so or said the
 * no-city state. G-161's rule is that the shell never invents a city, so "the pack key rendered
 * as bastrop_tx" is the evidence that the CALLER'S TENANT named the city -- not a query param.
 */
const shellFacts = (page) =>
  page.evaluate(() => {
    const txt = (id) => {
      const el = document.getElementById(id);
      return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
    };
    const shell = document.getElementById("app-shell");
    const params = [...document.querySelectorAll("[data-pack-key]")].map((el) => el.textContent.trim());
    const noCity = document.getElementById("no-city-state");
    return {
      shellPresent: Boolean(shell),
      shellCityKey: shell ? shell.getAttribute("data-city-key") : null,
      packKeyNodes: params.slice(0, 6),
      packKeyNodeCount: params.length,
      citySeal: txt("city-seal"),
      title: document.title,
      noCityStateVisible: noCity ? noCity.offsetParent !== null : null,
    };
  });

/**
 * The map stage. `#map-site` is the mounted product iframe (web/index.html; one frame serves both
 * the Overview rail and the persistent rail). Its src is set by web/app.js's Stage.mount() from the
 * shell's OWN compose answer, so a src present means the compose answered with a url AND the frame
 * was attached to the document -- which is the thing G-135 says has never been observed.
 */
const mapStageFacts = (page) =>
  page.evaluate(() => {
    const frame = document.getElementById("map-site");
    const stage = document.getElementById("map-stage");
    const rect = frame ? frame.getBoundingClientRect() : null;
    return {
      framePresent: Boolean(frame),
      frameSrc: frame ? frame.getAttribute("src") : null,
      frameDatasetSrc: frame ? frame.getAttribute("data-src") : null,
      stageHidden: stage ? Boolean(stage.hidden) : null,
      frameVisible: frame ? frame.offsetParent !== null : null,
      frameBox: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
      iframeCount: document.querySelectorAll("iframe").length,
      iframeIds: [...document.querySelectorAll("iframe")].map((f) => f.id || f.getAttribute("data-stage") || "(unnamed)"),
    };
  });

/** Inside the mounted property-map page, once it is there. Its own DOM, its own map, its own panel. */
const mapFrameFacts = (frame) =>
  frame.evaluate(() => {
    const txt = (id) => {
      const el = document.getElementById(id);
      return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
    };
    const map = document.getElementById("pm-map");
    return {
      url: window.location.href,
      readyState: document.readyState,
      leafletGlobal: typeof window.L !== "undefined" && Boolean(window.L && window.L.map),
      mapDivPresent: Boolean(map),
      mapDivClasses: map ? map.className : null,
      tileImages: document.querySelectorAll("#pm-map img.leaflet-tile").length,
      loadedTiles: document.querySelectorAll("#pm-map img.leaflet-tile-loaded").length,
      layerCategoryChildren: document.getElementById("pm-layers-categories")?.children.length ?? null,
      layerLabels: document.querySelectorAll("#pm-layers-categories .pm-layers-label").length,
      layerTemplates: document.querySelectorAll("#pm-layers-templates .pm-layers-label").length,
      layersCount: txt("pm-layers-count"),
      layersStatus: txt("pm-layers-status"),
      status: txt("pm-status"),
      searchInputPresent: Boolean(document.getElementById("pm-address-input")),
      /**
       * THE FRAME IS EMBEDDED, AND THE PAGE SAYS SO ITSELF: web/property-map.js adds `pm-embedded`
       * to <body> when `window.self !== window.top`, and web/property-map.css then sets
       * `.pm-embedded .pm-search, .pm-embedded .pm-status { display: none }`. So inside the shell the
       * page's own address form and status line are not merely out of layout, they are hidden ON
       * PURPOSE (G-128: the shell renders property detail from its own route instead). That is why
       * no pointer gesture reaches the field in either dock mode, and it is recorded as a fact here
       * rather than left as a driver that "kept failing".
       */
      bodyClass: document.body.className,
      embedded: document.body.classList.contains("pm-embedded"),
      searchFormDisplay: (() => {
        const el = document.getElementById("pm-search-form");
        return el ? getComputedStyle(el).display : null;
      })(),
      statusDisplay: (() => {
        const el = document.getElementById("pm-status");
        return el ? getComputedStyle(el).display : null;
      })(),
      dockModeButtons: Array.from(document.querySelectorAll("[data-dock-mode]")).map((b) => ({ mode: b.getAttribute("data-dock-mode"), pressed: b.getAttribute("aria-pressed") })),
      searchButtonBox: (() => {
        const el = document.getElementById("pm-search-btn");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      })(),
      summary: {
        sectionPresent: Boolean(document.getElementById("pm-summary-section")),
        address: txt("pm-address"),
        parcelId: txt("pm-parcel-id"),
        owner: txt("pm-owner"),
        zoning: txt("pm-zoning"),
        flood: txt("pm-flood"),
        acreage: txt("pm-acreage"),
        note: txt("pm-parcel-note"),
      },
      valuation: {
        basis: txt("pm-valuation-basis"),
        appraised: txt("pm-appraised-value"),
        market: txt("pm-market-value"),
        yearBuilt: txt("pm-year-built"),
      },
    };
  });

const browser = await launchChromium();
const startedAt = new Date().toISOString();
const artifact = {
  instrument: "scripts/full-shell-probe.mjs",
  ranAt: startedAt,
  base,
  mode,
  city,
  auth: key ? { presented: true, source: `environment variable ${keyEnvName}`, header: "x-hauska-key via the product's own hauska_key localStorage slot (init script)" } : { presented: false, source: null, note: "NO key was presented; a tenant-private pack must read as its stated absence" },
  searchAddress: searchAddress || null,
  passes: [],
  network: [],
  statements: [],
};

/** Every response the page (and any frame in it) made, with the API bodies the close will read. */
let apiBodies = {};
const pageErrors = [];
const wantsBody = (url) =>
  /\/api\/(city-packs|lenses\/|domains\/|property-map\/)/.test(url);

try {
  const ctx = await browser.newContext();
  if (key) {
    await ctx.addInitScript((k) => {
      try {
        window.localStorage.setItem("hauska_key", k);
      } catch {
        /* localStorage unavailable; the pack will read as its stated absence */
      }
    }, key);
  }
  const page = await ctx.newPage();
  /** Reset per pass: one pass's API answers must never be read as another pass's. */
  apiBodies = {};
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    const entry = { url: url.replace(base, ""), status: res.status(), frame: res.frame()?.url().replace(base, "") || null };
    artifact.network.push(entry);
    if (wantsBody(url)) {
      res
        .json()
        .then((body) => {
          apiBodies[entry.url] = body;
        })
        .catch(() => {
          apiBodies[entry.url] = "(body not json / not readable)";
        });
    }
  });
  page.on("pageerror", (err) => pageErrors.push(`PAGE ERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(`CONSOLE ERROR: ${msg.text().slice(0, 200)}`);
  });

  /** A compact, honest summary of each API answer the close needs, keyed by the URL it came from. */
  const apiDigest = () => {
    const pick = (re) => {
      const hit = Object.entries(apiBodies).find(([u]) => re.test(u));
      return hit ? { url: hit[0], body: hit[1] } : null;
    };
    const domain = (id) => {
      const hit = pick(new RegExp(`/api/domains/${id}\\?`));
      if (!hit) return null;
      const b = hit.body || {};
      return {
        url: hit.url,
        status: b.status ?? null,
        source: b.source ?? null,
        basis: b.basis ?? null,
        recordCount: Array.isArray(b.records) ? b.records.length : null,
        records: Array.isArray(b.records) ? b.records.slice(0, 3) : null,
        extrasPresent: b.extras ? Object.keys(b.extras) : null,
      };
    };
    const cityPacks = pick(/\/api\/city-packs/);
    const goldMap = pick(/\/api\/lenses\/city-manager\/compose/);
    const propSummary = pick(/\/api\/property-map\/summary/);
    const propLayers = pick(/\/api\/property-map\/layers/);
    const slim = (hit) => (hit ? { url: hit.url, body: hit.body } : null);
    return {
      cityPacks: cityPacks
        ? { url: cityPacks.url, status: cityPacks.status ?? null, caller: cityPacks.body?.caller ?? null, count: Array.isArray(cityPacks.body?.packs) ? cityPacks.body.packs.length : null }
        : null,
      goldMap: goldMap ? { url: goldMap.url, status: goldMap.status ?? null, smartsite: goldMap.body?.smartsite ?? null, planReview: goldMap.body?.planReview ?? null, floodDrainage: goldMap.body?.floodDrainage ?? null } : null,
      fleetVehicles: domain("fleet-vehicles"),
      patrolVehicles: domain("patrol-vehicles"),
      policeCameras: domain("police-cameras"),
      propertySummary: propSummary
        ? { url: propSummary.url, body: propSummary.body && typeof propSummary.body === "object" ? { status: propSummary.body.status ?? null, found: propSummary.body.found ?? null, basis: propSummary.body.basis ?? null, match: propSummary.body.match ?? null, snapshot: propSummary.body.result?.snapshot ?? null } : propSummary.body }
        : null,
      propertyLayers: propLayers ? slim(propLayers) : null,
    };
  };

  for (const pass of [
    { key: "full-shell-bare", url: "/", what: "the full shell, with the city resolved from the CALLER'S TENANT and no cityKey in the address" },
    { key: "full-shell-bastrop", url: `/?cityKey=${encodeURIComponent(city)}`, what: "the full shell, city named explicitly" },
    { key: "lens-fleet", url: `/?lens=fleet&cityKey=${encodeURIComponent(city)}`, what: "the Fleet lens" },
    { key: "lens-police", url: `/?lens=police&cityKey=${encodeURIComponent(city)}`, what: "the Police lens" },
  ]) {
    const url = base + pass.url;
    apiBodies = {};
    const started = Date.now();
    const netStart = artifact.network.length;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#app-shell", { timeout: 60000 });

    /**
     * THE WAITS ARE TWO AND BOTH ARE REPORTED. There is no `networkidle` here: on the deployed
     * surface it never fires (export-dev-services-lens.mjs:205-219 measured that), and a quiet wire
     * would be a guess about upstreams this machine does not control.
     *
     * (1) The responses this pass cannot be read without -- a region's own route, the shell's compose
     *     -- and a pass that never saw one says so, rather than reporting the empty surface it would
     *     have rendered if the request was never made.
     * (2) A bounded beat for the CLIENT to paint what arrived. The first draft of this probe had no
     *     second wait: it read the DOM as soon as `#fleet-roster-rows` EXISTED, which shipped markup
     *     satisfies instantly, so it photographed the lens before its own loader answered and reported
     *     "Not read" as though the surface were the cause. A response arriving is not a region
     *     rendering, and a probe that cannot tell those apart measures its own impatience.
     */
    const required = pass.key === "lens-fleet"
      ? [/\/api\/domains\/fleet-vehicles\?/]
      : pass.key === "lens-police"
        ? [/\/api\/domains\/patrol-vehicles\?/, /\/api\/domains\/police-cameras\?/]
        : [/\/api\/lenses\/city-manager\/compose\?/, /\/api\/city-packs/];
    const seen = (re) => artifact.network.some((n) => re.test(n.url));
    const arrived = await poll(async () => required.every(seen), { timeoutMs: pass.key.startsWith("lens-") ? 60000 : 45000 });
    const paintStart = Date.now();
    const painted = await poll(
      async () => {
        if (pass.key === "lens-fleet") return ((await lensFacts(page, "lens-fleet", "fleet")).roster.rows?.length || 0) > 0;
        if (pass.key === "lens-police") return (await page.evaluate(() => document.getElementById("patrol-vehicles-rows")?.children.length || 0)) > 0;
        return page.evaluate(() => Boolean(document.getElementById("map-site")?.getAttribute("data-src")));
      },
      { timeoutMs: 30000 },
    );

    const facts = { key: pass.key, what: pass.what, url: pass.url, shell: await shellFacts(page), mapStage: await mapStageFacts(page) };
    facts.waits = {
      requiredResponses: required.map((r) => String(r)),
      requiredResponsesArrived: arrived.ok,
      requiredResponsesMissing: required.filter((r) => !seen(r)).map((r) => String(r)),
      paintedWithinTheWait: painted.ok,
      paintedWaitMs: Date.now() - paintStart,
    };
    if (pass.key === "lens-fleet") facts.fleet = await lensFacts(page, "lens-fleet", "fleet");
    if (pass.key === "lens-police") facts.police = await policeFacts(page);

    /**
     * The map iframe, read from INSIDE the frame. Same-origin (the page is this product's own
     * /property-map.html), so the frame's DOM is readable -- which is what makes "mounted" and
     * "rendered" two different measurements here rather than one word.
     *
     * THE FRAME IS WAITED FOR, because setting `src` and the frame being IN the frame tree are two
     * events: the first run of this probe read `page.frames()` in the same tick the src appeared and
     * reported "(no frame reached)" about a frame that was there a moment later. A mount measured as
     * a miss is a false finding, which is what the wait is for.
     */
    let frame = null;
    const frameAppeared = await poll(
      async () => {
        frame = page.frames().find((f) => f.url().includes("property-map.html")) || null;
        return frame;
      },
      { timeoutMs: 30000, intervalMs: 200 },
    );
    facts.mapFrameWait = { appeared: Boolean(frame), note: frameAppeared.ok ? null : "no frame whose url names property-map.html joined the frame tree within 30s of the slot being filled" };
    if (frame) {
      /**
       * THE FRAME'S OWN SCRIPT HAS TO HAVE RUN, AND THAT IS A THIRD WAIT.
       *
       * `#pm-map` carries class "pm-map" in the shipped markup and Leaflet adds `leaflet-container`
       * when `L.map()` runs on DOMContentLoaded. The second draft of this probe polled on
       * `mapDivClasses` being truthy -- which "pm-map" satisfies immediately -- so it read the frame
       * at `readyState: "interactive"`, before the page's own script had run, and reported "DID NOT
       * RENDER ... 0 of 0 tiles" about a frame that was still loading. That is the same defect as the
       * first draft's missing paint-wait, one layer down: the instrument reading its own impatience.
       * The condition is now the init itself, or the document being complete, and the wait is recorded.
       */
      const frameStart = Date.now();
      const settle = await poll(
        async () => {
          const f = await mapFrameFacts(frame).catch(() => null);
          if (!f) return null;
          return f.mapDivClasses?.includes("leaflet-container") || f.readyState === "complete" ? f : null;
        },
        { timeoutMs: 30000, intervalMs: 250 },
      );
      facts.mapFrame = settle.value || (await mapFrameFacts(frame).catch((err) => ({ readError: err.message })));
      facts.mapFrameWait.frameSettled = settle.ok;
      facts.mapFrameWait.frameWaitMs = Date.now() - frameStart;
      facts.mapFrameWait.leafletInitialized = Boolean(facts.mapFrame.mapDivClasses?.includes("leaflet-container"));

      /** Drive the page's OWN search, so "rendered" means a real parcel was read, not a canvas painted. */
      if (searchAddress && facts.mapFrame.searchInputPresent) {
        /**
         * FOUR RUNS OF THIS BLOCK, AND EACH ONE TAUGHT IT SOMETHING THE ARTIFACT NOW CARRIES.
         *
         * Run 1 wrapped `fill` and `click` in `.catch(() => {})`: an unreachable field and a search the
         * page never ran produced the same artifact -- nothing. That is the swallow-a-reason shape this
         * program hunts, so from run 2 on, EVERY gesture's outcome is recorded.
         *
         * Runs 2-3 proved the field could not be filled or clicked normally, in either dock mode, and
         * the artifact said so. Run 4 got the field filled with the actionability wait waived and the
         * button then refused as "Element is not visible" -- and the click's failure was the clue. The
         * frame's own body carries `pm-embedded` (web/property-map.js adds it when
         * `window.self !== window.top`) and web/property-map.css hides `.pm-search` and `.pm-status`
         * under that class. The form is `display: none` INSIDE the shell BY DESIGN (G-128: the shell
         * renders property detail from its own route instead). A zero-box control cannot be pointed at,
         * whatever `force` is set to.
         *
         * Run 4's artifact also contained the quieter lie this rewrite removes: the fourth rung reported
         * `ok: true` because `requestSubmit()` did not throw, while NO request from the frame ever hit
         * the wire -- the fill's value had not survived, so the page's own handler read an empty field
         * and returned early. "The gesture returned" is not "the page searched." So the last rung now
         * sets the value and presses the page's OWN submit button in ONE step inside the frame (same
         * events a pointer would produce, minus the geometry that embedded mode makes impossible), and
         * it is believed only when a /api/property-map/summary request arrives FROM THE FRAME. The
         * observations travel with it: `embedded`, `searchFormDisplay`, `searchButtonBox`, and whether
         * the frame's own search ever reached the wire.
         */
        const frameSearches = () =>
          artifact.network.filter((n) => /\/api\/property-map\/summary/.test(n.url) && String(n.frame || "").includes("property-map"));
        const strategies = [];
        const attempt = async (label, fn) => {
          try {
            const value = await fn();
            strategies.push({ strategy: label, ok: true });
            return { ok: true, value };
          } catch (err) {
            strategies.push({ strategy: label, ok: false, error: String(err.message).split("\n")[0] });
            return { ok: false, error: String(err.message).split("\n")[0] };
          }
        };
        const fillAndClick = (force) => async () => {
          await frame.locator("#pm-address-input").fill(searchAddress, { timeout: 8000, ...(force ? { force: true } : {}) });
          await frame.locator("#pm-search-btn").click({ timeout: 8000, ...(force ? { force: true } : {}) });
        };
        const pressThePagesOwnSearchInsideTheFrame = async () => {
          const typed = await frame.evaluate((addr) => {
            const input = document.getElementById("pm-address-input");
            const button = document.getElementById("pm-search-btn");
            if (!input || !button) return "the frame's own search field or button is not in its DOM";
            input.value = addr;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            button.click();
            return null;
          }, searchAddress);
          if (typed) throw new Error(typed);
          const seen = await poll(() => frameSearches().length > 0, { timeoutMs: 20000, intervalMs: 250 });
          if (!seen.ok) throw new Error("the page's own button was pressed but no /api/property-map/summary request came FROM the frame within 20s");
        };
        let driveResult = await attempt("normal fill and click", fillAndClick(false));
        let dockMode = "as mounted";
        if (!driveResult.ok) {
          const switched = await attempt("switch the frame to its Full dock mode", async () => {
            await frame.locator('[data-dock-mode="full"]').click({ timeout: 5000 });
            await poll(async () => (await mapFrameFacts(frame).catch(() => null))?.summary?.sectionPresent, { timeoutMs: 5000 });
          });
          dockMode = switched.ok ? "switched to full" : "no [data-dock-mode=full] control reached in the frame";
          if (switched.ok) driveResult = await attempt("fill and click in Full, with actionability waived", fillAndClick(true));
          if (!driveResult.ok) driveResult = await attempt("type the address and press the page's own Search button in one step inside the frame", pressThePagesOwnSearchInsideTheFrame);
        }
        if (!driveResult.ok) driveResult = { ...driveResult, dockMode };
        facts.mapFrameSearch = {
          address: searchAddress,
          drive: { ...driveResult, dockMode, strategies },
          embedded: facts.mapFrame.embedded ?? null,
          searchFormDisplay: facts.mapFrame.searchFormDisplay ?? null,
          statusDisplay: facts.mapFrame.statusDisplay ?? null,
          searchButtonBox: facts.mapFrame.searchButtonBox ?? null,
          requestsFromTheFrame: frameSearches().map((n) => ({ status: n.status, url: n.url.split("&key=")[0] })),
        };
        if (!driveResult.ok) {
          facts.mapFrameSearch.settled = false;
          facts.mapFrameSearch.settledWhy = "the page's own search was never driven inside the shell";
          facts.mapFrameSearch.after = null;
        } else {
          const before = facts.mapFrame.status;
          const found = await poll(
            async () => {
              const f = await mapFrameFacts(frame).catch(() => null);
              return f && f.status !== before && (f.summary.address !== "—" || /no match|not read|unavailable|enter an address/i.test(f.status || "")) ? f : null;
            },
            { timeoutMs: 40000, intervalMs: 500 },
          );
          facts.mapFrameSearch.settled = found.ok;
          facts.mapFrameSearch.after = found.value ? { status: found.value.status, summary: found.value.summary, valuation: found.value.valuation, layerLabels: found.value.layerLabels, mapDivClasses: found.value.mapDivClasses } : null;
        }
      }
    }

    facts.api = apiDigest();
    facts.requestsFailed = artifact.network.slice(netStart).filter((n) => n.status >= 400).map((n) => `${n.status} ${n.url}`);
    facts.networkErrors = artifact.network.filter((n) => n.status >= 400 && n.frame && n.frame.includes("property-map")).slice(0, 20);
    facts.elapsedMs = Date.now() - started;

    if (shotDir) {
      fs.mkdirSync(shotDir, { recursive: true });
      const file = path.join(shotDir, `${pass.key}.png`);
      await page.screenshot({ path: file, fullPage: false });
      facts.screenshot = file.replace(/\\/g, "/");
    }
    artifact.passes.push(facts);
    console.log(`${pass.key.padEnd(19)} ${pass.url}  city=${facts.shell.shellCityKey ?? "-"}  map=${facts.mapStage.frameSrc ?? "(no frame)"}  failed=${facts.requestsFailed.length} request(s)`);
  }
} finally {
  await browser.close();
}

/**
 * THE OTHER DIRECTION, AND IT NEEDS NO KEY (OPS-17 A-148: "the refusal directions need no key, so
 * prove them anyway: keyless is refused, `bastrop_tx` named anonymously is 401, and an unknown pack
 * is 404"). A 200 from a keyed read means nothing on its own -- the same route has to refuse the
 * same request without the key, refuse a key that is not one, and 404 a pack that does not exist,
 * or the 200 could have been a default. Four plain fetches, no browser, and the key is only ever
 * sent to the host under test.
 */
const refusalCases = [
  { key: "keyless-domain-read", url: `/api/domains/fleet-vehicles?cityKey=${encodeURIComponent(city)}`, header: null, expects: "401 (a tenant-private pack refuses an anonymous read)" },
  { key: "keyless-city-packs", url: "/api/city-packs", header: null, expects: "no caller tenant (an enumeration names no city to a caller who is the subject of none)" },
  { key: "bogus-tenant-key", url: `/api/domains/fleet-vehicles?cityKey=${encodeURIComponent(city)}`, header: "hauska-bogus-not-a-key", expects: "401 (a key that is not one is refused, not defaulted)" },
  { key: "keyed-unknown-pack", url: "/api/domains/fleet-vehicles?cityKey=no_such_city_tx", header: key || null, expects: "404 (an unknown pack is not a city)" },
  { key: "keyless-map-summary", url: `/api/property-map/summary?address=${encodeURIComponent(searchAddress)}&cityKey=${encodeURIComponent(city)}`, header: null, expects: "401 (the map page's own route is tenant-private too)" },
  { key: "keyed-domain-read", url: `/api/domains/fleet-vehicles?cityKey=${encodeURIComponent(city)}`, header: key || null, expects: "200 (the paired control for the three refusals above)" },
];
artifact.refusalDirections = [];
for (const c of refusalCases) {
  const headers = { accept: "application/json" };
  if (c.header) headers["x-hauska-key"] = c.header;
  let status = null;
  let body = null;
  try {
    const res = await fetch(base + c.url, { headers });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (err) {
    body = { fetchError: err.message };
  }
  const digest = body
    ? {
        error: body.error ?? null,
        basis: body.basis ?? null,
        caller: body.caller ?? null,
        status: body.status ?? null,
        recordCount: Array.isArray(body.records) ? body.records.length : null,
        fetchError: body.fetchError ?? null,
      }
    : null;
  artifact.refusalDirections.push({
    key: c.key,
    request: c.url,
    presented: c.header ? (c.header === (key || "") ? "the tenant key" : "a bogus key literal") : "no key",
    expects: c.expects,
    status,
    body: digest,
  });
  console.log(`refusal direction: ${c.key.padEnd(22)} ${String(status).padEnd(4)} ${c.expects}`);
}

/**
 * THE SAME REGIONS, READ DIRECTLY WITH THE KEY, ONCE EACH -- the paired control for the browser half.
 * A lens that renders "Not read" says a route answered that way, and this is where the route's own
 * words are recorded: `status`, `source`, `basis` and the record count. It is also how THIS run
 * records a vendor that answers differently twice: the Police lens's patrol region answered 27 live
 * records on the 19:36 run and `unavailable / platform HTTP 504` on the 19:40 run, and only a
 * reading taken outside the paint path can say which of the two the surface was rendering.
 */
artifact.domainReads = [];
for (const domainId of ["fleet-vehicles", "patrol-vehicles", "police-cameras"]) {
  const url = `/api/domains/${domainId}?cityKey=${encodeURIComponent(city)}`;
  let status = null;
  let body = null;
  try {
    const res = await fetch(base + url, { headers: key ? { accept: "application/json", "x-hauska-key": key } : { accept: "application/json" } });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (err) {
    body = { fetchError: err.message };
  }
  const read = {
    domainId,
    url,
    httpStatus: status,
    status: body?.status ?? null,
    source: body?.source ?? null,
    basis: body?.basis ?? null,
    recordCount: Array.isArray(body?.records) ? body.records.length : null,
    extrasPresent: body?.extras ? Object.keys(body.extras) : null,
    firstRecord: Array.isArray(body?.records) && body.records.length ? body.records[0] : null,
    fetchError: body?.fetchError ?? null,
  };
  artifact.domainReads.push(read);
  console.log(`domain read (keyed): ${domainId.padEnd(17)} http ${status} status=${read.status} records=${read.recordCount} basis=${String(read.basis).slice(0, 60)}`);
}

/**
 * THE SENTENCES, DERIVED FROM WHAT WAS MEASURED, and each one is a statement about THIS run.
 * A reader of the close should not have to re-derive them from the JSON.
 */
const shellPass = artifact.passes.find((p) => p.key === "full-shell-bare") || artifact.passes[0];
const bastropPass = artifact.passes.find((p) => p.key === "full-shell-bastrop") || shellPass;
const fleetPass = artifact.passes.find((p) => p.key === "lens-fleet");
const policePass = artifact.passes.find((p) => p.key === "lens-police");
const frameOf = (p) => p?.mapFrame || null;

artifact.verdicts = {
  authenticatedSession: Boolean(shellPass?.api?.cityPacks?.caller?.tenant === city && shellPass?.shell?.shellCityKey === city),
  bareVisitResolvedToTheCallersTenant: Boolean(shellPass?.shell?.shellCityKey === city && !/cityKey=/.test(shellPass.url)),
  mapIframeMounted: Boolean(bastropPass?.mapStage?.frameDatasetSrc && bastropPass.mapStage.frameSrc && bastropPass.mapStage.frameSrc !== "about:blank"),
  mapIframeRendered: Boolean(frameOf(bastropPass)?.mapDivClasses?.includes("leaflet-container")),
  mapIframeReadAParcel: Boolean(bastropPass?.mapFrameSearch?.after?.summary?.address || bastropPass?.mapFrameSearch?.after?.summary?.parcelId),
  mapFramesOwnSearchReachedTheWire: (bastropPass?.mapFrameSearch?.requestsFromTheFrame || []).length > 0,
  mapPagesAddressControlsHiddenWhenEmbedded: bastropPass?.mapFrameSearch?.embedded === true && bastropPass?.mapFrameSearch?.searchFormDisplay === "none",
  shellReadTheParcelOnItsOwnPath: Boolean(bastropPass?.api?.propertySummary?.body?.found),
  fleetLensReached: Boolean(fleetPass?.fleet?.lensSectionPresent),
  fleetRegionCarriedRecords: Boolean(fleetPass?.fleet?.roster?.rows && fleetPass.fleet.roster.rows.length > 0),
  policeLensReached: Boolean(policePass?.police?.lensVisible),
  patrolRegionCarriedRecords: Boolean(policePass?.police?.patrol?.rows && policePass.police.patrol.rows.length > 0),
};

artifact.pageErrors = pageErrors;
artifact.statements = [
  `The full shell was read on ${base} (${mode}) with the tenant key presented from the environment; the bare visit (no cityKey in the address) resolved to ${shellPass?.shell?.shellCityKey ?? "no city"}, and /api/city-packs answered caller.tenant=${shellPass?.api?.cityPacks?.caller?.tenant ?? "?"}.`,
  `THE MAP IFRAME ${artifact.verdicts.mapIframeMounted ? "MOUNTED" : "DID NOT MOUNT"} on the full-shell pass: #map-site src=${bastropPass?.mapStage?.frameSrc ?? "(none)"} (data-src=${bastropPass?.mapStage?.frameDatasetSrc ?? "(none)"}), stage hidden=${bastropPass?.mapStage?.stageHidden}, frame box ${JSON.stringify(bastropPass?.mapStage?.frameBox)}.`,
  `AND IT ${artifact.verdicts.mapIframeRendered ? "RENDERED" : "DID NOT RENDER"}: inside the frame, url=${frameOf(bastropPass)?.url ?? "(no frame reached)"}, #pm-map class="${frameOf(bastropPass)?.mapDivClasses ?? ""}", ${frameOf(bastropPass)?.loadedTiles ?? "?"} of ${frameOf(bastropPass)?.tileImages ?? "?"} tile images loaded, layer categories=${frameOf(bastropPass)?.layerCategories ?? "?"}, layers status="${frameOf(bastropPass)?.layersStatus ?? ""}".`,
  `The page's own address search for "${searchAddress}" ${bastropPass?.mapFrameSearch?.settled ? "settled" : "did not settle"} inside the frame: status="${bastropPass?.mapFrameSearch?.after?.status ?? ""}", address="${bastropPass?.mapFrameSearch?.after?.summary?.address ?? ""}", parcel="${bastropPass?.mapFrameSearch?.after?.summary?.parcelId ?? ""}", zoning="${bastropPass?.mapFrameSearch?.after?.summary?.zoning ?? ""}", and ${(() => {
    const fromFrame = bastropPass?.mapFrameSearch?.requestsFromTheFrame || [];
    return fromFrame.length
      ? `pressing the page's own Search button inside the frame DID reach the wire: ${fromFrame.length} /api/property-map/summary request(s) came FROM the frame (${fromFrame.map((r) => `http ${r.status}`).join(", ")})`
      : "no /api/property-map/summary request ever came FROM the frame";
  })()}. drive=${JSON.stringify(bastropPass?.mapFrameSearch?.drive ?? null)}.`,
  `WHAT THE FRAME DOES NOT DO INSIDE THE SHELL, AND WHY THE PROBE HAD TO DRIVE IT BY EVENT: web/property-map.js adds \`pm-embedded\` to the frame's own <body> when \`window.self !== window.top\` (read here as embedded=${bastropPass?.mapFrameSearch?.embedded}), and web/property-map.css hides that page's own search form and status line under it (computed display: search form = ${bastropPass?.mapFrameSearch?.searchFormDisplay}, status line = ${bastropPass?.mapFrameSearch?.statusDisplay}); the frame's own search button measures ${JSON.stringify(bastropPass?.mapFrameSearch?.searchButtonBox)}. So inside the shell the map page's address controls are not offered to a pointer at all -- by the page's own embedded rule, and the shell renders property detail from its own route instead (G-128). The probe reached the page's own search only by firing the page's own control events inside the frame, which is what the last strategy in the ladder records, and every rung that failed is in the artifact with its own error rather than swallowed.`,
  `THE SHELL'S OWN PROPERTY PATH, READ ALONGSIDE IT: the shell itself fetched the same route for its dock (web/app.js loadPropertyDock, G-128) -- /api/property-map/summary?address=${encodeURIComponent(searchAddress)}&cityKey=${city} answered status="${bastropPass?.api?.propertySummary?.body?.status ?? ""}" found=${bastropPass?.api?.propertySummary?.body?.found ?? "?"} basis="${bastropPass?.api?.propertySummary?.body?.basis ?? ""}"${bastropPass?.api?.propertySummary?.body?.snapshot ? `, parcel ${bastropPass.api.propertySummary.body.snapshot.parcelId} on ${bastropPass.api.propertySummary.body.snapshot.futureLandUse ?? "an unstated future land use"}` : ""}. That request came from the TOP frame, not from the mounted map.`,
  `THE MAP'S OWN DATA PATH ANSWERED INSIDE THE SESSION: ${(() => {
    const own = artifact.network.filter((n) => /\/api\/property-map\/(summary|layers)/.test(n.url));
    const byFrame = own.filter((n) => String(n.frame || "").includes("property-map"));
    const bad = own.filter((n) => n.status !== 200);
    return `${own.length} response(s) on /api/property-map/(summary|layers), ${byFrame.length} of them made FROM the mounted frame, ${bad.length} not 200${bad.length ? " (" + bad.map((n) => `${n.status} ${n.url.slice(0, 60)}`).join("; ") + ")" : ""}`;
  })()}.`,
  `The Fleet lens ${fleetPass?.fleet?.lensVisible ? "was reached" : "was NOT reached"} (chip "${fleetPass?.fleet?.stateChip ?? ""}", rule "${fleetPass?.fleet?.regionRule ?? ""}") with ${fleetPass?.fleet?.roster?.rows?.length ?? "?"} roster row(s) painted and ${fleetPass?.api?.fleetVehicles?.recordCount ?? "?"} record(s) on /api/domains/fleet-vehicles.`,
  `The Police lens ${policePass?.police?.lensVisible ? "was reached" : "was NOT reached"} (chip "${policePass?.police?.stateChip ?? ""}", rule "${policePass?.police?.regionRule ?? ""}") with ${policePass?.police?.patrol?.rows?.length ?? "?"} patrol row(s) painted and ${policePass?.api?.patrolVehicles?.recordCount ?? "?"} record(s) on /api/domains/patrol-vehicles.`,
];

/**
 * NOTHING THAT CARRIES THE KEY IS WRITTEN. Same discipline as surface-probe.mjs's token refusal:
 * if the key would reach the artifact, nothing is written and the exit is non-zero.
 */
const text = JSON.stringify(artifact, null, 2);
if (key && text.includes(key)) {
  console.error("REFUSED: the artifact would contain the tenant key; nothing was written.");
  process.exit(2);
}
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, text);
console.log(`\nartifact: ${outPath.replace(/\\/g, "/")}`);
for (const s of artifact.statements) console.log(`- ${s}`);
