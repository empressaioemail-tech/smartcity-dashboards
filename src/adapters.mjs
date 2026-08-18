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

export const TEMPLATE_MUNICODE_CALENDAR_GRANT = {
  kind: "municode",
  purpose: "calendar",
  writesTo: "files",
  accessPolicy: "public-free",
  writesToOverrideReason:
    "L26 holds the atoms slot; catalog municode defaults to spine",
  sourceUrl: "https://bastrop-tx.municodemeetings.com/",
};

export function isIdentityHeldClerkHost(sourceUrl) {
  const raw = String(sourceUrl || "").trim();
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "bastrop-tx.municodemeetings.com" || host.includes("bastrop");
  } catch {
    return /bastrop/i.test(raw);
  }
}

export function adapterKindById(id) {
  return ADAPTER_KINDS.find((kind) => kind.id === id) || null;
}

export function assertPublicFeedSourceUrl(sourceUrl) {
  const raw = String(sourceUrl || "").trim();
  if (!raw) throw new Error("grant requires sourceUrl");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("grant sourceUrl must be an absolute URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("grant sourceUrl must be https");
  }
  const host = parsed.hostname.toLowerCase();
  const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
  if (host === "smartcityos.io" || host.endsWith(".smartcityos.io")) {
    throw new Error("refusing smartcityos.io calendar host");
  }
  if (isIdentityHeldClerkHost(parsed.href)) {
    throw new Error("refusing Bastrop clerk host on template-city");
  }
  if (path.includes("/api/calendar/")) {
    throw new Error("refusing city /api/calendar/ path");
  }
  return true;
}

export function assertGrantedAdapterShape(grant) {
  if (!grant || typeof grant !== "object") {
    throw new Error("grant requires an object");
  }
  if (FORBIDDEN_PRODUCT_STRINGS.includes(grant.kind)) {
    throw new Error(`${grant.kind} is not a city feed`);
  }
  const kind = adapterKindById(grant.kind);
  if (!kind) throw new Error("grant kind must be a catalogued adapter");
  if (grant.purpose !== "calendar" && grant.kind === "municode" && grant.writesTo === "files") {
    throw new Error("municode files grant on this card is calendar only");
  }
  if (typeof grant.purpose !== "string" || !grant.purpose.trim()) {
    throw new Error("grant requires purpose");
  }
  if (!WRITE_TARGETS.has(grant.writesTo)) {
    throw new Error("writesTo must be spine or files, not a local table");
  }
  if (!ACCESS_POLICIES.has(grant.accessPolicy)) {
    throw new Error("grant requires a contract accessPolicy");
  }
  if (grant.writesTo !== kind.writesTo) {
    if (typeof grant.writesToOverrideReason !== "string" || !grant.writesToOverrideReason.trim()) {
      throw new Error("writesTo override requires a named reason");
    }
  }
  assertPublicFeedSourceUrl(grant.sourceUrl);
  return true;
}

export function calendarGrantFor(pack) {
  const grants = Array.isArray(pack?.grantedAdapters) ? pack.grantedAdapters : [];
  return (
    grants.find((g) => g && g.kind === "municode" && g.purpose === "calendar") || null
  );
}
