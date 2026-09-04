import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchPropertyIntelSummary,
  mapRealPropertyResult,
  composePropertyIntelSummary,
  NATIVE_PROPERTY_MAP_CITY_KEY,
} from "./property-map.mjs";

const SAMPLE_BODY = {
  found: true,
  source: "live",
  query: "123 Chestnut St",
  match: { address: "123 CHESTNUT ST, Bastrop, TX, 78602", lat: 30.1102, lng: -97.3153 },
  parcel: {
    found: true,
    geometry: { type: "Polygon", coordinates: [[[-97.316, 30.109], [-97.314, 30.109], [-97.314, 30.111], [-97.316, 30.109]]] },
  },
  summary: {
    snapshot: {
      address: "123 CHESTNUT ST",
      parcelId: "R98765",
      owner: "JOHN Q PUBLIC",
      zoning: "Downtown Mixed Use",
      zoningCode: "",
      acreage: "0.2500",
      subdivision: "Original Town",
      legalDesc: "LOT 4 BLK 12 ORIGINAL TOWN",
      lot: "4",
      block: "12",
      floodZone: "X",
      futureLandUse: null,
    },
    permits: [{ id: "PMT-1", permitNumber: "2026-001", status: "issued", type: "Building" }],
    violations: [{ id: "CE-1", caseNumber: "CE-2026-01", status: "open", type: "Overgrown Lot" }],
    inspections: [{ id: "INSP-1", permitNumber: "2026-001", status: "passed" }],
    risks: { risks: [{ severity: "info", category: "flood", label: "Minimal Flood Risk", detail: "Zone X" }] },
  },
};

describe("property-map (G-117 native map live feed)", () => {
  it("fetchPropertyIntelSummary fails closed when PLATFORM_INTERNAL_API_KEY is unset", async () => {
    const result = await fetchPropertyIntelSummary("123 Chestnut St", { env: {} });
    assert.equal(result.status, "unavailable");
    assert.match(result.basis, /PLATFORM_INTERNAL_API_KEY unset/);
    assert.equal(result.body, null);
  });

  it("fetchPropertyIntelSummary sends the bearer key and the address, and returns the body", async () => {
    let capturedUrl = null;
    let capturedHeaders = null;
    const fetchImpl = async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return { ok: true, json: async () => SAMPLE_BODY };
    };
    const result = await fetchPropertyIntelSummary("123 Chestnut St", {
      env: { PLATFORM_INTERNAL_API_KEY: "test-key" },
      fetchImpl,
    });
    assert.equal(result.status, "ok");
    assert.equal(capturedHeaders.authorization, "Bearer test-key");
    assert.match(capturedUrl, /address=123%20Chestnut%20St/i);
    assert.equal(result.body.found, true);
  });

  it("fetchPropertyIntelSummary stays honest-unavailable on a non-ok HTTP response, not a thrown crash", async () => {
    const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({ message: "upstream_unavailable" }) });
    const result = await fetchPropertyIntelSummary("123 Chestnut St", {
      env: { PLATFORM_INTERNAL_API_KEY: "test-key" },
      fetchImpl,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.basis, "upstream_unavailable");
  });

  it("mapRealPropertyResult tags permits/violations/inspections origin feed and keeps real values as-is", () => {
    const result = mapRealPropertyResult(SAMPLE_BODY, "bastrop_tx");
    assert.equal(result.permits[0].origin, "feed");
    assert.equal(result.permits[0].recordType, "permit-case");
    assert.equal(result.permits[0].status, "issued");
    assert.equal(result.violations[0].origin, "feed");
    assert.equal(result.violations[0].recordType, "code-case");
    assert.equal(result.inspections[0].origin, "feed");
    assert.equal(result.inspections[0].recordType, "inspection");
    // Real zoning value, not force-mapped onto any invented taxonomy.
    assert.equal(result.snapshot.zoning, "Downtown Mixed Use");
    assert.equal(result.snapshot.floodZone, "X");
    assert.equal(result.parcel.found, true);
    assert.equal(result.parcel.geometry.type, "Polygon");
    assert.equal(result.risks[0].origin, "feed");
  });

  it("mapRealPropertyResult states an honest absence (empty array/false/null), never a fabricated value", () => {
    const result = mapRealPropertyResult(
      { found: true, match: null, parcel: { found: false, geometry: null }, summary: {} },
      "bastrop_tx",
    );
    assert.equal(result.match, null);
    assert.equal(result.parcel.found, false);
    assert.equal(result.parcel.geometry, null);
    assert.deepEqual(result.permits, []);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.inspections, []);
    assert.deepEqual(result.risks, []);
    assert.equal(result.snapshot.zoning, "");
    assert.equal(result.snapshot.floodZone, null);
  });

  it("composePropertyIntelSummary is honestly unavailable for any cityKey other than bastrop_tx -- no cross-tenant leak", async () => {
    const out = await composePropertyIntelSummary({
      address: "123 Chestnut St",
      cityKey: "template-city",
      env: { PLATFORM_INTERNAL_API_KEY: "test-key" },
      fetchImpl: async () => ({ ok: true, json: async () => SAMPLE_BODY }),
    });
    assert.equal(out.status, "unavailable");
    assert.match(out.basis, new RegExp(NATIVE_PROPERTY_MAP_CITY_KEY));
    assert.equal(out.found, false);
    assert.equal(out.result, null);
    assert.equal(out.source, "live");
  });

  it("composePropertyIntelSummary is honestly unavailable when address is blank", async () => {
    const out = await composePropertyIntelSummary({
      address: "   ",
      cityKey: "bastrop_tx",
      env: { PLATFORM_INTERNAL_API_KEY: "test-key" },
      fetchImpl: async () => ({ ok: true, json: async () => SAMPLE_BODY }),
    });
    assert.equal(out.status, "unavailable");
    assert.match(out.basis, /address is required/);
  });

  it("composePropertyIntelSummary reports an honest no_match (not an error) when the platform route found nothing", async () => {
    const out = await composePropertyIntelSummary({
      address: "nonexistent place",
      cityKey: "bastrop_tx",
      env: { PLATFORM_INTERNAL_API_KEY: "test-key" },
      fetchImpl: async () => ({ ok: true, json: async () => ({ found: false, status: "no_match", message: "No address match found." }) }),
    });
    assert.equal(out.status, "no_match");
    assert.equal(out.found, false);
    assert.equal(out.basis, "No address match found.");
  });

  it("composePropertyIntelSummary produces the full real shape end to end, source live, origin feed on every record", async () => {
    const out = await composePropertyIntelSummary({
      address: "123 Chestnut St",
      cityKey: "bastrop_tx",
      env: { PLATFORM_INTERNAL_API_KEY: "test-key" },
      fetchImpl: async () => ({ ok: true, json: async () => SAMPLE_BODY }),
    });
    assert.equal(out.status, "ok");
    assert.equal(out.found, true);
    assert.equal(out.source, "live");
    assert.equal(out.cityKey, "bastrop_tx");
    assert.equal(out.result.match.address, SAMPLE_BODY.match.address);
    assert.equal(out.result.permits.length, 1);
    assert.equal(out.result.permits[0].origin, "feed");
    assert.equal(out.result.violations.length, 1);
    assert.equal(out.result.inspections.length, 1);
  });

  it("composePropertyIntelSummary stays honestly unavailable, not silently empty, when the platform fetch itself fails", async () => {
    const out = await composePropertyIntelSummary({
      address: "123 Chestnut St",
      cityKey: "bastrop_tx",
      env: { PLATFORM_INTERNAL_API_KEY: "test-key" },
      fetchImpl: async () => {
        throw new Error("network unreachable");
      },
    });
    assert.equal(out.status, "unavailable");
    assert.match(out.basis, /network unreachable/);
    assert.equal(out.found, false);
  });
});
