// G-95. The accessibility gate, proven able to FAIL, on a bare Node image.
//
// WHY THIS FILE EXISTS AND WHY IT IS NOT IN scripts/.
// The gate that refuses a build lives in scripts/a11y-scan.mjs and needs a real
// Chromium, so it runs as its own CI job. If the proof that it can fail lived
// there too, that proof would run only when the browser job ran - and a control
// nobody has watched fail is not a control (DEV_PROCESS 2.2). So the pure half
// is src/a11y-gate.mjs and every firing arm is here, on `npm test`, which is
// `node --test src/*.test.mjs` on a bare Node image with no browser at all.
//
// WHAT IS PROVEN HERE: that the surface list is DERIVED rather than written
// down, that the verdict refuses each class it claims to refuse, that the one
// waiver is a ratchet rather than amnesty, and that the CI job which carries all
// of it is actually wired and cannot skip.
//
// WHAT IS NOT PROVEN HERE: that axe finds anything. That needs a browser and is
// proven by running scripts/a11y-scan.mjs --plant <class> against the real
// surfaces, recorded with its raw output in the G-95 close artifact.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES } from "./theme.mjs";
import { ALL_LENS_IDS, WORK_IDS, DS_TABS, ASSET_TABS } from "./staff-review.mjs";
import {
  A11Y_TARGETS,
  BASELINE_SURFACES,
  EXCLUDED_PACKS,
  SCANNED_PACKS,
  expectedTitle,
} from "./a11y-surfaces.mjs";
import { CONFORMANCE_TAGS, WAIVERS, summarize, verdict, waivedTotal } from "./a11y-gate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

/* ------------------------------------------------------------- the surfaces */

describe("G-95 the scanned surface list is derived, not written down", () => {
  it("expands every lens and every work view, tabs included", () => {
    /**
     * Counting rule, stated where the number is read: one target per served URL
     * a person can navigate to. development-services expands over its six tabs
     * and assets over its three, because each tab is a real anchor with an href
     * and is therefore its own page under 2.4.2 - which is exactly the reading
     * that turned a 16-surface baseline into a 23-surface denominator.
     */
    const expected =
      ALL_LENS_IDS.length - 1 + DS_TABS.length + (WORK_IDS.length - 1) + ASSET_TABS.length + SCANNED_PACKS.length;
    assert.equal(A11Y_TARGETS.length, expected);
    assert.equal(A11Y_TARGETS.length, 23);

    const surfaces = A11Y_TARGETS.map((t) => t.surface);
    for (const lens of ALL_LENS_IDS) {
      const hits = surfaces.filter((s) => s === `lens-${lens}` || s.startsWith(`lens-${lens}-`));
      assert.ok(hits.length > 0, `${lens} is on the roster and is not scanned`);
    }
    for (const work of WORK_IDS) {
      const hits = surfaces.filter((s) => s === `work-${work}` || s.startsWith(`work-${work}-`));
      assert.ok(hits.length > 0, `${work} is a work view and is not scanned`);
    }
    for (const tab of DS_TABS) assert.ok(surfaces.includes(`lens-development-services-${tab}`));
    for (const atab of ASSET_TABS) assert.ok(surfaces.includes(`work-assets-${atab}`));
    assert.equal(new Set(surfaces).size, surfaces.length, "a surface is scanned twice");
  });

  it("keeps the baseline's sixteen as a named subset, so the figures stay comparable", () => {
    /**
     * The pre-fix baseline was taken over nine lenses, six work views and
     * empty-city. Reporting an after-figure against a different denominator
     * would be a coverage number escaping its counting rule (DEV_PROCESS 1.1),
     * so the subset is derived and named rather than remembered.
     */
    assert.equal(BASELINE_SURFACES.length, 16);
    const surfaces = new Set(A11Y_TARGETS.map((t) => t.surface));
    for (const s of BASELINE_SURFACES) assert.ok(surfaces.has(s), `${s} is not a scanned surface`);
  });

  it("states what it does NOT scan, with a basis", () => {
    // An unmentioned exclusion is the failure state; "out of scope" is a valid
    // and required classification (DEV_PROCESS 3.3).
    assert.ok(EXCLUDED_PACKS.length > 0);
    for (const p of EXCLUDED_PACKS) {
      assert.ok(p.cityKey, "an exclusion with no subject");
      assert.match(p.basis, /\S/, `${p.cityKey} is excluded with no basis`);
    }
    assert.ok(EXCLUDED_PACKS.some((p) => p.cityKey === "fixture-city"));
  });

  it("gives every surface a title of its own", () => {
    const titles = A11Y_TARGETS.map((t) => expectedTitle(t));
    const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
    assert.deepEqual(dupes, [], `${new Set(titles).size} distinct titles over ${titles.length} surfaces`);
  });
});

/* --------------------------------------------------------------- the fixtures */

const AXE = { version: "test" };

function scan(surface, theme, over = {}) {
  return {
    surface,
    url: `/?surface=${surface}`,
    theme,
    ok: true,
    title: `${surface} title`,
    expectedTitle: `${surface} title`,
    painted: { theme, canvas: theme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)", sheets: 2 },
    visibleLens: [surface],
    violations: [],
    focus: [{ selector: "#a", tag: "button", indicator: true, outline: "solid 2px", boxShadow: "none" }],
    focusNotes: [],
    focusCrossings: [],
    ...over,
  };
}

const contrast = (nodes) => ({
  id: "color-contrast",
  impact: "serious",
  tags: ["cat.color", "wcag2aa", "wcag143"],
  help: "elements must meet minimum contrast",
  nodes,
  sample: [".badge"],
});

/** A clean run carrying exactly the waived contrast figure, split per theme. */
function cleanResults() {
  const w = WAIVERS.find((x) => x.rule === "color-contrast");
  return THEMES.map((theme) => scan("s1", theme, { violations: [contrast(w.nodesByTheme[theme])] }));
}

const judge = (results) => verdict(summarize(results, AXE, "http://test"));

/* --------------------------------------------------------------- the verdict */

describe("G-95 the gate is proven able to fire", () => {
  it("passes the clean run, so a failure below means something", () => {
    const v = judge(cleanResults());
    assert.equal(v.pass, true, v.reasons.join("; "));
    assert.deepEqual(v.stale, []);
  });

  it("fires on any conformance rule that carries no waiver", () => {
    const results = cleanResults();
    results[0].violations.push({
      id: "button-name",
      impact: "critical",
      tags: ["wcag2a", "wcag412"],
      help: "buttons must have discernible text",
      nodes: 1,
      sample: ["button"],
    });
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("button-name") && r.includes("no waiver")), v.reasons.join("; "));
  });

  it("does NOT fire on a best-practice rule, which is not a conformance failure", () => {
    const results = cleanResults();
    results[0].violations.push({
      id: "region",
      impact: "moderate",
      tags: ["cat.keyboard", "best-practice"],
      help: "all page content should be contained by landmarks",
      nodes: 4,
      sample: ["div"],
    });
    const v = judge(results);
    assert.equal(v.pass, true, v.reasons.join("; "));
    // and it is still REPORTED rather than dropped
    const s = summarize(results, AXE, "http://test");
    assert.equal(s.bestPracticeViolations.length, 1);
    assert.equal(s.bestPracticeViolations[0].nodes, 4);
  });

  it("fires when a waived rule goes ABOVE its ceiling, on either theme alone", () => {
    for (const theme of THEMES) {
      const w = WAIVERS.find((x) => x.rule === "color-contrast");
      const results = THEMES.map((t) =>
        scan("s1", t, { violations: [contrast(w.nodesByTheme[t] + (t === theme ? 1 : 0))] }),
      );
      const v = judge(results);
      assert.equal(v.pass, false, `${theme} went up by one and the gate passed`);
      assert.ok(
        v.reasons.some((r) => r.includes(`[${theme}]`) && r.includes("ceiling")),
        `${theme}: ${v.reasons.join("; ")}`,
      );
    }
  });

  it("fires on COMPENSATING drift, which is the whole reason the pin is per theme", () => {
    /**
     * Dark regresses by ten, light improves by ten, the total is unchanged. A
     * waiver pinned as one number passes this and a real customer-facing
     * regression ships under a figure that did not move. Two pins cannot be
     * compensated against each other.
     */
    const w = WAIVERS.find((x) => x.rule === "color-contrast");
    const results = [
      scan("s1", "light", { violations: [contrast(w.nodesByTheme.light - 10)] }),
      scan("s1", "dark", { violations: [contrast(w.nodesByTheme.dark + 10)] }),
    ];
    const before = waivedTotal(w);
    assert.equal(w.nodesByTheme.light - 10 + (w.nodesByTheme.dark + 10), before, "the totals must match, or this arm proves nothing");
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("[dark]") && r.includes("ceiling")), v.reasons.join("; "));
  });

  it("passes but says STALE when a waived rule improves, so the waiver cannot rot quietly", () => {
    const w = WAIVERS.find((x) => x.rule === "color-contrast");
    const results = THEMES.map((t) => scan("s1", t, { violations: [contrast(w.nodesByTheme[t] - 1)] }));
    const v = judge(results);
    assert.equal(v.pass, true, v.reasons.join("; "));
    assert.equal(v.stale.length, THEMES.length);
    for (const line of v.stale) assert.match(line, /below the waived|re-pin/);
  });

  it("fires when a waived rule reaches zero, because the exception has outlived its reason", () => {
    const results = THEMES.map((t) => scan("s1", t));
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(
      v.reasons.some((r) => r.includes("color-contrast") && r.includes("delete its entry")),
      v.reasons.join("; "),
    );
  });

  it("fires on a shared title, which is the 2.4.2 defect this card was opened for", () => {
    const w = WAIVERS.find((x) => x.rule === "color-contrast");
    const results = [
      ...THEMES.map((t) => scan("s1", t, { violations: [contrast(w.nodesByTheme[t])] })),
      ...THEMES.map((t) => scan("s2", t, { title: "s1 title", expectedTitle: "s1 title" })),
    ];
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("2.4.2")), v.reasons.join("; "));
    const s = summarize(results, AXE, "http://test");
    assert.ok(s.titleFindings.some((f) => f.kind === "duplicate" && f.detail.includes("s1 title")));
  });

  it("fires on a title that depends on the palette, which nothing else would notice", () => {
    const results = cleanResults();
    results[1].title = "a different title in dark";
    const s = summarize(results, AXE, "http://test");
    assert.ok(s.titleFindings.some((f) => f.kind === "theme-dependent"), JSON.stringify(s.titleFindings));
    assert.equal(judge(results).pass, false);
  });

  it("fires on a keyboard stop that paints nothing", () => {
    const results = cleanResults();
    results[0].focus = [
      { selector: "#menu-btn", tag: "button", indicator: false, outline: "none 0px", boxShadow: "none" },
    ];
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("2.4.7")), v.reasons.join("; "));
  });

  it("fires on a scan that did not run, because an unmeasured surface is not a clean one", () => {
    const results = [...cleanResults(), { surface: "s9", theme: "light", ok: false, error: "theme did not land" }];
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("did not run")), v.reasons.join("; "));
  });

  it("fires when the theme lever did not move, which is a scan of one palette twice", () => {
    /**
     * The failure the sibling lane hit and the reason this arm exists: emulating
     * prefers-color-scheme does not move this product, because web/index.html
     * ships data-theme on <html> statically and an explicit attribute beats the
     * media query. A run like that returns an identical figure for both themes
     * and looks exactly like coverage.
     */
    const w = WAIVERS.find((x) => x.rule === "color-contrast");
    const results = THEMES.map((t) =>
      scan("s1", t, {
        violations: [contrast(w.nodesByTheme[t])],
        painted: { theme: t, canvas: "rgb(12, 17, 22)", sheets: 2 },
      }),
    );
    const s = summarize(results, AXE, "http://test");
    assert.match(s.themeLeverFinding, /did not move|identically/);
    assert.equal(verdict(s).pass, false);
  });

  it("counts every theme in the denominator and says so where the number is read", () => {
    const s = summarize(cleanResults(), AXE, "http://test");
    assert.equal(s.surfacesScanned, THEMES.length);
    assert.equal(s.surfaceCount, 1);
    assert.match(s.countingRule, /surfaces x \d+ themes/);
    assert.deepEqual(Object.keys(s.conformanceNodesByTheme).sort(), [...THEMES].sort());
  });
});

/* ------------------------------------------------------------- the wiring */

describe("G-95 the gate is wired and cannot skip", () => {
  it("runs as its own required CI job that installs the browser it needs", () => {
    /**
     * A guardrail that does not survive a clone is not a guardrail
     * (DEV_PROCESS 6.1), and a gate nobody invokes is the same thing wearing a
     * different costume. The workflow is read rather than assumed.
     */
    const ci = read(".github/workflows/ci.yml");
    assert.match(ci, /^\s{2}a11y:$/m, "the a11y job is gone from the workflow");
    assert.match(ci, /playwright-core install --with-deps chromium/);
    assert.match(ci, /npm run test:a11y/);
    assert.equal(/continue-on-error/.test(ci), false, "a gate that cannot fail the build is not a gate");
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.scripts["test:a11y"], "node scripts/a11y-scan.mjs");
    for (const dep of ["axe-core", "playwright-core"]) {
      assert.ok(pkg.devDependencies?.[dep], `${dep} is not a dependency, so a fresh clone cannot run the gate`);
    }
    /**
     * playwright rather than playwright-core would download a browser on every
     * npm install, including the ordinary test job's. The choice is asserted so
     * it is not undone as a tidy-up.
     */
    assert.equal(Boolean(pkg.devDependencies?.playwright), false);
  });

  it("reads axe from the dependency, not from a path on one machine", () => {
    const scanSrc = read("scripts/a11y-scan.mjs");
    assert.match(scanSrc, /require\.resolve\("axe-core\/axe\.min\.js"\)/);
    // The scanner this one replaced read P:/tmp/VPAT/axe.min.js. An absolute
    // path anywhere in this file is the same guardrail failing to survive a clone.
    /**
     * A DRIVE LETTER IS ONE LETTER, so the lookbehind is load bearing: without
     * it "http://127.0.0.1" matches at "p://" and this arm goes red on the
     * scanner's own local server URL, which is the opposite of what it guards.
     */
    const paths = scanSrc.replace(/^ \*.*$/gm, "").match(/(?<![A-Za-z])[A-Za-z]:[/\\][^"'`\s)]+/g) || [];
    assert.deepEqual(paths, [], `absolute paths in the scanner: ${JSON.stringify(paths)}`);
  });

  it("has no path on which a missing browser reads as a pass", () => {
    const scanSrc = read("scripts/a11y-scan.mjs");
    // The launch failure calls fail(), and fail() exits 2. Both are asserted,
    // because either one alone could be true while the other silently returned.
    assert.match(scanSrc, /catch \(err\) \{\s*fail\(/);
    assert.match(scanSrc, /function fail\(message\) \{[\s\S]*?process\.exit\(2\)/);
    assert.equal(/process\.exit\(0\)/.test(scanSrc), false, "an explicit success exit could bypass the verdict");
    assert.equal(/\.skip\(|todo:|context\.skip/.test(scanSrc), false);
  });

  it("carries a plant for every class it refuses a build on", async () => {
    const { PLANTS } = await import("../scripts/a11y-scan.mjs");
    for (const [id, plant] of Object.entries(PLANTS)) {
      assert.equal(typeof plant.apply, "function", `${id} has no plant`);
      assert.match(plant.what, /\S/, `${id} does not say what it plants`);
    }
    // One per refusal class: an axe conformance rule, the waived rule's
    // ceiling, the 2.4.2 check and the 2.4.7 check.
    for (const id of ["button-name", "color-contrast", "page-title", "focus-indicator"]) {
      assert.ok(PLANTS[id], `${id} has no plant, so that refusal class has never been watched firing`);
    }
  });

  it("keeps the one waiver honest about who owns it and when it goes", () => {
    for (const w of WAIVERS) {
      assert.match(w.rule, /\S/);
      assert.deepEqual(Object.keys(w.nodesByTheme).sort(), [...THEMES].sort(), `${w.rule} is not pinned per theme`);
      assert.match(w.owner, /\S/, `${w.rule} is waived and nobody owns it`);
      assert.match(w.basis, /\S/, `${w.rule} is waived with no basis`);
      assert.match(w.remove, /\S/, `${w.rule} has no removal condition, which is amnesty`);
      assert.match(w.countingRule, /\S/, `${w.rule} pins a number with no counting rule`);
    }
    assert.deepEqual(
      WAIVERS.map((w) => w.rule),
      ["color-contrast"],
      "a second waiver is a decision, not a detail",
    );
  });

  it("classifies conformance by the rule's own tags rather than by a list of rule ids", () => {
    assert.deepEqual(CONFORMANCE_TAGS, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  });
});
