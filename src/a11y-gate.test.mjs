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
  ADJUDICATION_DRIFT_TOLERANCE,
  ARMS,
  AUTHORITATIVE,
  CONFORMANCE_TAGS,
  FULL_EXTENT_VIEWPORT,
  GATED_BEST_PRACTICE,
  GEOMETRY_DEPENDENT_REASONS,
  REFERENCE_VIEWPORT,
  REVIEW_ITEMS,
  VIEWPORTS,
  VIEWPORT_IDS,
  WAIVERS,
  armId,
  authorityOf,
  independentContrastFindings,
  isSubjectBounded,
  requiredRatio,
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

/**
 * A fixture scan is now a surface x a THEME x a VIEWPORT (G-99). The viewport
 * defaults to the reference one so every arm written before G-99 keeps meaning
 * what it meant, and the arms that are ABOUT the viewport pass it explicitly.
 *
 * coverage and typeface default to the clean state - fully covered, the shipped
 * face rendering - because an arm about waivers must not fail for a reason it is
 * not testing. The arms that are about coverage and typeface set them.
 */
function scan(surface, theme, over = {}) {
  const viewport = over.viewport || REFERENCE_VIEWPORT.id;
  return {
    surface,
    url: `/?surface=${surface}`,
    theme,
    viewport,
    ok: true,
    title: `${surface} title`,
    expectedTitle: `${surface} title`,
    painted: {
      theme,
      canvas: theme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)",
      sheets: 2,
      geometry: { dpr: 1, navHiddenPx: 80, navFootTop: 619, navFootHeight: 281, provHeight: 256, overlapPx: 79 },
    },
    coverage: {
      height: viewport === REFERENCE_VIEWPORT.id ? 900 : 2400,
      rendered: 100,
      inViewport: viewport === REFERENCE_VIEWPORT.id ? 72 : 100,
      outside: viewport === REFERENCE_VIEWPORT.id ? 28 : 0,
      overflowBelow: 0,
      steps: 0,
      stoppedBecause: "fixture",
    },
    typeface: { ui: "shipped", data: "shipped", uiWidth: 228.33, namedUiWidth: 228.33, dataWidth: 277.2, namedDataWidth: 277.2 },
    visibleLens: [surface],
    violations: [],
    incomplete: [],
    focus: [{ selector: "#a", tag: "button", indicator: true, outline: "solid 2px", boxShadow: "none" }],
    focusNotes: [],
    focusCrossings: [],
    ...over,
  };
}

/** Every arm of the scan matrix for one surface: two themes x two viewports. */
function allArms(surface, over = () => ({})) {
  return THEMES.flatMap((theme) =>
    VIEWPORT_IDS.map((viewport) => scan(surface, theme, { viewport, ...over(theme, viewport) })),
  );
}

const contrast = (nodes, targets = null) => ({
  id: "color-contrast",
  impact: "serious",
  tags: ["cat.color", "wcag2aa", "wcag143"],
  help: "elements must meet minimum contrast",
  nodes,
  sample: [".badge"],
  targets: targets || Array.from({ length: nodes }, (_, i) => `.badge:nth-child(${i + 1})`),
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
  /**
   * PINNED EQUAL ACROSS VIEWPORTS, and the first draft was not - it pinned the
   * reference arms at 40/12 and the full-extent arms at 0, which is a state the
   * product cannot be in: an element failing above the fold still fails below
   * it. supersetFindings() refused the fixture on its first run. The fixture was
   * wrong and the assertion was right, which is the cheapest possible proof that
   * the assertion works.
   */
  nodesByArm: {
    "light@reference": 40,
    "light@full-extent": 40,
    "dark@reference": 12,
    "dark@full-extent": 12,
  },
  countingRule: "fixture: failing DOM elements per arm, an arm being one theme at one viewport",
  owner: "a fixture, owned by nobody",
  basis: "a fixture, so the ratchet has something to ratchet",
  remove: "never; this entry exists only inside this test file",
};
const TEST_WAIVERS = [TEST_WAIVER];
/** The fixture pin for one arm, so an arm reads its own ceiling rather than
 *  restating it and drifting from the ledger it is supposed to be testing. */
const pin = (theme, viewport = REFERENCE_VIEWPORT.id) => TEST_WAIVER.nodesByArm[armId(theme, viewport)];

/** A clean run carrying exactly the waived contrast figure, split per ARM. */
function cleanResults() {
  return allArms("s1", (theme, viewport) => ({
    violations: pin(theme, viewport) ? [contrast(pin(theme, viewport))] : [],
  }));
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

  it("fires when a waived rule goes ABOVE its ceiling, on any ONE arm alone", () => {
    /**
     * Four arms now, not two: light and dark at each of two viewports. The
     * viewport axis is here for the same reason the theme axis was - a
     * regression on the arm nobody looks at must not be able to hide.
     */
    for (const arm of ARMS) {
      const results = allArms("s1", (theme, viewport) => {
        const n = pin(theme, viewport) + (armId(theme, viewport) === arm ? 1 : 0);
        return { violations: n ? [contrast(n)] : [] };
      });
      const v = judge(results);
      assert.equal(v.pass, false, `${arm} went up by one and the gate passed`);
      assert.ok(
        v.reasons.some((r) => r.includes(`[${arm}]`) && r.includes("ceiling")),
        `${arm}: ${v.reasons.join("; ")}`,
      );
    }
  });

  it("fires when a defect appears ONLY below the fold, which the single-viewport gate could not see", () => {
    /**
     * THE ROW. G-95's headline was "0 conformance nodes over 46 scans" and it
     * was measured at 1440x900 only, where axe evaluated 72.5% of this product's
     * rendered text and never judged the rest. Five real AA nodes were sitting in
     * the other 27.5%. This arm is that shape as a fixture: clean at reference,
     * a node at full extent, and the gate must refuse it.
     */
    const results = allArms("s1", (theme, viewport) => ({
      violations: viewport === FULL_EXTENT_VIEWPORT.id && theme === "light" ? [contrast(5)] : [],
    }));
    const v = judge(results, [], []);
    assert.equal(v.pass, false, "a defect visible only below the fold must still fail the build");
    assert.ok(
      v.reasons.some((r) => r.includes("color-contrast") && r.includes("no waiver")),
      v.reasons.join("; "),
    );
  });

  it("fires on COMPENSATING drift ACROSS THEMES, which is why the pin is per theme", () => {
    /**
     * Dark regresses by ten, light improves by ten, the total is unchanged. A
     * waiver pinned as one number passes this and a real customer-facing
     * regression ships under a figure that did not move. Two pins cannot be
     * compensated against each other.
     */
    const results = allArms("s1", (theme) => ({
      violations: [contrast(theme === "light" ? pin(theme) - 10 : pin(theme) + 10)],
    }));
    /**
     * The drift is applied on BOTH viewports so the arm tests the THEME axis
     * alone. Applying it to the reference arm only would also break the superset
     * property - an element failing above the fold still fails below it - and
     * the arm would then pass for the wrong reason, which is worse than failing.
     */
    assert.equal(
      2 * (pin("light") - 10) + 2 * (pin("dark") + 10),
      waivedTotal(TEST_WAIVER),
      "the totals must match, or this arm proves nothing",
    );
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.some((r) => r.includes("[dark@reference]") && r.includes("ceiling")), v.reasons.join("; "));
  });

  it("fires on COMPENSATING drift ACROSS VIEWPORTS, which is why G-99 made the pin per arm", () => {
    /**
     * The same defect one axis over, and the axis that matters more: the
     * full-extent arm is the one carrying the findings nobody has looked at yet.
     * Reference improves by ten, full extent regresses by ten, a per-theme total
     * does not move, and a real below-the-fold regression ships under a flat
     * number.
     */
    const waiver = {
      ...TEST_WAIVER,
      nodesByArm: { "light@reference": 20, "light@full-extent": 20, "dark@reference": 0, "dark@full-extent": 0 },
    };
    const results = allArms("s1", (theme, viewport) => {
      if (theme !== "light") return { violations: [] };
      const n = viewport === REFERENCE_VIEWPORT.id ? 10 : 30;
      return { violations: [contrast(n)] };
    });
    const perThemeTotalUnchanged = 10 + 30 === waiver.nodesByArm["light@reference"] + waiver.nodesByArm["light@full-extent"];
    assert.equal(perThemeTotalUnchanged, true, "the per-theme total must be unchanged, or this arm proves nothing");
    const v = judge(results, [waiver], []);
    assert.equal(v.pass, false, "a full-extent regression hid behind a reference improvement");
    assert.ok(
      v.reasons.some((r) => r.includes("[light@full-extent]") && r.includes("ceiling")),
      v.reasons.join("; "),
    );
  });

  it("passes but says STALE when a waived rule improves, so the waiver cannot rot quietly", () => {
    const results = allArms("s1", (theme, viewport) => {
      const n = pin(theme, viewport);
      return { violations: n ? [contrast(n - 1)] : [] };
    });
    const v = judge(results);
    assert.equal(v.pass, true, v.reasons.join("; "));
    assert.equal(v.stale.length, ARMS.filter((a) => TEST_WAIVER.nodesByArm[a] > 0).length);
    for (const line of v.stale) assert.match(line, /below the waived|re-pin/);
  });

  it("fires when a waived rule reaches zero, because the exception has outlived its reason", () => {
    const results = allArms("s1");
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
      nodesByArm: {
        "light@reference": 1,
        "light@full-extent": 1,
        "dark@reference": 1,
        "dark@full-extent": 1,
      },
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
    const at = allArms("s1", () => ({ incomplete: incomplete("elmPartiallyObscuring", 1) }));
    assert.equal(judge(at, [], [item]).pass, true, "the adjudicated count must pass");

    const above = allArms("s1", () => ({ incomplete: incomplete("elmPartiallyObscuring", 2) }));
    const vAbove = judge(above, [], [item]);
    assert.equal(vAbove.pass, false, "more nodes than were adjudicated must fail");
    assert.ok(vAbove.reasons.some((r) => r.includes("ceiling, not permission")), vAbove.reasons.join("; "));

    // A DIFFERENT reason is a different finding and is not covered.
    const other = allArms("s1", () => ({ incomplete: incomplete("bgImage", 1) }));
    const vOther = judge(other, [], [item]);
    assert.equal(vOther.pass, false, "an unadjudicated reason must fail");
    assert.ok(vOther.reasons.some((r) => r.includes("no adjudication covers")), vOther.reasons.join("; "));

    /**
     * And here the adjudication ledger is deliberately NOT a waiver. A waived
     * rule reaching zero FAILS, because the exception has outlived its cause.
     * An adjudication reaching zero is a NOTE, because it hides an unknown
     * rather than a violation - and because this particular finding is
     * environment dependent, so a both-directions ratchet would make the gate
     * unrunnable on whichever machine does not reproduce it.
     */
    const none = allArms("s1");
    const vNone = judge(none, [], [item]);
    assert.equal(vNone.pass, true, vNone.reasons.join("; "));
    assert.ok(vNone.stale.some((r) => r.includes("0 unresolved node(s) here")), vNone.stale.join("; "));
    // The waiver's zero arm still FAILS, so the asymmetry is deliberate rather
    // than one of them having been forgotten.
    const waived = judge(none, TEST_WAIVERS, []);
    assert.equal(waived.pass, false);
    assert.ok(waived.reasons.some((r) => r.includes("delete its entry from WAIVERS")), waived.reasons.join("; "));
  });

  it("accepts a SUBJECT-bounded adjudication at any count, and refuses a node outside the subject set", () => {
    /**
     * G-99's second adjudication shape, and it exists because of a measurement
     * rather than a preference. The live elmPartiallyObscuring finding was
     * measured at 0 nodes, 2 nodes and 88 nodes on ONE commit across three
     * environments, because it is a knife-edge geometric predicate on where a
     * sticky footer's sentence wraps - and where it wraps is a function of the
     * typeface that rendered. A count ceiling on that is a ceiling nobody can
     * set correctly, and a both-directions ratchet on it makes the gate
     * unrunnable on whichever machine does not reproduce it.
     *
     * So the adjudication pins the SUBJECT. Any count on the named elements is
     * accepted and still printed; a node on a NEW element fails, because that is
     * the regression that means something.
     */
    const item = {
      rule: "color-contrast",
      reason: "elmPartiallyObscuring",
      element: "#nav-demonstrated and #nav-sources-rule",
      surfaces: ["every surface"],
      subjects: ["#nav-demonstrated", "#nav-sources-rule"],
      environmentDependent: "fixture: measured 0, 2 and 88 on one commit across three environments",
      countingRule: "fixture: unpinned by count, bounded by subject",
      owner: "a fixture",
      adjudication: "fixture adjudication",
      basis: "fixture basis",
      remove: "never; this entry exists only inside this test file",
      routedTo: "nowhere; fixture",
    };
    assert.equal(isSubjectBounded(item), true);
    const withNodes = (nodes, targets) =>
      allArms("s1", () => ({
        incomplete: [
          {
            id: "color-contrast",
            impact: "serious",
            tags: ["cat.color", "wcag2aa"],
            help: "contrast",
            nodes,
            sample: targets.slice(0, 3),
            targets,
            reasons: ["elmPartiallyObscuring"],
          },
        ],
      }));

    // Two nodes on the named subjects: the count a Linux CI runner measured.
    const small = judge(withNodes(2, ["#nav-demonstrated", "#nav-sources-rule"]), [], [item]);
    assert.equal(small.pass, true, small.reasons.join("; "));

    // Forty-four times as many, on the SAME elements: what this machine measures
    // with the webfont loaded. Same finding, same subjects, still a pass.
    const huge = judge(withNodes(88, ["#nav-demonstrated", "#nav-sources-rule"]), [], [item]);
    assert.equal(huge.pass, true, huge.reasons.join("; "));

    // And the count is NOT hidden by being unpinned - it is still summarised.
    const s = summarize(withNodes(88, ["#nav-demonstrated", "#nav-sources-rule"]), AXE, "http://test");
    assert.equal(s.incompleteConformance[0].nodes, 88 * ARMS.length);

    // A NEW element is a new finding and must fail however small the count.
    const stray = judge(withNodes(3, ["#nav-demonstrated", "#nav-sources-rule", "#brand-new-thing"]), [], [item]);
    assert.equal(stray.pass, false, "an unresolved node on an element nobody adjudicated must fail");
    assert.ok(
      stray.reasons.some((r) => r.includes("OUTSIDE the adjudicated subject set") && r.includes("#brand-new-thing")),
      stray.reasons.join("; "),
    );
  });

  it("holds the LIVE adjudications to a shape that makes them readable by a stranger", () => {
    for (const r of REVIEW_ITEMS) {
      assert.match(r.rule, /\S/);
      assert.match(r.reason, /\S/, `${r.rule} is adjudicated without naming the reason axe gave`);
      /**
       * ONE SHAPE OR THE OTHER, never neither and never both. A count pin is per
       * ARM; a subject pin names its elements and states why a count would be
       * meaningless. An entry carrying both would be two contracts for one
       * finding, which is the CTRL-1 shape this program has already paid for.
       */
      if (isSubjectBounded(r)) {
        assert.equal(r.nodesByArm, undefined, `${r.rule}/${r.reason} carries both a subject set and a count pin`);
        assert.ok(r.subjects.length > 0);
        assert.match(
          r.environmentDependent || "",
          /\S/,
          `${r.rule}/${r.reason} is unpinned by count and does not say why a count would be meaningless`,
        );
      } else {
        assert.deepEqual(
          Object.keys(r.nodesByArm).sort(),
          [...ARMS].sort(),
          `${r.rule}/${r.reason} is not pinned per arm`,
        );
      }
      assert.match(r.owner, /\S/, `${r.rule} is adjudicated and nobody owns it`);
      assert.match(r.adjudication, /\S/, `${r.rule} has no adjudication, only a pin`);
      assert.match(r.basis, /\S/, `${r.rule} is adjudicated with no basis`);
      assert.match(r.remove, /\S/, `${r.rule} has no removal condition, which is amnesty`);
      assert.match(r.routedTo, /\S/, `${r.rule} is not routed anywhere, so no human will ever see it`);
      assert.match(r.countingRule, /\S/, `${r.rule} adjudicates a number with no counting rule`);
    }
  });

  it("fires on a shared title, which is the 2.4.2 defect this card was opened for", () => {
    const results = [
      ...cleanResults(),
      ...allArms("s2", () => ({ title: "s1 title", expectedTitle: "s1 title" })),
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
    const results = allArms("s1", (theme, viewport) => ({
      violations: pin(theme, viewport) ? [contrast(pin(theme, viewport))] : [],
      painted: { theme, canvas: "rgb(12, 17, 22)", sheets: 2 },
    }));
    const s = summarize(results, AXE, "http://test");
    assert.match(s.themeLeverFinding, /did not move|identically/);
    assert.equal(verdict(s, TEST_WAIVERS, []).pass, false);
  });

  it("counts every theme AND every viewport in the denominator, and says so where the number is read", () => {
    const s = summarize(cleanResults(), AXE, "http://test", { platform: "linux", ci: true });
    assert.equal(s.surfacesScanned, THEMES.length * VIEWPORT_IDS.length);
    assert.equal(s.surfaceCount, 1);
    assert.match(s.countingRule, /surfaces x \d+ themes x \d+ viewports/);
    assert.deepEqual(Object.keys(s.conformanceNodesByArm).sort(), [...ARMS].sort());
    /**
     * AND THE BOUND TRAVELS WITH THE NUMBER. A ratio whose counting rule is not
     * stated at the point of use will be quoted wrong (DEV_PROCESS 1.2), and
     * this one lands in an Accessibility Conformance Report. The counting rule
     * string must carry the coverage figure for BOTH viewports, not just name
     * them.
     */
    assert.match(s.countingRule, /BOUNDED BY WHAT AXE EVALUATED/);
    for (const id of VIEWPORT_IDS) assert.ok(s.countingRule.includes(id), `${id} is not named in the counting rule`);
    assert.equal(s.coverageByViewport[REFERENCE_VIEWPORT.id].pct, 72);
    assert.equal(s.coverageByViewport[FULL_EXTENT_VIEWPORT.id].pct, 100);
  });

  it("declares which run is the figure of record, and says so on a run that is not", () => {
    /**
     * A ceiling that ranges 0 to 88 across two operating systems has two answers
     * and no owner unless one environment is named. This is that declaration,
     * and the arm that keeps a local run from reading like the figure.
     */
    assert.equal(AUTHORITATIVE.platform, "linux");
    assert.match(AUTHORITATIVE.where, /ci\.yml/);
    const ci = authorityOf({ platform: "linux", ci: true });
    assert.equal(ci.authoritative, true);
    assert.match(ci.line, /figure of record/);
    const local = authorityOf({ platform: "win32", ci: false });
    assert.equal(local.authoritative, false);
    assert.match(local.line, /INDICATIVE RUN, NOT THE FIGURE OF RECORD/);
    assert.match(local.line, /win32/);
    // A linux box that is not CI is still not the figure of record.
    assert.equal(authorityOf({ platform: "linux", ci: false }).authoritative, false);
    // And the geometry-dependent reasons are named ONCE so two places cannot
    // disagree about which findings fail to transfer.
    assert.ok(GEOMETRY_DEPENDENT_REASONS.includes("elmPartiallyObscuring"));
  });
});

/* ------------------------------------ the conditions the number depends on */

describe("G-99 the gate states its own bounds and refuses an unmeasured one", () => {
  it("refuses a full-extent scan that never reached full extent", () => {
    /**
     * Growing the viewport is only worth anything if it stops at the right
     * place. A scan that ran out of growth steps or hit the cap left elements
     * outside the clipping box, and axe evaluates NOTHING outside it - so those
     * elements are unexamined, not clean. This is the arm that stops "we grew
     * the window" from being mistaken for "we measured everything".
     */
    const results = allArms("s1", (theme, viewport) => ({
      violations: pin(theme, viewport) ? [contrast(pin(theme, viewport))] : [],
      ...(viewport === FULL_EXTENT_VIEWPORT.id
        ? {
            coverage: {
              height: 12000,
              rendered: 283,
              inViewport: 187,
              outside: 96,
              overflowBelow: 2900,
              steps: 6,
              stoppedBecause: "hit the declared cap of 12000px with 2900px still below the fold",
            },
          }
        : {}),
    }));
    const v = judge(results);
    assert.equal(v.pass, false);
    assert.ok(
      v.reasons.some((r) => r.includes("coverage") && r.includes("96 of 283")),
      v.reasons.join("; "),
    );
  });

  it("refuses a run where growing the viewport LOST a finding, which would mean it changed the page", () => {
    /**
     * The divergence test for the technique itself (DEV_PROCESS 2.4: when one
     * rule has two implementations, the divergence test IS the control - here
     * the two implementations are the same scan at two window sizes). Measured
     * over nine heights on a real surface, every flagged set was a strict
     * superset of the one below and nothing was ever lost. This keeps that true
     * rather than remembered.
     */
    const results = allArms("s1", (theme, viewport) => ({
      violations:
        viewport === REFERENCE_VIEWPORT.id && theme === "light"
          ? [contrast(1, [".vanishes-when-the-window-grows"])]
          : [],
    }));
    const v = judge(results, [], []);
    assert.equal(v.pass, false);
    assert.ok(
      v.reasons.some((r) => r.includes("viewport growth") && r.includes("ABSENT at full extent")),
      v.reasons.join("; "),
    );
  });

  it("refuses a run whose typeface did not land, and a run where it landed on only some scans", () => {
    /**
     * The third landing assertion beside the theme and the paint. The shipped
     * face renders 9.35% wider than the fallback here, which moves every wrap
     * point and therefore every overlap axe judges - the measured difference
     * between 0 unresolved nodes and 88 on one commit.
     */
    const fallback = allArms("s1", () => ({
      typeface: { ui: "fallback", data: "fallback", uiWidth: 208.8, namedUiWidth: 193.73, dataWidth: 270.7, namedDataWidth: 193.73 },
    }));
    const vFallback = judge(fallback, [], []);
    assert.equal(vFallback.pass, false);
    assert.ok(vFallback.reasons.some((r) => r.includes("typeface") && r.includes("does not ship")), vFallback.reasons.join("; "));

    const mixed = allArms("s1", (theme) => ({
      typeface:
        theme === "light"
          ? { ui: "shipped", data: "shipped", uiWidth: 228.33, namedUiWidth: 228.33, dataWidth: 277.2, namedDataWidth: 277.2 }
          : { ui: "fallback", data: "shipped", uiWidth: 208.8, namedUiWidth: 193.73, dataWidth: 277.2, namedDataWidth: 277.2 },
    }));
    const vMixed = judge(mixed, [], []);
    assert.equal(vMixed.pass, false);
    assert.ok(vMixed.reasons.some((r) => r.includes("not a measurement")), vMixed.reasons.join("; "));
  });
});

describe("G-99 the second instrument, for what axe does not look at", () => {
  const sweep = (over = {}) => ({
    computed: 100,
    passed: 99,
    failed: 1,
    couldNotCompute: 3,
    excludedAriaHidden: 2,
    skippedByAxe: 1,
    ambiguousReasons: {},
    failures: [],
    subjects: [],
    ...over,
  });

  it("refuses a low-contrast element that axe reported in NO bucket at all", () => {
    /**
     * The class that made this instrument necessary, and it is not hypothetical:
     * .sep computes to 1.856:1 in light and 1.737:1 in dark on every surface in
     * this product, and axe reports it in no bucket - not a violation, not a
     * pass, not incomplete. Bisected with the character as the only variable on
     * one live element: "|" NOT EVALUATED, "X" incomplete, "||" NOT EVALUATED,
     * "XY" VIOLATION. axe-core excludes punctuation-only text from
     * color-contrast by design at axe.js:28714. A gate built on one tool
     * inherits that tool's exclusions silently.
     */
    const results = allArms("s1", () => ({
      independentContrast: sweep({
        failures: [{ group: ".sep", nodes: 84, ratio: 1.737, required: 4.5, sample: ".sep rgb(59, 72, 84) on rgb(24, 33, 42) at 400 13px" }],
      }),
    }));
    const found = independentContrastFindings(results);
    assert.equal(found.length, 1);
    assert.equal(found[0].group, ".sep");
    const v = judge(results, [], []);
    assert.equal(v.pass, false);
    assert.ok(
      v.reasons.some((r) => r.includes("independent-contrast") && r.includes("NO bucket")),
      v.reasons.join("; "),
    );
  });

  it("applies the LARGE-TEXT threshold rather than one number for everything", () => {
    // 1.4.3 is 4.5:1 for normal text and 3:1 for large, where large is 24px or
    // 18.66px bold. A single threshold would refuse compliant headings.
    assert.equal(requiredRatio({ fontSizePx: 13, fontWeight: 400 }), 4.5);
    assert.equal(requiredRatio({ fontSizePx: 24, fontWeight: 400 }), 3);
    assert.equal(requiredRatio({ fontSizePx: 19, fontWeight: 700 }), 3);
    assert.equal(requiredRatio({ fontSizePx: 19, fontWeight: 400 }), 4.5);
  });

  it("REFUSES the ledger's own adjudication when this run contradicts its recorded ratio", () => {
    /**
     * The control-design half, and the reason it exists is a real near-miss: a
     * sibling lane reported the live elmPartiallyObscuring adjudication as
     * refuted at 1.737:1. Re-measuring showed the 1.737 belongs to a DIFFERENT
     * element class that axe never evaluates, and the adjudicated subjects
     * measure 5.559:1 and 5.232:1 - so the adjudication held and the report of
     * it did not. Both mistakes are only visible if the number is recomputed
     * rather than read, which is what this arm keeps true.
     */
    const item = {
      rule: "color-contrast",
      reason: "elmPartiallyObscuring",
      subjects: ["#nav-demonstrated"],
      environmentDependent: "fixture",
      measuredRatio: { light: 5.559, dark: 5.232 },
      threshold: 4.5,
      measuredBy: "fixture",
      countingRule: "fixture",
      owner: "a fixture",
      adjudication: "fixture",
      basis: "fixture",
      remove: "never",
      routedTo: "nowhere",
    };
    const withRatio = (ratio) =>
      allArms("s1", () => ({
        independentContrast: sweep({ subjects: [{ subject: "#nav-demonstrated", ratio, required: 4.5 }] }),
      }));

    // Matches the recorded basis: the adjudication stands.
    assert.equal(judge(withRatio(5.559), [], [item]).pass, true);

    // Below the threshold: the adjudication is a claim about a number and the
    // number does not hold, so the entry is REFUSED rather than believed.
    const refuted = judge(withRatio(1.737), [], [item]);
    assert.equal(refuted.pass, false);
    assert.ok(
      refuted.reasons.some((r) => r.includes("adjudication") && r.includes("does not hold")),
      refuted.reasons.join("; "),
    );

    // Still clears, but drifted from what is recorded: a NOTE, because a basis
    // that no longer matches the screen is a basis nobody can rely on.
    const drifted = judge(withRatio(5.559 + ADJUDICATION_DRIFT_TOLERANCE + 0.5), [], [item]);
    assert.equal(drifted.pass, true, drifted.reasons.join("; "));
    assert.ok(drifted.stale.some((r) => r.includes("re-measure and re-record")), drifted.stale.join("; "));
  });

  it("states its own exclusion set where its output is read, which is the whole lesson", () => {
    /**
     * DEV_PROCESS 2.1. axe's exclusion set was stated nowhere this gate's output
     * was read, and it was hiding a 1.74:1 ratio on every surface. This
     * instrument does not get to make the same mistake: what it could not
     * compute and what it deliberately skipped are both counted and both
     * printed.
     */
    const results = allArms("s1", () => ({ independentContrast: sweep() }));
    const s = summarize(results, AXE, "http://test", { platform: "linux", ci: true });
    const ic = s.independentContrastCoverage;
    assert.equal(ic.computed, 100 * ARMS.length);
    assert.equal(ic.couldNotCompute, 3 * ARMS.length);
    assert.equal(ic.excludedAriaHidden, 2 * ARMS.length);
    assert.equal(ic.skippedByAxe, 1 * ARMS.length);
    assert.match(ic.note, /COULD-NOT-COMPUTE/);
    assert.match(ic.note, /aria-hidden/);
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
      /**
       * G-99's classes. Each one refuses something this gate could not refuse
       * before, and a refusal class with no plant has never been watched firing.
       */
      "below-the-fold-contrast",
      "viewport-growth-changed-the-page",
      "unreachable-extent",
      "punctuation-contrast",
      "adjudication-refuted",
      "typeface-fallback",
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

  it("holds the LIVE ledger to the same shape, and every entry in it is measured and owned", () => {
    /**
     * G-95's one entry was deleted the moment its cause landed in the kit, which
     * is exactly what its ratchet demanded. The shape check stays and applies to
     * whatever the next lane puts here: a waiver carries five things or it is
     * amnesty, and it is pinned PER THEME so a dark regression cannot hide
     * behind a light improvement.
     */
    for (const w of WAIVERS) {
      assert.match(w.rule, /\S/);
      assert.deepEqual(Object.keys(w.nodesByArm).sort(), [...ARMS].sort(), `${w.rule} is not pinned per arm`);
      assert.match(w.owner, /\S/, `${w.rule} is waived and nobody owns it`);
      assert.match(w.basis, /\S/, `${w.rule} is waived with no basis`);
      assert.match(w.remove, /\S/, `${w.rule} has no removal condition, which is amnesty`);
      assert.match(w.countingRule, /\S/, `${w.rule} pins a number with no counting rule`);
    }
    /**
     * The ledger is NO LONGER EMPTY, and that is a deliberate act rather than a
     * drift: G-99 made the gate able to see two things it could not see before -
     * a below-the-fold contrast pair and a punctuation glyph axe excludes by
     * design - and both live in web/sc-kit.css and web/index.html, which this
     * lane is forbidden to touch. Each entry is measured, owned and removable.
     * The assertion is on the SHAPE and on the count, so a fourth entry appearing
     * without a decision is visible.
     */
    assert.equal(WAIVERS.length, 2, "a waiver is a decision, not a detail; adding one is a deliberate act");
    for (const w of WAIVERS) {
      assert.match(w.basis, /\d/, `${w.rule} is waived with a basis carrying no measured figure`);
      assert.ok(w.owner !== "G-99", `${w.rule} is waived and owned by the lane that waived it, which is amnesty`);
    }
    /**
     * And with an empty ledger the gate is at ZERO TOLERANCE, which is the
     * assertion that actually matters here: every conformance node fails.
     */
    const results = allArms("s1", () => ({ violations: [contrast(1, [".not-the-waived-rule"])] }));
    const v = verdict(summarize(results, AXE, "http://test"), WAIVERS, []);
    assert.equal(v.pass, false);
    assert.ok(
      v.reasons.some((r) => r.includes("ceiling") || r.includes("no waiver")),
      v.reasons.join("; "),
    );
    /**
     * And a rule NOBODY has waived still fails at one node, which is the arm
     * that actually proves zero tolerance now that the ledger is not empty.
     */
    const other = allArms("s1", () => ({
      violations: [{ id: "button-name", impact: "critical", tags: ["wcag2a"], help: "x", nodes: 1, sample: ["button"], targets: ["button"] }],
    }));
    const vOther = verdict(summarize(other, AXE, "http://test"), WAIVERS, []);
    assert.equal(vOther.pass, false);
    assert.ok(vOther.reasons.some((r) => r.includes("button-name") && r.includes("no waiver")), vOther.reasons.join("; "));
  });

  it("classifies conformance by the rule's own tags rather than by a list of rule ids", () => {
    assert.deepEqual(CONFORMANCE_TAGS, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  });
});
