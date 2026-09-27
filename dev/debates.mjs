// How much playing the debates well is worth:  node dev/debates.mjs
import { makeCountry } from '../js/country.js';
import { newCampaign, chooseMate } from '../js/campaign.js';
import { debateSetup, autoAnswers, debateOutcome, TEMPERS, STYLE_KEYS } from '../js/debate.js';
import { rng } from '../js/rng.js';
const country = makeCountry();
const BEATEN_BY = { facts: 'attack', plan: 'facts', story: 'plan', attack: 'story' };
const players = {
  random: (st, setup, i, r) => r.pick(STYLE_KEYS),
  auto: null,
  // Knows the rival's temper (as with prep): answers with whatever beats their natural style.
  scout: (st, setup, i) => BEATEN_BY[TEMPERS[st.cands[1].temper].natural],
};
for (const [name, fn] of Object.entries(players)) for (const prep of [false, true]) {
  let wins = 0, losses = 0, sum = 0;
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const st = newCampaign(country, { seed: 'deb' + i }); chooseMate(st, country, 0, 0);
    const setup = debateSetup(st, country, 3);
    const r = rng('p' + i);
    const mine = fn ? setup.topics.map((t, q) => fn(st, setup, q, r)) : autoAnswers(st, country, setup, 0);
    const out = debateOutcome(st, country, setup, [mine, autoAnswers(st, country, setup, 1)], [prep, false]);
    if (out.winner === 0) wins++; else if (out.winner === 1) losses++;
    sum += out.winner === null ? 0 : (out.winner === 0 ? 1 : -1) * out.bump;
  }
  console.log(`${name.padEnd(7)} prep ${prep ? 'yes' : 'no '}  won ${(100 * wins / N).toFixed(0)}%  lost ${(100 * losses / N).toFixed(0)}%  average swing ${(sum / N).toFixed(2)} pts`);
}
