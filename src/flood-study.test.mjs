// G-149. The flood study lens' server half: the engine client and the screening
// model, checked against the RATIFIED design at `_design/smartcity-flood-study`.
//
// WHAT THIS FILE IS FOR. The design's whole argument is that four pairs of
// states are DIFFERENT and get collapsed by a careless screen: an engine that
// did not answer vs a parcel that does not pond (trap 4); the engine's own
// design storm vs a depth passed in (trap 2); `honestEmpty` vs zero ponding vs
// a capability gap (trap 3); the regulatory zone vs the modeled study (Move 2).
// A test that only asserted the happy path would pass against a build that
// collapsed every one of them, so the arms below are the DIVERGENCES first and
// the happy path last. Where a pair must differ, there is an arm that renders
// both and asserts they are not equal.
//
// WHAT IS NOT PROVEN HERE: that a deployed engine answers this route for
// bastrop_tx. That is a live probe and lives in the lane's close artifact, not
// in a unit test that would have to reach the network to say anything.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEPTH_BOUND_BASIS,
  DEPTH_PRESETS_INCHES,
  ENGINE_DESIGN_STORM_LABEL,
  ENGINE_FAILURE_COPY,
  FLOOD_ENGINE_API_KEY_ENV,
  FLOOD_ENGINE_BASE_ENV,
  FLOOD_ENGINE_BASE_UNSET_BASIS,
  FLOOD_ENGINE_KEY_UNSET_BASIS,
  FLOOD_ENGINE_TIMEOUT_MS,
  JOB_STATES,
  MODEL_BADGE,
  NO_PONDING_LINE,
  RETRYABLE_ENGINE_FAILURES,
  SCREENING_RANK,
  classifyEngineFailure,
  fetchFloodStudy,
  floodEngineBase,
  floodStudyGateHeaders,
  floodStudyRoute,
  isValidParcelNodeId,
  modelDetermination,
  parcelNodeIdFor,
  parseDepthInches,
  rainfallBasisLabel,
  rankScreeningRows,
  returnPeriodYearsForDepthInches,
  screeningHeader,
  screeningRow,
  studyViewState,
  zoneDetermination,
} from "./flood-study.mjs";

const ENGINE_BASE = "https://engine.test";
const KEYED_ENV = { [FLOOD_ENGINE_BASE_ENV]: ENGINE_BASE, [FLOOD_ENGINE_API_KEY_ENV]: "test-key" };
const BASTROP_FIPS = "48021";

/** A fetch that fails the test if anything reaches the network. */
const NEVER_CALLED = async () => {
  throw new Error("no request may be made when the engine is not configured");
};

/** A fetch that answers one canned JSON payload and records what it was asked. */
function fetchOnce(payload, { status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  };
  impl.calls = calls;
  return impl;
}

/** A NOAA Atlas 14-shaped curve, the same one the client's own test uses. */
const CURVE = [
  { returnPeriodYears: 2, depthInches: 3.5 },
  { returnPeriodYears: 10, depthInches: 5.5 },
  { returnPeriodYears: 25, depthInches: 7.1 },
  { returnPeriodYears: 100, depthInches: 9.5 },
  { returnPeriodYears: 500, depthInches: 13.0 },
];

describe("G-149 the engine client is configured, or it refuses", () => {
  it("names the two variables and reads the base as an origin", () => {
    assert.equal(FLOOD_ENGINE_BASE_ENV, "HAUSKA_ENGINE_BASE");
    assert.equal(FLOOD_ENGINE_API_KEY_ENV, "HAUSKA_ENGINE_API_KEY");
    assert.equal(floodEngineBase({ [FLOOD_ENGINE_BASE_ENV]: ENGINE_BASE }), ENGINE_BASE);
  });

  it("an unset base is the empty string, NOT a host, and it is never defaulted", () => {
    assert.equal(floodEngineBase({}), "");
    assert.equal(floodEngineBase(), "");
    // The platform-base law, one product over: a default here decides whether a
    // figure on this screen is a study or a cached study from a revision nobody
    // chose. Asserted at the route so a future edit cannot add a host quietly.
    assert.equal(floodStudyRoute("study", "48021:34137", {}), null);
  });

  it("normalizes a trailing slash, and refuses before the network with a stated basis", async () => {
    assert.equal(floodEngineBase({ [FLOOD_ENGINE_BASE_ENV]: `${ENGINE_BASE}//` }), ENGINE_BASE);
    const noBase = await fetchFloodStudy("48021:34137", { env: {}, fetchImpl: NEVER_CALLED });
    assert.equal(noBase.ok, false);
    assert.equal(noBase.basis, FLOOD_ENGINE_BASE_UNSET_BASIS);
    const noKey = await fetchFloodStudy("48021:34137", { env: { [FLOOD_ENGINE_BASE_ENV]: ENGINE_BASE }, fetchImpl: NEVER_CALLED });
    assert.equal(noKey.ok, false);
    assert.equal(noKey.basis, FLOOD_ENGINE_KEY_UNSET_BASIS);
  });

  it("a parcel id that is not {fips}:{propId} is refused rather than addressed", async () => {
    assert.equal(isValidParcelNodeId("48021:34137"), true);
    assert.equal(isValidParcelNodeId("33383"), false);
    assert.equal(isValidParcelNodeId(""), false);
    const out = await fetchFloodStudy("33383", { env: KEYED_ENV, fetchImpl: NEVER_CALLED });
    assert.equal(out.ok, false);
    assert.equal(out.kind, "parcel_not_addressable");
  });

  it("builds the engine's own route for both legs", () => {
    assert.equal(floodStudyRoute("study", "48021:34137", KEYED_ENV), `${ENGINE_BASE}/v1/property-nodes/48021%3A34137/flood-drainage/study`);
    assert.equal(floodStudyRoute("refresh", "48021:34137", KEYED_ENV), `${ENGINE_BASE}/v1/property-nodes/48021%3A34137/flood-drainage/refresh`);
    assert.throws(() => floodStudyRoute("cancel", "48021:34137", KEYED_ENV), /kind must be/);
  });

  it("identifies THIS product at gate-front rather than reusing Property Explorer's credential", () => {
    const headers = floodStudyGateHeaders({ requestId: "req-1" });
    assert.equal(headers["x-hauska-package-id"], "flood-study-screening");
    assert.notEqual(headers["x-hauska-gate-credential-id"], "property-explorer-flood-drainage-bff");
    assert.equal(headers["x-hauska-request-id"], "req-1");
    // An un-supplied request id is generated, never blank: gate-front correlates
    // on it, and an empty one makes every lane's calls one call.
    assert.ok(String(floodStudyGateHeaders()["x-hauska-request-id"]).length > 0);
  });

  it("pins the study budget to the same number the BFF pins", () => {
    assert.equal(FLOOD_ENGINE_TIMEOUT_MS, 55_000);
  });
});

describe("G-149 depth is a control and the bound is the engine's own", () => {
  it("accepts the interior and the presets", () => {
    assert.deepEqual(DEPTH_PRESETS_INCHES, [2, 4, 7, 10]);
    for (const preset of DEPTH_PRESETS_INCHES) assert.equal(parseDepthInches(preset).ok, true);
    assert.equal(parseDepthInches("4").value, 4);
  });

  it("refuses BOTH ends exactly as the engine does, in the engine's words", () => {
    for (const bad of [0, -1, 60.1, 61, "abc", null, undefined, ""]) {
      const out = parseDepthInches(bad);
      assert.equal(out.ok, false, `expected ${JSON.stringify(bad)} to be refused`);
      assert.equal(out.basis, DEPTH_BOUND_BASIS);
    }
    // 60 is inside (0, 60]; 60.0001 is not. The closed end is the engine's.
    assert.equal(parseDepthInches(60).ok, true);
    assert.equal(parseDepthInches(0.0001).ok, true);
  });

  it("sends the depth on the REFRESH leg only, because a cached study is the depth it ran at", async () => {
    const refresh = fetchOnce({ data: { study: { generatedAt: "2026-09-19T00:00:00Z" } } });
    await fetchFloodStudy("48021:34137", { env: KEYED_ENV, fetchImpl: refresh, refresh: true, depthInches: 4 });
    assert.equal(JSON.parse(refresh.calls[0].init.body).rainfallDepthInches, 4);

    const study = fetchOnce({ data: { study: { generatedAt: "2026-09-19T00:00:00Z" } } });
    await fetchFloodStudy("48021:34137", { env: KEYED_ENV, fetchImpl: study, depthInches: 4 });
    assert.equal(study.calls[0].init.body, undefined);
  });
});

describe("G-149 trap 2: the basis line says WHICH pair a reader sees", () => {
  it("reads the engine's own design storm as the engine renders it", () => {
    const out = rainfallBasisLabel({ rainfallSource: "noaa-atlas14", rainfallDepthInches: 9.5, rainfallCurve: CURVE });
    assert.equal(out.ok, true);
    assert.equal(out.label, ENGINE_DESIGN_STORM_LABEL);
  });

  it("reads a depth passed in the request as an interpolated equivalent, and the two DIVERGE", () => {
    const engineOwn = rainfallBasisLabel({ rainfallSource: "noaa-atlas14", rainfallDepthInches: 9.5, rainfallCurve: CURVE });
    const passed = rainfallBasisLabel({ rainfallSource: "parameter", rainfallDepthInches: 4, rainfallCurve: CURVE });
    assert.equal(passed.ok, true);
    assert.match(passed.label, /^≈\d+-yr equivalent \(interpolated\)$/);
    // The paired control's divergence test: one source must not render as the
    // other, or the label cites NOAA for a value NOAA did not publish.
    assert.notEqual(engineOwn.label, passed.label);
  });

  it("refuses to label when the pair cannot be established, rather than defaulting to NOAA", () => {
    const noCurve = rainfallBasisLabel({ rainfallSource: "parameter", rainfallDepthInches: 4 });
    assert.equal(noCurve.ok, false);
    assert.match(noCurve.basis, /no rainfallCurve/);
    const unknown = rainfallBasisLabel({ rainfallSource: "made-up" });
    assert.equal(unknown.ok, false);
    assert.match(unknown.basis, /no rainfallSource/);
  });

  it("interpolates log-linearly and clamps at the curve's ends rather than extrapolating", () => {
    // Exactly on a knot returns that knot's period. Compared with a tolerance
    // and not exactly: the interpolation is the same log-linear form the
    // client uses, and exp/log round-trip lands a hair off an integer knot
    // (10.000000000000002 at 5.5in). The rendered label rounds, so the screen
    // is exact; asserting bit-equality here would be testing IEEE754, not the
    // contract.
    assert.ok(Math.abs(returnPeriodYearsForDepthInches(CURVE, 5.5).value - 10) < 1e-9);
    // Between knots, the result is strictly inside them.
    const between = returnPeriodYearsForDepthInches(CURVE, 4.5).value;
    assert.ok(between > 2 && between < 10, `expected (2,10), read ${between}`);
    // Past both ends it is the boundary value, and it SAYS it clamped.
    assert.deepEqual(returnPeriodYearsForDepthInches(CURVE, 99), { value: 500, clamped: "high" });
    assert.deepEqual(returnPeriodYearsForDepthInches(CURVE, 0.5), { value: 2, clamped: "low" });
    assert.equal(returnPeriodYearsForDepthInches(undefined, 4), null);
    assert.equal(returnPeriodYearsForDepthInches([], 4), null);
  });
});

describe("G-149 trap 4: an engine that did not answer is NOT a parcel that does not pond", () => {
  it("classifies only the two transient classes as retryable", () => {
    assert.deepEqual([...RETRYABLE_ENGINE_FAILURES], ["engine_timeout", "engine_unreachable"]);
    assert.equal(classifyEngineFailure({ aborted: true }).retryable, true);
    assert.equal(classifyEngineFailure({ error: "engine_unreachable" }).retryable, true);
    assert.equal(classifyEngineFailure({ error: "engine_gate_config" }).retryable, false);
    assert.equal(classifyEngineFailure({ status: 500 }).retryable, false);
    assert.equal(classifyEngineFailure({ status: 401 }).retryable, false);
    // A status-0 failure is unreachable, not a refusal: nothing answered at all.
    assert.equal(classifyEngineFailure({ status: 0 }).kind, "engine_unreachable");
  });

  it("carries the engine's own copy so a timeout cannot be softened into a result", () => {
    const timeout = classifyEngineFailure({ aborted: true });
    assert.equal(timeout.message, ENGINE_FAILURE_COPY.engine_timeout);
    const unreachable = classifyEngineFailure({ error: "engine_unreachable" });
    assert.equal(unreachable.message, ENGINE_FAILURE_COPY.engine_unreachable);
  });

  it("a timeout renders as a retryable failure and NEVER as no-ponding", () => {
    const state = studyViewState({ error: { aborted: true } });
    assert.equal(state.state, "failed");
    assert.equal(state.failure, "engine_timeout");
    assert.equal(state.retryable, true);
    assert.equal(state.ponding, "not-measured");
    assert.equal(state.line, undefined);
    assert.notEqual(state.basis, NO_PONDING_LINE);
  });

  it("a transport throw is unreachable and stays retryable end to end", async () => {
    const boom = async () => {
      throw new Error("ECONNRESET");
    };
    const out = await fetchFloodStudy("48021:34137", { env: KEYED_ENV, fetchImpl: boom });
    assert.equal(out.ok, false);
    assert.equal(out.kind, "engine_unreachable");
    assert.equal(out.retryable, true);
    assert.equal(studyViewState({ error: out }).retryable, true);
  });

  it("an engine HTTP failure is classified from the engine's own error field", async () => {
    const gate = fetchOnce({ error: "engine_gate_config", message: "bad token" }, { status: 503 });
    const out = await fetchFloodStudy("48021:34137", { env: KEYED_ENV, fetchImpl: gate });
    assert.equal(out.ok, false);
    assert.equal(out.kind, "engine_gate_config");
    assert.equal(out.retryable, false);
    assert.equal(out.basis, "bad token");
  });

  it("a 200 carrying no study object is an upstream error, never a fabricated empty study", async () => {
    const out = await fetchFloodStudy("48021:34137", { env: KEYED_ENV, fetchImpl: fetchOnce({ data: {} }) });
    assert.equal(out.ok, false);
    assert.match(out.basis, /carried no study object/);
  });
});

describe("G-149 trap 3: honestEmpty, zero ponding and unmeasured are three states", () => {
  const base = { generatedAt: "2026-09-19T00:00:00Z" };

  it("renders the engine's own honestEmpty reason VERBATIM", () => {
    const state = studyViewState({ study: { ...base, honestEmpty: { reason: "parcel has no DEM coverage" } } });
    assert.equal(state.state, "ready");
    assert.equal(state.ponding, "declined");
    assert.equal(state.reason, "parcel has no DEM coverage");
  });

  it("an honestEmpty with no reason is a named absence, not an empty string", () => {
    const state = studyViewState({ study: { ...base, honestEmpty: {} } });
    assert.equal(state.reason, null);
    assert.match(state.reasonBasis, /without a reason/);
  });

  it("zero ponding uses the design's line, and is a different shape from honestEmpty", () => {
    const none = studyViewState({ study: { ...base, stats: { pondingPercent: 0 } } });
    const declined = studyViewState({ study: { ...base, honestEmpty: { reason: "no DEM" } } });
    assert.equal(none.ponding, "none");
    assert.equal(none.line, NO_PONDING_LINE);
    assert.notEqual(none.ponding, declined.ponding);
    // This is the defect the row exists to prevent: a capability gap was paired
    // against the zero-ponding result. They must not render as the same state.
    assert.equal(declined.line, undefined);
  });

  it("a study with ponding states its share, and the share drives the drawing", () => {
    const ponds = studyViewState({ study: { ...base, stats: { pondingPercent: 34 } } });
    assert.equal(ponds.ponding, "ponds");
    assert.equal(ponds.sharePercent, 34);
    assert.match(ponds.basis, /34 percent/);
  });

  it("a study whose share cannot be read is unmeasured, NOT zero", () => {
    const unmeasured = studyViewState({ study: { ...base, stats: {} } });
    assert.equal(unmeasured.ponding, "unmeasured");
    assert.equal(unmeasured.sharePercent, undefined);
    assert.notEqual(unmeasured.ponding, "none");
  });

  it("queued and running are not results at all", () => {
    assert.equal(studyViewState({ job: "queued" }).state, "queued");
    assert.equal(studyViewState({ job: "running" }).state, "running");
    assert.equal(studyViewState({ job: "queued" }).ponding, undefined);
    assert.deepEqual([...JOB_STATES], ["queued", "running", "ready", "failed"]);
  });
});

describe("G-149 Move 2: two determinations, separate authority, separate vintage", () => {
  it("the zone card carries a vintage and a REFUSED citation (G-130), not a sentence", () => {
    const zone = zoneDetermination({ zone: "X", effectiveDate: "2024-06-20", vintageReadAt: "2026-09-19T00:00:00Z" });
    assert.equal(zone.kind, "zone");
    assert.equal(zone.zone, "X");
    assert.equal(zone.vintage, "2024-06-20");
    assert.equal(zone.citation.allowed, false);
    assert.match(zone.citation.basis, /G-130/);
    assert.match(zone.citation.basis, /provisional for citation/);
  });

  it("a zone with no edition date states that it has no vintage rather than omitting the field", () => {
    const zone = zoneDetermination({ zone: "AE" });
    assert.equal(zone.vintage, null);
    assert.match(zone.vintageBasis, /no edition date/);
  });

  it("the model card is badged NOT A DETERMINATION and carries no claimed vintage", () => {
    const model = modelDetermination({ study: { rainfallSource: "noaa-atlas14", rainfallDepthInches: 9.5, rainfallCurve: CURVE } });
    assert.equal(model.badge, MODEL_BADGE);
    assert.equal("vintage" in model, false);
    assert.equal(model.generatedAt, null);
    assert.equal(model.rainfallBasis.label, ENGINE_DESIGN_STORM_LABEL);
  });

  it("the two cards never share an authority, and the zone is never the model's", () => {
    const zone = zoneDetermination({ zone: "X" });
    const model = modelDetermination({ study: { rainfallSource: "noaa-atlas14" } });
    assert.notEqual(zone.authority, model.authority);
    assert.equal("badge" in zone, false);
    assert.equal("citation" in model, false);
  });
});

describe("G-149 Move 1: the screening is a list of PERMITS, and a data gap is a row", () => {
  const permit = (over = {}) => ({
    recordId: "B-26-0418",
    subject: "Commercial tenant finish-out",
    status: "in-review",
    place: { label: "1201 Chestnut St", parcelNodeId: "34137", ...(over.place || {}) },
    ...over,
  });

  it("a permit whose parcel cannot be addressed is a ROW with a basis, not a missing row", () => {
    const row = screeningRow({ permit: permit({ place: { label: "1201 Chestnut St", parcelNodeId: null } }), countyFips: BASTROP_FIPS });
    assert.equal(row.state, "unaddressable");
    assert.equal(row.parcelNodeId, null);
    assert.match(row.basis, /no parcel id on the source permit record/);
    assert.equal(row.id, "B-26-0418");
  });

  it("with no county FIPS the list refuses to attach any parcel at all", () => {
    const row = screeningRow({ permit: permit(), countyFips: "" });
    assert.equal(row.state, "unaddressable");
    assert.match(row.basis, /no county FIPS/);
  });

  it("an addressed permit carries the engine parcel node and the zone determination", () => {
    const row = screeningRow({
      permit: permit(),
      countyFips: BASTROP_FIPS,
      determination: {
        zone: zoneDetermination({ zone: "X", effectiveDate: "2024-06-20" }),
        model: modelDetermination({ study: { rainfallSource: "parameter", rainfallDepthInches: 4, rainfallCurve: CURVE } }),
        view: studyViewState({ study: { stats: { pondingPercent: 34 } } }),
      },
    });
    assert.equal(row.parcelNodeId, "48021:34137");
    assert.equal(row.state, "ready");
    assert.equal(row.ponding, "ponds");
    assert.equal(row.zone.code, "X");
    assert.equal(row.zone.citationAllowed, false);
    assert.equal(row.model.badge, MODEL_BADGE);
  });

  it("parcelNodeIdFor refuses a guessed county rather than attaching a permit to another county's lot", () => {
    assert.equal(parcelNodeIdFor({ countyFips: "4802", propId: "34137" }).ok, false);
    assert.equal(parcelNodeIdFor({ countyFips: BASTROP_FIPS, propId: "" }).ok, false);
    assert.deepEqual(parcelNodeIdFor({ countyFips: BASTROP_FIPS, propId: "34137" }), {
      ok: true,
      parcelNodeId: "48021:34137",
    });
  });
});

describe("G-149 Move 3: the depth re-ranks the whole list, and the rank carries the argument", () => {
  it("ponding first worst-first, then unknowns as work owed, then clear, then data gaps", () => {
    assert.equal(SCREENING_RANK[0], "ponds");
    assert.ok(SCREENING_RANK.indexOf("failed") < SCREENING_RANK.indexOf("none"));
    assert.equal(SCREENING_RANK[SCREENING_RANK.length - 1], "unaddressable");
    const rows = [
      { id: "clear", state: "ready", ponding: "none", sharePercent: 0 },
      { id: "gap", state: "unaddressable" },
      { id: "timed-out", state: "failed", retryable: true },
      { id: "ponds-12", state: "ready", ponding: "ponds", sharePercent: 12 },
      { id: "ponds-73", state: "ready", ponding: "ponds", sharePercent: 73 },
      { id: "declined", state: "ready", ponding: "declined" },
    ];
    assert.deepEqual(rankScreeningRows(rows).map((r) => r.id), [
      "ponds-73",
      "ponds-12",
      "declined",
      "timed-out",
      "clear",
      "gap",
    ]);
  });

  it("the header names the depth the whole list was run at, or refuses when it is out of bound", () => {
    const ok = screeningHeader({ depthInches: 4, cityKey: "bastrop_tx", rowCount: 7 });
    assert.equal(ok.depthInches, 4);
    assert.deepEqual(ok.presets, [2, 4, 7, 10]);
    assert.equal(ok.cityKey, "bastrop_tx");
    assert.equal(ok.rowCount, 7);
    const bad = screeningHeader({ depthInches: 61, cityKey: "" });
    assert.equal(bad.depthInches, null);
    assert.equal(bad.depthBasis, DEPTH_BOUND_BASIS);
    assert.match(bad.cityBasis, /no cityKey/);
  });

  it("the header carries the two-questions banner and the screening disclaimer verbatim", () => {
    const header = screeningHeader({ depthInches: 4, cityKey: "bastrop_tx" });
    assert.match(header.twoQuestions, /that is not a contradiction, it is the case this study exists to catch/);
    assert.match(header.disclaimer, /Screening-level drainage model/);
  });
});
