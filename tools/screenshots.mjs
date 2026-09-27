// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// Campaigns are seeded, so the same pictures come out every time.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
let UPNG = null;
try { UPNG = require('upng-js'); } catch { /* optional: shrinks the PNGs */ }
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
const SEED = 'harbor7'; // change it until the pictures look good
const browser = await pw.chromium.launch();
await mkdir(join(root, 'docs'), { recursive: true });

async function save(page, path, opts = {}) {
  const buf = await page.screenshot(opts);
  if (!UPNG) { await writeFile(path, buf); return; }
  const img = UPNG.decode(buf);
  const small = UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256);
  await writeFile(path, Buffer.from(small));
}

async function open(viewport, deviceScaleFactor) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: viewport.width < 600, serviceWorkers: 'block', colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(`${base}?c=${SEED}&p=0&d=normal`);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const pick = (page, name) => page.evaluate(n => {
  const k = window.warroom.country.regions.findIndex(g => g.name === n);
  document.querySelector(`.board .reg[data-k="${k}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, name);

// Ends a week: says "vote anyway" if asked, and plays a debate (answering each question with
// whatever beats the rival's natural style) if there is one. `onDebate` can take pictures.
async function endWeek(page, onDebate) {
  await page.click('.planbar .btn.stamp');
  await page.waitForSelector('.paper, .debate, [role="alertdialog"]');
  if (await page.locator('[role="alertdialog"]').count()) { await page.click('[role="alertdialog"] .btn.stamp'); await page.waitForSelector('.paper, .debate'); }
  if (await page.locator('.debate').count()) {
    const pick = await page.evaluate(() => {
      const st = window.warroom.ctx.state;
      const natural = { brawler: 'attack', wonk: 'facts', charmer: 'story', messenger: 'plan' }[st.cands[1 - st.side].temper];
      return { facts: 'Go on the attack', plan: 'Walk through the facts', story: 'Pivot to your plan', attack: 'Tell a story' }[natural];
    });
    for (let q = 0; q < 4; q++) {
      if (onDebate && q === 2) await onDebate('question');
      await page.click(`.db-answer:has-text("${pick}")`);
      if (onDebate && q === 2) await onDebate('answer');
      await page.click('.db-stage .btn');
    }
    await page.click('.db-stage .btn');
    await page.waitForSelector('.paper');
  }
}

// Answers the paper's calls the way the strategist would.
async function answerCalls(page, onCall) {
  const cards = page.locator('.call');
  if (onCall && await cards.count()) await onCall();
  for (let i = 0; i < await cards.count(); i++) {
    const hint = (await cards.nth(i).locator('.call-note').textContent()).replace(/^Your strategist would: |\.$/g, '');
    const opts = cards.nth(i).locator('.call-opt:not([disabled])');
    for (let j = 0; j < await opts.count(); j++) {
      if ((await opts.nth(j).locator('b').textContent()).toLowerCase().startsWith(hint.toLowerCase())) { await opts.nth(j).click(); break; }
    }
    if (await cards.nth(i).locator('.call-opt:not([disabled])').count()) await cards.nth(i).locator('.call-opt:not([disabled])').first().click();
  }
}

// Plays the strategist's weeks up to the start of `week`, leaving that week's paper open.
async function playTo(page, week, hooks = {}) {
  await page.click('text=Play this campaign');
  await page.click('.mate-card >> nth=0');
  for (let w = 1; w < week; w++) {
    await page.click('.planbar button:has-text("Strategist")');
    await endWeek(page, hooks.onDebate);
    if (w < week - 1) { await answerCalls(page); await page.click('.paper-actions .btn'); }
  }
}

// Phone screenshots for the README.
{
  const page = await open({ width: 390, height: 844 }, 2);
  let debateShot = false;
  await playTo(page, 5, {
    onDebate: async when => {
      if (debateShot && when === 'question') return;
      if (when === 'answer') { debateShot = true; await page.waitForTimeout(600); await save(page, join(root, 'docs/phone-debate.png')); }
    },
  });
  await save(page, join(root, 'docs/phone-paper.png'));
  // The first call on the page, scrolled into view.
  if (await page.locator('.call').count()) {
    await page.evaluate(() => { const c = document.querySelector('.call'); const o = document.querySelector('.overlay'); o.scrollTop = c.getBoundingClientRect().top + o.scrollTop - 20; });
    await page.waitForTimeout(200);
    await save(page, join(root, 'docs/phone-call.png'));
  }
  await answerCalls(page);
  await page.click('.paper-actions .btn');
  await page.click('.planbar button:has-text("Strategist")');
  await page.waitForTimeout(2800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await save(page, join(root, 'docs/phone-map.png'));
  const target = await page.evaluate(() => { const st = window.warroom.ctx.state; const k = st.plans[st.side].cand; return Number.isInteger(k) ? window.warroom.country.regions[k].name : 'New Aldham'; });
  await pick(page, target);
  await page.waitForTimeout(500);
  await page.evaluate(() => { const p = document.querySelector('.side-col .panel'); window.scrollTo(0, p.getBoundingClientRect().top + scrollY - 70); });
  await page.waitForTimeout(300);
  await save(page, join(root, 'docs/phone-region.png'));
  for (let w = 5; w <= 8; w++) {
    if (w > 5) await page.click('.planbar button:has-text("Strategist")');
    await endWeek(page);
    await answerCalls(page);
    await page.click('.paper-actions .btn');
  }
  await page.waitForSelector('.night');
  await page.evaluate(() => { window.warroom.night.pause(); window.warroom.night.at(21 * 60 + 35); });
  await page.waitForTimeout(900);
  await save(page, join(root, 'docs/phone-night.png'));
  await page.evaluate(() => window.warroom.night.skip());
  await page.click('text=See how it was won');
  await page.click('.layer-tabs button:nth-child(2)');
  await page.waitForTimeout(300);
  await save(page, join(root, 'docs/phone-result.png'));
  await page.context().close();
}

// Link preview, 1200 x 630: a card with the name on the left and the real board on the right.
{
  const page = await open({ width: 1200, height: 800 }, 1);
  await playTo(page, 5);
  await answerCalls(page);
  await page.click('.paper-actions .btn');
  await page.click('.planbar button:has-text("Strategist")');
  await page.waitForTimeout(2800);
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.evaluate(() => {
    const map = document.querySelector('.board .map').cloneNode(true);
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;overflow:hidden;background:var(--paper)';
    const card = document.createElement('div');
    card.style.cssText = 'width:1200px;height:630px;display:grid;grid-template-columns:520px 1fr;align-items:center;gap:10px;padding:0 44px 0 64px;box-sizing:border-box';
    card.innerHTML = `
      <div>
        <div style="font-family:var(--display);font-weight:900;text-transform:uppercase;font-size:150px;line-height:.84;letter-spacing:.02em;color:var(--ink)">War<br>Room<span style="color:var(--stamp)">.</span></div>
        <p style="font:500 30px/1.3 var(--body);color:var(--ink);margin:28px 0 0">Eight weeks, a rival you can’t see, then election night.</p>
      </div>
      <div class="board" style="border-radius:22px;box-shadow:0 10px 30px rgba(40,30,10,.18)"></div>`;
    card.querySelector('.board').append(map);
    map.style.maxHeight = 'none';
    document.body.append(card);
  });
  await page.waitForTimeout(300);
  await save(page, join(root, 'og.png'));
  await page.context().close();
}

await browser.close();
server.close();
console.log('screenshots written');
