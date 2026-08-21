import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import {
  X, AlertTriangle, Clock, RotateCcw, PartyPopper, ThumbsUp, CheckCircle2, XCircle, Car,
} from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';
import CelebrationBurst from '@/components/CelebrationBurst';
import { fmtTime, hoursUntilEvent } from '../hubUtils';
import type { FamilyMember } from '@/store/familyStore';
import { eventAssignee } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { Quest, QuestCheer } from '@/store/questStore';

// Money-green — "quest approved" positive accent, distinct from brand teal.
// Not colors.success (which IS brand teal in this app) — kept as one
// local constant.
const MONEY_GREEN = '#10B981';

// A dismissible alert row — the shared shape every alert type below uses. A
// filled, colored icon badge reads more like a native app than an emoji
// glyph and stays crisp at any size; kept for functional/status icons, while
// genuinely celebratory moments (🎉 PartyPopper) still get to feel festive.
function AlertRow({ Icon, accent, colors, isDark, title, detail, onPress, onDismiss }: {
  Icon: typeof AlertTriangle; accent: string; colors: any; isDark: boolean; title: string; detail: string;
  onPress?: () => void; onDismiss: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={{ borderRadius: 16, backgroundColor: isDark ? colors.card : accent + '08',
      borderWidth: 1.5, borderColor: accent + '35', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={accent} fill={accent} fillOpacity={0.15} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: KID.body, fontWeight: '900', color: accent }}>{title}</Text>
        <Text style={{ fontSize: KID.sub, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>{detail}</Text>
      </View>
      <Pressable onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <X size={16} color={colors.textTertiary} />
      </Pressable>
    </Wrapper>
  );
}

export function KidUrgentAlerts({
  confirmedRide, rideCountdown, lateNudgeSent, onSendDriverLate,
  declinedRides, pendingRides, declinedQuests, approvedQuests, cheersForMe, recentReplies,
  members, colors, isDark, dismissedIds, onDismiss,
}: {
  confirmedRide: FamilyEvent | undefined; rideCountdown: number | null;
  lateNudgeSent: Record<string, boolean>; onSendDriverLate: (ev: FamilyEvent) => void;
  declinedRides: FamilyEvent[]; pendingRides: FamilyEvent[];
  declinedQuests: Quest[]; approvedQuests: Quest[];
  cheersForMe: { quest: Quest; cheer: QuestCheer }[];
  recentReplies: any[];
  members: FamilyMember[]; colors: any; isDark: boolean;
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
}) {
  return (
    <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 4 }}>
      {confirmedRide && rideCountdown !== null && rideCountdown < -5 && (
        <Pressable onPress={() => onSendDriverLate(confirmedRide)}
          style={{ borderRadius: 16, backgroundColor: '#450A0A', borderWidth: 2, borderColor: '#EF4444',
            padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EF444430', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} color="#FCA5A5" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: KID.body, fontWeight: '900', color: '#FCA5A5' }}>Driver hasn't arrived!</Text>
            <Text style={{ fontSize: KID.sub, color: '#F87171' }}>{eventAssignee(confirmedRide).name?.split(' ')[0] ?? 'Your ride'} was due at {fmtTime(confirmedRide.time)}</Text>
          </View>
          <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ fontSize: KID.sub, fontWeight: '900', color: '#fff' }}>{lateNudgeSent[confirmedRide.id] ? 'Sent ✓' : 'Alert!'}</Text>
          </View>
        </Pressable>
      )}

      {declinedRides.filter(ev => !dismissedIds.has(`ride-${ev.id}`)).map(ev => (
        <AlertRow key={ev.id} Icon={Car} accent={colors.danger} colors={colors} isDark={isDark}
          title={`No driver — ${ev.title}`}
          detail={ev.declinedBy ? `${ev.declinedBy} can't make it` : 'Your parent is finding someone'}
          onDismiss={() => onDismiss(`ride-${ev.id}`)} />
      ))}

      {pendingRides.filter(ev => !dismissedIds.has(`pending-${ev.id}`)).map(ev => {
        // Parent's own Hub escalates an unassigned ride once it's <2hr away
        // (ParentView.tsx's unassignedUrgent) — this alert rendered every
        // pending ride identically regardless of how soon it was, so the
        // assigned kid had no urgency signal at all for their own ride
        // getting close, unlike both parents (QA Round 19, Medium).
        const h = hoursUntilEvent(ev.date, ev.time);
        const isUrgent = h >= 0 && h < 2;
        return (
          <AlertRow key={ev.id} Icon={isUrgent ? AlertTriangle : Clock} accent={isUrgent ? colors.danger : BRAND.amber} colors={colors} isDark={isDark}
            title={isUrgent ? 'Still no driver — getting close!' : 'Waiting on driver…'}
            detail={`${ev.title} · ${fmtTime(ev.time)}`}
            onDismiss={() => onDismiss(`pending-${ev.id}`)} />
        );
      })}

      {declinedQuests.filter(q => !dismissedIds.has(`quest-${q.id}`)).map(q => {
        const note = q.history?.slice().reverse().find((h: any) => h.action === 'declined')?.note;
        return (
          <AlertRow key={q.id} Icon={RotateCcw} accent={BRAND.purple} colors={colors} isDark={isDark}
            title="Quest sent back" detail={note ? `"${note}"` : q.title}
            onPress={() => { router.push({ pathname: '/(tabs)/quests', params: { questId: q.id } } as any); onDismiss(`quest-${q.id}`); }}
            onDismiss={() => onDismiss(`quest-${q.id}`)} />
        );
      })}

      {approvedQuests.filter(q => !dismissedIds.has(`quest-approved-${q.id}`)).map(q => (
        <AlertRow key={`approved-${q.id}`} Icon={PartyPopper} accent={MONEY_GREEN} colors={colors} isDark={isDark}
          title="Quest approved!" detail={`${q.title} · +${q.coins} coins`}
          onPress={() => { router.push({ pathname: '/(tabs)/quests', params: { questId: q.id } } as any); onDismiss(`quest-approved-${q.id}`); }}
          onDismiss={() => onDismiss(`quest-approved-${q.id}`)} />
      ))}

      {cheersForMe.filter(({ quest, cheer }) => !dismissedIds.has(`cheer-${quest.id}-${cheer.memberId}`)).map(({ quest, cheer }) => {
        const cheerer = members.find(m => m.id === cheer.memberId);
        const key = `cheer-${quest.id}-${cheer.memberId}`;
        return (
          <View key={key} style={{ position: 'relative' }}>
            <CelebrationBurst visible />
            <AlertRow Icon={PartyPopper} accent={BRAND.purple} colors={colors} isDark={isDark}
              title={`${cheerer?.name?.split(' ')[0] ?? 'Someone'} cheered for you!`}
              detail={`${quest.title}${cheer.coins ? ` · +${cheer.coins} bonus 🪙` : ''}`}
              onDismiss={() => onDismiss(key)} />
          </View>
        );
      })}

      {recentReplies.map(r => {
        const approved = r.status === 'approved';
        const isCheckin = r.type === 'checkin';
        const isTutorOrCheer = r.type === 'tutor' || r.type === 'cheer';
        const accent = isCheckin ? BRAND.teal : approved ? MONEY_GREEN : colors.danger;
        const ReplyIcon = isCheckin ? ThumbsUp : approved ? CheckCircle2 : XCircle;
        const label = isCheckin ? 'Seen!' : approved ? 'Yes!' : 'No';
        const typeLabel = isCheckin ? 'Check-in' : r.type === 'medication' ? 'Medical' : r.type === 'permission' ? 'Permission'
          : r.type === 'tutor' ? 'Tutor Offer' : r.type === 'cheer' ? 'Cheer' : 'Question';
        const responder = r.respondedBy ? members.find(m => m.id === r.respondedBy) : null;
        const responderName = responder ? responder.name.split(' ')[0] : 'Parent';
        let timeAgo = '';
        if (r.respondedAt) {
          const diffMins = Math.floor((Date.now() - new Date(r.respondedAt).getTime()) / 60000);
          timeAgo = diffMins < 60 ? `${diffMins}m ago` : diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` : `${Math.floor(diffMins / 1440)}d ago`;
        }
        return (
          <View key={r.id} style={{ borderRadius: 16, backgroundColor: isDark ? colors.card : accent + '08',
            borderWidth: 1.5, borderColor: accent + '35', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
              <ReplyIcon size={17} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: KID.body, fontWeight: '900', color: accent }}>{label} — {typeLabel}</Text>
              <Text style={{ fontSize: KID.tiny, color: colors.textTertiary, marginTop: 2 }}>
                {responderName}{timeAgo && ` · ${timeAgo}`}
              </Text>
              <Text style={{ fontSize: KID.sub, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>"{r.detail}"</Text>
              {r.parentNote ? (
                <Text style={{ fontSize: KID.sub, color: accent, fontStyle: 'italic', marginTop: 4 }}>Parent: "{r.parentNote}"</Text>
              ) : null}
            </View>
            <Pressable onPress={() => onDismiss(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
