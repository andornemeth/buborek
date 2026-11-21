// Keyboard, mouse and touch. Left side of a touch screen is a floating joystick, the rest drags the camera.
export class Input {
  constructor(el) {
    this.keys = new Set();
    this.stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
    this.dash = false; this.toggle = false; this.diveHeld = false;
    this.look = new Map(); this.pinch = 0;
    this.touch = false;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.dash = true;
      if (e.code === 'Tab' || e.code === 'KeyV') this.toggle = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom += Math.sign(e.deltaY); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') {
        this.touch = true;
        if (!this.stick.active && e.clientX < innerWidth * 0.45) {
          Object.assign(this.stick, { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
          return;
        }
      }
      this.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinch = 0;
    });
    el.addEventListener('pointermove', (e) => {
      if (this.stick.active && e.pointerId === this.stick.id) {
        const R = 56;
        let dx = (e.clientX - this.stick.ox) / R, dy = (e.clientY - this.stick.oy) / R;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        this.stick.x = dx; this.stick.y = dy; return;
      }
      const p = this.look.get(e.pointerId);
      if (!p) return;
      if (this.look.size >= 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...this.look.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch > 0 && Math.abs(d - this.pinch) > 28) { this.zoom += d < this.pinch ? 1 : -1; this.pinch = d; }
        if (this.pinch === 0) this.pinch = d;
        return;
      }
      this.lookDX += e.clientX - p.x; this.lookDY += e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
    });
    const end = (e) => {
      if (this.stick.active && e.pointerId === this.stick.id) { this.stick.active = false; this.stick.x = this.stick.y = 0; }
      this.look.delete(e.pointerId); this.pinch = 0;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  // x: right, y: forward, v: up
  axes() {
    const k = this.keys;
    let x = this.stick.x, y = -this.stick.y, v = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyE')) v += 1;
    if (k.has('KeyQ') || k.has('ShiftLeft') || k.has('ShiftRight') || this.diveHeld) v -= 1;
    return { x, y, v };
  }
  consume() {
    const r = { dx: this.lookDX, dy: this.lookDY, zoom: this.zoom, dash: this.dash, toggle: this.toggle };
    this.lookDX = this.lookDY = this.zoom = 0; this.dash = this.toggle = false;
    return r;
  }
}
