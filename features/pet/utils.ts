import { differenceInYears, differenceInMonths, differenceInDays, parseISO, format } from 'date-fns';

export function ageStr(birthday?: string | null): string {
  if (!birthday) return '';
  try {
    const d = parseISO(birthday);
    const yrs = differenceInYears(new Date(), d);
    if (yrs > 0) return `${yrs} yr${yrs === 1 ? '' : 's'} old`;
    const mos = differenceInMonths(new Date(), d);
    return `${mos} month${mos !== 1 ? 's' : ''} old`;
  } catch { return ''; }
}

export function togetherStr(adoptionDate?: string | null): string | null {
  if (!adoptionDate) return null;
  try {
    const d = differenceInDays(new Date(), parseISO(adoptionDate));
    if (d < 30)  return `${d} day${d !== 1 ? 's' : ''} together`;
    if (d < 365) return `${Math.floor(d / 30)} month${Math.floor(d / 30) !== 1 ? 's' : ''} together`;
    const y = Math.floor(d / 365);
    return `${y} year${y !== 1 ? 's' : ''} together`;
  } catch { return null; }
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MMM d, yyyy'); } catch { return iso ?? '—'; }
}
