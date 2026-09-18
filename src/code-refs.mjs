/* ---------------------------------------------------------------- code refs

D-13.1 names an instrument and nothing else: "`code-refs.mjs` reads zero for the
GCP host." This is that instrument's pure half -- a code-REFERENCE counter, in
the shape of scripts/a11y-scan.mjs's own split (the pure decision in `src/`, so
`npm test` on a bare Node image can prove it fires; the CLI in `scripts/`, so a
lane can run it and read its output).

WHY A COUNTER AND NOT A GREP. A cutover's whole failure mode is that the host
survives in the one place nobody searched, and a hand-run grep cannot say what it
DID search. So the report carries its own denominator (every file it read), its
own exclusion set (declared, not implied), and its own matches with line numbers.
"Zero" then means "zero in the N files this instrument read, minus the M files it
declares it did not" -- which is falsifiable. A bare "0 matches" from a grep whose
`--include` flags nobody wrote down is not.

The exclusion set is part of the contract (DEV_PROCESS: an instrument's exclusion
set is part of its contract) because an exclusion is exactly how a scan comes back
falsely clean. There are two here and both are named in the report:
  node_modules/  vendored third-party code, not ours to cut over
  .git/          object store, not source
Nothing else is excluded -- in particular no source file is excluded, and no file
is skipped for containing the very string being searched for, so the instrument's
own target text cannot hide inside an allowlist.

WHAT THIS DOES NOT DO: it does not decide. It returns counts and matches; the
pattern and the allowed count come from the caller, so a threshold is a stated
number in a reviewable file rather than a default baked into the tool. The D-13.1
target and its allowed count live in src/platform-base.test.mjs beside the rule
they enforce.
*/

import fs from "node:fs";
import path from "node:path";

/**
 * Directories never descended into. Named here rather than at each call site so
 * the report and the walk cannot disagree about what was skipped.
 */
export const CODE_REFS_EXCLUDED_DIRS = ["node_modules", ".git"];

/**
 * Extensions scanned. An allowlist rather than a denylist so a new binary blob
 * cannot quietly enter the denominator: a file kind that is not named here is
 * reported as NOT SCANNED, which is a visible gap, instead of being read as
 * text and producing mojibake matches nobody can act on.
 */
export const CODE_REFS_SCANNED_EXTENSIONS = [
  ".mjs", ".js", ".cjs", ".jsx", ".ts", ".tsx",
  ".json", ".yml", ".yaml", ".toml",
  ".md", ".txt", ".html", ".css", ".sh",
  ".example", ".env", ".gitattributes", ".gitignore", ".dockerignore", "",
];

function extensionOf(name) {
  const base = name.toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot);
}

function isScannable(name) {
  if (name === "Dockerfile") return true;
  return CODE_REFS_SCANNED_EXTENSIONS.includes(extensionOf(name));
}

/**
 * Every file this instrument would read under `root`, as paths relative to
 * `root`, sorted so two runs (and two machines) report the same denominator in
 * the same order.
 */
export function listScannedFiles(root, { excludedDirs = CODE_REFS_EXCLUDED_DIRS } = {}) {
  const files = [];
  const skippedDirs = [];
  const walk = (dir, relDir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (excludedDirs.includes(entry.name)) {
          skippedDirs.push(rel);
          continue;
        }
        walk(path.join(dir, entry.name), rel);
        continue;
      }
      if (entry.isFile() && isScannable(entry.name)) files.push(rel);
    }
  };
  walk(root, "");
  return { files: files.sort(), skippedDirs: skippedDirs.sort() };
}

/**
 * Count references to `pattern` across the scanned tree.
 *
 * `pattern` is a string, matched literally, or a RegExp. `matches` carries 1-based
 * line and column numbers and the matched line, so a finding can be opened rather
 * than guessed at. A file that cannot be read as UTF-8 text lands in `unreadable`
 * rather than being silently dropped -- a file the instrument could not read is a
 * hole in the denominator, not a pass.
 */
export function scanForCodeRefs({ root, pattern, excludedDirs = CODE_REFS_EXCLUDED_DIRS } = {}) {
  if (!root) throw new Error("code-refs scan requires a root");
  if (!pattern) throw new Error("code-refs scan requires a pattern");
  const { files, skippedDirs } = listScannedFiles(root, { excludedDirs });
  const regex = pattern instanceof RegExp ? pattern : new RegExp(escapeRegExp(String(pattern)), "g");
  const matches = [];
  const unreadable = [];
  for (const rel of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      unreadable.push(rel);
      continue;
    }
    if (text.includes("\u0000")) {
      unreadable.push(rel);
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      regex.lastIndex = 0;
      let hit;
      while ((hit = regex.exec(lines[i])) !== null) {
        matches.push({ file: rel, line: i + 1, column: hit.index + 1, text: lines[i].trim() });
        if (hit.index === regex.lastIndex) regex.lastIndex += 1;
      }
    }
  }
  return {
    root,
    pattern: pattern instanceof RegExp ? String(pattern) : String(pattern),
    count: matches.length,
    matches,
    filesScanned: files.length,
    files: files.length,
    skippedDirs,
    exclusions: { dirs: [...excludedDirs], unreadable },
    scanned: files,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The verdict a gate reads. `allow` is required and has no default: an instrument
 * whose tolerance is implicit cannot be argued with, and the one caller that
 * matters (the retired v1 host) allows exactly zero.
 */
export function codeRefsVerdict(report, { allow } = {}) {
  if (!Number.isInteger(allow)) throw new Error("code-refs verdict requires an integer allow");
  const pass = report.count <= allow;
  return {
    pass,
    verdict: pass ? "PASS" : "FAIL",
    pattern: report.pattern,
    count: report.count,
    allow,
    filesScanned: report.filesScanned,
    filesSkipped: report.skippedDirs.length,
    exclusions: report.exclusions.dirs,
    basis: pass
      ? `${report.count} reference(s) in ${report.filesScanned} scanned file(s), allow ${allow}`
      : `${report.count} reference(s) in ${report.filesScanned} scanned file(s), allow ${allow} -- ${report.matches
          .slice(0, 10)
          .map((m) => `${m.file}:${m.line}`)
          .join(", ")}`,
  };
}
