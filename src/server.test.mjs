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
          "HAUSKA_TENANT_KEYS",
          "HAUSKA_MCP_URL",
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
          "HAUSKA_TENANT_KEYS",
          "HAUSKA_MCP_URL",
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
    // Two public-free packs are now visible anonymously: the fixture pack and
    // the honest-empty pack. fixture-city stays tenant-private and invisible.
    assert.equal(packs.cityPacks.length, 2);
    assert.deepEqual(
      packs.cityPacks.map((p) => p.cityKey).sort(),
      ["empty-city", "template-city"],
    );
    for (const pack of packs.cityPacks) {
      assert.equal(pack.grantedAdapterCount, 0, pack.cityKey);
    }
    const template = await (await fetch(`${base}/api/city-packs/template-city`)).json();
    assert.deepEqual(template.cityPack.grantedAdapters, []);
    const fixtureAnon = await fetch(`${base}/api/city-packs/fixture-city`);
    assert.equal(fixtureAnon.status, 401);

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
    assert.equal(mounts.mounts.planReview.contract, "embed");
    assert.equal(mounts.mcp.serving, true);
    assert.ok(mounts.smartsiteExample.includes("parcelNodeId="));
    assert.match(mounts.planReviewExample, /plan-review-app-ten\.vercel\.app/);
    assert.match(mounts.smartFilesExample, /smart-files-app\.vercel\.app/);
    assert.match(mounts.smartFilesExample, /embed=1/);
    assert.equal(mounts.mounts.smartFilesEmbed.contract, "embed");
  });

  it("serves the staff-map module and auto-composes gold parcel on GET /", async () => {
    const base = `http://127.0.0.1:${port}`;
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /type="module"/);
    assert.match(html, /src="\/app.js"/);
    const staff = await (await fetch(`${base}/staff-map.mjs`)).text();
    assert.match(staff, /48021:34137/);
    assert.equal(staff.includes("leaflet"), false);
    const app = await (await fetch(`${base}/app.js`)).text();
    assert.match(app, /resolveStaffMapQuery/);
    assert.match(app, /composeGoldMap\(staffMap\.parcelNodeId/);
    assert.equal(app.includes("leaflet"), false);
    assert.equal(html.includes("compose-form"), false);
    assert.equal(html.includes("parcel-node-id"), false);
  });

  it("serves /sc-kit.css as text/css", async () => {
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(`${base}/sc-kit.css`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/css/);
    const css = await res.text();
    assert.match(css, /--sc-atom:/);
    const shell = await fetch(`${base}/shell.css`);
    assert.equal(shell.status, 200);
    assert.match(shell.headers.get("content-type") || "", /text\/css/);
  });

  it("serves Work Files as /?work=files and mounts smart-files-app", async () => {
    const base = `http://127.0.0.1:${port}`;
    const html = await (await fetch(`${base}/?work=files`)).text();
    assert.match(html, /href="\/\?work=files"/);
    assert.match(html, /id="work-files"/);
    assert.match(html, /id="files-site"/);
    assert.equal(html.includes("compose-form"), false);
    assert.equal(html.includes("$0"), false);
    const review = await (await fetch(`${base}/?lens=development-services&tab=review`)).text();
    assert.match(review, /id="review-site"/);
    assert.match(review, /id="map-site"/);
    assert.match(review, /id="anchor-overview-map"/);
    const app = await (await fetch(`${base}/app.js`)).text();
    assert.match(app, /smartFiles/);
    assert.match(app, /files-stage|MountStage/);
    const staff = await (await fetch(`${base}/staff-review.mjs`)).text();
    assert.match(staff, /smart-files-app\.vercel\.app/);
    assert.match(staff, /work=files|FILES_WORK/);
  });

  it("serves City Assets and Connections homes without a new grant", async () => {
    const base = `http://127.0.0.1:${port}`;
    const assets = await (await fetch(`${base}/?work=assets`)).text();
    assert.match(assets, /id="work-assets"/);
    assert.match(assets, /No city-owned asset records for template-city/);
    assert.equal(assets.includes("$0"), false);
    const connections = await (await fetch(`${base}/?work=connections`)).text();
    assert.match(connections, /id="work-connections"/);
    assert.match(connections, /67 of 67/);
    assert.equal((connections.match(/data-home-row="/g) || []).length, 70);
    const files = await (await fetch(`${base}/?work=files`)).text();
    assert.match(files, /id="work-files"/);
    const packs = await (await fetch(`${base}/api/city-packs`)).json();
    assert.equal(packs.cityPacks[0].grantedAdapterCount, 0);
  });

  it("serves the staff-review module and switches development-services to plan-review-app", async () => {
    const base = `http://127.0.0.1:${port}`;
    const review = await (await fetch(`${base}/staff-review.mjs`)).text();
    assert.match(review, /plan-review-app-ten\.vercel\.app/);
    assert.equal(review.toLowerCase().includes("permitflow"), false);
    const app = await (await fetch(`${base}/app.js`)).text();
    assert.match(app, /resolveStaffLensQuery/);
    assert.match(app, /applyLens/);
    assert.match(app, /planReview/);
    assert.equal(app.toLowerCase().includes("permitflow"), false);
    const compass = await fetch(`${base}/compass`);
    assert.equal(compass.status, 404);
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

  /**
   * Production divergence guard. Every local run leaves DASHBOARDS_API_KEY
   * unset, so the pack gate is open locally and shut on the deployed service.
   * The fixture pipeline shipped passing every test and then read as
   * honest-empty in production, because a public-free pack's records were
   * refused to the anonymous visitor the demo exists for. This test asserts the
   * production condition, with the key SET, and it is the one that fires.
   */
  it("serves a public-free pack's records to an anonymous caller even with DASHBOARDS_API_KEY set", async () => {
    process.env.DASHBOARDS_API_KEY = "scaffold-test-key";
    try {
      const base = `http://127.0.0.1:${port}`;
      const anon = await fetch(`${base}/api/lenses/development-services/pipeline?cityKey=template-city`);
      assert.equal(anon.status, 200);
      const body = await anon.json();
      assert.equal(body.status, "ok");
      assert.ok(body.records.length > 0, "public-free demo must carry its records anonymously");
      assert.ok(body.records.every((r) => r.fixture === true && r.origin === "fixture"));

      const empty = await fetch(`${base}/api/lenses/development-services/pipeline?cityKey=empty-city`);
      assert.equal(empty.status, 200);
      assert.equal((await empty.json()).records.length, 0);

      // Enumeration stays shut, and tenant-private stays shut. Only content
      // reads of a public-free pack open up.
      const list = await fetch(`${base}/api/city-packs`);
      assert.equal(list.status, 401);
      const tenantPrivate = await fetch(`${base}/api/lenses/development-services/pipeline?cityKey=fixture-city`);
      assert.equal(tenantPrivate.status, 401);
    } finally {
      delete process.env.DASHBOARDS_API_KEY;
    }
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
      const templatePack = await okOne.json();
      assert.deepEqual(templatePack.cityPack.grantedAdapters, []);
      const fixtureRun = await fetch(`${base}/api/adapters/municode/calendar/run?cityKey=fixture-city`, {
        method: "POST",
        headers: { authorization: "Bearer scaffold-test-key" },
      });
      assert.equal(fixtureRun.status, 403);
      const listed = await okList.json();
      assert.equal(listed.cityPacks.some((p) => p.cityKey === "fixture-city"), false);
      const serviceFixture = await fetch(`${base}/api/city-packs/fixture-city`, {
        headers: { authorization: "Bearer scaffold-test-key" },
      });
      assert.equal(serviceFixture.status, 403);
      process.env.HAUSKA_TENANT_KEYS = JSON.stringify({ "hauska-fixture": "fixture-city" });
      const identified = await fetch(`${base}/api/city-packs/fixture-city`, {
        headers: { "x-hauska-key": "hauska-fixture" },
      });
      assert.equal(identified.status, 200);
      const identifiedBody = await identified.json();
      assert.equal(identifiedBody.cityPack.cityKey, "fixture-city");
      assert.deepEqual(identifiedBody.cityPack.grantedAdapters, []);
      assert.equal(identifiedBody.cityPack.accessPolicy, "tenant-private");
      const wrongTenant = await fetch(`${base}/api/city-packs/fixture-city`, {
        headers: { "x-hauska-key": "nope" },
      });
      assert.equal(wrongTenant.status, 401);
      process.env.HAUSKA_TENANT_KEYS = JSON.stringify({ "hauska-other": "other-city" });
      const cross = await fetch(`${base}/api/city-packs/fixture-city`, {
        headers: { "x-hauska-key": "hauska-other" },
      });
      assert.equal(cross.status, 403);
      const health = await fetch(`${base}/health`);
      assert.equal(health.status, 200);
      const lenses = await fetch(`${base}/api/lenses`);
      assert.equal(lenses.status, 200);
      const kinds = await fetch(`${base}/api/adapter-kinds`);
      assert.equal(kinds.status, 200);
    } finally {
      delete process.env.DASHBOARDS_API_KEY;
      delete process.env.HAUSKA_TENANT_KEYS;
    }
  });

  it("serves the Development services pipeline from the pack's records dimension", async () => {
    delete process.env.DASHBOARDS_API_KEY;
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(
      `${base}/api/lenses/development-services/pipeline?cityKey=template-city`,
    );
    assert.equal(res.status, 200);
    const pipeline = await res.json();
    assert.equal(pipeline.lensId, "development-services");
    assert.equal(pipeline.cityKey, "template-city");
    assert.equal(pipeline.generated, true);
    assert.equal(pipeline.environment, "demo");
    assert.equal(pipeline.kind, "mygov");
    assert.equal(pipeline.recordType, "permit-case");
    assert.equal(pipeline.records.length, 14);
    assert.equal(pipeline.recordCount, 14);
    // Labelling gate item 2 survives the wire: a record that leaves the surface
    // still says it is a fixture.
    for (const record of pipeline.records) {
      assert.equal(record.origin, "fixture", record.recordId);
      assert.equal(record.fixture, true, record.recordId);
      assert.match(record.fixtureBasis, /\S/);
    }
    const tiles = pipeline.metrics.reduce((sum, m) => sum + m.count, 0);
    assert.equal(tiles, pipeline.records.length);
    assert.deepEqual(
      pipeline.metrics.map((m) => `${m.id}=${m.count}`),
      ["overdue=3", "in-review=5", "awaiting-applicant=4", "ready-to-issue=2"],
    );
    const body = JSON.stringify(pipeline);
    assert.equal(body.includes("$"), false);
    assert.equal(/bastrop/i.test(body), false);
    assert.equal(/\b\d{5}:[A-Za-z0-9._-]+\b/.test(body), false);
  });

  it("keeps empty-city honest-empty and gates fixture-city and an unknown pack", async () => {
    delete process.env.DASHBOARDS_API_KEY;
    const base = `http://127.0.0.1:${port}`;
    const emptyRes = await fetch(
      `${base}/api/lenses/development-services/pipeline?cityKey=empty-city`,
    );
    assert.equal(emptyRes.status, 200);
    const empty = await emptyRes.json();
    assert.equal(empty.generated, false);
    assert.equal(empty.status, "empty");
    assert.deepEqual(empty.records, []);
    assert.match(empty.basis, /empty-city generates no records/);
    for (const metric of empty.metrics) assert.equal(metric.count, 0);

    const tenant = await fetch(
      `${base}/api/lenses/development-services/pipeline?cityKey=fixture-city`,
    );
    assert.equal(tenant.status, 401);
    const unknown = await fetch(
      `${base}/api/lenses/development-services/pipeline?cityKey=no-such-city`,
    );
    assert.equal(unknown.status, 404);
    // The pipeline route sits above the generic lens handler and does not eat it.
    const lens = await fetch(`${base}/api/lenses/development-services`);
    assert.equal(lens.status, 200);
    const lensBody = await lens.json();
    assert.equal(lensBody.lens.id, "development-services");
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
    assert.equal(composed.meetings.contract, "files-record-read");
    assert.equal(composed.meetings.status, "empty");
    assert.equal(composed.meetings.honesty, "partial");
    assert.match(composed.meetings.basis, /no municode calendar grant/);
    assert.deepEqual(composed.meetings.records, []);
    assert.equal(composed.planReview.contract, "embed");
    assert.equal(composed.planReview.url, "https://plan-review-app-ten.vercel.app/?embed=1");
    assert.equal(composed.smartFiles.contract, "embed");
    assert.equal(composed.smartFiles.url, "https://smart-files-app.vercel.app/?embed=1");
    assert.deepEqual(Object.keys(composed).sort(), [
      "atoms",
      "cityKey",
      "filesRoom",
      "lensId",
      "meetings",
      "parcelNodeId",
      "planReview",
      "smartFiles",
      "smartsite",
    ]);
    assert.equal("mygov" in composed, false);
    assert.equal("samsara" in composed, false);
    assert.equal("permits" in composed, false);
    assert.equal("fleet" in composed, false);
  });
});
