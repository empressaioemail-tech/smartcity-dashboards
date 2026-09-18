/**
 * ---------------------------------------------------------------------------
 * G-152. THE FIRE AND EMS LENS.
 *
 * The design is `_design/smartcity-fire-ems-lens/`, RATIFIED 2026-09-17, two
 * artboards (Main, Blocked), shipping its own `check.mjs`. This file is the
 * BUILT side of that comparison.
 *
 * THE RULE THIS LENS EXISTS TO HOLD, in the domain module's own words: a
 * generated record names no person, and says so on the record rather than
 * leaving the field quietly missing. A readiness screen is exactly the surface
 * where a crew list would feel natural and be wrong.
 *
 * SMALL MULTIPLES PER STATION, NOT A ROLLUP. src/domains/fire-apparatus.mjs
 * states the reason: a city with every out of service truck in one station is a
 * different fact from a city with one in each, and a single total of twelve
 * cannot tell you which. So one card per station, each on the same bands in the
 * same order at the same scale, and the cards reconcile against the tile row by
 * a route that is not the tile row's.
 *
 * ALL TWELVE, NO PAGER. Twelve IS the roster. A partial roster on a readiness
 * screen reads as a complete one, which is worse than no roster at all; a real
 * roster of two hundred needs a pager and a station filter rather than this.
 *
 * THE BLOCKED STATE IS AN ENTITLEMENT, NOT AN ERROR. FirstDue returns a real,
 * specific 403: the account is connected and the credential does not carry the
 * apparatus and assets scope. That is vendor-onboarding work tracked outside
 * this row, it is not a defect in this product, and nobody reading the screen
 * can fix it. So the blocked card states its state, its basis verbatim, what
 * KIND of thing would move it and when that was last read - and offers NO retry
 * affordance, because a retry button would tell a reader this is theirs to fix.
 * `src/fire-ems-lens.test.mjs` asserts that no affordance exists.
 * ---------------------------------------------------------------------------
 */

import { DOMAIN_REGISTRY, composeDomainById } from "./domains.mjs";
import { VEHICLE_STATUS_VALUES } from "./adapters.mjs";
import { DOMAIN_STATUSES } from "./fixture-seam.mjs";
import { grantedKindIds } from "./city-identity.mjs";
/**
 * THE FLOOD MOUNT IS SHARED WITH PUBLIC WORKS AND LIVES IN THAT MODULE. Both
 * designs draw the same mount, and the sentence that says what it is belongs to
 * both lenses: a second copy here would be the defect DEV_PROCESS 1.2 exists to
 * stop, two sentences that agree on the day they are written and drift after.
 */
import { floodMountPanel } from "./public-works-lens.mjs";
import {
  OBSTACLE_FOR_KIND,
  OBSTACLE_KINDS,
  VENDOR_LIVE_READING,
  lastReadFact,
  regionReading,
} from "./public-works-lens.mjs";

export const FIRE_EMS_LENS_ID = "fire-ems";

export const FIRE_EMS_REGIONS = Object.freeze(
  DOMAIN_REGISTRY.filter((d) => d.lensId === FIRE_EMS_LENS_ID).map((d) =>
    Object.freeze({ domainId: d.id, region: d.region, gatedBy: d.gatedBy, recordType: d.recordType }),
  ),
);
if (FIRE_EMS_REGIONS.length !== 1) {
  throw new Error(
    `fire-ems carries ${FIRE_EMS_REGIONS.length} registered regions; the lens is designed for one ` +
      `(fire-apparatus). Re-derive the design or fix the registry, do not paper over it here.`,
  );
}

/** The four readiness bands, from the product. A fifth band is invented and
 *  `check.mjs` refuses one; so does this file, by construction. */
export const FIRE_READINESS_BANDS = VEHICLE_STATUS_VALUES.map((b) => ({ id: b.id, label: b.label }));
export const BAND_LABELS = FIRE_READINESS_BANDS.map((b) => b.label);
export const READY_BAND = VEHICLE_STATUS_VALUES.find((b) => b.resolved) || null;

/** The four jobs this product names as not-built on this lens, copied from the
 *  shipped lens rather than invented: a list that drifts from the page it
 *  describes is a second register. */
export const NOT_BUILT_JOBS = Object.freeze([
  "Occupancies",
  "Volunteer response",
  "County dispatch",
  "Flood and weather",
]);

/**
 * The per-station multiples, derived from the records and reconciled against the
 * extras by a DIFFERENT route: the cards count off records, the tile row counts
 * off extras.metrics, and the basis line prints both totals. Two numbers that
 * should agree and are never shown agreeing is a reconciliation nobody performs.
 */
export function stationMultiples(domain) {
  const records = Array.isArray(domain.records) ? domain.records : [];
  const extras = domain.extras || {};
  const stations = Array.isArray(extras.stations) ? extras.stations : [];
  if (domain.status !== "ok") {
    return { cards: [], apparatusSum: 0, readySum: 0, tileReady: null, tileApparatus: null, reconciles: null, basis: "Nothing has been read on this pack, so no station card carries a number." };
  }
  const cards = stations.map((st) => ({
    ref: st.stationRef,
    label: st.stationLabel,
    total: st.apparatusCount,
    ready: st.readyCount,
    crewBasis: st.crewBasis,
    bands: FIRE_READINESS_BANDS.map((b) => ({
      id: b.id,
      label: b.label,
      value: records.filter((r) => r.stationRef === st.stationRef && r.status === b.id).length,
    })),
  }));
  const apparatusSum = cards.reduce((n, c) => n + c.total, 0);
  const readySum = cards.reduce((n, c) => n + c.ready, 0);
  const metrics = Array.isArray(extras.metrics) ? extras.metrics : [];
  const tileReady = metrics.find((m) => m.id === (READY_BAND ? READY_BAND.id : "")) || null;
  const tileApparatus = metrics.reduce((n, m) => n + m.count, 0);
  const reconciles =
    apparatusSum === domain.recordCount && apparatusSum === tileApparatus && (tileReady ? readySum === tileReady.count : true);
  return {
    cards,
    apparatusSum,
    readySum,
    tileReady: tileReady ? tileReady.count : null,
    tileApparatus,
    reconciles,
    basis:
      `The ${cards.length} cards sum to ${apparatusSum} apparatus and ${readySum} in service, the same ` +
      `${tileReady ? tileReady.count : "unread"} the tile row reports by a different route: the cards count off records, ` +
      `the tiles count off the composer's own metric extras. Readiness: ${extras.readyCountingRule || domain.countingRule}`,
  };
}

/* ------------------------------------------------------------- the payload */

/**
 * THE BUNDLED DEFAULT FOR THIS LENS, for the same reason and in the same shape
 * as the Public works lens's: web/index.html is served for every pack, so the
 * markup it carries is rendered with `pack = null` and says exactly that. Not
 * read is a reading, and it is the one that belongs on a document nobody has
 * told which city it describes.
 */
export function unreadFireEmsPayload() {
  const r = FIRE_EMS_REGIONS[0];
  const region = {
    ...r,
    status: null,
    granted: null,
    generated: null,
    basis: "no region payload has been read for this pack",
    countingRule: "no region payload has been read for this pack",
    recordCount: 0,
    reading: "unread",
    badge: "Not read",
    liveStatus: null,
  };
  return {
    lens: FIRE_EMS_LENS_ID,
    cityKey: null,
    displayName: "This city",
    environment: null,
    regions: [{ ...region, blocked: [] }],
    regionCount: 1,
    regionLine:
      "1 registered region on this lens. Public works carries " +
      `${DOMAIN_REGISTRY.filter((d) => d.lensId === "public-works").length}. Parks carries ` +
      `${DOMAIN_REGISTRY.filter((d) => d.lensId === "parks").length}. No region payload has been read for this pack.`,
    pageBadge: "Not read",
    records: [],
    multiples: { cards: [], apparatusSum: 0, readySum: 0, tileReady: null, tileApparatus: null, reconciles: null, basis: "Nothing has been read on this pack, so no station card carries a number." },
    bands: FIRE_READINESS_BANDS,
    metrics: [],
    readyCountingRule: null,
    crewBasis: null,
    domain: null,
    prov: FIRE_EMS_REGIONS,
    statuses: DOMAIN_STATUSES,
    vendorLive: VENDOR_LIVE_READING,
  };
}

export function fireEmsLensPayload(pack) {
  return pack ? resolvedFireEmsPayload(pack) : unreadFireEmsPayload();
}

function resolvedFireEmsPayload(pack) {
  const grantedKinds = new Set(grantedKindIds(pack).granted);
  const region = FIRE_EMS_REGIONS[0];
  const domain = composeDomainById(pack, region.domainId);
  const reading = regionReading(domain, grantedKinds);
  const row = {
    ...region,
    status: domain.status,
    granted: domain.granted,
    generated: domain.generated,
    basis: domain.basis,
    countingRule: domain.countingRule,
    recordCount: domain.recordCount,
    reading,
    badge: reading === "measured" ? "Demo records" : reading === "no-source" ? "Empty" : reading === "absent" ? "Not built" : "Not connected",
    liveStatus: reading === "granted-live" ? "unavailable" : null,
  };
  const obstacle = OBSTACLE_FOR_KIND[row.gatedBy] ? OBSTACLE_KINDS[OBSTACLE_FOR_KIND[row.gatedBy]] : null;
  const blocked =
    reading === "granted-live" && obstacle
      ? [
          { k: "Obstacle kind", v: obstacle.obstacle },
          { k: "Basis", v: VENDOR_LIVE_READING.basis, mono: true },
          { k: "Who moves it", v: obstacle.who },
          { k: "Last read", v: lastReadFact(), mono: true },
          { k: "Records", v: "Unread. A count belongs to a live read, never to a page that has not run one.", mono: true },
        ]
      : [];
  const records = domain.status === "ok"
    ? domain.records.map((r) => ({
        ...r,
        bandLabel: (VEHICLE_STATUS_VALUES.find((b) => b.id === r.status) || { label: r.status }).label,
      }))
    : [];
  return {
    lens: FIRE_EMS_LENS_ID,
    cityKey: pack.cityKey,
    displayName: pack.displayName,
    environment: pack.environment,
    regions: [{ ...row, blocked }],
    regionCount: 1,
    regionLine:
      `1 registered region on this lens. Public works carries ` +
      `${DOMAIN_REGISTRY.filter((d) => d.lensId === "public-works").length}. Parks carries ` +
      `${DOMAIN_REGISTRY.filter((d) => d.lensId === "parks").length}.`,
    pageBadge: row.badge,
    records,
    multiples: stationMultiples(domain),
    bands: FIRE_READINESS_BANDS,
    metrics: domain.extras && Array.isArray(domain.extras.metrics) ? domain.extras.metrics : [],
    readyCountingRule: (domain.extras && domain.extras.readyCountingRule) || null,
    crewBasis: records[0] ? records[0].crewBasis : (domain.extras && domain.extras.stations && domain.extras.stations[0] ? domain.extras.stations[0].crewBasis : null),
    domain,
    prov: FIRE_EMS_REGIONS,
    statuses: DOMAIN_STATUSES,
    vendorLive: VENDOR_LIVE_READING,
  };
}

/* -------------------------------------------------------------- rendering */

const esc = (value) =>
  String(value === null || value === undefined ? "" : value).replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[c]);

const pairLine = (domainId, gatedBy) => `${esc(domainId)} · gatedBy ${esc(gatedBy)}`;

const badge = (word, tone = "p-quiet") =>
  word ? `<span class="pill ${tone}">${esc(word)}</span>` : "";

const BAND_TONE = { "out-of-service": "c-crit", "inspection-due": "c-warn", "in-shop": "c-info", "in-service": "c-ok" };
const BAND_VAR = {
  "out-of-service": "--sc-crit",
  "inspection-due": "--sc-warn",
  "in-shop": "--sc-info",
  "in-service": "--sc-ok",
};
const bandChip = (label, bandId) => `<span class="chip ${BAND_TONE[bandId] || "c-quiet"}">${esc(label)}</span>`;

/**
 * The small multiples. One card per station, every card on the same four bands
 * in the same order, and the ready figure printed BESIDE its denominator: a
 * ratio never travels alone.
 */
export function renderStationMultiples(model) {
  if (!model.cards.length) {
    return `<div class="mtx-absent" data-station-surface="unread"><p>${esc(model.basis)}</p></div>`;
  }
  const cards = model.cards
    .map((card) => {
      const bars = card.bands
        .filter((b) => b.value > 0)
        .map((b) => `<span class="sm-bar" style="width:${((b.value / card.total) * 100).toFixed(1)}%;background:var(${BAND_VAR[b.id]})"></span>`)
        .join("");
      const rows = card.bands
        .map(
          (b) =>
            `<tr><th scope="row">${bandChip(b.label, b.id)}</th>` +
            `<td class="t-data sm-n${b.value ? "" : " sm-zero"}">${b.value}</td></tr>`,
        )
        .join("");
      return (
        `<div class="sm-card" data-station="${esc(card.ref)}">` +
        `<div class="sm-head"><span class="t-data">${esc(card.ref)}</span>` +
        `<span class="sm-label">${esc(card.label)}</span></div>` +
        `<div class="sm-ready"><span class="sm-ready-n">${card.ready}</span>` +
        `<span class="sm-ready-d">in service of ${card.total}</span></div>` +
        `<div class="sm-bars" aria-hidden="true">${bars}</div>` +
        `<table class="dt sm-table"><caption class="sr-only">${esc(card.label)} readiness by band</caption>` +
        `<tbody>${rows}</tbody></table>` +
        `</div>`
      );
    })
    .join("");
  return (
    `<div class="sm" data-station-count="${model.cards.length}">${cards}</div>` +
    `<span class="basis">${esc(model.basis)}</span>`
  );
}

/**
 * The blocked card: four facts and no affordance. There is no button, no link,
 * no retry and no "contact support" path in this markup, and the test asserts
 * their absence rather than trusting a reader to notice.
 */
export function renderFireBlockedCard(region) {
  if (!region.blocked.length) return "";
  const obstacle = OBSTACLE_KINDS[OBSTACLE_FOR_KIND[region.gatedBy]];
  const rows = region.blocked
    .map(
      (f) =>
        `<tr><th scope="row">${esc(f.k)}</th><td class="${f.mono ? "t-data" : ""}">${esc(f.v)}</td></tr>`,
    )
    .join("");
  return (
    `<div class="blocked" data-blocked-kind="${esc(obstacle.kind)}">` +
    `<div class="blocked-head"><span class="t">${esc(obstacle.headline)}</span>` +
    `<span class="t-caption">${pairLine(region.domainId, region.gatedBy)}</span>` +
    `<span class="grow"></span><span class="stchip ${esc(obstacle.tone)}">${esc(obstacle.state)}</span></div>` +
    `<table class="dt blocked-facts"><tbody>${rows}</tbody></table>` +
    `<span class="t-caption">status: ${esc(region.liveStatus || "unavailable")} · recorded ${esc(VENDOR_LIVE_READING.recordedAt)}, never re-read by this page</span>` +
    `</div>`
  );
}

/** The roster: all twelve, composer order, no pager. */
export function renderRoster(records) {
  const rows = records
    .map(
      (r) =>
        `<tr><td class="id">${esc(r.recordId)}</td>` +
        `<td class="subj">${esc(r.unitLabel)}</td>` +
        `<td>${esc(r.apparatusType)}</td>` +
        `<td>${bandChip(r.bandLabel, r.status)}</td>` +
        `<td class="t-data">${esc(r.stationRef)}</td>` +
        `<td>${esc(r.stationLabel)}</td></tr>`,
    )
    .join("");
  return (
    `<table class="dt"><caption class="sr-only">Apparatus, one row per unit, sorted by severity then by record id</caption>` +
    `<thead><tr><th scope="col">Record</th><th scope="col">Unit</th><th scope="col">Type</th>` +
    `<th scope="col">Status</th><th scope="col">Stn</th><th scope="col">Station</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  );
}

const metric = (label, value, note, opts = {}) =>
  opts.unread
    ? `<div class="metric" data-metric="${esc(opts.id || "")}"><span class="k">${esc(label)}</span>` +
      `<span class="v word">${esc(opts.word || "Not read")}</span><span class="n">${esc(note)}</span></div>`
    : `<div class="metric has-value" data-metric="${esc(opts.id || "")}"><span class="k">${esc(label)}</span>` +
      `<span class="v">${esc(value)}</span><span class="n">${esc(note)}</span></div>`;

function metricsRow(payload, { unreadNote = "No apparatus source" } = {}) {
  const measured = payload.regions[0].reading === "measured";
  const items = FIRE_READINESS_BANDS.map((b) => {
    const m = measured ? payload.metrics.find((x) => x.id === b.id) : null;
    return metric(b.label, m ? m.count : null, m ? `of ${payload.regions[0].recordCount} apparatus` : unreadNote, {
      id: b.id,
      unread: !m,
    });
  });
  items.push(
    measured
      ? metric("Stations", payload.multiples.cards.length, "each counted separately", { id: "stations" })
      : metric("Stations", null, unreadNote, { id: "stations", unread: true }),
    measured
      ? metric("Crew", null, "a roster of people is not a fixture", { id: "crew", unread: true, word: "Not carried" })
      : metric("Crew", null, "and the live path is silent on it", { id: "crew", unread: true, word: "Not carried" }),
  );
  return `<div class="metrics attn" id="fire-apparatus-metrics">${items.join("")}</div>`;
}

/** The four jobs the product names and does not build. A table rather than a
 *  list, because each row is a job AND the sentence that says what it is not. */
function notBuiltPanel() {
  const rows = NOT_BUILT_JOBS.map(
    (j) => `<tr><th scope="row">${esc(j)}</th><td>not a region on this product</td></tr>`,
  ).join("");
  return (
    `<div class="panel"><div class="panel-head"><span class="t">Not built on this lens</span>` +
    `<span class="t-caption">four jobs, named rather than hidden</span><span class="grow"></span>${badge("Not built")}</div>` +
    `<div class="panel-body"><table class="dt blocked-facts">` +
    `<caption class="sr-only">Jobs named on the roster that are not regions on this product</caption>` +
    `<thead><tr><th scope="col">Job</th><th scope="col">Status</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<span class="basis">Basis: none of the four is a registered region, so the surface does not exist. A registered region with no source says something else, and the panel above is saying it.</span></div></div>`
  );
}

/**
 * THREE OBSTACLES, THREE KINDS, and this panel exists so a reader who can fix
 * one of them can see which one it is. It is drawn on the blocked board because
 * that is where the confusion is felt: "not read" on this product currently
 * means a consent, an entitlement and a missing source at the same time.
 *
 * THE PAIRS ARE WRITTEN AS PROSE, NOT AS DOMAIN/GATE PAIRS, AND THAT IS
 * DELIBERATE: a `gatedBy` line for another lens's domain would be a pair this
 * lens's registry does not carry, and the design's own check refuses exactly
 * that on this surface.
 */
export function obstacleKindsPanel() {
  const rows = [
    ["Public works / call analytics", "A consent nobody has given", "goto"],
    ["Fire and EMS / apparatus", "An entitlement the credential lacks", "firstdue"],
    ["Parks", "A source that does not exist", null],
  ]
    .map(
      ([where, what, kind]) =>
        `<tr><th scope="row">${esc(where)}</th><td>${esc(what)}</td>` +
        `<td class="t-data">${esc(kind ? OBSTACLE_KINDS[OBSTACLE_FOR_KIND[kind]].kind : "no vendor at all")}</td></tr>`,
    )
    .join("");
  return (
    `<div class="panel"><div class="panel-head"><span class="t">Three obstacles, three kinds</span>` +
    `<span class="t-caption">across the lanes drawn from this program</span></div>` +
    `<div class="panel-body"><table class="dt blocked-facts">` +
    `<caption class="sr-only">Each unread lens, the obstacle blocking it, and the kind of thing that obstacle is</caption>` +
    `<thead><tr><th scope="col">Lens / region</th><th scope="col">Obstacle</th><th scope="col">Kind</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>` +
    `<span class="basis">Basis: src/vendor-live.mjs module header, live-verified 2026-09-03 and recorded there, and ` +
    `src/domains.mjs for the vendorless finding. Each is a claim about its stated date; re-run the instrument before quoting it.</span></div></div>`
  );
}

/* --------------------------------------------------------- the lens markup */

export function renderFireEmsLens(pack, { className = "lens", snapshot = "this checkout" } = {}) {
  const payload = fireEmsLensPayload(pack);
  const region = payload.regions[0];
  const measured = region.reading === "measured";
  const regionHead =
    `<div class="panel-head"><span class="t">Apparatus and stations</span>` +
    `<span class="t-caption">${pairLine("fire-apparatus", region.gatedBy)} · ${esc(region.recordType)}</span>` +
    `<span class="grow"></span>${badge(region.badge, measured ? "p-warn" : "p-quiet")}</div>`;

  let body = "";
  let primary = "";
  let side = "";

  if (measured) {
    body = metricsRow(payload);
    primary =
      `<div class="panel">${regionHead}` +
      renderRoster(payload.records) +
      `<div class="panel-body"><span class="basis">Sorted by severity, then by record id. Every unit is on the page, ${payload.records.length} of ${region.recordCount}, with no pager: a partial roster on a readiness screen is worse than no roster, and a real roster of two hundred needs a pager and a station filter rather than this. Basis: ${esc(region.basis)}. Counting rule: ${esc(region.countingRule)}.</span></div>` +
      `</div>`;
    side =
      `<div class="panel"><div class="panel-head"><span class="t">Readiness, per station</span>` +
      `<span class="t-caption">the second axis</span><span class="grow"></span>` +
      `<span class="t-caption">same bands, same order, same scale</span></div>` +
      `<div class="panel-body sm-wrap">${renderStationMultiples(payload.multiples)}</div></div>` +
      `<div class="panel"><div class="panel-head"><span class="t">Nobody is named</span>` +
      `<span class="t-caption">and the dimension still works</span></div>` +
      `<div class="panel-body"><span class="basis">Basis: ${esc(payload.crewBasis)}.</span></div></div>` +
      notBuiltPanel() +
      floodMountPanel();
  } else if (region.reading === "granted-live") {
    /**
     * THE TILE ROW STAYS, AND IT IS THE BLOCKED BOARD'S FIRST SUBJECT. Four
     * bands and two dimensions reading Not read is a finding about the CITY, and
     * a card alone would make the page about the vendor. "The vendor has not
     * answered" is the note under each one because that is what happened.
     */
    body = metricsRow(payload, { unreadNote: "the vendor has not answered" });
    primary =
      `<div class="panel">${regionHead}` +
      renderFireBlockedCard(region) +
      `<div class="panel-body"><span class="basis">Basis: the fixture seam answers ${esc(JSON.stringify(region.basis))} on this pack, and the server branches to the live composer instead (REAL_LIVE_DOMAINS, src/server.mjs), which returns status unavailable carrying whatever the vendor route said. No live read was performed here and no credential was used.</span></div>` +
      `</div>`;
    side =
      `<div class="panel"><div class="panel-head"><span class="t">When it reads, these tiles are not these tiles</span>` +
      `<span class="t-caption">a build rule, stated before the build</span><span class="grow"></span>${badge("Partial", "p-warn")}</div>` +
      `<div class="panel-body"><p>Out of service, Inspection due, In shop and In service are this product's own vocabulary, invented for the generated pack. A live apparatus feed has its own status values and they are not these four, so the metric row takes its bands FROM the payload and not from a constant: a constant would sort real trucks into invented buckets on the first real read.</p>` +
      `<p>Two more things do not survive the cutover. The generated record carries a crewBasis saying no person is named, and the live mapper carries no crew field at all, so the refusal disappears silently rather than travelling with the record. And the live recordId falls back to one sentinel per vendor kind instead of per row, so two unknown apparatus rows would carry one identifier; G-153 namespaced that sentinel by vendor, which stops two VENDORS colliding and does not stop two rows.</p>` +
      `<span class="basis">Basis: src/vendor-live.mjs header, mapRealFireApparatusRecord and realStatusCounts, read at this commit.</span></div></div>` +
      notBuiltPanel() +
      floodMountPanel() +
      obstacleKindsPanel();
  } else {
    const where = region.reading === "unread" ? "this pack" : "this city";
    primary =
      `<div class="panel">${regionHead}` +
      `<div class="state"><span class="st-k">Region built, no source</span>` +
      `<h2>Apparatus readiness has not been read for ${where}.</h2>` +
      `<p>This region is BUILT: it declares a record shape, it carries a working generator, and its tiles are the instrument it ships with. What it does not have on this pack is a source, and the basis below says which. The tiles stay unread rather than showing a zero, because a zero would be a claim about a fleet nobody has read.</p>` +
      `<span class="basis">Basis, verbatim from the composer: ${esc(region.basis)}. Counting rule: ${esc(region.countingRule)}.</span>` +
      (region.status
        ? `<span class="t-caption">status: ${esc(region.status)} · granted: ${esc(region.granted)} · generated: ${esc(region.generated)}</span>`
        : `<span class="t-caption">no region payload has been read for this pack, so there is no composer status to report</span>`) +
      `</div></div>`;
    body = metricsRow(payload, { unreadNote: region.reading === "unread" ? "no region payload has been read for this pack" : "No apparatus source" });
    side = notBuiltPanel() + floodMountPanel();
  }

  const statePill = `<span class="pill ${measured ? "p-warn" : "p-quiet"}" id="fire-ems-state-chip">${esc(payload.pageBadge)}</span>`;
  const footCity = payload.cityKey
    ? `pack ${esc(payload.cityKey)} · read at smartcity-dashboards ${esc(snapshot)}`
    : `no pack read · this is the bundled document, and web/app.js replaces it when a pack resolves`;
  const tabCount = measured
    ? `${region.recordCount} apparatus`
    : region.reading === "granted-live"
      ? "declined"
      : region.reading === "unread"
        ? "not read"
        : "0 records";
  return (
    `<section class="${esc(className)}" id="lens-fire-ems">` +
    `<header class="pagehead">` +
    `<div class="crumb"><b data-pack-name>${esc(payload.displayName)}</b> <span>/</span> Fire and EMS</div>` +
    `<div class="titlerow"><h1>Fire and EMS</h1>${statePill}<span class="grow"></span>` +
    `<span class="t-caption" id="fire-ems-region-rule">${esc(payload.regionLine)}</span></div>` +
    `<p class="lede">Apparatus readiness, counted per station rather than city wide. A city with every out of service truck in one station is a different fact from a city with one in each, and a rollup cannot say which.</p>` +
    `</header>` +
    `<div class="tabs" role="tablist" aria-label="Fire and EMS regions">` +
    `<button type="button" role="tab" aria-selected="true" data-fe-region="fire-apparatus">${esc(region.region)}` +
    `<span class="pill ${measured ? "p-warn" : "p-quiet"}">${esc(region.badge)}</span>` +
    `<span class="n">${esc(tabCount)}</span></button>` +
    `</div>` +
    `<div class="shell-regions" data-fe-region-panel="fire-apparatus">` +
    `<div class="colstack" tabindex="0">${body}${primary}</div>` +
    (side ? `<div class="colstack rail">${side}</div>` : "") +
    `</div>` +
    `<div class="region-foot" id="fe-prov-foot">` +
    payload.prov.map((p) => `<span class="prov">${pairLine(p.domainId, p.gatedBy)} · ${esc(p.recordType)}</span>`).join("") +
    `<span class="grow"></span>` +
    `<span class="prov">${footCity}</span>` +
    `</div>` +
    `</section>`
  );
}

/**
 * The transform, as a PURE function, for the reason both sibling bakes are:
 * a transform that lives only in a script cannot be asserted, so a stale
 * document ships green in either direction. src/fire-ems-lens.test.mjs asserts
 * web/index.html is a FIXED POINT of it and the bake script calls it, ONE
 * implementation. CRLF comes back the way it went in (D-9, web/** is -text).
 */
export function bakeFireEmsLensInto(rawHtml) {
  return bakeSectionInto(rawHtml, {
    marker: '<section class="lens" id="lens-fire-ems">',
    next: '<section class="lens" id="lens-fleet">',
    render: () => renderFireEmsLens(null),
  });
}

/** The same document, served or exported, with the same two asset bases and the
 *  same reason as the Public works surface. See renderPublicWorksSurface. */
export function renderFireEmsSurface(pack, { assetBase = ".", ...opts } = {}) {
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<title>Fire and EMS · ${esc(pack ? pack.displayName : "this city")}</title>\n` +
    `<link rel="stylesheet" href="${assetBase}/sc-kit.css">\n<link rel="stylesheet" href="${assetBase}/shell.css">\n` +
    `</head>\n<body class="shell">\n<main class="shell-main">\n` +
    renderFireEmsLens(pack, { className: "lens on", ...opts }) +
    `\n</main>\n</body>\n</html>\n`
  );
}

