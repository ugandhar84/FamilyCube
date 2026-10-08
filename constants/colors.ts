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
  primaryLight: '#FBEADF',
  primaryDark:  '#B84D2C',
  primaryMid:   '#E07356',
  primaryText:  '#DF613C',

  // ── Teal slot — sage (parent role accent) ──────────────────────────────
  teal:         '#3D7A5A',
  tealLight:    '#E1EFE7',
  tealDark:     '#2C5B41',

  // ── Amber slot — amber (kid role accent) ───────────────────────────────
  amber:        '#D97706',
  amberLight:   '#FDF1D6',
  amberDark:    '#A85A04',

  // ── Pink slot — lavender (third accent) ────────────────────────────────
  pink:         '#7B5EA7',
  pinkLight:    '#EFE8F8',
  pinkDark:     '#5D3F86',

  // ── Navy — warm near-black (wordmark / text primary) ───────────────────
  navy:         '#2C2722',
  navyLight:    '#EDE7DE',

  // ── Role accents ────────────────────────────────────────────────────────
  parent:       '#3D7A5A',
  parentLight:  '#E1EFE7',
  parentDark:   '#2C5B41',

  kid:          '#D97706',
  kidLight:     '#FDF1D6',
  kidDark:      '#A85A04',

  // ── Semantics ───────────────────────────────────────────────────────────
  danger:       '#C54A27',
  dangerLight:  '#FBEADF',
  dangerDark:   '#9C3A1F',
  warning:      '#D97706',
  warningLight: '#FDF1D6',
  warningDark:  '#A85A04',
  success:      '#3D7A5A',
  successLight: '#E1EFE7',
  successDark:  '#2C5B41',
  info:         '#7B5EA7',
  infoLight:    '#EFE8F8',
  infoDark:     '#5D3F86',

  // ── Accent (lavender) ───────────────────────────────────────────────────
  accent:       '#7B5EA7',
  accentLight:  '#EFE8F8',
  accentDark:   '#5D3F86',

  // ── Surfaces ────────────────────────────────────────────────────────────
  background:   '#FAF8F4',
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
  tabBar:       '#FDFCF9',
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
  skyLight:    '#E8F1F8',
  skyDark:     '#2E5F80',

  // ── Legacy compat ───────────────────────────────────────────────────────
  purple:      '#7B5EA7',
  purpleLight: '#EFE8F8',
  purpleDark:  '#5D3F86',
};

export const darkColors: typeof lightColors = {
  primary:      '#EE8058',
  primaryLight: 'rgba(238,128,88,0.18)',
  primaryDark:  '#C85D38',
  primaryMid:   '#E8704A',
  primaryText:  '#EE8058',

  teal:         '#5FA37D',
  tealLight:    'rgba(95,163,125,0.18)',
  tealDark:     '#7BBFA0',

  amber:        '#F5A85A',
  amberLight:   'rgba(245,168,90,0.18)',
  amberDark:    '#F9C488',

  pink:         '#A78BC9',
  pinkLight:    'rgba(167,139,201,0.18)',
  pinkDark:     '#C3AAE0',

  navy:         '#EDE7DE',
  navyLight:    'rgba(237,231,222,0.12)',

  parent:       '#5FA37D',
  parentLight:  'rgba(95,163,125,0.18)',
  parentDark:   '#7BBFA0',

  kid:          '#F5A85A',
  kidLight:     'rgba(245,168,90,0.18)',
  kidDark:      '#F9C488',

  danger:       '#EE8058',
  dangerLight:  'rgba(238,128,88,0.18)',
  dangerDark:   '#F2A07A',
  warning:      '#F5A85A',
  warningLight: 'rgba(245,168,90,0.18)',
  warningDark:  '#F9C488',
  success:      '#5FA37D',
  successLight: 'rgba(95,163,125,0.18)',
  successDark:  '#7BBFA0',
  info:         '#A78BC9',
  infoLight:    'rgba(167,139,201,0.18)',
  infoDark:     '#C3AAE0',

  accent:       '#A78BC9',
  accentLight:  'rgba(167,139,201,0.18)',
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
  skyLight:    'rgba(111,168,204,0.18)',
  skyDark:     '#4A85AA',

  purple:      '#A78BC9',
  purpleLight: 'rgba(167,139,201,0.18)',
  purpleDark:  '#C3AAE0',
};

export type ThemeColors = typeof lightColors;
