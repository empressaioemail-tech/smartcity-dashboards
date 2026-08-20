/**
 * ---------------------------------------------------------------------------
 * G-95. THE ACCESSIBILITY GATE.
 *
 * Runs axe through a real Chromium against every surface this product serves,
 * and FAILS THE BUILD at any WCAG A or AA violation. It also answers the two
 * questions axe cannot: whether every surface has its own title (2.4.2), and
 * whether every keyboard-reachable element paints a focus indicator (2.4.7).
 *
 * WHY IT IS A SEPARATE SCRIPT AND NOT A src/*.test.mjs.
 * `npm test` is `node --test src/*.test.mjs` on a bare Node image, and this
 * repo has already ruled twice - src/hidden-rule.test.mjs and
 * src/first-paint.test.mjs both say it in their own headers - that a check
 * which quietly skips when Chrome is absent is a control that never fires. So
 * the browser check does not live in that suite pretending to be optional. It
 * lives here, it is a REQUIRED CI job of its own (.github/workflows/ci.yml,
 * job `a11y`), and if the browser is missing it EXITS 2 AND SAYS SO. There is
 * no skip path in this file. `node --test` would report a skipped test as a
 * pass; this reports it as a failure, which is the whole difference.
 *
 * WHAT SURVIVES A FRESH CLONE (DEV_PROCESS 6.1).
 *   - axe comes from the `axe-core` devDependency, not from a path on one
 *     machine. A scanner reading P:/tmp/VPAT/axe.min.js is a guardrail that
 *     does not survive a clone.
 *   - The browser comes from `playwright-core` plus an explicit
 *     `playwright-core install chromium` in the CI job. playwright-core is used
 *     rather than playwright precisely because it does NOT download a browser
 *     on npm install, so `npm ci` for the ordinary test job stays cheap and the
 *     browser is fetched only by the job that needs it.
 *   - The server under test is THIS repo's own src/server.mjs, started
 *     in-process on an ephemeral port. Nothing is deployed, no port is
 *     hardcoded, and the process exits: EXIT-BOUNDED, per the contract.
 *
 * WHAT IS DERIVED RATHER THAN LISTED.
 * The surface list is built from the id sets src/staff-review.mjs exports and
 * the packs src/city-pack.mjs exports; the theme list is src/theme.mjs THEMES.
 * A lens or a theme added in a later wave is scanned without anyone remembering
 * to add it here, which is the only version of this control that is worth
 * having (DEV_PROCESS rule 0).
 *
 * BOTH THEMES, AND THE LEVER IS PROVEN TO MOVE (G-94 correction, 2026-08-19).
 * This scanner's first version ran a default browser context, which means an
 * empty localStorage, which means the head script fell to FALLBACK_THEME and
 * every scan was DARK. Its numbers were right and its coverage was half. The
 * sibling lane hit the same wall from the other side: emulating
 * prefers-color-scheme does not move this product at all, because
 * web/index.html ships data-theme="dark" statically on <html> and an explicit
 * attribute beats the media query - so a colorScheme-emulating scan reports an
 * identical figure for both "themes" and looks like coverage.
 *
 * The lever here is localStorage, seeded through addInitScript so it is set
 * before the head script reads it. Two guards, because "the theme was requested"
 * and "the theme landed" are different claims and a green build cannot tell
 * "light is clean" from "light was never scanned":
 *   1. every scan asserts document.documentElement's data-theme is the one it
 *      asked for, and a scan where it is not is recorded as FAILED, which fails
 *      the build;
 *   2. the run asserts the two themes actually PAINT differently - the body
 *      background is recorded per scan and the gate fails if every surface
 *      renders both themes identically. That is the divergence test for the
 *      lever itself, and it is what makes "both themes were scanned" a measured
 *      claim rather than a described one.
 *
 * TWO VIEWPORTS, AND THE BOUND IS DECLARED (G-99). axe does not report less
 * outside the viewport - it does not EVALUATE outside it, and an element it does
 * not evaluate lands in no bucket at all, not even the incomplete one. Measured
 * on one surface with height as the only variable, the whole color-contrast
 * population (passes + violations + incomplete) was 143 nodes at 1440x900, 182
 * at 1200, 213 at 1600 and 234 at 2400, matching the in-viewport element count
 * exactly at every height. So G-95's "0 conformance nodes over 46 scans" covered
 * 72.5% of the product's rendered text and the other 27.5% held five real AA
 * failures. Every surface is now scanned twice from ONE page load: at the
 * reference viewport a person reads at, and at a viewport GROWN until nothing is
 * left outside the clipping box. Both figures are reported, neither is merged
 * into the other, and the coverage ratio is printed beside the node count.
 *
 * THE ENVIRONMENT IS PART OF THE CONTRACT (G-99). The same commit produced 0
 * unresolved nodes on Windows with the remote webfont blocked and 88 with it
 * allowed, and 2 on a Linux CI runner. The cause is font metrics: the real Inter
 * face renders 9.35% wider, which wraps the sticky nav footer to one more line,
 * which slides a nav item's edge across a footer figure, and axe will not
 * composite a background through a partial overlap. So this scanner records a
 * TYPEFACE witness and a GEOMETRY witness on every run, refuses a run whose
 * typeface did not land, and DECLARES which environment is the figure of record -
 * printing an INDICATIVE banner, top and bottom, on any run that is not.
 *
 * COUNTING RULES, stated here because this is where the numbers are read:
 *   SURFACE      one URL this product serves. A lens, a lens+tab, a work view,
 *                a work view+tab, or a pack chosen by cityKey.
 *   SCAN         one surface under one THEME at one VIEWPORT. Both themes and
 *                both viewports are scanned, so the denominator is
 *                surfaces x themes x viewports and every node count below is
 *                summed over that, never over surfaces alone.
 *   ARM          one theme at one viewport. Every ceiling in the ledgers is
 *                pinned per arm, so a full-extent regression cannot hide behind
 *                a reference improvement any more than a dark one can hide
 *                behind a light one.
 *   VIOLATION    one axe rule failing on at least one scan.
 *   NODES        the sum of failing DOM elements across all scans. One element
 *                failing on ten scans counts ten.
 *   CONFORMANCE  a rule carrying wcag2a / wcag2aa / wcag21a / wcag21aa. Anything
 *                else is best-practice and is NOT a conformance failure, though
 *                it is still reported.
 *   RENDERED     an element carrying its own non-empty text node, with at least
 *                one client rect, whose computed visibility is not hidden. This
 *                is the coverage DENOMINATOR.
 *   IN-VIEWPORT  a rendered element whose bounding box intersects the viewport
 *                box. This is the coverage NUMERATOR, and it is what axe
 *                evaluates.
 *   FOCUSABLE    an element reached by pressing Tab from the top of the
 *                document, up to a bounded number of presses, AT THE REFERENCE
 *                VIEWPORT - the tab ring and a computed focus style are both
 *                independent of window height, so the walk is not repeated.
 * ---------------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { server } from "../src/server.mjs";
import { A11Y_TARGETS, expectedTitle, PRODUCT_TITLE } from "../src/a11y-surfaces.mjs";
import { THEMES, THEME_STORAGE_KEY } from "../src/theme.mjs";
import {
  AUTHORITATIVE,
  CONFORMANCE_TAGS,
  DECORATIVE_EXEMPTIONS,
  FULL_EXTENT_VIEWPORT,
  GATED_BEST_PRACTICE,
  REFERENCE_VIEWPORT,
  REVIEW_ITEMS,
  VIEWPORTS,
  VIEWPORT_IDS,
  WAIVERS,
  armId,
  authorityOf,
  isSubjectBounded,
  summarize,
  verdict,
  waivedTotal,
  waiverFor,
} from "../src/a11y-gate.mjs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The elements every adjudication in the ledger makes a claim about, DERIVED
 * from the ledger rather than restated here. An adjudication says a pair reads
 * acceptably; the scanner recomputes exactly those pairs on every run so the
 * verdict can refuse the entry when the measurement contradicts it. Restating
 * the list would be two implementations of one rule, which is the CTRL-1 shape.
 */
const ADJUDICATED_SUBJECTS = [...new Set(REVIEW_ITEMS.flatMap((r) => r.subjects || []))];

/**
 * The selectors the decorative ledger declares, DERIVED from the ledger for the
 * same reason the adjudicated subjects are: restating them here would be two
 * implementations of one rule, which is the CTRL-1 shape DEV_PROCESS 2.4 names.
 */
const DECLARED_DECORATIVE_SELECTORS = DECORATIVE_EXEMPTIONS.map((d) => d.selector);

export const PLANTS = {
  "scrollable-region-focusable": {
    what: "the fix removed: the scroll containers lose their keyboard path back",
    /**
     * This plant REMOVES THE FIX rather than inventing a defect, and the first
     * version taught the difference. A synthetic div with overflow-y:scroll and
     * a 428px child in a 40px box came back INAPPLICABLE from axe 4.13 - the
     * rule's matcher never even considered it - so the plant reported "gate
     * PASSED, WHICH IS THE BUG" while the gate was working perfectly and the
     * plant was the broken half. Stripping tabindex off the real .colstack and
     * .cz-scroll elements reproduces the exact four-node finding the pre-fix
     * baseline measured, on the exact elements it measured them on, which is
     * the only plant worth trusting.
     */
    apply: () => {
      for (const el of document.querySelectorAll("[tabindex='0']")) el.removeAttribute("tabindex");
    },
  },
  "heading-order": {
    what: "a heading level skipped inside the visible surface",
    apply: () => {
      const h = document.createElement("h5");
      h.textContent = "planted skipped heading";
      h.setAttribute("style", "color:#000;background:#fff");
      /**
       * Into the page header of the VISIBLE surface, immediately after its h1,
       * so the skip is real and the element is genuinely rendered. Appending to
       * <main> put it past the end of a shell that is overflow:hidden, where axe
       * correctly treats it as not visible and the plant proved nothing.
       */
      const lens = [...document.querySelectorAll(".lens")].find(
        (el) => getComputedStyle(el).display !== "none",
      );
      (lens?.querySelector(".pagehead") || lens || document.body).appendChild(h);
    },
  },
  "color-contrast": {
    what: "text below the AA contrast ratio",
    apply: () => {
      const p = document.createElement("p");
      p.setAttribute("style", `${window.__plantChrome}color:#8a8a8a;background:#909090;font-size:14px`);
      p.textContent = "planted low contrast text";
      document.body.appendChild(p);
    },
  },
  "image-alt": {
    what: "an image with no text alternative",
    apply: () => {
      const img = document.createElement("img");
      img.src =
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      img.setAttribute("style", `${window.__plantChrome}width:40px;height:40px`);
      document.body.appendChild(img);
    },
  },
  "button-name": {
    what: "a control with no accessible name",
    apply: () => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("style", `${window.__plantChrome}width:40px;height:40px`);
      document.body.appendChild(b);
    },
  },
  "page-title": {
    what: "every surface sharing one document title, which is the defect this card fixed",
    apply: () => {
      document.title = "SmartCity Dashboards";
    },
  },
  "unresolved-contrast": {
    what: "a translucent overlay, so axe can no longer resolve any background",
    /**
     * The plant for the class the FIRST CI RUN found: axe returning nothing for
     * color-contrast, not because the product passed but because it could not
     * settle the check. A run that reads zero because it could not measure is
     * the quietest failure this gate can have, so it gets a plant of its own.
     */
    apply: () => {
      const d = document.createElement("div");
      d.setAttribute("style", "position:fixed;inset:0;z-index:99998;background:rgba(120,120,120,0.35)");
      document.body.appendChild(d);
    },
  },
  "focus-indicator": {
    what: "a focusable control that paints no focus indicator",
    apply: () => {
      const style = document.createElement("style");
      style.textContent = ":focus-visible { outline: none !important; box-shadow: none !important; }";
      document.head.appendChild(style);
    },
  },
  /**
   * ---------------------------------------------------------------------------
   * G-99's plants. Each one refuses a class this scanner did not have before,
   * and the first is the whole row: a defect that the reference viewport cannot
   * see and the full-extent viewport must.
   * ---------------------------------------------------------------------------
   */
  "below-the-fold-contrast": {
    what: "low-contrast text placed BELOW the reference fold, which the old single-viewport gate could not see at all",
    /**
     * DELIBERATELY NOT position:fixed, which is the opposite of every plant
     * above. Those are pinned into view because the shell does not scroll and an
     * unseen node proves nothing; this one has to be genuinely out of the
     * reference viewport or it does not test what it claims to. It is placed at
     * a document position past 900px and inside no overflow-hidden box smaller
     * than the shell, so at the reference viewport axe's matcher drops it before
     * the check runs, and at full extent the growth loop reaches it because the
     * coverage probe counts it as outside.
     */
    apply: () => {
      const p = document.createElement("p");
      p.setAttribute(
        "style",
        "position:absolute;left:24px;top:1400px;z-index:99999;color:#8a8a8a;background:#909090;font-size:14px;padding:4px",
      );
      p.textContent = "planted low contrast text below the fold";
      document.body.appendChild(p);
    },
  },
  "viewport-growth-changed-the-page": {
    what: "a finding that DISAPPEARS when the viewport grows, which would mean growing it altered the layout instead of revealing it",
    /**
     * The plant for the divergence test on the technique itself. Growing the
     * viewport is only a legitimate instrument if it reveals; if a finding can
     * vanish, every full-extent number in the run is suspect. This plants an
     * element whose contrast is a function of window height, which is exactly
     * the shape that would break the assumption, and the gate must refuse it.
     */
    apply: () => {
      const style = document.createElement("style");
      style.textContent =
        ".k2-height-dependent { color: #8a8a8a; background: #909090; }" +
        "@media (min-height: 1000px) { .k2-height-dependent { color: #000000; background: #ffffff; } }";
      document.head.appendChild(style);
      const p = document.createElement("p");
      p.className = "k2-height-dependent";
      p.setAttribute("style", `${window.__plantChrome}font-size:14px;padding:4px`);
      p.textContent = "planted height dependent contrast";
      document.body.appendChild(p);
    },
  },
  "unreachable-extent": {
    what: "content past the growth cap, so the full-extent scan cannot actually reach full extent and must say so rather than reporting a clean figure",
    apply: () => {
      const p = document.createElement("p");
      p.setAttribute("style", "position:absolute;left:24px;top:99000px;color:#111;background:#fff;font-size:14px");
      p.textContent = "planted content past the growth cap";
      document.body.appendChild(p);
    },
  },
  "punctuation-contrast": {
    what: "a low-contrast punctuation glyph, which axe excludes from color-contrast by design and therefore reports in NO bucket at all",
    /**
     * The plant for the class the SECOND instrument exists for, and it is
     * planted as the real thing rather than as a synthetic: a span whose only
     * text is punctuation, at a ratio no one could read. axe returns nothing for
     * it - measured by bisect on a live element, "|" NOT EVALUATED against "XY"
     * VIOLATION with the character as the only variable - so a gate built on axe
     * alone reports this page clean. If the independent sweep is ever removed or
     * narrowed past this class, this plant reports the gate passing and says so.
     */
    apply: () => {
      const p = document.createElement("p");
      p.className = "sep";
      p.setAttribute("style", `${window.__plantChrome}color:#8a8a8a;background:#909090;font-size:13px;padding:2px`);
      p.textContent = "|";
      document.body.appendChild(p);
    },
  },
  "adjudication-refuted": {
    what: "an adjudicated element repainted below its threshold, so the ledger's recorded basis is contradicted by the run's own measurement",
    /**
     * An adjudication says "axe could not settle this, but a human read it and
     * it reads acceptably" - which is a claim about a ratio that nothing used to
     * check. This repaints the adjudicated subjects to an unreadable pair and
     * leaves the ledger untouched; the gate must refuse its own entry rather
     * than keep believing it.
     */
    apply: () => {
      const style = document.createElement("style");
      style.textContent = "#nav-demonstrated, #nav-sources-rule { color: #8a8a8a !important; background: #909090 !important; }";
      document.head.appendChild(style);
    },
  },
  "unexamined-text": {
    what: "rendered text that NO instrument judges and no exemption covers, which is the population a 100% coverage figure was counting as covered",
    /**
     * G-101. THE PLANT FOR THE CLASS THE COVERAGE NUMBER WAS STANDING IN FOR.
     *
     * It has to be invisible to BOTH instruments at once, which is a narrow
     * target and is exactly why the class existed unnamed for two waves. So it is
     * planted as the real thing rather than as a synthetic: punctuation-only
     * text, which axe excludes by design (axe.js:28714), carrying a class that
     * matches NONE of the declared contrast groups, so the second instrument
     * never sweeps it either. Not aria-hidden and not disabled, so no exemption
     * covers it.
     *
     * The product's own breadcrumb divider was precisely this - a bare
     * `<span>/</span>` with no class - and nothing in the gate could see it. It
     * happened to be legible. The next one might not be, and this is what makes
     * that a measurement rather than luck.
     */
    apply: () => {
      const p = document.createElement("p");
      p.className = "l1-unswept-glyph";
      p.setAttribute("style", `${window.__plantChrome}color:#8a8a8a;background:#909090;font-size:13px;padding:2px`);
      p.textContent = "/";
      document.body.appendChild(p);
    },
  },
  "undeclared-decorative": {
    what: "text hidden from the accessibility tree with no entry in the decorative ledger, which is how a contrast finding gets quieted by making the text disappear",
    /**
     * G-101. The other half of the two-way decorative contract.
     *
     * aria-hidden="true" removes text from the accessibility tree, from 1.4.3's
     * scope and from the second instrument's computed population in one move. It
     * is the strongest instrument-silencing attribute in this product, and
     * without this plant the only thing standing between a real defect and a
     * green build is whether anyone thought to look at the diff.
     *
     * This hides a run of real text at an unreadable pair and declares nothing.
     * The gate must refuse it BECAUSE it is undeclared, not because of its
     * colour - which is why the text is ordinary rather than punctuation.
     */
    apply: () => {
      const p = document.createElement("p");
      p.className = "l1-quietly-hidden";
      p.setAttribute("aria-hidden", "true");
      p.setAttribute("style", `${window.__plantChrome}color:#8a8a8a;background:#909090;font-size:13px;padding:2px`);
      p.textContent = "Findings quietly removed from the accessibility tree";
      document.body.appendChild(p);
    },
  },
  "typeface-fallback": {
    what: "the shipped typeface not rendering, which silently changes every wrap point and therefore every overlap axe judges",
    /**
     * document.fonts.check("14px Inter") returns TRUE whether or not the face
     * loaded, because the fallback can render the string - measured, in both
     * arms. So the landing test is an advance-width comparison and this plant
     * moves exactly that: it repoints the product's own token at a generic
     * family, so the stack and the named face stop measuring alike.
     */
    apply: () => {
      const style = document.createElement("style");
      style.textContent = ":root { --sc-font-ui: sans-serif !important; --sc-font-data: monospace !important; }";
      document.head.appendChild(style);
    },
  },
};

/**
 * Why every planted node is position:fixed.
 *
 * The shell is height:100% with overflow:hidden, so a node appended to <body>
 * lands past the bottom of a container that does not scroll - rendered, but not
 * visible - and axe correctly declines to judge what a person cannot see. The
 * first three plants therefore reported "gate PASSED, WHICH IS THE BUG" while
 * the gate was working perfectly and the PLANTS were the broken half. That is
 * the firing test earning its place: it found a defect in itself before anyone
 * trusted it (DEV_PROCESS 2.2).
 */
const PLANT_CHROME = "position:fixed;top:0;left:0;z-index:99999;";

/**
 * The floor a scan must clear to count as having measured anything. See
 * visibleTextNodes above for the counting rule and the plant that bought it.
 */
export const VISIBLE_TEXT_FLOOR = 10;

/* ------------------------------------------------------------------ inputs */

function parseArgs(argv) {
  const out = { json: "", plant: "", quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = argv[++i] || "";
    else if (a === "--plant") out.plant = argv[++i] || "";
    else if (a === "--quiet") out.quiet = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (out.plant && !PLANTS[out.plant]) {
    throw new Error(`--plant ${out.plant} is not one of: ${Object.keys(PLANTS).join(", ")}`);
  }
  return out;
}

/**
 * The axe source, resolved through node so it comes from the pinned
 * devDependency and the version is reportable.
 */
function axeSource() {
  const pkg = require("axe-core/package.json");
  const file = require.resolve("axe-core/axe.min.js");
  return { version: pkg.version, source: fs.readFileSync(file, "utf8") };
}

/**
 * The browser. A missing browser is a HARD FAILURE with an instruction, never a
 * skip: a gate that passes because it could not run is worse than no gate.
 */
async function launchChromium() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (err) {
    fail(
      `playwright-core did not load (${err.message}). Run: npm ci`,
    );
  }
  try {
    return await chromium.launch();
  } catch (err) {
    fail(
      [
        "Chromium did not launch, so the accessibility gate DID NOT RUN.",
        "This is a failure, not a skip. Install the browser and run again:",
        "  npx playwright-core install --with-deps chromium",
        `underlying error: ${err.message}`,
      ].join("\n"),
    );
  }
}

function fail(message) {
  process.stderr.write(`a11y-scan: ${message}\n`);
  process.exit(2);
}

/* ------------------------------------------------------------- measurement */

/**
 * THE KEYBOARD WALK, driven from NODE because Tab cannot be synthesised inside
 * the page - a script-dispatched KeyboardEvent does not move focus.
 *
 * WHAT COUNTS AS AN INDICATOR: a non-none outline of non-zero width, or a
 * box-shadow, read from getComputedStyle while the element is genuinely
 * keyboard-focused. :focus-visible is a live match, so reading the stylesheet
 * could not tell whether the rule actually reached the element; this can.
 *
 * IDENTITY IS TRACKED BY NODE, NOT BY SELECTOR. The first draft de-duplicated
 * stops by a CSS path string, and the fifteen nav links share one path because
 * none of them carries an id - so the walk saw a repeat on the second nav item
 * and stopped after five stops on every surface, reporting zero findings. A
 * truncated walk reads exactly like a clean one.
 *
 * CROSS-ORIGIN MOUNTS ARE A BOUNDARY, NOT A FINDING, and that distinction was
 * bought by getting it wrong. When focus enters a mounted product,
 * document.activeElement in the host is the iframe, and the second draft scored
 * that as a focus stop painting no indicator - 23 findings, one per surface.
 * Measured: with document.activeElement === #map-site, the frame reports
 * matches(":focus") false and matches(":focus-visible") false, because the
 * element actually carrying focus lives in the mounted document and this
 * instrument cannot read across the origin. So the crossing is reported by name
 * as an UNMEASURED region - the mounted product answers for its own indicator -
 * and it is never scored clean either.
 *
 * IN PASSES, so the tail is measured rather than assumed empty. A crossing ends
 * a pass; the frame is then taken out of the tab order and the walk runs again
 * from the top, skipping what it has already seen. At most one pass per mount.
 *
 * WHAT IT STILL CANNOT DO, stated where its output is read: it does not judge
 * the indicator's CONTRAST against its background (1.4.11), it does not verify
 * that focus can be tabbed back OUT of a mount (2.1.2), and it walks one
 * viewport.
 */
async function tabWalk(page, limit = 400) {
  const stops = [];
  const notes = [];
  const crossings = [];
  await page.evaluate(() => {
    window.__a11yWalk = { seen: new WeakSet(), pass: null, prev: null };
  });
  for (let pass = 0; pass < 6; pass++) {
    await page.evaluate(() => {
      const body = document.body;
      window.__a11yWalk.prev = null;
      /**
       * A FRESH per-pass set, and the global `seen` set is only what stops a
       * stop being RECORDED twice. Using one set for both ended pass two on its
       * first element - already seen, from pass one - so everything after the
       * first mount was never walked while the run reported no early ending at
       * all. The two questions are "have I looped" and "have I recorded this",
       * and they need two sets.
       */
      window.__a11yWalk.pass = new WeakSet();
      if (!body) return;
      body.setAttribute("tabindex", "-1");
      body.focus();
      body.removeAttribute("tabindex");
    });
    let crossed = null;
    let pressed = 0;
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press("Tab");
      pressed += 1;
      const stop = await page.evaluate(() => {
        const w = window.__a11yWalk;
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) {
          return { end: "left the document" };
        }
        if (el.tagName === "IFRAME") {
          /**
           * Focus has crossed into another document. Reported, then the frame is
           * taken out of the tab order so the next pass reaches what follows it.
           * Never scored as a stop, because the element carrying focus is not
           * this one.
           */
          const id = el.id || el.getAttribute("title") || "unnamed frame";
          const src = el.getAttribute("src") || "";
          el.setAttribute("tabindex", "-1");
          return { crossed: { id, src } };
        }
        if (el === w.prev) return { end: "focus stopped moving without leaving the document" };
        w.prev = el;
        if (w.pass.has(el)) return { end: "tab ring complete" };
        w.pass.add(el);
        if (w.seen.has(el)) return { seenBefore: true };
        w.seen.add(el);
        const cs = getComputedStyle(el);
        const outlineWidth = parseFloat(cs.outlineWidth) || 0;
        const hasOutline = cs.outlineStyle !== "none" && outlineWidth > 0;
        const hasShadow = Boolean(cs.boxShadow) && cs.boxShadow !== "none";
        const path = [];
        let node = el;
        while (node && node.nodeType === 1 && path.length < 5) {
          path.push(
            node.id
              ? "#" + node.id
              : node.tagName.toLowerCase() +
                (node.className && typeof node.className === "string" && node.className.trim()
                  ? "." + node.className.trim().split(/\s+/).join(".")
                  : ""),
          );
          node = node.parentElement;
        }
        return {
          selector: path.reverse().join(" > "),
          tag: el.tagName.toLowerCase(),
          name: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50),
          matchesFocusVisible: (() => {
            try {
              return el.matches(":focus-visible");
            } catch {
              return null;
            }
          })(),
          outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor,
          boxShadow: cs.boxShadow,
          indicator: Boolean(hasOutline || hasShadow),
        };
      });
      if (stop.crossed) {
        crossed = stop.crossed;
        break;
      }
      if (stop.end) {
        if (stop.end !== "tab ring complete" && stop.end !== "left the document") notes.push(stop.end);
        crossed = null;
        break;
      }
      if (stop.seenBefore) continue;
      stops.push(stop);
    }
    if (pressed >= limit) notes.push("walk hit its " + limit + "-press bound before the ring closed");
    if (!crossed) break;
    crossings.push(crossed);
  }
  return { stops, notes, crossings };
}

/**
 * WHY networkidle, and it is a deliberate choice rather than a default.
 *
 * The pre-fix baseline this card is measured against was taken with the same
 * wait against the deployed surface, and changing it would have made the before
 * and after figures incomparable - the reconciliation that proved this scanner
 * agrees with that baseline exactly (54 / 11 / 4 over the same sixteen
 * surfaces) depends on the two instruments waiting alike. It also means the
 * scan reads the surface a person reads: the title, the pack identity and the
 * mounts have all resolved.
 *
 * The cost is one external dependency, so the goto is retried ONCE and a
 * surface that still does not load is recorded as FAILED and fails the build.
 * It is never quietly dropped: an unmeasured surface is not a clean one.
 */
/**
 * ONE ATTEMPT. Wrapped by scanSurface, which retries it once, because a scan
 * that did not paint is an UNMEASURED scan and must never be scored clean.
 *
 * This retry is not defensive decoration. On the first two-theme run, exactly
 * one scan of 46 - work-connections under dark, the heaviest document in the
 * product - came back with a transparent body background, which is what a page
 * looks like when its stylesheet request never landed. It reported ZERO
 * contrast nodes, because unstyled text cannot fail a contrast rule, and twenty
 * focus stops with no indicator, because the :focus-visible rule was not there.
 * A gate reading only the contrast number would have recorded that scan as its
 * cleanest of the run. The paint assertion below is what turned it into a
 * failure instead.
 */
/**
 * ---------------------------------------------------------------------------
 * THE COVERAGE PROBE. G-99, and it is the denominator every node count in this
 * file is quoted against.
 *
 * RENDERED counts an element carrying its OWN non-empty text node, with at
 * least one client rect, whose computed visibility is not hidden. IN-VIEWPORT
 * counts a rendered element whose bounding box intersects the viewport box.
 * OVERFLOW-BELOW is how much further the viewport would have to reach to hold
 * everything, taken as the larger of the deepest element bottom past the fold
 * and the deepest hidden scroll extent.
 *
 * Both halves are needed and the second one is not decoration: on the
 * work-connections surface at 1440x3000 every scroll-extent probe reported ZERO
 * hidden pixels while 96 of 283 rendered elements were still outside the box,
 * because that content sits in an overflow:HIDDEN container rather than a
 * scrollable one. A growth loop driven by scroll extents alone would have
 * stopped there and certified the surface as fully covered.
 * ---------------------------------------------------------------------------
 */
const COVERAGE_PROBE = () => {
  const inView = (r) =>
    !(r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) &&
    r.width > 0 &&
    r.height > 0;
  const overlaps = (a, b) => !(a.left >= b.right || a.right <= b.left || a.top >= b.bottom || a.bottom <= b.top);
  /**
   * AXE'S OWN CANDIDATE RULE, reimplemented beside the viewport rule so the two
   * are measured over ONE population in ONE instant rather than argued about.
   *
   * colorContrastMatches (node_modules/axe-core/axe.js:28619, axe-core 4.13.0)
   * ends by requiring a text rect to overlap the box of EVERY overflow-hidden
   * ancestor, not merely the viewport - so an element inside a clipped panel can
   * be inside the window and outside axe's evaluation set at the same time. That
   * was the standing hypothesis for a five-node disagreement between two
   * machines, and measuring it is what retired it: on this product the two rules
   * diverge by 2 elements of 6,198 at the reference viewport and by 0 at full
   * extent. It is measured on EVERY run rather than settled once, because "the
   * two rules agree here" is a property of this markup and the next fixed-height
   * panel can break it silently.
   */
  const clippingAncestors = (el) => {
    const out = [];
    let n = el.parentElement;
    while (n) {
      const cs = getComputedStyle(n);
      if (/hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflowY)) out.push(n);
      n = n.parentElement;
    }
    return out;
  };
  const rendered = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,b,strong,em,a,button,td,th,li,label,caption,dt,dd")].filter(
    (el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== "hidden",
  );
  let deepest = 0;
  let inside = 0;
  let eligible = 0;
  for (const el of rendered) {
    const r = el.getBoundingClientRect();
    if (inView(r)) inside += 1;
    else deepest = Math.max(deepest, r.bottom - innerHeight);
    const clips = clippingAncestors(el);
    if ([...el.getClientRects()].some((rect) => inView(rect) && clips.every((c) => overlaps(rect, c.getBoundingClientRect())))) {
      eligible += 1;
    }
  }
  let scrollHidden = 0;
  for (const el of document.querySelectorAll("*")) {
    const gap = el.scrollHeight - el.clientHeight;
    if (gap > 2 && /auto|scroll/.test(getComputedStyle(el).overflowY)) scrollHidden = Math.max(scrollHidden, gap);
  }
  return {
    height: innerHeight,
    rendered: rendered.length,
    inViewport: inside,
    /**
     * NOT the same population as inViewport, and the two are reported side by
     * side rather than merged. The growth loop still stops on `outside`, the
     * viewport figure, because growing a window cannot pull an element back
     * inside a fixed-height panel's clip: gating growth on the stricter rule
     * would be a gate nobody can ever get to green, which DEV_PROCESS 2.0 calls
     * a dead one.
     */
    axeEligible: eligible,
    inViewportNotEligible: Math.max(0, inside - eligible),
    outside: rendered.length - inside,
    overflowBelow: Math.ceil(Math.max(deepest, scrollHidden)),
  };
};

/**
 * THE TYPEFACE PROBE. G-99.
 *
 * document.fonts.check("14px Inter") returns TRUE whether or not the face
 * loaded - measured, in both arms - because the fallback can render the string,
 * so it is a broken-open indicator and is recorded only as a curiosity. The
 * reliable witness is an advance width: the product's own token stack against
 * the named face alone. Equal means the named face is what rendered; different
 * means something else did, and every wrap point in the product is then
 * different from the shipped one.
 */
const TYPEFACE_PROBE = () => {
  const width = (family, size) => {
    const s = document.createElement("span");
    s.textContent = "Development services staff review";
    s.setAttribute(
      "style",
      `position:absolute;left:-9999px;top:-9999px;white-space:nowrap;font-weight:400;font-size:${size}px;font-family:${family}`,
    );
    document.body.appendChild(s);
    const w = Math.round(s.getBoundingClientRect().width * 100) / 100;
    s.remove();
    return w;
  };
  const uiWidth = width("var(--sc-font-ui)", 14);
  const namedUiWidth = width('"Inter"', 14);
  const dataWidth = width("var(--sc-font-data)", 12);
  const namedDataWidth = width('"IBM Plex Mono"', 12);
  return {
    ui: uiWidth === namedUiWidth ? "shipped" : "fallback",
    data: dataWidth === namedDataWidth ? "shipped" : "fallback",
    uiWidth,
    namedUiWidth,
    dataWidth,
    namedDataWidth,
    genericWidth: width("sans-serif", 14),
    faceCount: document.fonts ? document.fonts.size : null,
    /** Recorded to keep the broken indicator visible rather than forgotten. */
    checkSaysInterIsAvailable: document.fonts ? document.fonts.check("14px Inter") : null,
  };
};

/**
 * THE GEOMETRY WITNESS. G-99.
 *
 * The one class of finding this gate cannot pin a number to is the sticky nav
 * footer overlapping the scrolling nav list, because whether it overlaps is a
 * function of where the footer's sentence wraps. These are the numbers that
 * change when it does, recorded on every run so two machines that disagree are
 * diagnosed from one log line rather than reproduced. It is the same move the
 * colour witness made in G-95, which turned "two machines disagree" into a
 * one-line diagnosis instead of a theory.
 */
const GEOMETRY_PROBE = () => {
  const nav = document.querySelector("#shell-nav");
  const foot = document.querySelector(".nav-foot");
  const dem = document.querySelector("#nav-demonstrated");
  if (!nav || !foot) return null;
  const fr = foot.getBoundingClientRect();
  const items = [...nav.querySelectorAll(".navitem")];
  const last = items.length ? items[items.length - 1].getBoundingClientRect() : null;
  const prov = foot.querySelector(".prov");
  return {
    dpr: devicePixelRatio,
    navHiddenPx: nav.scrollHeight - nav.clientHeight,
    navFootTop: Math.round(fr.top),
    navFootHeight: Math.round(fr.height),
    provHeight: prov ? Math.round(prov.getBoundingClientRect().height) : null,
    lastNavItemBottom: last ? Math.round(last.bottom) : null,
    overlapPx: last ? Math.round(last.bottom - fr.top) : null,
    demonstratedTop: dem ? Math.round(dem.getBoundingClientRect().top) : null,
  };
};

/**
 * ---------------------------------------------------------------------------
 * THE SECOND INSTRUMENT, IN PAGE. G-99, second pass.
 *
 * A sibling lane found a 1.74:1 ratio on a glyph that appears on every surface
 * in this product, and no bucket of axe reports it - not violations, not passes,
 * not incomplete. Bisected on one element with the character as the only
 * variable: text "|" NOT EVALUATED, "X" incomplete, "||" NOT EVALUATED, "XY"
 * VIOLATION. axe-core excludes punctuation-only text from color-contrast by
 * design (axe.js:28714, `removeUnicodeOptions = { emoji: true, nonBmp: false,
 * punctuations: true }` feeding hasRealTextChildren).
 *
 * That is axe working as documented, and it is also why a gate built on one tool
 * inherits that tool's exclusion set silently. So this composites backgrounds and
 * computes WCAG ratios directly, and it reports what axe never looked at.
 *
 * CONSERVATIVE BY CONSTRUCTION, because an instrument that guesses in ambiguous
 * cases cries wolf and gets switched off. It computes only where the answer is
 * unambiguous - opaque foreground, opaque background reached without crossing an
 * image, a gradient, a filter or a translucent layer, and an element whose own
 * centre hit-tests back to itself - and counts everything else as could-not-
 * compute. It also computes the ratio for a NAMED SUBJECT LIST, which is what
 * lets the verdict re-measure an adjudication instead of believing it.
 * ---------------------------------------------------------------------------
 */
const CONTRAST_SWEEP = (subjects, groups) => {
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratioOf = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(3));
  };
  /** Walk to an opaque background, refusing the moment anything is ambiguous. */
  const resolveBg = (el) => {
    let node = el;
    let acc = null;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return { ambiguous: "background-image" };
      if (cs.filter && cs.filter !== "none") return { ambiguous: "filter" };
      if (parseFloat(cs.opacity) < 1) return { ambiguous: "opacity" };
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        if (c.a < 1 && !acc) acc = c;
        else acc = acc ? over(acc, c) : c;
        if (acc.a >= 1) return { color: acc };
      }
      node = node.parentElement;
    }
    return { ambiguous: "no opaque background in the ancestor chain" };
  };
  const inView = (r) =>
    !(r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) && r.width > 0 && r.height > 0;
  const required = (px, weight) => {
    const bold = Number(weight) >= 700;
    return px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
  };
  const sel = (el) =>
    el.id
      ? "#" + el.id
      : el.tagName.toLowerCase() + (String(el.className || "").trim() ? "." + String(el.className).trim().split(/\s+/).join(".") : "");

  const measure = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") return { skip: "not rendered" };
    const rect = el.getBoundingClientRect();
    if (!el.getClientRects().length || !inView(rect)) return { skip: "outside the viewport" };
    const fg = parse(cs.color);
    if (!fg) return { ambiguous: "unparseable foreground" };
    const bg = resolveBg(el);
    if (bg.ambiguous) return { ambiguous: bg.ambiguous };
    /** The same hit-test the legible-text floor uses: if something else is on
     *  top, the composited answer is not what a person sees. */
    const hit = document.elementFromPoint(
      Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1),
      Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1),
    );
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return { ambiguous: "obscured by another element" };
    const px = parseFloat(cs.fontSize);
    return {
      ratio: ratioOf(fg.a < 1 ? over(fg, bg.color) : fg, bg.color),
      required: required(px, cs.fontWeight),
      color: cs.color,
      bg: `rgb(${Math.round(bg.color.r)}, ${Math.round(bg.color.g)}, ${Math.round(bg.color.b)})`,
      font: `${cs.fontWeight} ${cs.fontSize}`,
    };
  };

  /** Which elements axe put in NO bucket, by identity rather than by selector
   *  string - a selector heuristic silently mislabels anything axe addressed by
   *  :nth-child, which is most of a table. */
  const seen = new WeakSet();
  if (window.__k2AxeSeen) for (const el of window.__k2AxeSeen) seen.add(el);

  const out = {
    computed: 0,
    passed: 0,
    failed: 0,
    couldNotCompute: 0,
    excludedAriaHidden: 0,
    decorativeCouldNotCompute: 0,
    skippedByAxe: 0,
    ambiguousReasons: {},
    failures: [],
    decorative: [],
    subjects: [],
  };
  /**
   * WHAT THIS INSTRUMENT TOUCHED, kept by identity for the evaluation probe that
   * runs after it. Without this, "no instrument judged this element" cannot be
   * distinguished from "this instrument judged it and it was fine", and those are
   * the two states the whole coverage question turns on.
   */
  window.__l1Computed = [];
  window.__l1Decorative = [];
  const failuresByGroup = new Map();
  const decorativeByGroup = new Map();
  for (const [group, query] of Object.entries(groups)) {
    for (const el of document.querySelectorAll(query)) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const hidden = !!el.closest('[aria-hidden="true"]');
      const m = measure(el);
      /**
       * THE POPULATION TEST COMES FIRST, FOR EVERY BUCKET. G-101, and the first
       * draft of this very change got it wrong in the way this file exists to
       * catch.
       *
       * The aria-hidden branch used to sit ABOVE the skip test, so
       * excludedAriaHidden counted every matching element in the DOM across all
       * 92 scans - 1,840 - and printed it in one sentence beside "334 could not
       * be computed", which counts rendered, in-viewport elements. Two counting
       * rules in one line, four words apart, in the instrument built to stop
       * exactly that. Found by running it and reading the output, not by reading
       * the code.
       */
      if (m.skip) continue;
      if (hidden) {
        /**
         * DECLARED DECORATIVE, AND STILL MEASURED.
         *
         * Counting these and stopping is better than dropping them, and it is
         * still not enough for a conformance report: an exemption whose SIZE is
         * known but whose RATIO is not cannot be defended to an auditor, and the
         * moment the count is its only trace, the 1.856:1 that made the exemption
         * necessary disappears from the record entirely.
         *
         * So the ratio is computed anyway and reported under its own heading. It
         * is never summed with the failures and never scored as one - a declared
         * decorative element is exempt from 1.4.3 - but the number stays on the
         * page, which is the difference between an exemption and a blind spot.
         */
        out.excludedAriaHidden += 1;
        window.__l1Decorative.push(el);
        if (m.ambiguous) {
          out.decorativeCouldNotCompute += 1;
          continue;
        }
        const prevD = decorativeByGroup.get(group) || {
          group,
          nodes: 0,
          ratio: m.ratio,
          required: m.required,
          sample: `${sel(el)} ${m.color} on ${m.bg} at ${m.font}`,
        };
        prevD.nodes += 1;
        prevD.ratio = Math.min(prevD.ratio, m.ratio);
        decorativeByGroup.set(group, prevD);
        continue;
      }
      if (m.ambiguous) {
        out.couldNotCompute += 1;
        out.ambiguousReasons[m.ambiguous] = (out.ambiguousReasons[m.ambiguous] || 0) + 1;
        continue;
      }
      out.computed += 1;
      window.__l1Computed.push(el);
      if (!seen.has(el)) out.skippedByAxe += 1;
      if (m.ratio >= m.required) {
        out.passed += 1;
        continue;
      }
      out.failed += 1;
      /**
       * EVERY below-threshold element is reported here, including ones axe also
       * judged, and the first draft skipped the latter to avoid double-counting.
       * That was wrong twice over. It made the two instruments' numbers
       * uncomparable - the whole value of a second instrument is that two
       * measurements of one thing can be reconciled - and it made the finding
       * DISAPPEAR on whichever environment axe happened to evaluate the element
       * on, which is the silent-fallback shape this gate exists to refuse. The
       * .p-ok pair at 4.444:1 vanished from this list on Linux for exactly that
       * reason while remaining a real defect.
       *
       * The two numbers are not merged and never summed: they carry different
       * counting rules and are printed under different headings, and
       * skippedByAxe records how much of this population axe never saw.
       */
      const prev = failuresByGroup.get(group) || {
        group,
        nodes: 0,
        ratio: m.ratio,
        required: m.required,
        sample: `${sel(el)} ${m.color} on ${m.bg} at ${m.font}`,
      };
      prev.nodes += 1;
      prev.ratio = Math.min(prev.ratio, m.ratio);
      failuresByGroup.set(group, prev);
    }
  }
  out.failures = [...failuresByGroup.values()];
  out.decorative = [...decorativeByGroup.values()];
  for (const subject of subjects) {
    for (const el of document.querySelectorAll(subject)) {
      const m = measure(el);
      if (m.skip || m.ambiguous) continue;
      out.subjects.push({ subject, ratio: m.ratio, required: m.required, color: m.color, bg: m.bg });
    }
  }
  return out;
};

/**
 * The element groups the second instrument sweeps, DECLARED rather than "every
 * element", because a whole-document sweep on 46 scans is slow and, worse,
 * unreadable: a finding has to name a class a person can go and fix. Every group
 * here is a class that carries text through a kit token.
 */
const CONTRAST_GROUPS = {
  ".sep": ".sep",
  ".prov": ".prov",
  ".pill": ".pill",
  ".badge": ".badge",
  ".basis": ".basis",
  ".t-caption": ".t-caption",
  ".kicker": ".kicker",
  ".metric .n": ".metric .n",
  ".dt .id": ".dt .id",
  ".navitem": ".navitem",
  /**
   * G-101. THE SEPARATOR NOBODY HAD LOOKED AT.
   *
   * The breadcrumb divider is a bare `<span>/</span>` inside div.crumb. It is
   * punctuation-only, so axe excludes it by the same documented rule that hides
   * `|`; and it carries no class, so it matched none of the ten groups above.
   * That made it the only population on this product that NEITHER instrument
   * judged - 28 elements per theme, invisible to everything, found by counting
   * the gap between what axe evaluated and what exists rather than by anyone
   * noticing a `/`.
   *
   * It measures 5.559:1 in light and 5.232:1 in dark, both clear of 4.5:1, so it
   * is not a defect. It is a blind spot that happened to be clean, which is only
   * knowable by looking, and it is in the sweep now so that stays true by
   * measurement rather than by luck.
   */
  ".crumb span": ".crumb span",
};

/**
 * ---------------------------------------------------------------------------
 * THE EVALUATION PROBE. G-101, and it is the one that makes the coverage figure
 * mean what it says.
 *
 * The published bound read "full-extent covered 6198/6198 rendered text elements
 * (100%)". Its actual counting rule was: 100% of them were INSIDE THE VIEWPORT
 * BOX. Containment is not judgement, and on this product the gap between them is
 * 244 elements - axe judged 5,954 of the 6,198 the coverage line called covered.
 * A reader of an Accessibility Conformance Report will read 100% as "everything
 * was checked", and the figure does not support that sentence.
 *
 * So this counts, over the SAME rendered denominator and by element IDENTITY
 * rather than by selector string, which instrument actually judged what:
 *
 *   evaluated          axe's colour-contrast rules put it in a bucket - any
 *                      bucket. This is the honest coverage numerator.
 *   computed           the second instrument composited a ratio for it.
 *   declaredDecorative it sits inside [aria-hidden="true"], so it is out of the
 *                      accessibility tree and exempt from 1.4.3 as pure
 *                      decoration. An EXEMPTION, which must be declared and
 *                      counted, never a silent skip.
 *   exemptDisabled     it is a disabled control. WCAG 1.4.3 exempts inactive
 *                      user-interface components and axe declines them by design.
 *   unexamined         none of the above, while being inside the viewport and
 *                      satisfying axe's own candidate rule. Rendered text that
 *                      NOTHING looked at and NO exemption covers. This is the
 *                      class the gate now refuses on, and it is the whole point:
 *                      silence read as success is the defect this gate exists
 *                      for, and until now it had no name and no number.
 *
 * RUN AFTER BOTH INSTRUMENTS, in this order: axe, then the sweep, then this.
 * Running it earlier reads empty stashes and reports every element unexamined,
 * which is a plant-shaped failure rather than a silent one - and the test asserts
 * the order for that reason.
 * ---------------------------------------------------------------------------
 */
const EVALUATION_PROBE = (declaredDecorative) => {
  const inView = (r) =>
    !(r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) &&
    r.width > 0 &&
    r.height > 0;
  const overlaps = (a, b) => !(a.left >= b.right || a.right <= b.left || a.top >= b.bottom || a.bottom <= b.top);
  const clippingAncestors = (el) => {
    const out = [];
    let n = el.parentElement;
    while (n) {
      const cs = getComputedStyle(n);
      if (/hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflowY)) out.push(n);
      n = n.parentElement;
    }
    return out;
  };
  const sel = (el) =>
    el.id
      ? "#" + el.id
      : el.tagName.toLowerCase() + (String(el.className || "").trim() ? "." + String(el.className).trim().split(/\s+/).join(".") : "");
  const axeSeen = new WeakSet();
  const computed = new WeakSet();
  const decorative = new WeakSet();
  for (const el of window.__k2AxeSeen || []) axeSeen.add(el);
  for (const el of window.__l1Computed || []) computed.add(el);
  for (const el of window.__l1Decorative || []) decorative.add(el);
  const rendered = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,b,strong,em,a,button,td,th,li,label,caption,dt,dd")].filter(
    (el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== "hidden",
  );
  const out = {
    rendered: rendered.length,
    evaluated: 0,
    computed: 0,
    judged: 0,
    declaredDecorative: 0,
    exemptDisabled: 0,
    unexamined: 0,
    unexaminedByClass: {},
    unexaminedSample: [],
    /**
     * Every element carrying its own text that sits inside [aria-hidden="true"],
     * whether or not any declared group swept it. This is the population the
     * decorative ledger is checked against, so a lane cannot aria-hide a piece of
     * text and have it simply vanish from every number in the run.
     */
    ariaHiddenText: 0,
    ariaHiddenByClass: {},
    /**
     * Matched with the DOM's own matches(), never with a string heuristic on a
     * computed selector - the same lesson the axe-seen set already paid for. An
     * exemption that matches nothing has outlived its cause; a hidden element
     * that matches no exemption is an undeclared exclusion, which is the shape
     * this whole instrument exists to refuse.
     */
    declaredDecorativeHits: {},
    undeclaredDecorative: 0,
    undeclaredDecorativeByClass: {},
  };
  for (const s of declaredDecorative || []) out.declaredDecorativeHits[s] = 0;
  for (const el of rendered) {
    const hidden = !!el.closest('[aria-hidden="true"]');
    if (hidden) {
      out.ariaHiddenText += 1;
      const k = sel(el);
      out.ariaHiddenByClass[k] = (out.ariaHiddenByClass[k] || 0) + 1;
      const matched = (declaredDecorative || []).filter((s) => {
        try {
          return el.matches(s) || !!el.closest(s);
        } catch (err) {
          void err;
          return false;
        }
      });
      if (matched.length) for (const s of matched) out.declaredDecorativeHits[s] += 1;
      else {
        out.undeclaredDecorative += 1;
        out.undeclaredDecorativeByClass[k] = (out.undeclaredDecorativeByClass[k] || 0) + 1;
      }
    }
    const clips = clippingAncestors(el);
    const eligible = [...el.getClientRects()].some(
      (rect) => inView(rect) && clips.every((c) => overlaps(rect, c.getBoundingClientRect())),
    );
    const wasEvaluated = axeSeen.has(el);
    const wasComputed = computed.has(el);
    if (wasEvaluated) out.evaluated += 1;
    if (wasComputed) out.computed += 1;
    if (wasEvaluated || wasComputed) out.judged += 1;
    if (hidden || decorative.has(el)) {
      out.declaredDecorative += 1;
      continue;
    }
    /**
     * NARROWED DELIBERATELY, to exactly what axe's own contrast rule exempts and
     * what WCAG 1.4.3 names: an INACTIVE user-interface component. A native
     * disabled control, or one inside a disabled fieldset.
     *
     * The first draft also accepted a bare [disabled] attribute on any ancestor
     * and aria-disabled="true". Both are broader than axe, and an exemption
     * broader than the tool it is compensating for is an exemption that can hide
     * something the tool would have caught: [disabled] on a div disables nothing
     * and would have exempted a whole subtree, and aria-disabled is a
     * self-declaration any markup can make. Anything outside this falls through
     * to the unexamined class, where it is visible and refused rather than
     * quietly excused.
     */
    const disabled =
      el.disabled === true ||
      !!el.closest("fieldset[disabled]");
    if (disabled) {
      out.exemptDisabled += 1;
      continue;
    }
    if (!eligible || wasEvaluated || wasComputed) continue;
    out.unexamined += 1;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    const key = sel(el) + (own.replace(/[\p{P}\p{S}\s]/gu, "").length === 0 ? " [punctuation-only]" : "");
    out.unexaminedByClass[key] = (out.unexaminedByClass[key] || 0) + 1;
    if (out.unexaminedSample.length < 6) out.unexaminedSample.push(`${sel(el)} ${JSON.stringify(own.slice(0, 24))}`);
  }
  return out;
};

/** One layout settle, so a measurement after a resize is of the new layout. */
const settle = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );

/**
 * GROW UNTIL NOTHING IS OUTSIDE THE BOX, and stop on the thing that matters.
 *
 * The stop condition IS the coverage assertion: the loop ends when the count of
 * rendered elements outside the viewport reaches zero, or when the declared cap
 * is hit, and it says which. A cap hit is not silently treated as full extent -
 * coverageFindings() in src/a11y-gate.mjs refuses the build on it, because axe
 * evaluates nothing outside the box and an unexamined element is not a clean
 * one.
 *
 * The height is DERIVED rather than fixed because the saturation height is a
 * property of the surface: development-services/inspections saturates at 2400,
 * work-connections needs past 3000, and a constant tall height would ship a
 * second undeclared bound in place of the first one.
 */
async function growToFullExtent(page, viewport) {
  let height = Math.max(viewport.startHeight, REFERENCE_VIEWPORT.height);
  let steps = 0;
  let measured = await page.evaluate(COVERAGE_PROBE);
  while (measured.outside > 0 && steps < viewport.growthSteps) {
    const next = Math.min(viewport.maxHeight, height + measured.overflowBelow + 64);
    if (next <= height) break;
    height = next;
    steps += 1;
    await page.setViewportSize({ width: viewport.width, height });
    await settle(page);
    measured = await page.evaluate(COVERAGE_PROBE);
  }
  const stoppedBecause =
    measured.outside === 0
      ? "grew until nothing was left outside the clipping box"
      : height >= viewport.maxHeight
        ? `hit the declared cap of ${viewport.maxHeight}px with ${measured.overflowBelow}px still below the fold`
        : `used all ${viewport.growthSteps} growth step(s) with ${measured.overflowBelow}px still below the fold`;
  return { ...measured, steps, stoppedBecause };
}

/**
 * The independent sweep, run AFTER axe so it can ask which elements axe put in
 * no bucket. Identity, not selector strings: runAxe stashes the actual DOM nodes
 * axe reported on window.__k2AxeSeen, because matching axe's CSS targets against
 * selector strings silently mislabels everything axe addressed by :nth-child,
 * which is most of a table. That mistake was made once in this lane's own
 * measurement and caught by redoing it on identity.
 */
async function sweepContrast(page) {
  return page.evaluate(
    ([sweepSrc, subjects, groups]) =>
      new Function("return (" + sweepSrc + ")")()(subjects, groups),
    [CONTRAST_SWEEP.toString(), ADJUDICATED_SUBJECTS, CONTRAST_GROUPS],
  );
}

/** One axe run against the document as it currently stands. */
async function runAxe(page, tags) {
  return page.evaluate(async (t) => {
    const run = await window.axe.run(document, {
      elementRef: true,
      resultTypes: ["violations", "incomplete", "passes"],
      runOnly: { type: "tag", values: [...t, "best-practice"] },
    });
    /**
     * Every element AXE'S CONTRAST RULES actually judged, in any bucket, kept by
     * IDENTITY so the second instrument can ask "did axe look at this at all"
     * without guessing from a selector string.
     *
     * SCOPED TO THE CONTRAST RULES, and the first draft was not - it collected
     * nodes from every rule in the run, so a span that merely passed
     * `aria-allowed-attr` counted as "axe looked at its contrast". The effect was
     * total: on a full run the sweep computed 4,908 elements, found 341 below
     * threshold, and reported ZERO of them, because every one of them was in
     * some other rule's pass list. A silent fail-open in the instrument built to
     * catch silent fail-opens, found by running it rather than by reading it.
     */
    const CONTRAST_RULES = ["color-contrast", "color-contrast-enhanced"];
    window.__k2AxeSeen = [];
    for (const group of ["violations", "incomplete", "passes"]) {
      for (const res of run[group]) {
        if (!CONTRAST_RULES.includes(res.id)) continue;
        for (const n of res.nodes) if (n.element) window.__k2AxeSeen.push(n.element);
      }
    }
    const shape = (v) => ({
      id: v.id,
      impact: v.impact,
      tags: v.tags,
      help: v.help,
      nodes: v.nodes.length,
      sample: v.nodes.slice(0, 3).map((n) => String(n.target)),
      /**
       * EVERY target, not a sample, bounded at 200. A subject-bounded
       * adjudication has to be able to ask whether a node is on a named element
       * and a three-item sample cannot answer that - it would accept a stray
       * finding merely because it sorted fourth.
       */
      targets: v.nodes.slice(0, 200).map((n) => String(n.target)),
      /**
       * NODES AND TARGETS SPLIT BY REASON, because a rule can land in the
       * incomplete bucket for several different reasons at once and they are
       * different findings with different adjudications. Aggregating them under
       * the rule alone made the gate compare a shortTextContent entry pinned at
       * 1 against the whole rule's 44, and test an elmPartiallyObscuring subject
       * set against targets that belonged to the other reason entirely. Both
       * were wrong in the same run.
       */
      byReason: v.nodes.reduce((acc, n) => {
        const reason =
          [...(n.any || []), ...(n.all || []), ...(n.none || [])]
            .map((c) => c.data?.messageKey || c.message || c.id)
            .filter(Boolean)[0] || "unknown";
        acc[reason] = acc[reason] || { nodes: 0, targets: [] };
        acc[reason].nodes += 1;
        if (acc[reason].targets.length < 200) acc[reason].targets.push(String(n.target));
        return acc;
      }, {}),
      /**
       * WHY, not just WHERE. An unresolved check that names only its element
       * tells a reader it exists and nothing about what to do; axe already
       * knows the reason (bgOverlap, bgImage, fgAlpha and friends) and it was
       * being thrown away. Carried for incomplete results in particular,
       * because those are the ones nobody can reproduce from the element name.
       */
      reasons: [
        ...new Set(
          v.nodes.slice(0, 20).flatMap((n) =>
            [...(n.any || []), ...(n.all || []), ...(n.none || [])].map(
              (c) => c.data?.messageKey || c.message || c.id,
            ),
          ),
        ),
      ].filter(Boolean).slice(0, 4),
    });
    return { violations: run.violations.map(shape), incomplete: run.incomplete.map(shape) };
  }, tags);
}

async function scanOnce(browser, base, target, axe, plant) {
  const ctx = await browser.newContext({
    viewport: { width: REFERENCE_VIEWPORT.width, height: REFERENCE_VIEWPORT.height },
  });
  /**
   * The theme lever. addInitScript runs before any script in the document, so
   * the value is in storage by the time the inline head script reads it - which
   * is the only moment that matters, because the palette is resolved at first
   * paint. Guarded, because getItem/setItem THROW rather than return null in a
   * partitioned storage context and an unguarded throw here would leave the
   * scan silently on the default theme.
   */
  await ctx.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch (err) {
        void err;
      }
    },
    [THEME_STORAGE_KEY, target.theme],
  );
  const page = await ctx.newPage();
  try {
    try {
      await page.goto(base + target.url, { waitUntil: "networkidle", timeout: 60000 });
    } catch {
      await page.goto(base + target.url, { waitUntil: "networkidle", timeout: 90000 });
    }
    /**
     * THE PLANT GOES FIRST, and that ordering is not cosmetic.
     *
     * It used to be applied after the probe below, which meant a plant could
     * never trip the probe's own assertions - and the unresolved-contrast plant,
     * whose whole point is a page that renders nothing measurable, reported
     * "gate PASSED, WHICH IS THE BUG" for exactly that reason. Measuring after
     * the plant is also simply more faithful: these assertions are about the
     * page axe is handed, not the page before something happened to it.
     */
    if (plant) {
      await page.evaluate((chrome) => {
        window.__plantChrome = chrome;
      }, PLANT_CHROME);
      await page.evaluate(PLANTS[plant].apply);
    }

    /**
     * THE THEME LANDED, asserted rather than assumed. Without this a scan that
     * silently ran the default palette is indistinguishable from a clean one,
     * and that is precisely how a light-theme regression stays invisible
     * forever behind a green build.
     */
    const geometry = await page.evaluate(GEOMETRY_PROBE);
    const painted = await page.evaluate(
      () => {
        return {
          theme: document.documentElement.getAttribute("data-theme"),
          canvas: getComputedStyle(document.body).backgroundColor,
          sheets: [...document.styleSheets].filter((sheet) => {
            try {
              return sheet.cssRules.length > 0;
            } catch {
              return false;
            }
          }).length,
          /**
           * A NAMED WITNESS, recorded on every scan.
           *
           * The first CI run of this gate reported color-contrast ZERO across all 46
           * scans while the same commit reported 1002 on the author's machine. Two
           * numbers that should agree and did not, which is the cheapest kind of
           * finding there is (DEV_PROCESS 1.4) - but nothing in the output could
           * say WHICH of the two candidate explanations it was: a different palette,
           * or a rule that ran and could not resolve a background. So one element
           * that is known to fail carries its own resolved colours into the log, and
           * the next run answers the question instead of inviting a theory.
           */
          /**
           * HOW MUCH OF THIS PAGE IS ACTUALLY VISIBLE, and the plant that forced it.
           *
           * The unresolved-contrast plant drops a translucent full-viewport overlay
           * and the gate PASSED it. Not because the overlay was harmless - because
           * axe treats everything under it as obscured and evaluates nothing, so the
           * run came back with no violations, no incomplete results, and no reason to
           * refuse. A page that renders nothing measurable was scoring clean, which
           * is the same defect as the unstyled scan one layer up: silence read as
           * success.
           *
           * Counting rule: elements carrying their own non-empty text whose centre
           * point hit-tests back to themselves or to one of their descendants. An
           * overlay takes that to zero because every hit-test lands on the overlay.
           */
          visibleTextNodes: (() => {
            let n = 0;
            for (const el of document.querySelectorAll("h1,h2,p,span,b,a,button,td,th,li")) {
              const text = (el.textContent || "").trim();
              if (!text) continue;
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
              const hit = document.elementFromPoint(
                Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1),
                Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1),
              );
              if (hit && (hit === el || el.contains(hit) || hit.contains(el))) n += 1;
            }
            return n;
          })(),
          witness: (() => {
            const el = document.querySelector(".navitem.roster") || document.querySelector(".p-quiet");
            if (!el) return null;
            const cs = getComputedStyle(el);
            const root = getComputedStyle(document.documentElement);
            return {
              selector: el.getAttribute("class"),
              color: cs.color,
              background: cs.backgroundColor,
              fontSize: cs.fontSize,
              fontFamily: cs.fontFamily.split(",")[0],
              quiet: root.getPropertyValue("--sc-quiet").trim(),
              ink3: root.getPropertyValue("--sc-ink-3").trim(),
              behindIt: (() => {
                const r = el.getBoundingClientRect();
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return hit ? hit.tagName.toLowerCase() + (hit.id ? "#" + hit.id : "") : "nothing";
              })(),
            };
          })(),
        };
      },
    );
    painted.geometry = geometry;
    if (painted.theme !== target.theme) {
      throw new Error(
        `theme did not land: asked ${target.theme}, the document painted ${painted.theme}. The scan measured the wrong palette, so it is recorded as unmeasured rather than clean.`,
      );
    }
    /**
     * THE STYLESHEET LANDED. web/shell.css gives body an opaque background from
     * a kit token, so a transparent body means the sheet is not applied and
     * nothing this scan measured is about the shipped product.
     */
    if (!painted.sheets || /rgba\(0, 0, 0, 0\)|transparent/.test(painted.canvas)) {
      throw new Error(
        `the page did not paint: body background is ${painted.canvas} with ${painted.sheets} stylesheet rule set(s) applied. An unstyled scan reports no contrast failures and no focus indicators, which reads as the cleanest scan of the run; it is recorded as unmeasured instead.`,
      );
    }
    /**
     * AND THE PAGE IS ACTUALLY LEGIBLE. A floor rather than an exact figure,
     * because the number varies by surface and only its collapse is meaningful.
     * Ten is well under the smallest real surface (the leanest scan of the
     * product reports over a hundred) and far above what an obscured page
     * reports, which is zero.
     */
    if (painted.visibleTextNodes < VISIBLE_TEXT_FLOOR) {
      throw new Error(
        `the page rendered nothing legible: ${painted.visibleTextNodes} text elements hit-test to themselves, under the floor of ${VISIBLE_TEXT_FLOOR}. Everything is obscured or absent, so axe evaluated nothing and the scan would otherwise report no findings at all - silence, read as success.`,
      );
    }
    /**
     * THE THIRD LANDING ASSERTION (G-99), beside the theme and the paint: WHICH
     * TYPEFACE rendered. Recorded per scan rather than thrown here, because
     * "the shipped face did not land" is a property of the RUN - a single scan
     * cannot tell a CDN outage from a per-scan flake, and the two need different
     * words. typefaceFindings() in src/a11y-gate.mjs judges it over the whole
     * run and refuses both a fallback run and a mixed one.
     */
    const typeface = await page.evaluate(TYPEFACE_PROBE);
    const title = await page.title();
    await page.addScriptTag({ content: axe.source });

    const rows = [];
    /** The reference pass: the height a person reads at, measured first. */
    const referenceCoverage = await page.evaluate(COVERAGE_PROBE);
    const referenceAxe = await runAxe(page, CONFORMANCE_TAGS);
    const referenceContrast = await sweepContrast(page);
    /** THIRD, after both instruments have stashed what they touched. */
    const referenceEvaluation = await page.evaluate(EVALUATION_PROBE, DECLARED_DECORATIVE_SELECTORS);
    rows.push({
      viewport: REFERENCE_VIEWPORT.id,
      coverage: {
        ...referenceCoverage,
        steps: 0,
        stoppedBecause: REFERENCE_VIEWPORT.basis,
        evaluated: referenceEvaluation.evaluated,
        judged: referenceEvaluation.judged,
      },
      evaluation: referenceEvaluation,
      violations: referenceAxe.violations,
      incomplete: referenceAxe.incomplete,
      independentContrast: referenceContrast,
    });

    /**
     * The full-extent pass, IN THE SAME PAGE LOAD. A second navigation would
     * double the run's wall clock and, worse, would measure a second render of
     * the page rather than the same one at a different size - which is the only
     * thing that makes the superset assertion in src/a11y-gate.mjs meaningful.
     */
    const grown = await growToFullExtent(page, FULL_EXTENT_VIEWPORT);
    const fullAxe = await runAxe(page, CONFORMANCE_TAGS);
    const fullContrast = await sweepContrast(page);
    const fullEvaluation = await page.evaluate(EVALUATION_PROBE, DECLARED_DECORATIVE_SELECTORS);
    rows.push({
      viewport: FULL_EXTENT_VIEWPORT.id,
      coverage: { ...grown, evaluated: fullEvaluation.evaluated, judged: fullEvaluation.judged },
      evaluation: fullEvaluation,
      violations: fullAxe.violations,
      incomplete: fullAxe.incomplete,
      independentContrast: fullContrast,
    });

    /**
     * Back to the reference viewport for the keyboard walk. 2.4.7 is answered by
     * the tab ring and a computed focus style, neither of which is a function of
     * window height, so the walk is not repeated - and that bound is declared in
     * the report rather than left to be inferred.
     */
    await page.setViewportSize({ width: REFERENCE_VIEWPORT.width, height: REFERENCE_VIEWPORT.height });
    await settle(page);
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll(".lens")]
        .filter((e) => getComputedStyle(e).display !== "none")
        .map((e) => e.id),
    );
    const walk = await tabWalk(page);
    return {
      ok: true,
      rows: rows.map((row) => ({
        ...target,
        ...row,
        ok: true,
        title,
        painted,
        typeface,
        visibleLens: visible,
        focus: row.viewport === REFERENCE_VIEWPORT.id ? walk.stops : [],
        focusNotes: row.viewport === REFERENCE_VIEWPORT.id ? walk.notes : [],
        focusCrossings: row.viewport === REFERENCE_VIEWPORT.id ? walk.crossings : [],
      })),
    };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 300) };
  } finally {
    await ctx.close();
  }
}

/**
 * Retried ONCE, and only once. A second consecutive failure is reported as a
 * failed scan and fails the build: an empty result is not an absence, and a
 * surface that would not load twice is a finding rather than a flake.
 *
 * Returns one row PER VIEWPORT, so a page load that never happened is recorded
 * as an unmeasured scan at every viewport rather than as a missing row - an
 * absent scan and a clean one must not look the same in the denominator.
 */
async function scanSurface(browser, base, target, axe, plant) {
  const first = await scanOnce(browser, base, target, axe, plant);
  if (first.ok) return first.rows;
  const second = await scanOnce(browser, base, target, axe, plant);
  if (second.ok) return second.rows.map((r) => ({ ...r, retried: first.error }));
  return VIEWPORT_IDS.map((viewport) => ({
    ...target,
    viewport,
    ok: false,
    error: `${second.error} (retried once; first attempt: ${first.error})`,
  }));
}

/**
 * THE CONDITIONS BANNER. G-99.
 *
 * Printed at the TOP and at the BOTTOM of every run, pass or fail, because a
 * reader who scrolls to the verdict must not be able to reach it without the
 * two conditions the number depends on. A figure whose bound is not stated
 * beside it is the DEV_PROCESS 1.2 defect, and this figure lands in an
 * Accessibility Conformance Report.
 */
function conditions(summary) {
  const cov = summary.coverageByViewport || {};
  const tf = summary.environment?.typefaceWitness;
  return [
    summary.environment?.authority?.line || "",
    /**
     * TWO NUMBERS, AND THE NARROWER ONE FIRST. G-101.
     *
     * "covering 6198/6198 (100%)" reads as "everything was checked" and means
     * "everything was inside the window". axe judged 96.1% of it. Both are
     * printed, EVALUATED leads, and each carries its own word - JUDGED and
     * CONTAINED - so neither can be quoted as the other.
     */
    `BOUNDED BY: ${summary.viewports.map((v) => `${v.id} ${v.width}x${v.derived ? "derived" : v.height} axe JUDGED ${cov[v.id]?.evaluated ?? "?"}/${cov[v.id]?.rendered ?? "?"} rendered text elements (${cov[v.id]?.pctEvaluated ?? "?"}%), of which ${cov[v.id]?.inViewport ?? "?"} (${cov[v.id]?.pct ?? "?"}%) were merely CONTAINED in the viewport box`).join("  |  ")}`,
    `EVALUATED IS NOT COVERED: ${cov[FULL_EXTENT_VIEWPORT.id]?.countingRule || "counting rule unavailable"}`,
    `RENDERED BY: ${summary.environment?.platform || "?"} ${summary.environment?.arch || ""} chromium ${summary.environment?.chromium || "?"} axe ${summary.axeVersion} dpr ${summary.environment?.geometryWitness?.dpr ?? "?"} typeface ${JSON.stringify(summary.environment?.typefaceStates || [])}${tf ? ` (ui ${tf.uiWidth}px vs named ${tf.namedUiWidth}px, data ${tf.dataWidth}px vs named ${tf.namedDataWidth}px, ${tf.faceCount} face(s) registered)` : ""}`,
    `GEOMETRY WITNESS: ${JSON.stringify(summary.environment?.geometryWitness || null)}`,
  ];
}

function report(summary, out = process.stdout) {
  const w = (s) => out.write(s + "\n");
  w("");
  w(`a11y gate  axe-core ${summary.axeVersion}  ${summary.base}`);
  for (const line of conditions(summary)) w(line);
  w("");
  w(`counting rule: ${summary.countingRule}`);
  if (summary.retriedScans.length) {
    w(`RETRIED (first attempt did not paint, second did): ${summary.retriedScans.length}`);
    for (const r of summary.retriedScans) w(`  ${r.surface}: ${r.reason}`);
  }
  w(`scans ${summary.surfacesOk}/${summary.surfacesScanned}  (${summary.surfaceCount} surfaces x ${summary.themes.length} themes x ${summary.viewports.length} viewports: ${summary.arms.join(", ")})`);
  w(
    `theme lever: ${summary.themeLeverFinding ? "DID NOT MOVE - " + summary.themeLeverFinding : "proven, the palette differs between themes"}`,
  );
  w(`conformance nodes by ARM: ${Object.entries(summary.conformanceNodesByArm).map(([a, n]) => `${a} ${n}`).join(", ")}`);
  /**
   * The line this whole row exists for: what the reference viewport could not
   * see. Printed even when it is zero, because "we looked and it was zero" and
   * "we could not look" have to be different sentences.
   */
  {
    const ref = summary.coverageByViewport?.[REFERENCE_VIEWPORT.id];
    const full = summary.coverageByViewport?.[FULL_EXTENT_VIEWPORT.id];
    const hidden = ref && full ? full.inViewport - ref.inViewport : null;
    w(
      `viewport bound: the ${REFERENCE_VIEWPORT.id} viewport left ${hidden === null ? "?" : hidden} rendered text element(s) OUTSIDE ITS BOX that full extent reached, and axe judged ${full && ref ? full.evaluated - ref.evaluated : "?"} more of them there. axe evaluates nothing outside the clipping box, so those were not judged clean - they were not judged. Full extent grew to at most ${full?.maxHeight ?? "?"}px.`,
    );
  }
  /**
   * WHAT EACH INSTRUMENT ACTUALLY JUDGED, and what NEITHER did. G-101. Printed
   * whether or not it is zero, because "we looked and found nothing" and "we did
   * not look" are different sentences and only one of them is a pass.
   */
  {
    const ref = summary.coverageByViewport?.[REFERENCE_VIEWPORT.id];
    const full = summary.coverageByViewport?.[FULL_EXTENT_VIEWPORT.id];
    for (const [id, c] of [[REFERENCE_VIEWPORT.id, ref], [FULL_EXTENT_VIEWPORT.id, full]]) {
      if (!c) continue;
      w(
        `evaluation [${id}]: rendered ${c.rendered} | contained in viewport ${c.inViewport} (${c.pct}%) | axe-eligible ${c.axeEligible} | axe JUDGED ${c.evaluated} (${c.pctEvaluated}%) | judged by either instrument ${c.judged} (${c.pctJudged}%)`,
      );
      if (c.inViewportNotEligible) {
        w(
          `      ${c.inViewportNotEligible} element(s) were inside the viewport box and OUTSIDE axe's own candidate rule - inside a window, outside a clipping ancestor. That axis is measured on every run rather than assumed away.`,
        );
      }
    }
    const unexamined = (summary.evaluationFindings || []).filter((f) => f.kind === "unexamined-text").length;
    w(
      `      text NO instrument judged and no exemption covers: ${unexamined} scan(s) carrying any. Anything above zero fails the build.`,
    );
    for (const d of summary.decorativeExempt || []) {
      w(
        `      DECLARED DECORATIVE [${d.group}] ${d.nodes} element(s) at ${JSON.stringify(d.ratios)}:1 against ${d.required}:1 - exempt from 1.4.3 as pure decoration because they are outside the accessibility tree, and MEASURED anyway so the exemption is quotable. sample ${d.sample}`,
      );
    }
    for (const f of summary.evaluationFindings || []) w(`  EVALUATION [${f.kind}] ${f.surface}: ${f.detail}`);
  }
  {
    const ic = summary.independentContrastCoverage || {};
    w(
      `SECOND INSTRUMENT (contrast computed here, not by axe): ${ic.computed} element(s) computed, ${ic.passed} pass, ${ic.failed} FAIL, ${ic.couldNotCompute} could not be computed, ${ic.excludedAriaHidden} excluded as decorative (aria-hidden), ${ic.skippedByAxe} of the computed ones were in NO axe bucket.`,
    );
    w(`      why it exists: ${ic.note}`);
    for (const f of summary.independentContrast || []) {
      w(
        `  INDEPENDENT CONTRAST [${f.group}] ${f.nodes} element(s) at ${JSON.stringify(f.ratios)}:1 against ${f.required}:1 required. axe reported these in NO bucket. sample ${f.sample}`,
      );
    }
    for (const f of summary.adjudicationBasisFindings || []) w(`  ADJUDICATION [${f.kind}] ${f.rule}: ${f.detail}`);
  }
  for (const f of summary.coverageFindings || []) w(`  COVERAGE [${f.kind}] ${f.surface}: ${f.detail}`);
  for (const f of summary.supersetFindings || []) w(`  VIEWPORT GROWTH [${f.kind}] ${f.surface}: ${f.detail}`);
  for (const f of summary.typefaceFindings || []) w(`  TYPEFACE [${f.kind}] ${f.detail}`);
  for (const wit of summary.witnesses) w(`witness [${wit.theme}] ${JSON.stringify(wit.witness)}`);
  w("");
  w(`CONFORMANCE (WCAG A/AA) rules failing: ${summary.conformanceViolations.length}, nodes: ${summary.conformanceNodes}`);
  for (const v of summary.conformanceViolations) {
    const waived = waiverFor(v.id);
    w(
      `  ${v.id.padEnd(30)} ${String(v.nodes).padStart(4)} nodes  ${v.impact}  [${v.tags.join(" ")}]${
        waived
          ? `  WAIVED ceiling ${JSON.stringify(waived.nodesByArm)} (total ${waivedTotal(waived)}), owner ${waived.owner}`
          : ""
      }`,
    );
    w(`      per arm: ${JSON.stringify(Object.fromEntries(summary.arms.map((a) => [a, (summary.conformanceNodesByArmRule?.[a] || {})[v.id] || 0])))}`);
    w(`      on: ${[...new Set(v.surfaces)].join(", ")}`);
    if (waived) w(`      basis: ${waived.basis}`);
    if (waived) w(`      remove when: ${waived.remove}`);
  }
  w(
    `UNRESOLVED conformance checks (axe could not settle these; not a pass): ${summary.incompleteConformance.length} rule(s), ${summary.incompleteConformance.reduce((n, x) => n + x.nodes, 0)} node(s)`,
  );
  for (const inc of summary.incompleteConformance) {
    const item = REVIEW_ITEMS.find((r) => r.rule === inc.id && r.reason === inc.reason);
    w(
      `  ${(inc.id + "/" + inc.reason).padEnd(38)} ${String(inc.nodes).padStart(4)} nodes  sample ${JSON.stringify(inc.sample)}${
        item ? (isSubjectBounded(item) ? "  ADJUDICATED BY SUBJECT (count unpinned, still reported)" : "  ADJUDICATED BY COUNT") : "  NOT ADJUDICATED"
      }`,
    );
    w(`      per arm: ${JSON.stringify(Object.fromEntries(summary.arms.map((a) => [a, (summary.incompleteNodesByArmRule?.[a] || {})[inc.key] || 0])))}`);
    w(`      distinct targets: ${JSON.stringify([...new Set(inc.targets || [])].slice(0, 8))}`);
    w(`      on: ${[...new Set(inc.surfaces)].slice(0, 6).join(", ")}${inc.surfaces.length > 6 ? " ..." : ""}`);
    if (item) {
      w(`      ${item.adjudication}`);
      if (isSubjectBounded(item)) {
        w(`      SUBJECT SET: ${JSON.stringify(item.subjects)}. A node on any other element FAILS the build.`);
        w(`      ENVIRONMENT DEPENDENT: ${item.environmentDependent}`);
      }
      w(`      routed to: ${item.routedTo}`);
      w(`      remove when: ${item.remove}`);
    }
    if (!item) w("      an unresolved conformance check is NOT a pass and is not counted as one.");
  }
  w(`best-practice rules failing: ${summary.bestPracticeViolations.length}`);
  for (const v of summary.bestPracticeViolations) {
    w(
      `  ${v.id.padEnd(30)} ${String(v.nodes).padStart(4)} nodes  ${v.impact}${
        GATED_BEST_PRACTICE[v.id] ? "  GATED ANYWAY" : "  reported, not gated"
      }`,
    );
    w(`      on: ${[...new Set(v.surfaces)].join(", ")}`);
    if (GATED_BEST_PRACTICE[v.id]) w(`      why: ${GATED_BEST_PRACTICE[v.id]}`);
  }
  w("");
  w(`2.4.2 Page Titled findings: ${summary.titleFindings.length}`);
  for (const f of summary.titleFindings) w(`  [${f.kind}] ${f.surface}: ${f.detail}`);
  w(`2.4.7 Focus Visible findings: ${summary.focusFindings.length} over ${summary.focusStopsWalked} keyboard stops`);
  for (const f of summary.focusFindings.slice(0, 40)) w(`  [${f.kind}] ${f.surface}: ${f.detail}`);
  w(`keyboard walks that ended early: ${summary.focusWalkNotes.length}`);
  for (const n of summary.focusWalkNotes) w(`  ${n.surface}: ${n.notes.join("; ")}`);
  w(`UNMEASURED, reported rather than scored: ${summary.unmeasuredMounts.length} cross-origin mount(s)`);
  for (const m of summary.unmeasuredMounts) w(`  ${m}  (the mounted product answers for its own focus indicator)`);
  w("");
  /** The header used to say "evaluated/rendered" over a column of CONTAINED
   *  counts. Both columns are printed now and each says which it is. */
  w("per scan  (conformance nodes | unresolved | axe-judged/rendered | contained/rendered | viewport height | focus stops | no indicator | title)");
  for (const s of summary.perSurface) {
    w(
      `  ${s.surface.padEnd(56)} ${String(s.conformanceNodes ?? "ERR").padStart(4)} | ${String(
        s.unresolvedNodes ?? "-",
      ).padStart(3)} | ${String(s.coverage ? `${s.coverage.evaluated ?? "?"}/${s.coverage.rendered}` : "-").padStart(9)} | ${String(
        s.coverage ? `${s.coverage.inViewport}/${s.coverage.rendered}` : "-",
      ).padStart(9)} | ${String(s.coverage?.height ?? "-").padStart(5)} | ${String(s.focusStops ?? "-").padStart(3)} | ${String(s.focusWithoutIndicator ?? "-").padStart(3)} | ${s.title ?? s.url}`,
    );
  }
  w("");
  w(`2.4.7 was walked at the ${summary.focusViewport} viewport only, which is declared rather than implied: the tab ring and a computed focus style are both independent of window height.`);
  for (const line of conditions(summary)) w(line);
  w("");
}

/* -------------------------------------------------------------------- main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const axe = axeSource();
  /** Surfaces x themes, both derived. Neither list is written down here. The
   *  viewport axis is added inside scanSurface, from one page load per pair. */
  const targets = THEMES.flatMap((theme) =>
    A11Y_TARGETS.map((t) => ({ ...t, theme, expectedTitle: expectedTitle(t) })),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchChromium();
  /**
   * THE ENVIRONMENT, CAPTURED RATHER THAN ASSUMED. Everything here was a
   * candidate explanation for two machines disagreeing by 88 nodes, and every
   * one of them is now in the log instead of in a theory.
   */
  const env = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    ci: Boolean(process.env.CI),
    chromium: browser.version(),
    /**
     * WHICH TREE THIS RUN MEASURED. G-101, and it is not bookkeeping.
     *
     * On a `pull_request` event GITHUB_SHA is the MERGE of the head into the
     * base, not the head; GITHUB_HEAD_REF's tip is in GITHUB_SHA only on a push.
     * Two runs of one head SHA measured two different products for exactly this
     * reason and the disagreement was read as an environment difference for a
     * day. Read from the environment rather than from git, so it is the runner's
     * own answer and not this process's guess about a checkout.
     */
    commit: process.env.GITHUB_SHA || process.env.A11Y_COMMIT || null,
    headSha: process.env.A11Y_HEAD_SHA || null,
    eventName: process.env.GITHUB_EVENT_NAME || null,
  };
  let results = [];
  try {
    for (const t of targets) {
      results.push(...(await scanSurface(browser, base, t, axe, args.plant)));
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const summary = summarize(results, axe, base, env);
  const v = verdict(summary);
  if (!args.quiet) report(summary);
  if (args.json) {
    fs.writeFileSync(path.resolve(root, args.json), JSON.stringify({ summary, results }, null, 1));
    process.stdout.write(`wrote ${args.json}\n`);
  }
  if (args.plant) {
    process.stdout.write(
      `PLANT ${args.plant} (${PLANTS[args.plant].what}) -> gate ${v.pass ? "PASSED, WHICH IS THE BUG" : "FAILED as required"}\n`,
    );
    process.exit(v.pass ? 1 : 0);
  }
  const auth = summary.environment.authority;
  for (const line of v.stale) process.stdout.write(`a11y gate STALE: ${line}\n`);
  if (!v.pass) {
    /**
     * A FAILURE ON A NON-AUTHORITATIVE MACHINE SAYS SO, in its own message.
     * This is the line that stops a developer reading 44 as a real number: the
     * geometry-dependent half of a local figure does not transfer, and a run
     * that does not say which half is which invites exactly the wrong fix.
     */
    process.stderr.write(`a11y gate FAILED: ${v.reasons.join("; ")}\n`);
    process.stderr.write(`${auth.line}\n`);
    process.exit(1);
  }
  const waivedNodes = summary.conformanceViolations.reduce(
    (sum, x) => sum + (waiverFor(x.id) ? x.nodes : 0),
    0,
  );
  const unresolved = (summary.incompleteConformance || []).reduce((s, x) => s + x.nodes, 0);
  const cov = summary.coverageByViewport || {};
  /**
   * THE PASS LINE CARRIES ITS CONDITIONS, and it names the unresolved count
   * rather than omitting it. "Measured clean" and "could not settle" are
   * different results and a pass line that mentions only the first is the same
   * silence-read-as-success this gate exists to refuse.
   */
  process.stdout.write(
    `a11y gate PASSED: ${summary.conformanceNodes - waivedNodes} unwaived conformance node(s), ${waivedNodes} waived, and ${unresolved} UNRESOLVED node(s) that axe could not settle and a human has adjudicated (adjudicated is not measured-clean). ` +
      `Over ${summary.surfacesOk}/${summary.surfacesScanned} scans = ${summary.surfaceCount} surfaces x ${summary.themes.length} themes x ${summary.viewports.length} viewports. ` +
      `${summary.titleFindings.length} title findings, ${summary.focusFindings.length} focus findings over ${summary.focusStopsWalked} keyboard stops at the ${summary.focusViewport} viewport. ` +
      `BOUND: ${VIEWPORT_IDS.map((id) => `${id} axe JUDGED ${cov[id]?.evaluated}/${cov[id]?.rendered} rendered text elements (${cov[id]?.pctEvaluated}%), of which ${cov[id]?.inViewport} (${cov[id]?.pct}%) were merely CONTAINED in the viewport box`).join("; ")}. ` +
      `JUDGED is axe's colour-contrast rules putting the element in a bucket, matched by identity; CONTAINED is its box intersecting the viewport box. The two are not the same number and the smaller one is the conformance bound. ` +
      `${auth.line}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
