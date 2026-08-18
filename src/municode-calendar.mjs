import { assertPublicFeedSourceUrl, calendarGrantFor, isIdentityHeldClerkHost } from "./adapters.mjs";
import { getCityPack } from "./city-pack.mjs";
import { createFilesClient, filesBaseUrl } from "./files-client.mjs";

export const PUBLIC_MEETINGS_FOLDER_LABEL = "Public meetings";
export const DEFAULT_MUNICODE_SOURCE = "https://example.com/meetings";
export const HELD_BASTROP_CLERK = "https://bastrop-tx.municodemeetings.com/";

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function actorFor(cityKey, env = process.env) {
  return {
    orgId: String(env.SMART_FILES_ACTOR_ORG || cityKey).trim() || cityKey,
    userId: String(env.SMART_FILES_ACTOR_USER || "g71-calendar").trim() || "g71-calendar",
  };
}

export function parseMunicodeMeetingsHtml(html, sourceUrl) {
  const records = [];
  const re =
    /<span class="date-display-single"[^>]*\bcontent="([^"]+)"[\s\S]*?<td class="views-field views-field-title"[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const when = String(match[1] || "").trim();
    const title = decodeEntities(stripTags(match[2]));
    if (!when || !title) continue;
    records.push({
      title,
      when,
      source: sourceUrl,
    });
  }
  return records;
}

export async function fetchMunicodeMeetings({
  sourceUrl = DEFAULT_MUNICODE_SOURCE,
  fetchImpl = globalThis.fetch,
} = {}) {
  assertPublicFeedSourceUrl(sourceUrl);
  const res = await fetchImpl(sourceUrl, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Hauska-G71-calendar/1.0" },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      status: "unavailable",
      basis: `municode HTTP ${res.status}`,
      sourceUrl,
      records: [],
    };
  }
  const records = parseMunicodeMeetingsHtml(text, sourceUrl);
  if (records.length === 0) {
    return {
      status: "empty",
      basis: `municode host returned no parseable meetings: ${sourceUrl}`,
      sourceUrl,
      records: [],
    };
  }
  return { status: "ok", basis: "municode meetings host", sourceUrl, records };
}

function meetingFileTitle(record) {
  const day = String(record.when || "").slice(0, 10) || "undated";
  return `${day} ${record.title}`.slice(0, 180);
}

export async function writeMeetingRecords({
  cityKey,
  meetings,
  filesClient,
  fetchedAt,
  accessPolicy = "public-free",
  env = process.env,
}) {
  const actor = actorFor(cityKey, env);
  const listed = await filesClient.listFolders({ scopeType: "tenant", scopeId: cityKey });
  const folders = Array.isArray(listed?.folders) ? listed.folders : [];
  let folder = folders.find((f) => f.label === PUBLIC_MEETINGS_FOLDER_LABEL);
  if (!folder) {
    const created = await filesClient.createFolder({
      orgId: actor.orgId,
      userId: actor.userId,
      label: PUBLIC_MEETINGS_FOLDER_LABEL,
    });
    folder = created?.folder || created;
  }
  const folderId = folder?.folderId;
  if (!folderId) {
    const err = new Error("files folder create returned no folderId");
    err.basis = "files folder create returned no folderId";
    throw err;
  }
  const written = [];
  for (const meeting of meetings) {
    const record = {
      kind: "municode",
      purpose: "calendar",
      cityKey,
      title: meeting.title,
      when: meeting.when,
      sourceUrl: meeting.source,
      sourceHost: new URL(meeting.source).hostname,
      fetchedAt,
      accessPolicy,
      writesTo: "files",
    };
    const uploaded = await filesClient.uploadFile({
      folderId,
      orgId: actor.orgId,
      userId: actor.userId,
      title: meetingFileTitle(meeting),
      contentType: "application/json",
      bytesBase64: Buffer.from(JSON.stringify(record), "utf8").toString("base64"),
    });
    written.push({
      title: record.title,
      when: record.when,
      source: record.sourceUrl,
      accessPolicy: record.accessPolicy,
      entityId: uploaded?.file?.entityId || uploaded?.entityId || null,
      folderId,
    });
  }
  return { folderId, written };
}

function recordFromJson(body, fallbackTitle, fallbackSource) {
  if (!body || typeof body !== "object") return null;
  const title = String(body.title || fallbackTitle || "").trim();
  const when = String(body.when || "").trim();
  const source = String(body.sourceUrl || body.source || fallbackSource || "").trim();
  if (!title || !when) return null;
  return {
    title,
    when,
    source,
    accessPolicy: String(body.accessPolicy || "").trim() || "public-free",
  };
}

export async function readMeetingRecords({ cityKey, filesClient, sourceUrl = "" }) {
  const listed = await filesClient.listFolders({ scopeType: "tenant", scopeId: cityKey });
  const folders = Array.isArray(listed?.folders) ? listed.folders : [];
  const folder = folders.find((f) => f.label === PUBLIC_MEETINGS_FOLDER_LABEL);
  if (!folder?.folderId) {
    return {
      status: "empty",
      basis: `no Public meetings folder for tenant:${cityKey}`,
      records: [],
    };
  }
  const files = await filesClient.listFolderFiles({ folderId: folder.folderId });
  const rows = Array.isArray(files?.files) ? files.files : [];
  if (rows.length === 0) {
    return {
      status: "empty",
      basis: `Public meetings folder has no files for tenant:${cityKey}`,
      records: [],
    };
  }
  const records = [];
  for (const file of rows) {
    try {
      const doc = await filesClient.readDocument({ entityId: file.entityId });
      const cid = doc?.version?.contentCid;
      if (!cid) continue;
      const blob = await filesClient.getBlob({ contentCid: cid });
      const parsed = JSON.parse(Buffer.from(blob.bytes).toString("utf8"));
      const record = recordFromJson(parsed, file.title, sourceUrl);
      if (record) records.push(record);
    } catch {
      continue;
    }
  }
  if (records.length === 0) {
    return {
      status: "empty",
      basis: `meeting files for tenant:${cityKey} had no parseable records`,
      records: [],
    };
  }
  return {
    status: "ok",
    basis: "smart-files meeting records",
    records,
  };
}

export function honestMeetings(status, basis, records = []) {
  return {
    contract: "files-record-read",
    status,
    honesty: status === "ok" ? "read" : "partial",
    basis,
    recordCount: records.length,
    records,
  };
}

export async function listMeetingsForOverview({
  cityKey,
  grant = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  filesClient = null,
} = {}) {
  if (!grant) {
    return honestMeetings("empty", `no municode calendar grant on ${cityKey}`);
  }
  if (isIdentityHeldClerkHost(grant.sourceUrl)) {
    return honestMeetings(
      "empty",
      "identity hold: Bastrop clerk calendar is not a template-city source",
    );
  }
  if (!filesBaseUrl(env)) {
    return honestMeetings("unavailable", "SMART_FILES_BACKEND_URL unset");
  }
  const client = filesClient || createFilesClient({ env, fetchImpl });
  try {
    return honestMeetings(
      ...(await (async () => {
        if (isIdentityHeldClerkHost(grant.sourceUrl)) {
          return [
            "empty",
            "identity hold: Bastrop clerk calendar is not a template-city source",
            [],
          ];
        }
        const read = await readMeetingRecords({
          cityKey,
          filesClient: client,
          sourceUrl: grant.sourceUrl,
        });
        const leaked = (read.records || []).some((row) => isIdentityHeldClerkHost(row.source));
        if (leaked) {
          return [
            "empty",
            "identity hold: Bastrop clerk calendar is not a template-city source",
            [],
          ];
        }
        return [read.status, read.basis, read.records];
      })()),
    );
  } catch (err) {
    return honestMeetings("unavailable", err.basis || String(err.message || err));
  }
}

export async function runMunicodeCalendar({
  cityKey = "template-city",
  env = process.env,
  fetchImpl = globalThis.fetch,
  filesClient = null,
  limit = 5,
} = {}) {
  const pack = await getCityPack(cityKey, env);
  const grant = calendarGrantFor(pack);
  if (!grant) {
    return {
      cityKey,
      status: "empty",
      basis: `no municode calendar grant on ${cityKey}`,
      fetched: 0,
      written: 0,
      records: [],
    };
  }
  if (isIdentityHeldClerkHost(grant.sourceUrl)) {
    return {
      cityKey,
      status: "empty",
      basis: "identity hold: Bastrop clerk calendar is not a template-city source",
      fetched: 0,
      written: 0,
      records: [],
    };
  }
  assertPublicFeedSourceUrl(grant.sourceUrl);
  const fetchedAt = new Date().toISOString();
  const fetched = await fetchMunicodeMeetings({
    sourceUrl: grant.sourceUrl,
    fetchImpl,
  });
  if (fetched.records.length === 0) {
    return {
      cityKey,
      status: fetched.status,
      basis: fetched.basis,
      sourceUrl: grant.sourceUrl,
      fetched: 0,
      written: 0,
      records: [],
    };
  }
  const slice = fetched.records.slice(0, Math.max(1, Number(limit) || 5));
  const client = filesClient || createFilesClient({ env, fetchImpl });
  const wrote = await writeMeetingRecords({
    cityKey,
    meetings: slice,
    filesClient: client,
    fetchedAt,
    accessPolicy: grant.accessPolicy,
    env,
  });
  return {
    cityKey,
    status: "ok",
    basis: "wrote municode meetings onto files",
    sourceUrl: grant.sourceUrl,
    fetched: fetched.records.length,
    written: wrote.written.length,
    folderId: wrote.folderId,
    records: wrote.written,
  };
}

export async function meetingsFromPack({
  cityKey,
  env = process.env,
  fetchImpl = globalThis.fetch,
  filesClient = null,
} = {}) {
  const pack = await getCityPack(cityKey, env);
  return listMeetingsForOverview({
    cityKey,
    grant: calendarGrantFor(pack),
    env,
    fetchImpl,
    filesClient,
  });
}
