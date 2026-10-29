// Backup das configurações da casa (sem senhas, chaves nem tokens das contas): planta, aparelhos no mapa,
// nomes, cenas, regras, horários, teclas ligadas e potências. Serve para trocar de PC ou montar um servidor 24/7.
const KEYS = ['layout', 'placements', 'aliases', 'scenes', 'schedules', 'rules', 'links', 'acPower', 'pcConf'];
const SECRET_SETTINGS = ['tuya', 'lg', 'ewelink', 'mobile']; // contas e acesso pelo celular ficam só neste PC

function makeBackup(store, version) {
  const data = {};
  for (const k of KEYS) data[k] = store.get(k) ?? null;
  const s = { ...(store.get('settings') || {}) };
  for (const k of SECRET_SETTINGS) delete s[k];
  data.settings = s;
  return { app: 'SmartHouse', kind: 'backup', format: 1, version, date: new Date().toISOString(), data };
}
// confere o arquivo e devolve só o que pode ser restaurado
function readBackup(obj) {
  if (!obj || obj.app !== 'SmartHouse' || obj.kind !== 'backup' || typeof obj.data !== 'object') throw new Error('Este arquivo não é um backup do SmartHouse.');
  if ((obj.format || 1) > 1) throw new Error('Backup feito por uma versão mais nova do SmartHouse. Atualize o app e tente de novo.');
  const out = {};
  for (const k of KEYS) if (obj.data[k] !== undefined && obj.data[k] !== null) out[k] = obj.data[k];
  if (obj.data.settings && typeof obj.data.settings === 'object') { const s = { ...obj.data.settings }; for (const k of SECRET_SETTINGS) delete s[k]; out.settings = s; }
  return out;
}
// aplica mantendo as contas e o acesso pelo celular atuais
function applyBackup(store, obj) {
  const d = readBackup(obj);
  for (const k of KEYS) if (k in d) store.set(k, d[k]);
  if (d.settings) { const cur = store.get('settings') || {}; const keep = {}; for (const k of SECRET_SETTINGS) if (k in cur) keep[k] = cur[k]; store.set('settings', { ...cur, ...d.settings, ...keep }); }
  return Object.keys(d);
}
module.exports = { makeBackup, readBackup, applyBackup, KEYS };
