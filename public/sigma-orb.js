(function () {
  'use strict';

  const stage   = document.getElementById('sigmaStage');
  const canvas  = document.getElementById('sigmaCanvas');
  const hit     = document.getElementById('sigmaOrbHit');
  const caption = document.getElementById('sigmaCaption');
  const titleEl = document.getElementById('sigmaTitle');
  const subEl   = document.getElementById('sigmaSub');
  if (!stage || !canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  /* ------------------------------ utilidades ------------------------------ */
  const TAU   = Math.PI * 2;
  const rand  = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp  = (a, b, t) => a + (b - a) * t;
  const damp  = (a, b, k, dt) => lerp(a, b, 1 - Math.pow(k, dt)); // suavização independente do FPS
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MOTION = reduceMotion ? 0.3 : 1;

  /* --------------------- sprites de brilho pré-renderizados --------------------- */
  function makeSprite(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) grd.addColorStop(o, col);
    x.fillStyle = grd;
    x.fillRect(0, 0, size, size);
    return c;
  }
  const spSoft = makeSprite(128, [[0, 'rgba(200,225,255,1)'], [0.2, 'rgba(110,170,255,0.55)'], [0.55, 'rgba(60,130,255,0.14)'], [1, 'rgba(40,110,255,0)']]);
  const spHard = makeSprite(64,  [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(210,230,255,0.85)'], [0.55, 'rgba(110,170,255,0.25)'], [1, 'rgba(90,150,255,0)']]);
  const spCore = makeSprite(256, [[0, 'rgba(255,255,255,1)'], [0.07, 'rgba(240,248,255,0.95)'], [0.2, 'rgba(160,205,255,0.65)'], [0.45, 'rgba(70,140,255,0.2)'], [1, 'rgba(40,100,255,0)']]);

  let g = ctx; // contexto de desenho atual (muda entre camadas)
  function glow(sp, x, y, r, a) {
    if (a <= 0.002 || r <= 0) return;
    g.globalAlpha = a > 1 ? 1 : a;
    g.drawImage(sp, x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
  }
  function glowEl(sp, x, y, rx, ry, rot, a) {
    if (a <= 0.002) return;
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.globalAlpha = a > 1 ? 1 : a;
    g.drawImage(sp, -rx, -ry, rx * 2, ry * 2);
    g.restore();
  }

  /* ------------------------------- estado ------------------------------- */
  let W = 0, H = 0, DPR = 1, U = 1, NU = 1;        // U = escala do orbe, NU = escala da rede
  let cx = 0, cy = 0, R = 120, floorY = 0;         // centro/raio do orbe e linha do chão
  let bgLayer = null, sceneLayer = null, sctx = null, reflLayer = null, rctx = null;
  let quality = 1;

  const ptr  = { x: 0, y: 0, tx: 0, ty: 0, hover: 0, hoverT: 0 };
  const anim = { state: 'idle', energy: 0, level: 0, levelExt: 0, levelExtAt: -1e9 };
  const STATES = {
    idle:      { speed: 1.0, glow: 1.0,  rate: 1.0, spin: 1.0 },
    listening: { speed: 1.5, glow: 1.35, rate: 2.0, spin: 1.8 },
    thinking:  { speed: 2.1, glow: 1.2,  rate: 4.0, spin: 2.8 },
    speaking:  { speed: 1.4, glow: 1.5,  rate: 2.5, spin: 1.4 }
  };
  const cur = { speed: 1, glow: 1, rate: 1, spin: 1 };

  const net  = { nodes: [], links: [], adj: [], pulses: [], near: [] };
  const orb  = { rings: [], stars: [], starLinks: [], arms: [], shock: [] };
  const dust = [];
  const floorRipples = [];
  const tapHandlers = [];

  let t = 0, ts = 0, last = performance.now();
  let spawnAcc = 0, surgeAcc = 0, surgeNext = 2.5, rippleAcc = 0, perfAcc = 0, perfN = 0;
  const P = { x: 0, y: 0, z: 0, s: 1 };
  const Q = { x: 0, y: 0 };

  /* ------------------------------ fundo (estático) ------------------------------ */
  function buildBackground() {
    bgLayer = document.createElement('canvas');
    bgLayer.width = canvas.width; bgLayer.height = canvas.height;
    const b = bgLayer.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    b.fillStyle = '#02050f'; b.fillRect(0, 0, W, H);

    let grd = b.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(22,52,130,0.6)');
    grd.addColorStop(0.4, 'rgba(10,24,70,0.5)');
    grd.addColorStop(1, 'rgba(2,5,15,0)');
    b.fillStyle = grd; b.fillRect(0, 0, W, H);

    // chão refletivo
    grd = b.createLinearGradient(0, floorY - R * 0.3, 0, H);
    grd.addColorStop(0, 'rgba(12,32,95,0)');
    grd.addColorStop(0.12, 'rgba(12,32,95,0.42)');
    grd.addColorStop(0.5, 'rgba(6,16,50,0.3)');
    grd.addColorStop(1, 'rgba(2,5,15,0)');
    b.fillStyle = grd; b.fillRect(0, 0, W, H);

    // feixes verticais de luz
    b.globalCompositeOperation = 'lighter';
    const nb = Math.round(28 * clamp(W / 800, 0.6, 2));
    for (let i = 0; i < nb; i++) {
      const x = rand(0, W), w = rand(1, 3.5), h = rand(H * 0.2, H * 0.75), y = rand(-H * 0.1, floorY - h * 0.3);
      const lg = b.createLinearGradient(0, y, 0, y + h);
      const a = rand(0.03, 0.11).toFixed(3);
      lg.addColorStop(0, 'rgba(70,130,255,0)'); lg.addColorStop(0.5, 'rgba(70,130,255,' + a + ')'); lg.addColorStop(1, 'rgba(70,130,255,0)');
      b.fillStyle = lg; b.fillRect(x, y, w, h);
    }
    // bokeh estático
    for (let i = 0; i < 160; i++) {
      const x = rand(0, W), y = rand(0, H), r = Math.random() < 0.1 ? rand(2, 5) : rand(0.5, 1.4);
      b.fillStyle = 'rgba(140,180,255,' + rand(0.04, 0.28).toFixed(3) + ')';
      b.beginPath(); b.arc(x, y, r, 0, TAU); b.fill();
    }
    // vinheta
    b.globalCompositeOperation = 'source-over';
    grd = b.createRadialGradient(cx, H * 0.45, Math.min(W, H) * 0.35, cx, H * 0.45, Math.max(W, H) * 0.85);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.65)');
    b.fillStyle = grd; b.fillRect(0, 0, W, H);
  }

  /* ------------------------------ rede neural ------------------------------ */
  let netW = 0, netH = 0;
  function buildNetwork(force) {
    const minD = Math.min(W, H);
    const maxD = clamp(minD * 0.26, 110, 240);
    const rw = netW ? W / netW : 0, rh = netH ? H / netH : 0;
    if (!force && net.nodes.length && rw > 0.6 && rw < 1.6 && rh > 0.6 && rh < 1.6) {
      for (const n of net.nodes) { n.bx *= rw; n.by *= rh; } // só reescala (sem "pulo" visual)
      netW = W; netH = H; computeNear(); return;
    }
    netW = W; netH = H;
    const count = Math.round(clamp((W * H) / 9000, 55, 150) * quality);
    const nodes = [];
    for (let i = 0; i < count; i++) {
      let x, y, tries = 0;
      do { x = rand(-0.04, 1.04) * W; y = rand(-0.04, 1) * (floorY + R * 0.15); tries++; }
      while (tries < 12 && Math.hypot(x - cx, y - cy) < R * 0.95);
      nodes.push({ x, y, bx: x, by: y, ax: rand(5, 20) * NU, ay: rand(5, 20) * NU,
        fx: rand(0.12, 0.45), fy: rand(0.12, 0.45), px: rand(0, TAU), py: rand(0, TAU),
        depth: rand(0.35, 1), flash: 0, tw: rand(0.6, 1.8), twp: rand(0, TAU), r: 1, deg: 0 });
    }
    const links = [], adj = nodes.map(() => []);
    const seen = new Set();
    const key = (i, j) => (i < j ? i * 100000 + j : j * 100000 + i);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i], cand = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const d = Math.hypot(a.bx - nodes[j].bx, a.by - nodes[j].by);
        if (d < maxD) cand.push([d, j]);
      }
      cand.sort((p, q) => p[0] - q[0]);
      const k = Math.random() < 0.4 ? 3 : 2;
      for (let m = 0; m < Math.min(k, cand.length); m++) {
        const j = cand[m][1], kk = key(i, j);
        if (seen.has(kk)) continue;
        seen.add(kk);
        const d = cand[m][0];
        links.push({ a: i, b: j, len: d, curve: rand(-0.22, 0.22), alpha: 0.12 + 0.26 * (1 - d / maxD), w: rand(0.5, 1.1), phase: rand(0, TAU), cx: 0, cy: 0 });
      }
    }
    // arcos longos (as curvas grandes atrás do orbe)
    const nArcs = Math.round(7 * quality) + 1;
    for (let n = 0; n < nArcs; n++) {
      const i = Math.floor(Math.random() * nodes.length);
      for (let tries = 0; tries < 14; tries++) {
        const j = Math.floor(Math.random() * nodes.length);
        if (i === j) continue;
        const d = Math.hypot(nodes[i].bx - nodes[j].bx, nodes[i].by - nodes[j].by);
        if (d > minD * 0.3 && d < minD * 0.95 && !seen.has(key(i, j))) {
          seen.add(key(i, j));
          links.push({ a: i, b: j, len: d, curve: rand(0.25, 0.5) * (Math.random() < 0.5 ? 1 : -1), alpha: 0.1, w: 0.7, phase: rand(0, TAU), cx: 0, cy: 0 });
          break;
        }
      }
    }
    links.forEach((L, idx) => { adj[L.a].push(idx); adj[L.b].push(idx); });
    nodes.forEach((n, i) => { n.deg = adj[i].length; n.r = 0.8 + Math.min(n.deg, 5) * 0.32 + rand(0, 0.5); });
    net.nodes = nodes; net.links = links; net.adj = adj; net.pulses = [];
    computeNear();
  }
  function computeNear() {
    net.near = net.nodes.map((n, i) => [Math.hypot(n.bx - cx, n.by - cy), i])
      .sort((p, q) => p[0] - q[0]).slice(0, 18).map(p => p[1]);
  }
  function spawnPulse(nodeIdx, hops) {
    const a = net.adj[nodeIdx];
    if (!a || !a.length || net.pulses.length > 80) return;
    const L = net.links[a[Math.floor(Math.random() * a.length)]];
    net.pulses.push({ L, dir: L.a === nodeIdx ? 1 : -1, t: 0, v: rand(70, 130) * NU / Math.max(L.len, 60), hops, size: rand(0.8, 1.3) });
  }
  function emit(n) { // o orbe "dispara" sinais para a rede
    if (!net.near.length) return;
    for (let i = 0; i < n; i++) {
      const idx = net.near[Math.floor(Math.random() * net.near.length)];
      net.nodes[idx].flash = 1;
      spawnPulse(idx, 2 + Math.floor(Math.random() * 2));
    }
  }
  function bez(L, a, b, tt) {
    const m = 1 - tt;
    Q.x = m * m * a.x + 2 * m * tt * L.cx + tt * tt * b.x;
    Q.y = m * m * a.y + 2 * m * tt * L.cy + tt * tt * b.y;
  }

  function drawNetwork(dt) {
    const nodes = net.nodes, links = net.links;
    const ox = ptr.x * 22 * NU, oy = ptr.y * 14 * NU;
    const E = anim.energy;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x = n.bx + Math.sin(t * n.fx + n.px) * n.ax + ox * n.depth;
      n.y = n.by + Math.cos(t * n.fy + n.py) * n.ay + oy * n.depth;
      n.flash *= Math.pow(0.08, dt);
    }

    // conexões (curvas)
    g.lineCap = 'round';
    for (let i = 0; i < links.length; i++) {
      const L = links[i], a = nodes[L.a], b = nodes[L.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      L.cx = (a.x + b.x) / 2 - dy * L.curve;
      L.cy = (a.y + b.y) / 2 + dx * L.curve;
      const fl = Math.max(a.flash, b.flash);
      const al = (L.alpha * (0.8 + 0.2 * Math.sin(t * 0.9 + L.phase)) + fl * 0.45) * (1 + E * 0.4);
      g.strokeStyle = 'rgba(110,170,255,' + al.toFixed(3) + ')';
      g.lineWidth = L.w + fl * 0.9;
      g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(L.cx, L.cy, b.x, b.y); g.stroke();
    }

    // sinais viajando pelas conexões
    spawnAcc += dt * 2.2 * cur.rate;
    while (spawnAcc >= 1) { spawnAcc -= 1; spawnPulse(Math.floor(Math.random() * nodes.length), 1 + Math.floor(Math.random() * 3)); }
    for (let i = net.pulses.length - 1; i >= 0; i--) {
      const p = net.pulses[i];
      p.t += dt * p.v * cur.speed;
      if (p.t >= 1) {
        const end = p.dir === 1 ? p.L.b : p.L.a;
        nodes[end].flash = 1;                       // o nó "acende" ao receber o sinal
        net.pulses.splice(i, 1);
        if (p.hops > 0 && Math.random() < 0.75) spawnPulse(end, p.hops - 1); // propaga
        continue;
      }
      const a = nodes[p.L.a], b = nodes[p.L.b];
      const head = p.dir === 1 ? p.t : 1 - p.t;
      for (let k = 0; k < 6; k++) {                 // rastro
        const tk = clamp(head - p.dir * k * 0.03, 0, 1);
        bez(p.L, a, b, tk);
        const f = 1 - k / 6;
        glow(spHard, Q.x, Q.y, (1.2 + 2.2 * f) * p.size * NU, f * f);
      }
      bez(p.L, a, b, head);
      glow(spSoft, Q.x, Q.y, 12 * p.size * NU, 0.45);
    }

    // nós
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const tw = 0.65 + 0.35 * Math.sin(t * n.tw + n.twp);
      const f = n.flash;
      glow(spSoft, n.x, n.y, (n.r * 5 + f * 16) * NU, 0.22 + 0.2 * tw + f * 0.6);
      glow(spHard, n.x, n.y, (n.r * 1.5 + f * 1.5) * NU, 0.75 + 0.25 * tw);
    }
  }

  /* ------------------------------ orbe ------------------------------ */
  function buildOrb() {
    orb.rings = [];
    const nR = Math.max(4, Math.round(8 * quality));
    const seg = quality >= 1 ? 64 : 44;
    for (let i = 0; i < nR; i++) {
      const outer = i < Math.ceil(nR / 2);
      orb.rings.push({
        tilt: rand(0.25, 1.35) * (i % 2 ? 1 : -1),
        yaw: (i / nR) * Math.PI + rand(-0.3, 0.3),
        precess: rand(0.06, 0.2) * (Math.random() < 0.5 ? 1 : -1),
        rr: outer ? rand(0.96, 1.0) : rand(0.55, 0.88),
        seg, w: rand(0.5, 1.1) * clamp(U, 0.8, 1.6), a: outer ? 1 : 0.8,
        pts: new Float32Array((seg + 1) * 4),
        beads: Array.from({ length: outer ? 3 : 2 }, () => ({ u: rand(0, TAU), v: rand(0.3, 0.7) * (Math.random() < 0.5 ? 1 : -1) }))
      });
    }
    // constelação interna
    const SN = Math.round(130 * quality);
    orb.stars = [];
    for (let i = 0; i < SN; i++) {
      const th = rand(0, TAU), ph = Math.acos(rand(-1, 1));
      const r = 0.18 + 0.8 * Math.cbrt(Math.random());
      orb.stars.push({ x: r * Math.sin(ph) * Math.cos(th), y: r * Math.sin(ph) * Math.sin(th), z: r * Math.cos(ph),
        s: rand(0.6, 1.5), tw: rand(0, TAU), sx: 0, sy: 0, d: 0, ps: 1 });
    }
    orb.starLinks = [];
    for (let i = 0; i < SN; i++) {
      let c = 0;
      for (let j = i + 1; j < SN && c < 2; j++) {
        const a = orb.stars[i], b = orb.stars[j];
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        if (dx * dx + dy * dy + dz * dz < 0.34 * 0.34) { orb.starLinks.push([i, j]); c++; }
      }
    }
    // partículas da espiral
    orb.arms = [];
    const perArm = Math.round(34 * quality);
    for (let a = 0; a < 3; a++) for (let k = 0; k < perArm; k++)
      orb.arms.push({ arm: a, s: Math.random(), jr: rand(-0.06, 0.06), ja: rand(-0.14, 0.14), sz: rand(0.6, 1.4), sp: rand(0.05, 0.1) });
    orb.shock = [];
  }

  function drawOrb(dt) {
    const E = anim.energy, L = anim.level, hv = ptr.hover;
    const GL = cur.glow * (1 + E * 0.9 + hv * 0.3 + L * 0.5);
    const breath = 1 + 0.035 * Math.sin(ts * 1.25) + 0.02 * Math.sin(ts * 2.3 + 1.2) + 0.015 * Math.sin(ts * 0.6 + 2) + E * 0.08 + L * 0.08;
    const Rb = R * breath;

    // rotação global (gira sozinho + inclina com o mouse/toque)
    const gy = ts * 0.14 + ptr.x * 0.45, gx = 0.2 + ptr.y * 0.3;
    const cgy = Math.cos(gy), sgy = Math.sin(gy), cgx = Math.cos(gx), sgx = Math.sin(gx);
    const proj = (x, y, z) => {
      const x1 = x * cgy + z * sgy, z1 = -x * sgy + z * cgy;
      const y2 = y * cgx - z1 * sgx, z2 = y * sgx + z1 * cgx;
      const s = 1 / (1 - z2 * 0.2);
      P.x = cx + x1 * Rb * s; P.y = cy + y2 * Rb * s; P.z = z2; P.s = s;
    };

    // atmosfera
    glow(spSoft, cx, cy, Rb * 2.4, 0.28 * GL);
    glow(spSoft, cx, cy, Rb * 1.5, 0.3 * GL);

    // corpo da esfera (oclui a rede atrás)
    g.globalCompositeOperation = 'source-over';
    let grd = g.createRadialGradient(cx - Rb * 0.25, cy - Rb * 0.3, Rb * 0.1, cx, cy, Rb);
    grd.addColorStop(0, 'rgba(10,22,60,0.88)');
    grd.addColorStop(0.55, 'rgba(5,12,36,0.9)');
    grd.addColorStop(0.85, 'rgba(12,35,100,0.8)');
    grd.addColorStop(1, 'rgba(40,90,200,0.55)');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, Rb, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter';

    // constelação interna
    for (const s of orb.stars) { proj(s.x, s.y, s.z); s.sx = P.x; s.sy = P.y; s.d = (P.z + 1) * 0.5; s.ps = P.s; }
    g.lineWidth = 0.6;
    for (const [i, j] of orb.starLinks) {
      const a = orb.stars[i], b = orb.stars[j], d = (a.d + b.d) * 0.5;
      g.strokeStyle = 'rgba(130,180,255,' + (0.05 + 0.22 * d).toFixed(3) + ')';
      g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.stroke();
    }
    for (const s of orb.stars) {
      const tw = 0.7 + 0.3 * Math.sin(ts * 2 + s.tw);
      glow(spHard, s.sx, s.sy, (0.9 + 1.3 * s.d) * s.s * U * s.ps, (0.25 + 0.65 * s.d) * tw);
    }

    // espiral que flui para o núcleo
    const armTilt = 0.74 + 0.1 * Math.sin(ts * 0.3), armRot = 0.4 + 0.2 * Math.sin(ts * 0.21);
    const car = Math.cos(armRot), sar = Math.sin(armRot);
    const armPoint = (arm, s, jr, ja) => {
      const r = (0.95 * Math.pow(0.045, s) + jr) * Rb;
      const th = arm * TAU / 3 + s * TAU * 1.5 + ts * 0.38 + ja;
      const px = Math.cos(th) * r, py = Math.sin(th) * r * armTilt;
      P.x = cx + px * car - py * sar; P.y = cy + px * sar + py * car;
    };
    for (let arm = 0; arm < 3; arm++) {
      let prevx = 0, prevy = 0;
      const N = 44;
      for (let k = 0; k <= N; k++) {
        const s = (k / N) * 0.97;
        armPoint(arm, s, 0, 0);
        if (k > 0) {
          g.strokeStyle = 'rgba(140,190,255,' + ((0.04 + 0.3 * s) * GL).toFixed(3) + ')';
          g.lineWidth = (0.6 + 1.4 * s) * U;
          g.beginPath(); g.moveTo(prevx, prevy); g.lineTo(P.x, P.y); g.stroke();
        }
        prevx = P.x; prevy = P.y;
      }
    }
    for (const p of orb.arms) {
      p.s += dt * p.sp * cur.speed;
      if (p.s > 1) p.s -= 1;
      armPoint(p.arm, p.s, p.jr * (1 - p.s), p.ja);
      const fade = Math.min(1, p.s * 8) * (0.3 + 0.7 * p.s);
      glow(spHard, P.x, P.y, (0.8 + 1.2 * p.s) * p.sz * U, fade * 0.9);
    }

    // anéis 3D
    for (const rg of orb.rings) {
      const yaw = rg.yaw + ts * rg.precess;
      const ct = Math.cos(rg.tilt), st = Math.sin(rg.tilt), cyw = Math.cos(yaw), syw = Math.sin(yaw);
      const pts = rg.pts;
      for (let i = 0; i <= rg.seg; i++) {
        const u = (i / rg.seg) * TAU;
        const px = Math.cos(u) * rg.rr, py = Math.sin(u) * rg.rr;
        const y1 = py * ct, z1 = py * st;
        proj(px * cyw - y1 * syw, px * syw + y1 * cyw, z1);
        pts[i * 4] = P.x; pts[i * 4 + 1] = P.y; pts[i * 4 + 2] = P.z; pts[i * 4 + 3] = P.s;
      }
      for (let i = 0; i < rg.seg; i++) {
        const d = ((pts[i * 4 + 2] + pts[i * 4 + 6]) * 0.5 + 1) * 0.5; // 0 = atrás, 1 = frente
        const a = (0.08 + 0.5 * d * d) * rg.a * GL;
        g.strokeStyle = 'rgba(' + Math.round(110 + 110 * d) + ',' + Math.round(170 + 60 * d) + ',255,' + a.toFixed(3) + ')';
        g.lineWidth = rg.w * (0.4 + 0.9 * d);
        g.beginPath(); g.moveTo(pts[i * 4], pts[i * 4 + 1]); g.lineTo(pts[i * 4 + 4], pts[i * 4 + 5]); g.stroke();
        if (d > 0.6) { g.globalAlpha = (d - 0.6) * 0.3; g.lineWidth = rg.w * 4; g.stroke(); g.globalAlpha = 1; }
      }
      for (const b of rg.beads) {
        const u = b.u + ts * b.v;
        const px = Math.cos(u) * rg.rr, py = Math.sin(u) * rg.rr;
        const y1 = py * ct, z1 = py * st;
        proj(px * cyw - y1 * syw, px * syw + y1 * cyw, z1);
        const d = (P.z + 1) * 0.5;
        glow(spSoft, P.x, P.y, (6 + 6 * d) * P.s * U, (0.25 + 0.45 * d) * GL);
        glow(spHard, P.x, P.y, (1.4 + 1.6 * d) * P.s * U, 0.6 + 0.4 * d);
      }
    }

    // núcleo + flare
    glow(spCore, cx, cy, Rb * 0.95, 0.5 * GL);
    glow(spCore, cx, cy, Rb * 0.42, 0.85 * GL);
    glow(spHard, cx, cy, Rb * (0.1 + 0.04 * E + 0.05 * L), 1);
    glowEl(spHard, cx, cy, Rb * (1.0 + 0.3 * E), Rb * 0.04, 0, 0.5 * GL);
    glowEl(spHard, cx, cy, Rb * 0.05, Rb * 2.4, 0, 0.3 * GL);

    // borda luminosa (fresnel) + linha fina
    grd = g.createRadialGradient(cx, cy, Rb * 0.6, cx, cy, Rb * 1.12);
    grd.addColorStop(0, 'rgba(40,100,255,0)');
    grd.addColorStop(0.62, 'rgba(50,120,255,0.18)');
    grd.addColorStop(0.86, 'rgba(120,180,255,0.55)');
    grd.addColorStop(0.895, 'rgba(220,240,255,0.95)');
    grd.addColorStop(0.93, 'rgba(90,160,255,0.35)');
    grd.addColorStop(1, 'rgba(60,130,255,0)');
    g.fillStyle = grd; g.globalAlpha = clamp(0.75 * GL, 0, 1);
    g.beginPath(); g.arc(cx, cy, Rb * 1.12, 0, TAU); g.fill();
    g.globalAlpha = 1; g.lineWidth = 1.2; g.strokeStyle = 'rgba(200,225,255,0.7)';
    g.beginPath(); g.arc(cx, cy, Rb, 0, TAU); g.stroke();

    // reflexo especular
    glowEl(spSoft, cx - Rb * 0.42, cy - Rb * 0.46, Rb * 0.4, Rb * 0.18, -0.75, 0.55 * GL);

    // ondas de choque (toque)
    for (let i = orb.shock.length - 1; i >= 0; i--) {
      const s = orb.shock[i];
      s.p += dt * 0.9;
      if (s.p >= 1) { orb.shock.splice(i, 1); continue; }
      const rr = Rb * (1 + 2.2 * s.p), a = (1 - s.p) * (1 - s.p) * 0.8;
      g.lineWidth = 2 + 6 * (1 - s.p); g.strokeStyle = 'rgba(160,205,255,' + a.toFixed(3) + ')';
      g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
      g.globalAlpha = a * 0.35; g.lineWidth = 18 * (1 - s.p) + 4; g.stroke(); g.globalAlpha = 1;
    }
  }

  /* ------------------------------ chão ------------------------------ */
  function drawFloor(dt) {
    const GL = cur.glow * (1 + anim.energy * 0.8);
    const k = 0.22; // achatamento das elipses (perspectiva)

    glowEl(spSoft, cx, floorY, W * 0.6, R * 0.12, 0, 0.22 * GL);                        // linha do horizonte
    glowEl(spSoft, cx, floorY, R * 1.6, R * 1.6 * k, 0, 0.45 * GL);                      // poça de luz
    glowEl(spHard, cx, floorY, R * 0.5, R * 0.5 * k * 0.6, 0, 0.8 * GL);                 // ponto de contato
    glowEl(spHard, cx, (cy + R * 0.5 + floorY) / 2, R * 0.07, (floorY - cy) * 0.55, 0, 0.5 * GL); // feixe

    const rings = [0.3, 0.52, 0.78, 1.08, 1.42];
    for (let i = 0; i < rings.length; i++) {
      const rr = R * rings[i];
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.4 - i * 1.1);
      g.beginPath(); g.ellipse(cx, floorY, rr, rr * k, 0, 0, TAU);
      if (i === 1 || i === 3) { g.setLineDash([rr * 0.14, rr * 0.07]); g.lineDashOffset = (i === 1 ? -1 : 1) * t * rr * 0.35; }
      g.lineWidth = i % 2 ? 0.8 : 1.5;
      g.strokeStyle = 'rgba(120,180,255,' + ((0.1 + 0.28 * pulse) * GL).toFixed(3) + ')';
      g.stroke();
      if (i % 2 === 0) { g.globalAlpha = 0.12 * GL; g.lineWidth = 5; g.stroke(); g.globalAlpha = 1; }
      g.setLineDash([]);
    }
    // ondulações que se expandem
    rippleAcc += dt;
    if (rippleAcc > 2.4 / cur.speed) { rippleAcc = 0; floorRipples.push({ p: 0, v: 0.4, a: 0.5 }); }
    for (let i = floorRipples.length - 1; i >= 0; i--) {
      const rp = floorRipples[i];
      rp.p += dt * rp.v;
      if (rp.p >= 1) { floorRipples.splice(i, 1); continue; }
      const rr = R * (0.15 + 1.6 * rp.p), a = (1 - rp.p) * (1 - rp.p) * rp.a;
      g.beginPath(); g.ellipse(cx, floorY, rr, rr * k, 0, 0, TAU);
      g.lineWidth = 1.5 + 2 * (1 - rp.p); g.strokeStyle = 'rgba(170,210,255,' + a.toFixed(3) + ')'; g.stroke();
    }
    // pontos orbitando nos anéis
    for (let i = 0; i < 4; i++) {
      const ang = t * 0.5 * (i % 2 ? 1 : -1) + i * TAU / 4;
      const rr = R * (i < 2 ? 0.78 : 1.42);
      const x = cx + Math.cos(ang) * rr, y = floorY + Math.sin(ang) * rr * k;
      glow(spHard, x, y, 2.5 * U, 0.9); glow(spSoft, x, y, 10 * U, 0.4);
    }
  }

  /* ------------------------------ poeira flutuante ------------------------------ */
  function buildDust() {
    dust.length = 0;
    const n = Math.round(clamp((W * H) / 16000, 30, 90) * quality);
    for (let i = 0; i < n; i++) {
      const big = Math.random() < 0.15;
      dust.push({ x: rand(0, W), y: rand(0, H), big, r: big ? rand(4, 10) : rand(0.8, 2.2),
        vy: rand(-9, -2), vx: rand(-3, 3), a: rand(0.1, 0.5), tw: rand(0, TAU), tsp: rand(0.5, 2) });
    }
  }
  function drawDust(dt) {
    for (const p of dust) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < -20) { p.y = H + 20; p.x = rand(0, W); }
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      const tw = 0.5 + 0.5 * Math.sin(t * p.tsp + p.tw);
      glow(p.big ? spSoft : spHard, p.x + ptr.x * 10, p.y + ptr.y * 6, p.r * (p.big ? 1 : 2.2), p.a * tw * (p.big ? 0.5 : 1));
    }
  }

  /* ------------------------------ interações ------------------------------ */
  function burst(strength) {
    anim.energy = Math.min(1.5, anim.energy + strength);
    orb.shock.push({ p: 0 });
    floorRipples.push({ p: 0, v: 0.7, a: 0.9 });
    emit(Math.round(6 + 8 * strength));
  }
  let swapTimer = 0;
  function swapText(title, sub) {
    if (!caption) return;
    caption.classList.add('is-swapping');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      if (title != null && titleEl) titleEl.textContent = title;
      if (sub != null && subEl) subEl.textContent = sub;
      caption.classList.remove('is-swapping');
    }, 240);
  }

  /* ------------------------------ layout ------------------------------ */
  function layoutDOM() {
    const r = R * 1.12;
    hit.style.left = (cx - r) + 'px'; hit.style.top = (cy - r) + 'px';
    hit.style.width = hit.style.height = (r * 2) + 'px';
    if (caption) caption.style.top = (floorY + R * 0.42) + 'px';
  }
  function resize(force) {
    const rect = stage.getBoundingClientRect();
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(480, Math.round(rect.height));
    DPR = clamp(Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3.2e6 / (W * H))), 1, 2);

    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    sceneLayer = document.createElement('canvas');
    sceneLayer.width = canvas.width; sceneLayer.height = canvas.height;
    sctx = sceneLayer.getContext('2d'); sctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    reflLayer = document.createElement('canvas');                 // versão reduzida = reflexo desfocado barato
    reflLayer.width = Math.max(1, Math.round(W / 4)); reflLayer.height = Math.max(1, Math.round(H / 4));
    rctx = reflLayer.getContext('2d');

    R = Math.min(W * 0.27, H * 0.2);
    cx = W / 2; cy = H * 0.4; floorY = cy + R * 1.3;
    U = R / 150; NU = clamp(Math.min(W, H) / 640, 0.75, 1.3);

    buildBackground(); buildNetwork(force); buildOrb(); buildDust(); layoutDOM();
  }

  /* ------------------------------ loop ------------------------------ */
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt <= 0) return;
    if (dt > 0.1) dt = 0.1;

    // qualidade adaptativa (reduz detalhes se o aparelho estiver sofrendo)
    perfAcc += dt; perfN++;
    if (perfN >= 150) {
      const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
      if (avg > 0.028 && quality > 0.5) { quality -= 0.25; buildNetwork(true); buildOrb(); buildDust(); }
    }

    dt *= MOTION;
    const tg = STATES[anim.state] || STATES.idle;
    cur.speed = damp(cur.speed, tg.speed, 0.05, dt);
    cur.glow  = damp(cur.glow,  tg.glow,  0.05, dt);
    cur.rate  = damp(cur.rate,  tg.rate,  0.05, dt);
    cur.spin  = damp(cur.spin,  tg.spin,  0.05, dt);
    t += dt; ts += dt * cur.speed * (0.6 + 0.4 * cur.spin);

    ptr.x = damp(ptr.x, ptr.tx, 0.02, dt);
    ptr.y = damp(ptr.y, ptr.ty, 0.02, dt);
    ptr.hover = damp(ptr.hover, ptr.hoverT, 0.01, dt);
    anim.energy *= Math.pow(0.1, dt);

    // nível de "voz"
    let lt = 0;
    if (anim.state === 'speaking') {
      lt = (now - anim.levelExtAt < 400) ? anim.levelExt
         : 0.25 + 0.75 * Math.abs(Math.sin(t * 6.3) * Math.sin(t * 2.7) * Math.sin(t * 1.1 + 1));
    } else if (anim.state === 'listening') lt = 0.15 + 0.1 * Math.sin(t * 4);
    anim.level = damp(anim.level, lt, 0.001, dt);

    // surtos aleatórios: o orbe pulsa e envia sinais para a rede
    surgeAcc += dt;
    if (surgeAcc > surgeNext) {
      surgeAcc = 0; surgeNext = rand(2.5, 6) / cur.rate;
      anim.energy = Math.min(1, anim.energy + 0.22);
      emit(2 + Math.floor(Math.random() * 3));
      floorRipples.push({ p: 0, v: 0.5, a: 0.45 });
    }

    // 1) camada da cena (rede + orbe), transparente
    g = sctx;
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, W, H);
    sctx.globalCompositeOperation = 'lighter';
    drawNetwork(dt);
    drawOrb(dt);
    sctx.globalCompositeOperation = 'source-over';

    // 2) reflexo reduzido
    rctx.clearRect(0, 0, reflLayer.width, reflLayer.height);
    rctx.drawImage(sceneLayer, 0, 0, reflLayer.width, reflLayer.height);

    // 3) composição final
    g = ctx;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(bgLayer, 0, 0, W, H);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, floorY, W, H - floorY); ctx.clip();
    ctx.translate(0, floorY); ctx.scale(1, -0.45); ctx.translate(0, -floorY);
    ctx.globalAlpha = 0.28; ctx.drawImage(reflLayer, 0, 0, W, H);
    ctx.globalAlpha = 0.14; ctx.drawImage(reflLayer, 0, 6, W, H);
    ctx.restore();
    const fg = ctx.createLinearGradient(0, floorY, 0, floorY + R * 1.2);
    fg.addColorStop(0, 'rgba(2,5,15,0)'); fg.addColorStop(1, 'rgba(2,5,15,0.92)');
    ctx.fillStyle = fg; ctx.fillRect(0, floorY, W, H - floorY);

    ctx.globalCompositeOperation = 'lighter';
    drawFloor(dt);
    drawDust(dt);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(sceneLayer, 0, 0, W, H);
  }

  /* ------------------------------ eventos ------------------------------ */
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    ptr.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
    ptr.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
  }, { passive: true });
  stage.addEventListener('pointerleave', () => { ptr.tx = 0; ptr.ty = 0; });
  window.addEventListener('deviceorientation', (e) => {             // parallax por giroscópio (quando disponível)
    if (typeof e.gamma !== 'number' || typeof e.beta !== 'number') return;
    ptr.tx = clamp(e.gamma / 35, -1, 1); ptr.ty = clamp((e.beta - 45) / 35, -1, 1);
  }, { passive: true });
  hit.addEventListener('pointerenter', () => { ptr.hoverT = 1; });
  hit.addEventListener('pointerleave', () => { ptr.hoverT = 0; });
  hit.addEventListener('click', () => {
    burst(1);
    for (const fn of tapHandlers) { try { fn(); } catch (err) { console.error(err); } }
    stage.dispatchEvent(new CustomEvent('sigma:tap', { bubbles: true }));
  });

  let resizeTimer = 0, firstRO = true;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => resize(false), 120); };
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (firstRO) { firstRO = false; return; } onResize(); }).observe(stage);
  else window.addEventListener('resize', onResize);

  /* ------------------------------ API pública ------------------------------ */
  window.SigmaOrb = {
    setState(name, text) {
      if (!STATES[name]) return;
      anim.state = name;
      if (text) swapText(text.title, text.sub);
    },
    getState() { return anim.state; },
    pulse(strength) { burst(strength == null ? 1 : clamp(strength, 0.1, 1.5)); },
    setLevel(v) { anim.levelExt = clamp(+v || 0, 0, 1); anim.levelExtAt = performance.now(); }, // volume da voz (0..1)
    setText(title, sub) { swapText(title, sub); },
    onTap(fn) { tapHandlers.push(fn); return () => { const i = tapHandlers.indexOf(fn); if (i >= 0) tapHandlers.splice(i, 1); }; },
    get element() { return stage; }
  };

  resize(true);
  requestAnimationFrame(frame);
  setTimeout(() => burst(0.7), 700); // "despertar" inicial
})();

;
(function(){
  'use strict';
  var states={
    idle:{title:'Toque no orbe para iniciar',sub:'Estou à disposição'},
    listening:{title:'Estou ouvindo…',sub:'Pode falar'},
    thinking:{title:'Processando…',sub:'Só um instante'},
    speaking:{title:'SIGMA está falando',sub:'Sistema ativo'}
  };
  SigmaOrb.onTap(function(){window.parent.postMessage({type:'sigma:tap'},window.location.origin)});
  window.addEventListener('message',function(e){
    if(e.origin!==window.location.origin||!e.data||e.data.type!=='sigma:set-state')return;
    var state=e.data.state;
    if(states[state])SigmaOrb.setState(state,states[state]);
    if(e.data.pulse)SigmaOrb.pulse(1);
  });
  window.parent.postMessage({type:'sigma:ready'},window.location.origin);
})();
