// The new decisions: your calls on the news, positions on issues, and the debates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCountry } from '../js/country.js';
import { newCampaign, chooseMate, resolveWeek, emptyPlan, ownEffect, trueMargin, planCost, income, adUnit } from '../js/campaign.js';
import { planFor, decideAll, decide } from '../js/ai.js';
import { choose, openFor, promiseFor, crisisDecisions, issueDecisions, resurfaceDecision, resolveDecisions, ISSUES } from '../js/decisions.js';
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

test('firing someone costs $3M of the week’s fundraising, even with nothing left in the bank', () => {
  for (const spend of [false, true]) {
    const st = fresh('fire-1');
    const [d] = crisisDecisions(st, country, [{ kind: 'scandal', side: 0, thing: 'a donor’s yacht trip', role: 'campaign chair' }], st.week);
    st.pending.push(d);
    choose(st, d.id, 'fire');
    const p = blank();
    if (spend) for (let k = 0; planCost(p, country) < st.money[0]; k++) { p.ads[k] = 1; if (planCost(p, country) > st.money[0]) p.ads[k] = 0; }
    const before = st.money[0], cost = planCost(p, country);
    const h = resolveWeek(st, country, [p, blank()]);
    assert.equal(h.income[0], income(st, 0, p) - 3, 'raised $3M less');
    assert.equal(st.money[0], before - cost + income(st, 0, p) - 3, `spent ${cost} of ${before}`);
  }
});

test('changing the subject costs more than firing someone, and hurts less', () => {
  const st = fresh('subject-1');
  const [d] = crisisDecisions(st, country, [{ kind: 'scandal', side: 0, thing: 'a donor’s yacht trip', role: 'campaign chair' }], st.week);
  const fire = d.options.find(o => o.key === 'fire'), subject = d.options.find(o => o.key === 'subject');
  assert.ok(subject.cost > -fire.sure.money, 'it costs more');
  assert.ok(subject.sure.nat > fire.sure.nat, 'it’s worse than firing on both counts');
  assert.match(subject.says, new RegExp(`About ${String(subject.sure.nat).replace('-', '−')}, for \\$${subject.cost}M\\.`));
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

test('a campaign can only promise to be in one place a week', () => {
  const twoCalls = (seed, floodAt) => {
    const st = fresh(seed);
    st.incumbent = 0; // so both the plant closing and the flood ask side 0 to go there
    const ds = crisisDecisions(st, country, [{ kind: 'plant', region: 5, jobs: 1200, company: 'Harrow Steel' }, { kind: 'flood', region: floodAt }], st.week);
    st.pending.push(...ds);
    return { st, ds, mine: ds.filter(d => d.side === 0) };
  };
  const { st, mine: [plant, flood] } = twoCalls('promise-2', 9);
  assert.ok(flood.options.some(o => o.promise), 'the flood asks for a visit too');
  assert.ok(choose(st, plant.id, 'visit'));
  assert.equal(choose(st, flood.id, 'visit'), false, 'a second promise, somewhere else');
  const hint = decide(st, country, 0, flood, 'advisor');
  assert.notEqual(hint, 'visit', 'the strategist suggests a promise that can’t be kept');
  assert.ok(choose(st, flood.id, hint));
  // Two calls asking for the same place can both be promised: one visit keeps both.
  const same = twoCalls('promise-3', 5);
  assert.ok(choose(same.st, same.mine[0].id, 'visit'));
  assert.ok(choose(same.st, same.mine[1].id, 'visit'));

  // Left to the computer, both campaigns make at most one promise, and keep it.
  for (let i = 0; i < 12; i++) {
    const { st: s2 } = twoCalls(`promise-ai-${i}`, 9);
    for (const s of [0, 1]) decideAll(s2, country, s);
    for (const s of [0, 1]) {
      const at = s2.pending.filter(d => d.side === s && d.chosen && d.options.find(o => o.key === d.chosen).promise);
      assert.ok(at.length <= 1, `side ${s} promised to be in two places in promise-ai-${i}`);
    }
    const h = resolveWeek(s2, country, [planFor(s2, country, 0), planFor(s2, country, 1)]);
    assert.deepEqual(h.calls.filter(c => c.result === 'broken'), [], `a broken promise in promise-ai-${i}`);
  }
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

// Counted by electors, so which side pays depends on where this campaign is close.
test('backing the rail link and opposing it both gain ground across the map', () => {
  const st = fresh('two-sided-rail');
  st.issuesSeen = ISSUES.filter(i => i.key !== 'rail').map(i => i.key);
  const [d] = issueDecisions(st, country, 1);
  for (const o of d.options.filter(x => ['back', 'oppose'].includes(x.key))) {
    const across = o.stance.regions.reduce((sum, [k, pts]) => sum + pts * country.regions[k].electors, 0);
    assert.ok(across > 0, `“${o.label}” loses ground across the map: ${across.toFixed(1)} elector-points`);
  }
});

test('changing your mind undoes the old position, even one taken as a gamble', () => {
  for (const [issue, first] of [['vesland', 'firm'], ['housing', 'cap'], ['farms', 'extend']]) {
    for (const seed of ['flip-1', 'flip-2', 'flip-3', 'flip-4']) {
      const st = fresh(seed);
      const points = () => st.regions.map(r => r.evt + r.issue[0] - r.issue[1]); // side 0's, in each region
      st.issuesSeen = ISSUES.filter(i => i.key !== issue).map(i => i.key);
      const [d] = issueDecisions(st, country, 1);
      st.pending = [d];
      choose(st, d.id, first);
      const before = points();
      const [took] = resolveDecisions(st, country, [blank(), blank()], 1);
      // The issue comes back in week 3 and side 0 changes its mind.
      let again = null;
      for (let t = 0; !again; t++) again = resurfaceDecision({ ...st, seed: `${seed}-${t}` }, country, 0, 3);
      st.pending = [again];
      assert.ok(choose(st, again.id, 'switch'));
      const now = again.options.find(o => o.key === 'switch').flip.regions;
      resolveDecisions(st, country, [blank(), blank()], 3);
      const want = before.map((p, k) => p + now.filter(([j]) => j === k).reduce((a, [, x]) => a + x, 0));
      points().forEach((p, k) => assert.ok(Math.abs(p - want[k]) < 1e-9,
        `${issue}: ${first} (${took.result || 'sure'}) left ${(p - want[k]).toFixed(2)} in ${country.regions[k].name} after switching`));
    }
  }
});

// Counted by electors, so which side pays depends on where this campaign is close.
test('standing with the fishing towns and backing the scientists both gain ground across the map', () => {
  const st = fresh('two-sided-fishing');
  st.issuesSeen = ISSUES.filter(i => i.key !== 'fishing').map(i => i.key);
  const [d] = issueDecisions(st, country, 1);
  for (const o of d.options.filter(x => ['towns', 'science'].includes(x.key))) {
    const across = o.stance.regions.reduce((sum, [k, pts]) => sum + pts * country.regions[k].electors, 0);
    assert.ok(across > 0, `“${o.label}” loses ground across the map: ${across.toFixed(1)} elector-points`);
  }
});

test('every position says where it loses ground, not just where it gains', () => {
  for (const i of ISSUES) for (const o of i.options) {
    if (o.fx?.some(([, pts]) => pts < 0)) assert.match(o.says, /down|barely/i, `${i.title}: “${o.label}” doesn’t say where it costs`);
  }
});

// Counted by electors, so which side pays depends on where this campaign is close.
test('backing the wind farms and blocking them both gain ground across the map', () => {
  const st = fresh('two-sided-wind');
  st.issuesSeen = ISSUES.filter(i => i.key !== 'wind').map(i => i.key);
  const [d] = issueDecisions(st, country, 1);
  for (const o of d.options.filter(x => ['back', 'block'].includes(x.key))) {
    const across = o.stance.regions.reduce((sum, [k, pts]) => sum + pts * country.regions[k].electors, 0);
    assert.ok(across > 0, `“${o.label}” loses ground across the map: ${across.toFixed(1)} elector-points`);
  }
});

test('ads cost more where more people live, as How to play says', () => {
  const byPop = [...country.regions].sort((a, b) => a.pop - b.pop);
  for (let i = 1; i < byPop.length; i++) assert.ok(adUnit(byPop[i]) >= adUnit(byPop[i - 1]), `${byPop[i].name} is cheaper than ${byPop[i - 1].name}`);
});

// Counted by electors, so which side pays depends on where this campaign is close.
test('raising the minimum wage and holding it both gain ground across the map', () => {
  const st = fresh('two-sided-wage');
  st.issuesSeen = ISSUES.filter(i => i.key !== 'wage').map(i => i.key);
  const [d] = issueDecisions(st, country, 1);
  for (const o of d.options.filter(x => ['raise', 'hold'].includes(x.key))) {
    const across = o.stance.regions.reduce((sum, [k, pts]) => sum + pts * country.regions[k].electors, 0);
    assert.ok(across > 0, `“${o.label}” loses ground across the map: ${across.toFixed(1)} elector-points`);
  }
});

test('every issue offers a real choice', () => {
  for (const i of ISSUES) {
    assert.equal(i.options.length, 3, i.title);
    const keys = new Set(i.options.map(o => o.key));
    assert.equal(keys.size, 3);
  }
});

// Counted by electors, so which side pays depends on where this campaign is close.
test('cutting fuel duty and keeping it both gain ground across the map', () => {
  const st = fresh('two-sided-fuel');
  st.issuesSeen = ISSUES.filter(i => i.key !== 'fuel').map(i => i.key);
  const [d] = issueDecisions(st, country, 1);
  for (const o of d.options.filter(x => ['cut', 'keep'].includes(x.key))) {
    const across = o.stance.regions.reduce((sum, [k, pts]) => sum + pts * country.regions[k].electors, 0);
    assert.ok(across > 0, `“${o.label}” loses ground across the map: ${across.toFixed(1)} elector-points`);
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

test('no kind of crisis repeats more than its share in a campaign', () => {
  const caps = { plant: 1, strike: 1, factory: 1, flood: 1, scandal: 2, union: 1, local: 2, jobs: 3, gaffe: 2 };
  for (let i = 0; i < 40; i++) {
    const st = fresh(`caps-${i}`);
    while (st.phase === 'plan') {
      resolveWeek(st, country, [blank(), blank()]);
      for (const s of [0, 1]) decideAll(st, country, s);
    }
    const counts = {};
    for (const e of st.history) for (const n of e.news) if (n.kind) counts[n.kind] = (counts[n.kind] || 0) + 1;
    for (const [kind, cap] of Object.entries(caps)) assert.ok((counts[kind] || 0) <= cap, `${kind} came up ${counts[kind]} times in campaign ${i}`);
    // At most one economic crisis in any one week.
    for (const e of st.history) assert.ok(e.news.filter(n => ['plant', 'strike', 'factory'].includes(n.kind)).length <= 1);
  }
});

test('saying a new factory is the company’s choice is worth more in all than backing one region', () => {
  const st = fresh('factory-1');
  const [d] = crisisDecisions(st, country, [{ kind: 'factory', region: 2, other: 4, company: 'Brightline Motors', jobs: 3000 }], st.week);
  const total = key => d.options.find(o => o.key === key).sure.regions.reduce((a, [, p]) => a + p, 0);
  // So it's the right answer when both regions matter about as much, and backing one is when one matters more.
  assert.ok(total('none') > total('a') && total('none') > total('b'));
  assert.ok(Math.max(...d.options.find(o => o.key === 'none').sure.regions.map(([, p]) => p)) < 1.4);
});

test('a strike and a factory bid each ask both campaigns for a decision', () => {
  const st = fresh('econ-1');
  const ds = crisisDecisions(st, country, [{ kind: 'strike', region: 3 }, { kind: 'factory', region: 2, other: 4, company: 'Brightline Motors', jobs: 3000 }], st.week);
  assert.deepEqual(ds.map(d => `${d.kind}:${d.side}`), ['strike:0', 'strike:1', 'factory:0', 'factory:1']);
  for (const d of ds) assert.equal(d.options.length, 3);
});
