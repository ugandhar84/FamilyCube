/**
 * kioskTheme — the "Ambient Counter" design layer for kiosk mode
 * (features/kiosk/**). Same pattern features/games/theme/gameTheme.ts
 * established for the Games arcade's "Neon Cabinet" layer: a sub-brand's
 * own token set living next to the app's shared ones, so a distinct
 * surface doesn't have to hardcode magic numbers inline to differentiate
 * itself.
 *
 * This file carries NO colors — it is the SIZE half of the kiosk design
 * layer (type scale, touch targets, spacing, radii, elevation recipe).
 * Kiosk's colors live in the sibling features/kiosk/kioskPalette.ts, which
 * exposes a light and a dark variant resolved off the same useTheme()
 * isDark the rest of the app uses (see that file's header for why kiosk is
 * NOT dark-only, unlike the Games arcade). The split is deliberate: what
 * changes at kiosk scale is size, weight and spacing, and that is
 * orthogonal to which appearance the household has chosen.
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
 *
 * ── Calibration note (live-reported: "components are too big... too much
 * zoomed in") ──────────────────────────────────────────────────────────
 * The first cut of this scale was applied uniformly, which produced a
 * blown-up phone screen rather than a dashboard: chrome grew 1:1 with
 * content, so containers got large without carrying more information.
 *
 * The ladder is deliberately NON-UNIFORM as a result. The top of it
 * (clock/hero) stays genuinely large, because those are the few elements
 * that must resolve from across a room. The middle and bottom are only
 * modestly above phone sizes, because their job is to be readable at
 * arm's length while staying dense enough that a screen holds real
 * content. The ratio between hero and body is what creates glanceable
 * hierarchy — not the absolute size of body text.
 *
 * Rule of thumb when using this: ask "must this resolve from six feet, or
 * only from arm's length?" Almost everything is the latter. Reach for
 * `hero`/`title` sparingly — one or two per screen.
 */
export const KIOSK_TYPO = {
  /** Lock/ambient-screen clock — the one genuinely room-scale element. */
  clock:      80,
  /** THE headline number on a screen. One per zone, at most. */
  hero:       34,
  /** Screen titles ("Chores", "Reward Store"). */
  title:      26,
  /** Zone titles, card titles, column heads. */
  heading:    20,
  /** Sub-section headers, list-row titles. */
  subheading: 17,
  /** Primary body text, buttons, inputs. */
  body:       15,
  /** Secondary info, timestamps, descriptions. */
  caption:    13.5,
  /** Chips, badges, assignee pills. */
  label:      12.5,
  /** Absolute floor — fine print only. Never go below this on a kiosk. */
  micro:      12,
  /** Uppercase tracked section header ("TODAY'S TIMELINE"). */
  sectionLabel: 12.5,
} as const;

/**
 * Touch targets — the size a finger needs, which is NOT the same thing as
 * the size an element should LOOK.
 *
 * This distinction is the main lesson of the "everything is too big /
 * too zoomed in" calibration pass. Reachability is a hit-area property;
 * visual weight is a type-and-padding property. Conflating them is what
 * made kiosk read as a zoomed phone: a button was given a 72px height so
 * it would be easy to tap, which also made it visually dominate a screen
 * it had no business dominating.
 *
 * So: use these for `minHeight`/`hitSlop` on things that are genuinely
 * tapped, and let type and padding decide how large the thing READS. A
 * 52px pill with 15px text is comfortably tappable and visually quiet; a
 * 72px pill with 18px text is neither necessary nor calm.
 *
 * Apple's HIG floor is 44pt for a hand-held device. A kiosk is tapped
 * standing, at an angle, often by a child or someone with reduced
 * dexterity — so 48 is the floor here, with a little more for primary
 * actions. A modest, deliberate increase over the phone; not a
 * wholesale scale-up.
 */
export const KIOSK_HIT = {
  /** Absolute minimum tappable extent for ANY control in kiosk mode. */
  min:     48,
  /** Standard control — icon buttons, segment buttons, list rows. */
  control: 52,
  /** Primary action — "Claim Chore", "Approve", "New Chore". */
  primary: 56,
  /** Nav rail entries — tapped constantly, so a little more generous. */
  rail:    64,
  /** Profile tiles on the LOCK screen only, where they are the sole
   *  content and are aimed at from across a room. Not inline avatars. */
  avatar:  84,
} as const;

/**
 * Spacing. Ambient layouts want air BETWEEN groups and tightness WITHIN
 * them — that contrast is what makes a screen parse as a few zones at a
 * glance. Uniformly inflating every gap (the first cut of this file) does
 * the opposite: containers become big and sparse without the structure
 * becoming any clearer, and whitespace reads as leftover rather than
 * deliberate. So the small end stays close to phone values (intra-
 * component padding) while only the large end is genuinely generous
 * (separating zones).
 */
export const KIOSK_SPACE = {
  /** Intra-component: gap between an icon and its label. */
  xs:  6,
  /** Intra-component: card padding, gaps between sibling chips. */
  sm:  10,
  /** Between related items — cards in a grid, rows in a list. */
  md:  14,
  /** Container padding on larger surfaces; screen edge padding. */
  lg:  20,
  /** Between distinct zones. */
  xl:  28,
  /** Major section breaks. Use sparingly. */
  xxl: 40,
} as const;

/**
 * Width of KioskScreen's persistent left nav rail. Exported because tabs
 * that lay out a fixed-width board (KioskTasksTab's kanban columns) have
 * to subtract it to know their real available width — that value was
 * previously a hardcoded copy in the tab, which silently went stale the
 * moment the rail was resized and pushed the board off the screen edge.
 */
export const KIOSK_RAIL_WIDTH = 96;

/**
 * Corner radii. Generous-but-not-cartoonish rounding is a big part of the
 * "soft countertop object" feel — but it has to stay CONSISTENT to read as
 * craft rather than noise, so every kiosk surface picks from this ladder
 * rather than inventing its own value.
 */
export const KIOSK_RADIUS = {
  sm:  10,
  md:  14,
  lg:  20,
  xl:  26,
  full: 999,
} as const;

/**
 * One shared soft-elevation recipe, so every raised surface in kiosk
 * casts the SAME shadow rather than each screen inventing its own — that
 * consistency is most of what separates "crafted" from "styled".
 *
 * Warm rather than neutral (tinted by the caller's accent, defaulting to
 * the brand terracotta) because a countertop display sits in room light,
 * and diffuse rather than tight because the object is being looked at
 * from a distance, not held. Dark mode returns no shadow at all: a cast
 * shadow on a near-black ground reads as mud, so elevation there is
 * carried by the border and fill instead.
 */
export function kioskElevation(tint: string, isDark: boolean, level: 1 | 2 = 1) {
  if (isDark) return { shadowOpacity: 0, elevation: 0 } as const;
  return level === 1
    ? {
        shadowColor: tint, shadowOpacity: 0.07, shadowRadius: 12,
        shadowOffset: { width: 0, height: 3 }, elevation: 2,
      } as const
    : {
        shadowColor: tint, shadowOpacity: 0.12, shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 }, elevation: 4,
      } as const;
}

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
