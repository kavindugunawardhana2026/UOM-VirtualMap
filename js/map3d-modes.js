// 3D map switcher. The cube button opens / closes the 3D map; the Real | Minimal toggle
// in the 3D bar flips between its two styles:
//   real    — Google Photorealistic 3D Tiles (js/map3d.js, window.Map3DReal)
//   minimal — white & green model with taller campus buildings (js/map3d-minimal.js)
// Both styles share the 3D bar buttons; each ignores them while it isn't the one showing.
// The chosen style is remembered, and Live Track carries over when switching.
(function () {
  const $ = (s) => document.querySelector(s);
  const btn = $("#btn-3d"), seg = $("#m3d-style"), trackBtn = $("#m3d-track");
  const engines = { real: window.Map3DReal, minimal: window.Map3DMinimal };
  if (!btn || !engines.minimal) return;
  const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const realOK = () => !!engines.real && engines.real.available;

  let style = get("map3dStyle") === "minimal" || !realOK() ? "minimal" : "real";
  let on = false, busy = false;

  function syncUI() {
    document.body.classList.toggle("mode-3d", on);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.querySelector(".tip").textContent = on ? "2D map" : "3D map";
    if (!seg) return;
    seg.hidden = !realOK(); // no Google key (or it was refused): Minimal only
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.style === style));
  }

  async function open(s) {
    if (busy) return false;
    busy = true; btn.classList.add("busy");
    const ok = await engines[s].enter();
    busy = false; btn.classList.remove("busy");
    if (ok) { style = s; on = true; set("mapMode", "3d"); set("map3dStyle", s); }
    syncUI();
    return ok;
  }
  function close() {
    engines[style].exit();
    on = false; set("mapMode", "2d");
    syncUI();
  }
  btn.onclick = () => (on ? close() : open(realOK() ? style : "minimal"));

  async function switchTo(s) {
    if (busy || s === style) return;
    if (!on) { style = s; set("map3dStyle", s); syncUI(); return; }
    const was = style, tracking = trackBtn && trackBtn.dataset.state !== "off";
    engines[was].exit();
    on = false;
    if (!(await open(s)) && !(await open(was))) return;
    if (tracking) engines[style].track();
  }
  if (seg) seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-style]");
    if (b) switchTo(b.dataset.style);
  });
  // Google refused the key or the Map Tiles API is off: carry on in the Minimal style.
  addEventListener("map3d:real-failed", () => { if (on && style === "real") switchTo("minimal"); else syncUI(); });

  syncUI();
  // Start in 3D when it was the last choice (or ?view=3d).
  const want = new URLSearchParams(location.search).get("view");
  if (want === "3d" || (want !== "2d" && get("mapMode") === "3d")) setTimeout(() => open(realOK() ? style : "minimal"), 400);
})();
