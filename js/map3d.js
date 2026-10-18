// Real 3D campus map (the "Real" style of the 3D view) on Google Photorealistic 3D Tiles
// + live GPS tracking.
//
// CesiumJS streams Google's photorealistic mesh of the real campus (Map Tiles API).
// Our own layers sit on top of that mesh: the selected / filtered buildings are tinted
// by classification volumes cut from their OSM outlines, the route is draped over the
// mesh, and the floating labels and the live GPS dot are HTML pinned to world positions
// every frame. js/map3d-modes.js opens it, or switches to it from the "Minimal" style
// (js/map3d-minimal.js); the Leaflet map in app.js stays underneath as the 2D view.
//
// Without an API key this style isn't offered. When Google refuses the key it fires
// map3d:real-failed and map3d-modes.js carries on in the Minimal style.
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

  const CESIUM_URL = "https://cdnjs.cloudflare.com/ajax/libs/cesium/1.133.0/";
  // Google Maps Platform key with the Map Tiles API enabled. It is sent from the browser,
  // so restrict it to this site's address (HTTP referrers) in the Google Cloud console.
  const GOOGLE_MAPS_API_KEY = "AIzaSyCf2ewXwGX55AWIJxwLH0m1D47-mpvzM2s";
  const GOOGLE_3D_TILES = "https://tile.googleapis.com/v1/3dtiles/root.json";
  const hasKey = !!GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "YOUR_API_KEY";

  // University of Moratuwa. heading / pitch in degrees, range in metres from the focus point.
  const UOM = { lng: 79.9009, lat: 6.7925, heading: -25, pitch: -40, range: 700 };
  const PITCH_3D = -40, PITCH_2D = -89.5, PLACE_RANGE = 230, TRACK_RANGE = 220;
  // Google's mesh uses WGS84 ellipsoid heights, and campus ground is roughly 90 m *below*
  // the ellipsoid here (the geoid dips to about −95 m around Sri Lanka). This is only the
  // starting guess; it is re-measured from the mesh once tiles arrive.
  const GROUND_GUESS = -90;
  const C = { route: "#2563eb", gps: "#3b82f6" };

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
  const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;

  // OSM outlines of the campus places, as [lng, lat] rings without the closing point.
  const BUILDINGS = [];
  for (const p of PLACES) {
    const ring = p.osm && CAMPUS_DATA.buildings[p.osm];
    if (!ring) continue;
    const coords = ring.map(ll);
    const [a, b] = [coords[0], coords[coords.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) coords.pop();
    BUILDINGS.push({ place: p.id, ring: coords, height: heightOf(p), color: (CATEGORIES[p.cat] || CATEGORIES.other).color });
  }
  const hasBuilding = Object.fromEntries(BUILDINGS.map((b) => [b.place, true]));
  function inRing([x, y], ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const buildingAt = (lng, lat) => BUILDINGS.find((b) => inRing([lng, lat], b.ring))?.place || null;

  // ------------------------------------------------------------ loading
  const trackBtn = $("#m3d-track"), pitchBtn = $("#m3d-pitch"), resetBtn = $("#m3d-reset");
  const box = $("#map3d");
  if (!box) return;
  const addScript = (src) => new Promise((ok, fail) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
  });
  const addCSS = (href) => new Promise((ok, fail) => {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = ok; l.onerror = fail; document.head.appendChild(l);
  });
  let loading = null;
  function loadLibs() {
    if (window.Cesium) return Promise.resolve();
    window.CESIUM_BASE_URL = CESIUM_URL; // workers, shaders and assets load from here
    loading = loading || Promise.all([addCSS(CESIUM_URL + "Widgets/widgets.css"), addScript(CESIUM_URL + "Cesium.js")])
      .catch((e) => { loading = null; throw e; });
    return loading;
  }
  function webgl() {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (_) { return false; }
  }

  const isDesktop = () => matchMedia("(min-width: 820px)").matches;
  const dur = (ms) => (FX.reduced ? 0 : ms);

  // The part of the screen the panels don't cover; the camera keeps its focus in there.
  function padding() {
    if (isDesktop()) return { top: 90, bottom: 60, left: 452, right: 80 };
    const sheet = $("#sheet");
    const h = sheet ? sheet.getBoundingClientRect().height : 0;
    return { top: 150, bottom: Math.min(h, innerHeight * 0.6) + 10, left: 20, right: 64 };
  }

  let viewer = null, scene = null, camera = null, tileset = null;
  let active = false, ready = false;
  let want3D = true;                 // tilted view (false = straight down)
  let lastPlace = { id: null };      // last campus:place from app.js
  let cat = null;
  let groundH = GROUND_GUESS;
  let available = hasKey;            // false once Google has refused the key

  // Shows this view; resolves false (with a toast) when it can't run here.
  async function enter() {
    if (active) return true;
    if (!available) return false;
    if (!webgl()) { FX.toast("This browser can't draw the 3D map (WebGL is off). Staying on the 2D map.", "⚠️", 5000); return false; }
    try { await loadLibs(); } catch (_) {
      FX.toast("The 3D map needs internet the first time. Staying on the 2D map.", "📡", 5000);
      return false;
    }
    active = true;
    box.classList.add("on");
    if (!viewer) {
      try { create(); } catch (e) {
        console.error(e);
        exit();
        FX.toast("The real 3D map couldn't start on this device.", "⚠️", 5000);
        return false;
      }
    } else {
      viewer.useDefaultRenderLoop = true;
      viewer.resize(); scene.requestRender();
      if (ready) applyPlace(true);
    }
    syncPitchBtn();
    return true;
  }
  function exit() {
    if (!active) return;
    active = false;
    stopTracking();
    if (viewer) viewer.useDefaultRenderLoop = false; // stop drawing while hidden
    box.classList.remove("on");
  }

  // --------------------------------------------------------------- map
  function create() {
    const Cs = window.Cesium;
    viewer = new Cs.Viewer(box, {
      globe: false, baseLayer: false, // Google's mesh already includes the ground
      animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false,
      baseLayerPicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, projectionPicker: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity, // only draw when something changes
    });
    scene = viewer.scene; camera = viewer.camera;
    scene.screenSpaceCameraController.minimumZoomDistance = 25;
    scene.screenSpaceCameraController.maximumZoomDistance = 8000;
    const clicks = viewer.screenSpaceEventHandler;
    clicks.removeInputAction(Cs.ScreenSpaceEventType.LEFT_DOUBLE_CLICK); // no entity tracking
    clicks.setInputAction(onClick, Cs.ScreenSpaceEventType.LEFT_CLICK);

    overlay = document.createElement("div");
    overlay.className = "m3d-overlay";
    box.appendChild(overlay);

    addRoute();
    addLabels();
    buildVolumes();
    scene.preRender.addEventListener(() => { if (volumesDirty) paintVolumes(); });
    scene.postRender.addEventListener(drawOverlay);
    watchInput();

    view(uomTarget(), hpr(UOM.heading, UOM.pitch, UOM.range), 0);
    ready = true;
    applyFilter();
    applyPlace(true);

    loadGoogleTiles();
  }

  async function loadGoogleTiles() {
    try {
      tileset = await Cesium.Cesium3DTileset.fromUrl(`${GOOGLE_3D_TILES}?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`, {
        showCreditsOnScreen: true,                   // Google's attribution must stay visible
        maximumScreenSpaceError: isDesktop() ? 16 : 24, // a bit coarser on phones
      });
    } catch (e) {
      console.error(e);
      available = false;
      FX.toast("Google's real 3D tiles didn't load (check the API key and that the Map Tiles API is on). Showing the minimal 3D map.", "🗺️", 6000);
      dispatchEvent(new CustomEvent("map3d:real-failed"));
      return;
    }
    scene.primitives.add(tileset);
    // Keep the camera above the mesh — but only once real tiles are in: the coarse first
    // tiles would push the starting view kilometres up.
    tileset.initialTilesLoaded.addEventListener(() => { tileset.enableCollision = true; setTimeout(resample, 0); });
    // Render-on-demand doesn't always redraw for the last tiles to arrive; ask for it.
    tileset.tileLoad.addEventListener(() => scene.requestRender());
    let last = 0;
    tileset.allTilesLoaded.addEventListener(() => {
      const now = performance.now();
      scene.requestRender();
      if (now - last < 2000) return;
      last = now;
      setTimeout(resample, 0); // not inside the render
    });
  }

  // ------------------------------------------------------------ camera
  const hpr = (h, p, range) => new Cesium.HeadingPitchRange(rad(h), rad(p), range);
  const at = (lng, lat, h) => Cesium.Cartesian3.fromDegrees(lng, lat, h);
  const uomTarget = () => at(UOM.lng, UOM.lat, groundH);
  let flying = false;

  // Look at `target` from heading / pitch / range, then slide sideways so the target sits
  // in the middle of the uncovered part of the screen. ms = 0 jumps there.
  function view(target, o, ms) {
    const c = new Cesium.Camera(scene);
    c.frustum = camera.frustum.clone();
    c.lookAt(target, o);
    c.lookAtTransform(Cesium.Matrix4.IDENTITY);
    const p = padding(), H = Math.max(scene.canvas.clientHeight, innerHeight, 1);
    const mpp = (2 * o.range * Math.tan(c.frustum.fovy / 2)) / H; // metres per pixel at the target
    // Capped, so a canvas caught mid-resize can't throw the camera kilometres off.
    const cap = (m) => Math.max(-0.4 * o.range, Math.min(0.4 * o.range, m));
    c.moveDown(cap(((p.bottom - p.top) / 2) * mpp));
    c.moveLeft(cap(((p.left - p.right) / 2) * mpp));
    const dest = { destination: c.position, orientation: { direction: c.direction, up: c.up } };
    if (!ms) { camera.setView(dest); scene.requestRender(); return; }
    flying = true;
    camera.flyTo({ ...dest, duration: ms / 1000, easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => { flying = false; scene.requestRender(); }, cancel: () => { flying = false; } });
  }
  // The mesh point in the middle of the uncovered screen, and how far ahead of the camera it is.
  function focus() {
    const p = padding(), cv = scene.canvas;
    const px = new Cesium.Cartesian2((p.left + cv.clientWidth - p.right) / 2, (p.top + cv.clientHeight - p.bottom) / 2);
    let target = scene.pickPositionSupported ? scene.pickPosition(px) : undefined;
    if (!target) {
      const alt = camera.positionCartographic.height - groundH;
      const d = Math.min(4000, alt / Math.max(0.2, Math.sin(-camera.pitch)));
      target = Cesium.Ray.getPoint(camera.getPickRay(px), d);
    }
    return { target, range: rangeTo(target) };
  }
  const rangeTo = (target) => Math.max(30, Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(target, camera.positionWC, new Cesium.Cartesian3()), camera.directionWC));
  const tiltPitch = () => (want3D ? PITCH_3D : PITCH_2D);

  // Dragging the map stops Live Track from following.
  let down = null, lastWheel = 0;
  function watchInput() {
    const cv = scene.canvas;
    cv.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener("pointermove", (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) setFollow(false); });
    addEventListener("pointerup", () => { down = null; });
    addEventListener("pointercancel", () => { down = null; });
    cv.addEventListener("wheel", () => { lastWheel = performance.now(); }, { passive: true });
  }

  function onClick(e) {
    let id = null;
    const pos = scene.pickPositionSupported ? scene.pickPosition(e.position) : undefined;
    if (pos) {
      const c = Cesium.Cartographic.fromCartesian(pos);
      id = buildingAt(deg(c.longitude), deg(c.latitude));
    }
    if (id) dispatchEvent(new CustomEvent("map3d:select", { detail: id }));
    else dispatchEvent(new CustomEvent("map3d:click"));
  }

  // ------------------------------------------- heights from the Google mesh
  // Each label's spot is sampled on the mesh (a roof, a tree top or the ground). The low
  // end of those samples is the campus ground level, used for the GPS dot and volumes.
  let volumes = [];
  function resample() {
    if (!tileset || !scene.sampleHeightSupported) return;
    const skip = [...volumes, routeGlow, routeLine].filter(Boolean);
    const hs = [];
    for (const L of labels) {
      const [lat, lng] = L.p.at;
      let h;
      try { h = scene.sampleHeight(Cesium.Cartographic.fromDegrees(lng, lat), skip); } catch (_) {}
      if (h === undefined) continue;
      L.top = h; hs.push(h);
    }
    if (hs.length >= 5) {
      hs.sort((a, b) => a - b);
      const g = hs[Math.floor(hs.length * 0.15)];
      if (Math.abs(g - groundH) > 1.5) { groundH = g; buildVolumes(); }
    }
    for (const L of labels) L.pos = labelPos(L);
    scene.requestRender();
  }

  // --------------------------------------------- building tint (classification)
  // One translucent column per campus building, from below the ground to above the roof.
  // Whatever part of the Google mesh falls inside it is tinted in the category colour.
  // (Classification needs one colour per primitive, hence one primitive per building.)
  let volumesDirty = false, selId = null;
  function buildVolumes() {
    if (!scene) return;
    for (const v of volumes) scene.primitives.remove(v);
    volumes = BUILDINGS.map((b) => {
      const v = scene.primitives.add(new Cesium.ClassificationPrimitive({
        geometryInstances: new Cesium.GeometryInstance({
          id: b.place,
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(b.ring.flat())),
            height: groundH - 25, extrudedHeight: groundH + b.height + 25,
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(b.color).withAlpha(0.5)) },
        }),
        classificationType: Cesium.ClassificationType.BOTH,
        show: false,
      }));
      v.place = b;
      return v;
    });
    volumesDirty = true;
    scene.requestRender();
  }
  function paintVolumes() {
    volumesDirty = false;
    for (const v of volumes) {
      const b = v.place, sel = b.place === selId;
      v.show = sel || (!!cat && byId[b.place].cat === cat);
      if (!v.show) continue;
      const a = v.ready && v.getGeometryInstanceAttributes(b.place);
      if (!a) { volumesDirty = true; setTimeout(() => scene.requestRender(), 50); continue; } // still building; retry
      a.color = Cesium.ColorGeometryInstanceAttribute.toValue(Cesium.Color.fromCssColorString(b.color).withAlpha(sel ? 0.6 : 0.35), a.color);
    }
  }

  // ---------------------------------------------------- floating labels
  // HTML labels pinned just above each building's roof on the mesh.
  let overlay = null;
  const labels = [];
  function labelPos(L) {
    const [lat, lng] = L.p.at;
    return at(lng, lat, (L.top ?? groundH + L.h) + 2);
  }
  function addLabels() {
    for (const p of PLACES) {
      const c = CATEGORIES[p.cat] || CATEGORIES.other;
      const el = document.createElement("div");
      el.className = "m3d-anchor";
      el.innerHTML = `<button class="m3d-label" style="--c:${c.color}" aria-label="${esc(p.name)}"><span class="i">${c.icon}</span><span class="t">${esc(shortName(p))}</span></button>`;
      el.firstChild.onclick = (e) => { e.stopPropagation(); dispatchEvent(new CustomEvent("map3d:select", { detail: p.id })); };
      overlay.appendChild(el);
      const L = { p, el, h: hasBuilding[p.id] ? heightOf(p) + 1 : 0.5, top: null };
      L.pos = labelPos(L);
      labels.push(L);
    }
  }

  // Screen position of a world point, or null when it's behind the camera.
  let scratch = null;
  function toScreen(pos) {
    scratch = scratch || new Cesium.Cartesian3();
    if (Cesium.Cartesian3.dot(Cesium.Cartesian3.subtract(pos, camera.positionWC, scratch), camera.directionWC) <= 0) return null;
    return Cesium.SceneTransforms.worldToWindowCoordinates(scene, pos);
  }
  function pin(el, pos, extra = "") {
    const s = toScreen(pos), cv = scene.canvas;
    if (!s || s.x < -200 || s.y < -200 || s.x > cv.clientWidth + 200 || s.y > cv.clientHeight + 200) { el.style.visibility = "hidden"; return null; }
    el.style.visibility = "";
    el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)${extra}`;
    return s;
  }

  // After every frame: move the labels and the GPS marker to where their points are now.
  function drawOverlay() {
    if (!active) return;
    const alt = camera.positionCartographic.height - groundH;
    box.classList.toggle("m3d-far", alt > 450);
    box.classList.toggle("m3d-hide-labels", alt > 2500);
    if (alt <= 2500) for (const L of labels) pin(L.el, L.pos);
    if (gps.dotEl) drawGps();
    resetBtn.querySelector("i").style.transform = `rotate(${-deg(camera.heading)}deg)`;
    if (!flying) syncPitchBtn();
  }

  // ----------------------------------------------------- selection
  function highlight(id) {
    selId = hasBuilding[id] ? id : null;
    volumesDirty = true;
    for (const L of labels) L.el.classList.toggle("sel", L.p.id === id);
    scene.requestRender();
  }
  function applyPlace(fly) {
    if (!ready) return;
    const p = byId[lastPlace.id];
    highlight(p ? p.id : null);
    if (p && fly) {
      const L = labels.find((x) => x.p.id === p.id);
      view(L ? L.pos : at(p.at[1], p.at[0], groundH), hpr(deg(camera.heading), want3D ? -45 : PITCH_2D, PLACE_RANGE), dur(1600));
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
    volumesDirty = true;
    scene.requestRender();
  }
  addEventListener("campus:filter", (e) => {
    cat = e.detail.cat;
    if (!active || !ready) return;
    applyFilter();
    const pts = labels.filter((L) => L.p.cat === cat).map((L) => L.pos);
    if (!pts.length) return;
    const s = Cesium.BoundingSphere.fromPoints(pts);
    view(s.center, hpr(deg(camera.heading), want3D ? -50 : PITCH_2D, Math.max(260, s.radius * 2.8)), dur(1200));
  });

  // ---------------------------------------------------------- route
  // Draped over the mesh. From the live GPS position when tracking, otherwise the route app.js drew.
  let routeGlow = null, routeLine = null;
  function addRoute() {
    const line = { positions: [], clampToGround: true, classificationType: Cesium.ClassificationType.BOTH };
    routeGlow = viewer.entities.add({ show: false, polyline: { ...line, width: 14 } });
    routeLine = viewer.entities.add({ show: false, polyline: { ...line, width: 5 } });
  }
  function drawRoute() {
    if (!ready) return;
    const p = byId[lastPlace.id];
    let path = lastPlace.path || null, color = C.route;
    if (p && gps.shown && gps.watch != null) {
      const here = [gps.shown[1], gps.shown[0]];
      try {
        const r = CampusRouter.route(here, lastPlace.to || p.entrance || p.at, { destName: shortName(p) });
        if (r) { path = [here, ...r.path]; color = C.gps; }
      } catch (_) { path = [here, p.at]; color = C.gps; }
      gps.routedAt = here;
    }
    const show = !!path && path.length > 1;
    routeGlow.show = routeLine.show = show;
    if (show) {
      const positions = path.map(([lat, lng]) => at(lng, lat, 0));
      const c = Cesium.Color.fromCssColorString(color);
      routeGlow.polyline.positions = positions;
      routeGlow.polyline.material = c.withAlpha(0.28);
      routeLine.polyline.positions = positions;
      routeLine.polyline.material = new Cesium.PolylineDashMaterialProperty({ color: c, gapColor: Cesium.Color.WHITE.withAlpha(0.85), dashLength: 18 });
    }
    scene.requestRender();
  }

  // ------------------------------------------------------ live GPS
  // watchPosition fixes arrive about once a second; the marker glides between them
  // (linear interpolation in requestAnimationFrame), snapped onto the nearest footpath.
  // The dot and its accuracy circle are HTML drawn over the mesh, laid flat on the ground.
  const gps = { watch: null, follow: false, shown: null, from: null, to: null, t0: 0, dur: 1000, last: 0,
    acc: 0, heading: null, raf: 0, dotEl: null, ringEl: null, routedAt: null, holdUntil: 0, warned: false };
  const gpsPos = () => at(gps.shown[0], gps.shown[1], groundH + 0.5);

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
    if (gps.dotEl) { gps.dotEl.remove(); gps.ringEl.remove(); gps.dotEl = gps.ringEl = null; }
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
        view(gpsPos(), hpr(deg(camera.heading), tiltPitch(), Math.min(focus().range, TRACK_RANGE)), dur(900));
      }
    }
  }
  trackBtn.addEventListener("click", () => {
    if (!active || !ready) return; // the other 3D style has the buttons
    if (gps.watch == null) startTracking();
    else if (!gps.follow) setFollow(true);
    else { stopTracking(); FX.toast("Live tracking off", "📍", 2000); }
  });

  function onFix(pos) {
    const c = pos.coords, now = performance.now();
    let here = [c.longitude, c.latitude];
    gps.acc = c.accuracy;
    // Snap onto the walkway when the fix is close enough to one.
    const sn = CampusRouter.snap([c.latitude, c.longitude]);
    if (sn && sn.d <= Math.min(12, Math.max(4, c.accuracy))) here = ll(sn.at);
    if (c.heading != null && !isNaN(c.heading) && (c.speed == null || c.speed > 0.6)) gps.heading = c.heading;

    if (!gps.shown) {
      gps.shown = here; gps.from = gps.to = here;
      makeMarkers();
      setTrackState("live");
      if (!gps.warned && CampusRouter.dist([c.latitude, c.longitude], [UOM.lat, UOM.lng]) > 1500) {
        gps.warned = true;
        FX.toast("You seem to be away from campus — the blue dot still follows you.", "🧭", 5000);
      } else if (c.accuracy > 50) FX.toast(`GPS is weak right now (±${Math.round(c.accuracy)} m). It gets better outdoors.`, "📡", 5000);
      if (gps.follow) {
        gps.holdUntil = now + dur(1200);
        view(gpsPos(), hpr(gps.heading ?? deg(camera.heading), tiltPitch(), TRACK_RANGE), dur(1200));
      }
    } else {
      gps.from = gps.shown.slice(); gps.to = here; gps.t0 = now;
      gps.dur = Math.max(250, Math.min(1500, now - gps.last));
    }
    gps.last = now;
    gps.dotEl.classList.toggle("has-heading", gps.heading != null);
    // Re-route from the new position every ~12 m of walking.
    if (byId[lastPlace.id] && (!gps.routedAt || CampusRouter.dist(gps.routedAt, [here[1], here[0]]) > 12)) drawRoute();
    scene.requestRender();
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
    if (!gps.dotEl) return;
    const k = Math.min(1, (t - gps.t0) / gps.dur);
    gps.shown = [gps.from[0] + (gps.to[0] - gps.from[0]) * k, gps.from[1] + (gps.to[1] - gps.from[1]) * k];
    let more = k < 1;
    // Follow: keep the dot in focus at the current tilt and distance; turn slowly to the walking direction.
    if (gps.follow && t > gps.holdUntil && !flying && !down && t - lastWheel > 300) {
      const target = gpsPos();
      let h = deg(camera.heading);
      if (gps.heading != null) {
        const d = ((gps.heading - h + 540) % 360) - 180;
        if (Math.abs(d) > 0.3) { h += d * 0.08; more = true; }
      }
      view(target, hpr(h, deg(camera.pitch), rangeTo(target)), 0);
    }
    scene.requestRender();
    if (more) gps.raf = requestAnimationFrame(tick);
  }

  function makeMarkers() {
    gps.ringEl = document.createElement("div"); gps.ringEl.className = "user-gps-accuracy m3d-ring";
    gps.dotEl = document.createElement("div"); gps.dotEl.className = "user-gps-marker m3d-dot";
    gps.dotEl.innerHTML = '<span class="hdg"></span><span class="core"></span>';
    overlay.append(gps.ringEl, gps.dotEl);
  }
  // Lay the accuracy circle flat on the ground: the screen vectors for 1 m east and 1 m north
  // at the dot give a CSS matrix that maps the 100 px ring onto the tilted ground.
  function drawGps() {
    const [lng, lat] = gps.shown, h = groundH + 0.5, k = 10;
    const o = toScreen(gpsPos());
    const e = toScreen(at(lng + k / (111320 * Math.cos(rad(lat))), lat, h));
    const n = toScreen(at(lng, lat + k / 110574, h));
    if (!o || !e || !n) { gps.dotEl.style.visibility = gps.ringEl.style.visibility = "hidden"; return; }
    gps.dotEl.style.visibility = gps.ringEl.style.visibility = "";
    const ex = (e.x - o.x) / k, ey = (e.y - o.y) / k, nx = (n.x - o.x) / k, ny = (n.y - o.y) / k;
    const ppm = Math.sqrt(Math.hypot(ex, ey) * Math.hypot(nx, ny)) || 1;
    const d = 2 * gps.acc * ppm, s = (Math.min(2000, Math.max(16, d)) / d) * (2 * gps.acc) / 100;
    gps.ringEl.style.borderWidth = `${(1.5 / (s * ppm)).toFixed(2)}px`;
    gps.ringEl.style.transform = `matrix(${ex * s}, ${ey * s}, ${-nx * s}, ${-ny * s}, ${o.x}, ${o.y}) translate(-50px, -50px)`;
    let turn = "";
    if (gps.heading != null) {
      const hr = rad(gps.heading), dx = Math.sin(hr) * ex + Math.cos(hr) * nx, dy = Math.sin(hr) * ey + Math.cos(hr) * ny;
      turn = ` rotate(${deg(Math.atan2(dx, -dy)).toFixed(1)}deg)`;
    }
    gps.dotEl.style.transform = `translate3d(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px, 0) translate(-50%, -50%)${turn}`;
  }

  // --------------------------------------------------------- controls
  function syncPitchBtn() {
    if (!camera) return;
    want3D = deg(camera.pitch) > -75; // more than 15° of tilt
    const lbl = pitchBtn.querySelector(".lbl");
    if (lbl.textContent === (want3D ? "2D" : "3D")) return;
    lbl.textContent = want3D ? "2D" : "3D";
    pitchBtn.setAttribute("aria-label", want3D ? "Switch to flat 2D view" : "Switch to 3D view");
  }
  pitchBtn.addEventListener("click", () => {
    if (!active || !ready) return;
    want3D = deg(camera.pitch) <= -75;
    const f = focus();
    view(f.target, hpr(deg(camera.heading), tiltPitch(), f.range), dur(900));
  });
  resetBtn.addEventListener("click", () => {
    if (!active || !ready) return;
    setFollow(false);
    want3D = true;
    view(uomTarget(), hpr(UOM.heading, UOM.pitch, UOM.range), dur(1400));
  });

  // Live Track on, e.g. carried over when switching from the other 3D style.
  const track = () => { if (active && ready && gps.watch == null) startTracking(); };
  window.Map3DReal = { enter, exit, track, get active() { return active; }, get available() { return available; }, get viewer() { return viewer; } };
})();
