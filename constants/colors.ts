// ── Family Cube — Design Tokens ───────────────────────────────────────────────
//
// "Kinfolk" palette — warm terracotta / sage / amber / lavender on cashmere.
// Token names map to brand roles; hex values are the Kinfolk set.
// FamilyCubeLogo.tsx's BRAND constant mirrors these same light-mode values
// for call sites that can't use hooks — keep both in sync if this table changes.
//
// Role mapping:
//   primary  — terracotta (#DF613C) — main brand, primary actions
//   teal     — sage (#3D7A5A)       — CONNECT, parent role accent
//   amber    — amber (#D97706)      — ORGANIZE, kid role accent
//   pink     — lavender (#7B5EA7)   — CARE, third accent
//   navy     — warm near-black (#2C2722) — wordmark / text primary

export const lightColors = {
  // ── Brand primary — terracotta ─────────────────────────────────────────
  primary:      '#DF613C',
  primaryLight: '#FADFD2',
  primaryDark:  '#B84D2C',
  primaryMid:   '#E07356',
  primaryText:  '#DF613C',

  // ── Teal slot — sage (parent role accent) ──────────────────────────────
  teal:         '#3D7A5A',
  tealLight:    '#D1E3D9',
  tealDark:     '#2C5B41',

  // ── Amber slot — amber (kid role accent) ───────────────────────────────
  amber:        '#D97706',
  amberLight:   '#F9E5C1',
  amberDark:    '#A85A04',

  // ── Pink slot — lavender (third accent) ────────────────────────────────
  pink:         '#7B5EA7',
  pinkLight:    '#E3DAF0',
  pinkDark:     '#5D3F86',

  // ── Navy — warm near-black (wordmark / text primary) ───────────────────
  navy:         '#2C2722',
  navyLight:    '#EDE7DE',

  // ── Role accents ────────────────────────────────────────────────────────
  parent:       '#3D7A5A',
  parentLight:  '#D1E3D9',
  parentDark:   '#2C5B41',

  kid:          '#D97706',
  kidLight:     '#F9E5C1',
  kidDark:      '#A85A04',

  // ── Semantics ───────────────────────────────────────────────────────────
  danger:       '#C54A27',
  dangerLight:  '#F6DACD',
  dangerDark:   '#9C3A1F',
  warning:      '#D97706',
  warningLight: '#F9E5C1',
  warningDark:  '#A85A04',
  success:      '#3D7A5A',
  successLight: '#D1E3D9',
  successDark:  '#2C5B41',
  info:         '#7B5EA7',
  infoLight:    '#E3DAF0',
  infoDark:     '#5D3F86',

  // ── Accent (lavender) ───────────────────────────────────────────────────
  accent:       '#7B5EA7',
  accentLight:  '#E3DAF0',
  accentDark:   '#5D3F86',

  // ── Surfaces ────────────────────────────────────────────────────────────
  background:   '#FFFFFF',   // pure white canvas app-wide (was warm cashmere #FAF8F4)
  surface:      '#F2ECE1',
  card:         '#FFFFFF',
  overlay:      'rgba(44,39,34,0.45)',

  // ── Borders ─────────────────────────────────────────────────────────────
  border:       'rgba(223,97,60,0.15)',
  borderMed:    'rgba(223,97,60,0.25)',
  borderStrong: 'rgba(223,97,60,0.45)',

  // ── Text ────────────────────────────────────────────────────────────────
  textPrimary:   '#2C2722',
  textSecondary: '#6B5F52',
  textTertiary:  '#A69A8A',
  textInverse:   '#FFFFFF',
  textDisabled:  '#D4C9BC',

  // ── Tab bar ─────────────────────────────────────────────────────────────
  tabBar:       '#FFFFFF',
  tabBarBorder: 'rgba(223,97,60,0.12)',
  tabActive:    '#DF613C',
  tabInactive:  '#A69A8A',

  // ── Status bar ──────────────────────────────────────────────────────────
  statusBar:    'dark' as 'light' | 'dark',

  // ── Inputs ──────────────────────────────────────────────────────────────
  inputBg:      '#F2ECE1',
  inputBorder:  'rgba(223,97,60,0.20)',
  placeholder:  '#A69A8A',

  // ── Skeleton ────────────────────────────────────────────────────────────
  skeleton:          '#EDE7DE',
  skeletonHighlight: '#FAF8F4',

  // ── Sky blue — Figma "Arrange a ride" / informational ───────────────────
  sky:         '#4A7FA5',
  skyLight:    '#D8E6F0',
  skyDark:     '#2E5F80',

  // ── Legacy compat ───────────────────────────────────────────────────────
  purple:      '#7B5EA7',
  purpleLight: '#E3DAF0',
  purpleDark:  '#5D3F86',
};

export const darkColors: typeof lightColors = {
  primary:      '#EE8058',
  primaryLight: 'rgba(238,128,88,0.20)',
  primaryDark:  '#C85D38',
  primaryMid:   '#E8704A',
  primaryText:  '#EE8058',

  teal:         '#5FA37D',
  tealLight:    'rgba(95,163,125,0.20)',
  tealDark:     '#7BBFA0',

  amber:        '#F5A85A',
  amberLight:   'rgba(245,168,90,0.20)',
  amberDark:    '#F9C488',

  pink:         '#A78BC9',
  pinkLight:    'rgba(167,139,201,0.20)',
  pinkDark:     '#C3AAE0',

  navy:         '#EDE7DE',
  navyLight:    'rgba(237,231,222,0.12)',

  parent:       '#5FA37D',
  parentLight:  'rgba(95,163,125,0.20)',
  parentDark:   '#7BBFA0',

  kid:          '#F5A85A',
  kidLight:     'rgba(245,168,90,0.20)',
  kidDark:      '#F9C488',

  danger:       '#EE8058',
  dangerLight:  'rgba(238,128,88,0.20)',
  dangerDark:   '#F2A07A',
  warning:      '#F5A85A',
  warningLight: 'rgba(245,168,90,0.20)',
  warningDark:  '#F9C488',
  success:      '#5FA37D',
  successLight: 'rgba(95,163,125,0.20)',
  successDark:  '#7BBFA0',
  info:         '#A78BC9',
  infoLight:    'rgba(167,139,201,0.20)',
  infoDark:     '#C3AAE0',

  accent:       '#A78BC9',
  accentLight:  'rgba(167,139,201,0.20)',
  accentDark:   '#C3AAE0',

  background:   '#0E0C13',
  surface:      '#17151D',
  card:         '#1D1A24',
  overlay:      'rgba(0,0,0,0.65)',

  border:       'rgba(238,128,88,0.15)',
  borderMed:    'rgba(238,128,88,0.28)',
  borderStrong: 'rgba(238,128,88,0.50)',

  textPrimary:   '#FDFCF9',
  textSecondary: '#B8AC9C',
  textTertiary:  '#7A6E60',
  textInverse:   '#0E0C13',
  textDisabled:  '#3A3530',

  tabBar:       '#0E0C13',
  tabBarBorder: 'rgba(238,128,88,0.12)',
  tabActive:    '#EE8058',
  tabInactive:  '#7A6E60',

  statusBar:    'light' as const,

  inputBg:      '#17151D',
  inputBorder:  'rgba(238,128,88,0.22)',
  placeholder:  '#7A6E60',

  skeleton:          '#1D1A24',
  skeletonHighlight: '#252030',

  sky:         '#6FA8CC',
  skyLight:    'rgba(111,168,204,0.20)',
  skyDark:     '#4A85AA',

  purple:      '#A78BC9',
  purpleLight: 'rgba(167,139,201,0.20)',
  purpleDark:  '#C3AAE0',
};

export type ThemeColors = typeof lightColors;
