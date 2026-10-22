// Detailed Valriche villas: plantation-style (hipped roof, shutters, veranda) and contemporary
// (flat slab roof, glazing, timber screens), each plot with an illustrative pool terrace.
(function () {
'use strict';
const VR = window.VR = window.VR || {};

const C = {
  wall: '#f4f0e6', plinth: '#8f877a', roof: '#4a5056', glass: '#33505c', frame: '#fbfaf6',
  shutter: '#6f8f86', timber: '#9b6a43', deck: '#a8794f', stone: '#cdbda3', slab: '#f6f4ef',
  coping: '#ece6d8', lounger: '#fbfbf7', umbrella: '#efe6d3', pole: '#7a6a55', column: '#fbfaf6',
};

// Geometry accumulator with per-building triangle ranges for picking.
function Acc() {
  this.pos = []; this.col = []; this.tri = []; this.ids = [];
}
Acc.prototype.start = function (id) { this.tri.push(this.pos.length / 9); this.ids.push(id); };
Acc.prototype.tri3 = function (c, a, b, d) {
  this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]);
  for (let i = 0; i < 3; i++) this.col.push(c.r, c.g, c.b);
};
Acc.prototype.quad = function (c, a, b, d, e) { this.tri3(c, a, b, d); this.tri3(c, a, d, e); };
// oriented box: centre (x,y,z), half sizes along local axes u (horizontal dir), v (up), w (horizontal normal)
Acc.prototype.obox = function (c, x, y, z, ux, uz, hu, hv, hw) {
  const wx = -uz, wz = ux;
  const P = (su, sv, sw) => [x + ux * hu * su + wx * hw * sw, y + hv * sv, z + uz * hu * su + wz * hw * sw];
  const f = [[1, 1, 1], [-1, 1, 1], [-1, -1, 1], [1, -1, 1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1], [1, -1, -1]].map(s => P(...s));
  const Q = (a, b, d, e) => this.quad(c, f[a], f[b], f[d], f[e]);
  Q(0, 1, 2, 3); Q(5, 4, 7, 6); Q(4, 0, 3, 7); Q(1, 5, 6, 2); Q(4, 5, 1, 0); Q(3, 2, 6, 7);
};
Acc.prototype.mesh = function (mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
};

const col = hex => new THREE.Color(hex);
const CC = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, col(v)]));

function ring(b) { return b.r || b.p; }
function ccwRing(p) {
  const n = p.length / 2; let a = 0;
  for (let k = 0; k < n; k++) { const j = (k + 1) % n; a += p[k * 2] * p[j * 2 + 1] - p[j * 2] * p[k * 2 + 1]; }
  const idx = [...Array(n).keys()];
  if (a > 0) idx.reverse();          // make edges wind so the outward normal is (dz, -dx)… see wallNormal
  return idx.map(i => [p[i * 2], p[i * 2 + 1]]);
}

function walls(A, pts, y0, y1, c) {
  for (let k = 0; k < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length];
    A.quad(c, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]);
  }
}
function edgeInfo(pts, k, cx, cz) {
  const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length];
  const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
  let nx = uz, nz = -ux;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
  return { ax, az, bx, bz, L, ux, uz, nx, nz, mx, mz };
}
function flatRoof(A, pts, y, c, grow) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const r = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cz), 0) / pts.length || 1;
  const k = 1 + grow / r;
  const P = pts.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * k, cz + (z - cz) * k));
  const tris = THREE.ShapeUtils.triangulateShape(P, []);
  const top = y + 0.35;
  for (const [a, b, d] of tris) { A.tri3(c, [P[a].x, top, P[a].y], [P[b].x, top, P[b].y], [P[d].x, top, P[d].y]); A.tri3(c, [P[a].x, y, P[a].y], [P[d].x, y, P[d].y], [P[b].x, y, P[b].y]); }
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A.quad(c, [a.x, y, a.y], [b.x, y, b.y], [b.x, top, b.y], [a.x, top, a.y]); }
}
function hipRoof(A, rect, y, c, over) {
  let P = [0, 1, 2, 3].map(k => new THREE.Vector2(rect[k * 2], rect[k * 2 + 1]));
  const cen = P.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(0.25);
  P = P.map(p => { const d = p.clone().sub(cen); return cen.clone().add(d.multiplyScalar(1 + over / d.length())); });
  if (P[1].distanceTo(P[0]) < P[2].distanceTo(P[1])) P = [P[1], P[2], P[3], P[0]];
  const L = P[1].distanceTo(P[0]), W = P[2].distanceTo(P[1]);
  const dir = P[1].clone().sub(P[0]).normalize(), inset = Math.min(W / 2, L / 2 - 0.01);
  const m0 = P[0].clone().add(P[3]).multiplyScalar(0.5).addScaledVector(dir, inset);
  const m1 = P[1].clone().add(P[2]).multiplyScalar(0.5).addScaledVector(dir, -inset);
  const rh = y + Math.min(4.2, W * 0.32);
  const V = (v, h) => [v.x, h, v.y];
  const tri = (a, b, d) => { A.tri3(c, a, b, d); A.tri3(c, a, d, b); };
  tri(V(P[0], y), V(P[1], y), V(m1, rh)); tri(V(P[0], y), V(m1, rh), V(m0, rh));
  tri(V(P[2], y), V(P[3], y), V(m0, rh)); tri(V(P[2], y), V(m0, rh), V(m1, rh));
  tri(V(P[1], y), V(P[2], y), V(m1, rh)); tri(V(P[3], y), V(P[0], y), V(m0, rh));
  // fascia board
  for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; A.quad(CC.frame, [a.x, y - 0.25, a.y], [b.x, y - 0.25, b.y], [b.x, y, b.y], [a.x, y, a.y]); }
}

// windows/doors and shutters along an edge
function openings(A, e, y0, floors, style, poolSide) {
  const n = Math.floor((e.L - 1.2) / 3.0);
  if (n < 1) return;
  const step = e.L / (n + 1);
  for (let s = 0; s < floors; s++) {
    const fy = y0 + 0.6 + s * 3.2;
    for (let i = 1; i <= n; i++) {
      const t = i * step, x = e.ax + e.ux * t + e.nx * 0.06, z = e.az + e.uz * t + e.nz * 0.06;
      const door = s === 0 && poolSide;
      const hw = door ? 0.9 : 0.65, hh = door ? 1.2 : 0.8, cy = door ? fy + 1.2 : fy + 1.6;
      A.obox(CC.frame, x, cy, z, e.ux, e.uz, hw + 0.08, hh + 0.08, 0.05);
      A.obox(CC.glass, x + e.nx * 0.04, cy, z + e.nz * 0.04, e.ux, e.uz, hw, hh, 0.04);
      if (style === 'plantation' && !door) {
        for (const sd of [-1, 1]) A.obox(CC.shutter, x + e.ux * sd * (hw + 0.38) + e.nx * 0.02, cy, z + e.uz * sd * (hw + 0.38) + e.nz * 0.02, e.ux, e.uz, 0.32, hh, 0.04);
      }
    }
  }
}

function veranda(A, e, y0, yTop) {
  const depth = 3.0, len = Math.min(e.L - 0.6, 14), c0 = (e.L - len) / 2;
  const sx = e.ax + e.ux * c0, sz = e.az + e.uz * c0;
  const at = (t, d) => [sx + e.ux * t + e.nx * d, sz + e.uz * t + e.nz * d];
  const y1 = Math.min(yTop - 0.3, y0 + 3.2), y2 = y1 - 0.55;
  const [p0x, p0z] = at(0, 0), [p1x, p1z] = at(len, 0), [p2x, p2z] = at(len, depth), [p3x, p3z] = at(0, depth);
  A.quad(CC.roof, [p0x, y1, p0z], [p1x, y1, p1z], [p2x, y2, p2z], [p3x, y2, p3z]);
  A.quad(CC.roof, [p0x, y1 - 0.12, p0z], [p3x, y2 - 0.12, p3z], [p2x, y2 - 0.12, p2z], [p1x, y1 - 0.12, p1z]);
  // deck
  const [d0x, d0z] = at(len / 2, depth / 2);
  A.obox(CC.deck, d0x, y0 + 0.08, d0z, e.ux, e.uz, len / 2, 0.12, depth / 2);
  // columns
  const nc = Math.max(2, Math.round(len / 3) + 1);
  for (let i = 0; i < nc; i++) {
    const [cx, cz] = at(0.2 + (len - 0.4) * i / (nc - 1), depth - 0.25);
    A.obox(CC.column, cx, (y0 + y2) / 2, cz, e.ux, e.uz, 0.12, (y2 - y0) / 2, 0.12);
  }
}

function timberScreen(A, e, y0, y1) {
  const len = Math.min(4, e.L * 0.5), c0 = (e.L - len) / 2;
  for (let t = 0; t <= len; t += 0.28) {
    const x = e.ax + e.ux * (c0 + t) + e.nx * 0.25, z = e.az + e.uz * (c0 + t) + e.nz * 0.25;
    A.obox(CC.timber, x, (y0 + y1) / 2, z, e.ux, e.uz, 0.04, (y1 - y0) / 2, 0.08);
  }
}

function poolTerrace(A, W, v, y) {
  const [cx, cz, ang, pl, pw] = v.pool;
  const ux = Math.cos(ang), uz = Math.sin(ang);
  const nx = v.n[0], nz = v.n[1];
  // deck: around the pool and back towards the house
  const back = 3.4;
  const dcx = cx - nx * back / 2, dcz = cz - nz * back / 2;
  const sameDir = Math.abs(ux * nz - uz * nx) > 0.5;  // pool long side parallel to the house wall
  const hu = pl / 2 + 1.8, hw = pw / 2 + 1.8 + back / 2;
  A.obox(CC.deck, dcx, y - 0.04, dcz, ux, uz, hu, 0.08, hw);
  A.obox(CC.stone, dcx, y - 2.2, dcz, ux, uz, hu - 0.05, 2.12, hw - 0.05);   // retaining base down to the slope
  // coping
  const cy = y + 0.14;
  A.obox(CC.coping, cx + (-uz) * (pw / 2 + 0.2), cy, cz + ux * (pw / 2 + 0.2), ux, uz, pl / 2 + 0.4, 0.05, 0.2);
  A.obox(CC.coping, cx - (-uz) * (pw / 2 + 0.2), cy, cz - ux * (pw / 2 + 0.2), ux, uz, pl / 2 + 0.4, 0.05, 0.2);
  A.obox(CC.coping, cx + ux * (pl / 2 + 0.2), cy, cz + uz * (pl / 2 + 0.2), ux, uz, 0.2, 0.05, pw / 2);
  A.obox(CC.coping, cx - ux * (pl / 2 + 0.2), cy, cz - uz * (pl / 2 + 0.2), ux, uz, 0.2, 0.05, pw / 2);
  // water surface (separate animated mesh)
  const wx = -uz, wz = ux, Pw = (a, b) => [cx + ux * a + wx * b, y + 0.135, cz + uz * a + wz * b];
  W.quad(new THREE.Color(1, 1, 1), Pw(-pl / 2, -pw / 2), Pw(-pl / 2, pw / 2), Pw(pl / 2, pw / 2), Pw(pl / 2, -pw / 2));
  // loungers on the far side, umbrella between
  const side = (wx * nx + wz * nz) > 0 ? 1 : -1;
  const lx = cx + wx * side * (pw / 2 + 1.2), lz = cz + wz * side * (pw / 2 + 1.2);
  for (const o of [-1.1, 1.1]) {
    const x = lx + ux * o, z = lz + uz * o;
    A.obox(CC.lounger, x, y + 0.32, z, wx, wz, 0.95, 0.12, 0.35);
    A.obox(CC.lounger, x + wx * side * 0.75, y + 0.6, z + wz * side * 0.75, wx, wz, 0.2, 0.32, 0.35);
  }
  A.obox(CC.pole, lx, y + 1.2, lz, ux, uz, 0.04, 1.1, 0.04);
  const top = [lx, y + 2.5, lz];
  for (let i = 0; i < 8; i++) {
    const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2, r = 1.4;
    A.tri3(CC.umbrella, top, [lx + Math.cos(a1) * r, y + 2.05, lz + Math.sin(a1) * r], [lx + Math.cos(a0) * r, y + 2.05, lz + Math.sin(a0) * r]);
    A.tri3(CC.umbrella, top, [lx + Math.cos(a0) * r, y + 2.05, lz + Math.sin(a0) * r], [lx + Math.cos(a1) * r, y + 2.05, lz + Math.sin(a1) * r]);
  }
  // pergola between house and pool
  const px = cx - nx * (pw / 2 + 1.9), pz = cz - nz * (pw / 2 + 1.9);
  for (let t = -2; t <= 2; t += 0.5) A.obox(CC.timber, px + ux * t, y + 2.75, pz + uz * t, nx, nz, 1.3, 0.06, 0.05);
  for (const t of [-2.1, 2.1]) {
    A.obox(CC.timber, px + ux * t, y + 2.65, pz + uz * t, nx, nz, 1.35, 0.08, 0.08);
    A.obox(CC.timber, px + ux * t + nx * 1.2, y + 1.35, pz + uz * t + nz * 1.2, ux, uz, 0.08, 1.35, 0.08);
  }
}

VR.poolMaterial = function () {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: `varying vec3 vWP;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; varying vec3 vWP;
      #include <common>
      #include <fog_pars_fragment>
      ${VR.NOISE_GLSL}
      void main(){
        vec2 p = vWP.xz * 1.6;
        float c = vrN(p + vec2(time * 0.6, time * 0.4)) * vrN(p * 1.7 - vec2(time * 0.5, -time * 0.3));
        c = smoothstep(0.18, 0.55, c);
        vec3 base = vec3(0.16, 0.70, 0.80);
        vec3 col = mix(base, vec3(0.80, 0.98, 1.0), c * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  return mat;
};

VR.buildVillas = function (S, baseOf, opts) {
  const B = S.buildings;
  const A = new VR.AccFactory(), Wt = new VR.AccFactory();
  const villaOf = new Map();
  for (const v of S.villas) for (const i of v.b) villaOf.set(i, v);
  const handled = new Set();
  for (const v of S.villas) {
    const main = B[v.m];
    for (const i of v.b) {
      const b = B[i]; handled.add(i);
      A.start(i);
      const y0 = b.y0, y1 = b.y1, pts = ccwRing(ring(b));
      const cx = b.cx, cz = b.cz;
      const style = b.r ? 'plantation' : 'contemporary';
      b.style = style; b.villa = v;
      // plinth + walls
      walls(A, pts, y0, y0 + 0.6, style === 'plantation' ? CC.plinth : CC.stone);
      walls(A, pts, y0 + 0.6, y1, style === 'plantation' || i !== v.m ? CC.wall : CC.wall);
      for (let k = 0; k < pts.length; k++) {
        const e = edgeInfo(pts, k, cx, cz);
        const poolSide = v.n && i === v.m && (e.nx * v.n[0] + e.nz * v.n[1]) > 0.7;
        if (style === 'contemporary' && e.L > 3.5 && (poolSide || k % 2 === 0)) {
          // full-height glazing with slim frames
          const len = e.L - 1.0, segs = Math.max(1, Math.round(len / 1.8));
          for (let s = 0; s < b.f; s++) {
            const yb = y0 + 0.6 + s * 3.2, yt = yb + 2.6;
            const mx = e.mx + e.nx * 0.07, mz = e.mz + e.nz * 0.07;
            A.obox(CC.glass, mx, (yb + yt) / 2, mz, e.ux, e.uz, len / 2, (yt - yb) / 2, 0.04);
            for (let q = 0; q <= segs; q++) {
              const t = -len / 2 + len * q / segs;
              A.obox(CC.frame, mx + e.ux * t + e.nx * 0.03, (yb + yt) / 2, mz + e.uz * t + e.nz * 0.03, e.ux, e.uz, 0.05, (yt - yb) / 2, 0.05);
            }
          }
        } else if (style === 'contemporary' && e.L > 5 && k % 2 === 1) {
          timberScreen(A, e, y0 + 0.6, y1 - 0.2);
        } else {
          openings(A, e, y0, b.f, style, poolSide);
        }
        if (poolSide && style === 'plantation') veranda(A, e, y0, y1);
      }
      if (style === 'plantation') hipRoof(A, b.r, y1, CC.roof, 0.7);
      else flatRoof(A, pts, y1, CC.slab, 0.9);
    }
    if (v.pool) poolTerrace(A, Wt, v, main.y0 + 0.15);
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = A.mesh(mat); mesh.castShadow = true; mesh.receiveShadow = true;
  const poolMat = VR.poolMaterial();
  const water = Wt.mesh(poolMat);
  // tri map: A.tri entries mark where each building starts; the pool terrace triangles fall
  // after the last building of its plot, so a click on a terrace reports that villa.
  return { mesh, water, tri: A.tri, ids: A.ids, handled, poolMat, pools: S.villas.filter(v => v.pool).length };
};
VR.AccFactory = Acc;
})();
