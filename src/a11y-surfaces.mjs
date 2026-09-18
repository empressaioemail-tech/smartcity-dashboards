/**
 * ---------------------------------------------------------------------------
 * G-95. THE SURFACE LIST THE ACCESSIBILITY GATE SCANS, DERIVED.
 *
 * A hand-written list of URLs is the same defect this repo already paid for in
 * src/served-surface.mjs: the list was written once, the product grew, and
 * nothing connected the two, so three of five markup sources went unscanned. A
 * lens added in a later wave must be scanned without anyone remembering, so
 * every target below is built from the id sets src/staff-review.mjs exports and
 * the packs src/city-pack.mjs exports.
 *
 * WHAT A SURFACE IS, and it is the denominator every number in the gate's
 * output is quoted against: one served URL that a person can navigate to
 * directly. Every nav item and every tab in this product is a real <a href>
 * full navigation, so a tab is a surface in exactly the way a lens is, and the
 * baseline that counted only lenses and work views was counting a subset.
 *
 * THE TWO SUBSETS, both reported, never merged:
 *   BASELINE_SURFACES  the 16 the pre-fix baseline measured - nine lenses, six
 *                      work views, empty-city - so a before/after comparison
 *                      reads against the same denominator it was taken on.
 *   A11Y_TARGETS       every surface, tabs included. This is what the gate runs.
 *
 * PACK COVERAGE. fixture-city is tenant-private and reachable only to an
 * identified caller, so an anonymous scan of it measures the tenancy refusal
 * rather than the surface. It is named here as a deliberate exclusion rather
 * than omitted, because an unmentioned exclusion is the failure state
 * (DEV_PROCESS 3.3).
 * ---------------------------------------------------------------------------
 */

import {
  ALL_LENS_IDS,
  WORK_IDS,
  DS_TABS,
  ASSET_TABS,
  DEVELOPMENT_SERVICES_LENS,
  ASSETS_WORK,
  resolveStaffLensQuery,
  surfaceTitle,
  PRODUCT_TITLE,
} from "./staff-review.mjs";
import { TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY } from "./city-pack.mjs";
import { cityIdentity } from "./city-identity.mjs";

export { PRODUCT_TITLE };

/** The pack the gate NAMES on every surface that does not name one.
 *
 *  G-161 corrected this: it used to read "The pack an unqualified URL resolves
 *  to", which was true while the client carried `cityKey || DEFAULT_CITY_KEY`
 *  and is false now that the default is gone. An unqualified URL resolves to NO
 *  pack and renders the stated no-city panel, so a gate that scanned
 *  `?lens=finance` bare would have measured that panel 23 times instead of the
 *  23 surfaces it exists to measure - and would have been red on every title,
 *  because the pack's name is in the title and nothing would have put it there.
 *  Every lens and work target therefore carries `cityKey` explicitly; see
 *  target() below, and src/a11y-gate.test.mjs holds it.
 *
 *  The pack itself is unchanged, and so are the rendered surfaces: naming it is
 *  what the product does when someone clicks a nav item on it, and it is what the
 *  pre-G-161 bare URL resolved to by default. The figures stay comparable. */
export const DEFAULT_PACK = TEMPLATE_CITY;

/** Scanned as its own surface: the honest-empty pack, which is the regression
 *  target for every absence state on this product. */
export const SCANNED_PACKS = [EMPTY_CITY];

/** Named, not omitted: tenant-private, so an anonymous scan measures the
 *  tenancy refusal rather than the surface. */
export const EXCLUDED_PACKS = [
  { cityKey: FIXTURE_CITY.cityKey, basis: "tenant-private; an anonymous scan measures the tenancy refusal, not the surface" },
];

/**
 * G-161. Every pack this file must be able to compose a title for: the two the
 * gate scans, and the one it excludes by name. A FOURTH pack added to
 * src/city-pack.mjs and scanned without being added here throws in
 * expectedTitle() rather than quietly returning a title with no pack in it.
 */
const PACKS_BY_KEY = new Map([TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY].map((p) => [p.cityKey, p]));

/**
 * G-161. A target NAMES its pack, and the caller may not omit it.
 *
 * The pack is defaulted here rather than at each call site so that a target
 * added later cannot forget it, and so that a lens target that wants a different
 * pack can still say so (`packTargets()` passes empty-city and overrides this
 * default). Before G-161 a lens target deliberately carried no `cityKey`: the
 * client resolved one, and the URL was shorter. That is no longer a real URL -
 * it renders the no-city panel - so a target without a pack would be scanning a
 * surface nobody meant to name.
 */
function target(surface, params) {
  const query = new URLSearchParams({ cityKey: DEFAULT_PACK.cityKey, ...params });
  const search = `?${query}`;
  return { surface, url: `/${search}`, search, params: { cityKey: DEFAULT_PACK.cityKey, ...params } };
}

/**
 * Every lens, with the development-services tabs expanded because each tab is
 * its own href. The expansion is driven by which lens the tab resolver actually
 * answers for, not by a hardcoded lens id here.
 */
function lensTargets() {
  const out = [];
  for (const lens of ALL_LENS_IDS) {
    if (lens === DEVELOPMENT_SERVICES_LENS) {
      for (const tab of DS_TABS) out.push(target(`lens-${lens}-${tab}`, { lens, tab }));
      continue;
    }
    out.push(target(`lens-${lens}`, { lens }));
  }
  return out;
}

function workTargets() {
  const out = [];
  for (const work of WORK_IDS) {
    if (work === ASSETS_WORK) {
      for (const atab of ASSET_TABS) out.push(target(`work-${work}-${atab}`, { work, atab }));
      continue;
    }
    out.push(target(`work-${work}`, { work }));
  }
  return out;
}

function packTargets() {
  return SCANNED_PACKS.map((pack) => target(`${pack.cityKey}-overview`, { cityKey: pack.cityKey }));
}

/** Every surface the gate scans. */
export const A11Y_TARGETS = [...lensTargets(), ...workTargets(), ...packTargets()];

/**
 * The 16 the pre-fix baseline measured, so the before/after figures are read
 * against one denominator. Derived from the same id sets: one target per lens
 * and per work view at its DEFAULT tab, plus the empty pack.
 */
export const BASELINE_SURFACES = [
  ...ALL_LENS_IDS.map((lens) =>
    lens === DEVELOPMENT_SERVICES_LENS ? `lens-${lens}-${DS_TABS[0]}` : `lens-${lens}`,
  ),
  ...WORK_IDS.map((work) => (work === ASSETS_WORK ? `work-${work}-${ASSET_TABS[0]}` : `work-${work}`)),
  ...SCANNED_PACKS.map((pack) => `${pack.cityKey}-overview`),
];

/**
 * The title a surface must carry ONCE THE PACK HAS READ, which is the state the
 * gate measures - it waits for the network to settle before it reads anything.
 *
 * Composed from the same two resolvers the product uses: surfaceTitle() for the
 * surface part and cityIdentity() for the pack part. Nothing is spelled out
 * here, so a label change moves the expectation and the product together and
 * this file cannot drift into being a second opinion.
 */
export function expectedTitle(t) {
  const key = t.params.cityKey;
  const pack = key ? PACKS_BY_KEY.get(key) : DEFAULT_PACK;
  /**
   * G-161. The lookup searches EVERY pack this file knows, not SCANNED_PACKS.
   * It used to be `SCANNED_PACKS.find(...)`, which was fine while only the pack
   * targets carried a cityKey - now every target does, and the default pack is
   * not a scanned pack, so the old lookup would have dropped the pack's name out
   * of the expected title for 23 of the 24 surfaces while looking like a
   * deliberate answer. An unknown key throws rather than returning a title for a
   * pack nobody can name.
   */
  if (key && !pack) throw new Error(`an accessibility target names the pack ${key}, which this file has no pack for`);
  const model = resolveStaffLensQuery(t.search);
  if (!pack) return surfaceTitle(model);
  return surfaceTitle(model, cityIdentity(pack).documentTitle);
}
