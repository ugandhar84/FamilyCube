import { View, Text } from 'react-native';
import { ShoppingCart } from 'lucide-react-native';
import { GroceryRun } from '@/store/groceryStore';
import { FlatSectionHeader } from './FlatSectionHeader';
import { RunCard } from './RunCard';
import { s } from './styles';

// ─── "Runs" tab body — active / draft / done run lists ─────────────────────

export function RunsTabBody({
  runs, activeRuns, draftRuns, doneRuns,
  setSelectedRun, handleDeleteRun, isKid, colors, isDark, P,
}: {
  runs: GroceryRun[]; activeRuns: GroceryRun[]; draftRuns: GroceryRun[]; doneRuns: GroceryRun[];
  setSelectedRun: (run: GroceryRun) => void;
  handleDeleteRun: (run: GroceryRun) => void;
  isKid: boolean; colors: any; isDark: boolean; P: string;
}) {
  return (
    <View style={{ padding: 16 }}>
      {runs.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🗓️</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>No shopping trips yet</Text>
          <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>Start a trip when you're heading to a store — your list items will be ready to check off as you shop.</Text>
        </View>
      ) : (
        <>
          {activeRuns.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <FlatSectionHeader Icon={ShoppingCart} title="Active" accent={colors.success} colors={colors} />
              {activeRuns.map((run, idx) => (
                <RunCard key={run.id} run={run} isLast={idx === activeRuns.length - 1} onPress={() => setSelectedRun(run)} onDelete={isKid ? undefined : () => handleDeleteRun(run)} colors={colors} isDark={isDark} />
              ))}
            </View>
          )}
          {draftRuns.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <FlatSectionHeader Icon={ShoppingCart} title="Draft" accent={P} colors={colors} />
              {draftRuns.map((run, idx) => (
                <RunCard key={run.id} run={run} isLast={idx === draftRuns.length - 1} onPress={() => setSelectedRun(run)} onDelete={isKid ? undefined : () => handleDeleteRun(run)} colors={colors} isDark={isDark} />
              ))}
            </View>
          )}
          {doneRuns.length > 0 && (
            <View style={{ marginBottom: 20 }}>
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
