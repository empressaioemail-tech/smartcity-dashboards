/**
 * ---------------------------------------------------------------------------
 * G-90. WHAT THE TOP BAR IS ALLOWED TO SAY ABOUT ITSELF.
 *
 * The shell grew five controls this card - theme, notifications, an account
 * menu, support and feedback - and four of the five have a dependency that does
 * not exist yet. The visual law's answer to that is honest absence, and honest
 * absence has a failure mode: a disabled control whose reason is written by hand
 * beside it in markup. That sentence is true on the day it is typed and is never
 * checked again, which is the shape of every stale claim this program has paid
 * for.
 *
 * So a control's enabled state and its stated reason are DERIVED here, from the
 * deployment's own configuration and from the caller the request actually
 * resolved to, and the browser renders what the server says rather than what
 * somebody typed. The day a dependency lands, the control enables itself and its
 * sentence disappears; nobody has to remember to delete it.
 *
 * PURE. No DOM, no process.env read at module scope, no I/O. Every function
 * takes what it needs, so every branch below - including the ones that are false
 * on every deployment today - can be proven able to fire in a unit test rather
 * than asserted to be possible. A capability that can never be observed enabled
 * is indistinguishable from a capability that is broken.
 * ---------------------------------------------------------------------------
 */

import { packSources } from "./city-identity.mjs";

/**
 * The caller kinds src/tenancy.mjs resolveCaller() can return. Listed rather
 * than pattern-matched, so a kind added there and not taught here fails loudly
 * instead of resolving to a confident wrong sentence about who is calling.
 */
export const CALLER_KINDS = ["anonymous", "tenant", "service"];

/**
 * The session, and the distinction it exists to keep.
 *
 * An IDENTIFIED CALLER is not a SIGNED-IN PERSON. G-11 settled that a city pack
 * is the tenant and that an identified caller is a Hauska product key whose
 * jurisdiction_tenant equals the cityKey - a machine credential naming a
 * tenant, never a staff member naming themselves. Collapsing the two would let
 * the account menu show "My profile" to a request that has no person behind it,
 * which is the fabricated-presence defect wearing an auth costume.
 *
 * So the shape carries both: `identified` is real today and `staffUser` is
 * false on every deployment until the People and access build lands. Anonymous
 * remains the default and only path for a visitor.
 */
export function shellSession(caller) {
  const kind = CALLER_KINDS.includes(caller?.kind) ? caller.kind : "anonymous";
  const identified = kind !== "anonymous";
  const label = {
    anonymous: "Anonymous",
    tenant: "Identified by product key",
    service: "Service caller",
  }[kind];
  const basis = {
    anonymous: "no credential was presented, and anonymous is the default path on this product",
    tenant: "a Hauska product key resolved to a city pack tenant, which identifies a tenant and not a person",
    service: "a service bearer token was presented, which identifies a deployment and not a person",
  }[kind];
  return {
    kind,
    identified,
    /**
     * Always false today, and that is a statement about the product rather than
     * about this request. It is a field rather than an omission so a successor
     * can see the distinction was considered, and so the account capabilities
     * below have something real to key off once it can be true.
     */
    staffUser: false,
    staffUserBasis:
      "this product resolves a caller from a product key or a service bearer and never from a person; staff users arrive with the People and access build",
    label,
    basis,
  };
}

/**
 * A configured-or-not answer for one environment variable, with the variable
 * NAMED in the basis. Naming it is the point: "support is unavailable" sends a
 * reader looking through source, and "SHELL_SUPPORT_URL is unset on this
 * deployment" is actionable in one step.
 */
function configured(env, name) {
  const value = String(env?.[name] ?? "").trim();
  return { on: Boolean(value), value, name };
}

/**
 * The five top-bar capabilities, each as { available, basis }.
 *
 * Every basis is a POSITIVE DETERMINATION with its cause, never a shrug. And
 * every one of these branches flips: pass a session with staffUser true, or an
 * env with the named variable set, and the capability comes back available.
 * src/shell-state.test.mjs runs both sides of each, because a gate that has only
 * ever been observed in one state has not been observed.
 */
export function shellCapabilities({ session, env = {} } = {}) {
  const s = session || shellSession(null);
  const idp = configured(env, "SHELL_IDENTITY_PROVIDER");
  const support = configured(env, "SHELL_SUPPORT_URL");
  const feedback = configured(env, "FEEDBACK_DESTINATION");

  return {
    /**
     * NOTE WHAT IS NOT ECHOED. The identity provider and the feedback
     * destination are named as CONFIGURED, never by value, while the support
     * URL is echoed because it IS the link a person clicks.
     *
     * That asymmetry is a finding rather than a preference: a feedback
     * destination is typically a signed webhook whose URL carries the secret,
     * and this whole payload is served to an anonymous browser. The first draft
     * of this resolver echoed all three, and the test written to prove the
     * basis names its cause is what caught it.
     */
    signIn: s.staffUser
      ? { available: false, basis: "a staff session is already open" }
      : idp.on
        ? { available: true, basis: "an identity provider is configured for this deployment" }
        : {
            available: false,
            basis:
              "SHELL_IDENTITY_PROVIDER is unset on this deployment, and the staff sign-in build is a separate plan row; anonymous is the default path",
          },
    signOut: s.staffUser
      ? { available: true, basis: "a staff session is open and can be ended" }
      : {
          available: false,
          basis: s.identified
            ? "the caller is identified by a request header rather than by a session this product can end"
            : "there is no staff session to end",
        },
    account: s.staffUser
      ? { available: true, basis: "a staff session is open" }
      : { available: false, basis: s.staffUserBasis },
    support: support.on
      ? { available: true, basis: `support channel ${support.value} is configured`, href: support.value }
      : {
          available: false,
          basis: "SHELL_SUPPORT_URL is unset on this deployment, so no support channel is reachable from here",
        },
    feedback: feedback.on
      ? { available: true, basis: "a feedback destination is configured and delivery is reported per send" }
      : {
          available: false,
          basis: "FEEDBACK_DESTINATION is unset on this deployment, so feedback has nowhere to be delivered",
        },
    /**
     * Record search is the one capability gated by a BUILD rather than by
     * configuration, so no environment variable can flip it and its basis says
     * so plainly instead of naming a variable nobody can set.
     */
    recordSearch: {
      available: false,
      basis:
        "record search is not built and this product holds no record index, so there is nothing to search; its home is Work, Records search",
    },
  };
}

/**
 * The notification tray's contents and, when there are none, WHY there are none.
 *
 * There is deliberately NO COUNT FIELD anywhere in this shape. A count is the
 * one thing a notification bell is expected to fabricate, and the cheapest way
 * to guarantee the surface cannot render one is to never send it. An empty
 * `items` array on its own would be an empty result rather than an absence, so
 * the basis is a positive determination derived from the pack's own grants and
 * it travels with its counting rule.
 */
export function notificationState(pack) {
  const sources = packSources(pack);
  const basis =
    sources.granted === 0
      ? `no adapter kind is granted on this pack, so no source can raise a notification (${sources.label})`
      : `${sources.label}, and no granted adapter kind writes notifications yet, so none has been raised`;
  return {
    items: [],
    basis,
    rule: sources.rule,
  };
}

/** The whole top-bar answer for one request. One route, one resolver. */
export function shellState({ caller, pack, env = {} } = {}) {
  const session = shellSession(caller);
  return {
    session,
    capabilities: shellCapabilities({ session, env }),
    notifications: notificationState(pack),
  };
}

/**
 * ---------------------------------------------------------------------------
 * FEEDBACK DELIVERY
 *
 * `accepted` means DELIVERED, and nothing else is allowed to set it true. A
 * feedback box that says thanks and drops the text is worse than no feedback
 * box: it converts a staff member's report into silence and tells them it
 * arrived.
 *
 * Delivery is injectable so the honest path and the failure path are both
 * exercised in a unit test without a network. The unconfigured branch is not a
 * placeholder for a future real one - it is the correct answer on a deployment
 * with nowhere to send.
 * ---------------------------------------------------------------------------
 */

export const FEEDBACK_MAX_CHARS = 2000;

export function feedbackDestination(env = {}) {
  return configured(env, "FEEDBACK_DESTINATION");
}

export async function deliverFeedback({ body, env = {}, fetchImpl } = {}) {
  const destination = feedbackDestination(env);
  if (!destination.on) {
    return {
      status: 503,
      accepted: false,
      basis: "FEEDBACK_DESTINATION is unset on this deployment, so feedback has nowhere to be delivered",
    };
  }
  const message = String(body?.message ?? "").trim();
  if (!message) {
    return { status: 400, accepted: false, basis: "feedback was empty, so nothing was sent" };
  }
  if (message.length > FEEDBACK_MAX_CHARS) {
    return {
      status: 400,
      accepted: false,
      basis: `feedback was ${message.length} characters and the limit is ${FEEDBACK_MAX_CHARS}, so nothing was sent`,
    };
  }
  const send = fetchImpl || globalThis.fetch;
  if (typeof send !== "function") {
    return { status: 503, accepted: false, basis: "this runtime has no fetch, so feedback could not be delivered" };
  }
  try {
    const res = await send(destination.value, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        surface: String(body?.surface ?? "").trim(),
        cityKey: String(body?.cityKey ?? "").trim(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res?.ok) {
      return {
        status: 502,
        accepted: false,
        basis: `the feedback destination answered ${res?.status ?? "no status"}, so delivery is not confirmed`,
      };
    }
    return { status: 202, accepted: true, basis: "delivered to the configured feedback destination" };
  } catch (err) {
    return {
      status: 502,
      accepted: false,
      basis: `the feedback destination could not be reached: ${String(err?.message || err)}`,
    };
  }
}
