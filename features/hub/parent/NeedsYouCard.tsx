import { View, Text } from 'react-native';
import { ClipboardCheck, ChevronRight, CalendarDays } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { useTheme } from '@/lib/ThemeContext';
import { fmtHumanDateShort, fmtTime } from '../hubUtils';

// dueDate/dueTime are optional, separate fields — NOT baked into the reason
// string. Was previously the only way a date reached this card at all (e.g.
// "Due 2026-10-12" or "You're assigned at 17:00" interpolated straight into
// reason), which violates the app's non-negotiable 12h/human-date rule
// (CLAUDE.md §9) — a raw ISO date or 24h time rendered verbatim on the Hub's
// own top card. Keeping them structured lets the card format them properly
// (fmtHumanDateShort/fmtTime) instead of trusting whatever string shape the
// caller happened to build.
export type NeedsYouItem =
  | { kind: 'conflict'; title: string; reason: string; dueDate?: string; dueTime?: string }
  | { kind: 'approval'; title: string; reason: string; dueDate?: string; dueTime?: string }
  | { kind: 'backlog'; title: string; reason: string; dueDate?: string; dueTime?: string };

// Was a full-width "Review options" / "Review & approve" / "See task" CTA
// button — redundant with the card itself already being the thing to tap.
// Replaced with an inline status label (what this item actually IS right
// now) plus a trailing chevron, same affordance as every other tappable
// row/card in the app (NextUpTimeline's rows, EventDetailScreen's linked-leg
// card) instead of a one-off full-button pattern unique to this card.
function statusFor(kind: NeedsYouItem['kind']): { label: string; color: (colors: any) => string } {
  if (kind === 'conflict')  return { label: 'Scheduling conflict', color: (c) => c.danger };
  if (kind === 'approval')  return { label: 'Awaiting review',     color: (c) => c.amber };
  return { label: 'In backlog', color: (c) => c.textTertiary };
}

export function NeedsYouCard({
  item, onReview,
}: {
  item: NeedsYouItem;
  onReview: () => void;
}) {
  const { colors, isDark } = useTheme();
  const status = statusFor(item.kind);
  const statusColor = status.color(colors);
  const dueLabel = item.dueDate
    ? `${fmtHumanDateShort(item.dueDate)}${item.dueTime ? ` · ${fmtTime(item.dueTime)}` : ''}`
    : undefined;

  return (
    <AnimatedPressable
      onPress={onReview}
      style={{
        marginHorizontal: 20, marginTop: 14,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 16,
        borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.12)',
        borderRadius: 22,
        backgroundColor: colors.amberLight,
      }}
    >
      <View style={{
        width: 42, height: 42, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)',
      }}>
        <ClipboardCheck size={21} color={colors.amber} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.amber, marginBottom: 6, opacity: 0.6 }} />
          <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>NEEDS YOU</Text>
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginTop: 5, marginBottom: 4 }} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: dueLabel ? 4 : 0 }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: statusColor + '20' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>{status.label}</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>
            {item.reason}
          </Text>
        </View>
        {dueLabel && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <CalendarDays size={12} color={colors.textTertiary} />
            <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600' }}>{dueLabel}</Text>
          </View>
        )}
      </View>
      <ChevronRight size={20} color={colors.textTertiary} />
    </AnimatedPressable>
  );
}
