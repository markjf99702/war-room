// Plays a whole campaign in Chromium through the real page, at phone size:  node test/e2e.mjs  (needs Playwright)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { makeCountry } from '../js/country.js';
import { newCampaign, chooseMate, resolveWeek, emptyPlan, finalResult } from '../js/campaign.js';
import { decideAll, planFor } from '../js/ai.js';
import { crisisDecisions } from '../js/decisions.js';
import { debateSetup, autoAnswers, STYLES } from '../js/debate.js';

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
// WCAG contrast between two computed colours, "rgb(…)" or "rgba(…)".
function contrast(fg, bg) {
  const lum = c => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [x, y] = [lum(fg), lum(bg)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// Text colour against the element's own background, for each element matching sel (SVG text: its fill against `bg`).
const legible = (sel, bg) => page.$$eval(sel, (els, bg) => els.map(el => {
  const css = getComputedStyle(el);
  return el instanceof SVGElement ? [css.fill, getComputedStyle(el.parentNode.querySelector(bg)).stroke] : [css.color, css.backgroundColor];
}), bg).then(pairs => pairs.map(([fg, back]) => contrast(fg, back)));
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

// A new campaign, as Highland on Easy. The page picks its seed with Math.random; it's the same one every run, so
// the double tap below always has a running mate under the second tap (about one seed in sixty doesn't).
await page.evaluate(() => { Math.random = () => 0.37; });
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
assert.match(await page.textContent('.ticket .lede'), /^The (Tidewater|Highland) Party holds the presidency\. Four years ago the election went \1,/, 'the party in power lost the last election');
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
// The two "Likely" labels in the map's legend can be read.
for (const c of await legible('.legend .l-t2, .legend .l-h2')) assert.ok(c >= 4.5, `a "Likely" label at ${c.toFixed(2)}:1`);

// Plan a week by hand: the candidate to New Aldham, steady ads, a field office and a poll.
await pick('New Aldham');
assert.match(await page.textContent('.rp-name'), /New Aldham/);
// Its panel scrolls into view clear of the top bar.
for (let y = -1, i = 0; i < 30; i++) { await page.waitForTimeout(100); const now = await page.evaluate(() => scrollY); if (now === y) break; y = now; }
assert.ok(await page.evaluate(() => document.querySelector('.rp-name').getBoundingClientRect().top >= document.querySelector('.top').getBoundingClientRect().bottom), 'the region’s name is under the top bar');
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
assert.match(await page.textContent('.side-col'), /The only national poll so far: /, 'week 1 has one national poll, not three');
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
// The night picks up again after a reload, without an error, even with a damaged won-lost record.
await page.evaluate(() => localStorage.setItem('war-room:record', '{"played":2,"won":1}'));
await page.reload();
await page.waitForSelector('.night');
assert.deepEqual(problems, [], 'problems after reloading on election night');
// Its map takes the keyboard too: each region says where its count is, and Enter shows it.
const nightReg = `.nt-map .reg[data-k="${country.regions.findIndex(g => g.name === 'New Aldham')}"]`;
assert.deepEqual([await page.getAttribute(nightReg, 'tabindex'), await page.getAttribute(nightReg, 'role')], ['0', 'button']);
assert.match(await page.getAttribute(nightReg, 'aria-label'), /^New Aldham, 9 electors, polls close at [789]:00 PM$/);
await page.waitForTimeout(600);
await page.evaluate(() => window.warroom.night.skip());
const counts = await page.$$eval('.ev-names .count', els => els.map(e => +e.textContent));
assert.equal(counts[0] + counts[1], 121, 'every elector is called by the end of the night');
assert.match(await page.getAttribute(nightReg, 'aria-label'), /^New Aldham, 9 electors, called for \S+$/);
await page.focus(nightReg);
await page.keyboard.press('Enter');
assert.match(await page.textContent('.region-pop'), /^New Aldham · 9.*Called for /);
await page.click('.region-pop button');
assert.ok((await legible('.call-banner'))[0] >= 4.5, 'the winner’s banner can be read');
// Once every vote is in it says so: no LIVE badge, and nothing left to play or skip.
assert.equal(await page.locator('.nt-live').isVisible(), false, 'still LIVE when the night is over');
const ended = await page.$$eval('.speed button', bs => bs.map(b => ({ text: b.textContent, off: b.disabled, opacity: +getComputedStyle(b).opacity })));
for (const b of [ended[0], ended.at(-1)]) assert.ok(b.off && b.opacity < 1, `${b.text} looks finished`);
assert.notEqual(ended[0].text, '❚❚');
await page.click('text=See how it was won');
await page.waitForSelector('.verdict', { timeout: 5000 }).catch(() => assert.fail(`no result screen: ${problems.join('; ')}`));
await fits('the result');
for (const n of [2, 3, 4]) await page.click(`.layer-tabs button:nth-child(${n})`);
const record = await page.evaluate(() => JSON.parse(localStorage.getItem('war-room:record')));
assert.equal(record.played, 3);
assert.equal(record.games.length, 1);

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

// A call made in a paper that came back after a reload counts at once: a promise to visit books the
// candidate, and a call's cost comes off the money shown.
const plantCall = () => {
  const st = campaignAt('e2e-promise', 2);
  st.pending = crisisDecisions(st, country, [{ kind: 'plant', region: 5, jobs: 1200, company: 'Harrow Steel' }], st.week);
  st.history.at(-1).asks = st.pending.map(d => d.id);
  decideAll(st, country, 1);
  return st;
};
await load(plantCall());
await page.click('.call-opt:has-text("Go to the plant gates")');
await page.click('.paper-actions .btn');
assert.match(await page.textContent('.pb-piece >> nth=0'), new RegExp(`Rally in ${country.regions[5].name}`), 'the promise booked the candidate');
assert.match(await page.textContent('.side-col'), /You promised to go to/);
await load(plantCall());
await page.click('.call-opt:has-text("Promise a rescue fund")');
await page.click('.paper-actions .btn');
assert.equal(await page.textContent('#moneyChip'), `$${await page.evaluate(() => window.warroom.ctx.state.money[0])}M`, 'the money shown is what’s in the bank');

// From the keyboard: the menus take the focus, Escape closes them and hands it back, and so does How to play.
const focusIn = sel => page.evaluate(s => !!document.activeElement?.closest(s), sel);
await page.focus('.menu-btn');
await page.keyboard.press('Enter');
assert.ok(await focusIn('.menu'), 'the menu has the focus');
await page.keyboard.press('Escape');
assert.equal(await page.locator('.menu').count(), 0, 'Escape closes the menu');
assert.ok(await focusIn('.menu-btn'));
await page.keyboard.press('Enter');
await page.keyboard.press('Enter'); // How to play
assert.ok(await focusIn('.sheet'), 'How to play has the focus');
assert.match(await page.textContent('.sheet'), /Ads cost more where more people live\./, 'How to play says what ads cost');
assert.ok(await page.$$eval('.sheet ul li', lis => lis.every(li => getComputedStyle(li).display === 'flex')), 'one item in “Each week” has a bullet');
await page.keyboard.press('Escape');
assert.ok(await focusIn('.menu-btn'), 'closing How to play hands the focus back');
await page.focus('.pb-piece');
await page.keyboard.press('Enter');
assert.ok(await focusIn('.piece-menu'), 'the piece menu has the focus');
await page.keyboard.press('Escape');
assert.equal(await page.locator('.piece-menu').count(), 0, 'Escape closes the piece menu');
assert.ok(await focusIn('.pb-piece'));
// A screen reader hears what a change did to the money and the odds, not the whole region panel again.
await pick('New Aldham');
assert.equal(await page.locator('.side-col [aria-live]').count(), 0);
await page.click('.seg button >> nth=1');
assert.match(await page.textContent('.hq > [aria-live]'), /^\$\d+M left\. .+ to win\.$/);

// With reduced motion asked for, nothing animates: not the map, and not the scroll to a region's panel.
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.evaluate(() => {
  window.scrolls = [];
  const was = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (o) { window.scrolls.push(o?.behavior); return was.call(this, o); };
});
await pick('Sandling');
await page.waitForFunction(() => window.scrolls.length);
assert.deepEqual(await page.evaluate(() => window.scrolls), ['auto'], 'the scroll to the panel is smooth');
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.board .reg')).transitionDuration), '0s', 'the map still animates');
await page.emulateMedia({ reducedMotion: 'no-preference' });

// A tap anywhere on a row of "Where it's close" opens that region, not just on its name.
await page.click('.rp-close');
const row = page.locator('.tip-table tbody tr').first();
const rowName = await row.locator('button').textContent();
await row.locator('td').last().click();
assert.equal(await page.textContent('.rp-name'), rowName, 'a tap on the row opened its region');

// The map works from the keyboard: every region is a button that says how it stands, Tab takes them from the top
// of the map down, the one with the focus is outlined like a picked one, and Enter or Space opens it.
{
  const regs = await page.$$eval('.board .reg', els => els.map(el => ({ k: +el.dataset.k, tab: el.getAttribute('tabindex'), role: el.getAttribute('role'), label: el.getAttribute('aria-label') })));
  assert.equal(regs.length, 21);
  for (const { k, tab, role, label } of regs) {
    const g = country.regions[k];
    assert.deepEqual([tab, role], ['0', 'button'], `${g.name} can’t be reached from the keyboard`);
    assert.match(label, new RegExp(`^${g.name}, ${g.electors} electors?, (Safe Tidewater|Likely Tidewater|Leans Tidewater|Toss-up|Leans Highland|Likely Highland|Safe Highland)$`));
  }
  await page.focus('.tabs button[data-tab="news"]');
  await page.keyboard.press('Tab');
  const onMap = () => page.evaluate(() => { const el = document.activeElement; return el.matches('.board .reg') ? window.warroom.country.regions[+el.dataset.k].name : null; });
  assert.equal(await onMap(), 'Carrowmouth', 'Tab from the tabs goes to the top of the map');
  assert.notEqual(await page.getAttribute('.board .sel.focus', 'd'), '', 'the region with the focus isn’t outlined');
  await page.keyboard.press('Enter');
  assert.equal(await page.textContent('.rp-name'), 'Carrowmouth');
  await page.keyboard.press('Tab');
  assert.equal(await onMap(), 'Westmere');
  await page.keyboard.press(' ');
  assert.equal(await page.textContent('.rp-name'), 'Westmere');
  assert.equal(await onMap(), 'Westmere', 'picking a region took the focus off the map');
}

// A plant closing and a flood in the same week both ask the party in power to go there. Once the candidate
// is promised to one, the other visit can't be picked, and the strategist stops suggesting it.
{
  const st = campaignAt('e2e-promise', 2);
  st.incumbent = 0;
  st.pending = crisisDecisions(st, country, [{ kind: 'plant', region: 5, jobs: 1200, company: 'Harrow Steel' }, { kind: 'flood', region: 9 }], st.week);
  st.history.at(-1).asks = st.pending.map(d => d.id);
  decideAll(st, country, 1);
  await load(st);
  const flood = page.locator('.call', { hasText: `Floods in ${country.regions[9].name}` });
  const visit = flood.locator('.call-opt', { hasText: `Go to ${country.regions[9].name} this week` });
  assert.equal(await visit.isDisabled(), false);
  await page.click('.call-opt:has-text("Go to the plant gates")');
  assert.equal(await visit.isDisabled(), true, 'a second promise, somewhere else, can still be made');
  assert.match(await visit.textContent(), new RegExp(`You’ve already promised to go to ${country.regions[5].name} this week`));
  assert.doesNotMatch(await flood.locator('.call-note').textContent(), /would: go to/, 'the strategist suggests the second promise');
  await fits('the paper with two calls');
  await flood.locator('.call-opt:not([disabled])').first().click();
  await page.click('.paper-actions .btn');
  assert.match(await page.textContent('.side-col'), new RegExp(`You promised to go to ${country.regions[5].name} this week`));
}

// A phone on its side: the candidate's menu in a debate week (its longest) stays on screen.
{
  const st = campaignAt('e2e-landscape', 3);
  st.plans[0].cand = 2;
  await page.setViewportSize({ width: 844, height: 390 });
  await load(st);
  await page.click('.pb-piece >> nth=0');
  const box = await page.locator('.piece-menu').boundingBox();
  assert.ok(box.y >= 0, `the piece menu starts ${box.y}px from the top`);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
}

// In dark mode the pressed buttons, the pieces, the ratings and the rival's ghost pieces can be read, and
// the confirm box's buttons too, its own button being the red one.
await page.emulateMedia({ colorScheme: 'dark' });
{
  const st = campaignAt('e2e-dark', 2);
  st.rallies.push({ week: 1, side: 1, who: 'cand', region: 2 }); // the rival rallied in New Aldham last week
  await load(st);
  await pick('New Aldham');
  await page.click('.acts .togg >> nth=0');
  for (const sel of ['.seg button[aria-pressed="true"]', '.togg[aria-pressed="true"]', '.togg .pc', '.pb-piece .pc', '.legend .l-t2, .legend .l-h2, .legend .l-h3']) {
    for (const c of await legible(sel)) assert.ok(c >= 4.5, `${sel} at ${c.toFixed(2)}:1 in dark mode`);
  }
  const ghost = await legible('.board .ghost text', 'circle');
  assert.ok(ghost.length && ghost.every(c => c === 1), 'a ghost piece’s letter is in the rival’s colour');
}
await page.click('.menu-btn');
await page.click('.menu >> text=Give up this campaign');
const askColours = await page.evaluate(() => {
  const css = el => getComputedStyle(el);
  const [no, yes] = document.querySelectorAll('[role="alertdialog"] .btn');
  return { no: css(no).color, sheet: css(document.querySelector('[role="alertdialog"]')).backgroundColor, yes: css(yes).backgroundColor, stamp: css(document.querySelector('.planbar .btn.stamp')).backgroundColor };
});
assert.ok(contrast(askColours.no, askColours.sheet) >= 4.5, `Cancel is ${askColours.no} on ${askColours.sheet}`);
assert.equal(askColours.yes, askColours.stamp, '“Give up” is red');
await page.keyboard.press('Escape');
await page.emulateMedia({ colorScheme: 'light' });

// The focus group's verdict on an exchange the rival won is a plus for the rival.
{
  const st = campaignAt('e2e-verdict-2', 3);
  const theirs = autoAnswers(st, country, debateSetup(st, country, 3), 1);
  const beaten = { attack: 'facts', facts: 'plan', plan: 'story', story: 'attack' };
  await load(st);
  await page.click('.planbar .btn.stamp');
  assert.equal(await page.textContent('.db-venue'), 'The Port Ansel Playhouse', 'the venue on its own starts with a capital');
  const verdicts = [];
  for (let q = 0; q < 4; q++) {
    await page.click(`.db-answer:has-text("${STYLES[beaten[theirs[q]]].label}")`);
    verdicts.push(await page.textContent('.db-verdict'));
    await page.click('.db-stage .btn');
  }
  assert.ok(verdicts.some(v => v.includes(`for ${st.cands[1].last}`)), verdicts.join(' / '));
  for (const v of verdicts) assert.doesNotMatch(v, /−\d/, 'the verdict names who won it');
}

// A reload in the middle of a debate picks it up at the next question, with the answers already given and
// the week's plans as they were, rather than going back to the war room to play it again knowing the rival's answers.
{
  const st = campaignAt('e2e-debate-reload', 3);
  const k = country.regions.findIndex(g => g.name === 'New Aldham');
  st.plans[0].cand = k;
  await load(st);
  await page.click('.planbar .btn.stamp');
  await page.waitForSelector('.debate');
  await page.click('.db-answer >> nth=2'); // pivot to the plan
  const first = await page.textContent('.db-log li');
  await page.reload();
  await page.waitForSelector('.debate');
  assert.equal(await page.locator('.planbar').count(), 0, 'a reload went back to the war room');
  assert.deepEqual(await page.$$eval('.db-log li', lis => lis.map(li => li.textContent)), [first], 'the first answer stands');
  assert.equal(await page.textContent('.db-qn'), 'Question 2 of 4');
  await fits('a debate picked up after a reload');
  for (let q = 1; q < 4; q++) {
    await page.click('.db-answer >> nth=0');
    await page.click('.db-stage .btn');
  }
  // Reloaded again at the snap poll, it's still the snap poll.
  await page.reload();
  await page.waitForSelector('.db-snap');
  assert.equal(await page.locator('.db-log li').count(), 4);
  await page.click('.db-stage .btn');
  await page.waitForSelector('.paper');
  const after = await page.evaluate(() => { const s = window.warroom.ctx.state, e = s.history.at(-1); return { week: s.week, debating: s.debating ?? null, mine: e.debate.answers[0], cand: e.plans[0].cand }; });
  assert.deepEqual(after, { week: 4, debating: null, mine: ['plan', 'attack', 'attack', 'attack'], cand: k });
}

// The morning after, in words: "You polled it once", and a miss that rounds to nothing is just 0.
{
  const st = newCampaign(country, { seed: 'e2e-result-2' });
  chooseMate(st, country, 0, 0);
  while (st.phase === 'plan') {
    resolveWeek(st, country, [planFor(st, country, 0, 'normal'), planFor(st, country, 1, 'normal')]);
    for (const s of [0, 1]) decideAll(st, country, s);
  }
  st.result = finalResult(st, country);
  st.phase = 'done';
  await load(st);
  assert.match(await page.textContent('.res-grid'), /You polled it once\./);
  await page.click('.layer-tabs button:nth-child(4)');
  const badges = await page.$$eval('.board .badge text', ts => ts.map(t => t.textContent));
  assert.ok(badges.includes('0') && !badges.some(b => /^[+−]0$/.test(b)), `the model's misses: ${badges.join(' ')}`);
  // Where the browser won't share or copy, "Challenge someone" shows the link, selected, and leaves it there.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('Refused', 'NotAllowedError'));
  });
  await page.click('text=Challenge someone');
  await page.waitForSelector('.share-link:not([hidden])', { timeout: 5000 }).catch(() => assert.fail('the link isn’t shown when copying is refused'));
  const field = await page.$eval('.share-link', f => ({ value: f.value, all: f.selectionStart === 0 && f.selectionEnd === f.value.length }));
  assert.match(field.value, /^https:\/\/war-room\.junkdrawer\.works\/\?c=e2e-result-2&p=0&d=normal&s=\d+$/);
  assert.ok(field.all, 'the link is selected');
  // On a wide screen the board is wider than the map, and it's sea all the way across.
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.ok(await page.evaluate(() => {
    const svg = document.querySelector('.board .map'), board = svg.getBoundingClientRect(), waves = svg.querySelector('rect[fill^="url"]').getBoundingClientRect();
    return waves.left <= board.left && waves.right >= board.right && waves.top <= board.top && waves.bottom >= board.bottom;
  }), 'the waves stop short of the edges of the board');
  await page.setViewportSize({ width: 390, height: 844 });
}

// A challenge link starts the same campaign.
await page.goto(`${base}?c=${seed}&p=1&d=easy&s=64`);
assert.match(await page.textContent('.title-screen'), /Someone sent you this campaign/);

// Whatever else is stored as the record, the game starts from a clean one.
for (const junk of ['{}', '[]', '5', '"x"', '{"played":"2","won":1,"games":{}}']) {
  await page.evaluate(j => localStorage.setItem('war-room:record', j), junk);
  await page.reload();
  assert.deepEqual(await page.evaluate(() => window.warroom.ctx.record), { played: 0, won: 0, games: [] }, junk);
}

// Works offline once it has been opened.
await page.goto(base);
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await ctx.setOffline(true);
await page.reload();
assert.ok(await page.title(), 'the page did not load offline');
await ctx.setOffline(false);

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while playing');
// Offline, checked the junkdrawer house kit's way, from a server that answers like GitHub Pages: a browser may keep
// each file for ten minutes, and asks again by its ETag. `net` is the connection: 'up', 'down' (the server drops every
// connection) or 'stalled' (a plane's or a train's wifi: it takes each request and holds on to it). With `release`
// set it serves the next release. The server's own switches are needed because the browser's offline switch can't
// make a stall, and in some Chromium builds it doesn't stop the service worker's own requests.
{
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { join, extname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { createHash } = await import('node:crypto');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  let net = 'up', release = false;
  const held = [];
  const server = createServer((req, res) => {
    if (net === 'down') { req.socket.destroy(); return; }
    if (net === 'stalled') { held.push([req, res]); return; }
    serve(req, res);
  }).listen(0);
  async function serve(req, res) {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    let body;
    try { body = await readFile(join(root, path)); } catch { res.writeHead(404); res.end(); return; }
    if (release && path === '/sw.js') body = Buffer.from(String(body).replace(/const FILES = '[0-9a-f]*'/, "const FILES = 'next'"));
    if (release && path === '/index.html') body = Buffer.concat([body, Buffer.from('<!-- the next release -->\n')]);
    const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
    const head = { etag, 'cache-control': 'max-age=600', 'content-type': TYPES[extname(path)] || 'text/html' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
    res.writeHead(200, head);
    res.end(body);
  }
  const base = `http://localhost:${server.address().port}/`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
  const title = await page.title();

  // Works offline once it has been opened.
  net = 'down';
  await ctx.setOffline(true);
  await page.reload();
  assert.equal(await page.title(), title, 'the page did not open offline');
  await ctx.setOffline(false);

  // On a connection that's up but not answering, it opens from the copy too, after the worker's few seconds' wait for
  // the network: the page and every file it loads (were any of them left waiting on the network, it wouldn't open).
  net = 'stalled';
  const t0 = Date.now();
  await page.reload({ timeout: 10000 }).catch(() => {});
  const took = Date.now() - t0;
  assert.ok(took < 8000, `the page took ${took} ms to open on a stalled connection`);
  assert.equal(await page.title(), title, 'the page did not open on a stalled connection');
  net = 'up';
  for (const [req, res] of held.splice(0)) serve(req, res);

  // A new release: every file in the new copy comes from the server, though the browser still has its own copies of
  // the old ones for ten minutes. (The next release changes index.html, and so FILES in sw.js, as a real one does.)
  release = true;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  for (const end = Date.now() + 10000; !(await page.evaluate(async () => !!(await (await caches.match('index.html'))?.text())?.includes('<!-- the next release -->')));) {
    assert.ok(Date.now() < end, "the new release's offline copy kept the old index.html");
    await new Promise(r => setTimeout(r, 100));
  }
  assert.deepEqual(problems, [], 'problems while offline or on a stalled connection');
  await ctx.close();
  server.close();

  // sw.js changes whenever a file it keeps does, so a release replaces the whole offline copy at once: FILES in sw.js
  // is a fingerprint of every file in SHELL (sha1 of each, in the list's order, an address like './' read as its
  // index.html; the first 8 hex of the sha1 of those).
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const shell = [...sw.match(/SHELL = \[([^\]]*)\]/)[1].replace(/\/\/.*/g, '').matchAll(/'([^']*)'/g)].map(m => m[1]);
  const all = createHash('sha1');
  for (const f of shell) all.update(createHash('sha1').update(await readFile(join(root, f.endsWith('/') ? f + 'index.html' : f))).digest());
  const files = all.digest('hex').slice(0, 8);
  assert.equal(sw.match(/const FILES = '([0-9a-f]*)'/)?.[1], files, `a file sw.js keeps for offline has changed: set FILES in sw.js to '${files}'`);
}

await browser.close();
server.close();
console.log('all good');
