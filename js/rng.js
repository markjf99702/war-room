// Seeded random numbers, so a campaign comes out the same every time it's replayed.
// sfc32, seeded from four differently salted hashes of the seed, so similar seeds
// ("w1", "w2") give unrelated streams.

export function rng(seed) {
  const str = String(seed);
  let a = hash('a' + str), b = hash('b' + str), c = hash('c' + str), d = hash('d' + str);
  const next = () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const r = () => next();
  r.range = (lo, hi) => lo + (hi - lo) * next();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  r.pick = arr => arr[Math.floor(next() * arr.length)];
  r.chance = p => next() < p;
  // Normal distribution (Box–Muller), mean 0, sd 1.
  r.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  r.shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  // Picks by weight: [[item, weight], ...]
  r.weighted = pairs => {
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let x = next() * total;
    for (const [item, w] of pairs) { x -= w; if (x <= 0) return item; }
    return pairs[pairs.length - 1][0];
  };
  return r;
}

export function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  h = Math.imul(h ^ h >>> 16, 2246822507);
  h = Math.imul(h ^ h >>> 13, 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
