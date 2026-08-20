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

/** The pack an unqualified URL resolves to. Stated, not assumed. */
export const DEFAULT_PACK = TEMPLATE_CITY;

/** Scanned as its own surface: the honest-empty pack, which is the regression
 *  target for every absence state on this product. */
export const SCANNED_PACKS = [EMPTY_CITY];

/** Named, not omitted: tenant-private, so an anonymous scan measures the
 *  tenancy refusal rather than the surface. */
export const EXCLUDED_PACKS = [
  { cityKey: FIXTURE_CITY.cityKey, basis: "tenant-private; an anonymous scan measures the tenancy refusal, not the surface" },
];

function target(surface, params) {
  const query = new URLSearchParams(params);
  const search = `?${query}`;
  return { surface, url: `/${search}`, search, params: { ...params } };
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
  const pack = key ? SCANNED_PACKS.find((p) => p.cityKey === key) : DEFAULT_PACK;
  const model = resolveStaffLensQuery(t.search);
  if (!pack) return surfaceTitle(model);
  return surfaceTitle(model, cityIdentity(pack).documentTitle);
}
