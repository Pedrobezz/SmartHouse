import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { linkTargets } = require('../src/hub.js');

const T3 = { dev: 'sw1', ch: 'switch_3' };
const grp = (act) => [{ id: 'g', a: T3, group: [{ dev: 'sw2', ch: 'switch_1' }, { dev: 'sw3', ch: null }], act }];
const vals = r => r.map(x => `${x.target.dev}#${x.target.ch || ''}=${x.value}`);

test('grupo "liga e desliga junto" segue a tecla', () => {
  assert.deepEqual(vals(linkTargets(grp('same'), 'sw1#switch_3', true)), ['sw2#switch_1=true', 'sw3#=true']);
  assert.deepEqual(vals(linkTargets(grp('same'), 'sw1#switch_3', false)), ['sw2#switch_1=false', 'sw3#=false']);
});
test('grupo "só desliga": apertar para qualquer lado apaga o grupo', () => {
  assert.deepEqual(vals(linkTargets(grp('off'), 'sw1#switch_3', true)), ['sw2#switch_1=false', 'sw3#=false']);
  assert.deepEqual(vals(linkTargets(grp('off'), 'sw1#switch_3', false)), ['sw2#switch_1=false', 'sw3#=false']);
});
test('grupo "só liga" e teclas do grupo não comandam a tecla de origem', () => {
  assert.deepEqual(vals(linkTargets(grp('on'), 'sw1#switch_3', false)), ['sw2#switch_1=true', 'sw3#=true']);
  assert.deepEqual(linkTargets(grp('on'), 'sw2#switch_1', true), []);
});
test('ligação simples continua igual (sync e follow)', () => {
  const L = [{ a: { dev: 'x', ch: 'c1' }, b: { dev: 'y', ch: null }, mode: 'sync' }];
  assert.deepEqual(vals(linkTargets(L, 'y#', true)), ['x#c1=true']);
  assert.deepEqual(linkTargets([{ ...L[0], mode: 'follow' }], 'y#', true), []);
});
