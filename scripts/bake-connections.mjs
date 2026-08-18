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
 * The Connections header states how many feed integrations are connected
 * product-wide, derived from the register here so it cannot drift into a
 * hand-typed count the way the old "7 integrations" and "0 of 4" did.
 *
 * The nav footer is deliberately NOT baked from this register any more. It is a
 * per-pack figure resolved at runtime from the active pack's grants (G-80): the
 * register's numerator counts Esri as Mounted through the SmartSite embed,
 * which is granted on no pack, so beside a city name that figure was false for
 * the city. If this script ever bakes nav-sources again the footer silently
 * reverts to a product-level count wearing a city's name.
 */
const label = sourcesConnectedLabel();
html = html.replace(
  /(<b id="connections-sources">)[^<]*(<\/b>)/,
  (_m, a, b) => `${a}${label}${b}`,
);

fs.writeFileSync(p, html);

const count = (html.match(/data-home-row="/g) || []).length;
if (count !== ALL_HOME_ROWS.length) {
  throw new Error(`expected ${ALL_HOME_ROWS.length} rows, got ${count}`);
}
if (!html.includes(`<b id="connections-sources">${label}</b>`)) {
  throw new Error("connections source label did not bake");
}
if (html.includes(`<b id="nav-sources">${label}</b>`)) {
  throw new Error("nav-sources must stay per-pack, not the product register figure");
}
console.log(
  "baked",
  count,
  `(${SHELL_HOMES.length} Homes-table + ${SHELL_HOMES_ADDENDA.length} addenda)`,
  "|",
  label,
);
