// Plays one campaign AI vs AI and prints what happened each week:  node dev/trace.mjs [seed]
import { makeCountry } from '../js/country.js';
import { newCampaign, chooseMate, resolveWeek, finalResult, planCost, trueMargin, natAvg } from '../js/campaign.js';
import { planFor } from '../js/ai.js';
import { forecast } from '../js/forecast.js';
const country = makeCountry();
const seed = process.argv[2] || 'trace1';
const st = newCampaign(country, { seed, side: 0, difficulty: 'normal' });
chooseMate(st, country, 0, 0);
const nm = k => Number.isInteger(k) ? country.regions[k].name : k;
console.log('mood', st.mood.toFixed(1), 'cands', st.cands.map(c => c.name + ' (' + country.regions[c.home].name + ')'), 'mates', st.mates.map(m => m.name + ' ' + m.trait));
while (st.phase === 'plan') {
  const plans = [planFor(st, country, 0, 'normal'), planFor(st, country, 1, 'normal')];
  const f = [0, 1].map(s => forecast(st, country, s, plans[s]).p);
  const w = st.week;
  const h = resolveWeek(st, country, plans);
  console.log(`W${w} $${h.plans.map((p, s) => planCost(p, country) + '/' + (st.money[s] - h.income[s] + planCost(p, country))).join(' ')} fc T:${(f[0] * 100).toFixed(0)}% H:${(100 - f[1] * 100).toFixed(0)}%(T) nat ${h.nat} mood ${st.mood.toFixed(1)}`);
  for (const s of [0, 1]) {
    const p = h.plans[s];
    console.log(`   ${'TH'[s]} cand ${nm(p.cand)} mate ${nm(p.mate)} ads ${p.ads.map((l, k) => l ? country.regions[k].name.slice(0, 6) + l : '').filter(Boolean).join(',')} off ${p.office.map(nm).join(',')} polls ${p.polls.map(nm).join(',')}`);
  }
  for (const n of h.news) console.log('   NEWS', n.tag, '|', n.head, '|', n.fx);
}
const res = finalResult(st, country);
console.log('RESULT', res.electors, 'winner', 'TH'[res.winner], 'tipping', country.regions[res.tipping].name, 'pop', ((res.votes[0] - res.votes[1]) / (res.votes[0] + res.votes[1]) * 100).toFixed(1));
country.regions.forEach((g, k) => { const rs = st.regions[k]; console.log(`  ${g.name.padEnd(14)} ${String(g.electors).padStart(2)} lean ${rs.lean.toFixed(1).padStart(6)} final ${res.regions[k].m.toFixed(1).padStart(6)}  own T ${(rs.pers[0] + rs.buzz[0] + rs.gotv[0]).toFixed(1)} H ${(rs.pers[1] + rs.buzz[1] + rs.gotv[1]).toFixed(1)} und ${rs.und.toFixed(1)} est T ${st.intel[0].obs[k].m.toFixed(1)}`); });
