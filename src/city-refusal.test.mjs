import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { server } from "./server.mjs";

/**
 * ---------------------------------------------------------------------------
 * G-161. THE CITY REFUSAL, PROVEN BY VIOLATION ON EVERY ROUTE IT WAS WRITTEN FOR.
 *
 * WHAT THIS FILE MEASURES, and it is BEHAVIOUR rather than source text: what each
 * route ANSWERS when the request names no city, names a blank, names a pack that
 * does not exist, names a pack it may read, and names one it may not. A grep for
 * the deleted defaults would go green the moment somebody removed the literal,
 * which is precisely how these routes outlived G-159's sweep - one of them hid
 * behind an imported SYMBOL (`DEFAULT_CITY_KEY`) that no literal grep can see.
 *
 * THE FIVE CELLS, and why the last four are not decoration:
 *
 *   1. keyless             400 city_key_required   the refusal itself
 *   2. blank / whitespace  400 city_key_required   a blank is not a city
 *   3. no-such-city        404 unknown city pack   UNKNOWN stays distinct from ABSENT
 *   4. template-city       200                     the route still WORKS
 *   5. fixture-city        401                     the access gate is still shut
 *
 * Without 3, a route that refused everything would pass. Without 4, a route that
 * answered nothing would pass. Without 5, the refusal could have REPLACED the
 * access check rather than sitting in front of it. The five together are the
 * both-directions proof the dispatch asks for.
 *
 * THE SERVICE KEY IS UNSET here, which is the posture every local test uses. That
 * makes template-city readable anonymously (public-free) and fixture-city a 401,
 * which is the pair this table needs. The DEPLOYED posture sets the service key
 * and keeps BOTH answers, because packContentReadStatus is about the PACK's
 * policy rather than the deployment's key - which is what lets the same cells be
 * measured on the UAT app by the paired probe in the close artifact.
 *
 * THE POPULATION is a table typed here, and that is a LIMIT stated rather than
 * hidden: a route added to the server later does not silently join it. The
 * deployed probe is what measures the live surface instead of this file's copy of
 * it, and the count is asserted below so this table cannot quietly shrink.
 */
const CONTENT_ROUTES = [
  { id: "city-manager compose", path: "/api/lenses/city-manager/compose" },
  { id: "development-services pipeline", path: "/api/lenses/development-services/pipeline" },
  { id: "city domains", path: "/api/city-domains" },
  { id: "one domain endpoint, the handler every lens reads through", path: "/api/domains/permits-pipeline" },
  { id: "city identity", path: "/api/city-identity" },
  { id: "shell state", path: "/api/shell" },
  {
    id: "finance sources - G-159's route, which is the pattern this lane followed",
    path: "/api/lenses/finance/sources",
  },
];

/** The seven routes dispatch item 4 enumerates. Asserted, so a row deleted from
 *  the table above is a red test rather than a smaller denominator nobody sees. */
const ENUMERATED_ROUTE_COUNT = 7;

const ENV_KEYS = [
  "DASHBOARDS_API_KEY",
  "DATABASE_URL",
  "HAUSKA_RETRIEVAL_URL",
  "SMART_FILES_BACKEND_URL",
  "HAUSKA_RETRIEVAL_API_KEY",
  "SMART_FILES_API_KEY",
  "HAUSKA_TENANT_KEYS",
];

let port;
const saved = {};

const base = () => `http://127.0.0.1:${port}`;
const get = (path, headers = {}) => fetch(`${base()}${path}`, { headers });
const post = (path, headers = {}) => fetch(`${base()}${path}`, { method: "POST", headers });

describe("G-161 city refusal", () => {
  before(
    () =>
      new Promise((resolve) => {
        for (const k of ENV_KEYS) saved[k] = process.env[k];
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
        server.close((err) => {
          for (const k of ENV_KEYS) {
            if (saved[k] == null) delete process.env[k];
            else process.env[k] = saved[k];
          }
          if (err) reject(err);
          else resolve();
        });
      }),
  );

  it("states its population, so a route cannot leave the table unnoticed", () => {
    assert.equal(CONTENT_ROUTES.length, ENUMERATED_ROUTE_COUNT);
    assert.equal(new Set(CONTENT_ROUTES.map((r) => r.path)).size, ENUMERATED_ROUTE_COUNT);
  });

  it("cell 1: a request that names no city refuses 400 city_key_required", async () => {
    for (const route of CONTENT_ROUTES) {
      const res = await get(route.path);
      assert.equal(res.status, 400, `${route.id} answered ${res.status} to a keyless request`);
      const body = await res.json();
      assert.equal(body.error, "city_key_required", route.id);
      assert.match(body.message, /refuses without one/, route.id);
    }
  });

  it("cell 2: a blank or whitespace-only cityKey names nothing either", async () => {
    for (const route of CONTENT_ROUTES) {
      for (const blank of ["cityKey=", "cityKey=%20", "cityKey=%09", "cityKey=+"]) {
        const res = await get(`${route.path}?${blank}`);
        assert.equal(res.status, 400, `${route.id} answered ${res.status} to ${blank}`);
        assert.equal((await res.json()).error, "city_key_required", `${route.id} ${blank}`);
      }
    }
  });

  it("cell 2b: a padded but real key is still a real key, so trim does not refuse a city", async () => {
    /**
     * The other side of the trim: `?cityKey=%20template-city%20` names a city and
     * must NOT be refused. Without this arm, a route that refused every value
     * containing whitespace would satisfy cell 2 and look identical.
     */
    for (const route of CONTENT_ROUTES) {
      const res = await get(`${route.path}?cityKey=%20template-city%20`);
      assert.equal(res.status, 200, `${route.id} refused a padded but real key`);
    }
  });

  it("cell 3: an UNKNOWN pack stays a 404, so ABSENT did not swallow UNKNOWN", async () => {
    for (const route of CONTENT_ROUTES) {
      const res = await get(`${route.path}?cityKey=no-such-city`);
      assert.equal(res.status, 404, route.id);
      assert.deepEqual(await res.json(), { error: "unknown city pack" }, route.id);
    }
  });

  it("cell 4: a named, readable pack still answers - the refusal is not a wall", async () => {
    for (const route of CONTENT_ROUTES) {
      const res = await get(`${route.path}?cityKey=template-city`);
      assert.equal(res.status, 200, route.id);
    }
  });

  it("cell 5: a tenant-private pack is still refused to an anonymous caller", async () => {
    for (const route of CONTENT_ROUTES) {
      const res = await get(`${route.path}?cityKey=fixture-city`);
      assert.equal(res.status, 401, route.id);
    }
  });

  it("still NAMES the city it answered for, rather than composing one nobody named", async () => {
    /**
     * The defect was never only a status code - it was a payload that named the
     * demo pack to a caller who had named nothing. So the named case is asserted
     * on its own cityKey field, and the keyless case is asserted to carry no
     * pack at all rather than a default one.
     */
    const identity = await get("/api/city-identity?cityKey=fixture-city", {
      "x-hauska-key": "not-a-key",
    });
    assert.equal(identity.status, 401);
    assert.equal((await identity.json()).cityKey, undefined);

    const keyless = await get("/api/city-identity");
    const body = await keyless.json();
    assert.equal(body.cityKey, undefined, "a refusal must not name a pack");
    assert.equal(body.identity, undefined, "and must not carry one's identity");
  });

  it("refuses the municode adapter run without a city, and still runs the pack it exists for", async () => {
    /**
     * The one route that was PARTLY guarded - it 403'd anything that was not the
     * pack this run is for - so a missing cityKey silently ran that pack's
     * calendar and WROTE its files. It is the reason the refusal had to reach all
     * seven rather than the six that were obviously unguarded.
     */
    const route = "/api/adapters/municode/calendar/run";

    const keyless = await post(route);
    assert.equal(keyless.status, 400);
    assert.equal((await keyless.json()).error, "city_key_required");

    const blank = await post(`${route}?cityKey=%20`);
    assert.equal(blank.status, 400);
    assert.equal((await blank.json()).error, "city_key_required");

    /**
     * Its OWN 403 is untouched and still fires for a named pack that is not the
     * one this adapter run is for. The refusal sits BESIDE this guard rather than
     * in place of it, which is the thing a careless version of this change would
     * have traded away.
     */
    const other = await post(`${route}?cityKey=bastrop_tx`);
    assert.equal(other.status, 403);

    const demo = await post(`${route}?cityKey=template-city`);
    assert.equal(demo.status, 200);
    assert.equal((await demo.json()).cityKey, "template-city");
  });

  it("reports the caller's own resolved tenant, which is the client's second way to name a city", async () => {
    /**
     * web/app.js may not name any shipped pack as a literal (src/city-identity.test.mjs
     * holds that), so its second resolution step - "the caller's resolved tenant"
     * - has to come back from the server. It rides on this route because this is
     * the only route the client may call WITHOUT naming a city: the enumeration.
     * Both directions are measured here, because a null for everyone would satisfy
     * the anonymous arm and break every keyed caller.
     */
    const anon = await get("/api/city-packs");
    assert.equal(anon.status, 200);
    const anonBody = await anon.json();
    assert.equal(anonBody.caller.kind, "anonymous");
    assert.equal(anonBody.caller.tenant, null, "a caller who is the subject of nothing reports null, never a blank city");

    process.env.HAUSKA_TENANT_KEYS = JSON.stringify({ "hauska-g161": "bastrop_tx" });
    try {
      const keyed = await get("/api/city-packs", { "x-hauska-key": "hauska-g161" });
      assert.equal(keyed.status, 200);
      const keyedBody = await keyed.json();
      assert.equal(keyedBody.caller.kind, "tenant");
      assert.equal(keyedBody.caller.tenant, "bastrop_tx");
      const listed = keyedBody.cityPacks.map((p) => p.cityKey);
      assert.ok(listed.includes("bastrop_tx"), `the resolved tenant's own pack is listed: ${JSON.stringify(listed)}`);

      /**
       * And the tenant leg then survives the step the client takes with it: the
       * city it resolved is a city the CONTENT routes accept, and the route that
       * names a city back names THAT one. /api/city-identity is used rather than
       * /api/shell because the shell payload carries a session and a capability
       * list rather than a city field - asserted on the route that has one, so
       * this arm measures the tenant rather than the response's shape.
       */
      const identity = await get("/api/city-identity?cityKey=bastrop_tx", { "x-hauska-key": "hauska-g161" });
      assert.equal(identity.status, 200);
      assert.equal((await identity.json()).identity?.cityKey, "bastrop_tx");
    } finally {
      delete process.env.HAUSKA_TENANT_KEYS;
    }
  });
});
