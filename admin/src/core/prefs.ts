/* Preferensi tampilan (tema, warna aksen, kepadatan). Disimpan lokal & divalidasi ketat saat dibaca. */
export interface Prefs { theme: 'auto' | 'light' | 'dark'; accent: string; density: 'comfortable' | 'compact'; rail: 'open' | 'closed' }
export const DEFAULT_PREFS: Prefs = { theme: 'auto', accent: '#f0b429', density: 'comfortable', rail: 'open' };
export const ACCENTS = [
  { name: 'Marigold', hex: '#f0b429' }, { name: 'Iris', hex: '#7c6cf0' }, { name: 'Lagoon', hex: '#1fb5c9' },
  { name: 'Moss', hex: '#7fbf4d' }, { name: 'Coral', hex: '#f0716a' }, { name: 'Orchid', hex: '#d45fb5' },
];
const KEY = 'forma.prefs.v1';

export function loadPrefs(): Prefs {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      theme: ['auto', 'light', 'dark'].includes(r.theme) ? r.theme : DEFAULT_PREFS.theme,
      accent: /^#[0-9a-f]{6}$/i.test(r.accent) ? r.accent : DEFAULT_PREFS.accent,
      density: r.density === 'compact' ? 'compact' : 'comfortable',
      rail: r.rail === 'closed' ? 'closed' : 'open',
    };
  } catch { return { ...DEFAULT_PREFS }; }
}
export function savePrefs(p: Prefs): void { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage penuh/diblokir */ } applyPrefs(p); }

function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.38 ? '#16120a' : '#ffffff';
}
export function applyPrefs(p: Prefs): void {
  const root = document.documentElement;
  if (p.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', p.theme);
  root.setAttribute('data-density', p.density);
  root.setAttribute('data-rail', p.rail);
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--accent-ink', inkFor(p.accent));
}
