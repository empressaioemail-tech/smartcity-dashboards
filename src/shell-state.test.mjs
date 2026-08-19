/**
 * ---------------------------------------------------------------------------
 * G-90. THE TOP BAR'S CLAIMS ABOUT ITSELF.
 *
 * Five of the shell's controls have a dependency that does not exist yet, and
 * the honest rendering of that is a disabled control with a stated reason. The
 * failure mode of a stated reason is the one this program keeps paying for: it
 * is written by hand, it is true on the day it is typed, and nothing ever checks
 * it again.
 *
 * So the reasons are derived, and this file is what makes the derivation
 * trustworthy. EVERY capability is exercised in BOTH states - available and
 * not - because a gate that has only ever been observed in one state has not
 * been observed (DEV_PROCESS 2.2), and a permanently-false capability is
 * indistinguishable from a broken one.
 * ---------------------------------------------------------------------------
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { ADAPTER_KINDS } from "./adapters.mjs";
import { packSources } from "./city-identity.mjs";
import {
  CALLER_KINDS,
  FEEDBACK_MAX_CHARS,
  deliverFeedback,
  feedbackDestination,
  notificationState,
  shellCapabilities,
  shellSession,
  shellState,
} from "./shell-state.mjs";
import { server } from "./server.mjs";

const PACK = Object.freeze({
  cityKey: "template-city",
  displayName: "Template City",
  accessPolicy: "public-free",
  environment: "demo",
  grantedAdapters: [],
});

/** Every capability id the shell renders, read off the resolver rather than
 *  listed here, so a capability added and never rendered fails loudly. */
const CAPABILITY_IDS = Object.keys(shellCapabilities({ session: shellSession(null), env: {} }));

describe("G-90 the session, and what it refuses to claim", () => {
  it("resolves every caller kind the tenancy resolver can return, and no others", () => {
    /**
     * The kinds are listed in src/shell-state.mjs rather than pattern-matched,
     * so a kind added to src/tenancy.mjs and not taught here resolves to
     * anonymous rather than to a confident wrong sentence. This is the assertion
     * that makes the list a contract instead of a comment.
     */
    assert.deepEqual(CALLER_KINDS, ["anonymous", "tenant", "service"]);
    for (const kind of CALLER_KINDS) {
      const session = shellSession({ kind, tenant: "template-city" });
      assert.equal(session.kind, kind);
      assert.ok(session.label, `${kind} has no label`);
      assert.ok(session.basis, `${kind} has no basis`);
    }
    // An unknown kind degrades to anonymous, which is the fail-closed direction.
    assert.equal(shellSession({ kind: "root" }).kind, "anonymous");
    assert.equal(shellSession(null).kind, "anonymous");
    assert.equal(shellSession(undefined).kind, "anonymous");
  });

  it("never calls an identified caller a signed-in person", () => {
    /**
     * THE DISTINCTION THIS FILE EXISTS FOR. G-11 settled that a city pack is the
     * tenant and that an identified caller is a product key whose
     * jurisdiction_tenant equals the cityKey - a machine credential naming a
     * TENANT. Collapsing that into "signed in" would put My profile in front of
     * a request with no person behind it, which is fabricated presence wearing
     * an auth costume.
     */
    for (const kind of CALLER_KINDS) {
      const session = shellSession({ kind, tenant: "template-city" });
      assert.equal(session.staffUser, false, `${kind} must not resolve to a staff user`);
      assert.equal(session.identified, kind !== "anonymous");
      assert.ok(session.staffUserBasis, "the absence of a staff user must carry its basis");
    }
    assert.equal(shellSession({ kind: "anonymous" }).identified, false);
  });
});

describe("G-90 capabilities are derived, and every one is proven able to fire", () => {
  it("states a reason for every unavailable capability, and names what would change it", () => {
    const caps = shellCapabilities({ session: shellSession(null), env: {} });
    for (const id of CAPABILITY_IDS) {
      assert.equal(typeof caps[id].available, "boolean", id);
      assert.ok(caps[id].basis, `${id} is unavailable with no stated reason`);
      assert.equal(caps[id].available, false, `${id} is available on an empty environment`);
    }
    // The three that a deployment can turn on name the variable that turns them
    // on, so a reader is one step from acting rather than reading source.
    assert.match(caps.signIn.basis, /SHELL_IDENTITY_PROVIDER/);
    assert.match(caps.support.basis, /SHELL_SUPPORT_URL/);
    assert.match(caps.feedback.basis, /FEEDBACK_DESTINATION/);
    /**
     * And the two that no variable can turn on say so plainly rather than
     * naming one nobody can set. Record search is gated by a BUILD, and the
     * account entries by a session. A basis that names an unsettable variable
     * would be a worse lie than no basis at all.
     */
    assert.equal(/[A-Z]{3,}_[A-Z_]+/.test(caps.recordSearch.basis), false, caps.recordSearch.basis);
    assert.equal(/[A-Z]{3,}_[A-Z_]+/.test(caps.account.basis), false, caps.account.basis);
  });

  it("turns each configuration-gated capability ON, one variable at a time", () => {
    /**
     * ARM B for the configuration half. Each variable is set ALONE, and only its
     * own capability is asserted to flip - so a resolver that turned everything
     * on together, or that keyed the wrong capability to the wrong variable,
     * fails here. A mis-keyed pair keeps every set identical and is exactly what
     * a "some capability is available" assertion is blind to.
     */
    const session = shellSession(null);
    const pairs = [
      ["SHELL_IDENTITY_PROVIDER", "https://idp.test", "signIn"],
      ["SHELL_SUPPORT_URL", "https://support.test", "support"],
      ["FEEDBACK_DESTINATION", "https://hooks.test/feedback?token=secret", "feedback"],
    ];
    for (const [name, value, id] of pairs) {
      const caps = shellCapabilities({ session, env: { [name]: value } });
      assert.equal(caps[id].available, true, `${name} did not enable ${id}`);
      for (const other of CAPABILITY_IDS) {
        if (other === id) continue;
        assert.equal(caps[other].available, false, `${name} also enabled ${other}`);
      }
    }
    // Whitespace is not configuration. A variable set to spaces is unset.
    assert.equal(shellCapabilities({ session, env: { SHELL_SUPPORT_URL: "   " } }).support.available, false);
  });

  it("echoes the support link and no other configured value, because one of them is a secret", () => {
    /**
     * A FINDING FROM WRITING THIS TEST, kept as a control rather than fixed and
     * forgotten. The first draft of the resolver put every configured value into
     * its basis, which is right for the support URL - that IS the link a person
     * clicks - and wrong for a feedback destination, which is typically a signed
     * webhook whose URL carries the secret. The whole payload is served to an
     * anonymous browser.
     *
     * So the rule is: the support URL may appear; the identity provider and the
     * feedback destination may not, at any depth of the response. Both
     * directions are asserted, because "nothing is echoed" would be satisfied by
     * a resolver that had also stopped giving the support link.
     */
    const env = {
      SHELL_IDENTITY_PROVIDER: "https://idp.test/realm",
      SHELL_SUPPORT_URL: "https://support.test/desk",
      FEEDBACK_DESTINATION: "https://hooks.test/feedback?token=SHOULD-NOT-APPEAR",
    };
    const payload = JSON.stringify(
      shellState({ caller: { kind: "anonymous" }, pack: PACK, env }),
    );
    assert.equal(payload.includes("SHOULD-NOT-APPEAR"), false, "the feedback destination leaked into the shell payload");
    assert.equal(payload.includes(env.FEEDBACK_DESTINATION), false);
    assert.equal(payload.includes(env.SHELL_IDENTITY_PROVIDER), false);
    assert.ok(payload.includes(env.SHELL_SUPPORT_URL), "the support link is the one value that is meant to travel");
  });

  it("turns the session-gated capabilities ON when a staff session can exist", () => {
    /**
     * ARM B for the session half, and it is the one branch no deployment can
     * reach today. Exercising it is the difference between a capability that is
     * false and a capability that is dead: the account entries and sign-out
     * enable themselves the day src/tenancy.mjs can resolve a person, with no
     * second edit here.
     */
    const staff = { ...shellSession(null), staffUser: true, identified: true };
    const caps = shellCapabilities({ session: staff, env: {} });
    assert.equal(caps.account.available, true);
    assert.equal(caps.signOut.available, true);
    assert.equal(caps.signIn.available, false, "a session already open must not offer sign in");
    assert.match(caps.signIn.basis, /already open/);
    // Record search stays false, because it is gated by a build and not a session.
    assert.equal(caps.recordSearch.available, false);
  });

  it("distinguishes an identified caller from a person when it explains sign out", () => {
    const anonymous = shellCapabilities({ session: shellSession({ kind: "anonymous" }), env: {} });
    const tenant = shellCapabilities({ session: shellSession({ kind: "tenant", tenant: "x" }), env: {} });
    assert.equal(anonymous.signOut.available, false);
    assert.equal(tenant.signOut.available, false);
    assert.notEqual(
      anonymous.signOut.basis,
      tenant.signOut.basis,
      "two different situations must not share one sentence",
    );
    assert.match(tenant.signOut.basis, /request header/);
    assert.match(anonymous.signOut.basis, /no staff session to end/);
  });
});

describe("G-90 notifications state an absence rather than showing an empty list", () => {
  it("derives the basis from the pack's own grants and carries its counting rule", () => {
    const state = notificationState(PACK);
    assert.deepEqual(state.items, []);
    assert.ok(state.basis);
    assert.ok(state.rule);
    // The figure in the basis is the one packSources counts, not a second copy.
    const sources = packSources(PACK);
    assert.ok(state.basis.includes(sources.label), `${state.basis} does not carry ${sources.label}`);
    assert.equal(state.rule, sources.rule);
    assert.match(sources.rule, new RegExp(`of ${ADAPTER_KINDS.length} in the catalog`));
  });

  it("changes its sentence when the pack changes, so it is derived and not written", () => {
    /**
     * Proven able to fire. A pack with a grant must produce a DIFFERENT basis
     * from a pack with none; a hardcoded sentence would produce the same one and
     * pass every assertion above.
     */
    const granted = { ...PACK, grantedAdapters: [{ kind: ADAPTER_KINDS[0].id }] };
    const empty = notificationState(PACK).basis;
    const withGrant = notificationState(granted).basis;
    assert.notEqual(empty, withGrant);
    assert.match(empty, /no adapter kind is granted/);
    assert.match(withGrant, /no granted adapter kind writes notifications/);
  });

  it("sends no count of any kind, at any depth", () => {
    /**
     * A count is the one thing a notification bell is expected to fabricate, so
     * the cheapest guarantee that the surface cannot render one is that the
     * server never sends one. Walked recursively rather than checked at the top
     * level, because a count nested one object down is still a count.
     *
     * Counting rule: every key in the whole response, recursively, split into
     * camelCase WORDS and matched against the set below. Words rather than
     * substrings, and that is not fastidiousness - the first draft matched
     * substrings and fired on `capabilities.account`, which contains "count" and
     * is not a count. Measure the class you are reporting (DEV_PROCESS 1.3).
     *
     * `items` is allowed to exist and to be empty; its LENGTH is a fact about a
     * list that was actually resolved, which is not the same as a number sent to
     * be displayed.
     */
    const COUNT_WORDS = new Set(["count", "counts", "unread", "badge", "total", "new", "pending"]);
    const state = shellState({ caller: { kind: "anonymous" }, pack: PACK, env: {} });
    const offenders = [];
    const walk = (node, path) => {
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        const words = key
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean);
        if (words.some((word) => COUNT_WORDS.has(word))) offenders.push(`${path}.${key}`);
        walk(value, `${path}.${key}`);
      }
    };
    walk(state, "shell");
    assert.deepEqual(offenders, []);
    // Proven able to fire, so the empty result above is a determination.
    const injected = { ...state, notifications: { ...state.notifications, unreadCount: 3 } };
    offenders.length = 0;
    walk(injected, "shell");
    assert.deepEqual(offenders, ["shell.notifications.unreadCount"]);
  });

  it("invents no freshness anywhere in the shell answer", () => {
    // The standing rule, applied to the one new payload on this surface.
    const text = JSON.stringify(shellState({ caller: { kind: "anonymous" }, pack: PACK, env: {} }));
    assert.equal(/last sync|last read|last updated|just now|ago\b/i.test(text), false, text);
  });
});

describe("G-90 feedback delivery, where accepted means delivered", () => {
  it("refuses with a stated reason when no destination is configured", async () => {
    assert.equal(feedbackDestination({}).on, false);
    const out = await deliverFeedback({ body: { message: "the map is blank" }, env: {} });
    assert.equal(out.accepted, false);
    assert.equal(out.status, 503);
    assert.match(out.basis, /FEEDBACK_DESTINATION/);
  });

  it("delivers, and only calls it accepted when the destination confirmed it", async () => {
    /**
     * ARM B for the whole endpoint. Injected rather than networked, so the happy
     * path and both failure paths are exercised on every CI run rather than
     * being a branch nobody has ever executed.
     */
    const env = { FEEDBACK_DESTINATION: "https://hooks.test/feedback" };
    const sent = [];
    const ok = await deliverFeedback({
      body: { message: "the map is blank", surface: "?lens=finance", cityKey: "template-city" },
      env,
      fetchImpl: async (url, init) => {
        sent.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 202 };
      },
    });
    assert.equal(ok.accepted, true);
    assert.equal(ok.status, 202);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, env.FEEDBACK_DESTINATION);
    assert.deepEqual(sent[0].body, {
      message: "the map is blank",
      surface: "?lens=finance",
      cityKey: "template-city",
    });

    const rejected = await deliverFeedback({
      body: { message: "x" },
      env,
      fetchImpl: async () => ({ ok: false, status: 500 }),
    });
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.status, 502);
    assert.match(rejected.basis, /answered 500/);

    const threw = await deliverFeedback({
      body: { message: "x" },
      env,
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });
    assert.equal(threw.accepted, false);
    assert.match(threw.basis, /could not be reached/);
  });

  it("refuses an empty or oversized report rather than sending nothing usefully", async () => {
    const env = { FEEDBACK_DESTINATION: "https://hooks.test/feedback" };
    const fetchImpl = async () => {
      throw new Error("the destination must not be called");
    };
    for (const message of ["", "   ", undefined]) {
      const out = await deliverFeedback({ body: { message }, env, fetchImpl });
      assert.equal(out.accepted, false);
      assert.equal(out.status, 400);
      assert.match(out.basis, /empty/);
    }
    const long = "x".repeat(FEEDBACK_MAX_CHARS + 1);
    const out = await deliverFeedback({ body: { message: long }, env, fetchImpl });
    assert.equal(out.accepted, false);
    assert.equal(out.status, 400);
    assert.match(out.basis, new RegExp(`${FEEDBACK_MAX_CHARS + 1} characters`));
  });
});

describe("G-90 the shell routes", () => {
  let port;
  const saved = {};
  const KEYS = ["DASHBOARDS_API_KEY", "DATABASE_URL", "FEEDBACK_DESTINATION", "SHELL_SUPPORT_URL", "SHELL_IDENTITY_PROVIDER"];

  before(
    () =>
      new Promise((resolve) => {
        for (const k of KEYS) saved[k] = process.env[k];
        for (const k of KEYS) delete process.env[k];
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
          if (saved[k] == null) delete process.env[k];
          else process.env[k] = saved[k];
        }
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  const get = (path) => fetch(`http://127.0.0.1:${port}${path}`);

  it("answers GET /api/shell for the anonymous visitor it exists for", async () => {
    /**
     * Anonymous is the DEFAULT path on this product and the whole shell must
     * work on it. G-78 shipped a demo that refused its own records to the
     * anonymous visitor it exists for; this route is gated on the same
     * packContentReadStatus that fix landed on, and this is the assertion that
     * says so rather than assuming it.
     */
    const res = await get("/api/shell?cityKey=template-city");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.session.kind, "anonymous");
    assert.equal(body.session.staffUser, false);
    assert.ok(body.session.basis);
    for (const id of CAPABILITY_IDS) {
      assert.equal(body.capabilities[id].available, false, id);
      assert.ok(body.capabilities[id].basis, id);
    }
    assert.deepEqual(body.notifications.items, []);
    assert.ok(body.notifications.basis);
    assert.ok(body.notifications.rule);
  });

  it("names an unknown pack rather than inventing a shell for it", async () => {
    const res = await get("/api/shell?cityKey=nowhere-city");
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "unknown city pack" });
  });

  it("POST /api/feedback answers 503 with its reason, and never a thank-you", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "the queue is empty and I expected rows" }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.accepted, false);
    assert.match(body.basis, /FEEDBACK_DESTINATION/);
    assert.equal(/thank|thanks|received|got it/i.test(body.basis), false, body.basis);
  });

  it("states that a malformed body was not readable rather than dropping it", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.accepted, false);
    assert.match(body.basis, /not readable JSON/);
  });

  it("answers an oversized body instead of resetting the connection", async () => {
    /**
     * The body read is bounded, because an unbounded read on a public POST is a
     * memory-exhaustion seam. What is asserted here is the SECOND half of that:
     * the client gets a stated reason.
     *
     * The first draft called req.destroy() on the overrun, which tears down the
     * socket the response still has to be written to - so the honest 400 would
     * have gone to a dead socket and the client would have seen a connection
     * reset, which is indistinguishable from the server falling over. Draining
     * and discarding keeps the answer deliverable.
     */
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(64 * 1024) }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.accepted, false);
    assert.match(body.basis, /not readable JSON/);
  });

  it("serves /theme.mjs, because web/app.js imports it from there", async () => {
    const res = await get("/theme.mjs");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /javascript/);
    const text = await res.text();
    assert.match(text, /export const THEMES/);
    assert.match(text, /export function resolveTheme/);
  });
});
