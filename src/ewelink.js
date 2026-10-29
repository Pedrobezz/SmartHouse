// Integração Sonoff / eWeLink
// Nuvem: API oficial eWeLink v2 (CoolKit), login OAuth2 — só é usada para buscar a lista de aparelhos e as chaves.
// Local: protocolo "LAN mode" da eWeLink (mDNS _ewelink._tcp + HTTP /zeroconf, AES-128-CBC com MD5(devicekey)).
const crypto = require('crypto');

const sign = (msg, secret) => crypto.createHmac('sha256', secret).update(typeof msg === 'string' ? msg : JSON.stringify(msg)).digest('base64');
const nonce = () => Math.random().toString(36).slice(-8);
const apiBase = region => `https://${region || 'us'}-apia.coolkit.${region === 'cn' ? 'cn' : 'cc'}`;

class EWeLinkCloud {
  constructor(cfg) { this.cfg = cfg; }
  async req(method, path, { body, query, bearer = true } = {}) {
    const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined)).toString() : '';
    const headers = { 'X-CK-Appid': this.cfg.appId, 'X-CK-Nonce': nonce(), 'Content-Type': 'application/json' };
    headers.Authorization = bearer ? `Bearer ${this.cfg.at}` : `Sign ${sign(body || {}, this.cfg.appSecret)}`;
    const res = await fetch(apiBase(this.cfg.region) + path + qs, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (json.error !== 0) throw new Error(`eWeLink ${json.error ?? res.status}: ${json.msg || res.statusText}`);
    return json.data;
  }
  loginUrl(redirectUrl, state = 'casa3d') {
    const seq = Date.now().toString();
    const p = {
      clientId: this.cfg.appId, redirectUrl, grantType: 'authorization_code', state, nonce: nonce(), seq,
      authorization: sign(`${this.cfg.appId}_${seq}`, this.cfg.appSecret),
    };
    return 'https://c2ccdn.coolkit.cc/oauth/index.html?' + Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }
  async exchangeCode(code, region, redirectUrl) {
    this.cfg.region = region || this.cfg.region || 'us';
    const d = await this.req('POST', '/v2/user/oauth/token', { body: { redirectUrl, code, grantType: 'authorization_code' }, bearer: false });
    this.cfg.at = d.accessToken || d.at; this.cfg.rt = d.refreshToken || d.rt;
    return this.cfg;
  }
  async refresh() {
    const d = await this.req('POST', '/v2/user/refresh', { body: { rt: this.cfg.rt }, bearer: false });
    this.cfg.at = d.at; this.cfg.rt = d.rt; return this.cfg;
  }
  async devices() {
    let list = [], begin = -9999999;
    for (let i = 0; i < 20; i++) {
      const d = await this.req('GET', '/v2/device/thing', { query: { num: 30, beginIndex: begin } });
      const things = d.thingList || [];
      list = list.concat(things.filter(t => t.itemType === 1 || t.itemType === 2).map(t => t.itemData));
      if (!things.length || list.length >= (d.total || 0)) break;
      begin = things[things.length - 1].index;
    }
    return list;
  }
  setStatus(id, params) { return this.req('POST', '/v2/device/thing/status', { body: { type: 1, id, params } }); }
}

// ---------------- LAN ----------------
const md5 = s => crypto.createHash('md5').update(s).digest();
function decrypt(b64, iv64, devicekey) {
  const d = crypto.createDecipheriv('aes-128-cbc', md5(devicekey), Buffer.from(iv64, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(b64, 'base64')), d.final()]).toString('utf8'));
}
function encrypt(obj, devicekey) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-128-cbc', md5(devicekey), iv);
  return { iv: iv.toString('base64'), data: Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]).toString('base64') };
}

class EWeLinkLan {
  constructor(onState) { this.onState = onState; this.hosts = {}; this.keys = {}; }
  setKey(id, key) { this.keys[id] = key; }
  start() {
    let Bonjour;
    try { ({ Bonjour } = require('bonjour-service')); } catch (_) { return; }
    this.bonjour = new Bonjour();
    this.browser = this.bonjour.find({ type: 'ewelink' });
    const handle = svc => this._svc(svc);
    this.browser.on('up', handle);
    this.browser.on('txt-update', handle);
    this.timer = setInterval(() => { try { this.browser.update(); } catch (_) {} }, 20000);
  }
  _svc(svc) {
    const txt = svc.txt || {};
    const id = txt.id || (svc.name || '').replace(/^eWeLink_/, '');
    if (!id) return;
    const ip = (svc.addresses || []).find(a => a.includes('.')) || svc.referer?.address;
    this.hosts[id] = { ip, port: svc.port || 8081, type: txt.type };
    let state = null;
    const raw = ['data1', 'data2', 'data3', 'data4'].map(k => txt[k] || '').join('');
    try {
      if (String(txt.encrypt) === 'true' && this.keys[id]) state = decrypt(raw, txt.iv, this.keys[id]);
      else if (raw && raw.startsWith('{')) state = JSON.parse(raw);
    } catch (_) { /* chave errada ou dados incompletos */ }
    this.onState(id, state, this.hosts[id]);
  }
  has(id) { return !!this.hosts[id]?.ip; }
  async send(id, path, params) {
    const h = this.hosts[id], key = this.keys[id];
    if (!h?.ip) throw new Error('não encontrado na rede local');
    const body = { sequence: Date.now().toString(), deviceid: id, selfApikey: '123', encrypt: !!key };
    if (key) Object.assign(body, encrypt(params, key)); else body.data = params;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const res = await fetch(`http://${h.ip}:${h.port}/zeroconf/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      const j = await res.json();
      if (j.error && j.error !== 0) throw new Error('erro ' + j.error);
      return true;
    } finally { clearTimeout(t); }
  }
  stop() { clearInterval(this.timer); try { this.browser?.stop(); this.bonjour?.destroy(); } catch (_) {} }
}

// ---------------- normalização ----------------
function normalizeEwl(params, names) {
  params = params || {};
  if (Array.isArray(params.switches)) {
    const n = names?.length || params.switches.length;
    const channels = params.switches.slice(0, Math.max(1, n)).map(s => ({ code: 'outlet' + s.outlet, outlet: s.outlet, on: s.switch === 'on', name: names?.[s.outlet] }));
    return { on: channels.some(c => c.on), channels, multi: true };
  }
  const on = params.switch === 'on';
  return { on, channels: [{ code: 'outlet0', outlet: 0, on, name: names?.[0] }], multi: false };
}
function channelNames(item) {
  const tags = item.tags?.ck_channel_name || {};
  const uiid = item.extra?.uiid;
  // número de teclas pelos modelos mais comuns; senão usa o que vier nos params
  const byUiid = { 1: 1, 6: 1, 2: 2, 7: 2, 3: 3, 8: 3, 4: 4, 9: 4, 112: 1, 113: 2, 114: 3, 160: 1, 161: 2, 162: 3 };
  const tagN = Object.keys(tags).length;
  const n = byUiid[uiid] || tagN || (Array.isArray(item.params?.switches) ? item.params.switches.length : 1);
  return Array.from({ length: n }, (_, i) => tags[i] || tags[String(i)] || null);
}
function toEwlParams(cmd, state) {
  const multi = state?.multi;
  const all = v => (multi ? { switches: state.channels.map(c => ({ switch: v ? 'on' : 'off', outlet: c.outlet })) } : { switch: v ? 'on' : 'off' });
  switch (cmd.action) {
    case 'power': return all(!!cmd.value);
    case 'toggle': return all(!state?.on);
    case 'channel': {
      const ch = state.channels.find(c => c.code === cmd.code);
      return multi ? { switches: [{ switch: cmd.value ? 'on' : 'off', outlet: ch.outlet }] } : { switch: cmd.value ? 'on' : 'off' };
    }
    default: throw new Error('Comando não suportado neste interruptor: ' + cmd.action);
  }
}

module.exports = { EWeLinkCloud, EWeLinkLan, normalizeEwl, channelNames, toEwlParams };
