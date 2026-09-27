// Plays a whole campaign in Chromium through the real page, at phone size:  node test/e2e.mjs  (needs Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

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

await page.goto(base);
await page.evaluate(() => document.fonts.ready);
await fits('the title screen');

// A new campaign, as Highland on Easy.
await page.click('.party-card[data-side="1"]');
await page.click('.diff-pick button[data-key="easy"]');
await page.click('text=Start a campaign');
assert.match(await page.textContent('.ticket'), /Pick a running mate/);
await fits('the ticket');
await page.click('.mate-card >> nth=1');
assert.equal(await page.textContent('#weekChip b'), '1');
await fits('the war room');

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

// A challenge link starts the same campaign.
const seed = await page.evaluate(() => window.warroom.ctx.state.seed);
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
