// G-89. What the browser paints BEFORE app.js has run.
//
// The defect this file exists for, stated so it reads without the card:
// web/index.html hardcodes class="lens on" on #lens-city-manager, web/shell.css
// decides visibility from that class, and the only script in the document is
// type=module - deferred by definition, so it runs after the document parses.
// Every deep link therefore painted Overview and then switched to the surface
// that was actually asked for. On a not-built surface the operator watched a
// populated screen collapse into an honest-empty one.
//
// WHAT THIS FILE MEASURES. Not "the fix is present" - "the first paint is
// correct". It parses web/index.html and web/shell.css, executes ONLY the
// inline head script (in a vm sandbox, because at first paint the module has
// not run), and resolves the CSS cascade to a display value for every panel.
// A test that greps for a selector would pass on a fix whose specificity loses.
//
// AND IT IS WATCHED FAILING. test-fixtures/g89-pre-fix/ holds byte copies of
// the two files as they stood at 6a4580d, frozen by a sha256 pin. The same pure
// function runs against them in the SAME test and is asserted to return
// lens-city-manager where lens-finance was asked for. A clean arm and an
// injected arm in different tests let an unrun check and a passing check look
// alike, which is the failure this program keeps paying for.
//
// WHAT THIS FILE CANNOT DO. It does not render. It models the cascade over the
// subset of selector syntax this stylesheet uses, and it REFUSES TO GUESS: any
// display rule that could reach one of these panels but whose selector sits
// outside the modeled subset, or inside a conditional group rule, throws by
// name. An instrument that silently returns no-match on syntax it does not
// understand is the defect class this program hunts. The rendered proof is a
// real Chromium run with /app.js blocked, recorded with its values in the G-89
// close artifact, and deliberately not run here: CI is `npm ci && npm test` on
// a bare Node image, and a test that quietly skips when Chrome is absent is a
// control that never fires.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  ALL_LENS_IDS,
  WORK_IDS,
  DS_TABS,
  ASSET_TABS,
  CITY_MANAGER_LENS,
  resolveStaffLensQuery,
} from "./staff-review.mjs";
import { FALLBACK_THEME, THEMES, THEME_STORAGE_KEY, resolveTheme } from "./theme.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const lf = (s) => s.split(CR + LF).join(LF);
const read = (rel) => lf(fs.readFileSync(path.join(root, rel), "utf8"));

const HTML = read("web/index.html");
const CSS = read("web/shell.css");
const APP = read("web/app.js");

/**
 * G-90. The kit, which is where every colour in this product lives.
 *
 * The lens question - which PANEL paints - is answered by web/shell.css alone.
 * The theme question is not: web/shell.css declares no colour at all (measured:
 * zero hex literals, zero rgb()/hsl() calls in the whole file), so the palette
 * that paints is entirely a function of web/sc-kit.css and the attribute the
 * head script stamps. An instrument that read only shell.css could not see a
 * theme if it tried.
 */
const KIT = read("web/sc-kit.css");

// The frozen pre-fix inputs. Not `git stash`: a fixture survives a clone and a
// stash does not. Housed at the repo root rather than under src/ or web/,
// because shape.test.mjs walks exactly those two trees and a frozen file would
// then be judged forever by gates it can never be edited to satisfy.
const FIXTURE_HTML = read("test-fixtures/g89-pre-fix/index.html");
const FIXTURE_CSS = read("test-fixtures/g89-pre-fix/shell.css");

// Pinned over LF-NORMALIZED bytes, because this repo is checked out CRLF on
// Windows and LF in CI, so a raw file hash would disagree between them.
const FIXTURE_SHA = {
  "test-fixtures/g89-pre-fix/index.html":
    "52c16c1a6b167bd31855168f6d14b2ec78fc6a5e8f64d0bfc2a292a167027057",
  "test-fixtures/g89-pre-fix/shell.css":
    "dd538e7e24c3de8edf8f02b30e8de36b338c5b3b096a101a5c1a17c83e6323d0",
};

const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

/* ------------------------------------------------------------------ markup */

/**
 * Every element carrying the given class, as a model the matcher can read:
 * tag, id, class set, and attribute map. Attributes matter because the one
 * !important display rule in this stylesheet keys off [hidden].
 */
function panels(html, className) {
  const out = [];
  for (const m of html.matchAll(/<(section|div)\s([^>]*)>/g)) {
    const tag = m[1];
    const raw = m[2];
    const attrs = {};
    for (const a of raw.matchAll(/([-\w]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? "" : a[2];
    const classes = new Set((attrs.class || "").split(/\s+/).filter(Boolean));
    if (!classes.has(className)) continue;
    out.push({ tag, id: attrs.id || "", classes, attrs });
  }
  return out;
}

/** The root element as the parser sees it, before anything is stamped. */
function rootElement(html) {
  const m = html.match(/<html\s([^>]*)>/);
  const attrs = {};
  if (m) for (const a of m[1].matchAll(/([-\w]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? "" : a[2];
  return { tag: "html", id: attrs.id || "", classes: new Set(), attrs };
}

/** The inline classless script in <head>, or null when the document has none. */
function inlineHeadScript(html) {
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\ssrc\s*=/.test(m[1])) continue;
    return m[2];
  }
  return null;
}

/**
 * Runs the head script the way the parser would: synchronously, with a
 * location and a document element and nothing else. The module is NOT
 * executed, because at first paint it has not run. Returns what got stamped.
 */
/** Symbol-keyed so it can never collide with an attribute name or be compared
 *  against one by accident. */
const STORAGE_WRITES = Symbol("storage writes");

/**
 * G-90. The storage the head script sees.
 *
 * Three states, because all three are real in a browser and only one of them is
 * the happy path: a value, no value, and a getItem that THROWS. The third is not
 * defensive decoration - getItem raises SecurityError in a partitioned or
 * blocked storage context, and an unguarded throw inside this script would abort
 * it before the surface attributes were stamped, reintroducing the exact G-89
 * flash through the door the theme change opens.
 *
 * setItem is instrumented rather than stubbed, so "the head script must not
 * write storage" is measured rather than assumed. A read-only script cannot
 * clobber a preference written by a build that knew about a theme this one does
 * not.
 */
function sandboxStorage({ stored, storageThrows } = {}) {
  const writes = [];
  return {
    writes,
    api: {
      getItem() {
        if (storageThrows) throw new Error("SecurityError: storage is not available in this context");
        return stored === undefined ? null : stored;
      },
      setItem(key, value) {
        writes.push(`${key}=${value}`);
      },
    },
  };
}

function stampedAttrs(scriptSrc, search, storage = {}) {
  if (scriptSrc === null) return {};
  const stamped = {};
  const documentElement = {
    setAttribute(name, value) {
      stamped[name] = String(value);
    },
    getAttribute(name) {
      return name in stamped ? stamped[name] : null;
    },
  };
  const store = sandboxStorage(storage);
  const sandbox = {
    location: { search },
    document: { documentElement },
    localStorage: store.api,
    URLSearchParams,
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  new vm.Script(scriptSrc, { filename: "index.html#inline-head-script" }).runInContext(sandbox);
  stamped[STORAGE_WRITES] = store.writes;
  return stamped;
}

/* --------------------------------------------------------------------- css */

/** Flat rule list with at-rule context and source order preserved. */
function cssRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let i = 0;
  let head = "";
  const atStack = [];
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{") {
      const sel = head.trim();
      head = "";
      if (sel.startsWith("@")) {
        atStack.push(sel);
        i += 1;
        continue;
      }
      let j = i + 1;
      let depth = 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}") depth -= 1;
        j += 1;
      }
      rules.push({ selector: sel, body: text.slice(i + 1, j - 1), at: [...atStack], order: rules.length });
      i = j;
      continue;
    }
    if (ch === "}") {
      if (atStack.length) atStack.pop();
      head = "";
      i += 1;
      continue;
    }
    head += ch;
    i += 1;
  }
  return rules;
}

/** The last display declaration in a rule body, with its importance. */
function displayDecl(body) {
  let found = null;
  for (const m of body.matchAll(/(^|[;{])\s*display\s*:\s*([^;}]+)/g)) {
    const raw = m[2].trim();
    const important = /!\s*important$/i.test(raw);
    found = { value: raw.replace(/!\s*important$/i, "").trim(), important };
  }
  return found;
}

/** Split a selector list on top-level commas. Parens are the only nesting here. */
function selectorList(sel) {
  const out = [];
  let depth = 0;
  let buf = "";
  for (const ch of sel) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * Pseudo-classes that cannot match at first paint with no pointer, no focus and
 * no fragment. Listed rather than pattern-matched: an unknown pseudo-class is
 * something this model has not been taught, and it throws rather than guessing.
 */
const INERT_PSEUDOS = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "target",
  "visited",
  "checked",
  "disabled",
  "placeholder-shown",
]);

/** Parse one compound selector, or null when it uses syntax not modeled here. */
function parseCompound(src) {
  const out = { tag: null, id: null, classes: [], attrs: [], pseudos: [], nots: [], pseudoElement: false };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "*") {
      out.tag = "*";
      i += 1;
    } else if (ch === "#") {
      const m = /^#(-?[_a-zA-Z][\w-]*)/.exec(src.slice(i));
      if (!m) return null;
      out.id = m[1];
      i += m[0].length;
    } else if (ch === ".") {
      const m = /^\.(-?[_a-zA-Z][\w-]*)/.exec(src.slice(i));
      if (!m) return null;
      out.classes.push(m[1]);
      i += m[0].length;
    } else if (ch === "[") {
      const end = src.indexOf("]", i);
      if (end < 0) return null;
      const inner = src.slice(i + 1, end);
      const m = /^([-\w]+)\s*(?:([~|^$*]?=)\s*"?([^"\]]*?)"?\s*(i|s)?)?$/.exec(inner.trim());
      if (!m) return null;
      out.attrs.push({ name: m[1], op: m[2] || null, value: m[3] === undefined ? null : m[3], ci: m[4] === "i" });
      i = end + 1;
    } else if (ch === ":") {
      if (src[i + 1] === ":") {
        out.pseudoElement = true;
        return out;
      }
      const m = /^:(-?[_a-zA-Z][\w-]*)/.exec(src.slice(i));
      if (!m) return null;
      const name = m[1];
      i += m[0].length;
      if (src[i] === "(") {
        let depth = 1;
        let j = i + 1;
        while (j < src.length && depth > 0) {
          if (src[j] === "(") depth += 1;
          else if (src[j] === ")") depth -= 1;
          j += 1;
        }
        const arg = src.slice(i + 1, j - 1);
        if (name !== "not") return null;
        const innerCompound = parseCompound(arg.trim());
        if (!innerCompound) return null;
        out.nots.push(innerCompound);
        i = j;
      } else {
        out.pseudos.push(name);
      }
    } else {
      const m = /^(-?[_a-zA-Z][\w-]*)/.exec(src.slice(i));
      if (!m || out.tag !== null || out.id || out.classes.length || out.attrs.length) return null;
      out.tag = m[1];
      i += m[0].length;
    }
  }
  return out;
}

function attrMatches(el, spec) {
  const has = Object.prototype.hasOwnProperty.call(el.attrs, spec.name);
  if (!has) return false;
  if (!spec.op) return true;
  const actual = spec.ci ? String(el.attrs[spec.name]).toLowerCase() : String(el.attrs[spec.name]);
  const wanted = spec.ci ? String(spec.value).toLowerCase() : String(spec.value);
  if (spec.op === "=") return actual === wanted;
  if (spec.op === "~=") return actual.split(/\s+/).includes(wanted);
  throw new Error(`first-paint model does not implement attribute operator ${spec.op}`);
}

/**
 * Three-valued on purpose. true and false are answers; "unknown" means the
 * selector is outside the modeled subset, and the caller turns that into a
 * throw rather than into a quiet no-match.
 */
function compoundMatches(el, c) {
  if (c.pseudoElement) return false;
  for (const p of c.pseudos) {
    /**
     * G-90. :root is the whole theme mechanism's subject, so the model is
     * taught it rather than left to throw on it.
     *
     * In THIS model the only element ever built with tag "html" is the one
     * rootElement() returns, and panels() only ever builds section and div. So
     * ":root matches exactly tag html" is exact here rather than an
     * approximation - and it is stated because in a real document it would not
     * be (a nested <html> in foreign content is not the root). If panels() ever
     * starts producing an html element, this equivalence is the assumption that
     * broke.
     */
    if (p === "root") {
      if (el.tag !== "html") return false;
      continue;
    }
    if (INERT_PSEUDOS.has(p)) return false;
    return "unknown";
  }
  if (c.tag && c.tag !== "*" && c.tag !== el.tag) return false;
  if (c.id && c.id !== el.id) return false;
  for (const cls of c.classes) if (!el.classes.has(cls)) return false;
  for (const spec of c.attrs) if (!attrMatches(el, spec)) return false;
  for (const n of c.nots) {
    const inner = compoundMatches(el, n);
    if (inner === "unknown") return "unknown";
    if (inner) return false;
  }
  return true;
}

/**
 * Split a complex selector into compounds and combinators, at bracket depth
 * zero only. Naive whitespace splitting tears [hidden]:not([hidden="until-found"
 * i]) in half at the space before the case-insensitivity flag, which is how the
 * one !important display rule in this stylesheet went unreadable on first run.
 */
function splitComplex(sel) {
  const parts = [];
  let buf = "";
  let depth = 0;
  for (const ch of sel) {
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    if (depth === 0 && /\s/.test(ch)) {
      if (buf) parts.push(buf);
      buf = "";
      continue;
    }
    if (depth === 0 && (ch === ">" || ch === "+" || ch === "~")) {
      if (buf) parts.push(buf);
      parts.push(ch);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf) parts.push(buf);
  return parts;
}

const COMBINATORS = new Set([">", "+", "~"]);

function specificity(sel) {
  let a = 0;
  let b = 0;
  let c = 0;
  const walk = (compound) => {
    if (compound.id) a += 1;
    b += compound.classes.length + compound.attrs.length + compound.pseudos.length;
    if (compound.tag && compound.tag !== "*") c += 1;
    for (const n of compound.nots) walk(n);
  };
  for (const part of splitComplex(sel).filter((p) => !COMBINATORS.has(p))) {
    const parsed = parseCompound(part);
    if (parsed) walk(parsed);
  }
  return [a, b, c];
}

const cmpSpec = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

/**
 * Does one complex selector match this panel, given that the only ancestor this
 * model knows is the root element? Anything deeper throws by name.
 */
function complexMatches(el, rootEl, sel) {
  const parts = splitComplex(sel);
  if (parts.some((p) => COMBINATORS.has(p))) {
    throw new Error(
      `first-paint model only knows the descendant combinator; this selector needs more: ${sel}`,
    );
  }
  const subject = parts[parts.length - 1];
  const subjectCompound = parseCompound(subject);
  if (!subjectCompound) {
    throw new Error(`first-paint model cannot parse the subject compound of: ${sel}`);
  }
  const hit = compoundMatches(el, subjectCompound);
  if (hit === "unknown") throw new Error(`first-paint model does not understand: ${sel}`);
  if (!hit) return false;
  if (parts.length === 1) return true;
  if (parts.length !== 2) {
    throw new Error(
      `first-paint model only knows the root as an ancestor; this selector needs more: ${sel}`,
    );
  }
  const ancestor = parseCompound(parts[0]);
  if (!ancestor || (ancestor.tag !== "html" && ancestor.tag !== "*")) {
    throw new Error(
      `first-paint model only knows the root as an ancestor; this selector needs more: ${sel}`,
    );
  }
  const anc = compoundMatches(rootEl, ancestor);
  if (anc === "unknown") throw new Error(`first-paint model does not understand: ${sel}`);
  return anc;
}

/** The resolved display for one panel, by importance, then specificity, then order. */
function resolveDisplay(el, rootEl, rules) {
  const candidates = [];
  for (const rule of rules) {
    const decl = displayDecl(rule.body);
    if (!decl) continue;
    for (const sel of selectorList(rule.selector)) {
      // Cheap pre-filter, deliberately conservative: it only skips selectors
      // whose subject compound parses AND names an id, class or tag this panel
      // cannot have. Everything else goes to the matcher, which throws rather
      // than guessing.
      const subject = splitComplex(sel).filter((p) => !COMBINATORS.has(p)).pop() || "";
      const parsed = parseCompound(subject);
      if (parsed) {
        if (parsed.pseudoElement) continue;
        if (parsed.id && parsed.id !== el.id) continue;
        if (parsed.classes.some((cls) => !el.classes.has(cls))) continue;
        if (parsed.tag && parsed.tag !== "*" && parsed.tag !== el.tag) continue;
      }
      if (!complexMatches(el, rootEl, sel)) continue;
      if (rule.at.length) {
        throw new Error(
          `first-paint model does not resolve conditional group rules; ${sel} sits inside ${rule.at.join(" / ")}`,
        );
      }
      candidates.push({ decl, spec: specificity(sel), order: rule.order });
    }
  }
  if (!candidates.length) return null;
  candidates.sort(
    (x, y) =>
      Number(x.decl.important) - Number(y.decl.important) ||
      cmpSpec(x.spec, y.spec) ||
      x.order - y.order,
  );
  return candidates[candidates.length - 1].decl.value;
}

/**
 * THE INSTRUMENT. Which panels of the given class are displayed at first paint,
 * for the given query string, given only the static markup, the stylesheet, and
 * the inline head script.
 */
function firstPaintVisible({ html, css, search, panelClass = "lens" }) {
  const stamped = stampedAttrs(inlineHeadScript(html), search);
  const rootEl = rootElement(html);
  rootEl.attrs = { ...rootEl.attrs, ...stamped };
  const rules = cssRules(css);
  return panels(html, panelClass)
    .filter((el) => resolveDisplay(el, rootEl, rules) !== "none")
    .map((el) => el.id);
}

/* ------------------------------------------------------ G-90: the palette */

/**
 * Does a rule's at-rule context apply, given the environment the browser is in?
 *
 * ONE media feature is implemented - prefers-color-scheme - because it is the
 * one the kit uses and the one the theme contract turns on. Every other at-rule
 * throws BY NAME, exactly as resolveDisplay() throws on any at-rule at all. The
 * asymmetry is deliberate and is the point: the display question genuinely has
 * no conditional rules to resolve, and inventing an evaluator for it would be
 * modelling syntax nothing exercises. Adding a viewport-width feature here
 * without also modelling the viewport would be the silent-fallback defect this
 * whole file is built against.
 */
function atRuleApplies(at, env) {
  for (const rule of at) {
    const m = /^@media\s*\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)$/.exec(rule.trim());
    if (!m) {
      throw new Error(`first-paint model does not evaluate the at-rule ${rule}`);
    }
    if ((m[1] === "dark") !== Boolean(env.prefersDark)) return false;
  }
  return true;
}

/** The last declaration of one property in a rule body, with its importance.
 *  Custom properties and ordinary properties are the same shape here. */
function propertyDecl(body, property) {
  let found = null;
  const re = new RegExp(`(^|[;{])\\s*${property}\\s*:\\s*([^;}]+)`, "g");
  for (const m of body.matchAll(re)) {
    const raw = m[2].trim();
    const important = /!\s*important$/i.test(raw);
    found = { value: raw.replace(/!\s*important$/i, "").trim(), important };
  }
  return found;
}

/**
 * The resolved value of one property on the ROOT element at first paint.
 *
 * Same cascade as resolveDisplay - importance, then specificity, then source
 * order - over the served stylesheets in the order the document links them.
 * Same refusal to guess: a selector outside the modeled subset throws, and so
 * does an at-rule this model cannot evaluate.
 */
function resolveRootProperty(rootEl, rules, property, env) {
  const candidates = [];
  for (const rule of rules) {
    const decl = propertyDecl(rule.body, property);
    if (!decl) continue;
    for (const sel of selectorList(rule.selector)) {
      if (!complexMatches(rootEl, rootEl, sel)) continue;
      if (!atRuleApplies(rule.at, env)) continue;
      candidates.push({ decl, spec: specificity(sel), order: rule.order });
    }
  }
  if (!candidates.length) return null;
  candidates.sort(
    (x, y) =>
      Number(x.decl.important) - Number(y.decl.important) ||
      cmpSpec(x.spec, y.spec) ||
      x.order - y.order,
  );
  return candidates[candidates.length - 1].decl.value;
}

/**
 * The stylesheets a document links, IN LINK ORDER, resolved to their sources.
 *
 * Derived from the markup rather than hardcoded, because cascade order is the
 * whole question here: sc-kit.css declaring a palette and shell.css consuming it
 * only works in that order, and a hand-written concatenation would keep passing
 * if the document ever swapped them.
 */
function linkedStylesheets(html, byPath) {
  const out = [];
  const external = [];
  for (const m of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)) {
    const href = /href="([^"]+)"/.exec(m[0]);
    if (!href) continue;
    const url = href[1];
    /**
     * EXCLUSION SET, stated where the output is read (DEV_PROCESS 2.1).
     *
     * A cross-origin stylesheet is excluded, and this is a positive
     * determination rather than a convenience: it is not served by this
     * product - src/served-surface.mjs derives the served set from server.mjs's
     * own sendFile call sites and it holds exactly two stylesheets - so there
     * are no bytes for this test to read and inventing some would be modelling
     * a third party. Today the excluded set is the one font sheet, which
     * declares no custom property and no colour, and the test pins that set
     * rather than letting it grow quietly.
     */
    if (/^[a-z]+:|^\/\//i.test(url)) {
      external.push(url);
      continue;
    }
    const source = byPath[url];
    if (source === undefined) {
      throw new Error(`the document links ${url}, which this test was given no source for`);
    }
    out.push(source);
  }
  if (!out.length) throw new Error("the document links no stylesheet, so no palette can be resolved");
  return { sheets: out, external };
}

/**
 * THE SECOND INSTRUMENT. Which PALETTE paints at first paint.
 *
 * Not "is data-theme stamped" - that is the question a grep answers, and a grep
 * would pass on a build that stamps the attribute after the module loads. This
 * resolves the actual token values a browser would compute on the root element,
 * with the head script executed, the module NOT executed, and a declared
 * operating-system colour preference.
 */
function firstPaintPalette({ html, kit, css, search = "", stored, storageThrows, prefersDark = false }) {
  const stamped = stampedAttrs(inlineHeadScript(html), search, { stored, storageThrows });
  const rootEl = rootElement(html);
  rootEl.attrs = { ...rootEl.attrs, ...stamped };
  const linked = linkedStylesheets(html, { "/sc-kit.css": kit, "/shell.css": css });
  const rules = linked.sheets.flatMap((sheet, index) =>
    cssRules(sheet).map((rule) => ({ ...rule, order: index * 100000 + rule.order })),
  );
  const env = { prefersDark };
  return {
    external: linked.external,
    theme: rootEl.attrs["data-theme"] ?? null,
    canvas: resolveRootProperty(rootEl, rules, "--sc-canvas", env),
    surface: resolveRootProperty(rootEl, rules, "--sc-surface", env),
    ink: resolveRootProperty(rootEl, rules, "--sc-ink", env),
    colorScheme: resolveRootProperty(rootEl, rules, "color-scheme", env),
    storageWrites: stamped[STORAGE_WRITES] || [],
  };
}

/**
 * The two palettes, read out of the kit rather than typed here.
 *
 * A pinned hex would make this test a second copy of the kit's colour values,
 * which is the thing the product line forbids: web/sc-kit.css is byte-identical
 * across three repos and a repo holding its own copy of a token value has forked
 * the system quietly. So the expected values are DERIVED from the kit's own
 * blocks, and what is asserted is that the two differ and that first paint lands
 * on the right one.
 */
function kitPalette(kit, selector) {
  const rules = cssRules(kit).filter((rule) => selectorList(rule.selector).includes(selector));
  if (rules.length !== 1) {
    throw new Error(`expected exactly one ${selector} block in the kit, found ${rules.length}`);
  }
  const body = rules[0].body;
  return {
    canvas: propertyDecl(body, "--sc-canvas")?.value ?? null,
    surface: propertyDecl(body, "--sc-surface")?.value ?? null,
    ink: propertyDecl(body, "--sc-ink")?.value ?? null,
    colorScheme: propertyDecl(body, "color-scheme")?.value ?? null,
  };
}

/* ------------------------------------------------------- the paired control */

/** The id lists the inline head script carries, read out of its own source. */
function scriptLiterals(scriptSrc) {
  const list = (name) => {
    const m = new RegExp(`var\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(scriptSrc);
    if (!m) throw new Error(`could not read ${name} out of the inline head script`);
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  };
  const str = (name) => {
    const m = new RegExp(`var\\s+${name}\\s*=\\s*"([^"]+)"`).exec(scriptSrc);
    if (!m) throw new Error(`could not read ${name} out of the inline head script`);
    return m[1];
  };
  const fb = /var\s+FALLBACK_LENS\s*=\s*"([^"]+)"/.exec(scriptSrc);
  if (!fb) throw new Error("could not read FALLBACK_LENS out of the inline head script");
  return {
    LENS: list("LENS"),
    WORK: list("WORK"),
    DS_TABS: list("DS_TABS"),
    ASSET_TABS: list("ASSET_TABS"),
    FALLBACK: fb[1],
    // G-90. The theme vocabulary the script carries a second copy of.
    THEMES: list("THEMES"),
    FALLBACK_THEME: str("FALLBACK_THEME"),
    THEME_KEY: str("THEME_KEY"),
  };
}

/**
 * The whole divergence check as ONE pure function over the script source, so the
 * same function can be run against a mutated copy and watched failing. Returns
 * the list of disagreements; empty means the two implementations agree.
 */
function whitelistDivergences(scriptSrc) {
  const out = [];
  const eq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  let lit;
  try {
    lit = scriptLiterals(scriptSrc);
  } catch (err) {
    return [`unreadable: ${err.message}`];
  }

  // Textual. Catches an id the script accepts that the module does not, which
  // behavioural probing alone cannot enumerate.
  if (!eq(lit.LENS, ALL_LENS_IDS)) out.push(`LENS != ALL_LENS_IDS (${lit.LENS} vs ${ALL_LENS_IDS})`);
  if (!eq(lit.WORK, WORK_IDS)) out.push(`WORK != WORK_IDS (${lit.WORK} vs ${WORK_IDS})`);
  if (!eq(lit.DS_TABS, DS_TABS)) out.push(`DS_TABS diverged (${lit.DS_TABS} vs ${DS_TABS})`);
  if (!eq(lit.ASSET_TABS, ASSET_TABS)) out.push(`ASSET_TABS diverged (${lit.ASSET_TABS} vs ${ASSET_TABS})`);
  if (lit.FALLBACK !== CITY_MANAGER_LENS) out.push(`fallback ${lit.FALLBACK} != ${CITY_MANAGER_LENS}`);

  /**
   * G-90. The theme vocabulary is the same paired control as the lens ids, for
   * the same reason: the head script cannot import src/theme.mjs, because an
   * importing script is a module and a module is deferred, which is the defect.
   *
   * The storage KEY is compared as well as the values. A drifted key does not
   * throw, does not log and does not render wrong - it silently loses every
   * staff member's saved choice and looks exactly like a preference that was
   * never set. That is the quietest possible failure in this file.
   */
  if (!eq(lit.THEMES, THEMES)) out.push(`THEMES != THEMES (${lit.THEMES} vs ${THEMES})`);
  if (lit.FALLBACK_THEME !== FALLBACK_THEME) {
    out.push(`FALLBACK_THEME ${lit.FALLBACK_THEME} != ${FALLBACK_THEME}`);
  }
  if (lit.THEME_KEY !== THEME_STORAGE_KEY) {
    out.push(`THEME_KEY ${lit.THEME_KEY} != ${THEME_STORAGE_KEY}`);
  }

  /**
   * Behavioural, over every stored value the module can resolve plus the ones a
   * browser can actually hand back: nothing stored, whitespace, a value from a
   * build that knew a theme this one does not, and a storage that throws.
   */
  const storedProbes = [undefined, "", " ", "light", "dark", " light ", "LIGHT", "system", "sepia", ...lit.THEMES];
  for (const stored of storedProbes) {
    const want = resolveTheme(stored === undefined ? null : stored);
    let got;
    try {
      got = stampedAttrs(scriptSrc, "", { stored });
    } catch (err) {
      out.push(`stored ${JSON.stringify(stored)} threw: ${err.message}`);
      continue;
    }
    if (got["data-theme"] !== want) {
      out.push(
        `stored ${JSON.stringify(stored)}: data-theme script=${JSON.stringify(got["data-theme"])} module=${JSON.stringify(want)}`,
      );
    }
    if ((got[STORAGE_WRITES] || []).length) {
      out.push(`stored ${JSON.stringify(stored)}: the head script wrote storage, which is the toggle's job`);
    }
  }

  // Behavioural, over every query the module can resolve, plus a bogus one per
  // axis. This is what actually matters: the two must reach the same surface.
  const probes = [
    "",
    "?lens=bogus",
    "?work=bogus",
    "?work=bogus&lens=finance",
    "?lens=development-services&tab=bogus",
    "?work=assets&atab=bogus",
    "?work=files&lens=development-services",
    ...ALL_LENS_IDS.map((l) => `?lens=${l}`),
    ...WORK_IDS.map((w) => `?work=${w}`),
    ...DS_TABS.map((t) => `?lens=development-services&tab=${t}`),
    ...ASSET_TABS.map((a) => `?work=assets&atab=${a}`),
    // Every id the SCRIPT accepts is probed too, so an id the script knows and
    // the module does not is caught behaviourally as well as textually.
    ...lit.LENS.map((l) => `?lens=${l}`),
    ...lit.WORK.map((w) => `?work=${w}`),
  ];
  for (const search of probes) {
    const model = resolveStaffLensQuery(search);
    const want = {
      "data-surface": model.work ? `work-${model.work}` : `lens-${model.lens}`,
      "data-tab": model.tab,
      "data-atab": model.assetTab,
    };
    let got;
    try {
      got = stampedAttrs(scriptSrc, search);
    } catch (err) {
      out.push(`${search || "(no query)"} threw: ${err.message}`);
      continue;
    }
    for (const key of Object.keys(want)) {
      if (got[key] !== want[key]) {
        out.push(`${search || "(no query)"}: ${key} script=${JSON.stringify(got[key])} module=${JSON.stringify(want[key])}`);
      }
    }
  }
  return out;
}

/**
 * The ids enumerated in one attribute-keyed show rule in the stylesheet.
 *
 * The value-to-id relation is asserted here rather than assumed, because a
 * mis-mapped pair - html[data-tab="review"] #tab-place - is exactly the defect
 * an enumeration invites and it would not show up in a set comparison, since
 * both sets would still hold the same members.
 */
function enumeratedShowIds(css, attr, prefix) {
  const out = [];
  for (const rule of cssRules(css)) {
    for (const sel of selectorList(rule.selector)) {
      const m = /^html\[([-\w]+)="([^"]+)"\]\s+#([-\w]+)$/.exec(sel.trim());
      if (!m || m[1] !== attr) continue;
      assert.equal(
        prefix + m[2],
        m[3],
        `${sel} keys attribute value ${m[2]} to panel #${m[3]}; it must key to #${prefix}${m[2]} or the enumeration is a silent mis-mapping`,
      );
      out.push(m[3]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------- tests */

describe("G-89 first paint", () => {
  it("paints the requested surface, and the pre-fix build painted Overview instead", () => {
    /**
     * Counting rule for every set below: the ids of elements carrying
     * class="lens" in web/index.html, resolved through the full cascade of
     * web/shell.css with the inline head script executed and the module NOT
     * executed. Fifteen such elements; exactly one is displayed per input.
     */
    const cases = [
      ["?lens=finance", ["lens-finance"]],
      ["?work=connections", ["work-connections"]],
      ["?lens=development-services&tab=review", ["lens-development-services"]],
      ["", ["lens-city-manager"]],
      ["?lens=bogus", ["lens-city-manager"]],
    ];
    assert.equal(panels(HTML, "lens").length, 15, "the fifteen surfaces are the denominator");
    for (const [search, expected] of cases) {
      assert.deepEqual(
        firstPaintVisible({ html: HTML, css: CSS, search }),
        expected,
        `${search || "(no query)"} must paint exactly ${expected.join(",")} and nothing else`,
      );
    }

    /**
     * ARM B, the same computation against the frozen pre-fix build, in this
     * same test. This is the probe failing on the build the fix replaces.
     */
    assert.equal(inlineHeadScript(FIXTURE_HTML), null, "the pre-fix document had no inline head script");

    /**
     * The strongest form of the failing arm: the SAME acceptance predicate, run
     * against the pre-fix build, asserted to throw. Not a paraphrase of the
     * acceptance check and not a separate expectation that could drift away
     * from it - the same loop, the same expected sets, over the frozen inputs.
     * If someone weakens the acceptance above, this fails too.
     */
    assert.throws(
      () => {
        for (const [search, expected] of cases) {
          assert.deepEqual(firstPaintVisible({ html: FIXTURE_HTML, css: FIXTURE_CSS, search }), expected);
        }
      },
      (err) =>
        err.code === "ERR_ASSERTION" &&
        JSON.stringify(err.actual) === JSON.stringify(["lens-city-manager"]) &&
        JSON.stringify(err.expected) === JSON.stringify(["lens-finance"]),
      "the pre-fix build must fail the acceptance predicate, naming lens-city-manager where lens-finance was expected",
    );

    const preFix = firstPaintVisible({ html: FIXTURE_HTML, css: FIXTURE_CSS, search: "?lens=finance" });
    assert.deepEqual(
      preFix,
      ["lens-city-manager"],
      "the pre-fix build must paint lens-city-manager where lens-finance was asked for; if this stops being true the fixture no longer reproduces the defect",
    );
    assert.notDeepEqual(preFix, ["lens-finance"]);
    for (const [search] of cases) {
      assert.deepEqual(
        firstPaintVisible({ html: FIXTURE_HTML, css: FIXTURE_CSS, search }),
        ["lens-city-manager"],
        `the pre-fix build painted Overview for ${search || "(no query)"} whatever was asked for`,
      );
    }
  });

  it("keeps the tab panels on the same rule, so the right lens does not swap tables", () => {
    // Same defect one altitude down: #tab-pipeline and #atab-inventory carry
    // class="on" in the static markup.
    assert.equal(panels(HTML, "ds-tab").length, 6);
    assert.equal(panels(HTML, "assets-tab").length, 3);
    assert.deepEqual(
      firstPaintVisible({ html: HTML, css: CSS, search: "?lens=development-services&tab=review", panelClass: "ds-tab" }),
      ["tab-review"],
    );
    assert.deepEqual(
      firstPaintVisible({ html: HTML, css: CSS, search: "?work=assets&atab=map", panelClass: "assets-tab" }),
      ["atab-map"],
    );
    // The pre-fix arm, again in the same test.
    assert.deepEqual(
      firstPaintVisible({
        html: FIXTURE_HTML,
        css: FIXTURE_CSS,
        search: "?lens=development-services&tab=review",
        panelClass: "ds-tab",
      }),
      ["tab-pipeline"],
    );
    assert.deepEqual(
      firstPaintVisible({ html: FIXTURE_HTML, css: FIXTURE_CSS, search: "?work=assets&atab=map", panelClass: "assets-tab" }),
      ["atab-inventory"],
    );
  });

  it("leaves the scripting-disabled document exactly as it was", () => {
    /**
     * The gate is the attribute's PRESENCE. With no script run, nothing is
     * stamped, so html[data-surface] .lens cannot match and .lens.on governs.
     * Measured by running the real stylesheet against the real markup with the
     * head script suppressed, which is what a browser with scripting off does.
     */
    const noScriptHtml = HTML.replace(/<script>[\s\S]*?<\/script>/, "");
    assert.equal(inlineHeadScript(noScriptHtml), null);
    const reachable = firstPaintVisible({ html: noScriptHtml, css: CSS, search: "?lens=finance" });
    assert.deepEqual(reachable, ["lens-city-manager"]);
    const before = firstPaintVisible({ html: FIXTURE_HTML, css: FIXTURE_CSS, search: "?lens=finance" });
    assert.deepEqual(
      reachable,
      before,
      "with scripting off the fix must reach exactly what the pre-fix build reached: Overview, and nothing else",
    );
    for (const cls of ["ds-tab", "assets-tab"]) {
      assert.deepEqual(
        firstPaintVisible({ html: noScriptHtml, css: CSS, search: "?lens=development-services&tab=review", panelClass: cls }),
        firstPaintVisible({ html: FIXTURE_HTML, css: FIXTURE_CSS, search: "?lens=development-services&tab=review", panelClass: cls }),
        cls,
      );
    }
  });

  it("holds the whitelist to the module's, and the divergence check is watched firing", () => {
    /**
     * THE PAIRED CONTROL. resolveStaffLensQuery() in src/staff-review.mjs and
     * the inline head script are two implementations of one rule, and they have
     * to be, because importing would make the script a module and a module is
     * deferred - which is the defect. So the divergence test IS the control
     * (DEV_PROCESS 2.4), not two careful edits.
     */
    const scriptSrc = inlineHeadScript(HTML);
    assert.ok(scriptSrc, "web/index.html must carry an inline classless head script");
    assert.deepEqual(whitelistDivergences(scriptSrc), [], "arm A: the two implementations agree");

    // Arm B, in the SAME test. One id removed from the script's copy, and one
    // added, each asserted to come back named. A clean arm and an injected arm
    // in different tests let an unrun check and a passing check look alike.
    const dropped = scriptSrc.replace('"finance",', "");
    const droppedOut = whitelistDivergences(dropped);
    assert.ok(droppedOut.length > 0, "removing finance from the script must diverge");
    assert.ok(
      droppedOut.some((d) => d.includes("LENS != ALL_LENS_IDS")),
      `the textual arm must name the list; got ${JSON.stringify(droppedOut)}`,
    );
    assert.ok(
      droppedOut.some((d) => d.includes("?lens=finance") && d.includes("data-surface")),
      `the behavioural arm must name the query that now paints the wrong surface; got ${JSON.stringify(droppedOut)}`,
    );

    const added = scriptSrc.replace('var WORK = ["files"', 'var WORK = ["budgets", "files"');
    const addedOut = whitelistDivergences(added);
    assert.ok(
      addedOut.some((d) => d.includes("WORK != WORK_IDS")),
      `an id the script accepts and the module does not must be caught; got ${JSON.stringify(addedOut)}`,
    );
    assert.ok(
      addedOut.some((d) => d.includes("?work=budgets")),
      `and caught behaviourally too, because the script would paint work-budgets and the module would then hide it; got ${JSON.stringify(addedOut)}`,
    );

    const fallbackChanged = scriptSrc.replace('var FALLBACK_LENS = "city-manager"', 'var FALLBACK_LENS = "finance"');
    assert.ok(
      whitelistDivergences(fallbackChanged).some((d) => d.includes("fallback")),
      "an unknown lens resolving somewhere other than the module's fallback must be caught",
    );

    /**
     * G-90. The theme legs of the same control, injected the same way. Three
     * disagreements, each of which fails differently in a browser and none of
     * which throws:
     *
     * a dropped theme silently ignores a saved choice; a flipped default paints
     * the wrong palette for everyone who has never touched the control; and a
     * drifted storage KEY loses every saved choice while looking exactly like a
     * preference nobody ever set. The last is the quietest, so it gets its own
     * arm rather than being assumed to be covered by the other two.
     */
    const themeDropped = scriptSrc.replace('var THEMES = ["light", "dark"]', 'var THEMES = ["dark"]');
    assert.notEqual(themeDropped, scriptSrc, "the THEMES probe must actually change the script");
    const themeDroppedOut = whitelistDivergences(themeDropped);
    assert.ok(
      themeDroppedOut.some((d) => d.includes("THEMES != THEMES")),
      `the textual arm must name the theme list; got ${JSON.stringify(themeDroppedOut)}`,
    );
    assert.ok(
      themeDroppedOut.some((d) => d.includes('stored "light"')),
      `and the behavioural arm must name the stored value that now resolves wrong; got ${JSON.stringify(themeDroppedOut)}`,
    );

    const themeFlipped = scriptSrc.replace('var FALLBACK_THEME = "dark"', 'var FALLBACK_THEME = "light"');
    assert.notEqual(themeFlipped, scriptSrc);
    const themeFlippedOut = whitelistDivergences(themeFlipped);
    assert.ok(
      themeFlippedOut.some((d) => d.includes("FALLBACK_THEME")),
      `a flipped default must be caught; got ${JSON.stringify(themeFlippedOut)}`,
    );

    const keyDrifted = scriptSrc.replace('var THEME_KEY = "theme"', 'var THEME_KEY = "sc-theme"');
    assert.notEqual(keyDrifted, scriptSrc);
    assert.ok(
      whitelistDivergences(keyDrifted).some((d) => d.includes("THEME_KEY")),
      "a drifted storage key loses every saved choice silently and must be caught",
    );

    /**
     * And the head script must never WRITE storage. Proven by instrumenting
     * setItem rather than by grepping for it: a write here would clobber a
     * preference set by a build that knew a theme this one does not, which is
     * the failure a whitelist cannot see.
     */
    const injectedWriter = scriptSrc.replace(
      'root.setAttribute("data-theme", pick(THEMES, storedTheme, FALLBACK_THEME));',
      'root.setAttribute("data-theme", pick(THEMES, storedTheme, FALLBACK_THEME));\n        try { window.localStorage.setItem(THEME_KEY, "dark"); } catch (e) {}',
    );
    assert.notEqual(injectedWriter, scriptSrc, "the writer probe must actually change the script");
    assert.ok(
      whitelistDivergences(injectedWriter).some((d) => d.includes("wrote storage")),
      "a head script that writes storage must be caught",
    );
  });

  it("keeps the CSS enumeration in step with the panels, in three directions", () => {
    /**
     * CSS cannot compare two attribute values, so the show list is an
     * enumeration: 15 surfaces + 6 Development-services tabs + 3 Assets tabs =
     * 24 show selectors, plus 3 hide rules. Counting rule: one show selector
     * per addressable panel. Nothing keeps an enumeration in step with a panel
     * list except a test, so this is that test - and it compares THREE sources,
     * not two, because the ids also have to agree with the router's own lists.
     */
    const surfaceFromModule = [
      ...ALL_LENS_IDS.map((l) => `lens-${l}`),
      ...WORK_IDS.map((w) => `work-${w}`),
    ];
    const sorted = (xs) => [...xs].sort();
    assert.deepEqual(sorted(enumeratedShowIds(CSS, "data-surface", "")), sorted(surfaceFromModule));
    assert.deepEqual(sorted(panels(HTML, "lens").map((p) => p.id)), sorted(surfaceFromModule));
    assert.equal(enumeratedShowIds(CSS, "data-surface", "").length, 15);

    assert.deepEqual(sorted(enumeratedShowIds(CSS, "data-tab", "tab-")), sorted(DS_TABS.map((t) => `tab-${t}`)));
    assert.deepEqual(sorted(panels(HTML, "ds-tab").map((p) => p.id)), sorted(DS_TABS.map((t) => `tab-${t}`)));
    assert.equal(enumeratedShowIds(CSS, "data-tab", "tab-").length, 6);

    assert.deepEqual(sorted(enumeratedShowIds(CSS, "data-atab", "atab-")), sorted(ASSET_TABS.map((a) => `atab-${a}`)));
    assert.deepEqual(sorted(panels(HTML, "assets-tab").map((p) => p.id)), sorted(ASSET_TABS.map((a) => `atab-${a}`)));
    assert.equal(enumeratedShowIds(CSS, "data-atab", "atab-").length, 3);

    // The three hide rules, which are what make the static class lose.
    for (const attr of ["data-surface", "data-tab", "data-atab"]) {
      assert.match(CSS, new RegExp(`html\\[${attr}\\] \\.[-\\w]+ \\{ display: none; \\}`), attr);
    }

    // Proven able to fire: a sixteenth surface with no selector must be caught.
    const extraSection = HTML.replace(
      '<section class="lens" id="work-people">',
      '<section class="lens" id="lens-utilities"></section><section class="lens" id="work-people">',
    );
    assert.equal(panels(extraSection, "lens").length, 16);
    assert.notDeepEqual(
      sorted(panels(extraSection, "lens").map((p) => p.id)),
      sorted(enumeratedShowIds(CSS, "data-surface", "")),
      "a surface added without its selector must not look identical to one that has it",
    );
    assert.deepEqual(
      firstPaintVisible({ html: extraSection, css: CSS, search: "?lens=utilities" }),
      ["lens-city-manager"],
      "and the consequence is real: an unenumerated surface is unreachable, which is why the equality above is the control",
    );

    // And the value-to-id relation is proven able to fire too, because a
    // mis-mapped pair keeps both SETS identical and would pass every deepEqual
    // above. This is the one defect an enumeration invites that set comparison
    // is structurally blind to.
    const misMapped = CSS.replace(
      'html[data-tab="review"] #tab-review',
      'html[data-tab="review"] #tab-place',
    );
    assert.notEqual(misMapped, CSS, "the mis-map probe must actually change the stylesheet");
    assert.throws(
      () => enumeratedShowIds(misMapped, "data-tab", "tab-"),
      /keys attribute value review to panel #tab-place/,
    );
  });

  it("keeps applyLens live rather than decorative", () => {
    /**
     * If the attribute governed visibility and applyLens only moved a class,
     * the class would be decorative and a future JS-driven lens change would
     * silently do nothing. One writer: applyLens writes the same three
     * attributes, from the same resolved fields the class toggles read.
     */
    const body = APP.match(/function applyLens\(staffLens\)[\s\S]*?\n}/)?.[0] || "";
    assert.ok(body, "applyLens must still exist");
    assert.match(body, /setAttribute\("data-surface", workOn \? `work-\$\{work\}` : `lens-\$\{lens\}`\)/);
    assert.match(body, /setAttribute\("data-tab", tab\)/);
    assert.match(body, /setAttribute\("data-atab", assetTab\)/);
    // And the class toggles it used to be the only thing doing are still there.
    assert.match(body, /classList\.toggle\("on", workOn && el\.id === `work-\$\{work\}`\)/);
    assert.match(body, /classList\.toggle\("on", !workOn && el\.id === `lens-\$\{lens\}`\)/);
  });

  it("stamps before the parser reaches the body, and adds no class", () => {
    const head = HTML.slice(0, HTML.indexOf("</head>"));
    assert.ok(head.includes("<script>"), "the script must be inside <head>");
    // Ahead of every stylesheet link, so no pending sheet can block it.
    assert.ok(
      head.indexOf("<script>") < head.indexOf('<link rel="preconnect"'),
      "a classic script is blocked by any stylesheet declared before it; this one runs first",
    );
    // Classless, so the G-88 class gate stays satisfied by construction.
    const scriptSrc = inlineHeadScript(HTML);
    assert.equal(/class\s*=|classList|className/.test(scriptSrc), false);
    // And it is not a module, because a module is deferred, which is the defect.
    assert.equal(/<script[^>]*type\s*=\s*"module"[^>]*>[^<]/.test(HTML), false);
    assert.match(HTML, /<script type="module" src="\/app\.js"><\/script>/);
  });

  it("G-90: resolves the THEME before first paint too, and the late build is watched failing", () => {
    /**
     * THE ACCEPTANCE PREDICATE, and it is about the palette rather than the
     * attribute. Counting rule for every value below: the resolved value of the
     * named custom property on the root element, through the full cascade of the
     * stylesheets web/index.html links, in link order, with the inline head
     * script executed, the module NOT executed, and the operating system's
     * colour preference declared per case.
     *
     * Expected values are read out of web/sc-kit.css's own blocks rather than
     * pinned here, because a pinned hex would be this repo holding a second copy
     * of a token value, which is exactly the fork the kit's header forbids.
     */
    const light = kitPalette(KIT, ".sc-light");
    const dark = kitPalette(KIT, ".sc-dark");
    assert.notDeepEqual(light, dark, "the two palettes must differ, or nothing below can distinguish them");
    for (const [name, value] of Object.entries(light)) {
      assert.ok(value, `the light palette has no ${name}`);
      assert.ok(dark[name], `the dark palette has no ${name}`);
    }

    /**
     * A free reconciliation while the machinery is here (DEV_PROCESS 1.4). The
     * kit states the dark palette TWICE - once under the system-preference media
     * query and once under the explicit attribute - and two copies of one fact
     * are a future contradiction. They must be the same palette.
     */
    assert.deepEqual(
      kitPalette(KIT, ':root:not([data-theme="light"])'),
      dark,
      "the kit's system-dark block and its explicit-dark block have drifted apart",
    );

    /**
     * The five cases. The second is the one the kit's :not([data-theme="light"])
     * guard exists for and that nothing in this product had ever proven: an
     * explicit light choice must beat a dark-preferring operating system.
     */
    const cases = [
      ["stored light, OS prefers light", { stored: "light", prefersDark: false }, "light", light],
      ["stored light, OS prefers dark", { stored: "light", prefersDark: true }, "light", light],
      ["stored dark, OS prefers light", { stored: "dark", prefersDark: false }, "dark", dark],
      ["nothing stored, OS prefers light", { stored: undefined, prefersDark: false }, "dark", dark],
      ["storage throws, OS prefers light", { storageThrows: true, prefersDark: false }, "dark", dark],
    ];
    const paint = (opts, html = HTML) => firstPaintPalette({ html, kit: KIT, css: CSS, ...opts });
    /**
     * The canvas is asserted FIRST and as a scalar, deliberately. It is the
     * page ground - the largest single thing a person sees - so it is the
     * claim this predicate is really making, and putting it first means the
     * failing arm below reports a colour rather than an attribute name. The
     * attribute is checked last, because it is the mechanism rather than the
     * outcome.
     */
    const check = (html) => {
      for (const [label, opts, theme, palette] of cases) {
        const got = paint(opts, html);
        assert.equal(got.canvas, palette.canvas, label);
        assert.deepEqual(
          { canvas: got.canvas, surface: got.surface, ink: got.ink, colorScheme: got.colorScheme },
          palette,
          label,
        );
        assert.equal(got.theme, theme, label);
      }
    };
    check(HTML);

    /**
     * Two properties of the default that the cases above assert but that are
     * worth naming, because they are the product decisions rather than the
     * mechanism: nothing stored means DARK even on a light-preferring machine
     * (the product defaults dark, it does not follow the OS), and a storage
     * context that throws degrades to that same default rather than to an
     * unstamped root.
     */
    assert.equal(FALLBACK_THEME, "dark");
    assert.deepEqual(paint({ stored: undefined, prefersDark: true }).canvas, dark.canvas);

    /**
     * ARM B. THE SAME PREDICATE, run against a build where the theme is resolved
     * LATE - the head script stamps the surface and stops, and app.js would set
     * the attribute after the module loads. That is the build this card exists to
     * prevent, and it is the one thing a "does the toggle work" test cannot tell
     * apart from the real one, because after the module runs the two are
     * identical. Only first paint distinguishes them.
     *
     * The mutation is asserted to have changed the source before it is trusted,
     * and the failure is matched on its VALUES, so weakening the acceptance
     * above breaks this too rather than leaving a failing arm that proves
     * nothing.
     */
    const lateHtml = HTML.replace(
      /\n\s*root\.setAttribute\("data-theme", pick\(THEMES, storedTheme, FALLBACK_THEME\)\);/,
      "",
    );
    assert.notEqual(lateHtml, HTML, "the late-resolution probe must actually change the document");
    assert.ok(inlineHeadScript(lateHtml), "the probe must keep the head script, only its theme leg goes");
    assert.deepEqual(
      firstPaintVisible({ html: lateHtml, css: CSS, search: "?lens=finance" }),
      ["lens-finance"],
      "the probe must leave the G-89 surface fix intact, or it is testing two things at once",
    );
    assert.throws(
      () => check(lateHtml),
      (err) =>
        err.code === "ERR_ASSERTION" &&
        err.actual === dark.canvas &&
        err.expected === light.canvas,
      `the late-resolution build must fail the acceptance predicate, painting ${dark.canvas} where ${light.canvas} was stored`,
    );
    const late = paint({ stored: "light", prefersDark: true }, lateHtml);
    assert.equal(late.theme, "dark", "the late build paints the static default and repaints after the module");
    assert.equal(late.canvas, dark.canvas);

    /**
     * ARM C, free, over real historical bytes: the frozen pre-fix build has no
     * inline head script at all, so it cannot resolve a stored preference either.
     * Its shell.css is the frozen copy; the kit is the current one, because
     * web/sc-kit.css is not part of the fixture - G-89 changed only index.html
     * and shell.css, and this card changes neither the kit. Stated rather than
     * assumed, because a fixture paired with a file that HAD moved would prove
     * something other than what it claims.
     */
    const preFix = firstPaintPalette({
      html: FIXTURE_HTML,
      kit: KIT,
      css: FIXTURE_CSS,
      stored: "light",
      prefersDark: true,
    });
    assert.equal(preFix.theme, "dark");
    assert.equal(preFix.canvas, dark.canvas);
    assert.notEqual(preFix.canvas, light.canvas);
  });

  it("G-90: keeps the static default so a scripting-disabled browser still has a theme", () => {
    /**
     * The attribute is NOT removed from web/index.html. It is the fallback the
     * head script overwrites, which makes the whole mechanism exactly
     * `localStorage.theme || "dark"` - and it is what paints when no script runs
     * at all. Removing it would have handed a scripting-disabled browser to the
     * operating system's preference, which is a behaviour change nobody asked
     * for, dressed as tidying up.
     */
    assert.match(HTML, /<html lang="en" data-theme="dark">/);
    const noScriptHtml = HTML.replace(/<script>[\s\S]*?<\/script>/, "");
    assert.equal(inlineHeadScript(noScriptHtml), null);
    const dark = kitPalette(KIT, ".sc-dark");
    const light = kitPalette(KIT, ".sc-light");
    for (const prefersDark of [true, false]) {
      const got = firstPaintPalette({ html: noScriptHtml, kit: KIT, css: CSS, stored: "light", prefersDark });
      assert.equal(got.theme, "dark", "the static attribute governs with no script");
      assert.equal(got.canvas, dark.canvas);
    }
    // And it is genuinely load bearing: strip the attribute and a light-preferring
    // machine paints light, which is the regression this assertion forbids.
    const stripped = noScriptHtml.replace(' data-theme="dark"', "");
    assert.notEqual(stripped, noScriptHtml);
    assert.equal(
      firstPaintPalette({ html: stripped, kit: KIT, css: CSS, prefersDark: false }).canvas,
      light.canvas,
    );
  });

  it("G-90: the palette instrument refuses to guess, and is proven able to refuse", () => {
    /**
     * The model's value is entirely in what it throws on. An instrument that
     * silently returns no-match on syntax it does not understand is the defect
     * class this file was built against, so the refusals are tested rather than
     * described - once for the at-rule it cannot evaluate, once for a stylesheet
     * the document links that this test was handed no source for.
     */
    const withViewport = `${KIT}\n@media (min-width: 900px) { :root { --sc-canvas: #123456; } }\n`;
    assert.throws(
      () => firstPaintPalette({ html: HTML, kit: withViewport, css: CSS, stored: "dark" }),
      /does not evaluate the at-rule @media \(min-width: 900px\)/,
    );
    const extraLink = HTML.replace(
      '<link rel="stylesheet" href="/shell.css" />',
      '<link rel="stylesheet" href="/shell.css" />\n    <link rel="stylesheet" href="/unknown.css" />',
    );
    assert.notEqual(extraLink, HTML);
    assert.throws(
      () => firstPaintPalette({ html: extraLink, kit: KIT, css: CSS }),
      /links \/unknown\.css, which this test was given no source for/,
    );

    /**
     * The exclusion set, pinned where the instrument's output is read. Exactly
     * one cross-origin stylesheet is linked, it is the font sheet, and it
     * declares no custom property - so excluding it removes nothing from the
     * palette question. A second one appearing is a decision, not a detail.
     */
    const { external } = firstPaintPalette({ html: HTML, kit: KIT, css: CSS });
    assert.equal(external.length, 1, `excluded stylesheets: ${JSON.stringify(external)}`);
    assert.match(external[0], /^https:\/\/fonts\.googleapis\.com\//);
    assert.equal(/--sc-|color-scheme/.test(external[0]), false);
    // Link ORDER is read from the document rather than assumed, so a swap is
    // visible to the model rather than silently producing the same answer.
    const swapped = HTML.replace(
      '<link rel="stylesheet" href="/sc-kit.css" />\n    <link rel="stylesheet" href="/shell.css" />',
      '<link rel="stylesheet" href="/shell.css" />\n    <link rel="stylesheet" href="/sc-kit.css" />',
    );
    assert.notEqual(swapped, HTML, "the order probe must actually reorder the links");
  });

  it("freezes the pre-fix fixture so a helpful refresh fails loudly", () => {
    /**
     * The fixture is evidence, not a copy of live truth. If it is ever
     * regenerated from the fixed files it stops reproducing the defect and the
     * failing arm above becomes a passing arm that proves nothing. Hashed over
     * LF-normalized bytes, because this repo checks out CRLF on Windows and LF
     * in CI and a raw file hash would disagree between them.
     */
    for (const [rel, want] of Object.entries(FIXTURE_SHA)) {
      assert.equal(sha256(read(rel)), want, `${rel} is frozen at 6a4580d and must not be refreshed`);
    }
  });
});
