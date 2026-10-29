// Luminárias da casa: cada uma fica no lugar real da planta e acende junto com a tecla do interruptor ligada a ela
import * as THREE from 'three';

export const LAMPS = [
  { type: 'plafon', name: 'Plafon', mount: 'ceiling', R: 1.9, hint: 'Luz de teto redonda' },
  { type: 'pendente', name: 'Pendente', mount: 'ceiling', R: 1.3, hint: 'Pendurado (mesa, bancada)' },
  { type: 'spot', name: 'Spot embutido', mount: 'ceiling', R: 0.75, hint: 'Facho para baixo' },
  { type: 'trilho', name: 'Trilho de spots', mount: 'ceiling', R: 1.2, w: 1.2, hint: 'Barra com 3 spots' },
  { type: 'lustre', name: 'Lustre', mount: 'ceiling', R: 2.1, hint: 'Vários braços' },
  { type: 'fita', name: 'Fita LED', mount: 'ceiling', R: 1.0, w: 2.0, hint: 'Sanca ou embaixo do armário' },
  { type: 'arandela', name: 'Arandela', mount: 'wall', R: 0.9, hint: 'Na parede, luz para cima e para baixo' },
  { type: 'coluna', name: 'Luminária de chão', mount: 'floor', R: 1.2, hint: 'Coluna ao lado do sofá' },
  { type: 'abajur', name: 'Abajur', mount: 'table', R: 0.9, hint: 'Em cima de mesa ou criado' },
  { type: 'globo', name: 'Pendente globo', mount: 'ceiling', R: 1.3, hint: 'Esfera de vidro pendurada' },
  { type: 'trio', name: 'Trio de pendentes', mount: 'ceiling', R: 1.4, w: 1.2, hint: 'Três pendentes em linha (bancada, mesa)' },
  { type: 'painel', name: 'Painel LED', mount: 'ceiling', R: 1.8, hint: 'Quadrado, embutido no forro' },
  { type: 'ventilador', name: 'Ventilador de teto', mount: 'ceiling', R: 1.8, hint: 'Com luz no centro' },
  { type: 'arco', name: 'Luminária de arco', mount: 'floor', R: 1.3, hint: 'O arco leva a luz por cima do sofá' },
  { type: 'tripe', name: 'Luminária tripé', mount: 'floor', R: 1.2, hint: 'Tripé de madeira com cúpula' },
  { type: 'mesa', name: 'Luminária de mesa', mount: 'table', R: 0.8, hint: 'Articulada, para escrivaninha' },
  { type: 'balizador', name: 'Balizador', mount: 'wall', R: 0.6, hint: 'Luz baixa na parede (corredor, escada)' },
];
export const lampType = t => LAMPS.find(l => l.type === t) || LAMPS[0];
export const TEMPS = [['quente', 'Quente', '#ffb066'], ['neutra', 'Neutra', '#ffe0b5'], ['fria', 'Fria', '#dfeaff']];
export const tempColor = t => (TEMPS.find(x => x[0] === t) || TEMPS[0])[2];

// a lâmpada está acesa? (aparelho inteiro ou uma tecla específica do interruptor)
export function lampOn(l, devices) {
  if (!l.link?.dev) return false;
  const d = devices.find(x => x.id === l.link.dev);
  if (!d || d.online === false) return false;
  if (l.link.ch && d.state?.channels?.length) return !!d.state.channels.find(c => c.code === l.link.ch)?.on;
  return !!d.state?.on;
}

// ---------------- 3D ----------------
let poolTex = null;
function poolTexture() {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(0.7, 'rgba(255,255,255,.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  poolTex = new THREE.CanvasTexture(c); poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}
const M = {
  dark: () => new THREE.MeshStandardMaterial({ color: '#2a2a2c', roughness: 0.45, metalness: 0.6 }),
  white: () => new THREE.MeshStandardMaterial({ color: '#f1f1f1', roughness: 0.5 }),
  brass: () => new THREE.MeshStandardMaterial({ color: '#b8925a', roughness: 0.35, metalness: 0.85 }),
  fabric: () => new THREE.MeshStandardMaterial({ color: '#efe6d6', roughness: 0.9, side: THREE.DoubleSide, emissive: '#000' }),
  bulb: () => new THREE.MeshStandardMaterial({ color: '#fff8ee', roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0 }),
};
const add = (g, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = true; g.add(m); return m; };
// peça torneada a partir de um perfil (x = raio, y = altura), com curva suave
const lathe = (pts, seg = 40) => new THREE.LatheGeometry(new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(32), seg);
const wood = () => new THREE.MeshStandardMaterial({ color: '#8b5a3c', roughness: 0.6 });
function beamMesh(r, h, color) {
  const geo = new THREE.ConeGeometry(r, h, 40, 1, true); geo.translate(0, -h / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat); m.raycast = () => {}; return m;
}

/**
 * Monta a luminária. H = altura das paredes na maquete, vs = escala vertical (H / pé-direito real).
 * wall = parede mais próxima (para arandela). Devolve { g, bulbs, glowMats, beams, poolPos, poolSize, lightPos }
 */
export function buildLamp(l, { H, vs, wall }) {
  const t = lampType(l.type), color = new THREE.Color(tempColor(l.temp));
  const g = new THREE.Group(), bulbs = [], glowMats = [], beams = [];
  const bulb = (geo, x, y, z) => { const m = M.bulb(); m.emissive.copy(color); bulbs.push(m); return add(g, geo, m, x, y, z); };
  let lightY = H * 0.8, lightX = 0, poolSize = [t.R * 2, t.R * 2], poolOff = [0, 0], rotY = -(l.rot || 0) * Math.PI / 180;
  const cable = (y0, y1) => { const c = add(g, new THREE.CylinderGeometry(0.006, 0.006, y1 - y0, 6), M.dark(), 0, (y0 + y1) / 2, 0); c.userData.cable = true; return c; };

  switch (l.type) {
    case 'pendente': {
      const y = Math.max(H * 0.45, 1.7 * vs);
      cable(y + 0.08, H);
      add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20), M.dark(), 0, H - 0.006, 0);
      const shade = add(g, new THREE.CylinderGeometry(0.05, 0.19, 0.17, 40, 1, true), Object.assign(M.dark(), { side: THREE.DoubleSide }), 0, y, 0);
      shade.castShadow = true;
      const inner = add(g, new THREE.CylinderGeometry(0.049, 0.187, 0.168, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#d8d3c8', roughness: 0.6, side: THREE.BackSide, emissive: color, emissiveIntensity: 0 }), 0, y, 0);
      glowMats.push(inner.material);
      bulb(new THREE.SphereGeometry(0.045, 20, 14), 0, y - 0.05, 0);
      lightY = y - 0.12; break;
    }
    case 'plafon': {
      const body = add(g, new THREE.CylinderGeometry(0.23, 0.23, 0.025, 48), Object.assign(M.white(), { emissive: color.clone(), emissiveIntensity: 0 }), 0, H - 0.0125, 0); glowMats.push(body.material);
      bulb(new THREE.CylinderGeometry(0.21, 0.2, 0.03, 48), 0, H - 0.04, 0);
      lightY = H - 0.25; break;
    }
    case 'spot': {
      add(g, new THREE.TorusGeometry(0.055, 0.012, 10, 32).rotateX(Math.PI / 2), M.white(), 0, H - 0.004, 0);
      bulb(new THREE.CircleGeometry(0.045, 24).rotateX(Math.PI / 2), 0, H - 0.006, 0);
      const b = beamMesh(t.R * 0.62, H - 0.01, color); b.position.y = H - 0.01; g.add(b); beams.push({ m: b, max: 0.075 });
      lightY = H - 0.08; break;
    }
    case 'trilho': {
      const w = l.w || t.w;
      add(g, new THREE.BoxGeometry(w, 0.035, 0.05), M.dark(), 0, H - 0.0175, 0);
      for (const k of [-0.36, 0, 0.36]) {
        const x = k * w;
        add(g, new THREE.CylinderGeometry(0.04, 0.045, 0.12, 20), M.dark(), x, H - 0.1, 0);
        bulb(new THREE.CircleGeometry(0.035, 20).rotateX(Math.PI / 2), x, H - 0.161, 0);
        const b = beamMesh(0.42, H - 0.16, color); b.position.set(x, H - 0.16, 0); g.add(b); beams.push({ m: b, max: 0.05 });
      }
      poolSize = [w + 1.4, 1.6]; lightY = H - 0.3; break;
    }
    case 'lustre': {
      const y = Math.max(H * 0.55, 2.05 * vs);
      cable(y, H);
      add(g, new THREE.TorusGeometry(0.24, 0.012, 10, 48).rotateX(Math.PI / 2), M.brass(), 0, y, 0);
      add(g, new THREE.SphereGeometry(0.035, 16, 10), M.brass(), 0, y, 0);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, x = Math.cos(a) * 0.24, z = Math.sin(a) * 0.24;
        add(g, new THREE.CylinderGeometry(0.018, 0.018, 0.04, 10), M.brass(), x, y + 0.03, z);
        bulb(new THREE.SphereGeometry(0.03, 14, 10), x, y + 0.08, z);
      }
      lightY = y; break;
    }
    case 'fita': {
      const w = l.w || t.w;
      add(g, new THREE.BoxGeometry(w, 0.03, 0.05), M.white(), 0, H - 0.02, 0.025);
      bulb(new THREE.BoxGeometry(w, 0.012, 0.02), 0, H - 0.04, 0.02);
      poolSize = [w + 1.0, 1.5]; lightY = H - 0.15; break;
    }
    case 'arandela': {
      const y = 1.8 * vs;
      add(g, new THREE.BoxGeometry(0.06, 0.12, 0.012), M.brass(), 0, y, 0.006);                                     // placa de fixação
      const sh = add(g, new THREE.CylinderGeometry(0.075, 0.075, 0.17, 40, 1, true, -Math.PI / 2, Math.PI), Object.assign(M.fabric(), {}), 0, y, 0.012); // cúpula de meia-lua
      sh.material.emissive.copy(color); glowMats.push(sh.material);
      bulb(new THREE.BoxGeometry(0.1, 0.006, 0.05), 0, y + 0.087, 0.03);
      bulb(new THREE.BoxGeometry(0.1, 0.006, 0.05), 0, y - 0.087, 0.03);
      const up = beamMesh(0.26, Math.max(0.05, H - y - 0.09), color); up.rotation.x = Math.PI; up.position.set(0, y + 0.09, 0.04); g.add(up); beams.push({ m: up, max: 0.09 });
      const dn = beamMesh(0.3, y - 0.09, color); dn.position.set(0, y - 0.09, 0.04); g.add(dn); beams.push({ m: dn, max: 0.07 });
      poolSize = [1.6, 1.2]; poolOff = [0, 0.45]; lightY = y; break;
    }
    case 'coluna': {
      const top = 1.55 * vs;
      add(g, new THREE.CylinderGeometry(0.13, 0.14, 0.025, 32), M.dark(), 0, 0.0125, 0);
      add(g, new THREE.CylinderGeometry(0.012, 0.012, top, 8), M.dark(), 0, top / 2, 0);
      const shade = add(g, new THREE.CylinderGeometry(0.14, 0.18, 0.24, 40, 1, true), M.fabric(), 0, top, 0); shade.castShadow = true;
      shade.material.emissive.copy(color); glowMats.push(shade.material);
      bulb(new THREE.SphereGeometry(0.04, 16, 10), 0, top - 0.02, 0);
      lightY = top - 0.05; break;
    }
    case 'globo': { // esfera de vidro leitosa pendurada
      const y = Math.max(H * 0.5, 1.95 * vs); cable(y + 0.13, H);
      add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.012, 24), M.white(), 0, H - 0.006, 0);
      add(g, new THREE.CylinderGeometry(0.025, 0.03, 0.04, 24), M.brass(), 0, y + 0.13, 0);
      const glass = add(g, new THREE.SphereGeometry(0.13, 32, 20), new THREE.MeshStandardMaterial({ color: '#f6f1e8', roughness: 0.25, transparent: true, opacity: 0.85, emissive: color, emissiveIntensity: 0 }), 0, y, 0);
      glowMats.push(glass.material); bulb(new THREE.SphereGeometry(0.035, 16, 10), 0, y, 0);
      lightY = y; break;
    }
    case 'trio': { // três pendentes cônicos numa barra
      const w = l.w || t.w, y = Math.max(H * 0.5, 1.85 * vs);
      add(g, new THREE.BoxGeometry(w, 0.025, 0.06), M.dark(), 0, H - 0.0125, 0);
      for (const k of [-0.38, 0, 0.38]) {
        const x = k * w;
        add(g, new THREE.CylinderGeometry(0.004, 0.004, H - y - 0.1, 6), M.dark(), x, (H + y + 0.1) / 2, 0).userData.cable = true;
        const sh = add(g, new THREE.CylinderGeometry(0.03, 0.12, 0.16, 32, 1, true), Object.assign(M.dark(), { side: THREE.DoubleSide }), x, y, 0); sh.castShadow = true;
        const inner = add(g, new THREE.CylinderGeometry(0.029, 0.118, 0.158, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#e9dfcf', roughness: 0.6, side: THREE.BackSide, emissive: color, emissiveIntensity: 0 }), x, y, 0);
        glowMats.push(inner.material); bulb(new THREE.SphereGeometry(0.03, 14, 10), x, y - 0.05, 0);
      }
      poolSize = [w + 1.4, 1.5]; lightY = y - 0.1; break;
    }
    case 'painel': { // painel LED quadrado embutido
      add(g, new THREE.BoxGeometry(0.62, 0.02, 0.62), M.white(), 0, H - 0.01, 0);
      bulb(new THREE.BoxGeometry(0.56, 0.012, 0.56), 0, H - 0.022, 0);
      lightY = H - 0.3; break;
    }
    case 'ventilador': { // ventilador de teto com globo de luz
      const y = Math.max(H - 0.42, H * 0.82);
      add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.03, 24), M.white(), 0, H - 0.015, 0);
      add(g, new THREE.CylinderGeometry(0.012, 0.012, H - y, 10), M.white(), 0, (H + y) / 2, 0).userData.cable = true;
      add(g, lathe([[0, 0], [0.1, 0], [0.12, 0.03], [0.11, 0.07], [0.04, 0.1], [0, 0.1]]), M.white(), 0, y - 0.05, 0);
      const blades = new THREE.Group(); blades.position.y = y; g.add(blades);
      for (let i = 0; i < 4; i++) {
        const b = add(blades, new THREE.BoxGeometry(0.62, 0.012, 0.13), wood(), 0, 0, 0); b.geometry.translate(0.42, 0, 0);
        b.rotation.set(0, i * Math.PI / 2, 0.08); b.castShadow = true;
      }
      const dome = add(g, new THREE.SphereGeometry(0.1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f6f1e8', roughness: 0.3, transparent: true, opacity: 0.9, emissive: color, emissiveIntensity: 0, side: THREE.DoubleSide }), 0, y - 0.06, 0);
      glowMats.push(dome.material); bulb(new THREE.SphereGeometry(0.035, 14, 10), 0, y - 0.09, 0);
      lightY = y - 0.15; break;
    }
    case 'arco': { // base de pedra, arco de metal e cúpula pendurada à frente
      add(g, new THREE.BoxGeometry(0.3, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: '#e9e5de', roughness: 0.35 }), 0, 0.06, 0);
      const reach = 1.15, top = Math.min(2.15 * vs, H - 0.15), hang = top - 0.3;
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0.05, top + 0.45, 0), new THREE.Vector3(reach, top, 0));
      add(g, new THREE.TubeGeometry(curve, 48, 0.012, 8), M.dark(), 0, 0, 0);
      add(g, new THREE.CylinderGeometry(0.006, 0.006, top - hang, 6), M.dark(), reach, (top + hang) / 2, 0);
      const sh = add(g, new THREE.SphereGeometry(0.2, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), Object.assign(M.dark(), { side: THREE.DoubleSide }), reach, hang - 0.12, 0); sh.castShadow = true;
      const inner = add(g, new THREE.SphereGeometry(0.195, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e9dfcf', roughness: 0.6, side: THREE.BackSide, emissive: color, emissiveIntensity: 0 }), reach, hang - 0.12, 0);
      glowMats.push(inner.material); bulb(new THREE.SphereGeometry(0.04, 14, 10), reach, hang - 0.06, 0);
      poolOff = [reach, 0]; lightX = reach; lightY = hang - 0.15; break;
    }
    case 'tripe': { // tripé de madeira com cúpula de tecido
      const top = 1.45 * vs;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2 + 0.3, geo = new THREE.CylinderGeometry(0.012, 0.016, top, 10); geo.translate(0, top / 2, 0);
        const leg = add(g, geo, wood(), Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17); leg.lookAt(0, top * 2.6, 0); leg.rotateX(Math.PI / 2);
      }
      const sh = add(g, new THREE.CylinderGeometry(0.17, 0.2, 0.26, 40, 1, true), M.fabric(), 0, top + 0.06, 0); sh.castShadow = true;
      sh.material.emissive.copy(color); glowMats.push(sh.material);
      bulb(new THREE.SphereGeometry(0.04, 16, 10), 0, top + 0.02, 0);
      lightY = top; break;
    }
    case 'mesa': { // luminária articulada de escrivaninha
      const base = (l.z ?? 0.75) * vs, m = new THREE.MeshStandardMaterial({ color: '#2f6fb0', roughness: 0.4 });
      add(g, new THREE.CylinderGeometry(0.075, 0.08, 0.02, 32), m, 0, base + 0.01, 0);
      const a1 = add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.32, 10), M.dark(), 0.05, base + 0.16, 0); a1.rotation.z = -0.32;
      add(g, new THREE.SphereGeometry(0.014, 12, 8), M.dark(), 0.1, base + 0.31, 0);
      const a2 = add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.28, 10), M.dark(), -0.02, base + 0.37, 0); a2.rotation.z = 1.05;
      const head = add(g, new THREE.CylinderGeometry(0.03, 0.075, 0.12, 32, 1, true), Object.assign(m.clone(), { side: THREE.DoubleSide }), -0.14, base + 0.4, 0); head.rotation.z = 0.5;
      const inner = add(g, new THREE.CylinderGeometry(0.029, 0.073, 0.118, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#efe8dc', roughness: 0.6, side: THREE.BackSide, emissive: color, emissiveIntensity: 0 }), -0.14, base + 0.4, 0); inner.rotation.z = 0.5;
      glowMats.push(inner.material); bulb(new THREE.SphereGeometry(0.025, 12, 8), -0.16, base + 0.37, 0);
      if (base > 0.03) add(g, new THREE.CylinderGeometry(0.004, 0.004, base, 6), new THREE.MeshBasicMaterial({ color: '#555' }), 0, base / 2, 0);
      poolSize = [1.1, 1.1]; poolOff = [-0.25, 0]; lightX = -0.2; lightY = base + 0.3; break;
    }
    case 'balizador': { // luz baixa embutida na parede, para o chão
      const y = 0.35 * vs;
      add(g, new THREE.BoxGeometry(0.12, 0.08, 0.02), M.white(), 0, y, 0.01);
      add(g, new THREE.BoxGeometry(0.1, 0.012, 0.04), M.white(), 0, y + 0.02, 0.03);
      bulb(new THREE.BoxGeometry(0.09, 0.006, 0.03), 0, y + 0.012, 0.032);
      poolSize = [0.9, 0.7]; poolOff = [0, 0.35]; lightY = y; break;
    }
    case 'abajur': default: {
      const base = (l.z ?? 0.55) * vs;
      add(g, lathe([[0, 0], [0.06, 0], [0.075, 0.03], [0.08, 0.07], [0.06, 0.11], [0.03, 0.13], [0.022, 0.135]]), new THREE.MeshStandardMaterial({ color: '#d9cbb8', roughness: 0.35 }), 0, base, 0);
      add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8), M.brass(), 0, base + 0.17, 0);
      const shade = add(g, new THREE.CylinderGeometry(0.095, 0.13, 0.15, 36, 1, true), M.fabric(), 0, base + 0.25, 0); shade.castShadow = true;
      shade.material.emissive.copy(color); glowMats.push(shade.material);
      bulb(new THREE.SphereGeometry(0.035, 14, 10), 0, base + 0.22, 0);
      if (base > 0.03) { // haste até o chão quando não há móvel embaixo, para não "flutuar" visualmente
        add(g, new THREE.CylinderGeometry(0.004, 0.004, base, 6), new THREE.MeshBasicMaterial({ color: '#555' }), 0, base / 2, 0);
      }
      lightY = base + 0.24; break;
    }
  }
  g.rotation.y = rotY;
  if (t.mount === 'wall' && wall) g.rotation.y = Math.atan2(wall.nx, wall.ny);
  // brilho no piso
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(poolSize[0], poolSize[1]), new THREE.MeshBasicMaterial({ map: poolTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(poolOff[0], 0.014, poolOff[1]); pool.raycast = () => {};
  g.add(pool);
  // a luz "de verdade" fica mais baixa que a luminária: no alto ela estouraria o topo das paredes da maquete
  const ly = t.mount === 'ceiling' ? Math.min(lightY, H * 0.5) : lightY;
  return { g, bulbs, glowMats, beams, pool, color, lightPos: new THREE.Vector3(lightX, ly, t.mount === 'wall' ? 0.35 : 0), R: t.R };
}

// ---------------- 2D (planta) ----------------
// desenha centrado em (0,0), já transladado; s = pixels por metro
export function drawLamp2D(ctx, l, s, { sel, on, T, missing }) {
  const t = lampType(l.type), amber = '#ffb84d';
  ctx.save();
  ctx.rotate((l.rot || 0) * Math.PI / 180);
  const stroke = sel ? T.accent : amber;
  ctx.strokeStyle = stroke; ctx.fillStyle = on ? 'rgba(255,184,77,.35)' : 'rgba(255,184,77,.12)';
  ctx.lineWidth = sel ? 2.5 : 1.6;
  const circleX = r => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); const k = r * 0.7; ctx.beginPath(); ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(k, -k); ctx.lineTo(-k, k); ctx.stroke(); };
  const r = m => Math.max(5, m * s);
  switch (l.type) {
    case 'plafon': circleX(r(0.23)); break;
    case 'pendente': circleX(r(0.19)); ctx.beginPath(); ctx.arc(0, 0, r(0.19) * 0.35, 0, Math.PI * 2); ctx.fillStyle = stroke; ctx.fill(); break;
    case 'spot': ctx.beginPath(); ctx.arc(0, 0, r(0.07), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r(0.07) * 0.4, 0, Math.PI * 2); ctx.fillStyle = stroke; ctx.fill(); break;
    case 'lustre': circleX(r(0.26)); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r(0.26), Math.sin(a) * r(0.26), 2.5, 0, Math.PI * 2); ctx.fillStyle = stroke; ctx.fill(); } break;
    case 'trilho': case 'fita': {
      const w = (l.w || t.w) * s;
      ctx.lineWidth = l.type === 'fita' ? Math.max(3, 0.04 * s) : Math.max(3, 0.05 * s);
      if (l.type === 'fita') ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke(); ctx.setLineDash([]);
      if (l.type === 'trilho') for (const k of [-0.36, 0, 0.36]) { ctx.beginPath(); ctx.arc(k * w, 0, Math.max(3.5, 0.045 * s), 0, Math.PI * 2); ctx.fillStyle = stroke; ctx.fill(); }
      if (sel) { ctx.lineWidth = 1; ctx.strokeStyle = T.accent; ctx.strokeRect(-w / 2 - 5, -8, w + 10, 16); }
      break;
    }
    case 'arandela': ctx.beginPath(); ctx.arc(0, 0, r(0.1), Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'coluna': ctx.beginPath(); ctx.arc(0, 0, r(0.17), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fillStyle = stroke; ctx.fill(); break;
    default: ctx.beginPath(); ctx.arc(0, 0, r(0.13), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r(0.13) * 0.45, 0, Math.PI * 2); ctx.stroke();
  }
  if (missing ?? !l.link?.dev) { // sem interruptor/tecla: alerta discreto
    ctx.rotate(-(l.rot || 0) * Math.PI / 180);
    ctx.fillStyle = T.orange; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', r(0.2) + 7, -r(0.2) - 4);
  }
  ctx.restore();
}
