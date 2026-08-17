import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_PRODUCT_STRINGS, MCP_TOOL_NAMES } from "./catalog.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURFACE = ["src", "web"].map((d) => path.join(root, d));

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (
      /\.(mjs|js|html)$/.test(ent.name) &&
      !ent.name.endsWith(".test.mjs") &&
      ent.name !== "catalog.mjs"
    ) {
      acc.push(p);
    }
  }
  return acc;
}

describe("product shape", () => {
  it("names MCP tools for the existing Hauska server and does not start a second MCP", () => {
    assert.deepEqual(MCP_TOOL_NAMES, [
      "dashboards_list_lenses",
      "dashboards_get_city_pack",
    ]);
    const server = fs.readFileSync(path.join(root, "src", "server.mjs"), "utf8");
    assert.equal(server.includes("createMcp"), false);
    assert.equal(server.includes("second MCP"), false);
  });

  it("does not ship forbidden product strings outside tests", () => {
    const files = SURFACE.flatMap((d) => walk(d));
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const s of FORBIDDEN_PRODUCT_STRINGS) {
        assert.equal(text.includes(s), false, `${path.relative(root, file)} contains ${s}`);
      }
    }
  });
});
