// Dev helper: plays the game rules with a simple bot, many runs at high speed, to tune difficulty.
// Usage: node tools/sim.mjs [runs] [skill 0..1]
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { SHAPES, THEMES, YB } from '../src/params.js';

const RUNS = +(process.argv[2] || 60), SKILL = +(process.argv[3] || 0.4), DT = 1 / 30;
const theme = THEMES[process.argv[4] || 'vasar'];

function playOne() {
  const g = new Game(SHAPES[theme.shape], theme.foam);
  g.newRun();
  const input = { move: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), dash: false };
  const tgt = new THREE.Vector3(); let has = false, think = 0, diveT = 0, t = 0, mugStart = 0;
  const log = { mugs: 0, times: [], sips: [], cause: '', hits: 0, fizz: 0 };
  const P = g.player;
  while (t < 900) {
    t += DT; think -= DT; diveT -= DT;
    const m = input.move.set(0, 0, 0);
    if (g.state === 'play') {
      if (g.warning > 0 || g.drink > 0) {
        // flee: down and away from the mouth (only as well as the skill allows)
        if (Math.random() < 0.5 + 0.5 * SKILL) { m.set(-P.pos.x * 0.5, P.pos.y > YB + 1.2 ? -1 : 0, 2.6 - P.pos.z); }
      } else if (P.r < g.gate) {
        if (think <= 0) {
          think = 0.25 + (1 - SKILL) * 0.5; has = false; let best = 1e9;
          const reach = 0.8 + SKILL * 1.4;
          for (let i = 0; i < g.NB; i++) {
            if (g.bRad[i] >= P.r * 0.93) continue;
            const dx = g.bPos[i * 3] - P.pos.x, dy = g.bPos[i * 3 + 1] - P.pos.y, dz = g.bPos[i * 3 + 2] - P.pos.z;
            const d = Math.hypot(dx, dz) + Math.abs(dy - 0.3) * 0.6;
            if (d < best && d < reach) { best = d; tgt.set(g.bPos[i * 3], g.bPos[i * 3 + 1], g.bPos[i * 3 + 2]); has = true; }
          }
        }
        if (has) { m.set((tgt.x - P.pos.x) * 4, tgt.y < P.pos.y - 0.15 ? -1 : 0, (tgt.z - P.pos.z) * 4); }
        if (g.depth(P.pos) < 0.9) diveT = 1.6;
        if (diveT > 0) m.y = -1;
        // dodge nearby threats
        if (Math.random() < SKILL) {
          for (let i = 0; i < g.nHops; i++) {
            const h = g.hops[i], d = P.pos.distanceTo(h.pos);
            if (d < 0.55) { m.x += (P.pos.x - h.pos.x) / d * 3; m.z += (P.pos.z - h.pos.z) / d * 3; }
          }
        }
      }
      const hl = Math.hypot(m.x, m.z); if (hl > 1) { m.x /= hl; m.z /= hl; }
      m.y = Math.max(-1, Math.min(1, m.y));
    }
    g.update(DT, input);
    for (const ev of g.events) {
      if (ev.type === 'hit') log.hits++;
      if (ev.type === 'fizz') log.fizz++;
      if (ev.type === 'escape') { log.mugs++; log.times.push(t - mugStart); log.sips.push(g.sip.done); }
      if (ev.type === 'dead') { log.cause = ev.cause; log.score = g.score; return log; }
    }
    if (g.state === 'escape' && g.escapeT > 5.3) { g.nextMug(); mugStart = t; }
  }
  log.cause = 'timeout'; log.score = g.score; return log;
}

const logs = Array.from({ length: RUNS }, playOne);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const reach = (n) => Math.round(100 * logs.filter((l) => l.mugs >= n).length / RUNS);
const causes = {}; for (const l of logs) causes[l.cause] = (causes[l.cause] || 0) + 1;
const t1 = logs.filter((l) => l.times[0]).map((l) => l.times[0]);
console.log(`skill ${SKILL}  runs ${RUNS}`);
console.log(`cleared mug 1/2/3/4: ${reach(1)}% ${reach(2)}% ${reach(3)}% ${reach(4)}%   avg mugs ${avg(logs.map((l) => l.mugs)).toFixed(2)}`);
console.log(`mug 1: time ${avg(t1).toFixed(0)} s, sips survived ${avg(logs.filter((l) => l.sips.length).map((l) => l.sips[0])).toFixed(1)}`);
console.log(`hits/run ${avg(logs.map((l) => l.hits)).toFixed(1)}  fizz/run ${avg(logs.map((l) => l.fizz)).toFixed(1)}  avg score ${avg(logs.map((l) => l.score)).toFixed(0)}`);
console.log('deaths:', JSON.stringify(causes));
