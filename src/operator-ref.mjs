/* ------------------------------------------------------------ operator refs

OPERATOR REFERENCES ARE NAMESPACED BY DOMAIN.

Operator ruling 2026-09-17
(`_decisions/2026-09-17_operator_reference_namespaced_by_domain.md`): Fleet
mints `FL-OPR-nn`, Police mints `PV-OPR-nn`, and a bare `OPR-01` stops being a
valid operator reference anywhere.

WHY THIS IS ONE MODULE RATHER THAN TWO CONSTANTS. The defect it closes was that
`fleet-vehicles.mjs` and `patrol-vehicles.mjs` each declared
`OPERATOR_REF_FORMAT = /^OPR-\d{2}$/` and the byte-identical basis string
INDEPENDENTLY, with no import between them, so two counters over two different
populations minted the same references and nothing in the product said whether
`OPR-01` on each was one person. An operator reference is a pseudonym for a real
person, not a label: a pseudonym shared across two lenses links one employee's
fleet activity to their patrol activity, which is the re-identification that
pseudonymising them exists to prevent. That is a privacy property, not a naming
preference.

Declaring the scheme once makes the collision unrepresentable rather than
documented, which is the form the ruling asked for: the format, the mint and the
test below are one declaration read three ways, so no call site can miss it and
no second format can be written by hand in a domain module.

A reference names no person and carries no cross-lens meaning, and this module
does not change that: it only guarantees that a Fleet reference and a Police
reference cannot be spelled the same way by accident.
*/

/**
 * The prefix each minting domain mints under. A domain that begins minting
 * references adds a row here; `mintOperatorRef` refuses a domain with no row
 * rather than defaulting to a shared prefix, which is the whole point.
 */
export const OPERATOR_REF_PREFIXES = Object.freeze({
  "fleet-vehicles": "FL",
  "patrol-vehicles": "PV",
});

/** The domains this module can mint for, in declaration order. */
export function mintingDomains() {
  return Object.keys(OPERATOR_REF_PREFIXES).sort();
}

function prefixFor(domainId) {
  const prefix = OPERATOR_REF_PREFIXES[domainId];
  if (!prefix) {
    throw new Error(
      `domain ${domainId} has no declared operator-reference prefix; add one to OPERATOR_REF_PREFIXES rather than inventing a format in the domain module`,
    );
  }
  return prefix;
}

/** The declared format, as the regex a domain carries in its `formats` list. */
export function operatorRefFormat(domainId) {
  return new RegExp(`^${prefixFor(domainId)}-OPR-\\d{2}$`);
}

/**
 * Mints the one legal form for a domain. `ordinal` is 1-based and two digits,
 * which is the space the ruling declared; an ordinal outside it is refused
 * rather than rendered, because a silently widened space is how the two
 * namespaces became one in the first place.
 */
export function mintOperatorRef(domainId, ordinal) {
  const prefix = prefixFor(domainId);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 99) {
    throw new Error(`operator reference ordinal for ${domainId} must be an integer 1..99, got ${ordinal}`);
  }
  return `${prefix}-OPR-${String(ordinal).padStart(2, "0")}`;
}

/** True when `value` is a reference this domain may carry. */
export function isOperatorRef(domainId, value) {
  return typeof value === "string" && operatorRefFormat(domainId).test(value);
}
