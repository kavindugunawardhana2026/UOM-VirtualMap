// 3D architectural campus map + live GPS tracking.
//
// MapLibre GL draws OpenFreeMap vector tiles (no API key) restyled white & green,
// with every building extruded to its OpenStreetMap height and the campus places
// from places.js re-drawn with their own multi-storey heights and floating labels.
// It is loaded on demand from the cube button; the Leaflet map in app.js stays
// underneath as the 2D / satellite / offline view.
//
// app.js and this file talk through window events:
//   campus:place  { id, path, to }  a place card opened (id null = closed)
//   campus:filter { cat }           a category chip was toggled
//   map3d:select  { id }            a building or label was tapped here
//   map3d:click                     empty map tapped here
(function () {
  const { PLACES, CATEGORIES, CAMPUS_DATA, CampusRouter, FX } = window;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = Object.fromEntries(PLACES.map((p) => [p.id, p]));

  const LIBS = {
    css: "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css",
    js: "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js",
    pmtiles: "https://cdn.jsdelivr.net/npm/pmtiles@3.2.1/dist/pmtiles.js",
  };
  const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
  // Optional: Overture Maps buildings as a PMTiles file (heights from satellite AI / LiDAR),
  // e.g. "https://<host>/buildings.pmtiles". Leave empty to use the OpenStreetMap heights
  // that come with the OpenFreeMap tiles. When set, it replaces them outside campus.
  const OVERTURE_BUILDINGS_PMTILES = "";

  const UOM = { center: [79.9009, 6.7951], zoom: 17.5, pitch: 60, bearing: -25 };
  const C = {
    ground: "#f1f5f9", building: "#f8fafc", campus: "#ffffff", dim: "#e2e8f0", edge: "#dbe3ec",
    green: "#4ade80", greenDeep: "#22c55e", road: "#ffffff", roadEdge: "#d9e1ea", route: "#2563eb", gps: "#3b82f6",
  };

  // Building heights. `floors` in places.js wins; these are estimates for the rest —
  // fix them after checking on site. Height = floors × FLOOR_M + roof.
  const FLOOR_M = 3.6, ROOF_M = 1.5;
  const FLOORS = {
    sumanadasa: 4, "exam-hall": 2, library: 3, admin: 3, medical: 1, "goda-canteen": 1, "wala-canteen": 1,
    "food-court": 1, "juice-shop": 1, textile: 3, "transport-eng": 2, "earth-resources": 2,
  };
  const HEIGHT_M = { gym: 11, "buddha-statue": 6, lagaan: 1.2, "civil-car-park": 0.3 };
  const heightOf = (p) => HEIGHT_M[p.id] ?? Math.round(((p.floors ?? FLOORS[p.id] ?? 2) * FLOOR_M + ROOF_M) * 10) / 10;
  const shortName = (p) => p.name.replace(/^Dept\. of /, "").replace(/ \(.*\)$/, "");
  const ll = ([lat, lng]) => [lng, lat];

  // The local "uom-custom-buildings" GeoJSON: OSM outlines of the campus places with their heights.
  function campusBuildings() {
    const features = [];
    for (const p of PLACES) {
      const ring = p.osm && CAMPUS_DATA.buildings[p.osm];
      if (!ring) continue;
      const coords = ring.map(ll);
      const [a, b] = [coords[0], coords[coords.length - 1]];
      if (a[0] !== b[0] || a[1] !== b[1]) coords.push(a);
      features.push({
        type: "Feature", id: features.length + 1,
        properties: { place: p.id, osm: +p.osm, height: heightOf(p), color: (CATEGORIES[p.cat] || CATEGORIES.other).color },
        geometry: { type: "Polygon", coordinates: [coords] },
      });
    }
    return { type: "FeatureCollection", features };
  }
  const BUILDINGS = campusBuildings();
  const fidOf = Object.fromEntries(BUILDINGS.features.map((f) => [f.properties.place, f.id]));
  const EMPTY = { type: "FeatureCollection", features: [] };

  // ------------------------------------------------------------ loading
  const btn = $("#btn-3d"), trackBtn = $("#m3d-track"), pitchBtn = $("#m3d-pitch"), resetBtn = $("#m3d-reset");
  if (!btn) return;
  const addScript = (src) => new Promise((ok, fail) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
  });
  const addCSS = (href) => new Promise((ok, fail) => {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = ok; l.onerror = fail; document.head.appendChild(l);
  });
  let loading = null;
  function loadLibs() {
    if (window.maplibregl) return Promise.resolve();
    loading = loading || Promise.all([addCSS(LIBS.css), addScript(LIBS.js)])
      .then(() => addScript(LIBS.pmtiles).catch(() => {})) // PMTiles is optional
      .catch((e) => { loading = null; throw e; });
    return loading;
  }
  function webgl() {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (_) { return false; }
  }

  const store = (v) => { try { localStorage.setItem("mapMode", v); } catch (_) {} };
  const saved = () => { try { return localStorage.getItem("mapMode"); } catch (_) { return null; } };
  const isDesktop = () => matchMedia("(min-width: 820px)").matches;
  const dur = (ms) => (FX.reduced ? 0 : ms);

  // Keep the camera's focus inside the part of the screen the panels don't cover.
  function padding() {
    if (isDesktop()) return { top: 90, bottom: 60, left: 452, right: 80 };
    const sheet = $("#sheet");
    const h = sheet ? sheet.getBoundingClientRect().height : 0;
    return { top: 150, bottom: Math.min(h, innerHeight * 0.6) + 10, left: 20, right: 64 };
  }

  let map = null, active = false, ready = false;
  let want3D = true;                 // tilted view (false = flat 2D)
  let lastPlace = { id: null };      // last campus:place from app.js
  let cat = null;

  async function enter() {
    if (active) return;
    if (!webgl()) { FX.toast("This browser can't draw the 3D map (WebGL is off). Staying on the 2D map.", "⚠️", 5000); return; }
    btn.classList.add("busy");
    try { await loadLibs(); } catch (_) {
      btn.classList.remove("busy");
      FX.toast("The 3D map needs internet the first time. Staying on the 2D map.", "📡", 5000);
      return;
    }
    btn.classList.remove("busy");
    active = true; store("3d");
    document.body.classList.add("mode-3d");
    btn.classList.add("active"); btn.setAttribute("aria-pressed", "true");
    btn.querySelector(".tip").textContent = "2D map";
    if (!map) create(); else { map.resize(); if (ready) applyPlace(true); }
  }
  function exit() {
    if (!active) return;
    active = false; store("2d");
    stopTracking();
    document.body.classList.remove("mode-3d");
    btn.classList.remove("active"); btn.setAttribute("aria-pressed", "false");
    btn.querySelector(".tip").textContent = "3D map";
  }
  btn.onclick = () => (active ? exit() : enter());

  // --------------------------------------------------------------- map
  function create() {
    if (window.pmtiles && !create.pm) { create.pm = new pmtiles.Protocol(); maplibregl.addProtocol("pmtiles", create.pm.tile); }
    map = new maplibregl.Map({
      container: "map3d", style: STYLE_URL,
      center: UOM.center, zoom: UOM.zoom, pitch: UOM.pitch, bearing: UOM.bearing,
      antialias: true, maxPitch: 75, minZoom: 14, maxZoom: 21,
      maxBounds: [[79.885, 6.782], [79.917, 6.809]],
      pixelRatio: Math.min(devicePixelRatio || 1, 2), // keeps phones near 60 fps
      attributionControl: false, fadeDuration: 150,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      restyle();
      addLayers();
      addLabels();
      ready = true;
      applyFilter();
      applyPlace(true);
    });
    map.on("pitchend", syncPitchBtn);
    map.on("zoom", sizeRing); // keep the accuracy circle in metres while zooming
    map.on("rotate", () => { resetBtn.querySelector("i").style.transform = `rotate(${-map.getBearing()}deg)`; });
    map.on("dragstart", (e) => { if (e.originalEvent) setFollow(false); });
    map.on("click", (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["m3d-uom-buildings"] })[0];
      if (f) dispatchEvent(new CustomEvent("map3d:select", { detail: f.properties.place }));
      else dispatchEvent(new CustomEvent("map3d:click"));
    });
    map.on("mouseenter", "m3d-uom-buildings", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "m3d-uom-buildings", () => { map.getCanvas().style.cursor = ""; });
  }

  // Recolour OpenFreeMap "bright" into the white / green architectural look.
  function restyle() {
    const set = (id, k, v) => { try { map.setPaintProperty(id, k, v); } catch (_) {} };
    for (const l of map.getStyle().layers) {
      const id = l.id, sl = l["source-layer"];
      if (l.type === "background") set(id, "background-color", C.ground);
      else if (sl === "building") map.setLayoutProperty(id, "visibility", "none"); // replaced by extrusions
      else if (l.type === "fill" && (sl === "park" || /landcover-(grass|wood)/.test(id))) {
        set(id, "fill-color", /wood/.test(id) ? C.greenDeep : C.green);
        set(id, "fill-opacity", /wood/.test(id) ? 0.5 : 0.7);
        set(id, "fill-outline-color", "rgba(0,0,0,0)");
      } else if (l.type === "fill" && sl === "landuse") { set(id, "fill-color", "#e9eef4"); set(id, "fill-opacity", 0.5); }
      else if (sl === "transportation" && !/railway|ferry|cablecar|oneway/.test(id)) {
        if (l.type === "fill") set(id, "fill-color", C.road);
        else if (l.type === "line") {
          set(id, "line-color", /casing/.test(id) ? C.roadEdge : C.road);
          if (/path/.test(id) && !/casing/.test(id)) {
            set(id, "line-dasharray", [1, 0]);
            set(id, "line-width", ["interpolate", ["exponential", 1.4], ["zoom"], 15, 1, 20, 7]);
          }
        }
      } else if (l.type === "symbol" && /^poi_r/.test(id)) map.setLayoutProperty(id, "visibility", "none"); // our labels replace these
      else if (l.type === "symbol") { set(id, "text-color", "#475569"); set(id, "text-halo-color", "#ffffff"); }
    }
    const firstLine = map.getStyle().layers.find((l) => l["source-layer"] === "transportation")?.id;
    // Grass pitches and playgrounds aren't drawn by the base style.
    map.addLayer({ id: "m3d-green", type: "fill", source: "openmaptiles", "source-layer": "landuse",
      filter: ["in", ["get", "class"], ["literal", ["pitch", "playground", "park", "grass", "recreation_ground"]]],
      paint: { "fill-color": C.green, "fill-opacity": 0.7 } }, firstLine);
    // Footways: a thin border so the white paths stand out from the grey ground.
    map.addLayer({ id: "m3d-path-casing", type: "line", source: "openmaptiles", "source-layer": "transportation",
      filter: ["==", ["get", "class"], "path"], layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.roadEdge, "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 15, 2.2, 20, 10] } },
      map.getLayer("highway-path") ? "highway-path" : undefined);
    try { map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.32, position: [1.3, 210, 35] }); } catch (_) {}
    try { map.setSky({ "sky-color": "#dbeafe", "horizon-color": "#f8fafc", "fog-color": C.ground, "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.92 }); } catch (_) {}
  }

  function addLayers() {
    const labelsAt = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    const osmIds = BUILDINGS.features.map((f) => f.properties.osm);
    // OpenMapTiles feature ids are the OSM way id × 10 (+ a type digit).
    const notCustom = ["case", ["==", ["typeof", ["id"]], "number"], ["!", ["in", ["floor", ["/", ["id"], 10]], ["literal", osmIds]]], true];

    // Footprint edges on the ground for a crisp, drawn look.
    map.addLayer({ id: "m3d-building-edge", type: "line", source: "openmaptiles", "source-layer": "building", minzoom: 15,
      paint: { "line-color": C.edge, "line-width": 1 } }, labelsAt);

    // Route: soft glow on the ground (the 3D dashes are added further down).
    map.addSource("m3d-route", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "m3d-route-glow", type: "line", source: "m3d-route", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 15, 6, 20, 18], "line-opacity": 0.22, "line-blur": 3 } }, labelsAt);

    map.addLayer({ id: "m3d-osm-buildings", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
      filter: notCustom,
      paint: {
        "fill-extrusion-color": C.building,
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 12],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.9],
        "fill-extrusion-vertical-gradient": true,
      } }, labelsAt);

    if (OVERTURE_BUILDINGS_PMTILES && window.pmtiles) {
      map.addSource("overture", { type: "vector", url: `pmtiles://${OVERTURE_BUILDINGS_PMTILES}`, attribution: "© Overture Maps Foundation" });
      map.addLayer({ id: "m3d-overture-buildings", type: "fill-extrusion", source: "overture", "source-layer": "building", minzoom: 14,
        paint: {
          "fill-extrusion-color": C.building,
          "fill-extrusion-height": ["coalesce", ["get", "height"], ["*", ["get", "num_floors"], FLOOR_M], 12],
          "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
          "fill-extrusion-opacity": 0.9, "fill-extrusion-vertical-gradient": true,
        } }, labelsAt);
      map.setLayoutProperty("m3d-osm-buildings", "visibility", "none");
    }

    map.addSource("uom-buildings", { type: "geojson", data: BUILDINGS });
    const sel = ["boolean", ["feature-state", "selected"], false];
    map.addLayer({ id: "m3d-uom-buildings", type: "fill-extrusion", source: "uom-buildings",
      paint: {
        "fill-extrusion-color": ["case", sel, ["get", "color"], ["boolean", ["feature-state", "dim"], false], C.dim, C.campus],
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.96,
        "fill-extrusion-vertical-gradient": true,
      } }, labelsAt);

    // Route dashes: short raised blocks along the path, so the line reads in 3D between buildings.
    map.addSource("m3d-route-dash", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "m3d-route-dash", type: "fill-extrusion", source: "m3d-route-dash",
      paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": 1.1, "fill-extrusion-base": 0.3, "fill-extrusion-opacity": 0.92 } }, labelsAt);
  }

  // ---------------------------------------------------- floating labels
  // HTML labels that sit on the roof of each building; lifted every frame by the
  // building height as it appears on screen at the current pitch and zoom.
  const labels = [];
  function addLabels() {
    for (const p of PLACES) {
      const c = CATEGORIES[p.cat] || CATEGORIES.other;
      const el = document.createElement("div");
      el.className = "m3d-anchor";
      el.innerHTML = `<button class="m3d-label" style="--c:${c.color}" aria-label="${esc(p.name)}"><span class="i">${c.icon}</span><span class="t">${esc(shortName(p))}</span></button>`;
      const inner = el.firstChild;
      inner.onclick = (e) => { e.stopPropagation(); dispatchEvent(new CustomEvent("map3d:select", { detail: p.id })); };
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(ll(p.at)).addTo(map);
      labels.push({ p, el, inner, marker, h: fidOf[p.id] ? heightOf(p) + 1 : 0.5 });
    }
    map.on("move", liftLabels);
    map.on("zoom", syncLabelZoom);
    liftLabels(); syncLabelZoom();
  }
  function liftLabels() {
    const pitch = (map.getPitch() * Math.PI) / 180, s = Math.sin(pitch);
    for (const L of labels) {
      let lift = 0;
      if (s > 0.01) {
        // Local ground scale (px per metre) at this point: the larger singular value
        // of the screen vectors for 1 m east and 1 m north. Handles perspective too.
        const [lat, lng] = L.p.at, k = 10;
        const o = map.project([lng, lat]);
        const e = map.project([lng + k / (111320 * Math.cos((lat * Math.PI) / 180)), lat]);
        const n = map.project([lng, lat + k / 110574]);
        const ex = (e.x - o.x) / k, ey = (e.y - o.y) / k, nx = (n.x - o.x) / k, ny = (n.y - o.y) / k;
        const a = ex * ex + ey * ey + nx * nx + ny * ny, det = ex * ny - ey * nx;
        const ppm = Math.sqrt((a + Math.sqrt(Math.max(0, a * a - 4 * det * det))) / 2);
        lift = L.h * ppm * s;
      }
      L.inner.style.transform = `translate(-50%, calc(-100% - ${lift.toFixed(1)}px))`;
    }
  }
  function syncLabelZoom() {
    const z = map.getZoom(), box = map.getContainer();
    box.classList.toggle("m3d-far", z < 18);
    box.classList.toggle("m3d-hide-labels", z < 15.5);
  }

  // ----------------------------------------------------- selection
  let selFid = null;
  function highlight(id) {
    if (selFid) map.setFeatureState({ source: "uom-buildings", id: selFid }, { selected: false });
    selFid = fidOf[id] || null;
    if (selFid) map.setFeatureState({ source: "uom-buildings", id: selFid }, { selected: true });
    for (const L of labels) L.el.classList.toggle("sel", L.p.id === id);
  }
  function applyPlace(fly) {
    if (!ready) return;
    const p = byId[lastPlace.id];
    highlight(p ? p.id : null);
    if (p && fly) {
      map.flyTo({ center: ll(p.at), zoom: 19, pitch: want3D ? 65 : 0, bearing: map.getBearing(), padding: padding(), duration: dur(1600), essential: true });
      setFollow(false);
    }
    drawRoute();
  }
  addEventListener("campus:place", (e) => {
    const changed = e.detail.id !== lastPlace.id;
    lastPlace = e.detail;
    gps.routedAt = null;
    if (active) applyPlace(changed);
  });

  function applyFilter() {
    if (!ready) return;
    for (const L of labels) L.el.classList.toggle("dim", !!cat && L.p.cat !== cat);
    for (const f of BUILDINGS.features) map.setFeatureState({ source: "uom-buildings", id: f.id }, { dim: !!cat && byId[f.properties.place].cat !== cat });
  }
  addEventListener("campus:filter", (e) => {
    cat = e.detail.cat;
    if (!active || !ready) return;
    applyFilter();
    const pts = PLACES.filter((p) => p.cat === cat).map((p) => ll(p.at));
    if (!pts.length) return;
    const b = pts.reduce((bb, x) => bb.extend(x), new maplibregl.LngLatBounds(pts[0], pts[0]));
    map.fitBounds(b, { padding: padding(), maxZoom: 18.5, pitch: want3D ? 55 : 0, duration: dur(1200) });
  });

  // ---------------------------------------------------------- route
  // From the live GPS position when tracking, otherwise the route app.js drew.
  function drawRoute() {
    if (!ready) return;
    const p = byId[lastPlace.id];
    let path = lastPlace.path || null, color = C.route;
    if (p && gps.shown && gps.watch != null) {
      const at = [gps.shown[1], gps.shown[0]];
      try {
        const r = CampusRouter.route(at, lastPlace.to || p.entrance || p.at, { destName: shortName(p) });
        if (r) { path = [at, ...r.path]; color = C.gps; }
      } catch (_) { path = [at, p.at]; color = C.gps; }
      gps.routedAt = at;
    }
    const line = path ? { type: "Feature", properties: { color }, geometry: { type: "LineString", coordinates: path.map(ll) } } : null;
    map.getSource("m3d-route").setData(line ? { type: "FeatureCollection", features: [line] } : EMPTY);
    map.getSource("m3d-route-dash").setData(path ? dashes(path, color) : EMPTY);
  }
  function dashes(path, color, dash = 2.6, gap = 2.2, w = 1.3) {
    const M_LAT = 110574, M_LNG = 111320 * Math.cos((path[0][0] * Math.PI) / 180);
    const xy = ([lat, lng]) => [lng * M_LNG, lat * M_LAT];
    const back = ([x, y]) => [x / M_LNG, y / M_LAT];
    const pts = path.map(xy), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const at = (m) => {
      let i = 1; while (i < cum.length - 1 && cum[i] < m) i++;
      const seg = cum[i] - cum[i - 1] || 1, t = (m - cum[i - 1]) / seg;
      return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
    };
    const features = [];
    for (let s = 0; s < total; s += dash + gap) {
      const a = at(s), b = at(Math.min(total, s + dash));
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 0.3) continue;
      const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
      const ring = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]].map(back);
      features.push({ type: "Feature", properties: { color }, geometry: { type: "Polygon", coordinates: [ring] } });
    }
    return { type: "FeatureCollection", features };
  }

  // ------------------------------------------------------ live GPS
  // watchPosition fixes arrive about once a second; the marker glides between them
  // (linear interpolation in requestAnimationFrame), snapped onto the nearest footpath.
  const gps = { watch: null, follow: false, shown: null, from: null, to: null, t0: 0, dur: 1000, last: 0,
    acc: 0, heading: null, raf: 0, dot: null, ring: null, routedAt: null, holdUntil: 0, warned: false };

  function setTrackState(s) {
    trackBtn.dataset.state = s;
    trackBtn.setAttribute("aria-pressed", String(s !== "off"));
    trackBtn.querySelector(".lbl").textContent = s === "off" ? "Live Track" : s === "searching" ? "Locating…" : gps.follow ? "Following" : "Live";
  }
  function startTracking() {
    if (!navigator.geolocation) { FX.toast("Location is not available on this device.", "⚠️"); return; }
    gps.follow = true;
    setTrackState("searching");
    gps.watch = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  function stopTracking() {
    if (gps.watch != null) navigator.geolocation.clearWatch(gps.watch);
    gps.watch = null; gps.follow = false; gps.shown = null; gps.heading = null;
    cancelAnimationFrame(gps.raf); gps.raf = 0;
    if (gps.dot) { gps.dot.remove(); gps.ring.remove(); gps.dot = gps.ring = null; }
    setTrackState("off");
    if (ready) drawRoute();
  }
  function setFollow(on) {
    if (gps.follow === on) return;
    gps.follow = on;
    if (gps.watch != null && gps.shown) {
      setTrackState("live");
      if (on) {
        gps.holdUntil = performance.now() + dur(900);
        map.easeTo({ center: gps.shown, zoom: Math.max(map.getZoom(), 18.5), pitch: want3D ? 60 : 0, padding: padding(), duration: dur(900) });
      }
    }
  }
  trackBtn.onclick = () => {
    if (gps.watch == null) startTracking();
    else if (!gps.follow) setFollow(true);
    else { stopTracking(); FX.toast("Live tracking off", "📍", 2000); }
  };

  function onFix(pos) {
    const c = pos.coords, now = performance.now();
    let at = [c.longitude, c.latitude];
    gps.acc = c.accuracy;
    // Snap onto the walkway when the fix is close enough to one.
    const sn = CampusRouter.snap([c.latitude, c.longitude]);
    if (sn && sn.d <= Math.min(12, Math.max(4, c.accuracy))) at = ll(sn.at);
    if (c.heading != null && !isNaN(c.heading) && (c.speed == null || c.speed > 0.6)) gps.heading = c.heading;

    if (!gps.shown) {
      gps.shown = at; gps.from = gps.to = at;
      makeMarkers();
      setTrackState("live");
      if (!gps.warned && CampusRouter.dist([c.latitude, c.longitude], [UOM.center[1], UOM.center[0]]) > 1500) {
        gps.warned = true;
        FX.toast("You seem to be away from campus — the blue dot still follows you.", "🧭", 5000);
      } else if (c.accuracy > 50) FX.toast(`GPS is weak right now (±${Math.round(c.accuracy)} m). It gets better outdoors.`, "📡", 5000);
      if (gps.follow) {
        gps.holdUntil = now + dur(1200);
        map.flyTo({ center: at, zoom: 18.8, pitch: want3D ? 60 : 0, bearing: gps.heading ?? map.getBearing(), padding: padding(), duration: dur(1200) });
      }
    } else {
      gps.from = gps.shown.slice(); gps.to = at; gps.t0 = now;
      gps.dur = Math.max(250, Math.min(1500, now - gps.last));
    }
    gps.last = now;
    sizeRing();
    gps.dot.getElement().classList.toggle("has-heading", gps.heading != null);
    if (gps.heading != null) gps.dot.setRotation(gps.heading);
    // Re-route from the new position every ~12 m of walking.
    if (byId[lastPlace.id] && (!gps.routedAt || CampusRouter.dist(gps.routedAt, [at[1], at[0]]) > 12)) drawRoute();
    if (!gps.raf) gps.raf = requestAnimationFrame(tick);
  }
  function onError(err) {
    if (err.code === 1) { // permission denied
      stopTracking();
      FX.toast("Location permission is off. Allow it in your browser settings to use Live Track.", "⚠️", 6000);
    } else if (!gps.shown) setTrackState("searching");
  }

  function tick(t) {
    gps.raf = 0;
    if (!gps.dot) return;
    const k = Math.min(1, (t - gps.t0) / gps.dur);
    gps.shown = [gps.from[0] + (gps.to[0] - gps.from[0]) * k, gps.from[1] + (gps.to[1] - gps.from[1]) * k];
    gps.dot.setLngLat(gps.shown); gps.ring.setLngLat(gps.shown);
    let more = k < 1;
    if (gps.follow && t > gps.holdUntil && !map.isZooming() && !map.isRotating()) {
      const cam = { center: gps.shown, padding: padding() };
      if (gps.heading != null) {
        const b = map.getBearing(), d = ((gps.heading - b + 540) % 360) - 180;
        if (Math.abs(d) > 0.3) { cam.bearing = b + d * 0.08; more = true; }
      }
      map.jumpTo(cam);
    }
    if (more) gps.raf = requestAnimationFrame(tick);
  }

  function makeMarkers() {
    const ring = document.createElement("div"); ring.className = "user-gps-accuracy";
    const dot = document.createElement("div"); dot.className = "user-gps-marker";
    dot.innerHTML = '<span class="hdg"></span><span class="core"></span>';
    gps.ring = new maplibregl.Marker({ element: ring, pitchAlignment: "map", rotationAlignment: "map" }).setLngLat(gps.shown).addTo(map);
    gps.dot = new maplibregl.Marker({ element: dot, rotationAlignment: "map", pitchAlignment: "viewport" }).setLngLat(gps.shown).addTo(map);
  }
  // Accuracy circle diameter in pixels at the current zoom.
  function sizeRing() {
    if (!gps.ring) return;
    const lat = gps.shown[1];
    const ppm = (512 * Math.pow(2, map.getZoom())) / (40075016.686 * Math.cos((lat * Math.PI) / 180));
    const d = Math.min(2000, Math.max(16, 2 * gps.acc * ppm));
    const el = gps.ring.getElement(); el.style.width = el.style.height = `${d.toFixed(0)}px`;
  }

  // --------------------------------------------------------- controls
  function syncPitchBtn() {
    want3D = map.getPitch() > 15;
    pitchBtn.querySelector(".lbl").textContent = want3D ? "2D" : "3D";
    pitchBtn.setAttribute("aria-label", want3D ? "Switch to flat 2D view" : "Switch to 3D view");
  }
  pitchBtn.onclick = () => {
    if (!map) return;
    want3D = map.getPitch() <= 15;
    map.easeTo({ pitch: want3D ? 60 : 0, duration: dur(900) });
  };
  resetBtn.onclick = () => {
    if (!map) return;
    setFollow(false);
    want3D = true;
    map.flyTo({ ...UOM, padding: padding(), duration: dur(1400), essential: true });
  };
  addEventListener("resize", () => { if (map && active) map.resize(); });

  // Start in 3D when it was the last choice (or ?view=3d).
  const want = new URLSearchParams(location.search).get("view");
  if (want === "3d" || (want !== "2d" && saved() === "3d")) setTimeout(enter, 400);

  window.Map3D = { enter, exit, get active() { return active; }, get map() { return map; } };
})();
