/**
 * ---------------------------------------------------------------------------
 * G-100. THE STATIC CLAIMS ABOUT A LENS, DERIVED FROM THE REGISTRY.
 *
 * WHAT WENT WRONG. Three lanes shipped Development services, Fleet, Public
 * works, Police and Fire and EMS. The lenses render; 91 table rows land on
 * Development services alone. And the nav went on saying "Not built" about four
 * of them, and the Overview register went on filing them under "Roster, not yet
 * built", because those were WORDS TYPED INTO web/index.html with nothing
 * connecting them to the thing that decides whether a surface exists.
 *
 * WHY A BETTER LITERAL IS NOT THE FIX. Typing "Built" over the top produces the
 * identical defect one wave later, pointing the other way. This repo has paid
 * for the hand-declared shape twice already - the has_writer manifest that
 * drifted from the engine in both directions, and the disposition column whose
 * misreading opened this programme. A claim that nothing derives is a claim
 * that will be wrong and will not tell anybody.
 *
 * SO THIS FILE IS THE DERIVATION. Every claim the markup makes about whether a
 * lens surface exists is recomputed here from src/domains.mjs's registry, and
 * asserted against what web/index.html actually ships. The registry is the
 * authority for exactly one reason and it is stated in src/fixture-seam.mjs:
 * "A domain that is NOT in the registry is the fifth state and it has no entry
 * here on purpose: absent from the registry means the surface does not exist,
 * which is the only surviving meaning of Not built."
 *
 * AND THE RUNTIME HALF RUNS THE SHIPPED CODE. The badge vocabulary and its
 * resolution are sliced out of web/app.js and executed in a vm sandbox, so the
 * four source states are shown driving the real function rather than a copy of
 * it written in a test. A second implementation here would be the CTRL-1 shape
 * inside the file built to prevent it.
 *
 * COUNTING RULE for every figure below: measured at read time off web/index.html
 * and web/app.js and off the registry in src/domains.mjs, never quoted from a
 * comment.
 * ---------------------------------------------------------------------------
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./served-surface.mjs";
import { DOMAIN_REGISTRY, composeDomainById } from "./domains.mjs";
import { DOMAIN_STATUSES, composeDomain, defineDomain } from "./fixture-seam.mjs";
import { TEMPLATE_CITY, EMPTY_CITY } from "./city-pack.mjs";
import { ROSTER_LENS_IDS, LENS_LABELS } from "./staff-review.mjs";
import { ALL_HOME_ROWS } from "./shell-homes.mjs";
import { FLEET_VEHICLES_DOMAIN } from "./domains/fleet-vehicles.mjs";
import { PATROL_VEHICLES_DOMAIN } from "./domains/patrol-vehicles.mjs";

const html = readSource("web/index.html");
const app = readSource("web/app.js");

/* --------------------------------------------------------- the partition */

/**
 * The two halves of the roster, derived. A roster lens is BUILT when at least
 * one domain in the registry declares it, and its surface does not exist when
 * none does. Nothing else may decide this, and in particular no list in this
 * file: both sides come from the imports above.
 */
const REGISTERED_LENS_IDS = new Set(DOMAIN_REGISTRY.map((d) => d.lensId));
const BUILT_ROSTER = ROSTER_LENS_IDS.filter((id) => REGISTERED_LENS_IDS.has(id));
const UNBUILT_ROSTER = ROSTER_LENS_IDS.filter((id) => !REGISTERED_LENS_IDS.has(id));

/** The nav badge web/index.html ships for one lens, or null when it ships none. */
function navBadgeOf(lensId) {
  const nav = html.match(/<nav class="shell-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  const item = nav.match(new RegExp(`<a [^>]*data-lens="${lensId}"[^>]*>[\\s\\S]*?</a>`))?.[0] || "";
  return item.match(/<span class="badge">([^<]*)<\/span>/)?.[1] ?? null;
}

/** The nav anchor's class attribute for one lens. */
function navClassOf(lensId) {
  const nav = html.match(/<nav class="shell-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  return nav.match(new RegExp(`<a class="([^"]*)" data-lens="${lensId}"`))?.[1] ?? null;
}

/** The Overview register, sliced, plus the group each department row sits in. */
function registerGroups() {
  const panel = html.match(/id="overview-source-register"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || "";
  const groups = {};
  let current = null;
  for (const m of panel.matchAll(/<div class="reg-group">([^<]*)<\/div>|<div class="srcreg"([^>]*)><[\s\S]*?<b>([^<]*)<\/b>/g)) {
    if (m[1] !== undefined) {
      current = m[1];
      groups[current] = [];
      continue;
    }
    if (current) groups[current].push({ name: m[3], attrs: m[2] });
  }
  return groups;
}

/* ------------------------------------------- the shipped resolver, executed */

/**
 * The badge vocabulary and its resolution, lifted out of the served script and
 * run for real.
 *
 * Sliced rather than re-typed. If a future edit renames or reshapes either
 * declaration this throws by name, which is the correct failure: an instrument
 * that silently falls back to its own copy of the rule is measuring itself.
 */
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
    `${badge}\n${order}\n${status}\n${label}\n${rule}\nglobalThis.out = { LENS_BADGE, LENS_BADGE_ORDER, lensStatus, sourcedLabel, sourcedRule };`,
    context,
  );
  return context.out;
}

const SHIPPED = shippedResolver();

/** A granted region that returned nothing. Unreachable on either shipped pack,
 *  so it is constructed here rather than left as a state nothing exercises. */
const GRANTED_EMPTY = composeDomain(
  { ...TEMPLATE_CITY, cityKey: "probe-city", displayName: "Probe city", fixtureGrants: ["mygov"] },
  defineDomain({
    id: "probe-granted-empty",
    lensId: "probe",
    region: "Probe",
    gatedBy: "mygov",
    recordType: "permit-case",
    vocabulary: [],
    generate: () => ({ records: [] }),
  }),
);

/* ===========================================================================
 * 1. THE VOCABULARY
 * ======================================================================== */

describe("G-100 the badge vocabulary is the seam's, not a second one", () => {
  it("carries one word per determination and no two the same", () => {
    /**
     * The seam declares four states. The surface renders those four plus
     * did-not-read, which is a fifth DETERMINATION rather than a fourth state:
     * a failed read is not an empty city. Both halves are read at source, so a
     * state added to src/fixture-seam.mjs and not to the badge fails here.
     */
    assert.deepEqual(DOMAIN_STATUSES, ["ok", "granted-empty", "ungranted", "no-fixture-source"]);
    assert.deepEqual(Object.keys(SHIPPED.LENS_BADGE).sort(), [...DOMAIN_STATUSES, "did-not-read"].sort());
    // Spread out of the sandbox: a vm array has the sandbox's prototype and a
    // strict deep-equal compares prototypes, so this would fail on identical values.
    assert.deepEqual([...SHIPPED.LENS_BADGE_ORDER], [...DOMAIN_STATUSES, "did-not-read"]);
    const words = Object.values(SHIPPED.LENS_BADGE);
    assert.equal(words.length, 5);
    assert.equal(new Set(words).size, 5, `two states share a word: ${words.join(" | ")}`);
  });

  it("keeps the two words the shipped packs already render", () => {
    /**
     * A state that has not changed must not change its sentence just because
     * the vocabulary around it grew. ok and no-fixture-source are what
     * template-city and empty-city resolve to today.
     */
    assert.equal(SHIPPED.LENS_BADGE.ok, "Demo records");
    assert.equal(SHIPPED.LENS_BADGE["no-fixture-source"], "Empty");
  });
});

/* ===========================================================================
 * 2. THE FOUR SOURCE STATES, DRIVING THE SHIPPED BADGE
 * ======================================================================== */

describe("G-100 the four source states reach the badge as four words", () => {
  it("resolves each state through the served function, on a real composed region", () => {
    const cases = [
      ["ok", composeDomain(TEMPLATE_CITY, FLEET_VEHICLES_DOMAIN)],
      ["ungranted", composeDomain(TEMPLATE_CITY, PATROL_VEHICLES_DOMAIN)],
      ["no-fixture-source", composeDomain(EMPTY_CITY, FLEET_VEHICLES_DOMAIN)],
      ["granted-empty", GRANTED_EMPTY],
    ];
    const seen = [];
    for (const [expected, region] of cases) {
      assert.equal(region.status, expected, `${expected} was not reachable`);
      assert.ok(region.basis.length > 20, `${expected} states no basis`);
      const word = SHIPPED.sourcedLabel([region]);
      assert.equal(word, SHIPPED.LENS_BADGE[expected], expected);
      seen.push(word);
    }
    // Four states, four different words on the nav. The flattening is the defect.
    assert.equal(new Set(seen).size, 4, `states share a word: ${seen.join(" | ")}`);
    // And a read that failed is its own fifth word, never one of the four.
    const unread = SHIPPED.sourcedLabel([{ status: "did-not-read" }]);
    assert.equal(unread, "Not read");
    assert.equal(seen.includes(unread), false);
  });

  it("rolls a mixed lens up by declared precedence, with the ratio beside it", () => {
    /**
     * Police is the mixed lens on the shipped demo pack: cameras generate and
     * patrol is the deliberately ungranted exemplar. The badge is ONE word by
     * the shape of the slot, so it says the lens renders - and the figure that
     * says how much of it is sourced is sourcedRule, which the page header
     * prints beside the chip. Asserted together, because the badge alone would
     * be the flattening this lane exists to undo.
     */
    const cameras = composeDomainById(TEMPLATE_CITY, "police-cameras");
    const patrol = composeDomainById(TEMPLATE_CITY, "patrol-vehicles");
    assert.equal(cameras.status, "ok");
    assert.equal(patrol.status, "ungranted");
    const regions = [cameras, patrol];
    assert.equal(SHIPPED.lensStatus(regions), "ok");
    assert.equal(SHIPPED.sourcedLabel(regions), "Demo records");
    const rule = SHIPPED.sourcedRule(regions);
    assert.match(rule, /^1 of 2 regions sourced;/);
    assert.match(rule, /granted on this pack and it returned records/);
    // The ungranted region still states its own absence in full.
    assert.match(patrol.basis, /is not granted on template-city/);
    assert.match(patrol.basis, /region is built and has no source/);
    assert.equal(/not built/i.test(patrol.basis), false);
  });
});

/* ===========================================================================
 * 3. THE STATIC CLAIMS, DERIVED
 * ======================================================================== */

describe("G-100 no lens claims a state the registry contradicts", () => {
  it("measures the partition rather than assuming it", () => {
    // Reported with its counting rule: a roster lens is built when at least one
    // registry entry declares its lensId.
    assert.deepEqual(ROSTER_LENS_IDS, ["public-works", "parks", "police", "fire-ems", "fleet"]);
    assert.deepEqual(BUILT_ROSTER, ["public-works", "police", "fire-ems", "fleet"]);
    assert.deepEqual(UNBUILT_ROSTER, ["parks"]);
    assert.equal(BUILT_ROSTER.length + UNBUILT_ROSTER.length, ROSTER_LENS_IDS.length);
    // And the unbuilt one is unbuilt for a reason the seam can state.
    for (const id of UNBUILT_ROSTER) {
      assert.equal(REGISTERED_LENS_IDS.has(id), false, id);
    }
  });

  it("ships no Not built badge on a lens the registry declares", () => {
    for (const id of BUILT_ROSTER) {
      const badge = navBadgeOf(id);
      assert.ok(badge, `${id} has no nav badge`);
      assert.equal(badge, "Not read", `${id} nav badge must be the unread fallback`);
      assert.equal(/not built/i.test(badge), false, `${id} still claims it is not built`);
    }
    for (const id of UNBUILT_ROSTER) {
      assert.equal(navBadgeOf(id), "Not built", `${id} must keep saying its surface does not exist`);
    }
  });

  it("dims a nav item only where the surface really does not exist", () => {
    /**
     * web/shell.css gives .navitem.roster the --sc-ink-3 dim, which is the same
     * claim in a stylesheet: a built lens rendered as a placeholder. It moves
     * with the badge or the two disagree in the one place a reader looks first.
     */
    for (const id of BUILT_ROSTER) {
      assert.equal(navClassOf(id), "navitem", `${id} is still dimmed as a roster placeholder`);
    }
    for (const id of UNBUILT_ROSTER) {
      assert.equal(navClassOf(id), "navitem roster", id);
    }
  });

  it("hooks the register row for every built roster lens and for no other", () => {
    const hooked = [...html.matchAll(/data-lens-row="([^"]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(hooked, [...BUILT_ROSTER].sort());
    // Every hook is on a row applyLensState can actually reach.
    for (const id of BUILT_ROSTER) {
      assert.match(html, new RegExp(`data-lens-row="${id}"[\\s\\S]{0,400}?<span class="pill [^"]*">Not read</span>`), id);
    }
    assert.match(app, /\[data-lens-row="\$\{lensId\}"\] \.pill/);
  });

  it("files every department row under a group the registry agrees with", () => {
    const groups = registerGroups();
    const built = (groups.Built || []).map((r) => r.name);
    const unbuilt = (groups["Not built"] || []).map((r) => r.name);
    for (const id of BUILT_ROSTER) {
      assert.ok(built.includes(LENS_LABELS[id]), `${LENS_LABELS[id]} is not filed as built`);
      assert.equal(unbuilt.includes(LENS_LABELS[id]), false, `${LENS_LABELS[id]} is still filed as not built`);
    }
    for (const id of UNBUILT_ROSTER) {
      assert.ok(unbuilt.includes(LENS_LABELS[id]), `${LENS_LABELS[id]} is not filed as not built`);
      assert.equal(built.includes(LENS_LABELS[id]), false, LENS_LABELS[id]);
    }
    // The retired heading is gone, and no group says roster any more.
    assert.equal(/Roster, not yet built/.test(html), false);
  });

  it("says WHY the one unbuilt lens is unbuilt, and does not invent a vendor", () => {
    /**
     * The vendorless finding, carried onto the surface. src/domains.mjs records
     * that Parks facilities and Court docket have "gates: none yet", a domain
     * must declare a gatedBy that resolves to a catalogued adapter kind, and
     * there is therefore no vendorless path through the seam. That is the honest
     * state today and the wrong one tomorrow, so the row states the reason
     * rather than leaving the reader to guess it was an oversight.
     */
    const groups = registerGroups();
    const parks = (groups["Not built"] || []).find((r) => r.name === "Parks");
    assert.ok(parks, "Parks left the not-built group");
    assert.match(html, /<b>Parks<\/b><span>No vendor, so no region is registered<\/span>/);
    for (const domain of DOMAIN_REGISTRY) assert.notEqual(domain.lensId, "parks");
  });
});

/* ===========================================================================
 * 4. THE GATE IS WATCHED FIRING
 * ======================================================================== */

describe("G-100 the derivation can fail, one claim at a time", () => {
  /**
   * DEV_PROCESS 2.2. A gating indicator is tested for its ability to FIRE
   * before it is trusted. Each arm below re-runs the SAME predicate the
   * assertions above use against an injected copy of the markup, so a check
   * that has quietly stopped looking cannot pass by agreeing with itself.
   */
  const navOf = (text, lensId) => {
    const nav = text.match(/<nav class="shell-nav"[\s\S]*?<\/nav>/)?.[0] || "";
    const item = nav.match(new RegExp(`<a [^>]*data-lens="${lensId}"[^>]*>[\\s\\S]*?</a>`))?.[0] || "";
    return item.match(/<span class="badge">([^<]*)<\/span>/)?.[1] ?? null;
  };

  it("fires when a built lens is given a Not built badge again", () => {
    for (const id of BUILT_ROSTER) {
      const injected = html.replace(
        new RegExp(`(data-lens="${id}"[^>]*>[\\s\\S]*?<span class="badge">)[^<]*(</span>)`),
        "$1Not built$2",
      );
      assert.notEqual(injected, html, `the injection did not reach ${id}`);
      assert.equal(navOf(injected, id), "Not built", id);
      assert.equal(navOf(html, id), "Not read", `${id} arm A should already have caught this`);
    }
  });

  it("fires when a hook is attached to a lens the registry does not declare", () => {
    const injected = html.replace('<div class="srcreg"><i class="rail"></i><span class="nm"><b>Parks</b>', '<div class="srcreg" data-lens-row="parks"><i class="rail"></i><span class="nm"><b>Parks</b>');
    assert.notEqual(injected, html, "the injection did not reach the Parks row");
    const hooked = [...injected.matchAll(/data-lens-row="([^"]+)"/g)].map((m) => m[1]).sort();
    assert.notDeepEqual(hooked, [...BUILT_ROSTER].sort());
    assert.ok(hooked.includes("parks"));
  });

  it("fires when two source states are given one word", () => {
    const collapsed = { ...SHIPPED.LENS_BADGE, ungranted: SHIPPED.LENS_BADGE["no-fixture-source"] };
    const words = Object.values(collapsed);
    assert.equal(new Set(words).size, 4, "the injected collapse did not collapse anything");
    assert.equal(new Set(Object.values(SHIPPED.LENS_BADGE)).size, 5, "arm A should already have caught this");
  });
});

/* ===========================================================================
 * 5. THE CONSTRAINTS THIS LANE CARRIED
 * ======================================================================== */

describe("G-100 the constraints", () => {
  it("invents no freshness anywhere it touched", () => {
    for (const [name, text] of [["index.html", html], ["app.js", app]]) {
      assert.equal(/last (sync|synced|read|updated)/i.test(text), false, `${name} invents freshness`);
    }
  });

  it("keeps one environment badge and adds no second Demo chip", () => {
    assert.equal((html.match(/>Demo</g) || []).length, 2, "the env badge and its Compass twin, and nothing else");
    assert.match(html, /id="env-badge">Demo</);
    assert.match(html, /id="cp-env-badge">Demo</);
    /**
     * "Demo records" is a pack-state word this lane writes at runtime, never a
     * chip and never a static claim. It IS in the markup once, on the
     * ds-pipeline-mark, which G-77 shipped as a hidden element revealed only
     * when records arrive; measured here rather than asserted, so a second
     * static copy landing in a nav badge or a register pill fails.
     */
    const marked = [...html.matchAll(/id="([^"]+)"[^>]*>Demo records</g)].map((m) => m[1]);
    assert.equal(
      marked.length,
      (html.match(/>Demo records</g) || []).length,
      "a Demo records word sits somewhere other than a generated-record mark",
    );
    for (const id of marked) assert.match(id, /-mark$/, id);
    // And it is written into no badge and no register pill by the document.
    assert.equal(/<span class="badge">Demo records</.test(html), false);
    assert.equal(/<span class="pill [^"]*">Demo records</.test(html), false);
  });

  it("names no city as content, and grants nothing", () => {
    const register = html.match(/id="overview-source-register"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || "";
    assert.equal(/bastrop/i.test(register), false);
    assert.equal(/template city|empty city/i.test(register), false);
    // No feed is connected by this work: the demonstration axis is untouched.
    assert.deepEqual(TEMPLATE_CITY.grantedAdapters, []);
    assert.deepEqual(TEMPLATE_CITY.fixtureGrants, ["mygov", "samsara", "verkada", "firstdue", "powerbi", "goto"]);
    assert.deepEqual(EMPTY_CITY.fixtureGrants, []);
  });
});

/* ===========================================================================
 * 6. THE CONNECTIONS REGISTER'S DISPOSITION COLUMN, DERIVED
 * ======================================================================== */

/**
 * THE COLUMN THIS FILE'S OWN PREAMBLE NAMES AND DID NOT COVER.
 *
 * G-100 derived the nav badge and the Overview register from the registry and
 * left the Connections register's `disposition` hand-typed - the very column its
 * preamble cites as "the disposition column whose misreading opened this
 * programme". Two waves later four Development services rows still said "Not
 * built" while their tabs shipped and rendered 72 generated records, because
 * nothing connected the word to the thing that decides whether a surface exists.
 *
 * THE RULE, and it is the registry's own, quoted from src/fixture-seam.mjs:
 * "absent from the registry means the surface does not exist, which is the only
 * surviving meaning of Not built." So a register row that names a REGISTERED
 * domain may not say Not built, in either direction and without exception.
 *
 * TWO DERIVATIONS, NOT ONE FIELD READ TWICE. src/shell-homes.mjs is hand-written
 * prose about the product; src/domains.mjs plus the files under src/domains/ are
 * the product. Neither is generated from the other and one lane cannot satisfy
 * both by editing a single line, which is what separates this from an internal
 * consistency check that only catches typing errors.
 *
 * SCOPE, STATED, because a control whose scope is wider than its claim is its
 * own defect. The coverage leg holds for Development services only, and the
 * reason is derivable rather than chosen: that lens's register rows are
 * REGION-granular and stand one-to-one with its five domains - Pipeline,
 * Inspections, Work orders, Licences, Code enforcement. Every other lens is
 * named by LENS-granular rows ("Police", "Fleet / operations") that no domain
 * maps to without a ruling, and inventing the mapping to widen the check would
 * be exactly the guess this rule exists to stop. Those rows are unlinked and
 * therefore unchecked, and that is recorded rather than hidden: seven of them
 * across Fleet, Police, Fire and EMS and Public works look stale in the same way
 * and are routed, not edited here.
 */
const COVERED_LENS = "development-services";

/**
 * The predicate, returning every fault it finds rather than the first.
 *
 * One implementation, called by the assertion and by every injection arm below,
 * so an arm cannot pass by agreeing with a second copy of the rule written in a
 * test. It returns names, not a count: a count is not a record.
 */
function registerDispositionFaults(rows, registry) {
  const faults = [];
  const citedBy = new Map();
  for (const row of rows) {
    if (row.domainId === undefined) continue;
    const domain = registry.find((d) => d.id === row.domainId) || null;
    if (!domain) {
      faults.push(`${row.job} cites ${row.domainId}, which is not a registered domain`);
      continue;
    }
    citedBy.set(domain.id, [...(citedBy.get(domain.id) || []), row.job]);
    if (row.disposition === "Not built") {
      faults.push(`${row.job} says Not built while ${domain.id} is registered, so its surface exists`);
    }
  }
  /**
   * The anti-starvation leg. Without it the check has a trigger and correct
   * logic and is never fed: a lane ships a sixth Development services domain,
   * writes no register row, and a column that has drifted reports clean because
   * nothing points at the drift.
   */
  for (const domain of registry) {
    if (domain.lensId !== COVERED_LENS) continue;
    const jobs = citedBy.get(domain.id) || [];
    if (jobs.length !== 1) {
      faults.push(`${domain.id} is cited by ${jobs.length} register rows and must be cited by exactly 1`);
    }
  }
  return faults;
}

describe("G-102 no register row calls a registered surface Not built", () => {
  it("agrees with the registry, and covers every Development services domain", () => {
    assert.deepEqual(registerDispositionFaults(ALL_HOME_ROWS, DOMAIN_REGISTRY), []);

    // Reported with its counting rule rather than asserted as a literal: the
    // covered population is every registry entry on the covered lens.
    const covered = DOMAIN_REGISTRY.filter((d) => d.lensId === COVERED_LENS).map((d) => d.id);
    assert.deepEqual(covered.sort(), [
      "business-licenses",
      "code-violations",
      "inspections",
      "permits-pipeline",
      "work-orders",
    ]);
    const cited = ALL_HOME_ROWS.filter((r) => r.domainId !== undefined);
    assert.equal(cited.length, covered.length);

    /**
     * NOT VACUOUS, and this is the leg that matters. Permitting pipeline was
     * already Empty before this lane touched anything and is checked all the
     * same, so the predicate has a subject it did not have to change. A check
     * every one of whose subjects needed correcting is a check a
     * refuse-everything rewrite would also pass.
     */
    const pipeline = ALL_HOME_ROWS.find((r) => r.domainId === "permits-pipeline");
    assert.equal(pipeline.disposition, "Empty");
  });

  it("carries the corrected column onto the served page, not only into the generator", () => {
    /**
     * The generator is served to nobody. web/index.html is what a customer
     * reads, so the claim is asserted where the claim lands; the bake's
     * fixed-point test in src/shell-homes.test.mjs keeps the two in step.
     */
    // The job is a literal, escaped: a future cited job carrying a bracket or a
    // slash would otherwise compile to a pattern that matches the wrong row, or
    // nothing, and a check that quietly matches nothing reports clean.
    const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const row of ALL_HOME_ROWS.filter((r) => r.domainId !== undefined)) {
      const rendered = html.match(
        new RegExp(
          `<div class="srcreg"[^>]*data-disposition="([^"]*)"[^>]*><i class="rail"></i><span class="nm"><b>${literal(row.job)}</b>`,
        ),
      );
      assert.ok(rendered, `${row.job} has no baked register row`);
      assert.equal(rendered[1], row.disposition, row.job);
      assert.notEqual(rendered[1], "Not built", row.job);
    }
  });
});

describe("G-102 the register derivation can fail, in both directions", () => {
  /**
   * DEV_PROCESS 2.2, and deliberately in BOTH directions. A guard that only
   * fires on the stale value would be passed by a rewrite that refuses
   * everything, and a guard that only fires on over-claiming would be passed by
   * one that permits everything. Each arm re-runs the same predicate the
   * assertions above use.
   */
  const probeDomain = (id) =>
    defineDomain({
      id,
      lensId: COVERED_LENS,
      region: "Probe",
      gatedBy: "mygov",
      recordType: "permit-case",
      vocabulary: [],
      generate: () => ({ records: [] }),
    });

  it("fires when every registered surface is called Not built again", () => {
    const stale = ALL_HOME_ROWS.map((r) =>
      r.domainId === undefined ? r : { ...r, disposition: "Not built" },
    );
    const faults = registerDispositionFaults(stale, DOMAIN_REGISTRY);
    assert.equal(faults.length, 5, faults.join(" | "));
    for (const fault of faults) assert.match(fault, /says Not built while/);
    assert.deepEqual(registerDispositionFaults(ALL_HOME_ROWS, DOMAIN_REGISTRY), []);
  });

  it("fires on ONE stale row, not only on a wholesale rewrite", () => {
    for (const row of ALL_HOME_ROWS.filter((r) => r.domainId !== undefined)) {
      const injected = ALL_HOME_ROWS.map((r) =>
        r === row ? { ...r, disposition: "Not built" } : r,
      );
      const faults = registerDispositionFaults(injected, DOMAIN_REGISTRY);
      assert.equal(faults.length, 1, `${row.job}: ${faults.join(" | ")}`);
      assert.equal(faults[0].startsWith(`${row.job} says Not built`), true, faults[0]);
    }
  });

  it("fires when a row cites a domain the registry does not carry", () => {
    const injected = [
      ...ALL_HOME_ROWS,
      { table: "primary", job: "Probe job", home: "Probe", disposition: "Empty", domainId: "no-such-domain" },
    ];
    assert.deepEqual(registerDispositionFaults(injected, DOMAIN_REGISTRY), [
      "Probe job cites no-such-domain, which is not a registered domain",
    ]);
  });

  it("fires when a new covered domain ships with no register row", () => {
    // The starvation arm. This is the drift the column has already suffered
    // twice, arriving from the registry side instead of the register side.
    const faults = registerDispositionFaults(ALL_HOME_ROWS, [
      ...DOMAIN_REGISTRY,
      probeDomain("probe-uncited"),
    ]);
    assert.deepEqual(faults, [
      "probe-uncited is cited by 0 register rows and must be cited by exactly 1",
    ]);
  });

  it("fires when two rows claim one domain", () => {
    const injected = [
      ...ALL_HOME_ROWS,
      { table: "primary", job: "Probe duplicate", home: "Probe", disposition: "Empty", domainId: "inspections" },
    ];
    assert.deepEqual(registerDispositionFaults(injected, DOMAIN_REGISTRY), [
      "inspections is cited by 2 register rows and must be cited by exactly 1",
    ]);
  });

  it("does not fire on an unlinked row that genuinely is not built", () => {
    /**
     * The over-broad arm. A rule that refused every "Not built" anywhere would
     * pass all five arms above and would be wrong: rows naming jobs no domain
     * models - Emergency EOC, Prophecy document search, Sign out - are correctly
     * Not built and must stay untouched by this check. The count is measured
     * rather than pinned, because the population grows.
     */
    const unlinked = ALL_HOME_ROWS.filter(
      (r) => r.domainId === undefined && r.disposition === "Not built",
    );
    assert.ok(unlinked.length > 20, `only ${unlinked.length} unlinked Not built rows`);
    // Read against a registry with NO covered domains, so the coverage leg has
    // nothing to say and the disposition leg is the only thing being measured.
    const uncovered = DOMAIN_REGISTRY.filter((d) => d.lensId !== COVERED_LENS);
    assert.deepEqual(registerDispositionFaults(unlinked, uncovered), []);
  });
});
