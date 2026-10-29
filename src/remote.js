// Acesso pelo celular: o PC serve o próprio app (versão para iPhone) e uma API protegida por chave.
// Fora de casa, o acesso é feito pela rede privada do Tailscale (nada fica exposto na internet).
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
// campos que nunca saem do PC
const SECRET_KEYS = /^(accessSecret|appSecret|token|pat|at|rt|password|local_?key|localKey|devicekey|secret|refresh_?token|access_?token)$/i;
const SAVE_KEYS = ['scenes', 'schedules', 'rules', 'aliases', 'links', 'acPower', 'pcConf', 'energyGoal'];

function sanitize(v) {
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!SECRET_KEYS.test(k)) o[k] = sanitize(x);
    return o;
  }
  return v;
}

function newToken() { return crypto.randomBytes(18).toString('base64url'); }

// IPs deste PC: Tailscale (100.64.0.0/10) primeiro, depois a rede de casa
function addresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const [p1, p2] = a.address.split('.').map(Number);
      const ts = p1 === 100 && p2 >= 64 && p2 <= 127;
      if (!ts && /vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker/i.test(name)) continue;
      out.push({ ip: a.address, kind: ts ? 'tailscale' : 'lan', iface: name });
    }
  }
  return out.sort((a, b) => (a.kind === 'tailscale' ? -1 : 0) - (b.kind === 'tailscale' ? -1 : 0));
}

class RemoteServer {
  constructor({ store, hub, all, rendererDir, log }) {
    Object.assign(this, { store, hub, all, rendererDir, log });
    this.server = null; this.clients = new Set(); this.fails = new Map();
    hub.on('update', snap => this._broadcast('update', sanitize(snap)));
    hub.on('log', l => this._broadcast('log', l));
    this._hb = setInterval(() => { for (const c of this.clients) c.write(': ping\n\n'); }, 25000);
  }

  cfg() {
    const s = this.store.get('settings');
    if (!s.mobile) s.mobile = {};
    if (!s.mobile.token) { s.mobile.token = newToken(); this.store.set('settings', s); }
    return { port: 8787, ...s.mobile };
  }
  regenerate() {
    const s = this.store.get('settings'); s.mobile = { ...(s.mobile || {}), token: newToken() }; this.store.set('settings', s);
    for (const c of this.clients) c.end(); this.clients.clear();
    return this.cfg();
  }
  info() {
    const c = this.cfg();
    const urls = addresses().map(a => ({ ...a, url: `http://${a.ip}:${c.port}/?k=${c.token}` }));
    return { enabled: !!c.enabled, running: !!this.server?.listening, port: c.port, token: c.token, urls, error: this.error || '', clients: this.clients.size };
  }

  async apply() {
    const c = this.cfg();
    const want = c.enabled ? c.port : null;
    if (this.server && this._port === want) return;
    await this.stop();
    if (!want) return;
    this.error = '';
    await new Promise(resolve => {
      const srv = http.createServer((req, res) => this._handle(req, res).catch(e => this._json(res, 500, { error: e.message })));
      srv.on('error', e => {
        this.error = e.code === 'EADDRINUSE' ? `A porta ${want} já está em uso por outro programa. Troque a porta.` : e.message;
        this.log?.('Acesso pelo celular: ' + this.error, 'error'); this.server = null; resolve();
      });
      srv.listen(want, '0.0.0.0', () => { this.server = srv; this._port = want; this.log?.(`Acesso pelo celular ativo na porta ${want}`); resolve(); });
    });
  }
  async stop() {
    for (const c of this.clients) c.end(); this.clients.clear();
    if (!this.server) return;
    await new Promise(r => this.server.close(() => r()));
    this.server = null; this._port = null;
  }

  // ---------------------------------------------------------------- HTTP
  _auth(req, url) {
    const ip = req.socket.remoteAddress || '';
    const f = this.fails.get(ip);
    if (f && f.n >= 20 && Date.now() - f.t < 10 * 60e3) return false; // muitas tentativas erradas: bloqueia por 10 min
    const given = String(req.headers['x-key'] || url.searchParams.get('k') || '');
    const tok = this.cfg().token;
    const ok = given.length === tok.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(tok));
    if (!ok) this.fails.set(ip, { n: (f && Date.now() - f.t < 10 * 60e3 ? f.n : 0) + 1, t: Date.now() });
    return ok;
  }
  _json(res, code, obj) {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  }
  _body(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > 2e6) { reject(new Error('requisição muito grande')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('JSON inválido')); } });
      req.on('error', reject);
    });
  }
  _broadcast(ev, data) {
    if (!this.clients.size) return;
    const msg = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients) c.write(msg);
  }

  async _handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);

    if (p.startsWith('/api/')) {
      if (!this._auth(req, url)) return this._json(res, 401, { error: 'Chave de acesso inválida. Leia o QR code de novo no PC (Ajustes → Celular).' });
      const r = p.slice(5);
      if (r === 'events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write('retry: 3000\n\n');
        this.clients.add(res);
        req.on('close', () => this.clients.delete(res));
        return;
      }
      if (req.method === 'GET') {
        if (r === 'all') return this._json(res, 200, sanitize(this.all()));
        if (r === 'energy-daily') return this._json(res, 200, this.store.get('energyDaily') || {});
        if (r === 'energy') return this._json(res, 200, this.store.get('energy')[url.searchParams.get('id')] || []);
        if (r === 'profile') { const id = url.searchParams.get('id'); const d = this.hub.devices.get(id); return this._json(res, 200, sanitize(this.hub.lgProfiles?.[id] || { caps: d?.caps, state: d?.state })); }
      }
      if (req.method === 'POST') {
        const b = await this._body(req);
        try {
          if (r === 'command') return this._json(res, 200, { ok: await this.hub.command(String(b.id), b.cmd || {}) ?? true });
          if (r === 'action') return this._json(res, 200, { ok: await this.hub.runAction(b.a) ?? true });
          if (r === 'scene') return this._json(res, 200, { ok: await this.hub.runScene(String(b.id)) ?? true });
          if (r === 'rename') { const a = this.store.get('aliases'); a[String(b.id)] = String(b.name || '').slice(0, 80); this.store.set('aliases', a); this.hub._emit(); return this._json(res, 200, { ok: true }); }
          if (r === 'save') {
            if (!SAVE_KEYS.includes(b.key)) return this._json(res, 403, { error: 'Isso só pode ser alterado no app do PC' });
            this.store.set(b.key, b.value); this.onSaved?.(b.key); this.hub._emit();
            return this._json(res, 200, sanitize(this.all()));
          }
        } catch (e) { return this._json(res, 400, { error: e.message || String(e) }); }
      }
      return this._json(res, 404, { error: 'não encontrado' });
    }

    if (p === '/manifest.webmanifest') {
      const k = url.searchParams.get('k') || '';
      res.writeHead(200, { 'content-type': MIME['.webmanifest'], 'cache-control': 'no-store' });
      return res.end(JSON.stringify({
        id: 'smarthouse', name: 'SmartHouse', short_name: 'SmartHouse', description: 'Sua casa: luzes, ar-condicionado, cenas e consumo', lang: 'pt-BR',
        display: 'standalone', display_override: ['standalone', 'fullscreen'], orientation: 'portrait', background_color: '#000000', theme_color: '#000000',
        start_url: `./?k=${encodeURIComponent(k)}&app=1`, scope: './',
        icons: [
          { src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: 'assets/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'assets/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: 'assets/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Dispositivos', url: `./?k=${encodeURIComponent(k)}&app=1#devices` }, { name: 'Energia', url: `./?k=${encodeURIComponent(k)}&app=1#energy` }],
      }));
    }
    if (p === '/' || p === '/index.html') return this._page(req, res, url);

    // arquivos estáticos do app (só a pasta renderer; nada de dados)
    const file = path.normalize(path.join(this.rendererDir, p));
    if (!file.startsWith(this.rendererDir + path.sep) || /mini\.(html|js|css)$|\.map$/.test(file)) { res.writeHead(404); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      const big = /vendor[\\/]/.test(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': big ? 'public, max-age=86400' : 'no-cache' });
      res.end(buf);
    });
  }

  _page(req, res, url) {
    const k = url.searchParams.get('k') || '';
    let html = fs.readFileSync(path.join(this.rendererDir, 'index.html'), 'utf8');
    html = html
      .replace('<html lang="pt-BR" data-theme="dark">', '<html lang="pt-BR" data-theme="dark" class="web">')
      .replace('<meta charset="utf-8">', `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="SmartHouse">
  <meta name="theme-color" content="#000000">
  <meta name="format-detection" content="telephone=no">
  <link rel="apple-touch-icon" href="assets/touch-icon.png">
  <link rel="manifest" href="manifest.webmanifest?k=${encodeURIComponent(k)}">`)
      .replace('<script src="theme-boot.js"></script>', '<script src="api-web.js"></script>\n  <script src="theme-boot.js"></script>')
      .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="mobile.css">');
    res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
    res.end(html);
  }
}

module.exports = { RemoteServer, sanitize, addresses };
