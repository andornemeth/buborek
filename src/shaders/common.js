// GLSL shared by every material.
export const COMMON = /* glsl */`
#define PI 3.14159265
uniform sampler2D uEnv;
uniform float uTime;

vec3 envSample(vec3 d, float lod) {
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  return textureLod(uEnv, uv, lod).rgb;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// xy: vector to nearest cell point, z: distance
vec3 voronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  vec3 m = vec3(0.0, 0.0, 8.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash22(n + g) - f;
    float d = dot(r, r);
    if (d < m.z) m = vec3(r, d);
  }
  return vec3(m.xy, sqrt(m.z));
}
// Reflectance seen from inside the liquid at a liquid->air boundary (total reflection past ~49 deg).
float fresnelTIR(float cosi) {
  float s2 = (1.0 - cosi * cosi) * 1.7689;          // (1.33 sin i)^2
  if (s2 >= 1.0) return 1.0;
  float cost = sqrt(1.0 - s2);
  float rs = (1.33 * cosi - cost) / (1.33 * cosi + cost);
  float rp = (cosi - 1.33 * cost) / (cosi + 1.33 * cost);
  return clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
}
float dimple(float th, float y) {
  float d = 0.0;
  float sx = abs(th) / 0.76, sy = abs(y - 6.0) / 3.7;
  float sr = pow(pow(sx, 6.0) + pow(sy, 6.0), 1.0 / 6.0);
  d += 0.07 * (1.0 - smoothstep(0.84, 1.0, sr));
  float a = th < 0.0 ? th + 2.0 * PI : th;
  float s0 = 0.98, s1 = 2.0 * PI - 0.98, w = (s1 - s0) / 6.0;
  if (a > s0 && a < s1) {
    float ca = (a - s0) / w;
    float fa = (fract(ca) - 0.5) * w;
    float e1 = length(vec2(fa / 0.31, (y - 4.55) / 1.9));
    float e2 = length(vec2(fa / 0.31, (y - 8.95) / 1.9));
    d += 0.2 * (1.0 - smoothstep(0.4, 1.0, e1)) + 0.2 * (1.0 - smoothstep(0.4, 1.0, e2));
  }
  return d;
}
`;

// Beer volume: analytic path length through the liquid and the in-scattered colour.
export const BEER = /* glsl */`
uniform vec3 uCam;        // camera in mug-local space
uniform vec4 uSurf;       // liquid surface plane (local): dot(n, p) = w, liquid below
uniform mat3 uMugRot;     // mug-local -> world rotation
uniform float uSigma;     // haze density
uniform vec3 uFogDeep;
uniform vec3 uFogBright;
uniform float uShade;     // the drinker's shadow, 0..1
uniform float uLevelY;
uniform float uFogGain;   // brighter when the mug is seen from outside, backlit
const float RI = 4.0;
const float YB = 1.6;

float beerPath(vec3 ro, vec3 p) {
  vec3 rd = p - ro;
  float len = length(rd);
  rd /= max(len, 1e-5);
  float tEnter = 0.0;
  float c = dot(ro.xz, ro.xz) - RI * RI;
  if (c > 0.0) {
    float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz);
    float disc = b * b - a * c;
    if (disc <= 0.0 || a < 1e-6) return 0.0;
    tEnter = max(tEnter, (-b - sqrt(disc)) / a);
  }
  float h = dot(uSurf.xyz, ro) - uSurf.w;
  if (h > 0.0) {
    float dn = dot(uSurf.xyz, rd);
    if (dn >= 0.0) return 0.0;
    tEnter = max(tEnter, -h / dn);
  }
  if (ro.y < YB) {
    if (rd.y <= 0.0) return 0.0;
    tEnter = max(tEnter, (YB - ro.y) / rd.y);
  }
  return max(0.0, len - tEnter);
}
// rdw: world-space view direction (camera -> point)
vec3 beerFog(vec3 rdw) {
  float up = rdw.y * 0.5 + 0.5;
  float k = clamp(0.07 + 0.93 * pow(up, 1.7), 0.0, 1.0);
  vec3 c = mix(uFogDeep, uFogBright, k) * uFogGain;
  vec2 sp = rdw.xz / (abs(rdw.y) + 0.35);
  float sh = vnoise(sp * 2.3 + uTime * 0.05) * vnoise(sp * 5.1 - uTime * 0.04);
  c *= 1.0 + 1.1 * sh * smoothstep(0.05, 0.7, rdw.y);
  c *= 1.0 - uShade * (0.22 + 0.4 * smoothstep(0.4, -0.7, rdw.z));
  return c;
}
vec3 applyBeer(vec3 col, vec3 p) {
  vec3 rd = normalize(p - uCam);
  float d = beerPath(uCam, p);
  float T = exp(-uSigma * d);
  vec3 fog = beerFog(uMugRot * rd);
  fog *= mix(vec3(0.80, 0.58, 0.34), vec3(1.0), smoothstep(0.4, 6.5, d));
  fog *= 0.8 + 0.3 * smoothstep(YB, uLevelY, p.y);
  return mix(fog, col, T);
}
`;
