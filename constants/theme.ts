import { Dimensions, Platform } from 'react-native';
import { lightColors } from './colors';

const { width, height } = Dimensions.get('window');

export const SCREEN = { width, height };

// Scale helpers for cross-device responsiveness
export const scale = (size: number) => (width / 390) * size;
export const vs = (size: number) => (height / 844) * size;

// Legacy COLORS — aliases the light theme so existing screens still compile.
// All NEW screens should use useTheme().colors from lib/ThemeContext instead.
export const COLORS = {
  ...lightColors,
  // Legacy aliases kept for existing screens
  white: '#FFFFFF' as const,
};

export const FONTS = {
  regular: Platform.select({ ios: 'System', android: 'Roboto' }),
  medium: Platform.select({ ios: 'System', android: 'Roboto' }),
  bold: Platform.select({ ios: 'System', android: 'Roboto' }),
};

// Sizes below are deliberately larger than the Kinfolk mock's raw pixel
// values. The mock is a desktop web preview; those same px sizes read as
// too small to comfortably read on an actual phone screen (confirmed on
// device — 9-11px text was reported illegible). Every size here is the
// mock's intent (hierarchy, uppercase tracking, etc.) at a legible floor.
export const TYPO = {
  hero:       32,   // big hero numbers, pet names on detail
  title:      24,   // screen titles
  heading:    20,   // section headings, card titles
  subheading: 17,   // sub-section headers, large body
  body:       15,   // primary body text, buttons, inputs
  caption:    13,   // secondary info, timestamps, descriptions
  label:      12,   // chips, badges, small labels — floor raised from 11
  micro:      11,   // fine print — floor raised from 9, still smallest on screen
  // Kinfolk mock's uppercase section-header label (e.g. "TODAY'S TIMELINE
  // AXIS") — floor raised from the mock's 10-11px; paired with
  // LETTER_SPACING.sectionLabel and textTransform: 'uppercase'.
  sectionLabel: 12,
} as const;

export type TypoKey = keyof typeof TYPO;

// Letter-spacing pairings lifted from the mock (Tailwind's tracking-wider
// on uppercase labels, tracking-tight on display headings). Kept as a
// lookup so callers don't reinvent slightly-different values per screen.
export const LETTER_SPACING = {
  sectionLabel: 0.6,  // uppercase section headers ("ACTION NEEDED")
  display:     -0.3,  // greeting / large display headings
  badge:        0.4,  // small uppercase pills (role tags, status badges)
} as const;

// Tabular/mono-style numerals for times, ETAs, currency — the mock's
// `font-mono` class on timestamps and stat values. Apply alongside a
// monospace-leaning system font so digits align in a column.
export const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace' });

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 999,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const SHADOW = {
  sm: Platform.select({
    ios: { shadowColor: '#3D2068', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
    android: { elevation: 2 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#3D2068', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10 },
    android: { elevation: 5 },
  }),
  lg: Platform.select({
    ios: { shadowColor: '#3D2068', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16 },
    android: { elevation: 10 },
  }),
};

