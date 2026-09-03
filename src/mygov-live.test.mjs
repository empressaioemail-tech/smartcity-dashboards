import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapRealWorkOrderRecord,
  mapRealInspectionRecord,
  mapRealCodeViolationRecord,
  mapRealBusinessLicenseRecord,
  realStatusCounts,
  composeRealWorkOrders,
  composeRealInspections,
  composeRealCodeViolations,
  composeRealBusinessLicenses,
} from "./mygov-live.mjs";
import { getDomain } from "./domains.mjs";
import { BASTROP_TX } from "./city-pack.mjs";

const CASES = [
  {
    name: "work-orders",
    mapRow: mapRealWorkOrderRecord,
    row: { workOrderNumber: "25-000070", statusNormalized: "completed", title: "Shop Maintenance", address: "1 City Way, Bastrop, TX", department: "Bastrop Power & Light" },
    expectRecordType: "work-order",
    listKey: "workOrders",
    compose: composeRealWorkOrders,
  },
  {
    name: "inspections",
    mapRow: mapRealInspectionRecord,
    row: { id: "RPT271-26-000633", status: "active", type: "Pool Permit (R)", permitNumber: "26-000633" },
    expectRecordType: "inspection",
    listKey: "inspections",
    compose: composeRealInspections,
  },
  {
    name: "code-violations",
    mapRow: mapRealCodeViolationRecord,
    row: { caseNumber: "21-000124", status: "active", type: "Junk and Rubbish", address: "408 Juniper St" },
    expectRecordType: "code-violation",
    listKey: "violations",
    compose: composeRealCodeViolations,
  },
  {
    name: "business-licenses",
    mapRow: mapRealBusinessLicenseRecord,
    row: { licenseNumber: "23-000005", status: "canceled", businessName: "Golf cart license" },
    expectRecordType: "business-license",
    listKey: "licenses",
    compose: composeRealBusinessLicenses,
  },
];

describe("mygov-live (G-116 Phase 2 second batch)", () => {
  for (const { name, mapRow, row, expectRecordType } of CASES) {
    it(`${name}: maps a real row onto the record envelope, origin feed not fixture`, () => {
      const record = mapRow(row, "bastrop_tx");
      assert.equal(record.kind, "mygov");
      assert.equal(record.recordType, expectRecordType);
      assert.equal(record.cityKey, "bastrop_tx");
      assert.equal(record.origin, "feed");
      assert.equal(record.fixture, undefined);
      assert.equal(record.fixtureBasis, undefined);
      assert.equal(record.status, row.statusNormalized || row.status);
      assert.ok(record.provenance.readAt);
    });
  }

  it("groups by the real status values found, not any fixture taxonomy", () => {
    const records = [{ status: "active" }, { status: "active" }, { status: "closed" }];
    assert.deepEqual(realStatusCounts(records), [
      { status: "active", count: 2 },
      { status: "closed", count: 1 },
    ]);
  });

  for (const { name, listKey, compose } of CASES) {
    describe(name, () => {
      it("fails closed when PLATFORM_INTERNAL_API_KEY is unset", async () => {
        const domain = getDomain(name === "work-orders" ? "work-orders" : name);
        const out = await compose(BASTROP_TX, domain, { env: {} });
        assert.equal(out.status, "unavailable");
        assert.match(out.basis, /PLATFORM_INTERNAL_API_KEY unset/);
        assert.equal(out.recordCount, 0);
      });

      it("returns real records with source live when the fetch succeeds", async () => {
        const sampleRow = CASES.find((c) => c.name === name).row;
        const fetchImpl = async () => ({
          ok: true,
          json: async () => ({ [listKey]: [sampleRow], contract: "live" }),
        });
        const domain = getDomain(name === "work-orders" ? "work-orders" : name);
        const out = await compose(BASTROP_TX, domain, { env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl });
        assert.equal(out.source, "live");
        assert.equal(out.generated, false);
        assert.equal(out.granted, true);
        assert.equal(out.status, "ok");
        assert.equal(out.recordCount, 1);
        assert.equal(out.records[0].origin, "feed");
      });

      it("is honestly granted-empty, not silently absent, when the live read returns zero", async () => {
        const fetchImpl = async () => ({ ok: true, json: async () => ({ [listKey]: [], contract: "live" }) });
        const domain = getDomain(name === "work-orders" ? "work-orders" : name);
        const out = await compose(BASTROP_TX, domain, { env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl });
        assert.equal(out.status, "granted-empty");
        assert.equal(out.granted, true);
        assert.equal(out.recordCount, 0);
      });
    });
  }
});
