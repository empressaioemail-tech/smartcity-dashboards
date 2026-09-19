/**
 * G-151 — the Parks surface, proven by violation, in both directions.
 *
 * `check.mjs --dir` passing on the built surface is only half an argument. The
 * other half is that a violated surface makes it FAIL. This takes an exported
 * built surface and plants each defect this lens exists to refuse, one per
 * mutant, then reports whether the check refuses each one — and whether it still
 * passes the unmutated export, because a check that failed everything would
 * catch all of them and prove nothing.
 *
 * IT ALSO PLANTS ONE DEFECT ON THE OTHER SIDE OF THE TWO-SIDED RULE. The design's
 * check reads Difference.dc.html from its OWN folder, so a mutant directory
 * cannot reach it: that half of the rule is proven by copying the design folder
 * to a scratch directory, breaking the contrast board's composer quotation
 * there, and running the copy's check. Without it a passing verdict would only
 * ever have been observed on one side of the rule that folder exists for.
 *
 *   node scripts/prove-parks-lens-refusals.mjs <export-dir> [out-dir]
 *
 * The export directory is whatever scripts/export-parks-lens.mjs wrote.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const exportDir = process.argv[2];
if (!exportDir || !fs.existsSync(exportDir)) {
  console.error("\nUsage: node scripts/prove-parks-lens-refusals.mjs <export-dir> [out-dir]");
  console.error("The export directory is what scripts/export-parks-lens.mjs wrote.");
  process.exit(2);
}
const OUT = process.argv[3] || path.join(exportDir, "mutants");

/** The design folder lives in doc_repo. Same lane's seat worktree by default. */
const DESIGN =
  process.env.G151_DESIGN ||
  path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "doc_repo", "_design", "smartcity-parks-lens");
const CHECK = path.join(DESIGN, "check.mjs");
if (!fs.existsSync(CHECK)) {
  console.error(`\nThe design check is not at ${CHECK}. Set G151_DESIGN to the design folder.`);
  process.exit(2);
}

const exportFile = fs
  .readdirSync(exportDir)
  .filter((f) => f.endsWith(".dc.html"))
  .sort()[0];
if (!exportFile) {
  console.error(`\nNo .dc.html in ${exportDir}. Run scripts/export-parks-lens.mjs first:`);
  console.error("an empty export would make every mutant unplantable, which reads as a caveat.");
  process.exit(2);
}

const html = fs.readFileSync(path.join(exportDir, exportFile), "utf8");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
console.log(`surface: ${path.join(exportDir, exportFile)}`);

const run = (dir, check = CHECK) => {
  try {
    const out = execFileSync(process.execPath, [check, "--dir", dir], { encoding: "utf8" });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ""}${err.stderr || ""}` };
  }
};

/**
 * One mutant per planted defect. Each either returns [label, html] or NAMES
 * itself unexercised rather than no-opping: a mutant whose anchor is missing
 * would be a MISS that reads as a caveat, and a defect this surface cannot
 * carry is information worth printing.
 */
const mutants = [];
const skipped = [];
const plant = (label, from, to) => {
  if (!html.includes(from)) {
    skipped.push(`${label} (the surface does not carry the anchor)`);
    return;
  }
  mutants.push([label, html.replace(from, to)]);
};

/** The composer sentence, read off the product rather than retyped. */
const { composerSentence } = await import("../src/parks-lens.mjs");
const SENTENCE = composerSentence(null);

// 1. The headline drifts into the built-surface sentence.
plant(
  "1-headline-says-it-has-not-been-read",
  ">Parks is named, and it is not built.</h2>",
  ">The parks register has not been read for this pack.</h2>",
);

// 2. A metric figure, in the shape the built-surface tiles use.
plant(
  "2-a-24px-data-font-figure",
  '<h2 style="font:650 22px/28px var(--sc-font-ui);',
  '<h2 style="font:400 24px/30px var(--sc-font-data);',
);

// 3. Parks declares a vendor gate, which it does not have.
plant("3-a-vendor-gate", ">no region, no vendor</span>", ">gatedBy parks</span>");

// 4. The badge invents a state word outside the shipped vocabulary.
plant("4-an-invented-state-word", ">Not built</span>", ">Coming soon</span>");

// 5. The badge drifts into the built-surface word, which is the subtle one.
plant("5-badge-says-not-read", ">Not built</span>", ">Not read</span>");

// 6. The roster count disagrees with the registry, on Parks.
plant('6-roster-count-for-parks', 'data-roster-region="parks:0"', 'data-roster-region="parks:1"');

// 7. The roster count disagrees with the registry, on another lens.
plant('7-roster-count-for-public-works', 'data-roster-region="public-works:2"', 'data-roster-region="public-works:3"');

// 8. A person-shaped name reaches a rendered cell.
plant(
  "8-a-person-in-a-cell",
  '<span style="min-width:0; font:400 13px/18px var(--sc-font-data); color:var(--sc-ink);">fleet</span>',
  '<span style="min-width:0; font:400 13px/18px var(--sc-font-data); color:var(--sc-ink);">S. Carrillo</span>',
);

// 9. The composer sentence is paraphrased, which is how the surface would start
//    asserting something the product does not say.
plant("9-the-composer-sentence-paraphrased", SENTENCE, "this city has no data");

// 10. The scoping attribute is renamed, which must REFUSE a verdict (exit 2)
//     rather than degrade to a whole-document scan.
plant("10-the-scope-marker-renamed", 'data-lens-body="parks"', 'data-lens-scope="parks"');

let caught = 0;
for (const [label, mutated] of mutants) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "mutant.dc.html"), mutated);
  const res = run(dir);
  if (!res.ok) {
    caught += 1;
    const line = (res.out.match(/^\s*(?:FAIL|fail)\b.*$/m) || [""])[0].trim();
    console.log(`CAUGHT  ${label}`);
    if (line) console.log(`        ${line}`);
  } else {
    console.log(`MISSED  ${label}  <-- the check passed a surface carrying this defect`);
  }
}

/* ---- the other side of the two-sided rule: the contrast board ---- */

/**
 * The check reads Difference.dc.html from its own folder, so this side can only
 * be planted against a COPY of the design folder. That copy carries
 * source-state.json too, so the mutation is the only difference between it and
 * the ratified instrument.
 */
const copy = path.join(OUT, "_design-copy");
fs.cpSync(DESIGN, copy, { recursive: true });
const diffPath = path.join(copy, "Difference.dc.html");
const diffBefore = fs.readFileSync(diffPath, "utf8");
const diffAfter = diffBefore.replace(SENTENCE, "this city has no data");
if (diffAfter === diffBefore) {
  skipped.push("11-contrast-board-stops-quoting-the-composer (the contrast board does not quote it)");
} else {
  fs.writeFileSync(diffPath, diffAfter);
  const res = run(exportDir, path.join(copy, "check.mjs"));
  if (!res.ok) {
    caught += 1;
    mutants.push(["11-contrast-board-stops-quoting-the-composer", null]);
    console.log("CAUGHT  11-contrast-board-stops-quoting-the-composer");
    const line = (res.out.match(/^\s*(?:FAIL|fail)\b.*$/m) || [""])[0].trim();
    if (line) console.log(`        ${line}`);
  } else {
    console.log("MISSED  11-contrast-board-stops-quoting-the-composer  <-- the clean export passed with the contrast side broken");
  }
  fs.writeFileSync(diffPath, diffBefore);
}

// The clean surface must still pass, or the mutants prove nothing about the rules.
const cleanDir = path.join(OUT, "clean");
fs.mkdirSync(cleanDir, { recursive: true });
fs.writeFileSync(path.join(cleanDir, "clean.dc.html"), html);
const clean = run(cleanDir);
console.log(`\ncontrol: the unmutated export ${clean.ok ? "passes" : "FAILS (the mutants are meaningless)"}`);
const exit2 = mutants.filter(([, m]) => m && m.includes('data-lens-scope="parks"'));

if (skipped.length) {
  console.log(`\nUNEXERCISED on this surface (named, not silently passed):`);
  for (const s of skipped) console.log(`  - ${s}`);
}
console.log(`planted ${mutants.length} defect(s), caught ${caught}`);
if (exit2.length) {
  console.log(`the renamed marker is among them and must refuse a verdict rather than fail one: ${exit2.length}`);
}
console.log(`\n${mutants.length - caught} missed, ${skipped.length} unexercised`);
process.exit(caught === mutants.length && clean.ok ? 0 : 1);
