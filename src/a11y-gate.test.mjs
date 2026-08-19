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
import {
  CONFORMANCE_TAGS,
  GATED_BEST_PRACTICE,
  REVIEW_ITEMS,
  WAIVERS,
  summarize,
  verdict,
  waivedTotal,
} from "./a11y-gate.mjs";

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

/**
 * A FIXTURE WAIVER, not the live ledger.
 *
 * The live WAIVERS is empty: G-95's one entry was deleted the moment its cause
 * landed, which is what its own ratchet demanded. Testing the mechanism against
 * the live ledger would therefore have deleted the firing proofs along with the
 * entry - the arms would have had nothing to exercise and would have been
 * quietly dropped or rewritten to assert emptiness. A control that disappears
 * when the thing it guards is temporarily absent is not a control, so every arm
 * below drives verdict() with this fixture and the live ledger is asserted
 * separately.
 */
const TEST_WAIVER = {
  rule: "color-contrast",
  nodesByTheme: { light: 40, dark: 12 },
  countingRule: "fixture: failing DOM elements per theme",
  owner: "a fixture, owned by nobody",
  basis: "a fixture, so the ratchet has something to ratchet",
  remove: "never; this entry exists only inside this test file",
};
const TEST_WAIVERS = [TEST_WAIVER];

/** A clean run carrying exactly the waived contrast figure, split per theme. */
function cleanResults() {
  return THEMES.map((theme) =>
    scan("s1", theme, { violations: [contrast(TEST_WAIVER.nodesByTheme[theme])] }),
  );
}

/**
 * Arms drive the verdict with FIXTURE ledgers, never the live ones, for the
 * reason the fixture waiver exists: a firing proof that reads the live ledger
 * disappears the moment that ledger is emptied, and both of this repo's ledgers
 * are meant to be emptied when their causes go. The live ones get their own
 * arms.
 */
const judge = (results, waivers = TEST_WAIVERS, reviewItems = []) =>
  verdict(summarize(results, AXE, "http://test"), waivers, reviewItems);

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

  it("does NOT fire on an unadopted best-practice rule, but still reports it", () => {
    const results = cleanResults();
    results[0].violations.push({
      id: "region",
      impact: "moderate",
      tags: ["cat.keyboard", "best-practice"],
      help: "all page content should be contained by landmarks",
      nodes: 4,
      sample: ["div"],
    });
    assert.equal(GATED_BEST_PRACTICE.region, undefined, "this arm needs a rule the gate has NOT adopted");
    const v = judge(results);
    assert.equal(v.pass, true, v.reasons.join("; "));
    // and it is still REPORTED rather than dropped
    const s = summarize(results, AXE, "http://test");
    assert.equal(s.bestPracticeViolations.length, 1);
    assert.equal(s.bestPracticeViolations[0].nodes, 4);
  });

  it("DOES fire on a best-practice rule it has adopted by name, with its criterion", () => {
    /**
     * The discrimination, and it was bought by a defect. heading-order carries
     * no wcag tag, so the verdict ignored it - and G-95 had just taken it from
     * 15 nodes to zero. A fix with no gate rots, and the plant for it would have
     * reported the gate passing while the gate did exactly what it said.
     */
    assert.ok(GATED_BEST_PRACTICE["heading-order"], "heading-order is fixed to zero and must be gated");
    assert.match(GATED_BEST_PRACTICE["heading-order"], /1\.3\.1|2\.4\.6/, "an adopted rule states the criterion it answers");
    const results = cleanResults();
    results[0].violations.push({
      id: "heading-order",
      impact: "moderate",
      tags: ["cat.semantics", "best-practice"],
      help: "heading levels should only increase by one",
      nodes: 1,
      sample: ["h5"],
    });
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("heading-order")), v.reasons.join("; "));
  });

  it("fires when a waived rule goes ABOVE its ceiling, on either theme alone", () => {
    for (const theme of THEMES) {
      const results = THEMES.map((t) =>
        scan("s1", t, {
          violations: [contrast(TEST_WAIVER.nodesByTheme[t] + (t === theme ? 1 : 0))],
        }),
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
    const results = [
      scan("s1", "light", { violations: [contrast(TEST_WAIVER.nodesByTheme.light - 10)] }),
      scan("s1", "dark", { violations: [contrast(TEST_WAIVER.nodesByTheme.dark + 10)] }),
    ];
    assert.equal(
      TEST_WAIVER.nodesByTheme.light - 10 + (TEST_WAIVER.nodesByTheme.dark + 10),
      waivedTotal(TEST_WAIVER),
      "the totals must match, or this arm proves nothing",
    );
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("[dark]") && r.includes("ceiling")), v.reasons.join("; "));
  });

  it("passes but says STALE when a waived rule improves, so the waiver cannot rot quietly", () => {
    const results = THEMES.map((t) =>
      scan("s1", t, { violations: [contrast(TEST_WAIVER.nodesByTheme[t] - 1)] }),
    );
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

  it("fires when axe could not SETTLE a conformance check, which is not a pass", () => {
    /**
     * The class the first CI run of this gate found. axe returned nothing for
     * color-contrast over all 46 scans - zero violations - while the same commit
     * returned 1002 locally, because the check landed in the incomplete bucket
     * this scanner was not reading. A gate that answers "clean" because it could
     * not measure is the quietest failure it can have.
     */
    const results = cleanResults();
    results[0].incomplete = [
      {
        id: "color-contrast",
        impact: "serious",
        tags: ["cat.color", "wcag2aa", "wcag143"],
        help: "elements must meet minimum contrast",
        nodes: 37,
        sample: [".badge"],
      },
      {
        id: "region",
        impact: "moderate",
        tags: ["cat.keyboard", "best-practice"],
        help: "best practice, not conformance",
        nodes: 5,
        sample: ["div"],
      },
    ];
    const s = summarize(results, AXE, "http://test");
    // Only the conformance one counts. A best-practice incomplete is not a
    // conformance failure, and merging them would make this gate cry wolf.
    assert.deepEqual(s.incompleteConformance.map((x) => [x.id, x.nodes]), [["color-contrast", 37]]);
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("could NOT SETTLE")), v.reasons.join("; "));
  });

  it("accepts an unresolved check that has been ADJUDICATED, and only at its pinned count", () => {
    /**
     * axe's incomplete bucket is a needs-review, and wave 3 already has a home
     * for those. So the contract splits rather than choosing between "fail
     * forever" and "ignore": an unresolved check fails unless a human has
     * adjudicated it BY RULE AND BY REASON, and the adjudication is a ratchet on
     * the same terms as a waiver.
     */
    const item = {
      rule: "color-contrast",
      reason: "elmPartiallyObscuring",
      element: "#fixture",
      surfaces: ["s1"],
      nodesByTheme: { light: 1, dark: 1 },
      countingRule: "fixture",
      owner: "a fixture",
      adjudication: "fixture adjudication",
      basis: "fixture basis",
      remove: "never; this entry exists only inside this test file",
      routedTo: "nowhere; fixture",
    };
    const incomplete = (reason, nodes) => [
      {
        id: "color-contrast",
        impact: "serious",
        tags: ["cat.color", "wcag2aa"],
        help: "contrast",
        nodes,
        sample: ["#fixture"],
        reasons: [reason],
      },
    ];
    const at = THEMES.map((t) => scan("s1", t, { incomplete: incomplete("elmPartiallyObscuring", 1) }));
    assert.equal(judge(at, [], [item]).pass, true, "the adjudicated count must pass");

    const above = THEMES.map((t) => scan("s1", t, { incomplete: incomplete("elmPartiallyObscuring", 2) }));
    const vAbove = judge(above, [], [item]);
    assert.equal(vAbove.pass, false, "more nodes than were adjudicated must fail");
    assert.ok(vAbove.reasons.some((r) => r.includes("ceiling, not permission")), vAbove.reasons.join("; "));

    // A DIFFERENT reason is a different finding and is not covered.
    const other = THEMES.map((t) => scan("s1", t, { incomplete: incomplete("bgImage", 1) }));
    const vOther = judge(other, [], [item]);
    assert.equal(vOther.pass, false, "an unadjudicated reason must fail");
    assert.ok(vOther.reasons.some((r) => r.includes("no adjudication covers")), vOther.reasons.join("; "));

    // And an adjudication cannot outlive its subject.
    const none = THEMES.map((t) => scan("s1", t));
    const vNone = judge(none, [], [item]);
    assert.equal(vNone.pass, false);
    assert.ok(vNone.reasons.some((r) => r.includes("delete its entry from REVIEW_ITEMS")), vNone.reasons.join("; "));
  });

  it("holds the LIVE adjudications to a shape that makes them readable by a stranger", () => {
    for (const r of REVIEW_ITEMS) {
      assert.match(r.rule, /\S/);
      assert.match(r.reason, /\S/, `${r.rule} is adjudicated without naming the reason axe gave`);
      assert.deepEqual(Object.keys(r.nodesByTheme).sort(), [...THEMES].sort(), `${r.rule} is not pinned per theme`);
      assert.match(r.owner, /\S/, `${r.rule} is adjudicated and nobody owns it`);
      assert.match(r.adjudication, /\S/, `${r.rule} has no adjudication, only a pin`);
      assert.match(r.basis, /\S/, `${r.rule} is adjudicated with no basis`);
      assert.match(r.remove, /\S/, `${r.rule} has no removal condition, which is amnesty`);
      assert.match(r.routedTo, /\S/, `${r.rule} is not routed anywhere, so no human will ever see it`);
    }
  });

  it("fires on a shared title, which is the 2.4.2 defect this card was opened for", () => {
    const results = [
      ...THEMES.map((t) => scan("s1", t, { violations: [contrast(TEST_WAIVER.nodesByTheme[t])] })),
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
    const results = THEMES.map((t) =>
      scan("s1", t, {
        violations: [contrast(TEST_WAIVER.nodesByTheme[t])],
        painted: { theme: t, canvas: "rgb(12, 17, 22)", sheets: 2 },
      }),
    );
    const s = summarize(results, AXE, "http://test");
    assert.match(s.themeLeverFinding, /did not move|identically/);
    assert.equal(verdict(s, TEST_WAIVERS, []).pass, false);
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
    assert.match(ci, /playwright-core install (--with-deps )?chromium/, "the job no longer installs the browser it needs");
    assert.match(ci, /npm run test:a11y/);
    assert.equal(/continue-on-error/.test(ci), false, "a gate that cannot fail the build is not a gate");
    /**
     * A HUNG GATE MUST FAIL, not burn an hour looking like it is working. The
     * install step ran in 21 seconds once and then hung past twenty minutes
     * twice while it still shelled out to apt-get through --with-deps; the
     * timeout is the backstop that makes that a red build rather than a wait.
     */
    assert.match(ci, /timeout-minutes: \d+/, "the a11y job has no timeout, so a hang looks like work in progress");
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
    for (const id of [
      "button-name",
      "color-contrast",
      "page-title",
      "focus-indicator",
      "unresolved-contrast",
      "heading-order",
    ]) {
      assert.ok(PLANTS[id], `${id} has no plant, so that refusal class has never been watched firing`);
    }
    /**
     * AND THE CONVERSE, which is the check that found a real defect: a plant for
     * a rule the verdict does not refuse on is a plant that can only ever report
     * the gate passing. Every planted axe RULE must be one this gate actually
     * gates - either by carrying a conformance tag, or by being adopted by name.
     */
    const axeRulePlants = ["heading-order", "color-contrast", "button-name", "image-alt", "scrollable-region-focusable"];
    for (const id of axeRulePlants) {
      const conformance = !["heading-order"].includes(id);
      assert.ok(
        conformance || GATED_BEST_PRACTICE[id],
        `${id} is planted but the verdict does not refuse on it, so its plant can only ever report a pass`,
      );
    }
  });

  it("holds the LIVE ledger to the same shape, and it is currently empty", () => {
    /**
     * G-95's one entry was deleted the moment its cause landed in the kit, which
     * is exactly what its ratchet demanded. The shape check stays and applies to
     * whatever the next lane puts here: a waiver carries five things or it is
     * amnesty, and it is pinned PER THEME so a dark regression cannot hide
     * behind a light improvement.
     */
    for (const w of WAIVERS) {
      assert.match(w.rule, /\S/);
      assert.deepEqual(Object.keys(w.nodesByTheme).sort(), [...THEMES].sort(), `${w.rule} is not pinned per theme`);
      assert.match(w.owner, /\S/, `${w.rule} is waived and nobody owns it`);
      assert.match(w.basis, /\S/, `${w.rule} is waived with no basis`);
      assert.match(w.remove, /\S/, `${w.rule} has no removal condition, which is amnesty`);
      assert.match(w.countingRule, /\S/, `${w.rule} pins a number with no counting rule`);
    }
    assert.deepEqual(WAIVERS, [], "a waiver is a decision, not a detail; adding one is a deliberate act");
    /**
     * And with an empty ledger the gate is at ZERO TOLERANCE, which is the
     * assertion that actually matters here: every conformance node fails.
     */
    const results = THEMES.map((t) => scan("s1", t, { violations: [contrast(1)] }));
    const v = verdict(summarize(results, AXE, "http://test"), WAIVERS, []);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("no waiver")), v.reasons.join("; "));
  });

  it("classifies conformance by the rule's own tags rather than by a list of rule ids", () => {
    assert.deepEqual(CONFORMANCE_TAGS, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  });
});
