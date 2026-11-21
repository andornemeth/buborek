// DOM overlay: score, gauges, warnings, story cards, touch controls.
import { L0, YB } from './params.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('hu-HU');

const STORY = [
  '',
  'A második korsó zavarosabb, és a Nagy Ivó is belejött.',
  'Harmadik kör. Odalent már alig látni az élesztőtől.',
  'A negyedik korsónál a komló is megsűrűsödik. Tartsd nyitva a szemed.',
  'Az ötödik. A vásár már zár, de a Nagy Ivó még nem.',
];
const DEATH = {
  pop: ['Kipukkadtál', 'Egy komlószilánk túl éles volt hozzád.'],
  swallowed: ['Megittak', 'A Nagy Ivó egyetlen korttyal elnyelt. Egészségére.'],
  empty: ['Elfogyott a sör', 'Az utolsó korttyal te is lecsúsztál. Nem nőttél elég nagyra időben.'],
};

export class Hud {
  constructor(input) {
    this.input = input;
    this.el = { hud: $('hud'), score: $('score'), combo: $('combo'), mugNo: $('mugNo'), beer: $('beerBar'), size: $('sizeBar'),
      gauge: $('sizeBar').parentElement, tick: $('gateTick'), warn: $('warn'), danger: $('danger'), toast: $('toast'),
      stick: $('stick'), knob: $('stick').firstElementChild, dash: $('btnDash'), dive: $('btnDive'), goal: $('goal'), view: $('btnView'), sound: $('btnSound'),
      card: $('card'), inner: $('cardInner') };
    this.toastT = 0; this.shown = {};
    this.el.dash.addEventListener('pointerdown', (e) => { e.preventDefault(); input.dash = true; });
    this.el.view.addEventListener('click', () => { input.toggle = true; this.el.view.blur(); });
    const dive = this.el.dive, hold = (on) => { input.diveHeld = on; dive.classList.toggle('on', on); };
    dive.addEventListener('pointerdown', (e) => { e.preventDefault(); dive.setPointerCapture(e.pointerId); hold(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) dive.addEventListener(ev, () => hold(false));
    this.touchUi = matchMedia('(pointer: coarse)').matches;
  }

  card(html, onGo) {
    this.el.inner.innerHTML = html;
    this.el.card.classList.remove('off');
    const b = this.el.inner.querySelector('button.go');
    if (b) { b.addEventListener('click', () => { this.el.card.classList.add('off'); onGo(); }, { once: true }); b.focus({ preventScroll: true }); }
  }
  title(best, onGo) {
    const touch = matchMedia('(pointer: coarse)').matches;
    this.card(`
      <h1>Buborék</h1><h2>Út a habkoronáig</h2>
      <p>Egy karcolásból születtél a korsó alján. A buborékok legendája szerint aki elég nagyra nő, áttöri a habkoronát, és szabad levegőként száll fel a vásár fényei fölé.</p>
      <p>Csakhogy a sör tengere fogy: <b>a Nagy Ivó szomjas.</b></p>
      <ul>${touch ? `
        <li><b>Bal hüvelykujj</b><span>úszás oldalra, előre, hátra</span></li>
        <li><b>Merülés gomb</b><span>lefelé, amíg nyomva tartod</span></li>
        <li><b>Húzás jobb oldalt</b><span>körbenézés</span></li>
        <li><b>Lendület gomb</b><span>gyors kitörés</span></li>` : `
        <li><b>W A S D</b><span>úszás oldalra, előre, hátra</span></li>
        <li><b>Shift</b><span>merülés lefelé, amíg nyomod</span></li>
        <li><b>Egérhúzás</b><span>körbenézés</span></li>
        <li><b>Szóköz · Tab</b><span>lendület · a korsó kívülről</span></li>`}
      </ul>
      <p class="dim"><b>A buborék magától száll felfelé.</b> 1. Ússz neki a zölden csillogó, kisebb buborékoknak: megnősz tőlük. 2. Kerüld a komlószilánkot. 3. Ha megtelt a Méret, hagyd felszállni a habig.</p>
      ${best ? `<p class="dim">Rekordod: <b>${fmt(best)}</b></p>` : ''}
      <button class="go">Felszállás</button>`, onGo);
  }
  escaped(game, bonus, onGo) {
    this.card(`
      <h1>Szabad vagy!</h1><h2>Áttörted a habkoronát</h2>
      <p>Felszálltál a vásár fényei közé. A pultnál viszont már csapolják a következőt…</p>
      <div class="stats"><div><b>${fmt(game.score)}</b>pont</div><div><b>+${fmt(bonus)}</b>szabadulás</div><div><b>${game.mug}.</b>korsó</div></div>
      <p class="dim">${STORY[Math.min(game.mug, STORY.length - 1)]}</p>
      <button class="go">Noch eins!</button>`, onGo);
  }
  over(game, onGo) {
    const [h, t] = DEATH[game.deathCause] || DEATH.pop;
    const rec = game.score > 0 && game.score >= game.best;
    this.card(`
      <h1>${h}</h1><h2>${t}</h2>
      <div class="stats"><div><b>${fmt(game.score)}</b>pont</div><div><b>${fmt(game.best)}</b>rekord</div><div><b>${game.mug}.</b>korsó</div></div>
      ${rec ? '<p>Új rekord. Prost!</p>' : ''}
      <button class="go">Újra</button>`, onGo);
  }

  toast(html, secs = 2.6) { this.el.toast.innerHTML = html; this.el.toast.classList.add('on'); this.toastT = secs; }

  update(dt, game, rig, playing, mouthScreen) {
    const e = this.el;
    e.hud.hidden = !playing;
    if (!playing) return;
    const set = (k, v, f) => { if (this.shown[k] !== v) { this.shown[k] = v; f(v); } };
    set('score', game.score, (v) => { e.score.textContent = fmt(v); });
    set('combo', game.combo, (v) => { e.combo.textContent = v > 1 ? `×${v} sorozat` : ''; });
    set('mug', game.mug, (v) => { e.mugNo.textContent = `${v}. korsó`; });
    e.beer.style.transform = `scaleX(${Math.max(0, (game.level - YB) / (L0 - YB)).toFixed(3)})`;
    const max = game.gate * 1.25, P = game.player;
    e.size.style.transform = `scaleY(${Math.min(1, P.r / max).toFixed(3)})`;
    set('gate', game.gate, () => { e.tick.style.bottom = `${(game.gate / max) * 100}%`; });
    set('ready', P.r >= game.gate, (v) => { e.gauge.classList.toggle('ready', v); $('sizeHint').textContent = v ? 'irány a hab!' : 'a habhoz kell'; });
    set('warn', game.warning > 0 && game.state === 'play', (v) => { e.warn.hidden = !v; });
    set('final', game.sip.done >= game.nSips, (v) => { e.warn.textContent = v ? 'UTOLSÓ KORTY!' : 'KORTY JÖN!'; });
    set('view', rig.target > 0.5, (v) => { e.view.textContent = v ? 'Belülről' : 'Kívülről'; });
    set('dashcd', P.dashCd > 0, (v) => { e.dash.classList.toggle('cd', v); });

    // one line that always says what to do next
    const pct = Math.round(100 * Math.max(0, Math.min(1, (P.r - 0.085) / (game.gate - 0.085))));
    const sipNow = game.warning > 0 && game.state === 'play';
    const goalKey = sipNow ? 'sip' : game.state !== 'play' ? 'none' : P.r >= game.gate ? 'ready' : !game.moved ? 'move' : game.eaten < 3 ? 'eat' : 'grow' + pct;
    set('goal', goalKey, (k) => {
      const t = this.touchUi;
      e.goal.hidden = k === 'none';
      e.goal.className = k === 'sip' ? 'alarm' : k === 'ready' ? 'ready' : '';
      e.goal.innerHTML = k === 'sip' ? `Korty! Merülj le, és maradj távol a piros nyíltól (${t ? 'Merülés gomb' : 'Shift'}).`
        : k === 'ready' ? 'Elég nagy vagy! Engedd el, és szállj fel a habig ↑'
        : k === 'move' ? (t ? 'Húzd a <b>bal hüvelykujjad</b> a képernyőn: így úszol.' : 'Ússz a <b>W A S D</b> gombokkal, nézz körbe egérhúzással.')
        : k === 'eat' ? `Ússz neki a <span class="g">zölden csillogó</span> kisebb buborékoknak (${game.eaten}/3). Lefelé: ${t ? '<b>Merülés</b> gomb' : '<b>Shift</b>'}.`
        : `Nőj tovább a <span class="g">zöld</span> buborékokkal: <b>${pct}%</b> a habhoz.`;
    });

    // arrow that points at the drinker's mouth while a sip threatens
    const showD = game.warning > 0 && game.state === 'play' && mouthScreen;
    set('danger', !!showD, (v) => { e.danger.hidden = !v; });
    if (showD) {
      const w = innerWidth, h = innerHeight, m = 46;
      let { x, y, behind } = mouthScreen;
      let dx = x - w / 2, dy = y - h / 2;
      if (behind) { dx = -dx; dy = -dy; }
      const off = behind || x < m || x > w - m || y < m || y > h - m;
      if (off) { const s = Math.min((w / 2 - m) / Math.abs(dx || 1), (h / 2 - m) / Math.abs(dy || 1)); x = w / 2 + dx * s; y = h / 2 + dy * s; }
      const ang = off ? Math.atan2(dy, dx) + Math.PI / 2 : 0;
      e.danger.style.transform = `translate(${x - 20}px, ${y - 20}px) rotate(${ang}rad)`;
    }

    const st = this.input.stick;
    set('touch', this.input.touch || this.touchUi, (v) => { e.dash.hidden = !v; e.dive.hidden = !v; });
    set('stick', st.active, (v) => { e.stick.hidden = !v; });
    if (st.active) {
      e.stick.style.left = `${st.ox}px`; e.stick.style.top = `${st.oy}px`;
      e.knob.style.transform = `translate(${st.x * 40}px, ${st.y * 40}px)`;
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.classList.remove('on'); }
  }
}
