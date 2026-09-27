// The strategist: plans a week for either side from what that side knows.
// The rival uses it every week; you can ask it for a plan too.
//
// It forecasts the race, works out how much one more point in each region is worth to its chance of
// winning, then spends: money on whatever buys the most chance per dollar, the candidate where a
// rally is worth more than a fundraiser, and polls where it's least sure about a region that matters.

import { rng } from './rng.js';
import {
  WEEKS, DEBATE_WEEKS, FUNDRAISE, OFFICE_GAIN, POLL_COST, adPush, adUnit, officeCost, rallyPush, emptyPlan, sign,
} from './campaign.js';
import { inputs, simulate } from './forecast.js';
import { choose, openFor, promiseFor } from './decisions.js';

const NOISE = { easy: 0.9, normal: 0.25, hard: 0, advisor: 0 };

export function planFor(state, country, s, level = 'normal') {
  const n = country.regions.length;
  const r = rng(`${state.seed}:w${state.week}:ai:${s}:${level}`);
  const plan = emptyPlan(n);
  const inp = inputs(state, country, s, plan);
  const sim = simulate(inp, country, s, { n: 1500, seed: `${state.seed}:ai:${s}:${state.week}` });
  const noise = NOISE[level] ?? 0.25;
  const v = sim.value.map((x, k) => (x + 1e-4 * country.regions[k].electors) * Math.exp(r.gauss() * noise));
  const vNat = v.reduce((a, b) => a + b, 0);
  const weeksLeft = WEEKS - state.week + 1;
  let budget = state.money[s];

  // Polls, where a region matters and the picture is stale.
  if (level !== 'easy') {
    const maxPolls = Math.min(level === 'hard' ? 4 : 3, Math.floor(budget * 0.2));
    const want = country.regions.map((g, k) => [k, v[k] * inp.regions[k].sdNow, inp.regions[k].sdNow])
      .filter(x => x[2] >= 3.2).sort((a, b) => b[1] - a[1]).slice(0, maxPolls);
    const top = Math.max(...v);
    for (const [k] of want) if (v[k] > top * 0.15) { plan.polls.push(k); budget -= POLL_COST; }
  }
  if (level === 'hard') {
    plan.free = country.regions.map((g, k) => [k, v[k] * inp.regions[k].sdNow])
      .filter(([k]) => !plan.polls.includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  }

  // Money: greedy by chance bought per dollar. Ad levels have falling returns, so they come in order.
  const items = [];
  state.regions.forEach((rs, k) => {
    const stock = rs.adStock[s] * 0.5;
    for (let L = 1; L <= 3; L++) {
      const gain = adPush(stock + L, rs.und) - adPush(stock + L - 1, rs.und);
      items.push({ kind: 'ad', k, L, cost: adUnit(country.regions[k]), val: gain * v[k] });
    }
    if (!rs.office[s] && weeksLeft >= 2) {
      items.push({ kind: 'office', k, cost: officeCost(country.regions[k]), val: OFFICE_GAIN * weeksLeft * v[k] });
    }
  });
  items.sort((a, b) => b.val / b.cost - a.val / a.cost);
  let lambda = 0;
  for (const it of items) {
    if (it.cost > budget || it.val <= 0) continue;
    if (it.kind === 'ad' && plan.ads[it.k] !== it.L - 1) continue;
    if (it.kind === 'ad') plan.ads[it.k] = it.L; else plan.office.push(it.k);
    budget -= it.cost;
    lambda = it.val / it.cost;
  }
  if (!lambda) lambda = items.length ? items[0].val / items[0].cost : 0;

  // The candidate and the running mate: a rally, a fundraiser, or (before a debate) prep.
  const trait = state.mates[s]?.trait;
  const rallyValue = (k, who) => {
    const f = rallyPush(state.regions[k].und, who, trait);
    let val = (f.pers + f.buzz) * v[k];
    for (const nb of country.regions[k].neighbors) {
      const nf = rallyPush(state.regions[nb].und, who, trait);
      val += (nf.nbPers + nf.nbBuzz) * v[nb];
    }
    return val;
  };
  const moneyLater = state.week < WEEKS ? lambda * 0.9 : 0;
  const pickSpot = (who, skip) => {
    const opts = country.regions.map((g, k) => [k, rallyValue(k, who)]).filter(o => o[0] !== skip).sort((a, b) => b[1] - a[1]);
    if (level === 'easy') return r.pick(opts.slice(0, 5));
    return opts[0];
  };
  const [ck, cv] = pickSpot('cand');
  const choices = [['fund', FUNDRAISE.cand * moneyLater], [ck, cv]];
  if (DEBATE_WEEKS.includes(state.week)) choices.push(['prep', 0.2 * 2 * 1.4 * vNat]);
  plan.cand = choices.sort((a, b) => b[1] - a[1])[0][0];
  // A promise to be somewhere this week is kept.
  const promised = promiseFor(state, s);
  if (promised !== null) plan.cand = promised;
  const [mk, mv] = pickSpot('mate', plan.cand);
  plan.mate = mv > FUNDRAISE.mate * moneyLater ? mk : 'fund';
  return plan;
}

// ---------------------------------------------------------------- the calls

// Picks an answer to one of the week's decisions. It values each option by what it's likely to do to
// the side's chance of winning, and its appetite for a gamble depends on the race: a campaign that's
// behind needs something to change, and one that's ahead wants nothing to.
export function decide(state, country, s, d, level = 'normal') {
  const n = country.regions.length;
  const r = rng(`${state.seed}:decide:${d.id}:${level}`);
  const sim = simulate(inputs(state, country, s, emptyPlan(n)), country, s, { n: 800, seed: `${state.seed}:decide:${s}:${state.week}` });
  const v = sim.value.map((x, k) => x + 1e-4 * country.regions[k].electors);
  const vNat = v.reduce((a, b) => a + b, 0);
  const perDollar = 0.25 * Math.max(...v);
  const worth = fx => {
    if (!fx) return 0;
    let x = (fx.nat || 0) * vNat + (fx.money || 0) * perDollar;
    for (const [k, pts] of fx.regions || []) x += pts * v[k];
    return x;
  };
  const appetite = (0.5 - sim.p) * 1.2;
  const scored = d.options.filter(o => (o.cost || 0) <= state.money[s]).map(o => {
    let x = worth(o.sure) - (o.cost || 0) * perDollar;
    if (o.gamble) {
      const a = worth(o.gamble.win), b = worth(o.gamble.lose), p = o.gamble.p;
      x += p * a + (1 - p) * b + appetite * Math.abs(a - b) * Math.sqrt(p * (1 - p));
    }
    if (o.promise) x += 0.9 * worth(o.promise.kept);
    if (o.stance?.regions) x += worth({ regions: o.stance.regions });
    if (o.flip) {
      const was = state.stances[s][o.flip.issue]?.applied || [];
      x += worth({ regions: o.flip.regions }) - worth({ regions: was });
    }
    if (level === 'easy') x *= Math.exp(r.gauss() * 0.8);
    else if (level === 'normal') x *= Math.exp(r.gauss() * 0.15);
    return [o.key, x];
  });
  if (!scored.length) return d.defaultKey;
  if (level === 'easy' && r.chance(0.35)) return r.pick(scored)[0];
  return scored.sort((a, b) => b[1] - a[1])[0][0];
}

export function decideAll(state, country, s, level = 'normal') {
  for (const d of openFor(state, s)) choose(state, d.id, decide(state, country, s, d, level));
}
