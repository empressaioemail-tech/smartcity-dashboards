/**
 * ---------------------------------------------------------------------------
 * G-152. THE PUBLIC WORKS LENS.
 *
 * The design is `_design/smartcity-public-works-lens/`, RATIFIED 2026-09-17,
 * four artboards (Main, Calls, Blocked, Empty), and it ships with its own
 * `check.mjs` that reads the artboards against `source-state.json`, which is
 * this product's own composer output. This file is the BUILT side of that
 * comparison: the same design, rendered by the product, from the product's
 * composers, with no figure typed by hand.
 *
 * WHAT THIS LENS IS, from the registry rather than from memory. src/domains.mjs
 * registers exactly two domains under lensId "public-works":
 *
 *   cip-projects     region "Capital projects"   gatedBy powerbi
 *   call-analytics   region "Call analytics"     gatedBy goto
 *
 * TWO REGIONS OF DIFFERENT UNITS, AND THAT IS THE LENS. A capital project is one
 * row per project. A call record is one bucket per queue per relative day, and
 * that domain says so in its own words: "this domain is the one whose RECORD IS
 * NOT AN EVENT". Drawing them as two instances of one component would assert
 * they are the same shape, so they SWITCH rather than stack, and neither is
 * normalised onto the other's scale.
 *
 * THE FOUR STATES, AND WHY THE MATRIX EXISTS. Phase and status are two
 * questions: phase is where a project sits in its own lifecycle, status is
 * whether it is in trouble. src/domains/cip-projects.mjs declares STATUS_PHASES
 * - which phases each status may sit in - so eight of the twenty cells on the
 * generated pack CANNOT OCCUR BY RULE. A grid that folded those into zeros would
 * put eight invented readings into a register and make it look like it has holes
 * in it. So a cell here is one of four, and all four render differently:
 *
 *   count           n projects sit here                       a reading of n
 *   measured-zero   this cell can occur and none does         a reading of 0
 *   unmeasured      the cell can occur and nothing was read   no reading at all
 *   cannot-occur    the product's own rule forbids it         hatched, never 0
 *
 * and a fifth sits above them at SURFACE level, not cell level:
 *
 *   absent          the domain is not registered, so the surface does not exist
 *
 * `NOT_REGISTERED` obtains when the row is forced nowhere and the text says so.
 * Absent, zero and unmeasured stay apart, and `src/public-works-lens.test.mjs`
 * plants a forbidden cell rendered as 0 and proves this file refuses it.
 *
 * NO FIGURE OF MONEY APPEARS ON THIS LENS AT ALL. A capital improvement register
 * is a budget document everywhere else. This one carries no budget, no spend, no
 * percent of budget and no encumbrance, and the domain states the refusal rather
 * than leaving an omission: "a money number beside a city name is a claim about
 * that city's finances". Nothing in this file formats a currency, and the
 * design's check.mjs refuses a money token on any board.
 *
 * WHAT THE BLOCKED CARD IS. A region that cannot show data states FOUR things
 * and never fewer: its state, its basis VERBATIM from whatever produced it, what
 * KIND of thing would move it, and when that was last read. "Not read" on its
 * own is the sentence that has been costing this product a year of ambiguity.
 * The four kinds are not interchangeable: a CONSENT is a human completing an
 * OAuth flow, an ENTITLEMENT is a scope on a vendor credential, and a source
 * that does not exist is neither. Neither of the first two is an engineering
 * task, and this file renders them as what they are: no error state, no retry
 * affordance, no "contact support" path, because nobody reading the screen can
 * fix either one.
 * ---------------------------------------------------------------------------
 */

import { DOMAIN_REGISTRY, composeDomainById } from "./domains.mjs";
import { PROJECT_PHASE_VALUES, PROJECT_STATUS_VALUES } from "./adapters.mjs";
import { STATUS_PHASES } from "./domains/cip-projects.mjs";
import { DOMAIN_STATUSES } from "./fixture-seam.mjs";
import { grantedKindIds } from "./city-identity.mjs";

export const PUBLIC_WORKS_LENS_ID = "public-works";

/**
 * The two regions, READ OFF THE REGISTRY. A hand-written pair here would drift
 * from src/domains.mjs the first time a region moved, so the count is asserted
 * instead: a lane that adds a third region to this lens gets a loud failure
 * rather than a page that silently stops drawing it.
 */
export const PUBLIC_WORKS_REGIONS = Object.freeze(
  DOMAIN_REGISTRY.filter((d) => d.lensId === PUBLIC_WORKS_LENS_ID).map((d) =>
    Object.freeze({ domainId: d.id, region: d.region, gatedBy: d.gatedBy, recordType: d.recordType }),
  ),
);
if (PUBLIC_WORKS_REGIONS.length !== 2) {
  throw new Error(
    `public-works carries ${PUBLIC_WORKS_REGIONS.length} registered regions; the lens is designed for two ` +
      `(cip-projects, call-analytics). Re-derive the design or fix the registry, do not paper over it here.`,
  );
}

/** Cell states, closed. An added word fails the test rather than shipping. */
export const MATRIX_CELL_STATES = Object.freeze([
  "count",
  "measured-zero",
  "unmeasured",
  "cannot-occur",
]);

/** Surface states, closed: what the grid AS A WHOLE is doing. */
export const MATRIX_SURFACE_STATES = Object.freeze(["measured", "unmeasured", "absent"]);

/**
 * HOW A REGION IS READING, and it is derived, never typed.
 *
 *   measured      the composer returned records (a generated pack, or a live read)
 *   granted-live  a pack that generates nothing, whose kind IS granted: the
 *                 surface is wired to a live feed this harness does not read, so
 *                 the honest answer is UNREAD and not zero
 *   no-source     a pack that generates nothing and has granted nothing: the
 *                 region is BUILT, and what is absent is a source
 *   absent        the domain is not registered at all: the surface does not exist
 *   unread        the shipped document has not been told which city it describes
 *                 (pack = null). Not a fact about a city at all, which is why it
 *                 is the one reading whose badge word is Not read.
 */
export const REGION_READINGS = Object.freeze(["measured", "granted-live", "no-source", "absent", "unread"]);

export function regionReading(domain, grantedKinds) {
  if (domain.status === "not-registered") return "absent";
  if (domain.status === "ok") return "measured";
  if (grantedKinds && grantedKinds.has(domain.gatedBy)) return "granted-live";
  return "no-source";
}

/**
 * The shipped badge vocabulary is CLOSED (web/index.html at this commit): Empty,
 * Not built, Not read, Preview, Demo records, Not connected, Unread, Partial,
 * Mounted, Restricted. A reading maps onto one of those words and this is the
 * only place the mapping exists, so an invented state word cannot reach a page.
 */
export const BADGE_FOR_READING = Object.freeze({
  measured: "Demo records",
  "granted-live": "Unread",
  "no-source": "Empty",
  absent: "Not built",
  unread: "Not read",
});

export function regionBadge(region) {
  if (region.domainId === "call-analytics" && region.reading === "granted-live") {
    /**
     * One lens, two obstacles, two different words, and the difference is the
     * point of the blocked board: Power BI is granted AND ANSWERS, GoTo is
     * granted and DECLINES for want of a consent. "Unread" would flatten them.
     */
    return "Not connected";
  }
  return BADGE_FOR_READING[region.reading];
}

/* ------------------------------------------------------------ the register */

/** The register is one row per project, in the composer's order, and there is
 *  NO COMPLETION COLUMN. A generated record carries no completion field, so the
 *  column is absent rather than blank: a blank cell in a percent column reads as
 *  zero percent complete, which is a claim nobody made. */
export const REGISTER_PAGE_SIZE = 10;

/* ------------------------------------------------------- the blocked card */

/**
 * OBSTACLE KINDS, from the module header of src/vendor-live.mjs. These are
 * RECORDED readings, live-verified 2026-09-03, and the card says so: a recorded
 * reading is never rendered as a current one, and the exact live basis string is
 * UNREAD by this product until a real read happens. No person is named on any of
 * these, because a page that names a person to chase is a page that will be read
 * as a task assignment.
 */
export const OBSTACLE_KINDS = Object.freeze({
  answers: Object.freeze({
    kind: "answers",
    headline: "A vendor that answers",
    obstacle: "None recorded. This is the one region on the lens with a vendor that returns data.",
    who: "Nobody. Nothing about this region is blocked.",
    state: "Reading, recorded",
    tone: "p-ok",
  }),
  consent: Object.freeze({
    kind: "consent",
    headline: "A vendor that declines",
    obstacle: "A CONSENT. Not an engineering task, not a build, not a bug.",
    who: "The city's phone-system administrator, by role. No person is named on this page.",
    state: "unavailable",
    tone: "p-warn",
  }),
  entitlement: Object.freeze({
    kind: "entitlement",
    headline: "A credential without the scope",
    obstacle: "AN ENTITLEMENT. The account is connected; the API credential does not carry the apparatus and assets scope.",
    who: "The vendor, on request from the city's fire administrator. No person is named on this page.",
    state: "unavailable",
    tone: "p-warn",
  }),
});

/** Which recorded obstacle each gated kind is carrying, from the module header.
 *  A kind that is absent here has no obstacle recorded and is not guessed at. */
export const OBSTACLE_FOR_KIND = Object.freeze({
  powerbi: "answers",
  goto: "consent",
  firstdue: "entitlement",
});

export const VENDOR_LIVE_READING = Object.freeze({
  recordedAt: "2026-09-03",
  sourceFile: "src/vendor-live.mjs module header",
  reReadOn: null,
  basis:
    "Live-verified 2026-09-03: Samsara, Spireon and PowerBI return real data. FirstDue returns a real, " +
    "specific 403 (the credential lacks apparatus/assets scope). GoTo returns \"not authorized\" " +
    "(needsAuth: true) -- the OAuth consent flow has never been completed by a human. Neither is a " +
    "code defect; both need a real-world action outside engineering.",
});

/** The last-read sentence, identical in shape on every blocked card. */
export function lastReadFact() {
  return `${VENDOR_LIVE_READING.recordedAt}, recorded in the ${VENDOR_LIVE_READING.sourceFile}. Not re-read since.`;
}

/**
 * The four facts, in the design's order, for one region. Returns [] for a region
 * that is not blocked, because a card that states an obstacle where there is
 * none is the mirror of the defect this component exists to prevent.
 */
export function blockedFacts(region) {
  if (region.reading !== "granted-live") return [];
  const obstacle = OBSTACLE_KINDS[OBSTACLE_FOR_KIND[region.gatedBy]] || null;
  if (!obstacle) return [];
  return [
    { k: "Obstacle kind", v: obstacle.obstacle },
    { k: "Basis", v: VENDOR_LIVE_READING.basis, mono: true },
    { k: "Who moves it", v: obstacle.who },
    { k: "Last read", v: lastReadFact(), mono: true },
    { k: "Records", v: "Unread. A count belongs to a live read, never to a page that has not run one.", mono: true },
  ];
}

/**
 * The region's own state block, as ONE object rather than as four sentences
 * written inside a painter. A region that is built and has no source states its
 * state, its basis verbatim, and the composer's own status; the words live here
 * so the server painter and the browser painter cannot say two different things
 * about one region, and so a sentence is never authored below the seam.
 *
 * `where` is the pack, and it is not decoration: on the bundled document the
 * region has not been read for THIS PACK, and on a named city with no grant it
 * has not been read for THIS CITY, and those are different findings.
 */
const STATE_BLOCK_TEXT = Object.freeze({
  "cip-projects": Object.freeze({
    subject: "The capital projects register",
    body:
      "The region exists. What is absent is a source, and the sentence says which. A city reading this " +
      "knows it needs a grant, not a build.",
  }),
  "call-analytics": Object.freeze({
    subject: "Call handling",
    body:
      "Same region, same sentence as its peer, and it still prints its own basis: two regions in one state " +
      "on one pack is a coincidence of that pack, not a property of the lens.",
  }),
});

export function regionStateBlock(region) {
  const text = STATE_BLOCK_TEXT[region.domainId];
  if (!text) throw new Error(`no state block text for region: ${region.domainId}`);
  const where = region.reading === "unread" ? "this pack" : "this city";
  return {
    kicker: "Region built, no source",
    headline: `${text.subject} has not been read for ${where}.`,
    body: text.body,
    basis: `Basis, verbatim from the composer: ${region.basis}. Counting rule: ${region.countingRule}.`,
    tail: region.status
      ? `status: ${region.status} · granted: ${region.granted} · generated: ${region.generated}`
      : `no region payload has been read for ${where}, so there is no composer status to report`,
  };
}

/**
 * The obstacle a region is carrying, DERIVED ONCE FOR BOTH PAINTERS. Headline,
 * state word and tone live in OBSTACLE_KINDS above; a browser painter that
 * looked them up again would be a second copy of that map.
 */
export function obstacleFor(region) {
  const kind = OBSTACLE_FOR_KIND[region.gatedBy];
  return kind ? OBSTACLE_KINDS[kind] : null;
}

export function blockedCardFor(region) {
  const obstacle = obstacleFor(region);
  const facts = blockedFacts(region);
  if (!obstacle || !facts.length) return null;
  return {
    kind: obstacle.kind,
    headline: obstacle.headline,
    state: obstacle.state,
    tone: obstacle.tone,
    facts,
    footnote: `status: ${region.liveStatus || "unavailable"} · recorded ${VENDOR_LIVE_READING.recordedAt}, never re-read by this page`,
  };
}

/* --------------------------------------------------------- the two axes */

const ORDERED_STATUS_IDS = PROJECT_STATUS_VALUES.map((s) => s.id);

/**
 * The matrix. PHASE IS THE ROW AND STATUS IS THE COLUMN, which is not arbitrary:
 * phase names are the long ones and a row label has room while a column header
 * at this width does not.
 *
 * `axis` is injectable so the four-state fixture can drive this component
 * without inventing a pack, and so a product whose vocabulary moves fails a test
 * rather than rendering a grid the product does not agree with.
 */
export function matrixState(domain, axis = {}) {
  const statuses = axis.statuses || PROJECT_STATUS_VALUES;
  const phases = axis.phases || PROJECT_PHASE_VALUES;
  const statusPhases = axis.statusPhases || STATUS_PHASES;
  const reading = axis.reading || (domain.status === "ok" ? "measured" : domain.status === "not-registered" ? "absent" : "unmeasured");
  const records = Array.isArray(domain.records) ? domain.records : [];

  const surface = reading === "absent" ? "absent" : reading === "measured" ? "measured" : "unmeasured";
  if (!MATRIX_SURFACE_STATES.includes(surface)) throw new Error(`unknown matrix surface state: ${surface}`);

  const base = {
    surface,
    status: domain.status,
    statuses: statuses.map((s) => ({ id: s.id, label: s.label })),
    phases,
    countRule:
      `one cell per phase per status, counted off the same records as the register: ${domain.countingRule}`,
  };

  if (surface === "absent") {
    return {
      ...base,
      // No grid at all, and that is the state: the surface does not exist, so
      // there is nothing for a zero or an "unread" to be about.
      absent: true,
      rows: [],
      colTotals: [],
      grand: null,
      tally: { count: 0, "measured-zero": 0, unmeasured: 0, "cannot-occur": 0 },
      reconciles: null,
      reconcileBasis:
        `${domain.domainId} is absent from DOMAIN_REGISTRY, so this surface does not exist and this ` +
        `component renders no grid. Absent is not zero and it is not unmeasured: there is no reading to be had.`,
    };
  }

  const valueAt = (statusId, phaseId) =>
    records.filter((r) => r.status === statusId && r.phase === phaseId).length;

  const rows = phases.map((phase) => {
    const cells = statuses.map((s) => {
      const forbidden = !statusPhases[s.id].includes(phase);
      const tone = TONE_VAR[s.id] || "--sc-ink";
      if (forbidden) return { phase, status: s.id, state: "cannot-occur", value: null, forbidden: true, tone };
      if (surface === "unmeasured") return { phase, status: s.id, state: "unmeasured", value: null, forbidden: false, tone };
      const n = valueAt(s.id, phase);
      return {
        phase,
        status: s.id,
        state: n === 0 ? "measured-zero" : "count",
        value: n,
        forbidden: false,
        tone,
      };
    });
    const measured = cells.filter((c) => c.state === "count" || c.state === "measured-zero");
    return {
      phase,
      cells,
      total: measured.length === 0 ? null : measured.reduce((n, c) => n + c.value, 0),
    };
  });

  const colTotals = statuses.map((s) => {
    const cells = rows.map((r) => r.cells.find((c) => c.status === s.id));
    const measured = cells.filter((c) => c.state === "count" || c.state === "measured-zero");
    return measured.length === 0 ? null : measured.reduce((n, c) => n + c.value, 0);
  });

  const tally = { count: 0, "measured-zero": 0, unmeasured: 0, "cannot-occur": 0 };
  for (const row of rows) for (const cell of row.cells) tally[cell.state] += 1;

  const grand = surface === "measured" ? rows.reduce((n, r) => n + (r.total || 0), 0) : null;
  const offAxis = surface === "measured" ? records.filter((r) => !phases.includes(r.phase)).length : 0;
  const offStatus = surface === "measured" ? records.filter((r) => !ORDERED_STATUS_IDS.includes(r.status)).length : 0;
  const reconciles = surface === "measured" ? grand === domain.recordCount && offAxis === 0 && offStatus === 0 : null;

  return {
    ...base,
    absent: false,
    rows,
    colTotals,
    grand,
    tally,
    reconciles,
    reconcileBasis:
      surface === "unmeasured"
        ? `Nothing on this grid has been read, so every cell that can occur carries no reading at all. ` +
          `The ${tally["cannot-occur"]} hatched cells are hatched by the product's own rule and are a ` +
          `property of the axis, which is why they are still drawn.`
        : `${grand} counted across the grid against ${domain.recordCount} records in the register` +
          `${offAxis + offStatus === 0 ? "" : `, with ${offAxis} record(s) off the phase axis and ${offStatus} off the status axis`}` +
          `. A grid that did not reconcile with its own register would be a finding, not a rounding.`,
  };
}

/**
 * The register's own model, so the browser painter does not have to re-slice a
 * record list or re-map a status to the word the chip carries. `measured` is the
 * same determination the region reading makes.
 */
export function registerModel(domain) {
  const records = Array.isArray(domain.records) ? domain.records : [];
  const measured = domain.status === "ok";
  return {
    measured,
    records: measured
      ? records.slice(0, REGISTER_PAGE_SIZE).map((r) => ({
          ...r,
          statusLabel: (PROJECT_STATUS_VALUES.find((s) => s.id === r.status) || { label: r.status }).label,
        }))
      : [],
    shown: measured ? Math.min(REGISTER_PAGE_SIZE, records.length) : 0,
    total: measured ? domain.recordCount : 0,
  };
}

/**
 * The call grid. src/domains/call-analytics.mjs emits one record per QUEUE per
 * RELATIVE DAY, and the product renders two tables, "By queue" and "By relative
 * day". They are not two datasets: they are the ROW MARGIN and the COLUMN MARGIN
 * of the same buckets, and both sum to the same total. Two numbers that should
 * agree and are never shown agreeing is a reconciliation nobody performs, so
 * they are drawn once, with both margins and the corner total.
 */
export function callsGridState(domain) {
  const extras = domain.extras || {};
  const records = Array.isArray(domain.records) ? domain.records : [];
  const queues = Array.isArray(extras.queues) ? extras.queues : [];
  const daily = Array.isArray(extras.daily) ? extras.daily : [];
  const totals = extras.totals || null;
  const read = domain.status === "ok";

  const byKey = new Map(records.map((r) => [`${r.queueRef}|${r.dayOffset}`, r]));
  const zeroAbandoned = records.filter((r) => r.callsAbandoned === 0);
  const max = read ? Math.max(0, ...records.map((r) => r.callsOffered)) : 0;
  /**
   * THE WASH IS PART OF THE READING, so it is computed here and carried on the
   * cell rather than recomputed by a painter: a browser that recomputed it from
   * a different max would draw two grids that disagree while both claiming to be
   * the same numbers.
   */
  const tintFor = (value) => {
    const pct = max === 0 ? 0 : value / max;
    return `rgba(43,95,199,${(0.08 + pct * 0.34).toFixed(2)})`;
  };

  const rows = read
    ? queues.map((q) => ({
        ref: q.queueRef,
        label: q.queueLabel,
        total: q.callsOffered,
        cells: daily.map((d) => {
          const r = byKey.get(`${q.queueRef}|${d.dayOffset}`);
          if (!r) return { state: "unmeasured", value: null, abandoned: null, tint: null };
          return {
            state: r.callsOffered === 0 ? "measured-zero" : "count",
            value: r.callsOffered,
            abandoned: r.callsAbandoned,
            tint: tintFor(r.callsOffered),
          };
        }),
      }))
    : [];

  const days = daily.map((d) => ({ label: d.dayLabel, offset: d.dayOffset }));
  const dayTotals = read ? daily.map((d) => d.callsOffered) : [];
  const rowMarginSum = rows.reduce((n, r) => n + r.total, 0);
  const colMarginSum = dayTotals.reduce((n, r) => n + r, 0);
  const grand = read ? (totals ? totals.callsOffered : colMarginSum) : null;

  return {
    read,
    status: domain.status,
    queues: queues.map((q) => ({ ref: q.queueRef, label: q.queueLabel })),
    days,
    rows,
    dayTotals,
    rowMarginSum,
    colMarginSum,
    grand,
    max,
    measured: read ? records.length : 0,
    zeroAbandoned: zeroAbandoned.map((r) => `${r.queueRef} ${r.dayLabel}`),
    totalCells: rows.reduce((n, r) => n + r.cells.length, 0),
    unmeasuredCells: rows.reduce((n, r) => n + r.cells.filter((c) => c.state === "unmeasured").length, 0),
    reconciles: read ? rowMarginSum === colMarginSum && (totals ? totals.callsOffered === rowMarginSum : true) : null,
    reconcileBasis: read
      ? `Both margins sum to ${rowMarginSum}: the row margin (queue) and the column margin (day) are the two ` +
        `readings of the same ${records.length} buckets, and the corner total is the same number a third time.`
      : "Neither margin has been read on this pack, so this grid claims no total at all.",
    countingRule: totals ? totals.countingRule : domain.countingRule,
    excludedFamilies: extras.excludedFamilies || null,
    identityBasis: records[0] ? records[0].identityBasis : null,
  };
}

/* ------------------------------------------------------------- the payload */

/**
 * THE BUNDLED DEFAULT, AND IT IS A STATE RATHER THAN AN ABSENCE OF ONE.
 *
 * web/index.html is served for every pack, so the lens markup it carries is
 * rendered with `pack = null`: no composer runs, no region has a status, and the
 * page says exactly that. It is NOT template-city's page and it is NOT an empty
 * city's page -- the two failure modes G-74 and G-161 were both about -- and the
 * word it prints is the shipped one for it: Not read.
 *
 * `unread` is its own reading and the fifth in REGION_READINGS. It is not
 * `no-source` (that is a pack saying it has no grant) and it is not `absent`
 * (that is a domain the registry does not carry): it is a document that has not
 * been told which city it is describing. web/app.js replaces it with a resolved
 * pack's readings, and the bake asserts this file is a FIXED POINT of the
 * transform so a stale default cannot ship green.
 */
export function unreadRegionStub(domainId) {
  const r = PUBLIC_WORKS_REGIONS.find((x) => x.domainId === domainId);
  return {
    ...(r || { domainId, region: domainId, gatedBy: null, recordType: null }),
    status: null,
    granted: null,
    generated: null,
    basis: "no region payload has been read for this pack",
    countingRule: "no region payload has been read for this pack",
    recordCount: 0,
    reading: "unread",
    records: [],
    extras: {},
  };
}

export function unreadPublicWorksPayload() {
  const regions = PUBLIC_WORKS_REGIONS.map((r) => {
    const region = {
      domainId: r.domainId,
      region: r.region,
      gatedBy: r.gatedBy,
      recordType: r.recordType,
      status: null,
      granted: null,
      generated: null,
      basis: "no region payload has been read for this pack",
      countingRule: "no region payload has been read for this pack",
      recordCount: 0,
      reading: "unread",
    };
    return {
      ...region,
      badge: "Not read",
      blocked: [],
      blockedCard: null,
      stateBlock: regionStateBlock(region),
      obstacle: obstacleFor(region),
    };
  });
  return {
    lens: PUBLIC_WORKS_LENS_ID,
    cityKey: null,
    displayName: "This city",
    environment: null,
    regions,
    regionCount: regions.length,
    regionLine:
      `${regions.length} registered regions on this lens. No region payload has been read for this pack, ` +
      `so every tile below is unread rather than zero.`,
    pageBadge: "Not read",
    matrix: matrixState(unreadRegionStub("cip-projects")),
    grid: callsGridState(unreadRegionStub("call-analytics")),
    register: registerModel(unreadRegionStub("cip-projects")),
    cip: unreadRegionStub("cip-projects"),
    calls: unreadRegionStub("call-analytics"),
    prov: PUBLIC_WORKS_REGIONS,
    rendering: {
      cellRendering: CELL_RENDERING,
      toneVar: TONE_VAR,
      readingTone: TONE_FOR_READING,
      chipTone: CHIP_TONE,
      statuses: PROJECT_STATUS_VALUES,
    },
    basis: {
      cipBasis: null,
      cipCountingRule: null,
      callsBasis: null,
      callsCountingRule: null,
      budgetBasis: null,
      totalsCountingRule: null,
      excludedFamilies: null,
      identityBasis: null,
    },
    statuses: DOMAIN_STATUSES,
    vendorLive: VENDOR_LIVE_READING,
  };
}

/**
 * The whole lens for one pack, derived. This is what the route serves and what
 * the built surface renders from, so there is one implementation of every
 * sentence on the page and not two that can drift.
 */
export function publicWorksLensPayload(pack) {
  if (!pack) return unreadPublicWorksPayload();
  const grantedKinds = new Set(grantedKindIds(pack).granted);
  const regions = PUBLIC_WORKS_REGIONS.map((r) => {
    const domain = composeDomainById(pack, r.domainId);
    const reading = regionReading(domain, grantedKinds);
    const region = {
      ...r,
      status: domain.status,
      granted: domain.granted,
      generated: domain.generated,
      basis: domain.basis,
      countingRule: domain.countingRule,
      recordCount: domain.recordCount,
      reading,
    };
    return {
      ...region,
      badge: regionBadge(region),
      blocked: blockedFacts({ ...region, reading }),
      blockedCard: blockedCardFor({ ...region, reading }),
      stateBlock: regionStateBlock({ ...region, reading }),
      obstacle: obstacleFor({ ...region, reading }),
    };
  });  const cip = composeDomainById(pack, "cip-projects");
  const calls = composeDomainById(pack, "call-analytics");
  /** Derived, and derived as ZERO on purpose: Parks is not in the registry at
   *  all, so the honest count of Parks regions is 0 and this line says so. */
  const parksRegions = DOMAIN_REGISTRY.filter((d) => d.lensId === "parks").length;

  const pageBadge = regions.every((r) => r.reading === "measured")
    ? "Demo records"
    : regions.some((r) => r.reading === "measured")
      ? "Partial"
      : regions.every((r) => r.reading === "no-source" || r.reading === "absent")
        ? "Empty"
        : "Unread";

  return {
    lens: PUBLIC_WORKS_LENS_ID,
    cityKey: pack.cityKey,
    displayName: pack.displayName,
    environment: pack.environment,
    regions,
    regionCount: regions.length,
    regionLine:
      `${regions.length} registered region${regions.length === 1 ? "" : "s"} on this lens. ` +
      `Parks carries ${parksRegions}, and a region absent from the registry is not built rather than empty.`,
    pageBadge,
    matrix: matrixState(cip),
    grid: callsGridState(calls),
    register: registerModel(cip),
    cip,
    calls,
    prov: PUBLIC_WORKS_REGIONS,
    /**
     * THE RENDERING TABLES TRAVEL WITH THE PAYLOAD. Which state a cell is in is
     * decided in matrixState/mallsGridState above, and this is what the browser
     * painter needs to draw that state: the same CELL_RENDERING, the same tone
     * vars, the same obstacle map the server painter reads. web/app.js does not
     * re-derive a state and does not carry a second copy of these words.
     */
    rendering: {
      cellRendering: CELL_RENDERING,
      toneVar: TONE_VAR,
      readingTone: TONE_FOR_READING,
      chipTone: CHIP_TONE,
      statuses: PROJECT_STATUS_VALUES,
    },
    basis: {
      cipBasis: cip.basis,
      cipCountingRule: cip.countingRule,
      callsBasis: calls.basis,
      callsCountingRule: calls.countingRule,
      budgetBasis: (cip.extras && cip.extras.budgetBasis) || null,
      totalsCountingRule: (calls.extras && calls.extras.totals && calls.extras.totals.countingRule) || null,
      excludedFamilies: (calls.extras && calls.extras.excludedFamilies) || null,
      identityBasis: calls.records[0] ? calls.records[0].identityBasis : null,
    },
    statuses: DOMAIN_STATUSES,
    vendorLive: VENDOR_LIVE_READING,
  };
}

/* -------------------------------------------------------------- rendering */

const esc = (value) =>
  String(value === null || value === undefined ? "" : value).replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[c]);

/** The pair line, and the SPACE-AROUND-A-MIDDLE-DOT shape is load-bearing: the
 *  design's check reads pairs out of the artboards as `X &middot; gatedBy Y`, and
 *  the built form writes the character rather than the entity so the two
 *  extractors can never both match one line and double-count it. */
const pairLine = (domainId, gatedBy) => `${esc(domainId)} · gatedBy ${esc(gatedBy)}`;

const provLine = (r) => `${pairLine(r.domainId, r.gatedBy)} · ${esc(r.recordType)}`;

const badge = (word, tone = "p-quiet") =>
  word ? `<span class="pill ${tone}">${esc(word)}</span>` : "";

/**
 * A STATUS CHIP IS NOT A BADGE, and it is a different element for that reason.
 * The pill vocabulary is a closed set of LENS state words (Empty, Not read, Demo
 * records...). A project status ("Stalled") and a readiness band ("In service")
 * are readings from a payload, and dressing them as pills would put words the
 * product never declared into the vocabulary the design's check scans.
 */
const CHIP_TONE = { stalled: "c-crit", "at-risk": "c-warn", "in-progress": "c-info", complete: "c-ok" };
const chip = (word, tone) =>
    word ? `<span class="chip ${esc(tone || "c-quiet")}">${esc(word)}</span>` : "";

/* A region's own reading decides its tone, and the lookup is TOTAL ON PURPOSE.
   An unmodelled reading must not render as a silent grey pill: before this map
   carried `unread`, the bundled pack emitted class="pill undefined", which is a
   class the shell does not define, a word no reader should see, and exactly the
   kind of quiet failure this product exists to refuse. It throws now. */
const TONE_FOR_READING = {
  measured: "p-warn",
  "granted-live": "p-quiet",
  "no-source": "p-quiet",
  unread: "p-quiet",
  absent: "p-quiet",
};
const toneForReading = (reading) => {
  const tone = TONE_FOR_READING[reading];
  if (!tone) throw new Error(`unknown region reading: ${reading}`);
  return tone;
};

const TONE_VAR = {
  stalled: "--sc-crit",
  "at-risk": "--sc-warn",
  "in-progress": "--sc-info",
  complete: "--sc-ok",
};

/**
 * ONE DERIVATION, TWO PAINTERS, AND THIS IS THE BRIDGE BETWEEN THEM.
 *
 * The server renders this lens for a pack (the bake writes the unresolved
 * default into web/index.html, and scripts/export-public-works-lens.mjs writes a
 * resolved pack for the design's own check). web/app.js then paints the RESOLVED
 * pack over that baked default in the browser, from the same payload.
 *
 * A painter that re-derived a cell's state would be a second implementation of
 * the rule this whole lens exists to hold -- "cannot occur" collapsed into a
 * measured zero by a client that never read STATUS_PHASES -- so the payload
 * carries the rendering each state requires and app.js writes it out. Nothing
 * about which state a cell is in, or what it says, is decided in the browser.
 */
export const CELL_RENDERING = Object.freeze({
  "cannot-occur": Object.freeze({ cls: "mtx-c", text: "&mdash;", sr: "cannot occur by rule", hatch: true }),
  unmeasured: Object.freeze({ cls: "mtx-c", text: "Unread", sr: "not read at all", unread: true }),
  "measured-zero": Object.freeze({ cls: "mtx-c", text: "0", sr: "a measured zero" }),
  count: Object.freeze({ cls: "mtx-c mtx-counted", sr: "projects", wash: true }),
});

/** The four states, four different renderings, and no two of them alike. The
 *  word is in the accessible text and in a data attribute, so a test can hold
 *  each state apart without reading pixels. */
export function renderMatrixCell(cell) {
  const v = cell.tone || TONE_VAR[cell.status] || "--sc-ink";
  const r = CELL_RENDERING[cell.state];
  if (!r) throw new Error(`unknown matrix cell state: ${cell.state}`);
  const attrs = `data-mtx-state="${esc(cell.state)}" data-mtx-phase="${esc(cell.phase)}" data-mtx-status="${esc(cell.status)}"`;
  const body = r.hatch
    ? `<span class="mtx-hatch" aria-hidden="true">${r.text}</span>`
    : r.unread
      ? `<span class="mtx-n mtx-unread" aria-hidden="true">${r.text}</span>`
      : r.wash
        ? `<span class="mtx-n" style="color:var(${v})">${cell.value}</span>`
        : `<span class="mtx-n">${r.text}</span>`;
  const cls = r.hatch ? `${r.cls} mtx-hatch-cell` : r.unread ? `${r.cls} mtx-unread-cell` : r.wash ? r.cls : `${r.cls} mtx-zero-cell`;
  const style = r.wash ? ` style="background:var(${v}-wash)"` : "";
  return `<td class="${cls}" ${attrs}${style}>${body}<span class="sr-only">${r.sr}</span></td>`;
}

export function renderMatrix(model, { caption } = {}) {
  if (model.surface === "absent") {
    return (
      `<div class="mtx-absent" data-mtx-surface="absent">` +
      `<p><b>Absent.</b> ${esc(model.reconcileBasis)}</p>` +
      `</div>`
    );
  }
  const head =
    `<thead><tr><th scope="col">Phase \\ status</th>` +
    model.statuses.map((s) => `<th scope="col">${esc(s.label)}</th>`).join("") +
    `<th scope="col">All</th></tr></thead>`;
  const body = model.rows
    .map(
      (row) =>
        `<tr><th scope="row">${esc(row.phase)}</th>` +
        row.cells.map(renderMatrixCell).join("") +
        `<td class="mtx-total">${row.total === null ? "&mdash;" : row.total}</td></tr>`,
    )
    .join("");
  const foot =
    `<tfoot><tr><th scope="row">All</th>` +
    model.colTotals.map((t) => `<td class="mtx-total">${t === null ? "&mdash;" : t}</td>`).join("") +
    `<td class="mtx-total">${model.grand === null ? "&mdash;" : model.grand}</td></tr></tfoot>`;
  const legend =
    `<div class="mtx-legend">` +
    `<span><i class="mtx-swatch">n</i>a count</span>` +
    `<span><i class="mtx-swatch mtx-swatch-zero">0</i>a measured zero</span>` +
    `<span><i class="mtx-swatch mtx-swatch-hatch"></i>cannot occur by rule</span>` +
    `<span><i class="mtx-swatch mtx-swatch-unread"></i>not read at all</span>` +
    `</div>`;
  return (
    `<div class="mtx" data-mtx-surface="${esc(model.surface)}">` +
    `<table class="dt mtx-table">` +
    (caption ? `<caption class="sr-only">${esc(caption)}</caption>` : "") +
    head + body + foot +
    `</table>${legend}` +
    `<span class="basis">${esc(model.reconcileBasis)}</span>` +
    `</div>`
  );
}

export function renderCallsGrid(model) {
  if (!model.read) {
    return `<div class="mtx-absent" data-grid-surface="unread"><p>${esc(model.reconcileBasis)}</p></div>`;
  }
  const head =
    `<thead><tr><th scope="col">Queue \\ relative day</th>` +
    model.days.map((d) => `<th scope="col">${esc(d.label)}</th>`).join("") +
    `<th scope="col">Queue</th></tr></thead>`;
  const body = model.rows
    .map(
      (row) =>
        `<tr><th scope="row"><span class="t-data">${esc(row.ref)}</span> ${esc(row.label)}</th>` +
        row.cells
          .map((cell) => {
            if (cell.state === "unmeasured") {
              return `<td class="ht-unread" data-grid-state="unmeasured"><span class="sr-only">not read</span>&mdash;</td>`;
            }
            return (
              `<td class="ht-c" data-grid-state="${esc(cell.state)}" style="background:${esc(cell.tint)}">` +
              `<span class="t-data">${cell.value}</span>` +
              `${cell.state === "measured-zero" ? `<span class="sr-only">a measured zero</span>` : ""}</td>`
            );
          })
          .join("") +
        `<td class="ht-total">${row.total}</td></tr>`,
    )
    .join("");
  const foot =
    `<tfoot><tr><th scope="row">Day</th>` +
    model.dayTotals.map((t) => `<td class="ht-total">${t}</td>`).join("") +
    `<td class="ht-total">${model.grand}</td></tr></tfoot>`;
  return (
    `<div class="ht" data-grid-surface="measured">` +
    `<table class="dt ht-table">` +
    `<caption class="sr-only">Call buckets by queue and relative day, with both margins and the corner total</caption>` +
    head + body + foot +
    `</table>` +
    `<span class="basis">${esc(model.reconcileBasis)}</span>` +
    `</div>`
  );
}

/**
 * The blocked card. Four facts, always, and NO AFFORDANCE: no button, no link,
 * no retry, no "contact support". A region that cannot show data because a human
 * at the vendor has not completed a consent is not a failure a reader can act
 * on, and offering them a control would be telling them it is.
 */
export function renderBlockedCard(region) {
  const card = region.blockedCard || blockedCardFor(region);
  if (!card) return "";
  const rows = card.facts
    .map(
      (f) =>
        `<tr><th scope="row">${esc(f.k)}</th>` +
        `<td class="${f.mono ? "t-data" : ""}">${esc(f.v)}</td></tr>`,
    )
    .join("");
  return (
    `<div class="blocked" data-blocked-kind="${esc(card.kind)}">` +
    `<div class="blocked-head"><span class="t">${esc(card.headline)}</span>` +
    `<span class="t-caption">${pairLine(region.domainId, region.gatedBy)}</span>` +
    `<span class="grow"></span><span class="stchip ${esc(card.tone)}">${esc(card.state)}</span></div>` +
    `<table class="dt blocked-facts"><tbody>${rows}</tbody></table>` +
    `<span class="t-caption">${esc(card.footnote)}</span>` +
    `</div>`
  );
}

/** The register: one row per project, composer order, and no Completion column. */
export function renderRegister(model) {
  const rows = model.records
    .map(
      (r) =>
        `<tr><td class="id">${esc(r.recordId)}</td>` +
        `<td class="subj">${esc(r.subject)}</td>` +
        `<td>${esc(r.phase)}</td>` +
        `<td>${esc(r.place && r.place.label ? r.place.label : "")}</td>` +
        `<td class="t-data">${esc(r.scheduleLabel)}</td>` +
        `<td>${chip(r.statusLabel, CHIP_TONE[r.status])}</td></tr>`,
    )
    .join("");
  return (
    `<table class="dt"><caption class="sr-only">Capital projects, sorted by severity then by schedule</caption>` +
    `<thead><tr><th scope="col">Project</th><th scope="col">Subject</th><th scope="col">Phase</th>` +
    `<th scope="col">Place</th><th scope="col">Schedule</th><th scope="col">Status</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>` +
    `<div class="pager"><span class="pos">${model.shown} of ${model.total} projects</span></div>`
  );
}

/* --------------------------------------------------------- the lens markup */

/**
 * The five states, four of which live in DOMAIN_STATUSES and a fifth that has no
 * entry there on purpose. The legend matters because the third and fourth words
 * are the ones a reader confuses: UNGRANTED is a region that is BUILT and this
 * city has no source for it, and NOT-REGISTERED is a surface that does not
 * exist. A city waiting for a grant that nobody can give is the confusion this
 * row exists to end.
 */
export const STATE_LEGEND = Object.freeze([
  ["ok", "the region read and carries records", "c-ok"],
  ["granted-empty", "a source is granted and returned nothing", "c-info"],
  ["ungranted", "the region is BUILT and this city has no source for it", "c-warn"],
  [
    "no-fixture-source",
    "this pack generates nothing; what is granted is a live feed the fixture seam does not read",
    "c-quiet",
  ],
  ["not-registered", "THE SURFACE DOES NOT EXIST. No entry in DOMAIN_STATUSES, deliberately", "c-crit"],
]);

export function renderStateLegend() {
  return (
    `<table class="dt"><caption class="sr-only">The five domain states</caption>` +
    `<thead><tr><th scope="col">State</th><th scope="col">What it means</th></tr></thead><tbody>` +
    STATE_LEGEND.map(
      (r) =>
        `<tr><th scope="row"><span class="chip ${esc(r[2])}">${esc(r[0])}</span></th><td>${esc(r[1])}</td></tr>`,
    ).join("") +
    `</tbody></table>`
  );
}

const metric = (label, value, note, opts = {}) => {
  if (opts.unread) {
    return (
      `<div class="metric" data-metric="${esc(opts.id || "")}"><span class="k">${esc(label)}</span>` +
      `<span class="v word">${esc(opts.word || "Not read")}</span><span class="n">${esc(note)}</span></div>`
    );
  }
  return (
    `<div class="metric has-value" data-metric="${esc(opts.id || "")}"><span class="k">${esc(label)}</span>` +
    `<span class="v">${esc(value)}</span><span class="n">${esc(note)}</span></div>`
  );
};

/**
 * The flood and drainage MOUNT, on both lenses that carry it. The study itself
 * is designed at `_design/smartcity-flood-study` and ratified separately; what
 * this product shows is the mount, and it says so rather than rendering an
 * empty panel that reads as a broken report. There is no link here on purpose:
 * the mount is a placement in the Full view, not a route this lens owns.
 */
export function floodMountPanel() {
  return (
    `<div class="panel"><div class="panel-head"><span class="t">Flood and drainage</span>` +
    `<span class="t-caption">modelled, not the regulatory zone</span><span class="grow"></span>` +
    badge("Preview") + `</div>` +
    `<div class="panel-body"><span class="basis">Mounts in Full · _design/smartcity-flood-study. ` +
    `The study is a design and is not built on this lens; this panel is the mount it will arrive in, ` +
    `and an empty mount is a placement rather than a finding about flood risk.</span></div></div>`
  );
}

/**
 * WHAT A LIVE CALL FEED CAN SUPPLY, from comparing the two paths rather than
 * re-reading the canvas. The generated path REFUSES an answer rate in its own
 * words; the live mapper carries one straight from the vendor. One product, two
 * paths, opposite rules -- and the live path maps ONE aggregate record, so the
 * queue-by-day grid below does not survive the cutover. Shipping the grid
 * silently would promise staff a breakdown the vendor does not expose.
 */
export function liveCallSupplyPanel() {
  return (
    `<div class="panel"><div class="panel-head"><span class="t">What live can supply</span>` +
    `<span class="t-caption">read before building</span><span class="grow"></span>${badge("Partial", "p-warn")}</div>` +
    `<div class="panel-body"><p>The live record also carries an answer rate straight from the vendor, which the ` +
    `generated record deliberately refuses. One product, two paths, opposite rules.</p>` +
    `<p>composeRealCallAnalytics maps ONE aggregate record, all queues, today. This grid is a property of the ` +
    `generated pack and does not survive the cutover.</p>` +
    `<span class="basis">Basis: src/vendor-live.mjs (mapRealCallSummaryRecord) against src/domains/call-analytics.mjs' ` +
    `own refusal. Recorded 2026-09-03; no live read was performed here.</span></div></div>`
  );
}

function metricsRow(payload) {
  const cip = payload.cip;
  const schedule = cip.extras && cip.extras.schedule;
  const reading = payload.regions.find((r) => r.domainId === "cip-projects").reading;
  const measured = reading === "measured";
  const unreadNote = reading === "unread" ? "no region payload has been read for this pack" : "No projects source";
  const items = PROJECT_STATUS_VALUES.map((s) => {
    const m = measured && cip.extras && Array.isArray(cip.extras.metrics)
      ? cip.extras.metrics.find((x) => x.id === s.id)
      : null;
    return metric(s.label, m ? m.count : null, m ? `of ${cip.recordCount} projects` : unreadNote, {
      id: s.id,
      unread: !m,
    });
  });
  items.push(
    schedule
      ? metric("Behind schedule", schedule.behind, `of ${schedule.measured}, measured`, { id: "behind" })
      : metric("Behind schedule", null, unreadNote, { id: "behind", unread: true }),
    schedule
      ? metric("On or ahead", schedule.onOrAhead, `of ${schedule.measured}, measured`, { id: "on-or-ahead" })
      : metric("On or ahead", null, unreadNote, { id: "on-or-ahead", unread: true }),
  );
  return `<div class="metrics attn" id="pw-cip-metrics">${items.join("")}</div>`;
}

function cipRegion(payload) {
  const region = payload.regions.find((r) => r.domainId === "cip-projects");
  const model = payload.matrix;
  const cip = payload.cip;
  const measured = region.reading === "measured";
  const regionHead =
    `<div class="panel-head"><span class="t">Capital projects</span>` +
    `<span class="t-caption">${pairLine("cip-projects", region.gatedBy)} · ${esc(region.recordType)}</span>` +
    `<span class="grow"></span>${badge(region.badge, toneForReading(region.reading))}</div>`;

  if (measured) {
    const records = cip.records.slice(0, REGISTER_PAGE_SIZE).map((r) => ({
      ...r,
      statusLabel: (PROJECT_STATUS_VALUES.find((s) => s.id === r.status) || { label: r.status }).label,
    }));
    const primary =
      `<div class="panel">${regionHead}` +
      renderRegister({ records, shown: REGISTER_PAGE_SIZE, total: cip.recordCount }) +
      `<div class="panel-body">` +
      `<span class="basis">Sorted by severity, then by schedule. Basis: ${esc(cip.basis)}. Counting rule: ${esc(cip.countingRule)}. The shipped table declares a COMPLETION column; a generated record carries no completion field, so the column is absent here rather than blank, because a blank cell in a percent column reads as zero percent complete.</span>` +
      `</div></div>`;
    const side =
      `<div class="panel"><div class="panel-head"><span class="t">Phase against status</span>` +
      `<span class="t-caption">the second axis</span><span class="grow"></span></div>` +
      renderMatrix(model, { caption: "Capital projects counted by phase and by status" }) +
      `<div class="panel-body"><span class="basis">${model.tally["cannot-occur"]} cells cannot occur, ${model.tally["measured-zero"]} are a measured zero, ${model.tally.count} carry a count. STATUS_PHASES declares which phases each status may sit in.</span></div>` +
      `</div>` +
      `<div class="panel"><div class="panel-head"><span class="t">No money on this lens</span>` +
      `<span class="t-caption">and that is the design</span></div>` +
      `<div class="panel-body"><span class="basis">Basis: ${esc(payload.basis.budgetBasis)}</span></div></div>` +
      floodMountPanel();
    return { body: metricsRow(payload), primary, side };
  }

  if (region.reading === "granted-live") {
    return {
      body: "",
      primary:
        `<div class="panel">${regionHead}` + renderBlockedCard(region) +
        `<div class="panel-body"><span class="basis">Basis: the fixture seam answers ${esc(JSON.stringify(region.basis))} on this pack, and the server branches to the live composer instead (REAL_LIVE_DOMAINS, src/server.mjs). No live read was performed here and no credential was used, so the count is UNREAD rather than a number.</span></div>` +
        `</div>`,
      side: "",
    };
  }

  const where = region.reading === "unread" ? "this pack" : "this city";
  const tail = region.status
    ? `<span class="t-caption">status: ${esc(region.status)} · granted: ${esc(region.granted)} · generated: ${esc(region.generated)}</span>`
    : `<span class="t-caption">no region payload has been read for ${where}, so there is no composer status to report</span>`;
  return {
    body: "",
    primary:
      `<div class="panel">${regionHead}` +
      `<div class="state"><span class="st-k">Region built, no source</span>` +
      `<h2>The capital projects register has not been read for ${where}.</h2>` +
      `<p>The region exists. What is absent is a source, and the sentence says which. A city reading this knows it needs a grant, not a build.</p>` +
      `<span class="basis">Basis, verbatim from the composer: ${esc(region.basis)}. Counting rule: ${esc(region.countingRule)}.</span>` +
      tail +
      `</div></div>`,
    /**
     * THE GRID IS STILL DRAWN, AND THAT IS A DELIBERATE DIVERGENCE FROM THE
     * `Empty.dc.html` BOARD, which shows the five-state legend instead. The
     * matrix is the instrument this region ships with: an unmeasured surface
     * draws every cell that CAN occur as unreachable, and the eight cells the
     * product's own rule forbids stay hatched, because the axis is a property of
     * the product and not of the city's grant. Hiding the grid on an unread pack
     * would make `unmeasured` a state no reader of this product ever sees, and a
     * state that cannot be reached is not a state -- it is a test fixture.
     */
    side:
      `<div class="panel"><div class="panel-head"><span class="t">Phase against status</span>` +
      `<span class="t-caption">the second axis, unread</span><span class="grow"></span>${badge("Not read")}</div>` +
      renderMatrix(payload.matrix, { caption: "Capital projects by phase and by status, nothing read" }) +
      `</div>` +
      `<div class="panel"><div class="panel-head"><span class="t">The five states</span>` +
      `<span class="t-caption">four in code, one with no entry</span></div>` +
      `<div class="panel-body">${renderStateLegend()}` +
      `<span class="basis">Basis: DOMAIN_STATUSES in src/fixture-seam.mjs carries the first four. The fifth has no entry there on purpose, quoted from that file: a domain absent from DOMAIN_REGISTRY has no surface, and "Not built" is the only word that means it.</span></div></div>` +
      floodMountPanel(),
  };
}

function callsRegion(payload) {
  const region = payload.regions.find((r) => r.domainId === "call-analytics");
  const grid = payload.grid;
  const measured = region.reading === "measured";
  const head =
    `<div class="panel-head"><span class="t">Call analytics</span>` +
    `<span class="t-caption">${pairLine("call-analytics", region.gatedBy)} · ${esc(region.recordType)}</span>` +
    `<span class="grow"></span>${badge(region.badge, toneForReading(region.reading))}</div>`;

  if (measured) {
    const totals = payload.calls.extras.totals;
    const secondary =
      `<div class="panel">${head}` +
      renderCallsGrid(grid) +
      `<div class="panel-body">` +
      `<span class="basis">Basis: ${esc(payload.basis.callsBasis)}. Counting rule: ${esc(totals.countingRule)}. Both margins sum to ${esc(totals.callsOffered)}; the product renders them as two separate tables, and two tables that must agree and are never shown agreeing is a reconciliation nobody performs. No calendar date is printed anywhere: ${esc(payload.basis.identityBasis ? "the unit is a queue volume and never a call, and a relative day is not a date" : "")}</span>` +
      `</div></div>`;
    const sidePanels =
      `<div class="panel"><div class="panel-head"><span class="t">A queue is a function</span><span class="t-caption">never a desk, and this grid names nobody</span></div>` +
      `<div class="panel-body"><span class="basis">Basis: ${esc(payload.basis.identityBasis)}.</span>` +
      `<div class="roster-list">${grid.queues.map((q) => `<span class="prov"><b>${esc(q.ref)}</b> ${esc(q.label)}</span>`).join("")}</div></div></div>` +
      `<div class="panel"><div class="panel-head"><span class="t">Excluded, not absent</span><span class="t-caption">three families</span></div>` +
      `<div class="panel-body"><table class="dt"><thead><tr><th scope="col">Excluded family</th><th scope="col">What it would be</th></tr></thead><tbody>` +
      [
        ["recording", "the audio of a call"],
        ["callerRef", "who placed it"],
        ["extensionOwner", "which person answers a line"],
      ]
        .map((r) => `<tr><th scope="row" class="t-data">${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`)
        .join("") +
      `</tbody></table><span class="basis">${esc(payload.basis.excludedFamilies)}.</span></div></div>` +
      `<div class="panel"><div class="panel-head"><span class="t">A zero here is a reading</span><span class="t-caption">not an empty cell</span></div>` +
      `<div class="panel-body"><span class="basis">${esc(grid.zeroAbandoned.length)} of ${esc(grid.measured)} buckets carry an abandoned count of exactly zero (${esc(grid.zeroAbandoned.join(", "))}): measured, and nothing abandoned. An unmeasured bucket carries no reading at all, and neither renders as the other.</span></div></div>` +
      liveCallSupplyPanel();
    return {
      body: `<div class="metrics attn" id="pw-calls-metrics">${[
        metric("Offered", totals.callsOffered, `over ${totals.measured} buckets`, { id: "offered" }),
        metric("Answered", totals.callsAnswered, "drawn independently", { id: "answered" }),
        metric("Abandoned", totals.callsAbandoned, "drawn independently", { id: "abandoned" }),
        metric("Buckets", totals.measured, `${grid.queues.length} queues × ${grid.days.length} relative days`, { id: "buckets" }),
        metric("Answer rate", null, "never without both figures", { id: "answer-rate", unread: true, word: "Refused" }),
        metric("Individual calls", null, "excluded, with a basis", { id: "calls", unread: true, word: "Excluded" }),
      ].join("")}</div>`,
      primary: secondary,
      side: sidePanels,
    };
  }
  if (region.reading === "granted-live") {
    return {
      body: "",
      primary:
        `<div class="panel">${head}` + renderBlockedCard(region) +
        `<div class="panel-body"><span class="basis">Basis: composeRealCallAnalytics returns status unavailable carrying the vendor route's own error, asserted as goto_not_authorized with needsAuth true in src/vendor-live.test.mjs. The module header records the reason: the consent flow has never been completed by a human.</span></div>` +
        `</div>`,
      side: "",
    };
  }
  return {
    body: "",
    primary:
      `<div class="panel">${head}` +
      `<div class="state"><span class="st-k">Region built, no source</span>` +
      `<h2>Call handling has not been read for ${region.reading === "unread" ? "this pack" : "this city"}.</h2>` +
      `<p>Same region, same sentence as its peer, and it still prints its own basis: two regions in one state on one pack is a coincidence of that pack, not a property of the lens.</p>` +
      `<span class="basis">Basis, verbatim from the composer: ${esc(region.basis)}. Counting rule: ${esc(region.countingRule)}.</span>` +
      (region.status
        ? `<span class="t-caption">status: ${esc(region.status)} · granted: ${esc(region.granted)} · generated: ${esc(region.generated)}</span>`
        : `<span class="t-caption">no region payload has been read for this pack, so there is no composer status to report</span>`) +
      `</div></div>`,
    side:
      floodMountPanel() +
      `<div class="panel">` +
      `<div class="panel-head"><span class="t">The five states</span>` +
      `<span class="t-caption">four in code, one with no entry</span></div>` +
      `<div class="panel-body">${renderStateLegend()}</div></div>`,
  };
}

function regionTab(region, active) {
  const count =
    region.reading === "measured"
      ? region.domainId === "cip-projects"
        ? `${region.recordCount} projects`
        : `${region.recordCount} buckets`
      : region.reading === "granted-live"
        ? "declined"
        : region.reading === "unread"
          ? "not read"
          : "0 records";
  return (
    `<button type="button" role="tab" aria-selected="${active ? "true" : "false"}" ` +
    `data-pw-region="${esc(region.domainId)}">${esc(region.region)}` +
    `<span class="pill ${toneForReading(region.reading)}">${esc(region.badge)}</span>` +
    `<span class="n">${esc(count)}</span></button>`
  );
}

/**
 * The whole lens, as served. `tab` selects which of the two regions is open;
 * both are in the DOM so a reader can switch without a navigation, and exactly
 * one is visible, because the lens switches rather than stacks.
 */
export function renderPublicWorksLens(pack, { tab = "cip-projects", className = "lens", snapshot = "this checkout" } = {}) {
  const payload = publicWorksLensPayload(pack);
  const cip = cipRegion(payload);
  const calls = callsRegion(payload);
  const regionBlock = (id, parts, active) =>
    `<div class="shell-regions" data-pw-region-panel="${esc(id)}"${active ? "" : ' hidden style="display:none"'}>` +
    `<div class="colstack" tabindex="0">${parts.body}${parts.primary}</div>` +
    (parts.side ? `<div class="colstack rail">${parts.side}</div>` : "") +
    `</div>`;

  const statePill = `<span class="pill ${payload.pageBadge === "Demo records" ? "p-warn" : "p-quiet"}" id="pw-state-chip">${esc(payload.pageBadge)}</span>`;
  const footCity = payload.cityKey
    ? `pack ${esc(payload.cityKey)} · read at smartcity-dashboards ${esc(snapshot)}`
    : `no pack read · this is the bundled document, and web/app.js replaces it when a pack resolves`;
  return (
    `<section class="${esc(className)}" id="lens-public-works">` +
    `<header class="pagehead">` +
    `<div class="crumb"><b data-pack-name>${esc(payload.displayName)}</b> <span>/</span> Public works</div>` +
    `<div class="titlerow"><h1>Public works</h1>${statePill}<span class="grow"></span>` +
    `<span class="t-caption" id="pw-region-rule">${esc(payload.regionLine)}</span></div>` +
    `<p class="lede">Capital projects and call handling. Two regions, two units: a project is one row, a call figure is one bucket per queue per relative day. Each region states its own source and its own counting rule, and this lens prints no figure of money at all.</p>` +
    `</header>` +
    `<div class="tabs" role="tablist" aria-label="Public works regions" id="pw-region-tabs">` +
    payload.regions.map((r) => regionTab(r, r.domainId === tab)).join("") +
    `</div>` +
    regionBlock("cip-projects", cip, tab === "cip-projects") +
    regionBlock("call-analytics", calls, tab === "call-analytics") +
    `<div class="region-foot" id="pw-prov-foot">` +
    payload.prov.map((p) => `<span class="prov" data-pw-pair>${pairLine(p.domainId, p.gatedBy)}</span>`).join("") +
    `<span class="grow"></span>` +
    `<span class="prov">${footCity}</span>` +
    `</div>` +
    `</section>`
  );
}

/**
 * The full page a lens surface is served or exported as: the product's own
 * stylesheets, the lens, and nothing else. A check run over this measures the
 * lens rather than the other ten lenses stacked on the same document.
 *
 * `assetBase` is a parameter because the same document is read from two places:
 * an EXPORT writes its stylesheets beside itself and links `./`, and the SERVER
 * route serves it from a nested path (`/lens/public-works`) where a relative
 * link would resolve to `/lens/sc-kit.css` and 404. One document, two bases, and
 * the default keeps every export byte-identical to what it was.
 */
export function renderPublicWorksSurface(pack, { assetBase = ".", ...opts } = {}) {
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<title>Public works · ${esc(pack ? pack.displayName : "this city")}</title>\n` +
    `<link rel="stylesheet" href="${assetBase}/sc-kit.css">\n<link rel="stylesheet" href="${assetBase}/shell.css">\n` +
    `</head>\n<body class="shell">\n<main class="shell-main">\n` +
    renderPublicWorksLens(pack, { className: "lens on", ...opts }) +
    `\n</main>\n</body>\n</html>\n`
  );
}

/* ------------------------------------------------------------------ bake */

/**
 * The transform, as a PURE function, for the reason the Finance lens's bake is
 * one: a transform that lives only in a script cannot be asserted, so a stale
 * document ships green in either direction. scripts/bake-public-works-lens.mjs
 * and src/public-works-lens.test.mjs call this ONE implementation, and the test
 * asserts web/index.html is a FIXED POINT of it.
 *
 * CRLF-PRESERVING, AND THIS IS NOT HYGIENE. D-9 exists because GCP serves all
 * seven files under web/ with CRLF, and `.gitattributes` marks `web/** -text` so
 * no checkout on any platform rewrites them. A bake that normalizes to LF and
 * writes back flattens the whole document -- the Finance bake measured a
 * 3,620-line diff on web/index.html that way. The line-ending form is read from
 * the input and restored on the way out, so the bake changes only the section.
 */
export function bakePublicWorksLensInto(rawHtml) {
  return bakeSectionInto(rawHtml, {
    marker: '<section class="lens" id="lens-public-works">',
    next: '<section class="lens roster-lens" id="lens-parks">',
    render: () => renderPublicWorksLens(null),
  });
}

/**
 * The section swap, shared by both lenses this lane bakes. It is exported so
 * the two bake functions cannot drift into two different ideas of what a
 * section is.
 */
export function bakeSectionInto(rawHtml, { marker, next, render }) {
  const source = String(rawHtml);
  const usesCrlf = /\r\n/.test(source);
  const html = source.replace(/\r\n/g, "\n");
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`${marker} missing from the bake target`);
  const start = html.lastIndexOf("\n", at) + 1;
  const nextAt = html.indexOf(next, at);
  if (nextAt < 0) throw new Error(`the section after ${marker} is missing`);
  const end = html.lastIndexOf("\n", nextAt) + 1;
  const out = `${html.slice(0, start)}${render()}\n\n${html.slice(end)}`;
  return usesCrlf ? out.replace(/\n/g, "\r\n") : out;
}

