/**
 * useWidgetSync — keeps the iOS home screen widget in sync with live app
 * data. Was 100% PawBond (usePetStore, checklist, feedingLogs, moodLogs,
 * appointments table) — none of that exists in Family Cube's real schema,
 * so the widget silently never had real data even before the App Group
 * entitlement gap. Rebuilt against the real stores, role-based per the
 * currently active member:
 *   - Parent: household name, member count, pending-approval count
 *     (the one thing a parent actually glances at this widget for),
 *     today's event count, unread messages, and the family's next
 *     upcoming event.
 *   - Kid/teen/senior: their own pending-quest count, coins, streak, and
 *     their own next event/ride.
 *
 * Mount once in _layout.tsx. Writes to the App Group whenever:
 *   • The app comes to the foreground (AppState change)
 *   • The active member switches (PIN-switch to a different profile)
 *   • Chore/event/chat data changes in the relevant store
 *
 * No-ops on Android, and (via the native module's own guard) when the App
 * Group entitlement isn't present yet — see targets/widget/expo-target.config.js.
 */
import { useEffect, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useFamilyStore } from '@/store/familyStore';
import { useChoreStore } from '@/store/choreStore';
import { useEventStore } from '@/store/eventStore';
import { useNotifStore } from '@/store/notifStore';
import { syncWidget, clearWidget, type WidgetPayload } from 'widget-data';
import { localToday, hoursUntilEvent, fmtTime } from '@/features/hub/hubUtils';

export function useWidgetSync() {
  if (Platform.OS !== 'ios') return;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useWidgetSyncInner();
}

function useWidgetSyncInner() {
  const { members, activeMemberId, familyName, loaded: familyLoaded } = useFamilyStore(
    useShallow(s => ({ members: s.members, activeMemberId: s.activeMemberId, familyName: s.familyName, loaded: s.loaded }))
  );
  const chores = useChoreStore(s => s.chores);
  const events = useEventStore(s => s.events);
  const unreadCount = useNotifStore(s => s.unreadCount);

  const syncingRef = useRef(false);

  const doSync = useCallback(async () => {
    if (syncingRef.current) return;
    if (!familyLoaded) return;
    syncingRef.current = true;

    try {
      const active = members.find(m => m.id === activeMemberId);
      if (!active) {
        await clearWidget().catch(() => {});
        return;
      }

      const now = new Date();
      const nextEventFor = (matchesEvent: (e: (typeof events)[number]) => boolean) => {
        const upcoming = events
          .filter(e => matchesEvent(e) && hoursUntilEvent(e.date, e.time) >= 0)
          .sort((a, b) => (a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date)));
        const next = upcoming[0];
        if (!next) return { title: null, time: null };
        const isToday = next.date === localToday();
        return {
          title: next.title,
          time: next.time ? `${isToday ? 'Today' : next.date} · ${fmtTime(next.time)}` : (isToday ? 'Today' : next.date),
        };
      };

      let payload: WidgetPayload;

      if (active.role === 'parent') {
        const today = localToday();
        const pendingApprovals = chores.filter(c =>
          c.status === 'pending_approval' || c.status === 'pending_grandparent_approval' || c.status === 'pending_parent_approval'
        ).length;
        const eventsToday = events.filter(e => e.date === today).length;
        const { title, time } = nextEventFor(() => true); // family-wide — any member's next event

        payload = {
          enabled: true,
          kind: 'parent',
          parentSummary: {
            familyName: familyName || 'Our Family',
            memberCount: members.length,
            pendingApprovals,
            eventsToday,
            unreadMessages: unreadCount,
            nextEventTitle: title,
            nextEventTime: time,
          },
          lastSyncedAt: now.toISOString(),
        };
      } else {
        const pendingQuests = chores.filter(c =>
          c.assignedToId === active.id && ['todo', 'in_progress'].includes(c.status)
        ).length;
        const { title, time } = nextEventFor(e => e.memberId === active.id || !!e.memberIds?.includes(active.id));

        payload = {
          enabled: true,
          kind: 'member',
          memberSummary: {
            memberName: active.name,
            memberEmoji: active.emoji ?? '🙂',
            pendingQuests,
            coins: active.mainCoins ?? active.coins ?? 0,
            streak: active.streak ?? 0,
            nextEventTitle: title,
            nextEventTime: time,
          },
          lastSyncedAt: now.toISOString(),
        };
      }

      await syncWidget(payload);
    } catch (e) {
      if (__DEV__) console.warn('[useWidgetSync] sync failed:', e);
    } finally {
      syncingRef.current = false;
    }
  }, [members, activeMemberId, familyName, familyLoaded, chores, events, unreadCount]);

  // Sync when the relevant data changes (including active-member switches).
  useEffect(() => { doSync(); }, [doSync]);

  // Sync on app foreground — catches anything that changed while backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') doSync();
    });
    return () => sub.remove();
  }, [doSync]);
}
