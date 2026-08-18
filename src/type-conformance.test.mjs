// G-76. Keeps web/shell.css on the 30b section 1.3 type law.
//
// The law, restated so this file is readable without the spec open:
//   - Two faces. var(--sc-font-ui) for anything read aloud as a sentence,
//     var(--sc-font-data) for anything read aloud as a number or a code.
//   - Eight ramp steps. display 26/32 650 -0.022em, title 19/26 620 -0.015em,
//     head 15/22 620 -0.008em, body 14/20 400, body-em 14/20 600,
//     label 12/16 500 mono uppercase 0.06em, caption 12/16 400, data 13/18 400 mono.
//   - 12px is the floor and nothing renders below it. The one named exception is
//     the evidence chip label at 10px, and that component does not exist in this
//     product, so the floor is absolute here.
//   - Uppercase only for mono labels, always with 0.06em to 0.16em tracking.
//   - shell.css consumes var(--sc-*) only: no hex, no rgb(), no token declaration.
//
// The checker is a pure function over CSS text so that it can be PROVEN to fire.
// A gate that has only ever been run against passing input is not a gate
// (DEV_PROCESS 2.2), so every violation class below has a negative fixture in
// this file asserting the exact violation comes back, plus a clean fixture
// asserting the checker does not cry wolf.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = path.join(root, "web", "shell.css");

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

export const FLOOR_PX = 12;

// The ramp steps this file pins by selector. Each is a rule that carries a
// structural job on the shell, so a drift here is a drift in the reading order
// of the whole product.
export const RAMP = [
  { selector: ".panel-head .t", step: "head", weight: 620, size: 15, line: "22px", tracking: "-0.008em", mono: false },
  { selector: ".srcreg .nm b", step: "body-em", weight: 600, size: 14, line: "20px", tracking: null, mono: false },
  { selector: ".state h2, .state h5", step: "head", weight: 620, size: 15, line: "22px", tracking: "-0.008em", mono: false },
  { selector: ".pagehead h1", step: "title", weight: 620, size: 19, line: "26px", tracking: "-0.015em", mono: false },
  { selector: ".cz h1", step: "display", weight: 650, size: 26, line: "32px", tracking: "-0.022em", mono: false },
];

const TRACKING_MIN = 0.06;
const TRACKING_MAX = 0.16;
const FONT_KEYWORD = /^(inherit|initial|unset|revert|revert-layer)$/i;

function normalize(text) {
  return text.split(CR + LF).join(LF);
}

// Blank comments in place rather than deleting them, so every byte offset and
// therefore every reported line number still points at the real file.
function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function lineOf(text, index) {
  if (index < 0) return 0;
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === LF) n++;
  return n;
}

// Small CSS scanner. Handles nested at-rule blocks (@media) and returns one
// entry per style rule with its selector, declaration body and source line.
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

// font: <weight> <size>px/<line> <family>
export function parseFontShorthand(value) {
  const m = value.match(/^(\d{3})\s+(\d*\.?\d+)px\s*\/\s*(\d*\.?\d+(?:px)?)\s+(.+)$/);
  if (!m) return null;
  return { weight: Number(m[1]), size: Number(m[2]), line: m[3], family: m[4].trim() };
}

function sizeInShorthand(value) {
  const m = value.match(/(\d*\.?\d+)px\s*\//);
  return m ? Number(m[1]) : null;
}

function trackingEm(value) {
  const m = String(value).match(/^(-?\d*\.?\d+)em$/);
  return m ? Number(m[1]) : null;
}

function usesMono(decls) {
  return decls.some(
    (d) => (d.prop === "font" || d.prop === "font-family") && d.value.includes("var(--sc-font-data)"),
  );
}

export function findTypeViolations(cssText, label = "shell.css") {
  const clean = blankComments(normalize(cssText));
  const rules = parseRules(cssText);
  const v = [];
  const add = (kind, line, selector, value, message) =>
    v.push({ kind, line, selector, value, message: `${label}:${line}  ${selector}  [${kind}]  ${value} — ${message}` });

  // 1. The floor, and anything the floor check cannot read.
  for (const rule of rules) {
    for (const d of declarations(rule.body)) {
      if (d.prop === "font-size") {
        const m = d.value.match(/^(\d*\.?\d+)px$/);
        if (!m) {
          if (FONT_KEYWORD.test(d.value)) continue;
          add("unparsed", rule.line, rule.selector, `font-size: ${d.value}`,
            "font-size is not a plain px value, so the 12px floor cannot be checked; an unreadable declaration is not a passing one");
          continue;
        }
        if (Number(m[1]) < FLOOR_PX) {
          add("floor", rule.line, rule.selector, `${m[1]}px`,
            `below the ${FLOOR_PX}px floor; 30b section 1.3 type law, and the one named 10px exception is the evidence chip, which does not exist in this product`);
        }
      } else if (d.prop === "font") {
        if (FONT_KEYWORD.test(d.value)) continue;
        const size = sizeInShorthand(d.value);
        if (size === null) {
          add("unparsed", rule.line, rule.selector, `font: ${d.value}`,
            "no <size>px/<line> pair found in the font shorthand, so the 12px floor cannot be checked");
          continue;
        }
        if (size < FLOOR_PX) {
          add("floor", rule.line, rule.selector, `${size}px`,
            `below the ${FLOOR_PX}px floor; 30b section 1.3 type law, and the one named 10px exception is the evidence chip, which does not exist in this product`);
        }
      }
    }
  }

  // 2. The pinned ramp steps. A renamed or deleted selector is a violation too:
  // an absent rule must not read the same as a conformant one.
  for (const want of RAMP) {
    const rule = rules.find((r) => r.selector === want.selector);
    if (!rule) {
      add("ramp-missing", 0, want.selector, "(rule not found)",
        `expected the ${want.step} step here; if the selector was renamed, move the expectation with it rather than dropping the guard`);
      continue;
    }
    const decls = declarations(rule.body);
    const fontDecl = decls.find((d) => d.prop === "font");
    if (!fontDecl) {
      add("ramp", rule.line, want.selector, "(no font shorthand)",
        `must set the ${want.step} step as a font shorthand: ${want.weight} ${want.size}px/${want.line}`);
      continue;
    }
    const font = parseFontShorthand(fontDecl.value);
    if (!font) {
      add("ramp", rule.line, want.selector, `font: ${fontDecl.value}`,
        `unreadable font shorthand; the ${want.step} step is ${want.weight} ${want.size}px/${want.line}`);
      continue;
    }
    if (font.weight !== want.weight || font.size !== want.size || font.line !== want.line) {
      add("ramp", rule.line, want.selector, `${font.weight} ${font.size}px/${font.line}`,
        `is not the ${want.step} step, which is ${want.weight} ${want.size}px/${want.line}`);
    }
    const wantFamily = want.mono ? "var(--sc-font-data)" : "var(--sc-font-ui)";
    if (!font.family.includes(wantFamily)) {
      add("ramp", rule.line, want.selector, font.family,
        `the ${want.step} step is set in ${wantFamily}`);
    }
    const ls = decls.find((d) => d.prop === "letter-spacing");
    const have = ls ? ls.value : null;
    if (want.tracking && have !== want.tracking) {
      add("ramp", rule.line, want.selector, `letter-spacing: ${have === null ? "(absent)" : have}`,
        `the ${want.step} step tracks ${want.tracking}`);
    }
    if (!want.tracking && have && trackingEm(have) !== 0) {
      add("ramp", rule.line, want.selector, `letter-spacing: ${have}`,
        `the ${want.step} step has no tracking`);
    }
  }

  // 3. Uppercase belongs to mono labels only, and always carries its tracking.
  for (const rule of rules) {
    const decls = declarations(rule.body);
    const tt = decls.find((d) => d.prop === "text-transform" && /uppercase/i.test(d.value));
    if (!tt) continue;
    if (!usesMono(decls)) {
      const font = decls.find((d) => d.prop === "font" || d.prop === "font-family");
      add("uppercase-face", rule.line, rule.selector, font ? font.value : "(no font declared on this rule)",
        "uppercase is for mono labels only and never on a sentence; the rule must set var(--sc-font-data) itself");
      continue;
    }
    const ls = decls.find((d) => d.prop === "letter-spacing");
    const em = ls ? trackingEm(ls.value) : null;
    if (em === null || em < TRACKING_MIN || em > TRACKING_MAX) {
      add("uppercase-tracking", rule.line, rule.selector, `letter-spacing: ${ls ? ls.value : "(absent)"}`,
        `an uppercase mono label always tracks ${TRACKING_MIN}em to ${TRACKING_MAX}em`);
    }
  }

  // 4. The stylesheet consumes tokens, it does not declare or bypass them.
  for (const m of clean.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    add("hex", lineOf(clean, m.index), "(file)", m[0],
      "shell.css carries no color of its own; every color is a var(--sc-*)");
  }
  for (const m of clean.matchAll(/\brgba?\(/g)) {
    add("rgb", lineOf(clean, m.index), "(file)", m[0],
      "shell.css carries no color of its own; every color is a var(--sc-*)");
  }
  for (const m of clean.matchAll(/(--sc-[A-Za-z0-9-]+)\s*:/g)) {
    add("token-declaration", lineOf(clean, m.index), "(file)", m[1],
      "the kit is the single source of truth; a repo that declares a token has forked the system");
  }

  return v;
}

function report(violations) {
  return `${violations.length} type-law violation(s):\n` + violations.map((x) => "  " + x.message).join("\n");
}

const shellCss = fs.readFileSync(SHELL, "utf8");

describe("G-76 type conformance, web/shell.css", () => {
  it("renders nothing below the 12px floor", () => {
    const bad = findTypeViolations(shellCss).filter((x) => x.kind === "floor" || x.kind === "unparsed");
    assert.equal(bad.length, 0, report(bad));
  });

  it("sets the pinned ramp steps exactly", () => {
    const bad = findTypeViolations(shellCss).filter((x) => x.kind === "ramp" || x.kind === "ramp-missing");
    assert.equal(bad.length, 0, report(bad));
  });

  it("keeps uppercase on mono labels, always tracked", () => {
    const bad = findTypeViolations(shellCss).filter((x) => x.kind.startsWith("uppercase"));
    assert.equal(bad.length, 0, report(bad));
  });

  it("declares no color and no token of its own", () => {
    const bad = findTypeViolations(shellCss).filter((x) => ["hex", "rgb", "token-declaration"].includes(x.kind));
    assert.equal(bad.length, 0, report(bad));
  });

  it("is clean on every check at once", () => {
    const bad = findTypeViolations(shellCss);
    assert.equal(bad.length, 0, report(bad));
  });
});

// ---------------------------------------------------------------------------
// Proof that the gate can fire. Each fixture is the smallest CSS that should
// trip exactly one check, and each assertion reads the selector and the value
// back out, so a checker that returned a bare true would fail these too.
// ---------------------------------------------------------------------------

const CONFORMANT_RAMP = `
.panel-head .t { font: 620 15px/22px var(--sc-font-ui); letter-spacing: -0.008em; }
.srcreg .nm b { font: 600 14px/20px var(--sc-font-ui); }
.state h2, .state h5 { font: 620 15px/22px var(--sc-font-ui); letter-spacing: -0.008em; }
.pagehead h1 { font: 620 19px/26px var(--sc-font-ui); letter-spacing: -0.015em; }
.cz h1 { font: 650 26px/32px var(--sc-font-ui); letter-spacing: -0.022em; }
`;

function only(css, ...kinds) {
  return findTypeViolations(css, "fixture").filter((x) => kinds.includes(x.kind));
}

describe("G-76 the guard is proven able to fire", () => {
  it("passes a conformant fixture, so a failure below means something", () => {
    assert.equal(findTypeViolations(CONFORMANT_RAMP, "fixture").length, 0,
      report(findTypeViolations(CONFORMANT_RAMP, "fixture")));
  });

  it("catches a font shorthand below the floor and names the selector and size", () => {
    const bad = only(CONFORMANT_RAMP + `.navitem .badge { font: 500 10px/1 var(--sc-font-data); letter-spacing: 0.06em; }`, "floor");
    assert.equal(bad.length, 1, report(bad));
    assert.equal(bad[0].selector, ".navitem .badge");
    assert.equal(bad[0].value, "10px");
    assert.match(bad[0].message, /\.navitem \.badge/);
    assert.match(bad[0].message, /10px/);
  });

  it("catches a font-size below the floor", () => {
    const bad = only(CONFORMANT_RAMP + `.seal { font-size: 9px; }`, "floor");
    assert.equal(bad.length, 1, report(bad));
    assert.equal(bad[0].selector, ".seal");
    assert.equal(bad[0].value, "9px");
  });

  it("passes a font size sitting exactly on the floor", () => {
    assert.equal(only(CONFORMANT_RAMP + `.btn-sm { font-size: 12px; }`, "floor", "unparsed").length, 0);
  });

  it("refuses to call an unreadable font declaration conformant", () => {
    const bad = only(CONFORMANT_RAMP + `.x { font-size: 0.7rem; }`, "unparsed");
    assert.equal(bad.length, 1, report(bad));
    assert.equal(bad[0].selector, ".x");
    assert.match(bad[0].value, /0\.7rem/);
  });

  it("catches a ramp selector that drifted off its step", () => {
    const drifted = CONFORMANT_RAMP.replace(
      ".panel-head .t { font: 620 15px/22px var(--sc-font-ui); letter-spacing: -0.008em; }",
      ".panel-head .t { font: 620 13px/18px var(--sc-font-ui); }",
    );
    const bad = only(drifted, "ramp");
    assert.ok(bad.some((x) => x.selector === ".panel-head .t" && x.value === "620 13px/18px"), report(bad));
    assert.ok(bad.some((x) => /head step/.test(x.message)), report(bad));
  });

  it("catches a ramp selector that lost its tracking", () => {
    const drifted = CONFORMANT_RAMP.replace("letter-spacing: -0.015em;", "");
    const bad = only(drifted, "ramp");
    assert.equal(bad.length, 1, report(bad));
    assert.equal(bad[0].selector, ".pagehead h1");
    assert.match(bad[0].value, /absent/);
  });

  it("catches a ramp selector that was renamed away", () => {
    const bad = only(CONFORMANT_RAMP.replace(".cz h1 {", ".cz .hero-title {"), "ramp-missing");
    assert.equal(bad.length, 1, report(bad));
    assert.equal(bad[0].selector, ".cz h1");
  });

  it("catches uppercase on a rule that is not mono", () => {
    const bad = only(CONFORMANT_RAMP + `.lede { font: 400 14px/20px var(--sc-font-ui); text-transform: uppercase; }`, "uppercase-face");
    assert.equal(bad.length, 1, report(bad));
    assert.equal(bad[0].selector, ".lede");
    assert.match(bad[0].value, /--sc-font-ui/);
  });

  it("catches an uppercase mono label tracked outside 0.06em to 0.16em", () => {
    const bad = only(CONFORMANT_RAMP + `.env { font: 500 12px/16px var(--sc-font-data); letter-spacing: 0.04em; text-transform: uppercase; }`, "uppercase-tracking");
    assert.equal(bad.length, 1, report(bad));
    assert.equal(bad[0].selector, ".env");
    assert.match(bad[0].value, /0\.04em/);
  });

  it("catches a hex color, an rgb() and a token declaration", () => {
    const hex = only(CONFORMANT_RAMP + `.a { color: #ff0000; }`, "hex");
    assert.equal(hex.length, 1, report(hex));
    assert.equal(hex[0].value, "#ff0000");

    const rgb = only(CONFORMANT_RAMP + `.b { color: rgba(0, 0, 0, .5); }`, "rgb");
    assert.equal(rgb.length, 1, report(rgb));

    const tok = only(CONFORMANT_RAMP + `.c { --sc-accent: var(--sc-ink); }`, "token-declaration");
    assert.equal(tok.length, 1, report(tok));
    assert.equal(tok[0].value, "--sc-accent");
  });

  it("does not read declarations out of a comment, and keeps line numbers honest", () => {
    const css = `/* #ff0000 rgba(1,2,3,.4) --sc-accent: red */\n.d { font-size: 9px; }`;
    const bad = findTypeViolations(css, "fixture");
    assert.equal(bad.filter((x) => ["hex", "rgb", "token-declaration"].includes(x.kind)).length, 0, report(bad));
    const floor = bad.filter((x) => x.kind === "floor");
    assert.equal(floor.length, 1, report(floor));
    assert.equal(floor[0].line, 2, "the comment was blanked, not deleted, so line 2 is still line 2");
  });

  it("reads rules nested inside an at-rule block", () => {
    const css = CONFORMANT_RAMP + `@media (max-width: 900px) { .metric .k { font: 500 11px/1 var(--sc-font-data); letter-spacing: 0.08em; } }`;
    const bad = only(css, "floor");
    assert.equal(bad.length, 1, report(bad));
    assert.equal(bad[0].selector, ".metric .k");
    assert.equal(bad[0].value, "11px");
  });

  it("survives a CRLF checkout, because the repo checks out CRLF on Windows", () => {
    const crlf = (CONFORMANT_RAMP + `.e { font-size: 8px; }`).split(LF).join(CR + LF);
    const bad = only(crlf, "floor");
    assert.equal(bad.length, 1, report(bad));
    assert.equal(bad[0].selector, ".e");
    assert.equal(bad[0].value, "8px");
  });
});
