/**
 * ---------------------------------------------------------------------------
 * G-95, extended by G-99. THE PURE HALF OF THE ACCESSIBILITY GATE.
 *
 * The waiver ledger, the conformance classification, the 2.4.2 and 2.4.7
 * findings, the theme-lever divergence check, and the verdict. Everything here
 * is a pure function over scan results, so ALL OF IT IS PROVEN ABLE TO FIRE ON
 * A BARE NODE IMAGE, in src/a11y-gate.test.mjs, on the ordinary `npm test` job
 * that runs on every push.
 *
 * That split is the point rather than tidiness. scripts/a11y-scan.mjs needs a
 * browser and is a separate CI job; if the firing proofs lived there, the
 * evidence that this gate CAN fail would run only when the browser job ran, and
 * the whole reason this file exists is that a control nobody has watched fail is
 * not a control. Same shape as src/shell-homes.mjs beside
 * scripts/bake-connections.mjs: the logic is in src/, the driver is in scripts/.
 *
 * ---------------------------------------------------------------------------
 * WHAT G-99 ADDED, AND WHY A GOOD GATE WAS NOT YET A CONTROL.
 *
 * G-95 shipped a gate whose figure was "0 conformance nodes over 46 scans". The
 * figure was true. Two conditions it depended on were written down nowhere a
 * reader of the figure would see them, and both were found by other lanes
 * measuring rather than by this gate reporting.
 *
 * ONE: the figure was VIEWPORT-BOUNDED, and not in the mild way. axe does not
 * merely report fewer findings outside the viewport; it does not EVALUATE
 * outside it, and an element it does not evaluate lands in no bucket at all.
 * Measured (axe-core 4.13.0, one surface, webfont held constant, height the only
 * variable): the whole color-contrast population - passes plus violations plus
 * incomplete - was 143 nodes at 1440x900, 182 at 1200, 213 at 1600 and 234 at
 * 2400, matching the in-viewport element count exactly at every height. So at
 * 900 this product's headline covered 4,408 of 6,084 rendered text-carrying
 * elements, 72.5%, and the remaining 27.5% was not judged clean - it was not
 * judged. It held 5 real WCAG AA color-contrast nodes.
 *
 * The cause is axe's own matcher, colorContrastMatches in axe.js, whose last
 * statement requires each text rect to overlap the box of an overflow-hidden
 * ancestor. This product's shell is height:100% with overflow:hidden, so that
 * box IS the viewport, and window scrolling cannot help because the shell does
 * not scroll - the scrolling happens inside div.colstack. The only lever that
 * puts an element into the evaluated population is a taller clipping box.
 *
 * Growing the viewport is therefore an instrument technique rather than a
 * different test, and that was measured before it was trusted: over nine heights
 * on the same surface every flagged set was a strict SUPERSET of the one below
 * it and nothing was ever lost, the gained targets being successive rows of one
 * table. supersetFindings() below turns that observation into a standing
 * assertion, because a technique that has only been observed once is a habit.
 *
 * TWO: the figure was ENVIRONMENT-DEPENDENT, and its variance ran 0 to 88. The
 * cause is font metrics. Measured with one variable changed over all 46 scans:
 * with the remote webfont answered by an empty 200, zero unresolved nodes; with
 * it allowed through, 88, every one of them color-contrast / elmPartiallyObscuring
 * on the two figures in the sticky nav footer. The real Inter face renders 9.35%
 * wider (a 33-character probe measures 228.33px against 208.80px), which wraps
 * the footer's .prov to exactly one more 18px line, which grows the sticky footer
 * from 281px to 299px, which slides a nav item's edge across the figure's box.
 * axe samples the element stack at the centre of each text line box and refuses
 * to guess a background when those stacks disagree. Full coverage resolves and no
 * coverage resolves; only PARTIAL coverage fires. It is a knife-edge geometric
 * predicate on a layout detail, and it flips in OPPOSITE directions on different
 * surfaces for the same one-line change - which is why a count ceiling on it is a
 * ceiling nobody can set correctly, and why REVIEW_ITEMS now accepts an
 * adjudication bounded by SUBJECT rather than by count.
 *
 * So this file no longer states a number. It states the conditions under which
 * the number is true, beside the number, every time it is printed.
 * ---------------------------------------------------------------------------
 */

import { THEMES } from "./theme.mjs";

/** Conformance is the rule's own tag set, never a hand-kept list of rule ids. */
export const CONFORMANCE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * ---------------------------------------------------------------------------
 * THE VIEWPORTS, DECLARED. G-99.
 *
 * A scan is a surface x a THEME x a VIEWPORT. The list is exported and each
 * entry carries its basis, because the bound has to be legible where the number
 * is read and this number lands in an Accessibility Conformance Report.
 *
 * WHY TWO AND NOT ONE, either way round:
 *   reference    is what a person sees. It is also the height the pre-fix
 *                baseline was taken at, so the before/after figures stay
 *                comparable, and dropping it would silently re-base them.
 *   full-extent  is what an auditor sees, because an auditor does not scan at
 *                our viewport. Its height is DERIVED per surface rather than
 *                fixed, and that is not fastidiousness: at a fixed 3000 the
 *                work-connections surface still had 96 of 283 rendered text
 *                elements outside the viewport while every scroll-extent probe
 *                on it reported zero hidden pixels, because its overflow is
 *                hidden rather than scrollable. A height derived from scroll
 *                extents would have certified that surface as fully covered. So
 *                the growth stops on the thing that actually matters - the count
 *                of elements still outside the box - and that stop condition IS
 *                the coverage assertion.
 * ---------------------------------------------------------------------------
 */
export const REFERENCE_VIEWPORT = Object.freeze({
  id: "reference",
  width: 1440,
  height: 900,
  derived: false,
  basis:
    "the height a person reads this product at, and the height the pre-fix wave-3 baseline was taken at, so before/after figures stay on one denominator",
});

export const FULL_EXTENT_VIEWPORT = Object.freeze({
  id: "full-extent",
  width: 1440,
  height: null,
  derived: true,
  startHeight: 900,
  maxHeight: 12000,
  growthSteps: 6,
  basis:
    "grown per surface until no rendered text element is left outside the clipping box, because axe evaluates nothing outside it. An auditor does not scan at our viewport, so the conformance figure of record cannot be an above-the-fold figure",
});

export const VIEWPORTS = [REFERENCE_VIEWPORT, FULL_EXTENT_VIEWPORT];
export const VIEWPORT_IDS = VIEWPORTS.map((v) => v.id);
export const viewportById = (id) => VIEWPORTS.find((v) => v.id === id) || null;

/**
 * AN ARM is one theme at one viewport, and it is the unit every ceiling in this
 * file is pinned against.
 *
 * G-95 pinned per THEME because one number let a dark regression hide behind a
 * light improvement. The same argument applies one axis over: a single per-theme
 * number would let a full-extent regression hide behind a reference improvement,
 * and the full-extent arm is the one carrying the findings nobody has seen yet.
 * So the pin is per arm, and the compensating-drift proof in the test file runs
 * on both axes.
 */
export const armId = (theme, viewport) => `${theme}@${viewport}`;
export const ARMS = THEMES.flatMap((t) => VIEWPORT_IDS.map((v) => armId(t, v)));

/**
 * ---------------------------------------------------------------------------
 * WHICH RUN IS THE FIGURE OF RECORD, DECLARED RATHER THAN ASSUMED. G-99.
 *
 * A ceiling that ranges 0 to 88 across two operating systems is not a tuning
 * problem, and pretending both runs are equally authoritative is how a developer
 * reads 44 as a real number. One environment is named as the figure of record;
 * every other run is INDICATIVE and says so in its own output, at the top and at
 * the bottom, whether it passed or failed.
 *
 * This is a declaration about AUTHORITY, not about correctness. A local run is
 * not wrong. It is a measurement of a different rendering environment, and the
 * geometry-dependent half of its output does not transfer.
 * ---------------------------------------------------------------------------
 */
export const AUTHORITATIVE = Object.freeze({
  platform: "linux",
  where: "the `a11y` job of .github/workflows/ci.yml, ubuntu-latest",
  /**
   * IT USED TO SAY "on the head SHA", AND THAT SENTENCE WAS FALSE. G-101.
   *
   * The workflow triggers on `pull_request`, so actions/checkout checks out the
   * MERGE of the head into the base, not the head. github.sha is that merge
   * commit. The distinction is not pedantic and it cost two lanes a day: G-99's
   * branch carried --sc-ok #2F7A52 and its CI job measured #2E7750, because a
   * sibling PR raising that token had merged into main thirty minutes before the
   * job ran. The job's own log said so - "HEAD is now at f00f2ab Merge dfc0ed66
   * into 0f916d8" - and nothing in the gate's output did.
   *
   * The result was a five-node disagreement between two machines that was read
   * as an environment difference, theorised about in terms of clipping boxes,
   * and carried into a ledger entry claiming to be pinned from the figure of
   * record when the figure of record had measured a different product. A
   * conformance figure that cannot name the TREE it measured is not attributable,
   * and this one lands in a legal document.
   *
   * So the tree is part of the declaration. The workflow exports it and the
   * banner prints it, on every run, authoritative or not.
   */
  treeMatters:
    "a `pull_request` run measures the MERGE of the head into the base, never the head alone. Two runs of one head SHA can therefore measure two different products, and one of them did",
  basis:
    "one environment has to be the figure of record or an environment-dependent number has two answers and no owner. Linux CI is chosen because it is the only environment every contributor and every reviewer can re-run identically, and because a merge gate already reads its check-run conclusion string",
  localIsIndicative:
    "a run anywhere else measures a real rendering environment and its colour findings transfer exactly, because a hex pair is not a function of the operating system. Its GEOMETRY-dependent findings - anything whose reason is elmPartiallyObscuring, elmPartiallyObscured or bgOverlap - do not transfer, because they are a function of font metrics",
});

/**
 * The tree that was actually measured, printed rather than assumed. `commit` is
 * what the runner checked out (github.sha, which on a pull_request is the merge
 * commit); `headRef` is the branch tip the PR points at. When they differ, they
 * are BOTH printed and the difference is named, because that difference is
 * exactly the thing that made two correct measurements look like a contradiction.
 */
export function treeOf(env = {}) {
  const commit = env.commit || null;
  const head = env.headSha || null;
  if (!commit) {
    return "TREE MEASURED: not recorded. This run cannot say which tree produced its numbers, which is how two runs of one head SHA came to measure two different products.";
  }
  const merged = head && head !== commit;
  return (
    `TREE MEASURED: ${commit}${env.eventName ? ` (event ${env.eventName})` : ""}` +
    (merged
      ? `, which is the MERGE of head ${head} into the base branch and NOT the head tree. ${AUTHORITATIVE.treeMatters}.`
      : head
        ? `, which is the head tree.`
        : `.`)
  );
}

export function authorityOf(env = {}) {
  const authoritative = env.platform === AUTHORITATIVE.platform && Boolean(env.ci);
  return {
    authoritative,
    platform: env.platform || "unknown",
    ci: Boolean(env.ci),
    tree: treeOf(env),
    line: authoritative
      ? `AUTHORITATIVE RUN: ${AUTHORITATIVE.where}. This is the figure of record. ${treeOf(env)}`
      : `INDICATIVE RUN, NOT THE FIGURE OF RECORD. This ran on ${env.platform || "unknown"}${env.ci ? " in CI" : " locally"}; the figure of record is ${AUTHORITATIVE.where}. ${AUTHORITATIVE.localIsIndicative}. ${treeOf(env)}`,
  };
}

/**
 * THE GEOMETRY-DEPENDENT REASON SET, named once so two places cannot disagree
 * about it. These are the axe incomplete reasons that are a function of what
 * OVERLAPS what, which is a function of where text wraps, which is a function of
 * the typeface that actually rendered. Every one of them was measured moving
 * from 0 to 88 nodes with the webfont as the only variable.
 */
/**
 * ---------------------------------------------------------------------------
 * THE AA CONTRAST THRESHOLDS, named here because a second instrument now needs
 * them (G-99, second pass, after a sibling lane found a defect axe cannot see).
 *
 * 1.4.3 Contrast (Minimum): 4.5:1 for normal text, 3:1 for large text, where
 * large is 18pt (24px) or 14pt (18.66px) bold.
 * ---------------------------------------------------------------------------
 */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
export function requiredRatio({ fontSizePx, fontWeight }) {
  const bold = Number(fontWeight) >= 700;
  const large = fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
  return large ? AA_LARGE : AA_NORMAL;
}

export const GEOMETRY_DEPENDENT_REASONS = [
  "elmPartiallyObscuring",
  "elmPartiallyObscured",
  "bgOverlap",
];

/**
 * ---------------------------------------------------------------------------
 * BEST-PRACTICE RULES THIS GATE REFUSES ANYWAY, each with the criterion it
 * actually answers.
 *
 * FOUND BY READING THE PLANT LIST AGAINST THE VERDICT, which is the check that
 * earns a plant list. `heading-order` carries no wcag tag, so it is
 * best-practice by this gate's own classification and the verdict ignored it -
 * meaning the plant for it would have reported "gate PASSED, WHICH IS THE BUG"
 * while the gate was behaving exactly as written. Either the plant was wrong or
 * the gate was, and the gate was: G-95 took heading-order from 15 nodes to zero,
 * and a fix with no gate rots.
 *
 * Named individually rather than gating all of best-practice, because most of
 * axe's best-practice rules are opinions this product has not adopted and a gate
 * that refuses them would be red forever, which is a dead gate (DEV_PROCESS 2.0).
 * Each entry states the conformance criterion it is standing in for, so a reader
 * can tell a VPAT-relevant rule from a style preference.
 * ---------------------------------------------------------------------------
 */
export const GATED_BEST_PRACTICE = {
  "heading-order":
    "not a wcag tag in axe, but a skipped heading level misrepresents the document outline, which is what 1.3.1 Info and Relationships and 2.4.6 Headings and Labels are read against in a conformance report. Taken to zero by G-95 and gated so it stays there.",
};

/**
 * ---------------------------------------------------------------------------
 * THE WAIVER LEDGER, and it is a RATCHET rather than amnesty.
 *
 * The gate refuses a build at any WCAG A or AA node. An entry here is an
 * explicit exception, and DEV_PROCESS 2.0 is why exceptions are carried rather
 * than ignored: a permanently-red gate is a dead gate, so the contract splits -
 * one predicate for the space the rule governs, one named exception with its
 * owner and its removal condition.
 *
 * It cannot rot into amnesty, because it fires in BOTH directions:
 *   actual > nodes   FAIL. The waiver is a ceiling and the count went up.
 *   actual === 0     FAIL. The cause is gone; delete the entry.
 *   0 < actual < nodes  PASS, with a loud STALE line naming the new figure.
 * An exception that can only ever be satisfied is the control that never fires.
 *
 * A waiver carries five things or it is amnesty: the rule, a PER-ARM pin with
 * its counting rule, an owner, a basis, and the condition under which it is
 * deleted. Per arm rather than per theme or as a total, because one number lets
 * a dark regression hide behind a light improvement and lets a full-extent
 * regression hide behind a reference improvement.
 *
 * THE CORRECTION THAT BELONGS BESIDE IT (DEV_PROCESS 3.2a, quoted at source).
 * The wave-3 brief records G-95's contrast finding as "cannot be fixed in a
 * Dashboards PR" because the failing selectors are "kit classes". Measured, that
 * was half right. The declarations that failed were in web/shell.css, not in
 * web/sc-kit.css; what the kit owns is the TOKEN VALUES those rules consume. The
 * entry below is the case where the brief's reading IS correct, and it is worth
 * saying which is which: .p-ok is declared in web/sc-kit.css itself and consumes
 * --sc-ok and --sc-ok-wash, both declared there too, so there is no shell-side
 * re-pairing available and the fix is genuinely the kit's.
 * ---------------------------------------------------------------------------
 */
export const WAIVERS = [];

/**
 * ---------------------------------------------------------------------------
 * THE LEDGER IS EMPTY AGAIN, AND BOTH ENTRIES WERE RETIRED AGAINST THEIR OWN
 * REMOVAL CONDITIONS RATHER THAN TIDIED AWAY. G-101.
 *
 * G-99 put two entries here. Both are gone, and the evidence for each is
 * recorded here rather than in a close artifact nobody reads at the point of use.
 *
 * 1. independent-contrast [.sep], pinned 83/84/83/84 per arm at 1.737-1.856:1.
 *    Its removal condition read: "when the separator is either declared
 *    decorative and removed from the accessibility tree (aria-hidden=true on the
 *    .sep span alone), or repainted to at least 4.5:1 if it is to stay
 *    announced." The first branch is now true in web/index.html - all 20
 *    occurrences carry aria-hidden="true" - and it was verified with the
 *    instrument that answers the actual claim rather than with an axe run:
 *    Chromium's own accessibility tree through CDP Accessibility.getFullAXTree.
 *    As shipped, ZERO AX nodes are named the separator glyph. With aria-hidden
 *    stripped at runtime in the same page in the same instant - one variable -
 *    8 to 12 StaticText nodes named "|" reappear per surface and the nav chip's
 *    accessible name reads "0 of 10 sources granted | 6 of 10 demonstrated with
 *    fixture records | template-city distinct adapter". The population did not
 *    vanish with the waiver: it moved to DECORATIVE_EXEMPTIONS below, where its
 *    ratio is recomputed and printed on every run.
 *
 * 2. independent-contrast [.pill], pinned light@full-extent 7 at 4.444:1. Its
 *    cause was gone BEFORE it was written, and the ledger could not tell. PR 35
 *    (G-98) raised light --sc-ok from #2F7A52 to #2E7750, merging at
 *    2026-08-20T03:51:37Z as d8f15de. G-99's branch tree kept the old value
 *    (`git show dfc0ed66:web/sc-kit.css` -> `--sc-ok:#2F7A52`), and its CI job
 *    ran at 04:21 on a `pull_request` event, which checks out the MERGE commit:
 *    that job's own log says `HEAD is now at f00f2ab Merge dfc0ed66... into
 *    0f916d86...`, and 0f916d8 contains d8f15de. So the entry's counting rule
 *    claiming it was "PINNED FROM THE FIGURE OF RECORD, which is the Linux CI
 *    job" was not true of the number it carried, and the same CI log prints one
 *    INDEPENDENT CONTRAST line, for .sep, with no .pill line at all. #2E7750 on
 *    the wash measures 4.623:1, which clears 4.5:1, and this machine now
 *    reproduces axe's own verdict on the current tree: `axe=pass ratio=4.62
 *    exp=4.5:1 fg=#2e7750 bg=#e3f0e8`.
 *
 * AND THE REASON NEITHER RETIREMENT WAS FORCED BY THE GATE, which is the finding
 * that matters more than either entry: the zero arm below could not fire. It
 * asked whether the second instrument's findings array was EMPTY, not whether
 * THIS waiver's own group was in it - so .pill sat stale and silent for as long
 * as .sep kept firing. A gating indicator that cannot fire is not a gate
 * (DEV_PROCESS 2.2). It is fixed, and the test proves it fires.
 * ---------------------------------------------------------------------------
 */

/**
 * ---------------------------------------------------------------------------
 * THE DECORATIVE LEDGER. G-101, and it is a TWO-WAY contract rather than a skip.
 *
 * aria-hidden="true" is the strongest instrument-silencing attribute in this
 * whole product: it takes text out of the accessibility tree, out of 1.4.3's
 * scope, and out of the second instrument's computed population in one move. An
 * exclusion nobody can see the size of is indistinguishable from a blind spot,
 * and that sentence is the entire lesson of this row - so an exclusion this
 * strong may not be silent, and the ledger enforces it in both directions:
 *
 *   - an aria-hidden text element matching NO entry here FAILS the build. A lane
 *     cannot quiet a contrast finding by hiding the text and have the number
 *     simply disappear.
 *   - an entry here matching NOTHING in the run FAILS the build, on the same
 *     terms a waiver does. An exemption that has outlived its cause is an
 *     exception pretending to cover something.
 *   - and the RATIO is recomputed and printed on every run even though the
 *     element is exempt, so the conformance report can state the exemption WITH
 *     its measurement rather than as a bare claim.
 * ---------------------------------------------------------------------------
 */
export const DECORATIVE_EXEMPTIONS = [
  {
    selector: ".sep",
    element: ".sep, the separator glyph inside a .prov provenance chip",
    surfaces: ["every surface: .prov is shell chrome"],
    criterion:
      "WCAG 1.4.3 Contrast (Minimum) applies to text; pure decoration is outside its scope. The glyph is removed from the accessibility tree, so it is decoration in the only sense that is machine-checkable.",
    measuredRatio: { light: 1.856, dark: 1.737 },
    measuredBy:
      "in-page composite of the resolved background against the computed foreground, sRGB relative luminance, independent of axe: light rgb(174, 186, 197) on rgb(246, 248, 250) = 1.856:1, dark rgb(59, 72, 84) on rgb(24, 33, 42) = 1.737:1, at 400 13px. Four independent computations agree on this pair - K1's DOM probe (1.855/1.737), G-99 (1.856/1.737), this gate's second instrument (1.856/1.737), and the token arithmetic taken straight from web/sc-kit.css (1.856/1.737).",
    basis:
      "all 20 occurrences in web/index.html are the same construct: a field divider inside a .prov chip, sitting between two independently-labelled runs of text that are already separate elements. Every one was read rather than sampled. None encodes a relation, a value, a unit, a range or a state, and no surrounding sentence loses meaning without it - which is what makes it decoration rather than content, and it had to be checked per occurrence because ONE instance carrying meaning would make the exemption false there.",
    owner: "the web/ lane that owns web/index.html",
    andWhatThisDoesNOTClaim:
      "it does not claim the glyph became easier to see. A sighted reader still reads a divider at 1.856:1, which is the shell's deliberate hairline treatment (var(--sc-line-strong) is a line token, not an ink token). The exemption declares that state rather than repainting it, and the ratio above is printed on every run so the declaration cannot quietly become a claim that the defect is gone.",
    remove:
      "when the separator stops being decoration - if it ever carries meaning on any surface, the exemption is false there and the colour must reach 4.5:1 instead - or when the divider becomes a real rule rather than a glyph, at which point there is no text to exempt and this entry matches nothing and fails.",
  },
];

/**
 * ---------------------------------------------------------------------------
 * ADJUDICATED REVIEW ITEMS: axe's incomplete bucket, resolved by a human.
 *
 * An incomplete result is not a violation and it is not a pass. It is axe
 * saying it could not settle the check, which is precisely the population wave
 * 3's manual protocol exists for. So the contract splits the way DEV_PROCESS
 * 2.0 asks: an unresolved check FAILS the build unless it has been adjudicated
 * here, by rule and by the reason axe gave, with the adjudication written down.
 *
 * TWO SHAPES OF ADJUDICATION, and the second one is G-99's. An entry carries
 * EITHER:
 *
 *   nodesByArm   a numeric ratchet, on the same terms as a waiver: above the pin
 *                fails, below prints STALE, zero prints a note. For a finding
 *                whose count means something.
 *
 *   subjects     a SUBJECT-bounded adjudication, for a finding whose count does
 *                not. Any unresolved node whose target is outside the named
 *                subject set FAILS. Any count INSIDE it is accepted and reported
 *                loudly with the environment beside it.
 *
 * The second shape exists because of a measurement, not a preference. The one
 * live entry below was pinned by G-95 at 1 node per theme from a Linux CI run;
 * the same commit produces 0 on Windows without the webfont and 88 with it, and
 * G-95's own Windows run produced 0 while its Linux run produced 2 on a surface
 * that is the only one Windows produces ZERO on. Four measurements, no two
 * agreeing, all correct. A ceiling on that number is a ceiling nobody can set,
 * and a both-directions ratchet on it makes the gate unrunnable on whichever
 * machine does not reproduce it, which is a dead gate in the most literal sense.
 *
 * What a subject-bounded entry gives up, stated rather than glossed: it will not
 * catch the same elements getting WORSE. What it buys is that it fires on a NEW
 * element, which is the regression that actually means something, and that it
 * fires identically in every environment. The count is still printed on every
 * run, so nothing is hidden - it is un-pinned, not un-reported.
 *
 * What an entry is NOT, in either shape: permission to ignore the rule. Every
 * node of that rule whose reason is not listed here still fails.
 * ---------------------------------------------------------------------------
 */
export const REVIEW_ITEMS = [
  {
    rule: "color-contrast",
    reason: "elmPartiallyObscuring",
    element: "#nav-demonstrated and #nav-sources-rule, the two figures in the sticky nav footer",
    surfaces: ["every surface: the nav footer is shell chrome"],
    subjects: ["#nav-demonstrated", "#nav-sources-rule"],
    environmentDependent:
      "measured 0 nodes on Windows with the webfont blocked, 88 on Windows with it allowed, 2 on a Linux CI runner (on empty-city-overview alone, which is the ONE surface the Windows webfont arm reports zero on), and 0 on the author's Windows machine during G-95. Four measurements of one commit, no two agreeing.",
    countingRule:
      "unresolved DOM elements summed over every scan of the run; UNPINNED by count, bounded by subject. A node on any target other than the two named above fails the build.",
    owner: "G-99, inherited from G-95",
    adjudication:
      "SUPPORTS. web/shell.css gives .nav-foot position: sticky with an OPAQUE background (var(--sc-surface)), so the nav list scrolls underneath it and a person reads the footer text against a solid ground. axe samples the element stack at the centre of each text line box and will not composite a background through a sticky overlap, so it says it could not settle rather than guessing, which is the correct behaviour for a tool and the reason this bucket exists.",
    basis:
      "the count is a function of TYPEFACE, established with one variable changed: the real Inter face renders 9.35% wider than the fallback on this machine (a 33-character probe at 400 14px/20px measures 228.33px against 208.80px), which wraps the footer's .prov to exactly one more 18px line, which grows the sticky footer from 281px to 299px and moves its figures from top 658 to top 640. On the empty-city surface the flagged element's own box is IDENTICAL between the two arms - top 694, bottom 730 - and only what sits behind it moved. axe fires on PARTIAL overlap only, so the same one-line change pushes some surfaces into the finding and others out of it, which is why the adjudication is bounded by subject rather than by count.",
    /**
     * THE MEASURED BASIS (G-99, second pass). An adjudication that says "axe
     * could not settle this but a human read it and it is fine" is a CLAIM
     * ABOUT A RATIO, and until now nothing checked it. These are the ratios
     * this lane computed independently of axe - compositing the background by
     * walking ancestors and applying the sRGB luminance formula directly - for
     * the two named subjects. The scanner recomputes them on every run and the
     * verdict REFUSES if the measurement contradicts the narrative.
     *
     * That is not a hypothetical guard. It was added because a sibling lane
     * reported this very adjudication as refuted at 1.737:1, and re-measuring
     * showed the 1.737 belongs to a DIFFERENT element class that axe never
     * evaluates at all. An adjudication carrying a number nobody recomputes is
     * how both mistakes stay invisible.
     */
    measuredRatio: { light: 5.559, dark: 5.232 },
    threshold: 4.5,
    measuredBy:
      "in-page composite of the resolved background against the computed foreground, sRGB relative luminance, independent of axe. Light: rgb(70, 88, 106) on rgb(246, 248, 250) = 5.559:1 and 6.887:1 for the two subjects; dark: rgb(162, 178, 192) on rgb(24, 33, 42) = 5.232:1 and 7.494:1. The pin above is the LOWER of each pair, so the check is against the worse one.",
    remove:
      "when .nav-foot stops overlapping the nav list, or when the footer's figures move somewhere that does not need a sticky bar. Both are UI decisions and neither is this lane's to take. When it lands, this entry stops matching and the gate says so.",
    routedTo:
      "the wave 3 manual protocol, which is where 'the three axe cannot settle' already belong. This is a fourth: a contrast pair a human must read rather than a tool. The ACR must carry it as a needs-review item, never as a pass.",
  },
  {
    rule: "color-contrast",
    reason: "shortTextContent",
    element: "a single-character cell in the Development services inspections table",
    surfaces: ["lens-development-services-inspections", "lens-development-services-licenses"],
    nodesByArm: {
      "light@reference": 0,
      "light@full-extent": 0,
      "dark@reference": 0,
      "dark@full-extent": 0,
    },
    countingRule:
      "unresolved DOM elements per arm, where an arm is one theme at one viewport, summed over the 23 scanned surfaces",
    owner: "G-99",
    adjudication:
      "SUPPORTS, and it is axe declining to judge rather than a defect. shortTextContent means the element's text was too short for axe to be sure it is text at all; the element is a numeric cell rendering through the same tokens as every other cell on the same row, all of which resolve and pass. Pinned by COUNT rather than by subject because unlike the entry above it is not geometry-dependent: it appears at exactly the same count in both themes and only on the full-extent arm, because the cell sits below the fold.",
    basis:
      "first observed at height 2000 and stable through 10000 on the ladder; absent at 900, 1200 and 1600, which is the fold moving rather than the page changing. The class is confirmed by direct bisect: the same element with one letter of text returns incomplete/shortTextContent from axe and with two letters returns a full result, so the reason is the length of the string and nothing about the colours.",
    measuredRatio: null,
    threshold: 4.5,
    measuredBy:
      "not applicable: shortTextContent is axe declining to judge whether the content is text at all, not a claim about a ratio. Stated as null rather than omitted, because an absent field and an inapplicable one must not look the same.",
    remove:
      "when the cell carries enough text for axe to settle it, or when the table stops rendering single-character cells. Below the pin prints STALE; zero prints a note rather than failing, because an adjudication hides an unknown rather than a violation.",
    routedTo:
      "the wave 3 manual protocol as a read-it-yourself item. One human reading one cell closes it permanently.",
  },
];

const reviewFor = (id, reason, reviewItems = REVIEW_ITEMS) =>
  reviewItems.find((r) => r.rule === id && r.reason === reason) || null;

export const isSubjectBounded = (item) => Array.isArray(item.subjects) && item.subjects.length > 0;

export const waivedTotal = (w) => Object.values(w.nodesByArm).reduce((a, b) => a + b, 0);

/**
 * MATCHED ON RULE AND GROUP, because the verdict already matched on both and this
 * matched on rule alone - two implementations of one lookup, disagreeing, which
 * is the CTRL-1 shape (DEV_PROCESS 2.4). With two entries sharing the rule
 * `independent-contrast` it could only ever return the first, so the second was
 * unreachable through the exported helper while the verdict compared it happily.
 * There is one rule here now, and every caller passes the group it is asking
 * about; an axe waiver, which has no group, is looked up with none.
 */
export const waiverFor = (id, group = null) =>
  WAIVERS.find((w) => w.rule === id && (w.group || null) === (group || null)) || null;

/* --------------------------------------------------------------- reporting */

export const isConformance = (v) => v.tags.some((t) => CONFORMANCE_TAGS.includes(t));

/** The rows that carry a conformance number. Every aggregate reads through this
 *  so "which scans counted" has exactly one answer. */
const scanned = (results) => results.filter((r) => r.ok);
const atViewport = (results, viewport) => scanned(results).filter((r) => r.viewport === viewport);

/**
 * 2.4.2 Page Titled, which axe structurally cannot answer.
 *
 * axe scans ONE page at a time and this product's nav items are real <a href>
 * full navigations, so every lens is a distinct page carrying a title that is
 * present and identical. `document-title` therefore passes on all of them while
 * the criterion fails. The comparison across surfaces is the whole check, and it
 * only exists because the scanner holds every surface at once.
 */
export function titleFindings(results) {
  const out = [];
  const byTitle = new Map();
  /**
   * One row per SURFACE, not per scan. A surface is scanned once per theme and
   * once per viewport and the title depends on neither, so a naive pass would
   * report every title as shared with itself. Both invariances are asserted
   * separately below, because "the title does not depend on the palette" and
   * "the title does not depend on the window size" are real claims and an
   * unasserted one is an assumption.
   */
  const seenSurface = new Set();
  const titleBySurface = new Map();
  for (const r of scanned(results)) {
    const prior = titleBySurface.get(r.surface);
    if (prior !== undefined && prior.title !== r.title) {
      out.push({
        surface: r.surface,
        kind: prior.theme !== r.theme ? "theme-dependent" : "viewport-dependent",
        detail: `title differs between ${prior.theme}@${prior.viewport} and ${r.theme}@${r.viewport}: ${JSON.stringify(prior.title)} and ${JSON.stringify(r.title)}`,
      });
    }
    titleBySurface.set(r.surface, { title: r.title, theme: r.theme, viewport: r.viewport });
  }
  for (const r of scanned(results)) {
    if (seenSurface.has(r.surface)) continue;
    seenSurface.add(r.surface);
    if (!r.title || !r.title.trim()) {
      out.push({ surface: r.surface, kind: "empty", detail: "the document has no title" });
      continue;
    }
    if (r.expectedTitle && r.title !== r.expectedTitle) {
      out.push({
        surface: r.surface,
        kind: "wrong",
        detail: `title is ${JSON.stringify(r.title)}, the surface resolver says ${JSON.stringify(r.expectedTitle)}`,
      });
    }
    if (!byTitle.has(r.title)) byTitle.set(r.title, []);
    byTitle.get(r.title).push(r.surface);
  }
  for (const [title, surfaces] of byTitle) {
    if (surfaces.length > 1) {
      out.push({
        surface: surfaces.join(", "),
        kind: "duplicate",
        detail: `${surfaces.length} surfaces share the title ${JSON.stringify(title)}`,
      });
    }
  }
  return out;
}

/** 2.4.7 Focus Visible, over every stop the keyboard walk reached. */
export function focusFindings(results) {
  const out = [];
  for (const r of scanned(results)) {
    for (const stop of r.focus || []) {
      if (!stop.indicator) {
        out.push({
          surface: r.surface,
          kind: "no-indicator",
          detail: `${stop.selector} paints outline ${JSON.stringify(stop.outline)} and box-shadow ${JSON.stringify(stop.boxShadow)} while keyboard-focused`,
        });
      }
    }
  }
  return out;
}

/**
 * THE LEVER IS PROVEN TO MOVE. Returns the reason it did not, or null.
 *
 * Compares the painted body background per surface across themes. If no surface
 * paints differently, the run scanned one palette twice however many themes it
 * named, and the "both themes" claim is vacuous. This is the guard the sibling
 * lane's colorScheme scan did not have, and it is why its two "themes" returned
 * an identical figure pair for pair without anything looking wrong.
 *
 * Compared WITHIN one viewport, because two viewports of the same theme paint
 * the same canvas and merging them would let the viewport axis satisfy a check
 * about the theme axis.
 */
export function themeLeverFinding(results) {
  const ok = atViewport(results, REFERENCE_VIEWPORT.id);
  if (THEMES.length < 2) return null;
  const bySurface = new Map();
  for (const r of ok) {
    if (!bySurface.has(r.surface)) bySurface.set(r.surface, new Set());
    bySurface.get(r.surface).add(r.painted?.canvas);
  }
  const moved = [...bySurface.values()].filter((set) => set.size > 1).length;
  if (moved > 0) return null;
  return `the palette painted identically under all ${THEMES.length} themes on all ${bySurface.size} surfaces at the ${REFERENCE_VIEWPORT.id} viewport; the theme lever did not move and this run measured one palette ${THEMES.length} times`;
}

/**
 * ---------------------------------------------------------------------------
 * THE COVERAGE FINDING. G-99, and it is the one that turns a figure into a
 * claim a stranger can check.
 *
 * A full-extent scan that still leaves elements outside the clipping box did not
 * measure the full extent, and axe evaluates NOTHING outside it - so those
 * elements are not clean, they are unexamined. Reported per scan and refused,
 * because an unmeasured region reading as a clean one is the defect class this
 * whole gate was built for.
 *
 * The reference viewport is deliberately NOT held to this: being bounded is what
 * "reference" MEANS. Its bound is declared instead, in the counting rule, beside
 * its number.
 * ---------------------------------------------------------------------------
 */
export function coverageFindings(results) {
  const out = [];
  for (const r of atViewport(results, FULL_EXTENT_VIEWPORT.id)) {
    const c = r.coverage;
    if (!c) {
      out.push({
        surface: `${r.surface} [${r.theme}]`,
        kind: "unmeasured",
        detail: "the scan recorded no coverage figure at all, so the bound on its number is unknown",
      });
      continue;
    }
    if (c.outside > 0) {
      out.push({
        surface: `${r.surface} [${r.theme}]`,
        kind: "bounded",
        detail: `grew to ${c.height}px and ${c.outside} of ${c.rendered} rendered text element(s) were still outside the clipping box (${((100 * c.inViewport) / c.rendered).toFixed(1)}% covered). axe evaluates nothing outside it, so those elements are unexamined rather than clean. ${c.stoppedBecause}`,
      });
    }
  }
  return out;
}

/**
 * ---------------------------------------------------------------------------
 * FOUR POPULATIONS OVER ONE DENOMINATOR, NEVER MERGED. G-101.
 *
 * G-99 published "full-extent covered 6198/6198 rendered text elements (100%)".
 * That number is correct and its counting rule is CONTAINMENT: 100% of them were
 * inside the viewport box. Containment is not judgement. Measured over the same
 * 46 scans, axe's colour-contrast rules actually judged 5,954 of the 6,198 -
 * 96.1% - and the 244-element gap is real text on real surfaces.
 *
 * An auditor reading 100% in a conformance report reads "everything was
 * checked", and the containment figure cannot carry that sentence. So every one
 * of these is measured and printed with its own rule beside it:
 *
 *   rendered     an element carrying its own non-empty text node, with at least
 *                one client rect, computed visibility not hidden. THE DENOMINATOR.
 *   inViewport   rendered AND its bounding box intersects the viewport box.
 *                What G-99's figure counted. Containment.
 *   axeEligible  rendered AND it satisfies axe's OWN candidate rule, which also
 *                requires overlapping every overflow-hidden ancestor's box. The
 *                standing hypothesis was that this differs sharply from
 *                inViewport on this shell; measured, it differs by 2 of 6,198 at
 *                the reference viewport and by 0 at full extent.
 *   evaluated    rendered AND axe put it in a bucket - any bucket - matched by
 *                element identity. JUDGEMENT, and the honest coverage numerator.
 *
 * pct is retained and still means containment, because it is quoted in the
 * pass line and in prior artifacts and silently changing what a published name
 * means is worse than adding a second one. pctEvaluated is the new figure and it
 * is the one printed first.
 * ---------------------------------------------------------------------------
 */
export function coverageByViewport(results) {
  const out = {};
  for (const v of VIEWPORTS) {
    const rows = atViewport(results, v.id).filter((r) => r.coverage);
    const sum = (f) => rows.reduce((s, r) => s + (r.coverage[f] || 0), 0);
    const rendered = sum("rendered");
    const inViewport = sum("inViewport");
    const axeEligible = sum("axeEligible");
    const evaluated = sum("evaluated");
    const judged = sum("judged");
    out[v.id] = {
      scans: rows.length,
      rendered,
      inViewport,
      axeEligible,
      evaluated,
      judged,
      inViewportNotEligible: sum("inViewportNotEligible"),
      pct: rendered ? Number(((100 * inViewport) / rendered).toFixed(1)) : null,
      pctEvaluated: rendered ? Number(((100 * evaluated) / rendered).toFixed(1)) : null,
      pctJudged: rendered ? Number(((100 * judged) / rendered).toFixed(1)) : null,
      maxHeight: rows.reduce((m, r) => Math.max(m, r.coverage.height || 0), 0),
      countingRule:
        "RENDERED is the denominator: an element carrying its own non-empty text node, with at least one client rect, whose computed visibility is not hidden. IN-VIEWPORT is containment - its bounding box intersects the viewport box. AXE-ELIGIBLE additionally applies axe's own candidate rule, which requires a text rect to overlap every overflow-hidden ancestor's box. EVALUATED is judgement - axe's colour-contrast rules put the element in a bucket, matched by element identity, not by selector string. JUDGED adds the elements the second instrument composited a ratio for. Containment is not judgement and the two are never merged.",
    };
  }
  return out;
}

/**
 * ---------------------------------------------------------------------------
 * THE DIVERGENCE TEST FOR THE TECHNIQUE ITSELF. G-99.
 *
 * Growing the viewport is only legitimate if it REVEALS rather than CHANGES.
 * That was measured before it was trusted - nine heights on one surface, every
 * flagged set a strict superset of the one below, nothing ever lost - but a
 * technique that has been observed once is a habit, and DEV_PROCESS 2.4 says
 * that when one rule has two implementations the divergence test IS the control.
 * Here the two implementations are the same scan at two window sizes.
 *
 * So: every rule+target flagged at the reference viewport MUST also be flagged
 * at full extent. A finding that disappears when the window grows means the
 * growth altered the layout under measurement, and every full-extent number in
 * the run is then suspect rather than merely different.
 * ---------------------------------------------------------------------------
 */
/**
 * ---------------------------------------------------------------------------
 * THE UNEXAMINED-TEXT FINDING. G-101, and it is the refusal class the coverage
 * number was standing in for.
 *
 * A coverage figure of 100% invites exactly one reading: everything was checked.
 * What it measured was containment. The difference is 244 elements on this
 * product, and until this function existed there was no number for them and no
 * way for the gate to refuse one.
 *
 * An element is UNEXAMINED when it renders its own text, sits inside the
 * viewport, satisfies axe's own candidate rule, and yet:
 *   - axe put it in no bucket at all, AND
 *   - the second instrument did not composite a ratio for it, AND
 *   - it is not declared decorative in DECORATIVE_EXEMPTIONS, AND
 *   - it is not a disabled control, which 1.4.3 exempts as an inactive component.
 *
 * That is text nothing looked at and no exemption covers - silence read as
 * success, which is the defect class this entire gate exists for, sitting inside
 * the gate. It refuses, per scan, with the classes named.
 *
 * AND THE TWO-WAY DECORATIVE CONTRACT, in the same pass, because aria-hidden is
 * the one attribute that can move an element out of every population at once:
 * an aria-hidden text element matching no declared exemption fails, and a
 * declared exemption matching nothing in the entire run fails on the same terms
 * a waiver's zero arm does.
 * ---------------------------------------------------------------------------
 */
export function evaluationFindings(results, exemptions = DECORATIVE_EXEMPTIONS) {
  const out = [];
  const rows = scanned(results).filter((r) => r.evaluation);
  for (const r of rows) {
    const e = r.evaluation;
    if (e.unexamined > 0) {
      out.push({
        surface: `${r.surface} [${r.theme}@${r.viewport}]`,
        kind: "unexamined-text",
        detail:
          `${e.unexamined} rendered text element(s) are inside the viewport and satisfy axe's own candidate rule, and NO instrument judged them: axe put them in no bucket, the independent sweep did not compute them, no decorative exemption covers them and they are not disabled controls. ` +
          `By class: ${JSON.stringify(e.unexaminedByClass)}. Sample ${JSON.stringify(e.unexaminedSample)}. ` +
          `They are not clean; they are unlooked-at, and a coverage figure that counts them as covered says the opposite.`,
      });
    }
    if (e.undeclaredDecorative > 0) {
      out.push({
        surface: `${r.surface} [${r.theme}@${r.viewport}]`,
        kind: "undeclared-decorative",
        detail:
          `${e.undeclaredDecorative} element(s) carrying their own text sit inside [aria-hidden="true"] and match no entry in DECORATIVE_EXEMPTIONS: ${JSON.stringify(e.undeclaredDecorativeByClass)}. ` +
          `aria-hidden removes text from the accessibility tree, from 1.4.3's scope and from this gate's computed population in one move, so it is declared or it is a blind spot. Add an entry with its criterion, its measured ratio and its removal condition, or remove the attribute.`,
      });
    }
  }
  /**
   * An exemption that matched NOTHING across the whole run. Judged over the run
   * rather than per scan, because a .sep on one lens and not another is normal
   * and only a total of zero means the cause is gone.
   */
  if (rows.length) {
    for (const d of exemptions) {
      const hits = rows.reduce((n, r) => n + ((r.evaluation.declaredDecorativeHits || {})[d.selector] || 0), 0);
      if (hits === 0) {
        out.push({
          surface: "(whole run)",
          kind: "exemption-outlived-its-cause",
          detail: `the decorative exemption for ${JSON.stringify(d.selector)} matched 0 element(s) on any scan. Delete the entry from DECORATIVE_EXEMPTIONS in src/a11y-gate.mjs (${d.remove}). An exemption that covers nothing is an exception pretending to.`,
        });
      }
    }
  }
  return out;
}

/**
 * What the decorative ledger EXEMPTED, with the ratio recomputed rather than
 * quoted. An exemption whose size is known and whose measurement is not cannot be
 * defended to an auditor, and the moment the count is its only trace the number
 * that made the exemption necessary is gone from the record.
 */
export function decorativeExempt(results) {
  const out = new Map();
  for (const r of scanned(results)) {
    for (const d of r.independentContrast?.decorative || []) {
      const prev = out.get(d.group) || { group: d.group, nodes: 0, ratios: new Set(), required: d.required, sample: d.sample };
      prev.nodes += d.nodes;
      prev.ratios.add(d.ratio);
      out.set(d.group, prev);
    }
  }
  return [...out.values()].map((x) => ({ ...x, ratios: [...x.ratios].sort((a, b) => a - b) }));
}

export function supersetFindings(results) {
  const out = [];
  const key = (r) => `${r.surface} [${r.theme}]`;
  const flagged = (r) =>
    new Set(
      (r.violations || [])
        .filter(isConformance)
        .flatMap((v) => (v.targets && v.targets.length ? v.targets : v.sample || []).map((t) => `${v.id} ${t}`)),
    );
  const full = new Map();
  for (const r of atViewport(results, FULL_EXTENT_VIEWPORT.id)) full.set(key(r), flagged(r));
  for (const r of atViewport(results, REFERENCE_VIEWPORT.id)) {
    const bigger = full.get(key(r));
    if (!bigger) continue;
    const lost = [...flagged(r)].filter((x) => !bigger.has(x));
    if (lost.length) {
      out.push({
        surface: key(r),
        kind: "not-a-superset",
        detail: `${lost.length} finding(s) present at the ${REFERENCE_VIEWPORT.id} viewport and ABSENT at full extent: ${JSON.stringify(lost.slice(0, 4))}. Growing the viewport is supposed to reveal findings, never remove them; a finding that vanishes means the growth changed the layout under measurement.`,
      });
    }
  }
  return out;
}

/**
 * ---------------------------------------------------------------------------
 * THE TYPEFACE LANDED. G-99, and it is the third landing assertion beside "the
 * theme landed" and "the page painted".
 *
 * The product loads Inter and IBM Plex Mono from a third party. A scan where
 * that did not resolve measured a page nobody ships, and it measured it
 * SILENTLY: document.fonts.check("14px Inter") returns true either way, because
 * the fallback can render the string. The reliable witness is the advance width
 * of a fixed probe rendered through the product's own token against the named
 * face alone - equal when the face landed, different when it did not (measured
 * on this product: 228.33 against 228.33 when it landed, 208.80 against 193.73
 * when it did not).
 *
 * A run where the typeface state is not UNIFORM across every scan is refused
 * outright: half a run of one product and half of another is not a measurement.
 * A run where the shipped face did not land at all is refused too, and the cost
 * of that is stated rather than hidden - it makes an authoritative CI run
 * dependent on a third party being up. That is accepted, because the alternative
 * is publishing a conformance figure for a rendering nobody sees, and because
 * the failure is loud, self-describing and retried once. The durable fix is to
 * self-host the faces, which is a web/ change this lane does not own.
 * ---------------------------------------------------------------------------
 */
export function typefaceFindings(results) {
  const out = [];
  const rows = scanned(results).filter((r) => r.typeface);
  if (!rows.length) return out;
  const states = new Set(rows.map((r) => `${r.typeface.ui}/${r.typeface.data}`));
  if (states.size > 1) {
    out.push({
      kind: "not-uniform",
      detail: `the shipped typeface landed on some scans of this run and not others (${JSON.stringify([...states])}). Half a run of one rendering and half of another is not a measurement, and every geometry-dependent figure in it is unreproducible.`,
    });
  }
  const fallback = rows.filter((r) => r.typeface.ui !== "shipped" || r.typeface.data !== "shipped");
  if (fallback.length === rows.length && rows.length) {
    out.push({
      kind: "fallback",
      detail: `no scan in this run rendered the shipped typeface: the UI stack measured ${rows[0].typeface.uiWidth}px where the named face alone measures ${rows[0].typeface.namedUiWidth}px. Every wrap point in the product is therefore different from the shipped one, which moves every overlap axe judges. The figure describes a rendering this product does not ship.`,
    });
  }
  return out;
}

/**
 * ---------------------------------------------------------------------------
 * THE SECOND INSTRUMENT. G-99, second pass.
 *
 * Everything above reads axe. axe has an exclusion set, it is not written down
 * anywhere this gate's output is read, and one of its exclusions was hiding a
 * 1.74:1 ratio on every surface in the product. So a gate built on one tool now
 * carries a second measurement that does not share the first one's blind spots:
 * the scanner composites backgrounds and computes WCAG ratios itself, in page,
 * for every rendered text-carrying element, and this function judges what axe
 * never looked at.
 *
 * IT IS DELIBERATELY CONSERVATIVE, and the conservatism is the contract. It
 * refuses ONLY where the computation is unambiguous: an opaque foreground, an
 * opaque resolved background reached without crossing a background image, a
 * gradient, a filter or a translucent layer, and an element whose own centre
 * hit-tests back to itself. Everything else is counted as COULD NOT COMPUTE and
 * reported - never scored clean, and never scored as a failure either, because
 * an instrument that guesses in the ambiguous cases is how a gate cries wolf and
 * gets switched off (DEV_PROCESS 2.0).
 *
 * Elements inside [aria-hidden="true"] are EXCLUDED and COUNTED. Excluded
 * because text removed from the accessibility tree and serving only an aesthetic
 * purpose is the 1.4.3 pure-decoration exception; counted because an exclusion
 * nobody can see the size of is indistinguishable from a blind spot, which is
 * the defect this whole function exists to answer.
 * ---------------------------------------------------------------------------
 */
export function independentContrastFindings(results) {
  const out = new Map();
  for (const r of scanned(results)) {
    for (const f of r.independentContrast?.failures || []) {
      const prev = out.get(f.group) || {
        id: "independent-contrast",
        group: f.group,
        nodes: 0,
        ratios: new Set(),
        required: f.required,
        sample: f.sample,
        surfaces: [],
        arms: [],
      };
      prev.nodes += f.nodes;
      prev.ratios.add(f.ratio);
      prev.surfaces.push(`${r.surface} [${r.theme}@${r.viewport}]`);
      prev.arms.push(armId(r.theme, r.viewport));
      out.set(f.group, prev);
    }
  }
  return [...out.values()]
    .map((x) => ({ ...x, ratios: [...x.ratios].sort((a, b) => a - b) }))
    .sort((a, b) => b.nodes - a.nodes);
}

/**
 * ---------------------------------------------------------------------------
 * AN ADJUDICATION IS A CLAIM ABOUT A NUMBER, AND THE NUMBER IS RE-MEASURED.
 * G-99, second pass, and it is the control-design half of the sibling lane's
 * finding.
 *
 * "axe could not settle this, but a human read it and it reads against a solid
 * ground" asserts that the composited ratio clears the threshold. Nothing
 * checked that. An adjudication resting on reasoning rather than measurement,
 * carried at a ceiling nobody recomputes, is a control reporting clean while the
 * thing it adjudicates drifts - and it would land in a VPAT as a pass.
 *
 * So every adjudication that makes a ratio claim carries measuredRatio and a
 * threshold, the scanner recomputes that ratio for the entry's own subjects on
 * every run, and this refuses the build when the run's measurement contradicts
 * the entry. Both directions are refused: below the threshold means the
 * adjudication is wrong, and drifting away from the recorded figure means the
 * adjudication is stale even if it still clears.
 * ---------------------------------------------------------------------------
 */
export const ADJUDICATION_DRIFT_TOLERANCE = 0.25;

export function adjudicationBasisFindings(results, reviewItems = REVIEW_ITEMS) {
  const out = [];
  const measuredBySubject = new Map();
  for (const r of scanned(results)) {
    for (const m of r.independentContrast?.subjects || []) {
      const key = `${m.subject}@${r.theme}`;
      const prev = measuredBySubject.get(key);
      if (!prev || m.ratio < prev.ratio) measuredBySubject.set(key, { ...m, theme: r.theme });
    }
  }
  for (const item of reviewItems) {
    if (!item.measuredRatio) continue;
    for (const [theme, claimed] of Object.entries(item.measuredRatio)) {
      const seen = (item.subjects || [])
        .map((subject) => measuredBySubject.get(`${subject}@${theme}`))
        .filter(Boolean);
      if (!seen.length) continue;
      const worst = seen.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
      const threshold = item.threshold ?? AA_NORMAL;
      if (worst.ratio < threshold) {
        out.push({
          rule: `${item.rule}/${item.reason}`,
          kind: "refuted",
          detail: `the adjudication says this reads acceptably and pins ${claimed}:1 in ${theme}, and this run measures ${worst.ratio}:1 on ${worst.subject} against a ${threshold}:1 requirement. An adjudication is a claim about a number; the number does not hold, so the adjudication does not either.`,
        });
      } else if (Math.abs(worst.ratio - claimed) > ADJUDICATION_DRIFT_TOLERANCE) {
        out.push({
          rule: `${item.rule}/${item.reason}`,
          kind: "drifted",
          detail: `the adjudication records ${claimed}:1 in ${theme} and this run measures ${worst.ratio}:1 on ${worst.subject}. It still clears ${threshold}:1, but a recorded basis that no longer matches what is on the screen is a basis nobody can rely on: re-measure and re-record it.`,
        });
      }
    }
  }
  return out;
}

/**
 * AXE'S THIRD BUCKET, and dropping it is how a gate scores an unknown as a pass.
 *
 * axe returns violations, passes and INCOMPLETE - the checks it could not
 * settle. color-contrast lands there whenever the background cannot be
 * resolved, which is a "needs review", never a "fine".
 *
 * This scanner read only `violations` on its first CI run and reported
 * color-contrast ZERO over all 46 scans while the same commit reported 1002
 * locally. A gate that answers "clean" because it could not measure is the exact
 * defect class this program hunts (DEV_PROCESS 4.3: an empty result is not an
 * absence), so unresolved conformance checks are counted, reported by rule, and
 * fail the build.
 *
 * TARGETS are carried in full rather than sampled, because a subject-bounded
 * adjudication has to be able to ask whether a node is on a named element, and
 * a three-item sample cannot answer that.
 */
export function incompleteConformance(results) {
  const out = new Map();
  for (const r of scanned(results)) {
    for (const v of r.incomplete || []) {
      if (!isConformance(v)) continue;
      for (const [reason, hit] of Object.entries(byReasonOf(v))) {
        const key = `${v.id}|${reason}`;
        const prev = out.get(key) || {
          id: v.id,
          reason,
          key,
          nodes: 0,
          surfaces: [],
          sample: hit.targets.slice(0, 3),
          targets: [],
        };
        prev.targets = [...new Set([...prev.targets, ...hit.targets])];
        prev.nodes += hit.nodes;
        prev.surfaces.push(`${r.surface} [${r.theme}@${r.viewport}]`);
        out.set(key, prev);
      }
    }
  }
  return [...out.values()].sort((a, b) => b.nodes - a.nodes);
}

/**
 * ONE finding per rule AND REASON. axe puts several distinct findings in the
 * incomplete bucket under one rule id, and they carry different adjudications:
 * a geometry-dependent overlap that no count can pin, and a too-short-to-judge
 * cell that a count pins exactly. Merging them made the gate check each entry
 * against the other's number, and both checks were wrong in the same run.
 *
 * Falls back to the whole-entry counts only when a caller hands the old shape,
 * and the fallback is EXPLICIT rather than silent: it names "unknown" as the
 * reason so an entry with no reason cannot pass an adjudication that names one.
 */
function byReasonOf(v) {
  if (v.byReason && Object.keys(v.byReason).length) return v.byReason;
  const reason = (v.reasons || [])[0] || "unknown";
  return { [reason]: { nodes: v.nodes, targets: v.targets || v.sample || [] } };
}

export function summarize(results, axe, base, env = {}) {
  const conformance = new Map();
  const bestPractice = new Map();
  for (const r of scanned(results)) {
    for (const v of r.violations) {
      const bucket = isConformance(v) ? conformance : bestPractice;
      const prev =
        bucket.get(v.id) || {
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: 0,
          surfaces: [],
          tags: v.tags.filter((t) => CONFORMANCE_TAGS.includes(t)),
        };
      prev.nodes += v.nodes;
      prev.surfaces.push(`${r.surface} [${r.viewport}]`);
      bucket.set(v.id, prev);
    }
  }
  const titles = titleFindings(results);
  const focus = focusFindings(results);
  const failed = results.filter((r) => !r.ok);
  const surfaces = new Set(results.map((r) => r.surface));
  const byArm = {};
  const byArmRule = {};
  const incompleteByArmRule = {};
  for (const theme of THEMES) {
    for (const viewport of VIEWPORT_IDS) {
      const arm = armId(theme, viewport);
      const rows = scanned(results).filter((r) => r.theme === theme && r.viewport === viewport);
      byArm[arm] = rows.reduce(
        (sum, r) => sum + r.violations.filter(isConformance).reduce((n, v) => n + v.nodes, 0),
        0,
      );
      byArmRule[arm] = {};
      incompleteByArmRule[arm] = {};
      for (const r of rows) {
        for (const v of r.violations.filter(isConformance)) {
          byArmRule[arm][v.id] = (byArmRule[arm][v.id] || 0) + v.nodes;
        }
        for (const v of (r.incomplete || []).filter(isConformance)) {
          for (const [reason, hit] of Object.entries(byReasonOf(v))) {
            const key = `${v.id}|${reason}`;
            incompleteByArmRule[arm][key] = (incompleteByArmRule[arm][key] || 0) + hit.nodes;
          }
        }
      }
    }
  }
  const byTheme = Object.fromEntries(
    THEMES.map((t) => [
      t,
      VIEWPORT_IDS.reduce((s, v) => s + (byArm[armId(t, v)] || 0), 0),
    ]),
  );
  const coverage = coverageByViewport(results);
  const authority = authorityOf(env);
  return {
    base,
    axeVersion: axe.version,
    themes: THEMES,
    viewports: VIEWPORTS.map((v) => ({ id: v.id, width: v.width, height: v.height, derived: v.derived, basis: v.basis })),
    arms: ARMS,
    /**
     * THE COUNTING RULE, and it now carries both bounds because a figure whose
     * bound is not stated beside it is the DEV_PROCESS 1.2 defect and this one
     * lands in a legal document.
     */
    countingRule:
      `a SCAN is one served URL under one THEME at one VIEWPORT. Themes are ${JSON.stringify(THEMES)} and viewports are ${JSON.stringify(VIEWPORT_IDS)}, so the denominator is ${surfaces.size} surfaces x ${THEMES.length} themes x ${VIEWPORT_IDS.length} viewports = ${results.length} scans, taken over ${results.length / VIEWPORT_IDS.length} page loads. ` +
      `A VIOLATION is one axe rule failing on at least one scan; NODES sums failing DOM elements across all scans; CONFORMANCE means the rule carries wcag2a/wcag2aa/wcag21a/wcag21aa, everything else is best-practice and is not a conformance failure. ` +
      `EVERY NODE COUNT IS BOUNDED BY WHAT AXE EVALUATED, and EVALUATED IS NOT THE SAME AS COVERED - the difference is the DEV_PROCESS 1.2 defect this figure used to carry into a conformance report. ` +
      `At the ${REFERENCE_VIEWPORT.id} viewport axe JUDGED ${coverage[REFERENCE_VIEWPORT.id]?.evaluated} of ${coverage[REFERENCE_VIEWPORT.id]?.rendered} rendered text elements (${coverage[REFERENCE_VIEWPORT.id]?.pctEvaluated}%), while ${coverage[REFERENCE_VIEWPORT.id]?.inViewport} of them (${coverage[REFERENCE_VIEWPORT.id]?.pct}%) were merely INSIDE THE VIEWPORT BOX; at ${FULL_EXTENT_VIEWPORT.id} axe judged ${coverage[FULL_EXTENT_VIEWPORT.id]?.evaluated} of ${coverage[FULL_EXTENT_VIEWPORT.id]?.rendered} (${coverage[FULL_EXTENT_VIEWPORT.id]?.pctEvaluated}%) against ${coverage[FULL_EXTENT_VIEWPORT.id]?.inViewport} contained (${coverage[FULL_EXTENT_VIEWPORT.id]?.pct}%). ` +
      `${coverage[REFERENCE_VIEWPORT.id]?.countingRule} The gap between the two is not unexamined text: it is axe's documented exclusions plus this gate's declared ones, and the part that IS unexamined is refused by evaluationFindings() rather than carried in the percentage.`,
    environment: {
      ...env,
      authority,
      typefaceStates: [...new Set(scanned(results).filter((r) => r.typeface).map((r) => `${r.typeface.ui}/${r.typeface.data}`))],
      geometryWitness: scanned(results).find((r) => r.painted?.geometry)?.painted?.geometry || null,
      typefaceWitness: scanned(results).find((r) => r.typeface)?.typeface || null,
      note:
        "an environment-dependent figure has two answers and no owner unless one run is named the figure of record. Every geometry-dependent finding in this run - anything whose axe reason is one of " +
        JSON.stringify(GEOMETRY_DEPENDENT_REASONS) +
        " - is a function of where text wraps, which is a function of the typeface that rendered. The witness above is what lets two disagreeing machines be diagnosed from one log line instead of reproduced.",
    },
    surfaceCount: surfaces.size,
    surfacesScanned: results.length,
    surfacesOk: results.length - failed.length,
    surfacesFailed: failed.map((r) => ({ surface: `${r.surface} [${r.theme}@${r.viewport}]`, error: r.error })),
    /** Scans that needed a second attempt. Reported, never swallowed: a run that
     *  is quietly retrying is a run whose numbers are less stable than they look. */
    retriedScans: results
      .filter((r) => r.retried)
      .map((r) => ({ surface: `${r.surface} [${r.theme}@${r.viewport}]`, reason: r.retried })),
    conformanceNodesByTheme: byTheme,
    conformanceNodesByArm: byArm,
    coverageByViewport: coverage,
    coverageFindings: coverageFindings(results),
    evaluationFindings: evaluationFindings(results),
    decorativeExempt: decorativeExempt(results),
    decorativeExemptions: DECORATIVE_EXEMPTIONS,
    supersetFindings: supersetFindings(results),
    typefaceFindings: typefaceFindings(results),
    independentContrast: independentContrastFindings(results),
    independentContrastByArm: (() => {
      const byArm = {};
      for (const theme of THEMES) {
        for (const viewport of VIEWPORT_IDS) {
          const arm = armId(theme, viewport);
          byArm[arm] = {};
          for (const r of scanned(results).filter((x) => x.theme === theme && x.viewport === viewport)) {
            for (const f of r.independentContrast?.failures || []) {
              byArm[arm][f.group] = (byArm[arm][f.group] || 0) + f.nodes;
            }
          }
        }
      }
      return byArm;
    })(),
    adjudicationBasisFindings: adjudicationBasisFindings(results),
    /**
     * WHAT THE SECOND INSTRUMENT COULD NOT SETTLE, and what it deliberately did
     * not look at. Both are reported for the same reason axe's incomplete bucket
     * is: an instrument's exclusion set is part of its contract and has to be
     * legible where its output is read (DEV_PROCESS 2.1), and this whole
     * function exists because axe's was not.
     */
    independentContrastCoverage: (() => {
      const rows = scanned(results).filter((r) => r.independentContrast);
      const add = (f) => rows.reduce((n, r) => n + (r.independentContrast[f] || 0), 0);
      return {
        scans: rows.length,
        computed: add("computed"),
        passed: add("passed"),
        failed: add("failed"),
        couldNotCompute: add("couldNotCompute"),
        excludedAriaHidden: add("excludedAriaHidden"),
        decorativeCouldNotCompute: add("decorativeCouldNotCompute"),
        skippedByAxe: add("skippedByAxe"),
        note:
          "ONE POPULATION RULE FOR EVERY FIGURE ON THIS LINE (G-101): all of them count RENDERED, IN-VIEWPORT elements carrying their own text, summed over every scan of the run. That sentence is here because it was briefly untrue - the aria-hidden bucket counted DOM elements over all 92 scans while the bucket printed four words later counted rendered ones, which is two counting rules in one sentence in the instrument built to stop exactly that. " +
          "COMPUTED counts those whose foreground is opaque and whose background resolved to an opaque colour without crossing an image, a gradient, a filter or a translucent layer, and whose own centre hit-tests back to itself. COULD-NOT-COMPUTE is everything else: reported, never scored clean and never scored as a failure. EXCLUDED-ARIA-HIDDEN counts text inside the [aria-hidden='true'] attribute, which is text declared decorative and removed from the accessibility tree, which is the 1.4.3 pure-decoration exception - excluded, and counted, and its ratio computed anyway and printed under DECLARED DECORATIVE, because an exclusion nobody can see the size of is indistinguishable from a blind spot and an exemption nobody can quote a number for cannot be defended. DECORATIVE-COULD-NOT-COMPUTE is the exempted subset whose ratio was not unambiguous, kept separate so the decorative line's own denominator is legible. SKIPPED-BY-AXE counts elements this instrument computed that axe put in no bucket at all, which is the population that made this instrument necessary.",
      };
    })(),
    /** One resolved witness per theme, so a disagreement between two machines
     *  can be diagnosed from the log rather than reproduced. */
    witnesses: THEMES.map((t) => {
      const row = scanned(results).find((r) => r.theme === t && r.painted?.witness);
      return { theme: t, witness: row ? row.painted.witness : null };
    }),
    incompleteConformance: incompleteConformance(results),
    incompleteNodesByArmRule: incompleteByArmRule,
    conformanceNodesByArmRule: byArmRule,
    themeLeverFinding: themeLeverFinding(results),
    conformanceViolations: [...conformance.values()].sort((a, b) => b.nodes - a.nodes),
    bestPracticeViolations: [...bestPractice.values()].sort((a, b) => b.nodes - a.nodes),
    conformanceNodes: [...conformance.values()].reduce((s, v) => s + v.nodes, 0),
    titleFindings: titles,
    focusFindings: focus,
    focusStopsWalked: scanned(results).reduce((s, r) => s + (r.focus || []).length, 0),
    focusViewport: REFERENCE_VIEWPORT.id,
    /** What the keyboard walk could NOT reach, named per surface. An unmeasured
     *  region is not a clean one. */
    focusWalkNotes: scanned(results)
      .filter((r) => (r.focusNotes || []).length)
      .map((r) => ({ surface: r.surface, notes: r.focusNotes })),
    /**
     * Regions this instrument did NOT measure, named with their basis. An empty
     * result is not an absence: a mounted product's own focus indicator is its
     * own conformance question, so it is reported here rather than scored either
     * way. De-duplicated across surfaces, because the same three mounts appear
     * on every one of them.
     */
    unmeasuredMounts: [
      ...new Set(
        scanned(results).flatMap((r) => (r.focusCrossings || []).map((c) => c.id + " -> " + (c.src || "about:blank"))),
      ),
    ].sort(),
    perSurface: results.map((r) => ({
      surface: `${r.surface} [${r.theme}@${r.viewport}]`,
      theme: r.theme,
      viewport: r.viewport,
      canvas: r.ok ? r.painted?.canvas : null,
      url: r.url,
      ok: r.ok,
      title: r.ok ? r.title : null,
      coverage: r.ok ? r.coverage || null : null,
      conformanceRules: r.ok ? r.violations.filter(isConformance).length : null,
      conformanceNodes: r.ok
        ? r.violations.filter(isConformance).reduce((s, v) => s + v.nodes, 0)
        : null,
      unresolvedNodes: r.ok ? (r.incomplete || []).filter(isConformance).reduce((s, v) => s + v.nodes, 0) : null,
      focusStops: r.ok ? (r.focus || []).length : null,
      focusWalkNotes: r.ok ? r.focusNotes || [] : null,
      focusCrossings: r.ok ? (r.focusCrossings || []).length : null,
      focusWithoutIndicator: r.ok ? (r.focus || []).filter((f) => !f.indicator).length : null,
    })),
  };
}

/**
 * The verdict. A build fails on ANY unwaived conformance node, ANY 2.4.2
 * finding, ANY focus stop without an indicator, any surface that did not scan,
 * any unresolved conformance check that has not been adjudicated, any
 * full-extent scan that did not reach full extent, any run where growing the
 * viewport LOST a finding, and any run whose typeface did not land uniformly.
 *
 * The last four are G-99's, and every one of them exists because a number was
 * being read without the condition that made it true.
 */
export function verdict(summary, waivers = WAIVERS, reviewItems = REVIEW_ITEMS) {
  const reasons = [];
  const stale = [];
  const found = new Map(summary.conformanceViolations.map((v) => [v.id, v.nodes]));

  for (const v of summary.conformanceViolations) {
    const w = waivers.find((x) => x.rule === v.id);
    if (!w) {
      reasons.push(`${v.id}: ${v.nodes} node(s), no waiver`);
      continue;
    }
    /**
     * Compared PER ARM, an arm being one theme at one viewport. A per-theme
     * total would let a full-extent regression hide behind a reference
     * improvement, exactly as a single total let a dark regression hide behind
     * a light one - which is the defect that made the pin per theme in G-95.
     */
    for (const [arm, pinned] of Object.entries(w.nodesByArm)) {
      const actual = (summary.conformanceNodesByArmRule?.[arm] || {})[v.id] || 0;
      if (actual > pinned) {
        reasons.push(
          `${v.id} [${arm}]: ${actual} node(s) exceeds the waived ceiling of ${pinned} (${w.countingRule}); the waiver is a ceiling, not permission`,
        );
      } else if (actual < pinned) {
        stale.push(
          `${v.id} [${arm}]: ${actual} node(s) is below the waived ${pinned}; re-pin the waiver to ${actual} or remove it (${w.remove})`,
        );
      }
    }
  }
  for (const w of waivers) {
    /**
     * The axe ledger's zero arm judges AXE RULES ONLY. A waiver on the second
     * instrument's own findings has its own zero arm further down, and running
     * both over one entry made the gate demand the deletion of a waiver whose
     * cause was firing 334 times in the same run - the loudest possible way to
     * be wrong, and it fired on the first end-to-end run.
     */
    if (w.rule.startsWith("independent-contrast")) continue;
    if (!found.has(w.rule)) {
      reasons.push(
        `${w.rule}: 0 node(s) on every arm. The waiver's cause is gone - delete its entry from WAIVERS in src/a11y-gate.mjs. A waived rule that no longer fails is an exception outliving its reason.`,
      );
    }
  }

  for (const inc of summary.incompleteConformance || []) {
    const context = `sample ${JSON.stringify(inc.sample)}; reason ${JSON.stringify(inc.reason)}; on ${JSON.stringify([...new Set(inc.surfaces)].slice(0, 4))}`;
    /**
     * Adjudicated only when EVERY reason axe gave is one that has been
     * adjudicated. One unrecognised reason in the set and the whole rule fails,
     * because the counts are aggregated per rule and cannot be split between an
     * adjudicated reason and a new one without pretending to a precision this
     * aggregation does not have.
     */
    const item = reviewFor(inc.id, inc.reason, reviewItems);
    if (!item) {
      reasons.push(
        `${inc.id}: ${inc.nodes} node(s) axe could NOT SETTLE across ${new Set(inc.surfaces).size} scan(s), and no adjudication covers ${JSON.stringify(inc.reason)}. An unresolved conformance check is not a pass; ${context}`,
      );
      continue;
    }
    {
      if (isSubjectBounded(item)) {
        /**
         * SUBJECT-BOUNDED. The count is not pinned, because it was measured at
         * 0, 2 and 88 on one commit across three environments. The SUBJECT is
         * pinned, so a node on a new element fails while the same elements at a
         * different count do not - and the count is still printed, loudly, in
         * the report above. Un-pinned is not un-reported.
         */
        const strays = (inc.targets || []).filter(
          (t) => !item.subjects.some((s) => t === s || t.includes(s)),
        );
        if (strays.length) {
          reasons.push(
            `${inc.id}: ${strays.length} unresolved node(s) OUTSIDE the adjudicated subject set ${JSON.stringify(item.subjects)}: ${JSON.stringify(strays.slice(0, 6))}. The adjudication for ${item.reason} covers named elements, not the rule; a new element is a new finding. ${context}`,
          );
        }
      } else {
        for (const [arm, pinned] of Object.entries(item.nodesByArm)) {
          const actual = (summary.incompleteNodesByArmRule?.[arm] || {})[inc.key] || 0;
          if (actual > pinned) {
            reasons.push(
              `${inc.id}/${inc.reason} [${arm}]: ${actual} unresolved node(s) exceeds the ${pinned} adjudicated (${item.countingRule}); an adjudication is a ceiling, not permission. ${context}`,
            );
          } else if (actual < pinned) {
            stale.push(
              `${inc.id}/${inc.reason} [${arm}]: ${actual} unresolved node(s) is below the ${pinned} adjudicated; re-pin the REVIEW_ITEMS entry to ${actual}, or remove it (${item.remove}). Below the pin is a NOTE rather than a failure because an adjudication hides an unknown, not a violation.`,
            );
          }
        }
      }
    }
  }
  /**
   * AND HERE THE ADJUDICATION LEDGER IS DELIBERATELY NOT A WAIVER, which is the
   * one asymmetry between them and it is worth its paragraph.
   *
   * A waiver hides a VIOLATION, so a waived rule reaching zero must FAIL: the
   * exception has outlived its cause and is now masking nothing while looking
   * like it masks something. An adjudication hides an UNKNOWN. If it stops
   * appearing, nothing is being concealed, and the honest report is a note.
   *
   * It also has to be a note, because these findings are environment dependent:
   * elmPartiallyObscuring was measured at 0 nodes, 2 nodes and 88 nodes on one
   * commit across three environments. A both-directions ratchet on a figure the
   * environments disagree about would make the gate unrunnable on one of them,
   * which is a dead gate in the most literal sense.
   */
  for (const item of reviewItems) {
    if (!(summary.incompleteConformance || []).some((inc) => inc.id === item.rule && inc.reason === item.reason)) {
      stale.push(
        `${item.rule} / ${item.reason}: 0 unresolved node(s) here${isSubjectBounded(item) ? "" : `, against ${JSON.stringify(item.nodesByArm)} adjudicated`}. Either the cause is gone, in which case delete the REVIEW_ITEMS entry, or this environment simply renders it differently - which is what this entry records (${item.remove}).`,
      );
    }
  }
  for (const v of summary.bestPracticeViolations) {
    const why = GATED_BEST_PRACTICE[v.id];
    if (!why) continue;
    reasons.push(`${v.id}: ${v.nodes} node(s). ${why}`);
  }
  if (summary.titleFindings.length) reasons.push(`${summary.titleFindings.length} 2.4.2 finding(s)`);
  if (summary.focusFindings.length) reasons.push(`${summary.focusFindings.length} 2.4.7 finding(s)`);
  if (summary.surfacesFailed.length) reasons.push(`${summary.surfacesFailed.length} scan(s) did not run`);
  if (summary.themeLeverFinding) reasons.push(summary.themeLeverFinding);
  for (const f of summary.coverageFindings || []) {
    reasons.push(`coverage [${f.surface}]: ${f.detail}`);
  }
  for (const f of summary.evaluationFindings || []) {
    reasons.push(`${f.kind} [${f.surface}]: ${f.detail}`);
  }
  for (const f of summary.supersetFindings || []) {
    reasons.push(`viewport growth [${f.surface}]: ${f.detail}`);
  }
  for (const f of summary.typefaceFindings || []) {
    reasons.push(`typeface: ${f.detail}`);
  }
  /**
   * THE SECOND INSTRUMENT'S VERDICT, on the same ledger terms as the first. A
   * group here is waived exactly as an axe rule is - per arm, with an owner, a
   * basis and a removal condition - so the escape hatch for a finding this lane
   * cannot fix is the one that already exists rather than a new one.
   */
  for (const f of summary.independentContrast || []) {
    /** Matched on rule AND GROUP: the second instrument reports per element
     *  group, and one waiver covering every group would be a blanket exception
     *  wearing a specific one's clothes. */
    const w = waivers.find((x) => x.rule === f.id && x.group === f.group);
    /* one lookup rule, and waiverFor() now implements the same one. */
    if (!w) {
      reasons.push(
        `${f.id} [${f.group}]: ${f.nodes} rendered element(s) computed at ${JSON.stringify(f.ratios)}:1 against a ${f.required}:1 requirement, and axe reported them in NO bucket - not a violation, not a pass, not incomplete. No waiver. Sample ${JSON.stringify(f.sample)}`,
      );
      continue;
    }
    for (const [arm, pinned] of Object.entries(w.nodesByArm)) {
      const actual = (summary.independentContrastByArm?.[arm] || {})[f.group] || 0;
      if (actual > pinned) {
        reasons.push(
          `${f.id} [${f.group}] [${arm}]: ${actual} element(s) exceeds the waived ceiling of ${pinned} (${w.countingRule}); the waiver is a ceiling, not permission`,
        );
      } else if (actual < pinned) {
        stale.push(
          `${f.id} [${f.group}] [${arm}]: ${actual} element(s) is below the waived ${pinned}; re-pin the waiver to ${actual} or remove it (${w.remove})`,
        );
      }
    }
  }
  /**
   * THE ZERO ARM, AND IT COULD NOT FIRE. G-101.
   *
   * This asked whether the second instrument's findings array was EMPTY. It never
   * asked whether THIS waiver's own group was in it - so with two entries and one
   * of them still firing 334 times, the other sat pinned at 7 nodes against an
   * actual 0 and the gate said nothing about it, on main, through a green run.
   * The per-arm loop above cannot catch it either: it iterates the findings, so a
   * group that has stopped firing produces no row to compare against its pins.
   *
   * A gating indicator is tested for its ability to FIRE before it is trusted
   * (DEV_PROCESS 2.2). This one was not, and it is the second control in this
   * file's short history to be found broken by running it rather than by reading
   * it. Now it asks per group, and the test plants a stale group to watch it.
   */
  for (const w of waivers) {
    if (!w.rule.startsWith("independent-contrast")) continue;
    const fired = (summary.independentContrast || []).some((f) => f.id === w.rule && f.group === w.group);
    if (!fired) {
      reasons.push(
        `${w.rule} [${w.group}]: 0 element(s) on every arm. The waiver's cause is gone - delete its entry from WAIVERS in src/a11y-gate.mjs. A waived finding that no longer fires is an exception outliving its reason.`,
      );
    }
  }
  /**
   * AND THE ADJUDICATIONS ARE RE-MEASURED RATHER THAN READ. An entry that says a
   * pair reads acceptably is asserting a ratio; if this run's own computation
   * says otherwise, the entry is refused rather than believed.
   */
  for (const f of summary.adjudicationBasisFindings || []) {
    if (f.kind === "refuted") reasons.push(`adjudication ${f.rule}: ${f.detail}`);
    else stale.push(`adjudication ${f.rule}: ${f.detail}`);
  }
  return { pass: reasons.length === 0, reasons, stale };
}
