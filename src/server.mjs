import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLenses, getLens } from "./lenses.mjs";
import { listCityPacks, getCityPack, getPacksStore, ensureCityPacksTable } from "./city-pack.mjs";
import { readMounts, smartsiteEmbedUrl, planReviewEmbedUrl, smartFilesEmbedUrl, assertNoSupplierDsn, assertNoSupplierMounts } from "./mounts.mjs";
import { composeCityManager } from "./compose.mjs";
import { composePropertyIntelSummary, composePropertyIntelLayer, NATIVE_PROPERTY_MAP_CITY_KEY } from "./property-map.mjs";
import { listAdapterKinds, platformGrantForKind } from "./adapters.mjs";
import { composeRealPermits } from "./mygov-permits.mjs";
import {
  composeRealWorkOrders,
  composeRealInspections,
  composeRealCodeViolations,
  composeRealBusinessLicenses,
} from "./mygov-live.mjs";
import {
  composeRealFleetVehicles,
  composeRealPatrolVehicles,
  composeRealFireApparatus,
  composeRealCipProjects,
  composeRealCallAnalytics,
} from "./vendor-live.mjs";
import { composePipeline } from "./fixtures.mjs";
import { composeDomainById, composeDomainMap, getDomain } from "./domains.mjs";
import { cityIdentity } from "./city-identity.mjs";
import { financeLensPayload } from "./finance-lens.mjs";
import { publicWorksLensPayload, renderPublicWorksSurface } from "./public-works-lens.mjs";
import { fireEmsLensPayload, renderFireEmsSurface } from "./fire-ems-lens.mjs";
import { runMunicodeCalendar } from "./municode-calendar.mjs";
import { loadDotenv } from "./load-env.mjs";
import { pingDb } from "./db.mjs";
import { MCP_TOOL_NAMES } from "./catalog.mjs";
import { canReadPack, packContentReadStatus, packReadStatus, resolveCaller, isServiceBearer, accessRefusalBody, headerValue, STAFF_SESSION_COOKIE } from "./tenancy.mjs";
import { listStaffAccounts } from "./staff-directory.mjs";
import { generateState, buildAuthorizeUrl, exchangeCodeForToken, serializeCookie, clearCookie, STATE_COOKIE } from "./staff-signin.mjs";
import { recordStaffRead, AccessLogWriteRefused } from "./access-log.mjs";

/**
 * G-116 Phase 2. Every domain with a real (non-fixture) source, and how to
 * compose it. permits-pipeline's composer takes the grant as its third
 * argument (it reads grant.accessPolicy for the real permit sourceUrl this
 * program ratified); every other composer only needs that a grant of its
 * own gatedBy kind exists (platformGrantForKind, adapters.mjs) -- each of
 * samsara/spireon/firstdue/powerbi/goto gates exactly one domain, and mygov
 * gates five, but the lookup shape is identical: any grant with a matching
 * kind unlocks its domain(s).
 */
const REAL_LIVE_DOMAINS = {
  "permits-pipeline": { kind: "mygov", compose: (pack, domain, grant) => composeRealPermits(pack, domain, grant) },
  "work-orders": { kind: "mygov", compose: (pack, domain) => composeRealWorkOrders(pack, domain) },
  inspections: { kind: "mygov", compose: (pack, domain) => composeRealInspections(pack, domain) },
  "code-violations": { kind: "mygov", compose: (pack, domain) => composeRealCodeViolations(pack, domain) },
  "business-licenses": { kind: "mygov", compose: (pack, domain) => composeRealBusinessLicenses(pack, domain) },
  "fleet-vehicles": { kind: "samsara", compose: (pack, domain) => composeRealFleetVehicles(pack, domain) },
  "patrol-vehicles": { kind: "spireon", compose: (pack, domain) => composeRealPatrolVehicles(pack, domain) },
  "fire-apparatus": { kind: "firstdue", compose: (pack, domain) => composeRealFireApparatus(pack, domain) },
  "cip-projects": { kind: "powerbi", compose: (pack, domain) => composeRealCipProjects(pack, domain) },
  "call-analytics": { kind: "goto", compose: (pack, domain) => composeRealCallAnalytics(pack, domain) },
};

function realLiveGrantFor(pack, domainId) {
  const entry = REAL_LIVE_DOMAINS[domainId];
  if (!entry) return null;
  return platformGrantForKind(pack, entry.kind);
}

async function composeRealMygovDomain(domainId, pack, grant) {
  const entry = REAL_LIVE_DOMAINS[domainId];
  if (!entry) return null;
  const domain = getDomain(domainId);
  if (!domain) return null;
  return entry.compose(pack, domain, grant);
}
import { deliverFeedback, shellState } from "./shell-state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, "..", "web");
const PORT = Number(process.env.PORT || 8080);
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) loadDotenv();
assertNoSupplierDsn();
assertNoSupplierMounts();

export function cityPackAuthorized(req, envMap = process.env) {
  return isServiceBearer(req, envMap) || !String(envMap.DASHBOARDS_API_KEY || "").trim();
}

/** Named-cookie lookup for the sign-in flow's own state cookie -- tenancy.mjs's
 *  staffBearerFromCookie is the equivalent for the staff session cookie specifically, kept
 *  separate rather than generalized into a shared parser neither call site actually needs. */
function readCookie(req, name) {
  const raw = headerValue(req, "cookie");
  if (!raw) return "";
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return "";
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(data);
}

/**
 * A RENDERED PAGE, WHICH IS NOT A FILE. The two lens surfaces are built from a
 * pack at request time rather than read off disk, and they are the ONLY html
 * this server writes itself: everything else under web/ is served by sendFile,
 * with its own bytes and its own CRLF. no-store for the same reason the json
 * helper carries it - the page is a reading of a pack, and a cached copy of a
 * reading is a copy of a different moment.
 */
function html(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

/* ---------------------------------------------------------------------------
 * G-161. THE CITY REFUSAL, STATED ONCE.
 *
 * A route that reads a city pack and answers anyway when the request named no
 * city is not a route with a default. It is a route that INVENTS an answer, and
 * the invented answer was always the demo pack: a caller who asked for nothing
 * in particular was handed template-city's identity, its shell state and its
 * domains under a 200, reading like a real city's records.
 *
 * G-159 wrote this refusal on /api/lenses/finance/sources and this is the
 * pattern the rest of the routes now take, so it lives here once rather than
 * seven times: ONE rule, one implementation. A new route either calls this or
 * is visibly the odd one out.
 *
 * ORDER IS THE POINT. Checked BEFORE resolveCaller(req), so the answer does not
 * depend on who is asking: a request that names no city is malformed whatever
 * identity presents it, and refusing it leaks nothing a 401 would have
 * withheld. A named unknown pack still takes the pack path and still answers
 * 404; a named readable pack is unchanged. Only "named no city at all" is 400.
 *
 * 400 rather than 404, because the pack is not UNKNOWN - it is ABSENT, and the
 * two are different findings that must stay distinguishable.
 *
 * WHITESPACE NAMES NOTHING TOO. `?cityKey=%20` is a caller who supplied a
 * blank, not a caller who named a city; trim-then-test is what keeps those from
 * being the same case.
 *
 * `stake` is the sentence the route contributes, because what a wrong answer
 * COSTS differs per route and one shared sentence would have to be vague enough
 * to be useless. It is required rather than defaulted, so a new call site has to
 * say what its own 400 is protecting.
 *
 * Returns the trimmed key, or null after writing the refusal - the caller MUST
 * return on null.
 */
function requiredCityKey(res, url, stake) {
  const cityKey = (url.searchParams.get("cityKey") || "").trim();
  if (cityKey) return cityKey;
  json(res, 400, {
    error: "city_key_required",
    message: `this route takes a cityKey and refuses without one; ${stake}`,
  });
  return null;
}

/* ---------------------------------------------------------------------------
 * G-158. THE CONTENT-READ GATE: MAY THIS CALLER READ IT, AND IS IT RECORDED.
 *
 * ONE PLACE, because the property this row is judged on is EXHAUSTIVENESS. "A
 * read by a signed-in person is written down" is a claim about every read path
 * at once, and eleven routes each remembering to call the log is eleven chances
 * for the twelfth to forget. So the log write hangs off the same gate that
 * already decides readability: every route that gates on packContentReadStatus
 * records, and no route reaches pack content without passing here.
 *
 * packContentReadStatus is the single content-read policy this product has --
 * src/tenancy.mjs says so in its own header -- so "every call site of it is
 * instrumented" and "every content read is recorded" are the same claim. The
 * count of call sites is therefore part of this gate's contract, and a new one
 * that does not call this helper is a hole in the audit trail: the tests in
 * src/access-log-route.test.mjs assert the count rather than trusting a habit.
 *
 * TWO STEPS, NOT ONE, because one route needs them apart. /api/domains/:id
 * checks readability BEFORE it composes -- so a caller who may not read a
 * tenant-private pack never triggers a live vendor fetch -- but can only record
 * the read once the composed record is known to be SERVED, since an
 * unregistered domain answers 404 with no records to have read. Splitting them
 * lets that route keep the existing fail-closed order and still record only
 * reads that really happened.
 *
 * BOTH RETURN TRUE WHEN THEY HAVE ALREADY ANSWERED, and the caller MUST return
 * on true. The 404/401/403 is unchanged and comes first, so a caller who may not
 * read gets exactly what they always got and nothing is recorded about a read
 * that never happened. The log write comes after, and BEFORE the response body
 * exists: nothing composes, fetches or sends records before the row is written.
 *
 * A REFUSED LOG WRITE IS A REFUSAL, NOT A 500. A 500 says "this broke"; what
 * happened is that the product declined to serve a reading it could not record,
 * which is a decision and is reported as one, with its own error name so a probe
 * can tell it apart from a permission refusal. `refused: true` makes it
 * unmistakable on the wire.
 */
function contentReadRefused(res, caller, pack) {
  const status = packContentReadStatus(pack, caller);
  if (status === 404) {
    json(res, 404, { error: "unknown city pack" });
    return true;
  }
  if (status !== 200) {
    json(res, status, accessRefusalBody(caller, status));
    return true;
  }
  return false;
}

/**
 * The same two steps for the routes that answer a DOCUMENT rather than JSON
 * (/lens/public-works, /lens/fire-ems), whose refusals are HTML because that is
 * what the caller asked for. Only the readability step differs; the log write
 * is the shared one above, so a page and its JSON payload cannot disagree about
 * whether a failed record refuses the read.
 */
function contentReadRefusedHtml(res, caller, pack) {
  const status = packContentReadStatus(pack, caller);
  if (status === 404) {
    html(res, 404, "<!doctype html>\n<title>Unknown city pack</title>\n<p>unknown city pack\n");
    return true;
  }
  if (status !== 200) {
    html(res, status, "<!doctype html>\n<title>Not authorized</title>\n<p>not authorized for this pack\n");
    return true;
  }
  return false;
}

async function recordReadOrRefuse(res, url, caller, pack, lensId, recordId = null) {
  try {
    await recordStaffRead({
      caller,
      cityKey: pack.cityKey,
      lensId,
      recordId,
      route: url.pathname,
    });
  } catch (err) {
    const refusal = err instanceof AccessLogWriteRefused
      ? err
      : new AccessLogWriteRefused("store_error", `the access log write failed, so this read is refused rather than served unrecorded: ${err?.message || err}`);
    json(res, refusal.status, { error: refusal.error, message: refusal.message, reason: refusal.reason, refused: true });
    return true;
  }
  return false;
}

// A strong validator derived from the bytes themselves. Content-derived on every
// request by construction: the only caller hashes the buffer it just read, so a
// changed file can never keep an old tag. A constant or startup-computed tag here
// would cause permanent staleness, which is worse than serving no validator at all.
export function etagFor(buf) {
  return `"${crypto.createHash("sha256").update(buf).digest("base64url")}"`;
}

// RFC 9110 If-None-Match uses weak comparison: "*" matches any existing
// representation, the field is a comma list, and a W/ prefix is stripped from
// both sides before the opaque tags are compared.
export function ifNoneMatchSatisfied(header, etag) {
  const raw = String(header ?? "").trim();
  if (!raw) return false;
  if (raw === "*") return true;
  const opaque = (tag) => tag.trim().replace(/^W\//, "");
  const wanted = opaque(etag);
  return raw.split(",").some((tag) => opaque(tag) === wanted);
}

// cache-control: no-cache means store it but always revalidate. Never stale by
// construction, and near-zero cost when unchanged. Deliberately NOT no-store,
// which is right for the JSON helper above and wrong here: it forbids storage and
// throws away the 304 entirely.
export function sendFile(req, res, filePath, contentType) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const etag = etagFor(buf);
    if (ifNoneMatchSatisfied(req?.headers?.["if-none-match"], etag)) {
      // 304 carries no representation, so no content-type and no body.
      res.writeHead(304, { "cache-control": "no-cache", etag });
      res.end();
      return;
    }
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-cache",
      etag,
    });
    res.end(buf);
  });
}

/**
 * A bounded JSON body read. Bounded on purpose: an unbounded read on a public
 * POST is a memory exhaustion seam, and the one POST this product accepts
 * carries at most a couple of kilobytes of typed text. Returns null for
 * anything that is not readable JSON, so the caller answers with a stated
 * reason rather than a stack trace.
 */
export const MAX_BODY_BYTES = 16 * 1024;

export function readJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve) => {
    let size = 0;
    let over = false;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        /**
         * Drain and discard rather than req.destroy(). Destroying the request
         * tears down the socket the response still has to be written to, so the
         * caller's honest 400 would be written to a dead socket and the client
         * would see a connection reset instead of a stated reason. Resuming
         * keeps the request flowing to its end, the body is dropped, and the
         * answer gets out.
         */
        over = true;
        chunks.length = 0;
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (over) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const packsStore = getPacksStore();
    try {
      const db = await pingDb();
      json(res, 200, {
        ok: true,
        product: "smartcity-dashboards",
        cityPacks: "tenant-packs-not-repos",
        packsStore,
        ...db,
      });
    } catch (err) {
      json(res, 200, {
        ok: false,
        product: "smartcity-dashboards",
        db: "error",
        packsStore,
        error: String(err.message || err),
      });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/lenses") {
    json(res, 200, { lenses: listLenses() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/adapter-kinds") {
    json(res, 200, { kinds: listAdapterKinds() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/adapters/municode/calendar/run") {
    if (!cityPackAuthorized(req)) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    /**
     * G-161. Was `|| "template-city"`. The 403 below means this default could
     * not serve ANOTHER city, which is why it read as harmless - but a keyless
     * caller still silently RAN the demo pack's calendar and wrote its files, a
     * run nobody aimed at a pack.
     *
     * The order is deliberate and is the one thing kept from the old shape: 401
     * first (this caller is not authorized at all), then the 400 (the request
     * names no pack), then the 403 (the named pack is not what this adapter run
     * is for). The refusal is about the REQUEST, so it does not come before the
     * authorization of the CALLER.
     */
    const cityKey = requiredCityKey(
      res,
      url,
      "this adapter run WRITES files keyed by the pack it is handed, so a default would write the demo pack's calendar for a run nobody aimed at it",
    );
    if (!cityKey) return;
    if (cityKey !== "template-city") {
      json(res, 403, { error: "municode calendar run is template-city only" });
      return;
    }
    try {
      const result = await runMunicodeCalendar({ cityKey });
      json(res, result.status === "ok" ? 200 : 200, result);
    } catch (err) {
      json(res, 200, {
        cityKey,
        status: "unavailable",
        honesty: "partial",
        basis: err.basis || String(err.message || err),
        fetched: 0,
        written: 0,
        records: [],
      });
    }
    return;
  }

  /**
   * The city-manager compose, GATED, which it was not.
   *
   * It resolved a caller and then never asked whether that caller may read the
   * pack, so any cityKey composed for anybody: a tenant-private pack answered an
   * anonymous visitor with 200 and its files-room scope, and an unknown pack
   * answered 200 with an invented default rather than 404. The route below it has
   * carried the full check since G-79 and this one was simply never given it,
   * which is the shape this repo keeps paying for - a control written on one
   * route and absent on its sibling.
   *
   * Same three answers as the pipeline route, from the same function, for the
   * same reason: this is a CONTENT read, so a public-free pack must still answer
   * an anonymous visitor on a deployment where DASHBOARDS_API_KEY is set.
   *
   * The pack is resolved BEFORE composing and its own cityKey is what composes,
   * so the composed payload cannot name a pack the gate did not clear.
   */
  if (req.method === "GET" && url.pathname === "/api/lenses/city-manager/compose") {
    /**
     * G-161. This route read `|| DEFAULT_CITY_KEY`, and the SYMBOL is why it
     * hid: a grep for the literal "template-city" misses it entirely. A keyless
     * call composed the demo pack's parcel and named it in the payload.
     */
    const cityKey = requiredCityKey(
      res,
      url,
      "the compose names the pack it composed and embeds ITS cityKey in every external url, so a default would put the demo pack's parcel in front of a caller who named no city",
    );
    if (!cityKey) return;
    const caller = await resolveCaller(req);
    const pack = await getCityPack(cityKey);
    if (contentReadRefused(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, "city-manager")) return;
    const composed = await composeCityManager({
      parcelNodeId: url.searchParams.get("parcelNodeId") || "",
      cityKey: pack.cityKey,
      caller,
      /**
       * G-117: conditional on the pack being real, the exact same shape as
       * every other real-branch dispatch in this file (REAL_LIVE_DOMAINS
       * checks above/below) -- generatesFixtures !== true AND, since this
       * is a single named-city exception rather than a grant any real pack
       * can hold, the pack IS the real Bastrop city specifically. Every
       * other pack (every fixture pack, and any future real pack that is
       * not Bastrop) is unaffected and keeps composing the SmartSite embed
       * exactly as before.
       */
      nativePropertyMap: pack.cityKey === NATIVE_PROPERTY_MAP_CITY_KEY && pack.generatesFixtures !== true,
    });
    json(res, 200, composed);
    return;
  }

  /**
   * G-117. The native Bastrop property map's own data call -- a live,
   * user-typed address search, not a page-load compose, so it is its own
   * route rather than a field folded into the compose response above (see
   * src/property-map.mjs's module header for why). Gated the same way the
   * compose route just above is: the pack is resolved first and
   * packContentReadStatus decides readability before anything is composed,
   * so a caller who cannot read this (real, tenant-private) pack's content
   * gets the same 401/403 the rest of this pack's content already gives,
   * not a silent real-data leak through a route that forgot to check.
   */
  if (req.method === "GET" && url.pathname === "/api/property-map/summary") {
    const caller = await resolveCaller(req);
    const cityKey = url.searchParams.get("cityKey") || "";
    const pack = await getCityPack(cityKey);
    if (contentReadRefused(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, "city-manager")) return;
    const composed = await composePropertyIntelSummary({
      address: url.searchParams.get("address") || "",
      cityKey: pack.cityKey,
    });
    json(res, 200, composed);
    return;
  }

  /**
   * G-117 follow-up. The property map's four always-on GIS overlay layers
   * (zoning, future land use, subdivisions, parcels-one-click) -- fetched
   * by the CURRENT viewport bounding box on moveend/zoomend, not by a typed
   * address, so this is its own route rather than a param on
   * /api/property-map/summary just above. Same gate, same pack-resolution
   * order, same 401/403/404 shape as that route (see its own comment for
   * why) -- purely additive alongside it: the address-search route and
   * everything it does is untouched.
   */
  if (req.method === "GET" && url.pathname === "/api/property-map/layers") {
    const caller = await resolveCaller(req);
    const cityKey = url.searchParams.get("cityKey") || "";
    const pack = await getCityPack(cityKey);
    if (contentReadRefused(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, "city-manager")) return;
    const composed = await composePropertyIntelLayer({
      key: url.searchParams.get("key") || "",
      cityKey: pack.cityKey,
      xmin: url.searchParams.get("xmin"),
      ymin: url.searchParams.get("ymin"),
      xmax: url.searchParams.get("xmax"),
      ymax: url.searchParams.get("ymax"),
    });
    json(res, 200, composed);
    return;
  }

  /**
   * Registered before the generic lens handler on purpose: /api/lenses/ swallows
   * anything under it, and the compose route above learned that the hard way.
   */
  if (req.method === "GET" && url.pathname === "/api/lenses/development-services/pipeline") {
    /** G-161. Was `|| "template-city"`. */
    const cityKey = requiredCityKey(
      res,
      url,
      "answering with the demo pack's cases in flight would show demo permits under whatever city the caller meant",
    );
    if (!cityKey) return;
    const caller = await resolveCaller(req);
    const pack = await getCityPack(cityKey);
    // Content read, not enumeration: a public-free pack is readable anonymously
    // whether or not this deployment has a service key configured.
    if (contentReadRefused(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, "development-services")) return;
    /**
     * G-116 Phase 2 gap closed. Same real-source branch as /api/domains/:id
     * and /api/city-domains, previously missing here: this lens route called
     * composePipeline(pack) unconditionally, which is fixture-only
     * (composeDomain) with no real branch of its own, so a real pack's own
     * Pipeline page kept showing fixture cases even after permits-pipeline's
     * domain-level route (and the map) had a real source. Same pack, same
     * domain, two disagreeing answers -- exactly what ruling 1 exists to
     * prevent, just missed on this one route.
     */
    let real = null;
    if (REAL_LIVE_DOMAINS["permits-pipeline"] && pack.generatesFixtures !== true) {
      const grant = realLiveGrantFor(pack, "permits-pipeline");
      if (grant) real = await composeRealMygovDomain("permits-pipeline", pack, grant);
    }
    json(res, 200, composePipeline(pack, real));
    return;
  }

  /**
   * The honest source map for a pack, G-91.
   *
   * Every region this product can render, and for THIS pack whether it has a
   * source and why not. It exists because "we did not build Parks" and "your
   * city has no Parks data" were the same sentence on this product until ruling
   * 1, and a customer needs to be able to tell them apart. Records are not on
   * this response: the map is about sources, and a caller that wants records
   * asks for the domain.
   *
   * Gated on packContentReadStatus and not canReadPack, for the same reason the
   * pipeline route is: this is CONTENT about a pack, and a public-free pack must
   * answer an anonymous visitor whether or not a service key is configured.
   */
  if (req.method === "GET" && url.pathname === "/api/city-domains") {
    /** G-161. Was `|| "template-city"`. */
    const cityKey = requiredCityKey(
      res,
      url,
      "answering with the demo pack's domains would report demo capabilities as the caller's city's",
    );
    if (!cityKey) return;
    const caller = await resolveCaller(req);
    const pack = await getCityPack(cityKey);
    // Cross-lens: this route reports every lens's source state for the pack, so
    // it is nobody's lens and the row says so rather than naming one of them.
    if (contentReadRefused(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, null)) return;
    const map = composeDomainMap(pack);
    /**
     * G-116 Phase 2. Same real-source branch as /api/domains/:id below --
     * kept consistent on purpose. Without this, the map would say a mygov
     * domain has "no-fixture-source" while the domain's own endpoint
     * returns real records for the identical pack: two different,
     * disagreeing answers to "does this region have a source", which is
     * exactly the sentence-collapse ruling 1 (this route's own header
     * comment) exists to prevent.
     */
    if (pack.generatesFixtures !== true) {
      for (const domainId of Object.keys(REAL_LIVE_DOMAINS)) {
        const grant = realLiveGrantFor(pack, domainId);
        if (!grant) continue;
        const idx = map.regions.findIndex((r) => r.domainId === domainId);
        if (idx < 0) continue;
        const real = await composeRealMygovDomain(domainId, pack, grant);
        if (!real) continue;
        const before = map.regions[idx];
        map.regions[idx] = {
          domainId: real.domainId,
          lensId: real.lensId,
          region: real.region,
          gatedBy: real.gatedBy,
          recordType: real.recordType,
          status: real.status,
          granted: real.granted,
          generated: real.generated,
          basis: real.basis,
          recordCount: real.recordCount,
          countingRule: real.countingRule,
        };
        if (before.recordCount === 0 && real.recordCount > 0) map.withRecords += 1;
      }
    }
    json(res, 200, map);
    return;
  }

  /**
   * One registered domain, in full, for a pack. An unregistered domain id is a
   * 404 that STATES its basis rather than a bare status code: not-built is a
   * real determination and it has to be able to say so.
   */
  if (req.method === "GET" && url.pathname.startsWith("/api/domains/")) {
    /**
     * G-161. Was `|| "template-city"`. This one handler answers EVERY domain
     * endpoint behind the seven lenses, so the default reached further than any
     * other line on this list.
     */
    const cityKey = requiredCityKey(
      res,
      url,
      "every domain endpoint under the seven lenses reads through here, so a default would serve the demo pack's domain records under whatever city the caller meant",
    );
    if (!cityKey) return;
    const caller = await resolveCaller(req);
    const domainId = decodeURIComponent(url.pathname.slice("/api/domains/".length));
    const pack = await getCityPack(cityKey);
    /**
     * G-158. Readability is settled HERE, before anything is composed, so a
     * caller who may not read a tenant-private pack never triggers a live
     * vendor fetch -- the order this route already had. The LOG WRITE is
     * deliberately NOT here: a read is recorded when records are SERVED, and
     * this route answers 404 with no records at all for an unregistered
     * domain, which is not a read of anything.
     */
    if (contentReadRefused(res, caller, pack)) return;
    /**
     * G-116 Phase 2. The ten domains with a real, live source instead of a
     * fixture (REAL_LIVE_DOMAINS above). composeDomain/composeDomainById
     * (domains.mjs, fixture-seam.mjs) stay entirely synchronous and
     * fixture-only by design -- this branch sits beside them, not inside
     * them, the same way meetingsFromPack sits beside composeDomain for
     * the municode calendar feed rather than becoming a branch inside it.
     * Only fires for a pack that is NOT generating fixtures and DOES carry
     * a real grant matching this domain's own gatedBy kind; every other
     * pack/domain combination (all of template-city, any domain with no
     * matching grant) is completely unaffected and still calls
     * composeDomainById exactly as before.
     */
    if (REAL_LIVE_DOMAINS[domainId] && pack.generatesFixtures !== true) {
      const grant = realLiveGrantFor(pack, domainId);
      if (grant) {
        const composed = await composeRealMygovDomain(domainId, pack, grant);
        if (composed) {
          // The domain's OWN lens, taken from the record being served rather
          // than mapped here, so a row can never name a lens the read was not.
          if (await recordReadOrRefuse(res, url, caller, pack, composed.lensId, domainId)) return;
          json(res, 200, composed);
          return;
        }
      }
    }
    const composed = composeDomainById(pack, domainId);
    if (composed.status === "not-registered") {
      json(res, 404, composed);
      return;
    }
    if (await recordReadOrRefuse(res, url, caller, pack, composed.lensId, domainId)) return;
    json(res, 200, composed);
    return;
  }

  /**
   * The chrome's identity for the active pack.
   *
   * Gated on packContentReadStatus, not packReadStatus: identity is CONTENT.
   * canReadPack answers the enumeration question and for a public-free pack
   * falls through to "is a service key configured", which is deployment posture
   * rather than access policy, and which is exactly how G-78 shipped a demo
   * that refused its own records to the anonymous visitor it exists for.
   * Enumeration through /api/city-packs stays on canReadPack and stays shut.
   * A tenant-private pack still refuses an anonymous caller here.
   */
  if (req.method === "GET" && url.pathname === "/api/city-identity") {
    /**
     * G-161. Was `|| "template-city"`. This is the route that names the city on
     * the surface, so the default here stamped the DEMO city's name, seal and
     * palette onto a caller who had named none - the loudest form of the defect.
     */
    const cityKey = requiredCityKey(
      res,
      url,
      "this route IS the city's name and seal, so a default would stamp the demo pack's identity on a surface the caller never asked for",
    );
    if (!cityKey) return;
    const caller = await resolveCaller(req);
    const pack = await getCityPack(cityKey);
    // Not a lens read: this is the pack's name and seal, which belongs to the
    // city rather than to any one lens, so the row carries no lens.
    if (contentReadRefused(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, null)) return;
    json(res, 200, { identity: cityIdentity(pack) });
    return;
  }

  /**
   * G-90. What the top bar is allowed to say about itself.
   *
   * Gated exactly as /api/city-identity is, and for the same reason: the
   * notification basis is derived from the pack's grants, which is CONTENT.
   * Reusing packContentReadStatus rather than writing a second policy here
   * means there is one access rule for pack content and not two that can drift.
   *
   * The session half is the caller this request actually resolved to, read
   * through the existing tenancy resolver. Nothing new authenticates anything.
   */
  if (req.method === "GET" && url.pathname === "/api/shell") {
    /**
     * G-161. Was `|| "template-city"`. The shell state is the chrome's own
     * counts and basis lines, so the default made a cityless visit render the
     * demo pack's shell as if it were the caller's.
     */
    const cityKey = requiredCityKey(
      res,
      url,
      "the shell state is the chrome's counts and basis lines, so a default would render the demo pack's shell under whatever city the caller meant",
    );
    if (!cityKey) return;
    const caller = await resolveCaller(req);
    const pack = await getCityPack(cityKey);
    // Not a lens read: the shell's counts and basis lines are the chrome's, not
    // one lens's records, so the row carries no lens.
    if (contentReadRefused(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, null)) return;
    json(res, 200, shellState({ caller, pack, env: process.env }));
    return;
  }

  /**
   * G-132 / People and access. Ruling 1's reconciliation: Sylvia (the city
   * manager) can SEE who has access to her city's data at any time, without
   * being handed anything to manage -- read-only for her, administered by
   * us. This is the read half only; there is no write route here, on
   * purpose, because the write path IS the admin-provisioning flow this
   * lane names as a gap (see close: staff-admin-client.mjs).
   *
   * `role==="admin"` (SmartCity's own operators) reads any tenant, passed as
   * ?cityKey=. `role==="city-manager"` reads only their OWN tenant -- their
   * token's tenant claim, never a query param, so a city-manager cannot
   * page through another city's roster by editing the URL. Every other
   * role, and every non-staff caller, is refused with the SAME typed shape
   * every other refusal in this file uses -- a silent empty list here would
   * read as "nobody has access", which is the exact "no records" collapse
   * DEV_PROCESS 4.3 forbids.
   */
  /**
   * G-134 GAP 5. Sign-in, sign-out, callback. Redirect-based OIDC
   * authorization-code flow against WorkOS AuthKit -- no password form lives
   * in this repo (ruling 1: the provider holds credentials). See
   * staff-signin.mjs's header for the full design and its BUILD NOW, VERIFY
   * LATER status: unexercised against a real WorkOS organization.
   */
  if (req.method === "GET" && url.pathname === "/auth/sign-in") {
    let authorizeUrl;
    const state = generateState();
    try {
      authorizeUrl = buildAuthorizeUrl(process.env, state);
    } catch (err) {
      json(res, 500, { error: "signin_not_configured", message: String(err?.message || err) });
      return;
    }
    res.writeHead(302, { location: authorizeUrl, "set-cookie": serializeCookie(STATE_COOKIE, state, { maxAgeSeconds: 600 }) });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/callback") {
    const code = url.searchParams.get("code") || "";
    const presentedState = url.searchParams.get("state") || "";
    const expectedState = readCookie(req, STATE_COOKIE);
    // Checked BEFORE any WorkOS call: a state mismatch (CSRF, or a stale/replayed
    // callback URL) never reaches the token exchange at all.
    if (!code || !presentedState || !expectedState || presentedState !== expectedState) {
      json(res, 400, {
        error: "invalid_signin_state",
        message: "This sign-in attempt could not be verified (missing or mismatched state). Start over at /auth/sign-in.",
      });
      return;
    }
    let accessToken;
    try {
      accessToken = await exchangeCodeForToken(code, process.env, {});
    } catch (err) {
      json(res, 502, { error: "signin_exchange_failed", message: String(err?.message || err) });
      return;
    }
    res.writeHead(302, {
      location: "/",
      "set-cookie": [serializeCookie(STAFF_SESSION_COOKIE, accessToken), clearCookie(STATE_COOKIE)],
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/sign-out") {
    res.writeHead(302, { location: "/", "set-cookie": clearCookie(STAFF_SESSION_COOKIE) });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/people-and-access") {
    const caller = await resolveCaller(req);
    if (caller.kind !== "staff") {
      const status = caller.refused ? caller.refused.status : 401;
      json(res, status, accessRefusalBody(caller, status));
      return;
    }
    if (caller.role !== "admin" && caller.role !== "city-manager") {
      json(res, 403, {
        error: "not_admin_or_city_manager",
        message: "People and access is readable by the admin and city-manager roles only.",
      });
      return;
    }
    const requestedTenant = url.searchParams.get("cityKey") || "";
    const scopeTenant = caller.role === "admin" ? requestedTenant || null : caller.tenant;
    if (caller.role === "city-manager" && !caller.tenant) {
      json(res, 403, {
        error: "no_tenant_claim",
        message: "this city-manager identity carries no tenant claim to scope the roster to.",
      });
      return;
    }
    const accounts = await listStaffAccounts({ tenant: scopeTenant });
    json(res, 200, {
      tenant: scopeTenant,
      accounts: accounts.map((a) => ({
        sub: a.sub,
        tenant: a.tenant,
        role: a.role,
        email: a.email,
        name: a.name,
        status: a.status,
        provisionedAt: a.provisionedAt,
        disabledAt: a.disabledAt,
      })),
    });
    return;
  }

  /**
   * Feedback, and it answers truthfully rather than politely. `accepted` is
   * true only when a configured destination confirmed delivery; with no
   * destination configured this is a 503 naming the missing variable, which is
   * the correct answer and not a placeholder for a future one.
   */
  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const body = await readJsonBody(req);
    if (body === null) {
      json(res, 400, { accepted: false, basis: "the request body was not readable JSON, so nothing was sent" });
      return;
    }
    const answer = await deliverFeedback({ body, env: process.env });
    json(res, answer.status, { accepted: answer.accepted, basis: answer.basis });
    return;
  }

  /**
   * G-156. THE FINANCE LENS'S OWN STATE, PER PACK.
   *
   * Registered BEFORE the generic /api/lenses/ handler below, for the same
   * reason /api/lenses/development-services/pipeline is registered there: that
   * handler swallows everything under the prefix and would answer this path with
   * the lens's catalogue record instead.
   *
   * GATED EXACTLY AS /api/shell IS, and for the same reason it states: the
   * states are DERIVED FROM THE PACK'S GRANTS, which is pack CONTENT rather than
   * deployment posture. Reusing packContentReadStatus rather than writing a
   * second policy here means there is one access rule for pack content and not
   * two that can drift.
   *
   * The capture quotation rides with the payload and is null for every pack but
   * the one the capture is about, so no caller can render one city's v1 screen
   * contents beside another city's name. web/index.html never carries them.
   */
  if (req.method === "GET" && url.pathname === "/api/lenses/finance/sources") {
    /**
     * G-159. NO DEFAULT CITY, AND THIS ROUTE WAS THE ONE THAT CARRIED ONE.
     *
     * It read `url.searchParams.get("cityKey") || "template-city"`, so a caller
     * who named no pack was answered with the DEMO pack's finance states and a
     * 200. That is the preamble's rule 3 defect exactly ("never default a city: a
     * route that takes cityKey REFUSES when it is missing, because a
     * `template-city` default silently serves demo data"), and on this route it
     * lands under the Finance lens, where a state word is meant to be a statement
     * about a real city's budget.
     *
     * The refusal is checked BEFORE the caller is resolved, and that ordering is
     * deliberate: a request that names no pack is malformed whatever identity
     * presents it, and refusing it leaks nothing a 401 would have withheld.
     *
     * 400 rather than 404, because the pack is not unknown - it is ABSENT. A
     * named-but-unknown pack still takes the pack path below and still answers
     * `unknown city pack`, which is a different finding and stays distinguishable
     * from this one (src/finance-route.test.mjs holds both apart).
     *
     * The client already had the honest branch for this: web/app.js fetches with
     * no query string when no pack is resolved and renders the four states as NOT
     * READ, which is now the only thing an unnamed request can produce.
     *
     * G-161 moved the refusal itself into requiredCityKey(), above, so this route
     * and the seven that joined it in G-161 are one implementation rather than
     * eight copies that can drift. The message is unchanged, byte for byte:
     * this route's `stake` is the sentence that used to be inline here.
     */
    const cityKey = requiredCityKey(
      res,
      url,
      "answering with the demo pack's finance states would serve demo finance under whatever city the caller meant",
    );
    if (!cityKey) return;
    const caller = await resolveCaller(req);
    const pack = await getCityPack(cityKey);
    if (contentReadRefused(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, "finance")) return;
    json(res, 200, financeLensPayload(pack));
    return;
  }

  /**
   * G-152. THE TWO LENS SURFACES, SERVED RATHER THAN BAKED.
   *
   * The Public works and Fire and EMS designs each draw a whole page: a header,
   * two regions of different units, a phase-by-status matrix, a reconciled call
   * grid, per-station multiples, blocked boards and provenance feet. web/index.html
   * is ONE document served for every pack, so the ratified markup it carries is
   * the UNREAD rendering and nothing else (the bake asserts that, as a fixed
   * point, in src/*-lens.test.mjs).
   *
   * A pack's own rendering therefore has to come from somewhere, and these four
   * routes are that somewhere: the JSON surface the browser painter consumes, and
   * the finished page a reader (or a check, or a probe) can open directly. Both
   * read ONE derivation in src/public-works-lens.mjs / src/fire-ems-lens.mjs, and
   * the page is the same artifact the design's own check.mjs reads when it is
   * exported to disk -- so the thing that passes the instrument and the thing the
   * server serves cannot be two different documents.
   *
   * WHY THE PAGE IS SERVED RATHER THAN PAINTED IN THE SHELL YET, stated here
   * rather than discovered later: the browser painter that would rebuild these
   * bodies from the payload does not exist, and shipping the baked unread markup
   * over a pack whose regions ARE read would print "has not been read for this
   * pack" over data the server has. That is the one failure this product refuses
   * above all others, so the shell keeps its existing rendering until the painter
   * lands, and this route is what makes the design reachable and probeable until
   * then. Named as the remaining clause in this lane's close.
   *
   * GATED AS PACK CONTENT, exactly as /api/lenses/finance/sources is: the states
   * and the counts both come off the pack's grants.
   */
  const LENS_SURFACES = {
    "/api/lenses/public-works/dashboard": {
      stake: "answering with the demo pack's capital projects and call buckets would serve demo records under whatever city the caller meant",
      payload: publicWorksLensPayload,
      lens: "public-works",
    },
    "/api/lenses/fire-ems/dashboard": {
      stake: "answering with the demo pack's apparatus and stations would serve demo readiness under whatever city the caller meant",
      payload: fireEmsLensPayload,
      lens: "fire-ems",
    },
  };
  const lensSurface = LENS_SURFACES[url.pathname];
  if (req.method === "GET" && lensSurface) {
    const cityKey = requiredCityKey(res, url, lensSurface.stake);
    if (!cityKey) return;
    const caller = await resolveCaller(req);
    const pack = await getCityPack(cityKey);
    if (contentReadRefused(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, lensSurface.lens)) return;
    json(res, 200, lensSurface.payload(pack));
    return;
  }

  /**
   * The rendered page of the same two lenses. `assetBase: ""` makes the two kit
   * stylesheets absolute, because this path is nested (/lens/public-works) and a
   * relative link would resolve to /lens/sc-kit.css. It is the ONLY difference
   * between this document and what scripts/export-*-lens.mjs writes for the
   * design's check to read.
   */
  const LENS_PAGES = {
    "/lens/public-works": {
      stake: "serving the demo pack's public works page to a caller who named no city would render demo records under their own header",
      page: renderPublicWorksSurface,
      lens: "public-works",
    },
    "/lens/fire-ems": {
      stake: "serving the demo pack's fire and EMS page to a caller who named no city would render demo readiness under their own header",
      page: renderFireEmsSurface,
      lens: "fire-ems",
    },
  };
  const lensPage = LENS_PAGES[url.pathname];
  if (req.method === "GET" && lensPage) {
    const cityKey = requiredCityKey(res, url, lensPage.stake);
    if (!cityKey) return;
    const caller = await resolveCaller(req);
    const pack = await getCityPack(cityKey);
    /**
     * The page and the JSON dashboard beside it are the same reading of the
     * same records, so both are recorded and both carry the same lens. The
     * refusals here are HTML rather than JSON (this route serves a document),
     * which is why this seam does not use the shared contentReadRefused --
     * but the LOG WRITE is shared, so a failure to record refuses the page
     * exactly as it refuses the payload.
     */
    if (contentReadRefusedHtml(res, caller, pack)) return;
    if (await recordReadOrRefuse(res, url, caller, pack, lensPage.lens)) return;
    html(res, 200, lensPage.page(pack, { assetBase: "" }));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/lenses/")) {
    const id = url.pathname.slice("/api/lenses/".length);
    const lens = getLens(id);
    if (!lens) {
      json(res, 404, { error: "unknown lens" });
      return;
    }
    json(res, 200, { lens });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/city-packs") {
    const caller = await resolveCaller(req);
    const listed = await listCityPacks();
    const cityPacks = [];
    for (const item of listed) {
      const pack = await getCityPack(item.cityKey);
      if (canReadPack(pack, caller)) cityPacks.push(item);
    }
    if (caller.kind === "anonymous" && String(process.env.DASHBOARDS_API_KEY || "").trim()) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    /**
     * G-161. The caller's own resolved tenant rides back with the list.
     *
     * The client must take its city from an explicit choice FIRST and from the
     * caller's resolved tenant SECOND (dispatch item 3), and the second leg is
     * not something a browser can work out on its own: a Hauska product key or a
     * staff sign-in names the city SERVER-side, and web/app.js is forbidden by
     * src/city-identity.test.mjs from naming any shipped pack as a literal. It
     * cannot default to `template-city` and it cannot guess `bastrop_tx`, so the
     * one route it can ask without naming a city is this one, which is already
     * the enumeration and already resolves the caller.
     *
     * `tenant` is the caller's cityKey - the same field callerIsPackSubject()
     * compares against a pack's own cityKey - and it is null for a caller that is
     * a subject of nothing, which is a real state (a staff account provisioned
     * with no role yet) rather than an error. The client reads null as "no city
     * resolved" and shows its no-city state, so a blank is never a city.
     */
    json(res, 200, {
      cityPacks,
      caller: { kind: caller.kind, tenant: caller.tenant ?? null },
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/city-packs/")) {
    const caller = await resolveCaller(req);
    const key = decodeURIComponent(url.pathname.slice("/api/city-packs/".length));
    const pack = await getCityPack(key);
    const status = packReadStatus(pack, caller);
    if (status === 404) {
      json(res, 404, { error: "unknown city pack" });
      return;
    }
    if (status !== 200) {
      json(res, status, accessRefusalBody(caller, status));
      return;
    }
    json(res, 200, { cityPack: pack });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mounts") {
    const mounts = readMounts();
    json(res, 200, {
      mounts,
      smartsiteExample: smartsiteEmbedUrl("parcel-example"),
      planReviewExample: planReviewEmbedUrl(),
      smartFilesExample: smartFilesEmbedUrl(),
      mcp: {
        server: "existing-hauska-mcp",
        namedTools: MCP_TOOL_NAMES,
        serving: true,
      },
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    sendFile(req, res, path.join(WEB, "index.html"), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/app.js") {
    sendFile(req, res, path.join(WEB, "app.js"), "text/javascript; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/sc-kit.css") {
    sendFile(req, res, path.join(WEB, "sc-kit.css"), "text/css");
    return;
  }

  if (req.method === "GET" && url.pathname === "/shell.css") {
    sendFile(req, res, path.join(WEB, "shell.css"), "text/css");
    return;
  }

  if (req.method === "GET" && (url.pathname === "/compass" || url.pathname === "/compass/")) {
    json(res, 404, { error: "not found" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/staff-map.mjs") {
    sendFile(req, res, path.join(__dirname, "staff-map.mjs"), "text/javascript; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/staff-review.mjs") {
    sendFile(req, res, path.join(__dirname, "staff-review.mjs"), "text/javascript; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/theme.mjs") {
    sendFile(req, res, path.join(__dirname, "theme.mjs"), "text/javascript; charset=utf-8");
    return;
  }

  /**
   * G-117. The native Bastrop property map's own served page -- three
   * files, same sendFile/etag convention as index.html/app.js/the two
   * stylesheets above, so they're picked up by src/served-surface.mjs's
   * derivation (SERVED_ASSETS, scanned by every markup/class/forbidden-
   * string gate) with no separate listing to keep in sync.
   */
  if (req.method === "GET" && url.pathname === "/property-map.html") {
    sendFile(req, res, path.join(WEB, "property-map.html"), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/property-map.js") {
    sendFile(req, res, path.join(WEB, "property-map.js"), "text/javascript; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/property-map.css") {
    sendFile(req, res, path.join(WEB, "property-map.css"), "text/css");
    return;
  }

  /**
   * G-117 full-parity follow-up. The shared 52-layer catalog module (colors,
   * categories, minZoom, the 6 styled-override functions, the 10 view
   * templates) -- served plainly, same convention as /theme.mjs, so
   * web/property-map.js can `import` it directly rather than carrying a
   * second copy of 52 layer definitions in the browser.
   */
  if (req.method === "GET" && url.pathname === "/property-map-catalog.mjs") {
    sendFile(req, res, path.join(__dirname, "property-map-catalog.mjs"), "text/javascript; charset=utf-8");
    return;
  }

  json(res, 404, { error: "not found" });
}

export const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    json(res, 500, { error: String(err.message || err) });
  });
});

if (isMain) {
  if (getPacksStore() === "neon") {
    await ensureCityPacksTable();
  }
  server.listen(PORT, () => {
    process.stdout.write(`smartcity-dashboards listening on ${PORT}\n`);
  });
}
