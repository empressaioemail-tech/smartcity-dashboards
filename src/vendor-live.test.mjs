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
import { assertRecordShape, recordShapeFaults, LIVE_STATUS_TRANSLATIONS, LIVE_STATUS_TRANSLATION_BASIS } from "./adapters.mjs";
import { generateFleetRecords, odometerBandFor } from "./domains/fleet-vehicles.mjs";
import { generatePatrolRecords } from "./domains/patrol-vehicles.mjs";

/**
 * D-13.1. A live platform read now requires a configured base. These tests
 * assert the ROUTE they read (see the include_inactive test below), so the
 * base they name is a fixture host, not production's.
 */
const ENV = { PLATFORM_INTERNAL_API_KEY: "test-key", SMARTCITY_V1_PLATFORM_BASE: "https://platform.test" };

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
    await composeRealPatrolVehicles(BASTROP_TX, domain, { env: ENV, fetchImpl });
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
    {
      id: "fleet-vehicles", compose: composeRealFleetVehicles, listKey: "vehicles", guarded: true,
      /**
       * THE PLANT, AND WHAT PARCEL 2 CHANGED ABOUT IT. Before parcel 2 the row
       * below was refused on three faults. It is still refused, now on ONE: no
       * odometer reading arrived and odometerBand has no declared-absence escape.
       * The other two clauses became satisfiable BY STATING THE ABSENCE, which is
       * the change parcel 2 makes -- so the plant moved to the clause that must
       * keep refusing a row with nothing behind it.
       */
      plant: [{ id: "x", name: "x" }],
      plantRefuses: true,
    },
    {
      id: "patrol-vehicles", compose: composeRealPatrolVehicles, listKey: "vehicles", guarded: true,
      /**
       * PATROL'S PLANT NO LONGER REFUSES, AND THAT IS THE MEASURED RESULT RATHER
       * THAN A HOLE. Every field the patrol shape declares is either carried from
       * the read verbatim or stated as an absence with its basis, so the mapper is
       * total over the declared shape and NO vendor row can produce a violating
       * record -- including this empty one. The clause is therefore proven to fire
       * at the guard level instead (see the G-153 defect 1 block's planted
       * violations), and what this row proves here is the other direction: the
       * route's own fallback word `Unknown` reaches the surface as a STATED
       * ABSENCE, never as a state.
       */
      plant: [{ id: "x", name: "x", nspireStatus: "Unknown" }],
      plantRefuses: false,
    },
    { id: "fire-apparatus", compose: composeRealFireApparatus, listKey: "apparatus", guarded: false },
    { id: "cip-projects", compose: composeRealCipProjects, listKey: "projects", guarded: false },
  ];

  for (const { id, compose, listKey, guarded, plant, plantRefuses } of composeCases) {
    describe(id, () => {
      it("fails closed when PLATFORM_INTERNAL_API_KEY is unset", async () => {
        const domain = getDomain(id);
        const out = await compose(BASTROP_TX, domain, { env: {} });
        assert.equal(out.status, "unavailable");
        assert.match(out.basis, /PLATFORM_INTERNAL_API_KEY unset/);
      });

      /**
       * G-153 defect 1. The two GUARDED composers no longer serve an arbitrary
       * vendor row: the stub below is nothing like a conforming record, and it is
       * refused with its faults rather than validated-and-served or patched into
       * shape. That is the behaviour the row asked for and it is asserted here so
       * a later change that quietly drops the guard fails a test.
       */
      if (guarded) {
        it("refuses a row that does not satisfy the declared shape, and counts it", async () => {
          const fetchImpl = async () => ({ ok: true, json: async () => ({ [listKey]: plant, contract: "live" }) });
          const domain = getDomain(id);
          const out = await compose(BASTROP_TX, domain, { env: ENV, fetchImpl });
          assert.equal(out.source, "live");
          if (!plantRefuses) {
            // See this case's own comment above: the plant is now servable, and what
            // must be true is that nothing was invented to make it so.
            assert.equal(out.status, "ok");
            assert.equal(out.recordCount, 1);
            const record = out.records[0];
            assert.equal(record.status, null, "the route's fallback word is an absence, not a state");
            assert.match(record.statusBasis, /no NSpire status/);
            assert.equal(record.operatorRef, null);
            assert.ok(record.operatorBasis.trim(), "the absence is stated, not blank");
            assert.deepEqual(out.extras.realStatusCounts, []);
            assert.equal(out.extras.statusNotReported, 1);
            return;
          }
          // G-153: a refusal is its OWN status, not `unavailable`. The read
          // succeeded and the guard is what refused, so the region must not say
          // the source could not be read -- those are different sentences to a
          // city, and web/app.js gives each its own head.
          assert.equal(out.status, "refused");
          assert.equal(out.recordCount, 0);
          assert.deepEqual(out.records, []);
          assert.equal(out.extras.refusalCount, 1);
          assert.ok(out.extras.refusalFaults.length >= 1);
          assert.match(out.basis, /refused by the record-shape guard/);
          // NOT granted-empty: the vendor answered, and a count of zero there
          // would be a statement about the vendor rather than about the record.
          assert.match(out.countingRule, /refused by assertRecordShape/);
        });
      } else {
        it("returns real records with source live on success", async () => {
          const fetchImpl = async () => ({ ok: true, json: async () => ({ [listKey]: [{ id: "x", name: "x" }], contract: "live" }) });
          const domain = getDomain(id);
          const out = await compose(BASTROP_TX, domain, { env: ENV, fetchImpl });
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
      }

      it("honestly surfaces a real vendor-side unavailable state (e.g. permission/auth), not a crash", async () => {
        const fetchImpl = async () => ({
          ok: false,
          status: 503,
          json: async () => ({ error: "permission_required", message: "current API credentials do not have access" }),
        });
        const domain = getDomain(id);
        const out = await compose(BASTROP_TX, domain, { env: ENV, fetchImpl });
        assert.equal(out.status, "unavailable");
        assert.match(out.basis, /current API credentials do not have access/);
      });
    });
  }

  /**
   * G-153 DEFECT 1, AND THE INSTRUMENT IS THE REAL RECORD, NOT A FIXTURE.
   *
   * The row below is the shape the platform route returns for Bastrop
   * (`/api/platform/samsara/vehicles`): the same fields the live-verification
   * dump captured on 2026-09-17. Nothing about it is invented for the test.
   */
  describe("record-shape guard on the live path (G-153 defect 1)", () => {
    const REAL_SAMSARA_ROW = {
      id: "vehicle-1",
      name: "Unit 12",
      make: "Ford",
      model: "F-150",
      vin: "1FTFW1E50NF000000",
      tags: ["Public Works"],
      stats: { engineState: "Off", odometerMiles: 41022, fuelPercent: 62, highMileage: false, lowFuel: false },
      dvir: { unresolvedDefectCount: 0, lastInspection: "2026-09-01" },
      safetyEvents7d: 0,
    };
    /**
     * THE PRE-FIX FAULT TEXTS, KEPT SO THE FINDING THIS PARCEL ANSWERS STAYS
     * READABLE IN THE SUITE THAT MEASURED IT. They are no longer what this row
     * produces -- that is the point of parcel 2 -- and they are still the exact
     * strings the deployed build produced over the same row, so a future
     * regression that reintroduces the mapper's fallback token is caught against
     * the text it was caught on the first time.
     */
    const PREFIX_FAULTS = [
      "status must be one of out-of-service, inspection-due, in-shop, in-service",
      "fleet-vehicle requires operatorRef",
      "fleet-vehicle requires odometerBand",
    ];

    it("the live Samsara row now PASSES: the vendor's own state is carried, and no band is invented", () => {
      const record = mapRealFleetVehicleRecord(REAL_SAMSARA_ROW, "bastrop_tx");
      assert.deepEqual(recordShapeFaults(record), []);
      assert.equal(assertRecordShape(record), true);
      // The vendor's engine state, verbatim -- not one of this product's four bands,
      // and specifically not `unknown`, which the pre-fix mapper minted here.
      assert.equal(record.status, "Off");
      assert.equal(PREFIX_FAULTS.includes(`${record.status} must be one of`), false);
    });

    it("carries an explicit, non-empty basis for each field the read does not supply", () => {
      const record = mapRealFleetVehicleRecord(REAL_SAMSARA_ROW, "bastrop_tx");
      assert.equal(record.operatorRef, null, "no reference is minted without an operator identity");
      assert.match(record.operatorBasis, /no operator identity|does not carry/i);
      assert.equal(record.statusBasis, null, "a state WAS carried, so there is no absence to state");
    });

    it("derives odometerBand from the reading that is actually in the read", () => {
      const record = mapRealFleetVehicleRecord(REAL_SAMSARA_ROW, "bastrop_tx");
      assert.equal(record.odometerMiles, 41022);
      assert.equal(record.odometerBand, odometerBandFor(41022));
      assert.equal(record.odometerBand, "20k to 60k miles");
    });

    /**
     * THE PLANTED VIOLATIONS, IN ALL FOUR DIRECTIONS. A guard that passes
     * everything after a change is indistinguishable from a deleted guard, so each
     * clause parcel 2 touched is shown able to FIRE by handing it a record built
     * to violate exactly that clause -- and the fault text is asserted, not merely
     * its presence.
     */
    it("still REFUSES a live record that carries the fallback token as if it were a state", () => {
      const planted = { ...mapRealFleetVehicleRecord(REAL_SAMSARA_ROW, "bastrop_tx"), status: "unknown" };
      const faults = recordShapeFaults(planted);
      assert.equal(faults.length, 1);
      assert.match(faults[0], /status carries "unknown"/);
      assert.match(faults[0], /absence of a vendor state rather than one/);
      assert.match(faults[0], /state statusBasis/);
    });

    it("still REFUSES a live record that asserts one of this product's bands with no translation", () => {
      const planted = { ...mapRealFleetVehicleRecord(REAL_SAMSARA_ROW, "bastrop_tx"), status: "in-service" };
      const faults = recordShapeFaults(planted);
      assert.equal(faults.length, 1);
      assert.match(faults[0], /status asserts the product band "in-service" on a live fleet-vehicle/);
      assert.match(faults[0], /no declared translation/);
      // The table really is empty: the refusal is not an artefact of a missing row
      // that a future edit could add by accident.
      assert.deepEqual(LIVE_STATUS_TRANSLATIONS, { samsara: {}, spireon: {} });
    });

    it("still REFUSES a bare absent operatorRef, and the fault now names the basis requirement", () => {
      const planted = { ...mapRealFleetVehicleRecord(REAL_SAMSARA_ROW, "bastrop_tx"), operatorRef: null, operatorBasis: null };
      assert.deepEqual(recordShapeFaults(planted), [
        "fleet-vehicle requires operatorRef, or operatorBasis stating why this read does not carry it",
      ]);
    });

    it("still REFUSES an absent odometerBand, which has no declared-absence escape", () => {
      const planted = { ...mapRealFleetVehicleRecord(REAL_SAMSARA_ROW, "bastrop_tx"), odometerBand: null };
      assert.deepEqual(recordShapeFaults(planted), ["fleet-vehicle requires odometerBand"]);
    });

    it("the live record used to be served: the raw reading and the inventory field set are still on it", () => {
      const record = mapRealFleetVehicleRecord(REAL_SAMSARA_ROW, "bastrop_tx");
      // The undeclared field set that made this a defect rather than a nuisance:
      // an inventory-shaped record arriving on the cutover that drops the one
      // sentence saying a vehicle is not an inventory node.
      const undeclared = ["vin", "make", "model", "odometerMiles", "fuelPercent", "department",
        "dvirUnresolvedDefects", "dvirLastInspection", "safetyEvents7d", "highMileage", "lowFuel"];
      const declared = new Set(["recordId", "kind", "recordType", "cityKey", "origin", "accessPolicy",
        "provenance", "unitLabel", "status", "statusBasis", "operatorRef", "operatorBasis", "odometerBand",
        "operatorName"]);
      for (const key of undeclared) {
        assert.ok(key in record, `${key} is no longer on the live record`);
        assert.equal(declared.has(key), false, `${key} is now declared; move it out of this list`);
      }
      assert.equal(record.operatorRef, null, "no reference is minted without an operator identity");
    });

    it("the composer SERVES the row, and still refuses one whose reading never arrived", async () => {
      const served = async () => ({ ok: true, json: async () => ({ vehicles: [REAL_SAMSARA_ROW], contract: "live" }) });
      const out = await composeRealFleetVehicles(BASTROP_TX, getDomain("fleet-vehicles"), { env: ENV, fetchImpl: served });
      assert.equal(out.status, "ok");
      assert.equal(out.recordCount, 1);
      assert.equal("refusalCount" in out.extras, false, "nothing refused, so no refusal count is reported");
      assert.deepEqual(out.extras.realStatusCounts, [{ status: "Off", count: 1 }],
        "the vendor's own state is counted as what it is, not relabelled onto a band");
      assert.equal(out.extras.statusNotReported, 0, "this row DID report a state; Off is one");

      // The plant at the level that matters: the SAME composer, a row whose odometer
      // reading is absent. odometerBand has no escape, so the read refuses and says so.
      const noReading = { ...REAL_SAMSARA_ROW, stats: { engineState: "Off" } };
      const planted = async () => ({ ok: true, json: async () => ({ vehicles: [noReading], contract: "live" }) });
      const refused = await composeRealFleetVehicles(BASTROP_TX, getDomain("fleet-vehicles"), { env: ENV, fetchImpl: planted });
      assert.equal(refused.status, "refused");
      assert.notEqual(refused.status, "granted-empty");
      assert.notEqual(refused.status, "unavailable");
      assert.equal(refused.recordCount, 0);
      assert.deepEqual(refused.records, []);
      assert.equal(refused.extras.refusalCount, 1);
      assert.deepEqual(refused.extras.refusalFaults, ["fleet-vehicle requires odometerBand"]);
      assert.match(refused.basis, /refused by the record-shape guard/);

      /**
       * THE PARTIAL CASE, which is the live one: 72 of 75 real rows carry an
       * odometer reading and three do not. The region serves records and refuses
       * records in the same read, so the refusal has to reach the surface from a
       * route that is NOT refusedResult -- and it has to name its fault there
       * too, or the only place the three missing vehicles are accounted for is a
       * count with no reason beside it.
       */
      const mixed = async () => ({ ok: true, json: async () => ({ vehicles: [REAL_SAMSARA_ROW, noReading], contract: "live" }) });
      const partial = await composeRealFleetVehicles(BASTROP_TX, getDomain("fleet-vehicles"), { env: ENV, fetchImpl: mixed });
      assert.equal(partial.status, "ok");
      assert.equal(partial.recordCount, 1, "the row with a reading is served");
      assert.equal(partial.extras.refusalCount, 1);
      assert.deepEqual(partial.extras.refusalFaults, ["fleet-vehicle requires odometerBand"],
        "the fault string travels on the partial refusal, derived by the same helper the total refusal uses");
      assert.equal(partial.extras.refusals[0].recordId, REAL_SAMSARA_ROW.id);
      // And the served count is NOT silently inflated to cover the refused row.
      assert.equal(partial.recordCount + partial.extras.refusalCount, 2);
    });

    it("the live Spireon row now PASSES, and its two planted violations still fire", () => {
      const row = { spireonId: "sp-1", name: "Unit 90", nspireStatus: "Stopped", address: "132 Grady Tuck Ln, Bastrop, TX", speed: 0 };
      const record = mapRealPatrolVehicleRecord(row, "bastrop_tx");
      assert.deepEqual(recordShapeFaults(record), []);
      // The vendor's own state, verbatim: the read reports states and none of them
      // is a readiness band, so none is claimed.
      assert.equal(record.status, "Stopped");
      assert.equal(record.operatorRef, null);
      assert.match(record.operatorBasis, /no operator identity|does not carry/i);

      // Plant 1: the route's own fallback word, carried as if it were a state.
      const token = { ...record, status: "Unknown" };
      const tokenFaults = recordShapeFaults(token);
      assert.equal(tokenFaults.length, 1);
      assert.match(tokenFaults[0], /status carries "Unknown"/);

      // Plant 2: this product's band, asserted on a vendor's row.
      const band = { ...record, status: "out-of-service" };
      assert.deepEqual(recordShapeFaults(band), [
        `status asserts the product band "out-of-service" on a live patrol-vehicle with no declared translation: ${LIVE_STATUS_TRANSLATION_BASIS}`,
      ]);

      // And the mapper turns the fallback word into the absent case rather than a state.
      const unknownRow = mapRealPatrolVehicleRecord({ spireonId: "sp-2", name: "Unit 91", nspireStatus: "Unknown" }, "bastrop_tx");
      assert.equal(unknownRow.status, null);
      assert.match(unknownRow.statusBasis, /no NSpire status/);
      assert.deepEqual(recordShapeFaults(unknownRow), []);
    });

    /**
     * THE POSITIVE CONTROL. A guard that refuses everything is not a guard, so
     * the same predicate is asserted to PASS a conforming record, and the record
     * chosen is one the FIXTURE path actually generates -- which is also where
     * the namespaced operator reference is minted (the ruling of 2026-09-17).
     */
    it("is not a blanket refusal: a conforming record passes, and it carries a namespaced reference", () => {
      const fleet = generateFleetRecords({ cityKey: "template-city", seed: 0 });
      const patrol = generatePatrolRecords({ cityKey: "template-city", seed: 0 });
      for (const record of fleet) {
        assert.deepEqual(recordShapeFaults(record), []);
        assert.equal(assertRecordShape(record), true);
        assert.match(record.operatorRef, /^FL-OPR-\d{2}$/);
      }
      for (const record of patrol) {
        assert.deepEqual(recordShapeFaults(record), []);
        assert.match(record.operatorRef, /^PV-OPR-\d{2}$/);
      }
      // The bare form the ruling retired is no longer minted anywhere.
      const refs = [...fleet, ...patrol].map((r) => r.operatorRef);
      assert.equal(refs.some((r) => /^OPR-\d{2}$/.test(r)), false);
    });
  });

  /**
   * G-153 DEFECT 2. A sentinel two vendors share is not an identifier: both
   * mappers fell back to the literal "Unnamed unit", so an unnamed Samsara row
   * and an unnamed Spireon row were indistinguishable once joined or grouped. The
   * control is the old literal, and it is asserted ABSENT rather than merely
   * assumed gone.
   */
  describe("unit labels and record ids are namespaced by vendor (G-153 defect 2)", () => {
    const emptyRows = {
      samsara: mapRealFleetVehicleRecord({}, "bastrop_tx"),
      spireon: mapRealPatrolVehicleRecord({}, "bastrop_tx"),
      firstdue: mapRealFireApparatusRecord({}, "bastrop_tx"),
    };

    it("an empty row produces a label that names its own vendor", () => {
      assert.equal(emptyRows.samsara.unitLabel, "Unnamed samsara unit");
      assert.equal(emptyRows.spireon.unitLabel, "Unnamed spireon unit");
      assert.equal(emptyRows.firstdue.unitLabel, "Unnamed firstdue unit");
    });

    it("no two vendors can emit the same label, because the vendor kind is in it", () => {
      const labels = Object.values(emptyRows).map((r) => r.unitLabel);
      assert.equal(new Set(labels).size, labels.length, `labels collide: ${labels.join(", ")}`);
      for (const [kind, record] of Object.entries(emptyRows)) {
        assert.match(record.unitLabel, new RegExp(`\\b${kind}\\b`), `${kind} does not name itself`);
        for (const other of Object.keys(emptyRows)) {
          if (other !== kind) assert.equal(record.unitLabel.includes(other), false);
        }
      }
    });

    it("the sentinel the two lenses shared is gone, and the ids are namespaced the same way", () => {
      // Before: mapRealFleetVehicleRecord({}).unitLabel === mapRealPatrolVehicleRecord({}).unitLabel === "Unnamed unit".
      assert.notEqual(emptyRows.samsara.unitLabel, emptyRows.spireon.unitLabel);
      assert.equal(Object.values(emptyRows).some((r) => r.unitLabel === "Unnamed unit"), false);
      const ids = [
        emptyRows.samsara.recordId,
        emptyRows.spireon.recordId,
        emptyRows.firstdue.recordId,
        mapRealCipProjectRecord({}, "bastrop_tx").recordId,
      ];
      assert.equal(new Set(ids).size, ids.length, `ids collide: ${ids.join(", ")}`);
      for (const [kind, record] of Object.entries(emptyRows)) assert.match(record.recordId, new RegExp(`unknown-${kind}-`));
    });
  });

  describe("call-analytics compose", () => {
    it("returns exactly one aggregate record on success, not a fabricated per-queue breakdown", async () => {
      const fetchImpl = async () => ({
        ok: true,
        json: async () => ({ summary: { totalCalls: 10, answeredCalls: 9, missedCalls: 1, answerRate: 90 }, contract: "aggregate" }),
      });
      const domain = getDomain("call-analytics");
      const out = await composeRealCallAnalytics(BASTROP_TX, domain, { env: ENV, fetchImpl });
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
      const out = await composeRealCallAnalytics(BASTROP_TX, domain, { env: ENV, fetchImpl });
      assert.equal(out.status, "unavailable");
      assert.match(out.basis, /goto_not_authorized/);
    });
  });
});
