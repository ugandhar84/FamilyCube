/**
 * NotificationPanel — light, quick-glance notification inbox.
 *
 * Deliberately NOT AppBottomSheet: this is a short list meant to be
 * glanced at and dismissed, not a form/destination. A slim slide-down
 * panel anchored under the header (mirrors the in-app toast's own
 * top-anchored slide in app/_layout.tsx) keeps it feeling like a quick
 * peek rather than a new screen.
 */
import React, { useEffect, useMemo } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { RADIUS, TYPO } from '@/constants/theme';
import { useNotifStore } from '@/store/notifStore';
import { useAuthStore } from '@/store/authStore';
import { useFamilyStore } from '@/store/familyStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { NotificationLog } from '@/lib/types';

// ── Per-type icon + routing ──────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  quest_posted:     '🎯',
  quest_assigned:   '📋',
  quest_claimed:    '🙋',
  quest_submitted:  '📸',
  quest_approved:   '✅',
  quest_declined:   '❌',
  quest_reopened:   '🔄',
  force_assigned:   '📋',
  bonus_activated:  '🔥',
  bonus_expiring:   '⏰',
  coins_awarded:    '🪙',
  chore_ghosted:    '👻',
  deadline_reminder:'📅',
  deadline_overdue: '🚨',
  penalty_applied:  '🪙',
  help_requested:   '🆘',
  help_resolved:    '✅',
  reward_redeemed:  '🎁',
  reward_decision:  '🎁',
  kid_request:      '📣',
  kid_request_decision: '📣',
  chat_message:     '💬',
  family_update:    '👨‍👩‍👧',
};
const DEFAULT_ICON = '🔔';

function iconFor(type: string): string {
  return TYPE_ICON[type] ?? DEFAULT_ICON;
}

/**
 * Basic per-type destination — a reasonable default, not a full deep-link
 * registry. Exported so the app-root toast (app/_layout.tsx) can route the
 * same way when a notification is tapped straight from the banner.
 */
export function routeForNotification(type: string, data?: Record<string, any> | null): string | null {
  const screen = data?.screen as string | undefined;
  switch (screen) {
    // 'quests' and 'calendar' merged into the unified Tasks tab (see
    // app/(tabs)/_layout.tsx's own comment) — /(tabs)/quests still resolves
    // (kept registered for compat) but isn't the real destination anymore.
    case 'Quests':   return '/(tabs)/tasks';
    case 'Hub':      return '/(tabs)';
    case 'Chat':     return '/(tabs)/chat';
    case 'Rewards':
    // reward_removed/reward_decision etc. use screen:'Rewards'; the
    // dedicated reward-alert case below (screen:'Store') is a separate
    // family-notifier payload shape for the same destination — both are
    // the real Store tab, not a distinct screen.
    case 'Store':    return '/(tabs)/store';
    // Ride/driver assignment notifications (ride_assignment_*/
    // ride_confirmed_for_kid) — deep-link to the Schedule tab where the
    // event and its driver-status chips live. Schedule is the calendar's
    // own segment inside the merged Tasks tab (features/tasks/TasksScreen.tsx).
    case 'Schedule': return '/(tabs)/tasks';
    // Kid requests / help requests are reviewed inline on the parent Hub
    // (ActionNeededSection) — there's no dedicated Requests/Help screen to
    // deep-link into further.
    case 'Requests':
    case 'Help':     return '/(tabs)';
    // Geofence/battery alerts are about a member's location — FindFam is
    // its own dedicated tab (app/(tabs)/gps.tsx), same route
    // FamilyRadarSection's own "view on map" uses.
    case 'Hearth':   return '/(tabs)/gps';
    // Member/profile management (PIN changed, role changed, temp-approver
    // grant/revoke, new member joined) all live on the Profile tab's member
    // list — there's no separate "Roster" route.
    case 'Roster':   return '/(tabs)/profile';
    // Grocery/meal/medication alerts previously had NO case here at all —
    // every one of them fell through the type-based fallback below (which
    // also didn't cover most of these types) straight to the generic Hub
    // route, regardless of what the notification was actually about
    // (live-reported: "grocery, meals, medications... all alerts should
    // respect those navigations"). These are real, separate top-level tabs
    // (app/(tabs)/grocery.tsx, meals.tsx, family-health.tsx), not sub-tabs
    // of one shared "Vault" screen the way this app used to be structured.
    case 'Grocery':  return '/(tabs)/grocery';
    // family-notifier's meal_reminder/meal alerts still send the legacy
    // screen:'Vault', tab:'Meals' label from when Grocery/Meals/Health were
    // sub-tabs of one shared Vault screen — that screen no longer exists,
    // each is its own dedicated route now, so this maps straight to Meals.
    // Health alerts use their own dedicated screen:'Health' below instead.
    case 'Vault':    return '/(tabs)/meals';
    case 'Health':   return '/(tabs)/family-health';
    case 'Memories': return '/(tabs)/memories';
    default: break;
  }
  // Fall back on the notification `type` itself when no screen hint is set.
  if (type.startsWith('quest_') || type === 'force_assigned' || type === 'chore_ghosted'
      || type === 'deadline_reminder' || type === 'deadline_overdue' || type === 'penalty_applied'
      || type === 'bonus_activated' || type === 'bonus_expiring' || type.startsWith('chore_handoff_')) return '/(tabs)/tasks';
  if (type.startsWith('ride_assignment_') || type === 'ride_confirmed_for_kid' || type === 'ride_pool_opened') return '/(tabs)/tasks';
  if (type === 'coins_awarded' || type === 'reward_redeemed' || type === 'reward_decision') return '/(tabs)/store';
  if (type === 'chat_message') return '/(tabs)/chat';
  if (type.startsWith('kid_request')) return '/(tabs)';
  if (type === 'geofence_exit' || type === 'geofence_arrive' || type === 'low_battery') {
    return '/(tabs)/gps';
  }
  if (type === 'help_requested' || type === 'help_resolved') return '/(tabs)';
  // Grocery trip/proximity alerts — Grocery has its own dedicated route
  // (app/(tabs)/grocery.tsx), same one app/_layout.tsx's push-tap listener
  // uses. Was missing here entirely, so tapping one of these rows from the
  // in-app notification panel (as opposed to the OS push banner) silently
  // did nothing (live-reported).
  if (type === 'shopping_trip_started' || type === 'store_proximity'
      || type === 'grocery_daily_digest' || type === 'grocery_run_reminder') {
    return '/(tabs)/grocery';
  }
  // Type-based safety net for meal/medication/memory alerts, mirroring
  // their real screen values above — covers the case where a persisted
  // notification_logs row lost its `data.screen` field somewhere along the
  // way and only `type` survived.
  if (type === 'meal_reminder') return '/(tabs)/meals';
  if (type === 'medication_added' || type === 'medication_missed') return '/(tabs)/family-health';
  if (type === 'memory_posted' || type === 'memory_liked') return '/(tabs)/memories';
  // No specific deep link known for this type — fall back to the Hub
  // rather than doing nothing at all when tapped (live-reported: tapping a
  // notification should always take you somewhere).
  return '/(tabs)';
}

function routeFor(n: NotificationLog): string | null {
  return routeForNotification(n.type, n.data);
}

// Which member actually triggered this notification — no single consistent
// field across family-notifier's payload shapes (some pass an id, some only
// a name string), so this tries every id-shaped field family-notifier's
// own templates are seen using, in the order most likely to be "the person
// who did the thing" rather than "the person being told about it".
function actorMemberId(n: NotificationLog): string | undefined {
  const d = n.data ?? {};
  return (d.fromMemberId ?? d.assigneeId ?? d.memberId ?? d.kidId ?? d.byId) as string | undefined;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Yesterday';
  if (day < 7) return `${day}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Matches AppHeader's bar: paddingVertical 10 (×2) + the 40px bell button,
// plus a little breathing room so the panel visibly slides out from under
// the bell rather than touching it. Every screen that renders this panel
// uses the same AppHeader, so one constant is correct everywhere it's used.
const HEADER_HEIGHT = 10 + 40 + 10 + 6;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationPanel({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const notifications = useNotifStore(s => s.notifications);
  const fetchAll = useNotifStore(s => s.fetchAll);
  const markCachedRead = useNotifStore(s => s.markCachedRead);
  const decrement = useNotifStore(s => s.decrement);
  const userId = useAuthStore(s => s.session?.user?.id);
  const members = useFamilyStore(s => s.members);
  const siblingNames = useMemo(() => members.map(m => m.name), [members]);

  useEffect(() => {
    if (visible && userId) fetchAll(userId);
  }, [visible, userId]);

  const rows = useMemo(() => notifications ?? [], [notifications]);

  const removeCachedNotifs = useNotifStore(s => s.removeCachedNotifs);
  const setUnreadCount = useNotifStore(s => s.setUnreadCount);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);

  const handlePress = (n: NotificationLog) => {
    if (!n.read) {
      markCachedRead([n.id]);
      decrement(1);
      // Best-effort server sync — panel is a quick glance, not blocked on this.
      import('@/lib/db/notifications').then(({ markNotificationsRead }) => {
        markNotificationsRead([n.id]).catch(() => {});
      }).catch(() => {});
    }
    const dest = routeFor(n);
    onClose();
    if (dest) router.push(dest as any);
  };

  const handleDeleteOne = (n: NotificationLog) => {
    removeCachedNotifs([n.id]);
    if (!n.read) decrement(1);
    import('@/lib/db/notifications').then(({ deleteNotifications }) => {
      deleteNotifications([n.id]).catch(() => {});
    }).catch(() => {});
  };

  const handleDeleteAll = () => {
    if (rows.length === 0) return;
    const ids = rows.map(n => n.id);
    removeCachedNotifs(ids);
    setUnreadCount(0);
    // Was a silent .catch(() => {}) — a real DB failure (RLS, network) left
    // the local cache cleared (looks like it worked) while the rows never
    // actually left the DB, so they'd reappear on the next real fetch with
    // zero indication anything went wrong. Log it so a failure is at least
    // diagnosable; optimistic-clear stays (a failed batch delete isn't
    // worth re-inserting the rows back into the visible list either).
    import('@/lib/db/notifications').then(({ deleteNotifications }) => {
      deleteNotifications(ids).catch((e: any) => {
        console.error('[NotificationPanel] Clear all failed:', e?.message, e);
      });
    }).catch(() => {});
  };

  const handleMarkAllRead = () => {
    const unreadIds = rows.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    markCachedRead(unreadIds);
    setUnreadCount(0);
    if (activeMemberId) {
      import('@/lib/db/notifications').then(({ markAllNotificationsRead }) => {
        markAllNotificationsRead(activeMemberId).catch(() => {});
      }).catch(() => {});
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={[s.panel, {
              backgroundColor: colors.card,
              shadowColor: isDark ? '#000' : '#3D2068',
              // AppHeader's own bar (paddingVertical 10 + the 40px bell
              // button) is ~60px tall — this Modal is a global overlay with
              // no knowledge of that per-screen header, so without this
              // offset the panel opened flush against the top of the safe
              // area and rendered UNDER/behind the header bar instead of
              // sliding down from beneath the bell.
              marginTop: HEADER_HEIGHT,
            }]}>
              {/* Header */}
              <View style={[s.header, { borderBottomColor: colors.border }]}>
                <Text style={[s.title, { color: colors.textPrimary, flex: 1 }]}>Notifications</Text>
                {rows.some(n => !n.read) && (
                  <TouchableOpacity onPress={handleMarkAllRead} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} style={{ marginRight: 14 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                {rows.length > 0 && (
                  <TouchableOpacity onPress={handleDeleteAll} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} style={{ marginRight: 14 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>Clear all</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>Done</Text>
                </TouchableOpacity>
              </View>

              {/* List */}
              <ScrollView
                style={{ maxHeight: 420 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {rows.length === 0 ? (
                  <View style={s.empty}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>✨</Text>
                    <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>You're all caught up</Text>
                    <Text style={[s.emptyBody, { color: colors.textSecondary }]}>
                      New chore, calendar, and family updates will show up here.
                    </Text>
                  </View>
                ) : (
                  rows.map(n => {
                    const actor = members.find(m => m.id === actorMemberId(n));
                    return (
                    <TouchableOpacity
                      key={n.id}
                      activeOpacity={0.7}
                      onPress={() => handlePress(n)}
                      style={[s.row, { borderBottomColor: colors.border }]}
                    >
                      {actor ? (
                        <FamilyAvatar
                          name={actor.name} emoji={actor.emoji} avatarUrl={actor.avatarUrl}
                          siblings={siblingNames} size={36} ringWidth={0}
                        />
                      ) : (
                        <View style={[s.iconWrap, { backgroundColor: isDark ? 'rgba(146,97,199,0.18)' : colors.primaryLight }]}>
                          <Text style={{ fontSize: 17 }}>{iconFor(n.type)}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text
                            numberOfLines={1}
                            style={[
                              s.rowTitle,
                              { color: colors.textPrimary, fontWeight: n.read ? '600' : '800', flexShrink: 1 },
                            ]}
                          >
                            {n.title}
                          </Text>
                          {!n.read && <View style={[s.dot, { backgroundColor: colors.primary }]} />}
                        </View>
                        <Text numberOfLines={2} style={[s.rowBody, { color: colors.textSecondary }]}>
                          {n.body}
                        </Text>
                        <Text style={[s.rowTime, { color: colors.textTertiary }]}>
                          {relativeTime(n.created_at)}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteOne(n)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingLeft: 8 }}>
                        <Ionicons name="close" size={16} color={colors.textTertiary} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </SafeAreaView>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    // Wide, not right-anchored — this is a readable list of message-length
    // notification bodies, not a compact icon-menu dropdown, so it keeps
    // nearly the full screen width (matching the pre-existing 10px side
    // margins) rather than being squeezed into a narrow column under the
    // bell.
    marginHorizontal: 10,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: TYPO.heading,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: TYPO.body,
  },
  rowBody: {
    fontSize: TYPO.caption,
    marginTop: 2,
    lineHeight: 17,
  },
  rowTime: {
    fontSize: TYPO.micro,
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: TYPO.body,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptyBody: {
    fontSize: TYPO.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
});
