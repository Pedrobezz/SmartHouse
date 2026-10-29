// Central que unifica Tuya, LG e Demo; faz polling, comandos, cenas, agendamentos e histórico de energia
const { EventEmitter } = require('events');
const crypto = require('crypto');
const { TuyaCloud, TuyaLocal, normalizeTuya, toTuyaCommands, codesToState, detectType } = require('./tuya');
const { LGThinQ, capsFromProfile, normalizeLG, toLGPayload } = require('./lg');
const demo = require('./demo');
const { scan } = require('./tuya-scan');
const { RulesEngine, sunTimes } = require('./rules');
const { TuyaIR, isIrHub, isVirtualRemote, acCapsFromKeys, acStateFromStatus } = require('./tuya-ir');
const { EWeLinkCloud, EWeLinkLan, normalizeEwl, channelNames, toEwlParams } = require('./ewelink');

function tuyaCaps(raw) {
  return {
    metering: 'cur_power' in raw, countdown: 'countdown_1' in raw,
    relayStatus: 'relay_status' in raw ? ['power_off', 'power_on', 'last'] : null,
    childLock: 'child_lock' in raw, brightness: 'bright_value_v2' in raw || 'bright_value' in raw,
    channels: Object.keys(raw).filter(k => /^switch_\d+$/.test(k)).length,
  };
}

class Hub extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.devices = new Map();  // id -> device público
    this.tuyaRaw = {};         // id -> {code:value}
    this.tuyaLocal = {};       // id -> TuyaLocal
    this.lgProfiles = {};
    this.errors = {};
    this.timers = [];
    this.logs = [];
  }

  // ---------------- ciclo de vida ----------------
  async start() {
    this.stop();
    this.gen = (this.gen || 0) + 1; this._startedAt = Date.now();
    this.devices.clear();
    const s = this.store.get('settings');
    // clima real (Open-Meteo, sem chave): a cada 15 min
    this._fetchWeather();
    this.timers.push(setInterval(() => this._fetchWeather(), 15 * 60e3));
    if (!s.lg.clientId) { s.lg.clientId = crypto.randomUUID(); this.store.set('settings', s); }

    if (s.demo) {
      for (const d of demo.makeDemo()) this.devices.set(d.id, d);
      if (!this.store.get('layout')) {
        this.store.set('layout', demo.DEMO_LAYOUT);
        this.store.set('placements', { ...demo.DEMO_PLACEMENTS, ...this.store.get('placements') });
        this._seedScenes();
      }
      this._seedDemoEnergy();
      const pl = this.store.get('placements') || {};
      const rooms = this.store.get('layout')?.rooms || [];
      ['demo-switch-sala', 'demo-ir-tv', 'demo-ir-ac'].forEach((id, i) => {
        if (pl[id] || !rooms.length) return;
        const r = rooms[i % rooms.length];
        pl[id] = { x: r.x + 0.08, y: r.y + r.h * (0.3 + i * 0.2), wall: true, z: id === 'demo-ir-ac' ? 2.2 : 1.2 };
      });
      this.store.set('placements', pl);
      this._seedDemoLamps(pl);
      this.timers.push(setInterval(() => {
        for (const d of this.devices.values()) if (d.provider === 'demo') demo.tickDemo(d, 2);
        this._emit();
      }, 2000));
    }
    if (s.tuya.enabled) this._startTuya(s.tuya).catch(e => this._err('tuya', e));
    if (s.lg.enabled && s.lg.token) this._startLG(s.lg).catch(e => this._err('lg', e));
    if (s.ewelink?.enabled) this._startEwl(s.ewelink).catch(e => this._err('ewelink', e));

    // o próprio computador: consumo estimado a cada 5 s
    this.pcLoad = null;
    if (this.pcmon) {
      const tick = async () => { try { const c = this.store.get('pcConf') || {}; this.pcLoad = c.enabled === false ? null : await this.pcmon.sample(c); this._emit(); } catch (_) {} };
      tick(); this.timers.push(setInterval(tick, 5000));
    }
    this.timers.push(setInterval(() => this._sampleEnergy(), 60000));
    this.timers.push(setInterval(() => this._runSchedules(), 15000));
    this.rules = this.rules || new RulesEngine(this);
    this.timers.push(setInterval(() => this.rules.tick().catch(() => {}), 10000));
    this._emit();
  }
  stop() {
    this.timers.forEach(clearInterval); this.timers = [];
    Object.values(this.tuyaLocal).forEach(l => l.stop()); this.tuyaLocal = {};
    if (this.ewlLan) { this.ewlLan.stop(); this.ewlLan = null; }
  }
  _err(src, e) {
    this.errors[src] = e.message || String(e);
    this.log(`Erro ${src.toUpperCase()}: ${this.errors[src]}`, 'error');
    this._emit();
  }
  log(msg, level = 'info') {
    this.logs.unshift({ t: Date.now(), msg, level });
    this.logs = this.logs.slice(0, 200);
    this.emit('log', this.logs[0]);
  }

  // ---------------- Tuya ----------------
  // Fluxo: (1) se houver chaves da nuvem, baixa a lista + local keys e SALVA no computador;
  // (2) procura as tomadas no Wi-Fi; (3) controla tudo localmente. A nuvem vira só reserva.
  async _startTuya(cfg) {
    const gen = this.gen;
    const cache = this.store.get('tuyaDevices') || {};
    this.tuya = null;
    let cloudOk = false;
    if (!cfg.localOnly && cfg.accessId && cfg.accessSecret) {
      this.tuya = new TuyaCloud(cfg);
      try {
        const list = await this.tuya.listDevices();
        cloudOk = true; delete this.errors.tuya;
        this.log(`Tuya: ${list.length} dispositivo(s) na nuvem; chaves locais salvas neste PC`);
        for (const d of list) {
          const old = cache[d.id] || {};
          cache[d.id] = { ...old, id: d.id, name: d.name, key: d.local_key || old.key, category: d.category,
            product: d.product_name, raw: codesToState(d.status), online: !!d.online };
          if (!cache[d.id].dpMap) cache[d.id].dpMap = await this.tuya.dpMap(d.id);
        }
        this.store.set('tuyaDevices', cache);
      } catch (e) {
        this._err('tuya', e);
        if (Object.keys(cache).length) this.log('Nuvem Tuya indisponível: usando as chaves salvas e a rede local');
      }
    }
    this.tuyaCloudOk = cloudOk;

    // procura as tomadas no Wi-Fi para saber IP e versão do protocolo
    await this._lanScan(5);

    if (gen !== this.gen) return; // reiniciado no meio do caminho
    this.irHubs = [];
    for (const rec of Object.values(cache)) {
      if (isVirtualRemote(rec)) continue;                       // controles virtuais entram pela API de IR
      if (isIrHub(rec)) { this.irHubs.push(rec); continue; }      // o emissor IR em si não é um aparelho controlável
      this._addTuyaDevice(rec, cfg, cloudOk);
    }
    if (cloudOk && this.irHubs.length) await this._startIR().catch(e => this.log('Infravermelho: ' + e.message, 'error'));
    this._emit();

    if (cloudOk) {
      const poll = async () => {
        try {
          const ids = [...this.devices.values()].filter(d => d.provider === 'tuya' && !this.tuyaLocal[d.id]?.connected).map(d => d.id);
          if (!ids.length) return;
          const st = await this.tuya.status(ids);
          for (const [id, arr] of Object.entries(st)) this._setTuyaRaw(id, codesToState(arr));
          delete this.errors.tuya; this._emit();
        } catch (e) { this._err('tuya', e); }
      };
      this.timers.push(setInterval(poll, Math.max(10, this.store.get('settings').pollSeconds) * 1000));
    }
    // a cada 5 min procura de novo quem não está conectado (o roteador pode ter trocado o IP)
    this.timers.push(setInterval(async () => {
      const off = Object.values(this.tuyaLocal).filter(l => !l.connected);
      if (!off.length) return;
      await this._lanScan(5);
      for (const l of off) { const c = this.store.get('localCache')[l.dev.id]; if (c && l.api) { l.api.device.ip = c.ip; l.api.device.version = c.version; } }
    }, 5 * 60000));
  }

  async _lanScan(seconds) {
    try {
      const found = await scan(seconds);
      const lc = this.store.get('localCache');
      for (const f of found) lc[f.id] = { ...(lc[f.id] || {}), ip: f.ip, version: f.version };
      this.store.set('localCache', lc);
      this.lanFound = found;
      return found;
    } catch (_) { return []; }
  }

  async scanLan() {
    const found = await this._lanScan(8);
    const cache = this.store.get('tuyaDevices') || {};
    return found.map(f => ({ ...f, name: this.store.get('aliases')[f.id] || cache[f.id]?.name || null, hasKey: !!cache[f.id]?.key, connected: !!this.tuyaLocal[f.id]?.connected }));
  }

  // ---------------- Infravermelho (Tuya / Positivo) ----------------
  async _startIR() {
    this.ir = new TuyaIR(this.tuya);
    const irState = this.store.get('irState') || {};
    let n = 0;
    for (const hub of this.irHubs) {
      let remotes = [];
      try { remotes = await this.ir.remotes(hub.id) || []; } catch (e) { this.log(`IR ${hub.name}: ${e.message}`, 'error'); continue; }
      const hubTemp = () => { const r = this.tuyaRaw[hub.id] || hub.raw || {}; return typeof r.va_temperature === 'number' ? r.va_temperature / 10 : undefined; };
      for (const rm of remotes) {
        const id = rm.remote_id;
        let keys = null; try { keys = await this.ir.keys(hub.id, id); } catch (_) {}
        const cat = rm.category_id ?? keys?.category_id;
        const base = { id, provider: 'tuya-ir', online: !!hub.online || true, ir: { hub: hub.id, category: cat, keys: keys?.key_list || [], duplicatePower: !!keys?.duplicate_power },
          model: [rm.brand_name, 'via ' + (hub.name || 'controle IR')].filter(Boolean).join(' · ') };
        if (cat === 5) {
          let st = irState[id] || { on: false, mode: 'COOL', target: 24, fan: 'AUTO' };
          st = acStateFromStatus(await this.ir.acStatus(hub.id, id), st);
          st.current = hubTemp();
          this.devices.set(id, { ...base, type: 'ac', name: rm.remote_name || 'Ar (infravermelho)', caps: acCapsFromKeys(keys), state: st });
        } else {
          const st = irState[id] || { on: false };
          this.devices.set(id, { ...base, type: 'tv', name: rm.remote_name || 'Controle IR', caps: { ir: true, keys: keys?.key_list || [] }, state: st });
        }
        n++;
      }
      this.irTempTimer = this.irTempTimer || setInterval(() => {
        for (const d of this.devices.values()) if (d.provider === 'tuya-ir' && d.type === 'ac') { const r = this.tuyaRaw[d.ir.hub]; if (typeof r?.va_temperature === 'number') d.state.current = r.va_temperature / 10; }
      }, 30000);
      this.timers.push(this.irTempTimer); this.irTempTimer = null;
    }
    if (n) this.log(`Infravermelho: ${n} controle(s) encontrado(s)`);
    this._emit();
  }
  async _irCommand(d, cmd) {
    const irState = this.store.get('irState') || {};
    if (!this.ir) throw new Error('O infravermelho precisa da nuvem Tuya conectada');
    if (d.type === 'ac') {
      const st = { ...d.state };
      const v = cmd.value;
      if (cmd.action === 'power') st.on = !!v; else if (cmd.action === 'toggle') st.on = !st.on;
      else if (cmd.action === 'mode') { st.mode = v; st.on = true; } else if (cmd.action === 'temp') { st.target = v; st.on = true; }
      else if (cmd.action === 'fan') { st.fan = v; st.on = true; } else throw new Error('Este ar por infravermelho não tem essa função');
      await this.ir.acScene(d.ir.hub, d.id, st);
      d.state = st;
    } else {
      const keys = d.ir.keys || [];
      const find = re => keys.find(k => re.test(k.key) || re.test(k.key_name || ''));
      let k;
      if (cmd.action === 'key') k = keys.find(x => x.key === cmd.key) || { key: cmd.key, key_id: cmd.key_id };
      else if (cmd.action === 'power' || cmd.action === 'toggle') {
        const want = cmd.action === 'toggle' ? !d.state.on : !!cmd.value;
        k = (want ? find(/^power ?on$|^poweron$/i) : find(/^power ?off$|^poweroff$/i)) || find(/^power$/i) || find(/power/i);
        d.state = { ...d.state, on: want };
      } else throw new Error('Comando não suportado');
      if (!k) throw new Error('Tecla não encontrada neste controle');
      await this.ir.sendKey(d.ir.hub, d.id, d.ir.category, k.key, k.key_id);
    }
    irState[d.id] = { ...d.state, current: undefined }; this.store.set('irState', irState);
    this._emit();
    return true;
  }

  _addTuyaDevice(rec, cfg, cloudOk) {
    const raw = rec.raw && Object.keys(rec.raw).length ? { ...rec.raw } : { switch_1: false };
    this.tuyaRaw[rec.id] = raw;
    const dev = {
      id: rec.id, provider: 'tuya', type: detectType(rec.category, Object.keys(raw)), name: rec.name || 'Tomada ' + rec.id.slice(-4),
      online: cloudOk ? !!rec.online : false, model: rec.product, caps: tuyaCaps(raw), state: normalizeTuya(raw),
    };
    this.devices.set(rec.id, dev);
    if (rec.key && (cfg.preferLocal !== false || !cloudOk)) {
      const cache = this.store.get('localCache')[rec.id];
      const loc = new TuyaLocal({ id: rec.id, local_key: rec.key }, rec.dpMap, cache,
        (id, dps, dpMap) => this._onLocalDps(id, dps, dpMap),
        (id, c) => { const lc = this.store.get('localCache'); lc[id] = { ...lc[id], ...c }; this.store.set('localCache', lc); },
        (id, up) => { const d = this.devices.get(id); if (d && (up || !this.tuyaCloudOk)) { d.online = up; this._emit(); } });
      this.tuyaLocal[rec.id] = loc;
      loc.start();
    }
  }

  addManualTuya({ id, key, name }) {
    if (!/^[\w]{10,}$/.test(id || '')) throw new Error('ID inválido');
    if (!key || key.length !== 16) throw new Error('A local key tem 16 caracteres');
    const cache = this.store.get('tuyaDevices') || {};
    cache[id] = { ...(cache[id] || {}), id, key, name: name || cache[id]?.name || 'Tomada ' + id.slice(-4) };
    this.store.set('tuyaDevices', cache);
    return true;
  }
  removeTuya(id) {
    const cache = this.store.get('tuyaDevices') || {}; delete cache[id]; this.store.set('tuyaDevices', cache);
  }
  savedTuyaCount() { return Object.values(this.store.get('tuyaDevices') || {}).filter(r => r.key).length; }

  _onLocalDps(id, dps, dpMap) {
    const raw = { ...(this.tuyaRaw[id] || {}) };
    const inv = Object.fromEntries(Object.entries(dpMap).map(([code, dp]) => [String(dp), code]));
    for (const [dp, v] of Object.entries(dps)) if (inv[dp]) raw[inv[dp]] = v;
    const dev = this.devices.get(id); if (dev) dev.online = true;
    this._setTuyaRaw(id, raw); this._emit();
    // guarda o último estado para abrir rápido mesmo sem nuvem
    const cache = this.store.get('tuyaDevices'); if (cache?.[id]) { cache[id].raw = raw; this.store.save(); }
  }
  _setTuyaRaw(id, raw) {
    this.tuyaRaw[id] = raw;
    const dev = this.devices.get(id);
    if (dev) { dev.state = normalizeTuya(raw); dev.caps = tuyaCaps(raw); dev.type = detectType(null, Object.keys(raw)) === 'light' ? 'light' : dev.type; }
  }

  // ---------------- Sonoff / eWeLink ----------------
  async _startEwl(cfg) {
    const gen = this.gen;
    const cache = this.store.get('ewelinkDevices') || {};
    this.ewl = null; this.ewlCloudOk = false;
    const saveTokens = c => { const st = this.store.get('settings'); st.ewelink = { ...st.ewelink, at: c.at, rt: c.rt, region: c.region }; this.store.set('settings', st); };
    if (!cfg.localOnly && cfg.at && cfg.appId && cfg.appSecret) {
      this.ewl = new EWeLinkCloud({ ...cfg });
      try {
        let list;
        try { list = await this.ewl.devices(); }
        catch (e) { if (/401|402|token/i.test(e.message) && cfg.rt) { saveTokens(await this.ewl.refresh()); list = await this.ewl.devices(); } else throw e; }
        this.ewlCloudOk = true; delete this.errors.ewelink;
        for (const it of list) {
          const old = cache[it.deviceid] || {};
          cache[it.deviceid] = { ...old, id: it.deviceid, name: it.name, key: it.devicekey || old.key, uiid: it.extra?.uiid,
            model: it.productModel || it.extra?.model, names: channelNames(it), params: it.params, online: !!it.online };
        }
        this.store.set('ewelinkDevices', cache);
        this.log(`eWeLink: ${list.length} aparelho(s); chaves salvas neste PC`);
      } catch (e) { this._err('ewelink', e); }
    }
    if (gen !== this.gen) return;
    this.ewlLan = new EWeLinkLan((id, state) => {
      const d = this.devices.get(id); if (!d) return;
      const rec = (this.store.get('ewelinkDevices') || {})[id];
      if (state) {
        rec.params = { ...(rec.params || {}), ...state };
        d.state = normalizeEwl(rec.params, rec.names);
        this.store.save();
      }
      d.online = true; d.local = true; this._emit();
    });
    for (const rec of Object.values(cache)) {
      if (rec.key) this.ewlLan.setKey(rec.id, rec.key);
      const st = normalizeEwl(rec.params, rec.names);
      this.devices.set(rec.id, { id: rec.id, provider: 'ewelink', type: 'switch', name: rec.name || 'Sonoff ' + rec.id.slice(-4),
        model: rec.model ? `Sonoff ${rec.model}` : 'Sonoff', online: this.ewlCloudOk ? !!rec.online : false,
        caps: { channels: st.channels.length, channelNames: st.channels.map(c => c.name) }, state: st });
    }
    this.ewlLan.start();
    this._emit();
    if (this.ewlCloudOk) this.timers.push(setInterval(async () => {
      const off = [...this.devices.values()].filter(d => d.provider === 'ewelink' && !this.ewlLan?.has(d.id));
      if (!off.length) return;
      try {
        const list = await this.ewl.devices();
        const c = this.store.get('ewelinkDevices');
        for (const it of list) { const d = this.devices.get(it.deviceid); if (!d || this.ewlLan?.has(d.id)) continue; c[it.deviceid].params = it.params; d.state = normalizeEwl(it.params, c[it.deviceid].names); d.online = !!it.online; }
        this.store.save(); this._emit();
      } catch (_) {}
    }, 60000));
  }

  // ---------------- LG ----------------
  async _startLG(cfg) {
    this.lg = new LGThinQ(cfg);
    const list = await this.lg.listDevices();
    delete this.errors.lg;
    const acs = (list || []).filter(d => /AIR_CONDITIONER|SYSTEM_BOILER/.test(d.deviceInfo?.deviceType || ''));
    this.log(`LG ThinQ: ${acs.length} ar-condicionado(s) encontrado(s)`);
    for (const d of acs) {
      const profile = await this.lg.profile(d.deviceId);
      this.lgProfiles[d.deviceId] = profile;
      const st = await this.lg.state(d.deviceId).catch(() => ({}));
      this.devices.set(d.deviceId, {
        id: d.deviceId, provider: 'lg', type: 'ac', name: d.deviceInfo.alias || 'Ar-condicionado LG',
        model: d.deviceInfo.modelName, online: true, caps: capsFromProfile(profile), state: normalizeLG(st, profile),
      });
    }
    this._emit();
    const poll = async () => {
      for (const d of this.devices.values()) {
        if (d.provider !== 'lg') continue;
        try { d.state = normalizeLG(await this.lg.state(d.id), this.lgProfiles[d.id]); d.online = true; delete this.errors.lg; }
        catch (e) { if (/offline|NOT_CONNECTED|1222/i.test(e.message)) d.online = false; else this._err('lg', e); }
      }
      this._emit();
    };
    this.timers.push(setInterval(poll, Math.max(20, this.store.get('settings').pollSeconds) * 1000));
  }

  // ---------------- comandos ----------------
  async command(id, cmd) {
    const d = this.devices.get(id);
    if (!d) throw new Error('Dispositivo não encontrado');
    if (cmd.action === 'toggle') cmd = { ...cmd, current: d.state.on };
    if (d.provider === 'demo') { demo.applyDemo(d, cmd); this._emit(); return true; }
    if (d.provider === 'tuya') {
      const cmds = toTuyaCommands(cmd, this.tuyaRaw[id] || {});
      const loc = this.tuyaLocal[id];
      let done = false;
      if (loc?.connected) { try { await loc.set(cmds); done = true; } catch (_) {} }
      if (!done) {
        if (!this.tuya || !this.tuyaCloudOk) throw new Error(`${d.name} não respondeu na rede local. Confira se está ligada no mesmo Wi-Fi.`);
        await this.tuya.command(id, cmds);
      }
      const raw = { ...this.tuyaRaw[id] }; for (const c of cmds) raw[c.code] = c.value;
      this._setTuyaRaw(id, raw); this._emit();
      return true;
    }
    if (d.provider === 'tuya-ir') return this._irCommand(d, cmd);
    if (d.provider === 'ewelink') {
      const params = toEwlParams(cmd, d.state);
      let done = false;
      if (this.ewlLan?.has(id)) { try { await this.ewlLan.send(id, params.switches ? 'switches' : 'switch', params); done = true; } catch (_) {} }
      if (!done) {
        if (!this.ewl || !this.ewlCloudOk) throw new Error(`${d.name} não respondeu na rede local. Confira se está no mesmo Wi-Fi.`);
        await this.ewl.setStatus(id, params);
      }
      const rec = this.store.get('ewelinkDevices')[id];
      if (params.switches) { const cur = [...(rec.params?.switches || [])]; for (const sw of params.switches) { const i = cur.findIndex(x => x.outlet === sw.outlet); if (i >= 0) cur[i] = sw; else cur.push(sw); } rec.params = { ...rec.params, switches: cur }; }
      else rec.params = { ...rec.params, ...params };
      d.state = normalizeEwl(rec.params, rec.names); this.store.save(); this._emit();
      return true;
    }
    if (d.provider === 'lg') {
      const payload = toLGPayload(cmd, this.lgProfiles[id], d.state);
      if (cmd.action === 'power' || cmd.action === 'toggle') d.state.on = payload.operation.airConOperationMode === 'POWER_ON';
      await this.lg.control(id, payload);
      demo.applyDemo({ type: 'ac', state: d.state }, cmd.action === 'toggle' ? { action: 'power', value: !cmd.current } : cmd);
      this._emit();
      setTimeout(async () => {
        try { d.state = normalizeLG(await this.lg.state(id), this.lgProfiles[id]); this._emit(); } catch (_) {}
      }, 2500);
      return true;
    }
  }

  // parte de um ambiente unido (ex.: "Jantar" dentro de "Área social")
  areaOf(deviceId) {
    const p = this.store.get('placements')[deviceId];
    const layout = this.store.get('layout');
    if (!p || !layout) return null;
    const r = roomAt(layout, p.x, p.y);
    return r?.group ? r.id : null;
  }
  roomOf(deviceId) {
    const p = this.store.get('placements')[deviceId];
    const layout = this.store.get('layout');
    if (!p || !layout) return null;
    const r = roomAt(layout, p.x, p.y);
    return r ? (r.group || r.id) : null;
  }

  async runAction(a, rule) {
    const t = a.target;
    if (t.type === 'notify') { this.emit('notify', { title: rule?.name || 'SmartHouse', body: a.command?.text || 'Regra disparada' }); return true; }
    if (t.type === 'device') return this.command(t.id, a.command);
    if (t.type === 'area') {
      const ids = [...this.devices.keys()].filter(id => this.areaOf(id) === t.id);
      await Promise.all(ids.map(id => this.command(id, a.command).catch(e => this.log(`${id}: ${e.message}`, 'error'))));
      return true;
    }
    if (t.type === 'room') {
      const rect = (this.store.get('layout')?.rooms || []).find(r => r.id === t.id);
      const target = rect ? (rect.group || rect.id) : t.id;
      const ids = [...this.devices.keys()].filter(id => this.roomOf(id) === target);
      for (const id of ids) {
        const d = this.devices.get(id);
        if (a.command.action !== 'power' && d.type !== (a.deviceType || d.type)) continue;
        try { await this.command(id, a.command); } catch (e) { this.log(`Falha em ${d.name}: ${e.message}`, 'error'); }
      }
      return true;
    }
    if (t.type === 'scene') return this.runScene(t.id);
    if (t.type === 'all') {
      for (const d of this.devices.values()) {
        if (a.onlyType && d.type !== a.onlyType) continue;
        try { await this.command(d.id, a.command); } catch (_) {}
      }
    }
  }
  async runScene(id) {
    const sc = this.store.get('scenes').find(s => s.id === id);
    if (!sc) throw new Error('Cena não encontrada');
    for (const a of sc.actions) {
      try { await this.runAction(a); } catch (e) { this.log(`Cena ${sc.name}: ${e.message}`, 'error'); }
    }
    this.log(`Cena "${sc.name}" executada`);
    return true;
  }

  // ---------------- agendamentos ----------------
  async _runSchedules() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toISOString().slice(0, 10);
    const list = this.store.get('schedules');
    let changed = false;
    for (const s of list) {
      if (!s.enabled || s.time !== hhmm || !s.days.includes(now.getDay())) continue;
      const key = today + ' ' + hhmm;
      if (s.lastRun === key) continue;
      s.lastRun = key; changed = true;
      for (const a of s.actions) { try { await this.runAction(a); } catch (e) { this.log(`Agendamento ${s.name}: ${e.message}`, 'error'); } }
      this.log(`Agendamento "${s.name}" executado às ${hhmm}`);
    }
    if (changed) this.store.set('schedules', list);
  }

  // ---------------- energia ----------------
  _sampleEnergy() {
    const energy = this.store.get('energy');
    const now = Date.now();
    const cutoff = now - 7 * 24 * 3600 * 1000;
    for (const d of this.devices.values()) {
      const w = typeof d.state?.power === 'number' ? d.state.power : this._acEst(d);
      if (w == null) continue;
      const arr = energy[d.id] || (energy[d.id] = []);
      arr.push([now, w]);
      while (arr.length && arr[0][0] < cutoff) arr.shift();
    }
    if (this.pcLoad) { const arr = energy.pc || (energy.pc = []); arr.push([now, this.pcLoad.total]); while (arr.length && arr[0][0] < cutoff) arr.shift(); }
    for (const l of this._lampLoads()) { // luminárias: consumo estimado pela potência da lâmpada
      const arr = energy['lamp:' + l.id] || (energy['lamp:' + l.id] = []);
      arr.push([now, l.power]);
      while (arr.length && arr[0][0] < cutoff) arr.shift();
    }
    this.store.set('energy', energy);
    this._checkGoal(energy, now);
  }
  // meta do mês: avisa (no PC e no celular) uma vez por dia se a projeção passar da meta
  _checkGoal(energy, now = Date.now()) {
    const goal = +this.store.get('energyGoal') || 0; if (!goal) return;
    const tariff = this.store.get('settings').tariff ?? 0.85, p = monthProjection(energy, tariff, now);
    const day = new Date(now).toDateString();
    if (p.month > goal && this._goalDay !== day) {
      this._goalDay = day;
      const brl = v => 'R$ ' + v.toFixed(0);
      this.emit('notify', { title: 'Consumo acima da meta', body: `No ritmo das últimas 24 h, a conta do mês fica em ~${brl(p.month)} (meta ${brl(goal)}). Veja a aba Energia.` });
    }
  }

  async _fetchWeather() {
    const s = this.store.get('settings');
    if (s.weatherFx === false) { this.weather = null; return; }
    const lat = s.location?.lat ?? -23.55, lng = s.location?.lng ?? -46.63;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m,is_day&timezone=auto`;
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const c = (await r.json()).current || {};
      this.weather = { code: c.weather_code, temp: c.temperature_2m, cloud: c.cloud_cover, precip: c.precipitation, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, isDay: !!c.is_day, at: Date.now() };
      this._emit();
    } catch (e) { if (!this.weather) this.log('Clima: não foi possível consultar (' + e.message + ')', 'warn'); }
  }
  sunInfo() {
    const s = this.store.get('settings');
    const t = sunTimes(new Date(), s.location?.lat ?? -23.55, s.location?.lng ?? -46.63);
    return { sunrise: t.sunrise.getTime(), sunset: t.sunset.getTime() };
  }

  _seedDemoEnergy() {
    const energy = this.store.get('energy');
    const now = Date.now();
    for (const d of this.devices.values()) {
      if (d.provider !== 'demo' || d.type !== 'plug' || energy[d.id]?.length) continue;
      const arr = [];
      for (let t = now - 864e5; t < now; t += 5 * 60000) {
        const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
        let on;
        if (d.id.includes('tv')) on = h > 19 && h < 23.5;
        else if (d.id.includes('abajur')) on = h > 18 || h < 0.5;
        else if (d.id.includes('cafe')) on = (h > 6.7 && h < 7.1) || (h > 14 && h < 14.2);
        else if (d.id.includes('pc')) on = h > 9 && h < 18.5;
        else on = h > 13 && h < 16;
        arr.push([t, on ? +(d.nominal * (0.95 + Math.random() * 0.1)).toFixed(1) : 0]);
      }
      energy[d.id] = arr;
    }
    this.store.set('energy', energy);
  }

  _seedScenes() {
    this.store.set('scenes', [
      { id: 'sc-dormir', name: 'Dormir', icon: 'moon', actions: [
        { target: { type: 'all' }, command: { action: 'power', value: false }, onlyType: 'plug' },
        { target: { type: 'device', id: 'demo-ac-quarto' }, command: { action: 'power', value: true } },
        { target: { type: 'device', id: 'demo-ac-quarto' }, command: { action: 'temp', value: 23 } },
        { target: { type: 'device', id: 'demo-ac-quarto' }, command: { action: 'sleep', value: 240 } },
      ] },
      { id: 'sc-sair', name: 'Sair de casa', icon: 'door', actions: [
        { target: { type: 'all' }, command: { action: 'power', value: false } },
      ] },
      { id: 'sc-chegar', name: 'Cheguei', icon: 'home', actions: [
        { target: { type: 'device', id: 'demo-ac-sala' }, command: { action: 'power', value: true } },
        { target: { type: 'device', id: 'demo-plug-abajur' }, command: { action: 'power', value: true } },
      ] },
    ]);
    this.store.set('schedules', [
      { id: 'sch-1', name: 'Café da manhã', enabled: true, days: [1, 2, 3, 4, 5], time: '06:45', actions: [
        { target: { type: 'device', id: 'demo-plug-cafe' }, command: { action: 'power', value: true } }] },
      { id: 'sch-2', name: 'Ligar ar antes de dormir', enabled: true, days: [0, 1, 2, 3, 4, 5, 6], time: '22:30', actions: [
        { target: { type: 'scene', id: 'sc-dormir' }, command: {} }] },
    ]);
  }

  // ---------------- saída ----------------
  // ar-condicionado sem medição: potência estimada pela etiqueta (configurada no painel do ar)
  _acEst(d) {
    if (d.type !== 'ac' || typeof d.state?.power === 'number') return null;
    const cfg = (this.store.get('acPower') || {})[d.id]; if (!cfg?.w) return null;
    const on = !!d.state?.on && d.online !== false, since = this._acOnSince || (this._acOnSince = {});
    if (on && !since[d.id]) since[d.id] = Date.now(); if (!on) delete since[d.id];
    return estimateAcWatts({ ...d.state, on }, cfg, on ? (Date.now() - since[d.id]) / 60000 : 0);
  }
  // luminárias da planta com potência informada: acesas quando a tecla ligada a elas está ligada
  _lampLoads() {
    const lights = this.store.get('layout')?.lights || [];
    return lights.filter(l => +l.watts > 0).map(l => {
      const d = l.link?.dev && this.devices.get(l.link.dev);
      let on = false;
      if (d && d.online !== false) on = l.link.ch && d.state?.channels?.length ? !!d.state.channels.find(c => c.code === l.link.ch)?.on : !!d.state?.on;
      return { id: l.id, type: l.type, x: l.x, y: l.y, watts: +l.watts, on, power: on ? +l.watts : 0, link: l.link || null };
    });
  }
  // nomes personalizados das teclas (aliases "id#codigo")
  _chanNames(d) {
    const s = d.state;
    if (!s?.channels || s.channels.length < 2) return s;
    const al = this.store.get('aliases') || {};
    return { ...s, channels: s.channels.map(ch => ({ ...ch, name: al[`${d.id}#${ch.code}`] || ch.name })) };
  }

  // demonstração: luminárias de exemplo ligadas às teclas do interruptor da sala e ao abajur
  _seedDemoLamps(pl) {
    const layout = this.store.get('layout');
    if (!layout?.rooms?.length || layout.lights) return;
    const sw = pl['demo-switch-sala'];
    const r = (sw && (roomAt(layout, sw.x + 0.2, sw.y) || roomAt(layout, sw.x - 0.2, sw.y))) || layout.rooms[0];
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, id = n => 'l-demo-' + n;
    const lights = [
      { id: id(1), type: 'plafon', x: cx, y: cy, temp: 'neutra', link: { dev: 'demo-switch-sala', ch: 'switch_1' } },
      ...[0.25, 0.5, 0.75].map((k, i) => ({ id: id(2 + i), type: 'spot', x: r.x + r.w * k, y: r.y + 0.55, temp: 'quente', link: { dev: 'demo-switch-sala', ch: 'switch_2' } })),
      { id: id(5), type: 'pendente', x: cx, y: r.y + r.h * 0.78, temp: 'quente', link: { dev: 'demo-switch-sala', ch: 'switch_3' } },
    ];
    const ab = pl['demo-plug-abajur'];
    if (ab) lights.push({ id: id(6), type: 'abajur', x: ab.x, y: ab.y, z: 0.55, temp: 'quente', link: { dev: 'demo-plug-abajur', ch: null } });
    this.store.set('layout', { ...layout, lights });
  }
  snapshot() {
    return {
      devices: [...this.devices.values()].map(d => { const est = this._acEst(d), st = this._chanNames(d); return { ...d, state: est == null ? st : { ...st, power: est, powerEst: true }, nominal: undefined, name: this.store.get('aliases')[d.id] || d.name, room: this.roomOf(d.id), area: this.areaOf(d.id), local: !!this.tuyaLocal[d.id]?.connected || (d.provider === 'ewelink' && !!this.ewlLan?.has(d.id)) }; }),
      tuyaSaved: this.savedTuyaCount(), tuyaCloudOk: !!this.tuyaCloudOk,
      lampLoads: this._lampLoads(), pcLoad: this.pcLoad || null,
      sun: this.sunInfo(), weather: this.weather || null, location: this.store.get('settings').location || null,
      ewlSaved: Object.values(this.store.get('ewelinkDevices') || {}).filter(r => r.key).length,
      errors: this.errors,
    };
  }
  // ---------------- teclas ligadas (interruptor paralelo virtual) ----------------
  // Quando uma tecla muda (no app, numa regra ou apertada na parede), a tecla ligada a ela muda junto.
  // 'sync' = as duas comandam uma à outra; 'follow' = só a B segue a A.
  _chanStates() {
    const m = new Map();
    for (const d of this.devices.values()) {
      if (d.online === false || !d.state) continue;
      const chs = d.state.channels;
      if (chs?.length > 1) for (const c of chs) m.set(`${d.id}#${c.code}`, !!c.on);
      else if (typeof d.state.on === 'boolean') { m.set(`${d.id}#`, !!d.state.on); if (chs?.[0]?.code) m.set(`${d.id}#${chs[0].code}`, !!d.state.on); }
    }
    return m;
  }
  _checkLinks() {
    const links = (this.store.get('links') || []).filter(l => l.enabled !== false && l.a?.dev && (l.b?.dev || l.group?.length));
    const cur = this._chanStates(), prev = this._prevCh; this._prevCh = cur;
    if (!prev || !links.length) return;
    const now = Date.now(), echo = this._linkEcho || (this._linkEcho = new Map());
    const key = e => `${e.dev}#${e.ch || ''}`;
    for (const [k, v] of cur) {
      if (!prev.has(k) || prev.get(k) === v) continue;
      const e = echo.get(k);
      if (e && e.v === v && e.until > now) { echo.delete(k); continue; } // foi a própria ligação que mudou esta tecla
      for (const { target, value } of linkTargets(links, k, v)) {
        if (cur.get(key(target)) === value) continue;
        echo.set(key(target), { v: value, until: now + 8000 });
        const d = this.devices.get(target.dev); if (!d) continue;
        const multi = d.state?.channels?.length > 1;
        const cmd = multi && target.ch ? { action: 'channel', code: target.ch, value } : { action: 'power', value };
        this.command(target.dev, cmd).catch(err => this.log(`Teclas ligadas: ${d.name} não respondeu (${err.message})`, 'error'));
      }
    }
  }
  // saúde: aparelho que parou de responder (mais de 2 min) ou conta com erro → aviso no PC e no celular, uma vez
  _checkHealth(now = Date.now()) {
    if (this.store.get('settings').healthAlerts === false) return;
    if (!this._startedAt || now - this._startedAt < 180e3) return; // logo ao abrir, os aparelhos ainda estão conectando
    const off = this._offSince || (this._offSince = {}), told = this._told || (this._told = new Set());
    const gone = [];
    for (const d of this.devices.values()) {
      if (d.provider === 'demo') continue;
      if (d.online === false) {
        off[d.id] = off[d.id] || now;
        if (now - off[d.id] > 120e3 && !told.has(d.id)) { told.add(d.id); gone.push(this.store.get('aliases')[d.id] || d.name); }
      } else {
        if (told.has(d.id)) this.log(`${this.store.get('aliases')[d.id] || d.name} voltou a responder`);
        delete off[d.id]; told.delete(d.id);
      }
    }
    if (gone.length) this.emit('notify', { title: gone.length === 1 ? `${gone[0]} parou de responder` : `${gone.length} aparelhos pararam de responder`, body: gone.length === 1 ? 'Confira se está ligado e no Wi-Fi de casa.' : gone.join(', ') });
    const NAMES = { tuya: 'Tuya / Ekaza', lg: 'LG ThinQ', ewelink: 'Sonoff (eWeLink)' };
    for (const [k, msg] of Object.entries(this.errors || {})) {
      if (!msg || told.has('err:' + k)) continue;
      told.add('err:' + k); this.emit('notify', { title: `${NAMES[k] || k} desconectou`, body: String(msg).slice(0, 160) });
    }
    for (const k of [...told]) if (k.startsWith('err:') && !this.errors?.[k.slice(4)]) told.delete(k);
  }
  _emit() {
    try { this._checkLinks(); } catch (_) {}
    try { this._checkHealth(); } catch (_) {}
    clearTimeout(this._et);
    this._et = setTimeout(() => this.emit('update', this.snapshot()), 50);
  }
}

// Potência estimada de um ar-condicionado (W) a partir da potência da etiqueta e do estado.
// Inverter: o compressor trabalha mais quanto maior a diferença entre o ambiente e o alvo; nos primeiros 10 min, quase cheio.
// Convencional: liga e desliga; em média ~85% enquanto falta resfriar e ~45% mantendo.
// kWh das últimas 24 h de uma série [[t, W], ...] (buracos maiores que 30 min não contam: app fechado)
function kwh24(h, now = Date.now()) {
  const pts = (h || []).filter(p => p[0] > now - 864e5); let e = 0;
  for (let i = 1; i < pts.length; i++) { const dt = (pts[i][0] - pts[i - 1][0]) / 36e5; if (dt < 0.5) e += (pts[i][1] + pts[i - 1][1]) / 2 * dt; }
  return e / 1000;
}
// projeção do mês em R$ pelas últimas 24 h de tudo que mede ou é estimado
function monthProjection(energy, tariff = 0.85, now = Date.now()) {
  let k = 0; for (const h of Object.values(energy || {})) k += kwh24(h, now);
  return { kwh24: k, month: k * tariff * 30 };
}

function estimateAcWatts(st, cfg, onForMin = 60) {
  const W = +cfg?.w || 0;
  if (!W || !st?.on) return 0;
  const mode = String(st.mode || 'COOL').toUpperCase();
  if (/FAN/.test(mode)) return Math.round(Math.min(60, W * 0.06));
  if (/DRY/.test(mode)) return Math.round(W * 0.4);
  const cur = typeof st.current === 'number' ? st.current : null, tgt = typeof st.target === 'number' ? st.target : null;
  const gap = cur == null || tgt == null ? 1.5 : /HEAT/.test(mode) ? tgt - cur : /AUTO/.test(mode) ? Math.abs(cur - tgt) : cur - tgt;
  let f;
  if (cfg.inverter === false) f = gap > 0.5 ? 0.85 : 0.45;
  else f = Math.min(1, Math.max(0.3, 0.3 + 0.18 * Math.max(0, gap)));
  if (onForMin < 10) f = Math.max(f, 0.9);
  if (/POWER|JET|TURBO/i.test(st.fan || '')) f = Math.min(1.15, Math.max(f, 1) * 1.1);
  if (st.eco) f *= 0.85;
  return Math.round(W * f);
}

// O que muda quando a tecla k vai para v:
//  - ligação simples (b): 'sync' nos dois sentidos, 'follow' só de A para B;
//  - grupo (group: várias teclas de outros interruptores): act 'same' liga e desliga junto, 'off' só apaga, 'on' só acende
//    (com 'off'/'on' a tecla funciona como botão: apertar para qualquer lado faz a mesma coisa).
const lkey = e => `${e.dev}#${e.ch || ''}`;
function linkTargets(links, k, v) {
  const out = [];
  for (const l of links) {
    if (l.group?.length) {
      if (k !== lkey(l.a)) continue;
      const value = l.act === 'off' ? false : l.act === 'on' ? true : v;
      for (const t of l.group) if (lkey(t) !== k) out.push({ target: t, value });
      continue;
    }
    const target = k === lkey(l.a) ? l.b : k === lkey(l.b) && l.mode !== 'follow' ? l.a : null;
    if (target) out.push({ target, value: v });
  }
  return out;
}

// Cômodo que contém o ponto; para aparelhos na parede, usa o mais próximo (tolerância de 30 cm).
// Planta v2: cada cômodo tem "poly" (paredes em qualquer ângulo); planta antiga: retângulo x/y/w/h.
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segD(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}
const polyOf = r => r.poly || [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
function roomAt(layout, x, y) {
  const rooms = layout?.rooms || [];
  const inside = rooms.find(r => inPoly(x, y, polyOf(r)));
  if (inside) return inside;
  let best = null, bd = 0.3;
  for (const r of rooms) {
    const p = polyOf(r), cx = r.cx ?? r.x + r.w / 2, cy = r.cy ?? r.y + r.h / 2;
    let d = Infinity;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) d = Math.min(d, segD(x, y, p[j][0], p[j][1], p[i][0], p[i][1]));
    d += 0.001 * Math.hypot(cx - x, cy - y);
    if (d <= bd) { bd = d; best = r; }
  }
  return best;
}

module.exports = { Hub, roomAt, linkTargets, estimateAcWatts, kwh24, monthProjection };
