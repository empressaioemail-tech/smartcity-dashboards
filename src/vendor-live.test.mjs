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

  // G-116 fleet-enrich: DVIR summary, 7-day safety event count, high-mileage
  // and low-fuel threshold flags -- all sourced from the same platform
  // route (server/routes/samsara.ts), reusing fetchDvirs()/
  // fetchSafetyEvents() rather than a second live call this product makes
  // itself.
  it("fleet-vehicles: maps real DVIR/safety/threshold fields when the platform route reports them", () => {
    const record = mapRealFleetVehicleRecord(
      {
        id: "v1",
        name: "FF-003",
        stats: { odometerMiles: 145000, fuelPercent: 12, highMileage: true, lowFuel: true },
        dvir: { unresolvedDefectCount: 2, lastInspection: "2026-08-30T00:00:00Z" },
        safetyEvents7d: 3,
      },
      "bastrop_tx",
    );
    assert.equal(record.dvirUnresolvedDefects, 2);
    assert.equal(record.dvirLastInspection, "2026-08-30T00:00:00Z");
    assert.equal(record.safetyEvents7d, 3);
    assert.equal(record.highMileage, true);
    assert.equal(record.lowFuel, true);
  });

  it("fleet-vehicles: real fields absent (never fabricated) when the platform route has no DVIR/safety/threshold data for a vehicle", () => {
    const record = mapRealFleetVehicleRecord(
      { id: "v2", name: "FF-004", stats: { odometerMiles: 5000 } },
      "bastrop_tx",
    );
    assert.equal(record.dvirUnresolvedDefects, null);
    assert.equal(record.dvirLastInspection, null);
    assert.equal(record.safetyEvents7d, null);
    assert.equal(record.highMileage, null);
    assert.equal(record.lowFuel, null);
  });

  it("fleet-vehicles: a real zero unresolved-defect count and a real zero safety-event count are kept, not treated as missing", () => {
    const record = mapRealFleetVehicleRecord(
      {
        id: "v3",
        name: "FF-005",
        stats: { odometerMiles: 5000, highMileage: false, lowFuel: false },
        dvir: { unresolvedDefectCount: 0, lastInspection: "2026-08-01T00:00:00Z" },
        safetyEvents7d: 0,
      },
      "bastrop_tx",
    );
    assert.equal(record.dvirUnresolvedDefects, 0);
    assert.equal(record.safetyEvents7d, 0);
    assert.equal(record.highMileage, false);
    assert.equal(record.lowFuel, false);
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

  it("patrol-vehicles: maps the platform route's enrichment fields (NSpire active state, maintenance/alert counts)", () => {
    const record = mapRealPatrolVehicleRecord(
      {
        spireonId: "sp-9",
        name: "Retired Unit 9",
        nspireStatus: "Stopped",
        active: false,
        maintenanceAlertCount: 2,
        recentAlertCount: 5,
      },
      "bastrop_tx",
    );
    assert.equal(record.activeInNspire, false);
    assert.equal(record.maintenanceAlertCount, 2);
    assert.equal(record.recentAlertCount, 5);
  });

  it("patrol-vehicles: a genuine zero alert count is not confused with the field being absent", () => {
    const zero = mapRealPatrolVehicleRecord(
      { spireonId: "sp-2", name: "Unit 2", active: true, maintenanceAlertCount: 0, recentAlertCount: 0 },
      "bastrop_tx",
    );
    assert.equal(zero.maintenanceAlertCount, 0);
    assert.equal(zero.recentAlertCount, 0);

    const absent = mapRealPatrolVehicleRecord({ spireonId: "sp-3", name: "Unit 3" }, "bastrop_tx");
    assert.equal(absent.activeInNspire, null);
    assert.equal(absent.maintenanceAlertCount, null);
    assert.equal(absent.recentAlertCount, null);
  });

  it("patrol-vehicles compose: requests include_inactive=true so 'Inactive in NSpire' is observable at all", async () => {
    let requestedUrl = null;
    const fetchImpl = async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ vehicles: [], contract: "live" }) };
    };
    const domain = getDomain("patrol-vehicles");
    await composeRealPatrolVehicles(BASTROP_TX, domain, { env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl });
    assert.match(requestedUrl, /\/api\/platform\/spireon\/vehicles\?include_inactive=true$/);
  });

  it("fire-apparatus: maps a real FirstDue row, origin feed", () => {
    const record = mapRealFireApparatusRecord({ id: "E1", name: "Engine 1", status: "in-service" }, "bastrop_tx");
    assert.equal(record.kind, "firstdue");
    assert.equal(record.recordType, "fire-apparatus");
    assert.equal(record.origin, "feed");
  });

  it("fire-apparatus: maps apparatusType/stationLabel when the row carries them", () => {
    // Constructed sample payload -- the live apparatus endpoint is still
    // 403'd (see the module header), so this shape is not live-verified. It
    // mirrors the field names smartcity-os's own EmergencyResponse.tsx
    // already reads for this same unverified resource (item.type, item.station).
    const record = mapRealFireApparatusRecord(
      { id: "E1", name: "Engine 1", status: "in-service", type: "Engine", station: "Station 2" },
      "bastrop_tx",
    );
    assert.equal(record.apparatusType, "Engine");
    assert.equal(record.stationLabel, "Station 2");
  });

  it("fire-apparatus: apparatusType/stationLabel/unitLabel try snake_case vendor fallbacks", () => {
    const record = mapRealFireApparatusRecord(
      { id: "E2", unit_name: "Ladder 12", status: "in-service", apparatus_type: "Ladder", station_name: "Station 1" },
      "bastrop_tx",
    );
    assert.equal(record.unitLabel, "Ladder 12");
    assert.equal(record.apparatusType, "Ladder");
    assert.equal(record.stationLabel, "Station 1");
  });

  it("fire-apparatus: apparatusType/stationLabel are null (never invented) when the row lacks them", () => {
    const record = mapRealFireApparatusRecord({ id: "E3", name: "Rescue 1", status: "in-service" }, "bastrop_tx");
    assert.equal(record.apparatusType, null);
    assert.equal(record.stationLabel, null);
    // No occupancy/pre-plan fields fabricated onto an apparatus record.
    assert.equal("businessName" in record, false);
    assert.equal("isTargetHazard" in record, false);
    assert.equal("constructionClass" in record, false);
  });

  it("cip-projects: maps a real PowerBI row, origin feed", () => {
    const record = mapRealCipProjectRecord(
      {
        name: "Wastewater Treatment Plant #4",
        overallCompletion: 0.46,
        currentPhase: "Execution",
        status: "in-progress",
        phases: [
          { task: "Planning", phaseStart: "2026-01-01T00:00:00Z", phaseEnd: "2026-02-28T00:00:00Z", completion: 1, taskDuration: 58 },
          { task: "Execution", phaseStart: "2026-03-01T00:00:00Z", phaseEnd: "2026-09-01T00:00:00Z", completion: 0.46, taskDuration: 184 },
        ],
      },
      "bastrop_tx",
    );
    assert.equal(record.kind, "powerbi");
    assert.equal(record.recordType, "capital-project");
    assert.equal(record.origin, "feed");
    assert.equal(record.completion, 0.46);
    assert.equal(record.phaseCount, 2);
    // G-116 CIP enrichment: real currentPhase/status, kept as-is (no forced
    // taxonomy -- see the module header and mapRealCipProjectRecord).
    assert.equal(record.currentPhase, "Execution");
    assert.equal(record.status, "in-progress");
    // The real per-task Gantt rows getCIPProjectData() computes, passed
    // through unchanged.
    assert.deepEqual(record.phases, [
      { task: "Planning", phaseStart: "2026-01-01T00:00:00Z", phaseEnd: "2026-02-28T00:00:00Z", completion: 1, taskDuration: 58 },
      { task: "Execution", phaseStart: "2026-03-01T00:00:00Z", phaseEnd: "2026-09-01T00:00:00Z", completion: 0.46, taskDuration: 184 },
    ]);
  });

  it("cip-projects: a real row with no phases/status/currentPhase degrades gracefully, no fabrication", () => {
    const record = mapRealCipProjectRecord({ name: "Sidewalk Connectivity" }, "bastrop_tx");
    assert.equal(record.currentPhase, null);
    assert.equal(record.status, "unknown");
    assert.deepEqual(record.phases, []);
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
