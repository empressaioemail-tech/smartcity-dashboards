import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { server } from "./server.mjs";

/**
 * G-158. THE ACCESS LOG, DRIVEN OVER THE WIRE BY NAMED FIXTURE STAFF IDENTITIES.
 *
 * Every assertion here goes through the product's own HTTP surface with a real
 * signed JWT, because the row's acceptance is about a READ, not about a
 * function: "a read by a named fixture staff identity writes exactly one record
 * carrying who, which record, which lens and when, and a second identity's read
 * writes a second". A test that called recordStaffRead directly would prove the
 * log works while leaving the interesting half -- that the eleven read paths
 * call it -- unmeasured.
 *
 * THE CENTRAL ASSERTION IS NEGATIVE, in both places it appears: a refused read
 * must carry NO RECORDS. "It returned a refusal" and "it did not serve the
 * records" are different claims, and the defect this row removes is precisely
 * the one where the first is true and the second is false.
 *
 * The last describe block is a structural check over server.mjs rather than a
 * behavioural one, and it exists because "every read path is instrumented" is a
 * claim about a POPULATION, not about the paths that happen to be tested.
 * A coverage claim needs its denominator; there it is.
 */

const SAVED = {};
const KEYS = ["DASHBOARDS_API_KEY", "DATABASE_URL", "K_SERVICE", "SHELL_IDENTITY_PROVIDER", "HAUSKA_TENANT_KEYS", "HAUSKA_MCP_URL"];
const ISSUER = "https://idp.test.example";
const A = { sub: "fixture-staff-01", tenant: "bastrop_tx", role: "development-services" };
const B = { sub: "fixture-staff-02", tenant: "some-other-city", role: "police" };
let port;

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A real RS256 token, minted the way src/server.test.mjs mints one -- including
 * a unique kid per mint, because the JWKS cache in src/tenancy.mjs is
 * process-lifetime and module-level, so a reused issuer+kid would read a stale
 * cached key across tests.
 */
async function mintStaffToken(payload) {
  const crypto = await import("node:crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const kid = crypto.randomUUID();
  jwk.kid = kid;
  const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const p = b64url(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  const s = sig.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token: `${signingInput}.${s}`, jwk };
}

let jwksByKid = {};
const originalFetch = globalThis.fetch;
/** OIDC discovery and JWKS are answered locally; everything else is a real request. */
function installFetchMock() {
  globalThis.fetch = async (u, opts) => {
    const s = String(u);
    if (s.endsWith("/.well-known/openid-configuration")) return { ok: true, json: async () => ({ jwks_uri: `${ISSUER}/.well-known/jwks.json` }) };
    if (s.endsWith("/.well-known/jwks.json")) return { ok: true, json: async () => ({ keys: Object.values(jwksByKid) }) };
    return originalFetch(u, opts);
  };
}

let tokens = {};
let accessLog;

before(async () => {
  for (const k of KEYS) {
    SAVED[k] = process.env[k];
    delete process.env[k];
  }
  process.env.SHELL_IDENTITY_PROVIDER = ISSUER;
  accessLog = await import("./access-log.mjs");
  const { upsertStaffAccount, _resetMemoryStoreForTests } = await import("./staff-directory.mjs");
  _resetMemoryStoreForTests();
  await upsertStaffAccount({ sub: A.sub, tenant: A.tenant, role: A.role, email: `${A.sub}@example.invalid`, name: "Fixture staff 01" });
  await upsertStaffAccount({ sub: B.sub, tenant: B.tenant, role: B.role, email: `${B.sub}@example.invalid`, name: "Fixture staff 02" });
  const nowSec = Math.floor(Date.now() / 1000);
  const base = { iss: ISSUER, exp: nowSec + 600, iat: nowSec };
  tokens.a = await mintStaffToken({ ...base, sub: A.sub, role: A.role, org_id: A.tenant });
  tokens.b = await mintStaffToken({ ...base, sub: B.sub, role: B.role, org_id: B.tenant });
  // A verified person whose token carries no tenant claim: a real state, named
  // in src/staff-identity.mjs as the pre-role, pre-tenant provisioning case.
  tokens.noTenant = await mintStaffToken({ ...base, sub: A.sub, role: A.role });
  jwksByKid = { [tokens.a.jwk.kid]: tokens.a.jwk, [tokens.b.jwk.kid]: tokens.b.jwk, [tokens.noTenant.jwk.kid]: tokens.noTenant.jwk };
  installFetchMock();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => { port = server.address().port; resolve(); }));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  globalThis.fetch = originalFetch;
  for (const k of KEYS) {
    if (SAVED[k] == null) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

beforeEach(() => {
  accessLog._resetAccessLogForTests();
});

const url = (p) => `http://127.0.0.1:${port}${p}`;
const get = (p, token, extraHeaders) =>
  originalFetch(url(p), {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(extraHeaders || {}),
    },
  });
const rowsFor = (tenant) => accessLog.listStaffAccessLog({ tenant });

const LICENSES = "/api/domains/business-licenses?cityKey=template-city";

describe("G-158: one read by a named fixture staff identity writes one record", () => {
  it("writes exactly one row, with who, which record, which lens and when", async () => {
    const res = await get(LICENSES, tokens.a.token);
    assert.equal(res.status, 200, "the read itself is served");
    const body = await res.json();
    assert.ok(Array.isArray(body.records) && body.records.length > 0, "and it carried records");

    const rows = await rowsFor(A.tenant);
    assert.equal(rows.length, 1, "exactly one record for one read");
    const r = rows[0];
    assert.equal(r.sub, A.sub, "who");
    assert.equal(r.tenant, A.tenant, "scoped to the reader's own tenant");
    assert.equal(r.cityKey, "template-city", "which city's records were opened");
    assert.equal(r.route, "/api/domains/business-licenses", "which record set");
    assert.equal(r.recordId, "business-licenses", "which record");
    assert.equal(r.lensId, "development-services", "which lens, taken from the domain itself");
    assert.match(r.readAt, /^\d{4}-\d{2}-\d{2}T/, "when");
  });

  it("gives a second identity a second record, and does not merge the two", async () => {
    assert.equal((await get(LICENSES, tokens.a.token)).status, 200);
    assert.equal((await get(LICENSES, tokens.b.token)).status, 200);
    assert.equal((await rowsFor(A.tenant)).length, 1);
    assert.equal((await rowsFor(B.tenant)).length, 1);
    assert.equal((await rowsFor(A.tenant))[0].sub, A.sub);
    assert.equal((await rowsFor(B.tenant))[0].sub, B.sub);
  });

  it("writes a second row for a second read, rather than updating the first", async () => {
    await get(LICENSES, tokens.a.token);
    await get(LICENSES, tokens.a.token);
    const rows = await rowsFor(A.tenant);
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].id, rows[1].id);
  });

  it("records the lens of the lens routes, and no lens for the chrome", async () => {
    await get("/api/lenses/finance/sources?cityKey=template-city", tokens.a.token);
    await get("/api/shell?cityKey=template-city", tokens.a.token);
    await get("/api/city-identity?cityKey=template-city", tokens.a.token);
    const rows = await rowsFor(A.tenant);
    const byRoute = Object.fromEntries(rows.map((r) => [r.route, r.lensId]));
    assert.equal(byRoute["/api/lenses/finance/sources"], "finance");
    assert.equal(byRoute["/api/shell"], null, "the shell is not a lens's records and the row says so");
    assert.equal(byRoute["/api/city-identity"], null);
  });

  it("records nothing for a read that served no records", async () => {
    const res = await get("/api/domains/not-a-registered-domain?cityKey=template-city", tokens.a.token);
    assert.notEqual(res.status, 200, "an unregistered domain is refused");
    assert.equal((await rowsFor(A.tenant)).length, 0, "and nothing was recorded, because nothing was read");
  });
});

describe("G-158: a record is not written about anyone who is not a person looking", () => {
  it("records nothing for an anonymous read of a public pack, and still serves it", async () => {
    const res = await get(LICENSES);
    assert.equal(res.status, 200, "a public-free pack is still readable anonymously");
    assert.equal((await rowsFor(A.tenant)).length, 0);
    assert.equal((await rowsFor(B.tenant)).length, 0);
  });

  it("records nothing for a product-key tenant read", async () => {
    process.env.HAUSKA_TENANT_KEYS = JSON.stringify({ "tenant-key-a": "template-city" });
    try {
      const res = await get(LICENSES, null, { "x-hauska-key": "tenant-key-a" });
      assert.equal(res.status, 200, "the product key resolves as a tenant caller and reads the pack");
      assert.equal((await res.json()).records.length > 0, true);
    } finally {
      delete process.env.HAUSKA_TENANT_KEYS;
    }
    assert.equal((await rowsFor(A.tenant)).length, 0, "a product key is not a person looking");
  });

  it("records nothing for a JWT-shaped staff bearer the product refuses", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expired = await mintStaffToken({ sub: A.sub, role: A.role, org_id: A.tenant, iss: ISSUER, iat: nowSec - 60, exp: nowSec - 30 });
    jwksByKid[expired.jwk.kid] = expired.jwk;
    /**
     * A tenant-private pack, because a refused bearer is refused CONTENT. On a
     * public-free pack the same refusal still serves the pack -- an invalid
     * staff token does not make PUBLIC content any less public (src/tenancy.mjs
     * says so where it builds the refusal) -- so bastrop_tx is where the refusal
     * is observable, and it needs no credential: the refusal direction never does.
     */
    const res = await get("/api/city-identity?cityKey=bastrop_tx", expired.token);
    assert.equal(res.status, 401, "an expired token is refused, not silently anonymous");
    const body = await res.json();
    assert.equal(body.error, "expired_token");
    assert.equal(body.identity, undefined, "and no pack content of any kind came back");
    assert.equal((await rowsFor(A.tenant)).length, 0, "a refused read is not a read and is not recorded");
  });

  it("treats a bearer that is not JWT-shaped as no bearer at all, and records nothing", async () => {
    // src/tenancy.mjs's own contract: an opaque non-JWT bearer is not a staff
    // attempt, so it resolves as anonymous and a public pack is still readable.
    const res = await get(LICENSES, "not-a-jwt-at-all");
    assert.equal(res.status, 200);
    assert.equal((await rowsFor(A.tenant)).length, 0);
  });
});

describe("G-158: a tenant's reads never appear under another tenant", () => {
  it("THE VIOLATION: tenant A's read is invisible to tenant B, in the same store", async () => {
    await get(LICENSES, tokens.a.token);
    const seenByB = await rowsFor(B.tenant);
    assert.equal(seenByB.length, 0, "B must not see A's read");
    assert.equal((await rowsFor(A.tenant)).length, 1, "while A's own scope still holds it");
    // And the row is not merely filtered out of one view: it is filed under the
    // READER's tenant, so a pack read by A is found under A even when the city
    // that was read is a different one entirely.
    assert.equal((await rowsFor(A.tenant))[0].cityKey, "template-city");
  });

  it("refuses to hand back an unscoped listing at all", async () => {
    await assert.rejects(() => accessLog.listStaffAccessLog({ tenant: "" }), /requires a tenant/);
    await assert.rejects(() => accessLog.listStaffAccessLog({}), /requires a tenant/);
  });
});

describe("G-158: a read that cannot be recorded is refused, not served", () => {
  it("THE PLANT: on a deployment with no durable store, the read is REFUSED and carries no records", async () => {
    process.env.K_SERVICE = "smartcity-dashboards";
    try {
      const res = await get(LICENSES, tokens.a.token);
      assert.equal(res.status, 503, "refused: the deployment cannot record the read");
      const body = await res.json();
      assert.equal(body.error, "access_log_write_failed");
      assert.equal(body.reason, "no_durable_store");
      assert.equal(body.refused, true);
      assert.equal(body.records, undefined, "and above all it did NOT serve the records");
      assert.equal(/business-license/i.test(JSON.stringify(body)), false, "no record content of any kind");
      // The read half refuses too, and says why rather than answering "nobody
      // looked" -- the two absences are different and are kept apart.
      await assert.rejects(() => rowsFor(A.tenant), /no durable access-log store/);
    } finally {
      delete process.env.K_SERVICE;
    }
    // Nothing was written either way, so the trail did not gain a row for a read
    // that was never served.
    assert.equal((await rowsFor(A.tenant)).length, 0);
    // And the same request on a deployment that CAN record it is served, which
    // is what makes the refusal above the log's absence rather than something
    // about this request.
    assert.equal((await get(LICENSES, tokens.a.token)).status, 200);
    assert.equal((await rowsFor(A.tenant)).length, 1);
  });

  it("refuses a store that errors rather than swallowing it", async () => {
    const { recordStaffRead, AccessLogWriteRefused } = accessLog;
    const neonEnv = { DATABASE_URL: "postgres://u:p@ep-g158-test.neon.tech/neondb" };
    await assert.rejects(
      () => recordStaffRead({ caller: { kind: "staff", sub: A.sub, tenant: A.tenant }, cityKey: "template-city", lensId: "finance", route: "/api/x" }, neonEnv, {
        query: () => { throw new Error("connection terminated unexpectedly"); },
      }),
      (err) => {
        assert.ok(err instanceof AccessLogWriteRefused);
        assert.equal(err.error, "access_log_write_failed");
        assert.equal(err.reason, "store_error");
        assert.equal(err.status, 503, "a store that cannot take the row is a service failure, not a permission one");
        assert.match(err.message, /connection terminated unexpectedly/, "the store's own failure travels with the refusal");
        return true;
      },
    );
  });

  it("refuses a verified person whose token carries no tenant, rather than filing the row nowhere", async () => {
    const res = await get(LICENSES, tokens.noTenant.token);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.reason, "no_tenant_claim");
    assert.equal(body.records, undefined);
  });

  it("refuses to ANSWER 'who looked' from a deployment with no store, rather than saying nobody did", async () => {
    process.env.K_SERVICE = "smartcity-dashboards";
    try {
      await assert.rejects(() => accessLog.listStaffAccessLog({ tenant: A.tenant }), /no durable access-log store/);
    } finally {
      delete process.env.K_SERVICE;
    }
  });
});

describe("G-158: every content-read path is instrumented, counted rather than assumed", () => {
  const source = readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
  const lines = source.split("\n");
  const firstRoute = lines.findIndex((l) => l.includes('url.pathname === "/api/lenses/city-manager/compose"'));

  it("leaves no packContentReadStatus call site outside the two gate helpers", () => {
    const callSites = lines.map((l, i) => [l, i]).filter(([l]) => l.includes("packContentReadStatus(pack"));
    assert.equal(callSites.length, 2, "both call sites are the gate's own readability checks");
    for (const [l, i] of callSites) {
      assert.match(l.trim(), /^const status = packContentReadStatus\(pack, caller\);$/);
      assert.ok(i < firstRoute, `a route reads the policy directly at line ${i + 1}, bypassing the gate`);
    }
  });

  it("gives every readability check a log write, and counts the evidence", () => {
    const checks = lines.map((l, i) => [l, i]).filter(([l]) => l.includes("if (contentReadRefused"));
    // The denominator, stated: eleven routes gate pack content on
    // packContentReadStatus today. A twelfth that forgets this pairing is the
    // hole this assertion exists to catch, and it fails here rather than in
    // production.
    assert.equal(checks.length, 11, `expected the eleven content-read seams, found ${checks.length}`);
    const unpaired = [];
    for (const [, i] of checks) {
      // The next 40 lines, not the next line: /api/domains/:id deliberately
      // settles readability before composing and records only once the composed
      // record is known to be served.
      const window = lines.slice(i + 1, i + 41).join("\n");
      if (!window.includes("await recordReadOrRefuse")) unpaired.push(i + 1);
    }
    assert.deepEqual(unpaired, [], "a readability check with no log write behind it is a hole in the trail");
    // /api/domains/:id serves from two branches and records on each, so there is
    // exactly one more log write than there are checks.
    const writes = lines.filter((l) => l.includes("await recordReadOrRefuse")).length;
    assert.equal(writes, checks.length + 1, "expected one log write per seam, plus the domains route's second serve path");
  });
});
