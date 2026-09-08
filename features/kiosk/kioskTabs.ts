/**
 * kioskTabs — the kiosk nav rail's information architecture, extracted from
 * KioskScreen so tabs can reference tab keys (for cross-navigation from a
 * widget) without importing the screen that renders them.
 *
 * ── Mapping the mockup's IA onto this app's real feature set ────────────
 * The reference mockup has seven rail entries: Hub Overview, Meals &
 * Timers, Family Schedule, Chores & Allowance, FindFam Radar, Family Chat,
 * Memories Frame. This app's kiosk already had ten, derived from the real
 * phone tab bar. Rather than force either list onto the other, the mockup's
 * SHAPE is adopted (a persistent labelled rail, overview first, one entry
 * per real domain) over this app's actual domains:
 *
 *   mockup entry          → kiosk tab      why
 *   ─────────────────────────────────────────────────────────────────────
 *   Hub Overview          → overview       the new mockup-shaped dashboard
 *   Meals & Timers        → meals          NEW tab. Timers dropped per the
 *                                          owner; meals+grocery is the real
 *                                          content and it had no kiosk home
 *   Family Schedule       → schedule       existing
 *   Chores & Allowance    → tasks          existing (chores). Allowance is
 *                                          surfaced on overview + store
 *   FindFam Radar         → findfam        existing
 *   Family Chat           → chat           existing
 *   Memories Frame        → memories       existing (was senior-only; now
 *                                          available to everyone, since a
 *                                          photo frame is the single most
 *                                          kiosk-native thing in the mock)
 *   (no equivalent)       → store          kept: real feature, and the
 *                                          allowance loop's other half
 *   (no equivalent)       → school/health  kept: real features added at the
 *                                          owner's explicit request
 *   (no equivalent)       → profile        kept: settings have to live
 *                                          somewhere on a kiosk
 *
 * Role availability is unchanged from the prior pass and deliberately so —
 * it mirrors the phone's own per-role tab split (app/(tabs)/_layout.tsx's
 * TABS_DEFAULT vs TABS_SENIOR, and Hub's AppsQuickAccessPills role lists).
 * Regressing that split would re-open the role leak the previous commit on
 * this branch fixed.
 */
import {
  LayoutGrid, CheckSquare, Calendar as CalendarIcon, MessageCircle, MapPin,
  Gift, Images, BookOpen, Heart, UserCircle2, UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react-native';

export type KioskTabKey =
  | 'overview' | 'meals' | 'tasks' | 'schedule' | 'chat'
  | 'findfam' | 'store' | 'memories' | 'school' | 'health' | 'profile';

export interface KioskRailItem {
  key: KioskTabKey;
  /** Full label, shown in the rail. The mockup's rail is labelled, not
   *  icon-only guesswork — a grandparent should not have to know an icon
   *  set to use the kitchen tablet. */
  label: string;
  Icon: LucideIcon;
}

const OVERVIEW: KioskRailItem = { key: 'overview', label: 'Overview', Icon: LayoutGrid };
const MEALS:    KioskRailItem = { key: 'meals',    label: 'Meals',    Icon: UtensilsCrossed };
const TASKS:    KioskRailItem = { key: 'tasks',    label: 'Chores',   Icon: CheckSquare };
const SCHEDULE: KioskRailItem = { key: 'schedule', label: 'Schedule', Icon: CalendarIcon };
const CHAT:     KioskRailItem = { key: 'chat',     label: 'Chat',     Icon: MessageCircle };
const FINDFAM:  KioskRailItem = { key: 'findfam',  label: 'Find',     Icon: MapPin };
const STORE:    KioskRailItem = { key: 'store',    label: 'Store',    Icon: Gift };
const MEMORIES: KioskRailItem = { key: 'memories', label: 'Memories', Icon: Images };
const SCHOOL:   KioskRailItem = { key: 'school',   label: 'School',   Icon: BookOpen };
const HEALTH:   KioskRailItem = { key: 'health',   label: 'Health',   Icon: Heart };
const PROFILE:  KioskRailItem = { key: 'profile',  label: 'Profile',  Icon: UserCircle2 };

/**
 * Parent / kid: the full rail. Ordered to the mockup's rhythm — the
 * dashboard, then the kitchen, then the household's shared domains.
 */
export const RAIL_DEFAULT: KioskRailItem[] = [
  OVERVIEW, MEALS, SCHEDULE, TASKS, FINDFAM, CHAT, STORE, MEMORIES, SCHOOL, HEALTH, PROFILE,
];

/**
 * Teen: same, minus School — School stays parent/kid-only on the phone
 * (AppsQuickAccessPills.tsx's PILLS roles array). Health and Memories are
 * both teen-accessible on the phone (health covers a teen's own medications;
 * memories was widened to include teen at the owner's explicit request), so
 * kiosk keeps both for teen too — inventing a narrower kiosk-only exclusion
 * would be a real (if small) product regression nobody asked for.
 */
export const RAIL_TEEN: KioskRailItem[] = RAIL_DEFAULT.filter(
  r => r.key !== 'school',
);

/**
 * Senior / grandparent: the calm subset, matching the phone's TABS_SENIOR
 * (no Store, no FindFam). Meals was here (a grandparent cooking dinner
 * seemed like a plausible real use of a kitchen display) but was removed
 * per explicit later correction: "we dont need meals for seniours" — now
 * matching real mobile, which never gave senior a Meals entry point at
 * all (no 'meals' pill in AppsQuickAccessPills' PILLS, no Meals link in
 * SeniorView.tsx).
 */
export const RAIL_SENIOR: KioskRailItem[] = [
  OVERVIEW, TASKS, CHAT, MEMORIES, PROFILE,
];

export function railForRole(role: string | undefined): KioskRailItem[] {
  if (role === 'senior') return RAIL_SENIOR;
  if (role === 'teen') return RAIL_TEEN;
  return RAIL_DEFAULT;
}
