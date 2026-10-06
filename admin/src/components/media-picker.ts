import { api, ApiError, uploadFile, type MediaItem } from '../core/index.js';
import { clear, h, icon } from './dom.js';
import { debounce } from './format.js';
import { modal } from './modal.js';
import { toast } from './toast.js';

/* ---------- Pemilih media ---------- */
export function pickMedia(): Promise<MediaItem | null> {
  return new Promise((resolve) => {
    let chosen: MediaItem | null = null;
    const grid = h('div', { class: 'media-grid small' });
    const load = async (q = '') => {
      clear(grid);
      grid.appendChild(h('p', { class: 'muted' }, 'Loading…'));
      try {
        const r = await api<{ data: MediaItem[] }>('GET', `/api/media?pageSize=48${q ? `&q=${encodeURIComponent(q)}` : ''}`);
        clear(grid);
        if (!r.data.length) grid.appendChild(h('p', { class: 'muted' }, 'No files yet. Upload one to get started.'));
        for (const m of r.data) {
          grid.appendChild(h('button', { type: 'button', class: 'tile', title: m.name, onclick: () => { chosen = m; dlg.close(); } }, tileThumb(m), h('span', { class: 'tile-name' }, m.name)));
        }
      } catch (e) { clear(grid); grid.appendChild(h('p', { class: 'error-text' }, (e as ApiError).message)); }
    };
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,application/pdf', hidden: true, onchange: async () => {
      const f = file.files?.[0]; if (!f) return;
      try { chosen = await uploadFile(f); dlg.close(); } catch (e) { toast((e as ApiError).message, 'err'); }
    } });
    const dlg = modal({
      title: 'Choose a file', wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'row' },
          h('input', { class: 'input', type: 'search', placeholder: 'Search by file name', 'aria-label': 'Search files', oninput: debounce((e: Event) => void load((e.target as HTMLInputElement).value), 250) }),
          h('button', { type: 'button', class: 'btn', onclick: () => file.click() }, icon('upload', 16), 'Upload new'), file),
        grid),
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(dlg.el)) { obs.disconnect(); resolve(chosen); } });
    obs.observe(document.body, { childList: true });
    void load();
  });
}

export function tileThumb(m: MediaItem): HTMLElement {
  return m.mime.startsWith('image/')
    ? h('img', { class: 'thumb', src: m.url.replace(location.origin, ''), alt: m.alt || m.name, loading: 'lazy' })
    : h('span', { class: 'thumb file' }, icon('file', 28), h('small', null, m.mime === 'application/pdf' ? 'PDF' : 'FILE'));
}
