// Mini Casa: controle rápido numa janela compacta sempre por cima
import { I } from './icons.js';
import { logicalRooms, toV2 } from './geom.js';
import { AC3D } from './ac3d.js';

const api = window.api;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n, d = 1) => (typeof n === 'number' && isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: d }) : '--');
const MODE = { COOL: ['Frio', 'snow'], AIR_DRY: ['Seco', 'drop'], FAN: ['Ventilar', 'fan'], AUTO: ['Auto', 'auto'], HEAT: ['Quente', 'sun'] };
const FAN = { LOW: 'Baixa', MID: 'Média', HIGH: 'Alta', AUTO: 'Auto', SLOW: 'Mín.', POWER: 'Turbo', NATURE: 'Natural' };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};

const S = { devices: [], scenes: [], settings: {}, tab: store.get('miniTab', 'fav'), fav: new Set(store.get('miniFav', [])) };
{ let lay = null; Object.defineProperty(S, 'layout', { get: () => lay, set: v => { lay = v ? toV2(v) : v; }, enumerable: true }); }
const pending = {}; // temperatura sendo ajustada (evita "pular" enquanto o comando vai)

async function init() {
  $('#m-main').innerHTML = I('expand');
  $('#m-close').innerHTML = I('close');
  $('#m-pin').innerHTML = I('pin');
  Object.assign(S, await api.getAll());
  let pinned = S.settings.miniPinned !== false;
  $('#m-pin').classList.toggle('on', pinned);
  $('#m-pin').onclick = async () => { pinned = !pinned; await api.pinMini(pinned); $('#m-pin').classList.toggle('on', pinned); toast(pinned ? 'Fixado por cima das janelas' : 'Não fixado'); };
  $('#m-main').onclick = () => api.openMain();
  $('#m-close').onclick = () => api.closeMini();
  $('#m-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { S.tab = b.dataset.tab; store.set('miniTab', S.tab); render(); } };
  api.onUpdate(snap => { S.devices = snap.devices; render(); });
  api.onLog(l => { if (l.level === 'error') toast(l.msg, 'error'); });
  // na primeira vez, sugere favoritos: ares + aparelhos ligados
  if (!store.get('miniFav')) { S.fav = new Set(S.devices.filter(d => d.type === 'ac' || d.state?.on).map(d => d.id)); store.set('miniFav', [...S.fav]); }
  render();
  // recarrega cenas/planta de vez em quando (podem mudar no app principal)
  setInterval(async () => { const a = await api.getAll(); S.scenes = a.scenes; S.layout = a.layout; }, 15000);
}

const roomName = id => logicalRooms(S.layout).find(r => r.id === id)?.name || '';
async function cmd(id, c) { try { await api.command(id, c); } catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error'); } }

function acCard(d) {
  const s = d.state || {}, c = d.caps || {};
  const t = pending[d.id] ?? s.target;
  return `<div class="m-ac ${s.on ? 'on' : 'off'} ${s.mode === 'HEAT' ? 'heat' : ''}" data-id="${d.id}">
    <div class="m-ac-top"><div><div class="m-ac-name">${esc(d.name)}</div><div class="m-ac-sub">${d.online === false ? 'Offline' : `Ambiente ${fmt(s.current)}°${d.room ? ' · ' + esc(roomName(d.room)) : ''}`}</div></div>
      <div style="display:flex;align-items:center;gap:4px">${star(d)}<button class="m-pwr ${s.on ? 'on' : ''}" data-act="pwr">${I('power')}</button></div></div>
    <div class="m-ac-mid"><div class="m-temp">${fmt(t)}<sup>°C</sup></div>
      <div class="m-step"><button data-act="minus">${I('minus')}</button><button data-act="plus">${I('plus')}</button></div></div>
    <div class="m-chips">
      ${c.modes?.length ? `<button data-act="mode">${I(MODE[s.mode]?.[1] || 'snow')}${MODE[s.mode]?.[0] || s.mode || '--'}</button>` : ''}
      ${c.fans?.length ? `<button data-act="fan">${I('fan')}${FAN[s.fan] || s.fan || '--'}</button>` : ''}
      ${c.turbo ? `<button data-act="turbo" class="${/POWER|JET|TURBO/i.test(s.fan || '') ? 'on' : ''}">${I('bolt')}Turbo</button>` : ''}
      ${c.eco ? `<button data-act="eco" class="${s.eco ? 'on' : ''}">${I('leaf')}Eco</button>` : ''}
      ${c.sleep ? `<button data-act="sleep" class="${s.sleepMin ? 'on' : ''}">${I('moon')}${s.sleepMin ? `${Math.round(s.sleepMin / 60)}h` : 'Sono'}</button>` : ''}
    </div></div>`;
}
function star(d) { return `<button class="m-star ${S.fav.has(d.id) ? 'on' : ''}" data-star="${d.id}" title="Favorito">${I('star')}</button>`; }
function devRow(d) {
  const s = d.state || {};
  const sub = d.online === false ? 'Offline' : [roomName(d.room), typeof s.power === 'number' && s.on ? `${fmt(s.power, 0)} W` : s.on ? 'Ligado' : 'Desligado'].filter(Boolean).join(' · ');
  const gangs = (s.channels?.length || 0) > 1;
  return `<div class="m-row ${s.on ? 'on' : ''} ${d.online === false ? 'offline' : ''}" data-id="${d.id}">
    <div class="ico">${I(d.type === 'tv' ? 'tv' : d.type === 'switch' || d.type === 'light' || (d.state?.channels?.length || 0) > 1 || /interrup|l[aâ]mpad|\bluz\b/i.test(d.name || '') ? 'light' : 'plug')}</div>
    <div class="grow"><div class="nm">${esc(d.name)}</div><div class="st">${sub}</div>
      ${gangs ? `<div class="m-gangs">${s.channels.map((ch, i) => `<button class="${ch.on ? 'on' : ''}" data-ch="${ch.code}" title="${esc(ch.name || `Tecla ${i + 1}`)}">${I('light')}<span>${esc(ch.name || `Tecla ${i + 1}`)}</span></button>`).join('')}</div>` : ''}</div>
    ${star(d)}<span class="toggle sm ${s.on ? 'on' : ''}" data-act="tg"></span></div>`;
}
// ---------- cartão que expande ao passar o mouse (ar com 3D e controles; interruptor com as teclas) ----------
const expandable = d => d.type === 'ac' || (d.state?.channels?.length || 0) > 1 || d.type === 'switch' || d.type === 'light' || /interruptor|tecla/i.test(d.name || '');
const EXP = {}; // conteúdo expandido de cada aparelho (fica vivo entre as atualizações)
let openId = null, hoverT = null;
function block(d) {
  const inner = d.type === 'ac' ? acCard(d) : devRow(d);
  if (!expandable(d)) return inner;
  return `<div class="m-item ${openId === d.id ? 'open' : ''}" data-item="${d.id}">${inner}<div class="m-exp"><div class="m-exp-in" data-exp="${d.id}"></div></div></div>`;
}
const SLEEP = [0, 60, 120, 240, 480];
function buildExp(d) {
  const el = document.createElement('div'); el.className = 'm-exp-box';
  const c = d.caps || {};
  if (d.type === 'ac') {
    el.innerHTML = `<canvas class="m-ac3d"></canvas>
      <div class="m-tiles">
        ${c.modes?.length ? `<button data-act="mode" class="m-tile"><i data-ico></i><span class="tl">Modo</span><span class="tv" data-v="mode"></span></button>` : ''}
        ${c.fans?.length ? `<button data-act="fan" class="m-tile"><i>${I('fan')}</i><span class="tl">Ventilação</span><span class="tv" data-v="fan"></span></button>` : ''}
        <button data-act="sleep" class="m-tile" ${c.sleep ? '' : 'disabled'}><i>${I('moon')}</i><span class="tl">Sono</span><span class="tv" data-v="sleep"></span></button>
        <button data-act="swing" class="m-tile" ${c.swingV ? '' : 'disabled'}><i>${I('wind')}</i><span class="tl">Direção</span><span class="tv" data-v="swing"></span></button>
      </div>`;
    const ac = new AC3D(el.querySelector('canvas'));
    return { el, ac, update(d) {
      const s = d.state || {};
      ac.set({ on: s.on, target: pending[d.id] ?? s.target, mode: s.mode, swingV: s.swingV, display: s.display });
      const set = (k, v) => { const x = el.querySelector(`[data-v="${k}"]`); if (x) x.textContent = v; };
      set('mode', MODE[s.mode]?.[0] || s.mode || '--'); set('fan', /POWER|JET|TURBO/i.test(s.fan || '') ? 'Turbo' : FAN[s.fan] || s.fan || '--');
      set('sleep', s.sleepMin ? `${Math.round(s.sleepMin / 60)} h` : 'Desligado'); set('swing', s.swingV ? 'Vaivém' : 'Fixa');
      const ico = el.querySelector('[data-ico]'); if (ico) ico.innerHTML = I(MODE[s.mode]?.[1] || 'snow');
      el.querySelector('[data-act=sleep]')?.classList.toggle('active', !!s.sleepMin); el.querySelector('[data-act=swing]')?.classList.toggle('active', !!s.swingV);
    }, dispose() { ac.dispose(); } };
  }
  const chs = d.state?.channels?.length ? d.state.channels : [{ code: '', on: !!d.state?.on }];
  el.innerHTML = `<div class="plate sm m-plate" style="--n:${chs.length}">${chs.map(ch => `<div class="rk-col"><div class="rocker" data-code="${ch.code || ''}"><button class="rk-key" data-set="toggle" title="Ligar ou desligar">${I('light')}</button></div>
      <div class="rk-name"></div></div>`).join('')}</div>`;
  return { el, update(d) {
    const list = d.state?.channels?.length ? d.state.channels : [{ code: '', on: !!d.state?.on }];
    el.querySelectorAll('.rk-col').forEach((col, i) => {
      const ch = list[i]; if (!ch) return; const rk = col.querySelector('.rocker');
      col.querySelector('.rk-name').textContent = list.length > 1 ? (ch.name || `Tecla ${i + 1}`) : '';
      if (rk._pend && Date.now() - rk._pend.t < 2500 && rk._pend.on !== !!ch.on) return;
      rk._pend = null; rk.classList.toggle('on', !!ch.on);
    });
  }, dispose() {} };
}
// recoloca o conteúdo expandido depois de cada redesenho (sem recriar o 3D)
function mountExp() {
  for (const slot of document.querySelectorAll('[data-exp]')) {
    const id = slot.dataset.exp, d = S.devices.find(x => x.id === id); if (!d) continue;
    if (openId !== id && !EXP[id]) continue;
    if (!EXP[id]) EXP[id] = buildExp(d);
    slot.appendChild(EXP[id].el); EXP[id].update(d);
  }
}
function setOpen(id) {
  if (openId === id) return;
  const prev = openId; openId = id;
  if (id) { const slot = document.querySelector(`[data-exp="${id}"]`), d = S.devices.find(x => x.id === id); if (slot && d) { if (!EXP[id]) EXP[id] = buildExp(d); slot.appendChild(EXP[id].el); EXP[id].update(d); } }
  // o cartão escolhido fica parado sob o mouse enquanto o outro fecha (sem "pular" para cima)
  const anchor = id && document.querySelector(`[data-item="${id}"]`), body = $('#m-body');
  const top0 = anchor ? anchor.getBoundingClientRect().top : 0;
  for (const it of document.querySelectorAll('[data-item]')) it.classList.toggle('open', it.dataset.item === id);
  animLock = Date.now() + 600;
  if (anchor) { const t0 = performance.now(); const keep = () => { const a = document.querySelector(`[data-item="${id}"]`); if (!a) return; const dy = a.getBoundingClientRect().top - top0; if (Math.abs(dy) > 0.5) body.scrollTop += dy; if (performance.now() - t0 < 620) requestAnimationFrame(keep); }; requestAnimationFrame(keep); }
  if (prev && prev !== id) setTimeout(() => { if (openId !== prev && EXP[prev]) { EXP[prev].dispose(); EXP[prev].el.remove(); delete EXP[prev]; } }, 650); // libera o 3D depois de fechar
}
let animLock = 0;
document.addEventListener('mouseover', e => {
  const it = e.target.closest('[data-item]');
  if (Date.now() < animLock && it?.dataset.item !== openId) return; // durante a animação, ignora o que passa sob o mouse
  clearTimeout(hoverT);
  if (it) { const id = it.dataset.item; if (id !== openId) hoverT = setTimeout(() => setOpen(id), 230); }
  else if (openId && !e.target.closest('#m-body')) hoverT = setTimeout(() => setOpen(null), 350);
  else if (openId) hoverT = setTimeout(() => setOpen(null), 450);
});
window.addEventListener('mouseout', e => { if (!e.relatedTarget) { clearTimeout(hoverT); hoverT = setTimeout(() => setOpen(null), 400); } }); // mouse saiu da janela

function render() {
  for (const b of document.querySelectorAll('#m-tabs button')) b.classList.toggle('on', b.dataset.tab === S.tab);
  const on = S.devices.filter(d => d.state?.on && d.online !== false);
  const w = S.devices.reduce((a, d) => a + (d.state?.on && typeof d.state.power === 'number' ? d.state.power : 0), 0);
  $('#m-sum').textContent = `${on.length} de ${S.devices.length} ligados${w ? ` · ${fmt(w, 0)} W` : ''}`;
  const body = $('#m-body');
  // não redesenha enquanto o usuário está com o mouse pressionado num botão (evita perder o clique)
  if (body.matches(':active')) { clearTimeout(render._t); render._t = setTimeout(render, 300); return; }
  let html = '';
  if (S.tab === 'fav') {
    const list = S.devices.filter(d => S.fav.has(d.id));
    html = list.length ? list.sort((a, b) => (a.type === 'ac' ? -1 : 0) - (b.type === 'ac' ? -1 : 0)).map(block).join('')
      : `<div class="m-empty">Nenhum favorito ainda.<br>Na aba <b>Cômodos</b>, toque na ${I('star')} dos aparelhos que você mais usa.</div>`;
  } else if (S.tab === 'rooms') {
    const rooms = logicalRooms(S.layout);
    const groups = [...rooms.map(r => [r.id, r.name]), ['_', 'Sem cômodo']];
    for (const [id, name] of groups) {
      const list = S.devices.filter(d => (d.room || '_') === id);
      if (!list.length) continue;
      const anyOn = list.some(d => d.state?.on);
      html += `<div class="m-sec"><span>${esc(name)}</span>${id !== '_' ? `<span class="m-room-tg">${list.filter(d => d.state?.on).length}/${list.length}<span class="toggle sm ${anyOn ? 'on' : ''}" data-room="${id}"></span></span>` : ''}</div>`;
      html += list.map(block).join('');
    }
    if (!html) html = '<div class="m-empty">Nenhum aparelho encontrado.</div>';
  } else {
    html = S.scenes.length ? `<div class="m-scenes">${S.scenes.map(s => `<button class="m-scene" data-scene="${s.id}">${I(s.icon || 'sparkles')}${esc(s.name)}</button>`).join('')}</div>
      <div class="m-sec" style="margin-top:16px"><span>Tudo</span></div>
      <div class="m-chips"><button data-all="1">${I('power')}Ligar tudo</button><button data-all="0">Desligar tudo</button></div>`
      : '<div class="m-empty">Crie cenas na aba Automação do app completo.</div>';
  }
  body.innerHTML = html;
  mountExp();
}

document.addEventListener('click', async e => {
  const st = e.target.closest('[data-star]');
  if (st) { const id = st.dataset.star; S.fav.has(id) ? S.fav.delete(id) : S.fav.add(id); store.set('miniFav', [...S.fav]); render(); return; }
  const sc = e.target.closest('[data-scene]'); if (sc) { await api.runScene(sc.dataset.scene); toast('Cena executada'); return; }
  const al = e.target.closest('[data-all]'); if (al) { api.runAction({ target: { type: 'all' }, command: { action: 'power', value: al.dataset.all === '1' } }); return; }
  const rm = e.target.closest('[data-room]'); if (rm) { api.runAction({ target: { type: 'room', id: rm.dataset.room }, command: { action: 'power', value: !rm.classList.contains('on') } }); return; }
  const host = e.target.closest('[data-id]') || e.target.closest('[data-item]'); if (!host) return; // a parte expandida fica fora da linha
  const d = S.devices.find(x => x.id === (host.dataset.id || host.dataset.item)); if (!d) return;
  const half = e.target.closest('[data-set]');
  if (half) {
    const rk = half.closest('.rocker'), on = half.dataset.set === 'toggle' ? !rk.classList.contains('on') : half.dataset.set === '1';
    if (rk.classList.contains('on') !== on) { rk.classList.remove('clack'); void rk.offsetWidth; rk.classList.add('clack'); }
    rk.classList.toggle('on', on); rk._pend = { on, t: Date.now() };
    cmd(d.id, rk.dataset.code ? { action: 'channel', code: rk.dataset.code, value: on } : { action: 'power', value: on }); return;
  }
  const ch = e.target.closest('[data-ch]');
  if (ch) { cmd(d.id, { action: 'channel', code: ch.dataset.ch, value: !ch.classList.contains('on') }); return; }
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  const s = d.state || {}, c = d.caps || {};
  if (act === 'tg' || act === 'pwr') return cmd(d.id, d.type === 'tv' ? { action: 'toggle' } : { action: 'power', value: !s.on });
  if (act === 'plus' || act === 'minus') {
    const cur = pending[d.id] ?? s.target ?? 23;
    const v = Math.min(c.tempMax ?? 30, Math.max(c.tempMin ?? 16, cur + (act === 'plus' ? 1 : -1) * (c.tempStep || 1)));
    pending[d.id] = v; render(); EXP[d.id]?.update(d);
    clearTimeout(pending['t' + d.id]);
    pending['t' + d.id] = setTimeout(async () => { await cmd(d.id, { action: 'temp', value: v }); setTimeout(() => { delete pending[d.id]; render(); }, 2500); }, 500);
    return;
  }
  const next = (list, v) => list[(list.indexOf(v) + 1) % list.length];
  if (act === 'mode') return cmd(d.id, { action: 'mode', value: next(c.modes, s.mode) });
  if (act === 'fan') return cmd(d.id, { action: 'fan', value: next(c.fans, s.fan) });
  if (act === 'eco') return cmd(d.id, { action: 'eco', value: !s.eco });
  if (act === 'turbo') { const tv = c.fans.find(f => /POWER|JET|TURBO/i.test(f)); const on = /POWER|JET|TURBO/i.test(s.fan || ''); return cmd(d.id, { action: 'fan', value: on ? (c.fans.includes('AUTO') ? 'AUTO' : c.fans[0]) : tv }); }
  if (act === 'sleep') return cmd(d.id, { action: 'sleep', value: next([0, 60, 120, 240, 480], Math.round((s.sleepMin || 0) / 60) * 60) || 0 });
  if (act === 'swing') return cmd(d.id, { action: 'swingV', value: !s.swingV });
});

function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'error' ? 5000 : 2000);
}

init();
