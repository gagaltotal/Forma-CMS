import { api, can, state } from '../core/index.js';
import { emptyState, h, icon, pageHead } from '../components/index.js';

export async function dashboardView(): Promise<HTMLElement> {
  const readable = state.types.filter((t) => can(`content:${t.apiId}:read`));
  const rows = await Promise.all(readable.map(async (t) => {
    try { return { t, total: (await api<{ meta: { total: number } }>('GET', `/api/content/${t.apiId}?pageSize=1`)).meta.total }; }
    catch { return { t, total: null as number | null }; }
  }));
  const first = state.me?.name.split(' ')[0] ?? '';
  const view = h('div', null, pageHead(`Hello, ${first}`, 'Here is what is in your workspace.'));
  if (!state.types.length) {
    view.appendChild(emptyState('Nothing modelled yet', 'Content types define the shape of your content: articles, products, anything you need.',
      can('schema:manage') ? h('a', { class: 'btn primary', href: '#/builder/new' }, icon('plus', 16), 'Create a content type') : undefined));
    return view;
  }
  view.appendChild(h('div', { class: 'panel flush' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, h('th', null, 'Content type'), h('th', { class: 'num' }, 'Entries'), h('th', null, 'REST endpoint'))),
    h('tbody', null, rows.map(({ t, total }) => h('tr', null,
      h('td', null, h('a', { href: `#/c/${t.apiId}` }, t.displayName)),
      h('td', { class: 'num' }, total ?? '—'),
      h('td', null, h('code', null, `/api/content/${t.apiId}`)))))))
  );
  return view;
}
