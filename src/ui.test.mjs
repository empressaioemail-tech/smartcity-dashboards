import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_PRODUCT_STRINGS } from "./catalog.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "web", "app.js"), "utf8");
const shell = fs.readFileSync(path.join(root, "web", "shell.css"), "utf8");
const kit = fs.readFileSync(path.join(root, "web", "sc-kit.css"), "utf8");
const surface = html + "\n" + app;

describe("G-66 four-lens shell", () => {
  it("presents four lead lenses as views without a parcel form or Compose click", () => {
    assert.match(html, /href="\/\?lens=city-manager"/);
    assert.match(html, /href="\/\?lens=development-services"/);
    assert.match(html, /href="\/\?lens=finance"/);
    assert.match(html, /href="\/\?lens=citizen"/);
    assert.match(html, /id="lens-city-manager"/);
    assert.match(html, /id="lens-development-services"/);
    assert.match(html, /id="lens-finance"/);
    assert.match(html, /id="lens-citizen"/);
    assert.equal(html.includes("compose-form"), false);
    assert.equal(html.includes("Compose"), false);
    assert.equal(html.includes('name="parcelNodeId"'), false);
    assert.equal(html.includes("id=\"parcel-node-id\""), false);
    assert.match(html, /id="env-badge">Demo</);
    assert.match(html, /class="env demo"/);
  });

  it("keeps finance honest-empty with a source register and citizen without payment theater", () => {
    assert.match(html, /id="finance-source-register"/);
    assert.match(html, /Permit fee revenue/);
    assert.match(html, />Partial</);
    assert.match(html, /That is not a zero balance/);
    assert.equal(html.includes("$0"), false);
    assert.equal(html.includes("$0.00"), false);
    assert.equal(/\b0\b.*\b0\b.*\b0\b.*\b0\b/.test(html.match(/id="lens-finance"[\s\S]*?id="lens-citizen"/)?.[0] || ""), false);
    assert.match(html, /id="citizen-payments"/);
    assert.match(html, /Online payment is not available/);
    assert.match(html, /1311 Chestnut Street/);
    assert.match(html, /Payments unclaimed/);
    assert.equal(html.includes("Payment Complete"), false);
    assert.equal(html.includes("Pay now"), false);
    assert.equal(html.includes("handlePayment"), false);
    for (const s of FORBIDDEN_PRODUCT_STRINGS) {
      assert.equal(surface.includes(s), false, s);
    }
  });

  it("presents Compass as a top-bar sheet with city and lens scope, and has no /compass route", () => {
    assert.match(html, /id="cp-source"/);
    assert.match(html, /id="cp-sheet"/);
    assert.match(html, /id="cp-scope-city"/);
    assert.match(html, /id="cp-scope-lens"/);
    assert.match(app, /prefers-reduced-motion/);
    assert.match(app, /stiffness|springEase/);
    assert.equal(html.includes('href="/compass"'), false);
    assert.equal(app.includes('"/compass"'), false);
  });

  it("keeps demo identity on template-city and does not leak live ops names", () => {
    assert.match(html, /data-city-key="template-city"/);
    assert.match(html, /cityKey template-city/);
    assert.match(html, /48021:34137/);
    assert.match(html, /Demo fixture/);
    assert.equal(html.toLowerCase().includes("bastrop onboarded"), false);
    assert.equal(html.includes("morning-brief"), false);
    assert.equal(html.includes("25-000280"), false);
    assert.equal(html.includes("Christy Hunn"), false);
    assert.equal(html.includes("Locate Water"), false);
  });

  it("presents Work Files as a link to /?work=files and mounts the Files host", () => {
    assert.match(html, /href="\/\?work=files"/);
    assert.match(html, /id="work-files"/);
    assert.match(html, /id="files-site"/);
    assert.match(html, /title="Smart Files embed"/);
    assert.equal(html.includes('class="navitem unbuilt">Files'), false);
    assert.equal(html.includes("compose-form"), false);
    assert.equal(html.includes("$0"), false);
    assert.equal(html.includes("$0.00"), false);
    assert.equal(html.includes("Bring files"), false);
    assert.equal(html.includes("file-list"), false);
    assert.equal(html.includes("share-link"), false);
    assert.match(app, /smartFiles/);
    assert.match(app, /work === "files"/);
    assert.match(app, /files-site/);
  });

  it("uses kit tokens only and does not fork sc-kit.css", () => {
    assert.match(kit, /--sc-atom:/);
    assert.equal(shell.includes(":root"), false);
    assert.equal(shell.includes("--sc-canvas:"), false);
    assert.equal(shell.includes("--sc-accent:"), false);
    assert.match(shell, /var\(--sc-canvas\)/);
    assert.match(shell, /var\(--sc-accent\)/);
    assert.match(html, /href="\/sc-kit.css"/);
    assert.match(html, /href="\/shell.css"/);
  });
});
