// The campaign itself: the true state of the race (which nobody sees), a week of campaigning,
// the polls, and what each side can know. Everything is seeded, so a campaign replays exactly.
//
// Margins are always in points for Tidewater (side 0): +4 means Tidewater by 4, -4 means Highland by 4.

import { rng } from './rng.js';
import { PARTIES, TRAITS, person, titleFor } from './names.js';
import { weekEvents, finalWeather } from './events.js';
import { crisisDecisions, issueDecisions, resurfaceDecision, resolveDecisions } from './decisions.js';
import { debateSetup, autoAnswers, debateOutcome, debateStory, TEMPERS } from './debate.js';

export const WEEKS = 8;
export const DEBATE_WEEKS = [3, 6];
export const START_MONEY = 15;
export const INCOME = 10;
export const FUNDRAISE = { cand: 6, mate: 3 };
export const POLL_COST = 1;
export const AD_NAMES = ['None', 'Light', 'Steady', 'Heavy'];
export const OFFICE_GAIN = 0.3; // points a field office adds each week it's open
export const HOME_BONUS = { cand: 2, mate: 1 };
export const POLL_SD = { own: 2.2, public: 3.2, last: 4, national: 1.2 };
export const FOG = 1.1; // how many points an estimate goes stale each week without a poll
// How much of a side's own work (and what it has seen of the rival's) its model counts before a poll confirms it.
export const MODEL = { own: 0.5, rival: 1, plan: 0.5 };
export const DIFFICULTY = {
  easy: { label: 'Easy', mood: 3.2, ai: 'easy', text: 'The country is leaning your way and your rival makes mistakes.' },
  normal: { label: 'Normal', mood: 0, ai: 'normal', text: 'A close year against a capable rival.' },
  hard: { label: 'Hard', mood: -1.5, ai: 'hard', text: 'The mood is against you and your rival has better data.' },
};

export const sign = s => (s === 0 ? 1 : -1);
export const adUnit = reg => Math.min(4, Math.max(1, Math.ceil(reg.pop / 800_000)));
export const officeCost = reg => 2 + adUnit(reg);
export const other = s => 1 - s;

// ---------------------------------------------------------------- effects of one week's work

// Ads: stock carries half over from week to week, and saturates.
export const adPower = stock => 1 - Math.exp(-stock / 2);
export const adPush = (stock, und) => 1.3 * adPower(stock) * (und / 12);
export function rallyPush(und, who, trait) {
  const k = who === 'cand' ? 1 : trait === 'stumper' ? 0.75 : 0.5;
  return { pers: k * 0.55 * (und / 12), buzz: k * 0.8, nbPers: k * 0.15 * (und / 12), nbBuzz: k * 0.25 };
}

export function emptyPlan(n) {
  return { cand: 'fund', mate: 'fund', ads: Array(n).fill(0), office: [], polls: [], free: [] };
}

export function planCost(plan, country) {
  let c = 0;
  plan.ads.forEach((lvl, r) => { c += lvl * adUnit(country.regions[r]); });
  for (const r of plan.office) c += officeCost(country.regions[r]);
  c += plan.polls.length * POLL_COST;
  return c;
}

export function income(state, s, plan) {
  let m = INCOME;
  if (state.mates[s]?.trait === 'fundraiser') m += 2;
  if (plan.cand === 'fund') m += FUNDRAISE.cand;
  if (plan.mate === 'fund') m += FUNDRAISE.mate;
  return m;
}

// ---------------------------------------------------------------- a new campaign

export function newCampaign(country, { seed, side = 0, difficulty = 'normal' }) {
  const r = rng(`${seed}:setup`);
  const n = country.regions.length;
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;

  // Each cycle, parts of the country drift: a north-south and an east-west trend, and local noise.
  const ns = r.gauss() * 3, ew = r.gauss() * 3;
  let leans = country.regions.map(g => g.lean + ns * (g.north - 0.5) * 2 + ew * (g.east - 0.5) * 2 + r.gauss() * 2.4);
  const centre = evenShift(country, leans, `${seed}:centre`);
  leans = leans.map(l => +(l - centre).toFixed(2));

  const mood = +(diff.mood * sign(side) + r.gauss() * (difficulty === 'normal' ? 1.4 : 0.6)).toFixed(2);
  const incumbent = r.int(0, 1);

  const regions = country.regions.map((g, k) => ({
    lean: leans[k], home: 0, drift: 0, evt: 0,
    pers: [0, 0], buzz: [0, 0], gotv: [0, 0], office: [0, 0], adStock: [0, 0], ads: [0, 0], rally: [0, 0], issue: [0, 0],
    und: +(g.und0 + r.gauss()).toFixed(2),
  }));

  // Candidates, each from somewhere their party can win.
  const used = new Set();
  const cands = [0, 1].map(s => {
    const pool = country.regions.filter((g, k) => sign(s) * leans[k] > -4 && g.electors >= 4);
    const home = r.pick(pool).id;
    const p = person(r, used);
    const temper = r.pick(Object.keys(TEMPERS));
    return { ...p, home, temper, title: s === incumbent && r.chance(0.5) ? 'Vice President' : titleFor(r, country.regions[home], true) };
  });
  cands.forEach((c, s) => { regions[c.home].home += sign(s) * HOME_BONUS.cand; });

  // Three people each side could put on the ticket, each with something to offer.
  const traits = Object.keys(TRAITS);
  const mateOptions = [0, 1].map(s => {
    const taken = new Set([cands[0].home, cands[1].home]);
    const byClose = country.regions.map((g, k) => [k, Math.abs(leans[k]) + r.range(0, 6)]).sort((a, b) => a[1] - b[1]);
    const homes = [];
    for (const [k] of byClose) { if (!taken.has(k) && homes.length < 3) { homes.push(k); taken.add(k); } }
    r.shuffle(homes);
    return r.shuffle([...traits]).map((trait, j) => ({ ...person(r, used), home: homes[j], trait, title: titleFor(r, country.regions[homes[j]], false) }));
  });

  // The last election, which both campaigns start from: it was fought on the old map.
  const lastMood = +(r.gauss() * 3).toFixed(1);
  const last = country.regions.map(g => +(g.lean + lastMood + r.gauss() * 1.5).toFixed(1));
  const lastNat = popular(country, last);
  const lastE = electorsFor(country, last);
  const lastWinner = lastE >= country.majority ? 0 : 1;

  const state = {
    v: 2, seed: String(seed), side, difficulty, week: 1, phase: 'mate',
    mood, incumbent, cands, mates: [null, null], mateOptions,
    money: [START_MONEY, START_MONEY],
    regions, last, lastNat, lastWinner, lastMood, lastElectors: [lastE, country.totalElectors - lastE],
    natPolls: [], publicPolls: [], rallies: [], history: [], rain: [],
    intel: [0, 1].map(() => ({
      obs: last.map(m => ({ week: 0, m, sd: POLL_SD.last, own: 0, rival: 0, nat: lastNat, src: 'last' })),
      seen: country.regions.map(() => ({ ads: null, office: null })),
      polls: [],
    })),
    forecasts: [[], []],
    plans: [emptyPlan(n), emptyPlan(n)],
    // Decisions waiting on an answer (and answered ones, until they play out), positions taken on issues.
    pending: [], decided: [], stances: [{}, {}], issuesSeen: [], eventCounts: {},
  };

  // Before the first week: a national poll and a few early polls in the obvious battlegrounds.
  const pr = rng(`${seed}:w0:public`);
  nationalPoll(state, country, pr, 0);
  for (const k of publicPollRegions(state, country, pr, 4)) publicPoll(state, country, pr, k, 0);
  return state;
}

// Picking a running mate (the rival picks theirs at the same time).
export function chooseMate(state, country, s, j) {
  const m = state.mateOptions[s][j];
  state.mates[s] = m;
  state.regions[m.home].home += sign(s) * HOME_BONUS.mate;
  if (!state.mates[other(s)]) {
    const o = other(s);
    const opts = state.mateOptions[o];
    // The rival takes the one from the closest region.
    const pick = opts.reduce((a, b) => (Math.abs(state.regions[b.home].lean) < Math.abs(state.regions[a.home].lean) ? b : a));
    state.mates[o] = pick;
    state.regions[pick.home].home += sign(o) * HOME_BONUS.mate;
  }
  state.phase = 'plan';
}

// ---------------------------------------------------------------- the true state

export function trueMargin(rs, mood) {
  return rs.lean + rs.home + mood + rs.drift + rs.evt
    + rs.pers[0] - rs.pers[1] + rs.buzz[0] - rs.buzz[1] + rs.gotv[0] - rs.gotv[1] + rs.issue[0] - rs.issue[1];
}

// A side's own doing in a region: persuasion, enthusiasm, turnout and the positions it has taken.
export const ownEffect = (rs, s) => rs.pers[s] + rs.buzz[s] + rs.gotv[s] + rs.issue[s];

export function popular(country, margins) {
  let tot = 0, sum = 0;
  country.regions.forEach((g, k) => { tot += g.pop * g.turnout; sum += g.pop * g.turnout * margins[k]; });
  return sum / tot;
}

export function electorsFor(country, margins) {
  return country.regions.reduce((e, g, k) => e + (margins[k] > 0 ? g.electors : 0), 0);
}

// The shift that makes the map a true coin flip before anyone campaigns. Lining the regions up and
// zeroing the one in the middle isn't enough: if one side's route to a majority runs through several
// near-even regions and the other's through all of them, the first side wins more often than not.
function evenShift(country, leans, seed) {
  const r = rng(seed);
  const N = 3000, K = leans.length;
  const draws = Array.from({ length: N }, () => ({ nat: r.gauss() * 2.8, reg: Array.from({ length: K }, () => r.gauss() * 4.6) }));
  const chance = shift => {
    let wins = 0;
    for (const d of draws) {
      let e = 0;
      for (let k = 0; k < K; k++) if (leans[k] - shift + d.nat + d.reg[k] > 0) e += country.regions[k].electors;
      if (e >= country.majority) wins++;
    }
    return wins / N;
  };
  let lo = -15, hi = 15;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (chance(mid) > 0.5) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- polls and what each side knows

export function natAvg(state, upTo = Infinity) {
  const ps = state.natPolls.filter(p => p.week <= upTo).slice(-3);
  return ps.reduce((a, p) => a + p.m, 0) / ps.length;
}

// What a side can see of the rival's work in a region since week `from`: rallies are public, and its
// own polls turned up the rival's ads and field office, which it assumes are still running.
export function rivalSeen(state, s, k, from) {
  const rs = state.regions[k], o = other(s);
  const seen = state.intel[s].seen[k];
  const done = state.week - 1;
  const weeks = Math.max(0, done - from);
  let fx = 0;
  if (seen.ads?.level) fx += 1.3 * adPower(2 * seen.ads.level) * (rs.und / 12) * weeks;
  if (seen.office?.open) fx += OFFICE_GAIN * Math.max(0, done - Math.max(from, seen.office.week));
  return fx;
}

// Where a side thinks a region stands right now: its last reading, moved by the national polls since,
// by its own work since (it knows exactly what it did), and by what it has seen of the rival's.
export function estimate(state, s, k) {
  const o = state.intel[s].obs[k];
  const rs = state.regions[k];
  const done = state.week - 1;
  const m = o.m + (natAvg(state) - o.nat)
    + MODEL.own * sign(s) * (ownEffect(rs, s) - o.own)
    + MODEL.rival * sign(other(s)) * (rs.rally[other(s)] - o.rival + rs.issue[other(s)] - (o.rivalIssue || 0) + rivalSeen(state, s, k, o.week));
  const sd = Math.sqrt(o.sd ** 2 + (FOG * Math.max(0, done - o.week)) ** 2);
  return { m, sd, week: o.week, src: o.src };
}

// Folds a new reading into a side's estimate (a simple Kalman update).
function observe(state, s, k, m, sd, src, week) {
  const prior = estimate(state, s, k);
  const wp = 1 / prior.sd ** 2, wm = 1 / sd ** 2;
  state.intel[s].obs[k] = {
    week, m: (prior.m * wp + m * wm) / (wp + wm), sd: Math.sqrt(1 / (wp + wm)),
    own: ownEffect(state.regions[k], s), rival: state.regions[k].rally[other(s)], rivalIssue: state.regions[k].issue[other(s)], nat: natAvg(state), src,
  };
}

function nationalPoll(state, country, r, week) {
  const now = country.regions.map((g, k) => trueMargin(state.regions[k], state.mood));
  const m = +(popular(country, now) + r.gauss() * POLL_SD.national).toFixed(1);
  state.natPolls.push({ week, m });
}

function publicPollRegions(state, country, r, count) {
  const w = country.regions.map((g, k) => {
    const m = Math.abs(trueMargin(state.regions[k], state.mood));
    return [k, (m < 10 ? 1 : 0.15) * Math.sqrt(g.electors) * (0.5 + r())];
  }).sort((a, b) => b[1] - a[1]);
  return w.slice(0, count).map(x => x[0]);
}

const POLLSTERS = ['Ledger/Harwick', 'Meridian Research', 'Coastline Polling', 'Ferris & Dunn', 'Aldermere Public Radio', 'Bellweather Poll'];

function publicPoll(state, country, r, k, week) {
  const truth = trueMargin(state.regions[k], state.mood);
  const m = +(truth + r.gauss() * POLL_SD.public).toFixed(1);
  const und = Math.max(1, Math.round(state.regions[k].und + r.gauss()));
  const p = { week, region: k, m, und, by: r.pick(POLLSTERS) };
  state.publicPolls.push(p);
  for (const s of [0, 1]) observe(state, s, k, m, POLL_SD.public, 'public', week);
  return p;
}

function ownPoll(state, country, s, k, week) {
  const r = rng(`${state.seed}:w${week}:poll:${s}:${k}`);
  const rs = state.regions[k];
  const truth = trueMargin(rs, state.mood);
  const m = +(truth + r.gauss() * POLL_SD.own).toFixed(1);
  const und = Math.max(1, Math.round(rs.und + r.gauss() * 0.7));
  const o = other(s);
  // A poll also turns up what the rival has on the ground there.
  const seen = state.intel[s].seen[k];
  seen.ads = { week, level: rs.ads[o] };
  seen.office = { week, open: rs.office[o] > 0 };
  const p = { week, region: k, m, und, rivalAds: rs.ads[o], rivalOffice: rs.office[o] > 0 };
  state.intel[s].polls.push(p);
  observe(state, s, k, m, POLL_SD.own, 'own', week);
  return p;
}

// ---------------------------------------------------------------- a week

export function clampPlan(plan, state, country, s) {
  const n = country.regions.length;
  const p = {
    cand: plan.cand, mate: plan.mate,
    ads: Array.from({ length: n }, (_, k) => Math.max(0, Math.min(3, plan.ads?.[k] | 0))),
    office: [...new Set(plan.office || [])].filter(k => k >= 0 && k < n && !state.regions[k].office[s]),
    polls: [...new Set(plan.polls || [])].filter(k => k >= 0 && k < n),
    // A hard rival's data team runs a few polls of its own on top.
    free: state.difficulty === 'hard' && s !== state.side ? [...new Set(plan.free || [])].filter(k => k >= 0 && k < n).slice(0, 3) : [],
  };
  if (p.cand === 'prep' && !DEBATE_WEEKS.includes(state.week)) p.cand = 'fund';
  if (!(p.cand === 'fund' || p.cand === 'prep' || (Number.isInteger(p.cand) && p.cand >= 0 && p.cand < n))) p.cand = 'fund';
  if (!(p.mate === 'fund' || (Number.isInteger(p.mate) && p.mate >= 0 && p.mate < n))) p.mate = 'fund';
  // Over budget: drop polls, then offices, then ads, until it fits.
  while (planCost(p, country) > state.money[s]) {
    if (p.polls.length) p.polls.pop();
    else if (p.office.length) p.office.pop();
    else { const k = p.ads.findIndex(l => l > 0); if (k < 0) break; p.ads[k]--; }
  }
  return p;
}

// opts.debate: { answers: [tidewaterAnswers, highlandAnswers] } for a debate week; a side left out
// answers the way the computer would.
export function resolveWeek(state, country, rawPlans, opts = {}) {
  const w = state.week;
  const plans = rawPlans.map((p, s) => clampPlan(p, state, country, s));
  const news = [];
  const before = country.regions.map((g, k) => trueMargin(state.regions[k], state.mood));

  for (const s of [0, 1]) state.money[s] -= planCost(plans[s], country);

  // Ads.
  state.regions.forEach((rs, k) => {
    for (const s of [0, 1]) {
      rs.adStock[s] = rs.adStock[s] * 0.5 + plans[s].ads[k];
      rs.ads[s] = plans[s].ads[k];
    }
    const a0 = adPower(rs.adStock[0]), a1 = adPower(rs.adStock[1]);
    rs.pers[0] += adPush(rs.adStock[0], rs.und);
    rs.pers[1] += adPush(rs.adStock[1], rs.und);
    rs.und -= rs.und * 0.05 * (a0 + a1);
  });

  // The candidates on the road.
  const cr = rng(`${state.seed}:w${w}:crowds`);
  const trail = [];
  for (const s of [0, 1]) {
    for (const who of ['cand', 'mate']) {
      const k = plans[s][who];
      if (!Number.isInteger(k)) continue;
      const rs = state.regions[k];
      const fx = rallyPush(rs.und, who, state.mates[s]?.trait);
      rs.pers[s] += fx.pers; rs.buzz[s] += fx.buzz; rs.rally[s] += fx.pers + fx.buzz;
      rs.und = Math.max(1.5, rs.und - (who === 'cand' ? 0.5 : 0.25));
      for (const nb of country.regions[k].neighbors) {
        const ns = state.regions[nb];
        const nfx = rallyPush(ns.und, who, state.mates[s]?.trait);
        ns.pers[s] += nfx.nbPers; ns.buzz[s] += nfx.nbBuzz; ns.rally[s] += nfx.nbPers + nfx.nbBuzz;
      }
      const crowd = Math.round((1200 + country.regions[k].pop / 220) * (who === 'cand' ? 1 : 0.45) * cr.range(0.7, 1.4) / 100) * 100;
      trail.push({ side: s, who, region: k, crowd });
      state.rallies.push({ week: w, side: s, who, region: k });
    }
  }

  // Field offices open this week and start working right away.
  for (const s of [0, 1]) for (const k of plans[s].office) state.regions[k].office[s] = w;
  state.regions.forEach(rs => { for (const s of [0, 1]) if (rs.office[s]) rs.gotv[s] += OFFICE_GAIN; });

  // Undecided voters make up their own minds too, and the ground shifts under everyone.
  const dr = rng(`${state.seed}:w${w}:drift`);
  state.regions.forEach(rs => {
    rs.und = Math.max(1.5, rs.und * 0.93);
    rs.drift += dr.gauss() * 0.3;
  });
  state.mood += dr.gauss() * 0.45;

  // The calls both campaigns made on Monday play out.
  const calls = resolveDecisions(state, country, plans, w);

  // The debate, at the end of the week.
  let debate = null;
  if (DEBATE_WEEKS.includes(w)) {
    const setup = debateSetup(state, country, w);
    const answers = [0, 1].map(s => opts.debate?.answers?.[s] || autoAnswers(state, country, setup, s));
    const prepped = plans.map(p => p.cand === 'prep');
    const outcome = debateOutcome(state, country, setup, answers, prepped);
    if (outcome.winner !== null) {
      state.mood += sign(outcome.winner) * outcome.bump;
      state.regions.forEach(rs => { rs.und = Math.max(1.5, rs.und - 1); });
    }
    debate = { setup, answers, prepped, outcome };
    news.push(debateStory(state, setup, outcome, prepped));
  }

  // The news.
  const { stories, triggers } = weekEvents(state, country, plans, w, w === WEEKS);
  news.push(...stories);
  if (w === WEEKS) { const wx = finalWeather(state, country, w); if (wx) news.push(wx); }

  // Money for next week.
  const got = [0, 1].map(s => income(state, s, plans[s]));
  for (const s of [0, 1]) state.money[s] += got[s];

  // What needs an answer next Monday: the fallout from this week's news, or failing that an issue
  // everyone has to take a side on. Sometimes an old position comes back to be defended.
  const made = [];
  state.decided.push(...state.pending.filter(d => d.week === w));
  state.pending = state.pending.filter(d => d.week > w);
  if (w < WEEKS) {
    made.push(...crisisDecisions(state, country, triggers, w + 1));
    if (!made.length && rng(`${state.seed}:w${w}:issue-roll`)() < 0.85) made.push(...issueDecisions(state, country, w + 1));
    for (const s of [0, 1]) {
      if (made.some(d => d.side === s)) continue;
      const again = resurfaceDecision(state, country, s, w + 1);
      if (again) made.push(again);
    }
    made.forEach((d, i) => { d.id = `w${w + 1}-${i}-${d.kind}-${d.side}`; });
    state.pending.push(...made);
  }

  // The week is done; polls taken now see all of it.
  state.week = w + 1;

  // Polls: a national one and two public ones everyone sees, then each side's own.
  const pr = rng(`${state.seed}:w${w}:public`);
  nationalPoll(state, country, pr, w);
  const pub = publicPollRegions(state, country, pr, 2).map(k => publicPoll(state, country, pr, k, w));
  const own = [0, 1].map(s => [...new Set([...plans[s].polls, ...plans[s].free])].map(k => ownPoll(state, country, s, k, w)));

  const after = country.regions.map((g, k) => trueMargin(state.regions[k], state.mood));
  state.history.push({ week: w, plans, news, trail, income: got, bank: [...state.money], pub, own, nat: state.natPolls.at(-1).m, before, after, mood: state.mood, calls, debate, asks: made.map(d => d.id) });

  state.plans = [emptyPlan(country.regions.length), emptyPlan(country.regions.length)];
  if (state.week > WEEKS) state.phase = 'night';
  return state.history.at(-1);
}

// ---------------------------------------------------------------- election day

export function finalResult(state, country) {
  const r = rng(`${state.seed}:final`);
  const natErr = r.gauss() * 1.3;
  const rain = new Set(state.rain);
  const regions = country.regions.map((g, k) => {
    const rs = state.regions[k];
    let m = trueMargin(rs, state.mood);
    if (rain.has(k)) {
      // Rain keeps the casual voters home; a ground game still gets people out.
      m += -0.4 * (rs.buzz[0] - rs.buzz[1]) + 0.25 * (rs.gotv[0] - rs.gotv[1]);
    }
    m += natErr + r.gauss() * (0.8 + rs.und / 6);
    const turnout = Math.min(0.85, g.turnout + 0.004 * (rs.buzz[0] + rs.buzz[1] + rs.gotv[0] + rs.gotv[1]) - (rain.has(k) ? 0.03 : 0) + r.gauss() * 0.01);
    const total = Math.round(g.pop * turnout);
    const v0 = Math.round(total * (0.5 + m / 200));
    const votes = [v0, total - v0];
    return { votes, total, turnout, m: (votes[0] - votes[1]) / total * 100, winner: votes[0] > votes[1] ? 0 : 1 };
  });
  const electors = [0, 0], votes = [0, 0];
  regions.forEach((x, k) => { electors[x.winner] += country.regions[k].electors; votes[0] += x.votes[0]; votes[1] += x.votes[1]; });
  const winner = electors[0] >= country.majority ? 0 : 1;
  // The tipping point: line regions up from the winner's best, and see which one got them over the line.
  const order = regions.map((x, k) => k).sort((a, b) => sign(winner) * (regions[b].m - regions[a].m));
  let acc = 0, tipping = order[0];
  for (const k of order) { acc += country.regions[k].electors; if (acc >= country.majority) { tipping = k; break; } }
  return { regions, electors, votes, winner, tipping, natErr };
}

// ---------------------------------------------------------------- saving

export function snapshot(state) { return JSON.parse(JSON.stringify(state)); }

export { PARTIES };
