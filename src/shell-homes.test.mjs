import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";
import {
  ALL_HOME_ROWS,
  DISPOSITIONS,
  SHELL_HOMES,
  SHELL_HOMES_ADDENDA,
  SHELL_HOMES_COUNTING_RULE,
  bakeConnectionsInto,
  connectionsRegisterHtml,
  sourcesConnected,
  sourcesConnectedLabel,
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
    assert.equal(baked.length, ALL_HOME_ROWS.length);
    assert.match(html, /id="work-connections"/);
    assert.match(html, /67 of 67/);
    assert.match(html, /Homes-table row/);
    assert.equal(html.includes("last synced"), false);
    assert.equal(html.includes("Last sync"), false);
    assert.equal(/\d{4}-\d{2}-\d{2}T\d{2}:/.test(html), false);
    for (const row of ALL_HOME_ROWS) {
      assert.equal(html.includes(row.job), true, row.job);
    }
    const generated = connectionsRegisterHtml();
    assert.equal((generated.match(/data-home-row="/g) || []).length, ALL_HOME_ROWS.length);
  });

  it("keeps forbidden product strings out of the register surface", () => {
    const surface = html + connectionsRegisterHtml();
    for (const s of FORBIDDEN_PRODUCT_STRINGS) {
      assert.equal(surface.includes(s), false, s);
    }
  });
});

describe("G-75 register vocabulary", () => {
  it("closes the disposition vocabulary at six values", () => {
    assert.deepEqual(DISPOSITIONS, [
      "Mounted",
      "Empty",
      "Not built",
      "Island",
      "Killed",
      "Not connected",
    ]);
    for (const row of ALL_HOME_ROWS) {
      assert.ok(DISPOSITIONS.includes(row.disposition), `${row.job}: ${row.disposition}`);
    }
    const rendered = html.match(/data-disposition="([^"]+)"/g) || [];
    const values = new Set(rendered.map((m) => m.slice('data-disposition="'.length, -1)));
    for (const value of values) assert.ok(DISPOSITIONS.includes(value), value);
    // The four retired values are gone from the register. "Chrome only" still
    // exists elsewhere as a Compass state pill, which is a state, not a home.
    const register = html.match(/id="connections-register"[\s\S]*?<\/section>/)?.[0] || "";
    assert.ok(register.length > 1000);
    for (const retired of ["Mounted / Empty", "Mounted chrome", "Home exists", "Chrome only"]) {
      assert.equal(register.includes(`>${retired}<`), false, retired);
    }
  });

  it("never prints a home as none on the page that claims nothing is homeless", () => {
    for (const row of ALL_HOME_ROWS) {
      assert.notEqual(row.home.trim().toLowerCase(), "none", row.job);
      assert.ok(row.home.trim().length > 3, row.job);
    }
    assert.equal(html.includes("<span>none</span>"), false);
  });

  it("keeps the iframe-residual qualifier on the Plan review rows", () => {
    const review = ALL_HOME_ROWS.filter((r) => /Reviewer queue|AI Plan Review/.test(r.job));
    assert.equal(review.length, 2);
    for (const row of review) assert.match(row.home, /iframe residual/);
  });

  it("does not mark a killed tile grid as mounted", () => {
    const tiles = ALL_HOME_ROWS.filter((r) => /twelve/i.test(r.job));
    assert.equal(tiles.length, 0);
    const citizen = ALL_HOME_ROWS.find((r) => r.job === "Citizen service requests");
    assert.ok(citizen);
    assert.match(citizen.home, /tile grid was dropped/);
  });

  it("names a home for every job the layout inventory left homeless", () => {
    assert.equal(SHELL_HOMES.length, 67);
    assert.equal(SHELL_HOMES_ADDENDA.length, 3);
    const jobs = SHELL_HOMES_ADDENDA.map((r) => r.job);
    assert.ok(jobs.some((j) => /Print \/ PDF export/.test(j)));
    assert.ok(jobs.some((j) => /Feedback/.test(j)));
    assert.ok(jobs.some((j) => /Municipal court/.test(j)));
    const court = SHELL_HOMES_ADDENDA.find((r) => /Municipal court/.test(r.job));
    assert.match(court.home, /Connections only/);
  });

  it("derives the source count from the register instead of hardcoding it", () => {
    const { connected, total, rule } = sourcesConnected();
    assert.equal(total, SHELL_HOMES.filter((r) => r.table === "feeds").length);
    assert.equal(connected, SHELL_HOMES.filter((r) => r.table === "feeds" && r.disposition === "Mounted").length);
    assert.match(rule, /feeds table/);
    const label = sourcesConnectedLabel();
    assert.match(html, new RegExp(`<b id="connections-sources">${label}</b>`));
    /**
     * G-80. The register figure is product-wide: its numerator counts Esri as
     * Mounted through the SmartSite embed, which is granted on no pack. Beside
     * a city name in the nav footer that was a figure without its denominator,
     * so the footer now carries a per-pack figure resolved at runtime and this
     * one stays on Connections, with its counting rule at the point of use.
     */
    assert.equal(html.includes(`<b id="nav-sources">${label}</b>`), false);
    assert.match(html, /<b id="connections-sources">[^<]*<\/b> <span class="sep">\|<\/span> feeds table of this register/);
    assert.equal(html.includes("0 of 4 sources read"), false);
    assert.equal(html.includes("0 of 4 read"), false);
    assert.equal(html.includes("7 integrations"), false);
  });
});

describe("G-88 the bake is fresh", () => {
  it("leaves web/index.html unchanged when the bake is run again", () => {
    /**
     * BAKE FRESHNESS, and nothing in this repo asserted it until now.
     *
     * src/shell-homes.mjs generates the connections register as a server
     * template and it reaches the browser only through
     * scripts/bake-connections.mjs. That script's output was never byte-asserted,
     * so a class, an id or an attribute changed on either side and not re-baked
     * shipped stale and passed every test - in EITHER direction, a stale document
     * against a fresh generator or a fresh document against a stale generator.
     * The translation-boundary investigation recorded the hole; this closes it.
     *
     * Stated as a FIXED POINT rather than as a region comparison: baking the
     * shipped document again must change nothing. That form needs no second copy
     * of the region boundaries, so there is one implementation of the bake and
     * nothing to diverge (DEV_PROCESS 2.4). It covers the register rows and the
     * connections-sources label together, because both are what the bake writes.
     *
     * CRLF-normalized on both sides. The bake's region sentinels are literal
     * newlines, so a raw comparison would fail on a Windows checkout while CI
     * stayed green, which is a disagreement this repo has paid for before.
     */
    const lf = (text) => text.replace(/\r\n/g, "\n");
    const shipped = lf(fs.readFileSync(path.join(root, "web", "index.html"), "utf8"));
    assert.equal(bakeConnectionsInto(shipped), shipped, "web/index.html is a stale bake; run scripts/bake-connections.mjs");

    /**
     * And the fixed point is not trivially true. Proven by injection, in this
     * same run: a document whose register has drifted must NOT be a fixed point,
     * or this assertion would pass on anything.
     */
    const drifted = shipped.replace('data-home-row="1"', 'data-home-row="999"');
    assert.notEqual(drifted, shipped, "the probe must actually change the document");
    assert.notEqual(bakeConnectionsInto(drifted), drifted, "a drifted register must not read as fresh");
    assert.equal(bakeConnectionsInto(drifted), shipped, "re-baking a drifted document restores it");

    // The label leg of the bake, which is a separate write and needs its own probe.
    const stale = shipped.replace(
      /<b id="connections-sources">[^<]*<\/b>/,
      '<b id="connections-sources">stale figure</b>',
    );
    assert.notEqual(stale, shipped);
    assert.equal(bakeConnectionsInto(stale), shipped, "a stale sources label must not read as fresh");
  });
});
