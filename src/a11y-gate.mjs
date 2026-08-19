/**
 * ---------------------------------------------------------------------------
 * G-95. THE PURE HALF OF THE ACCESSIBILITY GATE.
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
 * ---------------------------------------------------------------------------
 */

import { THEMES } from "./theme.mjs";

/** Conformance is the rule's own tag set, never a hand-kept list of rule ids. */
export const CONFORMANCE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * ---------------------------------------------------------------------------
 * THE ONE WAIVER, and it is a RATCHET rather than amnesty.
 *
 * The gate refuses a build at any WCAG A or AA node. One rule is carried as an
 * explicit exception because it is not this repo's to fix, and DEV_PROCESS 2.0
 * is the reason it is carried rather than ignored: a permanently-red gate is a
 * dead gate, so the contract is split - one predicate for the space the rule
 * governs, one named exception with its owner and its removal condition.
 *
 * It cannot rot into amnesty, because it fires in BOTH directions:
 *   actual > nodes   FAIL. The waiver is a ceiling and the count went up.
 *   actual === 0     FAIL. The cause is gone; delete the entry.
 *   0 < actual < nodes  PASS, with a loud STALE line naming the new figure.
 * An exception that can only ever be satisfied is the control that never fires.
 *
 * THE CORRECTION THAT BELONGS BESIDE IT (DEV_PROCESS 3.2a, quoted at source).
 * The wave-3 brief records this finding as "cannot be fixed in a Dashboards PR"
 * because the failing selectors are "kit classes". Measured, that is half
 * right and the half that is wrong matters. The declarations that fail are in
 * web/shell.css, not in web/sc-kit.css:
 *     web/shell.css:162  .p-quiet { color: var(--sc-quiet); background: var(--sc-quiet-wash); }
 *     web/shell.css:632  .navitem .badge { ... color: var(--sc-ink-3); ... }
 *     web/shell.css:643  .navitem.roster { color: var(--sc-ink-3); }
 * web/sc-kit.css contains no .badge, .p-quiet or .navitem rule at all. What the
 * kit owns is the TOKEN VALUES those rules consume, and the measured ratios say
 * the tokens are where the fix belongs: --sc-ink-3 / --sc-quiet resolve to
 * #7B8B99 dark and #6C7E8E light, and every failure is one of them -
 * 4.08:1 for #7b8b99 on the nav ground, 4.2:1 for the quiet pill, 3.58:1 for
 * #6c7e8e on --sc-quiet-wash #e9eef2, 4.18:1 for a .basis line on white, all
 * against a 4.5:1 requirement. Those two tokens carry the same value and fail
 * identically wherever the kit is vendored, so the product-line token pass is
 * the right owner - but "a Dashboards PR could not touch it" is not what the
 * source says, and a successor should know a re-pairing was possible and was
 * declined on scope rather than on capability.
 * ---------------------------------------------------------------------------
 */
export const WAIVERS = [
  {
    rule: "color-contrast",
    /**
     * PINNED PER THEME, not as a total, and that is the whole point of the
     * shape. A single total passes a build where dark regresses by ten and
     * light improves by ten, which is a real customer-facing failure arriving
     * under an unchanged number. Two pins cannot be compensated against each
     * other.
     */
    nodesByTheme: { light: 930, dark: 72 },
    countingRule:
      "failing DOM elements summed across the 23 scanned surfaces, per theme; the 16-surface subset the wave-3 baseline used reads light 643 / dark 54, which is what the sibling lane measured independently",
    owner: "G-94, the product-line token pass",
    basis:
      "every failing node resolves to --sc-ink-3 or --sc-quiet, whose values live in web/sc-kit.css; that file is byte-identical across smartcity-dashboards, smart-files and plan-review, and a repo that edits a token value has forked the system",
    remove: "when the contrast remediation on the --sc-quiet / --sc-ink-3 scale lands in web/sc-kit.css",
  },
];

export const waivedTotal = (w) => Object.values(w.nodesByTheme).reduce((a, b) => a + b, 0);

export const waiverFor = (id) => WAIVERS.find((w) => w.rule === id) || null;

/**
 * The classes this gate refuses a build on, each with the plant that proves it
 * can fire. `node scripts/a11y-scan.mjs --plant <id>` injects the named defect
 * into every surface and the run must go red naming it (DEV_PROCESS 2.2).
 *
 * The plants are DOM mutations applied in the page after load rather than edits
 * to web/index.html, so proving the gate does not require committing a broken
 * document and then remembering to revert it.
 */
/* --------------------------------------------------------------- reporting */

export const isConformance = (v) => v.tags.some((t) => CONFORMANCE_TAGS.includes(t));

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
   * the title is theme-independent, so a naive pass would report every title as
   * shared with itself. The cross-theme equality is asserted separately below,
   * because "the title does not depend on the palette" is a real claim and an
   * unasserted one is an assumption.
   */
  const seenSurface = new Set();
  const titleBySurface = new Map();
  for (const r of results.filter((x) => x.ok)) {
    const prior = titleBySurface.get(r.surface);
    if (prior !== undefined && prior !== r.title) {
      out.push({
        surface: r.surface,
        kind: "theme-dependent",
        detail: `title differs between themes: ${JSON.stringify(prior)} and ${JSON.stringify(r.title)}`,
      });
    }
    titleBySurface.set(r.surface, r.title);
  }
  for (const r of results.filter((x) => x.ok)) {
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
  for (const r of results.filter((x) => x.ok)) {
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
 */
export function themeLeverFinding(results) {
  const ok = results.filter((r) => r.ok);
  if (THEMES.length < 2) return null;
  const bySurface = new Map();
  for (const r of ok) {
    if (!bySurface.has(r.surface)) bySurface.set(r.surface, new Set());
    bySurface.get(r.surface).add(r.painted?.canvas);
  }
  const moved = [...bySurface.values()].filter((set) => set.size > 1).length;
  if (moved > 0) return null;
  return `the palette painted identically under all ${THEMES.length} themes on all ${bySurface.size} surfaces; the theme lever did not move and this run measured one palette ${THEMES.length} times`;
}

export function summarize(results, axe, base) {
  const conformance = new Map();
  const bestPractice = new Map();
  for (const r of results.filter((x) => x.ok)) {
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
      prev.surfaces.push(r.surface);
      bucket.set(v.id, prev);
    }
  }
  const titles = titleFindings(results);
  const focus = focusFindings(results);
  const failed = results.filter((r) => !r.ok);
  const surfaces = new Set(results.map((r) => r.surface));
  const byTheme = {};
  const byThemeRule = {};
  for (const t of THEMES) {
    const rows = results.filter((r) => r.ok && r.theme === t);
    byTheme[t] = rows.reduce(
      (sum, r) => sum + r.violations.filter(isConformance).reduce((n, v) => n + v.nodes, 0),
      0,
    );
    byThemeRule[t] = {};
    for (const r of rows) {
      for (const v of r.violations.filter(isConformance)) {
        byThemeRule[t][v.id] = (byThemeRule[t][v.id] || 0) + v.nodes;
      }
    }
  }
  return {
    base,
    axeVersion: axe.version,
    themes: THEMES,
    countingRule:
      `a SCAN is one served URL under one theme, and both of ${JSON.stringify(THEMES)} are scanned, so the denominator is ${surfaces.size} surfaces x ${THEMES.length} themes = ${results.length} scans; a VIOLATION is one axe rule failing on at least one scan; NODES sums failing DOM elements across all scans; CONFORMANCE means the rule carries wcag2a/wcag2aa/wcag21a/wcag21aa, everything else is best-practice and is not a conformance failure`,
    surfaceCount: surfaces.size,
    surfacesScanned: results.length,
    surfacesOk: results.length - failed.length,
    surfacesFailed: failed.map((r) => ({ surface: `${r.surface} [${r.theme}]`, error: r.error })),
    /** Scans that needed a second attempt. Reported, never swallowed: a run that
     *  is quietly retrying is a run whose numbers are less stable than they look. */
    retriedScans: results
      .filter((r) => r.retried)
      .map((r) => ({ surface: `${r.surface} [${r.theme}]`, reason: r.retried })),
    conformanceNodesByTheme: byTheme,
    conformanceNodesByThemeRule: byThemeRule,
    themeLeverFinding: themeLeverFinding(results),
    conformanceViolations: [...conformance.values()].sort((a, b) => b.nodes - a.nodes),
    bestPracticeViolations: [...bestPractice.values()].sort((a, b) => b.nodes - a.nodes),
    conformanceNodes: [...conformance.values()].reduce((s, v) => s + v.nodes, 0),
    titleFindings: titles,
    focusFindings: focus,
    focusStopsWalked: results
      .filter((r) => r.ok)
      .reduce((s, r) => s + (r.focus || []).length, 0),
    /** What the keyboard walk could NOT reach, named per surface. An unmeasured
     *  region is not a clean one. */
    focusWalkNotes: results
      .filter((r) => r.ok && (r.focusNotes || []).length)
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
        results
          .filter((r) => r.ok)
          .flatMap((r) => (r.focusCrossings || []).map((c) => c.id + " -> " + (c.src || "about:blank"))),
      ),
    ].sort(),
    perSurface: results.map((r) => ({
      surface: `${r.surface} [${r.theme}]`,
      theme: r.theme,
      canvas: r.ok ? r.painted?.canvas : null,
      url: r.url,
      ok: r.ok,
      title: r.ok ? r.title : null,
      conformanceRules: r.ok ? r.violations.filter(isConformance).length : null,
      conformanceNodes: r.ok
        ? r.violations.filter(isConformance).reduce((s, v) => s + v.nodes, 0)
        : null,
      focusStops: r.ok ? (r.focus || []).length : null,
      focusWalkNotes: r.ok ? r.focusNotes || [] : null,
      focusCrossings: r.ok ? (r.focusCrossings || []).length : null,
      focusWithoutIndicator: r.ok ? (r.focus || []).filter((f) => !f.indicator).length : null,
    })),
  };
}

/**
 * The verdict. A build fails on ANY conformance node, ANY 2.4.2 finding, ANY
 * focus stop without an indicator, and on any surface that did not scan - the
 * last one because a surface that errored is an unmeasured surface, and an
 * empty result is not an absence (DEV_PROCESS 4.3).
 */
export function verdict(summary, waivers = WAIVERS) {
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
     * Compared PER THEME. A total would let a dark regression hide behind a
     * light improvement, and the reason this gate scans both themes at all is
     * that a whole palette went unmeasured behind a number that looked right.
     */
    for (const [theme, pinned] of Object.entries(w.nodesByTheme)) {
      const actual = (summary.conformanceNodesByThemeRule?.[theme] || {})[v.id] || 0;
      if (actual > pinned) {
        reasons.push(
          `${v.id} [${theme}]: ${actual} node(s) exceeds the waived ceiling of ${pinned} (${w.countingRule}); the waiver is a ceiling, not permission`,
        );
      } else if (actual < pinned) {
        stale.push(
          `${v.id} [${theme}]: ${actual} node(s) is below the waived ${pinned}; re-pin the waiver to ${actual} or remove it (${w.remove})`,
        );
      }
    }
  }
  for (const w of waivers) {
    if (!found.has(w.rule)) {
      reasons.push(
        `${w.rule}: 0 node(s) on every theme. The waiver's cause is gone - delete its entry from WAIVERS in scripts/a11y-scan.mjs. A waived rule that no longer fails is an exception outliving its reason.`,
      );
    }
  }

  if (summary.titleFindings.length) reasons.push(`${summary.titleFindings.length} 2.4.2 finding(s)`);
  if (summary.focusFindings.length) reasons.push(`${summary.focusFindings.length} 2.4.7 finding(s)`);
  if (summary.surfacesFailed.length) reasons.push(`${summary.surfacesFailed.length} scan(s) did not run`);
  if (summary.themeLeverFinding) reasons.push(summary.themeLeverFinding);
  return { pass: reasons.length === 0, reasons, stale };
}

