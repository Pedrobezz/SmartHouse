// Controles infravermelhos Tuya (ex.: Smart Controle Universal Positivo)
// API oficial "IR Control Hub Open Service". O IR é de mão única: o estado (ligado, temperatura…) é presumido pelo app.
const IR_HUB_CATEGORIES = ['wnykq', 'qt', 'hwktwkq'];
const isIrHub = d => IR_HUB_CATEGORIES.includes(d.category) || /ir_send|ir_study_code/.test(JSON.stringify(d.status || []));
const isVirtualRemote = d => /^infrared_/.test(d.category || '');

// códigos da Tuya para ar por IR
const AC_MODE = { COOL: 0, HEAT: 1, AUTO: 2, FAN: 3, AIR_DRY: 4 };
const AC_MODE_R = Object.fromEntries(Object.entries(AC_MODE).map(([k, v]) => [v, k]));
const AC_FAN = { AUTO: 0, LOW: 1, MID: 2, HIGH: 3 };
const AC_FAN_R = Object.fromEntries(Object.entries(AC_FAN).map(([k, v]) => [v, k]));

class TuyaIR {
  constructor(cloud) { this.cloud = cloud; }
  remotes(hubId) { return this.cloud.req('GET', `/v2.0/infrareds/${hubId}/remotes`); }
  keys(hubId, remoteId) { return this.cloud.req('GET', `/v2.0/infrareds/${hubId}/remotes/${remoteId}/keys`); }
  async sendKey(hubId, remoteId, categoryId, key, keyId) {
    const body = { category_id: categoryId, key, ...(keyId !== undefined ? { key_id: keyId } : {}) };
    try { return await this.cloud.req('POST', `/v2.0/infrareds/${hubId}/remotes/${remoteId}/command`, null, body); }
    catch (e) { return this.cloud.req('POST', `/v2.0/infrareds/${hubId}/remotes/${remoteId}/raw/command`, null, body); }
  }
  acScene(hubId, remoteId, st) {
    return this.cloud.req('POST', `/v2.0/infrareds/${hubId}/air-conditioners/${remoteId}/scenes/command`, null,
      { power: st.on ? 1 : 0, mode: AC_MODE[st.mode] ?? 0, temp: Math.round(st.target || 24), wind: AC_FAN[st.fan] ?? 0 });
  }
  async acStatus(hubId, remoteId) {
    try { return await this.cloud.req('GET', `/v2.0/infrareds/${hubId}/remotes/${remoteId}/ac/status`); } catch (_) { return null; }
  }
}

function acCapsFromKeys(k) {
  const modes = [...new Set((k?.key_range || []).map(r => AC_MODE_R[r.mode]).filter(Boolean))];
  const temps = (k?.key_range || []).flatMap(r => (r.temp_list || []).map(t => t.temp));
  const fans = [...new Set((k?.key_range || []).flatMap(r => (r.temp_list || []).flatMap(t => (t.fan_list || []).map(f => AC_FAN_R[f.fan]))).filter(Boolean))];
  return {
    ir: true, modes: modes.length ? modes : ['COOL', 'HEAT', 'AUTO', 'FAN', 'AIR_DRY'], fans: fans.length ? fans : ['AUTO', 'LOW', 'MID', 'HIGH'],
    tempMin: temps.length ? Math.min(...temps) : 16, tempMax: temps.length ? Math.max(...temps) : 30, tempStep: 1,
    eco: false, swingV: false, swingH: false, sleep: false, timer: false, display: [], airClean: [], windFlags: [], raw: [], turbo: false,
  };
}
function acStateFromStatus(s, prev) {
  if (!s) return prev;
  return { ...prev, on: String(s.power) === '1', mode: AC_MODE_R[+s.mode] || prev.mode, target: +s.temp || prev.target, fan: AC_FAN_R[+s.wind] || prev.fan };
}

module.exports = { TuyaIR, isIrHub, isVirtualRemote, acCapsFromKeys, acStateFromStatus };
