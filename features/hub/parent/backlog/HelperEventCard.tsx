import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Medal, HeartPulse, BookOpen, Car, Calendar, Clock, CheckCircle2, Repeat, StickyNote } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';

// Confirmed-green — "confirmed" status accent, distinct from brand teal
// used elsewhere in this card. Not colors.success (which IS brand teal in
// this app) — kept as one local constant.
const CONFIRMED_GREEN = '#22c55e';
// Pending-amber — a warmer amber than BRAND.amber, used only for the small
// "Pending" status badge/icon pairing with CONFIRMED_GREEN; kept as one
// local constant instead of a repeated bare hex.
const PENDING_AMBER = '#D97706';

// A calendar event where this parent is the driver/helper and hasn't
// confirmed yet — take it over from a co-parent, or confirm your own slot.
export function HelperEventCard({ ev, members, active, colors, isDark, updateEvent }: {
  ev: FamilyEvent; members: FamilyMember[]; active: FamilyMember; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
}) {
  const CatIcon = ev.category === 'Sports' ? Medal : ev.category === 'Medical' ? HeartPulse : ev.category === 'Study' ? BookOpen : ev.category === 'Ride' ? Car : Calendar;
  const kidName = members.find(m => m.id === ev.memberId)?.name.split(' ')[0] ?? '';
  const [notesExpanded, setNotesExpanded] = useState(false);

  return (
    <View style={{ borderRadius: 14, borderWidth: 1,
      borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderLeftWidth: 3, borderLeftColor: colors.parent,
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
      padding: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CatIcon size={15} color={colors.parent} />
        <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: ev.helperStatus === 'confirmed' ? `${CONFIRMED_GREEN}20` : colors.warning + '20',
          borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          {ev.helperStatus === 'confirmed' ? <CheckCircle2 size={10} color={CONFIRMED_GREEN} /> : <Clock size={10} color={PENDING_AMBER} />}
          <Text style={{ fontSize: TYPO.micro, fontWeight: '700',
            color: ev.helperStatus === 'confirmed' ? CONFIRMED_GREEN : PENDING_AMBER }}>
            {ev.helperStatus === 'confirmed' ? 'Confirmed' : 'Pending'}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginLeft: 24 }}>
        {ev.date}{ev.time ? ` · ${ev.time}` : ''}
        {kidName ? ` · for ${kidName}` : ''}
        {ev.pickupLocation ? ` · From: ${ev.pickupLocation}` : ''}
        {ev.dropLocation ? ` → ${ev.dropLocation}` : ev.location ? ` → ${ev.location}` : ''}
      </Text>
      {ev.notes ? (
        <Pressable onPress={() => setNotesExpanded(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginLeft: 24 }}>
          <StickyNote size={10} color={colors.textTertiary} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={notesExpanded ? undefined : 1}>
            {ev.notes}
          </Text>
        </Pressable>
      ) : null}
      {ev.helperStatus !== 'confirmed' && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginLeft: 24 }}>
          {ev.helper !== active.name && (
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Take Over',
                  `Reassign this from ${ev.helper} to yourself?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: "Yes, I'll do it", onPress: () => {
                      updateEvent(ev.id, { helper: active.name, helperStatus: 'confirmed' });
                      const msg = `✅ ${active.name.split(' ')[0]} has taken over "${ev.title}" — you're off the hook.`;
                      useChatStore.getState().sendMessage('all', active.id, msg);
                    }},
                  ]
                );
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.parent + '20', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
                borderWidth: 1, borderColor: colors.parent + '40' }}>
              <Repeat size={12} color={colors.parent} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.parent }}>Take Over</Text>
            </Pressable>
          )}
          {ev.helper === active.name && (
            <Pressable
              onPress={() => updateEvent(ev.id, { helperStatus: 'confirmed' })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${CONFIRMED_GREEN}20`, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12,
                borderWidth: 1, borderColor: `${CONFIRMED_GREEN}40` }}>
              <CheckCircle2 size={12} color={CONFIRMED_GREEN} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: CONFIRMED_GREEN }}>Confirm I'll do it</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
