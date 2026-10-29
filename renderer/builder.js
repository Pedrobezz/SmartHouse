// Editor de construção em 3D (estilo The Sims): ergue paredes em qualquer ângulo, desenha cômodos, divisórias,
// portas e janelas que deslizam na parede, pinta cada lado da parede e move móveis, luzes e aparelhos direto na casa 3D.
// Mantém a mesma interface do editor 2D antigo (load, snapshot, restore, select, update*...), usada pela tela Planta.
import * as THREE from 'three';
import { House3D } from './house3d.js';
import * as PM from './plan-model.js';
import { toV2, nearestWall, defaultHeight } from './geom.js';
import { byType } from './furniture.js';
import { lampType } from './lamps.js';

const uid = p => p + '-' + Math.random().toString(36).slice(2, 9);
const r2 = v => Math.round(v * 100) / 100;
export const TOOLS = ['select', 'wall', 'room', 'divider', 'door', 'window', 'paint'];
const OPEN_DEF = { door: { w: 0.8, top: 2.1 }, window: { w: 1.2, sill: 1.0, top: 2.1 } };

export class PlanBuilder {
  constructor(root, { onSelect, onChange }) {
    this.root = root; this.onSelect = onSelect; this.onChange = onChange;
    this.tool = 'select'; this.sel = null; this.multi = new Set(); this.fine = false; this.lastLink = null;
    this.layout = PM.normalize({ v: 2 }); this.placements = {}; this.devices = [];
    this.paint = { target: 'wall', finish: 'paint', color: '#e9e1d6' };
    root.classList.add('pb-root');
    this.sceneEl = Object.assign(document.createElement('div'), { className: 'pb-scene' });
    this.overlayEl = Object.assign(document.createElement('div'), { className: 'pb-overlay' });
    this.dims = Object.assign(document.createElement('div'), { className: 'pb-dims' });
    root.prepend(this.sceneEl, this.overlayEl, this.dims);

    const h = this.house = new House3D(this.sceneEl, {
      overlay: this.overlayEl,
      onDevice: id => { if (this.tool === 'select') this.select({ type: 'device', id }); },
      onRoom: (id, area) => { if (this.tool === 'select') this._selectRoom(id, area); },
      onEmpty: () => {},
    });
    h.builder = true; h.frameMargin = 1.3; // folga em volta para construir (a lateral ocupa parte da tela)
    Object.assign(h.opts, { intro: false, idle: false, weather: false, exterior: false, roof: false, wallMode: 'cut', sunBeams: false });
    h.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }; // botão direito gira em qualquer ferramenta; Shift + arrastar move a vista
    h.onFrame = () => this._frame();
    this.ghost = new THREE.Group(); h.scene.add(this.ghost);
    this.grid = new THREE.GridHelper(40, 160, '#b9a58f', '#d9cbbb');
    for (const m of [].concat(this.grid.material)) { m.transparent = true; m.opacity = 0.35; m.depthWrite = false; m.fog = false; }
    h.scene.add(this.grid);
    const st = h.setTheme.bind(h); h.setTheme = t => { st(t); this._gridTheme(t); };
    this.rc = new THREE.Raycaster();

    const cv = h.renderer.domElement;
    cv.addEventListener('pointerdown', e => this._down(e), { capture: true });
    window.addEventListener('pointermove', e => this._move(e));
    window.addEventListener('pointerup', e => this._up(e));
    cv.addEventListener('dblclick', () => { if (this.chain) this._endChain(); });
    cv.addEventListener('pointerleave', () => { if (this._pv && !this.drag) this._clearPreview(); });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); if (this.chain && !this._rDragged) this._endChain(); });
    root.addEventListener('dragover', e => e.preventDefault());
    root.addEventListener('drop', e => this._drop(e));
    window.addEventListener('keydown', e => this._key(e));
    new ResizeObserver(() => { h.resize(); h.kick(); }).observe(root);
  }

  _gridTheme(t) { // grade discreta nos dois temas
    const dark = t === 'dark', [a, b] = dark ? ['#8a7560', '#5a4a3c'] : ['#b9a58f', '#d9cbbb'];
    const m = [].concat(this.grid.material)[0], c = this.grid.geometry.attributes.color;
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    for (let i = 0; i < c.count; i++) { const isA = (Math.floor(i / 2) % 4) === 0; const col = isA ? ca : cb; c.setXYZ(i, col.r, col.g, col.b); }
    c.needsUpdate = true; m.opacity = dark ? 0.18 : 0.35; this.house.kick();
  }
  // ---------------------------------------------------------------- dados
  load(layout, placements, devices) {
    this._pv = null;
    const L = toV2(JSON.parse(JSON.stringify(layout || { v: 2 })));
    this.layout = L; this.placements = JSON.parse(JSON.stringify(placements || {})); this.devices = devices || [];
    for (const [id, p] of Object.entries(this.placements)) {
      const dev = this.devices.find(d => d.id === id);
      if (p.wall === undefined) p.wall = dev?.type === 'ac' || (nearestWall(L, p.x, p.y)?.d ?? 9) < 0.35;
      if (p.z === undefined) p.z = defaultHeight(dev);
    }
    const b = PM.bounds(L);
    this.house.fixedOff = { ox: -b.cx, oz: -b.cy };
    this.grid.position.set(-b.cx, 0.003, -b.cy);
    this.sel = null; this.chain = null; this.drag = null;
    this._rebuild(); this._frameAll(true);
  }
  _frameAll(instant) { this.house.frame(instant); this.house.kick(); }
  setDevices(devices) { this.devices = devices; this.house.updateDevices(devices); }
  _withoutPreview(fn) { const pv = this._pv; if (pv) pv.restore(); try { return fn(); } finally { if (pv) pv.apply(); } }
  snapshot() { return this._withoutPreview(() => { const { rooms, ...rest } = this.layout; return JSON.stringify({ layout: rest, placements: this.placements }); }); }
  restore(snap) { this._pv = null; const o = JSON.parse(snap); this.layout = PM.normalize(o.layout); this.placements = o.placements; this.sel = null; this.onSelect(null); this._rebuild(); }
  // a planta salva já leva os cômodos calculados (o PC, o celular e o Mini usam)
  get saveLayout() { return this._withoutPreview(() => PM.normalize(JSON.parse(JSON.stringify(this.layout)))); }

  _changed(rebuildNow) { this.layout = PM.normalize(this.layout); if (rebuildNow) this._rebuild(); else this._queue(); this.onChange(); }
  _queue() { if (this._q) return; this._q = requestAnimationFrame(() => { this._q = 0; this._rebuild(); }); }
  _rebuild() {
    cancelAnimationFrame(this._q); this._q = 0;
    this.layout = PM.normalize(this.layout);
    this.house.setLayout(this.layout, this.placements, this.devices);
    this.house.group.updateMatrixWorld(true); // peças novas já clicáveis antes do próximo quadro
    this._refreshSel(); this.house.kick();
  }

  // ---------------------------------------------------------------- câmera
  start() { this.house.start(); }
  stop() { this.house.stop(); }
  set2D(on) { this.house.set2D(on); this.view2d = on; }
  setWallMode(m) { this.house.opts.wallMode = m; this.house.kick(); }
  fit() { this._frameAll(false); }
  zoomBy(f) {
    const c = this.house.camera, t = this.house.controls.target, d = c.position.clone().sub(t);
    const len = Math.min(this.house.controls.maxDistance, Math.max(this.house.controls.minDistance * 0.6, d.length() / f));
    this.house._camGoal = { target: t.clone(), pos: t.clone().add(d.setLength(len)) }; this.house.kick();
  }
  center() { const r = this.root.getBoundingClientRect(); return this._ground({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }) || { x: 0, y: 0 }; }

  // ---------------------------------------------------------------- ferramentas
  setTool(t) {
    if (this._pv) this._clearPreview();
    this.tool = t; this.root.dataset.tool = t; this.chain = null; this._clearGhost();
    if (t !== 'select') this.select(null);
    this.house.renderer.domElement.style.cursor = t === 'select' ? '' : t === 'paint' ? 'cell' : 'crosshair';
  }
  snap(v) { const s = this.fine ? 0.05 : 0.25; return Math.round(v / s) * s; }

  _ndc(e) { const r = this.house.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  _ground(e, y = 0) {
    this.rc.setFromCamera(this._ndc(e), this.house.camera);
    const P = new THREE.Vector3();
    if (!this.rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), P)) return null;
    const { ox, oz } = this.house.off; return { x: P.x - ox, y: P.z - oz };
  }
  // o que está sob o mouse (ponteiro), do mais perto para o mais longe
  _pick(e) {
    this.rc.setFromCamera(this._ndc(e), this.house.camera);
    const vis = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
    const hh = this.rc.intersectObjects(this.ghost.children, true).filter(x => x.object.userData.handle);
    if (hh.length) return { handle: hh[0].object.userData.handle };
    for (const hit of this.rc.intersectObjects(this.house.group.children, true)) {
      const u = hit.object.userData; if (!vis(hit.object) || u.outside) continue;
      if (u.lampId) return { type: 'lamp', id: u.lampId, hit };
      if (u.furnId) return { type: 'furniture', id: u.furnId, hit };
      if (u.deviceId && this.placements[u.deviceId]) return { type: 'device', id: u.deviceId, hit };
      if (u.openingId) return { type: 'opening', id: u.openingId, hit };
      if (u.wallId) return { type: 'wall', id: u.wallId, hit };
      if (u.floorOf) return { type: 'room', id: u.floorOf, hit };
    }
    return null;
  }
  _snapPt(p, from, { skip } = {}) {
    const L = this.layout, tol = 0.22;
    // 1) pontas de paredes existentes
    let best = null, bd = tol;
    for (const w of L.walls2) for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      if (skip?.(w, x, y)) continue;
      const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = { x, y, kind: 'end' }; }
    }
    if (best) return best;
    let q = { x: this.snap(p.x), y: this.snap(p.y) };
    // 2) Shift: trava em ângulos de 45° a partir do ponto anterior
    if (from && this.shift) {
      const dx = p.x - from.x, dy = p.y - from.y, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.max(0, this.snap(Math.hypot(dx, dy) * Math.cos(Math.atan2(dy, dx) - a)));
      q = { x: r2(from.x + Math.cos(a) * len), y: r2(from.y + Math.sin(a) * len) };
    }
    // 3) encostar no meio de uma parede (junção em T)
    for (const w of L.walls2) {
      if (skip?.(w)) continue;
      const nw = segProj(q.x, q.y, w);
      if (nw.d < 0.12 && nw.t > 0.01 && nw.t < 0.99) return { x: r2(nw.x), y: r2(nw.y), kind: 'on' };
    }
    return q;
  }

  // ---------------------------------------------------------------- mouse
  _down(e) {
    this.fine = e.altKey; this.shift = e.shiftKey; this._rDragged = false;
    if (e.button === 2) { this._rDown = [e.clientX, e.clientY]; return; }
    if (e.button !== 0) return;
    const h = this.house, block = () => { h.controls.enabled = false; e.stopImmediatePropagation(); this.house.renderer.domElement.setPointerCapture?.(e.pointerId); };
    const p = this._ground(e); if (!p) return;
    const t = this.tool;
    if (t === 'wall' || t === 'divider') {
      block();
      const q = this._snapPt(p, this.chain);
      if (!this.chain) { this.chain = q; this._chainStart = q; return; }
      if (Math.hypot(q.x - this.chain.x, q.y - this.chain.y) >= 0.1) {
        this._addWall(this.chain.x, this.chain.y, q.x, q.y, t === 'divider' ? 'divider' : 'wall');
        this._changed(true);
        // fechou o contorno (voltou ao começo ou encostou numa parede): termina a sequência
        if (q.kind === 'end' || q.kind === 'on') { this._endChain(); return; }
      }
      this.chain = q; return;
    }
    if (t === 'room') { block(); const q = { x: this.snap(p.x), y: this.snap(p.y) }; this.drag = { kind: 'rect', a: q, b: q }; return; }
    if (t === 'door' || t === 'window') { block(); this._addOpening(p, t); return; }
    const hit = this._pick(e);
    if (t === 'paint') { // só "pega" o clique em parede ou piso; no resto, arrastar gira a casa
      if (hit && (hit.type === 'wall' || hit.type === 'room')) { block(); this._paintAt(hit, e.shiftKey); }
      return;
    }
    // ponto de arraste na altura do que foi clicado (janela, topo da parede...): o objeto acompanha o mouse por dentro e por fora
    const yPick = hit?.hit ? Math.max(0, hit.hit.point.y) : 0, pp = this._ground(e, yPick) || p;
    // selecionar e arrastar
    if (hit?.handle) { block(); if (hit.handle.grip) this._startWallMove(hit.handle.grip, p); else this._startEndDrag(hit.handle); return; }
    if (!hit) { this._pendingSel = { sel: null, x: e.clientX, y: e.clientY }; h.controls.enabled = true; return; } // arrastar no vazio gira a câmera
    if (hit.type === 'room') {
      // piso de um cômodo já selecionado: arrastar move o cômodo inteiro. Senão, clique seleciona e arrastar gira a câmera
      if (this.sel?.type === 'room' && this.sel.id === hit.id) { block(); this._startRoomDrag(hit.id, p); return; }
      this._pendingSel = { room: hit.id, x: e.clientX, y: e.clientY }; h.controls.enabled = true; return;
    }
    block();
    if (hit.type === 'wall') {
      // Shift + clique junta paredes na seleção (para mover várias de uma vez)
      const cur = this.sel?.type === 'walls' ? this.sel.ids : this.sel?.type === 'wall' ? [this.sel.id] : [];
      if (e.shiftKey) {
        const ids = cur.includes(hit.id) ? cur.filter(x => x !== hit.id) : [...cur, hit.id];
        this.select(ids.length > 1 ? { type: 'walls', ids } : ids.length ? { type: 'wall', id: ids[0] } : null);
        if (ids.includes(hit.id)) this._startWallDrag(ids, pp, yPick);
        return;
      }
      if (cur.length > 1 && cur.includes(hit.id)) { this._startWallDrag(cur, pp, yPick); return; }
      this.select({ type: 'wall', id: hit.id }); this._startWallMove(hit.id, pp, yPick); return;
    }
    this.select({ type: hit.type, id: hit.id });
    if (hit.type === 'opening') this.drag = { kind: 'opening', id: hit.id, y: yPick };
    else if (hit.type === 'furniture') { const f = this.layout.furniture.find(f => f.id === hit.id); this.drag = { kind: 'furn', id: hit.id, p0: pp, y: yPick, o: { x: f.x, y: f.y, rot: f.rot || 0 } }; }
    else if (hit.type === 'lamp') { const l = this.layout.lights.find(l => l.id === hit.id); this.drag = { kind: 'lamp', id: hit.id, p0: pp, y: yPick, o: { x: l.x, y: l.y } }; }
    else if (hit.type === 'device') this.drag = { kind: 'device', id: hit.id };
  }
  _move(e) {
    if (this._rDown && Math.hypot(e.clientX - this._rDown[0], e.clientY - this._rDown[1]) > 4) this._rDragged = true;
    if (!this.root.isConnected || this.root.offsetParent === null) return;
    this.fine = e.altKey; this.shift = e.shiftKey;
    const onCanvas = e.target === this.house.renderer.domElement;
    const d = this.drag;
    const p = (onCanvas || d) ? this._ground(e, d?.y || 0) : null;
    if (!d) { if (p) this._hover(e, p); return; }
    if (!p) return;
    this.house.kick();
    if (d.kind === 'rect') { d.b = { x: this.snap(p.x), y: this.snap(p.y) }; this._ghostRect(d.a, d.b); return; }
    d.moved = true;
    const L = this.layout;
    if (d.kind === 'wall') {
      const dx = this.snap(p.x - d.p0.x), dy = this.snap(p.y - d.p0.y);
      for (const m of d.moves) { m.w['x' + m.k] = m.x + dx; m.w['y' + m.k] = m.y + dy; }
      for (const it of d.items || []) { it.o.x = Math.round((it.x + dx) * 100) / 100; it.o.y = Math.round((it.y + dy) * 100) / 100; }
      if (d.seed0) { const m = L.roomMeta.find(m => m.id === d.room); if (m) m.seed = [d.seed0[0] + dx, d.seed0[1] + dy]; } // nome e piso vão junto
      this._queue(); return;
    }
    if (d.kind === 'wallpar') { // parede em paralelo, de quanto o mouse andou na direção perpendicular a ela
      const s = this.snap((p.x - d.p0.x) * d.n[0] + (p.y - d.p0.y) * d.n[1]);
      if (s !== d.s) { d.s = s; d.mv(s); this._keepOpenings(d); this._queue(); }
      return;
    }
    if (d.kind === 'end') {
      const ids = new Set(d.ends.map(e => e.wall));
      const q = this._snapPt(p, d.other, { skip: (w, x, y) => ids.has(w.id) && (x === undefined || d.ends.some(e => e.wall === w.id && Math.abs(w['x' + e.end] - x) < 1e-6 && Math.abs(w['y' + e.end] - y) < 1e-6)) });
      PM.moveEnds(L, d.ends, q.x, q.y); this._keepOpenings(d);
      this._queue(); return;
    }
    if (d.kind === 'opening') {
      const o = L.openings.find(o => o.id === d.id), nw = nearestWall(L, p.x, p.y);
      if (o && nw && nw.d < 1.2) { o.wall = nw.wall.id; o.at = Math.round(nw.at * 20) / 20; this._queue(); } // desliza pela parede ou passa para outra
      return;
    }
    if (d.kind === 'furn') {
      const f = L.furniture.find(f => f.id === d.id), x = Math.round((d.o.x + p.x - d.p0.x) * 20) / 20, y = Math.round((d.o.y + p.y - d.p0.y) * 20) / 20;
      const sn = e.altKey ? null : PM.snapToWall(L, f, x, y); // perto da parede: encosta e fica de costas para ela (Alt = livre)
      if (sn) { f.x = sn.x; f.y = sn.y; f.rot = sn.rot; } else { f.x = x; f.y = y; if (d.snapped) f.rot = d.o.rot; }
      d.snapped = !!sn; this._queue(); return;
    }
    if (d.kind === 'lamp') { const l = L.lights.find(l => l.id === d.id); this._placeLamp(l, { x: d.o.x + p.x - d.p0.x, y: d.o.y + p.y - d.p0.y }); this._queue(); return; }
    if (d.kind === 'device') { this._placeDevice(d.id, p); this._queue(); }
  }
  _up(e) {
    if (e.button === 2) { this._rDown = null; }
    this.house.controls.enabled = true;
    const ps = this._pendingSel; this._pendingSel = null;
    if (ps && Math.hypot(e.clientX - ps.x, e.clientY - ps.y) < 5) { if (ps.room) this.select({ type: 'room', id: ps.room }); else this.select(null); }
    const d = this.drag; this.drag = null; if (!d) return;
    if (d.kind === 'rect') {
      this._clearGhost();
      const x1 = Math.min(d.a.x, d.b.x), x2 = Math.max(d.a.x, d.b.x), y1 = Math.min(d.a.y, d.b.y), y2 = Math.max(d.a.y, d.b.y);
      if (x2 - x1 >= 0.5 && y2 - y1 >= 0.5) {
        for (const [a, b, c, dd] of [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]]) this._addWall(a, b, c, dd, 'wall');
        this._changed(true);
        const r = PM.areaAt(this.layout, (x1 + x2) / 2, (y1 + y2) / 2, 0);
        this.setTool('select');
        if (r) this.select({ type: 'room', id: r.id, fresh: true });
      }
      return;
    }
    if (d.moved) this._changed(true);
    if (d.room && d.moved) this.select({ type: 'room', id: d.room });
  }
  _hover(e, p) {
    const t = this.tool;
    this._clearGhost(true);
    if (t === 'wall' || t === 'divider') {
      const q = this._snapPt(p, this.chain);
      this._ghostDot(q);
      if (this.chain) this._ghostWall(this.chain, q, t === 'divider');
      this.house.kick(); return;
    }
    if (t === 'door' || t === 'window') {
      const nw = nearestWall(this.layout, p.x, p.y);
      if (nw && nw.d < 0.6) this._ghostOpening(nw, t);
      this.house.kick(); return;
    }
    if (t === 'select' || t === 'paint') {
      const hit = this._pick(e);
      if (t === 'paint') this._paintPreview(hit);
      this.house.renderer.domElement.style.cursor = t === 'paint' ? (hit?.type === 'wall' || hit?.type === 'room' ? 'cell' : 'not-allowed')
        : hit?.handle ? (hit.handle.grip ? 'move' : 'grab') : hit ? (hit.type === 'room' ? 'pointer' : 'move') : '';
    }
  }
  _key(e) {
    if (this.root.offsetParent === null || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'Escape') { if (this.chain) this._endChain(); else { this.onTool ? this.onTool('select') : this.setTool('select'); this.select(null); } return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this.deleteSelected(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'r' && this.sel?.type === 'furniture') { const f = this.layout.furniture.find(f => f.id === this.sel.id); this.updateFurniture(f.id, { rot: ((f.rot || 0) + (e.shiftKey ? -45 : 45) + 360) % 360 }); this.onSelect(this.sel); return; }
    if (k === 'r' && this.sel?.type === 'lamp') { const l = this.layout.lights.find(l => l.id === this.sel.id); this.updateLamp(l.id, { rot: ((l.rot || 0) + (e.shiftKey ? -45 : 45) + 360) % 360 }); this.onSelect(this.sel); return; }
    const t = { v: 'select', p: 'wall', c: 'room', d: 'divider', j: 'door', n: 'window', b: 'paint' }[k];
    if (t) { this.onTool ? this.onTool(t) : this.setTool(t); }
  }
  _drop(e) {
    e.preventDefault();
    const p = this._ground(e); if (!p) return;
    const lt = e.dataTransfer.getData('text/lamp'); if (lt) { this.addLamp(lt, p.x, p.y); return; }
    const ft = e.dataTransfer.getData('text/furniture'); if (ft) { this.addFurniture(ft, p.x, p.y); return; }
    const id = e.dataTransfer.getData('text/device'); if (id) this.placeDeviceAt(id, p);
  }
  _endChain() { this.chain = null; this._clearGhost(); this.house.kick(); }

  // ---------------------------------------------------------------- operações de parede
  // cria a parede só nos trechos que ainda não têm parede (desenhar um cômodo encostado no outro não duplica a parede comum)
  _addWall(x1, y1, x2, y2, kind = 'wall') {
    const len = Math.hypot(x2 - x1, y2 - y1); if (len < 0.05) return [];
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    let free = [[0, len]];
    for (const w of this.layout.walls2) {
      const d1 = Math.abs((w.x1 - x1) * uy - (w.y1 - y1) * ux), d2 = Math.abs((w.x2 - x1) * uy - (w.y2 - y1) * ux);
      if (d1 > 0.01 || d2 > 0.01) continue; // não está na mesma linha
      const a = (w.x1 - x1) * ux + (w.y1 - y1) * uy, b = (w.x2 - x1) * ux + (w.y2 - y1) * uy, lo = Math.min(a, b), hi = Math.max(a, b);
      const next = [];
      for (const [s, t] of free) { if (hi <= s || lo >= t) { next.push([s, t]); continue; } if (lo > s) next.push([s, lo]); if (hi < t) next.push([hi, t]); }
      free = next;
    }
    const out = [];
    for (const [s, t] of free) if (t - s >= 0.05) {
      const w = { id: uid('w'), x1: r2(x1 + ux * s), y1: r2(y1 + uy * s), x2: r2(x1 + ux * t), y2: r2(y1 + uy * t), kind };
      this.layout.walls2.push(w); out.push(w);
    }
    return out;
  }
  // pontas de outras paredes presas a esta (cantos e junções em T) acompanham quando ela se move
  _startWallDrag(ids, p, y = 0, items = []) {
    const set = new Set(ids), walls = this.layout.walls2.filter(w => set.has(w.id)), moves = [];
    for (const w of walls) for (const k of ['1', '2']) moves.push({ w, k, x: w['x' + k], y: w['y' + k] });
    // pontas de outras paredes presas às que se movem (cantos e junções em T) acompanham, esticando
    for (const o of this.layout.walls2) if (!set.has(o.id)) for (const k of ['1', '2']) {
      const x = o['x' + k], yy = o['y' + k];
      if (walls.some(w => segProj(x, yy, w).d < 0.012)) moves.push({ w: o, k, x, y: yy });
    }
    this.drag = { kind: 'wall', ids, p0: p, y, moves, items };
  }
  // o cômodo inteiro: as paredes em volta dele, e os móveis, luzes e aparelhos que estão dentro
  _startRoomDrag(id, p) {
    const L = this.layout, r = L.rooms.find(r => r.id === id); if (!r) return;
    // paredes que passam do canto do cômodo (ex.: parede externa comum a dois cômodos) são cortadas no canto:
    // assim só o pedaço deste cômodo se move e os vizinhos ficam no lugar
    for (const [vx, vy] of r.poly) for (const w of [...L.walls2]) {
      const q = segProj(vx, vy, w), len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (q.d < 0.012 && q.t * len > 0.05 && (1 - q.t) * len > 0.05) this._splitAt(w, q.x, q.y);
    }
    const ids = L.walls2.filter(w => { const s = PM.wallSides(L, w); return s.a?.id === id || s.b?.id === id; }).map(w => w.id);
    const inside = (x, y) => PM.pointInPoly(x, y, r.poly);
    const items = [...L.furniture.filter(f => inside(f.x, f.y)), ...L.lights.filter(l => inside(l.x, l.y)),
      ...Object.values(this.placements).filter(pl => inside(pl.x, pl.y) || (pl.wall && PM.areaAt(L, pl.x, pl.y)?.id === id))].map(o => ({ o, x: o.x, y: o.y }));
    this._startWallDrag(ids, p, 0, items);
    const m = L.roomMeta.find(m => m.id === id);
    this.drag.room = id; this.drag.seed0 = m?.seed ? [...m.seed] : null;
  }
  // bolinha: mexe só a(s) ponta(s) das paredes selecionadas (numa quina entre duas selecionadas, as duas juntas)
  _startEndDrag(handle) {
    const e0 = handle.ends[0], w = this.layout.walls2.find(w => w.id === e0.wall); if (!w) return;
    const ok = e0.end === '1' ? '2' : '1';
    this.drag = { kind: 'end', ends: handle.ends, other: { x: w['x' + ok], y: w['y' + ok] }, op0: this._openings0() };
  }
  // parede inteira em paralelo: quinas deslizam pelas paredes vizinhas, que continuam retas
  _startWallMove(id, p, y = 0) {
    const w = this.layout.walls2.find(w => w.id === id); if (!w) return;
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    this.drag = { kind: 'wallpar', id, p0: p, y, n: [-(w.y2 - w.y1) / len, (w.x2 - w.x1) / len], s: 0, mv: PM.wallMover(this.layout, id), op0: this._openings0() };
  }
  // portas e janelas ficam no mesmo lugar quando a ponta 1 da parede delas se mexe
  _openings0() { const L = this.layout; return L.openings.map(o => { const w = L.walls2.find(w => w.id === o.wall); return w && { o: o.id, at: o.at, x: w.x1, y: w.y1 }; }).filter(Boolean); }
  _keepOpenings(d) {
    const L = this.layout;
    for (const r of d.op0 || []) {
      const o = L.openings.find(o => o.id === r.o), w = o && L.walls2.find(w => w.id === o.wall); if (!w) continue;
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
      o.at = r.at - ((w.x1 - r.x) * (w.x2 - w.x1) + (w.y1 - r.y) * (w.y2 - w.y1)) / len;
    }
  }
  _addOpening(p, type) {
    const L = this.layout, nw = nearestWall(L, p.x, p.y);
    if (!nw || nw.d > 0.6) return;
    const def = OPEN_DEF[type], len = Math.hypot(nw.wall.x2 - nw.wall.x1, nw.wall.y2 - nw.wall.y1);
    const at = Math.round(nw.at * 20) / 20;
    const clash = L.openings.find(o => o.wall === nw.wall.id && Math.abs(o.at - at) < (o.w + def.w) / 2 - 0.02);
    if (clash) { this.onTool?.('select'); this.select({ type: 'opening', id: clash.id }); return; }
    if (len < 0.45) return;
    const o = { id: uid('o'), wall: nw.wall.id, at, type, ...def };
    L.openings.push(o); this._changed(true);
    this.select({ type: 'opening', id: o.id });
  }
  _paintTarget(hit) {
    const L = this.layout;
    if (this.paint.target === 'floor') return hit?.type === 'room' ? { kind: 'floor', id: hit.id } : null;
    if (hit?.type !== 'wall') return null;
    const w = L.walls2.find(w => w.id === hit.id); if (!w) return null;
    const n = hit.hit.face.normal.clone().transformDirection(hit.hit.object.matrixWorld);
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1, dot = n.x * -(w.y2 - w.y1) / len + n.z * (w.x2 - w.x1) / len;
    return Math.abs(dot) < 0.5 ? null : { kind: 'wall', id: w.id, side: dot > 0 ? 'fa' : 'fb' };
  }
  // prévia: o lado da parede (ou o piso) sob o mouse já aparece com o acabamento escolhido, sem gravar nada
  _paintPreview(hit) {
    const T = this._paintTarget(hit), P = this.paint, key = T && [T.kind, T.id, T.side, P.finish, P.color].join('|');
    if (key === this._pv?.key) return;
    this._clearPreview(true);
    if (!T) { this._rebuild(); return; }
    const L = this.layout, fin = { finish: P.finish, ...(P.color ? { color: P.color } : {}) };
    let apply, restore;
    if (T.kind === 'wall') {
      const prev = L.walls2.find(w => w.id === T.id)?.[T.side];
      apply = () => { const w = this.layout.walls2.find(w => w.id === T.id); if (w) w[T.side] = fin; };
      restore = () => { const w = this.layout.walls2.find(w => w.id === T.id); if (w) { if (prev) w[T.side] = prev; else delete w[T.side]; } };
    } else {
      const m0 = L.roomMeta.find(m => m.id === T.id), prev = { floor: m0?.floor, floorColor: m0?.floorColor };
      apply = () => { const m = this.layout.roomMeta.find(m => m.id === T.id); if (m) { m.floor = P.finish; if (P.color) m.floorColor = P.color; else delete m.floorColor; } };
      restore = () => { const m = this.layout.roomMeta.find(m => m.id === T.id); if (m) { m.floor = prev.floor; if (prev.floorColor) m.floorColor = prev.floorColor; else delete m.floorColor; } };
    }
    apply(); this._pv = { key, apply, restore }; this._rebuild();
  }
  _clearPreview(noRebuild) { if (!this._pv) return; this._pv.restore(); this._pv = null; if (!noRebuild) this._rebuild(); }
  _paintAt(hit, wholeRoom) {
    this._clearPreview(true);
    const L = this.layout, P = this.paint;
    if (P.target === 'floor') {
      if (hit.type !== 'room') return;
      const m = L.roomMeta.find(m => m.id === hit.id); if (!m) return;
      m.floor = P.finish; if (P.color) m.floorColor = P.color; else delete m.floorColor;
      this._changed(true); return;
    }
    if (hit.type !== 'wall') return;
    const w = L.walls2.find(w => w.id === hit.id); if (!w) return;
    const n = hit.hit.face.normal.clone().transformDirection(hit.hit.object.matrixWorld);
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1, ax = -(w.y2 - w.y1) / len, ay = (w.x2 - w.x1) / len;
    const dot = n.x * ax + n.z * ay; if (Math.abs(dot) < 0.5) return; // topo ou ponta da parede
    const side = dot > 0 ? 'fa' : 'fb', fin = { finish: P.finish, ...(P.color ? { color: P.color } : {}) };
    if (wholeRoom) { // Shift + clique: pinta todas as paredes do cômodo daquele lado
      const sides = PM.wallSides(L, w), room = side === 'fa' ? sides.a : sides.b;
      if (room) for (const x of L.walls2) { if (x.kind === 'divider') continue; const s = PM.wallSides(L, x); if (s.a?.id === room.id) x.fa = { ...fin }; if (s.b?.id === room.id) x.fb = { ...fin }; }
      else w[side] = fin;
    } else w[side] = fin;
    this._changed(true);
  }

  // ---------------------------------------------------------------- seleção
  _selectRoom(groupOrId, areaId) {
    const L = this.layout;
    const r = (areaId && L.rooms.find(r => r.id === areaId)) || L.rooms.find(r => r.id === groupOrId) || L.rooms.find(r => r.group === groupOrId);
    if (r) this.select({ type: 'room', id: r.id });
  }
  select(s) { this.sel = s; this.onSelect(s); this._refreshSel(); }
  _refreshSel() {
    const s = this.sel, h = this.house, objs = [];
    this._clearGhost(); this.dims.innerHTML = ''; this._dimItems = [];
    if (s) {
      const key = { wall: 'wallId', opening: 'openingId', room: 'floorOf', furniture: 'furnId', lamp: 'lampId' }[s.type];
      if (s.type === 'walls') { const set = new Set(s.ids = s.ids.filter(id => this.layout.walls2.some(w => w.id === id))); h.group.traverse(o => { if (o.isMesh && set.has(o.userData.wallId)) objs.push(o); }); }
      else if (s.type === 'device') { const v = h.devs.get(s.id); if (v) objs.push(v.g); }
      else if (key) h.group.traverse(o => { if (o.isMesh && o.userData[key] === s.id) objs.push(o); });
      if (!objs.length && s.type !== 'device' && s.type !== 'walls' && !this._exists(s)) { this.sel = null; this.onSelect(null); }
    }
    h.selObjs = objs;
    if (this.sel?.type === 'wall') {
      const w = this.layout.walls2.find(w => w.id === this.sel.id);
      if (w) { this._handles([w.id]); this._dim(w.x1, w.y1, w.x2, w.y2); }
    }
    if (this.sel?.type === 'walls') this._handles(this.sel.ids);
    if (this.sel?.type === 'opening') {
      const g = PM.openingsGeo(this.layout).find(o => o.opening.id === this.sel.id);
      if (g) this._dim(g.x1, g.y1, g.x2, g.y2);
    }
    h.kick();
  }
  _exists(s) {
    const L = this.layout;
    return s.type === 'wall' ? L.walls2.some(w => w.id === s.id) : s.type === 'opening' ? L.openings.some(o => o.id === s.id)
      : s.type === 'room' ? L.rooms.some(r => r.id === s.id) : s.type === 'furniture' ? L.furniture.some(f => f.id === s.id)
      : s.type === 'lamp' ? L.lights.some(l => l.id === s.id) : true;
  }

  // ---------------------------------------------------------------- desenhos-guia (fantasmas)
  _clearGhost(keepSel) {
    for (const c of [...this.ghost.children]) if (!keepSel || !c.userData.sel) { this.ghost.remove(c); c.geometry?.dispose(); }
    if (!keepSel) this._dimItems = [];
    this.dims.querySelectorAll('.live').forEach(x => x.remove());
    this._liveDims = [];
  }
  _scene(x, y, h = 0) { const { ox, oz } = this.house.off; return new THREE.Vector3(x + ox, h, y + oz); }
  _mat(color, op = 0.55) { return (this._mats ||= {})[color + op] ||= new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, depthTest: false }); }
  _ghostDot(q) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), this._mat(q.kind ? '#ff9f0a' : '#0a84ff', 0.9));
    m.position.copy(this._scene(q.x, q.y, 0.05)); m.renderOrder = 20; this.ghost.add(m);
  }
  _ghostWall(a, b, divider) {
    const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 0.02) return;
    const H = divider ? 0.03 : (this.house.H || 1.5) * 0.35;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, H, PM.DEF_T), this._mat(divider ? '#30d158' : '#0a84ff', 0.45));
    m.position.copy(this._scene((a.x + b.x) / 2, (a.y + b.y) / 2, H / 2)); m.rotation.y = Math.atan2(-(b.y - a.y), b.x - a.x); m.renderOrder = 19;
    this.ghost.add(m); this._liveDim(a.x, a.y, b.x, b.y);
  }
  _ghostRect(a, b) {
    this._clearGhost(true);
    const pts = [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]];
    for (let i = 0; i < 4; i++) { const p = pts[i], q = pts[(i + 1) % 4]; this._ghostWall({ x: p[0], y: p[1] }, { x: q[0], y: q[1] }); }
    this.dims.querySelectorAll('.live').forEach((x, i) => { if (i > 1) x.remove(); });
    this._liveDims = this._liveDims.slice(0, 2);
    this.house.kick();
  }
  _ghostOpening(nw, type) {
    const w = nw.wall, len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), def = OPEN_DEF[type];
    const at = Math.max(def.w / 2, Math.min(len - def.w / 2, nw.at)), ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
    const vs = this.house.vs || 0.6, y0 = type === 'window' ? def.sill * vs : 0, y1 = def.top * vs;
    const m = new THREE.Mesh(new THREE.BoxGeometry(def.w, y1 - y0, (w.t || PM.DEF_T) + 0.04), this._mat(type === 'window' ? '#64d2ff' : '#ff9f0a', 0.5));
    m.position.copy(this._scene(w.x1 + ux * at, w.y1 + uy * at, (y0 + y1) / 2)); m.rotation.y = Math.atan2(-uy, ux); m.renderOrder = 19;
    this.ghost.add(m);
  }
  _handles(ids) {
    const hy = (this.house.H || 1.5) * 0.36 + 0.12;
    for (const h of PM.endHandles(this.layout, ids)) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), this._mat('#ffffff', 0.95));
      const ring = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 12), this._mat(h.ends.length > 1 ? '#ff9f0a' : '#0a84ff', 0.6)); // laranja = quina de duas paredes
      m.position.copy(this._scene(h.x, h.y, hy)); ring.position.copy(m.position);
      m.userData = { handle: { ends: h.ends }, sel: true }; ring.userData = { sel: true }; m.renderOrder = ring.renderOrder = 21;
      this.ghost.add(ring, m);
    }
    if (ids.length === 1) { // alça do meio: arrastar move a parede inteira em paralelo
      const w = this.layout.walls2.find(w => w.id === ids[0]); if (!w) return;
      const ang = Math.atan2(-(w.y2 - w.y1), w.x2 - w.x1);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24), this._mat('#0a84ff', 0.95));
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.22), this._mat('#ffffff', 0.95)); // traço indicando a direção do movimento
      grip.position.copy(this._scene((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, hy)); bar.position.copy(grip.position); bar.position.y += 0.02; bar.rotation.y = ang;
      grip.userData = { handle: { grip: w.id }, sel: true }; bar.userData = { handle: { grip: w.id }, sel: true }; grip.renderOrder = bar.renderOrder = 21;
      this.ghost.add(grip, bar);
    }
  }
  _dim(x1, y1, x2, y2) { const el = document.createElement('div'); el.className = 'pb-dim'; this.dims.appendChild(el); (this._dimItems ||= []).push({ el, x1, y1, x2, y2 }); }
  _liveDim(x1, y1, x2, y2) { const el = document.createElement('div'); el.className = 'pb-dim live'; this.dims.appendChild(el); (this._liveDims ||= []).push({ el, x1, y1, x2, y2 }); }
  _frame() { // rótulos de medida acompanham a câmera
    const r = this.house.renderer.domElement, W = r.clientWidth, H = r.clientHeight;
    for (const d of [...(this._dimItems || []), ...(this._liveDims || [])]) {
      const v = this._scene((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2, 0.15).project(this.house.camera);
      d.el.style.transform = `translate(${(v.x + 1) / 2 * W}px, ${(1 - v.y) / 2 * H}px) translate(-50%, -50%)`;
      d.el.textContent = fmtM(Math.hypot(d.x2 - d.x1, d.y2 - d.y1));
    }
  }

  // ---------------------------------------------------------------- atualizações vindas da lateral
  updateWall(id, patch) {
    const w = this.layout.walls2.find(w => w.id === id); if (!w) return;
    if (patch.len != null) { // muda o comprimento mantendo a ponta 1 (as pontas presas à ponta 2 acompanham)
      const L0 = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1, nx = r2(w.x1 + (w.x2 - w.x1) / L0 * patch.len), ny = r2(w.y1 + (w.y2 - w.y1) / L0 * patch.len);
      for (const o of this.layout.walls2) if (o !== w) for (const k of ['1', '2']) if (Math.hypot(o['x' + k] - w.x2, o['y' + k] - w.y2) < 0.012) { o['x' + k] = nx; o['y' + k] = ny; }
      w.x2 = nx; w.y2 = ny; delete patch.len;
    }
    for (const [k, v] of Object.entries(patch)) if (v === null) delete w[k]; else w[k] = v;
    this._changed(true);
  }
  _splitAt(w, x, y) { // corta a parede em dois pedaços no ponto (x, y); as aberturas ficam no pedaço certo
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), cut = Math.hypot(x - w.x1, y - w.y1);
    const n = { ...JSON.parse(JSON.stringify(w)), id: uid('w'), x1: r2(x), y1: r2(y) };
    w.x2 = r2(x); w.y2 = r2(y); this.layout.walls2.push(n);
    for (const o of this.layout.openings) if (o.wall === w.id && o.at > cut) { o.wall = n.id; o.at -= cut; }
    return n;
  }
  // divide a parede ao meio (cada metade pode ter acabamento, altura e espessura próprios)
  splitWall(id) {
    const w = this.layout.walls2.find(w => w.id === id); if (!w) return;
    const mx = r2((w.x1 + w.x2) / 2), my = r2((w.y1 + w.y2) / 2), len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const n = { ...JSON.parse(JSON.stringify(w)), id: uid('w'), x1: mx, y1: my };
    w.x2 = mx; w.y2 = my; this.layout.walls2.push(n);
    for (const o of this.layout.openings) if (o.wall === w.id && o.at > len / 2) { o.wall = n.id; o.at -= len / 2; }
    this._changed(true); this.select({ type: 'wall', id: w.id });
  }
  updateWalls(ids, patch) { for (const w of this.layout.walls2) if (ids.includes(w.id)) Object.assign(w, patch); this._changed(true); }
  updateOpening(id, patch) { const o = this.layout.openings.find(o => o.id === id); if (!o) return; for (const [k, v] of Object.entries(patch)) if (v === null) delete o[k]; else o[k] = v; this._changed(true); }
  updateRoom(id, patch) { const m = this.layout.roomMeta.find(m => m.id === id); if (!m) return; for (const [k, v] of Object.entries(patch)) if (v === null) delete m[k]; else m[k] = v; this._changed(true); }
  renameGroup(gid, name) { this.layout.groups[gid] = { ...(this.layout.groups[gid] || {}), name }; this._changed(true); }
  paintRoom(id, fin) { // todas as paredes internas do cômodo
    const L = this.layout;
    for (const x of L.walls2) { if (x.kind === 'divider') continue; const s = PM.wallSides(L, x); if (s.a?.id === id) x.fa = { ...fin }; if (s.b?.id === id) x.fb = { ...fin }; }
    this._changed(true);
  }
  roomWalls(id) { const L = this.layout; return L.walls2.filter(x => x.kind !== 'divider' && (s => s.a?.id === id || s.b?.id === id)(PM.wallSides(L, x))); }
  setNorth(deg) { this.layout.north = deg; this._changed(); }
  setWallHeight(h) { this.layout.wallHeight = h; this._changed(); }
  clearAll() { this.layout = PM.normalize({ v: 2, wallHeight: this.layout.wallHeight, north: this.layout.north }); this.placements = {}; this.select(null); this._changed(true); }

  // ---------------------------------------------------------------- móveis, luzes e aparelhos (como no editor antigo)
  placeDeviceAt(id, p) { this._placeDevice(id, p); this.select({ type: 'device', id }); this._changed(true); }
  _placeDevice(id, p) {
    const dev = this.devices.find(d => d.id === id), prev = this.placements[id] || {};
    let x = Math.round(p.x * 20) / 20, y = Math.round(p.y * 20) / 20, wall = false;
    const nw = this.layout.walls2.length ? nearestWall(this.layout, p.x, p.y) : null, isAC = dev?.type === 'ac';
    if (nw && (isAC ? nw.d < 1.2 : nw.d < 0.35 && prev.wall !== false)) { x = nw.px + nw.nx * 0.08; y = nw.py + nw.ny * 0.08; wall = true; }
    this.placements[id] = { ...prev, x: r2(x), y: r2(y), wall, z: prev.z ?? defaultHeight(dev) };
  }
  updatePlacement(id, patch) { const p = this.placements[id]; if (!p) return; Object.assign(p, patch); if (patch.wall === true) this._placeDevice(id, p); this._changed(true); }
  unplace(id) { delete this.placements[id]; if (this.sel?.id === id) this.select(null); this._changed(true); }
  addFurniture(type, x, y) {
    const c = byType(type); if (!c) return;
    const f = { id: uid('f'), type, x: Math.round(x * 20) / 20, y: Math.round(y * 20) / 20, w: c.w, d: c.d, rot: 0, color: c.color };
    this.layout.furniture.push(f); this._changed(true); this.select({ type: 'furniture', id: f.id });
  }
  updateFurniture(id, patch) { Object.assign(this.layout.furniture.find(f => f.id === id), patch); this._changed(true); }
  duplicateFurniture(id) { const f = this.layout.furniture.find(f => f.id === id); if (!f) return; const n = { ...f, id: uid('f'), x: f.x + 0.3, y: f.y + 0.3 }; this.layout.furniture.push(n); this._changed(true); this.select({ type: 'furniture', id: n.id }); }
  _placeLamp(l, p) {
    let x = Math.round(p.x * 20) / 20, y = Math.round(p.y * 20) / 20;
    if (lampType(l.type).mount === 'wall' && this.layout.walls2.length) { const nw = nearestWall(this.layout, p.x, p.y); if (nw && nw.d < 0.8) { x = r2(nw.px + nw.nx * 0.06); y = r2(nw.py + nw.ny * 0.06); } }
    l.x = x; l.y = y;
  }
  addLamp(type, x, y, extra = {}) {
    const t = lampType(type);
    const l = { id: uid('l'), type, x: 0, y: 0, temp: 'quente', ...(t.w ? { w: t.w } : {}), ...(t.mount === 'table' ? { z: type === 'mesa' ? 0.75 : 0.55 } : {}), link: this.lastLink ? { ...this.lastLink } : null, ...extra };
    this._placeLamp(l, { x, y }); this.layout.lights.push(l); this._changed(true); this.select({ type: 'lamp', id: l.id });
    return l;
  }
  updateLamp(id, patch) {
    const l = this.layout.lights.find(l => l.id === id); if (!l) return;
    Object.assign(l, patch); if (patch.link !== undefined) this.lastLink = patch.link; if (patch.type) this._placeLamp(l, l);
    this._changed(true);
  }
  duplicateLamp(id) { const l = this.layout.lights.find(l => l.id === id); if (!l) return; const n = { ...JSON.parse(JSON.stringify(l)), id: uid('l'), x: l.x + 0.5, y: l.y }; this._placeLamp(n, n); this.layout.lights.push(n); this._changed(true); this.select({ type: 'lamp', id: n.id }); }
  deleteSelected() {
    const s = this.sel, L = this.layout; if (!s) return;
    if (s.type === 'wall' || s.type === 'walls') { const ids = new Set(s.ids || [s.id]); L.walls2 = L.walls2.filter(w => !ids.has(w.id)); L.openings = L.openings.filter(o => !ids.has(o.wall)); }
    else if (s.type === 'opening') L.openings = L.openings.filter(o => o.id !== s.id);
    else if (s.type === 'room') { const ws = this.roomWalls(s.id).filter(w => { const x = PM.wallSides(L, w); return !(x.a && x.b); }); const ids = new Set(ws.map(w => w.id)); L.walls2 = L.walls2.filter(w => !ids.has(w.id)); L.openings = L.openings.filter(o => !ids.has(o.wall)); }
    else if (s.type === 'furniture') L.furniture = L.furniture.filter(f => f.id !== s.id);
    else if (s.type === 'lamp') L.lights = L.lights.filter(l => l.id !== s.id);
    else if (s.type === 'device') delete this.placements[s.id];
    this.select(null); this._changed(true);
  }
}

function segProj(px, py, w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / L2)), x = w.x1 + dx * t, y = w.y1 + dy * t;
  return { d: Math.hypot(px - x, py - y), t, x, y };
}
function fmtM(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' m'; }
