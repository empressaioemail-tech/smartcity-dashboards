import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapRealFleetVehicleRecord,
  mapRealPatrolVehicleRecord,
  mapRealFireApparatusRecord,
  mapRealCipProjectRecord,
  mapRealCallSummaryRecord,
  composeRealFleetVehicles,
  composeRealPatrolVehicles,
  composeRealFireApparatus,
  composeRealCipProjects,
  composeRealCallAnalytics,
} from "./vendor-live.mjs";
import { getDomain } from "./domains.mjs";
import { BASTROP_TX } from "./city-pack.mjs";

describe("vendor-live (G-116 Phase 2 third batch)", () => {
  it("fleet-vehicles: maps a real Samsara row, origin feed, real (not fixture) status", () => {
    const record = mapRealFleetVehicleRecord(
      { id: "281474993899976", name: "FF-003", make: "RAM", model: "1500", vin: "1C6RR6FG6PS594295", tags: ["Fleet & Facilities"], stats: { engineState: "Off", odometerMiles: 12000 } },
      "bastrop_tx",
    );
    assert.equal(record.kind, "samsara");
    assert.equal(record.recordType, "fleet-vehicle");
    assert.equal(record.origin, "feed");
    assert.equal(record.fixture, undefined);
    assert.equal(record.unitLabel, "FF-003");
    assert.equal(record.status, "Off");
    assert.equal(record.department, "Fleet & Facilities");
  });

  it("patrol-vehicles: maps a real Spireon row, origin feed", () => {
    const record = mapRealPatrolVehicleRecord(
      { spireonId: "sp-1", name: "Unit 90", nspireStatus: "Stopped", address: "132 Grady Tuck Ln, Bastrop, TX", speed: 0 },
      "bastrop_tx",
    );
    assert.equal(record.kind, "spireon");
    assert.equal(record.recordType, "patrol-vehicle");
    assert.equal(record.origin, "feed");
    assert.equal(record.status, "Stopped");
    assert.equal(record.place.label, "132 Grady Tuck Ln, Bastrop, TX");
  });

  it("fire-apparatus: maps a real FirstDue row, origin feed", () => {
    const record = mapRealFireApparatusRecord({ id: "E1", name: "Engine 1", status: "in-service" }, "bastrop_tx");
    assert.equal(record.kind, "firstdue");
    assert.equal(record.recordType, "fire-apparatus");
    assert.equal(record.origin, "feed");
  });

  it("cip-projects: maps a real PowerBI row, origin feed", () => {
    const record = mapRealCipProjectRecord(
      { name: "Wastewater Treatment Plant #4", overallCompletion: 0.46, phases: [{ task: "Planning" }, { task: "Execution" }] },
      "bastrop_tx",
    );
    assert.equal(record.kind, "powerbi");
    assert.equal(record.recordType, "capital-project");
    assert.equal(record.origin, "feed");
    assert.equal(record.completion, 0.46);
    assert.equal(record.phaseCount, 2);
  });

  it("call-analytics: maps one aggregate record, no individual call detail", () => {
    const record = mapRealCallSummaryRecord({ totalCalls: 40, answeredCalls: 35, missedCalls: 5, answerRate: 88 }, "bastrop_tx");
    assert.equal(record.kind, "goto");
    assert.equal(record.recordType, "call-volume");
    assert.equal(record.origin, "feed");
    assert.equal(record.callsAnswered, 35);
    assert.equal(record.callsOffered, 40);
    // No callerRef, no recording, no extension-to-person mapping -- see module header.
    assert.equal("callerRef" in record, false);
    assert.equal("recording" in record, false);
  });

  const composeCases = [
    { id: "fleet-vehicles", compose: composeRealFleetVehicles, listKey: "vehicles" },
    { id: "patrol-vehicles", compose: composeRealPatrolVehicles, listKey: "vehicles" },
    { id: "fire-apparatus", compose: composeRealFireApparatus, listKey: "apparatus" },
    { id: "cip-projects", compose: composeRealCipProjects, listKey: "projects" },
  ];

  for (const { id, compose, listKey } of composeCases) {
    describe(id, () => {
      it("fails closed when PLATFORM_INTERNAL_API_KEY is unset", async () => {
        const domain = getDomain(id);
        const out = await compose(BASTROP_TX, domain, { env: {} });
        assert.equal(out.status, "unavailable");
        assert.match(out.basis, /PLATFORM_INTERNAL_API_KEY unset/);
      });

      it("returns real records with source live on success", async () => {
        const fetchImpl = async () => ({ ok: true, json: async () => ({ [listKey]: [{ id: "x", name: "x" }], contract: "live" }) });
        const domain = getDomain(id);
        const out = await compose(BASTROP_TX, domain, { env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl });
        assert.equal(out.source, "live");
        assert.equal(out.status, "ok");
        assert.equal(out.recordCount, 1);
        assert.equal(out.records[0].origin, "feed");
        // G-116 close: the tile strip reads this, not extras.metrics -- see
        // web/app.js's renderRealStatusTiles. Missing it is what shipped the
        // "Not read" tiles on a page full of real records.
        assert.ok(Array.isArray(out.extras.realStatusCounts), "extras.realStatusCounts must be an array");
        assert.deepEqual(out.extras.realStatusCounts, [{ status: out.records[0].status || "unknown", count: 1 }]);
      });

      it("honestly surfaces a real vendor-side unavailable state (e.g. permission/auth), not a crash", async () => {
        const fetchImpl = async () => ({
          ok: false,
          status: 503,
          json: async () => ({ error: "permission_required", message: "current API credentials do not have access" }),
        });
        const domain = getDomain(id);
        const out = await compose(BASTROP_TX, domain, { env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl });
        assert.equal(out.status, "unavailable");
        assert.match(out.basis, /current API credentials do not have access/);
      });
    });
  }

  describe("call-analytics compose", () => {
    it("returns exactly one aggregate record on success, not a fabricated per-queue breakdown", async () => {
      const fetchImpl = async () => ({
        ok: true,
        json: async () => ({ summary: { totalCalls: 10, answeredCalls: 9, missedCalls: 1, answerRate: 90 }, contract: "aggregate" }),
      });
      const domain = getDomain("call-analytics");
      const out = await composeRealCallAnalytics(BASTROP_TX, domain, { env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl });
      assert.equal(out.recordCount, 1);
      assert.equal(out.records[0].callsAnswered, 9);
    });

    it("honestly surfaces goto_not_authorized rather than a crash", async () => {
      const fetchImpl = async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: "goto_not_authorized", needsAuth: true }),
      });
      const domain = getDomain("call-analytics");
      const out = await composeRealCallAnalytics(BASTROP_TX, domain, { env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl });
      assert.equal(out.status, "unavailable");
      assert.match(out.basis, /goto_not_authorized/);
    });
  });
});
