// A customisable luxury golf cart: paint, race number and stickers drawn on canvas decals.
(function () {
'use strict';
const VR = window.VR = window.VR || {};

VR.PAINTS = [
  { id: 'pearl', label: 'Pearl white', hex: '#f3f0e8', stripe: '#0d6c73', accent: '#c9a23a', roof: '#1d2226' },
  { id: 'lagoon', label: 'Lagoon', hex: '#0f8a96', stripe: '#f6f2e6', accent: '#f2c14e', roof: '#f3f0e8' },
  { id: 'flamboyant', label: 'Flamboyant red', hex: '#c8322a', stripe: '#f6f2e6', accent: '#1c2430', roof: '#f3f0e8' },
  { id: 'midnight', label: 'Midnight', hex: '#1c2430', stripe: '#f2c14e', accent: '#e8e4da', roof: '#e8e4da' },
  { id: 'cane', label: 'Cane gold', hex: '#c9a23a', stripe: '#1c2430', accent: '#f6f2e6', roof: '#1c2430' },
  { id: 'palm', label: 'Palm green', hex: '#2f7a4b', stripe: '#f6f2e6', accent: '#f2c14e', roof: '#f3f0e8' },
];
VR.STICKERS = [
  { id: 'stripes', label: 'Racing stripes' }, { id: 'name', label: 'VALRICHE lettering' },
  { id: 'dodo', label: 'Dodo' }, { id: 'flames', label: 'Flames' }, { id: 'checkers', label: 'Chequered flag' },
];

// ---------------------------------------------------------------- canvas artwork
function roundel(g, x, y, r, num, ring) {
  g.save();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = r * 0.12; g.strokeStyle = ring; g.stroke();
  g.fillStyle = '#121417';
  const s = String(num);
  g.font = `900 ${r * (s.length > 2 ? 0.95 : 1.25)}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(s, x, y + r * 0.06);
  g.restore();
}
function dodo(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#1c2430'; g.stroke();
  // legs
  g.strokeStyle = '#e0a52a'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(-6, 22); g.lineTo(-8, 38); g.moveTo(8, 22); g.lineTo(10, 38); g.stroke();
  // body
  g.fillStyle = '#7d8a95'; g.beginPath(); g.ellipse(2, 6, 26, 20, 0, 0, Math.PI * 2); g.fill();
  // tail tuft
  g.fillStyle = '#e9e3d4'; g.beginPath(); g.moveTo(26, -2); g.quadraticCurveTo(40, -12, 34, 6); g.quadraticCurveTo(36, 14, 26, 10); g.fill();
  // wing
  g.fillStyle = '#5f6b75'; g.beginPath(); g.ellipse(8, 6, 11, 7, -0.4, 0, Math.PI * 2); g.fill();
  // neck + head
  g.fillStyle = '#8b98a2'; g.beginPath(); g.ellipse(-16, -14, 11, 14, 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(-22, -26, 10, 0, Math.PI * 2); g.fill();
  // beak
  g.fillStyle = '#d9b44a'; g.beginPath(); g.moveTo(-28, -30); g.quadraticCurveTo(-46, -30, -44, -18); g.quadraticCurveTo(-40, -22, -30, -20); g.fill();
  g.fillStyle = '#1c2430'; g.beginPath(); g.arc(-44, -19, 3, 0, Math.PI * 2); g.fill();
  // eye
  g.beginPath(); g.arc(-24, -29, 2.4, 0, Math.PI * 2); g.fill();
  g.restore();
}
function flames(g, x0, y0, w, h, dir) {
  const cols = ['#c8322a', '#ef7d22', '#f2c14e'];
  cols.forEach((c, k) => {
    g.fillStyle = c; g.beginPath();
    const sh = k * 0.18;
    g.moveTo(x0, y0 + h * (0.15 + sh * 0.5));
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 5, x = x0 + dir * w * t * (1 - sh * 0.7);
      g.quadraticCurveTo(x - dir * w * 0.12, y0 + h * (0.1 + sh * 0.5 + (i % 2) * 0.25), x, y0 + h * (0.25 + (i % 2 ? 0.25 : 0) + sh * 0.4));
    }
    g.lineTo(x0 + dir * w * (0.9 - sh * 0.7), y0 + h * (0.85 - sh * 0.3));
    for (let i = 4; i >= 0; i--) {
      const t = i / 5, x = x0 + dir * w * t * (1 - sh * 0.7);
      g.quadraticCurveTo(x + dir * w * 0.1, y0 + h * (0.95 - sh * 0.4 - (i % 2) * 0.2), x, y0 + h * (0.8 - sh * 0.4));
    }
    g.closePath(); g.fill();
  });
}
function checkers(g, x, y, w, h, n) {
  const s = h / n;
  for (let i = 0; i * s < w; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(x + i * s, y + j * s, s, s); }
}

// side art: canvas 2048 x 1024; top half = left side, bottom half = right side (mirrored layout).
// Horizontal: 0..2048 maps body z -1.5..+1.5 (left side; front at left). Vertical: v 0.25..1.15 m.
function sideArt(opt) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d'), P = opt.paint;
  const zx = (z, mirror) => mirror ? (1 - (z + 1.5) / 3) * 2048 : (z + 1.5) / 3 * 2048;
  const vy = (v, half) => half * 512 + (1 - (v - 0.25) / 0.9) * 512;
  for (const [half, mirror] of [[0, false], [1, true]]) {
    g.fillStyle = P.hex; g.fillRect(0, half * 512, 2048, 512);
    // subtle panel shading
    const grd = g.createLinearGradient(0, half * 512, 0, half * 512 + 512);
    grd.addColorStop(0, 'rgba(255,255,255,0.18)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grd; g.fillRect(0, half * 512, 2048, 512);
    const X = z => zx(z, mirror), Y = v => vy(v, half);
    if (opt.st.stripes) {
      g.fillStyle = P.stripe; g.fillRect(0, Y(0.47), 2048, Y(0.40) - Y(0.47));
      g.fillStyle = P.accent; g.fillRect(0, Y(0.38), 2048, Y(0.355) - Y(0.38));
      g.fillStyle = P.stripe; g.fillRect(0, Y(1.06), 2048, Y(1.02) - Y(1.06));
    }
    if (opt.st.flames) {
      const x0 = X(-1.45), w = Math.abs(X(-0.75) - x0);
      flames(g, x0, Y(1.0), w, Y(0.8) - Y(1.0), mirror ? -1 : 1);
    }
    if (opt.st.checkers) {
      const a = X(1.0), b = X(1.42);
      const a2 = X(1.2), b2 = X(1.46);
      checkers(g, Math.min(a2, b2), Y(0.99), Math.abs(b2 - a2), Y(0.83) - Y(0.99), 4);
    }
    // race number on the rear panel, both sides
    roundel(g, X(0.93), Y(0.925), 74, opt.number, P.accent);
    if (opt.st.dodo) dodo(g, X(-0.98), Y(0.93), 1.3);
    if (opt.st.name) {
      g.save(); g.fillStyle = P.stripe === '#f6f2e6' || P.stripe === '#f2c14e' ? '#ffffff' : P.stripe;
      if (opt.st.stripes) g.fillStyle = P.hex;
      g.font = 'italic 900 52px "Arial Black", Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText('VALRICHE', (X(-0.05) + X(0.05)) / 2, (Y(0.47) + Y(0.40)) / 2 + 2);
      g.restore();
    }
  }
  return c;
}
function topArt(opt) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), P = opt.paint;
  g.fillStyle = P.roof; g.fillRect(0, 0, 512, 512);
  if (opt.st.stripes) { g.fillStyle = P.hex; g.fillRect(180, 0, 50, 512); g.fillRect(282, 0, 50, 512); }
  roundel(g, 256, 256, 120, opt.number, P.accent);
  return c;
}
function bonnetArt(opt) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), P = opt.paint;
  g.clearRect(0, 0, 512, 512);
  if (opt.st.stripes) { g.fillStyle = P.stripe; g.fillRect(170, 0, 60, 512); g.fillRect(282, 0, 60, 512); g.fillStyle = P.accent; g.fillRect(240, 0, 32, 512); }
  roundel(g, 256, 250, 92, opt.number, P.accent);
  return c;
}
function plateArt(opt) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#f7d54a'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 148);
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 86px "Arial Black", Arial, sans-serif'; g.fillText('VR ' + opt.number, 256, 72);
  g.font = '700 26px Arial, sans-serif'; g.fillText('HERITAGE VILLAS VALRICHE', 256, 134);
  return c;
}
function tex(canvas) { const t = new THREE.CanvasTexture(canvas); t.anisotropy = 8; return t; }

// ---------------------------------------------------------------- model
VR.makeFancyCart = function (opt) {
  const group = new THREE.Group();
  const paintMat = new THREE.MeshPhongMaterial({ color: opt.paint.hex, shininess: 110, specular: 0x666666 });
  const sideMat = new THREE.MeshPhongMaterial({ shininess: 110, specular: 0x666666 });
  const chrome = new THREE.MeshPhongMaterial({ color: 0xd8dde2, shininess: 160, specular: 0xffffff });
  const black = new THREE.MeshLambertMaterial({ color: 0x18191b });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const seatMat = new THREE.MeshPhongMaterial({ color: 0xefe5cf, shininess: 30 });
  const pipeMat = new THREE.MeshLambertMaterial({ color: 0xa8763e });
  const roofMat = new THREE.MeshPhongMaterial({ shininess: 60 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fc9d3, transparent: true, opacity: 0.35, shininess: 120, specular: 0xffffff, side: THREE.DoubleSide });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const decalMat = new THREE.MeshPhongMaterial({ transparent: true, shininess: 110, specular: 0x666666, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const plateMat = new THREE.MeshLambertMaterial({});

  // body: side profile extruded across the width
  const s = new THREE.Shape();
  const arch = (cz, from, to) => { for (let i = 0; i <= 10; i++) { const a = from + (to - from) * i / 10; s.lineTo(cz + Math.cos(a) * 0.44, 0.34 + Math.sin(a) * 0.44); } };
  s.moveTo(1.46, 0.30); s.lineTo(1.40, 0.30);
  arch(0.95, 0, Math.PI);           // rear arch, from z=1.39 to 0.51
  s.lineTo(-0.51, 0.30);
  arch(-0.95, 0, Math.PI);          // front arch
  s.lineTo(-1.44, 0.30);
  s.quadraticCurveTo(-1.52, 0.52, -1.46, 0.76);
  s.quadraticCurveTo(-1.38, 0.98, -1.10, 1.02);
  s.lineTo(-0.82, 1.06);
  s.lineTo(-0.66, 0.66); s.lineTo(0.56, 0.66); s.lineTo(0.64, 1.08);
  s.lineTo(1.36, 1.10);
  s.quadraticCurveTo(1.52, 1.02, 1.48, 0.62);
  s.lineTo(1.46, 0.30);
  const body = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
  body.rotateY(-Math.PI / 2); body.translate(0.6, 0, 0);
  // caps carry the decal UVs: shape (u,v) metres -> texture, left half/right half
  {
    const pos = body.attributes.position, uv = body.attributes.uv, grp = body.groups[0];
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const vi = body.index ? body.index.getX(i) : i;
      const x = pos.getX(vi), z = pos.getZ(vi), y = pos.getY(vi);
      const U = (z + 1.5) / 3, V = (y - 0.25) / 0.9;
      if (x < 0) uv.setXY(vi, U, 0.5 + V * 0.5); else uv.setXY(vi, 1 - U, V * 0.5);
    }
    uv.needsUpdate = true;
  }
  const bodyMesh = new THREE.Mesh(body, [sideMat, paintMat]); bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // floor, rocker trim, bumpers
  const box = (w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; group.add(b); return b; };
  box(1.18, 0.06, 1.3, black, 0, 0.64, 0);
  box(1.28, 0.08, 0.1, chrome, 0, 0.42, -1.52);
  box(1.28, 0.08, 0.1, chrome, 0, 0.42, 1.52);
  // dash and steering
  box(1.1, 0.32, 0.22, black, 0, 1.14, -0.72, -0.35);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), black); sw.position.set(-0.26, 1.26, -0.52); sw.rotation.x = -0.9; group.add(sw);
  box(0.04, 0.04, 0.35, chrome, -0.26, 1.16, -0.62, -0.9);
  // seats (front bench + rear-facing flip seat)
  box(1.06, 0.16, 0.52, seatMat, 0, 0.82, 0.08);
  box(1.06, 0.5, 0.12, seatMat, 0, 1.12, 0.38, 0.12);
  box(1.08, 0.04, 0.54, pipeMat, 0, 0.74, 0.08);
  box(1.06, 0.16, 0.5, seatMat, 0, 1.19, 1.0);
  box(1.06, 0.42, 0.12, seatMat, 0, 1.44, 0.7, -0.12);
  box(1.08, 0.04, 0.52, pipeMat, 0, 1.11, 1.0);
  // canopy with struts
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.07, 2.2), roofMat); roof.position.set(0, 2.06, 0.18); roof.castShadow = true; group.add(roof);
  const roofTop = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.16), new THREE.MeshLambertMaterial({})); roofTop.rotation.x = -Math.PI / 2; roofTop.position.set(0, 2.1, 0.18); group.add(roofTop);
  const strut = (x, z0, y0, z1, y1) => {
    const L = Math.hypot(z1 - z0, y1 - y0), c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, L, 8), chrome);
    c.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2); c.rotation.x = Math.atan2(z1 - z0, y1 - y0); group.add(c);
  };
  for (const x of [-0.6, 0.6]) { strut(x, -0.76, 1.06, -0.8, 2.03); strut(x, 1.2, 1.1, 1.18, 2.03); }
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.95), glass); ws.position.set(0, 1.55, -0.78); ws.rotation.x = 0.04; group.add(ws);
  // lights
  box(1.0, 0.07, 0.07, lightMat, 0, 2.02, -0.94);
  for (const x of [-0.44, 0.44]) {
    const hl = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), lightMat); hl.position.set(x, 0.66, -1.5); hl.rotation.y = Math.PI; group.add(hl);
    box(0.16, 0.08, 0.04, tailMat, x, 0.9, 1.5);
  }
  // mirrors
  for (const x of [-0.7, 0.7]) box(0.14, 0.09, 0.03, chrome, x, 1.55, -0.78);

  // wheels
  const wheels = [], front = [];
  for (const [x, z] of [[-0.66, -0.95], [0.66, -0.95], [-0.66, 0.95], [0.66, 0.95]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.34, z); group.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.27, 22), tyreMat); tyre.rotation.z = Math.PI / 2; spin.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 18), chrome); rim.rotation.z = Math.PI / 2; spin.add(rim);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group(); arm.rotation.x = i / 3 * Math.PI; arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.04), black)); spin.add(arm);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10), chrome); hub.rotation.z = Math.PI / 2; spin.add(hub);
    pivot.traverse(o => { o.castShadow = true; });
    wheels.push(spin); if (z < 0) front.push(pivot);
  }

  // decals
  const bonnet = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.6), decalMat);
  bonnet.rotation.x = -Math.PI / 2 + 0.12; bonnet.rotation.z = Math.PI; bonnet.position.set(0, 1.065, -1.12); group.add(bonnet);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), plateMat); plate.position.set(0, 0.56, 1.525); group.add(plate);

  function apply(o) {
    const art = sideArt(o);
    if (sideMat.map) sideMat.map.dispose();
    sideMat.map = tex(art); sideMat.needsUpdate = true;
    paintMat.color.set(o.paint.hex);
    roofMat.color.set(o.paint.roof);
    if (roofTop.material.map) roofTop.material.map.dispose();
    roofTop.material.map = tex(topArt(o)); roofTop.material.needsUpdate = true;
    if (decalMat.map) decalMat.map.dispose();
    decalMat.map = tex(bonnetArt(o)); decalMat.needsUpdate = true;
    if (plateMat.map) plateMat.map.dispose();
    plateMat.map = tex(plateArt(o)); plateMat.needsUpdate = true;
  }
  apply(opt);
  return { group, wheels, front, apply };
};
})();
