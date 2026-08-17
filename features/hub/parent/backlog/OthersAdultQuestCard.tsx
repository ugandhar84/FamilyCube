import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { ChevronUp, ChevronDown, MessageCircle, ArrowRightLeft } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { useChoreStore } from '@/store/choreStore';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

// Read-only view of a task assigned to a co-parent — nudge them in family
// chat, or reclaim it for yourself if it's stalled.
export function OthersAdultQuestCard({ q, active, members, colors, isDark, updateQuest }: {
  q: Quest; active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  updateQuest: (id: string, patch: Partial<Quest>) => void;
}) {
  const [isExp, setExp] = useState(false);
  const assignee   = members.find(m => m.id === q.assignedToId);
  const choreData  = useChoreStore(s => s.chores.find(c => c.id === q.id));
  const si         = choreData?.shoppingItems ?? (q as any).shoppingItems;
  const ss         = choreData?.shoppingStore ?? (q as any).shoppingStore;
  const hasDetail  = q.description || si?.length > 0 || ss || q.dueDate;
  const isGPOpen   = !!(choreData?.openToGP ?? (q as any).openToGP);

  const sendNudge = () => {
    const msg = `👋 Hey ${assignee?.name?.split(' ')[0] ?? 'partner'}, just a nudge — "${q.title}" is still open. Need any help?`;
    useChatStore.getState().sendMessage('all', active.id, msg);
    Alert.alert('Nudge sent!', `A reminder was posted to family chat for ${assignee?.name ?? 'your partner'}.`);
  };

  const reclaim = () => Alert.alert(
    'Reclaim task',
    `Reassign "${q.title}" to yourself?`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reclaim', onPress: () => updateQuest(q.id, { assignedToId: active.id }) },
    ]
  );

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1.5, borderColor: BRAND.amber + '50',
      backgroundColor: isDark ? BRAND.amber + '08' : '#FFFBEB', overflow: 'hidden',
    }}>
      <Pressable onPress={() => hasDetail && setExp(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {si?.length > 0 && <Text style={{ fontSize: 13 }}>🛍️</Text>}
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
              {q.title}
            </Text>
          </View>
          <Text style={{ fontSize: TYPO.label, color: BRAND.amber, marginTop: 2, fontWeight: '600' }}>
            → {assignee?.name ?? 'Partner'}{q.dueDate ? ` · Due ${q.dueDate}` : ''}
          </Text>
          {si?.length > 0 && !isExp && (
            <Text style={{ fontSize: TYPO.micro, color: isDark ? '#2DD4BF' : '#0D9488', marginTop: 2 }}>
              {si.length} item{si.length !== 1 ? 's' : ''}{ss ? ` · ${ss}` : ''}
            </Text>
          )}
        </View>
        {hasDetail ? (isExp
          ? <ChevronUp size={14} color={colors.textTertiary} />
          : <ChevronDown size={14} color={colors.textTertiary} />
        ) : null}
      </Pressable>

      {isExp && (
        <View style={{ borderTopWidth: 1, borderTopColor: BRAND.amber + '30', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 8 }}>
          {q.description ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{q.description}</Text>
          ) : null}
          {si?.length > 0 && (
            <View style={{ borderRadius: 10, borderWidth: 1,
              borderColor: isDark ? BRAND.teal + '40' : '#99F6E4',
              backgroundColor: isDark ? BRAND.teal + '10' : '#F0FDFA', overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 10, paddingVertical: 7,
                borderBottomWidth: 1, borderBottomColor: isDark ? BRAND.teal + '30' : '#99F6E4' }}>
                <Text style={{ fontSize: 12 }}>🛍️</Text>
                <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: isDark ? '#2DD4BF' : '#0D9488' }}>
                  {ss ? `Shop at ${ss}` : 'Shopping List'}
                </Text>
              </View>
              {si.map((item: string, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 10, paddingVertical: 6,
                  borderBottomWidth: i < si.length - 1 ? 1 : 0,
                  borderBottomColor: isDark ? BRAND.teal + '20' : '#CCFBF1' }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5,
                    borderColor: isDark ? '#2DD4BF' : '#0D9488' }} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textPrimary }}>{item}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {si?.length > 0 && (
        <Pressable onPress={() => useChoreStore.getState().updateChore(q.id, { openToGP: !isGPOpen })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 7,
            marginHorizontal: 12, marginBottom: 6, padding: 8, borderRadius: 10,
            backgroundColor: isGPOpen ? (isDark ? '#14291a' : '#DCFCE7') : (isDark ? colors.surface2 : '#F8FAFC'),
            borderWidth: 1, borderColor: isGPOpen ? '#22c55e' : (isDark ? colors.border : '#E2E8F0') }}>
          <Text style={{ fontSize: 13 }}>👴</Text>
          <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700',
            color: isGPOpen ? '#22c55e' : colors.textSecondary }}>
            {isGPOpen ? 'GP Welcome — can buy & scan receipt' : 'Offer to GP (buy supplies + receipt scan)'}
          </Text>
          <Text style={{ fontSize: 11 }}>{isGPOpen ? '✅' : '○'}</Text>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 }}>
        <Pressable onPress={sendNudge}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            backgroundColor: isDark ? '#1C1000' : '#FEF3C7',
            borderWidth: 1.5, borderColor: BRAND.amber + '60',
            borderRadius: 10, paddingVertical: 8 }}>
          <MessageCircle size={13} color={BRAND.amber} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber }}>Nudge</Text>
        </Pressable>
        <Pressable onPress={reclaim}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            backgroundColor: BRAND.purple + '18',
            borderWidth: 1.5, borderColor: BRAND.purple + '50',
            borderRadius: 10, paddingVertical: 8 }}>
          <ArrowRightLeft size={13} color={BRAND.purple} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>Reclaim</Text>
        </Pressable>
      </View>
    </View>
  );
}
