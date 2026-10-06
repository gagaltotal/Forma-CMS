/** Router berbasis hash (`#/c/article`): tanpa konfigurasi server, aman untuk hosting statis. */
export const currentPath = (): string => location.hash.replace(/^#/, '') || '/';
