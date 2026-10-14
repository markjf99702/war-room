// How often three kinds of player win at each difficulty:  node dev/ladder.mjs [games]  (or npm run sim)
// Campaigns are played the way the page plays them: your plan and the rival's (at the difficulty's level),
// the debate in a debate week, the week itself, the rival's calls, then yours. Sides alternate, and every
// kind of player gets the same seeds, so the rows compare game by game.
import { makeCountry } from '../js/country.js';
import { newCampaign, chooseMate, resolveWeek, finalResult, clampPlan, emptyPlan, adUnit, officeCost, DEBATE_WEEKS, DIFFICULTY } from '../js/campaign.js';
import { planFor, decide, decideAll } from '../js/ai.js';
import { openFor, choose, clashes } from '../js/decisions.js';
import { debateSetup, fitFor, TEMPERS, STYLE_KEYS } from '../js/debate.js';
import { rng } from '../js/rng.js';

const country = makeCountry();
const N = +process.argv[2] || 100;
const n = country.regions.length;
// Any answer the paper would let you pick (one you can pay for, and not a second promise to be somewhere).
const anyCall = (st, s, d, r) => {
  const ok = d.options.filter(o => (o.cost || 0) <= st.money[s] && !clashes(st, d, o));
  return ok.length ? r.pick(ok).key : d.defaultKey;
};

const PLAYERS = {
  // Presses Strategist every week and takes its advice on every call. In a debate, gives the answer marked
  // "Suits this question", or else their natural style.
  strategist: {
    plan: (st, s) => planFor(st, country, s, 'advisor'),
    call: (st, s, d) => decide(st, country, s, d, 'advisor'),
    answer: (st, s, setup, i) => STYLE_KEYS.find(k => fitFor(st, country, setup, i, s, k) >= 0.9) || TEMPERS[st.cands[s].temper].natural,
  },
  // Presses Strategist too, but answers the calls and the debate questions without thinking about them.
  newcomer: {
    plan: (st, s) => planFor(st, country, s, 'advisor'),
    call: anyCall,
    answer: (st, s, setup, i, r) => r.pick(STYLE_KEYS),
  },
  // Sends the candidates anywhere, spends part of the money anywhere, and answers anything.
  random: {
    plan: (st, s, r) => {
      const p = emptyPlan(n);
      p.cand = r.pick(['fund', ...country.regions.map(g => g.id)]);
      p.mate = r.pick(['fund', ...country.regions.map(g => g.id)]);
      let budget = st.money[s] * r.range(0.3, 1);
      for (let i = 0; i < 40; i++) {
        const k = r.int(0, n - 1), roll = r();
        if (roll < 0.1 && !st.regions[k].office[s] && !p.office.includes(k) && officeCost(country.regions[k]) <= budget) { p.office.push(k); budget -= officeCost(country.regions[k]); }
        else if (roll < 0.18 && !p.polls.includes(k) && budget >= 1) { p.polls.push(k); budget -= 1; }
        else if (p.ads[k] < 3 && adUnit(country.regions[k]) <= budget) { p.ads[k]++; budget -= adUnit(country.regions[k]); }
      }
      return p;
    },
    call: anyCall,
    answer: (st, s, setup, i, r) => r.pick(STYLE_KEYS),
  },
};

function play(seed, side, difficulty, player) {
  const st = newCampaign(country, { seed, side, difficulty });
  const r = rng(`${seed}:ladder:${player}`);
  const p = PLAYERS[player], them = 1 - side, level = DIFFICULTY[difficulty].ai;
  chooseMate(st, country, side, r.int(0, 2));
  while (st.phase === 'plan') {
    const mine = clampPlan(p.plan(st, side, r), st, country, side);
    const theirs = planFor(st, country, them, level);
    const opts = {};
    if (DEBATE_WEEKS.includes(st.week)) {
      const setup = debateSetup(st, country, st.week);
      const answers = setup.topics.map((t, i) => p.answer(st, side, setup, i, r));
      opts.debate = { answers: side === 0 ? [answers, null] : [null, answers] };
    }
    resolveWeek(st, country, side === 0 ? [mine, theirs] : [theirs, mine], opts);
    decideAll(st, country, them, level);
    for (const d of openFor(st, side)) choose(st, d.id, p.call(st, side, d, r));
  }
  return finalResult(st, country).winner === side;
}

const t0 = Date.now();
console.log(`${N} campaigns in each cell, sides alternating`);
console.log(`${''.padEnd(12)}${Object.values(DIFFICULTY).map(d => d.label.padEnd(14)).join('')}`);
for (const player of Object.keys(PLAYERS)) {
  const cells = Object.keys(DIFFICULTY).map(difficulty => {
    let won = 0;
    for (let i = 0; i < N; i++) if (play(`ladder${i}`, i % 2, difficulty, player)) won++;
    const w = won / N;
    return `${(100 * w).toFixed(1)}% ±${(196 * Math.sqrt(w * (1 - w) / N)).toFixed(0)}`.padEnd(14);
  });
  console.log(`${player.padEnd(12)}${cells.join('')}`);
}
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
