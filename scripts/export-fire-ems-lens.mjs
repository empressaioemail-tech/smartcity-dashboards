import fs from "node:fs";
import path from "node:path";
import { renderFireEmsLens } from "../src/fire-ems-lens.mjs";
import { getMemoryPack } from "../src/city-pack.mjs";

/**
 * G-152. THE BRIDGE FROM THE BUILT SURFACE TO THE DESIGN FOLDER'S OWN CHECK.
 *
 * `_design/smartcity-fire-ems-lens/check.mjs` is a RATIFIED instrument and it
 * scans `.dc.html` artboards in its own folder. The dispatch's acceptance item
 * asks it to pass on the BUILT surface, which it cannot reach on its own. The
 * operator ruled the bridge on 2026-09-18 (the ruling G-156 used for Finance):
 * add `--dir` to the check and point it at a built markup export.
 *
 * THIS SCRIPT IS THE EXPORT, AND IT DOES NOT RE-IMPLEMENT ANYTHING. It calls the
 * same renderFireEmsLens() that scripts/bake-fire-ems-lens.mjs embeds into
 * web/index.html and that the server's /api/lenses/fire-ems/sources payload is
 * derived from. A second renderer written for the check would be the CTRL-1
 * shape - two implementations of one surface, agreeing today and drifting
 * silently - inside the artifact whose entire job is to detect that.
 *
 * IT WRITES ONE FILE PER PACK, INCLUDING THE BUNDLED DEFAULT, because the
 * unresolved default (pack = null) is the only state web/index.html can ship
 * before a pack resolves and no resolved city carries it.
 *
 * IT WRITES INTO A PER-LENS SUBDIRECTORY, `<outDir>/fire-ems/`, because the
 * design's check takes `--dir` and reads every `.html` under it: two lenses'
 * surfaces in one directory would each fail the other's domain registry.
 *
 *   node scripts/export-fire-ems-lens.mjs <outDir> [cityKey ...]
 */
const outDir = process.argv[2];
const cityKeys = process.argv.slice(3);
if (!outDir) {
  console.error("usage: node scripts/export-fire-ems-lens.mjs <outDir> [cityKey ...]");
  process.exit(2);
}

/**
 * THE DEFAULT SET IS CHOSEN FOR STATE COVERAGE:
 *   bundled       pack = null, which is what web/index.html ships
 *   template-city generated demo records: the only state with a roster and
 *                 per-station multiples to reconcile
 *   empty-city    the fixture seam answers no-fixture-source: unread tiles
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

fs.mkdirSync(path.join(outDir, "fire-ems"), { recursive: true });
for (const pack of packs) {
  const file = path.join(outDir, "fire-ems", `fire-ems-${pack ? pack.cityKey : "bundled"}.html`);
  const html = renderFireEmsLens(pack);
  fs.writeFileSync(file, html);
  const statuses = [...new Set([...html.matchAll(/status: ([a-z-]+)/g)].map((m) => m[1]))];
  const units = (html.match(/FIX-FA-\d{4}/g) || []).length;
  const stations = (html.match(/STN-\d{2}/g) || []).length;
  console.log(`wrote ${file}  ${html.length} bytes, ${units} unit ids, ${stations} station refs` +
    (statuses.length ? `, composer status ${statuses.join(", ")}` : ", no composer status (bundled default)"));
}
console.log(`\ncheck it with:\n  node check.mjs --dir ${path.resolve(outDir, "fire-ems")}`);
