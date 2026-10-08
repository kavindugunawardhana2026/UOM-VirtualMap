(function () {
  const { PLACES, CHECKPOINTS, CATEGORIES, EVENT, CAMPUS_DATA, CampusRouter } = window;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = Object.fromEntries(PLACES.map((p) => [p.id, p]));
  const cpById = Object.fromEntries(CHECKPOINTS.map((c) => [c.id, c]));
  const WALK_M_PER_MIN = 75;
  const params = new URLSearchParams(location.search);

  const state = {
    start: cpById[params.get("from")] ? { kind: "cp", id: params.get("from") } : { kind: "cp", id: CHECKPOINTS[0].id },
    scannedQR: !!cpById[params.get("from")],
    selected: null,   // place id
    room: null,       // room code
    query: "",
    cat: null,
    gps: null,        // { at, acc }
  };

  // ------------------------------------------------------------------ map
  const isDesktop = () => matchMedia("(min-width: 820px)").matches;
  const map = L.map("map", { zoomControl: false, maxZoom: 20, minZoom: 15, attributionControl: true });
  if (isDesktop()) L.control.zoom({ position: "bottomright" }).addTo(map);

  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 19, maxZoom: 20, className: "osm-tiles",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxNativeZoom: 19, maxZoom: 20, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
  });
  let base = "map";
  osm.addTo(map);
  map.getContainer().classList.add("dim-tiles");

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const campusBounds = L.latLngBounds(CAMPUS_DATA.campus);
  map.fitBounds(campusBounds, { padding: [10, 10] });
  map.setMaxBounds(campusBounds.pad(1.2));

  // Our own vector drawing of campus: this still works with no tiles (offline).
  const vector = L.layerGroup().addTo(map);
  const buildingLayers = {};
  function drawVector() {
    vector.clearLayers();
    L.polygon(CAMPUS_DATA.campus, { color: css("--accent"), weight: 2, dashArray: "6 6", fill: false, interactive: false }).addTo(vector);
    for (const road of CAMPUS_DATA.roads) {
      L.polyline(road, { color: css("--road-casing"), weight: 9, opacity: base === "sat" ? 0 : 0.9, interactive: false }).addTo(vector);
    }
    for (const road of CAMPUS_DATA.roads) {
      L.polyline(road, { color: css("--road"), weight: 6, opacity: base === "sat" ? 0 : 1, interactive: false }).addTo(vector);
    }
    for (const [id, ring] of Object.entries(CAMPUS_DATA.buildings)) {
      buildingLayers[id] = L.polygon(ring, buildingStyle(false)).addTo(vector);
    }
    const place = byId[state.selected];
    if (place && buildingLayers[place.osm]) buildingLayers[place.osm].setStyle(buildingStyle(true));
  }
  function buildingStyle(sel) {
    if (sel) return { color: css("--accent"), weight: 3, fillColor: css("--accent"), fillOpacity: 0.35, interactive: false };
    return { color: css("--bldg-line"), weight: 1, fillColor: css("--bldg"), fillOpacity: base === "sat" ? 0 : 0.75, opacity: base === "sat" ? 0 : 1, interactive: false };
  }
  drawVector();

  // Place pins + labels
  const pinLayer = L.layerGroup().addTo(map);
  const pins = {};
  function pinIcon(p, sel) {
    const c = CATEGORIES[p.cat] || CATEGORIES.other;
    const size = sel ? 40 : 30;
    return L.divIcon({
      className: "", iconSize: [size, size], iconAnchor: [size / 2, size],
      html: `<div class="pin${sel ? " sel" : ""}" style="background:${c.color}"><span>${c.icon}</span></div>`,
    });
  }
  for (const p of PLACES) {
    const m = L.marker(p.at, { icon: pinIcon(p, false), title: p.name, riseOnHover: true })
      .on("click", () => select(p.id))
      .bindTooltip(esc(shortName(p)), { permanent: true, direction: "bottom", offset: [0, 2], className: "label" });
    pins[p.id] = m.addTo(pinLayer);
  }
  for (const c of CHECKPOINTS) {
    L.marker(c.at, {
      icon: L.divIcon({ className: "", iconSize: null, iconAnchor: [12, 10], html: `<div class="cp">QR<span class="cp-name"> · ${esc(c.name.split(" (")[0])}</span></div>` }),
      zIndexOffset: -100, keyboard: false,
    }).on("click", () => setStart({ kind: "cp", id: c.id })).addTo(map);
  }
  function shortName(p) { return p.name.replace(/^Dept\. of /, "").replace(/ \(.*\)$/, ""); }
  const syncLabels = () => map.getContainer().classList.toggle("hide-labels", map.getZoom() < 18);
  map.on("zoomend", syncLabels); syncLabels();
  map.on("click", () => { if (!isDesktop()) sheet.classList.add("collapsed"); });

  // Route layer
  const routeLayer = L.layerGroup().addTo(map);
  const youLayer = L.layerGroup().addTo(map);

  // ---------------------------------------------------------- start point
  function startInfo() {
    if (state.start.kind === "gps" && state.gps) return { at: state.gps.at, name: "your location", label: "My location (GPS)" };
    const c = cpById[state.start.id] || CHECKPOINTS[0];
    return { at: c.at, name: c.name, label: c.name, cp: c };
  }
  function setStart(s) {
    state.start = s;
    if (s.kind === "cp") updateURL();
    render();
  }

  // ------------------------------------------------------------ selecting
  function select(id, room = null) {
    const prev = byId[state.selected];
    if (prev) {
      pins[prev.id].setIcon(pinIcon(prev, false)).setZIndexOffset(0);
      if (buildingLayers[prev.osm]) buildingLayers[prev.osm].setStyle(buildingStyle(false));
    }
    state.selected = id; state.room = room;
    const p = byId[id];
    if (p) {
      pins[id].setIcon(pinIcon(p, true)).setZIndexOffset(1000);
      if (buildingLayers[p.osm]) buildingLayers[p.osm].setStyle(buildingStyle(true));
    }
    sheet.classList.remove("collapsed");
    updateURL();
    render();
  }
  function clearSelection() { select(null); routeLayer.clearLayers(); fitAll(); }
  function fitAll() { map.flyToBounds(campusBounds, { padding: padding(), duration: 0.6 }); }

  function padding() {
    if (isDesktop()) return [60, 60];
    return [40, 40];
  }
  function fitRoute(latlngs) {
    const b = L.latLngBounds(latlngs);
    if (isDesktop()) map.flyToBounds(b, { paddingTopLeft: [440, 80], paddingBottomRight: [60, 60], maxZoom: 19, duration: 0.6 });
    else map.flyToBounds(b, { paddingTopLeft: [30, 130], paddingBottomRight: [30, Math.round(innerHeight * 0.5)], maxZoom: 19, duration: 0.6 });
  }

  function drawRoute(r, from, to) {
    routeLayer.clearLayers();
    if (!r) return;
    L.polyline(r.path, { color: "#fff", weight: 10, opacity: 0.9, interactive: false }).addTo(routeLayer);
    L.polyline(r.path, { color: css("--route"), weight: 6, opacity: 1, interactive: false, lineCap: "round" }).addTo(routeLayer);
    L.circleMarker(from, { radius: 8, color: "#fff", weight: 3, fillColor: css("--you"), fillOpacity: 1 }).addTo(routeLayer);
    L.circleMarker(to, { radius: 6, color: css("--route"), weight: 3, fillColor: "#fff", fillOpacity: 1 }).addTo(routeLayer);
  }

  function updateURL() {
    const u = new URLSearchParams();
    if (state.start.kind === "cp") u.set("from", state.start.id);
    if (state.selected) u.set("to", state.selected);
    if (state.room) u.set("room", state.room);
    history.replaceState(null, "", `${location.pathname}?${u}`);
  }

  // --------------------------------------------------------------- search
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  function search(q) {
    const nq = norm(q).trim();
    const out = [];
    for (const p of PLACES) {
      if (state.cat && p.cat !== state.cat) continue;
      const hay = [p.name, p.si, ...(p.aka || []), CATEGORIES[p.cat]?.label].map(norm).join(" | ");
      if (!nq || hay.includes(nq)) out.push({ place: p });
      for (const r of p.rooms || []) {
        if (nq && norm([r.code, r.name].join(" ")).includes(nq)) out.push({ place: p, room: r });
      }
    }
    const from = startInfo().at;
    return out.sort((a, b) => {
      if (nq) { // exact-ish name matches first
        const sa = norm(a.place.name).startsWith(nq) ? 0 : 1, sb = norm(b.place.name).startsWith(nq) ? 0 : 1;
        if (sa !== sb) return sa - sb;
      }
      return CampusRouter.dist(from, a.place.at) - CampusRouter.dist(from, b.place.at);
    });
  }

  // ---------------------------------------------------------------- render
  const sheet = $("#sheet"), body = $("#sheet-body");
  $("#sheet-handle").onclick = () => sheet.classList.toggle("collapsed");

  function startRowHTML() {
    const s = startInfo();
    const opts = CHECKPOINTS.map((c) => `<option value="cp:${c.id}" ${state.start.kind === "cp" && state.start.id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    const gpsOpt = `<option value="gps" ${state.start.kind === "gps" ? "selected" : ""}>📍 My location (GPS)</option>`;
    return `<div class="start-row"><span class="dot"></span><span>From <b>${esc(s.label)}</b></span>
      <select id="start-sel" aria-label="Change starting point">${opts}${gpsOpt}</select></div>`;
  }

  function render() {
    const place = byId[state.selected];
    if (place) renderPlace(place); else { routeLayer.clearLayers(); renderHome(); }
    const sel = $("#start-sel");
    if (sel) sel.onchange = (e) => {
      const v = e.target.value;
      if (v === "gps") { startGPS(true); return; }
      setStart({ kind: "cp", id: v.slice(3) });
    };
  }

  function renderHome() {
    const results = search(state.query);
    const from = startInfo().at;
    const venue = byId[EVENT.venueId];
    const intro = state.query || state.cat ? "" : `
      <div class="hello">
        <h1>${esc(EVENT.title)}</h1>
        <p>${esc(EVENT.subtitle)}${state.scannedQR ? ` · You scanned the QR at <b>${esc(startInfo().name)}</b>` : ""}</p>
      </div>
      ${venue ? `<button class="btn primary" style="width:100%;margin-bottom:10px" data-go="${esc(venue.id)}">🎉 Take me to the inauguration — ${esc(venue.name)}</button>
        ${EVENT.venueNote ? `<p class="unverified" style="margin-top:-4px">${esc(EVENT.venueNote)}</p>` : ""}` : ""}`;
    const items = results.map(({ place: p, room: r }) => {
      const c = CATEGORIES[p.cat] || CATEGORIES.other;
      const sub = r ? `${esc(r.code)} · ${esc(r.floor || "")} — in ${esc(p.name)}` : esc(p.si || c.label);
      return `<li><button data-go="${esc(p.id)}" ${r ? `data-room="${esc(r.code)}"` : ""}>
        <span class="ico" style="background:${c.color}22">${c.icon}</span>
        <span><div class="t">${esc(r ? r.name : p.name)}</div><div class="s">${sub}</div></span>
        <span class="dist">~${Math.round(CampusRouter.dist(from, p.at) / 10) * 10} m</span></button></li>`;
    }).join("");
    body.innerHTML = `${intro}${startRowHTML()}
      <div class="section-title">${state.query ? `Results for “${esc(state.query)}”` : state.cat ? esc(CATEGORIES[state.cat].label) : "All places · nearest first"}</div>
      ${items ? `<ul class="list">${items}</ul>` : `<div class="empty">No place matches “${esc(state.query)}”. Try another word, e.g. “canteen”, “library”, “IT”.</div>`}
      <div class="foot"><a href="print.html">🖨️ Printable map / PDF</a><a href="qr.html">QR codes (organisers)</a></div>`;
    body.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => {
      select(b.dataset.go, b.dataset.room || null);
      if (!isDesktop()) $("#q").blur();
    }));
  }

  function renderPlace(p) {
    const c = CATEGORIES[p.cat] || CATEGORIES.other;
    const s = startInfo();
    const target = p.entrance || p.at;
    const landmarks = PLACES.filter((x) => x.id !== p.id).map((x) => ({ name: shortName(x), at: x.at }));
    const r = CampusRouter.route(s.at, target, { landmarks, destName: shortName(p), startName: s.cp ? s.cp.name : null });
    drawRoute(r, s.at, target);
    if (r) fitRoute(r.path); else map.flyTo(p.at, 19);

    const room = state.room && (p.rooms || []).find((x) => x.code === state.room);
    const verified = state.start.kind === "cp" && p.steps && p.steps[state.start.id];
    const stepsHTML = verified
      ? `<p class="verified">✔ Directions checked on foot by the organising team</p>
         <ol class="steps">${verified.map((t, i) => `<li><span class="arrow">${i + 1}</span>${esc(t)}</li>`).join("")}</ol>`
      : r ? `<ol class="steps">${r.steps.map((st) => `<li><span class="arrow">${st.icon}</span>${esc(st.text)}${st.sub ? `<small>${esc(st.sub)}</small>` : ""}</li>`).join("")}</ol>
            <p class="unverified">Directions are generated from the map — follow the purple line.</p>` : "";

    const photos = (p.photos || [
      { src: `photos/${p.id}.jpg`, caption: "Building" },
      { src: `photos/${p.id}-entrance.jpg`, caption: "Entrance" },
    ]);
    const gmaps = `https://www.google.com/maps/search/?api=1&query=${p.at[0]},${p.at[1]}`;

    body.innerHTML = `
      <div class="card-head">
        <span class="list"><span class="ico" style="background:${c.color}22;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:22px">${c.icon}</span></span>
        <div><h2>${esc(room ? room.name : p.name)}</h2><div class="si">${esc(room ? `in ${p.name}` : p.si || "")}</div></div>
        <button class="icon-btn back" id="back" aria-label="Back to list">✕</button>
      </div>
      <div class="badges">
        <span class="badge">${c.icon} ${esc(c.label)}</span>
        ${p.floors ? `<span class="badge">🏢 ${p.floors} floor${p.floors > 1 ? "s" : ""}</span>` : ""}
        ${room?.floor ? `<span class="badge">⬆️ ${esc(room.floor)}</span>` : ""}
        ${room?.code ? `<span class="badge">#️⃣ ${esc(room.code)}</span>` : ""}
      </div>
      ${room?.how ? `<p class="desc"><b>Inside the building:</b> ${esc(room.how)}</p>` : ""}
      ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ""}
      <div class="photos" id="photos">${photos.map((ph) => `<figure><img src="${esc(ph.src)}" alt="${esc(p.name)} — ${esc(ph.caption)}"><figcaption>${esc(ph.caption)}</figcaption></figure>`).join("")}</div>
      ${startRowHTML()}
      ${r ? `<div class="route-sum"><span class="big">${Math.max(1, Math.round(r.metres / WALK_M_PER_MIN))} min</span><span class="small">${Math.round(r.metres / 10) * 10} m walk</span></div>` : ""}
      ${stepsHTML}
      ${(p.rooms || []).length && !room ? `<div class="section-title">Rooms in this building</div><ul class="list rooms">${p.rooms.map((x) => `<li><button data-room="${esc(x.code)}"><span><div class="t">${esc(x.code)} · ${esc(x.name)}</div><div class="s">${esc(x.floor || "")}</div></span></button></li>`).join("")}</ul>` : ""}
      <div class="actions">
        <button class="btn primary" id="share">🔗 Share</button>
        <a class="btn" href="${gmaps}" target="_blank" rel="noopener">Open in Google Maps</a>
      </div>`;

    $("#back").onclick = clearSelection;
    $("#share").onclick = share;
    body.querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => select(p.id, b.dataset.room)));
    // Hide photos that don't exist yet; show a friendly note instead.
    const box = $("#photos");
    const imgs = [...box.querySelectorAll("img")];
    let left = imgs.length;
    const check = () => { if (!box.querySelector("figure")) box.outerHTML = `<div class="photo-missing">📷 Photo coming soon — look for the highlighted building on the map</div>`; };
    imgs.forEach((img) => {
      const fail = () => { img.closest("figure").remove(); if (--left === 0) check(); };
      const ok = () => { if (--left === 0) check(); };
      if (img.complete) (img.naturalWidth ? ok : fail)();
      else { img.onerror = fail; img.onload = ok; }
    });
    body.scrollTop = 0;
  }

  async function share() {
    const url = location.href;
    const title = byId[state.selected]?.name || "UoM Campus Finder";
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); $("#share").textContent = "✔ Link copied"; }
    } catch (_) { /* user cancelled */ }
  }

  // ----------------------------------------------------- search & chips UI
  const q = $("#q"), clearQ = $("#clear-q");
  q.addEventListener("input", () => {
    state.query = q.value; clearQ.hidden = !q.value;
    if (state.selected) select(null); else render();
    sheet.classList.remove("collapsed");
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = body.querySelector("[data-go]"); if (first) first.click(); }
  });
  clearQ.onclick = () => { q.value = ""; state.query = ""; clearQ.hidden = true; render(); q.focus(); };

  const chips = $("#chips");
  const chipList = [
    ...(byId[EVENT.venueId] ? [{ key: "__event", label: "🎉 Inauguration", cls: "event" }] : []),
    ...Object.entries(CATEGORIES).filter(([k]) => k !== "gate" && PLACES.some((p) => p.cat === k)).map(([k, v]) => ({ key: k, label: `${v.icon} ${v.label}` })),
  ];
  chips.innerHTML = chipList.map((c) => `<button class="chip ${c.cls || ""}" data-k="${c.key}" aria-pressed="false">${esc(c.label)}</button>`).join("");
  chips.querySelectorAll(".chip").forEach((b) => (b.onclick = () => {
    if (b.dataset.k === "__event") { select(EVENT.venueId); return; }
    state.cat = state.cat === b.dataset.k ? null : b.dataset.k;
    chips.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === state.cat)));
    if (state.selected) select(null); else render();
    sheet.classList.remove("collapsed");
  }));

  // ------------------------------------------------------------------ GPS
  let watchId = null, youMarker = null, accCircle = null;
  function startGPS(useAsStart) {
    if (!navigator.geolocation) { alert("Location is not available on this device."); return; }
    $("#btn-gps").classList.add("on");
    if (watchId != null) { if (useAsStart && state.gps) setStart({ kind: "gps" }); else if (state.gps) map.flyTo(state.gps.at, 18); return; }
    let first = true;
    watchId = navigator.geolocation.watchPosition((pos) => {
      const at = [pos.coords.latitude, pos.coords.longitude], acc = pos.coords.accuracy;
      state.gps = { at, acc };
      if (!youMarker) {
        accCircle = L.circle(at, { radius: acc, color: css("--you"), weight: 1, fillOpacity: 0.1, interactive: false }).addTo(youLayer);
        youMarker = L.marker(at, { icon: L.divIcon({ className: "", iconSize: [18, 18], html: '<div class="you-dot"></div>' }), zIndexOffset: 2000 }).addTo(youLayer);
      } else { youMarker.setLatLng(at); accCircle.setLatLng(at).setRadius(acc); }
      const onCampus = campusBounds.pad(0.5).contains(at);
      if (first) {
        first = false;
        if (!onCampus) { alert("You seem to be outside the campus — routes will start from the selected gate instead."); if (useAsStart) render(); return; }
        if (acc > 50) alert(`GPS accuracy is low right now (±${Math.round(acc)} m). Near buildings it's better to scan the nearest QR checkpoint.`);
        if (useAsStart) setStart({ kind: "gps" }); else map.flyTo(at, 18);
      } else if (state.start.kind === "gps" && state.selected) {
        // Re-route at most every ~15 m of movement.
        if (!state._lastRouted || CampusRouter.dist(state._lastRouted, at) > 15) { state._lastRouted = at; render(); }
      }
    }, (err) => {
      $("#btn-gps").classList.remove("on"); watchId = null;
      alert("Couldn't get your location (" + err.message + "). Pick a starting point from the list or scan a QR checkpoint.");
      if (state.start.kind === "gps") setStart({ kind: "cp", id: CHECKPOINTS[0].id });
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  $("#btn-gps").onclick = () => startGPS(false);

  $("#btn-layers").onclick = () => {
    base = base === "map" ? "sat" : "map";
    if (base === "sat") { map.removeLayer(osm); sat.addTo(map); map.getContainer().classList.remove("dim-tiles"); $("#btn-layers").textContent = "🗺️"; }
    else { map.removeLayer(sat); osm.addTo(map); map.getContainer().classList.add("dim-tiles"); $("#btn-layers").textContent = "🛰️"; }
    drawVector();
  };

  // ---------------------------------------------------------------- start
  const toParam = params.get("to");
  if (byId[toParam]) select(toParam, params.get("room"));
  else { if (!isDesktop()) sheet.classList.toggle("collapsed", false); render(); }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
