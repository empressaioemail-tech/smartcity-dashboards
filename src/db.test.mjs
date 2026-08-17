import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pingDb } from "./db.mjs";

describe("tenant-registry db", () => {
  it("reports unset when DATABASE_URL is empty", async () => {
    assert.deepEqual(await pingDb({}), { db: "unset" });
  });
});
