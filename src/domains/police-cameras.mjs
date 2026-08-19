import { DEVICE_STATUS_VALUES } from "../adapters.mjs";
import {
  PLACE_VOCABULARY,
  between,
  defineDomain,
  fixtureBasisFor,
  mulberry32,
} from "../fixture-seam.mjs";

/* --------------------------------------------------- domain: police cameras

Verkada cameras on the Police lens, and the interesting thing about this domain
is what it does NOT generate.

The live vendor exposes a plate-read family and a persons-of-interest family
alongside cameras, alerts and occupancy analytics. Those two are surveillance
records about identifiable people. They are not generated here, they are not
declared as fields on the shape, and the shape says so positively rather than
leaving them missing: src/adapters.mjs declares plateReads and personsOfInterest
as required:false with a basis, so a later lane reading the contract finds a
stated refusal rather than a gap it might helpfully fill.

The seam's content guard would have rejected a plate string anyway, and that is
the weaker of the two controls. The stronger one is that the contract names the
exclusion, because a guard catches the attempt and a contract prevents it.

OCCUPANCY IS A BAND AND SOMETIMES NOTHING. The analytics family returns a
counted occupancy. A generated head count is a specific claim about a specific
place, so the record carries a band; and a camera whose status means it is not
reporting carries "occupancy not measured", which is an honest absence at the
record level rather than a zero standing in for one.

A CAMERA IS NOT A CITY INVENTORY NODE. Same rule fleet telemetry carries: G-24
stays at zero and vendor device telemetry is the standing example of the thing
that looks like it should fill an inventory and must not.
*/

export const CAMERA_FAMILIES = [
  "Dome",
  "Bullet",
  "Fisheye",
  "Multisensor",
  "Doorway",
  "Mobile trailer",
];

/**
 * Bands, not counts. The first entry is the honest absence and it is first
 * deliberately: a camera that is not reporting has no occupancy, and the band
 * list has to be able to say that without printing a zero.
 */
export const OCCUPANCY_BANDS = ["occupancy not measured", "light", "moderate", "busy"];

export const CAMERA_FIXTURE_PLAN = [
  { status: "offline", count: 1 },
  { status: "signal-loss", count: 2 },
  { status: "firmware-due", count: 3 },
  { status: "online", count: 12 },
];

/** How many opaque sites the inventory groups across. */
export const SITE_COUNT = 5;

export const CAMERA_ID_FORMAT = /^FIX-CAM-\d{4}$/;
export const DEVICE_LABEL_FORMAT = /^[A-Z][A-Za-z ]+ camera \d{2}$/;
export const SITE_REF_FORMAT = /^SITE-\d{2}$/;

export const CAMERA_BASIS = fixtureBasisFor("verkada");

export const CAMERA_IDENTITY_BASIS =
  "a generated record carries no plate read and no person of interest; those are surveillance records about identifiable people and a fixture pack does not carry one";

export const NOT_AN_INVENTORY_NODE_BASIS =
  "vendor camera telemetry is not a city-owned inventory node, so nothing here counts toward the city inventory";

export const EXCLUDED_FAMILIES_BASIS =
  "the plate-read and persons-of-interest families are excluded from generation, not merely absent from it; the record shape declares both as fields a generated record never carries";

export const SITE_COUNTING_RULE =
  "cameras whose siteRef equals this site, over the generated verkada camera-device records on this pack, one row per record";

/** A status that is not reporting has no occupancy to band. */
const REPORTING_STATUSES = ["firmware-due", "online"];

function severityRank(statusId) {
  const value = DEVICE_STATUS_VALUES.find((s) => s.id === statusId);
  return ["crit", "warn", "info", "ok", "quiet"].indexOf(value?.severity || "quiet");
}

/**
 * The sites, derived once so a site's placement is stable across every camera
 * mounted on it. Drawing the placement per record would let one site render
 * under three different names, which is a data defect the eye catches before any
 * test does.
 */
export function cameraSites(seed = 0) {
  const rand = mulberry32(seed);
  const sites = [];
  for (let i = 0; i < SITE_COUNT; i += 1) {
    sites.push({
      siteRef: `SITE-${String(i + 1).padStart(2, "0")}`,
      placement: PLACE_VOCABULARY[(i + between(rand, 0, PLACE_VOCABULARY.length - 1)) % PLACE_VOCABULARY.length],
    });
  }
  return sites;
}

export function generateCameraRecords({ cityKey, accessPolicy = "public-free", seed = 0 } = {}) {
  if (!cityKey) throw new Error("fixture generation requires a cityKey");
  const rand = mulberry32(seed);
  const sites = cameraSites(seed);
  const familyStart = seed % CAMERA_FAMILIES.length;
  const FAMILY_STRIDE = 5;
  const records = [];
  let seq = 0;
  for (const row of CAMERA_FIXTURE_PLAN) {
    for (let i = 0; i < row.count; i += 1) {
      seq += 1;
      const site = sites[(seq - 1) % sites.length];
      const family = CAMERA_FAMILIES[(familyStart + (seq - 1) * FAMILY_STRIDE) % CAMERA_FAMILIES.length];
      const reporting = REPORTING_STATUSES.includes(row.status);
      const bandIndex = reporting ? between(rand, 1, OCCUPANCY_BANDS.length - 1) : 0;
      records.push({
        recordId: `FIX-CAM-${String(1000 + seq * 7).padStart(4, "0")}`,
        kind: "verkada",
        recordType: "camera-device",
        cityKey,
        origin: "fixture",
        fixture: true,
        fixtureBasis: CAMERA_BASIS,
        accessPolicy,
        deviceLabel: `${family} camera ${String(10 + seq).padStart(2, "0")}`,
        status: row.status,
        siteRef: site.siteRef,
        placement: site.placement,
        occupancyBand: OCCUPANCY_BANDS[bandIndex],
        identityBasis: CAMERA_IDENTITY_BASIS,
        inventoryBasis: NOT_AN_INVENTORY_NODE_BASIS,
        provenance: {
          source: "Verkada output contract",
          basis: CAMERA_BASIS,
          readAt: null,
          readAtBasis: "nothing was read; this record was generated",
        },
      });
    }
  }
  records.sort((a, b) => {
    const rank = severityRank(a.status) - severityRank(b.status);
    if (rank !== 0) return rank;
    return a.recordId.localeCompare(b.recordId);
  });
  return records;
}

/** The status tiles, counted off the records. */
export function cameraMetrics(records) {
  const list = Array.isArray(records) ? records : [];
  return DEVICE_STATUS_VALUES.map((status) => ({
    id: status.id,
    label: status.label,
    severity: status.severity,
    resolved: status.resolved,
    count: list.filter((r) => r.status === status.id).length,
    countingRule:
      "cameras whose status equals this tile, over the generated verkada camera-device records on this pack",
  }));
}

/** The site dimension, counted off the records. */
export function siteRoster(records) {
  const list = Array.isArray(records) ? records : [];
  const refs = [...new Set(list.map((r) => r.siteRef))].sort();
  return refs.map((siteRef) => ({
    siteRef,
    placement: list.find((r) => r.siteRef === siteRef)?.placement ?? null,
    cameraCount: list.filter((r) => r.siteRef === siteRef).length,
    countingRule: SITE_COUNTING_RULE,
  }));
}

/**
 * The occupancy dimension, three MEASURED classes and never two plus a
 * subtraction. A camera that reports and a camera that cannot are different
 * facts, so "not measured" is counted rather than inferred from the remainder.
 */
export function occupancySummary(records) {
  const list = Array.isArray(records) ? records : [];
  const inBand = (band) => list.filter((r) => r.occupancyBand === band).length;
  return {
    bands: OCCUPANCY_BANDS.map((band) => ({
      band,
      count: inBand(band),
      countingRule:
        "cameras whose occupancyBand equals this band, over the generated verkada camera-device records on this pack",
    })),
    measured: list.length,
    countingRule:
      "every generated verkada camera-device record on this pack falls in exactly one band, and the not-measured band is counted rather than derived",
  };
}

export const POLICE_CAMERAS_DOMAIN = defineDomain({
  id: "police-cameras",
  lensId: "police",
  region: "Camera inventory",
  gatedBy: "verkada",
  recordType: "camera-device",
  vocabulary: [
    ...DEVICE_STATUS_VALUES.map((s) => s.id),
    ...OCCUPANCY_BANDS,
    ...PLACE_VOCABULARY,
    CAMERA_IDENTITY_BASIS,
    NOT_AN_INVENTORY_NODE_BASIS,
  ],
  formats: [CAMERA_ID_FORMAT, DEVICE_LABEL_FORMAT, SITE_REF_FORMAT],
  generate(pack, seedFor) {
    const records = generateCameraRecords({
      cityKey: pack.cityKey,
      accessPolicy: pack.accessPolicy,
      seed: seedFor("verkada:camera-device"),
    });
    return {
      records,
      extras: {
        metrics: cameraMetrics(records),
        sites: siteRoster(records),
        occupancy: occupancySummary(records),
        excludedFamilies: EXCLUDED_FAMILIES_BASIS,
        inventoryBasis: NOT_AN_INVENTORY_NODE_BASIS,
      },
    };
  },
});
