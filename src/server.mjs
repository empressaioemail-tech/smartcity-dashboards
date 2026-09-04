import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLenses, getLens } from "./lenses.mjs";
import { listCityPacks, getCityPack, getPacksStore, ensureCityPacksTable } from "./city-pack.mjs";
import { readMounts, smartsiteEmbedUrl, planReviewEmbedUrl, smartFilesEmbedUrl, assertNoSupplierDsn, assertNoSupplierMounts } from "./mounts.mjs";
import { composeCityManager, DEFAULT_CITY_KEY } from "./compose.mjs";
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
import { runMunicodeCalendar } from "./municode-calendar.mjs";
import { loadDotenv } from "./load-env.mjs";
import { pingDb } from "./db.mjs";
import { MCP_TOOL_NAMES } from "./catalog.mjs";
import { canReadPack, packContentReadStatus, packReadStatus, resolveCaller, isServiceBearer } from "./tenancy.mjs";

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

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(data);
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
    const cityKey = url.searchParams.get("cityKey") || "template-city";
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
    const caller = await resolveCaller(req);
    const cityKey = url.searchParams.get("cityKey") || DEFAULT_CITY_KEY;
    const pack = await getCityPack(cityKey);
    const status = packContentReadStatus(pack, caller);
    if (status === 404) {
      json(res, 404, { error: "unknown city pack" });
      return;
    }
    if (status !== 200) {
      json(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
      return;
    }
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
    const status = packContentReadStatus(pack, caller);
    if (status === 404) {
      json(res, 404, { error: "unknown city pack" });
      return;
    }
    if (status !== 200) {
      json(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
      return;
    }
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
    const status = packContentReadStatus(pack, caller);
    if (status === 404) {
      json(res, 404, { error: "unknown city pack" });
      return;
    }
    if (status !== 200) {
      json(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
      return;
    }
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
    const caller = await resolveCaller(req);
    const cityKey = url.searchParams.get("cityKey") || "template-city";
    const pack = await getCityPack(cityKey);
    // Content read, not enumeration: a public-free pack is readable anonymously
    // whether or not this deployment has a service key configured.
    const status = packContentReadStatus(pack, caller);
    if (status === 404) {
      json(res, 404, { error: "unknown city pack" });
      return;
    }
    if (status !== 200) {
      json(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
      return;
    }
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
    const caller = await resolveCaller(req);
    const cityKey = url.searchParams.get("cityKey") || "template-city";
    const pack = await getCityPack(cityKey);
    const status = packContentReadStatus(pack, caller);
    if (status === 404) {
      json(res, 404, { error: "unknown city pack" });
      return;
    }
    if (status !== 200) {
      json(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
      return;
    }
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
    const caller = await resolveCaller(req);
    const cityKey = url.searchParams.get("cityKey") || "template-city";
    const domainId = decodeURIComponent(url.pathname.slice("/api/domains/".length));
    const pack = await getCityPack(cityKey);
    const status = packContentReadStatus(pack, caller);
    if (status === 404) {
      json(res, 404, { error: "unknown city pack" });
      return;
    }
    if (status !== 200) {
      json(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
      return;
    }
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
          json(res, 200, composed);
          return;
        }
      }
    }
    const composed = composeDomainById(pack, domainId);
    json(res, composed.status === "not-registered" ? 404 : 200, composed);
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
    const caller = await resolveCaller(req);
    const cityKey = url.searchParams.get("cityKey") || "template-city";
    const pack = await getCityPack(cityKey);
    const status = packContentReadStatus(pack, caller);
    if (status === 404) {
      json(res, 404, { error: "unknown city pack" });
      return;
    }
    if (status !== 200) {
      json(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
      return;
    }
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
    const caller = await resolveCaller(req);
    const cityKey = url.searchParams.get("cityKey") || "template-city";
    const pack = await getCityPack(cityKey);
    const status = packContentReadStatus(pack, caller);
    if (status === 404) {
      json(res, 404, { error: "unknown city pack" });
      return;
    }
    if (status !== 200) {
      json(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
      return;
    }
    json(res, 200, shellState({ caller, pack, env: process.env }));
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
    json(res, 200, { cityPacks });
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
      json(res, status, { error: status === 401 ? "unauthorized" : "forbidden" });
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
