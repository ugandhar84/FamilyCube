/**
 * kioskTheme — the "Ambient Counter" design layer for kiosk mode
 * (features/kiosk/**). Same pattern features/games/theme/gameTheme.ts
 * established for the Games arcade's "Neon Cabinet" layer: a sub-brand's
 * own token set living next to the app's shared ones, so a distinct
 * surface doesn't have to hardcode magic numbers inline to differentiate
 * itself.
 *
 * The critical DIFFERENCE from gameTheme: Games deliberately abandons the
 * app palette (it's meant to feel like a different world, dark in both
 * light and dark mode). Kiosk must NOT — a kitchen dashboard is the same
 * calm Kinfolk household surface, just seen from six feet away instead of
 * six inches. So this file carries NO colors at all; every kiosk color
 * still comes from useTheme()'s colors.* exactly as CLAUDE.md requires.
 * What changes at kiosk scale is *size, weight and spacing*, which is
 * precisely what lives here.
 *
 * Why a separate scale rather than reusing constants/theme.ts's TYPO:
 * TYPO is calibrated for a phone held ~30cm from the eye. A wall-mounted
 * or counter-standing tablet is read from ~100-200cm. Apparent size falls
 * off linearly with distance, so type that reads comfortably on a phone is
 * roughly 3-4x too small to glance at across a kitchen. KIOSK_TYPO below
 * is TYPO's same semantic ladder (hero/title/heading/…/micro — identical
 * key names on purpose, so a phone component ported to kiosk swaps one
 * import rather than being re-sized by hand) scaled up and re-floored: the
 * smallest step is 14px, because nothing on a kiosk should ever be at
 * phone-caption size.
 */

/**
 * Glanceable type ladder. Same keys as constants/theme.ts's TYPO so the
 * two are drop-in swappable; every value is larger, and the floor is 14
 * (TYPO's floor is 11 — genuinely illegible at kiosk viewing distance).
 */
export const KIOSK_TYPO = {
  /** Lock-screen clock, the single largest thing on any kiosk screen. */
  clock:      88,
  /** Big dashboard stat numerals ("7 chores open"). */
  hero:       44,
  /** Screen titles ("Chores", "Reward Store"). */
  title:      32,
  /** Card titles, column heads, section titles. */
  heading:    24,
  /** Sub-section headers, large body, list-row titles. */
  subheading: 20,
  /** Primary body text, buttons, inputs. */
  body:       18,
  /** Secondary info, timestamps, descriptions. */
  caption:    16,
  /** Chips, badges, assignee pills. */
  label:      15,
  /** Absolute floor — fine print only. Never go below this on a kiosk. */
  micro:      14,
  /** Uppercase tracked section header ("TODAY'S TIMELINE"). */
  sectionLabel: 15,
} as const;

/**
 * Touch targets. Apple's HIG minimum is 44pt for a phone held in the hand;
 * a kiosk is tapped standing, often at an angle, frequently by a child or
 * someone with reduced dexterity, and always without the fine aim a
 * hand-held device allows. 56 is the floor here, and primary actions get
 * more.
 */
export const KIOSK_HIT = {
  /** Absolute minimum for ANY tappable element in kiosk mode. */
  min:     56,
  /** Standard control — icon buttons, nav rail entries, segment buttons. */
  control: 64,
  /** Primary action — "Claim Chore", "Approve", the send button. */
  primary: 72,
  /** Avatar / profile tiles on the lock screen and header switcher. */
  avatar:  96,
} as const;

/**
 * Spacing. Kiosk content sits further from the eye, so the gaps that
 * separate groups have to grow with the type or the layout reads as one
 * undifferentiated wall of content.
 */
export const KIOSK_SPACE = {
  xs:  8,
  sm:  12,
  md:  18,
  lg:  26,
  xl:  36,
  xxl: 48,
} as const;

/** Corner radii, scaled to match the larger cards kiosk uses. */
export const KIOSK_RADIUS = {
  sm:  12,
  md:  18,
  lg:  24,
  xl:  32,
  full: 999,
} as const;

/**
 * Idle/ambient timing. Kiosk has THREE states, not two:
 *
 *   active  →  (AMBIENT_AFTER_MS of no touch)  →  ambient  →  (idle
 *   timeout)  →  locked
 *
 * "Ambient" is the screensaver-ish calm state: the dashboard dims back and
 * a large clock/next-up summary fades in over it, so a wall-mounted tablet
 * nobody is touching reads as a deliberate ambient display rather than an
 * app someone walked away from mid-task. It is NOT a privacy boundary —
 * any touch dismisses it instantly with no auth — the lock screen is the
 * privacy boundary, and it still fires on its own separate, longer timer.
 *
 * 90s is deliberately short: the whole point is that the kiosk spends most
 * of its life in this state, since most of its life is spent untouched.
 */
export const KIOSK_AMBIENT_AFTER_MS = 90_000;

/** How long the ambient overlay takes to fade in/out, ms. */
export const KIOSK_AMBIENT_FADE_MS = 900;
