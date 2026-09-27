// People and parties. The parties are named for where their voters live, not for any real party.

export const PARTIES = [
  { key: 'tide', name: 'Tidewater', short: 'T', noun: 'Tidewater Party', base: 'the cities and the coast' },
  { key: 'high', name: 'Highland', short: 'H', noun: 'Highland Party', base: 'the towns and the hill country' },
];

const FIRST = ['Ada', 'Miriam', 'Theo', 'Jonah', 'Celia', 'Marcus', 'Priya', 'Owen', 'Ruth', 'Silas', 'Nadia', 'Elliot',
  'Hana', 'Victor', 'Imogen', 'Dev', 'Lena', 'Rafael', 'Joan', 'Callum', 'Beatrix', 'Tomas', 'Wren', 'Isaac', 'Maeve',
  'Gideon', 'Rosa', 'August', 'Delia', 'Kofi', 'Ingrid', 'Felix', 'Noor', 'Bram', 'Esther', 'Luca'];
const LAST = ['Quill', 'Brandt', 'Harlow', 'Mercer', 'Ashdown', 'Whitcombe', 'Okafor', 'Lindqvist', 'Castellan', 'Darrow',
  'Fairweather', 'Holloway', 'Kincaid', 'Marchetti', 'Osei', 'Rowntree', 'Sato', 'Thackeray', 'Voss', 'Wexley', 'Yardley',
  'Abernathy', 'Gilchrist', 'Hartigan', 'Penrose', 'Albright', 'Coombs', 'Everly', 'Tolliver', 'Ravel'];

export const TRAITS = {
  fundraiser: { label: 'Fundraiser', text: 'Brings in $2M more every week.' },
  stumper: { label: 'Crowd-pleaser', text: 'Rallies land three-quarters as hard as the candidate’s, not half.' },
  debater: { label: 'Debate coach', text: 'Better odds in both debates.' },
};

export function person(r, used) {
  let first, last;
  do { first = r.pick(FIRST); last = r.pick(LAST); } while (used.has(first) || used.has(last));
  used.add(first); used.add(last);
  return { first, last, name: `${first} ${last}` };
}

export function titleFor(r, reg, top) {
  if (reg.metro >= 0 && r.chance(0.35)) return `Mayor of ${reg.name}`;
  if (top) return r.pick([`Governor of ${reg.name}`, `Senator from ${reg.name}`]);
  return r.pick([`Senator from ${reg.name}`, `Governor of ${reg.name}`, `Representative from ${reg.name}`]);
}
