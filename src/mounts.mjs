const FORBIDDEN_DSN_HOSTS = [
  "smartcity-os-prod",
  "tiny-art-63602898",
  "fancy-fire-06136146",
  "cortex-prod",
];

export const MOUNT_URL_ENV_KEYS = [
  "HAUSKA_RETRIEVAL_URL",
  "SMART_FILES_BACKEND_URL",
  "SMARTSITE_EMBED_ORIGIN",
];

export const FORBIDDEN_MOUNT_MARKERS = [
  "smartcity-os-prod",
  "tiny-art-63602898",
  "fancy-fire-06136146",
  "cortex-api",
  "postgres://",
  "neon.tech",
];

function env(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

export function readMounts() {
  return {
    spine: {
      contract: "atom-read-http",
      url: env("HAUSKA_RETRIEVAL_URL"),
    },
    smartsite: {
      contract: "embed",
      origin: env("SMARTSITE_EMBED_ORIGIN", "https://smartsite.cloud"),
      parcelPath: "/?parcelNodeId=",
    },
    smartFiles: {
      contract: "service-http",
      url: env("SMART_FILES_BACKEND_URL"),
    },
  };
}

export function smartsiteEmbedUrl(parcelNodeId) {
  const mounts = readMounts();
  const origin = mounts.smartsite.origin.replace(/\/$/, "");
  const id = encodeURIComponent(parcelNodeId || "");
  return `${origin}${mounts.smartsite.parcelPath}${id}`;
}

export function assertNoSupplierDsn(envMap = process.env) {
  const url = String(envMap.DATABASE_URL || "");
  if (!url) return true;
  const lower = url.toLowerCase();
  for (const host of FORBIDDEN_DSN_HOSTS) {
    if (lower.includes(host)) {
      throw new Error(`refusing supplier or city DSN (${host})`);
    }
  }
  const isPostgres = /^postgres(ql)?:\/\//.test(lower);
  const isNeon = lower.includes("neon.tech");
  if (isPostgres && isNeon) return true;
  throw new Error(
    "DATABASE_URL must be this product's Neon (neon.tech) and not smartcity-os-prod, cortex, or files.",
  );
}

export function assertNoSupplierMounts(envMap = process.env) {
  for (const name of MOUNT_URL_ENV_KEYS) {
    const raw = String(envMap[name] || "");
    if (!raw) continue;
    const lower = raw.toLowerCase();
    for (const marker of FORBIDDEN_MOUNT_MARKERS) {
      if (lower.includes(marker.toLowerCase())) {
        throw new Error(`refusing supplier or city host on ${name} (${marker})`);
      }
    }
  }
  return true;
}
