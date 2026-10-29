// Consumo estimado do próprio computador onde o SmartHouse roda.
// Mede o uso do processador (Node) e da placa de vídeo (nvidia-smi quando existe; senão o contador de GPU do Windows)
// e transforma em watts com a potência típica de cada peça. Notebook na bateria: usa a descarga real da bateria.
const os = require('os');
const { execFile } = require('child_process');

const run = (cmd, args, ms = 4000) => new Promise(res => {
  try { execFile(cmd, args, { timeout: ms, windowsHide: true }, (err, out) => res(err ? null : String(out || ''))); } catch (_) { res(null); }
});
const ps = (script, ms) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], ms);

// potência típica (TDP) do processador pelo nome
function cpuTdpGuess(model = '', laptop = false) {
  const m = model.toLowerCase();
  if (/apple|m[1-4]\b/.test(m)) return 20;
  if (/\d{4,5}(u|y)\b|\bu\d|celeron|pentium silver|athlon silver/.test(m)) return 15;
  if (/\d{4,5}(hx)\b/.test(m)) return 55;
  if (/\d{4,5}(h|hs|hk)\b/.test(m)) return 45;
  if (laptop) return 28;
  if (/threadripper|xeon/.test(m)) return 200;
  if (/i9|ryzen 9/.test(m)) return 125;
  if (/\d{4,5}k|x3d|ryzen 7/.test(m)) return 105;
  if (/i7/.test(m)) return 95;
  if (/i3|ryzen 3/.test(m)) return 58;
  return 65;
}
// potência típica da placa de vídeo pelo nome (integrada = pouca)
const GPU_TABLE = [
  [/rtx\s*5090/, 575], [/rtx\s*5080/, 360], [/rtx\s*5070\s*ti/, 300], [/rtx\s*5070/, 250], [/rtx\s*5060\s*ti/, 180], [/rtx\s*5060/, 145],
  [/rtx\s*4090/, 450], [/rtx\s*4080/, 320], [/rtx\s*4070\s*ti/, 285], [/rtx\s*4070/, 200], [/rtx\s*4060\s*ti/, 160], [/rtx\s*4060/, 115],
  [/rtx\s*3090/, 350], [/rtx\s*3080/, 320], [/rtx\s*3070/, 220], [/rtx\s*3060\s*ti/, 200], [/rtx\s*3060/, 170], [/rtx\s*3050/, 130],
  [/rtx\s*20[78]0/, 215], [/rtx\s*2060/, 160], [/gtx\s*16/, 120], [/gtx\s*10[78]0/, 180], [/gtx\s*1060/, 120], [/gtx\s*10[35]0/, 75],
  [/rx\s*79\d0/, 315], [/rx\s*78\d0/, 263], [/rx\s*77\d0/, 245], [/rx\s*76\d0/, 165], [/rx\s*69\d0/, 300], [/rx\s*68\d0/, 250], [/rx\s*67\d0/, 230],
  [/rx\s*66\d0/, 132], [/rx\s*65\d0/, 107], [/rx\s*5[67]\d0/, 180], [/rx\s*5[85]0/, 185], [/arc\s*a7/, 225], [/arc\s*a5/, 175], [/arc\s*a3/, 75], [/arc\s*b5/, 190],
];
function gpuTdpGuess(name = '', laptop = false) {
  const n = name.toLowerCase();
  if (!n || /uhd|iris|hd graphics|intel\(r\) graphics|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|microsoft basic|parsec|virtual|remote/.test(n)) return 12;
  const hit = GPU_TABLE.find(([re]) => re.test(n));
  const w = hit ? hit[1] : 150;
  return laptop || /laptop|mobile|max-q/.test(n) ? Math.round(w * 0.55) : w;
}

// soma das partes: base (placa-mãe, memória, discos, ventoinhas) + processador + vídeo + monitores, e a perda da fonte
function estimatePcWatts(p) {
  const laptop = !!p.laptop;
  const cpuLoad = Math.min(1, Math.max(0, p.cpuLoad || 0)), gpuLoad = Math.min(1, Math.max(0, p.gpuLoad || 0));
  const cpu = p.cpuTdp * (0.08 + 0.92 * cpuLoad);
  const gpu = typeof p.gpuPowerReal === 'number' ? p.gpuPowerReal : p.gpuTdp * (0.07 + 0.93 * gpuLoad);
  const base = laptop ? 6 + 5 /* tela do notebook */ : 30;
  const inside = laptop && typeof p.batteryW === 'number' && p.batteryW > 1 ? p.batteryW : (base + cpu + gpu) / (laptop ? 0.9 : 0.87);
  const monitors = p.monitorsOff ? 0.5 * (p.monitors || 0) : (p.monitors || 0) * (p.monitorW || 25);
  return { total: Math.round(inside + monitors), cpu: Math.round(cpu), gpu: Math.round(gpu), base: Math.round(base), monitors: Math.round(monitors), real: laptop && p.batteryW > 1 };
}

class PcMonitor {
  constructor({ getDisplays, getIdleSec } = {}) {
    this.getDisplays = getDisplays || (() => []); this.getIdleSec = getIdleSec || (() => 0);
    this.win = process.platform === 'win32';
    this.cpuName = (os.cpus()[0]?.model || '').replace(/\s+/g, ' ').trim();
    this.gpuName = ''; this.laptop = false; this.nvidia = false; this._prev = null; this._gpu = { load: 0, power: null, t: 0 }; this.ready = this._init();
  }
  async _init() {
    if (!this.win) return;
    const [gpu, bat, smi] = await Promise.all([
      ps('(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join "|"', 8000),
      ps('(Get-CimInstance Win32_Battery | Measure-Object).Count', 8000),
      run('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], 4000),
    ]);
    const names = (gpu || '').split('|').map(s => s.trim()).filter(Boolean);
    // a placa dedicada manda (se houver), senão a integrada
    this.gpuName = names.sort((a, b) => gpuTdpGuess(b) - gpuTdpGuess(a))[0] || '';
    this.laptop = +(bat || '0').trim() > 0;
    this.nvidia = !!(smi && smi.trim());
  }
  _cpuLoad() {
    const t = os.cpus().reduce((a, c) => { const x = c.times; a.idle += x.idle; a.total += x.user + x.nice + x.sys + x.idle + x.irq; return a; }, { idle: 0, total: 0 });
    const p = this._prev; this._prev = t;
    if (!p || t.total <= p.total) return 0;
    return 1 - (t.idle - p.idle) / (t.total - p.total);
  }
  async _gpuSample() {
    if (!this.win || Date.now() - this._gpu.t < (this.nvidia ? 15000 : 30000)) return this._gpu; // o contador do Windows abre o PowerShell: a cada 30 s basta
    this._gpu.t = Date.now();
    if (this.nvidia) {
      const out = await run('nvidia-smi', ['--query-gpu=utilization.gpu,power.draw', '--format=csv,noheader,nounits'], 4000);
      const [u, w] = (out || '').split('\n')[0].split(',').map(x => parseFloat(x));
      if (isFinite(u)) { this._gpu.load = u / 100; this._gpu.power = isFinite(w) ? w : null; return this._gpu; }
    }
    const out = await ps("$s=(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples | Measure-Object CookedValue -Sum; [math]::Round($s.Sum,1)", 6000);
    const v = parseFloat((out || '').replace(',', '.'));
    if (isFinite(v)) this._gpu.load = Math.min(100, v) / 100;
    return this._gpu;
  }
  async _batteryW() {
    if (!this.win || !this.laptop) return null;
    const out = await ps('$b=Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue | Select-Object -First 1; if ($b.Discharging) { $b.DischargeRate } else { 0 }', 5000);
    const mw = parseFloat(out || ''); return isFinite(mw) && mw > 0 ? mw / 1000 : null;
  }
  async sample(conf = {}) {
    await this.ready;
    const cpuLoad = this._cpuLoad(), g = await this._gpuSample();
    const laptop = conf.kind === 'notebook' ? true : conf.kind === 'desktop' ? false : this.laptop;
    const batteryW = laptop && (this._batT || 0) < Date.now() - 30000 ? (this._batT = Date.now(), this._bat = await this._batteryW()) : this._bat;
    const displays = this.getDisplays();
    const ext = displays.filter(d => !d.internal).length;
    const monitors = conf.monitors ?? (laptop ? ext : Math.max(1, displays.length));
    const idle = this.getIdleSec();
    const p = {
      laptop, cpuLoad, gpuLoad: g.load, gpuPowerReal: g.power ?? undefined, batteryW: batteryW ?? undefined,
      cpuTdp: conf.cpuTdp || cpuTdpGuess(this.cpuName, laptop), gpuTdp: conf.gpuTdp || gpuTdpGuess(this.gpuName, laptop),
      monitors, monitorW: conf.monitorW || 25, monitorsOff: idle > (conf.screenOffMin ?? 15) * 60,
    };
    const est = estimatePcWatts(p);
    return { ...est, cpuLoad, gpuLoad: g.load, gpuReal: g.power != null, cpuName: this.cpuName, gpuName: this.gpuName, laptop, monitorsN: monitors, cpuTdp: p.cpuTdp, gpuTdp: p.gpuTdp, monitorW: p.monitorW, monitorsOff: p.monitorsOff, name: os.hostname() };
  }
}

module.exports = { PcMonitor, estimatePcWatts, cpuTdpGuess, gpuTdpGuess };
