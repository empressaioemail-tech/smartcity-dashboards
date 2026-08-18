import fs from "node:fs";
import { connectionsRegisterHtml } from "../src/shell-homes.mjs";

const p = new URL("../web/index.html", import.meta.url);
let html = fs.readFileSync(p, "utf8");
const start = html.indexOf('id="connections-register"');
if (start < 0) throw new Error("connections-register missing");
const open = html.indexOf(">", start) + 1;
const last = html.lastIndexOf('data-home-row="67"');
const end = last >= 0 ? html.indexOf("</div>", last) + 6 : html.indexOf("</div>", open);
html = `${html.slice(0, open)}\n                    ${connectionsRegisterHtml()}\n                  ${html.slice(end)}`;
fs.writeFileSync(p, html);
const count = (html.match(/data-home-row="/g) || []).length;
if (count !== 67) throw new Error(`expected 67 rows, got ${count}`);
if (html.includes("permitflow")) throw new Error("permitflow leaked");
console.log("baked", count);
