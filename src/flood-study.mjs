/* -------------------------------------------------- flood study (G-149 core)

The Development services Flood study tab stops being a paragraph and becomes a
screening screen: *which of the permits in flight are on parcels that pond*.
`_design/smartcity-flood-study/` is RATIFIED (2026-09-15) and is the authority
for every string and every state below. This module is the SERVER half -- the
engine client and the screening model. The screen itself renders what this
returns; it is not allowed to compute a state this module did not name.

WHY A NEW CLIENT AND NOT THE EXISTING ONE. The modeled drainage study is served
only by engine-api's flood-drainage route. In Property Explorer that route is
reached through a BFF that also enforces a paid PROPERTY entitlement, and this
product has no such session: it is a staff dashboard, not a buyer. The operator
resolved that on 2026-09-19 -- add a direct server-side engine client here. The
engine's own gate middleware is global (bearer + gate-front), and the BFF adds
nothing to the transport except the entitlement, which is a commercial gate on
a different product and not a data-contract difference. So this module speaks
the engine's route as the BFF does, minus the paywall.

TWO ENVIRONMENT VARIABLES, NO DEFAULT, NO FALLBACK -- the platform-base law
(src/platform-base.mjs) applied to a second upstream. `SMARTCITY_V1_PLATFORM_BASE`
is unset-able to a refusal because "a fallback host is how a retired host stays
live after everyone believes it was turned off". An engine base defaulted to a
Cloud Run hostname has exactly that failure, one product over, and it is worse
here: the engine base decides whether a figure on this screen is a real study or
a cached study from a revision nobody chose. So an unset base or key is a
per-parcel REFUSAL with a stated basis, never a request.

WHAT THIS MODULE DELIBERATELY DOES NOT DO. It does not map MyGov's parcel id
onto the engine's `parcelNodeId`. That mapping is `{countyFips}:{propId}` and
the county FIPS is NOT on a MyGov row (measured -- see `parcelNodeIdFor`), so
guessing it would attach a real Bastrop permit to a parcel in some other county.
It states the absence instead. See the OPEN thread in this lane's close.
*/

/** The engine origin. ONE variable, NO default -- see the module header. */
export const FLOOD_ENGINE_BASE_ENV = "HAUSKA_ENGINE_BASE";
/** The engine bearer. The same secret the retrieval/PE/BFF paths already hold. */
export const FLOOD_ENGINE_API_KEY_ENV = "HAUSKA_ENGINE_API_KEY";

export const FLOOD_ENGINE_BASE_UNSET_BASIS = `${FLOOD_ENGINE_BASE_ENV} unset`;
export const FLOOD_ENGINE_KEY_UNSET_BASIS = `${FLOOD_ENGINE_API_KEY_ENV} unset`;

/**
 * The engine study budget. 55s, the same number the BFF pins: the study is
 * honest work (DEM fetch + hydrology, ~15-45s) and an overrun is the honest
 * transient `engine_timeout`, never a gate error. Two copies of one number is
 * the CTRL-1 shape, but the BFF is in another repository and neither imports
 * the other; this one is asserted against the design's own basis text.
 */
export const FLOOD_ENGINE_TIMEOUT_MS = 55_000;

/* ------------------------------------------------------------- the depth

Move 3. `rainfallDepthInches` is a bare depth and there is NO storm duration in
the contract -- an earlier draft invented "over 24 hours" and it was removed for
that reason. Do not add one here or in any label this module returns.
*/
export const RAINFALL_DEPTH_MIN_INCHES = 0;
export const RAINFALL_DEPTH_MAX_INCHES = 60;

/** The design's own presets (gen.mjs `DEPTHS`). Shortcuts, not a vocabulary:
 *  any depth in the bound is legal and the basis text says so. */
export const DEPTH_PRESETS_INCHES = Object.freeze([2, 4, 7, 10]);

/** The engine's own rejection message, mirrored so the screen states the bound
 *  in the engine's words rather than a second phrasing of the same rule. */
export const DEPTH_BOUND_BASIS = "rainfallDepthInches must be a number in (0, 60].";

/* ------------------------------------------------- the five run states

Move 4. A study is a DEM fetch plus hydrology; running is a real state with a
real timeout class, and the run is NAMED. `jobStates` is the engine's own
vocabulary, not this product's.
*/
export const JOB_STATES = Object.freeze(["queued", "running", "ready", "failed"]);

/** Trap 4: an engine that did not answer and a parcel that does not pond are
 *  DIFFERENT RESULTS. These are the only two failures that are retryable, so a
 *  timed-out parcel is never written down as no ponding. */
export const RETRYABLE_ENGINE_FAILURES = Object.freeze([
  "engine_timeout",
  "engine_unreachable",
]);

/** The engine's own copy for the two retryable classes, verbatim from the
 *  source's `failureCopy` so the screen cannot soften a timeout into a result. */
export const ENGINE_FAILURE_COPY = Object.freeze({
  engine_timeout:
    "Flood & drainage engine did not accept the request in time. Try Generate again.",
  engine_unreachable: "Flood & drainage engine did not respond. Try Generate again.",
});

/** Trap 3: three different empty states that a careless screen collapses. */
export const NO_PONDING_LINE =
  "No modeled ponding on this parcel at the design storm. The drainage zones and flow paths below are the result.";

/** Trap 5 / G-130. The flood rail is authoritative for SERVING and provisional
 *  for CITATION, so the study downloads and citing it is refused ON THE PAGE.
 *  This sits on the ZONE card, which is what G-130 governs -- not under the
 *  modeled study, which it does not. */
export const ZONE_CITATION_REFUSED_BASIS =
  "Authoritative for serving, provisional for citation: G-130 refuses citing this determination in a review letter until a ground-truth sample runs against the rail's own output.";

/** Trap 2. The model is never promoted into the regulatory determination. */
export const MODEL_BADGE = "NOT A DETERMINATION";

export const SCREEN_DISCLAIMER =
  "Screening-level drainage model, not a drainage study or engineering determination. Verify drainage with a licensed engineer before design or permitting.";

/** The design's two-questions banner, verbatim. Move 2 in one string. */
export const TWO_QUESTIONS_BANNER =
  "Two different questions: this is a MODELED drainage study of what happens when it rains, not the regulatory FEMA flood zone. A parcel can sit entirely outside the FEMA zone and still be modeled here to pond badly — that is not a contradiction, it is the case this study exists to catch. This result does not change the parcel's FEMA determination.";

/* ------------------------------------------------------------ the client */

/** The configured engine origin, or "" when none is set. Trailing slashes are
 *  dropped so a copied value resolves to the same route; never `|| <a host>`. */
export function floodEngineBase(env = process.env) {
  return String(env?.[FLOOD_ENGINE_BASE_ENV] ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function floodEngineKey(env = process.env) {
  return String(env?.[FLOOD_ENGINE_API_KEY_ENV] ?? "").trim();
}

/** `{fips}:{propId}` -- the engine's parcel identity, the same shape the BFF
 *  validates. The prop id is permissive because it is the source's own id; the
 *  FIPS is strict because five digits is the whole county and a wrong one
 *  silently reads a parcel in another jurisdiction. */
export function isValidParcelNodeId(value) {
  return /^\d{5}:\S+$/.test(String(value ?? "").trim());
}

/**
 * The MyGov -> engine parcel bridge, and the honest refusal where it cannot run.
 *
 * A live Bastrop MyGov permit carries `parcelId` (measured: a bare prop id such
 * as "33383"). The engine's route wants `{countyFips}:{propId}` ("48021:33383").
 * The county FIPS is NOT a field on a MyGov row and this product is not allowed
 * to assume Bastrop's -- assuming it is how a permit in one county gets attached
 * to a parcel in another and the screen reports ponding for the wrong lot. So
 * this takes the FIPS from the caller, and REFUSES (with a basis, never a throw)
 * when either half is missing.
 */
export function parcelNodeIdFor({ countyFips, propId } = {}) {
  const fips = String(countyFips ?? "").trim();
  const prop = String(propId ?? "").trim();
  if (!fips) {
    return { ok: false, basis: "no county FIPS is known for this pack, so a permit's parcel id cannot be addressed as an engine parcel node" };
  }
  if (!/^\d{5}$/.test(fips)) {
    return { ok: false, basis: `county FIPS ${JSON.stringify(fips)} is not five digits` };
  }
  if (!prop) {
    return { ok: false, basis: "no parcel id on the source permit record" };
  }
  return { ok: true, parcelNodeId: `${fips}:${prop}` };
}

/** Parse a depth from a control or a query string against the engine's bound. */
export function parseDepthInches(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, basis: DEPTH_BOUND_BASIS };
  }
  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value) || value <= RAINFALL_DEPTH_MIN_INCHES || value > RAINFALL_DEPTH_MAX_INCHES) {
    return { ok: false, basis: DEPTH_BOUND_BASIS };
  }
  return { ok: true, value };
}

/**
 * The engine route for one parcel, or null when the base is unset or the parcel
 * id is not addressable. null rather than a throw: every caller here already has
 * an "unavailable" arm carrying a basis, and a refusal that flows through that
 * arm reaches the region.
 */
export function floodStudyRoute(kind, parcelNodeId, env = process.env) {
  if (kind !== "study" && kind !== "refresh") {
    throw new Error(`floodStudyRoute kind must be "study" or "refresh", got ${JSON.stringify(kind)}`);
  }
  if (!isValidParcelNodeId(parcelNodeId)) return null;
  const base = floodEngineBase(env);
  if (!base) return null;
  return `${base}/v1/property-nodes/${encodeURIComponent(String(parcelNodeId).trim())}/flood-drainage/${kind}`;
}

/**
 * Gate-front headers the engine requires on every non-health call. Mirrored
 * from the BFF's `buildFloodDrainageGateHeaders` with THIS product's identity:
 * a distinct package id and credential id so gate-front logging can tell the
 * Dashboards screening read from the Property Explorer report. Copying PE's
 * credential id would make two products indistinguishable in the one log that
 * exists to distinguish them.
 */
export function floodStudyGateHeaders({ requestId, tenantId } = {}) {
  return {
    "x-hauska-product": "cortex",
    "x-hauska-tenant-id": String(tenantId ?? "").trim() || "public-catalog",
    "x-hauska-package-id": "flood-study-screening",
    "x-hauska-access-tier": "public-paid",
    "x-hauska-gate-credential-id": "smartcity-dashboards-flood-study-lens",
    "x-hauska-request-id":
      String(requestId ?? "").trim() ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `scd-flood-${Date.now()}`),
  };
}

/**
 * Classify an engine failure. The two transient classes are the ONLY retryable
 * ones and they are named, not inferred from a status code: a 502 that means
 * "gate misconfigured" and a 502 that means "the engine was restarting" are not
 * the same result, and collapsing them is how a config error becomes an
 * infinite Retry button.
 */
export function classifyEngineFailure({ status = 0, error = "", message = "", aborted = false } = {}) {
  if (aborted) {
    return { kind: "engine_timeout", retryable: true, message: ENGINE_FAILURE_COPY.engine_timeout };
  }
  const err = String(error || "");
  const msg = String(message || "");
  if (err === "engine_gate_config") {
    return { kind: "engine_gate_config", retryable: false, message: msg || "engine gate is not configured" };
  }
  if (err === "engine_timeout") {
    return { kind: "engine_timeout", retryable: true, message: msg || ENGINE_FAILURE_COPY.engine_timeout };
  }
  if (err === "engine_unreachable" || status === 0) {
    return { kind: "engine_unreachable", retryable: true, message: msg || ENGINE_FAILURE_COPY.engine_unreachable };
  }
  return { kind: "engine_refused", retryable: false, message: msg || `engine HTTP ${status}` };
}

/**
 * The one HTTP read. `study` serves the engine's LAST-REFRESHED cached study and
 * `refresh` runs a new one; both answer the same payload shape. Depth is sent
 * ONLY on refresh -- the study GET takes no depth, because a cached study is the
 * depth it was run at and re-reading it at a different depth would be a figure
 * that disagrees with its own cache key.
 */
export async function fetchFloodStudy(
  parcelNodeId,
  { env = process.env, fetchImpl = globalThis.fetch, refresh = false, depthInches, address, countyName, tenantId } = {},
) {
  const base = floodEngineBase(env);
  const key = floodEngineKey(env);
  if (!base) return { ok: false, kind: "engine_base_unset", retryable: false, basis: FLOOD_ENGINE_BASE_UNSET_BASIS };
  if (!key) return { ok: false, kind: "engine_key_unset", retryable: false, basis: FLOOD_ENGINE_KEY_UNSET_BASIS };
  const url = floodStudyRoute(refresh ? "refresh" : "study", parcelNodeId, env);
  if (!url) return { ok: false, kind: "parcel_not_addressable", retryable: false, basis: `parcelNodeId ${JSON.stringify(parcelNodeId)} does not match {fips}:{propId}` };

  let body;
  if (refresh) {
    body = JSON.stringify({
      ...(address ? { address } : {}),
      ...(countyName ? { countyName } : {}),
      ...(depthInches !== undefined ? { rainfallDepthInches: depthInches } : {}),
    });
  }

  let res;
  try {
    res = await fetchImpl(url, {
      method: refresh ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json",
        ...(refresh ? { "content-type": "application/json" } : {}),
        ...floodStudyGateHeaders({ tenantId }),
      },
      ...(refresh ? { body } : {}),
      signal: AbortSignal.timeout(FLOOD_ENGINE_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      kind: "engine_unreachable",
      retryable: true,
      basis: ENGINE_FAILURE_COPY.engine_unreachable,
      detail: String(err?.message || err),
    };
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const engineError = payload && typeof payload === "object" ? String(payload.error || "") : "";
    const engineMessage = payload && typeof payload === "object" ? String(payload.message || "") : "";
    const classified = classifyEngineFailure({
      status: res.status,
      error: engineError || (res.status === 504 ? "engine_timeout" : ""),
      message: engineMessage,
    });
    return { ok: false, ...classified, status: res.status, basis: classified.message };
  }

  const study = payload && typeof payload === "object" ? payload.data?.study : null;
  if (!study || typeof study !== "object") {
    // A payload without a study object is an upstream error, never a fabricated
    // empty study -- the same rule the BFF applies.
    return {
      ok: false,
      kind: "engine_refused",
      retryable: false,
      basis: "Engine flood-drainage payload carried no study object.",
    };
  }
  return { ok: true, study, parcelNodeId };
}

/* ------------------------------------------- the depth-to-return-period pair

Trap 2, and the correction that over-shot it. The engine pairs a return period
to a depth through `rainfallCurve` (NOAA Atlas 14), rendering its own design
storm as `100-yr (NOAA Atlas 14)` and a depth passed in the request as
`≈N-yr equivalent (interpolated)`. BOTH are correct; silently showing one while
the other is meant is not. The first correction after 2026-09-15 deleted the
interval entirely, which was also wrong.

The interpolation is log-linear over the curve (the standard PFDS convention),
copied from the client's `returnPeriodYearsForDepthInches` so the control and
the engine's own PDF label cannot disagree. Clamps at the curve's ends and never
extrapolates past NOAA's published range.
*/
export function returnPeriodYearsForDepthInches(curve, depthInches) {
  if (!Array.isArray(curve) || curve.length === 0) return null;
  const pts = [...curve]
    .filter((p) => Number.isFinite(p?.returnPeriodYears) && Number.isFinite(p?.depthInches))
    .sort((a, b) => a.returnPeriodYears - b.returnPeriodYears);
  if (pts.length === 0) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (depthInches <= first.depthInches) {
    return { value: first.returnPeriodYears, clamped: depthInches < first.depthInches ? "low" : undefined };
  }
  if (depthInches >= last.depthInches) {
    return { value: last.returnPeriodYears, clamped: depthInches > last.depthInches ? "high" : undefined };
  }
  for (let i = 1; i < pts.length; i += 1) {
    const lo = pts[i - 1];
    const hi = pts[i];
    if (depthInches <= hi.depthInches) {
      const t = (depthInches - lo.depthInches) / (hi.depthInches - lo.depthInches);
      const logYears =
        Math.log(lo.returnPeriodYears) + (Math.log(hi.returnPeriodYears) - Math.log(lo.returnPeriodYears)) * t;
      return { value: Math.exp(logYears) };
    }
  }
  return { value: last.returnPeriodYears };
}

/** The engine's own design storm, quoted as the engine renders it. */
export const ENGINE_DESIGN_STORM_LABEL = "100-yr (NOAA Atlas 14)";

/**
 * WHICH pair a reader is looking at. Named, never guessed: an unknown source
 * returns null so the basis line states the absence rather than defaulting to
 * the engine's label and attributing an interpolated value to NOAA.
 */
export function rainfallBasisLabel(study) {
  const source = String(study?.rainfallSource ?? "").trim();
  if (source === "noaa-atlas14" || source === "default") {
    return { ok: true, label: ENGINE_DESIGN_STORM_LABEL, source };
  }
  if (source === "parameter") {
    const depth = study?.rainfallDepthInches;
    const years = returnPeriodYearsForDepthInches(study?.rainfallCurve, depth);
    if (years === null) {
      return {
        ok: false,
        basis: `the study ran on a supplied depth of ${depth} inches but carries no rainfallCurve, so its return-period equivalent is not known`,
      };
    }
    return {
      ok: true,
      label: `≈${Math.round(years.value)}-yr equivalent (interpolated)`,
      source,
      clamped: years.clamped,
    };
  }
  return { ok: false, basis: `the study names no rainfallSource (${JSON.stringify(source)}), so which pair it is reading is not known` };
}

/* --------------------------------------------------- the two determinations

Move 2. Separate cards, separate authority, SEPARATE VINTAGE. The zone card is
the one G-130 governs, so the citation refusal lives there and not under the
modeled study, which G-130 does not govern.
*/
export function zoneDetermination({ zone, authority, effectiveDate, vintageBasis, vintageReadAt } = {}) {
  const code = String(zone ?? "").trim();
  return {
    kind: "zone",
    title: "FEMA flood zone",
    authority: authority || "parcel-record flood rail",
    zone: code || null,
    zoneBasis: code ? undefined : "no flood zone on the parcel record for this read",
    vintage: effectiveDate || null,
    vintageBasis: vintageBasis || (effectiveDate ? undefined : "the rail returned no edition date, so this determination has no vintage"),
    vintageReadAt: vintageReadAt || null,
    // Trap 5. A refused AFFORDANCE, not a sentence: `citation` carries the
    // refusal so the control can be drawn disabled with the reason attached.
    citation: { allowed: false, basis: ZONE_CITATION_REFUSED_BASIS },
  };
}

export function modelDetermination({ study, depthInches } = {}) {
  return {
    kind: "model",
    title: "Modeled drainage study",
    badge: MODEL_BADGE,
    authority: "engine hydrology over DEM",
    rainfallBasis: study ? rainfallBasisLabel(study) : { ok: false, basis: "no study was read" },
    rainfallDepthInches: Number.isFinite(depthInches) ? depthInches : study?.rainfallDepthInches ?? null,
    disclaimer: SCREEN_DISCLAIMER,
    // A model is never a determination, so it has no dated vintage to carry:
    // it has a run. Different word on purpose -- "vintage" reads as regulatory.
    generatedAt: study?.generatedAt || null,
  };
}

/* ------------------------------------------------------- the run/view state

Trap 3, the whole reason this function exists as ONE function. Three states that
a careless screen collapses into "nothing here":

  - the engine ran and declined   -> honestEmpty.reason, rendered VERBATIM
  - the engine ran and found none -> NO_PONDING_LINE
  - the engine did not answer     -> a named retryable failure, NEVER no-ponding
  - plus the pre-run queued/running states, which are not results at all

Order matters and is the assertion: honestEmpty is checked before any ponding
arithmetic, because an honestEmpty study carries no geometry to measure and a
screen that measured it would report 0 percent ponding for a parcel the engine
declined to model.
*/
export function studyViewState({ job, study, error } = {}) {
  if (job === "queued") return { state: "queued", basis: "queued; no engine run has started for this parcel" };
  if (job === "running") return { state: "running", basis: "the engine run is in progress" };
  if (error) {
    const classified = classifyEngineFailure(error);
    return {
      state: "failed",
      failure: classified.kind,
      retryable: classified.retryable,
      basis: classified.message,
      // Trap 4, stated where the state is produced rather than trusted to every
      // caller: a failure is not a ponding result.
      ponding: "not-measured",
    };
  }
  if (study && typeof study === "object") {
    if (study.honestEmpty !== undefined) {
      return {
        state: "ready",
        ponding: "declined",
        reason: String(study.honestEmpty?.reason ?? "").trim() || null,
        reasonBasis: String(study.honestEmpty?.reason ?? "").trim() ? undefined : "the engine returned honestEmpty without a reason",
        basis: "the engine ran and declined to model this parcel; its reason is rendered verbatim",
      };
    }
    const share = pondingSharePercent(study);
    if (share === null) {
      return {
        state: "ready",
        ponding: "unmeasured",
        basis: "the study carries no ponding share on this read, so whether it ponds is not stated",
      };
    }
    return share > 0
      ? { state: "ready", ponding: "ponds", sharePercent: share, basis: `modeled ponding across ${share} percent of the parcel` }
      : { state: "ready", ponding: "none", sharePercent: 0, line: NO_PONDING_LINE, basis: "the engine ran and modeled no ponding at this depth" };
  }
  return { state: "failed", failure: "engine_unreachable", retryable: true, basis: "no study and no error was supplied to the screen", ponding: "not-measured" };
}

/**
 * The ponding share, if the study states one this product can read.
 *
 * DELIBERATELY NARROW. The design's Depth artboard draws a share (34 and 73
 * percent) and requires the drawing to be computed from the stated share
 * against the ring's own area, so the figure has to be the study's own. Which
 * field carries it is NOT yet confirmed against a live engine payload -- the
 * design's facts name `stats` but not the key. Rather than invent a field name
 * and render a confident zero, this reads only keys it has seen documented and
 * returns null otherwise, which surfaces as `unmeasured`. Confirming the key
 * against a live study is an OPEN thread in this lane's close.
 */
export function pondingSharePercent(study) {
  const candidate = study?.stats?.pondingPercent ?? study?.stats?.pondingSharePercent;
  if (Number.isFinite(candidate)) return candidate;
  const share = study?.stats?.pondingShare;
  if (Number.isFinite(share)) return Math.round(share * 100);
  return null;
}

/* ------------------------------------------------------------ the screening

Move 1. The list answers the tab's own question -- which PERMITS IN FLIGHT are
on parcels that pond -- so it is keyed by permit, not by parcel, and a permit
whose parcel cannot be addressed is a row with a stated absence rather than a
row that quietly disappears. A permit that vanishes from a screening list reads
as "screened and clear", which is the opposite of what it is.
*/
export function screeningRow({ permit, countyFips, determination } = {}) {
  const id = String(permit?.recordId ?? "").trim() || "unknown";
  const address = parcelNodeIdFor({ countyFips, propId: permit?.place?.parcelNodeId });
  if (!address.ok) {
    return {
      id,
      subject: permit?.subject || "Untitled permit",
      address: permit?.place?.label || null,
      status: permit?.status || "unknown",
      parcelNodeId: null,
      state: "unaddressable",
      basis: address.basis,
      zone: null,
      model: null,
    };
  }
  const zone = determination?.zone ?? null;
  const view = determination?.view ?? { state: "queued", basis: "queued; no engine run has started for this parcel" };
  return {
    id,
    subject: permit?.subject || "Untitled permit",
    address: permit?.place?.label || null,
    status: permit?.status || "unknown",
    parcelNodeId: address.parcelNodeId,
    state: view.state,
    failure: view.failure ?? null,
    retryable: view.retryable ?? false,
    ponding: view.ponding ?? null,
    sharePercent: view.sharePercent ?? null,
    basis: view.basis,
    zone: zone
      ? { code: zone.zone, authority: zone.authority, vintage: zone.vintage, vintageBasis: zone.vintageBasis, citationAllowed: zone.citation.allowed }
      : null,
    model: determination?.model ?? null,
  };
}

/**
 * Rank the screening list. Move 3: changing the depth re-ranks the WHOLE list,
 * which is what turns a per-parcel tool into an instrument.
 *
 * Rank order, and it is a ranking and not a sort because the order carries the
 * argument: parcels that pond first, worst first; then parcels the engine
 * DECLINED or could not answer, because an unknown is work owed and belongs
 * above a clear parcel; then clear parcels; then unaddressable permits, which
 * are a data gap rather than a screening result.
 */
export const SCREENING_RANK = Object.freeze(["ponds", "declined", "unmeasured", "failed", "running", "queued", "none", "unaddressable"]);

export function rankScreeningRows(rows) {
  const rankOf = (row) => {
    if (row.state === "unaddressable") return SCREENING_RANK.indexOf("unaddressable");
    if (row.state === "failed") return SCREENING_RANK.indexOf("failed");
    if (row.state === "running") return SCREENING_RANK.indexOf("running");
    if (row.state === "queued") return SCREENING_RANK.indexOf("queued");
    return SCREENING_RANK.indexOf(row.ponding || "unmeasured");
  };
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const byRank = rankOf(a) - rankOf(b);
    if (byRank !== 0) return byRank;
    const share = (r) => (Number.isFinite(r.sharePercent) ? r.sharePercent : -1);
    const byShare = share(b) - share(a);
    if (byShare !== 0) return byShare;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * The screening header: the depth the whole list was run at, and where that
 * depth came from. Changing the depth re-runs every parcel, so the header is
 * the only honest place to say what the list is a list OF.
 */
export function screeningHeader({ depthInches, cityKey, rowCount } = {}) {
  const parsed = parseDepthInches(depthInches);
  return {
    title: "Flood & drainage screening",
    question: "which of the permits in flight are on parcels that pond",
    depthInches: parsed.ok ? parsed.value : null,
    depthBasis: parsed.ok ? undefined : parsed.basis,
    presets: DEPTH_PRESETS_INCHES,
    cityKey: String(cityKey ?? "").trim() || null,
    cityBasis: String(cityKey ?? "").trim() ? undefined : "no cityKey was supplied; this screening is not attributed to a pack",
    rowCount: Number.isInteger(rowCount) ? rowCount : null,
    twoQuestions: TWO_QUESTIONS_BANNER,
    disclaimer: SCREEN_DISCLAIMER,
  };
}
