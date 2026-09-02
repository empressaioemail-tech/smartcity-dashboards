import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoSupplierDsn,
  assertNoSupplierMounts,
  FORBIDDEN_MOUNT_MARKERS,
  MOUNT_URL_ENV_KEYS,
  planReviewEmbedUrl,
  smartFilesEmbedUrl,
  smartsiteEmbedUrl,
} from "./mounts.mjs";

describe("G-13 mounts", () => {
  it("embeds SmartSite by parcelNodeId, not Leaflet", () => {
    const url = smartsiteEmbedUrl("node-1");
    assert.match(url, /parcelNodeId=node-1/);
    assert.equal(url.includes("leaflet"), false);
  });

  it("embeds Plan Review on plan-review-app, not a cloned reviewer", () => {
    assert.equal(planReviewEmbedUrl({}), "https://plan-review-app-ten.vercel.app/?embed=1");
    assert.equal(
      planReviewEmbedUrl({ PLAN_REVIEW_EMBED_ORIGIN: "https://plan-review-app-ten.vercel.app/" }),
      "https://plan-review-app-ten.vercel.app/?embed=1",
    );
  });

  it("embeds Smart Files on smart-files-app with embed=1, not a cloned browser", () => {
    assert.equal(smartFilesEmbedUrl({}), "https://smart-files-app.vercel.app/?embed=1");
    assert.equal(
      smartFilesEmbedUrl({ SMART_FILES_EMBED_ORIGIN: "https://smart-files-app.vercel.app/" }),
      "https://smart-files-app.vercel.app/?embed=1",
    );
    assert.equal(
      smartFilesEmbedUrl({ SMART_FILES_EMBED_ORIGIN: "https://smart-files-app.vercel.app/?foo=1" }),
      "https://smart-files-app.vercel.app/?foo=1&embed=1",
    );
  });

  it("G-114: threads cityKey onto both embeds, so the SAME static origin serves a genuinely city-scoped URL", () => {
    assert.equal(
      planReviewEmbedUrl({}, "template-city"),
      "https://plan-review-app-ten.vercel.app/?embed=1&cityKey=template-city",
    );
    assert.equal(
      smartFilesEmbedUrl({}, "template-city"),
      "https://smart-files-app.vercel.app/?embed=1&cityKey=template-city",
    );
    // No cityKey argument at all -- the pre-G-114 call shape -- keeps behaving
    // exactly as before. This is what every OTHER call site in this repo does
    // today (server.mjs's diagnostic /?work= examples); it must not regress.
    assert.equal(planReviewEmbedUrl({}), "https://plan-review-app-ten.vercel.app/?embed=1");
    assert.equal(smartFilesEmbedUrl({}), "https://smart-files-app.vercel.app/?embed=1");
    // Two different cities produce two different URLs from the identical env.
    assert.notEqual(
      planReviewEmbedUrl({}, "template-city"),
      planReviewEmbedUrl({}, "bastrop"),
    );
    // A malicious/malformed cityKey cannot smuggle a second query param or
    // break out of the value position.
    assert.equal(
      planReviewEmbedUrl({}, "x&evil=1"),
      "https://plan-review-app-ten.vercel.app/?embed=1&cityKey=x%26evil%3D1",
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
        SMART_FILES_EMBED_ORIGIN: "https://smart-files-app.vercel.app",
      }),
      true,
    );
  });
});
