import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ESCALATION_VALUES,
  INSPECTION_RESULT_VALUES,
  recordShapeFor,
} from "./adapters.mjs";
import { EMPTY_CITY, TEMPLATE_CITY } from "./city-pack.mjs";
import { composeDomain, defineDomain } from "./fixture-seam.mjs";
import { DOMAIN_REGISTRY, getDomain } from "./domains.mjs";
import {
  INSPECTIONS_DOMAIN,
  INSPECTION_FIXTURE_PLAN,
  inspectionResultValue,
  relativeDayLabel,
} from "./domains/inspections.mjs";
import {
  CODE_VIOLATIONS_DOMAIN,
  CODE_FIXTURE_PLAN,
  ESCALATION_CEILING,
  ESCALATION_FLOOR,
  assertEscalationBand,
  escalationValue,
} from "./domains/code-violations.mjs";
import {
  BUSINESS_LICENSES_DOMAIN,
  EXPIRY_WINDOWS,
  LICENSE_FIXTURE_PLAN,
  expiryLabelFor,
  expiryWindowFor,
} from "./domains/business-licenses.mjs";
import { server } from "./server.mjs";

/* --------------------------------------------- G-92 development services

The three MyGov endpoints the production Bastrop dashboard reads and this
product could not express. Everything below is measured off the composed
payload rather than off the generator, because the composed payload is what a
lens receives and the seam's guards run between the two.

WHY THIS IS ITS OWN FILE. src/domains.test.mjs holds the seam's own rules and is
edited by every wave-2 lane at once; a lens's own evidence living beside it
would mean three lanes rebasing one file for three unrelated reasons. The rules
that must apply to EVERY domain stay there and are derived from the registry, so
these three are already covered by them without being listed anywhere.
*/

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

/**
 * The lane's subjects, with the record count each carries on template-city.
 *
 * COUNTING RULE, stated where the numbers are read: one row per generated
 * record, over the records composeDomain returns for this domain on
 * template-city, which is the sum of the domain's own declared fixture plan.
 * The plan totals are asserted against the composed counts below rather than
 * trusted, so a plan edited without the count moving is a failure and not a
 * silent drift.
 */
const SUBJECTS = [
  {
    domain: INSPECTIONS_DOMAIN,
    textField: "inspectionType",
    recordCount: 21,
    plan: INSPECTION_FIXTURE_PLAN,
  },
  {
    domain: CODE_VIOLATIONS_DOMAIN,
    textField: "violationType",
    recordCount: 19,
    plan: CODE_FIXTURE_PLAN,
  },
  {
    domain: BUSINESS_LICENSES_DOMAIN,
    textField: "licenseCategory",
    recordCount: 17,
    plan: LICENSE_FIXTURE_PLAN,
  },
];

const composed = Object.fromEntries(
  SUBJECTS.map((s) => [s.domain.id, composeDomain(TEMPLATE_CITY, s.domain)]),
);

describe("G-92 the three Development services domains are registered and gated by mygov", () => {
  it("registers each one, resolves a declared record shape, and carries its count with its rule", () => {
    for (const subject of SUBJECTS) {
      const { domain } = subject;
      assert.equal(getDomain(domain.id), domain, `${domain.id} is not in the registry`);
      assert.equal(domain.lensId, "development-services", domain.id);
      assert.equal(domain.gatedBy, "mygov", domain.id);

      // The shape table and the domain agree, per record type and not per kind.
      const shape = recordShapeFor(domain.gatedBy, domain.recordType);
      assert.ok(shape?.declared, `${domain.id} generates an undeclared shape`);
      assert.equal(shape.recordType, domain.recordType, domain.id);

      const out = composed[domain.id];
      assert.equal(out.status, "ok", domain.id);
      assert.equal(out.recordCount, subject.recordCount, domain.id);
      assert.equal(out.records.length, subject.recordCount, domain.id);
      assert.match(
        out.countingRule,
        new RegExp(`${subject.recordCount} generated mygov ${domain.recordType} records on template-city, one row per record`),
        domain.id,
      );

      // Two numbers that should agree: the declared plan and the composed queue.
      const planTotal = subject.plan.reduce((sum, row) => sum + row.count, 0);
      assert.equal(planTotal, subject.recordCount, `${domain.id} plan against its count`);
    }
    // Three distinct record types out of ONE adapter kind, which is the reason
    // RECORD_SHAPES keys variants under a kind rather than keying by kind alone.
    assert.deepEqual(
      SUBJECTS.map((s) => s.domain.recordType),
      ["inspection", "code-violation", "business-license"],
    );
  });

  it("adds no adapter kind and grants nothing: the demonstration axis already carried mygov", () => {
    assert.deepEqual(TEMPLATE_CITY.grantedAdapters, []);
    assert.ok(TEMPLATE_CITY.fixtureGrants.includes("mygov"));
    for (const subject of SUBJECTS) {
      assert.equal(composed[subject.domain.id].granted, true, subject.domain.id);
    }
  });
});

describe("G-92 all four source states are reachable on every one of the three", () => {
  it("distinguishes ok, ungranted, granted-empty and no-fixture-source, each with its own sentence", () => {
    for (const subject of SUBJECTS) {
      const { domain } = subject;

      // 1. ok, on the shipped demo pack.
      assert.equal(composed[domain.id].status, "ok", domain.id);

      /**
       * 2. ungranted. A pack that GENERATES and has not granted mygov. The
       * sentence has to say the region exists, because "not built" and "no data
       * for your city" are the two customer sentences ruling 1 separates.
       */
      const ungranted = composeDomain(probePack([]), domain);
      assert.equal(ungranted.status, "ungranted", domain.id);
      assert.equal(ungranted.granted, false, domain.id);
      assert.equal(ungranted.generated, true, `${domain.id}: the pack generates, this REGION has no source`);
      assert.equal(ungranted.recordCount, 0, domain.id);
      assert.match(ungranted.basis, /MyGov is not granted on probe-city/, domain.id);
      assert.match(ungranted.basis, new RegExp(`the ${domain.region} region is built and has no source`), domain.id);
      assert.equal(/not built/i.test(ungranted.basis), false, domain.id);

      /**
       * 3. granted-empty. Granted and returned nothing, which is a DIFFERENT
       * sentence and must exist for each domain or the two collapse the first
       * time a real feed returns zero rows for this region.
       */
      const emptyArm = defineDomain({
        id: `probe-empty-${domain.id}`,
        lensId: domain.lensId,
        region: domain.region,
        gatedBy: domain.gatedBy,
        recordType: domain.recordType,
        vocabulary: domain.vocabulary,
        formats: domain.formats,
        generate: () => ({ records: [] }),
      });
      const grantedEmpty = composeDomain(probePack(["mygov"]), emptyArm);
      assert.equal(grantedEmpty.status, "granted-empty", domain.id);
      assert.equal(grantedEmpty.granted, true, domain.id);
      assert.match(
        grantedEmpty.basis,
        new RegExp(`MyGov is granted on probe-city and produced no ${domain.recordType} records`),
        domain.id,
      );
      assert.notEqual(grantedEmpty.basis, ungranted.basis, domain.id);

      // 4. no-fixture-source, the regression target.
      const noSource = composeDomain(EMPTY_CITY, domain);
      assert.equal(noSource.status, "no-fixture-source", domain.id);
      assert.equal(noSource.generated, false, domain.id);
      assert.equal(noSource.recordCount, 0, domain.id);
      assert.deepEqual(noSource.records, [], domain.id);
      assert.match(noSource.basis, /empty-city generates no records and no adapter is granted on it/, domain.id);
      assert.notEqual(noSource.basis, ungranted.basis, domain.id);

      // Four states, four DIFFERENT sentences. Asserted, not assumed.
      const sentences = new Set([
        composed[domain.id].basis,
        ungranted.basis,
        grantedEmpty.basis,
        noSource.basis,
      ]);
      assert.equal(sentences.size, 4, `${domain.id} does not have four distinct bases`);
    }
  });
});

describe("G-92 the seam rejects each new domain on a planted violation", () => {
  /**
   * A probe built FROM the shipped domain: same gating, same record type, same
   * declared vocabulary and formats, and a generator that calls the real one and
   * mutates one record. Neither generator calls a guard - that is the point. If
   * composeDomain did not run the guards over what a generator returns, every
   * case below would pass.
   *
   * Registered into nothing. These are composed directly and never enter
   * DOMAIN_REGISTRY, so proving the gate can fire cannot ship a bad domain.
   */
  function plantedDomain(domain, field, value) {
    return defineDomain({
      id: `probe-${domain.id}`,
      lensId: domain.lensId,
      region: domain.region,
      gatedBy: domain.gatedBy,
      recordType: domain.recordType,
      vocabulary: domain.vocabulary,
      formats: domain.formats,
      generate(pack, seedFor) {
        const out = domain.generate(pack, seedFor);
        const records = out.records.map((r, i) => (i === 0 && field ? { ...r, [field]: value } : r));
        return { records, extras: out.extras };
      },
    });
  }

  const pack = probePack(["mygov"]);

  it("passes the clean probe, so every rejection below is the value and not the probe", () => {
    for (const subject of SUBJECTS) {
      const clean = composeDomain(pack, plantedDomain(subject.domain, null, null));
      assert.equal(clean.status, "ok", subject.domain.id);
      assert.equal(clean.recordCount, subject.recordCount, subject.domain.id);
    }
  });

  it("can fire: every forbidden class is rejected, on every one of the three", () => {
    for (const subject of SUBJECTS) {
      const { domain, textField } = subject;
      const cases = [
        [textField, "Bastrop city hall remodel", /no held city identity/],
        [textField, "Addition at 1200 Main Street", /no street address/],
        [textField, "Fee $1,200", /no money/],
        [textField, "Account 448812 renewal", /no vendor account identifier/],
        [textField, "last synced from the vendor", /invents no freshness/],
        [textField, "Something nobody declared", /undeclared string/],
        ["confidence", 0.92, /no confidence field/],
        ["assignee", "a named reviewer", /no assignee field/],
      ];
      for (const [field, value, message] of cases) {
        assert.throws(
          () => composeDomain(pack, plantedDomain(domain, field, value)),
          message,
          `${domain.id}: ${field}=${value} did not fire the seam`,
        );
      }
      // And the declared shape rejects a status outside its own enum.
      assert.throws(
        () => composeDomain(pack, plantedDomain(domain, "status", "issued")),
        /status must be one of/,
        domain.id,
      );
    }
  });

  it("can fire: none of the three can smuggle a held identity through extras either", () => {
    for (const subject of SUBJECTS) {
      const viaExtras = defineDomain({
        id: `probe-extras-${subject.domain.id}`,
        lensId: subject.domain.lensId,
        region: subject.domain.region,
        gatedBy: subject.domain.gatedBy,
        recordType: subject.domain.recordType,
        vocabulary: subject.domain.vocabulary,
        formats: subject.domain.formats,
        generate: () => ({ records: [], extras: { note: "Bastrop is the source" } }),
      });
      assert.throws(() => composeDomain(pack, viaExtras), /no held city identity/, subject.domain.id);
    }
  });
});

describe("G-92 inspections: a queue whose second axis is paired to its first", () => {
  const out = composed["inspections"];

  it("pairs status and result in BOTH directions", () => {
    for (const record of out.records) {
      const result = inspectionResultValue(record.result);
      assert.ok(result, record.recordId);
      if (record.status === "completed") {
        assert.equal(result.inspected, true, `${record.recordId} is completed with no result`);
        assert.equal("resultBasis" in record, false, record.recordId);
      } else {
        assert.equal(result.inspected, false, `${record.recordId} is not completed and claims a result`);
        // A positive determination of absence, with its basis on the record.
        assert.equal(record.result, "not-inspected", record.recordId);
        assert.match(record.resultBasis, /a result accrues when it is/, record.recordId);
      }
    }
    // BOTH arms are actually present in the fixture, or the loop above passes
    // vacuously on a queue that happens to be all one thing.
    assert.ok(out.records.some((r) => r.status === "completed"));
    assert.ok(out.records.some((r) => r.status !== "completed"));
  });

  it("schedules honestly: an unscheduled inspection has no day and says so", () => {
    for (const record of out.records) {
      if (record.status === "unscheduled") {
        assert.equal(record.dayOffset, null, record.recordId);
        assert.equal(record.dayLabel, null, record.recordId);
        assert.match(record.scheduleBasis, /not scheduled, so it carries no day/, record.recordId);
      } else {
        assert.equal(Number.isInteger(record.dayOffset), true, record.recordId);
        assert.equal(record.dayLabel, relativeDayLabel(record.dayOffset), record.recordId);
        assert.equal("scheduleBasis" in record, false, record.recordId);
        // Behind us or ahead of us, by status, never zero-as-a-default.
        if (record.status === "scheduled") assert.ok(record.dayOffset > 0, record.recordId);
        else assert.ok(record.dayOffset < 0, record.recordId);
      }
    }
    assert.ok(out.records.some((r) => r.status === "unscheduled"));
    assert.ok(out.records.some((r) => r.dayOffset !== null && r.dayOffset > 0));
    assert.ok(out.records.some((r) => r.dayOffset !== null && r.dayOffset < 0));
    // The label reaches both ways and prints no calendar date, proven directly.
    assert.equal(relativeDayLabel(0), "today");
    assert.equal(relativeDayLabel(1), "in 1 day");
    assert.equal(relativeDayLabel(6), "in 6 days");
    assert.equal(relativeDayLabel(-1), "1 day ago");
    assert.equal(relativeDayLabel(-9), "9 days ago");
    assert.throws(() => relativeDayLabel(1.5), /requires an integer offset/);
    assert.throws(() => relativeDayLabel(null), /requires an integer offset/);
  });

  it("reconciles three counts against the queue, and none of them is a subtraction", () => {
    const queue = out.recordCount;
    const tiles = out.extras.metrics.reduce((sum, m) => sum + m.count, 0);
    const results = out.extras.results.reduce((sum, r) => sum + r.count, 0);
    const load = out.extras.inspectorLoad.reduce((sum, i) => sum + i.inspectionCount, 0);
    assert.equal(tiles, queue, "status tiles against the queue");
    assert.equal(results, queue, "result tiles against the queue");
    assert.equal(load, queue, "inspector load against the queue");
    // The not-inspected class is MEASURED, not the remainder of the other three.
    const measuredPending = out.records.filter((r) => r.result === "not-inspected").length;
    assert.equal(out.extras.results.find((r) => r.id === "not-inspected").count, measuredPending);
    assert.equal(measuredPending, out.records.filter((r) => r.status !== "completed").length);
    // Open work per inspector never exceeds that inspector's total.
    for (const row of out.extras.inspectorLoad) {
      assert.match(row.inspectorRef, /^INS-\d{2}$/);
      assert.match(row.inspectorBasis, /names no person/);
      assert.ok(row.openCount <= row.inspectionCount, row.inspectorRef);
      assert.match(row.countingRule, /one row per record/);
    }
    for (const tile of out.extras.metrics) assert.match(tile.countingRule, /over the generated mygov inspection records/);
    for (const tile of out.extras.results) assert.match(tile.countingRule, /over the generated mygov inspection records/);
    // Every declared result value has a tile, including the quiet one.
    assert.deepEqual(
      out.extras.results.map((r) => r.id),
      INSPECTION_RESULT_VALUES.map((r) => r.id),
    );
  });

  it("names no inspector and holds the person on the shape instead", () => {
    const shape = recordShapeFor("mygov", "inspection");
    const held = shape.fields.find((f) => f.name === "inspectorName");
    assert.equal(held.required, false);
    assert.match(held.basis, /must not name a person/);
    for (const record of out.records) {
      assert.match(record.inspectorRef, /^INS-\d{2}$/, record.recordId);
      assert.equal("inspectorName" in record, false, record.recordId);
      assert.equal("inspectedOn" in record, false, record.recordId);
    }
  });
});

describe("G-92 code violations: a case queue whose second axis is an ordered ladder", () => {
  const out = composed["code-violations"];

  it("carries a rung whose step agrees with the declared ladder, on every record", () => {
    for (const record of out.records) {
      const rung = escalationValue(record.escalation);
      assert.ok(rung, record.recordId);
      // Two numbers that must agree (DEV_PROCESS 1.4). If they drift, this fires.
      assert.equal(record.escalationStep, rung.step, record.recordId);
    }
    // Order is read from step, never from array position.
    const ladder = out.extras.escalation;
    assert.deepEqual(
      ladder.map((r) => r.step),
      [...ladder.map((r) => r.step)].sort((a, b) => a - b),
    );
    assert.deepEqual(
      ladder.map((r) => r.id),
      [...CODE_ESCALATION_VALUES].sort((a, b) => a.step - b.step).map((r) => r.id),
    );
  });

  it("holds the floor and the ceiling the ladder declares, and both arms are populated", () => {
    for (const record of out.records) {
      const floor = ESCALATION_FLOOR[record.status];
      if (floor !== undefined) assert.ok(record.escalationStep >= floor, record.recordId);
      const ceiling = ESCALATION_CEILING[record.status];
      if (ceiling !== undefined) assert.ok(record.escalationStep <= ceiling, record.recordId);
    }
    assert.ok(out.records.some((r) => r.status === "past-compliance"), "the floor arm is empty");
    assert.ok(out.records.some((r) => r.status === "notice-issued"), "the ceiling arm is empty");

    /**
     * Proven able to fire, on the SAME function the generator calls. Copying the
     * rule into this file would be two implementations of one rule (DEV_PROCESS
     * 2.4) and the copy would keep passing while the generator drifted. Because
     * the rule lives in the generator, a plan edited later by someone who does
     * not know it throws at generation rather than shipping a case that sat at a
     * courtesy notice while past its compliance date.
     */
    assert.throws(
      () => assertEscalationBand("past-compliance", "courtesy-notice"),
      /sits at or above rung 3/,
    );
    assert.throws(
      () => assertEscalationBand("notice-issued", "hearing-referral"),
      /sits at or below rung 2/,
    );
    assert.throws(() => assertEscalationBand("notice-issued", "no-such-rung"), /no escalation rung declared/);
    // And it does NOT fire on the legal pairings the shipped plan uses, or it
    // would be a gate that refuses everything and proves nothing.
    for (const row of CODE_FIXTURE_PLAN) {
      assert.equal(assertEscalationBand(row.status, row.escalation).id, row.escalation);
    }
  });

  it("keeps the compliance deadline behind or ahead by status, in relative days only", () => {
    for (const record of out.records) {
      assert.equal(Number.isInteger(record.dueOffsetDays), true, record.recordId);
      if (record.status === "past-compliance") assert.ok(record.dueOffsetDays < 0, record.recordId);
      else assert.ok(record.dueOffsetDays >= 0, record.recordId);
      assert.equal("complianceDate" in record, false, record.recordId);
    }
    assert.ok(out.records.some((r) => r.dueOffsetDays < 0));
    assert.ok(out.records.some((r) => r.dueOffsetDays >= 0));
  });

  it("reconciles the tiles, the ladder and the stats block against the queue", () => {
    const queue = out.recordCount;
    const tiles = out.extras.metrics.reduce((sum, m) => sum + m.count, 0);
    const ladder = out.extras.escalation.reduce((sum, r) => sum + r.count, 0);
    const stats = out.extras.stats;
    assert.equal(tiles, queue, "status tiles against the queue");
    assert.equal(ladder, queue, "escalation ladder against the queue");
    assert.equal(stats.measured, queue);
    // open and closed are each measured; neither is the other subtracted.
    assert.equal(stats.open + stats.closed, queue, "stats against the queue");
    assert.equal(stats.open, out.records.filter((r) => r.status !== "closed-compliant").length);
    assert.equal(stats.closed, out.records.filter((r) => r.status === "closed-compliant").length);
    assert.ok(stats.open > 0 && stats.closed > 0, "both stat classes are populated");
    assert.match(stats.countingRule, /neither is derived from the other/);
    for (const rung of out.extras.escalation) assert.match(rung.countingRule, /one row per record/);
  });

  it("presents no assessed figure and states that as a basis, on the record and on the stats", () => {
    const shape = recordShapeFor("mygov", "code-violation");
    const held = shape.fields.find((f) => f.name === "assessedPenalty");
    assert.equal(held.required, false);
    assert.match(held.basis, /a city ledger are where an assessed figure comes from/);
    for (const record of out.records) {
      assert.match(record.penaltyBasis, /presents no assessed figure/, record.recordId);
    }
    assert.match(out.extras.stats.penaltyBasis, /presents no assessed figure/);
    const text = JSON.stringify(out);
    assert.equal(text.includes("$"), false);
    assert.equal(/\bfine\b|\bfines\b/i.test(text), false, "no fine language reaches the payload");
  });
});

describe("G-92 business licences: a roll whose second axis is a continuous band", () => {
  const out = composed["business-licenses"];

  it("derives every band from the same expiryWindowFor the record assertions use", () => {
    for (const record of out.records) {
      assert.equal(Number.isInteger(record.expiryOffsetDays), true, record.recordId);
      const window = expiryWindowFor(record.expiryOffsetDays);
      assert.ok(window, `${record.recordId} falls in no declared band`);
      assert.equal(record.expiryLabel, expiryLabelFor(record.expiryOffsetDays), record.recordId);
      if (record.status === "expired") assert.ok(record.expiryOffsetDays < 0, record.recordId);
      if (record.status === "active") assert.ok(record.expiryOffsetDays > 90, record.recordId);
      if (record.status === "expiring") {
        assert.ok(record.expiryOffsetDays >= 0 && record.expiryOffsetDays <= 30, record.recordId);
      }
      assert.equal("expiresOn" in record, false, record.recordId);
    }
    // The bands are inclusive, non-overlapping and reach both ends.
    assert.equal(expiryWindowFor(-1).id, "expired");
    assert.equal(expiryWindowFor(0).id, "within-30");
    assert.equal(expiryWindowFor(30).id, "within-30");
    assert.equal(expiryWindowFor(31).id, "within-90");
    assert.equal(expiryWindowFor(90).id, "within-90");
    assert.equal(expiryWindowFor(91).id, "beyond-90");
    assert.equal(expiryWindowFor(4000).id, "beyond-90");
    // A malformed offset is a finding, not a quiet member of the last band.
    assert.equal(expiryWindowFor(null), null);
    assert.equal(expiryWindowFor(1.5), null);
    // The label reaches both ways and prints no calendar date.
    assert.equal(expiryLabelFor(0), "expires today");
    assert.equal(expiryLabelFor(1), "expires in 1 day");
    assert.equal(expiryLabelFor(45), "expires in 45 days");
    assert.equal(expiryLabelFor(-1), "expired 1 day ago");
    assert.equal(expiryLabelFor(-12), "expired 12 days ago");
    assert.throws(() => expiryLabelFor(2.5), /requires an integer offset/);
  });

  it("populates all four bands and reconciles them against the roll", () => {
    const queue = out.recordCount;
    const tiles = out.extras.metrics.reduce((sum, m) => sum + m.count, 0);
    const bands = out.extras.expiry.reduce((sum, b) => sum + b.count, 0);
    assert.equal(tiles, queue, "status tiles against the roll");
    assert.equal(bands, queue, "expiry bands against the roll");
    assert.deepEqual(
      out.extras.expiry.map((b) => b.id),
      EXPIRY_WINDOWS.map((b) => b.id),
    );
    /**
     * EVERY band is populated, and this is the assertion the plan's declared
     * ranges exist to make true. A band that is empty because a random draw
     * missed it is a band nobody has ever seen render, and the queue domains
     * have no equivalent problem because they band on a declared status.
     */
    for (const band of out.extras.expiry) {
      assert.ok(band.count > 0, `${band.id} is empty, so nobody has seen it render`);
      assert.match(band.countingRule, /bands are inclusive and do not overlap/);
      // Every member of a band really is in it, measured off the records.
      const measured = out.records.filter(
        (r) => expiryWindowFor(r.expiryOffsetDays)?.id === band.id,
      ).length;
      assert.equal(band.count, measured, band.id);
    }
  });

  it("names no business and holds the name on the shape instead", () => {
    const shape = recordShapeFor("mygov", "business-license");
    const held = shape.fields.find((f) => f.name === "holderName");
    assert.equal(held.required, false);
    assert.match(held.basis, /must not name a real business/);
    for (const record of out.records) {
      assert.match(record.holderRef, /^HLD-\d{2}$/, record.recordId);
      assert.equal("holderName" in record, false, record.recordId);
      assert.match(record.holderBasis, /names no business/, record.recordId);
      assert.match(record.chargesBasis, /presents no renewal charge/, record.recordId);
    }
    assert.match(out.extras.chargesBasis, /presents no renewal charge/);
  });
});

describe("G-92 determinism, and it is measured", () => {
  it("composes byte-identically twice for each of the three, on both packs", () => {
    for (const pack of [TEMPLATE_CITY, EMPTY_CITY]) {
      for (const subject of SUBJECTS) {
        const a = JSON.stringify(composeDomain(pack, subject.domain));
        const b = JSON.stringify(composeDomain(pack, subject.domain));
        assert.equal(a, b, `${pack.cityKey}/${subject.domain.id} is not reproducible`);
      }
    }
    /**
     * The in-process arm only proves the composition is pure. The SOURCE arm
     * that proves no clock is reached lives in src/domains.test.mjs and derives
     * its file list from src/domains/, so these three files are scanned because
     * they exist rather than because anyone listed them. The CROSS-PROCESS arm
     * is run outside the suite and recorded in the lane's close artifact, since
     * a second process is what a module-level memo cannot fake.
     */
    assert.ok(DOMAIN_REGISTRY.length >= 7);
  });

  it("prints no calendar date, no money and no bare confidence on the three", () => {
    for (const subject of SUBJECTS) {
      const text = JSON.stringify(composed[subject.domain.id]);
      assert.equal(/\d{4}-\d{2}-\d{2}/.test(text), false, subject.domain.id);
      assert.equal(/last sync|last read|last updated/i.test(text), false, subject.domain.id);
      assert.equal(text.includes("$"), false, subject.domain.id);
      assert.equal(/"confidence"/.test(text), false, subject.domain.id);
      assert.equal(/bastrop/i.test(text), false, subject.domain.id);
    }
  });
});

describe("G-92 the three domains over HTTP", () => {
  let port;
  const saved = {};
  const KEYS = ["DASHBOARDS_API_KEY", "DATABASE_URL"];

  before(
    () =>
      new Promise((resolve) => {
        for (const k of KEYS) saved[k] = process.env[k];
        for (const k of KEYS) delete process.env[k];
        server.listen(0, "127.0.0.1", () => {
          port = server.address().port;
          resolve();
        });
      }),
  );

  after(
    () =>
      new Promise((resolve, reject) => {
        for (const k of KEYS) {
          if (saved[k] == null) delete process.env[k];
          else process.env[k] = saved[k];
        }
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  it("serves each new region on the domain map and in full on its own route", async () => {
    const base = `http://127.0.0.1:${port}`;
    const map = await (await fetch(`${base}/api/city-domains?cityKey=template-city`)).json();
    const byId = Object.fromEntries(map.regions.map((r) => [r.domainId, r]));
    for (const subject of SUBJECTS) {
      const region = byId[subject.domain.id];
      assert.ok(region, `${subject.domain.id} is absent from the domain map`);
      assert.equal(region.status, "ok", subject.domain.id);
      assert.equal(region.recordCount, subject.recordCount, subject.domain.id);
      assert.equal(region.lensId, "development-services", subject.domain.id);
      assert.match(region.countingRule, /one row per record/, subject.domain.id);

      const full = await (
        await fetch(`${base}/api/domains/${subject.domain.id}?cityKey=template-city`)
      ).json();
      assert.equal(full.status, "ok", subject.domain.id);
      assert.equal(full.records.length, subject.recordCount, subject.domain.id);
      assert.ok(Array.isArray(full.extras.metrics), subject.domain.id);
      const body = JSON.stringify(full);
      assert.equal(body.includes("$"), false, subject.domain.id);
      assert.equal(/bastrop/i.test(body), false, subject.domain.id);

      // The unconnected city answers the same route with the fourth state.
      const empty = await (
        await fetch(`${base}/api/domains/${subject.domain.id}?cityKey=empty-city`)
      ).json();
      assert.equal(empty.status, "no-fixture-source", subject.domain.id);
      assert.equal(empty.recordCount, 0, subject.domain.id);
      assert.match(empty.basis, /empty-city generates no records/, subject.domain.id);
    }
  });
});
