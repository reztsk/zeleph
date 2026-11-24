// Navigation par hash (#/chemin) : compatible écran d'accueil iOS, aucun serveur de routes nécessaire.
export const go = path => { if (location.hash !== `#${path}`) location.hash = path; };
export const back = () => (history.length > 1 ? history.back() : go('/home'));
export const current = () => location.hash.replace(/^#/, '') || '/home';
export const session = { me: null };
