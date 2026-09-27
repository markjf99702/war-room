// The news: things that happen to a campaign whether it planned for them or not.
// Each returns a story for the paper and changes the race.

import { rng } from './rng.js';

const sgn = s => (s === 0 ? 1 : -1);
const last = (state, s) => state.cands[s].last;

const COMPANIES = ['Harrow Steel', 'Calloway Mills', 'Brightline Motors', 'Norland Paper', 'Ferris Glassworks', 'Aldermere Textiles', 'Stannard Tools'];
const GAFFES = ['a nice place to drive through', 'the middle of nowhere', 'where ambition goes to nap', 'lovely, from the train', 'a town with one of everything'];
const VIRAL = ['a speech about a parent’s hardware store', 'a pickup basketball game with high schoolers', 'a stump speech finished in the pouring rain', 'an unplanned stop at a diner counter', 'a heckler won over in forty seconds'];
const SCANDALS = ['undisclosed lobbying work', 'a leaked strategy memo', 'a charity’s missing books', 'a donor’s yacht trip', 'staff expense reports'];
const LOCAL = ['water rates', 'a hospital closing', 'a new bridge toll', 'school consolidation', 'the ferry timetable', 'a wind farm proposal'];
const PAPERS = ['Courier', 'Herald', 'Gazette', 'Sentinel', 'Post-Dispatch', 'Clarion'];

export function weekEvents(state, country, plans, w) {
  const r = rng(`${state.seed}:w${w}:events`);
  const out = [];
  const regs = state.regions;
  const close = country.regions.map((g, k) => k).filter(k => Math.abs(regs[k].lean + state.mood) < 12);
  const inc = state.incumbent;

  const deck = [
    ['endorse', 3], ['plant', w >= 2 ? 2 : 0], ['jobs', 2], ['scandal', w >= 3 ? 1.5 : 0],
    ['flood', w >= 3 && w <= 7 ? 1.2 : 0], ['local', 2], ['union', 1],
  ].filter(([, wt]) => wt > 0);
  const count = r.chance(0.45) ? 2 : 1;
  const done = new Set();
  for (let n = 0; n < count; n++) {
    let kind;
    do { kind = r.weighted(deck); } while (done.has(kind) && done.size < deck.length);
    done.add(kind);
    const story = STORIES[kind](state, country, r, { close, inc, w });
    if (story) out.push(story);
  }

  // A late surprise, most years.
  if (w === 7 && r.chance(0.6)) {
    const s = r.int(0, 1);
    const hit = r.range(1.1, 1.7);
    state.mood -= sgn(s) * hit;
    out.push({
      tag: 'Late surprise', side: s, big: true,
      head: `Days before the vote, ${last(state, s)} faces questions over ${r.pick(SCANDALS)}`,
      dek: `The story broke on a Friday night. Both campaigns spent the weekend on it; ${last(state, 1 - s)}’s team kept quiet and let it run.`,
      fx: `${state.cands[s].last} down about ${hit.toFixed(1)} points everywhere`,
    });
  }

  // Gaffes and viral moments happen where the candidates actually went.
  for (const s of [0, 1]) {
    const gr = rng(`${state.seed}:w${w}:trail:${s}`);
    for (const who of ['cand', 'mate']) {
      const k = plans[s][who];
      if (!Number.isInteger(k)) continue;
      const name = who === 'cand' ? last(state, s) : state.mates[s].last;
      const place = country.regions[k].name;
      if (gr.chance(who === 'cand' ? 0.07 : 0.06)) {
        regs[k].evt -= sgn(s) * 1.5;
        state.mood -= sgn(s) * 0.3;
        out.push({ tag: 'Gaffe', side: s, region: k, head: `${name}, on a hot mic, calls ${place} “${gr.pick(GAFFES)}”`,
          dek: `The clip ran all week in ${place}. ${who === 'mate' ? `${last(state, s)} said the running mate “was joking, badly.”` : 'The campaign says it was taken out of context.'}`,
          fx: `${name} down 1.5 in ${place}, a little everywhere` });
      } else if (who === 'cand' && gr.chance(0.06)) {
        state.mood += sgn(s) * 0.5;
        out.push({ tag: 'On the trail', side: s, region: k, head: `${name}’s stop in ${place} goes viral`,
          dek: `Video of ${gr.pick(VIRAL)} has been watched millions of times.`, fx: `${name} up about half a point everywhere` });
      }
    }
  }
  return out;
}

const STORIES = {
  endorse(state, country, r, { close }) {
    if (!close.length) return null;
    const k = r.pick(close), s = r.int(0, 1), g = country.regions[k];
    const who = r.chance(0.5) ? `The ${g.name} ${r.pick(PAPERS)}` : `${g.name}’s popular former governor`;
    state.regions[k].evt += sgn(s) * 1.5;
    return { tag: 'Endorsement', side: s, region: k, head: `${who} backs ${last(state, s)}`,
      dek: `A boost in ${g.name}, where it counts for ${g.electors} electors.`, fx: `${last(state, s)} up 1.5 in ${g.name}` };
  },
  plant(state, country, r, { inc }) {
    const pool = country.regions.filter(g => g.urban < 0.6);
    const g = r.pick(pool);
    const jobs = r.int(4, 22) * 100;
    state.regions[g.id].evt -= sgn(inc) * 1.8;
    state.mood -= sgn(inc) * 0.3;
    return { tag: 'Economy', side: 1 - inc, region: g.id, head: `${r.pick(COMPANIES)} to close its ${g.name} plant; ${jobs.toLocaleString('en-US')} jobs go`,
      dek: `Voters there blame the party in power. ${last(state, 1 - inc)} was at the gates by lunchtime.`, fx: `${last(state, inc)} (the party in power) down 1.8 in ${g.name}` };
  },
  jobs(state, country, r, { inc }) {
    const good = r.chance(0.5);
    const d = r.range(0.4, 0.8);
    state.mood += sgn(inc) * (good ? d : -d);
    return good
      ? { tag: 'Economy', side: inc, head: 'Hiring beats forecasts for a second month', dek: `${last(state, inc)}’s party, in power, takes the credit.`, fx: `${last(state, inc)} up about ${d.toFixed(1)} everywhere` }
      : { tag: 'Economy', side: 1 - inc, head: 'Prices up, paychecks flat: a gloomy month in the numbers', dek: `${last(state, 1 - inc)} says it’s time for a change.`, fx: `${last(state, inc)} (the party in power) down about ${d.toFixed(1)} everywhere` };
  },
  scandal(state, country, r) {
    const s = r.int(0, 1), d = r.range(0.6, 1.1);
    state.mood -= sgn(s) * d;
    return { tag: 'Scandal', side: s, head: `${last(state, s)}’s campaign chair resigns over ${r.pick(SCANDALS)}`,
      dek: 'The campaign calls it a distraction. The story ran for four days.', fx: `${last(state, s)} down about ${d.toFixed(1)} everywhere` };
  },
  flood(state, country, r, { inc }) {
    const g = r.pick(country.regions.filter(x => x.coastal));
    const well = r.chance(0.5);
    const d = well ? 1.2 : -1.2;
    state.regions[g.id].evt += sgn(inc) * d;
    for (const nb of g.neighbors) state.regions[nb].evt += sgn(inc) * d * 0.35;
    return { tag: 'Weather', side: well ? inc : 1 - inc, region: g.id,
      head: well ? `Floods in ${g.name}; the government’s response wins praise` : `Floods in ${g.name}; residents say help came too slowly`,
      dek: `The party in power is ${last(state, inc)}’s. ${well ? 'The relief effort is being talked up.' : 'The other side is making the most of it.'}`,
      fx: `${last(state, inc)} ${well ? 'up' : 'down'} 1.2 in ${g.name}, a little around it` };
  },
  local(state, country, r, { inc }) {
    const g = r.pick(country.regions);
    state.regions[g.id].und += 3;
    state.regions[g.id].evt -= sgn(inc) * 0.5;
    return { tag: 'Local', region: g.id, head: `Anger over ${r.pick(LOCAL)} shakes up ${g.name}`,
      dek: 'Voters who had made up their minds are listening again: more undecideds there, for now.', fx: `${g.name} has more undecided voters` };
  },
  union(state, country, r) {
    const s = r.int(0, 1);
    const rural = country.regions.filter(g => g.urban < -0.4);
    for (const g of rural) state.regions[g.id].evt += sgn(s) * 0.6;
    return { tag: 'Endorsement', side: s, head: `The Farmers’ Union endorses ${last(state, s)}`,
      dek: `It counts in the ${rural.length} most rural regions.`, fx: `${last(state, s)} up 0.6 across the countryside` };
  },
};

export function debate(state, country, plans, w) {
  const r = rng(`${state.seed}:w${w}:debate`);
  const nth = w <= 3 ? 'first' : 'second';
  let p0 = 0.5 + 0.2 * ((plans[0].cand === 'prep') - (plans[1].cand === 'prep'));
  p0 += 0.1 * ((state.mates[0]?.trait === 'debater') - (state.mates[1]?.trait === 'debater'));
  const x = r();
  let winner = null;
  if (x < p0 - 0.07) winner = 0;
  else if (x > p0 + 0.07) winner = 1;
  const prepped = [0, 1].filter(s => plans[s].cand === 'prep').map(s => last(state, s));
  const prepLine = prepped.length ? `${prepped.join(' and ')} spent the week in debate prep. ` : '';
  if (winner === null) {
    return { tag: 'Debate', big: true, head: `The ${nth} debate: no knockout`, dek: `${prepLine}Snap polls call it a draw. Neither side moved.`, fx: 'No change' };
  }
  const bump = r.range(1.0, 1.8);
  state.mood += sgn(winner) * bump;
  state.regions.forEach(rs => { rs.und = Math.max(1.5, rs.und - 1); });
  const a = Math.round(52 + bump * 5 + r.range(-3, 3)), b = 100 - a - r.int(6, 12);
  return { tag: 'Debate', side: winner, big: true, head: `${last(state, winner)} wins the ${nth} debate, ${a}% to ${b}% in a snap poll`,
    dek: `${prepLine}${last(state, 1 - winner)} looked ${r.pick(['tired', 'rattled', 'over-rehearsed', 'defensive'])}.`, fx: `${last(state, winner)} up about ${bump.toFixed(1)} everywhere` };
}

export function finalWeather(state, country, w) {
  const r = rng(`${state.seed}:w${w}:weather`);
  if (!r.chance(0.55)) return null;
  const north = r.chance(0.5);
  const rain = country.regions.filter(g => (north ? g.north > 0.55 : g.north < 0.45)).map(g => g.id);
  state.rain = rain;
  return { tag: 'Weather', head: `Forecast: heavy rain across the ${north ? 'north' : 'south'} on election day`,
    dek: 'Casual voters stay home in the rain. Campaigns with field offices there will still get their people out.',
    fx: `Rain in ${rain.length} regions on the day` };
}
