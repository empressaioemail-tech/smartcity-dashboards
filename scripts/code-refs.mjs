#!/usr/bin/env node
/* ------------------------------------------------------------ code-refs CLI

D-13.1's named instrument: `code-refs.mjs reads zero for the GCP host`.

  node scripts/code-refs.mjs --pattern <text> [--root <dir>] [--allow <n>] [--json]

Exit 0 when the count is within --allow, 1 when it exceeds it, 2 on usage error.
The pure half is src/code-refs.mjs (see its header for why the split exists and
what the exclusions are). This file only parses arguments and prints.

--allow has no default on purpose. A gate that cannot be argued with is a gate
nobody can tell from a broken one: the caller states the number it will accept,
and the report prints the denominator beside the count so "0" is a measurement
rather than an assertion.

D-13.1's invocation passes the retired v1 host as --pattern with --allow 0. The
literal is NOT written here: this file is inside the tree the instrument scans, so
a host named in this comment would be the one reference that made the cutover read
as incomplete, and an instrument that must exclude itself cannot be trusted about
anything else. The target lives in src/platform-base.test.mjs, assembled from
parts, so the string exists in exactly one place -- the assertion -- and nowhere
in the code it asserts about.
*/

import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeRefsVerdict, scanForCodeRefs } from "../src/code-refs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

function parseArgs(argv) {
  const args = { root: REPO_ROOT, allow: null, json: false, pattern: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--pattern") args.pattern = argv[++i];
    else if (arg === "--root") args.root = path.resolve(argv[++i]);
    else if (arg === "--allow") args.allow = Number.parseInt(argv[++i], 10);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.error || args.help || !args.pattern || !Number.isInteger(args.allow)) {
  if (args.error) process.stderr.write(`code-refs: ${args.error}\n`);
  process.stderr.write(
    [
      "Usage: node scripts/code-refs.mjs --pattern <text> [--root <dir>] [--allow <n>] [--json]",
      "",
      "  --pattern  literal text or a /regex/ to count references to (required)",
      "  --root     directory to scan (default: this repo)",
      "  --allow    references permitted; no default, an integer, 0 is valid (required)",
      "  --json     print the full report as JSON",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

const pattern = args.pattern.startsWith("/") && args.pattern.lastIndexOf("/") > 0
  ? new RegExp(args.pattern.slice(1, args.pattern.lastIndexOf("/")), args.pattern.slice(args.pattern.lastIndexOf("/") + 1))
  : args.pattern;

const report = scanForCodeRefs({ root: args.root, pattern });
const verdict = codeRefsVerdict(report, { allow: args.allow });

if (args.json) {
  process.stdout.write(`${JSON.stringify({ ...verdict, matches: report.matches, skippedDirs: report.skippedDirs }, null, 2)}\n`);
} else {
  process.stdout.write(`code-refs ${verdict.verdict}  pattern=${verdict.pattern}\n`);
  process.stdout.write(`  count=${verdict.count}  allow=${verdict.allow}  filesScanned=${verdict.filesScanned}  filesSkipped=${verdict.filesSkipped}\n`);
  process.stdout.write(`  excluded dirs: ${verdict.exclusions.join(", ") || "(none)"}\n`);
  for (const match of report.matches.slice(0, 20)) {
    process.stdout.write(`  ${match.file}:${match.line}:${match.column}  ${match.text}\n`);
  }
}

process.exit(verdict.pass ? 0 : 1);
