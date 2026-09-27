// Checks the forecast is honest: of the times it said 70%, did that side win about 70% of the time?
import { makeCountry } from '../js/country.js';
import { newCampaign, chooseMate, resolveWeek, finalResult, MODEL } from '../js/campaign.js';
// Optional: try other model weights, e.g.  node dev/calibrate.mjs 50 0.5,1,0.5
if (process.argv[3]) { const [o, rv, pl] = process.argv[3].split(',').map(Number); MODEL.own = o; MODEL.rival = rv; MODEL.plan = pl; }
import { planFor, decideAll } from '../js/ai.js';
import { forecast } from '../js/forecast.js';
const country = makeCountry();
const N = +process.argv[2] || 60;
const bins = Array.from({ length: 10 }, () => [0, 0]);
const byWeek = Array.from({ length: 9 }, () => [0, 0]);
let brier = 0, cnt = 0;
for (let i = 0; i < N; i++) {
  const st = newCampaign(country, { seed: 'cal' + i, side: 0 });
  chooseMate(st, country, 0, 0);
  const rec = [];
  while (st.phase === 'plan') {
    const plans = [planFor(st, country, 0), planFor(st, country, 1)];
    for (const s of [0, 1]) rec.push([s, st.week, forecast(st, country, s, plans[s], 800).p]);
    resolveWeek(st, country, plans);
    for (const s of [0, 1]) decideAll(st, country, s);
  }
  const res = finalResult(st, country);
  for (const [s, w, p] of rec) {
    const won = res.winner === s ? 1 : 0;
    const b = Math.min(9, Math.floor(p * 10));
    bins[b][0]++; bins[b][1] += won;
    byWeek[w][0] += (p - won) ** 2; byWeek[w][1]++;
    brier += (p - won) ** 2; cnt++;
  }
}
bins.forEach(([n, w], b) => n && console.log(`${b * 10}-${b * 10 + 10}%: n=${n} won ${(100 * w / n).toFixed(0)}%`));
console.log('brier', (brier / cnt).toFixed(3), 'by week', byWeek.slice(1).map(([s, n]) => (s / n).toFixed(3)).join(' '));
