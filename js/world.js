// Sky, clouds, sea, terrain material and trees for the Bel Ombre model.
(function () {
'use strict';
const VR = window.VR = window.VR || {};

// ------------------------------------------------------------------ sky dome
VR.createSky = function (scene, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color('#2c78c9') }, horizon: { value: new THREE.Color('#cfe7f1') },
      sunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 c = mix(horizon, top, pow(h, 0.5));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0, 0.96, 0.85) * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.22);
        if (d.y < 0.0) c = mix(horizon, vec3(0.42, 0.62, 0.72), min(-d.y * 6.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(25000, 32, 16), mat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  return { mesh: sky, update(camera) { sky.position.copy(camera.position); } };
};

// ------------------------------------------------------------------ clouds (soft billboards)
function cloudTexture(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const x = 40 + rnd() * 176, y = 50 + rnd() * 40 - Math.abs(x - 128) * 0.15, r = 18 + rnd() * 34;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const shade = 235 + rnd() * 20;
    grd.addColorStop(0, `rgba(${shade},${shade},${shade + 5},0.55)`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return new THREE.CanvasTexture(c);
}
VR.createClouds = function (scene, ext) {
  const group = new THREE.Group();
  const texs = [1, 7, 13, 29].map(cloudTexture);
  let s = 99;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 34; i++) {
    const m = new THREE.SpriteMaterial({ map: texs[i % 4], transparent: true, depthWrite: false, opacity: 0.9, fog: true });
    const sp = new THREE.Sprite(m);
    // more cloud over the mountains to the north, as is usual on the island
    const x = ext.x0 - 2000 + rnd() * (ext.x1 - ext.x0 + 4000);
    const z = ext.z0 - 3500 + Math.pow(rnd(), 1.6) * (ext.z1 - ext.z0 + 3500);
    const w = 500 + rnd() * 900;
    sp.scale.set(w, w * 0.45, 1);
    sp.position.set(x, 750 + rnd() * 650, z);
    group.add(sp);
  }
  scene.add(group);
  return group;
};

// ------------------------------------------------------------------ sea
VR.createSea = function (scene, ext, sunDir) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, sunDir: { value: sunDir.clone().normalize() },
      ext: { value: new THREE.Vector4(ext.x0, ext.z0, ext.x1, ext.z1) },
    }]),
    vertexShader: `varying vec3 vWP;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; uniform vec3 sunDir; uniform vec4 ext; varying vec3 vWP;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec2 p = vWP.xz;
        float d = max(max(ext.x - p.x, p.x - ext.z), max(ext.y - p.y, p.y - ext.w));
        float deep = smoothstep(-250.0, 500.0, d);
        float t = time;
        vec3 n = normalize(vec3(
          sin(p.x * 0.045 + t * 1.2) * 0.07 + sin(p.y * 0.12 - t * 1.6 + p.x * 0.03) * 0.05 + sin((p.x + p.y) * 0.41 + t * 2.4) * 0.025 + sin(p.x * 1.3 - t * 3.1) * 0.012,
          1.0,
          cos(p.y * 0.055 + t * 1.05) * 0.07 + cos((p.x * 0.7 - p.y) * 0.23 + t * 1.9) * 0.04 + cos(p.y * 1.1 + t * 2.7) * 0.012));
        vec3 V = normalize(cameraPosition - vWP);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 shallow = vec3(0.30, 0.80, 0.80), deepc = vec3(0.02, 0.20, 0.40);
        vec3 col = mix(shallow, deepc, deep);
        col = mix(col, vec3(0.78, 0.90, 0.96), fres * 0.55);
        float spec = pow(max(dot(reflect(-sunDir, n), V), 0.0), 140.0) * 1.6;
        float a = mix(0.28, 0.98, deep) + fres * 0.35 + spec;
        gl_FragColor = vec4(col + spec, clamp(a, 0.0, 1.0));
        #include <fog_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(70000, 70000, 1, 1), mat);
  sea.rotation.x = -Math.PI / 2; sea.position.y = 0.15; sea.renderOrder = 1;
  scene.add(sea);
  return { mesh: sea, update(t) { mat.uniforms.time.value = t; } };
};

// ------------------------------------------------------------------ terrain material with close-up detail
const NOISE_GLSL = `
  float vrH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vrN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(vrH(i), vrH(i + vec2(1.0, 0.0)), f.x), mix(vrH(i + vec2(0.0, 1.0)), vrH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
VR.NOISE_GLSL = NOISE_GLSL;
VR.terrainMaterial = function (map) {
  const mat = new THREE.MeshLambertMaterial({ map });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;' + NOISE_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dn = vrN(vWP.xz * 0.45) * 0.45 + vrN(vWP.xz * 2.1) * 0.25 + vrN(vWP.xz * 0.06) * 0.30;
        float fade = 1.0 - smoothstep(150.0, 900.0, length(vWP - cameraPosition));
        diffuseColor.rgb *= mix(1.0, 0.84 + dn * 0.32, fade);`);
  };
  return mat;
};

// ------------------------------------------------------------------ golf mowing patterns
VR.stripePattern = function (ctx, a, b, px) {
  const c = document.createElement('canvas'); c.width = c.height = Math.max(4, Math.round(px * 2));
  const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = b; g.fillRect(0, 0, c.width / 2, c.height);
  return ctx.createPattern(c, 'repeat');
};

// ------------------------------------------------------------------ trees
function bend(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, v[0], v[1], v[2]); }
  geo.computeVertexNormals(); return geo;
}
function colorize(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function merge(geos) {
  // minimal merge for non-indexed position/normal/color geometries
  const parts = geos.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
VR.mergeGeometries = merge; VR.colorize = colorize;

function palmGeometry() {
  const H = 11;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, H * 0.35, 0), new THREE.Vector3(1.4, H * 0.7, 0), new THREE.Vector3(2.4, H, 0)]);
  const parts = [colorize(new THREE.TubeGeometry(curve, 4, 0.22, 4, false), '#8a7457')];
  const top = curve.getPoint(1);
  for (let i = 0; i < 8; i++) {
    const g = new THREE.PlaneGeometry(1.1, 5.2, 1, 3);
    bend(g, (x, y) => {
      const t = (y + 2.6) / 5.2;                       // 0 at base, 1 at tip
      const wdt = Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.4);
      return [x * wdt, t * 5.2, -t * t * 2.6 + (Math.abs(x) * 0.5)];
    });
    g.rotateX(-Math.PI / 2 + 0.55 + (i % 2) * 0.25);
    g.rotateY(i / 8 * Math.PI * 2);
    g.translate(top.x, top.y, top.z);
    parts.push(colorize(g, i % 3 ? '#4f8a35' : '#5f9a3d'));
  }
  const nuts = new THREE.IcosahedronGeometry(0.45, 0); nuts.translate(top.x, top.y - 0.4, top.z);
  parts.push(colorize(nuts, '#6b5a2a'));
  return merge(parts);
}
function broadGeometry() {
  const trunk = colorize(new THREE.CylinderGeometry(0.22, 0.35, 4, 5, 1, true).translate(0, 2, 0), '#6d5a45');
  const blobs = [[0, 6.0, 0, 3.1], [1.5, 5.3, 0.7, 2.4], [-1.2, 6.8, -0.8, 2.2]].map(([x, y, z, r], i) =>
    colorize(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.8, 1).rotateY(i * 1.1).translate(x, y, z), ['#3f6e2c', '#4a7a33', '#36632a'][i]));
  return merge([trunk, ...blobs]);
}
function filaoGeometry() {
  const trunk = colorize(new THREE.CylinderGeometry(0.15, 0.3, 10, 4, 1, true).translate(0, 5, 0), '#6a5844');
  const tiers = [[7, 2.4, 5], [10.5, 1.8, 4.6], [13.8, 1.0, 3.4]].map(([y, r, h]) =>
    colorize(new THREE.ConeGeometry(r, h, 6, 1, true).translate(0, y, 0), '#3c5c3b'));
  return merge([trunk, ...tiers]);
}
function flamboyantGeometry() {
  const trunk = colorize(new THREE.CylinderGeometry(0.25, 0.4, 3.2, 6).translate(0, 1.6, 0), '#5f4f40');
  const under = colorize(new THREE.SphereGeometry(4.6, 10, 6).scale(1, 0.32, 1).translate(0, 4.0, 0), '#3d6a2c');
  const bloom = colorize(new THREE.SphereGeometry(4.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(0, 4.3, 0), '#d8452b');
  return merge([trunk, under, bloom]);
}

VR.buildTrees = function (scene, trees, H, opts) {
  const kinds = [palmGeometry(), broadGeometry(), filaoGeometry(), flamboyantGeometry()];
  const counts = [0, 0, 0, 0];
  const step = opts.thin ? 2 : 1;
  for (let i = 0; i < trees.length; i += 3 * step) counts[Math.floor(trees[i + 2] / 100)]++;
  const uniforms = { time: { value: 0 } };
  const meshes = kinds.map((geo, k) => {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: k === 0 ? THREE.DoubleSide : THREE.FrontSide });
    mat.onBeforeCompile = sh => {
      sh.uniforms.time = uniforms.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float sway = max(position.y - 3.0, 0.0) / 10.0;
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          transformed.x += sin(time * 1.4 + ip.x * 0.07 + ip.z * 0.05) * sway * ${k === 0 ? '0.35' : '0.12'};
          transformed.z += cos(time * 1.1 + ip.z * 0.06) * sway * ${k === 0 ? '0.25' : '0.08'};`);
    };
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, counts[k]));
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, counts[k]) * 3), 3);
    m.count = 0; m.frustumCulled = false; m.castShadow = k !== 1; m.receiveShadow = false;
    scene.add(m); return m;
  });
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const list = [];
  for (let i = 0; i < trees.length; i += 3 * step) {
    const x = trees[i] / 10, z = trees[i + 1] / 10, code = trees[i + 2], k = Math.floor(code / 100), s = (code % 100) / 50;
    list.push([x, z, k, s, rnd() * Math.PI * 2, 0.88 + rnd() * 0.24]);
  }
  function place() {
    for (const m of meshes) m.count = 0;
    for (const [x, z, k, s, yaw, tint] of list) {
      const m = meshes[k];
      dummy.position.set(x, H(x, z) - 0.6, z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(s);
      dummy.updateMatrix(); m.setMatrixAt(m.count, dummy.matrix);
      col.setRGB(tint, tint * (0.96 + (tint - 0.88) * 0.3), tint); m.setColorAt(m.count, col);
      m.count++;
    }
    for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  place();
  return {
    meshes, place, count: list.length,
    setVisible(v) { for (const m of meshes) m.visible = v; },
    update(t) { uniforms.time.value = t; },
  };
};
})();
