// All sound is synthesised: fizz, pops, the drinker's rumble and a distant market hum.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = (type, freq, q, gain) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return { f, g };
    };
    this.fizz = loop('highpass', 5200, 0.4, 0.0);
    this.murmur = loop('lowpass', 420, 0.3, 0.0);
    this.rumble = loop('lowpass', 90, 1.2, 0.0);
    this.bell();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05); }

  // outside 0..1, warning 0..1, drink 0..1
  mix(outside, warning, drink) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.fizz.g.gain.setTargetAtTime(0.035 * (1 - outside) + 0.008, t, 0.2);
    this.murmur.g.gain.setTargetAtTime(0.05 + 0.16 * outside, t, 0.3);
    this.murmur.f.frequency.setTargetAtTime(260 + 900 * outside, t, 0.3);
    this.rumble.g.gain.setTargetAtTime(0.5 * warning + 0.5 * drink, t, 0.15);
    this.rumble.f.frequency.setTargetAtTime(70 + 80 * drink, t, 0.15);
    this.outside = outside;
  }
  tone(freq, to, dur, gain, type = 'sine') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(freq, dur, gain) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  absorb(ratio, combo) { const f = 300 + 500 * (1 - ratio) + combo * 55; this.tone(f, f * 1.9, 0.13, 0.16); }
  hit() { this.burst(1800, 0.2, 0.5); this.tone(240, 70, 0.3, 0.3, 'triangle'); }
  dash() { this.burst(900, 0.25, 0.14); }
  bump() { this.tone(170, 110, 0.12, 0.2); }
  warn() { this.tone(110, 82, 0.9, 0.3, 'sawtooth'); }
  gulp() { this.tone(150, 60, 0.5, 0.45); setTimeout(() => this.tone(130, 50, 0.5, 0.4), 620); }
  free() { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this.tone(f, f * 1.01, 0.7, 0.12), i * 110)); this.burst(4000, 0.3, 0.2); }
  pop() { this.burst(2600, 0.12, 0.6); }
  fizzUp() { [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, f * 1.02, 0.25, 0.14, 'triangle'), i * 70)); this.burst(6000, 0.6, 0.25); }
  ready() { [523, 784].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.35, 0.16), i * 140)); }
  breakFoam() { this.burst(5000, 1.1, 0.5); this.burst(900, 0.5, 0.3); this.tone(180, 900, 0.9, 0.2, 'triangle'); }
  bell() {
    // far-off chimes from the market, more audible outside the glass
    const notes = [523, 659, 784, 880, 1047];
    const go = () => {
      const f = notes[(Math.random() * notes.length) | 0];
      if (this.ctx && this.ctx.state === 'running') this.tone(f, f * 0.998, 2.2, 0.012 + 0.03 * (this.outside || 0));
      setTimeout(go, 1800 + Math.random() * 4200);
    };
    go();
  }
}
