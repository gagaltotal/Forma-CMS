import { api, can, canAnyOn, state } from '../core/index.js';
import { loadPrefs, savePrefs } from '../core/prefs.js';
import { clear, h, icon, type IconName } from '../components/index.js';
import { currentPath } from './location.js';

export interface Shell { rail: HTMLElement; main: HTMLElement }

function navLink(href: string, label: string, ic: IconName): HTMLElement {
  const p = currentPath();
  const active = p === href.slice(1) || (href.length > 3 && p.startsWith(href.slice(1) + '/'));
  return h('a', { href, class: `nav-link${active ? ' active' : ''}`, 'aria-current': active ? 'page' : null, onclick: () => document.body.classList.remove('rail-open') }, icon(ic, 18), h('span', null, label));
}

/** Sidebar. Menu disaring menurut izin (hanya kosmetik; setiap endpoint tetap dijaga di server). */
export function renderRail(rail: HTMLElement, onSignOut: () => void): void {
  clear(rail);
  const p = loadPrefs();
  const visibleTypes = state.types.filter((t) => canAnyOn(t.apiId));
  const group = (title: string, ...links: (HTMLElement | null | false)[]) => {
    const items = links.filter(Boolean) as HTMLElement[];
    return items.length ? h('div', { class: 'nav-group' }, h('p', { class: 'nav-title' }, title), items) : null;
  };
  rail.append(
    h('div', { class: 'rail-top' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, 'Forma')),
      h('button', { class: 'icon-btn rail-toggle', 'aria-label': p.rail === 'open' ? 'Collapse sidebar' : 'Expand sidebar', onclick: () => { savePrefs({ ...loadPrefs(), rail: loadPrefs().rail === 'open' ? 'closed' : 'open' }); renderRail(rail, onSignOut); } }, icon('menu', 18))),
    h('nav', { class: 'rail-nav', 'aria-label': 'Main' },
      navLink('#/', 'Overview', 'home'),
      group('Content', ...visibleTypes.map((t) => navLink(`#/c/${t.apiId}`, t.displayName, 'doc')), can('media:read') && navLink('#/media', 'Media library', 'image')),
      group('Build', can('schema:manage') && navLink('#/builder', 'Content types', 'database')),
      group('Access', can('users:manage') && navLink('#/users', 'Users', 'users'), can('roles:manage') && navLink('#/roles', 'Roles', 'shield'), can('tokens:manage') && navLink('#/tokens', 'API tokens', 'key')),
      group('Activity', can('audit:read') && navLink('#/audit', 'Audit log', 'activity'))),
    h('div', { class: 'rail-foot' },
      navLink('#/account', state.me?.name ?? 'Account', 'sliders'),
      h('p', { class: 'rail-role' }, state.me?.role.name),
      h('button', { class: 'nav-link as-btn', onclick: async () => { try { await api('POST', '/api/auth/logout'); } finally { onSignOut(); } } }, icon('logout', 18), h('span', null, 'Sign out'))));
}

export function mountShell(root: HTMLElement, onSignOut: () => void): Shell {
  const rail = h('aside', { class: 'rail' });
  const main = h('main', { class: 'main', id: 'main' });
  const cmsName = document.querySelector<HTMLMetaElement>('meta[name="application-name"]')?.content || document.title.split(' - ')[0] || 'Forma';
  const footer = h('footer', { class: 'app-footer' }, `© ${new Date().getFullYear()} ${cmsName}`);
  clear(root);
  root.append(
    h('a', { class: 'skip', href: '#main', onclick: (e: Event) => { e.preventDefault(); (main.querySelector('h1') as HTMLElement | null)?.focus(); } }, 'Skip to content'),
    h('div', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': 'Open menu', onclick: () => document.body.classList.toggle('rail-open') }, icon('menu', 20)), h('span', { class: 'brand-name' }, 'Forma')),
    h('div', { class: 'shell' }, rail, main, h('div', { class: 'scrim', onclick: () => document.body.classList.remove('rail-open') }), footer));
  renderRail(rail, onSignOut);
  return { rail, main };
}
