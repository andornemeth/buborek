import './style.css';
import * as THREE from 'three';
import { quality, isMobile, RI, YB, L0, clamp, lerp } from './params.js';
import { createEnvironment } from './environment.js';
import { createMug } from './mug.js';
import { createBubbles } from './bubbles.js';
import { Game } from './game.js';
import { Pipeline } from './post.js';
import { Rig } from './camera.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('gl');

async function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);

  const U = {
    uEnv: { value: null }, uTime: { value: 0 }, uScene: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 }, uProj: { value: new THREE.Vector2(1, 1) },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  const env = createEnvironment(renderer, scene, U);
  const mug = await createMug(U);
  mug.group.position.y = env.tableTopY;
  scene.add(mug.group);

  const game = new Game();
  const things = createBubbles(mug, U, game);
  const pipe = new Pipeline(renderer, scene, U);
  const rig = new Rig(camera);
  const input = new Input(canvas);
  const sound = new Sound();
  const hud = new Hud(input);

  // --- sizing with dynamic resolution ---
  const fixedScale = params.has('scale') ? Number(params.get('scale')) : 0;
  let scale = fixedScale || quality.startScale, cssW = 1, cssH = 1;
  const resize = () => {
    cssW = innerWidth; cssH = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, quality.maxDpr) * scale;
    const w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    pipe.setSize(w, h);
    U.uPx.value = h;
  };
  addEventListener('resize', resize); resize();
  let acc = 0, frames = 0, settle = 3, good = 0;
  const adapt = (dtReal) => {
    if (fixedScale) return;
    if (settle > 0) { settle -= dtReal; return; }
    acc += dtReal; frames++;
    if (frames < 40) return;
    const ms = (acc / frames) * 1000; acc = 0; frames = 0;
    if (ms > 21 && scale > 0.5) { scale = Math.max(0.5, scale - 0.1); good = 0; resize(); settle = 0.6; }
    else if (ms < 13.5 && scale < 1) { if (++good >= 4) { scale = Math.min(1, scale + 0.1); good = 0; resize(); settle = 0.6; } }
    else good = 0;
  };

  // --- flow between title, play, escape and game over ---
  let fade = 0, fadeTo = 0, fadeTint = [0, 0, 0], cardUp = true, warp = 0, wasOutside = true, lastBonus = 0;
  const begin = (fn) => { sound.start(); fn(); rig.goInside(); cardUp = false; rig.pitchIn = 0.3; };
  hud.title(game.best, () => begin(() => {
    game.newRun();
    setTimeout(() => game.state === 'play' && hud.toast('Nyeld el a nálad kisebb buborékokat, hogy megnőj!', 4.5), 2600);
  }));
  document.getElementById('btnSound').addEventListener('click', (e) => {
    sound.setMuted(!sound.muted); e.currentTarget.textContent = sound.muted ? 'Hang: ki' : 'Hang: be'; e.currentTarget.blur();
  });

  const move = new THREE.Vector3(), mouthW = new THREE.Vector3(), camL = new THREE.Vector3();
  const frameInput = { move, forward: rig.forward, dash: false };
  let last = performance.now();

  const frame = (now) => {
    const dtReal = clamp((now - last) / 1000, 0.001, 0.05); last = now;
    adapt(dtReal);
    const playing = game.state === 'play';

    // input
    const inp = input.consume();
    rig.look(inp.dx, inp.dy);
    if (game.state === 'title' && !input.look.size) rig.yaw += dtReal * 0.1;
    if (playing) {
      if (inp.toggle) rig.toggle();
      if (inp.zoom) { const z = rig.zoom(inp.zoom); if (z === 'in') rig.goInside(); if (z === 'out') rig.goOutside(); }
    } else if (inp.zoom) rig.zoom(inp.zoom);
    const ax = input.axes();
    move.set(0, 0, 0).addScaledVector(rig.forward, ax.y).addScaledVector(rig.right, ax.x);
    move.y += ax.v;
    if (move.lengthSq() > 1) move.normalize();
    frameInput.dash = inp.dash && playing;

    // simulate; the outside view runs in slow motion
    const dt = dtReal * (playing ? lerp(1, 0.3, rig.e) : 1);
    game.update(dt, frameInput);
    U.uTime.value += dtReal;

    for (const ev of game.events) {
      if (ev.type === 'absorb') { sound.absorb(ev.ratio, game.combo); if (game.combo > 1 && game.combo % 3 === 0) hud.toast(`<span class="pts">×${game.combo} sorozat!</span>`, 1.2); }
      else if (ev.type === 'hit') { sound.hit(); }
      else if (ev.type === 'dash') sound.dash();
      else if (ev.type === 'bump') sound.bump();
      else if (ev.type === 'toast') hud.toast(ev.text, 3);
      else if (ev.type === 'warn') sound.warn();
      else if (ev.type === 'sip') sound.gulp();
      else if (ev.type === 'escape') { lastBonus = ev.bonus; rig.goOutside(); rig.pitchOut = -0.3; hud.toast('Áttörted a habot!', 2.5); }
      else if (ev.type === 'free') sound.free();
      else if (ev.type === 'dead') {
        if (ev.cause === 'pop') sound.pop(); else { fadeTo = 1; fadeTint = [0.02, 0.005, 0.0]; }
      }
    }
    if (game.state === 'escape' && game.escapeT > 4.6 && !cardUp) {
      cardUp = true;
      hud.escaped(game, lastBonus, () => { fade = 1; fadeTo = 0; fadeTint = [2.4, 2.1, 1.6]; begin(() => game.nextMug()); hud.toast(`${game.mug}. korsó`, 2); });
    }
    if (game.state === 'dead' && game.deadT > 1.5 && !cardUp) {
      cardUp = true; rig.goOutside(); fadeTo = 0;
      hud.over(game, () => { fade = 1; fadeTo = 0; fadeTint = [2.4, 2.1, 1.6]; begin(() => game.newRun()); });
    }
    fade += clamp(fadeTo - fade, -dtReal * 1.6, dtReal * 2.5);

    // world state -> visuals
    mug.setState(game.level, game.tilt, game.foamH, game.laceTop);
    mug.group.position.set(0, env.tableTopY + game.lift * 5.0, -game.lift * 2.2);
    mug.mu.uSigma.value = game.sigma; mug.mu.uShade.value = game.shade;
    mug.mu.uFogGain.value = lerp(1.0, 1.75, rig.e);
    env.update(dtReal);
    rig.shiftTo = cardUp && cssW / cssH > 1.35 ? 6.5 : 0;
    rig.update(dtReal, game, mug.group, cssW / cssH);
    mug.updateCamera(camera);
    U.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    camL.copy(mug.mu.uCam.value);
    const outsideGlass = Math.hypot(camL.x, camL.z) > RI - 0.02 || camL.y < YB || game.depth(camL) < 0;
    if (outsideGlass !== wasOutside) { wasOutside = outsideGlass; warp = 1; }
    warp = Math.max(0, warp - dtReal * 2.2);
    mug.glass.visible = outsideGlass;
    things.sync(rig.e, outsideGlass);
    env.glow.material.uniforms.uLift.value = game.lift;
    env.glow.material.uniforms.uBeer.value = (game.level - YB) / (L0 - YB);

    const f = pipe.final.uniforms;
    f.uDof.value = rig.e * rig.e; f.uFocus.value = rig.focus;
    f.uHaze.value = game.haze * (1 - rig.e); f.uWarp.value = warp;
    f.uFade.value = fade; f.uTint.value.set(fadeTint[0], fadeTint[1], fadeTint[2]);
    f.uBloom.value = lerp(0.1, 0.06, rig.e);
    pipe.render(scene, camera);

    // hud
    let ms = null;
    if (game.warning > 0) {
      mouthW.copy(game.mouth); mug.group.localToWorld(mouthW); mouthW.project(camera);
      ms = { x: (mouthW.x * 0.5 + 0.5) * cssW, y: (-mouthW.y * 0.5 + 0.5) * cssH, behind: mouthW.z > 1 };
    }
    hud.update(dtReal, game, rig, playing || (game.state === 'escape' && !cardUp), ms);
    sound.mix(rig.e, playing ? game.warning * (1 - game.drink) : 0, game.drink);
    requestAnimationFrame(frame);
  };
  document.getElementById('card').classList.remove('loading');
  requestAnimationFrame(frame);
  window.__dbg = { game, rig, pipe, mug, renderer, input, get scale() { return scale; } };
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('cardInner').innerHTML = '<h2>Nem sikerült elindítani</h2><p>Ehhez a játékhoz WebGL2-t támogató böngésző kell.</p><p class="dim">' + String(err && err.message || err) + '</p>';
});
