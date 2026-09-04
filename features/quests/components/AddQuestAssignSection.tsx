import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import { aq } from './AddQuestModal';

// ─── Assign To — avatar circles, multi-select + pool max-claimants picker +
// multi-assign notice ───────────────────────────────────────────────────────
// Extracted verbatim from AddQuestModal — purely presentational, all state
// lives in the parent, same split pattern as HealthRecordsList /
// GroceryScreen's extracted sections.
export function AddQuestAssignSection({
  colors, isDark,
  members, activeMemberId,
  isAdultTask, setIsAdultTask,
  isPool, setIsPool,
  assignIds, setAssignIds,
  inviteGrandparent,
  teensOnly,
  maxClaimants, setMaxClaimants,
  coins,
  pillBg,
}: {
  colors: any; isDark: boolean;
  members: FamilyMember[]; activeMemberId: string;
  isAdultTask: boolean; setIsAdultTask: (v: boolean) => void;
  isPool: boolean; setIsPool: (v: boolean) => void;
  assignIds: string[]; setAssignIds: (v: string[]) => void;
  inviteGrandparent: boolean;
  // Live QA finding (docs/qa_form_combinations_audit.html, High): this
  // section had a senior/GP-welcome eligibility gate (line ~70) but no
  // equivalent for teensOnly — a kid could still be picked as assignee on
  // a chore flagged isOpenToTeens, directly contradicting the flag.
  teensOnly: boolean;
  maxClaimants: number; setMaxClaimants: (v: number) => void;
  coins: string;
  pillBg: string;
}) {
  return (
    <>
      {/* Assign To — avatar circles, multi-select */}
      <Text style={[aq.label, { color: colors.textSecondary }]}>
        Assign To{'  '}
        <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
          {isPool ? 'open to anyone' : assignIds.length === 0 ? 'tap to select' : assignIds.length > 1 ? `${assignIds.length} selected` : '1 selected'}
        </Text>
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ flexDirection: 'row', gap: 12, paddingRight: 4 }}>
        {/* Open Bounty — hidden for adult tasks */}
        {!isAdultTask && <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} onPress={() => { setIsPool(true); setAssignIds([]); }}>
          <View style={{ position: 'relative' }}>
            <FamilyAvatar
              name="Bounty"
              emoji="⚡"
              size={40}
              ringColor={BRAND.amber}
              ringWidth={isPool ? 2.5 : 1}
              bgColor={isPool ? BRAND.amber + '30' : pillBg}
            />
            {isPool && (
              <View style={[aq.avatarCheck, { backgroundColor: BRAND.amber }]}>
                <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: isPool ? BRAND.amber : colors.textTertiary }}>Bounty</Text>
        </TouchableOpacity>}

        {/* Family members — parents only for adult tasks. A
            grandparent only shows up here at all when GP Welcome is
            on — otherwise this quest was never meant to reach them,
            so offering them as a direct-assign target is misleading. */}
        {members
          .filter(m => m.role === 'senior' ? inviteGrandparent : true)
          .filter(m => !(teensOnly && m.role === 'kid'))
          .filter(m => isAdultTask ? (m.role === 'parent' || m.role === 'senior') : (m.role === 'kid' || m.role === 'teen' || m.role === 'parent' || m.role === 'senior'))
          .map(m => {
            const sel       = assignIds.includes(m.id) && !isPool;
            const roleColor = m.role === 'parent' ? BRAND.purple : m.role === 'senior' ? '#0EA5E9' : '#10B981';
            const siblings  = members.map(x => x.name);
            return (
              <TouchableOpacity
                key={m.id}
                style={{ alignItems: 'center', gap: 4 }}
                onPress={() => {
                  setIsPool(false);
                  const next = assignIds.includes(m.id)
                    ? assignIds.filter(id => id !== m.id)
                    : [...assignIds, m.id];
                  setAssignIds(next);
                  // Auto-mark adult task if any selected member is parent/senior
                  const hasAdult = next.some(id => {
                    const role = members.find(x => x.id === id)?.role;
                    return role === 'parent' || role === 'senior';
                  });
                  if (hasAdult) setIsAdultTask(true);
                  else if (!next.some(id => members.find(x => x.id === id)?.role !== 'kid')) setIsAdultTask(false);
                }}
              >
                <View style={{ position: 'relative' }}>
                  <FamilyAvatar
                    name={m.name}
                    emoji={m.emoji}
                    avatarUrl={(m as any).avatarUrl}
                    siblings={siblings}
                    size={40}
                    ringColor={roleColor}
                    ringWidth={sel ? 2.5 : 1}
                    bgColor={sel ? roleColor + '25' : pillBg}
                  />
                  {sel && (
                    <View style={[aq.avatarCheck, { backgroundColor: roleColor }]}>
                      <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900' }}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: sel ? roleColor : colors.textTertiary }} numberOfLines={1}>
                  {m.id === activeMemberId ? 'Me' : m.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
      </ScrollView>

      {/* Pool: max claimants picker */}
      {isPool && (
        <View style={{ marginBottom: 14 }}>
          <Text style={[aq.label, { color: colors.textSecondary }]}>
            How many kids can claim?{'  '}
            <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
              {maxClaimants === 0 ? 'unlimited' : maxClaimants === 1 ? 'first come, first served' : `up to ${maxClaimants} kids`}
            </Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3, 0].map(n => (
              <TouchableOpacity
                key={n}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', borderWidth: 1.5,
                  borderColor: maxClaimants === n ? BRAND.amber : isDark ? '#1E293B' : '#E2E8F0',
                  backgroundColor: maxClaimants === n ? BRAND.amber + '20' : isDark ? '#0F172A' : '#F8FAFC' }}
                onPress={() => setMaxClaimants(n)}
              >
                <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: maxClaimants === n ? BRAND.amber : colors.textSecondary }}>
                  {n === 0 ? '∞' : n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Multi-assign notice */}
      {!isPool && assignIds.length > 1 && (
        <View style={{ marginBottom: 14, padding: 10, borderRadius: 12, backgroundColor: isDark ? '#0F172A' : '#F0FDF4', borderWidth: 1, borderColor: '#10B98130' }}>
          <Text style={{ fontSize: TYPO.label, color: '#059669', fontWeight: '700' }}>
            ✅ {assignIds.length} kids assigned — each tracked independently
          </Text>
          <Text style={{ fontSize: TYPO.micro + 1, color: isDark ? '#6EE7B7' : '#047857', marginTop: 2 }}>
            Each earns +{coins || '30'}🪙 when their own submission is approved
          </Text>
        </View>
      )}
    </>
  );
}
