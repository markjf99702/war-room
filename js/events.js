// The news: things that happen to a campaign whether it planned for them or not.
// Each returns a story for the paper and changes the race. The bigger ones (scandals, gaffes, plant
// closings, floods, the late surprise) only land a first blow here; how bad they get depends on how
// the campaigns answer them the following week (see decisions.js).

import { rng } from './rng.js';

const sgn = s => (s === 0 ? 1 : -1);
const last = (state, s) => state.cands[s].last;

const COMPANIES = ['Harrow Steel', 'Calloway Mills', 'Brightline Motors', 'Norland Paper', 'Ferris Glassworks', 'Aldermere Textiles', 'Stannard Tools'];
const GAFFES = ['a nice place to drive through', 'the middle of nowhere', 'where ambition goes to nap', 'lovely, from the train', 'a town with one of everything'];
const VIRAL = ['a speech about a parent’s hardware store', 'a pickup basketball game with high schoolers', 'a stump speech finished in the pouring rain', 'an unplanned stop at a diner counter', 'a heckler won over in forty seconds'];
const SCANDALS = ['taking payments from a ferry contractor', 'lobbying for a mining company', 'hiding a charity’s missing money', 'a donor’s yacht trip', 'padding staff expense claims'];
const SURPRISES = ['an old business deal', 'unpaid taxes on a holiday house', 'a sealed court settlement', 'a letter from a former business partner'];
const ROLES = ['campaign chair', 'finance director', 'chief fundraiser', 'senior adviser'];
const GOOD = [['Hiring beats forecasts for a second month', 'takes the credit'], ['Unemployment falls to its lowest in a decade', 'says the plan is working'],
  ['Factory orders hit a five-year high', 'is claiming the credit'], ['A record harvest lifts the farm towns', 'is happy to take a bow']];
const BAD = [['Prices up, paychecks flat: a gloomy month in the numbers', 'says it’s time for a change'], ['The central bank raises rates for the third time', 'blames the government'],
  ['Petrol hits a record price', 'says families can’t take much more'], ['Two big banks warn of a slowdown', 'says the government saw it coming and did nothing']];
const LOCAL = ['water rates', 'a hospital closing', 'a new bridge toll', 'school consolidation', 'the ferry timetable', 'a wind farm proposal'];
const PAPERS = ['Courier', 'Herald', 'Gazette', 'Sentinel', 'Post-Dispatch', 'Clarion'];

// Returns { stories, triggers }: stories for the paper, and the things that need an answer next week.
export function weekEvents(state, country, plans, w, final = false) {
  const r = rng(`${state.seed}:w${w}:events`);
  const stories = [], triggers = [];
  const regs = state.regions;
  const close = country.regions.map((g, k) => k).filter(k => Math.abs(regs[k].lean + state.mood) < 12);
  const inc = state.incumbent;

  // The last week has no week after it, so nothing that needs an answer happens in it.
  const deck = [
    ['endorse', 3], ['plant', w >= 2 && !final ? 2 : 0], ['jobs', 2], ['scandal', w >= 2 && w !== 7 && !final ? 1.6 : 0],
    ['flood', w >= 3 && !final ? 1.2 : 0], ['local', 2], ['union', 1],
  ].filter(([, wt]) => wt > 0);
  const count = r.chance(0.45) ? 2 : 1;
  const done = new Set();
  for (let n = 0; n < count; n++) {
    let kind;
    do { kind = r.weighted(deck); } while (done.has(kind) && done.size < deck.length);
    done.add(kind);
    const out = STORIES[kind](state, country, r, { close, inc, w });
    if (!out) continue;
    stories.push(out.story);
    if (out.trigger) triggers.push(out.trigger);
  }

  // A late surprise, most years.
  if (w === 7 && r.chance(0.6)) {
    const s = r.int(0, 1);
    const thing = r.pick(SURPRISES);
    state.mood -= sgn(s) * 0.5;
    stories.push({
      tag: 'Late surprise', kind: 'surprise', side: 1 - s, big: true, thing,
      head: `Days before the vote, ${last(state, s)} faces questions over ${thing}`,
      dek: `The story broke on Friday night. How ${last(state, s)} answers it this week could decide the race.`,
      fx: `${last(state, s)} down about 0.5 so far`,
    });
    triggers.push({ kind: 'surprise', side: s, thing });
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
        const quote = gr.pick(GAFFES);
        // In the final week there's no time to answer, so it lands in full.
        const hit = final ? 1.5 : 1.0;
        regs[k].evt -= sgn(s) * hit;
        state.mood -= sgn(s) * (final ? 0.3 : 0.2);
        stories.push({ tag: 'Gaffe', kind: 'gaffe', side: 1 - s, region: k, head: `${name}, on a hot mic, calls ${place} “${quote}”`,
          dek: `The clip ran all week in ${place}. ${final ? 'There was no time left to repair it.' : 'Both campaigns have to decide what to do with it.'}`,
          fx: `${name} down ${hit.toFixed(1)} in ${place}${final ? ', a little everywhere' : ' so far'}` });
        if (!final) triggers.push({ kind: 'gaffe', side: s, region: k, who, quote });
      } else if (who === 'cand' && gr.chance(0.06)) {
        state.mood += sgn(s) * 0.5;
        stories.push({ tag: 'On the trail', side: s, region: k, head: `${name}’s stop in ${place} goes viral`,
          dek: `Video of ${gr.pick(VIRAL)} has been watched millions of times.`, fx: `${name} up about half a point everywhere` });
      }
    }
  }
  return { stories, triggers };
}

const STORIES = {
  endorse(state, country, r, { close }) {
    if (!close.length) return null;
    const k = r.pick(close), s = r.int(0, 1), g = country.regions[k];
    const who = r.chance(0.5) ? `The ${g.name} ${r.pick(PAPERS)}` : `${g.name}’s popular former governor`;
    state.regions[k].evt += sgn(s) * 1.5;
    return { story: { tag: 'Endorsement', side: s, region: k, head: `${who} backs ${last(state, s)}`,
      dek: `A boost in ${g.name}, where it counts for ${g.electors} electors.`, fx: `${last(state, s)} up 1.5 in ${g.name}` } };
  },
  plant(state, country, r, { inc }) {
    const pool = country.regions.filter(g => g.urban < 0.6);
    const g = r.pick(pool);
    const jobs = r.int(4, 22) * 100;
    const company = r.pick(COMPANIES);
    state.regions[g.id].evt -= sgn(inc) * 1.0;
    state.mood -= sgn(inc) * 0.2;
    return {
      story: { tag: 'Economy', kind: 'plant', side: 1 - inc, region: g.id, jobs, company,
        head: `${company} to close its ${g.name} plant; ${jobs.toLocaleString('en-US')} jobs go`,
        dek: `Voters there blame the party in power, ${last(state, inc)}’s. Both campaigns have to say what they’d do.`,
        fx: `${last(state, inc)} (the party in power) down 1.0 in ${g.name} so far` },
      trigger: { kind: 'plant', region: g.id, jobs, company },
    };
  },
  jobs(state, country, r, { inc }) {
    const good = r.chance(0.5);
    const d = r.range(0.4, 0.8);
    state.mood += sgn(inc) * (good ? d : -d);
    // Each headline once per campaign.
    state.used = state.used || [];
    const pool = (good ? GOOD : BAD).filter(([h]) => !state.used.includes(h));
    const [head, says] = pool.length ? r.pick(pool) : r.pick(good ? GOOD : BAD);
    state.used.push(head);
    return { story: good
      ? { tag: 'Economy', side: inc, head, dek: `${last(state, inc)}’s party, in power, ${says}.`, fx: `${last(state, inc)} up about ${d.toFixed(1)} everywhere` }
      : { tag: 'Economy', side: 1 - inc, head, dek: `${last(state, 1 - inc)} ${says}.`, fx: `${last(state, inc)} (the party in power) down about ${d.toFixed(1)} everywhere` } };
  },
  scandal(state, country, r) {
    // Scandals take turns: the side that had the last one is less likely to have the next.
    const prev = state.history.flatMap(e => e.news).filter(n => n.kind === 'scandal').at(-1);
    const s = prev ? (r.chance(0.75) ? prev.side : 1 - prev.side) : r.int(0, 1);
    const thing = r.pick(SCANDALS);
    const role = r.pick(ROLES);
    state.mood -= sgn(s) * 0.3;
    return {
      story: { tag: 'Scandal', kind: 'scandal', side: 1 - s, thing, role, head: `${last(state, s)}’s ${role} accused of ${thing}`,
        dek: 'The story broke on a Friday. What the campaign does about it this week will decide how big it gets.', fx: `${last(state, s)} down about 0.3 so far` },
      trigger: { kind: 'scandal', side: s, thing, role },
    };
  },
  flood(state, country, r, { inc }) {
    const g = r.pick(country.regions.filter(x => x.coastal));
    return {
      story: { tag: 'Weather', kind: 'flood', region: g.id, head: `Floods in ${g.name}`,
        dek: `The river came over the defences on Saturday. ${last(state, inc)}’s party runs the relief effort; both campaigns are deciding how to respond.`,
        fx: `Nothing has moved yet` },
      trigger: { kind: 'flood', region: g.id },
    };
  },
  local(state, country, r, { inc }) {
    const g = r.pick(country.regions);
    state.regions[g.id].und += 3;
    state.regions[g.id].evt -= sgn(inc) * 0.5;
    return { story: { tag: 'Local', region: g.id, head: `Anger over ${r.pick(LOCAL)} shakes up ${g.name}`,
      dek: 'Voters who had made up their minds are listening again: more undecideds there, for now.', fx: `${g.name} has more undecided voters` } };
  },
  union(state, country, r) {
    const s = r.int(0, 1);
    const rural = country.regions.filter(g => g.urban < -0.4);
    for (const g of rural) state.regions[g.id].evt += sgn(s) * 0.6;
    return { story: { tag: 'Endorsement', side: s, head: `The Farmers’ Union endorses ${last(state, s)}`,
      dek: `It counts in the ${rural.length} most rural regions.`, fx: `${last(state, s)} up 0.6 across the countryside` } };
  },
};

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
