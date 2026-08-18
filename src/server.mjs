import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLenses, getLens } from "./lenses.mjs";
import { listCityPacks, getCityPack, getPacksStore, ensureCityPacksTable } from "./city-pack.mjs";
import { readMounts, smartsiteEmbedUrl, planReviewEmbedUrl, smartFilesEmbedUrl, assertNoSupplierDsn, assertNoSupplierMounts } from "./mounts.mjs";
import { composeCityManager } from "./compose.mjs";
import { listAdapterKinds } from "./adapters.mjs";
import { composePipeline } from "./fixtures.mjs";
import { cityIdentity } from "./city-identity.mjs";
import { runMunicodeCalendar } from "./municode-calendar.mjs";
import { loadDotenv } from "./load-env.mjs";
import { pingDb } from "./db.mjs";
import { MCP_TOOL_NAMES } from "./catalog.mjs";
import { canReadPack, packContentReadStatus, packReadStatus, resolveCaller, isServiceBearer } from "./tenancy.mjs";

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

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": contentType });
    res.end(buf);
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

  if (req.method === "GET" && url.pathname === "/api/lenses/city-manager/compose") {
    const caller = await resolveCaller(req);
    const composed = await composeCityManager({
      parcelNodeId: url.searchParams.get("parcelNodeId") || "",
      cityKey: url.searchParams.get("cityKey") || "",
      caller,
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
    json(res, 200, composePipeline(pack));
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
    sendFile(res, path.join(WEB, "index.html"), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/app.js") {
    sendFile(res, path.join(WEB, "app.js"), "text/javascript; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/sc-kit.css") {
    sendFile(res, path.join(WEB, "sc-kit.css"), "text/css");
    return;
  }

  if (req.method === "GET" && url.pathname === "/shell.css") {
    sendFile(res, path.join(WEB, "shell.css"), "text/css");
    return;
  }

  if (req.method === "GET" && (url.pathname === "/compass" || url.pathname === "/compass/")) {
    json(res, 404, { error: "not found" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/staff-map.mjs") {
    sendFile(res, path.join(__dirname, "staff-map.mjs"), "text/javascript; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/staff-review.mjs") {
    sendFile(res, path.join(__dirname, "staff-review.mjs"), "text/javascript; charset=utf-8");
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
