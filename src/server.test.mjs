import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { server, cityPackAuthorized } from "./server.mjs";

let port;

describe("HTTP surface", () => {
  before(
    () =>
      new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          port = server.address().port;
          resolve();
        });
      }),
  );

  after(
    () =>
      new Promise((resolve, reject) => {
        delete process.env.DASHBOARDS_API_KEY;
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  it("serves health, four lenses, template city pack, and G-13 mounts", async () => {
    delete process.env.DASHBOARDS_API_KEY;
    const base = `http://127.0.0.1:${port}`;
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.product, "smartcity-dashboards");

    const lenses = await (await fetch(`${base}/api/lenses`)).json();
    assert.equal(lenses.lenses.length, 4);
    assert.equal(lenses.lenses[3].id, "citizen");

    const packs = await (await fetch(`${base}/api/city-packs`)).json();
    assert.equal(packs.cityPacks[0].cityKey, "template-city");

    const mounts = await (await fetch(`${base}/api/mounts`)).json();
    assert.equal(mounts.mounts.smartsite.contract, "embed");
    assert.equal(mounts.mcp.serving, false);
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
    } finally {
      delete process.env.DASHBOARDS_API_KEY;
    }
  });
});
