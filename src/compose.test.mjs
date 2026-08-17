import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeCityManager, PARCEL_NODE_ID_RE } from "./compose.mjs";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(handler) {
  return async (url, opts = {}) => handler(String(url), opts);
}

const VALID = "48021:34137";
const RETRIEVAL = "https://retrieval.example.invalid";
const FILES = "https://files.example.invalid";

function envWithMounts(extra = {}) {
  return {
    HAUSKA_RETRIEVAL_URL: RETRIEVAL,
    SMART_FILES_BACKEND_URL: FILES,
    SMARTSITE_EMBED_ORIGIN: "https://smartsite.cloud",
    ...extra,
  };
}

describe("city-manager compose", () => {
  it("accepts a five-digit FIPS parcel node id", () => {
    assert.equal(PARCEL_NODE_ID_RE.test(VALID), true);
    assert.equal(PARCEL_NODE_ID_RE.test("parcel-example"), false);
    assert.equal(PARCEL_NODE_ID_RE.test(""), false);
  });

  it("honest-empties when retrieval URL is unset, 404, or empty chain", async () => {
    const unset = await composeCityManager({
      parcelNodeId: VALID,
      env: { SMART_FILES_BACKEND_URL: "" },
      fetchImpl: mockFetch(() => {
        throw new Error("fetch must not run when retrieval URL is unset");
      }),
    });
    assert.equal(unset.atoms.status, "unavailable");
    assert.equal(unset.atoms.basis, "HAUSKA_RETRIEVAL_URL unset");
    assert.equal(unset.atoms.atomCount, 0);
    assert.equal("atoms" in unset.atoms, false);
    assert.equal(unset.smartsite.url.includes("parcelNodeId=48021%3A34137"), true);
    assert.equal(unset.filesRoom.status, "unavailable");
    assert.equal(unset.filesRoom.basis, "SMART_FILES_BACKEND_URL unset");

    const notFound = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts(),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) return jsonResponse(404, { error: "not found" });
        if (url.includes("/api/smart-files/folders")) return jsonResponse(200, { folders: [] });
        throw new Error(`unexpected ${url}`);
      }),
    });
    assert.equal(notFound.atoms.status, "empty");
    assert.match(notFound.atoms.basis, /not found|404/);
    assert.equal(notFound.filesRoom.status, "empty");
    assert.equal(notFound.filesRoom.basis, "no folders for tenant:template-city");

    const emptyChain = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ HAUSKA_RETRIEVAL_API_KEY: "k" }),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) {
          return jsonResponse(200, {
            parcelNodeId: VALID,
            atoms: [],
            secretBodies: [{ entityType: "zoning-fact", body: { shouldNotLeak: true } }],
          });
        }
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(emptyChain.atoms.status, "empty");
    assert.equal(emptyChain.atoms.basis, "atom-chain returned no atoms");
    assert.equal(JSON.stringify(emptyChain).includes("shouldNotLeak"), false);
  });

  it("marks retrieval 401 as unavailable and never invents atoms", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ HAUSKA_RETRIEVAL_API_KEY: "bad" }),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) return jsonResponse(401, { error: "nope" });
        return jsonResponse(401, { error: "nope" });
      }),
    });
    assert.equal(composed.atoms.status, "unavailable");
    assert.equal(composed.atoms.basis, "retrieval auth refused");
    assert.equal(composed.atoms.atomCount, 0);
    assert.deepEqual(composed.atoms.types, []);
    assert.equal(composed.filesRoom.status, "unavailable");
    assert.equal(composed.filesRoom.basis, "files auth refused");
  });

  it("returns counts and types only when the chain is present", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "template-city",
      env: envWithMounts({
        HAUSKA_RETRIEVAL_API_KEY: "k",
        SMART_FILES_API_KEY: "f",
      }),
      fetchImpl: mockFetch((url, opts) => {
        assert.match(String(opts.headers.Authorization || ""), /Bearer /);
        if (url.includes("/atom-chain")) {
          assert.match(url, /property-nodes\/48021%3A34137\/atom-chain$/);
          return jsonResponse(200, {
            parcelNodeId: VALID,
            atoms: [
              { entityType: "zoning-fact", body: { district: "SF-1", huge: "x".repeat(200) } },
              { entityType: "setback-rule", body: { front: 25 } },
            ],
          });
        }
        assert.match(url, /scopeType=tenant/);
        assert.match(url, /scopeId=template-city/);
        return jsonResponse(200, {
          folders: [
            { folderId: "folder:tenant:template-city:room", label: "Room", accessPolicy: "tenant-private" },
          ],
        });
      }),
    });
    assert.equal(composed.lensId, "city-manager");
    assert.equal(composed.atoms.status, "ok");
    assert.equal(composed.atoms.contract, "atom-read-http");
    assert.equal(composed.atoms.atomCount, 2);
    assert.deepEqual(composed.atoms.types, ["zoning-fact", "setback-rule"]);
    assert.equal(JSON.stringify(composed).includes("SF-1"), false);
    assert.equal(composed.filesRoom.status, "ok");
    assert.equal(composed.filesRoom.contract, "service-http");
    assert.equal(composed.filesRoom.folderCount, 1);
    assert.deepEqual(composed.filesRoom.folders, [
      { folderId: "folder:tenant:template-city:room", label: "Room" },
    ]);
    assert.equal(JSON.stringify(composed).includes("tenant-private"), false);
  });

  it("leaves SmartSite url empty when parcelNodeId is missing or invalid", async () => {
    const missing = await composeCityManager({
      env: envWithMounts(),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) throw new Error("must not call retrieval");
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(missing.smartsite.url, "");
    assert.equal(missing.smartsite.basis, "missing parcelNodeId");
    assert.equal(missing.atoms.status, "empty");
    assert.equal(missing.atoms.basis, "missing parcelNodeId");

    const invalid = await composeCityManager({
      parcelNodeId: "not-a-node",
      env: envWithMounts(),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) throw new Error("must not call retrieval");
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(invalid.smartsite.url, "");
    assert.equal(invalid.atoms.status, "empty");
    assert.equal(invalid.atoms.basis, "invalid parcelNodeId");
  });
});
