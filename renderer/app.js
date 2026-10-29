import { House3D } from './house3d.js';
import { AC3D } from './ac3d.js';
import { PlanBuilder } from './builder.js';
import { fillThumbs } from './furn-thumbs.js'; // miniaturas 3D dos móveis e das luminárias
import { I } from './icons.js';
import { logicalRooms, FLOORS, defaultFloor, toV2, wallSides, DEF_T, roomAt as geoRoomAt } from './geom.js';
import { WALL_FINISHES, WALL_COLORS, FLOOR_TINTS } from './plan-model.js';
import { CATALOG, SWATCHES, byType, draw2D } from './furniture.js';
import { LAMPS, TEMPS, lampType, drawLamp2D } from './lamps.js';
import { CHANGELOG, notesSince } from './changelog.js';
import { weatherKind } from './sky.js';
import { sound } from './sound.js';
import { stylesFor, defaultStyle } from './switches.js';

const api = window.api;
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n, d = 1) => typeof n === 'number' && isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '--';

const MODE = { COOL: ['Refrigerar', 'snow'], AIR_DRY: ['Desumidificar', 'drop'], FAN: ['Ventilar', 'fan'], AUTO: ['Automático', 'auto'], HEAT: ['Aquecer', 'sun'], ENERGY_SAVING: ['Economia', 'leaf'], AIR_CLEAN: ['Purificar', 'wind'] };
const FAN = { LOW: 'Baixa', MID: 'Média', HIGH: 'Alta', AUTO: 'Auto', SLOW: 'Muito baixa', LOW_MID: 'Baixa-média', MID_HIGH: 'Média-alta', POWER: 'Turbo (Jet)', NATURE: 'Natural', SLOW_LOW: 'Mínima' };
const FLAGS = { forestWind: 'Vento natural', autoFitWind: 'Ajuste automático', airGuideWind: 'Guia de ar', concentrationWind: 'Vento concentrado', highCeilingWind: 'Teto alto', longPowerWind: 'Longo alcance', mannerWind: 'Vento suave', swirlWind: 'Vento em espiral' };
const pretty = s => String(s ?? '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
const modeName = m => MODE[m]?.[0] || pretty(m);
const fanName = f => FAN[f] || pretty(f);
const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TIMES = [0, 30, 60, 120, 180, 240, 360, 480];
const timeName = m => !m ? 'Desligado' : m < 60 ? `${m} min` : `${fmt(m / 60)} h`;

const S = { devices: [], placements: {}, scenes: [], schedules: [], settings: {}, logs: [], errors: {}, view: 'home', panel: null, selectedRoom: null };
// toda planta que chega (do PC, do celular ou de versões antigas) vira o modelo v2 (paredes livres, cômodos por polígono)
{ let lay = null; Object.defineProperty(S, 'layout', { get: () => lay, set: v => { lay = v ? toV2(v) : v; }, enumerable: true }); }
const dev = id => S.devices.find(d => d.id === id);
const rooms = () => logicalRooms(S.layout);
const roomName = id => rooms().find(r => r.id === id)?.name || 'Sem cômodo';
// "Jantar · Área social" para aparelhos de ambientes unidos
const areaName = d => d.area ? (S.layout?.rooms || []).find(r => r.id === d.area)?.name || '' : '';
const placeName = d => { const a = areaName(d); return a ? `${a} · ${roomName(d.room)}` : roomName(d.room); };

// ------------------------------------------------------------------ init
let house, editor;
async function init() {
  window.__dbg = { openPanel: p => openPanel(p), closePanel: () => closePanel(), get S() { return S; } }; // usado nos testes automáticos
  // navegação
  // ícones coloridos no estilo do iOS (cada tela com a sua cor)
  // tons escolhidos para o ícone branco ter contraste de pelo menos 3:1 (diretrizes de acessibilidade da Apple)
  const icons = { home: ['home', 'Minha casa', '#d97a0a', '#f29a26'], devices: ['grid', 'Dispositivos', '#007aff', '#3d9bff'], auto: ['sparkles', 'Automação', '#a347d6', '#bb6ae8'], energy: ['bolt', 'Energia', '#248a3d', '#36a852'], plan: ['plan', 'Planta', '#1a8dc7', '#3aa8dd'], settings: ['gear', 'Ajustes', '#6e6e73', '#8a8a8f'] };
  for (const b of document.querySelectorAll('#rail button')) { const [ic, lb, c, c2] = icons[b.dataset.view]; b.innerHTML = `<i class="rb-ic" style="--c:${c};--c2:${c2}" aria-hidden="true">${I(ic)}</i><span>${lb}</span>`; b.setAttribute('aria-label', lb); b.onclick = () => go(b.dataset.view); }
  // botões só de ícone ganham nome para o leitor de tela (usa a dica do botão)
  const nameButtons = root => { for (const b of root.querySelectorAll('button[title]:not([aria-label]), [role=button][title]:not([aria-label])')) if (!b.textContent.trim()) b.setAttribute('aria-label', b.title.replace(/\s*\(.*?\)/g, '').trim()); };
  nameButtons(document); new MutationObserver(() => nameButtons(document)).observe(document.body, { childList: true, subtree: true });
  // tamanho do texto (Ctrl + / Ctrl − / Ctrl 0), lembrado entre aberturas
  const zoomSteps = [0.9, 1, 1.12, 1.25, 1.4];
  let zoom = 1; try { zoom = +localStorage.getItem('textZoom') || 1; } catch (_) {}
  window.setTextZoom = z => { zoom = Math.min(1.4, Math.max(0.9, z)); try { localStorage.setItem('textZoom', zoom); } catch (_) {} api.setZoom?.(zoom); document.querySelectorAll('[data-zoom] button').forEach(x => x.classList.toggle('on', +x.dataset.v === zoom)); };
  if (zoom !== 1) setTextZoom(zoom);
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || api.web) return;
    const i = zoomSteps.findIndex(v => v >= zoom - 1e-3);
    if (e.key === '=' || e.key === '+') { e.preventDefault(); setTextZoom(zoomSteps[Math.min(zoomSteps.length - 1, i + 1)]); }
    else if (e.key === '-') { e.preventDefault(); setTextZoom(zoomSteps[Math.max(0, i - 1)]); }
    else if (e.key === '0') { e.preventDefault(); setTextZoom(1); }
  });
  // barra lateral recolhível (lembra a escolha; em telas estreitas começa recolhida)
  const appEl = document.getElementById('app'), sbBtn = document.getElementById('btn-sidebar');
  let railSaved = null; try { railSaved = localStorage.getItem('railCollapsed'); } catch (_) {}
  const setRail = (c, save) => {
    appEl.classList.toggle('rail-collapsed', c);
    sbBtn.title = c ? 'Mostrar a barra lateral (Ctrl+B)' : 'Recolher a barra lateral (Ctrl+B)';
    if (save) try { localStorage.setItem('railCollapsed', c ? '1' : '0'); } catch (_) {}
  };
  sbBtn.innerHTML = I('sidebar');
  if (!api.web) setRail(railSaved != null ? railSaved === '1' : innerWidth < 1260, false); // no celular a barra vira abas embaixo
  sbBtn.onclick = () => setRail(!appEl.classList.contains('rail-collapsed'), true);
  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); sbBtn.click(); } });
  const applyTheme = () => { const t = window.__resolveTheme(); house?.setTheme?.(t); api.setTheme?.(t); editor?.house?.setTheme(t); if (S.view === 'energy') renderEnergyLive(); };
  window.addEventListener('themechange', applyTheme);
  setTimeout(applyTheme);
  document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); });
  $('#btn-frame').innerHTML = I('focus');
  $('#btn-mini').innerHTML = `${I('mini')}Mini`;
  $('#btn-mini').onclick = () => api.openMini();
  const MODES = [['min', 'Rótulos: mínimo'], ['full', 'Rótulos: todos'], ['none', 'Rótulos: só ícones']];
  let lm = 'min'; try { lm = localStorage.getItem('labelMode') || 'min'; } catch (_) {}
  const lmBtn = document.createElement('button'); lmBtn.className = 'label-mode';
  const setLm = m => { lm = m; house.setLabelMode(m); lmBtn.innerHTML = `${I('grid')}<span>${MODES.find(x => x[0] === m)[1]}</span>`; try { localStorage.setItem('labelMode', m); } catch (_) {} };
  lmBtn.title = 'Mostrar mais ou menos informações no mapa';
  lmBtn.onclick = () => setLm(MODES[(MODES.findIndex(x => x[0] === lm) + 1) % MODES.length][0]);
  // (os botões antigos viraram opções do menu Vista)
  setTimeout(() => setLm(lm));
  setTimeout(() => house.setQuality(getQuality()));
  const NM = [['auto', 'sun', 'Dia/noite: automático'], ['day', 'sun', 'Vista dia'], ['night', 'moon', 'Vista noite']];
  let nm = 'auto'; try { nm = localStorage.getItem('nightMode') || 'auto'; } catch (_) {}
  const nmBtn = document.createElement('button'); nmBtn.className = 'label-mode';
  const setNm = (m, animate = true) => { nm = m; house.setNightMode(m, animate); const x = NM.find(z => z[0] === m); nmBtn.innerHTML = `${I(x[1])}<span>${x[2]}</span>`; try { localStorage.setItem('nightMode', m); } catch (_) {} };
  nmBtn.title = 'Automático segue o nascer e o pôr do sol';
  nmBtn.onclick = () => setNm(NM[(NM.findIndex(z => z[0] === nm) + 1) % NM.length][0]);
  // formas de ver as paredes: corte automático (casa de bonecas), meia altura, baixas ou inteiras
  const WM = [['cut', 'Paredes: corte', 'As paredes viradas para você abaixam sozinhas ao girar'], ['half', 'Paredes: meia altura', 'Todas as paredes na metade da altura'], ['low', 'Paredes: baixas', 'Paredes rentes, para ver a casa inteira'], ['full', 'Paredes: inteiras', 'Paredes na altura completa']];
  let wm = (() => { try { return localStorage.getItem('wallMode') || 'cut'; } catch (_) { return 'cut'; } })();
  const wmBtn = document.createElement('button'); wmBtn.className = 'label-mode';
  const setWm = m => { wm = WM.some(z => z[0] === m) ? m : 'cut'; house.setOptions({ wallMode: wm }); const x = WM.find(z => z[0] === wm); wmBtn.innerHTML = `${I('wall')}<span>${x[1]}</span>`; wmBtn.title = x[2]; try { localStorage.setItem('wallMode', wm); } catch (_) {} };
  wmBtn.onclick = () => setWm(WM[(WM.findIndex(z => z[0] === wm) + 1) % WM.length][0]);
  nmBtn.after(wmBtn); setTimeout(() => setWm(wm)); // a casa 3D é criada logo abaixo
  setTimeout(() => { setNm(nm, false); if (S.sun) house.setSun(S.sun); });
  // planta 2D <-> 3D e passeio pela casa
  const v2Btn = document.createElement('button'); v2Btn.className = 'label-mode'; v2Btn.title = 'Alternar entre a vista 3D e a planta 2D';
  const setV2 = on => { v2Btn.innerHTML = `${I(on ? 'cube' : 'plan')}<span>${on ? 'Ver em 3D' : 'Planta 2D'}</span>`; v2Btn.classList.toggle('on', on); };
  v2Btn.onclick = () => { house.set2D(!house.mode2d); sound.tick(); };
  const wkBtn = document.createElement('button'); wkBtn.className = 'label-mode'; wkBtn.title = 'Passear pela casa em primeira pessoa';
  const setWk = on => { wkBtn.innerHTML = `${I(on ? 'close' : 'walk')}<span>${on ? 'Sair do passeio' : 'Passear'}</span>`; wkBtn.classList.toggle('on', on); };
  wkBtn.onclick = () => { if (house.walk) house.exitWalk(); else { closePanel(); house.enterWalk(S.selectedRoom); } sound.tick(); };
  setV2(false);
  document.addEventListener('viewchange', e => setV2(e.detail.mode2d));
  document.addEventListener('walkchange', e => {
    setWk(e.detail); setV2(false); document.body.classList.toggle('walk-mode', e.detail);
    if (e.detail) toast(matchMedia('(hover: none)').matches ? 'Arraste para olhar e toque no chão para andar' : 'Arraste para olhar · W A S D ou clique no chão para andar · Esc para sair');
  });
  // o dia passando: relógio grande enquanto o sol anda
  $('#view-home').insertAdjacentHTML('beforeend', '<div class="tl-pill" id="tl-pill"></div>');
  document.addEventListener('timelapse', e => { const p = $('#tl-pill'); p.classList.toggle('show', !!e.detail.active); if (e.detail.time) p.innerHTML = `${I('clock')}${e.detail.time}`; });
  // botão de som da casa: liga/desliga o ambiente (chuva, trovão, pássaros, grilos)
  let ambMute = false; try { ambMute = localStorage.getItem('ambientMute') === '1'; } catch (_) {}
  const sndBtn = document.createElement('button'); sndBtn.className = 'icon-btn snd-btn'; sndBtn.id = 'btn-sound';
  const setSnd = m => { ambMute = m; sndBtn.innerHTML = I(m ? 'mute' : 'speaker'); sndBtn.classList.toggle('muted', m); sndBtn.title = m ? 'Sons da casa desligados (clique para ligar)' : 'Sons da casa: chuva, pássaros de dia e grilos à noite (clique para silenciar)'; sndBtn.setAttribute('aria-label', m ? 'Ligar sons da casa' : 'Silenciar sons da casa'); try { localStorage.setItem('ambientMute', m ? '1' : '0'); } catch (_) {} };
  sndBtn.onclick = () => { setSnd(!ambMute); ambientTick(); if (!ambMute) sound.tick(); };
  setSnd(ambMute); $('#btn-frame').before(sndBtn);
  // botão do clima: tempo real ou um clima escolhido para ver na casa 3D
  const wxBtn = document.createElement('button'); wxBtn.className = 'icon-btn wx-btn'; wxBtn.id = 'btn-weather';
  const wxPaint = () => { const o = WX.find(x => x[0] === wxOverride) || WX[0]; const real = S.weather ? weatherKind(S.weather.code) : null;
    wxBtn.innerHTML = I(wxOverride == null ? (real?.icon || 'sun') : o[2]); wxBtn.classList.toggle('on', wxOverride != null);
    wxBtn.title = wxOverride == null ? `Clima: tempo real${real?.label ? ' (' + real.label.toLowerCase() + ')' : ''}` : `Clima: ${o[1].toLowerCase()} (escolhido por você)`; wxBtn.setAttribute('aria-label', wxBtn.title); };
  wxBtn.onclick = e => {
    e.stopPropagation(); const old = $('.wx-pop'); if (old) { old.remove(); return; }
    const pop = document.createElement('div'); pop.className = 'wx-pop'; pop.setAttribute('role', 'menu');
    pop.innerHTML = `<div class="wx-h">Clima na casa</div>` + WX.map(([c, n, ic]) => `<button role="menuitemradio" aria-checked="${c === wxOverride}" class="${c === wxOverride ? 'on' : ''}" data-wx="${c ?? ''}">${I(ic)}<span>${n}</span>${c === wxOverride ? I('check') : ''}</button>`).join('')
      + (S.settings?.weatherFx === false ? `<p class="wx-note">O clima no 3D está desligado em Ajustes → Geral.</p>` : '');
    const r = wxBtn.getBoundingClientRect(), host = $('#view-home').getBoundingClientRect();
    pop.style.top = (r.bottom - host.top + 8) + 'px'; pop.style.right = (host.right - r.right) + 'px';
    $('#view-home').append(pop);
    pop.onclick = ev => { const b = ev.target.closest('[data-wx]'); if (!b) return; wxOverride = b.dataset.wx === '' ? null : +b.dataset.wx;
      try { localStorage.setItem('weatherOverride', wxOverride ?? ''); } catch (_) {} applyWeather(); wxPaint(); pop.remove(); sound.tick(); setTimeout(ambientTick, 1500); };
    setTimeout(() => document.addEventListener('pointerdown', function close(ev) { if (!pop.contains(ev.target) && ev.target !== wxBtn) { pop.remove(); } document.removeEventListener('pointerdown', close); }), 0);
  };
  wxPaint(); document.addEventListener('weatherpaint', wxPaint);
  // menu Vista: 3D/planta, hora do dia, paredes, rótulos, clima e passeio, num lugar só
  const vwBtn = document.createElement('button'); vwBtn.className = 'label-mode vw-btn'; vwBtn.id = 'btn-view'; vwBtn.setAttribute('aria-haspopup', 'menu');
  const vwPaint = () => { const two = !!house?.mode2d; vwBtn.innerHTML = `${I(two ? 'plan' : 'layers')}<span>${two ? 'Planta 2D' : 'Vista'}</span>${I('chevron', 'vw-ch')}`; vwBtn.classList.toggle('on', two); vwBtn.title = 'Como ver a casa: 3D ou planta, dia ou noite, paredes, rótulos e clima'; };
  const segH = (key, opts, cur) => `<div class="seg vw-seg" data-vw="${key}">${opts.map(([v, n]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const vwOpen = () => {
    const old = $('.vw-pop'); if (old) { old.remove(); vwBtn.setAttribute('aria-expanded', 'false'); return; }
    const pop = document.createElement('div'); pop.className = 'vw-pop'; pop.setAttribute('role', 'menu');
    const draw = () => {
      pop.innerHTML = `<div class="vw-sec"><div class="vw-h">Modo</div>${segH('mode', [['3d', '3D'], ['2d', 'Planta 2D']], house.mode2d ? '2d' : '3d')}</div>
        <div class="vw-sec"><div class="vw-h">Hora do dia</div>${segH('night', [['auto', 'Automático'], ['day', 'Dia'], ['night', 'Noite']], nm)}</div>
        <div class="vw-sec"><div class="vw-h">Paredes</div>${segH('walls', [['cut', 'Corte'], ['half', 'Meia'], ['low', 'Baixas'], ['full', 'Inteiras']], wm)}</div>
        <div class="vw-sec"><div class="vw-h">Rótulos no mapa</div>${segH('labels', [['min', 'Mínimo'], ['full', 'Todos'], ['none', 'Só ícones']], lm)}</div>
        <div class="vw-sec"><div class="vw-h">Clima na casa</div><div class="vw-wx">${WX.map(([c, n, ic]) => `<button data-wx="${c ?? ''}" class="${c === wxOverride ? 'on' : ''}" title="${n}">${I(ic)}<span>${n}</span></button>`).join('')}</div>
          ${S.settings?.weatherFx === false ? `<p class="wx-note">O clima no 3D está desligado em Ajustes → Aparência.</p>` : ''}</div>
        <button class="vw-walk" data-vwalk>${I('walk')}<span>Passear pela casa</span><small>primeira pessoa</small></button>`;
    };
    draw();
    const r = vwBtn.getBoundingClientRect(), host = $('#view-home').getBoundingClientRect();
    pop.style.top = (r.bottom - host.top + 8) + 'px'; pop.style.right = Math.max(12, host.right - r.right) + 'px';
    $('#view-home').append(pop); vwBtn.setAttribute('aria-expanded', 'true');
    pop.onclick = ev => {
      const w = ev.target.closest('[data-wx]');
      if (w) { wxOverride = w.dataset.wx === '' ? null : +w.dataset.wx; try { localStorage.setItem('weatherOverride', wxOverride ?? ''); } catch (_) {} applyWeather(); wxPaint(); setTimeout(ambientTick, 1500); sound.tick(); return draw(); }
      if (ev.target.closest('[data-vwalk]')) { pop.remove(); closePanel(); house.enterWalk(S.selectedRoom); sound.tick(); return; }
      const b = ev.target.closest('[data-v]'), seg = b?.closest('[data-vw]'); if (!b || !seg) return;
      const v = b.dataset.v, k = seg.dataset.vw;
      if (k === 'mode') { if ((v === '2d') !== !!house.mode2d) house.set2D(v === '2d'); }
      else if (k === 'night') setNm(v); else if (k === 'walls') setWm(v); else if (k === 'labels') setLm(v);
      sound.tick(); draw();
    };
    setTimeout(() => document.addEventListener('pointerdown', function close(ev) { if (!pop.contains(ev.target) && !vwBtn.contains(ev.target)) { pop.remove(); vwBtn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', close); } }), 0);
  };
  vwBtn.onclick = e => { e.stopPropagation(); vwOpen(); };
  $('.scene-tools').prepend(vwBtn); setTimeout(vwPaint);
  document.addEventListener('viewchange', vwPaint);
  const ambientOn = () => S.settings?.sound !== false && !ambMute && S.view === 'home' && !document.hidden;
  document.addEventListener('thunder', () => { if (ambientOn()) sound.thunder(0.4 + Math.random() * 1.2); });
  // chuva baixinha quando estiver chovendo; pássaros de dia e grilos à noite, com a tela Casa aberta
  const ambientTick = () => {
    const fx = house.weatherFx, on = ambientOn(), rain = fx.rain.visible ? fx.intensity : 0;
    sound.setRain(on ? rain : 0);
    sound.setAmbient(on ? { night: house.night ?? 0, rain } : null);
  };
  setInterval(ambientTick, 2000);
  document.addEventListener('visibilitychange', ambientTick);
  $('#btn-frame').onclick = () => { S.selectedRoom = null; S.selectedArea = null; house.selectRoom(null); renderRoomStrip(); };

  if (api.web) {
    initSheet();
    $('#empty-house p').textContent = 'A planta da casa é desenhada no app do PC. Enquanto isso, use a aba Dispositivos.';
  } else {
    api.onSaved?.(async () => { const a = await api.getAll(); S.scenes = a.scenes; S.schedules = a.schedules; S.rules = a.rules; renderView(); });
  }
  window.__sound = sound; house = window.__house = new House3D($('#scene'), { overlay: $('#overlay'), onDevice: id => openPanel({ type: 'device', id }), onRoom: (id, area) => selectRoom(id, area),
    onEmpty: () => { if (!S.panel && !S.selectedRoom) return; closePanel(); S.selectedRoom = null; S.selectedArea = null; house.selectRoom(null); renderRoomStrip(); } });

  Object.assign(S, await api.getAll());
  applyHouseOptions();
  api.onUpdate(snap => {
    S.devices = snap.devices; S.lampLoads = snap.lampLoads || []; S.pcLoad = snap.pcLoad || null; S.errors = snap.errors; S.tuyaSaved = snap.tuyaSaved; S.ewlSaved = snap.ewlSaved;
    if (snap.sun) { S.sun = snap.sun; house.setSun(snap.sun); }
    if (snap.location) house.setLocation(snap.location);
    if (snap.weather !== undefined && JSON.stringify(snap.weather) !== JSON.stringify(S.weather)) { S.weather = snap.weather; applyWeather(); }
    onDevicesChanged();
  });
  // descanso de tela: a interface some devagar e aparece um relógio grande
  $('#view-home').insertAdjacentHTML('beforeend', '<div class="idle-clock" id="idle-clock"></div>');
  document.addEventListener('idlechange', e => { document.body.classList.toggle('idle-mode', e.detail); tickClock(); });
  document.addEventListener('introchange', e => { document.body.classList.toggle('intro-mode', e.detail); if (!e.detail) animIn(['#hud', '#room-strip']); });
  api.onUpdater(onUpdater);
  if (!api.web) api.updaterState().then(onUpdater).catch(() => {});
  $('#upd-pill').onclick = () => showUpdateSheet();
  setTimeout(showWhatsNew, 1200);
  api.onLog(l => { S.logs.unshift(l); if (l.level === 'error') toast(l.msg, 'error'); if (S.view === 'auto') renderAuto(); });

  house.setLayout(S.layout, S.placements, S.devices);
  house.start();
  if (S.settings.introAnim === false) animIn(['#hud', '#room-strip']);
  setInterval(tickClock, 1000); tickClock();
  renderAll();
}

function applyHouseOptions() {
  const st = S.settings || {};
  const prev = { ext: house.opts.exterior, roof: house.opts.roof };
  house.setOptions({ intro: st.introAnim !== false, idle: st.idle !== false, idleMin: +st.idleMin || 2, weather: st.weatherFx !== false,
    exterior: false, roof: st.roof !== false, sunBeams: st.sunBeams !== false, style: st.style3d === 'classic' ? 'classic' : 'maquete', tipFor });
  sound.setEnabled(st.sound !== false);
  if (house.layout && (prev.ext !== house.opts.exterior || prev.roof !== house.opts.roof)) house.setLayout(S.layout, S.placements, S.devices);
  house.setLocation(st.location || S.location);
  applyWeather();
}
function go(view) {
  if (api.web && (view === 'plan' || view === 'settings')) return toast('A planta e os ajustes ficam no app do PC');
  S.view = view;
  for (const b of document.querySelectorAll('#rail button')) b.classList.toggle('active', b.dataset.view === view);
  for (const v of document.querySelectorAll('.view')) v.classList.toggle('active', v.id === 'view-' + view);
  if (view === 'home') { house.setLayout(S.layout, S.placements, S.devices); house.start(); } else house.stop();
  if (view !== 'plan') editor?.stop();
  if (view === 'plan' || view === 'settings') closePanel();
  if (view === 'plan') renderPlan();
  renderView();
  animIn(view === 'home' ? ['#hud', '#room-strip'] : ['#view-' + view]);
}
function animIn(sels) {
  for (const sel of sels) { const el = $(sel); if (!el) continue; el.classList.remove('anim-in'); void el.offsetWidth; el.classList.add('anim-in'); clearTimeout(el._ai); el._ai = setTimeout(() => el.classList.remove('anim-in'), 1000); }
}
function renderAll() { renderStatus(); renderView(); renderHome(); }
function renderView() {
  if (S.view === 'home') renderHome();
  if (S.view === 'devices') renderDevices();
  if (S.view === 'auto') renderAuto();
  if (S.view === 'energy') renderEnergy();
  if (S.view === 'settings') renderSettings();
}
function onDevicesChanged() {
  house.updateDevices(S.devices);
  renderStatus();
  if (S.view === 'home') renderHome();
  if (S.view === 'devices') renderDevices();
  if (S.view === 'energy') renderEnergyLive();
  if (S.view === 'plan' && editor) { editor.setDevices(S.devices); renderPlanSide(); }
  updatePanel();
}
function tickClock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ic = $('#idle-clock');
  if (ic && document.body.classList.contains('idle-mode')) {
    const wk = S.weather ? weatherKind(S.weather.code) : null, on = S.devices.filter(x => x.state?.on && x.online !== false).length;
    ic.innerHTML = `<div class="ic-time">${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      <div class="ic-date">${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div class="ic-meta">${wk ? `<span>${I(wk.icon || 'sun')}${fmt(S.weather.temp, 0)}° ${esc(wk.label)}</span>` : ''}<span>${I('power')}${on} ligado${on === 1 ? '' : 's'}</span></div>`;
  }
}
function renderStatus() {
  const s = S.settings, chips = [];
  if (s.demo) chips.push(`<span class="chip demo"><i></i>Demonstração</span>`);
  if (s.tuya?.enabled) chips.push(`<span class="chip ${S.errors.tuya ? 'err' : 'ok'}" title="${esc(S.errors.tuya || '')}"><i></i>Tuya / Ekaza</span>`);
  if (s.lg?.enabled) chips.push(`<span class="chip ${S.errors.lg ? 'err' : 'ok'}" title="${esc(S.errors.lg || '')}"><i></i>LG ThinQ</span>`);
  if (s.ewelink?.enabled) chips.push(`<span class="chip ${S.errors.ewelink ? 'err' : 'ok'}" title="${esc(S.errors.ewelink || '')}"><i></i>Sonoff</span>`);
  $('#status').innerHTML = chips.join('');
}

// ------------------------------------------------------------------ CASA
function renderHome() {
  const hasLayout = S.layout && (S.layout.walls2 || []).length;
  $('#empty-house').classList.toggle('hidden', !!hasLayout);
  const on = S.devices.filter(d => d.state?.on && d.online !== false);
  const watts = S.devices.reduce((a, d) => a + (d.state?.on && typeof d.state.power === 'number' ? d.state.power : 0), 0);
  const temps = S.devices.filter(d => d.type === 'ac' && typeof d.state?.current === 'number').map(d => d.state.current);
  const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  const h = new Date().getHours();
  const greet = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  // topo discreto, no mesmo estilo da tela Dispositivos: linha de informações + saudação
  const line = h < 12 ? 'tenha um ótimo dia.' : h < 18 ? 'sua casa está em dia.' : 'hora de relaxar.';
  const wk = S.weather && S.settings.weatherFx !== false ? weatherKind(S.weather.code) : null;
  $('#hud').innerHTML = `<div class="home-head">
    <div class="dv-info">
      ${wk ? `<span title="${esc(wk.label)}">${I(wk.icon || 'sun')}<b data-num="o" data-to="${S.weather.temp}" data-d="0"></b>°C lá fora</span>` : ''}
      ${avg !== null ? `<span>${I('thermo')}<b data-num="t" data-to="${avg}" data-d="1"></b>°C dentro</span>` : ''}
      <span>${I('bolt')}<b data-num="w" data-to="${watts}" data-d="0"></b> W</span>
      <span>${I('power')}<b data-num="on" data-to="${on.length}" data-d="0"></b> de ${S.devices.length} ligados</span>
    </div>
    <h1 class="dv-hello">${greet},<br><span>${line}</span></h1></div>`;
  animateNumbers($('#hud'));
  renderRoomStrip();
}
// etiqueta flutuante do aparelho no 3D (vidro com os dados e um mini gráfico)
const tipEnergy = {};
function sparkline(pts) {
  if (!pts || pts.length < 3) return '';
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(1, ...ys);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((p[0] - x0) / (x1 - x0 || 1) * 150).toFixed(1)},${(34 - p[1] / y1 * 30).toFixed(1)}`).join('');
  return `<svg class="tip-spark" viewBox="0 0 150 36" preserveAspectRatio="none"><path d="${d}L150,36L0,36Z" class="a"/><path d="${d}" class="l"/></svg>`;
}
function tipFor(id) {
  const d = dev(id); if (!d) return '';
  const s = d.state || {}, off = d.online === false;
  let body = '';
  if (off) body = '<div class="tip-big" style="color:var(--red)">Offline</div>';
  else if (d.type === 'ac') body = `<div class="tip-big">${s.on ? `${fmt(s.target)}<small>°C</small>` : '<span class="dim">Desligado</span>'}</div>
    <div class="tip-row"><span>Ambiente</span><b>${fmt(s.current)}°</b></div>${s.on ? `<div class="tip-row"><span>${esc(modeName(s.mode))}</span><b>${esc(fanName(s.fan))}</b></div>` : ''}`;
  else if ((s.channels?.length || 0) > 1) body = `<div class="tip-keys">${s.channels.map((c, i) => `<span class="${c.on ? 'on' : ''}">${esc(c.name || `Tecla ${i + 1}`)}</span>`).join('')}</div>`;
  else {
    if (!tipEnergy[id] || Date.now() - tipEnergy[id].t > 60000) { tipEnergy[id] = { t: Date.now(), pts: tipEnergy[id]?.pts || null }; api.getEnergy(id).then(h => { tipEnergy[id].pts = h.filter(p => p[0] > Date.now() - 864e5); }).catch(() => {}); }
    body = `<div class="tip-big">${s.on ? (typeof s.power === 'number' ? `${fmt(s.power, 0)}<small>W</small>` : 'Ligada') : '<span class="dim">Desligada</span>'}</div>${sparkline(tipEnergy[id].pts)}`;
  }
  return `<div class="tip-name">${esc(d.name)}</div><div class="tip-room">${esc(roomName(d.room))}</div>${body}`;
}
// números que "contam" até o valor novo
const numCache = {};
function animateNumbers(root) {
  for (const el of root.querySelectorAll('[data-num]')) {
    const key = el.dataset.num, to = +el.dataset.to, dec = +el.dataset.d || 0, from = numCache[key] ?? to;
    numCache[key] = to;
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to, dec); continue; }
    const t0 = performance.now(), dur = 650;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e, dec); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
    el.textContent = fmt(from, dec); requestAnimationFrame(step);
  }
}
function renderRoomStrip() {
  if (!S.layout) { $('#room-strip').innerHTML = ''; return; }
  // ambientes unidos aparecem como áreas separadas (cada uma com os seus aparelhos)
  const cards = rooms().flatMap(r => r.grouped ? r.rects.map(p => ({ id: r.id, area: p.id, name: p.name, list: S.devices.filter(d => d.room === r.id && d.area === p.id) }))
    : [{ id: r.id, area: null, name: r.name, list: S.devices.filter(d => d.room === r.id) }]);
  $('#room-strip').innerHTML = cards.map(c => {
    const r = { id: c.id, name: c.name }, list = c.list;
    const on = list.filter(d => d.state?.on && d.online !== false);
    const ac = list.find(d => d.type === 'ac');
    const w = list.reduce((a, d) => a + (d.state?.on && d.state.power ? d.state.power : 0), 0);
    const sel = S.selectedRoom === c.id && (S.selectedArea || null) === c.area;
    // pílula minimalista: luz (tem algo ligado?), nome, ligados/total e botão de ligar o cômodo
    const tip = [`${on.length} de ${list.length} ligados`, ac?.state?.current != null ? `${fmt(ac.state.current)}°` : '', w ? `${fmt(w, 0)} W` : ''].filter(Boolean).join(' · ');
    return `<button class="room-card rc-pill ${sel ? 'selected' : ''} ${on.length ? 'lit' : ''}" data-room="${c.id}" data-area="${c.area || ''}" title="${esc(r.name)}: ${esc(tip)}">
      <i class="rc-led"></i><span class="rc-name">${esc(r.name)}</span>${list.length ? `<span class="rc-count">${on.length}/${list.length}</span>
      <span class="rc-pwr ${on.length ? 'on' : ''}" data-room-toggle="${c.id}" data-area-toggle="${c.area || ''}" role="button" aria-label="${on.length ? 'Desligar' : 'Ligar'} ${esc(r.name)}">${I('power')}</span>` : ''}
    </button>`;
  }).join('');
  for (const el of document.querySelectorAll('#room-strip [data-room]')) el.onclick = e => {
    const t = e.target.closest('[data-room-toggle]');
    if (t) { e.stopPropagation(); const v = !t.classList.contains('on'); if (t.dataset.areaToggle) api.runAction({ target: { type: 'area', id: t.dataset.areaToggle }, command: { action: 'power', value: v } }); else roomPower(t.dataset.roomToggle, v); return; }
    selectRoom(el.dataset.room, el.dataset.area || null);
  };
}
function selectRoom(id, area) {
  S.selectedRoom = id; S.selectedArea = area || null; house.selectRoom(id, S.selectedArea); renderRoomStrip();
  openPanel({ type: 'room', id, area: S.selectedArea });
}
async function roomPower(roomId, value) {
  try { await api.runAction({ target: { type: 'room', id: roomId }, command: { action: 'power', value } }); }
  catch (e) { toast(e.message, 'error'); }
}
// ---------- Turbo (Jet) do ar LG ----------
// Na API da LG o Turbo é a ventilação "POWER". Alguns modelos aceitam mesmo sem declarar no perfil: o app tenta e,
// se o ar recusar ou ignorar, desativa o botão daquele aparelho e explica.
const isTurbo = f => /POWER|JET|TURBO/i.test(f || '');
const turboFlag = (id, v) => { try { if (v === undefined) return localStorage.getItem('turbo:' + id); localStorage.setItem('turbo:' + id, v); } catch (_) {} return null; };
function turboAvail(d) { const c = d?.caps || {}; if (c.ir) return false; if (c.turbo) return true; return d?.provider !== 'lg' ? false : turboFlag(d.id) !== 'no'; }
async function toggleTurbo(d) {
  if (!d) return;
  const c = d.caps || {}, s = d.state || {}, on = isTurbo(s.fan);
  if (on) {
    const prev = S.prevFan?.[d.id];
    return cmd(d.id, { action: 'fan', value: prev && !isTurbo(prev) ? prev : (c.fans || []).includes('AUTO') ? 'AUTO' : (c.fans || ['AUTO'])[0] });
  }
  S.prevFan = { ...(S.prevFan || {}), [d.id]: s.fan };
  if (!s.on) await cmd(d.id, { action: 'power', value: true });
  const val = (c.fans || []).find(isTurbo) || 'POWER';
  if (S.settings?.sound !== false) sound.beep(1);
  try { await api.command(d.id, { action: 'fan', value: val }); }
  catch (e) {
    if (!c.turbo) { turboFlag(d.id, 'no'); toast('Este ar LG não aceita o Turbo pela API da LG, só pelo controle remoto. O botão foi desativado.', 'error'); if (S.panel) openPanel(S.panel); }
    else toast(cleanErr(e), 'error');
    return;
  }
  if (!c.turbo && turboFlag(d.id) !== 'yes') { // confere se o ar entrou mesmo em Turbo
    toast('Ativando o Turbo…');
    setTimeout(() => {
      const d2 = dev(d.id); if (!d2) return;
      if (isTurbo(d2.state?.fan)) { turboFlag(d.id, 'yes'); toast('Turbo ativado'); }
      else { turboFlag(d.id, 'no'); toast('O ar recebeu o comando, mas não entrou em Turbo: este modelo não libera o Turbo pela API da LG.', 'error'); if (S.panel) openPanel(S.panel); }
    }, 7000);
  }
}
async function cmd(id, command) {
  try {
    if (S.settings?.sound !== false) {
      const d = dev(id), a = command.action;
      if (d?.type === 'ac') sound.beep(a === 'power' && command.value ? 2 : 1);
      else if (a === 'power' || a === 'channel') sound.click(!!command.value);
      else sound.tick();
    }
    await api.command(id, command);
  }
  catch (e) { toast(cleanErr(e), 'error'); }
}
const cleanErr = e => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ------------------------------------------------------------------ PAINEL
let panelCtl = null;
function openPanel(p) {
  if (panelCtl?.dispose) panelCtl.dispose();
  S.panel = p;
  const el = $('#panel');
  el.classList.add('open');
  document.documentElement.classList.add('sheet-open');
  el.innerHTML = '<div class="panel-inner"></div>';
  const root = $('.panel-inner', el);
  if (p.type === 'room') panelCtl = roomPanel(root, p.id, p.area);
  else if (p.type === 'pc') panelCtl = pcPanel(root);
  else { const d = dev(p.id); if (!d) return closePanel(); panelCtl = d.type === 'ac' ? acPanel(root, d) : d.type === 'tv' ? tvPanel(root, d) : plugPanel(root, d); if (d.room && S.view === 'home') { S.selectedRoom = d.room; S.selectedArea = d.area || null; house.selectRoom(d.room, S.selectedArea); renderRoomStrip(); } }
  updatePanel();
}
function closePanel() {
  if (panelCtl?.dispose) panelCtl.dispose();
  panelCtl = null; S.panel = null;
  $('#panel').classList.remove('open');
  document.documentElement.classList.remove('sheet-open');
}
// no celular o painel é uma folha: toque fora ou arraste para baixo para fechar
function initSheet() {
  const dim = document.createElement('div'); dim.id = 'sheet-dim'; dim.onclick = closePanel; document.body.appendChild(dim);
  const el = $('#panel'); let y0 = null, dy = 0;
  el.addEventListener('touchstart', e => { const inner = $('.panel-inner', el); y0 = (!inner || inner.scrollTop <= 0) && !e.target.closest('input,select,.rocker,.dpad,.slider-row,.plate,canvas') ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  el.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 4) { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  el.addEventListener('touchend', () => { if (y0 === null) return; el.style.transition = ''; el.style.transform = ''; if (dy > 110) closePanel(); y0 = null; });
}
function updatePanel() { if (panelCtl) panelCtl.update(); }

// ícone colorido do aparelho no topo do painel (como no app Casa da Apple)
// interruptor, lâmpada ou aparelho de várias teclas mostra lâmpada, não tomada
const lightish = d => d.type === 'switch' || d.type === 'light' || (d.state?.channels?.length || 0) > 1 || /interrup|l[aâ]mpad|\bluz\b|lumin|spot|pendente|abajur/i.test(d.name || '');
const devIco = d => (d.type === 'ac' ? 'ac' : d.type === 'tv' ? 'tv' : lightish(d) ? 'light' : 'plug');
const DEV_BADGE = { ac: ['ac', '#007aff', '#3d9bff'], tv: ['tv', '#5e5ce6', '#7d7bf0'], switch: ['light', '#c98500', '#e6a417'], plug: ['plug', '#248a3d', '#36a852'] };
function panelHead(d, sub) {
  const [ic, c, c2] = DEV_BADGE[d.type] || (lightish(d) ? DEV_BADGE.switch : DEV_BADGE.plug);
  return `<div class="p-head">
    <i class="rb-ic p-badge" style="--c:${c};--c2:${c2}" aria-hidden="true">${I(ic)}</i>
    <div class="p-title"><div class="t"><span class="nm">${esc(d.name)}</span><button class="icon-btn" style="width:30px;height:30px;border-radius:10px" data-rename title="Renomear">${I('edit')}</button></div>
    <div class="s">${esc(sub)}</div></div>
    <div class="p-actions"><button class="icon-btn" data-close title="Fechar">${I('close')}</button></div></div>`;
}
function wireHead(root, d) {
  $('[data-close]', root).onclick = closePanel;
  $('[data-rename]', root).onclick = () => {
    const t = $('.p-title .t', root);
    t.innerHTML = `<input value="${esc(d.name)}">`;
    const inp = $('input', t); inp.focus(); inp.select();
    const done = async () => { await api.rename(d.id, inp.value.trim() || d.name); openPanel(S.panel); };
    inp.onkeydown = e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') openPanel(S.panel); };
    inp.onblur = done;
  };
}

function popMenu(anchor, options, current, onPick) {
  const root = $('#pop-root'); root.innerHTML = '';
  const pop = document.createElement('div'); pop.className = 'pop';
  pop.innerHTML = options.map(o => `<button data-v="${esc(o.value)}" class="${o.value === current ? 'sel' : ''}">${o.icon ? I(o.icon) : ''}${esc(o.label)}${I('check', 'ck')}</button>`).join('');
  root.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const ph = pop.offsetHeight;
  pop.style.left = Math.min(r.left, innerWidth - pop.offsetWidth - 10) + 'px';
  pop.style.top = (r.bottom + 6 + ph > innerHeight ? r.top - ph - 6 : r.bottom + 6) + 'px';
  pop.onclick = e => { const b = e.target.closest('button'); if (!b) return; const o = options.find(o => String(o.value) === b.dataset.v); root.innerHTML = ''; onPick(o.value); };
  setTimeout(() => document.addEventListener('pointerdown', function h(e) { if (!pop.contains(e.target)) { root.innerHTML = ''; document.removeEventListener('pointerdown', h); } }), 0);
}

// ---------- painel do ar-condicionado
function acPanel(root, d0) {
  const c = d0.caps || {};
  root.innerHTML = `${panelHead(d0, `${roomName(d0.room)} · Ar-condicionado${d0.model ? ' · ' + d0.model : ''}`)}
  <div class="card ac-card">
    <div class="ac-top"><div class="ac-room">${I('thermo')}Ambiente <b data-cur>--</b></div><button class="pwr" data-pwr title="Liga/desliga">${I('power')}</button></div>
    <canvas class="ac-canvas" data-ac3d></canvas>
    <div class="ac-mid"><div class="big-temp" data-big>--<sup>°C</sup></div>
      <div class="pills">
        ${c.ir ? '' : `<button class="pill-toggle turbo" data-turbo ${turboAvail(d0) ? (c.turbo ? '' : 'title="Seu modelo não declara o Turbo na API da LG. O app vai tentar mesmo assim."') : 'disabled title="Este modelo não aceita o Turbo (Jet) pela API da LG, só pelo controle remoto."'}>${I('bolt')}Turbo <span class="toggle"></span></button>`}
        ${c.eco ? `<button class="pill-toggle" data-eco>${I('leaf')}Eco <span class="toggle"></span></button>` : ''}
      </div></div>
    <div class="slider-row"><button class="round-btn" data-minus>${I('minus')}</button>
      <div class="track" data-track><div class="fill"></div><div class="thumb"></div></div>
      <button class="round-btn" data-plus>${I('plus')}</button></div>
    <div class="range-labels"><span>${c.tempMin}°</span><span>${c.tempMax}°</span></div>
    <div class="tiles">
      <button class="tile" data-tile="mode">${I('snow')}${I('chevron', 'chev')}<span class="tl">Modo</span><span class="tv">--</span></button>
      <button class="tile" data-tile="fan" ${c.fans?.length ? '' : 'disabled'}>${I('fan')}${I('chevron', 'chev')}<span class="tl">Ventilação</span><span class="tv">--</span></button>
      <button class="tile" data-tile="sleep" ${c.sleep ? '' : 'disabled'}>${I('moon')}<i class="dot"></i><span class="tl">Sono</span><span class="tv">--</span></button>
      <button class="tile" data-tile="air" ${c.swingV || c.swingH ? '' : 'disabled'}>${I('wind')}${I('chevron', 'chev')}<span class="tl">Direção</span><span class="tv">--</span></button>
    </div>
  </div>
  <div class="card sec"><h4>${I('bolt')} Consumo estimado</h4>
    <div class="row"><span class="lbl">Potência da etiqueta</span><span class="est-w"><input type="number" min="0" max="6000" step="10" data-estw placeholder="ex.: 1100"><small>W</small></span></div>
    <div class="chips est-btu" data-estbtu>${[[9000, 820], [12000, 1100], [18000, 1650], [24000, 2200]].map(([b, w]) => `<button data-w="${w}">${fmt(b / 1000, 0)} mil BTUs</button>`).join('')}</div>
    <div class="row"><span class="lbl">Inverter</span><span class="toggle" data-estinv role="switch" aria-label="Ar inverter"></span></div>
    <div class="mini-info" data-estinfo></div>
  </div>
  <div class="card sec"><h4>Timers</h4>
    <div class="row"><span class="lbl">Desligar em</span><select data-timeroff ${c.timer ? '' : 'disabled'}>${TIMES.map(m => `<option value="${m}">${timeName(m)}</option>`).join('')}</select></div>
    <div class="row"><span class="lbl">Ligar em</span><select data-timeron ${c.timer ? '' : 'disabled'}>${TIMES.map(m => `<option value="${m}">${timeName(m)}</option>`).join('')}</select></div>
  </div>
  <div class="card sec"><h4>Mais opções</h4>
    ${c.display?.length ? `<div class="row"><span class="lbl">Luz do display</span><span class="toggle" data-display></span></div>` : ''}
    ${(c.windFlags || []).map(k => `<div class="row"><span class="lbl">${FLAGS[k] || pretty(k)}</span><span class="toggle" data-flag="${k}"></span></div>`).join('')}
    ${c.airClean?.length ? `<div class="row"><span class="lbl">Purificação</span><span class="toggle" data-airclean></span></div>` : ''}
    <div class="mini-info" data-info></div>
  </div>
  <div class="card sec"><h4>Avançado (todas as funções do aparelho)</h4>${c.raw?.length ? '<div data-raw></div>' : ''}
    <div class="row"><span class="lbl" style="color:var(--tx2);font-size:12.5px">Algo faltando? Copie o perfil e me envie.</span><button class="btn sm" data-copy-prof>Copiar perfil</button></div></div>`;
  wireHead(root, d0);
  const ac = new AC3D($('[data-ac3d]', root));
  const q = s => $(s, root);
  let dragT = null, pendingT = null, tTimer;

  const sendTemp = v => { pendingT = v; clearTimeout(tTimer); tTimer = setTimeout(async () => { await cmd(d0.id, { action: 'temp', value: v }); setTimeout(() => (pendingT = null), 3000); }, 450); };
  const setTempUI = (v, d) => {
    const pct = (v - c.tempMin) / (c.tempMax - c.tempMin);
    const tr = q('[data-track]'), w = tr.clientWidth;
    q('.thumb', tr).style.left = (18 + pct * (w - 36)) + 'px';
    q('.fill', tr).style.width = Math.max(30, 3 + pct * (w - 36) + 15) + 'px';
    tr.className = 'track ' + (d.state.on ? (d.state.mode === 'HEAT' ? 'heat' : 'cool') : '');
    q('[data-big]').innerHTML = `${fmt(v)}<sup>°C</sup>`;
  };
  const track = q('[data-track]');
  const fromX = x => { const r = track.getBoundingClientRect(); const pct = Math.min(1, Math.max(0, (x - r.left - 18) / (r.width - 36))); return Math.round((c.tempMin + pct * (c.tempMax - c.tempMin)) / c.tempStep) * c.tempStep; };
  track.onpointerdown = e => { track.setPointerCapture(e.pointerId); dragT = fromX(e.clientX); setTempUI(dragT, dev(d0.id)); };
  track.onpointermove = e => { if (dragT === null) return; dragT = fromX(e.clientX); setTempUI(dragT, dev(d0.id)); };
  track.onpointerup = () => { if (dragT === null) return; sendTemp(dragT); dragT = null; };
  const step = s => { const d = dev(d0.id); const cur = pendingT ?? d.state.target ?? 23; const v = Math.min(c.tempMax, Math.max(c.tempMin, cur + s * c.tempStep)); setTempUI(v, d); sendTemp(v); ac.set({ target: v }); };
  q('[data-minus]').onclick = () => step(-1);
  q('[data-plus]').onclick = () => step(1);
  q('[data-pwr]').onclick = () => cmd(d0.id, { action: 'power', value: !dev(d0.id).state.on });
  if (c.eco) q('[data-eco]').onclick = () => cmd(d0.id, { action: 'eco', value: !dev(d0.id).state.eco });
  if (q('[data-turbo]')) q('[data-turbo]').onclick = () => toggleTurbo(dev(d0.id));
  q('[data-tile=mode]').onclick = e => popMenu(e.currentTarget, c.modes.map(m => ({ value: m, label: modeName(m), icon: MODE[m]?.[1] })), dev(d0.id).state.mode, v => cmd(d0.id, { action: 'mode', value: v }));
  q('[data-tile=fan]').onclick = e => popMenu(e.currentTarget, c.fans.map(f => ({ value: f, label: fanName(f), icon: 'fan' })), dev(d0.id).state.fan, v => cmd(d0.id, { action: 'fan', value: v }));
  q('[data-tile=sleep]').onclick = e => popMenu(e.currentTarget, [0, 60, 120, 180, 240, 360, 480].map(m => ({ value: m, label: timeName(m), icon: 'moon' })), Math.round(dev(d0.id).state.sleepMin / 60) * 60, v => cmd(d0.id, { action: 'sleep', value: v }));
  q('[data-tile=air]').onclick = e => {
    const s = dev(d0.id).state, cur = s.swingV && s.swingH ? 'both' : s.swingV ? 'v' : s.swingH ? 'h' : 'fixed';
    const opts = [{ value: 'fixed', label: 'Fixa', icon: 'target' }];
    if (c.swingV) opts.push({ value: 'v', label: 'Vertical', icon: 'swing' });
    if (c.swingH) opts.push({ value: 'h', label: 'Horizontal', icon: 'swingH' });
    if (c.swingV && c.swingH) opts.push({ value: 'both', label: 'Vertical + horizontal', icon: 'wind' });
    popMenu(e.currentTarget, opts, cur, async v => {
      if (c.swingV) await cmd(d0.id, { action: 'swingV', value: v === 'v' || v === 'both' });
      if (c.swingH) await cmd(d0.id, { action: 'swingH', value: v === 'h' || v === 'both' });
    });
  };
  if (c.timer) {
    q('[data-timeroff]').onchange = e => cmd(d0.id, { action: 'timerOff', value: +e.target.value });
    q('[data-timeron]').onchange = e => cmd(d0.id, { action: 'timerOn', value: +e.target.value });
  }
  if (c.display?.length) q('[data-display]').onclick = () => { const s = dev(d0.id).state; cmd(d0.id, { action: 'display', value: s.display === 'ON' ? (c.display.find(x => x !== 'ON') || 'OFF') : 'ON' }); };
  for (const t of root.querySelectorAll('[data-flag]')) t.onclick = () => cmd(d0.id, { action: 'windFlag', key: t.dataset.flag, value: !dev(d0.id).state.flags?.[t.dataset.flag] });
  if (c.airClean?.length) q('[data-airclean]').onclick = () => { const s = dev(d0.id).state; cmd(d0.id, { action: 'airClean', value: s.airClean === 'START' ? 'STOP' : 'START' }); };
  if (c.raw?.length) renderRaw(q('[data-raw]'), d0);
  q('[data-copy-prof]').onclick = async () => { const p = await api.deviceProfile(d0.id); await navigator.clipboard.writeText(JSON.stringify(p, null, 2)); toast('Perfil copiado'); };
  // consumo estimado: potência da etiqueta (ou pelos BTUs) + inverter; o app calcula pelo modo e pela diferença de temperatura
  const estCfg = () => (S.acPower || {})[d0.id] || { w: 0, inverter: true };
  const saveEst = async patch => { const list = { ...(S.acPower || {}), [d0.id]: { ...estCfg(), ...patch } }; S.acPower = list; const all = await api.save('acPower', list); if (all?.acPower) S.acPower = all.acPower; estHist = null; paintEst(); };
  q('[data-estw]').value = estCfg().w || '';
  q('[data-estw]').onchange = e => { saveEst({ w: Math.max(0, Math.min(6000, Math.round(+e.target.value || 0))) }); toast('Potência salva'); };
  q('[data-estbtu]').onclick = e => { const b = e.target.closest('[data-w]'); if (!b) return; q('[data-estw]').value = b.dataset.w; saveEst({ w: +b.dataset.w }); toast('Potência salva'); };
  q('[data-estinv]').onclick = () => saveEst({ inverter: estCfg().inverter === false });
  let estHist = null, estT = 0;
  const paintEst = async () => {
    const cfg = estCfg(), d = dev(d0.id);
    q('[data-estinv]').classList.toggle('on', cfg.inverter !== false);
    for (const b of q('[data-estbtu]').children) b.classList.toggle('on', +b.dataset.w === +cfg.w);
    const info = q('[data-estinfo]');
    if (!cfg.w) { info.innerHTML = '<div class="est-note">Informe a potência que está na etiqueta do ar (em watts) ou escolha os BTUs. O app estima o consumo pelo tempo ligado, pelo modo e pela diferença de temperatura.</div>'; return; }
    if (!estHist || Date.now() - estT > 60000) { estT = Date.now(); estHist = await api.getEnergy(d0.id); }
    const k = kwh24(estHist || []), tariff = S.settings.tariff ?? 0.85, now = d?.state?.powerEst ? d.state.power : 0;
    info.innerHTML = `<div class="est-out"><div><small>Agora</small><b>~${fmt(now, 0)} W</b></div><div><small>Últimas 24 h</small><b>~${fmt(k, 2)} kWh</b></div><div><small>Projeção do mês</small><b>~R$ ${fmt(k * tariff * 30, 0)}</b></div></div><div class="est-note">Estimativa, não medição. Aparece também na aba Energia.</div>`;
  };
  paintEst();
  foldSections(root, () => paintEst()); // seções do ar recolhidas: fica só o controle principal

  return {
    update() {
      const d = dev(d0.id); if (!d) return;
      const s = d.state;
      q('[data-cur]').textContent = s.current != null ? `${fmt(s.current)}°` : '--';
      paintEst();
      q('[data-pwr]').classList.toggle('on', !!s.on);
      q('[data-big]').classList.toggle('off', !s.on);
      q('.ac-card').className = 'card ac-card' + (s.on ? (s.mode === 'HEAT' ? ' on heat' : ' on cool') : '');
      if (dragT === null) setTempUI(pendingT ?? s.target ?? c.tempMin, d);
      if (c.eco) q('[data-eco] .toggle').classList.toggle('on', !!s.eco);
      if (q('[data-turbo]')) q('[data-turbo] .toggle').classList.toggle('on', /POWER|JET|TURBO/i.test(s.fan || ''));
      const tm = q('[data-tile=mode]'); tm.querySelector('.tv').textContent = modeName(s.mode); tm.querySelector('.ic').outerHTML = I(MODE[s.mode]?.[1] || 'snow'); tm.classList.toggle('active', !!s.on);
      q('[data-tile=fan] .tv').textContent = fanName(s.fan);
      const sl = q('[data-tile=sleep]'); sl.querySelector('.tv').textContent = s.sleepMin ? timeName(Math.round(s.sleepMin)) : 'Desligado'; sl.classList.toggle('active', !!s.sleepMin);
      const air = q('[data-tile=air]'); air.querySelector('.tv').textContent = s.swingV && s.swingH ? 'V + H' : s.swingV ? 'Vertical' : s.swingH ? 'Horizontal' : 'Fixa'; air.classList.toggle('active', s.swingV || s.swingH);
      if (c.timer) {
        setSel(q('[data-timeroff]'), s.timerOffMin); setSel(q('[data-timeron]'), s.timerOnMin);
      }
      if (c.display?.length) q('[data-display]').classList.toggle('on', s.display === 'ON');
      for (const t of root.querySelectorAll('[data-flag]')) t.classList.toggle('on', !!s.flags?.[t.dataset.flag]);
      if (c.airClean?.length) q('[data-airclean]').classList.toggle('on', s.airClean === 'START');
      q('[data-info]').innerHTML = [s.humidity != null ? `Umidade <b>${fmt(s.humidity, 0)}%</b>` : '', s.filter != null ? `Filtro <b>${fmt(s.filter, 0)}%</b>` : '', d.online === false ? '<b style="color:#ff8a8a">Offline</b>' : `Conexão <b>${c.ir ? 'infravermelho · estado estimado' : d.provider === 'demo' ? 'demo' : 'nuvem LG'}</b>`].filter(Boolean).join('');
      ac.set({ on: s.on, target: pendingT ?? s.target, mode: s.mode, swingV: s.swingV, display: s.display });
      if (c.raw?.length) updateRaw(q('[data-raw]'), d);
    },
    dispose() { ac.dispose(); },
  };
}
function setSel(sel, minutes) {
  const m = Math.round(minutes || 0);
  if (![...sel.options].some(o => +o.value === m)) { const o = document.createElement('option'); o.value = m; o.textContent = timeName(m); sel.appendChild(o); }
  if (document.activeElement !== sel) sel.value = m;
}
function renderRaw(el, d) {
  el.innerHTML = d.caps.raw.map((p, i) => {
    const label = `${pretty(p.prop)} <span style="color:#555;font-size:11px">${p.resource}</span>`;
    if (p.type === 'boolean') return `<div class="row"><span class="lbl">${label}</span><span class="toggle" data-ri="${i}"></span></div>`;
    if (p.type === 'enum' && Array.isArray(p.values)) return `<div class="row"><span class="lbl">${label}</span><select data-ri="${i}">${p.values.map(v => `<option value="${esc(v)}">${esc(pretty(v))}</option>`).join('')}</select></div>`;
    if (p.type === 'range' || p.type === 'number') { const v = p.values || {}; return `<div class="row"><span class="lbl">${label}</span><input type="number" data-ri="${i}" min="${v.min ?? ''}" max="${v.max ?? ''}" step="${v.step ?? 1}" style="width:90px"></div>`; }
    return '';
  }).join('');
  for (const ctl of el.querySelectorAll('[data-ri]')) {
    const p = d.caps.raw[+ctl.dataset.ri];
    const send = value => cmd(d.id, { action: 'raw', resource: p.resource, prop: p.prop, value });
    if (ctl.classList.contains('toggle')) ctl.onclick = () => send(!ctl.classList.contains('on'));
    else ctl.onchange = () => send(ctl.type === 'number' ? +ctl.value : ctl.value);
  }
}
function updateRaw(el, d) {
  const raw = d.state.raw || {};
  for (const ctl of el.querySelectorAll('[data-ri]')) {
    const p = d.caps.raw[+ctl.dataset.ri];
    let r = raw[p.resource]; if (Array.isArray(r)) r = r.find(x => x.unit === 'C') || r[0];
    const v = r?.[p.prop]; if (v === undefined || document.activeElement === ctl) continue;
    if (ctl.classList.contains('toggle')) ctl.classList.toggle('on', !!v); else ctl.value = v;
  }
}

// luminárias ligadas a este aparelho (por tecla), com a potência de cada uma para estimar o consumo
function renderLampWatts(box, d0) {
  const lights = S.layout?.lights || [];
  const mine = lights.filter(l => l.link?.dev === d0.id);
  const keys = d0.state?.channels?.length > 1 ? d0.state.channels : [{ code: null, name: d0.name }];
  if (!mine.length) { box.innerHTML = `<div class="mini-info" style="display:block">Nenhuma luminária ligada a este ${d0.type === 'switch' ? 'interruptor' : 'aparelho'}. Coloque as lâmpadas na <b>Planta</b>, aba Luzes, e escolha a tecla de cada uma. Depois informe a potência aqui.</div>`; return; }
  box.innerHTML = keys.map((k, i) => { const ls = mine.filter(l => keys.length > 1 ? l.link.ch === k.code : true); if (!ls.length) return '';
    return `<div class="lw-key"><div class="lw-kname">${esc(k.name || `Tecla ${i + 1}`)}</div>${ls.map(l => { const lb = lampLabel(l);
      return `<div class="row"><span class="lbl">${esc(lb.name)}<small> · ${esc(lb.place)}</small></span><span class="lw-row"><input type="number" min="0" max="2000" step="1" data-lid="${l.id}" value="${l.watts || ''}" placeholder="${LAMP_TYPICAL[l.type] || 9}"><small>W</small></span></div>`; }).join('')}</div>`; }).join('')
    + `<div class="mini-info" style="display:block">Quanto cada luminária gasta acesa (veja na lâmpada ou na caixa). O cinza é o valor típico de LED. O consumo aparece na aba Energia.</div>`;
  for (const inp of box.querySelectorAll('[data-lid]')) inp.onchange = async () => {
    if (planDirty) { toast('Termine de salvar a planta e tente de novo', 'error'); return; }
    const L = S.layout, l = L.lights.find(x => x.id === inp.dataset.lid); if (!l) return;
    const w = Math.max(0, Math.min(2000, Math.round(+inp.value || 0))); if (w) l.watts = w; else delete l.watts;
    const all = await api.save('layout', L); if (all?.layout) S.layout = all.layout;
    if (editor) editor.load(S.layout, S.placements, S.devices);
    toast(w ? `${w} W salvo` : 'Potência removida');
  };
}
// clima da casa 3D: o tempo real ou um escolhido no botão do clima
const WX = [[null, 'Tempo real', 'auto'], [0, 'Céu limpo', 'sun'], [3, 'Nublado', 'cloud'], [45, 'Neblina', 'cloud'], [53, 'Garoa', 'drop'], [63, 'Chuva', 'drop'], [95, 'Tempestade', 'bolt'], [73, 'Neve', 'snow']];
let wxOverride = null; try { const v = localStorage.getItem('weatherOverride'); wxOverride = v === null || v === '' ? null : +v; if (!WX.some(x => x[0] === wxOverride)) wxOverride = null; } catch (_) {}
function applyWeather() {
  if (!house) return;
  house.setWeather(wxOverride == null ? (S.weather || null) : { temp: 22, wind: 10, ...(S.weather || {}), code: wxOverride });
  document.dispatchEvent(new Event('weatherpaint'));
}
// estilos do espelho na parede (interruptor/tomada): escolha em pílulas com a cor de cada acabamento
function plateStyleChips(d, cur) {
  cur = cur || defaultStyle(d);
  return `<div class="ps-styles" data-pstyles>${stylesFor(d).map(st => `<button data-v="${st.id}" class="${st.id === cur ? 'on' : ''}" title="${esc(st.desc)}"><i style="--sw:${st.sw};--dot:${st.dot}"></i><span>${esc(st.name)}</span></button>`).join('')}</div>`;
}
async function setPlateStyle(id, style) {
  const p = S.placements?.[id]; if (!p) return;
  p.style = style; if (editor?.placements?.[id]) editor.placements[id].style = style;
  const all = await api.save('placements', S.placements); if (all?.placements) S.placements = all.placements;
  if (S.view === 'home') house.setLayout(S.layout, S.placements, S.devices);
}
// seções do painel recolhidas: fica só o principal (as teclas); cada uma abre com um toque e o app lembra
function foldSections(root, onOpen) {
  for (const sec of root.querySelectorAll('.card.sec:not([data-keep])')) {
    const h = sec.querySelector(':scope > h4'); if (!h) continue;
    const key = 'fold:' + h.textContent.trim();
    let open = false; try { open = localStorage.getItem(key) === '1'; } catch (_) {}
    sec.classList.add('fold'); sec.classList.toggle('open', open);
    h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', open);
    h.insertAdjacentHTML('beforeend', `<span class="fold-ch">${I('chevron')}</span>`);
    const toggle = () => {
      open = !sec.classList.contains('open'); sec.classList.toggle('open', open); h.setAttribute('aria-expanded', open);
      try { localStorage.setItem(key, open ? '1' : '0'); } catch (_) {}
      if (open) { onOpen?.(); sec.animate?.([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' }); }
    };
    h.onclick = toggle; h.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  }
}
// ---------- painel deste computador (consumo estimado pelo uso do processador e da placa de vídeo)
function pcPanel(root) {
  const conf = () => S.pcConf || {};
  const L0 = S.pcLoad || {};
  root.innerHTML = `<div class="p-head">
    <i class="rb-ic p-badge" style="--c:#3a3a3c;--c2:#636366" aria-hidden="true">${I('display')}</i>
    <div class="p-title"><div class="t"><span class="nm">Este computador</span></div><div class="s" data-pcsub>${esc(L0.name || '')} · consumo estimado</div></div>
    <div class="p-actions"><button class="icon-btn" data-close title="Fechar">${I('close')}</button></div></div>
  <div class="card pc-hero">
    <div class="pc-now"><b data-pcw>--</b><small>W agora</small></div>
    <div class="pc-bars">
      <div class="pc-bar"><span>Processador</span><div class="bar"><i data-pccpu></i></div><em data-pccpuv>--</em></div>
      <div class="pc-bar"><span>Placa de vídeo</span><div class="bar"><i data-pcgpu></i></div><em data-pcgpuv>--</em></div>
    </div>
    <div class="pc-parts" data-pcparts></div>
  </div>
  <div class="card sec"><h4>Últimas 24 h</h4><canvas class="chart" data-pcchart></canvas><div class="mini-info" data-pc24></div></div>
  <div class="card sec"><h4>Ajustes da estimativa</h4>
    <div class="row"><span class="lbl">Tipo</span><div class="seg" data-pckind>${[['auto', 'Automático'], ['desktop', 'Desktop'], ['notebook', 'Notebook']].map(([v, n]) => `<button data-v="${v}">${n}</button>`).join('')}</div></div>
    <div class="row"><span class="lbl">Monitores</span><input type="number" min="0" max="8" step="1" data-pck="monitors" placeholder="auto" style="width:80px"></div>
    <div class="row"><span class="lbl">Watts por monitor</span><input type="number" min="0" max="300" step="1" data-pck="monitorW" placeholder="25" style="width:80px"></div>
    <div class="row"><span class="lbl">Processador (W máx.)</span><input type="number" min="5" max="400" step="1" data-pck="cpuTdp" style="width:80px"></div>
    <div class="row"><span class="lbl">Placa de vídeo (W máx.)</span><input type="number" min="5" max="700" step="1" data-pck="gpuTdp" style="width:80px"></div>
    <div class="row"><span class="lbl">Monitorar este computador</span><span class="toggle" data-pcon role="switch" aria-label="Monitorar este computador"></span></div>
    <div class="mini-info" data-pcinfo></div>
  </div>`;
  root.querySelector('[data-close]').onclick = closePanel;
  const q = x => $(x, root);
  const save = async patch => { const c = { ...conf(), ...patch }; for (const k of Object.keys(c)) if (c[k] === null || c[k] === '') delete c[k]; S.pcConf = c; const all = await api.save('pcConf', c); if (all?.pcConf) S.pcConf = all.pcConf; ctl.update(); };
  q('[data-pckind]').onclick = e => { const b = e.target.closest('[data-v]'); if (b) save({ kind: b.dataset.v === 'auto' ? null : b.dataset.v }); };
  for (const inp of root.querySelectorAll('[data-pck]')) inp.onchange = () => { const v = inp.value === '' ? null : Math.max(0, +inp.value); save({ [inp.dataset.pck]: v }); toast('Ajuste salvo'); };
  q('[data-pcon]').onclick = () => save({ enabled: conf().enabled === false ? null : false });
  let hist = [], histT = 0;
  const ctl = {
    async update() {
      const L = S.pcLoad, c = conf();
      q('[data-pcon]').classList.toggle('on', c.enabled !== false);
      for (const b of q('[data-pckind]').children) b.classList.toggle('on', (c.kind || 'auto') === b.dataset.v);
      for (const inp of root.querySelectorAll('[data-pck]')) if (document.activeElement !== inp) { inp.value = c[inp.dataset.pck] ?? ''; if (L && (inp.dataset.pck === 'cpuTdp' || inp.dataset.pck === 'gpuTdp')) inp.placeholder = L[inp.dataset.pck]; if (L && inp.dataset.pck === 'monitors') inp.placeholder = `auto (${L.monitorsN})`; }
      if (!L) { q('[data-pcw]').textContent = '--'; q('[data-pcparts]').innerHTML = `<p class="sub" style="margin:0">${c.enabled === false ? 'Monitoramento desligado.' : 'Medindo…'}</p>`; return; }
      q('[data-pcw]').textContent = fmt(L.total, 0);
      const pct = v => Math.round((v || 0) * 100);
      q('[data-pccpu]').style.width = pct(L.cpuLoad) + '%'; q('[data-pccpuv]').textContent = pct(L.cpuLoad) + '%';
      q('[data-pcgpu]').style.width = pct(L.gpuLoad) + '%'; q('[data-pcgpuv]').textContent = pct(L.gpuLoad) + '%';
      const part = (n, w, sub) => `<div class="pc-part"><span>${n}${sub ? `<small>${esc(sub)}</small>` : ''}</span><b>${fmt(w, 0)} W</b></div>`;
      q('[data-pcparts]').innerHTML = L.real ? part('Medido na bateria', L.total - L.monitors, 'notebook fora da tomada: valor real') + (L.monitors ? part('Monitores externos', L.monitors, '') : '')
        : part('Processador', L.cpu, L.cpuName) + part('Placa de vídeo', L.gpu, (L.gpuName || '') + (L.gpuReal ? ' · medido pela NVIDIA' : '')) + part(L.laptop ? 'Notebook (tela, placa, memória)' : 'Placa-mãe, memória, discos', L.base, '') + part('Monitores', L.monitors, L.monitorsOff ? 'em descanso' : `${L.monitorsN} × ${L.monitorW} W`);
      if (Date.now() - histT > 60000) { histT = Date.now(); hist = await api.getEnergy('pc'); }
      const h = hist.filter(p => p[0] > Date.now() - 864e5); drawLine(q('[data-pcchart]'), h, '#64d2ff', 'W');
      const k = kwh24(hist), tariff = S.settings.tariff ?? 0.85;
      q('[data-pc24]').innerHTML = `<b>~${fmt(k, 2)} kWh</b> em 24 h · R$ ${fmt(k * tariff, 2)} · mês <b>~R$ ${fmt(k * tariff * 30, 0)}</b>`;
      q('[data-pcinfo]').innerHTML = `Detectado: <b>${L.laptop ? 'notebook' : 'desktop'}</b>, ${esc(L.cpuName || 'processador')}${L.gpuName ? `, ${esc(L.gpuName)}` : ''}. É uma estimativa pelo uso das peças; deixe um campo vazio para usar o valor automático. Só conta enquanto o SmartHouse está aberto (ou na bandeja).`;
    },
  };
  foldSections(root, () => { histT = 0; ctl.update(); });
  return ctl;
}
// ---------- painel da tomada
function plugPanel(root, d0) {
  const c = d0.caps || {};
  root.innerHTML = `${panelHead(d0, `${roomName(d0.room)} · ${d0.type === 'light' ? 'Lâmpada' : d0.type === 'switch' ? 'Interruptor' : 'Tomada inteligente'}${d0.model ? ' · ' + d0.model : ''}`)}
  <div class="card plug-hero">
    ${c.channels > 1 || (d0.type === 'switch' && d0.state?.channels?.length) ? `<div class="plate" data-plate style="--n:${c.channels || 1}"></div>
      <div class="chips" style="justify-content:center;margin-top:18px"><button data-all="1">${I('power')} Ligar todas</button><button data-all="0">Desligar todas</button></div>` : `<button class="plug-btn" data-pwr>${I(d0.type === 'light' ? 'light' : 'power')}</button>`}
    <div class="plug-state" data-st>--</div>
    ${c.metering ? `<div class="plug-watts" data-w>--<small> W</small></div>` : ''}
  </div>
  ${c.metering ? `<div class="stats">
    <div class="stat"><div class="k">Tensão</div><div class="v" data-v>--</div></div>
    <div class="stat"><div class="k">Corrente</div><div class="v" data-a>--</div></div>
    <div class="stat"><div class="k">Consumo acumulado</div><div class="v" data-kwh>--</div></div>
    <div class="stat"><div class="k">Custo estimado</div><div class="v" data-cost>--</div></div></div>
  <div class="card sec"><h4>Potência nas últimas 24 h</h4><canvas class="chart" data-chart></canvas></div>` : ''}
  ${c.channels > 1 ? `<div class="card sec"><h4>Nomes das teclas</h4><div data-ch-names></div></div>` : ''}
  ${LINKABLE(d0) ? `<div class="card sec"><h4>${c.channels > 1 ? 'Teclas ligadas a outros interruptores' : 'Ligar junto com outro interruptor'}</h4><div data-links></div></div>` : ''}
  ${c.brightness ? `<div class="card sec" data-keep><h4>Brilho</h4><input type="range" min="1" max="100" data-bri style="width:100%"></div>` : ''}
  ${c.countdown ? `<div class="card sec"><h4>${I('timer')} Desligar automaticamente em</h4><div class="chips" data-cd>
    ${[[0, 'Cancelar'], [900, '15 min'], [1800, '30 min'], [3600, '1 h'], [7200, '2 h'], [14400, '4 h'], [28800, '8 h']].map(([s, l]) => `<button data-s="${s}">${l}</button>`).join('')}</div>
    <div class="mini-info" data-cdinfo></div></div>` : ''}
  ${LINKABLE(d0) ? `<div class="card sec"><h4>Lâmpadas e consumo</h4><div data-lampw></div></div>` : ''}
  ${S.placements?.[d0.id] ? `<div class="card sec"><h4>Estilo na parede</h4><div class="ps-wrap">${plateStyleChips(d0, S.placements[d0.id].style)}</div></div>` : ''}
  <div class="card sec"><h4>Configurações</h4>
    ${c.relayStatus ? `<div class="row"><span class="lbl">Quando a energia voltar</span><select data-relay><option value="power_off">Ficar desligada</option><option value="power_on">Ligar</option><option value="last">Último estado</option></select></div>` : ''}
    ${c.childLock ? `<div class="row"><span class="lbl">Trava infantil (botão físico)</span><span class="toggle" data-lock></span></div>` : ''}
    <div class="mini-info" data-info></div>
  </div>`;
  wireHead(root, d0);
  const q = s => $(s, root);
  if (q('[data-pwr]')) q('[data-pwr]').onclick = () => cmd(d0.id, { action: 'power', value: !dev(d0.id).state.on });
  for (const b of root.querySelectorAll('[data-all]')) b.onclick = () => cmd(d0.id, { action: 'power', value: b.dataset.all === '1' });
  if (q('[data-plate]')) q('[data-plate]').onclick = e => {
    const half = e.target.closest('[data-set]'); if (!half) return;
    const rk = half.closest('.rocker'); const on = half.dataset.set === 'toggle' ? !rk.classList.contains('on') : half.dataset.set === '1';
    if (rk.classList.contains('on') !== on) { rk.classList.remove('clack'); void rk.offsetWidth; rk.classList.add('clack'); }
    rk.classList.toggle('on', on); rk._pend = { on, t: Date.now() }; // resposta imediata
    navigator.vibrate?.(8);
    cmd(d0.id, { action: 'channel', code: rk.dataset.code, value: on });
  };
  if (c.channels > 1) {
    const box = q('[data-ch-names]');
    box.innerHTML = (d0.state.channels || []).map((ch, i) => `<div class="row"><span class="lbl">Tecla ${i + 1}</span><input data-chn="${ch.code}" value="${esc(ch.name || '')}" placeholder="Ex.: Luz do teto" style="width:200px"></div>`).join('');
    for (const inp of box.querySelectorAll('[data-chn]')) inp.onchange = async () => { await api.rename(`${d0.id}#${inp.dataset.chn}`, inp.value.trim()); toast('Nome salvo'); };
  }
  if (q('[data-links]')) renderKeyLinks(q('[data-links]'), d0.id);
  if (q('[data-lampw]')) renderLampWatts(q('[data-lampw]'), d0);
  if (q('[data-pstyles]')) q('[data-pstyles]').onclick = async e => { const b = e.target.closest('[data-v]'); if (!b) return;
    for (const x of q('[data-pstyles]').children) x.classList.toggle('on', x === b); await setPlateStyle(d0.id, b.dataset.v); toast('Estilo trocado'); };
  if (c.countdown) q('[data-cd]').onclick = e => { const b = e.target.closest('button'); if (b) cmd(d0.id, { action: 'countdown', value: +b.dataset.s }); };
  if (c.relayStatus) q('[data-relay]').onchange = e => cmd(d0.id, { action: 'relayStatus', value: e.target.value });
  if (c.childLock) q('[data-lock]').onclick = () => cmd(d0.id, { action: 'childLock', value: !dev(d0.id).state.childLock });
  if (c.brightness) q('[data-bri]').onchange = e => cmd(d0.id, { action: 'brightness', value: +e.target.value });
  let hist = [], lastFetch = 0;
  const tariff = () => S.settings.tariff ?? 0.85;
  const ctl = {
    async update() {
      const d = dev(d0.id); if (!d) return;
      const s = d.state;
      if (q('[data-pwr]')) q('[data-pwr]').classList.toggle('on', !!s.on);
      const plate = q('[data-plate]');
      if (plate) {
        if (plate.children.length !== s.channels.length) {
          plate.innerHTML = s.channels.map((ch, i) => `<div class="rk-col"><div class="rocker" data-code="${ch.code}"><button class="rk-key" data-set="toggle" title="Ligar ou desligar">${I('light')}</button></div>
            <div class="rk-name"></div></div>`).join('');
        }
        s.channels.forEach((ch, i) => {
          const col = plate.children[i], rk = col.querySelector('.rocker');
          // logo depois do toque, mantém a posição escolhida até o aparelho confirmar (evita a tecla "voltar")
          if (rk._pend && Date.now() - rk._pend.t < 2500 && rk._pend.on !== !!ch.on) return;
          rk._pend = null;
          rk.classList.toggle('on', !!ch.on);
          col.querySelector('.rk-name').textContent = ch.name || `Tecla ${i + 1}`;
        });
      }
      const nOn = (s.channels || []).filter(ch => ch.on).length;
      q('[data-st]').textContent = d.online === false ? 'Offline' : c.channels > 1 ? (nOn ? `${nOn} de ${s.channels.length} teclas ligadas` : 'Todas desligadas') : s.on ? 'Ligada' : 'Desligada';
      if (q('[data-w]')) q('[data-w]').innerHTML = `${fmt(s.power ?? 0, 1)}<small> W</small>`;
      if (c.metering) {
        q('[data-v]').innerHTML = `${fmt(s.voltage)}<small>V</small>`;
        q('[data-a]').innerHTML = `${fmt(s.current, 2)}<small>A</small>`;
        q('[data-kwh]').innerHTML = `${fmt(s.energyKwh, 2)}<small>kWh</small>`;
        q('[data-cost]').innerHTML = `<small>R$</small>${fmt((s.energyKwh || 0) * tariff(), 2)}`;
        if (Date.now() - lastFetch > 30000) { lastFetch = Date.now(); hist = await api.getEnergy(d.id); }
        drawLine(q('[data-chart]'), hist.filter(p => p[0] > Date.now() - 864e5), '#ffcc00', 'W');
      }
      if (c.countdown) {
        const cd = s.countdown || 0;
        q('[data-cdinfo]').innerHTML = cd ? `Vai ${s.on ? 'desligar' : 'ligar'} em <b>${Math.floor(cd / 3600) ? Math.floor(cd / 3600) + ' h ' : ''}${Math.round((cd % 3600) / 60)} min</b>` : 'Nenhum timer ativo';
      }
      if (c.relayStatus && document.activeElement !== q('[data-relay]')) q('[data-relay]').value = s.relayStatus;
      if (c.childLock) q('[data-lock]').classList.toggle('on', !!s.childLock);
      if (c.brightness && document.activeElement !== q('[data-bri]')) q('[data-bri]').value = s.brightness;
      q('[data-info]').innerHTML = `Conexão <b>${d.provider === 'demo' ? 'demo' : d.local ? 'local (Wi-Fi)' : d.provider === 'ewelink' ? 'nuvem eWeLink' : 'nuvem Tuya'}</b> · ID <b style="user-select:text">${esc(d.id.slice(0, 14))}</b>`;
    },
  };
  foldSections(root, () => { lastFetch = 0; ctl.update(); });
  return ctl;
}

// ---------- painel da TV / controle infravermelho
const TVK = {
  power: /^power$|^power ?(on|off)?$|power/i, volUp: /vol(ume)?.*(up|\+)/i, volDown: /vol(ume)?.*(down|-)/i, mute: /mute/i,
  chUp: /^ch(annel)?.*(up|\+)/i, chDown: /^ch(annel)?.*(down|-)/i, up: /^(nav|arrow)? ?up$/i, down: /^(nav|arrow)? ?down$/i,
  left: /^(nav|arrow)? ?left$/i, right: /^(nav|arrow)? ?right$/i, ok: /^(ok|enter|confirm|select)$/i,
  back: /back|return|exit/i, home: /home/i, menu: /^menu$/i, input: /input|source|tv ?\/ ?av|^av$/i,
};
function tvPanel(root, d0) {
  const keys = d0.caps?.keys || [];
  const find = re => keys.find(k => re.test(k.key) || re.test(k.key_name || ''));
  const K = Object.fromEntries(Object.entries(TVK).map(([n, re]) => [n, find(re)]));
  const digit = n => keys.find(k => new RegExp(`^(num ?|key ?)?${n}$`, 'i').test(k.key) || new RegExp(`^${n}$`).test(k.key_name || ''));
  const used = new Set([...Object.values(K), ...[...Array(10).keys()].map(digit)].filter(Boolean).map(k => k.key));
  const kb = (name, inner, cls = '') => { const k = K[name]; return `<button class="rk ${cls}" ${k ? `data-key="${esc(k.key)}"` : 'disabled'} title="${esc(k?.key_name || name)}">${inner}</button>`; };
  root.innerHTML = `${panelHead(d0, `${roomName(d0.room)} · Controle infravermelho${d0.model ? ' · ' + d0.model : ''}`)}
  <div class="card remote">
    <div class="rm-top"><div><div class="rm-state" data-st>--</div><div class="rm-note">Estado estimado: o infravermelho não informa se a TV ligou.</div></div>
      <button class="pwr rm-pwr" data-pwr title="Liga/desliga">${I('power')}</button></div>
    <div class="dpad">
      ${kb('up', I('chevron', 'up'), 'd-up')}${kb('left', I('chevron', 'left'), 'd-left')}${kb('ok', 'OK', 'd-ok')}${kb('right', I('chevron', 'right'), 'd-right')}${kb('down', I('chevron'), 'd-down')}
    </div>
    <div class="rm-row">${kb('back', I('back'))}${kb('home', I('home'))}${kb('menu', I('grid'))}${kb('input', I('input'))}</div>
    <div class="rm-rockers">
      <div class="rocker-v">${kb('volUp', I('plus'))}<span>VOL</span>${kb('volDown', I('minus'))}</div>
      ${kb('mute', I('mute'), 'rm-mute')}
      <div class="rocker-v">${kb('chUp', I('chevron', 'up'))}<span>CH</span>${kb('chDown', I('chevron'))}</div>
    </div>
    <div class="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, ''].map(n => n === '' ? '<span></span>' : (k => `<button class="rk" ${k ? `data-key="${esc(k.key)}"` : 'disabled'}>${n}</button>`)(digit(n))).join('')}</div>
  </div>
  ${keys.filter(k => !used.has(k.key)).length ? `<div class="card sec"><h4>Outras teclas</h4><div class="chips">${keys.filter(k => !used.has(k.key)).map(k => `<button data-key="${esc(k.key)}">${esc(k.key_name || k.key)}</button>`).join('')}</div></div>` : ''}
  ${!keys.length ? `<div class="card sec"><p class="sub" style="margin:0">Nenhuma tecla encontrada para este controle.</p></div>` : ''}
  <div class="card sec"><div class="mini-info" data-info></div></div>`;
  wireHead(root, d0);
  const q = s => $(s, root);
  q('[data-pwr]').onclick = () => cmd(d0.id, { action: 'toggle' });
  root.onclick = e => {
    const b = e.target.closest('[data-key]'); if (!b) return;
    b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 180);
    const k = keys.find(x => x.key === b.dataset.key);
    cmd(d0.id, { action: 'key', key: k.key, key_id: k.key_id });
  };
  return {
    update() {
      const d = dev(d0.id); if (!d) return;
      q('[data-pwr]').classList.toggle('on', !!d.state.on);
      q('[data-st]').textContent = d.state.on ? 'Ligada' : 'Desligada';
      q('[data-info]').innerHTML = `Conexão <b>${d.provider === 'demo' ? 'demo' : 'infravermelho via nuvem Tuya'}</b>`;
    },
  };
}

// ---------- painel do cômodo
function roomPanel(root, roomId, areaId) {
  const room = rooms().find(r => r.id === roomId);
  if (!room) { closePanel(); return null; }
  const part = areaId ? room.rects.find(r => r.id === areaId) : null;
  root.innerHTML = `<div class="p-head"><i class="rb-ic p-badge" style="--c:#d97a0a;--c2:#f29a26" aria-hidden="true">${I('home')}</i><div class="p-title"><div class="t">${esc(part ? part.name : room.name)}</div><div class="s" data-rsum>${part
      ? `${fmt(part.w * part.h)} m² · parte de <button class="link-btn" data-whole>${esc(room.name)}</button>`
      : `${room.grouped ? `${room.rects.map(r => esc(r.name)).join(' · ')} — ` : ''}${fmt(room.area)} m²${room.grouped ? '' : ` · ${fmt(room.main.w)} × ${fmt(room.main.h)} m`}`}</div></div>
    <div class="p-actions"><button class="icon-btn" data-close>${I('close')}</button></div></div>
    <div class="rp-all"><span data-rcount></span><div style="display:flex;gap:6px"><button class="btn sm" data-all="1">${I('power')}Ligar tudo</button><button class="btn sm" data-all="0">Desligar tudo</button></div></div>
    <div data-list class="rp-list"></div>`;
  $('[data-close]', root).onclick = () => { closePanel(); S.selectedRoom = null; S.selectedArea = null; house.selectRoom(null); renderRoomStrip(); };
  if ($('[data-whole]', root)) $('[data-whole]', root).onclick = () => selectRoom(roomId, null);
  for (const b of root.querySelectorAll('[data-all]')) b.onclick = () => part ? api.runAction({ target: { type: 'area', id: part.id }, command: { action: 'power', value: b.dataset.all === '1' } }) : roomPower(roomId, b.dataset.all === '1');
  const el = $('[data-list]', root);
  const pending = {}; // temperatura escolhida e ainda não confirmada pelo ar
  let sig = '';
  // ---------- montagem dos cartões (só quando a lista de aparelhos muda) ----------
  const build = list => {
    const card = d => {
      const c = d.caps || {}, chs = d.state?.channels || [];
      const open = `<button class="rp-open" data-open="${d.id}" title="Abrir controle completo">${I('chevronR')}</button>`;
      if (d.type === 'ac') return `<div class="rp-card rp-ac" data-id="${d.id}">
          <div class="rp-head"><div class="rp-ico">${I('ac')}</div><div class="grow"><div class="nm">${esc(d.name)}</div><div class="st" data-st></div></div>
            <button class="pwr sm" data-pwr>${I('power')}</button>${open}</div>
          <div class="rp-temp"><button class="round-btn" data-tminus>${I('minus')}</button><div class="rp-tval" data-tv>--</div><button class="round-btn" data-tplus>${I('plus')}</button></div>
          <div class="rp-chips">
            ${c.modes?.length ? `<button data-mode>${I('snow')}<span>--</span></button>` : ''}
            ${c.fans?.length ? `<button data-fan>${I('fan')}<span>--</span></button>` : ''}
            ${turboAvail(d) ? `<button data-turbo>${I('bolt')}<span>Turbo</span></button>` : ''}
            ${c.eco ? `<button data-eco>${I('leaf')}<span>Eco</span></button>` : ''}
          </div></div>`;
      if (chs.length > 1 || d.type === 'switch' || d.type === 'light' || /interruptor|tecla/i.test(d.name || '')) return `<div class="rp-card rp-sw" data-id="${d.id}">
          <div class="rp-head"><div class="rp-ico">${I('light')}</div><div class="grow"><div class="nm">${esc(d.name)}</div><div class="st" data-st></div></div>${open}</div>
          <div class="plate sm" data-plate style="--n:${Math.max(1, chs.length)}">${(chs.length ? chs : [{ code: null }]).map((ch, i) => `<div class="rk-col"><div class="rocker" data-code="${ch.code || ''}"><button class="rk-key" data-set="toggle" title="Ligar ou desligar">${I('light')}</button></div>
            <div class="rk-name"></div></div>`).join('')}</div></div>`;
      if (d.type === 'tv') return `<div class="rp-card rp-tv" data-id="${d.id}">
          <div class="rp-head"><div class="rp-ico">${I('tv')}</div><div class="grow"><div class="nm">${esc(d.name)}</div><div class="st" data-st></div></div>
            <button class="pwr sm" data-tvpwr>${I('power')}</button>${open}</div>
          <div class="rp-remote">${[['volDown', /vol(ume)?.*(down|-)/i], ['volUp', /vol(ume)?.*(up|\+)/i], ['mute', /mute/i], ['chevron', /^ch(annel)?.*(down|-)/i, ''], ['chevron', /^ch(annel)?.*(up|\+)/i, 'up']].map(([ic, re, cls]) => {
            const k = (c.keys || []).find(k => re.test(k.key) || re.test(k.key_name || ''));
            return `<button class="rk" ${k ? `data-key="${esc(k.key)}" data-kid="${k.key_id ?? ''}"` : 'disabled'}>${I(ic, cls)}</button>`; }).join('')}
            <button class="btn sm" data-open="${d.id}">${I('remote')}Controle</button></div></div>`;
      return `<div class="rp-card rp-plug" data-id="${d.id}">
          <div class="rp-head"><div class="rp-ico">${I(devIco(d))}</div><div class="grow"><div class="nm">${esc(d.name)}</div><div class="st" data-st></div></div>
            <div class="rp-w" data-w></div><span class="toggle" data-tg></span>${open}</div></div>`;
    };
    if (!list.length) { el.innerHTML = `<p style="color:var(--tx3);padding:10px">Nenhum aparelho neste cômodo. Posicione aparelhos no editor de planta.</p>`; return; }
    if (!room.grouped || part) { el.innerHTML = list.map(card).join(''); return; }
    // ambiente unido: cada área com os seus aparelhos e o seu liga/desliga
    const parts = [...room.rects.map(r => [r.id, r.name]), [null, 'Outros']];
    el.innerHTML = parts.map(([aid, nm]) => {
      const sub = list.filter(d => (d.area || null) === aid);
      if (!sub.length && !aid) return '';
      return `<div class="rp-area" data-area="${aid || ''}"><div class="rp-area-h"><span class="nm">${esc(nm)}</span><span class="ct" data-act></span>
        ${sub.length && aid ? `<span class="toggle sm" data-area-tg="${aid}"></span>` : ''}</div>
        ${sub.length ? sub.map(card).join('') : '<p class="rp-empty">Nenhum aparelho nesta área.</p>'}</div>`;
    }).join('');
  };
  // ---------- comandos ----------
  el.onclick = e => {
    const at = e.target.closest('[data-area-tg]');
    if (at) { const on = !at.classList.contains('on'); at.classList.toggle('on', on); api.runAction({ target: { type: 'area', id: at.dataset.areaTg }, command: { action: 'power', value: on } }); if (S.settings?.sound !== false) sound.click(on); return; }
    const card = e.target.closest('[data-id]'), op = e.target.closest('[data-open]');
    if (op) return openPanel({ type: 'device', id: op.dataset.open });
    if (!card) return;
    const d = dev(card.dataset.id); if (!d) return;
    const s = d.state || {}, c = d.caps || {};
    const q = x => e.target.closest(x);
    if (q('[data-pwr]') || q('[data-tg]')) return cmd(d.id, { action: 'power', value: !s.on });
    if (q('[data-tvpwr]')) return cmd(d.id, { action: 'toggle' });
    const kb = q('[data-key]'); if (kb) { kb.classList.add('hit'); setTimeout(() => kb.classList.remove('hit'), 180); return cmd(d.id, { action: 'key', key: kb.dataset.key, key_id: kb.dataset.kid === '' ? undefined : +kb.dataset.kid }); }
    if (q('[data-tminus]') || q('[data-tplus]')) {
      const cur = pending[d.id]?.v ?? s.target ?? 23;
      const v = Math.min(c.tempMax ?? 30, Math.max(c.tempMin ?? 16, cur + (q('[data-tplus]') ? 1 : -1) * (c.tempStep || 1)));
      clearTimeout(pending[d.id]?.t);
      pending[d.id] = { v, t: setTimeout(async () => { await cmd(d.id, { action: 'temp', value: v }); setTimeout(() => { delete pending[d.id]; ctl.update(); }, 2500); }, 450) };
      return ctl.update();
    }
    const mb = q('[data-mode]'); if (mb) return popMenu(mb, c.modes.map(m => ({ value: m, label: modeName(m), icon: MODE[m]?.[1] })), s.mode, v => cmd(d.id, { action: 'mode', value: v }));
    const fb = q('[data-fan]'); if (fb) return popMenu(fb, c.fans.filter(f => !/POWER|JET|TURBO/i.test(f)).map(f => ({ value: f, label: fanName(f), icon: 'fan' })), s.fan, v => cmd(d.id, { action: 'fan', value: v }));
    if (q('[data-turbo]')) return toggleTurbo(d);
    if (q('[data-eco]')) return cmd(d.id, { action: 'eco', value: !s.eco });
    const half = q('[data-set]');
    if (half) {
      const rk = half.closest('.rocker'), on = half.dataset.set === 'toggle' ? !rk.classList.contains('on') : half.dataset.set === '1';
      if (rk.classList.contains('on') !== on) { rk.classList.remove('clack'); void rk.offsetWidth; rk.classList.add('clack'); }
      rk.classList.toggle('on', on); rk._pend = { on, t: Date.now() }; navigator.vibrate?.(8);
      return cmd(d.id, rk.dataset.code ? { action: 'channel', code: rk.dataset.code, value: on } : { action: 'power', value: on });
    }
    if (card.classList.contains('rp-plug') && !q('button')) return cmd(d.id, { action: 'power', value: !s.on });
  };
  // ---------- atualização dos valores ----------
  const ctl = {
    update() {
      const list = S.devices.filter(d => d.room === roomId && (!part || d.area === part.id));
      const ns = list.map(d => `${d.id}:${d.type}:${d.state?.channels?.length || 0}:${d.area || ''}`).join('|');
      if (ns !== sig) { sig = ns; build(list); }
      const nOn = list.filter(d => d.state?.on && d.online !== false).length;
      $('[data-rcount]', root).textContent = list.length ? `${nOn} de ${list.length} ligado${list.length === 1 ? '' : 's'}` : '';
      for (const sec of el.querySelectorAll('.rp-area')) {
        const sub = list.filter(d => (d.area || '') === sec.dataset.area), on = sub.filter(d => d.state?.on && d.online !== false).length;
        const ct = sec.querySelector('[data-act]'); if (ct) ct.textContent = sub.length ? `${on}/${sub.length}` : '';
        sec.querySelector('[data-area-tg]')?.classList.toggle('on', on > 0);
      }
      for (const d of list) {
        const card = el.querySelector(`[data-id="${d.id}"]`); if (!card) continue;
        const s = d.state || {}, off = d.online === false, st = card.querySelector('[data-st]');
        card.classList.toggle('on', !!s.on && !off); card.classList.toggle('offline', off);
        if (d.type === 'ac') {
          card.classList.toggle('heat', s.mode === 'HEAT');
          st.textContent = off ? 'Offline' : `${s.on ? modeName(s.mode) : 'Desligado'} · ambiente ${fmt(s.current)}°`;
          card.querySelector('[data-pwr]').classList.toggle('on', !!s.on);
          card.querySelector('[data-tv]').innerHTML = `${fmt(pending[d.id]?.v ?? s.target)}<sup>°C</sup>`;
          const m = card.querySelector('[data-mode]'); if (m) m.innerHTML = `${I(MODE[s.mode]?.[1] || 'snow')}<span>${esc(modeName(s.mode))}</span>`;
          const f = card.querySelector('[data-fan]'); if (f) f.innerHTML = `${I('fan')}<span>${esc(/POWER|JET|TURBO/i.test(s.fan || '') ? 'Turbo' : fanName(s.fan))}</span>`;
          card.querySelector('[data-turbo]')?.classList.toggle('on', /POWER|JET|TURBO/i.test(s.fan || ''));
          card.querySelector('[data-eco]')?.classList.toggle('on', !!s.eco);
        } else if (card.classList.contains('rp-sw')) {
          const chs = s.channels?.length ? s.channels : [{ code: null, on: !!s.on }];
          const n = chs.filter(x => x.on).length;
          st.textContent = off ? 'Offline' : chs.length > 1 ? (n ? `${n} de ${chs.length} teclas ligadas` : 'Todas desligadas') : (s.on ? 'Ligada' : 'Desligada');
          card.querySelectorAll('.rk-col').forEach((col, i) => {
            const ch = chs[i]; if (!ch) return;
            const rk = col.querySelector('.rocker');
            col.querySelector('.rk-name').textContent = chs.length > 1 ? (ch.name || `Tecla ${i + 1}`) : '';
            if (rk._pend && Date.now() - rk._pend.t < 2500 && rk._pend.on !== !!ch.on) return;
            rk._pend = null; rk.classList.toggle('on', !!ch.on);
          });
        } else if (d.type === 'tv') {
          st.textContent = off ? 'Offline' : (s.on ? 'Ligada' : 'Desligada') + ' · estado estimado';
          card.querySelector('[data-tvpwr]').classList.toggle('on', !!s.on);
        } else {
          st.textContent = off ? 'Offline' : s.on ? 'Ligada' : 'Desligada';
          card.querySelector('[data-w]').innerHTML = s.on && typeof s.power === 'number' ? `${fmt(s.power, 0)}<small>W</small>` : '';
          card.querySelector('[data-tg]').classList.toggle('on', !!s.on);
        }
      }
    },
  };
  return ctl;
}

// ------------------------------------------------------------------ DISPOSITIVOS
function devCard(d) {
  const s = d.state || {};
  const nCh = s.channels?.length || 0, nOn = (s.channels || []).filter(c => c.on).length;
  const val = d.type === 'ac' ? (s.on ? `${fmt(s.target)}<small>°C</small>` : `<span style="color:var(--tx3)">Off</span>`)
    : nCh > 1 ? `${nOn}<small>/${nCh} teclas</small>`
    : (s.on ? (typeof s.power === 'number' ? `${fmt(s.power, 0)}<small>W</small>` : 'On') : `<span style="color:var(--tx3)">Off</span>`);
  const sub = d.type === 'ac' ? (s.on ? `${modeName(s.mode)} · ${fanName(s.fan)}` : `Ambiente ${fmt(s.current)}°`) : (d.online === false ? 'Offline' : placeName(d));
  return `<button class="dev-card ${s.on ? 'on' : ''} ${d.type} ${s.mode === 'HEAT' ? 'heat' : ''} ${d.online === false ? 'offline' : ''}" data-dev="${d.id}">
    <div class="dc-top"><div class="dc-ico">${I(d.type === 'ac' ? 'ac' : d.type === 'tv' ? 'tv' : d.type === 'light' || d.type === 'switch' ? 'light' : 'plug')}</div><span class="toggle sm ${s.on ? 'on' : ''}" data-tg="${d.id}"></span></div>
    <div class="dc-name">${esc(d.name)}</div><div class="dc-sub">${esc(sub)}</div><div class="dc-val">${val}</div></button>`;
}
// ---------- Dispositivos: cartões de vidro com controles no próprio cartão + seção de luzes ----------
const isLightDev = d => (d.state?.channels?.length || 0) > 1 || d.type === 'switch' || d.type === 'light' || /interruptor|tecla/i.test(d.name || '');
// desenho da luminária (usa o tipo da luminária ligada àquela tecla na planta)
function lampArt(type, on) {
  const glow = on ? `<defs><radialGradient id="lg-${type}" cx="50%" cy="70%" r="60%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".95"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>` : '';
  const beam = (d) => on ? `<path d="${d}" fill="url(#lg-${type})"/>` : '';
  const sh = 'class="la-s"', bulb = `class="la-b"`;
  const art = {
    plafon: `${beam('M14 26 L50 26 L62 62 L2 62 Z')}<rect x="10" y="14" width="44" height="6" rx="3" ${sh}/><ellipse cx="32" cy="22" rx="20" ry="5" ${bulb}/>`,
    pendente: `${beam('M20 40 L44 40 L60 64 L4 64 Z')}<line x1="32" y1="0" x2="32" y2="20" class="la-c"/><path d="M18 40 L24 22 L40 22 L46 40 Z" ${sh}/><ellipse cx="32" cy="41" rx="8" ry="3" ${bulb}/>`,
    spot: `${beam('M26 14 L38 14 L52 64 L12 64 Z')}<rect x="20" y="6" width="24" height="5" rx="2" ${sh}/><circle cx="32" cy="13" r="6" ${bulb}/>`,
    trilho: `${beam('M8 20 L56 20 L64 64 L0 64 Z')}<rect x="6" y="8" width="52" height="4" rx="2" ${sh}/>${[14, 32, 50].map(x => `<rect x="${x - 4}" y="11" width="8" height="9" rx="2" ${sh}/><circle cx="${x}" cy="21" r="3" ${bulb}/>`).join('')}`,
    lustre: `${beam('M10 34 L54 34 L64 64 L0 64 Z')}<line x1="32" y1="0" x2="32" y2="20" class="la-c"/><path d="M12 26 Q32 36 52 26" ${sh} fill="none" stroke-width="3"/>${[12, 24, 40, 52].map(x => `<circle cx="${x}" cy="${x === 12 || x === 52 ? 26 : 30}" r="4" ${bulb}/>`).join('')}`,
    fita: `${beam('M4 22 L60 22 L64 64 L0 64 Z')}<rect x="4" y="14" width="56" height="5" rx="2.5" ${bulb}/>`,
    arandela: `${on ? `<path d="M20 26 L44 26 L56 0 L8 0 Z" fill="url(#lg-${type})"/><path d="M20 40 L44 40 L56 64 L8 64 Z" fill="url(#lg-${type})"/>` : ''}<rect x="4" y="16" width="4" height="34" rx="2" class="la-c"/><path d="M8 24 L26 24 Q32 33 26 42 L8 42 Z" ${sh}/>`,
    coluna: `${beam('M20 22 L44 22 L58 64 L6 64 Z')}<line x1="32" y1="22" x2="32" y2="60" class="la-c" stroke-width="2.5"/><path d="M20 22 L24 6 L40 6 L44 22 Z" ${sh}/><rect x="22" y="58" width="20" height="4" rx="2" ${sh}/>`,
    abajur: `${beam('M18 30 L46 30 L60 64 L4 64 Z')}<path d="M18 30 L24 12 L40 12 L46 30 Z" ${sh}/><rect x="28" y="30" width="8" height="18" rx="3" ${sh}/><rect x="20" y="48" width="24" height="5" rx="2" ${sh}/>`,
  }[type] || `${beam('M20 34 L44 34 L60 64 L4 64 Z')}<path d="M32 6 a12 12 0 0 1 8 21 c-2 2-2 4-2 7 h-12 c0-3 0-5-2-7 a12 12 0 0 1 8-21z" ${bulb}/><rect x="26" y="36" width="12" height="5" rx="2" ${sh}/>`;
  return `<svg class="lamp-art ${on ? 'lit' : ''}" viewBox="0 0 64 64">${glow}${art}</svg>`;
}
const lampTypeFor = (devId, code) => (S.layout?.lights || []).find(l => l.link?.dev === devId && (!code || !l.link.ch || l.link.ch === code))?.type;
let devSig = '';
const devPending = {};
function devFilterMatch(d) {
  const f = S.devFilter || 'all';
  if (f === 'all') return true;
  const [k, id] = f.split(':');
  return k === 'area' ? d.area === id : d.room === id;
}
function renderDevices(force) {
  const el = $('#view-devices');
  if (S.devFilter === undefined) { try { S.devFilter = localStorage.getItem('devFilter') || 'all'; } catch (_) { S.devFilter = 'all'; } }
  const sig = [S.devFilter, rooms().map(r => r.id + r.name + r.rects.map(x => x.id + x.name).join()).join(), (S.layout?.lights || []).map(l => l.type + l.link?.dev + l.link?.ch).join(),
    S.devices.map(d => `${d.id}:${d.type}:${d.room}:${d.area}:${d.name}:${(d.state?.channels || []).map(c => c.code + c.name).join('.')}`).join()].join('|');
  if (force || sig !== devSig || !el.querySelector('.dv')) { devSig = sig; buildDevices(el); }
  updateDevicesView(el);
}
function buildDevices(el) {
  const h = new Date().getHours(), greet = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const line = h < 12 ? 'tenha um ótimo dia.' : h < 18 ? 'sua casa está em dia.' : 'hora de relaxar.';
  // filtros: todos, cada cômodo e cada área de ambiente unido
  const chips = [['all', 'Todos'], ...rooms().flatMap(r => r.grouped ? r.rects.map(p => [`area:${p.id}`, p.name]) : [[`room:${r.id}`, r.name]])];
  if (!chips.some(c => c[0] === S.devFilter)) S.devFilter = 'all'; // o cômodo do filtro não existe mais (planta mudou): mostra todos
  const list = S.devices.filter(devFilterMatch);
  const left = list.filter(d => !isLightDev(d)), lights = list.filter(isLightDev);
  const remoteKey = (d, re) => (d.caps?.keys || []).find(k => re.test(k.key) || re.test(k.key_name || ''));
  const card = d => {
    const foot = `<div class="dv-foot"><div class="grow"><div class="nm">${esc(d.name)}</div><div class="st" data-st></div></div><button class="dv-pwr" data-pwr title="Ligar/desligar">${I('power')}</button></div>`;
    let top = '';
    if (d.type === 'ac') top = `<div class="dv-temp"><button data-tminus>${I('minus')}</button><b data-tval>--</b><button data-tplus>${I('plus')}</button></div>`;
    else if (d.type === 'tv') top = `<div class="dv-remote">${[['volDown', /vol(ume)?.*(down|-)/i], ['volUp', /vol(ume)?.*(up|\+)/i], ['mute', /mute/i], ['chevron', /^ch(annel)?.*(up|\+)/i, 'up']].map(([ic, re, cls]) => { const k = remoteKey(d, re); return `<button ${k ? `data-key="${esc(k.key)}" data-kid="${k.key_id ?? ''}"` : 'disabled'}>${I(ic, cls)}</button>`; }).join('')}</div>`;
    else if (d.caps?.metering || typeof d.state?.power === 'number') top = `<div class="dv-watts"><div><b data-w>--</b><small>W</small></div><div data-spark></div></div>`;
    else top = `<div class="dv-ico">${I(devIco(d))}</div>`;
    return `<div class="dv-card ${d.type}" data-dev="${d.id}">${top}${foot}</div>`;
  };
  const lightCards = lights.flatMap(d => {
    const chs = d.state?.channels?.length > 1 ? d.state.channels : [{ code: '', name: d.name, single: true }];
    return chs.map((c, i) => `<div class="dv-light" data-dev="${d.id}" data-code="${c.code || ''}">
      <div class="dl-head"><div class="grow"><div class="nm">${esc(c.single ? d.name : c.name || `Tecla ${i + 1}`)}</div><div class="st" data-lst></div></div><div class="dl-art" data-art="${lampTypeFor(d.id, c.code) || ''}"></div></div>
      <div class="dl-foot"><span class="dl-src">${esc(c.single ? placeName(d) : `${d.name}${d.area || d.room ? ' · ' + (areaName(d) || roomName(d.room)) : ''}`)}</span><span class="toggle" data-lt></span></div></div>`);
  });
  el.innerHTML = `<div class="dv">
    <div class="dv-main">
      <div class="dv-info" data-info></div>
      <h1 class="dv-hello">Dispositivos,<br><span data-dvline>${line}</span></h1>
      <div class="dv-filters">${chips.map(([v, n]) => { const c = v === 'all' ? S.devices.length : S.devices.filter(d => v.startsWith('area:') ? d.area === v.slice(5) : d.room === v.slice(5)).length;
        return `<button data-filter="${v}" class="${(S.devFilter || 'all') === v ? 'on' : ''}">${esc(n)}<small>${c}</small></button>`; }).join('')}
        <span class="grow"></span><button class="dv-all" data-allon>${I('power')}Ligar tudo</button><button class="dv-all" data-alloff>Desligar tudo</button></div>
      <div class="dv-grid">${left.map(card).join('') || '<p class="dv-empty">Nenhum aparelho aqui.</p>'}</div>
    </div>
    <div class="dv-side">
      <div class="dv-side-h"><h2>Luzes</h2><span data-lcount></span></div>
      <div class="dv-lights">${lightCards.join('') || '<p class="dv-empty">Nenhum interruptor ou lâmpada aqui.</p>'}</div>
    </div></div>`;
  // gráfico de consumo das tomadas (busca uma vez por minuto)
  for (const d of left) if (d.caps?.metering) { if (!tipEnergy[d.id] || Date.now() - tipEnergy[d.id].t > 60000) { tipEnergy[d.id] = { t: Date.now(), pts: tipEnergy[d.id]?.pts || null }; api.getEnergy(d.id).then(hs => { tipEnergy[d.id].pts = hs.filter(p => p[0] > Date.now() - 864e5); const sp = el.querySelector(`[data-dev="${d.id}"] [data-spark]`); if (sp) sp.innerHTML = sparkline(tipEnergy[d.id].pts); }).catch(() => {}); } }
  el.onclick = e => {
    const f = e.target.closest('[data-filter]');
    if (f) { S.devFilter = f.dataset.filter; try { localStorage.setItem('devFilter', S.devFilter); } catch (_) {} renderDevices(true); animIn(['#view-devices']); return; }
    if (e.target.closest('[data-allon]')) return api.runAction({ target: { type: 'all' }, command: { action: 'power', value: true } });
    if (e.target.closest('[data-alloff]')) return api.runAction({ target: { type: 'all' }, command: { action: 'power', value: false } });
    const host = e.target.closest('[data-dev]'); if (!host) return;
    const d = dev(host.dataset.dev); if (!d) return;
    const s = d.state || {}, c = d.caps || {};
    const lt = e.target.closest('[data-lt]');
    if (lt) { const code = host.dataset.code, on = !lt.classList.contains('on'); lt.classList.toggle('on', on); host.classList.toggle('on', on); host._pend = { on, t: Date.now() }; return cmd(d.id, code ? { action: 'channel', code, value: on } : { action: 'power', value: on }); }
    if (e.target.closest('[data-pwr]')) return cmd(d.id, d.type === 'tv' ? { action: 'toggle' } : { action: 'power', value: !s.on });
    if (e.target.closest('[data-tminus]') || e.target.closest('[data-tplus]')) {
      const cur = devPending[d.id]?.v ?? s.target ?? 23;
      const v = Math.min(c.tempMax ?? 30, Math.max(c.tempMin ?? 16, cur + (e.target.closest('[data-tplus]') ? 1 : -1) * (c.tempStep || 1)));
      clearTimeout(devPending[d.id]?.t);
      devPending[d.id] = { v, t: setTimeout(async () => { await cmd(d.id, { action: 'temp', value: v }); setTimeout(() => { delete devPending[d.id]; updateDevicesView(el); }, 2500); }, 450) };
      return updateDevicesView(el);
    }
    const kb = e.target.closest('[data-key]'); if (kb) return cmd(d.id, { action: 'key', key: kb.dataset.key, key_id: kb.dataset.kid === '' ? undefined : +kb.dataset.kid });
    if (e.target.closest('button')) return;
    openPanel({ type: 'device', id: d.id });
  };
}
function updateDevicesView(el) {
  const list = S.devices.filter(devFilterMatch);
  const on = S.devices.filter(d => d.state?.on && d.online !== false).length;
  const watts = S.devices.reduce((a, d) => a + (d.state?.on && typeof d.state.power === 'number' ? d.state.power : 0), 0);
  const hum = S.devices.find(d => typeof d.state?.humidity === 'number')?.state.humidity;
  const wk = S.weather ? weatherKind(S.weather.code) : null;
  const info = el.querySelector('[data-info]');
  const dl = el.querySelector('[data-dvline]'); if (dl) dl.textContent = on ? `${on} ${on === 1 ? 'ligado' : 'ligados'} agora.` : 'tudo desligado.';
  if (info) info.innerHTML = [wk ? `<span>${I(wk.icon || 'sun')}${fmt(S.weather.temp, 0)}°C lá fora</span>` : '', hum != null ? `<span>${I('drop')}${fmt(hum, 0)}%</span>` : '',
    `<span>${I('bolt')}${watts >= 1000 ? fmt(watts / 1000, 2) + ' kW' : fmt(watts, 0) + ' W'}</span>`, `<span>${I('power')}${on} ligado${on === 1 ? '' : 's'}</span>`].filter(Boolean).join('');
  for (const card of el.querySelectorAll('.dv-card')) {
    const d = dev(card.dataset.dev); if (!d) continue;
    const s = d.state || {}, off = d.online === false, st = card.querySelector('[data-st]');
    card.classList.toggle('on', !!s.on && !off); card.classList.toggle('offline', off); card.classList.toggle('heat', s.mode === 'HEAT');
    if (d.type === 'ac') {
      card.querySelector('[data-tval]').innerHTML = `${fmt(devPending[d.id]?.v ?? s.target)}<sup>°C</sup>`;
      st.textContent = off ? 'Offline' : s.on ? `${modeName(s.mode)} a ${fmt(devPending[d.id]?.v ?? s.target)}°` : `Desligado · ${fmt(s.current)}° dentro`;
    } else if (d.type === 'tv') st.textContent = off ? 'Offline' : s.on ? 'Ligada' : 'Desligada';
    else {
      const w = card.querySelector('[data-w]'); if (w) w.textContent = s.on && typeof s.power === 'number' ? fmt(s.power, 0) : '0';
      const sp = card.querySelector('[data-spark]'); if (sp && !sp.innerHTML && tipEnergy[d.id]?.pts) sp.innerHTML = sparkline(tipEnergy[d.id].pts);
      st.textContent = off ? 'Offline' : s.on ? `Ligada${typeof s.energyKwh === 'number' ? ` · ${fmt(s.energyKwh, 1)} kWh` : ''}` : 'Desligada';
    }
  }
  let lOn = 0, lAll = 0;
  for (const lc of el.querySelectorAll('.dv-light')) {
    const d = dev(lc.dataset.dev); if (!d) continue;
    const code = lc.dataset.code, ch = code ? (d.state?.channels || []).find(c => c.code === code) : null;
    let on = d.online !== false && !!(ch ? ch.on : d.state?.on);
    if (lc._pend && Date.now() - lc._pend.t < 2500 && lc._pend.on !== on) on = lc._pend.on; else lc._pend = null; // espera o aparelho confirmar
    lAll++; if (on) lOn++;
    lc.classList.toggle('on', on); lc.classList.toggle('offline', d.online === false);
    lc.querySelector('[data-lt]').classList.toggle('on', on);
    lc.querySelector('[data-lst]').textContent = d.online === false ? 'Offline' : on ? 'Acesa' : 'Apagada';
    const art = lc.querySelector('[data-art]'); if (art._on !== on) { art._on = on; art.innerHTML = lampArt(art.dataset.art, on); }
  }
  const lc = el.querySelector('[data-lcount]'); if (lc) lc.textContent = lAll ? `${lOn} de ${lAll} acesas` : '';
}

// ------------------------------------------------------------------ CENAS & AGENDAMENTOS
const SCENE_ICONS = ['moon', 'home', 'door', 'sun', 'film', 'coffee', 'snow', 'sparkles', 'leaf', 'bolt'];
function actionText(a) {
  const t = a.target, c = a.command || {};
  const who = t.type === 'device' ? (dev(t.id)?.name || 'Aparelho removido') : t.type === 'room' ? roomName(t.id) : t.type === 'scene' ? `cena "${S.scenes.find(s => s.id === t.id)?.name || '?'}"` : a.onlyType === 'plug' ? 'todas as tomadas' : a.onlyType === 'ac' ? 'todos os ares' : 'tudo';
  if (t.type === 'scene') return `Executar ${who}`;
  if (t.type === 'notify') return `Avisar: "${c.text || ''}"`;
  const what = { power: c.value ? 'Ligar' : 'Desligar', toggle: 'Alternar', temp: `${fmt(c.value)}° em`, mode: `${modeName(c.value)} em`, fan: `Ventilação ${fanName(c.value)} em`, eco: c.value ? 'Eco ligado em' : 'Eco desligado em', sleep: `Sono ${timeName(c.value)} em`, countdown: `Desligar em ${timeName(c.value / 60)}:`, timerOff: `Desligar em ${timeName(c.value)}:` }[c.action] || c.action;
  return `${what} ${who}`;
}
// mensagens técnicas viram frases simples na Atividade
function friendlyLog(m) {
  return String(m || '').replace(/\(?fetch failed\)?/gi, '(sem internet)').replace(/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND/g, 'sem resposta').replace(/\s+/g, ' ').trim();
}
function nextSchedule() {
  const now = new Date(); let best = null;
  for (const sc of S.schedules || []) {
    if (!sc.enabled || !/^\d{1,2}:\d{2}$/.test(sc.time || '')) continue;
    const [hh, mm] = sc.time.split(':').map(Number);
    for (let k = 0; k < 8; k++) {
      const d = new Date(now); d.setDate(d.getDate() + k); d.setHours(hh, mm, 0, 0);
      if (d > now && (!sc.days?.length || sc.days.includes(d.getDay()))) { if (!best || d < best.d) best = { d, sc }; break; }
    }
  }
  return best;
}
function renderAuto() {
  const el = $('#view-auto'), f = S.autoFilter || 'all', show = k => f === 'all' || f === k;
  const rules = S.rules || [], activeRules = rules.filter(r => r.enabled).length, nx = nextSchedule();
  const h = new Date().getHours(), line = h < 12 ? 'tudo pronto para o dia.' : h < 18 ? 'sua casa no piloto automático.' : 'a casa cuida da noite.';
  const row = (kind, x, ico, body) => `<div class="au-row ${x.enabled ? '' : 'off'}"><div class="au-ico ${kind}">${ico}</div><div class="grow">${body}</div>
    <button class="icon-btn" data-edit-${kind}="${x.id}" title="Editar">${I('edit')}</button><span class="toggle ${x.enabled ? 'on' : ''}" data-tg-${kind}="${x.id}" role="switch" aria-checked="${!!x.enabled}" aria-label="Ativar ${esc(x.name)}"></span></div>`;
  el.innerHTML = `<div class="dv au">
    <div class="dv-main">
      <div class="dv-info"><span>${I('sparkles')}${S.scenes.length} cena${S.scenes.length === 1 ? '' : 's'}</span><span>${I('bolt')}${activeRules} regra${activeRules === 1 ? '' : 's'} ativa${activeRules === 1 ? '' : 's'}</span>
        ${nx ? `<span>${I('clock')}próximo: ${esc(nx.sc.name)} às ${esc(nx.sc.time)}</span>` : ''}</div>
      <h1 class="dv-hello">Automação,<br><span>${line}</span></h1>
      <div class="dv-filters">${[['all', 'Tudo'], ['scenes', 'Cenas'], ['rules', 'Regras'], ['sched', 'Agendamentos']].map(([v, n]) => `<button data-afilter="${v}" class="${f === v ? 'on' : ''}">${n}</button>`).join('')}
</div>
      ${show('scenes') ? `<div class="au-h"><h2>Cenas</h2><span>um toque executa vários comandos</span><button class="au-add" data-new-scene>${I('plus')}Nova cena</button></div>
      <div class="dv-grid">${S.scenes.map(sc => `<div class="dv-card au-scene">
          <div class="au-top"><div class="dv-ico">${I(sc.icon || 'sparkles')}</div><button class="icon-btn" data-edit-scene="${sc.id}" title="Editar cena">${I('edit')}</button></div>
          <div class="dv-foot"><div class="grow"><div class="nm">${esc(sc.name)}</div><div class="st">${sc.actions.length} ${sc.actions.length === 1 ? 'ação' : 'ações'}</div></div>
          <button class="dv-pwr au-run" data-run="${sc.id}" title="Executar ${esc(sc.name)}">${I('play')}</button></div></div>`).join('')}
</div>${!S.scenes.length ? '<p class="dv-empty">Nenhuma cena ainda. Toque em “Nova cena”.</p>' : ''}` : ''}
      ${show('rules') ? `<div class="au-h"><h2>Regras</h2><span>se acontecer isto, faça aquilo</span><button class="au-add" data-new-rule>${I('plus')}Nova regra</button></div>
      <div class="au-list">${rules.map(r => row('rule', r, I(r.trigger?.type === 'sun' ? 'sun' : r.trigger?.type === 'time' ? 'clock' : 'bolt'),
        `<div class="nm">${esc(r.name)}</div><div class="what"><b>SE</b> ${esc(triggerText(r))}</div><div class="what"><b>ENTÃO</b> ${(r.actions || []).map(actionText).map(esc).join(' · ')}</div>`)).join('') || '<p class="dv-empty">Nenhuma regra ainda.</p>'}</div>
      <div class="au-tpl"><span>Sugestões</span>${RULE_TEMPLATES.map((t, i) => `<button class="dv-all" data-tpl="${i}">${I(t.icon)}${t.label}</button>`).join('')}</div>` : ''}
      ${show('rules') && (S.links || []).length ? `<div class="au-h"><h2>Teclas ligadas</h2><span>um interruptor comandando outro</span></div>
      <div class="au-list">${S.links.map(l => `<div class="au-row ${l.enabled === false ? 'off' : ''}"><div class="au-ico link">${I('light')}</div><div class="grow">${l.group ? `<div class="nm">${esc(keyLabel(l.a))} → grupo de ${l.group.length} ${l.group.length === 1 ? 'luz' : 'luzes'}</div>
        <div class="what">${l.act === 'off' ? 'só desliga' : l.act === 'on' ? 'só liga' : 'liga e desliga junto'}${l.group.length ? ': ' + esc(l.group.map(keyLabel).join(', ')) : ''} · altere no painel do interruptor</div>` : `<div class="nm">${esc(keyLabel(l.a))} ${l.mode === 'follow' ? '→' : '⇄'} ${esc(keyLabel(l.b))}</div>
        <div class="what">${l.mode === 'follow' ? 'só no sentido da seta' : 'nos dois sentidos'} · altere no painel do interruptor</div>`}</div>
        <button class="icon-btn" data-lkopen="${l.a.dev}" title="Abrir interruptor">${I('edit')}</button><span class="toggle ${l.enabled === false ? '' : 'on'}" data-lktg="${l.id}" role="switch" aria-label="Ativar ligação"></span></div>`).join('')}</div>` : ''}
      ${show('sched') ? `<div class="au-h"><h2>Agendamentos</h2><span>rodam no horário, mesmo com o app na bandeja</span><button class="au-add" data-new-sched>${I('plus')}Novo horário</button></div>
      <div class="au-list">${S.schedules.map(sc => row('sched', sc, `<b class="au-time">${esc(sc.time)}</b>`,
        `<div class="nm">${esc(sc.name)}</div><div class="ds">${DAYS.map((l, i) => `<span class="${sc.days.includes(i) ? 'on' : ''}">${l}</span>`).join('')}</div><div class="what">${sc.actions.map(actionText).map(esc).join(' · ')}</div>`)).join('') || '<p class="dv-empty">Nenhum agendamento ainda.</p>'}</div>` : ''}
    </div>
    <div class="dv-side">
      <div class="dv-side-h"><h2>Atividade</h2><span>últimos acontecimentos</span></div>
      <div class="au-log">${S.logs.slice(0, 30).map(l => `<div class="log ${l.level}"><time>${new Date(l.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time><span>${esc(friendlyLog(l.msg))}</span></div>`).join('') || '<p class="dv-empty">Sem atividade ainda.</p>'}</div>
    </div></div>`;
  el.onclick = async e => {
    const lo = e.target.closest('[data-lkopen]'); if (lo) return openPanel({ type: 'device', id: lo.dataset.lkopen });
    const lt = e.target.closest('[data-lktg]');
    if (lt) { await saveLinks((S.links || []).map(l => l.id === lt.dataset.lktg ? { ...l, enabled: l.enabled === false } : l)); renderAuto(); return; }
    const af = e.target.closest('[data-afilter]');
    if (af) { S.autoFilter = af.dataset.afilter; renderAuto(); return; }
    const r = e.target.closest('[data-run]');
    if (r) { r.classList.add('ran'); setTimeout(() => r.classList.remove('ran'), 900); await api.runScene(r.dataset.run); toast('Cena executada'); return; }
    const es = e.target.closest('[data-edit-scene]'); if (es) return editAuto('scene', S.scenes.find(s => s.id === es.dataset.editScene));
    if (e.target.closest('[data-new-scene]')) return editAuto('scene', null);
    const eh = e.target.closest('[data-edit-sched]'); if (eh) return editAuto('schedule', S.schedules.find(s => s.id === eh.dataset.editSched));
    if (e.target.closest('[data-new-sched]')) return editAuto('schedule', null);
    const er = e.target.closest('[data-edit-rule]'); if (er) return editAuto('rule', S.rules.find(r => r.id === er.dataset.editRule));
    if (e.target.closest('[data-new-rule]')) return editAuto('rule', null);
    const tp = e.target.closest('[data-tpl]'); if (tp) return editAuto('rule', { ...RULE_TEMPLATES[+tp.dataset.tpl].make(), _new: true });
    const tr = e.target.closest('[data-tg-rule]');
    if (tr) { const r = S.rules.find(r => r.id === tr.dataset.tgRule); r.enabled = !r.enabled; await saveKey('rules', S.rules); renderAuto(); return; }
    const tg = e.target.closest('[data-tg-sched]');
    if (tg) { const s = S.schedules.find(s => s.id === tg.dataset.tgSched); s.enabled = !s.enabled; await saveKey('schedules', S.schedules); renderAuto(); }
  };
}

// ---------- regras ----------
const PROPS = { on: 'estiver', power: 'consumo (W)', current: 'temperatura ambiente (°C)', target: 'temperatura ajustada (°C)', online: 'conexão' };
function propsFor(d) {
  if (!d) return ['on'];
  if (d.type === 'ac') return ['on', 'current', 'target', 'online'];
  return ['on', ...(typeof d.state?.power === 'number' || d.caps?.metering ? ['power'] : []), 'online'];
}
function newRule() {
  const d = S.devices[0];
  return { id: 'ru-' + Date.now(), name: 'Nova regra', enabled: true, trigger: { type: 'device', id: d?.id, prop: 'on', op: '=', value: true, forMin: 30 },
    conditions: { days: [0, 1, 2, 3, 4, 5, 6] }, cooldownMin: 0, actions: [{ target: { type: 'device', id: d?.id }, command: { action: 'power', value: false } }] };
}
const firstOf = type => S.devices.find(d => d.type === type) || S.devices[0];
const RULE_TEMPLATES = [
  { label: 'Desligar se esquecer ligado', icon: 'timer', make: () => { const d = firstOf('plug'); return { ...newRule(), name: `Desligar ${d?.name || 'aparelho'} esquecido`, trigger: { type: 'device', id: d?.id, prop: 'on', op: '=', value: true, forMin: 60 }, actions: [{ target: { type: 'device', id: d?.id }, command: { action: 'power', value: false } }, { target: { type: 'notify' }, command: { text: `${d?.name} ficou 1 h ligado e foi desligado` } }] }; } },
  { label: 'Ligar o ar se esquentar', icon: 'snow', make: () => { const d = firstOf('ac'); return { ...newRule(), name: 'Ligar o ar se esquentar', trigger: { type: 'device', id: d?.id, prop: 'current', op: '>', value: 27, forMin: 5 }, conditions: { from: '12:00', to: '23:30', days: [0, 1, 2, 3, 4, 5, 6] }, cooldownMin: 120, actions: [{ target: { type: 'device', id: d?.id }, command: { action: 'power', value: true } }, { target: { type: 'device', id: d?.id }, command: { action: 'temp', value: 23 } }] }; } },
  { label: 'Acender ao pôr do sol', icon: 'sun', make: () => { const d = firstOf('plug'); return { ...newRule(), name: 'Acender ao pôr do sol', trigger: { type: 'sun', event: 'sunset', offsetMin: 0 }, actions: [{ target: { type: 'device', id: d?.id }, command: { action: 'power', value: true } }] }; } },
  { label: 'Avisar se ficar offline', icon: 'wifiOff', make: () => { const d = S.devices[0]; return { ...newRule(), name: 'Aviso de aparelho offline', trigger: { type: 'device', id: d?.id, prop: 'online', op: '=', value: false, forMin: 5 }, actions: [{ target: { type: 'notify' }, command: { text: `${d?.name} está offline há 5 min` } }] }; } },
  { label: 'Consumo alto', icon: 'bolt', make: () => { const d = firstOf('plug'); return { ...newRule(), name: 'Consumo alto', trigger: { type: 'device', id: d?.id, prop: 'power', op: '>', value: 1500, forMin: 10 }, cooldownMin: 60, actions: [{ target: { type: 'notify' }, command: { text: `${d?.name} está consumindo muito` } }] }; } },
];
function triggerText(r) {
  const t = r.trigger || {};
  let txt;
  if (t.type === 'sun') txt = `${t.event === 'sunrise' ? 'o sol nascer' : 'o sol se pôr'}${t.offsetMin ? ` (${t.offsetMin > 0 ? '+' : ''}${t.offsetMin} min)` : ''}`;
  else if (t.type === 'time') txt = `for ${t.time}`;
  else {
    const d = dev(t.id), n = d?.name || 'aparelho removido';
    if (t.prop === 'on') txt = `${n} estiver ${t.value ? 'ligado' : 'desligado'}`;
    else if (t.prop === 'online') txt = `${n} estiver ${t.value ? 'online' : 'offline'}`;
    else txt = `${PROPS[t.prop]} de ${n} ${t.op} ${t.value}`;
    if (t.forMin) txt += ` por ${t.forMin} min`;
  }
  const c = r.conditions || {};
  if (c.from && c.to) txt += `, entre ${c.from} e ${c.to}`;
  if (c.days && c.days.length < 7) txt += ` (${c.days.map(d => DAY_FULL[d]).join(', ')})`;
  return txt;
}
function ruleTop(it) {
  const t = it.trigger, c = it.conditions || (it.conditions = { days: [0, 1, 2, 3, 4, 5, 6] });
  const d = dev(t.id);
  let body = '';
  if (t.type === 'device') {
    const props = propsFor(d); if (!props.includes(t.prop)) t.prop = props[0];
    const valSel = t.prop === 'on' ? `<select data-rval><option value="true" ${t.value ? 'selected' : ''}>ligado</option><option value="false" ${!t.value ? 'selected' : ''}>desligado</option></select>`
      : t.prop === 'online' ? `<select data-rval><option value="true" ${t.value ? 'selected' : ''}>online</option><option value="false" ${!t.value ? 'selected' : ''}>offline</option></select>`
        : `<select data-rop>${['>', '<', '>=', '<=', '='].map(o => `<option ${t.op === o ? 'selected' : ''}>${o}</option>`).join('')}</select><input type="number" data-rval value="${t.value ?? 0}" style="width:90px">`;
    body = `<div class="rule-line"><select data-rdev>${S.devices.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <select data-rprop>${props.map(p => `<option value="${p}" ${p === t.prop ? 'selected' : ''}>${PROPS[p]}</option>`).join('')}</select>${valSel}</div>
      <div class="rule-line"><span class="lbl">por pelo menos</span><input type="number" min="0" data-rfor value="${t.forMin || 0}" style="width:80px"><span class="lbl">minutos</span></div>`;
  } else if (t.type === 'sun') {
    body = `<div class="rule-line"><span class="lbl">Ajuste</span><input type="number" data-roff value="${t.offsetMin || 0}" style="width:90px"><span class="lbl">minutos (negativo = antes)</span></div>`;
  } else body = `<div class="rule-line"><span class="lbl">Às</span><input type="time" data-rtime value="${t.time || '07:00'}"></div>`;
  return `<div class="rule-box"><label class="rb-t">SE</label>
    <div class="rule-line"><select data-rt>${[['device', 'Quando um aparelho…'], ['sun:sunset', 'Quando o sol se pôr'], ['sun:sunrise', 'Quando o sol nascer'], ['time', 'Num horário']].map(([v, l]) => `<option value="${v}" ${(t.type === 'sun' ? 'sun:' + t.event : t.type) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${body}</div>
    <div class="rule-box"><label class="rb-t">SÓ SE</label>
      <div class="rule-line"><label class="chk"><input type="checkbox" data-rwin ${c.from ? 'checked' : ''}> entre</label><input type="time" data-rfrom value="${c.from || '18:00'}" ${c.from ? '' : 'disabled'}><span class="lbl">e</span><input type="time" data-rto value="${c.to || '23:00'}" ${c.from ? '' : 'disabled'}></div>
      <div class="days" style="margin-top:6px">${DAYS.map((l, i) => `<button data-rday="${i}" class="${c.days?.includes(i) ? 'on' : ''}" title="${DAY_FULL[i]}">${l}</button>`).join('')}</div>
      <div class="rule-line" style="margin-top:8px"><span class="lbl">Não repetir por</span><input type="number" min="0" data-rcool value="${it.cooldownMin || 0}" style="width:80px"><span class="lbl">min depois de disparar</span></div></div>`;
}
function readRuleTop(it, root) {
  const q = sel => $(sel, root), t = it.trigger;
  const rt = q('[data-rt]')?.value;
  if (rt) {
    const [type, ev] = rt.split(':');
    if (type !== t.type || (ev && ev !== t.event)) { it.trigger = type === 'device' ? { type, id: t.id || S.devices[0]?.id, prop: 'on', op: '=', value: true, forMin: 0 } : type === 'sun' ? { type, event: ev, offsetMin: 0 } : { type, time: '07:00' }; }
  }
  const T = it.trigger;
  if (T.type === 'device') {
    if (q('[data-rdev]')) T.id = q('[data-rdev]').value;
    if (q('[data-rprop]')) { const np = q('[data-rprop]').value; if (np !== T.prop) { T.prop = np; T.op = np === 'on' || np === 'online' ? '=' : '>'; T.value = np === 'on' || np === 'online' ? true : np === 'power' ? 100 : 26; } else {
      const v = q('[data-rval]'); if (v) T.value = v.tagName === 'SELECT' ? v.value === 'true' : +v.value;
      if (q('[data-rop]')) T.op = q('[data-rop]').value;
    } }
    if (q('[data-rfor]')) T.forMin = Math.max(0, +q('[data-rfor]').value || 0);
  } else if (T.type === 'sun' && q('[data-roff]')) T.offsetMin = +q('[data-roff]').value || 0;
  else if (T.type === 'time' && q('[data-rtime]')) T.time = q('[data-rtime]').value || '07:00';
  const c = it.conditions;
  if (q('[data-rwin]')) { if (q('[data-rwin]').checked) { c.from = q('[data-rfrom]').value || '18:00'; c.to = q('[data-rto]').value || '23:00'; } else { delete c.from; delete c.to; } }
  if (q('[data-rcool]')) it.cooldownMin = Math.max(0, +q('[data-rcool]').value || 0);
}

function targetOptions(includeScenes, includeNotify) {
  const o = [];
  if (includeNotify) o.push(['notify', '🔔 Notificação no Windows']);
  for (const d of S.devices) o.push([`d:${d.id}`, `${d.type === 'ac' ? '❄ ' : '⏻ '}${d.name}`]);
  for (const r of rooms()) o.push([`r:${r.id}`, `Cômodo: ${r.name}`]);
  o.push(['all', 'Todos os aparelhos'], ['all:plug', 'Todas as tomadas'], ['all:ac', 'Todos os ares']);
  if (includeScenes) for (const s of S.scenes) o.push([`s:${s.id}`, `Cena: ${s.name}`]);
  return o;
}
function encTarget(a) { const t = a.target; if (t.type === 'notify') return 'notify'; return t.type === 'device' ? `d:${t.id}` : t.type === 'room' ? `r:${t.id}` : t.type === 'scene' ? `s:${t.id}` : a.onlyType ? `all:${a.onlyType}` : 'all'; }
function decTarget(v) {
  if (v === 'notify') return { target: { type: 'notify' } };
  const [k, id] = v.split(':');
  if (k === 'd') return { target: { type: 'device', id } };
  if (k === 'r') return { target: { type: 'room', id } };
  if (k === 's') return { target: { type: 'scene', id } };
  return id ? { target: { type: 'all' }, onlyType: id } : { target: { type: 'all' } };
}
function actionOptions(tv) {
  if (tv.startsWith('s:')) return [['run', 'Executar']];
  if (tv === 'notify') return [['text', 'Mensagem']];
  const base = [['on', 'Ligar'], ['off', 'Desligar']];
  if (tv.startsWith('d:')) {
    const d = dev(tv.slice(2));
    if (d?.type === 'ac') return [...base, ['temp', 'Temperatura'], ['mode', 'Modo'], ['fan', 'Ventilação'], ['eco_on', 'Eco ligado'], ['eco_off', 'Eco desligado'], ['sleep', 'Sono'], ['timerOff', 'Desligar em (min)']];
    if (d?.type === 'tv') return [...base, ['toggle', 'Alternar']];
    return [...base, ['toggle', 'Alternar'], ['countdown', 'Desligar em (min)']];
  }
  return base;
}
function encAction(c) { if (c && c.text !== undefined) return 'text'; if (!c || !c.action) return 'run'; if (c.action === 'power') return c.value ? 'on' : 'off'; if (c.action === 'eco') return c.value ? 'eco_on' : 'eco_off'; return c.action; }
function decAction(a, val) {
  switch (a) {
    case 'run': return {};
    case 'text': return { text: val || 'Regra disparada' };
    case 'on': return { action: 'power', value: true };
    case 'off': return { action: 'power', value: false };
    case 'eco_on': return { action: 'eco', value: true };
    case 'eco_off': return { action: 'eco', value: false };
    case 'temp': return { action: 'temp', value: +val || 23 };
    case 'countdown': return { action: 'countdown', value: (+val || 30) * 60 };
    case 'sleep': case 'timerOff': return { action: a, value: +val || 60 };
    case 'mode': case 'fan': return { action: a, value: val };
    default: return { action: a };
  }
}
function valueInput(tv, a, cur) {
  const d = tv.startsWith('d:') ? dev(tv.slice(2)) : null;
  if (a === 'text') return `<input data-val value="${esc(cur ?? '')}" placeholder="Mensagem do aviso">`;
  if (a === 'temp') return `<input type="number" data-val min="${d?.caps.tempMin ?? 16}" max="${d?.caps.tempMax ?? 30}" value="${cur ?? 23}">`;
  if (a === 'mode') return `<select data-val>${(d?.caps.modes || []).map(m => `<option value="${m}" ${m === cur ? 'selected' : ''}>${modeName(m)}</option>`).join('')}</select>`;
  if (a === 'fan') return `<select data-val>${(d?.caps.fans || []).map(m => `<option value="${m}" ${m === cur ? 'selected' : ''}>${fanName(m)}</option>`).join('')}</select>`;
  if (['sleep', 'timerOff', 'countdown'].includes(a)) return `<input type="number" data-val min="1" value="${cur ?? 60}" title="minutos">`;
  return `<span></span>`;
}

function editAuto(kind, item) {
  const isSched = kind === 'schedule', isRule = kind === 'rule';
  const it = item ? JSON.parse(JSON.stringify(item)) : isRule ? newRule() : (isSched
    ? { id: 'sch-' + Date.now(), name: 'Novo agendamento', enabled: true, days: [1, 2, 3, 4, 5], time: '07:00', actions: [] }
    : { id: 'sc-' + Date.now(), name: 'Nova cena', icon: 'sparkles', actions: [] });
  if (!it.actions.length) it.actions.push({ target: { type: 'all' }, command: { action: 'power', value: false } });
  const root = $('#modal-root');
  const draw = () => {
    root.innerHTML = `<div class="modal-bg"><div class="modal ed-modal" role="dialog" aria-label="${isRule ? 'Regra' : isSched ? 'Agendamento' : 'Cena'}">
      <div class="ed-head"><i class="rb-ic" style="--c:${isRule ? '#d97a0a;--c2:#f29a26' : isSched ? '#007aff;--c2:#3d9bff' : '#5e5ce6;--c2:#7d7bf0'}" aria-hidden="true">${I(isRule ? 'bolt' : isSched ? 'clock' : (it.icon || 'sparkles'))}</i>
        <h2>${item && !item._new ? 'Editar' : 'Nova'} ${isRule ? 'regra' : isSched ? 'agendamento' : 'cena'}</h2><button class="icon-btn" data-cancel title="Fechar">${I('close')}</button></div>
      <div class="field"><label>Nome</label><input data-name value="${esc(it.name)}"></div>
      ${isRule ? ruleTop(it) : isSched ? `<div class="field-row"><div class="field"><label>Horário</label><input type="time" data-time value="${it.time}"></div>
        <div class="field"><label>Dias</label><div class="days">${DAYS.map((l, i) => `<button data-day="${i}" class="${it.days.includes(i) ? 'on' : ''}" title="${DAY_FULL[i]}">${l}</button>`).join('')}</div></div></div>`
      : `<div class="field"><label>Ícone</label><div class="icon-pick">${SCENE_ICONS.map(n => `<button data-icon="${n}" class="${it.icon === n ? 'on' : ''}">${I(n)}</button>`).join('')}</div></div>`}
      <div class="field"><label>${isRule ? 'ENTÃO faça (em ordem)' : 'Ações (executadas em ordem)'}</label>
      ${it.actions.map((a, i) => { const tv = encTarget(a), av = encAction(a.command); return `<div class="act-row" data-i="${i}">
        <select data-t>${targetOptions(isSched || isRule, isRule).map(([v, l]) => `<option value="${v}" ${v === tv ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <select data-a>${actionOptions(tv).map(([v, l]) => `<option value="${v}" ${v === av ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${valueInput(tv, av, a.command?.text !== undefined ? a.command.text : a.command?.action === 'countdown' ? a.command.value / 60 : a.command?.value)}
        <button class="x" data-del="${i}">${I('close')}</button></div>`; }).join('')}
      <button class="ed-add" data-add>${I('plus')}Adicionar ação</button></div>
      <div class="foot"><div>${item && !item._new ? `<button class="btn danger" data-remove>${I('trash')}Excluir</button>` : ''}</div>
        <div style="display:flex;gap:8px"><button class="btn" data-cancel>Cancelar</button><button class="btn primary" data-ok>Salvar</button></div></div>
    </div></div>`;
  };
  const read = () => {
    it.name = $('[data-name]', root).value;
    if (isSched) it.time = $('[data-time]', root).value || '07:00';
    if (isRule) readRuleTop(it, root);
    it.actions = [...root.querySelectorAll('.act-row')].map(r => {
      const tv = $('[data-t]', r).value, av = $('[data-a]', r).value, vv = $('[data-val]', r)?.value;
      const ok = actionOptions(tv).some(([v]) => v === av) ? av : actionOptions(tv)[0][0];
      return { ...decTarget(tv), command: decAction(ok, vv) };
    });
  };
  draw();
  root.onchange = e => { if (e.target.matches('[data-t],[data-a],[data-rt],[data-rdev],[data-rprop],[data-rwin]')) { read(); draw(); } };
  root.onclick = async e => {
    if (e.target.classList.contains('modal-bg') || e.target.closest('[data-cancel]')) { root.innerHTML = ''; return; }
    const rday = e.target.closest('[data-rday]'); if (rday) { read(); const n = +rday.dataset.rday; const d = it.conditions.days; it.conditions.days = d.includes(n) ? d.filter(x => x !== n) : [...d, n].sort(); draw(); return; }
    const day = e.target.closest('[data-day]'); if (day) { read(); const n = +day.dataset.day; it.days = it.days.includes(n) ? it.days.filter(x => x !== n) : [...it.days, n].sort(); draw(); return; }
    const ic = e.target.closest('[data-icon]'); if (ic) { read(); it.icon = ic.dataset.icon; draw(); return; }
    if (e.target.closest('[data-add]')) { read(); it.actions.push({ target: { type: 'all' }, command: { action: 'power', value: true } }); draw(); return; }
    const del = e.target.closest('[data-del]'); if (del) { read(); it.actions.splice(+del.dataset.del, 1); draw(); return; }
    const list = isRule ? (S.rules || []) : isSched ? S.schedules : S.scenes;
    const key = isRule ? 'rules' : isSched ? 'schedules' : 'scenes';
    if (e.target.closest('[data-remove]')) { const n = list.filter(x => x.id !== it.id); await saveKey(key, n); root.innerHTML = ''; renderAuto(); return; }
    if (e.target.closest('[data-ok]')) {
      read(); delete it.lastRun; delete it._new;
      const n = list.some(x => x.id === it.id) ? list.map(x => (x.id === it.id ? it : x)) : [...list, it];
      await saveKey(key, n); root.innerHTML = ''; renderAuto(); toast('Salvo');
    }
  };
}
async function saveKey(key, value) { const all = await api.save(key, value); Object.assign(S, { layout: all.layout, placements: all.placements, scenes: all.scenes, schedules: all.schedules, rules: all.rules || [] }); }

// ------------------------------------------------------------------ ENERGIA
let energyHist = {};
// o que entra na aba Energia: aparelhos que medem (ou ar estimado) e luminárias com potência informada
const LAMP_TYPICAL = { plafon: 24, pendente: 9, spot: 7, trilho: 21, lustre: 30, fita: 14, arandela: 9, coluna: 12, abajur: 9, globo: 9, trio: 27, painel: 24, ventilador: 15, arco: 12, tripe: 12, mesa: 6, balizador: 3 };
function lampLabel(l) { const r = l.x != null && S.layout ? geoRoomAt(S.layout, l.x, l.y) : null; return { name: lampType(l.type).name, place: r ? roomName(r) : 'Sem cômodo' }; }
function energyItems() {
  const devs = S.devices.filter(d => typeof d.state?.power === 'number').map(d => ({ key: d.id, open: { type: 'device', id: d.id }, name: d.name, sub: placeName ? placeName(d) : roomName(d.room), on: !!d.state.on, w: d.state.on ? d.state.power : 0, est: !!d.state.powerEst }));
  const lamps = (S.lampLoads || []).map(l => { const lb = lampLabel(l); const sw = l.link?.dev ? dev(l.link.dev) : null;
    return { key: 'lamp:' + l.id, open: sw ? { type: 'device', id: sw.id } : null, name: lb.name, sub: lb.place, on: l.on, w: l.power, est: true, lamp: true }; });
  const pc = S.pcLoad ? [{ key: 'pc', open: { type: 'pc' }, name: 'Este computador', sub: S.pcLoad.name || 'PC', on: true, w: S.pcLoad.total, est: true, pc: true }] : [];
  return [...pc, ...devs, ...lamps];
}
async function renderEnergy() {
  for (const it of energyItems()) energyHist[it.key] = await api.getEnergy(it.key);
  const el = $('#view-energy');
  el.innerHTML = `<div class="dv en">
    <div class="dv-main">
      <div class="dv-info" data-einfo></div>
      <h1 class="dv-hello">Energia,<br><span data-ehello></span></h1>
      <div class="en-kpis" data-kpis></div>
      <div class="en-chart"><div class="en-chart-h"><b>Potência total</b><span>últimas 24 horas</span></div><canvas class="chart" data-total></canvas></div>
    </div>
    <div class="dv-side">
      <div class="dv-side-h"><h2>Por aparelho</h2><span data-ecount></span></div>
      <div class="en-list" data-rows></div>
    </div></div>`;
  renderEnergyLive();
}
function kwh24(h) { const pts = h.filter(p => p[0] > Date.now() - 864e5); let e = 0; for (let i = 1; i < pts.length; i++) { const dt = (pts[i][0] - pts[i - 1][0]) / 36e5; if (dt < 0.5) e += (pts[i][1] + pts[i - 1][1]) / 2 * dt; } return e / 1000; }
function renderEnergyLive() {
  const el = $('#view-energy'); if (!$('[data-kpis]', el)) return;
  const items = energyItems();
  const tariff = S.settings.tariff ?? 0.85;
  const now = items.reduce((a, it) => a + it.w, 0);
  const per = items.map(it => ({ it, k: kwh24(energyHist[it.key] || []) }));
  const tot = per.reduce((a, b) => a + b.k, 0);
  const nLamps = items.filter(i => i.lamp).length, nDev = items.length - nLamps;
  $('[data-einfo]', el).innerHTML = `<span>${I('bolt')}${nDev} aparelho${nDev === 1 ? '' : 's'}${nLamps ? ` · ${nLamps} luminária${nLamps === 1 ? '' : 's'}` : ''}</span><span>${I('plug')}tarifa R$ ${fmt(tariff, 2)}/kWh</span><span>${I('power')}${items.filter(i => i.on).length} consumindo agora</span>`;
  $('[data-ehello]', el).textContent = now >= 1000 ? `${fmt(now / 1000, 2)} kW agora.` : `${fmt(now, 0)} W agora.`;
  const kpi = (k, v, u, pre = '') => `<div class="en-kpi"><div class="k">${k}</div><div class="v">${pre ? `<small>${pre}</small>` : ''}${v}${u ? `<small>${u}</small>` : ''}</div></div>`;
  $('[data-kpis]', el).innerHTML = kpi('Agora', fmt(now, 0), 'W') + kpi('Últimas 24 h', fmt(tot, 2), 'kWh') + kpi('Custo 24 h', fmt(tot * tariff, 2), '', 'R$') + kpi('Projeção do mês', fmt(tot * tariff * 30, 0), '', 'R$');
  // série total por bucket de 5 min
  const buckets = new Map();
  for (const { it } of per) for (const [t, w] of energyHist[it.key] || []) { if (t < Date.now() - 864e5) continue; const b = Math.floor(t / 3e5) * 3e5; buckets.set(b, (buckets.get(b) || 0) + w); }
  drawLine($('[data-total]', el), [...buckets.entries()].sort((a, b) => a[0] - b[0]), '#ffcc00', 'W');
  const max = Math.max(0.001, ...per.map(p => p.k));
  $('[data-ecount]', el).textContent = `${per.length} no total`;
  $('[data-rows]', el).innerHTML = per.sort((a, b) => b.k - a.k || b.it.w - a.it.w).map(({ it, k }) => `<button class="en-row ${it.on ? 'on' : ''}" ${it.open ? (it.open.type === 'pc' ? 'data-pc' : `data-dev="${it.open.id}"`) : ''}>
      <div class="en-top"><div class="grow"><div class="nm">${it.lamp ? I('light') : it.pc ? I('display') : ''}${esc(it.name)}</div><div class="st">${esc(it.sub)}${it.est ? ' · estimado' : ''}</div></div><div class="en-now"><b>${fmt(it.w, 0)}</b><small>W</small></div></div>
      <div class="bar"><i style="width:${k / max * 100}%"></i></div>
      <div class="en-foot"><span>${fmt(k, 2)} kWh em 24 h</span><span>R$ ${fmt(k * tariff, 2)}</span></div></button>`).join('') || '<p class="dv-empty">Nada medindo ainda. Tomadas com medição aparecem sozinhas. Para luminárias e ar-condicionado, informe a potência.</p>';
  $('[data-rows]', el).onclick = e => { if (e.target.closest('[data-pc]')) return openPanel({ type: 'pc' }); const r = e.target.closest('[data-dev]'); if (r) openPanel({ type: 'device', id: r.dataset.dev }); };
}

function drawLine(cv, pts, color, unit) {
  if (!cv) return;
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, W, H);
  const padL = 40, padB = 20, padT = 8;
  const t1 = Date.now(), t0 = t1 - 864e5;
  const max = Math.max(10, ...pts.map(p => p[1])) * 1.15;
  const cs = getComputedStyle(document.documentElement); c.font = '11px Inter'; c.fillStyle = cs.getPropertyValue('--tx3'); c.strokeStyle = cs.getPropertyValue('--sep2'); c.lineWidth = 1;
  for (let i = 0; i <= 3; i++) { const y = padT + (H - padT - padB) * i / 3; c.beginPath(); c.moveTo(padL, y); c.lineTo(W, y); c.stroke(); c.fillText(`${Math.round(max * (1 - i / 3))}${i === 3 ? '' : ''}`, 4, y + 4); }
  for (let h = 0; h <= 24; h += 6) { const x = padL + (W - padL) * h / 24; const d = new Date(t0 + h * 36e5); c.fillText(d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), Math.min(x, W - 32), H - 4); }
  if (pts.length < 2) { c.fillStyle = cs.getPropertyValue('--tx3'); c.fillText('Coletando dados… (1 ponto por minuto)', padL + 10, H / 2); return; }
  const X = t => padL + (W - padL) * (t - t0) / 864e5, Y = v => padT + (H - padT - padB) * (1 - v / max);
  const g = c.createLinearGradient(0, padT, 0, H - padB); g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
  c.beginPath(); c.moveTo(X(pts[0][0]), H - padB); for (const [t, v] of pts) c.lineTo(X(t), Y(v)); c.lineTo(X(pts[pts.length - 1][0]), H - padB); c.fillStyle = g; c.fill();
  c.beginPath(); pts.forEach(([t, v], i) => (i ? c.lineTo(X(t), Y(v)) : c.moveTo(X(t), Y(v)))); c.strokeStyle = color; c.lineWidth = 1.6; c.stroke();
}

// ------------------------------------------------------------------ PLANTA
let planDirty = false, planSel = null, planTab = 'devices';
const LINKABLE = d => d.type !== 'ac' && d.type !== 'tv';
// ---------- teclas ligadas (interruptor paralelo virtual) ----------
const keysOf = d => (d.state?.channels?.length > 1 ? d.state.channels.map((c, i) => ({ dev: d.id, ch: c.code, name: c.name || `Tecla ${i + 1}` })) : [{ dev: d.id, ch: null, name: d.name }]);
const sameKey = (a, b) => a && b && a.dev === b.dev && (a.ch || null) === (b.ch || null);
function keyLabel(k) { const d = dev(k.dev); if (!d) return 'Aparelho removido'; const kk = keysOf(d).find(x => sameKey(x, k)); return d.state?.channels?.length > 1 ? `${d.name} · ${kk?.name || k.ch}` : d.name; }
async function saveLinks(list) { S.links = list; const all = await api.save('links', list); if (all?.links) S.links = all.links; }
// cada tecla deste aparelho: escolher qual tecla de outro interruptor muda junto
function renderKeyLinks(box, devId) {
  const d = dev(devId); if (!d) return;
  const links = S.links || [];
  const others = S.devices.filter(x => LINKABLE(x));
  const kv = x => `${x.dev}#${x.ch || ''}`;
  const keyName = (o, x) => (o.state?.channels?.length > 1 ? `${o.name} · ${x.name}` : o.name);
  const ACTS = [['same', 'Liga e desliga'], ['off', 'Só desliga'], ['on', 'Só liga']];
  box.innerHTML = keysOf(d).map(k => {
    const gl = links.find(l => l.group && sameKey(l.a, k));
    const out = links.find(l => !l.group && sameKey(l.a, k)) || links.find(l => !l.group && l.mode !== 'follow' && sameKey(l.b, k));
    const target = out ? (sameKey(out.a, k) ? out.b : out.a) : null;
    const follows = links.filter(l => !l.group && l.mode === 'follow' && sameKey(l.b, k));
    const inGroups = links.filter(l => l.group?.some(t => sameKey(t, k)));
    const kid = kv(k);
    const act = gl ? (gl.act || 'same') : null;
    return `<div class="lk-row" data-key="${esc(kid)}">
      <div class="lk-top"><span class="lk-name">${I('light')}<b>${esc(k.name)}</b></span><span class="lk-arrow">${gl ? (act === 'off' ? 'desliga' : act === 'on' ? 'liga' : 'comanda') : 'também liga'}</span></div>
      <select data-lk="${esc(kid)}" class="lk-sel"><option value="">Nenhuma outra tecla</option>
        <option value="__group" ${gl ? 'selected' : ''}>Um grupo de luzes…</option>
        ${others.map(o => { const ks = keysOf(o).filter(x => !sameKey(x, k)); if (!ks.length) return '';
          const opts = ks.map(x => `<option value="${esc(kv(x))}" ${sameKey(x, target) ? 'selected' : ''}>${esc(keyName(o, x))}</option>`).join('');
          return o.state?.channels?.length > 1 ? `<optgroup label="${esc(o.name)}${o.id === d.id ? ' (este)' : ''}">${opts}</optgroup>` : opts; }).join('')}</select>
      ${gl ? `<div class="seg lk-mode" data-lkact="${gl.id}">${ACTS.map(([v, n]) => `<button data-v="${v}" class="${act === v ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="lk-group" data-lkgroup="${gl.id}">${(() => {
          const pick = (x, label) => { const on = gl.group.some(t => sameKey(t, x)); return `<button class="lk-pick ${on ? 'on' : ''}" data-gk="${esc(kv(x))}" aria-pressed="${on}">${I(on ? 'check' : 'light')}<span>${esc(label)}</span></button>`; };
          const multi = others.filter(o => o.state?.channels?.length > 1), single = others.filter(o => !(o.state?.channels?.length > 1) && o.id !== d.id);
          return multi.map(o => { const ks = keysOf(o).filter(x => !sameKey(x, k)); return ks.length ? `<div class="lk-gdev"><span class="lk-gname">${esc(o.name)}${o.id === d.id ? ' (este)' : ''}</span><div class="lk-gkeys">${ks.map(x => pick(x, x.name)).join('')}</div></div>` : ''; }).join('')
            + (single.length ? `<div class="lk-gdev"><span class="lk-gname">Outros aparelhos</span><div class="lk-gkeys">${single.map(o => pick(keysOf(o)[0], o.name)).join('')}</div></div>` : '');
        })()}</div>
        <p class="lk-hint">${!gl.group.length ? 'Toque nas teclas que fazem parte do grupo.' : act === 'off' ? `Apertar <b>${esc(k.name)}</b> para qualquer lado apaga as ${gl.group.length} luzes do grupo.` : act === 'on' ? `Apertar <b>${esc(k.name)}</b> para qualquer lado acende as ${gl.group.length} luzes do grupo.` : `Quando <b>${esc(k.name)}</b> ligar ou desligar, as ${gl.group.length} luzes do grupo fazem o mesmo.`}</p>` : ''}
      ${out ? `<div class="seg lk-mode" data-lkmode="${out.id}">${[['sync', 'Nos dois sentidos'], ['follow', sameKey(out.a, k) ? 'Só daqui para lá' : 'Só de lá para cá']].map(([v, n]) => `<button data-v="${v}" class="${(out.mode || 'sync') === v ? 'on' : ''}">${n}</button>`).join('')}</div>
        <p class="lk-hint">${(out.mode || 'sync') === 'sync' ? `Apertar qualquer uma das duas, na parede ou no app, muda as duas juntas.` : `Quando <b>${esc(keyLabel(out.a))}</b> mudar, <b>${esc(keyLabel(out.b))}</b> muda junto.`}</p>` : ''}
      ${follows.map(l => `<p class="lk-hint">Segue <b>${esc(keyLabel(l.a))}</b> · <button class="link-btn" data-lkdel="${l.id}">remover</button></p>`).join('')}
      ${inGroups.map(l => `<p class="lk-hint">Faz parte do grupo de <b>${esc(keyLabel(l.a))}</b> · <button class="link-btn" data-lkout="${l.id}" data-k="${esc(kid)}">tirar do grupo</button></p>`).join('')}
    </div>`;
  }).join('') + `<div class="mini-info">Funciona com o SmartHouse aberto ou na bandeja e leva cerca de 1 segundo. Para que a luz acenda mesmo com o PC desligado, a ligação precisa estar na fiação.</div>`;
  const parse = v => { const [dv, ch] = v.split('#'); return { dev: dv, ch: ch || null }; };
  for (const sel of box.querySelectorAll('[data-lk]')) sel.onchange = async () => {
    const k = parse(sel.dataset.lk);
    let list = (S.links || []).filter(l => !(sameKey(l.a, k) || (!l.group && l.mode !== 'follow' && sameKey(l.b, k))));
    if (sel.value === '__group') list.push({ id: 'lk' + Date.now().toString(36), a: k, group: [], act: 'off', enabled: true });
    else if (sel.value) { const t = parse(sel.value); list = list.filter(l => !(sameKey(l.a, t) && sameKey(l.b, k)) && !(sameKey(l.a, k) && sameKey(l.b, t))); list.push({ id: 'lk' + Date.now().toString(36), a: k, b: t, mode: 'sync', enabled: true }); }
    await saveLinks(list); renderKeyLinks(box, devId); toast(sel.value === '__group' ? 'Escolha as luzes do grupo' : sel.value ? 'Teclas ligadas' : 'Ligação removida');
  };
  for (const sg of box.querySelectorAll('[data-lkmode]')) sg.onclick = async e => { const b = e.target.closest('[data-v]'); if (!b) return; await saveLinks((S.links || []).map(l => l.id === sg.dataset.lkmode ? { ...l, mode: b.dataset.v } : l)); renderKeyLinks(box, devId); };
  for (const sg of box.querySelectorAll('[data-lkact]')) sg.onclick = async e => { const b = e.target.closest('[data-v]'); if (!b) return; await saveLinks((S.links || []).map(l => l.id === sg.dataset.lkact ? { ...l, act: b.dataset.v } : l)); renderKeyLinks(box, devId); };
  for (const gb of box.querySelectorAll('[data-lkgroup]')) gb.onclick = async e => {
    const b = e.target.closest('[data-gk]'); if (!b) return; const t = parse(b.dataset.gk);
    await saveLinks((S.links || []).map(l => l.id !== gb.dataset.lkgroup ? l : { ...l, group: l.group.some(x => sameKey(x, t)) ? l.group.filter(x => !sameKey(x, t)) : [...l.group, t] }));
    renderKeyLinks(box, devId);
  };
  for (const b of box.querySelectorAll('[data-lkdel]')) b.onclick = async () => { await saveLinks((S.links || []).filter(l => l.id !== b.dataset.lkdel)); renderKeyLinks(box, devId); };
  for (const b of box.querySelectorAll('[data-lkout]')) b.onclick = async () => { const t = parse(b.dataset.k); await saveLinks((S.links || []).map(l => l.id === b.dataset.lkout ? { ...l, group: l.group.filter(x => !sameKey(x, t)) } : l)); renderKeyLinks(box, devId); };
}
// luminária ligada a um interruptor de várias teclas, mas sem a tecla escolhida
const needsKey = l => !!l.link?.dev && !l.link.ch && (S.devices.find(d => d.id === l.link.dev)?.state?.channels?.length || 0) > 1;
function lampLinkName(l) {
  if (!l.link?.dev) return '';
  const d = S.devices.find(x => x.id === l.link.dev); if (!d) return 'Aparelho removido';
  const ch = l.link.ch && d.state?.channels?.length > 1 ? d.state.channels.find(c => c.code === l.link.ch) : null;
  return d.name + (ch ? ' · ' + (ch.name || ch.code) : '');
}
// histórico (desfazer/refazer) e salvamento automático da planta
let planHist = [], planFuture = [], planHistT = null, planSaveT = null, planSaveState = 'saved';
function planStatus(st) {
  planSaveState = st; const el = $('[data-pstatus]'); if (!el) return;
  el.className = 'plan-status ' + st;
  el.innerHTML = st === 'saving' ? `<i class="spin"></i>Salvando…` : st === 'pending' ? `${I('edit')}Editando…` : st === 'error' ? `${I('close')}Não salvou` : `${I('check')}Salvo`;
}
function planUndoUI() { const u = $('[data-undo]'), r = $('[data-redo]'); if (u) u.disabled = planHist.length < 2; if (r) r.disabled = !planFuture.length; }
function planChanged() {
  planDirty = true; planStatus('pending');
  clearTimeout(planHistT); planHistT = setTimeout(() => {
    const snap = editor.snapshot();
    if (planHist[planHist.length - 1] !== snap) { planHist.push(snap); if (planHist.length > 80) planHist.shift(); planFuture = []; }
    planUndoUI();
  }, 350);
  clearTimeout(planSaveT); planSaveT = setTimeout(autoSavePlan, 1200);
}
async function autoSavePlan() {
  if (!editor || !planDirty) return;
  planStatus('saving');
  try {
    await api.save('layout', editor.saveLayout);
    const all = await api.save('placements', editor.placements);
    Object.assign(S, { layout: all.layout, placements: all.placements, devices: all.devices });
    planDirty = false; if (S.view === 'home') house.setLayout(S.layout, S.placements, S.devices); planStatus('saved'); // a Minha casa é remontada ao voltar para ela
  } catch (e) { planStatus('error'); toast('Não foi possível salvar a planta: ' + cleanErr(e), 'error'); }
}
function planUndo(redo) {
  if (redo) { if (!planFuture.length) return; const n = planFuture.pop(); planHist.push(n); editor.restore(n); }
  else { if (planHist.length < 2) return; planFuture.push(planHist.pop()); editor.restore(planHist[planHist.length - 1]); }
  planDirty = true; planStatus('pending'); clearTimeout(planSaveT); planSaveT = setTimeout(autoSavePlan, 900);
  planUndoUI(); renderPlanSide(); toast(redo ? 'Refeito' : 'Desfeito');
}
function renderPlan() {
  const el = $('#view-plan');
  if (!editor) {
    const tool = (t, ic, n, k) => `<button data-tool="${t}" title="${n} (tecla ${k})">${I(ic)}<span>${n}</span><kbd>${k}</kbd></button>`;
    el.innerHTML = `<div class="plan-main" id="plan-3d">
      <div class="plan-tools">
        ${tool('select', 'cursor', 'Selecionar', 'V')}<i class="sep"></i>${tool('wall', 'wall', 'Parede', 'P')}${tool('room', 'square', 'Cômodo', 'C')}${tool('divider', 'divider', 'Divisória', 'D')}<i class="sep"></i>${tool('door', 'door', 'Porta', 'J')}${tool('window', 'window', 'Janela', 'N')}<i class="sep"></i>${tool('paint', 'brush', 'Pintar', 'B')}
      </div>
      <div class="plan-view">
        <div class="seg" data-pview><button data-v="3d" class="on">3D</button><button data-v="2d">2D</button></div>
        <div class="seg" data-wmode title="Como as paredes aparecem enquanto você constrói"><button data-v="cut" class="on" title="As paredes viradas para você abaixam; janelas e portas ficam à vista">Cortadas</button><button data-v="half">Meia</button><button data-v="low" title="Paredes rentes (janelas e portas ficam escondidas)">Baixas</button><button data-v="full">Inteiras</button></div>
      </div>
      <div class="plan-save">
        <div class="plan-pill"><button data-undo title="Desfazer (Ctrl+Z)">${I('back')}</button><button data-redo title="Refazer (Ctrl+Y)" class="flip">${I('back')}</button></div>
        <span class="plan-status saved" data-pstatus></span>
      </div>
      <div class="plan-zoom plan-pill"><button data-zin title="Aproximar">${I('plus')}</button><button data-fit title="Ver a casa inteira">${I('focus')}</button><button data-zout title="Afastar">${I('minus')}</button></div>
      <div class="plan-hint" data-hint></div></div>
      <div class="plan-side" id="plan-side"></div>`;
    editor = window.__editor = new PlanBuilder($('#plan-3d'), {
      onSelect: s => { planSel = s; if (s?.type === 'lamp') planTab = 'lights'; else if (s?.type === 'furniture') planTab = 'furniture'; else if (s?.type === 'device') planTab = 'devices'; renderPlanSide(); },
      onChange: () => {
        planChanged();
        if ($('#plan-side')?.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
        renderPlanSide();
      },
    });
    const HINTS = {
      select: '<b>Clique</b> para escolher · <b>arraste</b> para mover · <b>Shift + clique</b> junta paredes · arrastar no vazio ou botão direito <b>gira</b> · Shift + arrastar move a vista',
      wall: '<b>Clique</b> onde a parede começa e onde termina; continua da última ponta. <b>Shift</b> trava em 45° · <b>Alt</b> = 5 cm · <b>Esc</b> termina · botão direito gira',
      room: '<b>Arraste</b> no chão para criar um cômodo retangular (cada quadradinho = 25 cm). Paredes em comum não se repetem.',
      divider: 'Divisória: linha sem parede que separa áreas do mesmo ambiente (ex.: sala e jantar). <b>Clique</b> no começo e no fim.',
      door: '<b>Clique numa parede</b> para colocar uma porta. Depois arraste para deslizar pela parede.',
      window: '<b>Clique numa parede</b> para colocar uma janela. Ajuste peitoril e altura na lateral.',
      paint: 'Escolha o acabamento na lateral e <b>clique no lado da parede</b> (ou no piso). <b>Shift + clique</b> pinta o cômodo inteiro. Arraste fora das paredes para girar.',
    };
    const origSetTool = editor.setTool.bind(editor);
    editor.setTool = t => { origSetTool(t); for (const x of el.querySelectorAll('[data-tool]')) x.classList.toggle('on', x.dataset.tool === t); $('[data-hint]', el).innerHTML = HINTS[t]; renderPlanSide(); };
    editor.onTool = t => editor.setTool(t);
    el.querySelector('.plan-tools').onclick = e => { const b = e.target.closest('[data-tool]'); if (b) editor.setTool(b.dataset.tool); };
    el.querySelector('[data-pview]').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; editor.set2D(b.dataset.v === '2d'); for (const x of b.parentNode.children) x.classList.toggle('on', x === b); };
    el.querySelector('[data-wmode]').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; editor.setWallMode(b.dataset.v); for (const x of b.parentNode.children) x.classList.toggle('on', x === b); };
    el.querySelector('.plan-zoom').onclick = e => el.querySelector('.plan-save').onclick(e);
    el.querySelector('.plan-save').onclick = e => {
      if (e.target.closest('[data-undo]')) planUndo(false);
      else if (e.target.closest('[data-redo]')) planUndo(true);
      else if (e.target.closest('[data-fit]')) editor.fit();
      else if (e.target.closest('[data-zin]')) editor.zoomBy(1.25);
      else if (e.target.closest('[data-zout]')) editor.zoomBy(0.8);
    };
    window.addEventListener('keydown', e => {
      if (S.view !== 'plan' || !(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); planUndo(false); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); planUndo(true); }
    });
    editor.house.setTheme(window.__resolveTheme()); editor.house.setNightMode('day', false);
    editor.house.setQuality(getQuality());
    editor.house.setOptions({ style: (S.settings || {}).style3d === 'classic' ? 'classic' : 'maquete' });
    editor.house.setLocation((S.settings || {}).location || S.location);
    try { editor.setTool('select'); } catch (e) { console.error(e); }
  }
  requestAnimationFrame(() => {
    if (!planDirty) { // não descarta uma edição que ainda está sendo salva
      editor.load(S.layout, S.placements, S.devices); planHist = [editor.snapshot()]; planFuture = []; planUndoUI(); planStatus('saved'); renderPlanSide();
    }
    if (S.view === 'plan') editor.start();
  });
}
async function savePlan() { planDirty = true; await autoSavePlan(); }
const HEIGHTS = [[0, 'Chão'], [0.3, 'Tomada baixa'], [1.1, 'Bancada'], [1.2, 'Interruptor'], [2.2, 'Ar / alto']];
const WALL_H = [[null, 'Inteira'], [1.1, 'Meia parede'], [0.9, 'Mureta']];
const finishChips = (cur, attr) => `<div class="chips fin-chips" ${attr}>${WALL_FINISHES.map(([v, l]) => `<button data-v="${v}" class="${(cur?.finish || 'paint') === v ? 'on' : ''}"><i class="fin-dot fin-${v}"></i>${l}</button>`).join('')}</div>`;
const colorSw = (cur, attr, list = WALL_COLORS, none) => `<div class="swatches" ${attr}>${none ? `<button data-c="" title="Padrão" class="none ${!cur ? 'on' : ''}"></button>` : ''}${list.filter(Boolean).map(c => `<button data-c="${c}" class="${cur === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div>`;
function sideBlock(label, side, f) {
  return `<div class="ps-side"><div class="ps-sh">${esc(label)}</div>${finishChips(f, `data-wfin="${side}"`)}${colorSw(f?.color, `data-wcol="${side}"`, WALL_COLORS, true)}</div>`;
}
function renderPlanSide() {
  const el = $('#plan-side'); if (!el || !editor) return;
  const L = editor.layout;
  let html = '';
  const s = planSel;
  if (s?.type === 'wall') {
    const w = L.walls2.find(w => w.id === s.id);
    if (w) {
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), sides = wallSides(L, w), div = w.kind === 'divider';
      const nm = r => r ? `Lado: ${r.name}` : 'Lado de fora';
      html += `<h3>${div ? 'Divisória' : 'Parede'}</h3>
        <div class="seg" data-wkind style="margin-bottom:12px"><button data-v="wall" class="${div ? '' : 'on'}">Parede</button><button data-v="divider" class="${div ? 'on' : ''}" title="Linha sem parede: une as áreas num ambiente só">Divisória</button></div>
        <div class="field-row"><div class="field"><label>Comprimento (m)</label><input type="number" step="0.05" min="0.1" data-wlen value="${Math.round(len * 100) / 100}"></div>
        ${div ? '' : `<div class="field"><label>Espessura (cm)</label><input type="number" step="1" min="5" max="40" data-wt value="${Math.round((w.t || DEF_T) * 100)}"></div>`}</div>
        ${div ? `<p class="sub" style="font-size:12px;margin:0 0 12px;line-height:1.5">As áreas dos dois lados viram um ambiente só no app (ex.: “Sala + Jantar”), cada uma com o seu piso e os seus aparelhos.</p>` : `
        <div class="field"><label>Altura</label><div class="chips" data-wh2>${WALL_H.map(([v, l]) => `<button data-v="${v ?? ''}" class="${(w.h ?? null) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${sideBlock(nm(sides.a), 'fa', w.fa)}${sideBlock(nm(sides.b), 'fb', w.fb)}`}
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-wsplit>Dividir ao meio</button><button class="btn sm danger" data-del>${I('trash')}Excluir</button></div>
        <p class="sub" style="font-size:12px;margin:12px 0 22px;line-height:1.5">Arraste a parede (ou a <b>alça azul do meio</b>) para mover ela em paralelo: as paredes vizinhas continuam retas e só esticam. As <b>bolinhas</b> das pontas mexem só aquela ponta desta parede. Para mover uma quina inteira, selecione as duas paredes com <b>Shift + clique</b> e arraste a bolinha laranja.</p>`;
    }
  } else if (s?.type === 'walls') {
    const ws = L.walls2.filter(w => s.ids.includes(w.id)), div = ws.every(w => w.kind === 'divider');
    html += `<h3>${ws.length} paredes selecionadas</h3>
      <p class="sub" style="font-size:12px;margin:0 0 12px;line-height:1.5">Arraste qualquer uma delas para mover todas juntas. A <b>bolinha laranja</b> fica na quina entre duas selecionadas e move as duas pontas juntas. <b>Shift + clique</b> adiciona ou tira paredes da seleção.</p>
      <div class="seg" data-wskind style="margin-bottom:12px"><button data-v="wall" class="${div ? '' : 'on'}">Parede</button><button data-v="divider" class="${div ? 'on' : ''}">Divisória</button></div>
      <button class="btn sm danger" data-del>${I('trash')}Excluir ${ws.length} paredes</button><div style="height:22px"></div>`;
  } else if (s?.type === 'opening') {
    const o = L.openings.find(o => o.id === s.id);
    if (o) {
      const t = o.type || 'door';
      html += `<h3>${{ door: 'Porta', window: 'Janela', arch: 'Arco', open: 'Passagem' }[t]}</h3>
      <div class="field"><label>Tipo</label><div class="chips" data-otype>${[['door', 'Porta'], ['window', 'Janela'], ['arch', 'Arco'], ['open', 'Passagem livre']].map(([v, l]) => `<button data-v="${v}" class="${t === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${t === 'door' ? `<div class="field"><label>Modelo</label><div class="chips" data-ostyle>${[['', 'Uma folha'], ['double', 'Duas folhas']].map(([v, l]) => `<button data-v="${v}" class="${(o.style || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
      ${t === 'window' ? `<div class="field"><label>Modelo</label><div class="chips" data-ostyle>${[['', 'Duas folhas'], ['single', 'Uma folha']].map(([v, l]) => `<button data-v="${v}" class="${(o.style || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
      <div class="field-row"><div class="field"><label>Largura (m)</label><input type="number" step="0.05" min="0.3" max="8" data-ow value="${o.w}"></div>
        ${t === 'door' ? `<div class="field"><label>Altura (m)</label><input type="number" step="0.05" min="1.6" max="3" data-otop value="${o.top ?? 2.1}"></div>` : ''}</div>
      ${t === 'window' ? `<div class="field"><label>Cortina</label><div class="chips" data-ocurtain>${[['open', 'Aberta'], ['closed', 'Fechada'], ['none', 'Sem cortina']].map(([v, l]) => `<button data-v="${v}" class="${(o.curtain || ((sd => !sd.a || !sd.b)(wallSides(L, L.walls2.find(w => w.id === o.wall))) ? 'open' : 'none')) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
      ${t === 'window' ? `<div class="field-row"><div class="field"><label>Peitoril (m)</label><input type="number" step="0.05" min="0" max="2.4" data-osill value="${o.sill ?? 1}"></div><div class="field"><label>Topo (m)</label><input type="number" step="0.05" min="0.3" max="2.8" data-otop value="${o.top ?? 2.1}"></div></div>` : ''}
      ${t === 'door' ? (() => { const w = L.walls2.find(w => w.id === o.wall), sd = w ? wallSides(L, w) : {}, to = o.swing || (o.style === 'double' ? 'a' : (o.hinge ? 'b' : 'a'));
        const nm = r => r ? r.name : 'Lado de fora';
        return `<div class="field"><label>Abre para</label><div class="chips" data-oswing><button data-v="a" class="${to === 'a' ? 'on' : ''}">${esc(nm(sd.a))}</button><button data-v="b" class="${to === 'b' ? 'on' : ''}">${esc(nm(sd.b))}</button></div></div>
        ${o.style !== 'double' ? `<div class="field"><label>Maçaneta</label><div class="chips" data-ohandle><button data-v="0" class="${!o.hinge ? 'on' : ''}">De um lado</button><button data-v="1" class="${o.hinge ? 'on' : ''}">Do outro lado</button></div><div class="hint">A dobradiça fica no lado oposto ao da maçaneta. Veja o resultado na casa 3D.</div></div>` : ''}`; })() : ''}
      <button class="btn sm danger" data-del>${I('trash')}Fechar vão</button>
      <p class="sub" style="font-size:12px;margin:12px 0 22px;line-height:1.5">Arraste no 3D para deslizar pela parede, ou leve até outra parede.</p>`;
    }
  } else if (s?.type === 'room') {
    const r = L.rooms.find(r => r.id === s.id), m = L.roomMeta.find(m => m.id === s.id);
    if (r && m) {
      const grp = r.group, gname = grp ? (L.groups[grp]?.name || r.name) : null;
      const walls = editor.roomWalls(r.id), f0 = walls.map(w => wallSides(L, w).a?.id === r.id ? w.fa : w.fb)[0];
      html += `<h3>${grp ? 'Área de ambiente unido' : 'Cômodo'} <span class="ps-area">${fmt(r.area, 1)} m²</span></h3>
        ${grp ? `<div class="field"><label>Nome do ambiente inteiro</label><input data-gname value="${esc(gname)}"></div>` : ''}
        <div class="field"><label>${grp ? 'Nome desta área (ex.: Jantar)' : 'Nome'}</label><input data-rname value="${esc(r.name)}"></div>
        <div class="field"><label>Piso</label><select data-floor>${FLOORS.map(([v, l]) => `<option value="${v}" ${(m.floor || defaultFloor(r.name)) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${colorSw(m.floorColor, 'data-ftint', FLOOR_TINTS, true)}</div>
        ${walls.length ? `<div class="field"><label>Paredes de dentro (${walls.length})</label>${finishChips(f0, 'data-rfin')}${colorSw(f0?.color, 'data-rcol', WALL_COLORS, true)}</div>` : ''}
        <p class="sub" style="font-size:12px;margin:0 0 10px;line-height:1.5">${I('cursor')} Arraste o piso deste cômodo para mover ele inteiro, com móveis, luzes e aparelhos.</p>
        <button class="btn sm danger" data-del>${I('trash')}Excluir cômodo</button>
        <p class="sub" style="font-size:12px;margin:12px 0 22px;line-height:1.5">${grp ? 'Para separar, selecione a divisória e troque para “Parede”.' : 'Para unir com o cômodo vizinho, selecione a parede entre eles e troque para “Divisória”.'}</p>`;
    }
  } else if (s?.type === 'furniture') {
    const f = L.furniture.find(f => f.id === s.id), c = f && byType(f.type);
    if (f) html += `<h3>${esc(c?.name || 'Móvel')}</h3>
      <div class="field-row"><div class="field"><label>Largura (m)</label><input type="number" step="0.05" min="0.1" data-fw value="${f.w}"></div><div class="field"><label>Profundidade (m)</label><input type="number" step="0.05" min="0.1" data-fd value="${f.d}"></div></div>
      <div class="field"><label>Rotação: <b data-rotv>${f.rot || 0}°</b> <span style="color:var(--tx3)">(tecla R gira 45°)</span></label>
        <div style="display:flex;gap:6px;align-items:center"><button class="btn sm" data-rot="-90">↺ 90°</button><input type="range" min="0" max="345" step="15" value="${f.rot || 0}" data-rot-range style="flex:1"><button class="btn sm" data-rot="90">↻ 90°</button></div></div>
      <div class="field"><label>Cor</label><div class="swatches" data-swatch>${SWATCHES.map(([hex, n]) => `<button title="${n}" data-c="${hex}" class="${f.color === hex ? 'on' : ''}" style="background:${hex}"></button>`).join('')}</div></div>
      <div style="display:flex;gap:6px"><button class="btn sm" data-dup>Duplicar</button><button class="btn sm danger" data-del>${I('trash')}Excluir</button></div><div style="height:22px"></div>`;
  } else if (s?.type === 'lamp') {
    const l = L.lights.find(l => l.id === s.id), t = l && lampType(l.type);
    if (l) {
      const ld = l.link?.dev && S.devices.find(d => d.id === l.link.dev);
      const chans = ld?.state?.channels?.length > 1 ? ld.state.channels : null;
      html += `<h3>${I('light')} ${esc(t.name)}</h3>
      <div class="field"><label>Tipo de luminária</label><select data-ltype>${LAMPS.map(x => `<option value="${x.type}" ${x.type === l.type ? 'selected' : ''}>${x.name}</option>`).join('')}</select><div class="hint">${esc(t.hint)}</div></div>
      <div class="field"><label>Acende com (interruptor e tecla)</label><select data-ldev class="${needsKey(l) || !l.link?.dev ? 'warn' : ''}">
        <option value="">Escolha a tecla…</option>
        ${S.devices.filter(LINKABLE).map(d => d.state?.channels?.length > 1
          ? `<optgroup label="${esc(d.name)}">${needsKey(l) && l.link.dev === d.id ? `<option value="${d.id}" selected>${esc(d.name)} · qual tecla?</option>` : ''}${d.state.channels.map((c, i) => `<option value="${d.id}#${c.code}" ${l.link?.dev === d.id && l.link?.ch === c.code ? 'selected' : ''}>${esc(d.name)} · ${esc(c.name || `Tecla ${i + 1}`)}</option>`).join('')}</optgroup>`
          : `<option value="${d.id}" ${l.link?.dev === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
        ${chans ? `<div class="chips" data-lch style="margin-top:8px">${chans.map((c, i) => `<button data-v="${c.code}" class="${l.link.ch === c.code ? 'on' : ''}">${esc(c.name || `Tecla ${i + 1}`)}</button>`).join('')}</div>` : ''}</div>
      ${!l.link?.dev ? `<div class="hint" style="color:var(--orange);margin:-4px 0 12px">Sem interruptor, a luminária fica sempre apagada no 3D.</div>` : needsKey(l) ? `<div class="hint" style="color:var(--orange);margin:-4px 0 12px">Escolha a tecla. Sem ela, a luminária acende com qualquer tecla deste interruptor.</div>` : ''}
      <div class="field"><label>${I('bolt')} Potência (para o consumo)</label><div class="lw-row"><input type="number" min="0" max="2000" step="1" data-lwatts value="${l.watts || ''}" placeholder="—"><small>W</small><button class="btn sm" data-lwtyp="${LAMP_TYPICAL[l.type] || 9}">LED típico: ${LAMP_TYPICAL[l.type] || 9} W</button></div>
        <div class="hint">${l.watts ? `Acesa, gasta ~${l.watts} W. Aparece na aba Energia.` : 'Veja na lâmpada ou na caixa (ex.: 9 W, 18 W). Some todas as lâmpadas desta luminária.'}</div></div>
      <div class="field"><label>Cor da luz</label><div class="chips" data-ltemp>${TEMPS.map(([v, n, c]) => `<button data-v="${v}" class="${(l.temp || 'quente') === v ? 'on' : ''}"><i class="temp-dot" style="background:${c}"></i>${n}</button>`).join('')}</div></div>
      ${t.w ? `<div class="field"><label>Comprimento (m)</label><input type="number" step="0.1" min="0.3" max="8" data-lw value="${l.w || t.w}"></div>` : ''}
      ${t.w ? `<div class="field"><label>Direção <span style="color:var(--tx3)">(tecla R gira 45°)</span></label><div style="display:flex;gap:6px"><button class="btn sm" data-lrot="-45">↺ 45°</button><button class="btn sm" data-lrot="45">↻ 45°</button><button class="btn sm" data-lrot="90">↻ 90°</button></div></div>` : ''}
      ${t.mount === 'table' ? `<div class="field"><label>Altura do móvel embaixo (m)</label><input type="number" step="0.05" min="0" max="1.5" data-lz value="${l.z ?? (l.type === 'mesa' ? 0.75 : 0.55)}"></div>` : ''}
      <div style="display:flex;gap:6px"><button class="btn sm" data-ldup>Duplicar</button><button class="btn sm danger" data-del>${I('trash')}Excluir</button></div>
      <p class="sub" style="font-size:12px;margin:12px 0 22px;line-height:1.5">Luminárias novas já vêm ligadas à última tecla escolhida.</p>`;
    }
  } else if (s?.type === 'device') {
    const dv = S.devices.find(d => d.id === s.id), p = editor.placements[s.id];
    if (dv && p) html += `<h3>${esc(dv.name)}</h3>
      <div class="field"><label>Altura do chão (m)</label><input type="number" step="0.05" min="0" max="3" data-dz value="${p.z ?? 0}">
        <div class="chips" style="margin-top:6px" data-zpre>${HEIGHTS.map(([v, l]) => `<button data-v="${v}" class="${Math.abs((p.z ?? 0) - v) < 0.01 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="row" style="padding:4px 0 10px"><span class="lbl">Preso na parede</span><span class="toggle sm ${p.wall ? 'on' : ''}" data-dwall></span></div>
      ${p.wall ? `<div class="field"><label>Estilo na parede</label>${plateStyleChips(dv, p.style)}</div>` : ''}
      ${LINKABLE(dv) ? (mine => dv.state?.channels?.length > 1
        ? `<div class="field"><label>${I('light')} Luminárias por tecla</label>${dv.state.channels.map((c, i) => { const n = mine.filter(l => l.link.ch === c.code).length; return `<div class="row" style="padding:5px 0"><span class="lbl">${esc(c.name || `Tecla ${i + 1}`)}</span><span style="color:${n ? 'var(--tx2)' : 'var(--tx3)'};font-size:12px">${n ? `${n} luminária(s)` : 'nenhuma'}</span></div>`; }).join('')}
          ${mine.some(l => !l.link.ch) ? `<div class="hint" style="color:var(--orange)">${mine.filter(l => !l.link.ch).length} luminária(s) sem tecla: acendem com qualquer tecla. Toque nelas e escolha a tecla.</div>` : ''}</div>`
        : `<p class="sub" style="font-size:12px;margin:0 0 10px">${mine.length ? `${I('light')} ${mine.length} luminária(s) acendem com este aparelho.` : 'Nenhuma luminária ligada a este aparelho. Use a aba <b>Luzes</b> para colocar as lâmpadas que ele acende.'}</p>`)(L.lights.filter(l => l.link?.dev === dv.id)) : ''}
      <button class="btn sm danger" data-del>${I('close')}Tirar do mapa</button><div style="height:22px"></div>`;
  }
  if (html) html = `<div class="ps-card"><button class="ps-done" data-done>Concluído</button>${html}</div>`;
  // pincel: escolha do acabamento
  if (!s && editor.tool === 'paint') {
    const P = editor.paint;
    html += `<div class="ps-card"><h3>${I('brush')} Pintar</h3>
      <div class="seg" data-ptarget style="margin-bottom:12px"><button data-v="wall" class="${P.target === 'wall' ? 'on' : ''}">Paredes</button><button data-v="floor" class="${P.target === 'floor' ? 'on' : ''}">Pisos</button></div>
      ${P.target === 'wall' ? `${finishChips(P, 'data-pfin')}${colorSw(P.color, 'data-pcol', WALL_COLORS, true)}`
        : `<div class="chips" data-pfloor>${FLOORS.map(([v, l]) => `<button data-v="${v}" class="${P.finish === v ? 'on' : ''}">${l}</button>`).join('')}</div>${colorSw(P.color, 'data-pcol', FLOOR_TINTS, true)}`}
      <p class="sub" style="font-size:12px;margin:12px 0 4px;line-height:1.5">${P.target === 'wall' ? 'Clique no lado da parede que quer pintar. <b>Shift + clique</b> pinta todas as paredes daquele cômodo.' : 'Clique no piso do cômodo ou da área.'}</p></div>`;
  }
  // primeiros passos (some quando a planta estiver completa)
  if (!s && editor.tool !== 'paint') {
    const steps = [
      ['room', 'square', 'Erga as paredes', 'Cômodo (C) arrastando, ou Parede (P) ponto a ponto', L.rooms.length > 0],
      ['door', 'door', 'Abra portas e janelas', 'Porta (J) e Janela (N): clique na parede', L.openings.length > 0],
      ['devices', 'plug', 'Posicione os aparelhos', 'Clique ou arraste da lista abaixo', Object.keys(editor.placements).length > 0],
      ['lights', 'light', 'Coloque as luzes', 'E escolha a tecla que acende cada uma', L.lights.length > 0],
    ];
    const done = steps.filter(x => x[4]).length;
    if (done < steps.length) html += `<div class="ps-guide"><div class="ps-gh"><b>Primeiros passos</b><span>${done} de ${steps.length}</span></div>${steps.map(([k, ic, t, d, ok]) => `<button class="ps-step ${ok ? 'ok' : ''}" data-step="${k}"><i>${ok ? I('check') : I(ic)}</i><span><b>${t}</b><small>${d}</small></span></button>`).join('')}</div>`;
  }
  const tab = planTab;
  html += `<div class="seg ps-tabs" data-tabs>${[['devices', 'Aparelhos'], ['lights', 'Luzes'], ['furniture', 'Móveis'], ['walls', 'Casa']].map(([v, l]) => `<button data-tab="${v}" class="${tab === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (tab === 'furniture') {
    const cats = [...new Set(CATALOG.map(c => c.cat))];
    html += `<p class="sub" style="font-size:12px;margin:0 0 10px">Clique num móvel para colocar no centro da tela, ou arraste até o lugar na casa. Depois gire com a tecla R e troque a cor.</p>` +
      cats.map(cat => `<h3 style="margin-top:14px">${cat}</h3><div class="furn-grid">${CATALOG.filter(c => c.cat === cat).map(c => `<div class="furn-item" draggable="true" data-furn="${c.type}" title="${c.w} × ${c.d} m"><img data-thumb="${c.type}" width="96" height="64" alt="" draggable="false"><span>${c.name}</span></div>`).join('')}</div>`).join('');
  } else if (tab === 'lights') {
    const noLink = L.lights.filter(l => !l.link?.dev || needsKey(l)).length;
    html += `<p class="sub" style="font-size:12px;margin:0 0 10px;line-height:1.5">Clique numa luminária (ou arraste até a casa) e escolha a tecla do interruptor que acende ela.</p>
      <div class="furn-grid">${LAMPS.map(c => `<div class="furn-item" draggable="true" data-lamp="${c.type}" title="${esc(c.hint)}"><img data-lthumb="${c.type}" width="96" height="64" alt="" draggable="false"><span>${c.name}</span></div>`).join('')}</div>
      <h3 style="margin-top:18px">Na casa (${L.lights.length})</h3>
      ${noLink ? `<p class="sub" style="font-size:12px;margin:0 0 8px;color:var(--orange)">${noLink} sem tecla definida. Toque nela e escolha em “Acende com”.</p>` : ''}
      ${L.lights.map(l => `<div class="drag-dev placed" data-lpick="${l.id}" style="cursor:pointer">${I('light')}<span class="grow">${esc(lampType(l.type).name)}<br><span style="color:${l.link?.dev && !needsKey(l) ? 'var(--tx3)' : 'var(--orange)'};font-size:11.5px">${esc(lampLinkName(l) || 'Sem interruptor')}${needsKey(l) ? ' · escolha a tecla' : ''}</span></span></div>`).join('') || '<p class="sub" style="font-size:12px">Nenhuma luminária ainda.</p>'}`;
  } else if (tab === 'walls') {
    html += `<div class="field"><label>Pé-direito: <b data-whv>${fmt(L.wallHeight || 2.6, 2)} m</b></label><input type="range" min="2.2" max="3.6" step="0.05" value="${L.wallHeight || 2.6}" data-wh>
      <div class="hint">Altura real do teto. Para ver dentro dos cômodos, use os modos de parede (corte, meia altura, baixas). Cada parede também pode ser meia parede ou mureta.</div></div>
      <div class="field"><label>Direção do norte: <b data-northv>${Math.round(L.north || 0)}°</b></label><input type="range" min="0" max="359" step="5" value="${L.north || 0}" data-north>
        <div class="hint">O sol e as sombras do 3D seguem a posição real do sol na sua cidade.</div></div>
      <div class="ps-danger"><button class="btn sm danger" data-clear>${I('trash')}Apagar planta inteira</button><span>Dá para desfazer com Ctrl+Z.</span></div>`;
  } else {
    const placed = S.devices.filter(d => editor.placements[d.id]), unplaced = S.devices.filter(d => !editor.placements[d.id]);
    html += `<h3>Para posicionar</h3>${unplaced.length ? `<p class="sub" style="font-size:12px;margin:0 0 8px">Clique para colocar no centro da tela, ou arraste até o lugar na casa.</p>` + unplaced.map(d => `<div class="drag-dev ${d.type}" draggable="true" data-drag="${d.id}" role="button" tabindex="0">${I(devIco(d))}<span class="grow">${esc(d.name)}</span>${I('plus')}</div>`).join('') : '<p class="sub" style="margin:0 0 14px;font-size:12px">Todos posicionados ✓</p>'}
      <h3 style="margin-top:18px">Na casa</h3>${placed.map(d => `<div class="drag-dev placed ${d.type}" data-pick="${d.id}" style="cursor:pointer">${I(devIco(d))}<span class="grow">${esc(d.name)}</span><span style="color:var(--tx3);font-size:12px">${fmt(editor.placements[d.id].z ?? 0, 2)} m</span><button class="x" data-unplace="${d.id}" title="Remover da casa">${I('close')}</button></div>`).join('')}
      <p class="sub" style="font-size:12px;margin-top:16px;line-height:1.5">Aparelhos soltos perto de uma parede grudam nela.</p>`;
  }

  el.innerHTML = html;
  const q = sel => $(sel, el), pick = (sel, fn) => { const x = q(sel); if (x) x.onclick = e => { const b = e.target.closest('[data-v],[data-c]'); if (b) fn(b.dataset.v ?? b.dataset.c, b); }; };
  for (const d of el.querySelectorAll('[data-drag]')) { d.ondragstart = e => e.dataTransfer.setData('text/device', d.dataset.drag); d.onclick = () => editor.placeDeviceAt(d.dataset.drag, editor.center()); }
  if (q('[data-done]')) q('[data-done]').onclick = () => editor.select(null);
  for (const b of el.querySelectorAll('[data-step]')) b.onclick = () => { const k = b.dataset.step; if (k === 'room' || k === 'door') editor.setTool(k); else { planTab = k; renderPlanSide(); } };
  for (const b of el.querySelectorAll('[data-unplace]')) b.onclick = e => { e.stopPropagation(); editor.unplace(b.dataset.unplace); };
  for (const b of el.querySelectorAll('[data-pick]')) b.onclick = () => editor.select({ type: 'device', id: b.dataset.pick });
  if (q('[data-del]')) q('[data-del]').onclick = () => editor.deleteSelected();
  // parede
  pick('[data-wkind]', v => editor.updateWall(s.id, { kind: v }));
  pick('[data-wskind]', v => editor.updateWalls(s.ids, { kind: v }));
  if (q('[data-wlen]')) q('[data-wlen]').onchange = e => editor.updateWall(s.id, { len: Math.max(0.1, +e.target.value) });
  if (q('[data-wt]')) q('[data-wt]').onchange = e => editor.updateWall(s.id, { t: Math.min(0.4, Math.max(0.05, +e.target.value / 100)) });
  pick('[data-wh2]', v => editor.updateWall(s.id, { h: v === '' ? null : +v }));
  for (const side of ['fa', 'fb']) {
    const w = s?.type === 'wall' && L.walls2.find(w => w.id === s.id);
    pick(`[data-wfin="${side}"]`, v => editor.updateWall(s.id, { [side]: { ...(w[side] || {}), finish: v } }));
    pick(`[data-wcol="${side}"]`, c => { const f = { ...(w[side] || {}) }; if (c) f.color = c; else delete f.color; editor.updateWall(s.id, { [side]: f }); });
  }
  if (q('[data-wsplit]')) q('[data-wsplit]').onclick = () => editor.splitWall(s.id);
  // vão
  pick('[data-otype]', v => editor.updateOpening(s.id, { type: v, ...(v === 'window' ? { sill: 1, top: 2.1 } : {}), style: null }));
  pick('[data-ostyle]', v => editor.updateOpening(s.id, { style: v || null }));
  pick('[data-ocurtain]', v => editor.updateOpening(s.id, { curtain: v }));
  if (q('[data-ow]')) q('[data-ow]').onchange = e => editor.updateOpening(s.id, { w: Math.max(0.3, +e.target.value) });
  if (q('[data-osill]')) q('[data-osill]').onchange = e => editor.updateOpening(s.id, { sill: Math.max(0, +e.target.value) });
  if (q('[data-otop]')) q('[data-otop]').onchange = e => editor.updateOpening(s.id, { top: Math.max(0.3, +e.target.value) });
  pick('[data-oswing]', v => editor.updateOpening(s.id, { swing: v }));
  pick('[data-ohandle]', v => { const o = L.openings.find(o => o.id === s.id), to = o.swing || (o.hinge ? 'b' : 'a'); editor.updateOpening(s.id, { hinge: +v, swing: to }); }); // mantém o lado de abertura ao trocar a maçaneta
  // cômodo
  if (q('[data-rname]')) q('[data-rname]').oninput = e => editor.updateRoom(s.id, { name: e.target.value });
  if (q('[data-gname]')) q('[data-gname]').oninput = e => { const r = L.rooms.find(r => r.id === s.id); editor.renameGroup(r.group, e.target.value); };
  if (q('[data-floor]')) q('[data-floor]').onchange = e => editor.updateRoom(s.id, { floor: e.target.value });
  pick('[data-ftint]', c => editor.updateRoom(s.id, { floorColor: c || null }));
  const roomFin = () => { const w = editor.roomWalls(s.id)[0]; return w ? { ...((wallSides(L, w).a?.id === s.id ? w.fa : w.fb) || {}) } : {}; };
  pick('[data-rfin]', v => editor.paintRoom(s.id, { ...roomFin(), finish: v }));
  pick('[data-rcol]', c => { const f = roomFin(); if (c) f.color = c; else delete f.color; editor.paintRoom(s.id, f); });
  // pincel
  pick('[data-ptarget]', v => { editor.paint = v === 'floor' ? { target: 'floor', finish: 'wood', color: null } : { target: 'wall', finish: 'paint', color: '#e9e1d6' }; renderPlanSide(); });
  pick('[data-pfin]', v => { editor.paint.finish = v; renderPlanSide(); });
  pick('[data-pfloor]', v => { editor.paint.finish = v; renderPlanSide(); });
  pick('[data-pcol]', c => { editor.paint.color = c || null; renderPlanSide(); });
  // aparelho
  if (q('[data-dz]')) q('[data-dz]').onchange = e => { editor.updatePlacement(s.id, { z: Math.max(0, +e.target.value) }); renderPlanSide(); };
  if (q('[data-zpre]')) q('[data-zpre]').onclick = e => { const b = e.target.closest('button'); if (b) { editor.updatePlacement(s.id, { z: +b.dataset.v }); renderPlanSide(); } };
  if (q('[data-pstyles]') && s?.type === 'device') q('[data-pstyles]').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; editor.updatePlacement(s.id, { style: b.dataset.v }); renderPlanSide(); };
  if (q('[data-dwall]')) q('[data-dwall]').onclick = () => { const p = editor.placements[s.id]; editor.updatePlacement(s.id, { wall: !p.wall }); renderPlanSide(); };
  if (q('[data-north]')) q('[data-north]').oninput = e => { editor.setNorth(+e.target.value); q('[data-northv]').textContent = e.target.value + '°'; };
  if (q('[data-wh]')) q('[data-wh]').oninput = e => { editor.setWallHeight(+e.target.value); q('[data-whv]').textContent = fmt(+e.target.value, 2) + ' m'; };
  if (q('[data-tabs]')) q('[data-tabs]').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { planTab = b.dataset.tab; renderPlanSide(); } };
  // luzes
  for (const it of el.querySelectorAll('[data-lamp]')) {
    it.ondragstart = e => e.dataTransfer.setData('text/lamp', it.dataset.lamp);
    it.onclick = () => { const p = editor.center(); editor.addLamp(it.dataset.lamp, p.x, p.y); };
  }
  fillThumbs(el, editor.house.opts.style === 'classic' ? 'classic' : 'maquete'); // miniaturas 3D (móveis e luzes)
  for (const b of el.querySelectorAll('[data-lpick]')) b.onclick = () => editor.select({ type: 'lamp', id: b.dataset.lpick });
  if (q('[data-ltype]')) q('[data-ltype]').onchange = e => { const t = lampType(e.target.value); editor.updateLamp(s.id, { type: t.type, ...(t.w ? { w: L.lights.find(l => l.id === s.id).w || t.w } : {}) }); renderPlanSide(); };
  if (q('[data-ldev]')) q('[data-ldev]').onchange = e => { const [dev, ch] = e.target.value.split('#'); editor.updateLamp(s.id, { link: dev ? { dev, ch: ch || null } : null }); renderPlanSide(); };
  if (q('[data-lch]')) q('[data-lch]').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { const l = L.lights.find(l => l.id === s.id); editor.updateLamp(s.id, { link: { ...l.link, ch: b.dataset.v } }); renderPlanSide(); } };
  if (q('[data-lwatts]')) q('[data-lwatts]').onchange = e => { editor.updateLamp(s.id, { watts: Math.max(0, Math.min(2000, Math.round(+e.target.value || 0))) || undefined }); renderPlanSide(); };
  if (q('[data-lwtyp]')) q('[data-lwtyp]').onclick = e => { editor.updateLamp(s.id, { watts: +e.currentTarget.dataset.lwtyp }); renderPlanSide(); };
  if (q('[data-ltemp]')) q('[data-ltemp]').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { editor.updateLamp(s.id, { temp: b.dataset.v }); renderPlanSide(); } };
  if (q('[data-lw]')) q('[data-lw]').onchange = e => editor.updateLamp(s.id, { w: Math.max(0.3, +e.target.value) });
  if (q('[data-lz]')) q('[data-lz]').onchange = e => editor.updateLamp(s.id, { z: Math.max(0, +e.target.value) });
  for (const b of el.querySelectorAll('[data-lrot]')) b.onclick = () => { const l = L.lights.find(l => l.id === s.id); editor.updateLamp(s.id, { rot: ((l.rot || 0) + +b.dataset.lrot + 360) % 360 }); };
  if (q('[data-ldup]')) q('[data-ldup]').onclick = () => editor.duplicateLamp(s.id);
  // móveis
  for (const it of el.querySelectorAll('[data-furn]')) { it.ondragstart = e => e.dataTransfer.setData('text/furniture', it.dataset.furn); it.onclick = () => { const p = editor.center(); editor.addFurniture(it.dataset.furn, p.x, p.y); }; }
  fillThumbs(el, editor.house.opts.style === 'classic' ? 'classic' : 'maquete'); // miniaturas 3D dos móveis
  if (q('[data-fw]')) q('[data-fw]').onchange = e => editor.updateFurniture(s.id, { w: Math.max(0.1, +e.target.value) });
  if (q('[data-fd]')) q('[data-fd]').onchange = e => editor.updateFurniture(s.id, { d: Math.max(0.1, +e.target.value) });
  for (const b of el.querySelectorAll('[data-rot]')) b.onclick = () => { const f = L.furniture.find(f => f.id === s.id); editor.updateFurniture(s.id, { rot: ((f.rot || 0) + +b.dataset.rot + 360) % 360 }); renderPlanSide(); };
  if (q('[data-rot-range]')) q('[data-rot-range]').oninput = e => { editor.updateFurniture(s.id, { rot: +e.target.value }); q('[data-rotv]').textContent = e.target.value + '°'; };
  if (q('[data-swatch]')) q('[data-swatch]').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { editor.updateFurniture(s.id, { color: b.dataset.c }); renderPlanSide(); } };
  if (q('[data-dup]')) q('[data-dup]').onclick = () => editor.duplicateFurniture(s.id);
  if (q('[data-clear]')) q('[data-clear]').onclick = () => { if (confirmBox('Apagar a planta inteira? (dá para desfazer com Ctrl+Z)')) { editor.clearAll(); renderPlanSide(); } };
  if (q('[data-rname]') && s?.fresh) { q('[data-rname]').focus(); q('[data-rname]').select(); s.fresh = false; }
}
function confirmBox(msg) { return window.confirm(msg); }

// ------------------------------------------------------------------ AJUSTES
// resumo de uma conta já conectada: esconde as chaves atrás de "Editar conta"
function acctSummary(kind) {
  const st = S.settings || {}, cfg = kind === 'tuya' ? st.tuya : kind === 'lg' ? st.lg : st.ewelink;
  const devs = S.devices.filter(d => kind === 'tuya' ? /^tuya/.test(d.provider) : d.provider === (kind === 'lg' ? 'lg' : 'ewelink'));
  const ok = !!cfg?.enabled && !S.errors?.[kind] && devs.length > 0 && (kind !== 'ewelink' || !!cfg.at);
  if (!ok) return { ok: false, html: '' };
  const local = devs.filter(d => d.local).length, off = devs.filter(d => d.online === false).length;
  const noun = kind === 'lg' ? (devs.length === 1 ? 'ar-condicionado' : 'ares-condicionados') : devs.length === 1 ? 'aparelho' : 'aparelhos';
  const parts = [`${devs.length} ${noun}`, local ? `${local} pela rede local` : '', off ? `${off} sem conexão` : ''].filter(Boolean);
  return { ok: true, html: `<div class="acct-sum"><i class="acct-dot ${off ? 'warn' : ''}"></i><div class="grow"><b>Conectado</b><span>${parts.join(' · ')}</span></div><button class="btn sm" data-acct-edit>${I('edit')}Editar conta</button></div>` };
}
function renderSettings() {
  const s = JSON.parse(JSON.stringify(S.settings));
  const el = $('#view-settings');
  const secs = [['geral', 'Geral', 'gear', '#6e6e73', '#8a8a8f'], ['aparencia', 'Aparência e 3D', 'sun', '#007aff', '#3d9bff'], ['contas', 'Aparelhos e contas', 'plug', '#248a3d', '#36a852'],
    ['celular', 'Celular', 'phone', '#a347d6', '#bb6ae8'], ['atual', 'Atualizações', 'sparkles', '#d97a0a', '#f29a26'], ['avancado', 'Avançado', 'plan', '#c0392b', '#e0574a']];
  const cur = S.setSec || 'geral';
  el.innerHTML = `<div class="page st-page"><h1>Ajustes</h1><p class="sub">Tudo fica salvo só neste computador, inclusive as chaves das contas.</p>
  <div class="st-wrap"><nav class="st-nav" aria-label="Seções dos ajustes">${secs.map(([k, n, ic, c, c2]) => `<button data-sec-btn="${k}" class="${cur === k ? 'on' : ''}"><i class="rb-ic" style="--c:${c};--c2:${c2}" aria-hidden="true">${I(ic)}</i><span>${n}</span>${I('chevronR')}</button>`).join('')}</nav>
  <div class="st-body"><div class="set-grid" data-sec-host>
    <div class="card set-card" data-sec="contas"><h3>Tomadas Ekaza (Tuya / Smart Life) <span class="toggle ${s.tuya.enabled ? 'on' : ''}" data-k="tuya.enabled"></span></h3>
      <p class="d">As tomadas Ekaza usam a plataforma Tuya. O app conversa com a nuvem Tuya e, quando possível, direto pelo seu Wi-Fi (mais rápido e funciona sem internet).</p>
      ${S.errors.tuya ? `<div class="err-box">${esc(S.errors.tuya)}</div>` : ''}
      ${(A => A.html + `<div class="acct-edit" ${A.ok ? 'hidden' : ''}>`)(acctSummary('tuya'))}
      <div class="field"><label>Access ID / Client ID</label><input data-k="tuya.accessId" value="${esc(s.tuya.accessId)}"></div>
      <div class="field"><label>Access Secret / Client Secret</label><input type="password" data-k="tuya.accessSecret" value="${esc(s.tuya.accessSecret)}"></div>
      <div class="field-row"><div class="field"><label>Data center</label><select data-k="tuya.region">
        ${[['us', 'América Ocidental (Brasil)'], ['ueaz', 'América Oriental'], ['eu', 'Europa Central'], ['weaz', 'Europa Ocidental'], ['cn', 'China'], ['in', 'Índia']].map(([v, l]) => `<option value="${v}" ${s.tuya.region === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>ID de um dispositivo (opcional)</label><input data-k="tuya.sampleDeviceId" value="${esc(s.tuya.sampleDeviceId)}" placeholder="só se a lista vier vazia"></div></div>
      </div>
      <div class="row"><span class="lbl">Controle local pela rede Wi-Fi</span><span class="toggle ${s.tuya.preferLocal ? 'on' : ''}" data-k="tuya.preferLocal"></span></div>
      <div class="row"><span class="lbl">Somente rede local (não usar a nuvem)</span><span class="toggle ${s.tuya.localOnly ? 'on' : ''}" data-k="tuya.localOnly"></span></div>
      <div class="lan-box">
        <div class="lan-head"><div><b>Tomadas no seu Wi-Fi</b><div class="lan-sub">${S.tuyaSaved ? `${S.tuyaSaved} tomada(s) com chave salva neste PC. Elas funcionam pela rede local mesmo sem a nuvem.` : 'Nenhuma chave salva ainda. Conecte a nuvem Tuya uma vez e as chaves ficam guardadas aqui.'}</div></div>
        <button class="btn sm" data-scan>${I('wind')}Procurar</button></div>
        <div data-scan-res></div>
      </div>
      <details class="howto"><summary>Como conseguir essas chaves (uma vez só, ~10 min)</summary><ol>
        <li>Crie conta grátis em <code>platform.tuya.com</code>.</li>
        <li><b>Cloud → Development → Create Cloud Project</b>. Tipo "Smart Home", Data Center <b>Western America</b>.</li>
        <li>Em <b>Service API</b>, autorize: <i>IoT Core</i> e <i>Authorization Token Management</i>.</li>
        <li>No projeto: <b>Devices → Link App Account → Add App Account</b> e leia o QR code com o app Smart Life (Eu → ícone de leitura no topo). Use a mesma conta onde estão as tomadas Ekaza.</li>
        <li>Copie <b>Access ID</b> e <b>Access Secret</b> da aba Overview para cá.</li></ol></details>
    </div>
    <div class="card set-card" data-sec="contas"><h3>Ar-condicionado LG (ThinQ) <span class="toggle ${s.lg.enabled ? 'on' : ''}" data-k="lg.enabled"></span></h3>
      <p class="d">Usa a API oficial LG ThinQ Connect, com acesso a todas as funções que o seu modelo expõe (modo, ventilação, aletas, timers, eco, display etc.).</p>
      ${S.errors.lg ? `<div class="err-box">${esc(S.errors.lg)}</div>` : ''}
      ${(A => A.html + `<div class="acct-edit" ${A.ok ? 'hidden' : ''}>`)(acctSummary('lg'))}
      <div class="field"><label>Personal Access Token (PAT)</label><input type="password" data-k="lg.token" value="${esc(s.lg.token)}"></div>
      <div class="field"><label>País da conta LG</label><input data-k="lg.country" value="${esc(s.lg.country)}" maxlength="2" style="text-transform:uppercase"></div>
      <details class="howto"><summary>Como gerar o token</summary><ol>
        <li>Acesse <code>connect-pat.lgthinq.com</code> e entre com sua conta LG ThinQ (a mesma do app).</li>
        <li>Clique em <b>ADD NEW TOKEN</b>, dê um nome e marque todas as permissões.</li>
        <li>Copie o token e cole aqui. País: <b>BR</b>.</li></ol></details>
      </div>
    </div>
    <div class="card set-card" data-sec="contas"><h3>Sonoff (eWeLink) <span class="toggle ${s.ewelink?.enabled ? 'on' : ''}" data-k="ewelink.enabled"></span></h3>
      <p class="d">Interruptores e relés Sonoff. O login na eWeLink é usado uma vez para buscar as chaves; depois o controle é direto pelo Wi-Fi (modo LAN).</p>
      ${S.errors.ewelink ? `<div class="err-box">${esc(S.errors.ewelink)}</div>` : ''}
      ${(A => A.html + `<div class="acct-edit" ${A.ok ? 'hidden' : ''}>`)(acctSummary('ewelink'))}
      <div class="field"><label>APPID</label><input data-k="ewelink.appId" value="${esc(s.ewelink?.appId || '')}"></div>
      <div class="field"><label>APP SECRET</label><input type="password" data-k="ewelink.appSecret" value="${esc(s.ewelink?.appSecret || '')}"></div>
      <div class="field"><label>Redirect URL (cadastre exatamente igual no site)</label><input data-k="ewelink.redirectUrl" value="${esc(s.ewelink?.redirectUrl || 'https://127.0.0.1/casa3d')}"></div>
      </div>
      <div class="row"><span class="lbl">${s.ewelink?.at ? '✓ Conta eWeLink conectada' : 'Conta eWeLink não conectada'}${S.ewlSaved ? ` · ${S.ewlSaved} chave(s) salva(s)` : ''}</span>
        <button class="btn sm ${s.ewelink?.at ? '' : 'primary'}" data-ewl-login>${s.ewelink?.at ? 'Entrar de novo' : 'Entrar com eWeLink'}</button></div>
      <div class="row"><span class="lbl">Somente rede local (não usar a nuvem)</span><span class="toggle ${s.ewelink?.localOnly ? 'on' : ''}" data-k="ewelink.localOnly"></span></div>
      <details class="howto"><summary>Como conseguir o APPID (uma vez só)</summary><ol>
        <li>Crie uma conta em <code>dev.ewelink.cc</code> e, em <b>My Center → Settings</b>, peça a conta de desenvolvedor (a aprovação pode levar alguns dias).</li>
        <li>Em <b>Console → Create</b>: tipo <b>OAuth2.0</b>, papel <b>Standard Role</b>, e em Redirect URL coloque <code>https://127.0.0.1/casa3d</code>.</li>
        <li>Copie o <b>APPID</b> e o <b>APP SECRET</b> para cá e clique em <b>Entrar com eWeLink</b>. Use a mesma conta do app eWeLink do celular.</li>
        <li>No app eWeLink, deixe o <b>Modo LAN</b> ligado no interruptor (vem ligado por padrão).</li></ol></details>
    </div>
    <div class="card set-card" data-sec="geral"><h3>Geral</h3>
      <div class="row"><span class="lbl">Modo demonstração (aparelhos simulados)</span><span class="toggle ${s.demo ? 'on' : ''}" data-k="demo"></span></div>
      <div class="row"><span class="lbl">Iniciar com o Windows (minimizado)</span><span class="toggle ${s.startWithWindows ? 'on' : ''}" data-k="startWithWindows"></span></div>
      <div class="row"><span class="lbl">Fechar para a bandeja (agendamentos continuam)</span><span class="toggle ${s.keepInTray !== false ? 'on' : ''}" data-k="keepInTray"></span></div>
      <div class="row"><span class="lbl">Atualizar estado a cada (s)</span><input type="number" min="5" max="300" data-k="pollSeconds" value="${s.pollSeconds}" style="width:80px"></div>
      <div class="row"><span class="lbl">Localização para nascer/pôr do sol<br><span style="color:var(--tx3);font-size:12px">${S.sun ? `Hoje: nasce ${new Date(S.sun.sunrise).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · se põe ${new Date(S.sun.sunset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span></span>
        <span style="display:flex;gap:6px"><input type="number" step="0.01" data-k="location.lat" value="${s.location?.lat ?? -23.55}" style="width:90px" title="Latitude"><input type="number" step="0.01" data-k="location.lng" value="${s.location?.lng ?? -46.63}" style="width:90px" title="Longitude"></span></div>
      <div class="row"><span class="lbl">Tarifa de energia (R$/kWh)</span><input type="number" step="0.01" min="0" data-k="tariff" value="${s.tariff ?? 0.85}" style="width:80px"></div>
    </div>
    <div class="card set-card" data-sec="geral"><h3>Backup da casa</h3>
      <p class="d">Guarda num arquivo a planta, os aparelhos no mapa, nomes das teclas, cenas, regras, horários, teclas ligadas e potências. Senhas e chaves das contas <b>não</b> vão no arquivo. Use para trocar de computador ou montar um servidor ligado 24 horas.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-bk-export>${I('check')}Exportar backup</button><button class="btn" data-bk-import>${I('plus')}Restaurar de um arquivo</button></div>
    </div>
    <div class="card set-card" data-sec="aparencia"><h3>Aparência e 3D</h3>
      <div class="row"><span class="lbl">Aparência</span><div class="seg" data-theme-seg style="margin:0;width:230px">${[['system', 'Automática'], ['light', 'Clara'], ['dark', 'Escura']].map(([v, l]) => `<button data-v="${v}" class="${getTheme() === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="row"><span class="lbl">Tamanho do texto <span style="color:var(--tx2);font-size:12.5px">(Ctrl + e Ctrl −)</span></span><div class="seg" data-zoom style="margin:0;width:300px">${[[0.9, 'Menor'], [1, 'Padrão'], [1.12, 'Grande'], [1.25, 'Maior']].map(([v, l]) => `<button data-v="${v}" class="${(+(localStorage.getItem('textZoom') || 1)) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="row"><span class="lbl">Abertura animada ao abrir o app</span><span class="toggle ${s.introAnim !== false ? 'on' : ''}" data-k="introAnim"></span></div>
      <div class="row"><span class="lbl">Descanso de tela (a casa gira devagar quando ninguém mexe)</span><span style="display:flex;gap:8px;align-items:center"><select data-k="idleMin" style="width:92px">${[1, 2, 5, 10, 30].map(m => `<option value="${m}" ${(+s.idleMin || 2) === m ? 'selected' : ''}>${m} min</option>`).join('')}</select><span class="toggle ${s.idle !== false ? 'on' : ''}" data-k="idle"></span></span></div>
      <div class="row"><span class="lbl">Estilo da casa 3D</span><div class="seg" data-style3d style="margin:0;width:230px">${[['maquete', 'Maquete'], ['classic', 'Clássico']].map(([v, l]) => `<button data-v="${v}" class="${(s.style3d === 'classic' ? 'classic' : 'maquete') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="row"><span class="lbl">Telhado no estilo clássico (fecha a casa quando você afasta a câmera)</span><span class="toggle ${s.roof !== false ? 'on' : ''}" data-k="roof"></span></div>
      <div class="row"><span class="lbl">Raios de sol entrando pelas janelas</span><span class="toggle ${s.sunBeams !== false ? 'on' : ''}" data-k="sunBeams"></span></div>
      <div class="row"><span class="lbl">Clima real no 3D (chuva, nuvens, neblina) e no topo da tela</span><span class="toggle ${s.weatherFx !== false ? 'on' : ''}" data-k="weatherFx"></span></div>
      <div class="row"><span class="lbl">Qualidade gráfica do 3D</span><select data-quality style="background:var(--s2);border:1px solid var(--line2);border-radius:10px;height:32px;padding:0 10px">
        ${[['high', 'Alta (sombras de contato)'], ['medium', 'Média'], ['low', 'Leve (PC mais fraco)']].map(([v, l]) => `<option value="${v}" ${getQuality() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="row"><span class="lbl">Sons (clique das teclas, bip do ar e o ambiente da casa: chuva, pássaros e grilos)</span><span class="toggle ${s.sound !== false ? 'on' : ''}" data-k="sound"></span></div>
    </div>
    <div class="card set-card" data-sec="celular" data-mobile-card><h3><span>${I('phone')}Celular (iPhone)</span> <span class="toggle ${s.mobile?.enabled ? 'on' : ''}" data-k="mobile.enabled"></span></h3>
      <p class="d">Controle a casa pelo iPhone, em casa ou na rua. Este PC vira a central: o celular abre o próprio SmartHouse pelo navegador. Fora de casa a conexão passa pelo <b>Tailscale</b>, uma rede privada e gratuita, sem expor nada na internet.</p>
      <div data-mobile-box></div>
      <div class="row"><span class="lbl">Impedir que o PC entre em suspensão<br><span style="color:var(--tx3);font-size:12px">A tela pode apagar normalmente</span></span><span class="toggle ${s.mobile?.keepAwake !== false ? 'on' : ''}" data-k="mobile.keepAwake"></span></div>
      <div class="row"><span class="lbl">Porta</span><input type="number" min="1024" max="65535" data-k="mobile.port" value="${s.mobile?.port || 8787}" style="width:90px"></div>
      <div class="field"><label>Notificações no iPhone: tópico do app ntfy (as regras com "me avisar" chegam no celular)</label>
        <div style="display:flex;gap:6px"><input data-k="mobile.ntfyTopic" value="${esc(s.mobile?.ntfyTopic || '')}" placeholder="ex.: casa3d-${Math.random().toString(36).slice(2, 10)}" style="flex:1"><button class="btn sm" data-ntfy-test>Testar</button></div></div>
      <details class="howto"><summary>Como configurar no iPhone (uma vez só)</summary><ol>
        <li>Ligue a chave acima e clique em <b>Salvar e conectar</b>. Na primeira vez o Windows pergunta sobre o firewall: marque <b>Redes privadas</b> e <b>Redes públicas</b> e clique em Permitir.</li>
        <li><b>Em casa:</b> com o iPhone no mesmo Wi-Fi, aponte a câmera para o QR code <i>Rede de casa</i> e toque no link.</li>
        <li><b>Fora de casa:</b> instale o <b>Tailscale</b> neste PC (tailscale.com/download) e no iPhone (App Store) e entre com a mesma conta nos dois. Volte aqui: aparece o QR code <i>Tailscale</i>. Leia esse no iPhone; ele funciona em casa e na rua.</li>
        <li>No Safari, toque em <b>Compartilhar → Adicionar à Tela de Início</b>. Pronto: o SmartHouse vira um ícone no iPhone.</li>
        <li>Notificações: instale o app <b>ntfy</b> no iPhone, toque em <b>+</b> e assine o mesmo tópico digitado acima. Use um nome difícil de adivinhar: quem souber o tópico consegue ler os avisos.</li></ol></details>
    </div>
    <div class="card set-card" data-sec="atual"><h3>Atualizações</h3>
      <p class="d" data-upd-info>Versão instalada: carregando…</p>
      <div class="field"><label>Repositório das versões (GitHub, usuário/repositório)</label><input data-k="update.repo" value="${esc(s.update?.repo || '')}" placeholder="Pedrobezz/SmartHouse (padrão)"></div>
      <div style="display:flex;gap:8px;align-items:center"><button class="btn sm" data-upd-check>Verificar agora</button><button class="btn sm" data-whatsnew>${I('sparkles')}Ver novidades</button><span class="lbl" style="color:var(--tx3);font-size:12px" data-upd-msg></span></div>
    </div>
    <div class="card set-card" data-sec="avancado"><h3>Planta da casa</h3><p class="d">Recomeçar do zero apaga cômodos e posições dos aparelhos.</p>
      <button class="btn danger" data-reset-layout>${I('trash')}Apagar planta</button></div>
  </div>
  <div class="st-save" data-stsave hidden><span data-dirty>Há alterações não salvas.</span><button class="btn primary" data-save-settings>${I('check')}Salvar e conectar</button></div></div></div></div>`;
  const showSec = k => { S.setSec = k; for (const c of el.querySelectorAll('[data-sec]')) c.hidden = c.dataset.sec !== k; for (const b of el.querySelectorAll('[data-sec-btn]')) b.classList.toggle('on', b.dataset.secBtn === k); };
  showSec(cur);
  $('.st-nav', el).onclick = e => { const b = e.target.closest('[data-sec-btn]'); if (b) { showSec(b.dataset.secBtn); animIn?.(['#view-settings .st-body']); } };
  const dirty = () => { const b = $('[data-stsave]', el); if (b && b.hidden) { b.hidden = false; b.classList.add('show'); } };
  el.addEventListener('input', e => { if (e.target.closest('[data-k]')) dirty(); });
  el.addEventListener('click', e => { if (e.target.closest('.toggle[data-k]')) dirty(); });
  const setK = (k, v) => { const p = k.split('.'); let o = s; while (p.length > 1) { const key = p.shift(); o = o[key] || (o[key] = {}); } o[p[0]] = v; };
  for (const t of el.querySelectorAll('.toggle[data-k]')) t.onclick = () => { t.classList.toggle('on'); setK(t.dataset.k, t.classList.contains('on')); };
  for (const i of el.querySelectorAll('input[data-k],select[data-k]')) i.oninput = () => setK(i.dataset.k, i.type === 'number' ? +i.value : i.dataset.k === 'lg.country' ? i.value.toUpperCase() : i.value.trim());
  if ($('[data-bk-export]', el)) $('[data-bk-export]', el).onclick = async () => { try { const r = await api.backupExport(); if (r) toast('Backup salvo'); } catch (e) { toast(cleanErr(e), 'error'); } };
  if ($('[data-bk-import]', el)) $('[data-bk-import]', el).onclick = async () => {
    try {
      const r = await api.backupImport(); if (!r) return;
      Object.assign(S, r.all); applyHouseOptions(); house._framed = false; house.setLayout(S.layout, S.placements, S.devices);
      if (editor) editor.load(S.layout, S.placements, S.devices);
      renderAll(); toast(`Backup restaurado (${r.date ? new Date(r.date).toLocaleDateString('pt-BR') : 'arquivo'})`);
    } catch (e) { toast(cleanErr(e), 'error'); }
  };
  $('[data-save-settings]', el).onclick = async () => {
    toast('Conectando…');
    const all = await api.saveSettings(s);
    Object.assign(S, all);
    applyHouseOptions();
    closePanel();
    house._framed = false; house.setLayout(S.layout, S.placements, S.devices);
    if (editor) editor.load(S.layout, S.placements, S.devices);
    setTimeout(async () => { Object.assign(S, await api.getAll()); renderAll(); toast(`${S.devices.length} aparelho(s) carregado(s)`); }, 2500);
    renderAll();
  };
  $('[data-scan]', el).onclick = () => runScan(el);
  $('[data-theme-seg]', el).onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; try { localStorage.setItem('theme', b.dataset.v); } catch (_) {} window.__applyTheme(); window.dispatchEvent(new Event('themechange')); for (const x of el.querySelectorAll('[data-theme-seg] button')) x.classList.toggle('on', x === b); };
  api.updaterState().then(u => {
    const info = $('[data-upd-info]', el); if (!info) return;
    info.innerHTML = `Versão instalada: <b>${u.current}</b>. ` + (u.portable ? 'Você está usando a versão <b>portátil</b>, que não se atualiza sozinha. Use o <b>SmartHouse-Setup.exe</b> uma vez para instalar; depois as novas versões chegam automaticamente.' : u.configured ? 'O app procura novas versões ao abrir e a cada hora, baixa em segundo plano e avisa quando estiver pronta.' : 'Informe o repositório para ativar as atualizações automáticas.');
    if (u.message) $('[data-upd-msg]', el).textContent = u.message;
  });
  $('[data-style3d]', el).onclick = async e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    for (const x of el.querySelectorAll('[data-style3d] button')) x.classList.toggle('on', x === b);
    s.style3d = b.dataset.v; S.settings.style3d = b.dataset.v; applyHouseOptions();
    try { await api.saveSettings(s); } catch (_) {}
  };
  $('[data-zoom]', el).onclick = e => { const b = e.target.closest('[data-v]'); if (b) setTextZoom(+b.dataset.v); };
  for (const b of el.querySelectorAll('[data-acct-edit]')) b.onclick = () => { const card = b.closest('.set-card'), ed = card.querySelector('.acct-edit'); ed.hidden = !ed.hidden; card.classList.toggle('acct-open', !ed.hidden); b.innerHTML = ed.hidden ? `${I('edit')}Editar conta` : `${I('check')}Concluído`; };
  $('[data-whatsnew]', el).onclick = () => showWhatsNew(true);
  $('[data-upd-check]', el).onclick = async () => {
    try { await api.saveSettings(s); await api.updaterCheck(); } catch (e) { toast(cleanErr(e), 'error'); }
  };
  $('[data-ewl-login]', el).onclick = async () => {
    try { toast('Abrindo login da eWeLink…'); const all = await api.ewelinkLogin(s.ewelink); Object.assign(S, all); toast('Conta eWeLink conectada'); renderAll(); }
    catch (e) { toast(cleanErr(e), 'error'); }
  };
  renderMobileBox(el);
  $('[data-ntfy-test]', el).onclick = async () => {
    if (!s.mobile?.ntfyTopic) return toast('Digite um tópico primeiro', 'error');
    await api.saveSettings(s); await api.mobileTestPush(); toast('Notificação de teste enviada');
  };
  $('[data-quality]', el).onchange = e => { try { localStorage.setItem('quality', e.target.value); } catch (_) {} house.setQuality(e.target.value); toast('Qualidade gráfica alterada'); };
  $('[data-reset-layout]', el).onclick = async () => {
    if (!confirmBox('Apagar a planta e as posições dos aparelhos?')) return;
    Object.assign(S, await api.resetLayout()); house.setLayout(S.layout, S.placements, S.devices); if (editor) editor.load(S.layout, S.placements, S.devices); toast('Planta apagada');
  };
}

async function renderMobileBox(el) {
  const box = $('[data-mobile-box]', el); if (!box || !api.mobileInfo) return;
  const i = await api.mobileInfo();
  if (!i.enabled) { box.innerHTML = ''; return; }
  if (!i.running) { box.innerHTML = `<div class="err-box">${esc(i.error || 'Clique em Salvar e conectar para ativar.')}</div>`; return; }
  const ts = i.urls.find(u => u.kind === 'tailscale'), lan = i.urls.find(u => u.kind === 'lan');
  const qr = (u, title, sub) => `<div class="qr-card"><img src="${i.qr[u.ip]}" alt=""><div><b>${title}</b><span>${sub}</span><code>${esc(u.ip)}:${i.port}</code></div></div>`;
  box.innerHTML = `<div class="qr-row">
      ${ts ? qr(ts, 'Tailscale', 'Funciona em casa e na rua') : `<div class="qr-card qr-empty">${I('wifiOff')}<div><b>Tailscale não encontrado</b><span>Instale o Tailscale neste PC para usar fora de casa.</span></div></div>`}
      ${lan ? qr(lan, 'Rede de casa', 'Só no mesmo Wi-Fi') : ''}
    </div>
    <div class="row"><span class="lbl">${i.clients ? `<b style="color:var(--green)">●</b> ${i.clients} celular(es) conectado(s) agora` : 'Nenhum celular conectado agora'}</span>
      <button class="btn sm" data-regen title="Desconecta todos os celulares; será preciso ler o QR de novo">Trocar chave de acesso</button></div>`;
  $('[data-regen]', box).onclick = async () => {
    if (!confirmBox('Trocar a chave? Todos os celulares serão desconectados e precisarão ler o QR code de novo.')) return;
    const r = await api.mobileRegen(); Object.assign(S, r.all); renderMobileBox(el); toast('Chave trocada');
  };
}

async function runScan(el) {
  const box = $('[data-scan-res]', el), btn = $('[data-scan]', el);
  btn.disabled = true; btn.innerHTML = `${I('wind')}Procurando…`;
  box.innerHTML = '<div class="lan-sub" style="padding:10px 0">Escutando a rede por 8 segundos…</div>';
  let found = [];
  try { found = await api.tuyaScan(); } catch (e) { toast(cleanErr(e), 'error'); }
  btn.disabled = false; btn.innerHTML = `${I('wind')}Procurar de novo`;
  if (!found.length) { box.innerHTML = '<div class="lan-sub" style="padding:10px 0">Nenhuma tomada Tuya respondeu. Confira se o PC está no mesmo Wi-Fi das tomadas (rede de convidados e “isolamento de clientes” no roteador bloqueiam a busca).</div>'; return; }
  box.innerHTML = found.map(f => `<div class="lan-row">
      <div class="grow"><div class="nm">${esc(f.name || 'Tomada sem nome')}</div><div class="lan-sub">${esc(f.ip)} · protocolo ${esc(f.version)} · <span style="user-select:text">${esc(f.id)}</span></div></div>
      ${f.connected ? '<span class="chip ok"><i></i>Conectada</span>' : f.hasKey ? '<span class="chip"><i></i>Chave salva</span>' :
        `<span class="chip err"><i></i>Falta a chave</span>`}
    </div>
    ${!f.hasKey ? `<div class="lan-key"><input placeholder="Local key (16 caracteres), se você já tiver" data-key="${esc(f.id)}" maxlength="16"><button class="btn sm" data-addkey="${esc(f.id)}">Adicionar</button></div>` : ''}`).join('') +
    `<div class="lan-sub" style="padding-top:10px">${found.length} tomada(s) encontrada(s). ${found.some(f => !f.hasKey) ? 'As que estão sem chave serão liberadas automaticamente quando você conectar a nuvem Tuya acima.' : ''}</div>`;
  for (const b of box.querySelectorAll('[data-addkey]')) b.onclick = async () => {
    const id = b.dataset.addkey, key = $(`[data-key="${id}"]`, box).value.trim();
    try { const all = await api.tuyaAdd({ id, key }); Object.assign(S, all); toast('Tomada adicionada'); renderAll(); }
    catch (e) { toast(cleanErr(e), 'error'); }
  };
}

// ---------- atualização disponível + novidades ----------
let UPD = {}; window.__onUpdater = u => onUpdater(u); // usado nos testes
function onUpdater(u) {
  UPD = { ...UPD, ...u };
  const m = $('[data-upd-msg]'); if (m) m.textContent = u.message || '';
  const pill = $('#upd-pill'), show = UPD.status === 'downloading' || UPD.status === 'ready';
  pill.classList.toggle('hidden', !show);
  pill.classList.toggle('ready', UPD.status === 'ready');
  if (show) pill.innerHTML = `${I('sparkles')}<span>${UPD.status === 'ready' ? `Atualização ${esc(UPD.version)} pronta` : `Atualização ${esc(UPD.version || '')} disponível${UPD.pct ? ` · ${UPD.pct}%` : ''}`}</span>`;
  if (u.status === 'ready') showUpdateBanner(u.version);
  if ($('#upd-sheet')) showUpdateSheet();
  for (const b of document.querySelectorAll('.rail [data-view="settings"]')) b.classList.toggle('badge', show);
}
// novidades: a versão mais recente aberta; as anteriores recolhidas (toque para abrir)
const noteItems = list => list.map((c, i) => `<details class="wn-ver" ${i === 0 ? 'open' : ''}><summary class="wn-vh"><b>${esc(c.title || 'Versão ' + c.version)}</b><span>${esc(c.version)}${c.date ? ' · ' + new Date(c.date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>${I('chevronR')}</summary>
  ${c.items.map(([ic, t, d]) => `<div class="wn-item"><div class="wn-ic">${I(ic)}</div><div><b>${esc(t)}</b><p>${esc(d)}</p></div></div>`).join('')}</details>`).join('');
function whatsNewModal(title, sub, list, foot) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal wn" id="${foot ? 'upd-sheet' : 'wn-sheet'}">
    <div class="wn-head"><div class="wn-logo">${I('sparkles')}</div><h2>${title}</h2><p>${sub}</p></div>
    <div class="wn-list">${list.length ? noteItems(list) : '<p class="sub">Melhorias e correções.</p>'}</div>
    <div class="foot" style="justify-content:flex-end">${foot || '<button class="btn primary" data-cancel>Continuar</button>'}</div></div></div>`;
  root.onclick = e => {
    if (e.target.classList.contains('modal-bg') || e.target.closest('[data-cancel]')) { root.innerHTML = ''; root.onclick = null; return; }
    if (e.target.closest('[data-install]')) { e.target.closest('[data-install]').disabled = true; toast('Instalando… o app vai reabrir sozinho'); api.updaterInstall(); }
  };
}
function showUpdateSheet() {
  if (!(UPD.status === 'downloading' || UPD.status === 'ready')) return;
  const ready = UPD.status === 'ready';
  whatsNewModal(`Atualização ${esc(UPD.version)} disponível`,
    ready ? 'Já baixada. O app fecha, instala e abre de novo sozinho (leva uns segundos). Tudo o que você configurou continua igual.' : `Baixando em segundo plano… ${UPD.pct || 0}%. Você pode continuar usando o app.`,
    UPD.notes || [],
    `<button class="btn" data-cancel>Depois</button><button class="btn primary" data-install ${ready ? '' : 'disabled'}>${I('sparkles')}${ready ? 'Reiniciar e atualizar' : `Baixando… ${UPD.pct || 0}%`}</button>`);
}
function showWhatsNew(force) {
  const cur = S.version; if (!cur) return;
  let seen = S.settings?.seenVersion;
  if (api.web) { try { seen = localStorage.getItem('seenVersion'); } catch (_) {} }
  if (!force && seen === cur) return;
  const list = force ? CHANGELOG : notesSince(seen, cur).slice(0, seen ? 99 : 1);
  if (list.length && !$('#modal-root .modal')) whatsNewModal(force ? 'Novidades do SmartHouse' : `O que há de novo na versão ${esc(cur)}`, force ? `Você está na versão ${esc(cur)}.` : 'O app foi atualizado. Veja o que mudou:', list);
  if (!force) { api.setSeenVersion?.(cur); if (S.settings) S.settings.seenVersion = cur; }
}
function showUpdateBanner(v) {
  if ($('#upd-banner')) return;
  const b = document.createElement('div'); b.id = 'upd-banner'; b.className = 'upd-banner';
  b.innerHTML = `${I('sparkles')}<span>Nova versão <b>${esc(v)}</b> pronta</span><button class="btn sm" data-see>O que mudou</button><button class="btn sm primary" data-go>Reiniciar e atualizar</button><button class="icon-btn" data-x>${I('close')}</button>`;
  document.body.appendChild(b);
  $('[data-go]', b).onclick = () => { toast('Instalando… o app vai reabrir sozinho'); api.updaterInstall(); };
  $('[data-see]', b).onclick = () => showUpdateSheet();
  $('[data-x]', b).onclick = () => b.remove();
}
function getTheme() { try { return localStorage.getItem('theme') || 'system'; } catch (_) { return 'system'; } }
function getQuality() { try { return localStorage.getItem('quality') || 'high'; } catch (_) { return 'high'; } }

// ------------------------------------------------------------------ util
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'error' ? 6000 : 2600);
}

init().catch(e => { if (document.querySelector('.locked')) return; document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:20px;position:fixed;bottom:0">${esc(e.stack)}</pre>`); });
