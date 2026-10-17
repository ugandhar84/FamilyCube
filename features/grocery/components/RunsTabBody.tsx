import { View, Text, Pressable } from 'react-native';
import { ShoppingCart } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { GroceryRun } from '@/store/groceryStore';
import { FlatSectionHeader } from './FlatSectionHeader';
import { RunCard } from './RunCard';
import { s } from './styles';
import { RHYTHM } from '@/constants/theme';

// ─── "Runs" tab body — active / draft / done run lists ─────────────────────

export function RunsTabBody({
  runs, activeRuns, draftRuns, doneRuns,
  setSelectedRun, handleDeleteRun, onNewRun, isKid, colors, isDark, P,
}: {
  runs: GroceryRun[]; activeRuns: GroceryRun[]; draftRuns: GroceryRun[]; doneRuns: GroceryRun[];
  setSelectedRun: (run: GroceryRun) => void;
  handleDeleteRun: (run: GroceryRun) => void;
  onNewRun: () => void;
  isKid: boolean; colors: any; isDark: boolean; P: string;
}) {
  return (
    <View style={{ padding: RHYTHM.page, gap: RHYTHM.section }}>
      {/* Start-a-trip banner: says what a shopping trip is for, with the action inside it. */}
      {!isKid && (
        <View style={{ borderRadius: 20, padding: RHYTHM.card + 2, gap: RHYTHM.item + 2, backgroundColor: isDark ? colors.tealLight : colors.tealLight,
          borderWidth: 1, borderColor: colors.teal + '33' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? colors.surface : '#FFFFFF' }}>
              <ShoppingCart size={22} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>Plan a shopping trip</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', lineHeight: 18, color: colors.textSecondary, marginTop: 2 }}>
                Choose a store and a time. Your list becomes a checklist to tick off while you shop.
              </Text>
            </View>
          </View>
          <Pressable onPress={onNewRun} accessibilityRole="button" accessibilityLabel="Start a shopping trip"
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: pressed ? P + 'CC' : P, borderRadius: 14, paddingVertical: 13,
            })}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Start a trip</Text>
          </Pressable>
        </View>
      )}
      {runs.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🗓️</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No shopping trips yet</Text>
          <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>Start a trip when you head to a store and your list items are ready to check off as you shop.</Text>
        </View>
      ) : (
        <>
          {activeRuns.length > 0 && (
            <View>
              <FlatSectionHeader Icon={ShoppingCart} title="Active" accent={colors.success} colors={colors} />
              {activeRuns.map((run, idx) => (
                <RunCard key={run.id} run={run} isLast={idx === activeRuns.length - 1} onPress={() => setSelectedRun(run)} onDelete={isKid ? undefined : () => handleDeleteRun(run)} colors={colors} isDark={isDark} />
              ))}
            </View>
          )}
          {draftRuns.length > 0 && (
            <View>
              <FlatSectionHeader Icon={ShoppingCart} title="Planned" accent={P} colors={colors} />
              {draftRuns.map((run, idx) => (
                <RunCard key={run.id} run={run} isLast={idx === draftRuns.length - 1} onPress={() => setSelectedRun(run)} onDelete={isKid ? undefined : () => handleDeleteRun(run)} colors={colors} isDark={isDark} />
              ))}
            </View>
          )}
          {doneRuns.length > 0 && (
            <View>
              <FlatSectionHeader Icon={ShoppingCart} title="Completed" accent={colors.textTertiary} colors={colors} />
              {doneRuns.map((run, idx) => (
                <RunCard key={run.id} run={run} isLast={idx === doneRuns.length - 1} onPress={() => setSelectedRun(run)} onDelete={isKid ? undefined : () => handleDeleteRun(run)} colors={colors} isDark={isDark} />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}
