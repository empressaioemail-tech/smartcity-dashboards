import { adapterKindById, assertRecordShape } from "./adapters.mjs";

/* -------------------------------------------------------------- fixture seam

The mechanism a domain plugs into, extracted from src/fixtures.mjs at G-91 so
that adding a lens is adding a FILE plus one registry line, never an edit to the
generator everybody else is also editing.

Three things this file is not. It is not a feed: nothing here reads a city, a
vendor, or a network. It is not seeded from any city's rows. It is not a claim:
every record it emits carries origin fixture and fixture true in the payload, so
a record that escapes its surface still says what it is.

The seam exists to make two properties STRUCTURAL rather than remembered.

1. THE GUARDS CANNOT BE SKIPPED. A domain generator RETURNS records. It never
   calls a guard, because composeDomain runs every guard over what the generator
   returned. A wave-2 lane that forgets to validate cannot forget, having never
   been given the opportunity. That is DEV_PROCESS section 0 applied to this
   file: a control that depends on someone remembering is not a control.

2. DETERMINISM IS DERIVED, NOT PROMISED. Seeds come from the pack key through
   seedFor. No clock and no Math.random reaches a generator, and
   src/domains.test.mjs scans this file and every file under src/domains/ for
   both, so the rule is measured at source and not only at runtime.
*/

/** The one parcel this product presents as a demo fixture. Nothing else. */
export const DEMO_FIXTURE_PARCELS = ["48021:34137"];

/** Invented place names. No street, no number, no real subdivision. */
export const PLACE_VOCABULARY = [
  "Template Commons",
  "Fixture Ridge",
  "Example Crossing",
  "Sample Bend",
  "Placeholder Heights",
  "Specimen Yard",
];

export const RECORD_ID_FORMAT = /^FIX-\d{4}$/;
export const PLACE_LABEL_FORMAT = /^[A-Z][A-Za-z ]+ Block \d+, Lot \d+$/;

/**
 * The formats every domain gets for free. A domain adds its own rather than
 * widening these, so one lens loosening a rule cannot loosen it for the others.
 */
export const DEFAULT_FORMATS = [RECORD_ID_FORMAT, PLACE_LABEL_FORMAT];

/* ----------------------------------------------------------- deterministic */

export function fnv1a(seed) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32. Same seed, same sequence, on every machine and every run. */
export function mulberry32(a) {
  let t = a >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rand, list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

export function between(rand, from, to) {
  return from + Math.floor(rand() * (to - from + 1));
}

/**
 * The only way a domain gets a seed, and it is a pure function of the pack key
 * and a label the domain chooses. Every domain on one pack therefore derives
 * from the SAME pack identity, which is what makes a city's whole data set
 * stable across reloads rather than four generators being stable separately.
 *
 * The label is the domain's own, so two domains on one pack do not draw the
 * same sequence, and the pipeline's historical label is preserved exactly so
 * the fourteen records that shipped at G-77 do not move.
 */
export function seedFactoryFor(pack) {
  const cityKey = String(pack?.cityKey || "").trim();
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  return function seedFor(label) {
    return fnv1a(`${cityKey}:${label}`);
  };
}

/** Relative due phrasing. No calendar date is ever invented or printed. */
export function dueLabelFor(offsetDays) {
  if (offsetDays < 0) {
    const n = Math.abs(offsetDays);
    return n === 1 ? "1 day past due" : `${n} days past due`;
  }
  if (offsetDays === 0) return "due today";
  return offsetDays === 1 ? "due in 1 day" : `due in ${offsetDays} days`;
}

/** Relative day phrasing for a daily slice. Same reason: a screenshot cannot go stale. */
export function dayLabelFor(offsetDays) {
  if (offsetDays === 0) return "today";
  return offsetDays === 1 ? "in 1 day" : `in ${offsetDays} days`;
}

/* ------------------------------------------------------------ content gate */

const FORBIDDEN_CONTENT = [
  {
    id: "street-address",
    // Labelling gate item 3: no real street address.
    re: /\b\d+\s+[A-Za-z]+\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|way|ct|court|cir|circle|trail|hwy|highway|pkwy|parkway)\b/i,
    says: "a generated record carries no street address",
  },
  {
    id: "money",
    // Labelling gate item 4: no money collected, no payment completed.
    re: /\$\s?\d|\b\d+(\.\d{2})?\s?(usd|dollars)\b|\bpaid\b|\bpayment (complete|completed|received)\b|\bfees? collected\b/i,
    says: "a generated record presents no money and no completed payment",
  },
  {
    id: "vendor-account",
    re: /\b(account|acct|customer)[-_ ]?(id|number|no)?[-_ :#]*\d{4,}/i,
    says: "a generated record carries no vendor account identifier",
  },
  {
    id: "held-identity",
    // The identities G-74 holds off this pack, plus staff names seen in the
    // live Bastrop surface. Named needles, not a guess.
    re: /\bbastrop\b|\bchristy hunn\b|\bsylvia\b|\bchestnut\b/i,
    says: "a generated record carries no held city identity and no real person",
  },
  {
    id: "invented-freshness",
    /**
     * Added at G-91. The visual law forbids these three strings anywhere, and
     * until now nothing stopped a GENERATOR from writing one into a basis line
     * where the markup gates could never see it, because the markup gates read
     * web/index.html and a composed payload is not markup. A domain that wants
     * to say when something was read has to say it was not read.
     */
    re: /\blast (sync|synced|read|updated)\b/i,
    says: "a generated record invents no freshness",
  },
];

const FORBIDDEN_KEYS = [
  "confidence",
  "assignee",
  "reviewer",
  "staff",
  "vendorAccountId",
  "amount",
  "fee",
];

const PARCEL_RE = /\b\d{5}:[A-Za-z0-9._-]+\b/g;

function walkStrings(value, path, visit) {
  if (typeof value === "string") {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(k)) {
        throw new Error(`a generated record carries no ${k} field`);
      }
      walkStrings(v, path ? `${path}.${k}` : k, visit);
    }
  }
}

/**
 * The labelling gate in code. Runs over every generated record AND over every
 * domain's extras, and is proven able to fire in src/domains.test.mjs against a
 * throwaway domain carrying each forbidden class. A gate nobody has watched fail
 * is not a gate.
 */
export function assertNoRealWorldContent(record) {
  walkStrings(record, "", (text, path) => {
    for (const rule of FORBIDDEN_CONTENT) {
      if (rule.re.test(text)) {
        throw new Error(`${rule.says} (${rule.id} at ${path || "record"})`);
      }
    }
    const parcels = text.match(PARCEL_RE) || [];
    for (const parcel of parcels) {
      if (!DEMO_FIXTURE_PARCELS.includes(parcel)) {
        throw new Error(
          `a generated record carries no parcel outside the demo fixture range (${parcel} at ${path || "record"})`,
        );
      }
    }
  });
  return true;
}

/**
 * The envelope strings a record is allowed to carry because it wrote them about
 * ITSELF. Split out from the vocabulary so a domain declares only its own
 * content and cannot accidentally widen the envelope.
 */
function selfDescribing(record) {
  return [
    record.kind,
    record.recordType,
    record.cityKey,
    record.origin,
    record.accessPolicy,
    record.fixtureBasis,
    record.provenance?.source,
    record.provenance?.basis,
    record.provenance?.readAtBasis,
    record.place?.parcelBasis,
  ].filter((s) => typeof s === "string");
}

/**
 * Every string on a generated record traces to the DOMAIN's declared vocabulary
 * or to a declared format. This is the structural half of gate item 3: a value
 * cannot appear unless it was declared, so the gate does not depend on a needle
 * list being complete.
 *
 * The vocabulary is per domain rather than global, which is the G-91 change. A
 * global list would mean every wave-2 lens widening one shared set until it
 * permitted everything, which is a gate dying of success.
 */
export function assertDeclaredVocabulary(record, vocabulary = [], formats = DEFAULT_FORMATS) {
  const allowed = new Set([...vocabulary, ...selfDescribing(record)]);
  walkStrings(record, "", (text, path) => {
    if (allowed.has(text)) return;
    for (const format of formats) if (format.test(text)) return;
    throw new Error(`undeclared string on a generated record: ${text} at ${path || "record"}`);
  });
  return true;
}

/* ------------------------------------------------------------ the registry */

/**
 * The four states a region can be in, and they are four because collapsing any
 * pair re-creates the defect ruling 1 exists to close.
 *
 * ungranted and granted-empty are the pair that matters most: "this city has
 * not granted MyGov" and "this city granted MyGov and it returned nothing" are
 * different sentences to a customer, and a single "empty" says neither.
 *
 * A domain that is NOT in the registry is the fifth state and it has no entry
 * here on purpose: absent from the registry means the surface does not exist,
 * which is the only surviving meaning of Not built.
 */
export const DOMAIN_STATUSES = ["ok", "granted-empty", "ungranted", "no-fixture-source"];

export function assertDomainShape(domain) {
  if (!domain || typeof domain !== "object") throw new Error("a domain requires an object");
  for (const field of ["id", "lensId", "region", "gatedBy", "recordType"]) {
    if (typeof domain[field] !== "string" || !domain[field].trim()) {
      throw new Error(`a domain requires ${field}`);
    }
  }
  if (!adapterKindById(domain.gatedBy)) {
    throw new Error(`domain ${domain.id} is gated by ${domain.gatedBy}, which is not a catalogued adapter kind`);
  }
  if (typeof domain.generate !== "function") {
    throw new Error(`domain ${domain.id} requires a generate function`);
  }
  if (!Array.isArray(domain.vocabulary)) {
    throw new Error(`domain ${domain.id} requires a declared vocabulary[]`);
  }
  if (domain.formats !== undefined && !Array.isArray(domain.formats)) {
    throw new Error(`domain ${domain.id} formats must be an array of regexes`);
  }
  return true;
}

/** Declares a domain. Validated at module load, so a malformed one never registers. */
export function defineDomain(spec) {
  const domain = { formats: DEFAULT_FORMATS, ...spec };
  assertDomainShape(domain);
  return Object.freeze(domain);
}

/* -------------------------------------------------------------- the compose */

/**
 * The adapter kinds a pack DEMONSTRATES, which is a different axis from the
 * adapter kinds it has GRANTED.
 *
 * grantedAdapters is a list of live feed grants, each carrying an https
 * sourceUrl, and assertCityPackShape forbids a generating pack from carrying
 * any: a pack is a demo or a connected city, never both, which is the identity
 * collapse G-74 closed. fixtureGrants is the demo-side axis and connects
 * nothing. Keeping them separate is what lets a region say "built, and this
 * city has no source for it" without the product ever claiming a feed.
 *
 * A pack that declares no fixtureGrants demonstrates nothing. That is a stated
 * rule and not a silent default: it is asserted in src/city-pack.test.mjs.
 */
export function packFixtureGrants(pack) {
  return Array.isArray(pack?.fixtureGrants) ? pack.fixtureGrants : [];
}

function kindLabel(kindId) {
  return adapterKindById(kindId)?.displayName || kindId;
}

export function fixtureBasisFor(kindId) {
  return `generated from the ${kindLabel(kindId)} adapter output contract; no city rows were read`;
}

function absence(domain, pack, status, basis) {
  return {
    domainId: domain.id,
    lensId: domain.lensId,
    region: domain.region,
    cityKey: pack.cityKey,
    displayName: pack.displayName,
    environment: pack.environment,
    kind: domain.gatedBy,
    recordType: domain.recordType,
    gatedBy: domain.gatedBy,
    granted: status === "granted-empty",
    generated: status !== "no-fixture-source",
    status,
    basis,
    recordCount: 0,
    countingRule: `no records: ${basis}`,
    records: [],
    extras: {},
  };
}

/**
 * THE SEAM. Resolves the pack's two axes, calls the generator at most once, and
 * then runs every guard over everything the generator returned.
 *
 * Note the order: the guards run AFTER the generator and OUTSIDE it. A
 * generator has no way to hand back a record the guards did not see, and a
 * generator that returns something that is not an array of objects fails here
 * rather than shipping a malformed payload to a lens.
 */
export function composeDomain(pack, domain) {
  if (!pack || typeof pack.cityKey !== "string" || !pack.cityKey) {
    throw new Error("compose requires a pack");
  }
  assertDomainShape(domain);

  if (pack.generatesFixtures !== true) {
    return absence(
      domain,
      pack,
      "no-fixture-source",
      `${pack.cityKey} generates no records and no adapter is granted on it`,
    );
  }

  const grants = packFixtureGrants(pack);
  if (!grants.includes(domain.gatedBy)) {
    /**
     * RULING 1 in code. The region is BUILT; what is absent is a source. The
     * sentence deliberately says the region exists, because "not built" and
     * "no data for your city" are the two customer sentences this product could
     * not previously tell apart.
     */
    return absence(
      domain,
      pack,
      "ungranted",
      `${kindLabel(domain.gatedBy)} is not granted on ${pack.cityKey}; the ${domain.region} region is built and has no source`,
    );
  }

  const seedFor = seedFactoryFor(pack);
  const produced = domain.generate(pack, seedFor) || {};
  const records = produced.records;
  if (!Array.isArray(records)) {
    throw new Error(`domain ${domain.id} returned no records array`);
  }
  const extras = produced.extras && typeof produced.extras === "object" ? produced.extras : {};

  for (const record of records) {
    if (!record || typeof record !== "object") {
      throw new Error(`domain ${domain.id} returned a record that is not an object`);
    }
    if (record.kind !== domain.gatedBy) {
      throw new Error(`domain ${domain.id} returned a ${record.kind} record but is gated by ${domain.gatedBy}`);
    }
    if (record.recordType !== domain.recordType) {
      throw new Error(`domain ${domain.id} returned a ${record.recordType} record but declares ${domain.recordType}`);
    }
    if (record.cityKey !== pack.cityKey) {
      throw new Error(`domain ${domain.id} returned a record for ${record.cityKey} on pack ${pack.cityKey}`);
    }
    assertRecordShape(record);
    assertNoRealWorldContent(record);
    assertDeclaredVocabulary(record, domain.vocabulary, domain.formats);
  }
  /**
   * The extras get the CONTENT guard but not the vocabulary guard, and the
   * asymmetry is stated here where it is read: extras carry counting rules,
   * which are prose by design and cannot be enumerated. Guarding records only
   * would leave a hole a real city name walks straight through, since an sla
   * block or a daily slice is as visible on a lens as a record is.
   */
  assertNoRealWorldContent(extras);

  if (records.length === 0) {
    return {
      ...absence(
        domain,
        pack,
        "granted-empty",
        `${kindLabel(domain.gatedBy)} is granted on ${pack.cityKey} and produced no ${domain.recordType} records`,
      ),
      extras,
    };
  }

  return {
    domainId: domain.id,
    lensId: domain.lensId,
    region: domain.region,
    cityKey: pack.cityKey,
    displayName: pack.displayName,
    environment: pack.environment,
    kind: domain.gatedBy,
    recordType: domain.recordType,
    gatedBy: domain.gatedBy,
    granted: true,
    generated: true,
    status: "ok",
    basis: fixtureBasisFor(domain.gatedBy),
    recordCount: records.length,
    countingRule: `${records.length} generated ${domain.gatedBy} ${domain.recordType} records on ${pack.cityKey}, one row per record`,
    records,
    extras,
  };
}
