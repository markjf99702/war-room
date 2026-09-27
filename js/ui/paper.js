// Monday's paper: what happened last week, the public polls, and your pollster's private memo.

import { h, margin, marginLong, money, num, mondayOf, PARTY } from './dom.js';
import { WEEKS, AD_NAMES } from '../campaign.js';
import { choose } from '../decisions.js';
import { decide } from '../ai.js';

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

  // How last Monday's calls played out, both sides' (the rival's are public now).
  const calls = entry.calls || [];
  const nameOf = s => (s === me ? 'You' : st.cands[s].last);
  const played = calls.length ? h('article', { class: 'story played' },
    h('div', { class: 'kicker' }, 'How the calls played'),
    ...groupBy(calls, c => (c.kind === 'issue' || c.kind === 'plant' || c.kind === 'flood' ? c.title : c.id)).map(group => h('p', {},
      h('b', {}, group[0].kind === 'issue' || group[0].kind === 'plant' || group[0].kind === 'flood' ? `${group[0].title}. ` : ''),
      ...group.map(c => h('span', {}, h('span', { class: `${inkFor(c.side)}-ink` }, `${nameOf(c.side)}: `), `${c.choice.replace(/\.$/, '')}. `, c.says ? `${c.says} ` : ''))))) : null;

  // This Monday's calls: what the news demands of your campaign this week.
  const asks = (entry.asks || []).map(id => st.pending.find(d => d.id === id) || st.decided.find(d => d.id === id)).filter(d => d && d.side === me);
  const last = w === WEEKS;
  const next = onDone
    ? h('button', { type: 'button', class: 'btn big', onclick: () => { close(); onDone(); } }, last ? 'On to election night →' : `Plan week ${w + 1} →`)
    : h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Close');
  const gate = () => {
    const open = asks.filter(d => !d.chosen);
    if (!onDone) return;
    next.disabled = open.length > 0;
    next.textContent = open.length ? (open.length > 1 ? `Make your ${open.length} calls first` : 'Make your call first') : (last ? 'On to election night →' : `Plan week ${w + 1} →`);
  };
  const callCards = asks.map(d => callCard(ctx, d, () => gate()));
  gate();

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
    callCards.length ? h('div', { class: 'calls' }, callCards) : null,
    h('div', { class: 'cols' },
      h('div', { style: 'display:grid;gap:14px;align-content:start' },
        played,
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
  (next.disabled ? paper.querySelector('.call-opt') : next)?.focus({ preventScroll: true });
  return close;
}

function groupBy(list, key) {
  const m = new Map();
  for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.values()];
}

// One decision, as a card in the paper: the options, what each is likely to do, and what the
// strategist would pick. Once answered it shows the choice.
function callCard(ctx, d, changed) {
  const { country, state: st } = ctx;
  const card = h('section', { class: 'call', 'aria-label': `Your call: ${d.title}` });
  const hint = d.chosen ? null : d.options.find(o => o.key === decide(st, country, st.side, d, 'advisor'));
  const draw = () => {
    card.replaceChildren(
      h('span', { class: 'stamp' }, d.kind === 'issue' ? 'Take a position' : 'Your call'),
      h('h4', {}, d.title),
      h('p', {}, d.text),
      h('div', { class: 'call-opts' }, ...d.options.map(o => {
        const picked = d.chosen === o.key;
        const tooDear = (o.cost || 0) > st.money[st.side];
        return h('button', {
          type: 'button', class: 'call-opt', 'aria-pressed': String(picked), disabled: d.chosen || tooDear ? true : null,
          onclick: () => {
            if (!choose(st, d.id, o.key)) return;
            ctx.save();
            draw();
            changed();
          },
        }, h('b', {}, o.label, o.cost ? h('span', { class: 'cost' }, ` · ${money(o.cost)}`) : null), h('small', {}, tooDear && !d.chosen ? `You can’t afford it (${money(st.money[st.side])} in the bank).` : o.says));
      })),
      d.chosen
        ? h('p', { class: 'call-note' }, d.kind === 'issue' ? 'It’s on the record. You’ll see how it went down in next Monday’s paper.' : 'Decided. You’ll see how it played in next Monday’s paper.')
        : h('p', { class: 'call-note' }, `Your strategist would: ${hint.label.toLowerCase()}.`));
  };
  draw();
  return card;
}

export { PARTY };
