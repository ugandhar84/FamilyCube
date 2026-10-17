/** Shared by the phone's School pages and the kiosk's: term grouping and class-name tidying. */
import type { ClassPeriod } from '@/store/schoolStore';

/** The distinct terms (Fall, Spring, Q1...) a schedule's classes belong to, in the order they appear. */
export function termsOf(periods: ClassPeriod[]): string[] {
  return [...new Set(periods.map(p => p.term?.trim()).filter((t): t is string => !!t))];
}

/** Best guess at which term is running now, from the month and the term's name. Falls back to the first term. */
export function guessCurrentTerm(terms: string[]): string | undefined {
  if (terms.length === 0) return undefined;
  const m = new Date().getMonth(); // 0 = Jan
  const fall = m >= 7;
  const quarter = m >= 7 && m <= 9 ? 1 : (m >= 10 || m === 0) ? 2 : m <= 3 ? 3 : 4;
  const hit = terms.find(t => {
    const x = t.toLowerCase();
    if (/fall|autumn/.test(x)) return fall;
    if (/spring/.test(x)) return !fall && m <= 5;
    if (/summer/.test(x)) return m === 5 || m === 6;
    const q = x.match(/(?:^|\b)(?:q|quarter|term)\s*([1-4])\b/);
    if (q) return +q[1] === quarter;
    const sem = x.match(/(?:semester|sem)\s*([12])\b/);
    if (sem) return (+sem[1] === 1) === fall;
    return false;
  });
  return hit ?? terms[0];
}

/** Classes that run in a term: ones tagged with it, plus any with no term (they run all year). */
export function periodsInTerm(periods: ClassPeriod[], term?: string): ClassPeriod[] {
  return term ? periods.filter(p => !p.term || p.term.trim() === term) : periods;
}



/** "HONORS SCI 8 A" -> "Honors Sci 8 A": long shouty words become Title Case; short ones (ELAR, ART, US, MATH) and anything with a digit stay as written. */
export function prettySubject(raw: string): string {
  return raw.split(/\s+/).map(w => {
    if (w.length <= 4 || /\d/.test(w) || w !== w.toUpperCase()) return w;
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join(' ');
}


