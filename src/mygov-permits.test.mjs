import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapRealPermitRecord,
  realStatusCounts,
  fetchRealPermits,
  composeRealPermits,
} from "./mygov-permits.mjs";
import { getDomain } from "./domains.mjs";
import { PLATFORM_MYGOV_PERMITS_GRANT } from "./adapters.mjs";
import { BASTROP_TX } from "./city-pack.mjs";

const SAMPLE_ROW = {
  id: "PRM-1324",
  permitNumber: "21-000023",
  type: "general",
  status: "active",
  derivedStatus: "active",
  address: "710 Chestnut St, Bastrop, TX USA 78602",
  parcelId: "33383",
  title: "The Chestnut Grove Site Development Plan",
  department: "Planning Department",
  manager: "Doug Haggerty",
  submittedDate: "2021-05-05",
  issuedDate: null,
  expirationDate: null,
};

describe("mygov-permits (G-116 Phase 2 live feed)", () => {
  it("maps a real permit row onto the record envelope, origin feed not fixture", () => {
    const record = mapRealPermitRecord(SAMPLE_ROW, "bastrop_tx", "tenant-private");
    assert.equal(record.recordId, "21-000023");
    assert.equal(record.kind, "mygov");
    assert.equal(record.recordType, "permit-case");
    assert.equal(record.cityKey, "bastrop_tx");
    assert.equal(record.origin, "feed");
    assert.equal(record.accessPolicy, "tenant-private");
    assert.equal(record.subject, "The Chestnut Grove Site Development Plan");
    // The real status, not forced onto CASE_STATUS_VALUES -- see module header.
    assert.equal(record.status, "active");
    assert.equal(record.place.label, SAMPLE_ROW.address);
    assert.equal(record.place.parcelNodeId, "33383");
    assert.ok(record.provenance.source.includes("smartcity-os"));
    assert.ok(record.provenance.readAt);
  });

  it("does not claim fixture true/fixtureBasis on a real record", () => {
    const record = mapRealPermitRecord(SAMPLE_ROW, "bastrop_tx", "tenant-private");
    assert.equal(record.fixture, undefined);
    assert.equal(record.fixtureBasis, undefined);
  });

  it("states an honest basis when a permit carries no parcel id", () => {
    const record = mapRealPermitRecord({ ...SAMPLE_ROW, parcelId: "" }, "bastrop_tx", "tenant-private");
    assert.equal(record.place.parcelNodeId, null);
    assert.ok(record.place.parcelBasis);
  });

  it("groups by the real status values found, not the fixture's four tiles", () => {
    const records = [
      { status: "active" },
      { status: "active" },
      { status: "in-review" },
      { status: "pending" },
    ];
    const counts = realStatusCounts(records);
    assert.deepEqual(counts, [
      { status: "active", count: 2 },
      { status: "in-review", count: 1 },
      { status: "pending", count: 1 },
    ]);
  });

  it("fetchRealPermits fails closed when PLATFORM_INTERNAL_API_KEY is unset", async () => {
    const result = await fetchRealPermits({ env: {} });
    assert.equal(result.status, "unavailable");
    assert.match(result.basis, /PLATFORM_INTERNAL_API_KEY unset/);
    assert.deepEqual(result.records, []);
  });

  it("fetchRealPermits sends the bearer key and returns the source's permits array", async () => {
    let capturedHeaders = null;
    const fetchImpl = async (url, opts) => {
      capturedHeaders = opts.headers;
      return {
        ok: true,
        json: async () => ({ permits: [SAMPLE_ROW], total: 1, contract: "in_mygov_active_list=true AND tenant_id=2" }),
      };
    };
    const result = await fetchRealPermits({ env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl });
    assert.equal(result.status, "ok");
    assert.equal(capturedHeaders.authorization, "Bearer test-key");
    assert.equal(result.records.length, 1);
  });

  it("fetchRealPermits stays honest-unavailable on a non-ok HTTP response, not a thrown crash", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500 });
    const result = await fetchRealPermits({ env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl });
    assert.equal(result.status, "unavailable");
    assert.match(result.basis, /HTTP 500/);
  });

  it("composeRealPermits produces the same envelope shape as composeDomain, marked source live", async () => {
    const domain = getDomain("permits-pipeline");
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ permits: [SAMPLE_ROW], total: 1, contract: "in_mygov_active_list=true" }),
    });
    const out = await composeRealPermits(
      BASTROP_TX,
      domain,
      PLATFORM_MYGOV_PERMITS_GRANT,
      { env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl },
    );
    assert.equal(out.domainId, "permits-pipeline");
    assert.equal(out.lensId, "development-services");
    assert.equal(out.cityKey, "bastrop_tx");
    assert.equal(out.gatedBy, "mygov");
    assert.equal(out.source, "live");
    assert.equal(out.generated, false);
    assert.equal(out.granted, true);
    assert.equal(out.status, "ok");
    assert.equal(out.recordCount, 1);
    assert.equal(out.records[0].origin, "feed");
    assert.ok(Array.isArray(out.extras.realStatusCounts));
  });

  it("composeRealPermits is honestly granted-empty, not silently absent, when the live read returns zero", async () => {
    const domain = getDomain("permits-pipeline");
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ permits: [], total: 0, contract: "in_mygov_active_list=true" }),
    });
    const out = await composeRealPermits(
      BASTROP_TX,
      domain,
      PLATFORM_MYGOV_PERMITS_GRANT,
      { env: { PLATFORM_INTERNAL_API_KEY: "test-key" }, fetchImpl },
    );
    assert.equal(out.status, "granted-empty");
    assert.equal(out.granted, true);
    assert.equal(out.recordCount, 0);
  });
});
