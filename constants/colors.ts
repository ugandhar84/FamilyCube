// ── Family Cube — Design Tokens (matched to logo)  ───────────────────────────
//
// Logo cube faces:
//   Top    (House / Organize): Amber    #F5A623
//   Left   (Family / Connect): Teal     #00BBA4
//   Right  (Care / Grow):      Purple   #9261C7
//
// Wordmark:
//   "family" = Navy  #1E2D6B
//   "cube"   = Teal→Pink→Purple gradient
//
// Tagline:  CONNECT=#00BBA4  ORGANIZE=#F5A623  CARE=#F04E98  GROW=#9261C7
//
// CONNECT. ORGANIZE. CARE. GROW.

export const lightColors = {
  // ── Brand primaries ───────────────────────────────────────────────────
  primary:      '#9261C7',        // Purple (main brand, right cube face)
  primaryLight: '#F0E8FA',
  primaryDark:  '#6A3FA0',
  primaryMid:   '#A97DD4',
  primaryText:  '#9261C7',

  // ── Teal — Connect ────────────────────────────────────────────────────
  teal:         '#00BBA4',
  tealLight:    '#D6F5F1',
  tealDark:     '#008C7A',

  // ── Amber — Organize ─────────────────────────────────────────────────
  amber:        '#F5A623',
  amberLight:   '#FEF0D3',
  amberDark:    '#C47D0B',

  // ── Pink — Care ───────────────────────────────────────────────────────
  pink:         '#F04E98',
  pinkLight:    '#FCE4F1',
  pinkDark:     '#BE2C74',

  // ── Navy — wordmark ───────────────────────────────────────────────────
  navy:         '#1E2D6B',
  navyLight:    '#E8EAF6',

  // ── Role accents (mapped to brand) ────────────────────────────────────
  parent:       '#00BBA4',        // Teal = Connect = parents
  parentLight:  '#D6F5F1',
  parentDark:   '#008C7A',

  kid:          '#F5A623',        // Amber = Organize = kids earn coins
  kidLight:     '#FEF0D3',
  kidDark:      '#C47D0B',

  // ── Semantics ─────────────────────────────────────────────────────────
  danger:       '#EF4444',
  dangerLight:  '#FEE2E2',
  dangerDark:   '#991B1B',
  warning:      '#F5A623',
  warningLight: '#FEF0D3',
  warningDark:  '#C47D0B',
  success:      '#00BBA4',
  successLight: '#D6F5F1',
  successDark:  '#008C7A',
  info:         '#3B82F6',
  infoLight:    '#DBEAFE',
  infoDark:     '#1D4ED8',

  // ── Accent (pink / care) ──────────────────────────────────────────────
  accent:       '#F04E98',
  accentLight:  '#FCE4F1',
  accentDark:   '#BE2C74',

  // ── Surfaces ──────────────────────────────────────────────────────────
  background:   '#F8FAFC',
  surface:      '#F1F5F9',
  card:         '#FFFFFF',
  overlay:      'rgba(30,45,107,0.45)',

  // ── Borders ───────────────────────────────────────────────────────────
  border:       'rgba(146,97,199,0.15)',
  borderMed:    'rgba(146,97,199,0.28)',
  borderStrong: 'rgba(146,97,199,0.50)',

  // ── Text ──────────────────────────────────────────────────────────────
  textPrimary:   '#1E2D6B',
  textSecondary: '#64748B',
  textTertiary:  '#94A3B8',
  textInverse:   '#FFFFFF',
  textDisabled:  '#CBD5E1',

  // ── Tab bar ───────────────────────────────────────────────────────────
  tabBar:       '#FFFFFF',
  tabBarBorder: 'rgba(146,97,199,0.12)',
  tabActive:    '#9261C7',
  tabInactive:  '#94A3B8',

  // ── Status bar ────────────────────────────────────────────────────────
  statusBar:    'dark' as 'light' | 'dark',

  // ── Inputs ────────────────────────────────────────────────────────────
  inputBg:      '#F1F5F9',
  inputBorder:  'rgba(146,97,199,0.25)',
  placeholder:  '#94A3B8',

  // ── Skeleton ──────────────────────────────────────────────────────────
  skeleton:          '#E2E8F0',
  skeletonHighlight: '#F1F5F9',

  // ── Legacy compat ─────────────────────────────────────────────────────
  purple:      '#9261C7',
  purpleLight: '#F0E8FA',
  purpleDark:  '#6A3FA0',
};

export const darkColors: typeof lightColors = {
  primary:      '#B98EDB',
  primaryLight: 'rgba(185,142,219,0.18)',
  primaryDark:  '#D4B8ED',
  primaryMid:   '#C9A5E4',
  primaryText:  '#D4B8ED',

  teal:         '#2DD4BF',
  tealLight:    'rgba(45,212,191,0.18)',
  tealDark:     '#5EEAD4',

  amber:        '#FCD34D',
  amberLight:   'rgba(252,211,77,0.18)',
  amberDark:    '#FDE68A',

  pink:         '#F472B6',
  pinkLight:    'rgba(244,114,182,0.18)',
  pinkDark:     '#FBCFE8',

  navy:         '#A5B4FC',
  navyLight:    'rgba(165,180,252,0.15)',

  parent:       '#2DD4BF',
  parentLight:  'rgba(45,212,191,0.18)',
  parentDark:   '#5EEAD4',

  kid:          '#FCD34D',
  kidLight:     'rgba(252,211,77,0.18)',
  kidDark:      '#FDE68A',

  danger:       '#F87171',
  dangerLight:  'rgba(248,113,113,0.18)',
  dangerDark:   '#FCA5A5',
  warning:      '#FCD34D',
  warningLight: 'rgba(252,211,77,0.18)',
  warningDark:  '#FDE68A',
  success:      '#2DD4BF',
  successLight: 'rgba(45,212,191,0.18)',
  successDark:  '#5EEAD4',
  info:         '#60A5FA',
  infoLight:    'rgba(96,165,250,0.18)',
  infoDark:     '#93C5FD',

  accent:       '#F472B6',
  accentLight:  'rgba(244,114,182,0.18)',
  accentDark:   '#FBCFE8',

  background:   '#0B0F1A',
  surface:      '#161C2D',
  card:         '#1E2640',
  overlay:      'rgba(0,0,0,0.65)',

  border:       'rgba(185,142,219,0.15)',
  borderMed:    'rgba(185,142,219,0.28)',
  borderStrong: 'rgba(185,142,219,0.45)',

  textPrimary:   '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary:  '#64748B',
  textInverse:   '#0F172A',
  textDisabled:  '#475569',

  tabBar:       '#161C2D',
  tabBarBorder: 'rgba(185,142,219,0.12)',
  tabActive:    '#B98EDB',
  tabInactive:  '#64748B',

  statusBar:    'light' as const,

  inputBg:      '#1E2640',
  inputBorder:  'rgba(185,142,219,0.25)',
  placeholder:  '#64748B',

  skeleton:          '#1E2640',
  skeletonHighlight: '#2A3452',

  purple:      '#B98EDB',
  purpleLight: 'rgba(185,142,219,0.18)',
  purpleDark:  '#D4B8ED',
};

export type ThemeColors = typeof lightColors;
