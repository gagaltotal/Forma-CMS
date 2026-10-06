import { ApiError, can } from '../core/index.js';
import { clear, emptyState, errMsg, h } from '../components/index.js';
import { accountView } from '../pages/account.page.js';
import { auditView } from '../pages/audit.page.js';
import { builderView } from '../pages/builder.page.js';
import { editorView } from '../pages/content-editor.page.js';
import { listView } from '../pages/content-list.page.js';
import { dashboardView } from '../pages/dashboard.page.js';
import { mediaView } from '../pages/media.page.js';
import { rolesView } from '../pages/roles.page.js';
import { tokensView } from '../pages/tokens.page.js';
import { usersView } from '../pages/users.page.js';
import { currentPath } from './location.js';
import { renderRail, type Shell } from './shell.js';

interface Route { re: RegExp; view: (m: RegExpExecArray) => Promise<HTMLElement> | HTMLElement; perm?: string }

/** Tabel rute. `perm` hanya menyembunyikan halaman di UI; server tetap menegakkan izin pada setiap API. */
export const routes: Route[] = [
  { re: /^\/?$/, view: () => dashboardView() },
  { re: /^\/c\/([a-z][a-z0-9_]*)$/, view: (m) => listView(m[1]!) },
  { re: /^\/c\/([a-z][a-z0-9_]*)\/(new|[0-9a-f-]{36})$/, view: (m) => editorView(m[1]!, m[2]!) },
  { re: /^\/builder(?:\/([a-z][a-z0-9_]*|new))?$/, view: (m) => builderView(m[1]), perm: 'schema:manage' },
  { re: /^\/media$/, view: () => mediaView(), perm: 'media:read' },
  { re: /^\/roles(?:\/([a-z0-9-]{1,36}))?$/, view: (m) => rolesView(m[1]), perm: 'roles:manage' },
  { re: /^\/users$/, view: () => usersView(), perm: 'users:manage' },
  { re: /^\/tokens$/, view: () => tokensView(), perm: 'tokens:manage' },
  { re: /^\/audit$/, view: () => auditView(), perm: 'audit:read' },
  { re: /^\/account$/, view: () => accountView() },
];

let renderSeq = 0;

/** Render halaman sesuai hash saat ini ke `shell.main`. Navigasi yang lebih baru membatalkan render yang masih berjalan. */
export async function renderRoute(shell: Shell, onSignOut: () => void): Promise<void> {
  const seq = ++renderSeq;
  document.body.classList.remove('rail-open');
  renderRail(shell.rail, onSignOut);
  clear(shell.main);
  shell.main.appendChild(h('p', { class: 'muted pad loading' }, 'Loading…'));

  const home = h('a', { class: 'btn', href: '#/' }, 'Go to overview');
  let el: HTMLElement;
  try {
    const p = currentPath();
    const hit = routes.map((r) => ({ r, m: r.re.exec(p) })).find((x) => x.m);
    if (!hit) el = emptyState('Page not found', 'That address does not exist in the admin panel.', home);
    else if (hit.r.perm && !can(hit.r.perm)) el = emptyState('Access restricted', 'Your role does not include this area. Ask an administrator if you need access.');
    else el = await hit.r.view(hit.m!);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    el = e instanceof ApiError && e.status === 404
      ? emptyState('Not found', 'This item does not exist or you do not have access to it.', home)
      : emptyState('Something went wrong', errMsg(e), h('button', { class: 'btn', onclick: () => void renderRoute(shell, onSignOut) }, 'Try again'));
  }
  if (seq !== renderSeq) return;
  clear(shell.main);
  shell.main.appendChild(el);
  window.scrollTo(0, 0);
  (shell.main.querySelector('h1') as HTMLElement | null)?.focus({ preventScroll: true });
}
