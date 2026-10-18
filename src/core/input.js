import * as THREE from 'three';
import { clamp } from './utils.js';

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.handlers = new Set();
    this.mdx = 0; this.mdy = 0;
    this.dragging = false;
    this.locked = false;
    this.active = false; // 游戏中才允许锁定

    addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const h of this.handlers) h(e.code, e);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('mousedown', e => {
      if (!this.active) return;
      this.dragging = true;
      if (!this.locked && dom.requestPointerLock) {
        try { const p = dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* 不支持就用拖动 */ }
      }
    });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', e => {
      if (this.locked || this.dragging) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      const hint = document.getElementById('lockhint');
      if (hint) hint.style.display = this.locked ? 'none' : '';
    });
  }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  down(code) { return this.keys.has(code); }
  consumeMouse() { const r = { x: this.mdx, y: this.mdy }; this.mdx = 0; this.mdy = 0; return r; }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
}

/* 第一人称：WASD + 鼠标；可被过场动画接管 */
export class FirstPerson {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.eye = 1.7;
    this.eyeOffset = 0;   // 脱水时下沉
    this.speed = 4.2;
    this.runSpeed = 9;
    this.enabled = false; // 可移动
    this.look = false;    // 可转视角
    this.bob = 0;
    this.groundFn = () => 0;
    this.boundFn = null;
    this._y = null;
  }
  setPose(pos, yaw = 0, pitch = 0) { this.pos.copy(pos); this.yaw = yaw; this.pitch = pitch; this._y = null; }
  lookAt(target) {
    const cam = this.camera.position;
    const dx = target.x - cam.x, dy = target.y - cam.y, dz = target.z - cam.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  syncFromCamera() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y; this.pitch = e.x;
    this.pos.set(this.camera.position.x, this.camera.position.y - this.eye, this.camera.position.z);
    this._y = this.pos.y;
  }
  update(dt) {
    const inp = this.input;
    const m = inp.consumeMouse();
    if (this.look) {
      this.yaw -= m.x * 0.0022;
      this.pitch = clamp(this.pitch - m.y * 0.0022, -1.45, 1.45);
    }
    let moving = false;
    if (this.enabled) {
      const f = (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0);
      const s = (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0);
      if (f || s) {
        moving = true;
        const sp = (inp.down('ShiftLeft') || inp.down('ShiftRight')) ? this.runSpeed : this.speed;
        const len = Math.hypot(f, s);
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        this.pos.x += ((-sy * f) + (cy * s)) / len * sp * dt;
        this.pos.z += ((-cy * f) + (-sy * s)) / len * sp * dt;
        this.bob += dt * sp * 1.6;
      }
      if (this.boundFn) this.boundFn(this.pos);
    }
    const gy = this.groundFn(this.pos.x, this.pos.z);
    this._y = this._y === null ? gy : this._y + (gy - this._y) * Math.min(1, dt * 10);
    this.pos.y = this._y;
    const bobY = moving ? Math.sin(this.bob) * 0.045 : 0;
    this.camera.position.set(this.pos.x, this.pos.y + this.eye + this.eyeOffset + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
}
