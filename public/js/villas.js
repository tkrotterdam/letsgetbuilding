// Detailed Valriche villas. Plantation-style villas get a hipped shingle roof, shutters, a veranda
// with Creole lambrequin trim; contemporary villas get slab roofs, full-height glazing, stone and
// timber screens. Each plot gets a garden and, where it fits, an illustrative pool terrace.
(function () {
'use strict';
const VR = window.VR = window.VR || {};

// ---------------------------------------------------------------- procedural textures
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function noise(g, w, h, a) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * a; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
const TEX = {};
function makeTextures() {
  if (TEX.render) return TEX;
  // lime render: warm white with soft mottling; 1 tile = 3 m
  TEX.render = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2ede2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${200 + rnd() * 30},${190 + rnd() * 30},${170 + rnd() * 30},0.06)`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 10 + rnd() * 40, 0, 7); g.fill(); }
    noise(g, w, h, 10);
  }, [1 / 3, 1 / 3]);
  // slate-grey shingles, staggered rows; 1 tile = 1.2 m
  TEX.shingle = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4b5258'; g.fillRect(0, 0, w, h);
    const rows = 8, cols = 6;
    for (let r = 0; r < rows; r++) for (let c = 0; c <= cols; c++) {
      const x = (c + (r % 2) * 0.5) * w / cols, y = r * h / rows, v = 70 + rnd() * 26;
      g.fillStyle = `rgb(${v},${v + 6},${v + 12})`; g.fillRect(x + 1, y + 1, w / cols - 2, h / rows - 2);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + h / rows - 3, w / cols, 3);
    }
    noise(g, w, h, 12);
  }, [1 / 1.2, 1 / 1.2]);
  // basalt stone, random coursed blocks; 1 tile = 2 m
  TEX.stone = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5c5a56'; g.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const rh = 18 + rnd() * 22; let x = -rnd() * 30;
      while (x < w) { const rw = 30 + rnd() * 50, v = 110 + rnd() * 60; g.fillStyle = `rgb(${v},${v - 6},${v - 14})`; g.fillRect(x + 2, y + 2, rw - 4, rh - 4); x += rw; }
      y += rh;
    }
    noise(g, w, h, 18);
  }, [1 / 2, 1 / 2]);
  // timber boards; 1 tile = 1.5 m
  TEX.wood = canvasTex(256, 256, (g, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const v = 120 + rnd() * 40; g.fillStyle = `rgb(${v + 40},${v},${v - 40})`; g.fillRect(0, i * h / n, w, h / n);
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(80,50,25,${0.1 + rnd() * 0.15})`; g.beginPath(); const yy = i * h / n + rnd() * h / n; g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + (rnd() - 0.5) * 6, w * 0.7, yy + (rnd() - 0.5) * 6, w, yy); g.stroke(); }
      g.fillStyle = 'rgba(40,25,10,0.5)'; g.fillRect(0, (i + 1) * h / n - 2, w, 2);
    }
  }, [1 / 1.5, 1 / 1.5]);
  // lawn with mowing stripes; 1 tile = 6 m
  TEX.lawn = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#4d7a33'; g.fillRect(0, 0, w, h); g.fillStyle = '#56853a'; g.fillRect(0, 0, w / 2, h);
    noise(g, w, h, 22);
  }, [1 / 6, 1 / 6]);
  // lambrequin: Creole scalloped fretwork with drops, white on transparent; 1 tile = 0.6 m wide
  TEX.lamb = canvasTex(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, w, 14);
    g.beginPath(); g.moveTo(0, 14); g.quadraticCurveTo(w / 2, 52, w, 14); g.lineTo(w, 14); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (const x of [w * 0.25, w * 0.5, w * 0.75]) { g.beginPath(); g.arc(x, 20, 5, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    g.beginPath(); g.arc(w / 2, 50, 5, 0, 7); g.fill();
  }, [1 / 0.6, 1]);
  return TEX;
}
function skyEnv() {
  const face = (top, bottom) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, top); grd.addColorStop(1, bottom); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return c; };
  const side = face('#7fb3e0', '#cfe3d4');
  const t = new THREE.CubeTexture([side, side, face('#6aa4dc', '#6aa4dc'), face('#4e6b3c', '#4e6b3c'), side, side]);
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- geometry accumulator with UVs
function Acc() { this.pos = []; this.uv = []; this.col = []; this.tri = []; this.ids = []; }
Acc.prototype.start = function (id) { this.tri.push(this.pos.length / 9); this.ids.push(id); };
Acc.prototype.t = function (c, a, b, d, ua, ub, ud) {
  this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]);
  this.uv.push(...(ua || [0, 0]), ...(ub || [0, 0]), ...(ud || [0, 0]));
  for (let i = 0; i < 3; i++) this.col.push(c.r, c.g, c.b);
};
Acc.prototype.q = function (c, a, b, d, e, ua, ub, ud, ue) { this.t(c, a, b, d, ua, ub, ud); this.t(c, a, d, e, ua, ud, ue); };
Acc.prototype.wall = function (c, ax, az, bx, bz, y0, y1, u0 = 0) {
  const L = Math.hypot(bx - ax, bz - az);
  this.q(c, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [u0, y0], [u0 + L, y0], [u0 + L, y1], [u0, y1]);
};
// oriented box with UVs in metres on every face
Acc.prototype.box = function (c, x, y, z, ux, uz, hu, hv, hw) {
  const wx = -uz, wz = ux;
  const P = (su, sv, sw) => [x + ux * hu * su + wx * hw * sw, y + hv * sv, z + uz * hu * su + wz * hw * sw];
  const U = 2 * hu, V = 2 * hv, W = 2 * hw;
  this.q(c, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), [0, 0], [U, 0], [U, V], [0, V]);
  this.q(c, P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), [0, 0], [U, 0], [U, V], [0, V]);
  this.q(c, P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), [0, 0], [W, 0], [W, V], [0, V]);
  this.q(c, P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), [0, 0], [W, 0], [W, V], [0, V]);
  this.q(c, P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), [0, 0], [U, 0], [U, W], [0, W]);
  this.q(c, P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), [0, 0], [U, 0], [U, W], [0, W]);
};
// rounded shrub: a squashed low-poly sphere
const BLOB = new THREE.IcosahedronGeometry(1, 1).toNonIndexed().attributes.position.array;
Acc.prototype.blob = function (c, x, y, z, r, sy) {
  for (let i = 0; i < BLOB.length; i += 9) {
    const P = k => [x + BLOB[i + k] * r, y + BLOB[i + k + 1] * r * sy, z + BLOB[i + k + 2] * r];
    this.t(c, P(0), P(3), P(6));
  }
};
Acc.prototype.mesh = function (mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
};
VR.AccFactory = Acc;

const C = s => new THREE.Color(s);
const WHITE = C('#ffffff'), FRAME = C('#fbfaf6'), DARKFRAME = C('#3a3d40'), SAGE = C('#6f8f86'), TEAL = C('#3f6f74');
const CUSHION = [C('#f2efe6'), C('#0d6c73'), C('#e9d8b4'), C('#c86a4a')];
const BOUG = [C('#c2185b'), C('#e0569a'), C('#f08a3c'), C('#d63a8c'), C('#f4f0f2')];
const HEDGE = C('#2b5226'), LEAF = C('#3a6629');

function ring(b) { return b.r || b.p; }
function ptsOf(b) { const p = ring(b), out = []; for (let k = 0; k < p.length; k += 2) out.push([p[k], p[k + 1]]); return out; }
function edgeInfo(pts, k, cx, cz) {
  const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length];
  const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
  let nx = uz, nz = -ux;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
  return { ax, az, bx, bz, L, ux, uz, nx, nz, mx, mz };
}

VR.buildVillas = function (S, opts) {
  const H = opts.H, B = S.buildings;
  seed = 5;
  const T = makeTextures();
  const A = {
    wall: new Acc(), roof: new Acc(), stone: new Acc(), wood: new Acc(), trim: new Acc(),
    glass: new Acc(), lamb: new Acc(), lawn: new Acc(), plant: new Acc(),
  };
  const Wt = new Acc();
  const startAll = id => { for (const k in A) A[k].start(id); };
  const handled = new Set(), colliders = [];

  function openings(e, y0, floors, style, poolSide) {
    const n = Math.floor((e.L - 1.2) / 3.0);
    if (n < 1) return;
    const step = e.L / (n + 1);
    for (let s = 0; s < floors; s++) {
      const fy = y0 + 0.6 + s * 3.2;
      for (let i = 1; i <= n; i++) {
        const t = i * step, x = e.ax + e.ux * t + e.nx * 0.06, z = e.az + e.uz * t + e.nz * 0.06;
        const door = s === 0 && poolSide;
        const hw = door ? 0.9 : 0.6, hh = door ? 1.2 : 0.8, cy = door ? fy + 1.2 : fy + 1.55;
        A.trim.box(FRAME, x, cy, z, e.ux, e.uz, hw + 0.09, hh + 0.09, 0.05);
        A.glass.box(WHITE, x + e.nx * 0.04, cy, z + e.nz * 0.04, e.ux, e.uz, hw, hh, 0.035);
        A.trim.box(FRAME, x + e.nx * 0.09, cy, z + e.nz * 0.09, e.ux, e.uz, 0.03, hh, 0.02);   // glazing bar
        if (!door) A.trim.box(FRAME, x + e.nx * 0.12, cy - hh - 0.08, z + e.nz * 0.12, e.ux, e.uz, hw + 0.15, 0.05, 0.1);   // sill
        if (style === 'plantation' && !door) {
          for (const sd of [-1, 1]) {
            const sx = x + e.ux * sd * (hw + 0.36) + e.nx * 0.03, sz = z + e.uz * sd * (hw + 0.36) + e.nz * 0.03;
            A.trim.box(SAGE, sx, cy, sz, e.ux, e.uz, 0.32, hh + 0.05, 0.035);
            for (let k = -3; k <= 3; k++) A.trim.box(TEAL, sx + e.nx * 0.04, cy + k * hh / 4, sz + e.nz * 0.04, e.ux, e.uz, 0.28, 0.015, 0.01);   // louvres
          }
        }
      }
    }
  }
  function hipRoof(rect, y, over) {
    let P = [0, 1, 2, 3].map(k => new THREE.Vector2(rect[k * 2], rect[k * 2 + 1]));
    const cen = P.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(0.25);
    P = P.map(p => { const d = p.clone().sub(cen); return cen.clone().add(d.multiplyScalar(1 + over / d.length())); });
    if (P[1].distanceTo(P[0]) < P[2].distanceTo(P[1])) P = [P[1], P[2], P[3], P[0]];
    const L = P[1].distanceTo(P[0]), W = P[2].distanceTo(P[1]);
    const dir = P[1].clone().sub(P[0]).normalize(), inset = Math.min(W / 2, L / 2 - 0.01);
    const m0 = P[0].clone().add(P[3]).multiplyScalar(0.5).addScaledVector(dir, inset);
    const m1 = P[1].clone().add(P[2]).multiplyScalar(0.5).addScaledVector(dir, -inset);
    const rise = Math.min(4.2, W * 0.34), rh = y + rise, slope = Math.hypot(W / 2, rise);
    const V = (v, h) => [v.x, h, v.y];
    const face = (a, b, top0, top1) => {
      const eu = b.clone().sub(a), Le = eu.length(); eu.normalize();
      const u = p => (p.clone().sub(a)).dot(eu);
      const tri = (p, ph, q, qh, r, rh2, up, vp, uq, vq, ur, vr) => { A.roof.t(WHITE, V(p, ph), V(q, qh), V(r, rh2), [up, vp], [uq, vq], [ur, vr]); A.roof.t(WHITE, V(p, ph), V(r, rh2), V(q, qh), [up, vp], [ur, vr], [uq, vq]); };
      if (top1) { tri(a, y, b, y, top1, rh, 0, 0, Le, 0, u(top1), slope); tri(a, y, top1, rh, top0, rh, 0, 0, u(top1), slope, u(top0), slope); }
      else tri(a, y, b, y, top0, rh, 0, 0, Le, 0, u(top0), slope);
    };
    face(P[0], P[1], m0, m1); face(P[2], P[3], m1, m0); face(P[1], P[2], m1); face(P[3], P[0], m0);
    const rd = m1.clone().sub(m0), rl = rd.length();
    if (rl > 0.2) { rd.normalize(); A.trim.box(C('#3b4146'), (m0.x + m1.x) / 2, rh + 0.06, (m0.y + m1.y) / 2, rd.x, rd.y, rl / 2, 0.08, 0.14); }
    for (let i = 0; i < 4; i++) {
      const a = P[i], b = P[(i + 1) % 4], Lf = a.distanceTo(b), u0 = b.clone().sub(a).normalize();
      A.trim.q(FRAME, [a.x, y - 0.28, a.y], [b.x, y - 0.28, b.y], [b.x, y, b.y], [a.x, y, a.y]);
      const nx = u0.y, nz = -u0.x, o = 0.02;
      A.lamb.q(WHITE, [a.x + nx * o, y - 0.28, a.y + nz * o], [b.x + nx * o, y - 0.28, b.y + nz * o], [b.x + nx * o, y - 0.62, b.y + nz * o], [a.x + nx * o, y - 0.62, a.y + nz * o], [0, 1], [Lf, 1], [Lf, 0], [0, 0]);
    }
  }
  function flatRoof(pts, y, grow) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const r = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cz), 0) / pts.length || 1;
    const k = 1 + grow / r;
    const P = pts.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * k, cz + (z - cz) * k));
    const tris = THREE.ShapeUtils.triangulateShape(P, []);
    const top = y + 0.42;
    for (const [a, b, d] of tris) {
      A.trim.t(FRAME, [P[a].x, top, P[a].y], [P[b].x, top, P[b].y], [P[d].x, top, P[d].y]);
      A.wood.t(WHITE, [P[a].x, y, P[a].y], [P[d].x, y, P[d].y], [P[b].x, y, P[b].y], [P[a].x, P[a].y], [P[d].x, P[d].y], [P[b].x, P[b].y]);   // timber soffit
    }
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A.trim.q(FRAME, [a.x, y, a.y], [b.x, y, b.y], [b.x, top, b.y], [a.x, top, a.y]); }
  }
  function veranda(e, y0, yTop) {
    const depth = 3.0, len = Math.min(e.L - 0.6, 14), c0 = (e.L - len) / 2;
    const at = (t, d) => [e.ax + e.ux * (c0 + t) + e.nx * d, e.az + e.uz * (c0 + t) + e.nz * d];
    const y1 = Math.min(yTop - 0.3, y0 + 3.3), y2 = y1 - 0.5;
    const p0 = at(0, 0), p1 = at(len, 0), p2 = at(len, depth), p3 = at(0, depth);
    A.roof.q(WHITE, [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [p2[0], y2, p2[1]], [p3[0], y2, p3[1]], [0, 3], [len, 3], [len, 0], [0, 0]);
    A.wood.q(WHITE, [p0[0], y1 - 0.08, p0[1]], [p3[0], y2 - 0.08, p3[1]], [p2[0], y2 - 0.08, p2[1]], [p1[0], y1 - 0.08, p1[1]], [0, 0], [0, 3], [len, 3], [len, 0]);
    const d0 = at(len / 2, depth / 2);
    A.wood.box(WHITE, d0[0], y0 + 0.5, d0[1], e.ux, e.uz, len / 2, 0.12, depth / 2);
    A.stone.box(WHITE, d0[0], y0 - 0.4, d0[1], e.ux, e.uz, len / 2 - 0.05, 0.8, depth / 2 - 0.05);
    const nc = Math.max(2, Math.round(len / 2.6) + 1);
    for (let i = 0; i < nc; i++) {
      const [cx, cz] = at(0.2 + (len - 0.4) * i / (nc - 1), depth - 0.25);
      A.trim.box(FRAME, cx, (y0 + 0.62 + y2) / 2, cz, e.ux, e.uz, 0.11, (y2 - y0 - 0.62) / 2, 0.11);
      A.trim.box(FRAME, cx, y0 + 0.75, cz, e.ux, e.uz, 0.16, 0.1, 0.16);
    }
    const f0 = at(0, depth - 0.25), f1 = at(len, depth - 0.25);
    A.trim.box(FRAME, (f0[0] + f1[0]) / 2, y0 + 1.55, (f0[1] + f1[1]) / 2, e.ux, e.uz, len / 2, 0.04, 0.05);
    for (let t = 0.3; t < len; t += 0.25) { const [bx, bz] = at(t, depth - 0.25); A.trim.box(FRAME, bx, y0 + 1.08, bz, e.ux, e.uz, 0.025, 0.45, 0.025); }
    const g0 = at(0, depth + 0.02), g1 = at(len, depth + 0.02);
    A.lamb.q(WHITE, [g0[0], y2, g0[1]], [g1[0], y2, g1[1]], [g1[0], y2 - 0.36, g1[1]], [g0[0], y2 - 0.36, g0[1]], [0, 1], [len, 1], [len, 0], [0, 0]);
  }
  function timberScreen(e, y0, y1) {
    const len = Math.min(4, e.L * 0.5), c0 = (e.L - len) / 2;
    for (let t = 0; t <= len; t += 0.24) {
      const x = e.ax + e.ux * (c0 + t) + e.nx * 0.25, z = e.az + e.uz * (c0 + t) + e.nz * 0.25;
      A.wood.box(WHITE, x, (y0 + y1) / 2, z, e.ux, e.uz, 0.04, (y1 - y0) / 2, 0.07);
    }
  }
  function bush(x, z, r, color) {
    const y = H(x, z);
    for (let k = 0; k < 3; k++) {
      const ox = (rnd() - 0.5) * r, oz = (rnd() - 0.5) * r, rr = r * (0.55 + rnd() * 0.35);
      A.plant.blob(k === 0 ? LEAF : color, x + ox, y + rr * 0.7, z + oz, rr, 0.8);
    }
  }
  function terrainQuad(acc, c, cx, cz, ux, uz, hu, hw, lift, step) {
    const wx = -uz, wz = ux, nu = Math.max(1, Math.ceil(2 * hu / step)), nw = Math.max(1, Math.ceil(2 * hw / step));
    const P = (i, j) => { const a = -hu + 2 * hu * i / nu, b = -hw + 2 * hw * j / nw; const x = cx + ux * a + wx * b, z = cz + uz * a + wz * b; return [[x, H(x, z) + lift, z], [x, z]]; };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++) {
      const [a, ua] = P(i, j), [b, ub] = P(i + 1, j), [d, ud] = P(i + 1, j + 1), [e, ue] = P(i, j + 1);
      acc.q(c, a, e, d, b, ua, ue, ud, ub);
    }
  }
  function poolTerrace(v, y) {
    const [cx, cz, ang, pl, pw] = v.pool;
    const ux = Math.cos(ang), uz = Math.sin(ang), wx = -uz, wz = ux;
    const nx = v.n[0], nz = v.n[1];
    const back = 3.4, dcx = cx - nx * back / 2, dcz = cz - nz * back / 2;
    const hu = pl / 2 + 1.8, hw = pw / 2 + 1.8 + back / 2;
    A.wood.box(WHITE, dcx, y - 0.04, dcz, ux, uz, hu, 0.08, hw);
    A.stone.box(WHITE, dcx, y - 2.2, dcz, ux, uz, hu - 0.05, 2.12, hw - 0.05);
    const cy = y + 0.14, cop = C('#e8e1d1');
    A.trim.box(cop, cx + wx * (pw / 2 + 0.2), cy, cz + wz * (pw / 2 + 0.2), ux, uz, pl / 2 + 0.4, 0.05, 0.2);
    A.trim.box(cop, cx - wx * (pw / 2 + 0.2), cy, cz - wz * (pw / 2 + 0.2), ux, uz, pl / 2 + 0.4, 0.05, 0.2);
    A.trim.box(cop, cx + ux * (pl / 2 + 0.2), cy, cz + uz * (pl / 2 + 0.2), ux, uz, 0.2, 0.05, pw / 2);
    A.trim.box(cop, cx - ux * (pl / 2 + 0.2), cy, cz - uz * (pl / 2 + 0.2), ux, uz, 0.2, 0.05, pw / 2);
    const Pw = (a, b) => [cx + ux * a + wx * b, y + 0.135, cz + uz * a + wz * b];
    Wt.q(WHITE, Pw(-pl / 2, -pw / 2), Pw(-pl / 2, pw / 2), Pw(pl / 2, pw / 2), Pw(pl / 2, -pw / 2));
    // the whole terrace blocks the cart (no driving into anyone's pool)
    const C2 = (a, b) => [dcx + ux * a + wx * b, dcz + uz * a + wz * b];
    colliders.push([...C2(-hu, -hw), ...C2(hu, -hw), ...C2(hu, hw), ...C2(-hu, hw)]);
    const side = (wx * nx + wz * nz) > 0 ? 1 : -1;
    const lx = cx + wx * side * (pw / 2 + 1.2), lz = cz + wz * side * (pw / 2 + 1.2);
    const cush = CUSHION[Math.floor(rnd() * CUSHION.length)];
    for (const o of [-1.1, 1.1]) {
      const x = lx + ux * o, z = lz + uz * o;
      A.wood.box(WHITE, x, y + 0.22, z, wx, wz, 0.95, 0.06, 0.34);
      A.trim.box(cush, x, y + 0.33, z, wx, wz, 0.9, 0.06, 0.32);
      A.trim.box(cush, x + wx * side * 0.72, y + 0.6, z + wz * side * 0.72, wx, wz, 0.2, 0.3, 0.32);
    }
    A.wood.box(WHITE, lx, y + 1.25, lz, ux, uz, 0.04, 1.15, 0.04);
    const top = [lx, y + 2.55, lz];
    for (let i = 0; i < 8; i++) {
      const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2, r = 1.45;
      A.trim.t(C('#efe6d3'), top, [lx + Math.cos(a1) * r, y + 2.1, lz + Math.sin(a1) * r], [lx + Math.cos(a0) * r, y + 2.1, lz + Math.sin(a0) * r]);
      A.trim.t(C('#efe6d3'), top, [lx + Math.cos(a0) * r, y + 2.1, lz + Math.sin(a0) * r], [lx + Math.cos(a1) * r, y + 2.1, lz + Math.sin(a1) * r]);
    }
    const px = cx - nx * (pw / 2 + 1.9), pz = cz - nz * (pw / 2 + 1.9);
    for (let t = -2; t <= 2; t += 0.45) A.wood.box(WHITE, px + ux * t, y + 2.78, pz + uz * t, nx, nz, 1.35, 0.06, 0.05);
    for (const t of [-2.1, 2.1]) {
      A.wood.box(WHITE, px + ux * t, y + 2.66, pz + uz * t, nx, nz, 1.4, 0.08, 0.08);
      A.wood.box(WHITE, px + ux * t + nx * 1.25, y + 1.35, pz + uz * t + nz * 1.25, ux, uz, 0.08, 1.35, 0.08);
    }
    for (const [su, sw] of [[-1, 1], [1, 1]]) {
      const x = dcx + ux * su * (hu - 0.4) + wx * sw * (hw - 0.4), z = dcz + uz * su * (hu - 0.4) + wz * sw * (hw - 0.4);
      A.stone.box(WHITE, x, y + 0.3, z, ux, uz, 0.3, 0.3, 0.3);
      A.plant.blob(BOUG[Math.floor(rnd() * BOUG.length)], x, y + 0.95, z, 0.5, 0.8);
    }
  }

  for (const v of S.villas) {
    const main = B[v.m];
    startAll(v.m);   // garden and driveway pick as the main house
    // garden: lawn rectangle around the main house, hedges on the sides away from the view, bougainvillea
    const mp = ptsOf(main);
    let L0 = 0, best = 0;
    for (let k = 0; k < mp.length; k++) { const e = edgeInfo(mp, k, main.cx, main.cz); if (e.L > L0) { L0 = e.L; best = k; } }
    const me = edgeInfo(mp, best, main.cx, main.cz);
    let hu = 0, hw = 0;
    for (const [x, z] of mp) { hu = Math.max(hu, Math.abs((x - main.cx) * me.ux + (z - main.cz) * me.uz)); hw = Math.max(hw, Math.abs((x - main.cx) * -me.uz + (z - main.cz) * me.ux)); }
    terrainQuad(A.lawn, WHITE, main.cx, main.cz, me.ux, me.uz, hu + 7, hw + 7, 0.07, 3);
    for (const s of [-1, 1]) {
      if (v.n && (-me.uz * s * v.n[0] + me.ux * s * v.n[1]) > 0.5) continue;   // keep the view side open
      const hx = main.cx + -me.uz * s * (hw + 7), hz = main.cz + me.ux * s * (hw + 7);
      for (let t = -(hu + 6); t <= hu + 6; t += 2) { const x = hx + me.ux * t, z = hz + me.uz * t; A.plant.box(HEDGE, x, H(x, z) + 0.6, z, me.ux, me.uz, 1.05, 0.62, 0.55); }
    }
    for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2, along = Math.cos(a) * (hu + 1.8), across = Math.sin(a) * (hw + 1.8);
      bush(main.cx + me.ux * along - me.uz * across, main.cz + me.uz * along + me.ux * across, 0.9 + rnd() * 0.5, BOUG[Math.floor(rnd() * BOUG.length)]);
    }
    if (opts.nearestRoad) {
      const r = opts.nearestRoad(main.cx, main.cz);
      if (r) {
        const dx = r.x - main.cx, dz = r.z - main.cz, D = Math.hypot(dx, dz);
        const start = Math.min(hu, hw) + 1;
        if (D < 70 && D > start + 2) {
          const ux = dx / D, uz = dz / D, len = D - start;
          terrainQuad(A.stone, C('#d8d2c4'), main.cx + ux * (start + len / 2), main.cz + uz * (start + len / 2), ux, uz, len / 2, 1.6, 0.11, 2.5);
        }
      }
    }
    for (const i of v.b) {
      const b = B[i]; handled.add(i);
      startAll(i);
      const y0 = b.y0, y1 = b.y1, pts = ptsOf(b);
      const style = b.r ? 'plantation' : 'contemporary';
      b.style = style; b.villa = v;
      let u = 0;
      for (let k = 0; k < pts.length; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length];
        const e = edgeInfo(pts, k, b.cx, b.cz);
        A.stone.wall(WHITE, ax, az, bx, bz, y0, y0 + 0.6, u);
        const featureStone = style === 'contemporary' && e.L < 6 && k % 3 === 1;
        (featureStone ? A.stone : A.wall).wall(WHITE, ax, az, bx, bz, y0 + 0.6, y1, u);
        u += e.L;
        const poolSide = v.n && i === v.m && (e.nx * v.n[0] + e.nz * v.n[1]) > 0.7;
        if (style === 'contemporary' && e.L > 3.5 && (poolSide || k % 2 === 0)) {
          const len = e.L - 1.0, segs = Math.max(1, Math.round(len / 1.8));
          for (let s = 0; s < b.f; s++) {
            const yb = y0 + 0.6 + s * 3.2, yt = yb + 2.7, mx = e.mx + e.nx * 0.07, mz = e.mz + e.nz * 0.07;
            A.glass.box(WHITE, mx, (yb + yt) / 2, mz, e.ux, e.uz, len / 2, (yt - yb) / 2, 0.04);
            for (let q = 0; q <= segs; q++) { const t = -len / 2 + len * q / segs; A.trim.box(DARKFRAME, mx + e.ux * t + e.nx * 0.03, (yb + yt) / 2, mz + e.uz * t + e.nz * 0.03, e.ux, e.uz, 0.045, (yt - yb) / 2, 0.05); }
            A.trim.box(DARKFRAME, mx + e.nx * 0.03, yt + 0.03, mz + e.nz * 0.03, e.ux, e.uz, len / 2, 0.045, 0.05);
          }
        } else if (style === 'contemporary' && e.L > 5 && k % 2 === 1) timberScreen(e, y0 + 0.6, y1 - 0.2);
        else if (!featureStone) openings(e, y0, b.f, style, poolSide);
        if (poolSide && style === 'plantation') veranda(e, y0, y1);
      }
      if (style === 'plantation') hipRoof(b.r, y1, 0.75);
      else flatRoof(pts, y1, 0.9);
    }
    if (v.pool) poolTerrace(v, main.y0 + 0.15);
  }

  const env = skyEnv();
  const mats = {
    wall: new THREE.MeshLambertMaterial({ map: T.render, vertexColors: true, side: THREE.DoubleSide }),
    roof: new THREE.MeshLambertMaterial({ map: T.shingle, vertexColors: true, side: THREE.DoubleSide }),
    stone: new THREE.MeshLambertMaterial({ map: T.stone, vertexColors: true, side: THREE.DoubleSide }),
    wood: new THREE.MeshLambertMaterial({ map: T.wood, vertexColors: true, side: THREE.DoubleSide }),
    trim: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhongMaterial({ color: 0x29404a, specular: 0xbfd8e6, shininess: 120, envMap: env, reflectivity: 0.55, combine: THREE.MixOperation, emissive: 0x000000 }),
    lamb: new THREE.MeshLambertMaterial({ map: T.lamb, alphaTest: 0.5, side: THREE.DoubleSide }),
    lawn: new THREE.MeshLambertMaterial({ map: T.lawn, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    plant: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  const group = new THREE.Group(), pick = [];
  for (const k in A) {
    if (!A[k].pos.length) continue;
    const m = A[k].mesh(mats[k]);
    if (k === 'lawn') m.castShadow = false;
    group.add(m);
    if (k !== 'lawn') pick.push({ mesh: m, tri: A[k].tri, ids: A[k].ids });
  }
  const poolMat = VR.poolMaterial();
  const water = Wt.mesh(poolMat); water.castShadow = false;
  return {
    group, pick, water, handled, poolMat, colliders, glassMat: mats.glass,
    pools: S.villas.filter(v => v.pool).length,
    setNight(f) {
      mats.glass.emissive.setRGB(0.95 * f, 0.68 * f, 0.36 * f);
      poolMat.uniforms.glow.value = f;
    },
  };
};

VR.poolMaterial = function () {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, glow: { value: 0 } }]),
    vertexShader: `varying vec3 vWP;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; uniform float glow; varying vec3 vWP;
      #include <common>
      #include <fog_pars_fragment>
      ${VR.NOISE_GLSL}
      void main(){
        vec2 p = vWP.xz * 1.6;
        float c = vrN(p + vec2(time * 0.6, time * 0.4)) * vrN(p * 1.7 - vec2(time * 0.5, -time * 0.3));
        c = smoothstep(0.18, 0.55, c);
        vec3 base = mix(vec3(0.16, 0.70, 0.80), vec3(0.05, 0.45, 0.62), glow * 0.4);
        vec3 col = mix(base, vec3(0.80, 0.98, 1.0), c * 0.55);
        col += vec3(0.1, 0.55, 0.75) * glow * 0.8;
        vec3 V = normalize(cameraPosition - vWP);
        float fres = pow(1.0 - max(V.y, 0.0), 3.0);
        col = mix(col, vec3(0.85, 0.95, 1.0), fres * 0.35 * (1.0 - glow));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
};
})();
