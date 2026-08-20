/**
 * ---------------------------------------------------------------------------
 * G-97 R3. The two lenses this lane renders, and the rules that make the
 * rendering honest.
 *
 * WHAT THIS FILE IS FOR. The existing gates already cover a great deal of this
 * markup - addressability serves every id, the class rule refuses an undefined
 * class, type conformance holds the stylesheet, city identity refuses a baked
 * city name. None of them can see the thing this lane exists to produce: that
 * the FOUR SOURCE STATES reach a customer as four different sentences. That is a
 * claim about copy and about wiring, and it is asserted here.
 *
 * WHY IT IS A TEST AND NOT A NOTE. Ruling 1 has been implemented in
 * src/fixture-seam.mjs since G-91 and invisible on every surface since G-91.
 * A rule that lives only in a seam is one careless render away from being
 * collapsed back into a single "empty", which is the defect the ruling exists to
 * close. Pinning the four kickers and the four head sentences means a future
 * lane that folds two of them together fails here by name.
 *
 * COUNTING RULE for every figure below: it is measured off the shipped sources
 * at read time - web/index.html, web/app.js - never quoted from a comment.
 * ---------------------------------------------------------------------------
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./served-surface.mjs";
import { DOMAIN_STATUSES } from "./fixture-seam.mjs";
import { TEMPLATE_CITY, EMPTY_CITY } from "./city-pack.mjs";
import { composeDomainById } from "./domains.mjs";
import { VEHICLE_STATUS_VALUES, PROJECT_STATUS_VALUES } from "./adapters.mjs";

const html = readSource("web/index.html");
const app = readSource("web/app.js");

/** The two sections this lane owns, sliced so no assertion reads another lens. */
const fleet = html.match(/id="lens-fleet"[\s\S]*?<\/section>/)?.[0] || "";
const works = html.match(/id="lens-public-works"[\s\S]*?<\/section>/)?.[0] || "";

/** The region prefixes and the slot vocabulary the one renderer addresses. */
const REGION_PREFIXES = ["fleet-roster", "pw-cip", "pw-calls"];
const REGION_SLOTS = [
  "mark",
  "prov",
  "caption",
  "state",
  "kicker",
  "head",
  "basis",
  "records",
  "recordsbasis",
];

describe("G-97 the two lenses are built, not roster placeholders", () => {
  it("carries a rendered region for every domain registered to these lenses", () => {
    assert.ok(fleet, "the fleet section must be sliceable");
    assert.ok(works, "the public works section must be sliceable");
    /**
     * The retired page-level sentence. "Not built" now means one thing only -
     * absent from the domain registry - and both of these lenses are in it, so
     * neither may say it about itself.
     */
    assert.equal(/is named, and not built/.test(fleet), false, "fleet still claims it is not built");
    assert.equal(/is named, and not built/.test(works), false, "public works still claims it is not built");
    assert.equal(fleet.includes("roster-lens"), false, "fleet is no longer a roster placeholder");
    assert.equal(works.includes("roster-lens"), false, "public works is no longer a roster placeholder");

    // Each region composes from the registry, and the registry is the authority.
    for (const [domainId, section] of [
      ["fleet-vehicles", fleet],
      ["cip-projects", works],
      ["call-analytics", works],
    ]) {
      const composed = composeDomainById(TEMPLATE_CITY, domainId);
      assert.notEqual(composed.status, "not-registered", `${domainId} must be registered`);
      assert.ok(section.includes(composed.region), `${domainId} region ${composed.region} is not on its lens`);
    }
  });

  it("serves every slot of every region, so the one renderer has nothing to miss", () => {
    /**
     * The renderer addresses getElementById(`${prefix}-<slot>`), so the required
     * id set is the CROSS PRODUCT of the three call-site literals with the nine
     * slots. The addressability gate already fails when one is missing; this
     * asserts the shape from the other side, in the terms a reader of this lane
     * would check by hand. 3 x 9 = 27, counted here rather than quoted.
     */
    const missing = [];
    for (const prefix of REGION_PREFIXES) {
      for (const slot of REGION_SLOTS) {
        if (!html.includes(`id="${prefix}-${slot}"`)) missing.push(`${prefix}-${slot}`);
      }
    }
    assert.deepEqual(missing, []);
    assert.equal(REGION_PREFIXES.length * REGION_SLOTS.length, 27);
    for (const prefix of REGION_PREFIXES) {
      assert.ok(app.includes(`renderRegion("${prefix}"`), `${prefix} does not reach the one renderer`);
    }
    // One renderer, not three copies of one rule.
    assert.equal((app.match(/function renderRegion\(/g) || []).length, 1);
  });
});

describe("G-97 the four source states are four sentences", () => {
  it("gives every state its own kicker, and no two share one", () => {
    /**
     * The seam declares four. The surface renders those four plus did-not-read,
     * which is a fifth determination rather than a fourth state: a failed read
     * is not an empty city, and an empty result is not an absence.
     */
    assert.deepEqual(DOMAIN_STATUSES, ["ok", "granted-empty", "ungranted", "no-fixture-source"]);
    const block = app.match(/const REGION_KICKER = \{[\s\S]*?\};/)?.[0] || "";
    assert.ok(block, "the kicker vocabulary must be declared in one place");
    for (const status of DOMAIN_STATUSES) {
      assert.match(block, new RegExp(`["']?${status}["']?:`), `${status} has no kicker`);
    }
    assert.match(block, /"did-not-read":/);
    const kickers = [...block.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.equal(kickers.length, 5, `expected five kickers, found ${kickers.length}`);
    assert.equal(new Set(kickers).size, 5, `two states share a kicker: ${kickers.join(" | ")}`);
  });

  it("keeps ungranted and granted-empty apart in the head sentence", () => {
    /**
     * THE ASSERTION THIS FILE EXISTS FOR. "This city has not granted the source"
     * and "the source is granted and returned nothing" are different sentences to
     * a customer, and a single "empty" says neither. The head function is read at
     * source and the two branches must produce different text.
     */
    const head = app.match(/function regionHead\([\s\S]*?\n\}/)?.[0] || "";
    assert.ok(head, "regionHead must exist");
    const ungranted = head.match(/status === "ungranted"\) return `([^`]*)`/)?.[1] || "";
    const grantedEmpty = head.match(/status === "granted-empty"\) \{\s*\n\s*return `([^`]*)`/)?.[1] || "";
    const noFixture = head.match(/status === "no-fixture-source"\) \{\s*\n\s*return `([^`]*)`/)?.[1] || "";
    for (const [name, text] of [
      ["ungranted", ungranted],
      ["granted-empty", grantedEmpty],
      ["no-fixture-source", noFixture],
    ]) {
      assert.ok(text.length > 20, `${name} has no head sentence`);
    }
    assert.notEqual(ungranted, grantedEmpty, "ungranted and granted-empty say the same thing");
    assert.notEqual(grantedEmpty, noFixture);
    assert.notEqual(ungranted, noFixture);
    // ungranted is about a GRANT; granted-empty is about a RETURN. Both say so.
    assert.match(ungranted, /granted/);
    assert.match(grantedEmpty, /returned no records/);
    assert.match(noFixture, /generates no records/);
  });

  it("renders the basis the SEAM stated, never one composed on the surface", () => {
    assert.match(app, /const line = payload\.basis/);
    assert.match(app, /`Basis: \$\{payload\.basis\}`/);
    // Every region carries a basis element and every one of them ships a fallback.
    for (const prefix of REGION_PREFIXES) {
      assert.match(html, new RegExp(`id="${prefix}-basis"[^>]*>Basis: no region payload has been read`), prefix);
    }
    // No freshness is invented anywhere on these two lenses.
    for (const [name, section] of [["fleet", fleet], ["public works", works]]) {
      assert.equal(/last (sync|synced|read|updated)/i.test(section), false, `${name} invents freshness`);
    }
    assert.equal(/last (sync|synced|read|updated)/i.test(app), false, "app.js invents freshness");
  });

  it("keeps empty-city reachable and quiet on every region", () => {
    /**
     * Measured against the pack rather than asserted: empty-city generates
     * nothing, so every region on both lenses resolves to no-fixture-source with
     * a basis, and none of them resolves to not-registered.
     */
    for (const domainId of ["fleet-vehicles", "cip-projects", "call-analytics"]) {
      const composed = composeDomainById(EMPTY_CITY, domainId);
      assert.equal(composed.status, "no-fixture-source", domainId);
      assert.ok(composed.basis.length > 20, `${domainId} states no basis`);
      assert.equal(composed.recordCount, 0);
    }
  });
});

describe("G-97 the two constraints these lenses carry", () => {
  it("keeps fleet telemetry out of the Assets inventory", () => {
    /**
     * G-24 stays at zero. The roster renders on Fleet and the not-an-asset basis
     * is rendered rather than left in the payload, because the surface is where
     * a reader would otherwise assume the opposite.
     */
    assert.match(fleet, /id="fleet-roster-inventory"/);
    assert.match(app, /setText\("fleet-roster-inventory"/);
    const composed = composeDomainById(TEMPLATE_CITY, "fleet-vehicles");
    assert.match(composed.extras.inventoryBasis, /not a city-owned inventory node/);
    // Nothing on this lens writes an asset, and the Assets surface is not touched.
    assert.equal(/work-assets/.test(fleet), false, "the fleet lens reaches into Assets");
    assert.equal(/atab-inventory/.test(fleet), false);
  });

  it("keeps call analytics aggregate, with no call and no person", () => {
    const composed = composeDomainById(TEMPLATE_CITY, "call-analytics");
    assert.equal(composed.recordType, "call-volume");
    // The rendered columns are bucket dimensions. None of them is a call.
    for (const column of ["Queue", "Offered", "Answered", "Abandoned", "Buckets", "Day"]) {
      assert.ok(works.includes(`<th scope="col">${column}</th>`), `missing column ${column}`);
    }
    /**
     * The excluded families are named in the honest-absence PROSE on this lens,
     * deliberately, so a reader learns the exclusion is declared rather than
     * merely unbuilt. The rule is therefore about what is READ and what is
     * COLUMNED, not about which words appear: no column names one, and the
     * renderer reads none of the three fields off a record.
     */
    for (const field of ["recording", "callerRef", "extensionOwner"]) {
      assert.equal(
        new RegExp(`<th[^>]*>[^<]*${field}`, "i").test(works),
        false,
        `call analytics columns ${field}`,
      );
      assert.equal(
        new RegExp(`\.${field}\b`).test(app),
        false,
        `the renderer reads ${field} off a record`,
      );
    }
    // And no row is a call: the only tbodies on this region are the two aggregates.
    const callsRegion = works.match(/id="pw-calls-records"[\s\S]*?id="pw-calls-recordsbasis"/)?.[0] || "";
    const tbodies = [...callsRegion.matchAll(/<tbody id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(tbodies, ["pw-calls-queue-rows", "pw-calls-day-rows"]);
    assert.match(works, /id="pw-calls-excluded"/);
    assert.match(app, /setText\("pw-calls-excluded"/);
    assert.match(composed.extras.excludedFamilies, /excluded from generation, not merely absent/);
  });

  it("prints no money on a capital improvement register", () => {
    const composed = composeDomainById(TEMPLATE_CITY, "cip-projects");
    assert.match(composed.extras.budgetBasis, /carries no budget figure/);
    assert.match(works, /id="pw-cip-budget"/);
    assert.match(app, /setText\("pw-cip-budget"/);
    assert.equal(/\$\s?\d/.test(works), false, "a money figure reached the register");
    for (const column of ["Budget", "Spend", "Cost"]) {
      assert.equal(works.includes(`<th scope="col">${column}</th>`), false, `${column} column`);
    }
  });
});

describe("G-97 counting rules travel with their figures", () => {
  it("prints no count without its denominator beside it", () => {
    // The tile note is the denominator for the tile value.
    assert.match(app, /of \$\{payload\.recordCount\} generated \$\{payload\.recordType\} records/);
    // The records basis carries the seam's own counting rule under the table.
    assert.match(app, /Counting rule: \$\{payload\.countingRule\}/);
    // The lens figure carries its denominator and its rule in the same string.
    assert.match(app, /\$\{sourced\} of \$\{regions\.length\}/);
    assert.match(app, /a region is sourced when its kind is granted on this pack and it returned records/);
    // Each dimension table is captioned with the rule the generator wrote.
    for (const id of ["fleet-operator-rule", "pw-cip-phase-rule", "pw-calls-queue-rule", "pw-calls-day-rule"]) {
      assert.match(html, new RegExp(`id="${id}"`), id);
      assert.match(app, new RegExp(`setText\\("${id}"`), id);
    }
  });

  it("states every metric as unread rather than as a zero", () => {
    for (const [name, section] of [["fleet", fleet], ["public works", works]]) {
      const strip = section.match(/<div class="metrics"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || "";
      assert.ok(strip, `${name} has no metric strip`);
      assert.equal(/class="v[^"]*">\s*0\s*</.test(strip), false, `${name} ships a zero`);
      assert.match(strip, /Not read/);
    }
    // The tiles are the vocabulary the record contract declares, not a new one.
    for (const value of VEHICLE_STATUS_VALUES) {
      assert.match(fleet, new RegExp(`data-metric="${value.id}"`), value.id);
    }
    for (const value of PROJECT_STATUS_VALUES) {
      assert.match(works, new RegExp(`data-metric="${value.id}"`), value.id);
    }
  });

  it("reconciles two independent aggregations of one measured total", () => {
    /**
     * DEV_PROCESS 1.4, applied to what the surface prints. The queue table and
     * the day table are two independent sums over the same buckets, and the
     * totals line is a third figure. Two that should agree and do not would be a
     * free finding; this asserts they agree, so a future change that breaks one
     * aggregation cannot pass by matching itself.
     */
    const composed = composeDomainById(TEMPLATE_CITY, "call-analytics");
    const byQueue = composed.extras.queues.reduce((sum, q) => sum + q.callsOffered, 0);
    const byDay = composed.extras.daily.reduce((sum, d) => sum + d.callsOffered, 0);
    assert.equal(byQueue, composed.extras.totals.callsOffered);
    assert.equal(byDay, composed.extras.totals.callsOffered);
    // And offered is answered plus abandoned, each drawn independently.
    assert.equal(
      composed.extras.totals.callsAnswered + composed.extras.totals.callsAbandoned,
      composed.extras.totals.callsOffered,
    );
  });
});

describe("G-97 accessibility is a merge gate in this lane", () => {
  it("keeps one h1 per surface and the next heading at level two", () => {
    for (const [name, section] of [["fleet", fleet], ["public works", works]]) {
      assert.equal((section.match(/<h1>/g) || []).length, 1, `${name} h1 count`);
      assert.equal(/<h[3-6]\b/.test(section), false, `${name} skips a heading level`);
      assert.ok((section.match(/<h2\b/g) || []).length >= 1, `${name} has no h2`);
    }
    /**
     * The .state block used <h5> product-wide, which is what fails heading-order
     * directly under an h1. .state h2 is already a pinned ramp selector, so this
     * costs no CSS and removes two of the eleven failing nodes rather than adding
     * to them. The other three roster lenses still carry h5 and are another
     * lane's; measured, not assumed.
     */
    assert.equal(/<h5\b/.test(fleet), false, "fleet still ships an h5");
    assert.equal(/<h5\b/.test(works), false, "public works still ships an h5");
  });

  it("makes every scrollable column keyboard reachable and named", () => {
    /**
     * .colstack carries overflow-y:auto, so a populated column IS a scrollable
     * region and axe's scrollable-region-focusable applies to it. role is
     * required as well as tabindex: aria-label on a roleless div is itself a
     * finding. The global :focus-visible outline gives the focus ring, so this
     * costs no CSS either.
     */
    for (const [name, section] of [["fleet", fleet], ["public works", works]]) {
      const stacks = section.match(/<div class="colstack"[^>]*>/g) || [];
      assert.ok(stacks.length >= 1, `${name} has no colstack`);
      for (const stack of stacks) {
        assert.match(stack, /tabindex="0"/, `${name}: ${stack}`);
        assert.match(stack, /role="region"/, `${name}: ${stack}`);
        assert.match(stack, /aria-label="[^"]+"/, `${name}: ${stack}`);
      }
    }
    // Two named regions must not share a name, or they stop being distinguishable.
    const labels = [...(fleet + works).matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(labels).size, labels.length, `duplicate region names: ${labels.join(" | ")}`);
  });

  it("adds no control, so there is no unnamed one to find", () => {
    for (const [name, section] of [["fleet", fleet], ["public works", works]]) {
      assert.equal(/<button/.test(section), false, `${name} adds a button`);
      assert.equal(/<input/.test(section), false, `${name} adds an input`);
      assert.equal(/<select/.test(section), false, `${name} adds a select`);
    }
  });

  it("renders a resolved status quiet, which is the visual law and also the kit's limit", () => {
    /**
     * MEASURED, and the measurement is the point. --sc-ok #2F7A52 on
     * --sc-ok-wash #E3F0E8 is 4.44:1 in the light theme, against 12px/500 text
     * that needs 4.5:1. Every other pill pair passes in both themes. The failing
     * pair lives in web/sc-kit.css, which is byte-identical across three repos,
     * so it cannot be fixed from here.
     *
     * The carrier decision is made on the visual law - quiet surfaces, loud
     * exceptions, a pass is quiet - and the contrast measurement is stated beside
     * it so the reason is not later mistaken for the other one. The ratio is
     * COMPUTED here rather than quoted, so a kit fix that raises the token makes
     * this assertion fail and forces the decision to be re-taken in the open.
     */
    const kit = readSource("web/sc-kit.css");
    const okHex = kit.match(/--sc-ok:(#[0-9A-Fa-f]{6})/)?.[1];
    const washHex = kit.match(/--sc-ok-wash:(#[0-9A-Fa-f]{6})/)?.[1];
    assert.ok(okHex && washHex, "the light ok pair must be readable from the kit");
    const lin = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
    const lum = (hex) => {
      const h = hex.slice(1);
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const a = lum(okHex);
    const b = lum(washHex);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(
      ratio < 4.5,
      `the light p-ok pair is now ${ratio.toFixed(2)}:1 and passes AA; the quiet carrier below was chosen while it did not, so re-take the decision rather than leaving it`,
    );
    assert.match(app, /severity: metric\.resolved \? "quiet" : metric\.severity/);
  });
});
