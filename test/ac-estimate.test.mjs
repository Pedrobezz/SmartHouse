import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { estimateAcWatts: E } = require('../src/hub.js');
const cfg = { w: 1100, inverter: true };

test('desligado ou sem potência configurada: 0 W', () => {
  assert.equal(E({ on: false, mode: 'COOL' }, cfg), 0);
  assert.equal(E({ on: true, mode: 'COOL' }, { w: 0 }), 0);
});
test('inverter: quanto maior a diferença de temperatura, mais consome', () => {
  const perto = E({ on: true, mode: 'COOL', current: 23.5, target: 23 }, cfg);
  const longe = E({ on: true, mode: 'COOL', current: 28, target: 23 }, cfg);
  assert.ok(perto < longe, `${perto} < ${longe}`);
  assert.ok(perto >= 1100 * 0.3 && longe <= 1100);
});
test('primeiros 10 minutos: quase potência cheia', () => {
  assert.ok(E({ on: true, mode: 'COOL', current: 23, target: 23 }, cfg, 3) >= 990);
});
test('ventilar gasta pouco, desumidificar médio, eco reduz', () => {
  assert.ok(E({ on: true, mode: 'FAN' }, cfg) <= 60);
  assert.equal(E({ on: true, mode: 'AIR_DRY' }, cfg), 440);
  const n = E({ on: true, mode: 'COOL', current: 25, target: 23 }, cfg), eco = E({ on: true, mode: 'COOL', current: 25, target: 23, eco: true }, cfg);
  assert.ok(eco < n);
});
test('aquecer usa a diferença ao contrário; convencional liga/desliga', () => {
  assert.ok(E({ on: true, mode: 'HEAT', current: 18, target: 24 }, cfg) > E({ on: true, mode: 'HEAT', current: 24, target: 24 }, cfg));
  assert.equal(E({ on: true, mode: 'COOL', current: 26, target: 23 }, { w: 1000, inverter: false }), 850);
  assert.equal(E({ on: true, mode: 'COOL', current: 23, target: 23 }, { w: 1000, inverter: false }), 450);
});

const { kwh24, monthProjection } = require('../src/hub.js');
test('kWh em 24 h e projeção do mês', () => {
  const now = Date.UTC(2026, 9, 28, 12), h = [];
  for (let i = 0; i <= 60; i++) h.push([now - (60 - i) * 60000, 1000]); // 1 h a 1000 W
  assert.ok(Math.abs(kwh24(h, now) - 1) < 1e-9);
  const p = monthProjection({ a: h, b: h }, 1, now);
  assert.ok(Math.abs(p.kwh24 - 2) < 1e-9 && Math.abs(p.month - 60) < 1e-9);
  assert.equal(kwh24([[now - 3 * 36e5, 500], [now, 500]], now), 0); // buraco de 3 h (app fechado) não conta
});
