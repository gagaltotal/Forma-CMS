import { h } from './dom.js';
import { toast } from './toast.js';

/* ---------- Editor rich text: sanitasi allowlist di klien (defense-in-depth; server tetap membersihkan) ---------- */

const ALLOWED: Record<string, string[]> = {
  P: [], BR: [], HR: [], STRONG: [], B: [], EM: [], I: [], U: [], S: [], BLOCKQUOTE: [], CODE: [], PRE: [], SPAN: [],
  UL: [], OL: [], LI: [], H1: [], H2: [], H3: [], H4: [], H5: [], H6: [], A: ['href', 'title'], IMG: ['src', 'alt', 'title'],
  FIGURE: [], FIGCAPTION: [], TABLE: [], THEAD: [], TBODY: [], TR: [], TH: [], TD: [],
};

const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT']);

function okUrl(u: string, img: boolean): boolean {
  try {
    const p = new URL(u, location.origin).protocol;
    return p === 'https:' || p === 'http:' || (!img && (p === 'mailto:' || p === 'tel:'));
  } catch { return false; }
}

function copyInto(dst: Node, src: Node): void {
  for (const n of Array.from(src.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) { dst.appendChild(document.createTextNode(n.textContent ?? '')); continue; }
    if (n.nodeType !== Node.ELEMENT_NODE) continue;
    const e = n as Element;
    if (DROP.has(e.tagName)) continue;
    const allow = ALLOWED[e.tagName];
    if (!allow) { copyInto(dst, e); continue; }
    const c = document.createElement(e.tagName.toLowerCase());
    for (const a of allow) {
      const v = e.getAttribute(a);
      if (v === null) continue;
      if ((a === 'href' || a === 'src') && !okUrl(v, a === 'src')) continue;
      c.setAttribute(a, v);
    }
    copyInto(c, e);
    dst.appendChild(c);
  }
}

export function richEditor(initial: string): { el: HTMLElement; get: () => string } {
  const area = h('div', { class: 'rte-area', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Rich text' });
  copyInto(area, new DOMParser().parseFromString(initial || '', 'text/html').body); // DOMParser = dokumen inert (tanpa eksekusi script)
  const cmd = (c: string, v?: string) => { area.focus(); document.execCommand(c, false, v); };
  const btn = (label: string, title: string, fn: () => void) =>
    h('button', { type: 'button', class: 'rte-btn', title, 'aria-label': title, onmousedown: (e: Event) => e.preventDefault(), onclick: fn }, label);
  const bar = h('div', { class: 'rte-bar', role: 'toolbar', 'aria-label': 'Formatting' },
    btn('B', 'Bold', () => cmd('bold')), btn('I', 'Italic', () => cmd('italic')),
    btn('H2', 'Heading', () => cmd('formatBlock', 'H2')), btn('¶', 'Paragraph', () => cmd('formatBlock', 'P')),
    btn('• List', 'Bulleted list', () => cmd('insertUnorderedList')), btn('1. List', 'Numbered list', () => cmd('insertOrderedList')),
    btn('Quote', 'Quote', () => cmd('formatBlock', 'BLOCKQUOTE')),
    btn('Link', 'Insert link', () => {
      const u = window.prompt('Link address (https://…)');
      if (u && okUrl(u, false)) cmd('createLink', u); else if (u) toast('Only http, https, mailto and tel links are allowed', 'err');
    }),
    btn('Clear', 'Clear formatting', () => cmd('removeFormat')));
  return { el: h('div', { class: 'rte' }, bar, area), get: () => area.innerHTML };
}
