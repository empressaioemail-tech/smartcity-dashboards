import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pingDb } from "./db.mjs";
import { getPacksStore } from "./city-pack.mjs";

describe("tenant-registry db", () => {
  it("reports unset when DATABASE_URL is empty", async () => {
    assert.deepEqual(await pingDb({}), { db: "unset" });
    assert.equal(getPacksStore({}), "memory");
  });

  it("reports neon packs store when DATABASE_URL is this product's Neon", () => {
    assert.equal(
      getPacksStore({
        DATABASE_URL:
          "postgres://u:p@ep-example-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require",
      }),
      "neon",
    );
  });
});
