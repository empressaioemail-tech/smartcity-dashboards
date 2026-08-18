import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";
import {
  SHELL_HOMES,
  SHELL_HOMES_COUNTING_RULE,
  connectionsRegisterHtml,
} from "./shell-homes.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");

describe("G-73 shell homes register", () => {
  it("counts 67 Homes-table rows and names the denominator", () => {
    assert.equal(SHELL_HOMES.length, 67);
    assert.match(SHELL_HOMES_COUNTING_RULE, /67/);
    assert.equal(SHELL_HOMES.filter((r) => r.table === "primary").length, 31);
    assert.equal(SHELL_HOMES.filter((r) => r.table === "review-product").length, 7);
    assert.equal(SHELL_HOMES.filter((r) => r.table === "products").length, 6);
    assert.equal(SHELL_HOMES.filter((r) => r.table === "feeds").length, 12);
    assert.equal(SHELL_HOMES.filter((r) => r.table === "other").length, 11);
    for (const row of SHELL_HOMES) {
      assert.ok(row.job);
      assert.ok(row.home);
      assert.ok(row.disposition);
    }
  });

  it("bakes every register row into Connections HTML with no invented sync times", () => {
    const baked = html.match(/data-home-row="/g) || [];
    assert.equal(baked.length, SHELL_HOMES.length);
    assert.match(html, /id="work-connections"/);
    assert.match(html, /67 of 67/);
    assert.match(html, /Homes-table row/);
    assert.equal(html.includes("last synced"), false);
    assert.equal(html.includes("Last sync"), false);
    assert.equal(/\d{4}-\d{2}-\d{2}T\d{2}:/.test(html), false);
    for (const row of SHELL_HOMES) {
      assert.equal(html.includes(row.job), true, row.job);
    }
    const generated = connectionsRegisterHtml();
    assert.equal((generated.match(/data-home-row="/g) || []).length, 67);
  });

  it("keeps forbidden product strings out of the register surface", () => {
    const surface = html + connectionsRegisterHtml();
    for (const s of FORBIDDEN_PRODUCT_STRINGS) {
      assert.equal(surface.includes(s), false, s);
    }
  });
});
