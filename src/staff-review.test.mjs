import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CITY_MANAGER_LENS,
  CITIZEN_LENS,
  DEFAULT_PLAN_REVIEW_ORIGIN,
  DEVELOPMENT_SERVICES_LENS,
  FINANCE_LENS,
  planReviewIframeSrc,
  resolveStaffLensQuery,
} from "./staff-review.mjs";

describe("staff review query", () => {
  it("defaults GET / to city-manager, not development-services", () => {
    assert.deepEqual(resolveStaffLensQuery(""), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
      tab: "",
    });
    assert.deepEqual(resolveStaffLensQuery(new URLSearchParams()), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
      tab: "",
    });
  });

  it("treats ?lens=development-services as the staff reviewer", () => {
    assert.deepEqual(resolveStaffLensQuery("?lens=development-services"), {
      lens: DEVELOPMENT_SERVICES_LENS,
      isDevelopmentServices: true,
      tab: "pipeline",
    });
    assert.deepEqual(resolveStaffLensQuery("?lens=development-services&tab=review"), {
      lens: DEVELOPMENT_SERVICES_LENS,
      isDevelopmentServices: true,
      tab: "review",
    });
  });

  it("opens finance and citizen as first-class lenses", () => {
    assert.deepEqual(resolveStaffLensQuery("?lens=finance"), {
      lens: FINANCE_LENS,
      isDevelopmentServices: false,
      tab: "",
    });
    assert.deepEqual(resolveStaffLensQuery("?lens=citizen"), {
      lens: CITIZEN_LENS,
      isDevelopmentServices: false,
      tab: "",
    });
  });

  it("treats blank or unknown lens as city-manager", () => {
    assert.deepEqual(resolveStaffLensQuery("lens="), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
      tab: "",
    });
    assert.deepEqual(resolveStaffLensQuery("?lens=fleet"), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
      tab: "",
    });
  });

  it("names the live plan-review-app origin", () => {
    assert.equal(DEFAULT_PLAN_REVIEW_ORIGIN, "https://plan-review-app-ten.vercel.app");
    assert.equal(
      planReviewIframeSrc(DEFAULT_PLAN_REVIEW_ORIGIN),
      "https://plan-review-app-ten.vercel.app/",
    );
  });
});
