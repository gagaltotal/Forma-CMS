import { api, state } from '../core/index.js';
import { clear, errMsg, fieldRow, h, pageHead, pill, toast } from '../components/index.js';
import { ACCENTS, applyPrefs, loadPrefs, savePrefs, type Prefs } from '../core/prefs.js';

export function accountView(): HTMLElement {
  let prefs: Prefs = loadPrefs();
  const set = (p: Partial<Prefs>) => { prefs = { ...prefs, ...p }; savePrefs(prefs); paint(); };
  const appearance = h('section', { class: 'panel stack lg' });
  const seg = <T extends string>(label: string, value: T, options: Array<[T, string]>, onPick: (v: T) => void) =>
    fieldRow(label, h('div', { class: 'segmented', role: 'group', 'aria-label': label }, options.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onPick(v) }, l))));

  function paint() {
    clear(appearance);
    const color = h('input', { type: 'color', value: prefs.accent, 'aria-label': 'Custom accent colour', onchange: () => set({ accent: color.value }) });
    appearance.append(
      h('h2', { class: 'h3' }, 'Appearance'),
      h('p', { class: 'muted' }, 'These settings are stored in this browser only.'),
      seg('Theme', prefs.theme, [['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']], (v) => set({ theme: v })),
      fieldRow('Accent colour', h('div', { class: 'swatches' },
        ACCENTS.map((a) => h('button', { type: 'button', class: 'swatch', title: a.name, 'aria-label': a.name, 'aria-pressed': String(prefs.accent.toLowerCase() === a.hex), style: { background: a.hex }, onclick: () => set({ accent: a.hex }) })), color)),
      seg('Density', prefs.density, [['comfortable', 'Comfortable'], ['compact', 'Compact']], (v) => set({ density: v })),
      h('div', null, h('button', { class: 'btn ghost', onclick: () => { localStorage.removeItem('forma.prefs.v1'); prefs = loadPrefs(); applyPrefs(prefs); paint(); } }, 'Reset to defaults')));
  }
  paint();

  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', maxLength: 128 });
  const next = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxLength: 128 });
  const again = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxLength: 128 });
  const err = h('p', { class: 'error-text', role: 'alert' });
  const form = h('form', { class: 'stack', onsubmit: async (e: Event) => {
    e.preventDefault(); err.textContent = '';
    if (next.value !== again.value) { err.textContent = 'The new passwords do not match'; return; }
    try {
      const r = await api<{ csrfToken: string }>('POST', '/api/auth/password', { currentPassword: cur.value, newPassword: next.value });
      state.csrf = r.csrfToken; cur.value = next.value = again.value = ''; toast('Password changed. Other devices were signed out.');
    } catch (ex) { err.textContent = errMsg(ex); }
  } }, fieldRow('Current password', cur), fieldRow('New password', next, { help: 'At least 12 characters. A long passphrase works well.' }), fieldRow('Repeat new password', again), err,
    h('div', null, h('button', { class: 'btn primary', type: 'submit' }, 'Change password')));

  return h('div', null, pageHead('Account', h('span', null, state.me?.email, ' · ', pill(state.me?.role.name ?? '', 'muted'))),
    h('div', { class: 'stack lg narrow' }, appearance, h('section', { class: 'panel stack' }, h('h2', { class: 'h3' }, 'Password'), form)));
}
