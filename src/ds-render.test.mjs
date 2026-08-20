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
    for (const domain of DS_DOMAINS) {
      const prefix = PREFIX[domain.id];
      assert.ok(prefix, `${domain.id} has no region prefix`);
      for (const suffix of ["empty", "empty-kicker", "empty-head", "empty-basis", "records", "rows", "mark", "prov", "caption", "basis"]) {
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
  /** The map, read out of the shipped script rather than re-declared here. */
  const map = app.match(/const SOURCE_STATE = \{[\s\S]*?\n\};/)?.[0] || "";

  it("carries one entry for every state the seam can report, plus the two the seam cannot", () => {
    assert.ok(map, "web/app.js carries no SOURCE_STATE map");
    for (const status of DOMAIN_STATUSES) {
      assert.ok(map.includes(`"${status}"`) || map.includes(`${status}:`), status);
    }
    /**
     * not-registered is the surface that does not exist, which is the only
     * surviving meaning of Not built; read-failed is a fetch that did not answer
     * and is NOT a source state - it must not borrow a pack's sentence.
     */
    assert.ok(map.includes('"not-registered"'), "not-registered");
    assert.ok(map.includes('"read-failed"'), "read-failed");
  });

  it("gives every state a different kicker and a different headline", () => {
    const kickers = [...map.matchAll(/kicker: "([^"]+)"/g)].map((m) => m[1]);
    const headlines = [...map.matchAll(/headline: "([^"]+)"/g)].map((m) => m[1]);
    const notes = [...map.matchAll(/metricNote: "([^"]+)"/g)].map((m) => m[1]);
    assert.equal(kickers.length, 6, "six states");
    assert.equal(headlines.length, 6);
    assert.equal(notes.length, 6);
    assert.equal(new Set(kickers).size, kickers.length, `two states share a kicker: ${kickers}`);
    assert.equal(new Set(headlines).size, headlines.length, "two states share a headline");
    /**
     * The pair the ruling is about, named rather than left to the set check: a
     * later edit that collapsed exactly these two would still pass a generic
     * distinctness assertion if it collapsed two others apart.
     */
    const ungranted = map.match(/ungranted: \{[\s\S]*?\}/)?.[0] || "";
    const grantedEmpty = map.match(/"granted-empty": \{[\s\S]*?\}/)?.[0] || "";
    assert.ok(ungranted && grantedEmpty);
    assert.notEqual(ungranted.replace("ungranted", ""), grantedEmpty.replace('"granted-empty"', ""));
    assert.match(ungranted, /built/i, "ungranted must say the region is built");
    assert.match(grantedEmpty, /granted/i, "granted-empty must say the source is granted");
    assert.equal(/not built/i.test(ungranted), false, "ungranted must not say not built");
  });

  it("has ONE implementation, read by every region including the pipeline", () => {
    /**
     * Two implementations of one rule is the CTRL-1 shape (DEV_PROCESS 2.4). The
     * sentences live in one frozen map and every region resolves through one
     * accessor, so a region cannot quietly grow its own vocabulary.
     */
    assert.equal((app.match(/const SOURCE_STATE = \{/g) || []).length, 1);
    assert.match(app, /function sourceSentence\(status\)/);
    assert.match(app, /function writeSourceSentence\(prefix, payload\)/);
    // The pipeline reads it too, off the sourceStatus composePipeline already carried.
    assert.match(app, /const sentence = sourceSentence\(pipeline\.sourceStatus\)/);
    /**
     * Every region resolves through the accessor rather than indexing the map.
     * The two indexings are the lookup and its fallback and BOTH are inside
     * sourceSentence, which is what this measures - a count alone would have
     * been wrong in both directions, and was: the first draft pinned 1 and went
     * red on the fallback that makes an unknown status a stated failure rather
     * than a quiet pass.
     */
    const accessor = app.match(/function sourceSentence\(status\) \{[\s\S]*?\n\}/)?.[0] || "";
    assert.ok(accessor);
    assert.equal(
      (app.match(/SOURCE_STATE\[/g) || []).length,
      (accessor.match(/SOURCE_STATE\[/g) || []).length,
      "SOURCE_STATE is indexed outside its accessor",
    );
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
    assert.match(app, /status: "read-failed"/);
    assert.match(app, /the \$\{domainId\} region did not read for \$\{key\}/);
    // And the absence carries a basis in BOTH branches of the queue renderer,
    // so a hidden table never keeps a claim the pack has not earned.
    const queue = app.match(/function renderDomainQueue\([\s\S]*?\n\}/)?.[0] || "";
    assert.equal(
      (queue.match(/basis\.textContent = `Basis:/g) || []).length,
      2,
      "the queue writes its basis in exactly one of its two branches",
    );
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
    // And the renderer writes the payload's label, so runtime cannot diverge.
    assert.match(app, /if \(key\) key\.textContent = metric\.label;/);
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
