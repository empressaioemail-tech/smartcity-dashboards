import fs from "node:fs";
import path from "node:path";
import { server } from "../src/server.mjs";
import { DS_TABS } from "../src/staff-review.mjs";

/**
 * G-154. THE BRIDGE FROM THE BUILT SURFACE TO THE DESIGN FOLDER'S OWN CHECK.
 *
 * The design's `_design/smartcity-dev-services/check.mjs` is a RATIFIED
 * instrument and it scans `.dc.html` artboards in its own folder. The dispatch
 * asks it to pass on the BUILT surface, which it cannot reach on its own, and
 * names the precedent: G-156 added `--dir` to the finance-lens check and wrote
 * scripts/export-finance-lens.mjs to feed it.
 *
 * THIS SCRIPT IS THE EXPORT, AND IT DOES NOT RE-IMPLEMENT ANYTHING. That is the
 * whole reason it drives a browser instead of calling a renderer: the
 * Development services lens is rendered CLIENT-SIDE by web/app.js from the
 * `/api/domains/<id>` and `/api/lenses/development-services/pipeline` payloads,
 * so there is no server-side `renderDevelopmentServices()` to call. A second
 * renderer written for the check would be the CTRL-1 shape - two
 * implementations of one surface, agreeing today and drifting silently - inside
 * the artifact whose entire job is to detect that. So instead: the repo's own
 * src/server.mjs in-process on an ephemeral port, and the repo's own
 * web/index.html + web/app.js executed by Chromium. What lands on disk is the
 * DOM the product actually painted.
 *
 * WHAT THE EXPORT IS, EXACTLY, because the difference matters when reading a
 * verdict: it is `#lens-development-services`'s outerHTML, captured once per
 * tab, after that tab's own fetch has settled. It is NOT a screenshot and NOT
 * the shared document without a pack. It carries the tab strip, the tier-1
 * attention row, the region under test and its neighbours, in whatever state
 * that pack's read resolved to.
 *
 * THE PACK DECIDES WHETHER THERE IS ANYTHING TO READ. On the demo pack every
 * domain composes records and every rule in the check has input. On a pack whose
 * feeds are granted but unreadable from this machine, the regions render their
 * own stated absence and the check REFUSES A VERDICT (exit 2) rather than
 * passing on a surface it could not check. Pass the pack you mean.
 *
 *   node scripts/export-dev-services-lens.mjs <outDir> [cityKey]
 *   node scripts/export-dev-services-lens.mjs out/dev-services template-city
 *   node scripts/export-dev-services-lens.mjs out/bastrop bastrop_tx --base https://<app>
 *
 * `--base <url>` reads a DEPLOYED app instead of starting one in-process. It is
 * not a convenience: live Bastrop reads need PLATFORM_INTERNAL_API_KEY, which
 * exists on the deployed app and not on this machine, so a local bastrop_tx
 * export is a stated absence and the proving run has to happen against the
 * deployed surface (OPS-17 A-146 rule 1).
 *
 * `--base` is also how a DIFFERENT local revision is read: point it at another
 * worktree's server and the export is that revision's surface. The manifest
 * then reports `mode: "external-loopback"` rather than "deployed", because the
 * artifact a close cites must not claim a deployment it did not touch.
 */
const args = process.argv.slice(2);
const outDir = args[0];
const baseFlag = args.indexOf("--base");
const remoteBase = baseFlag >= 0 ? args[baseFlag + 1] : null;
/**
 * `--key-file <path>` is how a TENANT-PRIVATE pack is read at all. `bastrop_tx`
 * is tenant-private, so without a Hauska product key scoped to it every region
 * renders its own stated absence and the export carries zero rows - which is
 * exactly what the first bastrop_tx run produced, and it looked like a data
 * problem rather than a missing credential.
 *
 * THE KEY IS SEEDED INTO localStorage BY AN INIT SCRIPT, DELIBERATELY NOT BY
 * `?hauskaKey=`. The product's own URL mechanism would work, but this script
 * writes every visited URL into the manifest it emits, so a key in the query
 * string would be copied verbatim into a proof artifact. Provenance must not
 * carry a secret. The init script reaches the same `hauska_key` storage key the
 * product's own bootstrap writes, so the same `window.fetch` wrapper attaches
 * the header to same-origin `/api/` calls.
 *
 * The key VALUE is never printed, never written to the output directory, and
 * never recorded in the manifest; `manifest.auth` records only that a key was
 * used, which is provenance without the secret.
 */
const keyFileFlag = args.indexOf("--key-file");
const keyFilePath = keyFileFlag >= 0 ? args[keyFileFlag + 1] : null;
const hauskaKey = keyFilePath ? fs.readFileSync(keyFilePath, "utf8").trim() : "";
const cityKey =
  args.slice(1).find((a) => !a.startsWith("--") && a !== remoteBase && a !== keyFilePath) || "template-city";
if (!outDir) {
  console.error("usage: node scripts/export-dev-services-lens.mjs <outDir> [cityKey] [--base <url>] [--key-file <path>]");
  process.exit(2);
}
if (baseFlag >= 0 && (!remoteBase || remoteBase.startsWith("--"))) {
  console.error("--base needs a URL, e.g. --base https://d12-main-uat.ondigitalocean.app");
  process.exit(2);
}

/**
 * `mode` is a PROVENANCE field on the artifact a close cites, so it says where
 * the surface actually came from rather than what flag was passed. The first
 * draft wrote "deployed" for any `--base`, which labelled the pre-lane
 * fd8562c export as deployed when its base was http://127.0.0.1:8123 - a local
 * server a few directories away. A wrong provenance field on a proof artifact is
 * the silent-fallback class this program hunts, so loopback bases say so.
 */
const loopbackBase = Boolean(remoteBase) && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/.test(remoteBase);

/** A missing browser is a HARD FAILURE with an instruction, never a skip. */
async function launchChromium() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (err) {
    console.error(`playwright-core did not load (${err.message}). Run: npm ci`);
    process.exit(2);
  }
  try {
    return await chromium.launch();
  } catch (err) {
    console.error("Chromium did not launch, so the export DID NOT RUN.");
    console.error("Install the browser and run again: npx playwright-core install chromium");
    console.error(err.message);
    process.exit(2);
  }
}

const LENS_ID = "lens-development-services";

const snapshot = async (page) => {
  return page.evaluate((lensId) => {
    const lens = document.getElementById(lensId);
    if (!lens) return null;
    /**
     * The plan-review and flood-study tabs carry no domain and therefore no
     * region to settle. Derived rather than listed: the rows element is found
     * inside the tab panel the app itself marked for this tab.
     */
    const rows = (tab) => {
      const panel = document.getElementById(`tab-${tab}`);
      return panel ? panel.querySelector('[id$="-rows"]') : null;
    };
    return {
      html: lens.outerHTML,
      settled: Object.fromEntries(
        [...lens.querySelectorAll(".ds-tab")].map((p) => {
          const body = p.querySelector('[id$="-rows"]');
          return [p.id, body ? body.children.length : null];
        }),
      ),
      rowsProbe: Boolean(rows),
    };
  }, LENS_ID);
};

fs.mkdirSync(outDir, { recursive: true });
/** An in-process server is started ONLY when no --base was given. */
let closeServer = async () => {};
let base = remoteBase;
if (!base) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  closeServer = () => new Promise((resolve) => server.close(resolve));
}
const browser = await launchChromium();
const manifest = {
  cityKey,
  base,
  mode: remoteBase ? (loopbackBase ? "external-loopback" : "deployed") : "in-process",
  /**
   * Provenance without the secret: that a tenant credential was presented, and
   * from where. A reader can tell a key-authenticated read from an anonymous one
   * without the artifact ever carrying the key itself.
   */
  auth: hauskaKey ? "hauska-key (x-hauska-key, seeded into localStorage)" : "none (anonymous caller)",
  tabs: [],
  generatedAt: new Date().toISOString(),
};

try {
  const ctx = await browser.newContext();
  /**
   * Seeded before any page script runs, on every navigation in this context, so
   * the product's own fetch wrapper finds the key from the very first `/api/`
   * call. A tenant-private pack composes no records without it.
   */
  if (hauskaKey) {
    await ctx.addInitScript((k) => {
      try {
        window.localStorage.setItem("hauska_key", k);
      } catch {
        /* localStorage unavailable; the pack will read as its stated absence */
      }
    }, hauskaKey);
  }
  const page = await ctx.newPage();
  let settled = {};
  /**
   * EVERY TAB IS VISITED AND ONE FILE IS WRITTEN, and both halves of that are
   * deliberate. Visiting each tab runs the page's own tab router over the whole
   * roster, so a tab that throws on activation fails the export. Writing ONE
   * file is what keeps the check's matched-input counts honest: the lens renders
   * all five region queues into the document at load, so a per-tab file would
   * carry the same five queues, and seven of them would have reported seven
   * times the cells the product actually renders.
   */
  for (const tab of DS_TABS) {
    const url = `/?lens=development-services&tab=${encodeURIComponent(tab)}&cityKey=${encodeURIComponent(cityKey)}`;
    /**
     * THE NAVIGATION WAITS FOR THE DOCUMENT, NOT FOR A QUIET WIRE, AND THE
     * DEPLOYED SURFACE IS WHY. In-process the wire goes quiet and `networkidle`
     * fires. Against the deployed app it did not: on the bastrop_tx run the
     * export produced nothing at all and was killed at 678s, which is seven
     * tabs' worth of the 90s timeout plus startup, with the page already
     * painted. A quiet wire is a heuristic this instrument cannot verify, so
     * navigation waits on the DOM instead, and the thing actually being read -
     * the five region queues going non-empty - is waited on by the bounded poll
     * below, which reports what it settled at rather than assuming the fetches
     * landed.
     *
     * WHY THE WIRE NEVER WENT QUIET IS NOT MEASURED HERE AND IS NOT CLAIMED.
     * Candidates are the mounted surfaces this lens carries (the plan-review
     * stage, the map dock) and the live upstream reads behind the region
     * queues. The fix does not depend on which it was: the poll is a signal,
     * and `networkidle` was a guess that cost a full run.
     */
    await page.goto(base + url, { waitUntil: "domcontentloaded", timeout: 90000 });
    /** The lens is rendered by app.js after the document lands, so wait for it. */
    await page.waitForSelector(`#${LENS_ID}`, { timeout: 60000 });
    let total = 0;
    /**
     * A deployed read crosses the network to upstreams this machine does not
     * control, so the same bound that is generous in-process is tight there.
     *
     * THE POLL WAITS ON THIS TAB'S OWN QUEUE, AND THAT IS A FIX, NOT A TIDY-UP.
     * It waited on the SUM across every queue until 2026-09-18, and every queue
     * renders into the document at load, so the Pipeline queue being populated
     * satisfied the condition the instant the first snapshot was taken - for
     * EVERY tab. The bastrop_tx run therefore reported "settled" for six tabs it
     * had never waited on, recorded 0 rows for the Licences queue, and the
     * design check then refused a verdict because the roll-order rule had no
     * input. The live app serves 73 business licences for bastrop_tx. The
     * instrument was reading its own impatience and calling it an absence.
     *
     * A tab with no rows container (plan-review, flood-study) has nothing to wait
     * for and settles immediately, which is why a null is a break and not a poll.
     */
    const panelKey = `tab-${tab}`;
    const deadline = Date.now() + (remoteBase ? 60000 : 30000);
    let own = null;
    for (;;) {
      const snapped = await snapshot(page);
      if (!snapped) {
        console.error(`no #${LENS_ID} on ${url}`);
        process.exit(2);
      }
      settled = snapped.settled;
      own = panelKey in settled ? settled[panelKey] : null;
      if (own === null || own > 0 || Date.now() > deadline) break;
      await page.waitForTimeout(250);
    }
    total = own ?? 0;
    manifest.tabs.push({ tab, url, rows: total });
    console.log(`visited ${tab.padEnd(17)} ${total} row(s) in its own queue`);
  }

  /**
   * THE WRITTEN FILE IS ONE SNAPSHOT AND MUST CARRY EVERY QUEUE, so it is taken
   * from a tab that actually holds them.
   *
   * THE LAST VISITED TAB IS THE WRONG PLACE TO TAKE IT, and bastrop_tx is what
   * showed that. The premise of the single-file design was "the lens renders all
   * five region queues into the document at load". Measured on the live surface:
   * a Development services tab renders all five queues into the document, but the
   * two non-domain tabs (plan-review, flood-study) leave them EMPTY. The sweep
   * ends on flood-study, so the snapshot taken there carried zero rows in every
   * queue - a 33KB file - and the design check correctly refused a verdict,
   * because a document with no rows is a document with nothing to check. The
   * live app serves 2041 inspections and 73 licences for bastrop_tx.
   *
   * So the sweep is followed by a return to a domain tab, and the file is written
   * from there. Every queue is populated on it (the sweep is what primes the
   * regions), which is what the check's cross-queue rules need: the refused-column
   * rule reads all four refused columns and the order rule reads the licence roll.
   */
  const settleTab = DS_TABS[0];
  await page.goto(
    base + `/?lens=development-services&tab=${encodeURIComponent(settleTab)}&cityKey=${encodeURIComponent(cityKey)}`,
    { waitUntil: "domcontentloaded", timeout: 90000 },
  );
  await page.waitForSelector(`#${LENS_ID}`, { timeout: 60000 });
  {
    const deadline = Date.now() + (remoteBase ? 60000 : 20000);
    /**
     * POPULATED *THEN* STABLE, and the order matters. A plain "unchanged across
     * two polls" is satisfied by two consecutive zeros, which is exactly what
     * happened on the first attempt at this: the queues had not filled yet, so
     * the loop broke immediately and wrote an empty document. Zero is not a
     * settled surface, it is an unread one.
     */
    let prev = -1;
    for (;;) {
      const s = await snapshot(page);
      const counts = Object.values(s?.settled || {}).filter((n) => n !== null);
      const sum = counts.reduce((a, b) => a + b, 0);
      settled = s?.settled ?? settled;
      if (sum > 0 && sum === prev) break;
      if (Date.now() > deadline) break;
      prev = sum;
      await page.waitForTimeout(500);
    }
  }
  const snapped = await snapshot(page);
  const file = path.join(outDir, "dev-services-lens.dc.html");
  fs.writeFileSync(file, snapped.html);
  manifest.file = path.basename(file);
  manifest.bytes = snapped.html.length;
  manifest.settled = settled;
  console.log(`wrote ${file}  (${snapped.html.length} bytes)`);
  await page.close();
} finally {
  await browser.close();
  await closeServer();
}

manifest.matchedRows = Object.values(manifest.settled || {}).reduce((sum, n) => sum + (n || 0), 0);
fs.writeFileSync(path.join(outDir, "dev-services-export.json"), JSON.stringify(manifest, null, 2));
console.log(`pack ${cityKey}: ${manifest.matchedRows} rendered row(s) across the lens' queues`);
if (manifest.matchedRows === 0) {
  console.error(
    "\nThe export carries no rendered rows, so nothing in it can be checked. That is a stated\n" +
      "absence on a pack whose feeds this machine cannot read, not a pass - the check will\n" +
      "REFUSE A VERDICT on an empty surface, by design.\n" +
      (hauskaKey
        ? "A key WAS presented, so the refusal is about the pack's own feeds, not the gate.\n"
        : "NO key was presented. If this pack is tenant-private, that alone explains it: pass --key-file.\n"),
  );
}
