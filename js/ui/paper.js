// Monday's paper: what happened last week, the public polls, and your pollster's private memo.

import { h, margin, marginLong, money, num, mondayOf, PARTY } from './dom.js';
import { WEEKS, AD_NAMES } from '../campaign.js';

export function showPaper(ctx, entry, onDone) {
  const { country, state: st } = ctx;
  const me = st.side, them = 1 - me;
  const w = entry.week;
  const R = k => country.regions[k];
  const who = (side, role) => (role === 'cand' ? st.cands[side] : st.mates[side]);
  const inkFor = side => (side === 0 ? 't' : 'h');

  const news = [...entry.news];
  let lead = news.find(n => n.big) || news[0];
  const prevNat = st.natPolls.filter(p => p.week < w).at(-1);
  const natStory = {
    tag: 'Polls', head: `${entry.nat >= 0 ? st.cands[0].last : st.cands[1].last} ${Math.abs(entry.nat) < 1 ? 'edges ahead' : 'leads'} in the national poll, ${marginLong(entry.nat)}`,
    dek: prevNat ? `Last week it was ${marginLong(prevNat.m)}. The national number isn’t what decides it: the electors are counted region by region.` : '',
  };
  if (!lead) lead = natStory;
  const rest = news.filter(n => n !== lead);

  const trailLine = side => {
    const plan = entry.plans[side];
    const bits = [];
    for (const role of ['cand', 'mate']) {
      const t = entry.trail.find(x => x.side === side && x.who === role);
      const p = who(side, role);
      const label = role === 'cand' ? p.last : `running mate ${p.name}`;
      if (t) bits.push(`${label} drew ${num(t.crowd)} in ${R(t.region).name}`);
      else if (plan[role] === 'prep') bits.push(`${label} stayed off the trail to prepare for the debate`);
      else bits.push(`${label} spent the week at fundraisers`);
    }
    return bits.join('; ') + '.';
  };

  const story = n => h('article', { class: 'story' },
    h('div', { class: 'kicker' }, n.tag),
    h('h3', {}, n.head),
    n.dek ? h('p', {}, n.dek) : null,
    n.fx ? h('p', { class: `fxnote ${n.side === undefined ? '' : inkFor(n.side)}` }, n.fx) : null);

  const polls = h('div', { class: 'poll-box' },
    h('h4', {}, 'The polls'),
    h('div', { class: 'poll-row' }, h('span', {}, 'National'), h('b', { class: entry.nat >= 0 ? 't-ink' : 'h-ink' }, margin(entry.nat))),
    ...entry.pub.map(p => h('div', { class: 'poll-row' },
      h('span', {}, `${R(p.region).name} `, h('small', {}, `(${p.by}, ${p.und}% undecided)`)),
      h('b', { class: p.m >= 0 ? 't-ink' : 'h-ink' }, margin(p.m)))));

  const mine = entry.own[me];
  const memo = h('section', { class: 'memo', 'aria-label': 'Your pollster’s private memo' },
    h('span', { class: 'stamp' }, 'Internal'),
    h('h4', {}, `To ${st.cands[me].last} campaign HQ, from your pollster`),
    mine.length
      ? h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Region'), h('th', {}, 'Result'), h('th', {}, 'Undec.'), h('th', {}, 'Their ads'), h('th', {}, 'Their office'))),
        h('tbody', {}, ...mine.map(p => h('tr', {},
          h('td', {}, R(p.region).name),
          h('td', { class: p.m >= 0 ? 't-ink' : 'h-ink' }, margin(p.m)),
          h('td', {}, `${p.und}%`),
          h('td', {}, AD_NAMES[p.rivalAds]),
          h('td', {}, p.rivalOffice ? 'Yes' : 'No')))))
      : h('p', {}, 'You didn’t order any polls last week, so all we have is the public ones.'),
    h('p', {}, `Raised last week: ${money(entry.income[me])}. In the bank: ${money(entry.bank[me])}.`),
    h('p', { style: 'color:#6b6557' }, `Where they went: ${trailLine(them)}`));

  const last = w === WEEKS;
  const next = onDone
    ? h('button', { type: 'button', class: 'btn big', onclick: () => { close(); onDone(); } }, last ? 'On to election night →' : `Plan week ${w + 1} →`)
    : h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Close');

  const paper = h('div', { class: 'paper', role: 'dialog', 'aria-modal': 'true', 'aria-label': `The Aldermere Ledger, after week ${w}` },
    h('header', { class: 'masthead' },
      h('div', { class: 'mh-name' }, 'The Aldermere Ledger'),
      h('div', { class: 'mh-line' },
        h('span', {}, `Mon., ${mondayOf(w + 1).replace(/^(\w{3})\w*/, '$1.')}`),
        h('span', {}, `Week ${w} of ${WEEKS}`),
        h('span', {}, last ? 'Election day tomorrow' : `${WEEKS - w} weeks to go`))),
    h('div', { class: 'kicker', style: 'margin-top:12px' }, lead.tag),
    h('h2', { class: 'lead-head' }, lead.head),
    lead.dek ? h('p', { class: 'lead-dek' }, lead.dek) : null,
    lead.fx ? h('p', { class: `fxnote ${lead.side === undefined ? '' : inkFor(lead.side)}` }, lead.fx) : null,
    h('div', { class: 'cols' },
      h('div', { style: 'display:grid;gap:14px;align-content:start' },
        ...rest.map(story),
        lead !== natStory ? story(natStory) : null,
        h('article', { class: 'story' },
          h('div', { class: 'kicker' }, 'On the trail'),
          h('h3', {}, `Where the candidates went`),
          h('p', {}, h('span', { class: `${inkFor(0)}-ink` }, 'Tidewater: '), trailLine(0)),
          h('p', {}, h('span', { class: `${inkFor(1)}-ink` }, 'Highland: '), trailLine(1)))),
      h('div', { style: 'display:grid;gap:14px;align-content:start' }, polls)),
    memo,
    h('div', { class: 'paper-actions' }, next));

  document.querySelector('.toast')?.remove();
  const overlay = h('div', { class: 'overlay', onclick: e => { if (e.target === overlay && !onDone) close(); } }, paper);
  const onKey = e => { if (e.key === 'Escape' && !onDone) close(); };
  function close() { overlay.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); }
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.append(overlay);
  overlay.scrollTop = 0;
  next.focus({ preventScroll: true });
  return close;
}

export { PARTY };
