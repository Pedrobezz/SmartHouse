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
