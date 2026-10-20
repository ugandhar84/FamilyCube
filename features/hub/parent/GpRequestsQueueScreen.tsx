/**
 * GpRequestsQueueScreen — the Review inbox's "Grandparent requests" page: everything a grandparent has asked a parent to decide, plus how
 * earlier requests ended.
 *  - Ride requests: a ride a grandparent needs, until a driver confirms. "I'll drive" confirms you straight away; tapping the card opens
 *    the event (reassign, can't make it, history).
 *  - Chores a grandparent wants to sponsor (safety review) and offers to handle an errand, with the usual approve / decline cards.
 *  - History: recent rides and recently decided sponsored chores.
 */
import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeartHandshake, Car, MapPin, CalendarDays } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useChoreStore } from '@/store/choreStore';
import { useEventStore, type FamilyEvent } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { useKidRequestStore, REQUEST_META } from '@/store/kidRequestStore';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { OverlayHeading } from '@/components/OverlayPage';
import EventDetailScreen from '@/features/calendar/components/EventDetailScreen';
import { fmtHumanDateShort, fmtTime } from '../hubUtils';
import { GpSafetyReviewCard } from './ChoreReviewSection';
import { GpOfferReviewCard } from './GpOfferReviewCard';
import { useGpRideRequests, type GpRideRow } from './useGpRideRequests';

export function GpRequestsQueueScreen({ onClose, onOpenRequest }: { onClose: () => void; onOpenRequest?: (id: string) => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const chores = useChoreStore(s => s.chores);
  const approveGrandparentQuestAsParent = useChoreStore(s => s.approveGrandparentQuestAsParent);
  const declineGrandparentQuestAsParent = useChoreStore(s => s.declineGrandparentQuestAsParent);
  const acceptGPOffer = useChoreStore(s => s.acceptGPOffer);
  const declineGPOffer = useChoreStore(s => s.declineGPOffer);
  const { members, activeMemberId } = useFamilyStore();
  const active = members.find(m => m.id === activeMemberId);
  const { pending: rides, history: pastRides, reload } = useGpRideRequests((active as any)?.familyId);
  const [detailEv, setDetailEv] = useState<FamilyEvent | null>(null);
  const [driving, setDriving] = useState<string | null>(null);

  const sponsored = chores.filter(c => c.categoryType === 'grandparent_quest' && c.status === 'pending_parent_approval');
  const offers = chores.filter(c => c.status === 'gp_offer_pending');
  const decided = chores.filter(c => c.categoryType === 'grandparent_quest' && ['approved', 'declined', 'in_progress', 'completed', 'auto_approved'].includes(c.status)).slice(0, 8);
  // SOS and other requests sent by a grandparent (they travel through the same request table as the kids' requests).
  const allRequests = useKidRequestStore(s => s.requests);
  const gpIds = new Set(members.filter(m => m.role === 'senior').map(m => m.id));
  const gpRequests = allRequests.filter(r => gpIds.has(r.fromMemberId));
  const gpPending = gpRequests.filter(r => r.status === 'pending');
  const gpPast = gpRequests.filter(r => r.status !== 'pending').slice(0, 8);
  const total = rides.length + sponsored.length + offers.length + gpPending.length;
  const canvas = isDark ? '#0E0C13' : GEMINI.canvas;
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const shadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const label = { fontSize: 11 as const, fontWeight: '800' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: colors.textTertiary };
  const body = isDark ? colors.textSecondary : GEMINI.bodyColor;
  const title = isDark ? colors.textPrimary : GEMINI.titleColor;

  const rideStatus = (r: GpRideRow) =>
    !r.assigneeName ? { text: 'Needs a driver', color: colors.danger }
    : r.assigneeStatus === 'rejected' ? { text: `${r.assigneeName} can't drive`, color: colors.danger }
    : { text: `${r.assigneeName} · waiting to confirm`, color: colors.amber };

  const driveIt = async (r: GpRideRow) => {
    if (!active) return;
    setDriving(r.ev.id);
    try { await useEventStore.getState().reassignEvent(r.ev.id, active.id, 'driver', active.id); await reload(); } finally { setDriving(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <OverlayHeading eyebrow="FAMILY CUBE · REVIEW" title="Grandparent requests" subtitle={total > 0 ? `${total} waiting on you` : 'All caught up'}
        accent="sky" Icon={HeartHandshake} onTitlePress={onClose} topInset={insets.top} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, gap: RHYTHM.section, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {total === 0 && (
          <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: RHYTHM.card, ...shadow }}>
            <Text style={{ fontSize: 15, color: body, lineHeight: 22 }}>No grandparent requests right now.</Text>
          </View>
        )}

        {gpPending.length > 0 && (
          <View style={{ gap: RHYTHM.item }}>
            <Text style={label}>SOS and requests</Text>
            {gpPending.map(r => {
              const meta = REQUEST_META[r.type];
              const who = members.find(m => m.id === r.fromMemberId)?.name ?? 'Grandparent';
              const urgent = r.urgency === 'emergency';
              return (
                <Pressable key={r.id} onPress={() => onOpenRequest?.(r.id)} accessibilityRole="button" accessibilityLabel={`${meta?.label ?? 'Request'} from ${who}`}
                  style={{ backgroundColor: urgent ? colors.dangerLight : cardBg, borderRadius: 18, padding: RHYTHM.card, gap: 6, ...shadow }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: title }}>{meta?.emoji ?? '📣'} {urgent ? 'Emergency SOS' : (meta?.label ?? 'Request')} · {who.split(' ')[0]}</Text>
                  {!!r.detail && <Text style={{ fontSize: 14, color: body }} numberOfLines={3}>{r.detail}</Text>}
                  {!!r.location && <Text style={{ fontSize: 14, fontWeight: '600', color: body }}>📍 {r.location}</Text>}
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>Open →</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {rides.length > 0 && (
          <View style={{ gap: RHYTHM.item }}>
            <Text style={label}>Ride requests</Text>
            {rides.map(r => {
              const st = rideStatus(r);
              return (
                <Pressable key={r.ev.id} onPress={() => setDetailEv(r.ev)} accessibilityRole="button" accessibilityLabel={r.ev.title}
                  style={{ backgroundColor: cardBg, borderRadius: 18, padding: RHYTHM.card, gap: 10, ...shadow }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.skyLight }}>
                      <Car size={22} color={colors.sky} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: title }} numberOfLines={2}>{r.ev.title}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: st.color, marginTop: 2 }}>{st.text}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CalendarDays size={14} color={colors.textTertiary} />
                    <Text style={{ fontSize: 13, color: body }}>{fmtHumanDateShort(r.ev.date)}{r.ev.time ? ` · ${fmtTime(r.ev.time)}` : ''}</Text>
                  </View>
                  {!!r.ev.location && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MapPin size={14} color={colors.textTertiary} />
                      <Text style={{ fontSize: 13, color: body }} numberOfLines={1}>{r.ev.location.split(',')[0]}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: RHYTHM.item }}>
                    <Pressable onPress={() => setDetailEv(r.ev)} style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: title }}>Details</Text>
                    </Pressable>
                    <Pressable disabled={driving === r.ev.id} onPress={() => driveIt(r)} style={{ flex: 1.4, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: driving === r.ev.id ? 0.6 : 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textInverse }}>{driving === r.ev.id ? 'Confirming…' : "I'll drive"}</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {sponsored.length > 0 && active && (
          <View style={{ gap: RHYTHM.item }}>
            <Text style={label}>Chores to sponsor, safety review</Text>
            {sponsored.map(c => (
              <GpSafetyReviewCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                approveGrandparentQuestAsParent={approveGrandparentQuestAsParent} declineGrandparentQuestAsParent={declineGrandparentQuestAsParent} />
            ))}
          </View>
        )}
        {offers.length > 0 && active && (
          <View style={{ gap: RHYTHM.item }}>
            <Text style={label}>Offers to help</Text>
            {offers.map(c => (
              <GpOfferReviewCard key={c.id} c={c} members={members} colors={colors} isDark={isDark} active={active}
                acceptGPOffer={acceptGPOffer} declineGPOffer={declineGPOffer} />
            ))}
          </View>
        )}

        {(pastRides.length > 0 || decided.length > 0 || gpPast.length > 0) && (
          <View style={{ gap: RHYTHM.item }}>
            <Text style={label}>History</Text>
            <View style={{ backgroundColor: cardBg, borderRadius: 18, padding: RHYTHM.card, gap: 12, ...shadow }}>
              {pastRides.map(r => (
                <Pressable key={r.ev.id} onPress={() => setDetailEv(r.ev)} style={{ gap: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: title }} numberOfLines={1}>{r.ev.title}</Text>
                  <Text style={{ fontSize: 13, color: body }}>Ride · {fmtHumanDateShort(r.ev.date)}{r.assigneeName ? ` · ${r.assigneeName} ${r.assigneeStatus === 'confirmed' ? 'drove' : 'was asked'}` : ' · no driver'}</Text>
                </Pressable>
              ))}
              {gpPast.map(r => (
                <Pressable key={r.id} onPress={() => onOpenRequest?.(r.id)} style={{ gap: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: title }} numberOfLines={1}>{REQUEST_META[r.type]?.label ?? 'Request'} · {r.detail}</Text>
                  <Text style={{ fontSize: 13, color: body }}>Request · {r.status === 'declined' ? 'Declined' : r.status === 'cancelled' ? 'Cancelled' : 'Handled'}</Text>
                </Pressable>
              ))}
              {decided.map(c => (
                <View key={c.id} style={{ gap: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: title }} numberOfLines={1}>{c.title}</Text>
                  <Text style={{ fontSize: 13, color: body }}>Sponsored chore · {c.status === 'declined' ? 'Declined' : c.status === 'completed' || c.status === 'approved' ? 'Done' : 'Approved'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
      {detailEv && (
        <EventDetailScreen ev={detailEv} onClose={() => { setDetailEv(null); reload(); }}
          onDelete={async (id) => { await useEventStore.getState().deleteEvent(id); setDetailEv(null); reload(); }} />
      )}
    </View>
  );
}
