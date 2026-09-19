import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { renderParksLens, renderParksSurface, bakeParksLensInto, ROSTER, CATALOGUED_KINDS } from "../src/parks-lens.mjs";
import { getMemoryPack } from "../src/city-pack.mjs";
import { readSource } from "../src/served-surface.mjs";

/**
 * G-151. THE BRIDGE FROM THE BUILT SURFACE TO THE DESIGN FOLDER'S OWN CHECK.
 *
 * `_design/smartcity-parks-lens/check.mjs` is a RATIFIED instrument and it scans
 * `.dc.html` artboards in its own folder. The dispatch's first acceptance item
 * asks it to pass on the BUILT surface, which it cannot reach on its own. The
 * operator ruling that produced the same bridge for Finance (G-156) and Public
 * works (G-152) applies here unchanged: add `--dir` to the check, point it at a
 * built markup export.
 *
 * THIS SCRIPT IS THE EXPORT, AND IT DOES NOT RE-IMPLEMENT ANYTHING. What it
 * writes inside `<main data-lens-body="parks">` IS renderParksLens() verbatim -
 * the same bytes scripts/bake-parks-lens.mjs bakes into web/index.html and the
 * same bytes src/server.mjs serves at /lens/parks. The script asserts that
 * containment before it writes, so an export that stopped matching the shipped
 * surface fails here rather than passing the instrument on markup nobody ships.
 *
 * IT WRITES ONE FILE PER PACK, INCLUDING THE UNRESOLVED DEFAULT, AND FOR THIS
 * LENS THAT IS THE WHOLE POINT RATHER THAN STATE COVERAGE. A Parks surface must
 * be IDENTICAL on every pack: a state that varies by city is a statement about
 * the city, and this lens has nothing to say about a city. So the export writes
 * four documents, hashes the `<main>` region of each, and REQUIRES one hash.
 * Four files that differ would mean a later lane threaded a pack into the
 * reading, which is the defect this lens exists to prevent, and a check pointed
 * at one pack would never have seen it.
 *
 *   node scripts/export-parks-lens.mjs <outDir> [cityKey ...]
 */
const outDir = process.argv[2];
const cityKeys = process.argv.slice(3);
if (!outDir) {
  console.error("usage: node scripts/export-parks-lens.mjs <outDir> [cityKey ...]");
  process.exit(2);
}

/**
 * The default set spans the states a BUILT lens would distinguish and this one
 * must not: the bundled unresolved default web/index.html ships, the generated
 * demo pack, the empty fixture pack and the granted live staging pack.
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

/** The shipped reading, read ONCE: what the export contains must be these bytes. */
const SHIPPED = renderParksLens();

const dir = path.join(outDir, "parks");
fs.mkdirSync(dir, { recursive: true });

const hashes = new Map();
for (const pack of packs) {
  const key = pack ? pack.cityKey : "bundled";
  const file = path.join(dir, `parks-${key}.dc.html`);
  const html = renderParksSurface(pack, { assetBase: ".." });

  const reading = /data-lens-body="parks"[\s\S]*?<\/main>/.exec(html)?.[0];
  if (!reading) {
    console.error(`the export for ${key} carries no data-lens-body="parks" region, so the`);
    console.error("instrument would refuse it (exit 2) rather than check it. Not writing anything.");
    process.exit(2);
  }
  /**
   * The region the instrument scopes on, with its marker stripped, must BE the
   * shipped bytes. Compared this way rather than against a second string built
   * here, so a wrapper change cannot make both sides drift together.
   */
  const scoped = reading.slice(reading.indexOf(">") + 1, -"</main>".length);
  if (scoped !== SHIPPED) {
    console.error(`the exported reading for ${key} is not what web/index.html ships, so the`);
    console.error("instrument would be checking a surface nobody serves. Not writing anything.");
    process.exit(2);
  }
  const hash = crypto.createHash("sha256").update(reading).digest("hex").slice(0, 16);
  hashes.set(key, hash);

  fs.writeFileSync(file, html);
  console.log(`wrote ${file}  ${html.length} bytes, reading ${hash}`);
}

/**
 * The invariance, asserted here as well as in the test, because this script is
 * what a lane runs while working and this failure is silent otherwise.
 */
if (new Set(hashes.values()).size !== 1) {
  console.error("\nTHE PARKS READING VARIES BY PACK, and that is the one thing it must never do.");
  for (const [key, hash] of hashes) console.error(`  ${key}: ${hash}`);
  process.exit(1);
}

const head = readSource("web/index.html");
if (bakeParksLensInto(head) !== head) {
  console.error("\nweb/index.html is not what src/parks-lens.mjs bakes. Run");
  console.error("`node scripts/bake-parks-lens.mjs` and commit the result, then export again.");
  process.exit(1);
}

console.log(`\nreading identical on ${hashes.size} pack(s): ${[...hashes.values()][0]}`);
console.log(`roster rows ${ROSTER.length}, catalogued kinds ${CATALOGUED_KINDS.length}, and no figure on any of them`);
console.log(`check it with:\n  node check.mjs --dir ${path.resolve(dir)}`);
