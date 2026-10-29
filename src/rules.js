// Motor de regras "se → então"
// rule = { id, name, enabled, trigger, conditions: { from, to, days }, actions: [...], cooldownMin }
// trigger:
//   { type: 'device', id, prop: 'on'|'power'|'current'|'target'|'online', op: '='|'>'|'<'|'>='|'<=', value, forMin }
//   { type: 'sun', event: 'sunrise'|'sunset', offsetMin }
//   { type: 'time', time: 'HH:MM' }

// ---- nascer/pôr do sol (algoritmo do SunCalc, domínio público) ----
const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397, J0 = 0.0009;
const toDays = d => d.valueOf() / dayMs - 0.5 + J1970 - J2000;
const fromJulian = j => new Date((j + 0.5 - J1970) * dayMs);
function sunTimes(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const h0 = -0.833 * rad;
  const w = Math.acos((Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const a = J0 + (w + lw) / (2 * Math.PI) + n;
  const Jset = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return { sunrise: fromJulian(Jnoon - (Jset - Jnoon)), sunset: fromJulian(Jset) };
}

const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const toMin = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

function inWindow(cond, now) {
  if (!cond) return true;
  if (cond.days?.length && !cond.days.includes(now.getDay())) return false;
  if (cond.from && cond.to) {
    const m = now.getHours() * 60 + now.getMinutes(), a = toMin(cond.from), b = toMin(cond.to);
    if (a <= b ? !(m >= a && m < b) : !(m >= a || m < b)) return false; // janela que passa da meia-noite
  }
  return true;
}

function readProp(d, prop) {
  if (!d) return undefined;
  const s = d.state || {};
  switch (prop) {
    case 'on': return !!s.on && d.online !== false;
    case 'online': return d.online !== false;
    case 'power': return typeof s.power === 'number' ? (s.on ? s.power : 0) : undefined;
    case 'current': return s.current;
    case 'target': return s.target;
    case 'humidity': return s.humidity;
  }
}
function compare(a, op, b) {
  if (a === undefined || a === null) return false;
  if (typeof b === 'boolean' || op === '=') return a == b; // eslint-disable-line eqeqeq
  const x = Number(a), y = Number(b);
  return op === '>' ? x > y : op === '<' ? x < y : op === '>=' ? x >= y : op === '<=' ? x <= y : false;
}

class RulesEngine {
  constructor(hub) { this.hub = hub; this.mem = {}; }
  async tick() {
    const s = this.hub.store.get('settings');
    const rules = this.hub.store.get('rules') || [];
    const now = new Date();
    const lat = s.location?.lat ?? -23.55, lng = s.location?.lng ?? -46.63;
    for (const r of rules) {
      if (!r.enabled) continue;
      const m = this.mem[r.id] || (this.mem[r.id] = { since: null, fired: false, last: 0 });
      let active = false, edgeKey = null;
      const t = r.trigger || {};
      if (t.type === 'device') {
        const ok = compare(readProp(this.hub.devices.get(t.id), t.prop), t.op || '=', t.value);
        if (ok) { if (!m.since) m.since = Date.now(); } else { m.since = null; m.fired = false; }
        active = ok && Date.now() - m.since >= (Number(t.forMin) || 0) * 60000 && !m.fired;
      } else if (t.type === 'sun' || t.type === 'time') {
        let at;
        if (t.type === 'sun') { const st = sunTimes(now, lat, lng); at = new Date(st[t.event || 'sunset'].getTime() + (Number(t.offsetMin) || 0) * 60000); }
        else { at = new Date(now); at.setHours(...String(t.time || '00:00').split(':').map(Number), 0, 0); }
        edgeKey = now.toDateString() + hm(at);
        active = hm(now) === hm(at) && m.lastKey !== edgeKey;
      }
      if (!active || !inWindow(r.conditions, now)) continue;
      if (r.cooldownMin && Date.now() - m.last < r.cooldownMin * 60000) continue;
      m.fired = true; m.last = Date.now(); if (edgeKey) m.lastKey = edgeKey;
      this.hub.log(`Regra "${r.name}" disparou`);
      for (const a of r.actions || []) {
        try { await this.hub.runAction(a, r); } catch (err) { this.hub.log(`Regra ${r.name}: ${err.message}`, 'error'); }
      }
    }
  }
}

module.exports = { RulesEngine, sunTimes };
