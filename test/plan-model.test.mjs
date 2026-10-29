// Testes do modelo de planta v2 (paredes livres, cômodos detectados). Rodar: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as PM from '../renderer/plan-model.js';

const W = (id, x1, y1, x2, y2, kind = 'wall') => ({ id, x1, y1, x2, y2, kind });
const L = (walls, extra = {}) => ({ v: 2, walls2: walls, openings: [], roomMeta: [], groups: {}, furniture: [], lights: [], wallHeight: 1.5, ...extra });
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;

test('quadrado de 4 paredes vira 1 cômodo', () => {
  const r = PM.normalize(L([W('a', 0, 0, 4, 0), W('b', 4, 0, 4, 4), W('c', 4, 4, 0, 4), W('d', 0, 4, 0, 0)]));
  assert.equal(r.rooms.length, 1);
  assert.ok(near(r.rooms[0].area, 16));
  assert.equal(r.roomMeta.length, 1);
});

test('dois cômodos vizinhos dividem uma parede', () => {
  const r = PM.normalize(L([W('a', 0, 0, 8, 0), W('b', 8, 0, 8, 4), W('c', 8, 4, 0, 4), W('d', 0, 4, 0, 0), W('m', 4, 0, 4, 4)]));
  assert.equal(r.rooms.length, 2);
  assert.ok(r.rooms.every(x => near(x.area, 16)));
  assert.ok(r.rooms.every(x => !x.group));
});

test('parede solta dentro do cômodo não cria cômodo novo', () => {
  const r = PM.normalize(L([W('a', 0, 0, 4, 0), W('b', 4, 0, 4, 4), W('c', 4, 4, 0, 4), W('d', 0, 4, 0, 0), W('x', 1, 1, 2, 2)]));
  assert.equal(r.rooms.length, 1);
});

test('parede em T (termina no meio de outra) divide o cômodo', () => {
  const r = PM.normalize(L([W('a', 0, 0, 6, 0), W('b', 6, 0, 6, 4), W('c', 6, 4, 0, 4), W('d', 0, 4, 0, 0), W('t', 2, 0, 2, 4)]));
  assert.equal(r.rooms.length, 2);
  const areas = r.rooms.map(x => x.area).sort((p, q) => p - q);
  assert.ok(near(areas[0], 8) && near(areas[1], 16));
});

test('parede diagonal divide em dois triângulos', () => {
  const r = PM.normalize(L([W('a', 0, 0, 4, 0), W('b', 4, 0, 4, 4), W('c', 4, 4, 0, 4), W('d', 0, 4, 0, 0), W('g', 0, 0, 4, 4)]));
  assert.equal(r.rooms.length, 2);
  assert.ok(r.rooms.every(x => near(x.area, 8)));
});

test('paredes que se cruzam (X) geram 4 cômodos', () => {
  const r = PM.normalize(L([W('a', 0, 0, 4, 0), W('b', 4, 0, 4, 4), W('c', 4, 4, 0, 4), W('d', 0, 4, 0, 0), W('h', 0, 2, 4, 2), W('v', 2, 0, 2, 4)]));
  assert.equal(r.rooms.length, 4);
});

test('divisória cria áreas do mesmo ambiente; trocar por parede separa', () => {
  const walls = [W('a', 0, 0, 8, 0), W('b', 8, 0, 8, 4), W('c', 8, 4, 0, 4), W('d', 0, 4, 0, 0), W('m', 4, 0, 4, 4, 'divider')];
  const r = PM.normalize(L(walls));
  assert.equal(r.rooms.length, 2);
  assert.ok(r.rooms[0].group && r.rooms[0].group === r.rooms[1].group);
  assert.ok(r.groups[r.rooms[0].group]);
  walls[4].kind = 'wall';
  const r2 = PM.normalize({ ...r, walls2: walls });
  assert.ok(r2.rooms.every(x => !x.group));
});

test('nome e id do cômodo são preservados pela semente', () => {
  const base = L([W('a', 0, 0, 4, 0), W('b', 4, 0, 4, 4), W('c', 4, 4, 0, 4), W('d', 0, 4, 0, 0)], { roomMeta: [{ id: 'sala', name: 'Sala', floor: 'wood', seed: [2, 2] }] });
  const r = PM.normalize(base);
  assert.equal(r.rooms[0].id, 'sala');
  assert.equal(r.rooms[0].name, 'Sala');
  // aumenta o cômodo movendo uma parede: continua sendo a Sala
  r.walls2.find(w => w.id === 'b').x1 = 6; r.walls2.find(w => w.id === 'b').x2 = 6; r.walls2.find(w => w.id === 'a').x2 = 6; r.walls2.find(w => w.id === 'c').x1 = 6;
  const r2 = PM.normalize(r);
  assert.equal(r2.rooms[0].id, 'sala'); assert.ok(near(r2.rooms[0].area, 24));
});

test('cômodo em L tem polígono côncavo e semente dentro', () => {
  const r = PM.normalize(L([W('1', 0, 0, 4, 0), W('2', 4, 0, 4, 2), W('3', 4, 2, 2, 2), W('4', 2, 2, 2, 4), W('5', 2, 4, 0, 4), W('6', 0, 4, 0, 0)]));
  assert.equal(r.rooms.length, 1); assert.ok(near(r.rooms[0].area, 12));
  const [sx, sy] = r.roomMeta[0].seed; assert.ok(PM.pointInPoly(sx, sy, r.rooms[0].poly));
});

test('porta na parede: trechos sólidos e vão', () => {
  const lay = L([W('a', 0, 0, 4, 0), W('b', 4, 0, 4, 4), W('c', 4, 4, 0, 4), W('d', 0, 4, 0, 0)], { openings: [{ id: 'o1', wall: 'a', at: 2, w: 0.8, type: 'door' }] });
  const r = PM.normalize(lay);
  const pieces = PM.wallPieces(r).filter(p => p.wall.id === 'a');
  assert.equal(pieces.length, 2);
  const ops = PM.openingsGeo(r); assert.equal(ops.length, 1);
  assert.ok(near(ops[0].x1, 1.6) && near(ops[0].x2, 2.4));
});

test('abertura fora do limite é ajustada para caber na parede', () => {
  const r = PM.normalize(L([W('a', 0, 0, 2, 0)], { openings: [{ id: 'o', wall: 'a', at: 1.95, w: 0.8, type: 'window' }] }));
  const o = r.openings[0]; assert.ok(o.at <= 2 - 0.4 + 1e-9 && o.at >= 0.4 - 1e-9);
});

test('roomAt por polígono e nearestWall em ângulo', () => {
  const r = PM.normalize(L([W('a', 0, 0, 4, 0), W('b', 4, 0, 4, 4), W('c', 4, 4, 0, 4), W('d', 0, 4, 0, 0), W('g', 0, 0, 4, 4)]));
  const tri = PM.roomAt(r, 3, 1); assert.ok(tri);
  const other = PM.roomAt(r, 1, 3); assert.ok(other && other !== tri);
  const nw = PM.nearestWall(r, 2.5, 1.5); // perto da diagonal
  assert.equal(nw.wall.id, 'g');
  assert.ok(near(Math.hypot(nw.nx, nw.ny), 1));
  assert.ok(nw.nx > 0 && nw.ny < 0); // normal aponta para o lado do ponto
});
