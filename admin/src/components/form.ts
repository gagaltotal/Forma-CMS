import { h, type Child } from './dom.js';

/* Blok pembangun form & halaman. */
export function fieldRow(label: string, control: Node, opts: { help?: string; required?: boolean; error?: string; id?: string } = {}): HTMLElement {
  return h('div', { class: `field${opts.error ? ' invalid' : ''}` },
    h('label', { htmlFor: opts.id }, label, opts.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    control,
    opts.help ? h('p', { class: 'help' }, opts.help) : null,
    opts.error ? h('p', { class: 'error-text', role: 'alert' }, opts.error) : null);
}

export function toggle(checked: boolean, label: string, onChange?: (v: boolean) => void): { el: HTMLElement; input: HTMLInputElement } {
  const input = h('input', { type: 'checkbox', class: 'switch-input', onchange: () => onChange?.(input.checked) });
  input.checked = checked;
  return { input, el: h('label', { class: 'switch' }, input, h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', null, label)) };
}

export function pill(text: string, kind: 'ok' | 'warn' | 'muted' | 'danger' = 'muted'): HTMLElement {
  return h('span', { class: `pill ${kind}` }, text);
}

export function emptyState(title: string, text: string, action?: Node): HTMLElement {
  return h('div', { class: 'empty' }, h('h3', null, title), h('p', null, text), action);
}

export function pageHead(title: string, sub?: Child, ...actions: Child[]): HTMLElement {
  return h('header', { class: 'page-head' },
    h('div', null, h('h1', { tabindex: -1 }, title), sub ? h('p', { class: 'sub' }, sub) : null),
    h('div', { class: 'row' }, actions));
}

export const statusPill = (s: string): HTMLElement => pill(s === 'published' ? 'Published' : 'Draft', s === 'published' ? 'ok' : 'warn');
