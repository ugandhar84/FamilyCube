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
  primary:      '#C98A6E',        // Dusty terracotta (main brand, primary actions) — kept a shade richer than the other three since it still carries CTA weight
  primaryLight: '#F3E8E2',
  primaryDark:  '#A8664B',
  primaryMid:   '#D8A088',
  primaryText:  '#A8664B',

  // ── Teal slot — Muted Sage (Connect / calm / parent) ────────────────────
  teal:         '#7FA593',
  tealLight:    '#E9F0EC',
  tealDark:     '#5D8873',

  // ── Amber — Organize (kids earn coins), dustier gold not lightened orange
  amber:        '#D3A76C',
  amberLight:   '#F5EDDF',
  amberDark:    '#B08549',

  // ── Pink slot — Muted Lavender (Care / third accent) ────────────────────
  pink:         '#A79BC4',
  pinkLight:    '#EDE9F4',
  pinkDark:     '#8676AA',

  // ── Navy slot — warm near-black (wordmark / text) ──────────────────────
  navy:         '#2C2722',
  navyLight:    '#F2ECE1',

  // ── Role accents (mapped to brand) ────────────────────────────────────
  parent:       '#7FA593',        // Sage = Connect = parents
  parentLight:  '#E9F0EC',
  parentDark:   '#5D8873',

  kid:          '#D3A76C',        // Amber = Organize = kids earn coins
  kidLight:     '#F5EDDF',
  kidDark:      '#B08549',

  // ── Semantics ─────────────────────────────────────────────────────────
  danger:       '#C1705A',
  dangerLight:  '#F3E8E2',
  dangerDark:   '#9A5643',
  warning:      '#D3A76C',
  warningLight: '#F5EDDF',
  warningDark:  '#B08549',
  success:      '#7FA593',
  successLight: '#E9F0EC',
  successDark:  '#5D8873',
  info:         '#7FA0C4',
  infoLight:    '#E7EEF6',
  infoDark:     '#5C80A8',

  // ── Accent (lavender / care) ────────────────────────────────────────────
  accent:       '#A79BC4',
  accentLight:  '#EDE9F4',
  accentDark:   '#8676AA',

  // ── Surfaces — warm cashmere neutrals ───────────────────────────────────
  background:   '#F7F0E4',
  surface:      '#EFE4D2',
  card:         '#FFFCF7',
  overlay:      'rgba(44,39,34,0.45)',

  // ── Borders ───────────────────────────────────────────────────────────
  border:       'rgba(201,138,110,0.15)',
  borderMed:    'rgba(201,138,110,0.28)',
  borderStrong: 'rgba(201,138,110,0.50)',

  // ── Text ──────────────────────────────────────────────────────────────
  textPrimary:   '#2C2722',
  textSecondary: '#6B5F52',
  textTertiary:  '#8A7D6C',
  textInverse:   '#FFFFFF',
  textDisabled:  '#D5CCBE',

  // ── Tab bar ───────────────────────────────────────────────────────────
  tabBar:       '#FFFFFF',
  tabBarBorder: 'rgba(201,138,110,0.12)',
  tabActive:    '#C98A6E',
  tabInactive:  '#A69A8A',

  // ── Status bar ────────────────────────────────────────────────────────
  statusBar:    'dark' as 'light' | 'dark',

  // ── Inputs ────────────────────────────────────────────────────────────
  inputBg:      '#F2ECE1',
  inputBorder:  'rgba(201,138,110,0.25)',
  placeholder:  '#A69A8A',

  // ── Skeleton ──────────────────────────────────────────────────────────
  skeleton:          '#E5DFC8',
  skeletonHighlight: '#F2ECE1',

  // ── Legacy compat (aliases old "purple" name to the new primary hue) ───
  purple:      '#C98A6E',
  purpleLight: '#F3E8E2',
  purpleDark:  '#A8664B',
};

export const darkColors: typeof lightColors = {
  primary:      '#D8A088',
  primaryLight: 'rgba(216,160,136,0.18)',
  primaryDark:  '#E5BBA6',
  primaryMid:   '#DCAC97',
  primaryText:  '#E5BBA6',

  teal:         '#96B7A6',
  tealLight:    'rgba(150,183,166,0.18)',
  tealDark:     '#B5CFC2',

  amber:        '#DDBB89',
  amberLight:   'rgba(221,187,137,0.18)',
  amberDark:    '#E9D0AB',

  pink:         '#BBB0D2',
  pinkLight:    'rgba(187,176,210,0.18)',
  pinkDark:     '#D2C9E2',

  navy:         '#EDE7DE',
  navyLight:    'rgba(237,231,222,0.12)',

  parent:       '#96B7A6',
  parentLight:  'rgba(150,183,166,0.18)',
  parentDark:   '#B5CFC2',

  kid:          '#DDBB89',
  kidLight:     'rgba(221,187,137,0.18)',
  kidDark:      '#E9D0AB',

  danger:       '#D0917E',
  dangerLight:  'rgba(208,145,126,0.18)',
  dangerDark:   '#DFAFA1',
  warning:      '#DDBB89',
  warningLight: 'rgba(221,187,137,0.18)',
  warningDark:  '#E9D0AB',
  success:      '#96B7A6',
  successLight: 'rgba(150,183,166,0.18)',
  successDark:  '#B5CFC2',
  info:         '#96B4D2',
  infoLight:    'rgba(150,180,210,0.18)',
  infoDark:     '#B9CEE3',

  accent:       '#BBB0D2',
  accentLight:  'rgba(187,176,210,0.18)',
  accentDark:   '#D2C9E2',

  background:   '#0E0C13',
  surface:      '#17151D',
  card:         '#1D1A24',
  overlay:      'rgba(0,0,0,0.65)',

  border:       'rgba(216,160,136,0.15)',
  borderMed:    'rgba(216,160,136,0.28)',
  borderStrong: 'rgba(216,160,136,0.45)',

  textPrimary:   '#FDFCF9',
  textSecondary: '#B8AC9C',
  textTertiary:  '#7A6E60',
  textInverse:   '#1A1714',
  textDisabled:  '#4A4038',

  tabBar:       '#17151D',
  tabBarBorder: 'rgba(216,160,136,0.12)',
  tabActive:    '#D8A088',
  tabInactive:  '#7A6E60',

  statusBar:    'light' as const,

  inputBg:      '#1D1A24',
  inputBorder:  'rgba(216,160,136,0.25)',
  placeholder:  '#7A6E60',

  skeleton:          '#1D1A24',
  skeletonHighlight: '#2A2632',

  purple:      '#D8A088',
  purpleLight: 'rgba(216,160,136,0.18)',
  purpleDark:  '#E5BBA6',
};

export type ThemeColors = typeof lightColors;
