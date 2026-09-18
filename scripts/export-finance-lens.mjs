import fs from "node:fs";
import path from "node:path";
import { renderFinanceLens, CAPTURE_CITY_KEY } from "../src/finance-lens.mjs";
import { getMemoryPack } from "../src/city-pack.mjs";

/**
 * G-156. THE BRIDGE FROM THE BUILT SURFACE TO THE DESIGN FOLDER'S OWN CHECK.
 *
 * The design's `_design/smartcity-finance-lens/check.mjs` is a RATIFIED
 * instrument and it scans `.dc.html` artboards in its own folder. The dispatch's
 * fourth acceptance item asks it to pass on the BUILT surface, which it cannot
 * reach on its own. The operator ruled the bridge on 2026-09-18: add `--dir` to
 * the check, mirroring the convention the filings folder's check already has,
 * and point it at a built Finance-lens markup export.
 *
 * THIS SCRIPT IS THE EXPORT, AND IT DOES NOT RE-IMPLEMENT ANYTHING. It calls
 * the same renderFinanceLens() that scripts/bake-finance-lens.mjs bakes into
 * web/index.html and that the server's /api/lenses/finance/sources payload is
 * derived from. A second renderer written for the check would be the CTRL-1
 * shape - two implementations of one surface, agreeing today and drifting
 * silently - inside the artifact whose entire job is to detect that.
 *
 * WHAT THE EXPORT IS, EXACTLY, because the difference matters when reading a
 * verdict: it is the Finance lens as SERVED FOR ONE PACK, with that pack's
 * states resolved and its capture quotation applied. It is not the shared
 * document and it is not a screenshot of a running server. The shared document
 * is the unresolved default (pack = null), which carries no money by
 * construction and is asserted so by the bake's own post-conditions.
 *
 *   node scripts/export-finance-lens.mjs <outDir> [cityKey]
 */
const outDir = process.argv[2];
const cityKey = process.argv[3] || CAPTURE_CITY_KEY;
if (!outDir) {
  console.error("usage: node scripts/export-finance-lens.mjs <outDir> [cityKey]");
  process.exit(2);
}

const pack = getMemoryPack(cityKey);
if (!pack) {
  console.error(`no pack named ${cityKey}`);
  process.exit(2);
}

fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, "finance-lens.dc.html");
fs.writeFileSync(file, renderFinanceLens(pack));

const html = fs.readFileSync(file, "utf8");
const figures = [...new Set(html.match(/\$[0-9][0-9,.]*\s?[MKB]?/g) || [])];
console.log(`wrote ${file}`);
console.log(`  pack ${pack.cityKey}, ${html.length} bytes, ${figures.length} money token(s), ${figures.join(" ") || "none"}`);
