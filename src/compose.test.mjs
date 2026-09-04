import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeCityManager, PARCEL_NODE_ID_RE } from "./compose.mjs";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(handler) {
  return async (url, opts = {}) => handler(String(url), opts);
}

const VALID = "48021:34137";
const RETRIEVAL = "https://retrieval.example.invalid";
const FILES = "https://files.example.invalid";

function envWithMounts(extra = {}) {
  return {
    HAUSKA_RETRIEVAL_URL: RETRIEVAL,
    SMART_FILES_BACKEND_URL: FILES,
    SMARTSITE_EMBED_ORIGIN: "https://smartsite.cloud",
    ...extra,
  };
}

describe("city-manager compose", () => {
  it("accepts a five-digit FIPS parcel node id", () => {
    assert.equal(PARCEL_NODE_ID_RE.test(VALID), true);
    assert.equal(PARCEL_NODE_ID_RE.test("parcel-example"), false);
    assert.equal(PARCEL_NODE_ID_RE.test(""), false);
  });

  it("honest-empties when retrieval URL is unset, 404, or empty chain", async () => {
    const unset = await composeCityManager({
      parcelNodeId: VALID,
      env: { SMART_FILES_BACKEND_URL: "" },
      fetchImpl: mockFetch(() => {
        throw new Error("fetch must not run when retrieval URL is unset");
      }),
    });
    assert.equal(unset.atoms.status, "unavailable");
    assert.equal(unset.atoms.basis, "HAUSKA_RETRIEVAL_URL unset");
    assert.equal(unset.atoms.atomCount, 0);
    assert.equal("atoms" in unset.atoms, false);
    assert.equal(unset.smartsite.url.includes("parcelNodeId=48021%3A34137"), true);
    // G-114: the embed carries the composing city's own identity, not a bare
    // static origin -- defaults to DEFAULT_CITY_KEY since none was passed here.
    assert.equal(
      unset.planReview.url,
      "https://plan-review-app-ten.vercel.app/?embed=1&cityKey=template-city",
    );
    assert.equal(unset.smartFiles.contract, "embed");
    assert.equal(
      unset.smartFiles.url,
      "https://smart-files-app.vercel.app/?embed=1&cityKey=template-city",
    );
    assert.equal(unset.filesRoom.status, "unavailable");
    assert.equal(unset.filesRoom.basis, "SMART_FILES_BACKEND_URL unset");

    const notFound = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts(),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) return jsonResponse(404, { error: "not found" });
        if (url.includes("/api/smart-files/folders")) return jsonResponse(200, { folders: [] });
        throw new Error(`unexpected ${url}`);
      }),
    });
    assert.equal(notFound.atoms.status, "empty");
    assert.match(notFound.atoms.basis, /not found|404/);
    assert.equal(notFound.filesRoom.status, "empty");
    assert.equal(notFound.filesRoom.basis, "no folders for tenant:template-city");

    const emptyChain = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ HAUSKA_RETRIEVAL_API_KEY: "k" }),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) {
          return jsonResponse(200, {
            parcelNodeId: VALID,
            atoms: [],
            secretBodies: [{ entityType: "zoning-fact", body: { shouldNotLeak: true } }],
          });
        }
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(emptyChain.atoms.status, "empty");
    assert.equal(emptyChain.atoms.basis, "atom-chain returned no atoms");
    assert.equal(JSON.stringify(emptyChain).includes("shouldNotLeak"), false);
  });

  it("marks retrieval 401 as unavailable and never invents atoms", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ HAUSKA_RETRIEVAL_API_KEY: "bad" }),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) return jsonResponse(401, { error: "nope" });
        return jsonResponse(401, { error: "nope" });
      }),
    });
    assert.equal(composed.atoms.status, "unavailable");
    assert.equal(composed.atoms.basis, "retrieval auth refused");
    assert.equal(composed.atoms.atomCount, 0);
    assert.deepEqual(composed.atoms.types, []);
    assert.equal(composed.filesRoom.status, "unavailable");
    assert.equal(composed.filesRoom.basis, "files auth refused");
  });

  it("returns counts and types only when the chain is present", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "template-city",
      env: envWithMounts({
        HAUSKA_RETRIEVAL_API_KEY: "k",
        SMART_FILES_API_KEY: "f",
      }),
      fetchImpl: mockFetch((url, opts) => {
        if (url.includes("/atom-chain")) {
          assert.match(String(opts.headers?.Authorization || ""), /Bearer /);
          assert.match(url, /property-nodes\/48021%3A34137\/atom-chain$/);
          return jsonResponse(200, {
            parcelNodeId: VALID,
            atoms: [
              // accessPolicy is carried because the summary now REFUSES an atom
              // that declares none. These two are stand-ins for a readable chain
              // and the subject of this test is the count and the type list, so
              // they say what they are rather than relying on a permissive default.
              { entityType: "zoning-fact", accessPolicy: "public-free", body: { district: "SF-1", huge: "x".repeat(200) } },
              { entityType: "setback-rule", accessPolicy: "public-free", body: { front: 25 } },
            ],
          });
        }
        assert.equal(opts.headers?.Authorization, undefined);
        assert.match(url, /scopeType=tenant/);
        assert.match(url, /scopeId=template-city/);
        return jsonResponse(200, {
          folders: [
            { folderId: "folder:tenant:template-city:room", label: "Room", accessPolicy: "tenant-private" },
          ],
        });
      }),
    });
    assert.equal(composed.lensId, "city-manager");
    assert.equal(composed.atoms.status, "ok");
    assert.equal(composed.atoms.contract, "atom-read-http");
    assert.equal(composed.atoms.atomCount, 2);
    assert.deepEqual(composed.atoms.types, ["zoning-fact", "setback-rule"]);
    assert.equal(JSON.stringify(composed).includes("SF-1"), false);
    assert.equal(composed.filesRoom.status, "ok");
    assert.equal(composed.filesRoom.contract, "service-http");
    assert.equal(composed.filesRoom.folderCount, 1);
    assert.deepEqual(composed.filesRoom.folders, [
      { folderId: "folder:tenant:template-city:room", label: "Room" },
    ]);
    assert.equal(JSON.stringify(composed).includes("tenant-private"), false);
  });

  it("leaves SmartSite url empty when parcelNodeId is missing or invalid", async () => {
    const missing = await composeCityManager({
      env: envWithMounts(),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) throw new Error("must not call retrieval");
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(missing.smartsite.url, "");
    assert.equal(missing.smartsite.basis, "missing parcelNodeId");
    assert.equal(missing.atoms.status, "empty");
    assert.equal(missing.atoms.basis, "missing parcelNodeId");

    const invalid = await composeCityManager({
      parcelNodeId: "not-a-node",
      env: envWithMounts(),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) throw new Error("must not call retrieval");
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(invalid.smartsite.url, "");
    assert.equal(invalid.atoms.status, "empty");
    assert.equal(invalid.atoms.basis, "invalid parcelNodeId");
  });

  it("summarizes only public-free types; retrieval Bearer authenticates the product", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ HAUSKA_ENGINE_API_KEY: "engine-service" }),
      fetchImpl: mockFetch((url, opts) => {
        if (url.includes("/atom-chain")) {
          assert.equal(opts.headers?.Authorization, "Bearer engine-service");
          return jsonResponse(200, {
            parcelNodeId: VALID,
            atoms: [
              {
                did: "did:atom:zoning-fact:1",
                type: "zoning-fact",
                kind: "fact",
                accessPolicy: "public-free",
                payload: { district: "SF-1" },
              },
              {
                did: "did:atom:owner-fact:1",
                type: "owner-fact",
                kind: "fact",
                accessPolicy: "public-paid",
                payload: { ownerName: "LEAK-OWNER" },
              },
              {
                did: "did:atom:flood-hazard-fact:1",
                type: "flood-hazard-fact",
                kind: "fact",
                accessPolicy: "platform-internal",
                payload: { zone: "AE" },
              },
              {
                did: "did:atom:workspace:1",
                type: "workspace",
                kind: "workspace",
                accessPolicy: "tenant-private",
                payload: { secret: "LEAK-TENANT" },
              },
              {
                did: "did:atom:shared:1",
                type: "workspace",
                kind: "workspace",
                accessPolicy: "tenant-shared",
                payload: { secret: "LEAK-SHARED" },
              },
            ],
          });
        }
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(composed.atoms.status, "ok");
    assert.deepEqual(composed.atoms.types, ["zoning-fact"]);
    assert.equal(composed.atoms.atomCount, 1);
    assert.equal(composed.atoms.types.includes("owner-fact"), false);
    const dumped = JSON.stringify(composed);
    assert.equal(dumped.includes("LEAK-OWNER"), false);
    assert.equal(dumped.includes("SF-1"), false);
    assert.equal(dumped.includes("LEAK-TENANT"), false);
    assert.equal(dumped.includes("LEAK-SHARED"), false);
    assert.equal(dumped.includes("did:atom:"), false);
  });

  it("includes tenant-private types only for the matching pack subject", async () => {
    const chain = (url) => {
      if (url.includes("/atom-chain")) {
        return jsonResponse(200, {
          atoms: [
            { type: "zoning-fact", accessPolicy: "public-free" },
            { type: "workspace", accessPolicy: "tenant-private", payload: { secret: "LEAK-TENANT" } },
            { type: "owner-fact", accessPolicy: "public-paid", payload: { ownerName: "LEAK-OWNER" } },
          ],
        });
      }
      return jsonResponse(200, { folders: [] });
    };
    const matching = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "fixture-city",
      caller: { kind: "tenant", tenant: "fixture-city" },
      env: envWithMounts({ HAUSKA_ENGINE_API_KEY: "k" }),
      fetchImpl: mockFetch(chain),
    });
    assert.deepEqual(matching.atoms.types, ["zoning-fact", "workspace"]);
    assert.equal(matching.atoms.types.includes("owner-fact"), false);
    assert.equal(JSON.stringify(matching).includes("LEAK-TENANT"), false);
    const service = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "fixture-city",
      caller: { kind: "service" },
      env: envWithMounts({ HAUSKA_ENGINE_API_KEY: "k" }),
      fetchImpl: mockFetch(chain),
    });
    assert.deepEqual(service.atoms.types, ["zoning-fact"]);
  });

  /**
   * REPLACES "treats missing or empty accessPolicy as public-free", which
   * asserted the defect as the specification.
   *
   * An absent, blank or unrecognised accessPolicy used to return TRUE from
   * atomVisibleToCaller, so a real city's atoms with no policy set were readable
   * by an anonymous caller - and the test above pinned that as correct, which is
   * how a fail-open default survives a review. Absence is not a policy. The
   * value the old test expected was recognised by no authority: the atom
   * contract's accessPolicy union has five members and none of them is "unset".
   */
  it("refuses an atom whose accessPolicy is absent, blank or unrecognised", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ HAUSKA_RETRIEVAL_API_KEY: "retrieval-service" }),
      fetchImpl: mockFetch((url, opts) => {
        if (url.includes("/atom-chain")) {
          assert.equal(opts.headers?.Authorization, "Bearer retrieval-service");
          return jsonResponse(200, {
            atoms: [
              { type: "setback-rule", kind: "fact", payload: { front: 25 } },
              { type: "height-limit", kind: "fact", accessPolicy: "", payload: { maxFt: 35 } },
              { type: "impervious-cover", kind: "fact", accessPolicy: "   ", payload: { pct: 50 } },
              { type: "slope-fact", kind: "fact", accessPolicy: "unset", payload: { pct: 12 } },
              { type: "owner-fact", kind: "fact", accessPolicy: null, payload: { ownerName: "LEAK-NULL" } },
            ],
          });
        }
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(composed.atoms.atomCount, 0);
    assert.deepEqual(composed.atoms.types, []);
    /**
     * AND THE REFUSAL SAYS SO. A chain that answered with five atoms none of
     * which this caller may read is not an empty chain, and reporting it as one
     * would put a fabricated basis in front of the reader - the same defect the
     * refusal closes, one layer up. The count is deliberately absent from the
     * sentence: how many atoms are being withheld is what the gate protects.
     */
    assert.equal(composed.atoms.status, "empty");
    assert.equal(composed.atoms.basis, "atom-chain returned no atoms readable by this caller");
    assert.notEqual(composed.atoms.basis, "atom-chain returned no atoms");
    const dumped = JSON.stringify(composed);
    assert.equal(dumped.includes("maxFt"), false);
    assert.equal(dumped.includes("LEAK-NULL"), false);
  });

  /**
   * The other half of the same rule, so the refusal above is not a gate that
   * refuses everything. A declared public-free atom on the identical chain is
   * read, which means the count of zero above is the policy answering and not
   * the reader having stopped working.
   */
  it("still reads a declared public-free atom on a chain the rest of which is refused", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ HAUSKA_RETRIEVAL_API_KEY: "retrieval-service" }),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) {
          return jsonResponse(200, {
            atoms: [
              { type: "setback-rule", kind: "fact", payload: { front: 25 } },
              { type: "height-limit", kind: "fact", accessPolicy: "public-free", payload: { maxFt: 35 } },
            ],
          });
        }
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(composed.atoms.status, "ok");
    assert.equal(composed.atoms.atomCount, 1);
    assert.deepEqual(composed.atoms.types, ["height-limit"]);
  });

  it("does not send SMART_FILES_API_KEY on the unauthenticated files fetch", async () => {
    const folderAuths = [];
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ SMART_FILES_API_KEY: "files-secret" }),
      fetchImpl: mockFetch((url, opts) => {
        if (url.includes("/atom-chain")) return jsonResponse(200, { atoms: [] });
        folderAuths.push(opts.headers?.Authorization);
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(folderAuths.includes(undefined), true);
    assert.equal(JSON.stringify(composed).includes("files-secret"), false);
  });

  /**
   * THE AUTHENTICATED HALF, WHICH DID NOT EXIST.
   *
   * The test above is the fail-closed control on the anonymous path and it
   * stands unchanged. What it could not say is whether any other path existed,
   * and none did: composeCityManager passed the caller into readAtoms and
   * omitted it from readFiles, so a tenant subject reading a room addressed to
   * its own tenant scope was served the anonymous view of it. That is not a
   * missing feature, it is a silent downgrade - the request carried the scope of
   * an authenticated read and the credentials of an unauthenticated one.
   *
   * Entitlement is the pack subject rule, unchanged from canReadPack and
   * atomVisibleToCaller: the tenant whose key resolves to this pack, and nobody
   * else. Asserted here on all four callers so the boundary is measured rather
   * than assumed for three of them.
   */
  it("sends SMART_FILES_API_KEY only for the pack's own tenant subject", async () => {
    const seen = [];
    const run = (caller, cityKey) =>
      composeCityManager({
        parcelNodeId: VALID,
        cityKey,
        caller,
        env: envWithMounts({ SMART_FILES_API_KEY: "files-secret" }),
        fetchImpl: mockFetch((url, opts) => {
          if (url.includes("/atom-chain")) return jsonResponse(200, { atoms: [] });
          seen.push(opts.headers?.Authorization);
          return jsonResponse(200, {
            folders: [{ folderId: "folder:tenant:fixture-city:room", label: "Room" }],
          });
        }),
      });

    const subject = await run({ kind: "tenant", tenant: "fixture-city" }, "fixture-city");
    assert.equal(seen.at(-1), "Bearer files-secret");
    assert.equal(subject.filesRoom.status, "ok");
    assert.equal(subject.filesRoom.scopeId, "fixture-city");
    // The key authenticates the read; it never reaches the payload.
    assert.equal(JSON.stringify(subject).includes("files-secret"), false);

    // Every other caller stays on the unauthenticated path, including a tenant
    // reading somebody else's pack and the service bearer, which is the platform
    // rather than the tenant and is refused tenant-private content everywhere else.
    await run({ kind: "tenant", tenant: "other-city" }, "fixture-city");
    assert.equal(seen.at(-1), undefined);
    await run({ kind: "service" }, "fixture-city");
    assert.equal(seen.at(-1), undefined);
    await run({ kind: "anonymous" }, "fixture-city");
    assert.equal(seen.at(-1), undefined);
    await run(undefined, "fixture-city");
    assert.equal(seen.at(-1), undefined);
  });

  it("refuses rather than downgrading an entitled caller when no files key is configured", async () => {
    /**
     * Falling back to the anonymous fetch here would hand a tenant the public
     * view of its own room, labelled as its own room, and the deployment posture
     * would decide which one it got without changing a word of the answer. That
     * is the silent-degradation shape, so the read refuses and names the reason.
     */
    let called = false;
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "fixture-city",
      caller: { kind: "tenant", tenant: "fixture-city" },
      env: envWithMounts({ SMART_FILES_API_KEY: "" }),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) return jsonResponse(200, { atoms: [] });
        called = true;
        return jsonResponse(200, { folders: [{ folderId: "f", label: "Room" }] });
      }),
    });
    assert.equal(called, false, "an entitled caller must not fall through to the anonymous fetch");
    assert.equal(composed.filesRoom.status, "unavailable");
    assert.match(composed.filesRoom.basis, /SMART_FILES_API_KEY unset/);
    assert.match(composed.filesRoom.basis, /not served the unauthenticated view/);
    assert.equal(composed.filesRoom.folderCount, 0);
    assert.deepEqual(composed.filesRoom.folders, []);
  });

  it("does not denylist type names; public-free owner-fact stays visible", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ HAUSKA_ENGINE_API_KEY: "k" }),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) {
          return jsonResponse(200, {
            atoms: [
              {
                type: "owner-fact",
                accessPolicy: "public-free",
                payload: { ownerName: "STILL-NO-BODY" },
              },
            ],
          });
        }
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.deepEqual(composed.atoms.types, ["owner-fact"]);
    assert.equal(composed.atoms.atomCount, 1);
    assert.equal(JSON.stringify(composed).includes("STILL-NO-BODY"), false);
  });

  it("names files 401 as unavailable with files auth refused", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts({ SMART_FILES_API_KEY: "files-secret" }),
      fetchImpl: mockFetch((url, opts) => {
        if (url.includes("/atom-chain")) return jsonResponse(200, { atoms: [] });
        assert.equal(opts.headers?.Authorization, undefined);
        return jsonResponse(401, { error: "nope" });
      }),
    });
    assert.equal(composed.filesRoom.status, "unavailable");
    assert.equal(composed.filesRoom.basis, "files auth refused");
    assert.equal(composed.filesRoom.folderCount, 0);
    assert.deepEqual(composed.filesRoom.folders, []);
  });

  it("G-114: two different cities embed two different plan-review/files URLs", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.includes("/atom-chain")) return jsonResponse(200, { atoms: [] });
      return jsonResponse(200, { folders: [] });
    });
    const cityA = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "template-city",
      env: envWithMounts(),
      fetchImpl,
    });
    const cityB = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "bastrop",
      env: envWithMounts(),
      fetchImpl,
    });
    assert.notEqual(cityA.planReview.url, cityB.planReview.url);
    assert.notEqual(cityA.smartFiles.url, cityB.smartFiles.url);
    assert.match(cityA.planReview.url, /cityKey=template-city/);
    assert.match(cityB.planReview.url, /cityKey=bastrop/);
    assert.match(cityA.smartFiles.url, /cityKey=template-city/);
    assert.match(cityB.smartFiles.url, /cityKey=bastrop/);
  });

  it("is G-13 mounts only; not a vendor JSON lens", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      env: envWithMounts(),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) return jsonResponse(200, { atoms: [] });
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.deepEqual(Object.keys(composed).sort(), [
      "atoms",
      "cityKey",
      "filesRoom",
      "lensId",
      "meetings",
      "parcelNodeId",
      "planReview",
      "smartFiles",
      "smartsite",
    ]);
    assert.equal(composed.meetings.contract, "files-record-read");
    assert.equal("mygov" in composed.meetings, false);
    assert.equal(composed.planReview.contract, "embed");
    assert.equal(
      composed.planReview.url,
      "https://plan-review-app-ten.vercel.app/?embed=1&cityKey=template-city",
    );
    assert.equal(composed.smartFiles.contract, "embed");
    assert.equal(
      composed.smartFiles.url,
      "https://smart-files-app.vercel.app/?embed=1&cityKey=template-city",
    );
    assert.equal("mygov" in composed, false);
    assert.equal("samsara" in composed, false);
    assert.equal("permits" in composed, false);
    assert.equal("fleet" in composed, false);
  });
});

describe("G-117 native property map, conditional map-stage composition", () => {
  it("defaults to false: omitting nativePropertyMap composes the exact SmartSite embed as before -- byte-identical to every pre-G-117 test above", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "template-city",
      env: envWithMounts(),
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) throw new Error("must not call retrieval");
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(composed.smartsite.contract, "embed");
    assert.equal(composed.smartsite.url, "https://smartsite.cloud/?parcelNodeId=48021%3A34137");
    assert.equal("basis" in composed.smartsite, false);
  });

  it("nativePropertyMap: false (explicit) is identical to the default -- fixture packs are unaffected by the new param existing at all", async () => {
    const withFalse = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "template-city",
      env: envWithMounts(),
      nativePropertyMap: false,
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) throw new Error("must not call retrieval");
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(withFalse.smartsite.url, "https://smartsite.cloud/?parcelNodeId=48021%3A34137");
  });

  it("nativePropertyMap: true composes this product's OWN page, not an external SmartSite embed, carrying cityKey", async () => {
    const composed = await composeCityManager({
      parcelNodeId: VALID,
      cityKey: "bastrop_tx",
      env: envWithMounts(),
      nativePropertyMap: true,
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) throw new Error("must not call retrieval");
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(composed.smartsite.contract, "embed");
    assert.equal(composed.smartsite.url, "/property-map.html?cityKey=bastrop_tx");
    // Root-relative, same-origin: never the external smartsite.cloud host.
    assert.equal(composed.smartsite.url.includes("smartsite.cloud"), false);
    assert.equal(composed.smartsite.basis, "native property map (G-117)");
  });

  it("nativePropertyMap: true still composes it even with no parcelNodeId at all -- the native page has its own search box and does not depend on one", async () => {
    const composed = await composeCityManager({
      cityKey: "bastrop_tx",
      env: envWithMounts(),
      nativePropertyMap: true,
      fetchImpl: mockFetch((url) => {
        if (url.includes("/atom-chain")) throw new Error("must not call retrieval");
        return jsonResponse(200, { folders: [] });
      }),
    });
    assert.equal(composed.smartsite.url, "/property-map.html?cityKey=bastrop_tx");
  });
});
