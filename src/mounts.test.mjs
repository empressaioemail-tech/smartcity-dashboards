import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertNoSupplierDsn, smartsiteEmbedUrl } from "./mounts.mjs";

describe("G-13 mounts", () => {
  it("embeds SmartSite by parcelNodeId, not Leaflet", () => {
    const url = smartsiteEmbedUrl("node-1");
    assert.match(url, /parcelNodeId=node-1/);
    assert.equal(url.includes("leaflet"), false);
  });

  it("refuses a city or spine DSN", () => {
    assert.throws(
      () =>
        assertNoSupplierDsn({
          DATABASE_URL: "postgres://u:p@ep-x.tiny-art-63602898.aws.neon.tech/neondb",
        }),
      /refusing supplier or city DSN/,
    );
    assert.throws(
      () =>
        assertNoSupplierDsn({
          DATABASE_URL: "postgres://u:p@localhost/dashboards",
        }),
      /forbidden until a named tenant-registry Neon/,
    );
  });

  it("allows empty DATABASE_URL", () => {
    assert.equal(assertNoSupplierDsn({}), true);
  });
});
