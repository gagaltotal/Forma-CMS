import { api, can, uploadFile, type MediaItem } from '../core/index.js';
import { clear, confirmBox, copyText, debounce, emptyState, errMsg, fieldRow, fmtSize, h, icon, modal, pageHead, toast } from '../components/index.js';
import { tileThumb } from '../components/index.js';

export async function mediaView(): Promise<HTMLElement> {
  if (!can('media:read')) return emptyState('Access restricted', 'You need permission to view the media library.');
  let page = 1, q = '';
  const grid = h('div', { class: 'media-grid' });
  const more = h('div', { class: 'pager center' });
  const canUpload = can('media:upload');
  const file = h('input', { type: 'file', multiple: true, hidden: true, accept: 'image/png,image/jpeg,image/gif,image/webp,application/pdf', onchange: () => void upload([...(file.files ?? [])]) });

  async function upload(files: File[]) {
    for (const f of files) {
      try { await uploadFile(f); toast(`Uploaded ${f.name}`); } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    file.value = ''; page = 1; await load(true);
  }

  function detail(m: MediaItem) {
    const name = h('input', { class: 'input', value: m.name, maxLength: 120 });
    const alt = h('input', { class: 'input', value: m.alt, maxLength: 300, placeholder: 'Describe the image for screen readers' });
    const dlg = modal({
      title: 'File details', wide: true,
      body: h('div', { class: 'detail' },
        h('div', { class: 'preview-box' }, tileThumb(m)),
        h('div', { class: 'stack' },
          fieldRow('File name', name), fieldRow('Alternative text', alt),
          fieldRow('Public URL', h('div', { class: 'row tight' }, h('input', { class: 'input mono', readOnly: true, value: m.url }), h('button', { class: 'btn', onclick: () => void copyText(m.url) }, icon('copy', 16), 'Copy'))),
          h('p', { class: 'muted small' }, `${m.mime} · ${fmtSize(m.size)}`))),
      footer: h('div', { class: 'row between' },
        can('media:delete') ? h('button', { class: 'btn danger ghost', onclick: async () => {
          if (!(await confirmBox({ title: 'Delete this file?', message: 'Entries that use it will lose the reference. This cannot be undone.', confirm: 'Delete file', danger: true }))) return;
          try { await api('DELETE', `/api/media/${m.id}`); dlg.close(); toast('File deleted'); await load(true); } catch (e) { toast(errMsg(e), 'err'); }
        } }, icon('trash', 16), 'Delete') : h('span'),
        canUpload ? h('button', { class: 'btn primary', onclick: async () => {
          try { await api('PATCH', `/api/media/${m.id}`, { name: name.value, alt: alt.value }); dlg.close(); toast('Saved'); await load(true); } catch (e) { toast(errMsg(e), 'err'); }
        } }, 'Save changes') : h('span')),
    });
  }

  async function load(reset: boolean) {
    if (reset) { clear(grid); page = 1; }
    clear(more);
    try {
      const r = await api<{ data: MediaItem[]; meta: { total: number; pageSize: number } }>('GET', `/api/media?page=${page}&pageSize=30${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      if (reset && !r.data.length) { grid.appendChild(emptyState(q ? 'No matching files' : 'Your library is empty', q ? 'Try another search.' : 'Drag files here or use Upload. PNG, JPEG, GIF, WebP and PDF are supported.')); return; }
      for (const m of r.data) grid.appendChild(h('button', { class: 'tile', title: m.name, onclick: () => detail(m) }, tileThumb(m), h('span', { class: 'tile-name' }, m.name), h('small', { class: 'muted' }, fmtSize(m.size))));
      if (page * r.meta.pageSize < r.meta.total) more.appendChild(h('button', { class: 'btn', onclick: () => { page++; void load(false); } }, 'Load more'));
    } catch (e) { grid.appendChild(emptyState('Could not load files', errMsg(e))); }
  }

  const drop = h('div', { class: 'dropzone', 'aria-label': 'Media library' },
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search', 16), h('input', { class: 'input', type: 'search', placeholder: 'Search by file name', 'aria-label': 'Search files', oninput: debounce((e: Event) => { q = (e.target as HTMLInputElement).value.trim(); void load(true); }, 250) }))),
    grid, more);
  if (canUpload) {
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); void upload([...(e.dataTransfer?.files ?? [])]); });
  }
  const view = h('div', null, pageHead('Media library', 'Images and documents you can attach to any entry.', canUpload ? h('button', { class: 'btn primary', onclick: () => file.click() }, icon('upload', 16), 'Upload') : null, file), drop);
  void load(true);
  return view;
}
