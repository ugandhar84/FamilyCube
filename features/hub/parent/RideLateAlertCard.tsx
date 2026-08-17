import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { CollapsibleCard } from '../hubComponents';
import { fmtTime } from '../hubUtils';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { RideLatePayload } from '../KidModals';

// "My driver hasn't arrived" — a stranded kid, not an approval decision.
// Everything the parent needs to judge the situation at a glance, plus a way
// to either take it themselves or throw it open to another helper.
export function RideLateAlertCard({ req, rideLate, kidName, ev, active, colors, isDark, approveRequest, updateEvent }: {
  req: any; rideLate: RideLatePayload; kidName: string; ev: FamilyEvent | undefined;
  active: FamilyMember; colors: any; isDark: boolean;
  approveRequest: (id: string, by: string, note?: string) => void;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
}) {
  const waitedMin = Math.max(0, Math.round((Date.now() - new Date(rideLate.sentAt).getTime()) / 60000));
  const lateBy = (() => {
    if (!rideLate.time) return null;
    const [h, m] = rideLate.time.split(':').map(Number);
    const due = new Date(); due.setHours(h, m, 0, 0);
    const mins = Math.round((Date.now() - due.getTime()) / 60000);
    return mins > 0 ? mins : null;
  })();
  const driverName = rideLate.driver ?? ev?.helper;
  const pickup     = rideLate.location ?? ev?.pickupLocation ?? ev?.location;
  const dropOff    = rideLate.dropLocation ?? ev?.dropLocation;
  const resolve = (note: string, chat: string) => {
    approveRequest(req.id, active.id, note);
    useChatStore.getState().sendMessage('all', active.id, chat);
  };

  return (
    <CollapsibleCard accent="#EF4444" colors={colors} isDark={isDark} defaultExpanded
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 22 }}>🚨</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#EF4444' }}>
              {kidName} is still waiting
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
              {rideLate.title}{rideLate.time ? ` · was ${fmtTime(rideLate.time)}` : ''}
            </Text>
          </View>
          <View style={{ backgroundColor: '#EF444420', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#EF4444' }}>
              {lateBy ? `${lateBy}m late` : `${waitedMin}m ago`}
            </Text>
          </View>
        </View>
      }>
      <View style={{ borderRadius: 12, padding: 10, gap: 6,
        backgroundColor: isDark ? colors.surface : '#FEF2F2',
        borderWidth: 1, borderColor: '#EF444425' }}>
        {[
          ['🚗', 'Driver', driverName ?? 'Nobody assigned'],
          ['📍', 'Pickup', pickup ?? '—'],
          ...(dropOff ? [['🏁', 'Drop-off', dropOff]] : []),
          ['🕒', 'Scheduled', rideLate.time ? fmtTime(rideLate.time) : '—'],
          ['⏱️', 'Waiting', `${waitedMin} min since ${kidName} raised it`],
        ].map(([icon, label, value]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 13 }}>{icon}</Text>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, width: 68 }}>{label}</Text>
            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => resolve(
          "On my way",
          `🚗 ${active.name.split(' ')[0]} is on the way to ${kidName} for "${rideLate.title}" — hang tight!`)}
          style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>🚗 I'm on my way</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/chat')}
          style={{ borderWidth: 1.5, borderColor: BRAND.teal + '60', borderRadius: 10,
            paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.teal }}>💬 Message</Text>
        </Pressable>
      </View>
      {ev && (
        <Pressable onPress={() => {
          updateEvent(ev.id, { isOpenToGrandparents: true, isOpenToTeens: true, helperStatus: undefined });
          resolve('Opened to other helpers',
            `🆘 ${kidName} needs a ride for "${rideLate.title}" — can anyone pick this up?`);
        }}
          style={{ borderWidth: 1.5, borderColor: BRAND.amber + '60', borderRadius: 10,
            paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber }}>
            🙋 Ask someone else to go
          </Text>
        </Pressable>
      )}
    </CollapsibleCard>
  );
}
