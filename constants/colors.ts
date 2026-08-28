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
  // "Bold tiles" palette (approved after live mock comparison — see
  // palette_mock artifact, session 2026-08-28): *Light tint tokens are the
  // tile/pill/badge BACKGROUNDS most of the screen's colored area actually
  // consists of — punching up only the small icon-circle colors and leaving
  // these washed-out tints barely moved was why an earlier saturation pass
  // read as "no different from current" (direct user feedback on the first
  // mock). These are meaningfully darker/more saturated than a typical
  // "light" tint, by design.
  primary:      '#BF4E12',        // Bold saturated terracotta (was dusty #CD7B57)
  primaryLight: '#EACAAC',
  primaryDark:  '#8A3A0D',
  primaryMid:   '#DA9977',
  primaryText:  '#8A3A0D',

  // ── Teal slot — Muted Sage (Connect / calm / parent) ────────────────────
  teal:         '#3C805B',        // Bold saturated sage (was dusty #69927C)
  tealLight:    '#C7E3D5',
  tealDark:     '#245A3D',

  // ── Amber — Organize (kids earn coins), dustier gold not lightened orange
  amber:        '#BF7600',        // Bold saturated amber (was dusty #C9964F)
  amberLight:   '#EADA98',
  amberDark:    '#8A5500',

  // ── Pink slot — Muted Lavender (Care / third accent) ────────────────────
  pink:         '#6C519F',        // Bold saturated lavender (was dusty #9686B5)
  pinkLight:    '#D4C3EA',
  pinkDark:     '#4A3670',

  // ── Navy slot — warm near-black (wordmark / text) ──────────────────────
  navy:         '#2C2722',
  navyLight:    '#F2ECE1',

  // ── Role accents (mapped to brand) ────────────────────────────────────
  parent:       '#3C805B',        // Sage = Connect = parents
  parentLight:  '#C7E3D5',
  parentDark:   '#245A3D',

  // NOTE: kid was historically an exact alias of amber (both #C9964F) —
  // Grocery and Meals action tiles (both tinted from this pair) were
  // therefore guaranteed-identical colors sitting side by side, flagged as
  // "hardly visible/same color" in review. Fixed at the CALL SITE
  // (ParentQuickActions.tsx: Grocery now tints from colors.primary instead
  // of colors.kid) rather than by un-aliasing kid from amber here — every
  // other kid-role UI surface (avatars, badges, roster) still correctly
  // wants kid===amber as one coherent "Organize" identity; only that one
  // tile row actually needed two more distinct hues than the brand has role
  // slots for.
  kid:          '#BF7600',        // Amber = Organize = kids earn coins
  kidLight:     '#EADA98',
  kidDark:      '#8A5500',

  // ── Semantics ─────────────────────────────────────────────────────────
  danger:       '#B85F45',
  dangerLight:  '#EACAAC',
  dangerDark:   '#8E4632',
  warning:      '#BF7600',
  warningLight: '#EADA98',
  warningDark:  '#8A5500',
  success:      '#3C805B',
  successLight: '#C7E3D5',
  successDark:  '#245A3D',
  info:         '#5F8CB8',
  infoLight:    '#DEE9F2',
  infoDark:     '#456A8E',

  // ── Accent (lavender / care) ────────────────────────────────────────────
  accent:       '#6C519F',
  accentLight:  '#D4C3EA',
  accentDark:   '#4A3670',

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
  // Darkened from #8A7D6C — that value read as 3.79-4.01:1 against
  // card/background, under WCAG AA's 4.5:1 minimum for normal text
  // (flagged in UI review: subtitles/dates/timestamps using this token
  // read as near-illegible faint gray). #756A5B clears 4.5:1 on both.
  textTertiary:  '#756A5B',
  textInverse:   '#FFFFFF',
  textDisabled:  '#D5CCBE',

  // ── Tab bar ───────────────────────────────────────────────────────────
  // Matches background exactly — nav reads as part of the same canvas,
  // not a separate white bar sitting on top of it.
  tabBar:       '#FDFBF7',
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

  // "Deep navy-charcoal" — a faint cool undertone instead of a neutral
  // near-black, the classic premium-dark-mode move (Linear/Things 3):
  // reads as pure black at a glance but feels deliberate, and makes the
  // warm accent colors pop harder by contrast than a neutral base does.
  background:   '#12141C',
  surface:      '#181B24',   // faint solid lift for section rows — was flush with background
  card:         '#1B1E28',
  overlay:      'rgba(0,0,0,0.65)',

  border:       'rgba(219,146,112,0.18)',
  borderMed:    'rgba(219,146,112,0.32)',
  borderStrong: 'rgba(219,146,112,0.50)',

  // Dimmed a step off pure white — max-contrast white-on-near-black is
  // the classic eye-strain combo; a slightly dimmer, warm-tinted white
  // is easier to read for long sessions while staying plenty legible.
  textPrimary:   '#EDE8E0',
  textSecondary: '#B8AC9C',
  // Lightened from #7A6E60 — same WCAG AA contrast fix as the light-mode
  // textTertiary above (that value was 3.35-3.7:1 against card/background,
  // under the 4.5:1 minimum). #988978 clears 4.5:1 on both.
  textTertiary:  '#988978',
  textInverse:   '#1A1714',
  textDisabled:  '#4A4038',

  // Matches background exactly — nav reads as part of the same canvas,
  // not a separate bar sitting on top of it (explicit direction: nav
  // should match canvas in both themes, overriding the earlier "distinctly
  // darker" treatment).
  tabBar:       '#12141C',
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
