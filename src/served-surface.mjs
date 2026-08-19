/**
 * ---------------------------------------------------------------------------
 * THE SERVED SURFACE, DERIVED ONCE (G-88 items 3 and 7)
 *
 * What this product puts in front of a browser, and the shipped-class rule that
 * measures it. Both were previously written out twice: the class rule lived in
 * src/ui.test.mjs in a hardened form and in src/city-identity.test.mjs in a
 * weaker one, and the two disagreed on three axes. One rule with two
 * implementations is the CTRL-1 shape, and the fix for it is a single source of
 * truth rather than two careful edits (DEV_PROCESS 2.4).
 *
 * Everything here is DERIVED from src/server.mjs. Nothing is a hand-written
 * list, because a hand-written list is what let three of five markup sources go
 * unscanned: the list was written once, the server grew, and nothing connected
 * the two.
 * ---------------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** CRLF normalization. This repo is cloned on Windows with autocrlf, so a rule
 *  that counts newlines or spans them must read one form, not two. */
export const lf = (text) => text.replace(/\r\n/g, "\n");

export function readSource(rel) {
  return lf(fs.readFileSync(path.join(root, rel), "utf8"));
}

const serverSrc = readSource("src/server.mjs");

/**
 * Where the browser gets its bytes, DERIVED from server.mjs's sendFile call
 * sites rather than hardcoded.
 *
 * The anchor is the FUNCTION NAME plus the path.join argument, never the
 * argument list, and `[^)]*?` absorbs any number of leading arguments without
 * being able to escape the call. That is not hypothetical robustness: G-88
 * item 8 changed this helper from sendFile(res, filePath, contentType) to
 * sendFile(req, res, filePath, contentType), and an extractor anchored on the
 * literal "sendFile(res," would have found zero call sites the moment that
 * merged and every gate built on it would have scanned nothing, silently.
 *
 * The count assertion in ui.test.mjs's tripwire test is the backstop for the
 * case this regex genuinely cannot read: a call site whose path is a variable
 * rather than an inline path.join. The derivation would find fewer sites than
 * there are calls, and that test fails rather than the gate quietly shrinking.
 */
const SEND_FILE_DIRS = { WEB: "web", __dirname: "src" };

function servedAssets() {
  const found = new Set();
  const re = /sendFile\([^)]*?path\.join\(\s*(WEB|__dirname)\s*,\s*"([^"]+)"\s*\)/g;
  for (const m of serverSrc.matchAll(re)) found.add(`${SEND_FILE_DIRS[m[1]]}/${m[2]}`);
  return [...found].sort();
}

export const SERVED_ASSETS = servedAssets();

/** The stylesheets are the DEFINITION side of the class gate: they are what
 *  stylesheetClasses() counts, not what the scan reads for class usage. */
export const STYLESHEET_SOURCES = SERVED_ASSETS.filter((rel) => rel.endsWith(".css"));

/**
 * The served scripts. The browser executes these, so they are the population
 * that ADDRESSES the markup: getElementById, selector strings, id comparisons.
 */
export const SCRIPT_SOURCES = SERVED_ASSETS.filter((rel) => /\.m?js$/.test(rel));

/**
 * Markup that reaches the browser without being served: shell-homes.mjs emits
 * the connections register as a server template string and gets into
 * index.html only through scripts/bake-connections.mjs. That bake's output is
 * never byte-asserted, so a class renamed here and not re-baked ships stale and
 * passes every test. Scanned at source for that reason, and named separately so
 * the derived list stays honestly derived.
 */
export const BAKE_SOURCES = ["src/shell-homes.mjs"];

/** The five markup sources every gate scans. */
export const MARKUP_SOURCES = [
  ...SERVED_ASSETS.filter((rel) => !rel.endsWith(".css")),
  ...BAKE_SOURCES,
].sort();

export function readMarkupSources() {
  const out = {};
  for (const rel of MARKUP_SOURCES) out[rel] = readSource(rel);
  return out;
}

/**
 * The served URL for a source file, derived from its basename rather than from
 * a second hand-written table. Every sendFile route in this server is
 * "/" + basename, and index.html is additionally served at "/". Used to resolve
 * a browser import specifier such as "/staff-review.mjs" back to the file it
 * came from, so the addressability instrument can follow an import across a
 * module boundary without being told where anything lives.
 */
export function sourceForServedPath(urlPath) {
  const base = String(urlPath).replace(/^\//, "");
  const hits = SERVED_ASSETS.filter((rel) => rel.slice(rel.lastIndexOf("/") + 1) === base);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Strip JavaScript comments while preserving the contents of every string and
 * template literal.
 *
 * MEASURED NEED, not hygiene. web/app.js explains its own identity mechanism in
 * prose and names [data-pack-name] and [data-pack-key] inside those comments, at
 * three separate places. Any scan that reads attribute or id references out of a
 * script without stripping comments counts prose as behaviour. That is exactly
 * the defect G-88 item 3 closed one layer up, where the class rule counted six
 * words appearing only inside CSS comments as shipped classes.
 *
 * A character scanner rather than a regex, because a regex cannot tell a comment
 * from the same two characters inside a string: "https://example" is not a
 * comment and neither is `${x} // y` inside a template.
 */
export function stripJsComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      // Newlines inside the comment are preserved so line numbers do not shift.
      const span = src.slice(i, end < 0 ? n : end + 2);
      out += span.replace(/[^\n]/g, " ");
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === "/" && d === "/") {
      const end = src.indexOf("\n", i);
      out += " ".repeat((end < 0 ? n : end) - i);
      i = end < 0 ? n : end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) break;
        j += 1;
      }
      out += src.slice(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * ---------------------------------------------------------------------------
 * THE SHIPPED-CLASS RULE
 *
 * One assertion: every class this product puts in front of a browser is defined
 * in a stylesheet this product serves. ONE implementation, called by both
 * src/ui.test.mjs and src/city-identity.test.mjs.
 * ---------------------------------------------------------------------------
 */

/**
 * The DEFINED set. Ported VERBATIM from the SmartCity kit's counting rule,
 * `stylesheetClasses()` in the kit's `test/_lib.mjs`, which is the authority for
 * this rule across the product line.
 *
 * Ported and deliberately NOT imported: the rule is not in the kit's package
 * exports, and depending on the kit would add an npm dependency to a repo whose
 * only dependency is pg.
 *
 * Counting rule: the served stylesheets, CRLF-normalized, CSS COMMENTS
 * STRIPPED, then every "." followed by an identifier, deduplicated.
 */
export function stylesheetClasses() {
  const css = STYLESHEET_SOURCES.map((rel) => readSource(rel))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Set();
  for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) found.add(m[1]);
  return found;
}

/** The same match WITHOUT the comment strip. Kept so the two counting rules can
 *  be compared at the point where the difference is claimed, rather than being
 *  asserted from memory in a comment that goes stale. */
export function stylesheetClassesWithoutCommentStrip() {
  const css = STYLESHEET_SOURCES.map((rel) => readSource(rel)).join("\n");
  const found = new Set();
  for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) found.add(m[1]);
  return found;
}

/**
 * The USED set for one source. Every extractor runs against every source rather
 * than one extractor per file type, because which file carries which form is not
 * a fact worth encoding: index.html could gain a script, app.js already carries
 * template markup, and shell-homes.mjs is a server template emitting class="".
 * ${...} spans are blanked rather than kept, so an interpolated value never
 * reads as a class name.
 */
export function classesUsed(text) {
  const used = new Set();
  const addAll = (raw) => {
    for (const token of raw.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (token) used.add(token);
  };
  for (const m of text.matchAll(/class="([^"]*)"/g)) addAll(m[1]);
  for (const m of text.matchAll(/class=`([^`]*)`/g)) addAll(m[1]);
  for (const m of text.matchAll(/className\s*=\s*"([^"]*)"/g)) addAll(m[1]);
  for (const m of text.matchAll(/className\s*=\s*`([^`]*)`/g)) addAll(m[1]);
  for (const m of text.matchAll(/classList\.(add|remove|toggle)\(([^)]*)\)/g)) {
    /**
     * DOM semantics, and they differ per method: add() and remove() take a class
     * name in EVERY argument, so classList.remove("is-presented", "is-max")
     * contributes both. toggle() takes one class name and an optional force
     * boolean, so only its first argument is a class. Reading toggle's second
     * argument as a class is how the state values "presented" and "max" read as
     * strays on the first run of this widened extractor - a false positive the
     * gate itself caught, which is the arm working.
     */
    const literals = [...m[2].matchAll(/"([^"]+)"/g)].map((lit) => lit[1]);
    for (const cls of m[1] === "toggle" ? literals.slice(0, 1) : literals) used.add(cls);
  }
  return used;
}

/** Every class used across the given sources that no served stylesheet defines. */
export function strayClasses(sources, defined, excluded) {
  const found = new Set();
  for (const text of Object.values(sources)) {
    for (const cls of classesUsed(text)) {
      if (!defined.has(cls) && !excluded.has(cls)) found.add(cls);
    }
  }
  return [...found].sort();
}

/**
 * Exclusion set for the class rule, stated once for both callers.
 *
 * roster-lens is a pre-G-77 marker class in the nav that carries no style. It is
 * a DELETION TICKET, not permanent amnesty - the fix is removing it from the
 * five sections of web/index.html that carry it, at which point this set becomes
 * empty. A later lane owns that deletion. Nothing else is excused. A new stray
 * is a finding, never a new entry here.
 */
export const KNOWN_UNSTYLED = new Set(["roster-lens"]);
