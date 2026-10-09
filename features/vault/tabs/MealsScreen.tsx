import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { useFamilyStore } from '@/store/familyStore';
import MealsTabComp from './MealsTab';

function fmtWeekRange(weekOf: string): string {
  const d = new Date(weekOf + 'T00:00:00');
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const startStr = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const endStr   = end.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${startStr}–${endStr}`;
}

function weekOf(offset = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function MealsScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyName   = (members[0] as any)?.familyName ?? 'Family';
  const P = colors.primary;

  const [weekOffset, setWeekOffset] = useState(0);
  const currentWeek = weekOf(weekOffset);
  const weekRange   = fmtWeekRange(currentWeek);

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => useUIStore.getState().setFullBleedScreenActive(false);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.card }}>

      {/* ── ReviewInbox-style header ── */}
      {!hideHeader && (
        <View style={{
          paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 16,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
          backgroundColor: colors.card, gap: 8,
        }}>
          {/* Family chrome */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
              FAMILY CUBE / {familyName.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
              {(activeMember as any)?.name} · {(activeMember as any)?.role === 'parent' ? 'Parent / Admin' : 'Member'}
            </Text>
          </View>

          {/* Breadcrumb */}
          <Pressable onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Lists</Text>
          </Pressable>

          {/* Title */}
          <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
            A week at the table
          </Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

        {/* ── Week navigator ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => setWeekOffset(w => w - 1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 18, color: P }}>‹</Text>
          </Pressable>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
            {weekRange}
          </Text>
          <Pressable onPress={() => setWeekOffset(w => w + 1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 18, color: P }}>›</Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, paddingHorizontal: 20, marginBottom: 14 }}>
          Shared with the five Parkers · tap any slot to edit. An open slot is an invitation, not a missed task.
        </Text>

        {/* ── AI suggestions card (lavender) ── */}
        <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.pinkLight, borderRadius: 22, padding: 20, gap: 6 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>
            Want a few meal ideas?
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary, lineHeight: 20 }}>
            Optional suggestions that fit the week. Review before adding anything.
          </Text>
          <Pressable style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.pink }}>
              Preview AI meal plan →
            </Text>
          </Pressable>
        </View>

        {/* ── Add meal button ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <Pressable
            style={({ pressed }) => ({
              borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              backgroundColor: pressed ? P + 'CC' : P,
            })}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>Add meal</Text>
          </Pressable>
        </View>

        {/* ── Day cards from MealsTab ── */}
        <View style={{ paddingHorizontal: 20 }}>
          <MealsTabComp colors={colors} isDark={isDark} weekOverride={currentWeek} />
        </View>

        {/* ── Open shared groceries link ── */}
        <Pressable onPress={() => router.push('/(tabs)/grocery' as any)}
          style={{ alignItems: 'center', paddingVertical: 20, marginTop: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.teal }}>
            Open shared groceries →
          </Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}
