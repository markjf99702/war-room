// War Room: glue. Holds the campaign, saves it, and switches between screens.

import { makeCountry } from './country.js';
import { newCampaign, chooseMate, resolveWeek, finalResult, clampPlan, WEEKS, DEBATE_WEEKS } from './campaign.js';
import { planFor, decideAll } from './ai.js';
import { forecast } from './forecast.js';
import { DIFFICULTY } from './campaign.js';
import { h, $, money } from './ui/dom.js';
import { renderTitle, renderTicket } from './ui/title.js';
import { renderHQ } from './ui/hq.js';
import { showPaper } from './ui/paper.js';
import { renderNight } from './ui/nightview.js';
import { renderResult } from './ui/result.js';
import { showHelp } from './ui/help.js';
import { ask } from './ui/ask.js';
import { renderDebate } from './ui/debateview.js';

const KEY = 'war-room:game';
const RECORD = 'war-room:record';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: play on without saving */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nothing to do */ } },
};

const country = makeCountry();
const root = $('#app');

const ctx = {
  country,
  state: store.get(KEY),
  record: store.get(RECORD) || { played: 0, won: 0, games: [] },
  invite: readInvite(),
  save() { if (ctx.state) store.set(KEY, ctx.state); },
  go,
  toast,
  start(opts) {
    const seed = opts.seed || Math.random().toString(36).slice(2, 9);
    ctx.state = newCampaign(country, { seed, side: opts.side, difficulty: opts.difficulty });
    ctx.save();
    go('ticket');
  },
  pickMate(j) {
    chooseMate(ctx.state, country, ctx.state.side, j);
    ctx.save();
    go('hq');
  },
  // The player is done planning: the rival plans too, there may be a debate, the week happens,
  // the rival makes its calls for next week, and the paper comes out.
  endWeek() {
    const st = ctx.state, me = st.side, rival = 1 - me;
    const level = DIFFICULTY[st.difficulty].ai;
    const plan = clampPlan(st.plans[me], st, country, me);
    const theirs = planFor(st, country, rival, level);
    const plans = me === 0 ? [plan, theirs] : [theirs, plan];
    const finish = answers => {
      st.forecasts[me].push({ week: st.week, p: forecast(st, country, me, plan).p });
      const entry = resolveWeek(st, country, plans, answers ? { debate: { answers: me === 0 ? [answers, null] : [null, answers] } } : {});
      decideAll(st, country, rival, level);
      if (st.phase === 'night') st.result = finalResult(st, country);
      ctx.save();
      if (answers) go('blank');
      showPaper(ctx, entry, () => go(st.phase === 'night' ? 'night' : 'hq'));
    };
    if (DEBATE_WEEKS.includes(st.week)) {
      root.replaceChildren();
      root.className = 'app screen-debate';
      window.scrollTo(0, 0);
      renderDebate(root, ctx, { plans, onDone: finish });
    } else finish();
  },
  finishNight() {
    const st = ctx.state;
    if (st.phase !== 'done') {
      st.phase = 'done';
      const won = st.result.winner === st.side;
      ctx.record.played++;
      if (won) ctx.record.won++;
      ctx.record.games.unshift({ seed: st.seed, side: st.side, difficulty: st.difficulty, won, electors: st.result.electors, when: Date.now() });
      ctx.record.games = ctx.record.games.slice(0, 30);
      store.set(RECORD, ctx.record);
      ctx.save();
    }
    go('result');
  },
  abandon() {
    ctx.state = null;
    store.del(KEY);
    go('title');
  },
  help: () => showHelp(ctx),
};

function readInvite() {
  const q = new URLSearchParams(location.search);
  const c = q.get('c');
  if (!c || !/^[a-z0-9-]{3,24}$/i.test(c)) return null;
  const side = q.get('p') === '1' ? 1 : 0;
  const difficulty = DIFFICULTY[q.get('d')] ? q.get('d') : 'normal';
  return { seed: c, side, difficulty, score: q.get('s') };
}

function go(screen) {
  const st = ctx.state;
  if (screen === 'resume') {
    screen = !st ? 'title' : st.phase === 'mate' ? 'ticket' : st.phase === 'plan' ? 'hq' : st.phase === 'night' ? 'night' : 'result';
  }
  root.replaceChildren();
  root.className = `app screen-${screen}`;
  if (st) {
    root.style.setProperty('--mine', st.side === 0 ? 'var(--tide)' : 'var(--high)');
    root.style.setProperty('--theirs', st.side === 0 ? 'var(--high)' : 'var(--tide)');
  }
  document.body.style.overflow = '';
  window.scrollTo(0, 0);
  if (screen === 'title') renderTitle(root, ctx);
  else if (screen === 'ticket') { root.append(header()); renderTicket(root, ctx); }
  else if (screen === 'hq') { root.append(header()); renderHQ(root, ctx); }
  else if (screen === 'night') renderNight(root, ctx);
  else if (screen === 'result') { root.append(header()); renderResult(root, ctx); }
  else if (screen === 'blank') root.append(header());
}

function header() {
  const st = ctx.state;
  const bar = h('header', { class: 'top' },
    h('button', { class: 'brand', type: 'button', 'aria-label': 'War Room: back to the title screen', onclick: () => go('title') }, 'War Room', h('span', { class: 'dot' }, '.')),
    h('span', { class: 'spacer' }),
    st && st.phase === 'plan' ? h('span', { class: 'chip week', id: 'weekChip' }, 'Week ', h('b', {}, `${st.week}`), h('span', { class: 'muted' }, ` of ${WEEKS}`)) : null,
    st && st.phase === 'plan' ? h('span', { class: 'chip num', id: 'moneyChip', title: 'Money in the bank' }, h('b', {}, money(st.money[st.side]))) : null,
    h('button', { class: 'menu-btn', type: 'button', 'aria-label': 'Menu', 'aria-expanded': 'false', onclick: e => toggleMenu(e.currentTarget) },
      svgIcon('M4 7h16M4 12h16M4 17h16')));
  return bar;
}

function toggleMenu(btn) {
  const open = $('.menu');
  if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  btn.setAttribute('aria-expanded', 'true');
  const close = () => { menu.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); };
  const outside = e => { if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); };
  const item = (label, fn) => h('button', { type: 'button', onclick: () => { close(); fn(); } }, label);
  const st = ctx.state;
  const menu = h('nav', { class: 'menu' },
    item('How to play', () => showHelp(ctx)),
    st && st.phase === 'plan' && st.history.length ? item('Read last week’s paper', () => showPaper(ctx, st.history.at(-1), null)) : null,
    item('Title screen', () => go('title')),
    st && st.phase !== 'done' ? item('Give up this campaign', async () => { if (await ask('Give up this campaign?', { yes: 'Give up', detail: 'It can’t be picked up again.' })) ctx.abandon(); }) : null);
  document.body.append(menu);
  setTimeout(() => document.addEventListener('click', outside, true));
}

export function svgIcon(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d);
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('fill', 'none');
  svg.append(p);
  return svg;
}

let toastTimer;
function toast(msg, ms = 2600) {
  $('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

// Old saves from a different version of the rules aren't worth trying to rescue.
if (ctx.state && ctx.state.v !== 2) { ctx.state = null; store.del(KEY); }
go(ctx.invite ? 'title' : ctx.state ? 'resume' : 'title');

// Offline copy (not in the single-file build, which has nowhere to put one).
if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// For tools and tests.
window.warroom = { ctx, country };
