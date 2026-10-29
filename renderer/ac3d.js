// Ar-condicionado 3D do painel (aleta que se move, display com temperatura, fluxo de ar)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class AC3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(30, 2, 0.1, 50);
    this.camera.position.set(0, 0.2, 3.5);
    this.camera.lookAt(0, -0.15, 0);
    scene.add(new THREE.AmbientLight('#ffffff', 0.25));
    const key = new THREE.DirectionalLight('#ffffff', 1.4); key.position.set(-2, 3, 4); scene.add(key);

    const g = this.unit = new THREE.Group(); scene.add(g);
    const white = new THREE.MeshPhysicalMaterial({ color: '#f3f3f1', roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.66, 0.5, 8, 0.12), white); g.add(body);
    const panel = new THREE.Mesh(new RoundedBoxGeometry(2.12, 0.42, 0.04, 4, 0.02), new THREE.MeshPhysicalMaterial({ color: '#fbfbfa', roughness: 0.15, clearcoat: 1 }));
    panel.position.set(0, 0.07, 0.25); g.add(panel);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.09, 0.3), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }));
    slot.position.set(0, -0.26, 0.12); g.add(slot);
    // aleta
    const flapPivot = this.flap = new THREE.Group(); flapPivot.position.set(0, -0.22, 0.25); g.add(flapPivot);
    const flap = new THREE.Mesh(new RoundedBoxGeometry(1.98, 0.02, 0.18, 2, 0.008), white);
    flap.position.set(0, 0, 0.0); flap.geometry.translate(0, 0, -0.09); flapPivot.add(flap);
    // display
    this.dispCanvas = document.createElement('canvas'); this.dispCanvas.width = 128; this.dispCanvas.height = 64;
    this.dispTex = new THREE.CanvasTexture(this.dispCanvas);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), new THREE.MeshBasicMaterial({ map: this.dispTex, transparent: true }));
    disp.position.set(0.82, 0.09, 0.272); g.add(disp);
    // fluxo
    const N = 260; this.seeds = Float32Array.from({ length: N }, () => Math.random());
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.035, color: '#4fb3ff', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.pts);

    this.state = { on: false, target: 23, mode: 'COOL', swingV: false, display: 'ON' };
    this.flapAngle = 0; this.flowAlpha = 0;
    this.clock = new THREE.Clock();
    this.drag = null; this.yaw = -0.18;
    canvas.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, yaw: this.yaw }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.008; });
    canvas.addEventListener('pointerup', () => (this.drag = null));
    this.running = true; this._loop();
  }
  set(s) { this.state = { ...this.state, ...s }; this._drawDisplay(); }
  _drawDisplay() {
    const c = this.dispCanvas.getContext('2d'); c.clearRect(0, 0, 128, 64);
    if (!this.state.on || this.state.display === 'OFF') { this.dispTex.needsUpdate = true; return; }
    c.fillStyle = this._color().getStyle(); c.font = '600 44px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = c.fillStyle; c.shadowBlur = 12;
    c.fillText(String(Math.round(this.state.target)), 64, 34);
    this.dispTex.needsUpdate = true;
  }
  _color() { const m = this.state.mode; return new THREE.Color(m === 'HEAT' ? '#ff8a3d' : m === 'FAN' ? '#d8eeff' : m === 'AIR_DRY' ? '#7fe0c8' : '#4fb3ff'); }
  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    // enfeite pequeno: 30 quadros/s bastam (e 10 com a janela em segundo plano)
    const now = performance.now(), fps = this.drag ? 60 : document.hasFocus() ? 30 : 10;
    if (now - (this._last || 0) < 1000 / fps - 2) return; this._last = now;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return; // cartão fechado/animando: nada para desenhar
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.floor(h * this.renderer.getPixelRatio())) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    const t = this.clock.getElapsedTime(), s = this.state;
    if (!this.drag) this.yaw += (-0.18 + Math.sin(t * 0.4) * 0.12 - this.yaw) * 0.02;
    this.unit.rotation.y = this.yaw;
    this.unit.position.y = Math.sin(t * 1.2) * 0.02;
    let goal = 0;
    if (s.on) goal = s.swingV ? 0.55 + Math.sin(t * 0.9) * 0.4 : 0.7;
    this.flapAngle += (goal - this.flapAngle) * 0.05;
    this.flap.rotation.x = this.flapAngle;
    this.flowAlpha += ((s.on && s.mode !== 'OFF' ? 0.7 : 0) - this.flowAlpha) * 0.04;
    this.pts.material.opacity = this.flowAlpha; this.pts.material.color.copy(this._color());
    if (this.flowAlpha > 0.01) {
      const a = this.pts.geometry.attributes.position, n = this.seeds.length;
      const dirY = -Math.sin(this.flapAngle) * 0.9 - 0.2, dirZ = Math.cos(this.flapAngle) * 0.9;
      for (let i = 0; i < n; i++) {
        const p = (this.seeds[i] + t * 0.45) % 1, sp = this.seeds[(i * 13) % n] - 0.5;
        a.setXYZ(i, sp * (2 + p * 1.6), -0.28 + dirY * p * 1.3 + Math.sin(i + t) * 0.02 * p, 0.3 + dirZ * p * 1.6);
      }
      a.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() { this.running = false; this.renderer.dispose(); }
}
