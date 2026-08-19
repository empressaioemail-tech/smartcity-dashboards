import { composeDomain } from "./fixture-seam.mjs";
import { PERMITS_PIPELINE_DOMAIN } from "./domains/permits-pipeline.mjs";
import { WORK_ORDERS_DOMAIN } from "./domains/work-orders.mjs";
import { FLEET_VEHICLES_DOMAIN } from "./domains/fleet-vehicles.mjs";
import { PATROL_VEHICLES_DOMAIN } from "./domains/patrol-vehicles.mjs";

/* ----------------------------------------------------------- the registry

The list of domains this product knows how to generate. Adding a lens is adding
a FILE under src/domains/ and one line here, which is the whole reason G-91
exists: at G-77 a domain was the shape of src/fixtures.mjs, so a second one
meant editing the file every other lane was also editing.

WHAT ABSENCE FROM THIS LIST MEANS, and it is the only surviving meaning of the
words "not built": the surface does not exist yet. Everything in the list is
built, and its emptiness on a given pack is a statement about SOURCES with a
basis attached (ruling 1, operator-approved 2026-08-19). Those are different
sentences to a customer and this list is the line between them.

Four domains, three adapter kinds, and one of them deliberately ungranted on
template-city so the ungranted state stays reachable and testable rather than
becoming unreachable code.
*/

export const DOMAIN_REGISTRY = Object.freeze([
  PERMITS_PIPELINE_DOMAIN,
  WORK_ORDERS_DOMAIN,
  FLEET_VEHICLES_DOMAIN,
  PATROL_VEHICLES_DOMAIN,
]);

export function listDomains(registry = DOMAIN_REGISTRY) {
  return registry.map((d) => ({
    id: d.id,
    lensId: d.lensId,
    region: d.region,
    gatedBy: d.gatedBy,
    recordType: d.recordType,
  }));
}

export function getDomain(id, registry = DOMAIN_REGISTRY) {
  return registry.find((d) => d.id === id) || null;
}

/**
 * Composes one domain for a pack. A domain id that is not in the registry is a
 * POSITIVE determination with a basis, never a null: "not built" is a real
 * state and it has to be able to say so.
 */
export function composeDomainById(pack, domainId, registry = DOMAIN_REGISTRY) {
  const domain = getDomain(domainId, registry);
  if (!domain) {
    return {
      domainId,
      lensId: null,
      region: null,
      cityKey: pack?.cityKey ?? null,
      status: "not-registered",
      granted: false,
      generated: false,
      basis: `${domainId} is not a registered domain, so this surface is not built`,
      recordCount: 0,
      countingRule: "no records: this surface is not built",
      records: [],
      extras: {},
    };
  }
  return composeDomain(pack, domain);
}

/**
 * The honest map ruling 1 asks for: every region this product can render, and
 * for THIS pack, whether it has a source and why not. Records are deliberately
 * dropped, because the map is about sources and a caller that wants records
 * asks for the domain.
 */
export function composeDomainMap(pack, registry = DOMAIN_REGISTRY) {
  const regions = registry.map((domain) => {
    const out = composeDomain(pack, domain);
    return {
      domainId: out.domainId,
      lensId: out.lensId,
      region: out.region,
      gatedBy: out.gatedBy,
      recordType: out.recordType,
      status: out.status,
      granted: out.granted,
      generated: out.generated,
      basis: out.basis,
      recordCount: out.recordCount,
      countingRule: out.countingRule,
    };
  });
  const withRecords = regions.filter((r) => r.recordCount > 0).length;
  return {
    cityKey: pack.cityKey,
    displayName: pack.displayName,
    environment: pack.environment,
    regions,
    regionCount: regions.length,
    withRecords,
    countingRule: `${withRecords} of ${regions.length} registered domains carry records on ${pack.cityKey}; a registered domain is a built region, and a region absent from the registry is not built and is not counted here`,
  };
}

/** Every registered domain composed in full, keyed by domain id. */
export function composeAllDomains(pack, registry = DOMAIN_REGISTRY) {
  const out = {};
  for (const domain of registry) out[domain.id] = composeDomain(pack, domain);
  return out;
}
