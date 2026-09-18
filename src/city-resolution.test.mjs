/**
 * G-161. THE CLIENT'S CITY, PROVEN BY VIOLATION IN BOTH DIRECTIONS.
 *
 * WHAT THIS FILE MEASURES, and what it deliberately does not. It reads the two
 * shipped web files as SOURCE and checks the shape of the client's city
 * resolution: that no default survives it, that a resolved city is taken from an
 * explicit choice and then from the caller's own resolved tenant, that every
 * loader sits inside the branch that has a city, and that the no-city branch is
 * a stated panel rather than a silent empty surface.
 *
 * It is NOT a rendered check and does not pretend to be one. The rendered proof
 * is two live browser measurements against the deployed app, one before the
 * deploy and one after, filed as _inbox/2026-09-18_g161-bare-visit-pre-fix.json
 * and its post-fix counterpart. A source-shape test cannot see a resolution that
 * throws at runtime, and the live legs cannot be re-run once the deployment has
 * moved - so the two are cited together and neither is asked to cover the other.
 *
 * EXCLUSION SET (DEV_PROCESS 2.1, stated where the output is read): web/shell.css,
 * web/sc-kit.css and everything under src/ other than the two files below are out
 * of scope. The visibility mechanism the no-city panel uses is [hidden], and
 * src/first-paint.test.mjs already owns "what paints at first paint"; this file
 * asserts only that the panel SHIPS hidden so that instrument's world is
 * unchanged.
 *
 * AND IT IS WATCHED FAILING. Each check below is run again against a mutated copy
 * of the source - the tenant leg deleted, one loader lifted out of the branch,
 * the panel's hidden attribute dropped, a shipped pack key typed into the panel -
 * and each mutation must come back named. A clean arm and an injected arm in the
 * same test is what keeps an unrun check and a passing check from looking alike.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8").split(CR + LF).join(LF);

const APP = read("web/app.js");
const HTML = read("web/index.html");

/**
 * Every boot call that takes the resolved city, exactly as the shipped chain
 * writes it. Counted EXACTLY ONCE each, and asserted to occur inside the guard
 * below - so moving one out of the branch, deleting one, or adding a second call
 * site somewhere else is a named failure rather than a smaller denominator.
 */
const BOOT_CALLS = [
  "loadShellState(staffMap.cityKey);",
  "loadFinanceLens(staffMap.cityKey);",
  "loadIdentity(staffMap.cityKey);",
  "composeGoldMap(staffMap.parcelNodeId, staffMap.cityKey);",
  "loadPipeline(staffMap.cityKey);",
  "loadDevelopmentServices(staffMap.cityKey);",
  "loadPropertyDock(staffMap.cityKey);",
  "loadFleetLens(staffMap.cityKey);",
  "loadPublicWorksLens(staffMap.cityKey);",
  "loadPoliceLens(staffMap.cityKey);",
  "loadFireEmsLens(staffMap.cityKey);",
];

const TENANT_LEG = "staffMap.cityKey = staffMap.cityKey || (await callerTenantCityKey());";
const GUARD = "if (staffMap.cityKey) {";

/**
 * The block starting at `start` (an index pointing at a statement whose body is
 * braced), by brace matching rather than by the next `}`, because the body
 * contains object literals and nested blocks and a naive scan would end the
 * region at the first one of those.
 */
function balancedBlockAt(source, start) {
  const open = source.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Every `if (staffMap.cityKey) {` in the file, each with its brace-matched block
 * and whether its else branch calls showNoCityState(). The BOOT guard is the one
 * that does; the nav-threading guard above it is the other cursor occurrence, and
 * taking the first one would have checked the wrong block while looking
 * identical. Returns the counts so the caller can name which way it failed.
 */
function cityGuards(app) {
  const found = [];
  for (let from = 0; ; ) {
    const at = app.indexOf(GUARD, from);
    if (at < 0) break;
    from = at + GUARD.length;
    const block = balancedBlockAt(app, at);
    if (!block) continue;
    found.push({
      at,
      block,
      callsNoCityState: /^\s*else\s*\{\s*showNoCityState\(\);/.test(app.slice(at + block.length)),
    });
  }
  return { all: found, boot: found.filter((g) => g.callsNoCityState) };
}

/** The body of the last `function <name>(...)` in the source, by brace matching. */
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return null;
  return balancedBlockAt(source, start);
}

const count = (haystack, needle) => haystack.split(needle).length - 1;

/**
 * THE INSTRUMENT. Returns a list of defects; empty means the client resolves a
 * city the way the lane says it does.
 */
export function clientResolutionDefects({ app, html }) {
  const out = [];

  /**
   * 1. The deleted default must be gone from the shipped client, as CODE. Prose
   * is exempt and has to be: this lane's own comments quote the deleted line to
   * say what went, and a check that forbade the WORD would forbid explaining the
   * change. So the token is looked for on non-comment lines only, and the
   * convention that makes that exact is this repo's own (every comment line
   * starts with `*`, `//` or `/*`).
   */
  const uncommented = app
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join("\n");
  if (uncommented.includes("DEFAULT_CITY_KEY")) {
    out.push("web/app.js still references DEFAULT_CITY_KEY in code, the client default this lane deleted");
  }
  if (!app.includes('import { resolveStaffMapQuery } from "/staff-map.mjs"')) {
    out.push("web/app.js must take step 1 from resolveStaffMapQuery, and no longer imports it alone");
  }

  /**
   * 2. The three legs, in the order the dispatch states, and the order is
   * checked rather than the presence of three unrelated strings: a build that
   * asked the tenant FIRST would let a keyed caller's city override an explicit
   * ?cityKey in the address, which is a different product.
   */
  const explicit = app.indexOf("resolveStaffMapQuery(window.location.search)");
  const tenant = app.indexOf(TENANT_LEG);
  const guard = app.indexOf(GUARD);
  if (explicit < 0) out.push("web/app.js does not resolve the explicit ?cityKey through resolveStaffMapQuery");
  if (tenant < 0) out.push(`web/app.js has no caller-tenant leg: expected exactly \`${TENANT_LEG}\``);
  if (guard < 0) out.push(`web/app.js has no boot guard: expected exactly \`${GUARD}\``);
  if (explicit >= 0 && tenant >= 0 && explicit > tenant) {
    out.push("the explicit ?cityKey must be resolved BEFORE the caller's tenant, or a keyed caller overrides the address");
  }
  if (tenant >= 0 && guard >= 0 && tenant > guard) {
    out.push("the caller's tenant must be resolved BEFORE the boot guard reads staffMap.cityKey");
  }

  /** 3. The tenant leg is one fetch of the one route that may be called unnamed. */
  const tenantBody = functionBody(app, "callerTenantCityKey");
  if (!tenantBody) {
    out.push("web/app.js has no callerTenantCityKey(), so the tenant leg cannot be doing what the comment says");
  } else {
    if (!tenantBody.includes('fetch("/api/city-packs")')) {
      out.push("callerTenantCityKey() must read GET /api/city-packs, the enumeration the client may call without naming a city");
    }
    if (!/if \(!res\.ok\) return "";/.test(tenantBody)) {
      out.push('callerTenantCityKey() must return "" on a non-OK response, so a 401 refuses rather than throws');
    }
    if (!tenantBody.includes("body.caller.tenant")) {
      out.push("callerTenantCityKey() must read the caller's own resolved tenant out of the response");
    }
  }

  /** 4. Every city-taking boot call sits in the branch that HAS a city. */
  const guards = cityGuards(app);
  const branch = guards.boot.length === 1 ? guards.boot[0].block : null;
  if (!branch) {
    out.push(
      guards.all.length === 0
        ? `web/app.js has no \`${GUARD}\` at all, so every loader below runs with whatever the resolution returned`
        : guards.boot.length === 0
          ? `no \`${GUARD}\` in web/app.js has an else branch calling showNoCityState(), so a no-city visit would render nothing at all`
          : `${guards.boot.length} boot guards call showNoCityState(); which one boots the surface is ambiguous`,
    );
  } else {
    for (const call of BOOT_CALLS) {
      const total = count(app, call);
      if (total !== 1) {
        out.push(`${call} occurs ${total} times in web/app.js; exactly one boot call site is expected`);
        continue;
      }
      if (!branch.includes(call)) {
        out.push(`${call} is NOT inside the \`${GUARD}\` branch, so a no-city visit would still send it an empty cityKey and take the 400`);
      }
    }
  }

  /**
   * 5. The other half of the branch: a stated no-city panel, not a blank page.
   * The else branch itself is identified in step 4 (that is what makes the boot
   * guard the boot guard), so only the function it calls is measured here.
   */
  const noCityBody = functionBody(app, "showNoCityState");
  if (!noCityBody) {
    out.push("web/app.js has no showNoCityState()");
  } else {
    if (!noCityBody.includes('querySelectorAll(".lens")')) {
      out.push("showNoCityState() must hide the lens surfaces, or a no-city visit renders a surface with no city in it");
    }
    if (!noCityBody.includes('getElementById("no-city-state")')) {
      out.push('showNoCityState() must reveal #no-city-state, the panel web/index.html ships hidden');
    }
  }

  /** 6. The panel itself: shipped hidden, not a lens, and naming no city. */
  const panel = /<div id="no-city-state"[^>]*>([\s\S]*?)<\/div>\s*<section class="lens on" id="lens-city-manager">/.exec(html);
  const tag = /<div id="no-city-state"[^>]*>/.exec(html);
  if (!tag) {
    out.push("web/index.html ships no #no-city-state panel, so showNoCityState() has nothing to reveal");
  } else {
    if (!/\shidden(\s|>)/.test(tag[0])) {
      out.push("the #no-city-state panel must ship with the hidden attribute, or it paints over the lens surfaces at first paint");
    }
    if (/class="[^"]*\blens\b/.test(tag[0])) {
      out.push("the #no-city-state panel must NOT carry class=\"lens\": it is not a city surface and the 15-surface enumeration is asserted elsewhere");
    }
    const body = panel ? panel[1] : "";
    for (const key of ["template-city", "bastrop_tx", "fixture-city"]) {
      if (body.includes(key)) {
        out.push(`the no-city panel names the shipped pack ${key}; the panel exists because no city was named, so any key in it is the invention this lane deletes`);
      }
    }
  }

  return out;
}

describe("G-161 client city resolution", () => {
  it("resolves a city, or states that it has none, and the shipped files are clean", () => {
    assert.deepEqual(clientResolutionDefects({ app: APP, html: HTML }), []);
  });

  it("names each violation when one is injected, so the clean arm is not an unrun check", () => {
    /**
     * Each mutation is asserted to have CHANGED the source before it is trusted,
     * because a `.replace()` that matched nothing would leave a defect list that
     * is empty for the same reason the clean arm's is.
     */
    const mutations = [
      {
        what: "the caller's own resolved tenant is no longer consulted",
        app: APP.replace(TENANT_LEG, "staffMap.cityKey = staffMap.cityKey;"),
        names: /no caller-tenant leg/,
      },
      {
        what: "the tenant leg is asked first, so a key would override an explicit ?cityKey",
        app: APP.replace(`${TENANT_LEG}\n`, "").replace(
          "const staffMap = resolveStaffMapQuery(window.location.search);",
          `${TENANT_LEG}\nconst staffMap = resolveStaffMapQuery(window.location.search);`,
        ),
        names: /BEFORE the caller's tenant/,
      },
      {
        what: "one loader is lifted out of the guarded branch",
        app: APP.replace("  loadPipeline(staffMap.cityKey);\n", "").replace(
          GUARD,
          `loadPipeline(staffMap.cityKey);\n${GUARD}`,
        ),
        names: /loadPipeline\(staffMap\.cityKey\); is NOT inside/,
      },
      {
        what: "a loader is dropped from the boot entirely",
        app: APP.replace("  loadFleetLens(staffMap.cityKey);\n", ""),
        names: /loadFleetLens\(staffMap\.cityKey\); occurs 0 times/,
      },
      {
        what: "the no-city branch reveals nothing",
        app: APP.replace("  showNoCityState();", "  /* nothing */"),
        names: /has an else branch calling showNoCityState/,
      },
      {
        what: "the panel stops being hidden",
        html: HTML.replace('<div id="no-city-state" hidden>', '<div id="no-city-state">'),
        names: /must ship with the hidden attribute/,
      },
      {
        what: "the panel names a shipped pack",
        html: HTML.replace(
          "add <b>?cityKey=&lt;pack key&gt;</b>",
          "add <b>?cityKey=template-city</b>",
        ),
        names: /panel names the shipped pack template-city/,
      },
    ];
    for (const m of mutations) {
      const app = m.app === undefined ? APP : m.app;
      const html = m.html === undefined ? HTML : m.html;
      if (m.app !== undefined) assert.notEqual(app, APP, `the probe for "${m.what}" did not change web/app.js`);
      if (m.html !== undefined) assert.notEqual(html, HTML, `the probe for "${m.what}" did not change web/index.html`);
      const defects = clientResolutionDefects({ app, html });
      assert.ok(
        defects.some((d) => m.names.test(d)),
        `"${m.what}" must be caught by name; got ${JSON.stringify(defects)}`,
      );
    }
  });
});
