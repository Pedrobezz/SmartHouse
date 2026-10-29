// Biblioteca de móveis procedurais (estilo maquete elegante). Medidas em metros: w = largura, d = profundidade, h = altura.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const SWATCHES = [
  ['#e9e6e1', 'Off-white'], ['#b9b5ae', 'Cinza claro'], ['#6e6c69', 'Cinza'], ['#353433', 'Grafite'],
  ['#c9a27a', 'Carvalho'], ['#7a543a', 'Nogueira'], ['#d6c3a5', 'Areia'], ['#6f8f72', 'Verde'],
  ['#5b7896', 'Azul'], ['#b5684a', 'Terracota'], ['#c8b27d', 'Mostarda'],
];

export const CATALOG = [
  // Sala
  { type: 'sofa', name: 'Sofá', cat: 'Sala', w: 2.1, d: 0.92, h: 0.85, color: '#b9b5ae' },
  { type: 'sofaL', name: 'Sofá em L', cat: 'Sala', w: 2.6, d: 1.7, h: 0.85, color: '#b9b5ae' },
  { type: 'armchair', name: 'Poltrona', cat: 'Sala', w: 0.85, d: 0.85, h: 0.85, color: '#c9a27a' },
  { type: 'coffee', name: 'Mesa de centro', cat: 'Sala', w: 1.1, d: 0.6, h: 0.4, color: '#7a543a' },
  { type: 'tvrack', name: 'Rack + TV', cat: 'Sala', w: 1.8, d: 0.45, h: 0.5, color: '#7a543a' },
  { type: 'rug', name: 'Tapete', cat: 'Sala', w: 2.0, d: 1.4, h: 0.01, color: '#d6c3a5' },
  { type: 'shelf', name: 'Estante', cat: 'Sala', w: 1.0, d: 0.35, h: 1.9, color: '#c9a27a' },
  { type: 'plant', name: 'Planta', cat: 'Sala', w: 0.5, d: 0.5, h: 1.1, color: '#6f8f72' },
  { type: 'lamp', name: 'Luminária de piso', cat: 'Sala', w: 0.4, d: 0.4, h: 1.6, color: '#353433' },
  { type: 'cubeShelf', name: 'Estante de nichos', cat: 'Sala', w: 1.2, d: 0.35, h: 1.2, color: '#c98f5c' },
  { type: 'lowShelf', name: 'Estante baixa', cat: 'Sala', w: 1.5, d: 0.35, h: 0.55, color: '#c98f5c' },
  { type: 'tvShelf', name: 'Rack com nichos', cat: 'Sala', w: 1.6, d: 0.42, h: 0.5, color: '#7a4a32' },
  { type: 'beanbag', name: 'Puff pera', cat: 'Sala', w: 0.75, d: 0.75, h: 0.65, color: '#e2b23a' },
  { type: 'pouf', name: 'Pufe', cat: 'Sala', w: 0.45, d: 0.45, h: 0.42, color: '#e07a3a' },
  { type: 'sideTable', name: 'Mesa lateral', cat: 'Sala', w: 0.45, d: 0.45, h: 0.55, color: '#c98f5c' },
  { type: 'plantTall', name: 'Espada-de-são-jorge', cat: 'Sala', w: 0.4, d: 0.4, h: 1.0, color: '#6f8f72' },
  { type: 'planter', name: 'Floreira', cat: 'Sala', w: 1.0, d: 0.4, h: 0.7, color: '#c46e4a' },
  // Jantar
  { type: 'dining4', name: 'Mesa 4 lugares', cat: 'Jantar', w: 1.2, d: 0.8, h: 0.75, color: '#c9a27a' },
  { type: 'dining6', name: 'Mesa 6 lugares', cat: 'Jantar', w: 1.8, d: 0.9, h: 0.75, color: '#7a543a' },
  { type: 'roundtable', name: 'Mesa redonda', cat: 'Jantar', w: 1.0, d: 1.0, h: 0.75, color: '#e9e6e1' },
  { type: 'sideboard', name: 'Buffet', cat: 'Jantar', w: 1.6, d: 0.45, h: 0.8, color: '#7a543a' },
  { type: 'ovalTable', name: 'Mesa oval 6 lugares', cat: 'Jantar', w: 1.8, d: 1.0, h: 0.75, color: '#f7f5f0' },
  { type: 'bistro', name: 'Mesa bistrô', cat: 'Jantar', w: 0.7, d: 0.7, h: 0.75, color: '#7a4a32' },
  { type: 'clothTable', name: 'Mesa com toalha', cat: 'Jantar', w: 1.0, d: 1.0, h: 0.75, color: '#2e9e6b' },
  // Quarto
  { type: 'bedDouble', name: 'Cama casal', cat: 'Quarto', w: 1.6, d: 2.05, h: 0.5, color: '#e9e6e1' },
  { type: 'bedSingle', name: 'Cama solteiro', cat: 'Quarto', w: 0.95, d: 1.95, h: 0.5, color: '#e9e6e1' },
  { type: 'bedMetal', name: 'Cama de ferro', cat: 'Quarto', w: 0.95, d: 1.95, h: 0.95, color: '#9aa0a6' },
  { type: 'nightstand', name: 'Criado-mudo', cat: 'Quarto', w: 0.45, d: 0.4, h: 0.5, color: '#c9a27a' },
  { type: 'wardrobe', name: 'Guarda-roupa', cat: 'Quarto', w: 1.8, d: 0.6, h: 2.2, color: '#e9e6e1' },
  { type: 'desk', name: 'Escrivaninha', cat: 'Quarto', w: 1.2, d: 0.6, h: 0.75, color: '#c9a27a' },
  { type: 'chair', name: 'Cadeira', cat: 'Quarto', w: 0.5, d: 0.5, h: 0.85, color: '#353433' },
  // Cozinha
  { type: 'counter', name: 'Bancada', cat: 'Cozinha', w: 2.0, d: 0.6, h: 0.9, color: '#e9e6e1' },
  { type: 'sink', name: 'Pia de cozinha', cat: 'Cozinha', w: 1.2, d: 0.6, h: 0.9, color: '#e9e6e1' },
  { type: 'stove', name: 'Fogão', cat: 'Cozinha', w: 0.6, d: 0.6, h: 0.9, color: '#b9b5ae' },
  { type: 'fridge', name: 'Geladeira', cat: 'Cozinha', w: 0.7, d: 0.7, h: 1.8, color: '#b9b5ae' },
  { type: 'island', name: 'Ilha', cat: 'Cozinha', w: 1.6, d: 0.9, h: 0.9, color: '#353433' },
  { type: 'stool', name: 'Banqueta', cat: 'Cozinha', w: 0.4, d: 0.4, h: 0.75, color: '#353433' },
  { type: 'wallCabinet', name: 'Armário aéreo', cat: 'Cozinha', w: 1.2, d: 0.35, h: 0.62, color: '#e9e6e1' },
  { type: 'microwave', name: 'Micro-ondas', cat: 'Cozinha', w: 0.5, d: 0.38, h: 0.3, color: '#353433' },
  // Banheiro / serviço
  { type: 'toilet', name: 'Vaso sanitário', cat: 'Banheiro', w: 0.4, d: 0.65, h: 0.75, color: '#e9e6e1' },
  { type: 'vanity', name: 'Gabinete + cuba', cat: 'Banheiro', w: 0.8, d: 0.45, h: 0.85, color: '#c9a27a' },
  { type: 'shower', name: 'Box', cat: 'Banheiro', w: 0.9, d: 0.9, h: 2.0, color: '#b9b5ae' },
  { type: 'bathtub', name: 'Banheira', cat: 'Banheiro', w: 1.7, d: 0.75, h: 0.55, color: '#e9e6e1' },
  { type: 'washer', name: 'Máquina de lavar', cat: 'Banheiro', w: 0.6, d: 0.6, h: 0.85, color: '#e9e6e1' },
];
export const byType = t => CATALOG.find(c => c.type === t);

// ---------------------------------------------------------------- 3D
// estilo maquete: as cores neutras viram uma paleta quente (nogueira, mostarda, linho, creme) e os cantos ficam mais redondos
let STYLE = 'maquete';
export function setFurnStyle(s) { STYLE = s; }
export const getFurnStyle = () => STYLE;
const WARM = {
  '#e9e6e1': '#f4ede2', '#b9b5ae': '#d9c8ad', '#6e6c69': '#8c7462', '#353433': '#4b3a2f', '#c9a27a': '#c98f5c',
  '#7a543a': '#8b5434', '#d6c3a5': '#e3d3bb', '#6f8f72': '#7f9f6c', '#5b7896': '#6f8fae', '#b5684a': '#c46e4a', '#c8b27d': '#e2b23a',
  '#f2f1ee': '#fbf7f0', '#151515': '#3a2a20', '#2a2a2a': '#3f2d22', '#9a9a9a': '#b8a48c', '#d9d4cc': '#ece2d3', '#2b2b2b': '#e9e1d4', '#444': '#5a4a3e',
};
const warm = c => (STYLE === 'maquete' && typeof c === 'string' && WARM[c.toLowerCase()]) || c;
const matCache = new Map();
function mat(color, rough = 0.75, extra = {}) {
  color = warm(color);
  const key = STYLE + color + rough + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  return matCache.get(key);
}
function rbox(g, w, h, d, m, x, y, z, r = 0.03) {
  if (STYLE === 'maquete') r = r * 1.7 + 0.004;
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}
function cyl(g, rt, rb, h, m, x, y, z, seg = 24) {
  const mesh = new THREE.Mesh(Cyl(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
}
const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
const legs = (g, w, d, h, m, inset = 0.05, r = 0.02) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, r, r, h, m, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), 8);
};
function chairAt(g, x, z, rotY, color) { // cadeira low poly: assento com almofada, encosto curvo e pés afinando
  const c = new THREE.Group(), m = lp(color, 0.7), wd = lp('#7a543a', 0.6);
  cbox(c, 0.42, 0.035, 0.42, wd, 0, 0.43, 0, 0.01);
  piece(c, pillowGeo(0.38, 0.05, 0.38, 0.3, [2, 1, 2]), m, 0, 0.49, 0.01);
  taperLegs(c, 0.42, 0.42, 0.43, wd, 0.04);
  for (const s of [-1, 1]) cbox(c, 0.028, 0.42, 0.028, wd, s * 0.18, 0.46, -0.19, 0.006);
  const back = cbox(c, 0.4, 0.14, 0.03, m, 0, 0.74, -0.2, 0.01); back.rotation.x = -0.1;
  c.position.set(x, 0, z); c.rotation.y = rotY; g.add(c);
}
// caixa com quinas chanfradas (o "low poly" das peças retas)
function cbox(g, w, h, d, m, x, y, z, ch = 0.015) {
  const c = Math.max(0.0008, Math.min(ch, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, c), m);
  mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
}
const BOOKS = ['#b5684a', '#5b7896', '#d6c3a5', '#6f8f72', '#e2b23a', '#353433', '#e9dcc6'];
function books(g, x, y, z, n, h, seed = 0, lying = false) { // fileira (ou pilha) de livros coloridos
  let off = 0;
  for (let i = 0; i < n; i++) {
    const t = 0.03 + ((i * 7 + seed * 3) % 3) * 0.01, hh = h * (0.75 + ((i * 5 + seed) % 4) * 0.08), m = lp(BOOKS[(i + seed * 2) % BOOKS.length], 0.8);
    if (lying) { cbox(g, hh * 0.8, t, h * 0.6, m, x, y + off, z, 0.003).rotation.y = (i % 2 ? 0.12 : -0.08); off += t; }
    else { const b = cbox(g, t, hh, h * 0.7, m, x + off, y, z, 0.003); if (i === n - 1) { b.rotation.z = -0.25; b.position.x += hh * 0.12; } off += t + 0.004; }
  }
}
// folha em lâmina: fina, pontuda, inclinada para fora
function blade(g, x, y, z, len, ang, tilt, m, wid = 0.035) {
  const geo = new THREE.ConeGeometry(wid, len, 4, 1); geo.translate(0, len / 2, 0); geo.scale(1, 1, 0.22);
  const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); b.rotation.set(0, ang, 0); b.rotateZ(tilt); b.castShadow = true; g.add(b); return b;
}
function bladeTuft(g, x, y, z, n, len, spread, seed = 0) {
  const ms = ['#5fae5a', '#4c9a4a', '#73c06a'].map(c => lpf(c, 0.8));
  len *= VK;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + seed, k = 0.75 + ((i * 7 + seed * 3) % 5) * 0.07; blade(g, x + Math.cos(a) * spread * 0.3, y, z + Math.sin(a) * spread * 0.3, len * k, -a, 0.18 + ((i * 3) % 4) * 0.09, ms[i % 3], 0.022 + len * 0.03); }
}
const vaseCache = new Map();
function vase(g, x, y, z, r, h, m) { // vaso torneado: barriga arredondada e gargalo
  h *= VK; const key = r.toFixed(3) + ':' + h.toFixed(3);
  if (!vaseCache.has(key)) {
    const pts = [[0, 0], [0.62, 0], [0.82, 0.08], [0.98, 0.3], [0.92, 0.55], [0.62, 0.78], [0.5, 0.9], [0.58, 1], [0.5, 1], [0.4, 0.92]].map(([px, py]) => new THREE.Vector2(px * r, py * h));
    const geo = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(40), 40); geo.userData.keep = true; vaseCache.set(key, geo);
  }
  piece(g, vaseCache.get(key), m, x, y, z);
}
function plantSmall(g, x, y, z, s = 1) {
  piece(g, Cyl(0.055 * s, 0.045 * s, 0.09 * s, 10), lp('#c46e4a', 0.7), x, y + 0.045 * s, z);
  bladeTuft(g, x, y + 0.08 * s, z, 7, 0.16 * s, 0.05 * s, x * 3);
}
// TV de tela 16:9 sobre um pezinho; altura compensada (VK) para não virar "monitor ultrawide" na maquete
function tv(g, x, y, z, tvw) {
  const dark = lp('#1d1d1f', 0.35), sh = tvw * 9 / 16, neck = 0.07;
  cbox(g, 0.34, 0.018, 0.16, dark, x, y, z, 0.006); cbox(g, 0.06, neck * VK, 0.035, dark, x, y, z, 0.006);
  cbox(g, tvw + 0.03, (sh + 0.03) * VK, 0.04, dark, x, y + neck * VK, z, 0.012);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(tvw - 0.01, sh * VK), new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.25, emissive: '#000000' }));
  scr.position.set(x, y + (neck + 0.015 + sh / 2) * VK, z + 0.021); scr.userData.tvScreen = true; g.add(scr);
}
function faucet(g, x, y, z, s = 1, ry = 0) { // torneira bica de cisne: coluna, arco e saída virada para a cuba
  const f = new THREE.Group(), m = lp('#c9ccd0', 0.2, { metalness: 0.7 }), hc = 0.2 * s * VK, r = 0.06 * s;
  piece(f, Cyl(0.024 * s, 0.026 * s, 0.025, 24), m, 0, 0.0125, 0);
  piece(f, Cyl(0.012 * s, 0.012 * s, hc, 24), m, 0, hc / 2, 0);
  const arc = piece(f, new THREE.TorusGeometry(r, 0.012 * s, 12, 24, Math.PI), m, 0, hc, r); arc.rotation.y = Math.PI / 2; arc.scale.y = VK;
  piece(f, Cyl(0.012 * s, 0.01 * s, 0.04 * VK, 24), m, 0, hc - 0.02 * VK, 2 * r);
  piece(f, Cyl(0.008, 0.008, 0.05 * s, 16).rotateZ(Math.PI / 2), m, 0, 0.06 * s * VK, 0.012 * s); // registro
  f.position.set(x, y, z); f.rotation.y = ry; g.add(f);
}
function stoolAt(g, x, z, color, w = 0.4, H = 0.75) { // banqueta: assento octogonal, pés abertos e aro de apoio
  const s = new THREE.Group(), wd = lp('#7a543a', 0.6);
  piece(s, Cyl(w / 2, w / 2 - 0.02, 0.05, 8), lp(color, 0.7), 0, H - 0.025, 0);
  taperLegs(s, w * 0.75, w * 0.75, H - 0.05, wd, 0.02);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.36, 0.01, 8, 32), wd); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; s.add(ring);
  s.position.set(x, 0, z); g.add(s);
}


// ---------------- estofados low poly ----------------
// bloco macio: caixa com quinas bem arredondadas e sombreamento liso (almofadas, colchões, assentos)
const softCache = new Map();
function pillowGeo(w, h, d, puff = 0.18) {
  const r = Math.max(0.006, Math.min(w, h, d) / 2 * Math.min(0.9, 0.35 + puff * 1.4));
  const key = [w, h, d, r].map(v => v.toFixed(3)).join(':');
  if (!softCache.has(key)) { const g = new RoundedBoxGeometry(w, h, d, 6, r); g.userData.keep = true; softCache.set(key, g); }
  return softCache.get(key);
}
const lp = (color, rough = 0.85, extra = {}) => mat(color, rough, extra);
const Cyl = (rt, rb, h, seg = 24, ...rest) => new THREE.CylinderGeometry(rt, rb, h, Math.max(24, seg), ...rest); // peças redondas sempre lisas
// compensação do achatamento da maquete: a casa é encolhida na vertical (vs); TV, monitor, vasos e cúpulas são
// desenhados mais altos na mesma proporção para aparecerem com o formato real
let VK = 1;
export function setFurnScale(vs) { VK = 1 / Math.max(0.3, Math.min(1, vs || 1)); }
export const getFurnScale = () => 1 / VK;
const lpf = (color, rough = 0.85, extra = {}) => mat(color, rough, { flatShading: true, ...extra }); // facetado (folhas)
function piece(g, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
}
// pé de madeira afinando para baixo e levemente aberto
function taperLegs(g, w, d, h, m, inset = 0.07) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const geo = Cyl(0.024, 0.014, h, 16); geo.translate(0, -h / 2, 0);
    const leg = new THREE.Mesh(geo, m); leg.position.set(sx * (w / 2 - inset), h, sz * (d / 2 - inset));
    leg.rotation.set(-sz * 0.12, 0, sx * 0.12); leg.castShadow = true; g.add(leg);
  }
}
// braço: bloco macio com o topo bem arredondado
function arm(g, x, d, y0, h, wA, M) { piece(g, pillowGeo(wA, h, d, 0.45), M, x, y0 + h / 2, 0); }
const ACCENT = { '#d9c8ad': '#c46e4a', '#b9b5ae': '#c46e4a', '#e2b23a': '#f4ede2', '#c98f5c': '#f4ede2' };
function accentOf(col) { return ACCENT[warm(col).toLowerCase()] || (new THREE.Color(warm(col)).getHSL({}).l > 0.55 ? '#c46e4a' : '#e9dcc6'); }
// sofá de assentos contínuos; "seats" almofadas; usado pelo sofá, poltrona e as partes do sofá em L
function upholstered(g, w, d, col, { seats, arms = [-1, 1], pillows = 2, x0 = 0, z0 = 0, back = true }) {
  const M = lp(col), Md = lp(shade(warm(col), 0.9)), acc = lp(accentOf(col)), plinth = lp(shade(warm(col), 0.55), 0.7);
  const baseY = 0.04, baseH = 0.24, wA = arms.length ? 0.2 : 0, backD = back ? 0.22 : 0;
  const sub = new THREE.Group(); sub.position.set(x0, 0, z0); g.add(sub);
  cbox(sub, w - 0.08, baseY, d - 0.08, plinth, 0, 0, 0, 0.01);                                                // rodapé recuado (sem pés)
  piece(sub, pillowGeo(w, baseH, d, 0.1), Md, 0, baseY + baseH / 2, 0);                                        // base
  if (back) piece(sub, pillowGeo(w, 0.5, backD, 0.3), M, 0, baseY + baseH + 0.2, -d / 2 + backD / 2);          // encosto
  for (const s of arms) arm(sub, s * (w / 2 - wA / 2), d, baseY, baseH + 0.32, wA, M);
  const inner = w - wA * arms.length, sx0 = -w / 2 + (arms.includes(-1) ? wA : 0), seatD = d - backD, n = seats;
  for (let i = 0; i < n; i++) {
    const cw = inner / n, cx = sx0 + cw * (i + 0.5);
    piece(sub, pillowGeo(cw - 0.012, 0.15, seatD - 0.01, 0.25), M, cx, baseY + baseH + 0.075, -d / 2 + backD + seatD / 2); // assento
    if (back) piece(sub, pillowGeo(cw - 0.03, 0.4, 0.16, 0.35), M, cx, baseY + baseH + 0.32, -d / 2 + backD + 0.06, -0.14); // almofada do encosto
  }
  const ps = [[-1, 0.35], [1, -0.3]].slice(0, pillows);
  for (const [s, ry] of ps) {
    const px = s * (inner / 2 - 0.2) + (sx0 + inner / 2);
    piece(sub, pillowGeo(0.34, 0.3, 0.1, 0.4), acc, px, baseY + baseH + 0.3, -d / 2 + backD + 0.17, -0.3, ry, s * 0.1);
  }
  return sub;
}

export function buildFurniture(item) {
  const g = new THREE.Group();
  const { w, d } = item, cat = byType(item.type) || {};
  const H = cat.h || 0.8;
  let col = item.color || cat.color || '#b9b5ae';
  if (STYLE === 'maquete' && item.type === 'armchair' && (!item.color || item.color === cat.color)) col = '#e2b23a'; // poltrona mostarda, o toque de cor da maquete
  const M = lp(col, 0.8), Mdark = mat(shade(col, 0.72), 0.8), wood = mat('#7a543a', 0.6), metal = mat('#9a9a9a', 0.35, { metalness: 0.6 });
  const W = lp(col, 0.65), Wd = lp(shade(warm(col), 0.88), 0.65), Mdk = lp(shade(warm(col), 0.82), 0.7), metalLp = lp('#9a9a9a', 0.35, { metalness: 0.6 }); // low poly (faces facetadas)
  const white = mat('#f2f1ee', 0.35), black = mat('#151515', 0.4);
  switch (item.type) {
    case 'sofa': upholstered(g, w, d, col, { seats: Math.max(2, Math.min(4, Math.round((w - 0.3) / 0.62))) }); break;
    case 'sofaL': { // parte principal (com encosto atrás) + chaise do lado direito
      const dd = Math.min(0.95, d * 0.6);
      upholstered(g, w - dd, dd, col, { seats: Math.max(2, Math.round((w - dd - 0.15) / 0.62)), arms: [-1], z0: -d / 2 + dd / 2, x0: -dd / 2 });
      const ch = upholstered(g, dd, d, col, { seats: 1, arms: [1], pillows: 1, x0: w / 2 - dd / 2 });
      break;
    }
    case 'armchair': upholstered(g, w, d, col, { seats: 1, pillows: 1 }); break;
    case 'coffee': { // tampo chanfrado, prateleira embaixo, pés afinando e decoração
      cbox(g, w, 0.05, d, W, 0, 0.36, 0, 0.018);
      cbox(g, w - 0.14, 0.025, d - 0.14, W, 0, 0.1, 0, 0.01);
      taperLegs(g, w, d, 0.36, W, 0.06);
      books(g, -w * 0.22, 0.41, 0, 3, 0.2);
      vase(g, w * 0.24, 0.41, 0.02, 0.06, 0.14, lp('#e9dcc6', 0.6));
      break;
    }
    case 'tvrack': {
      cbox(g, w, 0.38, d, W, 0, 0.12, 0, 0.02);
      for (const i of [-1, 0, 1]) cbox(g, w / 3 - 0.04, 0.3, 0.012, Wd, i * w / 3, 0.16, d / 2 + 0.004, 0.006); // portas
      for (const i of [-1, 0, 1]) cbox(g, 0.12, 0.012, 0.012, metalLp, i * w / 3, 0.38, d / 2 + 0.014, 0.003);    // puxadores
      taperLegs(g, w, d, 0.12, W, 0.08);
      tv(g, 0, 0.5, -d / 2 + 0.14, Math.min(1.3, w * 0.72));
      plantSmall(g, w / 2 - 0.15, 0.5, 0.05);
      break;
    }
    case 'rug': { // tapete com borda em tom diferente
      cbox(g, w, 0.012, d, M, 0, 0.002, 0, 0.006);
      cbox(g, w - 0.16, 0.004, d - 0.16, lp(shade(warm(col), 0.86)), 0, 0.012, 0, 0.003);
      cbox(g, w - 0.26, 0.004, d - 0.26, M, 0, 0.014, 0, 0.003);
      break;
    }
    case 'shelf': {
      for (const s of [-1, 1]) cbox(g, 0.035, H, d, M, s * (w / 2 - 0.018), 0, 0, 0.008);
      cbox(g, w, 0.035, 0.012, M, 0, 0, -d / 2 + 0.006, 0.004);
      for (let i = 0; i < 5; i++) cbox(g, w - 0.06, 0.03, d, M, 0, i * (H - 0.03) / 4, 0, 0.006);
      for (let i = 0; i < 4; i++) { // em cada prateleira: livros, vasinho ou caixa
        const y = i * (H - 0.03) / 4 + 0.03, kind = i % 3;
        books(g, -w / 2 + 0.2, y, 0, 4 + (i % 2) * 2, 0.24, i);
        if (kind === 0) vase(g, w / 2 - 0.18, y, 0, 0.055, 0.16, lp('#b5684a', 0.6));
        else if (kind === 1) plantSmall(g, w / 2 - 0.18, y, 0);
        else cbox(g, 0.2, 0.12, d * 0.6, lp('#e9dcc6', 0.8), w / 2 - 0.2, y, 0, 0.01);
      }
      break;
    }
    case 'plant': { // vaso e folhas em lâmina, como na referência
      const pot = lp('#f3eee6', 0.5);
      const ph = 0.36 * Math.min(VK, 1.6); // vaso com a proporção real
      piece(g, Cyl(w * 0.32, w * 0.26, ph, 12), pot, 0, ph / 2, 0);
      piece(g, Cyl(w * 0.3, w * 0.3, 0.02, 12), lp('#5a3d2b', 0.9), 0, ph - 0.01, 0);
      bladeTuft(g, 0, ph - 0.02, 0, 14, Math.max(0.45, H - 0.35), w * 0.4, 1);
      bladeTuft(g, 0, ph - 0.02, 0, 8, Math.max(0.35, H - 0.5), w * 0.2, 2);
      break;
    }
    case 'lamp': { // luminária de piso: tripé de madeira e cúpula facetada
      const top = H - 0.32;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2, geo = Cyl(0.012, 0.016, top, 5); geo.translate(0, top / 2, 0);
        const leg = new THREE.Mesh(geo, lp('#7a543a', 0.6)); leg.position.set(Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13);
        leg.lookAt(0, top * 2.4, 0); leg.rotateX(Math.PI / 2); leg.castShadow = true; g.add(leg);
      }
      piece(g, Cyl(0.012, 0.012, 0.32, 5), lp('#353433', 0.5), 0, top + 0.1, 0);
      piece(g, Cyl(0.12, 0.2, 0.3, 8, 1, true), lp('#f3ead8', 0.9, { emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 0.35, side: THREE.DoubleSide }), 0, top + 0.15, 0);
      break;
    }
    case 'dining4': case 'dining6': {
      cbox(g, w, 0.05, d, W, 0, 0.7, 0, 0.018); taperLegs(g, w, d, 0.7, W, 0.08);
      const per = item.type === 'dining6' ? 2 : 1, cc = '#e9e6e1';
      for (let i = 0; i < per; i++) { const x = per === 1 ? 0 : (i - 0.5) * w * 0.5; chairAt(g, x, -d / 2 - 0.22, 0, cc); chairAt(g, x, d / 2 + 0.22, Math.PI, cc); }
      chairAt(g, -w / 2 - 0.22, 0, Math.PI / 2, cc); chairAt(g, w / 2 + 0.22, 0, -Math.PI / 2, cc);
      vase(g, 0, 0.75, 0, 0.06, 0.18, lp('#e9dcc6', 0.6)); plantSmall(g, 0, 0.93, 0, 0.6);
      break;
    }
    case 'roundtable': {
      piece(g, Cyl(w / 2, w / 2 - 0.02, 0.05, 14), W, 0, 0.725, 0);
      piece(g, Cyl(0.05, 0.08, 0.7, 6), W, 0, 0.35, 0);
      for (let i = 0; i < 4; i++) { const f = cbox(g, 0.5, 0.04, 0.06, W, 0, 0, 0, 0.01); f.rotation.y = i * Math.PI / 4 * 2 + Math.PI / 4; f.position.set(0, 0.02, 0); }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; chairAt(g, Math.sin(a) * (w / 2 + 0.2), Math.cos(a) * (w / 2 + 0.2), a + Math.PI, '#353433'); }
      vase(g, 0, 0.75, 0, 0.05, 0.16, lp('#6f8f72', 0.6));
      break;
    }
    case 'sideboard': {
      cbox(g, w, H - 0.16, d, W, 0, 0.16, 0, 0.02);
      const n = Math.max(2, Math.round(w / 0.5));
      for (let i = 0; i < n; i++) { const x = -w / 2 + w / n * (i + 0.5); cbox(g, w / n - 0.03, H - 0.24, 0.012, Wd, x, 0.2, d / 2 + 0.004, 0.006); cbox(g, 0.012, 0.1, 0.014, metalLp, x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.06), (H + 0.16) / 2, d / 2 + 0.014, 0.003); }
      taperLegs(g, w, d, 0.16, W, 0.07);
      vase(g, -w / 3, H, 0, 0.07, 0.24, lp('#e9dcc6', 0.6)); books(g, w / 4, H, 0, 3, 0.16, 2, true);
      break;
    }
    case 'bedDouble': case 'bedSingle': {
      const dbl = item.type === 'bedDouble', wood = lp('#7a4a32', 0.55), white = lp('#f7f5f0', 0.8);
      const sheet = lp(col === '#e9e6e1' ? (dbl ? '#e07a5f' : '#7cc58a') : col, 0.8);
      cbox(g, w + 0.06, 0.22, d + 0.02, wood, 0, 0.1, 0, 0.015);                                   // estrado
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cbox(g, 0.06, 0.1, 0.06, wood, sx * (w / 2 - 0.0), 0, sz * (d / 2 - 0.02), 0.008);
      cbox(g, w + 0.1, 0.95, 0.07, wood, 0, 0, -d / 2 - 0.02, 0.015);                              // cabeceira
      cbox(g, w + 0.14, 0.05, 0.1, wood, 0, 0.95, -d / 2 - 0.02, 0.012);
      cbox(g, w + 0.1, 0.5, 0.06, wood, 0, 0, d / 2 + 0.02, 0.015);                                // pezeira
      piece(g, pillowGeo(w - 0.02, 0.2, d - 0.06, 0.15), white, 0, 0.42, 0);                        // colchão
      piece(g, pillowGeo(w + 0.01, 0.06, d * 0.7, 0.2), sheet, 0, 0.53, d * 0.14);                 // lençol/edredom
      const pil = dbl ? [-w / 4, w / 4] : [0];
      for (const x of pil) piece(g, pillowGeo(w / pil.length - 0.12, 0.11, 0.32, 0.5), white, x, 0.58, -d / 2 + 0.25, -0.12, 0, 0);
      break;
    }
    case 'nightstand': {
      cbox(g, w, H - 0.12, d, M, 0, 0.12, 0, 0.018);
      cbox(g, w - 0.05, (H - 0.12) / 2 - 0.04, 0.012, Mdk, 0, 0.12 + (H - 0.12) / 2 + 0.01, d / 2 + 0.004, 0.006); // gaveta
      cbox(g, 0.08, 0.015, 0.015, metalLp, 0, 0.12 + (H - 0.12) * 0.75, d / 2 + 0.014, 0.004);
      taperLegs(g, w, d, 0.12, lp('#7a543a', 0.6), 0.05);
      piece(g, Cyl(0.05, 0.06, 0.02, 8), lp('#353433', 0.5), -0.06, H + 0.01, 0);       // abajur pequeno
      piece(g, Cyl(0.008, 0.008, 0.16 * VK, 5), lp('#353433', 0.5), -0.06, H + 0.09 * VK, 0);
      piece(g, Cyl(0.06, 0.09, 0.11 * VK, 8, 1, true), lp('#f3ead8', 0.9, { emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 0.3, side: THREE.DoubleSide }), -0.06, H + 0.2 * VK, 0);
      books(g, 0.1, H, 0.04, 2, 0.14, 1, true);
      break;
    }
    case 'wardrobe': {
      cbox(g, w, 0.08, d - 0.04, Mdk, 0, 0, -0.02, 0.008);                       // rodapé recuado
      cbox(g, w, H - 0.08, d, M, 0, 0.08, 0, 0.012);
      const n = Math.max(2, Math.round(w / 0.6));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + w / n * (i + 0.5);
        cbox(g, w / n - 0.025, H - 0.18, 0.014, M, x, 0.13, d / 2 + 0.005, 0.006); // porta saltada
        cbox(g, 0.018, 0.32, 0.022, metalLp, x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.07), H * 0.5, d / 2 + 0.018, 0.004);
      }
      break;
    }
    case 'desk': {
      cbox(g, w, 0.04, d, W, 0, 0.71, 0, 0.012); taperLegs(g, w, d, 0.71, W, 0.05);
      cbox(g, 0.4, 0.12, d - 0.08, W, w / 2 - 0.24, 0.58, 0, 0.01);                                       // gaveteiro suspenso
      cbox(g, 0.06, 0.012, 0.012, metalLp, w / 2 - 0.24, 0.64, d / 2 - 0.035, 0.003);
      const dark = lp('#1d1d1f', 0.4);
      cbox(g, 0.18, 0.012, 0.12, dark, -0.05, 0.75, -d / 2 + 0.12, 0.004); cbox(g, 0.04, 0.1 * VK, 0.03, dark, -0.05, 0.75, -d / 2 + 0.12, 0.006); // pé do monitor
      cbox(g, 0.54, 0.32 * VK, 0.022, dark, -0.05, 0.75 + 0.1 * VK, -d / 2 + 0.12, 0.008);                // monitor 16:9
      cbox(g, 0.51, 0.29 * VK, 0.004, lp('#2b3036', 0.2), -0.05, 0.75 + 0.115 * VK, -d / 2 + 0.132, 0.002);
      cbox(g, 0.4, 0.015, 0.13, lp('#d9d4cc', 0.6), -0.05, 0.75, 0.08, 0.004);                             // teclado
      vase(g, -w / 2 + 0.12, 0.75, -0.1, 0.035, 0.1, lp('#b5684a', 0.6));
      break;
    }
    case 'chair': chairAt(g, 0, 0, 0, col); break;
    case 'counter': case 'sink': case 'island': {
      cbox(g, w - 0.02, 0.08, d - 0.06, lp('#2b2b2b', 0.6), 0, 0, -0.03, 0.006);       // rodapé recuado
      cbox(g, w, 0.78, d, M, 0, 0.08, 0, 0.01);
      const n = Math.max(1, Math.round(w / 0.45));
      for (let i = 0; i < n; i++) { const x = -w / 2 + w / n * (i + 0.5); cbox(g, w / n - 0.02, 0.7, 0.012, M, x, 0.12, d / 2 + 0.005, 0.005); cbox(g, 0.14, 0.012, 0.016, metalLp, x, 0.78, d / 2 + 0.016, 0.003); }
      const topM = lp(STYLE === 'maquete' ? '#e9e1d4' : '#2b2b2b', 0.3);
      if (item.type === 'sink') { // tampo com recorte + cuba funda de inox
        const bw = 0.5, bd = 0.36, bz = 0.03, T = w + 0.03, D = d + 0.03, y = 0.86, th = 0.035, steel = lp('#b8babd', 0.25, { metalness: 0.6 }), steelIn = lp('#8d9095', 0.35, { metalness: 0.6 });
        const z0 = -D / 2, z1 = bz - bd / 2, z2 = bz + bd / 2;
        cbox(g, (T - bw) / 2, th, D, topM, -(T + bw) / 4, y, 0, 0.004); cbox(g, (T - bw) / 2, th, D, topM, (T + bw) / 4, y, 0, 0.004);
        cbox(g, bw, th, z1 - z0, topM, 0, y, (z0 + z1) / 2, 0.004); cbox(g, bw, th, D / 2 - z2, topM, 0, y, (z2 + D / 2) / 2, 0.004);
        const dep = 0.2;
        cbox(g, bw, 0.01, bd, steelIn, 0, y + th - dep, bz, 0.003);                                                  // fundo
        for (const s2 of [-1, 1]) { cbox(g, 0.01, dep, bd, steel, s2 * (bw / 2 - 0.005), y + th - dep, bz, 0.002); cbox(g, bw, dep, 0.01, steel, 0, y + th - dep, bz + s2 * (bd / 2 - 0.005), 0.002); }
        piece(g, Cyl(0.025, 0.025, 0.004, 24), lp('#555', 0.3), 0, y + th - dep + 0.012, bz);                         // ralo
        faucet(g, 0, y + th, -d / 2 + 0.07);
      } else cbox(g, w + 0.03, 0.035, d + 0.03, topM, 0, 0.86, 0, 0.008); // tampo
      if (item.type === 'counter') { vase(g, w / 2 - 0.2, 0.895, -0.05, 0.06, 0.14, lp('#e9dcc6', 0.6)); cbox(g, 0.36, 0.02, 0.24, lp('#c9a27a', 0.6), -w / 2 + 0.35, 0.895, 0, 0.006); }
      if (item.type === 'island') for (let i = -1; i <= 1; i += 2) stoolAt(g, i * w / 4, d / 2 + 0.28, '#353433');
      break;
    }
    case 'stove': {
      cbox(g, w, 0.86, d, M, 0, 0, 0, 0.012);
      cbox(g, w, 0.025, d, lp('#151515', 0.3), 0, 0.86, 0, 0.004);
      for (const x of [-1, 1]) for (const z of [-1, 1]) { piece(g, Cyl(0.075, 0.075, 0.012, 8), lp('#3a3a3a', 0.5), x * w / 4, 0.892, z * d / 4); piece(g, Cyl(0.035, 0.035, 0.014, 6), lp('#151515', 0.4), x * w / 4, 0.9, z * d / 4); }
      cbox(g, w - 0.08, 0.42, 0.012, lp('#1d1d1f', 0.25), 0, 0.16, d / 2 + 0.004, 0.006);                 // porta do forno
      cbox(g, w - 0.18, 0.2, 0.004, lp('#3a4650', 0.1), 0, 0.26, d / 2 + 0.012, 0.004);
      cbox(g, w - 0.14, 0.016, 0.02, metalLp, 0, 0.62, d / 2 + 0.02, 0.004);
      for (let i = 0; i < 4; i++) piece(g, Cyl(0.018, 0.018, 0.025, 6).rotateX(Math.PI / 2), lp('#1d1d1f', 0.4), -w / 2 + 0.12 + i * (w - 0.24) / 3, 0.76, d / 2 + 0.012);
      break;
    }
    case 'fridge': {
      cbox(g, w, H, d, M, 0, 0, 0, 0.03);
      cbox(g, w - 0.01, 0.012, 0.01, Mdk, 0, H * 0.63, d / 2, 0);
      for (const y of [H * 0.25, H * 0.75]) cbox(g, 0.025, 0.36, 0.035, metalLp, w / 2 - 0.08, y - 0.18, d / 2 + 0.016, 0.006);
      break;
    }
    case 'stool': stoolAt(g, 0, 0, col, w, H); break;
    case 'toilet': {
      const porc = lp('#f7f5f0', 0.3);
      cbox(g, w * 0.92, 0.36, 0.17, porc, 0, 0.42, -d / 2 + 0.09, 0.02);                                       // caixa acoplada
      cbox(g, w * 0.96, 0.025, 0.19, porc, 0, 0.78, -d / 2 + 0.09, 0.008);
      const bowl = piece(g, Cyl(w / 2, w * 0.34, 0.4, 8), porc, 0, 0.2, 0.06); bowl.scale.z = 1.3;
      const seat = piece(g, Cyl(w / 2 + 0.01, w / 2 + 0.01, 0.025, 8), lp('#ffffff', 0.4), 0, 0.41, 0.06); seat.scale.z = 1.3;
      cbox(g, 0.05, 0.012, 0.02, metalLp, w * 0.28, 0.66, -d / 2 + 0.18, 0.003);
      break;
    }
    case 'vanity': {
      cbox(g, w, 0.55, d, M, 0, 0.25, 0, 0.012);
      for (const s of [-1, 1]) cbox(g, w / 2 - 0.025, 0.48, 0.012, M, s * w / 4, 0.28, d / 2 + 0.005, 0.005);
      cbox(g, w + 0.02, 0.05, d + 0.02, lp('#f7f5f0', 0.3), 0, 0.8, 0, 0.012);
      { const r = 0.19, hh = 0.13, pts = [[0, 0], [0.55, 0], [0.8, 0.12], [0.97, 0.5], [1, 1], [0.93, 1], [0.9, 0.55], [0.72, 0.22], [0, 0.18]].map(([px, py]) => new THREE.Vector2(px * r, py * hh));
        piece(g, new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(36), 40), lp('#ffffff', 0.2), 0, 0.85, 0.03); } // cuba de apoio (tigela oca)
      faucet(g, 0, 0.85, -d / 2 + 0.07, 0.6);
      cbox(g, w * 0.78, 0.62, 0.03, lp('#c9a27a', 0.6), 0, 1.05, -d / 2 + 0.015, 0.01);                         // moldura do espelho
      cbox(g, w * 0.72, 0.56, 0.006, lp('#dfe8ec', 0.12, { metalness: 0.15, envMapIntensity: 1.4 }), 0, 1.08, -d / 2 + 0.032, 0.004); // espelho claro
      break;
    }
    case 'shower': {
      cbox(g, w, 0.05, d, lp('#e6e3dd', 0.5), 0, 0, 0, 0.012);
      const frame = lp('#9a9a9a', 0.35, { metalness: 0.6 }), glassMat = new THREE.MeshPhysicalMaterial({ color: '#cfe3ea', roughness: 0.05, transparent: true, opacity: 0.25 });
      for (const [x, z, ww, dd] of [[0, d / 2, w, 0.01], [w / 2, 0, 0.01, d]]) {
        const gl = new THREE.Mesh(new THREE.BoxGeometry(ww, H - 0.05, dd), glassMat); gl.position.set(x, (H - 0.05) / 2 + 0.05, z); g.add(gl);
        cbox(g, ww + 0.02, 0.025, dd + 0.02, frame, x, H - 0.025, z, 0.004);
      }
      cbox(g, 0.025, H - 0.05, 0.025, frame, w / 2, 0.05, d / 2, 0.004);
      piece(g, Cyl(0.012, 0.012, 0.3, 5), frame, -w / 2 + 0.06, H - 0.25, -d / 2 + 0.06);
      piece(g, Cyl(0.1, 0.1, 0.015, 8), frame, -w / 2 + 0.16, H - 0.12, -d / 2 + 0.16);
      break;
    }
    case 'bathtub': {
      const porc = lp('#f7f5f0', 0.3);
      cbox(g, w, H, d, porc, 0, 0, 0, 0.04);
      cbox(g, w - 0.14, 0.02, d - 0.14, lp('#bcd8e2', 0.1), 0, H - 0.05, 0, 0.04);
      faucet(g, -w / 2 + 0.1, H, 0, 0.7, Math.PI / 2);
      break;
    }
    case 'washer': {
      cbox(g, w, H, d, M, 0, 0, 0, 0.03);
      cbox(g, w - 0.02, 0.1, 0.01, lp('#d9d4cc', 0.5), 0, H - 0.13, d / 2 + 0.002, 0.004);                     // painel
      piece(g, Cyl(0.025, 0.025, 0.02, 8).rotateX(Math.PI / 2), lp('#9a9a9a', 0.4), w / 2 - 0.1, H - 0.08, d / 2 + 0.01);
      const door = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.028, 12, 40), lp('#b8babd', 0.3, { metalness: 0.5 })); door.position.set(0, H * 0.45, d / 2 + 0.012); g.add(door);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), lp('#2a3640', 0.1)); glass.position.set(0, H * 0.45, d / 2 + 0.01); g.add(glass);
      break;
    }
    case 'cubeShelf': { // estante de nichos (cubos abertos) com objetos
      const cols = Math.max(2, Math.round(w / 0.4)), rows = Math.max(2, Math.round(H / 0.4)), t = 0.025;
      cbox(g, w, t, d, W, 0, 0, 0, 0.006); cbox(g, w, t, d, W, 0, H - t, 0, 0.006); cbox(g, w, H, 0.012, Wd, 0, 0, -d / 2 + 0.006, 0.003);
      for (let i = 0; i <= cols; i++) cbox(g, t, H, d, W, -w / 2 + t / 2 + i * (w - t) / cols, 0, 0, 0.006);
      for (let j = 1; j < rows; j++) cbox(g, w - 0.02, t, d, W, 0, j * (H - t) / rows, 0, 0.006);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const cx = -w / 2 + (i + 0.5) * w / cols, y = j * (H - t) / rows + t, k = (i * 3 + j * 5) % 4;
        if (k === 0) books(g, cx - 0.1, y, 0, 4, 0.26, i + j);
        else if (k === 1) vase(g, cx, y, 0, 0.05, 0.16, lp(['#2f6fb0', '#c46e4a', '#e2b23a'][(i + j) % 3], 0.5));
        else if (k === 2) cbox(g, w / cols - 0.1, 0.18, d - 0.08, lp(['#e9dcc6', '#9fb8a0', '#d9a8a0'][(i + j) % 3], 0.8), cx, y, 0.02, 0.01);
      }
      break;
    }
    case 'lowShelf': { // estante baixa aberta com livros e vasos
      const t = 0.025;
      cbox(g, w, t, d, W, 0, 0, 0, 0.006); cbox(g, w, t, d, W, 0, H - t, 0, 0.006); cbox(g, w, t, d, W, 0, (H - t) / 2, 0, 0.006);
      for (const s2 of [-1, 0, 1]) cbox(g, t, H, d, W, s2 * (w / 2 - t / 2) * (s2 ? 1 : 0), 0, 0, 0.006);
      cbox(g, w, H, 0.012, Wd, 0, 0, -d / 2 + 0.006, 0.003);
      books(g, -w / 2 + 0.1, t, 0, 6, (H - 3 * t) / 2 * 0.9, 1); books(g, 0.12, (H - t) / 2 + t, 0, 5, (H - 3 * t) / 2 * 0.85, 4);
      vase(g, w / 4, t, 0, 0.05, 0.14, lp('#2f6fb0', 0.5)); vase(g, -w / 4, H, 0, 0.05, 0.16, lp('#5a3d2b', 0.5)); books(g, w / 4, H, 0, 2, 0.18, 2, true);
      break;
    }
    case 'tvShelf': { // rack com nichos e TV
      const t = 0.03;
      cbox(g, w, t, d, W, 0, 0, 0, 0.006); cbox(g, w, t, d, W, 0, H - t, 0, 0.006); cbox(g, w * 0.66, t, d, W, -w * 0.17, (H - t) / 2, 0, 0.006);
      for (const x of [-w / 2 + t / 2, w / 2 - t / 2, w * 0.16]) cbox(g, t, H, d, W, x, 0, 0, 0.006);
      cbox(g, w, H, 0.012, Wd, 0, 0, -d / 2 + 0.006, 0.003);
      books(g, -w / 2 + 0.08, t, 0, 7, (H - 3 * t) / 2 * 0.9, 3); cbox(g, 0.3, 0.06, 0.2, lp('#1d1d1f', 0.4), -w * 0.17, (H - t) / 2 + t, 0, 0.006);
      plantSmall(g, w * 0.33, t, 0);
      tv(g, 0, H, -d / 2 + 0.12, Math.min(1.2, w * 0.7));
      break;
    }
    case 'beanbag': { // puff pera: gota torneada, larga embaixo e arredondada no topo
      const pts = [[0, 0], [0.42, 0], [0.49, 0.06], [0.5, 0.2], [0.45, 0.42], [0.34, 0.62], [0.2, 0.76], [0.06, 0.8], [0, 0.8]].map(([x, y]) => new THREE.Vector2(x, y));
      const geo = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(40), 48);
      const m = piece(g, geo, lp(col, 0.85), 0, 0, 0); m.scale.set(w, H / 0.8, d); m.rotation.x = -0.12; // levemente inclinado para trás (encosto)
      break;
    }
    case 'pouf': piece(g, Cyl(w / 2, w / 2 * 0.96, H, 12), lp(col, 0.85), 0, H / 2, 0); piece(g, Cyl(w / 2 * 0.92, w / 2 * 0.92, 0.02, 12), lp(shade(warm(col), 0.85), 0.85), 0, H + 0.005, 0); break;
    case 'sideTable': piece(g, Cyl(w / 2, w / 2, 0.03, 20), W, 0, H - 0.015, 0); piece(g, Cyl(0.025, 0.03, H - 0.03, 8), lp('#353433', 0.5), 0, (H - 0.03) / 2, 0); piece(g, Cyl(w * 0.32, w * 0.34, 0.02, 16), lp('#353433', 0.5), 0, 0.01, 0); vase(g, 0.04, H, 0, 0.04, 0.12, lp('#e2b23a', 0.5)); break;
    case 'plantTall': { // espada-de-são-jorge em vaso alto
      const ph = 0.42 * Math.min(VK, 1.6);
      piece(g, Cyl(w * 0.34, w * 0.28, ph, 24), lp('#f3eee6', 0.5), 0, ph / 2, 0);
      bladeTuft(g, 0, ph - 0.02, 0, 11, Math.max(0.4, H - 0.4), w * 0.25, 3);
      break;
    }
    case 'planter': { // floreira retangular com folhagem
      cbox(g, w, H * 0.45, d, lp(col, 0.7), 0, 0, 0, 0.02);
      cbox(g, w - 0.06, 0.02, d - 0.06, lp('#5a3d2b', 0.9), 0, H * 0.45 - 0.02, 0, 0.006);
      const n = Math.max(2, Math.round(w / 0.25));
      for (let i = 0; i < n; i++) bladeTuft(g, -w / 2 + (i + 0.5) * w / n, H * 0.43, 0, 9, H * 0.6, 0.14, i);
      break;
    }
    case 'bistro': piece(g, new THREE.BoxGeometry(w, 0.04, d), W, 0, H - 0.02, 0); piece(g, Cyl(0.035, 0.045, H - 0.04, 8), lp('#353433', 0.5), 0, (H - 0.04) / 2, 0); piece(g, Cyl(w * 0.32, w * 0.34, 0.025, 4), lp('#353433', 0.5), 0, 0.012, 0, 0, Math.PI / 4, 0); break;
    case 'clothTable': { // mesa com toalha caindo nas laterais
      const cloth = lp(col, 0.9), geo = Cyl(w / 2 + 0.02, w / 2 + 0.16, 0.36, 12, 1, true);
      piece(g, Cyl(w / 2, w / 2, 0.03, 20), lp('#7a4a32', 0.6), 0, H - 0.015, 0);
      piece(g, Cyl(0.04, 0.04, H - 0.03, 8), lp('#7a4a32', 0.6), 0, (H - 0.03) / 2, 0);
      piece(g, Cyl(w / 2 + 0.02, w / 2 + 0.02, 0.012, 20), cloth, 0, H + 0.006, 0);
      const skirt = piece(g, geo, mat(col, 0.9, { side: THREE.DoubleSide }), 0, H - 0.17, 0); skirt.rotation.y = Math.PI / 12;
      piece(g, Cyl(0.07, 0.05, 0.05, 10), lp('#5a3d2b', 0.5), 0, H + 0.04, 0);
      break;
    }
    case 'ovalTable': { // mesa oval branca com 6 cadeiras
      const top = piece(g, Cyl(0.5, 0.5, 0.04, 28), lp(col, 0.5), 0, H - 0.02, 0); top.scale.set(w, 1, d);
      for (const s2 of [-1, 1]) piece(g, Cyl(0.035, 0.05, H - 0.04, 8), lp(col, 0.5), s2 * w * 0.28, (H - 0.04) / 2, 0);
      for (const x of [-w * 0.27, 0, w * 0.27]) { chairAt(g, x, -d / 2 - 0.15, 0, '#f7f5f0'); chairAt(g, x, d / 2 + 0.15, Math.PI, '#f7f5f0'); }
      for (const [x, z] of [[-0.25, 0], [0.2, 0.1]]) piece(g, Cyl(0.09, 0.07, 0.03, 12), lp('#1d1d1f', 0.4), x, H + 0.015, z);
      vase(g, 0, H, -0.05, 0.04, 0.12, lp('#2f6fb0', 0.5));
      break;
    }
    case 'bedMetal': { // cama de ferro (solteiro)
      const metal = lp('#9aa0a6', 0.35, { metalness: 0.5 }), white = lp('#f7f5f0', 0.8), rod = (x1, y1, z1, x2, y2, z2, r = 0.016) => {
        const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2), len = a.distanceTo(b);
        const m = piece(g, Cyl(r, r, len, 8), metal, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      };
      for (const [z, h] of [[-d / 2, 0.95], [d / 2, 0.7]]) {
        for (const sx of [-1, 1]) rod(sx * w / 2, 0, z, sx * w / 2, h - 0.12, z);
        const arc = new THREE.TorusGeometry(w / 2, 0.016, 10, 32, Math.PI); const t = piece(g, arc, metal, 0, h - 0.12, z);
        t.scale.y = 0.24 / (w / 2);
        for (let i = 1; i < 4; i++) rod(-w / 2 + i * w / 4, 0.3, z, -w / 2 + i * w / 4, h - 0.12 + 0.12 * Math.sin(i / 4 * Math.PI), z, 0.01);
        rod(-w / 2, 0.3, z, w / 2, 0.3, z);
      }
      for (const sx of [-1, 1]) rod(sx * w / 2, 0.3, -d / 2, sx * w / 2, 0.3, d / 2);
      piece(g, pillowGeo(w - 0.04, 0.2, d - 0.06, 0.15), white, 0, 0.42, 0);
      piece(g, pillowGeo(w - 0.02, 0.05, d * 0.66, 0.2), lp('#f0ede6', 0.8), 0, 0.53, d * 0.15);
      piece(g, pillowGeo(w - 0.18, 0.11, 0.3, 0.5), white, 0, 0.58, -d / 2 + 0.24, -0.12, 0, 0);
      break;
    }
    case 'wallCabinet': { // armário aéreo de cozinha (fica preso na parede, a 1,45 m)
      const y0 = 1.45, hh = 0.62, n = Math.max(1, Math.round(w / 0.45));
      cbox(g, w, hh, d, M, 0, y0, 0, 0.01);
      for (let i = 0; i < n; i++) { const x = -w / 2 + w / n * (i + 0.5); cbox(g, w / n - 0.02, hh - 0.04, 0.012, M, x, y0 + 0.02, d / 2 + 0.005, 0.005); cbox(g, 0.012, 0.12, 0.016, metalLp, x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.05), y0 + 0.05, d / 2 + 0.016, 0.003); }
      break;
    }
    case 'microwave': { // micro-ondas (fica sobre a bancada, a 0,9 m)
      const y0 = 0.9;
      cbox(g, w, H, d, lp('#3a3d42', 0.4), 0, y0, 0, 0.015);
      cbox(g, w * 0.62, H - 0.06, 0.01, lp('#141618', 0.15), -w * 0.12, y0 + 0.03, d / 2 + 0.002, 0.004);
      cbox(g, w * 0.22, H - 0.06, 0.01, lp('#55595f', 0.4), w * 0.36, y0 + 0.03, d / 2 + 0.002, 0.004);
      for (let i = 0; i < 3; i++) piece(g, Cyl(0.014, 0.014, 0.012, 8).rotateX(Math.PI / 2), lp('#9aa0a6', 0.3), w * 0.36, y0 + H - 0.08 - i * 0.06, d / 2 + 0.012);
      break;
    }
    default: cbox(g, w, H, d, M, 0, 0, 0, 0.02);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.castShadow ?? true; } });
  return g;
}

// ---------------------------------------------------------------- 2D (vista de cima)
export function draw2D(ctx, item, s, selected, T) {
  T = T || { furn: '#2a2a2d', furnLine: '#6a6a6f', accent: '#0a84ff' };
  const w = item.w * s, d = item.d * s;
  const fill = item.type === 'rug' ? 'rgba(214,195,165,0.18)' : T.furn;
  ctx.fillStyle = fill; ctx.strokeStyle = selected ? T.accent : T.furnLine; ctx.lineWidth = selected ? 2 : 1;
  const rr = (x, y, ww, hh, r = 3) => { ctx.beginPath(); ctx.roundRect(x, y, ww, hh, r); };
  const round = ['roundtable', 'stool', 'plant', 'lamp', 'pouf', 'sideTable', 'beanbag', 'clothTable', 'plantTall', 'ovalTable'].includes(item.type);
  if (round) { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2); } else rr(-w / 2, -d / 2, w, d, 4);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = selected ? T.accent : T.furnLine; ctx.lineWidth = 1;
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  switch (item.type) {
    case 'sofa': case 'armchair': line(-w / 2, -d / 2 + 0.2 * s, w / 2, -d / 2 + 0.2 * s); line(-w / 2 + 0.18 * s, -d / 2 + 0.2 * s, -w / 2 + 0.18 * s, d / 2); line(w / 2 - 0.18 * s, -d / 2 + 0.2 * s, w / 2 - 0.18 * s, d / 2); break;
    case 'sofaL': line(-w / 2, -d / 2 + 0.2 * s, w / 2, -d / 2 + 0.2 * s); line(w / 2 - 0.92 * s, -d / 2 + 0.92 * s, w / 2 - 0.92 * s, d / 2); line(-w / 2, -d / 2 + 0.92 * s, w / 2 - 0.92 * s, -d / 2 + 0.92 * s); break;
    case 'bedDouble': case 'bedSingle': line(-w / 2, -d / 2 + 0.55 * s, w / 2, -d / 2 + 0.55 * s); line(-w / 2, d * 0.05, w / 2, d * 0.05); break;
    case 'dining4': case 'dining6': case 'roundtable': case 'island':
      ctx.fillStyle = T.furn;
      for (const [x, y] of item.type === 'roundtable' ? [[0, -d / 2 - 0.22 * s], [0, d / 2 + 0.22 * s], [-w / 2 - 0.22 * s, 0], [w / 2 + 0.22 * s, 0]] :
        item.type === 'island' ? [[-w / 4, d / 2 + 0.28 * s], [w / 4, d / 2 + 0.28 * s]] :
          [...(item.type === 'dining6' ? [-w / 4, w / 4] : [0]).flatMap(x => [[x, -d / 2 - 0.22 * s], [x, d / 2 + 0.22 * s]]), [-w / 2 - 0.22 * s, 0], [w / 2 + 0.22 * s, 0]]) {
        rr(x - 0.2 * s, y - 0.2 * s, 0.4 * s, 0.4 * s, 3); ctx.fill(); ctx.stroke();
      }
      break;
    case 'stove': for (const x of [-1, 1]) for (const y of [-1, 1]) { ctx.beginPath(); ctx.arc(x * w / 4, y * d / 4, 0.07 * s, 0, Math.PI * 2); ctx.stroke(); } break;
    case 'sink': case 'vanity': rr(-w * 0.22, -d * 0.28, w * 0.44, d * 0.56, 4); ctx.stroke(); break;
    case 'toilet': ctx.beginPath(); ctx.ellipse(0, d * 0.1, w * 0.42, d * 0.32, 0, 0, Math.PI * 2); ctx.stroke(); break;
    case 'shower': line(-w / 2, -d / 2, w / 2, d / 2); line(w / 2, -d / 2, -w / 2, d / 2); break;
    case 'tvrack': ctx.fillStyle = T.furnLine; ctx.fillRect(-w * 0.4, -d / 2 + 0.08 * s, w * 0.8, 0.06 * s); break;
    case 'wardrobe': line(-w / 2, d / 2 - 0.05 * s, w / 2, d / 2 - 0.05 * s); break;
  }
}

// ---------------------------------------------------------------- cache de móveis montados
// Montar um móvel gera dezenas de peças; o editor da planta remonta a casa a cada alteração. Guardamos cada móvel
// já montado (por tipo, tamanho, cor e estilo) e entregamos cópias que reaproveitam a mesma geometria e os mesmos
// materiais: nada é recriado nem reenviado para a placa de vídeo quando só uma parede muda.
const furnCache = new Map();
export function buildFurnitureCached(item) {
  const key = [STYLE, VK.toFixed(3), item.type, (+item.w).toFixed(3), (+item.d).toFixed(3), item.color || ''].join('|');
  let proto = furnCache.get(key);
  if (!proto) {
    proto = buildFurniture(item);
    proto.traverse(o => { if (o.geometry) o.geometry.userData.keep = true; }); // a casa não libera geometria compartilhada
    furnCache.set(key, proto);
    if (furnCache.size > 300) furnCache.delete(furnCache.keys().next().value);
  }
  const g = proto.clone(true);
  g.traverse(o => { if (o.userData.tvScreen) o.material = o.material.clone(); }); // cada TV acende sozinha
  return g;
}
