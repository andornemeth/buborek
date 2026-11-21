// The mug: dimpled glass body with printed label, the beer volume and the foam crown.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMMON, BEER } from './shaders/common.js';
import { YB, RIM, L0, SHAPES, innerR, quality } from './params.js';
import labelKrug from '../assets/label.png';
import labelBarrel from '../assets/label-pub.png';

// Catmull-Rom through the outer silhouette points (height, radius) read off the photos.
function outerRadius(pts, y) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, r0] = pts[i], [y1, r1] = pts[i + 1];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      const [, rp] = pts[Math.max(0, i - 1)], [, rn] = pts[Math.min(pts.length - 1, i + 2)];
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * r0) + (-rp + r1) * t + (2 * rp - 5 * r0 + 4 * r1 - rn) * t2 + (-rp + 3 * r0 - 3 * r1 + rn) * t3);
    }
  }
  return pts[pts.length - 1][1];
}

// Surface of revolution from a profile of [radius, height, dimpleWeight, isOuterWall]; faces point
// outward when the profile runs upward. Normals come from finite differences, so dimples shade correctly.
function revolve(prof, seg, dimple) {
  const NP = prof.length, NT = seg + 1;
  const pos = new Float32Array(NP * NT * 3), nor = new Float32Array(NP * NT * 3), outer = new Float32Array(NP * NT);
  const P = (i, j, out) => {
    const th = -Math.PI + (j / seg) * Math.PI * 2;
    const [r0, y, w] = prof[i];
    const r = r0 - (w > 0 ? w * dimple(th, y) : 0);
    out[0] = r * Math.sin(th); out[1] = y; out[2] = r * Math.cos(th);
    return out;
  };
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
  for (let i = 0; i < NP; i++) for (let j = 0; j < NT; j++) {
    const k = (i * NT + j) * 3;
    P(i, j, a); pos[k] = a[0]; pos[k + 1] = a[1]; pos[k + 2] = a[2];
    outer[i * NT + j] = prof[i][3] || 0;
    if (prof[i][0] < 1e-4) { nor[k] = 0; nor[k + 1] = i < NP / 2 ? -1 : 1; nor[k + 2] = 0; continue; }
    P(i, j - 1, a); P(i, j + 1, b);
    P(Math.max(0, i - 1), j, c); P(Math.min(NP - 1, i + 1), j, d);
    const tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const ux = d[0] - c[0], uy = d[1] - c[1], uz = d[2] - c[2];
    const nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux;
    const l = Math.hypot(nx, ny, nz) || 1;
    nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
  }
  const idx = [];
  for (let i = 0; i < NP - 1; i++) for (let j = 0; j < seg; j++) {
    const p0 = i * NT + j, p1 = p0 + 1, q0 = p0 + NT, q1 = q0 + 1;
    idx.push(p0, p1, q0, p1, q1, q0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aOuter', new THREE.BufferAttribute(outer, 1));
  g.setIndex(idx);
  return g;
}

function buildGlassGeometry(shape, seg) {
  // Profile: bottom centre -> outer wall up -> lip -> inner wall down -> inner bottom centre.
  const prof = [], foot = shape.outer[0][1];
  for (let i = 0; i <= 8; i++) prof.push([foot * (i / 8), 0, 0, 0]);
  const NW = 150, [d0, d1] = shape.dimpleY;
  for (let i = 1; i <= NW; i++) {
    const y = RIM * (i / NW);
    const w = Math.min(1, Math.max(0, (y - d0) / 0.4)) * Math.min(1, Math.max(0, (d1 - y) / 0.4));
    prof.push([outerRadius(shape.outer, y), y, w, 1]);
  }
  const rt = innerR(shape, 14.85);
  prof.push([rt + 0.26, 15.06, 0, 0], [rt + 0.12, 15.04, 0, 0], [rt + 0.02, 14.96, 0, 0]);
  for (let i = 0; i <= 40; i++) { const y = 14.85 - (14.85 - YB - 0.12) * (i / 40); prof.push([innerR(shape, y), y, 0, 0]); }
  const rb = innerR(shape, YB);
  prof.push([rb - 0.05, YB + 0.03, 0, 0]);
  for (let i = 1; i <= 8; i++) prof.push([(rb - 0.12) * (1 - i / 8), YB, 0, 0]);
  return revolve(prof, seg, shape.dimple);
}

function buildHandle(shape) {
  const curve = new THREE.CatmullRomCurve3(shape.handle.map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const g = new THREE.TubeGeometry(curve, 48, 0.56, 14, false);
  g.scale(1, 1, 1.35);
  g.deleteAttribute('uv');
  g.setAttribute('aOuter', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
}

function buildShellGeometry(shape) {
  const tag = (g, v) => {
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
    for (const n of ['uv', 'normal', 'aOuter']) if (g.attributes[n]) g.deleteAttribute(n);
    return g;
  };
  const prof = [];
  for (let i = 0; i <= 48; i++) { const y = YB + (RIM - YB) * (i / 48); prof.push([innerR(shape, y), y, 0, 0]); }
  const side = revolve(prof, 96, null);
  const bottom = new THREE.CircleGeometry(innerR(shape, YB), 96); bottom.rotateX(Math.PI / 2); bottom.translate(0, YB, 0);
  const cap = new THREE.CircleGeometry(shape.A + 0.4, 96); cap.rotateX(-Math.PI / 2);
  return mergeGeometries([tag(side, 0), tag(bottom, 1), tag(cap, 2)]);
}

function buildFoamGeometry() {
  // Lathe profile in (r, t) with unit radius: t = 1 is the top of the foam, t = 0 its base at the wall.
  const pts = [];
  for (let i = 0; i <= 22; i++) pts.push(new THREE.Vector2(i / 22, 1));
  for (let i = 1; i <= 8; i++) pts.push(new THREE.Vector2(1, 1 - i / 8));
  const g = new THREE.LatheGeometry(pts, 96);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  return g;
}

const loadImage = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
const inked = (img) => {
  const ink = document.createElement('canvas'); ink.width = img.width; ink.height = img.height;
  const k = ink.getContext('2d');
  k.drawImage(img, 0, 0); k.globalCompositeOperation = 'source-in'; k.fillStyle = '#0a0907'; k.fillRect(0, 0, ink.width, ink.height);
  return ink;
};

async function paintDecalBarrel() {
  const img = await loadImage(labelBarrel);
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  cv.getContext('2d').drawImage(inked(img), 52, 93, 920, 838);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

async function paintDecalKrug() {
  const img = await loadImage(labelKrug);
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const lw = 841, lh = 751;
  c.drawImage(inked(img), (S - lw) / 2, 85, lw, lh);

  // Gold wheat ears either side of the building, hop cones below them.
  const ear = (sx) => {
    const X = (x) => S / 2 + sx * x;
    const p0 = [268, 840], p1 = [338, 650], p2 = [304, 450];
    const at = (t) => [(1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1]];
    c.strokeStyle = '#a8842a'; c.lineWidth = 3.2; c.lineCap = 'round';
    c.beginPath();
    for (let t = 0; t <= 1.001; t += 0.05) { const [x, y] = at(t); if (t === 0) c.moveTo(X(x), y); else c.lineTo(X(x), y); }
    c.stroke();
    for (let i = 0; i < 11; i++) {
      const t = 0.42 + i * 0.052, [x, y] = at(t), [x2, y2] = at(t + 0.02);
      const ang = Math.atan2(y2 - y, (x2 - x) * sx);
      for (const side of [-1, 1]) {
        c.save(); c.translate(X(x), y); c.rotate(ang + side * 0.62 * sx);
        c.fillStyle = '#c29a35'; c.beginPath(); c.ellipse(13, 0, 13, 5.2, 0, 0, 7); c.fill();
        c.strokeStyle = '#a8842a'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(24, 0); c.lineTo(52, -3 * side); c.stroke();
        c.restore();
      }
    }
    // hop cone with a leaf
    c.save(); c.translate(X(326), 900); c.rotate(sx * 0.5);
    c.fillStyle = '#7f8a2a';
    for (let r = 0; r < 5; r++) for (let q = -r; q <= r; q += 2) {
      c.beginPath(); c.ellipse(q * 7.5 * 0.5 * (1.4 - r * 0.08), -34 + r * 15, 9.5, 11, 0, 0, 7); c.fill();
    }
    c.strokeStyle = '#4e5718'; c.lineWidth = 1.2;
    for (let r = 0; r < 5; r++) { c.beginPath(); c.arc(0, -40 + r * 15, 9 + r * 4.5, 0.25, Math.PI - 0.25); c.stroke(); }
    c.fillStyle = '#8f9a30'; c.beginPath();
    c.moveTo(-6, -40); c.quadraticCurveTo(-48, -70, -62, -44); c.quadraticCurveTo(-40, -30, -6, -40); c.fill();
    c.restore();
  };
  ear(-1); ear(1);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const VARY = /* glsl */`
varying vec3 vPos; varying vec3 vNl; varying vec3 vWorld; varying vec3 vNw; varying float vOuter;`;

export async function createMug(U, theme) {
  const shape = SHAPES[theme.shape];
  const decal = await (shape.id === 0 ? paintDecalKrug() : paintDecalBarrel());
  const group = new THREE.Group();

  // Per-mug uniforms shared by everything that lives in this mug.
  const mu = {
    uCam: { value: new THREE.Vector3() },
    uSurf: { value: new THREE.Vector4(0, 1, 0, L0) },
    uMugRot: { value: new THREE.Matrix3() },
    uSigma: { value: 0.45 },
    uFogDeep: { value: new THREE.Vector3(...theme.fogDeep) },
    uFogBright: { value: new THREE.Vector3(...theme.fogBright) },
    uQuad: { value: new THREE.Vector4(shape.A * shape.A, shape.B, shape.YC, shape.id) },
    uTop: { value: shape.top },
    uDecalMap: { value: new THREE.Vector3(shape.decal.thHalf, shape.decal.y0, shape.decal.y1) },
    uFoamR: { value: innerR(shape, L0) }, uFoamMax: { value: theme.foamMax }, uDome: { value: shape.id === 0 ? 0.22 : 1.0 },
    uFogGain: { value: 1 },
    uEdible: { value: 0 },                 // bubbles smaller than this can be absorbed
    uDanger: { value: 1e9 },               // bubbles bigger than this hurt
    uShade: { value: 0 },
    uLevelY: { value: L0 },
    uFoamH: { value: theme.foam },
    uLace: { value: new THREE.Vector2(L0 + theme.foam, L0 + theme.foam) },   // (current foam top, initial foam top)
    uDecal: { value: decal },
    uEnv: U.uEnv, uTime: U.uTime, uScene: U.uScene, uRes: U.uRes, uProj: U.uProj,
  };

  // --- Glass (refractive pass) ---
  const glassMat = new THREE.ShaderMaterial({
    uniforms: mu,
    vertexShader: VARY + /* glsl */`
      attribute float aOuter;
      void main() {
        vPos = position; vNl = normal; vOuter = aOuter;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz; vNw = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: COMMON + VARY + /* glsl */`
      uniform sampler2D uScene, uDecal; uniform vec2 uRes, uLace, uProj; uniform float uLevelY; uniform vec3 uDecalMap;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vNw);
        float outerW = step(0.5, vOuter) * step(0.3, vPos.y);
        float th = atan(vPos.x, vPos.z);

        // Condensation: sparse droplets on the cold part of the wall.
        float band = outerW * smoothstep(uLevelY + 1.2, uLevelY - 0.6, vPos.y) * smoothstep(1.9, 3.2, vPos.y);
        band *= smoothstep(0.6, 0.8, vnoise(vec2(th * 2.6, vPos.y * 0.7) + 3.7));
        vec3 vo = voronoi(vec2(th * 64.0, vPos.y * 14.0));
        float drop = band * smoothstep(0.26, 0.1, vo.z) * 0.6;
        vec3 Tw = normalize(cross(vec3(0.0, 1.0, 0.0), N) + 1e-4), Bw = cross(N, Tw);
        N = normalize(N - (Tw * vo.x + Bw * vo.y) * drop * 2.2);

        float cosv = clamp(dot(N, V), 0.0, 1.0);
        float F = 0.04 + 0.96 * pow(1.0 - cosv, 5.0);
        vec3 R = reflect(-V, N);
        vec3 refl = envSample(R, 0.6);

        // Screen-space refraction of everything behind the glass.
        vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
        float dist = length(cameraPosition - vWorld);
        vec2 sc = uProj / dist * 0.5;
        float thick = 0.5 + 2.4 * pow(1.0 - cosv, 2.0);
        vec2 off = -Nv.xy * sc * thick;
        float base = (1.0 - smoothstep(1.15, 1.95, vPos.y)) * step(0.5, vOuter);
        off.y += base * sc.y * 1.9;
        vec2 suv = gl_FragCoord.xy / uRes;
        vec3 tr;
        tr.r = texture(uScene, clamp(suv + off * 0.93, 0.002, 0.998)).r;
        tr.g = texture(uScene, clamp(suv + off, 0.002, 0.998)).g;
        tr.b = texture(uScene, clamp(suv + off * 1.07, 0.002, 0.998)).b;
        tr *= mix(vec3(0.975, 0.99, 0.98), vec3(0.74, 0.88, 0.82), pow(1.0 - cosv, 3.0));
        // Thick foot: paler, streaked with caustics, with a dark line where the floor of the mug sits.
        float streak = vnoise(vec2(th * 22.0, vPos.y * 3.0)) * vnoise(vec2(th * 7.0 + 3.0, vPos.y * 9.0));
        tr = mix(tr, tr * vec3(1.02, 0.97, 0.8) * (0.72 + 1.5 * streak) + vec3(0.05, 0.04, 0.02), base * 0.85);
        float groove = smoothstep(0.16, 0.0, abs(vPos.y - 1.66)) * step(0.5, vOuter);
        tr *= 1.0 - 0.5 * groove;
        tr += drop * 0.12 * envSample(N, 5.0);

        // Foam lace left on the wall above the falling level.
        float lace = outerW * smoothstep(uLace.x - 0.1, uLace.x + 0.5, vPos.y) * smoothstep(uLace.y + 0.2, uLace.y - 0.4, vPos.y);
        lace *= smoothstep(0.46, 0.7, fbm(vec2(th * 5.0, vPos.y * 2.2)));
        tr = mix(tr, vec3(0.92, 0.9, 0.82) * (0.25 + envSample(N, 6.0)), lace * 0.55);

        vec3 col = mix(tr, refl, F);

        // Printed label.
        vec2 duv = vec2((th + uDecalMap.x) / (2.0 * uDecalMap.x), (vPos.y - uDecalMap.y) / (uDecalMap.z - uDecalMap.y));
        if (outerW > 0.5 && duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) {
          vec4 d = texture(uDecal, duv);
          vec3 ink = d.rgb * (0.3 + 1.1 * envSample(N, 6.0));
          col = mix(col, ink + refl * F, d.a);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const glass = new THREE.Mesh(mergeGeometries([buildGlassGeometry(shape, quality.mugSeg), buildHandle(shape)]), glassMat);
  glass.layers.set(1); glass.renderOrder = 10;
  group.add(glass);

  // --- Beer volume: the inside of the liquid's boundary, drawn through the haze ---
  const shellMat = new THREE.ShaderMaterial({
    uniforms: mu, side: THREE.BackSide,
    vertexShader: /* glsl */`
      uniform vec4 uSurf; attribute float aPart; varying vec3 vPos; varying float vPart;
      void main() {
        vec3 p = position;
        if (aPart > 1.5) p.y = (uSurf.w - uSurf.x * p.x - uSurf.z * p.z) / uSurf.y;
        vPos = p; vPart = aPart;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: COMMON + BEER + /* glsl */`
      uniform sampler2D uDecal; uniform vec3 uDecalMap; varying vec3 vPos; varying float vPart;
      void main() {
        vec3 p = vPos;
        float h = dot(uSurf.xyz, p) - uSurf.w;
        vec3 rd = normalize(p - uCam);
        vec3 col;
        if (vPart < 0.5) {
          if (h > 0.0) discard;
          // Wall seen from the liquid: a round window to the outside, mirror beyond the critical angle.
          float th = atan(p.x, p.z);
          float qy = p.y < uTop ? p.y - uQuad.z : 0.0;
          vec3 nIn = -normalize(vec3(p.x, uQuad.y * qy, p.z));
          vec3 tang = normalize(vec3(-p.z, 0.0, p.x));
          float e = 0.02;
          float d0 = dimple(th, p.y);
          vec2 g = vec2(dimple(th + e, p.y) - d0, dimple(th, p.y + e) - d0) / e;
          vec3 nP = normalize(nIn + (tang * g.x * 0.25 + vec3(0.0, 1.0, 0.0) * g.y) * 0.9);
          float cosi = max(dot(-rd, nP), 0.0);
          float F = fresnelTIR(cosi);
          vec3 ro = refract(rd, nP, 1.33);
          vec3 tr = envSample(uMugRot * normalize(ro + 1e-5), 2.2) * vec3(1.0, 0.93, 0.72);
          vec2 duv = vec2((th + uDecalMap.x) / (2.0 * uDecalMap.x), (p.y - uDecalMap.y) / (uDecalMap.z - uDecalMap.y));
          if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) tr *= 1.0 - 0.93 * texture(uDecal, duv).a;
          vec3 rf = beerFog(uMugRot * reflect(rd, nP)) * 0.9;
          col = mix(tr, rf, F);
        } else if (vPart < 1.5) {
          if (h > 0.0) discard;
          // Thick glass floor glowing with light from the table, with scratches where bubbles are born.
          float rr = length(p.xz);
          vec3 nP = normalize(vec3(normalize(p.xz + 1e-4) * sin(rr * 6.0) * 0.07, 1.0).xzy);
          float cosi = max(dot(-rd, nP), 0.0);
          float F = fresnelTIR(cosi);
          vec3 tr = vec3(0.95, 0.74, 0.36) * (0.45 + 0.35 * vnoise(p.xz * 1.7)) * smoothstep(4.0, 2.6, rr * 0.92);
          float scratch = smoothstep(0.93, 1.0, vnoise(p.xz * vec2(9.0, 2.0) + 4.0)) + smoothstep(0.94, 1.0, vnoise(p.zx * vec2(8.0, 2.4)));
          tr += vec3(1.6, 1.3, 0.8) * scratch * 0.5;
          col = mix(tr, beerFog(uMugRot * reflect(rd, nP)) * 0.9, F);
        } else {
          if (p.y < YB || length(p.xz) > innerR(p.y)) discard;
          // Underside of the foam: tightly packed bubbles lit from above.
          vec2 q = p.xz + vec2(uTime * 0.03, -uTime * 0.02);
          vec3 v1 = voronoi(q * 2.3), v2 = voronoi(q * 6.5 + 11.0);
          float c1 = smoothstep(0.62, 0.12, v1.z), c2 = smoothstep(0.6, 0.15, v2.z);
          col = mix(vec3(0.9, 0.55, 0.12), vec3(3.0, 2.5, 1.55), 0.6 * c1 + 0.4 * c2);
          col *= 1.0 - 0.45 * uShade;
        }
        gl_FragColor = vec4(applyBeer(col, p), 1.0);
      }`,
  });
  const shell = new THREE.Mesh(buildShellGeometry(shape), shellMat);
  shell.frustumCulled = false; shell.renderOrder = 1;
  group.add(shell);

  // --- Foam crown ---
  const foamMat = new THREE.ShaderMaterial({
    uniforms: mu, side: THREE.DoubleSide,
    vertexShader: COMMON + /* glsl */`
      uniform vec4 uSurf; uniform float uFoamH, uFoamR, uFoamMax, uDome;
      varying vec3 vPos; varying vec3 vNw; varying float vT; varying vec3 vWorld;
      float bump(vec2 q) {
        float rn = length(q) / uFoamR;
        return (fbm(q * 0.85 + uTime * 0.012) - 0.5) * 0.55 + 0.32 * smoothstep(0.72, 1.0, rn) * (1.0 - 0.8 * step(0.5, uDome)) - 0.1 + uDome * (1.0 - rn * rn);
      }
      void main() {
        vec2 q = position.xz * (uFoamR - 0.015); float t = position.y;
        float ys = (uSurf.w - uSurf.x * q.x - uSurf.z * q.y) / uSurf.y;
        float top = step(0.999, t);
        float hgt = uFoamH + top * bump(q) * min(1.0, uFoamH);
        vec3 p = vec3(q.x, min(ys + t * hgt / uSurf.y, uFoamMax), q.y);
        vec3 n;
        if (top > 0.5) {
          float e = 0.12;
          float hx = bump(q + vec2(e, 0.0)) - bump(q - vec2(e, 0.0));
          float hz = bump(q + vec2(0.0, e)) - bump(q - vec2(0.0, e));
          n = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)) + uSurf.xyz - vec3(0.0, 1.0, 0.0));
        } else n = normalize(vec3(q.x, 0.0, q.y));
        vPos = p; vT = t; vNw = normalize(mat3(modelMatrix) * n);
        vec4 w = modelMatrix * vec4(p, 1.0); vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: COMMON + /* glsl */`
      uniform vec3 uFogBright; uniform float uShade;
      varying vec3 vPos; varying vec3 vNw; varying float vT; varying vec3 vWorld;
      void main() {
        vec3 N = normalize(vNw);
        float th = atan(vPos.x, vPos.z);
        // Fine bubble structure: polar cells on the side, planar cells on top.
        vec2 cu = vT > 0.999 ? vPos.xz * 7.0 : vec2(th * 28.0, vPos.y * 7.0);
        vec3 v1 = voronoi(cu), v2 = voronoi(cu * 0.31 + 5.0);
        float cells = 0.86 + 0.14 * smoothstep(0.1, 0.55, v1.z);
        float big = smoothstep(0.34, 0.2, v2.z) * (1.0 - smoothstep(0.0, 0.5, vT)) * step(vT, 0.999);
        vec3 irr = envSample(N, 6.0) * 1.3 + envSample(vec3(0.0, 1.0, 0.0), 7.0) * 1.1 + vec3(0.62, 0.5, 0.36);
        vec3 col = vec3(0.985, 0.955, 0.875) * irr * cells;
        // Beer soaks into the lowest layer of foam.
        float soak = (1.0 - smoothstep(0.0, 0.22 + 0.1 * vnoise(vec2(th * 9.0, 2.0)), vT)) * step(vT, 0.999);
        col = mix(col, uFogBright * 0.45, soak * 0.75);
        col = mix(col, col * vec3(0.9, 0.82, 0.62) + 0.3 * envSample(reflect(normalize(vWorld - cameraPosition), N), 3.0), big * 0.5);
        col *= 1.0 - 0.3 * uShade;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const foam = new THREE.Mesh(buildFoamGeometry(), foamMat);
  foam.frustumCulled = false;
  group.add(foam);

  const up = new THREE.Vector3();
  return {
    group, mu, glass, shell, foam, shape,
    // level: beer height on the axis, tilt: radians toward -Z, foamH: foam thickness
    setState(level, tilt, foamH, laceTop) {
      up.set(0, Math.cos(tilt), Math.sin(tilt));
      mu.uSurf.value.set(up.x, up.y, up.z, level * Math.cos(tilt));
      mu.uLevelY.value = level;
      mu.uFoamH.value = foamH;
      mu.uFoamR.value = innerR(shape, level + 0.3);
      mu.uLace.value.set(level + foamH, laceTop);
      group.rotation.x = -tilt;
    },
    updateCamera(camera) {
      group.updateMatrixWorld();
      mu.uCam.value.copy(camera.position); group.worldToLocal(mu.uCam.value);
      mu.uMugRot.value.setFromMatrix4(group.matrixWorld);
    },
  };
}
