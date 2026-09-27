// Small SVG charts: the electors histogram, the snake of regions, a chance-over-time line, the needle.

import { s } from './dom.js';

const col = side => (side === 0 ? 'var(--tide)' : 'var(--high)');

// How many electors side s won across all the simulated elections.
export function histogram(hist, majority, total, s0) {
  const W = 340, H = 120, top = 8, bottom = 22;
  const lo = Math.max(0, Math.min(...hist.map((c, e) => (c ? e : Infinity))) - 3);
  const hi = Math.min(total, Math.max(...hist.map((c, e) => (c ? e : -1))) + 3);
  const max = Math.max(...hist);
  const n = hi - lo + 1;
  const bw = W / n;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'How many electors you won across the simulated elections' });
  for (let e = lo; e <= hi; e++) {
    const c = hist[e] || 0;
    if (!c) continue;
    const h = (H - top - bottom) * c / max;
    svg.append(s('rect', { x: (e - lo) * bw + 0.5, y: H - bottom - h, width: Math.max(1, bw - 1), height: h, fill: e >= majority ? col(s0) : col(1 - s0), opacity: 0.9 }));
  }
  const mx = (majority - lo) * bw;
  svg.append(s('line', { x1: mx, x2: mx, y1: 0, y2: H - bottom + 4, stroke: 'var(--ink)', 'stroke-width': 1.2, 'stroke-dasharray': '3 2' }));
  svg.append(s('text', { x: mx + 4, y: 10, class: 'strong' }, `${majority} to win`));
  for (let e = Math.ceil(lo / 10) * 10; e <= hi; e += 10) {
    svg.append(s('text', { x: (e - lo) * bw + bw / 2, y: H - 6, 'text-anchor': 'middle' }, String(e)));
  }
  return svg;
}

// Regions lined up from the safest for one side to the safest for the other, as wide as their electors.
export function snake(items, majority, total, { onPick } = {}) {
  const W = 340, H = 64, y0 = 18, bh = 26;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart snake', role: 'img', 'aria-label': 'Regions ordered from safest Tidewater to safest Highland' });
  let x = 0;
  for (const it of items) {
    const w = W * it.electors / total;
    const r = s('rect', { x: x + 0.4, y: y0, width: Math.max(0.5, w - 0.8), height: bh, fill: `var(--r-${it.rating})`, rx: 1.5, 'data-k': it.k, style: 'cursor:pointer' });
    r.append(s('title', {}, `${it.name}: ${it.label}`));
    svg.append(r);
    if (it.tip) svg.append(s('rect', { x: x + 0.4, y: y0 - 3, width: Math.max(0.5, w - 0.8), height: bh + 6, fill: 'none', stroke: 'var(--stamp)', 'stroke-width': 1.6, rx: 2 }));
    if (w > 16) svg.append(s('text', { x: x + w / 2, y: y0 + bh / 2 + 4, 'text-anchor': 'middle', style: 'font-size:9.5px;font-weight:800;fill:var(--ink);pointer-events:none' }, String(it.electors)));
    x += w;
  }
  const mx = W * majority / total;
  svg.append(s('line', { x1: mx, x2: mx, y1: y0 - 6, y2: y0 + bh + 6, stroke: 'var(--ink)', 'stroke-width': 1.4 }));
  svg.append(s('text', { x: 2, y: 11, class: 'strong', style: 'fill:var(--tide)' }, '◀ Tidewater'));
  svg.append(s('text', { x: W - 2, y: 11, 'text-anchor': 'end', class: 'strong', style: 'fill:var(--high)' }, 'Highland ▶'));
  svg.append(s('text', { x: mx, y: H - 2, 'text-anchor': 'middle' }, `${majority}`));
  if (onPick) svg.addEventListener('click', e => { const t = e.target.closest('[data-k]'); if (t) onPick(+t.dataset.k); });
  return svg;
}

// Your chance of winning, week by week.
export function chanceLine(points, side) {
  const W = 340, H = 110, L = 28, R = 8, T = 8, B = 20;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Your chance of winning, week by week' });
  const x = w => L + (W - L - R) * (w - 1) / 7;
  const y = p => T + (H - T - B) * (1 - p);
  for (const p of [0, 0.5, 1]) {
    svg.append(s('line', { x1: L, x2: W - R, y1: y(p), y2: y(p), stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': p === 0.5 ? '3 3' : '' }));
    svg.append(s('text', { x: L - 4, y: y(p) + 4, 'text-anchor': 'end' }, `${p * 100}%`));
  }
  for (let w = 1; w <= 8; w++) svg.append(s('text', { x: x(w), y: H - 5, 'text-anchor': 'middle' }, `W${w}`));
  if (points.length) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)} ${y(p.p).toFixed(1)}`).join('');
    svg.append(s('path', { d, fill: 'none', stroke: col(side), 'stroke-width': 2.4, 'stroke-linejoin': 'round' }));
    for (const p of points) svg.append(s('circle', { cx: x(p.week), cy: y(p.p), r: 3, fill: col(side) }));
  }
  return svg;
}

// The national tracking poll.
export function natLine(polls) {
  const W = 340, H = 110, L = 34, R = 8, T = 8, B = 20;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'National polls, week by week' });
  const lim = Math.max(4, Math.ceil(Math.max(...polls.map(p => Math.abs(p.m))) + 1));
  const x = w => L + (W - L - R) * w / 8;
  const y = m => T + (H - T - B) * (lim - m) / (2 * lim);
  svg.append(s('rect', { x: L, y: T, width: W - L - R, height: y(0) - T, fill: 'var(--tide-soft)' }));
  svg.append(s('rect', { x: L, y: y(0), width: W - L - R, height: H - B - y(0), fill: 'var(--high-soft)' }));
  svg.append(s('text', { x: L - 4, y: y(lim) + 9, 'text-anchor': 'end', style: 'fill:var(--tide);font-weight:800' }, `T+${lim}`));
  svg.append(s('text', { x: L - 4, y: y(0) + 4, 'text-anchor': 'end' }, '0'));
  svg.append(s('text', { x: L - 4, y: y(-lim) - 2, 'text-anchor': 'end', style: 'fill:var(--high);font-weight:800' }, `H+${lim}`));
  for (let w = 0; w <= 8; w += 2) svg.append(s('text', { x: x(w), y: H - 5, 'text-anchor': 'middle' }, w ? `W${w}` : 'Start'));
  const d = polls.map((p, i) => `${i ? 'L' : 'M'}${x(p.week).toFixed(1)} ${y(p.m).toFixed(1)}`).join('');
  svg.append(s('path', { d, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  for (const p of polls) svg.append(s('circle', { cx: x(p.week), cy: y(p.m), r: 2.6, fill: p.m >= 0 ? 'var(--tide)' : 'var(--high)' }));
  return svg;
}

// The election-night needle: a half-dial from "Highland" to "Tidewater".
export function needleGauge() {
  const W = 240, H = 150, cx = 120, cy = 108, R = 98;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart needle', role: 'img', 'aria-label': 'Chance of winning' });
  const bands = [[0, 0.05, 'var(--r-h3)'], [0.05, 0.2, 'var(--r-h2)'], [0.2, 0.4, 'var(--r-h1)'], [0.4, 0.6, 'var(--r-tu)'], [0.6, 0.8, 'var(--r-t1)'], [0.8, 0.95, 'var(--r-t2)'], [0.95, 1, 'var(--r-t3)']];
  const pt = (p, r) => { const a = Math.PI * (1 - p); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  for (const [a, b, c] of bands) {
    const [x1, y1] = pt(a, R), [x2, y2] = pt(b, R), [x3, y3] = pt(b, R - 24), [x4, y4] = pt(a, R - 24);
    svg.append(s('path', { d: `M${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${R - 24} ${R - 24} 0 0 0 ${x4} ${y4}Z`, fill: c, stroke: 'var(--paper)', 'stroke-width': 1 }));
  }
  svg.append(s('text', { x: cx - R + 12, y: cy + 16, 'text-anchor': 'middle', style: 'fill:var(--high);font-weight:800;font-size:11.5px' }, 'Highland'));
  svg.append(s('text', { x: cx + R - 12, y: cy + 16, 'text-anchor': 'middle', style: 'fill:var(--tide);font-weight:800;font-size:11.5px' }, 'Tidewater'));
  const needle = s('g', { style: 'transition: transform .6s cubic-bezier(.3,1.4,.5,1)' },
    s('path', { d: `M${cx - 3} ${cy}L${cx} ${cy - R + 10}L${cx + 3} ${cy}Z`, fill: 'var(--ink)' }),
    s('circle', { cx, cy, r: 6.5, fill: 'var(--ink)' }));
  svg.append(needle);
  const label = s('text', { x: cx, y: H - 6, 'text-anchor': 'middle', style: 'font-family:var(--display);font-weight:900;font-size:30px;fill:var(--ink)' }, '');
  svg.append(label);
  return {
    svg,
    set(pT, text) {
      const deg = (pT - 0.5) * 180;
      needle.style.transformOrigin = `${cx}px ${cy}px`;
      needle.style.transform = `rotate(${deg}deg)`;
      label.textContent = text;
    },
  };
}
