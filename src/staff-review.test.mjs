import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CITY_MANAGER_LENS,
  DEFAULT_PLAN_REVIEW_ORIGIN,
  DEVELOPMENT_SERVICES_LENS,
  planReviewIframeSrc,
  resolveStaffLensQuery,
} from "./staff-review.mjs";

describe("staff review query", () => {
  it("defaults GET / to city-manager, not development-services", () => {
    assert.deepEqual(resolveStaffLensQuery(""), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
    });
    assert.deepEqual(resolveStaffLensQuery(new URLSearchParams()), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
    });
  });

  it("treats ?lens=development-services as the staff reviewer", () => {
    assert.deepEqual(resolveStaffLensQuery("?lens=development-services"), {
      lens: DEVELOPMENT_SERVICES_LENS,
      isDevelopmentServices: true,
    });
  });

  it("treats blank or unknown lens as city-manager", () => {
    assert.deepEqual(resolveStaffLensQuery("lens="), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
    });
    assert.deepEqual(resolveStaffLensQuery("?lens=finance"), {
      lens: CITY_MANAGER_LENS,
      isDevelopmentServices: false,
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
