// The morning after: who won and how, and every piece turned face up, including the rival's.

import { h, margin, money, num, chance, plural, PARTY } from './dom.js';
import { makeMap, glyph } from './map.js';
import { adUnit, officeCost, estimate, sign, DIFFICULTY } from '../campaign.js';

const SITE = 'https://junkdrawer.works/war-room/';

export function renderResult(root, ctx) {
  const { country, state: st } = ctx;
  const res = st.result;
  const me = st.side, them = 1 - me;
  const won = res.winner === me;
  const R = k => country.regions[k];
  const last = side => st.cands[side].last;
  const K = country.regions.length;

  // Who spent what, where, and when.
  const book = [0, 1].map(s => {
    const spend = Array(K).fill(0), rallies = Array(K).fill(0), office = Array(K).fill(0), polls = Array(K).fill(0);
    let total = 0;
    for (const e of st.history) {
      const p = e.plans[s];
      p.ads.forEach((l, k) => { const c = l * adUnit(R(k)); spend[k] += c; total += c; });
      for (const k of p.office) { const c = officeCost(R(k)); spend[k] += c; total += c; office[k] = e.week; }
      for (const k of [...p.polls, ...(p.free || [])]) { polls[k]++; if (p.polls.includes(k)) total += 1; }
      for (const who of ['cand', 'mate']) if (Number.isInteger(p[who])) rallies[p[who]] += 1;
    }
    return { spend, rallies, office, polls, total };
  });
  const finalFc = st.forecasts[me].at(-1)?.p;
  const miss = country.regions.map((g, k) => (res.regions[k].m - estimate(st, me, k).m) * sign(me));

  // ---------------------------------------------------------------- map layers
  const map = makeMap(country, {});
  const note = h('p', { class: 'layer-note' });
  const layers = {
    result() {
      country.regions.forEach((g, k) => {
        const m = res.regions[k].m, a = Math.abs(m);
        const key = `${m > 0 ? 't' : 'h'}${a >= 10 ? 3 : a >= 4 ? 2 : 1}`;
        map.fill(k, `var(--r-${key})`);
        map.tokens(k, []);
        map.badgeText(k, String(g.electors));
      });
      map.clearMarks();
      map.mark(res.tipping, 'tip');
      note.textContent = `Darker means a bigger win. Dashed red: ${R(res.tipping).name}, the tipping point.`;
    },
    theirs() { playbook(them); },
    yours() { playbook(me); },
    model() {
      map.clearMarks();
      country.regions.forEach((g, k) => {
        const d = miss[k], a = Math.abs(d);
        const key = a < 1.5 ? 'tu' : `${(d > 0) === (me === 0) ? 't' : 'h'}${a >= 5 ? 3 : a >= 3 ? 2 : 1}`;
        map.fill(k, `var(--r-${key})`);
        map.tokens(k, []);
        map.badgeText(k, `${d > 0 ? '+' : '−'}${a.toFixed(0)}`);
      });
      note.textContent = `How far off your model was on the last day, in points. ${me === 0 ? 'Teal' : 'Gold'}: it went better for you than you thought. ${me === 0 ? 'Gold' : 'Teal'}: worse.`;
    },
  };
  function playbook(s) {
    map.clearMarks();
    const max = Math.max(...book[s].spend, 1);
    const colour = s === 0 ? 'var(--tide)' : 'var(--high)';
    country.regions.forEach((g, k) => {
      const f = book[s].spend[k] / max;
      map.fill(k, f ? `color-mix(in srgb, ${colour} ${Math.round(18 + 72 * f)}%, var(--r-tu))` : 'var(--r-tu)');
      map.badgeText(k, book[s].spend[k] ? `$${book[s].spend[k]}` : String(g.electors));
      const t = [];
      for (let i = 0; i < Math.min(3, book[s].rallies[k]); i++) t.push(glyph.pawn(s, st.cands[s].last[0], false));
      if (book[s].office[k]) t.push(glyph.office(s));
      map.tokens(k, t);
    });
    const top = country.regions.map((g, k) => [k, book[s].spend[k]]).sort((a, b) => b[1] - a[1]).filter(x => x[1] > 0).slice(0, 3);
    note.textContent = `${last(s)} spent ${money(book[s].total)} on ads, offices and polls. Most went to ${top.map(([k, c]) => `${R(k).name} (${money(c)})`).join(', ') || 'nowhere in particular'}. Pawns are rallies; flags are field offices.`;
  }
  const tabs = [['result', 'Result'], ['theirs', `${last(them)}’s playbook`], ['yours', 'Yours'], ['model', 'Your model vs the result']];
  const tabBtns = tabs.map(([key, label]) => h('button', { type: 'button', 'aria-pressed': String(key === 'result'), onclick: () => { tabBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.key === key))); layers[key](); }, dataset: { key } }, label));

  // ---------------------------------------------------------------- the story
  const tip = res.tipping, tipX = res.regions[tip];
  const votesT = res.votes[0], votesH = res.votes[1], tot = votesT + votesH;
  const closest = res.regions.map((x, k) => [k, Math.abs(x.m)]).sort((a, b) => a[1] - b[1])[0][0];
  const unseen = country.regions.map((g, k) => ({ k, spend: book[them].spend[k], polls: book[me].polls[k] })).filter(x => x.spend > 0).sort((a, b) => (b.spend / (1 + b.polls)) - (a.spend / (1 + a.polls)))[0];
  // The biggest miss that mattered: among regions that were anywhere near close.
  const near = country.regions.map((g, k) => k).filter(k => Math.min(Math.abs(res.regions[k].m), Math.abs(estimate(st, me, k).m)) < 8);
  const bigMiss = (near.length ? near : country.regions.map((g, k) => k)).sort((a, b) => Math.abs(miss[b]) - Math.abs(miss[a]))[0];
  const mineTop = country.regions.map((g, k) => [k, book[me].spend[k]]).sort((a, b) => b[1] - a[1]).filter(x => x[1] > 0).slice(0, 3);

  // Your calls and the debates, and how each went.
  const allCalls = st.history.flatMap(e => (e.calls || []).map(c => ({ ...c, week: e.week })));
  const outcomeWord = c => ({ won: 'it worked', lost: 'it backfired', kept: 'you went', broken: 'you didn’t go' })[c.result] || '';
  const callItems = [
    ...st.history.filter(e => e.debate).map(e => {
      const o = e.debate.outcome;
      const how = o.winner === null ? 'a draw' : o.winner === me ? `you won, ${o.snap[me]}% to ${o.snap[them]}%` : `${last(them)} won, ${o.snap[them]}% to ${o.snap[me]}%`;
      return h('li', {}, h('b', {}, `The ${e.debate.setup.nth} debate: `), `${how}.`);
    }),
    ...allCalls.filter(c => c.side === me).map(c => h('li', {}, h('b', {}, `${c.title}: `), `${c.choice.toLowerCase()}`, outcomeWord(c) ? ` (${outcomeWord(c)})` : '', '.')),
  ];
  const theirBig = allCalls.filter(c => c.side === them && c.kind !== 'issue' && c.result).map(c => `${c.choice.toLowerCase()} (${outcomeWord(c)})`);

  const cards = [
    ['The tipping point', `${R(tip).name} (${plural(R(tip).electors, 'elector')}) put ${st.cands[res.winner].name} over the line. ${last(tipX.winner)} carried it by ${Math.abs(tipX.m).toFixed(1)} points, ${num(Math.abs(tipX.votes[0] - tipX.votes[1]))} votes.`],
    ['Your forecast', finalFc === undefined ? '' : `On the last Monday, your campaign’s model gave you ${chance(finalFc)}. ${won ? (finalFc < 0.5 ? 'You beat it.' : 'It was right.') : (finalFc > 0.5 ? 'It was too hopeful.' : 'It saw this coming.')}`],
    ['What you couldn’t see', unseen ? `${last(them)} put ${money(unseen.spend)} into ${R(unseen.k).name}${book[them].office[unseen.k] ? `, with a field office from week ${book[them].office[unseen.k]}` : ''}. You polled it ${unseen.polls ? plural(unseen.polls, 'time') : 'never'}. It went ${margin(res.regions[unseen.k].m)}.` : `${last(them)} barely spent a thing.`],
    ['Where your model was furthest off', `${R(bigMiss).name}: it had ${margin(estimate(st, me, bigMiss).m)}; it went ${margin(res.regions[bigMiss].m)}.`],
    ['Where your money went', mineTop.length ? `${mineTop.map(([k, c]) => `${R(k).name} ${money(c)} (${res.regions[k].winner === me ? 'won' : 'lost'})`).join(', ')}. ${money(book[me].total)} in all.` : 'You didn’t spend anything. Brave.'],
    ['Closest of the night', `${R(closest).name}: ${last(res.regions[closest].winner)} by ${num(Math.abs(res.regions[closest].votes[0] - res.regions[closest].votes[1]))} votes out of ${num(res.regions[closest].total)}.`],
  ].filter(c => c[1]);

  const shareUrl = `${SITE}?c=${encodeURIComponent(st.seed)}&p=${me}&d=${st.difficulty}&s=${res.electors[me]}`;
  const shareBtn = h('button', {
    type: 'button', class: 'btn ghost', onclick: async () => {
      const text = `I ${won ? 'won' : 'lost'} Aldermere with ${res.electors[me]} electors in War Room. Same campaign, your turn:`;
      try {
        if (navigator.share) { await navigator.share({ title: 'War Room', text, url: shareUrl }); return; }
        await navigator.clipboard.writeText(`${text} ${shareUrl}`);
        ctx.toast('Link copied. Send it to someone.');
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        ctx.toast(`Copy this link: ${shareUrl}`, 9000);
      }
    },
  }, 'Challenge someone');

  root.append(h('main', { class: 'result' }, h('div', { class: 'result-inner' },
    h('h1', { class: `verdict${won ? ' won' : ''}` }, won ? 'You win.' : 'You lost.'),
    h('p', { class: 'score' },
      h('b', { class: 't' }, `${st.cands[0].name} ${res.electors[0]}`), ' – ', h('b', { class: 'hh' }, `${res.electors[1]} ${st.cands[1].name}`),
      h('br'),
      h('span', { class: 'muted' }, `Popular vote: Tidewater ${(100 * votesT / tot).toFixed(1)}%, Highland ${(100 * votesH / tot).toFixed(1)}%. ${
        (votesT > votesH ? 0 : 1) !== res.winner ? `${PARTY[res.winner]} won without the popular vote.` : ''}`)),
    h('div', { class: 'layer-tabs' }, tabBtns),
    h('div', { class: 'board' }, map.svg),
    note,
    h('div', { class: 'res-grid', style: 'margin-top:8px' }, ...cards.map(([t, p]) => h('div', { class: 'story-card' }, h('h3', {}, t), h('p', {}, p))),
      callItems.length ? h('div', { class: 'story-card calls-card' }, h('h3', {}, 'Your calls'), h('ul', {}, callItems),
        theirBig.length ? h('p', { class: 'muted' }, `${last(them)}’s gambles: ${theirBig.join('; ')}.`) : null) : null),
    h('div', { class: 'result-actions' },
      h('button', { type: 'button', class: 'btn stamp', onclick: () => ctx.start({ side: me, difficulty: st.difficulty }) }, 'Run again'),
      h('button', { type: 'button', class: 'btn', onclick: () => ctx.start({ side: them, difficulty: st.difficulty }) }, `Run as ${PARTY[them]}`),
      shareBtn,
      h('button', { type: 'button', class: 'btn ghost', onclick: () => ctx.go('title') }, 'Title screen')),
    h('p', { class: 'share-note' }, `${DIFFICULTY[st.difficulty].label}. “Challenge someone” sends a link to this same campaign: same country, same rival, same news.`),
  )));
  layers.result();
}
