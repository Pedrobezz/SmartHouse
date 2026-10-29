import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { makeBackup, applyBackup, readBackup } = require('../src/backup.js');
const mem = init => { const d = JSON.parse(JSON.stringify(init)); return { get: k => d[k], set: (k, v) => { d[k] = v; }, d }; };

test('backup leva a casa e deixa de fora senhas e tokens', () => {
  const st = mem({ layout: { v: 2 }, scenes: [{ id: 's' }], settings: { tariff: 0.9, tuya: { accessSecret: 'X' }, lg: { token: 'T' }, ewelink: { appSecret: 'Y' }, mobile: { token: 'M' } } });
  const b = makeBackup(st, '2.14.0'), txt = JSON.stringify(b);
  assert.equal(b.data.layout.v, 2); assert.equal(b.data.settings.tariff, 0.9);
  for (const s of ['accessSecret', '"T"', 'appSecret', '"M"']) assert.ok(!txt.includes(s), s);
});
test('restaurar troca a casa mas mantém as contas deste PC', () => {
  const src = mem({ layout: { v: 2, rooms: [1] }, rules: [{ id: 'r' }], settings: { tariff: 1.1 } });
  const dst = mem({ layout: null, rules: [], settings: { tariff: 0.5, tuya: { accessSecret: 'MEU' } } });
  const keys = applyBackup(dst, makeBackup(src, '1'));
  assert.deepEqual(dst.d.layout, { v: 2, rooms: [1] }); assert.equal(dst.d.rules.length, 1);
  assert.equal(dst.d.settings.tariff, 1.1); assert.equal(dst.d.settings.tuya.accessSecret, 'MEU');
  assert.ok(keys.includes('layout'));
});
test('arquivo errado é recusado com mensagem clara', () => {
  assert.throws(() => readBackup({ foo: 1 }), /não é um backup/);
  assert.throws(() => readBackup({ app: 'SmartHouse', kind: 'backup', format: 9, data: {} }), /versão mais nova/);
});
