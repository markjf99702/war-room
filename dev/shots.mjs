// Quick look at every screen:  node dev/shots.mjs [width] [height]
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
page.on('dialog', d => d.accept().catch(() => {}));
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:8080/?c=shots1&p=0&d=normal');
await page.evaluate(() => document.fonts.ready);
const tag = `${W}${dark ? '-dark' : ''}`;
const shot = async (name, full = false) => { await page.waitForTimeout(250); await page.screenshot({ path: `${out}${tag}-${name}.png`, fullPage: full }); };
await shot('title', true);
await page.click('.btn.stamp');
await shot('ticket', true);
await page.click('.mate-card');
await shot('hq');
// Select a region and plan there.
await page.evaluate(() => { const k = window.warroom.country.regions.findIndex(g => g.name === 'New Aldham'); document.querySelector(`.reg[data-k="${k}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
await page.waitForTimeout(400);
await shot('region', true);
await page.click('.planbar button:has-text("Strategist")');
await page.waitForTimeout(300);
await shot('strategist');
await page.click('.tabs button[data-tab="forecast"]');
await shot('forecast', true);
await page.click('.tabs button[data-tab="map"]');
await page.click('text=End week →');
await page.waitForTimeout(300);
await shot('paper', true);
await page.screenshot({ path: `${out}${tag}-paper-full.png`, fullPage: false });
await page.click('.paper-actions .btn');
for (let i = 0; i < 7; i++) {
  await page.click('.planbar button:has-text("Strategist")');
  await page.click('.planbar .btn.stamp');

  await page.waitForTimeout(200);
  if (i < 6) await page.click('.paper-actions .btn');
}
await shot('paper8');
await page.click('.paper-actions .btn');
await page.waitForTimeout(3500);
await shot('night-early');
await page.evaluate(() => window.warroom.night.at(21 * 60 + 40));
await page.evaluate(() => window.warroom.night.pause());
await shot('night-mid', true);
await page.evaluate(() => window.warroom.night.skip());
await shot('night-end', true);
await page.click('text=See how it was won');
await shot('result', true);
await page.click('.layer-tabs button:nth-child(2)');
await shot('result-theirs');
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
