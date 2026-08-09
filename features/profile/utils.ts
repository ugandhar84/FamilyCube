import { format, parseISO } from 'date-fns';

export function initials(name: string | null | undefined, email?: string | null): string {
  const src = name ?? email ?? 'U';
  const parts = src.split(/[\s@]+/).filter(Boolean);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : src.charAt(0).toUpperCase();
}

export function memberSince(isoDate?: string | null): string {
  if (!isoDate) return '';
  try { return 'Member since ' + format(parseISO(isoDate), 'MMM yyyy'); } catch { return ''; }
}
