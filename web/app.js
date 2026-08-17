function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

function renderCompose(data) {
  const site = document.getElementById("site");
  const url = data.smartsite?.url || "";
  site.src = url || "about:blank";
  setText("smartsite-basis", url ? url : data.smartsite?.basis || "");

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

async function compose(parcelNodeId, cityKey) {
  const params = new URLSearchParams();
  if (parcelNodeId) params.set("parcelNodeId", parcelNodeId);
  if (cityKey) params.set("cityKey", cityKey);
  const res = await fetch(`/api/lenses/city-manager/compose?${params}`);
  const data = await res.json();
  renderCompose(data);
}

async function loadLenses() {
  const lensesRes = await fetch("/api/lenses");
  const { lenses } = await lensesRes.json();
  const root = document.getElementById("lenses");
  root.replaceChildren(
    ...lenses.map((lens) => {
      const el = document.createElement("article");
      const title = document.createElement("strong");
      title.textContent = lens.id;
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

document.getElementById("compose-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const parcelNodeId = document.getElementById("parcel-node-id").value.trim();
  const cityKey = document.getElementById("city-key").value.trim();
  compose(parcelNodeId, cityKey);
});

loadLenses();
