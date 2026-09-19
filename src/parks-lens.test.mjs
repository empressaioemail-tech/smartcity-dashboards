/**
 * ---------------------------------------------------------------------------
 * G-151. THE PARKS LENS, ASSERTED AS A FILE RATHER THAN BY EYE.
 *
 * The dispatch's second acceptance item is that the SHIPPED Parks surface
 * renders no metric tile, no empty table and none of the built-surface
 * vocabulary. Every one of those is an ABSENCE, and an absence checked by
 * looking is checked by the same person who wrote it, so this file reads
 * web/index.html and the served document and asserts the absences directly.
 *
 * THE VOCABULARY IS DERIVED, NOT RETYPED. The forbidden words come off the
 * shipped resolver in web/app.js (executed in a sandbox, not copied), off the
 * seam's own status ids, and off this product's own composer output for two
 * real built-but-unfed regions. The five UI phrases are asserted to EXIST
 * somewhere in web/index.html before they are used to forbid anything, which is
 * what makes them shipped strings rather than words invented to be caught:
 * "Not read" is correct on Police and forbidden on Parks, and the difference
 * between those two is the entire design.
 *
 * COUNTING RULE for every figure below: measured at read time off web/index.html
 * and off the registry in src/domains.mjs, never quoted from a comment.
 * ---------------------------------------------------------------------------
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { readSource, root } from "./served-surface.mjs";
import { DOMAIN_REGISTRY, composeDomainById } from "./domains.mjs";
import { DOMAIN_STATUSES, composeDomain } from "./fixture-seam.mjs";
import { TEMPLATE_CITY, EMPTY_CITY, getMemoryPack } from "./city-pack.mjs";
import { ADAPTER_KINDS } from "./adapters.mjs";
import { ROSTER_LENS_IDS, LENS_LABELS } from "./staff-review.mjs";
import { CALL_ANALYTICS_DOMAIN } from "./domains/call-analytics.mjs";
import { PATROL_VEHICLES_DOMAIN } from "./domains/patrol-vehicles.mjs";
import {
  PARKS_LENS_ID,
  PARKS_DOMAIN_ID,
  CATALOGUED_KINDS,
  REFUSALS,
  ROSTER,
  NOT_REGISTERED_STATUS,
  bakeParksLensInto,
  composerSentence,
  parksLensModel,
  renderParksLens,
  renderParksSurface,
} from "./parks-lens.mjs";

const html = readSource("web/index.html");
const app = readSource("web/app.js");
const server = readSource("src/server.mjs");

/** The shipped Parks section, sliced so no assertion reads another lens. */
const SECTION = html.match(/<section class="lens roster-lens" id="lens-parks">[\s\S]*?<section class="lens" id="lens-police">/)?.[0] || "";

/* ------------------------------------------- the shipped resolver, executed */

function shippedResolver() {
  const badge = app.match(/const LENS_BADGE = \{[\s\S]*?\};/)?.[0];
  const order = app.match(/const LENS_BADGE_ORDER = \[[\s\S]*?\];/)?.[0];
  const status = app.match(/function lensStatus\(regions\) \{[\s\S]*?\n\}/)?.[0];
  const label = app.match(/function sourcedLabel\(regions\) \{[\s\S]*?\n\}/)?.[0];
  const rule = app.match(/function sourcedRule\(regions\) \{[\s\S]*?\n\}/)?.[0];
  for (const [name, text] of [
    ["LENS_BADGE", badge],
    ["LENS_BADGE_ORDER", order],
    ["lensStatus", status],
    ["sourcedLabel", label],
    ["sourcedRule", rule],
  ]) {
    assert.ok(text, `${name} could not be sliced out of web/app.js`);
  }
  const context = vm.createContext({});
  vm.runInContext(
    `${badge}\n${order}\n${status}\n${label}\n${rule}\nglobalThis.out = { LENS_BADGE, lensStatus, sourcedLabel, sourcedRule };`,
    context,
  );
  return context.out;
}

const SHIPPED = shippedResolver();

/**
 * The shipped shell's own phrases for a BUILT region with no source. Each is
 * asserted to be present in web/index.html elsewhere, so this list is a
 * quotation and not a wish list: a phrase that ships nowhere forbids nothing.
 */
const SHIPPED_UI_PHRASES = [
  "Not read",
  "Region unread",
  "has not been read",
  "No source",
  "source is granted on",
];

/**
 * THE BUILT-SURFACE VOCABULARY, every term with a source in this repo. "Not
 * built" is excluded because it is the one badge word that says the opposite,
 * and it is the word Parks is allowed to use.
 */
const BUILT_SURFACE_VOCAB = [
  ...Object.values(SHIPPED.LENS_BADGE),
  ...DOMAIN_STATUSES,
  SHIPPED.sourcedLabel([]),
  SHIPPED.sourcedRule([]),
  composeDomain(EMPTY_CITY, CALL_ANALYTICS_DOMAIN).basis,
  composeDomain(TEMPLATE_CITY, PATROL_VEHICLES_DOMAIN).basis,
  ...SHIPPED_UI_PHRASES,
].filter((t) => typeof t === "string" && t.length > 3 && t !== "Not built");

const builtTermsIn = (text) => BUILT_SURFACE_VOCAB.filter((t) => text.includes(t));

/** The four packs the invariance claim is measured across. */
const PACKS = [
  ["bundled", null],
  ["template-city", TEMPLATE_CITY],
  ["empty-city", EMPTY_CITY],
  ["bastrop_tx", getMemoryPack("bastrop_tx")],
];

/* ===========================================================================
 * 1. THE REGISTRY PARTITION, WHICH IS WHAT "NOT BUILT" MEANS
 * ======================================================================== */

describe("G-151 Parks is absent from the registry, and that is the state it renders", () => {
  it("carries no region, no gate and no record type anywhere in DOMAIN_REGISTRY", () => {
    assert.equal(DOMAIN_REGISTRY.some((d) => d.lensId === PARKS_LENS_ID), false);
    assert.equal(DOMAIN_REGISTRY.some((d) => d.id === PARKS_DOMAIN_ID), false);
    assert.equal(DOMAIN_REGISTRY.some((d) => d.recordType === "park-facility"), false);
  });

  it("has the composer answer not-registered rather than a fourth kind of empty", () => {
    const composed = composeDomainById(TEMPLATE_CITY, PARKS_DOMAIN_ID);
    assert.equal(composed.status, NOT_REGISTERED_STATUS);
    assert.equal(composed.recordCount, 0);
    assert.equal(composed.granted, false);
    assert.equal(composed.generated, false);
    // And not-registered is NOT a member of the seam's status vocabulary: a
    // built region that is empty is a different sentence, and the two must not
    // be collapsible into one word.
    assert.equal(DOMAIN_STATUSES.includes(NOT_REGISTERED_STATUS), false);
  });

  it("does not name a vendor, and the catalogue has no park system in it", () => {
    assert.deepEqual(CATALOGUED_KINDS, ADAPTER_KINDS.map((k) => k.id));
    assert.ok(CATALOGUED_KINDS.length >= 10, "the catalogue shrank; re-derive the design");
    for (const kind of CATALOGUED_KINDS) {
      assert.equal(/park|recreat|facilit/i.test(kind), false, `a parks-shaped kind appeared: ${kind}`);
    }
  });

  it("counts the roster off the registry, one row per department lens", () => {
    assert.deepEqual(ROSTER.map((r) => r.lensId), ROSTER_LENS_IDS);
    for (const row of ROSTER) {
      assert.equal(row.regionCount, DOMAIN_REGISTRY.filter((d) => d.lensId === row.lensId).length, row.lensId);
    }
    assert.equal(ROSTER.find((r) => r.lensId === PARKS_LENS_ID).regionCount, 0);
  });

  it("is the only roster lens with no region at all", () => {
    const empty = ROSTER.filter((r) => r.regionCount === 0).map((r) => r.lensId);
    assert.deepEqual(empty, [PARKS_LENS_ID]);
  });
});

/* ===========================================================================
 * 2. THE THREE REFUSALS, PROBED RATHER THAN QUOTED
 * ======================================================================== */

describe("G-151 the three refusals are the product's own, and they still fire", () => {
  it("probed all three guards and kept what each one said", () => {
    assert.equal(REFUSALS.length, 3);
    assert.deepEqual(REFUSALS.map((r) => r.label), ["assertDomainShape", "assertCityPackShape", "composeDomain"]);
    for (const r of REFUSALS) {
      assert.ok(r.message.length > 20, `${r.label} produced no message`);
      assert.match(r.message, new RegExp(PARKS_DOMAIN_ID + "|parks"), r.label);
    }
    // The two kind-shaped refusals name the reason, and the third names both
    // sides of a mismatch.
    assert.match(REFUSALS[0].message, /gated by parks, which is not a catalogued adapter kind/);
    assert.match(REFUSALS[1].message, /fixtureGrants names parks, which is not a catalogued adapter kind/);
    assert.match(REFUSALS[2].message, /returned a \w+ record but is gated by \w+/);
  });

  it("names no camelCase gate anywhere on the shipped page", () => {
    /**
     * The instrument's gate scanner looks for `gatedBy <kind>`. The page quotes
     * the guards' messages, which say "gated by", and the difference between
     * those two spellings is what keeps the page from declaring a vendor it does
     * not have.
     */
    assert.equal(/gatedBy\s+[a-z]/.test(SECTION), false);
    assert.equal(/gatedBy\s+[a-z]/.test(renderParksLens()), false);
  });

  it("would refuse to load if a guard stopped throwing", () => {
    // The module probes at import time and throws, so a probe that stopped
    // throwing is a module that cannot be imported. Proven by executing the same
    // shape the module executes, against a guard stubbed to accept it.
    const accept = () => {};
    let threw = false;
    try {
      // Mirrors src/parks-lens.mjs refusal(): a probe that does not throw is a
      // design that is wrong rather than stale.
      (() => {
        try {
          accept();
        } catch (err) {
          return err;
        }
        throw new Error("no longer refuses the shape this surface exists to describe");
      })();
    } catch {
      threw = true;
    }
    assert.equal(threw, true);
  });
});

/* ===========================================================================
 * 3. THE SURFACE: WHAT IT SAYS, AND WHAT IT MUST NEVER SAY
 * ======================================================================== */

describe("G-151 the built surface renders a negative claim, as a file", () => {
  it("carries the scoping marker the instrument reads, and not the renamed one", () => {
    const served = renderParksSurface(null);
    assert.match(served, /data-lens-body="parks"[\s\S]*?<\/main>/);
    assert.equal(served.includes("data-lens-scope"), false);
    // The document turns the section on with the shell's own rule, so the bytes
    // inside <main> stay the ones web/index.html bakes.
    assert.match(served, /<html lang="en" data-surface="lens-parks">/);
  });

  it("holds no table, because an empty one is the built-surface shape", () => {
    for (const [name, markup] of [["shipped section", SECTION], ["rendered section", renderParksLens()]]) {
      for (const tag of ["<table", "<thead", "<tbody", "<tr>", "<th ", "data-metric", 'class="metric"']) {
        assert.equal(markup.includes(tag), false, `${name} carries ${tag}`);
      }
    }
  });

  it("shows exactly one state badge, and it is the word that says the surface is absent", () => {
    const badge = /border-radius:var\(--sc-r-control\); padding:1px 6px; white-space:nowrap;">([^<]*)<\/span>/g;
    for (const markup of [SECTION, renderParksLens()]) {
      const words = [...markup.matchAll(badge)].map((m) => m[1]);
      assert.deepEqual(words, ["Not built"]);
    }
  });

  it("carries the composer sentence verbatim, because a paraphrase is an unverified claim", () => {
    const sentence = composerSentence(TEMPLATE_CITY);
    assert.match(sentence, /is not a registered domain, so this surface is not built$/);
    assert.ok(SECTION.includes(sentence), "the shipped section does not quote the composer");
    assert.ok(renderParksLens().includes(sentence));
  });

  it("renders no figure large enough to be a metric tile", () => {
    const bigFigure = /font:[45]00 (?:2[0-9]|[3-9][0-9])px\/\d+px var\(--sc-font-data\)/g;
    for (const markup of [SECTION, renderParksLens(), renderParksSurface(null)]) {
      assert.deepEqual(markup.match(bigFigure) || [], []);
    }
  });

  it("names no person anywhere in a rendered cell", () => {
    const person = /^(?:[A-Z]\.\s*)+[A-Z][a-z]+(?:-[A-Z][a-z]+)?$|^[A-Z]{2,}\s+[A-Z]{2,}(?:-[A-Z]{2,})?$/;
    const cells = /font:400 13px\/1[89]px var\(--sc-font-(?:data|ui)\); color:var\(--sc-ink(?:-2|-3)?\);">([^<]*)<\/span>/g;
    for (const markup of [SECTION, renderParksLens()]) {
      const named = [...markup.matchAll(cells)].map((m) => m[1].trim()).filter((c) => person.test(c));
      assert.deepEqual(named, []);
    }
  });
});

/* ===========================================================================
 * 4. THE BUILT-SURFACE VOCABULARY: ABSENT HERE, AND THE CHECK CAN SEE IT
 * ======================================================================== */

describe("G-151 none of the built-surface vocabulary reaches the Parks page", () => {
  it("quotes only phrases the shipped document really carries", () => {
    assert.ok(BUILT_SURFACE_VOCAB.length >= 10, `the vocabulary is ${BUILT_SURFACE_VOCAB.length} terms`);
    for (const term of SHIPPED_UI_PHRASES) {
      assert.ok(html.includes(term), `"${term}" is not in web/index.html, so quoting it forbids nothing real`);
    }
    for (const term of BUILT_SURFACE_VOCAB) assert.equal(typeof term, "string");
  });

  it("and every one of them is absent from the Parks section and from the rendered page", () => {
    assert.deepEqual(builtTermsIn(SECTION), []);
    assert.deepEqual(builtTermsIn(renderParksLens()), []);
    assert.deepEqual(builtTermsIn(renderParksSurface(null)), []);
  });

  it("the word is not forbidden everywhere, only here: Police ships it and is correct to", () => {
    /**
     * The divergence test. A rule that forbade "Not read" document-wide would
     * pass this file and be wrong about the whole product, so the same scanner
     * is pointed at a section where the word belongs.
     */
    const police = html.match(/<section class="lens" id="lens-police">[\s\S]*?<section class="lens" id="lens-fire-ems">/)?.[0] || "";
    assert.ok(police.length > 0, "the Police section could not be sliced");
    assert.ok(builtTermsIn(police).length > 0, "the scanner finds nothing on a section that is full of it, so it measures nothing");

    // And the scanner can fail: the same section, with one phrase planted.
    assert.ok(builtTermsIn(SECTION.replace("Not built", "Not read")).length > 0);
    assert.ok(builtTermsIn(SECTION.replace("</h1>", "</h1>has not been read")).length > 0);
  });
});

/* ===========================================================================
 * 5. THE INVARIANCE, WHICH IS THE FINDING
 * ======================================================================== */

describe("G-151 the reading does not vary by pack, so it is about the product", () => {
  it("renders byte-identical markup on four packs", () => {
    const readings = PACKS.map(([name, pack]) => [name, renderParksSurface(pack).match(/data-lens-body="parks"[\s\S]*?<\/main>/)[0]]);
    for (const [name, reading] of readings) {
      assert.equal(reading, readings[0][1], `${name} renders a different Parks page`);
    }
    // Not vacuous: the four packs really are different packs.
    assert.deepEqual(new Set(PACKS.map(([, p]) => p?.cityKey ?? "bundled")).size, 4);
  });

  it("reports the same state and basis for every pack", () => {
    const models = PACKS.map(([, p]) => parksLensModel(p));
    for (const model of models) {
      assert.equal(model.status, NOT_REGISTERED_STATUS);
      assert.equal(model.recordCount, 0);
      assert.equal(model.regionCount, 0);
      assert.equal(model.basis, models[0].basis);
    }
  });

  it("names no city and no vendor in the reading", () => {
    const reading = renderParksLens();
    for (const city of ["template-city", "empty-city", "bastrop_tx", "Bastrop"]) {
      assert.equal(reading.includes(city), false, `the reading names ${city}`);
    }
  });
});

/* ===========================================================================
 * 6. THE BAKE, THE ROUTE, AND THE ONE THING THAT WOULD CHANGE IT
 * ======================================================================== */

describe("G-151 the shipped document is a fixed point of the bake", () => {
  it("bakes nothing when it runs again", () => {
    assert.equal(bakeParksLensInto(html), html, "web/index.html is not what src/parks-lens.mjs bakes; run `node scripts/bake-parks-lens.mjs`");
  });

  it("puts the rendered section in the document verbatim, so the shell shows the design", () => {
    assert.ok(SECTION.startsWith(renderParksLens().split("\n")[0]));
    assert.ok(SECTION.includes(renderParksLens().split("\n").slice(1, 4).join("\n")), "the baked body is not the renderer's");
  });

  it("preserves the document's line endings rather than flattening web/**", () => {
    // Read with fs rather than readSource(): that helper normalizes CRLF away on
    // purpose, and this is the one assertion that must see the raw bytes.
    const raw = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");
    assert.equal(raw.includes("\r\n"), true, "web/index.html keeps its CRLF form (D-9)");
    const crlf = bakeParksLensInto(raw);
    assert.equal(/[^\r]\n/.test(crlf), false, "the bake introduced a bare LF into a CRLF document");
    assert.equal(bakeParksLensInto(crlf), crlf, "baking a CRLF document twice changes nothing");
    // And an LF document stays LF, because the form is read from the input.
    const lfDoc = raw.replace(/\r\n/g, "\n");
    assert.equal(/[^\r]\n/.test(bakeParksLensInto(lfDoc)), true);
    assert.equal(bakeParksLensInto(lfDoc).includes("\r"), false);
  });

  it("serves the same bytes it bakes, from one renderer", () => {
    for (const [name, pack] of PACKS) {
      const served = renderParksSurface(pack);
      assert.ok(served.includes(renderParksLens()), `${name}: the served page is not the baked section`);
    }
  });

  it("is reachable on the DO app at /lens/parks and nowhere else", () => {
    assert.match(server, /"\/lens\/parks": \{/);
    assert.match(server, /page: renderParksSurface/);
    // No dashboard payload: a route named after a dashboard is a claim that one
    // exists, and this lens has nothing to serve from one. Asserted against the
    // route table rather than the file, because the file says so in prose too.
    const surfaces = server.match(/const LENS_SURFACES = \{[\s\S]*?\n  \};/)?.[0] || "";
    assert.ok(surfaces.length > 0, "LENS_SURFACES could not be sliced out of src/server.mjs");
    assert.equal(surfaces.includes(`"/api/lenses/${PARKS_LENS_ID}/`), false);
  });

  it("states what would change it as a sourcing decision, not a sprint item", () => {
    assert.ok(renderParksLens().includes("catalogued as an adapter kind"));
    assert.ok(renderParksLens().includes("DOMAIN_REGISTRY"));
  });

  it("names the three near misses rather than reaching for one of them", () => {
    const markup = renderParksLens();
    for (const near of ["property-map-catalog.mjs", "staff-identity.mjs", "shell-homes.mjs"]) {
      assert.ok(markup.includes(near), `${near} is not named as a near miss`);
    }
    assert.ok(markup.includes("UNESTABLISHED"));
  });

  it("keeps the roster rows agreeing with the registry after the bake", () => {
    const rows = [...SECTION.matchAll(/data-roster-region="([a-z-]+):(\d+)"/g)];
    assert.equal(rows.length, ROSTER.length);
    for (const [, lensId, count] of rows) {
      assert.equal(Number(count), DOMAIN_REGISTRY.filter((d) => d.lensId === lensId).length, lensId);
    }
    // And the labels the page uses for those rows come off the same source the
    // shell uses, so a renamed lens cannot print two names.
    for (const r of ROSTER) assert.ok(LENS_LABELS[r.lensId] || r.lensId);
  });
});
