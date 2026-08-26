import { requireNativeModule } from 'expo-modules-core';

// Role-based iOS home-screen widget payload — replaces the old PawBond
// pet-shaped WidgetPet[]/WidgetPayload (name/emoji/careProgress/nextAppt),
// none of which exists in Family Cube's real data model. Two distinct
// content shapes, matching the two ways a person actually wants a glance
// at this app: a parent wants the household's state, a kid/teen/senior
// wants their own.
export interface WidgetEvent {
  title: string;
  time: string;  // pre-formatted, e.g. "Today · 4:30 PM"
}

export interface WidgetParentSummary {
  familyName: string;
  memberCount: number;
  pendingApprovals: number;  // chores sitting at pending_approval, awaiting this parent's review
  eventsToday: number;
  unreadMessages: number;
  groceryPending: number;  // items on the family grocery list not yet bought
  nextEventTitle?: string | null;   // family's next upcoming event (any member), not just this parent's own — mirrors upcomingEvents[0]
  nextEventTime?: string | null;    // pre-formatted, e.g. "Today · 4:30 PM"
  upcomingEvents?: WidgetEvent[];   // up to 3, for the medium widget's Calendar-style list
}

export interface WidgetMemberSummary {
  memberName: string;
  memberEmoji: string;
  // Kid/teen only — a grandparent never earns coins or builds a streak
  // (always 0 in the DB, no UI anywhere treats it as their own stat), so
  // these are omitted entirely for role 'senior' rather than shipped as
  // misleading zeros.
  pendingQuests?: number;
  coins?: number;
  streak?: number;
  // Senior only — count of today's active, not-yet-taken medications
  // (family_medications table, same source features/vault/tabs/HealthTab.tsx
  // reads/writes — SeniorView.tsx's own Hub card used to be a disconnected
  // local-only duplicate of this).
  medsPending?: number;
  nextEventTitle?: string | null;  // mirrors upcomingEvents[0]
  nextEventTime?: string | null;   // pre-formatted, e.g. "Today · 4:30 PM"
  upcomingEvents?: WidgetEvent[];  // up to 3, for the medium widget's Calendar-style list
}

// Flat discriminator (kind) + two optional, mutually-exclusive summary
// fields — deliberately NOT a nested discriminated union. Swift's
// JSONDecoder handles "decode whichever of these two optional fields is
// present" trivially; decoding a nested `{ kind, data }` polymorphic
// shape requires hand-written Decodable conformance for little benefit
// here, since there are only ever two shapes.
export interface WidgetPayload {
  enabled: boolean;
  kind?: 'parent' | 'member';
  parentSummary?: WidgetParentSummary;
  memberSummary?: WidgetMemberSummary;
  lastSyncedAt?: string; // ISO timestamp — lets widget show "Updated Xm ago"
}

let _mod: any = null;
let _loggedModuleWarning = false;
function mod() {
  if (!_mod) {
    try { _mod = requireNativeModule('WidgetData'); } catch (e) {
      _mod = null;
      if (!_loggedModuleWarning) {
        _loggedModuleWarning = true;
        console.error('[widget-data] ⚠️ Native module "WidgetData" not available:', (e as any)?.message);
      }
    }
  }
  return _mod;
}

/** Write the active member's role-based summary to the App Group and reload widget timelines. No-ops on Android or simulator. */
export async function syncWidget(payload: WidgetPayload): Promise<void> {
  const m = mod();
  if (!m) {
    console.error('[widget-data] ❌ syncWidget: native module not loaded, cannot sync');
    return;
  }
  try {
    await m.syncWidget(JSON.stringify(payload));
    console.log('[widget-data] ✅ syncWidget: data written to App Group');
  } catch (e: any) {
    console.error('[widget-data] ❌ syncWidget native call failed:', {
      message: e?.message,
      code: e?.code,
      domain: e?.domain,
    });
  }
}

/** Clear the App Group and reset the widget to its disabled state (e.g. signed out). */
export async function clearWidget(): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.clearWidget(); } catch {}
}

/** Schedule a BGAppRefreshTask so the widget updates even when the app is in the background. */
export async function scheduleBackgroundRefresh(): Promise<void> {
  const m = mod();
  if (!m) return;
  try { await m.scheduleBackgroundRefresh(); } catch {}
}
