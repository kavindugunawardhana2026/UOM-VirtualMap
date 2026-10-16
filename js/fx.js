// Visual effects: welcome intro, starfield, scrambled-text reveals, confetti,
// toasts, count-up numbers, 3D tilt and ripples. No dependencies.
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
    const colors = ["#eef4ff", "#9cc0ff", "#4f8cff", "#3a7bff", "#1f5fe0", "#7dd3fc", "#ff7aa8"];
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

  // ------------------------------------------------------------- theme
  // "light" or "dark" on <html data-theme> (first set by the script in
  // index.html). A saved choice wins; with none, follow the phone's setting.
  // Any [data-theme-toggle] button flips it. Fires "themechange" on window.
  const lightQuery = matchMedia("(prefers-color-scheme: light)");
  const savedTheme = () => { try { return localStorage.getItem("theme"); } catch (_) { return null; } };
  const theme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let fadeTimer = 0;
  function setTheme(t, { save = false, animate = true } = {}) {
    const root = document.documentElement;
    if (save) try { localStorage.setItem("theme", t); } catch (_) {}
    if (animate && !reduced) {
      root.classList.add("theme-anim");
      clearTimeout(fadeTimer); fadeTimer = setTimeout(() => root.classList.remove("theme-anim"), 600);
    }
    root.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#f3f6fc" : "#040814");
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(t === "light")));
    dispatchEvent(new CustomEvent("themechange", { detail: t }));
  }
  const toggleTheme = () => setTheme(theme() === "light" ? "dark" : "light", { save: true });
  lightQuery.addEventListener?.("change", (e) => { if (!savedTheme()) setTheme(e.matches ? "light" : "dark"); });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-theme-toggle]")) toggleTheme(); });
  setTheme(theme(), { animate: false });

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

  // ------------------------------------------------------- scramble text
  // Letters start as random glyphs and settle into the real text, left to
  // right. Runs on every [data-scramble] inside `root` (or `root` itself).
  // Only Latin letters and digits are scrambled; emoji and Sinhala/Tamil
  // stay as they are. The same text is not re-scrambled within a few seconds,
  // so frequent re-renders (GPS updates, typing) don't keep flickering.
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const recent = new Map();
  const originals = new WeakMap(); // text node -> its real text, so overlapping runs never lock in glyphs
  let runs = 0;
  function scramble(root = document, { delay = 0, duration = 900 } = {}) {
    if (reduced) return;
    const els = root.matches?.("[data-scramble]") ? [root] : [...root.querySelectorAll("[data-scramble]")];
    els.forEach((el, k) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!originals.has(n)) originals.set(n, n.nodeValue);
        nodes.push({ n, text: originals.get(n) });
      }
      const key = nodes.map((x) => x.text).join("");
      if (performance.now() - (recent.get(key) ?? -1e9) < 6000) return;
      recent.set(key, performance.now());
      const id = el.dataset.scrambleRun = String(++runs);
      const finish = () => { if (el.dataset.scrambleRun === id) for (const x of nodes) x.n.nodeValue = x.text; };
      const total = key.length || 1;
      const t0 = performance.now() + delay + k * 120;
      let last = 0;
      (function frame(t) {
        if (!el.isConnected || el.dataset.scrambleRun !== id) return;
        const p = Math.max(0, (t - t0) / duration);
        if (p >= 1) return finish();
        if (t - last > 45) {
          last = t;
          let i = 0;
          for (const x of nodes) {
            let out = "";
            for (const ch of x.text) {
              const settled = i / total < p * 1.15 - 0.15;
              out += settled || !/[A-Za-z0-9]/.test(ch) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
              i += ch.length;
            }
            x.n.nodeValue = out;
          }
        }
        requestAnimationFrame(frame);
      })(performance.now());
      // Backstop in case animation frames are paused (background tab).
      setTimeout(finish, delay + k * 120 + duration + 1500);
    });
  }

  // ------------------------------------------------------- starfield
  // Three depth layers of twinkling stars that drift and lean away from the
  // pointer, plus the odd shooting star.
  function starfield(canvas) {
    if (reduced) return () => {};
    const g = canvas.getContext("2d");
    let w, h, raf, stars = [], mx = 0, my = 0, ox = 0, oy = 0, shoot = null;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(520, Math.round((w * h) / 2600));
      stars = Array.from({ length: n }, () => {
        const z = Math.random();
        return { x: Math.random() * w, y: Math.random() * h, z, r: .25 + z * z * 1.4, a: .25 + Math.random() * .75,
          tw: Math.random() * 6.28, ts: .5 + Math.random() * 2, hue: Math.random() < .18 ? 218 : Math.random() < .1 ? 200 : 0 };
      });
    };
    resize(); addEventListener("resize", resize);
    const onMove = (e) => { mx = e.clientX / w - .5; my = e.clientY / h - .5; };
    canvas.parentElement.addEventListener("pointermove", onMove);
    (function frame(t) {
      t = t || 0;
      ox += (mx - ox) * .04; oy += (my - oy) * .04;
      g.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.y -= .02 + s.z * .08; if (s.y < -2) { s.y = h + 2; s.x = Math.random() * w; }
        const x = s.x - ox * 40 * s.z, y = s.y - oy * 40 * s.z;
        const a = s.a * (.55 + .45 * Math.sin(s.tw + t / 1000 * s.ts));
        g.fillStyle = s.hue ? `hsla(${s.hue},100%,85%,${a})` : `rgba(238,244,255,${a})`;
        g.beginPath(); g.arc(x, y, s.r, 0, 6.28); g.fill();
        if (s.r > 1.3) { g.fillStyle = `rgba(150,185,255,${a * .12})`; g.beginPath(); g.arc(x, y, s.r * 4, 0, 6.28); g.fill(); }
      }
      if (!shoot && Math.random() < .004) shoot = { x: Math.random() * w * .8 + w * .2, y: Math.random() * h * .4, life: 0 };
      if (shoot) {
        shoot.life += .02;
        const len = 140, x = shoot.x - shoot.life * 420, y = shoot.y + shoot.life * 180;
        const grd = g.createLinearGradient(x, y, x + len, y - len * .43);
        grd.addColorStop(0, `rgba(238,244,255,${.9 * (1 - shoot.life)})`); grd.addColorStop(1, "rgba(79,140,255,0)");
        g.strokeStyle = grd; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y - len * .43); g.stroke();
        if (shoot.life >= 1) shoot = null;
      }
      raf = requestAnimationFrame(frame);
    })();
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); canvas.parentElement.removeEventListener("pointermove", onMove); };
  }

  // ---------------------------------------------------------- landing
  // Scroll effects for the landing page: sections fade/blur in and decode
  // their headings, the hero photo drifts slower than the page, the orb
  // changes shape for each numbered step, plus a progress bar and nav tint.
  function landing(el) {
    if (el.dataset.ready) return;
    el.dataset.ready = "1";
    const reveal = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        scramble(e.target, { delay: 150 });
        countUp(e.target);
        reveal.unobserve(e.target);
      }
    }, { root: el, rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    el.querySelectorAll(".reveal").forEach((n) => reveal.observe(n));

    const orb = el.querySelector(".l-orb");
    const steps = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && orb) orb.dataset.step = e.target.dataset.step;
    }, { root: el, rootMargin: "-45% 0px -45% 0px" });
    el.querySelectorAll(".l-step").forEach((n) => steps.observe(n));

    const photo = el.querySelector(".l-hero-photo"), inner = el.querySelector(".l-hero .intro-inner");
    const card = el.querySelector(".l-about-card"), bar = el.querySelector(".l-progress");
    let ticking = false;
    const update = () => {
      ticking = false;
      const st = el.scrollTop, h = el.clientHeight;
      bar.style.setProperty("--p", Math.min(1, st / Math.max(1, el.scrollHeight - h)));
      el.classList.toggle("scrolled", st > 40);
      if (reduced) return;
      if (st < h * 1.2) {
        photo.style.transform = `translate3d(0, ${st * 0.38}px, 0) scale(${1 + st / h * 0.12})`;
        inner.style.transform = `translate3d(0, ${st * 0.18}px, 0)`;
        inner.style.opacity = Math.max(0, 1 - st / (h * 0.65));
      }
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--py", `${((r.top + r.height / 2) - h / 2) * -0.08}px`);
      }
    };
    el.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    // In-page links scroll the landing, not the window, and leave the URL alone.
    el.querySelectorAll('a[href^="#"]').forEach((a) => (a.onclick = (e) => {
      e.preventDefault();
      el.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    }));
    update();
  }

  // ---------------------------------------------------------- intro
  // Shown once per browser session (and again from the "26" button).
  // Resolves true when closed from the page; buttons with data-place also
  // fire a "landing:go" event so the map can open that place.
  function intro({ where = "", force = false } = {}) {
    const el = document.getElementById("intro");
    if (!el) return Promise.resolve(false);
    if (!force && store.get("introSeen")) { el.hidden = true; return Promise.resolve(false); }
    el.hidden = false; el.classList.remove("out");
    el.style.scrollBehavior = "auto"; el.scrollTop = 0; el.style.scrollBehavior = "";
    document.documentElement.style.setProperty("--ui-delay", "0s");
    el.querySelector(".intro-where").textContent = where;
    // Restart the hero's CSS animations when re-opened.
    el.querySelectorAll(".l-hero *, .intro-nav").forEach((n) => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
    const stop = starfield(el.querySelector("canvas"));
    landing(el);
    recent.clear();
    el.querySelectorAll(".l-hero [data-scramble]").forEach((n, i) => scramble(n, { delay: 700 + i * 260, duration: 1100 }));
    const go = el.querySelector("#intro-go");
    go.focus({ preventScroll: true });
    return new Promise((resolve) => {
      const done = (from, place) => {
        store.set("introSeen", "1");
        if (from) { const r = from.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2, 180); }
        if (place) dispatchEvent(new CustomEvent("landing:go", { detail: place }));
        el.classList.add("out");
        document.documentElement.style.setProperty("--ui-delay", ".35s");
        // Re-run the UI entrance animations behind the fading intro.
        document.querySelectorAll(".top, .sheet, .map-buttons, .chip").forEach((n) => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
        // The home card was drawn behind the intro; decode its headline now that it's visible.
        recent.clear(); scramble(document.getElementById("sheet") || document, { delay: 450 });
        setTimeout(() => { el.hidden = true; stop(); }, 850);
        resolve(true);
      };
      el.onclick = (e) => {
        const b = e.target.closest("#intro-go, [data-enter], [data-place], #intro-skip");
        if (!b) return;
        if (b.dataset.place) done(null, b.dataset.place);
        else done(b.id === "intro-skip" ? null : b);
      };
      el.onkeydown = (e) => { if (e.key === "Escape") done(null); };
    });
  }

  window.FX = { toast, confetti, countUp, typePlaceholder, intro, scramble, theme, setTheme, toggleTheme, reduced };
})();
