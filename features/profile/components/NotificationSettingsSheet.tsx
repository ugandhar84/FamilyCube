/**
 * NotificationSettingsSheet — bottom sheet for all notification preferences.
 *
 * Organised into four sections: Care, Feed, Social (conditional on feature
 * flags), and Quiet Hours. Pro-locked notifications show a lock badge instead
 * of a toggle. The quiet hours time picker opens as a separate BottomSheet
 * (QuietHoursSheet) triggered from inside this component.
 */

import React, { memo, useState } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, Switch, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@/components/BottomSheet';
import { showUpgradeAlert } from '@/lib/subscription';
import QuietHoursSheet from '@/features/profile/components/QuietHoursSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Subscription tier — used to gate Pro-only items
  tier: string;
  // Accent colour derived from the active pet
  accent: string;
  colors: any;
  // ── Care notifications ────────────────────────────────────────────────────
  notifDaily: boolean;       setNotifDaily: (v: boolean) => void;
  notifHealth: boolean;      setNotifHealth: (v: boolean) => void;
  notifAppointment: boolean; setNotifAppointment: (v: boolean) => void;
  // ── Feed notifications ────────────────────────────────────────────────────
  notifPostLike: boolean;    setNotifPostLike: (v: boolean) => void;
  notifPostComment: boolean; setNotifPostComment: (v: boolean) => void;
  notifFollow: boolean;      setNotifFollow: (v: boolean) => void;
  notifMention: boolean;     setNotifMention: (v: boolean) => void;
  // ── Social notifications ──────────────────────────────────────────────────
  notifLost: boolean;     setNotifLost: (v: boolean) => void;
  notifFamily: boolean;   setNotifFamily: (v: boolean) => void;
  notifPlaydate: boolean; setNotifPlaydate: (v: boolean) => void;
  notifChat: boolean;     setNotifChat: (v: boolean) => void;
  notifEvent: boolean;    setNotifEvent: (v: boolean) => void;
  // ── Quiet hours ───────────────────────────────────────────────────────────
  quietHoursEnabled: boolean; setQuietHoursEnabled: (v: boolean) => void;
  quietHoursStart: string;    setQuietHoursStart: (v: string) => void;
  quietHoursEnd: string;      setQuietHoursEnd: (v: string) => void;
  // ── Feature flags ─────────────────────────────────────────────────────────
  sosEnabled: boolean;
  familyEnabled: boolean;
  playdatesEnabled: boolean;
  eventsEnabled: boolean;
}

const NotificationSettingsSheet = memo(function NotificationSettingsSheet(props: Props) {
  const {
    visible, onClose, tier, accent, colors,
    notifDaily, setNotifDaily, notifHealth, setNotifHealth,
    notifAppointment, setNotifAppointment,
    notifPostLike, setNotifPostLike, notifPostComment, setNotifPostComment,
    notifFollow, setNotifFollow, notifMention, setNotifMention,
    notifLost, setNotifLost, notifFamily, setNotifFamily,
    notifPlaydate, setNotifPlaydate, notifChat, setNotifChat,
    notifEvent, setNotifEvent,
    quietHoursEnabled, setQuietHoursEnabled,
    quietHoursStart, setQuietHoursStart,
    quietHoursEnd, setQuietHoursEnd,
    sosEnabled, familyEnabled, playdatesEnabled, eventsEnabled,
  } = props;

  // ─── Quiet hours time picker state ──────────────────────────────────────────
  const [timePicker, setTimePicker] = useState<{
    target: 'start' | 'end'; hour: number; minute: number; ampm: 'AM' | 'PM';
  } | null>(null);

  const openTimePicker = (target: 'start' | 'end') => {
    const raw = target === 'start' ? quietHoursStart : quietHoursEnd;
    const [hStr, mStr] = raw.split(':');
    const h24 = parseInt(hStr, 10);
    const m   = parseInt(mStr, 10);
    const ampm: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const hour = h24 % 12 === 0 ? 12 : h24 % 12;
    setTimePicker({ target, hour, minute: m, ampm });
  };

  const confirmTimePicker = () => {
    if (!timePicker) return;
    const { target, hour, minute, ampm } = timePicker;
    const h24 = hour % 12 + (ampm === 'PM' ? 12 : 0);
    const val = `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    if (target === 'start') setQuietHoursStart(val);
    else setQuietHoursEnd(val);
    setTimePicker(null);
  };

  // 12-hour display helper
  const fmt12 = (raw: string) => {
    const [hStr, mStr] = raw.split(':');
    const h24 = parseInt(hStr, 10);
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h}:${mStr} ${ampm}`;
  };

  // ─── Social items — only rendered when the feature flag is on ───────────────
  const socialItems = [
    { icon: 'location-outline'       as const, label: 'Lost pet alerts',    sub: 'SOS alerts from community',  val: notifLost,     set: setNotifLost,     show: sosEnabled       },
    { icon: 'people-outline'          as const, label: 'Family updates',    sub: 'When family logs care',      val: notifFamily,   set: setNotifFamily,   show: familyEnabled    },
    { icon: 'paw-outline'             as const, label: 'Playdate requests', sub: 'New requests & responses',   val: notifPlaydate, set: setNotifPlaydate, show: playdatesEnabled },
    { icon: 'chatbubble-outline'      as const, label: 'Chat messages',     sub: 'Messages in playdate chats', val: notifChat,     set: setNotifChat,     show: playdatesEnabled },
    { icon: 'calendar-number-outline' as const, label: 'Event updates',     sub: 'RSVPs & event changes',      val: notifEvent,    set: setNotifEvent,    show: eventsEnabled    },
  ].filter(n => n.show);

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Notifications">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>

          {/* Care */}
          <Text style={[sectionLabel, { color: accent }]}>Care</Text>
          <View style={[group, { backgroundColor: colors.card, marginBottom: 16 }]}>
            {[
              { icon: 'notifications-outline' as const, label: 'Daily reminders',       sub: 'Feeding, walks, meds',    val: notifDaily,       set: setNotifDaily,       pro: false },
              { icon: 'pulse-outline'         as const, label: 'Health alerts',         sub: 'Vaccine due, vet visits', val: notifHealth,      set: setNotifHealth,      pro: true  },
              { icon: 'calendar-outline'      as const, label: 'Appointment reminders', sub: 'Upcoming vet & grooming', val: notifAppointment, set: setNotifAppointment, pro: true  },
            ].map((n, i) => {
              const locked = n.pro && tier === 'free';
              return (
                <View key={n.label} style={[notifRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={[iconBox, { backgroundColor: `${accent}18` }]}><Ionicons name={n.icon} size={16} color={accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[rowLabel, { color: colors.textPrimary }]}>{n.label}</Text>
                    <Text style={[rowSub, { color: colors.textSecondary }]}>{n.sub}</Text>
                  </View>
                  {locked ? (
                    <TouchableOpacity onPress={() => { onClose(); setTimeout(() => showUpgradeAlert({ message: 'Upgrade to Pro to receive health and appointment reminders.' }), 300); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="lock-closed-outline" size={13} color={colors.textSecondary} />
                      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, fontWeight: '600' }}>Pro</Text>
                    </TouchableOpacity>
                  ) : (
                    <Switch value={n.val} onValueChange={n.set} trackColor={{ false: colors.border, true: `${accent}80` }} thumbColor={n.val ? accent : (colors.textTertiary ?? '#999')} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Feed */}
          <Text style={[sectionLabel, { color: accent }]}>Feed</Text>
          <View style={[group, { backgroundColor: colors.card, marginBottom: 16 }]}>
            {[
              { icon: 'heart-outline'      as const, label: 'Post likes',    sub: 'When someone likes your post',       val: notifPostLike,    set: setNotifPostLike    },
              { icon: 'chatbubble-outline' as const, label: 'Comments',      sub: 'When someone comments on your post', val: notifPostComment, set: setNotifPostComment },
              { icon: 'person-add-outline' as const, label: 'New followers', sub: 'When someone follows you',           val: notifFollow,      set: setNotifFollow      },
              { icon: 'at-outline'         as const, label: 'Mentions',      sub: 'When someone mentions you',          val: notifMention,     set: setNotifMention     },
            ].map((n, i) => (
              <View key={n.label} style={[notifRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={[iconBox, { backgroundColor: `${accent}18` }]}><Ionicons name={n.icon} size={16} color={accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[rowLabel, { color: colors.textPrimary }]}>{n.label}</Text>
                  <Text style={[rowSub, { color: colors.textSecondary }]}>{n.sub}</Text>
                </View>
                <Switch value={n.val} onValueChange={n.set} trackColor={{ false: colors.border, true: `${accent}80` }} thumbColor={n.val ? accent : (colors.textTertiary ?? '#999')} />
              </View>
            ))}
          </View>

          {/* Social — only rendered when at least one social feature is on */}
          {socialItems.length > 0 && (
            <>
              <Text style={[sectionLabel, { color: accent }]}>Social</Text>
              <View style={[group, { backgroundColor: colors.card, marginBottom: 16 }]}>
                {socialItems.map((n, i) => (
                  <View key={n.label} style={[notifRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={[iconBox, { backgroundColor: `${accent}18` }]}><Ionicons name={n.icon} size={16} color={accent} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[rowLabel, { color: colors.textPrimary }]}>{n.label}</Text>
                      <Text style={[rowSub, { color: colors.textSecondary }]}>{n.sub}</Text>
                    </View>
                    <Switch value={n.val} onValueChange={n.set} trackColor={{ false: colors.border, true: `${accent}80` }} thumbColor={n.val ? accent : (colors.textTertiary ?? '#999')} />
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Quiet hours */}
          <Text style={[sectionLabel, { color: accent }]}>Quiet Hours</Text>
          <View style={[group, { backgroundColor: colors.card }]}>
            <View style={notifRow}>
              <View style={[iconBox, { backgroundColor: `${accent}18` }]}><Ionicons name="moon-outline" size={16} color={accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[rowLabel, { color: colors.textPrimary }]}>Enable quiet hours</Text>
                <Text style={[rowSub, { color: colors.textSecondary }]}>No push notifications during this window</Text>
              </View>
              <Switch value={quietHoursEnabled} onValueChange={setQuietHoursEnabled} trackColor={{ false: colors.border, true: `${accent}80` }} thumbColor={quietHoursEnabled ? accent : (colors.textTertiary ?? '#999')} />
            </View>
            {quietHoursEnabled && (
              <>
                <View style={[notifRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={[iconBox, { backgroundColor: `${accent}18` }]}><Ionicons name="time-outline" size={16} color={accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[rowLabel, { color: colors.textPrimary }]}>Start time</Text>
                    <Text style={[rowSub, { color: colors.textSecondary }]}>Notifications pause</Text>
                  </View>
                  <TouchableOpacity onPress={() => openTimePicker('start')}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: accent }}>{fmt12(quietHoursStart)}</Text>
                  </TouchableOpacity>
                </View>
                <View style={[notifRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={[iconBox, { backgroundColor: `${accent}18` }]}><Ionicons name="sunny-outline" size={16} color={accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[rowLabel, { color: colors.textPrimary }]}>End time</Text>
                    <Text style={[rowSub, { color: colors.textSecondary }]}>Notifications resume</Text>
                  </View>
                  <TouchableOpacity onPress={() => openTimePicker('end')}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: accent }}>{fmt12(quietHoursEnd)}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Time picker — separate sheet that floats above the notification sheet */}
      <QuietHoursSheet
        timePicker={timePicker}
        setTimePicker={setTimePicker}
        onConfirm={confirmTimePicker}
        accent={accent}
        colors={colors}
      />
    </>
  );
});

export default NotificationSettingsSheet;

// ─── Local styles ─────────────────────────────────────────────────────────────
const sectionLabel: any = {
  fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8,
  textTransform: 'uppercase', marginBottom: 8, marginTop: 4, paddingHorizontal: 2,
};
const group: any  = { borderRadius: 14, overflow: 'hidden', marginBottom: 0 };
const notifRow: any = { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 };
const iconBox: any  = { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' };
const rowLabel: any = { fontSize: TYPO.subheading, fontWeight: '500' };
const rowSub: any   = { fontSize: TYPO.body, marginTop: 1 };
