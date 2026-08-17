import {
  resolveStaffMapQuery,
} from "/staff-map.mjs";
import {
  resolveStaffLensQuery,
} from "/staff-review.mjs";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

function renderCompose(data, staffLens) {
  const site = document.getElementById("site");
  const reviewUrl = data.planReview?.url || "";
  const mapUrl = data.smartsite?.url || "";
  if (staffLens.isDevelopmentServices) {
    site.src = reviewUrl || "about:blank";
    site.title = "Plan Review embed";
    setText("embed-heading", "Plan Review");
    setText("smartsite-basis", reviewUrl);
  } else {
    site.src = mapUrl || "about:blank";
    site.title = "SmartSite embed";
    setText("embed-heading", "SmartSite");
    setText("smartsite-basis", mapUrl ? mapUrl : data.smartsite?.basis || "");
  }

  const atoms = data.atoms || {};
  const atomsStatus = document.getElementById("atoms-status");
  atomsStatus.textContent = atoms.status || "";
  atomsStatus.className = `status ${atoms.status || ""}`;
  setText("atoms-basis", atoms.basis || "");
  const types = Array.isArray(atoms.types) ? atoms.types.join(", ") : "";
  setText(
    "atoms-summary",
    atoms.status === "ok"
      ? `${atoms.atomCount} atoms. Types: ${types || "none named"}`
      : "",
  );

  const files = data.filesRoom || {};
  const filesStatus = document.getElementById("files-status");
  filesStatus.textContent = files.status || "";
  filesStatus.className = `status ${files.status || ""}`;
  setText("files-basis", files.basis || "");
  const list = document.getElementById("files-folders");
  list.replaceChildren();
  for (const folder of files.folders || []) {
    const li = document.createElement("li");
    li.textContent = `${folder.label} (${folder.folderId})`;
    list.appendChild(li);
  }
}

async function compose(parcelNodeId, cityKey, staffLens) {
  const params = new URLSearchParams();
  if (parcelNodeId) params.set("parcelNodeId", parcelNodeId);
  if (cityKey) params.set("cityKey", cityKey);
  const res = await fetch(`/api/lenses/city-manager/compose?${params}`);
  const data = await res.json();
  renderCompose(data, staffLens);
}

async function loadLenses() {
  const lensesRes = await fetch("/api/lenses");
  const { lenses } = await lensesRes.json();
  const root = document.getElementById("lenses");
  root.replaceChildren(
    ...lenses.map((lens) => {
      const el = document.createElement("article");
      const title = document.createElement("strong");
      if (lens.id === "development-services") {
        const link = document.createElement("a");
        link.href = "/?lens=development-services";
        link.textContent = lens.id;
        title.append(link);
      } else {
        title.textContent = lens.id;
      }
      const audience = document.createElement("div");
      audience.className = "meta";
      audience.textContent = lens.audience;
      const needs = document.createElement("p");
      needs.textContent = lens.needs;
      el.append(title, audience, needs);
      return el;
    }),
  );
}

const staffLens = resolveStaffLensQuery(window.location.search);
const staffMap = resolveStaffMapQuery(window.location.search);

document.getElementById("compose-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const parcelNodeId = document.getElementById("parcel-node-id").value.trim();
  const cityKey = document.getElementById("city-key").value.trim();
  compose(parcelNodeId, cityKey, staffLens);
});

document.getElementById("parcel-node-id").value = staffMap.parcelNodeId;
document.getElementById("city-key").value = staffMap.cityKey;
compose(staffMap.parcelNodeId, staffMap.cityKey, staffLens);
loadLenses();
