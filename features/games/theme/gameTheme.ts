/**
 * gameTheme — "Neon Cabinet" design tokens for the Family Games arcade
 * area (features/games/**, app/hub/games/**). Deliberately a SEPARATE
 * token set from constants/theme.ts's app-wide Kinfolk palette — stepping
 * into Games is meant to feel like a different world (deep violet-black
 * base + neon accents), not a re-skin of the calm warm-neutral app shell
 * around it. Never import this outside features/games — the rest of the
 * app keeps using useTheme()/constants/theme.ts exactly as before.
 *
 * Deliberately identical in light and dark mode — see the header note in
 * the design plan this was built from: the dark cabinet staying dark in
 * both modes IS the "stepping into a different world" effect. Only the
 * screen chrome OUTSIDE a game screen (the Hub's own tab bar, etc.) is
 * still governed by the app's normal light/dark theme.
 */

export const ARCADE = {
  // ── Base ──────────────────────────────────────────────────────────────
  bgTop: '#1B1436',
  bgBottom: '#0C0819',
  surface: '#241B47',
  surfaceRaised: '#2E2359',
  line: 'rgba(255,255,255,0.10)',
  lineGlow: 'rgba(255,255,255,0.18)',
  textPrimary: '#F5F1FF',
  textSecondary: '#A99CD6',
  textMuted: '#6E619B',

  // ── Primary accent (shared across all 4 games) — "insert coin" amber,
  // the brightened arcade sibling of the app's own Kinfolk amber
  // (#D97706), so Games still shares one real hue with the rest of the app. ──
  primary: '#FFB020',
  primaryGlow: 'rgba(255,176,32,0.35)',
  primaryPress: '#E09410',

  // ── Per-game secondary accents — the primary identity carrier between
  // games; everything else (background, button, header, type) is shared. ──
  ticTacToeX: '#00E5C0',
  ticTacToeO: '#FF4D8D',
  memory: '#A56BFF',
  snake: '#4CFF6A',
  uno: '#FF5A3C',
} as const;

// Baloo 2 (Google Font, @expo-google-fonts/baloo-2) — chunky, rounded,
// slightly bouncy; reads as "toy cabinet" rather than 8-bit-pixel (a pixel
// face was deliberately ruled out: illegible below 16pt, breaks on long
// strings, and would lock every game into a retro-8-bit gimmick Memory/
// Uno don't suit). System font stays for body/labels/numerals — one
// bundled custom face keeps this focused instead of introducing a second.
export const ARCADE_FONT_DISPLAY_BOLD = 'Baloo2_700Bold';
export const ARCADE_FONT_DISPLAY_EXTRABOLD = 'Baloo2_800ExtraBold';

export const ARCADE_TYPO = {
  hero: 34,     // game title
  display: 26,  // "YOUR TURN" / "YOU WIN!" status line
  heading: 20,  // section/card titles
  score: 22,    // score numerals — pair with tabular-nums
  body: 15,     // system font, weight 600
  label: 12,    // system font, weight 700, uppercase, letterSpacing 1.2
} as const;

// Shared Reanimated spring/timing constants — felt even when not
// consciously noticed; every game's press/release/enter motion should
// pull from these two rather than inventing new damping/stiffness pairs
// per component.
export const ARCADE_SPRING = { damping: 12, stiffness: 200 } as const;
export const ARCADE_SPRING_BOUNCY = { damping: 9, stiffness: 180 } as const;

// Minimum AI "thinking" delay — an instant AI move reads as broken, not
// smart, regardless of how fast the algorithm actually runs.
export const ARCADE_AI_THINK_MS = 600;
