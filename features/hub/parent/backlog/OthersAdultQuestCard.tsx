import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { ChevronUp, ChevronDown, MessageCircle, ArrowRightLeft, ShoppingBag, HeartHandshake, CheckCircle2 } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useChoreStore } from '@/store/choreStore';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';
import type { Quest } from '@/store/questStore';

// Confirmed-green — "GP Welcome" toggle accent, distinct from brand teal
// used elsewhere in this card. Not colors.success (which IS brand teal in
// this app) — kept as one local constant.
const GP_GREEN = '#22c55e';

// Read-only view of a task assigned to a co-parent — nudge them in family
// chat, or reclaim it for yourself if it's stalled.
export function OthersAdultQuestCard({ q, active, members, colors, isDark, updateQuest, onLongPress }: {
  q: Quest; active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
  updateQuest: (id: string, patch: Partial<Quest>) => void;
  // Optional — only the Chores tab wires this (edit-quest flow); Household
  // Backlog has no separate edit modal for this card today.
  onLongPress?: () => void;
}) {
  const [isExp, setExp] = useState(false);
  const assignee   = members.find(m => m.id === q.assignedToId);
  const choreData  = useChoreStore(s => s.chores.find(c => c.id === q.id));
  const si         = choreData?.shoppingItems ?? (q as any).shoppingItems;
  const ss         = choreData?.shoppingStore ?? (q as any).shoppingStore;
  const hasDetail  = q.description || si?.length > 0 || ss || q.dueDate || (q as any).createdAt || q.claimedAt;
  const isGPOpen   = !!(choreData?.openToGP ?? (q as any).openToGP);

  const sendNudge = () => {
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Nudge" on "${q.title}" assigned to ${assignee?.name ?? 'partner'} (id=${q.id}) → sendMessage [features/hub/parent/backlog/OthersAdultQuestCard.tsx:32]`);
    const msg = `👋 Hey ${assignee?.name?.split(' ')[0] ?? 'partner'}, just a nudge — "${q.title}" is still open. Need any help?`;
    useChatStore.getState().sendMessage(assignee?.id ?? 'all', active.id, msg);
    Alert.alert('Nudge sent!', `A reminder was sent directly to ${assignee?.name ?? 'your partner'}.`);
  };

  const reclaim = () => {
    console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "Reclaim" on "${q.title}" assigned to ${assignee?.name ?? 'partner'} (id=${q.id}) [features/hub/parent/backlog/OthersAdultQuestCard.tsx:38]`);
    Alert.alert(
    'Reclaim task',
    `Reassign "${q.title}" to yourself?`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reclaim', onPress: () => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} confirmed "Reclaim" on "${q.title}" (id=${q.id}) → updateQuest(assignedToId) [features/hub/parent/backlog/OthersAdultQuestCard.tsx:43]`); updateQuest(q.id, { assignedToId: active.id }); } },
    ]
  );
  };

  return (
    <View style={{
      borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(225,218,203,0.7)',
      backgroundColor: isDark ? colors.card : '#FFFFFF', overflow: 'hidden',
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
      <Pressable onPress={() => { if (hasDetail) { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "${isExp ? 'Collapse' : 'Expand'}" on "${q.title}" (id=${q.id}) [features/hub/parent/backlog/OthersAdultQuestCard.tsx:55]`); setExp(e => !e); } }} onLongPress={onLongPress}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {si?.length > 0 && <ShoppingBag size={13} color={colors.warning} />}
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
              {q.title}
            </Text>
          </View>
          <Text style={{ fontSize: TYPO.label, color: colors.warning, marginTop: 2, fontWeight: '600' }}>
            → {assignee?.name ?? 'Partner'}{q.dueDate ? ` · Due ${q.dueDate}` : ''}
          </Text>
          {si?.length > 0 && !isExp && (
            <Text style={{ fontSize: TYPO.micro, color: colors.parent, marginTop: 2 }}>
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
        <View style={{ borderTopWidth: 1, borderTopColor: colors.warning + '30', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 8 }}>
          {q.description ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{q.description}</Text>
          ) : null}
          {/* Lifecycle timestamps — previously nothing here showed when
              this was assigned or whether the co-parent had even started
              it, so "still open" was the only signal a nudge/reclaim
              decision had to go on. */}
          {((q as any).createdAt || q.claimedAt) && (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>
              {(q as any).createdAt && `Assigned ${new Date((q as any).createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              {(q as any).createdAt && q.claimedAt ? ' → ' : ''}
              {q.claimedAt && `Started ${new Date(q.claimedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${new Date(q.claimedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
            </Text>
          )}
          {si?.length > 0 && (
            <View style={{ borderRadius: 10, borderWidth: 1,
              borderColor: colors.parent + '40',
              backgroundColor: isDark ? colors.parent + '10' : colors.parentLight, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 10, paddingVertical: 7,
                borderBottomWidth: 1, borderBottomColor: colors.parent + '30' }}>
                <ShoppingBag size={12} color={colors.parent} />
                <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.parent }}>
                  {ss ? `Shop at ${ss}` : 'Shopping List'}
                </Text>
              </View>
              {si.map((item: string, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 10, paddingVertical: 6,
                  borderBottomWidth: i < si.length - 1 ? 1 : 0,
                  borderBottomColor: colors.parent + '20' }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5,
                    borderColor: colors.parent }} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textPrimary }}>{item}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {si?.length > 0 && (
        <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.name} tapped "${isGPOpen ? 'GP Welcome' : 'Offer to GP'}" on "${q.title}" (id=${q.id}) → updateChore(openToGP) [features/hub/parent/backlog/OthersAdultQuestCard.tsx:123]`); useChoreStore.getState().updateChore(q.id, { openToGP: !isGPOpen }); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 7,
            marginHorizontal: 12, marginBottom: 6, padding: 8, borderRadius: 10,
            backgroundColor: isGPOpen ? (isDark ? '#14291a' : '#DCFCE7') : (isDark ? colors.surface2 : '#F8FAFC'),
            borderWidth: 1, borderColor: isGPOpen ? GP_GREEN : (isDark ? colors.border : '#E2E8F0') }}>
          <HeartHandshake size={13} color={isGPOpen ? GP_GREEN : colors.textSecondary} />
          <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700',
            color: isGPOpen ? GP_GREEN : colors.textSecondary }}>
            {isGPOpen ? 'GP Welcome — can buy & scan receipt' : 'Offer to GP (buy supplies + receipt scan)'}
          </Text>
          {isGPOpen && <CheckCircle2 size={12} color={GP_GREEN} />}
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 }}>
        <Pressable onPress={sendNudge} /* logging inside sendNudge() */
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            backgroundColor: isDark ? colors.warning + '18' : colors.warningLight,
            borderWidth: 1.5, borderColor: colors.warning + '60',
            borderRadius: 10, paddingVertical: 8 }}>
          <MessageCircle size={13} color={colors.warning} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.warning }}>Nudge</Text>
        </Pressable>
        <Pressable onPress={reclaim} /* logging inside reclaim() */
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            backgroundColor: colors.primary + '18',
            borderWidth: 1.5, borderColor: colors.primary + '50',
            borderRadius: 10, paddingVertical: 8 }}>
          <ArrowRightLeft size={13} color={colors.primary} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.primary }}>Reclaim</Text>
        </Pressable>
      </View>
    </View>
  );
}
