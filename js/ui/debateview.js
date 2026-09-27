// A debate you take part in: four questions, pick how to answer each, see how the rival answered.

import { h } from './dom.js';
import { STYLES, STYLE_KEYS, TEMPERS, debateSetup, autoAnswers, exchange, debateOutcome, fitFor, whyText, TOPIC_NAMES } from '../debate.js';

export function renderDebate(root, ctx, { plans, onDone }) {
  const { country, state: st } = ctx;
  const me = st.side, them = 1 - me;
  document.querySelector('.toast')?.remove();
  const setup = debateSetup(st, country, st.week);
  const prepped = plans.map(p => p.cand === 'prep');
  const rivalAnswers = autoAnswers(st, country, setup, them);
  const mine = [];
  const you = st.cands[me], rival = st.cands[them];
  const myTemper = TEMPERS[you.temper], theirTemper = TEMPERS[rival.temper];
  const sg = x => (me === 0 ? x : -x);
  let running = 0;

  const meter = h('div', { class: 'db-meter-fill' });
  const meterNum = h('div', { class: 'db-meter-num num' }, 'Even');
  const stage = h('div', { class: 'db-stage' });
  const log = h('ol', { class: 'db-log' });

  const scouting = prepped[me]
    ? h('div', { class: 'db-report' },
      h('b', {}, 'Scouting report. '),
      `${rival.last} is ${theirTemper.label}: ${STYLES[theirTemper.natural].short} on about half the questions in the tapes you watched. `,
      `Tonight’s topics: ${setup.topics.map(t => TOPIC_NAMES[t.key]).join(', ')}.`)
    : h('div', { class: 'db-report' },
      h('b', {}, 'No prep this week. '),
      `You don’t know how ${rival.last} likes to answer. Watch the first couple of questions and adjust.`);

  const loop = h('p', { class: 'db-loop' },
    'An attack flattens a list of figures · figures expose a dodge · a plan beats an anecdote · a story makes an attack look cruel.');

  root.append(h('main', { class: 'night debate' }, h('div', { class: 'night-inner' },
    h('div', { class: 'nt-top' },
      h('span', { class: 'nt-title' }, `The ${setup.nth} debate`), h('span', { class: 'nt-live' }, 'LIVE'),
      h('span', { class: 'db-venue' }, setup.venue)),
    h('div', { class: 'db-podiums' },
      h('div', { class: `db-pod side${me}` }, h('span', {}, `${you.name} (you)`), h('small', {}, `${cap(myTemper.label)}. ${cap(STYLES[myTemper.natural].short.replace(/^went|^walked|^pivoted|^told/, m => ({ went: 'Going', walked: 'Walking', pivoted: 'Pivoting', told: 'Telling' })[m]))} comes naturally.`)),
      h('div', { class: `db-pod side${them}` }, h('span', {}, rival.name), h('small', {}, prepped[them] ? 'Spent the week preparing.' : 'Was out on the trail this week.'))),
    h('div', { class: 'db-meter', 'aria-label': 'Focus group' }, h('div', { class: 'db-meter-mid' }), meter, meterNum),
    scouting,
    stage,
    log)));

  function ask(i) {
    const t = setup.topics[i];
    const btns = STYLE_KEYS.map(k => {
      const fit = fitFor(st, country, setup, i, me, k);
      const tags = [];
      if (fit >= 0.9) tags.push('Suits this question');
      else if (fit <= -0.4) tags.push('Risky on this one');
      if (k === myTemper.natural) tags.push('Your natural style');
      return h('button', { type: 'button', class: 'db-answer', onclick: () => answer(i, k) },
        h('b', {}, STYLES[k].label), tags.length ? h('small', {}, tags.join(' · ')) : null);
    });
    stage.replaceChildren(
      h('div', { class: 'db-q' }, h('div', { class: 'db-qn' }, `Question ${i + 1} of ${setup.topics.length}`), h('p', {}, `“${t.q}”`)),
      h('div', { class: 'db-answers' }, btns),
      loop);
    stage.querySelector('.db-answer').focus({ preventScroll: true });
  }

  function answer(i, k) {
    mine[i] = k;
    const answers = me === 0 ? [mine, rivalAnswers] : [rivalAnswers, mine];
    const ex = exchange(st, country, setup, i, answers, prepped);
    const pts = sg(ex.score);
    running += pts;
    const dial = Math.round(pts * 3);
    const verdict = Math.abs(dial) < 2 ? 'The focus group barely moved.' : `Focus group: ${dial > 0 ? '+' : '−'}${Math.abs(dial)} for ${dial > 0 ? you.last : rival.last}.`;
    const why = whyText(ex.why, s => (s === me ? 'You' : rival.last)).replace('You’s', 'Your');
    stage.replaceChildren(
      h('div', { class: 'db-q' }, h('div', { class: 'db-qn' }, `Question ${i + 1} of ${setup.topics.length}`), h('p', {}, `“${setup.topics[i].q}”`)),
      h('div', { class: `db-result ${pts > 0.5 ? 'won' : pts < -0.5 ? 'lost' : ''}` },
        h('p', {}, h('b', {}, 'You '), STYLES[k].short, '. ', h('b', {}, `${rival.last} `), STYLES[rivalAnswers[i]].short, '.'),
        h('p', {}, why),
        h('p', { class: 'db-verdict' }, verdict)),
      i + 1 < setup.topics.length
        ? h('button', { type: 'button', class: 'btn big', onclick: () => ask(i + 1) }, 'Next question →')
        : h('button', { type: 'button', class: 'btn big', onclick: finish }, 'Closing statements →'));
    stage.querySelector('.btn').focus({ preventScroll: true });
    log.append(h('li', {}, h('span', {}, `Q${i + 1}`), ` You ${STYLES[k].short}; ${rival.last} ${STYLES[rivalAnswers[i]].short}. `, h('b', { class: pts > 0.5 ? 'won' : pts < -0.5 ? 'lost' : '' }, dial > 0 ? `+${dial}` : dial < 0 ? `−${Math.abs(dial)}` : '0')));
    const width = Math.max(-1, Math.min(1, running / 14));
    meter.style.left = width >= 0 ? '50%' : `${50 + width * 50}%`;
    meter.style.width = `${Math.abs(width) * 50}%`;
    meter.style.background = running >= 0 ? 'var(--mine)' : 'var(--theirs)';
    meterNum.textContent = Math.abs(running) < 1.5 ? 'Too close to call' : `${running > 0 ? you.last : rival.last} ahead`;
  }

  function finish() {
    const answers = me === 0 ? [mine, rivalAnswers] : [rivalAnswers, mine];
    const out = debateOutcome(st, country, setup, answers, prepped);
    const won = out.winner === me, lost = out.winner === them;
    stage.replaceChildren(
      h('div', { class: `db-result big ${won ? 'won' : lost ? 'lost' : ''}` },
        h('div', { class: 'db-qn' }, 'Snap poll: who won?'),
        h('p', { class: 'db-snap num' }, `${you.last} ${out.snap[me]}% · ${rival.last} ${out.snap[them]}%`),
        h('p', {}, won ? `A win. Expect about +${out.bump.toFixed(1)} everywhere by Monday.` : lost ? `A loss. Expect about −${out.bump.toFixed(1)} everywhere by Monday.` : 'A draw. Nobody moved.')),
      h('button', { type: 'button', class: 'btn big', onclick: () => onDone(mine) }, 'On to Monday’s paper →'));
    stage.querySelector('.btn').focus({ preventScroll: true });
  }

  ask(0);
}

const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
