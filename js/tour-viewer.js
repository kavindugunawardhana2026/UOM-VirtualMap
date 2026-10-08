// 360° virtual tour (Street View style) built on Pannellum.
// Spots come from js/tour.js; arrows between neighbouring spots are worked
// out from the campus paths, so photographers only need to list the spots.
(function () {
  const { TOUR_SPOTS, PLACES, CHECKPOINTS, CampusRouter: CR } = window;
  const spotById = Object.fromEntries(TOUR_SPOTS.map((s) => [s.id, s]));
  const placeById = Object.fromEntries(PLACES.map((p) => [p.id, p]));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm180 = (a) => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; };
  const heading = (s) => s.heading || 0;
  const shortName = (n) => n.replace(/^Outside /, "").replace(/^Dept\. of /, "").replace(/ \(.*?\)/g, "");
  const label = (s) => s.places && s.places.length ? shortName(placeById[s.places[0]]?.name || s.name) : shortName(s.name);

  // ------------------------------------------------ neighbours (computed once)
  let links = null; // id -> [{ to, metres, path }]
  function buildLinks() {
    links = Object.fromEntries(TOUR_SPOTS.map((s) => [s.id, []]));
    const add = (a, b, r) => {
      links[a.id].push({ to: b.id, metres: r.metres, path: r.path });
      links[b.id].push({ to: a.id, metres: r.metres, path: [...r.path].reverse() });
    };
    for (let i = 0; i < TOUR_SPOTS.length; i++) {
      for (let j = i + 1; j < TOUR_SPOTS.length; j++) {
        const a = TOUR_SPOTS[i], b = TOUR_SPOTS[j];
        const straight = CR.dist(a.at, b.at);
        if (straight > 220 || straight < 1) continue;
        const r = CR.route(a.at, b.at);
        if (!r || r.metres > straight * 2 + 30) continue;
        // Only link spots that are next to each other: no other spot on the way.
        const blocked = TOUR_SPOTS.some((k) => k !== a && k !== b &&
          CR.dist(k.at, a.at) > 8 && CR.dist(k.at, b.at) > 8 && CR.distToPath(k.at, r.path) < 9);
        if (!blocked) add(a, b, r);
      }
    }
    // Make sure no spot is a dead island.
    for (const s of TOUR_SPOTS) {
      if (links[s.id].length) continue;
      const near = TOUR_SPOTS.filter((k) => k !== s).sort((x, y) => CR.dist(s.at, x.at) - CR.dist(s.at, y.at))[0];
      const r = near && CR.route(s.at, near.at);
      if (r) add(s, near, r);
    }
  }

  // Shortest spot-to-spot walk (Dijkstra over the small spot graph).
  function spotPath(from, to) {
    const d = { [from]: 0 }, prev = {}, done = new Set();
    for (;;) {
      let u = null;
      for (const k in d) if (!done.has(k) && (u === null || d[k] < d[u])) u = k;
      if (u === null || u === to) break;
      done.add(u);
      for (const l of links[u]) {
        const nd = d[u] + l.metres;
        if (d[l.to] === undefined || nd < d[l.to]) { d[l.to] = nd; prev[l.to] = u; }
      }
    }
    if (d[to] === undefined) return null;
    const out = [to];
    while (out[0] !== from) out.unshift(prev[out[0]]);
    return { ids: out, metres: d[to] };
  }

  function spotForPlace(placeId) {
    const s = TOUR_SPOTS.find((x) => (x.places || []).includes(placeId)) || spotById[placeId];
    if (s) return s;
    const p = placeById[placeId];
    return p ? nearestSpot(p.entrance || p.at) : null;
  }
  const nearestSpot = (at) => TOUR_SPOTS.reduce((b, s) => (!b || CR.dist(at, s.at) < CR.dist(at, b.at) ? s : b), null);

  // ------------------------------------------------- panorama image per spot
  const panoCache = {};
  function panoFor(s) {
    if (panoCache[s.id]) return panoCache[s.id];
    const src = s.pano || `pano/${s.id}.jpg`;
    return (panoCache[s.id] = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ url: src, real: true });
      img.onerror = () => resolve({ url: placeholder(s), real: false });
      img.src = src;
    }));
  }

  // Drawn stand-in panorama: sky, ground, paths towards each neighbour and
  // compass letters, so the tour is usable before the 360 photos exist.
  function placeholder(s) {
    const W = 2048, H = 1024, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, H / 2);
    sky.addColorStop(0, "#5b8fd6"); sky.addColorStop(1, "#cfe3f7");
    g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
    const ground = g.createLinearGradient(0, H / 2, 0, H);
    ground.addColorStop(0, "#9fb38a"); ground.addColorStop(1, "#5f7550");
    g.fillStyle = ground; g.fillRect(0, H / 2, W, H / 2);
    const xFor = (compass) => ((norm180(compass - heading(s)) / 360) * W + W / 2 + W) % W;

    // Paths: a band from the horizon widening towards the viewer.
    for (const l of links[s.id]) {
      const dir = CR.bearing(s.at, CR.along(l.path, Math.min(15, l.metres / 2)));
      const x = xFor(dir);
      for (const off of [-W, 0, W]) {
        g.fillStyle = "#d9d4c7";
        g.beginPath();
        g.moveTo(x + off - 6, H / 2); g.lineTo(x + off + 6, H / 2);
        g.lineTo(x + off + 230, H); g.lineTo(x + off - 230, H); g.closePath(); g.fill();
      }
    }
    g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(0, H / 2 - 1, W, 2);

    // Compass letters on the horizon.
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const [t, b] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
      g.font = "bold 44px system-ui, sans-serif"; g.fillStyle = "#1e3a5f";
      g.fillText(t, xFor(b), H / 2 - 40);
    }
    // Caption repeated around the horizon.
    for (let k = 0; k < 4; k++) {
      const x = (W / 4) * k + W / 8;
      g.fillStyle = "rgba(15,23,42,.55)";
      g.beginPath(); g.roundRect(x - 230, 250, 460, 120, 22); g.fill();
      g.fillStyle = "#fff";
      g.font = "bold 30px system-ui, sans-serif"; g.fillText(label(s).slice(0, 30), x, 290);
      g.font = "24px system-ui, sans-serif"; g.fillText("📷 360° photo coming soon", x, 335);
    }
    return c.toDataURL("image/jpeg", 0.85);
  }

  // ---------------------------------------------------------------- the UI
  let viewer = null, current = null, dest = null, hsIds = [], mini = null, miniLayers = null, coneTimer = null, onCloseCb = null;
  // "real" = Google Street View imagery (needs GOOGLE_MAPS_EMBED_KEY), "photo" = our own 360 photos.
  const GKEY = window.GOOGLE_MAPS_EMBED_KEY || "";
  let mode = GKEY ? "real" : "photo", facing = 0;
  const streetViewURL = (at, h) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${at[0]},${at[1]}&heading=${Math.round(((h % 360) + 360) % 360)}`;
  const root = document.createElement("div");
  root.className = "tour"; root.hidden = true;
  root.innerHTML = `
    <div id="pano" class="tour-pano"></div>
    <iframe id="gsv" class="tour-pano" hidden title="Google Street View" loading="lazy" allowfullscreen
      referrerpolicy="no-referrer-when-downgrade"></iframe>
    <header class="tour-top">
      <button class="tour-btn" id="tour-close" aria-label="Close 360° tour">✕</button>
      <div class="tour-title"><b id="tour-name"></b><small id="tour-sub"></small></div>
      <div class="tour-modes" role="group" aria-label="View type">
        <button id="mode-real" class="tour-mode">🌐 Real view</button>
        <button id="mode-photo" class="tour-mode">📷 Our 360°</button>
      </div>
    </header>
    <div class="tour-guide">
      <label for="tour-dest">Walk to</label>
      <select id="tour-dest"><option value="">— just explore —</option></select>
      <div id="tour-links" class="tour-links" hidden></div>
      <div id="tour-hint" class="tour-hint"></div>
    </div>
    <div id="tour-mini" class="tour-mini" aria-label="Mini map"></div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  $("#tour-dest").innerHTML += [...PLACES].sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  $("#tour-close").onclick = close;
  $("#mode-real").onclick = () => {
    const s = spotById[current];
    if (!GKEY) { window.open(streetViewURL(s.at, currentFacing()), "_blank", "noopener"); return; }
    setMode("real");
  };
  $("#mode-photo").onclick = () => setMode("photo");
  function currentFacing() {
    return mode === "photo" && viewer ? heading(spotById[current]) + viewer.getYaw() : facing;
  }
  function setMode(m) {
    if (m === mode || !current) return;
    const f = currentFacing();
    mode = m;
    go(current, f);
  }
  $("#tour-dest").onchange = (e) => { dest = e.target.value || null; refresh(); };
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hidden) close(); });

  function linkDir(fromSpot, l) {
    return CR.bearing(fromSpot.at, CR.along(l.path, Math.min(15, l.metres / 2)));
  }

  async function open(spotId, opts = {}) {
    if (!links) buildLinks();
    const s = spotById[spotId] || TOUR_SPOTS[0];
    dest = opts.dest || null;
    onCloseCb = opts.onClose || null;
    $("#tour-dest").value = dest || "";
    root.hidden = false;
    document.body.classList.add("tour-open");
    initMini();
    await go(s.id, opts.facing);
  }

  async function go(id, facingCompass) {
    const s = spotById[id];
    if (!links) buildLinks();
    const yaw = facingCompass != null ? norm180(facingCompass - heading(s)) : facingFromRoute(s);
    facing = yaw + heading(s);
    $("#mode-real").classList.toggle("on", mode === "real");
    $("#mode-photo").classList.toggle("on", mode === "photo");
    $("#pano").hidden = mode !== "photo";
    $("#gsv").hidden = mode !== "real";
    if (mode === "real") {
      // Google's own Street View: the nearest Google panorama to this spot.
      current = id;
      $("#gsv").src = `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(GKEY)}` +
        `&location=${s.at[0]},${s.at[1]}&heading=${Math.round(((facing % 360) + 360) % 360)}&pitch=0&fov=90`;
      $("#tour-name").textContent = s.name;
      $("#tour-sub").textContent = "Google Street View · use the buttons below to go to the next spot";
      refresh();
      return;
    }
    const pano = await panoFor(s);
    const scene = { type: "equirectangular", panorama: pano.url, northOffset: heading(s), yaw, hfov: 100, pitch: -5 };
    if (!viewer) {
      viewer = pannellum.viewer("pano", {
        default: { firstScene: id, sceneFadeDuration: 500, autoLoad: true, compass: true, showControls: true,
          showFullscreenCtrl: false, mouseZoom: true, minHfov: 50, maxHfov: 120 },
        scenes: { [id]: scene },
      });
      viewer.on("load", () => refresh());
    } else {
      viewer.resize(); // in case it was hidden while "Real view" was showing
      if (!viewer.getConfig().scenes?.[id]) viewer.addScene(id, scene);
      viewer.loadScene(id, scene.pitch, yaw, scene.hfov);
    }
    current = id;
    $("#tour-name").textContent = s.name;
    $("#tour-sub").textContent = pano.real ? "360° view · drag to look around" : "360° preview · real photo coming soon";
  }

  // When arriving with a destination, face the next arrow.
  function facingFromRoute(s) {
    const r = dest && spotPath(s.id, spotForPlace(dest).id);
    if (r && r.ids.length > 1) {
      const l = links[s.id].find((x) => x.to === r.ids[1]);
      if (l) return norm180(linkDir(s, l) - heading(s));
    }
    const l0 = links[s.id][0];
    return l0 ? norm180(linkDir(s, l0) - heading(s)) : 0;
  }

  function refresh() {
    if (!current) return;
    const s = spotById[current];
    const target = dest && spotForPlace(dest);
    const r = target && spotPath(current, target.id);
    const nextId = r && r.ids[1];
    const arrive = (l) => go(l.to, dest ? null : CR.bearing(CR.along(l.path, Math.max(0, l.metres - 15)), spotById[l.to].at));

    // Real view: Street View is an iframe, so offer "next spot" buttons instead of ground arrows.
    const box = $("#tour-links");
    box.hidden = mode !== "real";
    if (mode === "real") {
      const ordered = [...links[current]].sort((a, b) => (b.to === nextId) - (a.to === nextId));
      box.innerHTML = ordered.map((l) => `<button data-to="${esc(l.to)}" class="${l.to === nextId ? "next" : ""}">${l.to === nextId ? "➜ " : ""}${esc(label(spotById[l.to]))} · ${Math.round(l.metres / 5) * 5} m</button>`).join("");
      box.querySelectorAll("button").forEach((b) => (b.onclick = () => arrive(links[current].find((l) => l.to === b.dataset.to))));
    }
    renderHint(target, r);
    refreshMini(r);
    if (mode !== "photo" || !viewer) return;

    // Clear the arrows we added before (in whichever scene they were added).
    for (const [h, sc] of hsIds) { try { viewer.removeHotSpot(h, sc); } catch (_) {} }
    hsIds = [];

    // Arrows pointing almost the same way get placed nearer/further so their labels don't overlap.
    const sorted = links[current].map((l) => ({ l, yaw: norm180(linkDir(s, l) - heading(s)) })).sort((x, y) => x.yaw - y.yaw);
    let prevYaw = null, row = 0;
    for (const { l, yaw } of sorted) {
      row = prevYaw !== null && Math.abs(yaw - prevYaw) < 30 ? (row + 1) % 3 : 0;
      prevYaw = yaw;
      const to = spotById[l.to];
      const id = `hs-${current}-${l.to}`;
      const isNext = l.to === nextId;
      viewer.addHotSpot({
        id, pitch: -14 - row * 13, yaw, cssClass: `tour-arrow${isNext ? " next" : ""}`,
        createTooltipFunc: (div) => {
          div.innerHTML = `<span class="ar">▲</span><span class="lbl">${isNext ? "➜ " : ""}${esc(label(to))} · ${Math.round(l.metres / 5) * 5} m</span>`;
          div.title = `Go to ${to.name}`;
        },
        // Arrive facing the way you were walking (or the next arrow when guided).
        clickHandlerFunc: () => arrive(l),
      }, current);
      hsIds.push([id, current]);
    }
  }

  let celebrated = null;
  function renderHint(target, r) {
    const hint = $("#tour-hint");
    const what = mode === "real" ? "purple button" : "glowing arrow";
    if (!dest) hint.textContent = mode === "real"
      ? "Drag to look around · Google's arrows move along the road · buttons jump to our next spot."
      : "Tap an arrow on the ground to walk to the next spot.";
    else if (target.id === current) {
      hint.innerHTML = `🎉 You've arrived at <b>${esc(placeById[dest].name)}</b>`;
      if (celebrated !== dest + current && window.FX) { celebrated = dest + current; FX.confetti(innerWidth / 2, innerHeight * 0.6); }
    }
    else if (r) hint.innerHTML = `Follow the <b class="pulse">${what}</b> · ${Math.round(r.metres / 10) * 10} m to go`;
    else hint.textContent = "No path found from here.";
  }

  // ------------------------------------------------------------- mini map
  function initMini() {
    if (mini) { setTimeout(() => mini.invalidateSize(), 50); return; }
    mini = L.map("tour-mini", { zoomControl: false, attributionControl: false, keyboard: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxNativeZoom: 19, maxZoom: 20, className: "osm-tiles" }).addTo(mini);
    for (const r of window.CAMPUS_DATA.roads) L.polyline(r, { color: "#fff", weight: 4, opacity: 0.8, interactive: false }).addTo(mini);
    for (const s of TOUR_SPOTS) {
      L.circleMarker(s.at, { radius: 4, color: "#fff", weight: 1, fillColor: "#7c3aed", fillOpacity: 0.9 })
        .on("click", () => go(s.id)).bindTooltip(esc(s.name), { direction: "top" }).addTo(mini);
    }
    miniLayers = L.layerGroup().addTo(mini);
    mini.setView(TOUR_SPOTS[0].at, 18);
  }
  function refreshMini(r) {
    if (!mini || !current) return;
    miniLayers.clearLayers();
    const s = spotById[current];
    if (r && r.ids.length > 1) {
      const pts = [];
      for (let i = 1; i < r.ids.length; i++) pts.push(...links[r.ids[i - 1]].find((l) => l.to === r.ids[i]).path);
      L.polyline(pts, { color: "#7c3aed", weight: 5, opacity: 0.9, interactive: false }).addTo(miniLayers);
    }
    const cone = L.marker(s.at, { interactive: false, icon: L.divIcon({ className: "", iconSize: [60, 60], iconAnchor: [30, 30], html: '<div class="cone"><div class="cone-in"></div></div>' }) }).addTo(miniLayers);
    L.circleMarker(s.at, { radius: 7, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1, interactive: false }).addTo(miniLayers);
    mini.setView(s.at, Math.max(mini.getZoom(), 18), { animate: true });
    clearInterval(coneTimer);
    coneTimer = setInterval(() => {
      if (root.hidden) return;
      const el = cone.getElement()?.querySelector(".cone");
      if (el) el.style.transform = `rotate(${currentFacing()}deg)`;
    }, 120);
  }

  function close() {
    root.hidden = true;
    document.body.classList.remove("tour-open");
    clearInterval(coneTimer);
    if (viewer) { viewer.destroy(); viewer = null; }
    $("#gsv").removeAttribute("src");
    hsIds = []; current = null;
    if (onCloseCb) onCloseCb();
  }

  window.CampusTour = { open, close, spotForPlace, nearestSpot, streetViewURL, spots: TOUR_SPOTS };
})();
