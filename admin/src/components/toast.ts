import { h, icon } from './dom.js';

export function toast(message: string, kind: 'ok' | 'err' = 'ok'): void {
  let host = document.getElementById('toasts');
  if (!host) { host = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(host); }
  const t = h('div', { class: `toast ${kind}` }, icon(kind === 'ok' ? 'check' : 'x', 16), h('span', null, message));
  host.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3200);
}
