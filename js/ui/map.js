// The board: Aldermere drawn as hexes, one filled shape per region, with labels and pieces on top.

import { SIZE } from '../hex.js';
import { s } from './dom.js';

let uid = 0;

function hexPath(h, r = SIZE + 0.06) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    d += `${i ? 'L' : 'M'}${(h.x + r * Math.cos(a)).toFixed(2)} ${(h.y + r * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
}

const seg = ([a, b]) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;

export function makeMap(country, { onPick, compact = false, cls = '' } = {}) {
  const id = `m${uid++}`;
  // Frame the land, not the whole grid it was cut from.
  const land = country.hexes.filter(h => h.land);
  const pad = 9;
  const x0 = Math.min(...land.map(h => h.x)) - SIZE - pad, x1 = Math.max(...land.map(h => h.x)) + SIZE + pad;
  const y0 = Math.min(...land.map(h => h.y)) - SIZE - pad, y1 = Math.max(...land.map(h => h.y)) + SIZE + pad;
  const vw = x1 - x0, vh = y1 - y0;
  const svg = s('svg', {
    viewBox: `${x0.toFixed(1)} ${y0.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`,
    class: `map ${cls}`, role: 'group', 'aria-label': 'Map of Aldermere',
  });
  const defs = s('defs', {},
    ...[['t', 'var(--tide)'], ['h', 'var(--high)'], ['n', 'var(--muted)']].map(([k, c]) =>
      s('pattern', { id: `${id}-hatch-${k}`, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
        s('rect', { width: 5, height: 5, fill: 'transparent' }),
        s('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: c, 'stroke-width': 2.2, 'stroke-opacity': 0.55 }))),
    s('pattern', { id: `${id}-sea`, width: 36, height: 18, patternUnits: 'userSpaceOnUse' },
      s('path', { d: 'M0 9 q4.5 -3 9 0 t9 0 t9 0 t9 0', fill: 'none', stroke: 'var(--sea-line)', 'stroke-width': 0.8 })),
    s('filter', { id: `${id}-lift`, x: '-30%', y: '-30%', width: '160%', height: '160%' },
      s('feDropShadow', { dx: 0, dy: 1, stdDeviation: 0.9, 'flood-color': '#000', 'flood-opacity': 0.35 })),
  );
  svg.append(defs);
  svg.append(s('rect', { x: x0, y: y0, width: vw, height: vh, fill: 'var(--sea)', class: 'sea' }));
  svg.append(s('rect', { x: x0, y: y0, width: vw, height: vh, fill: `url(#${id}-sea)` }));

  // A soft shadow under the land, so it sits on the sea like a board piece.
  const landD = land.map(h => hexPath(h, SIZE + 0.4)).join('');
  svg.append(s('path', { d: landD, fill: 'var(--land-shadow)', transform: 'translate(1.6 2.4)' }));

  const regionEls = [], hatchEls = [];
  const gRegions = s('g', { class: 'regions' });
  const gHatch = s('g', { class: 'hatches', 'pointer-events': 'none' });
  for (const g of country.regions) {
    const d = g.hexes.map(i => hexPath(country.hexes[i])).join('');
    const el = s('path', { d, class: 'reg', 'data-k': g.id, fill: 'var(--r-tu)' });
    el.append(s('title', {}, g.name));
    regionEls.push(el); gRegions.append(el);
    const hx = s('path', { d, class: 'hatch', fill: 'none' });
    hatchEls.push(hx); gHatch.append(hx);
  }
  svg.append(gRegions, gHatch);
  svg.append(s('path', { d: country.edges.inner.map(seg).join(''), class: 'borders', fill: 'none', 'pointer-events': 'none' }));
  svg.append(s('path', { d: country.edges.coast.map(seg).join(''), class: 'coast', fill: 'none', 'pointer-events': 'none' }));

  const outline = k => [...country.edges.inner.filter(e => e[2] === k || e[3] === k), ...country.edges.coast.filter(e => e[2] === k)].map(seg).join('');
  const selEl = s('path', { class: 'sel', fill: 'none', 'pointer-events': 'none', d: '' });
  svg.append(selEl);
  const markEls = new Map();
  const gMarks = s('g', { class: 'marks', 'pointer-events': 'none' });
  svg.append(gMarks);

  // Cities.
  const gCities = s('g', { class: 'cities', 'pointer-events': 'none' });
  for (const c of country.cities) {
    gCities.append(c.capital
      ? s('path', { d: starPath(c.x, c.y, 3.6, 1.6), class: 'city capital' })
      : s('circle', { cx: c.x, cy: c.y, r: 2.1, class: 'city' }));
  }
  svg.append(gCities);

  // Labels: the region's name and its electors.
  const labelEls = [];
  const gLabels = s('g', { class: 'labels', 'pointer-events': 'none' });
  for (const g of country.regions) {
    const name = s('text', { x: g.lx, y: g.ly - 5.5, class: 'rname', 'text-anchor': 'middle' }, g.name.toUpperCase());
    const badge = s('g', { class: 'badge', transform: `translate(${g.lx} ${g.ly + 3.5})` },
      s('rect', { x: -7, y: -5.6, width: 14, height: 11.2, rx: 5.6 }),
      s('text', { x: 0, y: 0.2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, String(g.electors)));
    const lab = s('g', { class: 'lab', 'data-k': g.id }, name, badge);
    labelEls.push({ lab, name, badge });
    gLabels.append(lab);
  }
  svg.append(gLabels);
  // Where two names would collide, the region with fewer electors shows only its number.
  const boxes = [];
  const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  for (const g of country.regions) boxes.push({ x0: g.lx - 7.5, x1: g.lx + 7.5, y0: g.ly - 2.5, y1: g.ly + 9.5 });
  const order = [...country.regions].sort((a, b) => b.electors - a.electors || b.size - a.size);
  const kept = [];
  for (const g of order) {
    const w = g.name.length * 6.1 + 4;
    const box = { x0: g.lx - w / 2, x1: g.lx + w / 2, y0: g.ly - 15, y1: g.ly - 2.5 };
    const clash = kept.some(b => overlaps(b, box)) || boxes.some((b, j) => j !== g.id && overlaps(b, box));
    if (clash) labelEls[g.id].lab.classList.add('small');
    else kept.push({ ...box, id: g.id });
  }

  const gTokens = s('g', { class: 'tokens', 'pointer-events': 'none', filter: `url(#${id}-lift)` });
  svg.append(gTokens);
  // Pieces sit on a hex of their own region: below the label if there's room, else beside or above it.
  const tokenEls = country.regions.map(g => {
    const spot = country.hexes.find(hx => hx.land && Math.abs(hx.x - g.lx) < 0.5 && Math.abs(hx.y - g.ly) < 0.5);
    const inside = dir => { const j = spot?.nb[dir]; return j >= 0 && country.hexes[j].land && country.hexes[j].region === g.id; };
    const options = [];
    if (inside(1) && inside(2)) options.push([g.lx, g.ly + 15]);
    if (inside(1)) options.push([g.lx + 8.7, g.ly + 15]);
    if (inside(2)) options.push([g.lx - 8.7, g.ly + 15]);
    if (inside(4) && inside(5)) options.push([g.lx, g.ly - 21]);
    options.push([g.lx, g.ly + 15]);
    // Prefer a spot that doesn't sit on another region's name.
    const clear = ([x, y]) => !kept.some(b => b.id !== g.id && overlaps(b, { x0: x - 18, x1: x + 18, y0: y - 6, y1: y + 6 }));
    const [tx, ty] = options.find(clear) || options[0];
    const t = s('g', { transform: `translate(${tx.toFixed(1)} ${ty.toFixed(1)})` });
    gTokens.append(t);
    return t;
  });

  svg.addEventListener('click', e => {
    const t = e.target.closest('[data-k]');
    if (onPick) onPick(t ? +t.dataset.k : null);
  });

  return {
    svg, id,
    fill(k, color) { regionEls[k].setAttribute('fill', color); },
    hatch(k, key) { hatchEls[k].setAttribute('fill', key ? `url(#${id}-hatch-${key})` : 'none'); },
    regionClass(k, name, on) { regionEls[k].classList.toggle(name, on); },
    labelClass(k, name, on) { labelEls[k].lab.classList.toggle(name, on); },
    select(k) {
      selEl.setAttribute('d', k === null || k === undefined ? '' : outline(k));
      regionEls.forEach((el, j) => el.classList.toggle('picked', j === k));
      labelEls.forEach((l, j) => l.lab.classList.toggle('on', j === k));
    },
    // A second outline layer, for marking regions (the tipping point, the rival's targets…).
    mark(k, cls) {
      if (markEls.has(k)) { markEls.get(k).remove(); markEls.delete(k); }
      if (cls) { const el = s('path', { d: outline(k), class: `mark ${cls}`, fill: 'none' }); gMarks.append(el); markEls.set(k, el); }
    },
    clearMarks() { for (const el of markEls.values()) el.remove(); markEls.clear(); },
    tokens(k, glyphs) {
      const t = tokenEls[k];
      t.replaceChildren();
      const w = glyphs.reduce((a, gl) => a + gl.w, 0) + (glyphs.length - 1) * 1.5;
      let x = -w / 2;
      for (const gl of glyphs) {
        const wrap = s('g', { transform: `translate(${(x + gl.w / 2).toFixed(2)} 0)` }, gl.el);
        t.append(wrap);
        x += gl.w + 1.5;
      }
    },
    badgeText(k, text) { labelEls[k].badge.querySelector('text').textContent = text; },
  };
}

function starPath(x, y, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r : R, a = Math.PI / 5 * i - Math.PI / 2;
    d += `${i ? 'L' : 'M'}${(x + rad * Math.cos(a)).toFixed(2)} ${(y + rad * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
}

// ---------------------------------------------------------------- pieces

const col = side => (side === 0 ? 'var(--tide)' : 'var(--high)');

export const glyph = {
  pawn(side, letter, big = true) {
    const r = big ? 6.2 : 4.8;
    return { w: r * 2, el: s('g', { class: 'pawn' },
      s('circle', { r, fill: col(side), stroke: 'var(--token-ring)', 'stroke-width': 1.3 }),
      s('text', { y: 0.3, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: big ? 'pawn-l' : 'pawn-s' }, letter)) };
  },
  ghost(side, letter) {
    return { w: 9.6, el: s('g', { class: 'ghost' },
      s('circle', { r: 4.8, fill: 'var(--token-ghost)', stroke: col(side), 'stroke-width': 1.1, 'stroke-dasharray': '1.6 1.2' }),
      s('text', { y: 0.3, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'pawn-s', fill: col(side) }, letter)) };
  },
  ads(side, level, faint = false) {
    const g = s('g', { class: 'ads', opacity: faint ? 0.75 : 1 });
    g.append(s('rect', { x: -5.2, y: -4.2, width: 10.4, height: 8.4, rx: 1.6, fill: 'var(--token-bg)', stroke: col(side), 'stroke-width': 1 }));
    for (let i = 0; i < 3; i++) {
      const hgt = 2 + i * 1.4;
      g.append(s('rect', { x: -3.4 + i * 2.5, y: 2.6 - hgt, width: 1.8, height: hgt, fill: i < level ? col(side) : 'var(--token-off)' }));
    }
    return { w: 10.4, el: g };
  },
  office(side) {
    return { w: 8, el: s('g', { class: 'office' },
      s('rect', { x: -4, y: -4.2, width: 8, height: 8.4, rx: 1.6, fill: 'var(--token-bg)', stroke: col(side), 'stroke-width': 1 }),
      s('path', { d: 'M-1.6 3V-2.8M-1.6 -2.8L2.6 -1.4L-1.6 0', stroke: col(side), 'stroke-width': 1.1, fill: col(side), 'stroke-linejoin': 'round' })) };
  },
  poll() {
    return { w: 8, el: s('g', { class: 'pollg' },
      s('rect', { x: -4, y: -4.2, width: 8, height: 8.4, rx: 1.6, fill: 'var(--token-bg)', stroke: 'var(--ink)', 'stroke-width': 0.9 }),
      s('path', { d: 'M-2.2 0.2L-0.6 1.8L2.4 -1.6', stroke: 'var(--ink)', 'stroke-width': 1.2, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) };
  },
};
