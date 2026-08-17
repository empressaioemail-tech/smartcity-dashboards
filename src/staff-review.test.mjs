import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CITY_MANAGER_LENS,
  CITIZEN_LENS,
  DEFAULT_PLAN_REVIEW_ORIGIN,
  DEFAULT_SMART_FILES_ORIGIN,
  DEVELOPMENT_SERVICES_LENS,
  FILES_WORK,
  FINANCE_LENS,
  planReviewIframeSrc,
  resolveStaffLensQuery,
  smartFilesIframeSrc,
} from "./staff-review.mjs";

describe("staff review query", () => {
  it("defaults GET / to city-manager, not development-services", () => {
    assert.deepEqual(resolveStaffLensQuery(""), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
      isFilesWork: false,
      tab: "",
      work: "",
    });
    assert.deepEqual(resolveStaffLensQuery(new URLSearchParams()), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
      isFilesWork: false,
      tab: "",
      work: "",
    });
  });

  it("treats ?lens=development-services as the staff reviewer", () => {
    assert.deepEqual(resolveStaffLensQuery("?lens=development-services"), {
      lens: DEVELOPMENT_SERVICES_LENS,
      isDevelopmentServices: true,
      isFilesWork: false,
      tab: "pipeline",
      work: "",
    });
    assert.deepEqual(resolveStaffLensQuery("?lens=development-services&tab=review"), {
      lens: DEVELOPMENT_SERVICES_LENS,
      isDevelopmentServices: true,
      isFilesWork: false,
      tab: "review",
      work: "",
    });
  });

  it("opens finance and citizen as first-class lenses", () => {
    assert.deepEqual(resolveStaffLensQuery("?lens=finance"), {
      lens: FINANCE_LENS,
      isDevelopmentServices: false,
      isFilesWork: false,
      tab: "",
      work: "",
    });
    assert.deepEqual(resolveStaffLensQuery("?lens=citizen"), {
      lens: CITIZEN_LENS,
      isDevelopmentServices: false,
      isFilesWork: false,
      tab: "",
      work: "",
    });
  });

  it("treats blank or unknown lens as city-manager", () => {
    assert.deepEqual(resolveStaffLensQuery("lens="), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
      isFilesWork: false,
      tab: "",
      work: "",
    });
    assert.deepEqual(resolveStaffLensQuery("?lens=fleet"), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
      isFilesWork: false,
      tab: "",
      work: "",
    });
  });

  it("names the live plan-review-app origin", () => {
    assert.equal(DEFAULT_PLAN_REVIEW_ORIGIN, "https://plan-review-app-ten.vercel.app");
    assert.equal(
      planReviewIframeSrc(DEFAULT_PLAN_REVIEW_ORIGIN),
      "https://plan-review-app-ten.vercel.app/",
    );
  });

  it("treats ?work=files as the Files work view", () => {
    assert.deepEqual(resolveStaffLensQuery("?work=files"), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
      isFilesWork: true,
      tab: "",
      work: FILES_WORK,
    });
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
});
