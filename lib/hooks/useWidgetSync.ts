/**
 * useWidgetSync — keeps the iOS home screen widget in sync with live app
 * data. The original PawBond version tracked pet care data that was never
 * part of Family Cube's real schema, so the widget silently never had real
 * data even before the App Group entitlement gap. Rebuilt against the real
 * stores, role-based per the currently active member:
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
import { supabase } from '@/lib/supabase';
import { useGroceryStore } from '@/store/groceryStore';

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
  // items is already "pending (not bought) items for the family" per
  // groceryStore.ts's own type — no extra filtering needed. Loaded by
  // ParentView.tsx's own mount effect (the Hub, always the parent's
  // landing screen), so it's already populated by the time this syncs.
  const groceryItems = useGroceryStore(s => s.items);

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
      // Up to 3 upcoming events for the medium widget's Calendar-style list;
      // the first one also doubles as nextEventTitle/nextEventTime for the
      // small widget's single-line "up next".
      const upcomingEventsFor = (matchesEvent: (e: (typeof events)[number]) => boolean) => {
        const upcoming = events
          .filter(e => matchesEvent(e) && hoursUntilEvent(e.date, e.time) >= 0)
          .sort((a, b) => (a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date)))
          .slice(0, 3)
          .map(e => {
            const isToday = e.date === localToday();
            return {
              title: e.title,
              time: e.time ? `${isToday ? 'Today' : e.date} · ${fmtTime(e.time)}` : (isToday ? 'Today' : e.date),
            };
          });
        return upcoming;
      };

      let payload: WidgetPayload;

      if (active.role === 'parent') {
        const today = localToday();
        const pendingApprovals = chores.filter(c =>
          c.status === 'pending_approval' || c.status === 'pending_grandparent_approval' || c.status === 'pending_parent_approval'
        ).length;
        const eventsToday = events.filter(e => e.date === today).length;
        const upcomingEvents = upcomingEventsFor(() => true); // family-wide — any member's next events

        payload = {
          enabled: true,
          kind: 'parent',
          parentSummary: {
            familyName: familyName || 'Our Family',
            memberCount: members.length,
            pendingApprovals,
            eventsToday,
            unreadMessages: unreadCount,
            groceryPending: groceryItems.length,
            nextEventTitle: upcomingEvents[0]?.title ?? null,
            nextEventTime: upcomingEvents[0]?.time ?? null,
            upcomingEvents,
          },
          lastSyncedAt: now.toISOString(),
        };
      } else {
        const upcomingEvents = upcomingEventsFor(e => e.memberId === active.id || !!e.memberIds?.includes(active.id));
        const isSenior = active.role === 'senior';

        // A grandparent never earns coins or builds a streak (always 0 in
        // the DB — no UI anywhere treats it as their own stat), so those
        // fields are omitted rather than shipped as misleading zeros.
        // Medications is the senior-relevant glance instead — same
        // family_medications table features/vault/tabs/HealthTab.tsx
        // reads/writes, not the disconnected local-only card SeniorView.tsx
        // used to have.
        let medsPending: number | undefined;
        if (isSenior && active.familyId) {
          const { data } = await supabase.from('family_medications')
            .select('id, taken_date')
            .eq('family_id', active.familyId).eq('member_id', active.id).eq('is_active', true);
          medsPending = (data ?? []).filter(m => m.taken_date !== localToday()).length;
        }

        payload = {
          enabled: true,
          kind: 'member',
          memberSummary: {
            memberName: active.name,
            memberEmoji: active.emoji ?? '🙂',
            ...(isSenior ? { medsPending } : {
              pendingQuests: chores.filter(c =>
                c.assignedToId === active.id && ['todo', 'in_progress'].includes(c.status)
              ).length,
              coins: active.mainCoins ?? active.coins ?? 0,
              streak: active.streak ?? 0,
            }),
            nextEventTitle: upcomingEvents[0]?.title ?? null,
            nextEventTime: upcomingEvents[0]?.time ?? null,
            upcomingEvents,
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
  }, [members, activeMemberId, familyName, familyLoaded, chores, events, unreadCount, groceryItems]);

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
