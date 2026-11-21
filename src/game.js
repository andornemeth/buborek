// Game rules and simulation, all in mug-local coordinates. No rendering here.
import * as THREE from 'three';
import { YB, RIM, L0, LMIN, R_START, R_MIN, innerR, quality, clamp, lerp, smoothstep } from './params.js';

const V = () => new THREE.Vector3();

// Difficulty knobs, tuned with tools/sim.mjs. m = mug number - 1.
export const TUNE = {
  gate: (m) => Math.min(0.27, 0.19 + 0.02 * m),       // size needed to break the foam
  grow: 0.9,                                          // share of an eaten bubble's volume you keep
  dissolve: 0.004,                                    // fraction of your radius lost per second
  pull: (r) => r * 2.2 + 0.06,                        // how far small bubbles drift toward you
  fizzGain: (combo) => 0.045 + 0.006 * combo, fizzDecay: 0.1, fizzTime: 4, fizzEat: 1.3,
  firstSip: 8, sipEvery: (m) => Math.max(7, 15 - 2 * m), sips: (m) => Math.max(3, 6 - m), sipReach: 4.3,
  hops: (m) => Math.min(44, 12 + 9 * m), hopDrift: 0.5, hopHunt: (m) => 0.3 + 0.08 * m,
  hopBite: 0.72, bubbleBite: 0.76, mercy: 1.1,        // size kept after a hit, and seconds of safety after it
  clouds: (m) => Math.min(12, 4 + 2 * m),
};

export class Game {
  constructor(shape, foam0) {
    this.shape = shape; this.foam0 = foam0;
    this.NB = quality.bubbles; this.MAXH = 44; this.MAXC = 12;
    this.bPos = new Float32Array(this.NB * 3); this.bRad = new Float32Array(this.NB);
    this.bTarget = new Float32Array(this.NB); this.bPhase = new Float32Array(this.NB);
    this.specks = new Float32Array(quality.specks * 3);
    this.hops = Array.from({ length: this.MAXH }, () => ({ pos: V(), wander: V(), axis: V(), ang: 0, spin: 0, s: 0.15 }));
    this.clouds = Array.from({ length: this.MAXC }, () => ({ pos: V(), wander: V(), rad: 1 }));
    this.nHops = 0; this.nClouds = 0;
    this.player = { pos: V(), vel: V(), r: R_START, scale: 1, wob: 0, invuln: 0, hurtT: 0, visible: true, pop: 0, dashCd: 0 };
    this.up = V().set(0, 1, 0);
    this.mouth = V();
    this.events = [];
    this.state = 'title';       // title | play | escape | dead
    this.best = 0;
    try { this.best = Number(localStorage.getItem('buborek-best')) || 0; } catch { /* storage unavailable */ }
    // Scratches on the floor of the mug where bubble chains are born.
    this.sites = [];
    const rb = innerR(shape, YB);
    for (let i = 0; i < 20; i++) { const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 20) * (rb - 0.5); this.sites.push([Math.cos(a) * r, YB + 0.03, Math.sin(a) * r]); }
    this.score = 0; this.mug = 1; this.time = 0; this.eaten = 0; this.moved = false;
    this.startMug(1);
  }

  R(y) { return innerR(this.shape, y); }
  emit(type, data) { this.events.push({ type, ...data }); }

  startMug(n) {
    this.mug = n;
    const m = n - 1;
    this.sigma = Math.min(0.62, 0.27 + 0.055 * m);
    this.gate = TUNE.gate(m);
    this.nSips = TUNE.sips(m);
    this.sipEvery = TUNE.sipEvery(m);
    this.hunt = TUNE.hopHunt(m);
    this.flowGain = 1 + 0.15 * m;
    this.level = L0; this.foamH = this.foam0; this.laceTop = L0 + this.foam0;
    this.tilt = 0; this.lift = 0; this.shade = 0; this.drink = 0; this.haze = 0;
    this.sip = { phase: 'wait', t: this.sipEvery + (n === 1 ? TUNE.firstSip : 4), done: 0, from: L0, to: L0, final: false, a0: 0 };
    this.warning = 0;
    this.combo = 0; this.comboT = 0;
    this.fizz = 0; this.fizzT = 0;       // meter 0..1, and seconds of fizz mode left
    this.escapeT = 0; this.deadT = 0; this.deathCause = '';
    this.toastCd = 0;
    this.setSurface();

    const P = this.player;
    P.pos.set(0.6, YB + 0.5, 0.9); P.vel.set(0, 0, 0); P.r = R_START; P.scale = 1; P.wob = 0; P.invuln = 2.5; P.hurtT = 0; P.visible = true; P.pop = 0; P.dashCd = 0;

    for (let i = 0; i < this.NB; i++) this.spawnBubble(i, true);
    this.nHops = Math.min(this.MAXH, TUNE.hops(m));
    for (let i = 0; i < this.nHops; i++) this.spawnHop(this.hops[i], false);
    this.nClouds = Math.min(this.MAXC, TUNE.clouds(m));
    for (let i = 0; i < this.nClouds; i++) {
      const c = this.clouds[i];
      this.randomPoint(c.pos, 1.2); c.pos.y = Math.max(c.pos.y, YB + 3);
      c.rad = 0.9 + Math.random() * 0.8; c.wander.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5);
    }
    const s = this.specks;
    const t = V();
    for (let i = 0; i < s.length; i += 3) { this.randomPoint(t, 0.05); s[i] = t.x; s[i + 1] = t.y; s[i + 2] = t.z; }
  }

  newRun() { this.score = 0; this.time = 0; this.eaten = 0; this.moved = false; this.startMug(1); this.state = 'play'; }
  nextMug() { this.startMug(this.mug + 1); this.state = 'play'; }

  setSurface() {
    this.up.set(0, Math.cos(this.tilt), Math.sin(this.tilt));
    this.surfC = this.level * Math.cos(this.tilt);
    const y = Math.min(RIM, this.level + Math.tan(this.tilt) * 3.7);
    this.mouth.set(0, y, -(this.R(y) - 0.25));
  }
  depth(p) { return this.surfC - (this.up.x * p.x + this.up.y * p.y + this.up.z * p.z); }
  inside(p, margin) { return Math.hypot(p.x, p.z) < this.R(p.y) - margin && p.y > YB + margin && this.depth(p) > margin; }

  randomPoint(out, margin) {
    const y = lerp(YB + margin, this.level - margin, Math.random());
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * (this.R(y) - margin);
    out.set(Math.cos(a) * r, y, Math.sin(a) * r);
    return out;
  }

  spawnBubble(i, anywhere) {
    const u = Math.random();
    const t = u < 0.58 ? 0.02 + Math.random() * 0.022 : u < 0.86 ? 0.036 + Math.random() * 0.044 : u < 0.975 ? 0.08 + Math.random() * 0.07 : 0.16 + Math.random() * 0.12;
    this.bTarget[i] = t; this.bPhase[i] = Math.random() * 6.283;
    const k = i * 3;
    if (anywhere || (t > 0.036 && Math.random() < 0.5)) {
      const y = anywhere ? lerp(YB + 0.2, this.level - 0.5, Math.random()) : YB + 0.1 + Math.random() * 0.4;
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * (this.R(y) - 0.3);
      this.bPos[k] = Math.cos(a) * r; this.bPos[k + 1] = y; this.bPos[k + 2] = Math.sin(a) * r;
    } else {
      // small bubbles leave the scratches in tight chains
      const s = this.sites[(Math.random() * this.sites.length) | 0];
      this.bPos[k] = s[0] + (Math.random() - 0.5) * 0.05; this.bPos[k + 1] = s[1] + Math.random() * 0.04; this.bPos[k + 2] = s[2] + (Math.random() - 0.5) * 0.05;
    }
  }

  spawnHop(h, atBottom) {
    do { this.randomPoint(h.pos, 0.6); } while (h.pos.distanceTo(this.player.pos) < 2.2);
    if (atBottom) h.pos.y = YB + 0.5;
    h.wander.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).normalize();
    h.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    h.ang = Math.random() * 6; h.spin = (Math.random() - 0.5) * 1.6; h.s = 0.13 + Math.random() * 0.11;
  }

  // Convection: up through the middle, down along the wall, with a slow swirl.
  flow(x, y, z, out) {
    const R = this.R(y), rho = Math.hypot(x, z) / R, g = this.flowGain;
    const span = Math.max(1, this.level - YB), hy = (y - YB) / span;
    const vy = 0.38 * (1 - 2.3 * rho * rho) * Math.sin(Math.PI * clamp(hy, 0, 1));
    const vr = 0.5 * rho * (1 - rho * rho) * (hy - 0.5) * 2;
    const inv = rho > 1e-4 ? 1 / (rho * R) : 0;
    out.set((x * inv * vr - z * inv * 0.22 * rho) * g, vy * g, (z * inv * vr + x * inv * 0.22 * rho) * g);
    // The sip drags everything near the surface toward the mouth.
    if (this.drink > 0) {
      const dx = this.mouth.x - x, dy = this.mouth.y - y, dz = this.mouth.z - z;
      const d = Math.hypot(dx, dy, dz) + 1e-4, reach = this.sip.final ? 30 : TUNE.sipReach;
      if (d < reach) { const s = (this.sip.final ? 5 : 4.4 * (1 - d / reach)) * this.drink / d; out.x += dx * s; out.y += dy * s; out.z += dz * s; }
      const h = this.surfC - (this.up.y * y + this.up.z * z);
      if (h < 2.5) out.z -= 1.0 * this.drink * (1 - h / 2.5);
    }
    return out;
  }

  // Keep a sphere inside the liquid. Returns 1 if it touched the surface.
  confine(p, r, vel) {
    let hit = 0;
    if (p.y < YB + r) { p.y = YB + r; if (vel && vel.y < 0) vel.y = 0; }
    const rho = Math.hypot(p.x, p.z), lim = this.R(p.y) - r;
    if (rho > lim) {
      const nx = p.x / rho, nz = p.z / rho;
      p.x = nx * lim; p.z = nz * lim;
      if (vel) { const vn = vel.x * nx + vel.z * nz; if (vn > 0) { vel.x -= vn * nx; vel.z -= vn * nz; } }
    }
    const h = this.depth(p);
    if (h < r) {
      p.addScaledVector(this.up, h - r); hit = 1;
      if (vel) { const vn = vel.dot(this.up); if (vn > 0) vel.addScaledVector(this.up, -vn); }
    }
    return hit;
  }

  // input: { move: Vector3 (x/z steer, y dive/rise, each -1..1), forward: Vector3, dash: bool }
  update(dt, input) {
    this.events.length = 0;
    this.time += dt;
    if (this.state === 'title') { this.ambient(dt, false); return; }
    this.updateSip(dt);
    this.setSurface();
    if (this.state === 'play') this.updatePlayer(dt, input);
    else if (this.state === 'escape') this.updateEscape(dt);
    else if (this.state === 'dead') this.deadT += dt;
    this.ambient(dt, this.state === 'play');
    const P = this.player;
    P.wob = Math.max(this.fizzT > 0 ? 0.35 : 0, P.wob - dt * 1.8); P.invuln = Math.max(0, P.invuln - dt); P.hurtT = Math.max(0, P.hurtT - dt);
    if (P.pop > 0) { P.pop += dt * 1.6; if (P.pop >= 1) P.pop = 0; }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.fizzT > 0) { this.fizzT -= dt; if (this.fizzT <= 0) { this.fizzT = 0; this.fizz = 0; this.emit('fizzEnd', {}); } }
    else this.fizz = Math.max(0, this.fizz - dt * TUNE.fizzDecay);
    this.toastCd -= dt;
  }

  updateSip(dt) {
    const s = this.sip;
    if (this.state !== 'play' && s.phase === 'wait') { this.warning = 0; this.shade = Math.max(0, this.shade - dt); return; }
    s.t -= dt;
    const targetTilt = () => Math.min(1.0, Math.atan((RIM - 0.35 - this.level) / 4));
    if (s.phase === 'wait') {
      this.warning = s.t < 3.5 ? 1 - s.t / 3.5 : 0;
      this.shade = this.warning * 0.7;
      if (s.t < 3.5 && s.t + dt >= 3.5) this.emit('warn', { final: s.done >= this.nSips });
      if (s.t <= 0) {
        s.phase = 'up'; s.t = 1.3; s.final = s.done >= this.nSips; s.a0 = targetTilt();
        this.emit('sip', { final: s.final });
      }
    } else if (s.phase === 'up') {
      const k = 1 - s.t / 1.3;
      this.tilt = s.a0 * smoothstep(0, 1, k); this.lift = smoothstep(0, 1, k);
      this.drink = smoothstep(0.7, 1, k); this.shade = 0.7 + 0.3 * k; this.warning = 1;
      if (s.t <= 0) {
        s.phase = 'drink'; s.t = s.final ? 2.6 : 2.0; s.dur = s.t; s.from = this.level;
        s.to = s.final ? YB + 0.25 : Math.max(LMIN, this.level - (L0 - LMIN) / this.nSips);
      }
    } else if (s.phase === 'drink') {
      const k = 1 - s.t / s.dur;
      this.level = lerp(s.from, s.to, k); this.tilt = targetTilt(); this.drink = 1; this.shade = 1;
      this.foamH = Math.max(0.75, this.foamH - dt * 0.14);
      if (s.t <= 0) {
        if (s.final) {
          if (this.state === 'play') this.die('empty');
          s.phase = 'hold'; s.t = 1e9;
        } else { s.phase = 'down'; s.t = 1.1; s.a0 = this.tilt; s.done++; }
      }
    } else if (s.phase === 'down') {
      const k = 1 - s.t / 1.1;
      this.tilt = s.a0 * (1 - smoothstep(0, 1, k)); this.lift = 1 - smoothstep(0, 1, k);
      this.drink = Math.max(0, 1 - k * 3); this.shade = 1 - k; this.warning = 0;
      if (s.t <= 0) { s.phase = 'wait'; s.t = this.sipEvery; this.tilt = 0; this.lift = 0; this.drink = 0; this.emit('sipEnd', {}); }
    }
  }

  saveBest() { if (this.score > this.best) { this.best = this.score; try { localStorage.setItem('buborek-best', String(this.best)); } catch { /* ignore */ } } }

  die(cause) {
    if (this.state !== 'play') return;
    this.state = 'dead'; this.deadT = 0; this.deathCause = cause;
    const P = this.player;
    P.visible = false; this.fizzT = 0; this.fizz = 0;
    if (cause === 'pop' || cause === 'absorbed') P.pop = 0.001;
    this.saveBest();
    this.emit('dead', { cause });
  }

  toast(text) { if (this.toastCd <= 0) { this.toastCd = 3; this.emit('toast', { text }); } }

  // Shrinks the player after a hit; returns false if that was fatal.
  hurt(factor, cause, nx, ny, nz) {
    const P = this.player;
    P.vel.x += nx * 2.6; P.vel.y += ny * 2.6; P.vel.z += nz * 2.6;
    P.r *= factor; this.combo = 0; this.comboT = 0; this.fizz *= 0.5;
    this.emit('hit', { cause });
    if (P.r < R_MIN) { this.die(cause); return false; }
    P.invuln = TUNE.mercy; P.hurtT = TUNE.mercy; P.wob = 1; P.pop = 0.001;
    return true;
  }

  updatePlayer(dt, input) {
    const P = this.player, f = V(), fizzing = this.fizzT > 0;
    this.flow(P.pos.x, P.pos.y, P.pos.z, f);
    // The bubble slowly dissolves into the beer, so standing still is not an option.
    if (!fizzing) { P.r -= P.r * TUNE.dissolve * dt; if (P.r < R_MIN) { this.die('pop'); return; } }

    // yeast clouds slow, sink and blind
    let inCloud = 0;
    for (let i = 0; i < this.nClouds; i++) {
      const c = this.clouds[i];
      inCloud = Math.max(inCloud, 1 - smoothstep(c.rad * 0.35, c.rad * 1.05, P.pos.distanceTo(c.pos)));
    }
    if (fizzing) inCloud *= 0.25;
    this.haze = lerp(this.haze, inCloud, Math.min(1, dt * 4));
    if (inCloud > 0.5) this.toast('Élesztőfelhő! Lehúz és lelassít.');

    // The bubble always floats upward on its own; steering is sideways, diving fights the buoyancy.
    const speed = 2.1 * (1 - 0.6 * inCloud) * (fizzing ? 1.5 : 1);
    const buoy = (0.55 + 2.2 * P.r) * (1 - 1.5 * inCloud) * (fizzing ? 2.3 : 1);
    const tx = input.move.x * speed + this.up.x * buoy + f.x * 0.4;
    const ty = input.move.y * speed + this.up.y * buoy + f.y * 0.4;
    const tz = input.move.z * speed + this.up.z * buoy + f.z * 0.4;
    const k = Math.min(1, dt * 4.5);
    P.vel.x += (tx - P.vel.x) * k; P.vel.y += (ty - P.vel.y) * k; P.vel.z += (tz - P.vel.z) * k;

    P.dashCd = Math.max(0, P.dashCd - dt);
    if (input.dash && P.dashCd <= 0) {
      const d = V().set(input.move.x, input.move.y * 0.6, input.move.z);
      if (d.lengthSq() < 0.01) d.copy(this.up);
      d.normalize();
      P.vel.addScaledVector(d, 5.5); P.dashCd = 1.3; P.wob = 1;
      this.emit('dash', {});
    }
    P.pos.addScaledVector(P.vel, dt);

    // foam gate
    const touched = this.confine(P.pos, P.r, P.vel);
    if (touched && this.drink < 0.3) {
      if (P.r >= this.gate) { this.beginEscape(); return; }
      P.vel.addScaledVector(this.up, -1.6); P.wob = Math.max(P.wob, 0.6);
      this.toast('Még túl kicsi vagy a habhoz. Merülj le, és nyelj el több buborékot!');
      this.emit('bump', {});
    }

    // swallowed by the drinker
    if (this.drink > 0.5 && P.pos.distanceTo(this.mouth) < 0.95) { this.die('swallowed'); return; }

    // hop shards: they hurt, unless you are fizzing, then you smash them
    for (let i = 0; i < this.nHops; i++) {
      const h = this.hops[i], d = P.pos.distanceTo(h.pos);
      if (d >= P.r + h.s * 0.8) continue;
      if (fizzing) {
        this.score += 150; this.emit('smash', { pts: 150 });
        this.spawnHop(h, true);
      } else if (P.invuln <= 0) {
        const n = V().subVectors(P.pos, h.pos).normalize();
        h.wander.copy(n).negate();
        if (!this.hurt(TUNE.hopBite, 'pop', n.x, n.y, n.z)) return;
        this.toast('Komlószilánk! Kisebb lettél.');
      }
    }
  }

  beginEscape() {
    this.state = 'escape'; this.escapeT = 0; this.fizzT = 0;
    const bonus = 1000 * this.mug + Math.round(200 * Math.max(0, this.nSips - this.sip.done));
    this.score += bonus;
    this.saveBest();
    this.emit('escape', { bonus });
  }

  updateEscape(dt) {
    const P = this.player;
    this.escapeT += dt;
    const top = this.level + this.foamH + 0.5;
    if (P.visible) {
      P.vel.set(0, P.pos.y < top ? 2.6 : 1.3, 0);
      P.pos.addScaledVector(P.vel, dt);
      P.pos.x *= 1 - dt * 0.6; P.pos.z *= 1 - dt * 0.6;
      P.scale = 1 + Math.max(0, P.pos.y - top) * 0.9;
      if (P.pos.y > top + 3.4) { P.visible = false; P.pop = 0.001; this.emit('free', {}); }
    }
  }

  ambient(dt, live) {
    const P = this.player, f = V(), up = this.up, bp = this.bPos, br = this.bRad, t = this.time;
    const span = L0 - YB, pr = P.r, fizzing = this.fizzT > 0;
    const eatMax = pr * (fizzing ? TUNE.fizzEat : 0.93), dangerMin = pr * 1.08;
    const pull = live ? TUNE.pull(pr) * (fizzing ? 2.2 : 1) : 0;     // small bubbles drift toward you
    let ate = 0;
    for (let i = 0; i < this.NB; i++) {
      const k = i * 3;
      let x = bp[k], y = bp[k + 1], z = bp[k + 2];
      const r = this.bTarget[i] * (0.7 + 0.3 * clamp((y - YB) / span, 0, 1));
      br[i] = r;
      this.flow(x, y, z, f);
      const rise = 0.2 + 1.3 * Math.sqrt(r), ph = this.bPhase[i];
      x += (f.x * 0.8 + up.x * rise + Math.sin(t * 2.3 + ph) * 0.05) * dt;
      y += (f.y * 0.8 + up.y * rise) * dt;
      z += (f.z * 0.8 + up.z * rise + Math.cos(t * 1.9 + ph * 1.3) * 0.05) * dt;
      if (y < YB + r) y = YB + r;
      const rho = Math.hypot(x, z), lim = this.R(y) - r;
      if (rho > lim) { x *= lim / rho; z *= lim / rho; }
      // reaches the foam, or goes down the drinker's throat
      if (this.surfC - (up.y * y + up.z * z) < r || (this.drink > 0.5 && Math.hypot(x - this.mouth.x, y - this.mouth.y, z - this.mouth.z) < 0.8)) {
        this.spawnBubble(i, false); continue;
      }
      if (live) {
        const dx = x - P.pos.x, dy = y - P.pos.y, dz = z - P.pos.z, rr = pr + r;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < pull * pull && r < eatMax && d2 > 1e-6) {
          const d = Math.sqrt(d2), s = Math.min(d, (fizzing ? 3.2 : 1.5) * dt) / d;
          x -= dx * s; y -= dy * s; z -= dz * s;
        }
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-3;
          if (r < eatMax) {
            P.r = Math.cbrt(P.r ** 3 + TUNE.grow * r ** 3);
            this.combo = Math.min(9, this.combo + 1); this.comboT = 2.0; this.eaten++; ate++;
            const pts = Math.round((10 + 90 * Math.min(1, r / pr)) * this.combo * (fizzing ? 2 : 1));
            this.score += pts; P.wob = Math.max(P.wob, 0.45 + Math.min(1, r / pr) * 0.5);
            P.vel.addScaledVector(up, 0.35);                       // every bubble gives a little lift
            if (!fizzing) {
              this.fizz = Math.min(1, this.fizz + TUNE.fizzGain(this.combo));
              if (this.fizz >= 1) { this.fizzT = TUNE.fizzTime; this.emit('fizz', {}); }
            }
            this.emit('absorb', { pts, ratio: Math.min(1, r / pr) });
            this.spawnBubble(i, false); continue;
          } else if (r > dangerMin && P.invuln <= 0) {
            // a bigger bubble takes a bite out of you
            if (!this.hurt(TUNE.bubbleBite, 'absorbed', -dx / d, -dy / d, -dz / d)) { bp[k] = x; bp[k + 1] = y; bp[k + 2] = z; return; }
            this.toast('A pirosan csillogó, nagyobb buborékok megcsípnek. Kerüld őket, amíg kicsi vagy!');
          } else {
            const o = (rr - d) / d;
            x += dx * o * 0.7; y += dy * o * 0.7; z += dz * o * 0.7;
            P.pos.x -= dx * o * 0.3; P.pos.y -= dy * o * 0.3; P.pos.z -= dz * o * 0.3;
            P.wob = Math.max(P.wob, 0.3);
          }
        }
      }
      bp[k] = x; bp[k + 1] = y; bp[k + 2] = z;
    }
    if (ate && P.r >= this.gate && !this.gateTold) { this.gateTold = true; this.emit('ready', {}); }
    if (P.r < this.gate) this.gateTold = false;

    for (let i = 0; i < this.nHops; i++) {
      const h = this.hops[i];
      this.flow(h.pos.x, h.pos.y, h.pos.z, f);
      if (Math.random() < dt * 0.4) h.wander.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.7, Math.random() - 0.5).normalize();
      h.pos.addScaledVector(f, 0.9 * dt).addScaledVector(h.wander, TUNE.hopDrift * this.flowGain * dt);
      // every third shard drifts after the player when close
      if (live && i % 3 === 0 && !fizzing) {
        const hx = P.pos.x - h.pos.x, hy = P.pos.y - h.pos.y, hz = P.pos.z - h.pos.z, hd = Math.hypot(hx, hy, hz);
        if (hd < 3 && hd > 1e-3) { const s = this.hunt * dt / hd; h.pos.x += hx * s; h.pos.y += hy * s; h.pos.z += hz * s; }
      }
      h.ang += h.spin * dt;
      this.confine(h.pos, h.s, null);
      if (this.drink > 0.5 && h.pos.distanceTo(this.mouth) < 0.9) this.spawnHop(h, true);
    }
    for (let i = 0; i < this.nClouds; i++) {
      const c = this.clouds[i];
      this.flow(c.pos.x, c.pos.y, c.pos.z, f);
      if (Math.random() < dt * 0.15) c.wander.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5);
      c.pos.addScaledVector(f, 0.45 * dt).addScaledVector(c.wander, 0.18 * dt);
      this.confine(c.pos, c.rad * 0.5, null);
    }
    const s = this.specks, tp = V();
    for (let i = 0; i < s.length; i += 3) {
      this.flow(s[i], s[i + 1], s[i + 2], f);
      s[i] += f.x * dt; s[i + 1] += (f.y + 0.03) * dt; s[i + 2] += f.z * dt;
      tp.set(s[i], s[i + 1], s[i + 2]);
      if (!this.inside(tp, 0.04)) { this.randomPoint(tp, 0.1); s[i] = tp.x; s[i + 1] = tp.y; s[i + 2] = tp.z; }
    }
  }
}
