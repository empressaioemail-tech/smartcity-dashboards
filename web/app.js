async function load() {
  const [lensesRes, mountsRes] = await Promise.all([
    fetch("/api/lenses"),
    fetch("/api/mounts"),
  ]);
  const { lenses } = await lensesRes.json();
  const { smartsiteExample } = await mountsRes.json();
  const root = document.getElementById("lenses");
  root.replaceChildren(
    ...lenses.map((lens) => {
      const el = document.createElement("article");
      el.innerHTML = `<strong>${lens.id}</strong><div class="meta">${lens.audience}</div><p>${lens.needs}</p>`;
      return el;
    }),
  );
  document.getElementById("site").src = smartsiteExample;
}

load();
