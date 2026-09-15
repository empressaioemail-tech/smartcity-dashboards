import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyStaffToken, looksLikeJwt, isKnownRole } from "./staff-identity.mjs";

const ISSUER = "https://idp.test.example";
const KID = "test-key-1";

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = KID;
  jwk.use = "sig";
  jwk.alg = "RS256";
  return { privateKey, jwk };
}

function signToken(privateKey, { header = {}, payload = {} } = {}) {
  const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: KID, ...header }));
  const p = b64url(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  const s = sig.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${signingInput}.${s}`;
}

function fakeFetch(jwk) {
  return async (url) => {
    if (String(url).endsWith("/.well-known/openid-configuration")) {
      return {
        ok: true,
        json: async () => ({ jwks_uri: `${ISSUER}/.well-known/jwks.json` }),
      };
    }
    if (String(url).endsWith("/.well-known/jwks.json")) {
      return { ok: true, json: async () => ({ keys: [jwk] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

function baseEnv() {
  return { SHELL_IDENTITY_PROVIDER: ISSUER };
}

describe("staff-identity: not a staff bearer at all", () => {
  it("returns null for a non-JWT-shaped bearer (the existing service-key path)", async () => {
    assert.equal(await verifyStaffToken("plain-opaque-service-key", baseEnv(), {}), null);
    assert.equal(await verifyStaffToken("", baseEnv(), {}), null);
    assert.equal(await verifyStaffToken(undefined, baseEnv(), {}), null);
  });

  it("looksLikeJwt distinguishes shape only, both directions", () => {
    assert.equal(looksLikeJwt("a.b.c"), true);
    assert.equal(looksLikeJwt("a.b"), false);
    assert.equal(looksLikeJwt("not-a-jwt-at-all"), false);
    assert.equal(looksLikeJwt(42), false);
  });
});

describe("staff-identity: fail-closed configuration", () => {
  it("refuses a JWT-shaped bearer when no issuer is configured, never accepts unverifiably", async () => {
    const { privateKey } = makeKeypair();
    const token = signToken(privateKey, { payload: { sub: "u1", iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 600 } });
    const result = await verifyStaffToken(token, {}, {});
    assert.equal(result.ok, false);
    assert.equal(result.error, "identity_provider_not_configured");
    assert.equal(result.status, 401);
  });
});

describe("staff-identity: the positive path, and it must be observed working", () => {
  it("verifies a well-formed token and reads sub/role/tenant", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, {
      payload: { sub: "person-42", iss: ISSUER, exp: now + 600, role: "development-services", org_id: "bastrop_tx", email: "d.staffer@bastroptx.gov", name: "D. Staffer" },
    });
    const result = await verifyStaffToken(token, baseEnv(), { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, true);
    assert.equal(result.identity.sub, "person-42");
    assert.equal(result.identity.role, "development-services");
    assert.equal(result.identity.tenant, "bastrop_tx");
    assert.equal(result.identity.email, "d.staffer@bastroptx.gov");
    assert.equal(isKnownRole(result.identity.role), true);
  });

  it("honors STAFF_ROLE_CLAIM / STAFF_TENANT_CLAIM overrides for a namespaced-claim provider", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, {
      payload: {
        sub: "person-9",
        iss: ISSUER,
        exp: now + 600,
        "https://smartcity.example/role": "city-manager",
        "https://smartcity.example/org": "bastrop_tx",
      },
    });
    const env = { ...baseEnv(), STAFF_ROLE_CLAIM: "https://smartcity.example/role", STAFF_TENANT_CLAIM: "https://smartcity.example/org" };
    const result = await verifyStaffToken(token, env, { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, true);
    assert.equal(result.identity.role, "city-manager");
    assert.equal(result.identity.tenant, "bastrop_tx");
  });

  it("verifies a person provisioned with no role yet, and says so rather than refusing or guessing", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { payload: { sub: "person-new", iss: ISSUER, exp: now + 600 } });
    const result = await verifyStaffToken(token, baseEnv(), { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, true);
    assert.equal(result.identity.role, null);
    assert.match(result.identity.roleBasis, /no readable/);
  });
});

describe("staff-identity: every refusal is exercised on the real failing case, not asserted possible", () => {
  it("refuses an unknown issuer", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { payload: { sub: "u1", iss: "https://not-our-idp.example", exp: now + 600 } });
    const result = await verifyStaffToken(token, baseEnv(), { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, false);
    assert.equal(result.error, "unknown_issuer");
  });

  it("refuses an expired token", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { payload: { sub: "u1", iss: ISSUER, exp: now - 10 } });
    const result = await verifyStaffToken(token, baseEnv(), { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, false);
    assert.equal(result.error, "expired_token");
  });

  it("refuses a not-yet-valid token (nbf in the future)", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { payload: { sub: "u1", iss: ISSUER, exp: now + 600, nbf: now + 300 } });
    const result = await verifyStaffToken(token, baseEnv(), { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, false);
    assert.equal(result.error, "expired_token");
  });

  it("refuses alg:none outright, before any crypto operation runs", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { header: { alg: "none" }, payload: { sub: "u1", iss: ISSUER, exp: now + 600 } });
    const result = await verifyStaffToken(token, baseEnv(), { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, false);
    assert.equal(result.error, "unsupported_algorithm");
  });

  it("refuses a tampered payload even though the outer shape is still a valid JWT", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { payload: { sub: "u1", iss: ISSUER, exp: now + 600, role: "development-services" } });
    const [h, , s] = token.split(".");
    const forgedPayload = b64url(JSON.stringify({ sub: "u1", iss: ISSUER, exp: now + 600, role: "admin" }));
    const tampered = `${h}.${forgedPayload}.${s}`;
    const result = await verifyStaffToken(tampered, baseEnv(), { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_signature");
  });

  it("refuses a token signed by a DIFFERENT keypair than the one this issuer publishes", async () => {
    const { jwk } = makeKeypair(); // published key
    const attacker = makeKeypair(); // signs with a different key, same kid
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(attacker.privateKey, { payload: { sub: "u1", iss: ISSUER, exp: now + 600 } });
    const result = await verifyStaffToken(token, baseEnv(), { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_signature");
  });

  it("refuses an unknown kid (key rotated out) after attempting one refresh", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { header: { kid: "rotated-away" }, payload: { sub: "u1", iss: ISSUER, exp: now + 600 } });
    let fetchCount = 0;
    const fetchImpl = async (url) => {
      fetchCount++;
      return fakeFetch(jwk)(url);
    };
    const result = await verifyStaffToken(token, baseEnv(), { fetchImpl, jwksCache: new Map() });
    assert.equal(result.ok, false);
    assert.equal(result.error, "unknown_key");
    assert.ok(fetchCount >= 4, "expected discovery+jwks fetched at least twice (initial + forced refresh)");
  });

  it("refuses a malformed token that cannot be base64/JSON decoded", async () => {
    const result = await verifyStaffToken("not-base64.also-not-base64.zz", baseEnv(), {});
    assert.equal(result.ok, false);
    assert.equal(result.error, "malformed_token");
  });

  it("refuses a token with no sub claim", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { payload: { iss: ISSUER, exp: now + 600 } });
    const result = await verifyStaffToken(token, baseEnv(), { fetchImpl: fakeFetch(jwk), jwksCache: new Map() });
    assert.equal(result.ok, false);
    assert.equal(result.error, "malformed_token");
  });

  it("refuses when the injected revocation check reports the account disabled -- both directions, offboarding proven live", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { payload: { sub: "leaver", iss: ISSUER, exp: now + 600, role: "police" } });

    const revokedResult = await verifyStaffToken(token, baseEnv(), {
      fetchImpl: fakeFetch(jwk),
      jwksCache: new Map(),
      isRevoked: async (sub) => sub === "leaver",
    });
    assert.equal(revokedResult.ok, false);
    assert.equal(revokedResult.error, "revoked");

    const activeResult = await verifyStaffToken(token, baseEnv(), {
      fetchImpl: fakeFetch(jwk),
      jwksCache: new Map(),
      isRevoked: async (sub) => sub === "someone-else",
    });
    assert.equal(activeResult.ok, true, "a control observed only refusing has not been observed working");
  });

  it("propagates a revocation-check transport failure as a refusal, never as a silent accept", async () => {
    const { privateKey, jwk } = makeKeypair();
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(privateKey, { payload: { sub: "u1", iss: ISSUER, exp: now + 600 } });
    const result = await verifyStaffToken(token, baseEnv(), {
      fetchImpl: fakeFetch(jwk),
      jwksCache: new Map(),
      isRevoked: async () => {
        throw new Error("store unreachable");
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "revocation_check_failed");
  });
});
