// Visual effects: welcome intro, particle field, confetti, toasts, count-up
// numbers, 3D tilt and ripples. No dependencies.
(function () {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
  };

  // ---------------------------------------------------------------- toast
  let toastBox = null;
  function toast(msg, icon = "💡", ms = 4200) {
    if (!toastBox) { toastBox = document.createElement("div"); toastBox.className = "toasts"; toastBox.setAttribute("role", "status"); document.body.appendChild(toastBox); }
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span class="ti"></span><span></span>`;
    t.children[0].textContent = icon; t.children[1].textContent = msg;
    toastBox.appendChild(t);
    const kill = () => { t.classList.add("out"); setTimeout(() => t.remove(), 350); };
    t.onclick = kill;
    setTimeout(kill, ms);
  }

  // ------------------------------------------------------------- confetti
  function confetti(x = innerWidth / 2, y = innerHeight / 2, n = 140) {
    if (reduced) return;
    const c = document.createElement("canvas");
    c.className = "fx-canvas";
    const dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    document.body.appendChild(c);
    const g = c.getContext("2d"); g.scale(dpr, dpr);
    const colors = ["#7c3aed", "#d946ef", "#f59e0b", "#fde68a", "#60a5fa", "#34d399", "#f472b6"];
    const parts = Array.from({ length: n }, () => {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9;
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: Math.random() * 6.28, vr: (Math.random() - .5) * .4,
        w: 6 + Math.random() * 6, h: 3 + Math.random() * 5, c: colors[(Math.random() * colors.length) | 0], round: Math.random() < .3 };
    });
    const t0 = performance.now();
    (function frame(t) {
      const life = (t - t0) / 2600;
      g.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += .28; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.globalAlpha = Math.max(0, 1 - life); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
        if (p.round) { g.beginPath(); g.arc(0, 0, p.h, 0, 6.28); g.fill(); } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      if (life < 1) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // ------------------------------------------------------ count-up numbers
  function countUp(root = document) {
    root.querySelectorAll("[data-count]").forEach((el) => {
      const to = +el.dataset.count, t0 = performance.now(), dur = reduced ? 0 : 1000;
      (function f(t) {
        const k = dur ? Math.min(1, (t - t0) / dur) : 1;
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(f);
      })(t0);
    });
  }

  // ------------------------------------------------------ ripple + tilt
  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".btn, .tile, .chip, .fab, .cta, .list li button");
    if (!el || reduced) return;
    const r = el.getBoundingClientRect(), s = Math.max(r.width, r.height);
    const d = document.createElement("span");
    d.className = "ripple";
    d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    el.appendChild(d);
    setTimeout(() => d.remove(), 650);
  });
  if (!reduced && matchMedia("(hover: hover)").matches) {
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest(".tile");
      document.querySelectorAll(".tile[data-tilt]").forEach((t) => { if (t !== el) { t.style.transform = ""; delete t.dataset.tilt; } });
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.dataset.tilt = 1;
      el.style.transform = `perspective(500px) rotateX(${-y * 10}deg) rotateY(${x * 12}deg) translateY(-2px)`;
    });
  }

  // ---------------------------------------- typewriter search placeholder
  function typePlaceholder(input, words) {
    if (reduced) return;
    let wi = 0, ci = 0, del = false;
    const base = "Search ";
    (function tick() {
      if (document.activeElement !== input && !input.value) {
        const w = words[wi];
        ci += del ? -1 : 1;
        input.placeholder = base + w.slice(0, ci) + (ci % 2 ? "|" : "");
        if (!del && ci >= w.length) { del = true; return setTimeout(tick, 1400); }
        if (del && ci <= 0) { del = false; wi = (wi + 1) % words.length; }
      }
      setTimeout(tick, del ? 35 : 75);
    })();
  }

  // --------------------------------------------------- particle field
  function particles(canvas) {
    if (reduced) return () => {};
    const g = canvas.getContext("2d");
    let w, h, raf, mouse = { x: -999, y: -999 };
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const resize = () => { w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); addEventListener("resize", resize);
    const n = Math.min(80, Math.round((w * h) / 14000));
    const pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, r: Math.random() * 1.8 + .6 }));
    canvas.parentElement.addEventListener("pointermove", (e) => { mouse = { x: e.clientX, y: e.clientY }; });
    (function frame() {
      g.clearRect(0, 0, w, h);
      for (const p of pts) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < 120) { p.x += dx / d * 1.2; p.y += dy / d * 1.2; }
        p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.28); g.fillStyle = "rgba(255,255,255,.75)"; g.fill();
      }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 110) { g.strokeStyle = `rgba(196,181,253,${(1 - d / 110) * .35})`; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
      }
      raf = requestAnimationFrame(frame);
    })();
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }

  // ---------------------------------------------------------- intro
  // Shown once per browser session (and again from the "26" button).
  function intro({ where = "", force = false } = {}) {
    const el = document.getElementById("intro");
    if (!el) return Promise.resolve(false);
    if (!force && store.get("introSeen")) { el.hidden = true; return Promise.resolve(false); }
    el.hidden = false; el.classList.remove("out");
    document.documentElement.style.setProperty("--ui-delay", "0s");
    el.querySelector(".intro-where").textContent = where;
    // Restart CSS animations when re-opened.
    el.querySelectorAll("*").forEach((n) => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
    const stop = particles(el.querySelector("canvas"));
    const go = el.querySelector("#intro-go");
    go.focus({ preventScroll: true });
    return new Promise((resolve) => {
      const done = (celebrate) => {
        store.set("introSeen", "1");
        if (celebrate) { const r = go.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2, 180); }
        el.classList.add("out");
        document.documentElement.style.setProperty("--ui-delay", ".35s");
        // Re-run the UI entrance animations behind the fading intro.
        document.querySelectorAll(".top, .sheet, .map-buttons, .chip").forEach((n) => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
        setTimeout(() => { el.hidden = true; stop(); }, 850);
        resolve(true);
      };
      go.onclick = () => done(true);
      el.querySelector("#intro-skip").onclick = () => done(false);
      el.onkeydown = (e) => { if (e.key === "Escape") done(false); };
    });
  }

  window.FX = { toast, confetti, countUp, typePlaceholder, intro, reduced };
})();
