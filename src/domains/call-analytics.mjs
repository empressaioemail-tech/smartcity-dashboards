import { between, dayLabelFor, defineDomain, fixtureBasisFor, mulberry32 } from "../fixture-seam.mjs";

/* --------------------------------------------------- domain: call analytics

GoTo call handling on the Public works lens, and this domain is the one whose
RECORD IS NOT AN EVENT.

Every other domain in the registry emits one record per thing: a permit, a work
order, a truck, a camera. This one emits one record per QUEUE PER RELATIVE DAY,
because the only honest unit here is an aggregate. The live vendor exposes
call-history — individual calls, with the number that placed them — and an
extension directory that maps a line to the person who answers it. A demo
fixture pack has no business generating either, and the shape declares all three
excluded families in src/adapters.mjs with a basis on each rather than leaving
them merely unbuilt.

The distinction that matters: absent because nobody got to it, versus absent
because it must not exist. Those look identical in code and the shape table is
where they are told apart.

NO CLASS IS DERIVED BY SUBTRACTION. callsAnswered and callsAbandoned are each
drawn from the sequence; callsOffered is their sum. Generating offered and
subtracting answered would make abandoned a residue that can never disagree, and
a figure that cannot disagree cannot be reconciled (DEV_PROCESS 1.3). The
reconciliation in src/department-domains.test.mjs is only meaningful because the
two classes are measured independently.

NO RATE ON THE RECORD. An answer rate is a ratio and a ratio without its
denominator beside it is the figure DEV_PROCESS 1.1 exists to stop. The extras
carry the totals with their counting rule; the lens can divide when it can also
show what it divided.

A QUEUE IS A FUNCTION, NOT A DESK. Queue labels name what the line does. None of
them names a department head, a role holder, or an extension owner.
*/

export const QUEUE_LABEL_VOCABULARY = [
  "Main city line",
  "Permit desk line",
  "Utility billing line",
  "Public works line",
  "Records line",
];

/** Five relative days, matching the daily-slice convention the queue domains set. */
export const CALL_WINDOW_DAYS = 5;

export const CALL_ID_FORMAT = /^FIX-CV-\d{4}$/;
export const QUEUE_REF_FORMAT = /^QUE-\d{2}$/;
export const DAY_LABEL_FORMAT = /^(today|in \d+ days?)$/;

export const CALL_BASIS = fixtureBasisFor("goto");

export const CALL_IDENTITY_BASIS =
  "a generated record carries no call recording, no individual call detail and no mapping from an extension to a person; the unit here is a queue volume and never a call";

export const EXCLUDED_FAMILIES_BASIS =
  "the call-history and extension-directory families are excluded from generation, not merely absent from it; the record shape declares recording, callerRef and extensionOwner as fields a generated record never carries";

export const QUEUE_COUNTING_RULE =
  "generated goto call-volume records whose queueRef equals this queue, summed over the relative window, one bucket per queue per day";

export const DAY_COUNTING_RULE =
  "generated goto call-volume records whose dayOffset equals this day, summed across every queue, one bucket per queue per day";

export const TOTALS_COUNTING_RULE =
  "every generated goto call-volume bucket on this pack; answered and abandoned are each drawn independently and offered is their sum, so no class here is the remainder of another";

export function generateCallRecords({ cityKey, accessPolicy = "public-free", seed = 0 } = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const rand = mulberry32(seed);
  const records = [];
  let seq = 0;
  for (let q = 0; q < QUEUE_LABEL_VOCABULARY.length; q += 1) {
    for (let dayOffset = 0; dayOffset < CALL_WINDOW_DAYS; dayOffset += 1) {
      seq += 1;
      const callsAnswered = between(rand, 12, 140);
      const callsAbandoned = between(rand, 0, 18);
      records.push({
        recordId: `FIX-CV-${String(1000 + seq * 17).padStart(4, "0")}`,
        kind: "goto",
        recordType: "call-volume",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: CALL_BASIS,
        accessPolicy,
        queueRef: `QUE-${String(q + 1).padStart(2, "0")}`,
        queueLabel: QUEUE_LABEL_VOCABULARY[q],
        dayOffset,
        dayLabel: dayLabelFor(dayOffset),
        callsAnswered,
        callsAbandoned,
        callsOffered: callsAnswered + callsAbandoned,
        identityBasis: CALL_IDENTITY_BASIS,
        provenance: {
          source: "GoTo output contract",
          basis: CALL_BASIS,
          readAt: null,
          readAtBasis: "nothing was read; this record was generated",
        },
      });
    }
  }
  records.sort((a, b) => a.recordId.localeCompare(b.recordId));
  return records;
}

function sum(list, key) {
  return list.reduce((total, r) => total + r[key], 0);
}

/** Per queue, summed off the records. */
export function queueVolume(records) {
  const list = Array.isArray(records) ? records : [];
  const refs = [...new Set(list.map((r) => r.queueRef))].sort();
  return refs.map((queueRef) => {
    const bucket = list.filter((r) => r.queueRef === queueRef);
    return {
      queueRef,
      queueLabel: bucket[0]?.queueLabel ?? null,
      callsOffered: sum(bucket, "callsOffered"),
      callsAnswered: sum(bucket, "callsAnswered"),
      callsAbandoned: sum(bucket, "callsAbandoned"),
      bucketCount: bucket.length,
      countingRule: QUEUE_COUNTING_RULE,
    };
  });
}

/** Per relative day, summed off the records. No calendar date is ever printed. */
export function dailyVolume(records) {
  const list = Array.isArray(records) ? records : [];
  const days = [];
  for (let dayOffset = 0; dayOffset < CALL_WINDOW_DAYS; dayOffset += 1) {
    const bucket = list.filter((r) => r.dayOffset === dayOffset);
    days.push({
      dayOffset,
      dayLabel: dayLabelFor(dayOffset),
      callsOffered: sum(bucket, "callsOffered"),
      callsAnswered: sum(bucket, "callsAnswered"),
      callsAbandoned: sum(bucket, "callsAbandoned"),
      bucketCount: bucket.length,
      countingRule: DAY_COUNTING_RULE,
    });
  }
  return days;
}

export function callTotals(records) {
  const list = Array.isArray(records) ? records : [];
  return {
    callsOffered: sum(list, "callsOffered"),
    callsAnswered: sum(list, "callsAnswered"),
    callsAbandoned: sum(list, "callsAbandoned"),
    measured: list.length,
    countingRule: TOTALS_COUNTING_RULE,
  };
}

export const CALL_ANALYTICS_DOMAIN = defineDomain({
  id: "call-analytics",
  lensId: "public-works",
  region: "Call analytics",
  gatedBy: "goto",
  recordType: "call-volume",
  vocabulary: [...QUEUE_LABEL_VOCABULARY, CALL_IDENTITY_BASIS],
  formats: [CALL_ID_FORMAT, QUEUE_REF_FORMAT, DAY_LABEL_FORMAT],
  generate(pack, seedFor) {
    const records = generateCallRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("goto:call-volume"),
    });
    return {
      records,
      extras: {
        queues: queueVolume(records),
        daily: dailyVolume(records),
        totals: callTotals(records),
        excludedFamilies: EXCLUDED_FAMILIES_BASIS,
      },
    };
  },
});
