// Election night, as it comes in: polls closing, batches of votes, the decision desk, the needle.

import { h, $, num, chance, PARTY, margin, plural } from './dom.js';
import { makeMap } from './map.js';
import { needleGauge } from './charts.js';
import { nightPlan, nightAt, needle, clock, START, WAVES } from '../night.js';

const SPEEDS = [[6, '1×'], [18, '3×'], [60, '10×']];
const WAVE_NAMES = ['east', 'middle of the country', 'west'];

export function renderNight(root, ctx) {
  const { country, state: st } = ctx;
  const res = st.result;
  const plan = nightPlan(st, country, res);
  const me = st.side;
  const name = side => st.cands[side].last;
  const R = k => country.regions[k];
  let t = START, speed = SPEEDS[0][0], playing = true, last = null, lastNeedle = -1, popK = null, finished = false;

  // Everything worth announcing, in order.
  const events = [];
  WAVES.forEach((wt, i) => {
    const ks = plan.regions.filter(g => g.close === wt).map(g => g.k);
    if (!ks.length) return;
    events.push({ t: wt, kind: 'close', text: `Polls close in the ${WAVE_NAMES[i]}: ${ks.map(k => R(k).name).join(', ')}.` });
    const early = ks.filter(k => plan.regions[k].callAt > wt);
    if (early.length) events.push({ t: wt + 0.1, kind: 'wait', text: `Too early to call: ${early.map(k => R(k).name).join(', ')}.` });
  });
  for (const g of plan.regions) {
    const x = res.regions[g.k];
    const who = `${name(g.side)} (${PARTY[g.side]})`;
    const text = g.how === 'close' ? `${R(g.k).name} goes to ${who}, called as polls close.`
      : g.how === 'recount' ? `${R(g.k).name}: ${name(g.side)} ahead by ${num(Math.abs(x.votes[0] - x.votes[1]))} votes with everything counted. There will be a recount, but it won’t change this.`
        : g.how === 'late' ? `${R(g.k).name} finally goes to ${who}, with all the votes in.`
          : `${R(g.k).name} called for ${who}.`;
    events.push({ t: g.callAt + 0.2, kind: 'call', k: g.k, side: g.side, text, electors: R(g.k).electors });
    // Lead changes while the count is still going.
    let prev = null;
    for (const rep of g.reports) {
      if (rep.t >= g.callAt) break;
      const lead = rep.shown > 0 ? 0 : 1;
      if (prev !== null && lead !== prev && rep.p > 0.15) events.push({ t: rep.t, kind: 'flip', k: g.k, side: lead, text: `Lead change in ${R(g.k).name}: ${name(lead)} now ahead with ${Math.round(rep.p * 100)}% counted.` });
      prev = lead;
    }
  }
  events.push({ t: plan.raceAt + 0.5, kind: 'race', side: res.winner, text: `Aldermere projects: ${st.cands[res.winner].name} wins the presidency.` });
  events.sort((a, b) => a.t - b.t);

  // ---------------------------------------------------------------- layout
  const map = makeMap(country, { onPick: k => { popK = k; draw(true); } });
  const clockEl = h('div', { class: 'nt-clock num' }, clock(t));
  const playBtn = h('button', { type: 'button', 'aria-label': 'Pause', onclick: () => { playing = !playing; playBtn.textContent = playing ? '❚❚' : '▶'; playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play'); if (playing) loop(); } }, '❚❚');
  const speedBtns = SPEEDS.map(([v, label], i) => h('button', {
    type: 'button', 'aria-pressed': String(v === speed),
    onclick: () => { speed = v; speedBtns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j))); },
  }, label));
  const skipBtn = h('button', { type: 'button', onclick: () => { t = plan.end; draw(true); } }, 'Skip');
  const evCount = [h('div', { class: 'count num' }, '0'), h('div', { class: 'count num' }, '0')];
  const evFills = { t: h('div', { class: 'fill', style: { left: 0, background: 'var(--tide)' } }), tl: h('div', { class: 'fill lean', style: { background: 'var(--tide)' } }),
    h: h('div', { class: 'fill', style: { right: 0, background: 'var(--high)' } }), hl: h('div', { class: 'fill lean', style: { background: 'var(--high)' } }) };
  const gauge = needleGauge();
  const topChance = h('b', { class: 'num', style: 'color:var(--ink)' }, '');
  const needleNote = h('p', { class: 'pop-line', style: 'justify-content:center;margin:0' }, '');
  const feed = h('ol', { class: 'feed', 'aria-live': 'polite' });
  const popLine = h('div', { class: 'pop-line num' });
  const banner = h('div', {});
  const popEl = h('div', { class: 'region-pop', hidden: true });
  const doneBtn = h('button', { type: 'button', class: 'btn big', style: 'width:100%;margin-top:12px;background:var(--ink);color:#0c111a', hidden: true, onclick: () => { stop(); ctx.finishNight(); } }, 'See how it was won →');

  const side = s => h('div', { class: `side${s === 1 ? ' right' : ''}` },
    h('div', { class: 'cand', style: { color: s === 0 ? 'var(--tide)' : 'var(--high)' } }, `${st.cands[s].name}${s === me ? ' (you)' : ''}`),
    evCount[s]);

  root.append(h('main', { class: 'night' }, h('div', { class: 'night-inner' },
    h('div', { class: 'nt-top' },
      h('span', { class: 'nt-title' }, 'Election night'), h('span', { class: 'nt-live' }, 'LIVE'),
      clockEl),
    h('div', { class: 'nt-top', style: 'margin-top:6px' },
      h('div', { class: 'speed' }, playBtn, ...speedBtns, skipBtn)),
    h('div', { class: 'ev-bar' },
      h('div', { class: 'ev-names' }, side(0), h('div', { class: 'need' }, `${country.majority} to win`, h('br'), topChance), side(1)),
      h('div', { class: 'ev-track' }, evFills.t, evFills.tl, evFills.hl, evFills.h, h('div', { class: 'maj', style: { left: `${100 * country.majority / country.totalElectors}%` } }))),
    banner,
    h('div', { class: 'nt-grid' },
      h('div', {},
        h('div', { class: 'nt-map' }, map.svg, popEl),
        h('p', { class: 'pop-line', style: 'margin:6px 2px 0;display:block' }, 'Solid: called. Striped: counting, shaded for whoever is ahead. Grey: polls still open. Tap a region for its count.')),
      h('div', { style: 'display:grid;gap:12px;align-content:start' },
        h('div', { class: 'needle-card' }, h('h3', {}, 'Chance of winning, from the votes counted so far'), gauge.svg, needleNote),
        h('div', { class: 'needle-card' }, h('h3', {}, 'The decision desk'), feed, popLine),
        doneBtn)))));

  // ---------------------------------------------------------------- drawing
  let shown = 0;
  function draw(force) {
    const view = nightAt(plan, res, country, t);
    clockEl.textContent = clock(t);
    const leanE = [0, 0];
    view.regions.forEach(v => {
      const k = v.k;
      if (v.status === 'called') { map.fill(k, v.side === 0 ? 'var(--r-t3)' : 'var(--r-h3)'); map.hatch(k, null); }
      else if (v.status === 'counting' && v.rep) {
        const lead = v.m > 0 ? 0 : 1;
        leanE[lead] += R(k).electors;
        map.fill(k, lead === 0 ? 'var(--r-t1)' : 'var(--r-h1)'); map.hatch(k, lead === 0 ? 't' : 'h');
      } else if (v.status === 'counting') { map.fill(k, 'var(--r-tu)'); map.hatch(k, 'n'); }
      else { map.fill(k, 'var(--r-tu)'); map.hatch(k, null); }
    });
    const T = country.totalElectors;
    evCount[0].textContent = view.electors[0];
    evCount[1].textContent = view.electors[1];
    evFills.t.style.width = `${100 * view.electors[0] / T}%`;
    evFills.tl.style.left = `${100 * view.electors[0] / T}%`; evFills.tl.style.width = `${100 * leanE[0] / T}%`;
    evFills.h.style.width = `${100 * view.electors[1] / T}%`;
    evFills.hl.style.right = `${100 * view.electors[1] / T}%`; evFills.hl.style.width = `${100 * leanE[1] / T}%`;

    const total = view.counted[0] + view.counted[1];
    popLine.replaceChildren(
      h('span', {}, `${(total / 1e6).toFixed(2)}M votes counted`),
      total ? h('span', {}, h('span', { class: 't' }, `T ${(100 * view.counted[0] / total).toFixed(1)}%`), ' · ', h('span', { class: 'hh' }, `H ${(100 * view.counted[1] / total).toFixed(1)}%`)) : h('span', {}, ''));

    // New lines for the feed.
    while (shown < events.length && events[shown].t <= t) {
      const e = events[shown++];
      const li = h('li', {}, h('time', {}, clock(e.t)),
        h('span', { class: e.kind === 'race' || e.kind === 'call' ? 'big' : '' },
          e.side !== undefined ? h('span', { class: 'pill', style: { background: e.side === 0 ? 'var(--tide)' : 'var(--high)' } }) : null,
          e.text, e.electors ? h('span', { class: 'muted' }, ` ${plural(e.electors, 'elector')}.`) : null));
      feed.prepend(li);
      if (e.kind === 'race') {
        banner.replaceChildren(h('div', { class: 'call-banner', style: { background: e.side === 0 ? 'var(--tide)' : 'var(--high)' } },
          e.side === me ? `${st.cands[e.side].name} wins. You did it.` : `${st.cands[e.side].name} wins the presidency.`));
        doneBtn.hidden = false;
      }
    }

    if (force || Math.abs(t - lastNeedle) >= 3) {
      lastNeedle = t;
      const p = view.raceCalled !== null ? (view.raceCalled === me ? 1 : 0) : needle(plan, res, country, t, me);
      gauge.set(me === 0 ? p : 1 - p, chance(p));
      topChance.textContent = view.raceCalled !== null ? (view.raceCalled === me ? 'You win' : 'You lose') : `You: ${chance(p)}`;
      needleNote.textContent = `chance ${name(me)} wins`;
    }

    if (popK !== null) {
      const v = view.regions[popK];
      const x = res.regions[popK];
      const tot = v.votes[0] + v.votes[1];
      popEl.hidden = false;
      popEl.replaceChildren(
        h('div', { style: 'display:flex;justify-content:space-between;gap:8px' },
          h('b', {}, `${R(popK).name} · ${R(popK).electors}`),
          h('button', { type: 'button', style: 'background:none;border:0;color:inherit;font-size:20px;line-height:1;padding:0 4px', 'aria-label': 'Close', onclick: e => { e.stopPropagation(); popK = null; popEl.hidden = true; } }, '×')),
        h('div', { class: 'muted' }, v.status === 'open' ? `Polls close at ${clock(plan.regions[popK].close)}.`
          : v.status === 'called' ? `Called for ${name(v.side)}. ${Math.round(v.p * 100)}% counted.`
            : `Counting: ${Math.round(v.p * 100)}% in. ${v.rep ? `${margin(v.m)} so far.` : ''}`),
        tot ? h('div', { class: 'bars2' },
          ...[0, 1].flatMap(sd => [h('span', { style: { color: sd === 0 ? 'var(--tide)' : 'var(--high)', fontWeight: 800 } }, name(sd)),
            h('div', { class: 'bar', style: { width: `${100 * v.votes[sd] / tot}%`, background: sd === 0 ? 'var(--tide)' : 'var(--high)' } }),
            h('span', {}, num(v.votes[sd]))])) : null);
      void x;
    }

    if (t >= plan.end && !finished) {
      finished = true;
      playing = false;
      playBtn.disabled = true;
      doneBtn.hidden = false;
    }
  }

  let raf = null;
  function loop() {
    cancelAnimationFrame(raf);
    last = null;
    const step = now => {
      if (!playing || !root.isConnected) return;
      if (last !== null) t = Math.min(plan.end, t + (now - last) / 1000 * speed);
      last = now;
      draw(false);
      if (t < plan.end) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function stop() { playing = false; cancelAnimationFrame(raf); }

  draw(true);
  loop();
  // For tools and tests.
  window.warroom.night = { skip: () => { t = plan.end; draw(true); }, at: m => { t = m; draw(true); }, pause: () => stop(), plan };
}
