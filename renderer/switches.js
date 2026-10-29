// Espelhos de interruptor e tomada na parede, em vários estilos (vidro touch, clássico, minimalista, redondo, retrô).
// Cada tecla acende sozinha conforme o canal do aparelho. Coordenadas locais: a placa olha para +z e encosta na parede em z = WALL_Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const SWITCH_STYLES = [
  { id: 'vidro', name: 'Vidro preto', desc: 'Touch de vidro, anel de luz em cada tecla', sw: '#111214', dot: '#ffd27a' },
  { id: 'vidro-branco', name: 'Vidro branco', desc: 'Touch de vidro claro', sw: '#f4f4f2', dot: '#4fa8ff' },
  { id: 'classico', name: 'Clássico', desc: 'Teclas basculantes que mudam de posição', sw: '#ececea', dot: '#ff9f2e' },
  { id: 'minimal', name: 'Minimalista', desc: 'Grafite fino, filete de luz', sw: '#3a3b3e', dot: '#ffd9a0' },
  { id: 'redondo', name: 'Redondo', desc: 'Placa redonda com botões de apertar', sw: '#e9e6e1', dot: '#ffb84d' },
  { id: 'retro', name: 'Retrô', desc: 'Latão com alavancas', sw: '#b8904a', dot: '#ffcf70' },
];
export const PLUG_STYLES = [
  { id: 'tomada', name: 'Tomada branca', desc: 'Padrão brasileiro', sw: '#efefed', dot: '#57d17a' },
  { id: 'tomada-preta', name: 'Tomada preta', desc: 'Padrão brasileiro, acabamento escuro', sw: '#1d1e20', dot: '#57d17a' },
];
export const WALL_Z = -0.025;
export const defaultStyle = d => (d.type === 'switch' || (d.state?.channels?.length || 0) > 1 ? 'vidro' : d.type === 'light' ? 'classico' : 'tomada');
export const stylesFor = d => (d.type === 'switch' || d.type === 'light' || (d.state?.channels?.length || 0) > 1 ? SWITCH_STYLES : [...PLUG_STYLES, ...SWITCH_STYLES]);

const M = {}; // materiais compartilhados (evita recompilar shader a cada remontagem)
const mat = (k, f) => M[k] || (M[k] = f());
const std = (color, rough = 0.45, metal = 0) => mat(`s${color}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
const glass = color => mat('g' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.08, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05 }));
const G = {};
const geo = (k, f) => { if (!G[k]) { G[k] = f(); G[k].userData.keep = true; } return G[k]; };

// tecla que acende: material próprio (cada uma tem seu estado)
function glowMat(off, on) { const m = new THREE.MeshBasicMaterial({ color: off }); m.userData = { off: new THREE.Color(off), on: new THREE.Color(on) }; return m; }

export function buildPlate(styleId, n = 1) {
  const g = new THREE.Group(), keys = [];
  n = Math.max(1, Math.min(4, n | 0));
  const add = (geom, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.castShadow = false; g.add(o); return o; };
  const s = [...SWITCH_STYLES, ...PLUG_STYLES].find(x => x.id === styleId) || SWITCH_STYLES[0];
  let body;
  if (styleId === 'vidro' || styleId === 'vidro-branco') {
    const dark = styleId === 'vidro';
    const W = 0.13, H = 0.13, D = 0.011;
    add(geo('frameV', () => new RoundedBoxGeometry(W + 0.006, H + 0.006, 0.006, 4, 0.012)), std(dark ? '#2a2b2e' : '#d8d8d6', 0.35, dark ? 0.6 : 0), 0, 0, WALL_Z + 0.003);
    body = add(geo('glassV', () => new RoundedBoxGeometry(W, H, D, 4, 0.01)), glass(dark ? '#0c0d0f' : '#f6f6f4'), 0, 0, WALL_Z + 0.004 + D / 2);
    const zf = WALL_Z + 0.004 + D + 0.0006, gap = W / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + gap * (i + 0.5), r = Math.min(0.022, gap * 0.28);
      const ringM = glowMat(dark ? '#3b3d42' : '#c9c9c6', dark ? '#ffe2a6' : '#3d9bff');
      add(new THREE.RingGeometry(r * 0.78, r, 40), ringM, x, 0.005, zf);
      const dotM = glowMat(dark ? '#1a1b1e' : '#e7e7e4', dark ? '#fff2d2' : '#9fd0ff');
      add(geo('dot', () => new THREE.CircleGeometry(0.0035, 16)), dotM, x, 0.005, zf);
      keys.push({ mats: [ringM, dotM], v: 0 });
    }
    if (n > 1) for (let i = 1; i < n; i++) add(geo('sepV', () => new THREE.PlaneGeometry(0.0008, H * 0.6)), std(dark ? '#26272a' : '#dcdcd9'), -W / 2 + gap * i, 0, zf);
  } else if (styleId === 'classico') {
    const W = 0.082, H = 0.13;
    body = add(geo('plateC', () => new RoundedBoxGeometry(W, H, 0.009, 3, 0.004)), std('#efefec', 0.55), 0, 0, WALL_Z + 0.0045);
    add(geo('modC', () => new RoundedBoxGeometry(0.052, 0.078, 0.004, 2, 0.002)), std('#e2e2df', 0.6), 0, 0, WALL_Z + 0.009);
    const kw = 0.048 / n;
    for (let i = 0; i < n; i++) {
      const x = -0.024 + kw * (i + 0.5);
      const piv = new THREE.Group(); piv.position.set(x, 0, WALL_Z + 0.012); g.add(piv);
      const key = new THREE.Mesh(new RoundedBoxGeometry(kw - 0.003, 0.072, 0.008, 2, 0.002), std('#f7f7f4', 0.4)); key.position.z = 0.002; piv.add(key);
      const ledM = glowMat('#cfcfcb', '#ff9a2a');
      const led = new THREE.Mesh(geo('ledC', () => new THREE.CircleGeometry(0.0022, 12)), ledM); led.position.set(0, 0.026, 0.0063); piv.add(led);
      keys.push({ mats: [ledM], v: 0, tilt: piv, amp: 0.13 });
    }
  } else if (styleId === 'minimal') {
    const W = 0.07, H = 0.12;
    body = add(geo('plateM', () => new RoundedBoxGeometry(W, H, 0.007, 3, 0.003)), std('#3a3b3e', 0.32, 0.55), 0, 0, WALL_Z + 0.0035);
    const kh = (H - 0.016) / n;
    for (let i = 0; i < n; i++) {
      const y = H / 2 - 0.008 - kh * (i + 0.5);
      add(new RoundedBoxGeometry(W - 0.012, kh - 0.003, 0.003, 2, 0.0012), std('#45464a', 0.28, 0.6), 0, y, WALL_Z + 0.0085);
      const ledM = glowMat('#2c2d30', '#ffd9a0');
      add(geo('lineM', () => new THREE.PlaneGeometry(0.022, 0.0016)), ledM, 0, y - kh * 0.32, WALL_Z + 0.0102);
      keys.push({ mats: [ledM], v: 0 });
    }
  } else if (styleId === 'redondo') {
    const R = 0.062;
    body = add(geo('plateR', () => { const c = new THREE.CylinderGeometry(R, R, 0.01, 64); c.rotateX(Math.PI / 2); return c; }), std('#ebe8e3', 0.6), 0, 0, WALL_Z + 0.005);
    add(geo('rimR', () => new THREE.TorusGeometry(R, 0.0025, 10, 64)), std('#d9d5cf', 0.5), 0, 0, WALL_Z + 0.009);
    const pos = n === 1 ? [[0, 0]] : n === 2 ? [[-0.021, 0], [0.021, 0]] : n === 3 ? [[-0.026, -0.01], [0, 0.018], [0.026, -0.01]] : [[-0.02, 0.02], [0.02, 0.02], [-0.02, -0.02], [0.02, -0.02]];
    const r = n === 1 ? 0.026 : n === 2 ? 0.017 : 0.014;
    for (const [x, y] of pos) {
      const btn = add(new THREE.CylinderGeometry(r, r * 1.04, 0.006, 40).rotateX(Math.PI / 2), std('#f6f4f0', 0.42), x, y, WALL_Z + 0.013);
      const ringM = glowMat('#dcd8d2', '#ffb84d');
      add(new THREE.RingGeometry(r * 1.06, r * 1.22, 40), ringM, x, y, WALL_Z + 0.0102);
      keys.push({ mats: [ringM], v: 0, push: btn, z0: WALL_Z + 0.013 });
    }
  } else if (styleId === 'retro') {
    const R = 0.058;
    const brass = std('#c9a35a', 0.32, 0.85);
    body = add(geo('plateRt', () => { const c = new THREE.CylinderGeometry(R, R * 1.04, 0.008, 64); c.rotateX(Math.PI / 2); return c; }), brass, 0, 0, WALL_Z + 0.004);
    for (const a of [Math.PI / 2, -Math.PI / 2]) add(geo('screw', () => new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 16).rotateX(Math.PI / 2)), std('#8c6a32', 0.35, 0.9), Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, WALL_Z + 0.009);
    const sp = n === 1 ? [0] : Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * (0.07 / n));
    for (const x of sp) {
      add(geo('bossRt', () => new THREE.CylinderGeometry(0.008, 0.009, 0.006, 24).rotateX(Math.PI / 2)), std('#e8e0cc', 0.4), x, 0, WALL_Z + 0.011);
      const piv = new THREE.Group(); piv.position.set(x, 0, WALL_Z + 0.013); g.add(piv);
      piv.rotation.x = Math.PI * 2 / 3;
      const lev = new THREE.Mesh(geo('lever', () => { const c = new THREE.CylinderGeometry(0.0028, 0.0042, 0.03, 16); c.translate(0, 0.015, 0); return c; }), std('#f2ecdc', 0.3)); piv.add(lev);
      const tipM = glowMat('#e6dcc4', '#ffcf70');
      const tip = new THREE.Mesh(geo('tip', () => new THREE.SphereGeometry(0.0045, 16, 12)), tipM); tip.position.y = 0.03; piv.add(tip);
      keys.push({ mats: [tipM], v: 0, lever: piv });
    }
  } else { // tomada padrão brasileiro
    const dark = styleId === 'tomada-preta';
    const W = 0.082, H = 0.13;
    body = add(geo('plateC', () => new RoundedBoxGeometry(W, H, 0.009, 3, 0.004)), std(dark ? '#1d1e20' : '#efefec', dark ? 0.35 : 0.55, dark ? 0.3 : 0), 0, 0, WALL_Z + 0.0045);
    add(geo('sockT', () => new THREE.CylinderGeometry(0.019, 0.019, 0.006, 48).rotateX(Math.PI / 2)), std(dark ? '#141517' : '#e4e4e1', 0.6), 0, 0, WALL_Z + 0.0085);
    const hole = std('#0a0a0a', 0.9);
    for (const [x, y] of [[-0.0085, -0.004], [0.0085, -0.004], [0, 0.0085]]) add(geo('hole', () => new THREE.CircleGeometry(0.0023, 16)), hole, x, y, WALL_Z + 0.0116);
    const ledM = glowMat(dark ? '#2a2b2d' : '#d4d4d0', '#57d17a');
    add(geo('ledT', () => new THREE.CircleGeometry(0.0022, 12)), ledM, 0, 0.042, WALL_Z + 0.0092);
    keys.push({ mats: [ledM], v: 0 });
  }
  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return { g, keys, body, style: s.id };
}

// anima as teclas até o estado de cada canal (chamado a cada quadro)
export function animatePlate(keys, states, dt) {
  const k = Math.min(1, dt * 9);
  keys.forEach((key, i) => {
    const tgt = states[i] ?? states[0] ? 1 : 0;
    if (Math.abs(tgt - key.v) < 0.001) return;
    key.v += (tgt - key.v) * k;
    for (const m of key.mats) m.color.copy(m.userData.off).lerp(m.userData.on, key.v);
    if (key.tilt) key.tilt.rotation.x = (key.v - 0.5) * 2 * key.amp * -1; // basculante: parte de cima entra quando liga
    if (key.lever) key.lever.rotation.x = Math.PI / 3 * (2 - key.v); // alavanca saindo da placa: inclinada para cima ligada, para baixo desligada
    if (key.push) key.push.position.z = key.z0 - 0.002 * key.v;
  });
  return keys.some((key, i) => Math.abs((states[i] ?? states[0] ? 1 : 0) - key.v) > 0.002);
}
