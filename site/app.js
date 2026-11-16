// Back Over the Range
// Data comes from data.json, which scripts/build.py writes from the files in
// data/ and content/. Each page of the site is a function below that returns
// HTML; the address after the # picks which one (#/place/lake-tahoe-ca).

// ---- Fixed labels and colors ----------------------------------------------

const MULTI_COLOR = "#8C8A84"; // places that appear in more than one guide
const NO_ENTRY_COLOR = "#FFFAEA";
const FALLBACK_COLORS = ["#2F5DA8", "#9C6B1F", "#6B3F8F", "#2C7F86"]; // guides with no color set

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

// ---- Small helpers ---------------------------------------------------------

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const label = (s) => String(s).replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const pageRef = (p) => (p ? (/[-–,]/.test(p) ? "pp. " : "p. ") + String(p).replace("-", "–") : "");
const surname = (author) => String(author).trim().split(/\s+/).pop();
const stripTags = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent.trim(); };
const firstNum = (p) => parseInt(String(p), 10) || 0;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const fmtDate = (iso) => { const d = new Date(iso + "T12:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("en-US"); };
const fmtMonth = (v) => {
  const m = /^(\d{4})-(\d{2})/.exec(v || "");
  if (!m) return v || "";
  return new Date(+m[1], +m[2] - 1, 15).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
const coordText = (p) => `${Math.abs(p.lat).toFixed(2)}° ${p.lat >= 0 ? "N" : "S"}, ${Math.abs(p.lon).toFixed(2)}° ${p.lon >= 0 ? "E" : "W"}`;

let DATA, guides = {}, places = {}, collections = {};

function kindsInUse() { return [...new Set(DATA.guides.map((g) => g.kind))].sort((a, b) => a.localeCompare(b)); }
function guideColor(g) { return g.color || FALLBACK_COLORS[DATA.guides.indexOf(g) % FALLBACK_COLORS.length]; }
// Sub-places: a place can name another as its 'parent' (Golden Gate Park in San Francisco).
function childrenOf(id) { return DATA.places.filter((q) => q.parent === id).sort((a, b) => a.name.localeCompare(b.name)); }
function ancestors(p) {
  const out = [];
  for (let q = places[p.parent]; q && out.length < 50; q = places[q.parent]) out.unshift(q);
  return out;
}
const inParent = (p) => (p.parent && places[p.parent] ? `In ${places[p.parent].name}` : "");
function placeGuides(p) { return [...new Set(p.entries.map((e) => e.guide))]; }
function placeColor(p) {
  const gs = placeGuides(p);
  if (!gs.length) return NO_ENTRY_COLOR;
  return gs.length > 1 ? MULTI_COLOR : guideColor(guides[gs[0]]);
}
function illustrationsFor(placeId) {
  return DATA.illustrations.flatMap((c) => c.items.filter((it) => it.place === placeId).map((it) => ({ ...it, collection: c })));
}
function cite(e) {
  const g = guides[e.guide];
  return `${esc(surname(g.author))}, ${esc(g.year)}${e.page ? " <span class=sep>·</span> " + esc(pageRef(e.page)) : ""}`;
}
function snippet(e, max = 110) {
  if (e.summary) return e.summary;
  const t = stripTags(e.quote_html);
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + "…" : t;
}
function statusBadge(p) { return `<span class="status status-${esc(p.status)}">${esc(STATUS_LABELS[p.status] || label(p.status))}</span>`; }
function visitedBadge(p) { return p.visited ? `<span class="visited">✔ Visited ${esc(fmtMonth(p.visited))}</span>` : `<span class="not-visited">Not visited yet</span>`; }
function dot(color) { return `<span class="dot" style="background:${esc(color)}"></span>`; }
function figure(it, cls = "") {
  const g = guides[it.guide];
  const bits = [g ? `<i>${esc(g.short_title)}</i>` : "", pageRef(it.page), it.material, it.artist].filter(Boolean);
  return `<figure class="illus ${cls}">
    ${it.src ? `<img src="${esc(it.src)}" alt="${esc(it.title)}" loading="lazy">` : `<div class="img-missing">Image coming soon</div>`}
    <figcaption><strong>${esc(it.title)}</strong>${bits.length ? "<br>" + bits.join(" <span class=sep>·</span> ") : ""}</figcaption>
  </figure>`;
}
const underConstruction = (what = "") => `<p class="uc-line"><img src="images/under-construction.gif" alt="Under construction" width="600" height="32">${what ? "<br>" + esc(what) : ""}</p>`;
// Places added in the last 30 days get a NEW! badge.
const NEW_DAYS = 30;
const isNew = (p) => p.added && (Date.now() - new Date(p.added + "T12:00:00")) / 864e5 <= NEW_DAYS;
const newBadge = (p) => (isNew(p) ? ' <img class="new" src="images/new.gif" alt="New" width="31" height="12">' : "");

// ---- The map ----------------------------------------------------------------

let map = null, cluster = null, markers = {}, mapFitted = false;

function setUpMap() {
  if (typeof L === "undefined") {
    $("map").innerHTML = `<p class="map-error">The map couldn’t load. Check your connection and refresh.</p>`;
    return;
  }
  map = L.map("map").setView([41, -112], 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  cluster = L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 36 }) : L.layerGroup();
  map.addLayer(cluster);
  for (const p of DATA.places) {
    const m = L.circleMarker([p.lat, p.lon], {
      radius: 8,
      color: "#1F2A1C",
      weight: 1.5,
      dashArray: p.precision === "exact" ? null : "3 3",
      fillColor: placeColor(p),
      fillOpacity: p.entries.length ? 0.95 : 0.6,
    });
    m.bindTooltip(esc(p.name));
    m.bindPopup(() => popupHtml(p), { maxWidth: 280, minWidth: 220 });
    markers[p.id] = m;
  }
}

function popupHtml(p) {
  const illus = illustrationsFor(p.id).find((it) => it.src);
  const e = p.entries[0];
  return `<div class="popup">
    ${illus ? `<figure><img src="${esc(illus.src)}" alt="${esc(illus.title)}"><figcaption>${esc(illus.title)}${illus.artist ? ", engraved by " + esc(illus.artist) : ""}</figcaption></figure>` : ""}
    <strong class="popup-name">${esc(p.name)}</strong>
    ${p.parent ? `<span class="popup-cite">${esc(inParent(p))}</span>` : ""}
    ${e ? `<span class="popup-cite">${esc(guides[e.guide].short_title)}, ${esc(guides[e.guide].year)}${e.page ? " <span class=sep>·</span> " + esc(pageRef(e.page)) : ""}</span>
      <q>${esc(snippet(e))}</q>` : `<span class="popup-cite">No guide entries yet</span>`}
    ${p.entries.length > 1 ? `<span class="popup-cite">+ ${plural(p.entries.length - 1, "more guide")}</span>` : ""}
    <a href="#/place/${esc(p.id)}">Read the entry and today’s notes →</a>
  </div>`;
}

function renderKey() {
  const used = DATA.guides.filter((g) => DATA.places.some((p) => placeGuides(p).length === 1 && placeGuides(p)[0] === g.id));
  const shown = used.length ? used : DATA.guides;
  $("key").innerHTML = `<strong>Key</strong>
    ${shown.map((g) => `<span>${dot(guideColor(g))}<em>${esc(g.short_title)}</em></span>`).join("")}
    <span>${dot(MULTI_COLOR)}In multiple guides</span>
    <span><span class="dot dashed"></span>Approximate location</span>`;
}

// ---- Map filters --------------------------------------------------------------

function fillSelect(id, pairs) {
  const sel = $(id);
  for (const [value, text] of pairs) sel.add(new Option(text, value));
}

function setUpFilters() {
  fillSelect("f-kind", kindsInUse().map((k) => [k, k]));
  fillSelect("f-guide", DATA.guides.map((g) => [g.id, `${g.short_title} (${g.year})`]));
  fillSelect("f-status", Object.entries(STATUS_LABELS));
  fillSelect("f-tag", [...new Set(DATA.places.flatMap((p) => p.tags))].sort().map((t) => [t, label(t)]));
  const decades = [...new Set(DATA.guides.map((g) => Math.floor(+g.year / 10) * 10).filter(Boolean))].sort();
  fillSelect("f-era", decades.map((d) => [String(d), `${d}s`]));
  for (const id of ["search", "f-kind", "f-guide", "f-status", "f-tag", "f-era", "f-illus", "f-visited"]) {
    $(id).addEventListener("input", applyFilters);
  }
  $("clear").addEventListener("click", () => {
    for (const id of ["search", "f-kind", "f-guide", "f-status", "f-tag", "f-era"]) $(id).value = "";
    $("f-illus").checked = $("f-visited").checked = false;
    applyFilters();
  });
  $("list").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-id]");
    if (b) showOnMap(b.dataset.id);
  });
}

function matches(p) {
  const q = $("search").value.trim().toLowerCase();
  const kind = $("f-kind").value, guide = $("f-guide").value, status = $("f-status").value;
  const tag = $("f-tag").value, era = $("f-era").value;
  const gs = p.entries.map((e) => guides[e.guide]);
  if (kind && !gs.some((g) => g.kind === kind)) return false;
  if (guide && !gs.some((g) => g.id === guide)) return false;
  if (era && !gs.some((g) => Math.floor(+g.year / 10) * 10 === +era)) return false;
  if (status && p.status !== status) return false;
  if (tag && !p.tags.includes(tag)) return false;
  if ($("f-illus").checked && !illustrationsFor(p.id).length) return false;
  if ($("f-visited").checked && !p.visited) return false;
  if (q) {
    const names = [p.name, p.region, ...p.former_names, ...p.entries.map((e) => e.name_in_guide), ...ancestors(p).map((a) => a.name)];
    if (!names.join(" ").toLowerCase().includes(q)) return false;
  }
  return true;
}

function applyFilters() {
  const shown = DATA.places.filter(matches).sort((a, b) => a.name.localeCompare(b.name));
  if (cluster) {
    cluster.clearLayers();
    for (const p of shown) cluster.addLayer(markers[p.id]);
  }
  const nGuides = new Set(shown.flatMap(placeGuides)).size;
  $("count").innerHTML = `${plural(shown.length, "place")} <span class=sep>·</span> ${plural(nGuides, "book")}`;
  $("list").innerHTML = shown.map((p) => `<li><button type="button" data-id="${esc(p.id)}">
      <span class="name">${dot(placeColor(p))}${esc(p.name)}${newBadge(p)}</span>
      ${p.parent ? `<span class="meta">${esc(inParent(p))}</span>` : ""}
      <span class="meta">${p.entries.length ? p.entries.map(cite).join(" <span class=sep>·</span> ") : "No guide entries yet"}</span>
    </button></li>`).join("") || `<li class="empty">No places match. Try clearing a filter.</li>`;
}

function showOnMap(id) {
  const m = markers[id];
  if (!m || !map) return;
  if (location.hash.replace(/\?.*/, "") !== "#/") { location.hash = "#/?place=" + id; return; }
  const open = () => { map.setView(m.getLatLng(), Math.max(map.getZoom(), 8)); m.openPopup(); };
  if (cluster.zoomToShowLayer && cluster.hasLayer(m)) cluster.zoomToShowLayer(m, open); else open();
  if (window.innerWidth < 760) $("map").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showMap(params) {
  $("map-page").hidden = false;
  $("page").innerHTML = "";
  if (!map) return;
  map.invalidateSize();
  if (params.get("guide") && guides[params.get("guide")]) {
    for (const id of ["search", "f-kind", "f-status", "f-tag", "f-era"]) $(id).value = "";
    $("f-illus").checked = $("f-visited").checked = false;
    $("f-guide").value = params.get("guide");
    applyFilters();
  }
  if (!mapFitted) {
    const pts = DATA.places.map((p) => [p.lat, p.lon]);
    if (pts.length === 1) map.setView(pts[0], 8);
    else if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2));
    mapFitted = true;
  }
  const visible = DATA.places.filter(matches);
  if (params.get("guide") && visible.length) map.fitBounds(L.latLngBounds(visible.map((p) => [p.lat, p.lon])).pad(0.2), { maxZoom: 9 });
  const want = params.get("place");
  if (want && places[want]) {
    // If the current filters hide this place, clear them so its marker is back on the map.
    if (!matches(places[want])) { $("clear").click(); }
    setTimeout(() => showOnMap(want), 50);
  }
}

// ---- Pages ---------------------------------------------------------------------

// "Read more": related books and articles, from read_more in the data. Nothing shows when the list is empty.
function readMore(items) {
  if (!items || !items.length) return "";
  return `<section class="panel read-more"><h2>Read more</h2><ul>${items.map((h) => `<li>${h}</li>`).join("")}</ul></section>`;
}

function crumbs(...parts) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.map(([text, href]) => href ? `<a href="${esc(href)}">${esc(text)}</a>` : `<span>${esc(text)}</span>`).join(" › ")}</nav>`;
}

function placePage(id) {
  const p = places[id];
  if (!p) return notFound("No place with that name yet.");
  const others = new Set([...p.former_names, ...p.entries.map((e) => e.name_in_guide)]);
  others.delete(p.name);
  const illus = illustrationsFor(id).filter((it) => it.src); // only ones with a picture
  const [first, ...rest] = p.entries;
  const kids = childrenOf(id);

  const entryBlock = (e) => {
    const g = guides[e.guide];
    return `<blockquote class="quote">${e.quote_html}</blockquote>
      <p class="source">${esc(g.author)}, <a href="#/guide/${esc(g.id)}"><i>${esc(g.short_title)}</i></a> (${esc(g.year)})${e.page ? ", " + esc(pageRef(e.page)) : ""}${e.section ? " <span class=sep>·</span> " + esc(e.section) : ""}${e.name_in_guide !== p.name ? ` <span class=sep>·</span> as “${esc(e.name_in_guide)}”` : ""}${g.scan_url ? ` <span class=sep>·</span> <a href="${esc(g.scan_url)}" target="_blank" rel="noopener">Read the page scan ↗</a>` : ""}</p>`;
  };

  // Next and previous place in the same guide, by page.
  let pager = "";
  if (first) {
    const g = guides[first.guide];
    const inGuide = DATA.places.flatMap((q) => q.entries.filter((e) => e.guide === g.id).map((e) => ({ q, page: firstNum(e.page) })))
      .sort((a, b) => a.page - b.page || a.q.name.localeCompare(b.q.name));
    const i = inGuide.findIndex((x) => x.q.id === id);
    const prev = inGuide[i - 1], next = inGuide[i + 1];
    if (prev || next) {
      pager = `<nav class="pager" aria-label="In ${esc(g.short_title)}">
        ${prev ? `<a href="#/place/${esc(prev.q.id)}">← ${esc(prev.q.name)}</a>` : "<span></span>"}
        <span class="meta">In <i>${esc(g.short_title)}</i></span>
        ${next ? `<a href="#/place/${esc(next.q.id)}">${esc(next.q.name)} →</a>` : "<span></span>"}
      </nav>`;
    }
  }

  const lat = p.lat.toFixed(4), lon = p.lon.toFixed(4);
  const q = encodeURIComponent(p.name);
  return `
    ${crumbs(["Map", "#/"], ...(p.regions.length === 1 ? [[p.region, "#/places"]] : []), ...ancestors(p).map((a) => [a.name, "#/place/" + a.id]), [p.name])}
    <h1>${esc(p.name)}</h1>
    <p class="meta-line">${[label(p.category), p.region, coordText(p)].filter(Boolean).map(esc).join(" <span class=sep>·</span> ")}
      <span class=sep>·</span> <a href="#/?place=${esc(p.id)}">Show on map</a> <span class=sep>·</span> <a href="#/place/${esc(p.id)}/get-there">Get there</a>
      ${p.parent ? `<br>In <a href="#/place/${esc(p.parent)}">${esc(places[p.parent].name)}</a>` : ""}
      ${others.size ? `<br>Also called: ${esc([...others].join(", "))}` : ""}</p>

    <div class="place-grid">
      <div class="place-main">
        ${first ? `<section class="panel">${entryBlock(first)}</section>` : `<section class="panel"><p class="meta">No guide entries yet.</p></section>`}
        ${illus.length ? `<section class="illus-row">${illus.map((it) => figure(it)).join("")}</section>` : ""}
        ${rest.length ? `<section class="panel"><h2>In other guides</h2>
          ${rest.map((e) => `<details><summary>${esc(guides[e.guide].short_title)}, ${esc(guides[e.guide].year)}${e.page ? ", " + esc(pageRef(e.page)) : ""}</summary>${entryBlock(e)}</details>`).join("")}
        </section>` : ""}
        ${kids.length ? `<section class="panel"><h2>Places in ${esc(p.name)}</h2>
          <ul class="sub-places">${kids.map((k) => `<li>${dot(placeColor(k))}<a href="#/place/${esc(k.id)}">${esc(k.name)}</a>${k.entries.length ? ` <span class="meta">${k.entries.map(cite).join(" <span class=sep>·</span> ")}</span>` : ""}</li>`).join("")}</ul>
        </section>` : ""}
        ${readMore(p.read_more)}
        ${pager}
      </div>
      <div class="place-side">
        <section class="panel today">
          ${p.photos.length ? p.photos.map((ph) => `<figure class="photo"><img src="${esc(ph.src)}" alt="${esc(ph.caption || p.name)}" loading="lazy">${ph.caption ? `<figcaption>${esc(ph.caption)}</figcaption>` : ""}</figure>`).join("") : ""}
          <h2>Back over the range: today</h2>
          <p class="badges">${statusBadge(p)} ${visitedBadge(p)}</p>
          ${p.status_summary ? `<p>${esc(p.status_summary)}</p>` : ""}
          ${p.notes_html || `<p class="meta">No notes on ${esc(p.name)} today yet.</p>`}
          ${p.tags.length ? `<p class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</p>` : ""}
        </section>
        <section class="panel" id="get-there">
          <h2>Get there</h2>
          <p class="meta">${lat}, ${lon}${p.coords_source ? " <span class=sep>·</span> " + esc(p.coords_source) : ""}${p.precision !== "exact" ? ` <span class=sep>·</span> <span class="approx">${esc(p.precision)} location</span>` : ""}</p>
          <p class="buttons">
            <a class="btn" href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener">Google Maps ↗</a>
            <a class="btn" href="https://maps.apple.com/?ll=${lat},${lon}&q=${q}" target="_blank" rel="noopener">Apple Maps ↗</a>
            <a class="btn" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}" target="_blank" rel="noopener">OpenStreetMap ↗</a>
            <button type="button" class="btn" data-copy="${lat}, ${lon}">Copy coordinates</button>
          </p>
          <p class="disclaimer">Locations come from old guidebooks and may be approximate. Some places are on private land, closed, unsafe or no longer there. This site does not know the current state of any place and takes no responsibility for visits. <a href="#/about/visiting-these-places">More</a>.</p>
        </section>
      </div>
    </div>`;
}

function placesPage() {
  // A to Z, with each place's sub-places right under it, indented.
  const sorted = [];
  const add = (q, depth) => { sorted.push({ ...q, depth }); for (const k of childrenOf(q.id)) if (depth < 50) add(k, depth + 1); };
  for (const q of DATA.places.filter((q) => !q.parent || !places[q.parent]).sort((a, b) => a.name.localeCompare(b.name))) add(q, 0);
  return `
    <h1>Places</h1>
    <p class="lede">Every place on the map, A to Z, with places inside a town listed under it. ${plural(sorted.length, "place")} so far.</p>
    <label class="field narrow">Search <input type="search" id="places-search" placeholder="Name, then or now"></label>
    <table class="table" id="places-table">
      <thead><tr><th>Place</th><th>Region</th><th>In the guides</th><th>Today</th></tr></thead>
      <tbody>${sorted.map((p) => `<tr data-names="${esc([p.name, p.region, ...p.former_names, ...p.entries.map((e) => e.name_in_guide), ...ancestors(p).map((x) => x.name)].join(" ").toLowerCase())}">
        <td${p.depth ? ` class="sub" style="padding-left:${0.6 + 1.2 * p.depth}em"` : ""}>${p.depth ? '<span class="sub-mark" aria-hidden="true">↳ </span>' : ""}${dot(placeColor(p))}<a href="#/place/${esc(p.id)}">${esc(p.name)}</a>${newBadge(p)}${p.visited ? ' <span class="visited small" title="Visited">✔</span>' : ""}</td>
        <td>${esc(p.region)}</td>
        <td>${p.entries.length ? p.entries.map(cite).join("<br>") : '<span class="meta">None yet</span>'}</td>
        <td>${statusBadge(p)}</td></tr>`).join("")}</tbody>
    </table>
    ${sorted.length ? "" : underConstruction("Places are being added.")}`;
}

function guidesPage() {
  const byKind = {};
  for (const g of DATA.guides) (byKind[g.kind] ||= []).push(g);
  return `
    <h1>Guides</h1>
    <p class="lede">The books on the map, by kind. Each guide is in the US public domain and links to a full scan.</p>
    ${kindsInUse().map((k) => `
      <section class="panel">
        <h2>${esc(k)}</h2>
        <ul class="guide-list">${byKind[k].sort((a, b) => a.year - b.year).map((g) => `<li>
          ${dot(guideColor(g))}<a href="#/guide/${esc(g.id)}"><i>${esc(g.short_title)}</i></a>, ${esc(g.author)}, ${esc(g.year)}
          <span class="meta"> <span class=sep>·</span> ${plural(placesIn(g.id).length, "place")}${g.covers ? " <span class=sep>·</span> " + esc(g.covers) : ""}</span></li>`).join("")}</ul>
      </section>`).join("")}`;
}

function placesIn(gid) {
  return DATA.places.flatMap((p) => p.entries.filter((e) => e.guide === gid).map((e) => ({ p, e })))
    .sort((a, b) => firstNum(a.e.page) - firstNum(b.e.page) || a.p.name.localeCompare(b.p.name));
}

function guidePage(id) {
  const g = guides[id];
  if (!g) return notFound("No guide with that id.");
  const subtitle = g.title.startsWith(g.short_title) ? g.title.slice(g.short_title.length).replace(/^[:.\s]+/, "") : g.title;
  const list = placesIn(id);
  const shared = [...new Set(DATA.illustrations.flatMap((c) => c.items.filter((it) => it.guide === id).map(() => c.id)))]
    .map((cid) => collections[cid]);
  return `
    ${crumbs(["Guides", "#/guides"], [g.kind, "#/guides"], [g.short_title])}
    <div class="guide-head">
      <div class="cover">${dot(guideColor(g))}<span>${esc(g.kind)}</span></div>
      <div>
        <h1><i>${esc(g.short_title)}</i></h1>
        ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ""}
        <p class="meta-line">${[g.author, g.publisher, g.year && `${g.year} edition`, g.first_published && g.first_published !== g.year ? `first published ${g.first_published}` : ""].filter(Boolean).map(esc).join(" <span class=sep>·</span> ")}</p>
        <p class="buttons">
          ${g.scan_url ? `<a class="btn" href="${esc(g.scan_url)}" target="_blank" rel="noopener">Read it on the Internet Archive ↗</a>` : `<span class="btn disabled">Scan link coming soon</span>`}
          ${g.hathitrust_url ? `<a class="btn" href="${esc(g.hathitrust_url)}" target="_blank" rel="noopener">HathiTrust ↗</a>` : ""}
          <a class="btn" href="#/?guide=${esc(g.id)}">Show its places on the map</a>
        </p>
        ${g.summary_html}
      </div>
    </div>
    <div class="two-col">
      <section class="panel">
        <h2>Places in this book, in page order</h2>
        ${list.length ? `<ol class="page-order">${list.map(({ p, e }) => `<li><a href="#/place/${esc(p.id)}">${esc(p.name)}</a> <span class="meta">${esc(pageRef(e.page))}</span></li>`).join("")}</ol>` : underConstruction("Entries are being added.")}
      </section>
      <div>
      <section class="panel">
        <h2>At a glance</h2>
        <dl class="glance">
          <dt>Kind of book</dt><dd>${esc(g.kind)}</dd>
          ${g.covers ? `<dt>Covers</dt><dd>${esc(g.covers)}</dd>` : ""}
          <dt>Places on the map</dt><dd>${list.length}</dd>
          <dt>Map color</dt><dd>${dot(guideColor(g))}${esc(guideColor(g))}</dd>
          ${shared.length ? `<dt>Illustrations</dt><dd>${shared.map((c) => `<a href="#/illustrations/${esc(c.id)}">${esc(c.title)}</a>`).join(", ")}</dd>` : ""}
        </dl>
      </section>
      ${readMore(g.read_more)}
      </div>
    </div>`;
}

function comparePage(params) {
  const a = guides[params.get("a")] ? params.get("a") : DATA.guides[0]?.id;
  const b = params.get("b") && (params.get("b") === "today" || guides[params.get("b")]) ? params.get("b") : "today";
  const region = params.get("region") || "", tag = params.get("tag") || "";
  const regions = [...new Set(DATA.places.flatMap((p) => p.regions))].sort();
  const tags = [...new Set(DATA.places.flatMap((p) => p.tags))].sort();
  const opt = (v, text, cur) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(text)}</option>`;
  const gOpt = (cur) => DATA.guides.map((g) => opt(g.id, `${surname(g.author)}, ${g.short_title} (${g.year})`, cur)).join("");

  const inA = (p) => p.entries.some((e) => e.guide === a);
  const inB = (p) => b === "today" || p.entries.some((e) => e.guide === b);
  const rows = DATA.places.filter((p) => (b === "today" ? inA(p) : inA(p) || inB(p)))
    .filter((p) => (!region || p.regions.includes(region)) && (!tag || p.tags.includes(tag)))
    .sort((x, y) => firstNum(x.entries.find((e) => e.guide === a)?.page ?? 1e9) - firstNum(y.entries.find((e) => e.guide === a)?.page ?? 1e9) || x.name.localeCompare(y.name));

  const count = (statuses) => rows.filter((p) => statuses.includes(p.status)).length;
  const cell = (p, gid) => {
    const e = p.entries.find((x) => x.guide === gid);
    return e ? `<q>${esc(snippet(e, 140))}</q> <span class="meta">${esc(pageRef(e.page))}</span>` : `<span class="meta">Not in this guide</span>`;
  };
  const today = (p) => `${statusBadge(p)} ${p.status_summary ? esc(p.status_summary) : ""}`;
  const gA = guides[a];
  const rowsA = rows.filter(inA);
  const pages = rowsA.map((p) => p.entries.find((e) => e.guide === a)).filter(Boolean).map((e) => firstNum(e.page)).filter(Boolean);

  return `
    <h1>Then and now</h1>
    <p class="lede">Line the guides up against each other and against today. Every row links to the full entry.</p>
    <form class="compare-form" id="compare-form">
      <label class="field">Compare <select name="a">${gOpt(a)}</select></label>
      <label class="field">with <select name="b">${opt("today", "Today", b)}${gOpt(b)}</select></label>
      <label class="field">Places <select name="region">${opt("", "Everywhere", region)}${regions.map((r) => opt(r, r, region)).join("")}</select></label>
      <label class="field">Theme <select name="tag">${opt("", "Any theme", tag)}${tags.map((t) => opt(t, label(t), tag)).join("")}</select></label>
    </form>
    ${gA ? `<div class="two-col compare-top">
      <section class="panel">
        <h2>These places today</h2>
        <dl class="glance">
          <dt>Still there</dt><dd>${count(["thriving", "transformed", "declined"])}</dd>
          <dt>Renamed or absorbed</dt><dd>${count(["renamed", "absorbed"])}</dd>
          <dt>Ghost town or gone</dt><dd>${count(["ghost-town", "gone"])}</dd>
          <dt>Unknown</dt><dd>${count(["unknown"])}</dd>
        </dl>
      </section>
      <section class="panel">
        <h2>In the guides</h2>
        <p>${plural(rowsA.length, "place")}${pages.length ? ` <span class=sep>·</span> ${esc(pageRef(Math.min(...pages) === Math.max(...pages) ? String(pages[0]) : `${Math.min(...pages)}-${Math.max(...pages)}`))}` : ""} <span class=sep>·</span> <i>${esc(gA.short_title)}</i>, ${esc(gA.year)}</p>
        <p class="meta">Counts come straight from the entries; nothing here is written by hand.</p>
      </section>
    </div>
    <table class="table compare-table">
      <thead><tr><th>Place</th><th>${esc(surname(gA.author))}, ${esc(gA.year)}</th><th>${b === "today" ? "Today" : esc(surname(guides[b].author) + ", " + guides[b].year)}</th></tr></thead>
      <tbody>${rows.map((p) => `<tr><td><a href="#/place/${esc(p.id)}">${esc(p.name)}</a></td><td>${cell(p, a)}</td><td>${b === "today" ? today(p) : cell(p, b)}</td></tr>`).join("")
        || `<tr><td colspan="3" class="meta">No places match.</td></tr>`}</tbody>
    </table>` : underConstruction("Add a guide to compare.")}`;
}

function illustrationsPage() {
  return `
    <h1>Illustrations</h1>
    <p class="lede">Engravings, maps and other illustrations from the guides, grouped by collection. Each illustration is linked to the place it shows, so it also appears on that place’s page and in its map popup.</p>
    <section class="cards">${DATA.illustrations.map((c) => `
      <a class="card" href="#/illustrations/${esc(c.id)}">
        ${c.cover ? `<img src="${esc(c.cover)}" alt="">` : (c.items.find((it) => it.src) ? `<img src="${esc(c.items.find((it) => it.src).src)}" alt="">` : `<div class="img-missing">Image coming soon</div>`)}
        <h2>${esc(c.title)}</h2>
        <p class="meta">${[plural(c.items.length, "item"), c.holding, c.dates].filter(Boolean).map(esc).join(" <span class=sep>·</span> ")}</p>
      </a>`).join("") || underConstruction("Collections are being added.")}
    </section>
    <p class="meta">On the map, tick “Only places with illustrations” to see where they are.</p>`;
}

function collectionPage(id) {
  const c = collections[id];
  if (!c) return notFound("No collection with that id.");
  const books = DATA.guides.filter((g) => c.items.some((it) => it.guide === g.id));
  const lead = c.items.find((it) => it.src);
  return `
    ${crumbs(["Illustrations", "#/illustrations"], [c.title])}
    <div class="guide-head">
      <div>
        <h1>${esc(c.title)}</h1>
        ${c.intro_html}
        <p class="meta-line">${[c.holding, c.dates].filter(Boolean).map(esc).join(" <span class=sep>·</span> ")}</p>
      </div>
      ${lead ? figure(lead, "lead") : ""}
    </div>
    ${books.length ? `<section class="panel"><h2>Books that use them</h2>
      <table class="table"><thead><tr><th>Book</th><th>Year</th><th>Publisher</th><th>Illustrations</th></tr></thead>
      <tbody>${books.map((g) => `<tr><td><a href="#/guide/${esc(g.id)}"><i>${esc(g.short_title)}</i></a>, ${esc(g.author)}</td><td>${esc(g.year)}</td><td>${esc(g.publisher)}</td><td>${c.items.filter((it) => it.guide === g.id).length}</td></tr>`).join("")}</tbody></table>
    </section>` : ""}
    <section class="panel">
      <h2>The illustrations</h2>
      ${c.items.length ? `<div class="illus-grid">${c.items.map((it) => it.place && places[it.place]
        ? `<a href="#/place/${esc(it.place)}" class="illus-link">${figure(it)}</a>` : figure(it)).join("")}</div>` : underConstruction("Illustrations are being added.")}
    </section>`;
}

function textPage(name, section) {
  const html = DATA.pages[name] || "";
  const holder = document.createElement("div");
  holder.innerHTML = html;
  const heads = [...holder.querySelectorAll("h2[id]")];
  const side = heads.length > 3
    ? `<nav class="side-menu" aria-label="On this page"><ul>${heads.map((h) => `<li><a href="#/${name}/${esc(h.id)}">${esc(h.textContent)}</a></li>`).join("")}</ul></nav>`
    : "";
  return `<div class="text-page${side ? " with-side" : ""}">${side}<article class="prose">${html}</article></div>`;
}

function notFound(msg = "") {
  return `<h1>Not found</h1><p>${esc(msg)} <a href="#/">Back to the map</a>.</p>`;
}

// ---- Router -------------------------------------------------------------------------

function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const [section, id, sub] = path.split("/").map(decodeURIComponent);

  // Old links like #seattle-wa still open the place.
  if (section && !id && places[section]) { location.replace("#/place/" + section); return; }

  for (const a of document.querySelectorAll(".main-nav a")) {
    const nav = a.dataset.nav;
    const on = (nav === "map" && !section) || nav === section || (nav === "places" && section === "place") || (nav === "guides" && section === "guide");
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }

  if (!section) { document.title = "Back Over the Range"; showMap(params); return; }

  $("map-page").hidden = true;
  let html, title;
  switch (section) {
    case "place": html = placePage(id); title = places[id]?.name; break;
    case "places": html = placesPage(); title = "Places"; break;
    case "guides": html = guidesPage(); title = "Guides"; break;
    case "guide": html = guidePage(id); title = guides[id]?.short_title; break;
    case "compare": html = comparePage(params); title = "Compare"; break;
    case "illustrations": html = id ? collectionPage(id) : illustrationsPage(); title = id ? collections[id]?.title : "Illustrations"; break;
    case "about": html = textPage("about"); title = "About"; break;
    case "learn-more": html = textPage("learn-more"); title = "Learn more"; break;
    default: html = notFound("That page doesn’t exist.");
  }
  document.title = (title ? title + " · " : "") + "Back Over the Range";
  $("page").innerHTML = html;

  // Jump to a section (#/about/contact, #/place/x/get-there) or to the top.
  const target = section === "place" ? sub : id;
  const el = target && $(target);
  if (el && section !== "illustrations") el.scrollIntoView({ block: "start" });
  else window.scrollTo(0, 0);
}

// Page interactions that need JavaScript.
document.addEventListener("click", (ev) => {
  if (ev.target.closest(".skip")) {
    // Jump to the content without changing the address (the router owns the #).
    ev.preventDefault();
    $("view").focus();
    return;
  }
  const copy = ev.target.closest("[data-copy]");
  if (copy) {
    const text = copy.dataset.copy;
    const done = () => { copy.textContent = "Copied!"; setTimeout(() => (copy.textContent = "Copy coordinates"), 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt("Copy these coordinates:", text));
    else prompt("Copy these coordinates:", text);
  }
});
document.addEventListener("input", (ev) => {
  if (ev.target.id === "places-search") {
    const q = ev.target.value.trim().toLowerCase();
    for (const tr of document.querySelectorAll("#places-table tbody tr")) tr.hidden = q && !tr.dataset.names.includes(q);
  }
});
document.addEventListener("change", (ev) => {
  const form = ev.target.closest("#compare-form");
  if (form) location.hash = "#/compare?" + new URLSearchParams(new FormData(form)).toString();
});

// ---- Header, marquee and footer ---------------------------------------------------

function showFrame(data) {
  const s = data.site || {};
  if (s.tagline) $("tagline").textContent = s.tagline;
  if (s.marquee && s.marquee.length) {
    $("marquee").textContent = "★ " + s.marquee.join(" ★ ") + " ★";
    $("marquee").hidden = false;
  }
  if (data.updated) $("updated").innerHTML = " <span class=sep>·</span> Last updated " + fmtDate(data.updated);

  const code = s.goatcounter;
  if (!code) return;
  const base = `https://${code}.goatcounter.com`;
  // Count this visit.
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  script.dataset.goatcounter = base + "/count";
  document.body.appendChild(script);
  // Show the running total for the whole site.
  fetch(base + "/counter/TOTAL.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((res) => {
      const digits = String(res.count || "").replace(/\D/g, "");
      if (!digits) return;
      $("visitor-digits").innerHTML = digits.padStart(6, "0").split("").map((c) => `<span>${c}</span>`).join("");
      $("visitors").hidden = false;
    })
    .catch(() => {}); // the counter is decoration; never break the site over it
}

// ---- Start ----------------------------------------------------------------------------

fetch("data.json")
  .then((r) => r.json())
  .then((data) => {
    DATA = data;
    DATA.illustrations ||= [];
    DATA.pages ||= {};
    guides = Object.fromEntries(data.guides.map((g) => [g.id, g]));
    places = Object.fromEntries(data.places.map((p) => [p.id, p]));
    collections = Object.fromEntries(data.illustrations.map((c) => [c.id, c]));
    showFrame(data);
    setUpMap();
    setUpFilters();
    renderKey();
    applyFilters();
    window.addEventListener("hashchange", route);
    route();
  })
  .catch((err) => {
    $("page").innerHTML = `<p class="panel">Could not load the data (${esc(err.message)}). If you opened index.html directly, run the local preview instead (see README).</p>`;
    console.error(err);
  });
