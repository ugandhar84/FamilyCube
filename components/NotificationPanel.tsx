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
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { RADIUS, TYPO } from '@/constants/theme';
import { useNotifStore } from '@/store/notifStore';
import { useAuthStore } from '@/store/authStore';
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
    case 'Quests':  return '/(tabs)/quests';
    case 'Hub':     return '/(tabs)';
    case 'Chat':    return '/(tabs)/chat';
    case 'Rewards': return '/(tabs)/store';
    default: break;
  }
  // Fall back on the notification `type` itself when no screen hint is set.
  if (type.startsWith('quest_') || type === 'force_assigned' || type === 'chore_ghosted'
      || type === 'deadline_reminder' || type === 'deadline_overdue' || type === 'penalty_applied'
      || type === 'bonus_activated' || type === 'bonus_expiring') return '/(tabs)/quests';
  if (type === 'coins_awarded' || type === 'reward_redeemed' || type === 'reward_decision') return '/(tabs)/store';
  if (type === 'chat_message') return '/(tabs)/chat';
  return null;
}

function routeFor(n: NotificationLog): string | null {
  return routeForNotification(n.type, n.data);
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

  useEffect(() => {
    if (visible && userId) fetchAll(userId);
  }, [visible, userId]);

  const rows = useMemo(() => notifications ?? [], [notifications]);

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
                <Text style={[s.title, { color: colors.textPrimary }]}>Notifications</Text>
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
                      New quest, chore, and family updates will show up here.
                    </Text>
                  </View>
                ) : (
                  rows.map(n => (
                    <TouchableOpacity
                      key={n.id}
                      activeOpacity={0.7}
                      onPress={() => handlePress(n)}
                      style={[s.row, { borderBottomColor: colors.border }]}
                    >
                      <View style={[s.iconWrap, { backgroundColor: isDark ? 'rgba(146,97,199,0.18)' : colors.primaryLight }]}>
                        <Text style={{ fontSize: 17 }}>{iconFor(n.type)}</Text>
                      </View>
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
                    </TouchableOpacity>
                  ))
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
