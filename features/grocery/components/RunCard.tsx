import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GroceryRun } from '@/store/groceryStore';

// ─── Run Card — Figma white card style ────────────────────────────────────────

function fmtRunDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} · ${time}`;
}

export function RunCard({ run, onPress, onDelete, colors, isDark }: {
  run: GroceryRun; onPress: () => void; onDelete?: () => void;
  colors: any; isDark: boolean; isLast?: boolean;
}) {
  const isActive = run.status === 'active';
  const isDone   = run.status === 'done';

  const accentColor = isActive ? colors.teal : isDone ? colors.textTertiary : colors.primary;
  const accentBg    = isActive ? colors.tealLight : isDone ? colors.surface : colors.primaryLight;

  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: pressed ? accentBg : colors.card,
        borderRadius: 14, borderWidth: 1, borderColor: isActive ? colors.teal : colors.border,
        padding: 14, minHeight: 72, marginBottom: 8,
        shadowColor: isDark ? 'transparent' : '#172337', shadowOpacity: isDark ? 0 : 0.04,
        shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
      })}>
      {/* Icon chip */}
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: accentBg,
        alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons
          name={isActive ? 'cart' : isDone ? 'checkmark-done-circle' : 'document-text-outline'}
          size={22} color={accentColor} />
      </View>

      {/* Content */}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, flex: 1 }} numberOfLines={1}>
            {run.name}
          </Text>
          {/* Status pill */}
          <View style={{ borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: accentBg }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: accentColor }}>
              {isActive ? 'LIVE' : isDone ? 'DONE' : 'PLANNED'}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>🏪 {run.store}</Text>
        {run.plannedAt && (
          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textTertiary }}>
            📅 {fmtRunDate(run.plannedAt)}
          </Text>
        )}
      </View>

      {/* Right actions */}
      <View style={{ gap: 8, alignItems: 'center' }}>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        {!isActive && onDelete && (
          <Pressable onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
