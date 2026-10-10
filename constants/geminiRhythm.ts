/**
 * "Gemini rhythm" tokens — the warm-cream-canvas + shadowed-card + deep-
 * forest-slate-text palette adopted for the Figma-rhythm screens this
 * session (School, Home Care, Store/Rewards, member-profile, Health), as
 * an explicit named exception to CLAUDE.md rule 6 ("pure white canvas, no
 * warm tints" — the app-wide default everywhere else). See that rule's
 * own comment for the full rationale and the up-to-date file list.
 *
 * Every one of these screens used to redeclare the same ~7-10 const
 * lines locally (CANVAS/PAGE_BG, TITLE_CLR, BODY_CLR, BLUE, LINK_BLUE,
 * BORDER, CARD_BG, SURFACE, CARD_SHADOW) — real copy-paste drift already
 * happened (a couple of files were missing BLUE, one still had the old
 * hex values after a sweep) [live-requested: "make modularize for
 * simplicity"]. Import from here instead of re-declaring locally.
 *
 * Usage: `import { GEMINI } from '@/constants/geminiRhythm';` then
 * `GEMINI.canvas`, `GEMINI.titleColor`, etc. — or destructure what you
 * need. Screens still compute their own `isDark ? colors.xxx : GEMINI.xxx`
 * per-value (light/dark branching stays local, since dark mode uses the
 * app's normal `colors.*` theme object, not a second Gemini dark palette).
 */

export const GEMINI = {
  /** Canvas / screen root background (light mode only — dark mode uses colors.background) */
  canvas: '#ECE6DE',
  /** Primary heading/value text */
  titleColor: '#0D1210',
  /** Secondary/label text */
  bodyColor: '#3D4D47',
  /** Lighter secondary text (eyebrows, uppercase micro-labels) */
  bodyColorLight: '#4E5C56',
  /** Primary action color (buttons, active states) */
  blue: '#3B5FE4',
  /** Link/breadcrumb text color — darker than `blue` for body-text contrast */
  linkBlue: '#23352B',
  /** Card/field border */
  border: '#DDD6CC',
  /** Card background (bright white, contrasts against the warm canvas) */
  cardBg: '#FFFFFF',
  /** Surface tint for pills/chips/subtle fills */
  surface: '#F0EDE6',
  /** Real drop shadow for cards in light mode (replaces flat 1px borders) */
  cardShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;
