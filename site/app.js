// Back Over the Range: the map page.
// Data comes from data.json, which scripts/build.py writes from the files in data/.

const STATUS_COLORS = {
  thriving: "#3f7d3a",
  transformed: "#5a4b9b",
  renamed: "#2c7f86",
  absorbed: "#c27a1a",
  declined: "#a8892a",
  "ghost-town": "#7a5230",
  gone: "#9b2d22",
  unknown: "#8a8a8a",
};
const STATUS_LABELS = {
  thriving: "Thriving",
  transformed: "Transformed",
  renamed: "Renamed",
  absorbed: "Absorbed into another place",
  declined: "Declined",
  "ghost-town": "Ghost town",
  gone: "Gone",
  unknown: "Unknown",
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const label = (s) => String(s).replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

let DATA, guidesById, markersById = {};

// ---- Map ---------------------------------------------------------------

const map = L.map("map", { zoomControl: true }).setView([41, -112], 5);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 });
map.addLayer(cluster);

function makeMarker(place) {
  const hasEntries = place.entries.length > 0;
  const m = L.circleMarker([place.lat, place.lon], {
    radius: 8,
    color: "#2b2620",
    weight: 1.5,
    dashArray: place.precision === "exact" ? null : "3 3",
    fillColor: STATUS_COLORS[place.status] || STATUS_COLORS.unknown,
    fillOpacity: hasEntries ? 0.9 : 0.35,
  });
  m.bindTooltip(esc(place.name));
  m.on("click", () => openPlace(place.id));
  return m;
}

// ---- Filters -------------------------------------------------------------

function fillSelect(id, values, toLabel = label) {
  const sel = $(id);
  for (const v of values) sel.add(new Option(toLabel(v), v));
}

function currentFilters() {
  return {
    q: $("search").value.trim().toLowerCase(),
    guide: $("f-guide").value,
    status: $("f-status").value,
    category: $("f-category").value,
    tag: $("f-tag").value,
  };
}

function matches(place, f) {
  if (f.guide && !place.entries.some((e) => e.guide === f.guide)) return false;
  if (f.status && place.status !== f.status) return false;
  if (f.category && place.category !== f.category) return false;
  if (f.tag && !place.tags.includes(f.tag)) return false;
  if (f.q) {
    const names = [place.name, place.region, ...place.former_names, ...place.entries.map((e) => e.name_in_guide)];
    if (!names.join(" ").toLowerCase().includes(f.q)) return false;
  }
  return true;
}

function applyFilters() {
  const f = currentFilters();
  const shown = DATA.places.filter((p) => matches(p, f));
  cluster.clearLayers();
  cluster.addLayers(shown.map((p) => markersById[p.id]));
  renderList(shown);
  $("count").textContent = `${shown.length} of ${DATA.places.length} places`;
}

// ---- List and detail -------------------------------------------------------

function renderList(places) {
  const sorted = [...places].sort((a, b) => a.name.localeCompare(b.name));
  $("list").innerHTML = sorted.map((p) => {
    const guides = [...new Set(p.entries.map((e) => guidesById[e.guide].short_title))];
    return `<li><button data-id="${esc(p.id)}">
      <span class="dot" style="background:${STATUS_COLORS[p.status]}"></span>
      <span><span class="name">${esc(p.name)}</span>${p.region ? `, <span class="meta">${esc(p.region)}</span>` : ""}
      <br><span class="meta">${guides.length ? esc(guides.join(" · ")) : "No guide entries yet"}</span></span>
    </button></li>`;
  }).join("");
}

function openPlace(id, { fly = true } = {}) {
  const place = DATA.places.find((p) => p.id === id);
  if (!place) return;
  if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);

  const otherNames = new Set([...place.former_names, ...place.entries.map((e) => e.name_in_guide)]);
  otherNames.delete(place.name);

  const entries = place.entries.map((e) => {
    const g = guidesById[e.guide];
    const title = g.scan_url ? `<a href="${esc(g.scan_url)}" target="_blank" rel="noopener">${esc(g.short_title)}</a>` : esc(g.short_title);
    return `<section class="entry">
      <div class="cite"><strong>${title}</strong>, ${esc(g.author)}, ${esc(g.year)}${e.page ? `, p. ${esc(e.page)}` : ""}${e.section ? ` · ${esc(e.section)}` : ""}
      ${e.name_in_guide !== place.name ? `<br>as “${esc(e.name_in_guide)}”` : ""}</div>
      <blockquote>${e.quote_html}</blockquote>
    </section>`;
  }).join("") || `<p class="meta">No guide entries yet.</p>`;

  $("detail").innerHTML = `
    <button class="link-button back" id="back">← All places</button>
    <h2>${esc(place.name)}</h2>
    <p class="sub">${[place.region, label(place.category)].filter(Boolean).map(esc).join(" · ")}
      ${otherNames.size ? `<br>Also: ${esc([...otherNames].join(", "))}` : ""}</p>
    ${place.precision !== "exact" ? `<p class="precision-note">Location is ${esc(place.precision)}.</p>` : ""}
    <h3>In the guides</h3>
    ${entries}
    <h3>Today</h3>
    <p><span class="badge" style="background:${STATUS_COLORS[place.status]}">${esc(STATUS_LABELS[place.status])}</span>
      ${place.visited ? `<span class="meta"> · visited ${esc(place.visited)}</span>` : ""}</p>
    ${place.status_summary ? `<p>${esc(place.status_summary)}</p>` : ""}
    <div class="notes">${place.notes_html}</div>
    ${place.tags.length ? `<p class="tags">Themes: ${esc(place.tags.join(", "))}</p>` : ""}
  `;
  $("browse").hidden = true;
  $("detail").hidden = false;
  $("detail").scrollIntoView({ block: "start" });
  $("back").addEventListener("click", closePlace);

  if (fly) {
    const m = markersById[id];
    cluster.zoomToShowLayer(m, () => map.setView(m.getLatLng(), Math.max(map.getZoom(), 9)));
  }
}

function closePlace() {
  history.replaceState(null, "", location.pathname + location.search);
  $("detail").hidden = true;
  $("browse").hidden = false;
}

// ---- Start -----------------------------------------------------------------

fetch("data.json")
  .then((r) => r.json())
  .then((data) => {
    DATA = data;
    showFooter(data);
    guidesById = Object.fromEntries(data.guides.map((g) => [g.id, g]));
    for (const p of data.places) markersById[p.id] = makeMarker(p);

    fillSelect("f-guide", data.guides.map((g) => g.id), (id) => `${guidesById[id].short_title} (${guidesById[id].year})`);
    fillSelect("f-status", Object.keys(STATUS_LABELS).filter((s) => data.places.some((p) => p.status === s)), (s) => STATUS_LABELS[s]);
    fillSelect("f-category", [...new Set(data.places.map((p) => p.category))].sort());
    fillSelect("f-tag", [...new Set(data.places.flatMap((p) => p.tags))].sort());

    for (const id of ["search", "f-guide", "f-status", "f-category", "f-tag"]) $(id).addEventListener("input", applyFilters);
    $("list").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-id]");
      if (b) openPlace(b.dataset.id);
    });
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "legend");
      const used = Object.keys(STATUS_LABELS).filter((s) => data.places.some((p) => p.status === s));
      div.innerHTML = "<strong>Today</strong><br>" + used.map((s) => `<i style="background:${STATUS_COLORS[s]}"></i>${esc(STATUS_LABELS[s])}`).join("<br>") +
        "<br><i style=\"background:#fff;border-style:dashed\"></i>Approximate location";
      return div;
    };
    legend.addTo(map);
    applyFilters();
    if (data.places.length) map.fitBounds(L.latLngBounds(data.places.map((p) => [p.lat, p.lon])).pad(0.2));

    const hashId = decodeURIComponent(location.hash.slice(1));
    if (hashId) openPlace(hashId);
  })
  .catch((err) => {
    $("list").innerHTML = `<li class="meta" style="padding:16px">Could not load the data (${esc(err.message)}). If you opened index.html directly, run the local preview instead (see README).</li>`;
  });

// ---- Footer: last updated and visitor counter ------------------------------

function showFooter(data) {
  if (data.updated) {
    const d = new Date(data.updated + "T12:00:00");
    $("updated").textContent = "Last updated " + d.toLocaleDateString("en-US");
  }
  const code = data.site && data.site.goatcounter;
  if (!code) return;
  const base = `https://${code}.goatcounter.com`;
  // Count this visit.
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = base + "/count";
  document.body.appendChild(s);
  // Show the running total for the whole site.
  fetch(base + "/counter/TOTAL.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((res) => {
      const digits = String(res.count || "").replace(/\D/g, "");
      if (!digits) return;
      $("visitor-digits").innerHTML = digits.padStart(6, "0").split("").map((c) => `<span>${c}</span>`).join("");
      $("visitors").hidden = false;
    })
    .catch(() => {}); // counter is decoration; never break the map over it
}

$("about-toggle").addEventListener("click", (ev) => {
  const about = $("about");
  about.hidden = !about.hidden;
  ev.target.setAttribute("aria-expanded", String(!about.hidden));
});
