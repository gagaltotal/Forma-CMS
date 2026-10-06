import { renderRail, mountShell, type Shell } from "./app/shell.js";
import { renderRoute } from "./app/router.js";
import { clear } from "./components/index.js";
import { api, loadTypes, state, type Me } from "./core/index.js";
import { applyPrefs, loadPrefs } from "./core/prefs.js";
import { loginView } from "./pages/login.page.js";

applyPrefs(loadPrefs());
const root = document.getElementById("app")!;
let shell: Shell | null = null;

const showLogin = () => {
  shell = null;
  clear(root);
  root.appendChild(loginView(() => void boot()));
};
const signOut = () => {
  location.hash = "#/";
  void boot();
};

/** Alur awal: cek sesi -> (login | muat skema -> pasang shell -> render halaman). */
async function boot(): Promise<void> {
  state.me = null;
  state.csrf = "";
  state.types = [];
  try {
    const r = await api<{ user: Me; csrfToken: string }>("GET", "/api/auth/me");
    state.me = r.user;
    state.csrf = r.csrfToken;
  } catch {
    /* belum login */
  }
  if (!state.me) return showLogin();
  try {
    await loadTypes();
  } catch {
    /* pengguna tanpa akses skema: daftar kosong */
  }
  shell = mountShell(root, signOut);
  await renderRoute(shell, signOut);
}

const rerender = () => {
  if (state.me && shell) void renderRoute(shell, signOut);
};
window.addEventListener("hashchange", rerender);
window.addEventListener("forma:refresh", rerender);
window.addEventListener("forma:types", () => {
  if (state.me && shell) renderRail(shell.rail, signOut);
});
window.addEventListener("forma:unauth", () => {
  if (state.me) {
    state.me = null;
    showLogin();
  }
});
void boot();
