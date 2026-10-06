import { api, ApiError, can, entryLabel, typeByApi, type FieldDef, type MediaItem } from '../core/index.js';
import { clear, h } from './dom.js';
import { fieldRow, toggle } from './form.js';
import { pickMedia, tileThumb } from './media-picker.js';
import { richEditor } from './rich-text.js';

export interface FieldEditor { el: HTMLElement; get: () => unknown; setError: (msg: string) => void }

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function buildField(f: FieldDef, value: unknown, ctx: { firstText?: () => string }): FieldEditor {
  const id = `f_${f.name}`;
  const label = f.label || f.name;
  let control: HTMLElement;
  let get: () => unknown;
  const empty = (v: string) => (v === '' ? null : v);

  switch (f.type) {
    case 'text': case 'email': case 'slug': {
      const i = h('input', { class: 'input', id, type: f.type === 'email' ? 'email' : 'text', value: (value as string) ?? '', maxLength: f.type === 'slug' ? 160 : Math.min(f.max ?? 255, 255), autocomplete: 'off', spellcheck: f.type === 'text' });
      control = f.type === 'slug'
        ? h('div', { class: 'row tight' }, i, h('button', { type: 'button', class: 'btn sm', onclick: () => { i.value = (ctx.firstText?.() ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160); } }, 'Generate'))
        : i;
      get = () => (f.required ? i.value : empty(i.value.trim()));
      break;
    }
    case 'longtext': {
      const t = h('textarea', { class: 'input', id, rows: 5 }); t.value = (value as string) ?? '';
      control = t; get = () => (f.required ? t.value : empty(t.value));
      break;
    }
    case 'richtext': {
      const r = richEditor((value as string) ?? '');
      control = r.el; get = () => { const v = r.get(); return v === '' || v === '<br>' ? (f.required ? '' : null) : v; };
      break;
    }
    case 'integer': case 'float': {
      const i = h('input', { class: 'input', id, type: 'number', step: f.type === 'integer' ? '1' : 'any', min: f.min, max: f.max, value: value == null ? '' : String(value) });
      control = i; get = () => (i.value === '' ? null : Number(i.value));
      break;
    }
    case 'boolean': {
      const t = toggle(value === true, label);
      control = t.el; get = () => t.input.checked;
      const el = h('div', { class: 'field' }, control, f.help ? h('p', { class: 'help' }, f.help) : null);
      const err = h('p', { class: 'error-text', role: 'alert' });
      el.appendChild(err);
      return { el, get, setError: (m) => { err.textContent = m; } };
    }
    case 'datetime': {
      const i = h('input', { class: 'input', id, type: 'datetime-local', value: value ? toLocalInput(value as string) : '' });
      control = i; get = () => (i.value ? new Date(i.value).toISOString() : null);
      break;
    }
    case 'enum': {
      const s = h('select', { class: 'input', id }, f.required ? null : h('option', { value: '' }, '— None —'), (f.values ?? []).map((v) => h('option', { value: v }, v)));
      s.value = (value as string) ?? (f.required ? f.values?.[0] ?? '' : '');
      control = s; get = () => empty(s.value);
      break;
    }
    case 'json': {
      const t = h('textarea', { class: 'input mono', id, rows: 6, spellcheck: false }); t.value = value == null ? '' : JSON.stringify(value, null, 2);
      control = t;
      get = () => { if (t.value.trim() === '') return null; try { return JSON.parse(t.value); } catch { throw new Error(`"${label}" contains invalid JSON`); } };
      break;
    }
    case 'media': {
      let cur: MediaItem | null = value && typeof value === 'object' ? (value as MediaItem) : null;
      let curId: string | null = cur?.id ?? (typeof value === 'string' ? value : null);
      const box = h('div', { class: 'media-field' });
      const paint = () => {
        clear(box);
        if (curId) box.append(cur ? tileThumb(cur) : h('span', { class: 'thumb file' }, '…'), h('div', { class: 'stack tight' }, h('strong', null, cur?.name ?? 'File selected'), h('button', { type: 'button', class: 'btn sm', onclick: () => { curId = null; cur = null; paint(); } }, 'Remove')));
        else box.append(h('button', { type: 'button', class: 'btn', onclick: async () => { const m = await pickMedia(); if (m) { cur = m; curId = m.id; paint(); } } }, 'Choose file'));
      };
      paint(); control = box; get = () => curId;
      break;
    }
    case 'relation': {
      const target = f.target!;
      const tct = typeByApi(target);
      const s = h('select', { class: 'input', id, disabled: true }, h('option', { value: '' }, 'Loading…'));
      const cur = typeof value === 'string' ? value : null;
      control = s; get = () => empty(s.value);
      const fill = (opts: Array<[string, string]>) => {
        clear(s);
        if (!f.required) s.appendChild(h('option', { value: '' }, '— None —'));
        if (cur && !opts.some(([v]) => v === cur)) s.appendChild(h('option', { value: cur }, `#${cur.slice(0, 8)}`));
        for (const [v, l] of opts) s.appendChild(h('option', { value: v }, l));
        s.value = cur ?? ''; s.disabled = false;
      };
      if (!can(`content:${target}:read`)) { clear(s); s.appendChild(h('option', { value: cur ?? '' }, cur ? `#${cur.slice(0, 8)}` : 'No access')); s.value = cur ?? ''; }
      else api<{ data: Record<string, any>[] }>('GET', `/api/content/${target}?pageSize=100&sort=created_at:desc`)
        .then((r) => fill(r.data.map((e) => [e.id, entryLabel(tct, e)])))
        .catch((e: ApiError) => { clear(s); s.appendChild(h('option', { value: '' }, e.message)); });
      break;
    }
  }

  const row = fieldRow(label, control!, { help: f.help, required: f.required, id });
  return {
    el: row, get: get!,
    setError: (msg) => {
      row.classList.toggle('invalid', !!msg);
      row.querySelector('.error-text')?.remove();
      if (msg) row.appendChild(h('p', { class: 'error-text', role: 'alert' }, msg));
    },
  };
}
