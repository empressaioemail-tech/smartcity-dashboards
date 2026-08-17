import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { server, cityPackAuthorized } from "./server.mjs";

let port;
const saved = {};

function stash(keys) {
  for (const k of keys) saved[k] = process.env[k];
}

function restore(keys) {
  for (const k of keys) {
    if (saved[k] == null) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

describe("HTTP surface", () => {
  before(
    () =>
      new Promise((resolve) => {
        stash([
          "DASHBOARDS_API_KEY",
          "DATABASE_URL",
          "HAUSKA_RETRIEVAL_URL",
          "SMART_FILES_BACKEND_URL",
          "HAUSKA_RETRIEVAL_API_KEY",
          "SMART_FILES_API_KEY",
        ]);
        delete process.env.DASHBOARDS_API_KEY;
        delete process.env.DATABASE_URL;
        server.listen(0, "127.0.0.1", () => {
          port = server.address().port;
          resolve();
        });
      }),
  );

  after(
    () =>
      new Promise((resolve, reject) => {
        restore([
          "DASHBOARDS_API_KEY",
          "DATABASE_URL",
          "HAUSKA_RETRIEVAL_URL",
          "SMART_FILES_BACKEND_URL",
          "HAUSKA_RETRIEVAL_API_KEY",
          "SMART_FILES_API_KEY",
        ]);
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  it("serves health, four lenses, template city pack, and G-13 mounts", async () => {
    delete process.env.DASHBOARDS_API_KEY;
    const base = `http://127.0.0.1:${port}`;
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.product, "smartcity-dashboards");
    assert.equal(health.db, "unset");
    assert.equal(health.packsStore, "memory");

    const lenses = await (await fetch(`${base}/api/lenses`)).json();
    assert.equal(lenses.lenses.length, 4);
    assert.equal(lenses.lenses[3].id, "citizen");

    const packs = await (await fetch(`${base}/api/city-packs`)).json();
    assert.equal(packs.cityPacks[0].cityKey, "template-city");
    assert.equal(packs.cityPacks[0].grantedAdapterCount, 0);

    const kinds = await (await fetch(`${base}/api/adapter-kinds`)).json();
    assert.deepEqual(
      kinds.kinds.map((k) => k.id),
      ["mygov", "samsara", "opengov", "esri", "municode", "firstdue", "verkada"],
    );
    const samsara = kinds.kinds.find((k) => k.id === "samsara");
    assert.equal(samsara.writesTo, "files");
    assert.equal(samsara.defaultAccessPolicy, "tenant-private");

    const mounts = await (await fetch(`${base}/api/mounts`)).json();
    assert.equal(mounts.mounts.smartsite.contract, "embed");
    assert.equal(mounts.mcp.serving, true);
    assert.ok(mounts.smartsiteExample.includes("parcelNodeId="));
  });

  it("keeps city-packs open when DASHBOARDS_API_KEY is unset", async () => {
    delete process.env.DASHBOARDS_API_KEY;
    assert.equal(cityPackAuthorized({ headers: {} }), true);
    const base = `http://127.0.0.1:${port}`;
    const list = await fetch(`${base}/api/city-packs`);
    assert.equal(list.status, 200);
    const one = await fetch(`${base}/api/city-packs/template-city`);
    assert.equal(one.status, 200);
  });

  it("requires Bearer on city-packs when DASHBOARDS_API_KEY is set, and leaves health and lenses public", async () => {
    process.env.DASHBOARDS_API_KEY = "scaffold-test-key";
    try {
      assert.equal(cityPackAuthorized({ headers: {} }), false);
      assert.equal(
        cityPackAuthorized({ headers: { authorization: "Bearer scaffold-test-key" } }),
        true,
      );
      const base = `http://127.0.0.1:${port}`;
      const deniedList = await fetch(`${base}/api/city-packs`);
      assert.equal(deniedList.status, 401);
      const deniedOne = await fetch(`${base}/api/city-packs/template-city`);
      assert.equal(deniedOne.status, 401);
      const wrong = await fetch(`${base}/api/city-packs`, {
        headers: { authorization: "Bearer nope" },
      });
      assert.equal(wrong.status, 401);
      const okList = await fetch(`${base}/api/city-packs`, {
        headers: { authorization: "Bearer scaffold-test-key" },
      });
      assert.equal(okList.status, 200);
      const okOne = await fetch(`${base}/api/city-packs/template-city`, {
        headers: { authorization: "Bearer scaffold-test-key" },
      });
      assert.equal(okOne.status, 200);
      const health = await fetch(`${base}/health`);
      assert.equal(health.status, 200);
      const lenses = await fetch(`${base}/api/lenses`);
      assert.equal(lenses.status, 200);
      const kinds = await fetch(`${base}/api/adapter-kinds`);
      assert.equal(kinds.status, 200);
    } finally {
      delete process.env.DASHBOARDS_API_KEY;
    }
  });

  it("registers city-manager compose before the generic lens handler and honest-empties without retrieval", async () => {
    delete process.env.HAUSKA_RETRIEVAL_URL;
    delete process.env.SMART_FILES_BACKEND_URL;
    const base = `http://127.0.0.1:${port}`;
    const lens = await fetch(`${base}/api/lenses/city-manager`);
    assert.equal(lens.status, 200);
    const composedRes = await fetch(
      `${base}/api/lenses/city-manager/compose?parcelNodeId=48021:34137&cityKey=template-city`,
    );
    assert.equal(composedRes.status, 200);
    const composed = await composedRes.json();
    assert.equal(composed.lensId, "city-manager");
    assert.equal(composed.cityKey, "template-city");
    assert.equal(composed.parcelNodeId, "48021:34137");
    assert.equal(composed.smartsite.contract, "embed");
    assert.match(composed.smartsite.url, /parcelNodeId=48021%3A34137/);
    assert.equal(composed.atoms.contract, "atom-read-http");
    assert.equal(composed.atoms.status, "unavailable");
    assert.equal(composed.atoms.basis, "HAUSKA_RETRIEVAL_URL unset");
    assert.equal(composed.filesRoom.contract, "service-http");
    assert.equal(composed.filesRoom.status, "unavailable");
    assert.equal(composed.filesRoom.basis, "SMART_FILES_BACKEND_URL unset");
    assert.deepEqual(Object.keys(composed).sort(), [
      "atoms",
      "cityKey",
      "filesRoom",
      "lensId",
      "parcelNodeId",
      "smartsite",
    ]);
    assert.equal("mygov" in composed, false);
    assert.equal("samsara" in composed, false);
    assert.equal("permits" in composed, false);
    assert.equal("fleet" in composed, false);
  });
});
