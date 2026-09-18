/**
 * ---------------------------------------------------------------------------
 * G-156. THE FINANCE LENS, AND THE ONE RULE THAT SHAPES EVERY LINE OF IT.
 *
 * The design is `_design/smartcity-finance-lens/`, RATIFIED 2026-09-17, drawn
 * against 25 pages of the v1 live Finance tab the operator supplied on
 * 2026-09-15 and cited page by page in that folder's capture-figures.json.
 *
 * The operator correction that is the design's spine (2026-09-15): removing the
 * v1 fabrications IS the gap analysis, not the product. v1 has one state, a
 * number, and that is the defect expressed once. This lens draws the FULL SHAPE
 * - every cell it will ever hold exists on the page from the start, each one
 * either measured or countably UNACCOUNTED, and every unaccounted cell carries
 * a named acquisition path. A missing column is invisible; an unaccounted cell
 * is countable.
 *
 * WHAT THIS FILE WILL NOT DO, because the failure mode of this row is a lane
 * "improving" the design:
 *   - It never renders an unaccounted cell as 0. A fabricated zero is worse
 *     than an absence, because it enters a sum without announcing it was
 *     invented.
 *   - It never converts an unaccounted cell into a value to make the page look
 *     finished.
 *   - It never sources the fund ledger from anywhere. v1 was absent on it and
 *     said so in its own caution; an absence is carried, not filled.
 *
 * THE ONE THING THAT CHANGED, AND IT WAS THE OPERATOR'S CALL, NOT THIS LANE'S.
 * The ratified design's "lens today" state was drawn from the v1 capture rather
 * than from the v2 product: it shows the adopted budget MEASURED at $69.6M from
 * an OpenGov ERP connection. Five independent product registers deny that
 * connection - no OpenGov grant exists for any pack, the adapter kind is
 * catalogued with `declared: false` because its budget record shape is not
 * declared on G-91, the function-homes register dispositions OpenGov "Not
 * connected", the shipped Connections register says the same, and the design's
 * own nav footer asserts a runtime figure the runtime cannot produce. Building
 * it as drawn would put a source-looking money figure under a MEASURED badge on
 * a customer surface, which is the exact defect class this lens exists to
 * refuse.
 *
 * Filed as CP1 (2026-09-18_g156-finance-lens-build_cp1.json) and ruled by the
 * operator on 2026-09-18: BUILD THE HONEST FULL SHAPE. The layout, badges,
 * refusals, basis lines and full-shape spine are the design's, unchanged. What
 * is removed is a fabricated CONNECTION, and the divergence is in the refusing
 * direction rather than the filling one.
 *
 * SO THE FOUR STATES ARE DERIVED, NEVER TYPED. A hand-written state is true on
 * the day it is typed and is never checked again, which is the shape of every
 * stale claim this program has paid for. Each source resolves from the active
 * pack's own grants and from the adapter catalog's own declarations, so pulling
 * a grant moves the surface with nobody remembering to edit it. That property
 * is falsifiable on purpose: pull the MyGov grant and permit fee revenue falls
 * from PARTIAL to UNACCOUNTED, and src/finance-lens.test.mjs proves it does.
 * ---------------------------------------------------------------------------
 */

import { ADAPTER_KINDS, RECORD_SHAPES } from "./adapters.mjs";
import { grantedKindIds, packSources } from "./city-identity.mjs";

/**
 * The design's declared state vocabulary, and there is no sixth word. Imported
 * by name into the test so an added state fails there rather than shipping.
 */
export const FINANCE_STATES = ["MEASURED", "UNACCOUNTED", "REFUSED", "CONFLICT", "PARTIAL"];

/**
 * The city whose v1 Finance tab the operator captured, and therefore the ONLY
 * pack the capture may be quoted on.
 *
 * This is a gate, not a label. web/index.html serves every pack, and G-74
 * settled that one city's real data must not appear on another city's page
 * wearing that city's name - which is why the clerk host is refused on every
 * pack but this one. The capture's figures are Bastrop's v1 screen contents, so
 * they are returned for this pack and for no other, and they are never baked
 * into the shared document.
 */
export const CAPTURE_CITY_KEY = "bastrop_tx";

/** The four sources the shipped lens already names, in the shipped order. */
export const FINANCE_REQUIRED_SOURCES = [
  {
    id: "adopted-budget",
    label: "Adopted budget",
    sub: "Appropriations by fund and department for the current year",
    /**
     * Which adapter kinds would carry this source. The budget lives in the ERP,
     * and the catalog has exactly one kind for it.
     */
    kinds: ["opengov"],
    acquisition: {
      owner: "city finance director",
      step: "connect the OpenGov budget feed",
      blocked:
        "the opengov adapter kind is catalogued but declares no record shape (G-91), so a granted feed could not be mapped onto a cell yet",
      fills: "appropriation by fund and department, and the fund list itself",
    },
  },
  {
    id: "fund-ledger",
    label: "Fund ledger",
    sub: "Actuals against appropriation, posted by period",
    kinds: ["opengov"],
    /**
     * The highest-leverage item on this lens, and it is a REQUEST rather than a
     * build. The design records that one acquisition fills four regions that
     * are refused today: actuals, variance, burn and budget pace.
     */
    acquisition: {
      owner: "city finance director",
      step: "connect the OpenGov ledger feed, posting actuals by period",
      blocked: "v1 never had it and said so in its own caution on the department sub-tab",
      fills: "actuals by period, variance, burn and budget pace",
    },
  },
  {
    id: "permit-fee-revenue",
    label: "Permit fee revenue",
    sub: "Fees assessed and collected, joined to the permit record",
    kinds: ["mygov"],
    /**
     * The ONE source of the four with upstream substance on this product, and
     * the split is named rather than rounded. The fee AMOUNT is on the permit
     * case, so that half reads; whether it was COLLECTED is a ledger fact, and
     * the ledger is unaccounted.
     */
    partial: {
      reads: "fees assessed, carried on the permit cases the MyGov grant writes to spine",
      notReads: "fees collected, which only the fund ledger confirms",
    },
    acquisition: {
      owner: "city finance director",
      step: "confirm collection against the ledger, then join it to the case",
      blocked: "the collection half is a ledger fact and the ledger is unaccounted",
      fills: "collection, and the reconciliation between assessed and collected",
    },
  },
  {
    id: "department-spend",
    label: "Department spend",
    sub: "Purchase and payroll detail by department",
    kinds: ["opengov"],
    acquisition: {
      owner: "city finance director",
      step: "connect the OpenGov purchasing and payroll detail",
      blocked: "no adapter kind in the catalog carries purchase or payroll detail",
      fills: "department spend over time",
    },
  },
];

/** The pill class per state. Colour is never the only carrier: the word is on the row. */
const PILL_CLASS = {
  MEASURED: "p-ok",
  PARTIAL: "p-warn",
  UNACCOUNTED: "p-quiet",
  REFUSED: "p-crit",
  CONFLICT: "p-crit",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/* ------------------------------------------------------------ derivation */

/**
 * One source's state, with its basis. EVERY branch below is reachable and is
 * exercised by src/finance-lens.test.mjs, because a state that can never be
 * observed is indistinguishable from a state that is broken.
 *
 * The input is the pack's granted kinds (already intersected with the catalog
 * by city-identity.mjs, so a grant naming a kind that does not exist cannot
 * move anything) plus whatever readings this deployment holds. `readings` is
 * empty on every shipped pack today, which is the honest state of this data and
 * not a placeholder for a future real one: no finance record has been read.
 */
function resolveSource(source, { grantedIds, shapes, readings, packLabel, grantsLabel }) {
  const grantedForSource = source.kinds.filter((id) => grantedIds.has(id));
  /**
   * A grant is not the same thing as a mappable record. `declared` is the
   * adapter catalog's own answer, in RECORD_SHAPES, to whether this kind has a
   * record shape a cell could be mapped onto - and for the kind that carries
   * every finance source on this lens it is FALSE, with the catalog's own words
   * as the basis: "budget record shape is not declared on G-91". Reading this
   * off the kind entry rather than off RECORD_SHAPES is the mistake this line
   * exists to prevent: every kind in ADAPTER_KINDS carries no declared field,
   * so that read makes the mappable set empty for every pack and the lens
   * reports "no grant" for a source it in fact has a grant for.
   */
  const mappable = grantedForSource.filter((id) => shapes[id]?.declared === true);
  const unmappable = grantedForSource.filter((id) => shapes[id]?.declared !== true);

  const mine = readings.filter((r) => r.sourceId === source.id);

  /**
   * CONFLICT. Two independently derived readings that disagree, and the
   * disagreement is the output. The lens prints neither as the answer, because
   * printing either alone is choosing which one to believe without saying so.
   */
  const values = [...new Set(mine.map((r) => String(r.value)))];
  if (values.length > 1) {
    return {
      state: "CONFLICT",
      basis: `${values.length} readings for this source disagree (${values.join(" against ")}); the disagreement is the finding, so no figure from it is printed`,
      acquisition: source.acquisition,
    };
  }

  /**
   * MEASURED. A reading exists, and it carries the source it came from and the
   * date it was read - the design's definition, and the two things a bare
   * number does not have.
   */
  if (mine.length === 1 && !source.partial) {
    const r = mine[0];
    return {
      state: "MEASURED",
      /**
       * THE FIGURE, AND ZERO IS A FIGURE. A measured 0 renders as 0 - printed
       * with the source it came from and the date it was read, which is what
       * makes it different from the word UNACCOUNTED beside it. Withholding it
       * would collapse "we read a zero" into "we read nothing", which is the
       * distinction the whole lens is built on.
       */
      value: r.value,
      basis: `read from ${r.from} on ${r.readOn}`,
      acquisition: null,
    };
  }

  /**
   * PARTIAL, and it is genuinely partial: a reading covers part of the record
   * and the split is named. This is the state Bastrop's permit fee revenue is
   * in, and it is the one state of the five that is occupied on a shipped pack.
   */
  if (source.partial && (mine.length === 1 || mappable.length > 0)) {
    return {
      state: "PARTIAL",
      basis: `${source.partial.reads}. ${source.partial.notReads.charAt(0).toUpperCase()}${source.partial.notReads.slice(1)}`,
      acquisition: source.acquisition,
    };
  }

  /**
   * UNACCOUNTED. Nothing has been acquired for this cell. It is legitimate at
   * rest and it is the honest state of this data, and the two bases below
   * distinguish WHY, because "no grant" and "a grant we cannot map" are
   * different asks against the same city.
   */
  if (unmappable.length > 0) {
    return {
      state: "UNACCOUNTED",
      basis: `the ${unmappable.join(", ")} grant is not enough on its own: ${shapes[unmappable[0]]?.basis || "its record shape is not declared"}, so nothing on this row can be mapped yet`,
      acquisition: source.acquisition,
    };
  }
  /**
   * GRANTED, MAPPABLE, AND NOTHING READ YET: the state a city is in the week the
   * feed is connected and before the first record lands. The cell is a WORD, not
   * a 0, because nothing has been measured - and this is the branch where a
   * fabricated zero would sit unnoticed if anyone ever wrote one, which is why
   * src/finance-lens.test.mjs declares the shape for the test and renders it.
   *
   * On today's catalog no pack reaches this line: every finance source names
   * opengov, whose shape is undeclared on G-91, and the one declared finance
   * kind (mygov) belongs to the source with a partial split. It is live the day
   * that shape is declared.
   */
  if (grantedForSource.length > 0) {
    return {
      state: "UNACCOUNTED",
      basis: `the ${grantedForSource.join(", ")} connector is granted and mappable, and no record from it has been read, so nothing on this row is measured`,
      acquisition: source.acquisition,
    };
  }
  return {
    state: "UNACCOUNTED",
    basis: `no adapter kind that would carry it is granted on ${packLabel} (${grantsLabel})`,
    acquisition: source.acquisition,
  };
}

/**
 * The whole derived state of the Finance lens for one pack. PURE, and every
 * input is injectable, so every branch is provable in a unit test rather than
 * asserted to be possible.
 *
 * `readings` is empty on every shipped pack today, which is the honest state of
 * this data and not a placeholder for a future real one: no finance record has
 * been read on this product. It is a parameter because a branch that can only be
 * reached by editing the source is a branch nobody has observed.
 */
export function financeLensState(pack, { kinds = ADAPTER_KINDS, shapes = RECORD_SHAPES, readings = [] } = {}) {
  const packLabel = String(pack?.cityKey || "this pack");
  /**
   * WHETHER A PACK HAS BEEN RESOLVED AT ALL, which is a different question from
   * what it grants and must not be collapsed into it. web/index.html ships this
   * lens with no pack, and a page that answered that with "0 of 10 adapter
   * kinds granted" would be reporting a grant count it never read for a pack it
   * does not have - the same defect as calling an unread cell a zero. So an
   * unresolved lens says NOT READ, in the shell's own unread word, and the
   * design's five states appear only once a pack exists to have them.
   */
  const resolvedPack = pack != null;
  const grants = packSources(pack, kinds);
  const { granted } = grantedKindIds(pack, kinds);
  const grantedIds = new Set(granted);

  const sources = FINANCE_REQUIRED_SOURCES.map((source) => {
    const resolved = resolveSource(source, {
      grantedIds,
      shapes,
      readings,
      packLabel,
      grantsLabel: grants.label,
    });
    return {
      id: source.id,
      label: source.label,
      sub: source.sub,
      state: resolvedPack ? resolved.state : "Not read",
      /** Present only on a measured source, and 0 is a legitimate figure. */
      value: resolvedPack ? resolved.value : undefined,
      basis: resolvedPack
        ? resolved.basis
        : "no pack has been resolved, so this source's grant and its reading have not been read",
      acquisition: resolved.acquisition,
    };
  });

  /**
   * The counting rule, and the numerator is NOT "states that are not
   * unaccounted". A partial source is not a reading, and collapsing the two is
   * the numerator error G-93 fixed on the nav footer: two figures a reader is
   * meant to compare must be comparable and must count the thing they name.
   */
  const read = sources.filter((s) => s.state === "MEASURED").length;
  const partial = sources.filter((s) => s.state === "PARTIAL").length;
  const total = sources.length;
  const budgetOwner =
    sources.find((s) => s.id === "adopted-budget")?.acquisition?.owner || "city finance director";

  return {
    cityKey: packLabel,
    resolved: resolvedPack,
    sources,
    read,
    partial,
    unaccounted: total - read - partial,
    total,
    label: resolvedPack
      ? `${read} of ${total} finance sources read, ${partial} partial`
      : "no finance source count has been read for this pack",
    rule: `a source reads when a reading exists for it and carries the source and the date it was read; a source is partial when part of its record reads and the split is named; ${total} sources are required by this lens`,
    /**
     * The lens reads PARTIAL when nothing is measured and something is partial,
     * and the design draws that badge on the lens header. It is the design's
     * own word, not a sixth word spliced into the shell's guarded badge map.
     */
    lens: resolvedPack ? (read > 0 ? "MEASURED" : partial > 0 ? "PARTIAL" : "UNACCOUNTED") : "Not read",
    /**
     * THE TWO SENTENCES THAT CHANGE WHEN A PACK RESOLVES, authored here and
     * shipped in the payload so that web/app.js never writes one. A page whose
     * text still says "no pack has been resolved" after a pack resolved is a
     * stale claim, and stale claims are what this lens exists to refuse.
     */
    appropriationNote: resolvedPack
      ? `The four sources this lens requires, counted for ${packLabel}. The fund columns are drawn because they are the cells this lens will hold; the fund LIST is the adopted budget feed's own output, so there are no fund rows to print until that feed reads. An empty table here is not a budget of nothing.`
      : "The four sources this lens requires. No pack has been resolved, so nothing here is counted yet.",
    fundBasis: resolvedPack
      ? `Basis: 0 fund rows on this page, because the fund list is the adopted budget feed's own output and no reading of that feed exists for ${packLabel}. Contact: ${budgetOwner}.`
      : `Basis: 0 fund rows on this page, because the fund list is the adopted budget feed's own output and no pack has been resolved to read a grant or a reading for it. Contact: ${budgetOwner}.`,
    /**
     * THE FUND LIST ITSELF, which is the adopted budget feed's OUTPUT rather
     * than a cell derived from a grant - so it is empty on every pack today, and
     * it is a field rather than a literal because the renderer's two branches
     * (the table, and the honest-empty sibling that hides it) are chosen from
     * it. Nothing here is a zero: no fund row exists to carry one.
     */
    funds: [],
  };
}

/**
 * THE REFUSED CELLS. A derived figure whose input is unaccounted is NOT a zero
 * and NOT a blank: it is refused, and the refusal says which input is missing.
 * Every one of these is a figure v1 printed confidently.
 */
export function financeRefusals(state) {
  const byId = new Map(state.sources.map((s) => [s.id, s]));
  /**
   * A refusal may not assert WHY its input is missing on a pack whose grants
   * were never read: "actuals are unaccounted" is a claim about a pack, and on
   * an unresolved lens the true statement is only that nothing has been read.
   */
  const actualsUnaccounted = state.resolved && byId.get("fund-ledger")?.state !== "MEASURED";

  return [
    {
      id: "variance",
      label: "Budget variance",
      needs: "fund-ledger",
      reason: actualsUnaccounted
        ? "actuals are unaccounted, and a variance is a difference between appropriation and actuals, so there is nothing to subtract. It is refused rather than shown as zero, because a zero variance reads as on-budget."
        : "a variance is a difference between appropriation and actuals and both must be measured before either the figure or its sign is a finding",
    },
    {
      id: "burn",
      label: "Percent of budget spent",
      needs: "fund-ledger",
      reason: actualsUnaccounted
        ? "burn is actuals over appropriation. v1 drew it by copying the budget column into the actuals column, which makes burn 100% on every row by construction and raises an alarm off the fabricated equality."
        : "burn is a ratio of two measured figures and one of them is derived; it prints only when both sides are read",
    },
    {
      id: "budget-pace",
      label: "Budget pace",
      needs: "fund-ledger",
      reason:
        "v1 reported 94% spent at 94% of fiscal year, +0% against expected. Spent equals budget by construction there and elapsed drives the expectation, so the two track each other necessarily and the variance is always zero. A figure that cannot come out any other way is not a measurement, and it is the most reassuring number on the v1 page.",
    },
    {
      id: "fund-total",
      label: "Fund total",
      needs: "adopted-budget",
      reason:
        "the lens declines to print a fund total until the two agree or the counting rule is declared. The capture's fifteen fund rows sum to roughly double its own stated total, and a sum that is close to double its total is a counting-rule question rather than a rounding one.",
    },
    {
      id: "collection-rate",
      label: "Permit collection rate",
      needs: "fund-ledger",
      reason:
        "collected cannot exceed charged, so a rate above 100% is not a reachable state at all. The capture prints one in green with a success mark, and it traces to a single unattributed partition rather than to a measurement.",
    },
  ].map((r) => ({ ...r, state: "REFUSED", blockedBy: r.needs, blockedByState: byId.get(r.needs)?.state || "UNACCOUNTED" }));
}

/* ------------------------------------------------------------ the capture */

/**
 * WHAT THE V1 CAPTURE SHOWED, AS A QUOTATION AND NEVER AS A READING.
 *
 * This panel exists because the design's drawable content is a GAP ANALYSIS:
 * the defect expressed once, beside what this lens does with it instead. Every
 * figure below is a token that appears verbatim in the design folder's
 * capture-figures.json, which is the record of what was read off the operator's
 * compressed screenshots on 2026-09-15.
 *
 * It carries the capture's own caveat ON THE PAGE, verbatim, because that
 * caveat is the authority for the file: no figure here is a reading of the
 * source system, and these are v1 screen contents, not v2 measurements. The
 * attribution is not decoration - it is the difference between a quotation and
 * a claim about Bastrop's money, which is the whole reason this lens exists.
 *
 * RETURNED FOR ONE PACK ONLY. See CAPTURE_CITY_KEY.
 */
export const CAPTURE_CAVEAT =
  "Every figure here is READ OFF A COMPRESSED SCREENSHOT. Digits are legible at the magnitudes that matter and the defects below survive any plausible OCR error, but no figure here is a reading of the source system. Before any of this reaches a customer artefact it is verified against OpenGov and MyGov directly. Figures are cited by capture page.";

export const FINANCE_CAPTURE_QUOTATION = [
  {
    page: 1,
    v1Said: "a TOTAL BUDGET card and a SPENT YTD card side by side, the second rendered as spending over budget",
    figures: ["$69.6M", "$74.6M"],
    whatThisLensDoes:
      "REFUSED as a spend figure. Page 2 of the same capture labels the second as REVENUE, and its own insight text agrees, so the most prominent card on the v1 lens is a revenue figure labelled as spending. Here the adopted budget is unaccounted until a feed reads, and no spend is printed at all.",
    state: "REFUSED",
  },
  {
    page: 2,
    v1Said: "expenses, revenue and a net position, all three printed as measurements",
    figures: ["$69.6M", "$74.6M", "$5.0M"],
    whatThisLensDoes:
      "UNACCOUNTED. These are v1 screen contents. This lens prints a net position only from an appropriation it read and actuals it read, and it has neither.",
    state: "UNACCOUNTED",
  },
  {
    page: [2, 3],
    v1Said: "fifteen fund rows, headed by the General Fund and the Water & Wastewater Fund",
    figures: ["$39.5M", "$20.3M"],
    whatThisLensDoes:
      "REFUSED as a total. The fifteen rows sum to roughly double the stated total budget, so the counting rule has to be declared before a fund total prints. The fund LIST is itself unaccounted here, which is why this lens draws the fund columns and no fund rows.",
    state: "REFUSED",
  },
  {
    page: [11, 12],
    v1Said: "Non-Departmental with a budget figure and an actual spent figure printed as the same number, and 100% burn",
    figures: ["$14.2M"],
    whatThisLensDoes:
      "REFUSED. Actual Spent is the Budget column copied on ten rows of ten, so burn is 100% by construction, and v1 then raised an alarm from the equality it had just created. Here a department row prints an actual only when an actual was read.",
    state: "REFUSED",
  },
  {
    page: [8, 23],
    v1Said: "total fees charged and total collected, with a collection rate printed in green above 100%",
    figures: ["$424.0M", "$664.7M"],
    whatThisLensDoes:
      "REFUSED. Collected cannot exceed charged. The surplus traces to one Unassigned partition, and the magnitudes are nine and a half times the city's whole operating budget, so the lens refuses the rate and refuses the count rather than picking the figure that looks right.",
    state: "REFUSED",
  },
  {
    page: 25,
    v1Said: "Building Department's collected total across 1,055 permits, a per-permit figure far above any plausible fee",
    figures: ["$244,119,103.40"],
    whatThisLensDoes:
      "PARTIAL, and the split is named. Permit fee revenue is the one source of the four with upstream substance on this product, because the fee amount sits on the permit case. Whether it was collected is a ledger fact, and the ledger is unaccounted - so this lens prints no revenue figure at all.",
    state: "PARTIAL",
  },
];

/**
 * The quotation block, gated to the pack it is about. Returns null for every
 * other pack, so no caller can render Bastrop's v1 screen contents beside
 * another city's name by forgetting a flag.
 */
export function financeCaptureQuotation(pack) {
  return String(pack?.cityKey || "") === CAPTURE_CITY_KEY ? FINANCE_CAPTURE_QUOTATION : null;
}

/** The attribution sentence, carried with the data so no caller writes its own. */
export const CAPTURE_INTRO =
  "Quoted from cited pages of the operator's v1 Finance tab capture, supplied 2026-09-15 and read 2026-09-15. These are v1 screen contents and are not readings of any source system. This lens measures none of them.";

/**
 * The panel, in the two states it has: quoting, and not quoting.
 *
 * The IDs matter beyond styling. `finance-capture-body` is where web/app.js
 * puts the quotation rows at runtime, and `finance-capture-absence` is the line
 * it hides when it does - which is how the shared document can carry this panel
 * for every pack while the v1 figures reach only the pack they are about.
 */
export function renderCapturePanel(pack) {
  const quotation = financeCaptureQuotation(pack);
  const body = quotation
    ? `<p class="t-caption">${escapeHtml(CAPTURE_INTRO)}</p>${quotation
        .map(
          (q) => `
                      <div class="finding">
                        <span class="ftitle">${q.figures.map((f) => `<span class="t-data">${escapeHtml(f)}</span>`).join('<span class="sep" aria-hidden="true">|</span>')}<span class="grow"></span>${pill(q.state)}</span>
                        <span class="fmeta">v1, capture page ${escapeHtml(Array.isArray(q.page) ? q.page.join(" and ") : q.page)}</span>
                        <p class="f">v1 said: ${escapeHtml(q.v1Said)}. This lens: ${escapeHtml(q.whatThisLensDoes)}</p>
                      </div>`,
        )
        .join("")}
                      <p class="t-caption">${escapeHtml(CAPTURE_CAVEAT)}</p>`
    : "";
  return `
                  <div class="panel" id="finance-capture">
                    <div class="panel-head"><span class="t">What the v1 capture showed</span><span class="grow"></span><span class="pill p-quiet" id="finance-capture-pill">${quotation ? "Quotation" : "Not read"}</span></div>
                    <div class="panel-body">
                      <p class="t-caption" id="finance-capture-absence"${quotation ? " hidden" : ""}>The v1 Finance tab capture is a record of one city's screens and is quoted on that city's pack only. No capture has been read for <span data-pack-key>this pack</span>, so nothing from it is shown here and nothing from another city's capture is substituted.</p>
                      <div id="finance-capture-body">${body}</div>
                    </div>
                  </div>`;
}

/**
 * THE WHOLE PAYLOAD, WHICH IS THE ONLY THING THE BROWSER RECEIVES.
 *
 * The browser does NOT receive markup. web/app.js builds DOM nodes from this
 * data - the same way renderCapitalProjects() builds its rows from records -
 * because this repo contains no innerHTML, outerHTML or insertAdjacentHTML
 * anywhere, and handing a browser an HTML string to parse would be a new and
 * strictly worse pattern rather than a convenience.
 *
 * So the CONTENT lives here once: the states, the sentences, the refusals, the
 * acquisition paths and the capture quotation all come from this module, and
 * the browser's only job is to place them. The captured figures it renders are
 * the same strings the design folder's check verifies in
 * scripts/export-finance-lens.mjs's output, which is what makes that export
 * evidence about the built surface rather than about a document nobody serves.
 */
export function financeLensPayload(pack, opts = {}) {
  const state = financeLensState(pack, opts);
  return {
    finance: state,
    refusals: financeRefusals(state),
    capture: financeCaptureQuotation(pack),
    captureIntro: CAPTURE_INTRO,
    captureCaveat: CAPTURE_CAVEAT,
  };
}

/* ------------------------------------------------------------- rendering */

function pill(state) {
  return `<span class="pill ${PILL_CLASS[state] || "p-quiet"}">${escapeHtml(state)}</span>`;
}

/** One refusal row, shared by the panel below and the acquisition panel's reasoning. */
function refusalRow(r) {
  return `
                          <div class="finding" data-finance-refusal="${escapeHtml(r.id)}">
                            <span class="ftitle">${escapeHtml(r.label)} <span class="pill ${PILL_CLASS[r.state] || "p-quiet"}" data-finance-refusal-state="${escapeHtml(r.id)}">${escapeHtml(r.state)}</span></span>
                            <span class="fmeta">needs ${escapeHtml(r.blockedBy)} (${escapeHtml(r.blockedByState)})</span>
                            <p class="f" data-finance-refusal-reason="${escapeHtml(r.id)}">${escapeHtml(r.reason)}</p>
                          </div>`;
}

/**
 * The built Finance lens, as one section, for one pack.
 *
 * ONE IMPLEMENTATION, TWO CALLERS: scripts/bake-finance-lens.mjs writes the
 * unread default (pack = null) into web/index.html, and
 * scripts/export-finance-lens.mjs writes a resolved pack's markup for the
 * design folder's own check.mjs to scan. The runtime does NOT rebuild this
 * shape - web/app.js swaps state words and sentences out of the payload below,
 * so there is exactly one place where this markup is written.
 *
 * Every class below is defined in a served stylesheet. sc-kit.css is frozen and
 * byte-identical across three repos, so the full shape is drawn inside the
 * vocabulary that already exists; a class invented here would fail the
 * shipped-class gate, which is the gate working.
 */
export function renderFinanceLens(pack, { kinds = ADAPTER_KINDS, shapes = RECORD_SHAPES, readings = [] } = {}) {
  const state = financeLensState(pack, { kinds, shapes, readings });
  const refusals = financeRefusals(state);

  const sourceCards = state.sources
    .map(
      (s) => `
                        <div class="metric" data-finance-source="${escapeHtml(s.id)}">
                          <span class="k">${escapeHtml(s.label)}</span>
                          ${
                            s.value === undefined
                              ? `<span class="v word" data-finance-state="${escapeHtml(s.id)}">${escapeHtml(s.state)}</span>`
                              : `<span class="v t-data" data-finance-state="${escapeHtml(s.id)}" data-finance-value="${escapeHtml(s.value)}">${escapeHtml(s.value)}</span>`
                          }
                          <span class="n" data-finance-basis="${escapeHtml(s.id)}">${escapeHtml(s.basis)}</span>
                        </div>`,
    )
    .join("");

  const registerRows = state.sources
    .map(
      (s) => `
                        <div class="srcreg${s.state === "PARTIAL" ? " partial" : ""}" data-finance-row="${escapeHtml(s.id)}">
                          <i class="rail"></i>
                          <span class="nm"><b>${escapeHtml(s.label)}</b><span>${escapeHtml(s.sub)}</span></span>
                          <span class="pill ${PILL_CLASS[s.state] || "p-quiet"}" data-finance-pill="${escapeHtml(s.id)}">${escapeHtml(s.state)}</span>
                        </div>`,
    )
    .join("");

  /**
   * THE ACQUISITION PATH, named owner and all. This is the design's
   * highest-leverage panel: one request to one person fills four regions that
   * are refused today, which is why it is drawn rather than implied.
   */
  const acquisitionRows = state.sources
    .filter((s) => s.acquisition)
    .map(
      (s) => `
                          <div class="finding">
                            <span class="ftitle">${escapeHtml(s.label)} <span class="t-caption">${escapeHtml(s.state)}</span></span>
                            <span class="fmeta">owner: ${escapeHtml(s.acquisition.owner)}</span>
                            <p class="f">${escapeHtml(s.acquisition.step)}. It fills ${escapeHtml(s.acquisition.fills)}. Not done yet because ${escapeHtml(s.acquisition.blocked)}.</p>
                          </div>`,
    )
    .join("");

  const quotationPanel = renderCapturePanel(pack);

  /**
   * A11Y, AND A DEFECT THIS REPO HAS ALREADY PAID FOR ONCE.
   *
   * The first version of this panel drew the four fund columns as a <table>
   * with a thead and an empty tbody, because that is how the artboard draws the
   * cells this lens will hold. axe's th-has-data-cells rule could not settle it
   * - headers describing no cell are not a pass - and the a11y gate refused the
   * build on all four Finance scans. The rule is already written down in
   * web/app.js above renderPropertyRecords(), from the time it fired there:
   * "the table and its honest-empty sibling are mutually hidden, never both, and
   * never a headers-only table left visible with zero rows".
   *
   * So the empty state comes first and the table body is hidden behind it. The
   * four cells are still NAMED on the page, in the empty state's heading, which
   * was the reason for drawing them at all: a field that appears only once
   * something writes it is a field no gap analysis can find.
   */
  const fundBlock = `
                      <div class="state compact" id="finance-fund-empty">
                        <span class="st-k" id="finance-fund-empty-kicker">Not read</span>
                        <h2 id="finance-fund-empty-head">No fund list has been read for this pack.</h2>
                        <span class="basis" id="finance-fund-basis">${escapeHtml(state.fundBasis)}</span>
                      </div>
                      <div id="finance-fund-body" hidden>
                        <table class="dt">
                          <caption class="t-caption">The four cells a fund row will carry: fund, appropriation, actuals, variance. The fund list is the adopted budget feed's own output.</caption>
                          <thead>
                            <tr>
                              <th scope="col">Fund</th>
                              <th scope="col">Appropriation</th>
                              <th scope="col">Actuals</th>
                              <th scope="col">Variance</th>
                            </tr>
                          </thead>
                          <tbody id="finance-fund-rows"></tbody>
                        </table>
                      </div>`;

  return `            <section class="lens" id="lens-finance">
              <header class="pagehead">
                <div class="crumb"><b data-pack-name>This city</b> <span>/</span> Finance</div>
                <div class="titlerow">
                  <h1>Finance</h1>
                  <span class="pill p-quiet" id="finance-state-chip">Not read</span>
                  <span class="grow"></span>
                  <span class="t-caption" id="finance-sources-rule">no finance source count has been read for this pack</span>
                </div>
                <p class="lede">No metric strip on this lens. Four zeros in a header would be four false claims. The strip below carries four <i>states</i> instead, and every cell this lens will ever hold exists on the page already, because a field that appears only once something writes it is a field no gap analysis can find.</p>
              </header>
              <div class="shell-regions">
                <div class="colstack" tabindex="0">
                  <div class="metrics" id="finance-source-metrics">${sourceCards}
                  </div>
                  <div class="panel" id="finance-source-register">
                    <div class="panel-head"><span class="t">What this lens reads</span><span class="grow"></span><span class="t-caption" id="finance-counts-label">${escapeHtml(state.label)}</span></div>
                    <div class="panel-body flush">${registerRows}
                    </div>
                    <div class="panel-body">
                      <span class="basis" id="finance-counts-rule">Basis: ${escapeHtml(state.rule)}</span>
                    </div>
                  </div>
                  <div class="panel" id="finance-appropriation">
                    <div class="panel-head"><span class="t">Appropriation by fund</span><span class="grow"></span><span class="pill p-quiet">Not read</span></div>
                    <div class="panel-body">
                      <p class="t-caption" id="finance-appropriation-note">${escapeHtml(state.appropriationNote)}</p>${fundBlock}
                    </div>
                  </div>
                  <div class="panel" id="finance-refusals">
                    <div class="panel-head"><span class="t">What does not reconcile yet</span><span class="grow"></span><span class="t-caption">Refused, not zero</span></div>
                    <div class="panel-body">${refusals.map(refusalRow).join("")}
                    </div>
                  </div>
                </div>
                <div class="colstack" tabindex="0">
                  <div class="panel" id="finance-acquisition">
                    <div class="panel-head"><span class="t">What has to land</span><span class="grow"></span><span class="t-caption">Named owner per source</span></div>
                    <div class="panel-body">${acquisitionRows}
                    </div>
                  </div>${quotationPanel}
                  <div class="panel" id="finance-no-metric-strip">
                    <div class="panel-head"><span class="t">Why there is no metric strip</span><span class="grow"></span><span class="t-caption">and why that is the point</span></div>
                    <div class="panel-body">
                      <p>The shipped lens says it in one line and it is the right line: <cite>No metric strip on this lens. Four zeros in a header would be four false claims.</cite></p>
                      <p>A header of four confident numbers is what v1 does, and three of its four are not measurements. The strip at the top of this lens is four states, not four figures, so the page is readable at a glance without any of it being a claim about money.</p>
                      <span class="basis">Basis: ${escapeHtml(state.label)}. Counting rule: ${escapeHtml(state.rule)}.</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>`;
}

/* ------------------------------------------------------------------ bake */

/**
 * The transform, as a PURE function, for the reason shell-homes.mjs's bake is
 * one: a transform that lives only in a script cannot be asserted, so a stale
 * document ships green in either direction. scripts/bake-finance-lens.mjs and
 * src/finance-lens.test.mjs call this ONE implementation, and the test asserts
 * web/index.html is a FIXED POINT of it.
 *
 * CRLF-PRESERVING, AND THIS IS NOT HYGIENE. D-9 exists because GCP serves all
 * seven files under web/ with CRLF, and `.gitattributes` marks `web/** -text` so
 * no checkout on any platform rewrites them. A bake that normalizes to LF and
 * writes back flattens the whole document: the first run of this function
 * produced a 3,620-line diff on web/index.html, 1,909 insertions against 1,760
 * deletions, for a section that is 14KB. The line-ending form is read from the
 * input and restored on the way out, so the bake changes only the section.
 *
 * NOTE FOR THE NEXT READER: src/shell-homes.mjs's bakeConnectionsInto() does NOT
 * do this - it returns the LF-normalized text - so running
 * scripts/bake-connections.mjs flattens web/index.html the same way. That is a
 * live latent defect in a shared transform, it is NOT this lane's scope to fix,
 * and it is in this lane's close as a finding. Read it before running that bake.
 */
export function bakeFinanceLensInto(rawHtml) {
  const source = String(rawHtml);
  /** The form the document already uses is the form it keeps. */
  const usesCrlf = /\r\n/.test(source);
  const html = source.replace(/\r\n/g, "\n");
  const marker = '<section class="lens" id="lens-finance">';
  const at = html.indexOf(marker);
  if (at < 0) throw new Error("lens-finance section missing from the bake target");

  /** From the start of the marker's line, so the bake is indentation-stable. */
  const start = html.lastIndexOf("\n", at) + 1;

  const nextMarker = '<section class="lens" id="lens-citizen">';
  const nextAt = html.indexOf(nextMarker, at);
  if (nextAt < 0) throw new Error("the section after lens-finance is missing");
  const end = html.lastIndexOf("\n", nextAt) + 1;

  const out = `${html.slice(0, start)}${renderFinanceLens(null)}\n\n${html.slice(end)}`;
  return usesCrlf ? out.replace(/\n/g, "\r\n") : out;
}
