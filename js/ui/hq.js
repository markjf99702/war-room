// The war room: the board, what you know about each region, and this week's plan.

import { h, $, margin, marginLong, money, chance, plural, PARTY } from './dom.js';
import { makeMap, glyph } from './map.js';
import { histogram, snake, chanceLine, natLine } from './charts.js';
import {
  WEEKS, DEBATE_WEEKS, AD_NAMES, FUNDRAISE, POLL_COST, OFFICE_GAIN, POLL_SD,
  adUnit, officeCost, planCost, income, estimate, emptyPlan, natAvg,
} from '../campaign.js';
import { forecast, rating, chanceT, planEffects } from '../forecast.js';
import { planFor } from '../ai.js';
import { TRAITS } from '../names.js';
import { WAVES, clock } from '../night.js';
import { showPaper } from './paper.js';
import { ask } from './ask.js';
import { promiseFor, openFor, ISSUES } from '../decisions.js';
import { debateSetup } from '../debate.js';

const RATING_NAMES = { t3: 'Safe Tidewater', t2: 'Likely Tidewater', t1: 'Leans Tidewater', tu: 'Toss-up', h1: 'Leans Highland', h2: 'Likely Highland', h3: 'Safe Highland' };

export function closeTime(g) {
  return clock(g.east > 0.62 ? WAVES[0] : g.east > 0.36 ? WAVES[1] : WAVES[2]);
}

export function renderHQ(root, ctx) {
  const { country, state: st } = ctx;
  const me = st.side, them = 1 - me;
  const plan = st.plans[me];
  // A promise made in Monday's paper puts the candidate there to start with.
  const promised = promiseFor(st, me);
  if (promised !== null && !plan.promiseSeen) { plan.cand = promised; plan.promiseSeen = true; ctx.save(); }
  const ui = { tab: 'map', sel: null, fc: null, fxBase: null };
  const cand = st.cands[me], mate = st.mates[me];
  const rivalCand = st.cands[them], rivalMate = st.mates[them];
  const debateWeek = DEBATE_WEEKS.includes(st.week);
  const R = k => country.regions[k];

  const map = makeMap(country, { onPick: k => select(k) });

  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    ...[['map', 'Map'], ['forecast', 'Forecast'], ['news', 'News']].map(([key, label]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(key === ui.tab), dataset: { tab: key }, onclick: () => setTab(key) }, label)));
  const legend = h('div', { class: 'legend', 'aria-hidden': 'true' },
    ...['t3', 't2', 't1', 'tu', 'h1', 'h2', 'h3'].map(k => h('span', { class: `l-${k}`, style: { background: `var(--r-${k})` } },
      { t3: 'Safe', t2: 'Likely', t1: 'Lean', tu: 'Toss-up', h1: 'Lean', h2: 'Likely', h3: 'Safe' }[k])));
  const boardWrap = h('div', { class: 'board-wrap' },
    h('div', { class: 'board' }, map.svg),
    legend,
    h('p', { class: 'legend-note' }, 'Colours are your campaign’s best guess for election day. Dashed circles: where your rival campaigned last week.'));
  const side = h('section', { class: 'side-col' });
  const main = h('main', { class: 'hq', 'data-tab': ui.tab }, h('section', { class: 'board-col' }, tabs, boardWrap), side);
  const bar = h('div', { class: 'planbar' });
  root.append(main, bar);

  function setTab(key) {
    ui.tab = key;
    main.dataset.tab = key;
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === key)));
    renderSide();
  }

  function select(k) {
    ui.sel = k;
    map.select(k);
    if (ui.tab !== 'map') setTab('map'); else renderSide();
    if (k !== null && matchMedia('(max-width: 939px)').matches) {
      requestAnimationFrame(() => side.querySelector('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
  }

  // ---------------------------------------------------------------- recompute and redraw

  function changed() {
    ctx.save();
    refresh();
  }

  function refresh() {
    ui.fc = forecast(st, country, me, plan);
    ui.fxBase = planEffects(st, country, me, emptyPlan(country.regions.length));
    ui.fx = planEffects(st, country, me, plan);
    const inp = ui.fc.inputs.regions;
    country.regions.forEach((g, k) => {
      const r = rating(chanceT(inp[k].mean, inp[k].sd));
      map.fill(k, `var(--r-${r.key})`);
      map.tokens(k, tokensFor(k));
    });
    renderBar();
    renderSide();
  }

  const lastWeekRallies = st.rallies.filter(r => r.week === st.week - 1 && r.side === them);

  function tokensFor(k) {
    const out = [];
    if (plan.cand === k) out.push(glyph.pawn(me, cand.last[0]));
    if (plan.mate === k) out.push(glyph.pawn(me, mate.last[0], false));
    for (const r of lastWeekRallies) if (r.region === k) out.push(glyph.ghost(them, (r.who === 'cand' ? rivalCand : rivalMate).last[0]));
    if (plan.ads[k]) out.push(glyph.ads(me, plan.ads[k]));
    if (st.regions[k].office[me] || plan.office.includes(k)) out.push(glyph.office(me));
    if (plan.polls.includes(k)) out.push(glyph.poll());
    return out;
  }

  const left = () => st.money[me] - planCost(plan, country);

  // ---------------------------------------------------------------- the plan bar

  function pieceLabel(who) {
    const where = plan[who];
    if (where === 'fund') return `Fundraising · +${money(who === 'cand' ? FUNDRAISE.cand : FUNDRAISE.mate)}`;
    if (where === 'prep') return 'Debate prep';
    return `Rally in ${R(where).name}`;
  }

  function renderBar() {
    const person = who => (who === 'cand' ? cand : mate);
    const chip = who => h('button', { type: 'button', class: 'pb-piece', onclick: () => pieceMenu(who), 'aria-label': `${person(who).name}: ${pieceLabel(who)}. Change` },
      h('span', { class: `pc${who === 'mate' ? ' small' : ''}` }, person(who).last[0]),
      h('span', {}, h('b', {}, person(who).last), pieceLabel(who)));
    bar.replaceChildren(
      h('div', { class: 'pb-row' }, chip('cand'), chip('mate')),
      h('div', { class: 'pb-row' },
        h('div', { class: 'pb-money num' }, `${money(left())} left`, h('small', {}, `${chance(ui.fc.p)} to win`)),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn small ghost', onclick: strategist }, 'Strategist'),
        h('button', { type: 'button', class: 'btn small stamp', onclick: endWeek }, st.week === WEEKS ? 'Last week →' : 'End week →')));
    const mc = $('#moneyChip b');
    if (mc) mc.textContent = money(st.money[me]);
  }

  function pieceMenu(who) {
    $('.piece-menu')?.remove();
    const person = who === 'cand' ? cand : mate;
    const close = () => { menu.remove(); document.removeEventListener('click', outside, true); };
    const outside = e => { if (!menu.contains(e.target)) close(); };
    const opt = (value, label, sub) => h('button', {
      type: 'button', 'aria-pressed': String(plan[who] === value),
      onclick: () => { plan[who] = value; close(); changed(); },
    }, label, h('small', {}, sub));
    const menu = h('div', { class: 'piece-menu', role: 'dialog', 'aria-label': `Where ${person.name} goes this week` },
      h('p', {}, `Where does ${person.name} spend week ${st.week}?`),
      opt('fund', 'Fundraise', `+${money(who === 'cand' ? FUNDRAISE.cand : FUNDRAISE.mate)} for next week`),
      who === 'cand' && debateWeek ? opt('prep', 'Debate prep', 'The debate is at the end of this week. Prep improves the odds of winning it.') : null,
      Number.isInteger(plan[who]) ? opt(plan[who], `Rally in ${R(plan[who]).name}`, 'Where they’re going now') : null,
      h('p', { style: 'margin-top:6px' }, 'To hold a rally, tap a region on the map and send them there.'));
    document.body.append(menu);
    setTimeout(() => document.addEventListener('click', outside, true));
  }

  function strategist() {
    const p = planFor(st, country, me, 'advisor');
    Object.assign(plan, p, { free: [] });
    ctx.toast('Your strategist filled in the week. Change anything you like.');
    changed();
  }

  async function endWeek() {
    if (st.week === WEEKS && left() >= 3 && !await ask(`You still have ${money(left())} to spend.`, { yes: 'Vote anyway', no: 'Keep planning', detail: 'Money left after election day is worth nothing.' })) return;
    $('.piece-menu')?.remove();
    ctx.endWeek();
  }

  // ---------------------------------------------------------------- the side column

  function renderSide() {
    if (ui.tab === 'forecast') side.replaceChildren(forecastView());
    else if (ui.tab === 'news') side.replaceChildren(newsView());
    else side.replaceChildren(ui.sel === null ? overview() : regionPanel(ui.sel));
  }

  function overview() {
    const lastPaper = st.history.at(-1);
    return h('div', {},
      h('div', { class: 'panel' },
        h('div', { class: 'rp-head' }, h('h2', { class: 'rp-name' }, `Week ${st.week}`), h('span', { class: 'rp-el muted' }, `of ${WEEKS}`)),
        h('p', { style: 'margin:8px 0 6px' },
          st.week === 1 ? `You have ${money(st.money[me])}. ` : `You have ${money(st.money[me])} to spend. `,
          'Tap a region to send your candidate or running mate there, buy ads, open a field office or order a poll. ',
          'Anything you don’t plan, they spend fundraising.'),
        promised !== null ? h('p', { style: 'margin:6px 0' }, h('b', {}, `You promised to go to ${R(promised).name} this week. `),
          plan.cand === promised ? `${cand.last} is booked there. Send them elsewhere and you break the promise.` : `${cand.last} isn’t going. That will be noticed.`) : null,
        debateWeek ? debateNote() : null,
        st.week === WEEKS ? h('p', { style: 'margin:6px 0' }, h('b', {}, 'Last week. '), 'Spend it all: money is worth nothing after Tuesday.') : null,
        h('p', { class: 'fx-line' }, `Not sure? The Strategist will plan a sensible week for you to adjust.`)),
      lastPaper ? h('button', { type: 'button', class: 'panel', style: 'display:block;width:100%;text-align:left;cursor:pointer', onclick: () => showPaper(ctx, lastPaper, null) },
        h('div', { class: 'kicker', style: 'font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--stamp)' }, `Last week’s paper`),
        h('div', { style: 'font-family:var(--news);font-size:20px;font-weight:700;line-height:1.15;margin-top:2px' }, leadHeadline(lastPaper))) : null,
      positions(),
      closestList());
  }

  function debateNote() {
    const setup = debateSetup(st, country, st.week);
    const topics = setup.topics.map(t => ({ character: 'character', local: 'the plant closing', flood: 'the floods', economy: 'the economy', record: 'the government’s record', safety: 'crime', towns: 'the small towns', rents: 'city rents', vesland: 'Vesland', swing: 'a local question' })[t.key]);
    return h('p', { style: 'margin:6px 0' }, h('b', {}, `Debate at the end of this week, at ${setup.venue}. `),
      `The moderators have said they’ll ask about ${topics.slice(0, -1).join(', ')} and ${topics.at(-1)}. You answer each question yourself. `,
      `If ${cand.last} skips the trail to prepare, you get a scouting report on how ${rivalCand.last} answers, and sharper answers of your own.`);
  }

  // Positions both campaigns have taken on the issues (they're public).
  function positions() {
    const keys = [...new Set([...Object.keys(st.stances[me]), ...Object.keys(st.stances[them])])];
    if (!keys.length) return null;
    const label = (s, key) => {
      const st0 = st.stances[s][key];
      if (!st0) return '—';
      const opt = ISSUES.find(i => i.key === key).options.find(o => o.key === st0.option);
      return `${opt.label}${st0.flipped ? ' (changed)' : ''}`;
    };
    return h('div', { class: 'panel' },
      h('div', { class: 'card-title', style: 'margin-top:0' }, 'On the record'),
      h('table', { class: 'tip-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Issue'), h('th', {}, cand.last), h('th', {}, rivalCand.last))),
        h('tbody', {}, ...keys.map(key => h('tr', {},
          h('td', {}, h('b', {}, ISSUES.find(i => i.key === key).title)),
          h('td', {}, label(me, key)),
          h('td', {}, label(them, key)))))));
  }

  function closestList() {
    const inp = ui.fc.inputs.regions;
    const rows = country.regions.map((g, k) => ({ k, g, x: inp[k], tip: ui.fc.tip[k] }))
      .sort((a, b) => b.tip - a.tip).slice(0, 6);
    return h('div', { class: 'panel' },
      h('div', { class: 'card-title', style: 'margin-top:0' }, 'Where it’s close'),
      tipTable(rows));
  }

  function tipTable(rows) {
    const maxTip = Math.max(...rows.map(r => r.tip), 0.01);
    return h('table', { class: 'tip-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Region'), h('th', { class: 'r' }, 'Your model'), h('th', { class: 'r' }, 'Decides it'))),
      h('tbody', {}, ...rows.map(({ k, g, x, tip }) => h('tr', {},
        h('td', {}, h('button', { type: 'button', onclick: () => select(k) }, g.name), h('span', { class: 'muted' }, ` ${g.electors}`)),
        h('td', { class: 'r num' }, margin(x.mean)),
        h('td', { class: 'r num' }, h('span', { class: 'tipbar', style: { width: `${Math.round(38 * tip / maxTip)}px` } }), `${Math.round(tip * 100)}%`)))));
  }

  function regionPanel(k) {
    const g = R(k), rs = st.regions[k];
    const x = ui.fc.inputs.regions[k];
    const est = estimate(st, me, k);
    const pT = chanceT(x.mean, x.sd);
    const rt = rating(pT);
    const pMine = me === 0 ? pT : 1 - pT;
    const obs = st.intel[me].obs[k];
    const seen = st.intel[me].seen[k];
    const lastPoll = [...st.intel[me].polls].reverse().find(p => p.region === k);
    const lastPub = [...st.publicPolls].reverse().find(p => p.region === k);
    const rivalRallies = st.rallies.filter(r => r.side === them && r.region === k);
    const myRallies = st.rallies.filter(r => r.side === me && r.region === k);

    const tags = [
      h('span', { class: 'tag' }, `Polls close ${closeTime(g)}`),
      g.metro >= 0 ? h('span', { class: 'tag' }, country.cities[g.metro].capital ? 'The capital' : 'Big city') : null,
      promised === k ? h('span', { class: 'tag promise' }, `You promised to come this week`) : null,
      cand.home === k ? h('span', { class: `tag ${me ? 'h' : 't'}` }, `${cand.last}’s home`) : null,
      mate.home === k ? h('span', { class: `tag ${me ? 'h' : 't'}` }, `${mate.last}’s home`) : null,
      rivalCand.home === k ? h('span', { class: `tag ${them ? 'h' : 't'}` }, `${rivalCand.last}’s home`) : null,
      rivalMate?.home === k ? h('span', { class: `tag ${them ? 'h' : 't'}` }, `${rivalMate.last}’s home`) : null,
      st.rain.includes(k) ? h('span', { class: 'tag' }, 'Rain on election day') : null,
    ];

    // Where the last reading came from.
    let reading;
    if (obs.src === 'last') {
      const moved = natAvg(st) - st.lastNat;
      reading = `Last election: ${margin(st.last[k])}. Nobody has polled it since. The country has moved ${Math.abs(moved) < 0.5 ? 'very little' : `${Math.abs(moved).toFixed(1)} points toward ${moved > 0 ? 'Tidewater' : 'Highland'}`} since then, by the national polls.`;
    }
    else if (lastPoll && lastPoll.week >= (lastPub?.week ?? -1)) reading = `Your poll, week ${lastPoll.week}: ${margin(lastPoll.m)}, ${lastPoll.und}% undecided.`;
    else if (lastPub) reading = `${lastPub.by}, ${lastPub.week ? `week ${lastPub.week}` : 'before the campaign'}: ${margin(lastPub.m)}, ${lastPub.und}% undecided.`;

    const theirs = [];
    if (rivalRallies.length) theirs.push(`${rivalRallies.map(r => `${(r.who === 'cand' ? rivalCand : rivalMate).last} (week ${r.week})`).join(', ')} held rallies here.`);
    if (seen.ads) theirs.push(`Their ads when you polled in week ${seen.ads.week}: ${AD_NAMES[seen.ads.level].toLowerCase()}.`);
    if (seen.office) theirs.push(seen.office.open ? `They have a field office here (seen week ${seen.office.week}).` : `No field office of theirs as of week ${seen.office.week}.`);
    if (!seen.ads) theirs.push('You haven’t polled here, so you can’t see their ads or offices.');

    const mine = [];
    if (rs.office[me]) mine.push(`Field office open since week ${rs.office[me]}.`);
    if (rs.ads[me]) mine.push(`Ads last week: ${AD_NAMES[rs.ads[me]].toLowerCase()}.`);
    if (myRallies.length) mine.push(`${plural(myRallies.length, 'rally', 'rallies')} so far.`);
    if (!mine.length) mine.push('Nothing yet.');

    const unit = adUnit(g);
    const budget = left();
    const adBtns = AD_NAMES.map((name, L) => {
      const extra = (L - plan.ads[k]) * unit;
      return h('button', {
        type: 'button', 'aria-pressed': String(plan.ads[k] === L), disabled: extra > budget ? true : null,
        onclick: () => { plan.ads[k] = L; changed(); },
      }, name, h('small', {}, L ? money(L * unit) : '—'));
    });

    const pieceBtn = who => {
      const person = who === 'cand' ? cand : mate;
      const here = plan[who] === k;
      const elsewhere = Number.isInteger(plan[who]) && !here ? `from ${R(plan[who]).name}` : plan[who] === 'prep' ? 'from debate prep' : 'from fundraising';
      return h('button', {
        type: 'button', class: 'togg', 'aria-pressed': String(here),
        onclick: () => { plan[who] = here ? 'fund' : k; changed(); },
      }, h('span', { class: 'pc' }, person.last[0]), h('span', {}, here ? `${person.last} is here` : `Send ${person.last}`, h('small', {}, here ? 'Tap to send back to fundraising' : elsewhere)));
    };

    const officeOpen = rs.office[me];
    const officeHere = plan.office.includes(k);
    const oc = officeCost(g);
    const officeBtn = h('button', {
      type: 'button', class: 'togg', 'aria-pressed': String(!!officeOpen || officeHere),
      disabled: officeOpen || (!officeHere && oc > budget) ? true : null,
      onclick: () => { plan.office = officeHere ? plan.office.filter(j => j !== k) : [...plan.office, k]; changed(); },
    }, h('span', {}, officeOpen ? `Field office open since week ${officeOpen}` : `Open a field office · ${money(oc)}`,
      h('small', {}, officeOpen ? `Getting out your vote: +${OFFICE_GAIN} a week` : `+${OFFICE_GAIN} a week until election day: about +${(OFFICE_GAIN * (WEEKS - st.week + 1)).toFixed(1)} if you open it now`)));

    const polled = plan.polls.includes(k);
    const pollBtn = h('button', {
      type: 'button', class: 'togg', 'aria-pressed': String(polled), disabled: !polled && POLL_COST > budget ? true : null,
      onclick: () => { plan.polls = polled ? plan.polls.filter(j => j !== k) : [...plan.polls, k]; changed(); },
    }, h('span', {}, `Poll here this week · ${money(POLL_COST)}`, h('small', {}, `Within about ±${POLL_SD.own} points, and shows what they’re running here`)));

    const delta = (ui.fx[k] - ui.fxBase[k]);
    const lo = -20, hi = 20;
    const pos = v => `${((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * 100).toFixed(1)}%`;
    const bandCol = x.mean >= 0 ? 'var(--r-t2)' : 'var(--r-h2)';

    return h('div', { class: 'panel', 'aria-live': 'polite' },
      h('div', { class: 'rp-head' },
        h('h2', { class: 'rp-name' }, g.name),
        h('span', { class: 'rp-el' }, plural(g.electors, 'elector')),
        h('button', { type: 'button', class: 'rp-close', 'aria-label': 'Close', onclick: () => select(null) }, '×')),
      h('div', { class: 'tags' }, tags),
      h('div', { class: 'model' },
        h('div', { class: 'model-line' },
          h('span', {}, h('span', { class: 'model-m num' }, margin(x.mean)), h('span', { class: 'model-sd num' }, `  ±${x.sd.toFixed(1)} on the day`)),
          h('span', { class: `rating ${rt.key}`, style: { background: `var(--r-${rt.key})` } }, RATING_NAMES[rt.key])),
        h('div', { class: 'spread', 'aria-hidden': 'true' },
          h('div', { class: 'band', style: { left: pos(x.mean - x.sd), width: `calc(${pos(x.mean + x.sd)} - ${pos(x.mean - x.sd)})`, background: bandCol } }),
          h('div', { class: 'mid' }),
          h('div', { class: 'pt', style: { left: pos(x.mean) } })),
        h('div', { class: 'spread-scale' }, h('span', {}, 'H +20'), h('span', {}, `${cand.last} carries it ${chance(pMine)} of the time`), h('span', {}, 'T +20'))),
      h('ul', { class: 'facts' },
        h('li', {}, h('b', {}, 'Last reading'), h('span', {}, reading, est.sd > 3.5 ? ` Now ±${est.sd.toFixed(1)}: it’s gone stale.` : '')),
        h('li', {}, h('b', {}, 'Undecided'), h('span', {}, undecidedLine(lastPoll, lastPub, g))),
        h('li', {}, h('b', {}, 'Their side'), h('span', {}, theirs.join(' '))),
        h('li', {}, h('b', {}, 'Your side'), h('span', {}, mine.join(' ')))),
      h('div', { class: 'acts' },
        h('div', { class: 'act-row' }, h('div', { class: 'act-label' }, h('span', {}, 'Rally here')), h('div', { class: 'two' }, pieceBtn('cand'), pieceBtn('mate'))),
        h('div', { class: 'act-row' }, h('div', { class: 'act-label' }, h('span', {}, 'Ads this week'), h('span', {}, g.metro >= 0 || unit > 1 ? `${money(unit)} a level here` : '')), h('div', { class: 'seg' }, adBtns)),
        h('div', { class: 'act-row' }, officeBtn),
        h('div', { class: 'act-row' }, pollBtn),
        h('p', { class: 'fx-line' }, Math.abs(delta) >= 0.05
          ? [`This week’s plan here: `, h('b', {}, `about +${delta.toFixed(1)} for ${cand.last}`), '. Your model counts half of it until a poll confirms it.']
          : 'Nothing planned here this week.')));
  }

  function forecastView() {
    const fc = ui.fc;
    const inp = fc.inputs.regions;
    const items = country.regions.map((g, k) => {
      const pT = chanceT(inp[k].mean, inp[k].sd);
      const r = rating(pT);
      return { k, name: g.name, electors: g.electors, m: inp[k].mean, rating: r.key, label: `${RATING_NAMES[r.key]}, ${margin(inp[k].mean)}` };
    }).sort((a, b) => b.m - a.m);
    const tipK = fc.tip.indexOf(Math.max(...fc.tip));
    items.forEach(it => { it.tip = it.k === tipK; });
    const pts = [...st.forecasts[me], { week: st.week, p: fc.p }];
    const rows = country.regions.map((g, k) => ({ k, g, x: inp[k], tip: fc.tip[k] })).sort((a, b) => b.tip - a.tip).slice(0, 8);
    return h('div', {},
      h('div', { class: 'panel' },
        h('div', { class: 'fc-big' },
          h('div', { class: 'fc-num num', style: { color: 'var(--mine)' } }, chance(fc.p)),
          h('div', { class: 'fc-sub' }, h('b', {}, `${cand.name}’s chance`), h('br'), `${rivalCand.last}: ${chance(1 - fc.p)}`, h('br'),
            h('span', { class: 'muted' }, `Average: ${Math.round(fc.meanE)} electors, ${country.majority} to win`))),
        h('p', { class: 'fc-note' }, 'Your campaign’s model runs the election 2,000 times from what you know. It counts half of your own work until a poll confirms it, and only the rival moves you’ve seen, so a region you haven’t polled in a while can be further off than it looks.'),
        h('div', { class: 'card-title' }, 'Week by week'),
        chanceLine(pts, me),
        h('div', { class: 'card-title' }, 'Electors you win, in 2,000 runs'),
        histogram(fc.hist, country.majority, country.totalElectors, me),
        h('div', { class: 'card-title' }, 'The map, lined up'),
        snake(items, country.majority, country.totalElectors, { onPick: k => select(k) }),
        h('p', { class: 'fc-note' }, `Each block is a region, as wide as its electors. The region that crosses the ${country.majority} line is the tipping point; outlined in red is the one most likely to be it.`)),
      h('div', { class: 'panel' },
        h('div', { class: 'card-title', style: 'margin-top:0' }, 'Most likely to decide it'),
        h('p', { class: 'fc-note', style: 'margin-top:0' }, 'How often each region was the tipping point in the runs.'),
        tipTable(rows)),
      h('div', { class: 'panel' },
        h('div', { class: 'card-title', style: 'margin-top:0' }, 'National polls'),
        natLine(st.natPolls),
        h('p', { class: 'fc-note' }, `Average of the last three: ${marginLong(natAvg(st))}. That’s the popular vote, which isn’t what decides it.`)));
  }

  function newsView() {
    if (!st.history.length) return h('div', { class: 'panel' }, h('p', { style: 'margin:0' }, 'The first paper comes out on Monday, after week 1.'));
    return h('div', { class: 'panel' },
      h('div', { class: 'card-title', style: 'margin-top:0' }, 'The Aldermere Ledger'),
      h('div', { class: 'news-list' }, ...[...st.history].reverse().map(e => h('button', { type: 'button', onclick: () => showPaper(ctx, e, null) },
        h('small', {}, `After week ${e.week}`), h('b', {}, leadHeadline(e))))));
  }

  refresh();
  if (openFor(st, me).length && st.history.length && !document.querySelector('.paper')) showPaper(ctx, st.history.at(-1), () => {});
}

function undecidedLine(poll, pub, g) {
  const best = poll && poll.week >= (pub?.week ?? -1) ? poll : pub;
  if (!best) return `No poll yet. Usually about ${Math.round(g.und0)}% here at this stage.`;
  return `${best.und}% ${best === poll ? 'in your poll' : 'in the public poll'} from ${best.week ? `week ${best.week}` : 'before the campaign'}. Ads and rallies work best where there are more of them.`;
}

export function leadHeadline(entry) {
  const big = entry.news.find(n => n.big) || entry.news[0];
  return big ? big.head : `National poll: ${marginLong(entry.nat)}`;
}
