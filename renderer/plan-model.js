// Planta v2 do SmartHouse: paredes livres (qualquer ângulo), aberturas presas à parede e cômodos detectados
// pelos espaços fechados. Usado pela casa 3D, pelo editor de construção e (via cômodos derivados) pelo resto do app.
//
// layout v2 = {
//   v: 2,
//   walls2:   [{ id, x1, y1, x2, y2, kind: 'wall'|'divider', t?, h?, fa?: {finish,color}, fb?: {finish,color} }],
//   openings: [{ id, wall, at, w, type: 'door'|'window'|'arch'|'open', sill?, top?, hinge?, style? }],
//   roomMeta: [{ id, name, floor, floorColor?, group?, seed: [x, y] }],   // dados de cada cômodo/área
//   groups:   { gid: { name } },                                         // ambientes unidos (áreas ligadas por divisória)
//   rooms:    [...derivado: { id, name, floor, floorColor, group, poly, area, x, y, w, h, cx, cy }],
//   furniture, lights, wallHeight, north
// }
// "fa" é o lado à esquerda de quem anda de (x1,y1) para (x2,y2); "fb" o lado oposto.
export const DEF_T = 0.12;
export const WALL_FINISHES = [['paint', 'Pintura'], ['brick', 'Tijolinho'], ['tile', 'Azulejo'], ['wood', 'Madeira'], ['stone', 'Pedra'], ['concrete', 'Cimento']];
export const WALL_COLORS = ['#efe8dd', '#f7f5f0', '#ddd3c6', '#c9b49b', '#e9c9ad', '#d9a8a0', '#9fb8a0', '#a8c4d8', '#8e9bb3', '#5b5b5f'];
export const FLOOR_TINTS = [null, '#f3e3cf', '#e0c3a3', '#b98d6b', '#d9d4cc', '#a9b6bf', '#cfd8c4', '#e8c4c0'];
const NODE = 0.005;          // pontas a menos de 5 mm viram o mesmo nó
const ON_SEG = 0.012;        // ponta encostada numa parede (junção em T)
const MIN_AREA = 0.15;       // espaços menores que isso não viram cômodo (m²)

let seq = 0;
export const uid = p => p + Date.now().toString(36) + (seq++).toString(36);
export const isV2 = L => L?.v === 2;

// ---------------------------------------------------------------- geometria básica
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return a / 2; }
function centroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const f = p[j][0] * p[i][1] - p[i][0] * p[j][1]; a += f; cx += (p[j][0] + p[i][0]) * f; cy += (p[j][1] + p[i][1]) * f; }
  if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}
// um ponto garantidamente dentro do polígono (para formas em L, o centroide pode cair fora)
export function interiorPoint(poly) {
  const c = centroid(poly);
  if (pointInPoly(c[0], c[1], poly)) return c;
  const ys = poly.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best = null, bw = -1;
  for (const f of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
    const y = y0 + (y1 - y0) * f, xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y)) xs.push((xj - xi) * (y - yi) / (yj - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > bw) { bw = xs[k + 1] - xs[k]; best = [(xs[k] + xs[k + 1]) / 2, y]; }
  }
  return best || c;
}
const wlen = w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2));
  return { d: Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t)), t, x: x1 + dx * t, y: y1 + dy * t };
}

// ---------------------------------------------------------------- grafo das paredes -> cômodos
function splitEdges(walls) {
  const edges = [];
  for (const w of walls) {
    const L = wlen(w); if (L < 0.02) continue;
    const ts = [0, 1];
    for (const o of walls) {
      if (o === w) continue;
      // cruzamento próprio
      const r = [w.x2 - w.x1, w.y2 - w.y1], s = [o.x2 - o.x1, o.y2 - o.y1], den = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(den) > 1e-9) {
        const qp = [o.x1 - w.x1, o.y1 - w.y1];
        const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
        const tolT = ON_SEG / L, tolU = ON_SEG / (wlen(o) || 1);
        if (t > tolT && t < 1 - tolT && u > -tolU && u < 1 + tolU) ts.push(t);
      }
      // pontas da outra parede encostadas nesta (junção em T ou paredes sobrepostas)
      for (const [px, py] of [[o.x1, o.y1], [o.x2, o.y2]]) {
        const q = distToSeg(px, py, w.x1, w.y1, w.x2, w.y2);
        if (q.d < ON_SEG && q.t > 0.002 && q.t < 0.998) ts.push(q.t);
      }
    }
    ts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < ts.length; i++) {
      if ((ts[i + 1] - ts[i]) * L < 0.01) continue;
      edges.push({ wall: w, a: [w.x1 + (w.x2 - w.x1) * ts[i], w.y1 + (w.y2 - w.y1) * ts[i]], b: [w.x1 + (w.x2 - w.x1) * ts[i + 1], w.y1 + (w.y2 - w.y1) * ts[i + 1]] });
    }
  }
  return edges;
}

function findFaces(walls) {
  const nodes = new Map(), nodeOf = ([x, y]) => {
    const k = `${Math.round(x / NODE)}:${Math.round(y / NODE)}`;
    if (!nodes.has(k)) nodes.set(k, { k, x, y, adj: new Map() });
    return nodes.get(k);
  };
  for (const e of splitEdges(walls)) {
    const A = nodeOf(e.a), B = nodeOf(e.b); if (A === B) continue;
    const kind = e.wall.kind === 'divider' ? 'divider' : 'wall';
    const prev = A.adj.get(B.k);
    const k2 = prev && prev.kind === 'wall' ? 'wall' : kind; // parede vence divisória sobreposta
    A.adj.set(B.k, { n: B, kind: k2, wall: e.wall }); B.adj.set(A.k, { n: A, kind: k2, wall: e.wall });
  }
  // tira pontas soltas (paredes que não fecham espaço)
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes.values()) if (n.adj.size === 1) { for (const k of n.adj.keys()) nodes.get(k)?.adj.delete(n.k); n.adj.clear(); changed = true; }
  }
  for (const n of nodes.values()) n.sorted = [...n.adj.values()].sort((a, b) => Math.atan2(a.n.y - n.y, a.n.x - n.x) - Math.atan2(b.n.y - n.y, b.n.x - n.x));
  const visited = new Set(), faces = [], heFace = new Map();
  for (const n of nodes.values()) for (const e0 of n.sorted) {
    const hk0 = n.k + '>' + e0.n.k; if (visited.has(hk0)) continue;
    const pts = [], hes = []; let u = n, v = e0.n, guard = 0, ok = true;
    while (guard++ < 5000) {
      const hk = u.k + '>' + v.k;
      if (visited.has(hk)) { ok = hk === hk0; break; }
      visited.add(hk); hes.push({ hk, kind: v.adj.get(u.k)?.kind || 'wall', twin: v.k + '>' + u.k }); pts.push([u.x, u.y]);
      const i = v.sorted.findIndex(x => x.n === u), next = v.sorted[(i - 1 + v.sorted.length) % v.sorted.length];
      u = v; v = next.n;
    }
    if (!ok || pts.length < 3) continue;
    const a = polyArea(pts);
    const f = { poly: pts, signed: a, area: Math.abs(a), hes };
    faces.push(f); for (const h of hes) heFace.set(h.hk, f);
  }
  // com a regra "vizinho anterior no sentido anti-horário", o lado de dentro sai com área positiva; o contorno externo, negativa
  const inner = faces.filter(f => f.signed > 0 && f.area >= MIN_AREA);
  for (const f of inner) f.nb = f.hes.filter(h => h.kind === 'divider').map(h => heFace.get(h.twin)).filter(g => g && g !== f && g.signed > 0);
  return inner;
}

// ---------------------------------------------------------------- normalizar: cômodos, áreas, aberturas
const defaultFloorFor = name => {
  const n = (name || '').toLowerCase();
  if (/banh|lavab|wc|lavand|área|area de serv/.test(n)) return 'tile';
  if (/cozinha|copa|gourmet|varanda|sacada/.test(n)) return 'porcelain';
  if (/garagem|garage/.test(n)) return 'concrete';
  return 'wood';
};
export function normalize(layout) {
  const L = { ...layout, v: 2 };
  L.walls2 = (L.walls2 || []).filter(w => wlen(w) >= 0.02);
  L.openings = L.openings || []; L.roomMeta = L.roomMeta || []; L.groups = { ...(L.groups || {}) };
  L.furniture = L.furniture || []; L.lights = L.lights || [];
  L.doors = []; L.walls = []; // campos da planta antiga (v1) ficam vazios
  // escala real: antes a "altura das paredes" era uma altura de maquete (1,5 m valendo 2,6 m) e tudo era achatado.
  // Agora a casa é desenhada em tamanho real; os modos de parede (corte, meia, baixas) cuidam da visão.
  if (!L.realScale) { L.wallHeight = 2.6; L.realScale = true; }
  const faces = findFaces(L.walls2).sort((a, b) => b.area - a.area);
  // cada espaço fechado herda os dados do cômodo cuja "semente" está dentro dele
  const metas = L.roomMeta.map(m => ({ ...m })), used = new Set(), out = [];
  let n = metas.length;
  for (const f of faces) {
    let m = metas.find(x => !used.has(x) && x.seed && pointInPoly(x.seed[0], x.seed[1], f.poly));
    if (!m) { n++; m = { id: uid('r'), name: `Cômodo ${n}`, floor: 'wood' }; metas.push(m); }
    used.add(m); f.meta = m; m.seed = interiorPoint(f.poly);
    if (!m.floor) m.floor = defaultFloorFor(m.name);
  }
  // áreas ligadas por divisória formam um ambiente unido (grupo)
  const parent = new Map(faces.map(f => [f, f])), find = f => (parent.get(f) === f ? f : find(parent.get(f)));
  for (const f of faces) for (const g of f.nb || []) if (parent.has(g)) parent.set(find(f), find(g));
  const comps = new Map();
  for (const f of faces) { const r = find(f); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(f); }
  const usedGroups = new Set();
  for (const list of comps.values()) {
    if (list.length < 2) { delete list[0].meta.group; continue; }
    const counts = new Map(); for (const f of list) if (f.meta.group && !usedGroups.has(f.meta.group)) counts.set(f.meta.group, (counts.get(f.meta.group) || 0) + 1);
    let gid = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!gid) gid = 'g-' + list.map(f => f.meta.id).sort()[0]; // id estável (cenas e regras apontam para ele)
    usedGroups.add(gid);
    if (!L.groups[gid]) L.groups[gid] = { name: [...new Set(list.map(f => f.meta.name))].join(' + ') };
    for (const f of list) f.meta.group = gid;
  }
  for (const g of Object.keys(L.groups)) if (!usedGroups.has(g)) delete L.groups[g];
  L.roomMeta = metas.filter(m => used.has(m));
  for (const f of faces) {
    const xs = f.poly.map(p => p[0]), ys = f.poly.map(p => p[1]), m = f.meta;
    const x = Math.min(...xs), y = Math.min(...ys);
    out.push({ id: m.id, name: m.name, floor: m.floor, floorColor: m.floorColor, group: m.group, poly: f.poly, area: f.area,
      x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, cx: m.seed[0], cy: m.seed[1] });
  }
  L.rooms = out;
  // aberturas: só em paredes existentes, sempre cabendo nelas
  const byId = new Map(L.walls2.map(w => [w.id, w]));
  L.openings = L.openings.filter(o => byId.has(o.wall)).map(o => {
    const len = wlen(byId.get(o.wall)), w = Math.max(0.3, Math.min(o.w || 0.8, len - 0.04));
    return { ...o, w, at: Math.max(w / 2, Math.min(len - w / 2, o.at ?? len / 2)) };
  });
  return L;
}

// ---------------------------------------------------------------- consultas usadas pela casa 3D e pelo app
const unit = w => { const L = wlen(w) || 1; return [(w.x2 - w.x1) / L, (w.y2 - w.y1) / L]; };
// trechos sólidos de cada parede (com os vãos recortados); as pontas verdadeiras avançam meia espessura para fechar os cantos
export function wallPieces(L) {
  const out = [];
  for (const w of L.walls2 || []) {
    if (w.kind === 'divider') continue;
    const len = wlen(w), [ux, uy] = unit(w), t = w.t || DEF_T;
    const ops = (L.openings || []).filter(o => o.wall === w.id).map(o => [o.at - o.w / 2, o.at + o.w / 2]).sort((a, b) => a[0] - b[0]);
    let s = 0; const ranges = [];
    for (const [a, b] of ops) { if (a > s + 0.005) ranges.push([s, a]); s = Math.max(s, b); }
    if (len > s + 0.005) ranges.push([s, len]);
    for (let [a, b] of ranges) {
      if (a < 1e-6) a -= t / 2; if (b > len - 1e-6) b += t / 2;
      out.push({ wall: w, s: a, e: b, x1: w.x1 + ux * a, y1: w.y1 + uy * a, x2: w.x1 + ux * b, y2: w.y1 + uy * b, ux, uy, nx: -uy, ny: ux, t, len: b - a });
    }
  }
  return out;
}
export function openingsGeo(L) {
  const byId = new Map((L.walls2 || []).map(w => [w.id, w]));
  return (L.openings || []).map(o => {
    const w = byId.get(o.wall); if (!w || w.kind === 'divider') return null;
    const [ux, uy] = unit(w), a = o.at - o.w / 2, b = o.at + o.w / 2;
    return { opening: o, wall: w, ux, uy, nx: -uy, ny: ux, t: w.t || DEF_T, w: o.w, type: o.type || 'door',
      sill: o.sill ?? 1.0, top: o.top ?? 2.1, hinge: o.hinge || 0,
      cx: w.x1 + ux * o.at, cy: w.y1 + uy * o.at, x1: w.x1 + ux * a, y1: w.y1 + uy * a, x2: w.x1 + ux * b, y2: w.y1 + uy * b };
  }).filter(Boolean);
}
export function nearestWall(L, x, y, { dividers = false } = {}) {
  let best = null;
  for (const w of L.walls2 || []) {
    if (!dividers && w.kind === 'divider') continue;
    const q = distToSeg(x, y, w.x1, w.y1, w.x2, w.y2);
    if (!best || q.d < best.d) best = { d: q.d, px: q.x, py: q.y, t: q.t, wall: w };
  }
  if (!best) return null;
  const [ux, uy] = unit(best.wall); let nx = -uy, ny = ux;
  if ((x - best.px) * nx + (y - best.py) * ny < 0) { nx = -nx; ny = -ny; }
  return { ...best, nx, ny, thick: best.wall.t || DEF_T, at: best.t * wlen(best.wall) };
}
// cômodo/área que contém o ponto (com tolerância de 30 cm para aparelhos na parede)
export function areaAt(L, x, y, tol = 0.3) {
  const rs = L.rooms || [];
  const inside = rs.find(r => r.poly && pointInPoly(x, y, r.poly));
  if (inside || tol <= 0) return inside || null;
  let best = null, bd = tol;
  for (const r of rs) {
    if (!r.poly) continue;
    for (let i = 0, j = r.poly.length - 1; i < r.poly.length; j = i++) {
      const q = distToSeg(x, y, r.poly[j][0], r.poly[j][1], r.poly[i][0], r.poly[i][1]);
      const d = q.d + 0.001 * Math.hypot(r.cx - x, r.cy - y);
      if (d < bd) { bd = d; best = r; }
    }
  }
  return best;
}
export function roomAt(L, x, y, tol) { const r = areaAt(L, x, y, tol); return r ? (r.group || r.id) : null; }
export function bounds(L) {
  const ws = L.walls2 || [];
  if (!ws.length) return { minX: 0, minY: 0, maxX: 10, maxY: 8, cx: 5, cy: 4, w: 10, h: 8 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of ws) { minX = Math.min(minX, w.x1, w.x2); maxX = Math.max(maxX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2); maxY = Math.max(maxY, w.y1, w.y2); }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}
// cômodos "lógicos" (áreas de um ambiente unido viram um só), no formato que o resto do app usa
export function logicalRooms(L) {
  const map = new Map();
  for (const r of L.rooms || []) {
    const g = r.group || r.id;
    if (!map.has(g)) map.set(g, { id: g, name: L.groups?.[g]?.name || r.name, rects: [], area: 0 });
    const R = map.get(g); R.rects.push(r); R.area += r.area;
  }
  for (const R of map.values()) { R.main = R.rects.reduce((a, b) => (b.area > a.area ? b : a)); R.grouped = R.rects.length > 1; }
  return [...map.values()];
}
// divisórias (linhas no piso entre áreas de um ambiente unido)
export function dividers(L) { return (L.walls2 || []).filter(w => w.kind === 'divider'); }
// lados de uma parede: qual cômodo fica do lado A (esquerda de 1->2) e do lado B
export function wallSides(L, w) {
  const [ux, uy] = unit(w), mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2, off = (w.t || DEF_T) / 2 + 0.08;
  const A = areaAt(L, mx - uy * off, my + ux * off, 0), B = areaAt(L, mx + uy * off, my - ux * off, 0);
  return { a: A, b: B };
}

// ---------------------------------------------------------------- mover paredes (editor)
const nearPt = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) < 0.012;
const dirOf = w => { const l = wlen(w) || 1; return [(w.x2 - w.x1) / l, (w.y2 - w.y1) / l]; };
const parallel = (a, b) => Math.abs(a[0] * b[1] - a[1] * b[0]) < 0.05;
function lineCross(px, py, u, qx, qy, v) {
  const den = u[0] * v[1] - u[1] * v[0]; if (Math.abs(den) < 1e-9) return null;
  const t = ((qx - px) * v[1] - (qy - py) * v[0]) / den; return [px + u[0] * t, py + u[1] * t];
}
// Prepara o arraste paralelo de uma parede; devolve f(s) que a desloca s metros na direção da normal (lado A).
// Regras: nas pontas, paredes que chegam em outro ângulo continuam retas (a quina desliza ao longo delas);
// paredes na mesma linha (continuação) ficam paradas; paredes encostadas no meio (T) esticam até a nova posição.
export function wallMover(L, id) {
  const w = (L.walls2 || []).find(x => x.id === id); if (!w) return () => {};
  const u = dirOf(w), n = [-u[1], u[0]];
  const orig = new Map(L.walls2.map(o => [o, { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 }]));
  const ends = ['1', '2'].map(k => {
    const E = [w['x' + k], w['y' + k]], conn = [];
    for (const o of L.walls2) if (o !== w) for (const kk of ['1', '2']) if (nearPt(o['x' + kk], o['y' + kk], E[0], E[1])) conn.push({ o, kk });
    const non = conn.filter(c => !parallel(dirOf(c.o), u));
    const line = non.length && non.every(c => parallel(dirOf(c.o), dirOf(non[0].o))) ? dirOf(non[0].o) : null;
    return { k, E, non, line };
  });
  const tees = [];
  for (const o of L.walls2) if (o !== w) for (const kk of ['1', '2']) {
    const x = o['x' + kk], y = o['y' + kk];
    if (ends.some(e => nearPt(x, y, e.E[0], e.E[1]))) continue;
    const q = distToSeg(x, y, w.x1, w.y1, w.x2, w.y2);
    if (q.d < 0.012 && !parallel(dirOf(o), u)) tees.push({ o, kk, dir: dirOf(o), Q: [x, y] });
  }
  return s => {
    for (const [o, v] of orig) Object.assign(o, v); // sempre a partir da posição original
    const o0 = orig.get(w), P = [o0.x1 + n[0] * s, o0.y1 + n[1] * s];
    for (const e of ends) {
      const E2 = (e.line && lineCross(P[0], P[1], u, e.E[0], e.E[1], e.line)) || [e.E[0] + n[0] * s, e.E[1] + n[1] * s];
      w['x' + e.k] = E2[0]; w['y' + e.k] = E2[1];
      for (const c of e.non) { c.o['x' + c.kk] = E2[0]; c.o['y' + c.kk] = E2[1]; }
    }
    for (const t of tees) { const X = lineCross(P[0], P[1], u, t.Q[0], t.Q[1], t.dir); if (X) { t.o['x' + t.kk] = X[0]; t.o['y' + t.kk] = X[1]; } }
  };
}
// alças das pontas das paredes selecionadas; pontas que se encontram (quina entre duas selecionadas) viram uma alça só
export function endHandles(L, ids) {
  const out = [];
  for (const w of (L.walls2 || []).filter(x => ids.includes(x.id))) for (const k of ['1', '2']) {
    const x = w['x' + k], y = w['y' + k], h = out.find(h => nearPt(h.x, h.y, x, y));
    if (h) h.ends.push({ wall: w.id, end: k }); else out.push({ x, y, ends: [{ wall: w.id, end: k }] });
  }
  return out;
}
// move só as pontas indicadas (as paredes não selecionadas ficam onde estão)
export function moveEnds(L, ends, x, y) {
  for (const e of ends) { const w = L.walls2.find(o => o.id === e.wall); if (w) { w['x' + e.end] = x; w['y' + e.end] = y; } }
}

// ---------------------------------------------------------------- móveis que encostam na parede
// peças que normalmente ficam de costas para a parede; as de centro (mesas, tapetes, pufes...) nunca grudam
export const WALL_FURN = new Set(['sofa', 'sofaL', 'tvrack', 'tvShelf', 'shelf', 'cubeShelf', 'lowShelf', 'sideboard', 'bedDouble', 'bedSingle', 'bedMetal',
  'nightstand', 'wardrobe', 'desk', 'counter', 'sink', 'stove', 'fridge', 'toilet', 'vanity', 'bathtub', 'washer', 'wallCabinet', 'microwave', 'planter']);
// ao arrastar perto de uma parede: encosta as costas do móvel nela e gira de frente para o cômodo (null = longe)
export function snapToWall(L, f, x, y) {
  if (!WALL_FURN.has(f.type)) return null;
  const nw = nearestWall(L, x, y); if (!nw) return null;
  const t = nw.thick || DEF_T;
  if (nw.d > f.d / 2 + t / 2 + 0.35) return null;
  const off = t / 2 + f.d / 2, ang = Math.atan2(nw.nx, nw.ny) * 180 / Math.PI;
  return { x: Math.round((nw.px + nw.nx * off) * 1000) / 1000, y: Math.round((nw.py + nw.ny * off) * 1000) / 1000, rot: ((Math.round(-ang) % 360) + 360) % 360 };
}
