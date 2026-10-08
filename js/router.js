// Walking router over the campus road network in campus-data.js.
// Builds a graph from the road polylines, snaps start/end onto the nearest
// road, runs Dijkstra and turns the result into plain-language steps.
(function () {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const LAT0 = rad(6.7965);

  // Local flat projection (metres) — fine for a campus-sized area.
  const xy = ([lat, lng]) => [R * rad(lng) * Math.cos(LAT0), R * rad(lat)];
  const dist = (a, b) => { const [ax, ay] = xy(a), [bx, by] = xy(b); return Math.hypot(ax - bx, ay - by); };
  const bearing = (a, b) => { const [ax, ay] = xy(a), [bx, by] = xy(b); return (Math.atan2(bx - ax, by - ay) * 180) / Math.PI; };

  const nodes = [];          // [lat, lng]
  const adj = [];            // [[to, metres], ...]
  const index = new Map();   // "lat,lng" -> node id
  const edges = [];          // [a, b]

  function nodeId(p) {
    const k = p[0].toFixed(6) + "," + p[1].toFixed(6);
    if (!index.has(k)) { index.set(k, nodes.length); nodes.push(p); adj.push([]); }
    return index.get(k);
  }
  function link(a, b, w) { adj[a].push([b, w]); adj[b].push([a, w]); }

  for (const road of window.CAMPUS_DATA.roads) {
    for (let i = 1; i < road.length; i++) {
      const a = nodeId(road[i - 1]), b = nodeId(road[i]);
      if (a === b) continue;
      link(a, b, dist(nodes[a], nodes[b]));
      edges.push([a, b]);
    }
  }

  // Closest point on any road segment to p.
  function snap(p) {
    const P = xy(p);
    let best = null;
    for (const [a, b] of edges) {
      const A = xy(nodes[a]), B = xy(nodes[b]);
      const dx = B[0] - A[0], dy = B[1] - A[1];
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(A[0] + t * dx - P[0], A[1] + t * dy - P[1]);
      if (!best || d < best.d) {
        const la = nodes[a], lb = nodes[b];
        best = { a, b, t, d, at: [la[0] + t * (lb[0] - la[0]), la[1] + t * (lb[1] - la[1])] };
      }
    }
    return best;
  }

  function dijkstra(extra, src, dst, n) {
    const d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    d[src] = 0;
    const nbrs = (u) => (u < adj.length ? adj[u] : []).concat(extra.get(u) || []);
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
      if (u < 0 || u === dst) break;
      done[u] = 1;
      for (const [v, w] of nbrs(u)) if (d[u] + w < d[v]) { d[v] = d[u] + w; prev[v] = u; }
    }
    if (d[dst] === Infinity) return null;
    const out = [];
    for (let u = dst; u >= 0; u = prev[u]) out.push(u);
    return out.reverse();
  }

  // Returns { path: [[lat,lng]...], metres, steps: [{icon,text,sub}] }
  function route(from, to, opts = {}) {
    const s = snap(from), e = snap(to);
    if (!s || !e) return null;
    const S = nodes.length, E = nodes.length + 1;
    const pts = (i) => (i === S ? s.at : i === E ? e.at : nodes[i]);
    const extra = new Map();
    const add = (u, v, w) => {
      if (!extra.has(u)) extra.set(u, []);
      if (!extra.has(v)) extra.set(v, []);
      extra.get(u).push([v, w]); extra.get(v).push([u, w]);
    };
    for (const [snapNode, sn] of [[S, s], [E, e]]) {
      add(snapNode, sn.a, dist(sn.at, nodes[sn.a]));
      add(snapNode, sn.b, dist(sn.at, nodes[sn.b]));
    }
    // Both ends on the same road segment: walk straight along it.
    if ((s.a === e.a && s.b === e.b) || (s.a === e.b && s.b === e.a)) add(S, E, dist(s.at, e.at));

    const ids = dijkstra(extra, S, E, nodes.length + 2);
    if (!ids) return null;
    let path = ids.map(pts);
    if (s.d > 3) path.unshift(from);
    if (e.d > 3) path.push(to);
    path = path.filter((p, i) => i === 0 || dist(p, path[i - 1]) > 0.5);

    let metres = 0;
    for (let i = 1; i < path.length; i++) metres += dist(path[i - 1], path[i]);
    return { path, metres, steps: describe(path, to, opts) };
  }

  const CARDINAL = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  const cardinal = (b) => CARDINAL[Math.round((((b % 360) + 360) % 360) / 45) % 8];
  const turnDelta = (b1, b2) => { let d = b2 - b1; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  const roundM = (m) => (m < 20 ? Math.max(5, Math.round(m / 5) * 5) : Math.round(m / 10) * 10);

  function describe(path, target, { landmarks = [], destName = "your destination", startName } = {}) {
    // Merge straight-ish pieces into legs.
    const legs = [];
    for (let i = 1; i < path.length; i++) {
      const b = bearing(path[i - 1], path[i]), m = dist(path[i - 1], path[i]);
      const last = legs[legs.length - 1];
      if (last && Math.abs(turnDelta(last.endBearing, b)) < 28) {
        last.m += m; last.endBearing = b; last.end = path[i];
      } else {
        legs.push({ startBearing: b, endBearing: b, m, start: path[i - 1], end: path[i] });
      }
    }
    // Fold tiny wiggles (< 8 m) into the neighbouring leg.
    for (let i = legs.length - 1; i > 0; i--) {
      if (legs[i].m < 8) { legs[i - 1].m += legs[i].m; legs[i - 1].end = legs[i].end; legs.splice(i, 1); }
    }
    // A short stub from the start point onto the road isn't worth its own step.
    if (legs.length > 1 && legs[0].m < 15) { legs[1].m += legs[0].m; legs[1].start = legs[0].start; legs.shift(); }

    const near = (p) => {
      let best = null;
      for (const l of landmarks) { const d = dist(p, l.at); if (d < 40 && (!best || d < best.d)) best = { name: l.name, d }; }
      return best ? ` near ${best.name}` : "";
    };

    const steps = [];
    legs.forEach((leg, i) => {
      if (i === 0) {
        steps.push({ icon: "⬆️", text: `${startName ? `From ${startName}, head` : "Head"} ${cardinal(leg.startBearing)}`, sub: `about ${roundM(leg.m)} m` });
        return;
      }
      const d = turnDelta(legs[i - 1].endBearing, leg.startBearing);
      const a = Math.abs(d), side = d > 0 ? "right" : "left";
      const icon = a > 150 ? "↩️" : d > 0 ? (a < 55 ? "↗️" : "➡️") : (a < 55 ? "↖️" : "⬅️");
      const verb = a > 150 ? "Turn around" : a < 55 ? `Keep ${side}` : `Turn ${side}`;
      steps.push({ icon, text: `${verb}${near(leg.start)}`, sub: `then walk about ${roundM(leg.m)} m` });
    });

    // Which side is the destination on, relative to the last walking direction?
    const lastLeg = legs[legs.length - 1];
    let where = "ahead of you";
    if (lastLeg) {
      const d = turnDelta(lastLeg.endBearing, bearing(lastLeg.end, target));
      if (dist(lastLeg.end, target) > 6) where = Math.abs(d) < 35 ? "straight ahead" : d > 0 ? "on your right" : "on your left";
    }
    steps.push({ icon: "📍", text: `${destName} is ${where}`, sub: "" });
    return steps;
  }

  window.CampusRouter = { route, dist, snap };
})();
