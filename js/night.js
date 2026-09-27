// Election night. The result is already decided (finalResult); this is how it comes in:
// polls close in three waves from east to west, each region counts in batches, and a decision desk
// calls a region once the votes left can't change it. Early returns lean one way and late ones the
// other, so a lead at 9 PM isn't always a lead at midnight.

import { rng } from './rng.js';
import { sign } from './campaign.js';

export const START = 18 * 60 + 30; // 6:30 PM
export const WAVES = [19 * 60, 20 * 60, 21 * 60];

const leftover = p => Math.pow(1 - p, 1.2);

export function nightPlan(state, country, result) {
  const r = rng(`${state.seed}:night`);
  const regions = country.regions.map((g, k) => {
    const x = result.regions[k];
    const close = g.east > 0.62 ? WAVES[0] : g.east > 0.36 ? WAVES[1] : WAVES[2];
    const prior = x.m + r.gauss() * 3;
    // Cities count their mail ballots last, and those lean Tidewater: early city returns look Highland.
    const skew = -(0.6 + 1.5 * Math.max(0, g.urban)) + r.gauss() * 2.2;
    const deskSkew = skew + r.gauss() * 1.2;

    const start = close + r.int(4, 16);
    const dur = 45 + g.pop / 1e6 * 110 + r.range(0, 70);
    const n = r.int(7, 13);
    const times = Array.from({ length: n }, () => start + r() * dur).sort((a, b) => a - b);
    times[0] = start;
    const weights = times.map((_, i) => (i === 0 ? 1.8 : 0.5 + r()));
    // Some big places hold back a last batch until after midnight.
    if (g.pop > 900_000 && r.chance(0.35)) { times.push(start + dur + r.range(60, 140)); weights.push(1.2); }
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    const reports = times.map((t, i) => {
      acc += weights[i];
      const p = i === times.length - 1 ? 1 : acc / total;
      const shown = x.m + skew * leftover(p);
      const est = shown - deskSkew * leftover(p);
      const sd = 6 * Math.pow(1 - p, 0.9) + 0.35;
      return { t: Math.round(t), p, shown, est, sd };
    });

    let callAt = null, how = 'count';
    const side = x.winner;
    if (Math.abs(prior) > 10 && Math.sign(prior) === Math.sign(x.m)) { callAt = close; how = 'close'; }
    else {
      for (const rep of reports) {
        if (rep.p >= 0.12 && Math.abs(rep.est) > 2.4 * rep.sd && Math.sign(rep.est) === Math.sign(x.m)) { callAt = rep.t; break; }
      }
      if (callAt === null) { callAt = reports.at(-1).t; how = Math.abs(x.m) < 0.5 ? 'recount' : 'late'; }
    }
    return { k, close, prior, skew, reports, callAt, how, side };
  });

  // The race is called when one side's called electors reach a majority.
  const order = [...regions].sort((a, b) => a.callAt - b.callAt);
  const tally = [0, 0];
  let raceAt = null;
  for (const g of order) {
    tally[g.side] += country.regions[g.k].electors;
    if (raceAt === null && tally[g.side] >= country.majority) raceAt = g.callAt;
  }
  const lastReport = Math.max(...regions.map(g => g.reports.at(-1).t));
  return { regions, raceAt, end: Math.max(lastReport, raceAt) + 8 };
}

// Everything on the screen at minute t.
export function nightAt(plan, result, country, t) {
  const electors = [0, 0], counted = [0, 0];
  const regions = plan.regions.map(g => {
    const x = result.regions[g.k];
    let rep = null;
    for (const rp of g.reports) { if (rp.t <= t) rep = rp; else break; }
    const p = rep ? rep.p : 0;
    const called = t >= g.callAt;
    const status = t < g.close ? 'open' : called ? 'called' : 'counting';
    const m = rep ? rep.shown : null;
    const votesIn = Math.round(x.total * p);
    const v0 = rep ? Math.round(votesIn * (0.5 + m / 200)) : 0;
    const votes = [v0, votesIn - v0];
    counted[0] += votes[0]; counted[1] += votes[1];
    if (called) electors[g.side] += country.regions[g.k].electors;
    return { k: g.k, status, p, m, votes, called, side: g.side, how: g.how, rep };
  });
  return { t, regions, electors, counted, raceCalled: t >= plan.raceAt ? result.winner : null };
}

// The needle: side s's chance of winning given what's in at minute t.
export function needle(plan, result, country, t, s, sims = 500) {
  const view = nightAt(plan, result, country, t);
  const r = rng(`needle:${Math.floor(t / 3)}`);
  let wins = 0;
  for (let i = 0; i < sims; i++) {
    const nat = r.gauss() * 2;
    let e = 0;
    for (const v of view.regions) {
      const g = plan.regions[v.k];
      let m;
      if (v.called) m = sign(v.side);
      else if (v.rep) m = v.rep.est + r.gauss() * v.rep.sd;
      else m = g.prior + nat + r.gauss() * 4;
      if (sign(s) * m > 0) e += country.regions[v.k].electors;
    }
    if (e >= country.majority) wins++;
  }
  return wins / sims;
}

export function clock(t) {
  const h = Math.floor(t / 60) % 24, m = Math.floor(t % 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
}
