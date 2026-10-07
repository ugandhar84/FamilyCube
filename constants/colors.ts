// ── Family Cube — Design Tokens ───────────────────────────────────────────────
//
// Full reskin from the Figma Make "Scrollable Content Design" prototype
// (design/Scrollable Content Design/src/index.css — exact hex values pulled
// directly from that file, not approximated). Replaces the earlier "Kinfolk"
// warm terracotta/sage/lavender palette per explicit direction ("scrap the
// existing full design and make the new skin with Figma"). Token NAMES are
// unchanged (primary/parent/kid/accent/etc.) so component code doesn't need
// to change — only hex values moved, same pattern as every previous palette
// swap in this file's history.
//
// Scope note: this pass covers ParentView/Hub first (per explicit direction,
// "parentview first") — other screens still read these same tokens via
// useTheme(), so they inherit the new palette automatically wherever they
// use colors.*, but haven't been individually re-verified against the
// prototype's other pages yet.
//
// Font: the prototype uses Inter; this app has no Inter font files bundled
// and no expo-font/useFonts setup (checked — neither exists anywhere in the
// repo). FONTS in constants/theme.ts is UNCHANGED (still system font) —
// switching fonts is a separate, bigger piece of work (download Inter's
// files, wire expo-font, handle load-state) not done in this pass.
//
// Role mapping (unchanged names, new hues):
//   primary  — periwinkle-indigo (buttons, primary actions, links)
//   teal     — sage-mint (Family Pulse ring, parent role accent)
//   amber    — warm peach/clay (kid role accent)
//   pink     — periwinkle-lavender (third accent)

export const lightColors = {
  // ── Brand primary — periwinkle-indigo (buttons/links/primary actions) ──
  // #6677bd: .button.primary / .floating-add background, src/index.css:294.
  // #5c6eb5: .round-action color, .back, .section-title > a, .timeline a,
  // .evening a — the slightly lighter "link" shade this prototype actually
  // uses for text links vs. solid buttons; kept as primaryMid since every
  // existing call site already expects one extra primary-family shade.
  primary:      '#6677BD',
  primaryLight: '#E9EDFB',        // .main-nav > a.active .main-nav-icon background, index.css:530
  primaryDark:  '#4A5A9E',        // darkened for pressed/dark-mode-adjacent states, no direct source
  primaryMid:   '#5C6EB5',
  primaryText:  '#5C6EB5',

  // ── Teal slot — sage/mint (Family Pulse card + mint timeline mark) ─────
  teal:         '#648B7D',        // .pulse-ring border-top-color, index.css:197
  tealLight:    '#E5F3ED',        // .mint quick-action tone, index.css:409
  tealDark:     '#4A6B5F',

  // ── Amber slot — warm clay/peach (peach timeline mark + attention card) ─
  amber:        '#D58B7B',        // .timeline-mark.peach, index.css:365
  amberLight:   '#F9EBE7',        // .peach quick-action tone / .attention-card background, index.css:249,417
  amberDark:    '#A8604F',

  // ── Pink slot — periwinkle-lavender (lavender quick-action + periwinkle mark) ─
  pink:         '#7788CC',        // .timeline-mark.periwinkle, index.css:357
  pinkLight:    '#EEEBF9',        // .lavender quick-action tone, index.css:405
  pinkDark:     '#5563A0',

  // ── Navy slot — body text color ─────────────────────────────────────────
  navy:         '#2C3244',        // :root color, index.css:11
  navyLight:    '#F8F7FB',

  // ── Role accents (mapped to brand) ─────────────────────────────────────
  parent:       '#648B7D',
  parentLight:  '#E5F3ED',
  parentDark:   '#4A6B5F',

  kid:          '#D58B7B',
  kidLight:     '#F9EBE7',
  kidDark:      '#A8604F',

  // ── Semantics ───────────────────────────────────────────────────────────
  // No dedicated error/danger color exists in the prototype (its one
  // "needs attention" surface is the peach .attention-card, reused above as
  // amber) — danger kept distinct from amber so a real destructive action
  // still reads differently from "kid role" tint; nearest-hue warm red this
  // palette's family would plausibly extend to.
  danger:       '#C65D4A',
  dangerLight:  '#F9EBE7',
  dangerDark:   '#8E3F30',
  warning:      '#D58B7B',
  warningLight: '#F9EBE7',
  warningDark:  '#A8604F',
  success:      '#648B7D',
  successLight: '#E5F3ED',
  successDark:  '#4A6B5F',
  info:         '#6677BD',
  infoLight:    '#E9EDFB',
  infoDark:     '#4A5A9E',

  // ── Accent (lavender / third hue) ───────────────────────────────────────
  accent:       '#7788CC',
  accentLight:  '#EEEBF9',
  accentDark:   '#5563A0',

  // ── Surfaces ────────────────────────────────────────────────────────────
  background:   '#F8F7FB',        // :root/body/.app background, index.css:12,23,65
  surface:      '#F8F7FB',        // prototype has no distinct "surface" tone from background — same value
  card:         '#FFFFFF',        // .timeline/.evening/.household background, white throughout
  overlay:      'rgba(44,50,68,0.45)',

  // ── Borders ─────────────────────────────────────────────────────────────
  border:       'rgba(93,110,181,0.18)',
  borderMed:    'rgba(93,110,181,0.32)',
  borderStrong: 'rgba(93,110,181,0.55)',

  // ── Text ────────────────────────────────────────────────────────────────
  textPrimary:   '#2C3244',       // :root color, index.css:11
  textSecondary: '#777D8F',       // .household small / .date-line / .timeline time, index.css:115,153
  textTertiary:  '#737A90',       // .overline, index.css:159 — checked: 4.5:1+ against card/background
  textInverse:   '#FFFFFF',
  textDisabled:  '#C7CBDA',

  // ── Tab bar ─────────────────────────────────────────────────────────────
  // .main-nav background: rgba(255,255,255,0.94) + blur — flattened to a
  // near-white solid since RN's backdrop-filter support is inconsistent
  // across platforms; visually equivalent over this app's light background.
  tabBar:       '#FEFEFF',
  tabBarBorder: 'rgba(220,221,229,0.9)',
  tabActive:    '#5265B1',        // .main-nav > a.active color, index.css:526
  tabInactive:  '#7A8090',        // .main-nav > a color, index.css:503

  // ── Status bar ──────────────────────────────────────────────────────────
  statusBar:    'dark' as 'light' | 'dark',

  // ── Inputs ──────────────────────────────────────────────────────────────
  inputBg:      '#F1F2F8',
  inputBorder:  'rgba(93,110,181,0.28)',
  placeholder:  '#9095A8',

  // ── Skeleton ────────────────────────────────────────────────────────────
  skeleton:          '#ECEDF4',
  skeletonHighlight: '#F8F7FB',

  // ── Legacy compat (aliases old "purple" name to the new primary hue) ────
  purple:      '#6677BD',
  purpleLight: '#E9EDFB',
  purpleDark:  '#4A5A9E',
};

export const darkColors: typeof lightColors = {
  // The prototype defines no dark mode at all (confirmed — no @media
  // prefers-color-scheme block, no dark variant anywhere in index.css).
  // These are this app's own dark-mode derivation of the same hues above —
  // same lightening/alpha approach the previous Kinfolk dark palette used
  // (saturated light-mode hue → lightened for dark-mode legibility, *Light
  // tokens → low-alpha rgba of the same hue) — not sourced from Figma,
  // since there is nothing there to source from.
  primary:      '#8E9BD4',
  primaryLight: 'rgba(142,155,212,0.20)',
  primaryDark:  '#AAB4E0',
  primaryMid:   '#9AA6D8',
  primaryText:  '#AAB4E0',

  teal:         '#8FB0A3',
  tealLight:    'rgba(143,176,163,0.20)',
  tealDark:     '#ACC6BC',

  amber:        '#E0A696',
  amberLight:   'rgba(224,166,150,0.20)',
  amberDark:    '#EBBFB3',

  pink:         '#9CA9DC',
  pinkLight:    'rgba(156,169,220,0.20)',
  pinkDark:     '#B8C2E6',

  navy:         '#E8E9EF',
  navyLight:    'rgba(232,233,239,0.12)',

  parent:       '#8FB0A3',
  parentLight:  'rgba(143,176,163,0.20)',
  parentDark:   '#ACC6BC',

  kid:          '#E0A696',
  kidLight:     'rgba(224,166,150,0.20)',
  kidDark:      '#EBBFB3',

  danger:       '#D68C7C',
  dangerLight:  'rgba(214,140,124,0.20)',
  dangerDark:   '#E3AA9E',
  warning:      '#E0A696',
  warningLight: 'rgba(224,166,150,0.20)',
  warningDark:  '#EBBFB3',
  success:      '#8FB0A3',
  successLight: 'rgba(143,176,163,0.20)',
  successDark:  '#ACC6BC',
  info:         '#8E9BD4',
  infoLight:    'rgba(142,155,212,0.20)',
  infoDark:     '#AAB4E0',

  accent:       '#9CA9DC',
  accentLight:  'rgba(156,169,220,0.20)',
  accentDark:   '#B8C2E6',

  // Deep indigo-charcoal — cool undertone matching the new primary hue's
  // family, same "premium dark mode" approach the previous palette used.
  background:   '#13141C',
  surface:      '#191A24',
  card:         '#1C1E2A',
  overlay:      'rgba(0,0,0,0.65)',

  border:       'rgba(142,155,212,0.18)',
  borderMed:    'rgba(142,155,212,0.32)',
  borderStrong: 'rgba(142,155,212,0.50)',

  textPrimary:   '#E9E9F0',
  textSecondary: '#B4B7C6',
  textTertiary:  '#9598AC',
  textInverse:   '#15161E',
  textDisabled:  '#464859',

  tabBar:       '#13141C',
  tabBarBorder: 'rgba(142,155,212,0.14)',
  tabActive:    '#8E9BD4',
  tabInactive:  '#7A7E90',

  statusBar:    'light' as const,

  inputBg:      '#1D1E29',
  inputBorder:  'rgba(142,155,212,0.28)',
  placeholder:  '#7A7E90',

  skeleton:          '#1D1E29',
  skeletonHighlight: '#282A38',

  purple:      '#8E9BD4',
  purpleLight: 'rgba(142,155,212,0.20)',
  purpleDark:  '#AAB4E0',
};

export type ThemeColors = typeof lightColors;
