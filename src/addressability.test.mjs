/**
 * ---------------------------------------------------------------------------
 * THE ADDRESSABILITY GATE (G-88 item 7)
 *
 * A screen that renders perfectly and cannot be driven passes every other gate
 * in this repo and in the kit. This is the gate that catches it.
 *
 * WHY IT EXISTS. A design pass translates React kit compositions into static
 * markup. A kit composition emits zero `id` attributes, zero `hidden` branches
 * and zero `data-*` hooks. The kit's parity proof reduces both sides to a
 * normalized shape string before comparing, and what it normalizes away is
 * exactly `id`, every element carrying `hidden`, and every non-class attribute -
 * so its nineteen green tests are silent about this layer BY CONSTRUCTION and
 * were never evidence either way. The product's class gate counts classes and
 * would never look. Translation is mechanical for what the browser paints and
 * lossy for what the served scripts can address.
 *
 * WHAT IT ASSERTS. Everything the served scripts and the served stylesheets
 * ADDRESS is still attached to the served markup: ids, hidden branches, and
 * data-* behaviour hooks. Three diffs, and each has an injected arm in this same
 * test file so an unrun check and a passing check cannot look alike.
 *
 * THE DESIGN RULE THAT MAKES IT NON-VACUOUS. Every addressing expression is
 * resolved to concrete strings through NAMED rules, and an expression that no
 * rule resolves FAILS THE TEST naming itself. It is never skipped. A regex for
 * getElementById("literal") finds 27 of the 40 ids web/app.js reaches through
 * getElementById, because the rest arrive through a helper, a loop variable or
 * a constructor parameter - and a gate that silently scans a subset is this
 * program's own defect class rather than a hypothetical one.
 * ---------------------------------------------------------------------------
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BAKE_SOURCES,
  MARKUP_SOURCES,
  SCRIPT_SOURCES,
  SERVED_ASSETS,
  SERVED_DOCUMENTS,
  readSource,
  root,
  sourceForServedPath,
  stripJsComments,
} from "./served-surface.mjs";

/* ===========================================================================
 * 1. SOURCE TEXT
 * ======================================================================== */

/**
 * An inline <script> block is CODE that reaches the browser, not markup. It
 * addresses and it writes; it attaches nothing.
 *
 * G-89 made that distinction load-bearing rather than academic. Its first-paint
 * fix put a classless inline script in the head of web/index.html that stamps
 * data-surface, data-tab and data-atab on the document element before the parser
 * reaches the body - deliberately NOT in app.js, because a type=module script is
 * deferred by definition and can never run before first paint. So the earliest
 * writer of a behaviour hook in this product lives inside a markup file. A
 * derivation that reads only the files server.mjs sends as scripts cannot see it.
 *
 * Both directions matter and both are handled below: inline blocks JOIN the
 * script population, and their bodies LEAVE the markup population.
 */
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

/** Blank an inline script's body, preserving length and line count so nothing
 *  downstream shifts. */
function stripInlineScripts(html) {
  return html.replace(INLINE_SCRIPT, (whole, body) =>
    whole.replace(body, body.replace(/[^\n]/g, " ")),
  );
}

/**
 * Every script the browser executes, comments stripped: the served scripts, plus
 * each inline block in a scanned markup source keyed as `<source>#script<n>`.
 *
 * web/app.js names [data-pack-name] and [data-pack-key] inside prose comments at
 * three places; without the strip, prose reads as behaviour.
 */
function scriptTexts(overrides = {}) {
  const out = {};
  for (const rel of SCRIPT_SOURCES) {
    out[rel] = stripJsComments(overrides[rel] ?? readSource(rel));
  }
  for (const rel of SERVED_DOCUMENTS) {
    if (SCRIPT_SOURCES.includes(rel)) continue;
    const raw = overrides[rel] ?? readSource(rel);
    let n = 0;
    for (const m of raw.matchAll(INLINE_SCRIPT)) {
      n += 1;
      out[`${rel}#script${n}`] = stripJsComments(m[1]);
    }
  }
  return out;
}

const scriptText = scriptTexts();
const SCRIPT_KEYS = Object.keys(scriptText);

/**
 * Markup, for the ATTACHED scans. Comments are stripped from script-typed
 * sources and inline script bodies are blanked, for one reason: an attribute
 * NAME written inside code is not an attached attribute. Today the head script
 * writes setAttribute("data-surface", ...) with the name in a string literal,
 * and only the quote character in front of it keeps that out of the attached
 * set. Depending on a quote is not a rule.
 */
function readServedDocuments(overrides = {}) {
  const out = {};
  for (const rel of SERVED_DOCUMENTS) {
    const raw = overrides[rel] ?? readSource(rel);
    out[rel] = /\.m?js$/.test(rel) ? stripJsComments(raw) : stripInlineScripts(raw);
  }
  return out;
}

/* ===========================================================================
 * 2. A VERY SMALL RESOLVER
 *
 * Not a JavaScript parser. Four source shapes, each named, each with a hard
 * failure when it does not apply.
 * ======================================================================== */

/** Advance past a quoted or templated span starting at i. Returns the index of
 *  the closing quote. */
function endOfString(src, i) {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "\\") {
      j += 2;
      continue;
    }
    if (src[j] === quote) return j;
    j += 1;
  }
  return src.length - 1;
}

/** The index of the bracket closing the one at openIdx, skipping string spans. */
function matchBracket(src, openIdx) {
  const open = src[openIdx];
  const close = open === "(" ? ")" : open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = endOfString(src, i);
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split a comma-separated argument or parameter list at depth zero. */
function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      i = endOfString(text, i);
      continue;
    }
    if ("([{".includes(c)) depth += 1;
    else if (")]}".includes(c)) depth -= 1;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** The arguments of the call whose "(" sits at parenIdx. */
function callArgs(src, parenIdx) {
  const end = matchBracket(src, parenIdx);
  if (end < 0) return null;
  return { args: splitTopLevel(src.slice(parenIdx + 1, end)), end };
}

/**
 * Every named callable in one source: function declarations and class
 * constructors. Arrow callbacks are deliberately absent - they introduce no
 * parameter this product addresses ids through, and an identifier that turns out
 * to live in one fails loudly rather than resolving to nothing.
 */
function indexCallables(rel, src) {
  const out = [];
  const add = (kind, name, paramsText, bodyOpen) => {
    const bodyEnd = matchBracket(src, bodyOpen);
    if (bodyEnd < 0) return;
    out.push({
      rel,
      kind,
      name,
      params: splitTopLevel(paramsText).map((p) => p.trim()),
      bodyStart: bodyOpen,
      bodyEnd,
      body: src.slice(bodyOpen, bodyEnd + 1),
    });
  };
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const parenIdx = m.index + m[0].length - 1;
    const close = matchBracket(src, parenIdx);
    const bodyOpen = src.indexOf("{", close);
    if (close < 0 || bodyOpen < 0) continue;
    add("function", m[1], src.slice(parenIdx + 1, close), bodyOpen);
  }
  for (const m of src.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)\s*\{/g)) {
    const classOpen = m.index + m[0].length - 1;
    const classEnd = matchBracket(src, classOpen);
    if (classEnd < 0) continue;
    const ctor = src.slice(classOpen, classEnd).indexOf("constructor(");
    if (ctor < 0) continue;
    const parenIdx = classOpen + ctor + "constructor".length;
    const close = matchBracket(src, parenIdx);
    const bodyOpen = src.indexOf("{", close);
    if (close < 0 || bodyOpen < 0) continue;
    add("constructor", m[1], src.slice(parenIdx + 1, close), bodyOpen);
  }
  return out;
}

const callables = {};
for (const rel of SCRIPT_KEYS) callables[rel] = indexCallables(rel, scriptText[rel]);

/** The innermost named callable containing an offset, or null for module scope. */
function enclosing(rel, offset) {
  let best = null;
  for (const fn of callables[rel]) {
    if (offset > fn.bodyStart && offset < fn.bodyEnd) {
      if (!best || fn.bodyStart > best.bodyStart) best = fn;
    }
  }
  return best;
}

/** Text to search for a binding: a callable's body, or everything outside every
 *  callable when the scope is module level. */
function scopeText(rel, fn) {
  if (fn) return fn.body;
  const src = scriptText[rel];
  const spans = callables[rel]
    .map((c) => [c.bodyStart, c.bodyEnd])
    .sort((a, b) => a[0] - b[0]);
  let out = "";
  let cursor = 0;
  for (const [s, e] of spans) {
    if (s < cursor) continue;
    out += src.slice(cursor, s);
    cursor = e + 1;
  }
  return out + src.slice(cursor);
}

/** Call sites of a callable, as argument lists. */
function callSites(fn) {
  const src = scriptText[fn.rel];
  const re =
    fn.kind === "constructor"
      ? new RegExp(`\\bnew\\s+${fn.name}\\s*\\(`, "g")
      : new RegExp(`(?<!function\\s)\\b${fn.name}\\s*\\(`, "g");
  const out = [];
  for (const m of src.matchAll(re)) {
    const parenIdx = m.index + m[0].length - 1;
    const call = callArgs(src, parenIdx);
    if (!call) continue;
    out.push({ args: call.args, scope: enclosing(fn.rel, parenIdx) });
  }
  return out;
}

/* --- module-level const arrays and string consts, in any source ------------ */

function constArrayMembers(src, name, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const m = src.match(
    new RegExp("(?:export\\s+)?const\\s+" + name + "\\s*=\\s*\\[([\\s\\S]*?)\\]"),
  );
  if (!m) return null;
  const out = new Set();
  for (const part of splitTopLevel(m[1])) {
    const lit = part.match(/^["'](.*)["']$/);
    if (lit) {
      out.add(lit[1]);
      continue;
    }
    if (part.startsWith("...")) {
      const inner = constArrayMembers(src, part.slice(3).trim(), seen);
      if (!inner) return null;
      for (const v of inner) out.add(v);
      continue;
    }
    const str = constString(src, part);
    if (str === null) return null;
    out.add(str);
  }
  return out;
}

function constString(src, name) {
  const m = src.match(
    new RegExp("(?:export\\s+)?const\\s+" + name + "\\s*=\\s*[\"'](.*?)[\"']\\s*;"),
  );
  return m ? m[1] : null;
}

/* --- R5: a field of a value returned by an imported resolver --------------- */

/**
 * The vocabulary a resolver function constrains one of its returned fields to.
 *
 * src/staff-review.mjs is the declaration site for every routable id family in
 * this product: it takes the query string, clamps each value to a declared
 * array, and web/app.js composes ids out of the result. Following it is what
 * takes this gate from 40 ids to 64 - the lens-, work-, tab- and atab- section
 * ids are addressed by NO getElementById anywhere and are exactly what a
 * translated screen drops.
 */
function returnedFieldVocabulary(rel, fnName, field) {
  const src = scriptText[rel];
  const fn = indexCallables(rel, src).find((c) => c.name === fnName);
  if (!fn) return null;
  const retIdx = fn.body.indexOf("return {");
  if (retIdx < 0) return null;
  const retEnd = matchBracket(fn.body, fn.body.indexOf("{", retIdx + "return".length));
  const returned = splitTopLevel(
    fn.body.slice(fn.body.indexOf("{", retIdx + "return".length) + 1, retEnd),
  );
  if (!returned.includes(field)) return null;
  const decl = fn.body.match(new RegExp("\\bconst " + field + " =([\\s\\S]*?);"));
  if (!decl) return null;
  const expr = decl[1];
  const out = new Set();
  let sawArray = false;
  for (const m of expr.matchAll(/([A-Za-z_$][\w$]*)\.includes\(/g)) {
    const members = constArrayMembers(src, m[1]);
    if (!members) return null;
    sawArray = true;
    for (const v of members) out.add(v);
  }
  if (!sawArray) return null;
  for (const m of expr.matchAll(/:\s*"([^"]*)"/g)) out.add(m[1]);
  for (const m of expr.matchAll(/:\s*([A-Za-z_$][\w$]*)\s*$/gm)) {
    const str = constString(src, m[1]);
    if (str !== null) out.add(str);
  }
  /**
   * The empty string is the resolver's no-selection fallback. It composes the id
   * "tab-", which matches no element, and the caller guards it (workOn is
   * Boolean(work)). Dropped with its rule stated rather than silently.
   */
  out.delete("");
  return out;
}

/** Where an identifier's value came from, when it came from a call. */
function callOrigin(rel, ident, fn, depth = 0) {
  if (depth > 6) return null;
  const text = scopeText(rel, fn);
  const direct = text.match(
    new RegExp("\\bconst\\s+" + ident + "\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*\\("),
  );
  if (direct) {
    const importer = scriptText[rel].match(
      new RegExp("import\\s*\\{[^}]*\\b" + direct[1] + "\\b[^}]*\\}\\s*from\\s*\"([^\"]+)\""),
    );
    if (!importer) return { rel, fnName: direct[1] };
    const target = sourceForServedPath(importer[1]);
    return target ? { rel: target, fnName: direct[1] } : null;
  }
  if (fn) {
    const index = fn.params.indexOf(ident);
    if (index >= 0) {
      for (const site of callSites(fn)) {
        const arg = site.args[index];
        if (!arg || !/^[A-Za-z_$][\w$]*$/.test(arg)) continue;
        const origin = callOrigin(fn.rel, arg, site.scope, depth + 1);
        if (origin) return origin;
      }
    }
  }
  if (fn) return callOrigin(rel, ident, null, depth + 1);
  return null;
}

/* --- the resolver proper --------------------------------------------------- */

const unresolved = [];

function note(rel, expr, why) {
  unresolved.push(`${rel}: ${expr.replace(/\s+/g, " ").slice(0, 90)}  [${why}]`);
  return null;
}

/**
 * Resolve one addressing expression to the set of concrete strings it can take.
 *
 * R1 string literal.  R2 template literal.  R3 for-of over an array.
 * R4 function or constructor parameter, through its call sites.
 * R5 destructured field of a value returned by a resolver in another served
 *    script.
 * Anything else records itself in `unresolved` and fails the gate.
 */
function resolveExpr(rel, expr, fn, depth = 0) {
  const text = String(expr).trim();
  if (depth > 8) return note(rel, text, "resolution depth exceeded");

  const lit = text.match(/^"([^"]*)"$/) || text.match(/^'([^']*)'$/);
  if (lit) return new Set([lit[1]]); // R1

  if (text.startsWith("`") && text.endsWith("`")) {
    // R2: cross-product of the literal chunks with each hole's value set.
    const inner = text.slice(1, -1);
    let acc = [""];
    let cursor = 0;
    const holes = [...inner.matchAll(/\$\{([^}]*)\}/g)];
    for (const hole of holes) {
      const chunk = inner.slice(cursor, hole.index);
      const values = resolveExpr(rel, hole[1], fn, depth + 1);
      if (!values) return null;
      const next = [];
      for (const prefix of acc) for (const v of values) next.push(prefix + chunk + v);
      acc = next;
      cursor = hole.index + hole[0].length;
    }
    const tail = inner.slice(cursor);
    return new Set(acc.map((s) => s + tail));
  }

  const ident = text.match(/^(?:this\.)?([A-Za-z_$][\w$]*)$/);
  if (!ident) return note(rel, text, "not a literal, a template, or an identifier");
  return resolveIdentifier(rel, ident[1], fn, depth + 1);
}

function resolveIdentifier(rel, name, fn, depth) {
  const text = scopeText(rel, fn);

  // R3: for (const NAME of <array>)
  const forOf = text.match(
    new RegExp("for\\s*\\(\\s*(?:const|let)\\s+" + name + "\\s+of\\s+([^)]+)\\)"),
  );
  if (forOf) {
    const arrayExpr = forOf[1].trim();
    if (arrayExpr.startsWith("[")) {
      const members = splitTopLevel(arrayExpr.slice(1, -1));
      const out = new Set();
      for (const member of members) {
        const values = resolveExpr(rel, member, fn, depth + 1);
        if (!values) return null;
        for (const v of values) out.add(v);
      }
      return out;
    }
    const members = constArrayMembers(scriptText[rel], arrayExpr);
    if (members) return members;
    return note(rel, arrayExpr, `for-of source for ${name} is not a resolvable array`);
  }

  // R5: const { ...NAME... } = OBJ;
  const destructure = text.match(
    new RegExp("\\bconst\\s*\\{([^}]*\\b" + name + "\\b[^}]*)\\}\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*;"),
  );
  if (destructure) {
    const origin = callOrigin(rel, destructure[2].trim(), fn);
    if (!origin) return note(rel, destructure[2], `no call origin for ${name}`);
    const vocab = returnedFieldVocabulary(origin.rel, origin.fnName, name);
    if (!vocab) {
      return note(rel, `${origin.fnName}.${name}`, "returned field has no declared vocabulary");
    }
    return vocab;
  }

  // const NAME = "literal";
  const asString = constString(scriptText[rel], name);
  if (asString !== null) return new Set([asString]);

  // R4: a parameter, resolved through every call site.
  if (fn) {
    const index = fn.params.indexOf(name);
    if (index >= 0) {
      const out = new Set();
      const sites = callSites(fn);
      if (sites.length === 0) return note(rel, name, `parameter of ${fn.name} has no call site`);
      for (const site of sites) {
        const arg = site.args[index];
        if (arg === undefined) {
          return note(rel, name, `call site of ${fn.name} omits argument ${index}`);
        }
        const values = resolveExpr(fn.rel, arg, site.scope, depth + 1);
        if (!values) return null;
        for (const v of values) out.add(v);
      }
      return out;
    }
    // Fall out to module scope.
    return resolveIdentifier(rel, name, null, depth + 1);
  }

  return note(rel, name, "no binding found in module scope");
}

/* ===========================================================================
 * 3. THE ADDRESSED SETS
 * ======================================================================== */

const ID_PREFIX_ASSERTIONS = new Set();

/** F1: document.getElementById(<expr>). */
function idsFromGetElementById(rel) {
  const src = scriptText[rel];
  const out = new Set();
  for (const m of src.matchAll(/getElementById\s*\(/g)) {
    const call = callArgs(src, m.index + m[0].length - 1);
    if (!call) continue;
    const values = resolveExpr(rel, call.args[0] ?? "", enclosing(rel, m.index));
    if (values) for (const v of values) out.add(v);
  }
  return out;
}

/** F2: "#identifier" inside a selector string. */
const SELECTOR_CALLS = /\.(querySelectorAll|querySelector|closest|matches)\s*\(/g;

function selectorStrings(rel) {
  const src = scriptText[rel];
  const out = [];
  for (const m of src.matchAll(SELECTOR_CALLS)) {
    const call = callArgs(src, m.index + m[0].length - 1);
    if (!call) continue;
    const arg = (call.args[0] ?? "").trim();
    if (/^["'`]/.test(arg)) out.push(arg.slice(1, -1));
  }
  return out;
}

function idsFromSelectors(rel) {
  const out = new Set();
  for (const selector of selectorStrings(rel)) {
    for (const m of selector.matchAll(/#([A-Za-z_-][\w-]*)/g)) out.add(m[1]);
  }
  return out;
}

/** F3: el.id === `prefix-${v}` and el.id.startsWith("prefix-"). */
function idsFromComparisons(rel) {
  const src = scriptText[rel];
  const out = new Set();
  for (const m of src.matchAll(/\.id\s*===\s*(`[^`]*`|"[^"]*"|'[^']*')/g)) {
    const values = resolveExpr(rel, m[1], enclosing(rel, m.index));
    if (values) for (const v of values) out.add(v);
  }
  for (const m of src.matchAll(/\.id\.startsWith\s*\(\s*"([^"]*)"/g)) {
    ID_PREFIX_ASSERTIONS.add(m[1]);
  }
  return out;
}

/** F4: ARIA and form IDREF wiring inside the markup itself. */
const IDREF_ATTRS = [
  "aria-describedby",
  "aria-labelledby",
  "aria-controls",
  "aria-owns",
  "aria-activedescendant",
  "aria-flowto",
  "headers",
  "list",
  "for",
];

function idsFromIdrefs(sources) {
  const out = new Set();
  const re = new RegExp(`\\b(?:${IDREF_ATTRS.join("|")})="([^"]+)"`, "g");
  for (const text of Object.values(sources)) {
    for (const m of text.matchAll(re)) {
      for (const token of m[1].split(/\s+/)) if (token) out.add(token);
    }
  }
  return out;
}

/** TRAP 2, derived: ids a served script CREATES must not be required in the
 *  static document, or the gate is permanently red and a permanently red gate is
 *  a dead gate (DEV_PROCESS 2.0). Recomputed on every run; nothing to remember. */
function idsCreatedByScripts() {
  const out = new Set();
  const forms = [];
  for (const rel of SCRIPT_KEYS) {
    const src = scriptText[rel];
    for (const m of src.matchAll(/[\w$\])"']\.id\s*=(?!=)\s*([^;]*)/g)) {
      forms.push(`${rel}: .id = ${m[1].trim().slice(0, 40)}`);
      const lit = m[1].trim().match(/^"([^"]*)"$/);
      if (lit) out.add(lit[1]);
    }
    for (const m of src.matchAll(/setAttribute\s*\(\s*["']id["']\s*,\s*"([^"]*)"/g)) {
      forms.push(`${rel}: setAttribute("id", ...)`);
      out.add(m[1]);
    }
    for (const m of src.matchAll(/\bid="([^"]+)"/g)) {
      forms.push(`${rel}: template markup id="${m[1]}"`);
      out.add(m[1]);
    }
  }
  return { ids: out, forms };
}

const ADDRESSED_IDS = new Set();
for (const rel of SCRIPT_KEYS) {
  for (const id of idsFromGetElementById(rel)) ADDRESSED_IDS.add(id);
  for (const id of idsFromSelectors(rel)) ADDRESSED_IDS.add(id);
  for (const id of idsFromComparisons(rel)) ADDRESSED_IDS.add(id);
}
for (const id of idsFromIdrefs(readServedDocuments())) ADDRESSED_IDS.add(id);

const CREATED = idsCreatedByScripts();
const REQUIRED_IDS = [...ADDRESSED_IDS].filter((id) => !CREATED.ids.has(id)).sort();

/* --- ids the markup serves ------------------------------------------------- */

function servedIds(sources) {
  const out = new Set();
  for (const text of Object.values(sources)) {
    for (const m of text.matchAll(/\bid="([^"]+)"/g)) out.add(m[1]);
  }
  return out;
}

function missingIds(sources) {
  const served = servedIds(sources);
  return REQUIRED_IDS.filter((id) => !served.has(id));
}

/* --- hidden branches ------------------------------------------------------- */

/** Every element carrying a bare `hidden` attribute, keyed by its id. An element
 *  with no id is reported under its own tag text so a nameless hidden branch
 *  cannot hide from the diff. */
const OPEN_TAG = /<[a-zA-Z][^>]*>/g;

function hiddenElements(sources) {
  const out = [];
  for (const [rel, text] of Object.entries(sources)) {
    for (const m of text.matchAll(OPEN_TAG)) {
      if (!/\shidden(?=[\s/>])/.test(m[0])) continue;
      const id = m[0].match(/\bid="([^"]+)"/)?.[1];
      out.push(id ?? `${rel}:${m[0].replace(/\s+/g, " ").slice(0, 60)}`);
    }
  }
  return out.sort();
}

/* --- behaviour hooks ------------------------------------------------------- */

const kebab = (camel) => camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Read by a served script: attribute selectors plus dataset property reads. */
function hooksReadByScripts() {
  const out = new Set();
  for (const rel of SCRIPT_KEYS) {
    for (const selector of selectorStrings(rel)) {
      for (const m of selector.matchAll(/\[(data-[\w-]+)/g)) out.add(m[1]);
    }
    for (const m of scriptText[rel].matchAll(/\.dataset\.([A-Za-z][\w$]*)/g)) {
      out.add(`data-${kebab(m[1])}`);
    }
  }
  return out;
}

/**
 * Written by a script the browser executes. Derived from BOTH write forms, and
 * the second one was added because the first was incomplete rather than because
 * a second style is tidy.
 *
 * G-89 stamps data-surface, data-tab and data-atab through
 * root.setAttribute("data-...", ...), in web/app.js and again in the inline head
 * script. A derivation that knew only `X.dataset.Y =` saw none of them, so
 * data-surface - which enters the required set legitimately, because
 * web/shell.css selects html[data-surface] - read as a hook the markup had
 * dropped. The instrument was right and its derivation was short.
 *
 * data-tab and data-atab escaped the same fate only because they also happen to
 * sit in static markup on the tab anchors. Two of three passing by luck is not
 * two of three passing, which is why this is widened rather than excused.
 *
 * Derived and recomputed every run. A hardcoded data-surface entry here would be
 * the has_writer defect this program has already paid for.
 */
function hooksWrittenByScripts() {
  const out = new Set();
  for (const rel of SCRIPT_KEYS) {
    for (const m of scriptText[rel].matchAll(/\.dataset\.([A-Za-z][\w$]*)\s*=(?!=)/g)) {
      out.add(`data-${kebab(m[1])}`);
    }
    // Multi-line calls are real: the head script wraps setAttribute( onto its own
    // line for data-tab and data-atab, so the name may not be on the call's line.
    for (const m of scriptText[rel].matchAll(/setAttribute\s*\(\s*["'](data-[\w-]+)["']/g)) {
      out.add(m[1]);
    }
  }
  return out;
}

/**
 * Read by a served stylesheet. This population exists because the class rule
 * counts classes and never looks at attribute selectors, and web/shell.css
 * colours the connections register - 446 elements, the largest section of the
 * page - entirely off [data-disposition]. Nothing covers it today.
 */
function hooksReadByStylesheets() {
  const out = new Set();
  for (const rel of SERVED_ASSETS.filter((r) => r.endsWith(".css"))) {
    const css = readSource(rel).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/\[(data-[\w-]+)/g)) out.add(m[1]);
  }
  return out;
}

const HOOKS_BY_SCRIPT = hooksReadByScripts();
const HOOKS_BY_CSS = hooksReadByStylesheets();
const HOOKS_WRITTEN = hooksWrittenByScripts();
const HOOKS_READ = [...new Set([...HOOKS_BY_SCRIPT, ...HOOKS_BY_CSS])].sort();

/**
 * THE HOOK EXCLUSION SET, and the subtraction it performs is narrower than
 * "written by a script" on purpose.
 *
 * Subtracting every script-written hook is wrong, and G-89 is the case that
 * shows why. The head script stamps data-surface, data-tab and data-atab on the
 * DOCUMENT ELEMENT. Only data-surface is exclusively a runtime stamp; data-tab
 * and data-atab ALSO sit in static markup on the tab anchors, where
 * `.tabs [data-tab]` reads them off descendants. One attribute name, two element
 * populations. Excusing the name globally would have silently dropped six tab
 * anchors out of coverage in exchange for fixing one false positive.
 *
 * So a hook is excused only when a script provably writes it AND it is attached
 * nowhere in static markup. Both halves are required: the second alone would be
 * "excuse whatever is missing", which is the gate agreeing with the defect.
 *
 * That leaves one drift hazard, and it is pinned rather than accepted. The
 * excused set is computed from what is attached TODAY, so if a translation ever
 * dropped data-tab from every anchor it would move from required to excused and
 * go quiet. The pin below fails when the membership changes, in either
 * direction, which turns that silence into a decision somebody has to make.
 */
const HOOKS_ATTACHED_NOW = attachedHooks(readServedDocuments());
const HOOKS_EXCUSED = HOOKS_READ.filter(
  (h) => HOOKS_WRITTEN.has(h) && !HOOKS_ATTACHED_NOW.has(h),
);
const REQUIRED_HOOKS = HOOKS_READ.filter((h) => !HOOKS_EXCUSED.includes(h));

function attachedHooks(sources) {
  const out = new Set();
  for (const text of Object.values(sources)) {
    for (const m of text.matchAll(/\s(data-[\w-]+)/g)) out.add(m[1]);
  }
  return out;
}

function missingHooks(sources) {
  const attached = attachedHooks(sources);
  return REQUIRED_HOOKS.filter((h) => !attached.has(h));
}

/* --- injection helpers ----------------------------------------------------- */

/** Remove one id attribute from an in-memory copy of the markup. */
function withoutId(sources, id) {
  const out = { ...sources };
  const needle = ` id="${id}"`;
  for (const rel of Object.keys(out)) out[rel] = out[rel].split(needle).join("");
  return out;
}

/** Remove the `hidden` attribute from the element carrying one id. */
function withoutHiddenOn(sources, id) {
  const out = { ...sources };
  for (const rel of Object.keys(out)) {
    out[rel] = out[rel].replace(OPEN_TAG, (tag) =>
      tag.includes(` id="${id}"`) ? tag.replace(/\shidden(?=[\s/>])/, "") : tag,
    );
  }
  return out;
}

/** Detach one data-* hook everywhere, without touching hooks it prefixes. */
function withoutHook(sources, hook) {
  const out = { ...sources };
  const re = new RegExp(`\\s${hook}(?![\\w-])(="[^"]*")?`, "g");
  for (const rel of Object.keys(out)) out[rel] = out[rel].replace(re, "");
  return out;
}

/* ===========================================================================
 * 4. THE GATE
 * ======================================================================== */

describe("G-88 addressability: a screen that renders can also be driven", () => {
  it("resolves every addressing expression, and fails rather than skipping one", () => {
    /**
     * The anti-vacuity assertion, and it runs FIRST on purpose. Every other
     * assertion in this file is only as good as the set it diffs, and a resolver
     * that silently drops what it cannot read produces a green gate over a
     * broken screen. An unreadable expression is a failure that names itself.
     */
    assert.deepEqual(unresolved, [], `unresolved addressing expressions:\n${unresolved.join("\n")}`);

    /**
     * Counting rule for the numbers below, stated where they are read.
     * ADDRESSED = every id reachable from a served script through
     * getElementById (F1), a "#id" token in a selector string (F2), or an
     * el.id comparison (F3), plus every id the served markup points at through
     * an ARIA or form IDREF attribute (F4). Comments are stripped from every
     * script first. REQUIRED = ADDRESSED minus the ids a served script creates.
     *
     * POPULATION: SERVED_DOCUMENTS - web/index.html, web/app.js,
     * src/staff-map.mjs, src/staff-review.mjs. NOT the union that the class rule
     * scans: src/shell-homes.mjs is a generator and is served to nobody, so it
     * cannot answer whether an id reaches a browser. It emits zero ids today,
     * which is the only reason this arm was not already blind, and "zero today"
     * is luck rather than a rule.
     */
    assert.ok(REQUIRED_IDS.length >= 60, `addressed id set collapsed to ${REQUIRED_IDS.length}`);

    /**
     * TRAP 1, asserted by NAMED CHAIN rather than by a count, so it stays
     * meaningful while the product grows. A getElementById-with-a-string-literal
     * scan reaches 27 of the 43 ids web/app.js reaches through getElementById,
     * and the 16 it cannot see arrive through exactly three shapes. Each shape
     * is asserted through one id that ONLY that shape can produce, so rewriting
     * the helper, the loop or the constructor fails here and names which one -
     * where a bare count would drift with every unrelated screen that ships.
     */
    const literalOnly = new Set();
    for (const rel of SCRIPT_KEYS) {
      for (const m of scriptText[rel].matchAll(/getElementById\s*\(\s*"([^"]+)"\s*\)/g)) {
        literalOnly.add(m[1]);
      }
    }
    const viaGetElementById = new Set();
    for (const rel of SCRIPT_KEYS) for (const id of idsFromGetElementById(rel)) viaGetElementById.add(id);
    const CHAINS = {
      "cp-scope-lens": "R4, the id-taking helper: setText(id) calls getElementById(id)",
      "cp-env-badge": "R3, the array loop: for (const id of [...]) getElementById(id)",
      "map-stage": "R4 through R3, a constructor parameter: new MountStage(name) where name is a loop variable",
    };
    for (const [id, chain] of Object.entries(CHAINS)) {
      assert.equal(literalOnly.has(id), false, `${id} should be invisible to a literal-only scan`);
      assert.ok(viaGetElementById.has(id), `${chain} no longer resolves`);
    }
    assert.ok(
      viaGetElementById.size > literalOnly.size,
      `helper resolution recovered nothing: ${viaGetElementById.size} vs ${literalOnly.size}`,
    );
  });

  it("states the exclusion set for ids a script creates, derived and recomputed", () => {
    /**
     * TRAP 2. The exclusion set is DERIVED from id-writing expressions in the
     * served scripts - `.id =`, setAttribute("id", ...), and id=" inside a
     * template - never hand-declared. A hand-declared list that nothing
     * recomputes is the has_writer defect this program has already paid for.
     *
     * MEASURED TODAY: EMPTY, and this is a positive determination rather than an
     * empty result. web/app.js makes 13 document.createElement calls and sets
     * className, textContent and dataset on them; it assigns .id on none and
     * calls setAttribute only with aria-selected and aria-expanded. So every
     * addressed id must exist in the static document, with nothing excused.
     */
    assert.deepEqual(CREATED.forms, [], "a served script has started creating ids");
    assert.equal(CREATED.ids.size, 0);
    assert.equal(REQUIRED_IDS.length, ADDRESSED_IDS.size, "nothing is excused today");

    // The createElement population that makes the emptiness meaningful.
    const creates = (scriptText["web/app.js"].match(/document\.createElement\(/g) || []).length;
    assert.ok(creates > 0, "app.js does build elements; the empty set is not vacuous");
  });

  it("serves every id the scripts and the markup address", () => {
    /**
     * ARM A, the real sources.
     *
     * This is the assertion the card exists for. A translated screen that renders
     * correctly and drops an id fails here and names it, where the kit's parity
     * proof normalizes ids away before comparing and the class gate never looks.
     */
    const sources = readServedDocuments();
    assert.deepEqual(missingIds(sources), []);

    // Every prefix an el.id.startsWith() guard depends on is populated.
    const served = servedIds(sources);
    for (const prefix of ID_PREFIX_ASSERTIONS) {
      assert.ok(
        [...served].some((id) => id.startsWith(prefix)),
        `no served id starts with ${prefix}, which a script branches on`,
      );
    }
  });

  it("fires on every addressed id, one at a time, and names the one removed", () => {
    /**
     * ARM B. TRAP 4: an unrun check and a passing check must not look alike, so
     * the injected arm lives in the same run as the clean arm. Every required id
     * is removed in turn from an in-memory copy, rather than one lucky probe, so
     * the gate is proven able to fire on each member rather than on the one
     * somebody remembered to test.
     */
    const sources = readServedDocuments();
    const served = servedIds(sources);
    for (const id of REQUIRED_IDS) {
      // The probe target is asserted real BEFORE it is used, the way the class
      // gate asserts its probes are undefined before injecting them.
      assert.ok(served.has(id), `${id} is required but not served; arm A should have caught this`);
      assert.deepEqual(
        missingIds(withoutId(sources, id)),
        [id],
        `removing id="${id}" did not fire the gate naming exactly that id`,
      );
    }
  });

  it("keeps every hidden branch attached, and every one of them reachable", () => {
    /**
     * ARM A for hidden. A kit composition renders zero hidden branches, so this
     * is the second thing a translation silently loses. The rule is stated as a
     * SUPERSET of the branches the surface carries today rather than an exact
     * pin: losing one is the defect this gate is for, and adding one is a design
     * decision the reachability rule below still governs.
     */
    const sources = readServedDocuments();
    const hidden = hiddenElements(sources);
    /**
     * The baseline, measured 2026-08-19 on main at 6a4580d. Counting rule:
     * elements carrying a bare `hidden` attribute across the SERVED DOCUMENTS,
     * inline script bodies blanked; 14 of 14 are in web/index.html and every one
     * carries an id.
     *
     * POPULATION: SERVED_DOCUMENTS, not the class rule's union. The bake source
     * emits zero hidden elements today, so this arm fired anyway - by luck, not
     * by rule, exactly as the id arm did.
     * SUPERSET, not exact: losing one is the defect this gate is for, and adding
     * one is a design decision the reachability rule below already governs.
     */
    const BASELINE_HIDDEN = [
      "brand-state",
      "cp-scrim",
      "cp-sheet",
      "ds-pipeline-mark",
      "ds-pipeline-prov",
      "ds-pipeline-records",
      "files-stage",
      "map-stage",
      "overview-meetings-honesty",
      "overview-meetings-list",
      "record-search-note",
      "review-stage",
      "stage-esc",
      "stage-scrim",
    ];
    assert.deepEqual(BASELINE_HIDDEN.filter((id) => !hidden.includes(id)), []);
    for (const entry of hidden) assert.match(entry, /^[\w-]+$/, `${entry} is a hidden branch with no id, so nothing can address it`);

    /**
     * Reachability, derived rather than listed. A branch that ships hidden and
     * that nothing can ever show is dead markup. Each is either toggled by a
     * served script (its id resolves through F1/F2/F3) or pointed at by an ARIA
     * IDREF - record-search-note is the second kind, described by the disabled
     * #record-search input at web/index.html:24, and it is the reason F4 exists.
     */
    const idrefs = idsFromIdrefs(sources);
    const byScript = new Set();
    for (const rel of SCRIPT_KEYS) {
      for (const id of idsFromGetElementById(rel)) byScript.add(id);
      for (const id of idsFromSelectors(rel)) byScript.add(id);
      for (const id of idsFromComparisons(rel)) byScript.add(id);
    }
    const orphaned = hidden.filter((id) => !byScript.has(id) && !idrefs.has(id));
    assert.deepEqual(orphaned, [], "hidden branches nothing can ever show");
  });

  it("fires on every hidden branch, one at a time, and names the one dropped", () => {
    const sources = readServedDocuments();
    const before = hiddenElements(sources);
    for (const id of before) {
      const after = hiddenElements(withoutHiddenOn(sources, id));
      assert.deepEqual(
        before.filter((x) => !after.includes(x)),
        [id],
        `dropping hidden from #${id} did not fire the gate naming exactly that branch`,
      );
    }
  });

  it("keeps every behaviour hook the code reads attached to the markup", () => {
    /**
     * ARM A for hooks.
     *
     * Counting rule, stated where the number is read. REQUIRED = the data-*
     * attributes read by a script the browser executes (attribute selectors in
     * querySelector/querySelectorAll/closest strings, plus .dataset property
     * reads with camelCase mapped to kebab) UNION the data-* attribute selectors
     * in the served stylesheets, MINUS the EXCUSED set - the hooks a script
     * provably writes AND that are attached nowhere in the served documents. The
     * scripts scanned are the served scripts plus every inline <script> block in
     * a served document, because G-89's first-paint stamp lives inline in the
     * head of web/index.html and a files-only derivation cannot see the earliest
     * writer in the product.
     *
     * POPULATION: SERVED_DOCUMENTS, and this category is where getting it wrong
     * cost a real defect. Attached-ness used to diff against the union of the
     * served documents AND src/shell-homes.mjs. Stripping data-disposition from
     * all 70 of its occurrences in web/index.html - which takes the entire
     * severity colouring off the 446-element connections register, the precise
     * failure this population was added to catch - left the union satisfied by
     * the generator alone and the gate passed 10 of 10. The generator is served
     * to nobody, so it cannot answer a question about what the browser received.
     * The class rule keeps the union deliberately, because a class renamed in the
     * template without a re-bake ships stale and only the union sees that.
     *
     * The dispatch's eight names were a grep and are not authoritative. This
     * derivation adds data-metric, data-stage-max and data-theme, and reclassifies
     * data-disposition as stylesheet-read rather than script-read.
     *
     * PRESENCE, NOT VALUE, and the basis is measured: web/sc-kit.css:29 selects
     * `:root:not([data-theme="light"])`, so data-theme="light" is styled and is
     * deliberately never attached. A value-level rule would be red on day one,
     * which DEV_PROCESS 2.0 forbids. Presence is also the property the
     * translation actually loses, since a kit composition emits no data-*
     * attribute of any value.
     */
    assert.deepEqual(missingHooks(readServedDocuments()), []);

    // The two reader populations, named separately so neither can quietly vanish.
    assert.ok(HOOKS_BY_SCRIPT.size >= 10, `script-read hooks collapsed to ${HOOKS_BY_SCRIPT.size}`);
    assert.ok(HOOKS_BY_CSS.has("data-disposition"), "the connections register's severity hook");

    /**
     * The WRITTEN set, derived from both write forms across every executed
     * script. `.dataset.Y =` alone returned two; adding setAttribute("data-...")
     * and the inline head script returns five.
     */
    assert.deepEqual(
      [...HOOKS_WRITTEN].sort(),
      ["data-atab", "data-city-key", "data-src", "data-surface", "data-tab", "data-theme"],
    );

    /**
     * The EXCUSED set, pinned because the derivation that produces it would
     * otherwise self-heal into silence, and stated here where the gate's output
     * is read rather than buried in the source (DEV_PROCESS 2.1).
     *
     * data-src and data-city-key are written onto elements app.js already holds.
     * data-surface is G-89's first-paint stamp on the document element and is
     * correctly absent from static markup: web/shell.css selects
     * html[data-surface] and fifteen html[data-surface="lens-x"] rules, so it is
     * genuinely read and genuinely never authored.
     *
     * data-tab and data-atab are deliberately NOT here even though the same head
     * script stamps them, because they are also attached to the tab anchors and
     * read from there. If either ever leaves the markup it lands in this list and
     * this assertion fails, which is the point of pinning it.
     */
    assert.deepEqual(HOOKS_EXCUSED, ["data-city-key", "data-src", "data-surface"]);
    for (const excused of HOOKS_EXCUSED) {
      assert.equal(REQUIRED_HOOKS.includes(excused), false);
      assert.ok(HOOKS_WRITTEN.has(excused), `${excused} is excused without a proven writer`);
    }
    /**
     * data-theme joined the written set at G-90 and, like data-tab and
     * data-atab and unlike data-surface, it stays REQUIRED rather than excused,
     * because web/index.html attaches it to <html> as the static default. That
     * attachment is load bearing rather than decorative: it is what a browser
     * with scripting disabled paints, and it is what the head script overwrites
     * only when a stored preference disagrees. If it ever leaves the markup, the
     * scripting-off document loses its theme and this assertion is what says so.
     */
    for (const hook of ["data-tab", "data-atab", "data-theme"]) {
      assert.ok(HOOKS_WRITTEN.has(hook), `${hook} should still be script-written`);
      assert.ok(REQUIRED_HOOKS.includes(hook), `${hook} is attached in markup and must stay required`);
    }
  });

  it("fires on every behaviour hook, one at a time, and names the one detached", () => {
    const sources = readServedDocuments();
    const attached = attachedHooks(sources);
    for (const hook of REQUIRED_HOOKS) {
      assert.ok(attached.has(hook), `${hook} is required but not attached; arm A should have caught this`);
      assert.deepEqual(
        missingHooks(withoutHook(sources, hook)),
        [hook],
        `detaching ${hook} did not fire the gate naming exactly that hook`,
      );
    }
  });

  it("derives its sources from the server rather than from a list in this file", () => {
    /**
     * TRAP 3. The served document is not only web/index.html. A new served asset
     * cannot dodge this scan by being new, because the list comes from
     * server.mjs's sendFile call sites and the bake source, shared with the class
     * gate rather than re-derived here - one rule, one implementation.
     */
    /**
     * G-90 added src/theme.mjs to all three populations at once, which is the
     * tripwire working: a served asset cannot dodge this scan by being new, and
     * the three lists moving together is the evidence that they are one
     * derivation rather than three hand-kept lists that happened to agree.
     */
    assert.deepEqual(SCRIPT_SOURCES, [
      "src/staff-map.mjs",
      "src/staff-review.mjs",
      "src/theme.mjs",
      "web/app.js",
      "web/property-map.js",
    ]);
    assert.deepEqual(MARKUP_SOURCES, [
      "src/shell-homes.mjs",
      "src/staff-map.mjs",
      "src/staff-review.mjs",
      "src/theme.mjs",
      "web/app.js",
      "web/index.html",
      "web/property-map.html",
      "web/property-map.js",
    ]);
    assert.deepEqual(BAKE_SOURCES, ["src/shell-homes.mjs"]);

    /**
     * THE POPULATION SPLIT, asserted rather than described. The class rule reads
     * the UNION so it can see a template that drifted from the document; the
     * three addressability arms read the SERVED DOCUMENTS, because attached-ness
     * is a claim about what the browser received and a generator is served to
     * nobody. The two lists must differ by exactly the bake sources, or one of
     * the two questions is being answered with the other one's population.
     */
    assert.deepEqual(SERVED_DOCUMENTS, [
      "src/staff-map.mjs",
      "src/staff-review.mjs",
      "src/theme.mjs",
      "web/app.js",
      "web/index.html",
      "web/property-map.html",
      "web/property-map.js",
    ]);
    assert.deepEqual(
      MARKUP_SOURCES.filter((rel) => !SERVED_DOCUMENTS.includes(rel)),
      BAKE_SOURCES,
    );
    for (const rel of SERVED_DOCUMENTS) {
      assert.equal(BAKE_SOURCES.includes(rel), false, `${rel} cannot be both served and a bake source`);
    }
    for (const rel of MARKUP_SOURCES) assert.ok(fs.existsSync(path.join(root, rel)), rel);

    /**
     * staff-map.mjs, staff-review.mjs and theme.mjs address nothing, which is
     * exactly why nobody would think to scan them. Written as a positive
     * determination with its basis - the first two are pure query-string
     * resolvers and the third is a pure theme vocabulary, none with DOM access -
     * because an empty result is not an absence.
     *
     * theme.mjs holding to this is load bearing rather than incidental. The
     * whole reason it exists as a module is that the inline head script cannot
     * import it; if it ever started touching the DOM, the temptation would be to
     * move DOM work out of web/app.js into a file that runs at the same deferred
     * moment, which changes nothing about when it runs and hides that it did.
     */
    for (const rel of ["src/staff-map.mjs", "src/staff-review.mjs", "src/theme.mjs"]) {
      assert.equal(idsFromGetElementById(rel).size, 0, `${rel} has started touching the DOM`);
      assert.equal(selectorStrings(rel).length, 0, `${rel} has started querying the DOM`);
      assert.equal(scriptText[rel].includes("document."), false, rel);
    }
    // web/app.js is the one that does, so the emptiness above is a fact about
    // those two files rather than about the extractor.
    assert.ok(idsFromGetElementById("web/app.js").size > 0);

    // The import that R5 follows is resolved through the same derivation, not a
    // second table: "/staff-review.mjs" is a served path, and this is its file.
    assert.equal(sourceForServedPath("/staff-review.mjs"), "src/staff-review.mjs");
    assert.equal(sourceForServedPath("/nope.mjs"), null);
  });

  it("strips JavaScript comments without eating the strings around them", () => {
    /**
     * The comment strip is load-bearing for every set above, so it is tested for
     * its ability to be WRONG rather than trusted. The fixture carries the three
     * shapes that break a regex: comment markers inside a string, a string inside
     * a comment, and a URL.
     */
    const fixture = [
      'const a = "// not a comment";',
      "/* const b = \"eaten\"; */",
      'const c = `https://example.test/x`;',
      "const d = 1; // trailing",
    ].join("\n");
    const out = stripJsComments(fixture);
    assert.match(out, /const a = "\/\/ not a comment";/);
    assert.match(out, /const c = `https:\/\/example\.test\/x`;/);
    assert.equal(out.includes("eaten"), false);
    assert.equal(out.includes("trailing"), false);
    assert.equal(out.split("\n").length, fixture.split("\n").length, "line numbers must not shift");
    assert.equal(stripJsComments(out), out, "the strip is idempotent");

    // And it does the job it was added for on the real file.
    const raw = readSource("web/app.js");
    assert.equal((raw.match(/\[data-pack-name\]/g) || []).length, 4, "two real selector strings and two prose mentions");
    assert.equal((scriptText["web/app.js"].match(/\[data-pack-name\]/g) || []).length, 2, "only the two selector strings survive the strip");
  });
});
