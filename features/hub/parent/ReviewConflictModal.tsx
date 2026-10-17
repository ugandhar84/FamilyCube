import { PageHeading } from '@/components/PageHeading';
import FullPageOverlay from '@/components/FullPageOverlay';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import type { FamilyEvent } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { GEMINI } from '@/constants/geminiRhythm';

export function ReviewConflictModal({
  visible, onClose,
  conflictEvent, relatedContext, onApprove,
}: {
  visible: boolean;
  onClose: () => void;
  conflictEvent: FamilyEvent | null;
  relatedContext: { title: string; detail: string; meta: string }[];
  onApprove: () => void;
}) {
  const { colors, isDark } = useTheme();
  const familyName = useFamilyStore(s => s.familyName);
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const activeMember = members.find(m => m.id === activeMemberId);

  if (!conflictEvent) return null;

  const rows = [
    {
      title: conflictEvent.title,
      detail: conflictEvent.time
        ? `${conflictEvent.time}${conflictEvent.location ? ` · ${conflictEvent.location}` : ''}`
        : (conflictEvent.location ?? ''),
      meta: 'This event',
    },
    ...relatedContext,
  ];

  const borderColor = isDark ? colors.border : GEMINI.border;

  return (
    <FullPageOverlay visible={visible} onDismiss={onClose} zIndex={60} backgroundColor={colors.background}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        {/* ── Page header ── */}
        <PageHeading
          eyebrow="FAMILY CUBE · SCHEDULE"
          title="One decision"
        subtitle="Needs you before 4:00 PM"
          accent="amber"
          topInset={0}
          onTitlePress={onClose}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, gap: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Options list */}
          <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
            <Text style={[s.overline, { color: colors.textTertiary }]}>SCHEDULE CONFLICT</Text>
            {rows.map((r, i) => (
              <View key={`${r.title}-${i}`}>
                {i > 0 && <View style={{ height: 1, backgroundColor: isDark ? colors.border : GEMINI.border }} />}
                <View style={{ paddingVertical: 14, gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>{r.title}</Text>
                  {r.detail ? <Text style={{ fontSize: 12, color: (isDark ? colors.textSecondary : GEMINI.bodyColor) }}>{r.detail}</Text> : null}
                  <View style={{ alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.primaryLight, marginTop: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.primary }}>{r.meta}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Context card */}
          <View style={[s.card, { backgroundColor: colors.amberLight, borderColor: 'transparent' }]}>
            <Text style={[s.overline, { color: colors.amber }]}>WHY THIS MATTERS</Text>
            <Text style={{ fontSize: 13, color: (isDark ? colors.textSecondary : GEMINI.bodyColor), lineHeight: 20 }}>
              These events overlap and need a decision before they can both happen. Approving the plan will lock in the arrangement shown.
            </Text>
          </View>
        </ScrollView>

        {/* Fixed bottom action bar */}
        <View style={{
          position: 'absolute', left: 16, right: 16, bottom: 32,
          flexDirection: 'row', gap: 10, padding: 10,
          borderWidth: 1, borderColor: borderColor, borderRadius: 22,
          backgroundColor: isDark ? colors.card : 'rgba(255,255,255,0.97)',
          shadowColor: 'rgba(44,39,34,0.20)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0 : 1, shadowRadius: 20,
        }}>
          <AnimatedPressable
            onPress={onClose}
            style={{ flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor, backgroundColor: colors.surface }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>Not now</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => { onApprove(); onClose(); }}
            style={{ flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.pink }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Approve plan →</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    </FullPageOverlay>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    gap: 12,
  },
  overline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
});
