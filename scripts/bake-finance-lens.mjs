import fs from "node:fs";
import { bakeFinanceLensInto } from "../src/finance-lens.mjs";

/**
 * G-156. The bake, and it calls ONE implementation.
 *
 * The transform lives in src/finance-lens.mjs so that this script and
 * src/finance-lens.test.mjs call the same code. A transform that lives only in a
 * script cannot be asserted, and the freshness failure it produces is silent in
 * both directions: a section edited here and not re-baked ships stale, and
 * web/index.html edited by hand and not re-derived ships a version of the lens
 * no code produces. The test asserts web/index.html is a FIXED POINT of
 * bakeFinanceLensInto(), which is freshness without anybody remembering to run
 * this.
 */
const p = new URL("../web/index.html", import.meta.url);
const before = fs.readFileSync(p, "utf8");
const after = bakeFinanceLensInto(before);

if (after === before) {
  console.log("finance lens already in sync; web/index.html unchanged");
} else {
  fs.writeFileSync(p, after);
  console.log("baked the Finance lens full shape into web/index.html");
}

/**
 * The bake's own post-conditions. The unread default must carry NO money: the
 * capture quotation is one pack's v1 screen contents and is returned for that
 * pack only, so a figure in the shared document would be Bastrop's data on every
 * other city's page.
 */
const MONEY = /\$[0-9][0-9,.]*\s?[MKB]?/g;
const section = bakeFinanceLensInto(before).match(
  /<section class="lens" id="lens-finance">[\s\S]*?<section class="lens" id="lens-citizen">/,
)?.[0];
if (!section) throw new Error("the baked Finance section could not be re-read");
const figures = section.match(MONEY) || [];
if (figures.length) {
  throw new Error(`the unread default carries ${figures.length} money figure(s): ${[...new Set(figures)].join(", ")}`);
}
for (const id of ["lens-finance", "finance-source-metrics", "finance-source-register", "finance-appropriation", "finance-refusals", "finance-acquisition", "finance-capture", "finance-fund-rows"]) {
  if (!section.includes(`id="${id}"`)) throw new Error(`${id} missing from the baked section`);
}
console.log("post-conditions: 0 money figures in the unread default, 8 regions present");
