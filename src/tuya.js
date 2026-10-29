// Integração Tuya / Smart Life (tomadas Ekaza são Tuya white label)
// Nuvem: Tuya OpenAPI (assinatura HMAC-SHA256). Local: tuyapi na rede Wi-Fi (opcional, mais rápido).
const crypto = require('crypto');

const REGIONS = {
  us: 'https://openapi.tuyaus.com',          // América Ocidental (padrão p/ contas do Brasil)
  ueaz: 'https://openapi-ueaz.tuyaus.com',   // América Oriental
  eu: 'https://openapi.tuyaeu.com',
  weaz: 'https://openapi-weaz.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
};

// Mapeamento padrão de DPs das tomadas Tuya com medição
const DEFAULT_PLUG_DPS = { switch_1: 1, countdown_1: 9, add_ele: 17, cur_current: 18, cur_power: 19, cur_voltage: 20, relay_status: 38, child_lock: 41 };

class TuyaCloud {
  constructor(cfg) {
    this.cfg = cfg;
    this.base = REGIONS[cfg.region] || REGIONS.us;
    this.token = null; this.tokenExp = 0; this.uid = null;
  }
  _sign(method, pathWithQuery, body, withToken, t, nonce) {
    const bodyHash = crypto.createHash('sha256').update(body || '').digest('hex');
    const stringToSign = [method, bodyHash, '', pathWithQuery].join('\n');
    const str = this.cfg.accessId + (withToken ? this.token : '') + t + nonce + stringToSign;
    return crypto.createHmac('sha256', this.cfg.accessSecret).update(str).digest('hex').toUpperCase();
  }
  async _raw(method, path, query, bodyObj, withToken = true) {
    const qs = query ? Object.keys(query).sort().filter(k => query[k] !== undefined && query[k] !== '')
      .map(k => `${k}=${query[k]}`).join('&') : '';
    const pathWithQuery = qs ? `${path}?${qs}` : path;
    const body = bodyObj ? JSON.stringify(bodyObj) : '';
    const t = Date.now().toString();
    const nonce = crypto.randomUUID();
    const headers = {
      client_id: this.cfg.accessId, t, nonce, sign_method: 'HMAC-SHA256',
      sign: this._sign(method, pathWithQuery, body, withToken, t, nonce),
      'Content-Type': 'application/json',
    };
    if (withToken) headers.access_token = this.token;
    const res = await fetch(this.base + pathWithQuery, { method, headers, body: body || undefined });
    const json = await res.json();
    if (!json.success) throw new Error(`Tuya ${json.code}: ${json.msg}`);
    return json.result;
  }
  async ensureToken() {
    if (this.token && Date.now() < this.tokenExp - 60000) return;
    const r = await this._raw('GET', '/v1.0/token', { grant_type: 1 }, null, false);
    this.token = r.access_token; this.tokenExp = Date.now() + r.expire_time * 1000; this.uid = r.uid;
  }
  async req(method, path, query, body) { await this.ensureToken(); return this._raw(method, path, query, body, true); }

  async listDevices() {
    let devices = [];
    try {
      let lastRowKey = '';
      for (let i = 0; i < 20; i++) {
        const r = await this.req('GET', '/v1.0/iot-01/associated-users/devices', { size: 100, last_row_key: lastRowKey });
        devices = devices.concat(r.devices || []);
        if (!r.has_more) break;
        lastRowKey = r.last_row_key;
      }
    } catch (e) { console.warn('associated-users falhou:', e.message); }
    if (!devices.length && this.cfg.sampleDeviceId) {
      // Plano B (igual ao tinytuya wizard): descobre o uid do app a partir de um dispositivo
      const d = await this.req('GET', `/v1.0/devices/${this.cfg.sampleDeviceId}`);
      devices = await this.req('GET', `/v1.0/users/${d.uid}/devices`);
    }
    return devices;
  }
  async status(ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += 20) {
      const r = await this.req('GET', '/v1.0/iot-03/devices/status', { device_ids: ids.slice(i, i + 20).join(',') });
      for (const d of r || []) out[d.id] = d.status;
    }
    return out;
  }
  async dpMap(id) {
    try {
      const r = await this.req('GET', `/v2.0/cloud/thing/${id}/shadow/properties`);
      const map = {};
      for (const p of r.properties || []) map[p.code] = p.dp_id;
      return map;
    } catch (_) { return null; }
  }
  async specs(id) {
    try { return await this.req('GET', `/v1.0/iot-03/devices/${id}/specification`); } catch (_) { return null; }
  }
  async command(id, commands) {
    return this.req('POST', `/v1.0/iot-03/devices/${id}/commands`, null, { commands });
  }
}

// ---------- Controle local (LAN) ----------
let TuyAPI = null;
try { TuyAPI = require('tuyapi'); } catch (_) { /* opcional */ }

class TuyaLocal {
  constructor(dev, dpMap, cache, onDps, onCacheUpdate, onStatus) {
    this.dev = dev; this.dpMap = dpMap || DEFAULT_PLUG_DPS; this.onDps = onDps; this.cache = cache || {};
    this.onCacheUpdate = onCacheUpdate; this.onStatus = onStatus || (() => {}); this.connected = false; this.stopped = false; this.retry = 5000;
  }
  async start() {
    if (!TuyAPI || !this.dev.local_key) return;
    const opts = { id: this.dev.id, key: this.dev.local_key, issueGetOnConnect: true, issueRefreshOnConnect: true };
    if (this.cache.ip) opts.ip = this.cache.ip;
    if (this.cache.version) opts.version = this.cache.version;
    this.api = new TuyAPI(opts);
    this.api.on('connected', () => { this.connected = true; this.retry = 5000; this.onStatus(this.dev.id, true); });
    this.api.on('disconnected', () => { this.connected = false; this.onStatus(this.dev.id, false); this._reconnect(); });
    this.api.on('error', () => { this.connected = false; });
    const handle = d => { if (d && d.dps) this.onDps(this.dev.id, d.dps, this.dpMap); };
    this.api.on('data', handle); this.api.on('dp-refresh', handle);
    this._connect();
  }
  async _connect() {
    if (this.stopped) return;
    try {
      if (!this.api.device.ip) await this.api.find({ timeout: 10 });
      if (this.api.device.ip) this.onCacheUpdate(this.dev.id, { ip: this.api.device.ip, version: this.api.device.version });
      await this.api.connect();
    } catch (_) { this._reconnect(); }
  }
  _reconnect() {
    if (this.stopped) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this._connect(), this.retry);
    this.retry = Math.min(this.retry * 2, 120000);
  }
  async set(commands) {
    if (!this.connected) throw new Error('offline local');
    const data = {};
    for (const c of commands) {
      const dp = this.dpMap[c.code];
      if (dp === undefined) throw new Error('DP desconhecido ' + c.code);
      data[dp] = c.value;
    }
    await this.api.set({ multiple: true, data });
  }
  stop() { this.stopped = true; clearTimeout(this._t); try { this.api && this.api.disconnect(); } catch (_) {} }
}

// ---------- Normalização ----------
function codesToState(statusArr) {
  const s = {};
  for (const it of statusArr || []) s[it.code] = it.value;
  return s;
}

function detectType(category, codes) {
  if (category === 'dj' || codes.includes('switch_led')) return 'light';
  if (category === 'kg' || category === 'tdq') return 'switch';
  return 'plug';
}

function normalizeTuya(raw, typeHint) {
  const st = raw; // { code: value }
  const switches = Object.keys(st).filter(k => /^switch(_\d+)?$/.test(k) || k === 'switch_led').sort();
  const channels = switches.map(code => ({ code, on: !!st[code] }));
  const state = {
    on: channels.some(c => c.on),
    channels,
  };
  if ('cur_power' in st) state.power = st.cur_power / 10;
  if ('cur_voltage' in st) state.voltage = st.cur_voltage / 10;
  if ('cur_current' in st) state.current = st.cur_current / 1000;
  if ('add_ele' in st) state.energyKwh = st.add_ele / 1000;
  if ('countdown_1' in st) state.countdown = st.countdown_1;
  if ('relay_status' in st) state.relayStatus = st.relay_status;
  if ('child_lock' in st) state.childLock = st.child_lock;
  if ('bright_value_v2' in st) state.brightness = Math.round(st.bright_value_v2 / 10);
  else if ('bright_value' in st) state.brightness = Math.round(st.bright_value / 2.55);
  return state;
}

// Converte comando unificado em comandos Tuya
function toTuyaCommands(cmd, raw) {
  const primary = Object.keys(raw).find(k => /^switch(_1)?$/.test(k)) || (('switch_led' in raw) ? 'switch_led' : 'switch_1');
  switch (cmd.action) {
    case 'power': {
      const codes = Object.keys(raw).filter(k => /^switch(_\d+)?$/.test(k) || k === 'switch_led');
      return (codes.length ? codes : [primary]).map(code => ({ code, value: !!cmd.value }));
    }
    case 'toggle': return toTuyaCommands({ action: 'power', value: !cmd.current }, raw);
    case 'channel': return [{ code: cmd.code, value: !!cmd.value }];
    case 'countdown': return [{ code: 'countdown_1', value: Math.max(0, Math.round(cmd.value)) }];
    case 'relayStatus': return [{ code: 'relay_status', value: cmd.value }];
    case 'childLock': return [{ code: 'child_lock', value: !!cmd.value }];
    case 'brightness':
      return 'bright_value_v2' in raw ? [{ code: 'bright_value_v2', value: Math.round(cmd.value * 10) }]
        : [{ code: 'bright_value', value: Math.round(cmd.value * 2.55) }];
    default: throw new Error('Comando não suportado para tomada: ' + cmd.action);
  }
}

module.exports = { TuyaCloud, TuyaLocal, normalizeTuya, toTuyaCommands, codesToState, detectType, DEFAULT_PLUG_DPS, REGIONS };
