import { api, can, typeByApi, type FieldDef } from '../core/index.js';
import { statusPill, clear, debounce, emptyState, errMsg, fmtDate, h, icon, pageHead, pill } from '../components/index.js';

const SHOWN = new Set(['text', 'slug', 'email', 'integer', 'float', 'boolean', 'enum', 'datetime', 'relation', 'media']);

export async function listView(apiId: string): Promise<HTMLElement> {
  const ct = typeByApi(apiId);
  if (!ct) return emptyState('Content type not found', 'It may have been deleted, or you may not have access to it.');
  const cols = ct.fields.filter((f) => SHOWN.has(f.type)).slice(0, 4);
  let page = 1, q = '', status = '', sort = 'created_at:desc';

  const host = h('div', { class: 'panel flush' });
  const pager = h('div', { class: 'pager' });
  const search = h('input', { class: 'input', type: 'search', placeholder: `Search ${ct.displayName.toLowerCase()}`, 'aria-label': 'Search', oninput: debounce(() => { q = search.value.trim(); page = 1; void load(); }, 250) });
  const statusSel = h('select', { class: 'input auto', 'aria-label': 'Filter by status', onchange: () => { status = statusSel.value; page = 1; void load(); } },
    h('option', { value: '' }, 'All statuses'), h('option', { value: 'published' }, 'Published'), h('option', { value: 'draft' }, 'Drafts'));

  const th = (label: string, key: string, cls = '') => {
    const [k, dir] = sort.split(':');
    return h('th', { class: cls, 'aria-sort': k === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button', { class: 'th-btn', onclick: () => { sort = k === key && dir === 'asc' ? `${key}:desc` : `${key}:asc`; void load(); } }, label, k === key ? icon(dir === 'asc' ? 'up' : 'down', 14) : null));
  };
  const sortable = (f: FieldDef) => !['richtext', 'longtext', 'json'].includes(f.type);
  const cell = (f: FieldDef, v: any) => {
    if (v === null || v === undefined || v === '') return h('span', { class: 'muted' }, '—');
    if (f.type === 'boolean') return pill(v ? 'Yes' : 'No', v ? 'ok' : 'muted');
    if (f.type === 'datetime') return fmtDate(v);
    if (f.type === 'relation') return h('code', null, `#${String(v).slice(0, 8)}`);
    if (f.type === 'media') return h('span', { class: 'muted' }, 'File');
    return h('span', { class: 'clip' }, String(v));
  };

  async function load() {
    clear(host); host.appendChild(h('p', { class: 'muted pad' }, 'Loading…'));
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '20', sort });
      if (q) p.set('q', q);
      if (status) p.set('filter[status][eq]', status);
      const r = await api<{ data: Record<string, any>[]; meta: { total: number; pageSize: number } }>('GET', `/api/content/${apiId}?${p}`);
      clear(host); clear(pager);
      if (!r.data.length) {
        host.appendChild(emptyState(q || status ? 'No matches' : `No ${ct!.displayName.toLowerCase()} yet`, q || status ? 'Try a different search or filter.' : 'Create the first entry to see it here.',
          !q && !status && can(`content:${apiId}:create`) ? h('a', { class: 'btn primary', href: `#/c/${apiId}/new` }, icon('plus', 16), 'New entry') : undefined));
        return;
      }
      host.appendChild(h('div', { class: 'scroll' }, h('table', { class: 'table clickable' },
        h('thead', null, h('tr', null,
          cols.map((f) => (sortable(f) ? th(f.label || f.name, f.name) : h('th', null, f.label || f.name))),
          h('th', null, 'Status'), th('Updated', 'updated_at'))),
        h('tbody', null, r.data.map((e) => {
          const href = `#/c/${apiId}/${e.id}`;
          return h('tr', { onclick: (ev: Event) => { if (!(ev.target as HTMLElement).closest('a')) location.hash = href; } },
            cols.map((f, i) => h('td', null, i === 0 ? h('a', { href }, cell(f, e[f.name])) : cell(f, e[f.name]))),
            h('td', null, statusPill(e.status)), h('td', { class: 'muted nowrap' }, fmtDate(e.updatedAt)));
        })))));
      const { total, pageSize } = r.meta;
      const from = (page - 1) * pageSize + 1, to = Math.min(page * pageSize, total);
      pager.append(h('span', { class: 'muted' }, `${from}–${to} of ${total}`),
        h('div', { class: 'row tight' },
          h('button', { class: 'btn sm', disabled: page <= 1, 'aria-label': 'Previous page', onclick: () => { page--; void load(); } }, icon('left', 14)),
          h('button', { class: 'btn sm', disabled: to >= total, 'aria-label': 'Next page', onclick: () => { page++; void load(); } }, icon('right', 14))));
    } catch (e) { clear(host); host.appendChild(emptyState('Could not load entries', errMsg(e))); }
  }

  const view = h('div', null,
    pageHead(ct.displayName, h('span', null, 'REST ', h('code', null, `GET /api/content/${apiId}`)),
      can(`content:${apiId}:create`) ? h('a', { class: 'btn primary', href: `#/c/${apiId}/new` }, icon('plus', 16), 'New entry') : null),
    h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search', 16), search), statusSel),
    host, pager);
  void load();
  return view;
}
