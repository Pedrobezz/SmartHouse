import test from 'node:test';
import assert from 'node:assert/strict';
import * as PM from '../renderer/plan-model.js';

const W = (id, x1, y1, x2, y2) => ({ id, x1, y1, x2, y2, kind: 'wall' });
const get = (L, id) => L.walls2.find(w => w.id === id);
const pts = w => [w.x1, w.y1, w.x2, w.y2].map(v => Math.round(v * 1000) / 1000);

// caso da foto: parede de cima do cômodo 5 (w) termina numa parede vertical que atravessa (c1 em cima, c2 embaixo)
// e continua reta como a parede de cima do cômodo 4 (c3)
const casa = () => ({ v: 2, walls2: [
  W('w', 0, 0, 6.5, 0), W('c3', 6.5, 0, 9, 0), W('c1', 6.5, -3, 6.5, 0), W('c2', 6.5, 0, 6.5, 5), W('d', 0, 0, 0, 5), W('t', 3, 0, 3, 5),
], openings: [] });

test('mover a parede em paralelo: a parede que atravessa a quina continua reta e no lugar', () => {
  const L = casa(), mv = PM.wallMover(L, 'w');
  mv(1);
  assert.deepEqual(pts(get(L, 'w')), [0, 1, 6.5, 1]);
  assert.deepEqual(pts(get(L, 'c1')), [6.5, -3, 6.5, 1]);   // só desliza na mesma linha
  assert.deepEqual(pts(get(L, 'c2')), [6.5, 1, 6.5, 5]);
  assert.deepEqual(pts(get(L, 'c3')), [6.5, 0, 9, 0]);      // a continuação não vem junto (não entorta)
});
test('a parede da quina (canto em L) estica ao longo dela mesma', () => {
  const L = casa(); PM.wallMover(L, 'w')(1);
  assert.deepEqual(pts(get(L, 'd')), [0, 1, 0, 5]);
});
test('parede encostada no meio (junção em T) estica até a nova posição', () => {
  const L = casa(); PM.wallMover(L, 'w')(-0.5);
  assert.deepEqual(pts(get(L, 't')), [3, -0.5, 3, 5]);
});
test('canto com parede diagonal: a quina desliza pela diagonal', () => {
  const L = { v: 2, walls2: [W('w', 0, 0, 4, 0), W('g', 4, 0, 6, 2)], openings: [] };
  PM.wallMover(L, 'w')(1);
  assert.deepEqual(pts(get(L, 'w')), [0, 1, 5, 1]);
  assert.deepEqual(pts(get(L, 'g')), [5, 1, 6, 2]);
});
test('ponta solta acompanha o deslocamento', () => {
  const L = { v: 2, walls2: [W('w', 0, 0, 4, 0)], openings: [] };
  PM.wallMover(L, 'w')(2);
  assert.deepEqual(pts(get(L, 'w')), [0, 2, 4, 2]);
});
test('o deslocamento é sempre a partir da posição original (arrastar e voltar)', () => {
  const L = casa(), mv = PM.wallMover(L, 'w'); mv(1); mv(0);
  assert.deepEqual(pts(get(L, 'c1')), [6.5, -3, 6.5, 0]);
  assert.deepEqual(pts(get(L, 'w')), [0, 0, 6.5, 0]);
});
test('alças das pontas: duas paredes selecionadas que formam uma quina têm uma alça só', () => {
  const L = casa();
  const hs = PM.endHandles(L, ['w', 'd']);
  assert.equal(hs.length, 3);
  const corner = hs.find(h => h.x === 0 && h.y === 0);
  assert.deepEqual(corner.ends.map(e => e.wall).sort(), ['d', 'w']);
});
test('alça mexe só a ponta das paredes selecionadas; as outras ficam paradas', () => {
  const L = casa();
  const h = PM.endHandles(L, ['w']).find(h => h.x === 6.5);
  PM.moveEnds(L, h.ends, 6, 0);
  assert.deepEqual(pts(get(L, 'w')), [0, 0, 6, 0]);
  assert.deepEqual(pts(get(L, 'c1')), [6.5, -3, 6.5, 0]);
  assert.deepEqual(pts(get(L, 'c3')), [6.5, 0, 9, 0]);
});
