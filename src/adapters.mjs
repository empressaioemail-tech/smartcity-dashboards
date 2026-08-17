import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";

export const WRITE_TARGETS = new Set(["spine", "files"]);

export const ACCESS_POLICIES = new Set([
  "public-free",
  "public-paid",
  "platform-internal",
  "tenant-private",
  "tenant-shared",
]);

export const ADAPTER_KINDS = [
  {
    id: "mygov",
    displayName: "MyGov",
    writesTo: "spine",
    defaultAccessPolicy: "tenant-private",
    notes: "Permit and work-order records onto spine. Not a copied table.",
  },
  {
    id: "samsara",
    displayName: "Samsara",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Fleet ops records onto files. Not Asset Management Tier 1 nodes.",
  },
  {
    id: "opengov",
    displayName: "OpenGov",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Budget and finance records onto files.",
  },
  {
    id: "esri",
    displayName: "Esri",
    writesTo: "spine",
    defaultAccessPolicy: "tenant-private",
    notes: "Place geometry and GIS facts onto spine.",
  },
  {
    id: "municode",
    displayName: "municode",
    writesTo: "spine",
    defaultAccessPolicy: "tenant-private",
    notes: "Code and calendar records onto spine.",
  },
  {
    id: "firstdue",
    displayName: "FirstDue",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Fire and EMS incident records onto files.",
  },
  {
    id: "verkada",
    displayName: "Verkada",
    writesTo: "files",
    defaultAccessPolicy: "tenant-private",
    notes: "Camera and door ops records onto files.",
  },
];

export function assertAdapterKindShape(kind) {
  if (!kind || typeof kind.id !== "string" || !kind.id) {
    throw new Error("adapter kind requires id");
  }
  if (FORBIDDEN_PRODUCT_STRINGS.includes(kind.id)) {
    throw new Error(`${kind.id} is not a city feed`);
  }
  if (!WRITE_TARGETS.has(kind.writesTo)) {
    throw new Error("writesTo must be spine or files, not a local table");
  }
  if (!ACCESS_POLICIES.has(kind.defaultAccessPolicy)) {
    throw new Error("adapter kind requires a contract accessPolicy");
  }
  return true;
}

export function listAdapterKinds() {
  return ADAPTER_KINDS.map((kind) => {
    assertAdapterKindShape(kind);
    return {
      id: kind.id,
      displayName: kind.displayName,
      writesTo: kind.writesTo,
      defaultAccessPolicy: kind.defaultAccessPolicy,
      notes: kind.notes,
    };
  });
}
