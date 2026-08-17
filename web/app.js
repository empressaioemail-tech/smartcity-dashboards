import { resolveStaffMapQuery } from "/staff-map.mjs";
import { resolveStaffLensQuery } from "/staff-review.mjs";

const LENS_LABELS = {
  "city-manager": "Overview",
  "development-services": "Development services",
  finance: "Finance",
  citizen: "Citizen",
};

const TAB_LABELS = {
  pipeline: "Pipeline",
  place: "Place",
  review: "Review",
  inspections: "Inspections",
  "code-enforcement": "Code enforcement",
  licenses: "Licenses",
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

function applyLens(staffLens) {
  const { lens, tab, work } = staffLens;
  const filesOn = work === "files";
  document.querySelectorAll(".lens").forEach((el) => {
    if (el.id === "work-files") {
      el.classList.toggle("on", filesOn);
    } else {
      el.classList.toggle("on", !filesOn && el.id === `lens-${lens}`);
    }
  });
  document.querySelectorAll(".navitem[data-lens], .navitem[data-work]").forEach((el) => {
    if (filesOn) {
      el.classList.toggle("on", el.dataset.work === "files");
      return;
    }
    const sameLens = el.dataset.lens === lens;
    const wantsTab = el.dataset.tab;
    el.classList.toggle("on", Boolean(sameLens && (!wantsTab || wantsTab === tab)));
  });
  document.querySelectorAll(".tabs [data-tab]").forEach((el) => {
    const selected = el.dataset.tab === tab;
    el.setAttribute("aria-selected", selected ? "true" : "false");
  });
  document.querySelectorAll(".ds-tab").forEach((el) => {
    el.classList.toggle("on", el.id === `tab-${tab}`);
  });
  if (filesOn) {
    setText("lens-switch-label", "Files");
    setText("cp-source-scope", "Template · Files");
    setText("cp-scope-lens", "Files");
    document.documentElement.dataset.theme = "dark";
    return;
  }
  setText("lens-switch-label", LENS_LABELS[lens] || lens);
  setText("ds-crumb", TAB_LABELS[tab] || "Pipeline");
  const scope = `Template · ${LENS_LABELS[lens] || lens}`;
  setText("cp-source-scope", scope);
  setText("cp-scope-lens", LENS_LABELS[lens] || lens);
  document.documentElement.dataset.theme = lens === "citizen" ? "light" : "dark";
}

async function composeGoldMap(parcelNodeId, cityKey, staffLens) {
  const params = new URLSearchParams();
  if (parcelNodeId) params.set("parcelNodeId", parcelNodeId);
  if (cityKey) params.set("cityKey", cityKey);
  const res = await fetch(`/api/lenses/city-manager/compose?${params}`);
  const data = await res.json();
  const mapUrl = data.smartsite?.url || "";
  const reviewUrl = data.planReview?.url || "";
  const filesUrl = data.smartFiles?.url || "";
  const overview = document.getElementById("overview-site");
  const place = document.getElementById("place-site");
  const review = document.getElementById("review-site");
  const files = document.getElementById("files-site");
  if (overview) overview.src = mapUrl || "about:blank";
  if (place) place.src = mapUrl || "about:blank";
  if (review) review.src = reviewUrl || "about:blank";
  if (files) files.src = filesUrl || "about:blank";
  setText("review-basis", reviewUrl || data.planReview?.basis || "");
  setText("files-basis", filesUrl || data.smartFiles?.basis || "");
  const atoms = data.atoms || {};
  setText("atoms-basis", atoms.basis || data.smartsite?.basis || "");
  const types = Array.isArray(atoms.types) ? atoms.types.join(", ") : "";
  setText(
    "atoms-summary",
    atoms.status === "ok"
      ? `${atoms.atomCount} atoms. Types: ${types || "none named"}`
      : atoms.status
        ? `Atoms ${atoms.status}`
        : "",
  );
  if (staffLens.isDevelopmentServices && reviewUrl) {
    review.src = reviewUrl;
  }
}

function springEase(k, c, m, steps) {
  const w0 = Math.sqrt(k / m);
  const z = c / (2 * Math.sqrt(k * m));
  const wd = w0 * Math.sqrt(Math.max(1 - z * z, 1e-6));
  const dur = (7 / (z * w0)) * 1000;
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * (dur / 1000);
    const x = 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
    out.push(Math.round(x * 10000) / 10000);
  }
  return { easing: `linear(${out.join(",")})`, duration: Math.round(dur) };
}

const SPRING = springEase(320, 32, 0.9, 60);

function bindCompass() {
  const src = document.getElementById("cp-source");
  const sheet = document.getElementById("cp-sheet");
  const inner = document.getElementById("cp-inner");
  const scrim = document.getElementById("cp-scrim");
  const recede = document.getElementById("cp-recede");
  const close = document.getElementById("cp-close");
  const max = document.getElementById("cp-max");
  let state = "collapsed";

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function dest(kind) {
    const w = kind === "max" ? Math.min(window.innerWidth - 24, 960) : Math.min(400, Math.max(360, window.innerWidth * 0.36));
    const h = kind === "max" ? window.innerHeight - 64 : Math.max(280, window.innerHeight - 72);
    return {
      x: window.innerWidth - w - (kind === "max" ? 12 : 0),
      y: kind === "max" ? 52 : 60,
      w,
      h,
    };
  }
  function place(d) {
    sheet.style.left = `${d.x}px`;
    sheet.style.top = `${d.y}px`;
    sheet.style.width = `${d.w}px`;
    sheet.style.height = `${d.h}px`;
    sheet.style.borderRadius = "var(--sc-r-lg)";
  }
  function flip(from, to) {
    const sx = from.w / to.w;
    const sy = from.h / to.h;
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const d = reduced() ? 0 : SPRING.duration;
    const e = reduced() ? "linear" : SPRING.easing;
    sheet.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: "var(--sc-r-control)" },
        { transform: "translate(0px, 0px) scale(1, 1)", borderRadius: "var(--sc-r-lg)" },
      ],
      { duration: d, easing: e, fill: "both" },
    );
    if (!reduced()) {
      inner.animate([{ opacity: 0 }, { opacity: 0 }, { opacity: 1 }], {
        duration: d,
        easing: "linear",
        offset: [0, 0.35, 1],
        fill: "both",
      });
    }
  }
  function setRecede(on) {
    const d = reduced() ? 0 : SPRING.duration;
    recede.animate(
      [
        { transform: recede.style.transform || "scale(1)", filter: "brightness(1)" },
        { transform: on ? "scale(1.03)" : "scale(1)", filter: on ? "brightness(0.72)" : "brightness(1)" },
      ],
      { duration: d, easing: reduced() ? "linear" : SPRING.easing, fill: "both" },
    );
  }
  function present(kind) {
    const from = state === "collapsed" ? rectOf(src) : rectOf(sheet);
    const to = dest(kind);
    sheet.hidden = false;
    scrim.hidden = false;
    place(to);
    flip(from, to);
    if (state === "collapsed") setRecede(true);
    state = kind === "max" ? "maximized" : "presented";
    src.setAttribute("aria-expanded", "true");
  }
  function dismiss() {
    if (state === "collapsed") return;
    const from = rectOf(sheet);
    const to = rectOf(src);
    const d = reduced() ? 0 : SPRING.duration;
    const e = reduced() ? "linear" : SPRING.easing;
    const sx = to.w / from.w;
    const sy = to.h / from.h;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    sheet.animate(
      [
        { transform: "none", borderRadius: "var(--sc-r-lg)" },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: "var(--sc-r-control)" },
      ],
      { duration: d, easing: e, fill: "both" },
    );
    setRecede(false);
    window.setTimeout(() => {
      sheet.hidden = true;
      scrim.hidden = true;
      sheet.getAnimations().forEach((a) => a.cancel());
    }, d + 10);
    state = "collapsed";
    src.setAttribute("aria-expanded", "false");
  }

  src.addEventListener("click", () => {
    if (state === "collapsed") present("sheet");
    else dismiss();
  });
  close.addEventListener("click", dismiss);
  scrim.addEventListener("click", dismiss);
  max.addEventListener("click", () => present("max"));
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") dismiss();
  });
}

function bindNav() {
  document.getElementById("menu-btn")?.addEventListener("click", () => {
    document.getElementById("shell-nav")?.classList.toggle("open");
  });
  document.getElementById("citizen-lookup")?.addEventListener("click", () => {
    const basis = document.getElementById("citizen-lookup-basis");
    if (basis) basis.hidden = false;
  });
}

const staffLens = resolveStaffLensQuery(window.location.search);
const staffMap = resolveStaffMapQuery(window.location.search);

applyLens(staffLens);
composeGoldMap(staffMap.parcelNodeId, staffMap.cityKey, staffLens);
bindCompass();
bindNav();
