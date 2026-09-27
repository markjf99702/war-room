// The new decisions: your calls on the news, positions on issues, and the debates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCountry } from '../js/country.js';
import { newCampaign, chooseMate, resolveWeek, emptyPlan, ownEffect, trueMargin } from '../js/campaign.js';
import { planFor, decideAll, decide } from '../js/ai.js';
import { choose, openFor, promiseFor, crisisDecisions, issueDecisions, ISSUES } from '../js/decisions.js';
import { debateSetup, autoAnswers, exchange, debateOutcome, STYLE_KEYS } from '../js/debate.js';

const country = makeCountry();
const blank = () => emptyPlan(country.regions.length);

function fresh(seed) {
  const st = newCampaign(country, { seed });
  chooseMate(st, country, 0, 0);
  return st;
}

test('the news asks for decisions most weeks', () => {
  let asked = 0;
  for (let i = 0; i < 6; i++) {
    const st = fresh(`asks-${i}`);
    while (st.phase === 'plan') {
      const h = resolveWeek(st, country, [blank(), blank()]);
      asked += h.asks.length;
      for (const d of st.pending) {
        assert.ok(d.options.length >= 2, `${d.title} has options`);
        for (const o of d.options) assert.ok(o.says, `${d.title}: ${o.label} says what it does`);
      }
    }
    assert.equal(st.pending.length, 0, 'nothing is left hanging after the last week');
  }
  assert.ok(asked >= 6 * 5, `${asked} decisions over six campaigns`);
});

test('a call costs its price, and one you can’t afford is refused', () => {
  const st = fresh('cost-1');
  const [d] = crisisDecisions(st, country, [{ kind: 'scandal', side: 0, thing: 'a donor’s yacht trip', role: 'campaign chair' }], st.week);
  st.pending.push(d);
  st.money[0] = 3;
  assert.equal(choose(st, d.id, 'subject'), false, '$4M option with $3M in the bank');
  assert.equal(choose(st, d.id, 'fire'), true);
  assert.equal(choose(st, d.id, 'stand'), false, 'only one answer');
});

test('unanswered calls fall back to their default, and gambles replay the same way', () => {
  const run = pick => {
    const st = fresh('gamble-1');
    const ds = crisisDecisions(st, country, [{ kind: 'scandal', side: 0, thing: 'lobbying', role: 'finance director' }], st.week);
    st.pending.push(...ds);
    if (pick) choose(st, ds[0].id, pick);
    const before = st.mood;
    const h = resolveWeek(st, country, [blank(), blank()]);
    return { call: h.calls.find(c => c.side === 0), moodFromCall: st.mood - before };
  };
  const a = run(null);
  assert.equal(a.call.choice.startsWith('Stand by'), true, 'saying nothing means standing by them');
  assert.deepEqual(run('stand').call, run('stand').call);
});

test('a promise to visit pays if kept and hurts if broken', () => {
  const trial = keep => {
    const st = fresh('promise-1');
    const ds = crisisDecisions(st, country, [{ kind: 'plant', region: 5, jobs: 1200, company: 'Harrow Steel' }], st.week);
    st.pending.push(...ds);
    const mine = ds.find(d => d.side === 0);
    choose(st, mine.id, 'visit');
    assert.equal(promiseFor(st, 0), 5);
    const p = blank();
    if (keep) p.cand = 5;
    const evt = st.regions[5].evt;
    resolveWeek(st, country, [p, blank()]);
    return st.regions[5].evt - evt;
  };
  assert.ok(trial(true) > trial(false) + 1.5);
});

test('a position on an issue moves the regions it names, and counts as your own work', () => {
  const st = fresh('issue-1');
  const ds = issueDecisions(st, country, st.week);
  st.pending.push(...ds);
  const d = ds.find(x => x.side === 0);
  const opt = d.options.find(o => o.stance?.regions?.length);
  choose(st, d.id, opt.key);
  const k = opt.stance.regions[0][0];
  const own = ownEffect(st.regions[k], 0);
  resolveWeek(st, country, [blank(), blank()]);
  assert.ok(Math.abs(ownEffect(st.regions[k], 0) - own - opt.stance.regions[0][1]) < 1e-9);
  assert.ok(st.stances[0][d.issue], 'it’s on the record');
});

test('every issue offers a real choice', () => {
  for (const i of ISSUES) {
    assert.equal(i.options.length, 3, i.title);
    const keys = new Set(i.options.map(o => o.key));
    assert.equal(keys.size, 3);
  }
});

test('the strategist only picks calls a campaign can pay for', () => {
  const st = fresh('ai-calls');
  while (st.phase === 'plan') {
    resolveWeek(st, country, [planFor(st, country, 0), planFor(st, country, 1)]);
    for (const s of [0, 1]) {
      for (const d of openFor(st, s)) {
        const key = decide(st, country, s, d, 'normal');
        assert.ok((d.options.find(o => o.key === key).cost || 0) <= st.money[s]);
      }
      decideAll(st, country, s);
      assert.equal(openFor(st, s).length, 0);
      assert.ok(st.money[s] >= 0);
    }
  }
});

test('in a debate, each style beats one other: attack, facts, plan, story, and round again', () => {
  const beats = { attack: 'facts', facts: 'plan', plan: 'story', story: 'attack' };
  for (const [a, b] of Object.entries(beats)) {
    let sum = 0;
    for (let i = 0; i < 60; i++) {
      const st = fresh(`loop-${i}`);
      const setup = debateSetup(st, country, 3);
      const ex = exchange(st, country, setup, 0, [[a, a, a, a], [b, b, b, b]], [false, false]);
      sum += ex.score;
    }
    assert.ok(sum / 60 > 1, `${a} beats ${b} (average ${(sum / 60).toFixed(2)})`);
  }
});

test('your debate answers decide the debate', () => {
  const st = fresh('debate-1');
  const setup = debateSetup(st, country, 3);
  const theirs = autoAnswers(st, country, setup, 1);
  const beatBy = { facts: 'attack', plan: 'facts', story: 'plan', attack: 'story' };
  const best = debateOutcome(st, country, setup, [theirs.map(x => beatBy[x]), theirs], [false, false]);
  const worst = debateOutcome(st, country, setup, [theirs.map(x => STYLE_KEYS.find(k => beatBy[k] === x)), theirs], [false, false]);
  assert.equal(best.winner, 0);
  assert.equal(worst.winner, 1);
  // And the week uses them.
  const moodBefore = st.mood;
  const p = blank();
  st.week = 3;
  const h = resolveWeek(st, country, [p, blank()], { debate: { answers: [theirs.map(x => beatBy[x]), null] } });
  assert.equal(h.debate.outcome.winner, 0);
  assert.ok(h.news.some(n => n.tag === 'Debate' && n.side === 0));
  void moodBefore; void trueMargin;
});
