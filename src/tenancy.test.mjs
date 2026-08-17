import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  atomVisibleToCaller,
  canReadPack,
  packReadStatus,
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
});
