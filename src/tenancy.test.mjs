import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  atomVisibleToCaller,
  callerIsPackSubject,
  canReadPack,
  packReadStatus,
  packContentReadStatus,
  accessRefusalBody,
  resolveAtomAccessPolicy,
  resolveCaller,
} from "./tenancy.mjs";
import { FIXTURE_CITY, TEMPLATE_CITY } from "./city-pack.mjs";
import { upsertStaffAccount, disableStaffAccount, enableStaffAccount, _resetMemoryStoreForTests } from "./staff-directory.mjs";

const ISSUER = "https://idp.test.example";

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeStaffToken({ payload = {} } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = "k1";
  const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "k1" }));
  const p = b64url(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  const s = sig.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token: `${signingInput}.${s}`, jwk };
}

function staffFetchImpl(jwk) {
  return async (url) => {
    if (String(url).endsWith("/.well-known/openid-configuration")) {
      return { ok: true, json: async () => ({ jwks_uri: `${ISSUER}/.well-known/jwks.json` }) };
    }
    if (String(url).endsWith("/.well-known/jwks.json")) {
      return { ok: true, json: async () => ({ keys: [jwk] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

describe("city pack tenancy", () => {
  it("refuses fixture-city to anonymous and the service key", () => {
    assert.equal(canReadPack(FIXTURE_CITY, { kind: "anonymous" }, { DASHBOARDS_API_KEY: "svc" }), false);
    assert.equal(canReadPack(FIXTURE_CITY, { kind: "service" }, { DASHBOARDS_API_KEY: "svc" }), false);
    assert.equal(
      canReadPack(FIXTURE_CITY, { kind: "tenant", tenant: "fixture-city" }, { DASHBOARDS_API_KEY: "svc" }),
      true,
    );
    assert.equal(
      canReadPack(FIXTURE_CITY, { kind: "tenant", tenant: "other-city" }, { DASHBOARDS_API_KEY: "svc" }),
      false,
    );
    assert.equal(packReadStatus(FIXTURE_CITY, { kind: "anonymous" }, { DASHBOARDS_API_KEY: "svc" }), 401);
    assert.equal(packReadStatus(FIXTURE_CITY, { kind: "service" }, { DASHBOARDS_API_KEY: "svc" }), 403);
  });

  it("lets the service key read template-city and not treat it as a tenant", async () => {
    const env = { DASHBOARDS_API_KEY: "svc" };
    assert.equal(canReadPack(TEMPLATE_CITY, { kind: "service" }, env), true);
    assert.equal(canReadPack(TEMPLATE_CITY, { kind: "anonymous" }, env), false);
    const caller = await resolveCaller(
      { headers: { authorization: "Bearer svc" } },
      env,
    );
    assert.equal(caller.kind, "service");
  });

  it("resolves X-Hauska-Key from HAUSKA_TENANT_KEYS and prefers tenant over service", async () => {
    const env = {
      DASHBOARDS_API_KEY: "svc",
      HAUSKA_TENANT_KEYS: JSON.stringify({ "hauska-fixture": "fixture-city" }),
    };
    const caller = await resolveCaller(
      {
        headers: {
          authorization: "Bearer svc",
          "x-hauska-key": "hauska-fixture",
        },
      },
      env,
    );
    assert.equal(caller.kind, "tenant");
    assert.equal(caller.tenant, "fixture-city");
  });

  it("ignores HAUSKA_TENANT_KEYS on Cloud Run so live subject is MCP whoami", async () => {
    const env = {
      K_SERVICE: "smartcity-dashboards",
      HAUSKA_TENANT_KEYS: JSON.stringify({ "hauska-fixture": "fixture-city" }),
      HAUSKA_MCP_URL: "",
    };
    const caller = await resolveCaller(
      { headers: { "x-hauska-key": "hauska-fixture" } },
      env,
    );
    assert.equal(caller.kind, "anonymous");
  });

  it("shows tenant-private atoms only to the matching pack subject", () => {
    const atom = { type: "workspace", accessPolicy: "tenant-private" };
    assert.equal(atomVisibleToCaller(atom, { kind: "anonymous" }, "fixture-city"), false);
    assert.equal(atomVisibleToCaller(atom, { kind: "service" }, "fixture-city"), false);
    assert.equal(
      atomVisibleToCaller(atom, { kind: "tenant", tenant: "template-city" }, "fixture-city"),
      false,
    );
    assert.equal(
      atomVisibleToCaller(atom, { kind: "tenant", tenant: "fixture-city" }, "fixture-city"),
      true,
    );
    assert.equal(
      atomVisibleToCaller({ type: "owner-fact", accessPolicy: "public-paid" }, { kind: "tenant", tenant: "fixture-city" }, "fixture-city"),
      false,
    );
  });

  /**
   * G-102. AN ATOM THAT DECLARES NO POLICY IS REFUSED, NOT PUBLISHED.
   *
   * atomVisibleToCaller returned TRUE for an absent or blank accessPolicy, so a
   * real city's atoms with no policy set were readable anonymously. The value
   * "unset" is recognised by no authority: the atom contract's accessPolicy
   * union has five members and the absence of one is the absence of a decision,
   * which resolves to no.
   */
  it("refuses an atom that declares no policy this product recognises", () => {
    const subject = { kind: "tenant", tenant: "fixture-city" };
    const refused = [
      { type: "setback-rule" },
      { type: "setback-rule", accessPolicy: "" },
      { type: "setback-rule", accessPolicy: "   " },
      { type: "setback-rule", accessPolicy: null },
      { type: "setback-rule", accessPolicy: undefined },
      { type: "setback-rule", accessPolicy: "unset" },
      { type: "setback-rule", accessPolicy: "public" },
      { type: "setback-rule", accessPolicy: true },
      { type: "setback-rule", accessPolicy: 1 },
      { type: "setback-rule", accessPolicy: ["public-free"] },
    ];
    for (const atom of refused) {
      assert.equal(atomVisibleToCaller(atom, { kind: "anonymous" }, "fixture-city"), false, JSON.stringify(atom));
      // Refused for EVERY caller, including the pack's own subject and the
      // service bearer. A policy nobody declared is not a policy anyone passes.
      assert.equal(atomVisibleToCaller(atom, subject, "fixture-city"), false, JSON.stringify(atom));
      assert.equal(atomVisibleToCaller(atom, { kind: "service" }, "fixture-city"), false, JSON.stringify(atom));
      assert.equal(resolveAtomAccessPolicy(atom), null, JSON.stringify(atom));
    }

    /**
     * NOT A GATE THAT REFUSES EVERYTHING. The same call shape with a DECLARED
     * policy still resolves and still permits, so the refusals above are the
     * policy answering rather than the function having stopped working.
     */
    assert.equal(resolveAtomAccessPolicy({ accessPolicy: " public-free " }), "public-free");
    assert.equal(
      atomVisibleToCaller({ type: "setback-rule", accessPolicy: "public-free" }, { kind: "anonymous" }, "fixture-city"),
      true,
    );
    assert.equal(
      atomVisibleToCaller({ type: "workspace", accessPolicy: "tenant-private" }, subject, "fixture-city"),
      true,
    );
  });

  it("does not treat a blank cityKey as a tenant subject", () => {
    /**
     * The subject rule's own fail-closed leg. A defaulted or dropped cityKey
     * arrives as "" and would otherwise match a caller whose tenant is also
     * blank, which is a tenancy match made out of two absences.
     */
    assert.equal(callerIsPackSubject({ kind: "tenant", tenant: "" }, ""), false);
    assert.equal(callerIsPackSubject({ kind: "tenant", tenant: "   " }, "   "), false);
    assert.equal(callerIsPackSubject({ kind: "tenant", tenant: "fixture-city" }, ""), false);
    assert.equal(callerIsPackSubject({ kind: "anonymous" }, "fixture-city"), false);
    assert.equal(callerIsPackSubject({ kind: "service" }, "fixture-city"), false);
    assert.equal(callerIsPackSubject(undefined, "fixture-city"), false);
    // And it still says yes to the one caller it is for.
    assert.equal(callerIsPackSubject({ kind: "tenant", tenant: "fixture-city" }, "fixture-city"), true);
  });
});

describe("G-132: a staff bearer reaches resolveCaller end to end", () => {
  const env = { SHELL_IDENTITY_PROVIDER: ISSUER };
  const now = Math.floor(Date.now() / 1000);
  const BASTROP_TENANT_PACK = Object.freeze({
    cityKey: "bastrop_tx",
    displayName: "Bastrop, TX",
    accessPolicy: "tenant-private",
    environment: "production",
    grantedAdapters: [],
  });

  before(async () => {
    _resetMemoryStoreForTests();
    // These three subs are provisioned by "us" before their tests run, matching ruling 1
    // (self-registration off; every account exists because SmartCity admin created it) and
    // this module's own default-deny-unknown-sub rule -- an unprovisioned sub is refused
    // regardless of a valid signature, tested separately below.
    await upsertStaffAccount({ sub: "p-1", tenant: "bastrop_tx", role: "police" });
    await upsertStaffAccount({ sub: "p-2", tenant: "bastrop_tx", role: "fire-ems" });
    await upsertStaffAccount({ sub: "p-3", tenant: "some-other-city", role: "police" });
  });

  it("resolves a verified staff bearer to kind staff, with the role claim readable", async () => {
    const { token, jwk } = makeStaffToken({
      payload: { sub: "p-1", iss: ISSUER, exp: now + 600, role: "police", org_id: "bastrop_tx" },
    });
    const caller = await resolveCaller(
      { headers: { authorization: `Bearer ${token}` } },
      env,
      { fetchImpl: staffFetchImpl(jwk), jwksCache: new Map() },
    );
    assert.equal(caller.kind, "staff");
    assert.equal(caller.sub, "p-1");
    assert.equal(caller.role, "police");
    assert.equal(caller.tenant, "bastrop_tx");
  });

  it("a valid staff person reads their own tenant's tenant-private pack, same as a product key could", async () => {
    const { token, jwk } = makeStaffToken({
      payload: { sub: "p-2", iss: ISSUER, exp: now + 600, role: "fire-ems", org_id: "bastrop_tx" },
    });
    const caller = await resolveCaller(
      { headers: { authorization: `Bearer ${token}` } },
      env,
      { fetchImpl: staffFetchImpl(jwk), jwksCache: new Map() },
    );
    assert.equal(canReadPack(BASTROP_TENANT_PACK, caller, env), true);
    assert.equal(callerIsPackSubject(caller, "bastrop_tx"), true);
  });

  it("a valid staff person from a DIFFERENT tenant is refused another city's tenant-private pack", async () => {
    const { token, jwk } = makeStaffToken({
      payload: { sub: "p-3", iss: ISSUER, exp: now + 600, role: "police", org_id: "some-other-city" },
    });
    const caller = await resolveCaller(
      { headers: { authorization: `Bearer ${token}` } },
      env,
      { fetchImpl: staffFetchImpl(jwk), jwksCache: new Map() },
    );
    assert.equal(canReadPack(BASTROP_TENANT_PACK, caller, env), false);
    assert.equal(packContentReadStatus(BASTROP_TENANT_PACK, caller, env), 403);
  });

  /**
   * THE FAIL-CLOSED REQUIREMENT, ON THE REAL FAILING CASE. An expired/invalid
   * staff bearer must be refused OUTRIGHT -- never silently re-resolved via
   * x-hauska-key even when a perfectly valid one is ALSO present on the same
   * request. This is the literal mechanism behind "never fall back to
   * tenant-only resolution": a caller that attempted a stronger identity does
   * not get quietly downgraded to a weaker one that happens to also work.
   */
  it("refuses an expired staff bearer even when a valid x-hauska-key is also presented", async () => {
    const { token, jwk } = makeStaffToken({ payload: { sub: "p-4", iss: ISSUER, exp: now - 10 } });
    const caller = await resolveCaller(
      {
        headers: {
          authorization: `Bearer ${token}`,
          "x-hauska-key": "hauska-fixture",
        },
      },
      { ...env, HAUSKA_TENANT_KEYS: JSON.stringify({ "hauska-fixture": "fixture-city" }) },
      { fetchImpl: staffFetchImpl(jwk), jwksCache: new Map() },
    );
    assert.equal(caller.kind, "anonymous", "must not fall back to the tenant kind");
    assert.equal(caller.tenant, undefined, "must carry no tenant from the fallback path");
    assert.equal(caller.refused.error, "expired_token");
  });

  it("a typed refusal reaches the response body, not a bare 'unauthorized'", async () => {
    const { token, jwk } = makeStaffToken({ payload: { sub: "p-5", iss: ISSUER, exp: now - 10 } });
    const caller = await resolveCaller(
      { headers: { authorization: `Bearer ${token}` } },
      env,
      { fetchImpl: staffFetchImpl(jwk), jwksCache: new Map() },
    );
    const status = packContentReadStatus(BASTROP_TENANT_PACK, caller, env);
    assert.equal(status, 401);
    const body = accessRefusalBody(caller, status);
    assert.equal(body.error, "expired_token");
    assert.match(body.message, /exp/);
    // And the generic path is unchanged for a plain anonymous caller.
    assert.deepEqual(accessRefusalBody({ kind: "anonymous" }, 401), { error: "unauthorized" });
    assert.deepEqual(accessRefusalBody({ kind: "service" }, 403), { error: "forbidden" });
  });

  /**
   * THE ANONYMOUS PATH IS LOAD-BEARING (mission requirement, both halves).
   * An invalid staff bearer must not make PUBLIC content any less public --
   * refusing to identify a caller is not the same act as refusing to serve
   * content everyone can already see.
   */
  it("template-city (public-free) still serves content when a staff bearer fails, and to true anonymous", async () => {
    const { token, jwk } = makeStaffToken({ payload: { sub: "p-6", iss: ISSUER, exp: now - 10 } });
    const brokenBearerCaller = await resolveCaller(
      { headers: { authorization: `Bearer ${token}` } },
      env,
      { fetchImpl: staffFetchImpl(jwk), jwksCache: new Map() },
    );
    assert.equal(packContentReadStatus(TEMPLATE_CITY, brokenBearerCaller, env), 200);

    const trueAnonymous = await resolveCaller({ headers: {} }, env, {});
    assert.equal(trueAnonymous.kind, "anonymous");
    assert.equal(trueAnonymous.refused, undefined);
    assert.equal(packContentReadStatus(TEMPLATE_CITY, trueAnonymous, env), 200);

    // And bastrop_tx (tenant-private) still correctly 401s true anonymous, unchanged.
    assert.equal(packContentReadStatus(BASTROP_TENANT_PACK, trueAnonymous, env), 401);
  });

  it("a non-JWT bearer (the existing opaque service key) is untouched by any of this", async () => {
    const caller = await resolveCaller(
      { headers: { authorization: "Bearer plain-service-key" } },
      { ...env, DASHBOARDS_API_KEY: "plain-service-key" },
      {},
    );
    assert.equal(caller.kind, "service");
  });

  it("a cryptographically valid token for a sub WE never provisioned is refused, never trusted on signature alone", async () => {
    const { token, jwk } = makeStaffToken({
      payload: { sub: "never-provisioned", iss: ISSUER, exp: now + 600, role: "police", org_id: "bastrop_tx" },
    });
    const caller = await resolveCaller(
      { headers: { authorization: `Bearer ${token}` } },
      env,
      { fetchImpl: staffFetchImpl(jwk), jwksCache: new Map() },
    );
    assert.equal(caller.kind, "anonymous");
    assert.equal(caller.refused.error, "revoked");
  });
});

/**
 * OFFBOARDING, VERIFIED BY VIOLATION, BOTH DIRECTIONS -- the mission's own
 * required method, not narrated: disable an account and confirm access ends
 * on the NEXT request with the SAME still-cryptographically-valid,
 * unexpired token; confirm a different, still-active account is unaffected.
 * A control observed only permitting (or only refusing) has not been
 * observed working.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. This proves the LOCAL half of
 * offboarding -- src/staff-directory.mjs's disable flips resolveCaller's
 * default isRevoked check on the very next request, deployment-wide (every
 * Cloud Run instance reads the same Neon row; the in-memory store used here
 * is the local/test equivalent of that same table, per city-pack.mjs's own
 * convention). It does NOT prove a provider-side session/refresh-token
 * revocation, because no real provider is wired yet (named gap, close). The
 * bound this deployment actually offers today: an already-issued ACCESS
 * token that has not yet expired stops being HONORED by these three
 * products from the moment disableStaffAccount runs, even though the
 * token's own exp has not passed -- offboarding here does not wait out the
 * TTL, it is enforced independently of it.
 */
describe("G-132: offboarding is verified by violation, both directions", () => {
  const env = { SHELL_IDENTITY_PROVIDER: ISSUER };
  const now = Math.floor(Date.now() / 1000);

  before(() => _resetMemoryStoreForTests());

  it("disabling an account ends access on the very next request, with the identical unexpired token", async () => {
    await upsertStaffAccount({ sub: "leaver-1", tenant: "bastrop_tx", role: "public-works" });
    const { token, jwk } = makeStaffToken({
      payload: { sub: "leaver-1", iss: ISSUER, exp: now + 3600, role: "public-works", org_id: "bastrop_tx" },
    });
    const deps = { fetchImpl: staffFetchImpl(jwk), jwksCache: new Map() };

    const before1 = await resolveCaller({ headers: { authorization: `Bearer ${token}` } }, env, deps);
    assert.equal(before1.kind, "staff", "must work before disabling -- a check observed only refusing has not been observed working");

    await disableStaffAccount("leaver-1", { disabledBy: "test-operator" });

    const after1 = await resolveCaller({ headers: { authorization: `Bearer ${token}` } }, env, deps);
    assert.equal(after1.kind, "anonymous");
    assert.equal(after1.refused.error, "revoked");
  });

  it("disabling one account does not touch a different, still-active account", async () => {
    await upsertStaffAccount({ sub: "stays-1", tenant: "bastrop_tx", role: "finance" });
    await upsertStaffAccount({ sub: "leaver-2", tenant: "bastrop_tx", role: "finance" });
    const staying = makeStaffToken({ payload: { sub: "stays-1", iss: ISSUER, exp: now + 3600, role: "finance", org_id: "bastrop_tx" } });
    const leaving = makeStaffToken({ payload: { sub: "leaver-2", iss: ISSUER, exp: now + 3600, role: "finance", org_id: "bastrop_tx" } });

    await disableStaffAccount("leaver-2", { disabledBy: "test-operator" });

    const staysCaller = await resolveCaller(
      { headers: { authorization: `Bearer ${staying.token}` } },
      env,
      { fetchImpl: staffFetchImpl(staying.jwk), jwksCache: new Map() },
    );
    assert.equal(staysCaller.kind, "staff", "a valid account must still work while an unrelated one is disabled");

    const leftCaller = await resolveCaller(
      { headers: { authorization: `Bearer ${leaving.token}` } },
      env,
      { fetchImpl: staffFetchImpl(leaving.jwk), jwksCache: new Map() },
    );
    assert.equal(leftCaller.kind, "anonymous");
    assert.equal(leftCaller.refused.error, "revoked");
  });

  it("re-enabling restores access (the reversible half of the same mechanism)", async () => {
    await upsertStaffAccount({ sub: "reinstated-1", tenant: "bastrop_tx", role: "parks" });
    await disableStaffAccount("reinstated-1", { disabledBy: "test-operator" });
    const { token, jwk } = makeStaffToken({
      payload: { sub: "reinstated-1", iss: ISSUER, exp: now + 3600, role: "parks", org_id: "bastrop_tx" },
    });
    const deps = { fetchImpl: staffFetchImpl(jwk), jwksCache: new Map() };

    const whileDisabled = await resolveCaller({ headers: { authorization: `Bearer ${token}` } }, env, deps);
    assert.equal(whileDisabled.kind, "anonymous");

    await enableStaffAccount("reinstated-1");
    const afterReenable = await resolveCaller({ headers: { authorization: `Bearer ${token}` } }, env, deps);
    assert.equal(afterReenable.kind, "staff");
  });
});
