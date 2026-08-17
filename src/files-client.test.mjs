import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFilesClient } from "./files-client.mjs";

describe("files client", () => {
  it("POSTs a meeting file to the Smart Files service, not a local table", async () => {
    const calls = [];
    const client = createFilesClient({
      env: {
        SMART_FILES_BACKEND_URL: "https://files.example.invalid",
        SMART_FILES_API_KEY: "files-secret",
      },
      fetchImpl: async (url, opts = {}) => {
        calls.push({ url: String(url), method: opts.method, headers: opts.headers, body: opts.body });
        if (String(url).endsWith("/api/smart-files/folders") && opts.method === "POST") {
          return new Response(JSON.stringify({ folder: { folderId: "f1" } }), {
            status: 201,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ file: { entityId: "smartfile:tenant:template-city:one" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const created = await client.createFolder({
      orgId: "template-city",
      userId: "g71-calendar",
      label: "Public meetings",
    });
    assert.equal(created.folder.folderId, "f1");
    const uploaded = await client.uploadFile({
      folderId: "f1",
      orgId: "template-city",
      userId: "g71-calendar",
      title: "2026-09-14 Public Library Board",
      contentType: "application/json",
      bytesBase64: Buffer.from("{}").toString("base64"),
    });
    assert.equal(uploaded.file.entityId, "smartfile:tenant:template-city:one");
    assert.equal(calls[0].headers.Authorization, "Bearer files-secret");
    assert.match(calls[0].url, /\/api\/smart-files\/folders$/);
    assert.match(calls[1].url, /\/api\/smart-files\/folders\/f1\/files$/);
    assert.equal(calls.some((c) => /neon|atoms|--apply/i.test(c.url)), false);
  });
});
