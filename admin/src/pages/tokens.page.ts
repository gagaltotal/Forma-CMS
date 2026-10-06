import { api, can, type Role } from '../core/index.js';
import { confirmBox, copyText, emptyState, errMsg, fieldRow, fmtDate, h, icon, modal, pageHead, pill, toast } from '../components/index.js';

interface TokenRow { id: string; name: string; prefix: string; roleName: string; expiresAt: number | null; lastUsedAt: number | null; createdAt: number }

const TOKEN_OK = /^(content:[a-z0-9_*]+:(read|drafts|create|update|delete|publish)|media:read|media:upload)$/;

export async function tokensView(): Promise<HTMLElement> {
  if (!can('tokens:manage')) return emptyState('Access restricted', 'You need permission to manage API tokens.');
  const [tokens, roles] = await Promise.all([api<{ data: TokenRow[] }>('GET', '/api/admin/tokens'), api<{ data: Role[] }>('GET', '/api/admin/roles')]);
  const usable = roles.data.filter((r) => r.permissions.length && r.permissions.every((p) => TOKEN_OK.test(p) && can(p)));
  const refresh = () => window.dispatchEvent(new Event('forma:refresh'));

  function create() {
    if (!usable.length) { toast('Create a role with content permissions first (Roles)', 'err'); return; }
    const name = h('input', { class: 'input', maxLength: 100, placeholder: 'e.g. Website (production)' });
    const role = h('select', { class: 'input' }, usable.map((r) => h('option', { value: r.id }, r.name)));
    const exp = h('select', { class: 'input' }, [['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['', 'No expiry']].map(([v, l]) => h('option', { value: v }, l)));
    exp.value = '90';
    const m = modal({ title: 'New API token', body: h('div', { class: 'stack' },
      fieldRow('Name', name, { required: true }), fieldRow('Role', role, { help: 'The token gets exactly the permissions of this role. Tokens can never manage users, roles or schema.' }), fieldRow('Expires', exp)),
      footer: h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
        try {
          const r = await api<{ data: { token: string } }>('POST', '/api/admin/tokens', { name: name.value, roleId: role.value, expiresInDays: exp.value ? Number(exp.value) : null });
          m.close(); reveal(r.data.token);
        } catch (e) { toast(errMsg(e), 'err'); }
      } }, 'Create token')) });
  }
  function reveal(token: string) {
    const m = modal({ title: 'Copy your token', body: h('div', { class: 'stack' },
      h('div', { class: 'notice warn' }, 'This is the only time the token is shown. Store it in a secret manager or environment variable, and never put write-capable tokens in browser code.'),
      h('div', { class: 'row tight' }, h('input', { class: 'input mono', readOnly: true, value: token, 'aria-label': 'API token', onfocus: (e: Event) => (e.target as HTMLInputElement).select() }), h('button', { class: 'btn primary', onclick: () => void copyText(token) }, icon('copy', 16), 'Copy')),
      h('p', { class: 'muted small' }, 'Send it as ', h('code', null, 'Authorization: Bearer <token>'), '.')),
      footer: h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => { m.close(); refresh(); } }, 'I have saved it')) });
  }

  const table = tokens.data.length ? h('div', { class: 'panel flush scroll' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, ['Name', 'Token', 'Role', 'Last used', 'Expires', ''].map((c) => h('th', null, c)))),
    h('tbody', null, tokens.data.map((t) => h('tr', null,
      h('td', null, h('strong', null, t.name)), h('td', null, h('code', null, `${t.prefix}…`)), h('td', null, t.roleName),
      h('td', { class: 'muted nowrap' }, t.lastUsedAt ? fmtDate(t.lastUsedAt) : 'Never'),
      h('td', { class: 'muted nowrap' }, t.expiresAt ? (t.expiresAt < Date.now() ? pill('Expired', 'danger') : fmtDate(t.expiresAt)) : 'Never'),
      h('td', { class: 'end' }, h('button', { class: 'btn sm danger ghost', onclick: async () => {
        if (!(await confirmBox({ title: `Revoke “${t.name}”?`, message: 'Anything using this token will stop working immediately.', confirm: 'Revoke token', danger: true }))) return;
        try { await api('DELETE', `/api/admin/tokens/${t.id}`); toast('Token revoked'); refresh(); } catch (e) { toast(errMsg(e), 'err'); }
      } }, 'Revoke'))))))) : emptyState('No API tokens', 'Create a token so your website or app can read content through the API.');

  return h('div', null, pageHead('API tokens', 'Credentials for frontends and services that call the REST or GraphQL API.', h('button', { class: 'btn primary', onclick: create }, icon('plus', 16), 'New token')), table);
}
