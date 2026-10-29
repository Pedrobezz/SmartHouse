import test from 'node:test';
import assert from 'node:assert/strict';
import * as PM from '../renderer/plan-model.js';

test('planta antiga (altura de maquete) passa para o pé-direito real de 2,6 m', () => {
  const L = PM.normalize({ v: 2, wallHeight: 1.6, walls2: [] });
  assert.equal(L.wallHeight, 2.6); assert.equal(L.realScale, true);
});
test('planta sem altura também fica com 2,6 m', () => {
  assert.equal(PM.normalize({ v: 2 }).wallHeight, 2.6);
});
test('pé-direito real escolhido pela pessoa é mantido', () => {
  const L = PM.normalize({ v: 2, wallHeight: 2.9, realScale: true });
  assert.equal(L.wallHeight, 2.9);
});
test('converter duas vezes não muda nada', () => {
  const a = PM.normalize({ v: 2, wallHeight: 1.5 }), b = PM.normalize(a);
  assert.equal(b.wallHeight, 2.6); assert.equal(b.realScale, true);
});
