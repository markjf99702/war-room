// Renders candidate country maps side by side for picking a seed:  node dev/preview-maps.mjs seed1 seed2 ...
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { makeCountry } from '../js/country.js';
import { corners } from '../js/hex.js';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require((await import('node:path')).join((await import('node:child_process')).execSync('npm root -g').toString().trim(), 'playwright')); }
const seeds = process.argv.slice(2);
const color = l => { const t = Math.max(-1, Math.min(1, l / 25)); return t > 0 ? `rgb(${Math.round(235 - 200 * t)},${Math.round(230 - 130 * t)},${Math.round(220 - 40 * t)})` : `rgb(${Math.round(235 - 20 * t * -1)},${Math.round(230 - 120 * -t)},${Math.round(220 - 190 * -t)})`; };
let html = '<body style="margin:0;background:#9fb8c0;display:flex;flex-wrap:wrap;gap:8px;font-family:sans-serif">';
for (const s of seeds) {
  const c = makeCountry(s);
  let svg = `<svg viewBox="-5 -5 ${c.width + 10} ${c.height + 10}" width="520"><rect x="-5" y="-5" width="${c.width + 10}" height="${c.height + 10}" fill="#a9c3cc"/>`;
  for (const h of c.hexes) if (h.land) svg += `<polygon points="${corners(h.x, h.y, 10.3).map(p => p.join(',')).join(' ')}" fill="${color(c.regions[h.region].lean)}"/>`;
  for (const [a, b] of c.edges.inner) svg += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#fff" stroke-width="1.2"/>`;
  for (const [a, b] of c.edges.coast) svg += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#334" stroke-width="1.6" stroke-linecap="round"/>`;
  for (const g of c.regions) svg += `<text x="${g.lx}" y="${g.ly}" font-size="7" text-anchor="middle" fill="#111">${g.name}</text><text x="${g.lx}" y="${g.ly + 8}" font-size="7" text-anchor="middle" font-weight="bold">${g.electors} ${g.lean > 0 ? 'T' : 'H'}+${Math.abs(g.lean).toFixed(0)}</text>`;
  for (const ct of c.cities) svg += `<circle cx="${ct.x}" cy="${ct.y}" r="2.5" fill="#000"/>`;
  svg += `<text x="4" y="12" font-size="10">${s}: ${c.regions.length} regions, ${c.hexes.filter(h => h.land).length} hexes</text></svg>`;
  html += svg;
}
await writeFile(new URL('./preview.html', import.meta.url), html);
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto(new URL('./preview.html', import.meta.url).href);
await p.screenshot({ path: new URL('./preview.png', import.meta.url).pathname, fullPage: true });
await b.close();
