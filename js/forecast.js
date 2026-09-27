// A campaign's forecast: take what it believes about every region, run the election a couple of
// thousand times with shared national error, and count. Also says which regions matter most.

import { rng } from './rng.js';
import { estimate, sign, WEEKS, OFFICE_GAIN, MODEL, adPush, adPower, rallyPush } from './campaign.js';

// What this week's plan should do in each region, in points for side s. Includes what's already
// set in motion: ads still in the air from last week, and offices that will keep working.
export function planEffects(state, country, s, plan) {
  const n = country.regions.length;
  const fx = new Float64Array(n);
  const weeksLeft = WEEKS - state.week + 1;
  const trait = state.mates[s]?.trait;
  state.regions.forEach((rs, k) => {
    fx[k] += adPush(rs.adStock[s] * 0.5 + plan.ads[k], rs.und);
    if (rs.office[s] || plan.office.includes(k)) fx[k] += OFFICE_GAIN * weeksLeft;
    // What the rival was last seen doing here, assumed to carry on.
    const seen = state.intel[s].seen[k];
    if (seen.office?.open) fx[k] -= OFFICE_GAIN * weeksLeft;
    if (seen.ads?.level) fx[k] -= 1.3 * adPower(2 * seen.ads.level) * (rs.und / 12);
  });
  for (const who of ['cand', 'mate']) {
    const k = plan[who];
    if (!Number.isInteger(k)) continue;
    const f = rallyPush(state.regions[k].und, who, trait);
    fx[k] += f.pers + f.buzz;
    for (const nb of country.regions[k].neighbors) {
      const nf = rallyPush(state.regions[nb].und, who, trait);
      fx[nb] += nf.nbPers + nf.nbBuzz;
    }
  }
  return fx;
}

// Means and spreads for election day, from side s's point of view (margins still in Tidewater points).
export function inputs(state, country, s, plan) {
  const fx = plan ? planEffects(state, country, s, plan) : new Float64Array(country.regions.length);
  const after = Math.max(0, WEEKS - state.week); // weeks still to come after this one
  const regions = country.regions.map((g, k) => {
    const e = estimate(state, s, k);
    const und = state.regions[k].und;
    return {
      now: e.m, sdNow: e.sd, fx: fx[k],
      mean: e.m + MODEL.plan * sign(s) * fx[k],
      sd: Math.sqrt(e.sd ** 2 + after * 0.7 ** 2 + (0.8 + und / 6) ** 2),
    };
  });
  const natSd = Math.sqrt(after * 0.6 ** 2 + 1.3 ** 2 + 0.7 ** 2);
  return { regions, natSd };
}

const PHI = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

// Runs the election n times. Returns side s's chance, the spread of its electors,
// how often each region was the tipping point, and how much a point in each region is worth.
export function simulate(inp, country, s, { n = 2000, seed = 'f' } = {}) {
  const r = rng(seed);
  const K = country.regions.length;
  const el = country.regions.map(g => g.electors);
  const maj = country.majority;
  const hist = new Array(country.totalElectors + 1).fill(0);
  const tip = new Float64Array(K), pivot = new Float64Array(K), winIf = new Float64Array(K), held = new Float64Array(K);
  const m = new Float64Array(K);
  const order = Array.from({ length: K }, (_, k) => k);
  const WIN = 3;
  let wins = 0, sumE = 0;
  for (let i = 0; i < n; i++) {
    const nat = r.gauss() * inp.natSd;
    let E = 0;
    for (let k = 0; k < K; k++) {
      const x = inp.regions[k];
      m[k] = sign(s) * (x.mean + nat + r.gauss() * x.sd);
      if (m[k] > 0) { E += el[k]; held[k]++; }
    }
    const win = E >= maj;
    if (win) wins++;
    sumE += E;
    hist[E]++;
    order.sort((a, b) => m[b] - m[a]);
    let acc = 0;
    for (const k of order) { acc += el[k]; if (acc >= maj) { tip[k]++; break; } }
    for (let k = 0; k < K; k++) {
      if (Math.abs(m[k]) >= WIN) continue;
      const flips = m[k] > 0 ? win && E - el[k] < maj : !win && E + el[k] >= maj;
      if (flips) pivot[k]++;
    }
  }
  // How much side s's chance moves per point gained in each region.
  const value = Array.from(pivot, c => c / (2 * WIN * n));
  country.regions.forEach((g, k) => { winIf[k] = held[k] / n; });
  return {
    p: wins / n, meanE: sumE / n, hist,
    tip: Array.from(tip, c => c / n), value, held: Array.from(winIf),
  };
}

export function forecast(state, country, s, plan, n = 2000) {
  const inp = inputs(state, country, s, plan);
  const sim = simulate(inp, country, s, { n, seed: `${state.seed}:fc:${s}:${state.week}` });
  return { ...sim, inputs: inp };
}

// Cook-style ratings from a chance of holding the region.
export function rating(pT) {
  if (pT >= 0.95) return { key: 't3', label: 'Safe', side: 0 };
  if (pT >= 0.8) return { key: 't2', label: 'Likely', side: 0 };
  if (pT >= 0.6) return { key: 't1', label: 'Leans', side: 0 };
  if (pT > 0.4) return { key: 'tu', label: 'Toss-up', side: null };
  if (pT > 0.2) return { key: 'h1', label: 'Leans', side: 1 };
  if (pT > 0.05) return { key: 'h2', label: 'Likely', side: 1 };
  return { key: 'h3', label: 'Safe', side: 1 };
}

// Chance Tidewater holds a region, from a mean and spread.
export function chanceT(mean, sd) {
  return 0.5 * (1 + erf(mean / (sd * Math.SQRT2)));
}

function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export { PHI };
