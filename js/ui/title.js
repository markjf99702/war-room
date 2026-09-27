// The title screen (pick a party and a difficulty) and the ticket (pick a running mate).

import { h, margin, PARTY, plural, jdFoot } from './dom.js';
import { makeMap } from './map.js';
import { DIFFICULTY, HOME_BONUS, WEEKS } from '../campaign.js';
import { PARTIES, TRAITS } from '../names.js';
import { rating, chanceT } from '../forecast.js';
import { ask } from './ask.js';

export function renderTitle(root, ctx) {
  const { country } = ctx;
  const inv = ctx.invite;
  const choice = { side: inv ? inv.side : 0, difficulty: inv ? inv.difficulty : 'normal' };
  const st = ctx.state;

  const map = makeMap(country, { cls: 'title' });
  country.regions.forEach((g, k) => map.fill(k, `var(--r-${rating(chanceT(g.lean, 7)).key})`));

  const partyCards = [0, 1].map(side => h('button', {
    type: 'button', class: 'party-card', 'data-side': side, 'aria-pressed': String(choice.side === side),
    onclick: () => { choice.side = side; partyCards.forEach((b, j) => b.setAttribute('aria-pressed', String(j === side))); },
  }, h('span', { class: 'pname' }, PARTIES[side].name), h('span', { class: 'pbase' }, `Strong in ${PARTIES[side].base}.`)));

  const diffText = h('p', { class: 'diff-text' }, DIFFICULTY[choice.difficulty].text);
  const diffBtns = Object.entries(DIFFICULTY).map(([key, d]) => h('button', {
    type: 'button', 'aria-pressed': String(choice.difficulty === key),
    onclick: () => { choice.difficulty = key; diffBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.key === key))); diffText.textContent = d.text; },
    dataset: { key },
  }, d.label));

  const inProgress = st && st.phase !== 'done' ? h('div', { class: 'panel' },
    h('div', { class: 'step-label', style: 'margin-top:0' }, 'Campaign in progress'),
    h('p', { style: 'margin:0 0 10px' }, st.phase === 'mate'
      ? `${st.cands[st.side].name} still needs a running mate.`
      : st.phase === 'plan'
        ? `Week ${st.week} of ${WEEKS}: ${st.cands[st.side].name} (${PARTY[st.side]}) against ${st.cands[1 - st.side].name}.`
        : 'The polls are closing. Election night is waiting.'),
    h('button', { class: 'btn', type: 'button', onclick: () => ctx.go('resume') }, 'Carry on')) : null;

  const rec = ctx.record;
  root.append(h('main', { class: 'title-screen' }, h('div', { class: 'title-inner' },
    h('h1', { class: 'wordmark' }, 'War Room', h('span', { class: 'dot' }, '.')),
    h('p', { class: 'tagline' }, 'Win an election in a country that doesn’t exist. You get eight weeks, a candidate, a running mate and a budget. Your rival’s moves stay hidden unless you pay for a poll. Then election night decides it.'),
    inProgress,
    inv ? h('div', { class: 'panel' },
      h('b', {}, 'Someone sent you this campaign. '),
      `Same country, same rival, same news. Play it as ${PARTY[inv.side]} on ${DIFFICULTY[inv.difficulty].label}`,
      inv.score ? `: they finished with ${inv.score} electors.` : '.') : null,
    h('div', { class: 'title-map' }, map.svg),
    h('div', { class: 'step-label' }, '1. Your party'),
    h('div', { class: 'party-pick' }, partyCards),
    h('div', { class: 'step-label' }, '2. How hard'),
    h('div', { class: 'diff-pick' }, diffBtns),
    diffText,
    h('div', { class: 'title-actions' },
      h('button', {
        class: 'btn big stamp', type: 'button',
        onclick: async () => {
          if (st && st.phase !== 'done' && !await ask('Start a new campaign?', { yes: 'Start over', detail: 'The one in progress will be lost.' })) return;
          ctx.start({ ...choice, seed: inv?.seed });
          ctx.invite = null;
          history.replaceState(null, '', location.pathname);
        },
      }, inv ? 'Play this campaign' : 'Start a campaign'),
      h('button', { class: 'btn big ghost', type: 'button', onclick: () => ctx.help() }, 'How to play')),
    rec.played ? h('p', { class: 'record' }, `Your record: ${rec.won} won, ${rec.played - rec.won} lost.`) : null,
    jdFoot(),
  )));
}

export function renderTicket(root, ctx) {
  const { country, state: st } = ctx;
  const me = st.side, them = 1 - me;
  const cand = side => st.cands[side];
  const reg = k => country.regions[k];
  const lastWon = st.lastWinner;
  const who = side => h('div', { class: `who side${side}` },
    h('div', { class: 'party', style: `color:var(--${side === 0 ? 'tide' : 'high'})` }, `${PARTIES[side].name}${side === me ? ' · You' : ''}`),
    h('div', { class: 'nm' }, cand(side).name),
    h('div', { class: 'ttl' }, cand(side).title),
    h('div', { class: 'ttl' }, `From ${reg(cand(side).home).name} (+${HOME_BONUS.cand} at home)`));

  const cards = st.mateOptions[me].map((m, j) => {
    const g = reg(m.home);
    const last = st.last[m.home];
    return h('button', { type: 'button', class: 'mate-card', onclick: () => ctx.pickMate(j) },
      h('span', { class: 'nm' }, m.name),
      h('span', { class: 'ttl' }, m.title),
      h('span', { class: 'home' }, 'Home', h('b', {}, g.name), `${plural(g.electors, 'elector')} · last time ${margin(last, 0)}`),
      h('span', { class: 'trait' }, h('b', {}, `${TRAITS[m.trait].label}. `), TRAITS[m.trait].text, ` Worth +${HOME_BONUS.mate} in ${g.name}.`));
  });

  root.append(h('main', { class: 'ticket' }, h('div', { class: 'ticket-inner' },
    h('div', { class: 'step-label', style: 'margin-top:4px' }, 'The matchup'),
    h('div', { class: 'matchup' }, who(0), h('div', { class: 'vs' }, 'vs'), who(1)),
    h('p', { class: 'lede' },
      `The ${PARTIES[st.incumbent].noun} holds the presidency. Four years ago the election went ${PARTY[lastWon]}, ${Math.max(...st.lastElectors)} electors to ${Math.min(...st.lastElectors)}. `,
      `It takes ${country.majority} of ${country.totalElectors} electors to win. Election day is Tuesday, November 3, eight weeks from now.`),
    h('div', { class: 'step-label' }, 'Pick a running mate'),
    h('p', { class: 'lede', style: 'font-size:15.5px;color:var(--muted)' }, 'Each brings something different, and a little help in their home region.'),
    h('div', { class: 'mates' }, cards),
  )));
}
