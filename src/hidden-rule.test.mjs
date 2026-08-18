// G-81. Keeps the hidden attribute working product-wide, from one rule.
//
// The defect this guards against, stated so the file reads without the card:
// the kit gives .pill and .prov display: inline-flex and .state and .metric
// display: flex. An author declaration of equal or greater weight beats the
// user-agent [hidden] rule, so el.hidden = true was inert on exactly the
// components most likely to be shown conditionally. It shipped: an amber
// Partial pill rendered beside the words "No meeting packet has been read".
// It was then patched twice, one selector at a time (.stage, .stage-esc), and
// a third and a fourth would have followed.
//
// So the invariant here is not "a [hidden] rule exists". It is:
//
//   1. exactly ONE rule in web/shell.css selects the bare hidden attribute,
//   2. it is unconditional (not inside an at-rule) and sets display: none,
//   3. it carries !important, which is the only weight that wins over every
//      normal author declaration whatever its specificity and wherever it
//      sits in the file, and over a normal inline style as well,
//   4. no OTHER rule declares display with !important, because that is the
//      one thing that could outrank it as the stylesheet grows,
//   5. no rule scopes [hidden] to a component, which is the pattern this card
//      retired and the way it would come back.
//
// Checks 4 and 5 are the ones that earn this file. 1 to 3 only say the rule is
// there today; 4 and 5 say it still wins tomorrow.
//
// WHAT THIS FILE CANNOT DO. It reads text. It does not render, so it cannot
// prove the attribute works; only a browser can. The measured proof is a
// getComputedStyle run over a hidden and a non-hidden .pill, .prov, .state and
// .metric, recorded with its four values in the G-81 close artifact
// (doc_repo _inbox/2026-08-18_b81_close.json). It is not run here because CI
// is `npm ci && npm test` on a bare Node image, and a test that quietly skips
// when Chrome is absent is a control that never fires.
//
// The checker is a pure function over CSS text so it can be PROVEN able to
// fire (DEV_PROCESS 2.2): every violation class below has a negative fixture
// asserting the exact violation comes back, plus clean fixtures asserting it
// does not cry wolf.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = path.join(root, "web", "shell.css");

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

// The kit components whose own display declaration is what made the attribute
// inert. Listed so a reader can see what the rule is load-bearing for, and so
// the premise is asserted rather than assumed.
export const EXPLICIT_DISPLAY_COMPONENTS = ["pill", "prov", "state", "metric"];

// The two patches this card retired. Named literally so a revert is caught
// with a message that says what came back, not just that a count moved.
export const RETIRED_PATCHES = [".stage[hidden]", ".stage-esc[hidden]"];

// The one carve-out the global rule may carry. The user-agent sheet gives
// hidden="until-found" content-visibility rather than display: none, so
// forcing display: none on it would change platform semantics rather than
// restore them. Quote style and the ASCII case flag are both optional.
const UNTIL_FOUND_NOT =
  /:not\(\s*\[\s*hidden\s*=\s*("until-found"|'until-found'|until-found)\s*(i|I)?\s*\]\s*\)/g;

// This scanner is a deliberate second copy of the one in
// type-conformance.test.mjs. The shared home for it would be a module under
// src/, and src/ belongs to another lane on this wave. Extracting one
// src/css-scan.mjs and having both test files import it is a follow-up.
function normalize(text) {
  return text.split(CR + LF).join(LF);
}

// Blank comments in place rather than deleting them, so every reported line
// number still points at the real file, and so a selector that appears only in
// prose is not read as a rule. shell.css names both retired patches in its own
// comment, which makes that second property load bearing rather than tidy.
function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function lineOf(text, index) {
  if (index < 0) return 0;
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === LF) n++;
  return n;
}

export function parseRules(cssText) {
  const clean = blankComments(normalize(cssText));
  const rules = [];
  const atStack = [];
  let i = 0;
  let buf = "";
  let selStart = -1;

  while (i < clean.length) {
    const ch = clean[i];
    if (ch === "{") {
      const selector = buf.trim().replace(/\s+/g, " ");
      const start = selStart;
      buf = "";
      selStart = -1;
      if (selector.startsWith("@")) {
        atStack.push(selector);
        i++;
        continue;
      }
      let depth = 1;
      let body = "";
      i++;
      while (i < clean.length) {
        const c = clean[i];
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        body += c;
        i++;
      }
      rules.push({ selector, body, at: atStack.slice(), line: lineOf(clean, start) });
      continue;
    }
    if (ch === "}") {
      atStack.pop();
      buf = "";
      selStart = -1;
      i++;
      continue;
    }
    if (selStart < 0 && !/\s/.test(ch)) selStart = i;
    buf += ch;
    i++;
  }
  return rules;
}

export function declarations(body) {
  const out = [];
  for (const part of body.split(";")) {
    const d = part.trim();
    if (!d) continue;
    const k = d.indexOf(":");
    if (k < 0) continue;
    out.push({ prop: d.slice(0, k).trim().toLowerCase(), value: d.slice(k + 1).trim() });
  }
  return out;
}

function displayDecl(body) {
  return declarations(body).find((d) => d.prop === "display") || null;
}

function isImportant(value) {
  return /!\s*important\s*$/i.test(value);
}

// Split a selector list on top-level commas, ignoring commas inside :not(...)
// and friends. `.a:not(.b, .c), .d` is two parts, not three.
export function selectorParts(selector) {
  const out = [];
  let depth = 0;
  let buf = "";
  for (const ch of selector) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
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
 * Classify one selector part with respect to the hidden attribute.
 *
 *   "none"      does not select the hidden attribute at all
 *   "global"    selects the bare attribute, with at most the until-found
 *               carve-out; this is the shape the card asked for
 *   "scoped"    the attribute is tied to a component, a type or an ancestor,
 *               which is the per-component patch pattern
 *   "narrowed"  bare attribute, but carrying a functional pseudo other than
 *               the approved carve-out, which quietly exempts something
 */
export function classifyHidden(part) {
  if (!/\[\s*hidden/.test(part)) return "none";

  // Take the carve-out out of the way first, so its own [hidden] text is not
  // read as a second attribute selector.
  const withoutCarveOut = part.replace(UNTIL_FOUND_NOT, "");

  // A combinator means the attribute is being reached through something else.
  const compounds = withoutCarveOut.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const carrying = compounds.filter((c) => /\[\s*hidden/.test(c));
  if (carrying.length === 0) return "none";
  if (compounds.length > 1) return "scoped";

  const compound = carrying[0];
  // Everything that is not the bare attribute presence selector.
  const rest = compound.replace(/\[\s*hidden\s*\]/, "").trim();
  if (rest === "") return "global";
  if (/^[:]/.test(rest)) return "narrowed";
  return "scoped";
}

export function findHiddenRuleViolations(cssText, label = "shell.css") {
  const rules = parseRules(cssText);
  const v = [];
  const add = (kind, line, selector, message) =>
    v.push({ kind, line, selector, message: `${label}:${line}  ${selector}  [${kind}]  ${message}` });

  const globals = [];

  for (const rule of rules) {
    for (const part of selectorParts(rule.selector)) {
      const kind = classifyHidden(part);
      if (kind === "none") continue;
      if (kind === "scoped") {
        add("per-component", rule.line, part,
          "scopes the hidden attribute to a component. G-81 retired that pattern: two of them shipped and a live defect still got through. The rule that covers every component is already in this file, so this one is either redundant or a carve-out nobody will find later.");
        continue;
      }
      if (kind === "narrowed") {
        add("narrowed-global", rule.line, part,
          "narrows the global hidden rule with a pseudo other than the approved :not([hidden=\"until-found\" i]) carve-out. An exemption written here is invisible at the component that stops hiding.");
        continue;
      }
      globals.push({ rule, part });
    }
  }

  if (globals.length === 0) {
    add("missing", 0, "[hidden]",
      "no rule selects the bare hidden attribute. Without it el.hidden = true is inert on every component the kit gives an explicit display, which is how an amber Partial pill shipped beside the words 'No meeting packet has been read'.");
    return v;
  }
  if (globals.length > 1) {
    for (const g of globals.slice(1)) {
      add("duplicate", g.rule.line, g.part,
        `a second global hidden rule; the first is at line ${globals[0].rule.line}. One authoritative copy, because a duplicate is a future contradiction.`);
    }
  }

  for (const g of globals) {
    const { rule, part } = g;
    if (rule.at.length > 0) {
      add("conditional", rule.line, part,
        `sits inside ${rule.at.join(" / ")}, so the attribute would work only under that condition. The rule has to hold everywhere.`);
    }
    const decl = displayDecl(rule.body);
    if (!decl) {
      add("no-display", rule.line, part,
        "does not declare display, so it cannot override a component's own display.");
      continue;
    }
    const value = decl.value.replace(/!\s*important\s*$/i, "").trim().toLowerCase();
    if (value !== "none") {
      add("wrong-display", rule.line, part,
        `declares display: ${decl.value}. The hidden attribute means not rendered, so the value is none.`);
    }
    if (!isImportant(decl.value)) {
      add("not-important", rule.line, part,
        "declares display without !important. An attribute selector and a class score the same, so this rule ties .pill and loses to any later component rule; the weight is what makes it independent of where the next rule lands.");
    }
  }

  // The one thing that could outrank the global rule as the file grows.
  for (const rule of rules) {
    const decl = displayDecl(rule.body);
    if (!decl || !isImportant(decl.value)) continue;
    if (globals.some((g) => g.rule === rule)) continue;
    add("competing-important", rule.line, rule.selector,
      `declares display: ${decl.value}. Only the global hidden rule declares an important display in this file; a second one can outrank it and put the attribute back to being inert on that component.`);
  }

  return v;
}

function report(violations) {
  return `${violations.length} hidden-rule violation(s):\n` + violations.map((x) => "  " + x.message).join("\n");
}

const shellCss = fs.readFileSync(SHELL, "utf8");

describe("G-81 the hidden attribute works product-wide, web/shell.css", () => {
  it("carries exactly one global rule, unconditional, display none, important", () => {
    const bad = findHiddenRuleViolations(shellCss).filter((x) =>
      ["missing", "duplicate", "conditional", "no-display", "wrong-display", "not-important"].includes(x.kind),
    );
    assert.equal(bad.length, 0, report(bad));
  });

  it("scopes the hidden attribute to no component, so the retired pattern cannot return", () => {
    const bad = findHiddenRuleViolations(shellCss).filter((x) => x.kind === "per-component");
    assert.equal(bad.length, 0, report(bad));
    for (const patch of RETIRED_PATCHES) {
      const rules = parseRules(shellCss);
      const back = rules.find((r) => selectorParts(r.selector).includes(patch));
      assert.equal(back, undefined, `${patch} is back; G-81 replaced it with the global rule`);
    }
  });

  it("lets nothing else declare an important display, which is all that could outrank it", () => {
    const bad = findHiddenRuleViolations(shellCss).filter((x) =>
      ["competing-important", "narrowed-global"].includes(x.kind),
    );
    assert.equal(bad.length, 0, report(bad));
  });

  it("is clean on every check at once", () => {
    const bad = findHiddenRuleViolations(shellCss);
    assert.equal(bad.length, 0, report(bad));
  });

  it("is load bearing: the components it covers still declare their own display", () => {
    // If this ever fails the defect is gone for a different reason and the
    // rule's rationale needs rewriting, which is worth being told about.
    const rules = parseRules(shellCss);
    for (const name of EXPLICIT_DISPLAY_COMPONENTS) {
      const rule = rules.find((r) => selectorParts(r.selector).includes(`.${name}`));
      assert.ok(rule, `.${name} rule not found`);
      const decl = displayDecl(rule.body);
      assert.ok(decl, `.${name} no longer declares its own display`);
      assert.notEqual(decl.value.trim(), "none", `.${name} display`);
    }
  });

  it("keeps the rule's reasoning next to the rule", () => {
    // The card asked for the specificity argument in a comment. A future
    // reader deleting the !important is the failure mode; the reason it is
    // there has to be where they are looking.
    assert.match(shellCss, /specificity|score the same|score one/i);
    assert.match(shellCss, /until-found/);
  });
});

// ---------------------------------------------------------------------------
// Proof that the guard can fire. Each fixture is the smallest CSS that should
// trip exactly one check, and each assertion reads the selector back out, so a
// checker that returned a bare true would fail these too.
// ---------------------------------------------------------------------------

const GOOD = `[hidden]:not([hidden="until-found" i]) { display: none !important; }
.pill { display: inline-flex; }
.state { display: flex; }`;

const GOOD_BARE = `[hidden] { display: none !important; }
.pill { display: inline-flex; }`;

function kinds(css) {
  return findHiddenRuleViolations(css, "fixture").map((x) => x.kind).sort();
}

describe("G-81 the guard is proven able to fire", () => {
  it("passes the approved form, so a failure below means something", () => {
    assert.deepEqual(kinds(GOOD), []);
  });

  it("passes the bare form too; the carve-out is allowed, not required", () => {
    assert.deepEqual(kinds(GOOD_BARE), []);
  });

  it("fires when the rule is absent", () => {
    const v = findHiddenRuleViolations(`.pill { display: inline-flex; }`, "fixture");
    assert.deepEqual(v.map((x) => x.kind), ["missing"]);
    assert.match(v[0].message, /amber Partial pill/);
  });

  it("fires on a per-component patch, which is the pattern G-81 retired", () => {
    const v = findHiddenRuleViolations(`${GOOD}
.stage[hidden] { display: none; }`, "fixture");
    assert.deepEqual(v.map((x) => x.kind), ["per-component"]);
    assert.match(v[0].message, /\.stage\[hidden\]/);
  });

  it("fires on a per-component patch hiding inside a selector list", () => {
    const v = findHiddenRuleViolations(`${GOOD}
.a, .b[hidden], .c { display: none; }`, "fixture");
    assert.deepEqual(v.map((x) => x.kind), ["per-component"]);
    assert.match(v[0].message, /\.b\[hidden\]/);
  });

  it("fires on an ancestor-scoped patch, which is the same bet in different clothing", () => {
    const v = findHiddenRuleViolations(`${GOOD}
.panel [hidden] { display: none; }`, "fixture");
    assert.deepEqual(v.map((x) => x.kind), ["per-component"]);
    assert.match(v[0].message, /\.panel \[hidden\]/);
  });

  it("fires on a type-scoped patch", () => {
    const v = findHiddenRuleViolations(`${GOOD}
span[hidden] { display: none; }`, "fixture");
    assert.deepEqual(v.map((x) => x.kind), ["per-component"]);
  });

  it("fires when the important weight is dropped", () => {
    const v = findHiddenRuleViolations(`[hidden] { display: none; }
.pill { display: inline-flex; }`, "fixture");
    assert.deepEqual(v.map((x) => x.kind), ["not-important"]);
    assert.match(v[0].message, /ties \.pill/);
  });

  it("fires when display is missing or wrong on the global rule", () => {
    assert.deepEqual(kinds(`[hidden] { visibility: hidden; }`), ["no-display"]);
    assert.deepEqual(kinds(`[hidden] { display: block !important; }`), ["wrong-display"]);
  });

  it("fires when the rule is made conditional by an at-rule", () => {
    const v = findHiddenRuleViolations(`@media (max-width: 900px) {
  [hidden] { display: none !important; }
}`, "fixture");
    assert.deepEqual(v.map((x) => x.kind), ["conditional"]);
    assert.match(v[0].message, /max-width/);
  });

  it("fires on a second global rule, because a duplicate is a future contradiction", () => {
    const v = findHiddenRuleViolations(`${GOOD}
[hidden] { display: none !important; }`, "fixture");
    assert.deepEqual(v.map((x) => x.kind), ["duplicate"]);
  });

  it("fires on a competing important display, the one thing that could outrank it", () => {
    const v = findHiddenRuleViolations(`${GOOD}
.lens.on { display: flex !important; }`, "fixture");
    assert.deepEqual(v.map((x) => x.kind), ["competing-important"]);
    assert.match(v[0].message, /\.lens\.on/);
  });

  it("fires on a carve-out smuggled into the global rule", () => {
    const v = findHiddenRuleViolations(`[hidden]:not(.pill) { display: none !important; }
.pill { display: inline-flex; }`, "fixture");
    // Two violations, and both are true: the rule that is there is narrowed,
    // and the rule that would cover .pill is therefore absent. Reporting only
    // the first would read as a style note on a working stylesheet.
    assert.deepEqual(v.map((x) => x.kind), ["narrowed-global", "missing"]);
    assert.match(v[0].message, /until-found/);
    assert.match(v[1].message, /amber Partial pill/);
  });

  it("does not cry wolf at a patch that exists only in a comment", () => {
    // shell.css names both retired patches in its own comment, so this is the
    // real file's shape, not a hypothetical one.
    assert.deepEqual(kinds(`/* .stage[hidden] and .stage-esc[hidden] were deleted here */
${GOOD}`), []);
  });

  it("does not cry wolf at an unrelated important declaration", () => {
    assert.deepEqual(kinds(`${GOOD}
* { animation-duration: 0ms !important; }`), []);
  });

  it("reads the real file as one global rule and nothing scoped", () => {
    // Ties the fixtures back to the artifact under guard: the classifier is
    // reported over shell.css itself, not only over fixtures.
    const parts = parseRules(shellCss).flatMap((r) => selectorParts(r.selector));
    const global = parts.filter((p) => classifyHidden(p) === "global");
    const scoped = parts.filter((p) => classifyHidden(p) === "scoped");
    assert.deepEqual(global, ['[hidden]:not([hidden="until-found" i])']);
    assert.deepEqual(scoped, []);
  });
});
