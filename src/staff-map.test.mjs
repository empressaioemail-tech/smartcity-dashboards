import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GOLD_PARCEL_NODE_ID,
  DEFAULT_CITY_KEY,
  resolveStaffMapQuery,
} from "./staff-map.mjs";

describe("staff map query", () => {
  it("defaults GET / to gold Bastrop parcel on template-city", () => {
    assert.equal(GOLD_PARCEL_NODE_ID, "48021:34137");
    assert.deepEqual(resolveStaffMapQuery(""), {
      parcelNodeId: "48021:34137",
      cityKey: DEFAULT_CITY_KEY,
    });
    assert.deepEqual(resolveStaffMapQuery(new URLSearchParams()), {
      parcelNodeId: "48021:34137",
      cityKey: "template-city",
    });
  });

  it("lets ?parcelNodeId= override and keeps template-city unless cityKey is set", () => {
    assert.deepEqual(resolveStaffMapQuery("?parcelNodeId=48021:28286"), {
      parcelNodeId: "48021:28286",
      cityKey: "template-city",
    });
    assert.deepEqual(
      resolveStaffMapQuery("parcelNodeId=48021:28286&cityKey=fixture-city"),
      {
        parcelNodeId: "48021:28286",
        cityKey: "fixture-city",
      },
    );
  });

  it("treats blank query values as missing, not as a blank compose", () => {
    assert.deepEqual(resolveStaffMapQuery("parcelNodeId=&cityKey="), {
      parcelNodeId: "48021:34137",
      cityKey: "template-city",
    });
  });
});
