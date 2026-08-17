import { View, Text, Alert, Image, TouchableOpacity, Pressable } from 'react-native';
import { Camera, Coins } from 'lucide-react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { CollapsibleCard } from '../hubComponents';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

// A kid's submitted-for-review quest — photo proof (or a missing-proof
// warning), completion note, and the approve/decline decision.
export function QuestApprovalCard({ q, active, members, allNames, colors, isDark, approveQuest, declineQuest }: {
  q: Quest; active: FamilyMember; members: FamilyMember[]; allNames: string[];
  colors: any; isDark: boolean;
  approveQuest: (id: string, by: string) => void;
  declineQuest: (id: string, by: string, reason: string) => void;
}) {
  const kid = members.find(m => m.id === q.assignedToId);

  return (
    <CollapsibleCard flat accent={BRAND.purple} colors={colors} isDark={isDark} defaultExpanded
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Camera size={16} color={BRAND.purple} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }} numberOfLines={1}>
              Quest done — {q.title}
            </Text>
            {kid && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                  siblings={allNames} size={14} ringColor={BRAND.purple} ringWidth={1} />
                <Coins size={11} color={BRAND.amber} />
                <Text style={{ fontSize: TYPO.label, color: BRAND.purple, fontWeight: '600' }}>
                  {kid.name.split(' ')[0]} wants {q.coins} coins
                </Text>
              </View>
            )}
          </View>
          <View style={{ backgroundColor: BRAND.purple + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>Review</Text>
          </View>
        </View>
      }>
      {q.photoUrl ? (
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/(tabs)/quests', params: { questId: q.id } } as any)}
          style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
          <Image
            source={{ uri: q.photoUrl }}
            style={{ width: '100%', height: 140, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }}
            resizeMode="cover"
          />
          <View style={{ position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <Text style={{ fontSize: TYPO.micro, color: '#fff', fontWeight: '700' }}>Tap to enlarge</Text>
          </View>
        </TouchableOpacity>
      ) : q.photoRequired ? (
        <View style={{ borderRadius: 12, marginBottom: 10, padding: 10, alignItems: 'center', gap: 4,
          backgroundColor: isDark ? '#1C1200' : '#FFF7ED', borderWidth: 1, borderColor: '#FCD34D60' }}>
          <Text style={{ fontSize: TYPO.label, color: '#D97706', fontWeight: '700' }}>⚠️ Photo proof missing</Text>
        </View>
      ) : null}
      {q.completionNote ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 10 }}>
          "{q.completionNote}"
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => Alert.prompt(
            'Decline Quest',
            `Let ${kid?.name.split(' ')[0] ?? 'them'} know why "${q.title}" needs another try.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Decline', style: 'destructive', onPress: (reason: string | undefined) => declineQuest(q.id, active.id, reason?.trim() || 'Needs another try') },
            ],
            'plain-text',
          )}
          style={{ flex: 1, backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444440',
            paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#EF4444' }}>✕ Decline</Text>
        </Pressable>
        <Pressable onPress={() => approveQuest(q.id, active.id)}
          style={{ flex: 2, backgroundColor: BRAND.purple, paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Coins size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Approve & Pay {q.coins} Coins</Text>
        </Pressable>
      </View>
    </CollapsibleCard>
  );
}
