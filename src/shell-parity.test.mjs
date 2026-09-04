/**
 * ---------------------------------------------------------------------------
 * G-90. SHELL FUNCTION PARITY, MADE MACHINE-CHECKABLE.
 *
 * The operator walked the deployed surface and found the new shell missing
 * functions the live staff dashboard has. The mission is FUNCTION parity, not
 * layout and not look: a staff member must not lose a capability by moving to
 * this product. How each one renders is a design decision inside the visual law.
 *
 * WHY A REGISTER RATHER THAN EIGHT SCATTERED ASSERTIONS. A deferral is a fine
 * outcome and a silent omission is not, and those two are indistinguishable in a
 * test file that simply does not mention a function. So the eight are a TABLE
 * here, every row carries a disposition, and the test walks the table. A ninth
 * function arriving with no row fails; a row losing its evidence fails; a row
 * quietly disappearing fails on the count.
 * ---------------------------------------------------------------------------
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MARKUP_SOURCES,
  readMarkupSources,
  readSource,
  stripJsComments,
  stylesheetClasses,
} from "./served-surface.mjs";
import { cityIdentity } from "./city-identity.mjs";
import { TEMPLATE_CITY } from "./city-pack.mjs";
import { shellCapabilities, shellSession } from "./shell-state.mjs";

const html = readSource("web/index.html");
const app = readSource("web/app.js");
const shell = readSource("web/shell.css");
const theme = readSource("src/theme.mjs");

/**
 * The eight functions the build sheet's parity table names, with what this card
 * did about each and the evidence that says so.
 *
 * `built` means the function is on the served top bar. `stubbed` means it is
 * present and honestly says it does nothing. `wired` means it already worked and
 * was measured rather than rebuilt. Each row's `evidence` is asserted below;
 * each row's `reason` is required on anything that is not `built`, so a
 * disposition can never be downgraded without saying why in the same edit.
 */
const THE_EIGHT = [
  {
    n: 1,
    fn: "Theme toggle, light/dark",
    disposition: "built",
    ids: ["theme-toggle", "theme-toggle-label"],
  },
  {
    n: 2,
    fn: "Account / user menu",
    disposition: "built",
    ids: ["account-btn", "account-pop", "acct-account", "acct-profile", "acct-settings"],
  },
  {
    n: 3,
    fn: "Sign in / sign out / session",
    disposition: "built",
    ids: ["session-label", "session-pill", "session-basis", "acct-signin", "acct-signout"],
    reason:
      "the session STATE is read from the existing tenancy resolver and rendered honestly; the sign-in and sign-out ACTIONS are honest-disabled because this deployment configures no identity provider and the staff auth build is a separate plan row",
  },
  {
    n: 4,
    fn: "Notifications",
    disposition: "built",
    ids: ["notif-btn", "notif-pop", "notif-empty", "notif-basis", "notif-rule"],
  },
  {
    n: 5,
    fn: "Tenant branding",
    disposition: "wired",
    ids: ["city-seal", "env-badge", "brand-state", "nav-sources", "nav-sources-rule"],
    reason:
      "seal, display name, state suffix, environment badge, document title and Compass scope already resolved from the pack through src/city-identity.mjs; measured rather than rebuilt. A per-pack ACCENT is deferred: an accent is a token VALUE, web/sc-kit.css is byte-identical across three repos and a repo that edits a token value has forked the system, and the pack schema is another lane's file",
  },
  {
    n: 6,
    fn: "Record search",
    disposition: "stubbed",
    ids: ["record-search", "record-search-note"],
    reason:
      "there is no record index and the Records search lens is itself not built; the build sheet lists this as an open operator question and making it real would mean inventing an index. Its note is now driven by the same derived capability as everything else, so it stops being a stub the day a backend exists rather than the day somebody remembers",
  },
  {
    n: 7,
    fn: "Help / support",
    disposition: "built",
    ids: ["acct-support", "acct-support-basis"],
    reason:
      "the entry is on the menu and its enabled state is derived; the action is honest-disabled because SHELL_SUPPORT_URL is unset and no support channel is reachable. No invented help content and no fabricated contact",
  },
  {
    n: 8,
    fn: "Feedback",
    disposition: "built",
    ids: ["acct-feedback", "acct-feedback-basis", "feedback-form", "feedback-text", "feedback-send", "feedback-result"],
  },
];

describe("G-90 the eight shell functions, each built or honestly deferred", () => {
  it("carries a row for every one of the eight, and every row carries its evidence", () => {
    assert.equal(THE_EIGHT.length, 8, "the parity table is the denominator");
    assert.deepEqual(
      THE_EIGHT.map((row) => row.n),
      [1, 2, 3, 4, 5, 6, 7, 8],
      "the rows are the build sheet's eight, in its order",
    );
    for (const row of THE_EIGHT) {
      assert.ok(row.ids.length, `${row.fn} claims no evidence`);
      if (row.disposition !== "built") {
        assert.ok(row.reason, `${row.fn} is ${row.disposition} with no stated reason`);
      }
    }
    // Anything not fully built has to say so out loud, which is the difference
    // between a deferral and an omission.
    const notFullyBuilt = THE_EIGHT.filter((row) => row.disposition !== "built").map((row) => row.fn);
    assert.deepEqual(notFullyBuilt, ["Tenant branding", "Record search"]);
  });

  it("serves every id every row claims", () => {
    /**
     * Counting rule: an id counts as served when web/index.html carries
     * id="<value>". This is deliberately the static document rather than the
     * union the class rule scans - a function is present when the browser
     * receives it, and a generator is served to nobody.
     */
    const missing = [];
    for (const row of THE_EIGHT) {
      for (const id of row.ids) {
        if (!html.includes(`id="${id}"`)) missing.push(`${row.fn}: ${id}`);
      }
    }
    assert.deepEqual(missing, []);

    // Proven able to fire, so the empty result above is a determination rather
    // than a scan that matched nothing.
    const stripped = html.replace('id="theme-toggle"', "");
    const after = [];
    for (const row of THE_EIGHT) {
      for (const id of row.ids) if (!stripped.includes(`id="${id}"`)) after.push(id);
    }
    assert.deepEqual(after, ["theme-toggle"]);
  });
});

describe("G-90 the theme control", () => {
  it("splits the reader from the writer, and the head script is the reader", () => {
    /**
     * The whole design in three assertions. The head script resolves and stamps
     * before first paint and never writes; web/app.js writes and never decides
     * what paints on load; src/theme.mjs is the vocabulary neither of them
     * copies by hand. src/first-paint.test.mjs proves the resolution end to end
     * with the late-resolution build watched failing; this proves the split is
     * still the shape of the code.
     */
    const head = html.slice(0, html.indexOf("</head>"));
    assert.ok(head.includes('root.setAttribute("data-theme"'), "the head script must stamp the theme");
    assert.equal(head.includes("localStorage.setItem"), false, "the head script must never write storage");
    assert.match(head, /try \{[\s\S]*?localStorage\.getItem\(THEME_KEY\)[\s\S]*?\} catch/);
    assert.match(app, /window\.localStorage\.setItem\(THEME_STORAGE_KEY, resolved\)/);
    assert.match(app, /import \{[\s\S]*?nextTheme,[\s\S]*?\} from "\/theme\.mjs"/);
    // The toggle reads the ROOT, not storage: the root is what actually
    // resolved, including the case where storage was unreadable.
    assert.match(app, /document\.documentElement\.getAttribute\("data-theme"\)/);
  });

  it("keeps the theme vocabulary out of the markup and the stylesheet", () => {
    /**
     * No web/shell.css rule keys on data-theme, and that is the point rather
     * than an omission: the whole palette lives in web/sc-kit.css as tokens, and
     * shell.css consumes them. Measured: zero colour literals in shell.css, so
     * a theme cannot be half-applied by a rule that forgot to use a token.
     */
    assert.equal(shell.includes("data-theme"), false, "shell.css must not key on the theme");
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(shell), false, "shell.css must declare no colour literal");
    assert.equal(/\brgba?\(|\bhsla?\(/.test(shell), false, "shell.css must declare no colour function");
    /**
     * And the vocabulary itself is declared once, in a module with no DOM and no
     * storage access. Measured on the CODE rather than on the file: src/
     * theme.mjs explains in prose why the head script cannot import it and what
     * the predecessor stored, so a raw substring scan reads that prose as
     * behaviour. That is the exact defect src/served-surface.mjs stripJsComments
     * was added for one layer up, and the first draft of this assertion walked
     * straight into it.
     */
    const themeCode = stripJsComments(theme);
    assert.match(theme, /export const THEMES = \["light", "dark"\]/);
    assert.equal(/\bdocument\b/.test(themeCode), false, "src/theme.mjs must not touch the DOM");
    assert.equal(/localStorage/.test(themeCode), false, "src/theme.mjs must not touch storage");
    assert.ok(/localStorage/.test(theme), "the prose that motivates the module is still there");
  });
});

describe("G-90 honest states on the new chrome", () => {
  it("ships every new entry disabled, because nothing has been read yet", () => {
    /**
     * The static document is the fallback, exactly as it is for the pack
     * identity: a control that has not heard from the server must not look
     * available, and its reason must not be a sentence somebody typed. Both
     * halves are asserted - disabled, and "not read".
     */
    const entries = [
      "acct-account",
      "acct-profile",
      "acct-settings",
      "acct-support",
      "acct-feedback",
      "acct-signin",
      "acct-signout",
    ];
    for (const id of entries) {
      assert.match(html, new RegExp(`id="${id}"[^>]*disabled`), `${id} does not ship disabled`);
    }
    const basisLines = [
      "session-basis",
      "acct-account-basis",
      "acct-support-basis",
      "acct-feedback-basis",
      "acct-signin-basis",
      "acct-signout-basis",
      "notif-basis",
    ];
    for (const id of basisLines) {
      assert.match(html, new RegExp(`id="${id}"[^>]*>Basis: not read<`), `${id} ships a claim instead of "not read"`);
      assert.match(app, new RegExp(`"${id}"`), `${id} is never written, so it can only ever say "not read"`);
    }
    // Every one of those lines is a .basis, so the empty-region rule holds on
    // the new chrome as it does everywhere else.
    for (const id of basisLines) {
      assert.match(html, new RegExp(`class="basis" id="${id}"`), id);
    }
  });

  it("shows no notification count, and counts only what it holds", () => {
    /**
     * THE RULE, stated precisely because "no count" is too blunt to be true:
     * the surface may count a list it is holding; it may never render a number
     * the server asserted. So there is no badge on the bell, no count id in the
     * markup, and the one place a number could appear reads items.length of an
     * array that came back from the resolver.
     *
     * src/shell-state.test.mjs holds the other half - the server sends no count
     * field at any depth - so the number cannot arrive in the first place.
     */
    assert.equal(/id="notif-[a-z-]*count/.test(html), false);
    assert.equal(/id="notif-[a-z-]*badge/.test(html), false);
    assert.match(app, /const items = Array\.isArray\(notifications\.items\) \? notifications\.items : \[\]/);
    assert.match(app, /items\.length === 0 \? "No notifications\." : `\$\{items\.length\} notifications\.`/);
    assert.equal(app.includes("notifications.count"), false);
    assert.equal(app.includes("notifications.unread"), false);
    // The bell itself carries no text node at all, so nothing can be painted
    // onto it without an edit that shows up in this assertion.
    const bell = html.match(/<button[^>]*id="notif-btn"[\s\S]*?<\/button>/)[0];
    assert.equal(/>[^<>\s][^<>]*</.test(bell.replace(/<svg[\s\S]*?<\/svg>/, "")), false, bell);
  });

  it("invents no freshness on any new control", () => {
    // The standing rule. Applied to the whole served surface, not just the new
    // markup, so this stays a product-wide statement rather than a card-local one.
    const sources = readMarkupSources();
    for (const [name, text] of Object.entries(sources)) {
      assert.equal(/last sync|last read|last updated/i.test(text), false, name);
    }
    assert.deepEqual(Object.keys(sources).sort(), MARKUP_SOURCES);
  });

  it("never thanks a person for something it did not deliver", () => {
    /**
     * The feedback loop's whole integrity in one assertion. web/app.js renders
     * the server's basis verbatim and clears the box ONLY when the server said
     * accepted. A thank-you written on the client would be a claim the client
     * cannot make.
     */
    assert.match(app, /result\.textContent = `Basis: \$\{answer\.basis \|\| "the server gave no basis"\}`/);
    assert.match(app, /if \(answer\.accepted === true\) text\.value = ""/);
    assert.equal(/thank you|thanks|we got it|received!/i.test(app), false);
    assert.equal(/thank you|thanks|we got it/i.test(html), false);
  });
});

describe("G-90 tenant branding, measured rather than rebuilt", () => {
  it("accounts for every field the identity resolver returns", () => {
    /**
     * "Wire what is missing" needs a measurement, not an opinion. Every top-level
     * field cityIdentity() returns is either consumed by the chrome or named
     * here as deliberately unconsumed with its reason. A field added to the
     * resolver and never rendered lands in neither list and fails.
     *
     * Counting rule: a field counts as consumed when the COMMENT-STRIPPED
     * web/app.js references `identity.<field>` followed by a word boundary.
     *
     * Both qualifiers were bought by a failure. Without the comment strip,
     * `stateBasis` read as consumed because app.js explains in prose why it is
     * NOT rendered. Without the word boundary, `environment` read as consumed
     * because `identity.environmentBadge` contains it. A substring is not a
     * reference, and prose is not behaviour.
     */
    const identity = cityIdentity(TEMPLATE_CITY);
    const appCode = stripJsComments(app);
    const keys = Object.keys(identity).sort();
    const consumed = keys.filter((key) => new RegExp(`identity\\.${key}\\b`).test(appCode));
    const unconsumed = keys.filter((key) => !consumed.includes(key));
    assert.deepEqual(consumed.sort(), [
      "cityKey",
      "displayName",
      "documentTitle",
      "environmentBadge",
      "isDemo",
      "seal",
      "sources",
      "stateCode",
    ]);
    /**
     * The four the chrome deliberately does not render, each with its reason:
     * accessPolicy and environment are policy inputs that reach the screen only
     * through environmentBadge and isDemo, which the labelling gate routes
     * through one resolver on purpose; generatesFixtures drives the per-lens
     * marks rather than the chrome; and stateBasis explains an ABSENT state
     * suffix, so rendering it beside the city name would put an explanation
     * where there is nothing to explain.
     */
    assert.deepEqual(unconsumed, ["accessPolicy", "environment", "generatesFixtures", "stateBasis"]);
  });

  it("carries no per-pack accent, and no path by which one could arrive", () => {
    /**
     * The deferral, measured. There is no accent field on the identity, and the
     * chrome sets no CSS custom property from any source - so a per-pack colour
     * cannot arrive without an edit that fails this. That matters more than the
     * absence itself: a token value set at runtime is a fork of the kit that
     * leaves web/sc-kit.css byte-identical and passes every file comparison.
     */
    const identity = cityIdentity(TEMPLATE_CITY);
    assert.equal("accent" in identity, false);
    assert.equal(/setProperty\(\s*["']--/.test(app), false, "the chrome must not set a token at runtime");
    assert.equal(/style\.setProperty/.test(app), false);
  });
});

describe("G-90 class discipline for the new chrome", () => {
  it("adds exactly the four class names a dropdown needs, and defines every one", () => {
    /**
     * Counting rule for the vocabulary: the served stylesheets, CRLF-normalized,
     * CSS comments stripped, every "." followed by an identifier, deduplicated -
     * the rule in src/served-surface.mjs stylesheetClasses(), which is the same
     * rule the class gate uses. Measured 139 before this card and 143 after.
     *
     * The four are the smallest set a positioned menu needs: an anchor to
     * position against, the panel, a group inside it, and a row. Everything else
     * on the new chrome composes classes this stylesheet already had - .panel,
     * .panel-head, .panel-body, .basis, .btn, .pill, .inp, .actionbar, .t-caption.
     */
    const defined = stylesheetClasses();
    /**
     * G-117 added web/property-map.css (18 classes, its own self-contained
     * stylesheet for the native property map page -- see served-surface.mjs's
     * STYLESHEET_SOURCES, now including that file) on top of the 143 this
     * test already measured, hence 161 rather than 143. That file's classes
     * are unrelated to this dropdown card; naming the new total here (rather
     * than loosening this assertion) keeps this test proving what it always
     * proved -- the vocabulary moved by exactly the four named below, not by
     * some other, unreviewed amount -- against the new baseline.
     *
     * G-117 follow-up added 7 more to that same file (pm-layers,
     * pm-layers-title, pm-layers-list, pm-layers-item, pm-layers-label,
     * pm-layers-swatch, pm-layers-status) for the property map's four GIS
     * overlay-layer toggles, hence 168 rather than 161 -- again unrelated to
     * this dropdown card, named here for the same reason as above.
     *
     * G-117 full-parity follow-up replaced those four flat checkboxes with a
     * categorized, searchable 52-layer panel (src/property-map-catalog.mjs +
     * web/property-map.js's buildLayersPanel/buildTemplatesPanel) and added
     * 14 more classes to that same self-contained stylesheet (pm-layers-head,
     * pm-layers-count, pm-layers-search, pm-layers-templates,
     * pm-layers-template, pm-layers-categories, pm-layers-category,
     * pm-layers-category-head, pm-layers-category-toggle,
     * pm-layers-category-count, pm-layers-link, pm-layers-name,
     * pm-layers-zoomwarn, pm-layers-row-dim), hence 182 rather than 168 --
     * again unrelated to this dropdown card, named here for the same reason
     * as above.
     */
    assert.equal(defined.size, 182, "the defined class vocabulary moved by something other than the four");
    for (const cls of ["topmenu", "pop", "pop-group", "pop-item"]) {
      assert.ok(defined.has(cls), `${cls} is used but no served stylesheet defines it`);
      assert.ok(html.includes(cls), `${cls} is defined but nothing uses it`);
    }
    // And the kit is not where they landed. A repo that edits a token value has
    // forked the system; a repo that adds a class to the kit has done the same.
    const kit = readSource("web/sc-kit.css");
    for (const cls of ["topmenu", "pop", "pop-group", "pop-item"]) {
      assert.equal(kit.includes(`.${cls}`), false, `${cls} was added to the kit`);
    }
  });

  it("leaves the type floor to the gate that already owns it, and lands inside its population", () => {
    /**
     * A FINDING FROM WRITING THIS FILE, and the reason this test is a coverage
     * check rather than a floor check.
     *
     * The first draft computed the 12px floor here, over the same file. It went
     * red - correctly - on the two 10px declarations that are the type law's ONE
     * NAMED EXCEPTION, the evidence chip label, carved into src/
     * type-conformance.test.mjs by name at G-76 after a card falsified the
     * gate's original absolute form. A second, weaker copy of the floor rule
     * would have been the CTRL-1 shape this repo has already paid for: one rule,
     * two implementations, and the newer one ignorant of the older one's
     * exception set (DEV_PROCESS 2.4).
     *
     * So the floor and the no-token rule stay where they are, and what is
     * asserted here is that the new chrome is INSIDE that gate's population -
     * which is the only thing this card actually needs to establish.
     */
    const typeGate = readSource("src/type-conformance.test.mjs");
    assert.match(typeGate, /export const FLOOR_PX = 12/, "the floor gate no longer pins 12");
    assert.match(
      typeGate,
      /export const CHIP_LABEL_SELECTORS = \[".atomchip", ".atomchip .did"\]/,
      "the named exception set changed; a second copy of the floor rule would not have known",
    );
    assert.match(typeGate, /shell\.css/, "the floor gate no longer reads the file this chrome lives in");
    assert.match(typeGate, /declares no color and no token of its own/, "the no-token rule left its home");

    // And the new rules are in that file, so they are inside its scan by
    // construction rather than by anyone remembering to add them.
    for (const selector of [".topmenu", ".pop", ".pop-group", ".pop-item"]) {
      assert.ok(shell.includes(`${selector} `) || shell.includes(`${selector},`) || shell.includes(`${selector}[`) || shell.includes(`${selector}:`) || shell.includes(`${selector}\n`), selector);
    }
    // The one thing the floor gate cannot see: that the new rules resolve their
    // colours through the kit rather than declaring any. Asserted on the new
    // block alone, so this is not a second copy of the file-wide rule.
    const newBlock = shell.slice(shell.indexOf("/* ---------- top-bar menus"));
    assert.ok(newBlock.length > 500, "the new block was not found");
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(newBlock), false);
    assert.equal(/--sc-[\w-]+\s*:/.test(newBlock), false, "the new block declares a token");
    assert.ok(newBlock.includes("var(--sc-"), "the new block uses kit tokens");
  });
});

describe("G-90 anonymous stays the default path", () => {
  it("strands nothing an anonymous visitor did", () => {
    /**
     * The standing trap: an auth flip that orphans anonymous data is a known
     * defect class in this program. Measured rather than promised.
     *
     * Nothing this card added stores per-visitor state on the server - the one
     * POST forwards and keeps nothing - and the theme preference is
     * device-scoped and survives a future sign-in untouched. So there is no
     * anonymous WORK for a sign-in to strand.
     *
     * G-116 adds a second key, deliberately, and it does not weaken this
     * guard: HAUSKA_KEY_STORAGE holds a credential a caller explicitly
     * brought via ?hauskaKey=..., never something an anonymous visitor
     * produced by using the product. shellSession's own basis text (this
     * file, "a Hauska product key resolved to a city pack tenant") already
     * describes exactly this mechanism; this is the bootstrap that lets a
     * browser actually present the key shellSession was written to expect.
     * An anonymous visitor's localStorage still holds nothing this key
     * would touch.
     */
    assert.equal(app.includes("sessionStorage"), false, "no per-visitor client session state");
    const localStorageKeys = [...app.matchAll(/localStorage\.(?:get|set|remove)Item\(([^,)]+)/g)].map((m) =>
      m[1].trim(),
    );
    assert.deepEqual(
      [...new Set(localStorageKeys)].sort(),
      ["HAUSKA_KEY_STORAGE", "THEME_STORAGE_KEY"],
      "only the theme and an explicitly-presented Hauska key are ever stored on the device",
    );
    // The capability resolver's anonymous answer is the DEFAULT rather than a
    // degraded one: every control renders, states its reason, and the surface
    // works without a credential.
    const caps = shellCapabilities({ session: shellSession(null), env: {} });
    for (const [id, cap] of Object.entries(caps)) {
      assert.equal(cap.available, false, id);
      assert.ok(cap.basis, id);
    }
    assert.equal(shellSession(null).kind, "anonymous");
  });
});
