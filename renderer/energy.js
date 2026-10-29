// Aba Energia e painel deste computador: consumo medido e estimado (tomadas, ar, lâmpadas, PC), meta do mês e por cômodo.
import { I } from './icons.js';
import { lampType } from './lamps.js';
import { roomAt as geoRoomAt } from './geom.js';

// ligações com o app (estado e funções do app.js)
let S, $, esc, fmt, dev, roomName, placeName, openPanel, closePanel, toast, foldSections;
export function bindEnergy(c) { ({ S, $, esc, fmt, dev, roomName, placeName, openPanel, closePanel, toast, foldSections } = c); }

// ---------- painel deste computador (consumo estimado pelo uso do processador e da placa de vídeo)
export function pcPanel(root) {
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

let energyHist = {};
// o que entra na aba Energia: aparelhos que medem (ou ar estimado) e luminárias com potência informada
export const LAMP_TYPICAL = { plafon: 24, pendente: 9, spot: 7, trilho: 21, lustre: 30, fita: 14, arandela: 9, coluna: 12, abajur: 9, globo: 9, trio: 27, painel: 24, ventilador: 15, arco: 12, tripe: 12, mesa: 6, balizador: 3 };
export function lampLabel(l) { const r = l.x != null && S.layout ? geoRoomAt(S.layout, l.x, l.y) : null; return { name: lampType(l.type).name, place: r ? roomName(r) : 'Sem cômodo' }; }
export function energyItems() {
  const devs = S.devices.filter(d => typeof d.state?.power === 'number').map(d => ({ key: d.id, open: { type: 'device', id: d.id }, name: d.name, sub: placeName ? placeName(d) : roomName(d.room), room: d.room ? roomName(d.room) : 'Sem cômodo', on: !!d.state.on, w: d.state.on ? d.state.power : 0, est: !!d.state.powerEst }));
  const lamps = (S.lampLoads || []).map(l => { const lb = lampLabel(l); const sw = l.link?.dev ? dev(l.link.dev) : null;
    return { key: 'lamp:' + l.id, open: sw ? { type: 'device', id: sw.id } : null, name: lb.name, sub: lb.place, room: lb.place, on: l.on, w: l.power, est: true, lamp: true }; });
  const pc = S.pcLoad ? [{ key: 'pc', open: { type: 'pc' }, name: 'Este computador', sub: S.pcLoad.name || 'PC', room: 'Sem cômodo', on: true, w: S.pcLoad.total, est: true, pc: true }] : [];
  return [...pc, ...devs, ...lamps];
}
export async function renderEnergy() {
  for (const it of energyItems()) energyHist[it.key] = await api.getEnergy(it.key);
  const el = $('#view-energy');
  el.innerHTML = `<div class="dv en">
    <div class="dv-main">
      <div class="dv-info" data-einfo></div>
      <h1 class="dv-hello">Energia,<br><span data-ehello></span></h1>
      <div class="en-kpis" data-kpis></div>
      <div class="en-duo"><div class="en-card" data-split></div><div class="en-card" data-goal></div></div>
      <div class="en-chart"><div class="en-chart-h"><b>Potência total</b><span>últimas 24 horas</span></div><canvas class="chart" data-total></canvas></div>
      <div class="en-card en-rooms"><div class="en-chart-h"><b>Por cômodo</b><span>últimas 24 horas</span></div><div data-rooms></div></div>
    </div>
    <div class="dv-side">
      <div class="dv-side-h"><h2>Por aparelho</h2><span data-ecount></span></div>
      <div class="en-list" data-rows></div>
    </div></div>`;
  renderEnergyLive();
}
export function kwh24(h) { const pts = h.filter(p => p[0] > Date.now() - 864e5); let e = 0; for (let i = 1; i < pts.length; i++) { const dt = (pts[i][0] - pts[i - 1][0]) / 36e5; if (dt < 0.5) e += (pts[i][1] + pts[i - 1][1]) / 2 * dt; } return e / 1000; }
export function renderEnergyLive() {
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
  // medido x estimado
  const kMeas = per.filter(p => !p.it.est).reduce((a, p) => a + p.k, 0), kEst = tot - kMeas, pm = tot ? kMeas / tot * 100 : 0;
  $('[data-split]', el).innerHTML = `<div class="en-ch"><b>De onde vêm os números</b></div>
    <div class="en-split-bar"><i class="m" style="width:${pm}%"></i><i class="e" style="width:${tot ? 100 - pm : 0}%"></i></div>
    <div class="en-legend"><span><i class="m"></i>Medido <b>${fmt(kMeas, 2)} kWh</b></span><span><i class="e"></i>Estimado <b>${fmt(kEst, 2)} kWh</b></span></div>
    <p class="en-note">Medido vem das tomadas que medem de verdade. Estimado é calculado pela potência informada (ar, lâmpadas, computador).</p>`;
  // meta do mês
  const goal = +S.energyGoal || 0, proj = tot * tariff * 30, gp = goal ? Math.min(100, proj / goal * 100) : 0, over = goal && proj > goal, near = goal && proj > goal * 0.9;
  $('[data-goal]', el).innerHTML = goal ? `<div class="en-ch"><b>Meta do mês</b><button class="link-btn" data-goal-edit>mudar</button></div>
      <div class="en-goal-v"><b>R$ ${fmt(proj, 0)}</b><span>de R$ ${fmt(goal, 0)}</span></div>
      <div class="en-goal-bar ${over ? 'over' : near ? 'near' : ''}"><i style="width:${gp}%"></i></div>
      <p class="en-note">${over ? `No ritmo de hoje, passa da meta em <b>R$ ${fmt(proj - goal, 0)}</b>. Você recebe um aviso por dia enquanto estiver acima.` : near ? 'Perto da meta.' : `Dentro da meta, sobram ~R$ ${fmt(goal - proj, 0)}.`}</p>`
    : `<div class="en-ch"><b>Meta do mês</b></div><p class="en-note" style="margin-top:6px">Defina quanto quer gastar de luz por mês. O app compara com a projeção e avisa no PC e no celular se passar.</p><button class="btn sm" data-goal-edit>${I('plus')}Definir meta</button>`;
  $('[data-goal-edit]', el).onclick = () => {
    const box = $('[data-goal]', el);
    box.innerHTML = `<div class="en-ch"><b>Meta do mês</b></div><div class="en-goal-form"><span>R$</span><input type="number" min="0" step="10" value="${goal || Math.ceil(proj / 10) * 10 || 200}" data-goal-in><button class="btn sm primary" data-goal-ok>Salvar</button>${goal ? '<button class="btn sm" data-goal-off>Sem meta</button>' : ''}</div>`;
    const inp = $('[data-goal-in]', box); inp.focus(); inp.select();
    const save = async v => { S.energyGoal = v; await api.save('energyGoal', v); renderEnergyLive(); toast(v ? 'Meta salva' : 'Meta removida'); };
    $('[data-goal-ok]', box).onclick = () => save(Math.max(0, Math.round(+inp.value || 0)));
    inp.onkeydown = e => { if (e.key === 'Enter') save(Math.max(0, Math.round(+inp.value || 0))); };
    if ($('[data-goal-off]', box)) $('[data-goal-off]', box).onclick = () => save(0);
  };
  // por cômodo
  const byRoom = new Map();
  for (const { it, k } of per) { const r = byRoom.get(it.room) || { k: 0, w: 0, n: 0 }; r.k += k; r.w += it.w; r.n++; byRoom.set(it.room, r); }
  const rooms = [...byRoom.entries()].sort((a, b) => b[1].k - a[1].k || b[1].w - a[1].w), rmax = Math.max(0.001, ...rooms.map(r => r[1].k));
  $('[data-rooms]', el).innerHTML = rooms.map(([n, r]) => `<div class="en-room"><div class="en-room-t"><b>${esc(n)}</b><span>${fmt(r.w, 0)} W agora · ${fmt(r.k, 2)} kWh · R$ ${fmt(r.k * tariff, 2)}</span></div><div class="bar"><i style="width:${r.k / rmax * 100}%"></i></div></div>`).join('') || '<p class="en-note">Nada medindo ainda.</p>';
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

export function drawLine(cv, pts, color, unit) {
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

