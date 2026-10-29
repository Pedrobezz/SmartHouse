import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Hub } = require('../src/hub.js');
const store = { d: { settings: {}, aliases: { x: 'Interruptor Sala' } }, get(k) { return this.d[k]; }, set(k, v) { this.d[k] = v; } };

test('avisa uma vez quando um aparelho para de responder por mais de 2 min', () => {
  const h = new Hub(store), got = []; h.on('notify', n => got.push(n.title));
  const t0 = 1e12; h._startedAt = t0 - 600e3;
  h.devices.set('x', { id: 'x', provider: 'tuya', name: 'x', online: false, state: {} });
  h._checkHealth(t0); h._checkHealth(t0 + 60e3); assert.equal(got.length, 0);
  h._checkHealth(t0 + 130e3); h._checkHealth(t0 + 200e3); assert.deepEqual(got, ['Interruptor Sala parou de responder']);
  h.devices.get('x').online = true; h._checkHealth(t0 + 210e3);
  h.devices.get('x').online = false; h._checkHealth(t0 + 220e3); h._checkHealth(t0 + 400e3); assert.equal(got.length, 2);
});
test('conta com erro avisa uma vez; não avisa logo ao abrir', () => {
  const h = new Hub(store), got = []; h.on('notify', n => got.push(n.title));
  h._startedAt = 1e12; h.errors = { lg: 'token expirado' }; h._checkHealth(1e12 + 10e3); assert.equal(got.length, 0);
  h._checkHealth(1e12 + 200e3); h._checkHealth(1e12 + 300e3); assert.deepEqual(got, ['LG ThinQ desconectou']);
});
