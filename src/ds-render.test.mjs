/**
 * ---------------------------------------------------------------------------
 * G-97 R1: the Development services lens RENDERS its five domains.
 *
 * WHY THIS FILE EXISTS. Eleven domains were registered and generating
 * deterministic fixture data and ten of them reached no pixel (OPS-17 A-081).
 * The seam could express the four source states; the surface could not show
 * them. This file gates the composition that closes that for Development
 * services, and it gates it in the two directions that actually break.
 *
 * DIRECTION 1, the one the dispatch names: "do not invent a shape the
 * generators do not return". Every field the renderer reads is asserted to
 * exist on the payload the SEAM composes, per domain, on the shipped demo pack.
 * A renderer reading extras.slaSummary when the generator returns extras.sla
 * would render an empty region and pass every other gate in this repo.
 *
 * DIRECTION 2: the four source states are four SENTENCES. Collapsing any pair
 * re-creates the defect ruling 1 exists to close, and the pair that matters is
 * ungranted against granted-empty. The distinctness is asserted rather than
 * described, and the seam's own four bases are asserted distinct beside it, so
 * the two halves of the claim are measured in one place.
 * ---------------------------------------------------------------------------
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CASE_STATUS_VALUES,
  CODE_CASE_STATUS_VALUES,
  INSPECTION_STATUS_VALUES,
  LICENSE_STATUS_VALUES,
  WORK_ORDER_STATUS_VALUES,
} from "./adapters.mjs";
import { TEMPLATE_CITY, EMPTY_CITY } from "./city-pack.mjs";
import { DOMAIN_REGISTRY, composeDomainById } from "./domains.mjs";
import { DOMAIN_STATUSES, composeDomain, defineDomain } from "./fixture-seam.mjs";
import { INSPECTIONS_DOMAIN } from "./domains/inspections.mjs";
import { DS_TABS, DEVELOPMENT_SERVICES_LENS } from "./staff-review.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
const html = read("web/index.html");
const app = read("web/app.js");
const shell = read("web/shell.css");

/** The Development services section, which is the only markup this lane owns. */
const ds = html.match(/id="lens-development-services"[\s\S]*?id="lens-finance"/)?.[0] || "";

/**
 * The five domains this lens carries, derived from the registry rather than
 * listed here. A sixth Development services domain registered by a later lane
 * lands in this population automatically and fails the coverage assertions
 * until it has a tab and a region, which is the point.
 */
const DS_DOMAINS = DOMAIN_REGISTRY.filter((d) => d.lensId === DEVELOPMENT_SERVICES_LENS);

/** domain id to the markup prefix its region uses. */
const PREFIX = {
  "permits-pipeline": "ds-pipeline",
  inspections: "ds-insp",
  "work-orders": "ds-wo",
  "code-violations": "ds-ce",
  "business-licenses": "ds-lic",
};

/** The metric strip id per domain, and the declared status vocabulary it renders. */
const STRIPS = {
  "permits-pipeline": { strip: "ds-metrics", values: CASE_STATUS_VALUES },
  inspections: { strip: "ds-insp-metrics", values: INSPECTION_STATUS_VALUES },
  "work-orders": { strip: "ds-wo-metrics", values: WORK_ORDER_STATUS_VALUES },
  "code-violations": { strip: "ds-ce-metrics", values: CODE_CASE_STATUS_VALUES },
  "business-licenses": { strip: "ds-lic-metrics", values: LICENSE_STATUS_VALUES },
};

/**
 * The payload fields each region's renderer reads. Written as PATHS into the
 * composed payload so the assertion below is a real read rather than a
 * restatement of the generator's source.
 */
const READS = {
  "permits-pipeline": ["metrics"],
  inspections: ["metrics", "results", "inspectorLoad"],
  "work-orders": ["metrics", "sla", "dailyQueue"],
  "code-violations": ["metrics", "escalation", "stats"],
  "business-licenses": ["metrics", "expiry", "chargesBasis"],
};

/** The record fields each row builder puts in a cell. */
const RECORD_READS = {
  "permits-pipeline": ["recordId", "subject", "stage", "place", "dueLabel", "status"],
  inspections: ["recordId", "inspectionType", "result", "place", "status"],
  "work-orders": [
    "recordId",
    "subject",
    "stage",
    "place",
    "dueLabel",
    "slaElapsedHours",
    "slaTargetHours",
    "status",
  ],
  "code-violations": [
    "recordId",
    "violationType",
    "escalation",
    "escalationStep",
    "place",
    "dueLabel",
    "status",
  ],
  "business-licenses": ["recordId", "licenseCategory", "holderRef", "place", "expiryLabel", "status"],
};

const composed = Object.fromEntries(
  DS_DOMAINS.map((d) => [d.id, composeDomainById(TEMPLATE_CITY, d.id)]),
);

/**
 * The head sentence the shipped regionHead() produces for one state, evaluated
 * out of the served source rather than re-implemented here. Re-implementing it
 * would be the second copy this whole file argues against.
 */
function renderedHeadFor(source, status) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${source}; return regionHead;`)();
  return fn(status, "Inspections", "probe-city");
}

describe("G-97 the Development services lens renders its domains", () => {
  it("carries a region for every Development services domain, and none for a domain that is not one", () => {
    /**
     * Counting rule, stated where it is read: a Development services DOMAIN is
     * an entry in DOMAIN_REGISTRY whose lensId is development-services, and a
     * REGION is the queue markup carrying that domain's prefix. Both sides are
     * derived; neither is a list in this file that could drift from the other.
     */
    assert.equal(DS_DOMAINS.length, 5, "the lens carries five domains");
    assert.deepEqual(
      DS_DOMAINS.map((d) => d.id).sort(),
      ["business-licenses", "code-violations", "inspections", "permits-pipeline", "work-orders"],
      "a Development services domain was added or removed without a region",
    );
    /**
     * TWO ID CONVENTIONS, and the split is deliberate rather than untidy.
     *
     * The four regions this lane added adopt the convention main already
     * carries, so ONE renderer serves every lens on the product: renderRegion()
     * reads -state, -kicker, -head, -basis, -records, -recordsbasis, -mark,
     * -prov and -caption. The pipeline keeps its historical -empty family
     * because src/ui.test.mjs pins those ids by name, and renaming them to buy
     * symmetry would have edited a gate for a cosmetic gain. The id convention
     * is not the rule; the sentence vocabulary is, and there is one of those.
     */
    const SHARED = ["mark", "prov", "caption", "state", "kicker", "head", "basis", "records", "recordsbasis", "rows"];
    const PIPELINE = ["mark", "prov", "caption", "empty", "empty-kicker", "empty-head", "empty-basis", "records", "basis", "rows"];
    for (const domain of DS_DOMAINS) {
      const prefix = PREFIX[domain.id];
      assert.ok(prefix, `${domain.id} has no region prefix`);
      for (const suffix of prefix === "ds-pipeline" ? PIPELINE : SHARED) {
        assert.ok(
          ds.includes(`id="${prefix}-${suffix}"`),
          `${domain.id} is missing #${prefix}-${suffix}`,
        );
      }
      assert.ok(ds.includes(`id="tab-${domain.tab}"`), `${domain.id} has no tab panel`);
    }
  });

  it("reads only fields the generators actually return, per domain, on the shipped pack", () => {
    /**
     * THE DISPATCH'S CONSTRAINT AS A GATE: do not invent a shape the generators
     * do not return. A renderer that reads extras.slaSummary where the generator
     * returns extras.sla renders an empty region and passes every other check in
     * this repo, because nothing else compares the two.
     */
    for (const domain of DS_DOMAINS) {
      const payload = composed[domain.id];
      assert.equal(payload.status, "ok", `${domain.id} does not compose ok on the demo pack`);
      assert.ok(payload.recordCount > 0, `${domain.id} composes no records`);
      for (const key of READS[domain.id]) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(payload.extras, key),
          `${domain.id} renderer reads extras.${key}, which the generator does not return`,
        );
      }
      for (const field of RECORD_READS[domain.id]) {
        for (const record of payload.records) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(record, field),
            `${domain.id} row builder reads record.${field}, absent on ${record.recordId}`,
          );
        }
      }
    }
  });

  it("is proven able to fire: a read of a field no generator returns is caught", () => {
    // Arm B. Without this the assertion above could be vacuous on a payload that
    // happens to carry every key anybody ever asked for.
    const payload = composed.inspections;
    assert.equal(
      Object.prototype.hasOwnProperty.call(payload.extras, "slaSummary"),
      false,
      "the probe key must not be a real extra, or this arm proves nothing",
    );
    assert.throws(() => {
      assert.ok(
        Object.prototype.hasOwnProperty.call(payload.extras, "slaSummary"),
        "inspections renderer reads extras.slaSummary, which the generator does not return",
      );
    }, /extras\.slaSummary/);
  });

  it("states the record count each region renders from, measured off the payload", () => {
    /**
     * Counting rule: one row per record composeDomainById returns for the domain
     * on template-city. The figures are asserted rather than quoted so the close
     * cannot carry a number the code has moved past.
     */
    const counts = Object.fromEntries(DS_DOMAINS.map((d) => [d.id, composed[d.id].recordCount]));
    assert.deepEqual(counts, {
      "permits-pipeline": 14,
      "work-orders": 15,
      inspections: 21,
      "code-violations": 19,
      "business-licenses": 17,
    });
    /**
     * 86, and the figure is asserted rather than quoted because the first draft
     * of this line said 82 - my own arithmetic, wrong by four, caught by the
     * test written to stop exactly that (DEV_PROCESS 1.1). The close carries 86
     * and records the correction rather than quietly shipping the right number.
     */
    assert.equal(
      Object.values(counts).reduce((a, b) => a + b, 0),
      86,
      "the lens renders 86 generated records on the demo pack",
    );
  });

  it("keeps every region reachable and quiet on the pack that generates nothing", () => {
    /**
     * The regression target, derived from the registry rather than from a list:
     * on empty-city every built region says it has no source, with a basis, and
     * renders no record. Nothing here is a zero presented as a fact.
     */
    const rows = DS_DOMAINS.map((d) => composeDomainById(EMPTY_CITY, d.id));
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.equal(row.status, "no-fixture-source", row.domainId);
      assert.equal(row.recordCount, 0, row.domainId);
      assert.equal(row.generated, false, row.domainId);
      assert.ok(row.basis && row.basis.trim().length > 0, `${row.domainId} states no basis`);
    }
  });
});

describe("G-97 the four source states are four sentences", () => {
  /**
   * The map, read out of the shipped script rather than re-declared here.
   *
   * THIS LANE DELETED ITS OWN COPY. G-97 R3 merged first with an equivalent
   * four-state vocabulary, so a rename around the collision would have shipped
   * two implementations of one rule saying different sentences for the same
   * state on two lenses of one product - the CTRL-1 shape (DEV_PROCESS 2.4).
   * The incumbent on main is the one implementation and this lane adapted onto
   * it, including the pipeline, which had never read its own source status.
   */
  const map = app.match(/const REGION_KICKER = \{[\s\S]*?\n\};/)?.[0] || "";
  const head = app.match(/function regionHead\(status, region, cityKey\) \{[\s\S]*?\n\}/)?.[0] || "";

  it("carries one entry for every state the seam can report, plus the one the seam cannot", () => {
    assert.ok(map, "web/app.js carries no REGION_KICKER map");
    for (const status of DOMAIN_STATUSES) {
      assert.ok(map.includes(`"${status}"`) || map.includes(`${status}:`), status);
    }
    /**
     * did-not-read is a fetch that did not answer. It is NOT a source state and
     * must not borrow a pack's sentence, which is why it has its own entry.
     */
    assert.ok(map.includes('"did-not-read"'), "did-not-read");
  });

  it("gives every state a different kicker and a different headline", () => {
    const kickers = [...map.matchAll(/: "([^"]+)"/g)].map((m) => m[1]);
    assert.equal(kickers.length, 5, "four source states plus the failed read");
    assert.equal(new Set(kickers).size, kickers.length, `two states share a kicker: ${kickers}`);
    /**
     * The headlines are a function rather than a table, so distinctness is
     * measured by CALLING it over every state with one region and one pack.
     * A table comparison would have read the source and proven nothing about
     * what a person sees.
     */
    const sentences = DOMAIN_STATUSES.concat(["did-not-read"]).map((status) =>
      renderedHeadFor(head, status),
    );
    assert.equal(new Set(sentences).size, sentences.length, `two states share a headline: ${sentences}`);
    /**
     * The pair the ruling is about, named rather than left to the set check: a
     * later edit that collapsed exactly these two would still pass a generic
     * distinctness assertion if it collapsed two others apart.
     */
    const ungranted = renderedHeadFor(head, "ungranted");
    const grantedEmpty = renderedHeadFor(head, "granted-empty");
    assert.notEqual(ungranted, grantedEmpty);
    assert.match(ungranted, /no source is granted/i);
    assert.match(grantedEmpty, /granted .* and returned no records/i);
    assert.equal(/not built/i.test(ungranted), false, "ungranted must not say not built");
  });

  it("has ONE implementation, read by every region including the pipeline", () => {
    assert.equal((app.match(/const REGION_KICKER = \{/g) || []).length, 1);
    assert.equal((app.match(/function regionHead\(/g) || []).length, 1);
    /**
     * The copy this lane wrote and then deleted. Asserted ABSENT rather than
     * described, so a future lane re-adding a private four-state map has to get
     * past this line.
     */
    assert.equal(app.includes("SOURCE_STATE"), false, "a second four-state map returned to web/app.js");
    assert.equal(app.includes("writeSourceSentence"), false);
    // The pipeline reads it too, off the sourceStatus the compose already carried.
    assert.match(app, /const status = String\(pipeline\.sourceStatus \|\| "did-not-read"\)/);
    assert.match(app, /regionHead\(status, "Pipeline", pipeline\.cityKey\)/);
    // And the four new regions render through the shared renderer, not a copy.
    for (const prefix of ["ds-insp", "ds-wo", "ds-ce", "ds-lic"]) {
      assert.match(app, new RegExp(`renderRegion\\("${prefix}", payload\\)`), prefix);
      assert.match(app, new RegExp(`renderRegionMetrics\\(document\\.getElementById\\("${prefix}-metrics"\\), payload\\)`), prefix);
    }
  });

  it("shows ungranted and granted-empty as two different sentences from the seam, not two labels", () => {
    /**
     * The seam half of the claim, measured here so both halves live in one
     * place. Neither state is reachable through a shipped pack on this lens -
     * every Development services domain gates on mygov and template-city grants
     * it - so they are composed against probe packs that are registered nowhere.
     * That is a FINDING and it is stated in the close rather than hidden here.
     */
    const noGrant = {
      cityKey: "probe-city",
      displayName: "Probe city",
      accessPolicy: "public-free",
      environment: "demo",
      generatesFixtures: true,
      fixtureGrants: [],
    };
    const granted = { ...noGrant, fixtureGrants: ["mygov"] };
    const emptyGenerator = defineDomain({
      id: INSPECTIONS_DOMAIN.id,
      lensId: INSPECTIONS_DOMAIN.lensId,
      region: INSPECTIONS_DOMAIN.region,
      tab: INSPECTIONS_DOMAIN.tab,
      gatedBy: INSPECTIONS_DOMAIN.gatedBy,
      recordType: INSPECTIONS_DOMAIN.recordType,
      vocabulary: INSPECTIONS_DOMAIN.vocabulary,
      formats: INSPECTIONS_DOMAIN.formats,
      generate: () => ({ records: [], extras: {} }),
    });
    const ungranted = composeDomain(noGrant, INSPECTIONS_DOMAIN);
    const grantedEmpty = composeDomain(granted, emptyGenerator);
    assert.equal(ungranted.status, "ungranted");
    assert.equal(grantedEmpty.status, "granted-empty");
    assert.notEqual(ungranted.basis, grantedEmpty.basis);
    assert.equal(ungranted.granted, false);
    assert.equal(grantedEmpty.granted, true);
    // Four bases, four strings.
    const bases = new Set([
      ungranted.basis,
      grantedEmpty.basis,
      composeDomainById(TEMPLATE_CITY, "inspections").basis,
      composeDomainById(EMPTY_CITY, "inspections").basis,
    ]);
    assert.equal(bases.size, 4, "the four states must not share a basis");
  });

  it("renders a failed read as a stated failure rather than as a pack with no records", () => {
    /**
     * Every one of the four regions wraps a null read in the shared
     * unreadRegion() determination, naming its own region, so a fetch that did
     * not answer never renders as a city that has no records.
     */
    for (const region of ["Inspections", "Work orders", "Code enforcement", "Licenses"]) {
      assert.match(app, new RegExp(`unreadRegion\\("${region}", cityKey\\)`), region);
    }
    assert.match(app, /the \$\{region\} region did not read for \$\{pack\}/);
    /**
     * And the absence carries a basis in EVERY state, not only when the region
     * is empty: renderRegion writes the basis line unconditionally, so a hidden
     * table never keeps a claim the pack has not earned.
     */
    const renderer = app.match(/function renderRegion\(prefix, payload\) \{[\s\S]*?\n\}/)?.[0] || "";
    assert.ok(renderer);
    assert.match(renderer, /if \(basis\) basis\.textContent = line;/);
    assert.equal(/if \(ok\)[^\n]*basis\.textContent/.test(renderer), false, "the basis must not be conditional on ok");
  });
});

describe("G-97 the metric strips agree with the declared vocabulary", () => {
  it("labels every tile with the label its adapter contract declares", () => {
    /**
     * A PAIRED CONTROL, not two careful edits. The static markup is the
     * pre-read fallback and web/app.js writes the payload's own label over it,
     * so the two would silently diverge; this holds the fallback to the
     * declaration. Counting rule: the .k text of every .metric inside the
     * strip, in document order, against the declared values in the same order.
     */
    for (const [domainId, { strip, values }] of Object.entries(STRIPS)) {
      const block = ds.match(new RegExp(`id="${strip}"[\\s\\S]*?\\n\\s*</div>`))?.[0] || "";
      assert.ok(block, `${domainId} strip ${strip} not found`);
      const tiles = [...block.matchAll(/data-metric="([^"]+)"><span class="k">([^<]*)</g)];
      assert.deepEqual(
        tiles.map((m) => m[1]),
        values.map((v) => v.id),
        `${domainId} tiles are not the declared statuses, in order`,
      );
      assert.deepEqual(
        tiles.map((m) => m[2]),
        values.map((v) => v.label),
        `${domainId} tile labels drifted from the declared labels`,
      );
    }
    /**
     * The shared metric renderer writes the VALUE and the NOTE and never the
     * label, so the static markup is the only source of a tile's name and this
     * assertion is the whole control rather than half of one. Stated here
     * because the earlier draft of this lane wrote the label at runtime and the
     * check would have been comparing a fallback nobody reads.
     */
    const metrics = app.match(/function renderRegionMetrics\(strip, payload\) \{[\s\S]*?\n\}/)?.[0] || "";
    assert.ok(metrics);
    assert.equal(/\.k"\)|metric\.label/.test(metrics), false, "the tile label is written at runtime after all");
  });

  it("states an unread tile as a word rather than as a zero, on every strip", () => {
    for (const { strip } of Object.values(STRIPS)) {
      const block = ds.match(new RegExp(`id="${strip}"[\\s\\S]*?\\n\\s*</div>`))?.[0] || "";
      assert.equal(/class="v[^"]*">\s*0\s*</.test(block), false, strip);
      assert.equal((block.match(/Not read/g) || []).length, 4, strip);
    }
  });
});

describe("G-97 the tab roster, and the Review tab that left", () => {
  it("is the roster the ruling names, in order", () => {
    assert.deepEqual(DS_TABS, [
      "pipeline",
      "place",
      "inspections",
      "work-orders",
      "code-enforcement",
      "licenses",
    ]);
    // Every domain's declared tab is on the roster, derived rather than listed.
    for (const domain of DS_DOMAINS) {
      assert.ok(DS_TABS.includes(domain.tab), `${domain.id} declares tab ${domain.tab}, not on the roster`);
    }
    // Place is the one tab with no domain: it is the SmartSite parcel mount.
    const withDomain = new Set(DS_DOMAINS.map((d) => d.tab));
    assert.deepEqual(
      DS_TABS.filter((t) => !withDomain.has(t)),
      ["place"],
      "a tab without a domain that is not Place",
    );
  });

  it("removes the Review tab from the lens without cutting the mount", () => {
    /**
     * A-076 / A-081, operator ruling 2026-08-19: Development services mirrors
     * what the MyGov system a city already runs shows; Plan review is the native
     * console that aspirationally replaces it, so it is its own Work lens rather
     * than a second door inside the lens it intends to supersede.
     *
     * The MOUNT is not cut, and that is asserted rather than assumed: the stage
     * survives and one anchor still carries data-stage="review", so
     * MountStage.findAnchor() still resolves one.
     */
    assert.equal(DS_TABS.includes("review"), false);
    assert.equal(ds.includes('id="tab-review"'), false);
    assert.equal(ds.includes('id="anchor-ds-review"'), false);
    assert.equal(ds.includes('data-stage="review"'), false);
    assert.match(html, /id="review-stage"/);
    assert.match(html, /id="anchor-work-review"[^>]*data-stage="review"/);
    assert.match(html, /href="\/\?work=review"/);
    assert.equal((html.match(/data-stage="review"/g) || []).length, 1);
    // The enumeration, the panels and the router agree; first-paint owns the
    // three-way check, so this only pins that review left all three.
    assert.equal(shell.includes('html[data-tab="review"]'), false);
    assert.match(shell, /html\[data-tab="work-orders"\] #tab-work-orders/);
  });
});

describe("G-97 the lane's standing constraints, measured on the section it owns", () => {
  it("prints no money, invents no freshness, and names no city as content", () => {
    assert.equal(ds.includes("$"), false, "a dollar sign reached the Development services section");
    assert.equal(/last sync|last read|last updated/i.test(ds), false);
    for (const pack of [TEMPLATE_CITY, EMPTY_CITY]) {
      assert.equal(ds.includes(pack.cityKey), false, pack.cityKey);
      assert.equal(ds.includes(pack.displayName), false, pack.displayName);
    }
    assert.equal(/\bbastrop\b/i.test(ds), false);
    // The environment badge is ONE chip in the top bar, never per region.
    assert.equal((ds.match(/class="env/g) || []).length, 0);
  });

  it("keeps a basis line under every region, and exactly one h1 on the surface", () => {
    /**
     * Counting rule for basis lines: elements carrying class="basis" inside the
     * section. Every region this lane added has one; the pre-existing regions
     * keep theirs. The floor is derived from the region count rather than
     * pinned, so a region added without a basis fails.
     */
    const bases = (ds.match(/class="basis"/g) || []).length;
    assert.ok(bases >= DS_DOMAINS.length * 2, `only ${bases} basis lines for ${DS_DOMAINS.length} regions`);
    assert.equal((ds.match(/<h1>/g) || []).length, 1, "the surface must carry exactly one h1");
    /**
     * Headings are sequential. Every honest-empty headline is an h2 directly
     * under that h1; an h5 there skips three levels, which is what
     * heading-order fires on and what this lane refused to add to.
     */
    assert.equal((ds.match(/<h5/g) || []).length, 0, "an h5 under the page h1 skips three levels");
    assert.ok((ds.match(/<h2/g) || []).length >= 5);
    // .state h2 is a real rule, so the h2 is not a heading that renders as body.
    assert.match(shell, /\.state h2/);
  });

  it("makes every scrollable column keyboard reachable, and adds no class to do it", () => {
    /**
     * .colstack declares overflow-y:auto, so every column this lane added is a
     * new scrollable region and would have added to the four nodes
     * scrollable-region-focusable was already failing product-wide.
     */
    const columns = (ds.match(/class="colstack[^"]*"/g) || []).length;
    const focusable = (ds.match(/class="colstack[^"]*" tabindex="0"/g) || []).length;
    assert.equal(focusable, columns, `${columns - focusable} scrollable columns are not keyboard reachable`);
    assert.match(shell, /\.colstack \{[^}]*overflow-y: auto/);
  });

  it("grants nothing, connects nothing, and leaves the assets row at zero", () => {
    assert.deepEqual(TEMPLATE_CITY.grantedAdapters ?? [], []);
    // G-24: the one asset row on this lens stays an honest Empty, on every pack.
    assert.match(
      ds,
      /<b>Assets<\/b><span>City-owned records at this place<\/span><\/span><span class="pill p-quiet">Empty</,
    );
    // The browser renders records; it never generates them.
    assert.equal(/generatePipelineRecords|generateInspectionRecords|composeDomain\(/.test(app), false);
    // And the four new regions read the route that already existed, not a new one.
    assert.match(app, /\/api\/domains\/\$\{encodeURIComponent\(domainId\)\}\?cityKey=/);
  });
});
