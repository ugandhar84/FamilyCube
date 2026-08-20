import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';
import type { Quest } from '@/store/questStore';

interface Props {
  todaysKudos: Quest[];
  members: any[];
  isSenior: boolean;
  colors: any;
  onKudosTap: (q: Quest) => void;
}

// ── Family Kudos — today's completed quests, tap to cheer ──
export function FamilyKudosStrip({ todaysKudos, members, isSenior, colors, onKudosTap }: Props) {
  if (todaysKudos.length === 0) return null;
  return (
    <View style={{ marginHorizontal: 14, marginBottom: 12 }}>
      <View style={{ backgroundColor: colors.tealLight, borderRadius: 20, borderWidth: 1, borderColor: colors.teal + '30', padding: 14 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: colors.teal, marginBottom: 2 }}>🎉 Family Kudos</Text>
        <Text style={{ fontSize: TYPO.micro, color: colors.success, marginBottom: 10 }}>
          {isSenior ? 'Tap a chore to cheer — with a note, or bonus coins' : 'Tap a chore to send a kudos note'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
            {todaysKudos.map(q => {
              const kid = members.find(m => m.id === q.assignedToId);
              return (
                <TouchableOpacity key={q.id} onPress={() => onKudosTap(q)}
                  style={{ backgroundColor: colors.successLight, borderRadius: 16, padding: 10, width: 130, gap: 4 }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.success }}>✅ Done</Text>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>{q.title}</Text>
                  <Text style={{ fontSize: TYPO.micro, color: colors.success }}>{kid?.emoji ?? '🧒'} {kid?.name ?? 'Kid'}</Text>
                  {q.coins > 0 && <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.warning }}>+{q.coins} coins</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
