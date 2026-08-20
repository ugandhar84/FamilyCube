import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import CelebrationBurst from '@/components/CelebrationBurst';
import { TYPO } from '@/constants/theme';
import { fmtDateTime, withinLast24h } from '@/lib/dates';
import type { Quest } from '@/store/questStore';
import { s } from './questCardStyles';

interface Props {
  quests: Quest[];
  members: any[];
  myId?: string;
  celebratingId: string | null;
  setCelebratingId: (id: string | null) => void;
  cheerQuest: (id: string, memberId: string) => void;
  cardBg: string;
  cardBord: string;
  colors: any;
}

// ── Sibling Cheer Panel — kid/teen only ──
export function SiblingCheerPanel({ quests, members, myId, celebratingId, setCelebratingId, cheerQuest, cardBg, cardBord, colors }: Props) {
  const pendingKidQuests = quests.filter(q =>
    q.status === 'pending_approval' && !q.isAdultTask &&
    q.assignedToId && q.assignedToId !== myId &&
    !members.find(m => m.id === q.assignedToId && (m.role === 'parent' || m.role === 'senior')) &&
    !(q.cheers ?? []).some(c => c.memberId === myId)
  );
  const doneKidQuests = quests.filter(q =>
    (q.status === 'approved' || q.status === 'done') && !q.isAdultTask &&
    q.assignedToId && q.assignedToId !== myId &&
    !members.find(m => m.id === q.assignedToId && (m.role === 'parent' || m.role === 'senior')) &&
    // Matches KidView.tsx's siblingCheerable 24h window — this panel and
    // the Hub's Cheer Squad section previously disagreed on which sibling
    // quests were still cheerable, since this one had no time bound at all.
    withinLast24h(q.approvedAt ?? q.completedAt) &&
    !(q.cheers ?? []).some(c => c.memberId === myId)
  ).slice(0, 5);

  return (
    <View style={{ paddingHorizontal: 14, gap: 10 }}>
      {pendingKidQuests.length > 0 && (
        <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBord }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Text style={{ fontSize: 16 }}>📬</Text>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Awaiting Review</Text>
            <View style={{ marginLeft: 'auto', backgroundColor: colors.primary + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.primary }}>{pendingKidQuests.length}</Text>
            </View>
          </View>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 10 }}>
            These quests are submitted — send a cheer while the parent reviews!
          </Text>
          {pendingKidQuests.map(q => {
            const kid = members.find(m => m.id === q.assignedToId);
            return (
              <View key={q.id} style={{ position: 'relative' }}>
                {/* Cheer fires after the burst finishes — the store update removes
                    this row from the list, so it must outlive the animation. */}
                <CelebrationBurst visible={celebratingId === q.id}
                  onDone={() => { cheerQuest(q.id, myId ?? ''); setCelebratingId(null); }} />
                <View style={[s.cheerRow, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
                      {kid?.emoji ?? '🧒'} {q.title}
                    </Text>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
                      {kid?.name ?? 'Kid'} submitted · {q.coins > 0 ? `${q.coins}🪙` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity disabled={celebratingId === q.id}
                    style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8, opacity: celebratingId === q.id ? 0.6 : 1 }}
                    onPress={() => setCelebratingId(q.id)}
                  >
                    <Text style={{ color: colors.textInverse, fontSize: TYPO.caption, fontWeight: '800' }}>🎉 Cheer!</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {doneKidQuests.length > 0 && (
        <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBord }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Text style={{ fontSize: 16 }}>🏆</Text>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Recently Completed</Text>
          </View>
          {doneKidQuests.map(q => {
            const kid = members.find(m => m.id === q.assignedToId);
            return (
              <View key={q.id} style={{ position: 'relative' }}>
                <CelebrationBurst visible={celebratingId === q.id}
                  onDone={() => { cheerQuest(q.id, myId ?? ''); setCelebratingId(null); }} />
                <View style={[s.cheerRow, { backgroundColor: colors.successLight, borderColor: colors.success + '30' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
                      {kid?.emoji ?? '🧒'} {q.title}
                    </Text>
                    <Text style={{ fontSize: TYPO.caption, color: colors.success, marginTop: 2 }}>
                      ✅ {kid?.name ?? 'Kid'} earned {q.coins > 0 ? `+${q.coins}🪙` : 'it'}!
                    </Text>
                    <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
                      {fmtDateTime(q.approvedAt ?? q.completedAt)}
                    </Text>
                  </View>
                  <TouchableOpacity disabled={celebratingId === q.id}
                    style={{ backgroundColor: colors.success, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8, opacity: celebratingId === q.id ? 0.6 : 1 }}
                    onPress={() => setCelebratingId(q.id)}
                  >
                    <Text style={{ color: colors.textInverse, fontSize: TYPO.caption, fontWeight: '800' }}>🖐️ High Five!</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {pendingKidQuests.length === 0 && doneKidQuests.length === 0 && (
        <View style={[s.emptyBox, { backgroundColor: cardBg, borderColor: cardBord }]}>
          <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>🌟</Text>
          <Text style={[s.emptyText, { color: colors.textTertiary, textAlign: 'center' }]}>
            No quests to cheer yet — check back when the kids get busy!
          </Text>
        </View>
      )}
    </View>
  );
}
