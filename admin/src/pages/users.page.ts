import { api, can, state, type Role } from '../core/index.js';
import { confirmBox, emptyState, errMsg, fieldRow, fmtDate, h, icon, modal, pageHead, pill, toast, toggle } from '../components/index.js';

/** Role hanya boleh dipilih jika semua izinnya juga dimiliki pengguna saat ini (server menegakkan aturan yang sama). */
const assignable = (r: Role) => r.permissions.every((p) => can(p));

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_!';
  const bytes = crypto.getRandomValues(new Uint32Array(20));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function passwordInput(): { el: HTMLElement; input: HTMLInputElement } {
  const input = h('input', { class: 'input mono', type: 'password', autocomplete: 'new-password', maxLength: 128 });
  const show = h('button', { type: 'button', class: 'btn', onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; show.textContent = input.type === 'password' ? 'Show' : 'Hide'; } }, 'Show');
  const gen = h('button', { type: 'button', class: 'btn', onclick: () => { input.value = randomPassword(); input.type = 'text'; show.textContent = 'Hide'; } }, 'Generate');
  return { input, el: h('div', { class: 'row tight' }, input, show, gen) };
}

interface UserRow { id: string; email: string; name: string; roleId: string; roleName: string; active: boolean; locked: boolean; lastLoginAt: number | null }

export async function usersView(): Promise<HTMLElement> {
  if (!can('users:manage')) return emptyState('Access restricted', 'You need permission to manage users.');
  const [users, roles] = await Promise.all([api<{ data: UserRow[] }>('GET', '/api/admin/users'), api<{ data: Role[] }>('GET', '/api/admin/roles')]);
  const pick = roles.data.filter(assignable);
  const roleSelect = (value?: string) => { const s = h('select', { class: 'input' }, pick.map((r) => h('option', { value: r.id }, r.name))); if (value) s.value = value; return s; };
  const refresh = () => window.dispatchEvent(new Event('forma:refresh'));

  function create() {
    const name = h('input', { class: 'input', maxLength: 100 }), email = h('input', { class: 'input', type: 'email', autocomplete: 'off' });
    const pw = passwordInput(), role = roleSelect(pick.find((r) => r.id === 'editor')?.id);
    const m = modal({ title: 'New user', body: h('div', { class: 'stack' }, fieldRow('Name', name, { required: true }), fieldRow('Email', email, { required: true }),
      fieldRow('Password', pw.el, { help: 'At least 12 characters. Share it through a secure channel.', required: true }), fieldRow('Role', role)),
      footer: h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
        try { await api('POST', '/api/admin/users', { name: name.value, email: email.value, password: pw.input.value, roleId: role.value }); m.close(); toast('User created'); refresh(); } catch (e) { toast(errMsg(e), 'err'); }
      } }, 'Create user')) });
  }

  function edit(u: UserRow) {
    const self = u.id === state.me!.id;
    const name = h('input', { class: 'input', value: u.name, maxLength: 100 });
    const role = roleSelect(u.roleId); role.disabled = self;
    if (!pick.some((r) => r.id === u.roleId)) { role.appendChild(h('option', { value: u.roleId }, u.roleName)); role.value = u.roleId; role.disabled = true; }
    const active = toggle(u.active, 'Account is active'); active.input.disabled = self;
    const pw = passwordInput();
    const unlock = u.locked ? toggle(false, 'Unlock this account now') : null;
    const m = modal({ title: u.email, body: h('div', { class: 'stack' }, fieldRow('Name', name), fieldRow('Role', role, { help: self ? 'You cannot change your own role.' : undefined }),
      active.el, unlock?.el, fieldRow('New password', pw.el, { help: 'Leave empty to keep the current password. Changing it signs the user out everywhere.' })),
      footer: h('div', { class: 'row between' },
        !self ? h('button', { class: 'btn danger ghost', onclick: async () => {
          if (!(await confirmBox({ title: `Delete ${u.email}?`, message: 'The account and its sessions are removed permanently.', confirm: 'Delete user', danger: true }))) return;
          try { await api('DELETE', `/api/admin/users/${u.id}`); m.close(); toast('User deleted'); refresh(); } catch (e) { toast(errMsg(e), 'err'); }
        } }, icon('trash', 16), 'Delete') : h('span'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
          const body: Record<string, unknown> = { name: name.value };
          if (!self) { body.roleId = role.value; body.active = active.input.checked; }
          if (pw.input.value) body.password = pw.input.value;
          if (unlock?.input.checked) body.unlock = true;
          try { await api('PUT', `/api/admin/users/${u.id}`, body); m.close(); toast('User updated'); refresh(); } catch (e) { toast(errMsg(e), 'err'); }
        } }, 'Save changes'))) });
  }

  return h('div', null, pageHead('Users', 'People who can sign in to this workspace.', h('button', { class: 'btn primary', onclick: create }, icon('plus', 16), 'New user')),
    h('div', { class: 'panel flush scroll' }, h('table', { class: 'table clickable' },
      h('thead', null, h('tr', null, ['User', 'Role', 'Status', 'Last sign-in'].map((c) => h('th', null, c)))),
      h('tbody', null, users.data.map((u) => h('tr', { onclick: () => edit(u) },
        h('td', null, h('strong', null, u.name), h('br'), h('span', { class: 'muted' }, u.email)),
        h('td', null, u.roleName),
        h('td', null, u.locked ? pill('Locked', 'danger') : u.active ? pill('Active', 'ok') : pill('Disabled', 'muted')),
        h('td', { class: 'muted nowrap' }, u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'Never')))))));
}
