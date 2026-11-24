// Thèmes Zeleph : variables CSS appliquées sur :root. Partagé avec le Worker (validation de l'id).
// bg/bg2 = dégradé de fond, surface/surface2 = cartes, line = bordures, text/muted = textes, accent/on = boutons.
export const THEMES = [
  { id: 'noir-oled', name: 'Noir OLED Pur', dark: true, bg: '#000000', bg2: '#000000', surface: '#111113', surface2: '#1c1c1f', line: '#26262a', text: '#ffffff', muted: '#8e8e93', accent: '#fa2d55', on: '#ffffff' },
  { id: 'cover', name: 'Cover Dynamique', dark: true, dynamic: true, bg: '#0b0b0d', bg2: '#000000', surface: '#16161a', surface2: '#202026', line: '#2a2a31', text: '#ffffff', muted: '#9a9aa2', accent: '#fa2d55', on: '#ffffff' },
  { id: 'sakura-nuit', name: 'Sakura Nuit', dark: true, bg: '#160b13', bg2: '#06030a', surface: '#22131d', surface2: '#2e1a28', line: '#3d2535', text: '#fbeef4', muted: '#bf9fb1', accent: '#ff8fb8', on: '#2a0d1a' },
  { id: 'sakura-rose', name: 'Sakura Rose', dark: false, bg: '#fde9f0', bg2: '#fff7fa', surface: '#ffffff', surface2: '#fbe1ea', line: '#f1cbd8', text: '#3a1a28', muted: '#97707f', accent: '#e0457b', on: '#ffffff' },
  { id: 'rose-velours', name: 'Rose Velours', dark: true, bg: '#1d0712', bg2: '#0b0207', surface: '#2b0d1c', surface2: '#3a1427', line: '#4c1d34', text: '#fde8f0', muted: '#c595ab', accent: '#e8678f', on: '#ffffff' },
  { id: 'neon-rose', name: 'Néon Rose', dark: true, bg: '#0c0414', bg2: '#020005', surface: '#180a22', surface2: '#231030', line: '#3a1650', text: '#fff0fb', muted: '#b993c9', accent: '#ff2fa8', on: '#ffffff', glow: '0 0 18px rgba(255,47,168,.55)' },
  { id: 'minuit-bleu', name: 'Minuit Bleu', dark: true, bg: '#081126', bg2: '#02050d', surface: '#101c38', surface2: '#172649', line: '#22345e', text: '#eaf1ff', muted: '#8ea2c8', accent: '#5b8cff', on: '#ffffff' },
  { id: 'emeraude', name: 'Émeraude Sombre', dark: true, bg: '#04160f', bg2: '#010805', surface: '#0b241a', surface2: '#113024', line: '#1a4232', text: '#e8fff5', muted: '#8dbfa9', accent: '#2fd29a', on: '#02261a' },
  { id: 'ambre', name: 'Ambre / Sunset', dark: true, bg: '#1f0e06', bg2: '#0a0402', surface: '#2c170b', surface2: '#3a1f10', line: '#4f2b16', text: '#fff2e6', muted: '#c9a184', accent: '#ff8c42', on: '#2a1104' },
  { id: 'violet', name: 'Violet Crépuscule', dark: true, bg: '#130b26', bg2: '#05030c', surface: '#1e1238', surface2: '#281948', line: '#36235f', text: '#f3edff', muted: '#a596c8', accent: '#a77bff', on: '#ffffff' },
  { id: 'clair', name: 'Blanc / Clair', dark: false, bg: '#f2f2f7', bg2: '#ffffff', surface: '#ffffff', surface2: '#ececf1', line: '#dcdce2', text: '#111114', muted: '#6e6e76', accent: '#fa2d55', on: '#ffffff' },
];
export const DEFAULT_THEME = 'noir-oled';
export const themeById = id => THEMES.find(t => t.id === id) ?? THEMES[0];

// Applique un thème (et, pour « Cover Dynamique », la couleur extraite de la pochette en cours).
export function applyTheme(id, coverRgb = null) {
  const t = themeById(id), s = document.documentElement.style;
  let v = { ...t };
  if (t.dynamic && coverRgb) {
    const [r, g, b] = coverRgb, mix = (k, a) => `rgb(${Math.round(r * k + a)},${Math.round(g * k + a)},${Math.round(b * k + a)})`;
    v = { ...v, bg: mix(0.45, 0), bg2: mix(0.12, 0), surface: mix(0.3, 14), surface2: mix(0.35, 24), line: mix(0.4, 34), accent: lighten(coverRgb) };
  }
  for (const k of ['bg', 'bg2', 'surface', 'surface2', 'line', 'text', 'muted', 'accent', 'on']) s.setProperty(`--${k}`, v[k]);
  s.setProperty('--glow', v.glow ?? 'none');
  s.colorScheme = t.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v.bg);
  document.documentElement.dataset.theme = t.id;
}
// Accent lisible : on remonte la luminosité d'une couleur trop sombre.
function lighten([r, g, b]) {
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2, k = l < 140 ? 140 / Math.max(l, 1) : 1;
  return `rgb(${[r, g, b].map(x => Math.min(255, Math.round(x * k))).join(',')})`;
}
