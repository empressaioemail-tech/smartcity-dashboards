import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GOLD_PARCEL_NODE_ID, resolveStaffMapQuery } from "./staff-map.mjs";

/**
 * G-161. THE CLIENT'S CITY RESOLVER, MEASURED IN BOTH DIRECTIONS.
 *
 * These assertions used to PIN the default: a keyless query resolved to the demo
 * pack and the test asserted that as the contract. That is the behaviour this
 * lane deleted, so the clean arm has moved rather than disappeared - what is
 * asserted now is that a NAMED city survives untouched and that an UNNAMED one
 * resolves to "" and to nothing else, because the empty string is the only value
 * web/app.js can read as "no city" before it shows the no-city state.
 *
 * The parcel node keeps its default and that asymmetry is asserted on purpose
 * rather than left implied: GOLD_PARCEL_NODE_ID is the fixture the map is ABOUT,
 * while the city is whose records are being shown, and only one of those is a
 * question a default can answer.
 */
describe("staff map query", () => {
  it("resolves NO city when the address names none, and never a default one", () => {
    assert.equal(GOLD_PARCEL_NODE_ID, "48021:34137");
    assert.deepEqual(resolveStaffMapQuery(""), {
      parcelNodeId: GOLD_PARCEL_NODE_ID,
      cityKey: "",
    });
    assert.deepEqual(resolveStaffMapQuery(new URLSearchParams()), {
      parcelNodeId: GOLD_PARCEL_NODE_ID,
      cityKey: "",
    });
    assert.equal(
      resolveStaffMapQuery("").parcelNodeId,
      GOLD_PARCEL_NODE_ID,
      "the parcel fixture still defaults; the city is the thing that does not",
    );
  });

  it("lets ?parcelNodeId= override and carries an explicit cityKey through untouched", () => {
    assert.deepEqual(resolveStaffMapQuery("?parcelNodeId=48021:28286"), {
      parcelNodeId: "48021:28286",
      cityKey: "",
    });
    assert.deepEqual(resolveStaffMapQuery("parcelNodeId=48021:28286&cityKey=fixture-city"), {
      parcelNodeId: "48021:28286",
      cityKey: "fixture-city",
    });
  });

  it("treats a blank or whitespace value as naming nothing, on both parameters", () => {
    assert.deepEqual(resolveStaffMapQuery("parcelNodeId=&cityKey="), {
      parcelNodeId: GOLD_PARCEL_NODE_ID,
      cityKey: "",
    });
    /**
     * %20 is the case the route-level refusal also has to catch: a caller who
     * supplied a SPACE has not named a city, and trim-then-test is what keeps
     * that from being a city whose key is a blank.
     */
    assert.deepEqual(resolveStaffMapQuery("cityKey=%20"), {
      parcelNodeId: GOLD_PARCEL_NODE_ID,
      cityKey: "",
    });
  });
});
