// Mapa 3D da casa: paredes, pisos que acendem, aparelhos clicáveis
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SkyDome, WeatherFx, celestial, dirFrom, weatherKind } from './sky.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { buildExterior, buildRoof, buildCeilings, SunBeams } from './extras.js';
import { buildWalls, buildOpenings, nearestWall, bounds, logicalRooms, defaultHeight, defaultFloor, roomAt, toV2, isV2, areaAt, DEF_T } from './geom.js';
const ease3 = x => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
import { buildFurnitureCached as buildFurniture, setFurnStyle, setFurnScale } from './furniture.js';
import { buildLamp, lampOn, lampType } from './lamps.js';
import { buildPlate, animatePlate, defaultStyle } from './switches.js';

const WHITE = new THREE.Color('#ffffff');
const WALL_T = 0.12, REAL_H = 2.6; // pé-direito real usado para escalar alturas
const COLORS = { cool: new THREE.Color('#4fb3ff'), heat: new THREE.Color('#ff8a3d'), warm: new THREE.Color('#ffc46b'), fan: new THREE.Color('#bfe3ff') };

// brilho da lâmpada no piso, recortado pelas paredes (a luz só passa por portas, vãos e janelas)
const MAX_SEGS = 96;
function poolMaterial(map, color, lamp, segU, nSegU) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: map }, col: { value: color }, op: { value: 0 }, lamp: { value: lamp }, segs: segU, nSegs: nSegU },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D map; uniform vec3 col; uniform float op; uniform vec2 lamp; uniform vec4 segs[${MAX_SEGS}]; uniform int nSegs; varying vec2 vUv; varying vec3 vW;
      bool cross2(vec2 p, vec2 q, vec2 a, vec2 b) { vec2 r = q - p, s = b - a; float d = r.x * s.y - r.y * s.x; if (abs(d) < 1e-7) return false;
        vec2 ap = a - p; float t = (ap.x * s.y - ap.y * s.x) / d, u = (ap.x * r.y - ap.y * r.x) / d; return t > 0.0 && t < 1.0 && u >= 0.0 && u <= 1.0; }
      void main() {
        vec4 tx = texture2D(map, vUv); float a = tx.a * op; if (a < 0.002) discard;
        for (int i = 0; i < ${MAX_SEGS}; i++) { if (i >= nSegs) break; if (cross2(lamp, vW.xz, segs[i].xy, segs[i].zw)) discard; }
        gl_FragColor = vec4(col * tx.rgb, a);
      }`,
  });
}

// acabamento final: desfoque de foco (cômodo selecionado), vinheta, grão e correção de cor
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, vignette: { value: 0.32 }, grain: { value: 0.035 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, focusC: { value: new THREE.Vector2(0.5, 0.5) }, focusR: { value: 0.3 }, blur: { value: 0 }, tilt: { value: 0 }, sat: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res, focusC; uniform float time, vignette, grain, focusR, blur, tilt, sat; uniform vec3 tint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 asp = vec2(res.x / res.y, 1.);
      float m = 0.;
      if (blur > 0.) m = smoothstep(focusR, focusR + .35, length((vUv - focusC) * asp)) * blur;
      if (tilt > 0.) m = max(m, smoothstep(.28, .5, abs(vUv.y - .5)) * tilt);
      vec4 c = texture2D(tDiffuse, vUv);
      if (m > .01) {
        vec2 px = m * 3.5 / res; vec4 acc = c; float wsum = 1.;
        for (int i = 0; i < 12; i++) { float a = float(i) * 2.399; float r = sqrt(float(i) + .5) / 3.5; vec2 o = vec2(cos(a), sin(a)) * r * px * 4.; acc += texture2D(tDiffuse, vUv + o); wsum += 1.; }
        c = acc / wsum;
      }
      vec3 col = c.rgb * tint;
      float l = dot(col, vec3(.2126,.7152,.0722)); col = mix(vec3(l), col, sat);
      float v = smoothstep(.95, .25, length((vUv - .5) * vec2(1.15, 1.))); col *= mix(1. - vignette, 1., v);
      col += (hash(vUv * res + time) - .5) * grain;
      gl_FragColor = vec4(col, c.a);
    }`,
};

export class House3D {
  constructor(container, { onDevice, onRoom, onEmpty, overlay }) {
    this.container = container; this.overlay = overlay;
    this.onDevice = onDevice; this.onRoom = onRoom; this.onEmpty = onEmpty;
    this.rooms = new Map(); this.devs = new Map(); this.lamps = [];
    this.selectedRoom = null; this.running = false;
    this.labelMode = 'min'; this._frameN = 0; this._hoverDev = null;

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.82;
    container.appendChild(r.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#050505');
    scene.fog = new THREE.Fog('#050505', 30, 60);
    this.sky = new SkyDome(scene); this.weatherFx = new WeatherFx(scene);
    this.loc = { lat: -23.55, lng: -46.63 }; this.north = 0; this.weather = null; this._celT = -1;
    this.opts = { intro: true, idle: true, idleMin: 2, weather: true, exterior: true, roof: true, tipFor: null, style: 'maquete', wallMode: 'cut' };
    this.simTime = null; this.timelapse = null; this.t2d = 0; this.mode2d = false; this.walk = null; this.camTween = null; this.roofClosed = 0; this.beams = new SunBeams(scene);
    this.walls = []; this.doors = []; this.windows = []; this.tvScreens = []; this._furn = []; this.off = { ox: 0, oz: 0 };
    this.lastInput = performance.now(); this.idle = false; this.focusAmt = 0;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: 1.15, minPolarAngle: 0.15, minDistance: 5, maxDistance: 40, screenSpacePanning: false });

    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;
    this.hemi = new THREE.HemisphereLight('#dfe6ee', '#1a1a1a', 0.55); scene.add(this.hemi);
    this.night = 0; this.nightMode = 'auto'; this.sunTimes = null; this.ripples = [];
    const sun = this.sun = new THREE.DirectionalLight('#fff3e3', 1.9);
    sun.position.set(-8, 16, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.radius = 4; sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
    scene.add(sun, sun.target);
    // sombras só são recalculadas quando algo muda (luz acende, porta mexe, sol anda...): fica leve
    r.shadowMap.autoUpdate = false; this._shadowDirty = 3;
    // conjunto fixo de luzes com sombra: as paredes bloqueiam a luz, que só passa por portas, vãos e janelas
    this.lightPool = [];
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight('#ffffff', 0, 5, 1.5);
      pl.castShadow = true; pl.shadow.mapSize.set(512, 512);
      pl.shadow.camera.near = 0.04; pl.shadow.bias = -0.0025; pl.shadow.normalBias = 0.025;
      pl.position.set(0, -60, 0); pl.userData.key = null;
      scene.add(pl); this.lightPool.push(pl);
    }

    this.groundMat = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 1, envMapIntensity: 0 });
    const ground = this.ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), this.groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true;
    scene.add(ground);
    // estilo maquete: a casa flutua num fundo claro e só a sombra dela aparece no "chão"
    this.shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: '#4a3424', opacity: 0.2 }));
    this.shadowGround.rotation.x = -Math.PI / 2; this.shadowGround.receiveShadow = true; this.shadowGround.raycast = () => {};
    scene.add(this.shadowGround);
    const grid = this.grid = new THREE.GridHelper(80, 80, '#121212', '#0c0c0c'); grid.position.y = -0.005; scene.add(grid);
    this.dayBg = new THREE.Color('#050505'); this.dayGround = new THREE.Color('#050505'); this.theme = 'dark';
    this.slabMat = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.9 });

    this.group = new THREE.Group(); scene.add(this.group);

    // antisserrilhado real (MSAA) + oclusão de ambiente (sombras de contato)
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, this.rt);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.ao = new GTAOPass(scene, this.camera, 1, 1);
    this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 16 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.ao.blendIntensity = 0.9;
    this.composer.addPass(this.ao);
    // os fachos de sol (volumes transparentes) não podem entrar na sombra de contato, senão viram manchas pretas
    const aoRender = this.ao.render.bind(this.ao);
    this.ao.render = (...a) => { // feixes de luz (sol e spots) não entram na sombra de contato, senão aparecem como cones escuros
      const g = this.beams?.group, v = g?.visible; if (g) g.visible = false;
      const lb = []; for (const lp of this.lamps || []) for (const b of lp.beams || []) if (b.m.visible) { b.m.visible = false; lb.push(b.m); }
      aoRender(...a); if (g) g.visible = v; for (const m of lb) m.visible = true; };
    this.outline = new OutlinePass(new THREE.Vector2(1, 1), scene, this.camera);
    Object.assign(this.outline, { edgeStrength: 2.6, edgeGlow: 0.55, edgeThickness: 1.4, pulsePeriod: 0 });
    this.outline.visibleEdgeColor.set('#7fd0ff'); this.outline.hiddenEdgeColor.set('#1d3b52'); this.outline.enabled = false;
    this.composer.addPass(this.outline);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader); this.composer.addPass(this.finish);

    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    r.domElement.addEventListener('pointermove', e => this._hover(e));
    let down = null;
    const wake = () => { this.lastInput = performance.now(); if (this.idle) this._setIdle(false); if (this.intro) this.intro.t = 99; };
    for (const ev of ['pointerdown', 'touchstart']) r.domElement.addEventListener(ev, wake, { passive: true });
    r.domElement.addEventListener('wheel', () => { if (this.intro) this.intro.t = 99; if (!this.idle) this.lastInput = performance.now(); }, { passive: true });
    window.addEventListener('keydown', () => { this.lastInput = performance.now(); if (this.idle) this._setIdle(false); });
    // descanso de tela: mexer o mouse não acorda; só um clique (em qualquer lugar do app) ou uma tecla
    window.addEventListener('pointermove', () => { if (!this.idle) this.lastInput = performance.now(); }, { passive: true });
    window.addEventListener('pointerdown', () => { this.lastInput = performance.now(); if (this.idle) { this._setIdle(false); this._swallowClick = true; } }, { capture: true });
    window.addEventListener('pointerup', () => setTimeout(() => (this._swallowClick = false)));
    r.domElement.addEventListener('pointerdown', e => (down = [e.clientX, e.clientY]));
    r.domElement.addEventListener('pointerup', e => { if (this._swallowClick) { this._swallowClick = false; return; } if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) this._click(e); }); // o clique que acorda o descanso de tela não seleciona nada

    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    // etiqueta flutuante (aparece ao passar o mouse num aparelho)
    this.tip = document.createElement('div'); this.tip.className = 'dev-tip';
    // passeio: arrastar para olhar, teclas para andar
    let drag = null;
    r.domElement.addEventListener('pointerdown', e => { if (this.walk) drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointerup', () => { drag = null; });
    r.domElement.addEventListener('pointermove', e => {
      if (!this.walk || !drag || !(e.buttons & 1)) return;
      this.walk.yaw -= (e.clientX - drag.x) * 0.005; this.walk.pitch = Math.max(-0.9, Math.min(0.8, this.walk.pitch - (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY }; this.walk.goal = null;
    });
    r.domElement.addEventListener('wheel', e => { if (!this.walk) return; e.preventDefault(); this.walk.push = (this.walk.push || 0) - e.deltaY * 0.004; }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!this.walk || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.key === 'Escape') return this.exitWalk();
      this.walk.keys.add(e.key.toLowerCase()); this.walk.goal = null;
    });
    window.addEventListener('keyup', e => { this.walk?.keys.delete(e.key.toLowerCase()); });
    this.clock = new THREE.Clock();
    this._camGoal = null;
    // desenho sob demanda: 60 quadros/s só quando algo se mexe; animações suaves (ar, ventilador, chuva) a 24; parado, quase nada
    this._fps = 60; this._lastFrame = 0; this._kickT = performance.now();
    const kick = () => this.kick();
    for (const ev of ['pointermove', 'pointerdown', 'wheel', 'touchstart']) r.domElement.addEventListener(ev, kick, { passive: true });
    this.controls.addEventListener('change', kick);
    // quem gira/arrasta/dá zoom manda: cancela qualquer ida automática da câmera (senão ela "puxa de volta" para o ângulo antigo)
    this.controls.addEventListener('start', () => { this._camGoal = null; });
    window.addEventListener('focus', kick); document.addEventListener('visibilitychange', kick);
    for (const m of ['updateDevices', 'setSun', 'setLocation', 'setWeather']) { const f = this[m]; this[m] = (...a) => { const out = f.apply(this, a); this._lastFrame = 0; return out; }; } // estado novo: um quadro só (transições se detectam sozinhas)
    for (const m of ['setLayout', 'selectRoom', 'focusRoom', 'frame', 'setNightMode', 'setTheme', 'setOptions', 'setQuality', 'set2D', 'setLabelMode', 'resize']) {
      const f = this[m]; if (typeof f === 'function') this[m] = (...a) => { const out = f.apply(this, a); this.kick(); return out; };
    }
    this._applyStyle();
  }
  kick(ms = 1200) { this._kickT = Math.max(this._kickT, performance.now() + ms - 1200); this._fps = 60; }

  get diorama() { return this.opts.style !== 'classic'; }
  // estilo "maquete" (fofo e moderno: tons quentes, luz suave, câmera isométrica) ou clássico (escuro)
  _applyStyle() {
    const d = this.diorama, r = this.renderer;
    r.toneMapping = d ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    this.fov3d = d ? 24 : 38;
    this.fk = Math.tan(THREE.MathUtils.degToRad(19)) / Math.tan(THREE.MathUtils.degToRad(this.fov3d / 2));
    if (!this.mode2d && !this.walk) { this.camera.fov = this.fov3d; this.camera.updateProjectionMatrix(); }
    this.controls.minDistance = 5 * this.fk;
    this.ground.visible = !d; this.shadowGround.visible = d;
    this.sun.shadow.radius = d ? 9 : 4; this.sun.shadow.blurSamples = 20;
    this.outline.visibleEdgeColor.set(d ? '#ffbe4d' : '#7fd0ff'); this.outline.hiddenEdgeColor.set(d ? '#6b4f2a' : '#1d3b52');
    this.ao.updateGtaoMaterial(d ? { radius: 0.6, distanceExponent: 1.4, thickness: 1.4, scale: 1.25, samples: 16 } : { radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 16 });
    this.ao.blendIntensity = d ? 1 : 0.9;
    this.finish.uniforms.vignette.value = d ? 0.1 : 0.32;
    this.hemi.groundColor.set(d ? '#b89c80' : '#1a1a1a');
    if (this.quality) this.setQuality(this.quality);
  }

  setQuality(q) {
    this.quality = q;
    this.ao.enabled = q === 'high';
    this.finish.uniforms.grain.value = q === 'low' ? 0 : this.diorama ? 0.012 : 0.03;
    for (const pl of this.lightPool) { const m = q === 'high' ? 512 : q === 'medium' ? 256 : 128; pl.shadow.mapSize.set(m, m); if (pl.shadow.map) { pl.shadow.map.dispose(); pl.shadow.map = null; } }
    this._shadowDirty = 2;
    this.finish.uniforms.tilt.value = q === 'high' ? (this.diorama ? 0.22 : 0.35) : 0;
    this.rt.samples = q === 'low' ? 0 : 4;
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, q === 'high' ? 1.75 : 1.5)); // telas 4K: limita a resolução interna do 3D
    this.renderer.shadowMap.type = q === 'low' || this.diorama ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; // PCF aceita raio: sombra macia de maquete
    { const ms = q === 'low' ? 1024 : this.diorama ? 2048 : 4096; this.sun.shadow.mapSize.set(ms, ms); }
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h); this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h);
    this.finish.uniforms.res.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
    if (this.mode2d && !this.camTween) this._go2D(true);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  setLayout(layout, placements, devices) {
    if (layout) layout = toV2(layout);
    this.layout = layout; this.placements = placements;
    const D = this.diorama; setFurnStyle(D ? 'maquete' : 'classic');
    // libera a memória de vídeo das geometrias do desenho anterior (o editor reconstrói a cada mudança).
    // Os materiais NÃO são liberados: liberar faz a placa apagar os shaders e recompilar tudo no quadro seguinte (travava ~1 s a cada alteração).
    this.group.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); }); // peças em cache (almofadas) ficam
    this.group.clear(); this.rooms.clear(); this.devs.clear(); this.lamps = []; this._furn = [];
    this.ceilings = null; this.roof = null; this.ext = null; this.walkSegs = [];
    this.walls = []; this.doors = []; this.windows = []; this.tvScreens = [];
    this.north = layout?.north || 0;
    this.overlay.innerHTML = '';
    if (!layout) return;
    const H = this.H = layout.wallHeight || REAL_H; // pé-direito real (escala 1:1)
    this.vs = H / REAL_H; // escala vertical (maquete)
    const b = this.b = bounds(layout);
    const ox = this.fixedOff ? this.fixedOff.ox : -b.cx, oz = this.fixedOff ? this.fixedOff.oz : -b.cy;
    this.off = { ox, oz };

    const roomsList = layout.rooms || [];
    if (D) { // base de madeira grossa embaixo da casa, seguindo o formato da planta (como uma maquete)
      const pH = 0.24, e = DEF_T / 2 + 0.02;
      const side = new THREE.MeshStandardMaterial({ color: '#6b4430', roughness: 0.62 });
      const lip = new THREE.MeshStandardMaterial({ color: '#9a6a48', roughness: 0.55 });
      for (const r of roomsList) {
        const shape = new THREE.Shape(offsetPoly(r.poly, e).map(([x, y]) => new THREE.Vector2(x + ox, -(y + oz))));
        const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: pH, bevelEnabled: false }), side);
        m.rotation.x = -Math.PI / 2; m.position.y = -pH - 0.03; m.castShadow = true; m.receiveShadow = true; m.userData.outside = true; this.group.add(m);
        const shape2 = new THREE.Shape(offsetPoly(r.poly, e + 0.002).map(([x, y]) => new THREE.Vector2(x + ox, -(y + oz))));
        const t = new THREE.Mesh(new THREE.ExtrudeGeometry(shape2, { depth: 0.03, bevelEnabled: false }), lip);
        t.rotation.x = -Math.PI / 2; t.position.y = -0.03; t.receiveShadow = true; t.userData.outside = true; this.group.add(t);
      }
      this.shadowGround.position.y = -pH - 0.03;
    } else {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.14, b.h + 0.6), this.slabMat);
      slab.position.set(0, -0.07, 0); slab.receiveShadow = true; slab.userData.outside = true; this.group.add(slab);
    }
    const ext = Math.max(b.w, b.h) / 2 + 6;
    Object.assign(this.sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 });
    this.sun.shadow.camera.updateProjectionMatrix();

    // pisos: cada cômodo/área é um polígono (pode ter qualquer formato); áreas ligadas por divisória formam um ambiente
    const divs = (layout.walls2 || []).filter(w => w.kind === 'divider');
    const onDivider = (a, c) => divs.some(w => { const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2; return segDist(mx, my, w) < 0.012; });
    for (const L of logicalRooms(layout)) {
      const parts = [];
      for (const room of L.rects) {
        const mat = floorMaterial(room.floor || defaultFloor(room.name), 1, 1, D);
        const base = new THREE.Color(room.floorColor || '#ffffff');
        mat.color.copy(base);
        const shape = new THREE.Shape(room.poly.map(([x, y]) => new THREE.Vector2(x, -y)));
        const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(ox, 0.005, oz);
        floor.receiveShadow = true; floor.userData.roomId = L.id; floor.userData.floorOf = room.id; if (L.grouped) floor.userData.areaId = room.id;
        this.group.add(floor);
        parts.push({ floor, room, mat, base, lightPos: new THREE.Vector3(room.cx + ox, Math.min(0.9, H * 0.6), room.cy + oz), dist: Math.max(room.w, room.h) * 1.6 });
      }
      // divisas suaves entre as áreas de um ambiente unido + nome de cada área
      const areaLabels = [];
      if (L.grouped) {
        for (const part of L.rects) {
          const el = document.createElement('div');
          el.className = 'area-label'; el.textContent = part.name;
          el.onclick = () => this.onRoom(L.id, part.id); // cada área funciona como um cômodo
          this.overlay.appendChild(el);
          areaLabels.push({ el, id: part.id, pos: new THREE.Vector3(part.cx + ox, 0.05, part.cy + oz) });
        }
      }
      // contorno de seleção (só as bordas externas do ambiente)
      const pts = [];
      for (const part of L.rects) for (let i = 0, j = part.poly.length - 1; i < part.poly.length; j = i++) {
        const a = part.poly[j], c = part.poly[i];
        if (L.grouped && onDivider(a, c)) continue;
        pts.push(new THREE.Vector3(a[0] + ox, 0.02, a[1] + oz), new THREE.Vector3(c[0] + ox, 0.02, c[1] + oz));
      }
      const outline = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }));
      this.group.add(outline);
      const m = L.main;
      const labelPos = new THREE.Vector3(m.cx + ox, 0.05, m.cy + oz);
      const label = document.createElement('button');
      label.className = 'room-label';
      label.innerHTML = `<span class="rl-name">${esc(L.name)}</span><span class="rl-sub"></span>`;
      label.onclick = () => this.onRoom(L.id);
      label.onmouseenter = () => (this._hoverLabel = L.id);
      label.onmouseleave = () => { if (this._hoverLabel === L.id) this._hoverLabel = null; };
      this.overlay.appendChild(label);
      this.rooms.set(L.id, { L, parts, outline, label, labelPos, areaLabels, glow: 0, glowGoal: 0, color: new THREE.Color(0) });
    }
    // divisórias: linha discreta no piso
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false });
    for (const w of divs) {
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); if (len < 0.02) continue;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.025), lineMat);
      strip.rotation.order = 'YXZ'; strip.rotation.x = -Math.PI / 2; strip.rotation.y = Math.atan2(-(w.y2 - w.y1), w.x2 - w.x1);
      strip.position.set((w.x1 + w.x2) / 2 + ox, 0.012, (w.y1 + w.y2) / 2 + oz); strip.userData.wallId = w.id; strip.userData.divider = true;
      this.group.add(strip);
    }

    // paredes: em qualquer ângulo, cada lado com seu acabamento (A = esquerda de quem vai do ponto 1 ao 2)
    const wallMat = plasterMaterial(D ? '#eadfcf' : '#e2e0dc', D ? 0.4 : 1);
    const capMat = new THREE.MeshStandardMaterial({ color: D ? '#f6efe4' : '#2e2e2e', roughness: 0.7 });
    const baseMat = new THREE.MeshStandardMaterial({ color: D ? '#fbf8f2' : '#cfc9c0', roughness: 0.55 });
    const finCache = new Map(), vs = this.vs;
    const finishMat = f => {
      if (!f || ((!f.finish || f.finish === 'paint') && !f.color)) return wallMat;
      const key = (f.finish || 'paint') + ':' + (f.color || '');
      if (!finCache.has(key)) finCache.set(key, wallFinishMaterial(f.finish || 'paint', f.color, D, vs));
      return finCache.get(key);
    };
    const matsOf = w => [wallMat, wallMat, capMat, capMat, finishMat(w.fa), finishMat(w.fb)];
    this._baseH = 0;
    const baseH = this._baseH = Math.max(0.035, 0.1 * this.vs);
    const roomsBeside = (o, w) => { // cômodos dos dois lados (A e B) do trecho de parede; fora da casa = null
      const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2, nx = -(o.uy), ny = o.ux, d = (w.t || DEF_T) / 2 + 0.12;
      const at = (x, y) => { const r = areaAt(layout, x, y, 0); return r ? (r.group || r.id) : null; };
      return [at(mx + nx * d, my + ny * d), at(mx - nx * d, my - ny * d)];
    };
    // direção "para fora da casa" de um trecho (parede externa); null se tem cômodo dos dois lados
    const outOf = (o, ra, rb) => { const n = new THREE.Vector3(-o.uy, 0, o.ux); return !ra && rb ? n : ra && !rb ? n.negate() : null; };
    const wallTop = w => (w.h ? Math.max(0.05, w.h * vs) : H);
    const addBox = (o, w, y0, y1, baseboard) => { // o = {x1,y1,x2,y2,ux,uy}: trecho ao longo da parede w
      const t = w.t || DEF_T;
      const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1) - 0.001, hh = y1 - y0;
      if (hh <= 0.01 || len <= 0.01) return;
      const rot = Math.atan2(-o.uy, o.ux);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, hh, t), matsOf(w));
      m.position.set((o.x1 + o.x2) / 2 + ox, y0 + hh / 2, (o.y1 + o.y2) / 2 + oz); m.rotation.y = rot;
      m.castShadow = true; m.receiveShadow = true; m.userData.wallId = w.id; this.group.add(m);
      const parts = [m];
      if (Math.abs(y1 - H) < 1e-6 || D) { // no estilo maquete todo trecho tem tampa clara (aparece quando a parede é cortada)
        const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.01, t), capMat);
        cap.position.set(m.position.x, y1 + 0.005, m.position.z); cap.rotation.y = rot; cap.userData.wallId = w.id; this.group.add(cap); parts.push(cap);
      }
      if (baseboard && y0 === 0) {
        const bb = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.01, len - 0.002), Math.min(baseH, hh), t + 0.022), baseMat);
        bb.position.set(m.position.x, Math.min(baseH, hh) / 2, m.position.z); bb.rotation.y = rot; bb.receiveShadow = true; bb.userData.wallId = w.id; this.group.add(bb);
      }
      const [ra, rb] = roomsBeside(o, w);
      this.walls.push({ parts, y0, hh, H, full: y1 >= H - 1e-6, id: w.id, cx: m.position.x, cz: m.position.z, rooms: [ra, rb], out: outOf(o, ra, rb), k: 1, goal: 1, delay: 0 });
    };
    for (const p of buildWalls(layout)) addBox(p, p.wall, 0, wallTop(p.wall), true);

    // vãos: portas (com folha que abre), arcos e janelas (com vidro)
    const leafMat = new THREE.MeshStandardMaterial({ color: D ? '#b9835a' : '#d9cdb8', roughness: 0.55 });
    const frameMat = new THREE.MeshStandardMaterial({ color: D ? '#fbf8f2' : '#f4f2ee', roughness: 0.4 });
    const curtainMat = new THREE.MeshStandardMaterial({ color: '#f5f0e7', roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
    const rodMat = new THREE.MeshStandardMaterial({ color: '#5a4334', roughness: 0.4, metalness: 0.3 });
    const handleMat = new THREE.MeshStandardMaterial({ color: '#9a9a9a', roughness: 0.3, metalness: 0.8 });
    for (const o of buildOpenings(layout)) {
      const w = o.wall, WT = w.t || DEF_T, top0 = wallTop(w);
      const width = o.w, rot = Math.atan2(-o.uy, o.ux);
      const cx = o.cx + ox, cz = o.cy + oz;
      const n = new THREE.Vector3(-o.uy, 0, o.ux), u = new THREE.Vector3(o.ux, 0, o.uy);
      if (o.type === 'open') continue;
      if (o.type === 'window') {
        const sill = Math.min(top0 - 0.1, (o.sill ?? 1) * vs), top = Math.min(top0 - 0.02, Math.max(sill + 0.08, (o.top ?? 2.1) * vs));
        addBox(o, w, 0, sill, true); addBox(o, w, top, top0, false);
        const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rot; g.userData.openingId = o.opening.id;
        const gh = top - sill;
        const glassMat = new THREE.MeshPhysicalMaterial({ color: D ? '#d6e7f1' : '#bfe0ff', roughness: D ? 0.2 : 0.05, metalness: 0, transparent: true, opacity: D ? 0.7 : 0.28, envMapIntensity: 1.6, emissive: new THREE.Color('#ffc98a'), emissiveIntensity: 0, depthWrite: D });
        glassMat.userData.baseOp = D ? 0.7 : 0.28;
        const glass = new THREE.Mesh(new THREE.BoxGeometry(width - 0.04, gh - 0.04, 0.012), glassMat); glass.position.y = sill + gh / 2; g.add(glass);
        const mull = o.opening.style === 'single' ? [] : [[0.02, gh, 0, sill + gh / 2]];
        for (const [fw, fh, fx, fy] of [[width, 0.025, 0, sill + 0.0125], [width, 0.025, 0, top - 0.0125], [0.025, gh, -width / 2 + 0.0125, sill + gh / 2], [0.025, gh, width / 2 - 0.0125, sill + gh / 2], ...mull]) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), frameMat); f.position.set(fx, fy, 0); g.add(f);
        }
        if (sill > 0.02) { const sl = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, 0.018, WT + 0.06), frameMat); sl.position.y = sill; g.add(sl); } // peitoril
        this.group.add(g);
        const [ra, rb] = roomsBeside(o, w);
        const out = outOf(o, ra, rb);
        const curtain = o.opening.curtain || (D && out ? 'open' : 'none'); // 'open' (aberta), 'closed' (fechada) ou 'none' (sem cortina)
        if (curtain !== 'none') { // cortinas leves e varão do lado de dentro (janela interna: lado A)
          const s = out ? -Math.sign(out.dot(n)) : 1, zi = s * (WT / 2 + 0.05), ch = Math.min(top0 - 0.03, top + 0.08);
          const closed = curtain === 'closed', cw = closed ? width / 2 + 0.06 : Math.max(0.16, Math.min(0.32, width * 0.24));
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, closed ? width + 0.3 : width + cw * 1.3, 10), rodMat);
          rod.rotation.z = Math.PI / 2; rod.position.set(0, ch + 0.01, zi); g.add(rod);
          for (const side of [-1, 1]) {
            const folds = closed ? Math.max(6, Math.round(cw * 14)) : 6; // fechada: mais pregas, ocupando o vão todo
            const geo = new THREE.PlaneGeometry(cw, ch - 0.01, closed ? 40 : 18, 1), pa = geo.attributes.position;
            for (let i = 0; i < pa.count; i++) { const x = pa.getX(i); pa.setZ(i, Math.sin((x / cw + 0.5) * Math.PI * folds) * 0.018 * s); }
            geo.computeVertexNormals();
            const c = new THREE.Mesh(geo, curtainMat);
            c.position.set(closed ? side * cw / 2 : side * (width / 2 + cw * 0.15), (ch - 0.01) / 2, zi); c.castShadow = true; c.receiveShadow = true; g.add(c);
          }
        }
        g.traverse(x => { x.userData.openingId = o.opening.id; }); // vidro, batente e cortinas: tudo seleciona a janela
        this.windows.push({ curtainClosed: curtain === 'closed', mat: glassMat, g, k: 1, rooms: [ra, rb], c: new THREE.Vector3(cx, 0, cz), u, out, w: width, sill, top });
        continue;
      }
      const doorTop = Math.min(top0 - 0.04, (o.top ?? 2.1) * vs);
      if (o.type === 'door') {
        addBox(o, w, doorTop, top0, false);
        // folha da porta presa na dobradiça; abre ao passar o mouse ou focar o cômodo
        const hingeEnd = o.hinge ? 1 : -1, double = o.opening.style === 'double';
        const opensTo = o.opening.swing || (double ? 'a' : (o.hinge ? 'b' : 'a')); // lado (A ou B) para onde a folha abre
        const pivots = double ? [-1, 1] : [hingeEnd];
        const idx = this.doors.length, swings = [];
        for (const he of pivots) {
          const pivot = new THREE.Group();
          pivot.position.set(cx + o.ux * he * width / 2, 0, cz + o.uy * he * width / 2);
          pivot.rotation.y = rot + (he > 0 ? Math.PI : 0);
          const lw = (double ? width / 2 : width) - 0.03, lh = doorTop - 0.01;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, 0.035), leafMat);
          leaf.position.set(lw / 2 + 0.015, lh / 2, 0); leaf.castShadow = true; leaf.receiveShadow = true;
          const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.06), handleMat); handle.position.set(lw - 0.08, lh * 0.45, 0);
          const swing = new THREE.Group(); swing.add(leaf, handle); pivot.add(swing);
          swing.traverse(x => { x.userData.doorIdx = idx; x.userData.openingId = o.opening.id; });
          this.group.add(pivot); swings.push({ swing, pivot, dir: (opensTo === 'a') === (he < 0) ? -1 : 1 });
        }
        const [ra, rb] = roomsBeside(o, w);
        this.doors.push({ swing: swings[0].swing, pivot: swings[0].pivot, leaves: swings, extra: swings.slice(1), k: 1, angle: 0.15, goal: 0.15, rooms: [ra, rb], c: new THREE.Vector3(cx, 0, cz), out: outOf(o, ra, rb) });
        continue;
      }
      // arco: forma entre o topo da parede e a curva
      const archTop = Math.min(top0 - 0.04, 2.35 * vs);
      const ry = Math.min(width / 2, archTop * 0.45);
      const spring = archTop - ry;
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, spring); shape.lineTo(-width / 2, top0); shape.lineTo(width / 2, top0); shape.lineTo(width / 2, spring);
      shape.absellipse(0, spring, width / 2, ry, 0, Math.PI, false);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: WT, bevelEnabled: false, curveSegments: 24 });
      geo.translate(0, 0, -WT / 2);
      const m = new THREE.Mesh(byNormalZ(geo), [finishMat(w.fa), finishMat(w.fb), wallMat]); // frente = lado A, fundo = lado B
      m.position.set(cx, 0, cz); m.rotation.y = rot; m.userData.wallId = w.id; m.userData.openingId = o.opening.id;
      m.castShadow = true; m.receiveShadow = true; this.group.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(width, 0.01, WT), capMat);
      cap.position.set(m.position.x, top0 + 0.005, m.position.z); cap.rotation.y = rot; this.group.add(cap);
    }

    // móveis (detalhes como TV e vasos compensam o achatamento vertical da maquete)
    setFurnScale(this.vs);
    for (const f of layout.furniture || []) {
      const g = buildFurniture(f);
      g.scale.y = this.vs;
      g.position.set(f.x + ox, 0.006, f.y + oz);
      g.rotation.y = -(f.rot || 0) * Math.PI / 180;
      const rid = roomAt(layout, f.x, f.y);
      g.traverse(o => { o.userData.furnId = f.id; if (o.isMesh) o.userData.roomId = rid; if (o.userData.tvScreen) this.tvScreens.push({ mesh: o, x: f.x, y: f.y, on: 0, goal: 0 }); });
      this.group.add(g);
      g.userData.baseSY = g.scale.y;
      (this._furn || (this._furn = [])).push(g);
    }

    // luminárias ligadas às teclas dos interruptores
    // segmentos de parede (em coordenadas da cena) para recortar o brilho no piso: passa só pelos vãos
    const segs = buildWalls(layout).map(w => {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1, e = 0.06 / L; // estica um pouco para não vazar nos cantos
      return new THREE.Vector4(w.x1 - dx * e + ox, w.y1 - dy * e + oz, w.x2 + dx * e + ox, w.y2 + dy * e + oz);
    }).slice(0, MAX_SEGS);
    while (segs.length < MAX_SEGS) segs.push(new THREE.Vector4(0, 0, 0, 0));
    this._segU = { value: segs }; this._nSegU = { value: Math.min(MAX_SEGS, buildWalls(layout).length) };
    for (const l of layout.lights || []) {
      const t = lampType(l.type);
      const wall = t.mount === 'wall' ? nearestWall(layout, l.x, l.y) : null;
      const built = buildLamp(l, { H, vs: this.vs, wall });
      const g = built.g;
      if (wall && wall.d < 0.6) g.position.set(wall.px + wall.nx * (wall.thick / 2 + 0.005) + ox, 0, wall.py + wall.ny * (wall.thick / 2 + 0.005) + oz);
      else g.position.set(l.x + ox, 0, l.y + oz);
      const rid = roomAt(layout, l.x, l.y);
      g.traverse(o => { o.userData.lampId = l.id; if (l.link?.dev) o.userData.deviceId = l.link.dev; else o.userData.roomId = rid; });
      g.traverse(o => { if (o.isMesh) o.castShadow = false; }); // a cúpula não pode tapar a própria luz
      g.updateMatrixWorld(true);
      const wpos = g.localToWorld(built.lightPos.clone());
      built.pool.material = poolMaterial(built.pool.material.map, built.color, new THREE.Vector2(wpos.x, wpos.z), this._segU, this._nSegU);
      this.group.add(g);
      this.lamps.push({ l, ...built, wpos, room: rid, k: 0, goal: 0, prev: undefined, flick: 0, bulbK: { plafon: 0.22, fita: 0.7, lustre: 1.1 }[l.type] ?? 1,
        power: { spot: 0.7, plafon: 1.25, lustre: 1.4, fita: 1.0, arandela: 0.7, abajur: 0.55, coluna: 0.85, pendente: 1.0, trilho: 1.0 }[l.type] ?? 1 });
    }

    for (const d of devices) this._addDevice(d);
    this.updateDevices(devices);
    this.weatherFx.setArea(b.w + 9, b.h + 9);
    this._shadowDirty = 3; for (const pl of this.lightPool) pl.userData.key = null;
    // área externa, telhado, tetos (passeio) e raios de sol
    this.ext = null;
    if (this.opts.exterior) { this.ext = buildExterior(b, this.vs, 1); this.group.add(this.ext.group); }
    this.roof = this.opts.roof && !D ? buildRoof(layout.rooms, ox, oz, H) : null;
    if (this.roof) this.group.add(this.roof.group);
    this.ceilings = buildCeilings(layout.rooms, ox, oz, H); this.group.add(this.ceilings);
    this.beams.setWindows(this.windows.filter(w => w.out && !w.curtainClosed)); // cortina fechada: sem raio de sol
    for (const lp of this.lamps) lp.baseY = lp.g.position.y;
    // paredes que bloqueiam o passeio (paredes + janelas), em coordenadas da cena
    this.walkSegs = [...buildWalls(layout), ...buildOpenings(layout).filter(o => o.type === 'window')].map(w => [w.x1 + ox, w.y1 + oz, w.x2 + ox, w.y2 + oz]);
    for (const [, v] of this.devs) v.baseY = v.g.position.y;
    if (!this._framed) { this.frame(true); this._framed = true; if (this.opts.intro && !matchMedia('(prefers-reduced-motion: reduce)').matches) this._startIntro(); }
  }

  _addDevice(d) {
    const p = this.placements?.[d.id];
    if (!p) return;
    const { ox, oz } = this.off;
    const g = new THREE.Group();
    const realZ = p.z ?? defaultHeight(d);
    const y = Math.min(realZ * this.vs, this.H + 0.6);
    // plantas antigas não têm 'wall': se estiver colado numa parede, considera preso nela
    const onWall = d.type === 'ac' || p.wall || (p.wall === undefined && (nearestWall(this.layout, p.x, p.y)?.d ?? 9) < 0.35);
    let anchor;
    if (onWall) {
      const nw = nearestWall(this.layout, p.x, p.y);
      const off = (nw?.thick || DEF_T) / 2 + (d.type === 'ac' ? 0.13 : 0.025);
      const wx = nw ? nw.px + nw.nx * off : p.x, wz = nw ? nw.py + nw.ny * off : p.y;
      g.position.set(wx + ox, y, wz + oz);
      if (nw) g.rotation.y = Math.atan2(nw.nx, nw.ny);
    } else g.position.set(p.x + ox, y, p.y + oz);

    if (d.type === 'ac') {
      const s = Math.max(0.6, this.vs * 1.4);
      const body = new THREE.Mesh(new RoundedBoxGeometry(1.0 * s, 0.3 * s, 0.24, 4, 0.05), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.35 }));
      body.castShadow = true; g.add(body);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.86 * s, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: '#2a2a2a' }));
      vent.position.set(0, -0.11 * s, 0.12); g.add(vent);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.01), new THREE.MeshBasicMaterial({ color: '#4fb3ff' }));
      led.position.set(0.32 * s, 0.02, 0.122); g.add(led);
      // aleta que abre quando o ar liga (e balança com o "swing")
      const louverPivot = new THREE.Group(); louverPivot.position.set(0, -0.13 * s, 0.125);
      const louver = new THREE.Mesh(new THREE.BoxGeometry(0.84 * s, 0.07 * s, 0.012), new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.4 }));
      louver.position.set(0, 0.035 * s, 0); louverPivot.add(louver); g.add(louverPivot);
      const N = 160, pos = new Float32Array(N * 3), seeds = new Float32Array(N);
      for (let i = 0; i < N; i++) seeds[i] = Math.random();
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.05, color: '#4fb3ff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.raycast = () => {}; // partículas não devem capturar o mouse
      g.add(pts);
      g.userData = { body, led, pts, seeds, ac: true, fall: y, louverPivot, louver: 0 };
      anchor = new THREE.Vector3(0, 0.3 * s, 0);
    } else if (onWall && d.type === 'tv') {
      // emissor infravermelho preso na parede: caixinha preta discreta
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.09, 0.03, 3, 0.012), new THREE.MeshStandardMaterial({ color: '#1e1f22', roughness: 0.35 }));
      body.position.z = -0.01; g.add(body);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.08, 48), new THREE.MeshBasicMaterial({ color: '#ffc46b', transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.position.z = 0.006; g.add(ring);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), new THREE.MeshBasicMaterial({ color: '#ff5050', transparent: true, opacity: 0 }));
      glow.position.z = 0.0062; g.add(glow);
      g.userData = { body, ring, beam: glow };
      anchor = new THREE.Vector3(0, 0.16, 0);
    } else if (onWall) {
      // espelho de tomada/interruptor na parede, no estilo escolhido; cada tecla acende sozinha
      const n = d.state?.channels?.length || 1;
      const pl = buildPlate(p.style || defaultStyle(d), n); g.add(pl.g);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.1, 48), new THREE.MeshBasicMaterial({ color: '#ffc46b', transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.position.z = -0.022; g.add(ring);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.001, 4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })); glow.visible = false; g.add(glow);
      g.userData = { body: pl.body, ring, beam: glow, keys: pl.keys, plate: true };
      anchor = new THREE.Vector3(0, 0.16, 0);
    } else if (/ventilad|fan\b/i.test(d.name || '')) {
      // ventilador de chão com hélice que gira quando ligado
      const white = new THREE.MeshStandardMaterial({ color: '#efefef', roughness: 0.4 }), dark = new THREE.MeshStandardMaterial({ color: '#2b2b2d', roughness: 0.5 });
      const hgt = Math.max(0.5, 1.1 * this.vs);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 32), white); base.position.y = 0.02; g.add(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, hgt, 10), white); pole.position.y = hgt / 2; g.add(pole);
      const head = new THREE.Group(); head.position.y = hgt; g.add(head);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 20), white); motor.rotation.x = Math.PI / 2; motor.position.z = -0.05; head.add(motor);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.006, 6, 40), white); cage.position.z = 0.04; head.add(cage);
      const blades = new THREE.Group(); blades.position.z = 0.04; head.add(blades);
      for (let i = 0; i < 3; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.008), dark); bl.position.y = 0.08; const arm = new THREE.Group(); arm.rotation.z = i * Math.PI * 2 / 3; bl.rotation.y = 0.35; arm.add(bl); blades.add(arm); }
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 48), new THREE.MeshBasicMaterial({ color: '#bfe3ff', transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015; g.add(ring);
      g.userData = { body: motor, ring, beam: ring, fan: blades, head, spin: 0 };
      anchor = new THREE.Vector3(0, hgt + 0.3, 0);
    } else {
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.22, 0.22, 3, 0.05), new THREE.MeshStandardMaterial({ color: '#efefef', roughness: 0.4 }));
      body.position.y = 0.12; body.castShadow = true; g.add(body);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 48), new THREE.MeshBasicMaterial({ color: '#ffc46b', transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015; g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#ffc46b', transparent: true, opacity: 0 }));
      beam.position.y = 0.75; g.add(beam);
      g.userData = { body, ring, beam };
      anchor = new THREE.Vector3(0, 0.55, 0);
      if (y > 0.02) { // sobre um móvel: haste fina até o chão
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, y, 6), new THREE.MeshBasicMaterial({ color: '#3a3a3a' }));
        stem.position.y = -y / 2; g.add(stem);
      }
    }
    g.traverse(o => { o.userData.deviceId = d.id; });
    this.group.add(g);
    const pin = document.createElement('button');
    pin.className = 'dev-pin';
    pin.onclick = () => this.onDevice(d.id);
    pin.onmouseenter = () => (this._hoverDev = d.id);
    pin.onmouseleave = () => { if (this._hoverDev === d.id) this._hoverDev = null; };
    this.overlay.appendChild(pin);
    this.devs.set(d.id, { g, anchor, pin, type: d.type, on: false, mode: null, plan: { x: p.x, y: p.y }, isTv: d.type === 'tv' || /\btv\b|televis/i.test(d.name || '') });
  }

  updateDevices(devices) {
    this.devices = devices;
    const perRoom = new Map();
    for (const d of devices) {
      const v = this.devs.get(d.id);
      if (v) {
        v.on = !!d.state?.on && d.online !== false; v.chans = d.state?.channels?.length > 1 ? d.state.channels.map(c => !!c.on && d.online !== false) : null; v.mode = d.state?.mode; v.offline = d.online === false; v.swing = !!d.state?.swingV;
        if (v.prevOn !== undefined && v.prevOn !== v.on) this._onToggle(v, d);
        v.prevOn = v.on;
        const icon = d.type === 'ac' ? ICON_AC : d.type === 'tv' ? ICON_TV : isLightish(d) ? ICON_BULB : ICON_PLUG;
        const val = d.type === 'ac' ? (v.on ? `${fmt(d.state.target)}°` : 'Off') : (v.on ? (typeof d.state.power === 'number' ? `${Math.round(d.state.power)} W` : 'On') : 'Off');
        v.baseClass = 'dev-pin' + (v.on ? ' on' : '') + (v.offline ? ' offline' : '') + (d.type === 'ac' && v.on ? ' ' + modeClass(d.state.mode) : '');
        v.room = d.room; v.pin.title = d.name;
        v.pin.innerHTML = `${icon}<span class="dp-name">${esc(d.name)}</span><span class="dp-val">${v.offline ? 'Offline' : val}</span>`;
      }
      if (d.room) {
        const arr = perRoom.get(d.room) || []; arr.push(d); perRoom.set(d.room, arr);
      }
    }
    // telas de TV acendem quando a TV (ou a tomada da TV) mais próxima está ligada
    for (const sc of this.tvScreens) {
      let best = null, bd = 2.2;
      for (const [, v] of this.devs) if (v.isTv) { const dd = Math.hypot(v.plan.x - sc.x, v.plan.y - sc.y); if (dd < bd) { bd = dd; best = v; } }
      sc.goal = best?.on ? 1 : 0;
    }
    // luminárias: acendem conforme a tecla ligada a elas
    const linked = new Set(this.lamps.map(x => x.l.link?.dev).filter(Boolean));
    for (const lp of this.lamps) {
      const on = lampOn(lp.l, devices);
      if (lp.prev !== undefined && lp.prev !== on) this._lampToggle(lp, on);
      lp.prev = on; lp.goal = on ? 1 : 0;
    }
    for (const [id, r] of this.rooms) {
      const list = perRoom.get(id) || [];
      // aparelhos que têm luminárias próprias não acendem o cômodo inteiro
      const on = list.filter(d => d.state?.on && d.online !== false && !linked.has(d.id));
      const ac = on.find(d => d.type === 'ac');
      let color = COLORS.warm, glow = 0;
      if (ac) { color = ac.state.mode === 'HEAT' ? COLORS.heat : ac.state.mode === 'FAN' ? COLORS.fan : COLORS.cool; glow = 1; }
      else if (on.length) glow = 0.75;
      r.color.copy(color); r.glowGoal = glow;
      r.label.classList.toggle('active', glow > 0);
      const temp = list.find(d => d.type === 'ac' && typeof d.state?.current === 'number');
      r.label.querySelector('.rl-sub').textContent =
        (list.length ? `${on.length}/${list.length} ligados` : 'Sem aparelhos') + (temp ? ` · ${fmt(temp.state.current)}°` : '');
    }
  }

  // ---------- vista noite ----------
  // dia / noite / automático: a troca anima o dia passando (sol andando, sombras girando, luzes acendendo)
  setNightMode(m, animate = true) {
    this.nightMode = m;
    const cur = this.simTime ?? Date.now();
    let target;
    if (m === 'auto') target = Date.now(); else { const d = new Date(cur); d.setHours(m === 'day' ? 13 : 22, 0, 0, 0); target = d.getTime(); }
    while (target < cur - 60e3) target += 864e5; // sempre para frente
    if (!animate || !this.running || Math.abs(target - cur) < 10 * 60e3) {
      this.simTime = m === 'auto' ? null : target; this._celT = -1; this.timelapse = null; return;
    }
    const hours = (target - cur) / 36e5;
    this.timelapse = { from: cur, to: target, t: 0, dur: Math.min(7, Math.max(3, hours / 24 * 10)), auto: m === 'auto', last: '' };
  }
  setTheme(t) {
    this.theme = t;
    const light = t === 'light';
    this.dayBg.set(light ? '#e8e8ed' : '#050505');
    this.dayGround.set(light ? '#d8d8de' : '#a8a49d'); // de dia o chão é claro nos dois temas (escuro parecia noite)
    this.slabMat.color.set(light ? '#c7c7cc' : '#1b1b1b');
  }
  setSun(sun) { this.sunTimes = sun; }
  setLocation(loc) { if (loc && isFinite(loc.lat) && isFinite(loc.lng)) { this.loc = { lat: +loc.lat, lng: +loc.lng }; this._celT = -1; } }
  setWeather(w) { this.weather = this.opts.weather ? w : null; this.weatherFx.set(this.weather, this.north); }
  setOptions(o) { const prevStyle = this.opts.style; Object.assign(this.opts, o); if (o.style && o.style !== prevStyle) { this._applyStyle(); if (this.layout) { this.setLayout(this.layout, this.placements, this.devices || []); this.frame(true); } } if (!this.opts.weather) this.setWeather(null); if (!this.opts.idle && this.idle) this._setIdle(false); }
  isNightNow() { return (this.cel?.sun.alt ?? 0) < -0.035; } // sol abaixo do horizonte (com um pouco de crepúsculo)
  // sol e lua de verdade + céu + clima
  _applySky(dt, t) {
    const first = !this.cel;
    if (this.timelapse) { // o dia passando
      const T = this.timelapse; T.t += dt;
      this.simTime = T.from + (T.to - T.from) * ease3(T.t / T.dur); this._celT = -1;
      const hm = new Date(this.simTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (hm !== T.last) { T.last = hm; this.container.dispatchEvent(new CustomEvent('timelapse', { detail: { time: hm, active: true }, bubbles: true })); }
      if (T.t >= T.dur) { this.simTime = T.auto ? null : T.to; this.timelapse = null; this.container.dispatchEvent(new CustomEvent('timelapse', { detail: { active: false }, bubbles: true })); }
    }
    if (t - this._celT > 2 || this._celT < 0) { this._celT = t; this.cel = celestial(new Date(this.simTime ?? Date.now()), this.loc.lat, this.loc.lng); }
    const cel = this.cel, goal = this.isNightNow() ? 1 : 0;
    if (first) this.night = goal; // ao abrir, já começa no dia ou na noite certos
    this.night += (goal - this.night) * Math.min(1, dt * (this.timelapse ? 3.5 : 1.2));
    const N = this.night, L = (a, b) => a + (b - a) * N;
    const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    // direção: dia = sol (ou um sol "bonito" se for vista dia forçada à noite); noite = lua (ou luar padrão)
    const sunAlt = cel.sun.alt;
    const sunDir = dirFrom(cel.sun.az, Math.max(0.12, sunAlt), this.north);
    this._sunDirReal = dirFrom(cel.sun.az, sunAlt, this.north);
    const moonUp = cel.moon.alt > 0.05;
    const moonDir = moonUp ? dirFrom(cel.moon.az, Math.max(0.25, cel.moon.alt), this.north) : dirFrom(-0.6, 0.9, this.north);
    const dir = (goal ? moonDir : sunDir);
    const sp = dir.clone().multiplyScalar(30);
    if (sp.distanceToSquared(this.sun.position) > 0.0004) { this.sun.position.copy(sp); this._shadowDirty = Math.max(this._shadowDirty, 1); }
    this.sun.target.position.set(0, 0, 0);
    // tempo: nuvens/chuva apagam o sol; neblina fecha o horizonte
    const wk = weatherKind(this.weather?.code), cloud = Math.min(1, (this.weather?.cloud ?? 0) / 100 * 0.7 + (wk.rain || 0) * 0.4 + (wk.kind === 'fog' ? 0.5 : 0));
    const golden = (1 - N) * (1 - sm(0.04, 0.42, sunAlt)) * (1 - cloud * 0.8);
    const moonK = (0.35 + 0.65 * (cel.moon.frac || 0.5)) * (moonUp ? 1 : 0.6);
    this.sun.intensity = L(1.9 * (1 - 0.68 * cloud) * (0.55 + 0.45 * sm(0.05, 0.4, sunAlt)), 0.16 * moonK);
    const sunCol = new THREE.Color('#fff3e3').lerp(new THREE.Color('#ff9446'), golden * 0.9).lerp(new THREE.Color('#e6ecf5'), cloud * 0.6);
    this.sun.color.copy(sunCol).lerp(new THREE.Color('#9fb6ff'), N);
    this.hemi.intensity = L((0.55 + cloud * 0.25) * (1 - golden * 0.35), 0.07) + this.weatherFx.flash * 2.2;
    this.hemi.color.set('#dfe6ee').lerp(new THREE.Color('#ffc9a0'), golden * 0.6);
    this.scene.environmentIntensity = L(0.3, 0.035);
    this.renderer.toneMappingExposure = this.theme === 'light' ? L(0.92, 1.0) : L(0.82, 1.0);
    // com luminárias na planta, o brilho fica só nas lâmpadas (senão o cômodo iluminado "estoura")
    const lamps = this.lamps.length > 0;
    this.bloom.strength = lamps ? L(0.18, 0.4) : L(0.35, 0.85);
    this.bloom.threshold = lamps ? L(0.92, 0.82) : L(0.85, 0.55);
    this.bloom.radius = lamps ? 0.2 : 0.6;
    // céu
    const light = this.theme === 'light', U = this.sky.uniforms;
    const dayTop = new THREE.Color(light ? '#d4dde8' : '#a9b6c6'), dayHor = new THREE.Color(light ? '#eef0f3' : '#c9ced5');
    const goldHor = new THREE.Color(light ? '#f6d7b8' : '#dcb894'), grey = new THREE.Color(light ? '#d9dadc' : '#aeb0b4');
    dayHor.lerp(goldHor, golden * 0.9).lerp(grey, cloud * 0.6); dayTop.lerp(grey, cloud * 0.5);
    U.top.value.copy(dayTop).lerp(new THREE.Color('#03050c'), N);
    U.horizon.value.copy(dayHor).lerp(new THREE.Color('#0a1022'), N);
    U.bottom.value.copy(this.dayGround).lerp(new THREE.Color('#020306'), N);
    U.flash.value = this.weatherFx.flash * 0.5;
    this.sky.starMat.uniforms.op.value = N * (1 - cloud * 0.9); this.sky.starMat.uniforms.t.value = t;
    this.scene.background.copy(U.horizon.value);
    this.scene.fog.color.copy(U.horizon.value);
    const fogK = wk.kind === 'fog' ? 1 : wk.rain ? 0.4 * wk.rain : 0;
    this.scene.fog.near = 30 - 20 * fogK; this.scene.fog.far = 60 - 30 * fogK;
    this.groundMat.color.copy(U.bottom.value);
    this.grid.visible = false;
    // correção de cor do acabamento: quente no fim de tarde, frio à noite
    this.finish.uniforms.tint.value.set(1 + golden * 0.13 - N * 0.03, 1 + golden * 0.02 - N * 0.01, 1 - golden * 0.12 + N * 0.04);
    this.finish.uniforms.sat.value = 1.04 - cloud * 0.18;
    this._beamK = (1 - N) * (1 - cloud * 0.95) * sm(0.02, 0.25, sunAlt);
    if (this.diorama) { // maquete: fundo liso e quente, luz macia e envolvente; à noite um azul profundo
      // tema claro: fundo creme; tema escuro: grafite quente (como o iOS), para a casa se destacar sem ofuscar
      const bg = light ? new THREE.Color('#ede9e4').lerp(new THREE.Color('#f3dcc4'), golden * 0.5).lerp(new THREE.Color('#dcdcdc'), cloud * 0.4)
        : new THREE.Color('#cdc7bf').lerp(new THREE.Color('#d9bfa4'), golden * 0.6).lerp(new THREE.Color('#b9b9b9'), cloud * 0.4); // tema escuro: dia claro e um pouco mais suave que no tema claro
      // noite: o oposto do creme do dia, um café escuro e quente (sem azul)
      const bgN = new THREE.Color(light ? '#211b16' : '#17130f');
      U.top.value.copy(bg).lerp(new THREE.Color(light ? '#ffffff' : '#e2ddd6'), 0.25).lerp(new THREE.Color(light ? '#2a221b' : '#1d1813'), N);
      U.horizon.value.copy(bg).lerp(bgN, N); U.bottom.value.copy(bg).lerp(bgN, N);
      this.scene.background.copy(U.horizon.value); this.scene.fog.color.copy(U.horizon.value);
      this.scene.fog.near = 120; this.scene.fog.far = 260;
      this.sky.starMat.uniforms.op.value = N * 0.55 * (1 - cloud * 0.9);
      this.hemi.color.set('#fff3e4').lerp(new THREE.Color('#ffd2a8'), golden * 0.5).lerp(new THREE.Color('#7f8fb5'), N);
      this.hemi.intensity = L(0.72 * (1 - golden * 0.25), 0.14) + this.weatherFx.flash * 2.2;
      this.sun.intensity *= L(1.0, 1.1);
      this.scene.environmentIntensity = L(0.42, 0.05);
      this.renderer.toneMappingExposure = L(0.9, 1.05);
      if (!lamps) { this.bloom.strength = L(0.12, 0.6); this.bloom.threshold = L(0.97, 0.6); } else { this.bloom.strength = L(0.1, 0.4); this.bloom.threshold = L(0.97, 0.82); }
      this.shadowGround.material.opacity = L(0.15, 0.08);
      this.finish.uniforms.tint.value.set(1.02 + golden * 0.1 - N * 0.03, 1 + golden * 0.02 - N * 0.01, 0.97 - golden * 0.1 + N * 0.05);
      this.finish.uniforms.sat.value = 1.06 - cloud * 0.18;
    }
    { const hx = '#' + U.horizon.value.getHexString(); if (hx !== this._bgHex) { this._bgHex = hx; const pe = this.container.parentElement; pe?.style.setProperty('--scene-bg', hx); pe?.classList.toggle('scene-dark', U.horizon.value.getHSL({}).l < 0.4); } } // o degradê da saudação acompanha o fundo
  }

  // ---------- animação ao ligar/desligar ----------
  _lampToggle(lp, on) {
    const pos = new THREE.Vector3(); lp.g.getWorldPosition(pos);
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.955, 1, 96), new THREE.MeshBasicMaterial({
      color: on ? lp.color : new THREE.Color('#9aa0a6'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(pos.x, 0.03, pos.z);
    this.scene.add(mesh);
    this.ripples.push({ mesh, t: 0, dur: on ? 1.0 : 0.7, R: Math.min(2.4, lp.R * 1.1), on });
    if (on) lp.flick = 0.32; // pequeno tremido ao acender, como uma lâmpada real
  }
  _onToggle(v, d) {
    if (this.lamps.some(x => x.l.link?.dev === d.id)) { // quem tem luminária anima nela, não no cômodo inteiro
      v.pin.classList.remove('pulse'); void v.pin.offsetWidth; v.pin.classList.add(v.on ? 'pulse' : 'pulse-off');
      setTimeout(() => v.pin.classList.remove('pulse', 'pulse-off'), 900);
      return;
    }
    const pos = new THREE.Vector3(); v.g.getWorldPosition(pos);
    const color = d.type === 'ac' ? (d.state?.mode === 'HEAT' ? COLORS.heat : COLORS.cool) : COLORS.warm;
    let R = 2.5;
    const room = d.room && this.rooms.get(d.room);
    if (room) { const bx = new THREE.Box3(); for (const p of room.parts) bx.expandByObject(p.floor); const sz = bx.getSize(new THREE.Vector3()); R = Math.min(3.2, Math.max(sz.x, sz.z) * 0.5); }
    for (let k = 0; k < (v.on ? 2 : 1); k++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.955, 1, 96), new THREE.MeshBasicMaterial({
        color: v.on ? color : new THREE.Color('#9aa0a6'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(pos.x, 0.03, pos.z);
      this.scene.add(mesh);
      this.ripples.push({ mesh, t: -k * 0.25, dur: v.on ? 1.3 : 0.9, R, on: v.on });
    }
    // flash do cômodo ao ligar
    if (v.on && room) room.glow = Math.max(room.glow, 1.0) * 1.8;
    // pulso no marcador
    v.pin.classList.remove('pulse'); void v.pin.offsetWidth; v.pin.classList.add(v.on ? 'pulse' : 'pulse-off');
    setTimeout(() => v.pin.classList.remove('pulse', 'pulse-off'), 900);
  }
  _updateRipples(dt) {
    for (const r of this.ripples) {
      r.t += dt;
      const k = Math.max(0, Math.min(1, r.t / r.dur));
      const ease = 1 - Math.pow(1 - k, 3);
      const sc = r.on ? 0.1 + ease * r.R : r.R * (1 - ease) + 0.05;
      r.mesh.scale.setScalar(sc);
      r.mesh.material.opacity = r.t < 0 ? 0 : (r.on ? 0.6 * (1 - k) : 0.3 * (1 - k));
    }
    this.ripples = this.ripples.filter(r => { if (r.t >= r.dur) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); return false; } return true; });
  }

  selectRoom(id, area = null) {
    this.selectedRoom = id; this.selectedArea = id ? area : null;
    for (const [rid, r] of this.rooms) r.label.classList.toggle('selected', rid === id && !area);
    if (id) this.focusRoom(id, area); else this.frame();
  }
  // paredes do cômodo em foco que ficam entre a câmera e ele abaixam (vista em corte)
  // estilo maquete: paredes externas viradas para a câmera ficam cortadas rentes (casa de bonecas), e mudam ao girar
  _facesCam(c, out) {
    if (!out || !this.diorama || this.walk || this.mode2d) return false;
    const cam = this.camera.position, v = new THREE.Vector2(cam.x - c.x, cam.z - c.z);
    return v.lengthSq() > 1e-4 && v.normalize().dot(new THREE.Vector2(out.x, out.z)) > 0.3;
  }
  _updateCutaway() {
    const sel = this.selectedRoom, cam = this.camera.position, ctr = this._focusCenter;
    const hc = Math.max((this._baseH || 0.05) + 0.03, 0.09); // altura do corte (mostra a espessura da parede)
    const mode = this.opts.wallMode || 'cut';
    for (const w of this.walls) {
      if ((mode === 'low' || mode === 'half') && !this.walk) { w.goal = Math.max(0.001, Math.min(1, (Math.max(hc, (mode === 'half' ? 0.55 : 0.32) * w.H) - w.y0) / w.hh)); continue; }
      let cut = mode === 'cut' && this._facesCam(new THREE.Vector3(w.cx, 0, w.cz), w.out) ? hc : null;
      if (cut == null && sel && ctr && w.full && w.rooms.includes(sel) && !this.walk) {
        const toWall = new THREE.Vector2(w.cx - ctr.x, w.cz - ctr.z), toCam = new THREE.Vector2(cam.x - ctr.x, cam.z - ctr.z);
        if (toWall.length() > 0.05 && toWall.normalize().dot(toCam.normalize()) > 0.25) cut = this.diorama ? hc : 0.22 * w.H;
      }
      w.goal = cut == null ? 1 : Math.max(0.001, Math.min(1, (cut - w.y0) / w.hh));
    }
    for (const x of [...this.windows, ...this.doors]) x.cut = (mode === 'low' || (mode === 'half' && x.mat)) && !this.walk ? true : mode === 'cut' && this._facesCam(x.c, x.out);
  }

  focusRoom(id, area) {
    const r = this.rooms.get(id); if (!r) return;
    const bx = new THREE.Box3();
    for (const p of r.parts) if (!area || p.room.id === area) bx.expandByObject(p.floor);
    const t = bx.getCenter(new THREE.Vector3()); const sz = bx.getSize(new THREE.Vector3());
    const size = Math.max(sz.x, sz.z);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this._camGoal = { target: t, pos: t.clone().add(dir.multiplyScalar((size * 2.6 + 7) * (this.fk || 1))) };
    this._focusCenter = t.clone(); this._focusSize = size;
  }

  frame(instant) {
    const b = this.b || { w: 10, h: 8 };
    const D = this.diorama, fk = this.fk || 1;
    let d = (Math.max(b.w, b.h) * (D ? 0.92 : 1.0) + 3.5) * fk * (this.frameMargin || 1);
    // tela em pé (celular): afasta a câmera até a largura da casa caber
    const hf = Math.tan(THREE.MathUtils.degToRad(this.fov3d || 38) / 2) * this.camera.aspect;
    d = Math.max(d, ((D ? Math.hypot(b.w, b.h) * 0.75 : b.w) / 2 + 1.1) / (1.28 * hf));
    this.controls.maxDistance = Math.max(40, d * 1.6);
    const target = new THREE.Vector3(0, D ? -0.1 : 0, D ? 0.2 : 0.6);
    // maquete: vista isométrica em diagonal; clássico: de frente, mais de cima
    const pos = D ? new THREE.Vector3(Math.sin(0.68) * d * 0.8, d * 0.98, Math.cos(0.68) * d * 0.8).add(target) : new THREE.Vector3(0, d * 1.12, d * 0.62);
    this._frameDist = pos.distanceTo(target);
    if (this.mode2d) return this._go2D(instant);
    if (instant) { this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); }
    else this._camGoal = { target, pos };
  }

  // ---------- abertura animada: câmera desce girando e as paredes sobem do chão ----------
  _startIntro() {
    const endPos = this.camera.position.clone(), endTgt = this.controls.target.clone();
    const off = endPos.clone().sub(endTgt), sph = new THREE.Spherical().setFromVector3(off);
    const maxD = Math.max(...this.walls.map(w => Math.hypot(w.cx, w.cz)), 1);
    const withRoof = !!this.roof;
    for (const w of this.walls) { w.delay = withRoof ? -9 : 0.35 + 0.75 * Math.hypot(w.cx, w.cz) / maxD; w.k = withRoof ? 1 : 0; }
    if (withRoof) this.roofClosed = 1;
    this._furn.forEach((g, i) => { g.userData.introDelay = 1.0 + 0.6 * (Math.hypot(g.position.x, g.position.z) / maxD) + (i % 5) * 0.03; g.userData.baseY = g.position.y; });
    this.intro = { t: 0, dur: 3.0, withRoof, endTgt, sph, from: new THREE.Spherical(sph.radius * 1.75, Math.max(0.12, sph.phi * 0.35), sph.theta - 1.1) };
    for (const [, d] of this.devs) d.pin.style.opacity = '0';
    for (const [, r] of this.rooms) { r.label.style.opacity = '0'; for (const a of r.areaLabels) a.el.style.opacity = '0'; }
    this.container.dispatchEvent(new CustomEvent('introchange', { detail: true, bubbles: true }));
  }
  _runIntro(dt) {
    const I = this.intro; I.t += dt;
    const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const k = ease(I.t / I.dur);
    const s = new THREE.Spherical(I.from.radius + (I.sph.radius - I.from.radius) * k, I.from.phi + (I.sph.phi - I.from.phi) * k, I.from.theta + (I.sph.theta - I.from.theta) * k);
    this.camera.position.setFromSpherical(s).add(I.endTgt); this.controls.target.copy(I.endTgt);
    for (const w of this.walls) w.k = ease((I.t - w.delay) / 0.8);
    if (I.withRoof) this.roofClosed = 1 - ease((I.t - 1.15) / 1.1); // de longe a casa está fechada; o telhado sai e revela o interior
    for (const g of this._furn) { const fk = ease((I.t - (g.userData.introDelay ?? 0)) / 0.6); g.position.y = (g.userData.baseY ?? 0.006) + (1 - fk) * 0.6; g.visible = fk > 0.01; } // móveis recriados no meio da abertura não têm baseY
    const uiK = Math.min(1, Math.max(0, (I.t - I.dur + 0.6) / 0.6));
    for (const [, d] of this.devs) d.pin.style.opacity = String(uiK);
    for (const [, r] of this.rooms) { r.label.style.opacity = String(uiK); for (const a of r.areaLabels) a.el.style.opacity = String(uiK); }
    if (I.t >= I.dur + 0.2) {
      for (const w of this.walls) w.k = 1;
      for (const g of this._furn) { g.position.y = g.userData.baseY ?? 0.006; g.visible = true; }
      for (const [, d] of this.devs) d.pin.style.opacity = '';
      for (const [, r] of this.rooms) { r.label.style.opacity = ''; for (const a of r.areaLabels) a.el.style.opacity = ''; }
      this.camera.position.setFromSpherical(I.sph).add(I.endTgt);
      this.intro = null;
      this.container.dispatchEvent(new CustomEvent('introchange', { detail: false, bubbles: true }));
    }
  }
  // ---------- descanso de tela: gira devagar quando ninguém mexe ----------
  _setIdle(on) {
    this.idle = on;
    this.controls.autoRotate = on; this.controls.autoRotateSpeed = 0.35;
    this.container.dispatchEvent(new CustomEvent('idlechange', { detail: on, bubbles: true }));
  }
  // ---------- movimento suave de câmera (posição, alvo e lente) ----------
  _tweenTo(pos, target, fov, dur = 1.1, done) {
    this.camTween = { p0: this.camera.position.clone(), p1: pos.clone(), t0: (this.walk ? this._walkLook() : this.controls.target.clone()), t1: target.clone(), f0: this.camera.fov, f1: fov, t: 0, dur, done };
    this._camGoal = null;
  }
  _runCamTween(dt) {
    const T = this.camTween; T.t += dt; const k = ease3(T.t / T.dur);
    this.camera.position.lerpVectors(T.p0, T.p1, k);
    const tg = T.t0.clone().lerp(T.t1, k);
    this.camera.fov = T.f0 + (T.f1 - T.f0) * k; this.camera.updateProjectionMatrix();
    this.camera.lookAt(tg); if (!this.walk) this.controls.target.copy(tg);
    if (T.t >= T.dur) { this.camTween = null; T.done?.(); }
  }
  // ---------- planta 2D <-> 3D ----------
  set2D(on) {
    if (this.walk) this.exitWalk(true);
    if (on === this.mode2d) return;
    this.mode2d = on;
    if (on) { this._saved3d = { pos: this.camera.position.clone(), target: this.controls.target.clone() }; this.selectRoom(null); this._go2D(false); }
    else {
      const sv = this._saved3d; this.controls.minPolarAngle = 0.15; this.controls.maxPolarAngle = 1.15; this.controls.enableRotate = true;
      if (sv) this._tweenTo(sv.pos, sv.target, this.fov3d, 1.2); else { this.camera.fov = this.fov3d; this.frame(); }
    }
    this.container.dispatchEvent(new CustomEvent('viewchange', { detail: { mode2d: on }, bubbles: true }));
  }
  _go2D(instant) {
    const b = this.b || { w: 10, h: 8 }, fov = 26, tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const half = (Math.max(b.h / 2, b.w / 2 / Math.max(0.3, this.camera.aspect)) + 0.9) * (this.frameMargin || 1);
    const tgt = new THREE.Vector3(0, 0, 0), pos = new THREE.Vector3(0, half / tan, 0.001);
    this.controls.enableRotate = false; this.controls.minPolarAngle = 0; this.controls.maxPolarAngle = 0.002;
    if (instant) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.camera.fov = fov; this.camera.updateProjectionMatrix(); this.controls.update(); }
    else this._tweenTo(pos, tgt, fov, 1.25);
  }
  // ---------- passeio pela casa (primeira pessoa) ----------
  get eyeH() { return Math.min(this.H * 0.78, 1.6 * this.vs); }
  _walkLook() { const w = this.walk; return w.pos.clone().setY(this.eyeH).add(new THREE.Vector3(Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch), Math.cos(w.yaw) * Math.cos(w.pitch))); }
  enterWalk(roomId) {
    if (!this.layout?.rooms?.length) return;
    if (this.mode2d) { this.mode2d = false; this.t2d = 0; this.controls.minPolarAngle = 0.15; this.controls.maxPolarAngle = 1.15; this.controls.enableRotate = true; }
    const L = logicalRooms(this.layout);
    const r = (roomId && L.find(x => x.id === roomId)) || L.reduce((a, x) => (x.area > a.area ? x : a), L[0]);
    const m = r.main, start = new THREE.Vector3(m.cx + this.off.ox, 0, m.cy + this.off.oz);
    const yaw = Math.atan2(-start.x, -start.z) + Math.PI; // olhando para longe do centro da casa
    this._savedWalk = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.selectRoom(null); this.controls.enabled = false;
    this.walk = { pos: start, yaw, pitch: -0.08, keys: new Set(), goal: null, push: 0, entering: true };
    const eye = start.clone().setY(this.eyeH);
    this._tweenTo(eye, this._walkLook(), 70, 1.4, () => { if (this.walk) this.walk.entering = false; });
    this.container.dispatchEvent(new CustomEvent('walkchange', { detail: true, bubbles: true }));
  }
  exitWalk(quick) {
    if (!this.walk) return;
    this.walk = null; this.controls.enabled = true;
    const sv = this._savedWalk;
    if (sv && !quick) this._tweenTo(sv.pos, sv.target, this.fov3d, 1.3); else { this.camera.fov = this.fov3d; this.camera.updateProjectionMatrix(); }
    this.container.dispatchEvent(new CustomEvent('walkchange', { detail: false, bubbles: true }));
  }
  _blocked(x, z) { const R = 0.2; for (const [x1, z1, x2, z2] of this.walkSegs || []) { const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1e-6; const k = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / L2)); if (Math.hypot(x - (x1 + dx * k), z - (z1 + dz * k)) < R) return true; } return false; }
  _runWalk(dt) {
    const w = this.walk; if (w.entering) return;
    const fwd = new THREE.Vector3(Math.sin(w.yaw), 0, Math.cos(w.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const mv = new THREE.Vector3(), k = w.keys, sp = (k.has('shift') ? 2.6 : 1.5) * dt;
    if (k.has('w') || k.has('arrowup')) mv.add(fwd); if (k.has('s') || k.has('arrowdown')) mv.sub(fwd);
    if (k.has('d')) mv.sub(right); if (k.has('a')) mv.add(right);
    if (k.has('arrowleft') || k.has('q')) w.yaw += 1.8 * dt; if (k.has('arrowright') || k.has('e')) w.yaw -= 1.8 * dt;
    if (w.push) { mv.addScaledVector(fwd, Math.sign(w.push)); w.push *= 0.85; if (Math.abs(w.push) < 0.05) w.push = 0; }
    if (w.goal) { // andar até o ponto clicado
      const d = new THREE.Vector3(w.goal.x - w.pos.x, 0, w.goal.z - w.pos.z);
      if (d.length() < 0.08) w.goal = null;
      else { mv.copy(d.normalize()); const want = Math.atan2(d.x, d.z); let dy = want - w.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); w.yaw += dy * Math.min(1, dt * 3); }
    }
    if (mv.lengthSq() > 0) {
      mv.normalize().multiplyScalar(sp);
      const nx = w.pos.x + mv.x, nz = w.pos.z + mv.z;
      if (!this._blocked(nx, nz)) { w.pos.x = nx; w.pos.z = nz; }
      else if (!this._blocked(nx, w.pos.z)) w.pos.x = nx;
      else if (!this._blocked(w.pos.x, nz)) w.pos.z = nz;
      else w.goal = null;
    }
    this.camera.position.copy(w.pos).setY(this.eyeH + Math.sin(performance.now() / 160) * (mv.lengthSq() > 0 ? 0.008 : 0));
    this.camera.lookAt(this._walkLook());
  }
  // ---------- contorno do que está sob o mouse ----------
  _updateOutline() {
    const on = this.quality !== 'low' && !this.walk && !this.intro && !this.idle;
    let objs = [];
    if (on && this.selObjs?.length) objs = this.selObjs;
    else if (on && !this.builder) {
      const id = this._hoverDev || this._hoverDev3d;
      if (id) { const v = this.devs.get(id); if (v) objs.push(v.g); for (const lp of this.lamps) if (lp.l.link?.dev === id) objs.push(lp.g); }
      else if (this._hoverDoor != null && this.doors[this._hoverDoor]) objs.push(this.doors[this._hoverDoor].swing);
      else if (this._hoverRoof && this.roof?.group.visible) objs.push(this.roof.group);
      else if (this._hoverRoom && !this.mode2d) { const r = this.rooms.get(this._hoverRoom); if (r) objs = r.parts.map(p => p.floor); }
    }
    this.outline.selectedObjects = objs; this.outline.enabled = objs.length > 0;
  }
  // escolhe as luzes mais fortes da cena (lâmpadas acesas e cômodos iluminados) para as luzes com sombra.
  // Cada luz mantém o seu lugar enquanto continuar entre as escolhidas, para não recalcular sombras à toa.
  _assignLights() {
    const cands = [];
    this.lamps.forEach((lp, i) => { if ((lp.I || 0) > 0.003) cands.push({ key: 'l' + i, pos: lp.wpos, color: lp.color, I: lp.I, dist: lp.R * 2.4 + 0.6 }); });
    for (const [id, r] of this.rooms) r.parts.forEach((p, j) => { if ((p.I || 0) > 0.01) cands.push({ key: 'r' + id + j, pos: p.lightPos, color: p.color, I: p.I, dist: p.dist }); });
    cands.sort((a, b) => (b.key[0] === 'l') - (a.key[0] === 'l') || b.I - a.I); // lâmpadas têm prioridade
    const chosen = new Map(cands.slice(0, this.lightPool.length).map(c => [c.key, c]));
    let changed = false;
    for (const pl of this.lightPool) if (pl.userData.key && !chosen.has(pl.userData.key)) { pl.userData.key = null; pl.intensity = 0; pl.position.set(0, -60, 0); changed = true; }
    const used = new Set(this.lightPool.map(pl => pl.userData.key).filter(Boolean));
    for (const c of chosen.values()) {
      let pl = this.lightPool.find(x => x.userData.key === c.key);
      if (!pl) { pl = this.lightPool.find(x => !x.userData.key); if (!pl) continue; pl.userData.key = c.key; pl.position.copy(c.pos); pl.distance = c.dist; changed = true; }
      pl.color.copy(c.color); pl.intensity = c.I;
    }
    if (changed) this._shadowDirty = Math.max(this._shadowDirty, 1);
  }
  start() { if (this.running) return; this.running = true; this.resize(); this._loop(); }
  stop() { this.running = false; }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    if (now - this._lastFrame < 1000 / this._fps - 2) return; // pula quadros quando a cena está parada
    this._lastFrame = now;
    const dt = Math.min(this.clock.getDelta(), 0.05), t = this.clock.elapsedTime;
    const camMoving = !this._lastCam || this._lastCam.distanceToSquared(this.camera.position) > 1e-9 || this._lastTgt.distanceToSquared(this.controls.target) > 1e-9;
    if (this.intro) this._runIntro(dt);
    else if (this.opts.idle && !this.idle && !this.selectedRoom && performance.now() - this.lastInput > this.opts.idleMin * 60e3) this._setIdle(true);
    if (this.camTween) this._runCamTween(dt);
    if (this.walk) this._runWalk(dt);
    if (this._camGoal && !this.intro && !this.camTween && !this.walk) {
      this.camera.position.lerp(this._camGoal.pos, 0.08);
      this.controls.target.lerp(this._camGoal.target, 0.08);
      this._camGoal.t = (this._camGoal.t || 0) + dt;
      // chegou (ou passou de 2,5 s: os limites da órbita podem impedir chegar exatamente) → solta a câmera
      if ((this.camera.position.distanceTo(this._camGoal.pos) < 0.02 && this.controls.target.distanceTo(this._camGoal.target) < 0.02) || this._camGoal.t > 2.5) this._camGoal = null;
    }
    if (!this.walk && !this.camTween) this.controls.update();

    this._applySky(dt, t);
    // modo 2D (planta): paredes e móveis achatam
    this.t2d += ((this.mode2d ? 1 : 0) - this.t2d) * Math.min(1, dt * 3.2);
    const flat = 1 - 0.93 * this.t2d;
    if (this._lastFlat !== flat) {
      this._lastFlat = flat;
      for (const g of this._furn) g.scale.y = (g.userData.baseSY || this.vs) * (1 - 0.85 * this.t2d);
      for (const lp of this.lamps) { lp.g.scale.y = 1 - 0.9 * this.t2d; }
      for (const [, v] of this.devs) if (v.baseY !== undefined) v.g.position.y = v.baseY * (1 - 0.85 * this.t2d) + 0.02 * this.t2d;
    }
    // telhado: fechado quando se olha de longe, levanta ao aproximar (ou no clique)
    if (this.roof) {
      if (!this.intro) {
        const far = this.camera.position.distanceTo(this.controls.target) > (this._frameDist || 20) * 1.18;
        const goal = far && !this.mode2d && !this.walk && !this.selectedRoom && !this._roofOpened ? 1 : 0;
        if (!far) this._roofOpened = false;
        this.roofClosed += (goal - this.roofClosed) * Math.min(1, dt * 2.6);
      }
      const c = this.roofClosed;
      this.roof.group.visible = c > 0.01;
      this.roof.group.position.y = (1 - c) * 2.4;
      for (const m of this.roof.mats) { m.opacity = Math.min(1, c * 1.4); m.depthWrite = c > 0.9; }
    }
    if (this.ext) { this.ext.update(t, (this.weather?.wind ?? 8) / 20); this.ext.group.visible = !this.walk || true; }
    if (this.ceilings) this.ceilings.visible = !!this.walk;
    this.onFrame?.();
    this.beams.update(this._sunDirReal || new THREE.Vector3(0, 1, 0), this.opts.sunBeams === false ? 0 : (this._beamK || 0), t);
    // relâmpago: avisa o app (som de trovão)
    if (this.weatherFx.flash > 0.9 && !(this._lastFlash > 0.9)) this.container.dispatchEvent(new CustomEvent('thunder', { bubbles: true }));
    this._lastFlash = this.weatherFx.flash;
    // contorno do que está sob o mouse
    this._updateOutline();
    const N = this.night;
    this.sky.follow(this.camera);
    if (this.opts.weather) this.weatherFx.update(dt, t, this.quality === 'low' ? 700 : this.quality === 'medium' ? 1500 : 2200);
    else { this.weatherFx.rain.visible = this.weatherFx.snow.visible = false; }
    // foco no cômodo: desfoque em volta, resto escurecido, paredes da frente abaixam
    this._updateCutaway();
    const focusGoal = this.selectedRoom && !this.idle && !this.walk && !this.mode2d ? 1 : 0;
    this.focusAmt += (focusGoal - this.focusAmt) * Math.min(1, dt * 3);
    if (this._focusCenter) {
      const v = this._focusCenter.clone().project(this.camera);
      this.finish.uniforms.focusC.value.set((v.x + 1) / 2, (v.y + 1) / 2);
      const edge = this._focusCenter.clone().add(new THREE.Vector3(this._focusSize * 0.62, 0, 0)).project(this.camera);
      this.finish.uniforms.focusR.value = Math.max(0.12, Math.abs(edge.x - v.x) / 2 * (this.camera.aspect) * 1.05);
    }
    this.finish.uniforms.blur.value = this.quality === 'low' ? 0 : this.focusAmt;
    this.finish.uniforms.time.value = t;
    for (const w of this.walls) {
      if (!this.intro) w.k += (w.goal - w.k) * Math.min(1, dt * 5);
      const k = Math.max(0.001, w.k * flat);
      for (const m of w.parts) {
        if (m === w.parts[0]) { m.scale.y = k; m.position.y = w.y0 + w.hh * k / 2; m.visible = w.hh * k > 0.004; }
        else { m.position.y = (w.y0 + w.hh * k) + 0.005; m.visible = w.hh * k > 0.004; }
      }
    }
    // janelas e portas de paredes cortadas somem junto
    for (const x of [...this.windows, ...this.doors]) {
      const o = x.g || x.pivot; if (!o) continue;
      x.k += ((x.cut ? 0 : 1) - x.k) * Math.min(1, dt * 5);
      for (const q of [o, ...(x.extra || []).map(e => e.pivot)]) { q.scale.y = Math.max(0.001, x.k * flat); q.visible = x.k > 0.02; }
      if (Math.abs((x.cut ? 0 : 1) - x.k) > 0.002) this._shadowDirty = Math.max(this._shadowDirty, 1);
    }
    // portas: abrem ao passar o mouse ou quando o cômodo está em foco
    this.doors.forEach((d, i) => {
      d.goal = (this._hoverDoor === i || (this.selectedRoom && d.rooms.includes(this.selectedRoom))) ? 1.45 : 0.15;
      d.angle += (d.goal - d.angle) * Math.min(1, dt * 4);
      for (const e of d.leaves || [{ swing: d.swing, dir: -1 }]) e.swing.rotation.y = e.dir * d.angle;
    });
    // janelas brilham à noite quando o cômodo tem luz acesa
    for (const win of this.windows) {
      const lit = win.rooms.some(rid => rid && ((this.rooms.get(rid)?.glow || 0) > 0.2 || this.lamps.some(lp => lp.k > 0.3 && lp.room === rid)));
      win.mat.emissiveIntensity += ((lit ? 0.9 * N : 0) - win.mat.emissiveIntensity) * Math.min(1, dt * 3);
      win.mat.opacity = (win.mat.userData.baseOp ?? 0.28) + N * 0.15;
    }
    // telas de TV
    for (const sc of this.tvScreens) {
      sc.on += (sc.goal - sc.on) * Math.min(1, dt * 4);
      const hue = 0.55 + 0.08 * Math.sin(t * 0.7) + 0.04 * Math.sin(t * 2.3);
      sc.mesh.material.emissive.setHSL(hue, 0.45, 0.5).multiplyScalar(sc.on * (0.55 + 0.1 * Math.sin(t * 5.1) * Math.sin(t * 1.7)));
    }
    // vista dos rótulos e do resto da casa com foco
    for (const [id, r] of this.rooms) for (const p of r.parts) p.mat.color.copy(p.base || WHITE).multiplyScalar(1 - 0.38 * this.focusAmt * (id === this.selectedRoom && (!this.selectedArea || p.room.id === this.selectedArea) ? 0 : 1));
    for (const [id, r] of this.rooms) {
      r.glow += (r.glowGoal - r.glow) * Math.min(1, dt * (r.glow > r.glowGoal ? 1.6 : 4));
      const sel = id === this.selectedRoom && !this.selectedArea, hov = id === this._hoverRoom;
      const pulse = 1 + Math.sin(t * 1.6) * 0.06;
      const lift = sel ? 0.05 : hov ? 0.025 : 0;
      for (const p of r.parts) {
        p.mat.emissive.copy(r.color).multiplyScalar((0.06 + 0.16 * N) * r.glow * pulse).addScalar(lift);
        p.I = (2.2 + 5 * N) * r.glow / Math.sqrt(r.parts.length); p.color = r.color;
      }
      r.outline.material.opacity += ((sel ? 0.55 : hov ? 0.25 : 0) - r.outline.material.opacity) * 0.15;
    }
    for (const [, v] of this.devs) {
      const u = v.g.userData;
      if (u.fan) { u.spin += ((v.on ? 18 : 0) - u.spin) * Math.min(1, dt * (v.on ? 1.2 : 0.6)); u.fan.rotation.z += u.spin * dt; u.head.rotation.y = v.on ? Math.sin(t * 0.5) * 0.6 : u.head.rotation.y * 0.98; }
      if (v.type === 'ac') {
        const c = v.mode === 'HEAT' ? COLORS.heat : v.mode === 'FAN' ? COLORS.fan : COLORS.cool;
        const lg = v.on ? (v.swing ? 0.75 + Math.sin(t * 1.4) * 0.35 : 0.85) : 0;
        u.louver += (lg - u.louver) * Math.min(1, dt * 3); u.louverPivot.rotation.x = u.louver;
        u.led.material.color.copy(v.on ? c : new THREE.Color('#333'));
        u.pts.visible = v.on;
        u.pts.material.color.copy(c);
        if (v.on) {
          const a = u.pts.geometry.attributes.position;
          for (let i = 0; i < u.seeds.length; i++) {
            const s = (u.seeds[i] + t * 0.35) % 1;
            const spread = (u.seeds[(i * 7) % u.seeds.length] - 0.5);
            a.setXYZ(i, spread * (0.8 + s * 1.2), -0.12 - s * 1.5, 0.15 + s * 1.6);
          }
          a.needsUpdate = true;
          u.pts.material.opacity = 0.65;
        }
      } else {
        const tgt = v.on ? 1 : 0;
        if (u.plate) { // espelho: as teclas acendem; um halo bem leve atrás da placa
          u.anim = animatePlate(u.keys, v.chans || [v.on], dt);
          u.ring.material.opacity = 0; u.ring.visible = false; // a luz fica nas teclas (sem halo atrás da placa)
          continue;
        }
        u.ring.material.opacity += (tgt * 0.9 - u.ring.material.opacity) * 0.1;
        u.beam.material.opacity += (tgt * 0.35 - u.beam.material.opacity) * 0.1;
        u.ring.scale.setScalar(1 + (v.on ? Math.sin(t * 2.5) * 0.08 : 0));
        u.body.material.emissive.set(v.on ? '#3a2a10' : '#000000');
      }
    }
    for (const lp of this.lamps) {
      if (lp.goal > lp.k) lp.k = Math.min(1, lp.k + dt / 0.45); else if (lp.goal < lp.k) lp.k = Math.max(0, lp.k - dt / 0.3);
      let k = lp.k * lp.k * (3 - 2 * lp.k);
      if (lp.flick > 0) { lp.flick -= dt; k *= 0.55 + 0.45 * Math.abs(Math.sin(t * 61) * Math.sin(t * 23)); }
      for (const m of lp.bulbs) m.emissiveIntensity = k * (1.6 + 1.4 * N) * lp.bulbK;
      for (const m of lp.glowMats) m.emissiveIntensity = k * (0.2 + 0.3 * N);
      for (const b of lp.beams) { b.m.material.opacity = k * b.max * (0.45 + 0.9 * N); b.m.visible = b.m.material.opacity > 0.002; } // apagada: o cone some de verdade
      lp.pool.material.uniforms.op.value = k * (0.12 + 0.32 * N) * Math.min(1, lp.power);
      lp.I = k * (0.22 + 0.75 * N) * lp.power;
    }
    this._assignLights();
    // portas, paredes, telhado e sol em movimento mudam as sombras
    if (this.intro || this.doors.some(d => Math.abs(d.goal - d.angle) > 0.002) || this.walls.some(w => Math.abs(w.goal - w.k) > 0.002) ||
        (this.roof && Math.abs(this.roofClosed - (this._lastRoof ?? -1)) > 0.002) || this.timelapse || this.camTween && this.mode2d) this._shadowDirty = 1;
    this._lastRoof = this.roofClosed;
    if (this._lastFlatS !== this._lastFlat) { this._lastFlatS = this._lastFlat; this._shadowDirty = 1; }
    if (this._shadowDirty) { this.renderer.shadowMap.needsUpdate = true; this._shadowDirty--; }
    this._updateRipples(dt);
    // sombra de contato (a parte mais pesada) só com a câmera parada; enquanto ela se move, fica de fora
    if (this.quality === 'high') { if (camMoving) this._aoHold = now + 260; this.ao.enabled = now > (this._aoHold || 0); }
    this.composer.render();
    this._positionOverlay();
    this._nextFps(now, camMoving, focusGoal);
  }
  _nextFps(now, camMoving, focusGoal) {
    if (!this._lastCam) { this._lastCam = new THREE.Vector3(); this._lastTgt = new THREE.Vector3(); }
    this._lastCam.copy(this.camera.position); this._lastTgt.copy(this.controls.target);
    const roofMoving = this.roof && Math.abs(this.roofClosed - (this._prevRoofF ?? this.roofClosed)) > 1e-4; this._prevRoofF = this.roofClosed;
    const fx = this.weatherFx, cutGoal = x => (x.cut ? 0 : 1);
    const idleSpin = this.idle && !this.intro && !this.camTween && !this._camGoal && now > this._kickT + 1200;
    const busy = (camMoving && !idleSpin) || roofMoving || this.intro || this.camTween || this._camGoal || this.timelapse || this.walk || now < this._kickT + 1200 ||
      Math.abs(this.t2d - (this.mode2d ? 1 : 0)) > 0.002 || this.walls.some(w => Math.abs(w.goal - w.k) > 0.002) || this.doors.some(d => Math.abs(d.goal - d.angle) > 0.002) ||
      [...this.windows, ...this.doors].some(x => x.k !== undefined && Math.abs(cutGoal(x) - x.k) > 0.003) || this.lamps.some(l => l.k !== l.goal || l.flick > 0) ||
      [...this.rooms.values()].some(r => Math.abs(r.glow - r.glowGoal) > 0.003) || this.ripples.length || Math.abs(this.focusAmt - focusGoal) > 0.003 ||
      Math.abs(this.night - (this.isNightNow() ? 1 : 0)) > 0.002 || fx.flash > 0 || Math.abs(fx.intensity - fx.goal) > 0.003 || this.tvScreens.some(sc => Math.abs(sc.on - sc.goal) > 0.003) ||
      [...this.devs.values()].some(v => (v.g.userData.fan && Math.abs(v.g.userData.spin - (v.on ? 18 : 0)) > 0.3) || v.g.userData.anim);
    const ambient = fx.rain.visible || fx.snow.visible || fx.kind === 'storm' || this.tvScreens.some(sc => sc.on > 0.01) ||
      [...this.devs.values()].some(v => (v.type === 'ac' && v.on) || (v.g.userData.fan && v.g.userData.spin > 0.05));
    const beams = this.opts.sunBeams !== false && (this._beamK || 0) > 0.05;
    const bg = !document.hasFocus();
    // no editor da planta só redesenha quando algo muda (sem animações de ambiente)
    this._fps = busy ? 60 : this.builder ? 1 : idleSpin ? (bg ? 15 : 30) : ambient ? (bg || this.quality === 'low' ? 10 : 20) : beams ? (bg ? 5 : 10) : 1;
  }

  setLabelMode(m) { this.labelMode = m; this._frameN = 0; }

  // Rótulos: "min" = só ícones e nomes discretos (detalhes no hover/seleção), "full" = tudo, "none" = só ícones
  _positionOverlay() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    const mode = this.labelMode, sel = this.selectedRoom, hovR = this._hoverRoom || this._hoverLabel;
    const items = [];
    for (const [id, r] of this.rooms) {
      const hideL = !!this.walk; // no passeio os nomes dos cômodos saem da frente
      if (r.label._hid !== hideL) { r.label._hid = hideL; r.label.style.display = hideL ? 'none' : ''; for (const a of r.areaLabels) a.el.style.display = hideL ? 'none' : ''; }
      if (hideL) continue;
      v.copy(r.labelPos); v.project(this.camera);
      r.label.style.transform = `translate(-50%,-50%) translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px)`;
      const focus = id === sel || id === hovR;
      const areaSel = id === sel && this.selectedArea; // com uma área escolhida, o nome do ambiente inteiro sai da frente
      const cls = 'room-label' + (r.label.classList.contains('active') ? ' active' : '') + (id === sel && !areaSel ? ' selected' : '') +
        (areaSel ? ' gone' : focus || mode === 'full' ? '' : (mode === 'none' || r.areaLabels.length) ? ' gone' : ' minimal') + (r.label._culled ? ' culled' : '');
      if (r.label._cls !== cls) { r.label.className = cls; r.label._cls = cls; }
      items.push({ el: r.label, pri: focus ? 5 : mode === 'full' ? 2 : 1 });
      for (const a of r.areaLabels) {
        v.copy(a.pos); v.project(this.camera);
        a.el.style.transform = `translate(-50%,-50%) translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px)`;
        const aSel = id === sel && a.id === this.selectedArea;
        const acls = 'area-label' + (aSel ? ' area-sel' : mode === 'none' ? ' gone' : '') + (a.el._culled && !aSel ? ' culled' : '');
        if (a.el._cls !== acls) { a.el.className = acls; a.el._cls = acls; }
        items.push({ el: a.el, pri: aSel ? 6 : 1.5 });
      }
    }
    for (const [id, d] of this.devs) {
      v.copy(d.anchor); d.g.localToWorld(v); v.project(this.camera);
      d.pin.style.transform = `translate(-50%,-100%) translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px)`;
      d.pin.style.display = v.z > 1 ? 'none' : '';
      const expanded = mode === 'full' || id === this._hoverDev || id === this._hoverDev3d || (d.room && (d.room === sel || d.room === hovR));
      const cls = (d.baseClass || 'dev-pin') + (expanded ? '' : ' compact') + (d.pin._culled ? ' culled' : '');
      if (d.pin._cls !== cls) { d.pin.className = cls; d.pin._cls = cls; }
      items.push({ el: d.pin, pri: id === this._hoverDev ? 6 : expanded ? 4 : 3 });
    }
    // etiqueta flutuante do aparelho sob o mouse
    const tipId = !this.walk && !this.intro && !this.idle ? (this._hoverDev || this._hoverDev3d) : null;
    if (tipId && this.opts.tipFor && this.devs.get(tipId)) {
      const d = this.devs.get(tipId);
      if (!this.tip.isConnected) this.overlay.appendChild(this.tip);
      const now = performance.now();
      if (this.tip._id !== tipId || now - (this.tip._t || 0) > 900) { this.tip.innerHTML = this.opts.tipFor(tipId) || ''; this.tip._id = tipId; this.tip._t = now; }
      v.copy(d.anchor); d.g.localToWorld(v); v.project(this.camera);
      this.tip.style.transform = `translate(-50%,-100%) translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h - 40}px)`;
      this.tip.classList.add('show');
    } else if (this.tip.classList.contains('show')) { this.tip.classList.remove('show'); this.tip._id = null; }
    // esconde o que se sobrepõe (mantém o mais importante), a cada poucos quadros
    if (this._frameN++ % 4) return;
    items.sort((a, b) => b.pri - a.pri);
    const kept = [];
    for (const it of items) {
      if (it.el.style.display === 'none' || it.el.classList.contains('gone')) continue;
      const r = it.el.getBoundingClientRect();
      const pad = 3;
      const hit = kept.some(k => r.left < k.right + pad && r.right > k.left - pad && r.top < k.bottom + pad && r.bottom > k.top - pad);
      const cull = hit && it.pri < 6;
      it.el._culled = cull; it.el.classList.toggle('culled', cull);
      it.el._cls = it.el.className;
      if (!cull) kept.push(r);
    }
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.group.children, true);
    for (const h of hits) {
      if (h.object.userData.roof) { if (this.roof?.group.visible && this.roofClosed > 0.5) return { roof: true }; continue; }
      if (h.object.userData.doorIdx !== undefined) return { door: h.object.userData.doorIdx, point: h.point };
      if (this.walk && h.object.userData.roomId && h.object.geometry?.type === 'PlaneGeometry') return { floor: h.point, room: h.object.userData.roomId };
      if (h.object.userData.deviceId) return { device: h.object.userData.deviceId };
      if (h.object.userData.outside) return { outside: true };
      if (h.object.userData.roomId) return { room: h.object.userData.roomId, area: h.object.userData.areaId };
      if (h.object.type === 'Mesh' && h.object.geometry.type === 'BoxGeometry') return {};
    }
    return { outside: true }; // nada da casa sob o clique
  }
  _hover(e) {
    const p = this._pick(e);
    this._hoverRoom = p.room || null;
    this._hoverDoor = p.door ?? null;
    this._hoverRoof = !!p.roof;
    this._hoverDev3d = p.device || null;
    this.renderer.domElement.style.cursor = p.device || p.room ? 'pointer' : 'grab';
  }
  _click(e) {
    const p = this._pick(e);
    if (p.roof) { this._roofOpened = true; this.frame(); return; } // clicar no telhado abre a casa
    if (p.device) return this.onDevice(p.device);
    if (this.walk) { if (p.floor) this.walk.goal = p.floor.clone(); else if (p.door != null && p.point) this.walk.goal = p.point.clone(); return; }
    if (p.room) return this.onRoom(p.room, p.area);
    if (p.outside) this.onEmpty?.(); // clicou fora da casa: desmarca
  }
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmt(n) { return typeof n === 'number' ? (Math.round(n * 10) / 10).toString().replace('.', ',') : '--'; }
function modeClass(m) { return m === 'HEAT' ? 'heat' : m === 'FAN' ? 'fan' : 'cool'; }
const ICON_AC = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="8" rx="2"/><path d="M7 17v2M12 17v3M17 17v2"/></svg>';
const ICON_BULB = '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>';
// interruptor, lâmpada ou aparelho de várias teclas: ícone de lâmpada (não é tomada)
const isLightish = d => d.type === 'switch' || d.type === 'light' || (d.state?.channels?.length || 0) > 1 || /interrup|l[aâ]mpad|\bluz\b|lumin|spot|pendente|abajur/i.test(d.name || '');
const ICON_PLUG = '<svg viewBox="0 0 24 24"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/></svg>';

// ---------------- planta livre: utilidades ----------------
// reorganiza uma geometria em 3 grupos de material: faces viradas para +z, para -z e o resto (bordas)
function byNormalZ(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo, pos = g.attributes.position, uv = g.attributes.uv, n = pos.count / 3;
  const buckets = [[], [], []], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
    const nz = b.clone().sub(a).cross(c.clone().sub(a)).normalize().z;
    buckets[nz > 0.7 ? 0 : nz < -0.7 ? 1 : 2].push(t);
  }
  const P = [], U = [], out = new THREE.BufferGeometry(); let start = 0;
  buckets.forEach((list, gi) => {
    for (const t of list) for (let k = 0; k < 3; k++) { const i = t * 3 + k; P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); if (uv) U.push(uv.getX(i), uv.getY(i)); }
    out.addGroup(start, list.length * 3, gi); start += list.length * 3;
  });
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  out.computeVertexNormals(); geo.dispose(); return out;
}
function segDist(px, py, w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / L2));
  return Math.hypot(px - (w.x1 + dx * t), py - (w.y1 + dy * t));
}
// polígono afastado "e" para fora (base da maquete)
function offsetPoly(poly, e) {
  const n = poly.length, out = [];
  let a = 0; for (let i = 0, j = n - 1; i < n; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  const s = a > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const d1 = norm2(p1[0] - p0[0], p1[1] - p0[1]), d2 = norm2(p2[0] - p1[0], p2[1] - p1[1]);
    const n1 = [d1[1] * s, -d1[0] * s], n2 = [d2[1] * s, -d2[0] * s];
    const k = Math.min(3, 1 / Math.max(0.2, 1 + n1[0] * n2[0] + n1[1] * n2[1]));
    out.push([p1[0] + (n1[0] + n2[0]) * e * k, p1[1] + (n1[1] + n2[1]) * e * k]);
  }
  return out;
}
function norm2(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

// acabamentos de parede: textura aplicada em coordenadas do mundo (contínua entre trechos e acima/abaixo das janelas)
const WALL_DEF = {
  brick: { size: 0.9, base: '#b8664a', draw: (c, S) => {
    c.fillStyle = '#d9cfc0'; c.fillRect(0, 0, S, S);
    const rows = 12, bh = S / rows, bw = S / 4;
    for (let r = 0; r < rows; r++) for (let i = -1; i < 5; i++) {
      const v = 0.86 + ((r * 7 + i * 3) % 5) / 25;
      c.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(235 * v)},${Math.round(225 * v)})`;
      c.fillRect(i * bw + (r % 2) * bw / 2 + 2, r * bh + 2, bw - 4, bh - 4);
    } } },
  tile: { size: 0.6, base: '#f2f2f0', draw: (c, S) => {
    c.fillStyle = '#c9c6c0'; c.fillRect(0, 0, S, S);
    const n = 4, t = S / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 248 - ((i + j * 2) % 3) * 3; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(i * t + 2, j * t + 2, t - 4, t - 4); } } },
  wood: { size: 0.8, base: '#a8754d', draw: (c, S) => {
    const n = 8, w = S / n; for (let i = 0; i < n; i++) { const v = 0.85 + ((i * 5) % 7) / 30; c.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(240 * v)},${Math.round(225 * v)})`; c.fillRect(i * w, 0, w, S);
      c.fillStyle = 'rgba(40,20,10,0.35)'; c.fillRect(i * w, 0, 3, S); c.globalAlpha = 0.06; c.fillStyle = '#000'; for (let k = 0; k < 10; k++) c.fillRect(i * w + Math.random() * w, 0, 1, S); c.globalAlpha = 1; } } },
  stone: { size: 1.2, base: '#b9b2a6', draw: (c, S) => {
    c.fillStyle = '#7d766c'; c.fillRect(0, 0, S, S);
    let y = 0; while (y < S) { const h = S / 8 * (0.7 + Math.random() * 0.6); let x = -Math.random() * 40; while (x < S) { const w = S / 4 * (0.6 + Math.random() * 0.8), v = 0.8 + Math.random() * 0.25; c.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(250 * v)},${Math.round(240 * v)})`; c.fillRect(x + 3, y + 3, w - 6, h - 6); x += w; } y += h; } } },
  concrete: { size: 2.0, base: '#b4b0aa', draw: (c, S) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, S, S);
    for (let k = 0; k < 3000; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.07})`; const r = Math.random() * 6; c.fillRect(Math.random() * S, Math.random() * S, r, r); } } },
};
const wallTexCache = {};
function wallFinishMaterial(finish, color, warm, vs) {
  const def = WALL_DEF[finish];
  if (!def) return plasterMaterial(color || (warm ? '#eadfcf' : '#e2e0dc'), warm ? 0.4 : 1);
  if (!wallTexCache[finish]) {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; def.draw(cv.getContext('2d'), S);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    wallTexCache[finish] = t;
  }
  const m = new THREE.MeshStandardMaterial({ map: wallTexCache[finish], color: color || def.base, roughness: finish === 'tile' ? 0.35 : 0.85 });
  const sc = (1 / def.size).toFixed(4), vy = (1 / Math.max(0.1, vs)).toFixed(4);
  m.customProgramCacheKey = () => 'wallfin' + sc + ':' + vy;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <map_fragment>', `vec3 nW = normalize(vWN);
        vec2 tuv = abs(nW.y) > 0.5 ? vWP.xz : vec2(dot(vWP.xz, vec2(-nW.z, nW.x)), vWP.y * ${vy});
        diffuseColor *= texture2D(map, tuv * ${sc});`);
  };
  return m;
}

// ---------------- pisos com textura procedural ----------------
const FLOOR_DEF = {
  wood: { size: 2.0, draw: (c, S) => {
    const pw = S / 10, pl = S / 1.6;
    for (let i = 0; i < 10; i++) {
      let y0 = -((i * 37) % 7) / 7 * pl;
      for (let y = y0; y < S; y += pl) {
        const t = 0.82 + ((i * 13 + Math.round(y)) % 9) / 50;
        c.fillStyle = `rgb(${Math.round(108 * t)},${Math.round(84 * t)},${Math.round(64 * t)})`;
        c.fillRect(i * pw, y, pw, pl);
        c.globalAlpha = 0.08; c.fillStyle = '#000';
        for (let k = 0; k < 6; k++) c.fillRect(i * pw + Math.random() * pw, y, 1, pl);
        c.globalAlpha = 1; c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(i * pw, y, pw, 1.5);
      }
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(i * pw, 0, 1.5, S);
    } } },
  porcelain: { size: 1.2, draw: (c, S) => {
    const n = 2, t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 150 + ((i + j * 3) % 3) * 4; c.fillStyle = `rgb(${v},${v - 2},${v - 5})`; c.fillRect(i * t, j * t, t, t); }
    c.fillStyle = 'rgba(80,78,74,0.55)'; for (let i = 0; i <= n; i++) { c.fillRect(i * t - 1, 0, 2, S); c.fillRect(0, i * t - 1, S, 2); } } },
  tile: { size: 0.6, draw: (c, S) => {
    const n = 2, t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 178 + ((i * 2 + j) % 3) * 4; c.fillStyle = `rgb(${v},${v},${v - 3})`; c.fillRect(i * t, j * t, t, t); }
    c.fillStyle = 'rgba(120,118,114,0.8)'; for (let i = 0; i <= n; i++) { c.fillRect(i * t - 2, 0, 4, S); c.fillRect(0, i * t - 2, S, 4); } } },
  concrete: { size: 2.0, draw: (c, S) => {
    c.fillStyle = '#8b8986'; c.fillRect(0, 0, S, S);
    for (let k = 0; k < 2500; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.06})`; const r = Math.random() * 6; c.fillRect(Math.random() * S, Math.random() * S, r, r); } } },
  carpet: { size: 1.0, draw: (c, S) => {
    c.fillStyle = '#6f675d'; c.fillRect(0, 0, S, S);
    for (let k = 0; k < 6000; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`; c.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5); } } },
  plain: { size: 1, draw: (c, S) => { c.fillStyle = '#3a3a3a'; c.fillRect(0, 0, S, S); } },
};
// pisos do estilo maquete: madeira quente e clara, porcelanato e cerâmica creme
const WARM_DEF = {
  wood: { draw: (c, S) => {
    const n = 8, pw = S / n, pl = S / 1.4;
    for (let i = 0; i < n; i++) {
      for (let y = -((i * 37) % 7) / 7 * pl; y < S; y += pl) {
        const t = 0.9 + ((i * 13 + Math.round(y)) % 7) / 45;
        c.fillStyle = `rgb(${Math.round(156 * t)},${Math.round(101 * t)},${Math.round(64 * t)})`; c.fillRect(i * pw, y, pw, pl);
        c.globalAlpha = 0.07; c.fillStyle = '#3a2010';
        for (let k = 0; k < 7; k++) { const x = i * pw + Math.random() * pw; c.fillRect(x, y, 1 + Math.random() * 1.5, pl); }
        c.globalAlpha = 1; c.fillStyle = 'rgba(60,30,15,0.28)'; c.fillRect(i * pw, y, pw, 1.5);
      }
      c.fillStyle = 'rgba(60,30,15,0.28)'; c.fillRect(i * pw, 0, 1.5, S);
    } } },
  porcelain: { draw: (c, S) => {
    const n = 2, t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 222 + ((i + j * 3) % 3) * 3; c.fillStyle = `rgb(${v},${v - 6},${v - 14})`; c.fillRect(i * t, j * t, t, t); }
    c.fillStyle = 'rgba(150,135,118,0.45)'; for (let i = 0; i <= n; i++) { c.fillRect(i * t - 1, 0, 2, S); c.fillRect(0, i * t - 1, S, 2); } } },
  tile: { draw: (c, S) => {
    const n = 2, t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 232 + ((i * 2 + j) % 3) * 3; c.fillStyle = `rgb(${v},${v - 4},${v - 10})`; c.fillRect(i * t, j * t, t, t); }
    c.fillStyle = 'rgba(170,158,142,0.7)'; for (let i = 0; i <= n; i++) { c.fillRect(i * t - 2, 0, 4, S); c.fillRect(0, i * t - 2, S, 4); } } },
  concrete: { draw: (c, S) => {
    c.fillStyle = '#c4bbb0'; c.fillRect(0, 0, S, S);
    for (let k = 0; k < 2500; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '60,40,20' : '255,255,255'},${Math.random() * 0.05})`; const r = Math.random() * 6; c.fillRect(Math.random() * S, Math.random() * S, r, r); } } },
  carpet: { draw: (c, S) => {
    c.fillStyle = '#d2c3ad'; c.fillRect(0, 0, S, S);
    for (let k = 0; k < 6000; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '80,60,40' : '255,255,255'},${Math.random() * 0.08})`; c.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5); } } },
  plain: { draw: (c, S) => { c.fillStyle = '#d9cfc2'; c.fillRect(0, 0, S, S); } },
};
const texCache = {};
function floorTexture(type, warm) {
  const key = type + (warm ? ':w' : '');
  if (texCache[key]) return texCache[key];
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  ((warm && WARM_DEF[type]) || FLOOR_DEF[type] || FLOOR_DEF.plain).draw(cv.getContext('2d'), S);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (texCache[key] = t);
}
function floorMaterial(type, w, h, warm) {
  const def = FLOOR_DEF[type] || FLOOR_DEF.plain;
  const map = floorTexture(type, warm).clone(); map.needsUpdate = true;
  map.repeat.set(w / def.size, h / def.size);
  if (type === 'porcelain' || type === 'concrete') { // piso polido: reflexo do ambiente e brilho das luzes
    return new THREE.MeshPhysicalMaterial({ map, color: '#ffffff', roughness: type === 'porcelain' ? 0.16 : 0.32, metalness: 0,
      clearcoat: type === 'porcelain' ? 0.7 : 0.35, clearcoatRoughness: 0.08, envMapIntensity: 1.25, emissive: new THREE.Color(0), emissiveIntensity: 1 });
  }
  return new THREE.MeshStandardMaterial({
    map, color: '#ffffff', roughness: type === 'tile' ? 0.42 : type === 'wood' ? 0.55 : 0.85,
    metalness: 0, emissive: new THREE.Color(0), emissiveIntensity: 1,
  });
}

// parede com textura de reboco: ruído em coordenadas do mundo (não estica nas paredes compridas)
function plasterMaterial(color, amt = 1) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  m.customProgramCacheKey = () => 'plaster' + amt;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP;
      float h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb *= 1. - ${(0.035 * amt).toFixed(4)} + ${(0.05 * amt).toFixed(4)} * n3(vWP * 34.) + ${(0.025 * amt).toFixed(4)} * n3(vWP * 7.);`);
  };
  return m;
}

const ICON_TV = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';
