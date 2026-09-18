/**
 * G-152. THE FOUR-STATE MATRIX FIXTURE, AND THE COLLAPSE IT MUST REFUSE.
 *
 * The dispatch's acceptance item is not "the matrix renders". It is that
 * CANNOT-OCCUR is drawn distinguishably from a MEASURED ZERO and from
 * UNMEASURED, proven by a fixture that exercises all four states. Those are
 * three different claims about the world and the product has been bitten here
 * before by a fourth shape: a `0` that is a measurement, a `0` that is the
 * absence of a source, and a cell that CANNOT be anything at all all rendering
 * as the same grey zero, so a reader compares them as if they were the same
 * kind of fact. Collapsing two of them is the defect this file exists to
 * refuse, so the assertions below are about EXCLUSIVITY (each cell is drawn in
 * exactly one of the four ways, and the four are four distinct marks) rather
 * than about counts alone.
 *
 * THE FIXTURE IS THE STATE COVERAGE, NOT ONE HAND-BUILT PAYLOAD. No single pack
 * carries all four states - the bundled default has no source at all, and the
 * generated demo pack has no impossible cell for every status - so the fixture
 * is the pair of surfaces the export script already writes, read through the
 * same renderPublicWorksLens() the server and the bake call. A hand-built
 * payload here would be a SECOND implementation of the state derivation, which
 * is the defect class (two renderers agreeing today) this repository's checks
 * are built to catch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { renderPublicWorksLens } from "./public-works-lens.mjs";
import { getMemoryPack } from "./city-pack.mjs";

/** The four states the design declares, and the one class hook each is drawn with. */
const HOOKS = {
  count: "mtx-counted",
  "measured-zero": "mtx-zero-cell",
  unmeasured: "mtx-unread-cell",
  "cannot-occur": "mtx-hatch-cell",
};
const STATES = Object.keys(HOOKS);

/**
 * Every cell that declares a state, with the class hooks its own tag carries.
 * Anchored on the attribute rather than on a fixed tag+class order, because the
 * thing under test is the PAIRING of state and mark, not the markup's shape.
 */
function cells(html) {
  const out = [];
  for (const m of html.matchAll(/<[a-z]+[^>]*data-mtx-state="([a-z-]+)"[^>]*>/g)) {
    const tag = m[0];
    const cls = /class="([^"]*)"/.exec(tag)?.[1] ?? "";
    const held = STATES.filter((s) => cls.split(/\s+/).includes(HOOKS[s]));
    out.push({ state: m[1], held, cls });
  }
  return out;
}

const tally = (html) => {
  const t = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const c of cells(html)) if (c.state in t) t[c.state] += 1;
  return t;
};

const bundled = renderPublicWorksLens(null);
const demo = renderPublicWorksLens(getMemoryPack("template-city"));
/** The pack whose source answers nothing: the only surface carrying UNMEASURED cells. */
const empty = renderPublicWorksLens(getMemoryPack("empty-city"));

test("the four states are four distinct marks, and no cell is drawn as two of them", () => {
  for (const [name, html] of [
    ["bundled", bundled],
    ["template-city", demo],
  ]) {
    for (const c of cells(html)) {
      assert.equal(
        c.held.length,
        1,
        `${name}: a cell declaring state ${c.state} carries ${c.held.length} state marks ` +
          `(class="${c.cls}") - two states drawn as one mark is the collapse this refuses`,
      );
      assert.equal(c.held[0], c.state, `${name}: state ${c.state} is drawn as ${c.held[0]}`);
    }
  }
});

test("the fixture exercises all four states across the surfaces", () => {
  const seen = new Set([...cells(bundled), ...cells(demo)].map((c) => c.state));
  for (const s of STATES) {
    assert.ok(seen.has(s), `the fixture never exercised ${s}; a state with no input is not a pass`);
  }
});

test("an unresolved pack draws unmeasured and cannot-occur, never a counted zero", () => {
  const t = tally(bundled);
  assert.ok(t.unmeasured > 0, "the bundled default must draw its cells as unmeasured");
  assert.ok(t["cannot-occur"] > 0, "the impossible cells are impossible with no source either");
  assert.equal(t.count, 0, "no source cannot produce a count");
  assert.equal(
    t["measured-zero"],
    0,
    "an unmeasured cell must never be drawn as a measured zero - that is the comparison the four states exist to stop",
  );
});

test("a measured zero and an unmeasured zero are not the same mark", () => {
  const zeroCell = cells(demo).find((c) => c.state === "measured-zero");
  const unreadCell = cells(empty).find((c) => c.state === "unmeasured");
  assert.ok(zeroCell, "the demo pack must carry a measured zero");
  assert.ok(unreadCell, "the pack whose source answers nothing must carry an unmeasured cell");
  assert.notEqual(zeroCell.held[0], unreadCell.held[0]);
  assert.ok(HOOKS["measured-zero"] !== HOOKS.unmeasured);
  assert.ok(HOOKS["cannot-occur"] !== HOOKS["measured-zero"]);
  assert.ok(HOOKS["cannot-occur"] !== HOOKS.unmeasured);
});

test("the demo pack draws counts, measured zeros and impossible cells side by side", () => {
  const t = tally(demo);
  assert.ok(t.count > 0, "the demo pack must carry counted cells");
  assert.ok(t["measured-zero"] > 0, "and measured zeros");
  assert.ok(t["cannot-occur"] > 0, "and cells that cannot occur, on the same surface");
});
