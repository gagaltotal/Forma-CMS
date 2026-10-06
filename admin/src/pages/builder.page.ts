import { api, ApiError, can, loadTypes, state, typeByApi, type FieldDef, type FieldType } from '../core/index.js';
import { clear, confirmBox, copyText, emptyState, errMsg, fieldRow, h, icon, modal, pageHead, pill, toast, toggle } from '../components/index.js';

const TYPES: Array<{ type: FieldType; label: string; glyph: string; desc: string }> = [
  { type: 'text', label: 'Short text', glyph: 'Aa', desc: 'Titles, names, single lines (up to 255 characters)' },
  { type: 'longtext', label: 'Long text', glyph: '¶', desc: 'Plain multi-line text such as summaries' },
  { type: 'richtext', label: 'Rich text', glyph: 'Rt', desc: 'Formatted content, cleaned on the server' },
  { type: 'integer', label: 'Whole number', glyph: '123', desc: 'Counts, quantities, ranks' },
  { type: 'float', label: 'Decimal number', glyph: '1.5', desc: 'Prices, ratings, measurements' },
  { type: 'boolean', label: 'Yes / No', glyph: 'Y/N', desc: 'A simple on or off switch' },
  { type: 'datetime', label: 'Date and time', glyph: 'Date', desc: 'Publish dates, events, deadlines' },
  { type: 'email', label: 'Email', glyph: '@', desc: 'A validated email address' },
  { type: 'slug', label: 'Slug', glyph: '/-', desc: 'A unique, URL-friendly identifier' },
  { type: 'enum', label: 'Choice', glyph: 'A|B', desc: 'One value from a list you define' },
  { type: 'json', label: 'JSON', glyph: '{ }', desc: 'Free-form structured data' },
  { type: 'media', label: 'File', glyph: 'Img', desc: 'An image or PDF from the media library' },
  { type: 'relation', label: 'Relation', glyph: '→', desc: 'A link to an entry of another content type' },
];
const glyphOf = (t: FieldType) => TYPES.find((x) => x.type === t)!;
const LENGTH_TYPES = new Set<FieldType>(['text', 'longtext', 'richtext']);
const NUMBER_TYPES = new Set<FieldType>(['integer', 'float']);
const UNIQUE_TYPES = new Set<FieldType>(['text', 'email', 'slug', 'enum', 'datetime', 'integer', 'float', 'boolean', 'media', 'relation']);

const snake = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9]+/, '').slice(0, 40);
function pluralize(s: string): string {
  if (/(s|x|z|ch|sh)$/.test(s)) return `${s}es`;
  if (/[^aeiou]y$/.test(s)) return `${s.slice(0, -1)}ies`;
  return `${s}s`;
}
const pascal = (s: string) => s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

function sampleValue(f: FieldDef): unknown {
  switch (f.type) {
    case 'text': return f.label || 'Example text';
    case 'longtext': return 'A longer piece of plain text.';
    case 'richtext': return '<p>Formatted <strong>content</strong>.</p>';
    case 'integer': return 42;
    case 'float': return 19.99;
    case 'boolean': return true;
    case 'datetime': return '2026-01-15T09:30:00.000Z';
    case 'email': return 'name@example.com';
    case 'slug': return 'example-slug';
    case 'enum': return f.values?.[0] ?? 'value';
    case 'json': return { key: 'value' };
    case 'media': return { id: '9b2e…', url: 'https://cms.example.com/media/file/9b2e…', name: 'cover.jpg', mime: 'image/jpeg', size: 48213, alt: '' };
    case 'relation': return '4c1a7d3e-0b5f-4e2a-9a10-6d2f8e7b3c11';
  }
}

interface Draft { apiId: string; pluralId: string; displayName: string; fields: FieldDef[]; isNew: boolean }

export async function builderView(sel?: string): Promise<HTMLElement> {
  if (!can('schema:manage')) return emptyState('Access restricted', 'You need permission to manage content types.');
  const existing = sel && sel !== 'new' ? typeByApi(sel) : undefined;
  const view = h('div', { class: 'builder-page' }, pageHead('Content types', 'Model your content visually. Every type gets a REST and GraphQL API automatically.',
    h('a', { class: 'btn primary', href: '#/builder/new' }, icon('plus', 16), 'New content type')));
  const list = h('nav', { class: 'panel flush b-list', 'aria-label': 'Content types' },
    state.types.length ? state.types.map((t) => h('a', { href: `#/builder/${t.apiId}`, class: t.apiId === sel ? 'active' : '' }, h('strong', null, t.displayName), h('small', null, `${t.fields.length} field${t.fields.length === 1 ? '' : 's'}`)))
      : h('p', { class: 'muted pad' }, 'No content types yet.'));
  const stage = h('div', { class: 'b-stage' });
  view.appendChild(h('div', { class: 'builder' }, list, stage));

  if (sel && sel !== 'new' && !existing) { stage.appendChild(emptyState('Content type not found', 'Pick one from the list.')); return view; }
  if (!sel) { stage.appendChild(emptyState('Pick a content type', 'Select one to edit its fields, or create a new one to start modelling.')); return view; }

  const d: Draft = existing
    ? { apiId: existing.apiId, pluralId: existing.pluralId, displayName: existing.displayName, fields: structuredClone(existing.fields), isNew: false }
    : { apiId: '', pluralId: '', displayName: '', fields: [], isNew: true };
  const lockedFields = new Set(existing?.fields.map((f) => f.name) ?? []);
  const originalNames = [...lockedFields];
  const open = new Set<FieldDef>();
  let apiTouched = !d.isNew;

  const fieldsHost = h('div', { class: 'frows' });
  const previewHost = h('aside', { class: 'panel preview' });
  const banner = h('div', { role: 'alert' });

  /* ---------- Pratinjau API langsung ---------- */
  function renderPreview() {
    clear(previewHost);
    const api_ = d.apiId || 'your_type';
    const plural = d.pluralId || pluralize(api_);
    const P = pascal(api_);
    const json = JSON.stringify({ data: Object.fromEntries([['id', '2f6d1c0e-8a4b-4f0e-b1c2-7d9e5a3f4b10'], ['status', 'published'], ['createdAt', '2026-01-15T09:30:00.000Z'], ['updatedAt', '2026-01-15T09:30:00.000Z'], ['publishedAt', '2026-01-15T09:30:00.000Z'], ...d.fields.filter((f) => f.name).map((f) => [f.name, sampleValue(f)])]) }, null, 2);
    const sel_ = ['id', ...d.fields.filter((f) => f.name).map((f) => (f.type === 'media' ? `${f.name} { url alt }` : f.type === 'relation' ? `${f.name} { id }` : f.name))].map((x) => `      ${x}`).join('\n');
    const gql = `{\n  ${plural}(page: 1, pageSize: 10) {\n    total\n    items {\n${sel_}\n    }\n  }\n}`;
    const code = (t: string) => h('pre', { class: 'code' }, h('code', null, t));
    previewHost.append(
      h('div', { class: 'row between' }, h('h3', null, 'Live API preview'), pill('updates as you build', 'muted')),
      h('h4', null, 'REST'),
      code([`GET     /api/content/${api_}`, `GET     /api/content/${api_}/:id`, `POST    /api/content/${api_}`, `PATCH   /api/content/${api_}/:id`, `DELETE  /api/content/${api_}/:id`].join('\n')),
      h('h4', null, 'Example response'), code(json),
      h('div', { class: 'row between' }, h('h4', null, `GraphQL · type ${P}`), h('button', { class: 'btn sm ghost', onclick: () => void copyText(gql) }, icon('copy', 14), 'Copy')),
      code(gql));
  }

  /* ---------- Daftar field ---------- */
  function move(i: number, dir: -1 | 1) { const j = i + dir; if (j < 0 || j >= d.fields.length) return; [d.fields[i], d.fields[j]] = [d.fields[j]!, d.fields[i]!]; renderFields(); renderPreview(); }

  function num(v: string): number | undefined { return v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v); }

  function renderFields() {
    clear(fieldsHost);
    if (!d.fields.length) fieldsHost.appendChild(h('p', { class: 'muted pad-sm' }, 'No fields yet. Add your first field below.'));
    d.fields.forEach((f, i) => {
      const locked = lockedFields.has(f.name);
      const g = glyphOf(f.type);
      const isOpen = open.has(f);
      const head = h('div', { class: 'frow-head' },
        h('button', { class: 'frow-main', 'aria-expanded': isOpen, onclick: () => { isOpen ? open.delete(f) : open.add(f); renderFields(); } },
          h('span', { class: 'glyph', title: g.label }, g.glyph),
          h('span', { class: 'frow-name' }, h('strong', null, f.label || f.name || 'Untitled field'), h('code', null, f.name || 'name')),
          f.required ? pill('Required', 'muted') : null,
          f.type === 'slug' || f.unique ? pill('Unique', 'ok') : null),
        h('div', { class: 'row tight' },
          h('button', { class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, icon('up', 16)),
          h('button', { class: 'icon-btn', 'aria-label': 'Move down', disabled: i === d.fields.length - 1, onclick: () => move(i, 1) }, icon('down', 16)),
          h('button', { class: 'icon-btn danger', 'aria-label': 'Remove field', onclick: () => { d.fields.splice(i, 1); renderFields(); renderPreview(); } }, icon('trash', 16))));
      const row = h('div', { class: `frow${isOpen ? ' open' : ''}` }, head);
      if (isOpen) {
        const nameIn = h('input', { class: 'input mono', value: f.name, disabled: locked, maxLength: 40, placeholder: 'field_name', oninput: () => { touchedNames.add(f); f.name = nameIn.value; renderPreview(); head.querySelector('code')!.textContent = f.name || 'name'; } });
        const labelIn = h('input', { class: 'input', value: f.label ?? '', maxLength: 80, placeholder: 'Shown in the editor', oninput: () => {
          f.label = labelIn.value || undefined; head.querySelector('strong')!.textContent = f.label || f.name || 'Untitled field';
          if (!locked && !nameTouched(f)) { f.name = snake(labelIn.value); nameIn.value = f.name; head.querySelector('code')!.textContent = f.name || 'name'; renderPreview(); }
        } });
        const help = h('input', { class: 'input', value: f.help ?? '', maxLength: 200, placeholder: 'Optional hint for editors', oninput: () => { f.help = help.value || undefined; } });
        const req = toggle(!!f.required, 'Required', (v) => { f.required = v || undefined; renderFields(); });
        const typeSelect = h('select', { class: 'input', onchange: () => {
          f.type = typeSelect.value as FieldType;
          if (!UNIQUE_TYPES.has(f.type)) f.unique = undefined;
          renderFields(); renderPreview();
        } }, TYPES.map((t) => h('option', { value: t.type }, t.label)));
        typeSelect.value = f.type;
        const opts: HTMLElement[] = [
          h('div', { class: 'grid2' }, fieldRow('Name', nameIn, { help: locked ? 'Names cannot change after the field is created.' : 'Lowercase letters, digits and underscores. This is the key in the API.' }), fieldRow('Label', labelIn)),
          fieldRow('Help text', help),
          fieldRow('Field type', typeSelect, { help: locked ? 'Existing values are converted when possible; a failed conversion rolls back the schema update.' : undefined }),
          req.el,
        ];
        if (f.type === 'slug') opts.push(h('p', { class: 'muted small' }, 'Slug fields are always unique.'));
        else if (UNIQUE_TYPES.has(f.type)) opts.push(toggle(!!f.unique, 'Unique', (v) => { f.unique = v || undefined; renderFields(); }).el);
        if (LENGTH_TYPES.has(f.type) || NUMBER_TYPES.has(f.type)) {
          const w = LENGTH_TYPES.has(f.type) ? 'length' : 'value';
          const mn = h('input', { class: 'input', type: 'number', value: f.min ?? '', oninput: () => { f.min = num(mn.value); } });
          const mx = h('input', { class: 'input', type: 'number', value: f.max ?? '', oninput: () => { f.max = num(mx.value); } });
          opts.push(h('div', { class: 'grid2' }, fieldRow(`Minimum ${w}`, mn), fieldRow(`Maximum ${w}`, mx)));
        }
        if (f.type === 'enum') {
          const ta = h('textarea', { class: 'input mono', rows: 4, placeholder: 'One option per line', oninput: () => { f.values = ta.value.split('\n').map((s) => s.trim()).filter(Boolean); renderPreview(); } });
          ta.value = (f.values ?? []).join('\n'); opts.push(fieldRow('Options', ta, { help: 'One per line.' }));
        }
        if (f.type === 'relation') {
          const targets = [...state.types.map((t) => t.apiId), ...(d.isNew && d.apiId ? [d.apiId] : [])];
          const sl = h('select', { class: 'input', disabled: locked, onchange: () => { f.target = sl.value; } }, h('option', { value: '' }, 'Choose a content type…'), [...new Set(targets)].map((t) => h('option', { value: t }, t)));
          sl.value = f.target ?? ''; opts.push(fieldRow('Links to', sl, { help: locked ? 'The target cannot change after the field is created.' : 'Each entry links to one entry of this type.' }));
        }
        opts.push(h('p', { class: 'muted small' }, 'Type: ', h('strong', null, g.label)));
        row.appendChild(h('div', { class: 'frow-body stack' }, opts));
      }
      fieldsHost.appendChild(row);
    });
  }
  const touchedNames = new WeakSet<FieldDef>();
  const nameTouched = (f: FieldDef) => touchedNames.has(f) || lockedFields.has(f.name);

  function addField() {
    const body = h('div', { class: 'type-grid' }, TYPES.map((t) => h('button', { class: 'type-card', onclick: () => {
      let n = 1; const names = new Set(d.fields.map((x) => x.name)); while (names.has(`${t.type}_${n}`)) n++;
      const f: FieldDef = { name: `${t.type}_${n}`, type: t.type };
      if (t.type === 'enum') f.values = ['option_a', 'option_b'];
      d.fields.push(f); open.add(f); m.close(); renderFields(); renderPreview();
      queueMicrotask(() => fieldsHost.querySelector<HTMLInputElement>('.frow:last-child .input')?.focus());
    } }, h('span', { class: 'glyph lg' }, t.glyph), h('strong', null, t.label), h('small', null, t.desc))));
    const m = modal({ title: 'Add a field', body, wide: true });
  }

  /* ---------- Identitas tipe ---------- */
  const nameIn = h('input', { class: 'input', value: d.displayName, maxLength: 100, placeholder: 'e.g. Blog post', oninput: () => {
    d.displayName = nameIn.value;
    if (!apiTouched) { d.apiId = snake(nameIn.value); apiIn.value = d.apiId; pluralIn.placeholder = pluralize(d.apiId || 'items'); }
    renderPreview();
  } });
  const apiIn = h('input', { class: 'input mono', value: d.apiId, disabled: !d.isNew, maxLength: 40, placeholder: 'blog_post', oninput: () => { apiTouched = true; d.apiId = apiIn.value; renderPreview(); } });
  const pluralIn = h('input', { class: 'input mono', value: d.pluralId, maxLength: 44, placeholder: pluralize(d.apiId || 'items'), oninput: () => { d.pluralId = pluralIn.value; renderPreview(); } });

  async function save() {
    clear(banner);
    const clean = d.fields.map((f) => {
      const o: FieldDef = { name: f.name.trim(), type: f.type };
      if (f.label?.trim()) o.label = f.label.trim();
      if (f.help?.trim()) o.help = f.help.trim();
      if (f.required) o.required = true;
      if (f.unique) o.unique = true;
      if (f.min !== undefined) o.min = f.min;
      if (f.max !== undefined) o.max = f.max;
      if (f.type === 'enum') o.values = f.values ?? [];
      if (f.type === 'relation') o.target = f.target;
      return o;
    });
    const removed = originalNames.filter((n) => !clean.some((f) => f.name === n));
    if (removed.length && !(await confirmBox({ title: 'Delete fields and their data?', message: `Saving will permanently delete: ${removed.join(', ')}. The data stored in these fields cannot be recovered.`, confirm: 'Save and delete data', danger: true }))) return;
    try {
      const body = { apiId: d.apiId.trim(), ...(d.pluralId.trim() ? { pluralId: d.pluralId.trim() } : {}), displayName: d.displayName.trim(), fields: clean };
      if (d.isNew) await api('POST', '/api/admin/content-types', body); else await api('PUT', `/api/admin/content-types/${d.apiId}`, body);
      await loadTypes(); window.dispatchEvent(new Event('forma:types'));
      toast('Content type saved');
      if (d.isNew) location.hash = `#/builder/${body.apiId}`; else window.dispatchEvent(new Event('forma:refresh'));
    } catch (e) {
      const issues = e instanceof ApiError ? e.issues : [];
      banner.appendChild(h('div', { class: 'notice err' }, h('strong', null, errMsg(e)), issues.length ? h('ul', null, issues.map((i) => h('li', null, `${i.path ? `${i.path}: ` : ''}${i.message}`))) : null));
      banner.scrollIntoView({ block: 'nearest' });
    }
  }

  stage.append(
    h('div', { class: 'b-cols' },
      h('div', { class: 'stack lg' },
        banner,
        h('section', { class: 'panel stack' },
          h('h2', { class: 'h3' }, d.isNew ? 'New content type' : d.displayName),
          h('div', { class: 'grid2' },
            fieldRow('Display name', nameIn, { required: true }),
            fieldRow('API name', apiIn, { help: d.isNew ? 'Used in URLs and table names. Cannot be changed later.' : 'Fixed after creation.', required: true })),
          fieldRow('Plural API name', pluralIn, { help: 'Used for the GraphQL list query. Leave empty to use the default.' })),
        h('section', { class: 'panel stack' },
          h('div', { class: 'row between' }, h('h2', { class: 'h3' }, 'Fields'), h('button', { class: 'btn', onclick: addField }, icon('plus', 16), 'Add field')),
          fieldsHost),
        h('div', { class: 'row between sticky-actions' },
          !d.isNew ? h('button', { class: 'btn danger ghost', onclick: async () => {
            if (!(await confirmBox({ title: 'Delete this content type?', message: 'The table and every entry in it will be permanently deleted.', confirm: 'Delete content type', danger: true, typeToConfirm: d.apiId }))) return;
            try { await api('DELETE', `/api/admin/content-types/${d.apiId}`); await loadTypes(); window.dispatchEvent(new Event('forma:types')); toast('Content type deleted'); location.hash = '#/builder'; } catch (e) { toast(errMsg(e), 'err'); }
          } }, icon('trash', 16), 'Delete') : h('span'),
          h('button', { class: 'btn primary', onclick: () => void save() }, d.isNew ? 'Create content type' : 'Save changes'))),
      previewHost));
  d.fields.forEach((f) => touchedNames.add(f));
  renderFields(); renderPreview();
  return view;
}
