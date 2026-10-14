// Plays a whole campaign in Chromium through the real page, at phone size:  node test/e2e.mjs  (needs Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { makeCountry } from '../js/country.js';
import { newCampaign, chooseMate, resolveWeek, emptyPlan } from '../js/campaign.js';
import { decideAll } from '../js/ai.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

// The offline copy lists every file the page needs.
{
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const need = ['css/app.css'];
  for (const d of ['js', 'js/ui', 'fonts']) for (const f of await readdir(join(root, d), { withFileTypes: true })) if (f.isFile()) need.push(`${d}/${f.name}`);
  for (const f of need) assert.ok(sw.includes(`'${f}'`), `sw.js is missing ${f}`);
}

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(e.message));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', r => problems.push('failed: ' + r.url()));
page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });
page.on('dialog', d => d.accept());
const fits = async where => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${where} scrolls sideways on a phone`);
// Ends the week, saying "vote anyway" if it asks about unspent money, and playing a debate if
// there is one. Then answers the paper's calls.
let debates = 0, calls = 0;
async function endWeek() {
  await page.click('.planbar .btn.stamp');
  await page.waitForSelector('.paper, .debate, [role="alertdialog"]');
  if (await page.locator('[role="alertdialog"]').count()) { await page.click('[role="alertdialog"] .btn.stamp'); await page.waitForSelector('.paper, .debate'); }
  if (await page.locator('.debate').count()) {
    debates++;
    await fits('the debate');
    for (let q = 0; q < 4; q++) {
      assert.equal(await page.locator('.db-answer').count(), 4, 'four ways to answer');
      await page.click(`.db-answer >> nth=${(q + debates) % 4}`);
      assert.match(await page.textContent('.db-result'), /You .*\./);
      await page.click('.db-stage .btn');
    }
    assert.match(await page.textContent('.db-snap'), /%/);
    await page.click('.db-stage .btn');
  }
  await page.waitForSelector('.paper');
}
async function answerCalls() {
  const cards = page.locator('.call');
  for (let i = 0; i < await cards.count(); i++) {
    const open = cards.nth(i).locator('.call-opt:not([disabled])');
    if (!await open.count()) continue;
    calls++;
    assert.equal(await page.locator('.paper-actions .btn').isDisabled(), true, 'the paper waits for your call');
    await open.last().click();
  }
}
const pick = name => page.evaluate(n => {
  const k = window.warroom.country.regions.findIndex(g => g.name === n);
  document.querySelector(`.board .reg[data-k="${k}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, name);
const mine = () => page.evaluate(() => { const s = window.warroom.ctx.state; return { week: s.week, chosen: s.pending.filter(d => d.side === s.side && d.chosen).length }; });
// A quick double tap: the first tap changes the screen, and the second lands on whatever is under the finger
// now (`then`). Dispatched in the page, so the second tap comes at once. With 'mouse' it's a double click.
const tapThrough = (first, then, how = 'touch') => page.evaluate(([a, b, how]) => {
  const tap = (el, detail) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: how }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  };
  tap(document.querySelector(a), 1);
  const next = document.querySelector(b);
  if (next) tap(next, how === 'mouse' ? 2 : 1);
  return !!next;
}, [first, then, how]);

// Campaigns set up in Node and put in storage: Tidewater on Normal, played with empty plans and the
// computer's calls up to the start of `week`.
const country = makeCountry();
function campaignAt(seed, week) {
  const st = newCampaign(country, { seed });
  chooseMate(st, country, 0, 0);
  while (st.week < week) {
    resolveWeek(st, country, [emptyPlan(country.regions.length), emptyPlan(country.regions.length)]);
    for (const s of [0, 1]) decideAll(st, country, s);
  }
  return st;
}
const load = async st => {
  await page.evaluate(s => localStorage.setItem('war-room:game', s), JSON.stringify(st));
  await page.reload();
  await page.waitForTimeout(450); // a person takes longer than this to tap anything after the page appears
};

await page.goto(base);
await page.evaluate(() => document.fonts.ready);
await fits('the title screen');

// A new campaign, as Highland on Easy.
await page.click('.party-card[data-side="1"]');
await page.click('.diff-pick button[data-key="easy"]');
// Started with a quick double tap: the second tap lands on a running mate, and is ignored.
await page.locator('text=Start a campaign').scrollIntoViewIfNeeded();
const start = await page.locator('text=Start a campaign').boundingBox();
const [sx, sy] = [start.x + start.width / 2, start.y + start.height / 2];
await page.touchscreen.tap(sx, sy);
await page.touchscreen.tap(sx, sy);
assert.equal(await page.evaluate(() => window.warroom.ctx.state.phase), 'mate', 'a stray tap picked the running mate');
assert.ok(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.mate-card'), [sx, sy]), 'the second tap was over a running mate');
assert.match(await page.textContent('.ticket'), /Pick a running mate/);
await fits('the ticket');
await page.click('.mate-card >> nth=1');
assert.equal(await page.textContent('#weekChip b'), '1');
await fits('the war room');
// On a narrow phone the top bar still fits, and the menu button and End week stay on screen.
for (const [w, ht] of [[360, 780], [320, 640]]) {
  await page.setViewportSize({ width: w, height: ht });
  await fits(`the war room at ${w}px`);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.menu-btn, .planbar .btn.stamp')].every(el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width >= 40;
  })), `the menu button and End week are on screen at ${w}px`);
}
await page.setViewportSize({ width: 390, height: 844 });

// Plan a week by hand: the candidate to New Aldham, steady ads, a field office and a poll.
await pick('New Aldham');
assert.match(await page.textContent('.rp-name'), /New Aldham/);
const before = await page.textContent('.pb-money small');
await page.click('.acts .togg >> nth=0');
assert.match(await page.textContent('.pb-piece >> nth=0'), /Rally in New Aldham/);
await page.click('.seg button >> nth=2');
await page.click('text=Open a field office');
await page.click('text=Poll here this week');
const money = await page.evaluate(() => { const c = window.warroom.ctx; return c.state.money[c.state.side]; });
const left = +(await page.textContent('.pb-money')).match(/\$(\d+)M left/)[1];
assert.ok(left < money, 'spending shows in the plan bar');
assert.notEqual(await page.textContent('.pb-money small'), before, 'the forecast moved');
assert.equal(await page.locator('.board .tokens .pawn').count(), 1, 'the candidate is on the board');

// The forecast tab draws its charts.
await page.click('.tabs button[data-tab="forecast"]');
assert.equal(await page.locator('.side-col svg.chart').count(), 4);
await page.click('.tabs button[data-tab="map"]');

// End the week: Monday's paper, with the poll in the memo.
await endWeek();
assert.match(await page.textContent('.memo'), /New Aldham/);
await fits('the paper');
await answerCalls();
await page.click('.paper-actions .btn');
assert.equal(await page.textContent('#weekChip b'), '2');

// It survives a reload mid-campaign.
await page.reload();
assert.equal(await page.textContent('#weekChip b'), '2');

// The strategist plays the rest.
for (let w = 2; w <= 8; w++) {
  await page.click('.planbar button:has-text("Strategist")');
  await endWeek();
  // Calls left unanswered come back after a reload.
  if (await page.locator('.call-opt:not([disabled])').count()) {
    await page.reload();
    await page.waitForSelector('.paper .call-opt:not([disabled])');
  }
  await answerCalls();
  await page.click('.paper-actions .btn');
}
assert.equal(debates, 2, 'two debates');
assert.ok(calls >= 4, `made ${calls} calls`);

// Election night.
await page.waitForSelector('.night');
await fits('election night');
await page.waitForTimeout(600);
await page.evaluate(() => window.warroom.night.skip());
const counts = await page.$$eval('.ev-names .count', els => els.map(e => +e.textContent));
assert.equal(counts[0] + counts[1], 121, 'every elector is called by the end of the night');
await page.click('text=See how it was won');
await page.waitForSelector('.verdict');
await fits('the result');
for (const n of [2, 3, 4]) await page.click(`.layer-tabs button:nth-child(${n})`);
const record = await page.evaluate(() => JSON.parse(localStorage.getItem('war-room:record')));
assert.equal(record.played, 1);

const seed = await page.evaluate(() => window.warroom.ctx.state.seed);

// A quick double tap never answers for you. End week: the second tap lands on a call in Monday's paper.
await load(campaignAt('e2e-taps', 2));
assert.ok(await tapThrough('.planbar .btn.stamp', '.paper .call-opt:not([disabled])'), 'the paper asks for a call');
assert.equal((await mine()).chosen, 0, 'a stray tap made a call');
await page.waitForTimeout(450);
await answerCalls();
// "Plan week 3": the second tap lands on End week.
assert.ok(await tapThrough('.paper-actions .btn', '.planbar .btn.stamp'));
assert.equal(await page.evaluate(() => document.querySelector('#app').className), 'app screen-hq', 'a stray tap ended the week');
assert.equal((await mine()).week, 3, 'a stray tap ended the week');
assert.equal(await page.locator('.paper').count(), 0);
// The debate: End week, then Next question, each tapped twice; and a double click on Next question.
await page.waitForTimeout(450);
assert.ok(await tapThrough('.planbar .btn.stamp', '.db-answer'));
assert.equal(await page.locator('.db-log li').count(), 0, 'a stray tap answered a debate question');
await page.click('.db-answer >> nth=0');
await page.waitForTimeout(450);
assert.ok(await tapThrough('.db-stage .btn', '.db-answer'));
await page.click('.db-answer >> nth=1'); // a single click is never held back
assert.ok(await tapThrough('.db-stage .btn', '.db-answer', 'mouse'));
assert.equal(await page.locator('.db-log li').count(), 2, 'a stray tap or click answered a debate question');

// A challenge link starts the same campaign.
await page.goto(`${base}?c=${seed}&p=1&d=easy&s=64`);
assert.match(await page.textContent('.title-screen'), /Someone sent you this campaign/);

// Works offline once it has been opened.
await page.goto(base);
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
await page.reload();
assert.ok(await page.title(), 'the page did not load offline');
await ctx.setOffline(false);

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while playing');
await browser.close();
server.close();
console.log('all good');
