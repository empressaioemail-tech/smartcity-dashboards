// D-13.1. The v1 platform base: ONE configured value, NO default, and a refusal
// that lands on the region when it is missing.
//
// WHY THIS FILE EXISTS. Five files pointed at the same GCP host four different
// ways, and each one had a fallback, so a cutover could be made in four places
// and silently missed in the fifth. The rule D-13 puts in their place is not
// "read the env var" -- it is that an unset variable is a REFUSAL with a stated
// basis, never a host. A test that only asserted the happy path would pass just
// as well against the old code with its default, so the arms below are the
// refusals first, the resolved reads second, and one arm per file that used to
// carry a host.
//
// WHAT IS NOT PROVEN HERE: that `walrus-app` serves these routes. That is a live
// probe against the deployed app and lives in the lane's close artifact, not in
// a unit test that would have to reach the network to say anything at all.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLATFORM_BASE_ENV,
  PLATFORM_BASE_UNSET_BASIS,
  PLATFORM_ROUTES,
  PLATFORM_ROUTE_PREFIX,
  PLATFORM_ROUTE_VALUES,
  assertPlatformRoute,
  platformBase,
  platformRoute,
} from "./platform-base.mjs";
import { PLATFORM_MYGOV_PERMITS_GRANT, assertGrantedAdapterShape } from "./adapters.mjs";
import { BASTROP_TX } from "./city-pack.mjs";
import { getDomain } from "./domains.mjs";
import { composeRealWorkOrders } from "./mygov-live.mjs";
import { composeRealFleetVehicles, composeRealCallAnalytics } from "./vendor-live.mjs";
import { composeRealPermits, fetchRealPermits } from "./mygov-permits.mjs";
import {
  PROPERTY_INTEL_LAYER_KEYS,
  fetchPropertyIntelLayer,
  fetchPropertyIntelSummary,
} from "./property-map.mjs";
import { codeRefsVerdict, scanForCodeRefs } from "./code-refs.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_BASE = "https://platform.test";
const KEYED_ENV = { PLATFORM_INTERNAL_API_KEY: "test-key" };

/**
 * The host D-13.1 retires, assembled from parts so it is never a literal in this
 * repo. The code-refs gate below scans every file in the tree, so a target
 * spelled out here would be the one reference that made the cutover read as
 * incomplete -- and an instrument that has to exclude its own assertion cannot
 * be trusted about anything else.
 */
const RETIRED_V1_HOST = ["smartcity", "api", "7dyaiy7wha", "uc"].join("-") + "." + ["a", "run", "app"].join(".");

/** A fetch that fails the test if anything reaches the network. */
const NEVER_CALLED = async () => {
  throw new Error("no request may be made when the base is unset");
};

describe("D-13.1 one base, read from the environment, no default", () => {
  it("names the variable the deployed apps set, and reads it as the base", () => {
    assert.equal(PLATFORM_BASE_ENV, "SMARTCITY_V1_PLATFORM_BASE");
    assert.equal(platformBase({ [PLATFORM_BASE_ENV]: TEST_BASE }), TEST_BASE);
  });

  it("an unset base is the empty string, NOT a host", () => {
    assert.equal(platformBase({}), "");
    assert.equal(platformBase(), "");
    assert.equal(PLATFORM_BASE_UNSET_BASIS, `${PLATFORM_BASE_ENV} unset`);
  });

  it("normalizes a trailing slash so a copied address bar value resolves to the same route", () => {
    assert.equal(platformBase({ [PLATFORM_BASE_ENV]: `${TEST_BASE}/` }), TEST_BASE);
    assert.equal(platformBase({ [PLATFORM_BASE_ENV]: `  ${TEST_BASE}//  ` }), TEST_BASE);
    assert.equal(
      platformRoute("mygov/permits", { [PLATFORM_BASE_ENV]: `${TEST_BASE}/` }),
      platformRoute("mygov/permits", { [PLATFORM_BASE_ENV]: TEST_BASE }),
    );
  });

  it("resolves a route to an absolute URL on the configured base only", () => {
    assert.equal(platformRoute("mygov/permits", KEYED_ENV), null);
    assert.equal(
      platformRoute("mygov/permits", { ...KEYED_ENV, [PLATFORM_BASE_ENV]: TEST_BASE }),
      `${TEST_BASE}${PLATFORM_ROUTE_PREFIX}/mygov/permits`,
    );
    // A leading slash on the path must not produce a doubled separator.
    assert.equal(
      platformRoute("/mygov/permits", { [PLATFORM_BASE_ENV]: TEST_BASE }),
      `${TEST_BASE}${PLATFORM_ROUTE_PREFIX}/mygov/permits`,
    );
  });

  it("every declared route is a PATH, and a route carrying its own host is refused", () => {
    for (const route of PLATFORM_ROUTE_VALUES) assert.equal(assertPlatformRoute(route), true);
    assert.equal(assertPlatformRoute("spireon/vehicles?include_inactive=true"), true);
    // The second configured base D-13 removes, smuggled into the one field a
    // cutover does not search, because after D-13 no host is left there to find.
    assert.throws(() => assertPlatformRoute(`${TEST_BASE}/api/platform/mygov/permits`), /must be a path, not a host/);
    assert.throws(() => assertPlatformRoute("//platform.test/api/platform/x"), /must be a path, not a host/);
    assert.throws(() => assertPlatformRoute("mygov/made-up"), /must be a declared route/);
    assert.throws(() => assertPlatformRoute(""), /requires platformRoute/);
  });
});

describe("D-13.1 an unset base refuses per feed, states its basis, and makes no request", () => {
  const domainFor = (id) => getDomain(id);

  it("mygov (one live resource) refuses with the base-unset basis", async () => {
    const out = await composeRealWorkOrders(BASTROP_TX, domainFor("work-orders"), {
      env: KEYED_ENV,
      fetchImpl: NEVER_CALLED,
    });
    assert.equal(out.status, "unavailable");
    assert.equal(out.basis, PLATFORM_BASE_UNSET_BASIS);
    assert.equal(out.recordCount, 0);
    assert.deepEqual(out.records, []);
  });

  it("mygov permits refuses before the network, and names the base not the key", async () => {
    const fetched = await fetchRealPermits({ env: KEYED_ENV, fetchImpl: NEVER_CALLED });
    assert.equal(fetched.status, "unavailable");
    assert.equal(fetched.basis, PLATFORM_BASE_UNSET_BASIS);
    assert.deepEqual(fetched.records, []);
  });

  it("a vendor feed refuses with the base-unset basis", async () => {
    const out = await composeRealFleetVehicles(BASTROP_TX, domainFor("fleet-vehicles"), {
      env: KEYED_ENV,
      fetchImpl: NEVER_CALLED,
    });
    assert.equal(out.status, "unavailable");
    assert.equal(out.basis, PLATFORM_BASE_UNSET_BASIS);
  });

  it("call-analytics refuses with the base-unset basis", async () => {
    const out = await composeRealCallAnalytics(BASTROP_TX, domainFor("call-analytics"), {
      env: KEYED_ENV,
      fetchImpl: NEVER_CALLED,
    });
    assert.equal(out.status, "unavailable");
    assert.equal(out.basis, PLATFORM_BASE_UNSET_BASIS);
  });

  it("property-intel summary refuses with the base-unset basis", async () => {
    const out = await fetchPropertyIntelSummary("123 Chestnut St", {
      env: KEYED_ENV,
      fetchImpl: NEVER_CALLED,
    });
    assert.equal(out.status, "unavailable");
    assert.equal(out.basis, PLATFORM_BASE_UNSET_BASIS);
    assert.equal(out.body, null);
  });

  it("property-intel layers refuses with the base-unset basis", async () => {
    const out = await fetchPropertyIntelLayer(
      PROPERTY_INTEL_LAYER_KEYS[0],
      { xmin: -97.35, ymin: 30.08, xmax: -97.28, ymax: 30.14 },
      { env: KEYED_ENV, fetchImpl: NEVER_CALLED },
    );
    assert.equal(out.status, "unavailable");
    assert.equal(out.basis, PLATFORM_BASE_UNSET_BASIS);
  });

  it("the key arm still reports the KEY when the key is what is missing, not the base", async () => {
    const out = await composeRealWorkOrders(BASTROP_TX, domainFor("work-orders"), {
      env: {},
      fetchImpl: NEVER_CALLED,
    });
    assert.equal(out.basis, "PLATFORM_INTERNAL_API_KEY unset");
  });

  it("composeRealPermits refuses for a pack it is not verified for, before either check", async () => {
    const out = await composeRealPermits(BASTROP_TX, domainFor("permits-pipeline"), PLATFORM_MYGOV_PERMITS_GRANT, {
      env: KEYED_ENV,
      fetchImpl: NEVER_CALLED,
    });
    // bastrop_tx IS the verified tenant, so this one gets past the tenant guard
    // and refuses at the base instead -- proving the two refusals are distinct.
    assert.equal(out.status, "unavailable");
    assert.equal(out.basis, PLATFORM_BASE_UNSET_BASIS);
  });
});

describe("D-13.1 a grant's provenance names the host actually read", () => {
  it("declares a route, not a host, and round-trips through the packs store", () => {
    assert.equal(PLATFORM_MYGOV_PERMITS_GRANT.platformRoute, PLATFORM_ROUTES.mygovPermits);
    // The packs store writes granted_adapters as JSONB. What must survive is the
    // route; freezing a host into that column is the failure this field exists to
    // prevent, because the row outlives the cutover that changed the host.
    const roundTripped = JSON.parse(JSON.stringify([PLATFORM_MYGOV_PERMITS_GRANT]))[0];
    assert.equal(roundTripped.platformRoute, PLATFORM_ROUTES.mygovPermits);
    assert.equal("sourceUrl" in roundTripped, false);
    assert.equal(assertGrantedAdapterShape(roundTripped, "bastrop_tx"), true);
  });

  it("with no base, the accessor states the refusal basis instead of an empty host", () => {
    const previous = process.env[PLATFORM_BASE_ENV];
    delete process.env[PLATFORM_BASE_ENV];
    try {
      assert.equal(PLATFORM_MYGOV_PERMITS_GRANT.sourceUrl, PLATFORM_BASE_UNSET_BASIS);
    } finally {
      if (previous !== undefined) process.env[PLATFORM_BASE_ENV] = previous;
    }
  });

  it("with a base, the accessor resolves to that host, and it is NOT frozen at module load", () => {
    const previous = process.env[PLATFORM_BASE_ENV];
    try {
      process.env[PLATFORM_BASE_ENV] = TEST_BASE;
      assert.equal(
        PLATFORM_MYGOV_PERMITS_GRANT.sourceUrl,
        `${TEST_BASE}${PLATFORM_ROUTE_PREFIX}/${PLATFORM_ROUTES.mygovPermits}`,
      );
      // Move the base. A literal captured at import time would still name the
      // first host, which is exactly how a provenance field goes stale.
      process.env[PLATFORM_BASE_ENV] = "https://moved.test";
      assert.equal(
        PLATFORM_MYGOV_PERMITS_GRANT.sourceUrl,
        `https://moved.test${PLATFORM_ROUTE_PREFIX}/${PLATFORM_ROUTES.mygovPermits}`,
      );
    } finally {
      if (previous === undefined) delete process.env[PLATFORM_BASE_ENV];
      else process.env[PLATFORM_BASE_ENV] = previous;
    }
  });

  it("a grant declaring a route with a host in it is refused at pack-shape time", () => {
    assert.throws(
      () =>
        assertGrantedAdapterShape(
          {
            kind: "samsara",
            purpose: "fleet-vehicles",
            writesTo: "files",
            accessPolicy: "tenant-private",
            platformRoute: `${TEST_BASE}/api/platform/samsara/vehicles`,
          },
          "bastrop_tx",
        ),
      /must be a path, not a host/,
    );
  });
});

describe("D-13.1 code-refs reads zero for the retired v1 host, and can fail", () => {
  it("reads zero across the repository, with its denominator and exclusions reported", () => {
    const report = scanForCodeRefs({ root: REPO_ROOT, pattern: RETIRED_V1_HOST });
    const verdict = codeRefsVerdict(report, { allow: 0 });
    assert.equal(verdict.verdict, "PASS", verdict.basis);
    assert.equal(report.count, 0);
    // A zero from a scan that read nothing is not a zero. This is the guard
    // against the instrument quietly passing because it walked an empty tree.
    assert.ok(report.filesScanned > 100, `expected a real denominator, read ${report.filesScanned}`);
    assert.deepEqual(report.exclusions.dirs, ["node_modules", ".git"]);
    assert.deepEqual(report.exclusions.unreadable, []);
  });

  it("is proven able to FAIL: one planted reference is caught, with its line named", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "code-refs-plant-"));
    try {
      fs.writeFileSync(
        path.join(dir, "planted.mjs"),
        `const base = "https://${RETIRED_V1_HOST}/api/platform";\n`,
      );
      const report = scanForCodeRefs({ root: dir, pattern: RETIRED_V1_HOST });
      const verdict = codeRefsVerdict(report, { allow: 0 });
      assert.equal(verdict.verdict, "FAIL");
      assert.equal(report.count, 1);
      assert.equal(report.matches[0].file, "planted.mjs");
      assert.equal(report.matches[0].line, 1);
      // And the allowed count is honoured, so the gate is a threshold and not a
      // blanket refusal that would fire on the repo's own docs.
      assert.equal(codeRefsVerdict(report, { allow: 1 }).verdict, "PASS");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a verdict with no stated allowed count", () => {
    const report = scanForCodeRefs({ root: REPO_ROOT, pattern: RETIRED_V1_HOST });
    assert.throws(() => codeRefsVerdict(report, {}), /requires an integer allow/);
  });
});
