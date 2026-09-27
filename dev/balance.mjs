// Plays many campaigns between strategies to check the game is balanced:  node dev/balance.mjs [n]
import { makeCountry } from '../js/country.js';
import { newCampaign, chooseMate, resolveWeek, finalResult, emptyPlan, planCost, trueMargin, adUnit, estimate } from '../js/campaign.js';
import { planFor } from '../js/ai.js';
import { rng } from '../js/rng.js';
const country = makeCountry();
const N = +process.argv[2] || 60;
const strat = {
  normal: (st, s) => planFor(st, country, s, 'normal'),
  hard: (st, s) => planFor(st, country, s, 'hard'),
  easy: (st, s) => planFor(st, country, s, 'easy'),
  passive: (st, s) => emptyPlan(country.regions.length),
  naive: (st, s) => {
    // What a person might do by feel: pile into the closest-looking regions.
    const p = emptyPlan(country.regions.length);
    const close = country.regions.map((g, k) => [k, Math.abs(estimate(st, s, k).m)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    p.cand = close[0]; p.mate = close[1];
    let b = st.money[s];
    for (const k of close.slice(0, 5)) { const c = adUnit(country.regions[k]); while (p.ads[k] < 3 && c <= b) { p.ads[k]++; b -= c; } }
    return p;
  },
  random: (st, s) => { const r = rng(st.seed + st.week + 'rand' + s); const p = emptyPlan(country.regions.length); p.cand = r.int(0, 20); p.mate = r.int(0, 20); let b = st.money[s]; for (let i = 0; i < 30; i++) { const k = r.int(0, 20); const c = adUnit(country.regions[k]); if (p.ads[k] < 3 && c <= b) { p.ads[k]++; b -= c; } } return p; },
};
function play(a, b, seed, difficulty = b === 'hard' ? 'hard' : b === 'easy' ? 'easy' : 'normal') {
  const st = newCampaign(country, { seed, side: 0, difficulty });
  chooseMate(st, country, 0, 0);
  const t0 = Date.now();
  while (st.phase === 'plan') resolveWeek(st, country, [strat[a](st, 0), strat[b](st, 1)]);
  const res = finalResult(st, country);
  return { st, res, ms: Date.now() - t0 };
}
for (const [a, b] of (process.argv[3] ? process.argv[3].split(';').map(x => x.split(',')) : [['normal', 'normal'], ['normal', 'passive'], ['normal', 'random'], ['normal', 'hard'], ['normal', 'easy'], ['naive', 'normal'], ['naive', 'easy'], ['naive', 'hard']])) {
  let w0 = 0, close = 0, ms = 0, spent = 0, marg = [], swingAbs = 0;
  for (let i = 0; i < N; i++) {
    const { st, res, ms: t } = play(a, b, 'bal' + i);
    ms += t;
    if (res.winner === 0) w0++;
    close += res.regions.filter(x => Math.abs(x.m) < 5).length;
    const moodFree = st.regions.map((rs, k) => (rs.pers[0] - rs.pers[1] + rs.buzz[0] - rs.buzz[1] + rs.gotv[0] - rs.gotv[1]));
    swingAbs += moodFree.reduce((x, y) => x + Math.abs(y), 0) / moodFree.length;
    marg.push(res.electors[0]);
  }
  console.log(`${a.padEnd(8)} vs ${b.padEnd(8)} T wins ${(100 * w0 / N).toFixed(0)}%  close regions ${(close / N).toFixed(1)}  avg campaign effect ${(swingAbs / N).toFixed(2)}pt  ms/game ${(ms / N).toFixed(0)}`);
}
