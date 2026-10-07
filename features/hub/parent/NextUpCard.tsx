import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import type { FamilyEvent } from '@/store/eventStore';
import { AnimatedPressable } from '@/components/AnimatedPressable';

/**
 * NextUpTimeline — pixel-faithful rebuild of the Figma Make prototype's
 * "NEXT UP" section (design/Scrollable Content Design/src/App.tsx lines
 * 177-220, src/index.css lines 304-385): a section-title row ("NEXT UP" /
 * "Your afternoon" / "Full day" link) above a white card listing up to 3
 * events as time + colored dot + title/detail + arrow rows.
 *
 * Was built as a single-event card in an earlier pass — the actual source
 * is a short multi-item timeline, not one card. Rebuilt to match: up to 3
 * upcoming events, each gets one of the 3 dot colors the mock cycles
 * through (periwinkle/mint/peach — colors.pink/teal/amber), in order.
 *
 * Exact values transcribed from index.css: row grid-template-columns
 * 42px 10px 1fr 20px, min-height 72, border-bottom 1px #ecebf0 (last row
 * none); dot 9x9 circle; card radius 22, shadow 0 7px 24px rgba(44,50,68,.055).
 */
export function NextUpTimeline({
  colors, isDark, events, conflictReasons,
}: {
  colors: any; isDark: boolean;
  // Up to 3 upcoming events today, already sorted by the caller.
  events: FamilyEvent[];
  conflictReasons?: Map<string, string>;
}) {
  const shown = events.slice(0, 3);
  const dotColors = [colors.pink, colors.teal, colors.amber];

  return (
    <View style={{ marginHorizontal: 20, marginTop: 26 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <View style={{ alignSelf: 'flex-start' }}>
            <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.pink, marginBottom: 6, opacity: 0.6 }} />
            <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>NEXT UP</Text>
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '400', letterSpacing: -0.5, marginTop: 4 }}>
            Your afternoon
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/calendar' as any)}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Full day →</Text>
        </Pressable>
      </View>

      <View style={{
        marginTop: 11,
        paddingHorizontal: 16, paddingVertical: shown.length === 0 ? 18 : 5, borderRadius: 22,
        backgroundColor: colors.card,
        borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.10)',
        shadowColor: colors.navy, shadowOffset: { width: 0, height: 7 }, shadowOpacity: isDark ? 0 : 0.055, shadowRadius: 24,
      }}>
        {shown.length === 0 ? (
          <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center' }}>Nothing scheduled — enjoy the clear afternoon</Text>
        ) : shown.map((ev, i) => (
          <AnimatedPressable
            key={ev.id}
            onPress={() => router.push('/(tabs)/calendar' as any)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              minHeight: 72,
              borderBottomWidth: i === shown.length - 1 ? 0 : 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text style={{ width: 42, color: colors.textSecondary, fontSize: 11 }}>{ev.time ?? ''}</Text>
            <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: dotColors[i % 3] }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '400' }} numberOfLines={1}>
                {ev.title}
              </Text>
              <Text style={{ marginTop: 3, color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                {conflictReasons?.get(ev.id) ?? (ev.location ?? '')}
              </Text>
            </View>
            <Text style={{ color: colors.primary }}>→</Text>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
}
