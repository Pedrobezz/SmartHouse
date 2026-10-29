// Ponte do app para o navegador do celular: implementa window.api falando com o PC por HTTP.
(function () {
  const qs = new URLSearchParams(location.search);
  let key = qs.get('k');
  try { if (!key) key = localStorage.getItem('c3k'); } catch (_) {}
  const remember = () => { try { localStorage.setItem('c3k', key); } catch (_) {} }; // só guarda a chave depois que o PC aceitar
  try { if (!localStorage.getItem('quality')) localStorage.setItem('quality', 'medium'); } catch (_) {}
  document.documentElement.classList.add('web');
  if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) document.documentElement.classList.add('standalone');
  // convite para instalar como app (ícone na tela inicial, tela cheia): some depois de instalado ou se a pessoa dispensar
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const showHint = () => {
    if (document.querySelector('#modal-root')?.children.length) return setTimeout(showHint, 3000); // espera fechar o "O que há de novo"
    let skip = false; try { skip = localStorage.getItem('installHint') === 'no'; } catch (_) {}
    if (standalone || skip || !document.querySelector('#app')) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), share = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
    const b = document.createElement('div'); b.className = 'install-hint';
    b.innerHTML = `<img src="assets/touch-icon.png" alt=""><div><b>Instale o SmartHouse</b><span>${ios ? `Toque em ${share} <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.` : 'No menu <b>⋮</b> do navegador, toque em <b>Adicionar à tela inicial</b> (ou <b>Instalar app</b>).'} Abre em tela cheia, como um app.</span></div><button aria-label="Dispensar">✕</button>`;
    b.querySelector('button').onclick = () => { b.remove(); try { localStorage.setItem('installHint', 'no'); } catch (_) {} };
    document.body.appendChild(b);
  };
  window.addEventListener('load', () => setTimeout(showHint, 2500));
  // atalhos do ícone (Dispositivos / Energia)
  if (/^#(devices|energy)$/.test(location.hash)) window.addEventListener('load', () => setTimeout(() => document.querySelector(`[data-view="${location.hash.slice(1)}"]`)?.click(), 800));

  const L = { update: [], log: [] };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function banner(msg) {
    let b = document.getElementById('conn-banner');
    if (!msg) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'conn-banner'; document.body.appendChild(b); }
    b.textContent = msg;
  }
  function locked() {
    document.body.innerHTML = `<div class="locked"><img class="brand-logo" src="assets/logo-ui.svg" alt=""><h2>Conecte o celular</h2>
      <p>No PC, abra o SmartHouse em <b>Ajustes → Celular</b> e leia o QR code com a câmera do iPhone.</p></div>`;
  }

  async function call(method, url, body) {
    let r;
    try {
      r = await fetch(url, { method, headers: { 'x-key': key || '', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    } catch (_) { throw new Error('Sem conexão com o PC de casa'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { locked(); throw new Error(j.error || 'Acesso negado'); }
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
    return j;
  }

  // primeira carga: insiste até o PC responder
  async function getAllRetry() {
    for (let i = 0; ; i++) {
      try { const a = await call('GET', 'api/all'); banner(''); remember(); return a; }
      catch (e) {
        if (/Acesso negado|inválida/.test(e.message)) throw e;
        banner('Procurando o PC de casa… Confira se ele está ligado e se o Tailscale está ativo no iPhone.');
        await sleep(Math.min(8000, 1500 + i * 1000));
      }
    }
  }

  // atualizações em tempo real (Server-Sent Events), com reconexão
  let es = null, lostAt = 0;
  function connect() {
    if (!key) return;
    es = new EventSource('api/events?k=' + encodeURIComponent(key));
    es.addEventListener('update', e => { const d = JSON.parse(e.data); L.update.forEach(cb => cb(d)); });
    es.addEventListener('log', e => { const d = JSON.parse(e.data); L.log.forEach(cb => cb(d)); });
    es.onopen = async () => {
      banner('');
      if (lostAt) { lostAt = 0; try { const a = await call('GET', 'api/all'); L.update.forEach(cb => cb(a)); } catch (_) {} }
    };
    es.onerror = () => {
      if (!lostAt) lostAt = Date.now();
      setTimeout(() => { if (lostAt && Date.now() - lostAt > 2500) banner('Sem conexão com o PC de casa. Tentando de novo…'); }, 3000);
    };
  }
  // o iOS congela a página em segundo plano: ao voltar, reconecta e atualiza
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!es || es.readyState === 2) { es && es.close(); connect(); }
    call('GET', 'api/all').then(a => L.update.forEach(cb => cb(a))).catch(() => {});
  });

  const onlyPc = () => Promise.reject(new Error('Disponível só no app do PC'));
  window.api = {
    web: true,
    getAll: () => { if (!es) connect(); return getAllRetry(); },
    command: (id, cmd) => call('POST', 'api/command', { id, cmd }),
    runAction: a => call('POST', 'api/action', { a }),
    runScene: id => call('POST', 'api/scene', { id }),
    deviceProfile: id => call('GET', 'api/profile?id=' + encodeURIComponent(id)),
    getEnergy: id => call('GET', 'api/energy?id=' + encodeURIComponent(id)),
    getEnergyDaily: () => call('GET', 'api/energy-daily'),
    save: (k, value) => call('POST', 'api/save', { key: k, value }),
    rename: (id, name) => call('POST', 'api/rename', { id, name }),
    saveSettings: onlyPc, tuyaScan: onlyPc, tuyaAdd: onlyPc, tuyaRemove: onlyPc, ewelinkLogin: onlyPc, ewelinkLogout: onlyPc, resetLayout: onlyPc,
    updaterCheck: onlyPc, updaterInstall: onlyPc,
    setSeenVersion: v => { try { localStorage.setItem('seenVersion', v); } catch (_) {} return Promise.resolve(true); },
    updaterState: () => Promise.resolve({ status: 'idle' }),
    openMini: () => {}, setTheme: () => {},
    onUpdater: () => {}, onSaved: () => {},
    onUpdate: cb => L.update.push(cb),
    onLog: cb => L.log.push(cb),
  };
})();
