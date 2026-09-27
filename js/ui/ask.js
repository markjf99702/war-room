// A yes/no question in the page itself (some hosts block the browser's own confirm box).

import { h } from './dom.js';

export function ask(question, { yes = 'Yes', no = 'Cancel', detail = '' } = {}) {
  return new Promise(resolve => {
    const done = answer => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(answer); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    const yesBtn = h('button', { type: 'button', class: 'btn stamp', onclick: () => done(true) }, yes);
    const sheet = h('div', { class: 'sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': question, style: 'max-width:440px' },
      h('p', { style: 'font-size:18px;font-weight:700;margin:0 0 6px' }, question),
      detail ? h('p', { style: 'margin:0 0 4px;color:var(--muted)' }, detail) : null,
      h('div', { class: 'paper-actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => done(false) }, no),
        yesBtn));
    const overlay = h('div', { class: 'overlay', style: 'align-items:center', onclick: e => { if (e.target === overlay) done(false); } }, sheet);
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    yesBtn.focus();
  });
}
