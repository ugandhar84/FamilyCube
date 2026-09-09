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
 * Per-role rail order — each role gets its OWN sequence reflecting what
 * that role actually uses most, rather than one shared order reused
 * everywhere [live-requested: "rearrange the tab menu based on the real
 * family intrest and importance.. for parent and kids, teens, gp"]. Which
 * tabs a role sees at all is UNCHANGED from before this pass (still
 * mirrors the phone's own per-role tab split — see this file's own
 * earlier header note); only the ORDER within each role's own set moved.
 */

/**
 * Parent: oversight-first. Dashboard, then the logistics that need a
 * parent's eyes daily (schedule, chore approvals, meal planning, knowing
 * where everyone is), then communication, then the rest.
 */
export const RAIL_PARENT: KioskRailItem[] = [
  OVERVIEW, SCHEDULE, TASKS, MEALS, FINDFAM, CHAT, STORE, HEALTH, SCHOOL, MEMORIES, PROFILE,
];

/** Back-compat alias — some call sites may still reference the old name. */
export const RAIL_DEFAULT: KioskRailItem[] = RAIL_PARENT;

/**
 * Kid: motivation-first. Their own dashboard, then earning coins (chores)
 * and spending them (store) — the two things a kid actually opens this
 * device for most — then what's happening today, then talking to family,
 * then the rest. School stays kid-accessible (phone parity), placed near
 * the end alongside the other reference/utility tabs.
 */
export const RAIL_KID: KioskRailItem[] = [
  OVERVIEW, TASKS, STORE, SCHEDULE, CHAT, MEALS, MEMORIES, FINDFAM, HEALTH, SCHOOL, PROFILE,
];

/**
 * Teen: same motivation-first logic as Kid, but Find ranks a bit higher —
 * more relevant once a teen is out and about somewhat independently
 * (rides, curfew-adjacent check-ins) than it is for a younger kid mostly
 * home. School was widened to include teen on the phone
 * (AppsQuickAccessPills.tsx's PILLS roles array) at the owner's explicit
 * request ["it should be for both kids and teens - school schedule"], so
 * kiosk keeps it here too, placed near the end alongside Health/Memories
 * to match Kid's own placement. Health and Memories are both
 * teen-accessible on the phone (health covers a teen's own medications;
 * memories was widened to include teen at the owner's explicit request),
 * so kiosk keeps both for teen too.
 */
export const RAIL_TEEN: KioskRailItem[] = [
  OVERVIEW, TASKS, STORE, SCHEDULE, CHAT, MEALS, FINDFAM, MEMORIES, HEALTH, SCHOOL, PROFILE,
];

/**
 * Senior / grandparent: connection-first, matching a grandparent's real
 * priority — staying in touch and seeing photos — ahead of household
 * chore oversight. Same subset as before (no Store, no FindFam, no
 * Meals — see this file's own note on why Meals was removed for senior),
 * only the order changed.
 */
export const RAIL_SENIOR: KioskRailItem[] = [
  OVERVIEW, CHAT, MEMORIES, TASKS, PROFILE,
];

export function railForRole(role: string | undefined): KioskRailItem[] {
  if (role === 'senior') return RAIL_SENIOR;
  if (role === 'teen') return RAIL_TEEN;
  if (role === 'kid') return RAIL_KID;
  return RAIL_PARENT;
}
