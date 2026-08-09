/** Capitalise the first letter of every word. Safe on undefined/null. */
export const toTitle = (s?: string | null): string =>
  s ? s.replace(/\b\w/g, c => c.toUpperCase()) : '';
