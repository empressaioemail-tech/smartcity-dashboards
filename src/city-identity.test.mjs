import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMPTY_CITY,
  FIXTURE_CITY,
  PACK_COLUMNS,
  TEMPLATE_CITY,
  environmentBadgeLabel,
  getCityPack,
} from "./city-pack.mjs";
import { ADAPTER_KINDS } from "./adapters.mjs";
import { composePipeline } from "./fixtures.mjs";
import {
  FALLBACK_VOCABULARY,
  IDENTITY_FALLBACK,
  PRODUCT_TITLE,
  STATE_BY_FIPS,
  cityIdentity,
  packSources,
  packState,
  sealInitials,
} from "./city-identity.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const html = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "web", "app.js"), "utf8");
const identitySrc = fs.readFileSync(path.join(here, "city-identity.mjs"), "utf8");
const PACKS = [TEMPLATE_CITY, EMPTY_CITY, FIXTURE_CITY];

describe("G-80 identity resolves from the pack", () => {
  it("names the pack, not a baked city, on every identity field", () => {
    const template = cityIdentity(TEMPLATE_CITY);
    assert.equal(template.displayName, "Template city");
    assert.equal(template.cityKey, "template-city");
    assert.equal(template.seal, "TC");
    assert.equal(template.documentTitle, `Template city · ${PRODUCT_TITLE}`);

    const empty = cityIdentity(EMPTY_CITY);
    assert.equal(empty.displayName, "Empty city");
    assert.equal(empty.cityKey, "empty-city");
    assert.equal(empty.seal, "EC");
    assert.equal(empty.documentTitle, `Empty city · ${PRODUCT_TITLE}`);

    // The defect this card exists for: two packs must not share an identity.
    assert.notEqual(template.displayName, empty.displayName);
    assert.notEqual(template.seal, empty.seal);
    assert.notEqual(template.documentTitle, empty.documentTitle);
  });

  it("states no state rather than asserting one the pack does not carry", () => {
    for (const pack of PACKS) {
      const identity = cityIdentity(pack);
      assert.equal(identity.stateCode, null, pack.cityKey);
      // An empty result is not an absence: the absence carries its basis.
      assert.match(identity.stateBasis, /no jurisdictionFips/);
    }
    assert.equal(packState({ jurisdictionFips: "48021" }).code, "TX");
    assert.equal(packState({ jurisdictionFips: "4802100" }).code, "TX");
    assert.equal(packState({ jurisdictionFips: "49035" }).code, "UT");
    const unknown = packState({ jurisdictionFips: "99999" });
    assert.equal(unknown.code, null);
    assert.match(unknown.basis, /no state in the FIPS table/);
    for (const [fips, code] of Object.entries(STATE_BY_FIPS)) {
      assert.match(fips, /^\d{2}$/, fips);
      assert.match(code, /^[A-Z]{2}$/, code);
    }
    assert.equal(Object.keys(STATE_BY_FIPS).length, 56);
  });

  it("renders the environment badge the pack declares, in both places", () => {
    for (const pack of PACKS) {
      assert.equal(cityIdentity(pack).environmentBadge, environmentBadgeLabel(pack));
      assert.equal(cityIdentity(pack).isDemo, true);
    }
    // Labelling gate item 1, tested for its ability to fire: a pack that is not
    // demo must not render Demo, and must not carry the demo carrier class.
    const live = { ...TEMPLATE_CITY, cityKey: "live-city", environment: "live", generatesFixtures: false };
    assert.equal(cityIdentity(live).environmentBadge, "Live");
    assert.equal(cityIdentity(live).isDemo, false);
    const staging = { ...live, environment: "staging" };
    assert.equal(cityIdentity(staging).environmentBadge, "Staging");
    assert.equal(cityIdentity(staging).isDemo, false);
    // Both badges are written from one resolved value, not two careful edits.
    assert.match(app, /for \(const id of \["env-badge", "cp-env-badge"\]\)/);
    assert.match(app, /badge\.classList\.toggle\("demo", identity\.isDemo === true\)/);
    assert.match(html, /id="env-badge">Demo</);
    assert.match(html, /id="cp-env-badge">Demo</);
  });

  it("counts the footer figure per pack and carries its counting rule", () => {
    for (const pack of PACKS) {
      const s = cityIdentity(pack).sources;
      assert.equal(s.granted, 0, pack.cityKey);
      assert.equal(s.total, ADAPTER_KINDS.length);
      assert.equal(s.grantCount, 0, pack.cityKey);
      assert.equal(s.label, `0 of ${ADAPTER_KINDS.length} sources granted`);
      assert.match(s.rule, /distinct adapter kinds granted on this pack/);
      assert.match(s.rule, new RegExp(`of ${ADAPTER_KINDS.length} in the catalog`));
    }
    // Distinct kinds: two grants of one kind is one source, never two of seven.
    const twice = packSources({
      grantedAdapters: [
        { kind: "municode", purpose: "calendar" },
        { kind: "municode", purpose: "code" },
      ],
    });
    assert.equal(twice.granted, 1);
    assert.equal(twice.grantCount, 2);
    // A kind outside the catalog cannot inflate the numerator, and does not
    // vanish silently either.
    const bogus = packSources({ grantedAdapters: [{ kind: "not-a-kind" }] });
    assert.equal(bogus.granted, 0);
    assert.deepEqual(bogus.unknownKinds, ["not-a-kind"]);
    assert.ok(bogus.granted <= bogus.total);
  });

  it("keeps the product register figure off the per-city footer", () => {
    // The two ratios are different classes measured different ways. Different
    // verbs, and each carries its own rule where it is read.
    assert.match(html, /<b id="nav-sources">Sources not read<\/b>/);
    assert.match(html, /id="nav-sources-rule"/);
    assert.match(html, /<b id="connections-sources">1 of 12 sources connected<\/b>/);
    assert.equal(html.includes('<b id="nav-sources">1 of 12'), false);
    const bake = fs.readFileSync(path.join(root, "scripts", "bake-connections.mjs"), "utf8");
    assert.equal(/\(<b id="nav-sources">\)/.test(bake), false, "bake must not restore the register figure");
    assert.match(bake, /nav-sources must stay per-pack/);
  });
});

describe("G-80 static markup names no city", () => {
  /**
   * The control this card turns on. It fires against origin/main, where
   * web/index.html carries 16 literals naming template-city on every pack.
   */
  it("carries no shipped pack's key or display name in the markup", () => {
    for (const pack of PACKS) {
      assert.equal(html.includes(pack.cityKey), false, pack.cityKey);
      assert.equal(html.includes(pack.displayName), false, pack.displayName);
    }
    assert.equal(html.includes("City of Template"), false);
    assert.equal(html.includes("Template"), false);
    // The state suffix was asserted for a pack that carries no jurisdiction.
    assert.equal(html.includes("· TX"), false);
    // app.js carries no fallback city vocabulary of its own: it reads the
    // fallback back out of the DOM, so there is one implementation of the rule.
    assert.match(app, /function currentPackName/);
    assert.match(app, /querySelector\("\.brandcity \[data-pack-name\]"\)/);
    assert.ok(FALLBACK_VOCABULARY.length >= 2);
    // And app.js names no shipped pack either, not even as a request default.
    for (const pack of PACKS) {
      assert.equal(app.includes(pack.cityKey), false, `app.js names ${pack.cityKey}`);
      assert.equal(app.includes(pack.displayName), false, `app.js names ${pack.displayName}`);
    }
  });

  it("gives every breadcrumb a pack hook rather than a baked name", () => {
    const crumbs = html.match(/<div class="crumb">[\s\S]*?<\/div>/g) || [];
    assert.ok(crumbs.length >= 14, `expected the shipped crumbs, found ${crumbs.length}`);
    for (const crumb of crumbs) {
      assert.match(crumb, /data-pack-name/, crumb.slice(0, 90));
    }
  });

  it("closes the fallback vocabulary the markup is allowed to use", () => {
    const named = [...html.matchAll(/<(?:data|b|span)[^>]*data-pack-name[^>]*>([^<]*)</g)].map((m) => m[1]);
    const keyed = [...html.matchAll(/<span[^>]*data-pack-key[^>]*>([^<]*)</g)].map((m) => m[1]);
    assert.ok(named.length >= 15, `expected pack-name hooks, found ${named.length}`);
    assert.ok(keyed.length >= 7, `expected pack-key hooks, found ${keyed.length}`);
    for (const value of named) {
      assert.equal(value.toLowerCase(), IDENTITY_FALLBACK.displayName.toLowerCase(), value);
    }
    for (const value of keyed) {
      assert.equal(value.toLowerCase(), IDENTITY_FALLBACK.cityKey.toLowerCase(), value);
    }
    assert.equal(IDENTITY_FALLBACK.seal, "");
    assert.match(html, /<span class="seal" id="city-seal"><\/span>/);
    assert.match(html, /<span id="brand-state" hidden style="display:none"><\/span>/);
  });

  it("adds no CSS class and edits no stylesheet to do it", () => {
    const shell = fs.readFileSync(path.join(root, "web", "shell.css"), "utf8");
    const kit = fs.readFileSync(path.join(root, "web", "sc-kit.css"), "utf8");
    const defined = new Set([...(shell + kit).matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]));
    const used = new Set();
    for (const m of html.matchAll(/class="([^"]+)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) used.add(c);
    }
    for (const m of app.matchAll(/classList\.(add|remove|toggle)\("([^"]+)"/g)) used.add(m[2]);
    const KNOWN_UNSTYLED = new Set(["roster-lens"]);
    assert.deepEqual([...used].filter((c) => !defined.has(c) && !KNOWN_UNSTYLED.has(c)), []);
    /**
     * .brandcity span is a real rule (weight 400, ink-3), so the city name
     * cannot be a span without rendering as the quiet state suffix, and <b>
     * computes bolder against weight 600. <data> carries no UA style and needs
     * no class, which is how this stayed inside "no new CSS class".
     */
    assert.match(html, /<data data-pack-name>/);
    assert.match(shell, /\.brandcity span \{ font-weight: 400/);
  });
});

describe("G-80 one writer, and the Neon read path", () => {
  it("does not let the pipeline write the city's identity a second time", () => {
    assert.equal(app.includes("ds-crumb-city"), false, "the pipeline must not write the crumb");
    assert.match(html, /<b id="ds-crumb-city" data-pack-name>/);
    // Divergence test: the two paths that carry displayName must agree.
    for (const pack of PACKS) {
      assert.equal(composePipeline(pack).displayName, cityIdentity(pack).displayName, pack.cityKey);
      assert.equal(composePipeline(pack).cityKey, cityIdentity(pack).cityKey, pack.cityKey);
      assert.equal(composePipeline(pack).environment, cityIdentity(pack).environment, pack.cityKey);
    }
  });

  it("selects every column the identity path reads, so a stored pack round-trips", () => {
    /**
     * The G-79 guard, generalised to this card's consumer. Structural, not a
     * needle list: whatever cityIdentity reads off a pack must be a column the
     * SELECT names, or a Neon deployment silently resolves it to undefined the
     * way generatesFixtures did.
     */
    const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    const read = new Set(
      [...identitySrc.matchAll(/(?<![\w-])pack\??\.([a-zA-Z]+)/g)].map((m) => m[1]),
    );
    assert.ok(read.size >= 5, `expected cityIdentity to read pack properties, found ${read.size}`);
    const selected = new Set(PACK_COLUMNS.split(",").map((c) => c.trim()));
    for (const prop of read) {
      assert.ok(selected.has(snake(prop)), `SELECT omits ${snake(prop)}, which city-identity.mjs reads`);
    }
  });

  it("resolves identity from a Neon row, which no local run without a DSN executes", async () => {
    const envMap = { DATABASE_URL: "postgres://user:pw@ep-x.neon.tech/neondb" };
    const seen = [];
    const query = async (sql) => {
      seen.push(sql);
      if (!/^SELECT/.test(sql.trim())) return { rows: [] };
      return {
        rows: [
          {
            city_key: "stored-city",
            jurisdiction_fips: "48021",
            display_name: "Stored City",
            access_policy: "public-free",
            lenses: ["city-manager"],
            granted_adapters: [
              {
                kind: "municode",
                purpose: "code",
                writesTo: "spine",
                accessPolicy: "tenant-private",
                sourceUrl: "https://library.example.org/codes",
              },
            ],
            notes: "stored row",
            environment: "live",
            generates_fixtures: false,
          },
        ],
      };
    };
    const pack = await getCityPack("stored-city", envMap, { query });
    const identity = cityIdentity(pack);
    assert.equal(identity.displayName, "Stored City");
    assert.equal(identity.seal, "SC");
    assert.equal(identity.stateCode, "TX", "the state must survive the SQL read path");
    assert.equal(identity.environmentBadge, "Live");
    assert.equal(identity.isDemo, false);
    assert.equal(identity.sources.granted, 1);
    assert.equal(identity.sources.label, `1 of ${ADAPTER_KINDS.length} sources granted`);
    assert.ok(seen.some((s) => /^SELECT/.test(s.trim())), "the SQL path must have run");
  });

  it("declares seal initials from the pack's own name", () => {
    assert.equal(sealInitials("Template city"), "TC");
    assert.equal(sealInitials("Empty city"), "EC");
    assert.equal(sealInitials("San Marcos"), "SM");
    assert.equal(sealInitials("Elgin"), "E");
    assert.equal(sealInitials(""), "");
    assert.equal(sealInitials("  "), "");
  });
});
