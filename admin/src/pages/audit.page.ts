import { api, can } from '../core/index.js';
import { clear, emptyState, errMsg, fmtDate, h, icon, pageHead, toast } from '../components/index.js';

interface AuditRow { id: number; ts: number; actor: string | null; action: string; target: string | null; ip: string | null }

export async function auditView(): Promise<HTMLElement> {
  if (!can('audit:read')) return emptyState('Access restricted', 'You need permission to view the audit log.');
  let page = 1;
  const host = h('div', { class: 'panel flush scroll' });
  const pager = h('div', { class: 'pager' });
  const result = h('div', { role: 'status' });

  async function load() {
    const r = await api<{ data: AuditRow[]; meta: { total: number; pageSize: number } }>('GET', `/api/admin/audit?page=${page}&pageSize=50`);
    clear(host); clear(pager);
    host.appendChild(h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['When', 'Action', 'Actor', 'Target', 'IP address'].map((c) => h('th', null, c)))),
      h('tbody', null, r.data.map((a) => h('tr', null,
        h('td', { class: 'muted nowrap' }, fmtDate(a.ts)),
        h('td', null, h('code', null, a.action)),
        h('td', null, a.actor ? h('code', null, a.actor.replace(/^(user|token):(.{8}).*/, '$1:$2')) : h('span', { class: 'muted' }, 'anonymous')),
        h('td', null, a.target ? h('code', null, a.target.length > 40 ? `${a.target.slice(0, 40)}…` : a.target) : '—'),
        h('td', { class: 'muted' }, a.ip ?? '—'))))));
    const { total, pageSize } = r.meta, from = total ? (page - 1) * pageSize + 1 : 0, to = Math.min(page * pageSize, total);
    pager.append(h('span', { class: 'muted' }, `${from}–${to} of ${total}`), h('div', { class: 'row tight' },
      h('button', { class: 'btn sm', disabled: page <= 1, 'aria-label': 'Newer', onclick: () => { page--; void load(); } }, icon('left', 14)),
      h('button', { class: 'btn sm', disabled: to >= total, 'aria-label': 'Older', onclick: () => { page++; void load(); } }, icon('right', 14))));
  }
  const verify = h('button', { class: 'btn', onclick: async () => {
    clear(result);
    try {
      const r = await api<{ ok: boolean; checked: number; brokenAtId?: number }>('GET', '/api/admin/audit/verify');
      result.appendChild(r.ok ? h('div', { class: 'notice ok' }, `Chain intact. ${r.checked} entries verified.`)
        : h('div', { class: 'notice err' }, `The log has been tampered with. The chain breaks at entry #${r.brokenAtId}. Treat this as a security incident.`));
    } catch (e) { toast(errMsg(e), 'err'); }
  } }, icon('shield', 16), 'Verify integrity');
  void load();
  return h('div', null, pageHead('Audit log', 'Every sign-in, permission and schema change. Entries are chained with HMACs so edits or deletions are detectable.', verify), result, host, pager);
}
