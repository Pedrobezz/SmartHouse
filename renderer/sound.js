// Sons sutis sintetizados (sem arquivos): clique de tecla, bip do ar, chuva, trovão e ambiente (pássaros de dia, grilos à noite)
let ctx = null, master = null, rain = null, enabled = true, volume = 0.5, amb = null;
function ac() {
  if (!enabled) return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// o navegador só libera áudio depois de um toque/clique
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (enabled) ac(); }, { once: false, passive: true });

function noiseBuffer(sec) {
  const c = ac(), b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }

export const sound = {
  setEnabled(on) { enabled = !!on; if (!on) { this.setRain(0); this.setAmbient(null); } if (master) master.gain.value = on ? volume : 0; },
  setVolume(v) { volume = v; if (master) master.gain.value = enabled ? v : 0; },
  // clique de tecla basculante (mais grave ao desligar)
  click(on = true) {
    const c = ac(); if (!c) return; const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(0.05);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = on ? 3200 : 2100; bp.Q.value = 1.4;
    const g = c.createGain(); env(g, t, 0.002, 0.55, 0.045);
    src.connect(bp).connect(g).connect(master); src.start(t);
    const o = c.createOscillator(); o.frequency.value = on ? 1650 : 1100; const g2 = c.createGain(); env(g2, t, 0.001, 0.08, 0.03);
    o.connect(g2).connect(master); o.start(t); o.stop(t + 0.05);
  },
  // bip do ar-condicionado (dois toques ao ligar, um ao desligar/ajustar)
  beep(times = 1) {
    const c = ac(); if (!c) return;
    for (let i = 0; i < times; i++) {
      const t = c.currentTime + i * 0.13, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 2350; env(g, t, 0.004, 0.12, 0.085);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.11);
    }
  },
  // toque suave para comandos genéricos (TV, cenas)
  tick() {
    const c = ac(); if (!c) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.05); env(g, t, 0.003, 0.07, 0.07);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.1);
  },
  // chuva ambiente baixinha (0 a 1)
  setRain(level) {
    if (!enabled || level < 0.02) { if (rain && ctx) { rain.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.8); } return; }
    const c = ac(); if (!c) return;
    if (!rain) {
      const src = c.createBufferSource(); src.buffer = noiseBuffer(3); src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
      const g = c.createGain(); g.gain.value = 0.0001;
      src.connect(hp).connect(lp).connect(g).connect(master); src.start();
      rain = { src, g };
    }
    rain.g.gain.setTargetAtTime(0.05 * level, c.currentTime, 1.2);
  },
  // trovão distante
  thunder(delay = 0.6) {
    const c = ac(); if (!c) return; const t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(3.5);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(380, t); lp.frequency.exponentialRampToValueAtTime(90, t + 3);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    src.connect(lp).connect(g).connect(master); src.start(t);
  },
  _dbg() { return { ctx, master, amb }; },
  // ambiente da casa: { night: 0..1, rain: 0..1 } ou null para silenciar
  setAmbient(st) {
    if (!enabled || !st) { if (amb && ctx) { amb.on = false; amb.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6); } return; }
    const c = ac(); if (!c) return;
    if (!amb) amb = makeAmbient(c);
    amb.on = true; amb.night = st.night; amb.rain = st.rain;
    const t = c.currentTime, dry = 1 - Math.min(1, st.rain) * 0.85; // com chuva os bichos quase somem
    amb.bus.gain.setTargetAtTime(1, t, 1.5);
    amb.birdBus.gain.setTargetAtTime(Math.max(0.0001, (1 - st.night) * dry), t, 2.5);
    amb.crBus.gain.setTargetAtTime(Math.max(0.0001, st.night * dry), t, 2.5);
    amb.breeze.gain.setTargetAtTime(0.012 * (1 - st.night * 0.6) * dry + 0.0001, t, 2);
  },
};

// ---- ambiente: pássaros, brisa e grilos (agendados um pouco à frente) ----
function makeAmbient(c) {
  const bus = c.createGain(); bus.gain.value = 0.0001; bus.connect(master);
  // eco curto de quintal: deixa os pássaros "longe", no jardim
  const dl = c.createDelay(1); dl.delayTime.value = 0.19; const fb = c.createGain(); fb.gain.value = 0.28; const wet = c.createGain(); wet.gain.value = 0.35;
  const lpE = c.createBiquadFilter(); lpE.type = 'lowpass'; lpE.frequency.value = 3800;
  dl.connect(lpE).connect(fb).connect(dl); lpE.connect(wet).connect(bus);
  const birdBus = c.createGain(); birdBus.gain.value = 0.0001; birdBus.connect(bus); birdBus.connect(dl);
  const crBus = c.createGain(); crBus.gain.value = 0.0001; crBus.connect(bus);
  // brisa nas folhas: ruído filtrado que sobe e desce devagar
  const src = c.createBufferSource(); src.buffer = noiseBuffer(4); src.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 350; lfo.connect(lg).connect(bp.frequency); lfo.start();
  const breeze = c.createGain(); breeze.gain.value = 0.0001; const sway = c.createGain(); sway.gain.value = 0.7;
  const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.045; const lg2 = c.createGain(); lg2.gain.value = 0.3; lfo2.connect(lg2).connect(sway.gain); lfo2.start();
  src.connect(bp).connect(sway).connect(breeze).connect(bus); src.start();
  const A = { bus, birdBus, crBus, breeze, on: true, night: 0, rain: 0, nextBird: 0, nextExtra: 0, crickets: [] };
  // três grilos em lugares e ritmos diferentes
  for (let i = 0; i < 3; i++) A.crickets.push({ f: 4200 + Math.random() * 900, pan: (i - 1) * 0.6 + (Math.random() - 0.5) * 0.2, period: 0.55 + Math.random() * 0.45, pulses: 3 + (i % 2), next: 0, vol: 0.010 + Math.random() * 0.006, rest: 0 });
  setInterval(() => schedule(c, A), 250);
  return A;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function panTo(c, dest, p) { const n = c.createStereoPanner ? c.createStereoPanner() : null; if (!n) return dest; n.pan.value = p; n.connect(dest); return n; }
// um pio: nota curta com glissando
function note(c, out, t, f0, f1, dur, vol, type = 'sine') {
  const o = c.createOscillator(), g = c.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
}
// cantos diferentes, como espécies diferentes
const SONGS = [
  (c, o, t, v) => { const b = rnd(2600, 3400); for (let i = 0; i < 3; i++) note(c, o, t + i * 0.13, b * 1.3, b, 0.08, v); return 0.5; },                 // piu-piu-piu descendo
  (c, o, t, v) => { const b = rnd(3200, 4200); note(c, o, t, b, b * 1.45, 0.1, v); note(c, o, t + 0.14, b * 1.45, b * 0.9, 0.16, v * 0.9); return 0.4; }, // fiu-fiiu
  (c, o, t, v) => { const b = rnd(4200, 5200), n = 5 + (Math.random() * 4 | 0); for (let i = 0; i < n; i++) note(c, o, t + i * 0.055, b, b * 0.82, 0.04, v * 0.7); return n * 0.055 + 0.1; }, // trinado
  (c, o, t, v) => { const b = rnd(1900, 2400); note(c, o, t, b, b * 1.05, 0.22, v * 0.8, 'triangle'); note(c, o, t + 0.3, b * 0.84, b * 0.8, 0.3, v * 0.7, 'triangle'); return 0.7; }, // assobio grave (sabiá)
];
function schedule(c, A) {
  if (!A.on) return;
  const now = c.currentTime, ahead = now + 0.6, dry = 1 - Math.min(1, A.rain) * 0.85;
  // pássaros: frases com pausas longas, às vezes uma resposta do outro lado
  if ((1 - A.night) * dry > 0.05) {
    if (A.nextBird < now) A.nextBird = now + rnd(0.5, 2);
    while (A.nextBird < ahead) {
      const p = rnd(-0.8, 0.8), out = panTo(c, A.birdBus, p), song = SONGS[Math.random() * SONGS.length | 0];
      const len = song(c, out, A.nextBird, rnd(0.02, 0.04));
      A.nextBird += Math.random() < 0.35 ? len + rnd(0.15, 0.5) : len + rnd(2.5, 7);
    }
    // a "coisinha a mais": um bem-te-vi distante de vez em quando
    if (A.nextExtra < now) A.nextExtra = now + rnd(15, 30);
    else if (A.nextExtra < ahead) {
      const out = panTo(c, A.birdBus, rnd(-0.9, 0.9)), t = A.nextExtra, v = 0.022;
      note(c, out, t, 2300, 2900, 0.12, v); note(c, out, t + 0.17, 2600, 3100, 0.1, v); note(c, out, t + 0.33, 3300, 2500, 0.32, v * 1.1);
      A.nextExtra = t + rnd(25, 55);
    }
  }
  // grilos: rajadas de pulsos com pausas, cada um no seu ritmo
  if (A.night * dry > 0.05) for (const k of A.crickets) {
    if (k.next < now) k.next = now + rnd(0, 1);
    const out = k.out || (k.out = panTo(c, A.crBus, k.pan));
    while (k.next < ahead) {
      if (Math.random() < 0.08) { k.next += rnd(2, 5); continue; } // às vezes param um pouco
      for (let i = 0; i < k.pulses; i++) note(c, out, k.next + i * 0.032, k.f, k.f * 0.985, 0.022, k.vol);
      k.next += k.period * rnd(0.92, 1.08);
    }
  }
}

