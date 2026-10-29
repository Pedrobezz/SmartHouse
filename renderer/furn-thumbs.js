// Miniaturas 3D dos móveis para a lista da Planta: cada modelo é renderizado uma vez (fora da tela) e guardado.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildFurniture, byType, setFurnStyle, getFurnStyle, setFurnScale, getFurnScale } from './furniture.js';
import { buildLamp, lampType } from './lamps.js';

const W = 192, H = 128, cache = new Map(); // a versão do desenho entra na chave (miniaturas novas a cada mudança de modelo)
let R = null, scene = null, cam = null, shadow = null, idleT = null;

function setup() {
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1); R.setSize(W, H, false);
  R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = 1.05;
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5; // reflexo nos metais
  scene.add(new THREE.HemisphereLight('#fff6ea', '#9c8a78', 1.25));
  const sun = new THREE.DirectionalLight('#fff3e3', 2.0); sun.position.set(-2, 4, 3); scene.add(sun);
  const fill = new THREE.DirectionalLight('#dfe8f5', 0.55); fill.position.set(3, 2, -2); scene.add(fill);
  cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 60);
  // sombra suave de contato embaixo do móvel
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'), gr = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(60,40,25,0.42)'); gr.addColorStop(1, 'rgba(60,40,25,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
}
// libera a placa de vídeo depois de um tempo sem uso
function release() { clearTimeout(idleT); idleT = setTimeout(() => { R?.dispose(); R?.forceContextLoss(); R = null; }, 8000); }

export function furnThumb(type, style = 'maquete') {
  const key = type + ':' + style;
  if (cache.has(key)) return cache.get(key);
  const cat = byType(type); if (!cat) return '';
  if (!R) setup();
  const prev = getFurnStyle(), prevS = getFurnScale(); setFurnStyle(style); setFurnScale(1); // miniatura: escala real
  const g = buildFurniture({ type, w: cat.w, d: cat.d, rot: 0, color: cat.color });
  setFurnStyle(prev); setFurnScale(prevS);
  scene.add(g);
  const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  shadow.scale.set(size.x * 1.5 + 0.2, size.z * 1.5 + 0.2, 1); shadow.position.set(ctr.x, 0.001, ctr.z);
  const r = Math.max(size.length() / 2, 0.25), dir = new THREE.Vector3(0.95, 0.85, 1.35).normalize();
  const dist = r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 0.92;
  cam.position.copy(ctr).addScaledVector(dir, dist); cam.lookAt(ctr); cam.near = dist / 20; cam.far = dist * 4; cam.updateProjectionMatrix();
  R.render(scene, cam);
  const url = R.domElement.toDataURL('image/png');
  scene.remove(g); g.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
  cache.set(key, url); release();
  return url;
}
// miniatura de luminária: acesa, sem o brilho no piso e sem os fachos (que aumentariam o enquadramento)
export function lampThumb(type) {
  const key = 'lamp:' + type;
  if (cache.has(key)) return cache.get(key);
  if (!R) setup();
  const t = lampType(type), H = 2.6, ceil = t.mount === 'ceiling';
  const b = buildLamp({ type, temp: 'quente', ...(t.w ? { w: t.w } : {}), ...(t.mount === 'table' ? { z: 0 } : {}) }, { H, vs: 1, wall: null });
  b.pool.visible = false; for (const x of b.beams) x.m.visible = false;
  for (const m of b.bulbs) m.emissiveIntensity = 2.2; for (const m of b.glowMats) m.emissiveIntensity = 0.55;
  const g = b.g; scene.add(g); g.updateMatrixWorld(true);
  const box = new THREE.Box3(); g.traverse(o => { if (o.isMesh && o.visible && !o.userData.cable) box.expandByObject(o); }); // o fio até o teto fica fora do enquadramento
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  shadow.visible = !ceil; shadow.scale.set(size.x * 1.5 + 0.2, size.z * 1.5 + 0.2, 1); shadow.position.set(ctr.x, 0.001, ctr.z);
  const r = Math.max(size.length() / 2, 0.15), dir = new THREE.Vector3(0.95, ceil ? -0.55 : 0.75, 1.35).normalize(); // luminária de teto: vista de baixo, como quem olha para cima
  const dist = r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * (ceil ? 0.95 : 1.12); // folga para a cúpula não cortar
  cam.position.copy(ctr).addScaledVector(dir, dist); cam.lookAt(ctr); cam.near = dist / 20; cam.far = dist * 4; cam.updateProjectionMatrix();
  R.render(scene, cam);
  const url = R.domElement.toDataURL('image/png');
  scene.remove(g); g.traverse(o => o.geometry?.dispose()); shadow.visible = true;
  cache.set(key, url); release();
  return url;
}
// preenche as <img data-thumb> / <img data-lthumb> aos poucos, sem travar a tela
export function fillThumbs(root, style) {
  const imgs = [...root.querySelectorAll('img[data-thumb], img[data-lthumb]')];
  const step = () => {
    const t0 = performance.now();
    while (imgs.length && performance.now() - t0 < 24) { const im = imgs.shift(); if (im.isConnected) im.src = im.dataset.lthumb ? lampThumb(im.dataset.lthumb) : furnThumb(im.dataset.thumb, style); }
    if (imgs.length) requestAnimationFrame(step);
  };
  step();
}
