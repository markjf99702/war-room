// Aldermere: the made-up country every campaign is fought over.
// The map comes from a fixed seed, so it's the same board every game (like Risk's);
// each campaign then nudges how the regions lean.

import { rng } from './rng.js';
import { center, neighbor, distance, HEX_W, SIZE } from './hex.js';

export const COUNTRY_SEED = 'a-1';
export const COLS = 24;
export const ROWS = 25;
export const TOTAL_ELECTORS = 121;

const METRO_NAMES = ['Port Ansel', 'Carrowmouth', 'Kingsferry', 'New Aldham'];
const COAST_NAMES = ['Kestrel Coast', 'Saltmarsh', 'Greywater', 'Brackwater', 'Westmere', 'Seaholm', 'Gullhaven', 'Tidemoor', 'Sandling'];
const INLAND_NAMES = ['Upper Fell', 'Stonemarch', 'Lindmoor', 'Ravensmoor', 'Oakhollow', 'Tamsin Vale', 'Yarrow', 'Umber',
  'Norcross', 'Fenwick', 'Dunmore', 'Calder', 'Marrick', 'Varrow', 'Hollins', 'Brennock', 'Sallow', 'Elmstead', 'Quillon', 'Orrin'];

function valueNoise(r) {
  const N = 32;
  const g = Array.from({ length: N * N }, () => r());
  const at = (i, j) => g[(((j % N) + N) % N) * N + (((i % N) + N) % N)];
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function fbm(noise, x, y) {
  let s = 0, amp = 1, f = 1, tot = 0;
  for (let o = 0; o < 4; o++) {
    s += amp * noise(x * f + o * 17.3, y * f + o * 9.1);
    tot += amp; amp *= 0.5; f *= 2;
  }
  return s / tot;
}

export function makeCountry(seed = COUNTRY_SEED, opts = {}) {
  const nRegions = opts.regions ?? 23;
  const r = rng(seed);
  const noise = valueNoise(r);
  const hexes = [];
  const idx = (c, w) => (c < 0 || w < 0 || c >= COLS || w >= ROWS ? -1 : w * COLS + c);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const [x, y] = center(col, row);
      hexes.push({ i: hexes.length, col, row, x, y, land: false, region: -1, nb: [] });
    }
  }
  for (const h of hexes) {
    for (let d = 0; d < 6; d++) {
      const [c, w] = neighbor(h.col, h.row, d);
      h.nb.push(idx(c, w));
    }
  }
  const width = HEX_W * (COLS + 0.5), height = SIZE * 1.5 * (ROWS - 1) + SIZE * 2;
  const cx = width / 2, cy = height / 2;

  // The land: a lumpy blob.
  for (const h of hexes) {
    const nx = (h.x - cx) / (width * 0.47), ny = (h.y - cy) / (height * 0.47);
    const d = Math.hypot(nx, ny);
    const n = fbm(noise, h.x / 55, h.y / 55);
    h.land = d < 0.8 + (n - 0.5) * 1.25;
  }
  keepLargest(hexes);
  fillHoles(hexes);
  for (let pass = 0; pass < 3; pass++) {
    for (const h of hexes) {
      if (h.land && h.nb.filter(j => j >= 0 && hexes[j].land).length <= 1) h.land = false;
    }
  }
  keepLargest(hexes);
  const land = hexes.filter(h => h.land);
  for (const h of land) h.coast = h.nb.some(j => j < 0 || !hexes[j].land);

  // Cities: two ports and two inland, spread apart.
  const metros = [];
  const pickFar = (pool) => {
    let best = null, bestD = -1;
    for (const h of pool) {
      const d = metros.length ? Math.min(...metros.map(m => distance(h.col, h.row, m.col, m.row))) : r();
      const score = d + r() * 1.5;
      if (score > bestD) { bestD = score; best = h; }
    }
    return best;
  };
  const coastPool = land.filter(h => h.coast && h.nb.filter(j => j >= 0 && hexes[j].land).length >= 3);
  const inlandPool = land.filter(h => !h.coast && h.nb.every(j => j >= 0 && hexes[j].land && !hexes[j].coast));
  metros.push(pickFar(coastPool));
  metros.push(pickFar(coastPool));
  metros.push(pickFar(inlandPool));
  metros.push(pickFar(inlandPool));

  // People: dense around the cities, thin elsewhere.
  for (const h of land) {
    let d = 0.35 + 0.25 * fbm(noise, h.x / 40 + 50, h.y / 40 + 50);
    metros.forEach((m, k) => {
      const dist = distance(h.col, h.row, m.col, m.row);
      const weight = k < 2 ? 5.2 : 3.4;
      d += weight * Math.exp(-(dist * dist) / (2 * 1.7 * 1.7));
    });
    h.density = d;
  }

  // Regions: seeds placed more thickly where people live, grown outward along random-cost paths.
  const seeds = [];
  const byWeight = land.map(h => [h, Math.pow(h.density, 0.55) * (0.4 + r())]).sort((a, b) => b[1] - a[1]);
  for (const minD of [5, 4, 3]) {
    for (const [h] of byWeight) {
      if (seeds.length >= nRegions) break;
      if (seeds.every(s => distance(h.col, h.row, s.col, s.row) >= minD + (h.density > 2 ? -1 : 0))) seeds.push(h);
    }
  }
  const cost = new Map();
  const edgeCost = (a, b) => {
    const k = a < b ? a * 10000 + b : b * 10000 + a;
    if (!cost.has(k)) cost.set(k, 1 + r() * 1.4);
    return cost.get(k);
  };
  const best = new Float64Array(hexes.length).fill(Infinity);
  const queue = [];
  seeds.forEach((s, k) => { best[s.i] = 0; s.region = k; queue.push([0, s.i, k]); });
  while (queue.length) {
    queue.sort((a, b) => b[0] - a[0]);
    const [d, i, k] = queue.pop();
    if (d > best[i]) continue;
    hexes[i].region = k;
    for (const j of hexes[i].nb) {
      if (j < 0 || !hexes[j].land) continue;
      // Crossing into dense country costs more, so city regions stay small.
      const nd = d + edgeCost(i, j) * (0.6 + 0.4 * Math.min(3, hexes[j].density));
      if (nd < best[j]) { best[j] = nd; queue.push([nd, j, k]); }
    }
  }

  // Fold in any region too small to tap.
  let ids = seeds.map((_, k) => k);
  for (;;) {
    const sizes = new Map(ids.map(k => [k, 0]));
    for (const h of land) sizes.set(h.region, sizes.get(h.region) + 1);
    const small = ids.filter(k => sizes.get(k) < 8).sort((a, b) => sizes.get(a) - sizes.get(b))[0];
    if (small === undefined) break;
    const around = new Map();
    for (const h of land) {
      if (h.region !== small) continue;
      for (const j of h.nb) if (j >= 0 && hexes[j].land && hexes[j].region !== small) around.set(hexes[j].region, (around.get(hexes[j].region) || 0) + 1);
    }
    const into = [...around.entries()].sort((a, b) => sizes.get(a[0]) - sizes.get(b[0]))[0][0];
    for (const h of land) if (h.region === small) h.region = into;
    ids = ids.filter(k => k !== small);
  }
  const remap = new Map(ids.map((k, n) => [k, n]));
  for (const h of land) h.region = remap.get(h.region);

  // Region facts.
  const regions = ids.map((_, n) => ({ id: n, hexes: [], neighbors: new Set() }));
  for (const h of land) regions[h.region].hexes.push(h.i);
  for (const h of land) {
    for (const j of h.nb) if (j >= 0 && hexes[j].land && hexes[j].region !== h.region) regions[h.region].neighbors.add(hexes[j].region);
  }
  const maxX = Math.max(...land.map(h => h.x)), minX = Math.min(...land.map(h => h.x));
  const maxY = Math.max(...land.map(h => h.y)), minY = Math.min(...land.map(h => h.y));
  for (const reg of regions) {
    const hs = reg.hexes.map(i => hexes[i]);
    reg.neighbors = [...reg.neighbors].sort((a, b) => a - b);
    reg.coastal = hs.some(h => h.coast);
    reg.size = hs.length;
    reg.popRaw = hs.reduce((s, h) => s + h.density, 0);
    reg.cx = hs.reduce((s, h) => s + h.x, 0) / hs.length;
    reg.cy = hs.reduce((s, h) => s + h.y, 0) / hs.length;
    reg.east = (reg.cx - minX) / (maxX - minX);
    reg.north = 1 - (reg.cy - minY) / (maxY - minY);
    reg.metro = metros.findIndex(m => m.region === reg.id);
    // Label spot: the hex deepest inside the region, nudged toward its middle.
    const depth = interiorDepth(hexes, hs, reg.id);
    let spot = hs[0], score = -Infinity;
    for (const h of hs) {
      const s = depth.get(h.i) * 3 - Math.hypot(h.x - reg.cx, h.y - reg.cy) / HEX_W;
      if (s > score) { score = s; spot = h; }
    }
    reg.lx = spot.x; reg.ly = spot.y; reg.depth = depth.get(spot.i);
  }

  // People, turned into voters and electors.
  const totalRaw = regions.reduce((s, g) => s + g.popRaw, 0);
  const VOTERS = 14_200_000;
  for (const reg of regions) reg.pop = Math.round(reg.popRaw / totalRaw * VOTERS / 1000) * 1000;
  apportion(regions, TOTAL_ELECTORS);

  // Politics: cities and the coast lean Tidewater, the interior Highland, with a lumpy field on top.
  const dens = regions.map(g => Math.log(g.popRaw / g.size));
  const mean = dens.reduce((a, b) => a + b, 0) / dens.length;
  const sd = Math.sqrt(dens.reduce((a, b) => a + (b - mean) ** 2, 0) / dens.length);
  for (const reg of regions) {
    reg.urban = (Math.log(reg.popRaw / reg.size) - mean) / sd;
    const field = fbm(noise, reg.cx / 90 + 200, reg.cy / 90 + 200) - 0.5;
    reg.leanRaw = 11 * reg.urban + (reg.coastal ? 3 : -3) + 28 * field + 6 * (reg.north - 0.5) + r.gauss() * 3.5;
  }
  const lsd = Math.sqrt(regions.reduce((a, g) => a + g.leanRaw ** 2, 0) / regions.length);
  for (const reg of regions) reg.lean = reg.leanRaw / lsd * 15;
  const shift = medianShift(regions, g => g.lean);
  for (const reg of regions) {
    reg.lean = +(reg.lean - shift).toFixed(1);
    // Swingier in the middle of the spectrum.
    reg.elastic = Math.max(0.25, 1 - Math.abs(reg.lean) / 38 + r.gauss() * 0.08);
    reg.und0 = +(5 + 10 * reg.elastic).toFixed(1);
    reg.turnout = +(0.64 - 0.04 * Math.tanh(reg.urban) + r.range(-0.05, 0.05)).toFixed(3);
  }

  // Names.
  const coastNames = r.shuffle([...COAST_NAMES]);
  const inlandNames = r.shuffle([...INLAND_NAMES]);
  for (const reg of regions) {
    if (reg.metro >= 0) reg.name = METRO_NAMES[reg.metro];
    else if (reg.coastal && coastNames.length) reg.name = coastNames.pop();
    else reg.name = inlandNames.pop();
  }
  const cities = metros.map((m, k) => ({ name: METRO_NAMES[k], x: m.x, y: m.y, region: m.region, capital: k === 0 }));

  const edges = borderEdges(hexes);
  return {
    seed, cols: COLS, rows: ROWS, width, height, hexes, regions, cities, edges,
    totalElectors: TOTAL_ELECTORS, majority: Math.floor(TOTAL_ELECTORS / 2) + 1,
  };
}

function keepLargest(hexes) {
  const seen = new Int32Array(hexes.length).fill(-1);
  let best = -1, bestSize = 0, comp = 0;
  for (const h of hexes) {
    if (!h.land || seen[h.i] >= 0) continue;
    let size = 0;
    const stack = [h.i];
    seen[h.i] = comp;
    while (stack.length) {
      const i = stack.pop(); size++;
      for (const j of hexes[i].nb) if (j >= 0 && hexes[j].land && seen[j] < 0) { seen[j] = comp; stack.push(j); }
    }
    if (size > bestSize) { bestSize = size; best = comp; }
    comp++;
  }
  for (const h of hexes) if (h.land && seen[h.i] !== best) h.land = false;
}

function fillHoles(hexes) {
  const outside = new Uint8Array(hexes.length);
  const stack = hexes.filter(h => !h.land && h.nb.some(j => j < 0)).map(h => h.i);
  for (const i of stack) outside[i] = 1;
  while (stack.length) {
    const i = stack.pop();
    for (const j of hexes[i].nb) if (j >= 0 && !hexes[j].land && !outside[j]) { outside[j] = 1; stack.push(j); }
  }
  for (const h of hexes) if (!h.land && !outside[h.i]) h.land = true;
}

function interiorDepth(hexes, hs, id) {
  const depth = new Map();
  let frontier = hs.filter(h => h.nb.some(j => j < 0 || hexes[j].region !== id || !hexes[j].land));
  for (const h of frontier) depth.set(h.i, 0);
  let d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const h of frontier) {
      for (const j of h.nb) {
        if (j >= 0 && hexes[j].land && hexes[j].region === id && !depth.has(j)) { depth.set(j, d); next.push(hexes[j]); }
      }
    }
    frontier = next;
  }
  return depth;
}

// Largest-remainder apportionment with a floor of three electors each.
function apportion(regions, total) {
  const FLOOR = 2;
  const pool = total - FLOOR * regions.length;
  const sum = regions.reduce((s, g) => s + g.pop, 0);
  const quotas = regions.map(g => g.pop / sum * pool);
  regions.forEach((g, k) => { g.electors = FLOOR + Math.floor(quotas[k]); });
  let left = total - regions.reduce((s, g) => s + g.electors, 0);
  const order = regions.map((g, k) => [k, quotas[k] - Math.floor(quotas[k])]).sort((a, b) => b[1] - a[1]);
  for (let n = 0; left > 0; n++, left--) regions[order[n % order.length][0]].electors++;
  for (const g of regions) if (g.electors < 3) {
    const donor = regions.reduce((a, b) => (b.electors > a.electors ? b : a));
    donor.electors--; g.electors++;
  }
}

// The lean at which the region that tips the electoral count sits exactly at zero.
function medianShift(regions, lean) {
  const sorted = [...regions].sort((a, b) => lean(b) - lean(a));
  const need = Math.floor(TOTAL_ELECTORS / 2) + 1;
  let acc = 0;
  for (const g of sorted) { acc += g.electors; if (acc >= need) return lean(g); }
  return 0;
}

// Every hex edge that is a region border or a coastline, as line segments.
function borderEdges(hexes) {
  const coast = [], inner = [];
  for (const h of hexes) {
    if (!h.land) continue;
    const cs = cornersOf(h);
    for (let d = 0; d < 6; d++) {
      const j = h.nb[d];
      const a = cs[d], b = cs[(d + 1) % 6];
      if (j < 0 || !hexes[j].land) coast.push([a, b, h.region]);
      else if (hexes[j].region !== h.region && h.i < j) inner.push([a, b, h.region, hexes[j].region]);
    }
  }
  return { coast, inner };
}

function cornersOf(h) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    out.push([+(h.x + SIZE * Math.cos(a)).toFixed(2), +(h.y + SIZE * Math.sin(a)).toFixed(2)]);
  }
  return out;
}
