// Numerical checks for js/vehicle.js. Run: node tools/test_vehicle.js
global.window = undefined;
require('../js/vehicle.js');
const { Vehicle, Driver, circlePolyPush } = globalThis.VR;
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`); if (!ok) fails++; };

function envOf({ ground = () => 0, walls = [], surface = 'road' } = {}) {
  return {
    ground, water: () => false, surface: () => surface,
    pushOut(x, z, r) {
      let hit = false, nx = 0, nz = 0;
      for (let it = 0; it < 3; it++) {
        let moved = false;
        for (const p of walls) { const q = circlePolyPush(x, z, r, p); if (q) { x = q.x; z = q.z; nx += q.nx; nz += q.nz; hit = moved = true; } }
        if (!moved) break;
      }
      const l = Math.hypot(nx, nz) || 1;
      return { x, z, nx: nx / l, nz: nz / l, hit };
    },
  };
}
const ESTATE = { max: 24, acc: 3.2 }, SPORT = { max: 60, acc: 6.5 }, TURBO = { max: 120, acc: 11 };
const run = (v, secs, inp, gear, fps = 60, each) => { for (let t = 0; t < secs; t += 1 / fps) { v.update(1 / fps, inp, gear); each && each(v, t); } };
const kmh = v => v.speed * 3.6;

// 1-2 acceleration
{ const v = new Vehicle(envOf()); v.place(0, 0, 0); let t20 = null;
  run(v, 12, { throttle: 1, steer: 0 }, ESTATE, 60, (v, t) => { if (t20 == null && kmh(v) >= 20) t20 = t; });
  check('estate: 0-20 km/h under 4 s', t20 != null && t20 < 4, `t=${t20 && t20.toFixed(2)}s`);
  check('estate: top speed about 24 km/h', kmh(v) > 22 && kmh(v) <= 24.2, kmh(v).toFixed(1)); }
{ const v = new Vehicle(envOf()); v.place(0, 0, 0); run(v, 20, { throttle: 1, steer: 0 }, TURBO);
  check('turbo: reaches 100+ km/h in 20 s', kmh(v) > 100, kmh(v).toFixed(1)); }
// 3 coasting settles
{ const v = new Vehicle(envOf()); v.place(0, 0, 0); run(v, 6, { throttle: 1, steer: 0 }, SPORT); run(v, 25, { throttle: 0, steer: 0 }, SPORT);
  check('coasting comes to rest', kmh(v) < 1, kmh(v).toFixed(2)); }
// 4 braking distance from 60 km/h
{ const v = new Vehicle(envOf()); v.place(0, 0, 0); run(v, 30, { throttle: 1, steer: 0 }, SPORT); const z0 = v.z, s0 = kmh(v);
  let d = null; run(v, 4, { throttle: -1, steer: 0 }, SPORT, 60, v => { if (d == null && v.speed < 0.3) d = Math.abs(v.z - z0); });
  check('brakes from ~60 km/h within 25 m', s0 > 55 && d < 25, `from ${s0.toFixed(0)} km/h, ${d.toFixed(1)} m`); }
// 5 tight turning at low speed
{ const v = new Vehicle(envOf()); v.place(0, 0, 0); run(v, 2.5, { throttle: 0.6, steer: 0 }, ESTATE);
  const xs = [], zs = []; run(v, 8, { throttle: 0.4, steer: 1 }, ESTATE, 60, v => { xs.push(v.x); zs.push(v.z); });
  const R = (Math.max(...xs) - Math.min(...xs)) / 2;
  check('full lock at low speed turns tightly (radius < 7 m)', R > 1.5 && R < 7, `R=${R.toFixed(1)} m at ${kmh(v).toFixed(0)} km/h`); }
// 6 no tunnelling at 120 km/h into a 0.3 m thick wall
{ const wall = [-50, -200.3, 50, -200.3, 50, -200, -50, -200];
  const v = new Vehicle(envOf({ walls: [wall] })); v.place(0, 0, 0); let minZ = 0;
  run(v, 25, { throttle: 1, steer: 0, boost: true }, TURBO, 30, v => { minZ = Math.min(minZ, v.z); });
  check('cannot drive through a thin wall at top speed', minZ > -200, `closest z=${minZ.toFixed(2)}`);
  check('stops against it', kmh(v) < 5, kmh(v).toFixed(1)); }
// 7 glancing hit slides along the wall
{ const wall = [5, -100, 6, -100, 6, 100, 5, 100];       // wall to the right, along z
  const v = new Vehicle(envOf({ walls: [wall] })); v.place(0, 50, 0); run(v, 6, { throttle: 1, steer: 0 }, SPORT);
  const s0 = kmh(v); v.h = 0.35; run(v, 1.5, { throttle: 1, steer: 0 }, SPORT);   // angle in by ~20°
  check('a glancing hit scrapes along the wall and keeps speed', kmh(v) > s0 * 0.5 && v.x < 5, `${s0.toFixed(0)} -> ${kmh(v).toFixed(0)} km/h, x=${v.x.toFixed(2)}`); }
// 8 bumpy surface model (canopy-like bumps) should not throw the cart into the air
{ const bumpy = (x, z) => 0.4 * Math.sin(x / 6) * Math.cos(z / 7) + 0.25 * Math.sin(z / 3.1);
  const v = new Vehicle(envOf({ ground: bumpy })); v.place(0, 0, 0); let air = 0, n = 0;
  run(v, 20, { throttle: 1, steer: 0.1 }, SPORT, 60, v => { n++; if (v.air) air++; });
  check('gentle bumps at speed do not launch the cart', air / n < 0.03, `${(100 * air / n).toFixed(1)}% airborne`); }
// 9 a real crest does launch it
{ const ramp = (x, z) => { const d = -z; return d < 80 ? 0 : d < 100 ? (d - 80) * 0.25 : Math.max(0, 5 - (d - 100) * 0.9); };
  const v = new Vehicle(envOf({ ground: ramp })); v.place(0, 0, 0); let air = false;
  run(v, 12, { throttle: 1, steer: 0 }, TURBO, 60, v => { if (v.air) air = true; });
  check('a sharp crest at speed gives airtime', air); }
// 10 frame-rate independence
{ const a = new Vehicle(envOf()), b = new Vehicle(envOf()); a.place(0, 0, 0); b.place(0, 0, 0);
  run(a, 6, { throttle: 1, steer: 0.3 }, SPORT, 20); run(b, 6, { throttle: 1, steer: 0.3 }, SPORT, 144);
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  check('same path at 20 fps and 144 fps', d < 1.0, `${d.toFixed(2)} m apart`); }
// 11 handbrake drift: sideways slip appears
{ const v = new Vehicle(envOf()); v.place(0, 0, 0); run(v, 6, { throttle: 1, steer: 0 }, SPORT); let slip = 0;
  run(v, 1.2, { throttle: 1, steer: 1, handbrake: true }, SPORT, 60, v => { slip = Math.max(slip, v.slip); });
  check('handbrake turn produces a drift', slip > 3, `peak slip ${slip.toFixed(1)} m/s`); }
// 12 AI driver follows a winding path
{ const path = []; for (let i = 0; i <= 400; i++) { const a = i / 400 * Math.PI * 2; path.push([Math.cos(a) * 120 + Math.cos(a * 5) * 12, Math.sin(a) * 120]); }
  const v = new Vehicle(envOf()), drv = new Driver(path); v.place(path[0][0], path[0][1], Math.atan2(path[1][0] - path[0][0], -(path[1][1] - path[0][1])));
  let worst = 0;
  // (re-run with the driver)
  v.place(path[0][0], path[0][1], Math.atan2(path[1][0] - path[0][0], -(path[1][1] - path[0][1]))); drv.s = 0;
  for (let t = 0; t < 90; t += 1 / 60) { v.update(1 / 60, drv.control(v, 24), ESTATE); if (t > 3) worst = Math.max(worst, drv.track(v.x, v.z)); }
  check('tour driver stays on the path (< 3 m off)', worst < 3, `worst ${worst.toFixed(2)} m, covered ${drv.s.toFixed(0)} m`); }

// 13 chase camera stays behind at a sensible distance, never NaN; cinematic cuts through all shots
{ const { CameraRig } = globalThis.VR;
  const v = new Vehicle(envOf()); v.place(0, 0, 0); const rig = new CameraRig(); const opts = { ground: () => 0 };
  let dmin = 1e9, dmax = 0, bad = false;
  for (let t = 0; t < 20; t += 1 / 60) {
    v.update(1 / 60, { throttle: 1, steer: Math.sin(t * 0.7) }, SPORT);
    const r = rig.chase(v, 1 / 60, opts);
    if (r.pos.some(Number.isNaN)) bad = true;
    if (t > 2) { const d = Math.hypot(r.pos[0] - v.x, r.pos[2] - v.z); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
  }
  check('chase camera follows at 5-16 m without NaN', !bad && dmin > 5 && dmax < 16, `${dmin.toFixed(1)}-${dmax.toFixed(1)} m`);
  const shots = new Set(); bad = false;
  for (let t = 0; t < 40; t += 1 / 30) { v.update(1 / 30, { throttle: 0.6, steer: 0.2 }, ESTATE); const r = rig.cinema(v, 1 / 30, opts); shots.add(rig.shot); if (r.pos.some(Number.isNaN)) bad = true; }
  check('cinematic director cycles through all five shots', shots.size === 5 && !bad, `${shots.size} shots`); }

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
