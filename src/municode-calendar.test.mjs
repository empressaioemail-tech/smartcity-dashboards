import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseMunicodeMeetingsHtml,
  fetchMunicodeMeetings,
  writeMeetingRecords,
  readMeetingRecords,
  runMunicodeCalendar,
  listMeetingsForOverview,
  DEFAULT_MUNICODE_SOURCE,
} from "./municode-calendar.mjs";
import { assertPublicFeedSourceUrl, TEMPLATE_MUNICODE_CALENDAR_GRANT } from "./adapters.mjs";
import { FIXTURE_CITY, TEMPLATE_CITY } from "./city-pack.mjs";

const SAMPLE_HTML = `
<table>
  <tr class="odd views-row-first">
    <td data-th="Date">
      <span class="date-display-single" property="dc:date" datatype="xsd:dateTime" content="2026-09-14T18:00:00-05:00">09/14/2026 - 6:00pm</span>
    </td>
    <td class="views-field views-field-title" data-th="Meeting">
      Public Library Board
    </td>
  </tr>
</table>
`;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("municode calendar adapter", () => {
  it("parses a public municode meetings table and does not invent rows", () => {
    const records = parseMunicodeMeetingsHtml(SAMPLE_HTML, DEFAULT_MUNICODE_SOURCE);
    assert.equal(records.length, 1);
    assert.equal(records[0].title, "Public Library Board");
    assert.equal(records[0].when, "2026-09-14T18:00:00-05:00");
    assert.equal(records[0].source, DEFAULT_MUNICODE_SOURCE);
    assert.deepEqual(parseMunicodeMeetingsHtml("<html></html>", DEFAULT_MUNICODE_SOURCE), []);
  });

  it("refuses smartcityos.io and city calendar APIs as a source", () => {
    assert.throws(
      () => assertPublicFeedSourceUrl("https://smartcityos.io/api/calendar/events/public"),
      /smartcityos\.io/,
    );
    assert.throws(
      () => assertPublicFeedSourceUrl("https://bastrop-tx.municodemeetings.com/api/calendar/feed"),
      /api\/calendar/,
    );
    assert.equal(assertPublicFeedSourceUrl(DEFAULT_MUNICODE_SOURCE), true);
  });

  it("fetch refuses the city host before any network call", async () => {
    await assert.rejects(
      () =>
        fetchMunicodeMeetings({
          sourceUrl: "https://smartcityos.io/api/calendar/events/public",
          fetchImpl: () => {
            throw new Error("must not fetch city calendar");
          },
        }),
      /smartcityos\.io/,
    );
  });

  it("writes at least one meeting record through the files client", async () => {
    const calls = [];
    const filesClient = {
      async listFolders(args) {
        calls.push(["listFolders", args]);
        return { folders: [] };
      },
      async createFolder(args) {
        calls.push(["createFolder", args]);
        assert.equal(args.label, "Public meetings");
        assert.equal(args.orgId, "template-city");
        return { folder: { folderId: "folder-meetings", label: "Public meetings" } };
      },
      async uploadFile(args) {
        calls.push(["uploadFile", args]);
        const record = JSON.parse(Buffer.from(args.bytesBase64, "base64").toString("utf8"));
        assert.equal(record.title, "Public Library Board");
        assert.equal(record.when, "2026-09-14T18:00:00-05:00");
        assert.equal(record.accessPolicy, "public-free");
        assert.equal(record.sourceUrl, DEFAULT_MUNICODE_SOURCE);
        assert.equal(record.writesTo, "files");
        assert.equal(args.contentType, "application/json");
        return { file: { entityId: "smartfile:tenant:template-city:2026-09-14-public-library-board" } };
      },
    };
    const wrote = await writeMeetingRecords({
      cityKey: "template-city",
      meetings: parseMunicodeMeetingsHtml(SAMPLE_HTML, DEFAULT_MUNICODE_SOURCE),
      filesClient,
      fetchedAt: "2026-08-17T23:00:00.000Z",
      env: {},
    });
    assert.equal(wrote.written.length, 1);
    assert.equal(wrote.folderId, "folder-meetings");
    assert.equal(calls[0][0], "listFolders");
    assert.equal(calls[1][0], "createFolder");
    assert.equal(calls[2][0], "uploadFile");
  });

  it("reads written records or stays honest-empty with a basis", async () => {
    const empty = await readMeetingRecords({
      cityKey: "template-city",
      filesClient: {
        async listFolders() {
          return { folders: [] };
        },
      },
    });
    assert.equal(empty.status, "empty");
    assert.match(empty.basis, /no Public meetings folder/);
    assert.deepEqual(empty.records, []);

    const record = {
      title: "Public Library Board",
      when: "2026-09-14T18:00:00-05:00",
      sourceUrl: DEFAULT_MUNICODE_SOURCE,
      accessPolicy: "public-free",
    };
    const read = await readMeetingRecords({
      cityKey: "template-city",
      filesClient: {
        async listFolders() {
          return { folders: [{ folderId: "folder-meetings", label: "Public meetings" }] };
        },
        async listFolderFiles() {
          return { files: [{ entityId: "smartfile:tenant:template-city:lib", title: "lib" }] };
        },
        async readDocument() {
          return { version: { contentCid: "cid-1" } };
        },
        async getBlob() {
          return { bytes: Buffer.from(JSON.stringify(record)), contentType: "application/json" };
        },
      },
    });
    assert.equal(read.status, "ok");
    assert.equal(read.records[0].title, "Public Library Board");
    assert.equal(read.records[0].source, DEFAULT_MUNICODE_SOURCE);
  });

  it("runs the adapter for template-city and refuses fixture-city grants", async () => {
    assert.equal(TEMPLATE_CITY.grantedAdapters[0].kind, "municode");
    assert.deepEqual(FIXTURE_CITY.grantedAdapters, []);
    const filesClient = {
      async listFolders() {
        return { folders: [] };
      },
      async createFolder() {
        return { folder: { folderId: "folder-meetings", label: "Public meetings" } };
      },
      async uploadFile() {
        return { file: { entityId: "smartfile:tenant:template-city:one" } };
      },
    };
    const ran = await runMunicodeCalendar({
      cityKey: "template-city",
      env: {},
      fetchImpl: async () => new Response(SAMPLE_HTML, { status: 200 }),
      filesClient,
    });
    assert.equal(ran.status, "ok");
    assert.equal(ran.written, 1);
    assert.equal(ran.records[0].title, "Public Library Board");

    const fixture = await runMunicodeCalendar({
      cityKey: "fixture-city",
      env: {},
      fetchImpl: async () => {
        throw new Error("fixture-city must not fetch municode");
      },
      filesClient,
    });
    assert.equal(fixture.status, "empty");
    assert.match(fixture.basis, /no municode calendar grant/);
    assert.equal(fixture.written, 0);
  });

  it("overview meetings is Partial with a basis when files are unread", async () => {
    const unread = await listMeetingsForOverview({
      cityKey: "template-city",
      grant: TEMPLATE_MUNICODE_CALENDAR_GRANT,
      env: {},
    });
    assert.equal(unread.status, "unavailable");
    assert.equal(unread.honesty, "partial");
    assert.match(unread.basis, /SMART_FILES_BACKEND_URL unset/);
    assert.deepEqual(unread.records, []);
  });
});
