// Atualizador próprio: lê latest.yml no repositório, baixa o instalador, confere o SHA-512 e instala em silêncio
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const newer = (a, b) => { // a > b ?
  const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0), pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

class Updater extends EventEmitter {
  constructor(baseUrl) { super(); this.base = baseUrl; this.busy = false; this.ready = null; }
  setBase(u) { this.base = u.endsWith('/') ? u : u + '/'; }

  async _text(url) {
    const r = await net.fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 404 ? 'Nenhuma versão publicada ainda' : `Servidor respondeu ${r.status}`);
    return r.text();
  }

  async check() {
    if (this.busy) return;
    if (this.ready) { this.emit('state', { status: 'ready', version: this.ready.version, notes: this.notes, message: `Versão ${this.ready.version} pronta para instalar` }); return; }
    this.busy = true;
    try {
      this.emit('state', { status: 'checking', message: 'Procurando atualização…' });
      if (this.resolve) { try { this.setBase(await this.resolve()); } catch (_) { /* usa o endereço normal */ } }
      const yml = await this._text(this.base + 'latest.yml');
      const version = (yml.match(/^version:\s*['"]?([^\s'"]+)/m) || [])[1];
      const file = (yml.match(/^path:\s*['"]?([^\s'"]+)/m) || [])[1];
      const sha512 = (yml.match(/^sha512:\s*['"]?([^\s'"]+)/m) || [])[1];
      if (!version || !file) throw new Error('Arquivo de versão inválido');
      if (!newer(version, app.getVersion())) { this.emit('state', { status: 'latest', message: `Você já está na versão mais recente (${app.getVersion()})` }); return; }
      // novidades de todas as versões entre a instalada e a nova (opcional)
      let notes = [];
      try { notes = JSON.parse(await this._text(this.base + 'changelog.json')).filter(c => newer(c.version, app.getVersion()) && !newer(c.version, version)); } catch (_) {}
      this.notes = notes;
      this.emit('state', { status: 'downloading', version, notes, message: `Baixando a versão ${version}…` });
      const dest = path.join(app.getPath('temp'), `SmartHouse-Setup-${version}.exe`);
      await this._download(this.base + encodeURIComponent(file), dest, version);
      const hash = crypto.createHash('sha512').update(fs.readFileSync(dest)).digest('base64');
      if (sha512 && hash !== sha512) { fs.rmSync(dest, { force: true }); throw new Error('O arquivo baixado veio corrompido. Tente de novo.'); }
      this.ready = { version, file: dest };
      this.emit('state', { status: 'ready', version, notes: this.notes, message: `Versão ${version} pronta para instalar` });
      this.emit('downloaded', { version });
    } catch (e) {
      this.emit('state', { status: 'error', message: 'Falha ao atualizar: ' + (e.message || e) });
    } finally { this.busy = false; }
  }

  async _download(url, dest, version) {
    const r = await net.fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Download falhou (${r.status})`);
    const total = +r.headers.get('content-length') || 0;
    const out = fs.createWriteStream(dest);
    const reader = r.body.getReader();
    let got = 0, lastPct = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise(res => out.once('drain', res));
      const pct = total ? Math.floor(got / total * 100) : 0;
      if (pct !== lastPct && pct % 5 === 0) { lastPct = pct; this.emit('state', { status: 'downloading', version, notes: this.notes, pct, message: `Baixando a versão ${version}… ${pct}%` }); }
    }
    await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
  }

  // instala em silêncio e abre o app de novo quando terminar
  install() {
    if (!this.ready) throw new Error('Nenhuma atualização baixada');
    spawn(this.ready.file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  }
}

module.exports = { Updater, newer };
