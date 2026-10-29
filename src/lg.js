// Integração oficial LG ThinQ Connect (Personal Access Token)
// Docs: https://smartsolution.developer.lge.com/  |  Lib de referência: github.com/thinq-connect/pythinqconnect
const crypto = require('crypto');

const API_KEY = 'v6GFvkweNo7DK7yD3ylIZ9w52aKBU0eJ7wLXkSR3'; // chave pública fixa usada pela lib oficial
const AMERICAS = ['AG','AR','AW','BB','BO','BR','BS','BZ','CA','CL','CO','CR','CU','DM','DO','EC','GD','GT','GY','HN','HT','JM','KN','LC','MX','NI','PA','PE','PR','PY','SR','SV','TT','US','UY','VC','VE'];
const EUROPE_PREFIXES = ['AL','AM','AT','AZ','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB','GE','GR','HR','HU','IE','IL','IS','IT','KZ','LT','LU','LV','MA','MD','ME','MK','MT','NL','NO','PL','PT','RO','RS','RU','SE','SI','SK','TR','UA','AE','SA','EG','ZA','NG','KE'];

function region(country) {
  if (AMERICAS.includes(country)) return 'aic';
  if (EUROPE_PREFIXES.includes(country)) return 'eic';
  return 'kic';
}

class LGThinQ {
  constructor(cfg) {
    this.cfg = cfg;
    this.base = `https://api-${region(cfg.country || 'BR')}.lgthinq.com`;
    this.profiles = {};
  }
  _headers(extra = {}) {
    return {
      Authorization: `Bearer ${this.cfg.token}`,
      'x-country': this.cfg.country || 'BR',
      'x-message-id': crypto.randomBytes(16).toString('base64url').slice(0, 22),
      'x-client-id': this.cfg.clientId,
      'x-api-key': API_KEY,
      'x-service-phase': 'OP',
      'Content-Type': 'application/json',
      ...extra,
    };
  }
  async req(method, endpoint, body, extraHeaders) {
    const res = await fetch(`${this.base}/${endpoint}`, {
      method, headers: this._headers(extraHeaders), body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`LG ${json.error?.code || res.status}: ${json.error?.message || res.statusText}`);
    return json.response;
  }
  listDevices() { return this.req('GET', 'devices'); }
  async profile(id) {
    if (!this.profiles[id]) this.profiles[id] = await this.req('GET', `devices/${id}/profile`);
    return this.profiles[id];
  }
  state(id) { return this.req('GET', `devices/${id}/state`); }
  control(id, payload) { return this.req('POST', `devices/${id}/control`, payload, { 'x-conditional-control': 'true' }); }
}

// ---------- Helpers de perfil ----------
const P = (profile, res, prop) => {
  let r = profile?.property?.[res];
  if (Array.isArray(r)) r = r.find(x => x.unit === 'C' || x.unit?.value?.r?.includes?.('C')) || r[0];
  return r?.[prop];
};
const writable = p => p && Array.isArray(p.mode) && p.mode.includes('w');
const enumW = p => (writable(p) ? (p.value?.w || p.value?.r || []) : []);
const stateRes = (st, res) => {
  const r = st?.[res];
  return Array.isArray(r) ? (r.find(x => x.unit === 'C') || r[0]) : r;
};

// Ventilação: algumas LGs expõem o Turbo/Jet ("POWER") só em windStrengthDetail, outras em windStrength
function fanLists(profile) {
  return { std: enumW(P(profile, 'airFlow', 'windStrength')), detail: enumW(P(profile, 'airFlow', 'windStrengthDetail')) };
}
function fanKeyFor(profile, value) {
  const { std, detail } = fanLists(profile);
  if (detail.includes(value) && !std.includes(value)) return 'windStrengthDetail';
  if (std.includes(value)) return 'windStrength';
  return fanKey(profile);
}
function fanKey(profile) {
  return P(profile, 'airFlow', 'windStrengthDetail') ? 'windStrengthDetail' : 'windStrength';
}
function tempRes(profile) {
  return profile?.property?.temperatureInUnits ? 'temperatureInUnits' : 'temperature';
}

function capsFromProfile(profile) {
  const tr = tempRes(profile);
  const tProp = P(profile, tr, 'targetTemperatureC') || P(profile, tr, 'targetTemperature')
    || P(profile, tr, 'coolTargetTemperatureC') || P(profile, tr, 'coolTargetTemperature');
  const range = tProp?.value?.w || tProp?.value?.r || {};
  const windFlags = [];
  const wd = profile?.property?.windDirection || {};
  for (const k of Object.keys(wd)) if (writable(wd[k]) && !['rotateUpDown', 'rotateLeftRight'].includes(k)) windFlags.push(k);
  return {
    modes: enumW(P(profile, 'airConJobMode', 'currentJobMode')),
    fans: (() => { const { std, detail } = fanLists(profile); return [...new Set([...std, ...detail])]; })(),
    turbo: (() => { const { std, detail } = fanLists(profile); return [...std, ...detail].some(v => /POWER|JET|TURBO/i.test(v)); })(),
    tempMin: range.min ?? 16, tempMax: range.max ?? 30, tempStep: range.step ?? 1,
    eco: writable(P(profile, 'powerSave', 'powerSaveEnabled')),
    swingV: writable(P(profile, 'windDirection', 'rotateUpDown')),
    swingH: writable(P(profile, 'windDirection', 'rotateLeftRight')),
    sleep: writable(P(profile, 'sleepTimer', 'relativeHourToStop')),
    timer: writable(P(profile, 'timer', 'relativeHourToStop')) || writable(P(profile, 'timer', 'relativeHourToStart')),
    display: enumW(P(profile, 'display', 'light')),
    airClean: enumW(P(profile, 'operation', 'airCleanOperationMode')),
    windFlags,
    raw: generic(profile),
  };
}

// Lista genérica de TUDO que é gravável no perfil (garante acesso a 100% das funções)
function generic(profile) {
  const out = [];
  for (const [res, props] of Object.entries(profile?.property || {})) {
    const obj = Array.isArray(props) ? (props.find(x => x.unit === 'C') || props[0]) : props;
    for (const [prop, def] of Object.entries(obj || {})) {
      if (!writable(def)) continue;
      out.push({ resource: res, prop, type: def.type, values: def.value?.w ?? def.value?.r ?? null });
    }
  }
  return out;
}

function normalizeLG(st, profile) {
  const t = stateRes(st, tempRes(profile)) || {};
  const flow = st?.airFlow || {};
  const wd = st?.windDirection || {};
  const sleep = st?.sleepTimer || {};
  const timer = st?.timer || {};
  const mode = st?.airConJobMode?.currentJobMode;
  const target = t.targetTemperature ?? (mode === 'HEAT' ? t.heatTargetTemperature : mode === 'AUTO' ? t.autoTargetTemperature : t.coolTargetTemperature);
  const flags = {};
  for (const k of Object.keys(wd)) if (!['rotateUpDown', 'rotateLeftRight'].includes(k)) flags[k] = !!wd[k];
  return {
    on: st?.operation?.airConOperationMode === 'POWER_ON',
    mode,
    target,
    current: t.currentTemperature,
    fan: /POWER|JET|TURBO/i.test(flow.windStrengthDetail || '') ? flow.windStrengthDetail : (flow.windStrength ?? flow.windStrengthDetail),
    swingV: !!wd.rotateUpDown,
    swingH: !!wd.rotateLeftRight,
    eco: !!st?.powerSave?.powerSaveEnabled,
    sleepMin: sleep.relativeStopTimer === 'SET' || sleep.relativeHourToStop ? (sleep.relativeHourToStop || 0) * 60 + (sleep.relativeMinuteToStop || 0) : 0,
    timerOffMin: (timer.relativeHourToStop || 0) * 60 + (timer.relativeMinuteToStop || 0),
    timerOnMin: (timer.relativeHourToStart || 0) * 60 + (timer.relativeMinuteToStart || 0),
    display: st?.display?.light,
    humidity: st?.airQualitySensor?.humidity,
    filter: st?.filterInfo?.filterRemainPercent,
    airClean: st?.operation?.airCleanOperationMode,
    flags,
    raw: st,
  };
}

function toLGPayload(cmd, profile, state) {
  const hm = m => ({ h: Math.floor(m / 60), m: m % 60 });
  switch (cmd.action) {
    case 'power': return { operation: { airConOperationMode: cmd.value ? 'POWER_ON' : 'POWER_OFF' } };
    case 'toggle': return toLGPayload({ action: 'power', value: !cmd.current }, profile, state);
    case 'mode': return { airConJobMode: { currentJobMode: cmd.value } };
    case 'temp': {
      const tr = tempRes(profile);
      const mode = state?.mode;
      let key = 'targetTemperature';
      const has = k => writable(P(profile, tr, k + 'C')) || writable(P(profile, tr, k));
      if (!has('targetTemperature')) {
        if (mode === 'HEAT' && has('heatTargetTemperature')) key = 'heatTargetTemperature';
        else if (mode === 'AUTO' && has('autoTargetTemperature')) key = 'autoTargetTemperature';
        else if (has('coolTargetTemperature')) key = 'coolTargetTemperature';
      }
      return { [tr]: { [key]: cmd.value, unit: 'C' } };
    }
    case 'fan': return { airFlow: { [fanKeyFor(profile, cmd.value)]: cmd.value } };
    case 'swingV': return { windDirection: { rotateUpDown: !!cmd.value } };
    case 'swingH': return { windDirection: { rotateLeftRight: !!cmd.value } };
    case 'windFlag': return { windDirection: { [cmd.key]: !!cmd.value } };
    case 'eco': return { powerSave: { powerSaveEnabled: !!cmd.value } };
    case 'display': return { display: { light: cmd.value } };
    case 'airClean': return { operation: { airCleanOperationMode: cmd.value } };
    case 'sleep': {
      if (!cmd.value) return { sleepTimer: { relativeStopTimer: 'UNSET' } };
      const { h, m } = hm(cmd.value); return { sleepTimer: { relativeHourToStop: h, relativeMinuteToStop: m } };
    }
    case 'timerOff': {
      if (!cmd.value) return { timer: { relativeStopTimer: 'UNSET' } };
      const { h, m } = hm(cmd.value); return { timer: { relativeHourToStop: h, ...(m ? { relativeMinuteToStop: m } : {}) } };
    }
    case 'timerOn': {
      if (!cmd.value) return { timer: { relativeStartTimer: 'UNSET' } };
      const { h, m } = hm(cmd.value); return { timer: { relativeHourToStart: h, relativeMinuteToStart: m } };
    }
    case 'raw': return { [cmd.resource]: { [cmd.prop]: cmd.value } };
    default: throw new Error('Comando não suportado para ar-condicionado: ' + cmd.action);
  }
}

// Mapeamento de comandos que precisam ser enviados um por vez (a LG aceita 1 recurso por chamada na maioria dos modelos)
module.exports = { LGThinQ, capsFromProfile, normalizeLG, toLGPayload };
