(function () {
  const { PLACES, CHECKPOINTS, CATEGORIES, EVENT, CAMPUS_DATA, CampusRouter, FX } = window;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = Object.fromEntries(PLACES.map((p) => [p.id, p]));
  const cpById = Object.fromEntries(CHECKPOINTS.map((c) => [c.id, c]));
  const WALK_M_PER_MIN = 75;
  const params = new URLSearchParams(location.search);

  const fromParam = params.get("from");
  const state = {
    // Start can be a QR checkpoint, any place (place-to-place directions) or GPS.
    start: cpById[fromParam] ? { kind: "cp", id: fromParam }
      : byId[fromParam] ? { kind: "place", id: fromParam }
      : { kind: "cp", id: CHECKPOINTS[0].id },
    scannedQR: !!cpById[fromParam],
    selected: null,   // place id
    room: null,       // room code
    query: "",
    cat: null,
    gps: null,        // { at, acc }
  };

  // ------------------------------------------------------------------ map
  const isDesktop = () => matchMedia("(min-width: 820px)").matches;
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const map = L.map("map", { zoomControl: false, maxZoom: 20, minZoom: 15, attributionControl: true, zoomSnap: 0.25 });
  if (isDesktop()) L.control.zoom({ position: "bottomright" }).addTo(map);

  // OpenStreetMap tiles, recoloured with CSS (see .base-tiles) so day and night themes both look right.
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 19, maxZoom: 20, className: "base-tiles",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxNativeZoom: 19, maxZoom: 20, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
  });
  let base = "map";
  function setBase() {
    for (const l of [osm, sat]) map.removeLayer(l);
    (base === "sat" ? sat : osm).addTo(map);
  }
  setBase();
  darkQuery.addEventListener?.("change", () => drawVector());

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const campusBounds = L.latLngBounds(CAMPUS_DATA.campus);
  map.fitBounds(campusBounds, { padding: [10, 10] });
  map.setMaxBounds(campusBounds.pad(1.2));

  // Our own vector drawing of campus: still works with no tiles (offline).
  // Each building gets a slightly offset dark copy underneath for a raised, 3D look.
  const vector = L.layerGroup().addTo(map);
  const buildingLayers = {};
  const shift = (ring) => ring.map(([a, b]) => [a - 0.000014, b + 0.000006]);
  function drawVector() {
    vector.clearLayers();
    const sat_ = base === "sat";
    L.polygon(CAMPUS_DATA.campus, { color: css("--accent"), weight: 2.5, dashArray: "2 8", lineCap: "round", fill: true, fillColor: css("--accent"), fillOpacity: sat_ ? 0 : 0.04, interactive: false }).addTo(vector);
    for (const road of CAMPUS_DATA.roads) {
      L.polyline(road, { color: css("--road-casing"), weight: 10, opacity: sat_ ? 0 : 0.9, interactive: false }).addTo(vector);
    }
    for (const road of CAMPUS_DATA.roads) {
      L.polyline(road, { color: css("--road"), weight: 7, opacity: sat_ ? 0 : 1, interactive: false }).addTo(vector);
    }
    for (const path of window.EXTRA_PATHS || []) {
      L.polyline(path, { color: css("--accent"), weight: 3, dashArray: "4 6", opacity: 0.8, interactive: false }).addTo(vector);
    }
    if (!sat_) for (const ring of Object.values(CAMPUS_DATA.buildings)) {
      L.polygon(shift(ring), { stroke: false, fillColor: css("--bldg-shadow"), fillOpacity: 1, interactive: false, className: "bldg-shadow" }).addTo(vector);
    }
    for (const [id, ring] of Object.entries(CAMPUS_DATA.buildings)) {
      buildingLayers[id] = L.polygon(ring, buildingStyle(false)).addTo(vector);
    }
    const place = byId[state.selected];
    if (place && buildingLayers[place.osm]) buildingLayers[place.osm].setStyle(buildingStyle(true, place));
  }
  function buildingStyle(sel, p) {
    if (sel) {
      const c = (CATEGORIES[p.cat] || CATEGORIES.other).color;
      return { color: c, weight: 3, fillColor: c, fillOpacity: 0.45, opacity: 1, interactive: false };
    }
    return { color: css("--bldg-line"), weight: 1, fillColor: css("--bldg"), fillOpacity: base === "sat" ? 0 : 0.95, opacity: base === "sat" ? 0 : 1, interactive: false };
  }
  drawVector();

  // Place pins + labels (pins drop in one after another on load)
  const pinLayer = L.layerGroup().addTo(map);
  const pins = {};
  function pinIcon(p, sel, delay = 0) {
    const c = CATEGORIES[p.cat] || CATEGORIES.other;
    const size = sel ? 44 : 32;
    return L.divIcon({
      className: "", iconSize: [size, size], iconAnchor: [size / 2, size],
      html: `<div class="pin-wrap${sel ? " sel" : ""}" style="--pc:${c.color};--d:${delay}ms"><div class="pin${sel ? " sel" : ""}"><span>${c.icon}</span></div></div>`,
    });
  }
  function dropPins(baseDelay = 0) {
    const centre = campusBounds.getCenter();
    [...PLACES].sort((a, b) => centre.distanceTo(a.at) - centre.distanceTo(b.at)).forEach((p, i) => {
      if (p.id !== state.selected) pins[p.id].setIcon(pinIcon(p, false, baseDelay + i * 45));
    });
  }
  for (const p of PLACES) {
    const m = L.marker(p.at, { icon: pinIcon(p, false), title: p.name, riseOnHover: true })
      .on("click", () => select(p.id))
      .bindTooltip(esc(shortName(p)), { permanent: true, direction: "bottom", offset: [0, 4], className: "label" });
    pins[p.id] = m.addTo(pinLayer);
  }
  for (const c of CHECKPOINTS) {
    L.marker(c.at, {
      icon: L.divIcon({ className: "", iconSize: null, iconAnchor: [14, 12], html: `<div class="cp">▣ QR<span class="cp-name"> · ${esc(c.name.split(" (")[0])}</span></div>` }),
      zIndexOffset: -100, keyboard: false,
    }).on("click", () => { setStart({ kind: "cp", id: c.id }); FX.toast(`Routes now start from ${c.name}`, "📍"); }).addTo(map);
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
    if (state.start.kind === "place" && byId[state.start.id]) {
      const p = byId[state.start.id];
      return { at: p.entrance || p.at, name: shortName(p), label: p.name, place: p };
    }
    const c = cpById[state.start.id] || CHECKPOINTS[0];
    return { at: c.at, name: c.name, label: c.name, cp: c };
  }
  function setStart(s) {
    state.start = s;
    if (s.kind !== "gps") updateURL();
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
      if (buildingLayers[p.osm]) buildingLayers[p.osm].setStyle(buildingStyle(true, p));
    }
    sheet.classList.remove("collapsed");
    updateURL();
    render();
  }
  function clearSelection() { select(null); clearRoute(); fitAll(); }
  function fitAll() { map.flyToBounds(campusBounds, { padding: isDesktop() ? [60, 60] : [40, 40], duration: 0.8 }); }

  function fitRoute(latlngs) {
    const b = L.latLngBounds(latlngs);
    if (isDesktop()) map.flyToBounds(b, { paddingTopLeft: [470, 90], paddingBottomRight: [80, 60], maxZoom: 19, duration: 0.9 });
    else map.flyToBounds(b, { paddingTopLeft: [30, 140], paddingBottomRight: [30, Math.round(innerHeight * 0.56)], maxZoom: 19, duration: 0.9 });
  }

  // Animated route: soft glow, a line that draws itself, flowing dots on top,
  // a pulsing start, a waving flag at the end and a comet walking the path.
  let cometRAF = null;
  function clearRoute() { routeLayer.clearLayers(); cancelAnimationFrame(cometRAF); }
  function drawRoute(r, from, to) {
    clearRoute();
    if (!r) return;
    const route = css("--route");
    L.polyline(r.path, { color: route, weight: 18, opacity: 0.18, interactive: false, lineCap: "round", lineJoin: "round", className: "route-glow" }).addTo(routeLayer);
    L.polyline(r.path, { color: "#fff", weight: 10, opacity: 0.95, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(routeLayer);
    const main = L.polyline(r.path, { color: route, weight: 6, opacity: 1, interactive: false, lineCap: "round", lineJoin: "round", className: "route-main" }).addTo(routeLayer);
    L.polyline(r.path, { color: "#fff", weight: 3, opacity: 0.9, interactive: false, lineCap: "round", className: "route-flow" }).addTo(routeLayer);
    L.marker(from, { interactive: false, zIndexOffset: 1500, icon: L.divIcon({ className: "", iconSize: [22, 22], html: '<div class="start-marker"></div>' }) }).addTo(routeLayer);
    L.marker(to, { interactive: false, zIndexOffset: 1600, icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [6, 26], html: '<div class="end-marker">🚩</div>' }) }).addTo(routeLayer);

    // Draw the line in once the camera has finished flying there.
    if (!FX.reduced) {
      const el = main.getElement();
      if (el) { el.style.opacity = "0"; }
      let done = false;
      const drawIn = () => {
        if (done || !el) return; done = true;
        const len = el.getTotalLength();
        el.style.strokeDasharray = len; el.style.strokeDashoffset = len; el.style.opacity = "1";
        void el.getBoundingClientRect();
        el.classList.add("drawing"); el.style.strokeDashoffset = "0";
        setTimeout(() => { el.classList.remove("drawing"); el.style.strokeDasharray = ""; el.style.strokeDashoffset = ""; }, 1400);
      };
      map.once("moveend", () => setTimeout(drawIn, 50));
      setTimeout(drawIn, 1300);

      const comet = L.marker(from, { interactive: false, zIndexOffset: 1400, icon: L.divIcon({ className: "", iconSize: [14, 14], html: '<div class="comet"></div>' }) }).addTo(routeLayer);
      const dur = Math.min(6000, Math.max(2200, r.metres * 12));
      const t0 = performance.now() + 1500;
      const step = (t) => {
        const k = ((t - t0) % (dur + 900)) / dur;
        if (t > t0 && k <= 1) comet.setLatLng(CampusRouter.along(r.path, k * r.metres));
        cometRAF = requestAnimationFrame(step);
      };
      cometRAF = requestAnimationFrame(step);
    }
  }

  function updateURL() {
    const u = new URLSearchParams();
    if (state.start.kind !== "gps") u.set("from", state.start.id);
    if (state.selected) u.set("to", state.selected);
    if (state.room) u.set("room", state.room);
    history.replaceState(null, "", `${location.pathname}?${u}`);
  }

  // ------------------------------------------------------------ 360° tour
  function startSpot() {
    if (state.start.kind === "cp") return CampusTour.spots.find((x) => x.id === state.start.id) || CampusTour.nearestSpot(startInfo().at);
    if (state.start.kind === "place") return CampusTour.spotForPlace(state.start.id);
    return CampusTour.nearestSpot(startInfo().at);
  }
  function openTour(spotId, destId) {
    CampusTour.open(spotId, { dest: destId });
  }
  const spotLayer = L.layerGroup();
  for (const sp of CampusTour.spots) {
    L.marker(sp.at, { icon: L.divIcon({ className: "", iconSize: [26, 26], html: '<div class="spot-dot">360</div>' }), title: `360° · ${sp.name}`, zIndexOffset: -200 })
      .on("click", () => openTour(sp.id)).addTo(spotLayer);
  }
  const syncSpots = () => { if (map.getZoom() >= 18) spotLayer.addTo(map); else spotLayer.remove(); };
  map.on("zoomend", syncSpots); syncSpots();

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
    const isSel = (k, id) => state.start.kind === k && state.start.id === id ? "selected" : "";
    const cps = CHECKPOINTS.map((c) => `<option value="cp:${c.id}" ${isSel("cp", c.id)}>${esc(c.name)}</option>`).join("");
    const pls = [...PLACES].sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => `<option value="pl:${p.id}" ${isSel("place", p.id)}>${esc(p.name)}</option>`).join("");
    const gpsOpt = `<option value="gps" ${state.start.kind === "gps" ? "selected" : ""}>📍 My location (GPS)</option>`;
    return `<div class="start-row"><span class="dot"></span><span>From <b>${esc(s.label)}</b></span>
      <select id="start-sel" aria-label="Change starting point">${gpsOpt}
        <optgroup label="QR checkpoints">${cps}</optgroup><optgroup label="Places">${pls}</optgroup></select></div>`;
  }

  let aerialMap = null;
  function render() {
    if (aerialMap) { aerialMap.remove(); aerialMap = null; }
    const place = byId[state.selected];
    if (place) renderPlace(place); else { clearRoute(); renderHome(); }
    const sel = $("#start-sel");
    if (sel) sel.onchange = (e) => {
      const v = e.target.value;
      if (v === "gps") { startGPS(true); return; }
      setStart({ kind: v.startsWith("pl:") ? "place" : "cp", id: v.slice(3) });
    };
  }

  // Optional countdown to the ceremony (EVENT.date in places.js).
  function countdownHTML() {
    const t = EVENT.date && new Date(EVENT.date);
    if (!t || isNaN(t) || t < Date.now()) return "";
    const s = Math.floor((t - Date.now()) / 1000);
    const parts = [[Math.floor(s / 86400), "days"], [Math.floor(s / 3600) % 24, "hrs"], [Math.floor(s / 60) % 60, "min"], [s % 60, "sec"]];
    return `<div class="countdown" id="countdown">${parts.map(([v, l]) => `<div><b>${String(v).padStart(2, "0")}</b><span>${l}</span></div>`).join("")}</div>`;
  }
  setInterval(() => { const c = $("#countdown"); if (c) c.outerHTML = countdownHTML() || ""; }, 1000);

  // Shortcut tiles on the home screen (a place id or a category).
  const QUICK = [
    { label: "IT Faculty", icon: "🎓", go: "it-faculty", color: "#7c3aed" },
    { label: "Canteens", icon: "🍛", cat: "food", color: "#ea580c" },
    { label: "Library", icon: "📚", go: "library", color: "#2563eb" },
    { label: "Medical", icon: "🏥", go: "medical", color: "#dc2626" },
  ].filter((q) => q.cat || byId[q.go]);

  function renderHome() {
    const results = search(state.query);
    const from = startInfo().at;
    const venue = byId[EVENT.venueId];
    const browsing = !state.query && !state.cat;
    const intro = !browsing ? "" : `
      <section class="hero">
        <span class="orb o1"></span><span class="orb o2"></span>
        <p class="hero-kicker">${state.scannedQR ? `📍 You're at ${esc(startInfo().name)}` : "Batch 26 · Faculty of IT"}</p>
        <h1>Hey there <span class="wave">👋</span><br><span class="gold">Where to?</span></h1>
        <p>${esc(EVENT.title)} Tap a place, follow the glowing line.</p>
        ${countdownHTML()}
      </section>
      ${venue ? `<button class="btn primary venue-banner" data-go="${esc(venue.id)}">🎉 Take me to the inauguration · ${esc(shortName(venue))}</button>
        ${EVENT.venueNote ? `<p class="unverified" style="margin-top:-4px">${esc(EVENT.venueNote)}</p>` : ""}` : ""}
      <div class="tiles">
        ${QUICK.map((q, i) => `<button class="tile" style="--i:${i};--tc:${q.color}" ${q.go ? `data-go="${q.go}"` : `data-cat="${q.cat}"`}>
          <span class="ti">${q.icon}</span>${esc(q.label)}</button>`).join("")}
        <button class="tile wide" id="tour-home" style="--i:${QUICK.length}">
          <span class="ti"><span>🔭</span></span>
          <span><b>Explore campus in 360°</b><small>Walk the paths before you even arrive</small></span>
          <span class="go">→</span></button>
      </div>`;
    const items = results.map(({ place: p, room: r }, i) => {
      const c = CATEGORIES[p.cat] || CATEGORIES.other;
      const sub = r ? `${esc(r.code)} · ${esc(r.floor || "")} — in ${esc(p.name)}` : esc(p.si || c.label);
      return `<li style="--i:${i}"><button data-go="${esc(p.id)}" ${r ? `data-room="${esc(r.code)}"` : ""}>
        <span class="ico" style="background:linear-gradient(135deg, ${c.color}33, ${c.color}14)">${c.icon}</span>
        <span><div class="t">${esc(r ? r.name : p.name)}</div><div class="s">${sub}</div></span>
        <span class="dist">${Math.round(CampusRouter.dist(from, p.at) / 10) * 10} m</span></button></li>`;
    }).join("");
    const pickHint = state.start.kind === "place" && browsing
      ? `<p class="unverified">Starting from <b>${esc(startInfo().label)}</b> — now tap where you want to go.</p>` : "";
    body.innerHTML = `${intro}${startRowHTML()}${pickHint}
      <div class="section-title">${state.query ? `Results for “${esc(state.query)}”` : state.cat ? esc(CATEGORIES[state.cat].label) : "All places · nearest first"}</div>
      ${items ? `<ul class="list">${items}</ul>` : `<div class="empty"><span class="big">🧭</span>No place matches “${esc(state.query)}”.<br>Try “canteen”, “library” or “IT”.</div>`}
      <div class="foot"><a href="print.html">🖨️ Printable map / PDF</a><a href="qr.html">QR codes (organisers)</a></div>`;
    body.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => {
      select(b.dataset.go, b.dataset.room || null);
      if (!isDesktop()) $("#q").blur();
    }));
    body.querySelectorAll("[data-cat]").forEach((b) => (b.onclick = () => setCat(b.dataset.cat)));
    const th = $("#tour-home");
    if (th) th.onclick = () => openTour(startSpot().id);
  }

  function renderPlace(p) {
    const c = CATEGORIES[p.cat] || CATEGORIES.other;
    const s = startInfo();
    const target = p.entrance || p.at;
    const landmarks = PLACES.filter((x) => x.id !== p.id).map((x) => ({ name: shortName(x), at: x.at }));
    const startsHere = state.start.kind === "place" && state.start.id === p.id;
    const r = startsHere ? null : CampusRouter.route(s.at, target, { landmarks, destName: shortName(p), startName: s.cp ? s.cp.name : s.place ? shortName(s.place) : null });
    drawRoute(r, s.at, target);
    if (r) fitRoute(r.path); else map.flyTo(p.at, 19, { duration: 0.9 });

    const room = state.room && (p.rooms || []).find((x) => x.code === state.room);
    const verified = state.start.kind !== "gps" && p.steps && p.steps[state.start.id];
    const stepsHTML = verified
      ? `<p class="verified">✔ Directions checked on foot by the organising team</p>
         <ol class="steps">${verified.map((t, i) => `<li style="--i:${i}"><span class="arrow">${i + 1}</span>${esc(t)}</li>`).join("")}</ol>`
      : r ? `<ol class="steps">${r.steps.map((st, i) => `<li style="--i:${i}"><span class="arrow">${st.icon}</span>${esc(st.text)}${st.sub ? `<small>${esc(st.sub)}</small>` : ""}</li>`).join("")}</ol>
            <p class="unverified">Directions are generated from the map — follow the glowing line.</p>
            ${r.metres > 2.5 * CampusRouter.dist(s.at, target) + 100 ? `<p class="warn">⚠ This route looks longer than it should be — there may be a shorter footpath the map doesn't know about. Ask a senior or staff member.</p>` : ""}`
      : startsHere ? `<p class="unverified">You're starting from here. Close this card (✕) and tap any place to get directions from ${esc(shortName(p))}.</p>` : "";

    const photos = (p.photos || [
      { src: `photos/${p.id}.jpg`, caption: "Building" },
      { src: `photos/${p.id}-entrance.jpg`, caption: "Entrance" },
    ]);
    const gmaps = `https://www.google.com/maps/search/?api=1&query=${p.at[0]},${p.at[1]}`;
    const stats = r ? [
      [Math.max(1, Math.round(r.metres / WALK_M_PER_MIN)), "min walk"],
      [Math.round(r.metres / 10) * 10, "metres"],
      p.floors ? [p.floors, p.floors > 1 ? "floors" : "floor"] : [r.steps.length - 1, "turns"],
    ] : null;

    body.innerHTML = `
      <div class="place-hero" style="--c:${c.color}">
        <div class="ph-emoji">${c.icon}</div>
        <div><span class="ph-cat">${esc(c.label)}</span><h2>${esc(room ? room.name : p.name)}</h2><div class="si">${esc(room ? `in ${p.name}` : p.si || "")}</div></div>
        <button class="icon-btn back" id="back" aria-label="Back to list">✕</button>
      </div>
      ${room?.floor || room?.code ? `<div class="badges">
        ${room?.floor ? `<span class="badge">⬆️ ${esc(room.floor)}</span>` : ""}
        ${room?.code ? `<span class="badge">#️⃣ ${esc(room.code)}</span>` : ""}
      </div>` : ""}
      ${room?.how ? `<p class="desc"><b>Inside the building:</b> ${esc(room.how)}</p>` : ""}
      ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ""}
      ${stats ? `<div class="stats">${stats.map(([v, l], i) => `<div class="stat" style="--i:${i}"><b data-count="${v}">0</b><span>${l}</span></div>`).join("")}</div>` : ""}
      <div class="photos" id="photos">
        ${photos.map((ph) => `<figure><img src="${esc(ph.src)}" alt="${esc(p.name)} — ${esc(ph.caption)}"><figcaption>${esc(ph.caption)}</figcaption></figure>`).join("")}
        <figure class="tour-thumb"><button id="tour-here" aria-label="Open 360° view of ${esc(p.name)}"><span class="big360">360°</span><span>Look around here</span></button><figcaption>360° view</figcaption></figure>
        <figure><div id="aerial" class="aerial" role="img" aria-label="Satellite view of ${esc(p.name)}"></div><figcaption>Aerial view</figcaption></figure>
      </div>
      ${startRowHTML()}
      ${stepsHTML}
      ${(p.rooms || []).length && !room ? `<div class="section-title">Rooms in this building</div><ul class="list rooms">${p.rooms.map((x, i) => `<li style="--i:${i}"><button data-room="${esc(x.code)}"><span><div class="t">${esc(x.code)} · ${esc(x.name)}</div><div class="s">${esc(x.floor || "")}</div></span></button></li>`).join("")}</ul>` : ""}
      <div class="actions">
        ${r ? `<button class="btn primary" id="tour-walk">🚶 Walk there in 360°</button>` : ""}
        ${startsHere ? "" : `<button class="btn" id="start-here">📍 Start from here</button>`}
        <button class="btn" id="share">🔗 Share</button>
        <a class="btn" href="${CampusTour.streetViewURL(CampusTour.spotForPlace(p.id).at, 0)}" target="_blank" rel="noopener">🌐 Street View</a>
        <a class="btn" href="${gmaps}" target="_blank" rel="noopener">🗺️ Google Maps</a>
      </div>`;

    FX.countUp(body);
    $("#back").onclick = clearSelection;
    $("#share").onclick = share;
    body.querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => select(p.id, b.dataset.room)));
    // Drop photos that haven't been taken yet; the 360° and aerial views always remain.
    $("#photos").querySelectorAll("img").forEach((img) => {
      const fail = () => img.closest("figure").remove();
      if (img.complete && !img.naturalWidth) fail(); else img.onerror = fail;
    });
    aerialMap = L.map("aerial", { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0.5 })
      .setView(p.at, 18.5);
    L.tileLayer(sat._url, { maxNativeZoom: 19, maxZoom: 20 }).addTo(aerialMap);
    if (CAMPUS_DATA.buildings[p.osm]) L.polygon(CAMPUS_DATA.buildings[p.osm], { color: "#facc15", weight: 3, fill: false }).addTo(aerialMap);
    else L.circleMarker(p.at, { radius: 10, color: "#facc15", weight: 3, fill: false }).addTo(aerialMap);
    L.control.attribution({ prefix: false }).addAttribution("Esri").addTo(aerialMap);

    $("#tour-here").onclick = () => openTour(CampusTour.spotForPlace(p.id).id);
    if ($("#tour-walk")) $("#tour-walk").onclick = () => openTour(startSpot().id, p.id);
    if ($("#start-here")) $("#start-here").onclick = () => { setStart({ kind: "place", id: p.id }); clearSelection(); FX.toast(`Starting from ${shortName(p)} — now pick where to go`, "📍"); };
    body.scrollTop = 0;
  }

  async function share() {
    const url = location.href;
    const title = byId[state.selected]?.name || "UoM Campus Finder";
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); FX.toast("Link copied — paste it in the batch group!", "🔗"); }
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
    if (e.key === "Enter") { const first = body.querySelector(".list [data-go]"); if (first) first.click(); }
  });
  clearQ.onclick = () => { q.value = ""; state.query = ""; clearQ.hidden = true; render(); q.focus(); };
  FX.typePlaceholder(q, ["IT Faculty…", "ගොඩ කැන්ටිම…", "Library…", "Medical Center…", "Lecture halls…", "Gym…"]);

  const chips = $("#chips");
  const chipList = [
    ...(byId[EVENT.venueId] ? [{ key: "__event", label: "🎉 Inauguration", cls: "event" }] : []),
    ...Object.entries(CATEGORIES).filter(([k]) => k !== "gate" && PLACES.some((p) => p.cat === k)).map(([k, v]) => ({ key: k, label: `${v.icon} ${v.label}` })),
  ];
  chips.innerHTML = chipList.map((c, i) => `<button class="chip ${c.cls || ""}" style="--i:${i}" data-k="${c.key}" aria-pressed="false">${esc(c.label)}</button>`).join("");
  function setCat(k) {
    state.cat = state.cat === k ? null : k;
    chips.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === state.cat)));
    if (state.selected) select(null); else render();
    sheet.classList.remove("collapsed");
  }
  chips.querySelectorAll(".chip").forEach((b) => (b.onclick = () => {
    if (b.dataset.k === "__event") { select(EVENT.venueId); return; }
    setCat(b.dataset.k);
  }));

  // ------------------------------------------------------------------ GPS
  let watchId = null, youMarker = null, accCircle = null;
  function startGPS(useAsStart) {
    if (!navigator.geolocation) { FX.toast("Location is not available on this device.", "⚠️"); return; }
    $("#btn-gps").classList.add("on");
    if (watchId != null) { if (useAsStart && state.gps) setStart({ kind: "gps" }); else if (state.gps) map.flyTo(state.gps.at, 18); return; }
    let first = true;
    watchId = navigator.geolocation.watchPosition((pos) => {
      const at = [pos.coords.latitude, pos.coords.longitude], acc = pos.coords.accuracy;
      state.gps = { at, acc };
      if (!youMarker) {
        accCircle = L.circle(at, { radius: acc, color: css("--you"), weight: 1, fillOpacity: 0.1, interactive: false }).addTo(youLayer);
        youMarker = L.marker(at, { icon: L.divIcon({ className: "", iconSize: [20, 20], html: '<div class="you-dot"></div>' }), zIndexOffset: 2000 }).addTo(youLayer);
      } else { youMarker.setLatLng(at); accCircle.setLatLng(at).setRadius(acc); }
      const onCampus = campusBounds.pad(0.5).contains(at);
      if (first) {
        first = false;
        if (!onCampus) { FX.toast("You seem to be outside the campus — routes will start from the selected gate instead.", "🧭", 6000); if (useAsStart) render(); return; }
        if (acc > 50) FX.toast(`GPS accuracy is low right now (±${Math.round(acc)} m). Near buildings it's better to scan the nearest QR checkpoint.`, "📡", 6000);
        if (useAsStart) setStart({ kind: "gps" }); else map.flyTo(at, 18);
      } else if (state.start.kind === "gps" && state.selected) {
        // Re-route at most every ~15 m of movement.
        if (!state._lastRouted || CampusRouter.dist(state._lastRouted, at) > 15) { state._lastRouted = at; render(); }
      }
    }, (err) => {
      $("#btn-gps").classList.remove("on"); watchId = null;
      FX.toast("Couldn't get your location (" + err.message + "). Pick a starting point from the list or scan a QR checkpoint.", "⚠️", 6000);
      if (state.start.kind === "gps") setStart({ kind: "cp", id: CHECKPOINTS[0].id });
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  $("#btn-gps").onclick = () => startGPS(false);

  $("#btn-layers").onclick = () => {
    base = base === "map" ? "sat" : "map";
    const b = $("#btn-layers");
    b.firstChild.nodeValue = base === "sat" ? "🗺️" : "🛰️";
    b.querySelector(".tip").textContent = base === "sat" ? "Map view" : "Satellite view";
    setBase();
    drawVector();
  };
  $("#btn-tour").onclick = () => openTour(startSpot().id, state.selected || undefined);

  // ------------------------------------------------- welcome + first view
  // A cinematic arrival: start wide, then glide onto the campus as pins drop in.
  function arrive() {
    if (FX.reduced) return;
    map.setView(campusBounds.getCenter(), 15.5, { animate: false });
    setTimeout(() => {
      if (state.selected) render(); else fitAll();
      dropPins(500);
    }, 250);
  }
  $("#brand").onclick = () => FX.intro({ force: true, where: introWhere() }).then((shown) => { if (shown) arrive(); });
  function introWhere() {
    return state.scannedQR ? `📍 You're at ${startInfo().name}` : "";
  }

  const toParam = params.get("to");
  if (byId[toParam]) select(toParam, params.get("room"));
  else { if (!isDesktop()) sheet.classList.toggle("collapsed", false); render(); }
  FX.intro({ where: introWhere() }).then((shown) => { if (shown) arrive(); else dropPins(200); });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
