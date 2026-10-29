import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { addSegment, backfillDaily, pruneDaily, dayKey } = require('../src/hub.js');

test('cada minuto ligado soma no dia certo', () => {
  const d = {}, t = new Date(2026, 9, 29, 10, 0).getTime();
  for (let i = 1; i <= 60; i++) addSegment(d, 'ar', [t + (i - 1) * 60e3, 1200], [t + i * 60e3, 1200]);
  assert.ok(Math.abs(d['2026-10-29'].ar - 1.2) < 1e-9);
});
test('virada da meia-noite vai para o dia novo; app fechado não conta', () => {
  const d = {}, t = new Date(2026, 9, 29, 23, 59).getTime();
  addSegment(d, 'x', [t, 600], [t + 60e3, 600]);
  assert.ok(d['2026-10-30'].x > 0 && !d['2026-10-29']);
  addSegment(d, 'x', [t, 600], [t + 2 * 36e5, 600]);
  assert.ok(Math.abs(d['2026-10-30'].x - 0.01) < 1e-9);
});
test('aproveita os 7 dias antigos e apaga o que passa de ~2 anos', () => {
  const t = new Date(2026, 9, 29, 12).getTime(), h = [[t, 100], [t + 60e3, 100]];
  const d = backfillDaily({ tv: h }); assert.equal(Object.keys(d).length, 1);
  d['2023-01-01'] = { tv: 1 }; pruneDaily(d, t); assert.ok(!d['2023-01-01'] && d[dayKey(t + 60e3)]);
});
