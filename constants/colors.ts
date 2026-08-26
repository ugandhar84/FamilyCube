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
  // ── Brand primaries — Dusty Terracotta ──────────────────────────────────
  primary:      '#CD7B57',        // Dusty terracotta (main brand, primary actions) — deepened a step, still short of the original loud version
  primaryLight: '#F3E1D6',
  primaryDark:  '#A05939',
  primaryMid:   '#DA9977',
  primaryText:  '#A05939',

  // ── Teal slot — Muted Sage (Connect / calm / parent) ────────────────────
  teal:         '#69927C',
  tealLight:    '#E3EDE8',
  tealDark:     '#4F7562',

  // ── Amber — Organize (kids earn coins), dustier gold not lightened orange
  amber:        '#C9964F',
  amberLight:   '#F2E6CE',
  amberDark:    '#A17638',

  // ── Pink slot — Muted Lavender (Care / third accent) ────────────────────
  pink:         '#9686B5',
  pinkLight:    '#E9E3F1',
  pinkDark:     '#75699A',

  // ── Navy slot — warm near-black (wordmark / text) ──────────────────────
  navy:         '#2C2722',
  navyLight:    '#F2ECE1',

  // ── Role accents (mapped to brand) ────────────────────────────────────
  parent:       '#69927C',        // Sage = Connect = parents
  parentLight:  '#E3EDE8',
  parentDark:   '#4F7562',

  kid:          '#C9964F',        // Amber = Organize = kids earn coins
  kidLight:     '#F2E6CE',
  kidDark:      '#A17638',

  // ── Semantics ─────────────────────────────────────────────────────────
  danger:       '#B85F45',
  dangerLight:  '#F3E1D6',
  dangerDark:   '#8E4632',
  warning:      '#C9964F',
  warningLight: '#F2E6CE',
  warningDark:  '#A17638',
  success:      '#69927C',
  successLight: '#E3EDE8',
  successDark:  '#4F7562',
  info:         '#5F8CB8',
  infoLight:    '#DEE9F2',
  infoDark:     '#456A8E',

  // ── Accent (lavender / care) ────────────────────────────────────────────
  accent:       '#9686B5',
  accentLight:  '#E9E3F1',
  accentDark:   '#75699A',

  // ── Surfaces — warm cashmere neutrals ───────────────────────────────────
  background:   '#FDFBF7',
  surface:      '#F8F3EA',
  card:         '#FFFFFF',
  overlay:      'rgba(44,39,34,0.45)',

  // ── Borders ───────────────────────────────────────────────────────────
  border:       'rgba(205,123,87,0.18)',
  borderMed:    'rgba(205,123,87,0.32)',
  borderStrong: 'rgba(205,123,87,0.55)',

  // ── Text ──────────────────────────────────────────────────────────────
  textPrimary:   '#2C2722',
  textSecondary: '#6B5F52',
  textTertiary:  '#8A7D6C',
  textInverse:   '#FFFFFF',
  textDisabled:  '#D5CCBE',

  // ── Tab bar ───────────────────────────────────────────────────────────
  tabBar:       '#FFFFFF',
  tabBarBorder: 'rgba(205,123,87,0.14)',
  tabActive:    '#CD7B57',
  tabInactive:  '#A69A8A',

  // ── Status bar ────────────────────────────────────────────────────────
  statusBar:    'dark' as 'light' | 'dark',

  // ── Inputs ────────────────────────────────────────────────────────────
  inputBg:      '#F2ECE1',
  inputBorder:  'rgba(205,123,87,0.28)',
  placeholder:  '#A69A8A',

  // ── Skeleton ──────────────────────────────────────────────────────────
  skeleton:          '#E5DFC8',
  skeletonHighlight: '#F2ECE1',

  // ── Legacy compat (aliases old "purple" name to the new primary hue) ───
  purple:      '#CD7B57',
  purpleLight: '#F3E1D6',
  purpleDark:  '#A05939',
};

export const darkColors: typeof lightColors = {
  primary:      '#DB9270',
  primaryLight: 'rgba(219,146,112,0.20)',
  primaryDark:  '#E9B199',
  primaryMid:   '#E1A183',
  primaryText:  '#E9B199',

  teal:         '#86AC97',
  tealLight:    'rgba(134,172,151,0.20)',
  tealDark:     '#A9C7B5',

  amber:        '#D9AF74',
  amberLight:   'rgba(217,175,116,0.20)',
  amberDark:    '#E7C695',

  pink:         '#AC9BC7',
  pinkLight:    'rgba(172,155,199,0.20)',
  pinkDark:     '#C8BADB',

  navy:         '#EDE7DE',
  navyLight:    'rgba(237,231,222,0.12)',

  parent:       '#86AC97',
  parentLight:  'rgba(134,172,151,0.20)',
  parentDark:   '#A9C7B5',

  kid:          '#D9AF74',
  kidLight:     'rgba(217,175,116,0.20)',
  kidDark:      '#E7C695',

  danger:       '#CC8064',
  dangerLight:  'rgba(204,128,100,0.20)',
  dangerDark:   '#DEA48D',
  warning:      '#D9AF74',
  warningLight: 'rgba(217,175,116,0.20)',
  warningDark:  '#E7C695',
  success:      '#86AC97',
  successLight: 'rgba(134,172,151,0.20)',
  successDark:  '#A9C7B5',
  info:         '#82A6CC',
  infoLight:    'rgba(130,166,204,0.20)',
  infoDark:     '#AAC3DE',

  accent:       '#AC9BC7',
  accentLight:  'rgba(172,155,199,0.20)',
  accentDark:   '#C8BADB',

  background:   '#0E0C13',
  surface:      '#17151D',
  card:         '#1D1A24',
  overlay:      'rgba(0,0,0,0.65)',

  border:       'rgba(219,146,112,0.18)',
  borderMed:    'rgba(219,146,112,0.32)',
  borderStrong: 'rgba(219,146,112,0.50)',

  textPrimary:   '#FDFCF9',
  textSecondary: '#B8AC9C',
  textTertiary:  '#7A6E60',
  textInverse:   '#1A1714',
  textDisabled:  '#4A4038',

  tabBar:       '#17151D',
  tabBarBorder: 'rgba(219,146,112,0.14)',
  tabActive:    '#DB9270',
  tabInactive:  '#7A6E60',

  statusBar:    'light' as const,

  inputBg:      '#1D1A24',
  inputBorder:  'rgba(219,146,112,0.28)',
  placeholder:  '#7A6E60',

  skeleton:          '#1D1A24',
  skeletonHighlight: '#2A2632',

  purple:      '#DB9270',
  purpleLight: 'rgba(219,146,112,0.20)',
  purpleDark:  '#E9B199',
};

export type ThemeColors = typeof lightColors;
