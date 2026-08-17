import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLenses, getLens } from "./lenses.mjs";
import { listCityPacks, getCityPack, getPacksStore, ensureCityPacksTable } from "./city-pack.mjs";
import { readMounts, smartsiteEmbedUrl, assertNoSupplierDsn, assertNoSupplierMounts } from "./mounts.mjs";
import { composeCityManager } from "./compose.mjs";
import { listAdapterKinds } from "./adapters.mjs";
import { loadDotenv } from "./load-env.mjs";
import { pingDb } from "./db.mjs";
import { MCP_TOOL_NAMES } from "./catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, "..", "web");
const PORT = Number(process.env.PORT || 8080);
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) loadDotenv();
assertNoSupplierDsn();
assertNoSupplierMounts();

export function cityPackAuthorized(req, envMap = process.env) {
  const key = String(envMap.DASHBOARDS_API_KEY || "").trim();
  if (!key) return true;
  const header = String(req.headers?.authorization || "");
  return header === `Bearer ${key}`;
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
    const composed = await composeCityManager({
      parcelNodeId: url.searchParams.get("parcelNodeId") || "",
      cityKey: url.searchParams.get("cityKey") || "",
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
    if (!cityPackAuthorized(req)) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    json(res, 200, { cityPacks: await listCityPacks() });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/city-packs/")) {
    if (!cityPackAuthorized(req)) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    const key = decodeURIComponent(url.pathname.slice("/api/city-packs/".length));
    const pack = await getCityPack(key);
    if (!pack) {
      json(res, 404, { error: "unknown city pack" });
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
