import { smartsiteEmbedUrl, planReviewEmbedUrl, smartFilesEmbedUrl } from "./mounts.mjs";
import { atomVisibleToCaller, callerIsPackSubject } from "./tenancy.mjs";
import { meetingsFromPack } from "./municode-calendar.mjs";

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

/**
 * `considered` is counted beside `atomCount` because refusing an atom and never
 * receiving one are different facts and only one of them is the reader's.
 *
 * Since atomVisibleToCaller refuses an atom carrying no recognised accessPolicy,
 * a chain can arrive full and summarise to zero. Reporting that as "atom-chain
 * returned no atoms" would be a fabricated basis about an upstream that did
 * answer, which is the same defect one layer over from the one the refusal
 * closes. The count travels so readAtoms can say which of the two happened.
 */
function extractAtomSummary(body, caller, cityKey) {
  if (!body || typeof body !== "object") return { atomCount: 0, types: [], considered: 0 };
  let list = [];
  if (Array.isArray(body.atoms)) list = body.atoms;
  else if (Array.isArray(body.chain)) list = body.chain;
  else if (Array.isArray(body.atomChain)) list = body.atomChain;
  const types = [];
  let atomCount = 0;
  let considered = 0;
  for (const atom of list) {
    if (!atom || typeof atom !== "object") continue;
    considered += 1;
    if (!atomVisibleToCaller(atom, caller, cityKey)) continue;
    atomCount += 1;
    const t = atom.entityType || atom.type || atom.atomType;
    if (typeof t === "string" && t && !types.includes(t)) types.push(t);
  }
  return { atomCount, types, considered };
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
      /**
       * The refusal states itself. A chain that answered with atoms none of
       * which this caller may read is not an empty chain, and the number is
       * deliberately left out: how many atoms a tenant-private subject holds is
       * the thing the refusal is protecting.
       */
      if (summary.considered > 0) {
        return emptyAtoms(id, "atom-chain returned no atoms readable by this caller");
      }
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

/**
 * The files room, read on the caller's behalf.
 *
 * TWO PATHS, AND ONLY ONE OF THEM CARRIES THE KEY. The scope is always
 * tenant:cityKey, and until now the request went out unauthenticated no matter
 * who asked - so there was no authenticated path at all and a tenant subject
 * received whatever the anonymous view returns while reading a room addressed to
 * itself. The anonymous leg stays exactly as it was, and is the fail-closed
 * control it has always been: an unauthenticated caller must never spend the
 * service key. The authenticated leg is new and it opens for one caller only,
 * the pack's own tenant subject, by the same rule canReadPack and
 * atomVisibleToCaller use for tenant-private content.
 *
 * A service bearer is deliberately NOT entitled. It is the platform, not the
 * tenant, and tenancy.mjs already refuses it tenant-private packs and
 * tenant-private atoms; a third reading of that rule pointing the other way is
 * how a tenancy boundary loses a corner.
 *
 * AND AN ENTITLED CALLER WITH NO KEY CONFIGURED IS REFUSED RATHER THAN
 * DOWNGRADED. Falling back to the anonymous fetch would hand a tenant the public
 * view of its own room labelled as its own room, which is silent degradation:
 * the deployment posture would change the answer without changing the sentence.
 */
async function readFiles({ cityKey, env, fetchImpl, caller }) {
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
  const entitled = callerIsPackSubject(caller, cityKey);
  const key = entitled ? trimEnv(env, "SMART_FILES_API_KEY") : "";
  if (entitled && !key) {
    return empty("unavailable", "SMART_FILES_API_KEY unset; an entitled caller is not served the unauthenticated view");
  }
  const headers = entitled ? bearerHeaders(key) : {};
  const url = `${base}/api/smart-files/folders?scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId)}`;
  try {
    const res = await timedFetch(fetchImpl, url, headers);
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
  const [atoms, filesRoom, meetings] = await Promise.all([
    readAtoms({ id, valid, env, fetchImpl, caller, cityKey: city }),
    readFiles({ cityKey: city, env, fetchImpl, caller }),
    meetingsFromPack({ cityKey: city, env, fetchImpl }),
  ]);
  return {
    lensId: "city-manager",
    cityKey: city,
    parcelNodeId: id,
    smartsite,
    planReview: { contract: "embed", url: planReviewEmbedUrl(env, city) },
    smartFiles: { contract: "embed", url: smartFilesEmbedUrl(env, city) },
    atoms,
    filesRoom,
    meetings,
  };
}
