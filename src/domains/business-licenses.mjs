import { LICENSE_STATUS_VALUES } from "../adapters.mjs";
import {
  PLACE_LABEL_FORMAT,
  PLACE_VOCABULARY,
  between,
  defineDomain,
  fixtureBasisFor,
  mulberry32,
  pick,
} from "../fixture-seam.mjs";

/* -------------------------------------------------- domain: business licences

Live `mygov/business-licenses`, the third of the sixteen MyGov endpoints this
product could not express. On the production Bastrop dashboard it is the
Business Licenses tab - a licence roll - and `Expiring` is one of the six hero
metrics that sets a tab plus a filter
(_inbox/2026-08-17_bastrop_dashboard_layout_inventory.md, layout 3). 30c folds
those six heroes to four and makes Expiring a stage filter, which is why the
expiry dimension here is a set of BANDS rather than a headline number.

The shape this domain exists to prove is a ROLL WITH A CONTINUOUS SECOND AXIS.
The queue domains band on a status the plan declares; expiry is an integer that
exists on every record, and the bands are derived from it rather than assigned.
That means the band boundaries are the only thing that has to be right, and a
record that fell outside every band would show up as a reconciliation failure
rather than being silently absorbed.

A LICENSEE IS A BUSINESS, which is a real-world entity with a real name, so this
domain holds one off exactly as the fleet roster holds a driver off a vehicle:
an opaque holder reference under a declared format, and the record states why the
name is absent. The alternative - inventing plausible business names - would put
fabricated commercial entities on a demo surface, and a fixture that has to be
explained is a fixture that will be believed.

Nothing here prints a charge. A licence renewal has one on any real system and
this product has read no ledger, so the absence is stated with a basis.
*/

export const LICENSE_CATEGORY_VOCABULARY = [
  "Food establishment",
  "Mobile food vendor",
  "General contractor registration",
  "Electrical contractor registration",
  "Plumbing contractor registration",
  "Short term rental",
  "Solicitor registration",
  "Alarm registration",
  "Child care facility",
  "Salon and barber",
];

/**
 * The declared roll. The expiry window is declared as a RANGE per status rather
 * than drawn free, so every band below is guaranteed to be populated on the
 * shipped pack: a band that is empty because a random draw missed it is a band
 * nobody has ever seen render.
 */
export const LICENSE_FIXTURE_PLAN = [
  { status: "expired", count: 2, expiryFrom: -45, expiryTo: -3 },
  { status: "expiring", count: 4, expiryFrom: 0, expiryTo: 29 },
  { status: "renewal-submitted", count: 3, expiryFrom: 34, expiryTo: 88 },
  { status: "active", count: 8, expiryFrom: 96, expiryTo: 330 },
];

/**
 * The expiry dimension. `from` and `to` are inclusive and null is open-ended,
 * and the bands are declared as data so expiryWindowFor and the ladder that
 * renders them read the same source - one rule with one implementation.
 */
export const EXPIRY_WINDOWS = [
  { id: "expired", label: "Expired", severity: "crit", from: null, to: -1 },
  { id: "within-30", label: "Within 30 days", severity: "warn", from: 0, to: 30 },
  { id: "within-90", label: "Within 90 days", severity: "info", from: 31, to: 90 },
  { id: "beyond-90", label: "Beyond 90 days", severity: "ok", from: 91, to: null },
];

/** How many opaque holders the roll groups across. */
export const HOLDER_COUNT = 9;

export const LICENSE_ID_FORMAT = /^FIX-BL-\d{4}$/;
export const HOLDER_REF_FORMAT = /^HLD-\d{2}$/;
export const EXPIRY_LABEL_FORMAT = /^(expires today|expires in \d+ days?|expired \d+ days? ago)$/;

export const LICENSE_BASIS = fixtureBasisFor("mygov");

export const HOLDER_BASIS =
  "a generated record names no business; the holder is an opaque reference and a granted feed is where a name would come from";

export const CHARGES_BASIS =
  "a generated record presents no renewal charge; a granted feed and a city ledger are where one would come from";

export const EXPIRY_WINDOW_COUNTING_RULE =
  "licences whose expiryOffsetDays falls in this band, over the generated mygov business-license records on this pack, one row per record; bands are inclusive and do not overlap";

/**
 * Relative expiry phrasing. No calendar date is invented or printed, in either
 * direction, which is what keeps a screenshot of this roll from going stale.
 */
export function expiryLabelFor(offsetDays) {
  if (!Number.isInteger(offsetDays)) {
    throw new Error("an expiry label requires an integer offset");
  }
  if (offsetDays === 0) return "expires today";
  if (offsetDays > 0) {
    return offsetDays === 1 ? "expires in 1 day" : `expires in ${offsetDays} days`;
  }
  const n = Math.abs(offsetDays);
  return n === 1 ? "expired 1 day ago" : `expired ${n} days ago`;
}

/**
 * Which band an offset falls in. Returns null for a non-integer rather than
 * guessing, so a malformed record is a finding at the reconciliation rather than
 * a quiet member of whichever band was checked last.
 */
export function expiryWindowFor(offsetDays) {
  if (!Number.isInteger(offsetDays)) return null;
  return (
    EXPIRY_WINDOWS.find(
      (w) =>
        (w.from === null || offsetDays >= w.from) && (w.to === null || offsetDays <= w.to),
    ) || null
  );
}

function severityRank(statusId) {
  const value = LICENSE_STATUS_VALUES.find((s) => s.id === statusId);
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(value?.severity || "quiet");
}

/** The roll. Every extra below counts THIS array. */
export function generateBusinessLicenseRecords({
  cityKey,
  accessPolicy = "public-free",
  seed = 0,
} = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const rand = mulberry32(seed);
  const categoryStart = seed % LICENSE_CATEGORY_VOCABULARY.length;
  const CATEGORY_STRIDE = 3;
  const records = [];
  let seq = 0;
  for (const row of LICENSE_FIXTURE_PLAN) {
    if (!LICENSE_STATUS_VALUES.some((s) => s.id === row.status)) {
      throw new Error(`no licence status declared for ${row.status}`);
    }
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const expiryOffsetDays = between(rand, row.expiryFrom, row.expiryTo);
      records.push({
        recordId: `FIX-BL-${String(1000 + seq * 6).padStart(4, "0")}`,
        kind: "mygov",
        recordType: "business-license",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: LICENSE_BASIS,
        accessPolicy,
        licenseCategory:
          LICENSE_CATEGORY_VOCABULARY[
            (categoryStart + (seq - 1) * CATEGORY_STRIDE) % LICENSE_CATEGORY_VOCABULARY.length
          ],
        status: row.status,
        place: {
          label: `${pick(rand, PLACE_VOCABULARY)} Block ${between(rand, 1, 9)}, Lot ${between(rand, 1, 40)}`,
          parcelNodeId: null,
          parcelBasis:
            "a generated record is not attached to a parcel, because a parcel is a real record",
        },
        holderRef: `HLD-${String(1 + ((seq - 1) % HOLDER_COUNT)).padStart(2, "0")}`,
        holderBasis: HOLDER_BASIS,
        expiryOffsetDays,
        expiryLabel: expiryLabelFor(expiryOffsetDays),
        chargesBasis: CHARGES_BASIS,
        provenance: {
          source: "MyGov output contract",
          basis: LICENSE_BASIS,
          readAt: null,
          readAtBasis: "nothing was read; this record was generated",
        },
      });
    }
  }
  records.sort((a, b) => {
    const rank = severityRank(a.status) - severityRank(b.status);
    if (rank !== 0) return rank;
    if (a.expiryOffsetDays !== b.expiryOffsetDays) return a.expiryOffsetDays - b.expiryOffsetDays;
    return a.recordId.localeCompare(b.recordId);
  });
  return records;
}

/** The status tiles, counted off the records. */
export function licenseMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return LICENSE_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule:
      "licences whose status equals this tile, over the generated mygov business-license records on this pack",
  }));
}

/**
 * The expiry dimension, counted off the records through the same
 * expiryWindowFor the record-level assertions use. Four measured classes and no
 * remainder bucket: a record matching no band is counted nowhere and the
 * reconciliation in the tests goes red, which is the behaviour a remainder
 * bucket would destroy.
 */
export function expiryWindows(records) {
  const list = Array.isArray(records) ? records : [];
  return EXPIRY_WINDOWS.map((window) => ({
    id: window.id,
    label: window.label,
    severity: window.severity,
    from: window.from,
    to: window.to,
    count: list.filter((r) => expiryWindowFor(r.expiryOffsetDays)?.id === window.id).length,
    countingRule: EXPIRY_WINDOW_COUNTING_RULE,
  }));
}

export const BUSINESS_LICENSES_DOMAIN = defineDomain({
  id: "business-licenses",
  lensId: "development-services",
  region: "Licenses",
  tab: "licenses",
  gatedBy: "mygov",
  recordType: "business-license",
  vocabulary: [
    ...LICENSE_CATEGORY_VOCABULARY,
    ...PLACE_VOCABULARY,
    ...LICENSE_STATUS_VALUES.map((s) => s.id),
    HOLDER_BASIS,
    CHARGES_BASIS,
  ],
  formats: [LICENSE_ID_FORMAT, PLACE_LABEL_FORMAT, HOLDER_REF_FORMAT, EXPIRY_LABEL_FORMAT],
  generate(pack, seedFor) {
    const records = generateBusinessLicenseRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("mygov:business-license"),
    });
    return {
      records,
      extras: {
        metrics: licenseMetrics(records),
        expiry: expiryWindows(records),
        chargesBasis: CHARGES_BASIS,
      },
    };
  },
});
