// Your calls: the decisions the news forces on a campaign. A scandal, a gaffe, a plant closing, a
// flood, a late surprise, or an issue everyone suddenly has to take a side on. Each option says what
// it's likely to do; some are sure things and some are gambles. A side decides at the start of a week
// and finds out how it played at the end of it.

import { rng } from './rng.js';

const sgn = s => (s === 0 ? 1 : -1);
export const PARTY_NAMES = ['Tidewater', 'Highland'];

const STAFF = ['Tom Reyes', 'Alan Pryce', 'Dana Whitlock', 'Gregor Hale', 'Marion Stroud', 'Neil Garrity', 'Joyce Fennimore', 'Carl Ostrander'];

// ---------------------------------------------------------------- which regions an effect touches

export function regionsWhere(country, filter) {
  const R = country.regions;
  if (Array.isArray(filter)) return filter;
  if (filter.startsWith('r:')) return [+filter.slice(2)];
  if (filter.startsWith('nb:')) return [...R[+filter.slice(3)].neighbors];
  const test = {
    all: () => true,
    north: g => g.north >= 0.6,
    south: g => g.north <= 0.4,
    coast: g => g.coastal,
    fishing: g => g.coastal && g.metro < 0,
    inland: g => !g.coastal,
    rural: g => g.urban < -0.4,
    urban: g => g.urban > 0.5,
    metro: g => g.metro >= 0,
    east: g => g.east >= 0.6,
    west: g => g.east <= 0.4,
  }[filter];
  return R.filter(g => test(g)).map(g => g.id);
}

const byName = (country, name) => country.regions.find(g => g.name === name)?.id ?? 0;

// ---------------------------------------------------------------- issues everyone takes a side on

// Effects are in points for whichever campaign takes that position.
export const ISSUES = [
  {
    key: 'rail', title: 'The Northern Rail Link',
    text: 'A new line across the north, from Kingsferry to the coast. The interior wants it; the cities call it money for somebody else’s commute.',
    options: [
      { key: 'back', label: 'Back it', fx: [['north', 1.4], ['metro', -0.5]], says: 'Up in the north, down a little in the big cities.' },
      { key: 'oppose', label: 'Oppose it', fx: [['metro', 0.7], ['north', -1.2]], says: 'Up in the cities, down in the north.' },
      { key: 'study', label: 'Call for a study', fx: [['all', -0.1]], says: 'Nobody’s angry and nobody’s moved.' },
    ],
  },
  {
    key: 'fishing', title: 'Fishing quotas',
    text: 'Scientists want the catch cut by a third to save the cod. The fishing towns say it would finish them.',
    options: [
      { key: 'towns', label: 'Stand with the fishing towns', fx: [['fishing', 1.2], ['urban', -0.4]], says: 'Up along the coast, down a little in the cities.' },
      { key: 'science', label: 'Back the scientists', fx: [['urban', 0.8], ['fishing', -1.1]], says: 'Up in the cities, down in the fishing towns.' },
      { key: 'pay', label: 'Cut the catch and pay the boats', cost: 3, fx: [['fishing', 0.4], ['urban', 0.4]], says: 'A little up almost everywhere it matters, for $3M.' },
    ],
  },
  {
    key: 'farms', title: 'Drought payments for farmers',
    text: 'The relief payments run out in December. Farmers want them extended; the treasury wants them gone.',
    options: [
      { key: 'extend', label: 'Extend them', fx: [['rural', 1.2], ['urban', -0.5]], says: 'Up in the countryside, down in the cities.' },
      { key: 'end', label: 'Let them end', fx: [['urban', 0.7], ['rural', -1.2]], says: 'Up in the cities, down in the countryside.' },
      { key: 'small', label: 'Keep them for small farms only', fx: [['rural', 0.5]], says: 'A little up in the countryside.' },
    ],
  },
  {
    key: 'wind', title: 'Wind farms on the high moors',
    text: 'A developer wants two hundred turbines in the hills. Jobs and clean power, or a blight on the view?',
    options: [
      { key: 'back', label: 'Back the turbines', fx: [['urban', 0.8], ['coast', 0.3], ['rural', -0.9]], says: 'Up in the cities and on the coast, down in the hills.' },
      { key: 'block', label: 'Block them', fx: [['rural', 0.9], ['urban', -0.7]], says: 'Up in the hills, down in the cities.' },
      { key: 'local', label: 'Let each region decide', fx: [['rural', 0.3], ['urban', -0.1]], says: 'A small gain in the hills.' },
    ],
  },
  {
    key: 'wage', title: 'The minimum wage',
    text: 'The unions want it raised by a fifth. Small businesses in the towns say they’ll cut hours.',
    options: [
      { key: 'raise', label: 'Raise it', fx: [['urban', 1.1], ['rural', -0.6]], says: 'Up in the cities, down in the towns.' },
      { key: 'hold', label: 'Hold it where it is', fx: [['rural', 0.6], ['urban', -0.8]], says: 'Up in the towns, down in the cities.' },
      { key: 'slow', label: 'Raise it slowly over four years', fx: [['urban', 0.4], ['rural', -0.1]], says: 'A little up in the cities.' },
    ],
  },
  {
    key: 'port', title: 'The Carrowmouth harbour',
    text: 'Dredging the harbour would bring container ships to Carrowmouth, and the silt to the beaches next door.',
    options: [
      { key: 'back', label: 'Back the dredging', fx: [['@Carrowmouth', 1.6], ['nb@Carrowmouth', -0.8]], says: 'Up in Carrowmouth, down in the regions around it.' },
      { key: 'oppose', label: 'Oppose it', fx: [['nb@Carrowmouth', 1.0], ['@Carrowmouth', -1.2]], says: 'Up around Carrowmouth, down in the city itself.' },
      { key: 'review', label: 'Order an environmental review', fx: [['nb@Carrowmouth', 0.3]], says: 'A little up around Carrowmouth.' },
    ],
  },
  {
    key: 'vesland', title: 'The Vesland fishing dispute',
    text: 'Vesland’s navy has been turning back Aldermere boats. Everyone wants to know what the next president would do.',
    options: [
      { key: 'firm', label: 'Stand firm: send the navy', gamble: { p: 0.6, win: [['all', 0.5], ['coast', 0.4]], lose: [['all', -0.6]], winSays: 'It played as strength.', loseSays: 'It played as reckless.' }, says: 'A gamble: it looks strong (about +0.5 everywhere) or reckless (about −0.6).' },
      { key: 'talks', label: 'Call for talks', fx: [['urban', 0.5], ['fishing', -0.5]], says: 'Up in the cities, down in the fishing towns.' },
      { key: 'quiet', label: 'Say it’s for the government to handle', fx: [['all', -0.1]], says: 'Looks cautious. Barely moves anything.' },
    ],
  },
  {
    key: 'fuel', title: 'Fuel duty',
    text: 'Petrol is at a record price. Cut the tax, or keep the money for the roads?',
    options: [
      { key: 'cut', label: 'Cut it', fx: [['rural', 1.0], ['inland', 0.3], ['urban', -0.3]], says: 'Up in the countryside, down a little in the cities.' },
      { key: 'keep', label: 'Keep it and fix the roads', fx: [['urban', 0.4], ['rural', -0.8]], says: 'Up a little in the cities, down in the countryside.' },
      { key: 'freeze', label: 'Freeze it for a year', fx: [['rural', 0.3]], says: 'A small gain in the countryside.' },
    ],
  },
  {
    key: 'hospitals', title: 'Small-town hospitals',
    text: 'Three small hospitals are due to close, with one big new one planned in the city.',
    options: [
      { key: 'save', label: 'Keep all three open', cost: 2, fx: [['rural', 1.1], ['urban', -0.3]], says: 'Up in the countryside, for $2M in promises.' },
      { key: 'merge', label: 'Build the big new one', fx: [['urban', 0.8], ['rural', -1.0]], says: 'Up in the cities, down in the countryside.' },
      { key: 'one', label: 'Save the busiest of the three', fx: [['rural', 0.4]], says: 'A little up in the countryside.' },
    ],
  },
  {
    key: 'housing', title: 'City rents',
    text: 'Rents in Port Ansel and Carrowmouth are up a fifth in two years.',
    options: [
      { key: 'build', label: 'Build 100,000 homes', fx: [['metro', 1.2], ['rural', -0.2]], says: 'Up in the big cities.' },
      { key: 'cap', label: 'Cap the rents', gamble: { p: 0.55, win: [['metro', 1.5]], lose: [['metro', 0.3], ['all', -0.3]], winSays: 'Renters loved it.', loseSays: 'Economists lined up against it.' }, says: 'A gamble: a big gain in the cities, or a small one and a scolding everywhere.' },
      { key: 'market', label: 'Leave it to the market', fx: [['rural', 0.4], ['metro', -0.8]], says: 'Up a little in the countryside, down in the cities.' },
    ],
  },
];

function resolveFilter(country, f) {
  if (f.startsWith('@')) return [byName(country, f.slice(1))];
  if (f.startsWith('nb@')) return [...country.regions[byName(country, f.slice(3))].neighbors];
  return regionsWhere(country, f);
}

// Region effects as [[regionId, points], ...].
function expand(country, fx) {
  const out = new Map();
  for (const [f, pts] of fx) for (const k of resolveFilter(country, f)) out.set(k, (out.get(k) || 0) + pts);
  return [...out.entries()];
}

// ---------------------------------------------------------------- building decisions

// A decision's options carry what they do as plain data:
//   sure: { nat, regions: [[k, pts]], money }       happens for certain
//   gamble: { p, win: {...}, lose: {...}, winSays, loseSays }
//   promise: { region, kept: {...}, broken: {...} }   the candidate must rally there this week
//   stance: { issue, option, regions, nat }          a position on an issue (goes on the record)
// All points are for the side making the decision.

function make(state, s, kind, week, title, text, options, extra = {}) {
  const id = `w${week}-${kind}-${s}`;
  return { id, side: s, kind, week, title, text, options, chosen: null, defaultKey: options.at(-1).key, ...extra };
}

export function crisisDecisions(state, country, triggers, week) {
  const out = [];
  const name = s => state.cands[s].last;
  for (const t of triggers) {
    const s = t.side, o = 1 - s;
    const R = t.region !== undefined ? country.regions[t.region] : null;
    if (t.kind === 'scandal') {
      const staffer = STAFF[rng(`${state.seed}:staff:${week}:${s}`).int(0, STAFF.length - 1)];
      const role = t.role || 'campaign chair';
      out.push(make(state, s, 'scandal', week, `Your ${role}, ${staffer}, is accused of ${t.thing}`,
        'The story broke on Friday. Reporters want an answer by Monday night, and whatever you do will be the story all week.', [
          { key: 'fire', label: `Fire ${staffer.split(' ')[0]} today`, says: `A sure hit now, about −0.4 everywhere, and $3M less raised while you find a new ${role}. The story is gone by Wednesday.`, sure: { nat: -0.4, money: -3 }, done: 'The story was gone by Wednesday, and so was a week’s fundraising.' },
          { key: 'stand', label: `Stand by ${staffer.split(' ')[0]}`, says: 'Even odds, roughly: it falls apart (+0.2) or it gets much worse all week (−2.0).', gamble: { p: 0.55, win: { nat: 0.2 }, lose: { nat: -2.0 }, winSays: 'The accusations fell apart.', loseSays: 'Two more payments surfaced by Thursday.' } },
          { key: 'subject', label: 'Change the subject', cost: 4, says: 'A big housing announcement to take the edge off. About −0.5, for $4M.', sure: { nat: -0.5 }, done: 'The housing plan took the edge off.' },
        ], { staffer, defaultKey: 'stand' }));
      out.push(make(state, o, 'rivalScandal', week, `${name(s)}’s ${role} is accused of ${t.thing}`,
        `${name(s)}’s people are scrambling. What’s your line?`, [
          { key: 'pile', label: 'Pile on with attack ads', cost: 3, says: 'Usually it lands (another −1.0 for them), but a third of the time it looks petty (−0.5 for you).', gamble: { p: 0.65, win: { nat: 1.0 }, lose: { nat: -0.5 }, winSays: 'The ads kept the story alive all week.', loseSays: 'Voters said it looked petty.' } },
          { key: 'high', label: 'Take the high road', says: 'Say it’s a matter for the courts. A small, sure gain with undecided voters: about +0.3.', sure: { nat: 0.3 }, done: 'Voters noticed who stayed above it.' },
          { key: 'quiet', label: 'Say nothing', says: 'Let it play out on its own.', sure: {} },
        ]));
    } else if (t.kind === 'surprise') {
      out.push(make(state, s, 'surprise', week, `Days before the vote: questions over ${t.thing}`,
        'It broke on Friday night, a week and a half out. There’s no time for a slow answer.', [
          { key: 'deny', label: 'Deny everything', says: 'A coin flip: it blows over (+0.3) or the documents come out anyway (−2.0).', gamble: { p: 0.5, win: { nat: 0.3 }, lose: { nat: -2.0 }, winSays: 'Nothing more came out.', loseSays: 'The documents came out anyway.' } },
          { key: 'release', label: 'Release the documents yourself', says: 'Take the hit on your own terms: about −0.6, and then it’s over.', sure: { nat: -0.6 }, done: 'It hurt, and then it was over.' },
          { key: 'counter', label: 'Hit back hard', cost: 3, says: 'Usually it works (−0.3), but when it doesn’t it looks desperate (−1.5). $3M of ads.', gamble: { p: 0.6, win: { nat: -0.3 }, lose: { nat: -1.5 }, winSays: 'The counterattack changed the subject.', loseSays: 'It looked desperate.' } },
        ], { defaultKey: 'deny' }));
      out.push(make(state, o, 'rivalSurprise', week, `${name(s)} faces late questions over ${t.thing}`,
        'With days to go, how hard do you push it?', [
          { key: 'pile', label: 'Make it the closing argument', cost: 3, says: 'Usually it lands (+1.0), but it can look desperate (−0.6).', gamble: { p: 0.6, win: { nat: 1.0 }, lose: { nat: -0.6 }, winSays: 'It was all anyone talked about.', loseSays: 'It came across as desperate.' } },
          { key: 'high', label: 'Stay on your own message', says: 'A small, sure gain: about +0.3.', sure: { nat: 0.3 }, done: 'Staying on message looked steady.' },
          { key: 'quiet', label: 'Say nothing', says: 'Let the press do it.', sure: {} },
        ]));
    } else if (t.kind === 'gaffe') {
      const who = t.who === 'mate' ? `Your running mate, ${state.mates[s].name},` : 'You were';
      out.push(make(state, s, 'gaffe', week, `The hot-mic clip from ${R.name}`,
        `${who} caught calling ${R.name} “${t.quote}”. It’s all anyone there is talking about.`, [
          { key: 'sorry', label: 'Apologise at once', says: `Win back about half of it in ${R.name} (+0.7). A sure thing.`, sure: { regions: [[R.id, 0.7]] }, done: 'The apology was accepted, mostly.' },
          { key: 'laugh', label: 'Laugh it off', says: `Usually it works (+1.2 in ${R.name}, +0.2 everywhere); sometimes it makes it worse (−0.6 there).`, gamble: { p: 0.6, win: { regions: [[R.id, 1.2]], nat: 0.2 }, lose: { regions: [[R.id, -0.6]] }, winSays: 'The joke landed.', loseSays: 'Nobody in ' + R.name + ' was laughing.' } },
          { key: 'double', label: 'Double down', says: `Your own voters love it half the time (+0.4 everywhere); otherwise it sinks you in ${R.name} (−1.0) and costs a little everywhere (−0.4).`, gamble: { p: 0.5, win: { nat: 0.4 }, lose: { regions: [[R.id, -1.0]], nat: -0.4 }, winSays: 'Your base rallied round.', loseSays: 'It became the whole week’s story.' } },
        ], { defaultKey: 'double', region: R.id }));
      out.push(make(state, o, 'rivalGaffe', week, `${t.who === 'mate' ? state.mates[s].last : name(s)} insulted ${R.name}`,
        `The clip is everywhere in ${R.name}. Do you use it?`, [
          { key: 'clip', label: `Run the clip in ${R.name}`, cost: 2, says: `A sure +1.2 for you in ${R.name}, for $2M.`, sure: { regions: [[R.id, 1.2]] }, done: `The clip ran all week in ${R.name}.` },
          { key: 'quiet', label: 'Let it go', says: 'Stay above it.', sure: {} },
        ], { region: R.id }));
    } else if (t.kind === 'plant') {
      for (const side of [0, 1]) {
        const inPower = side === state.incumbent;
        out.push(make(state, side, 'plant', week, `${t.jobs.toLocaleString('en-US')} jobs go in ${R.name}`,
          inPower ? `${t.company} is closing its plant in ${R.name}, and your party is in power. Workers want to know what you’ll do.`
            : `${t.company} is closing its plant in ${R.name}, on the other party’s watch.`, [
            { key: 'visit', label: `Go to the plant gates this week`, says: `If ${name(side)} rallies in ${R.name} this week: +${inPower ? '1.0' : '1.5'} there. Promise it and don’t go: −1.0.`, promise: { region: R.id, kept: { regions: [[R.id, inPower ? 1.0 : 1.5]] }, broken: { regions: [[R.id, -1.0]] } } },
            { key: 'fund', label: 'Promise a rescue fund', cost: 3, says: `A sure +1.0 in ${R.name} and a little across the countryside (+0.3), a little down in the cities. $3M.`, sure: { regions: [[R.id, 1.0], ...expand(country, [['rural', 0.3], ['metro', -0.2]])] }, done: `The rescue fund went down well in ${R.name}.` },
            { key: 'quiet', label: 'Stay out of it', says: inPower ? `Silence reads as not caring: about −0.5 in ${R.name}.` : 'Leave it to the other side to answer for it.', sure: inPower ? { regions: [[R.id, -0.5]] } : {}, done: inPower ? 'The silence was noticed.' : '' },
          ], { region: R.id }));
      }
    } else if (t.kind === 'strike') {
      for (const side of [0, 1]) {
        const inPower = side === state.incumbent;
        out.push(make(state, side, 'strike', week, `The dock strike in ${R.name}`,
          `The dockworkers want a raise and a say over the new cranes. The port owners say they can’t afford either.${inPower ? ' Your party is in power, so people are looking to you to end it.' : ''}`, [
            { key: 'workers', label: 'Stand with the dockworkers', says: `Up in ${R.name} (+1.2) and a little in the cities (+0.3), down a little in the countryside (−0.3).`, sure: { regions: [[R.id, 1.2], ...expand(country, [['urban', 0.3], ['rural', -0.3]])] }, done: 'The picket lines cheered.' },
            { key: 'owners', label: 'Back the port owners', says: `Up in the countryside and the towns (+0.4), down in ${R.name} (−1.0).`, sure: { regions: [[R.id, -1.0], ...expand(country, [['rural', 0.4]])] }, done: 'Business groups were pleased; the docks were not.' },
            { key: 'broker', label: inPower ? 'Broker a deal yourself' : 'Offer to broker a deal', says: `Even odds: a deal is struck and you get the credit (+1.5 in ${R.name}, +0.3 everywhere), or the talks collapse and it looks naive (−0.5 there).`, gamble: { p: 0.5, win: { regions: [[R.id, 1.5]], nat: 0.3 }, lose: { regions: [[R.id, -0.5]] }, winSays: 'The deal held, and the ships came in.', loseSays: 'The talks collapsed within a day.' } },
          ], { region: R.id, defaultKey: 'owners' }));
      }
    } else if (t.kind === 'factory') {
      const A = country.regions[t.region], B = country.regions[t.other];
      for (const side of [0, 1]) {
        out.push(make(state, side, 'factory', week, `Where should the ${t.company} plant go?`,
          `${t.jobs.toLocaleString('en-US')} jobs, and ${A.name} and ${B.name} both want them. Whichever you back, the other will remember.`, [
            { key: 'a', label: `Back ${A.name}`, says: `+1.4 in ${A.name}, −0.6 in ${B.name}.`, sure: { regions: [[A.id, 1.4], [B.id, -0.6]] }, done: `${A.name} was grateful; ${B.name} less so.` },
            { key: 'b', label: `Back ${B.name}`, says: `+1.4 in ${B.name}, −0.6 in ${A.name}.`, sure: { regions: [[B.id, 1.4], [A.id, -0.6]] }, done: `${B.name} was grateful; ${A.name} less so.` },
            { key: 'none', label: 'Say it’s the company’s choice', says: 'A little up in both (+0.2): nobody feels passed over.', sure: { regions: [[A.id, 0.2], [B.id, 0.2]] }, done: 'Nobody felt passed over.' },
          ], { region: A.id, defaultKey: 'none' }));
      }
    } else if (t.kind === 'flood') {
      for (const side of [0, 1]) {
        const inPower = side === state.incumbent;
        out.push(make(state, side, 'flood', week, `Floods in ${R.name}`,
          inPower ? `The river came over the defences on Saturday. Your party runs the relief effort.` : `The river came over the defences on Saturday. The other party runs the relief effort.`,
          inPower ? [
            { key: 'visit', label: `Go to ${R.name} this week`, says: `If ${name(side)} rallies there this week: +1.3 there and +0.4 around it. Promise it and don’t go: −1.2.`, promise: { region: R.id, kept: { regions: [[R.id, 1.3], ...country.regions[R.id].neighbors.map(k => [k, 0.4])] }, broken: { regions: [[R.id, -1.2]] } } },
            { key: 'fund', label: 'Announce emergency money', cost: 4, says: `A sure +1.0 in ${R.name} and +0.4 around it. $4M.`, sure: { regions: [[R.id, 1.0], ...country.regions[R.id].neighbors.map(k => [k, 0.4])] }, done: 'The money arrived fast.' },
            { key: 'agencies', label: 'Leave it to the agencies', says: `Half the time nobody notices; half the time it looks like help came too slowly (−1.5 in ${R.name}).`, gamble: { p: 0.5, win: {}, lose: { regions: [[R.id, -1.5]] }, winSays: 'The relief effort went smoothly.', loseSays: 'Help came too slowly.' } },
          ] : [
            { key: 'criticise', label: 'Criticise the response', says: `A coin flip: +1.0 in ${R.name}, or −0.8 for playing politics with a flood.`, gamble: { p: 0.5, win: { regions: [[R.id, 1.0]] }, lose: { regions: [[R.id, -0.8]] }, winSays: 'The criticism stuck.', loseSays: 'It looked like playing politics with a flood.' } },
            { key: 'volunteer', label: 'Send volunteers, no cameras', says: `A sure +0.4 in ${R.name}.`, sure: { regions: [[R.id, 0.4]] }, done: 'The volunteers were noticed, even without cameras.' },
            { key: 'quiet', label: 'Say nothing', says: 'Stay out of it.', sure: {} },
          ], { region: R.id, defaultKey: inPower ? 'agencies' : 'quiet' }));
      }
    }
  }
  return out;
}

export function issueDecisions(state, country, week) {
  const r = rng(`${state.seed}:w${week}:issue`);
  const used = new Set(state.issuesSeen);
  const pool = ISSUES.filter(i => !used.has(i.key));
  if (!pool.length) return [];
  const issue = r.pick(pool);
  state.issuesSeen.push(issue.key);
  return [0, 1].map(s => make(state, s, 'issue', week, issue.title, issue.text,
    issue.options.map(opt => ({
      key: opt.key, label: opt.label, cost: opt.cost, says: opt.says, done: opt.fx ? opt.says : '',
      stance: { issue: issue.key, option: opt.key, regions: opt.fx ? expand(country, opt.fx) : null },
      gamble: opt.gamble ? { p: opt.gamble.p, win: { regions: expand(country, opt.gamble.win) }, lose: { regions: expand(country, opt.gamble.lose) }, winSays: opt.gamble.winSays, loseSays: opt.gamble.loseSays } : undefined,
    })), { issue: issue.key, defaultKey: issue.options.at(-1).key }));
}

// An issue a side took a position on comes back, and it can stick or switch (at a price).
export function resurfaceDecision(state, country, s, week) {
  const r = rng(`${state.seed}:w${week}:again:${s}`);
  const taken = Object.entries(state.stances[s]).filter(([, st]) => week - st.week >= 2 && !st.resurfaced);
  if (!taken.length || !r.chance(0.35)) return null;
  const [key, st] = r.pick(taken);
  const issue = ISSUES.find(i => i.key === key);
  const now = issue.options.find(o => o.key === st.option);
  const others = issue.options.filter(o => o.key !== st.option && o.fx);
  if (!others.length) return null;
  const alt = r.pick(others);
  st.resurfaced = true;
  const twist = { rail: 'The cost estimate has doubled.', fishing: 'The cod count came in even lower.', farms: 'The drought is into its third year.', wind: 'The developer has doubled the number of turbines.', wage: 'Two factories cited it in layoff notices.', port: 'A second shipping line wants in.', vesland: 'A trawler has been seized.', fuel: 'Prices went up again.', hospitals: 'A second hospital is on the list.', housing: 'Rents rose again this quarter.' }[key];
  return make(state, s, 'resurface', week, `Back in the news: ${issue.title}`,
    `${twist} Reporters want to know if you still say “${now.label.toLowerCase()}”.`, [
      { key: 'stick', label: 'Stick with it', says: 'Consistency plays well: about +0.2 everywhere.', sure: { nat: 0.2 }, done: 'Consistency played well.' },
      { key: 'switch', label: `Change your mind: ${alt.label.toLowerCase()}`, says: `Undo your old position and take the new one at most of its strength, but the flip-flop costs about −0.6 everywhere.`, flip: { issue: key, option: alt.key, regions: expand(country, alt.fx).map(([k, p]) => [k, p * 0.7]) }, sure: { nat: -0.6 }, done: 'The flip-flop was the headline.' },
    ], { issue: key, defaultKey: 'stick' });
}

// ---------------------------------------------------------------- choosing and resolving

export function choose(state, id, key) {
  const d = state.pending.find(x => x.id === id);
  if (!d || d.chosen) return false;
  const opt = d.options.find(o => o.key === key);
  if (!opt) return false;
  if ((opt.cost || 0) > state.money[d.side]) return false;
  state.money[d.side] -= opt.cost || 0;
  d.chosen = key;
  return true;
}

export const openFor = (state, s) => state.pending.filter(d => d.side === s && !d.chosen);
export const promiseFor = (state, s) => {
  const d = state.pending.find(x => x.side === s && x.week === state.week && x.chosen && x.options.find(o => o.key === x.chosen).promise);
  return d ? d.options.find(o => o.key === d.chosen).promise.region : null;
};

function applyFx(state, s, fx, ledger = 'evt') {
  if (!fx) return 0;
  if (fx.nat) state.mood += sgn(s) * fx.nat;
  for (const [k, pts] of fx.regions || []) {
    if (ledger === 'issue') state.regions[k].issue[s] += pts;
    else state.regions[k].evt += sgn(s) * pts;
  }
  if (fx.money) state.money[s] = Math.max(0, state.money[s] + fx.money);
  return fx.nat || 0;
}

// Plays out every decision made this week. Returns a story for each, for Monday's paper.
export function resolveDecisions(state, country, plans, week) {
  const stories = [];
  for (const d of state.pending.filter(x => x.week === week)) {
    if (!d.chosen) d.chosen = d.defaultKey;
    const opt = d.options.find(o => o.key === d.chosen);
    const s = d.side;
    let result = null, says = '';
    if (opt.promise) {
      const kept = plans[s].cand === opt.promise.region;
      applyFx(state, s, kept ? opt.promise.kept : opt.promise.broken);
      result = kept ? 'kept' : 'broken';
      says = kept ? `${state.cands[s].last} went, as promised.` : `${state.cands[s].last} promised to go and didn’t. It was noticed.`;
    } else if (opt.gamble) {
      const r = rng(`${state.seed}:call:${d.id}:${d.chosen}`);
      const win = r() < opt.gamble.p;
      applyFx(state, s, win ? opt.gamble.win : opt.gamble.lose, 'evt');
      result = win ? 'won' : 'lost';
      says = win ? opt.gamble.winSays : opt.gamble.loseSays;
    }
    if (opt.sure) applyFx(state, s, opt.sure);
    if (opt.stance?.regions) applyFx(state, s, { regions: opt.stance.regions }, 'issue');
    if (opt.stance) state.stances[s][opt.stance.issue] = { option: opt.stance.option, week, applied: opt.stance.regions || [] };
    if (opt.flip) {
      const st = state.stances[s][opt.flip.issue];
      for (const [k, pts] of st.applied) state.regions[k].issue[s] -= pts;
      applyFx(state, s, { regions: opt.flip.regions }, 'issue');
      state.stances[s][opt.flip.issue] = { option: opt.flip.option, week, applied: opt.flip.regions, flipped: true, resurfaced: true };
    }
    d.result = result;
    stories.push({ id: d.id, side: s, kind: d.kind, title: d.title, choice: opt.label, result, says: says || opt.done || '' });
  }
  return stories;
}
