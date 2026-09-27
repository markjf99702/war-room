// The debates. Four questions; for each, both candidates pick how to answer. Styles beat each other
// in a loop (an attack flattens a list of figures, figures expose a dodge, a plan beats an anecdote,
// and a good story makes an attack look cruel), some suit a question better than others, and every
// candidate has a natural style they lean on. You can't see the rival's answer until they've given it.

import { rng } from './rng.js';

export const STYLES = {
  attack: { label: 'Go on the attack', short: 'went on the attack' },
  facts: { label: 'Walk through the facts', short: 'walked through the facts' },
  plan: { label: 'Pivot to your plan', short: 'pivoted to the plan' },
  story: { label: 'Tell a story', short: 'told a story' },
};
export const STYLE_KEYS = Object.keys(STYLES);
export const TOPIC_NAMES = {
  character: 'character', local: 'the plant closing', flood: 'the floods', strike: 'the dock strike', economy: 'the economy',
  record: 'the government’s record', safety: 'crime', towns: 'the small towns', rents: 'city rents', vesland: 'Vesland', swing: 'a swing region',
};
const BEATS = { attack: 'facts', facts: 'plan', plan: 'story', story: 'attack' };
const WHY = {
  attack: 'The attack landed while the other side was reciting numbers.',
  facts: 'The figures showed the other answer up as a dodge.',
  plan: 'Voters wanted to hear what you’d do, not a story.',
  story: 'Next to a real story, the attack looked cruel.',
};

export const TEMPERS = {
  brawler: { label: 'a brawler', natural: 'attack', weights: { attack: 0.55, facts: 0.15, plan: 0.15, story: 0.15 } },
  wonk: { label: 'a policy wonk', natural: 'facts', weights: { facts: 0.55, plan: 0.15, attack: 0.15, story: 0.15 } },
  charmer: { label: 'a storyteller', natural: 'story', weights: { story: 0.55, plan: 0.15, attack: 0.15, facts: 0.15 } },
  messenger: { label: 'relentlessly on message', natural: 'plan', weights: { plan: 0.55, facts: 0.15, attack: 0.15, story: 0.15 } },
};

// The topics, and which answers suit them.
function topicList(state, country, week) {
  const inc = state.incumbent;
  const incParty = ['Tidewater', 'Highland'][inc];
  const past = state.history.filter(e => e.week < week);
  const news = past.flatMap(e => e.news);
  const plant = [...news].reverse().find(n => n.kind === 'plant');
  const scandal = [...news].reverse().find(n => n.kind === 'scandal');
  const flood = [...news].reverse().find(n => n.kind === 'flood');
  const strike = [...news].reverse().find(n => n.kind === 'strike');
  const metro = country.regions.find(g => g.metro === 0)?.name || 'the capital';
  const swing = [...country.regions].sort((a, b) => Math.abs(state.regions[a.id].lean) - Math.abs(state.regions[b.id].lean))[0];
  const T = [];
  // (A news story's side is the side it helps, so the scandal hit the other one.)
  if (scandal) T.push({ key: 'character', priority: 3, scandalSide: 1 - scandal.side,
    q: `${state.cands[1 - scandal.side].last}, your ${scandal.role || 'campaign chair'} was accused of ${scandal.thing}. Why should anyone trust your judgment?`,
    fit: s => ({ story: 1, plan: 0.3, attack: s === 1 - scandal.side ? -1 : 0.5, facts: 0 }) });
  if (plant) T.push({ key: 'local', priority: 3,
    q: `${plant.jobs.toLocaleString('en-US')} jobs just left ${country.regions[plant.region].name}. What do you say to those workers tonight?`,
    fit: () => ({ story: 1, plan: 0.6, attack: 0, facts: -0.3 }) });
  if (strike) T.push({ key: 'strike', priority: 2,
    q: `The docks in ${country.regions[strike.region].name} have been shut for weeks. Whose side are you on?`,
    fit: () => ({ plan: 1, story: 0.5, facts: 0.3, attack: -0.3 }) });
  if (flood) T.push({ key: 'flood', priority: 2,
    q: `Homes in ${country.regions[flood.region].name} are still under water. Was the government ready?`,
    fit: s => ({ attack: s === inc ? -0.5 : 1, facts: s === inc ? 1 : 0, story: 0.5, plan: 0.3 }) });
  T.push(
    { key: 'economy', priority: 1, q: 'Prices are up and paychecks aren’t. What would you do about it on your first day?', fit: () => ({ facts: 1, plan: 0.6, attack: 0, story: 0 }) },
    { key: 'record', priority: 1, q: `The ${incParty} Party has had the presidency for four years. Is the country better off?`, fit: s => (s === inc ? { facts: 1, plan: 0.4, attack: -0.3, story: 0 } : { attack: 1, story: 0.3, facts: 0.3, plan: 0 }) },
    { key: 'safety', priority: 1, q: `Crime in ${metro} is up for the third year running. What’s your answer?`, fit: () => ({ plan: 1, story: 0.5, facts: 0, attack: 0 }) },
    { key: 'towns', priority: 1, q: 'Towns across the hill country say both parties forgot them. Why should they believe you?', fit: () => ({ story: 1, plan: 0.4, facts: 0, attack: -0.3 }) },
    { key: 'rents', priority: 1, q: 'Rents in the cities are up a fifth in two years. What would you actually do?', fit: () => ({ plan: 1, facts: 0.6, story: 0, attack: 0 }) },
    { key: 'vesland', priority: 1, q: 'Vesland is turning back our fishing boats. How would you handle it?', fit: () => ({ facts: 1, attack: 0.5, plan: 0.3, story: -0.3 }) },
    { key: 'swing', priority: 1, q: `${swing.name} has voted for the winner every time for forty years. What’s your message to them?`, fit: () => ({ story: 1, plan: 0.5, attack: 0, facts: 0 }) },
  );
  return T;
}

export function debateSetup(state, country, week) {
  const r = rng(`${state.seed}:debate:${week}`);
  const all = topicList(state, country, week);
  const top = all.filter(t => t.priority >= 2);
  const rest = r.shuffle(all.filter(t => t.priority < 2));
  const topics = [...top, ...rest].slice(0, 4);
  r.shuffle(topics);
  const venue = r.pick(['Carrowmouth Civic Hall', 'the Kingsferry Corn Exchange', 'New Aldham University', 'the Port Ansel Playhouse']);
  return { week, nth: week <= 3 ? 'first' : 'second', venue, topics: topics.map(t => ({ key: t.key, q: t.q })) };
}

function fitOf(state, country, week, topicKey, s, style) {
  const t = topicList(state, country, week).find(x => x.key === topicKey);
  return t ? t.fit(s)[style] || 0 : 0;
}

// How a side answers when the computer is choosing: its natural style, bent toward what suits the question.
export function autoAnswers(state, country, setup, s, salt = '') {
  const r = rng(`${state.seed}:debate:${setup.week}:answers:${s}${salt}`);
  const temper = TEMPERS[state.cands[s].temper];
  return setup.topics.map(t => {
    const w = STYLE_KEYS.map(k => [k, temper.weights[k] * Math.exp(0.5 * fitOf(state, country, setup.week, t.key, s, k))]);
    return r.weighted(w);
  });
}

// One exchange, scored in points for side s (positive: s won it).
export function exchange(state, country, setup, i, answers, prepped) {
  const t = setup.topics[i];
  const r = rng(`${state.seed}:debate:${setup.week}:q${i}`);
  const noise = r.gauss() * 1.0;
  const a = answers[0][i], b = answers[1][i];
  const beat = BEATS[a] === b ? 2.5 : BEATS[b] === a ? -2.5 : 0;
  const fit = 1.2 * (fitOf(state, country, setup.week, t.key, 0, a) - fitOf(state, country, setup.week, t.key, 1, b));
  const nat = 0.6 * ((a === TEMPERS[state.cands[0].temper].natural) - (b === TEMPERS[state.cands[1].temper].natural));
  const prep = 0.6 * ((prepped[0] ? 1 : 0) - (prepped[1] ? 1 : 0));
  const coach = 0.6 * ((state.mates[0]?.trait === 'debater') - (state.mates[1]?.trait === 'debater'));
  const score = beat + fit + nat + prep + coach + noise; // for Tidewater
  // Explain it by whatever did the most to tip it the way it went.
  const side = score > 0 ? 0 : 1, sg = score > 0 ? 1 : -1;
  const reasons = [
    [beat * sg, WHY[side === 0 ? a : b]],
    [fit * sg, `{${side}} gave the answer that suited the question.`],
    [nat * sg, `{${side}} looked at home answering that way.`],
    [(prep + coach) * sg, `{${side}}’s preparation showed.`],
  ].filter(([v]) => v > 0.3).sort((x, y) => y[0] - x[0]);
  const why = Math.abs(score) < 0.8 ? 'Neither answer really landed.' : reasons.length ? reasons[0][1] : `{${side}} just came across better.`;
  return { score, why, styles: [a, b] };
}

export function debateOutcome(state, country, setup, answers, prepped) {
  const ex = setup.topics.map((t, i) => exchange(state, country, setup, i, answers, prepped));
  const total = ex.reduce((a, e) => a + e.score, 0);
  const winner = Math.abs(total) < 1.5 ? null : total > 0 ? 0 : 1;
  const bump = winner === null ? 0 : Math.min(2.2, 0.6 + Math.abs(total) * 0.15);
  const lead = Math.min(40, Math.round(Math.abs(total) * 2.2));
  const undecided = 8 + rng(`${state.seed}:debate:${setup.week}:snap`).int(0, 6);
  const hi = Math.round((100 - undecided + lead) / 2), lo = 100 - undecided - hi;
  return { exchanges: ex, total, winner, bump, snap: winner === null ? [Math.round((100 - undecided) / 2), Math.round((100 - undecided) / 2)] : winner === 0 ? [hi, lo] : [lo, hi] };
}

// For the paper.
export function debateStory(state, setup, outcome, prepped) {
  const nm = s => state.cands[s].last;
  const prepLine = [0, 1].filter(s => prepped[s]).map(nm);
  const pre = prepLine.length ? `${prepLine.join(' and ')} spent the week in debate prep. ` : '';
  const best = outcome.exchanges.map((e, i) => ({ e, i })).sort((a, b) => Math.abs(b.e.score) - Math.abs(a.e.score))[0];
  const moment = best ? `The moment of the night came on ${setup.topics[best.i].key === 'character' ? 'the character question' : 'question ' + (best.i + 1)}: ${nm(best.e.score > 0 ? 0 : 1)} ${STYLES[best.e.styles[best.e.score > 0 ? 0 : 1]].short}. ${whyText(best.e.why, nm)}` : '';
  if (outcome.winner === null) {
    return { tag: 'Debate', kind: 'debate', big: true, head: `The ${setup.nth} debate: no knockout`, dek: `${pre}Snap polls call it a draw, ${outcome.snap[0]}% to ${outcome.snap[1]}%. ${moment}`, fx: 'No change' };
  }
  const w = outcome.winner;
  return { tag: 'Debate', kind: 'debate', side: w, big: true,
    head: `${nm(w)} wins the ${setup.nth} debate, ${Math.max(...outcome.snap)}% to ${Math.min(...outcome.snap)}% in a snap poll`,
    dek: `${pre}${moment}`, fx: `${nm(w)} up about ${outcome.bump.toFixed(1)} everywhere` };
}

// How well answering question i in a given style suits side s (for the hints on the buttons).
export function fitFor(state, country, setup, i, s, style) {
  return fitOf(state, country, setup.week, setup.topics[i].key, s, style);
}

// Puts names into an exchange's explanation ({0} is Tidewater's candidate, {1} Highland's).
export function whyText(why, name) {
  return why.replace(/\{([01])\}/g, (m, s) => name(+s));
}
