// Armazenamento simples em JSON na pasta de dados do usuário
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    demo: true,
    tuya: { enabled: false, accessId: '', accessSecret: '', region: 'us', sampleDeviceId: '', preferLocal: true, localOnly: false },
    lg: { enabled: false, token: '', country: 'BR', clientId: '' },
    ewelink: { enabled: false, appId: '', appSecret: '', redirectUrl: 'https://127.0.0.1/casa3d', region: 'us', at: '', rt: '', localOnly: false },
    pollSeconds: 15,
    mobile: { enabled: false, port: 8787, token: '', keepAwake: true, ntfyTopic: '' },
  },
  layout: null,          // { rooms:[], doors:[] }
  placements: {},        // deviceId -> { x, y, rot }
  aliases: {},           // deviceId -> nome personalizado
  scenes: [],
  schedules: [],
  rules: [],
  links: [],             // teclas ligadas entre interruptores: [{ id, a:{dev,ch}, b:{dev,ch}, mode:'sync'|'follow', enabled }]
  energy: {},            // deviceId -> [[timestamp, watts], ...]
  pcConf: {},            // este computador: { enabled, kind:'auto'|'desktop'|'notebook', monitors, monitorW, cpuTdp, gpuTdp, screenOffMin }
  acPower: {},           // ar-condicionado: deviceId -> { w (potência da etiqueta), inverter } para estimar o consumo
  localCache: {},        // deviceId -> { ip, version }
  tuyaDevices: {},       // deviceId -> { id, name, key (local key), dpMap, raw, category } salvo após 1ª conexão
  ewelinkDevices: {},    // Sonoff: { id, name, key (devicekey), names, params } salvo após o login
};

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'casa3d.json');
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = deepMerge(this.data, raw);
    } catch (_) { /* primeira execução */ }
    this._timer = null;
  }
  get(key) { return this.data[key]; }
  set(key, value) { this.data[key] = value; this.save(); }
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 400);
  }
  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch (e) { console.error('Falha ao salvar', e); }
  }
}

function deepMerge(base, extra) {
  if (Array.isArray(extra) || typeof extra !== 'object' || extra === null) return extra;
  const out = { ...base };
  for (const k of Object.keys(extra)) {
    out[k] = (base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null)
      ? deepMerge(base[k], extra[k]) : extra[k];
  }
  return out;
}

module.exports = { Store };
