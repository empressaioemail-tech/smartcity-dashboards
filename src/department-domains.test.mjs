import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ADAPTER_KINDS, RECORD_SHAPES, adapterKindById } from "./adapters.mjs";
import { EMPTY_CITY, FIXTURE_CITY, TEMPLATE_CITY, assertCityPackShape } from "./city-pack.mjs";
import { composeDomain, defineDomain } from "./fixture-seam.mjs";
import { DOMAIN_REGISTRY, composeAllDomains, composeDomainById } from "./domains.mjs";
import { POLICE_CAMERAS_DOMAIN, OCCUPANCY_BANDS } from "./domains/police-cameras.mjs";
import { FIRE_APPARATUS_DOMAIN } from "./domains/fire-apparatus.mjs";
import { CIP_PROJECTS_DOMAIN } from "./domains/cip-projects.mjs";
import { CALL_ANALYTICS_DOMAIN, CALL_WINDOW_DAYS } from "./domains/call-analytics.mjs";

/* --------------------------------------------- G-92 wave 2 department lenses

This lane's assertions live in their own file rather than in src/domains.test.mjs,
and the reason is merge mechanics rather than taste: three lanes edit this repo
on one card and src/domains.test.mjs is one of the files all of them touch. A
file only this lane writes cannot produce a conflict that hides a real
regression under a resolution.

npm test is `node --test src/*.test.mjs`, so this file is picked up by being
here. Nothing had to be registered.
*/

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The four this lane added, with what each is for. */
const WAVE_2 = [
  { domain: POLICE_CAMERAS_DOMAIN, id: "police-cameras", kind: "verkada", count: 18 },
  { domain: FIRE_APPARATUS_DOMAIN, id: "fire-apparatus", kind: "firstdue", count: 12 },
  { domain: CIP_PROJECTS_DOMAIN, id: "cip-projects", kind: "powerbi", count: 16 },
  { domain: CALL_ANALYTICS_DOMAIN, id: "call-analytics", kind: "goto", count: 25 },
];

/** A pack that generates and grants whatever the caller names. Never shipped. */
function probePack(fixtureGrants) {
  return {
    cityKey: "probe-city",
    jurisdictionFips: null,
    displayName: "Probe city",
    accessPolicy: "public-free",
    environment: "demo",
    generatesFixtures: true,
    lenses: [],
    grantedAdapters: [],
    fixtureGrants,
  };
}

const composed = composeAllDomains(TEMPLATE_CITY);

describe("G-92 the four department domains", () => {
  it("registers each one under a catalogued kind and carries the counted records it declares", () => {
    /**
     * Counting rule, stated at the number: recordCount is one row per generated
     * record of that domain's declared recordType on template-city, which is the
     * length of the array composeDomain returned and not a figure anything
     * declared in advance.
     */
    for (const { id, kind, count } of WAVE_2) {
      const out = composed[id];
      assert.ok(out, `${id} is not in the registry`);
      assert.equal(out.status, "ok", id);
      assert.equal(out.kind, kind, id);
      assert.ok(adapterKindById(kind), `${kind} is not catalogued`);
      assert.equal(out.recordCount, count, id);
      assert.equal(out.records.length, count, `${id} recordCount disagrees with the array it counted`);
      assert.match(out.countingRule, new RegExp(`${count} generated ${kind} .* records on template-city`));
      assert.equal(out.granted, true, id);
      assert.equal(out.generated, true, id);
      for (const record of out.records) {
        assert.equal(record.origin, "fixture", id);
        assert.equal(record.fixture, true, id);
        assert.match(record.fixtureBasis, /no city rows were read/, id);
        assert.equal(record.provenance.readAt, null, id);
      }
    }
  });

  it("adds no adapter kind, because a kind with no live vendor behind it is a fiction", () => {
    /**
     * The catalog is the same ten G-91 left. The build sheet says it is "short by
     * three" (spireon, goto, powerbi); at source those three were already added
     * at G-91, so the sheet's section is stale as of c7d7980 and this lane needed
     * to add nothing. Reporting a planner figure as wrong is the successful
     * outcome here, not a problem to route around.
     */
    assert.deepEqual(
      ADAPTER_KINDS.map((k) => k.id),
      [
        "mygov",
        "samsara",
        "opengov",
        "esri",
        "municode",
        "firstdue",
        "verkada",
        "spireon",
        "goto",
        "powerbi",
      ],
    );
    assert.equal(ADAPTER_KINDS.length, 10);
  });

  it("keeps the ungranted exemplar reachable, so growing the registry did not delete a state", () => {
    /**
     * The failure mode a wave of new lenses invites: grant everything, populate
     * everything, and the ungranted branch quietly becomes unreachable code.
     * spireon is still absent from template-city's demonstration axis and
     * patrol-vehicles is still the region that proves ruling 1.
     */
    assert.equal(TEMPLATE_CITY.fixtureGrants.includes("spireon"), false);
    const ungranted = composed["patrol-vehicles"];
    assert.equal(ungranted.status, "ungranted");
    assert.equal(/not built/i.test(ungranted.basis), false);

    // And each wave-2 domain reaches the same state on a pack that grants it nothing.
    for (const { domain, id, kind } of WAVE_2) {
      const out = composeDomain(probePack([]), domain);
      assert.equal(out.status, "ungranted", id);
      assert.equal(out.granted, false, id);
      assert.equal(out.generated, true, `${id}: the PACK generates; this REGION has no source`);
      assert.match(out.basis, new RegExp(`is not granted on probe-city`), id);
      assert.match(out.basis, /region is built and has no source/, id);
      assert.equal(/not built/i.test(out.basis), false, id);
      // ungranted and no-fixture-source are different sentences, not two labels.
      assert.notEqual(out.basis, composeDomain(EMPTY_CITY, domain).basis, id);
      assert.ok(adapterKindById(kind), kind);
    }
  });

  it("stays honest-empty on empty-city and on fixture-city, every one of them with a basis", () => {
    for (const pack of [EMPTY_CITY, FIXTURE_CITY]) {
      const all = composeAllDomains(pack);
      for (const { id } of WAVE_2) {
        const out = all[id];
        assert.equal(out.status, "no-fixture-source", `${pack.cityKey}/${id}`);
        assert.equal(out.recordCount, 0, `${pack.cityKey}/${id}`);
        assert.deepEqual(out.records, [], `${pack.cityKey}/${id}`);
        assert.equal(out.generated, false, `${pack.cityKey}/${id}`);
        assert.equal(out.granted, false, `${pack.cityKey}/${id}`);
        assert.match(out.basis, /\S/, `${pack.cityKey}/${id}`);
        assert.match(out.countingRule, /\S/, `${pack.cityKey}/${id}`);
      }
    }
  });

  it("fills no city inventory, so G-24 is where it was", () => {
    for (const { id } of WAVE_2) {
      const out = composed[id];
      assert.equal(out.lensId === "assets", false, id);
      assert.equal(out.region === "Assets", false, id);
      assert.equal(/asset/i.test(out.recordType), false, out.recordType);
    }
    // The one that looks most like an inventory says in every record that it is not.
    for (const record of composed["police-cameras"].records) {
      assert.match(record.inventoryBasis, /not a city-owned inventory node/);
    }
  });
});

describe("G-92 both guards fire on every new domain", () => {
  /**
   * A generic probe proves the SEAM runs the guards. It does not prove they run
   * over THESE four, which is a different claim: a domain whose vocabulary is too
   * wide passes the seam and fails the intent. So each real domain is cloned,
   * one value in its real output is poisoned, and the clone is composed.
   *
   * The clone keeps the real domain's vocabulary and formats. Only id and
   * generate change, and generate calls the real generator. Nothing here is
   * registered, so proving a gate can fire cannot ship a bad domain.
   */
  const POISON = [
    {
      id: "police-cameras",
      domain: POLICE_CAMERAS_DOMAIN,
      field: "occupancyBand",
      content: ["Bastrop city yard", /no held city identity/],
    },
    {
      id: "fire-apparatus",
      domain: FIRE_APPARATUS_DOMAIN,
      field: "apparatusType",
      content: ["Station at 1200 Main Street", /no street address/],
    },
    {
      id: "cip-projects",
      domain: CIP_PROJECTS_DOMAIN,
      field: "subject",
      content: ["$1,200 change order", /no money/],
    },
    {
      id: "call-analytics",
      domain: CALL_ANALYTICS_DOMAIN,
      field: "queueLabel",
      content: ["last synced from the vendor", /invents no freshness/],
    },
  ];

  function poisoned(domain, patch) {
    return defineDomain({
      ...domain,
      id: `probe-${domain.id}`,
      generate(pack, seedFor) {
        const out = domain.generate(pack, seedFor);
        Object.assign(out.records[0], patch);
        return out;
      },
    });
  }

  it("passes the clean clone, so every rejection below is the poison and not the clone", () => {
    for (const { id, domain } of POISON) {
      const pack = probePack([domain.gatedBy]);
      const out = composeDomain(pack, poisoned(domain, {}));
      assert.equal(out.status, "ok", id);
      assert.ok(out.recordCount > 0, id);
    }
  });

  it("rejects a planted content violation, one class per domain", () => {
    for (const { id, domain, field, content } of POISON) {
      const [value, message] = content;
      const pack = probePack([domain.gatedBy]);
      assert.throws(
        () => composeDomain(pack, poisoned(domain, { [field]: value })),
        message,
        `${id}: planting ${field}=${value} did not fire the content guard`,
      );
    }
  });

  it("rejects a planted undeclared string and a planted bare confidence, on every domain", () => {
    for (const { id, domain, field } of POISON) {
      const pack = probePack([domain.gatedBy]);
      assert.throws(
        () => composeDomain(pack, poisoned(domain, { [field]: "Something nobody declared" })),
        /undeclared string/,
        `${id}: an undeclared ${field} did not fire the vocabulary guard`,
      );
      assert.throws(
        () => composeDomain(pack, poisoned(domain, { confidence: 0.92 })),
        /no confidence field/,
        `${id}: a bare confidence did not fire`,
      );
    }
  });

  it("rejects a planted excluded family, so the privacy exclusion is enforced and not merely intended", () => {
    /**
     * The load-bearing arm of the exclusion. A plate string is not on any
     * declared vocabulary and matches no declared format, so the seam rejects it
     * the moment a generator tries to emit one. The shape table states the
     * refusal; this is the shape table having teeth.
     */
    const camera = probePack(["verkada"]);
    assert.throws(
      () => composeDomain(camera, poisoned(POLICE_CAMERAS_DOMAIN, { plateReads: "ABC1234" })),
      /undeclared string/,
    );
    assert.throws(
      () => composeDomain(camera, poisoned(POLICE_CAMERAS_DOMAIN, { personsOfInterest: "Watchlist match" })),
      /undeclared string/,
    );
    const calls = probePack(["goto"]);
    assert.throws(
      () => composeDomain(calls, poisoned(CALL_ANALYTICS_DOMAIN, { recording: "call clip 004" })),
      /undeclared string/,
    );
    assert.throws(
      () => composeDomain(calls, poisoned(CALL_ANALYTICS_DOMAIN, { extensionOwner: "Extension 214 owner" })),
      /undeclared string/,
    );
  });
});

describe("G-92 what these domains deliberately do not carry", () => {
  it("declares every excluded family in the record shape, with a basis, rather than leaving it missing", () => {
    /**
     * Absent because nobody built it, versus absent because it must not exist.
     * Those look identical in code, and the shape table is the only place they
     * are told apart. Each field below is required:false and carries a reason.
     */
    const EXCLUDED = [
      ["verkada", "plateReads", /surveillance record about an identifiable person/],
      ["verkada", "personsOfInterest", /same reason as plateReads/],
      ["verkada", "occupancyCount", /a band only/],
      ["goto", "recording", /conversation with an identifiable resident/],
      ["goto", "callerRef", /never to a call/],
      ["goto", "extensionOwner", /maps no extension to a person/],
      ["firstdue", "crew", /names no person/],
      ["powerbi", "budget", /claim about that city's finances/],
    ];
    for (const [kind, name, basisRe] of EXCLUDED) {
      const field = RECORD_SHAPES[kind].fields.find((f) => f.name === name);
      assert.ok(field, `${kind}.${name} is not declared at all`);
      assert.equal(field.required, false, `${kind}.${name}`);
      assert.match(field.basis, basisRe, `${kind}.${name}`);
    }
  });

  it("carries no excluded key and no excluded value on any generated record", () => {
    /**
     * Two arms, because a key check and a value check catch different mistakes.
     *
     * EXCLUSION SET for the value arm, stated here where its output is read: the
     * basis fields, which exist precisely to SAY what is excluded and would
     * therefore trip a needle written to find it. Everything else on every record
     * is scanned, provenance included.
     */
    const BASIS_KEYS = new Set([
      "identityBasis",
      "inventoryBasis",
      "fixtureBasis",
      "crewBasis",
      "budgetBasis",
    ]);
    const FORBIDDEN_RECORD_KEYS = [
      "plateReads",
      "plate",
      "licensePlate",
      "personsOfInterest",
      "personOfInterest",
      "occupancyCount",
      "recording",
      "callerRef",
      "callerNumber",
      "extensionOwner",
      "crew",
      "budget",
    ];
    const scanValues = (record) => {
      const out = [];
      for (const [k, v] of Object.entries(record)) {
        if (BASIS_KEYS.has(k)) continue;
        if (typeof v === "string") out.push(v);
        else if (v && typeof v === "object") {
          for (const [k2, v2] of Object.entries(v)) {
            if (BASIS_KEYS.has(k2)) continue;
            if (typeof v2 === "string") out.push(v2);
          }
        }
      }
      return out.join(" | ");
    };

    /**
     * WORD-BOUNDED, and this is not tidiness. The first run of this scan was
     * written as bare /plate/i and went red on every camera record, because
     * "template-city" contains the letters p-l-a-t-e. A needle that fires on the
     * pack's own name is the same defect class as a scan that reads a comment as
     * code (DEV_PROCESS 2.2): it would have been "fixed" by excluding the field,
     * and the exclusion would have been the real hole.
     */
    const NEEDLES = {
      "police-cameras": /\bplate\b|\blpr\b|person of interest|\bwatchlist\b|\bsuspect\b|\bface\b/i,
      "call-analytics": /\brecording\b|\btranscript\b|\bvoicemail\b|\bextension\b|\bcaller\b/i,
      "fire-apparatus": /\bcrew\b|\bfirefighter\b|shift roster/i,
      "cip-projects": /\$|\bbudget\b|\bdollars\b|\bencumbrance\b/i,
    };

    for (const { id } of WAVE_2) {
      const out = composed[id];
      assert.ok(out.recordCount > 0, id);
      for (const record of out.records) {
        for (const key of FORBIDDEN_RECORD_KEYS) {
          assert.equal(key in record, false, `${id}/${record.recordId} carries ${key}`);
        }
        assert.equal(
          NEEDLES[id].test(scanValues(record)),
          false,
          `${id}/${record.recordId}: ${scanValues(record)}`,
        );
      }
      // Proven able to fire: the same scan on the same record, with one value planted.
      const planted = { ...out.records[0], deviceLabel: "plate recording crew budget" };
      assert.equal(NEEDLES[id].test(scanValues(planted)), true, `${id} needle cannot fire`);
    }
  });

  it("prints no money anywhere on the capital projects register, which is the one that would", () => {
    /**
     * A CIP register is a budget document and this one has no figure in it. The
     * absence is written positively on every record and in the extras, so a
     * reader is told there is no number rather than left to wonder whether the
     * lens failed to load one.
     */
    const cip = composed["cip-projects"];
    const text = JSON.stringify(cip);
    assert.equal(text.includes("$"), false);
    assert.equal(/\bdollars\b|\bencumbrance\b|\bfees? collected\b|\bpaid\b/i.test(text), false);
    assert.match(cip.extras.budgetBasis, /carries no budget figure/);
    for (const record of cip.records) {
      assert.match(record.budgetBasis, /carries no budget figure/);
      assert.equal("budget" in record, false);
    }
  });
});

describe("G-92 every extra is counted off the records, never declared and never subtracted", () => {
  it("reconciles the camera inventory: tiles, sites and occupancy bands each count the same array", () => {
    const out = composed["police-cameras"];
    const n = out.recordCount;
    assert.equal(out.extras.metrics.reduce((s, m) => s + m.count, 0), n, "status tiles");
    assert.equal(out.extras.sites.reduce((s, x) => s + x.cameraCount, 0), n, "sites");
    assert.equal(out.extras.occupancy.bands.reduce((s, b) => s + b.count, 0), n, "occupancy bands");
    assert.equal(out.extras.occupancy.measured, n);
    assert.deepEqual(out.extras.occupancy.bands.map((b) => b.band), OCCUPANCY_BANDS);
    // The not-measured band is counted, not inferred from the remainder.
    const notMeasured = out.extras.occupancy.bands[0];
    assert.equal(notMeasured.band, "occupancy not measured");
    assert.equal(
      notMeasured.count,
      out.records.filter((r) => r.occupancyBand === "occupancy not measured").length,
    );
    assert.ok(notMeasured.count > 0, "a camera that cannot report has to be reachable in the fixture");
    // A camera that is not reporting never carries a band it could not have measured.
    for (const record of out.records) {
      if (record.status === "offline" || record.status === "signal-loss") {
        assert.equal(record.occupancyBand, "occupancy not measured", record.recordId);
      }
    }
    for (const m of out.extras.metrics) assert.match(m.countingRule, /over the generated verkada camera-device records/);
    for (const s of out.extras.sites) assert.match(s.countingRule, /one row per record/);
  });

  it("reconciles the apparatus roster: tiles and stations each count the same array", () => {
    const out = composed["fire-apparatus"];
    const n = out.recordCount;
    assert.equal(out.extras.metrics.reduce((s, m) => s + m.count, 0), n, "status tiles");
    assert.equal(out.extras.stations.reduce((s, x) => s + x.apparatusCount, 0), n, "stations");
    const ready = out.records.filter((r) => r.status === "in-service").length;
    assert.equal(out.extras.stations.reduce((s, x) => s + x.readyCount, 0), ready, "ready per station");
    // A station's label is stable across every apparatus housed in it.
    for (const station of out.extras.stations) {
      const housed = out.records.filter((r) => r.stationRef === station.stationRef);
      assert.equal(new Set(housed.map((r) => r.stationLabel)).size, 1, station.stationRef);
      assert.match(station.crewBasis, /names no person/);
    }
    for (const record of out.records) {
      assert.match(record.unitLabel, new RegExp(`^${record.apparatusType} unit \\d{2}$`), record.recordId);
    }
  });

  it("reconciles the projects register: tiles, phases and schedule each count the same array", () => {
    const out = composed["cip-projects"];
    const n = out.recordCount;
    assert.equal(out.extras.metrics.reduce((s, m) => s + m.count, 0), n, "status tiles");
    assert.equal(out.extras.phases.reduce((s, p) => s + p.count, 0), n, "phases");
    assert.equal(out.extras.schedule.behind + out.extras.schedule.onOrAhead, n, "schedule classes");
    assert.equal(out.extras.schedule.measured, n);
    // Phase and status stay coherent: complete is in closeout and stalled is not.
    for (const record of out.records) {
      if (record.status === "complete") assert.equal(record.phase, "closeout", record.recordId);
      if (record.status === "stalled") assert.notEqual(record.phase, "closeout", record.recordId);
      // A stalled project is behind, and its label says so in relative days only.
      if (record.status === "stalled") {
        assert.ok(record.scheduleOffsetDays < 0, record.recordId);
        assert.match(record.scheduleLabel, /days? past due$/, record.recordId);
      }
    }
    for (const p of out.extras.phases) assert.match(p.countingRule, /one row per record/);
    assert.match(out.extras.schedule.countingRule, /neither is derived from the other/);
  });

  it("reconciles the call volumes: queues, days and totals each sum the same buckets", () => {
    const out = composed["call-analytics"];
    const n = out.recordCount;
    const sum = (list, key) => list.reduce((s, r) => s + r[key], 0);
    assert.equal(out.extras.queues.reduce((s, q) => s + q.bucketCount, 0), n, "queue buckets");
    assert.equal(out.extras.daily.reduce((s, d) => s + d.bucketCount, 0), n, "daily buckets");
    assert.equal(out.extras.daily.length, CALL_WINDOW_DAYS);
    assert.equal(out.extras.totals.measured, n);
    for (const key of ["callsOffered", "callsAnswered", "callsAbandoned"]) {
      assert.equal(out.extras.totals[key], sum(out.records, key), `totals.${key}`);
      assert.equal(sum(out.extras.queues, key), sum(out.records, key), `queues.${key}`);
      assert.equal(sum(out.extras.daily, key), sum(out.records, key), `daily.${key}`);
    }
    /**
     * The identity that is only meaningful because both parts are drawn
     * independently. Had offered been generated and abandoned derived by
     * subtraction, this could never disagree and would be asserting nothing.
     */
    for (const record of out.records) {
      assert.equal(record.callsOffered, record.callsAnswered + record.callsAbandoned, record.recordId);
    }
    assert.match(out.extras.totals.countingRule, /no class here is the remainder of another/);
    // A bucket is a queue-day, never a call: one record per queue per relative day.
    assert.equal(n, new Set(out.records.map((r) => `${r.queueRef}:${r.dayOffset}`)).size);
  });
});

describe("G-92 determinism, measured across two separate node processes", () => {
  /**
   * The in-process arm already exists in src/domains.test.mjs and it is the weak
   * one: module state, a warmed PRNG and a single process can all hide a source
   * of drift that a fresh interpreter would expose. This runs the compose in a
   * CHILD process, twice, and compares the bytes.
   *
   * Exit-bounded: execFileSync returns, so this is a build-shaped step and never
   * a watch.
   */
  const domainsUrl = pathToFileURL(path.join(root, "src", "domains.mjs")).href;
  const packUrl = pathToFileURL(path.join(root, "src", "city-pack.mjs")).href;

  function composeInChildProcess(cityKey) {
    const code =
      `const d = await import(${JSON.stringify(domainsUrl)}); ` +
      `const p = await import(${JSON.stringify(packUrl)}); ` +
      `const pack = [p.TEMPLATE_CITY, p.EMPTY_CITY, p.FIXTURE_CITY].find((x) => x.cityKey === ${JSON.stringify(cityKey)}); ` +
      `process.stdout.write(JSON.stringify(d.composeAllDomains(pack)));`;
    return execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  }

  it("produces byte-identical output from two fresh interpreters, and matches this one", () => {
    for (const cityKey of ["template-city", "empty-city"]) {
      const a = composeInChildProcess(cityKey);
      const b = composeInChildProcess(cityKey);
      assert.equal(a.length > 0, true, cityKey);
      assert.equal(a, b, `${cityKey} differs between two separate node processes`);
      const inProcess = JSON.stringify(
        composeAllDomains([TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY].find((p) => p.cityKey === cityKey)),
      );
      assert.equal(a, inProcess, `${cityKey} differs between the child process and this one`);
    }
  });

  it("can fire: the same harness detects a value that is not derived from the seed", () => {
    /**
     * Proven able to fire (DEV_PROCESS 2.2). Two processes agreeing proves
     * nothing unless the comparison is capable of disagreeing, so the same
     * spawn-twice-and-compare is run over a value the seam forbids a generator
     * from reaching. If this ever passes, the test above is decorative.
     */
    const code = "process.stdout.write(String(Math.random()));";
    const run = () =>
      execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
    assert.notEqual(run(), run(), "the cross-process comparison cannot detect a difference");
  });

  it("prints no calendar date and no invented freshness on any wave-2 domain", () => {
    for (const { id } of WAVE_2) {
      const text = JSON.stringify(composed[id]);
      assert.equal(/\d{4}-\d{2}-\d{2}/.test(text), false, id);
      assert.equal(/last sync|last read|last updated/i.test(text), false, id);
    }
  });
});

describe("G-92 the vendorless finding: Parks and Court are not expressible", () => {
  /**
   * THE FINDING, pinned as a test rather than written in a close nobody reads
   * twice. The build sheet asks for Parks facilities and Court docket and records
   * both as "gates: none yet - sources arrive per city". The seam cannot express
   * that, and the answer is more useful than a fake.
   *
   * Every path from a generator to a surface runs through gatedBy, and gatedBy is
   * vendor-shaped at four separate points. A vendorless department is going to be
   * common as other cities onboard, so the shape of the gap is worth measuring
   * exactly rather than describing.
   *
   * This test is written to GO RED when the seam grows a vendorless path. That is
   * the point: whoever adds one deletes this test on purpose and knows why it was
   * here, instead of finding an unexplained absence.
   */
  const vendorless = {
    id: "parks-facilities",
    lensId: "parks",
    region: "Facilities register",
    recordType: "park-facility",
    vocabulary: [],
    generate: () => ({ records: [] }),
  };

  it("refuses a domain with no gating kind, at every spelling of none", () => {
    assert.throws(() => defineDomain({ ...vendorless }), /a domain requires gatedBy/);
    assert.throws(() => defineDomain({ ...vendorless, gatedBy: "" }), /a domain requires gatedBy/);
    assert.throws(() => defineDomain({ ...vendorless, gatedBy: null }), /a domain requires gatedBy/);
    assert.throws(
      () => defineDomain({ ...vendorless, gatedBy: "none" }),
      /gated by none, which is not a catalogued adapter kind/,
    );
    // Including a DEPARTMENT name, which is the shape a vendorless lens wants.
    assert.throws(
      () => defineDomain({ ...vendorless, gatedBy: "parks" }),
      /gated by parks, which is not a catalogued adapter kind/,
    );
    assert.equal(adapterKindById("parks"), null);
    assert.equal(adapterKindById("court"), null);
  });

  it("refuses a pack that names a non-vendor source, so the gap is not routable around", () => {
    assert.throws(
      () => assertCityPackShape(probePack(["parks"])),
      /fixtureGrants names parks, which is not a catalogued adapter kind/,
    );
  });

  it("leaves both lenses not-registered rather than faked, and says so with a basis", () => {
    /**
     * not-registered is the fifth state and the only surviving meaning of "not
     * built". It is the honest answer today and the wrong one tomorrow, which is
     * the whole reason this is routed to the operator rather than resolved here.
     */
    for (const id of ["parks-facilities", "court-docket"]) {
      const out = composeDomainById(TEMPLATE_CITY, id);
      assert.equal(out.status, "not-registered", id);
      assert.equal(out.recordCount, 0, id);
      assert.match(out.basis, /is not a registered domain, so this surface is not built/, id);
      assert.equal(DOMAIN_REGISTRY.some((d) => d.id === id), false, id);
    }
    // No lens named parks or court entered the registry under a borrowed vendor.
    for (const domain of DOMAIN_REGISTRY) {
      assert.equal(/^(parks|court)$/.test(domain.lensId), false, domain.id);
    }
  });
});
