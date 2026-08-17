import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLenses, getLens } from "./lenses.mjs";
import { listCityPacks, getCityPack, getPacksStore, ensureCityPacksTable } from "./city-pack.mjs";
import { readMounts, smartsiteEmbedUrl, planReviewEmbedUrl, assertNoSupplierDsn, assertNoSupplierMounts } from "./mounts.mjs";
import { composeCityManager } from "./compose.mjs";
import { listAdapterKinds } from "./adapters.mjs";
import { loadDotenv } from "./load-env.mjs";
import { pingDb } from "./db.mjs";
import { MCP_TOOL_NAMES } from "./catalog.mjs";
import { canReadPack, packReadStatus, resolveCaller, isServiceBearer } from "./tenancy.mjs";

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
