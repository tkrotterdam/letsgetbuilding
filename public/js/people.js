// Golfers on the courses and kitesurfers in the lagoon, animated.
(function () {
'use strict';
const VR = window.VR = window.VR || {};
const lam = c => new THREE.MeshLambertMaterial({ color: c });

const SKIN = ['#f1c7a5', '#d9a07a', '#a8714c', '#7a4e33', '#e8b896'];
const POLO = ['#f4f4f0', '#1f3a5f', '#e86f8f', '#9bd36b', '#f2c14e', '#6fb7d9', '#c8322a', '#ffffff'];
const TROUSERS = ['#f4f1e8', '#1f2a3a', '#c9b48a', '#6d7c8f', '#ffffff'];
const CAPS = ['#ffffff', '#1f3a5f', '#e8e4da', '#0d6c73', '#1c1c1c'];

// A simple articulated person: hips group with legs, torso with arms, head with cap.
function person(o) {
  const root = new THREE.Group();
  const skin = lam(o.skin), shirt = lam(o.shirt), trou = lam(o.trousers), shoe = lam('#fafafa'), cap = lam(o.cap);
  const box = (w, h, d, m, x, y, z, parent) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); (parent || root).add(b); return b; };
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.11 * s, 0.92, 0); root.add(hip);
    box(0.15, 0.86, 0.17, trou, 0, -0.43, 0, hip);
    box(0.14, 0.08, 0.28, shoe, 0, -0.88, -0.05, hip);
    legs.push(hip);
  }
  const torso = new THREE.Group(); torso.position.set(0, 0.92, 0); root.add(torso);
  box(0.4, 0.58, 0.24, shirt, 0, 0.3, 0, torso);
  box(0.42, 0.06, 0.26, lam('#2a2a2a'), 0, 0.02, 0, torso);   // belt
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin); head.position.set(0, 0.74, 0); torso.add(head);
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap); capTop.position.set(0, 0.77, 0); torso.add(capTop);
  box(0.2, 0.02, 0.14, cap, 0, 0.77, -0.15, torso);           // peak
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.25 * s, 0.56, 0); torso.add(sh);
    box(0.11, 0.3, 0.12, shirt, 0, -0.12, 0, sh);
    box(0.09, 0.3, 0.1, skin, 0, -0.42, 0, sh);
    arms.push(sh);
  }
  // club held by both hands
  const club = new THREE.Group(); club.position.set(0, 0.0, -0.18); torso.add(club);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), lam('#bfc5ca')); shaft.position.y = -0.5; club.add(shaft);
  const clubHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.06), lam('#2c2f33')); clubHead.position.set(0.03, -1.0, 0); club.add(clubHead);
  root.traverse(m => { m.castShadow = true; });
  return { root, torso, legs, arms, club };
}
function golfBag(color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.9, 10), lam(color)); b.position.y = 0.45; b.rotation.z = 0.25; g.add(b);
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 5), lam(['#222', '#c33', '#36c', '#ddd'][i])); c.position.set(0.1 + (i % 2) * 0.05, 0.98, (i < 2 ? -0.04 : 0.04)); g.add(c); }
  return g;
}
function plainCart(color) {
  const g = new THREE.Group();
  const body = lam(color), dark = lam('#1d1f22'), seat = lam('#eae2cf'), roof = lam('#f4f2ec');
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); };
  box(1.2, 0.4, 2.4, body, 0, 0.55, 0); box(1.2, 0.4, 0.6, body, 0, 0.9, -0.9);
  box(1.0, 0.15, 0.5, seat, 0, 0.85, 0.15); box(1.0, 0.45, 0.1, seat, 0, 1.1, 0.42);
  box(1.3, 0.06, 2.0, roof, 0, 2.0, 0.1);
  for (const [x, z] of [[-0.55, -0.6], [0.55, -0.6], [-0.55, 0.95], [0.55, 0.95]]) box(0.05, 1.15, 0.05, dark, x, 1.42, z);
  for (const [x, z] of [[-0.6, -0.8], [0.6, -0.8], [-0.6, 0.8], [0.6, 0.8]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.18, 12), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.25, z); g.add(w); }
  return g;
}

function centroid(r) { let x = 0, z = 0; for (let k = 0; k < r.length; k += 2) { x += r[k]; z += r[k + 1]; } return [x / (r.length / 2), z / (r.length / 2)]; }

VR.buildGolfers = function (scene, S, H) {
  const group = new THREE.Group(); scene.add(group);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const greens = S.landuse.filter(l => l.t === 'green').map(l => centroid(l.r[0]));
  const tees = S.landuse.filter(l => l.t === 'tee').map(l => centroid(l.r[0]));
  const nearest = (p, list) => list.reduce((b, q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); return d < b[1] ? [q, d] : b; }, [null, 1e9])[0];
  const actors = [];
  const addGroup = (spot, kind, aimAt) => {
    const n = 2 + Math.floor(rnd() * 3);
    const face = Math.atan2(aimAt[0] - spot[0], -(aimAt[1] - spot[1]));
    const cartColor = pick(['#f4f2ec', '#f4f2ec', '#0d6c73', '#c8322a']);
    const c = plainCart(cartColor);
    const cx = spot[0] + Math.cos(face) * 9, cz = spot[1] + Math.sin(face) * 9;
    c.position.set(cx, H(cx, cz), cz); c.rotation.y = -face + 0.4; group.add(c);
    for (let i = 0; i < n; i++) {
      const p = person({ skin: pick(SKIN), shirt: pick(POLO), trousers: pick(TROUSERS), cap: pick(CAPS) });
      const side = (i - (n - 1) / 2);
      const x = spot[0] + Math.cos(face) * side * 2.2 + (i === 0 ? 0 : Math.sin(face) * 2.5), z = spot[1] + Math.sin(face) * side * 2.2 - (i === 0 ? 0 : Math.cos(face) * 2.5);
      p.root.position.set(x, H(x, z), z);
      p.root.rotation.y = -face + (kind === 'tee' && i === 0 ? Math.PI / 2 : 0);
      group.add(p.root);
      const bag = golfBag(pick(['#1f3a5f', '#c8322a', '#f4f4f0', '#2f7a4b']));
      bag.position.set(x + 0.8, H(x + 0.8, z), z + 0.4); group.add(bag);
      actors.push({ p, kind: i === 0 ? kind : (rnd() < 0.3 ? 'walk' : 'idle'), phase: rnd() * 10, base: p.root.position.clone(), face, aim: aimAt });
    }
  };
  // a handful of groups: teeing off and putting
  const usedT = [], usedG = [];
  for (let i = 0; i < Math.min(7, tees.length); i++) {
    const t = tees[Math.floor(rnd() * tees.length)]; if (usedT.some(u => Math.hypot(u[0] - t[0], u[1] - t[1]) < 150)) continue; usedT.push(t);
    const g = nearest(t, greens.filter(q => Math.hypot(q[0] - t[0], q[1] - t[1]) > 120)) || [t[0], t[1] - 200];
    addGroup(t, 'tee', g);
  }
  for (let i = 0; i < Math.min(8, greens.length); i++) {
    const g = greens[Math.floor(rnd() * greens.length)]; if (usedG.some(u => Math.hypot(u[0] - g[0], u[1] - g[1]) < 150)) continue; usedG.push(g);
    addGroup([g[0] + 3, g[1] + 2], 'putt', g);
  }
  // golf balls in flight from the tees
  const ballGeo = new THREE.SphereGeometry(0.15, 8, 6), ballMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const a of actors) if (a.kind === 'tee') { a.ball = new THREE.Mesh(ballGeo, ballMat); a.ball.visible = false; group.add(a.ball); }

  function update(t, dt, Hf) {
    for (const a of actors) {
      const { p } = a;
      if (a.kind === 'tee') {
        // address, backswing, downswing, follow-through, then a pause
        const cyc = (t + a.phase) % 9;
        let rot = 0;
        if (cyc < 1.2) rot = 0;
        else if (cyc < 2.4) rot = -(cyc - 1.2) / 1.2 * 2.3;
        else if (cyc < 2.65) rot = -2.3 + (cyc - 2.4) / 0.25 * 4.6;
        else if (cyc < 4) rot = 2.3;
        else rot = 2.3 * Math.max(0, 1 - (cyc - 4));
        p.club.rotation.z = rot; p.arms.forEach(s => { s.rotation.z = rot * 0.9; });
        p.torso.rotation.y = rot * 0.25;
        if (a.ball) {
          const ft = cyc - 2.65;
          if (ft > 0 && ft < 4.5) {
            const k = ft / 4.5, d = 180 * k, dir = a.face;
            a.ball.visible = true;
            const sx = a.base.x + Math.sin(dir) * d, sz = a.base.z - Math.cos(dir) * d;
            a.ball.position.set(sx, Hf(sx, sz) + 1 + Math.sin(Math.PI * k) * 40, sz);
          } else a.ball.visible = false;
        }
      } else if (a.kind === 'putt') {
        const cyc = (t + a.phase) % 6, sw = cyc < 2 ? Math.sin(cyc * Math.PI) * 0.4 : 0;
        p.club.rotation.x = sw; p.arms.forEach(s => { s.rotation.x = sw; });
        p.torso.rotation.x = -0.35;
      } else if (a.kind === 'walk') {
        const s = Math.sin((t + a.phase) * 4);
        p.legs[0].rotation.x = s * 0.5; p.legs[1].rotation.x = -s * 0.5;
        p.arms[0].rotation.x = -s * 0.4; p.arms[1].rotation.x = s * 0.4;
        const off = Math.sin((t + a.phase) * 0.25) * 6;
        const x = a.base.x + Math.sin(a.face) * off, z = a.base.z - Math.cos(a.face) * off;
        p.root.position.set(x, Hf(x, z), z);
        p.root.rotation.y = -a.face + (Math.cos((t + a.phase) * 0.25) > 0 ? 0 : Math.PI);
        p.club.visible = false;
      } else {
        p.torso.rotation.y = Math.sin((t + a.phase) * 0.6) * 0.15;
      }
    }
  }
  return { group, update, count: actors.length, actors };
};

// ---------------------------------------------------------------- kitesurfers
function kiteGeometry(color, accent) {
  // leading-edge-inflatable kite: a curved arc of panels
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const le = new THREE.MeshLambertMaterial({ color: accent, side: THREE.DoubleSide });
  const segs = 10, span = 9, chord = 2.6, pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = -1.15 + 2.3 * i / segs, x = Math.sin(a) * span / 2, y = Math.cos(a) * span / 2 - span / 2;
    const c = chord * (1 - Math.abs(i / segs - 0.5) * 0.9);
    pos.push(x, y, -c / 2, x, y, c / 2);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat));
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([...Array(segs + 1)].map((_, i) => { const a = -1.15 + 2.3 * i / segs; return new THREE.Vector3(Math.sin(a) * span / 2, Math.cos(a) * span / 2 - span / 2 + 0.05, -chord * (1 - Math.abs(i / segs - 0.5) * 0.9) / 2); })), 20, 0.16, 6);
  g.add(new THREE.Mesh(tube, le));
  return g;
}
VR.buildKiters = function (scene, S, hRaw) {
  const group = new THREE.Group(); scene.add(group);
  // "Bel Ombre Kite Spot" as listed in Overture Places (57.40461 E, 20.50579 S); the listing is
  // low-confidence so it is not among the pins, but local kite schools describe the lagoon spot here.
  const spot = { n: 'Bel Ombre kite spot', x: (57.404607 - S.meta.origin[0]) * S.meta.kx, z: -(-20.505793 - S.meta.origin[1]) * S.meta.ky };
  let seed = 17; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const COLS = [['#e63946', '#1d3557'], ['#f4a261', '#264653'], ['#2a9d8f', '#e9c46a'], ['#ffbe0b', '#3a0ca3'], ['#06d6a0', '#ef476f'], ['#ff006e', '#ffffff'], ['#3a86ff', '#ffbe0b']];
  // find lagoon water south of the kite spot, away from the shore
  const lanes = [];
  for (let tries = 0; tries < 2000 && lanes.length < 7; tries++) {
    const x = spot.x + (rnd() - 0.5) * 1400, z = spot.z + 80 + rnd() * 600;
    let ok = true;
    for (let k = -2; k <= 2 && ok; k++) for (let j = -1; j <= 1 && ok; j++) if (hRaw(x + k * 25, z + j * 25) > 0.3) ok = false;
    if (ok && !lanes.some(l => Math.hypot(l.x - x, l.z - z) < 120)) lanes.push({ x, z });
  }
  const riders = lanes.map((l, i) => {
    const root = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 1.4), lam(COLS[i % COLS.length][1])); board.position.y = 0.05; root.add(board);
    const body = new THREE.Group(); root.add(body);
    const suit = lam('#15181c'), skin = lam(SKIN[i % SKIN.length]);
    const b = (w, h, d, m, x, y, z) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); body.add(q); return q; };
    b(0.14, 0.8, 0.16, suit, -0.1, 0.48, 0.2); b(0.14, 0.8, 0.16, suit, 0.1, 0.48, -0.2);
    b(0.38, 0.6, 0.24, suit, 0, 1.15, 0);
    b(0.42, 0.12, 0.28, lam(COLS[i % COLS.length][0]), 0, 0.92, 0);            // harness
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin); head.position.set(0, 1.58, 0); body.add(head);
    b(0.5, 0.06, 0.06, lam('#333'), 0, 1.25, -0.35);                         // bar
    body.rotation.x = 0.35;
    const kite = kiteGeometry(COLS[i % COLS.length][0], COLS[i % COLS.length][1]);
    group.add(root); group.add(kite);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.6 }));
    group.add(lines);
    root.traverse(m => { m.castShadow = true; });
    return { root, body, kite, lines, lane: l, phase: rnd() * 100, len: 160 + rnd() * 160, speed: 8 + rnd() * 5, jumpAt: rnd() * 30 };
  });

  function update(t, windVec, windKmh) {
    const wl = windVec.length() || 1, wx = windVec.x / wl, wz = windVec.y / wl;   // downwind unit vector (x,z)
    const cx = -wz, cz = wx;                                                       // across the wind
    const strength = Math.min(1.4, Math.max(0.4, (windKmh || 18) / 22));
    for (const r of riders) {
      // broad reach back and forth across the wind, slightly upwind
      const T = r.len / r.speed, s = ((t + r.phase) % (2 * T)) / T, leg = s < 1 ? 1 : -1, k = s < 1 ? s : 2 - s;
      const along = (k - 0.5) * r.len;
      const x = r.lane.x + cx * along - wx * 20 * Math.sin(k * Math.PI), z = r.lane.z + cz * along - wz * 20 * Math.sin(k * Math.PI);
      // occasional jump
      const jt = ((t + r.jumpAt) % 22);
      const jump = jt < 2.4 ? Math.sin(jt / 2.4 * Math.PI) * 6 * strength : 0;
      const bob = Math.sin(t * 3 + r.phase) * 0.08;
      r.root.position.set(x, 0.1 + bob + jump, z);
      const dirx = cx * leg - wx * 0.25, dirz = cz * leg - wz * 0.25;
      r.root.rotation.set(0, Math.atan2(dirx, -dirz), 0);
      r.body.rotation.z = -0.35 * leg;            // lean against the kite
      // kite: downwind, high, gently swinging
      const elev = 0.75 + Math.sin(t * 0.7 + r.phase) * 0.18 + (jump > 0 ? 0.25 : 0), side = Math.sin(t * 0.45 + r.phase) * 0.5 + leg * 0.35;
      const L = 23;
      const kx = x + (wx * Math.cos(side) + cx * Math.sin(side)) * L * Math.cos(elev);
      const kz = z + (wz * Math.cos(side) + cz * Math.sin(side)) * L * Math.cos(elev);
      const ky = r.root.position.y + 1.3 + L * Math.sin(elev);
      r.kite.position.set(kx, ky, kz);
      r.kite.lookAt(x, r.root.position.y + 1.3, z);
      r.kite.rotateX(-Math.PI / 2);
      r.kite.updateMatrixWorld();
      const bar = new THREE.Vector3(x, r.root.position.y + 1.25, z);
      const p = r.lines.geometry.attributes.position;
      const tipA = new THREE.Vector3(-4.1, -2.4, 0).applyMatrix4(r.kite.matrixWorld), tipB = new THREE.Vector3(4.1, -2.4, 0).applyMatrix4(r.kite.matrixWorld);
      p.setXYZ(0, bar.x, bar.y, bar.z); p.setXYZ(1, tipA.x, tipA.y, tipA.z); p.setXYZ(2, bar.x, bar.y, bar.z); p.setXYZ(3, tipB.x, tipB.y, tipB.z);
      p.needsUpdate = true;
    }
  }
  return { group, update, count: riders.length, spot, riders };
};
})();
