// Real sun position, day/night, 3D clouds, rain, stars and live weather (AccuWeather via the
// viewer's connector). Everything degrades to a preset when live weather is not available.
(function () {
'use strict';
const VR = window.VR = window.VR || {};
const LAT = -20.503, LON = 57.412, TZ = 4;      // Mauritius time is UTC+4 all year

// ---------------------------------------------------------------- solar position (NOAA approximation)
VR.sunPosition = function (date) {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + LON) * rad;
  const ha = lst - ra, lat = LAT * rad;
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha)); // from north, clockwise
  return { el, az: (az + 2 * Math.PI) % (2 * Math.PI) };
};
// scene: north = -z, east = +x
VR.sunVector = (el, az) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
VR.mauritiusNow = () => { const d = new Date(); const local = new Date(d.getTime() + TZ * 3600000); return { date: d, hours: local.getUTCHours() + local.getUTCMinutes() / 60 }; };
VR.dateAtLocalHours = h => { const d = new Date(); const local = new Date(d.getTime() + TZ * 3600000); local.setUTCHours(0, 0, 0, 0); return new Date(local.getTime() + h * 3600000 - TZ * 3600000); };

// ---------------------------------------------------------------- AccuWeather payload parsing
const DIRS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
const num = s => { const m = String(s || '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
VR.parseAccuWeather = function (p) {
  const c = p && p.currentConditions; if (!c) return null;
  const ex = c.extended || {};
  const windM = String(ex.wind || '').match(/^([NSEW]{1,3})\s+([\d.]+)/);
  const phrase = c.phrase || '';
  const pastHour = num(ex.precipSummary && ex.precipSummary.pastHour);
  return {
    source: 'live', phrase,
    tempC: c.temperatureValue ?? num(c.temperature),
    cloud: Math.max(0, Math.min(1, (num(ex.cloudCover) ?? 40) / 100)),
    windFrom: windM ? DIRS[windM[1]] ?? 120 : 120, windKmh: windM ? +windM[2] : 15,
    gustKmh: num(ex.gusts), visibilityKm: num(ex.visibility), ceilingM: num(ex.ceiling),
    humidity: ex.humidityValue ?? num(ex.humidity),
    rain: (pastHour || 0) > 0 || /rain|shower|storm|drizzle/i.test(phrase) ? Math.max(0.3, Math.min(1, (pastHour || 1) / 4)) : 0,
    isDay: c.isDayTime, localTime: (p.location && p.location.localTime) || c.now || '',
    uv: ex.uv && ex.uv.value,
  };
};
// Presets when live data is off or unavailable. Wind from ~130° (SE trades) per local kite-school figures.
VR.WEATHER_PRESETS = {
  clear: { source: 'preset', phrase: 'Clear, trade winds', cloud: 0.12, windFrom: 130, windKmh: 22, visibilityKm: 30, ceilingM: 1400, rain: 0 },
  partly: { source: 'preset', phrase: 'Partly cloudy', cloud: 0.45, windFrom: 125, windKmh: 20, visibilityKm: 20, ceilingM: 1100, rain: 0 },
  cloudy: { source: 'preset', phrase: 'Mostly cloudy', cloud: 0.85, windFrom: 110, windKmh: 16, visibilityKm: 10, ceilingM: 700, rain: 0 },
  showers: { source: 'preset', phrase: 'Passing showers', cloud: 0.9, windFrom: 120, windKmh: 26, visibilityKm: 5, ceilingM: 500, rain: 0.7 },
};

// ---------------------------------------------------------------- textures
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.75)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- sky + atmosphere controller
VR.createAtmosphere = function (scene, ext, refs) {
  const { sky, sun, hemi, fog, renderer } = refs;
  const puff = puffTexture();
  // 3D clouds: clusters of shaded puffs. Count, darkness and base height follow the weather.
  const clouds = new THREE.Group(); scene.add(clouds);
  const MAXC = 70, clusters = [];
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < MAXC; i++) {
    const g = new THREE.Group();
    const n = 7 + Math.floor(rnd() * 8), w = 260 + rnd() * 520;
    for (let k = 0; k < n; k++) {
      const m = new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, fog: true, opacity: 0.85 });
      const s = new THREE.Sprite(m);
      const r = w * (0.25 + rnd() * 0.3);
      s.position.set((rnd() - 0.5) * w, Math.abs(rnd() - 0.3) * w * 0.35, (rnd() - 0.5) * w * 0.6);
      s.scale.set(r * 1.6, r, 1);
      s.userData.h = s.position.y / (w * 0.35);   // 0 bottom … 1 top, for shading
      g.add(s);
    }
    g.userData = { x: ext.x0 - 4000 + rnd() * (ext.x1 - ext.x0 + 8000), z: ext.z0 - 6000 + rnd() * (ext.z1 - ext.z0 + 8000), rank: rnd(), mountain: rnd() };
    clusters.push(g); clouds.add(g);
  }
  // rain streaks around the camera
  const RN = 5000, rainGeo = new THREE.BufferGeometry(), rp = new Float32Array(RN * 6);
  for (let i = 0; i < RN; i++) { const x = (rnd() - 0.5) * 240, y = rnd() * 120, z = (rnd() - 0.5) * 240; rp.set([x, y, z, x, y - 1.2, z], i * 6); }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaab8c4, transparent: true, opacity: 0.45 }));
  rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  // stars
  const SN = 1600, sg = new THREE.BufferGeometry(), sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = 18000, y = Math.abs(u); const s = Math.sqrt(1 - y * y); sp.set([Math.cos(a) * s * r, y * r, Math.sin(a) * s * r], i * 3); }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars);

  const state = { w: VR.WEATHER_PRESETS.partly, night: 0, sunEl: 0.8, sunDir: new THREE.Vector3(0, 1, 0), windVec: new THREE.Vector2(), drift: 0 };
  const cTop = new THREE.Color(), cHor = new THREE.Color(), tmp = new THREE.Color();

  function apply(w, date) {
    state.w = w;
    const { el, az } = VR.sunPosition(date);
    const sd = VR.sunVector(el, az); state.sunDir.copy(sd); state.sunEl = el;
    const day = THREE.MathUtils.smoothstep(el, -0.1, 0.12);          // 0 night … 1 day
    const golden = 1 - THREE.MathUtils.smoothstep(el, 0.05, 0.45);     // low sun warmth
    state.night = 1 - day;
    const cov = w.cloud;
    // sky colours
    cTop.set('#2c78c9').lerp(tmp.set('#7f8d99'), cov * 0.75);
    cHor.set('#cfe7f1').lerp(tmp.set('#bfc6cb'), cov * 0.7);
    cHor.lerp(tmp.set('#f2b27a'), golden * day * 0.65 * (1 - cov * 0.6));
    const nightTop = tmp.set('#08111f');
    cTop.lerp(nightTop, 1 - day); cHor.lerp(tmp.set('#1a2738'), 1 - day);
    sky.material.uniforms.top.value.copy(cTop); sky.material.uniforms.horizon.value.copy(cHor);
    sky.material.uniforms.sunDir.value.copy(el > -0.05 ? sd : sd.clone().negate());   // moon-ish glow opposite at night
    sky.material.uniforms.sunStrength.value = el > -0.05 ? (1 - cov * 0.85) : 0.15;
    fog.color.copy(cHor);
    const vis = (w.visibilityKm || 20) * 1000;
    fog.near = Math.min(4000, vis * 0.25); fog.far = Math.max(3000, Math.min(18000, vis * 1.3));
    // lights
    const sunI = Math.max(0, Math.sin(el)) ** 0.6 * (1 - cov * 0.6);
    sun.intensity = 0.72 * sunI;
    sun.color.set('#fff3dc').lerp(tmp.set('#ffab6b'), golden * 0.8);
    hemi.intensity = 0.42 + 0.25 * day * (1 - cov * 0.2);
    hemi.color.set('#e6f2ff').lerp(tmp.set('#8094bd'), 1 - day);
    hemi.groundColor.set('#6a6f4a').lerp(tmp.set('#2a3145'), 1 - day);
    sun.castShadow = renderer.shadowMap.enabled && el > 0.03;
    renderer.toneMappingExposure = 1;
    // clouds: show the share matching cover, shade by light and darkness of cover
    const n = Math.round(MAXC * (0.1 + cov * 0.9));
    const base = Math.max(350, Math.min(2200, w.ceilingM || 900));
    const lit = tmp.set('#ffffff').lerp(new THREE.Color('#ffd2a8'), golden * day * 0.7).multiplyScalar(0.35 + 0.65 * day);
    clusters.forEach((g, i) => {
      g.visible = i < n;
      g.position.y = base + g.userData.rank * 500;
      for (const s of g.children) {
        const shade = 1 - cov * 0.45 * (1 - s.userData.h);
        s.material.color.copy(lit).multiplyScalar(shade);
        s.material.opacity = 0.55 + cov * 0.35;
      }
    });
    rain.visible = w.rain > 0;
    rain.material.opacity = 0.2 + w.rain * 0.4;
    stars.material.opacity = Math.max(0, (1 - day) - cov * 0.8);
    const a = (w.windFrom + 180) * Math.PI / 180;   // direction the wind blows towards
    state.windVec.set(Math.sin(a), -Math.cos(a)).multiplyScalar((w.windKmh || 15) / 3.6);
  }

  function update(dt, camera) {
    stars.position.copy(camera.position);
    state.drift += dt;
    const span = 16000;
    for (const g of clusters) {
      if (!g.visible) continue;
      let x = g.userData.x + state.windVec.x * state.drift * 2, z = g.userData.z + state.windVec.y * state.drift * 2;
      x = ((x - ext.x0 + 6000) % span + span) % span + ext.x0 - 6000;
      z = ((z - ext.z0 + 8000) % span + span) % span + ext.z0 - 8000;
      g.position.x = x; g.position.z = z;
    }
    if (rain.visible) {
      rain.position.set(camera.position.x, camera.position.y - 50, camera.position.z);
      const p = rain.geometry.attributes.position.array, fall = 22 * dt;
      for (let i = 0; i < p.length; i += 6) {
        p[i + 1] -= fall; p[i + 4] -= fall;
        p[i] += state.windVec.x * dt * 0.6; p[i + 3] += state.windVec.x * dt * 0.6;
        if (p[i + 1] < 0) { p[i + 1] += 120; p[i + 4] += 120; }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
  }
  return { apply, update, state, clouds, setCloudsVisible(v) { clouds.visible = v; } };
};

// ---------------------------------------------------------------- live weather via the viewer's AccuWeather connector
VR.startLiveWeather = async function (onWeather, onStatus) {
  const LOCATION = { queryParams: { locationKey: '1122815', unit: 'metric', lang: 'en' } };   // AccuWeather "Belle Ombre, Savanne"
  let mcp = null;
  try { mcp = window.claude && window.claude.use ? await window.claude.use('mcp') : null; } catch (e) { mcp = null; }
  if (!mcp) { onStatus({ kind: 'unavailable' }); return null; }
  onStatus({ kind: 'loading' });
  const handle = ev => {
    if (ev.type === 'data') {
      const w = VR.parseAccuWeather(ev.result.payload);
      if (w) { w.storedAt = ev.result.cache ? ev.result.cache.storedAt : Date.now(); onWeather(w); onStatus({ kind: 'live', storedAt: w.storedAt }); }
      else onStatus({ kind: 'error', code: 'tool_error', message: 'Unexpected weather data' });
    } else onStatus({ kind: 'error', code: ev.error.code, message: ev.error.message });
  };
  let unsub = mcp.watchTool('AccuWeather', 'widgets-current-claude', LOCATION, handle, { refetchInterval: 15 * 60 * 1000, cache: { staleTime: 10 * 60 * 1000, gcTime: 60 * 60 * 1000 } });
  return {
    async retry() {   // used behind a click for approval_required
      try { const r = await mcp.callTool('AccuWeather', 'widgets-current-claude', LOCATION); handle({ type: 'data', result: r }); }
      catch (e) { handle({ type: 'error', error: e }); }
    },
    stop() { unsub && unsub(); unsub = null; },
  };
};
})();
