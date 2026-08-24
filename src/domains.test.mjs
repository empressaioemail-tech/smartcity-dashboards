import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTER_KINDS, adapterKindById } from "./adapters.mjs";
import { stripJsComments } from "./served-surface.mjs";
import {
  EMPTY_CITY,
  FIXTURE_CITY,
  TEMPLATE_CITY,
  assertCityPackShape,
  packFixtureGrants as packFixtureGrantsFromPackModule,
} from "./city-pack.mjs";
import {
  DOMAIN_STATUSES,
  assertNoRealWorldContent,
  composeDomain,
  defineDomain,
  packFixtureGrants as packFixtureGrantsFromSeam,
} from "./fixture-seam.mjs";
import {
  DOMAIN_REGISTRY,
  composeAllDomains,
  composeDomainById,
  composeDomainMap,
  listDomains,
} from "./domains.mjs";
import { WORK_ORDERS_DOMAIN, DAILY_QUEUE_DAYS } from "./domains/work-orders.mjs";
import { PATROL_VEHICLES_DOMAIN } from "./domains/patrol-vehicles.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = [TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY];

/**
 * The seam's source population, DERIVED from the directory rather than listed.
 *
 * A hand-written list is exactly what let three of five markup sources go
 * unscanned one card ago: the list was written once, the surface grew, and
 * nothing connected the two. A wave-2 lane adds a file under src/domains/ and it
 * is scanned because it is there.
 */
function seamSources() {
  const dir = path.join(root, "src", "domains");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => `src/domains/${f}`);
  return ["src/fixture-seam.mjs", ...files.sort()];
}

const readSrc = (rel) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

/**
 * Source with comments stripped, for any scan that asks what the code DOES.
 *
 * Not hygiene, measured: the first run of the clock scan below flagged
 * src/fixture-seam.mjs, and the hit was the sentence in that file explaining that
 * no generator may reach Math.random. Prose counted as behaviour is the G-88
 * item 3 defect one layer down, and the repo already owns the fix, so this reuses
 * it rather than writing a second stripper.
 */
const readBehaviour = (rel) => stripJsComments(readSrc(rel));

/** A pack that generates and grants whatever the caller names. Never shipped. */
function probePack(fixtureGrants, over = {}) {
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
    ...over,
  };
}

describe("G-91 the domain registry", () => {
  it("registers every domain, each gated by a catalogued kind, and names which pack generates each", () => {
    const domains = listDomains();
    /**
     * RE-SCOPED AT G-92, four to eleven across two concurrent lanes. The list stays EXPLICIT rather than
     * becoming a length check for the same reason the adapter catalog does: a
     * domain arriving or leaving unnoticed is exactly what this assertion is
     * for. Additions are appended, never inserted, so the diff a concurrent lane
     * has to rebase is one contiguous block.
     */
    assert.deepEqual(
      domains.map((d) => d.id),
      [
        "permits-pipeline",
        "work-orders",
        "fleet-vehicles",
        "patrol-vehicles",
        "police-cameras",
        "fire-apparatus",
        "cip-projects",
        "call-analytics",
        "inspections",
        "code-violations",
        "business-licenses",
      ],
    );
    for (const d of domains) {
      assert.ok(adapterKindById(d.gatedBy), `${d.id} is gated by an uncatalogued kind ${d.gatedBy}`);
      assert.match(d.region, /\S/);
      assert.match(d.lensId, /\S/);
    }
    // Domain ids are unique, or composeDomainById silently resolves the first.
    assert.equal(new Set(domains.map((d) => d.id)).size, domains.length);

    /**
     * Which pack generates which domain, counted rather than asserted.
     *
     * Counting rule: a domain carries records on a pack when the pack generates
     * fixtures AND the domain's gating kind is in that pack's fixtureGrants.
     * Ten of eleven on template-city; zero of eleven on empty-city and on
     * fixture-city, neither of which generates. The one that does not carry is
     * patrol-vehicles, unchanged since G-91: spireon is deliberately left off
     * the demonstration axis so the ungranted state stays reachable on the
     * shipped demo pack. A wave that grants everything deletes the state that
     * proves ruling 1.
     */
    const carries = (pack) =>
      DOMAIN_REGISTRY.filter((d) => composeDomain(pack, d).recordCount > 0).map((d) => d.id);
    assert.deepEqual(carries(TEMPLATE_CITY), [
      "permits-pipeline",
      "work-orders",
      "fleet-vehicles",
      "police-cameras",
      "fire-apparatus",
      "cip-projects",
      "call-analytics",
      "inspections",
      "code-violations",
      "business-licenses",
    ]);
    assert.deepEqual(carries(EMPTY_CITY), []);
    assert.deepEqual(carries(FIXTURE_CITY), []);
  });

  it("keeps the two axes orthogonal: fixtureGrants demonstrates, grantedAdapters connects", () => {
    for (const pack of PACKS) {
      assertCityPackShape(pack);
      // No feed is connected by this card, on any pack.
      assert.deepEqual(pack.grantedAdapters, [], pack.cityKey);
    }
    assert.deepEqual(TEMPLATE_CITY.fixtureGrants, [
      "mygov",
      "samsara",
      "verkada",
      "firstdue",
      "powerbi",
      "goto",
    ]);
    // spireon is STILL not demonstrated, which is what keeps ungranted reachable.
    assert.equal(TEMPLATE_CITY.fixtureGrants.includes("spireon"), false);
    assert.deepEqual(EMPTY_CITY.fixtureGrants, []);
    assert.deepEqual(FIXTURE_CITY.fixtureGrants, []);
    // Paired control: two readers of one field must not drift (DEV_PROCESS 2.4).
    for (const pack of [...PACKS, probePack(["mygov"]), {}, null]) {
      assert.deepEqual(
        packFixtureGrantsFromSeam(pack),
        packFixtureGrantsFromPackModule(pack),
        pack?.cityKey || "no pack",
      );
    }
  });
});

describe("G-91 the seam enforces both guards, structurally", () => {
  /**
   * The forbidden-content probe. Registered into an INJECTED registry, never the
   * shipped one, so proving the gate can fire cannot ship a bad domain.
   *
   * Its generator calls no guard at all - that is the point. If the seam did not
   * run the guards over what a generator returns, every one of these would pass.
   */
  function forbiddenDomain(field, value) {
    return defineDomain({
      id: "probe-forbidden",
      lensId: "probe",
      region: "Probe",
      gatedBy: "mygov",
      recordType: "permit-case",
      vocabulary: ["intake", "in-review", "Sign permit"],
      formats: [/^FIX-\d{4}$/, /^[A-Z][A-Za-z ]+ Block \d+, Lot \d+$/],
      generate() {
        return {
          records: [
            {
              recordId: "FIX-9001",
              kind: "mygov",
              recordType: "permit-case",
              cityKey: "probe-city",
              origin: "fixture",
              fixture: true,
              fixtureBasis: "probe",
              accessPolicy: "public-free",
              subject: "Sign permit",
              stage: "intake",
              status: "in-review",
              place: {
                label: "Template Commons Block 1, Lot 1",
                parcelNodeId: null,
                parcelBasis: "probe",
              },
              dueOffsetDays: 1,
              provenance: { source: "probe", basis: "probe", readAt: null, readAtBasis: "probe" },
              ...(field ? { [field]: value } : {}),
            },
          ],
        };
      },
    });
  }

  const pack = probePack(["mygov"]);

  it("passes the clean probe, so every rejection below is the value and not the probe", () => {
    const ok = composeDomain(pack, forbiddenDomain(null, null));
    assert.equal(ok.status, "ok");
    assert.equal(ok.recordCount, 1);
  });

  it("can fire: a generator that calls no guard is still rejected for every forbidden class", () => {
    const cases = [
      ["subject", "Bastrop city hall remodel", /no held city identity/],
      ["subject", "Addition at 1200 Main Street", /no street address/],
      ["subject", "Fee $1,200", /no money/],
      /**
       * G-102. THE SPELLED-OUT MONEY HOLE, watched firing.
       *
       * Every one of these passed the old rule, which was a dollar sign welded
       * to a digit. "1.4 million" is the one that matters: it is what a Finance
       * tile prints, it needed no currency mark to read as money beside a
       * department name, and it satisfied the vocabulary gate the moment a
       * domain declared it.
       */
      ["subject", "1.4 million", /no money/],
      ["subject", "1.4 million dollars", /no money/],
      ["subject", "Budget 250 thousand", /no money/],
      ["subject", "two hundred thousand", /no money/],
      ["subject", "one point four million", /no money/],
      ["subject", "12000 USD", /no money/],
      ["subject", "Refund in cents", /no money/],
      ["subject", "Balance €400", /no money/],
      ["budget", 42000, /no budget field/],
      ["revenue", 0, /no revenue field/],
      ["cost", "unknown", /no cost field/],
      ["subject", "Account 448812 renewal", /no vendor account identifier/],
      ["subject", "last synced from the vendor", /invents no freshness/],
      ["confidence", 0.92, /no confidence field/],
      ["subject", "Something nobody declared", /undeclared string/],
    ];
    for (const [field, value, message] of cases) {
      assert.throws(
        () => composeDomain(pack, forbiddenDomain(field, value)),
        message,
        `${field}=${value} did not fire the seam`,
      );
    }
  });

  it("can fire: a generator cannot smuggle content through extras either", () => {
    const viaExtras = defineDomain({
      id: "probe-extras",
      lensId: "probe",
      region: "Probe",
      gatedBy: "mygov",
      recordType: "permit-case",
      vocabulary: [],
      generate() {
        return { records: [], extras: { note: "Bastrop is the source" } };
      },
    });
    assert.throws(() => composeDomain(pack, viaExtras), /no held city identity/);
  });

  it("can fire: the seam rejects a malformed return before it reaches a lens", () => {
    const base = {
      lensId: "probe",
      region: "Probe",
      gatedBy: "mygov",
      recordType: "permit-case",
      vocabulary: [],
    };
    assert.throws(
      () => composeDomain(pack, defineDomain({ ...base, id: "p1", generate: () => ({}) })),
      /returned no records array/,
    );
    assert.throws(
      () =>
        composeDomain(pack, defineDomain({ ...base, id: "p2", generate: () => ({ records: [null] }) })),
      /returned a record that is not an object/,
    );
    assert.throws(
      () =>
        composeDomain(
          pack,
          defineDomain({ ...base, id: "p3", generate: () => ({ records: [{ kind: "samsara" }] }) }),
        ),
      /returned a samsara record but is gated by mygov/,
    );
    assert.throws(
      () =>
        composeDomain(
          pack,
          defineDomain({
            ...base,
            id: "p4",
            generate: () => ({ records: [{ kind: "mygov", recordType: "work-order" }] }),
          }),
        ),
      /returned a work-order record but declares permit-case/,
    );
    assert.throws(
      () =>
        composeDomain(
          pack,
          defineDomain({
            ...base,
            id: "p5",
            generate: () => ({
              records: [{ kind: "mygov", recordType: "permit-case", cityKey: "other-city" }],
            }),
          }),
        ),
      /returned a record for other-city on pack probe-city/,
    );
    // And a malformed DESCRIPTOR never registers at all.
    assert.throws(
      () => defineDomain({ ...base, id: "p6", gatedBy: "not-a-kind", generate: () => ({ records: [] }) }),
      /not a catalogued adapter kind/,
    );
    assert.throws(() => defineDomain({ ...base, id: "p7" }), /requires a generate function/);
  });
});

describe("G-91 ungranted is not empty, and neither is not-built", () => {
  it("distinguishes all four source states, each with its own basis", () => {
    assert.deepEqual(DOMAIN_STATUSES, ["ok", "granted-empty", "ungranted", "no-fixture-source"]);

    const ungranted = composeDomain(TEMPLATE_CITY, PATROL_VEHICLES_DOMAIN);
    assert.equal(ungranted.status, "ungranted");
    assert.equal(ungranted.granted, false);
    assert.equal(ungranted.generated, true, "the pack generates; this REGION has no source");
    assert.equal(ungranted.recordCount, 0);
    assert.match(ungranted.basis, /Spireon is not granted on template-city/);
    assert.match(ungranted.basis, /the Patrol roster region is built and has no source/);
    assert.equal(/not built/i.test(ungranted.basis), false);

    // Granted and returned nothing. A DIFFERENT sentence, and it has to exist or
    // the two collapse back into one the first time a real feed returns zero.
    const emptyGenerator = defineDomain({
      id: "probe-granted-empty",
      lensId: "probe",
      region: "Probe",
      gatedBy: "mygov",
      recordType: "permit-case",
      vocabulary: [],
      generate: () => ({ records: [] }),
    });
    const grantedEmpty = composeDomain(probePack(["mygov"]), emptyGenerator);
    assert.equal(grantedEmpty.status, "granted-empty");
    assert.equal(grantedEmpty.granted, true);
    assert.match(grantedEmpty.basis, /MyGov is granted on probe-city and produced no permit-case records/);
    assert.notEqual(grantedEmpty.basis, ungranted.basis);

    // The pack generates nothing at all.
    const noSource = composeDomain(EMPTY_CITY, PATROL_VEHICLES_DOMAIN);
    assert.equal(noSource.status, "no-fixture-source");
    assert.equal(noSource.generated, false);
    assert.match(noSource.basis, /empty-city generates no records and no adapter is granted on it/);
    assert.notEqual(noSource.basis, ungranted.basis);

    // And the only surviving "not built": absent from the registry.
    const notBuilt = composeDomainById(TEMPLATE_CITY, "parks-facilities");
    assert.equal(notBuilt.status, "not-registered");
    assert.match(notBuilt.basis, /not a registered domain, so this surface is not built/);
  });

  it("derives the no-fixture-source sentence from the grants instead of asserting them", () => {
    /**
     * G-102. THE SENTENCE THAT ASSERTED A GRANT STATE IT NEVER READ.
     *
     * `${cityKey} generates no records and no adapter is granted on it` was a
     * template literal. Its second clause was true only because all three
     * shipped packs carry grantedAdapters: [] - and assertCityPackShape forbids
     * a grant only on a pack that GENERATES, which is not the pack this branch
     * is about. The first connected city to reach a built region would have
     * shipped a false sentence on eleven surfaces with nothing to say so.
     *
     * Both directions measured: the no-grant sentence is unchanged (three suites
     * assert it, and moving it would have been a rename wearing a fix's
     * clothes), and a pack that DOES carry a grant now gets a different one.
     */
    const connected = (grants) => ({
      ...EMPTY_CITY,
      cityKey: "connected-city",
      environment: "live",
      grantedAdapters: grants,
    });
    const grant = (kind) => ({
      kind,
      purpose: "records",
      writesTo: "spine",
      accessPolicy: "platform-internal",
      sourceUrl: "https://records.example.gov/api",
    });

    // Arm A, unchanged: no grants at all, and the sentence is the historical one.
    const none = composeDomain(connected([]), PATROL_VEHICLES_DOMAIN);
    assert.equal(none.status, "no-fixture-source");
    assert.equal(none.basis, "connected-city generates no records and no adapter is granted on it");

    // Arm B: the gating adapter IS granted, so the old sentence would have been
    // a flat lie. It names the grant and says what this seam does with it.
    const gated = composeDomain(connected([grant("spireon")]), PATROL_VEHICLES_DOMAIN);
    assert.equal(gated.status, "no-fixture-source");
    assert.match(gated.basis, /Spireon is granted on it as a live feed, which this seam does not read/);
    assert.equal(/no adapter is granted/.test(gated.basis), false);
    assert.notEqual(gated.basis, none.basis);

    // Arm C: grants exist but not this region's. A third sentence, because "no
    // adapter at all" and "not this one" are different facts to a customer.
    const other = composeDomain(connected([grant("mygov")]), PATROL_VEHICLES_DOMAIN);
    assert.equal(other.status, "no-fixture-source");
    assert.match(other.basis, /and Spireon is not granted on it/);
    assert.equal(/no adapter is granted/.test(other.basis), false);
    assert.notEqual(other.basis, none.basis);
    assert.notEqual(other.basis, gated.basis);

    // Arm D, fail closed: a pack that cannot answer the grant question gets no
    // sentence about grants. The raise is the correct outcome, not a default.
    const { grantedAdapters, ...noField } = connected([]);
    assert.equal("grantedAdapters" in noField, false);
    assert.throws(
      () => composeDomain(noField, PATROL_VEHICLES_DOMAIN),
      /carries no grantedAdapters\[\], so no grant statement can be made about it/,
    );
  });

  it("proves the ungranted region is a source state and not a stub: a fixture grant populates it", () => {
    /**
     * The load-bearing half. If patrol-vehicles were an empty generator, then
     * "ungranted" and "not built" would be indistinguishable one layer down,
     * which is exactly how the original misreading survived three handoffs.
     * Granting spireon on a throwaway pack changes NOTHING else and the region
     * fills.
     */
    const granted = composeDomain(probePack(["spireon"]), PATROL_VEHICLES_DOMAIN);
    assert.equal(granted.status, "ok");
    assert.equal(granted.recordCount, 10);
    assert.equal(granted.records.every((r) => r.kind === "spireon"), true);
    assert.match(granted.countingRule, /10 generated spireon patrol-vehicle records on probe-city/);
    // And it names nobody: a driver is a person and a fixture must not have one.
    for (const record of granted.records) {
      assert.match(record.operatorRef, /^OPR-\d{2}$/);
      assert.match(record.operatorBasis, /names no person/);
      assert.equal("operatorName" in record, false);
    }
  });

  it("holds every registered domain empty on empty-city, derived from the registry", () => {
    /**
     * The regression target, and it is derived rather than listed so a wave-2
     * lane cannot add a lens that quietly skips it. On empty-city there are no
     * exceptions, every pill renders quiet and the tension mechanism switches
     * off - the one input under which this design is guaranteed to look flat.
     */
    const composed = composeAllDomains(EMPTY_CITY);
    assert.equal(Object.keys(composed).length, DOMAIN_REGISTRY.length);
    for (const [domainId, out] of Object.entries(composed)) {
      assert.equal(out.recordCount, 0, domainId);
      assert.deepEqual(out.records, [], domainId);
      assert.equal(out.status, "no-fixture-source", domainId);
      assert.equal(out.generated, false, domainId);
      assert.equal(out.granted, false, domainId);
      // An empty result is not an absence: every one of them carries its basis.
      assert.match(out.basis, /\S/, domainId);
      assert.match(out.countingRule, /\S/, domainId);
    }
    const map = composeDomainMap(EMPTY_CITY);
    assert.equal(map.withRecords, 0);
    /**
     * The denominator is DERIVED from the registry at G-92 rather than written
     * as a literal 4. The numerator stays literal, because zero records on the
     * unconnected city is the claim this test exists to make and it must not be
     * able to move quietly; the denominator is just how many regions exist, and
     * every wave-2 lane moves it.
     */
    assert.match(
      map.countingRule,
      new RegExp(`0 of ${DOMAIN_REGISTRY.length} registered domains carry records on empty-city`),
    );
    assert.equal(map.regionCount, DOMAIN_REGISTRY.length);
  });
});

describe("G-91 determinism is measured, not promised", () => {
  it("composes byte-identically twice, for every domain on every pack", () => {
    for (const pack of PACKS) {
      for (const domain of DOMAIN_REGISTRY) {
        const a = JSON.stringify(composeDomain(pack, domain));
        const b = JSON.stringify(composeDomain(pack, domain));
        assert.equal(a, b, `${pack.cityKey}/${domain.id} is not reproducible`);
      }
      assert.equal(
        JSON.stringify(composeAllDomains(pack)),
        JSON.stringify(composeAllDomains(pack)),
        pack.cityKey,
      );
    }
  });

  it("reaches no clock and no Math.random in any seam or domain source", () => {
    /**
     * The source arm, and it is the one that survives a wave-2 lane. The runtime
     * arm above catches a clock only if the two runs happen to straddle a tick;
     * a Date.now() read twice in the same millisecond passes it. Scanning the
     * source cannot be fooled that way.
     *
     * Counting rule: src/fixture-seam.mjs plus every .mjs under src/domains/,
     * derived from the directory. Exclusion set, stated where it is read: test
     * files, which are not under src/domains/ and must be able to name what they
     * forbid. Math.imul is not matched; Math.random is.
     */
    const sources = seamSources();
    assert.ok(sources.length >= 5, `expected the seam plus its domains, found ${sources.length}`);
    const NEEDLES = [/\bMath\.random\b/, /\bDate\.now\b/, /\bnew Date\b/, /\btoISOString\b/];
    const scan = (text) => NEEDLES.filter((n) => n.test(text));
    const hits = [];
    for (const rel of sources) {
      for (const needle of scan(readBehaviour(rel))) hits.push(`${rel}: ${needle}`);
    }
    assert.deepEqual(hits, []);

    /**
     * Proven able to fire, and proven NOT to fire on prose, because those are two
     * different failures and the first run of this scan committed the second one:
     * it flagged src/fixture-seam.mjs on the sentence explaining that a generator
     * may not reach Math.random. A scan that cannot tell code from a comment about
     * code is a scan that gets excluded rather than fixed.
     */
    assert.deepEqual(scan(stripJsComments("const t = Date.now();")).length, 1);
    assert.deepEqual(scan(stripJsComments("let r = Math.random();")).length, 1);
    assert.deepEqual(scan(stripJsComments("// never call Math.random or Date.now here")).length, 0);
    assert.deepEqual(scan(stripJsComments("/* no new Date anywhere */")).length, 0);
    // And Math.imul, which the PRNG genuinely uses, is not the needle.
    assert.deepEqual(scan(stripJsComments("Math.imul(a, b);")).length, 0);
  });

  it("prints no calendar date and no invented freshness on any pack", () => {
    for (const pack of PACKS) {
      const text = JSON.stringify(composeAllDomains(pack));
      assert.equal(/\d{4}-\d{2}-\d{2}/.test(text), false, pack.cityKey);
      assert.equal(/last sync|last read|last updated/i.test(text), false, pack.cityKey);
    }
  });
});

describe("G-91 the money rule is per pack, on both arms", () => {
  it("prints no dollar figure on a POPULATED pack or on the honest-empty one", () => {
    /**
     * RE-SCOPED FROM the pipeline-only assertion at G-77, and widened rather
     * than weakened: every registered domain, on every shipped pack.
     *
     * The rule is per pack because the reasons differ. On a generating pack the
     * figures are real fixture values and none of them is money, because this
     * product does not claim a fee it has not read. On empty-city there is
     * nothing to print, and printing $0 would be a false claim rather than an
     * empty one - four zeros in a header are four assertions.
     */
    for (const pack of PACKS) {
      const text = JSON.stringify(composeAllDomains(pack));
      assert.equal(text.includes("$"), false, pack.cityKey);
      assert.equal(text.includes("$0"), false, pack.cityKey);
      assert.equal(/\bpaid\b|payment complete|fees? collected/i.test(text), false, pack.cityKey);
      assert.equal(/"confidence"/.test(text), false, pack.cityKey);
    }
    // Both arms present: one pack carries records and one carries none, so the
    // assertion above is not passing merely because everything is empty.
    assert.ok(composeDomainMap(TEMPLATE_CITY).withRecords > 0);
    assert.equal(composeDomainMap(EMPTY_CITY).withRecords, 0);
  });

  it("re-reads every shipped payload through the GATE, not through a dollar sign", () => {
    /**
     * G-102. `includes("$")` is a needle, and this repo carries nine of them.
     * Every one is satisfied by "1.4 million", which is exactly the string a
     * Finance tile prints, so the assertion above proved less than it looked.
     * This runs the actual gate over the same payloads: whatever the money rule
     * forbids, none of it is on a shipped surface.
     */
    for (const pack of PACKS) {
      const composed = composeAllDomains(pack);
      for (const [domainId, region] of Object.entries(composed)) {
        assert.doesNotThrow(() => assertNoRealWorldContent(region), `${pack.cityKey} ${domainId}`);
      }
    }
  });

  it("still allows the vocabulary it is not meant to refuse", () => {
    /**
     * THE OVER-BROAD ARM, and it is the one that keeps this gate usable. A money
     * rule that rejected legitimate strings would be its own defect, and the
     * failure would arrive as a wave-2 lane widening the rule until it permitted
     * everything again. So the line is stated as assertions rather than as prose.
     *
     * Read directly through assertNoRealWorldContent rather than through a
     * composed domain, because assertDeclaredVocabulary would refuse these
     * strings for a different reason and the two answers would be indistinguishable.
     */
    for (const allowed of [
      "2,100,000 gallons",
      "18 inches of clearance",
      "Block 12, Lot 3",
      "48021:34137",
      "14 records on the board",
      "72 hour target",
      "100 percent of the queue",
      "Fee schedule review",
      "Payment portal integration",
      "Template Commons Block 1, Lot 1",
      "due in 12 days",
      "Water main leak repair",
    ]) {
      assert.doesNotThrow(() => assertNoRealWorldContent({ text: allowed }), allowed);
    }
    // And the same call shape refuses the money forms, so the passes above are
    // the rule answering rather than the gate having stopped looking.
    for (const refused of ["1.4 million", "$40", "250 thousand", "40 USD"]) {
      assert.throws(() => assertNoRealWorldContent({ text: refused }), /no money/, refused);
    }
  });

  it("refuses a domain that DECLARES forbidden vocabulary, at definition time", () => {
    /**
     * The vocabulary was the way round the content gate: a domain declares its
     * own strings, so declaring "1.4 million" made it legal wherever that domain
     * rendered. Checking the declaration moves the failure to module load, which
     * is before any pack, any caller and any surface.
     */
    const define = (vocabulary) =>
      defineDomain({
        id: "probe-vocab",
        lensId: "probe",
        region: "Probe",
        gatedBy: "mygov",
        recordType: "permit-case",
        vocabulary,
        generate: () => ({ records: [] }),
      });
    assert.throws(() => define(["1.4 million"]), /declares forbidden vocabulary/);
    assert.throws(() => define(["Bastrop"]), /declares forbidden vocabulary/);
    assert.throws(() => define(["last synced"]), /declares forbidden vocabulary/);
    assert.throws(() => define([42]), /non-string vocabulary entry/);
    // Not a gate that refuses every vocabulary: the shipped ones still define.
    assert.doesNotThrow(() => define(["Sign permit", "intake", "in-review"]));
    for (const domain of DOMAIN_REGISTRY) {
      assert.doesNotThrow(() => define(domain.vocabulary), domain.id);
    }
  });
});

describe("G-91 the compound domain", () => {
  const wo = composeDomain(TEMPLATE_CITY, WORK_ORDERS_DOMAIN);

  it("produces a queue WITH an SLA dimension and a daily slice, not a flat list", () => {
    assert.equal(wo.status, "ok");
    assert.equal(wo.recordType, "work-order");
    assert.ok(wo.recordCount > 0);
    assert.ok(Array.isArray(wo.extras.metrics));
    assert.ok(Array.isArray(wo.extras.dailyQueue));
    assert.equal(wo.extras.dailyQueue.length, DAILY_QUEUE_DAYS);
    assert.equal(wo.extras.sla.targetHours, 72);
    for (const record of wo.records) {
      assert.equal(Number.isInteger(record.slaElapsedHours), true);
      assert.equal(record.slaTargetHours, 72);
      assert.ok(["within", "at-risk", "breached"].includes(record.slaState), record.slaState);
      assert.equal(Number.isInteger(record.dayOffset), true);
      assert.ok(record.dayOffset >= 0 && record.dayOffset < DAILY_QUEUE_DAYS);
    }
  });

  it("reconciles three counts that must agree, and none of them is a subtraction", () => {
    const queue = wo.recordCount;
    const tiles = wo.extras.metrics.reduce((sum, m) => sum + m.count, 0);
    const sla = wo.extras.sla.breached + wo.extras.sla.atRisk + wo.extras.sla.within;
    const daily = wo.extras.dailyQueue.reduce((sum, d) => sum + d.count, 0);
    assert.equal(tiles, queue, "status tiles against the queue");
    assert.equal(sla, queue, "SLA bands against the queue");
    assert.equal(wo.extras.sla.measured, queue);
    assert.equal(daily, queue, "daily slice against the queue");
    // Every one of those figures carries its counting rule at the point of use.
    for (const m of wo.extras.metrics) assert.match(m.countingRule, /over the generated mygov work-order records/);
    for (const d of wo.extras.dailyQueue) assert.match(d.countingRule, /one row per record/);
    assert.match(wo.extras.sla.countingRule, /against a declared 72 hour target/);
    // A past-SLA order can never render inside its target, and the reverse.
    for (const record of wo.records) {
      if (record.status === "past-sla") assert.equal(record.slaState, "breached", record.recordId);
      if (record.status === "scheduled") assert.equal(record.slaState, "within", record.recordId);
    }
  });
});

describe("G-91 the catalog and what it counts", () => {
  it("catalogues ten kinds, and the demonstration axis does not touch the granted figure", () => {
    assert.equal(ADAPTER_KINDS.length, 10);
    for (const id of ["spireon", "goto", "powerbi"]) {
      assert.ok(adapterKindById(id), `${id} is not catalogued`);
    }
    /**
     * Counting rule for the nav footer, unchanged by this card: DISTINCT adapter
     * kinds GRANTED on the pack, over the kinds in the catalog. template-city
     * demonstrates two kinds and grants zero, so the figure stays 0 of 10 - and
     * that is correct, because a demonstrated shape is not a connected source.
     * The denominator moved because the catalog grew; the numerator did not
     * move, because no feed was connected.
     */
    assert.equal(TEMPLATE_CITY.grantedAdapters.length, 0);
    assert.equal(packFixtureGrantsFromSeam(TEMPLATE_CITY).length, 6);
  });
});
