// How to play.

import { h, s } from './dom.js';
import { glyph } from './map.js';
import { WEEKS, FUNDRAISE, INCOME, POLL_COST, OFFICE_GAIN, DEBATE_WEEKS } from '../campaign.js';

function icon(gl) {
  return s('svg', { viewBox: '-8 -8 16 16', 'aria-hidden': 'true', class: 'map' }, gl.el);
}

export function showHelp(ctx) {
  const n = ctx.country.regions.length;
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'How to play' },
    h('h2', {}, 'How to play'),
    h('p', {}, `Aldermere elects its president region by region. Each of its ${n} regions has electors, and whoever carries a region takes all of them. ${ctx.country.majority} of ${ctx.country.totalElectors} wins. You have ${WEEKS} weeks.`),
    h('h3', {}, 'Each week'),
    h('ul', {},
      h('li', { class: 'glyph-row' }, icon(glyph.pawn(0, 'C')), h('span', {}, h('b', {}, 'Your candidate and running mate. '), `Send each to a region for a rally (it spills over a little into the neighbours), or leave them fundraising (+$${FUNDRAISE.cand}M and +$${FUNDRAISE.mate}M for next week).`)),
      h('li', { class: 'glyph-row' }, icon(glyph.ads(0, 2)), h('span', {}, h('b', {}, 'Ads. '), 'Light, steady or heavy, bought fresh each week. The first level does the most. Ads in big cities cost more.')),
      h('li', { class: 'glyph-row' }, icon(glyph.office(0)), h('span', {}, h('b', {}, 'Field offices. '), `Once open, an office gets out your vote: +${OFFICE_GAIN} a week, every week until election day. Open them early.`)),
      h('li', { class: 'glyph-row' }, icon(glyph.poll()), h('span', {}, h('b', {}, 'Polls. '), `$${POLL_COST}M each. Results arrive in Monday’s memo, along with what your rival is running there.`)),
      h('li', {}, `You get $${INCOME}M a week on top of fundraising, and unspent money carries over.`)),
    h('h3', {}, 'What you can’t see'),
    h('p', {}, 'Your rival plans at the same time you do, and you only learn where their candidates went. Their ads and field offices stay hidden until you poll a region. Your map shows your campaign’s best guess, and a region nobody has polled in weeks can be further off than it looks.'),
    h('h3', {}, 'Your calls'),
    h('p', {}, 'Monday’s paper usually asks something of you. When there’s a scandal, a gaffe, a plant closing, a flood or a late surprise, you decide how your campaign answers, including when it’s the rival in trouble. On quiet weeks there’s an issue to take a side on, and each position wins some regions and costs others. Some answers are sure things and some are gambles; the next paper tells you how it played. An issue can come back later, and changing your mind then costs you.'),
    h('h3', {}, 'The debates'),
    h('p', {}, `At the end of weeks ${DEBATE_WEEKS.join(' and ')}. Four questions, and for each you choose how to answer. An attack flattens a list of figures, figures expose a dodge, a plan beats an anecdote, and a good story makes an attack look cruel. Some answers suit a question better, and every candidate has a natural style. If your candidate skips the trail that week to prepare, you get a scouting report on how the rival answers.`),
    h('h3', {}, 'Things that happen'),
    h('p', {}, 'Endorsements, the economy, local anger and the weather. Undecided voters make up their minds as the weeks go by, so persuasion is cheapest early.'),
    h('h3', {}, 'Election night'),
    h('p', {}, 'Polls close from east to west. Regions count in batches and the decision desk calls each one when the votes left can’t change it. Early returns in the cities lean Highland, because the Tidewater-leaning mail ballots are counted last, so don’t celebrate or panic at 9 PM.'),
    h('h3', {}, 'Stuck?'),
    h('p', {}, 'The Strategist button plans a sensible week for you to adjust. The Forecast tab shows which regions are most likely to decide it.'),
    h('div', { class: 'paper-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Got it')));
  const overlay = h('div', { class: 'overlay', onclick: e => { if (e.target === overlay) close(); } }, sheet);
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() { overlay.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); }
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.append(overlay);
}
