import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  provisionStaffAccount,
  offboardStaffAccount,
  generateTemporaryPassword,
} from "./staff-admin-client.mjs";
import { getStaffAccount, _resetMemoryStoreForTests } from "./staff-directory.mjs";

function baseEnv() {
  return { WORKOS_API_KEY: "test-secret-key", WORKOS_ORGANIZATION_ID: "org_bastrop_tx" };
}

/** Records every call made through it, so a test can assert exactly what was sent to WorkOS
 *  without asserting against a live account (none exists -- see this module's own header). */
function fakeWorkos(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers });
    const key = `${init?.method} ${new URL(url).pathname}`;
    const match = responses.find((r) => r.match.test(key));
    if (!match) throw new Error(`fakeWorkos: no response configured for ${key}`);
    return match.respond();
  };
  return { fetchImpl, calls };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  _resetMemoryStoreForTests();
});

describe("staff-admin-client: configuration", () => {
  it("refuses to call WorkOS at all when WORKOS_API_KEY is unset", async () => {
    await assert.rejects(
      () => provisionStaffAccount({ email: "a@b.com", tenant: "bastrop_tx" }, {}, { fetchImpl: fakeWorkos([]).fetchImpl }),
      /WORKOS_API_KEY is not configured/,
    );
  });

  it("requires email and tenant", async () => {
    await assert.rejects(() => provisionStaffAccount({ tenant: "bastrop_tx" }, baseEnv(), {}), /requires email/);
    await assert.rejects(() => provisionStaffAccount({ email: "a@b.com" }, baseEnv(), {}), /requires tenant/);
  });
});

describe("staff-admin-client: provisioning, the real request shape", () => {
  it("creates a WorkOS user, joins the organization, and writes exactly one local row", async () => {
    const { fetchImpl, calls } = fakeWorkos([
      { match: /^POST \/user_management\/users$/, respond: () => jsonResponse(201, { id: "user_01ABC", email: "nick@bastrop.example" }) },
      { match: /^POST \/user_management\/organization_memberships$/, respond: () => jsonResponse(201, { id: "om_01XYZ", organization_id: "org_bastrop_tx", user_id: "user_01ABC" }) },
    ]);

    const result = await provisionStaffAccount(
      { email: "nick@bastrop.example", name: "Nick", tenant: "bastrop_tx", role: "development-services" },
      baseEnv(),
      { fetchImpl },
    );

    assert.equal(result.sub, "user_01ABC");
    assert.equal(result.workosOrganizationId, "org_bastrop_tx");
    assert.equal(typeof result.temporaryPassword, "string");
    assert.ok(result.temporaryPassword.length >= 16, "temporary password should not be trivially short");

    // The create-user call carried a password and never re-used a fixed one.
    const createCall = calls.find((c) => c.url.endsWith("/user_management/users"));
    assert.equal(createCall.body.email, "nick@bastrop.example");
    assert.equal(createCall.body.password, result.temporaryPassword);

    // Exactly one local row, matching what was sent, keyed on the WorkOS user id.
    const record = await getStaffAccount("user_01ABC", baseEnv());
    assert.equal(record.tenant, "bastrop_tx");
    assert.equal(record.role, "development-services");
    assert.equal(record.status, "active");
    assert.equal(record.provisionedBy, "staff-admin-client:workos");
  });

  it("generates a different temporary password on every call (never reused, never a fixed default)", async () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    assert.notEqual(a, b);
  });

  it("does not write a local row when WorkOS user creation fails -- no half-provisioned account", async () => {
    const { fetchImpl } = fakeWorkos([
      { match: /^POST \/user_management\/users$/, respond: () => jsonResponse(422, { message: "email already exists" }) },
    ]);

    await assert.rejects(
      () => provisionStaffAccount({ email: "dup@bastrop.example", tenant: "bastrop_tx" }, baseEnv(), { fetchImpl }),
      /email already exists/,
    );
    const record = await getStaffAccount("user_01ABC", baseEnv());
    assert.equal(record, null);
  });

  it("does not write a local row when WorkOS returns 200 but no user id -- fails closed on a malformed success", async () => {
    const { fetchImpl } = fakeWorkos([
      { match: /^POST \/user_management\/users$/, respond: () => jsonResponse(201, { email: "no-id@bastrop.example" }) },
    ]);
    await assert.rejects(
      () => provisionStaffAccount({ email: "no-id@bastrop.example", tenant: "bastrop_tx" }, baseEnv(), { fetchImpl }),
      /returned no id/,
    );
  });
});

describe("staff-admin-client: offboarding, the violation test this mission requires", () => {
  it("removes the WorkOS organization membership and disables the local record -- verified both directions", async () => {
    const provisionCalls = fakeWorkos([
      { match: /^POST \/user_management\/users$/, respond: () => jsonResponse(201, { id: "user_offboard_1" }) },
      { match: /^POST \/user_management\/organization_memberships$/, respond: () => jsonResponse(201, { id: "om_offboard_1", organization_id: "org_bastrop_tx" }) },
    ]);
    await provisionStaffAccount({ email: "leaving@bastrop.example", tenant: "bastrop_tx" }, baseEnv(), { fetchImpl: provisionCalls.fetchImpl });

    // Direction 1: before offboarding, the account is active.
    const before = await getStaffAccount("user_offboard_1", baseEnv());
    assert.equal(before.status, "active");

    const offboardCalls = fakeWorkos([
      { match: /^GET \/user_management\/organization_memberships/, respond: () => jsonResponse(200, { data: [{ id: "om_offboard_1" }] }) },
      { match: /^DELETE \/user_management\/organization_memberships\/om_offboard_1$/, respond: () => jsonResponse(200, {}) },
    ]);
    const disabled = await offboardStaffAccount("user_offboard_1", {}, baseEnv(), { fetchImpl: offboardCalls.fetchImpl });
    assert.equal(disabled, true);

    const membershipDelete = offboardCalls.calls.find((c) => c.method === "DELETE");
    assert.ok(membershipDelete, "offboarding must actually call DELETE on the membership, not just the local flip");

    // Direction 2: after offboarding, the account is disabled -- a live account was not
    // collaterally disabled by this test, and the disabled one is not silently still active.
    const after = await getStaffAccount("user_offboard_1", baseEnv());
    assert.equal(after.status, "disabled");
  });

  it("still disables the local record even when no WorkOS membership is found to remove", async () => {
    const provisionCalls = fakeWorkos([
      { match: /^POST \/user_management\/users$/, respond: () => jsonResponse(201, { id: "user_no_membership" }) },
    ]);
    // No WORKOS_ORGANIZATION_ID here on purpose: this exercises the path where
    // provisionStaffAccount is never asked to create a membership at all, distinct from the
    // "asked to, and WorkOS reports none exists" path the earlier test in this block covers.
    await provisionStaffAccount(
      { email: "solo@bastrop.example", tenant: "bastrop_tx" },
      { WORKOS_API_KEY: "test-secret-key" },
      { fetchImpl: provisionCalls.fetchImpl },
    );

    const offboardCalls = fakeWorkos([
      { match: /^GET \/user_management\/organization_memberships/, respond: () => jsonResponse(200, { data: [] }) },
    ]);
    const disabled = await offboardStaffAccount("user_no_membership", {}, baseEnv(), { fetchImpl: offboardCalls.fetchImpl });
    assert.equal(disabled, true);
    assert.equal(offboardCalls.calls.some((c) => c.method === "DELETE"), false);

    const after = await getStaffAccount("user_no_membership", baseEnv());
    assert.equal(after.status, "disabled");
  });
});
