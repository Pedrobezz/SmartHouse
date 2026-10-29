import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { roomAt } = require('../src/hub.js');

const tri = { v: 2, rooms: [
  { id: 'a', name: 'A', poly: [[0, 0], [4, 0], [0, 4]], x: 0, y: 0, w: 4, h: 4, cx: 1, cy: 1 },
  { id: 'b', name: 'B', poly: [[4, 0], [4, 4], [0, 4]], x: 0, y: 0, w: 4, h: 4, cx: 3, cy: 3, group: 'g' }] };

test('hub.roomAt usa o polígono do cômodo (paredes em ângulo)', () => {
  assert.equal(roomAt(tri, 1, 1).id, 'a');
  assert.equal(roomAt(tri, 3, 3).id, 'b');   // pela caixa (bbox) daria "a"
});
test('hub.roomAt: aparelho colado na parede de fora acha o cômodo mais próximo', () => {
  assert.equal(roomAt(tri, 4.1, 3).id, 'b');
  assert.equal(roomAt(tri, 9, 9), null);
});
test('hub.roomAt não quebra com planta sem cômodos', () => {
  assert.equal(roomAt({ v: 2, walls2: [] }, 1, 1), null);
});
