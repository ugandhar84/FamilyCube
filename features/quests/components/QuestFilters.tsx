/**
 * QuestFilters — member chip strip + lifecycle status segmented control.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

export type TabStatus = 'all' | 'todo' | 'review' | 'completed';

const ThumbsUpIcon = ({ c }: { c: string }) => (
  <Svg width={11} height={11} viewBox="0 0 24 24">
    <Path d="M14,9 V5 C14,3.3 12.7,2 11,2 L7,13 V22 H18.3 C19.3,22 20.1,21.3 20.3,20.3 L21.7,12.3 C21.9,11 20.9,10 19.6,10 H14 Z" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    <Path d="M7,13 H4 C2.9,13 2,13.9 2,15 V20 C2,21.1 2.9,22 4,22 H7" stroke={c} strokeWidth={1.5} fill="none" />
  </Svg>
);

interface Member { id: string; name: string; emoji?: string | null; role: string; color?: string }

interface Props {
  kidFilter: string;
  tabStatus: TabStatus;
  isKid: boolean;
  isParentOrSenior: boolean;
  kids: Member[];
  isDark: boolean;
  colors: any;
  onSetKidFilter: (f: string) => void;
  onSetTabStatus: (t: TabStatus) => void;
}

export function QuestFilters({
  kidFilter, tabStatus, isKid, isParentOrSenior, kids, isDark, colors,
  onSetKidFilter, onSetTabStatus,
}: Props) {
  const pillBase = {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, borderWidth: 1.5,
  };
  const pillBg   = isDark ? '#1E293B' : '#F1F5F9';
  const pillBdr  = isDark ? '#334155' : '#E2E8F0';

  const STATUS_TABS: { key: TabStatus; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'todo',      label: 'To Do' },
    { key: 'review',    label: 'In Review' },
    { key: 'completed', label: 'Paid ✓' },
  ];

  return (
    <>
      {/* ── Member chips ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 2 }}
        style={{ marginBottom: 10 }}
      >
        {/* All Family / My Quests */}
        <TouchableOpacity
          style={[pillBase, kidFilter === 'all'
            ? { backgroundColor: BRAND.purple, borderColor: BRAND.purple }
            : { backgroundColor: pillBg, borderColor: pillBdr }]}
          onPress={() => { onSetKidFilter('all'); onSetTabStatus('all'); }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: kidFilter === 'all' ? '#fff' : colors.textSecondary }}>
            {isKid ? '🎯 My Quests' : 'All Family'}
          </Text>
        </TouchableOpacity>

        {/* Per-kid chips */}
        {!isKid && kids.map(k => (
          <TouchableOpacity
            key={k.id}
            style={[pillBase, kidFilter === k.id
              ? { backgroundColor: k.color ?? BRAND.amber, borderColor: k.color ?? BRAND.amber }
              : { backgroundColor: pillBg, borderColor: pillBdr }]}
            onPress={() => { onSetKidFilter(k.id); onSetTabStatus('all'); }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: kidFilter === k.id ? '#fff' : colors.textSecondary }}>
              {k.emoji ?? '🧒'} {k.name}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Adults tab */}
        {isParentOrSenior && (
          <TouchableOpacity
            style={[pillBase, kidFilter === 'adults'
              ? { backgroundColor: BRAND.purple, borderColor: BRAND.purple }
              : { backgroundColor: pillBg, borderColor: pillBdr }]}
            onPress={() => { onSetKidFilter('adults'); onSetTabStatus('all'); }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: kidFilter === 'adults' ? '#fff' : colors.textSecondary }}>
              👨‍👩 Adults
            </Text>
          </TouchableOpacity>
        )}

        {/* Bounty pool */}
        <TouchableOpacity
          style={[pillBase, kidFilter === 'pool'
            ? { backgroundColor: BRAND.amber, borderColor: BRAND.amber }
            : { backgroundColor: isDark ? '#1E293B' : '#FFFBEB', borderColor: isDark ? '#78350F50' : '#FDE68A' }]}
          onPress={() => { onSetKidFilter('pool'); onSetTabStatus('all'); }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: kidFilter === 'pool' ? '#fff' : BRAND.amber }}>
            ⚡ Bounty
          </Text>
        </TouchableOpacity>

        {/* Sibling Cheer */}
        <TouchableOpacity
          style={[pillBase, kidFilter === 'cheer'
            ? { backgroundColor: '#4338CA', borderColor: '#6366F1' }
            : { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: isDark ? '#4338CA50' : '#C7D2FE' }]}
          onPress={() => { onSetKidFilter('cheer'); onSetTabStatus('all'); }}
        >
          <ThumbsUpIcon c={kidFilter === 'cheer' ? '#fff' : '#6366F1'} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: kidFilter === 'cheer' ? '#fff' : '#6366F1', marginLeft: 4 }}>
            Sibling Cheer
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Status segmented control ── */}
      {kidFilter !== 'cheer' && (
        <View style={{
          flexDirection: 'row', marginHorizontal: 14, marginBottom: 12,
          backgroundColor: isDark ? '#0F172A' : '#E2E8F0',
          borderRadius: 22, padding: 3,
        }}>
          {STATUS_TABS.map(tab => {
            const active = tabStatus === tab.key;
            // Show a dot on "In Review" when there are items
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => onSetTabStatus(tab.key)}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 20,
                  backgroundColor: active ? (isDark ? '#1E293B' : '#FFFFFF') : 'transparent',
                  shadowColor: active ? '#000' : 'transparent',
                  shadowOpacity: active ? 0.08 : 0,
                  shadowRadius: active ? 4 : 0,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: active ? 2 : 0,
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: active ? '800' : '600',
                  color: active
                    ? (isDark ? '#F1F5F9' : '#0F172A')
                    : (isDark ? '#64748B' : '#64748B'),
                }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
}
