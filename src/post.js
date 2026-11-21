// Render pipeline: base pass -> refractive pass -> blur pyramid (bloom + depth of field) -> grade.
import * as THREE from 'three';
import { quality } from './params.js';

const TRI = new THREE.BufferGeometry();
TRI.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const VS = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const pass = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });

export class Pipeline {
  constructor(renderer, scene, U) {
    this.renderer = renderer; this.U = U;
    const rt = (samples, depth) => {
      const t = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples, depthBuffer: true });
      if (depth) { t.depthTexture = new THREE.DepthTexture(4, 4); t.depthTexture.type = THREE.UnsignedIntType; }
      return t;
    };
    this.base = rt(quality.msaaBase, true);
    this.scene = rt(quality.msaaScene, false);
    this.levels = 5;
    this.down = []; this.up = [];
    for (let i = 0; i < this.levels; i++) {
      this.down.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
      this.up.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
    }

    // Copies the base pass (colour + depth) into the refractive pass so glass and bubble sort against it.
    this.copy = new THREE.Mesh(TRI, new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: 'uniform sampler2D tColor, tDepth; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tColor, vUv); gl_FragDepth = texture2D(tDepth, vUv).r; }',
      uniforms: { tColor: { value: this.base.texture }, tDepth: { value: this.base.depthTexture } },
      depthFunc: THREE.AlwaysDepth, depthWrite: true,
    }));
    this.copy.frustumCulled = false; this.copy.layers.set(1); this.copy.renderOrder = -1000;
    scene.add(this.copy);
    U.uScene.value = this.base.texture;

    this.fsScene = new THREE.Scene(); this.fsCam = new THREE.Camera();
    this.quad = new THREE.Mesh(TRI, null); this.quad.frustumCulled = false; this.fsScene.add(this.quad);

    this.mDown = pass(/* glsl */`
      uniform sampler2D tMap; uniform vec2 uTexel; varying vec2 vUv;
      vec3 s(vec2 o) { return min(texture2D(tMap, vUv + o * uTexel).rgb, vec3(24.0)); }
      void main() {
        vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2)), d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
        vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2)), j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
        vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
        gl_FragColor = vec4(col, 1.0);
      }`, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = pass(/* glsl */`
      uniform sampler2D tMap, tAdd; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec2 t = uTexel;
        vec3 c = texture2D(tMap, vUv).rgb * 4.0;
        c += (texture2D(tMap, vUv + vec2(t.x, 0)).rgb + texture2D(tMap, vUv - vec2(t.x, 0)).rgb + texture2D(tMap, vUv + vec2(0, t.y)).rgb + texture2D(tMap, vUv - vec2(0, t.y)).rgb) * 2.0;
        c += texture2D(tMap, vUv + t).rgb + texture2D(tMap, vUv - t).rgb + texture2D(tMap, vUv + vec2(t.x, -t.y)).rgb + texture2D(tMap, vUv + vec2(-t.x, t.y)).rgb;
        gl_FragColor = vec4(c / 16.0 + texture2D(tAdd, vUv).rgb, 1.0);
      }`, { tMap: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });

    this.final = pass(/* glsl */`
      uniform sampler2D tScene, tBloom, tBlur1, tBlur2, tDepth;
      uniform float uBloom, uDof, uFocus, uNear, uFar, uCA, uHaze, uWarp, uTime, uFade, uExposure;
      uniform vec3 uTint;
      varying vec2 vUv;
      vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main() {
        vec2 uv = vUv, d = uv - 0.5;
        float r2 = dot(d, d);
        // ripple when the camera passes through the glass
        uv += d * sin(r2 * 38.0 - uTime * 14.0) * 0.035 * uWarp;
        float ca = (uCA + 0.02 * uWarp) * r2;
        vec3 col = vec3(texture2D(tScene, uv + d * ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv - d * ca).b);
        if (uDof > 0.001) {
          float z = texture2D(tDepth, uv).r;
          float lin = uNear * uFar / (uFar - z * (uFar - uNear));
          float coc = clamp(abs(lin - uFocus) / uFocus * 1.5 - 0.22, 0.0, lin > uFocus ? 0.6 : 1.0) * uDof * step(z, 0.99999);
          vec3 b = mix(texture2D(tBlur1, uv).rgb, texture2D(tBlur2, uv).rgb, smoothstep(0.45, 1.0, coc));
          col = mix(col, b, smoothstep(0.0, 0.45, coc));
        }
        vec3 bloom = texture2D(tBloom, uv).rgb / 5.0;
        col = mix(col, bloom, uBloom);
        // yeast haze: milky veil
        col = mix(col, texture2D(tBlur2, uv).rgb * vec3(0.8, 0.7, 0.5) + vec3(0.1, 0.075, 0.03), uHaze * 0.7);
        col = mix(col, uTint, uFade);
        col = aces(col * uExposure);
        col *= 1.0 - 0.42 * smoothstep(0.12, 0.62, r2);
        col = pow(col, vec3(1.0 / 2.2));
        col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.018;
        gl_FragColor = vec4(col, 1.0);
      }`, {
      tScene: { value: this.scene.texture }, tBloom: { value: this.up[0].texture }, tBlur1: { value: this.down[0].texture },
      tBlur2: { value: this.down[1].texture }, tDepth: { value: this.base.depthTexture },
      uBloom: { value: 0.07 }, uDof: { value: 0 }, uFocus: { value: 30 }, uNear: { value: 0.1 }, uFar: { value: 400 },
      uCA: { value: 0.006 }, uHaze: { value: 0 }, uWarp: { value: 0 }, uTime: U.uTime, uFade: { value: 0 },
      uTint: { value: new THREE.Vector3(0, 0, 0) }, uExposure: { value: 1.0 },
    });
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.base.setSize(w, h); this.scene.setSize(w, h);
    let lw = w, lh = h;
    for (let i = 0; i < this.levels; i++) {
      lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1);
      this.down[i].setSize(lw, lh); this.up[i].setSize(lw, lh);
    }
    this.U.uRes.value.set(w, h);
  }

  blit(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  render(scene, camera) {
    const r = this.renderer;
    camera.layers.set(0);
    r.setRenderTarget(this.base); r.clear(); r.render(scene, camera);
    camera.layers.set(1);
    r.setRenderTarget(this.scene); r.render(scene, camera);

    let src = this.scene;
    for (let i = 0; i < this.levels; i++) {
      this.mDown.uniforms.tMap.value = src.texture; this.mDown.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.blit(this.mDown, this.down[i]); src = this.down[i];
    }
    let acc = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      this.mUp.uniforms.tMap.value = acc.texture; this.mUp.uniforms.tAdd.value = this.down[i].texture;
      this.mUp.uniforms.uTexel.value.set(1 / acc.width, 1 / acc.height);
      this.blit(this.mUp, this.up[i]); acc = this.up[i];
    }
    const f = this.final.uniforms;
    f.uNear.value = camera.near; f.uFar.value = camera.far;
    this.blit(this.final, null);
  }
}
