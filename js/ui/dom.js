// Small helpers for building the page.

const SVG_NS = 'http://www.w3.org/2000/svg';

function build(el, attrs, kids) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const h = (tag, attrs, ...kids) => build(document.createElement(tag), attrs, kids);
export const s = (tag, attrs, ...kids) => build(document.createElementNS(SVG_NS, tag), attrs, kids);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const PARTY = ['Tidewater', 'Highland'];
export const PARTY_SHORT = ['T', 'H'];

// "T +2.1" / "H +0.4"
export function margin(m, digits = 1) {
  if (m === null || m === undefined || Number.isNaN(m)) return '—';
  const v = Math.abs(m).toFixed(digits);
  if (+v === 0) return 'Even';
  return `${m > 0 ? 'T' : 'H'} +${v}`;
}

export function marginLong(m, digits = 1) {
  const v = Math.abs(m).toFixed(digits);
  if (+v === 0) return 'dead even';
  return `${m > 0 ? 'Tidewater' : 'Highland'} +${v}`;
}

export const money = n => `$${Math.round(n)}M`;
export const pct = (p, d = 0) => `${(p * 100).toFixed(d)}%`;
export const num = n => Math.round(n).toLocaleString('en-US');

// A chance, said the way a forecaster would round it.
export function chance(p) {
  if (p >= 0.995) return '>99%';
  if (p <= 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}

export function plural(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

// Campaign calendar: week 1 starts Monday, September 7; election day is Tuesday, November 3.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function mondayOf(week) {
  const d = new Date(Date.UTC(2026, 8, 7 + (week - 1) * 7));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
