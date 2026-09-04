import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_PRODUCT_STRINGS, MCP_TOOL_NAMES } from "./catalog.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURFACE = ["src", "web"].map((d) => path.join(root, d));

/**
 * The extensions the forbidden-string gate walks.
 *
 * CSS was added at G-88 item 7. Until then the walk was mjs, js and html only,
 * so a vendor name written into a web/shell.css comment shipped green - on the
 * exact file G-88 item 2 had just grown by roughly 270 lines of heavily
 * commented CSS. That is a hole on a live surface, not a hypothetical.
 *
 * EXCLUSION SET, stated here where the gate's output is read (DEV_PROCESS 2.1):
 * every *.test.mjs, because a test that asserts the guard fires must be able to
 * name the string it fires on; and src/catalog.mjs, because it IS the refusal
 * list. Nothing else is excused, and both exclusions are asserted below rather
 * than trusted.
 */
const SCANNED_EXTENSIONS = ["mjs", "js", "html", "css"];
const SCANNED_RE = new RegExp(`\\.(${SCANNED_EXTENSIONS.join("|")})$`);

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (
      SCANNED_RE.test(ent.name) &&
      !ent.name.endsWith(".test.mjs") &&
      ent.name !== "catalog.mjs"
    ) {
      acc.push(p);
    }
  }
  return acc;
}

const rel = (p) => path.relative(root, p).split(path.sep).join("/");

function scannedSources() {
  const out = {};
  for (const p of SURFACE.flatMap((d) => walk(d))) out[rel(p)] = fs.readFileSync(p, "utf8");
  return out;
}

/** Every forbidden string found, named with the file that carries it. */
function forbiddenHits(sources) {
  const hits = [];
  for (const [name, text] of Object.entries(sources)) {
    for (const s of FORBIDDEN_PRODUCT_STRINGS) if (text.includes(s)) hits.push(`${name}: ${s}`);
  }
  return hits.sort();
}

/**
 * G-117 / the 2026-09-04 operator decision (dated record in doc_repo's
 * _decisions/ directory, "No Leaflet island overridden for [the] Bastrop
 * map"): "No Leaflet island" (README.md, G-61) is explicitly, narrowly
 * overridden for the native property map's own served page ONLY -- a
 * deliberate, temporary stopgap authorized in writing, not a repeal of the
 * rule. "leaflet" is therefore permitted in exactly this one file and
 * nowhere else; every other file, and every other forbidden string
 * (including "leaflet" in every OTHER file), is still refused exactly as
 * before by the assertions below.
 *
 * Named exactly, not by a pattern like a "property-map*" prefix: a prefix
 * match would silently widen the exception to a future file nobody reviewed
 * against the decision it is supposed to be scoped to.
 */
const LEAFLET_EXCEPTION_FILES = new Set(["web/property-map.html"]);

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
    /**
     * ARM A, the real sources. Counting rule, stated where the number is read:
     * every file under src/ and web/ whose extension is one of
     * SCANNED_EXTENSIONS, minus the exclusion set named beside that constant.
     */
    const sources = scannedSources();
    const allHits = forbiddenHits(sources);

    // Every hit that is NOT the named, narrow "leaflet" exception must still
    // be empty -- nothing else slipped through, and "leaflet" itself is still
    // refused in every file other than the one named above.
    const unexpectedHits = allHits.filter((hit) => {
      const [name, s] = [hit.slice(0, hit.lastIndexOf(": ")), hit.slice(hit.lastIndexOf(": ") + 2)];
      return !(s === "leaflet" && LEAFLET_EXCEPTION_FILES.has(name));
    });
    assert.deepEqual(unexpectedHits, []);

    // The exception is real and exactly this narrow, not silently wider and
    // not dead weight: the only "leaflet" hits that exist at all are exactly
    // the named exception file(s), and each one genuinely uses "leaflet" (so
    // removing Leaflet from that page without updating this set is itself a
    // finding, not a silent pass).
    const leafletHits = allHits.filter((hit) => hit.endsWith(": leaflet"));
    assert.deepEqual(
      leafletHits.sort(),
      [...LEAFLET_EXCEPTION_FILES].sort().map((f) => `${f}: leaflet`),
    );

    /**
     * ARM B, and this gate had NO firing arm at all before G-88 item 7, which
     * means nobody had ever seen it work. Every forbidden string is injected
     * into one real file of EVERY scanned extension, and the gate must fire and
     * name that file. Running it per extension rather than once is the point:
     * the .css leg is red the moment the walk narrows again, which is exactly
     * how this shipped broken.
     *
     * The representative picked per extension is never a LEAFLET_EXCEPTION_FILES
     * member: injecting "leaflet" into an excepted file would not fire the
     * gate (by design) and would falsely look like this arm itself broke.
     * Every extension already has a non-excepted file to serve as the
     * representative, so this exclusion never leaves an extension uncovered.
     */
    const byExtension = {};
    for (const name of Object.keys(sources)) {
      const ext = name.slice(name.lastIndexOf(".") + 1);
      if (!byExtension[ext] && !LEAFLET_EXCEPTION_FILES.has(name)) byExtension[ext] = name;
    }
    assert.deepEqual(
      Object.keys(byExtension).sort(),
      [...SCANNED_EXTENSIONS].sort(),
      "an extension this gate claims to scan has no file to prove it on",
    );
    for (const [ext, name] of Object.entries(byExtension)) {
      for (const s of FORBIDDEN_PRODUCT_STRINGS) {
        const injected = { ...sources, [name]: `${sources[name]}\n/* ${s} */\n` };
        // The named "leaflet" exception's own baseline hit is real, expected,
        // and unrelated to this injection -- excluded here for the same
        // reason it is excluded from ARM A above, so this loop keeps proving
        // exactly what it always proved (the injected hit fires, naming the
        // injected file) rather than failing on a hit this test itself
        // already asserted is correct.
        const hits = forbiddenHits(injected).filter(
          (hit) => !leafletHits.includes(hit),
        );
        assert.deepEqual(
          hits,
          [`${name}: ${s}`],
          `injecting ${s} into the ${ext} source ${name} did not fire the gate naming that file`,
        );
      }
    }

    /**
     * The exclusion set is asserted rather than trusted. src/catalog.mjs holds
     * the refusal list itself and would be a permanent red; every *.test.mjs
     * names the strings it proves the guard fires on.
     */
    assert.equal(Object.keys(sources).includes("src/catalog.mjs"), false);
    assert.equal(
      Object.keys(sources).some((name) => name.endsWith(".test.mjs")),
      false,
    );
    // And the CSS the card added IS in the scanned set, not merely allowed to be.
    assert.ok(Object.keys(sources).includes("web/shell.css"));
    assert.ok(Object.keys(sources).includes("web/sc-kit.css"));
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
