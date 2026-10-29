let lastZoom = 1;
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, screen, Notification, powerSaveBlocker, net } = require('electron');
// SmartHouse (antes "Casa 3D"): continua usando a mesma pasta de dados, para não perder ajustes, chaves e planta
app.setPath('userData', require('path').join(app.getPath('appData'), 'Casa 3D'));
// padrão brasileiro em todo o app: horas em 24 h e vírgula nos números, independente do idioma do Windows
app.commandLine.appendSwitch('lang', 'pt-BR');
const path = require('path');
const fs = require('fs');
const { Store } = require('./src/store');
const { Hub } = require('./src/hub');
const { EWeLinkCloud } = require('./src/ewelink');
const { RemoteServer } = require('./src/remote');
const QRCode = require('qrcode');
const { Updater } = require('./src/updater');

let win, mini, tray, store, hub, remote, awakeId = null;
const UPDATE_REPO = 'Pedrobezz/SmartHouse'; // onde as versões novas são publicadas
const updRepo = () => ((store.get('settings').update || {}).repo || UPDATE_REPO).trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#0b0b0c',
    title: 'SmartHouse',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0b0c', symbolColor: '#e5e5ea', height: 44 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', e => {
    // Fecha para a bandeja: agendamentos continuam rodando
    if (!quitting && store.get('settings').keepInTray !== false) { e.preventDefault(); win.hide(); }
  });
}

// ---------------- Mini Casa (janela compacta sempre por cima, estilo miniplayer) ----------------
// "sempre por cima": no Windows o nível 'floating' se perde com o Alt+Tab; 'screen-saver' fica por cima de verdade
const MINI_LEVEL = process.platform === 'win32' ? 'screen-saver' : 'floating';
const miniPinned = () => store.get('settings').miniPinned !== false;
function pinMini(on) { if (!mini || mini.isDestroyed()) return; mini.setAlwaysOnTop(!!on, MINI_LEVEL); if (on) mini.moveTop(); }
// traz a Mini para a frente mesmo com o Windows bloqueando "roubo de foco": tira do minimizado, sobe ao topo e foca
function bringMini() {
  if (mini.isMinimized()) mini.restore();
  mini.show();
  mini.setAlwaysOnTop(true, MINI_LEVEL); mini.moveTop(); mini.focus();
  if (!miniPinned()) setTimeout(() => { if (mini && !mini.isDestroyed()) mini.setAlwaysOnTop(false); }, 300);
}
if (process.env.SH_TEST) global.__sh = { get mini() { return mini; }, openMini: () => openMini(), pin: on => { const st = store.get('settings'); st.miniPinned = on; store.set('settings', st); pinMini(on); } }; // só para testes automáticos
function openMini() {
  if (mini && !mini.isDestroyed()) { bringMini(); return; }
  const st = store.get('settings');
  const b = st.miniBounds || {};
  const wa = screen.getPrimaryDisplay().workArea;
  const width = b.width || 360, height = b.height || 600;
  let x = b.x ?? wa.x + wa.width - width - 24, y = b.y ?? wa.y + wa.height - height - 24;
  // garante que fique visível se o monitor mudou
  if (!screen.getAllDisplays().some(d => x >= d.workArea.x - 50 && y >= d.workArea.y - 50 && x < d.workArea.x + d.workArea.width && y < d.workArea.y + d.workArea.height)) {
    x = wa.x + wa.width - width - 24; y = wa.y + wa.height - height - 24;
  }
  mini = new BrowserWindow({
    width, height, x, y, minWidth: 300, minHeight: 220, maxWidth: 520,
    frame: false, resizable: true, maximizable: false, fullscreenable: false, alwaysOnTop: st.miniPinned !== false,
    backgroundColor: '#000000', title: 'SmartHouse Mini', icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  if (st.miniPinned !== false) mini.setAlwaysOnTop(true, MINI_LEVEL);
  // fixada: ao perder o foco (Alt+Tab, clique em outro app) reafirma que fica por cima
  mini.on('blur', () => { if (miniPinned()) setTimeout(() => pinMini(true), 50); });
  mini.on('show', () => { if (miniPinned()) pinMini(true); });
  mini.loadFile(path.join(__dirname, 'renderer', 'mini.html'));
  const saveBounds = () => { if (mini.isDestroyed()) return; const s2 = store.get('settings'); s2.miniBounds = mini.getBounds(); store.set('settings', s2); };
  mini.on('moved', saveBounds); mini.on('resized', saveBounds);
  mini.on('closed', () => { mini = null; });
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('SmartHouse');
  const scenes = () => (store.get('scenes') || []).map(s => ({ label: s.name, click: () => hub.runScene(s.id) }));
  const build = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir SmartHouse', click: () => { win.show(); win.focus(); } },
    { label: 'SmartHouse Mini (sempre por cima)', click: () => openMini() },
    { type: 'separator' },
    { label: 'Cenas', submenu: scenes() },
    { label: 'Desligar tudo', click: () => hub.runAction({ target: { type: 'all' }, command: { action: 'power', value: false } }) },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]));
  build();
  tray.on('click', () => { win.isVisible() ? win.focus() : win.show(); });
  return build;
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.casa3d.app');
  // o app se chamava "Casa 3D": troca o atalho de inicialização com o Windows para o nome novo
  if (process.platform === 'win32' && app.isPackaged) {
    try { app.setLoginItemSettings({ openAtLogin: false, name: 'Casa 3D' }); } catch (_) {}
  }
  store = new Store(app.getPath('userData'));
  if (process.platform === 'win32' && app.isPackaged) { try { if (store.get('settings')?.startWithWindows) app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); } catch (_) {} }
  hub = new Hub(store);
  { const { powerMonitor } = require('electron'); const { PcMonitor } = require('./src/pcmon'); hub.pcmon = new PcMonitor({ getDisplays: () => screen.getAllDisplays(), getIdleSec: () => powerMonitor.getSystemIdleTime() }); }
  createWindow();
  const rebuildTray = createTray();

  const send = (ch, data) => { for (const w of [win, mini]) if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
  hub.on('update', snap => send('update', snap));
  hub.on('log', l => send('log', l));
  hub.on('notify', n => {
    if (Notification.isSupported()) {
      const nt = new Notification({ title: n.title, body: n.body, icon: path.join(__dirname, 'renderer', 'assets', 'icon.png') });
      nt.on('click', () => { win.show(); win.focus(); }); nt.show();
    }
    send('log', { t: Date.now(), msg: `🔔 ${n.title}: ${n.body}`, level: 'info' });
    pushPhone(n);
  });
  // notificação no iPhone pelo app gratuito ntfy (o tópico funciona como senha)
  function pushPhone(n) {
    const m = store.get('settings').mobile || {};
    if (!m.ntfyTopic) return;
    const click = remote?.info().urls.find(u => u.kind === 'tailscale')?.url;
    fetch('https://ntfy.sh/', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: m.ntfyTopic, title: n.title, message: n.body, tags: ['house'], ...(click ? { click } : {}) }) })
      .catch(e => hub.log('Notificação no celular falhou: ' + e.message, 'error'));
  }
  function applyAwake() {
    const m = store.get('settings').mobile || {};
    const want = !!m.enabled && m.keepAwake !== false;
    if (want && awakeId === null) awakeId = powerSaveBlocker.start('prevent-app-suspension');
    if (!want && awakeId !== null) { powerSaveBlocker.stop(awakeId); awakeId = null; }
  }
  // atalho: se a Mini já está na frente, fecha; se está escondida atrás de outra janela ou minimizada, traz para a frente
  globalShortcut.register('CommandOrControl+Shift+M', () => (mini && !mini.isDestroyed() && mini.isVisible() && !mini.isMinimized() && mini.isFocused() ? mini.close() : openMini()));
  // tamanho do texto: zoom da janela (a barra de título acompanha)
  ipcMain.handle('set-zoom', (e, z) => {
    const f = Math.min(1.4, Math.max(0.9, +z || 1)); e.sender.setZoomFactor(f);
    if (e.sender === win?.webContents) { lastZoom = f; try { win.setTitleBarOverlay({ height: Math.round(44 * f) }); } catch (_) {} }
  });
  ipcMain.handle('set-theme', (_, t) => {
    const light = t === 'light';
    try { win.setTitleBarOverlay({ color: light ? '#e8e8ed' : '#0e0e0f', symbolColor: light ? '#1d1d1f' : '#e5e5ea', height: Math.round(44 * lastZoom) }); } catch (_) {}
    win.setBackgroundColor(light ? '#e8e8ed' : '#0e0e0f');
    if (mini && !mini.isDestroyed()) mini.setBackgroundColor(light ? '#f5f5f7' : '#1c1c1e');
    return true;
  });
  ipcMain.handle('mini-open', () => { openMini(); return true; });
  ipcMain.handle('mini-close', () => { mini && !mini.isDestroyed() && mini.close(); return true; });
  ipcMain.handle('mini-pin', (_, on) => {
    const st = store.get('settings'); st.miniPinned = on; store.set('settings', st);
    pinMini(!!on);
    return on;
  });
  ipcMain.handle('mini-height', (_, h) => { if (mini && !mini.isDestroyed()) { const b = mini.getBounds(); mini.setBounds({ ...b, height: Math.round(h) }, true); } return true; });
  ipcMain.handle('open-main', () => { win.show(); win.focus(); return true; });
  if (process.argv.includes('--mini')) openMini();

  // ---------------- atualização automática ----------------
  const updState = { status: 'idle', version: null, message: '', notes: [] };
  const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
  const canUpdate = () => process.platform === 'win32' && app.isPackaged && !isPortable;
  const setUpd = patch => { Object.assign(updState, patch); send('updater', { ...updState, current: app.getVersion(), portable: isPortable }); };
  const feedUrl = () => { const [owner, repo] = updRepo().split('/'); return `https://raw.githubusercontent.com/${owner}/${repo}/updates/`; };
  const updater = new Updater(feedUrl());
  // o endereço "raw" do GitHub guarda cópia por ~5 min; pegando o commit mais recente pela API, a versão nova aparece na hora
  updater.resolve = async () => {
    const [owner, repo] = updRepo().split('/');
    const r = await net.fetch(`https://api.github.com/repos/${owner}/${repo}/commits/updates`, { headers: { accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('api ' + r.status);
    const sha = (await r.json()).sha; if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error('sha');
    return `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/`;
  };
  updater.on('state', st => setUpd(st));
  updater.on('downloaded', i => {
    if (Notification.isSupported()) {
      const n = new Notification({ title: 'SmartHouse', body: `A versão ${i.version} foi baixada. Clique em "Reiniciar e atualizar".` });
      n.on('click', () => { win.show(); win.focus(); }); n.show();
    }
  });
  const check = () => { if (canUpdate()) { updater.setBase(feedUrl()); updater.check(); } };
  setTimeout(check, 15000);
  setInterval(check, 3600 * 1000); // procura de hora em hora (só baixa quando há versão nova)
  ipcMain.handle('updater-state', () => ({ ...updState, current: app.getVersion(), portable: isPortable, packaged: app.isPackaged, configured: true, repo: updRepo() }));
  ipcMain.handle('updater-check', async () => {
    if (isPortable) throw new Error('A versão portátil não se atualiza sozinha. Instale com o SmartHouse-Setup.exe.');
    if (!app.isPackaged) throw new Error('Atualização só funciona no app instalado.');
    updater.setBase(feedUrl()); await updater.check(); return true;
  });
  ipcMain.handle('seen-version', (_, v) => { const st = store.get('settings'); st.seenVersion = v; store.set('settings', st); return true; });
  ipcMain.handle('updater-install', () => { updater.install(); quitting = true; setTimeout(() => app.quit(), 300); return true; });

  const all = () => ({
    ...hub.snapshot(),
    layout: store.get('layout'), placements: store.get('placements'), scenes: store.get('scenes'), links: store.get('links') || [], acPower: store.get('acPower') || {}, pcConf: store.get('pcConf') || {}, energyGoal: store.get('energyGoal') || 0,
    schedules: store.get('schedules'), rules: store.get('rules'), settings: store.get('settings'), logs: hub.logs, version: app.getVersion(),
  });

  remote = new RemoteServer({ store, hub, all, rendererDir: path.join(__dirname, 'renderer'), log: (m, l) => hub.log(m, l) });
  remote.onSaved = key => { if (key === 'scenes') rebuildTray(); for (const w of [win, mini]) if (w && !w.isDestroyed()) w.webContents.send('saved', key); };
  const mobileInfo = async () => {
    const i = remote.info();
    i.qr = {};
    for (const u of i.urls) i.qr[u.ip] = await QRCode.toDataURL(u.url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
    return i;
  };
  ipcMain.handle('mobile-info', () => mobileInfo());
  ipcMain.handle('mobile-regen', async () => { remote.regenerate(); return { info: await mobileInfo(), all: all() }; });
  ipcMain.handle('mobile-test-push', () => { pushPhone({ title: 'SmartHouse', body: 'Teste: as notificações estão chegando no seu celular.' }); return true; });
  ipcMain.handle('get-all', () => all());
  ipcMain.handle('command', (_, id, cmd) => hub.command(id, cmd));
  ipcMain.handle('run-action', (_, a) => hub.runAction(a));
  ipcMain.handle('run-scene', (_, id) => hub.runScene(id));
  ipcMain.handle('device-profile', (_, id) => hub.lgProfiles[id] || { caps: hub.devices.get(id)?.caps, state: hub.devices.get(id)?.state });
  ipcMain.handle('get-energy', (_, id) => store.get('energy')[id] || []);
  ipcMain.handle('get-energy-daily', () => store.get('energyDaily') || {});
  ipcMain.handle('save', (_, key, value) => {
    if (!['layout', 'placements', 'scenes', 'schedules', 'aliases', 'rules', 'links', 'acPower', 'pcConf', 'energyGoal'].includes(key)) throw new Error('chave inválida');
    store.set(key, value);
    if (key === 'scenes') rebuildTray();
    hub._emit();
    return all();
  });
  // backup da casa (sem senhas): exportar para um arquivo e restaurar de um arquivo
  ipcMain.handle('backup-export', async () => {
    const { dialog } = require('electron'), { makeBackup } = require('./src/backup');
    const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = await dialog.showSaveDialog(win, { title: 'Salvar backup da casa', defaultPath: path.join(app.getPath('documents'), `SmartHouse-backup-${stamp}.json`), filters: [{ name: 'Backup do SmartHouse', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(makeBackup(store, app.getVersion()), null, 1));
    return true;
  });
  ipcMain.handle('backup-import', async () => {
    const { dialog } = require('electron'), { applyBackup } = require('./src/backup');
    const r = await dialog.showOpenDialog(win, { title: 'Restaurar backup da casa', properties: ['openFile'], filters: [{ name: 'Backup do SmartHouse', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths?.[0]) return null;
    let obj; try { obj = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch (_) { throw new Error('Não consegui ler o arquivo. Ele é um backup do SmartHouse?'); }
    const c = await dialog.showMessageBox(win, { type: 'question', buttons: ['Restaurar', 'Cancelar'], defaultId: 1, cancelId: 1, title: 'Restaurar backup', message: 'Substituir a casa atual pelo backup?', detail: 'Planta, aparelhos no mapa, cenas, regras, horários e nomes serão trocados pelos do arquivo. As contas conectadas continuam como estão.' });
    if (c.response !== 0) return null;
    applyBackup(store, obj);
    await hub.start();
    rebuildTray?.();
    return { all: all(), date: obj.date };
  });
  ipcMain.handle('rename', (_, id, name) => {
    const a = store.get('aliases'); a[id] = name; store.set('aliases', a); hub._emit(); return true;
  });
  ipcMain.handle('save-settings', async (_, settings) => {
    store.set('settings', settings);
    if (process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: !!settings.startWithWindows, args: ['--hidden'] });
    await hub.start();
    await remote.apply(); applyAwake();
    return all();
  });
  ipcMain.handle('tuya-scan', () => hub.scanLan());
  ipcMain.handle('tuya-add', async (_, rec) => { hub.addManualTuya(rec); await hub.start(); return all(); });
  ipcMain.handle('tuya-remove', async (_, id) => { hub.removeTuya(id); await hub.start(); return all(); });
  // Login oficial eWeLink (OAuth2) numa janela; o redirecionamento é interceptado, não precisa de servidor
  ipcMain.handle('ewelink-login', async (_, cfgIn) => {
    const st = store.get('settings');
    const cfg = { ...st.ewelink, ...cfgIn };
    if (!cfg.appId || !cfg.appSecret) throw new Error('Preencha o APPID e o APP SECRET');
    const redirectUrl = cfg.redirectUrl || 'https://127.0.0.1/casa3d';
    const cloud = new EWeLinkCloud(cfg);
    const authWin = new BrowserWindow({ width: 480, height: 760, parent: win, modal: true, title: 'Entrar na eWeLink', backgroundColor: '#ffffff',
      webPreferences: { partition: 'ewelink-oauth', contextIsolation: true } });
    authWin.setMenuBarVisibility(false);
    const result = await new Promise(resolve => {
      let done = false;
      const finish = url => {
        if (done) return; done = true;
        try { const u = new URL(url); resolve({ code: u.searchParams.get('code'), region: u.searchParams.get('region') }); } catch (_) { resolve(null); }
        setTimeout(() => !authWin.isDestroyed() && authWin.close(), 50);
      };
      const check = (e, url) => { if (url && url.startsWith(redirectUrl)) { e?.preventDefault?.(); finish(url); } };
      authWin.webContents.on('will-redirect', check);
      authWin.webContents.on('will-navigate', check);
      authWin.webContents.session.webRequest.onBeforeRequest((d, cb) => { if (d.url.startsWith(redirectUrl)) { finish(d.url); cb({ cancel: true }); } else cb({}); });
      authWin.on('closed', () => { if (!done) { done = true; resolve(null); } });
      authWin.loadURL(cloud.loginUrl(redirectUrl));
    });
    if (!result?.code) throw new Error('Login cancelado');
    await cloud.exchangeCode(result.code, result.region || cfg.region, redirectUrl);
    st.ewelink = { ...cfg, enabled: true, at: cloud.cfg.at, rt: cloud.cfg.rt, region: cloud.cfg.region };
    store.set('settings', st);
    await hub.start();
    return all();
  });
  ipcMain.handle('ewelink-logout', async () => {
    const st = store.get('settings'); st.ewelink = { ...st.ewelink, at: '', rt: '' }; store.set('settings', st); await hub.start(); return all();
  });
  ipcMain.handle('reset-layout', () => { store.set('layout', null); store.set('placements', {}); return all(); });

  await hub.start();
  await remote.apply(); applyAwake();
  if (process.argv.includes('--hidden')) win.hide();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { quitting = true; store && store.flush(); hub && hub.stop(); remote && remote.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && quitting) app.quit(); });
