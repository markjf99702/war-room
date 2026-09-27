// Quick look at every screen:  node dev/shots.mjs [width] [height] [dark]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require((await import('node:path')).join((await import('node:child_process')).execSync('npm root -g').toString().trim(), 'playwright')); }
const W = +process.argv[2] || 390, H = +process.argv[3] || 844, dark = process.argv[4] === 'dark';
const out = new URL('./shots/', import.meta.url).pathname;
await (await import('node:fs/promises')).mkdir(out, { recursive: true });
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: W < 600, colorScheme: dark ? 'dark' : 'light', serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:8080/?c=shots2&p=0&d=normal');
await page.evaluate(() => document.fonts.ready);
const tag = `${W}${dark ? '-dark' : ''}`;
const shot = async (name, full = false) => { await page.waitForTimeout(250); await page.screenshot({ path: `${out}${tag}-${name}.png`, fullPage: full }); };

// Ends the week: plays any debate, answers any calls, and moves on.
let shotDebate = false, shotCall = false;
async function endWeek() {
  await page.click('.planbar .btn.stamp');
  await page.waitForSelector('.paper, .debate, [role="alertdialog"]');
  if (await page.locator('[role="alertdialog"]').count()) { await page.click('[role="alertdialog"] .btn.stamp'); await page.waitForSelector('.paper, .debate'); }
  if (await page.locator('.debate').count()) {
    for (let q = 0; q < 4; q++) {
      if (!shotDebate && q === 1) await shot('debate-q');
      await page.click(`.db-answer >> nth=${q % 4}`);
      if (!shotDebate && q === 1) { await shot('debate-a'); }
      await page.click('.db-stage .btn');
    }
    if (!shotDebate) { await shot('debate-end'); shotDebate = true; }
    await page.click('.db-stage .btn');
    await page.waitForSelector('.paper');
  }
  const cards = page.locator('.call');
  if (await cards.count() && !shotCall) { await page.locator('.call').first().scrollIntoViewIfNeeded(); await shot('call'); shotCall = true; }
  for (let i = 0; i < await cards.count(); i++) {
    const opt = cards.nth(i).locator('.call-opt:not([disabled])').first();
    if (await opt.count()) await opt.click();
  }
}

await shot('title', true);
await page.click('.btn.stamp');
await page.click('.mate-card');
await page.click('.planbar button:has-text("Strategist")');
await endWeek();
await shot('paper1', true);
await page.click('.paper-actions .btn');
for (let w = 2; w <= 8; w++) {
  if (w === 3) await shot('hq-debate-week', true);
  await page.click('.planbar button:has-text("Strategist")');
  await endWeek();
  if (w === 4) await shot('paper4', true);
  await page.click('.paper-actions .btn');
}
await page.waitForSelector('.night');
await page.evaluate(() => window.warroom.night.skip());
await page.click('text=See how it was won');
await shot('result', true);
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
