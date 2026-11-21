// Procedural Christmas-market surroundings: HDR panorama, wooden table, coaster, contact shadow.
import * as THREE from 'three';
import { COMMON } from './shaders/common.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAND = [-12, 33];

// Equirectangular painting of the market at blue hour: u = azimuth, top = zenith. Direction -Z is at u = 0.25.
function paintPanorama() {
  const W = 2048, H = 1024, rnd = rng(7);
  const yOf = (elevDeg) => H / 2 - (elevDeg / 90) * (H / 2);

  // Scenery is painted at half size and scaled up, which softens it like an out-of-focus background.
  const sw = 1024, sh = 512, k = sw / W;
  const small = document.createElement('canvas'); small.width = sw; small.height = sh;
  const s = small.getContext('2d');
  const sky = s.createLinearGradient(0, 0, 0, sh / 2);
  sky.addColorStop(0, '#06123f'); sky.addColorStop(0.55, '#0e2f8c'); sky.addColorStop(0.88, '#2553b8'); sky.addColorStop(1, '#4a72c4');
  s.fillStyle = sky; s.fillRect(0, 0, sw, sh / 2);
  const ground = s.createLinearGradient(0, sh / 2, 0, sh);
  ground.addColorStop(0, '#1b1a22'); ground.addColorStop(0.2, '#0f0e14'); ground.addColorStop(1, '#050508');
  s.fillStyle = ground; s.fillRect(0, sh / 2, sw, sh / 2);

  const rect = (u0, u1, e0, e1, col) => {
    s.fillStyle = col;
    for (const o of [-1, 0, 1]) s.fillRect((u0 + o) * sw, yOf(e1) * k, (u1 - u0) * sw, (yOf(e0) - yOf(e1)) * k);
  };
  const poly = (pts, col) => {
    s.fillStyle = col;
    for (const o of [-1, 0, 1]) { s.beginPath(); pts.forEach(([u, e], i) => { const x = (u + o) * sw, y = yOf(e) * k; if (i) s.lineTo(x, y); else s.moveTo(x, y); }); s.fill(); }
  };
  const blob = (uc, e, ru, re, col) => {
    s.fillStyle = col;
    for (const o of [-1, 0, 1]) { s.beginPath(); s.ellipse((uc + o) * sw, yOf(e) * k, ru * sw, re * (H / 180) * k, 0, 0, 7); s.fill(); }
  };

  // Dim town houses all around.
  let u = 0.47;
  while (u < 1.03) {
    const w = 0.05 + rnd() * 0.08, tall = 7 + rnd() * 7, v = 30 + Math.floor(rnd() * 22);
    rect(u, u + w, 0, tall, `rgb(${v + 14},${v + 12},${v + 24})`);
    rect(u, u + w, tall, tall + 2, '#0c0f1c');
    for (let r = 0; r < Math.floor(tall / 2.6); r++) for (let c = 0; c < Math.floor(w / 0.008); c++)
      rect(u + 0.003 + c * 0.008, u + 0.0068 + c * 0.008, 1.6 + r * 2.6, 3.3 + r * 2.6, rnd() < 0.3 ? '#f3c377' : '#1a2138');
    u += w + 0.003;
  }
  // The floodlit palace behind the mug: warm walls, rows of tall windows, dark mansard roofs, a domed centre.
  const wall = (u0, u1, top) => {
    for (const o of [-1, 0, 1]) {
      const g = s.createLinearGradient(0, yOf(0) * k, 0, yOf(top) * k);
      g.addColorStop(0, '#f6c257'); g.addColorStop(0.55, '#e3b266'); g.addColorStop(1, '#b99468');
      s.fillStyle = g; s.fillRect((u0 + o) * sw, yOf(top) * k, (u1 - u0) * sw, (yOf(0) - yOf(top)) * k);
    }
    rect(u0, u1, top - 0.5, top, '#f1d9a6');
    for (let r = 0; r < 3; r++) for (let x = u0 + 0.006; x < u1 - 0.006; x += 0.0125) {
      const e0 = 1.3 + r * (top - 1.5) / 3;
      rect(x, x + 0.0062, e0, e0 + (top - 1.5) / 3 * 0.68, '#f4e2ba');
      rect(x + 0.001, x + 0.0052, e0 + 0.15, e0 + (top - 1.5) / 3 * 0.62, rnd() < 0.12 ? '#ffd58a' : '#27314e');
    }
  };
  wall(0.03, 0.47, 9.5); rect(0.03, 0.47, 9.5, 12.2, '#0b0e1c');
  for (let x = 0.045; x < 0.46; x += 0.025) blob(x, 10.8, 0.0028, 0.55, '#c9a56c');
  for (const [c, hw, top] of [[0.25, 0.04, 13], [0.055, 0.028, 11.5], [0.445, 0.028, 11.5]]) {
    wall(c - hw, c + hw, top);
    poly([[c - hw, top], [c - hw * 0.82, top + 3.6], [c + hw * 0.82, top + 3.6], [c + hw, top]], '#0b0e1c');
    for (const dx of [-0.5, 0, 0.5]) blob(c + dx * hw, top + 1.7, 0.0032, 0.6, '#c9a56c');
  }
  // The blue-lit tent with its pointed top.
  for (const [c, wdt, top] of [[0.215, 0.05, 10.5]]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20 * 2 - 1; pts.push([c + t * wdt, 2.2 + (top - 2.2) * Math.pow(1 - Math.abs(t), 2.2)]); }
    poly(pts, '#8fb0f5'); poly(pts.map(([x, e]) => [c + (x - c) * 0.45, e]), '#bcd0ff');
  }
  // Wooden stalls with dark shingle roofs.
  for (const [a, b] of [[0.1, 0.19], [0.27, 0.4], [0.5, 0.6], [0.66, 0.78], [0.84, 0.95]]) {
    rect(a, b, -1.5, 3.4, '#6a4a2c');
    for (let x = a; x < b; x += 0.014) rect(x, x + 0.0025, -1.5, 3.4, '#2e2014');
    rect(a + 0.012, b - 0.012, 0.2, 2.6, '#f2bf6e');
    poly([[a - 0.006, 3.4], [a + 0.012, 5.6], [b - 0.012, 5.6], [b + 0.006, 3.4]], '#3a2a1c');
  }
  // Bare trees and a crowd in silhouette.
  for (const uc of [0.33, 0.62, 0.8]) { blob(uc, 6, 0.012, 5, '#141826'); rect(uc - 0.0015, uc + 0.0015, -1, 4, '#101320'); }
  const coats = ['#090a10', '#0d0f18', '#12141d', '#0b0d14', '#16202e', '#2a1d16', '#b8923a'];
  for (let i = 0; i < 150; i++) {
    const uc = rnd(), near = rnd(), col = coats[Math.floor(Math.pow(rnd(), 1.6) * coats.length)];
    const hgt = 2.2 + near * 3.2;
    blob(uc, -2.2 + hgt * 0.45, 0.0035 + near * 0.004, hgt * 0.55, col); blob(uc, -2.2 + hgt * 1.05, 0.0022 + near * 0.002, 0.55 + near * 0.5, col);
  }
  for (let i = 0; i < 9; i++) { const a = rnd(); rect(a, a + 0.08, -5.2, -3.8, '#1c110b'); }

  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(small, 0, 0, W, H);

  // Lights live on their own layer so they can be made far brighter than the scenery.
  const lc = document.createElement('canvas'); lc.width = W; lc.height = H;
  const l = lc.getContext('2d');
  l.fillStyle = '#000'; l.fillRect(0, 0, W, H);
  l.globalCompositeOperation = 'lighter';
  // The same lights again at twice the resolution, for the strip of sky the camera looks at directly
  // (elevation BAND[0]..BAND[1] degrees), so the bokeh discs stay round when magnified.
  const bc = document.createElement('canvas'); bc.width = W * 2; bc.height = 512;
  const bl = bc.getContext('2d');
  bl.fillStyle = '#000'; bl.fillRect(0, 0, bc.width, bc.height);
  bl.globalCompositeOperation = 'lighter';
  const put = (ctx, x, y, r, rgb, a, soft) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (soft) { g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); }
    else {
      g.addColorStop(0, `rgba(${rgb},${a * 0.7})`); g.addColorStop(0.8, `rgba(${rgb},${a})`);
      g.addColorStop(0.93, `rgba(${rgb},${a * 0.9})`); g.addColorStop(1, `rgba(${rgb},0)`);
    }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  };
  const disc = (uc, e, r, rgb, a, soft) => {
    for (const o of [-1, 0, 1]) {
      const x = (uc + o) * W, y = yOf(e);
      if (x < -r || x > W + r) continue;
      put(l, x, y, r, rgb, a, soft);
      put(bl, x * 2, (BAND[1] - e) / (BAND[1] - BAND[0]) * 512, r * 2, rgb, a, soft);
    }
  };
  const warm = '255,160,60', gold = '255,196,110', red = '255,40,24', cool = '190,215,255', blue = '70,120,255';
  // Bulb strings along the stall roofs.
  for (const [a, b] of [[0.1, 0.19], [0.27, 0.4], [0.5, 0.6], [0.66, 0.78], [0.84, 0.95]]) {
    for (let x = a - 0.006; x <= b + 0.006; x += 0.0062) disc(x, 3.5 + rnd() * 0.2, 5.5 + rnd() * 2.5, gold, 0.55 + rnd() * 0.35);
    for (let x = a + 0.012; x <= b - 0.012; x += 0.0062) disc(x, 5.7, 5 + rnd() * 2, gold, 0.4 + rnd() * 0.3);
    for (let i = 0; i < 26; i++) disc(a + rnd() * (b - a), -1 + rnd() * 4, 4 + rnd() * 4, warm, 0.2 + rnd() * 0.4);
  }
  // Nets of fairy lights and lit trees.
  for (const [uc, ru, e, re, n] of [[0.145, 0.05, 6.5, 3.2, 150], [0.33, 0.02, 6, 4.5, 70], [0.62, 0.02, 6, 4.5, 70], [0.8, 0.02, 6, 4.5, 70], [0.72, 0.05, 7, 2.5, 90]]) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd());
      disc(uc + Math.cos(a) * r * ru, e + Math.sin(a) * r * re, 4 + rnd() * 5, rnd() < 0.12 ? red : gold, 0.25 + rnd() * 0.5);
    }
  }
  disc(0.215, 5.5, 46, blue, 0.5, true); disc(0.215, 4, 26, cool, 0.35, true);
  for (const uc of [0.36, 0.44, 0.56, 0.9, 0.02]) disc(uc, 7.5, 8, cool, 0.9);            // street lamps
  // A few higher lights on the camera's side so the glass always has something to reflect.
  for (let i = 0; i < 110; i++) disc(0.46 + rnd() * 0.58, rnd() < 0.7 ? rnd() * 14 : 14 + rnd() * 16, 5 + rnd() * 9, rnd() < 0.8 ? warm : cool, 0.15 + rnd() * 0.5);
  for (let i = 0; i < 40; i++) disc(rnd() * 0.46, rnd() * 9, 4 + rnd() * 6, warm, 0.15 + rnd() * 0.4);
  return { scenery: cv, lights: lc, band: bc };
}

// A Christmas pyramid on a market stall: shingle roof edged with bulbs, a starred spire and a turning fan.
function buildPyramidStall() {
  const g = new THREE.Group(), rnd = rng(3);
  const std = (color, emissive = 0x000000, ei = 1, extra = {}) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.85, ...extra });
  const body = new THREE.Mesh(new THREE.BoxGeometry(46, 22, 34), std(0x5a3d22, 0x2a1808, 0.6));
  body.position.y = 11; g.add(body);
  const counter = new THREE.Mesh(new THREE.PlaneGeometry(34, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.85, 0.28) }));
  counter.position.set(0, 12, 17.1); g.add(counter);
  // hipped roof: square frustum
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(15, 37, 11, 4, 1), std(0x8a5a36, 0x6b3f1c, 0.75, { flatShading: true }));
  roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.78); roof.position.y = 27.5; g.add(roof);
  const tier = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8.5, 8, 8), std(0xd9c79a, 0x6b5a34, 0.7));
  tier.position.y = 37; g.add(tier);
  // spire with stars
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const c = cv.getContext('2d'); c.fillStyle = '#efe0b4'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#4a2f22';
  const star = (x, y, r) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill(); };
  for (let f = 0; f < 4; f++) { star(f * 64 + 22, 200, 11); star(f * 64 + 44, 205, 10); star(f * 64 + 27, 140, 8); star(f * 64 + 41, 132, 7); star(f * 64 + 32, 80, 5); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(8.5, 24, 4, 1), std(0xffffff, 0x8a744a, 0.75, { map: tex, emissiveMap: tex, flatShading: true }));
  spire.rotation.y = Math.PI / 4; spire.position.y = 53; g.add(spire);
  // fan
  const fan = new THREE.Group(); fan.position.y = 67;
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.BufferAttribute(new Float32Array([3, 0, -1, 24, 0, -5.2, 24, 0, 5.2, 3, 0, -1, 24, 0, 5.2, 3, 0, 1]), 3));
  blade.computeVertexNormals();
  const bm = std(0xa86a50, 0x6a3a26, 1.0, { side: THREE.DoubleSide, roughness: 0.6 });
  for (let i = 0; i < 12; i++) {
    const hold = new THREE.Group(), m = new THREE.Mesh(blade, bm);
    m.rotation.x = 0.42; hold.rotation.y = i / 12 * Math.PI * 2; hold.add(m); fan.add(hold);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.2, 12), std(0x9a8a6a)); fan.add(hub);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6), std(0x9a8a6a)); mast.position.y = 65.5; g.add(mast);
  g.add(fan);
  // bulbs along the roof edges
  const pts = [];
  const edge = (ax, ay, az, bx, by, bz, n) => { for (let i = 0; i <= n; i++) { const t = i / n; pts.push([ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t]); } };
  const hx = 26.3, hz = 20.5, tx = 10.6, tz = 8.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) edge(sx * hx, 22.3, sz * hz, sx * tx, 33.3, sz * tz, 9);
  edge(-hx, 22.3, hz, hx, 22.3, hz, 22); edge(-tx, 33.3, tz, tx, 33.3, tz, 9); edge(hx, 22.3, hz, hx, 22.3, -hz, 16); edge(-hx, 22.3, hz, -hx, 22.3, -hz, 16);
  for (let i = 0; i < 46; i++) pts.push([-22 + rnd() * 44, 2 + rnd() * 18, 17.4]);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.62, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.6, 2.2) }), pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach((p, i) => bulbs.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
  g.add(bulbs);
  return { group: g, fan };
}

function paintWood() {
  const S = 1024, rnd = rng(21);
  const col = document.createElement('canvas'); col.width = col.height = S;
  const rough = document.createElement('canvas'); rough.width = rough.height = S;
  const bump = document.createElement('canvas'); bump.width = bump.height = S;
  const c = col.getContext('2d'), r = rough.getContext('2d'), b = bump.getContext('2d');
  r.fillStyle = '#7c7c7c'; r.fillRect(0, 0, S, S);
  b.fillStyle = '#808080'; b.fillRect(0, 0, S, S);
  const planks = 4, ph = S / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const tone = 0.8 + rnd() * 0.4;
    c.fillStyle = `rgb(${Math.round(58 * tone)},${Math.round(28 * tone)},${Math.round(17 * tone)})`;
    c.fillRect(0, y0, S, ph);
    for (let i = 0; i < 150; i++) {
      const y = y0 + rnd() * ph, amp = 2 + rnd() * 5, f = 1 + Math.floor(rnd() * 3), phs = rnd() * 7;
      const dark = rnd() < 0.6;
      const path = (ctx) => {
        ctx.beginPath();
        for (let x = 0; x <= S; x += 16) {
          const yy = y + Math.sin((x / S) * Math.PI * 2 * f + phs) * amp;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      };
      c.lineWidth = 1.5 + rnd() * 4;
      c.strokeStyle = dark ? `rgba(22,9,5,${0.1 + rnd() * 0.3})` : `rgba(120,66,38,${0.05 + rnd() * 0.12})`;
      path(c);
      b.lineWidth = c.lineWidth; b.strokeStyle = dark ? 'rgba(40,40,40,0.35)' : 'rgba(190,190,190,0.2)'; path(b);
      r.lineWidth = c.lineWidth * 2; r.strokeStyle = dark ? 'rgba(170,170,170,0.2)' : 'rgba(40,40,40,0.14)'; path(r);
    }
    // gap between planks
    for (const ctx of [c, b]) { ctx.fillStyle = ctx === c ? '#0b0605' : '#000'; ctx.fillRect(0, y0, S, 7); }
    r.fillStyle = '#e0e0e0'; r.fillRect(0, y0, S, 7);
  }
  // Damp patches make the surface glossier in places.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S, y = rnd() * S, rr = 40 + rnd() * 150;
    const g = r.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(18,18,18,0.55)'); g.addColorStop(1, 'rgba(18,18,18,0)');
    r.fillStyle = g; r.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  return { col, rough, bump };
}

function paintCoaster() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#efece4'; c.fillRect(0, 0, S, S);
  c.strokeStyle = '#3a6fb0'; c.lineWidth = 5; c.strokeRect(26, 26, S - 52, S - 52);
  c.fillStyle = '#3a4a5c'; c.textAlign = 'center';
  c.font = 'italic 600 44px Georgia, serif'; c.fillText('Prost!', S / 2, 108);
  c.font = '22px Georgia, serif'; c.fillText('Út a habkoronáig', S / 2, 150);
  c.font = '17px Georgia, serif'; c.fillStyle = '#7c8794';
  c.fillText('Buborékoknak nyitva: az első kortyig', S / 2, S - 60);
  return cv;
}

export function createEnvironment(renderer, scene, U) {
  // HDR panorama: the painted lights are pushed well above 1.0 so they bloom and reflect brightly.
  const painted = paintPanorama();
  const pano = new THREE.CanvasTexture(painted.scenery), lights = new THREE.CanvasTexture(painted.lights);
  pano.colorSpace = lights.colorSpace = THREE.NoColorSpace;
  const envRT = new THREE.WebGLRenderTarget(2048, 1024, {
    type: THREE.HalfFloatType, depthBuffer: false,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
  });
  envRT.texture.wrapS = THREE.RepeatWrapping;
  envRT.texture.mapping = THREE.EquirectangularReflectionMapping;
  const bake = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { tMap: { value: pano }, tLights: { value: lights } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tMap, tLights; varying vec2 vUv;
        void main() {
          vec3 c = pow(texture2D(tMap, vUv).rgb, vec3(2.2)) * 0.9;
          vec3 l = pow(texture2D(tLights, vUv).rgb, vec3(2.2));
          gl_FragColor = vec4(c + l * 7.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    }));
  bake.frustumCulled = false;
  const bakeScene = new THREE.Scene(); bakeScene.add(bake);
  renderer.setRenderTarget(envRT);
  renderer.render(bakeScene, new THREE.Camera());
  renderer.setRenderTarget(null);
  lights.dispose();
  const band = new THREE.CanvasTexture(painted.band);
  band.colorSpace = THREE.NoColorSpace; band.wrapS = THREE.RepeatWrapping; band.generateMipmaps = false; band.minFilter = THREE.LinearFilter;
  pano.wrapS = THREE.RepeatWrapping; pano.generateMipmaps = false; pano.minFilter = THREE.LinearFilter;
  U.uEnv.value = envRT.texture;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envRT.texture).texture;
  pmrem.dispose();

  // Sky dome that follows the camera.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { tScenery: { value: pano }, tBand: { value: band }, uBand: { value: new THREE.Vector2(BAND[0], BAND[1]) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = viewMatrix * vec4(position * 300.0 + cameraPosition, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: /* glsl */`
        uniform sampler2D tScenery, tBand; uniform vec2 uBand; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float el = asin(clamp(d.y, -1.0, 1.0));
          vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, el * 0.31830989 + 0.5);
          vec3 c = pow(textureLod(tScenery, uv, 0.0).rgb, vec3(2.2)) * 0.9;
          float vb = (degrees(el) - uBand.x) / (uBand.y - uBand.x);
          if (vb > 0.0 && vb < 1.0) c += pow(textureLod(tBand, vec2(uv.x, vb), 0.0).rgb, vec3(2.2)) * 7.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false,
    }));
  dome.frustumCulled = false; dome.renderOrder = -10;
  scene.add(dome);

  // Tables.
  const wood = paintWood();
  const mk = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.4, 1);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const woodMat = new THREE.MeshStandardMaterial({
    map: mk(wood.col, true), roughnessMap: mk(wood.rough), bumpMap: mk(wood.bump), bumpScale: 0.12,
    roughness: 0.75, metalness: 0.0, envMapIntensity: 0.6,
  });
  const tables = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(96, 1.4, 36), woodMat);
  top.position.set(0, -0.7, -4);
  const back = new THREE.Mesh(new THREE.BoxGeometry(96, 1.4, 36), woodMat);
  back.position.set(10, -0.7, -62);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(96, 1.2, 11), woodMat);
  bench.position.set(4, -9.5, -33);
  tables.add(top, back, bench);
  tables.rotation.y = -0.16;
  scene.add(tables);

  // Coaster under the mug.
  const sh = new THREE.Shape(), a = 5.3, rr = 0.9;
  sh.moveTo(-a + rr, -a); sh.lineTo(a - rr, -a); sh.quadraticCurveTo(a, -a, a, -a + rr);
  sh.lineTo(a, a - rr); sh.quadraticCurveTo(a, a, a - rr, a); sh.lineTo(-a + rr, a);
  sh.quadraticCurveTo(-a, a, -a, a - rr); sh.lineTo(-a, -a + rr); sh.quadraticCurveTo(-a, -a, -a + rr, -a);
  const cg = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false });
  cg.rotateX(-Math.PI / 2);
  const uvs = cg.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, (uvs.getX(i) + a) / (2 * a), (uvs.getY(i) + a) / (2 * a));
  const ct = new THREE.CanvasTexture(paintCoaster()); ct.colorSpace = THREE.SRGBColorSpace; ct.anisotropy = 4;
  const coaster = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.92, envMapIntensity: 0.9 }));
  coaster.rotation.y = 0.32;
  scene.add(coaster);

  // Contact shadow plus the golden light the beer throws on the table.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 34),
    new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uEnv: U.uEnv, uLift: { value: 0 }, uBeer: { value: 1 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: COMMON + /* glsl */`
        uniform float uLift, uBeer; varying vec2 vP;
        void main() {
          float r = length(vP);
          float ao = (0.62 * smoothstep(8.5, 4.2, r) + 0.3 * smoothstep(5.4, 4.5, r)) * (1.0 - uLift);
          vec2 q = vP - vec2(-1.6, -3.4);
          float lobe = exp(-dot(q, q) / 16.0) * smoothstep(4.3, 5.6, r);
          float rip = 0.6 + 0.8 * vnoise(vP * 1.6 + uTime * 0.25) * vnoise(vP * 3.1 - uTime * 0.2);
          vec3 ca = vec3(1.0, 0.56, 0.08) * lobe * rip * 1.5 * uBeer * (1.0 - uLift);
          float fade = smoothstep(17.0, 12.0, r);
          gl_FragColor = vec4(ca * fade, ao * fade);
        }`,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.125; glow.renderOrder = 2;
  scene.add(glow);

  // The pyramid stall stands behind the tables, small and far so it stays in the frame.
  const stall = buildPyramidStall();
  stall.group.position.set(60, -7, -78); stall.group.rotation.y = -0.75; stall.group.scale.setScalar(0.6);
  // Warm light from the stalls so the wood keeps its colour under the blue sky.
  const l1 = new THREE.DirectionalLight(0xffb672, 1.5); l1.position.set(40, 30, -30);
  const l2 = new THREE.DirectionalLight(0xffc890, 0.9); l2.position.set(-30, 35, 45);
  scene.add(l1, l2);
  scene.add(stall.group);

  return { dome, glow, tableTopY: 0.12, update(dt) { stall.fan.rotation.y += dt * 0.45; } };
}
