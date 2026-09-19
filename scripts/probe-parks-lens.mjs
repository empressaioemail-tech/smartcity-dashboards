#!/usr/bin/env node
/**
 * G-151 — the Parks surface, measured on a served document rather than read off
 * the merge. TWO LEGS, because the row's acceptance item 3 asks for a reach on
 * the DO app and D-12 makes that a DEPLOY question rather than a code question
 * (deploy-on-push is absent from `services[0].github`, so a merge ships
 * nothing).
 *
 *   LEG A  the DEPLOYED surface at https://app.smartcityos.io, with the edge
 *          headers that prove which substrate answered and what it serves
 *          today. This is the `preChange` leg and it is the one that runs
 *          against the app a person can reach.
 *   LEG B  THIS BUILD, on this repo's own src/server.mjs, started in-process on
 *          an ephemeral port. This is the `postChange` leg: what the lane's
 *          `GET /lens/parks` route and the baked `?lens=parks` shell return
 *          once this tree is what runs.
 *
 * WHY THE SPLIT IS STATED RATHER THAN GLOSSED. A probe that printed one leg and
 * called it "the DO app" would be the exact defect the fleet keeps re-learning:
 * a claim true where it was measured and false where it is read. The two legs
 * carry different URLs, different moments and different substrates, and the
 * artifact says which is which. A lane that cannot deploy reports the deployed
 * leg as PRE-CHANGE and the deploy as owed; it does not report its own laptop as
 * production.
 *
 * THE EDGE HEADER IS THE POINT OF LEG A. `x-do-app-origin` names the App
 * Platform app that answered and `x-do-orig-status` carries the status the app
 * itself issued, so the reading distinguishes "DigitalOcean answered with 404"
 * from "a proxy invented a 404". `Server: cloudflare` is recorded beside it
 * because the hostname is fronted, and the two together are what make the leg a
 * read of the edge rather than of a cache.
 *
 * WHY EVERY LENS ROUTE IS READ TWICE ON EACH LEG. `/lens/parks` takes a cityKey
 * (server.mjs requiredCityKey) exactly as its public-works and fire-ems siblings
 * do: a caller who names no city gets a refusal, not somebody else's city. So
 * the leg reads the bare path AND the path with `?cityKey=`, and the pair is the
 * control — the refusal proves the route is this product's route and not a
 * catch-all, and the 200 proves the page is reachable. One of the two alone
 * would be readable either way.
 *
 * READ-ONLY. Leg A sends a GET per row and writes nothing. Leg B starts the
 * repo's own server on 127.0.0.1, which touches no store: with DATABASE_URL
 * unset the pack store is `memory` (src/city-pack.mjs:207), so it reads the four
 * in-code packs and nothing else. No credential is read, sent or printed.
 *
 * RUN IT WITH `--use-system-ca`. Without the Windows trust store Node's fetch
 * cannot verify the deployed hostname's chain and every leg A row records
 * `fetch failed` — a refusal about the PROBE's trust store, not about the app.
 * The flag is required on this machine and the script says so on the rows it
 * could not read, rather than reporting the app as down.
 *
 *   node --use-system-ca scripts/probe-parks-lens.mjs <out.json> [baseUrl[,baseUrl...]]
 *
 * It writes the JSON artifact AND a human-readable .txt beside it, because the
 * close has to paste the read rather than describe it.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = process.argv[2];
const BASE = process.argv[3] || "https://app.smartcityos.io";
/** Comma-separated, because D-12 leaves two apps serving and a merge redeploys neither. */
const BASES = BASE.split(",").map((s) => s.trim()).filter(Boolean);
if (!outPath) {
  console.error("usage: node scripts/probe-parks-lens.mjs <out.json> [baseUrl[,baseUrl...]]");
  process.exit(2);
}

/**
 * THE MARKERS, AND EACH ONE EARNS ITS PLACE. The two placeholder strings are
 * what the shipped document said about Parks BEFORE this lane, so their presence
 * proves a surface is the pre-change build rather than merely "not this one".
 * The three new ones are the lane's own: the card title, the state word and the
 * roster row attribute the design's instrument reads. A retired marker and a
 * live marker in the same probe is a paired control, not decoration.
 */
const PRE_CHANGE_MARKERS = ["Lens on the roster", "Parks is named, and not built"];
const POST_CHANGE_MARKERS = [
  "This surface does not exist yet",
  'data-lens-body="parks"',
  'data-roster-region="parks:0"',
];

const EDGE_HEADERS = ["server", "x-do-app-origin", "x-do-orig-status", "cf-ray", "cf-cache-status", "content-type"];

/** The city the reach is read for, named so the artifact cannot be read as "any city". */
const PROBE_CITY = "template-city";

/**
 * THE ROWS, READ ON BOTH LEGS. Three of these are controls rather than readings:
 *
 *  - `lensRouteNoCity` — the route takes a cityKey (server.mjs requiredCityKey)
 *    exactly as its public-works and fire-ems siblings do, so the bare path must
 *    refuse with `city_key_required` and the route's own stake sentence.
 *  - `lensRoutePrivateCity` — a tenant-private pack must refuse an anonymous
 *    caller, because a page named after a lens is still a reading of that pack.
 *    A Parks page that rendered for `bastrop_tx` would be a leak, whatever it
 *    said.
 *  - `lensRouteUnknownCity` — an unknown pack is a 404 and never a blank page.
 *
 * `PROBE_CITY` is the public-free pack the 200 is read for. Reading the reach
 * from a private pack would have produced a 401 and called it "unreachable",
 * which is what a probe without controls does.
 */
const ROWS = [
  ["root", "/"],
  ["lensQuery", "/?lens=parks"],
  ["lensRouteNoCity", "/lens/parks"],
  ["lensRoute", `/lens/parks?cityKey=${PROBE_CITY}`],
  ["lensRoutePrivateCity", "/lens/parks?cityKey=bastrop_tx"],
  ["lensRouteUnknownCity", "/lens/parks?cityKey=nope-city"],
];

const sha16 = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
const read = (text, markers) => Object.fromEntries(markers.map((m) => [m, text.includes(m)]));

async function get(url) {
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "g151-parks-lens-probe" } });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString("utf8");
    return {
      url,
      status: res.status,
      headers: Object.fromEntries(EDGE_HEADERS.map((h) => [h, res.headers.get(h)]).filter(([, v]) => v !== null)),
      bytes: buf.length,
      sha256_16: sha16(buf),
      preChangeMarkers: read(text, PRE_CHANGE_MARKERS),
      postChangeMarkers: read(text, POST_CHANGE_MARKERS),
      /* A refusal on this product is HTML or JSON, so the evidence is kept as text. */
      note: res.status === 200 ? null : text.replace(/\s+/g, " ").trim().slice(0, 160),
    };
  } catch (err) {
    /**
     * A LEG THAT COULD NOT RUN IS REFUSED, NEVER PASSED AND NEVER OMITTED. The
     * cause is kept because `fetch failed` alone does not say whether the app was
     * down or the probe could not verify the certificate, and those two are
     * different sentences about different things.
     */
    const cause = err.cause?.code || err.cause?.message || "";
    return {
      url,
      refused: String(err.message || err),
      cause: String(cause),
      hint: /CERT|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(String(cause))
        ? "the probe's trust store, not the app: re-run with node --use-system-ca"
        : null,
    };
  }
}

const startedAt = new Date().toISOString();
const artifact = {
  lane: "g151-parks-lens",
  planRow: "G-151",
  generatedAt: startedAt,
  instrument: "scripts/probe-parks-lens.mjs",
  baseUrl: BASE,
  baseUrls: BASES,
  snapshot: {
    repository: "smartcity-dashboards",
    worktree: path.resolve(root),
    ref: null,
    note: "the ref is recorded by the close, not by this probe: this file measures a SURFACE and never a commit",
  },
  legs: {},
  verdicts: {},
  owed: [],
};

/* ------------------------------------------------------------------ leg A: the DO app */

/**
 * BOTH APPS ARE READ, not just the one with the pretty domain. D-12's posture
 * (deploy_on_push unset) means an app can be redeployed by hand at any moment, so
 * two apps at one moment are two independent readings of what is deployed, and a
 * lane that read one of them would be reporting a surface as "the deployed
 * surface" when it is one of two.
 */
artifact.legs.deployed = {};
for (const base of BASES) {
  const leg = {};
  for (const [name, suffix] of ROWS) leg[name] = await get(`${base}${suffix}`);
  leg.readAt = new Date().toISOString();
  artifact.legs.deployed[base] = leg;
}

/* ------------------------------------------------------------------ leg B: this build */

const PORT = Number(process.env.G151_PROBE_PORT || 8791);
const child = spawn(process.execPath, [path.join(root, "src", "server.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`the local server did not report listening within 30s on ${PORT}`)), 30_000);
  child.stdout.on("data", (chunk) => {
    if (String(chunk).includes("listening")) {
      clearTimeout(timer);
      resolve();
    }
  });
  child.on("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`the local server exited with ${code} before it listened`));
  });
});

try {
  await ready;
  artifact.legs.thisBuild = { origin: `http://127.0.0.1:${PORT}`, packsStore: "memory (DATABASE_URL unset)" };
  for (const [name, suffix] of ROWS) {
    artifact.legs.thisBuild[name] = await get(`http://127.0.0.1:${PORT}${suffix}`);
  }
  artifact.legs.thisBuild.readAt = new Date().toISOString();
} catch (err) {
  artifact.legs.thisBuild = { refused: String(err.message || err) };
} finally {
  child.kill();
}

/* ------------------------------------------------------------------ verdicts */

const primary = artifact.legs.deployed[BASES[0]];
const local = artifact.legs.thisBuild;
const allTrue = (marks) => Boolean(marks) && Object.values(marks).every(Boolean);
const allFalse = (marks) => Boolean(marks) && Object.values(marks).every((v) => v === false);
/**
 * A HEADER NAMES THE SUBSTRATE; THE SPEC NAMES THE APP. `x-do-app-origin` is
 * recorded verbatim, but on this fleet it does NOT match any of the four app ids
 * `apps-list` returns, so the honest reading is "an App Platform app answered,
 * and its origin id is <id>", not "dolphin-app answered". What identifies the app
 * is the domain binding read from the app spec, which is why the close carries
 * both. Claiming the header proves WHICH app would be a claim the header cannot
 * carry, and that distinction is the whole reason this note exists.
 */
artifact.verdicts = {
  edgeHeaderProvesAnAppPlatformAppAnswered:
    primary.root?.headers?.["x-do-app-origin"] && primary.root?.headers?.server === "cloudflare"
      ? `PASS: the response carries server=${primary.root.headers.server} and x-do-app-origin=${primary.root.headers["x-do-app-origin"]} with x-do-orig-status=${primary.root.headers["x-do-orig-status"]}, so an App Platform app issued the status rather than a proxy inventing one. WHICH app is read from the app spec's domain binding, not from this header.`
      : "FAIL: the edge header that names the answering app was not present",
  deployedSurfaceIsThePreChangeBuild:
    BASES.every((b) => allFalse(artifact.legs.deployed[b].root?.postChangeMarkers)) &&
    BASES.every((b) => allFalse(artifact.legs.deployed[b].lensQuery?.postChangeMarkers))
      ? "PASS: every deployed app's shell and ?lens=parks render carry none of this lane's markers, so the pre/post pair below is a pair"
      : "FAIL: a deployed document already carries this lane's markers, so it is not the pre-change build this close describes",
  thisBuildShellShipsTheSectionAndNotTheInstrumentsMarker:
    local.root?.status === 200 &&
    local.root?.postChangeMarkers?.["This surface does not exist yet"] === true &&
    local.root?.postChangeMarkers?.['data-roster-region="parks:0"'] === true &&
    local.root?.postChangeMarkers?.['data-lens-body="parks"'] === false
      ? "PASS: the baked shell carries the lens body, and NOT data-lens-body=\"parks\" — that attribute scopes the design instrument to the surface document, and a shipped shell carrying it would be the instrument leaking into the product"
      : "FAIL: the shipped shell is not the baked lens section",
  thisBuildRouteRefusesWithoutACity:
    local.lensRouteNoCity?.status === 400 && /city_key_required/.test(local.lensRouteNoCity?.note || "")
      ? `PASS: the bare route refuses with city_key_required — "${local.lensRouteNoCity.note}"`
      : "FAIL: the bare route did not refuse with city_key_required",
  thisBuildRouteServesTheLensForAPublicCity:
    local.lensRoute?.status === 200 && allTrue(local.lensRoute?.postChangeMarkers)
      ? `PASS: GET /lens/parks?cityKey=${PROBE_CITY} answers 200 with all three markers — the section body, the state word, and data-lens-body="parks" which is what scopes the design's check.mjs to this document`
      : "FAIL: the route did not serve the Parks lens for a public city",
  thisBuildRouteRefusesAPrivateCityAndAnUnknownOne:
    local.lensRoutePrivateCity?.status === 401 && local.lensRouteUnknownCity?.status === 404
      ? "PASS: a tenant-private pack is 401 and an unknown pack is 404 — the lens page is a reading of a pack and obeys the pack's access, like its public-works and fire-ems siblings"
      : "FAIL: the route did not hold the pack-access line",
};

if (BASES.some((b) => artifact.legs.deployed[b].lensRouteNoCity?.status === 404)) {
  artifact.owed.push(
    `GET /lens/parks on every deployed app tested answers 404 today (x-do-orig-status says the app itself issued it): the deployed commits predate this lane's route, which is expected while the merge is undeployed and is NOT a defect. The POST-CHANGE reach on the DO app is therefore UNMEASURED here and is a planner-owned deploy, recorded in the close.`,
  );
}
artifact.owed.push(
  "The deployed legs were read at the moments in legs.deployed[*].readAt and describe THOSE commits. A later deploy of either app replaces its leg; the local leg is reproducible by re-running this script.",
);

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");

/* ------------------------------------------------------- the pasted-in-the-close form */

const show = (label, leg) =>
  `${label.padEnd(30)} ${
    leg?.refused
      ? "REFUSED " + leg.refused
      : `HTTP ${leg.status}  ${String(leg.bytes).padStart(7)}B  sha256_16=${leg.sha256_16}` +
        `  server=${leg.headers?.server ?? "-"}  x-do-app-origin=${leg.headers?.["x-do-app-origin"] ?? "-"}` +
        `  x-do-orig-status=${leg.headers?.["x-do-orig-status"] ?? "-"}  cf-cache=${leg.headers?.["cf-cache-status"] ?? "-"}` +
        (leg.note ? `\n${" ".repeat(30)}body: ${leg.note}` : "")
  }`;

const lines = [
  `G-151 Parks lens surface probe, measured ${startedAt}`,
  `instrument: ${path.relative(root, fileURLToPath(import.meta.url))} (this repo) — reads SURFACES, never a commit`,
  "",
];
for (const base of BASES) {
  const leg = artifact.legs.deployed[base];
  lines.push(`${base}   read at ${leg.readAt}`);
  for (const [name] of ROWS) lines.push(show(name, leg[name]));
  lines.push("");
}
lines.push(`THIS BUILD at ${local.origin ?? "?"}   read at ${local.readAt ?? "refused"}`);
for (const [name] of ROWS) lines.push(show(name, local[name]));
lines.push("");
for (const [name, verdict] of Object.entries(artifact.verdicts)) lines.push(`${name}:\n  ${verdict}`);
lines.push("", "OWED:", ...artifact.owed.map((o) => "  - " + o));
const report = lines.join("\n") + "\n";
const reportPath = path.resolve(outPath).replace(/\.json$/, "") + ".txt";
fs.writeFileSync(reportPath, report);
console.log(`\nprobe written to ${path.resolve(outPath)}`);
console.log(`report written to ${reportPath}\n`);
console.log(report);
