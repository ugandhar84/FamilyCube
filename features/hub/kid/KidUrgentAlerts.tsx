import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import CelebrationBurst from '@/components/CelebrationBurst';
import { fmtTime } from '../hubUtils';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { Quest, QuestCheer } from '@/store/questStore';

// A dismissible alert row — the shared shape every alert type below uses.
function AlertRow({ emoji, accent, colors, isDark, title, detail, onPress, onDismiss }: {
  emoji: string; accent: string; colors: any; isDark: boolean; title: string; detail: string;
  onPress?: () => void; onDismiss: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={{ borderRadius: 16, backgroundColor: isDark ? colors.card : accent + '08',
      borderWidth: 1.5, borderColor: accent + '35', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <Text style={{ fontSize: 22, marginTop: 1 }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: accent }}>{title}</Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>{detail}</Text>
      </View>
      <Pressable onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ fontSize: 14, color: colors.textTertiary }}>✕</Text>
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
          <Text style={{ fontSize: 26 }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '900', color: '#FCA5A5' }}>Driver hasn't arrived!</Text>
            <Text style={{ fontSize: 12, color: '#F87171' }}>{confirmedRide.helper?.split(' ')[0]} was due at {fmtTime(confirmedRide.time)}</Text>
          </View>
          <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>{lateNudgeSent[confirmedRide.id] ? 'Sent ✓' : 'Alert!'}</Text>
          </View>
        </Pressable>
      )}

      {declinedRides.filter(ev => !dismissedIds.has(`ride-${ev.id}`)).map(ev => (
        <AlertRow key={ev.id} emoji="❌" accent="#EF4444" colors={colors} isDark={isDark}
          title={`No driver — ${ev.title}`}
          detail={ev.declinedBy ? `${ev.declinedBy} can't make it` : 'Your parent is finding someone'}
          onDismiss={() => onDismiss(`ride-${ev.id}`)} />
      ))}

      {pendingRides.filter(ev => !dismissedIds.has(`pending-${ev.id}`)).map(ev => (
        <AlertRow key={ev.id} emoji="⏳" accent={BRAND.amber} colors={colors} isDark={isDark}
          title="Waiting on driver…" detail={`${ev.title} · ${fmtTime(ev.time)}`}
          onDismiss={() => onDismiss(`pending-${ev.id}`)} />
      ))}

      {declinedQuests.filter(q => !dismissedIds.has(`quest-${q.id}`)).map(q => {
        const note = q.history?.slice().reverse().find((h: any) => h.action === 'declined')?.note;
        return (
          <AlertRow key={q.id} emoji="🔄" accent={BRAND.purple} colors={colors} isDark={isDark}
            title="Quest sent back" detail={note ? `"${note}"` : q.title}
            onPress={() => { router.push({ pathname: '/(tabs)/quests', params: { questId: q.id } } as any); onDismiss(`quest-${q.id}`); }}
            onDismiss={() => onDismiss(`quest-${q.id}`)} />
        );
      })}

      {approvedQuests.filter(q => !dismissedIds.has(`quest-approved-${q.id}`)).map(q => (
        <AlertRow key={`approved-${q.id}`} emoji="🎉" accent="#059669" colors={colors} isDark={isDark}
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
            <AlertRow emoji="🥳" accent={BRAND.purple} colors={colors} isDark={isDark}
              title={`${cheerer?.name?.split(' ')[0] ?? 'Someone'} cheered for you!`}
              detail={`${quest.title}${cheer.coins ? ` · +${cheer.coins} bonus 🪙` : ''}`}
              onDismiss={() => onDismiss(key)} />
          </View>
        );
      })}

      {recentReplies.map(r => {
        const approved = r.status === 'approved';
        const isCheckin = r.type === 'checkin';
        const accent = isCheckin ? BRAND.teal : approved ? '#10B981' : '#EF4444';
        const icon = isCheckin ? '👍' : approved ? '✅' : '❌';
        const label = isCheckin ? 'Seen!' : approved ? 'Yes!' : 'No';
        const typeLabel = isCheckin ? 'Check-in' : r.type === 'medication' ? 'Medical' : r.type === 'permission' ? 'Permission' : 'Question';
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
            <Text style={{ fontSize: 22, marginTop: 1 }}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: accent }}>{label} — {typeLabel}</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>
                {responderName}{timeAgo && ` · ${timeAgo}`}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>"{r.detail}"</Text>
              {r.parentNote ? (
                <Text style={{ fontSize: 11, color: accent, fontStyle: 'italic', marginTop: 4 }}>Parent: "{r.parentNote}"</Text>
              ) : null}
            </View>
            <Pressable onPress={() => onDismiss(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 14, color: colors.textTertiary }}>✕</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
