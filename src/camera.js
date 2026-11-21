// One camera, two views: inside the beer behind the bubble, and orbiting the mug from outside.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './params.js';

const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), pIn = new THREE.Vector3(), pOut = new THREE.Vector3();
const qIn = new THREE.Quaternion(), qOut = new THREE.Quaternion(), qMug = new THREE.Quaternion();
const m = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0), tgt = new THREE.Vector3();

export class Rig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0.35; this.pitchIn = 0.25; this.pitchOut = -0.15;
    this.view = 1; this.target = 1;           // 0 inside, 1 outside
    this.dist = 28; this.e = 1; this.shift = 0; this.shiftTo = 0; this.kick = 0;
    this.forward = new THREE.Vector3(0, 0, -1); this.right = new THREE.Vector3(1, 0, 0); this.flat = new THREE.Vector3(0, 0, -1);
  }
  goInside() { this.target = 0; }
  goOutside() { this.target = 1; }
  toggle() { this.target = this.target > 0.5 ? 0 : 1; }
  look(dx, dy) {
    this.yaw += dx * 0.0045;
    if (this.target > 0.5) this.pitchOut = clamp(this.pitchOut - dy * 0.0035, -1.15, 0.36);
    else this.pitchIn = clamp(this.pitchIn - dy * 0.0045, -1.35, 1.35);
  }
  zoom(d) {
    if (this.target > 0.5) {
      if (d < 0 && this.dist <= 19.5) return 'in';
      this.dist = clamp(this.dist * (1 + d * 0.12), 19, 56);
    } else if (d > 0) return 'out';
    return null;
  }

  update(dt, game, mugGroup, aspect) {
    const speed = 1 / 1.7;
    this.view = clamp(this.view + Math.sign(this.target - this.view) * dt * speed, 0, 1);
    const e = this.e = smoothstep(0, 1, this.view);
    const P = game.player, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);

    // Inside pose in mug-local space; pulled in so the camera never leaves the liquid.
    const cp = Math.cos(this.pitchIn), sp = Math.sin(this.pitchIn);
    fwd.set(sy * cp, sp, -cy * cp);
    this.forward.copy(fwd); this.right.set(cy, 0, sy); this.flat.set(sy, 0, -cy);
    const want = 0.27 + 5.2 * P.r * P.scale;
    let d = want;
    for (let k = 0; k < 14; k++) {
      d = want * (1 - k / 14);
      tmp.copy(P.pos).addScaledVector(fwd, -d);
      if (game.inside(tmp, 0.1)) break;
    }
    pIn.copy(P.pos).addScaledVector(fwd, -d);
    m.lookAt(pIn, tmp.copy(pIn).add(fwd), UP); qIn.setFromRotationMatrix(m);
    mugGroup.updateMatrixWorld();
    pIn.applyMatrix4(mugGroup.matrixWorld);
    mugGroup.getWorldQuaternion(qMug); qIn.premultiply(qMug);

    // Outside pose: orbit the mug, never dipping under the table.
    const co = Math.cos(this.pitchOut), so = Math.sin(this.pitchOut);
    const dist = this.dist * (aspect < 1 ? 1.0 + (1 - aspect) * 1.2 : 1);
    this.shift += (this.shiftTo - this.shift) * Math.min(1, dt * 3);
    tgt.set(-cy * this.shift, 7.3 + game.lift * 3.5, -game.lift * 1.2 - sy * this.shift);
    pOut.set(tgt.x - sy * co * dist, Math.max(1.2, tgt.y - so * dist), tgt.z + cy * co * dist);
    m.lookAt(pOut, tgt, UP); qOut.setFromRotationMatrix(m);

    const c = this.camera;
    c.position.lerpVectors(pIn, pOut, e);
    c.quaternion.slerpQuaternions(qIn, qOut, e);
    c.fov = lerp(76 + this.kick, 42, e); c.near = lerp(0.015, 0.5, e); c.far = 500; c.aspect = aspect;
    c.updateProjectionMatrix(); c.updateMatrixWorld();
    this.focus = pOut.distanceTo(tgt);
  }
}
