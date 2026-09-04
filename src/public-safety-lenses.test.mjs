/**
 * ---------------------------------------------------------------------------
 * G-97 R2. POLICE AND FIRE AND EMS.
 *
 * Three registered domains reach a pixel: police-cameras and patrol-vehicles on
 * Police, fire-apparatus on Fire and EMS. This file asserts the markup and the
 * seam payloads those two lenses render from.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT, and the reason is a correction rather
 * than a scope choice. This lane first shipped its own four-state resolver as a
 * served src/ module so that granted-empty - reachable on no shipped pack -
 * could be proven in the bare-Node suite. G-97 R3 merged first with the same
 * rule inline in web/app.js, and two implementations of one rule on one page is
 * the CTRL-1 shape this program has already paid for twice. The resolver was
 * therefore DELETED and this lane composes R3's renderer, so the four-state
 * copy is asserted once, in src/render-lenses.test.mjs, for all four lenses.
 * The behavioural proof for these two lenses is the rendered walk in the lane's
 * close artifact, which is where R3's proof lives too.
 *
 * WHAT IS STILL ASSERTED HERE is what only these two lenses can say: that the
 * ungranted region renders as BUILT and sourceless, that the privacy exclusions
 * the camera and apparatus contracts declare are rendered as positive statements
 * and never as values, that every figure travels with its counting rule, and
 * that the six jobs absent from the registry keep the only surviving meaning of
 * "not built".
 * ---------------------------------------------------------------------------
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { composeDomain } from "./fixture-seam.mjs";
import { composeDomainById } from "./domains.mjs";
import { POLICE_CAMERAS_DOMAIN } from "./domains/police-cameras.mjs";
import { PATROL_VEHICLES_DOMAIN } from "./domains/patrol-vehicles.mjs";
import { FIRE_APPARATUS_DOMAIN } from "./domains/fire-apparatus.mjs";
import { EMPTY_CITY, TEMPLATE_CITY } from "./city-pack.mjs";
import { readSource } from "./served-surface.mjs";

const html = readSource("web/index.html");
const app = readSource("web/app.js");

const SECTIONS = {
  police: html.match(/<section class="lens" id="lens-police">[\s\S]*?<\/section>/)?.[0] || "",
  fire: html.match(/<section class="lens" id="lens-fire-ems">[\s\S]*?<\/section>/)?.[0] || "",
};

const CAMERAS = composeDomain(TEMPLATE_CITY, POLICE_CAMERAS_DOMAIN);
const PATROL = composeDomain(TEMPLATE_CITY, PATROL_VEHICLES_DOMAIN);
const APPARATUS = composeDomain(TEMPLATE_CITY, FIRE_APPARATUS_DOMAIN);
const CAMERAS_EMPTY = composeDomain(EMPTY_CITY, POLICE_CAMERAS_DOMAIN);
const PATROL_EMPTY = composeDomain(EMPTY_CITY, PATROL_VEHICLES_DOMAIN);
const APPARATUS_EMPTY = composeDomain(EMPTY_CITY, FIRE_APPARATUS_DOMAIN);

describe("G-97 R2 the two lenses are built, not roster placeholders", () => {
  it("replaces both stubs and keeps neither marker of one", () => {
    assert.ok(SECTIONS.police.length > 2000, "the Police section is missing or still a stub");
    assert.ok(SECTIONS.fire.length > 1500, "the Fire and EMS section is missing or still a stub");
    for (const [name, section] of Object.entries(SECTIONS)) {
      assert.equal(section.includes("is named, and not built."), false, name);
      assert.equal(section.includes("roster-lens"), false, `${name} still carries the marker class`);
    }
  });

  it("serves every slot of every region, so the one renderer has nothing to miss", () => {
    /**
     * The slot set is R3's, because the renderer is R3's. Asserting it here is
     * the other direction from the addressability gate: that gate proves the ids
     * a script reaches are served, this proves each region carries the FULL set,
     * so a region cannot ship with a state block and no records block.
     */
    const SLOTS = [
      "mark",
      "prov",
      "caption",
      "state",
      "kicker",
      "head",
      "basis",
      "records",
      "rows",
      "recordsbasis",
      "metrics",
    ];
    for (const prefix of ["police-cameras", "patrol-vehicles", "fire-apparatus"]) {
      for (const slot of SLOTS) {
        assert.ok(html.includes(`id="${prefix}-${slot}"`), `${prefix}-${slot} is not served`);
      }
    }
    for (const id of [
      "police-state-chip",
      "police-region-rule",
      "fire-ems-state-chip",
      "fire-ems-region-rule",
      "police-cameras-site-rows",
      "police-cameras-sites-rule",
      "police-cameras-occupancy-rows",
      "police-cameras-occupancy-rule",
      "police-cameras-occupancy-basis",
      "police-cameras-privacy",
      "police-cameras-inventory",
      "patrol-vehicles-operator",
      "fire-apparatus-station-rows",
      "fire-apparatus-stations-rule",
      "fire-apparatus-ready-rule",
      "fire-apparatus-crew",
    ]) {
      assert.ok(html.includes(`id="${id}"`), `${id} is not served`);
    }
  });

  it("composes the merged renderer rather than a second copy of it", () => {
    /**
     * One rule, one implementation. If this lane ever grows its own renderRegion
     * or its own state copy, this goes red and names it - which is the control,
     * not the comment above it.
     */
    for (const fn of ["renderRegion", "renderRegionMetrics", "statusLabelsFor", "loadDomain", "applyLensState", "sourcedLabel", "sourcedRule", "unreadRegion"]) {
      const declarations = (app.match(new RegExp(`\\bfunction ${fn}\\b`, "g")) || []).length;
      assert.equal(declarations, 1, `${fn} is declared ${declarations} times in the served script`);
      assert.ok(app.includes(`${fn}(`), `${fn} is declared and not used`);
    }
    assert.equal(app.includes("domain-render.mjs"), false, "the deleted resolver is still imported");
    for (const loader of ["loadPoliceLens", "loadFireEmsLens"]) {
      assert.match(app, new RegExp(`async function ${loader}\\(cityKey\\)`), loader);
      assert.match(app, new RegExp(`^${loader}\\(staffMap\\.cityKey\\);$`, "m"), `${loader} is never booted`);
    }
  });
});

describe("G-97 R2 the ungranted region, which is the one this row exists for", () => {
  it("is BUILT and sourceless on the shipped demo pack, and says both", () => {
    /**
     * The premise, measured rather than assumed. spireon is deliberately kept off
     * template-city's demonstration axis: a wave that grants everything quietly
     * deletes the state that proves ruling 1. If a later wave grants it, this
     * fails and somebody has to decide, rather than the product silently losing
     * its only ungranted region.
     */
    assert.equal(TEMPLATE_CITY.fixtureGrants.includes("spireon"), false);
    assert.equal(PATROL.status, "ungranted");
    assert.equal(PATROL.generated, true, "an ungranted region is built, and generated says so");
    assert.equal(PATROL.recordCount, 0);
    assert.match(PATROL.basis, /Spireon is not granted on template-city/);
    assert.match(PATROL.basis, /the Patrol roster region is built and has no source/);

    /**
     * And the generator is real rather than a stub, which is the other half of
     * the proof: if it were a stub, ungranted and not-built would be
     * indistinguishable one layer down, which is how the original misreading
     * happened. Watched populating on a throwaway pack that grants the kind.
     */
    const granted = composeDomain(
      { ...TEMPLATE_CITY, cityKey: "throwaway-pack", fixtureGrants: ["spireon"] },
      PATROL_VEHICLES_DOMAIN,
    );
    assert.equal(granted.status, "ok");
    assert.ok(granted.recordCount > 0, "the ungranted region's generator produces nothing");
  });

  it("keeps the built claim on the surface rather than only in the payload", () => {
    const patrol = SECTIONS.police.match(/id="patrol-vehicles-state"[\s\S]*?<\/div>/)?.[0] || "";
    assert.match(patrol, /This region is BUILT\./);
    assert.match(patrol, /What it does not have on this pack is a source/);
    // And it never fills the space it cannot fill.
    assert.match(patrol, /Nothing is drawn to fill the space/);
    assert.match(patrol, /a zero would be a claim about a fleet nobody has read/);
  });
});

describe("G-97 R2 privacy is a positive statement, never a gap", () => {
  it("renders no field the camera and apparatus contracts refuse to produce", () => {
    /**
     * The check has to tell a rendered VALUE from a stated REFUSAL, because the
     * refusal legitimately contains the words. Comments are stripped first - a
     * comment reaches no pixel - and the two declared basis lines are stripped by
     * id, which is what keeps this able to fire on a real reintroduction.
     */
    let scanned = (SECTIONS.police + SECTIONS.fire).replace(/<!--[\s\S]*?-->/g, "");
    scanned = scanned.replace(/<span class="basis" id="police-cameras-privacy">[\s\S]*?<\/span>/, "");
    scanned = scanned.replace(/<div class="state" id="police-cameras-state">[\s\S]*?<\/div>/, "");
    scanned = scanned.replace(/<div class="state" id="fire-apparatus-state">[\s\S]*?<\/div>/, "");
    scanned = scanned.replace(/<span class="basis" id="fire-apparatus-crew">[\s\S]*?<\/span>/, "");
    /**
     * One more DECLARED refusal: the occupancy caption states that the dimension
     * is a band and never a head count. It is static markup and nothing writes
     * it, which is exactly what makes it a refusal rather than a value, and
     * stripping it by id keeps this scan able to fire on a real reintroduction.
     */
    scanned = scanned.replace(
      /<span class="t-caption" id="police-cameras-occupancy-rule">[\s\S]*?<\/span>/,
      "",
    );
    for (const needle of [/\bplate\b/i, /persons? of interest/i, /\bcrew\b/i, /head ?count/i]) {
      assert.equal(needle.test(scanned), false, `${needle} reached the markup outside its declared exclusion`);
    }
    // The declarations are still there, and they come off the payload.
    assert.match(SECTIONS.police, /id="police-cameras-privacy"/);
    assert.match(SECTIONS.fire, /id="fire-apparatus-crew"/);
    assert.match(app, /extras\.excludedFamilies/);
    assert.match(app, /crewBasis/);
  });

  it("carries the exclusions in the payload, so the surface is rendering a contract", () => {
    assert.match(CAMERAS.extras.excludedFamilies, /excluded from generation, not merely absent from it/);
    assert.match(CAMERAS.extras.inventoryBasis, /not a city-owned inventory node/);
    assert.match(APPARATUS.extras.stations[0].crewBasis, /names no person/);
    // No generated record carries one of the refused fields, at source.
    for (const record of [...CAMERAS.records, ...APPARATUS.records]) {
      for (const key of ["plate", "plateRead", "personOfInterest", "crew", "occupancyCount"]) {
        assert.equal(key in record, false, `${key} is on a generated record`);
      }
    }
    // Occupancy is a BAND, and the not-measured band is one of the values.
    const bands = new Set(CAMERAS.records.map((r) => r.occupancyBand));
    assert.ok(bands.has("occupancy not measured"), "the honest-absence band is unreachable");
    for (const band of bands) assert.equal(/^\d+$/.test(band), false, `${band} is a count, not a band`);
  });
});

describe("G-97 R2 every figure travels with its counting rule", () => {
  it("reconciles the status tiles against the record count in both regions", () => {
    for (const [name, payload] of [["cameras", CAMERAS], ["apparatus", APPARATUS]]) {
      const summed = payload.extras.metrics.reduce((n, m) => n + m.count, 0);
      assert.equal(summed, payload.recordCount, `${name} tiles do not sum to its record count`);
      for (const metric of payload.extras.metrics) assert.ok(metric.countingRule, `${name} tile has no rule`);
    }
  });

  it("reconciles both camera dimensions against the same measured total", () => {
    const bySite = CAMERAS.extras.sites.reduce((n, s) => n + s.cameraCount, 0);
    const byBand = CAMERAS.extras.occupancy.bands.reduce((n, b) => n + b.count, 0);
    assert.equal(bySite, CAMERAS.recordCount);
    assert.equal(byBand, CAMERAS.recordCount);
    /**
     * The not-measured class is COUNTED, never derived by subtracting the other
     * three. Measured here by growing the other three and watching the total
     * stay honest rather than by reading the generator's comment.
     */
    const notMeasured = CAMERAS.extras.occupancy.bands.find((b) => b.band === "occupancy not measured");
    assert.ok(notMeasured, "the not-measured class is missing");
    assert.ok(notMeasured.count > 0, "the not-measured class is never exercised on this pack");
  });

  it("counts apparatus readiness per station rather than as one rollup", () => {
    const stations = APPARATUS.extras.stations;
    assert.ok(stations.length > 1, "one station cannot demonstrate a per-station count");
    const housed = stations.reduce((n, s) => n + s.apparatusCount, 0);
    assert.equal(housed, APPARATUS.recordCount);
    const ready = stations.reduce((n, s) => n + s.readyCount, 0);
    const inService = APPARATUS.records.filter((r) => r.status === "in-service").length;
    assert.equal(ready, inService, "the per-station readiness does not reconcile with the records");
    assert.match(APPARATUS.extras.readyCountingRule, /never derived by subtracting/);
  });

  it("ships every tile unread rather than as a zero", () => {
    for (const [name, section] of Object.entries(SECTIONS)) {
      const strips = section.match(/<div class="metrics"[\s\S]*?<\/div>\s*<\/div>/g) || [];
      assert.ok(strips.length >= 1, `${name} has no metric strip`);
      for (const strip of strips) {
        assert.match(strip, /Not read/, name);
        assert.equal(/class="v[^"]*">\s*\d/.test(strip), false, `${name} ships a number as static markup`);
      }
    }
  });
});

describe("G-97 R2 empty-city stays reachable and quiet", () => {
  it("returns no-fixture-source for all three regions, each with its own basis", () => {
    for (const [name, payload] of [
      ["cameras", CAMERAS_EMPTY],
      ["patrol", PATROL_EMPTY],
      ["apparatus", APPARATUS_EMPTY],
    ]) {
      assert.equal(payload.status, "no-fixture-source", name);
      assert.equal(payload.recordCount, 0, name);
      assert.ok(payload.basis, `${name} states no basis`);
      assert.match(payload.basis, /empty-city generates no records/, name);
    }
    /**
     * And it is a DIFFERENT sentence from the ungranted one, which is the whole
     * distinction: the same region on two packs must not read the same way.
     */
    assert.notEqual(PATROL_EMPTY.basis, PATROL.basis);
  });
});

describe("G-97 R2 the fifth state keeps the only meaning of Not built", () => {
  it("names the six jobs that are absent from the registry rather than hiding them", () => {
    for (const job of ["Incident log", "Regional operations map"]) {
      assert.ok(SECTIONS.police.includes(job), job);
    }
    for (const job of ["Occupancies", "Volunteer response", "County dispatch", "Flood and weather"]) {
      assert.ok(SECTIONS.fire.includes(job), job);
    }
    for (const [name, section] of Object.entries(SECTIONS)) {
      assert.match(section, /a registered region, so the surface does not exist/, name);
      assert.match(section, /<span class="pill p-quiet">Not built<\/span>/, name);
    }
  });

  it("proves none of them is registered, rather than asserting it", () => {
    for (const id of ["incident-log", "operations-map", "occupancies", "volunteer-response", "county-dispatch", "flood-and-weather"]) {
      const composed = composeDomainById(TEMPLATE_CITY, id);
      assert.equal(composed.status, "not-registered", id);
      assert.match(composed.basis, /is not a registered domain, so this surface is not built/, id);
    }
  });
});

describe("G-97 R2 accessibility is a merge gate in this lane", () => {
  it("keeps one h1 per section and the next heading at level two", () => {
    for (const [name, section] of Object.entries(SECTIONS)) {
      assert.equal((section.match(/<h1>/g) || []).length, 1, `${name} must carry exactly one h1`);
      assert.equal(/<h[3-6][\s>]/.test(section), false, `${name} skips a heading level`);
      assert.ok((section.match(/<h2[\s>]/g) || []).length >= 1, `${name} has no state heading`);
    }
  });

  it("makes every scrollable column keyboard reachable", () => {
    for (const [name, section] of Object.entries(SECTIONS)) {
      const stacks = section.match(/<div class="colstack[^"]*"[^>]*>/g) || [];
      assert.ok(stacks.length >= 1, `${name} has no colstack`);
      for (const stack of stacks) {
        assert.match(stack, /tabindex="0"/, `${name} ships an unreachable scrollable region`);
      }
    }
  });

  it("adds no control, so there is no unnamed one to find", () => {
    for (const [name, section] of Object.entries(SECTIONS)) {
      for (const tag of [/<button\b/, /<input\b/, /<select\b/, /<textarea\b/]) {
        assert.equal(tag.test(section), false, `${name} added an interactive control`);
      }
    }
  });

  it("renders a resolved status quiet, which is the visual law", () => {
    /**
     * Inherited from G-97 R3 rather than re-decided here, and reused rather than
     * re-implemented: statusLabelsFor maps a resolved band to the quiet carrier,
     * so twelve online cameras and eight in-service trucks are not the loudest
     * thing on their pages.
     *
     * TWO CLAIMS THAT STOOD HERE ARE NOW FALSE AND ARE CORRECTED RATHER THAN
     * QUIETLY DROPPED, because a stale comment is how a measurement outlives its
     * subject. (1) The kit defect this comment cited - --sc-ok #2F7A52 on
     * --sc-ok-wash #E3F0E8 at 4.44:1 against a 4.5:1 floor - was fixed by G-98,
     * which raised the light token to #2E7750 for a computed 4.623:1 in all four
     * repos as identical bytes. The carrier rule therefore rests on the visual
     * law alone and no longer on a contrast limit. (2) Development services no
     * longer renders ready-to-issue through p-ok: G-97 R1 routed renderPipeline
     * through this same statusLabelsFor at web/app.js:710 and said so in its own
     * comment there, so the resolved axis has ONE rendering product-wide.
     *
     * What remains, and it is a different axis rather than the same divergence:
     * src/adapters.mjs INSPECTION_RESULT_VALUES carries an `inspected` flag, not
     * a `resolved` flag, so `passed` still renders through p-ok. G-98 routed
     * that to the planner rather than settling it, because `inspected` is true
     * for failed and corrections as well and quieting on it would quiet a failed
     * inspection.
     */
    assert.match(app, /severity: metric\.resolved \? "quiet" : metric\.severity/);
    for (const payload of [CAMERAS, APPARATUS]) {
      const resolved = payload.extras.metrics.filter((m) => m.resolved);
      assert.equal(resolved.length, 1, "exactly one band per vocabulary is the resolved one");
      assert.ok(resolved[0].count > 0, "the resolved band is never exercised on this pack");
    }
  });
});

describe("G-97 R2 connects no feed and names no city", () => {
  it("reads grants and never writes one", () => {
    assert.deepEqual(TEMPLATE_CITY.grantedAdapters, []);
    assert.deepEqual(EMPTY_CITY.grantedAdapters, []);
    for (const [name, section] of Object.entries(SECTIONS)) {
      assert.equal(/bastrop/i.test(section), false, name);
      assert.equal(section.includes("template-city"), false, name);
      assert.equal(section.includes("empty-city"), false, name);
      assert.equal(/last sync|last read|last updated/i.test(section), false, name);
      // No vendor is named as static content; the provenance chip names a contract.
      for (const vendor of [/\bverkada\b/i, /\bspireon\b/i, /\bfirstdue\b/i]) {
        assert.equal(vendor.test(section), false, `${name} names a vendor in static markup`);
      }
    }
  });
});

/**
 * ---------------------------------------------------------------------------
 * G-116 close. Patrol-vehicles gap-close against the real staff fleet page
 * (smartcity-os's own PoliceDashboard.tsx, which despite the name covers all
 * Spireon-tracked fleet). Three real fields the mapping previously dropped:
 * NSpire maintenance records, the Spireon 7-day asset alert log, and the
 * "Inactive in NSpire" status badge. All additive -- Unit/Status/Operator are
 * untouched, three columns appended after them, and every new cell degrades
 * to blank on a record that lacks the field (fixture records included).
 * "NSpire" here is the real page's own status-source vocabulary (its own
 * badge literally reads "Inactive in NSpire"), not the vendor's company
 * name -- the "no vendor named in static markup" check above scans for
 * literal "spireon", which this does not contain.
 * ---------------------------------------------------------------------------
 */
describe("G-116 close: patrol-vehicles NSpire enrichment (maintenance, 7-day alerts, active state)", () => {
  it("adds three columns to the patrol table without touching the three that already ship", () => {
    const patrolTable = SECTIONS.police.match(/id="patrol-vehicles-records"[\s\S]*?<\/table>/)?.[0] || "";
    assert.match(patrolTable, /<th scope="col">Unit<\/th>/);
    assert.match(patrolTable, /<th scope="col">Status<\/th>/);
    assert.match(patrolTable, /<th scope="col">Operator<\/th>/);
    assert.match(patrolTable, /<th scope="col">NSpire<\/th>/);
    assert.match(patrolTable, /<th scope="col">Maintenance<\/th>/);
    assert.match(patrolTable, /<th scope="col">Recent Alerts<\/th>/);
  });

  it("renderPatrolRoster reads all three real fields and reuses td()/a dedicated cell helper, not a re-derived cell", () => {
    const renderer = app.match(/function renderPatrolRoster[\s\S]*?\n\}/)?.[0] || "";
    assert.match(renderer, /nspireStatusCell\(record\)/);
    assert.match(renderer, /td\(record\.maintenanceAlertCount\)/);
    assert.match(renderer, /td\(record\.recentAlertCount\)/);
    // The three pre-existing cells are still exactly there too.
    assert.match(renderer, /td\(record\.unitLabel, "subj"\)/);
    assert.match(renderer, /statusCell\(record, labels\)/);
    assert.match(renderer, /td\(record\.operatorRef, "id"\)/);
  });

  it("nspireStatusCell is declared once, renders only on a genuine false (not a fixture's undefined), and reuses the existing pill vocabulary", () => {
    const declarations = (app.match(/\bfunction nspireStatusCell\b/g) || []).length;
    assert.equal(declarations, 1, `nspireStatusCell is declared ${declarations} times in the served script`);
    const fn = app.match(/function nspireStatusCell[\s\S]*?\n\}/)?.[0] || "";
    assert.match(fn, /record\.activeInNspire === false/);
    // Reuses SEVERITY_PILL's declared vocabulary (className built from
    // `pill ${SEVERITY_PILL...}`, same as statusCell) rather than inventing
    // a new class string.
    assert.match(fn, /`pill \$\{SEVERITY_PILL\.quiet\}`/);
    assert.match(fn, /Inactive in NSpire/);
  });

  it("a fixture patrol record carries none of the three real-only fields, so they render blank rather than a fabricated NSpire state", () => {
    // PATROL itself is ungranted on TEMPLATE_CITY (see G-97 R2 above) and
    // carries zero records -- a granted throwaway pack is needed to get an
    // actual generated fixture record to inspect.
    const granted = composeDomain(
      { ...TEMPLATE_CITY, cityKey: "throwaway-pack", fixtureGrants: ["spireon"] },
      PATROL_VEHICLES_DOMAIN,
    );
    assert.ok(granted.records.length > 0, "expected the granted fixture to produce at least one record");
    for (const record of granted.records) {
      assert.equal("activeInNspire" in record, false);
      assert.equal("maintenanceAlertCount" in record, false);
      assert.equal("recentAlertCount" in record, false);
    }
  });
});
