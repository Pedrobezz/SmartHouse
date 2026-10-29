import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as G from '../renderer/geom.js';
const require = createRequire(import.meta.url);
const { DEMO_LAYOUT } = require('../src/demo.js');

const area = (L, id) => L.rooms.find(r => r.id === id)?.area;

test('planta de exemplo (v1) vira v2 mantendo cômodos, nomes e áreas', () => {
  const L = G.toV2(DEMO_LAYOUT);
  assert.equal(L.v, 2);
  assert.equal(L.rooms.length, 5);
  assert.equal(L.rooms.find(r => r.id === 'r-sala').name, 'Sala');
  assert.ok(Math.abs(area(L, 'r-sala') - 27) < 1e-6);
  assert.ok(Math.abs(area(L, 'r-cozinha') - 18) < 1e-6);
  assert.ok(Math.abs(area(L, 'r-banheiro') - 8) < 1e-6);
  assert.ok(Math.abs(area(L, 'r-escritorio') - 14) < 1e-6);
});

test('todas as portas da v1 viram aberturas na parede certa', () => {
  const L = G.toV2(DEMO_LAYOUT);
  assert.equal(L.openings.length, 5);
  const geo = G.openingsGeo(L);
  const front = geo.find(o => Math.abs(o.cy) < 1e-6);   // porta de entrada em y=0, x=1.6
  assert.ok(front && Math.abs(front.cx - 1.6) < 1e-6 && Math.abs(front.w - 1.0) < 1e-6);
  const wide = geo.find(o => Math.abs(o.cx - 6) < 1e-6); // passagem sala/cozinha em x=6, y=2.25
  assert.ok(wide && Math.abs(wide.cy - 2.25) < 1e-6);
});

test('cômodo unido (L) da v1: divisa interna vira divisória e o grupo continua', () => {
  const v1 = { rooms: [{ id: 'a', name: 'Sala', x: 0, y: 0, w: 4, h: 3, group: 'g1' }, { id: 'b', name: 'Jantar', x: 4, y: 0, w: 3, h: 3, group: 'g1' }],
    groups: { g1: { name: 'Sala e jantar' } }, doors: [] };
  const L = G.toV2(v1);
  assert.equal(L.rooms.length, 2);
  assert.equal(L.walls2.filter(w => w.kind === 'divider').length, 1);
  assert.ok(L.rooms.every(r => r.group === 'g1'));
  assert.equal(L.groups.g1.name, 'Sala e jantar');
  assert.equal(G.logicalRooms(L).length, 1);
});

test('funções do geom funcionam igual com v2 (roomAt, bounds, nearestWall)', () => {
  const L = G.toV2(DEMO_LAYOUT);
  assert.equal(G.roomAt(L, 1, 1), 'r-sala');
  assert.equal(G.roomAt(L, 9, 7), 'r-escritorio');
  const b = G.bounds(L); assert.equal(b.w, 10); assert.equal(b.h, 8.5);
  const nw = G.nearestWall(L, 0.3, 2); assert.ok(Math.abs(nw.px) < 1e-6 && nw.nx > 0);
});

test('toV2 numa planta já v2 só normaliza (não duplica)', () => {
  const L = G.toV2(DEMO_LAYOUT), L2 = G.toV2(L);
  assert.equal(L2.walls2.length, L.walls2.length);
  assert.deepEqual(L2.rooms.map(r => r.id).sort(), L.rooms.map(r => r.id).sort());
});

test('móveis, luzes e altura são mantidos', () => {
  const L = G.toV2({ ...DEMO_LAYOUT, furniture: [{ id: 'f1', type: 'sofa', x: 1, y: 1 }], lights: [{ id: 'l1', x: 1, y: 1 }], wallHeight: 2.8, north: 90 });
  assert.equal(L.furniture.length, 1); assert.equal(L.lights.length, 1); assert.equal(L.wallHeight, 2.6); assert.equal(L.north, 90); // altura de maquete antiga vira o pé-direito real
});
