// Geometria da planta.
// layout = { rooms:[{id,name,x,y,w,h,group?}], groups:{gid:{name}}, doors:[{dir,x,y,w,type}], walls:[{id,x1,y1,x2,y2}], wallHeight }
// - Retângulos com o mesmo "group" formam UM cômodo (ex.: sala em L): a parede entre eles some.
// - "walls" são paredes avulsas (ex.: um trecho de parede que avança sem fechar o cômodo).
// - Portas: type 'door' (porta, com verga em cima), 'arch' (arco) ou 'open' (passagem livre, do chão ao teto).
import * as PM from './plan-model.js';
export { isV2, openingsGeo, wallPieces, normalize, pointInPoly, areaAt, wallSides, dividers, DEF_T } from './plan-model.js';
const EPS = 1e-6;
const k = v => Math.round(v * 1000) / 1000;
export const groupOf = r => r.group || r.id;

// Intervalos de parede por linha, já sem as divisões internas de cômodos unidos (antes de abrir portas)
function wallLinesMap(layout) {
  const edges = { h: new Map(), v: new Map() };
  const add = (dir, c, a, b, side, g) => {
    const key = k(c); const m = edges[dir];
    if (!m.has(key)) m.set(key, []);
    m.get(key).push({ a: Math.min(a, b), b: Math.max(a, b), side, g });
  };
  for (const r of layout.rooms || []) {
    const g = groupOf(r);
    add('h', r.y, r.x, r.x + r.w, +1, g); add('h', r.y + r.h, r.x, r.x + r.w, -1, g);
    add('v', r.x, r.y, r.y + r.h, +1, g); add('v', r.x + r.w, r.y, r.y + r.h, -1, g);
  }
  for (const w of layout.walls || []) {
    if (Math.abs(w.y1 - w.y2) < EPS) add('h', w.y1, w.x1, w.x2, 0, '#wall');
    else if (Math.abs(w.x1 - w.x2) < EPS) add('v', w.x1, w.y1, w.y2, 0, '#wall');
  }
  const out = { h: new Map(), v: new Map() };
  for (const dir of ['h', 'v']) {
    for (const [c, list] of edges[dir]) {
      const pts = [...new Set(list.flatMap(e => [k(e.a), k(e.b)]))].sort((x, y) => x - y);
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1], mid = (p + q) / 2;
        const touch = list.filter(e => e.a < mid && e.b > mid);
        if (!touch.length) continue;
        let wall = true;
        if (!touch.some(e => e.side === 0)) {
          const plus = new Set(touch.filter(e => e.side > 0).map(e => e.g));
          const minus = new Set(touch.filter(e => e.side < 0).map(e => e.g));
          // divisão interna entre partes do mesmo cômodo -> sem parede
          if (plus.size === 1 && minus.size === 1 && [...plus][0] === [...minus][0]) wall = false;
        }
        if (!wall) continue;
        const last = segs[segs.length - 1];
        if (last && Math.abs(last[1] - p) < EPS) last[1] = q; else segs.push([p, q]);
      }
      if (segs.length) out[dir].set(c, segs);
    }
  }
  return out;
}

const doorsOn = (layout, dir, c) => (layout.doors || []).filter(d => d.dir === dir && Math.abs((dir === 'h' ? d.y : d.x) - c) < 0.02);
const seg = (dir, c, a, b, extra = {}) => (dir === 'h' ? { dir, x1: a, y1: c, x2: b, y2: c, ...extra } : { dir, x1: c, y1: a, x2: c, y2: b, ...extra });

// Trechos sólidos de parede (com as portas recortadas)
function buildWalls1(layout) {
  if (!layout) return [];
  const lines = wallLinesMap(layout), out = [];
  for (const dir of ['h', 'v']) for (const [c, merged] of lines[dir]) {
    const doors = doorsOn(layout, dir, c).map(d => { const m = dir === 'h' ? d.x : d.y; return [m - d.w / 2, m + d.w / 2]; });
    for (const [a, b] of merged) {
      let segs = [[a, b]];
      for (const [da, db] of doors) {
        const next = [];
        for (const [sa, sb] of segs) {
          if (db <= sa || da >= sb) { next.push([sa, sb]); continue; }
          if (da > sa) next.push([sa, da]);
          if (db < sb) next.push([db, sb]);
        }
        segs = next;
      }
      for (const [sa, sb] of segs) if (sb - sa >= 0.02) out.push(seg(dir, c, sa, sb));
    }
  }
  return out;
}

// Vãos das portas que realmente cortam uma parede (para desenhar verga ou arco)
function buildOpenings1(layout) {
  if (!layout) return [];
  const lines = wallLinesMap(layout), out = [];
  for (const d of layout.doors || []) {
    const c = d.dir === 'h' ? d.y : d.x, m = d.dir === 'h' ? d.x : d.y;
    const merged = lines[d.dir].get(k(c)); if (!merged) continue;
    for (const [a, b] of merged) {
      const lo = Math.max(a, m - d.w / 2), hi = Math.min(b, m + d.w / 2);
      if (hi - lo > 0.05) out.push(seg(d.dir, c, lo, hi, { type: d.type || 'door', full: hi - lo > d.w - 0.02, sill: d.sill ?? 1.0, top: d.top ?? 2.1, hinge: d.hinge || 0 }));
    }
  }
  return out;
}

// Linhas de parede sem portas — para encaixar portas e aparelhos
function wallLines1(layout) {
  const lines = wallLinesMap(layout), out = [];
  for (const dir of ['h', 'v']) for (const [c, merged] of lines[dir]) for (const [a, b] of merged) out.push(seg(dir, c, a, b));
  return out;
}

// Cômodos "lógicos" (retângulos unidos viram um só)
function logicalRooms1(layout) {
  const map = new Map();
  for (const r of layout?.rooms || []) {
    const g = groupOf(r);
    if (!map.has(g)) map.set(g, { id: g, name: layout.groups?.[g]?.name || r.name, rects: [], area: 0 });
    const L = map.get(g); L.rects.push(r); L.area += r.w * r.h;
  }
  for (const L of map.values()) {
    L.main = L.rects.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    L.grouped = L.rects.length > 1;
  }
  return [...map.values()];
}

function rectAt1(layout, x, y) {
  if (!layout) return null;
  const inside = layout.rooms.find(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  if (inside) return inside;
  let best = null, bd = 0.3;
  for (const r of layout.rooms) {
    const dx = Math.max(r.x - x, 0, x - (r.x + r.w)), dy = Math.max(r.y - y, 0, y - (r.y + r.h));
    const d = Math.hypot(dx, dy);
    if (d <= bd) { bd = d; best = r; }
  }
  return best;
}
function roomAt1(layout, x, y) { const r = rectAt1(layout, x, y); return r ? groupOf(r) : null; }

function nearestWall1(layout, x, y) {
  let best = null;
  for (const w of wallLines1(layout)) {
    let px, py;
    if (w.dir === 'h') { px = Math.min(Math.max(x, w.x1), w.x2); py = w.y1; }
    else { px = w.x1; py = Math.min(Math.max(y, w.y1), w.y2); }
    const d = Math.hypot(px - x, py - y);
    if (!best || d < best.d) best = { d, px, py, wall: w };
  }
  if (!best) return null;
  let nx = 0, ny = 0;
  if (best.wall.dir === 'h') ny = y >= best.py ? 1 : -1; else nx = x >= best.px ? 1 : -1;
  return { ...best, nx, ny };
}

function bounds1(layout) {
  const rs = layout?.rooms || [];
  if (!rs.length) return { minX: 0, minY: 0, maxX: 10, maxY: 8, cx: 5, cy: 4, w: 10, h: 8 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rs) { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); }
  for (const w of layout.walls || []) { minX = Math.min(minX, w.x1, w.x2); maxX = Math.max(maxX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2); maxY = Math.max(maxY, w.y1, w.y2); }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

// Altura padrão (m) de um aparelho conforme o tipo/nome
export function defaultHeight(dev) {
  if (dev?.type === 'ac') return 2.2;
  if (/interruptor|switch/i.test(dev?.name || '') || dev?.type === 'switch') return 1.2;
  return 0.3;
}

// Divisas internas entre as partes de um cômodo unido (para desenhar no piso)
export function internalEdges(rects) {
  const sep = buildWalls1({ rooms: rects.map(r => ({ ...r, group: undefined })), doors: [] });
  const joined = buildWalls1({ rooms: rects.map(r => ({ ...r, group: '#g' })), doors: [] });
  const key = s => `${s.dir}:${s.x1}:${s.y1}`;
  const outer = new Map(); for (const s of joined) { const c = s.dir === 'h' ? s.y1 : s.x1; if (!outer.has(s.dir + c)) outer.set(s.dir + c, []); outer.get(s.dir + c).push(s); }
  const out = [];
  for (const s of sep) {
    const c = s.dir === 'h' ? s.y1 : s.x1, a = s.dir === 'h' ? s.x1 : s.y1, b = s.dir === 'h' ? s.x2 : s.y2;
    // subtrai os trechos que continuam sendo parede externa
    let segs = [[a, b]];
    for (const o of outer.get(s.dir + c) || []) {
      const oa = o.dir === 'h' ? o.x1 : o.y1, ob = o.dir === 'h' ? o.x2 : o.y2, next = [];
      for (const [sa, sb] of segs) { if (ob <= sa || oa >= sb) { next.push([sa, sb]); continue; } if (oa > sa) next.push([sa, oa]); if (ob < sb) next.push([ob, sb]); }
      segs = next;
    }
    for (const [sa, sb] of segs) if (sb - sa > 0.02) out.push(s.dir === 'h' ? { dir: 'h', x1: sa, y1: c, x2: sb, y2: c } : { dir: 'v', x1: c, y1: sa, x2: c, y2: sb });
  }
  return out;
}

export const FLOORS = [['wood', 'Madeira'], ['porcelain', 'Porcelanato'], ['tile', 'Cerâmica'], ['concrete', 'Cimento queimado'], ['carpet', 'Carpete'], ['plain', 'Liso']];
export function defaultFloor(name = '') {
  const n = name.toLowerCase();
  if (/banh|lavab|wc|lavand|área|area de serv/.test(n)) return 'tile';
  if (/cozinha|copa|gourmet|varanda|sacada/.test(n)) return 'porcelain';
  if (/garagem|garage/.test(n)) return 'concrete';
  return 'wood';
}

// ---------------------------------------------------------------- planta v2 (paredes livres) e migração
// Converte a planta antiga (retângulos + portas) para a v2. Os ids/nomes dos cômodos são mantidos.
export function toV2(layout) {
  if (!layout) return PM.normalize({ v: 2 });
  if (PM.isV2(layout)) return PM.normalize(layout);
  const walls2 = [], openings = [];
  let n = 0;
  for (const w of wallLines1(layout)) walls2.push({ id: 'w' + (++n), x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, kind: 'wall' });
  const groups = new Map();
  for (const r of layout.rooms || []) if (r.group) { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group).push(r); }
  for (const rects of groups.values()) for (const e of internalEdges(rects)) walls2.push({ id: 'd' + (++n), x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, kind: 'divider' });
  let o = 0;
  for (const d of layout.doors || []) {
    const c = d.dir === 'h' ? d.y : d.x, m = d.dir === 'h' ? d.x : d.y;
    const w = walls2.find(w => w.kind === 'wall' && (d.dir === 'h'
      ? Math.abs(w.y1 - c) < 0.02 && Math.abs(w.y2 - c) < 0.02 && m >= w.x1 - 0.01 && m <= w.x2 + 0.01
      : Math.abs(w.x1 - c) < 0.02 && Math.abs(w.x2 - c) < 0.02 && m >= w.y1 - 0.01 && m <= w.y2 + 0.01));
    if (!w) continue;
    const op = { id: 'o' + (++o), wall: w.id, at: m - (d.dir === 'h' ? w.x1 : w.y1), w: d.w || 0.8, type: d.type || 'door' };
    for (const k of ['sill', 'top', 'hinge', 'style']) if (d[k] != null) op[k] = d[k];
    openings.push(op);
  }
  const roomMeta = (layout.rooms || []).map(r => {
    const m = { id: r.id, name: r.name, floor: r.floor || defaultFloor(r.name), seed: [r.x + r.w / 2, r.y + r.h / 2] };
    if (r.floorColor) m.floorColor = r.floorColor; if (r.group) m.group = r.group;
    return m;
  });
  const { rooms, doors, walls, ...rest } = layout;
  return PM.normalize({ ...rest, v: 2, walls2, openings, roomMeta, groups: { ...(layout.groups || {}) } });
}

const v2 = l => PM.isV2(l);
export function buildWalls(l) { return v2(l) ? PM.wallPieces(l) : buildWalls1(l); }
export function buildOpenings(l) { return v2(l) ? PM.openingsGeo(l) : buildOpenings1(l); }
export function wallLines(l) { return v2(l) ? (l.walls2 || []).filter(w => w.kind !== 'divider') : wallLines1(l); }
export function logicalRooms(l) { return v2(l) ? PM.logicalRooms(l) : logicalRooms1(l); }
export function rectAt(l, x, y) { return v2(l) ? PM.areaAt(l, x, y) : rectAt1(l, x, y); }
export function roomAt(l, x, y) { return v2(l) ? PM.roomAt(l, x, y) : roomAt1(l, x, y); }
export function nearestWall(l, x, y) { return v2(l) ? PM.nearestWall(l, x, y) : nearestWall1(l, x, y); }
export function bounds(l) { return v2(l) ? PM.bounds(l) : bounds1(l); }
