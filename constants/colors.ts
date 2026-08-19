// ── Family Cube — Design Tokens (Kinfolk palette) ────────────────────────────
//
// Adapted from the "Kinfolk" reference: warm editorial terracotta/sage/
// lavender/amber on cashmere neutrals, replacing the earlier cool purple/
// teal/pink cube palette. Token NAMES are unchanged (primary/parent/kid/
// accent/etc.) so no component code needs to change — only the hex values
// moved. See components/FamilyCubeLogo.tsx's BRAND constant, which mirrors
// these same values for call sites that reach for BRAND.* directly instead
// of useTheme().
//
// Role mapping:
//   primary (terracotta) — main brand, primary actions
//   sage    (parent/teal slot) — calm/positive, parent role accent
//   amber   (kid slot)         — warmth, kid role accent
//   lavender (accent/pink slot) — third accent, highlights
//
// CONNECT. ORGANIZE. CARE. GROW.

export const lightColors = {
  // ── Brand primaries — Terracotta ──────────────────────────────────────
  primary:      '#DF613C',        // Terracotta (main brand, primary actions)
  primaryLight: '#FBEADF',
  primaryDark:  '#C54A27',
  primaryMid:   '#EE8058',
  primaryText:  '#C54A27',

  // ── Teal slot — Sage (Connect / calm / parent) ─────────────────────────
  teal:         '#3D7A5A',
  tealLight:    '#E1EFE7',
  tealDark:     '#2E5F45',

  // ── Amber — Organize (kids earn coins) ─────────────────────────────────
  amber:        '#D97706',
  amberLight:   '#FDF1D6',
  amberDark:    '#B45309',

  // ── Pink slot — Lavender (Care / third accent) ─────────────────────────
  pink:         '#7B5EA7',
  pinkLight:    '#EFE8F8',
  pinkDark:     '#62468C',

  // ── Navy slot — warm near-black (wordmark / text) ──────────────────────
  navy:         '#2C2722',
  navyLight:    '#F2ECE1',

  // ── Role accents (mapped to brand) ────────────────────────────────────
  parent:       '#3D7A5A',        // Sage = Connect = parents
  parentLight:  '#E1EFE7',
  parentDark:   '#2E5F45',

  kid:          '#D97706',        // Amber = Organize = kids earn coins
  kidLight:     '#FDF1D6',
  kidDark:      '#B45309',

  // ── Semantics ─────────────────────────────────────────────────────────
  danger:       '#C54A27',
  dangerLight:  '#FBEADF',
  dangerDark:   '#9A3A1E',
  warning:      '#D97706',
  warningLight: '#FDF1D6',
  warningDark:  '#B45309',
  success:      '#3D7A5A',
  successLight: '#E1EFE7',
  successDark:  '#2E5F45',
  info:         '#3B82F6',
  infoLight:    '#DBEAFE',
  infoDark:     '#1D4ED8',

  // ── Accent (lavender / care) ────────────────────────────────────────────
  accent:       '#7B5EA7',
  accentLight:  '#EFE8F8',
  accentDark:   '#62468C',

  // ── Surfaces — warm cashmere neutrals ───────────────────────────────────
  background:   '#FAF8F4',
  surface:      '#F2ECE1',
  card:         '#FFFFFF',
  overlay:      'rgba(44,39,34,0.45)',

  // ── Borders ───────────────────────────────────────────────────────────
  border:       'rgba(223,97,60,0.15)',
  borderMed:    'rgba(223,97,60,0.28)',
  borderStrong: 'rgba(223,97,60,0.50)',

  // ── Text ──────────────────────────────────────────────────────────────
  textPrimary:   '#2C2722',
  textSecondary: '#6B5F52',
  textTertiary:  '#A69A8A',
  textInverse:   '#FFFFFF',
  textDisabled:  '#D5CCBE',

  // ── Tab bar ───────────────────────────────────────────────────────────
  tabBar:       '#FFFFFF',
  tabBarBorder: 'rgba(223,97,60,0.12)',
  tabActive:    '#DF613C',
  tabInactive:  '#A69A8A',

  // ── Status bar ────────────────────────────────────────────────────────
  statusBar:    'dark' as 'light' | 'dark',

  // ── Inputs ────────────────────────────────────────────────────────────
  inputBg:      '#F2ECE1',
  inputBorder:  'rgba(223,97,60,0.25)',
  placeholder:  '#A69A8A',

  // ── Skeleton ──────────────────────────────────────────────────────────
  skeleton:          '#E5DFC8',
  skeletonHighlight: '#F2ECE1',

  // ── Legacy compat (aliases old "purple" name to the new primary hue) ───
  purple:      '#DF613C',
  purpleLight: '#FBEADF',
  purpleDark:  '#C54A27',
};

export const darkColors: typeof lightColors = {
  primary:      '#EE8058',
  primaryLight: 'rgba(238,128,88,0.18)',
  primaryDark:  '#F5A87E',
  primaryMid:   '#F0946A',
  primaryText:  '#F5A87E',

  teal:         '#5FA37D',
  tealLight:    'rgba(95,163,125,0.18)',
  tealDark:     '#8AC4A5',

  amber:        '#F5A85A',
  amberLight:   'rgba(245,168,90,0.18)',
  amberDark:    '#FBCB94',

  pink:         '#A78BC9',
  pinkLight:    'rgba(167,139,201,0.18)',
  pinkDark:     '#CBB8E0',

  navy:         '#EDE7DE',
  navyLight:    'rgba(237,231,222,0.12)',

  parent:       '#5FA37D',
  parentLight:  'rgba(95,163,125,0.18)',
  parentDark:   '#8AC4A5',

  kid:          '#F5A85A',
  kidLight:     'rgba(245,168,90,0.18)',
  kidDark:      '#FBCB94',

  danger:       '#EE8058',
  dangerLight:  'rgba(238,128,88,0.18)',
  dangerDark:   '#F5A87E',
  warning:      '#F5A85A',
  warningLight: 'rgba(245,168,90,0.18)',
  warningDark:  '#FBCB94',
  success:      '#5FA37D',
  successLight: 'rgba(95,163,125,0.18)',
  successDark:  '#8AC4A5',
  info:         '#60A5FA',
  infoLight:    'rgba(96,165,250,0.18)',
  infoDark:     '#93C5FD',

  accent:       '#A78BC9',
  accentLight:  'rgba(167,139,201,0.18)',
  accentDark:   '#CBB8E0',

  background:   '#0E0C13',
  surface:      '#17151D',
  card:         '#1D1A24',
  overlay:      'rgba(0,0,0,0.65)',

  border:       'rgba(238,128,88,0.15)',
  borderMed:    'rgba(238,128,88,0.28)',
  borderStrong: 'rgba(238,128,88,0.45)',

  textPrimary:   '#FDFCF9',
  textSecondary: '#B8AC9C',
  textTertiary:  '#7A6E60',
  textInverse:   '#1A1714',
  textDisabled:  '#4A4038',

  tabBar:       '#17151D',
  tabBarBorder: 'rgba(238,128,88,0.12)',
  tabActive:    '#EE8058',
  tabInactive:  '#7A6E60',

  statusBar:    'light' as const,

  inputBg:      '#1D1A24',
  inputBorder:  'rgba(238,128,88,0.25)',
  placeholder:  '#7A6E60',

  skeleton:          '#1D1A24',
  skeletonHighlight: '#2A2632',

  purple:      '#EE8058',
  purpleLight: 'rgba(238,128,88,0.18)',
  purpleDark:  '#F5A87E',
};

export type ThemeColors = typeof lightColors;
