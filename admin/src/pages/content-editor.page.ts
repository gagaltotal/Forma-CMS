import { api, ApiError, can, entryLabel, typeByApi, type FieldDef } from '../core/index.js';
import { buildField, type FieldEditor } from '../components/index.js';
import { statusPill, confirmBox, emptyState, errMsg, fmtDate, h, icon, pageHead, toast } from '../components/index.js';

export async function editorView(apiId: string, id: string): Promise<HTMLElement> {
  const ct = typeByApi(apiId);
  if (!ct) return emptyState('Content type not found', 'It may have been deleted, or you may not have access to it.');
  const isNew = id === 'new';
  const mediaFields = ct.fields.filter((f) => f.type === 'media').map((f) => f.name).join(',');
  const entry: Record<string, any> | null = isNew ? null : (await api<{ data: Record<string, any> }>('GET', `/api/content/${apiId}/${id}${mediaFields ? `?populate=${mediaFields}` : ''}`)).data;

  const editors = new Map<string, FieldEditor>();
  const firstText = ct.fields.find((f) => f.type === 'text');
  const form = h('div', { class: 'stack lg' });
  for (const f of ct.fields) {
    const ed = buildField(f, entry?.[f.name], { firstText: () => String(editors.get(firstText?.name ?? '')?.get() ?? '') });
    editors.set(f.name, ed); form.appendChild(ed.el);
  }
  if (!ct.fields.length) form.appendChild(emptyState('This content type has no fields', 'Add fields in the content type builder first.'));

  const initial = (f: FieldDef) => (f.type === 'media' ? entry?.[f.name]?.id ?? null : entry?.[f.name] ?? null);
  function collect(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const f of ct!.fields) {
      const v = editors.get(f.name)!.get();
      if (isNew) { if (v !== null && v !== undefined) data[f.name] = v; }
      else if (JSON.stringify(v ?? null) !== JSON.stringify(initial(f))) data[f.name] = v;
    }
    return data;
  }

  async function save(nextStatus?: 'draft' | 'published') {
    editors.forEach((e) => e.setError(''));
    let data: Record<string, unknown>;
    try { data = collect(); } catch (e) { toast(errMsg(e), 'err'); return; }
    try {
      if (isNew) {
        const r = await api<{ data: { id: string } }>('POST', `/api/content/${apiId}`, { data, status: nextStatus ?? 'draft' });
        toast(nextStatus === 'published' ? 'Published' : 'Saved as draft');
        location.hash = `#/c/${apiId}/${r.data.id}`;
      } else {
        const body: Record<string, unknown> = {};
        if (Object.keys(data).length) body.data = data;
        if (nextStatus && nextStatus !== entry!.status) body.status = nextStatus;
        if (!Object.keys(body).length) { toast('No changes to save'); return; }
        await api('PATCH', `/api/content/${apiId}/${id}`, body);
        toast(body.status === 'published' ? 'Published' : body.status === 'draft' ? 'Unpublished' : 'Changes saved');
        window.dispatchEvent(new Event('forma:refresh'));
      }
    } catch (e) {
      if (e instanceof ApiError && e.issues.length) {
        let shown = 0;
        for (const i of e.issues) { const ed = editors.get(i.path.replace(/^data\./, '')); if (ed) { ed.setError(i.message); shown++; } }
        toast(shown ? 'Fix the highlighted fields and try again' : e.message, 'err');
      } else toast(errMsg(e), 'err');
    }
  }

  const canPublish = can(`content:${apiId}:publish`);
  const actions: HTMLElement[] = [];
  if (isNew) {
    actions.push(h('button', { class: 'btn', onclick: () => void save('draft') }, 'Save draft'));
    if (canPublish) actions.push(h('button', { class: 'btn primary', onclick: () => void save('published') }, 'Publish'));
  } else {
    if (can(`content:${apiId}:update`)) actions.push(h('button', { class: 'btn', onclick: () => void save() }, 'Save changes'));
    if (canPublish) actions.push(entry!.status === 'published'
      ? h('button', { class: 'btn', onclick: () => void save('draft') }, 'Unpublish')
      : h('button', { class: 'btn primary', onclick: () => void save('published') }, 'Publish'));
  }

  const side = h('aside', { class: 'panel side stack' },
    h('div', null, h('span', { class: 'label' }, 'Status'), statusPill(entry?.status ?? 'draft')),
    entry ? h('div', null, h('span', { class: 'label' }, 'Last updated'), h('span', null, fmtDate(entry.updatedAt))) : null,
    entry?.publishedAt ? h('div', null, h('span', { class: 'label' }, 'Published'), h('span', null, fmtDate(entry.publishedAt))) : null,
    entry ? h('div', null, h('span', { class: 'label' }, 'Entry ID'), h('code', { class: 'wrap' }, entry.id)) : null,
    entry ? h('div', null, h('span', { class: 'label' }, 'API'), h('code', { class: 'wrap' }, `GET /api/content/${apiId}/${entry.id}`)) : null,
    entry && can(`content:${apiId}:delete`) ? h('button', { class: 'btn danger ghost', onclick: async () => {
      if (!(await confirmBox({ title: 'Delete this entry?', message: 'This cannot be undone. References from other entries will be cleared.', confirm: 'Delete entry', danger: true }))) return;
      try { await api('DELETE', `/api/content/${apiId}/${id}`); toast('Entry deleted'); location.hash = `#/c/${apiId}`; } catch (e) { toast(errMsg(e), 'err'); }
    } }, icon('trash', 16), 'Delete entry') : null);

  return h('div', null,
    pageHead(isNew ? `New ${ct.displayName.toLowerCase()}` : entryLabel(ct, entry!), h('a', { href: `#/c/${apiId}` }, `← All ${ct.displayName.toLowerCase()}`), actions),
    h('div', { class: 'editor-grid' }, h('div', { class: 'panel' }, form), side));
}
