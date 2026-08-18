import fs from "node:fs";
import {
  ALL_HOME_ROWS,
  SHELL_HOMES,
  SHELL_HOMES_ADDENDA,
  connectionsRegisterHtml,
  sourcesConnectedLabel,
} from "../src/shell-homes.mjs";

const p = new URL("../web/index.html", import.meta.url);
let html = fs.readFileSync(p, "utf8");

const start = html.indexOf('id="connections-register"');
if (start < 0) throw new Error("connections-register missing");
const open = html.indexOf(">", start) + 1;
const end = html.indexOf("</div>\n                </div>", open);
if (end < 0) throw new Error("connections-register close missing");
html = `${html.slice(0, open)}\n                    ${connectionsRegisterHtml()}\n                  ${html.slice(end)}`;

/**
 * The nav footer and the Connections header both state how many sources are
 * connected. Both are derived from the register here so neither can drift into
 * a hand-typed count the way the old "7 integrations" and "0 of 4" did.
 */
const label = sourcesConnectedLabel();
html = html.replace(
  /(<b id="nav-sources">)[^<]*(<\/b>)/,
  (_m, a, b) => `${a}${label}${b}`,
);
html = html.replace(
  /(<b id="connections-sources">)[^<]*(<\/b>)/,
  (_m, a, b) => `${a}${label}${b}`,
);

fs.writeFileSync(p, html);

const count = (html.match(/data-home-row="/g) || []).length;
if (count !== ALL_HOME_ROWS.length) {
  throw new Error(`expected ${ALL_HOME_ROWS.length} rows, got ${count}`);
}
if (!html.includes(`<b id="nav-sources">${label}</b>`)) {
  throw new Error("nav source label did not bake");
}
console.log(
  "baked",
  count,
  `(${SHELL_HOMES.length} Homes-table + ${SHELL_HOMES_ADDENDA.length} addenda)`,
  "|",
  label,
);
