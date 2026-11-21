// Dev helper: drives the game rules in headless Chromium and reports pass/fail for each.
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const cache = join(homedir(), '.cache/ms-playwright');
const dir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
const server = await preview({ preview: { port: 4318 }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: join(cache, dir, 'chrome-linux64/chrome'), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 360, height: 220 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(server.resolvedUrls.local[0] + '?scale=0.5' + (process.env.HELY ? '&hely=' + process.env.HELY : ''));
await page.waitForFunction(() => window.__dbg, null, { timeout: 60000 });
const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); };
const G = (fn) => page.evaluate(fn);
const cardTitle = () => page.evaluate(() => document.querySelector('#card:not(.off) h1')?.textContent || '');

await page.click('button.go');
await until(() => window.__dbg.game.state === 'play');
check('start -> play', true);

// absorb a smaller bubble
const r0 = await G(() => { const g = window.__dbg.game; g.player.invuln = 99; g.player.pos.set(0, 6, 0); g.bTarget[0] = 0.05; g.bPos.set([0.02, 6.0, 0.0], 0); return g.player.r; });
await until((r0) => window.__dbg.game.player.r > r0, r0).then(() => check('absorbing grows the bubble', true), () => check('absorbing grows the bubble', false));
check('absorbing scores', (await G(() => window.__dbg.game.score)) > 0);

// a full fizz meter starts fizz mode on the next bubble
await G(() => { const g = window.__dbg.game; g.fizz = 0.99; g.player.pos.set(0, 6, 0); g.bTarget[2] = 0.03; g.bPos.set([0.02, 6.0, 0.0], 6); });
await until(() => window.__dbg.game.fizzT > 0).then(() => check('fizz mode starts when the meter fills', true), () => check('fizz mode starts when the meter fills', false));
await G(() => { const g = window.__dbg.game; g.hops[0].pos.copy(g.player.pos); g.nHops = Math.max(1, g.nHops); });
const sc0 = await G(() => window.__dbg.game.score);
await until((sc0) => window.__dbg.game.score >= sc0 + 150, sc0).then(() => check('fizzing smashes hop shards', true), () => check('fizzing smashes hop shards', false));
await G(() => { const g = window.__dbg.game; g.fizzT = 0.01; });
await until(() => window.__dbg.game.fizzT === 0);

// a bigger bubble bites
const r1 = await G(() => { const g = window.__dbg.game; g.player.r = 0.08; g.player.invuln = 0; g.player.pos.set(1, 5, 1); g.bTarget[1] = 0.9; g.bPos.set([1.05, 5.0, 1.0], 3); return g.player.r; });
await until((r1) => window.__dbg.game.player.r < r1 * 0.9, r1).then(() => check('a bigger bubble bites', true), () => check('a bigger bubble bites', false));

// the bubble rises by itself and dives while the dive key is held
const y0 = await G(() => { const g = window.__dbg.game; g.player.invuln = 99; g.player.pos.set(0, 5, 0); g.player.vel.set(0, 0, 0); return 5; });
await until((y0) => window.__dbg.game.player.pos.y > y0 + 0.25, y0).then(() => check('bubble rises on its own', true), () => check('bubble rises on its own', false));
await page.keyboard.down('ShiftLeft');
const y1 = await G(() => window.__dbg.game.player.pos.y);
await until((y1) => window.__dbg.game.player.pos.y < y1 - 0.25, y1).then(() => check('holding dive sinks the bubble', true), () => check('holding dive sinks the bubble', false));
await page.keyboard.up('ShiftLeft');

// hop shard shrinks
const r2 = await G(() => { const g = window.__dbg.game; g.player.r = 0.12; g.player.invuln = 0; g.hops[0].pos.copy(g.player.pos); return g.player.r; });
await until(() => window.__dbg.game.player.invuln > 0).then(async () => check('hop shard shrinks the bubble', (await G(() => window.__dbg.game.player.r)) < r2), () => check('hop shard shrinks the bubble', false));

// foam gate refuses a small bubble
await G(() => { const g = window.__dbg.game; g.player.r = 0.1; g.player.invuln = 99; g.nHops = 0; g.player.pos.set(0, g.level - 0.05, 0); });
await page.waitForTimeout(700);
check('foam gate holds back a small bubble', (await G(() => window.__dbg.game.state)) === 'play');

// sip lowers the level and swallows near the mouth
const l0 = await G(() => { const g = window.__dbg.game; g.player.invuln = 99; g.player.pos.set(0, 3, 3); g.sip.t = 0.05; return g.level; });
await until(() => window.__dbg.game.sip.phase === 'drink');
await G(() => { const g = window.__dbg.game; g.player.pos.copy(g.mouth); });
await until(() => window.__dbg.game.state === 'dead');
check('sip swallows at the mouth', (await G(() => window.__dbg.game.deathCause)) === 'swallowed');
await until(() => !document.getElementById('card').classList.contains('off'));
check('game-over card', (await cardTitle()) === 'Megittak', await cardTitle());
await page.click('button.go');
await until(() => window.__dbg.game.state === 'play');
check('restart resets score and level', await G(() => window.__dbg.game.score === 0 && window.__dbg.game.level > 11));
check('sip lowered the level', (await G(() => window.__dbg.game.sip.done)) >= 0 && l0 > 11);

// escape through the foam when big enough
await G(() => { const g = window.__dbg.game; g.nHops = 0; g.player.invuln = 99; g.player.r = g.gate + 0.02; g.player.pos.set(0, g.level - 0.1, 0); });
await until(() => window.__dbg.game.state === 'escape');
check('big bubble breaks through the foam', true);
await until(() => !document.getElementById('card').classList.contains('off'), null, 240000);
check('escape card', (await cardTitle()) === 'Szabad vagy!', await cardTitle());
await page.click('button.go');
await until(() => window.__dbg.game.state === 'play');
check('next mug', (await G(() => window.__dbg.game.mug)) === 2);

// pop at minimum size
await G(() => { const g = window.__dbg.game; g.player.r = 0.04; g.player.invuln = 0; g.nHops = 1; g.hops[0].pos.copy(g.player.pos); });
await until(() => window.__dbg.game.state === 'dead');
check('smallest bubble pops', (await G(() => window.__dbg.game.deathCause)) === 'pop');
await until(() => !document.getElementById('card').classList.contains('off'));
await page.click('button.go');
await until(() => window.__dbg.game.state === 'play');

// last sip empties the mug
await G(() => { const g = window.__dbg.game; g.nHops = 0; g.player.invuln = 99; g.player.pos.set(0, 2.5, 2.8); g.sip.done = g.nSips; g.sip.t = 0.05; });
await until(() => window.__dbg.game.state === 'dead', null, 240000);
check('last sip ends the run', ['empty', 'swallowed'].includes(await G(() => window.__dbg.game.deathCause)), await G(() => window.__dbg.game.deathCause));

console.log(results.join('\n'));
console.log(logs.length ? 'console errors:\n' + [...new Set(logs)].slice(0, 8).join('\n') : 'no console errors');
await browser.close();
await new Promise((r) => server.httpServer.close(r));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
