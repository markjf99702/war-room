// Plays the one-file build from disk, with confirm() blocked like a sandboxed frame:  node dev/single.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require((await import('node:path')).join((await import('node:child_process')).execSync('npm root -g').toString().trim(), 'playwright')); }
const b = await pw.chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errs.push('request: ' + r.url()); });
await page.addInitScript(() => { window.confirm = () => false; window.prompt = () => null; });
await page.goto('file://' + new URL('../dist/war-room.html', import.meta.url).pathname);
await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await page.click('text=Start a campaign');
await page.click('.mate-card');
for (let w = 1; w <= 8; w++) {
  await page.click('.planbar button:has-text("Strategist")');
  await page.click('.planbar .btn.stamp');
  await page.waitForSelector('.paper, .debate, [role="alertdialog"]');
  if (await page.locator('[role="alertdialog"]').count()) { await page.click('[role="alertdialog"] .btn.stamp'); await page.waitForSelector('.paper, .debate'); }
  if (await page.locator('.debate').count()) {
    for (let q = 0; q < 4; q++) { await page.click('.db-answer >> nth=1'); await page.click('.db-stage .btn'); }
    await page.click('.db-stage .btn');
    await page.waitForSelector('.paper');
  }
  const cards = page.locator('.call');
  for (let i = 0; i < await cards.count(); i++) {
    const opt = cards.nth(i).locator('.call-opt:not([disabled])');
    if (await opt.count()) await opt.first().click();
  }
  await page.click('.paper-actions .btn');
}
await page.waitForSelector('.night');
await page.evaluate(() => window.warroom.night.skip());
await page.click('text=See how it was won');
await page.screenshot({ path: new URL('./shots/single-result.png', import.meta.url).pathname });
// Starting over while nothing is in progress, and again from the title.
await page.click('text=Title screen');
console.log(errs.length ? errs.join('\n') : 'single file ok', await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
await b.close();
