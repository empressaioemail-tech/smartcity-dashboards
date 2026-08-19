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
      "dashboards_compose_city_manager",
      "dashboards_list_adapter_kinds",
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

  it("CI is Node 22 plus npm test, with no deploy, gcloud, or vercel", () => {
    const ci = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    assert.match(ci, /node-version:\s*["']?22/);
    assert.match(ci, /npm test/);
    assert.equal(/gcloud/i.test(ci), false);
    assert.equal(/vercel/i.test(ci), false);
    assert.equal(/deploy/i.test(ci), false);
  });

  it("infra.md pins this product's GCP and Neon host, and forbids supplier projects", () => {
    const infra = fs.readFileSync(path.join(root, "infra.md"), "utf8");
    assert.match(infra, /ep-still-wave-avbwm4yc-pooler/);
    assert.match(infra, /666199866241/);
    assert.match(infra, /smartcity-dashboards/);
    assert.match(infra, /smartcity-os-prod/);
    assert.match(infra, /hauska-prod-497015/);
    assert.match(infra, /legacy-design-tools-prod/);
    assert.match(infra, /DASHBOARDS_API_KEY/);
    assert.equal(infra.includes("v0 has no Neon"), false);
  });

  it("reads the serving revision from a command rather than pinning it in prose", () => {
    /**
     * G-89. This line carried `revision smartcity-dashboards-00001-92j @100%`
     * for EIGHTEEN revisions after it stopped being true. Writing the new
     * number in would have bought another eighteen. A number in a doc is a
     * control that depends on someone remembering, so the claim is replaced by
     * the command that reads the truth, and the dated observation beside it is
     * evidence rather than a pin.
     *
     * Both halves are asserted, and both can fire: delete the command and the
     * first fails; write the claim back in the old form and the second fails.
     */
    const infra = fs.readFileSync(path.join(root, "infra.md"), "utf8");
    assert.match(infra, /gcloud run services describe smartcity-dashboards/);
    assert.match(infra, /--format="value\(status\.traffic\)"/);
    assert.equal(
      /revision `?smartcity-dashboards-\d{5}-\w+`? @\s*100%/.test(infra),
      false,
      "infra.md is asserting a serving revision again; read it with the command instead",
    );
    // Proven able to fire: the claim shape is caught wherever it comes back.
    assert.equal(
      /revision `?smartcity-dashboards-\d{5}-\w+`? @\s*100%/.test(
        "- Cloud Run: revision `smartcity-dashboards-00018-kiw` @100%.",
      ),
      true,
    );
  });
});
