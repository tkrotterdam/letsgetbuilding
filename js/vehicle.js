// Arcade vehicle model for the golf cart, an AI driver for the tour, and a camera director.
// Pure maths with no DOM, so it can be tested in Node (tools/test_vehicle.js).
(function (root) {
'use strict';
const VR = root.VR = root.VR || {};

const STEP = 1 / 120;                 // fixed physics step (s)
const WHEELBASE = 2.2, REV_MAX = 12 / 3.6, G = 9.81;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** steering lock (rad) available at a given speed: wide when parked, narrow at speed */
const steerLock = sp => 0.62 / (1 + Math.max(0, sp - 3) / 9);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * env: {
 *   ground(x, z) -> height of the drivable surface (m)
 *   water(x, z)  -> true where the cart must not go
 *   surface(x, z)-> 'road' | 'grass'
 *   pushOut(x, z, r, y) -> {x, z, nx, nz, hit}   circle vs obstacles
 * }
 */
class Vehicle {
  constructor(env) {
    this.env = env;
    this.x = 0; this.z = 0; this.y = 0; this.h = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.air = false; this.steer = 0; this.steerAngle = 0; this.yawRate = 0;
    this.accel = 0; this.slip = 0; this.onRoad = true; this.impact = 0; this.landed = 0; this.waterHit = false;
    this.acc = 0;   // fixed-step accumulator
    this.feel = 1;  // steering feel: how quickly the wheel responds (0.6 relaxed, 1 normal, 1.5 sharp)
  }
  place(x, z, h) {
    this.x = x; this.z = z; this.h = h; this.vx = this.vz = this.vy = 0;
    this.y = this.env.ground(x, z); this.air = false; this.steer = this.steerAngle = 0;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.h) - this.vz * Math.cos(this.h); }
  /** advance by real time dt with input {throttle -1..1, steer -1..1, handbrake, boost}, gear {max km/h, acc} */
  update(dt, input, gear) {
    this.acc += Math.min(dt, 0.25);
    this.impact = 0; this.landed = 0; this.waterHit = false;
    let n = 0;
    while (this.acc >= STEP && n < 60) { this.step(STEP, input, gear); this.acc -= STEP; n++; }
    if (n === 60) this.acc = 0;
  }
  step(dt, inp, gear) {
    const env = this.env;
    const fx = Math.sin(this.h), fz = -Math.cos(this.h), rx = Math.cos(this.h), rz = Math.sin(this.h);
    let vF = this.vx * fx + this.vz * fz, vR = this.vx * rx + this.vz * rz;
    this.onRoad = env.surface(this.x, this.z) === 'road';
    const surf = this.onRoad ? 1 : 0.85;                       // grass is a little slower
    const vmax = gear.max / 3.6 * (inp.boost ? 1.25 : 1) * surf;
    const accMax = gear.acc * (inp.boost ? 1.35 : 1);
    let a = 0;
    if (!this.air) {
      const th = inp.throttle;
      if (th > 0) a = vF < -0.5 ? 12 * th : accMax * th * clamp(1 - (vF / vmax) ** 3, 0, 1);
      else if (th < 0) a = vF > 0.5 ? 12 * th : (vF > -REV_MAX ? 3 * th : 0);
      // rolling resistance and air drag; stronger when coasting so it settles naturally
      const q = (vF / (gear.max / 3.6)) ** 2;
      const drag = th === 0 ? 0.8 + 1.4 * q * (this.onRoad ? 1 : 1.5) : 0.1 + 0.25 * q;
      a -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, drag);
      if (vF > vmax) a = Math.min(a, -2.5);                    // over the limit (e.g. after leaving the road)
      // gravity along the slope
      const s = 2;
      const slope = (env.ground(this.x + fx * s, this.z + fz * s) - env.ground(this.x - fx * s, this.z - fz * s)) / (2 * s);
      a -= G * clamp(slope, -0.35, 0.35);
      if (inp.handbrake) a -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, 5);
      vF += a * dt;
      // tyre grip kills sideways speed; less grip at speed, much less on the handbrake (drift)
      const grip = inp.handbrake ? 1.8 : (this.onRoad ? 11 : 8) / (1 + Math.abs(vF) / 40);
      vR *= Math.exp(-grip * dt);
    }
    this.accel = a;
    this.slip = Math.abs(vR);
    // steering. The wheel builds up slowly at speed and recentres gently, the lock narrows with speed,
    // and the turn rate is capped by how much sideways acceleration the tyres can give (so a flick of
    // the keys at 60 km/h nudges the cart instead of snapping it round). The handbrake lifts the cap.
    const sp = Math.abs(vF), target = clamp(inp.steer, -1, 1);
    const build = 3.2 * this.feel / (1 + sp / 8);                       // wheel speed, 1/s: ~3 parked, ~1 at 60 km/h
    const rate = target === 0 ? 5 / (1 + sp / 30) : (Math.sign(target) !== Math.sign(this.steer) && this.steer !== 0 ? build * 1.6 : build);
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    const lock = steerLock(sp) * (inp.handbrake ? 1.5 : 1);
    this.steerAngle = this.steer * lock;
    const aLat = inp.handbrake ? 13 : (this.onRoad ? 7 : 5.5);          // m/s^2
    const yawMax = aLat / Math.max(sp, 3.5);
    const yawWant = this.air ? this.yawRate * 0.98 : clamp(vF * Math.tan(this.steerAngle) / WHEELBASE, -yawMax, yawMax);
    this.yawRate += (yawWant - this.yawRate) * Math.min(1, dt * 9);      // a little yaw inertia
    this.h = wrap(this.h + this.yawRate * dt);
    if (!this.air) { this.vx = fx * vF + rx * vR; this.vz = fz * vF + rz * vR; }
    const nfx = Math.sin(this.h), nfz = -Math.cos(this.h);
    // move with collision response (dt is small, at most ~0.3 m per step at top speed)
    const px = this.x, pz = this.z;
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (env.water(nx + nfx * 1.6 * Math.sign(vF || 1), nz + nfz * 1.6 * Math.sign(vF || 1))) {
      this.waterHit = true; this.vx *= 0.3; this.vz *= 0.3; nx = px; nz = pz;
    }
    this.x = nx; this.z = nz;
    let hit = null;
    for (const o of [-1.15, 0, 1.15]) {
      const cx = this.x + nfx * o, cz = this.z + nfz * o;
      const r = env.pushOut(cx, cz, 0.8, this.y);
      if (r.hit) { this.x += r.x - cx; this.z += r.z - cz; hit = r; }
    }
    if (hit) {
      const vn = this.vx * hit.nx + this.vz * hit.nz;
      if (vn < 0) {
        this.impact = Math.max(this.impact, -vn);
        // remove the speed into the wall, keep most of the speed along it (a scrape, not a stop)
        this.vx -= hit.nx * vn * 1.1; this.vz -= hit.nz * vn * 1.1;
        this.vx *= 0.985; this.vz *= 0.985;
        // swing the nose along the wall so the cart scrapes past instead of grinding into it
        if (this.speed > 1) {
          const along = Math.atan2(this.vx, -this.vz), dir = this.forwardSpeed >= 0 ? along : wrap(along + Math.PI);
          this.h = wrap(this.h + clamp(wrap(dir - this.h), -0.08, 0.08));
        }
      }
    }
    // vertical: follow the surface; leave it only when the ground falls away faster than gravity
    const g = env.ground(this.x, this.z);
    if (this.air) {
      this.vy -= G * dt; this.y += this.vy * dt;
      if (this.y <= g) { this.landed = -this.vy; this.y = g; this.vy = 0; this.air = false; }
    } else {
      const climb = (g - this.y) / dt;
      if (climb < -0.5 && this.vy > 2.5 && this.speed > 8) { this.air = true; this.vy -= G * dt; this.y += this.vy * dt; }
      else { this.vy = this.vy * 0.6 + climb * 0.4; this.y = g; }
    }
  }
}
VR.Vehicle = Vehicle;

/** Push circle (x, z, r) out of polygon p (flat [x0,z0,x1,z1,...]). Returns null when clear. */
function circlePolyPush(x, z, r, p) {
  const n = p.length / 2;
  let bd = Infinity, bx = 0, bz = 0, inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    const ex = xi - xj, ez = zi - zj, L2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - xj) * ex + (z - zj) * ez) / L2));
    const qx = xj + ex * t, qz = zj + ez * t, d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d < bd) { bd = d; bx = qx; bz = qz; }
  }
  const d = Math.sqrt(bd);
  if (!inside && d >= r) return null;
  let nx = (x - bx) / (d || 1), nz = (z - bz) / (d || 1);
  if (inside) { nx = -nx; nz = -nz; }
  const push = inside ? d + r : r - d;
  return { x: x + nx * push, z: z + nz * push, nx, nz };
}
VR.circlePolyPush = circlePolyPush;

/** Pure-pursuit driver that follows a polyline like a careful cart driver: slows for bends. */
class Driver {
  constructor(path) {
    this.path = path; this.cum = [0];
    for (let i = 1; i < path.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    this.len = this.cum[this.cum.length - 1]; this.s = 0;
  }
  at(s) {
    const L = this.len; s = ((s % L) + L) % L;
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const t = (s - this.cum[lo]) / ((this.cum[hi] - this.cum[lo]) || 1), a = this.path[lo], b = this.path[hi];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  // project the vehicle onto the path near the last known position
  track(x, z) {
    let best = this.s, bd = Infinity;
    for (let d = -20; d <= 40; d += 1) { const [px, pz] = this.at(this.s + d), q = (px - x) ** 2 + (pz - z) ** 2; if (q < bd) { bd = q; best = this.s + d; } }
    this.s = best; return Math.sqrt(bd);
  }
  control(v, cruiseKmh) {
    this.track(v.x, v.z);
    // pure pursuit: the steering angle that arcs the cart onto a point `ld` metres up the route,
    // converted to wheel input using the cart's real steering lock at this speed
    const ld = clamp(5 + 0.9 * Math.max(v.forwardSpeed, 0), 6, 22);
    const [tx, tz] = this.at(this.s + ld);
    const err = wrap(Math.atan2(tx - v.x, -(tz - v.z)) - v.h);
    const delta = Math.atan(2 * WHEELBASE * Math.sin(err) / Math.max(Math.hypot(tx - v.x, tz - v.z), 3));
    // Speed planner: for each point ahead, the comfortable cornering speed there is sqrt(aLat / curvature);
    // to be at that speed on arrival we must be no faster than sqrt(vCorner^2 + 2 * brake * distance) now.
    const A_COMFORT = Driver.tune.aComfort, A_BRAKE = Driver.tune.aBrake;
    let target = cruiseKmh / 3.6;
    for (let d = 2; d <= 64; d += 2) {
      const [ax, az] = this.at(this.s + d - 4), [bx, bz] = this.at(this.s + d), [cx, cz] = this.at(this.s + d + 4);
      const k = Math.abs(wrap(Math.atan2(cx - bx, -(cz - bz)) - Math.atan2(bx - ax, -(bz - az)))) / 4;
      const vc = Math.sqrt(A_COMFORT / Math.max(k, 1e-3));
      target = Math.min(target, Math.sqrt(vc * vc + 2 * A_BRAKE * d));
    }
    // ...and never go faster than the tyres allow for the curve the wheel is asking for right now,
    // so the cart doesn't speed up while it is still hauling itself back onto the line
    const demand = Math.abs(2 * Math.sin(err) / Math.max(Math.hypot(tx - v.x, tz - v.z), 3));
    target = Math.min(target, Math.sqrt(A_COMFORT * Driver.tune.demandSlack / Math.max(demand, 1e-3)));
    target = Math.max(target, 3.5);
    this.lastTarget = target; this.lastErr = err;   // kept for diagnostics
    const vF = v.forwardSpeed;
    return {
      steer: clamp(delta / steerLock(Math.abs(v.forwardSpeed)), -1, 1),
      throttle: vF < target - 0.3 ? clamp((target - vF) * 0.6, 0.15, 1) : (vF > target + 0.4 ? -clamp((vF - target) * Driver.tune.brakeGain, 0.25, 0.8) : 0),
      handbrake: false, boost: false,
    };
  }
}
Driver.tune = { aComfort: 3.2, aBrake: 2.6, brakeGain: 0.35, demandSlack: 1.3 };
VR.Driver = Driver;

/**
 * Camera rigs. 'chase' is the driving camera: a damped spring behind the direction of travel
 * that leans into turns and widens with speed. 'cinema' cuts between shots like an edited
 * cart video: low chase, side tracking, drone overhead, roadside pass-by and a front shot.
 */
class CameraRig {
  constructor() {
    this.pos = null; this.look = null; this.vel = [0, 0, 0]; this.lvel = [0, 0, 0];
    this.yaw = 0; this.fov = 55; this.roll = 0; this.shot = 0; this.shotT = 0; this.anchor = null;
  }
  reset() { this.pos = null; }
  spring(cur, vel, target, omega, dt) {   // critically damped
    for (let i = 0; i < 3; i++) {
      const x = cur[i] - target[i];
      const tmp = (vel[i] + omega * x) * dt, exp = Math.exp(-omega * dt);
      vel[i] = (vel[i] - omega * tmp) * exp;
      cur[i] = target[i] + (x + tmp) * exp;
    }
  }
  chase(v, dt, opts) {
    const spd = v.speed;
    // follow the direction of travel when moving (shows drifts), the heading when slow
    const travel = spd > 3 ? Math.atan2(v.vx, -v.vz) : v.h;
    const back = v.forwardSpeed < -0.5 ? v.h : travel;
    const dy = wrap(back - this.yaw); this.yaw = wrap(this.yaw + dy * Math.min(1, dt * 4));
    const dist = 6.8 + spd * 0.11, height = 2.4 + spd * 0.025;
    const want = [v.x - Math.sin(this.yaw) * dist, v.y + height, v.z + Math.cos(this.yaw) * dist];
    const look = [v.x + Math.sin(v.h) * 4, v.y + 1.2, v.z - Math.cos(v.h) * 4];
    return this.apply(want, look, dt, 9, 12, 55 + Math.min(22, spd * 0.45), clamp(-v.yawRate * 0.05, -0.06, 0.06), opts);
  }
  cinema(v, dt, opts) {
    this.shotT -= dt;
    if (this.shotT <= 0) { this.shot = (this.shot + 1) % 5; this.shotT = 6.5; this.anchor = null; this.pos = null; }
    const f = [Math.sin(v.h), -Math.cos(v.h)], r = [Math.cos(v.h), Math.sin(v.h)];
    let want, look, fov = 50;
    switch (this.shot) {
      case 0: return this.chase(v, dt, opts);
      case 1:   // side tracking at wheel height
        want = [v.x + r[0] * 7 - f[0] * 1.5, v.y + 1.6, v.z + r[1] * 7 - f[1] * 1.5]; look = [v.x + f[0] * 2, v.y + 1, v.z + f[1] * 2]; fov = 45; break;
      case 2:   // drone: high and slightly behind, looking down at the cart and the estate
        want = [v.x - f[0] * 18, v.y + 28, v.z - f[1] * 18]; look = [v.x + f[0] * 10, v.y, v.z + f[1] * 10]; fov = 55; break;
      case 3: { // roadside: a fixed camera ahead of the cart that pans as it passes
        if (!this.anchor) this.anchor = [v.x + f[0] * 28 + r[0] * 5, v.z + f[1] * 28 + r[1] * 5];
        want = [this.anchor[0], opts.ground(this.anchor[0], this.anchor[1]) + 1.7, this.anchor[1]]; look = [v.x, v.y + 1, v.z]; fov = 40; break;
      }
      default:  // front, looking back at the driver
        want = [v.x + f[0] * 8, v.y + 2.2, v.z + f[1] * 8]; look = [v.x, v.y + 1.2, v.z]; fov = 48;
    }
    return this.apply(want, look, dt, 6, 10, fov, 0, opts);
  }
  apply(want, look, dt, wPos, wLook, fov, roll, opts) {
    if (opts && opts.clear) want = opts.clear(want, look);          // keep out of buildings
    if (opts && opts.ground) want[1] = Math.max(want[1], opts.ground(want[0], want[2]) + 1.4);
    if (!this.pos || opts.snap) { this.pos = want.slice(); this.look = look.slice(); this.vel = [0, 0, 0]; this.lvel = [0, 0, 0]; }
    else { this.spring(this.pos, this.vel, want, wPos, dt); this.spring(this.look, this.lvel, look, wLook, dt); }
    this.fov += (fov - this.fov) * Math.min(1, dt * 3);
    this.roll += (roll - this.roll) * Math.min(1, dt * 4);
    if (opts && opts.ground) this.pos[1] = Math.max(this.pos[1], opts.ground(this.pos[0], this.pos[2]) + 1.0);
    return { pos: this.pos, look: this.look, fov: this.fov, roll: this.roll };
  }
}
VR.CameraRig = CameraRig;
VR.VEHICLE_STEP = STEP;
VR.steerLock = steerLock;
})(typeof window !== 'undefined' ? window : globalThis);
