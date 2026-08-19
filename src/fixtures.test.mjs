import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTER_KINDS,
  CASE_STATUS_VALUES,
  RECORD_SHAPES,
  assertRecordShape,
  declaredRecordShapes,
  recordShapeFor,
} from "./adapters.mjs";
import { DOMAIN_REGISTRY } from "./domains.mjs";
import { PERMITS_PIPELINE_DOMAIN } from "./domains/permits-pipeline.mjs";
import {
  TEMPLATE_CITY,
  EMPTY_CITY,
  FIXTURE_CITY,
  environmentBadgeLabel,
} from "./city-pack.mjs";
import {
  DEMO_FIXTURE_PARCELS,
  PIPELINE_FIXTURE_PLAN,
  PLACE_VOCABULARY,
  SUBJECT_VOCABULARY,
  assertDeclaredVocabulary,
  assertNoRealWorldContent,
  composePipeline,
  dueLabelFor,
  generatePipelineRecords,
  pipelineMetrics,
} from "./fixtures.mjs";

const template = composePipeline(TEMPLATE_CITY);
const empty = composePipeline(EMPTY_CITY);

describe("adapter record shapes", () => {
  it("declares a record shape for mygov and states the basis for every kind it does not", () => {
    for (const kind of ADAPTER_KINDS) {
      const shape = recordShapeFor(kind.id);
      assert.ok(shape, `no RECORD_SHAPES entry for ${kind.id}`);
      if (shape.declared) {
        assert.ok(shape.recordType, `${kind.id} declares no recordType`);
        assert.equal(shape.writesTo, kind.writesTo, `${kind.id} writesTo disagrees with the catalog`);
        assert.ok(Array.isArray(shape.fields) && shape.fields.length > 0);
      } else {
        // An undeclared shape is a positive determination with a basis, never a
        // blank that reads like an oversight.
        assert.match(shape.basis, /\S/, `${kind.id} is undeclared with no basis`);
      }
    }
    assert.equal(RECORD_SHAPES.mygov.declared, true);
    assert.equal(RECORD_SHAPES.mygov.recordType, "permit-case");
    /**
     * RE-SCOPED AT G-91. This was deepEqual(declared, ["mygov"]) - a literal
     * that says nothing about whether the shape table and the domain registry
     * agree, and that has to be edited by hand every time a lens lands.
     *
     * It becomes a DIVERGENCE test in both directions (DEV_PROCESS 2.4): every
     * registered domain must resolve to a declared shape, and every declared
     * shape must be reachable from a registered domain. A shape declared for
     * nobody and a domain generating an undeclared type are both findings, and
     * the literal could see neither.
     */
    const fromRegistry = DOMAIN_REGISTRY.map((d) => `${d.gatedBy}:${d.recordType}`).sort();
    const fromShapes = declaredRecordShapes().map((d) => `${d.kind}:${d.recordType}`).sort();
    assert.deepEqual(fromRegistry, fromShapes);
    /**
     * RE-SCOPED AT G-92, four to seven. The three additions are all mygov
     * variants, because the live Development services surface reads five record
     * types out of one adapter kind and a shape table keyed by kind alone can
     * express one of them. This literal is sorted, so a new entry lands wherever
     * its name sorts rather than at the end; the divergence assertion above is
     * the one that catches a shape and a domain drifting apart.
     */
    assert.deepEqual(fromShapes, [
      "mygov:business-license",
      "mygov:code-violation",
      "mygov:inspection",
      "mygov:permit-case",
      "mygov:work-order",
      "samsara:fleet-vehicle",
      "spireon:patrol-vehicle",
    ]);
    for (const domain of DOMAIN_REGISTRY) {
      const shape = recordShapeFor(domain.gatedBy, domain.recordType);
      assert.ok(shape?.declared, `${domain.id} generates an undeclared shape`);
    }
  });

  it("declares the four in-flight statuses the Development services strip names", () => {
    assert.deepEqual(
      CASE_STATUS_VALUES.map((s) => s.id),
      ["overdue", "in-review", "awaiting-applicant", "ready-to-issue"],
    );
    assert.deepEqual(
      CASE_STATUS_VALUES.map((s) => s.severity),
      ["crit", "info", "warn", "ok"],
    );
    // The contract declares meaning. It never names a stylesheet.
    const text = JSON.stringify(RECORD_SHAPES) + JSON.stringify(CASE_STATUS_VALUES);
    assert.equal(/\bp-(ok|info|warn|crit|quiet)\b/.test(text), false);
  });
});

describe("gate 2: every generated record is marked fixture in the payload", () => {
  it("marks origin, fixture and fixtureBasis on every generated record", () => {
    assert.ok(template.records.length > 0);
    for (const record of template.records) {
      assert.equal(record.origin, "fixture", record.recordId);
      assert.equal(record.fixture, true, record.recordId);
      assert.match(record.fixtureBasis, /generated from the MyGov adapter output contract/);
      assert.equal(record.provenance.readAt, null);
      assert.match(record.provenance.readAtBasis, /nothing was read/);
    }
  });

  it("can fire: the shape assertion rejects a record that drops the mark", () => {
    const [good] = template.records;
    assertRecordShape(good);
    assert.throws(
      () => assertRecordShape({ ...good, fixture: false }),
      /must carry fixture true in the payload/,
    );
    assert.throws(
      () => assertRecordShape({ ...good, fixtureBasis: "" }),
      /must carry fixtureBasis/,
    );
    assert.throws(() => assertRecordShape({ ...good, origin: "unknown" }), /origin must be feed or fixture/);
    assert.throws(() => assertRecordShape({ ...good, status: "issued" }), /status must be one of/);
    /**
     * RE-SCOPED AT G-91, and it gained an arm rather than losing one. The old
     * arm used kind "samsara" to mean "a kind with no declared shape"; samsara
     * declares one now, so the arm would have kept passing while testing
     * something else entirely. esri is still undeclared and carries the original
     * meaning, and the mismatch it used to also cover is now its own arm.
     */
    assert.throws(() => assertRecordShape({ ...good, kind: "esri" }), /undeclared/);
    assert.throws(
      () => assertRecordShape({ ...good, kind: "samsara" }),
      /samsara declares no permit-case record type/,
    );
    assert.throws(
      () => assertRecordShape({ ...good, recordType: "work-permit" }),
      /mygov declares no work-permit record type/,
    );
    // And the variant resolves, which is what makes the two arms above findings
    // rather than a kind that simply cannot produce anything.
    assert.equal(recordShapeFor("mygov", "work-order").declared, true);
    assert.equal(recordShapeFor("mygov").recordType, "permit-case");
  });
});

describe("gate 3: no real-world content on a generated record", () => {
  it("carries no person, no street, no parcel outside the demo range, no vendor account", () => {
    for (const record of template.records) {
      assertNoRealWorldContent(record);
      /**
       * RE-SCOPED AT G-91: the vocabulary guard takes the DOMAIN's declared
       * vocabulary now instead of one global list. A global list would have every
       * wave-2 lens widening one shared set until it permitted everything, which
       * is a gate dying of success rather than of neglect.
       */
      assertDeclaredVocabulary(
        record,
        PERMITS_PIPELINE_DOMAIN.vocabulary,
        PERMITS_PIPELINE_DOMAIN.formats,
      );
      assert.equal(record.place.parcelNodeId, null);
      assert.match(record.place.parcelBasis, /\S/);
    }
    const text = JSON.stringify(template);
    // The only parcel this product presents is the labelled demo fixture, and
    // it does not appear on a generated record at all.
    assert.equal(/\b\d{5}:[A-Za-z0-9._-]+\b/.test(text), false);
    assert.deepEqual(DEMO_FIXTURE_PARCELS, ["48021:34137"]);
    assert.equal(/bastrop/i.test(text), false);
  });

  it("draws every string from a declared vocabulary or a declared format", () => {
    const subjects = new Set(template.records.map((r) => r.subject));
    for (const subject of subjects) assert.ok(SUBJECT_VOCABULARY.includes(subject), subject);
    for (const record of template.records) {
      assert.match(record.recordId, /^FIX-\d{4}$/);
      const placeName = record.place.label.split(" Block ")[0];
      assert.ok(PLACE_VOCABULARY.includes(placeName), placeName);
    }
    // Fourteen rows, fourteen different jobs.
    assert.equal(subjects.size, template.records.length);
  });

  it("can fire: the content gate rejects each forbidden class", () => {
    const [good] = template.records;
    assert.throws(
      () => assertNoRealWorldContent({ ...good, subject: "Addition at 1200 Main Street" }),
      /no street address/,
    );
    assert.throws(
      () =>
        assertNoRealWorldContent({
          ...good,
          place: { ...good.place, parcelNodeId: "48021:34999" },
        }),
      /outside the demo fixture range/,
    );
    assert.throws(
      () => assertNoRealWorldContent({ ...good, subject: "Bastrop city hall remodel" }),
      /no held city identity/,
    );
    assert.throws(
      () => assertNoRealWorldContent({ ...good, subject: "Account 448812 renewal" }),
      /no vendor account identifier/,
    );
    assert.throws(
      () =>
        assertDeclaredVocabulary(
          { ...good, subject: "Something nobody declared" },
          PERMITS_PIPELINE_DOMAIN.vocabulary,
          PERMITS_PIPELINE_DOMAIN.formats,
        ),
      /undeclared string/,
    );
    /**
     * The per-domain half, watched: a record legal under its OWN domain is
     * rejected under another domain's vocabulary. If it were not, the vocabulary
     * would be global in effect whatever the signature said.
     */
    assert.throws(
      () => assertDeclaredVocabulary(good, ["nothing-this-record-carries"], []),
      /undeclared string/,
    );
    // And the dueLabel field no longer authorises itself. At G-77 record.dueLabel
    // was in its own allowed set, so any string at all passed in that field.
    assert.throws(
      () =>
        assertDeclaredVocabulary(
          { ...good, dueLabel: "last synced an hour ago" },
          PERMITS_PIPELINE_DOMAIN.vocabulary,
          PERMITS_PIPELINE_DOMAIN.formats,
        ),
      /undeclared string/,
    );
  });
});

describe("gate 4: no money, no completed payment, no earned confidence", () => {
  it("emits no money field, no payment language and no confidence anywhere", () => {
    const text = JSON.stringify(template);
    assert.equal(text.includes("$"), false);
    assert.equal(/\bpaid\b|payment complete|fees? collected/i.test(text), false);
    assert.equal(/"confidence"/.test(text), false);
    for (const record of template.records) {
      for (const key of ["amount", "fee", "balance", "confidence", "assignee", "reviewer"]) {
        assert.equal(key in record, false, `${record.recordId} carries ${key}`);
      }
    }
  });

  it("can fire: the content gate rejects money, a completed payment and a confidence field", () => {
    const [good] = template.records;
    assert.throws(() => assertNoRealWorldContent({ ...good, subject: "Fee $1,200" }), /no money/);
    assert.throws(
      () => assertNoRealWorldContent({ ...good, stage: "payment complete" }),
      /no money/,
    );
    assert.throws(
      () => assertNoRealWorldContent({ ...good, confidence: 0.92 }),
      /no confidence field/,
    );
  });
});

describe("gate 5: empty-city generates nothing", () => {
  it("returns no records, a stated basis, and metrics that stay unread", () => {
    assert.equal(EMPTY_CITY.generatesFixtures, false);
    assert.equal(empty.generated, false);
    assert.equal(empty.status, "empty");
    assert.equal(empty.recordCount, 0);
    assert.deepEqual(empty.records, []);
    // An empty result is not an absence: the absence carries its basis.
    assert.match(empty.basis, /empty-city generates no records and no adapter is granted/);
    for (const metric of empty.metrics) assert.equal(metric.count, 0);
    assert.equal(generatePipelineRecords({ cityKey: "empty-city", generatesFixtures: false }).length, 0);
    // fixture-city is the tenancy test subject, not a second demo.
    assert.equal(composePipeline(FIXTURE_CITY).recordCount, 0);
  });
});

describe("gate 1: the environment badge follows the records dimension", () => {
  it("reads Demo for every pack whose records are generated, and can read otherwise", () => {
    assert.equal(TEMPLATE_CITY.generatesFixtures, true);
    assert.equal(environmentBadgeLabel(TEMPLATE_CITY), "Demo");
    assert.equal(environmentBadgeLabel(EMPTY_CITY), "Demo");
    assert.equal(environmentBadgeLabel(FIXTURE_CITY), "Demo");
    assert.equal(template.environment, "demo");
    // Proven able to read something else, so Demo is a result and not a constant.
    assert.equal(environmentBadgeLabel({ environment: "live" }), "Live");
    assert.equal(environmentBadgeLabel({ environment: "staging" }), "Staging");
  });
});

describe("the generator", () => {
  it("is deterministic: same pack, same records, byte for byte", () => {
    const a = composePipeline(TEMPLATE_CITY);
    const b = composePipeline(TEMPLATE_CITY);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    // No clock and no Math.random reach a stored value.
    const source = JSON.stringify(a);
    assert.equal(/\d{4}-\d{2}-\d{2}T/.test(source), false);
    assert.equal(/\d{4}-\d{2}-\d{2}/.test(source), false);
  });

  it("exercises every declared status, unresolved first", () => {
    const counts = {};
    for (const record of template.records) {
      counts[record.status] = (counts[record.status] || 0) + 1;
    }
    assert.deepEqual(counts, {
      overdue: 3,
      "awaiting-applicant": 4,
      "in-review": 5,
      "ready-to-issue": 2,
    });
    // The loudest rows sort to the top of the queue.
    assert.equal(template.records[0].status, "overdue");
    assert.equal(template.records.at(-1).status, "ready-to-issue");
    const unresolved = template.records.filter(
      (r) => !CASE_STATUS_VALUES.find((s) => s.id === r.status).resolved,
    );
    assert.equal(unresolved.length, 12);
  });

  it("measures each tile against the records and reconciles with the plan", () => {
    const metrics = pipelineMetrics(template.records);
    for (const metric of metrics) {
      // Counting rule travels with the count.
      assert.match(metric.countingRule, /records whose status equals this tile/);
      const measured = template.records.filter((r) => r.status === metric.id).length;
      assert.equal(metric.count, measured, metric.id);
    }
    const tileTotal = metrics.reduce((sum, m) => sum + m.count, 0);
    // Two numbers that should agree: the four tiles and the queue length.
    assert.equal(tileTotal, template.records.length);
    assert.equal(tileTotal, template.recordCount);
    // And the third: the declared plan.
    const planTotal = PIPELINE_FIXTURE_PLAN.reduce((sum, row) => sum + row.count, 0);
    assert.equal(tileTotal, planTotal);
    assert.match(template.countingRule, /14 generated mygov permit-case records on template-city/);
  });

  it("keeps due dates relative so nothing goes stale and no calendar date is invented", () => {
    assert.equal(dueLabelFor(-1), "1 day past due");
    assert.equal(dueLabelFor(-6), "6 days past due");
    assert.equal(dueLabelFor(0), "due today");
    assert.equal(dueLabelFor(3), "due in 3 days");
    for (const record of template.records) {
      assert.equal(Number.isInteger(record.dueOffsetDays), true);
      assert.equal(record.dueLabel, dueLabelFor(record.dueOffsetDays));
      assert.equal("dueDate" in record, false);
      if (record.status === "overdue") assert.ok(record.dueOffsetDays < 0, record.recordId);
      if (record.status === "ready-to-issue") assert.ok(record.dueOffsetDays > 0, record.recordId);
    }
  });

  it("keeps G-24 at zero: nothing generates a city-owned asset record", () => {
    const kinds = new Set(template.records.map((r) => r.kind));
    assert.deepEqual([...kinds], ["mygov"]);
    const types = new Set(template.records.map((r) => r.recordType));
    assert.deepEqual([...types], ["permit-case"]);
    assert.equal(/asset/i.test(JSON.stringify(template)), false);
    /**
     * RE-SCOPED AT G-91. This asserted RECORD_SHAPES.samsara.declared === false
     * and used "samsara has no shape" as a PROXY for "nothing generates a city
     * asset". Samsara declares a fleet-vehicle shape now, so the proxy is gone;
     * the rule it stood for is asserted directly instead, and registry-wide
     * rather than on one payload.
     *
     * Counting rule: every recordType declared by every registered domain, over
     * the whole registry, checked against the asset needle. Measured, not
     * implied - which is stronger than what it replaced.
     */
    const recordTypes = DOMAIN_REGISTRY.map((d) => d.recordType);
    assert.equal(recordTypes.length, DOMAIN_REGISTRY.length);
    for (const recordType of recordTypes) {
      assert.equal(/asset|inventory/i.test(recordType), false, recordType);
    }
    assert.equal(
      DOMAIN_REGISTRY.some((d) => d.lensId === "assets" || d.region === "Assets"),
      false,
      "no registered domain fills the Assets surface",
    );
  });

  it("grants nothing: a fixture pack is not a connected feed", () => {
    for (const pack of [TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY]) {
      assert.deepEqual(pack.grantedAdapters, [], pack.cityKey);
    }
  });
});
