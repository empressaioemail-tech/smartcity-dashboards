/**
 * ---------------------------------------------------------------------------
 * WHAT MAY BE NAMED IN A CELL, AND WHAT MAY ONLY BE REFERENCED (G-154).
 *
 * WHY THIS FILE EXISTS. Three of this product's live MyGov fields carry a
 * human's name as free text, and all three reach, or could reach, a cell that
 * sits immediately beside a street address:
 *
 *   permits-pipeline  row.applicant   -> the Pipeline "Applicant" column
 *   business-licenses row.businessName-> the Licenses "Holder" column
 *   code-violations   row.assignedOfficer, inspections row.inspector
 *                                     -> the Officer and Inspector columns
 *
 * The design folder `_design/smartcity-dev-services` is the authority on what
 * those cells draw, and it draws an opaque reference in every one of them:
 * `APP-01` on Pipeline, `HLD-01` on Licenses, `OFF-01` and `INS-01` on the two
 * staff columns. The product had already ruled the same way one tab over, in
 * src/domains/inspections.mjs, and the sentence is the doctrine this module
 * implements:
 *
 *   > The inspector load table is then still buildable, which is the point:
 *   > the dimension survives, the person does not.
 *
 * WHY NOT A SHAPE TEST. The obvious rule - render a name unless it LOOKS like a
 * person - does not survive contact with the real strings. The capture this
 * design was drawn from carries
 *
 *   DEBORAH MOORE, PH#737-762-6252
 *   LISA BOE - CONTACT#: 504-401-1765
 *
 * and "DEBORAH MOORE, PH#737-762-6252" is neither an all-caps name pair nor an
 * initial-led name, so a regex tuned to either would keep it. In the other
 * direction "Hill Country Homes" and "Deborah Ann Moore" have the SAME shape, so
 * any test that keeps the first and drops the second is a guess wearing a rule's
 * clothes, and a business whitelist that can tell them apart is a hand-written
 * word list that goes stale the first time a city licenses something new.
 *
 * So the rule is not a classifier. It is a REFUSAL with a deterministic
 * reference in its place, which is the same move this product already makes for
 * the vendor's free-text `description` field (G-123): the free-text field backs
 * no rendered cell, and the record states why.
 * ---------------------------------------------------------------------------
 */

/**
 * A reference format per dimension, matching the one the design folder's
 * artboards and this product's own fixture generators already use. Reusing the
 * format is what makes a live read and a fixture read render one vocabulary
 * rather than two.
 */
export const REF_PREFIX = {
  applicant: "APP",
  holder: "HLD",
  officer: "OFF",
  inspector: "INS",
  manager: "MGR",
};

export const refFormat = (prefix) => new RegExp(`^${prefix}-\\d{2,}$`);

/**
 * The basis sentence that travels with a refused name, so the absence is stated
 * on the record rather than being a blank a reader has to interpret. It names
 * the field it is about, because "the applicant is not named here" and "the
 * officer is not named here" are different claims about different people.
 */
export function refusalBasis(dimension, field) {
  return `the ${dimension} is an opaque reference; ${field} is the vendor's free-text field and is not rendered on this surface, because a name beside an address is published to every department`;
}

/**
 * Deterministic references for a population of refused names.
 *
 * COUNTING RULE: the DISTINCT non-empty values, sorted, numbered from 01. Sorted
 * rather than first-appearance, because first-appearance would renumber every
 * reference the moment the feed returned its rows in a different order, and a
 * reference that changes between two reads of the same record is not a
 * reference. Nothing about the name is recoverable from the number, and the
 * mapping is not returned to a caller that could render it.
 */
export function opaqueRefs(dimension, values) {
  const prefix = REF_PREFIX[dimension];
  if (!prefix) throw new Error(`no reference format declared for ${dimension}`);
  const distinct = [...new Set(values.filter((v) => typeof v === "string" && v.trim()))].sort();
  return new Map(
    distinct.map((value, i) => [value, `${prefix}-${String(i + 1).padStart(2, "0")}`]),
  );
}

/**
 * The number of distinct values a dimension held, for a caller that wants to
 * state the population beside the refusal. Zero is a real answer here: a feed
 * that named nobody has nothing to refuse.
 */
export function refusedCount(values) {
  return new Set(values.filter((v) => typeof v === "string" && v.trim())).size;
}
