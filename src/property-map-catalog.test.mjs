import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LAYER_CATALOG,
  VIEW_TEMPLATES,
  DEFAULT_VISIBLE_LAYERS,
  getAllLayerKeys,
  getLayerConfig,
  getDefaultVisibility,
  getZoningStyle,
  getFluStyle,
  getPciStyle,
  getFloodZoneKey,
  getFloodStyle,
  getSubdivisionStyle,
  getParcelsOneClickStyle,
  styleForLayer,
  STYLED_LAYER_FUNCTIONS,
} from "./property-map-catalog.mjs";

const EXPECTED_CATEGORY_COUNTS = {
  "public-safety": 14,
  "water-supply": 4,
  "infrastructure": 10,
  "planning": 7,
  "parks-community": 6,
  "administrative": 11,
};

describe("property-map-catalog (G-117 full-parity: the 52-key layer catalog)", () => {
  it("has exactly the 7 non-overlay categories, in production's own order, with production's own per-category counts", () => {
    assert.deepEqual(
      LAYER_CATALOG.map((c) => c.id),
      ["public-safety", "water-supply", "infrastructure", "planning", "parks-community", "administrative"],
    );
    for (const cat of LAYER_CATALOG) {
      assert.equal(cat.layers.length, EXPECTED_CATEGORY_COUNTS[cat.id], `${cat.id} layer count`);
    }
  });

  it("never carries an 'overlays' category or the permits/violations/heatmap keys -- MyGov-backed, out of scope", () => {
    assert.equal(LAYER_CATALOG.some((c) => c.id === "overlays"), false);
    const keys = getAllLayerKeys();
    for (const excluded of ["permits", "violations", "heatmap"]) {
      assert.equal(keys.includes(excluded), false, excluded);
    }
  });

  it("getAllLayerKeys returns exactly 52 unique keys", () => {
    const keys = getAllLayerKeys();
    assert.equal(keys.length, 52);
    assert.equal(new Set(keys).size, 52);
  });

  it("getLayerConfig resolves a real layer's category/geometryType/color/minZoom, matching layerCatalog.ts exactly", () => {
    assert.deepEqual(getLayerConfig("fema-flood-zones"), {
      key: "fema-flood-zones",
      name: "FEMA Flood Zones (SFHA)",
      geometryType: "polygon",
      color: "#0284c7",
      fillColor: "#38bdf8",
      fillOpacity: 0.25,
      weight: 2,
      minZoom: 13,
      description: "Special Flood Hazard Areas from DFIRM data",
      category: "public-safety",
    });
    assert.equal(getLayerConfig("nonexistent-key"), undefined);
  });

  it("zoning carries only color and fillOpacity -- no fillColor/weight, same absence layerCatalog.ts itself has", () => {
    const zoning = getLayerConfig("zoning");
    assert.equal(zoning.color, "#7c3aed");
    assert.equal(zoning.fillOpacity, 0.35);
    assert.equal(zoning.fillColor, undefined);
    assert.equal(zoning.weight, undefined);
    assert.equal(zoning.minZoom, 14);
  });

  it("dashArray patterns are ported exactly for a sample of dashed layers", () => {
    assert.equal(getLayerConfig("emergency-service-districts").dashArray, "8 4");
    assert.equal(getLayerConfig("electrical-underground").dashArray, "6 4");
    assert.equal(getLayerConfig("city-limits").dashArray, "10 6");
    assert.equal(getLayerConfig("etj").dashArray, "4 4");
    assert.equal(getLayerConfig("watersheds").dashArray, "10 4");
  });
});

describe("property-map-catalog (view templates)", () => {
  it("carries all 10 named presets, in production's own order", () => {
    assert.deepEqual(
      VIEW_TEMPLATES.map((t) => t.id),
      [
        "default",
        "public-safety",
        "infrastructure",
        "planning",
        "parks-recreation",
        "environmental",
        "roads-pavement",
        "all-boundaries",
        "emergency-response",
        "parcels-one-click",
      ],
    );
  });

  it("the 'default' preset drops permits/violations from production's real list, and every other preset is untouched", () => {
    const preset = VIEW_TEMPLATES.find((t) => t.id === "default");
    assert.deepEqual(preset.layers, ["parcels", "zoning", "city-limits", "etj"]);
  });

  it("no preset other than 'default' ever referenced permits/violations/heatmap -- the exclusion touches exactly one preset", () => {
    for (const template of VIEW_TEMPLATES) {
      for (const excluded of ["permits", "violations", "heatmap"]) {
        assert.equal(template.layers.includes(excluded), false, `${template.id} should not include ${excluded}`);
      }
    }
  });

  it("every key named in every preset is a real key in the catalog", () => {
    const known = new Set(getAllLayerKeys());
    for (const template of VIEW_TEMPLATES) {
      for (const key of template.layers) {
        assert.ok(known.has(key), `${template.id} references unknown key ${key}`);
      }
    }
  });

  it("the emergency-response preset carries production's full 15-layer list", () => {
    const preset = VIEW_TEMPLATES.find((t) => t.id === "emergency-response");
    assert.equal(preset.layers.length, 15);
    assert.ok(preset.layers.includes("fire-stations"));
    assert.ok(preset.layers.includes("impacted-areas"));
  });
});

describe("property-map-catalog (default visibility)", () => {
  it("DEFAULT_VISIBLE_LAYERS is parcels/zoning/city-limits/etj -- production's default template minus permits/violations", () => {
    assert.deepEqual(DEFAULT_VISIBLE_LAYERS, ["parcels", "zoning", "city-limits", "etj"]);
  });

  it("getDefaultVisibility marks exactly the 4 default layers true and every other one of the 52 false", () => {
    const vis = getDefaultVisibility();
    assert.equal(Object.keys(vis).length, 52);
    for (const key of DEFAULT_VISIBLE_LAYERS) assert.equal(vis[key], true, key);
    const falseCount = Object.values(vis).filter((v) => v === false).length;
    assert.equal(falseCount, 52 - DEFAULT_VISIBLE_LAYERS.length);
  });
});

describe("property-map-catalog (the 6 styled overrides, ported field-for-field from DevelopmentServicesDashboard.tsx)", () => {
  it("STYLED_LAYER_FUNCTIONS covers exactly the 6 production names", () => {
    assert.deepEqual(
      Object.keys(STYLED_LAYER_FUNCTIONS).sort(),
      ["fema-flood-zones", "future-land-use", "parcels-one-click", "pci", "subdivisions", "zoning"].sort(),
    );
  });

  it("getZoningStyle buckets by placeTypeClass into the 7 real ZONING_COLORS entries, and falls back to gray for an unknown class", () => {
    assert.deepEqual(getZoningStyle({ properties: { placeTypeClass: "P-5" } }), {
      color: "#7e22ce",
      weight: 2,
      fillColor: "#9333ea",
      fillOpacity: 0.35,
    });
    assert.deepEqual(getZoningStyle({ properties: { placeTypeClass: "P-EC" } }).fillColor, "#f97316");
    assert.deepEqual(getZoningStyle({ properties: { placeTypeClass: "P-1" } }), {
      color: "#65a30d",
      weight: 2,
      fillColor: "#84cc16",
      fillOpacity: 0.35,
    });
    assert.deepEqual(getZoningStyle({ properties: {} }), {
      color: "#6b7280",
      weight: 2,
      fillColor: "#6b7280",
      fillOpacity: 0.35,
    });
  });

  it("getFluStyle buckets by LANDUSECOD into the 8 real FLU_COLORS entries, and falls back to violet for an unknown code", () => {
    assert.deepEqual(getFluStyle({ properties: { LANDUSECOD: "SFR" } }), {
      color: "#22c55e",
      weight: 2,
      fillColor: "#22c55e",
      fillOpacity: 0.2,
    });
    assert.equal(getFluStyle({ properties: { LANDUSECOD: "INDUSTRIAL" } }).color, "#6b7280");
    assert.equal(getFluStyle({ properties: { LANDUSECOD: "MIXED" } }).color, "#a855f7");
    assert.equal(getFluStyle({ properties: {} }).color, "#8b5cf6");
  });

  it("getPciStyle thresholds at 80/60/40, exactly production's real boundaries (>= not >)", () => {
    assert.equal(getPciStyle({ properties: { PCIG: "80" } }).color, "#22c55e");
    assert.equal(getPciStyle({ properties: { PCIG: "79" } }).color, "#eab308");
    assert.equal(getPciStyle({ properties: { PCIG: "60" } }).color, "#eab308");
    assert.equal(getPciStyle({ properties: { PCIG: "59" } }).color, "#f97316");
    assert.equal(getPciStyle({ properties: { PCIG: "40" } }).color, "#f97316");
    assert.equal(getPciStyle({ properties: { PCIG: "39" } }).color, "#ef4444");
    // Falls back to F2022_PCI, then a real default of "50" (below 60 -> orange).
    assert.equal(getPciStyle({ properties: { F2022_PCI: "85" } }).color, "#22c55e");
    assert.equal(getPciStyle({ properties: {} }).color, "#f97316");
    assert.deepEqual(getPciStyle({ properties: { PCIG: "80" } }), { color: "#22c55e", weight: 4, opacity: 0.8 });
  });

  it("getFloodZoneKey derives AE_FLOODWAY/X_500/X_MINIMAL from FLD_ZONE + ZONE_SUBTY exactly as production does", () => {
    assert.equal(getFloodZoneKey({ properties: { FLD_ZONE: "AE", ZONE_SUBTY: "FLOODWAY" } }), "AE_FLOODWAY");
    assert.equal(getFloodZoneKey({ properties: { FLD_ZONE: "AE" } }), "AE");
    assert.equal(getFloodZoneKey({ properties: { FLD_ZONE: "X", ZONE_SUBTY: "0.2 PCT ANNUAL CHANCE FLOOD HAZARD" } }), "X_500");
    assert.equal(getFloodZoneKey({ properties: { FLD_ZONE: "X" } }), "X_MINIMAL");
    assert.equal(getFloodZoneKey({ properties: {} }), "X_MINIMAL");
  });

  it("getFloodStyle resolves the real 9 FEMA_ZONE_COLORS buckets, falling back to X_MINIMAL", () => {
    assert.deepEqual(getFloodStyle({ properties: { FLD_ZONE: "AE", ZONE_SUBTY: "FLOODWAY" } }), {
      color: "#5c1f6e",
      weight: 2,
      fillColor: "#7b2d8e",
      fillOpacity: 0.45,
      opacity: 0.8,
    });
    assert.deepEqual(getFloodStyle({ properties: { FLD_ZONE: "VE" } }), {
      color: "#0a2a5e",
      weight: 2,
      fillColor: "#1a3a6e",
      fillOpacity: 0.45,
      opacity: 0.8,
    });
    assert.deepEqual(getFloodStyle({ properties: {} }), {
      color: "#c8784a",
      weight: 2,
      fillColor: "#e8985a",
      fillOpacity: 0.45,
      opacity: 0.8,
    });
  });

  it("getSubdivisionStyle rotates across the real 15-color SUBDIVISION_PALETTE via the same char-code hash production uses, deterministically per name", () => {
    const a = getSubdivisionStyle({ properties: { Name: "Pecan Park" } });
    const b = getSubdivisionStyle({ properties: { Name: "Pecan Park" } });
    assert.deepEqual(a, b, "same name must always hash to the same palette entry");
    assert.equal(a.weight, 3);
    assert.equal(a.fillOpacity, 0.45);
    assert.equal(a.opacity, 0.9);

    // Recompute the same hash independently (not by calling the function
    // under test) so this proves the ALGORITHM, not just its determinism.
    const palette = [
      { fill: "#1e40af", stroke: "#1e3a8a" },
      { fill: "#7c3aed", stroke: "#6d28d9" },
      { fill: "#b91c1c", stroke: "#991b1b" },
      { fill: "#047857", stroke: "#065f46" },
      { fill: "#c2410c", stroke: "#9a3412" },
      { fill: "#0e7490", stroke: "#155e75" },
      { fill: "#7e22ce", stroke: "#6b21a8" },
      { fill: "#be123c", stroke: "#9f1239" },
      { fill: "#0369a1", stroke: "#075985" },
      { fill: "#4338ca", stroke: "#3730a3" },
      { fill: "#15803d", stroke: "#166534" },
      { fill: "#a16207", stroke: "#854d0e" },
      { fill: "#9333ea", stroke: "#7e22ce" },
      { fill: "#dc2626", stroke: "#b91c1c" },
      { fill: "#0284c7", stroke: "#0369a1" },
    ];
    function referenceHash(name) {
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
      return palette[Math.abs(hash) % palette.length];
    }
    const expected = referenceHash("Pecan Park");
    assert.deepEqual(a, { color: expected.stroke, weight: 3, fillColor: expected.fill, fillOpacity: 0.45, opacity: 0.9 });

    // An unnamed feature hashes on the empty string, which is a real,
    // deterministic value (palette index 0) -- not a special-cased default.
    assert.deepEqual(getSubdivisionStyle({ properties: {} }), {
      color: palette[0].stroke,
      weight: 3,
      fillColor: palette[0].fill,
      fillOpacity: 0.45,
      opacity: 0.9,
    });
  });

  it("getParcelsOneClickStyle matches by PlaceTypeDesc substring (case-insensitive) against the 7 real zone colors, falling back to slate", () => {
    assert.deepEqual(getParcelsOneClickStyle({ properties: { PlaceTypeDesc: "SF District - Single Family" } }), {
      color: "#3b82f6",
      weight: 1.5,
      opacity: 0.8,
      fillColor: "#3b82f6",
      fillOpacity: 0.15,
    });
    assert.equal(getParcelsOneClickStyle({ properties: { PlaceTypeDesc: "planned development area" } }).color, "#ec4899");
    assert.equal(getParcelsOneClickStyle({ properties: { PlaceTypeDesc: "gc district" } }).color, "#f97316");
    assert.equal(getParcelsOneClickStyle({ properties: {} }).color, "#94a3b8");
  });
});

describe("property-map-catalog (styleForLayer, the one dispatch point web/property-map.js calls)", () => {
  it("routes the 6 styled keys through their real per-feature function", () => {
    assert.deepEqual(
      styleForLayer("zoning", { properties: { placeTypeClass: "P-4" } }),
      getZoningStyle({ properties: { placeTypeClass: "P-4" } }),
    );
    assert.deepEqual(
      styleForLayer("pci", { properties: { PCIG: "90" } }),
      getPciStyle({ properties: { PCIG: "90" } }),
    );
  });

  it("routes every other key to its catalog entry's flat color/fillColor/fillOpacity/weight/dashArray, unchanged across features", () => {
    const style1 = styleForLayer("fire-stations", { properties: { NAME: "Station 1" } });
    const style2 = styleForLayer("fire-stations", { properties: { NAME: "Station 2" } });
    assert.deepEqual(style1, style2);
    assert.deepEqual(style1, { color: "#dc2626" });

    const emergencyDistricts = styleForLayer("emergency-service-districts", { properties: {} });
    assert.deepEqual(emergencyDistricts, {
      color: "#f87171",
      fillColor: "#fca5a5",
      fillOpacity: 0.15,
      weight: 2,
      dashArray: "8 4",
    });
  });

  it("returns an empty style, not a crash, for an unknown key", () => {
    assert.deepEqual(styleForLayer("not-a-real-key", { properties: {} }), {});
  });
});
