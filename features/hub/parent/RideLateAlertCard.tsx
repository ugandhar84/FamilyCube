import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, Car, MapPin, Flag, Clock, Hourglass, MessageCircle, HandHelping } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import { fmtTime } from '../hubUtils';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { RideLatePayload } from '../KidModals';

// Money-green — "I'm on my way" resolve accent, distinct from brand teal
// used elsewhere in this card (Message action). Not colors.success (which
// IS brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// "My driver hasn't arrived" — a stranded kid, not an approval decision.
// Everything the parent needs to judge the situation at a glance, plus a way
// to either take it themselves or throw it open to another helper.
export function RideLateAlertCard({ req, rideLate, kidName, ev, active, colors, isDark, approveRequest, updateEvent }: {
  req: any; rideLate: RideLatePayload; kidName: string; ev: FamilyEvent | undefined;
  active: FamilyMember; colors: any; isDark: boolean;
  approveRequest: (id: string, by: string, note?: string) => void;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => Promise<void>;
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
    <CollapsibleCard accent={colors.danger} colors={colors} isDark={isDark} defaultExpanded
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={22} color={colors.danger} fill={`${colors.danger}25`} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: colors.danger }}>
              {kidName} is still waiting
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
              {rideLate.title}{rideLate.time ? ` · was ${fmtTime(rideLate.time)}` : ''}
            </Text>
          </View>
          <View style={{ backgroundColor: `${colors.danger}20`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.danger }}>
              {lateBy ? `${lateBy}m late` : `${waitedMin}m ago`}
            </Text>
          </View>
        </View>
      }>
      <View style={{ borderRadius: 12, padding: 10, gap: 6,
        backgroundColor: isDark ? colors.surface : colors.dangerLight,
        borderWidth: 1, borderColor: `${colors.danger}25` }}>
        {[
          [Car, 'Driver', driverName ?? 'Nobody assigned'],
          [MapPin, 'Pickup', pickup ?? '—'],
          ...(dropOff ? [[Flag, 'Drop-off', dropOff]] : []),
          [Clock, 'Scheduled', rideLate.time ? fmtTime(rideLate.time) : '—'],
          [Hourglass, 'Waiting', `${waitedMin} min since ${kidName} raised it`],
        ].map(([Icon, label, value]: any) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon size={13} color={colors.textTertiary} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, width: 68 }}>{label}</Text>
            <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary }} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "I'm on my way" on "${rideLate.title}" (id=${req.id}) → resolve/approveRequest [features/hub/parent/RideLateAlertCard.tsx:81]`); resolve(
          "On my way",
          `🚗 ${active.name.split(' ')[0]} is on the way to ${kidName} for "${rideLate.title}" — hang tight!`); }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: MONEY_GREEN, borderRadius: 10, paddingVertical: 10 }}>
          <Car size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>I'm on my way</Text>
        </Pressable>
        <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Message" on "${rideLate.title}" (id=${req.id}) → router.push /(tabs)/chat [features/hub/parent/RideLateAlertCard.tsx:88]`); router.push('/(tabs)/chat'); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.parent + '60', borderRadius: 10,
            paddingVertical: 10, paddingHorizontal: 14 }}>
          <MessageCircle size={14} color={colors.parent} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.parent }}>Message</Text>
        </Pressable>
      </View>
      {ev && (
        <Pressable onPress={() => {
          console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Ask someone else to go" on "${rideLate.title}" (id=${req.id}) → updateEvent(openToGrandparents/openToTeens) + resolve [features/hub/parent/RideLateAlertCard.tsx:96]`);
          // Was helperStatus-only — a driverName-paired late ride (the
          // driverName/driverStatus field pair, distinct from helper/
          // helperStatus) never got its status cleared here, leaving a
          // stale 'confirmed'/'pending' driverStatus behind even though the
          // ride was just reopened to the pool. Clear both pairs
          // symmetrically; harmless for whichever pair the event doesn't
          // actually use (it's already unset).
          updateEvent(ev.id, { isOpenToGrandparents: true, isOpenToTeens: true, helperStatus: undefined, driverStatus: undefined });
          resolve('Opened to other helpers',
            `🆘 ${kidName} needs a ride for "${rideLate.title}" — can anyone pick this up?`);
        }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.warning + '60', borderRadius: 10,
            paddingVertical: 10 }}>
          <HandHelping size={14} color={colors.warning} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.warning }}>
            Ask someone else to go
          </Text>
        </Pressable>
      )}
    </CollapsibleCard>
  );
}
