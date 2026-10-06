import { api, ApiError, state, type Me } from '../core/index.js';
import { clear, errMsg, fieldRow, h } from '../components/index.js';

interface SsoInfo { enabled: boolean; providerName: string; startUrl: string }

/** Tampilkan tombol SSO bila provider dikonfigurasi (tersedia untuk semua role; akun tetap harus terdaftar). */
async function provisionSso(slot: HTMLElement): Promise<void> {
  try {
    const info = await api<SsoInfo>('GET', '/api/auth/sso/info');
    if (!info.enabled) return;
    clear(slot);
    slot.appendChild(h('div', { class: 'sso-divider' }, h('span', null, 'or continue with')));
    const back = `${location.pathname}${location.hash}` || '/admin/';
    slot.appendChild(h('a', {
      class: 'btn block sso',
      href: `${info.startUrl}?redirect=${encodeURIComponent(back)}`,
    }, `Continue with ${info.providerName}`));
  } catch {
    /* SSO tidak tersedia: biarkan form login biasa. */
  }
}

export function loginView(onDone: () => void): HTMLElement {
  const email = h('input', { class: 'input', id: 'email', type: 'email', autocomplete: 'username', required: true, autofocus: true });
  const pw = h('input', { class: 'input', id: 'password', type: 'password', autocomplete: 'current-password', required: true, maxLength: 128 });
  const err = h('p', { class: 'error-text', role: 'alert' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'stack lg', novalidate: true, onsubmit: async (e: Event) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try {
      const r = await api<{ user: Me; csrfToken: string }>('POST', '/api/auth/login', { email: email.value, password: pw.value });
      state.me = r.user; state.csrf = r.csrfToken; pw.value = ''; onDone();
    } catch (ex) {
      err.textContent = ex instanceof ApiError && ex.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : errMsg(ex);
      pw.value = ''; pw.focus();
    } finally { btn.disabled = false; }
  } }, fieldRow('Email', email, { id: 'email' }), fieldRow('Password', pw, { id: 'password' }), err, btn);

  const ssoSlot = h('div', { class: 'sso-slot' });
  void provisionSso(ssoSlot);

  // Callback SSO mengembalikan ke halaman ini dengan `?sso_error=`; tampilkan lalu bersihkan URL.
  const ssoError = new URLSearchParams(location.search).get('sso_error');
  if (ssoError) {
    err.textContent = ssoError;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* abaikan */ }
  }

  return h('main', { class: 'login' },
    h('section', { class: 'login-card' },
      h('div', { class: 'brand big' }, h('span', { class: 'mark', 'aria-hidden': 'true' }), h('span', null, 'Forma')),
      h('h1', null, 'Sign in to your workspace'),
      h('p', { class: 'muted' }, 'Content you model yourself, delivered to any frontend.'),
      form,
      ssoSlot));
}
