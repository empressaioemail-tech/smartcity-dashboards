import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoSupplierDsn,
  assertNoSupplierMounts,
  FORBIDDEN_MOUNT_MARKERS,
  MOUNT_URL_ENV_KEYS,
  planReviewEmbedUrl,
  smartsiteEmbedUrl,
} from "./mounts.mjs";

describe("G-13 mounts", () => {
  it("embeds SmartSite by parcelNodeId, not Leaflet", () => {
    const url = smartsiteEmbedUrl("node-1");
    assert.match(url, /parcelNodeId=node-1/);
    assert.equal(url.includes("leaflet"), false);
  });

  it("embeds Plan Review on plan-review-app, not a cloned reviewer", () => {
    assert.equal(planReviewEmbedUrl({}), "https://plan-review-app-ten.vercel.app/");
    assert.equal(
      planReviewEmbedUrl({ PLAN_REVIEW_EMBED_ORIGIN: "https://plan-review-app-ten.vercel.app/" }),
      "https://plan-review-app-ten.vercel.app/",
    );
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
      /must be this product's Neon/,
    );
  });

  it("allows empty DATABASE_URL", () => {
    assert.equal(assertNoSupplierDsn({}), true);
  });

  it("allows this product's Neon and still refuses supplier hosts", () => {
    assert.equal(
      assertNoSupplierDsn({
        DATABASE_URL:
          "postgres://u:p@ep-example-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require",
      }),
      true,
    );
    assert.throws(
      () =>
        assertNoSupplierDsn({
          DATABASE_URL:
            "postgres://u:p@ep-x.tiny-art-63602898.aws.neon.tech/neondb?sslmode=require",
        }),
      /tiny-art-63602898/,
    );
  });

  it("refuses supplier or city hosts on mount URLs", () => {
    for (const name of MOUNT_URL_ENV_KEYS) {
      for (const marker of FORBIDDEN_MOUNT_MARKERS) {
        assert.throws(
          () => assertNoSupplierMounts({ [name]: `https://example.invalid/${marker}` }),
          /refusing supplier or city host/,
        );
      }
    }
  });

  it("allows empty and honest mount URLs", () => {
    assert.equal(assertNoSupplierMounts({}), true);
    assert.equal(
      assertNoSupplierMounts({
        HAUSKA_RETRIEVAL_URL: "https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app",
        SMARTSITE_EMBED_ORIGIN: "https://smartsite.cloud",
        SMART_FILES_BACKEND_URL: "https://smart-files-padrd77ava-ue.a.run.app",
        PLAN_REVIEW_EMBED_ORIGIN: "https://plan-review-app-ten.vercel.app",
      }),
      true,
    );
  });
});
