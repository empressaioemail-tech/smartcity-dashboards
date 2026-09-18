import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { server } from "./server.mjs";

/**
 * G-159. ONE ROUTE'S CITY DEFAULT, PROVEN BY VIOLATION.
 *
 * The preamble's rule 3 (BASTROP IS THE PROVING PACK, operator 2026-09-18) says
 * a route that takes `cityKey` REFUSES when it is missing, because a
 * `template-city` default silently serves demo data. The Finance lens route was
 * one of the eight places in this repo that defaulted, and it is the one G-159
 * fixes; the other seven are enumerated in that row's close as a finding.
 *
 * THIS FILE EXISTS BECAUSE THE OLD BEHAVIOUR WAS INDISTINGUISHABLE FROM THE
 * CORRECT ONE AT EVERY OTHER LAYER. A keyless request used to answer 200 with a
 * complete, well-formed finance payload - the demo pack's - so nothing in the
 * lens's own tests, the bake, or the served surface could tell a caller that no
 * pack was ever named. The only place the defect is visible is the wire, which
 * is why these assertions are HTTP-level and why the central one is a NEGATION:
 * the keyless response must not be able to be mistaken for a pack's states.
 */

const SAVED = {};
const KEYS = ["DASHBOARDS_API_KEY", "DATABASE_URL"];
let port;

before(
  () =>
    new Promise((resolve) => {
      for (const k of KEYS) {
        SAVED[k] = process.env[k];
        delete process.env[k];
      }
      server.listen(0, "127.0.0.1", () => {
        port = server.address().port;
        resolve();
      });
    }),
);

after(
  () =>
    new Promise((resolve, reject) => {
      for (const k of KEYS) {
        if (SAVED[k] == null) delete process.env[k];
        else process.env[k] = SAVED[k];
      }
      server.close((err) => (err ? reject(err) : resolve()));
    }),
);

const get = (qs) => fetch(`http://127.0.0.1:${port}/api/lenses/finance/sources${qs}`);

/** The four source ids the lens renders, which only a resolved pack can produce. */
const SOURCE_IDS = ["adopted-budget", "fund-ledger", "permit-fee-revenue", "department-spend"];

describe("G-159: the finance route refuses a missing cityKey", () => {
  it("refuses a request that names no pack, with a typed 400 and no payload", async () => {
    const res = await get("");
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "city_key_required");
    assert.match(body.message, /refuses without one/, "the refusal says what it is refusing and why");
    assert.equal(body.finance, undefined, "a refusal carries no finance payload");
  });

  it("refuses an empty and a whitespace cityKey the same way, so the check is about ABSENCE not falsiness", async () => {
    for (const qs of ["?cityKey=", "?cityKey=%20%20"]) {
      const res = await get(qs);
      assert.equal(res.status, 400, qs);
      assert.equal((await res.json()).error, "city_key_required", qs);
    }
  });

  it("THE VIOLATION: a keyless response cannot be read as any pack's finance states", async () => {
    /**
     * The old code answered this exact request with the demo pack's payload under
     * a 200. So the assertion is not only "it is not 200" - it is that NONE of
     * the things a reader would take as a city's finance position are present:
     * no finance object, no source states, and no money token anywhere.
     */
    const keyless = await get("");
    const text = await keyless.text();
    assert.notEqual(keyless.status, 200);
    assert.equal(/"finance"/.test(text), false, "a keyless response carries no finance block");
    for (const id of SOURCE_IDS) {
      assert.equal(text.includes(id), false, `${id} must not appear on a keyless response`);
    }
    assert.equal(/\$[0-9]/.test(text), false, "and it carries no money token");
  });

  it("still answers a NAMED pack, so the fix refuses an absence rather than refusing the route", async () => {
    const res = await get("?cityKey=template-city");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.finance, "a named pack still gets its finance states");
    for (const id of SOURCE_IDS) {
      assert.ok(
        body.finance.sources.some((s) => s.id === id),
        `${id} is missing from a resolved pack's payload`,
      );
    }
  });

  it("keeps a named-but-UNKNOWN pack distinguishable from a missing one", async () => {
    /**
     * Both are refusals and they are different findings: "you did not say which
     * city" is the caller's error to fix, "that city does not exist" is a
     * statement about the pack. Collapsing them would hide which one happened.
     */
    const unknown = await get("?cityKey=no-such-city");
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error, "unknown city pack");
  });

  it("does not loosen the access rule on the way past: a tenant-private pack still refuses an anonymous caller", async () => {
    const res = await get("?cityKey=bastrop_tx");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.finance, undefined, "an access refusal carries no payload either");
  });
});
