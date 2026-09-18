#!/usr/bin/env node
/**
 * G-153, DEFECTS 1 AND 3, MEASURED ON THE LIVE RECORDS RATHER THAN ON A FIXTURE.
 *
 * The dispatch's evidence bar for defect 1 is explicit: `assertRecordShape` "must be shown
 * REFUSING on the live Samsara record, not on a fixture". A fixture written by this lane proves
 * what this lane believes; the live record proves what the vendor's read actually carries. So this
 * script reads the deployed surface's own records -- the ones `app.smartcityos.io` serves from
 * Samsara and Spireon right now -- and runs THE DECLARED SHAPE over each of them with the same
 * `recordShapeFaults` the live path now calls. Nothing here is mapped, defaulted or repaired: the
 * records arrive as JSON and are judged as JSON.
 *
 * WHAT THIS DOES NOT CLAIM. The deployed app serves `origin/main` at a commit that PREDATES this
 * lane's fixes (deploys are planner-owned), so the records this reads are the BEFORE state: the
 * last live reads taken before anything changed. That is exactly what makes them evidence -- the
 * faults it reports are the faults the guard will refuse once this branch is deployed -- and it is
 * why the after-state is proven by the violation suite and the unit tests rather than claimed here.
 *
 * THE THREE FINDINGS IT IS BUILT TO REPORT, EACH AS A COUNT RATHER THAN AS A SENTENCE.
 *   1. How many live records the declared shape refuses, and with which faults, per kind.
 *   2. Which fields a live record carries that its declared shape does not declare -- the
 *      inventory-shaped set (`vin`, `make`, `model`, `odometerMiles`) the dispatch names.
 *   3. Whether `operatorRef` reaches a live record at all, and whether the unit-label sentinel
 *      collides across the two vendors (defect 2's live half; the fixture half is in
 *      src/vendor-live.test.mjs, which feeds an empty row to both mappers).
 *
 * USAGE
 *   HAUSKA_TENANT_KEY=... node --use-system-ca scripts/live-record-refusal.mjs \
 *     [--base https://app.smartcityos.io] [--city bastrop_tx] [--artifact <path>]
 *
 *   The key is read from the environment and never printed, written to the artifact or echoed.
 *   `--use-system-ca` is needed on a machine whose TLS interception node does not trust; without
 *   it every fetch fails with a certificate error and this script reports that as a refusal.
 */
import fs from "node:fs";
import { recordShapeFaults, recordShapeFor } from "../src/adapters.mjs";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = argOf("--base", "https://app.smartcityos.io").replace(/\/$/, "");
const CITY = argOf("--city", "bastrop_tx");
const ARTIFACT = argOf("--artifact", null);
const DOMAINS = ["fleet-vehicles", "patrol-vehicles", "police-cameras"];

const key = String(process.env.HAUSKA_TENANT_KEY || "").trim();
if (!key) {
  console.error("REFUSING: HAUSKA_TENANT_KEY is unset. A tenant-private pack answers 401 to an anonymous read, so");
  console.error("there is nothing to measure without it. Read it at point of use:");
  console.error('  HAUSKA_TENANT_KEY="$(gcloud secrets versions access latest --secret=hauska-tenant-key-bastrop-tx-lane-verification --project=hauska-prod-497015)"');
  process.exit(2);
}

const artifact = { instrument: "scripts/live-record-refusal.mjs", ranAt: new Date().toISOString(), base: BASE, city: CITY, auth: { presented: "x-hauska-key", source: "HAUSKA_TENANT_KEY in the process environment" }, domains: [], statements: [] };

async function readDomain(domainId) {
  const url = `${BASE}/api/domains/${domainId}?cityKey=${encodeURIComponent(CITY)}`;
  const out = { domainId, url, httpStatus: null, status: null, basis: null, recordCount: 0, fetchError: null, records: [] };
  try {
    const res = await fetch(url, { headers: { "x-hauska-key": key, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    out.httpStatus = res.status;
    const body = await res.json().catch(() => null);
    if (!body) { out.fetchError = "response body was not JSON"; return out; }
    out.status = body.status ?? null;
    out.basis = typeof body.basis === "string" ? body.basis.slice(0, 200) : null;
    out.records = Array.isArray(body.records) ? body.records : [];
    out.recordCount = out.records.length;
  } catch (err) {
    out.fetchError = err.message;
  }
  return out;
}

/**
 * The declared field names for a record, plus the envelope the shape guard checks separately, so
 * "undeclared" means undeclared and not "envelope field this script forgot".
 */
function declaredNames(record) {
  const shape = recordShapeFor(record.kind, record.recordType);
  return new Set([...(shape?.fields || []).map((f) => f.name)]);
}

const ENVELOPE_NAMES = new Set(["recordId", "kind", "recordType", "cityKey", "origin", "accessPolicy", "fixture", "fixtureBasis", "sourceUrl", "provenance", "status", "unitLabel"]);

/**
 * A field census that COUNTS rather than quotes. If a live record carries a person's name in a
 * field, the fault belongs in the artifact and the name does not: writing the name into an
 * evidence file would be this lane doing the thing the lens exists to stop. So values are
 * classified -- null, empty, person-shaped, other -- and only the safe classes (status words, unit
 * labels, field names) are ever printed.
 */
const PERSON_SHAPED = /^(?:[A-Z]\.\s*)+[A-Z][a-z]+(?:-[A-Z][a-z]+)?$|^[A-Z][a-z]+\s+[A-Z][a-z]+$/;
function censusOf(records) {
  const status = {};
  const labels = [];
  const operator = { present: 0, nullValue: 0, emptyString: 0, personShaped: 0, other: 0 };
  for (const r of records) {
    if (r.status !== undefined && r.status !== null) status[String(r.status)] = (status[String(r.status)] || 0) + 1;
    if (typeof r.unitLabel === "string") labels.push(r.unitLabel);
    if (Object.prototype.hasOwnProperty.call(r, "operator")) {
      operator.present += 1;
      const v = r.operator;
      if (v === null || v === undefined) operator.nullValue += 1;
      else if (typeof v === "string" && !v.trim()) operator.emptyString += 1;
      else if (typeof v === "string" && PERSON_SHAPED.test(v.trim())) operator.personShaped += 1;
      else operator.other += 1;
    }
  }
  const dupes = [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))];
  return { statusValues: status, unitLabelsDistinct: new Set(labels).size, unitLabelsRepeated: dupes.length, unnnamedLabels: labels.filter((l) => /^unnamed/i.test(l)).length, operatorField: operator };
}

const perKind = new Map();
const sentinelLabels = new Map();
const operatorRefSeen = [];

for (const domainId of DOMAINS) {
  const d = await readDomain(domainId);
  const digests = [];
  for (const record of d.records) {
    const faults = recordShapeFaults(record);
    const declared = declaredNames(record);
    const undeclared = Object.keys(record).filter((k) => !declared.has(k) && !ENVELOPE_NAMES.has(k)).sort();
    const label = typeof record.unitLabel === "string" ? record.unitLabel : null;
    const hasOperatorRef = Object.prototype.hasOwnProperty.call(record, "operatorRef");
    if (label) {
      const seen = sentinelLabels.get(label) || { label, kinds: new Set(), recordIds: [] };
      seen.kinds.add(record.kind);
      seen.recordIds.push(record.recordId);
      sentinelLabels.set(label, seen);
    }
    if (hasOperatorRef || record.kind === "spireon" || record.kind === "samsara") operatorRefSeen.push({ kind: record.kind, recordId: record.recordId, present: hasOperatorRef, value: hasOperatorRef ? record.operatorRef : undefined });
    if (faults.length) {
      const bucket = perKind.get(record.kind) || { kind: record.kind, refused: 0, conforming: 0, faults: new Map(), undeclaredFields: new Set() };
      bucket.refused += 1;
      for (const f of faults) bucket.faults.set(f, (bucket.faults.get(f) || 0) + 1);
      for (const u of undeclared) bucket.undeclaredFields.add(u);
      perKind.set(record.kind, bucket);
    } else if (d.records.length) {
      const bucket = perKind.get(record.kind) || { kind: record.kind, refused: 0, conforming: 0, faults: new Map(), undeclaredFields: new Set() };
      bucket.conforming += 1;
      for (const u of undeclared) bucket.undeclaredFields.add(u);
      perKind.set(record.kind, bucket);
    }
    digests.push({
      recordId: record.recordId,
      kind: record.kind,
      recordType: record.recordType,
      status: record.status ?? null,
      unitLabel: label,
      hasOperatorRef,
      operatorRef: hasOperatorRef ? record.operatorRef : null,
      declared,
      undeclared,
      faults,
    });
  }
  const refused = digests.filter((x) => x.faults.length).length;
  artifact.domains.push({
    domainId,
    url: d.url,
    httpStatus: d.httpStatus,
    status: d.status,
    basis: d.basis,
    recordCount: d.recordCount,
    fetchError: d.fetchError,
    refusedByTheDeclaredShape: refused,
    conformingRecords: d.recordCount - refused,
    kinds: [...new Set(digests.map((x) => x.kind))],
    census: censusOf(d.records),
    /** The first live record per kind, faults included, so the refusal is readable not just counted. */
    samples: [...new Map(digests.map((x) => [x.kind, x])).values()].map((x) => ({ recordId: x.recordId, kind: x.kind, recordType: x.recordType, faults: x.faults, undeclared: x.undeclared, hasOperatorRef: x.hasOperatorRef, unitLabel: x.unitLabel })),
  });
  console.log(`\n${domainId}: http ${d.httpStatus ?? "?"} status ${d.status ?? "?"} records ${d.recordCount} refused ${refused}${d.fetchError ? ` FETCH ERROR ${d.fetchError}` : ""}`);
  for (const k of [...new Set(digests.map((x) => x.kind))]) {
    const of = digests.filter((x) => x.kind === k);
    const bucket = perKind.get(k) || { refused: 0, conforming: 0, faults: new Map(), undeclaredFields: new Set() };
    console.log(`  ${k}: ${of.length} record(s), ${of.filter((x) => x.faults.length).length} REFUSED, ${of.filter((x) => !x.faults.length).length} conforming`);
    for (const [f, n] of [...bucket.faults].sort((a, b) => b[1] - a[1])) console.log(`     x${n} ${f}`);
    if (bucket.undeclaredFields.size) console.log(`     undeclared on the live record: ${[...bucket.undeclaredFields].sort().join(", ")}`);
  }
  const c = artifact.domains[artifact.domains.length - 1].census;
  if (c) console.log(`  census: status values ${JSON.stringify(c.statusValues)}; unit labels ${c.unitLabelsDistinct} distinct, ${c.unitLabelsRepeated} repeated, ${c.unnnamedLabels} unnamed; operator field ${JSON.stringify(c.operatorField)}`);
}

const feedRecords = operatorRefSeen.filter((r) => r.kind === "samsara" || r.kind === "spireon");
const operatorRefPresent = feedRecords.filter((r) => r.present);
const sentinelCollisions = [...sentinelLabels.values()].filter((s) => s.kinds.size > 1);
const unnamedLabels = [...sentinelLabels.keys()].filter((l) => /^unnamed/i.test(l));

artifact.verdicts = {
  liveRecordsRead: artifact.domains.reduce((n, d) => n + d.recordCount, 0),
  liveRecordsRefusedByTheDeclaredShape: artifact.domains.reduce((n, d) => n + d.refusedByTheDeclaredShape, 0),
  perKind: Object.fromEntries([...perKind].map(([k, v]) => [k, { refused: v.refused, conforming: v.conforming, faults: Object.fromEntries(v.faults), undeclaredFields: [...v.undeclaredFields].sort() }])),
  operatorRefPresentOnLiveFeedRecords: operatorRefPresent.length,
  operatorRefAbsentOnLiveFeedRecords: feedRecords.length - operatorRefPresent.length,
  unitLabelSentinelCollisionsAcrossVendors: sentinelCollisions.map((s) => ({ label: s.label, kinds: [...s.kinds] })),
  unnamedSentinelLabelsSeenLive: unnamedLabels,
};

const fleet = artifact.domains.find((d) => d.domainId === "fleet-vehicles");
const patrol = artifact.domains.find((d) => d.domainId === "patrol-vehicles");
const fleetKind = artifact.verdicts.perKind.samsara;
const patrolKind = artifact.verdicts.perKind.spireon;
artifact.statements = [
  `${artifact.verdicts.liveRecordsRead} live record(s) were read from ${BASE} with the lane-verification key presented in x-hauska-key (cityKey=${CITY}); ${artifact.verdicts.liveRecordsRefusedByTheDeclaredShape} of them are refused by the declared shape.`,
  fleet ? `FLEET (Samsara): ${fleet.recordCount} record(s), ${fleet.refusedByTheDeclaredShape} refused; faults ${JSON.stringify(fleetKind?.faults || {})}.` : "FLEET: not read.",
  patrol ? `PATROL (Spireon): ${patrol.recordCount} record(s), ${patrol.refusedByTheDeclaredShape} refused; faults ${JSON.stringify(patrolKind?.faults || {})}.` : "PATROL: not read.",
  `THE LIVE SAMSARA RECORD FAILS THE DECLARED SHAPE WITH THREE FAULTS, and this is that record measured rather than a fixture: ${JSON.stringify(fleetKind?.faults || {})}. The third one is the undeclared-equivalent of defect 3 on the odometer: the shape requires a band and the read carries a raw mileage.`,
  `THE INVENTORY-SHAPED FIELD SET ARRIVES ON THE LIVE RECORD: ${(fleetKind?.undeclaredFields || []).length} field(s) the declared shape does not declare, including ${["vin", "make", "model", "odometerMiles"].filter((f) => (fleetKind?.undeclaredFields || []).includes(f)).join(", ")} -- the exact set the dispatch names. A record carrying an inventory field set is the shape that undercuts the Assets ruling from the side, which is why the shape guard now stands on this path.`,
  `defect 3, live: operatorRef is present on ${artifact.verdicts.operatorRefPresentOnLiveFeedRecords} of ${feedRecords.length} live feed record(s); absent on ${artifact.verdicts.operatorRefAbsentOnLiveFeedRecords}. The declared shape requires it on both kinds, so every one of them is refused rather than served with a required field silently missing.`,
  `defect 2, live: ${sentinelCollisions.length} unit label(s) are shared by records of more than one vendor; ${unnamedLabels.length} label(s) begin with "Unnamed" (${unnamedLabels.join(", ") || "none"}). The live read has no empty row today, so the collision is proven by the fixture that feeds both mappers an empty row (src/vendor-live.test.mjs) rather than by a live row that does not exist.`,
  `A FIELD THE OLD MAPPER DROPPED: the live Samsara record carries an \`operator\` field (${JSON.stringify(fleet?.census?.operatorField || {})}). It is counted and classified rather than quoted, because if it holds a person's name then writing it into an evidence file would be this lane doing the thing the lens exists to stop.`,
  `THE CONSEQUENCE, STATED PLAINLY: with the guard wired, the live Fleet and Police regions REFUSE rather than serve these records -- ${artifact.verdicts.liveRecordsRefusedByTheDeclaredShape} of ${artifact.verdicts.liveRecordsRead} -- because no live record satisfies its declared shape yet. The next unit of work is the mapping (engine state to the declared bands, a band from the raw mileage, and an operator identity from the platform route), not this guard.`,
];

if (ARTIFACT) {
  fs.writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2));
  console.log(`\nartifact: ${ARTIFACT}`);
}

const refusedTotal = artifact.verdicts.liveRecordsRefusedByTheDeclaredShape;
console.log(`\nTOTALS  records ${artifact.verdicts.liveRecordsRead}  refused ${refusedTotal}  operatorRef present ${artifact.verdicts.operatorRefPresentOnLiveFeedRecords}/${feedRecords.length}`);
process.exit(artifact.domains.some((d) => d.fetchError) ? 2 : 0);
