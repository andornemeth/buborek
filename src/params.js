// Shared dimensions (mug-local units, roughly centimetres) and device tier.
export const RI = 4.0;      // inner radius of the mug
export const YB = 1.6;      // inner bottom height (thick glass base below)
export const RIM = 15.0;    // rim height
export const L0 = 11.9;     // beer level of a fresh mug
export const LMIN = 3.2;    // level after the last regular sip
export const FOAM0 = 2.1;   // foam thickness of a fresh mug

export const isMobile =
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const quality = isMobile
  ? { bubbles: 650, specks: 260, puffs: 6, msaaBase: 4, msaaScene: 0, maxDpr: 2, startScale: 0.8, sphereDetail: 12, mugSeg: 96 }
  : { bubbles: 1400, specks: 600, puffs: 9, msaaBase: 4, msaaScene: 4, maxDpr: 2, startScale: 1.0, sphereDetail: 20, mugSeg: 144 };

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Radius reduction of the outer wall: front shield panel plus two rows of oval dimples.
// Must stay in sync with dimple() in shaders/common.js.
export function dimple(th, y) {
  let d = 0;
  const sx = Math.abs(th) / 0.76, sy = Math.abs(y - 6.0) / 3.7;
  const sr = Math.pow(Math.pow(sx, 6) + Math.pow(sy, 6), 1 / 6);
  d += 0.07 * (1 - smoothstep(0.84, 1.0, sr));
  const a = th < 0 ? th + Math.PI * 2 : th;
  const s0 = 0.98, s1 = Math.PI * 2 - 0.98, w = (s1 - s0) / 6;
  if (a > s0 && a < s1) {
    const ca = (a - s0) / w;
    const fa = (ca - Math.floor(ca) - 0.5) * w;
    for (const yc of [4.55, 8.95]) {
      const e = Math.hypot(fa / 0.31, (y - yc) / 1.9);
      d += 0.2 * (1 - smoothstep(0.4, 1.0, e));
    }
  }
  return d;
}
