/**
 * ---------------------------------------------------------------------------
 * G-90. THE THEME RULE, DECLARED ONCE.
 *
 * The live staff dashboard this product replaces persists a staff member's
 * light/dark choice and defaults dark. This product hardcoded data-theme="dark"
 * on the root and offered no control, so the choice was not a capability a
 * staff member could carry over.
 *
 * The city name is deliberately absent from this file and from every other
 * source the browser receives. That is not squeamishness: src/ui.test.mjs runs
 * a case-insensitive city-name gate over all served markup, this file joined
 * that population the moment it became a served script, and the gate caught the
 * first draft of this comment. Naming the predecessor as "the live staff
 * dashboard" is the honest and gate-clean way to cite it.
 *
 * WHY THIS FILE EXISTS RATHER THAN TWO STRING LITERALS IN app.js. The theme has
 * to be resolved BEFORE FIRST PAINT, and the only code that runs before first
 * paint is the classless inline script in the head of web/index.html. That
 * script cannot import this module: an importing script is a module, a module
 * is deferred by definition, and a deferred resolution is the flash - the exact
 * defect G-89 was opened to kill, one attribute over.
 *
 * So the vocabulary genuinely has two implementations, and per DEV_PROCESS 2.4
 * the divergence test IS the control rather than two careful edits. This file is
 * the authority; the head script carries the copy; src/first-paint.test.mjs
 * compares them textually AND behaviourally, and is watched failing on an
 * injected disagreement.
 *
 * NOTHING HERE TOUCHES THE DOM. Same posture as src/staff-map.mjs and
 * src/staff-review.mjs: pure functions over a query or a stored value, so they
 * are testable in Node without a browser and the addressability gate can state
 * as a positive determination that they address nothing.
 *
 * NO TOKEN LIVES HERE EITHER. web/sc-kit.css already implements the whole
 * three-state contract - a light palette on bare :root, the dark palette under
 * @media (prefers-color-scheme: dark) guarded as :root:not([data-theme="light"])
 * so an explicit light choice wins on a dark-preferring machine, and the same
 * dark palette again under :root[data-theme="dark"] so an explicit dark choice
 * wins on a light-preferring one. Stamping the attribute is the entire
 * mechanism, and that file is byte-identical across three repos and is not
 * edited here.
 * ---------------------------------------------------------------------------
 */

/**
 * The two explicit themes. There is deliberately no third "system" value: the
 * kit already treats an ABSENT attribute as system, so a stored "system" would
 * be a second way of saying nothing and would need its own branch in two
 * implementations. Absence is the system state.
 */
export const THEMES = ["light", "dark"];

/**
 * Dark, matching the predecessor's `localStorage theme || "dark"`. Light is a
 * first-class theme in this system rather than a degraded mode - the design
 * language calls it paper - so this is a default, not a preference ranking.
 */
export const FALLBACK_THEME = "dark";

/**
 * The storage key, matching the predecessor's `theme`. Named here so the head
 * script's copy has something to be compared against; a key that drifts silently
 * loses every staff member's saved choice and looks like nothing happened.
 */
export const THEME_STORAGE_KEY = "theme";

/**
 * A stored value resolved to a theme. Total: anything not in the whitelist
 * resolves to the fallback, including null, undefined, "", "system" and a value
 * written by an older or newer build. The head script's `pick()` helper is the
 * same rule, which is what the divergence test compares.
 */
export function resolveTheme(stored) {
  const value = String(stored == null ? "" : stored).trim();
  return THEMES.includes(value) ? value : FALLBACK_THEME;
}

/**
 * What the toggle switches to. Derived from the whitelist by rotation rather
 * than written as light-means-dark, so it stays correct if a third theme is ever
 * added and does not become a second place that has to be edited.
 */
export function nextTheme(current) {
  const at = THEMES.indexOf(resolveTheme(current));
  return THEMES[(at + 1) % THEMES.length];
}

/**
 * The control's label and title. One resolver, because a button whose label and
 * whose accessible name are written in two places drifts into disagreeing about
 * what it does - and this button's whole job is to say which way it will move.
 */
export function themeToggleLabel(current) {
  return resolveTheme(current) === "dark" ? "Light" : "Dark";
}

export function themeToggleTitle(current) {
  return `Switch to the ${themeToggleLabel(current).toLowerCase()} theme`;
}
