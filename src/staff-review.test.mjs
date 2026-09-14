import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_LENS_IDS,
  ASSETS_WORK,
  ASSET_TABS,
  CITIZEN_LENS,
  CITY_MANAGER_LENS,
  CONNECTIONS_WORK,
  DEFAULT_PLAN_REVIEW_ORIGIN,
  DEFAULT_SMART_FILES_ORIGIN,
  DEVELOPMENT_SERVICES_LENS,
  FILES_WORK,
  FINANCE_LENS,
  PEOPLE_WORK,
  RECORDS_WORK,
  REVIEW_WORK,
  ROSTER_LENS_IDS,
  WORK_IDS,
  planReviewIframeSrc,
  resolveStaffLensQuery,
  smartFilesIframeSrc,
} from "./staff-review.mjs";

/** The resolver returns a fixed shape; this keeps each case to its differences. */
function shape(overrides = {}) {
  return {
    lens: CITY_MANAGER_LENS,
    isDevelopmentServices: false,
    isRosterLens: false,
    isFilesWork: false,
    isReviewWork: false,
    tab: "",
    assetTab: "",
    work: "",
    filter: "",
    ...overrides,
  };
}

describe("staff review query", () => {
  it("defaults GET / to city-manager, not development-services", () => {
    assert.deepEqual(resolveStaffLensQuery(""), shape());
    assert.deepEqual(resolveStaffLensQuery(new URLSearchParams()), shape());
  });

  it("treats ?lens=development-services as the staff reviewer", () => {
    assert.deepEqual(
      resolveStaffLensQuery("?lens=development-services"),
      shape({ lens: DEVELOPMENT_SERVICES_LENS, isDevelopmentServices: true, tab: "pipeline" }),
    );
    assert.deepEqual(
      resolveStaffLensQuery("?lens=development-services&tab=work-orders"),
      shape({ lens: DEVELOPMENT_SERVICES_LENS, isDevelopmentServices: true, tab: "work-orders" }),
    );
    /**
     * G-97: `review` is no longer a Development services tab, so it clamps to
     * the fallback exactly as any other unknown value does. Asserted rather
     * than left implied, because a link somebody bookmarked must land on a real
     * surface rather than on a blank one.
     */
    assert.deepEqual(
      resolveStaffLensQuery("?lens=development-services&tab=review"),
      shape({ lens: DEVELOPMENT_SERVICES_LENS, isDevelopmentServices: true, tab: "pipeline" }),
    );
  });

  it("opens finance and citizen as first-class lenses", () => {
    assert.deepEqual(resolveStaffLensQuery("?lens=finance"), shape({ lens: FINANCE_LENS }));
    assert.deepEqual(resolveStaffLensQuery("?lens=citizen"), shape({ lens: CITIZEN_LENS }));
  });

  it("routes every roster department to its own Not built view", () => {
    assert.deepEqual(ROSTER_LENS_IDS, ["public-works", "parks", "police", "fire-ems", "fleet"]);
    for (const lens of ROSTER_LENS_IDS) {
      assert.deepEqual(
        resolveStaffLensQuery(`?lens=${lens}`),
        shape({ lens, isRosterLens: true }),
        lens,
      );
    }
    assert.equal(ALL_LENS_IDS.length, 9);
  });

  it("carries an Overview tile's filter through raw, to whichever destination reads it", () => {
    /**
     * G-120. Unlike tab/atab/work, filter is not checked against a catalog:
     * the resolver serves every lens, and the filter vocabulary belongs to
     * whichever destination the tile named (development-services pipeline
     * states, plan review's own queue states, ...), not to this file.
     */
    assert.deepEqual(
      resolveStaffLensQuery("?lens=development-services&tab=pipeline&filter=active"),
      shape({ lens: DEVELOPMENT_SERVICES_LENS, isDevelopmentServices: true, tab: "pipeline", filter: "active" }),
    );
    assert.deepEqual(
      resolveStaffLensQuery("?work=review&filter=overdue"),
      shape({ work: REVIEW_WORK, isReviewWork: true, filter: "overdue" }),
    );
    // Absent is the empty string, never undefined, same as every other field here.
    assert.equal(resolveStaffLensQuery("").filter, "");
  });

  it("treats blank or unknown lens as city-manager", () => {
    assert.deepEqual(resolveStaffLensQuery("lens="), shape());
    assert.deepEqual(resolveStaffLensQuery("?lens=courts"), shape());
    assert.deepEqual(resolveStaffLensQuery("?lens=emergency-response"), shape());
  });

  it("mounts Plan Review with its own product top bar suppressed", () => {
    assert.equal(DEFAULT_PLAN_REVIEW_ORIGIN, "https://plan-review-app-ten.vercel.app");
    assert.equal(
      planReviewIframeSrc(DEFAULT_PLAN_REVIEW_ORIGIN),
      "https://plan-review-app-ten.vercel.app/?embed=1",
    );
    assert.equal(planReviewIframeSrc(), "https://plan-review-app-ten.vercel.app/?embed=1");
    assert.equal(
      planReviewIframeSrc("https://plan-review-app-ten.vercel.app/?foo=1"),
      "https://plan-review-app-ten.vercel.app/?foo=1&embed=1",
    );
  });

  it("gives Plan review one Work home so one nav item can be current", () => {
    assert.deepEqual(
      resolveStaffLensQuery("?work=review"),
      shape({ work: REVIEW_WORK, isReviewWork: true }),
    );
    assert.ok(WORK_IDS.includes(REVIEW_WORK));
  });

  it("treats ?work=files as the Files work view", () => {
    assert.deepEqual(
      resolveStaffLensQuery("?work=files"),
      shape({ work: FILES_WORK, isFilesWork: true }),
    );
    assert.equal(DEFAULT_SMART_FILES_ORIGIN, "https://smart-files-app.vercel.app");
    assert.equal(
      smartFilesIframeSrc(DEFAULT_SMART_FILES_ORIGIN),
      "https://smart-files-app.vercel.app/?embed=1",
    );
    assert.equal(
      smartFilesIframeSrc("https://smart-files-app.vercel.app/?foo=1"),
      "https://smart-files-app.vercel.app/?foo=1&embed=1",
    );
  });

  it("treats ?work=assets and ?work=connections as City views", () => {
    assert.deepEqual(
      resolveStaffLensQuery("?work=assets"),
      shape({ work: ASSETS_WORK, assetTab: "inventory" }),
    );
    assert.deepEqual(resolveStaffLensQuery("?work=connections"), shape({ work: CONNECTIONS_WORK }));
    assert.deepEqual(resolveStaffLensQuery("?work=people"), shape({ work: PEOPLE_WORK }));
    assert.deepEqual(resolveStaffLensQuery("?work=records"), shape({ work: RECORDS_WORK }));
  });

  it("resolves asset tabs only under the assets work view", () => {
    assert.deepEqual(ASSET_TABS, ["inventory", "map", "fixture"]);
    assert.equal(resolveStaffLensQuery("?work=assets&atab=fixture").assetTab, "fixture");
    assert.equal(resolveStaffLensQuery("?work=assets&atab=nope").assetTab, "inventory");
    assert.equal(resolveStaffLensQuery("?atab=fixture").assetTab, "");
  });
});
