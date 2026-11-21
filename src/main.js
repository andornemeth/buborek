import './style.css';
import * as THREE from 'three';
import { quality, YB, L0, clamp, lerp, THEMES, SHAPES, currentThemeId } from './params.js';
import { createEnvironment } from './environment.js';
import { createMug } from './mug.js';
import { createBubbles } from './bubbles.js';
import { Game, TUNE } from './game.js';
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
  const themeId = currentThemeId(), theme = THEMES[themeId];
  const env = await createEnvironment(renderer, scene, U, themeId);
  const mug = await createMug(U, theme);
  mug.group.position.y = env.tableTopY;
  scene.add(mug.group);

  const game = new Game(SHAPES[theme.shape], theme.foam);
  const things = createBubbles(mug, U, game);
  const pipe = new Pipeline(renderer, scene, U);
  const rig = new Rig(camera);
  const input = new Input(canvas);
  const sound = new Sound();
  const hud = new Hud(input, themeId);

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
  let fade = 0, fadeTo = 0, fadeTint = [0, 0, 0], cardUp = true, warp = 0, wasOutside = true, lastBonus = 0, rush = 0, broke = false;
  const begin = (fn) => { sound.start(); fn(); rig.goInside(); cardUp = false; rig.pitchIn = 0.3; };
  hud.title(game.best, themeId, () => begin(() => { game.newRun(); }), (id) => {
    try { localStorage.setItem('buborek-hely', id); } catch { /* ignore */ }
    const q = new URLSearchParams(location.search); q.set('hely', id); location.search = q.toString();
  });
  if (themeId === 'kocsma') rig.pitchOut = -0.07;
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
    move.set(0, 0, 0).addScaledVector(rig.flat, ax.y).addScaledVector(rig.right, ax.x);
    if (move.lengthSq() > 1) move.normalize();
    if (playing && move.lengthSq() > 0.02) game.moved = true;
    move.y = clamp(ax.v, -1, 1);
    frameInput.dash = inp.dash && playing;

    // simulate; the outside view runs in slow motion
    const dt = dtReal * (playing ? lerp(1, 0.3, rig.e) : 1);
    game.update(dt, frameInput);
    U.uTime.value += dtReal;

    for (const ev of game.events) {
      if (ev.type === 'absorb') { sound.absorb(ev.ratio, game.combo); if (game.combo > 1 && game.combo % 3 === 0) hud.toast(`<span class="pts">×${game.combo} sorozat!</span>`, 1.2); }
      else if (ev.type === 'hit') { sound.hit(); }
      else if (ev.type === 'fizz') { sound.fizzUp(); hud.flash('PEZSGÉS!', 1.3); }
      else if (ev.type === 'smash') { sound.pop(); hud.toast('<span class="pts">Szétzúztad! +150</span>', 1); }
      else if (ev.type === 'ready') { sound.ready(); hud.flash('Fel a habba!', 1.5); }
      else if (ev.type === 'dash') sound.dash();
      else if (ev.type === 'bump') sound.bump();
      else if (ev.type === 'toast') hud.toast(ev.text, 3);
      else if (ev.type === 'warn') sound.warn();
      else if (ev.type === 'sip') sound.gulp();
      else if (ev.type === 'escape') { lastBonus = ev.bonus; broke = false; fadeTo = 0.92; fadeTint = [2.3, 2.1, 1.7]; warp = 1; sound.breakFoam(); }
      else if (ev.type === 'free') sound.free();
      else if (ev.type === 'dead') {
        if (ev.cause === 'pop') sound.pop(); else { fadeTo = 1; fadeTint = [0.02, 0.005, 0.0]; }
      }
    }
    // Breaking through the foam: white-out inside, then burst out above the mug.
    if (game.state === 'escape' && !broke) {
      warp = 1;
      if (game.escapeT > 0.9) { broke = true; rig.goOutside(); rig.view = 1; rig.pitchOut = -0.34; fadeTo = 0; hud.flash('PROST!', 2.2); }
    }
    if (game.state === 'escape' && game.escapeT > 5.2 && !cardUp) {
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
    const fizzing = game.fizzT > 0;
    mug.mu.uEdible.value = playing ? game.player.r * (fizzing ? TUNE.fizzEat : 0.93) : 0;
    mug.mu.uDanger.value = playing && !fizzing ? game.player.r * 1.08 : 1e9;
    // speed you can feel: wider view and streaks when rising fast or fizzing
    const sp = clamp((game.player.vel.length() - 1.0) / 3.5, 0, 1);
    rush += ((playing ? Math.max(sp * 0.6, fizzing ? 0.85 : 0) : 0) - rush) * Math.min(1, dtReal * 5);
    rig.kick = rush * 16;
    env.update(dtReal);
    rig.shiftTo = cardUp && cssW / cssH > 1.35 ? 6.5 : 0;
    rig.update(dtReal, game, mug.group, cssW / cssH);
    mug.updateCamera(camera);
    U.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    camL.copy(mug.mu.uCam.value);
    const outsideGlass = !game.inside(camL, 0);
    if (outsideGlass !== wasOutside) { wasOutside = outsideGlass; warp = 1; }
    warp = Math.max(0, warp - dtReal * 2.2);
    mug.glass.visible = outsideGlass;
    things.sync(rig.e, outsideGlass);
    env.glow.material.uniforms.uLift.value = game.lift;
    env.glow.material.uniforms.uBeer.value = (game.level - YB) / (L0 - YB);

    const f = pipe.final.uniforms;
    f.uDof.value = rig.e * rig.e; f.uFocus.value = rig.focus;
    f.uHaze.value = game.haze * (1 - rig.e); f.uWarp.value = warp; f.uRush.value = rush * (1 - rig.e);
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
