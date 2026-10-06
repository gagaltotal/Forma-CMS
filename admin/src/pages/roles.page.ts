import { api, can, state, type Role } from '../core/index.js';
import { confirmBox, emptyState, errMsg, fieldRow, h, icon, modal, pageHead, pill, toast, toggle } from '../components/index.js';

const ACTIONS = [['read', 'View published'], ['drafts', 'View drafts'], ['create', 'Create'], ['update', 'Edit'], ['delete', 'Delete'], ['publish', 'Publish']] as const;

const SYSTEM = [
  ['media:read', 'View media library'], ['media:upload', 'Upload and edit media'], ['media:delete', 'Delete media'],
  ['schema:manage', 'Manage content types'], ['users:manage', 'Manage users'], ['roles:manage', 'Manage roles'],
  ['tokens:manage', 'Manage API tokens'], ['audit:read', 'View audit log'],
] as const;

export async function rolesView(sel?: string): Promise<HTMLElement> {
  if (!can('roles:manage')) return emptyState('Access restricted', 'You need permission to manage roles.');
  const roles = (await api<{ data: Role[] }>('GET', '/api/admin/roles')).data;
  const cur = roles.find((r) => r.id === sel) ?? roles[0]!;
  const perms = new Set(cur.permissions);
  const locked = cur.id === 'admin', isPublic = cur.id === 'public';

  const nameIn = h('input', { class: 'input', value: cur.name, disabled: cur.isSystem, maxLength: 64 });
  const descIn = h('input', { class: 'input', value: cur.description, disabled: cur.isSystem, maxLength: 255 });

  // Semua sel matriks didaftarkan agar baris "All content types" bisa menyinkronkan sel lain TANPA render ulang
  // (render ulang dari server akan membuang perubahan yang belum disimpan).
  const cells: Array<{ perm: string; input: HTMLInputElement; disabled: boolean }> = [];
  const wildOf = (perm: string) => perm.replace(/^content:[^:]+:/, 'content:*:');
  const sync = () => {
    for (const c of cells) {
      const wild = !c.perm.startsWith('content:*:') && perms.has(wildOf(c.perm));
      c.input.checked = locked || perms.has(c.perm) || wild;
      c.input.disabled = locked || c.disabled || wild || !can(c.perm);
    }
  };
  const box = (perm: string, label: string, disabled = false) => {
    const i = h('input', { type: 'checkbox', 'aria-label': label, onchange: () => { i.checked ? perms.add(perm) : perms.delete(perm); sync(); } });
    cells.push({ perm, input: i, disabled });
    return h('td', { class: 'cell' }, i);
  };
  const matrixRows = [{ apiId: '*', name: 'All content types' }, ...state.types.map((t) => ({ apiId: t.apiId, name: t.displayName }))];
  const matrix = h('div', { class: 'scroll' }, h('table', { class: 'table matrix' },
    h('thead', null, h('tr', null, h('th', null, 'Content type'), ACTIONS.map(([, l]) => h('th', { class: 'cell' }, l)))),
    h('tbody', null, matrixRows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.name), ACTIONS.map(([a, l]) => box(`content:${r.apiId}:${a}`, `${r.name}: ${l}`, isPublic && a !== 'read')))))));

  const sys = isPublic ? null : h('div', { class: 'perm-list' }, SYSTEM.map(([p, l]) => {
    const t = toggle(locked || perms.has(p), l, (v) => { v ? perms.add(p) : perms.delete(p); });
    t.input.disabled = locked || !can(p);
    return t.el;
  }));

  sync();
  const render = () => window.dispatchEvent(new Event('forma:refresh'));

  const editor = h('section', { class: 'panel stack lg' },
    h('div', { class: 'row between' }, h('h2', { class: 'h3' }, cur.name), cur.isSystem ? pill('Built-in', 'muted') : null),
    locked ? h('div', { class: 'notice' }, 'Administrators have unrestricted access. This role cannot be edited.') : null,
    isPublic ? h('div', { class: 'notice' }, 'The Public role applies to anyone without a login, including your website. It can only be granted read access, and only published entries are ever visible.') : null,
    h('div', { class: 'grid2' }, fieldRow('Name', nameIn), fieldRow('Description', descIn)),
    h('div', null, h('h3', { class: 'h4' }, 'Content access'), matrix),
    sys ? h('div', null, h('h3', { class: 'h4' }, 'System access'), sys) : null,
    h('div', { class: 'row between' },
      !cur.isSystem ? h('button', { class: 'btn danger ghost', onclick: async () => {
        if (!(await confirmBox({ title: `Delete “${cur.name}”?`, message: 'Roles that are still assigned to users cannot be deleted.', confirm: 'Delete role', danger: true }))) return;
        try { await api('DELETE', `/api/admin/roles/${cur.id}`); toast('Role deleted'); location.hash = '#/roles'; } catch (e) { toast(errMsg(e), 'err'); }
      } }, icon('trash', 16), 'Delete role') : h('span'),
      !locked ? h('button', { class: 'btn primary', onclick: async () => {
        try { await api('PUT', `/api/admin/roles/${cur.id}`, { name: nameIn.value, description: descIn.value, permissions: [...perms] }); toast('Role saved'); render(); } catch (e) { toast(errMsg(e), 'err'); }
      } }, 'Save role') : h('span')));

  const newRole = () => {
    const n = h('input', { class: 'input', maxLength: 64, placeholder: 'e.g. Reviewer' });
    const d = h('input', { class: 'input', maxLength: 255 });
    const m = modal({ title: 'New role', body: h('div', { class: 'stack' }, fieldRow('Name', n, { required: true }), fieldRow('Description', d)),
      footer: h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
        try { const r = await api<{ data: Role }>('POST', '/api/admin/roles', { name: n.value, description: d.value, permissions: [] }); m.close(); toast('Role created'); location.hash = `#/roles/${r.data.id}`; } catch (e) { toast(errMsg(e), 'err'); }
      } }, 'Create role')) });
  };

  return h('div', null, pageHead('Roles', 'Decide who can see and change what.', h('button', { class: 'btn primary', onclick: newRole }, icon('plus', 16), 'New role')),
    h('div', { class: 'split' },
      h('nav', { class: 'panel flush b-list', 'aria-label': 'Roles' }, roles.map((r) => h('a', { href: `#/roles/${r.id}`, class: r.id === cur.id ? 'active' : '' }, h('strong', null, r.name), h('small', null, r.description || (r.isSystem ? 'Built-in role' : ''))))),
      editor));
}
