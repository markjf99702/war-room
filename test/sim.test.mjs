// The rules, checked in Node:  node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCountry } from '../js/country.js';
import {
  newCampaign, chooseMate, resolveWeek, finalResult, planCost, clampPlan, emptyPlan, estimate, WEEKS,
} from '../js/campaign.js';
import { planFor } from '../js/ai.js';
import { forecast } from '../js/forecast.js';
import { nightPlan, nightAt } from '../js/night.js';

const country = makeCountry();

function playOut(seed, strategy = (st, s) => planFor(st, country, s, 'normal'), opts = {}) {
  const st = newCampaign(country, { seed, side: 0, difficulty: 'normal', ...opts });
  chooseMate(st, country, st.side, 0);
  while (st.phase === 'plan') resolveWeek(st, country, [strategy(st, 0), strategy(st, 1)]);
  return { st, res: finalResult(st, country) };
}

test('the board is always the same Aldermere', () => {
  assert.equal(country.regions.length, 21);
  assert.equal(country.regions.reduce((a, g) => a + g.electors, 0), 121);
  assert.equal(country.majority, 61);
  assert.deepEqual(country.regions.slice(0, 4).map(g => g.name), ['Carrowmouth', 'Kingsferry', 'New Aldham', 'Gullhaven']);
  for (const g of country.regions) {
    assert.ok(g.electors >= 3, `${g.name} has at least three electors`);
    assert.ok(g.neighbors.length >= 1, `${g.name} borders somewhere`);
    for (const n of g.neighbors) assert.ok(country.regions[n].neighbors.includes(g.id), 'borders go both ways');
  }
});

test('a campaign replays exactly from its seed', () => {
  const a = playOut('replay-1');
  const b = playOut('replay-1');
  assert.deepEqual(a.res, b.res);
  assert.deepEqual(a.st.history.map(h => h.news.map(n => n.head)), b.st.history.map(h => h.news.map(n => n.head)));
});

test('the news doesn’t depend on what you spend, only on the seed and where the candidates go', () => {
  const quiet = (st, s) => { const p = emptyPlan(country.regions.length); p.cand = 'fund'; p.mate = 'fund'; return p; };
  const spender = (st, s) => { const p = emptyPlan(country.regions.length); p.ads[2] = 1; return p; };
  const a = playOut('news-1', quiet), b = playOut('news-1', spender);
  assert.deepEqual(a.st.natPolls.length, b.st.natPolls.length);
  assert.deepEqual(a.st.history.map(h => h.news.map(n => n.tag)), b.st.history.map(h => h.news.map(n => n.tag)));
});

test('the strategist never plans more than a side can pay for', () => {
  const st = newCampaign(country, { seed: 'budget-1' });
  chooseMate(st, country, 0, 1);
  while (st.phase === 'plan') {
    const plans = [0, 1].map(s => planFor(st, country, s, s ? 'hard' : 'advisor'));
    plans.forEach((p, s) => assert.ok(planCost(p, country) <= st.money[s], `week ${st.week}, side ${s}`));
    resolveWeek(st, country, plans);
    assert.ok(st.money.every(m => m >= 0));
  }
});

test('an overspent plan is trimmed to fit', () => {
  const st = newCampaign(country, { seed: 'clamp-1' });
  chooseMate(st, country, 0, 0);
  const p = emptyPlan(country.regions.length);
  p.ads = p.ads.map(() => 3);
  p.office = country.regions.map(g => g.id);
  p.polls = [0, 1, 2, 3];
  const c = clampPlan(p, st, country, 0);
  assert.ok(planCost(c, country) <= st.money[0]);
});

test('the result adds up', () => {
  const { res } = playOut('sum-1');
  assert.equal(res.electors[0] + res.electors[1], 121);
  assert.ok(res.electors[res.winner] >= 61);
  for (const x of res.regions) {
    assert.equal(x.votes[0] + x.votes[1], x.total);
    assert.equal(x.winner, x.votes[0] > x.votes[1] ? 0 : 1);
  }
  assert.equal(res.regions[res.tipping].winner, res.winner);
});

test('election night ends where the result says it does', () => {
  const { st, res } = playOut('night-1');
  const plan = nightPlan(st, country, res);
  const end = nightAt(plan, res, country, plan.end);
  assert.deepEqual(end.electors, res.electors);
  assert.equal(end.raceCalled, res.winner);
  assert.equal(end.counted[0], res.votes[0]);
  assert.equal(end.counted[1], res.votes[1]);
  // Nothing is called for the wrong side, and nothing is called before its polls close.
  for (const g of plan.regions) {
    assert.equal(g.side, res.regions[g.k].winner);
    assert.ok(g.callAt >= g.close);
  }
  const before = nightAt(plan, res, country, plan.raceAt - 1);
  assert.ok(before.electors.every(e => e < 61), 'the race is called the moment someone gets there');
});

test('the forecast is a probability and knows the electoral maths', () => {
  const st = newCampaign(country, { seed: 'fc-1' });
  chooseMate(st, country, 0, 0);
  const f = forecast(st, country, 0, emptyPlan(country.regions.length), 1000);
  assert.ok(f.p >= 0 && f.p <= 1);
  assert.equal(f.hist.reduce((a, b) => a + b, 0), 1000);
  assert.ok(Math.abs(f.tip.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('a poll pulls your estimate toward the truth', () => {
  const st = newCampaign(country, { seed: 'poll-1' });
  chooseMate(st, country, 0, 0);
  const k = 2;
  const before = estimate(st, 0, k).sd;
  const p = emptyPlan(country.regions.length);
  p.polls = [k];
  resolveWeek(st, country, [p, emptyPlan(country.regions.length)]);
  const after = estimate(st, 0, k);
  assert.ok(after.sd < before, 'more certain after a poll');
  assert.equal(after.src, 'own');
  assert.ok(st.intel[0].seen[k].ads, 'the poll showed their ads');
});

test('campaigning beats not campaigning', () => {
  const passive = () => emptyPlan(country.regions.length);
  let wins = 0;
  for (let i = 0; i < 16; i++) {
    const { res } = playOut(`effort-${i}`, (st, s) => (s === 0 ? planFor(st, country, 0, 'normal') : passive()));
    if (res.winner === 0) wins++;
  }
  assert.ok(wins >= 14, `a real campaign won ${wins} of 16 against one that did nothing`);
});

test('eight weeks, then election night', () => {
  const { st } = playOut('weeks-1');
  assert.equal(st.history.length, WEEKS);
  assert.equal(st.phase, 'night');
});
