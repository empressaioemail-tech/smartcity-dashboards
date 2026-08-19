import { ADAPTER_KINDS } from "./adapters.mjs";
import { ENVIRONMENTS, environmentBadgeLabel } from "./city-pack.mjs";

/* --------------------------------------------------------------- identity

The chrome's identity, derived from the active pack and from nothing else.

This module exists because the top bar, the seal, the environment badge, the
document title, the Compass scope and the nav footer were static markup. A pack
switch changed the breadcrumb and left the most prominent identity on the screen
naming a city the visitor was not looking at, so "swap a city with one command"
could not be demonstrated on the shipped product.

Everything here is a pure function of a pack. There is one resolver, so the
divergence test between the rule and its rendering has one place to point at.
*/

export const PRODUCT_TITLE = "SmartCity Dashboards";

/**
 * The vocabulary static markup is allowed to use before the pack resolves.
 *
 * The constraint is that a fallback must be honest about being a fallback
 * rather than asserting a specific city. web/app.js reads its fallback out of
 * the DOM rather than carrying its own copy, so this list and the shipped
 * markup are one rule with one implementation, and a test holds the markup to
 * it.
 */
export const IDENTITY_FALLBACK = Object.freeze({
  displayName: "This city",
  cityKey: "this pack",
  seal: "",
  environmentBadge: "Demo",
  sourcesLabel: "Sources not read",
  sourcesRule: "no grant count has been read for this pack",
  demonstratedLabel: "Demonstration not read",
  demonstratedRule: "no demonstration count has been read for this pack",
});

export const FALLBACK_VOCABULARY = Object.freeze([
  IDENTITY_FALLBACK.displayName,
  IDENTITY_FALLBACK.cityKey,
]);

/**
 * State by FIPS prefix. A pack's jurisdictionFips is a county or place code and
 * its first two digits are the state, which is the invariant this reads; it
 * never reconstructs a code from a name.
 *
 * Exclusion set, stated where the output is read: the 50 states, DC, and the
 * five inhabited territories. Anything else resolves to no state WITH a basis
 * rather than to a silent blank, because an empty result is not an absence.
 */
export const STATE_BY_FIPS = Object.freeze({
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP",
  "72": "PR", "78": "VI",
});

/**
 * Seal initials from the pack's own display name. Two letters, because the seal
 * is a 24px box in mono at 12px and a third letter does not fit the design.
 */
export function sealInitials(displayName) {
  const words = String(displayName || "")
    .trim()
    .split(/[\s._/-]+/)
    .filter(Boolean);
  const letters = [];
  for (const word of words) {
    const first = word[0];
    if (/[A-Za-z0-9]/.test(first)) letters.push(first.toUpperCase());
    if (letters.length === 2) break;
  }
  return letters.join("");
}

/**
 * The state suffix beside the city name. No shipped pack carries a
 * jurisdictionFips, so today every pack resolves to no state, and the top bar
 * stops asserting TX for a city that is nowhere.
 */
export function packState(pack) {
  const fips = String(pack?.jurisdictionFips ?? "").trim();
  if (!fips) {
    return {
      code: null,
      basis: "the pack carries no jurisdictionFips, so no state is named",
    };
  }
  const prefix = fips.slice(0, 2);
  const code = STATE_BY_FIPS[prefix];
  if (!code) {
    return {
      code: null,
      basis: `jurisdictionFips ${fips} has no state in the FIPS table`,
    };
  }
  return { code, basis: `state FIPS ${prefix} of jurisdictionFips ${fips}` };
}

/**
 * The nav-footer figure, and it is a per-pack figure on purpose.
 *
 * The Connections register's "1 of 12 sources connected" counts feed
 * integrations product-wide by build disposition, and its numerator is Esri
 * mounted through the SmartSite embed, which is granted on no pack at all.
 * Beside a city name that number is simply false for the city. What is true for
 * the pack being viewed is how many adapter kinds are granted on it.
 *
 * Counting rule: DISTINCT adapter kinds granted on this pack, of the kinds in
 * the catalog. Distinct, so two grants of one kind cannot push the numerator
 * past the denominator; intersected with the catalog, so a grant naming a kind
 * that does not exist cannot inflate it either. grantCount travels beside it so
 * the raw and the distinct figure stay reconcilable instead of silently merged.
 *
 * G-93. A SECOND FIGURE, BECAUSE GRANTED AND DEMONSTRATED ARE DIFFERENT CLAIMS.
 *
 * template-city rendered three populated regions beside "0 of 10 sources
 * granted". Every word of that was true - fixtureGrants names adapter KINDS,
 * carries no sourceUrl, and connects nothing - and a prospect read a
 * contradiction. The operator's ruling is to distinguish the two states rather
 * than collapse them, so the footer now carries both figures and neither one
 * absorbs the other. grantedAdapters stays empty on every pack and
 * assertCityPackShape still refuses a grant on a generating pack.
 *
 * The two numerators are deliberately measured in the SAME UNIT against the SAME
 * denominator - distinct adapter kinds, of the catalog - because two figures a
 * reader is meant to compare must be comparable. A regions-populated numerator
 * would have been three different counting rules sharing one chip.
 *
 * Both stay DERIVED. Growing the catalog moves both denominators and adding a
 * fixture grant moves the demonstrated numerator, with no edit here: the "0 of
 * 7" that was short by three for weeks corrected itself the moment the catalog
 * grew, and that property is the whole reason this is a computation and not a
 * string.
 */
export function packSources(pack, kinds = ADAPTER_KINDS) {
  const catalog = new Set(kinds.map((k) => k.id));
  const grants = Array.isArray(pack?.grantedAdapters) ? pack.grantedAdapters : [];
  const named = grants.map((g) => String(g?.kind || "").trim()).filter(Boolean);
  const distinct = [...new Set(named)];
  const granted = distinct.filter((id) => catalog.has(id));
  const unknownKinds = distinct.filter((id) => !catalog.has(id));
  const total = catalog.size;

  /**
   * The demonstration axis. Read defensively, gated on the pack actually
   * generating: a declaration a pack cannot honour is not a demonstration.
   * assertCityPackShape already refuses fixtureGrants on a non-generating pack,
   * so this gate is a second reader agreeing with that rule rather than a
   * tolerance for one breaking it - and empty-city exercises the branch on
   * every run.
   */
  const generates = pack?.generatesFixtures === true;
  const fixtureNamed = (Array.isArray(pack?.fixtureGrants) ? pack.fixtureGrants : [])
    .map((k) => String(k || "").trim())
    .filter(Boolean);
  const fixtureDistinct = [...new Set(fixtureNamed)];
  const demonstrated = generates ? fixtureDistinct.filter((id) => catalog.has(id)) : [];
  const unknownFixtureKinds = fixtureDistinct.filter((id) => !catalog.has(id));

  return {
    granted: granted.length,
    total,
    grantCount: grants.length,
    unknownKinds,
    label: `${granted.length} of ${total} sources granted`,
    rule: `distinct adapter kinds granted on this pack, of ${total} in the catalog`,
    demonstrated: demonstrated.length,
    generatesFixtures: generates,
    fixtureGrantCount: fixtureNamed.length,
    unknownFixtureKinds,
    demonstratedLabel: `${demonstrated.length} of ${total} demonstrated with fixture records`,
    /**
     * A pack that generates nothing gets a POSITIVE DETERMINATION rather than a
     * bare zero. An empty result is not an absence, and empty-city is the
     * regression target for every honest-empty state on this product.
     */
    demonstratedRule: generates
      ? `distinct adapter kinds this pack generates fixture records for, of ${total} in the catalog; a demonstration connects no source`
      : "this pack generates no records, so no adapter kind is demonstrated on it",
  };
}

export function cityIdentity(pack) {
  if (!pack || typeof pack.cityKey !== "string" || !pack.cityKey) {
    throw new Error("city identity requires a pack");
  }
  const environment = ENVIRONMENTS.has(pack.environment) ? pack.environment : "demo";
  const state = packState(pack);
  return {
    cityKey: pack.cityKey,
    displayName: pack.displayName,
    accessPolicy: pack.accessPolicy,
    environment,
    /** Labelling gate item 1 renders through here and nowhere else. */
    environmentBadge: environmentBadgeLabel(pack),
    isDemo: environment === "demo",
    generatesFixtures: pack.generatesFixtures === true,
    seal: sealInitials(pack.displayName),
    stateCode: state.code,
    stateBasis: state.basis,
    documentTitle: `${pack.displayName} · ${PRODUCT_TITLE}`,
    sources: packSources(pack),
  };
}
