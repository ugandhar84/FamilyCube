/**
 * memberColors — the fixed per-person color palette used to tell family
 * members apart on Calendar/Agenda/Hub event cards, independent of role.
 * Previously every card was tinted by roleStyle() (features/calendar/
 * components/EventCard.tsx) — one shade per ROLE, so e.g. two kids or two
 * parents were visually identical. Live-requested: give each person their
 * own shade instead, like a shared Google Calendar color-codes each
 * calendar — and it must hold up in both light AND dark theme, not just
 * whichever the member happened to be viewing when the color was chosen.
 *
 * Stored as a KEY (not a raw hex) on members.color specifically so one DB
 * value can resolve to a correct hex in either theme — a raw hex was the
 * first thing tried here (found live: 4 existing members already had a
 * `color` column populated with plain hex strings, e.g. '#DB9270', from an
 * earlier attempt that was never wired into any screen) but that discards
 * dark-mode entirely, since a hex tuned to look right on a light card can
 * read as too dark/muted on a dark one. Migrated those 4 rows to the
 * nearest matching key rather than starting over — see
 * 20260931240000_assign_member_color.sql's own comment for exactly which
 * hex mapped to which key.
 *
 * 12 keys — enough headroom for a large blended/multi-generational family
 * without repeating a color, and enough visual distance between adjacent
 * PALETTE_ORDER entries that two colors never read as near-duplicates
 * next to each other on a card. Every hex stays in the same warm-editorial
 * "Kinfolk" value/chroma range as the 4 existing brand tokens (constants/
 * colors.ts) — the 8 new ones are not a bolted-on rainbow, they're picked
 * to sit in that same family so a 12-person household doesn't look like a
 * different app's palette past member #4.
 */

export type MemberColorKey =
  | 'terracotta' | 'sage' | 'amber' | 'lavender'
  | 'rose' | 'cyan' | 'ochre' | 'plum'
  | 'moss' | 'slate' | 'clay' | 'olive';

export interface MemberColorSwatch {
  key: MemberColorKey;
  label: string;
  light: string;      // dot / border / text-on-tint, light theme
  dark: string;        // dot / border / text-on-tint, dark theme
}

// Order also doubles as claim priority — first member in a family gets
// index 0, second gets index 1, etc. (see assign_member_color()'s
// v_palette, kept in the same order). Deliberately alternates warm/cool so
// two back-to-back claims never land on near-identical hues.
export const PALETTE_ORDER: MemberColorKey[] = [
  'terracotta', 'sage', 'amber', 'lavender', 'rose', 'cyan',
  'ochre', 'plum', 'moss', 'slate', 'clay', 'olive',
];

export const MEMBER_COLORS: Record<MemberColorKey, MemberColorSwatch> = {
  terracotta: { key: 'terracotta', label: 'Terracotta', light: '#BF4E12', dark: '#DB9270' },
  sage:       { key: 'sage',       label: 'Sage',        light: '#3C805B', dark: '#5FA37D' },
  amber:      { key: 'amber',      label: 'Amber',       light: '#BF7600', dark: '#D9AF74' },
  lavender:   { key: 'lavender',   label: 'Lavender',    light: '#6C519F', dark: '#A78BC9' },
  rose:       { key: 'rose',       label: 'Rose',        light: '#B23A5A', dark: '#D98BA0' },
  cyan:       { key: 'cyan',       label: 'Cyan',        light: '#1D7A8C', dark: '#5FBAC9' },
  ochre:      { key: 'ochre',      label: 'Ochre',       light: '#8A6A1F', dark: '#C9AD6B' },
  plum:       { key: 'plum',       label: 'Plum',        light: '#8A3A6B', dark: '#C97FAD' },
  moss:       { key: 'moss',       label: 'Moss',        light: '#5C7A2E', dark: '#96B36A' },
  slate:      { key: 'slate',      label: 'Slate',       light: '#3E5C73', dark: '#7FA3BD' },
  clay:       { key: 'clay',       label: 'Clay',        light: '#9C4A2E', dark: '#D98F6F' },
  olive:      { key: 'olive',      label: 'Olive',       light: '#6E6B2E', dark: '#B0AC6E' },
};

/**
 * Style triple matching roleStyle()'s existing `{ dot, badge, text }` shape
 * (features/calendar/components/EventCard.tsx), so call sites can swap the
 * color source without changing how the result gets consumed. `badge` is
 * derived the same way catStyle() already derives its tint (hex + alpha
 * suffix) rather than a second stored value per color — one less thing to
 * keep in sync per swatch, and it automatically follows the dot's own
 * light/dark hex.
 */
export function memberColorStyle(key: MemberColorKey | undefined | null, isDark: boolean): { dot: string; badge: string; text: string } {
  const swatch = MEMBER_COLORS[key as MemberColorKey] ?? MEMBER_COLORS.terracotta;
  const dot = isDark ? swatch.dark : swatch.light;
  const badge = dot + (isDark ? '25' : '20');
  return { dot, badge, text: dot };
}

/**
 * Next color for a new member — the first PALETTE_ORDER key not already
 * used by another member in `usedKeys` (that family's current colors).
 * Mirrors the DB trigger's own logic client-side, for any UI that wants to
 * preview/suggest a color before the row is actually inserted (the trigger
 * remains the source of truth for what's actually stored on insert — see
 * its own migration comment for why assignment lives there, not only
 * here). Also used by the profile color picker to know which swatches are
 * already claimed by OTHER members and should be disabled/hidden.
 */
export function nextAvailableColor(usedKeys: (MemberColorKey | null | undefined)[]): MemberColorKey {
  const used = new Set(usedKeys.filter(Boolean) as MemberColorKey[]);
  return PALETTE_ORDER.find(k => !used.has(k)) ?? PALETTE_ORDER[usedKeys.length % PALETTE_ORDER.length];
}
