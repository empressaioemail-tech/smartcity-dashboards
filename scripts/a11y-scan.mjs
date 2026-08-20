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
 * COUNTING RULES, stated here because this is where the numbers are read:
 *   SURFACE      one URL this product serves. A lens, a lens+tab, a work view,
 *                a work view+tab, or a pack chosen by cityKey.
 *   SCAN         one surface under one THEME. Both themes are scanned, so the
 *                denominator is surfaces x themes and every node count below is
 *                summed over that, never over surfaces alone.
 *   VIOLATION    one axe rule failing on at least one scan.
 *   NODES        the sum of failing DOM elements across all scans. One element
 *                failing on ten scans counts ten.
 *   CONFORMANCE  a rule carrying wcag2a / wcag2aa / wcag21a / wcag21aa. Anything
 *                else is best-practice and is NOT a conformance failure, though
 *                it is still reported.
 *   FOCUSABLE    an element reached by pressing Tab from the top of the
 *                document, up to a bounded number of presses.
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
  CONFORMANCE_TAGS,
  GATED_BEST_PRACTICE,
  REVIEW_ITEMS,
  WAIVERS,
  summarize,
  verdict,
  waivedTotal,
  waiverFor,
} from "../src/a11y-gate.mjs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
async function scanOnce(browser, base, target, axe, plant) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
    const painted = await page.evaluate(() => ({
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
    }));
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
    const title = await page.title();
    await page.addScriptTag({ content: axe.source });
    const axed = await page.evaluate(async (tags) => {
      const run = await window.axe.run(document, {
        resultTypes: ["violations", "incomplete"],
        runOnly: { type: "tag", values: [...tags, "best-practice"] },
      });
      const shape = (v) => ({
        id: v.id,
        impact: v.impact,
        tags: v.tags,
        help: v.help,
        nodes: v.nodes.length,
        sample: v.nodes.slice(0, 3).map((n) => String(n.target)),
        /**
         * WHY, not just WHERE. An unresolved check that names only its element
         * tells a reader it exists and nothing about what to do; axe already
         * knows the reason (bgOverlap, bgImage, fgAlpha and friends) and it was
         * being thrown away. Carried for incomplete results in particular,
         * because those are the ones nobody can reproduce from the element name.
         */
        reasons: [
          ...new Set(
            v.nodes.slice(0, 5).flatMap((n) =>
              [...(n.any || []), ...(n.all || []), ...(n.none || [])].map(
                (c) => c.data?.messageKey || c.message || c.id,
              ),
            ),
          ),
        ].filter(Boolean).slice(0, 4),
      });
      return { violations: run.violations.map(shape), incomplete: run.incomplete.map(shape) };
    }, CONFORMANCE_TAGS);
    const violations = axed.violations;
    const incomplete = axed.incomplete;
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll(".lens")]
        .filter((e) => getComputedStyle(e).display !== "none")
        .map((e) => e.id),
    );
    const walk = await tabWalk(page);
    return {
      ...target,
      ok: true,
      title,
      painted,
      visibleLens: visible,
      violations,
      incomplete,
      focus: walk.stops,
      focusNotes: walk.notes,
      focusCrossings: walk.crossings,
    };
  } catch (err) {
    return { ...target, ok: false, error: String(err).slice(0, 300) };
  } finally {
    await ctx.close();
  }
}

/**
 * Retried ONCE, and only once. A second consecutive failure is reported as a
 * failed scan and fails the build: an empty result is not an absence, and a
 * surface that would not load twice is a finding rather than a flake.
 */
async function scanSurface(browser, base, target, axe, plant) {
  const first = await scanOnce(browser, base, target, axe, plant);
  if (first.ok) return first;
  const second = await scanOnce(browser, base, target, axe, plant);
  if (second.ok) return { ...second, retried: first.error };
  return { ...second, error: `${second.error} (retried once; first attempt: ${first.error})` };
}

function report(summary, out = process.stdout) {
  const w = (s) => out.write(s + "\n");
  w("");
  w(`a11y gate  axe-core ${summary.axeVersion}  ${summary.base}`);
  w(`counting rule: ${summary.countingRule}`);
  if (summary.retriedScans.length) {
    w(`RETRIED (first attempt did not paint, second did): ${summary.retriedScans.length}`);
    for (const r of summary.retriedScans) w(`  ${r.surface}: ${r.reason}`);
  }
  w(`scans ${summary.surfacesOk}/${summary.surfacesScanned}  (${summary.surfaceCount} surfaces x ${summary.themes.length} themes: ${summary.themes.join(", ")})`);
  w(
    `theme lever: ${summary.themeLeverFinding ? "DID NOT MOVE - " + summary.themeLeverFinding : "proven, the palette differs between themes"}`,
  );
  w(`conformance nodes by theme: ${Object.entries(summary.conformanceNodesByTheme).map(([t, n]) => `${t} ${n}`).join(", ")}`);
  for (const wit of summary.witnesses) w(`witness [${wit.theme}] ${JSON.stringify(wit.witness)}`);
  w("");
  w(`CONFORMANCE (WCAG A/AA) rules failing: ${summary.conformanceViolations.length}, nodes: ${summary.conformanceNodes}`);
  for (const v of summary.conformanceViolations) {
    const waived = waiverFor(v.id);
    w(
      `  ${v.id.padEnd(30)} ${String(v.nodes).padStart(4)} nodes  ${v.impact}  [${v.tags.join(" ")}]${
        waived
          ? `  WAIVED ceiling ${JSON.stringify(waived.nodesByTheme)} (total ${waivedTotal(waived)}), owner ${waived.owner}`
          : ""
      }`,
    );
    w(`      on: ${[...new Set(v.surfaces)].join(", ")}`);
    if (waived) w(`      remove when: ${waived.remove}`);
  }
  w(
    `UNRESOLVED conformance checks (axe could not settle these; not a pass): ${summary.incompleteConformance.length} rule(s), ${summary.incompleteConformance.reduce((n, x) => n + x.nodes, 0)} node(s)`,
  );
  for (const inc of summary.incompleteConformance) {
    const item = REVIEW_ITEMS.find((r) => r.rule === inc.id && inc.reasons.includes(r.reason));
    w(
      `  ${inc.id.padEnd(30)} ${String(inc.nodes).padStart(4)} nodes  sample ${JSON.stringify(inc.sample)}  reason ${JSON.stringify(inc.reasons)}${
        item ? "  ADJUDICATED" : "  NOT ADJUDICATED"
      }`,
    );
    w(`      on: ${[...new Set(inc.surfaces)].slice(0, 6).join(", ")}${inc.surfaces.length > 6 ? " ..." : ""}`);
    if (item) {
      w(`      ${item.adjudication}`);
      w(`      routed to: ${item.routedTo}`);
      w(`      remove when: ${item.remove}`);
    }
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
  w("per scan  (conformance nodes | focus stops | stops with no indicator | title)");
  for (const s of summary.perSurface) {
    w(
      `  ${s.surface.padEnd(48)} ${String(s.conformanceNodes ?? "ERR").padStart(4)} | ${String(
        s.focusStops ?? "-",
      ).padStart(3)} | ${String(s.focusWithoutIndicator ?? "-").padStart(3)} | ${s.title ?? s.url}`,
    );
  }
  w("");
}

/* -------------------------------------------------------------------- main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const axe = axeSource();
  /** Surfaces x themes, both derived. Neither list is written down here. */
  const targets = THEMES.flatMap((theme) =>
    A11Y_TARGETS.map((t) => ({ ...t, theme, expectedTitle: expectedTitle(t) })),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchChromium();
  let results = [];
  try {
    for (const t of targets) {
      results.push(await scanSurface(browser, base, t, axe, args.plant));
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const summary = summarize(results, axe, base);
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
  for (const line of v.stale) process.stdout.write(`a11y gate STALE WAIVER: ${line}\n`);
  if (!v.pass) {
    process.stderr.write(`a11y gate FAILED: ${v.reasons.join("; ")}\n`);
    process.exit(1);
  }
  const waivedNodes = summary.conformanceViolations.reduce(
    (sum, x) => sum + (waiverFor(x.id) ? x.nodes : 0),
    0,
  );
  process.stdout.write(
    `a11y gate PASSED: ${summary.conformanceNodes - waivedNodes} unwaived conformance node(s) and ${waivedNodes} waived over ${summary.surfacesOk} surfaces, ${summary.titleFindings.length} title findings, ${summary.focusFindings.length} focus findings over ${summary.focusStopsWalked} keyboard stops\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
