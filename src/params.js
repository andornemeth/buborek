// Shared dimensions (mug-local units, roughly centimetres), device tier, and the two venues.
export const YB = 1.6;      // inner bottom height (thick glass base below)
export const RIM = 15.0;    // rim height
export const L0 = 11.9;     // beer level of a fresh mug
export const LMIN = 3.2;    // level after the last regular sip
export const R_START = 0.05;  // the player's starting radius
export const R_MIN = 0.035;   // below this the bubble pops

export const isMobile =
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const quality = isMobile
  ? { bubbles: 800, specks: 260, puffs: 6, msaaBase: 4, msaaScene: 0, maxDpr: 2, startScale: 0.8, sphereDetail: 12, mugSeg: 96 }
  : { bubbles: 1500, specks: 600, puffs: 9, msaaBase: 4, msaaScene: 4, maxDpr: 2, startScale: 1.0, sphereDetail: 20, mugSeg: 144 };

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// --- Mug shapes ---------------------------------------------------------------------------------
// The liquid's boundary is a surface of revolution: r(y)^2 = A^2 - B (y - YC)^2 below `top`,
// straight above it. B = 0 gives a plain cylinder. Dimple functions must match shaders/common.js.

function dimpleKrug(th, y) {
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

function dimpleBarrel(th, y) {
  // two rows of round lenses, left out where the label sits
  const w = Math.PI / 4;
  const mask = smoothstep(0.62, 0.86, Math.abs(th));
  let d = 0;
  for (const [yc, off] of [[4.7, 0.5], [8.6, 0.0]]) {
    const ca = th / w + off;
    const fa = (ca - Math.floor(ca) - 0.5) * w;
    const e = Math.hypot(fa / 0.33, (y - yc) / 1.72);
    d += 0.17 * (1 - smoothstep(0.45, 1.0, e));
  }
  return d * mask;
}

export const SHAPES = {
  krug: {
    id: 0, A: 4.0, B: 0, YC: 0, top: 99, dimple: dimpleKrug, dimpleY: [1.9, 11.4],
    outer: [[0.0, 4.30], [0.12, 4.50], [0.4, 4.60], [1.35, 4.60], [1.75, 4.47], [2.2, 4.52], [6.5, 4.66],
      [10.8, 4.54], [11.45, 4.42], [12.0, 4.62], [13.4, 4.80], [14.5, 4.74], [14.85, 4.60], [15.0, 4.38]],
    handle: [[4.35, 11.1], [6.6, 11.35], [8.15, 9.6], [8.2, 6.4], [7.0, 3.8], [4.35, 3.1]],
    decal: { thHalf: 0.78, y0: 2.5, y1: 8.5 },
  },
  barrel: {
    id: 1, A: 4.6, B: 0.256, YC: 7.5, top: 11.9, dimple: dimpleBarrel, dimpleY: [2.6, 10.9],
    outer: [[0.0, 3.75], [0.14, 3.98], [0.5, 4.08], [1.4, 4.12], [1.9, 4.2], [3.2, 4.62], [5.2, 5.02], [7.5, 5.16],
      [9.6, 5.02], [11.0, 4.68], [11.7, 4.5], [12.2, 4.7], [13.4, 4.78], [14.5, 4.8], [14.85, 4.68], [15.0, 4.46]],
    handle: [[4.7, 10.9], [7.0, 11.2], [8.7, 9.6], [8.8, 6.4], [7.5, 4.0], [4.55, 3.4]],
    decal: { thHalf: 0.5, y0: 3.5, y1: 9.3 },
  },
};

export function innerR(shape, y) {
  const yy = Math.min(y, shape.top) - shape.YC;
  return Math.sqrt(Math.max(0.01, shape.A * shape.A - shape.B * yy * yy));
}

// --- Venues ---------------------------------------------------------------------------------------
export const THEMES = {
  vasar: {
    name: 'Karácsonyi vásár', shape: 'krug', foam: 2.1, foamMax: 14.75,
    fogDeep: [0.15, 0.042, 0.002], fogBright: [1.4, 0.8, 0.09],
  },
  kocsma: {
    name: 'Kocsma', shape: 'barrel', foam: 2.9, foamMax: 15.9,
    fogDeep: [0.17, 0.055, 0.004], fogBright: [1.38, 0.86, 0.17],
  },
};

export function currentThemeId() {
  const q = new URLSearchParams(location.search).get('hely');
  if (q && THEMES[q]) return q;
  try { const s = localStorage.getItem('buborek-hely'); if (s && THEMES[s]) return s; } catch { /* storage unavailable */ }
  return 'vasar';
}
