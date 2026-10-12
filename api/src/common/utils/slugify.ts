/**
 * URL-safe slug. Unicode is normalised and stripped of diacritics so that
 * "Lycée Saint-Louis" becomes "lycee-saint-louis" rather than percent-escapes.
 */
export const slugify = (input: string): string =>
  input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
