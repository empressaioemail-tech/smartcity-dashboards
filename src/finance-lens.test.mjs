/**
 * G-156. The Finance lens, proven at the branches rather than at the happy path.
 *
 * The three acceptance items that are provable without the design folder's check
 * live here, each one exercised by making it fail:
 *
 *   ABSENT, ZERO AND UNACCOUNTED ARE THREE STATES AND RENDER THREE WAYS.
 *   A fabricated zero is worse than an absence, so the test renders one surface
 *   holding all three and asserts the three renderings differ - and that neither
 *   the zero nor the absence is rendered as the other.
 *
 *   THE FUND LEDGER STAYS UNACCOUNTED. Asserted on every shipped pack, with its
 *   acquisition path named. The measured-zero branch is reached by INJECTING a
 *   reading, because it must be observable without editing src/ and because the
 *   shipped surface must never reach it.
 *
 *   MONEY TRACEABILITY is the design folder's instrument, not this file's; what
 *   is asserted here is its precondition, that the default surface carries no
 *   money token at all, so a check pointed at it cannot pass on a stray figure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BASTROP_TX,
  EMPTY_CITY,
  FIXTURE_CITY,
  TEMPLATE_CITY,
} from "./city-pack.mjs";
import {
  CAPTURE_CITY_KEY,
  CAPTURE_INTRO,
  FINANCE_CAPTURE_QUOTATION,
  FINANCE_REQUIRED_SOURCES,
  FINANCE_STATES,
  bakeFinanceLensInto,
  financeCaptureQuotation,
  financeLensPayload,
  financeLensState,
  financeRefusals,
  renderFinanceLens,
} from "./finance-lens.mjs";
import { grantedKindIds, packSources } from "./city-identity.mjs";

const PACKS = [TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY, BASTROP_TX];
const SOURCE_IDS = FINANCE_REQUIRED_SOURCES.map((s) => s.id);
const money = (html) => [...new Set(html.match(/\$[0-9][0-9,.]*\s?[MKB]?/g) || [])];

/** A reading in the shape resolveSource consumes, carrying its own provenance. */
const reading = (sourceId, value, from = "OpenGov budget export", readOn = "2026-09-17") => ({
  sourceId,
  value,
  from,
  readOn,
});

describe("G-156 finance lens: states", () => {
  it("declares the design's five states and no sixth", () => {
    assert.deepEqual(FINANCE_STATES, ["MEASURED", "UNACCOUNTED", "REFUSED", "CONFLICT", "PARTIAL"]);
  });

  it("reports every shipped pack from its own grants, with no reading on any of them", () => {
    for (const pack of PACKS) {
      const state = financeLensState(pack);
      assert.equal(state.resolved, true, pack.cityKey);
      assert.equal(state.read, 0, `${pack.cityKey} reads no finance source`);
      assert.equal(state.total, SOURCE_IDS.length, pack.cityKey);
      for (const source of state.sources) {
        assert.ok(FINANCE_STATES.includes(source.state), `${pack.cityKey} ${source.id}: ${source.state}`);
        assert.equal(source.value, undefined, `${pack.cityKey} ${source.id} carries no figure`);
        assert.ok(source.basis.length > 20, `${pack.cityKey} ${source.id} states its basis`);
      }
    }
  });

  it("keeps the fund ledger UNACCOUNTED on every shipped pack, with its acquisition path", () => {
    for (const pack of PACKS) {
      const ledger = financeLensState(pack).sources.find((s) => s.id === "fund-ledger");
      assert.equal(ledger.state, "UNACCOUNTED", pack.cityKey);
      assert.ok(ledger.acquisition, `${pack.cityKey} names the ledger's owner`);
      assert.equal(ledger.acquisition.owner, "city finance director", pack.cityKey);
      /** Nothing on the ledger row is a figure, and nothing claims one. */
      assert.equal(ledger.value, undefined, pack.cityKey);
    }
  });

  it("says NOT READ rather than inventing a grant count for an unresolved pack", () => {
    const state = financeLensState(null);
    assert.equal(state.resolved, false);
    assert.equal(state.lens, "Not read");
    assert.equal(state.label, "no finance source count has been read for this pack");
    for (const source of state.sources) {
      assert.equal(source.state, "Not read", source.id);
      assert.equal(source.basis.includes("0 of"), false, `${source.id} claims a grant count`);
      assert.ok(source.basis.includes("no pack has been resolved"), source.id);
    }
  });

  it("carries the mygov grant on Bastrop to PARTIAL and names the split", () => {
    const state = financeLensState(BASTROP_TX);
    const fees = state.sources.find((s) => s.id === "permit-fee-revenue");
    assert.equal(fees.state, "PARTIAL");
    assert.match(fees.basis, /collected|ledger/i);
    assert.equal(state.partial, 1);
    assert.equal(state.lens, "PARTIAL");
    assert.equal(state.sources.find((s) => s.id === "adopted-budget").state, "UNACCOUNTED");
  });

  it("refuses a derived figure whose input is unaccounted rather than printing zero", () => {
    const refusals = financeRefusals(financeLensState(BASTROP_TX));
    const variance = refusals.find((r) => r.id === "variance");
    assert.equal(variance.state, "REFUSED");
    assert.equal(variance.blockedBy, "fund-ledger");
    assert.equal(variance.blockedByState, "UNACCOUNTED");
    assert.match(variance.reason, /refused rather than shown as zero/);
    for (const r of refusals) {
      assert.equal(r.state, "REFUSED", r.id);
      assert.equal(/\$/.test(r.reason), false, `${r.id} quotes a figure in a refusal`);
    }
  });

  it("prints the disagreement, not a winner, when two readings disagree", () => {
    const state = financeLensState(BASTROP_TX, {
      readings: [reading("fund-ledger", 0), reading("fund-ledger", 12, "MyGov collection report")],
    });
    const ledger = state.sources.find((s) => s.id === "fund-ledger");
    assert.equal(ledger.state, "CONFLICT");
    assert.equal(ledger.value, undefined);
    assert.match(ledger.basis, /disagree/);
  });

  it("holds the Finance derivation to the grant-counting rule's own numerator", () => {
    /**
     * CTRL-1. grantedKindIds() is the one implementation of "the distinct
     * adapter kinds a pack has granted, intersected with the catalog", and
     * packSources() and this lens both read it. Two figures that are meant to
     * be comparable must be comparable: if these ever disagree, one of the two
     * callers has started counting something else.
     */
    for (const pack of PACKS) {
      assert.equal(
        grantedKindIds(pack).granted.length,
        packSources(pack).granted,
        `${pack.cityKey}: the lens and the nav footer count the same grants`,
      );
    }
  });
});

describe("G-156 finance lens: absent, zero and unaccounted on one surface", () => {
  /**
   * One surface, three states, and the undrawn fund table as the absence.
   * `readings` is the only difference between this surface and a shipped one,
   * which is why the branch is reachable in a test and never on a pack.
   */
  const surface = renderFinanceLens(BASTROP_TX, { readings: [reading("fund-ledger", 0)] });

  it("renders a measured zero as a figure, with the source and the date it was read", () => {
    const cell = surface.match(/data-finance-state="fund-ledger"[^>]*>([^<]*)</)?.[1];
    assert.equal(cell, "0", "a measured zero renders as 0");
    assert.match(surface, /data-finance-basis="fund-ledger">read from OpenGov budget export on 2026-09-17</);
    assert.equal(surface.includes(">0<"), true);
  });

  it("renders an unaccounted source as a word, with no figure anywhere on the row", () => {
    const cell = surface.match(/data-finance-state="adopted-budget"[^>]*>([^<]*)</)?.[1];
    assert.equal(cell, "UNACCOUNTED");
    const basis = surface.match(/data-finance-basis="adopted-budget">([^<]*)</)?.[1] || "";
    assert.equal(/\$/.test(basis), false);
  });

  it("renders the absent fund list as no rows and a stated reason, not as zero rows", () => {
    assert.match(surface, /<tbody id="finance-fund-rows"><\/tbody>/);
    const basis = surface.match(/id="finance-fund-basis">([^<]*)</)?.[1] || "";
    assert.match(basis, /0 fund rows on this page/);
    assert.match(basis, /because the fund list is the adopted budget feed's own output/);
    /** A stated absence is not a balance, and it says which. */
    assert.equal(/balance of zero|no spending|\$0/.test(surface), false);
  });

  it("keeps the three renderings distinguishable from each other", () => {
    const zero = surface.match(/data-finance-state="fund-ledger"[^>]*>([^<]*)</)?.[1];
    const word = surface.match(/data-finance-state="adopted-budget"[^>]*>([^<]*)</)?.[1];
    const absent = /<tbody id="finance-fund-rows"><\/tbody>/.test(surface);
    assert.equal(zero === word, false, "zero and unaccounted are not the same rendering");
    assert.equal(absent, true, "the absence is an empty table, not a zero");
    assert.equal(zero, "0");
  });

  it("leaves the shipped surface with no measured source at all", () => {
    for (const pack of PACKS) {
      const html = renderFinanceLens(pack);
      assert.equal(html.includes("data-finance-value="), false, pack.cityKey);
    }
  });
});

describe("G-156 finance lens: the capture quotation is gated and attributed", () => {
  it("quotes the capture on the capture city only", () => {
    assert.equal(typeof financeCaptureQuotation(BASTROP_TX), "object");
    assert.equal(CAPTURE_CITY_KEY, "bastrop_tx");
    for (const pack of [TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY]) {
      assert.equal(financeCaptureQuotation(pack), null, pack.cityKey);
      assert.equal(financeCaptureQuotation(null), null);
    }
  });

  it("renders no figure for a pack the capture is not about", () => {
    for (const pack of [TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY, null]) {
      const html = renderFinanceLens(pack);
      assert.deepEqual(money(html), [], `${pack?.cityKey ?? "no pack"} renders no money token`);
      assert.match(html, /id="finance-capture-absence"(?! hidden)/);
      assert.match(html, /id="finance-capture-pill">Not read</);
    }
  });

  it("quotes every capture figure behind an attribution and a caveat, never as a reading", () => {
    const html = renderFinanceLens(BASTROP_TX);
    assert.match(html, /id="finance-capture-absence" hidden/);
    assert.match(html, /id="finance-capture-pill">Quotation</);
    assert.ok(html.includes(CAPTURE_INTRO));
    assert.match(html, /are not readings of any source system/);
    assert.match(html, /READ OFF A COMPRESSED SCREENSHOT/);
    for (const row of FINANCE_CAPTURE_QUOTATION) {
      for (const figure of row.figures) {
        assert.equal(html.includes(`>${figure}<`), true, `${figure} renders in its own node`);
      }
      assert.match(html, /v1 said:/);
      assert.match(html, /capture page/);
    }
    /** And the one figure the ruling keeps off the built surface stays off it. */
    assert.match(html, /This lens: REFUSED as a spend figure/);
  });

  it("never renders a state word outside the declared vocabulary on a resolved pack", () => {
    const html = renderFinanceLens(BASTROP_TX);
    for (const word of html.match(/(?<=data-finance-state="[a-z-]+">)[A-Z ]+(?=<)/g) || []) {
      assert.ok(FINANCE_STATES.includes(word), word);
    }
  });
});

describe("G-156 finance lens: payload and bake", () => {
  it("ships the sentences with the data so the browser writes none of them", () => {
    const payload = financeLensPayload(BASTROP_TX);
    assert.ok(payload.finance.appropriationNote.includes("counted for bastrop_tx"));
    assert.ok(payload.finance.fundBasis.includes("adopted budget feed"));
    assert.equal(payload.capture.length, FINANCE_CAPTURE_QUOTATION.length);
    assert.ok(payload.captureIntro.length > 40);
    assert.ok(payload.captureCaveat.length > 40);
    assert.ok(payload.refusals.every((r) => typeof r.reason === "string" && r.reason.length > 20));
    /** And an unresolved payload says nothing about a pack it does not have. */
    const bare = financeLensPayload(null);
    assert.equal(bare.capture, null);
    assert.equal(bare.finance.appropriationNote.includes("counted for"), false);
    assert.equal(bare.finance.fundBasis.includes("no pack has been resolved"), true);
  });

  it("ships web/index.html as a FIXED POINT of the bake, so staleness cannot be silent", () => {
    /**
     * The freshness guarantee, and the reason the transform lives in src/ rather
     * than in the script: a section edited in src/ and not re-baked ships stale,
     * and web/index.html edited by hand ships a version of the lens no code
     * produces. Both failures are silent without this assertion.
     */
    const shipped = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
    assert.equal(
      bakeFinanceLensInto(shipped),
      shipped,
      "web/index.html is not what src/finance-lens.mjs bakes; run `node scripts/bake-finance-lens.mjs`",
    );
    assert.equal(shipped.includes("\r\n"), true, "web/index.html keeps its CRLF form");
    assert.deepEqual(money(shipped.match(/id="lens-finance"[\s\S]*?<section class="lens" id="lens-citizen">/)?.[0] || ""), []);
  });

  it("holds the bake at a fixed point and preserves the document's line endings", () => {    /**
     * A minimal bake target: the contract is that the section between the
     * finance marker and the next lens is replaced, and that a CRLF document
     * comes back CRLF. The first version of the bake flattened the whole file -
     * a 3,620-line diff for a 14KB section - which is what this asserts against.
     */
    const doc = (eol) =>
      [
        "<html>",
        '<body>',
        '  <section class="lens" id="lens-finance">',
        "    stale",
        "  </section>",
        '  <section class="lens" id="lens-citizen">',
        "    untouched",
        "  </section>",
        "</body>",
        "</html>",
        "",
      ].join(eol);
    const crlf = bakeFinanceLensInto(doc("\r\n"));
    assert.equal(bakeFinanceLensInto(crlf), crlf, "baking twice changes nothing");
    assert.equal(/\n/.test(crlf.replaceAll("\r\n", "")), false, "the CRLF document stays CRLF");
    assert.match(crlf, /id="lens-citizen">\r\n    untouched/);
    const lf = bakeFinanceLensInto(doc("\n"));
    assert.equal(bakeFinanceLensInto(lf), lf, "baking twice changes nothing");
    assert.equal(/\r/.test(lf), false, "an LF document stays LF");
  });
});
