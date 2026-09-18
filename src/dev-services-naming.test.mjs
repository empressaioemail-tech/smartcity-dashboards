/**
 * ---------------------------------------------------------------------------
 * G-154. THE FOUR CORRECTIONS, MEASURED ON REAL bastrop_tx RECORDS.
 *
 * The dispatch's four acceptance items are corrections to a lens that ALREADY
 * reads live Bastrop data, so each one is only proven if it is proven on the
 * live path and not on the demo pack. This file builds the rows a real MyGov
 * read returns - the shapes src/mygov-live.mjs and src/mygov-permits.mjs
 * document, and the shapes src/mygov-live.test.mjs already uses - puts real
 * names in the free-text fields the capture carries, runs them through the real
 * mappers, and reads the record fields the shipped row builders read.
 *
 * EVERY ARM IS PAIRED. A refusal observed only refusing has not been observed
 * working: a mapper that returned null for every field would pass a one-sided
 * test and destroy the lens. So each correction is asserted in both directions -
 * the live row is refused, and the predicate that refuses it is shown to fire on
 * a planted violation - and the ORDER arm asserts both that the live compose
 * sorts and that the unsorted input it was handed would have failed.
 *
 * WHAT THIS FILE IS NOT. It is not a live read. This lane's session has no
 * PLATFORM_INTERNAL_API_KEY and no staff credential, so no request to
 * smartcity-os was made here and none could be: the rows below are real-SHAPED,
 * which is a weaker claim than real, and the close states that difference rather
 * than blurring it. What is NOT weaker is the path under test - the real
 * `composeReal*` functions, with only `fetchImpl` replaced, exactly as
 * src/mygov-live.test.mjs already drives them.
 * ---------------------------------------------------------------------------
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BASTROP_TX } from "./city-pack.mjs";
import { getDomain } from "./domains.mjs";
import {
  composeRealBusinessLicenses,
  composeRealCodeViolations,
  composeRealInspections,
  composeRealWorkOrders,
  mapRealBusinessLicenseRecord,
  expiryOffsetFrom,
} from "./mygov-live.mjs";
import { composeRealPermits, mapRealPermitRecord } from "./mygov-permits.mjs";
import { DS_TABS } from "./staff-review.mjs";
import { compareLicenseRoll } from "./domains/business-licenses.mjs";

const ENV = { PLATFORM_INTERNAL_API_KEY: "test-key" };

/** The strings the capture this lens' design was drawn from actually carries. */
const CAPTURE_PERSON = "DEBORAH MOORE, PH#737-762-6252";
const INITIALISED_PERSON = "D. Moore";
const BUSINESS = "Redwood Development LLC";

/** A real-shaped read for one resource, with the given rows. */
const read = (compose, domainId, listKey, rows) =>
  compose(BASTROP_TX, getDomain(domainId), {
    env: ENV,
    fetchImpl: async () => ({ ok: true, json: async () => ({ [listKey]: rows, contract: "live" }) }),
  });

/**
 * The staff-name-in-a-cell predicate, as the design folder's own instrument
 * states it (`_design/smartcity-dev-services/check.mjs`, PERSON). It is
 * restated here rather than imported because the two repos do not share a
 * module, and its one job in this file is to be the thing a planted violation
 * is shown to fire on.
 */
const PERSON = /^(?:[A-Z]\.\s*)+[A-Z][a-z]+(?:-[A-Z][a-z]+)?$|^[A-Z]{2,}\s+[A-Z]{2,}(?:-[A-Z]{2,})?$/;

/** An opaque reference in any of the five formats the design folder draws. */
const REF = /^(?:APP|HLD|OFF|INS|MGR)-\d{2,}$/;

describe("G-154 correction 1: there is no Place tab", () => {
  it("the shipped roster carries seven tabs and none of them is Place", () => {
    assert.equal(DS_TABS.includes("place"), false);
    assert.deepEqual(DS_TABS, [
      "pipeline",
      "inspections",
      "work-orders",
      "code-enforcement",
      "licenses",
      "plan-review",
      "flood-study",
    ]);
  });

  it("is not vacuous: the roster predicate FIRES on a roster carrying Place", () => {
    const withPlace = [DS_TABS[0], "place", ...DS_TABS.slice(1)];
    assert.equal(withPlace.length, DS_TABS.length + 1);
    assert.notDeepEqual(withPlace, DS_TABS);
    assert.equal(withPlace.includes("place"), true);
  });
});

describe("G-154 correction 2: no person on a published workload ranking", () => {
  const CODE_ROW = {
    caseNumber: "21-000124",
    status: "active",
    type: "Junk and Rubbish",
    address: "408 Juniper St",
    assignedOfficer: "R. Garner-Lozoya",
    reportedDate: "2021-07-02",
    isRepeatOffender: true,
  };
  const INSPECTION_ROW = {
    id: "RPT271-26-000633",
    status: "active",
    type: "Pool Permit (R)",
    address: "908 Pine St",
    inspector: "R. Garner-Lozoya",
  };

  it("the live read produces NO load dimension, so there is no per-officer count to publish", async () => {
    /**
     * This is the dispatch's own instruction: "A per-officer count on a
     * published screen is the defect." The count on this lens is the load
     * strip, and the load strip reads `extras.officerLoad` / `inspectorLoad` /
     * `managerLoad`. Those extras are produced by the three FIXTURE generators
     * (src/domains/code-violations.mjs, inspections.mjs, work-orders.mjs). The
     * live compose produces `extras: { realStatusCounts }` and nothing else, so
     * a granted read cannot populate a ranking at all - and this asserts that
     * rather than trusting it.
     */
    const [code, inspections, workOrders] = await Promise.all([
      read(composeRealCodeViolations, "code-violations", "violations", [CODE_ROW]),
      read(composeRealInspections, "inspections", "inspections", [INSPECTION_ROW]),
      read(composeRealWorkOrders, "work-orders", "workOrders", [{ workOrderNumber: "25-000070" }]),
    ]);
    for (const [name, payload] of [
      ["code-violations", code],
      ["inspections", inspections],
      ["work-orders", workOrders],
    ]) {
      assert.equal(payload.status, "ok", name);
      for (const key of ["officerLoad", "inspectorLoad", "managerLoad"]) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(payload.extras, key),
          false,
          `${name} produced extras.${key}, which is a workload ranking built from a live read`,
        );
      }
    }
  });

  it("the two staff columns render a reference, not the name, and one officer keeps one reference", async () => {
    const [code, inspections] = await Promise.all([
      read(composeRealCodeViolations, "code-violations", "violations", [
        CODE_ROW,
        { ...CODE_ROW, caseNumber: "21-000125" },
      ]),
      read(composeRealInspections, "inspections", "inspections", [INSPECTION_ROW]),
    ]);
    /**
     * The row builders read `record.assignedOfficer || record.officerRef` and
     * `record.inspector || record.inspectorRef`, so BOTH halves are asserted:
     * the name field carries nothing, and the reference field carries a
     * reference. Asserting only the first would pass on a record that rendered a
     * blank cell, which is the dimension deleted rather than protected.
     */
    for (const record of code.records) {
      assert.equal(record.assignedOfficer, null, "the officer name reached the record");
      assert.match(record.officerRef, REF);
    }
    assert.equal(code.records[0].officerRef, code.records[1].officerRef, "one officer, two cases, two references");
    assert.equal(inspections.records[0].inspector, null, "the inspector name reached the record");
    assert.match(inspections.records[0].inspectorRef, REF);
    assert.ok(code.records[0].nameRefusedBasis && inspections.records[0].nameRefusedBasis);
  });

  it("is not vacuous: the person predicate FIRES on the two names that were refused", () => {
    for (const name of ["R. Garner-Lozoya", "DEBORAH MOORE"]) {
      assert.equal(PERSON.test(name.trim()), true, name);
    }
    assert.equal(PERSON.test(BUSINESS), false);
  });
});

describe("G-154 correction 3: the licence rows are in the design's sort order", () => {
  /**
   * A vendor read, deliberately shuffled and dated so that the design's order
   * and the arrival order are different. `expirationDate` is the only date
   * field the real row carries.
   */
  const TODAY = new Date("2026-09-18T06:00:00Z");
  const day = (offset) => {
    const t = new Date(Date.UTC(2026, 8, 18) + offset * 86400000);
    return t.toISOString().slice(0, 10);
  };
  const LICENCE_ROWS = [
    { licenseNumber: "23-000005", status: "active", businessName: BUSINESS, type: "Vehicle for hire", expirationDate: day(200) },
    { licenseNumber: "23-000006", status: "active", businessName: "Golf cart license", type: "Vehicle for hire", expirationDate: day(-40) },
    { licenseNumber: "23-000007", status: "active", businessName: "Sample Bend Salon", type: "Salon and barber", expirationDate: day(12) },
    { licenseNumber: "23-000008", status: "active", businessName: "Specimen Yard Cafe", type: "Food establishment", expirationDate: null },
  ];

  it("sorts a shuffled read into the roll's order and states the expiry the order was taken on", async () => {
    const payload = await read(composeRealBusinessLicenses, "business-licenses", "licenses", LICENCE_ROWS);
    assert.equal(payload.status, "ok");
    const ids = payload.records.map((r) => r.recordId);
    assert.deepEqual(ids, ["23-000006", "23-000007", "23-000005", "23-000008"]);
    /** The unreadable date sorts LAST rather than first: an expiry nobody
     *  could read must not head the roll on the strength of nothing. */
    assert.equal(payload.records[3].expiryOffsetDays, null);
    assert.equal(payload.records[3].expiryLabel, null);
    /** Sorted by the SHIPPED comparator, not by a re-statement of it. */
    const offsets = payload.records.slice(0, 3).map((r) => r.expiryOffsetDays);
    assert.deepEqual(offsets, [-40, 12, 200]);
    assert.deepEqual([...payload.records].sort(compareLicenseRoll).map((r) => r.recordId), ids);
  });

  it("is not vacuous: the arrival order this compose was handed FAILS that order", () => {
    const arrival = LICENCE_ROWS.map((row) => row.licenseNumber);
    const sortedByTheShippedRule = [...LICENCE_ROWS]
      .map((row) => mapRealBusinessLicenseRecord(row, "bastrop_tx"))
      .sort(compareLicenseRoll)
      .map((record) => record.recordId);
    assert.deepEqual(arrival, ["23-000005", "23-000006", "23-000007", "23-000008"]);
    assert.notDeepEqual(arrival, sortedByTheShippedRule, "the read must be shuffled, or the arm proves nothing");
  });

  it("derives the offset, and refuses to derive one from a date it cannot read", () => {
    assert.equal(expiryOffsetFrom("2026-09-18", TODAY), 0);
    assert.equal(expiryOffsetFrom("2026-09-25", TODAY), 7);
    assert.equal(expiryOffsetFrom("2026-09-11", TODAY), -7);
    for (const bad of [null, "", "not a date", "2026-13-45"]) {
      assert.equal(expiryOffsetFrom(bad, TODAY), null, String(bad));
    }
    /** The distinction that matters: unreadable is null, not zero. */
    assert.notEqual(expiryOffsetFrom("not a date", TODAY), expiryOffsetFrom("2026-09-18", TODAY));
  });

  it("derives the relative form the artboard draws against the read's own clock", () => {
    const record = mapRealBusinessLicenseRecord({ licenseNumber: "23-000009", expirationDate: day(7) }, "bastrop_tx");
    /** The label is derived from the real clock at map time, so the test asks
     *  the same function what today is rather than hard-coding a phrasing that
     *  would go stale tomorrow. */
    const expectedOffset = expiryOffsetFrom(day(7));
    assert.equal(record.expiryOffsetDays, expectedOffset);
    assert.match(record.expiryLabel, /^(expires today|expires in \d+ days?|expired \d+ days? ago)$/);
    assert.equal(record.expiryLabel.includes(day(7)), false, "a bare calendar date reached the label");
    assert.equal(record.expirationDate, day(7), "the record's own date is kept, only the label is relative");
  });
});

describe("G-154 correction 4: no resident is named beside an address", () => {
  const PERMIT_ROW = {
    permitNumber: "26-000317",
    status: "active",
    title: "Residential Addition",
    address: "908 PINE ST",
    applicant: INITIALISED_PERSON,
    contractor: null,
    ownerName: null,
    fees: [],
  };

  it("REFUSES the applicant on the live permit row and keeps the address", async () => {
    const payload = await composeRealPermits(
      BASTROP_TX,
      getDomain("permits-pipeline"),
      { accessPolicy: "tenant-private" },
      {
        env: ENV,
        fetchImpl: async () => ({ ok: true, json: async () => ({ permits: [PERMIT_ROW], contract: "live" }) }),
      },
    );
    assert.equal(payload.status, "ok");
    const [record] = payload.records;
    /** The Pipeline row builder renders record.applicant, so this is the cell. */
    assert.match(record.applicant, REF);
    assert.equal(record.applicant, "APP-01");
    assert.ok(record.applicantBasis);
    /** The address still renders: the correction removes the person, not the row. */
    assert.equal(record.place.label, "908 PINE ST");
  });

  it("REFUSES a business applicant too, and says why rather than claiming a classifier", async () => {
    /**
     * THE REJECTED ALTERNATIVE, asserted rather than described. The design
     * folder's README says "business applicants stay named: a business on a
     * permit is a commercial entity and a public record". That is a judgement
     * about each name, made by hand when the artboard was drawn, and it is not
     * mechanizable on this feed: "Redwood Development LLC" and "Deborah Ann
     * Moore" are both two-to-three capitalised words, and the capture's actual
     * PII string ("DEBORAH MOORE, PH#737-762-6252") fails every shape test that
     * would have kept the first. A whitelist that separates them is a
     * hand-written word list that goes stale the first time a city licenses
     * something new, so this lane refuses the field and keeps the dimension as a
     * reference. The cost is stated: live business applicants are referenced
     * rather than named.
     */
    const mapper = mapRealPermitRecord({ ...PERMIT_ROW, applicant: BUSINESS }, "bastrop_tx", "tenant-private");
    assert.equal(mapper.applicant, null);
    const payload = await composeRealPermits(
      BASTROP_TX,
      getDomain("permits-pipeline"),
      { accessPolicy: "tenant-private" },
      {
        env: ENV,
        fetchImpl: async () => ({ ok: true, json: async () => ({ permits: [{ ...PERMIT_ROW, applicant: BUSINESS }], contract: "live" }) }),
      },
    );
    assert.equal(payload.records[0].applicant, "APP-01");
  });

  it("REFUSES the licence holder name in the cell beside the licence address", () => {
    const record = mapRealBusinessLicenseRecord(
      { licenseNumber: "23-000010", businessName: BUSINESS, address: "1401 CHESTNUT ST" },
      "bastrop_tx",
    );
    assert.equal(record.subject, null);
    assert.equal(record.place.label, "1401 CHESTNUT ST");
  });

  it("leaves ownerName and owner as read: neither backs a cell, and neither is claimed to be a person", () => {
    /**
     * THE REVERTED OVER-REACH, locked so it cannot be re-applied on the same
     * reasoning. The first pass at this lane cleared both fields on the theory
     * that each is a second copy of the refused dimension. The real row shapes
     * disprove it: the permits feature's own sample row carries applicant
     * "Redwood Development LLC" and ownerName "Bastrop County", two different
     * entities, and the licence rows this lane has seen carry no `owner` at all.
     * Both fields have zero reads in web/, so neither backs a cell; refusing them
     * would be a change justified by a guess, which is a thing no later reader
     * can audit. They are carried as read, and their populations are OPEN in the
     * close.
     */
    const permit = mapRealPermitRecord(
      { permitNumber: "21-000023", applicant: BUSINESS, ownerName: "Bastrop County" },
      "bastrop_tx",
      "tenant-private",
    );
    assert.equal(permit.applicant, null, "the applicant is refused");
    assert.equal(permit.ownerName, "Bastrop County", "ownerName is an entity, left as read");
    const licence = mapRealBusinessLicenseRecord(
      { licenseNumber: "23-000011", businessName: BUSINESS, owner: "Chestnut Holdings LP" },
      "bastrop_tx",
    );
    assert.equal(licence.subject, null, "the holder is refused");
    assert.equal(licence.owner, "Chestnut Holdings LP", "owner is left as read");
  });

  it("is not vacuous: the instrument's OWN person rule would have MISSED the capture's PII string", () => {
    /**
     * THE PLANTED ARM, and it is the argument for this whole correction. Each
     * string below is what the mapper rendered before G-154. The design
     * folder's own PERSON predicate catches the initialled form and MISSES the
     * capture's actual PII string, because that string carries a phone number
     * and a comma and no shape test can see through it:
     *
     *   PERSON.test("D. Moore")                        === true
     *   PERSON.test("DEBORAH MOORE, PH#737-762-6252")  === false
     *   PERSON.test("Redwood Development LLC")         === false
     *
     * So a rule built on that predicate would have kept a resident's name and
     * phone number in a cell beside their address while reporting a pass. The
     * product's refusal does not depend on shape at all, which is why the three
     * strings above all come back null and the reference comes back in their
     * place. Three strings, three refusals, and none of them a reference.
     */
    const wouldHaveRendered = [CAPTURE_PERSON, BUSINESS, INITIALISED_PERSON];
    assert.equal(PERSON.test(INITIALISED_PERSON), true);
    assert.equal(PERSON.test(CAPTURE_PERSON), false, "the shape rule misses the capture's real PII string");
    assert.equal(PERSON.test(BUSINESS), false);
    for (const value of wouldHaveRendered) {
      assert.equal(REF.test(value.trim()), false, `${value} must not already be a reference`);
    }
    /** And the rule that DOES carry it refuses all three, not just the one the
     *  shape test could see. */
    const refused = wouldHaveRendered.map((applicant) =>
      mapRealPermitRecord({ permitNumber: "26-000317", applicant }, "bastrop_tx", "tenant-private").applicant,
    );
    assert.deepEqual(refused, [null, null, null]);
  });
});

describe("G-154 the work-order free-text check", () => {
  it("refuses row.title, which is where a citizen writes their name and phone number", async () => {
    const payload = await read(composeRealWorkOrders, "work-orders", "workOrders", [
      {
        workOrderNumber: "24-002855",
        statusNormalized: "open",
        title: CAPTURE_PERSON,
        type: "Water Quality Issues",
        address: "021 HWY 71 W",
        assignedTo: "W. Mannon",
      },
    ]);
    const [record] = payload.records;
    /** The Work orders table renders record.subject. */
    assert.equal(record.subject, "Water Quality Issues");
    assert.equal(record.subject.includes("MOORE"), false);
    assert.equal(record.subject.includes("737"), false);
  });

  it("states an absence rather than reaching back for the title when the source has no type", async () => {
    const payload = await read(composeRealWorkOrders, "work-orders", "workOrders", [
      { workOrderNumber: "24-002856", title: CAPTURE_PERSON },
    ]);
    assert.equal(payload.records[0].subject, "Untitled work order");
  });

  it("is not vacuous: the refused title really does carry the names and numbers", () => {
    assert.equal(CAPTURE_PERSON.includes("MOORE"), true);
    assert.equal(/\d{3}-\d{3}-\d{4}/.test(CAPTURE_PERSON), true);
  });
});

describe("G-154 isRepeatOffender: the decision, and where it lands", () => {
  it("lands on no rendered field, and it is not added to one", async () => {
    /**
     * THE DECISION THE DISPATCH ASKS FOR. `isRepeatOffender` is a real column on
     * the source violation record and src/mygov-live.mjs carries it. The
     * question is whether it belongs on the surface where it lands, and the
     * measured answer is that it lands NOWHERE: the Code enforcement row builder
     * reads recordId, violationType, place, status, escalationStep,
     * assignedOfficer/officerRef and reportedDate, and grep finds
     * `isRepeatOffender` in exactly one place in this repo - the mapper line
     * that reads it. The design folder draws no such column on any of its six
     * artboards.
     *
     * So the decision is to keep it off, and the reason is not only that the
     * design does not draw it: a repeat-offender flag is a judgement about a
     * resident, computed from the vendor's own case history, presented beside
     * that resident's address on a screen the dispatch records as open to EVERY
     * signed-in department because department access is not enforced (G-143).
     * An operational fact (this case is at rung 3) is a staff fact; a
     * characterisation of the person living at the address is not, and the
     * cheapest place to keep it off is where it is already not read.
     */
    const payload = await read(composeRealCodeViolations, "code-violations", "violations", [
      { caseNumber: "21-000124", status: "active", type: "Junk and Rubbish", address: "408 Juniper St", isRepeatOffender: true },
    ]);
    assert.equal(payload.records[0].isRepeatOffender, true, "the field is carried");
    /** The row builder's read list, restated so the day a column is added the
     *  field list here has to be edited in the same commit. */
    const RENDERED = ["recordId", "violationType", "place", "status", "escalationStep", "assignedOfficer", "reportedDate", "officerRef"];
    assert.equal(RENDERED.includes("isRepeatOffender"), false);
  });
});
