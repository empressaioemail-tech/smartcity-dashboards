function trimEnv(env, name) {
  return String(env[name] || "").trim();
}

function bearerHeaders(key) {
  const token = String(key || "").trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function asJson(res) {
  return res.json().catch(() => null);
}

export function filesBaseUrl(env = process.env) {
  return trimEnv(env, "SMART_FILES_BACKEND_URL").replace(/\/$/, "");
}

export function createFilesClient({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = filesBaseUrl(env);
  const key = trimEnv(env, "SMART_FILES_API_KEY");
  const headers = {
    accept: "application/json",
    ...bearerHeaders(key),
  };

  async function request(method, path, body) {
    if (!base) {
      const err = new Error("SMART_FILES_BACKEND_URL unset");
      err.status = 0;
      err.basis = "SMART_FILES_BACKEND_URL unset";
      throw err;
    }
    const url = `${base}${path}`;
    const opts = {
      method,
      headers: body
        ? { ...headers, "content-type": "application/json" }
        : headers,
      signal: AbortSignal.timeout(8000),
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetchImpl(url, opts);
    const json = await asJson(res);
    if (res.status === 401 || res.status === 403) {
      const err = new Error("files auth refused");
      err.status = res.status;
      err.basis = "files auth refused";
      err.body = json;
      throw err;
    }
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(json?.message || json?.error || `files HTTP ${res.status}`);
      err.status = res.status;
      err.basis = `files HTTP ${res.status}`;
      err.body = json;
      throw err;
    }
    return json;
  }

  return {
    base,
    hasKey: Boolean(key),
    async listFolders({ scopeType, scopeId }) {
      const q = `scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId)}`;
      return request("GET", `/api/smart-files/folders?${q}`);
    },
    async createFolder({ orgId, userId, label }) {
      return request("POST", "/api/smart-files/folders", { orgId, userId, label });
    },
    async listFolderFiles({ folderId }) {
      return request("GET", `/api/smart-files/folders/${encodeURIComponent(folderId)}/files`);
    },
    async uploadFile({ folderId, orgId, userId, title, contentType, bytesBase64 }) {
      return request("POST", `/api/smart-files/folders/${encodeURIComponent(folderId)}/files`, {
        orgId,
        userId,
        title,
        contentType: contentType || "application/json",
        bytesBase64,
      });
    },
    async readDocument({ entityId }) {
      return request("GET", `/api/smart-files/files/${encodeURIComponent(entityId)}`);
    },
    async getBlob({ contentCid }) {
      if (!base) {
        const err = new Error("SMART_FILES_BACKEND_URL unset");
        err.basis = "SMART_FILES_BACKEND_URL unset";
        throw err;
      }
      const res = await fetchImpl(`${base}/api/smart-files/blobs/${encodeURIComponent(contentCid)}`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401 || res.status === 403) {
        const err = new Error("files auth refused");
        err.basis = "files auth refused";
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`files HTTP ${res.status}`);
        err.basis = `files HTTP ${res.status}`;
        throw err;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return { bytes: buf, contentType: res.headers.get("content-type") || "" };
    },
  };
}
