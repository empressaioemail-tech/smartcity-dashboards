import fs from "node:fs";
import path from "node:path";
import { renderPublicWorksLens } from "../src/public-works-lens.mjs";
import { getMemoryPack } from "../src/city-pack.mjs";

/**
 * G-152. THE BRIDGE FROM THE BUILT SURFACE TO THE DESIGN FOLDER'S OWN CHECK.
 *
 * `_design/smartcity-public-works-lens/check.mjs` is a RATIFIED instrument and
 * it scans `.dc.html` artboards in its own folder. The dispatch's acceptance
 * item asks it to pass on the BUILT surface, which it cannot reach on its own.
 * The operator ruled the bridge on 2026-09-18 (the ruling G-156 used for
 * Finance): add `--dir` to the check and point it at a built markup export.
 *
 * THIS SCRIPT IS THE EXPORT, AND IT DOES NOT RE-IMPLEMENT ANYTHING. It calls the
 * same renderPublicWorksLens() that scripts/bake-public-works-lens.mjs embeds
 * into web/index.html and that the server's /api/lenses/public-works/sources
 * payload is derived from. A second renderer written for the check would be the
 * CTRL-1 shape - two implementations of one surface, agreeing today and drifting
 * silently - inside the artifact whose entire job is to detect that.
 *
 * IT WRITES ONE FILE PER PACK, INCLUDING THE BUNDLED DEFAULT, and that is state
 * coverage rather than thoroughness. The unresolved default (pack = null) is the
 * only state web/index.html can ship before a pack resolves, and a check pointed
 * at a resolved city alone would never see it. A directory is also the only
 * shape in which the instrument's set-level rules (the verbatim composer
 * sentences, the non-vacuity totals) can be satisfied, because no single pack
 * carries every state this lens can be in.
 *
/**
 * IT WRITES INTO A PER-LENS SUBDIRECTORY, `<outDir>/public-works/`, and that is
 * not tidiness: the design's check takes `--dir` and reads every `.html` under
 * it, so two lenses' surfaces in one directory would each fail the other's
 * domain registry. One directory per lens keeps `--dir` unambiguous and keeps
 * the command the script prints copy-pasteable.
 *
 *   node scripts/export-public-works-lens.mjs <outDir> [cityKey ...]
 */
const outDir = process.argv[2];
const cityKeys = process.argv.slice(3);
if (!outDir) {
  console.error("usage: node scripts/export-public-works-lens.mjs <outDir> [cityKey ...]");
  process.exit(2);
}

/**
 * THE DEFAULT SET IS CHOSEN FOR STATE COVERAGE, NOT FOR TIDINESS:
 *   bundled       pack = null, which is what web/index.html ships
 *   template-city generated demo records: the only state with real counts, and
 *                 the only state with a reconciled call grid to read
 *   empty-city    the fixture seam answers no-fixture-source: a measured zero
 *                 that is not a measurement, so the matrix has nothing to draw
 *   bastrop_tx    a granted live domain: the vendor-blocked board
 */
const DEFAULT_KEYS = ["template-city", "empty-city", "bastrop_tx"];
const keys = cityKeys.length ? cityKeys : DEFAULT_KEYS;
const packs = [null, ...keys.map((k) => {
  const p = getMemoryPack(k);
  if (!p) {
    console.error(`no pack named ${k}`);
    process.exit(2);
  }
  return p;
})];

fs.mkdirSync(path.join(outDir, "public-works"), { recursive: true });
for (const pack of packs) {
  const file = path.join(outDir, "public-works", `public-works-${pack ? pack.cityKey : "bundled"}.html`);
  const html = renderPublicWorksLens(pack);
  fs.writeFileSync(file, html);
  const statuses = [...new Set([...html.matchAll(/status: ([a-z-]+)/g)].map((m) => m[1]))];
  const tally = { count: 0, "measured-zero": 0, unmeasured: 0, "cannot-occur": 0 };
  for (const m of html.matchAll(/data-mtx-state="([a-z-]+)"/g)) if (m[1] in tally) tally[m[1]] += 1;
  const states = Object.entries(tally).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(" ");
  console.log(`wrote ${file}  ${html.length} bytes` +
    (states ? `, matrix cells ${states}` : ", no matrix on this surface") +
    (statuses.length ? `, composer status ${statuses.join(", ")}` : ", no composer status (bundled default)"));
}
console.log(`\ncheck it with:\n  node check.mjs --dir ${path.resolve(outDir, "public-works")}`);
