// Área externa (grama, calçada, muro, árvores), telhado e raios de sol pelas janelas
import * as THREE from 'three';

// gerador pseudoaleatório com semente (a casa fica sempre igual entre aberturas)
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]); return t;
}
const grassTex = () => canvasTex(256, (g, S) => {
  g.fillStyle = '#4c7a3a'; g.fillRect(0, 0, S, S);
  const r = rng(7);
  for (let i = 0; i < 2600; i++) { const v = 0.75 + r() * 0.5; g.fillStyle = `rgb(${Math.round(76 * v)},${Math.round(122 * v)},${Math.round(58 * v)})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 2 + r() * 4); }
});
const pavingTex = () => canvasTex(256, (g, S) => {
  g.fillStyle = '#b9b5ad'; g.fillRect(0, 0, S, S);
  const r = rng(3);
  for (let i = 0; i < 1500; i++) { const v = 0.85 + r() * 0.25; g.fillStyle = `rgba(${Math.round(185 * v)},${Math.round(181 * v)},${Math.round(173 * v)},.8)`; g.fillRect(r() * S, r() * S, 2, 2); }
  g.strokeStyle = 'rgba(90,86,80,.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * S / 4); g.lineTo(S, i * S / 4); g.stroke(); g.beginPath(); g.moveTo(i * S / 4, 0); g.lineTo(i * S / 4, S); g.stroke(); }
});
const tileTex = () => canvasTex(256, (g, S) => {
  g.fillStyle = '#9c4a2e'; g.fillRect(0, 0, S, S);
  const rows = 8, r = rng(11);
  for (let y = 0; y < rows; y++) for (let x = 0; x < 6; x++) {
    const v = 0.85 + r() * 0.3, ox = (y % 2) * S / 12;
    const gr = g.createLinearGradient(0, y * S / rows, 0, (y + 1) * S / rows);
    gr.addColorStop(0, `rgb(${Math.round(176 * v)},${Math.round(86 * v)},${Math.round(56 * v)})`); gr.addColorStop(1, `rgb(${Math.round(120 * v)},${Math.round(56 * v)},${Math.round(38 * v)})`);
    g.fillStyle = gr; g.fillRect(x * S / 6 + ox + 1, y * S / rows + 1, S / 6 - 2, S / rows - 2);
  }
});

// ---------------- área externa ----------------
export function buildExterior(b, vs, seed = 1) {
  const group = new THREE.Group(), trees = [];
  const M = 4.6, lotW = b.w + M * 2, lotD = b.h + M * 2;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(lotW, lotD), new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1 }));
  grass.material.map.repeat.set(lotW / 2.5, lotD / 2.5);
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.006; grass.receiveShadow = true; group.add(grass);
  // calçada em volta da casa + caminho até o portão
  const pave = new THREE.MeshStandardMaterial({ map: pavingTex(), roughness: 0.85 });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 2.2, b.h + 2.2), pave.clone());
  ring.material.map = pave.map.clone(); ring.material.map.needsUpdate = true; ring.material.map.repeat.set((b.w + 2.2) / 1.6, (b.h + 2.2) / 1.6);
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.004; ring.receiveShadow = true; group.add(ring);
  const pathLen = M - 1.1, path = new THREE.Mesh(new THREE.PlaneGeometry(1.3, pathLen), pave.clone());
  path.material.map = pave.map.clone(); path.material.map.needsUpdate = true; path.material.map.repeat.set(1.3 / 1.6, pathLen / 1.6);
  path.rotation.x = -Math.PI / 2; path.position.set(0, -0.0045, b.h / 2 + 1.1 + pathLen / 2); path.receiveShadow = true; group.add(path);
  // muro com portão na frente
  const wallH = 1.7 * vs, wallMat = new THREE.MeshStandardMaterial({ color: '#d8d3ca', roughness: 0.9 }), capMat = new THREE.MeshStandardMaterial({ color: '#8d877d', roughness: 0.7 });
  const seg = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.05) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, 0.14), wallMat); m.position.set((x1 + x2) / 2, wallH / 2, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1); m.castShadow = true; m.receiveShadow = true; group.add(m);
    const c = new THREE.Mesh(new THREE.BoxGeometry(len + 0.04, 0.03, 0.2), capMat); c.position.set(m.position.x, wallH + 0.015, m.position.z); c.rotation.y = m.rotation.y; group.add(c);
  };
  const X = lotW / 2, Z = lotD / 2, gate = 0.8;
  seg(-X, -Z, X, -Z); seg(-X, -Z, -X, Z); seg(X, -Z, X, Z); seg(-X, Z, -gate, Z); seg(gate, Z, X, Z);
  const gateMat = new THREE.MeshStandardMaterial({ color: '#2f2f31', roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i < 9; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, wallH * 0.9, 0.02), gateMat); bar.position.set(-gate + 0.1 + i * (gate * 2 - 0.2) / 8, wallH * 0.45, Z); group.add(bar); }
  // árvores e arbustos
  const r = rng(seed * 9301 + Math.round(b.w * 100 + b.h));
  const greens = ['#3f6d32', '#4f7d3a', '#5b8a41', '#36602d'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.9 });
  const spots = [], inner = { x: b.w / 2 + 1.5, z: b.h / 2 + 1.5 }, outer = { x: X - 0.9, z: Z - 0.9 };
  for (let i = 0; i < 120 && spots.length < 11; i++) {
    const x = (r() * 2 - 1) * outer.x, z = (r() * 2 - 1) * outer.z;
    if (Math.abs(x) < inner.x && Math.abs(z) < inner.z) continue;
    if (Math.abs(x) < 1.4 && z > 0) continue; // caminho do portão
    if (spots.some(p => Math.hypot(p[0] - x, p[1] - z) < 2.2)) continue;
    spots.push([x, z]);
  }
  for (const [x, z] of spots) {
    const t = new THREE.Group(), h = (3.2 + r() * 2.4) * vs * 1.15, s = 0.75 + r() * 0.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.1 * s, h * 0.55, 8), trunkMat); trunk.position.y = h * 0.275; trunk.castShadow = true; t.add(trunk);
    const crown = new THREE.Group(); crown.position.y = h * 0.55; t.add(crown);
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry((0.55 + r() * 0.35) * s, 1), greens[Math.floor(r() * greens.length)]);
      blob.position.set((r() - 0.5) * 0.7 * s, (0.25 + r() * 0.55) * s + h * 0.12, (r() - 0.5) * 0.7 * s); blob.castShadow = true; blob.receiveShadow = true; crown.add(blob);
    }
    t.position.set(x, 0, z); t.rotation.y = r() * Math.PI * 2; group.add(t);
    trees.push({ crown, phase: r() * 10, amp: 0.6 + r() * 0.6 });
  }
  // arbustos encostados no muro
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(r() * 4), u = r() * 2 - 1;
    const [x, z] = side === 0 ? [u * (X - 0.4), -Z + 0.35] : side === 1 ? [-X + 0.35, u * (Z - 0.4)] : side === 2 ? [X - 0.35, u * (Z - 0.4)] : [u * (X - 0.4), Z - 0.35];
    if (side === 3 && Math.abs(x) < 1.4) continue;
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + r() * 0.18, 1), greens[Math.floor(r() * greens.length)]);
    bush.position.set(x, 0.15, z); bush.scale.y = 0.75; bush.castShadow = true; group.add(bush);
  }
  group.traverse(o => { o.raycast = () => {}; }); // não atrapalha o clique na casa
  return {
    group, lot: { w: lotW, d: lotD },
    update(t, wind = 0.3) { // copas balançam com o vento real
      const w = Math.min(1.5, 0.15 + wind);
      for (const tr of trees) { tr.crown.rotation.z = Math.sin(t * (0.9 + w) + tr.phase) * 0.035 * w * tr.amp; tr.crown.rotation.x = Math.sin(t * (0.7 + w) * 1.3 + tr.phase) * 0.025 * w * tr.amp; }
    },
  };
}

// ---------------- telhado (um telhado de quatro águas por parte de cômodo) ----------------
export function buildRoof(rects, ox, oz, H) {
  const group = new THREE.Group();
  const tex = tileTex();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 1, flatShading: true });
  const eave = new THREE.MeshStandardMaterial({ color: '#efece6', roughness: 0.6, transparent: true, opacity: 1 });
  for (const r of rects) {
    const o = 0.28, W = r.w + o * 2, D = r.h + o * 2, cx = r.x + r.w / 2 + ox, cz = r.y + r.h / 2 + oz;
    const rh = Math.min(W, D) * 0.24, y0 = H + 0.025;
    const along = W >= D, half = Math.abs(W - D) / 2;
    const A = [-W / 2, y0, -D / 2], B = [W / 2, y0, -D / 2], C = [W / 2, y0, D / 2], Dd = [-W / 2, y0, D / 2];
    const r1 = along ? [-half, y0 + rh, 0] : [0, y0 + rh, -half], r2 = along ? [half, y0 + rh, 0] : [0, y0 + rh, half];
    const tris = along
      ? [[A, B, r2], [A, r2, r1], [C, Dd, r1], [C, r1, r2], [B, C, r2], [Dd, A, r1]]
      : [[B, C, r2], [B, r2, r1], [Dd, A, r1], [Dd, r1, r2], [A, B, r1], [C, Dd, r2]];
    const pos = [], uv = [];
    for (const t of tris) for (const p of t) { pos.push(p[0], p[1], p[2]); uv.push((along ? p[0] : p[2]) * 1.1, Math.abs(along ? p[2] : p[0]) * 1.6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.position.set(cx, 0, cz); m.castShadow = true; m.receiveShadow = true; group.add(m);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), eave); fascia.position.set(cx, y0 - 0.02, cz); group.add(fascia);
  }
  group.traverse(x => { x.userData.roof = true; });
  return { group, mats: [mat, eave] };
}

// teto branco por cômodo (aparece só no passeio pela casa)
export function buildCeilings(rects, ox, oz, H) {
  const group = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.95, side: THREE.DoubleSide });
  for (const r of rects) {
    let m;
    if (r.poly) { // cômodo com formato livre
      const sh = new THREE.Shape(r.poly.map(([x, y]) => new THREE.Vector2(x + ox, -(y + oz))));
      m = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat); m.rotation.x = -Math.PI / 2; m.position.y = H - 0.002;
    } else { m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), mat); m.rotation.x = Math.PI / 2; m.position.set(r.x + r.w / 2 + ox, H - 0.002, r.y + r.h / 2 + oz); }
    m.raycast = () => {}; group.add(m);
  }
  group.visible = false; return group;
}

// ---------------- raios de sol entrando pelas janelas ----------------
export class SunBeams {
  constructor(scene) { this.scene = scene; this.items = []; this.group = new THREE.Group(); scene.add(this.group); this.key = ''; }
  setWindows(list) { // [{ c: Vector3 (centro na parede, y=0), u: Vector3 (ao longo da parede), out: Vector3 (para fora), w, sill, top }]
    this.group.clear(); this.items = [];
    for (const win of list) {
      const beamMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { op: { value: 0 }, col: { value: new THREE.Color('#ffe2b0') }, t: { value: 0 } },
        vertexShader: 'attribute float a; varying float va; varying vec3 vw; void main(){ va = a; vw = (modelMatrix * vec4(position,1.)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
        fragmentShader: `uniform float op, t; uniform vec3 col; varying float va; varying vec3 vw;
          void main(){ float stripes = .75 + .25 * sin(vw.x * 9. + vw.z * 7. + t * .4); gl_FragColor = vec4(col, op * (1. - va * .7) * stripes * .3); }`,
      });
      const beam = new THREE.Mesh(new THREE.BufferGeometry(), beamMat); beam.raycast = () => {}; beam.frustumCulled = false;
      const patchMat = new THREE.MeshBasicMaterial({ color: '#ffe7c2', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const patch = new THREE.Mesh(new THREE.BufferGeometry(), patchMat); patch.raycast = () => {}; patch.frustumCulled = false;
      const N = 70, dpos = new Float32Array(N * 3), dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
      const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#fff1d6', size: 0.022, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      dust.raycast = () => {}; dust.frustumCulled = false;
      const seeds = Array.from({ length: N }, () => [Math.random(), Math.random(), Math.random(), Math.random()]);
      this.group.add(beam, patch, dust);
      this.items.push({ win, beam, patch, dust, seeds, P: null, Q: null, vis: 0 });
    }
    this.key = '';
  }
  // recalcula a forma do feixe quando o sol anda
  _shape(it, sun) {
    const { c, u, out, w, sill, top } = it.win;
    const base = c.clone().addScaledVector(out, -0.07);
    const P = [[-1, sill], [1, sill], [1, top], [-1, top]].map(([s, y]) => base.clone().addScaledVector(u, s * (w / 2 - 0.03)).setY(y));
    const L = sun.clone().negate(); // direção da luz
    const Q = P.map(p => { let k = p.y / Math.max(0.05, sun.y); const v = L.clone().multiplyScalar(k); if (v.length() > 5.5) v.setLength(5.5); return p.clone().add(v).setY(Math.max(0.012, p.y + v.y)); });
    const pos = [], a = [];
    const quad = (p1, p2, q2, q1) => { for (const [v, av] of [[p1, 0], [p2, 0], [q2, 1], [p1, 0], [q2, 1], [q1, 1]]) { pos.push(v.x, v.y, v.z); a.push(av); } };
    for (let i = 0; i < 4; i++) quad(P[i], P[(i + 1) % 4], Q[(i + 1) % 4], Q[i]);
    const g = it.beam.geometry; g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('a', new THREE.Float32BufferAttribute(a, 1)); g.computeBoundingSphere();
    const fq = Q.map(q => q.clone().setY(0.013)), pp = [];
    for (const v of [fq[0], fq[1], fq[2], fq[0], fq[2], fq[3]]) pp.push(v.x, v.y, v.z);
    it.patch.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); it.patch.geometry.computeBoundingSphere();
    it.P = P; it.Q = Q;
  }
  update(sun, strength, t) {
    const key = sun.toArray().map(v => v.toFixed(2)).join();
    for (const it of this.items) {
      const facing = new THREE.Vector2(sun.x, sun.z).normalize().dot(new THREE.Vector2(it.win.out.x, it.win.out.z));
      const goal = sun.y > 0.06 && facing > 0.08 ? strength * Math.min(1, facing * 2.5) * Math.min(1, (sun.y - 0.06) * 6) : 0;
      it.vis += (goal - it.vis) * 0.06;
      const show = it.vis > 0.005;
      it.beam.visible = it.patch.visible = it.dust.visible = show;
      if (!show) continue;
      if (key !== this.key || !it.P) this._shape(it, sun);
      it.beam.material.uniforms.op.value = it.vis; it.beam.material.uniforms.t.value = t;
      it.patch.material.opacity = it.vis * 0.5;
      it.dust.material.opacity = it.vis * 0.55;
      const d = it.dust.geometry.attributes.position, P = it.P, Q = it.Q;
      it.seeds.forEach((s, i) => { // poeira flutuando dentro do feixe
        const k = (s[0] + t * 0.012 * (0.5 + s[3])) % 1, a = s[1], b = s[2];
        const p = P[0].clone().lerp(P[1], a).lerp(P[3].clone().lerp(P[2], a), b), q = Q[0].clone().lerp(Q[1], a).lerp(Q[3].clone().lerp(Q[2], a), b);
        const v = p.lerp(q, k * 0.85); d.setXYZ(i, v.x + Math.sin(t * 0.3 + i) * 0.03, v.y + Math.sin(t * 0.21 + i * 1.7) * 0.03, v.z + Math.cos(t * 0.27 + i) * 0.03);
      });
      d.needsUpdate = true;
    }
    this.key = key;
  }
}
