/**
 * KioskNotificationPanel — kiosk-native notification bell drawer.
 *
 * Backed by the exact same useNotifStore data/actions the phone's
 * NotificationPanel.tsx uses (fetchAll, markCachedRead, decrement,
 * removeCachedNotifs, setUnreadCount) — no new store, no new backend
 * calls. Row tap navigates via kiosk's own internal tab-switch
 * (onNavigate, backed by kioskTabForNotification's translation of the
 * phone's own routeForNotification) instead of expo-router, since kiosk
 * mode is a component swap inside HubScreen, not a distinct route tree —
 * a bare router.push here would strand the device on a bare phone screen
 * with no way back [see store/kioskNavStore.ts's own header comment for
 * the class of bug this avoids].
 */
import { useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { X, Bell } from 'lucide-react-native';
import { KioskFormDrawer } from './KioskFormDrawer';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import type { KioskColors } from '../kioskPalette';
import { useNotifStore } from '@/store/notifStore';
import { useAuthStore } from '@/store/authStore';
import { useFamilyStore } from '@/store/familyStore';
import { KioskAvatar } from './KioskAvatar';
import { iconFor, relativeTime } from '@/lib/notifications/display';
import { kioskTabForNotification } from '../kioskNotificationRoute';
import type { KioskTabKey } from '../kioskTabs';
import type { NotificationLog } from '@/lib/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onNavigate: (tab: KioskTabKey) => void;
  k: KioskColors;
}

function actorMemberId(n: NotificationLog): string | undefined {
  const d = n.data ?? {};
  return (d.fromMemberId ?? d.assigneeId ?? d.memberId ?? d.kidId ?? d.byId) as string | undefined;
}

export function KioskNotificationPanel({ visible, onClose, onNavigate, k }: Props) {
  const notifications = useNotifStore(s => s.notifications);
  const fetchAll = useNotifStore(s => s.fetchAll);
  const markCachedRead = useNotifStore(s => s.markCachedRead);
  const decrement = useNotifStore(s => s.decrement);
  const removeCachedNotifs = useNotifStore(s => s.removeCachedNotifs);
  const setUnreadCount = useNotifStore(s => s.setUnreadCount);
  const userId = useAuthStore(s => s.session?.user?.id);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const members = useFamilyStore(s => s.members);

  useEffect(() => {
    if (visible && userId) fetchAll(userId);
  }, [visible, userId]);

  // Auto-close on active-member switch — this panel's data is keyed to
  // whichever member is active in useFamilyStore at fetch time; staying
  // open across a switch would keep showing the PREVIOUS member's
  // notifications until something re-triggers fetchAll (nothing currently
  // does on a switch alone). A fresh bell-tap after switching re-fetches
  // cleanly for the new active member via the effect above.
  useEffect(() => {
    if (visible) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMemberId]);

  const rows = useMemo(() => notifications ?? [], [notifications]);

  const handlePress = (n: NotificationLog) => {
    if (!n.read) {
      markCachedRead([n.id]);
      decrement(1);
      import('@/lib/db/notifications').then(({ markNotificationsRead }) => {
        markNotificationsRead([n.id]).catch(() => {});
      }).catch(() => {});
    }
    const tab = kioskTabForNotification(n.type, n.data);
    onClose();
    onNavigate(tab);
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
    import('@/lib/db/notifications').then(({ deleteNotifications }) => {
      deleteNotifications(ids).catch((e: any) => {
        console.error('[KioskNotificationPanel] Clear all failed:', e?.message, e);
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

  const s = makeStyles(k);

  return (
    <KioskFormDrawer
      visible={visible}
      variant="drawer"
      title="Notifications"
      accent={k.primary}
      Icon={Bell}
      k={k}
      onClose={onClose}
      headerRight={
        <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.md }}>
          {rows.some(n => !n.read) && (
            <Pressable onPress={handleMarkAllRead} hitSlop={10}>
              <Text style={[s.headerAction, { color: k.textMuted }]}>Mark all read</Text>
            </Pressable>
          )}
          {rows.length > 0 && (
            <Pressable onPress={handleDeleteAll} hitSlop={10}>
              <Text style={[s.headerAction, { color: k.danger }]}>Clear all</Text>
            </Pressable>
          )}
        </View>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>✨</Text>
            <Text style={[s.emptyTitle, { color: k.text }]}>You're all caught up</Text>
            <Text style={[s.emptyBody, { color: k.textMuted }]}>
              New chore, calendar, and family updates will show up here.
            </Text>
          </View>
        ) : (
          rows.map(n => {
            const actor = members.find(m => m.id === actorMemberId(n));
            return (
              <Pressable
                key={n.id}
                onPress={() => handlePress(n)}
                style={({ pressed }) => [s.row, { borderBottomColor: k.cardBorder }, pressed && { opacity: 0.7 }]}
              >
                {actor ? (
                  <KioskAvatar
                    name={actor.name} emoji={actor.emoji} avatarUrl={actor.avatarUrl}
                    siblings={members.filter(x => x.id !== actor.id).map(x => x.name)}
                    size={36} ringWidth={0} k={k}
                  />
                ) : (
                  <View style={[s.iconWrap, { backgroundColor: k.well }]}>
                    <Text style={{ fontSize: 17 }}>{iconFor(n.type)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text
                      numberOfLines={1}
                      style={[s.rowTitle, { color: k.text, fontWeight: n.read ? '600' : '800', flexShrink: 1 }]}
                    >
                      {n.title}
                    </Text>
                    {!n.read && <View style={[s.dot, { backgroundColor: k.primary }]} />}
                  </View>
                  <Text numberOfLines={2} style={[s.rowBody, { color: k.textMuted }]}>{n.body}</Text>
                  <Text style={[s.rowTime, { color: k.textFaint }]}>{relativeTime(n.created_at)}</Text>
                </View>
                <Pressable onPress={() => handleDeleteOne(n)} hitSlop={10} style={{ paddingLeft: 8 }}>
                  <X size={16} color={k.textFaint} />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </KioskFormDrawer>
  );
}

const makeStyles = (k: KioskColors) => StyleSheet.create({
  headerAction: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  row: {
    flexDirection: 'row', gap: 10,
    paddingVertical: KIOSK_SPACE.md, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: KIOSK_TYPO.body },
  rowBody: { fontSize: KIOSK_TYPO.caption, marginTop: 2, lineHeight: 17 },
  rowTime: { fontSize: KIOSK_TYPO.micro, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800', marginBottom: 4 },
  emptyBody: { fontSize: KIOSK_TYPO.caption, textAlign: 'center', lineHeight: 18 },
});
