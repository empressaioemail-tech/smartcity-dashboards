import fs from "node:fs";
import {
  ALL_HOME_ROWS,
  SHELL_HOMES,
  SHELL_HOMES_ADDENDA,
  bakeConnectionsInto,
  sourcesConnectedLabel,
} from "../src/shell-homes.mjs";

/**
 * The transform itself lives in src/shell-homes.mjs so that this script and the
 * freshness test call ONE implementation. Before that split there was no way to
 * assert web/index.html was in sync with the generator short of running this and
 * reading the diff, so a stale bake shipped green in either direction.
 */
const p = new URL("../web/index.html", import.meta.url);
const html = bakeConnectionsInto(fs.readFileSync(p, "utf8"));
fs.writeFileSync(p, html);

const label = sourcesConnectedLabel();
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
