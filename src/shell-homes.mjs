/**
 * G-73 / G-75 Connections register.
 *
 * Counting rule: one row per Homes-table row in
 * doc_repo/_inbox/2026-08-17_g18_shell_homes.md
 * (primary 31 + review-product 7 + products 6 + feeds 12 + other 11 = 67),
 * plus SHELL_HOMES_ADDENDA, which are layout-inventory jobs the Homes tables
 * never named and the G-73 design review found homeless (section F).
 *
 * Disposition vocabulary is closed at six values. The source markdown carried
 * ten; the extra four were prose living in a column that has to be countable,
 * so the nuance moved into the home text and the state normalised.
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
  "one row per Homes-table row in _inbox/2026-08-17_g18_shell_homes.md (primary 31 + review-product 7 + products 6 + feeds 12 + other 11 = 67)";

export const SHELL_HOMES_ADDENDA_RULE =
  "layout-inventory jobs the Homes tables never named, found homeless by the G-73 design review section F";

export const SHELL_HOMES = [
  { table: "primary", job: "See the whole city this morning", home: "Overview", disposition: "Mounted" },
  { table: "primary", job: "Overview metric tiles", home: "Overview metric strip", disposition: "Empty" },
  { table: "primary", job: "Workspace launch cards", home: "No home. Navigation lives in the sidebar only.", disposition: "Killed" },
  { table: "primary", job: "City calendar", home: "Overview Public meetings; Citizen Meetings", disposition: "Empty" },
  { table: "primary", job: "Live City Pulse / data-source dots", home: "Overview Across departments; City Connections", disposition: "Mounted" },
  { table: "primary", job: "Money, budget, spend, scenario", home: "Finance", disposition: "Empty" },
  { table: "primary", job: "OpenGov embed / COA", home: "Finance", disposition: "Not built" },
  { table: "primary", job: "Permit fee revenue", home: "Finance source register, marked Partial", disposition: "Empty" },
  { table: "primary", job: "Permitting pipeline", home: "Development services Pipeline", disposition: "Empty" },
  { table: "primary", job: "Inspections", home: "Development services Inspections", disposition: "Not built" },
  { table: "primary", job: "Work orders", home: "Development services Pipeline (staff only)", disposition: "Not built" },
  { table: "primary", job: "Business licenses", home: "Development services Licenses", disposition: "Not built" },
  { table: "primary", job: "Code enforcement", home: "Development services Code enforcement", disposition: "Not built" },
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
  { table: "other", job: "Auth / session / notifications / theme / sign out", home: "Top bar; People and access", disposition: "Not built" },
  { table: "other", job: "Status bar integration count", home: "Connections; nav footer, counted from this register", disposition: "Mounted" },
  { table: "other", job: "City-owned assets", home: "City Assets", disposition: "Empty" },
];

/**
 * Jobs the live staff dashboard performs that no Homes-table row named.
 * Naming a home is the whole job here; none of these builds an engine.
 */
export const SHELL_HOMES_ADDENDA = [
  { table: "layout-inventory", job: "Print / PDF export of a record", home: "Action on the record surface that owns the record", disposition: "Not built" },
  { table: "layout-inventory", job: "Feedback with screenshot and category", home: "Top bar; People and access", disposition: "Not built" },
  { table: "layout-inventory", job: "Municipal court", home: "Connections only. Ruled long-tail, not a lens this wave.", disposition: "Not built" },
];

export const ALL_HOME_ROWS = [...SHELL_HOMES, ...SHELL_HOMES_ADDENDA];

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

  return html;
}
