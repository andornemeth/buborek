// Everything that floats in the beer: ambient bubbles, the player's bubble, hop shards, yeast clouds, specks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMMON, BEER } from './shaders/common.js';
import { quality } from './params.js';

const QUAD = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]);

export function createBubbles(mug, U, game) {
  const mu = mug.mu;
  const out = {};

  // --- Ambient bubbles: camera-facing quads shaded as pixel-perfect spheres ---
  const NB = game.NB + 1;                      // slot NB-1 shows the player when seen from outside
  const bg = new THREE.InstancedBufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(QUAD, 3));
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aRad = new THREE.InstancedBufferAttribute(new Float32Array(NB), 1).setUsage(THREE.DynamicDrawUsage);
  bg.setAttribute('aPos', aPos); bg.setAttribute('aRad', aRad);
  bg.instanceCount = NB;
  const bubbleMat = new THREE.ShaderMaterial({
    uniforms: mu, alphaToCoverage: true,
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute float aRad; uniform float uEdible;
      varying vec2 vUv; varying vec3 vC; varying vec3 vCw; varying float vEd;
      void main() {
        vUv = position.xy; vC = aPos; vEd = step(aRad, uEdible);
        vec4 w = modelMatrix * vec4(aPos, 1.0); vCw = w.xyz;
        vec4 mv = viewMatrix * w;
        mv.xy += position.xy * aRad;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: COMMON + BEER + /* glsl */`
      varying vec2 vUv; varying vec3 vC; varying vec3 vCw; varying float vEd;
      void main() {
        float r2 = dot(vUv, vUv);
        if (r2 > 1.0) discard;
        vec3 nV = vec3(vUv, sqrt(1.0 - r2));
        vec3 N = normalize((vec4(nV, 0.0) * viewMatrix).xyz);
        vec3 V = normalize(cameraPosition - vCw);
        float air = step(0.0, dot(uSurf.xyz, vC) - uSurf.w);
        float F = mix(fresnelTIR(nV.z), 0.04 + 0.96 * pow(1.0 - nV.z, 4.0), air);
        vec3 R = reflect(-V, N);
        vec3 refl = mix(beerFog(R) * (0.75 + 1.3 * smoothstep(0.1, 1.0, R.y)), envSample(R, 1.0), air);
        float sp = max(dot(R, normalize(vec3(0.25, 0.92, 0.3))), 0.0);
        refl += vec3(1.0, 0.94, 0.8) * (10.0 * pow(sp, 260.0) + 1.2 * pow(sp, 22.0));
        vec3 thru = mix(beerFog(-V) * 1.06, envSample(-V, 2.0), air);
        // light gathers on the inside of the far, lower wall
        thru += uFogBright * 0.45 * pow(max(-N.y, 0.0), 2.5) * smoothstep(1.0, 0.3, r2) * (1.0 - air);
        vec3 col = mix(thru, refl, F);
        col *= 1.0 - 0.35 * smoothstep(0.9, 1.0, r2);
        // food: bubbles small enough to absorb glint green
        col += vEd * vec3(0.25, 1.35, 0.5) * (0.3 + 0.9 * pow(1.0 - nV.z, 1.6)) * (0.8 + 0.2 * sin(uTime * 5.0 + vC.x * 9.0));
        if (air < 0.5) col = applyBeer(col, vC);
        float a = 1.0 - smoothstep(0.86, 1.0, r2);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const bubbles = new THREE.Mesh(bg, bubbleMat);
  bubbles.frustumCulled = false; bubbles.renderOrder = 3;
  mug.group.add(bubbles);

  // --- The player's bubble: real geometry, screen-space refraction, wobble ---
  const pu = {
    ...mu,
    uPPos: { value: new THREE.Vector3() }, uPRad: { value: 0.1 }, uVel: { value: new THREE.Vector3() },
    uWob: { value: 0 }, uFlash: { value: 0 },
  };
  const playerMat = new THREE.ShaderMaterial({
    uniforms: pu,
    vertexShader: /* glsl */`
      uniform vec3 uPPos, uVel; uniform float uPRad, uWob, uTime;
      varying vec3 vL; varying vec3 vWorld; varying vec3 vNw;
      void main() {
        vec3 n = normalize(position);
        float sp = length(uVel);
        vec3 vd = sp > 1e-4 ? uVel / sp : vec3(0.0, 1.0, 0.0);
        float st = 1.0 + min(sp * 0.07, 0.3);
        float al = dot(n, vd);
        vec3 q = (n - vd * al) / sqrt(st) + vd * al * st;
        float w = sin(n.x * 3.1 + uTime * 5.3) * sin(n.y * 2.7 + uTime * 4.1) * sin(n.z * 3.3 - uTime * 4.7);
        float w2 = sin(n.y * 5.0 + uTime * 13.0) * sin(n.x * 4.0 - uTime * 11.0);
        q *= 1.0 + 0.04 * w + 0.11 * w2 * uWob;
        vec3 nn = normalize((n - vd * al) * sqrt(st) + vd * al / st);
        vL = uPPos + q * uPRad;
        vec4 wp = modelMatrix * vec4(vL, 1.0);
        vWorld = wp.xyz; vNw = normalize(mat3(modelMatrix) * nn);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: COMMON + BEER + /* glsl */`
      uniform sampler2D uScene; uniform vec2 uRes, uProj; uniform float uPRad, uFlash;
      varying vec3 vL; varying vec3 vWorld; varying vec3 vNw;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vNw);
        float cosv = clamp(dot(N, V), 0.0, 1.0);
        float F = fresnelTIR(cosv);
        vec3 R = reflect(-V, N);
        vec3 refl = mix(beerFog(R), envSample(R, 2.5), 0.3) * 1.05;
        // faint soap-film colours on the mirror rim
        refl *= mix(vec3(1.0), 0.75 + 0.6 * cos(6.2832 * (cosv * 1.4 + uTime * 0.03 + vec3(0.0, 0.33, 0.67))), 0.5);
        refl *= 0.8 + 1.3 * smoothstep(0.0, 1.0, R.y);

        // An air bubble in liquid is a diverging lens: a small upright view of what lies behind.
        vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
        float dist = length(cameraPosition - vWorld);
        vec2 sc = uProj / dist * 0.5;
        vec2 off = Nv.xy * sc * uPRad * (0.9 + 1.3 * (1.0 - cosv));
        vec2 suv = gl_FragCoord.xy / uRes;
        vec3 tr;
        tr.r = texture(uScene, clamp(suv + off * 0.9, 0.002, 0.998)).r;
        tr.g = texture(uScene, clamp(suv + off, 0.002, 0.998)).g;
        tr.b = texture(uScene, clamp(suv + off * 1.1, 0.002, 0.998)).b;
        vec3 col = mix(tr * vec3(1.04, 1.03, 1.0), refl, F);

        // highlights: light from the foam above, and its inverted echo from the far inner wall
        vec3 L1 = normalize(vec3(0.25, 0.92, 0.3)), L2 = normalize(vec3(-0.55, 0.5, -0.6));
        col += vec3(1.0, 0.95, 0.82) * (9.0 * pow(max(dot(R, L1), 0.0), 240.0) + 2.5 * pow(max(dot(R, L2), 0.0), 120.0));
        col += vec3(1.0, 0.9, 0.7) * 1.6 * pow(max(dot(reflect(V, N), L1), 0.0), 60.0) * (1.0 - F);
        col += vec3(1.0, 0.96, 0.88) * 0.55 * pow(1.0 - cosv, 4.0);
        col += uFogBright * 0.4 * pow(max(-N.y, 0.0), 2.5) * (1.0 - F);
        col = mix(col, vec3(2.2, 0.5, 0.25), uFlash * (0.35 + 0.35 * sin(uTime * 30.0)));
        gl_FragColor = vec4(applyBeer(col, vL), 1.0);
      }`,
  });
  const player = new THREE.Mesh(new THREE.IcosahedronGeometry(1, quality.sphereDetail), playerMat);
  player.frustumCulled = false; player.layers.set(1); player.renderOrder = 5;
  mug.group.add(player);

  // --- Hop shards ---
  // Three crossed splinters make a jagged, clearly dangerous shape.
  const splinter = (sx, sy, sz, rx, rz) => {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(sx, sy, sz); g.rotateX(rx); g.rotateZ(rz);
    return g;
  };
  const hg = mergeGeometries([splinter(1.15, 0.2, 0.42, 0.2, 0.1), splinter(0.22, 1.0, 0.36, -0.3, 0.75), splinter(0.3, 0.26, 0.95, 0.5, -0.4)]);
  const hopMat = new THREE.ShaderMaterial({
    uniforms: mu,
    vertexShader: /* glsl */`
      varying vec3 vL; varying vec3 vWorld; varying float vSeed;
      void main() {
        vec4 lp = instanceMatrix * vec4(position, 1.0);
        vL = lp.xyz; vSeed = instanceMatrix[3].x * 7.0 + instanceMatrix[3].z * 3.0;
        vec4 w = modelMatrix * lp; vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: COMMON + BEER + /* glsl */`
      varying vec3 vL; varying vec3 vWorld; varying float vSeed;
      void main() {
        vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        float ndv = max(dot(N, V), 0.0);
        vec3 col = vec3(0.016, 0.05, 0.008) * (0.5 + 1.6 * max(N.y, 0.0)) + vec3(0.06, 0.12, 0.015) * pow(1.0 - ndv, 2.0);
        col += vec3(2.4, 0.3, 0.06) * pow(1.0 - ndv, 2.5) * (0.55 + 0.45 * sin(uTime * 4.0 + vSeed));
        gl_FragColor = vec4(applyBeer(col, vL), 1.0);
      }`,
  });
  const hops = new THREE.InstancedMesh(hg, hopMat, game.MAXH);
  hops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hops.frustumCulled = false; hops.renderOrder = 3;
  mug.group.add(hops);

  // --- Yeast clouds: soft puffs ---
  const NP = game.MAXC * quality.puffs;
  const cg = new THREE.InstancedBufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(QUAD, 3));
  const cPos = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const cRad = new THREE.InstancedBufferAttribute(new Float32Array(NP), 1).setUsage(THREE.DynamicDrawUsage);
  cg.setAttribute('aPos', cPos); cg.setAttribute('aRad', cRad);
  const puffOff = new Float32Array(NP * 4);
  for (let i = 0; i < NP; i++) {
    const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), r = Math.cbrt(Math.random()) * 0.75;
    puffOff[i * 4] = Math.sin(b) * Math.cos(a) * r; puffOff[i * 4 + 1] = Math.cos(b) * r * 0.7;
    puffOff[i * 4 + 2] = Math.sin(b) * Math.sin(a) * r; puffOff[i * 4 + 3] = 0.55 + Math.random() * 0.5;
  }
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: mu, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute float aRad;
      varying vec2 vUv; varying vec3 vC; varying float vSeed;
      void main() {
        vUv = position.xy; vC = aPos; vSeed = aPos.x * 3.1 + aPos.y * 1.7;
        vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
        mv.xy += position.xy * aRad;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: COMMON + BEER + /* glsl */`
      varying vec2 vUv; varying vec3 vC; varying float vSeed;
      void main() {
        float r = length(vUv);
        float n = fbm(vUv * 2.2 + vSeed + uTime * 0.03);
        float a = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.7) * 0.5;
        vec3 col = vec3(0.34, 0.22, 0.09) * (0.5 + 0.7 * n);
        float T = exp(-uSigma * beerPath(uCam, vC));
        gl_FragColor = vec4(col, a * T);
      }`,
  });
  const clouds = new THREE.Mesh(cg, cloudMat);
  clouds.frustumCulled = false; clouds.renderOrder = 6;
  mug.group.add(clouds);

  // --- Drifting yeast specks give a sense of motion ---
  const sg = new THREE.BufferGeometry();
  const sPos = new THREE.BufferAttribute(game.specks, 3).setUsage(THREE.DynamicDrawUsage);
  sg.setAttribute('position', sPos);
  const speckMat = new THREE.ShaderMaterial({
    uniforms: { ...mu, uPx: U.uPx }, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uPx; varying vec3 vL;
      void main() {
        vL = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(0.022 * uPx * projectionMatrix[1][1] / max(-mv.z, 0.05), 1.0, 26.0);
      }`,
    fragmentShader: COMMON + BEER + /* glsl */`
      varying vec3 vL;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.1, length(d)) * 0.4;
        float T = exp(-uSigma * beerPath(uCam, vL));
        gl_FragColor = vec4(vec3(1.5, 1.2, 0.7), a * T);
      }`,
  });
  const specks = new THREE.Points(sg, speckMat);
  specks.frustumCulled = false; specks.renderOrder = 7;
  mug.group.add(specks);

  // --- Marker ring so the player can find their bubble from outside ---
  const markerMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uAlpha: { value: 0 }, uPop: { value: 0 }, uSize: { value: 1 }, uHalo: { value: 0 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uSize; varying vec2 vUv;
      void main() {
        vUv = position.xy;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uAlpha, uPop, uHalo; varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float ring = smoothstep(0.08, 0.0, abs(r - 0.62 - 0.08 * sin(uTime * 3.0)));
        float glow = exp(-r * r * 9.0) * 0.6;
        float pop = smoothstep(0.1, 0.0, abs(r - uPop)) * (1.0 - uPop) * step(0.001, uPop);
        vec3 c = vec3(1.0, 0.9, 0.55) * (ring * 0.9 + glow) * uAlpha + vec3(1.6, 1.5, 1.2) * pop * 2.0;
        c += vec3(1.0, 0.85, 0.5) * uHalo * exp(-r * r * 5.0) * smoothstep(1.0, 0.6, r);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const marker = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(QUAD, 3)), markerMat);
  marker.frustumCulled = false; marker.layers.set(1); marker.renderOrder = 30;
  mug.group.add(marker);

  const lerpN = (a, b, t) => a + (b - a) * t;
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  // outside: 0..1, how far the camera is toward the outside view
  out.sync = (outside, cameraOutsideGlass) => {
    const n = game.NB;
    aPos.array.set(game.bPos); aRad.array.set(game.bRad);
    const P = game.player;
    // The player: refractive mesh when the camera is in the beer, impostor when seen through the glass.
    const showMesh = P.visible && !cameraOutsideGlass;
    player.visible = showMesh;
    aPos.array[n * 3] = P.pos.x; aPos.array[n * 3 + 1] = P.pos.y; aPos.array[n * 3 + 2] = P.pos.z;
    aRad.array[n] = P.visible && cameraOutsideGlass ? P.r * P.scale : 0;
    aPos.needsUpdate = true; aRad.needsUpdate = true;
    pu.uPPos.value.copy(P.pos); pu.uPRad.value = P.r * P.scale; pu.uVel.value.copy(P.vel);
    pu.uWob.value = P.wob; pu.uFlash.value = P.invuln > 0 ? 1 : 0;

    for (let i = 0; i < game.MAXH; i++) {
      if (i < game.nHops) {
        const h = game.hops[i];
        qt.setFromAxisAngle(h.axis, h.ang); sv.setScalar(h.s);
        m4.compose(h.pos, qt, sv); hops.setMatrixAt(i, m4);
      } else hops.setMatrixAt(i, zero);
    }
    hops.instanceMatrix.needsUpdate = true;

    let k = 0;
    for (let i = 0; i < game.nClouds; i++) {
      const c = game.clouds[i];
      for (let j = 0; j < quality.puffs; j++, k++) {
        const o = k * 4;
        cPos.array[k * 3] = c.pos.x + puffOff[o] * c.rad; cPos.array[k * 3 + 1] = c.pos.y + puffOff[o + 1] * c.rad;
        cPos.array[k * 3 + 2] = c.pos.z + puffOff[o + 2] * c.rad; cRad.array[k] = puffOff[o + 3] * c.rad;
      }
    }
    cg.instanceCount = k;
    cPos.needsUpdate = true; cRad.needsUpdate = true;
    sPos.needsUpdate = true;

    marker.position.copy(P.pos);
    markerMat.uniforms.uAlpha.value = P.visible ? outside * 0.9 : 0;
    markerMat.uniforms.uPop.value = P.pop;
    markerMat.uniforms.uSize.value = P.pop > 0 ? 0.6 + P.pop * 2.2 : lerpN(P.r * P.scale * 3.4, Math.max(0.55, P.r * 3.2), outside);
    markerMat.uniforms.uHalo.value = P.visible ? 0.16 * (1 - outside) : 0;
  };
  out.player = player; out.marker = marker;
  return out;
}
