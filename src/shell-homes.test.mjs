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
  SPLIT_SOURCE_ROWS,
  addendaLabel,
  addendaRule,
  bakeConnectionsInto,
  connectionsRegisterHtml,
  countingRuleCaption,
  homeRowsLabel,
  homeRowsRule,
  sourceRowCount,
  sourcesConnected,
  sourcesConnectedLabel,
  tableCounts,
} from "./shell-homes.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");

describe("G-73 shell homes register", () => {
  it("counts 70 register rows against 67 source rows, both measured", () => {
    /**
     * G-93 MOVED THIS GATE, and it moved because the counting rule moved.
     *
     * Two figures now, and NEITHER is the other minus something (DEV_PROCESS
     * 1.3). Register rows are counted by counting rows; source rows are counted
     * as the distinct values of (splitFrom ?? job), which is a measurement of
     * the same population under a different key rather than a subtraction of
     * the splits. The per-table breakdown is asserted on BOTH so a future split
     * cannot hide inside a total that still happens to add up.
     */
    assert.equal(SHELL_HOMES.length, 70, "register rows");
    assert.equal(sourceRowCount(SHELL_HOMES), 67, "Homes-table source rows");
    assert.match(SHELL_HOMES_COUNTING_RULE, /67/);
    assert.match(SHELL_HOMES_COUNTING_RULE, /splitFrom/);

    const byTable = new Map(tableCounts(SHELL_HOMES).map((t) => [t.table, t]));
    assert.deepEqual(
      [...byTable.values()].map((t) => [t.table, t.sourceRows, t.rows]),
      [
        ["primary", 31, 31],
        ["review-product", 7, 7],
        ["products", 6, 6],
        ["feeds", 12, 12],
        ["other", 11, 14],
      ],
      "the source breakdown is the G-18 file's; only `other` renders more rows than it has source rows",
    );
    // The two totals reconcile, and the reconciliation is asserted rather than assumed.
    assert.equal([...byTable.values()].reduce((n, t) => n + t.rows, 0), SHELL_HOMES.length);
    assert.equal([...byTable.values()].reduce((n, t) => n + t.sourceRows, 0), sourceRowCount(SHELL_HOMES));

    for (const row of SHELL_HOMES) {
      assert.ok(row.job);
      assert.ok(row.home);
      assert.ok(row.disposition);
    }
  });

  it("splits only rows that were genuinely bundled, and says which", () => {
    /**
     * TESTED FOR ITS ABILITY TO FIRE (DEV_PROCESS 2.2). `splitFrom` is a new
     * field and nothing structural forces a future split to carry it, so the
     * failure modes are asserted directly: a splitFrom naming a row that is
     * itself in the register, a splitFrom with only one member (a rename
     * wearing a split's clothes), and a split group whose dispositions are all
     * identical (which would mean the bundle never needed splitting).
     */
    const jobs = new Set(ALL_HOME_ROWS.map((r) => r.job));
    const groups = new Map();
    for (const row of ALL_HOME_ROWS) {
      if (!row.splitFrom) continue;
      assert.equal(jobs.has(row.splitFrom), false, `${row.splitFrom} is both a source row and a register row`);
      groups.set(row.splitFrom, [...(groups.get(row.splitFrom) || []), row]);
    }
    assert.deepEqual([...groups.keys()].sort(), [...SPLIT_SOURCE_ROWS].sort());
    for (const [source, rows] of groups) {
      assert.ok(rows.length > 1, `${source} was "split" into one row, which is a rename`);
      assert.ok(
        new Set(rows.map((r) => r.disposition)).size > 1,
        `${source} split into rows that all carry one disposition, so the bundle never needed splitting`,
      );
    }

    // The two bundles the operator ruled on, and what each job now says.
    const auth = groups.get("Auth / session / notifications / theme / sign out");
    assert.deepEqual(
      auth.map((r) => [r.job, r.disposition]),
      [
        ["Auth and session actions", "Not built"],
        ["Notifications", "Empty"],
        ["Theme, light and dark", "Mounted"],
        ["Sign out", "Not built"],
      ],
    );
    const feedback = groups.get("Feedback with screenshot and category");
    assert.deepEqual(
      feedback.map((r) => [r.job, r.disposition]),
      [
        ["Feedback", "Mounted"],
        ["Feedback screenshot attachment", "Not built"],
        ["Feedback category", "Not built"],
      ],
    );

    /**
     * The home text on every split row states a STRUCTURAL fact, never a
     * deployment fact. "SHELL_IDENTITY_PROVIDER is unset" would be true the day
     * it was typed and silently false the day a variable is set, which is the
     * stale-claim shape G-90's own capability resolver exists to avoid.
     */
    for (const row of ALL_HOME_ROWS) {
      assert.equal(/is unset|unconfigured|not configured|503/.test(row.home), false, row.job);
    }
  });

  it("bakes every register row into Connections HTML with no invented sync times", () => {
    const baked = html.match(/data-home-row="/g) || [];
    assert.equal(baked.length, ALL_HOME_ROWS.length);
    assert.match(html, /id="work-connections"/);
    /**
     * G-93. The panel-head figures and the counting-rule caption are BAKED from
     * the generator now, so they are asserted against the computed values rather
     * than against a literal. They were hand-typed "67 of 67", "3" and a prose
     * restatement of the rule while the rule lived in src/shell-homes.mjs -
     * three copies of one number on the page whose whole job is to be countable,
     * and the split that changed the row count is exactly the edit that would
     * have left all three stale.
     */
    assert.ok(html.includes(`<b id="connections-rows">${homeRowsLabel()}</b>`), homeRowsLabel());
    assert.ok(html.includes(`<span id="connections-rows-rule">${homeRowsRule()}</span>`), homeRowsRule());
    assert.ok(html.includes(`<b id="connections-addenda">${addendaLabel()}</b>`), addendaLabel());
    assert.ok(html.includes(`<span id="connections-addenda-rule">${addendaRule()}</span>`), addendaRule());
    assert.ok(html.includes(countingRuleCaption()), "the counting-rule caption is a stale bake");
    // Both measured figures reach the page, and the source figure did not move.
    assert.match(html, /70 of 70/);
    assert.match(html, /from 67 Homes-table rows/);
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
    assert.equal(SHELL_HOMES.length, 70);
    assert.equal(sourceRowCount(SHELL_HOMES), 67);
    assert.equal(SHELL_HOMES_ADDENDA.length, 5);
    assert.equal(sourceRowCount(SHELL_HOMES_ADDENDA), 3);
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
