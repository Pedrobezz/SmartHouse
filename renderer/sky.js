// Céu, sol e lua de verdade (posição pela hora e localização) e clima (chuva, garoa, neve, neblina, trovão)
import * as THREE from 'three';

// ---------------- astronomia (algoritmos do SunCalc, simplificados) ----------------
const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
const toDays = d => d.valueOf() / dayMs - 0.5 + J1970 - J2000;
const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const azimuth = (H, phi, d) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi));
const altitude = (H, phi, d) => Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
function sunCoords(d) {
  const M = rad * (357.5291 + 0.98560028 * d);
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
  return { dec: dec(L, 0), ra: ra(L, 0) };
}
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dist = 385001 - 20905 * Math.cos(M);
  return { ra: ra(l, b), dec: dec(l, b), dist };
}
export function celestial(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const s = sunCoords(d), Hs = sidereal(d, lw) - s.ra;
  const m = moonCoords(d), Hm = sidereal(d, lw) - m.ra;
  const sdist = 149598000;
  const p = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(p), m.dist - sdist * Math.cos(p));
  return {
    sun: { az: azimuth(Hs, phi, s.dec), alt: altitude(Hs, phi, s.dec) },
    moon: { az: azimuth(Hm, phi, m.dec), alt: altitude(Hm, phi, m.dec), frac: (1 + Math.cos(inc)) / 2 },
  };
}
// azimute do SunCalc (a partir do sul, positivo para oeste) -> vetor na cena (planta: "para cima" = norte girado de northDeg)
export function dirFrom(az, alt, northDeg = 0) {
  const bearing = az + Math.PI - northDeg * rad; // a partir do norte, sentido horário
  const c = Math.cos(alt);
  return new THREE.Vector3(Math.sin(bearing) * c, Math.sin(alt), -Math.cos(bearing) * c).normalize();
}

// ---------------- céu ----------------
export class SkyDome {
  constructor(scene) {
    this.uniforms = { top: { value: new THREE.Color('#0b0c10') }, horizon: { value: new THREE.Color('#16181d') }, bottom: { value: new THREE.Color('#050505') }, flash: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform vec3 top, horizon, bottom; uniform float flash; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0. ? mix(horizon, top, pow(smoothstep(0., .6, h), .8)) : mix(horizon, bottom, smoothstep(0., .25, -h));
          gl_FragColor = vec4(c + flash * vec3(.55,.6,.75), 1.); }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), mat);
    this.mesh.renderOrder = -10; this.mesh.raycast = () => {};
    scene.add(this.mesh);
    // estrelas
    const N = 1400, pos = new Float32Array(N * 3), size = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 * Math.PI, v = Math.acos(1 - Math.random() * 0.95);
      pos.set([Math.sin(v) * Math.cos(u) * 130, Math.cos(v) * 130, Math.sin(v) * Math.sin(u) * 130], i * 3);
      size[i] = Math.random();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('s', new THREE.BufferAttribute(size, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, uniforms: { op: { value: 0 }, t: { value: 0 } },
      vertexShader: 'attribute float s; varying float vs; uniform float t; void main(){ vs = s; gl_PointSize = 1. + s * 2.2; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'varying float vs; uniform float op, t; void main(){ float d = length(gl_PointCoord - .5); float tw = .75 + .25 * sin(t * (1.5 + vs * 3.) + vs * 40.); gl_FragColor = vec4(vec3(.85,.9,1.), op * tw * smoothstep(.5, .1, d)); }',
    });
    this.stars = new THREE.Points(g, this.starMat); this.stars.raycast = () => {};
    scene.add(this.stars);
  }
  follow(cam) { this.mesh.position.copy(cam.position); this.stars.position.copy(cam.position); }
}

// ---------------- clima ----------------
// códigos WMO do Open-Meteo
export function weatherKind(code) {
  if (code == null) return { kind: 'clear', rain: 0, label: '' };
  if (code === 0) return { kind: 'clear', rain: 0, label: 'Céu limpo', icon: 'sun' };
  if (code <= 2) return { kind: 'partly', rain: 0, label: 'Poucas nuvens', icon: 'sun' };
  if (code === 3) return { kind: 'cloudy', rain: 0, label: 'Nublado', icon: 'cloud' };
  if (code === 45 || code === 48) return { kind: 'fog', rain: 0, label: 'Neblina', icon: 'cloud' };
  if (code >= 51 && code <= 57) return { kind: 'rain', rain: 0.3, label: 'Garoa', icon: 'drop' };
  if (code >= 61 && code <= 67) return { kind: 'rain', rain: code === 61 ? 0.5 : code === 63 ? 0.75 : 1, label: code === 65 ? 'Chuva forte' : 'Chuva', icon: 'drop' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', rain: 0.6, label: 'Neve', icon: 'snow' };
  if (code >= 80 && code <= 82) return { kind: 'rain', rain: code === 80 ? 0.55 : code === 81 ? 0.8 : 1, label: 'Pancadas de chuva', icon: 'drop' };
  if (code >= 95) return { kind: 'storm', rain: 1, label: 'Tempestade', icon: 'bolt' };
  return { kind: 'cloudy', rain: 0, label: 'Nublado', icon: 'cloud' };
}

export class WeatherFx {
  constructor(scene, count = 2200) {
    this.scene = scene; this.count = count; this.intensity = 0; this.goal = 0; this.kind = 'clear'; this.flash = 0; this.nextBolt = 5;
    const pos = new Float32Array(count * 6), seed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) seed.set([Math.random(), Math.random(), Math.random()], i * 3);
    this.seed = seed;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#b8cdf0', transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.raycast = () => {};
    scene.add(this.rain);
    const sp = new Float32Array(count * 3), sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.06, transparent: true, opacity: 0, depthWrite: false }));
    this.snow.frustumCulled = false; this.snow.raycast = () => {};
    scene.add(this.snow);
    this.box = { w: 20, d: 20, h: 9 }; this.wind = new THREE.Vector2(0.15, 0.05);
  }
  setArea(w, d) { this.box.w = w + 10; this.box.d = d + 10; }
  set(w, northDeg = 0) {
    const k = weatherKind(w?.code);
    this.kind = k.kind; this.goal = k.rain;
    const sp = Math.min(1.2, (w?.wind || 8) / 25); // vento inclina a chuva
    const a = ((w?.windDir || 0) + 180 - northDeg) * rad;
    this.wind.set(Math.sin(a) * sp, -Math.cos(a) * sp);
  }
  update(dt, t, maxCount) {
    this.intensity += (this.goal - this.intensity) * Math.min(1, dt * 0.8);
    const I = this.intensity, { w, d, h } = this.box;
    const n = Math.floor(Math.min(this.count, maxCount ?? this.count) * Math.min(1, I));
    const snow = this.kind === 'snow';
    this.rain.visible = !snow && n > 0; this.snow.visible = snow && n > 0;
    if (n > 0) {
      const s = this.seed;
      if (!snow) {
        const a = this.rain.geometry.attributes.position, len = 0.45, spd = 11;
        for (let i = 0; i < this.count; i++) {
          if (i >= n) { a.setXYZ(i * 2, 0, -99, 0); a.setXYZ(i * 2 + 1, 0, -99, 0); continue; }
          const y = h - ((s[i * 3 + 1] * h + t * spd * (0.85 + s[i * 3 + 2] * 0.3)) % h);
          const x = (s[i * 3] - 0.5) * w + this.wind.x * (h - y), z = (s[i * 3 + 2] - 0.5) * d + this.wind.y * (h - y);
          a.setXYZ(i * 2, x, y, z); a.setXYZ(i * 2 + 1, x - this.wind.x * len, y - len, z - this.wind.y * len);
        }
        a.needsUpdate = true;
        this.rain.material.opacity = 0.18 + 0.22 * I;
      } else {
        const a = this.snow.geometry.attributes.position;
        for (let i = 0; i < this.count; i++) {
          if (i >= n) { a.setXYZ(i, 0, -99, 0); continue; }
          const y = h - ((s[i * 3 + 1] * h + t * 0.8) % h);
          a.setXYZ(i, (s[i * 3] - 0.5) * w + Math.sin(t + i) * 0.2, y, (s[i * 3 + 2] - 0.5) * d + Math.cos(t * 0.7 + i) * 0.2);
        }
        a.needsUpdate = true; this.snow.material.opacity = 0.8 * I;
      }
    }
    // relâmpagos na tempestade
    if (this.kind === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.flash = 1; this.nextBolt = 4 + Math.random() * 9; this._second = Math.random() < 0.5 ? 0.18 : -1; }
      if (this._second > 0) { this._second -= dt; if (this._second <= 0) this.flash = 0.8; }
    }
    this.flash = Math.max(0, this.flash - dt * 4);
  }
}
