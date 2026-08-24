import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  atomVisibleToCaller,
  callerIsPackSubject,
  canReadPack,
  packReadStatus,
  resolveAtomAccessPolicy,
  resolveCaller,
} from "./tenancy.mjs";
import { FIXTURE_CITY, TEMPLATE_CITY } from "./city-pack.mjs";

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
