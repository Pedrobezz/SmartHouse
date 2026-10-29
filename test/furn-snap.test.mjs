import test from 'node:test';
import assert from 'node:assert/strict';
import * as PM from '../renderer/plan-model.js';
const W = (id, x1, y1, x2, y2) => ({ id, x1, y1, x2, y2, kind: 'wall' });
const L = { v: 2, walls2: [W('a', 0, 0, 6, 0), W('b', 6, 0, 6, 4), W('g', 0, 4, 4, 0)], openings: [] };
const sofa = { type: 'sofa', w: 2, d: 0.9 };

test('sofá perto da parede de cima gruda nela, de costas para a parede', () => {
  const s = PM.snapToWall(L, sofa, 5, 0.7);
  assert.ok(s); assert.equal(Math.round(s.y * 100) / 100, 0.51); assert.equal(s.x, 5); assert.equal(s.rot, 0);
});
test('na parede da direita gira 90° e encosta', () => {
  const s = PM.snapToWall(L, sofa, 5.4, 2.5);
  assert.equal(Math.round(s.x * 100) / 100, 5.49); assert.equal(s.rot, 90);
});
test('parede diagonal: gira no ângulo da parede', () => {
  const s = PM.snapToWall(L, sofa, 2.6, 2.6);
  assert.ok(s); assert.equal(s.rot, 315);
});
test('longe das paredes não gruda', () => { assert.equal(PM.snapToWall(L, sofa, 4, 2), null); });
test('tapete e mesa de centro nunca grudam', () => {
  assert.equal(PM.snapToWall(L, { type: 'rug', w: 2, d: 1.4 }, 3, 0.75), null);
  assert.equal(PM.snapToWall(L, { type: 'coffee', w: 1.1, d: 0.6 }, 3, 0.4), null);
});
