// Dev helper: builds are served with Vite preview and driven in headless Chromium to take screenshots.
// Usage: node tools/shot.mjs <outDir> [width] [height] [steps...]
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [outDir, W = '1280', H = '720', ...steps] = process.argv.slice(2);
const cache = join(homedir(), '.cache/ms-playwright');
const dir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
const server = await preview({ preview: { port: 4317, strictPort: false }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: join(cache, dir, 'chrome-linux64/chrome'),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const mobile = Number(W) < 600;
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url + '?scale=1' + (process.env.HELY ? '&hely=' + process.env.HELY : ''));
await page.waitForFunction(() => window.__dbg || document.querySelector('#cardInner h2'), null, { timeout: 60000 });
const wait = (ms) => page.waitForTimeout(ms);
// The software renderer is slow, so wait on game state and rendered frames rather than wall-clock time.
const frames = (n) => page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const viewIs = (v) => page.waitForFunction((v) => window.__dbg.rig.view === v, v, { timeout: 120000 });
const snap = (name) => page.screenshot({ path: join(outDir, name + '.png') });
const want = (s) => steps.length === 0 || steps.includes(s);

await wait(1500);
if (want('card')) await snap('00-card');
await page.evaluate(() => document.getElementById('card').classList.add('off'));
if (want('title')) { await page.evaluate(() => { window.__dbg.rig.yaw = 0.25; }); await wait(700); await snap('01-title'); }
if (want('top')) { await page.evaluate(() => { const r = window.__dbg.rig; r.yaw = 2.2; r.pitchOut = -0.75; r.dist = 26; }); await wait(700); await snap('01b-top'); }
if (steps.length === 0 || steps.some((s) => ['inside', 'outside', 'sip', 'wall', 'hud'].includes(s))) {
  if (steps.includes('escape')) throw new Error('run the escape step on its own');
  await page.evaluate(() => document.querySelector('button.go').click());
  await viewIs(0); await frames(6);
  if (want('inside')) await snap('02-inside');
  if (want('wall')) {
    await page.evaluate(() => { const { game, rig } = window.__dbg; game.player.pos.set(0, 6.5, 2.6); game.player.r = 0.1; game.player.invuln = 99; rig.yaw = Math.PI; rig.pitchIn = 0.1; });
    await frames(5); await snap('02b-wall');
    await page.evaluate(() => { const { rig } = window.__dbg; rig.pitchIn = 1.1; });
    await frames(5); await snap('02c-up');
    await page.evaluate(() => { const { game, rig } = window.__dbg; rig.pitchIn = -0.5; rig.yaw = 0.5; rig.update(0.001, game, window.__dbg.mug.group, 16 / 9); game.hops[0].pos.copy(game.player.pos).addScaledVector(rig.right, 0.7).addScaledVector(rig.forward, 0.15); game.hops[1].pos.copy(game.player.pos).addScaledVector(rig.right, -1.1).addScaledVector(rig.forward, 1.6); game.clouds[0].pos.copy(game.player.pos).add({ x: -1.2, y: -0.9, z: -2.4 }); });
    await frames(3); await snap('02d-down');
  }
  if (want('outside')) { await page.evaluate(() => { window.__dbg.rig.yaw = 0.3; window.__dbg.rig.goOutside(); }); await viewIs(1); await frames(4); await snap('03-outside'); }
  if (want('sip')) {
    const phase = (p) => page.waitForFunction((p) => window.__dbg.game.sip.phase === p, p, { timeout: 180000 });
    await page.evaluate(() => { const { game, rig } = window.__dbg; rig.yaw = 0.9; rig.goOutside(); game.player.pos.set(0, 3, 2.5); game.sip.t = 0.05; });
    await phase('drink'); await viewIs(1); await frames(3); await snap('04-sip');
    await phase('wait');
    await page.evaluate(() => { const { game, rig } = window.__dbg; rig.yaw = 0; rig.pitchIn = 0.5; rig.goInside(); game.player.pos.set(0, 4, 2.5); game.sip.t = 0.05; });
    await phase('drink'); await viewIs(0); await frames(3); await snap('05-sip-inside');
  }
}
if (steps.includes('friends')) {
  await page.evaluate(() => document.querySelector('button.go').click());
  await viewIs(0);
  await page.evaluate(() => { const { game, rig } = window.__dbg; game.player.invuln = 99; game.player.r = 0.09; game.player.pos.set(0, 8.5, -2.4); game.player.vel.set(0, 0, 0); rig.yaw = 0; rig.pitchIn = 0.12; });
  await frames(3); await snap('10-friends-inside');
  await page.evaluate(() => { const { game, rig } = window.__dbg; rig.yaw = 0.05; rig.pitchOut = -0.05; rig.goOutside(); });
  await viewIs(1); await frames(3); await snap('11-friends-outside');
  await page.evaluate(() => { const { rig } = window.__dbg; rig.yaw = -0.75; rig.pitchOut = 0.02; });
  await frames(4); await snap('12-wall-photo');
}
if (steps.includes('chain')) {
  await page.evaluate(() => document.querySelector('button.go').click());
  await viewIs(0);
  await page.evaluate(() => { const { game, rig } = window.__dbg; const s = game.sites[3]; game.player.invuln = 99; game.player.pos.set(s[0] + 0.25, 3.2, s[2] + 0.35); game.player.vel.set(0, 0, 0); rig.yaw = Math.atan2(-0.25, 0.35) + Math.PI; rig.pitchIn = 0.35; game.fizz = 0.97; });
  await frames(3); await snap('08-chain');
  await page.waitForFunction(() => window.__dbg.game.fizzT > 0, null, { timeout: 5000 }).catch(() => page.evaluate(() => { window.__dbg.game.fizzT = 5; }));
  await frames(6); await snap('09-fizz');
}
if (steps.includes('escape')) {
  await page.evaluate(() => document.querySelector('button.go').click());
  await viewIs(0);
  await page.evaluate(() => { const g = window.__dbg.game; g.nHops = 0; g.player.r = g.gate + 0.03; g.player.pos.set(0.5, g.level - 0.3, 0.5); });
  await page.waitForFunction(() => window.__dbg.game.state === 'escape' && window.__dbg.game.escapeT > 2.6, null, { timeout: 240000 });
  await snap('06-escape');
  await page.waitForFunction(() => !document.getElementById('card').classList.contains('off'), null, { timeout: 240000 });
  await frames(4); await snap('07-escape-card');
}
const info = await page.evaluate(() => window.__dbg ? { state: window.__dbg.game.state, level: window.__dbg.game.level, r: window.__dbg.game.player.r, score: window.__dbg.game.score } : null);
console.log(JSON.stringify(info));
console.log([...new Set(logs)].slice(0, 12).map((l) => l.slice(0, 1500)).join('\n') || 'no console errors');
await browser.close();
await new Promise((r) => server.httpServer.close(r));
process.exit(0);
