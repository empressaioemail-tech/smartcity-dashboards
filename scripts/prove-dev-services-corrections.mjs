/**
 * G-154 — the four corrections, proven by violation, in both directions.
 *
 * `check.mjs --dir` passing is only half an argument. The other half is that a
 * violated surface makes it FAIL. This takes an exported built surface and
 * plants each of the four defects the dispatch exists to remove, one per
 * mutant, then reports whether the check refuses each one - and whether it still
 * passes the unmutated export, because a check that failed everything would
 * catch all four and prove nothing.
 *
 *   node scripts/prove-dev-services-corrections.mjs <export-dir> [out-dir]
 *
 * The export directory is whatever scripts/export-dev-services-lens.mjs wrote.
 * Run it against bastrop_tx, which is the proving pack (OPS-17 A-146): a pass on
 * template-city is not a pass.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const exportDir = process.argv[2];
if (!exportDir || !fs.existsSync(exportDir)) {
  console.error("\nUsage: node scripts/prove-dev-services-corrections.mjs <export-dir> [out-dir]");
  console.error("The export directory is what scripts/export-dev-services-lens.mjs wrote.");
  process.exit(2);
}
const OUT = process.argv[3] || path.join(exportDir, "mutants");

/** The design check lives in doc_repo. The seat worktree is the default; override for another. */
const CHECK =
  process.env.G154_CHECK ||
  path.join(
    fileURLToPath(new URL(".", import.meta.url)),
    "..", "..", "..", "seat-worktrees", "g154-dev-services-live", "doc_repo",
    "_design", "smartcity-dev-services", "check.mjs",
  );

const exportFile = fs
  .readdirSync(exportDir)
  .filter((f) => f.endsWith(".dc.html"))
  .map((f) => path.join(exportDir, f))[0];
if (!exportFile) {
  console.error(`\nNo .dc.html in ${exportDir}. Run scripts/export-dev-services-lens.mjs first:`);
  console.error("an empty export would make every mutant unplantable, which reads as a caveat.");
  process.exit(2);
}
if (!fs.existsSync(CHECK)) {
  console.error(`\nThe design check is not at ${CHECK}. Set G154_CHECK to its path.`);
  process.exit(2);
}

const html = fs.readFileSync(exportFile, "utf8");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
console.log(`surface: ${exportFile}`);

const run = (dir) => {
  try {
    const out = execFileSync(process.execPath, [CHECK, "--dir", dir], { encoding: "utf8" });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ""}${err.stderr || ""}` };
  }
};

/** One mutant per planted defect. Each returns [label, html] or throws if the surface
 *  no longer carries the anchor, because a silent no-op mutant would read as a MISS. */
const mutants = [];

// 1. A named person on the published workload ranking, which is the load strip.
{
  const m = html.match(/<span class="who">[^<]*<\/span>/);
  if (!m) throw new Error("no load-strip cell in the surface");
  mutants.push(["1-a-named-person-on-the-workload-ranking", html.replace(m[0], '<span class="who">R. McBain</span>')]);
}

// 2. A Place tab back on the strip.
{
  const m = html.match(/<div class="tabs" role="tablist"[^>]*>[\s\S]*?<\/div>/);
  if (!m) throw new Error("no tab strip");
  const planted = m[0].replace(
    /(<a role="tab"[^>]*>)/,
    '<a role="tab" aria-selected="false" data-tab="place" href="/?lens=development-services&amp;tab=place">Place</a>$1',
  );
  if (planted === m[0]) throw new Error("no tab to insert beside");
  mutants.push(["2-a-place-tab", html.replace(m[0], planted)]);
}

// 3. Licence rows out of the design's sort order.
{
  const m = html.match(/<tbody id="ds-lic-rows">[\s\S]*?<\/tbody>/);
  if (!m) throw new Error("no licence queue");
  const rows = [...m[0].matchAll(/<tr>[\s\S]*?<\/tr>/g)].map((r) => r[0]);
  if (rows.length < 2) throw new Error(`only ${rows.length} licence row(s), nothing to reorder`);
  const reversed = m[0].replace(rows.join(""), [...rows].reverse().join(""));
  if (reversed === m[0]) throw new Error("the licence body did not change");
  mutants.push(["3-licence-rows-out-of-order", html.replace(m[0], reversed)]);
}

// 4. A resident named beside an address, in the permit pipeline's Applicant column.
//    Deliberately a Title Case name, which is the shape the people rule cannot see.
{
  const m = html.match(/<tbody id="ds-pipeline-rows">[\s\S]*?<\/tbody>/);
  if (!m) throw new Error("no pipeline queue");
  const planted = m[0].replace(/(<td class="t-data"><\/td>)/, '<td class="t-data">Dana Whitfield</td>');
  if (planted === m[0]) throw new Error("no empty applicant cell to plant a resident in");
  mutants.push(["4-a-resident-beside-an-address", html.replace(m[0], planted)]);
}

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

// The clean surface must still pass, or the mutants prove nothing about the rules.
const cleanDir = path.join(OUT, "clean");
fs.mkdirSync(cleanDir, { recursive: true });
fs.writeFileSync(path.join(cleanDir, "clean.dc.html"), html);
const clean = run(cleanDir);
console.log(`\ncontrol: the unmutated export ${clean.ok ? "passes" : "FAILS (the mutants are meaningless)"}`);
console.log(`planted ${mutants.length} defect(s), caught ${caught}`);
process.exit(caught === mutants.length && clean.ok ? 0 : 1);
