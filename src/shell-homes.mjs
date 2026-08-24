/**
 * G-73 / G-75 / G-93 Connections register.
 *
 * Counting rule: ONE ROW PER JOB. The Homes tables in
 * doc_repo/_inbox/2026-08-17_g18_shell_homes.md carry 67 source rows
 * (primary 31 + review-product 7 + products 6 + feeds 12 + other 11), plus
 * SHELL_HOMES_ADDENDA, which are 3 layout-inventory jobs the Homes tables never
 * named and the G-73 design review found homeless (section F).
 *
 * Disposition vocabulary is closed at six values. The source markdown carried
 * ten; the extra four were prose living in a column that has to be countable,
 * so the nuance moved into the home text and the state normalised.
 *
 * G-93, AND WHY THE ROW COUNT IS NO LONGER THE SOURCE-ROW COUNT.
 *
 * Two source rows BUNDLED jobs whose dispositions differ. `Auth / session /
 * notifications / theme / sign out` was one row for four jobs, and after G-90
 * two of them exist and two do not; `Feedback with screenshot and category` was
 * one row for three, and after G-90 one exists and two do not. With a vocabulary
 * closed at six values, NO SINGLE VALUE was true of either row - which is why
 * the G-90 lane deliberately did not edit them and routed a ruling instead.
 *
 * The operator ruled: split, each job with its own honest disposition. So a
 * bundled source row becomes several register rows, each naming its source row
 * in `splitFrom`, and the register renders 70 + 5 for 67 + 3 source rows.
 *
 * BOTH FIGURES ARE MEASURED AND NEITHER IS DERIVED FROM THE OTHER BY
 * SUBTRACTION (DEV_PROCESS 1.3): rows are counted by counting rows, and source
 * rows are counted as the distinct values of `splitFrom ?? job`. The alternative
 * - keep 67 and set each bundled row's disposition from its worst leg - was
 * rejected because it makes the disposition column report the least-built leg of
 * a bundle rather than the state of a job, on the page whose entire purpose is
 * to be the honest build map.
 */
export const DISPOSITIONS = [
  "Mounted",
  "Empty",
  "Not built",
  "Island",
  "Killed",
  "Not connected",
];

export const SHELL_HOMES_COUNTING_RULE =
  "one row per job, from the Homes tables in _inbox/2026-08-17_g18_shell_homes.md (primary 31 + review-product 7 + products 6 + feeds 12 + other 11 = 67 source rows); a source row that bundled jobs with different dispositions is split into one row per job, each naming its source row in splitFrom";

export const SHELL_HOMES_ADDENDA_RULE =
  "layout-inventory jobs the Homes tables never named, found homeless by the G-73 design review section F; split by the same rule";

/**
 * The source row a split register row came from. A register row without a
 * splitFrom IS its own source row, which is what makes the source-row count a
 * measurement rather than a subtraction.
 */
export const SPLIT_SOURCE_ROWS = [
  "Auth / session / notifications / theme / sign out",
  "Feedback with screenshot and category",
];

export const SHELL_HOMES = [
  { table: "primary", job: "See the whole city this morning", home: "Overview", disposition: "Mounted" },
  { table: "primary", job: "Overview metric tiles", home: "Overview metric strip", disposition: "Empty" },
  { table: "primary", job: "Workspace launch cards", home: "No home. Navigation lives in the sidebar only.", disposition: "Killed" },
  { table: "primary", job: "City calendar", home: "Overview Public meetings; Citizen Meetings", disposition: "Empty" },
  { table: "primary", job: "Live City Pulse / data-source dots", home: "Overview Across departments; City Connections", disposition: "Mounted" },
  { table: "primary", job: "Money, budget, spend, scenario", home: "Finance", disposition: "Empty" },
  { table: "primary", job: "OpenGov embed / COA", home: "Finance", disposition: "Not built" },
  { table: "primary", job: "Permit fee revenue", home: "Finance source register, marked Partial", disposition: "Empty" },
  /**
   * G-102. THE FIVE DEVELOPMENT SERVICES ROWS, AND WHY FOUR OF THEM MOVED.
   *
   * Four of these said "Not built" while their tabs shipped and rendered 72
   * generated records between them - 21 inspections, 15 work orders, 17
   * licences, 19 code cases, measured off composeDomainMap and not read out of
   * a comment. G-100 derived the same claim for the nav badges and the Overview
   * register and left this column hand-typed, which is why the disposition the
   * G-100 preamble names as the shape that opened the programme went on being
   * wrong for two more waves.
   *
   * EMPTY, NOT MOUNTED, and the register itself is the authority. Permitting
   * pipeline has said Empty since G-77 while rendering 14 generated records
   * under the same mygov gate, and MyGov's own row in the feeds table below
   * still says Not connected. These four are that row's siblings in every
   * respect, so Mounted would claim a feed none of them has.
   *
   * domainId is the link the check in src/lens-claims.test.mjs derives against.
   * Permitting pipeline carries one too although its disposition did not move:
   * a check whose every subject needed correcting is a check that would pass a
   * refuse-everything rewrite, and this row is the case that keeps it honest.
   */
  { table: "primary", job: "Permitting pipeline", home: "Development services Pipeline", disposition: "Empty", domainId: "permits-pipeline" },
  { table: "primary", job: "Inspections", home: "Development services Inspections", disposition: "Empty", domainId: "inspections" },
  { table: "primary", job: "Work orders", home: "Development services Work orders", disposition: "Empty", domainId: "work-orders" },
  { table: "primary", job: "Business licenses", home: "Development services Licenses", disposition: "Empty", domainId: "business-licenses" },
  { table: "primary", job: "Code enforcement", home: "Development services Code enforcement", disposition: "Empty", domainId: "code-violations" },
  { table: "primary", job: "Property Intel / parcel dossier", home: "Development services Place; SmartSite map", disposition: "Mounted" },
  { table: "primary", job: "Second parcel map stack", home: "No product home. Stays on the city until a named cut.", disposition: "Island" },
  { table: "primary", job: "Emergency EOC", home: "Police + Fire and EMS", disposition: "Not built" },
  { table: "primary", job: "Regional ops map / resources / incident log", home: "Police / Fire", disposition: "Not built" },
  { table: "primary", job: "Police", home: "Police", disposition: "Not built" },
  { table: "primary", job: "Fire / EMS", home: "Fire and EMS", disposition: "Not built" },
  { table: "primary", job: "Flood / weather", home: "Fire and EMS; Place overlays", disposition: "Not built" },
  { table: "primary", job: "VFD", home: "Fire and EMS", disposition: "Not built" },
  { table: "primary", job: "County dispatch", home: "Fire and EMS", disposition: "Not built" },
  { table: "primary", job: "Cameras", home: "Police", disposition: "Not built" },
  { table: "primary", job: "Fleet / operations", home: "Fleet", disposition: "Not built" },
  { table: "primary", job: "Fleet map / vehicles / drivers / safety", home: "Fleet", disposition: "Not built" },
  { table: "primary", job: "CIP / projects", home: "Public works", disposition: "Not built" },
  { table: "primary", job: "Power BI reporting", home: "Public works", disposition: "Not built" },
  { table: "primary", job: "Phones / GoTo", home: "Public works", disposition: "Not built" },
  { table: "primary", job: "Compass chatbot", home: "Compass top-bar sheet, chrome only", disposition: "Empty" },
  { table: "primary", job: "Public morning brief", home: "No home. Leaked live operations without a session.", disposition: "Killed" },
  { table: "primary", job: "Prophecy document search", home: "Work Records search", disposition: "Not built" },
  { table: "review-product", job: "Reviewer queue", home: "Work Plan review (iframe residual)", disposition: "Mounted" },
  { table: "review-product", job: "Intake", home: "Plan review intake", disposition: "Not built" },
  { table: "review-product", job: "Inspect / Fire / GIS review tabs", home: "Plan review disciplines", disposition: "Not built" },
  { table: "review-product", job: "Code enforcement (duplicate product)", home: "Development services Code enforcement", disposition: "Not built" },
  { table: "review-product", job: "Applicant / contractor portals", home: "Citizen My requests", disposition: "Not built" },
  { table: "review-product", job: "City document table", home: "Files", disposition: "Island" },
  { table: "review-product", job: "Nested review product chrome", home: "No home. One shell, one top bar.", disposition: "Killed" },
  { table: "products", job: "Operations Dashboard", home: "Overview", disposition: "Mounted" },
  { table: "products", job: "Parcel Intelligence", home: "Development services Place / SmartSite", disposition: "Mounted" },
  { table: "products", job: "AI Plan Review / Codex 1b", home: "Work Plan review (iframe residual)", disposition: "Mounted" },
  { table: "products", job: "Citizen public SKU", home: "No home as a product. The capability is the Citizen lens.", disposition: "Killed" },
  { table: "products", job: "3D city model product", home: "No home. Not a product surface.", disposition: "Killed" },
  { table: "products", job: "Compass", home: "Top-bar sheet, chrome only", disposition: "Empty" },
  { table: "feeds", job: "MyGov", home: "Development services Pipeline; Overview queue", disposition: "Not connected" },
  { table: "feeds", job: "Samsara", home: "Fleet", disposition: "Not connected" },
  { table: "feeds", job: "Spireon", home: "Police", disposition: "Not connected" },
  { table: "feeds", job: "Verkada", home: "Police", disposition: "Not connected" },
  { table: "feeds", job: "FirstDue", home: "Fire and EMS", disposition: "Not connected" },
  { table: "feeds", job: "OpenGov", home: "Finance", disposition: "Not connected" },
  { table: "feeds", job: "ArcGIS / Esri", home: "Place map, through the SmartSite mount", disposition: "Mounted" },
  { table: "feeds", job: "Power BI", home: "Public works", disposition: "Not connected" },
  { table: "feeds", job: "GoTo Connect", home: "Public works", disposition: "Not connected" },
  { table: "feeds", job: "Municode calendar", home: "Overview Public meetings", disposition: "Not connected" },
  { table: "feeds", job: "Anthropic", home: "Compass", disposition: "Not connected" },
  { table: "feeds", job: "CRM feed", home: "No home. Not a city feed.", disposition: "Killed" },
  { table: "other", job: "Reports", home: "Public works; Finance", disposition: "Not built" },
  { table: "other", job: "Activity", home: "Overview; People and access", disposition: "Not built" },
  { table: "other", job: "Projects", home: "Public works", disposition: "Not built" },
  { table: "other", job: "Call analytics", home: "Public works", disposition: "Not built" },
  { table: "other", job: "Design lab", home: "No home. Internal playground.", disposition: "Killed" },
  { table: "other", job: "Data audit", home: "Connections", disposition: "Not built" },
  { table: "other", job: "Departments including Parks and Courts", home: "Parks lens; Municipal court on Connections", disposition: "Not built" },
  { table: "other", job: "Citizen service requests", home: "Citizen lens. The twelve-tile grid was dropped.", disposition: "Mounted" },
  /**
   * G-93, the split. Four jobs, four dispositions, and the home column carries
   * the nuance the vocabulary cannot. Every home text below states a STRUCTURAL
   * fact - which build an action waits on - rather than a deployment fact such
   * as "SHELL_IDENTITY_PROVIDER is unset", which would be true the day it was
   * typed and silently false the day a variable is set.
   */
  { table: "other", job: "Auth and session actions", home: "Top bar account menu; the actions arrive with the People and access build", disposition: "Not built", splitFrom: "Auth / session / notifications / theme / sign out" },
  { table: "other", job: "Notifications", home: "Top bar notifications tray; empty with its basis, and it prints no count", disposition: "Empty", splitFrom: "Auth / session / notifications / theme / sign out" },
  { table: "other", job: "Theme, light and dark", home: "Top bar theme toggle, persisted per device and resolved before first paint", disposition: "Mounted", splitFrom: "Auth / session / notifications / theme / sign out" },
  { table: "other", job: "Sign out", home: "Top bar account menu; ending a session needs the People and access build", disposition: "Not built", splitFrom: "Auth / session / notifications / theme / sign out" },
  { table: "other", job: "Status bar integration count", home: "Connections; nav footer, counted from this register", disposition: "Mounted" },
  { table: "other", job: "City-owned assets", home: "City Assets", disposition: "Empty" },
];

/**
 * Jobs the live staff dashboard performs that no Homes-table row named.
 * Naming a home is the whole job here; none of these builds an engine.
 */
export const SHELL_HOMES_ADDENDA = [
  { table: "layout-inventory", job: "Print / PDF export of a record", home: "Action on the record surface that owns the record", disposition: "Not built" },
  /**
   * G-93, the same treatment. Feedback exists after G-90 - a composer, a route,
   * and an `accepted` flag that means DELIVERED and nothing else - while the
   * screenshot and category legs do not exist at all.
   */
  { table: "layout-inventory", job: "Feedback", home: "Top bar account menu composer; delivery is reported per send and never assumed", disposition: "Mounted", splitFrom: "Feedback with screenshot and category" },
  { table: "layout-inventory", job: "Feedback screenshot attachment", home: "Top bar account menu composer; the composer takes text only", disposition: "Not built", splitFrom: "Feedback with screenshot and category" },
  { table: "layout-inventory", job: "Feedback category", home: "Top bar account menu composer; the composer takes text only", disposition: "Not built", splitFrom: "Feedback with screenshot and category" },
  { table: "layout-inventory", job: "Municipal court", home: "Connections only. Ruled long-tail, not a lens this wave.", disposition: "Not built" },
];

export const ALL_HOME_ROWS = [...SHELL_HOMES, ...SHELL_HOMES_ADDENDA];

/* -------------------------------------------------------------- the counts

G-93. Every figure the Connections page prints is computed here and baked from
here. Before this card the page carried "67 of 67", "3", and a prose restatement
of the counting rule as HAND-TYPED text in web/index.html, while the rule itself
lived in this file - three copies of one number with nothing connecting them.
That is the drift this repo has already paid for twice on this very page, as
"7 integrations" and as "0 of 4", and a split that changes the row count is
exactly the edit that would have left them stale.

Rows and source rows are each MEASURED. Neither is the other minus something.
*/

/** The source row a register row came from. A row that was never split is its own. */
export function sourceRowOf(row) {
  return row.splitFrom ?? row.job;
}

/** Distinct source rows behind a set of register rows. */
export function sourceRowCount(rows = SHELL_HOMES) {
  return new Set(rows.map(sourceRowOf)).size;
}

/** Rows and source rows per table, both measured by counting. */
export function tableCounts(rows = SHELL_HOMES) {
  const seen = new Map();
  for (const row of rows) {
    const entry = seen.get(row.table) || { table: row.table, rows: 0, sources: new Set() };
    entry.rows += 1;
    entry.sources.add(sourceRowOf(row));
    seen.set(row.table, entry);
  }
  return [...seen.values()].map((e) => ({ table: e.table, rows: e.rows, sourceRows: e.sources.size }));
}

/**
 * The panel-head figure: register rows that name a home, over register rows.
 * The page claims nothing is homeless, so the numerator measures exactly that
 * claim rather than restating the denominator.
 */
export function homeRowsCounted(rows = SHELL_HOMES) {
  const homed = rows.filter((r) => String(r.home ?? "").trim().length > 0).length;
  return { homed, rows: rows.length, sourceRows: sourceRowCount(rows) };
}

export function homeRowsLabel(rows = SHELL_HOMES) {
  const { homed, rows: total } = homeRowsCounted(rows);
  return `${homed} of ${total}`;
}

export function homeRowsRule(rows = SHELL_HOMES) {
  return `register row, from ${sourceRowCount(rows)} Homes-table rows`;
}

export function addendaLabel(rows = SHELL_HOMES_ADDENDA) {
  return String(rows.length);
}

export function addendaRule(rows = SHELL_HOMES_ADDENDA) {
  return `layout-inventory addendum, from ${sourceRowCount(rows)} inventory jobs`;
}

/**
 * The counting rule as the page prints it, composed from the same arrays the
 * register is rendered from. The per-table breakdown is the SOURCE-row
 * breakdown, because that is what the G-18 file carries; the register totals
 * follow it in the same sentence so the two can never be read as one figure.
 */
export function countingRuleCaption(rows = SHELL_HOMES, addenda = SHELL_HOMES_ADDENDA) {
  const breakdown = tableCounts(rows)
    .map((t) => `${t.table} ${t.sourceRows}`)
    .join(", ");
  return (
    `Counting rule: one row per job. The G-18 function-homes file carries ${sourceRowCount(rows)} Homes-table rows ` +
    `(${breakdown}) plus ${sourceRowCount(addenda)} layout-inventory jobs the Homes tables never named. ` +
    `A source row that bundled jobs with different dispositions is split into one row per job, each naming its ` +
    `source row, so the register renders ${rows.length} and ${addenda.length}. ` +
    `Disposition is one of ${DISPOSITIONS.length}: ${DISPOSITIONS.join(", ")}. No live sync time is invented.`
  );
}

/**
 * Nav-footer denominator. Derived from the feeds table, never hardcoded:
 * a feed counts as connected only when its disposition is Mounted.
 */
export function sourcesConnected(rows = SHELL_HOMES) {
  const feeds = rows.filter((r) => r.table === "feeds");
  return {
    connected: feeds.filter((r) => r.disposition === "Mounted").length,
    total: feeds.length,
    rule: "feeds table of the Connections register; connected means disposition Mounted",
  };
}

export function sourcesConnectedLabel(rows = SHELL_HOMES) {
  const { connected, total } = sourcesConnected(rows);
  return `${connected} of ${total} sources connected`;
}

export function dispositionPill(disposition) {
  const d = String(disposition || "");
  if (d === "Mounted") return "p-restricted";
  if (d === "Island") return "p-warn";
  return "p-quiet";
}

export function homeRowHtml(row, index) {
  const job = escapeHtml(row.job);
  const home = escapeHtml(row.home);
  const disposition = escapeHtml(row.disposition);
  const pill = dispositionPill(row.disposition);
  return `<div class="srcreg" data-home-row="${index + 1}" data-home-table="${escapeHtml(row.table)}" data-disposition="${disposition}"><i class="rail"></i><span class="nm"><b>${job}</b><span>${home}</span></span><span class="pill ${pill}">${disposition}</span></div>`;
}

export function connectionsRegisterHtml(rows = ALL_HOME_ROWS) {
  return rows.map(homeRowHtml).join("\n                      ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * THE BAKE, as a pure function (G-88 item 7, round 3).
 *
 * scripts/bake-connections.mjs used to carry this transform inline, which made
 * it unassertable: the only way to know whether web/index.html was in sync with
 * this generator was to run the script and look at the diff. The
 * translation-boundary investigation recorded the consequence - the bake's
 * output is never byte-asserted, so a class or an attribute changed here and not
 * re-baked ships stale and passes every test in the repo, in either direction.
 *
 * Extracted here so the script and src/shell-homes.test.mjs call ONE
 * implementation. The test asserts web/index.html is a FIXED POINT of this
 * function: baking it again changes nothing. That is freshness in both
 * directions, byte-exact, and it needs nobody to remember to run anything.
 *
 * CRLF-normalized in and out. The region sentinels below are literal newlines,
 * so on a Windows checkout with autocrlf the raw file would match nothing and
 * this would throw - which is the shape where a Windows-local failure and a
 * green CI disagree.
 */
export function bakeConnectionsInto(rawHtml) {
  let html = String(rawHtml).replace(/\r\n/g, "\n");

  const start = html.indexOf('id="connections-register"');
  if (start < 0) throw new Error("connections-register missing");
  const open = html.indexOf(">", start) + 1;
  const end = html.indexOf("</div>\n                </div>", open);
  if (end < 0) throw new Error("connections-register close missing");
  html = `${html.slice(0, open)}\n                    ${connectionsRegisterHtml()}\n                  ${html.slice(end)}`;

  /**
   * The Connections header states how many feed integrations are connected
   * product-wide, derived from the register so it cannot drift into a hand-typed
   * count the way the old "7 integrations" and "0 of 4" did.
   *
   * The nav footer is deliberately NOT baked from this register. It is a
   * per-pack figure resolved at runtime from the active pack's grants (G-80):
   * the register's numerator counts Esri as Mounted through the SmartSite embed,
   * which is granted on no pack, so beside a city name that figure was false for
   * the city. If this ever bakes nav-sources again the footer silently reverts to
   * a product-level count wearing a city's name.
   */
  const label = sourcesConnectedLabel();
  html = html.replace(/(<b id="connections-sources">)[^<]*(<\/b>)/, (_m, a, b) => `${a}${label}${b}`);

  /**
   * G-93. THE PANEL-HEAD FIGURES AND THE COUNTING RULE, NOW BAKED.
   *
   * "67 of 67", "3" and the prose counting rule were hand-typed into
   * web/index.html while the rule that produces them lived in this file. Three
   * copies of one number, with nothing connecting them, on the page whose entire
   * job is to be countable - and a split that changes the row count is precisely
   * the edit that leaves them stale. So they bake, and the fixed-point
   * assertion in src/shell-homes.test.mjs covers them for free.
   *
   * Written through the same id-anchored replace as the sources label, which is
   * idempotent by construction: the replacement contains no "<", so re-running
   * the bake matches the same span and writes the same bytes.
   */
  for (const [id, value] of [
    ["connections-rows", homeRowsLabel()],
    ["connections-rows-rule", homeRowsRule()],
    ["connections-addenda", addendaLabel()],
    ["connections-addenda-rule", addendaRule()],
    ["connections-counting-rule", countingRuleCaption()],
  ]) {
    const re = new RegExp(`(<(?:b|span|p)[^>]*id="${id}"[^>]*>)[^<]*(</(?:b|span|p)>)`);
    if (!re.test(html)) throw new Error(`${id} missing from the bake target`);
    html = html.replace(re, (_m, a, b) => `${a}${value}${b}`);
  }

  return html;
}
