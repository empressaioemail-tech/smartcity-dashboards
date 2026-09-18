/* ------------------------------------------------------------ platform base

D-13. Until this module there was no one place that said where v1's
platform-internal routes live. Five files held the same GCP host, as four
independent configurations plus six provenance literals:

  src/vendor-live.mjs     5 hardcoded fetch URLs       (Samsara, Spireon,
                                                       FirstDue, Power BI, GoTo)
  src/mygov-live.mjs      DEFAULT_PLATFORM_BASE        (overridable by MYGOV_PLATFORM_BASE)
  src/mygov-permits.mjs   DEFAULT_MYGOV_PLATFORM_URL   (overridable by MYGOV_PLATFORM_URL)
  src/property-map.mjs    two defaults                 (overridable by PROPERTY_INTEL_PLATFORM_URL
                                                       and PROPERTY_INTEL_LAYERS_PLATFORM_URL)
  src/adapters.mjs        6 sourceUrl literals         (the grants' own provenance)

D-13.1's cutover rule for the grants was NOT a find-and-replace of the literal
with a resolved value. A grant's `sourceUrl` is provenance -- the host actually
read -- and a value captured at module load is a host that was true once and is
serialized into the packs store, where it survives the next cutover. Grants
therefore declare a ROUTE (`platformRoute`, above), which is what round-trips,
and each grant's `sourceUrl` is an accessor over that route, which is what
names the host in force at the moment it is read. See src/adapters.mjs.

A cutover therefore had to be made in five places and could be missed in
four, and the host it named was `smartcity-api` in GCP `smartcity-os-prod` --
the copy OPS-25 treated as an idle rollback target. It was not idle. It was
this product's live data source, and a default is what kept that invisible:
every one of the four configurations fell back to it silently, so nothing
anywhere reported which host had actually been read.

ONE base, read from the environment, NO DEFAULT, NO FALLBACK. If it is unset
each feed refuses with `SMARTCITY_V1_PLATFORM_BASE unset` as its basis and no
request is made, because a fallback host is how a retired host stays live
after everyone believes it was turned off. The refusal is per-feed and lands
on the region, so the surface states what is missing instead of rendering a
figure from somewhere nobody chose.

The value is an ORIGIN, optionally with a path prefix. Route paths are
appended to it (`/api/platform/<path>`), so what an app carries is its own
address and nothing else -- `https://walrus-app-kzog6.ondigitalocean.app`, or
`https://smartcityos.io`.
*/

/** The one environment variable that decides where every v1 platform read goes. */
export const PLATFORM_BASE_ENV = "SMARTCITY_V1_PLATFORM_BASE";

/** Every v1 platform route lives under this prefix on whatever base is configured. */
export const PLATFORM_ROUTE_PREFIX = "/api/platform";

/**
 * The refusal basis every feed states when no base is configured. One string,
 * defined once, so nine call sites cannot drift into nine ways of saying the
 * same thing -- and so a test can assert the exact text a region renders.
 */
export const PLATFORM_BASE_UNSET_BASIS = `${PLATFORM_BASE_ENV} unset`;

/**
 * The configured base, or "" when none is set. Trailing slashes are dropped so
 * a value copied out of a browser address bar resolves to the same route as one
 * typed without them.
 *
 * Deliberately never `platformBase() || <a host>`: "" is a real answer meaning
 * "no host is configured", and a helper whose fallback is invisible at its call
 * site is what let G-159 publish a resolution that had not happened.
 */
export function platformBase(env = process.env) {
  return String(env?.[PLATFORM_BASE_ENV] ?? "").trim().replace(/\/+$/, "");
}

/**
 * The absolute URL for one v1 platform route -- "mygov/permits",
 * "property-intel/summary", "spireon/vehicles?include_inactive=true" -- or null
 * when no base is configured.
 *
 * null rather than a throw or an empty string: every call site in this product
 * already has an "unavailable" arm carrying a basis, and a refusal that flows
 * through that arm reaches the region. A throw would take the whole request
 * down, which is a worse answer than stating what is missing.
 */
export function platformRoute(path, env = process.env) {
  const base = platformBase(env);
  if (!base) return null;
  return `${base}${PLATFORM_ROUTE_PREFIX}/${String(path ?? "").replace(/^\/+/, "")}`;
}

/**
 * The route path a grant declares, with the query string a fixed read needs.
 * Declared next to the resolver so the grant's provenance and the fetch cannot
 * be pointed at different paths.
 */
export const PLATFORM_ROUTES = {
  mygovPermits: "mygov/permits",
  mygovWorkOrders: "mygov/work-orders",
  mygovInspections: "mygov/inspections",
  mygovCodeViolations: "mygov/code-violations",
  mygovBusinessLicenses: "mygov/business-licenses",
  samsaraVehicles: "samsara/vehicles",
  spireonVehicles: "spireon/vehicles",
  spireonVehiclesIncludingInactive: "spireon/vehicles?include_inactive=true",
  firstdueApparatus: "firstdue/apparatus",
  powerbiCipProjects: "powerbi/cip-projects",
  gotoCallSummary: "goto/call-summary",
  propertyIntelSummary: "property-intel/summary",
  propertyIntelLayers: "property-intel/layers",
};

/** Every declared route value, so a grant can be checked against the resolver. */
export const PLATFORM_ROUTE_VALUES = new Set(Object.values(PLATFORM_ROUTES));

/**
 * A grant's declared route must be one this module declares, and must be a
 * PATH -- no scheme, no authority. A route that smuggled in its own host would
 * reintroduce exactly the second configured base D-13 removes, and it would do
 * it in the one field the cutover does not search, because after D-13 there is
 * no host left there to find.
 *
 * Asserted at pack-shape time, when the base may legitimately be unset: this
 * checks what the grant DECLARES, not whether a host is configured. An unset
 * base is a fetch-time refusal with a stated basis, not an invalid pack.
 */
export function assertPlatformRoute(route) {
  const value = String(route ?? "").trim();
  if (!value) throw new Error("platform grant requires platformRoute");
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    throw new Error("platformRoute must be a path, not a host");
  }
  if (!PLATFORM_ROUTE_VALUES.has(value)) {
    throw new Error(`platformRoute must be a declared route: ${value}`);
  }
  return true;
}

