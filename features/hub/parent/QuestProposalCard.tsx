import { useState } from 'react';
import { View, Text, TextInput, Alert, Pressable } from 'react-native';
import { Coins, X, Check, PenLine } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import type { FamilyMember } from '@/store/familyStore';
import type { KidRequest } from '@/store/kidRequestStore';

// Scenario 1.4 — a Kid's proposed quest ("Can I wash the car for 15 coins?")
// awaiting a parent's Approve-as-is / Approve-with-Changes / Decline
// decision. Mirrors QuestApprovalCard's visual shape (the closest existing
// review-card pattern) but the action underneath is different: approving
// here doesn't just flip a status — it converts the request into a real,
// live quest via choreStore.addChore (wired by the caller through
// onApprove), matching every other kid-request review card's "approve
// calls back up to ParentView, which owns the actual store calls" shape.
export function QuestProposalCard({ req, kidName, active, colors, isDark, onApprove, onDecline }: {
  req: KidRequest; kidName: string; active: FamilyMember;
  colors: any; isDark: boolean;
  // finalCoins may differ from req.rewardCoins if the parent edited the
  // amount inline ("Approve with Changes" collapsed into one editable field
  // rather than a separate modal — same end result, less friction).
  onApprove: (finalCoins: number) => void;
  onDecline: (reason?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [coinsText, setCoinsText] = useState(String(req.rewardCoins ?? 15));

  const finalCoins = Math.max(0, Math.round(parseInt(coinsText, 10) || 0));
  const wasEdited = finalCoins !== (req.rewardCoins ?? 15);

  return (
    <CollapsibleCard accent={colors.primary} colors={colors} isDark={isDark} defaultExpanded
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16 }}>🧩</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.primary }} numberOfLines={1}>
              {kidName} wants to propose a quest
            </Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>
              "{req.detail}"
            </Text>
          </View>
          <View style={{ backgroundColor: colors.primary + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.primary }}>Review</Text>
          </View>
        </View>
      }>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Coins size={14} color={colors.kid} />
        {editing ? (
          <TextInput
            value={coinsText}
            onChangeText={t => setCoinsText(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            autoFocus
            onBlur={() => setEditing(false)}
            style={{
              borderWidth: 1.5, borderColor: colors.primary, borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 4, fontSize: TYPO.label, fontWeight: '800',
              color: colors.textPrimary, width: 80,
            }}
          />
        ) : (
          <Pressable onPress={() => setEditing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }}>
              {finalCoins} coins proposed{wasEdited ? ' (edited)' : ''}
            </Text>
            <PenLine size={12} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => Alert.prompt(
            'Decline Quest Idea',
            `Let ${kidName} know why "${req.detail}" wasn't approved (optional).`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Decline', style: 'destructive', onPress: (reason?: string) => onDecline(reason?.trim() || undefined) },
            ],
            'plain-text',
          )}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            backgroundColor: `${colors.danger}15`, borderWidth: 1, borderColor: `${colors.danger}40`,
            paddingVertical: 10, borderRadius: 12 }}>
          <X size={13} color={colors.danger} />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>Decline</Text>
        </Pressable>
        <Pressable onPress={() => onApprove(finalCoins)}
          style={{ flex: 2, backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 12,
            alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Check size={14} color="#fff" />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
            {wasEdited ? `Approve with Changes (${finalCoins}🪙)` : `Approve as Quest (${finalCoins}🪙)`}
          </Text>
        </Pressable>
      </View>
    </CollapsibleCard>
  );
}
