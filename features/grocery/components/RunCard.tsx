import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GroceryRun } from '@/store/groceryStore';
import { fmtDate } from './types';
import { rc } from './styles';

// ─── Run Card ─────────────────────────────────────────────────────────────────

export function RunCard({ run, onPress, onDelete, colors, isDark, isLast }: {
  run: GroceryRun; onPress: () => void; onDelete?: () => void;
  colors: any; isDark: boolean; isLast?: boolean;
}) {
  const isActive = run.status === 'active';
  const isDone   = run.status === 'done';

  return (
    <Pressable onPress={onPress} style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
      borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        backgroundColor: (isActive ? colors.success : colors.primary) + '18' }}>
        <Ionicons name={isActive ? 'walk' : isDone ? 'checkmark-done' : 'document-text-outline'} size={17} color={isActive ? colors.success : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[rc.name, { color: colors.textPrimary }]}>{run.name}</Text>
          <View style={[rc.badge, { backgroundColor: isActive ? colors.successLight : isDone ? colors.surface : colors.primaryLight }]}>
            <Text style={[rc.badgeText, { color: isActive ? colors.success : isDone ? colors.textSecondary : colors.primary }]}>
              {isActive ? 'LIVE' : isDone ? 'DONE' : 'DRAFT'}
            </Text>
          </View>
        </View>
        <Text style={[rc.store, { color: colors.textSecondary }]}>🏪 {run.store}</Text>
        {run.plannedAt && <Text style={[rc.store, { color: colors.textTertiary }]}>📅 {new Date(run.plannedAt).toLocaleDateString()} · {new Date(run.plannedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>}
        <Text style={[rc.ago, { color: colors.textTertiary }]}>{fmtDate(run.createdAt)}</Text>
      </View>
      <View style={{ gap: 6, alignItems: 'flex-end' }}>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        {!isActive && onDelete && (
          <Pressable onPress={onDelete} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
