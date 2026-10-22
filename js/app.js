(async function () {
'use strict';
const $ = s => document.querySelector(s);
const VR = window.VR;
const loading = $('#loading');
let S, satImg;
try {
  S = await fetch('data/scene.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  satImg = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('satellite image')); i.src = 'data/' + S.sat; });
} catch (e) { loading.innerHTML = '<div>Could not load the estate data.<small>' + e.message + '. Serve the folder over HTTP, e.g. python3 -m http.server.</small></div>'; return; }
if (!window.THREE || !VR) { loading.innerHTML = '<div>3D engine did not load.<small>three.js comes from cdn.jsdelivr.net; check the connection.</small></div>'; return; }

const store = {
  get(k, d) { try { const v = localStorage.getItem('valriche-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('valriche-' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
const MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ geography helpers
const M = S.meta, D = S.dem;
const [LON0, LAT0] = M.origin;
const toLL = (x, z) => [LON0 + x / M.kx, LAT0 - z / M.ky];
const fmtLL = (x, z) => { const [lo, la] = toLL(x, z); return `${Math.abs(la).toFixed(5)}°S ${lo.toFixed(5)}°E`; };
const XW = (D.w - 1) * D.dx, ZH = (D.h - 1) * D.dz;
const EXT = { x0: D.x0, z0: D.z0, x1: D.x0 + XW, z1: D.z0 + ZH };
let EX = 1.25;
const STOREY = 3.2, SEA = 0.0;
function hRaw(x, z) {
  let fx = (x - D.x0) / D.dx, fz = (z - D.z0) / D.dz;
  fx = Math.max(0, Math.min(D.w - 1.001, fx)); fz = Math.max(0, Math.min(D.h - 1.001, fz));
  const i = fz | 0, j = fx | 0, u = fx - j, v = fz - i, w = D.w, d = D.data;
  return ((d[i * w + j] * (1 - u) + d[i * w + j + 1] * u) * (1 - v) + (d[(i + 1) * w + j] * (1 - u) + d[(i + 1) * w + j + 1] * u) * v) / 10;
}
const landH = h => h <= 0.4 ? -4 : h;
// Height of the rendered terrain surface: same two-triangle split per cell as the mesh, so
// anything placed with H() sits exactly on the visible ground.
function H(x, z) {
  let fx = (x - D.x0) / D.dx, fz = (z - D.z0) / D.dz;
  fx = Math.max(0, Math.min(D.w - 1.0001, fx)); fz = Math.max(0, Math.min(D.h - 1.0001, fz));
  const i = fz | 0, j = fx | 0, u = fx - j, v = fz - i, w = D.w, d = D.data;
  const a = landH(d[i * w + j] / 10), b = landH(d[i * w + j + 1] / 10), c = landH(d[(i + 1) * w + j] / 10), e = landH(d[(i + 1) * w + j + 1] / 10);
  const h = u + v <= 1 ? a + (b - a) * u + (c - a) * v : e + (c - e) * (1 - u) + (b - e) * (1 - v);
  return h * EX;
}

// ------------------------------------------------------------------ renderer, scene, light
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);

renderer.shadowMap.enabled = !MOBILE; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const HAZE = new THREE.Color('#cfe7f1');
scene.fog = new THREE.Fog(HAZE, 4000, 16000);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 1, 40000);
camera.position.set(620, 360, 1150);
if (innerWidth < innerHeight) camera.position.set(900, 900, 2100);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 30, -60);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.485; controls.minDistance = 12; controls.maxDistance = 14000;

// Southern hemisphere: the sun stands to the north (−z).
const SUN_DIR = new THREE.Vector3(-0.35, 0.82, -0.45).normalize();
const hemi = new THREE.HemisphereLight(0xe6f2ff, 0x6a6f4a, 0.62); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3dc, 0.62);
sun.position.copy(SUN_DIR).multiplyScalar(1000); scene.add(sun); scene.add(sun.target);
sun.castShadow = renderer.shadowMap.enabled;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 10, far: 3000 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;

const sky = VR.createSky(scene, SUN_DIR);
const sea = VR.createSea(scene, EXT, SUN_DIR);
const atmo = VR.createAtmosphere(scene, EXT, { sky: sky.mesh, sun, hemi, fog: scene.fog, renderer });

// ------------------------------------------------------------------ ground texture
const TEX_W = MOBILE ? 2048 : 4096, TEX_H = Math.round(TEX_W * ZH / XW);
const gcan = document.createElement('canvas'); gcan.width = TEX_W; gcan.height = TEX_H;
const gctx = gcan.getContext('2d');
const tx = x => (x - D.x0) / XW * TEX_W, ty = z => (z - D.z0) / ZH * TEX_H;
const pxm = TEX_W / XW;

const LAYERS = [
  { id: 'sat', label: 'Satellite imagery (Sentinel-2)', sw: '#5f8f4a', on: true },
  { id: 'golf', label: 'Golf course detail (fairways, greens, bunkers)', sw: '#93cf62', on: true },
  { id: 'trees', label: 'Trees (from ESA tree-cover map)', sw: '#3f6e2c', on: true },
  { id: 'pools', label: 'Villa pools & terraces (illustrative)', sw: '#2bb3c4', on: true },
  { id: 'roads', label: 'Roads & cart paths', sw: '#5b5f63', on: true },
  { id: 'clouds', label: 'Clouds', sw: '#e8eef2', on: true },
  { id: 'people', label: 'Golfers & kitesurfers', sw: '#e86f8f', on: true },
  { id: 'landuse', label: 'Land-use colours (cane, villages)', sw: '#b9bf6a', on: false },
  { id: 'reserve', label: 'Nature reserve & park edges', sw: '#3c7a3a', on: false },
];
const layerOn = Object.fromEntries(LAYERS.map(l => [l.id, store.get('layer-' + l.id, l.on)]));

function ringPath(ctx, rings) {
  ctx.beginPath();
  for (const r of rings) { for (let k = 0; k < r.length; k += 2) (k ? ctx.lineTo : ctx.moveTo).call(ctx, tx(r[k]), ty(r[k + 1])); ctx.closePath(); }
}
// fallback shaded relief when the imagery is switched off
const relief = document.createElement('canvas'); relief.width = D.w; relief.height = D.h;
(function () {
  const bc = relief.getContext('2d'), img = bc.createImageData(D.w, D.h);
  for (let i = 0; i < D.h; i++) for (let j = 0; j < D.w; j++) {
    const k = i * D.w + j, h = D.data[k] / 10;
    const hl = D.data[i * D.w + Math.max(0, j - 1)] / 10, hr = D.data[i * D.w + Math.min(D.w - 1, j + 1)] / 10;
    const hu = D.data[Math.max(0, i - 1) * D.w + j] / 10, hd = D.data[Math.min(D.h - 1, i + 1) * D.w + j] / 10;
    let shade = 0.82 + (-(hr - hl) / (2 * D.dx) * 0.6 + (hd - hu) / (2 * D.dz) * 0.9) * 1.6; shade = Math.max(0.45, Math.min(1.25, shade));
    let r, g, b;
    if (h <= 0.4) { r = 72; g = 164; b = 178; shade = 1; } else if (h < 3) { r = 214; g = 201; b = 160; }
    else { const t = Math.min(1, h / 600); r = 120 - 50 * t; g = 150 - 40 * t; b = 80 - 25 * t; }
    img.data.set([r * shade, g * shade, b * shade, 255], k * 4);
  }
  bc.putImageData(img, 0, 0);
})();

const LU = {
  farmland: ['rgba(185,191,106,.55)', 'landuse'], farmyard: ['rgba(201,185,138,.55)', 'landuse'],
  residential: ['rgba(222,208,178,.45)', 'landuse'], commercial: ['rgba(210,190,170,.5)', 'landuse'],
};
function drawGround() {
  gctx.imageSmoothingEnabled = true; gctx.imageSmoothingQuality = 'high';
  gctx.drawImage(layerOn.sat ? satImg : relief, 0, 0, TEX_W, TEX_H);
  if (layerOn.landuse) for (const l of S.landuse) { const st = LU[l.t]; if (st) { ringPath(gctx, l.r); gctx.fillStyle = st[0]; gctx.fill('evenodd'); } }
  // beaches a touch brighter than the 10 m imagery can show
  for (const l of S.land) if (l.r && l.t === 'beach') { ringPath(gctx, l.r); gctx.fillStyle = 'rgba(238,226,190,.55)'; gctx.fill('evenodd'); }
  if (layerOn.golf) {
    const stripeW = Math.max(2, 9 * pxm);
    const fair = VR.stripePattern(gctx, '#7dc04f', '#8fcf5c', stripeW), green = VR.stripePattern(gctx, '#9ad86a', '#a8e276', Math.max(2, 3 * pxm));
    const order = ['golf_course', 'rough', 'fairway', 'tee', 'green', 'water_hazard', 'lateral_water_hazard', 'bunker'];
    const golf = S.landuse.filter(l => order.includes(l.t)).sort((a, b) => order.indexOf(a.t) - order.indexOf(b.t));
    for (const l of golf) {
      ringPath(gctx, l.r);
      if (l.t === 'golf_course') { gctx.fillStyle = 'rgba(110,170,70,.28)'; gctx.fill('evenodd'); }
      else if (l.t === 'rough') { gctx.fillStyle = 'rgba(96,150,60,.45)'; gctx.fill('evenodd'); }
      else if (l.t === 'fairway') { gctx.save(); gctx.translate(tx(0), ty(0)); gctx.rotate(0.6); gctx.translate(-tx(0), -ty(0)); gctx.restore(); gctx.fillStyle = fair; gctx.globalAlpha = 0.92; gctx.fill('evenodd'); gctx.globalAlpha = 1; }
      else if (l.t === 'tee') { gctx.fillStyle = '#9fdc6c'; gctx.fill('evenodd'); }
      else if (l.t === 'green') { gctx.fillStyle = green; gctx.fill('evenodd'); gctx.strokeStyle = 'rgba(90,150,60,.9)'; gctx.lineWidth = Math.max(1, 1.5 * pxm); gctx.stroke(); }
      else if (l.t === 'bunker') { gctx.fillStyle = '#f1e6c6'; gctx.fill('evenodd'); gctx.strokeStyle = 'rgba(150,170,90,.8)'; gctx.lineWidth = Math.max(1, pxm); gctx.stroke(); }
      else { gctx.fillStyle = '#2f9fb3'; gctx.fill('evenodd'); }
    }
  }
  for (const w of S.water) if (w.r && w.t !== 'ocean' && w.t !== 'swimming_pool') { ringPath(gctx, w.r); gctx.fillStyle = '#2f8fa6'; gctx.fill('evenodd'); }
  for (const w of S.water) if (w.r && w.t === 'swimming_pool') { ringPath(gctx, w.r); gctx.fillStyle = '#3ec6d6'; gctx.fill('evenodd'); }
  if (layerOn.reserve) for (const l of S.landuse) if (l.t === 'nature_reserve' || l.t === 'national_park') {
    ringPath(gctx, l.r); gctx.setLineDash([12, 9]); gctx.strokeStyle = '#2d6a2d'; gctx.lineWidth = 3; gctx.stroke(); gctx.setLineDash([]);
  }
  groundTex.needsUpdate = true;
}
const groundTex = new THREE.CanvasTexture(gcan);
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

// ------------------------------------------------------------------ terrain
const terrGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(D.w * D.h * 3), uv = new Float32Array(D.w * D.h * 2), idx = [];
  for (let i = 0; i < D.h; i++) for (let j = 0; j < D.w; j++) {
    const k = i * D.w + j; pos[k * 3] = D.x0 + j * D.dx; pos[k * 3 + 2] = D.z0 + i * D.dz;
    uv[k * 2] = j / (D.w - 1); uv[k * 2 + 1] = 1 - i / (D.h - 1);
    if (i < D.h - 1 && j < D.w - 1) idx.push(k, k + D.w, k + 1, k + 1, k + D.w, k + D.w + 1);
  }
  terrGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  terrGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  terrGeo.setIndex(idx);
}
function updateTerrain() {
  const p = terrGeo.attributes.position.array;
  for (let k = 0; k < D.w * D.h; k++) p[k * 3 + 1] = landH(D.data[k] / 10) * EX;
  terrGeo.attributes.position.needsUpdate = true; terrGeo.computeVertexNormals(); terrGeo.computeBoundingSphere();
}
const terrain = new THREE.Mesh(terrGeo, VR.terrainMaterial(groundTex));
terrain.receiveShadow = true;
scene.add(terrain);

// ------------------------------------------------------------------ roads
const ROAD = {
  primary: [8, '#4c5054'], secondary: [7, '#51565a'], tertiary: [6, '#565b5f'], residential: [5, '#5d6266'],
  living_street: [4.5, '#5d6266'], unclassified: [5, '#63686b'], service: [3.6, '#6b6f72'],
  unknown: [2.4, '#c9bda2'], track: [3, '#ad9670'], footway: [1.4, '#d8ccb0'], path: [1.2, '#d8ccb0'], steps: [1.4, '#d8ccb0'],
};
let roadMesh = null;
function buildRoads() {
  if (roadMesh) { scene.remove(roadMesh); roadMesh.geometry.dispose(); }
  const pos = [], col = [], c = new THREE.Color(), line = new THREE.Color('#e9e4d6');
  for (const r of S.roads) {
    const [w, hex] = ROAD[r.c] || ROAD.unknown; c.set(hex);
    const pts = [];
    for (let k = 0; k < r.p.length - 2; k += 2) {
      const ax = r.p[k], az = r.p[k + 1], bx = r.p[k + 2], bz = r.p[k + 3];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
      for (let s = 0; s < n; s++) pts.push([ax + (bx - ax) * s / n, az + (bz - az) * s / n]);
    }
    pts.push([r.p[r.p.length - 2], r.p[r.p.length - 1]]);
    let prev = null, dist = 0;
    const dashed = ['primary', 'secondary'].includes(r.c);
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const [x, z] = pts[k], y = Math.max(H(x, z), SEA + 0.2) + 0.1;
      const cur = [x - dz * w / 2, y, z + dx * w / 2, x + dz * w / 2, y, z - dx * w / 2, x - dz * 0.08, y + 0.02, z + dx * 0.08, x + dz * 0.08, y + 0.02, z - dx * 0.08];
      if (prev) {
        pos.push(...prev.slice(0, 3), ...cur.slice(0, 3), ...prev.slice(3, 6), ...prev.slice(3, 6), ...cur.slice(0, 3), ...cur.slice(3, 6));
        for (let q = 0; q < 6; q++) col.push(c.r, c.g, c.b);
        dist += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        if (dashed && (dist % 12) < 6) {
          pos.push(...prev.slice(6, 9), ...cur.slice(6, 9), ...prev.slice(9, 12), ...prev.slice(9, 12), ...cur.slice(6, 9), ...cur.slice(9, 12));
          for (let q = 0; q < 6; q++) col.push(line.r, line.g, line.b);
        }
      }
      prev = cur;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  roadMesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  roadMesh.receiveShadow = true; roadMesh.visible = layerOn.roads; scene.add(roadMesh);
}

// ------------------------------------------------------------------ golf flags on greens
let flags = null;
function buildFlags() {
  if (flags) scene.remove(flags);
  flags = new THREE.Group();
  const pole = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), cloth = new THREE.PlaneGeometry(0.8, 0.5);
  const pm = new THREE.MeshLambertMaterial({ color: 0xf5f5f0 }), fm = new THREE.MeshLambertMaterial({ color: 0xd8382a, side: THREE.DoubleSide });
  for (const l of S.landuse) if (l.t === 'green') {
    const r = l.r[0]; let x = 0, z = 0; for (let k = 0; k < r.length; k += 2) { x += r[k]; z += r[k + 1]; } x /= r.length / 2; z /= r.length / 2;
    const y = H(x, z);
    const p = new THREE.Mesh(pole, pm); p.position.set(x, y + 1.2, z); flags.add(p);
    const f = new THREE.Mesh(cloth, fm); f.position.set(x + 0.4, y + 2.15, z); flags.add(f);
  }
  flags.visible = layerOn.golf; scene.add(flags);
}

// ------------------------------------------------------------------ Valriche outline
let zoneLine = null;
function buildZone() {
  if (zoneLine) { scene.remove(zoneLine); zoneLine.geometry.dispose(); }
  const v = S.valriche, pts = [];
  for (let k = 0; k < v.length; k += 2) {
    const ax = v[k], az = v[k + 1], bx = v[(k + 2) % v.length], bz = v[(k + 3) % v.length];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 10));
    for (let s = 0; s <= n; s++) { const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n; pts.push(new THREE.Vector3(x, H(x, z) + 3, z)); }
  }
  zoneLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xd9822b, dashSize: 14, gapSize: 8 }));
  zoneLine.computeLineDistances(); zoneLine.visible = $('#f-zone').checked; scene.add(zoneLine);
}

// ------------------------------------------------------------------ buildings
const CATS = [
  { id: 'valriche', label: 'Valriche villas (inside outline)', wall: '#f4efe4', roof: '#4a5056' },
  { id: 'landmark', label: 'Château & golf clubhouse', wall: '#f7f1e3', roof: '#8a3b2a' },
  { id: 'resort', label: 'Beach resorts & hotels', wall: '#eadbc0', roof: '#7b6a58' },
  { id: 'village', label: 'Villages & other buildings', wall: '#d9d2c3', roof: '#8b8f8c' },
];
const SRCS = [
  { id: 'osm', label: 'OpenStreetMap (traced by mappers)' },
  { id: 'msft', label: 'Microsoft ML Buildings (machine-learned)' },
  { id: 'google', label: 'Google Open Buildings (machine-learned)' },
];
const catOn = Object.fromEntries(CATS.map(c => [c.id, true])), srcOn = Object.fromEntries(SRCS.map(s => [s.id, true]));
let floorSel = 'all';
const B = S.buildings;
for (const b of B) {
  const p = b.r || b.p; let cx = 0, cz = 0; for (let k = 0; k < p.length; k += 2) { cx += p[k]; cz += p[k + 1]; }
  b.cx = cx / (p.length / 2); b.cz = cz / (p.length / 2);
}
// Mauritian village houses: rendered concrete in a range of painted colours
const VILLAGE_WALLS = ['#e9e2d2', '#f1d9b5', '#e8c9c3', '#cfe0d4', '#d6e1ea', '#f3e7b9', '#e6e6e6', '#f0d0a8'];
const bMeshes = [];
const dimMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, color: 0xbbbbbb, depthWrite: false, side: THREE.DoubleSide });
const fullMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
function baseOf(b) {
  const p = b.r || b.p; let m = Infinity;
  for (let k = 0; k < p.length; k += 2) {
    const dx = p[k] - b.cx, dz = p[k + 1] - b.cz, L = Math.hypot(dx, dz) || 1;
    m = Math.min(m, H(p[k], p[k + 1]), H(p[k] + dx / L * 4, p[k + 1] + dz / L * 4));
  }
  return Math.max(m, SEA + 0.3) - 0.4;
}
let villas = null;
function buildBuildings() {
  for (const o of bMeshes) { scene.remove(o.mesh); o.mesh.geometry.dispose(); }
  bMeshes.length = 0;
  for (const b of B) { b.y0 = baseOf(b); b.y1 = b.y0 + 0.6 + b.f * STOREY; }
  // detailed villas
  if (villas) { scene.remove(villas.group); scene.remove(villas.water); villas.group.traverse(o => o.geometry && o.geometry.dispose()); villas.water.geometry.dispose(); }
  villas = VR.buildVillas(S, { H, nearestRoad });
  scene.add(villas.group); scene.add(villas.water);
  for (const pk of villas.pick) bMeshes.push({ mesh: pk.mesh, cat: 'valriche', src: '*', fb: '*', tri: pk.tri, ids: pk.ids, villa: true });
  // everything else
  const groups = new Map();
  const wc = new THREE.Color(), rc = new THREE.Color(), gl = new THREE.Color('#33505c');
  B.forEach((b, i) => {
    if (villas.handled.has(i)) return;
    const fb = b.f >= 2 ? '2' : '1', key = b.c + '|' + b.s + '|' + fb;
    if (!groups.has(key)) groups.set(key, { pos: [], col: [], tri: [], ids: [], cat: b.c, src: b.s, fb });
    const G = groups.get(key), cat = CATS.find(c => c.id === b.c);
    G.tri.push(G.pos.length / 9); G.ids.push(i);
    const p = b.r || b.p, n = p.length / 2, y0 = b.y0, y1 = b.y1;
    const hsh = (i * 2654435761) >>> 0;
    wc.set(b.c === 'village' ? VILLAGE_WALLS[hsh % VILLAGE_WALLS.length] : cat.wall); rc.set(cat.roof);
    if (b.c === 'village' && !b.r) rc.set(hsh % 3 ? '#a3a39b' : '#8e9196');
    const push = (c, ...v) => { G.pos.push(...v); for (let q = 0; q < v.length / 3; q++) G.col.push(c.r, c.g, c.b); };
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n, ax = p[k * 2], az = p[k * 2 + 1], cx = p[j * 2], cz = p[j * 2 + 1];
      push(wc, ax, y0, az, cx, y0, cz, cx, y1, cz, ax, y0, az, cx, y1, cz, ax, y1, az);
      // window band per storey on longer walls (resorts and landmarks)
      const L = Math.hypot(cx - ax, cz - az);
      if ((b.c === 'resort' || b.c === 'landmark') && L > 4) {
        const nx = (cz - az) / L * 0.06, nz = -(cx - ax) / L * 0.06;
        for (let s = 0; s < b.f; s++) {
          const ya = y0 + 0.6 + s * STOREY + 0.9, yb = ya + 1.4, t0 = 0.12, t1 = 0.88;
          const q0 = [ax + (cx - ax) * t0, az + (cz - az) * t0], q1 = [ax + (cx - ax) * t1, az + (cz - az) * t1];
          for (const sg of [1, -1]) push(gl, q0[0] + nx * sg, ya, q0[1] + nz * sg, q1[0] + nx * sg, ya, q1[1] + nz * sg, q1[0] + nx * sg, yb, q1[1] + nz * sg,
            q0[0] + nx * sg, ya, q0[1] + nz * sg, q1[0] + nx * sg, yb, q1[1] + nz * sg, q0[0] + nx * sg, yb, q0[1] + nz * sg);
        }
      }
    }
    if (b.r) {
      let P = [0, 1, 2, 3].map(k => new THREE.Vector2(p[k * 2], p[k * 2 + 1]));
      if (P[1].distanceTo(P[0]) < P[2].distanceTo(P[1])) P = [P[1], P[2], P[3], P[0]];
      const W = P[2].distanceTo(P[1]), L = P[1].distanceTo(P[0]);
      const dir = P[1].clone().sub(P[0]).normalize(), inset = Math.min(W / 2, L / 2 - 0.01);
      const m0 = P[0].clone().add(P[3]).multiplyScalar(0.5).addScaledVector(dir, inset), m1 = P[1].clone().add(P[2]).multiplyScalar(0.5).addScaledVector(dir, -inset);
      const rh = y1 + Math.min(4, W * 0.3), V = (v, y) => [v.x, y, v.y];
      const tri = (a, b2, c) => push(rc, ...a, ...b2, ...c);
      tri(V(P[0], y1), V(P[1], y1), V(m1, rh)); tri(V(P[0], y1), V(m1, rh), V(m0, rh));
      tri(V(P[2], y1), V(P[3], y1), V(m0, rh)); tri(V(P[2], y1), V(m0, rh), V(m1, rh));
      tri(V(P[1], y1), V(P[2], y1), V(m1, rh)); tri(V(P[3], y1), V(P[0], y1), V(m0, rh));
    } else {
      const contour = []; for (let k = 0; k < n; k++) contour.push(new THREE.Vector2(p[k * 2], p[k * 2 + 1]));
      for (const [a, b2, c] of THREE.ShapeUtils.triangulateShape(contour, [])) push(rc, contour[a].x, y1, contour[a].y, contour[b2].x, y1, contour[b2].y, contour[c].x, y1, contour[c].y);
    }
  });
  for (const [, G] of groups) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(G.col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, fullMat); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); bMeshes.push({ mesh, cat: G.cat, src: G.src, fb: G.fb, tri: G.tri, ids: G.ids });
  }
  applyBuildingFilters();
}
function bVisible(b) { return catOn[b.c] && srcOn[b.s] && (floorSel === 'all' || (floorSel === '1' ? b.f < 2 : b.f >= 2)); }
function applyBuildingFilters() {
  const dim = $('#f-dim').checked;
  for (const o of bMeshes) {
    if (o.villa) continue;
    o.mesh.visible = catOn[o.cat] && srcOn[o.src] && (floorSel === 'all' || floorSel === o.fb);
    o.mesh.material = dim && o.cat !== 'valriche' ? dimMat : fullMat;
  }
  villas.group.visible = catOn.valriche; villas.water.visible = catOn.valriche && layerOn.pools;
  let vis = 0;
  for (const b of B) if (bVisible(b)) vis++;
  $('#st-vis').textContent = vis.toLocaleString('en-GB'); $('#st-val').textContent = S.villas.length;
  for (const c of CATS) $('#n-cat-' + c.id).textContent = B.filter(b => b.c === c.id && srcOn[b.s]).length.toLocaleString('en-GB');
  for (const s of SRCS) $('#n-src-' + s.id).textContent = B.filter(b => b.s === s.id && catOn[b.c]).length.toLocaleString('en-GB');
  rebuildColliders();
}

// ------------------------------------------------------------------ trees
let trees = null;
function buildTrees() {
  if (trees) { trees.place(); return; }
  trees = VR.buildTrees(scene, S.trees, H, { thin: MOBILE });
  trees.setVisible(layerOn.trees);
}

// ------------------------------------------------------------------ POIs & labels
const PCATS = [
  { id: 'estate', label: 'Estate' }, { id: 'golf', label: 'Golf' }, { id: 'hotel', label: 'Hotels' },
  { id: 'heritage', label: 'Heritage' }, { id: 'food', label: 'Food & drink' }, { id: 'nature', label: 'Nature & beach' },
  { id: 'wellness', label: 'Spa & fitness' }, { id: 'other', label: 'Other' },
];
const PV = [{ id: 'verified', label: 'Verified' }, { id: 'unverified', label: 'Unverified' }, { id: 'flagged', label: 'Flagged' }];
const pcatOn = Object.fromEntries(PCATS.map(c => [c.id, ['estate', 'golf', 'hotel', 'heritage', 'nature'].includes(c.id)]));
const pvOn = { verified: true, unverified: true, flagged: true };
let searchQ = '';
const PRIO = { estate: 6, heritage: 5, golf: 4, hotel: 3, nature: 2, food: 1, wellness: 0, other: 0 };
const labelsEl = $('#labels');
for (const p of S.pois) {
  const el = document.createElement('div');
  el.className = 'lbl' + (p.v === 'verified' && PRIO[p.c] >= 4 ? ' big' : '');
  el.innerHTML = `<span class="dot v-${p.v}"></span>`; el.append(p.n);
  el.addEventListener('click', ev => { ev.stopPropagation(); showPoi(p); });
  labelsEl.appendChild(el); p.el = el; p.w = 0; p.h = 0;
}
function poiVisible(p) { return pcatOn[p.c] && pvOn[p.v] && (!searchQ || p.n.toLowerCase().includes(searchQ)); }
const v3 = new THREE.Vector3();
function updateLabels() {
  const placed = [], visSet = new Set();
  const list = S.pois.filter(poiVisible).sort((a, b) => (PRIO[b.c] + (b.v === 'verified')) - (PRIO[a.c] + (a.v === 'verified')));
  const maxD = mode === 'explore' ? 7000 : 900;
  for (const p of list) {
    v3.set(p.x, H(p.x, p.z) + 14, p.z);
    if (v3.distanceTo(camera.position) > maxD) continue;
    v3.project(camera);
    if (v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) continue;
    const sx = (v3.x + 1) / 2 * innerWidth, sy = (1 - v3.y) / 2 * innerHeight;
    if (!p.w) { p.w = p.el.offsetWidth || 120; p.h = p.el.offsetHeight || 22; }
    const r = [sx - 8, sy - p.h, sx - 8 + p.w, sy];
    if (placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
    placed.push(r); visSet.add(p);
    p.el.style.transform = `translate(${r[0]}px, ${r[1]}px)`;
  }
  for (const p of S.pois) p.el.hidden = !visSet.has(p);
}

// ------------------------------------------------------------------ info card
const info = $('#info'), infoBody = $('#info-body');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SRC_NAME = { osm: 'OpenStreetMap', msft: 'Microsoft ML Buildings', google: 'Google Open Buildings' };
const CAT_NAME = { valriche: 'Valriche villa (inferred from location)', landmark: 'Landmark', resort: 'Resort or hotel building', village: 'Village or other building' };
let selMarker = null, infoTarget = null;
function mark(x, y, z) {
  if (!selMarker) {
    selMarker = new THREE.Mesh(new THREE.ConeGeometry(2.5, 6, 16), new THREE.MeshBasicMaterial({ color: 0xd9822b }));
    selMarker.rotation.x = Math.PI; scene.add(selMarker);
  }
  selMarker.position.set(x, y + 8, z); selMarker.visible = true;
}
function showBuilding(i) {
  const b = B[i], v = b.villa;
  const style = v ? (b.style === 'plantation' ? 'Plantation style: hipped roof, shutters, veranda (modelled)' : 'Contemporary: flat slab roof, glazing, timber screens (modelled)') : (b.r ? 'Hipped roof (modelled)' : 'Flat roof (modelled)');
  infoBody.innerHTML = `<h3>${esc(b.n || (v ? 'Valriche villa' : CAT_NAME[b.c].split(' (')[0]))}</h3>
  <dl>
    <dt>Type</dt><dd>${esc(CAT_NAME[b.c])}${b.k ? ' · tagged ' + esc(b.k) : ''}</dd>
    <dt>Design</dt><dd>${style}</dd>
    ${v ? `<dt>Plot</dt><dd>${v.b.length} footprint${v.b.length > 1 ? 's' : ''}${v.pool ? ` · pool ${v.pool[3]} × ${v.pool[4]} m (illustrative)` : ''}</dd>` : ''}
    <dt>Footprint</dt><dd>${b.a.toLocaleString('en-GB')} m²</dd>
    <dt>Storeys</dt><dd>${b.f} ${b.m ? '(mapped)' : '(estimated)'}</dd>
    <dt>Source</dt><dd>${SRC_NAME[b.s]}</dd>
    <dt>Location</dt><dd>${fmtLL(b.cx, b.cz)}</dd>
  </dl>
  <p class="note">${v ? 'Shape and position are real footprints. The facade, roof style and pool are modelled from published estate descriptions, not surveyed.' : b.s === 'osm' ? 'Traced by an OpenStreetMap volunteer.' : 'Detected by a machine-learning model from satellite imagery.'}</p>
  <div class="actions"><button id="i-drop">Drop cart here</button></div>`;
  infoTarget = { x: b.cx, z: b.cz, r: Math.sqrt(b.a) };
  info.hidden = false; mark(b.cx, b.y1 + 3, b.cz);
  $('#i-drop').onclick = dropNear;
}
const VTXT = { verified: 'Verified against an independent source', unverified: 'Not independently checked', flagged: 'Flagged: wrong, outdated or misplaced' };
function showPoi(p) {
  infoBody.innerHTML = `<h3>${esc(p.n)}</h3>
  <span class="status"><span class="dot v-${p.v}"></span>${VTXT[p.v]}</span>
  <p class="note" style="color:var(--fg)">${esc(p.note)}</p>
  <dl>
    <dt>Category</dt><dd>${esc(PCATS.find(c => c.id === p.c).label)}</dd>
    <dt>Listing confidence</dt><dd>${Math.round(p.conf * 100)}% (Overture)</dd>
    <dt>Listed by</dt><dd>${esc(p.src.join(', ') || 'Overture')}</dd>
    <dt>Location</dt><dd>${fmtLL(p.x, p.z)}</dd>
  </dl>
  <div class="actions"><button id="i-drop">Drop cart here</button></div>`;
  infoTarget = { x: p.x, z: p.z, r: 10 };
  info.hidden = false; mark(p.x, H(p.x, p.z), p.z);
  $('#i-drop').onclick = dropNear;
  if (mode === 'explore') flyTo(p.x, p.z, 380);
}
function closeInfo() { info.hidden = true; if (selMarker) selMarker.visible = false; }
$('#info-x').onclick = closeInfo;
function dropNear() {
  if (!infoTarget) return;
  const r = nearestRoad(infoTarget.x, infoTarget.z);
  const spot = r && Math.hypot(r.x - infoTarget.x, r.z - infoTarget.z) < 120 ? r : { x: infoTarget.x + infoTarget.r + 4, z: infoTarget.z, h: camYaw() };
  startDrive(spot.x, spot.z, spot.h);
}

// ------------------------------------------------------------------ camera flights
let flight = null;
function flyTo(x, z, dist = 500) {
  const t = new THREE.Vector3(x, H(x, z), z);
  const off = camera.position.clone().sub(controls.target).setLength(dist);
  if (off.y < dist * 0.35) off.y = dist * 0.55;
  flight = { t0: performance.now(), from: [camera.position.clone(), controls.target.clone()], to: [t.clone().add(off), t] };
}
const camYaw = () => Math.atan2(controls.target.x - camera.position.x, -(controls.target.z - camera.position.z));

// ------------------------------------------------------------------ picking & drop placement
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null, placing = false;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || mode !== 'explore' || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
  ray.setFromCamera(mouse, camera);
  if (placing) {
    const hit = ray.intersectObject(terrain)[0];
    if (!hit) return;
    if (hRaw(hit.point.x, hit.point.z) < 0.5) { toast('That spot is in the lagoon. Pick dry land.'); return; }
    setPlacing(false);
    startDrive(hit.point.x, hit.point.z, camYaw());
    return;
  }
  const hits = ray.intersectObjects(bMeshes.filter(o => o.mesh.visible).map(o => o.mesh));
  if (!hits.length) return;
  const h = hits[0], o = bMeshes.find(q => q.mesh === h.object);
  let lo = 0, hi = o.tri.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (o.tri[mid] <= h.faceIndex) lo = mid; else hi = mid - 1; }
  showBuilding(o.ids[lo]);
});
function setPlacing(on) {
  placing = on;
  document.body.classList.toggle('placing', on);
  $('#placeHint').hidden = !on; $('#m-drop').setAttribute('aria-pressed', on);
  if (on) {
    if (mode !== 'explore') setMode('explore');
    closeInfo();
    if (innerWidth <= 760) $('#panel').classList.add('closed');
  }
}
$('#m-drop').onclick = () => setPlacing(!placing);
$('#b-drop').onclick = () => setPlacing(true);
$('#b-cancel-drop').onclick = () => setPlacing(false);
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

// ------------------------------------------------------------------ cart
const cartCfg = {
  number: store.get('cart-number', 36),
  paint: store.get('cart-paint', 'lagoon'),
  st: store.get('cart-stickers', { stripes: true, name: true, dodo: true, flames: false, checkers: true }),
};
const paintOf = id => VR.PAINTS.find(p => p.id === id) || VR.PAINTS[1];
const cartOpts = () => ({ number: cartCfg.number, paint: paintOf(cartCfg.paint), st: cartCfg.st });
const cartModel = VR.makeFancyCart(cartOpts());
const cart = cartModel.group;
cart.scale.setScalar(1.15); cart.visible = false; scene.add(cart);
function refreshCart() {
  cartModel.apply(cartOpts());
  store.set('cart-number', cartCfg.number); store.set('cart-paint', cartCfg.paint); store.set('cart-stickers', cartCfg.st);
  $('#hud-line').innerHTML = `<b>Cart ${esc(cartCfg.number)}</b> · ${GEARS[gear].label} · top ${GEARS[gear].max} km/h`;
}

const GEARS = { estate: { label: 'Estate', max: 24, acc: 3.2 }, sport: { label: 'Sport', max: 60, acc: 6.5 }, turbo: { label: 'Turbo', max: 120, acc: 11 } };
let gear = store.get('gear', 'sport');
const car = { x: 0, z: 0, h: 0, v: 0, y: 0, vy: 0, air: false, steer: 0, steerAngle: 0, lastY: 0 };
const keys = { up: false, down: false, left: false, right: false, brake: false, boost: false };
let camMode = 'chase';

// ------------------------------------------------------------------ collision world
// Colliders: every visible building footprint plus each villa's pool terrace. The cart is three
// overlapping circles along its length; overlaps are pushed out along the wall normal, so the cart
// slides along walls instead of passing through them. Movement is sub-stepped (≤ 0.35 m per step)
// so nothing tunnels through a wall at 120 km/h.
const CELL = 24; let grid = new Map(), colliders = [];
function rebuildColliders() {
  grid = new Map(); colliders = [];
  B.forEach(b => { if (bVisible(b)) colliders.push({ p: b.r || b.p, top: b.y1 + 4.5 }); });
  if (villas && catOn.valriche) for (const p of villas.colliders) colliders.push({ p, top: 1e9 });
  colliders.forEach((c, i) => {
    const p = c.p; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); z0 = Math.min(z0, p[k + 1]); z1 = Math.max(z1, p[k + 1]); }
    for (let gx = Math.floor((x0 - 2) / CELL); gx <= Math.floor((x1 + 2) / CELL); gx++) for (let gz = Math.floor((z0 - 2) / CELL); gz <= Math.floor((z1 + 2) / CELL); gz++) {
      const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
    }
  });
}
function inPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
// push a circle (x,z,r) out of nearby colliders; returns {x,z,nx,nz,hit}
function pushOut(x, z, r, y) {
  let hit = false, nxs = 0, nzs = 0;
  for (let it = 0; it < 3; it++) {
    const l = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    if (!l) break;
    let moved = false;
    for (const ci of l) {
      const c = colliders[ci]; if (y > c.top) continue;
      const p = c.p, n = p.length / 2;
      let bd = Infinity, bx = 0, bz = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = p[j * 2], az = p[j * 2 + 1], ex = p[i * 2] - ax, ez = p[i * 2 + 1] - az, L2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
        const qx = ax + ex * t, qz = az + ez * t, d = (x - qx) ** 2 + (z - qz) ** 2;
        if (d < bd) { bd = d; bx = qx; bz = qz; }
      }
      const inside = inPoly(x, z, p), d = Math.sqrt(bd);
      if (!inside && d >= r) continue;
      let nx = (x - bx) / (d || 1), nz = (z - bz) / (d || 1);
      if (inside) { nx = -nx; nz = -nz; }
      const push = inside ? d + r : r - d;
      x += nx * push; z += nz * push; nxs += nx; nzs += nz; hit = moved = true;
    }
    if (!moved) break;
  }
  const nl = Math.hypot(nxs, nzs) || 1;
  return { x, z, nx: nxs / nl, nz: nzs / nl, hit };
}
const CART_R = 0.8, CART_OFF = [-1.15, 0, 1.15];   // circle centres along the heading (m)
function resolveCart() {
  const fx = Math.sin(car.h), fz = -Math.cos(car.h);
  let hit = null;
  for (const o of CART_OFF) {
    const cx = car.x + fx * o, cz = car.z + fz * o;
    const r = pushOut(cx, cz, CART_R, car.y);
    if (r.hit) { car.x += r.x - cx; car.z += r.z - cz; hit = r; }
  }
  return hit;
}
function groundY(x, z) { return Math.max(H(x, z), SEA + 0.4); }
function nearestRoad(x, z) {
  let best = null, bd = Infinity;
  for (const r of S.roads) {
    if (['footway', 'path', 'steps'].includes(r.c)) continue;
    for (let k = 0; k < r.p.length - 2; k += 2) {
      const ax = r.p[k], az = r.p[k + 1], bx = r.p[k + 2], bz = r.p[k + 3];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, h: Math.atan2(dx, -dz) }; }
    }
  }
  return best;
}
// ------------------------------------------------------------------ body motion
// Four wheel contacts give the chassis attitude; pitch and roll from acceleration and cornering
// ride on a damped spring so the body settles rather than snapping.
const _F = new THREE.Vector3(), _R = new THREE.Vector3(), _U = new THREE.Vector3(), _R2 = new THREE.Vector3(), _m = new THREE.Matrix4();
const body = { pitch: 0, pv: 0, roll: 0, rv: 0 };
const qBase = new THREE.Quaternion(), qLean = new THREE.Quaternion(), eLean = new THREE.Euler();
function orientCart(dt, accel, yawRate) {
  const fx = Math.sin(car.h), fz = -Math.cos(car.h), rx = Math.cos(car.h), rz = Math.sin(car.h);
  if (!car.air) {
    const WB = 1.1, TR = 0.75;
    const fl = groundY(car.x + fx * WB - rx * TR, car.z + fz * WB - rz * TR), fr = groundY(car.x + fx * WB + rx * TR, car.z + fz * WB + rz * TR);
    const bl = groundY(car.x - fx * WB - rx * TR, car.z - fz * WB - rz * TR), br = groundY(car.x - fx * WB + rx * TR, car.z - fz * WB + rz * TR);
    _F.set(fx * 2 * WB, (fl + fr - bl - br) / 2, fz * 2 * WB).normalize(); _R.set(rx * 2 * TR, (fr + br - fl - bl) / 2, rz * 2 * TR).normalize();
    car.y = Math.max(car.y, (fl + fr + bl + br) / 4);
  } else {
    _F.set(fx, Math.max(-0.5, Math.min(0.5, car.vy / Math.max(8, Math.abs(car.v)))), fz).normalize(); _R.set(rx, 0, rz);
  }
  _U.crossVectors(_R, _F).normalize(); _R2.crossVectors(_F, _U).normalize();
  _m.makeBasis(_R2, _U, _F.clone().negate());
  qBase.setFromRotationMatrix(_m);
  // spring-damped lean
  const tp = Math.max(-0.06, Math.min(0.06, -(accel || 0) * 0.008)), tr = Math.max(-0.07, Math.min(0.07, (yawRate || 0) * car.v * 0.012));
  body.pv += ((tp - body.pitch) * 60 - body.pv * 11) * dt; body.pitch += body.pv * dt;
  body.rv += ((tr - body.roll) * 60 - body.rv * 11) * dt; body.roll += body.rv * dt;
  qLean.setFromEuler(eLean.set(body.pitch, 0, body.roll));
  cart.quaternion.slerp(qBase.multiply(qLean), Math.min(1, dt * 14));
  cart.position.set(car.x, car.y + 0.04, car.z);
  for (const w of cartModel.wheels) w.rotation.x -= car.v * dt / 0.34;
  for (const f of cartModel.front) f.rotation.y = -car.steerAngle;
  return _F;
}
function cartFits(x, z, h) {
  const fx = Math.sin(h), fz = -Math.cos(h);
  return CART_OFF.every(o => !pushOut(x + fx * o, z + fz * o, CART_R, -1e9).hit) && hRaw(x, z) >= 0.5;
}
function freeSpot(x, z, h) {
  if (cartFits(x, z, h)) return [x, z];
  for (let r = 2; r <= 80; r += 2) for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (cartFits(px, pz, h)) return [px, pz];
  }
  return [x, z];
}
function startDrive(x, z, h) {
  [x, z] = freeSpot(x, z, h);
  car.x = x; car.z = z; car.h = h; car.v = 0; car.y = groundY(x, z); car.vy = 0; car.air = false; car.lastY = car.y; car.steer = 0; car.steerAngle = 0;
  cart.userData.placed = true;
  setMode('drive');
}

// tour path
const T = S.tour, Tcum = [0];
for (let k = 1; k < T.length; k++) Tcum.push(Tcum[k - 1] + Math.hypot(T[k][0] - T[k - 1][0], T[k][1] - T[k - 1][1]));
const TLEN = Tcum[Tcum.length - 1];
function tourAt(s) {
  s = ((s % TLEN) + TLEN) % TLEN;
  let lo = 0, hi = Tcum.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (Tcum[m] <= s) lo = m; else hi = m; }
  const t = (s - Tcum[lo]) / ((Tcum[hi] - Tcum[lo]) || 1);
  return [T[lo][0] + (T[hi][0] - T[lo][0]) * t, T[lo][1] + (T[hi][1] - T[lo][1]) * t];
}
let tourS = 0, tourMult = 1, tourPaused = false;
// Start of the main course: beside the Heritage Golf Club clubhouse (OSM), facing the nearest mapped
// tee. Hole numbers are not in the open data, so "nearest tee" is as precise as it gets.
const clubStart = () => {
  const club = B.find(b => b.n === 'Heritage Golf Club');
  const tees = S.landuse.filter(l => l.t === 'tee').map(l => { const r = l.r[0]; let x = 0, z = 0; for (let k = 0; k < r.length; k += 2) { x += r[k]; z += r[k + 1]; } return [x / (r.length / 2), z / (r.length / 2)]; });
  if (!club || !tees.length) { const [x, z] = tourAt(0), [x2, z2] = tourAt(6); return [x, z, Math.atan2(x2 - x, -(z2 - z))]; }
  const tee = tees.reduce((b, q) => Math.hypot(q[0] - club.cx, q[1] - club.cz) < Math.hypot(b[0] - club.cx, b[1] - club.cz) ? q : b);
  const dx = tee[0] - club.cx, dz = tee[1] - club.cz, d = Math.hypot(dx, dz) || 1;
  const off = Math.sqrt(club.a) / 2 + 9;
  return [club.cx + dx / d * off, club.cz + dz / d * off, Math.atan2(dx, -dz)];
};

// ------------------------------------------------------------------ modes
let mode = 'explore', snapCam = false;
const hud = $('#hud'), pads = $('#pads');
const touch = matchMedia('(pointer: coarse)').matches;
function setMode(m) {
  mode = m;
  document.querySelectorAll('#modes button[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  const driving = m !== 'explore';
  if (driving && placing) setPlacing(false);
  controls.enabled = !driving; cart.visible = driving || cart.userData.placed; hud.hidden = !driving;
  pads.style.display = m === 'drive' && touch ? 'flex' : 'none';
  $('#hud-bar').hidden = m !== 'tour'; $('#b-tspeed').hidden = m !== 'tour'; $('#b-pause').hidden = m !== 'tour';
  $('#keys').hidden = m !== 'drive'; $('#g-gear').hidden = m !== 'drive';
  closeInfo();
  if (m === 'drive' && !cart.userData.placed) { const [x, z, h] = clubStart(); car.x = x; car.z = z; car.h = h; car.v = 0; car.y = groundY(x, z); cart.userData.placed = true; }
  if (m === 'tour') { $('#hud-line').innerHTML = `<b>Estate tour</b> · ${(TLEN / 1000).toFixed(1)} km loop on mapped roads`; car.air = false; }
  if (m === 'drive') refreshCart();
  if (m === 'explore') flyTo(car.x || 0, car.z || -60, cart.userData.placed ? 160 : 900);
  if (driving) { snapCam = true; camHeading = car.h; renderer.domElement.focus(); }
  if (m === 'explore') camera.fov = 52, camera.updateProjectionMatrix();
  store.set('mode', m === 'tour' ? 'explore' : m);
}
document.querySelectorAll('#modes button[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#b-club').onclick = () => { const [x, z, h] = clubStart(); startDrive(x, z, h); };
$('#b-cam').onclick = () => { camMode = camMode === 'chase' ? 'driver' : 'chase'; $('#b-cam').setAttribute('aria-pressed', camMode === 'driver'); snapCam = true; };
$('#b-tspeed').onclick = () => { tourMult = { 1: 3, 3: 8, 8: 1 }[tourMult]; $('#b-tspeed').textContent = `Speed ${tourMult}×`; };
$('#b-pause').onclick = () => { tourPaused = !tourPaused; $('#b-pause').setAttribute('aria-pressed', tourPaused); $('#b-pause').textContent = tourPaused ? 'Resume' : 'Pause'; };

function gearButtons(parent) {
  for (const [id, g] of Object.entries(GEARS)) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.gear = id;
    b.textContent = `${g.label} ${g.max}`; b.title = `${g.label}: top speed ${g.max} km/h`;
    b.onclick = () => setGear(id); parent.appendChild(b);
  }
}
function setGear(id) {
  gear = id; store.set('gear', id);
  document.querySelectorAll('[data-gear]').forEach(b => b.setAttribute('aria-pressed', b.dataset.gear === id));
  refreshCart();
}
gearButtons($('#g-gear')); gearButtons($('#g-gear-panel'));

const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brake', ShiftLeft: 'boost', ShiftRight: 'boost' };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Escape' && placing) setPlacing(false);
  if (mode === 'drive' && KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (mode !== 'explore' && e.code === 'KeyC') $('#b-cam').click();
  if (mode === 'drive' && e.code === 'KeyR') { const r = nearestRoad(car.x, car.z); if (r) startDrive(r.x, r.z, r.h); }
  if (e.code === 'KeyP') setPlacing(true);
  if (mode === 'drive' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) setGear(['estate', 'sport', 'turbo'][+e.code.slice(5) - 1]);
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
pads.querySelectorAll('button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); keys[k] = true; b.classList.add('on'); b.setPointerCapture?.(e.pointerId); };
  const off = () => { keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
});

// ------------------------------------------------------------------ minimap
const minic = $('#minic'), mctx = minic.getContext('2d');
const mini = document.createElement('canvas'); mini.width = minic.width; mini.height = minic.height;
const MZ = { x0: -2400, x1: 2900, z0: -1700, z1: 1650 };
const mx = x => (x - MZ.x0) / (MZ.x1 - MZ.x0) * mini.width, mz = z => (z - MZ.z0) / (MZ.z1 - MZ.z0) * mini.height;
function drawMiniBase() {
  const c = mini.getContext('2d');
  c.drawImage(gcan, tx(MZ.x0), ty(MZ.z0), tx(MZ.x1) - tx(MZ.x0), ty(MZ.z1) - ty(MZ.z0), 0, 0, mini.width, mini.height);
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1;
  for (const r of S.roads) { if (['footway', 'path', 'steps'].includes(r.c)) continue; c.beginPath(); for (let k = 0; k < r.p.length; k += 2) (k ? c.lineTo : c.moveTo).call(c, mx(r.p[k]), mz(r.p[k + 1])); c.stroke(); }
  c.setLineDash([5, 4]); c.strokeStyle = '#f0a040'; c.lineWidth = 2; c.beginPath();
  const v = S.valriche; for (let k = 0; k < v.length; k += 2) (k ? c.lineTo : c.moveTo).call(c, mx(v[k]), mz(v[k + 1])); c.closePath(); c.stroke();
}
function drawMini() {
  mctx.drawImage(mini, 0, 0);
  const driving = mode !== 'explore';
  const f = driving ? [car.x, car.z] : [controls.target.x, controls.target.z];
  const h = driving ? car.h : camYaw();
  mctx.save(); mctx.translate(mx(f[0]), mz(f[1])); mctx.rotate(h);
  mctx.fillStyle = driving ? paintOf(cartCfg.paint).hex : '#0d6c73'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(0, -11); mctx.lineTo(7, 8); mctx.lineTo(0, 4); mctx.lineTo(-7, 8); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}
minic.addEventListener('click', e => {
  const r = minic.getBoundingClientRect();
  const x = MZ.x0 + (e.clientX - r.left) / r.width * (MZ.x1 - MZ.x0), z = MZ.z0 + (e.clientY - r.top) / r.height * (MZ.z1 - MZ.z0);
  if (mode === 'explore') { if (placing) { if (hRaw(x, z) < 0.5) return toast('That spot is in the lagoon. Pick dry land.'); setPlacing(false); startDrive(x, z, camYaw()); } else flyTo(x, z, 600); }
  else if (mode === 'drive') { if (hRaw(x, z) < 0.5) return toast('That spot is in the lagoon. Pick dry land.'); startDrive(x, z, car.h); }
  else {
    let best = 0, bd = Infinity; for (let s = 0; s < TLEN; s += 10) { const [px, pz] = tourAt(s), d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = s; } }
    tourS = best; snapCam = true;
  }
});

// ------------------------------------------------------------------ UI: filters
function checkRow(parent, id, label, sw, checked, onchange, countId) {
  const l = document.createElement('label'); l.className = 'chk';
  l.innerHTML = `<input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="sw" style="background:${sw}"></span><span>${label}</span><span class="n" id="${countId || ''}"></span>`;
  l.querySelector('input').addEventListener('change', e => onchange(e.target.checked));
  parent.appendChild(l);
}
for (const c of CATS) checkRow($('#g-cat'), 'f-cat-' + c.id, c.label, c.roof, true, v => { catOn[c.id] = v; applyBuildingFilters(); }, 'n-cat-' + c.id);
for (const s of SRCS) checkRow($('#g-src'), 'f-src-' + s.id, s.label, { osm: '#7a9e7e', msft: '#6b88b5', google: '#c49a5a' }[s.id], true, v => { srcOn[s.id] = v; applyBuildingFilters(); }, 'n-src-' + s.id);
for (const L of LAYERS) checkRow($('#g-layers'), 'f-l-' + L.id, L.label, L.sw, layerOn[L.id], v => {
  layerOn[L.id] = v; store.set('layer-' + L.id, v);
  if (L.id === 'roads') roadMesh.visible = v;
  else if (L.id === 'trees') trees.setVisible(v);
  else if (L.id === 'clouds') atmo.setCloudsVisible(v);
  else if (L.id === 'people') { golfers.group.visible = v; kiters.group.visible = v; }
  else if (L.id === 'pools') villas.water.visible = v && catOn.valriche;
  else { drawGround(); if (L.id === 'golf') flags.visible = v; drawMiniBase(); }
});
function chipGroup(parent, items, isOn, toggle) {
  for (const it of items) {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button';
    b.innerHTML = (it.dot ? `<span class="dot ${it.dot}"></span>` : '') + it.label;
    b.setAttribute('aria-pressed', isOn(it.id));
    b.onclick = () => { toggle(it.id); parent.querySelectorAll('.chip').forEach((q, k) => q.setAttribute('aria-pressed', isOn(items[k].id))); };
    parent.appendChild(b);
  }
}
chipGroup($('#g-floor'), [{ id: 'all', label: 'All' }, { id: '1', label: 'Single storey' }, { id: '2', label: 'Two or more' }], id => floorSel === id, id => { floorSel = id; applyBuildingFilters(); });
chipGroup($('#g-pcat'), PCATS, id => pcatOn[id], id => { pcatOn[id] = !pcatOn[id]; renderPlaces(); });
chipGroup($('#g-pv'), PV.map(v => ({ ...v, dot: 'v-' + v.id })), id => pvOn[id], id => { pvOn[id] = !pvOn[id]; renderPlaces(); });
chipGroup($('#g-stick'), VR.STICKERS, id => !!cartCfg.st[id], id => { cartCfg.st = { ...cartCfg.st, [id]: !cartCfg.st[id] }; refreshCart(); });
for (const p of VR.PAINTS) {
  const b = document.createElement('button'); b.type = 'button'; b.style.background = p.hex; b.title = p.label; b.setAttribute('aria-label', p.label);
  b.setAttribute('aria-pressed', p.id === cartCfg.paint);
  b.onclick = () => { cartCfg.paint = p.id; $('#g-paint').querySelectorAll('button').forEach(q => q.setAttribute('aria-pressed', q === b)); refreshCart(); };
  $('#g-paint').appendChild(b);
}
$('#numIn').value = cartCfg.number;
$('#numIn').addEventListener('input', e => {
  const n = Math.max(0, Math.min(999, Math.floor(+e.target.value || 0)));
  cartCfg.number = n; refreshCart();
});
$('#f-dim').onchange = applyBuildingFilters;
$('#f-zone').onchange = e => { zoneLine.visible = e.target.checked; };
$('#search').addEventListener('input', e => { searchQ = e.target.value.trim().toLowerCase(); renderPlaces(); });
let exTimer = 0;
$('#f-ex').addEventListener('input', e => {
  EX = +e.target.value; $('#f-ex-v').textContent = EX + '×';
  clearTimeout(exTimer); exTimer = setTimeout(rebuildHeights, 150);
});
function rebuildHeights() { updateTerrain(); buildRoads(); buildZone(); buildBuildings(); buildTrees(); buildFlags(); buildPeople(); applyWeather(); if (mode === 'drive') car.y = groundY(car.x, car.z); }

function renderPlaces() {
  const ul = $('#plist'); ul.innerHTML = '';
  const list = S.pois.filter(poiVisible).sort((a, b) => (PRIO[b.c] - PRIO[a.c]) || a.n.localeCompare(b.n));
  for (const p of list) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.innerHTML = `<span class="dot v-${p.v}"></span><span>${esc(p.n)}</span><span class="cat">${esc(PCATS.find(c => c.id === p.c).label)}</span>`;
    b.onclick = () => { if (mode !== 'explore') setMode('explore'); showPoi(p); if (innerWidth <= 760) $('#panel').classList.add('closed'); };
    li.appendChild(b); ul.appendChild(li);
  }
  if (!list.length) ul.innerHTML = '<li class="note">No places match. Switch on more categories or clear the search.</li>';
  $('#st-poi').textContent = list.length;
}
document.querySelectorAll('.tabs button').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(q => q.setAttribute('aria-selected', q === t));
  document.querySelectorAll('.tabpane').forEach(p => p.hidden = p.dataset.pane !== t.dataset.tab);
});
$('#panelToggle').onclick = () => $('#panel').classList.toggle('closed');
if (innerWidth > 760) $('#panel').classList.remove('closed');

// ------------------------------------------------------------------ facts & sources
const FACTS = [
  ['verified', 'Heritage Villas Valriche is planned at <b>288 villas</b>. About <b>170</b> were sold and completed by 2022.', 'Pam Golding Properties via BusinessTech, 2022', 'https://businesstech.co.za/news/property/550710/mauritius-enjoying-renewed-interest-from-south-african-buyers/'],
  ['verified', 'Villas come in <b>over 30 plantation-style designs</b>, single and double storey. A newer contemporary collection by Greg Scott + Partners (Glow, Bliss, Pure) uses big glazing and <b>timber screens</b>.', 'Pam Golding; Aspire Lifestyle', 'https://www.pamgolding.co.za/news-insights/a-designer-home-of-your-dreams-in-mauritius'],
  ['verified', 'Each villa has a <b>private pool</b> with a terrace, timber decking and pergola, per developer and agent listings. Pool positions are not published, so the model places them on the downhill side.', 'Real Estate Mauritius (Valriche by YOO); Sotheby\'s listings', 'https://real-estate-mauritius.mu/en/new-program-mauritius/villa-valriche-yoo-luxury-pds-villas-bel-ombre-mauritius/'],
  ['verified', 'Serviced plots run from <b>613 to 2,207 m²</b>.', 'Pam Golding development page', 'https://www.pamgolding.co.za/property-development/tamarin/heritage-villas-valriche'],
  ['verified', 'Le Château course: <b>18 holes, par 72</b>, by Peter Matkovich, opened 2004. <b>La Réserve Golf Links</b> (Oosthuizen and Matkovich) opened in December 2023. Both are visible in the Sentinel-2 imagery.', 'Where2Golf; Heritage Golf Club', 'https://heritagegolfclub.mu/news/la-reserve-golf-links-officially-opens-for-play/'],
  ['verified', 'Botanist <b>Charles Telfair</b> bought Bel Ombre in 1816 (one biography says 1815).', 'Belombrepedia; RSAS Mauritius', 'https://belombrepedia.belombre.com/en/node/49'],
  ['verified', 'The Outrigger was the Voile d\'Or (2004), then the Mövenpick (2006), and has been Outrigger since 2013.', 'Hospitality Net', 'https://www.hospitalitynet.org/news/4060892.html'],
  ['verified', 'Bel Ombre\'s lagoon is a <b>kitesurf spot</b> that works best in south to south-east winds. The season runs roughly May to November. The kitesurfers ride at the spot listed in Overture and fly their kites downwind of the live wind.', 'GKA Kite World Tour; Kitejungle', 'https://gkakiteworldtour.com/get-to-know-the-spot-of-bel-ombre-in-mauritius'],
  ['unverified', 'Villas are said to come with a <b>private 4-seater golf cart</b>. This comes from resale listings only.', 'Michael Zingraf listing', 'https://michaelzingraf.com/en/mauritius-villa-on-golf-estate-bel-ombre-84018962'],
  ['flagged', 'The <b>Château\'s construction date</b> is disputed (1760s vs 19th century), so it is left out.', 'Mautourco; Belombrepedia', 'https://belombrepedia.belombre.com/en/node/60'],
];
$('#facts').innerHTML = FACTS.map(([v, t, s, u]) => `<li><span class="dot v-${v}"></span><span>${t}<small><a href="${u}" target="_blank" rel="noopener">${s}</a></small></span></li>`).join('');
const nS = c => B.filter(b => b.s === c).length.toLocaleString('en-GB');
const scenes = (M.sentinel || []).map(s => s.datetime.slice(0, 10)).sort();
$('#sources').innerHTML = [
  ['Satellite imagery', `Copernicus Sentinel-2 L2A, 10 m. Cloud-free median of ${scenes.length} passes (${scenes[0]} to ${scenes[scenes.length - 1]}). Contains modified Copernicus Sentinel data.`, 'https://registry.opendata.aws/sentinel-2-l2a-cogs/'],
  ['Trees', `${(S.trees.length / 3).toLocaleString('en-GB')} trees placed on ESA WorldCover 2021 tree cover (10 m), plus OSM single trees. Species mix is illustrative: palms and filao on the coast, broadleaf forest inland. © ESA WorldCover project, CC BY 4.0.`, 'https://esa-worldcover.org/'],
  ['Buildings', `Overture Maps ${M.overture_release}: ${nS('osm')} OpenStreetMap, ${nS('msft')} Microsoft ML and ${nS('google')} Google Open Buildings footprints (ODbL / CC BY 4.0).`, 'https://docs.overturemaps.org/'],
  ['Roads, golf course, beaches & land use', 'OpenStreetMap via Overture. © OpenStreetMap contributors, ODbL.', 'https://www.openstreetmap.org/copyright'],
  ['Weather', 'Live current conditions for Belle Ombre (AccuWeather location 1122815) through the viewer\'s AccuWeather connector, refreshed every 15 minutes: cloud cover and cloud base, wind and gusts, visibility, rain, temperature. The sun position comes from a standard solar-position formula for 20.5°S, 57.4°E at Mauritius time (UTC+4).', 'https://www.accuweather.com/'],
  ['Places', `Overture Places (Meta, Microsoft), CDLA-Permissive-2.0. ${S.pois.filter(p => p.v === 'verified').length} pins checked against independent sources, ${S.pois.filter(p => p.v === 'flagged').length} flagged as wrong or outdated.`, 'https://docs.overturemaps.org/guides/places/'],
  ['Terrain', `${M.dem}, 30 m grid. © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the EU and ESA.`, 'https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model'],
].map(([h, t, u]) => `<li><span class="dot" style="background:var(--accent)"></span><span><b>${h}.</b> ${t}<small><a href="${u}" target="_blank" rel="noopener">${u.replace('https://', '')}</a></small></span></li>`).join('');
$('#limits').innerHTML = [
  'Villa facades, roof styles and pools are modelled from published descriptions. Shapes and positions are real footprints, but no villa is a survey of the real house.',
  'Sentinel-2 imagery is 10 m per pixel: it shows the golf course, lagoon and reef faithfully, but not individual villas or pools.',
  'The estate boundary is not open data. The orange outline is traced around the villa clusters.',
  'Building heights are estimated (villas 1–2 storeys, per listings).',
  'Tree positions follow mapped tree cover; individual species and sizes are illustrative.',
  'Golfers and kitesurfers are illustrative: they sit on mapped tees, greens and the listed kite spot, but they are not tracked people.',
  'Lambrequins (the scalloped eave trim of Mauritian Creole houses) and gardens are design touches, not surveyed details of each villa.',
  'The elevation is a surface model, so forest canopy slightly lifts the ground.',
].map(t => `<li><span class="dot v-unverified"></span><span>${t}</span></li>`).join('');

// ------------------------------------------------------------------ weather, sun & people
let golfers = null, kiters = null;
function buildPeople() {
  if (golfers) scene.remove(golfers.group);
  if (kiters) scene.remove(kiters.group);
  golfers = VR.buildGolfers(scene, S, H); kiters = VR.buildKiters(scene, S, hRaw);
  golfers.group.visible = kiters.group.visible = layerOn.people;
}
let wxMode = store.get('wx-mode', 'live'), liveW = null, timeLive = true, timeH = VR.mauritiusNow().hours, wxStatus = { kind: 'loading' }, live = null;
const headlight = new THREE.SpotLight(0xfff4d6, 0, 70, 0.55, 0.5, 1.2);
headlight.position.set(0, 1.0, -1.6); cart.add(headlight); headlight.target.position.set(0, 0, -20); cart.add(headlight.target);
function currentWeather() { return wxMode === 'live' ? (liveW || VR.WEATHER_PRESETS.partly) : VR.WEATHER_PRESETS[wxMode]; }
function currentDate() { return timeLive ? new Date() : VR.dateAtLocalHours(timeH); }
function applyWeather() {
  if (!villas) return;   // called again once the scene is built
  const w = currentWeather();
  atmo.apply(w, currentDate());
  const night = atmo.state.night;
  villas.setNight(night);
  headlight.intensity = night > 0.4 ? 2.2 : 0;
  sea.mesh.material.uniforms.sunDir.value.copy(atmo.state.sunDir);
  sea.mesh.material.uniforms.light.value = 1 - night * 0.85;
  renderWeather();
}
const fmtClock = h => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
function renderWeather() {
  const w = currentWeather(), st = $('#wx-status');
  const el = atmo.state.sunEl * 180 / Math.PI;
  const DIRN = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const dir = DIRN[Math.round(((w.windFrom % 360) + 360) % 360 / 22.5) % 16];
  $('#wx-read').innerHTML = [
    w.tempC != null ? `<b>${Math.round(w.tempC)} °C</b>` : '', esc(w.phrase || ''),
    `Wind ${dir} ${Math.round(w.windKmh)} km/h${w.gustKmh ? `, gusts ${Math.round(w.gustKmh)}` : ''}`,
    `Cloud ${Math.round(w.cloud * 100)}%${w.ceilingM ? `, base ${Math.round(w.ceilingM)} m` : ''}`,
    w.visibilityKm ? `Visibility ${w.visibilityKm} km` : '', w.rain ? 'Rain' : '',
    `Sun ${el > 0 ? Math.round(el) + '° up' : 'below the horizon'}`,
  ].filter(Boolean).map(t => `<span>${t}</span>`).join('');
  const usingLive = wxMode === 'live';
  let msg = '', btn = false;
  if (!usingLive) msg = 'Preset weather. Pick Live to use AccuWeather.';
  else switch (wxStatus.kind) {
    case 'live': msg = `Live from AccuWeather, Belle Ombre. Reading taken ${new Date(wxStatus.storedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`; break;
    case 'loading': msg = 'Asking AccuWeather for the current conditions…'; break;
    case 'unavailable': msg = 'Live weather works when this page is open in Claude with the AccuWeather connector. Showing "partly cloudy" until then.'; break;
    default: {
      const c = wxStatus.code;
      msg = c === 'needs_reauth' ? 'Reconnect AccuWeather in claude.ai Settings → Connectors to see live weather.'
        : c === 'server_not_connected' ? 'Add AccuWeather in claude.ai Settings → Connectors to see live weather.'
        : c === 'approval_required' ? 'Live weather needs your OK to use AccuWeather.'
        : c === 'not_in_manifest' ? 'Live weather is switched off for this page.'
        : c === 'blocked_by_policy' ? 'Your organisation blocks AccuWeather here.'
        : 'AccuWeather did not answer. Showing the last reading or a preset.';
      btn = c === 'approval_required';
    }
  }
  st.textContent = msg; $('#wx-allow').hidden = !btn;
  $('#wx-clock').textContent = fmtClock(timeLive ? VR.mauritiusNow().hours : timeH) + ' Mauritius time' + (timeLive ? ' (now)' : '');
}
function onLiveStatus(s) {
  wxStatus = s;
  if (s.kind === 'error' && ['needs_reauth', 'server_not_connected', 'blocked_by_policy', 'approval_required', 'not_in_manifest'].includes(s.code)) liveW = null;
  applyWeather();
}
VR.startLiveWeather(w => { liveW = w; }, onLiveStatus).then(h => { live = h; });
const WX_MODES = [{ id: 'live', label: 'Live' }, { id: 'clear', label: 'Clear' }, { id: 'partly', label: 'Partly cloudy' }, { id: 'cloudy', label: 'Cloudy' }, { id: 'showers', label: 'Showers' }];
chipGroup($('#g-wx'), WX_MODES, id => wxMode === id, id => { wxMode = id; store.set('wx-mode', id); applyWeather(); });
$('#wx-time').value = timeH;
$('#wx-time').addEventListener('input', e => { timeLive = false; timeH = +e.target.value; $('#wx-now').setAttribute('aria-pressed', 'false'); applyWeather(); });
$('#wx-now').onclick = () => { timeLive = true; timeH = VR.mauritiusNow().hours; $('#wx-time').value = timeH; $('#wx-now').setAttribute('aria-pressed', 'true'); applyWeather(); };
$('#wx-allow').onclick = () => live && live.retry();
$('#b-sound').onclick = toggleSound;
setInterval(() => { if (timeLive) applyWeather(); }, 30000);

// ------------------------------------------------------------------ speedometer
const gauge = $('#gauge'), gctx2 = gauge.getContext('2d');
function drawGauge(kmh, max) {
  const g = gctx2, W = gauge.width, Hh = gauge.height, cx = W / 2, cy = Hh * 0.56, R = W * 0.42;
  g.clearRect(0, 0, W, Hh);
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, frac = Math.min(1, kmh / max);
  g.lineCap = 'round';
  g.lineWidth = W * 0.06; g.strokeStyle = 'rgba(128,140,136,.28)'; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  g.strokeStyle = frac > 0.9 ? '#c8322a' : '#c9a23a'; g.beginPath(); g.arc(cx, cy, R, a0, a0 + (a1 - a0) * frac); g.stroke();
  g.fillStyle = getComputedStyle(gauge).color; g.textAlign = 'center';
  g.font = `600 ${W * 0.26}px "JetBrains Mono", monospace`; g.fillText(Math.round(kmh), cx, cy + W * 0.08);
  g.font = `500 ${W * 0.09}px "Instrument Sans", sans-serif`; g.fillText('km/h', cx, cy + W * 0.22);
  for (let i = 0; i <= 4; i++) { const a = a0 + (a1 - a0) * i / 4; g.fillText(Math.round(max * i / 4), cx + Math.cos(a) * R * 0.68, cy + Math.sin(a) * R * 0.68 + 4); }
}

// ------------------------------------------------------------------ sound (electric motor hum + tyre/wind noise)
let audio = null;
function toggleSound() {
  if (audio) { audio.ctx.close(); audio = null; $('#b-sound').setAttribute('aria-pressed', 'false'); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const motor = ctx.createOscillator(); motor.type = 'sawtooth';
  const mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 900;
  const mg = ctx.createGain(); mg.gain.value = 0;
  motor.connect(mf).connect(mg).connect(ctx.destination); motor.start();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const nz = ctx.createBufferSource(); nz.buffer = buf; nz.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500;
  const ng = ctx.createGain(); ng.gain.value = 0;
  nz.connect(nf).connect(ng).connect(ctx.destination); nz.start();
  audio = { ctx, motor, mg, ng, nf };
  $('#b-sound').setAttribute('aria-pressed', 'true');
}
function updateSound(v, throttle) {
  if (!audio) return;
  const s = Math.abs(v), t = audio.ctx.currentTime, on = mode !== 'explore';
  audio.motor.frequency.setTargetAtTime(70 + s * 14, t, 0.08);
  audio.mg.gain.setTargetAtTime(on ? 0.02 + throttle * 0.05 + Math.min(0.05, s * 0.002) : 0, t, 0.1);
  audio.ng.gain.setTargetAtTime(on ? Math.min(0.12, s * 0.004) : 0, t, 0.15);
  audio.nf.frequency.setTargetAtTime(300 + s * 25, t, 0.2);
}

// ------------------------------------------------------------------ build & loop
drawGround(); updateTerrain(); buildRoads(); buildZone(); buildBuildings(); buildTrees(); buildFlags(); buildPeople(); renderPlaces(); drawMiniBase();
atmo.setCloudsVisible(layerOn.clouds);
setGear(gear);
applyWeather();

let last = performance.now(), nearT = 0, shake = 0, camHeading = 0;
const camTarget = new THREE.Vector3();
function nearPoi() {
  let best = null, bd = 160;
  for (const p of S.pois) { if (p.v === 'flagged') continue; const d = Math.hypot(p.x - car.x, p.z - car.z); if (d < bd && PRIO[p.c] >= 2) { bd = d; best = p; } }
  return best;
}
function vertical(dt) {
  const g = groundY(car.x, car.z);
  if (car.air) {
    car.vy -= 9.81 * 1.5 * dt; car.y += car.vy * dt;
    if (car.y <= g) { if (car.vy < -6) shake = Math.min(1, -car.vy / 14); car.y = g; car.air = false; car.vy = 0; }
  } else {
    const climb = (g - car.lastY) / Math.max(dt, 1e-3);
    if (car.y + car.vy * dt > g + 0.35 && Math.abs(car.v) > 9) { car.air = true; car.y += car.vy * dt; }
    else { car.y = g; car.vy = climb; }
  }
  car.lastY = g;
}
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  if (flight) {
    const k = Math.min(1, (now - flight.t0) / 1100), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    camera.position.lerpVectors(flight.from[0], flight.to[0], e); controls.target.lerpVectors(flight.from[1], flight.to[1], e);
    if (k >= 1) flight = null;
  }
  let throttle = 0;
  if (mode === 'drive') {
    const G = GEARS[gear], vmax = G.max / 3.6 * (keys.boost ? 1.25 : 1), acc = G.acc * (keys.boost ? 1.35 : 1);
    const v = car.v;
    let a;
    if (keys.up) { a = v < -0.3 ? 10 : acc * Math.max(0.12, 1 - (Math.max(0, v) / vmax) ** 2); throttle = 1; }
    else if (keys.down) a = v > 0.3 ? -11 : -2.6 * Math.max(0, 1 + v / REVV);
    else a = -Math.sign(v) * Math.min(Math.abs(v) / dt, 0.7 + 0.01 * v * v);
    if (keys.brake) a = -Math.sign(v) * Math.min(Math.abs(v) / dt, 15);
    const fx = Math.sin(car.h), fz = -Math.cos(car.h);
    if (!car.air) {
      const slope = (hRaw(car.x + fx * 2, car.z + fz * 2) - hRaw(car.x - fx * 2, car.z - fz * 2)) / 4;
      a -= 9.81 * Math.max(-0.3, Math.min(0.3, slope)) * 0.5;
      car.v = Math.max(-REVV, Math.min(Math.max(vmax, v - 8 * dt), v + a * dt));
    }
    // bicycle-model steering: the lock narrows as speed rises
    const want = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    car.steer += (want - car.steer) * Math.min(1, dt * (want ? 5 : 8));
    car.steerAngle = car.steer * 0.6 / (1 + Math.abs(car.v) / 10);
    const yawRate = car.air ? 0 : car.v * Math.tan(car.steerAngle) / 2.3;
    car.h += yawRate * dt;
    // sub-stepped move with collision response
    const dist = car.v * dt, steps = Math.max(1, Math.ceil(Math.abs(dist) / 0.35));
    let hit = null, sea = false;
    for (let s = 0; s < steps; s++) {
      const sx = Math.sin(car.h), sz = -Math.cos(car.h), sg = Math.sign(dist) || 1;
      const nx = car.x + sx * dist / steps, nz = car.z + sz * dist / steps;
      if (hRaw(nx + sx * 1.6 * sg, nz + sz * 1.6 * sg) < 0.5) { sea = true; break; }
      const px = car.x, pz = car.z;
      car.x = nx; car.z = nz;
      const r = resolveCart(); if (r) hit = r;
      if (insideCollider(car.x, car.z, car.y)) { car.x = px; car.z = pz; car.v *= 0.3; break; }
    }
    if (sea) { car.v *= 0.2; $('#hud-near').textContent = 'That is the lagoon. Carts do not float.'; nearT = now + 2000; }
    if (hit) {
      const d = Math.sin(car.h) * hit.nx - Math.cos(car.h) * hit.nz, into = -d * Math.sign(car.v || 1);
      if (into > 0) {
        const impact = Math.abs(car.v) * into;
        car.v *= Math.max(0, 1 - into * 1.05);                 // keep the along-wall share: slide
        if (impact > 7) { shake = Math.min(1, impact / 20); $('#hud-near').textContent = impact > 18 ? 'Ouch. That wall is not on the tour.' : 'Scraped a wall.'; nearT = now + 1800; }
      }
    }
    vertical(dt);
    const F = orientCart(dt, a, yawRate);
    chaseCam(F, dt);
  } else if (mode === 'tour') {
    if (!tourPaused) tourS += 24 / 3.6 * tourMult * dt;
    const [x, z] = tourAt(tourS), [ax, az] = tourAt(tourS + 8);
    let dh = Math.atan2(ax - x, -(az - z)) - car.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const yawRate = dh * Math.min(1, dt * 5) / Math.max(dt, 1e-3);
    car.h += dh * Math.min(1, dt * 5); car.steerAngle = Math.max(-0.5, Math.min(0.5, dh * 2));
    car.x = x; car.z = z; car.y = groundY(x, z); car.v = tourPaused ? 0 : 24 / 3.6 * tourMult; car.air = false;
    $('#hud-prog').style.width = ((tourS % TLEN) / TLEN * 100).toFixed(1) + '%';
    const F = orientCart(dt, 0, yawRate);
    chaseCam(F, dt);
  } else {
    controls.update();
    if (cart.userData.placed) orientCart(dt, 0, 0);
  }
  if (mode !== 'explore') {
    drawGauge(Math.abs(car.v) * 3.6, mode === 'tour' ? 24 * tourMult : GEARS[gear].max);
    if (now > nearT) { const p = nearPoi(); $('#hud-near').innerHTML = p ? `Passing <b>${esc(p.n)}</b>` : car.air ? '<b>Airborne!</b>' : 'On the estate'; nearT = now + 400; }
  }
  updateSound(car.v, throttle);
  // shadows follow the area being looked at, from the real sun direction
  const focus = mode === 'explore' ? controls.target : cart.position;
  sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(atmo.state.sunDir, 1200);
  const camDist = camera.position.distanceTo(focus);
  const sh = Math.max(80, Math.min(700, camDist * 0.8));
  if (sun.shadow.camera.right !== sh) { Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh }); sun.shadow.camera.updateProjectionMatrix(); }
  camera.near = mode === 'explore' ? Math.max(0.5, camDist / 400) : 0.25; camera.updateProjectionMatrix();
  sky.update(camera); sea.update(t); atmo.update(dt, camera);
  trees && trees.update(t); villas.poolMat.uniforms.time.value = t;
  if (golfers && golfers.group.visible) golfers.update(t, dt, H);
  if (kiters && kiters.group.visible) kiters.update(t, atmo.state.windVec, currentWeather().windKmh);
  if (selMarker && selMarker.visible) selMarker.rotation.y += dt * 2;
  renderer.render(scene, camera);
  updateLabels(); drawMini();
  requestAnimationFrame(tick);
}
const REVV = 12 / 3.6;
function insideCollider(x, z, y) {
  const l = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (l) for (const ci of l) { const c = colliders[ci]; if (y < c.top && inPoly(x, z, c.p)) return true; }
  return false;
}
function chaseCam(F, dt) {
  const pos = cart.position, spd = Math.abs(car.v);
  let want, look;
  let dh = car.h - camHeading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  camHeading += dh * (snapCam ? 1 : Math.min(1, dt * 3.2));
  if (camMode === 'chase') {
    const back = 7.5 + spd * 0.13, up = 2.7 + spd * 0.03;
    want = new THREE.Vector3(pos.x - Math.sin(camHeading) * back, pos.y + up, pos.z + Math.cos(camHeading) * back);
    // never park the camera inside a house: pull it in along the boom
    for (let k = 0.3; k <= 1.0001; k += 0.1) {
      const p = pos.clone().lerp(want, k);
      if (insideCollider(p.x, p.z, p.y - 1)) { want = pos.clone().lerp(want, Math.max(0.25, k - 0.12)); want.y += 1.5; break; }
    }
    want.y = Math.max(want.y, H(want.x, want.z) + 1.8);
    look = new THREE.Vector3(pos.x + Math.sin(car.h) * 5, pos.y + 1.3, pos.z - Math.cos(car.h) * 5);
  } else {
    want = pos.clone().add(new THREE.Vector3(0, 2.15, 0)).addScaledVector(F, 0.15);
    look = want.clone().addScaledVector(F, 20); look.y -= 1.0;
  }
  const k = snapCam ? 1 : 1 - Math.exp(-dt * (camMode === 'chase' ? 6 : 18));
  camera.position.lerp(want, k); camTarget.lerp(look, k); if (snapCam) camTarget.copy(look);
  if (shake > 0.01) { camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.y += (Math.random() - 0.5) * shake * 0.4; shake *= Math.exp(-dt * 6); }
  camera.lookAt(camTarget); snapCam = false;
  const fov = 55 + Math.min(25, spd * 0.5);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  controls.target.copy(pos);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); for (const p of S.pois) p.w = 0; });

let startMode = store.get('mode', 'explore');
if (location.hash === '#tour' || location.hash === '#drive') startMode = location.hash.slice(1);
loading.remove();
setMode(startMode === 'drive' ? 'explore' : startMode);
flight = null;
requestAnimationFrame(tick);
window.__valriche = { setMode, startDrive, S, car, keys, scene, setGear, cartCfg, refreshCart, camera, controls, cart, H, setTime: h => { timeLive = h == null; if (h != null) timeH = h; applyWeather(); }, setWx: m => { wxMode = m; applyWeather(); }, atmo, insideCollider: (x, z) => insideCollider(x, z, -1e9), clubStart, golfers: () => golfers, kiters: () => kiters, focus: (x, y, z, dx, dy, dz) => { controls.target.set(x, y, z); camera.position.set(x + dx, y + dy, z + dz); controls.update(); } };
})();
