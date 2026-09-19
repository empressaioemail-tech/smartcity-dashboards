import fs from "node:fs";
import { bakeParksLensInto } from "../src/parks-lens.mjs";

/**
 * G-151. The bake, and it calls ONE implementation.
 *
 * The transform lives in src/parks-lens.mjs so that this script and
 * src/parks-lens.test.mjs call the same code. A transform that lives only in a
 * script cannot be asserted, and the freshness failure it produces is silent in
 * both directions: a section edited here and not re-baked ships stale, and
 * web/index.html edited by hand and not re-derived ships a version of the lens
 * no code produces. The test asserts web/index.html is a FIXED POINT of
 * bakeParksLensInto(), which is freshness without anybody remembering to run
 * this.
 *
 * WHY THE PARKS PAGE IS BAKED AT ALL, when this lens renders no data. The shell
 * reaches the lens at `/?lens=parks` and the route serves `/lens/parks`; without
 * the bake those are two different Parks pages, and the one a city opens from
 * the nav would not be the one the ratified design became.
 */
const p = new URL("../web/index.html", import.meta.url);
const before = fs.readFileSync(p, "utf8");
const after = bakeParksLensInto(before);

if (after === before) {
  console.log("parks lens already in sync; web/index.html unchanged");
} else {
  fs.writeFileSync(p, after);
  console.log("baked the Parks lens into web/index.html");
}

/**
 * The bake's own post-conditions, and they are the ABSENCES rather than the
 * presences: this is the one lens where a tile or a table reaching the shipped
 * document is the whole defect. The composer sentence must be there verbatim,
 * because a paraphrase is how the surface would start asserting something the
 * product does not say.
 */
const section = bakeParksLensInto(before).match(
  /<section class="lens roster-lens" id="lens-parks">[\s\S]*?<section class="lens" id="lens-police">/,
)?.[0];
if (!section) throw new Error("the baked Parks section could not be re-read");
if (/<table|<thead|data-metric|class="metric"/.test(section)) {
  throw new Error("a table or a metric tile reached the shipped Parks section");
}
const rows = [...section.matchAll(/data-roster-region="([a-z-]+):(\d+)"/g)];
if (rows.length !== 5) throw new Error(`the shipped Parks section carries ${rows.length} roster rows, not 5`);
if (!section.includes("parks-facilities is not a registered domain, so this surface is not built")) {
  throw new Error("the composer sentence is not on the shipped Parks section verbatim");
}
console.log(`post-conditions: no table, no metric tile, ${rows.length} roster rows, composer sentence verbatim`);
