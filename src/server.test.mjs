import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { server, cityPackAuthorized, sendFile, etagFor } from "./server.mjs";
import { ADAPTER_KINDS } from "./adapters.mjs";
import { DOMAIN_REGISTRY } from "./domains.mjs";
import { ALL_HOME_ROWS, SHELL_HOMES, homeRowsLabel, sourceRowCount } from "./shell-homes.mjs";

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
    // RE-SCOPED AT G-91, 7 to 10. The list stays explicit here and in
    // src/adapters.test.mjs, and a divergence between the route and the catalog
    // is the finding: the route must serve the catalog, not a copy of it.
    assert.deepEqual(
      kinds.kinds.map((k) => k.id),
      ADAPTER_KINDS.map((k) => k.id),
    );
    assert.deepEqual(
      kinds.kinds.map((k) => k.id),
      [
        "mygov",
        "samsara",
        "opengov",
        "esri",
        "municode",
        "firstdue",
        "verkada",
        "spireon",
        "goto",
        "powerbi",
      ],
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

    // G-88 item 8: the revalidation contract, on the asset this case already owns.
    // Leg 1, a plain GET advertises no-cache plus a strong validator.
    assert.equal(res.headers.get("cache-control"), "no-cache");
    const etag = res.headers.get("etag");
    assert.ok(etag, "sc-kit.css must carry an etag");
    assert.match(etag, /^"[^"]+"$/, "strong validator, quoted and unprefixed");

    // Leg 2, a returning browser revalidates cheaply.
    const fresh = await fetch(`${base}/sc-kit.css`, { headers: { "If-None-Match": etag } });
    assert.equal(fresh.status, 304);
    assert.equal(await fresh.text(), "");
    assert.equal(fresh.headers.get("cache-control"), "no-cache");
    assert.equal(fresh.headers.get("etag"), etag);

    // Leg 3, the leg that can fail. A stale validator must not 304.
    const stale = await fetch(`${base}/sc-kit.css`, {
      headers: { "If-None-Match": '"stale-from-a-previous-deploy"' },
    });
    assert.equal(stale.status, 200);
    assert.equal((await stale.text()).length, css.length);
    assert.notEqual(stale.headers.get("etag"), '"stale-from-a-previous-deploy"');
    assert.equal(stale.headers.get("etag"), etag);
  });

  it("gives all six static assets the same revalidation contract", async () => {
    const base = `http://127.0.0.1:${port}`;
    // Derived from the sendFile call sites in server.mjs. "/" and "/index.html"
    // are one asset served on two routes, which is why seven routes cover six files.
    const routes = [
      "/",
      "/index.html",
      "/app.js",
      "/sc-kit.css",
      "/shell.css",
      "/staff-map.mjs",
      "/staff-review.mjs",
    ];
    const etags = {};
    for (const route of routes) {
      const res = await fetch(`${base}${route}`);
      assert.equal(res.status, 200, `${route} must serve`);
      assert.equal(res.headers.get("cache-control"), "no-cache", `${route} cache-control`);
      const etag = res.headers.get("etag");
      assert.ok(etag, `${route} must carry an etag`);
      assert.match(etag, /^"[^"]+"$/, `${route} strong validator`);
      const body = await res.text();
      assert.ok(body.length > 0, `${route} must have a body on a plain GET`);
      etags[route] = etag;

      const revalidated = await fetch(`${base}${route}`, { headers: { "If-None-Match": etag } });
      assert.equal(revalidated.status, 304, `${route} must 304 on its own etag`);
      assert.equal(await revalidated.text(), "", `${route} 304 carries no body`);
      assert.equal(revalidated.headers.get("etag"), etag, `${route} 304 echoes the validator`);

      const staleHit = await fetch(`${base}${route}`, {
        headers: { "If-None-Match": '"stale-from-a-previous-deploy"' },
      });
      assert.equal(staleHit.status, 200, `${route} must not 304 a stale validator`);
      assert.equal((await staleHit.text()).length, body.length, `${route} stale hit is a full body`);
      assert.notEqual(staleHit.headers.get("etag"), '"stale-from-a-previous-deploy"');
    }

    // Six different files must produce six different validators. A constant or
    // hardcoded etag dies here, and it would survive the three legs above.
    const distinct = new Set([
      etags["/index.html"],
      etags["/app.js"],
      etags["/sc-kit.css"],
      etags["/shell.css"],
      etags["/staff-map.mjs"],
      etags["/staff-review.mjs"],
    ]);
    assert.equal(distinct.size, 6, "six assets, six validators");

    // One file on two routes must produce ONE validator. A path-derived etag dies
    // here: it would look content-derived to the assertion above and is not.
    assert.equal(etags["/"], etags["/index.html"]);
  });

  it("honours the RFC forms of If-None-Match on a static asset", async () => {
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(`${base}/shell.css`);
    const etag = res.headers.get("etag");
    await res.text();

    const star = await fetch(`${base}/shell.css`, { headers: { "If-None-Match": "*" } });
    assert.equal(star.status, 304, "* matches any existing representation");

    const weak = await fetch(`${base}/shell.css`, { headers: { "If-None-Match": `W/${etag}` } });
    assert.equal(weak.status, 304, "If-None-Match uses weak comparison");

    const list = await fetch(`${base}/shell.css`, {
      headers: { "If-None-Match": `"other-one", ${etag}, "other-two"` },
    });
    assert.equal(list.status, 304, "the field is a comma list");

    const miss = await fetch(`${base}/shell.css`, {
      headers: { "If-None-Match": '"other-one", "other-two"' },
    });
    assert.equal(miss.status, 200, "a list that matches nothing is a full GET");
  });

  it("serves Work Files as /?work=files and mounts smart-files-app", async () => {
    const base = `http://127.0.0.1:${port}`;
    const html = await (await fetch(`${base}/?work=files`)).text();
    assert.match(html, /href="\/\?work=files"/);
    assert.match(html, /id="work-files"/);
    assert.match(html, /id="files-site"/);
    assert.equal(html.includes("compose-form"), false);
    assert.equal(html.includes("$0"), false);
    /**
     * G-97: Review left Development services and Work / Plan review is the only
     * door to the console now, so this probe follows it. The stage layer is
     * document-level, which is why the map and overview markers still read from
     * the same response.
     */
    const review = await (await fetch(`${base}/?work=review`)).text();
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
    assert.match(assets, /No city-owned asset records for <span data-pack-key>/);
    assert.equal(assets.includes("$0"), false);
    const connections = await (await fetch(`${base}/?work=connections`)).text();
    assert.match(connections, /id="work-connections"/);
    /**
     * G-93. Two figures on the SERVED document, both measured, neither derived
     * from the other by subtraction: the register renders 70 Homes-table rows
     * and 5 addenda for 67 source rows and 3 inventory jobs, because two source
     * rows bundled jobs whose dispositions differ and were split one row per
     * job. Asserted against the computed values so this gate moves with the rule
     * rather than pinning a literal that a later split would falsify.
     */
    assert.match(connections, new RegExp(`<b id="connections-rows">${homeRowsLabel()}</b>`));
    assert.match(connections, new RegExp(`from ${sourceRowCount(SHELL_HOMES)} Homes-table rows`));
    assert.equal((connections.match(/data-home-row="/g) || []).length, ALL_HOME_ROWS.length);
    assert.equal(ALL_HOME_ROWS.length, 75);
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

  /**
   * G-80, same production condition as the guard above and for the same reason.
   * The chrome's identity read is a CONTENT read of a public-free pack, so it
   * must answer the anonymous visitor on the deployed service, where the key is
   * set, not only on a local run where it is unset and the gate falls open. If
   * this went through the enumeration gate the top bar would resolve locally and
   * hold its fallback in production, which is the shape of the last two
   * divergences wearing different clothes.
   */
  it("resolves pack identity for an anonymous caller with DASHBOARDS_API_KEY set", async () => {
    process.env.DASHBOARDS_API_KEY = "scaffold-test-key";
    try {
      const base = `http://127.0.0.1:${port}`;
      const template = await fetch(`${base}/api/city-identity?cityKey=template-city`);
      assert.equal(template.status, 200);
      const t = (await template.json()).identity;
      assert.equal(t.cityKey, "template-city");
      assert.equal(t.displayName, "Template city");
      assert.equal(t.seal, "TC");
      assert.equal(t.environmentBadge, "Demo");
      assert.equal(t.stateCode, null);
      /**
       * RE-SCOPED AT G-91, derived rather than pinned. This read "0 of 7 sources
       * granted" as a literal; the catalog is 10 now and will grow again, and a
       * literal here re-breaks on every growth while asserting nothing about the
       * rule. Deriving it from the catalog holds the ratio to its counting rule
       * instead of to a number.
       *
       * The NUMERATOR is the load-bearing half and it stays zero: no pack grants
       * a live adapter, and template-city's fixtureGrants are a demonstration
       * axis that deliberately does not count here. A demonstrated shape is not
       * a connected source, and adding it to this figure would put a false
       * sources-granted number beside a city name.
       */
      assert.equal(t.sources.label, `0 of ${ADAPTER_KINDS.length} sources granted`);
      assert.equal(t.sources.granted, 0);
      assert.equal(ADAPTER_KINDS.length, 10);
      assert.match(t.sources.rule, /distinct adapter kinds granted on this pack/);
      assert.equal(t.documentTitle, "Template city · SmartCity Dashboards");

      const empty = await fetch(`${base}/api/city-identity?cityKey=empty-city`);
      assert.equal(empty.status, 200);
      const e = (await empty.json()).identity;
      assert.equal(e.displayName, "Empty city");
      assert.equal(e.seal, "EC");
      // The whole point of the card: a pack switch is a whole switch.
      assert.notEqual(e.displayName, t.displayName);
      assert.notEqual(e.seal, t.seal);
      assert.notEqual(e.documentTitle, t.documentTitle);

      // Tenant-private still refuses, enumeration still shut, unknown is 404.
      const tenantPrivate = await fetch(`${base}/api/city-identity?cityKey=fixture-city`);
      assert.equal(tenantPrivate.status, 401);
      const unknown = await fetch(`${base}/api/city-identity?cityKey=no-such-city`);
      assert.equal(unknown.status, 404);
      const list = await fetch(`${base}/api/city-packs`);
      assert.equal(list.status, 401);

      // A tenant subject reads its own tenant-private pack's identity.
      process.env.HAUSKA_TENANT_KEYS = JSON.stringify({ "hauska-fixture": "fixture-city" });
      const asTenant = await fetch(`${base}/api/city-identity?cityKey=fixture-city`, {
        headers: { "x-hauska-key": "hauska-fixture" },
      });
      assert.equal(asTenant.status, 200);
      assert.equal((await asTenant.json()).identity.displayName, "Fixture city");
      const wrongTenant = await fetch(`${base}/api/city-identity?cityKey=fixture-city`, {
        headers: { "x-hauska-key": "not-a-key" },
      });
      assert.equal(wrongTenant.status, 401);
    } finally {
      delete process.env.DASHBOARDS_API_KEY;
      delete process.env.HAUSKA_TENANT_KEYS;
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

  it("serves the domain map and every registered domain, with ungranted distinct from empty", async () => {
    const base = `http://127.0.0.1:${port}`;

    const map = await (await fetch(`${base}/api/city-domains?cityKey=template-city`)).json();
    assert.equal(map.regionCount, DOMAIN_REGISTRY.length);
    assert.match(map.countingRule, /registered domains carry records on template-city/);
    const byId = Object.fromEntries(map.regions.map((r) => [r.domainId, r]));

    // Ruling 1 over HTTP: three regions have a source, one is built and has none,
    // and the fourth state is what empty-city returns below. Four states, four
    // sentences, none of them "not built".
    assert.equal(byId["permits-pipeline"].status, "ok");
    assert.equal(byId["work-orders"].status, "ok");
    assert.equal(byId["fleet-vehicles"].status, "ok");
    assert.equal(byId["patrol-vehicles"].status, "ungranted");
    assert.match(byId["patrol-vehicles"].basis, /Spireon is not granted on template-city/);
    assert.match(byId["patrol-vehicles"].basis, /region is built and has no source/);
    assert.equal(/not built/i.test(byId["patrol-vehicles"].basis), false);

    const wo = await (await fetch(`${base}/api/domains/work-orders?cityKey=template-city`)).json();
    assert.equal(wo.status, "ok");
    assert.ok(wo.recordCount > 0);
    assert.equal(wo.extras.sla.targetHours, 72);
    assert.equal(wo.extras.dailyQueue.length, 5);

    const emptyMap = await (await fetch(`${base}/api/city-domains?cityKey=empty-city`)).json();
    for (const region of emptyMap.regions) {
      assert.equal(region.status, "no-fixture-source", region.domainId);
      assert.equal(region.recordCount, 0, region.domainId);
      assert.match(region.basis, /empty-city generates no records/);
    }

    // A domain id that is not registered is the ONE surviving "not built".
    const missing = await fetch(`${base}/api/domains/parks-facilities?cityKey=template-city`);
    assert.equal(missing.status, 404);
    const missingBody = await missing.json();
    assert.match(missingBody.basis, /not a registered domain, so this surface is not built/);

    // tenant-private stays gated on the new routes exactly as on the old ones.
    const priv = await fetch(`${base}/api/city-domains?cityKey=fixture-city`);
    assert.equal(priv.status, 401);
    const unknown = await fetch(`${base}/api/city-domains?cityKey=no-such-city`);
    assert.equal(unknown.status, 404);
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
    assert.equal(
      composed.planReview.url,
      "https://plan-review-app-ten.vercel.app/?embed=1&cityKey=template-city",
    );
    assert.equal(composed.smartFiles.contract, "embed");
    assert.equal(
      composed.smartFiles.url,
      "https://smart-files-app.vercel.app/?embed=1&cityKey=template-city",
    );
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

  /**
   * G-102. THE COMPOSE ROUTE IS GATED, AND IT WAS NOT.
   *
   * It resolved a caller and then applied no read status, unlike the pipeline
   * route registered directly beneath it which has carried the full 404/401/403
   * check since G-79. So a tenant-private pack answered an anonymous visitor
   * with 200 and its files-room scope, and an unknown pack answered 200 by
   * composing a default. Asserted under the PRODUCTION condition, with
   * DASHBOARDS_API_KEY set, for the reason the pipeline guard above states: every
   * local run leaves the key unset and the divergence is what ships.
   */
  it("gates city-manager compose exactly as the pipeline route beside it", async () => {
    process.env.DASHBOARDS_API_KEY = "scaffold-test-key";
    process.env.HAUSKA_TENANT_KEYS = JSON.stringify({ "hauska-fixture": "fixture-city" });
    try {
      const base = `http://127.0.0.1:${port}`;
      const compose = (query, headers = {}) =>
        fetch(`${base}/api/lenses/city-manager/compose?${query}`, { headers });

      // A tenant-private pack refuses the anonymous visitor, where it used to
      // compose. The pipeline route beside it is asserted on the same pack in the
      // same breath, so the two answers are compared rather than assumed equal.
      const anonPrivate = await compose("cityKey=fixture-city");
      assert.equal(anonPrivate.status, 401);
      const pipelinePrivate = await fetch(
        `${base}/api/lenses/development-services/pipeline?cityKey=fixture-city`,
      );
      assert.equal(anonPrivate.status, pipelinePrivate.status);
      assert.deepEqual(await anonPrivate.json(), { error: "unauthorized" });

      // A key that resolves to no tenant is not a caller, and a key that resolves
      // to the WRONG tenant does not open somebody else's pack.
      const badKey = await compose("cityKey=fixture-city", { "x-hauska-key": "not-a-key" });
      assert.equal(badKey.status, 401);

      // The pack's own subject reads it.
      const subject = await compose("cityKey=fixture-city", { "x-hauska-key": "hauska-fixture" });
      assert.equal(subject.status, 200);
      assert.equal((await subject.json()).cityKey, "fixture-city");

      // An unknown pack is a 404 that says so, not a 200 composed off a default.
      const unknown = await compose("cityKey=no-such-city");
      assert.equal(unknown.status, 404);
      assert.deepEqual(await unknown.json(), { error: "unknown city pack" });

      /**
       * AND THE GATE IS NOT SHUT ON EVERYTHING, which is the failure mode a
       * copy of the pipeline check could quietly introduce. A public-free pack
       * still composes for an anonymous visitor with the key set, and so does
       * the no-cityKey default, which is what the browser sends.
       */
      const anonPublic = await compose("cityKey=template-city");
      assert.equal(anonPublic.status, 200);
      assert.equal((await anonPublic.json()).cityKey, "template-city");
      const defaulted = await compose("parcelNodeId=48021:34137");
      assert.equal(defaulted.status, 200);
      assert.equal((await defaulted.json()).cityKey, "template-city");
    } finally {
      delete process.env.DASHBOARDS_API_KEY;
      delete process.env.HAUSKA_TENANT_KEYS;
    }
  });
});


// The one property the three HTTP legs cannot prove between them: that the
// validator is recomputed from the CONTENT on every request. A tag computed once
// at startup passes every assertion above and then serves a 304 forever against
// changed bytes, which is permanent staleness, strictly worse than the defect this
// fixes. Proved here by changing bytes mid-process. A temp file is used
// deliberately: node --test runs each test file in its own process concurrently,
// and ui.test.mjs and type-conformance.test.mjs read web/ off disk, so mutating a
// shipped asset to prove this would race them.
describe("static asset validators are derived from content, not from startup", () => {
  const tmp = path.join(os.tmpdir(), `g88-etag-${process.pid}-${Date.now()}.txt`);

  after(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  function drive(headers = {}) {
    return new Promise((resolve) => {
      const captured = { status: 0, headers: {}, body: Buffer.alloc(0) };
      const res = {
        writeHead(status, hdrs) {
          captured.status = status;
          captured.headers = hdrs || {};
          return res;
        },
        end(chunk) {
          if (chunk) captured.body = Buffer.from(chunk);
          resolve(captured);
        },
      };
      sendFile({ headers }, res, tmp, "text/plain; charset=utf-8");
    });
  }

  it("re-derives the etag after the bytes change under a live process", async () => {
    fs.writeFileSync(tmp, "the deployed stylesheet, before");
    const first = await drive();
    assert.equal(first.status, 200);
    assert.equal(first.headers["cache-control"], "no-cache");
    const before = first.headers.etag;
    assert.match(before, /^"[^"]+"$/);

    const unchanged = await drive({ "if-none-match": before });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.body.length, 0);

    fs.writeFileSync(tmp, "the deployed stylesheet, AFTER a css deploy");
    const afterDeploy = await drive({ "if-none-match": before });
    assert.equal(afterDeploy.status, 200, "changed bytes must never 304 an old validator");
    assert.notEqual(afterDeploy.headers.etag, before, "the validator must move with the content");
    assert.equal(afterDeploy.body.toString(), "the deployed stylesheet, AFTER a css deploy");

    const settled = await drive({ "if-none-match": afterDeploy.headers.etag });
    assert.equal(settled.status, 304, "and it 304s again once the client has caught up");
  });

  it("computes the same validator for the same bytes and a different one for different bytes", () => {
    assert.equal(etagFor(Buffer.from("a")), etagFor(Buffer.from("a")));
    assert.notEqual(etagFor(Buffer.from("a")), etagFor(Buffer.from("b")));
    assert.match(etagFor(Buffer.from("a")), /^"[^"]+"$/);
  });

  it("404s a missing file rather than serving a validator for nothing", async () => {
    fs.unlinkSync(tmp);
    const gone = await drive({ "if-none-match": '"anything"' });
    assert.equal(gone.status, 404);
    assert.equal(gone.body.toString(), "not found");
  });
});
