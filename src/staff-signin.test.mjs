import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateState,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  serializeCookie,
  clearCookie,
} from "./staff-signin.mjs";

function baseEnv() {
  return {
    WORKOS_CLIENT_ID: "client_01ABC",
    WORKOS_REDIRECT_URI: "https://dashboards.example/auth/callback",
    WORKOS_API_KEY: "sk_test_secret",
  };
}

describe("staff-signin: generateState", () => {
  it("generates a non-trivial, different value every call", () => {
    const a = generateState();
    const b = generateState();
    assert.notEqual(a, b);
    assert.ok(a.length >= 20);
  });
});

describe("staff-signin: buildAuthorizeUrl", () => {
  it("refuses to build a URL when WORKOS_CLIENT_ID is unset -- never redirects to a broken destination", () => {
    assert.throws(() => buildAuthorizeUrl({ WORKOS_REDIRECT_URI: "https://x/callback" }, "s1"), /WORKOS_CLIENT_ID/);
  });

  it("refuses to build a URL when WORKOS_REDIRECT_URI is unset", () => {
    assert.throws(() => buildAuthorizeUrl({ WORKOS_CLIENT_ID: "c1" }, "s1"), /WORKOS_REDIRECT_URI/);
  });

  it("carries client_id, redirect_uri, state, and a sign-in-only screen hint (self-registration off)", () => {
    const url = new URL(buildAuthorizeUrl(baseEnv(), "the-state-value"));
    assert.equal(url.searchParams.get("client_id"), "client_01ABC");
    assert.equal(url.searchParams.get("redirect_uri"), "https://dashboards.example/auth/callback");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("screen_hint"), "sign-in");
    assert.equal(url.searchParams.get("state"), "the-state-value");
  });

  it("respects WORKOS_API_BASE_URL for pointing at a non-default API host", () => {
    const url = buildAuthorizeUrl({ ...baseEnv(), WORKOS_API_BASE_URL: "https://workos.test" }, "s1");
    assert.ok(url.startsWith("https://workos.test/"));
  });
});

describe("staff-signin: exchangeCodeForToken", () => {
  it("returns the access_token on a successful exchange", async () => {
    const fetchImpl = async (url, init) => {
      assert.ok(String(url).endsWith("/user_management/authenticate"));
      const body = JSON.parse(init.body);
      assert.equal(body.grant_type, "authorization_code");
      assert.equal(body.code, "the-code");
      assert.equal(body.client_id, "client_01ABC");
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "eyJ.abc.def" }) };
    };
    const token = await exchangeCodeForToken("the-code", baseEnv(), { fetchImpl });
    assert.equal(token, "eyJ.abc.def");
  });

  it("throws, never returns a falsy token silently, when WorkOS reports an error", async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ message: "invalid_grant" }) });
    await assert.rejects(() => exchangeCodeForToken("bad-code", baseEnv(), { fetchImpl }), /invalid_grant/);
  });

  it("throws when WorkOS returns 200 but no access_token -- fails closed on a malformed success", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ user: { id: "u1" } }) });
    await assert.rejects(() => exchangeCodeForToken("the-code", baseEnv(), { fetchImpl }), /no access_token/);
  });
});

describe("staff-signin: cookie serialization", () => {
  it("session cookie is HttpOnly, Secure, SameSite=Lax, and a browser-session cookie (no Max-Age) by default", () => {
    const cookie = serializeCookie("sc_staff_token", "the-token-value");
    assert.match(cookie, /^sc_staff_token=the-token-value;/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Max-Age/);
  });

  it("accepts an explicit maxAgeSeconds for the short-lived state cookie", () => {
    const cookie = serializeCookie("sc_signin_state", "abc", { maxAgeSeconds: 600 });
    assert.match(cookie, /Max-Age=600/);
  });

  it("URL-encodes the cookie value", () => {
    const cookie = serializeCookie("k", "a b;c");
    assert.match(cookie, /^k=a%20b%3Bc;/);
  });

  it("clearCookie expires immediately", () => {
    assert.match(clearCookie("sc_staff_token"), /Max-Age=0/);
  });
});
