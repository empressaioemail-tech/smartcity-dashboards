import { smartsiteEmbedUrl, planReviewEmbedUrl } from "./mounts.mjs";
import { atomVisibleToCaller } from "./tenancy.mjs";

export const PARCEL_NODE_ID_RE = /^\d{5}:[A-Za-z0-9._-]+$/;
export const COMPOSE_TIMEOUT_MS = 8000;
export const DEFAULT_CITY_KEY = "template-city";

function trimEnv(env, name) {
  return String(env[name] || "").trim();
}

function bearerHeaders(key) {
  const token = String(key || "").trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function basisFromBody(body, fallback) {
  if (!body || typeof body !== "object") return fallback;
  for (const key of ["basis", "message", "error", "reason"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function asJson(res) {
  const ct = String(res.headers?.get?.("content-type") || "");
  if (ct && !ct.includes("json") && !ct.includes("text/plain")) {
    return null;
  }
  return res.json().catch(() => null);
}

function failureKind(err) {
  const name = err?.name || "";
  const msg = String(err?.message || err || "");
  if (name === "TimeoutError" || name === "AbortError" || /timeout|aborted/i.test(msg)) {
    return "timeout";
  }
  return "network";
}

async function timedFetch(fetchImpl, url, headers) {
  return fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(COMPOSE_TIMEOUT_MS),
  });
}

function extractAtomSummary(body, caller, cityKey) {
  if (!body || typeof body !== "object") return { atomCount: 0, types: [] };
  let list = [];
  if (Array.isArray(body.atoms)) list = body.atoms;
  else if (Array.isArray(body.chain)) list = body.chain;
  else if (Array.isArray(body.atomChain)) list = body.atomChain;
  const types = [];
  let atomCount = 0;
  for (const atom of list) {
    if (!atom || typeof atom !== "object") continue;
    if (!atomVisibleToCaller(atom, caller, cityKey)) continue;
    atomCount += 1;
    const t = atom.entityType || atom.type || atom.atomType;
    if (typeof t === "string" && t && !types.includes(t)) types.push(t);
  }
  return { atomCount, types };
}

function slimFolders(body) {
  const raw = Array.isArray(body?.folders) ? body.folders : Array.isArray(body) ? body : [];
  const folders = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const folderId = String(f.folderId || f.id || "").trim();
    if (!folderId) continue;
    folders.push({
      folderId,
      label: String(f.label || f.name || folderId).trim() || folderId,
    });
  }
  return folders;
}

function emptyAtoms(parcelNodeId, basis) {
  return {
    contract: "atom-read-http",
    status: "empty",
    basis,
    parcelNodeId,
    atomCount: 0,
    types: [],
  };
}

function unavailableAtoms(parcelNodeId, basis) {
  return {
    contract: "atom-read-http",
    status: "unavailable",
    basis,
    parcelNodeId,
    atomCount: 0,
    types: [],
  };
}

async function readAtoms({ id, valid, env, fetchImpl, caller, cityKey }) {
  if (!valid) {
    return emptyAtoms(id, id ? "invalid parcelNodeId" : "missing parcelNodeId");
  }
  const base = trimEnv(env, "HAUSKA_RETRIEVAL_URL").replace(/\/$/, "");
  if (!base) return unavailableAtoms(id, "HAUSKA_RETRIEVAL_URL unset");
  const url = `${base}/property-nodes/${encodeURIComponent(id)}/atom-chain`;
  const key = trimEnv(env, "HAUSKA_RETRIEVAL_API_KEY") || trimEnv(env, "HAUSKA_ENGINE_API_KEY");
  try {
    const res = await timedFetch(fetchImpl, url, bearerHeaders(key));
    const body = await asJson(res);
    if (res.status === 401 || res.status === 403) {
      return unavailableAtoms(id, "retrieval auth refused");
    }
    if (res.status >= 500) {
      return unavailableAtoms(id, `retrieval HTTP ${res.status}`);
    }
    if (res.status === 404) {
      return emptyAtoms(id, basisFromBody(body, "atom-chain returned 404"));
    }
    if (res.status !== 200) {
      return unavailableAtoms(id, basisFromBody(body, `retrieval HTTP ${res.status}`));
    }
    const summary = extractAtomSummary(body, caller, cityKey);
    if (summary.atomCount === 0) {
      return emptyAtoms(id, basisFromBody(body, "atom-chain returned no atoms"));
    }
    return {
      contract: "atom-read-http",
      status: "ok",
      basis: "atom-chain",
      parcelNodeId: id,
      atomCount: summary.atomCount,
      types: summary.types,
    };
  } catch (err) {
    const kind = failureKind(err);
    return unavailableAtoms(
      id,
      kind === "timeout" ? "retrieval timeout" : `retrieval ${kind} error`,
    );
  }
}

async function readFiles({ cityKey, env, fetchImpl }) {
  const scopeType = "tenant";
  const scopeId = cityKey;
  const empty = (status, basis) => ({
    contract: "service-http",
    status,
    basis,
    scopeType,
    scopeId,
    folderCount: 0,
    folders: [],
  });
  const base = trimEnv(env, "SMART_FILES_BACKEND_URL").replace(/\/$/, "");
  if (!base) return empty("unavailable", "SMART_FILES_BACKEND_URL unset");
  const url = `${base}/api/smart-files/folders?scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId)}`;
  try {
    const res = await timedFetch(fetchImpl, url, {});
    const body = await asJson(res);
    if (res.status === 401 || res.status === 403) {
      return empty("unavailable", "files auth refused");
    }
    if (res.status >= 500) {
      return empty("unavailable", `files HTTP ${res.status}`);
    }
    if (res.status !== 200) {
      return empty("unavailable", basisFromBody(body, `files HTTP ${res.status}`));
    }
    const folders = slimFolders(body);
    if (folders.length === 0) {
      return empty("empty", `no folders for tenant:${cityKey}`);
    }
    return {
      contract: "service-http",
      status: "ok",
      basis: "smart-files folders",
      scopeType,
      scopeId,
      folderCount: folders.length,
      folders,
    };
  } catch (err) {
    const kind = failureKind(err);
    return empty(
      "unavailable",
      kind === "timeout" ? "files timeout" : `files ${kind} error`,
    );
  }
}

export async function composeCityManager({
  parcelNodeId = "",
  cityKey = DEFAULT_CITY_KEY,
  env = process.env,
  fetchImpl = globalThis.fetch,
  caller = { kind: "anonymous" },
} = {}) {
  const city = String(cityKey || DEFAULT_CITY_KEY).trim() || DEFAULT_CITY_KEY;
  const id = String(parcelNodeId || "").trim();
  const valid = PARCEL_NODE_ID_RE.test(id);
  const smartsite = valid
    ? { contract: "embed", url: smartsiteEmbedUrl(id) }
    : {
        contract: "embed",
        url: "",
        basis: id ? "invalid parcelNodeId" : "missing parcelNodeId",
      };
  const [atoms, filesRoom] = await Promise.all([
    readAtoms({ id, valid, env, fetchImpl, caller, cityKey: city }),
    readFiles({ cityKey: city, env, fetchImpl }),
  ]);
  return {
    lensId: "city-manager",
    cityKey: city,
    parcelNodeId: id,
    smartsite,
    planReview: { contract: "embed", url: planReviewEmbedUrl(env) },
    atoms,
    filesRoom,
  };
}
