import { OverlayPage, OverlayHeading } from '@/components/OverlayPage';
import { useEffect } from 'react';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useUIStore } from '@/store/uiStore';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import type { FamilyEvent } from '@/store/eventStore';
import { useFamilyStore } from '@/store/familyStore';
import { GEMINI } from '@/constants/geminiRhythm';
import { RHYTHM } from '@/constants/theme';
import { fmtTime } from '../hubUtils';

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

  const insets = useSafeAreaInsets();
  // Cover the tab bar while this page is open, like every other full-page overlay.
  useEffect(() => {
    if (!visible) return;
    hideTabBar();
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => { showTabBar(); useUIStore.getState().setFullBleedScreenActive(false); };
  }, [visible]);

  if (!conflictEvent) return null;

  const rows = [
    {
      title: conflictEvent.title,
      detail: conflictEvent.time
        ? `${fmtTime(conflictEvent.time)}${conflictEvent.location ? ` · ${conflictEvent.location.split(',')[0]}` : ''}`
        : (conflictEvent.location?.split(',')[0] ?? ''),
      meta: 'This event',
    },
    ...relatedContext,
  ];

  const borderColor = isDark ? colors.border : GEMINI.border;

  return (
    <OverlayPage visible={visible} onDismiss={onClose} zIndex={60} backgroundColor={colors.background}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        {/* ── Page header ── */}
        <OverlayHeading
          eyebrow="FAMILY CUBE · SCHEDULE"
          title="One decision"
        subtitle={relatedContext[0]?.meta && relatedContext[0].meta !== 'Also today' ? relatedContext[0].meta : 'These events overlap'}
          accent="amber"
          topInset={0}
          onTitlePress={onClose}
        />

        <ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ paddingHorizontal: RHYTHM.page, paddingTop: 4, gap: RHYTHM.item, paddingBottom: RHYTHM.section }}
          showsVerticalScrollIndicator={false}
        >
          {/* Options list */}
          <View style={[s.card, { backgroundColor: colors.card, borderColor }]}>
            <Text style={[s.overline, { color: colors.textTertiary }]}>SCHEDULE CONFLICT</Text>
            {rows.map((r, i) => (
              <View key={`${r.title}-${i}`}>
                {i > 0 && <View style={{ height: 1, backgroundColor: isDark ? colors.border : GEMINI.border }} />}
                <View style={{ paddingVertical: 10, gap: 2 }}>
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
        <View style={{ flexDirection: 'row', gap: RHYTHM.item, paddingHorizontal: RHYTHM.page, paddingTop: RHYTHM.item, paddingBottom: Math.max(insets.bottom, RHYTHM.page) }}>
          <AnimatedPressable
            onPress={onClose}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor, backgroundColor: colors.surface }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>Not now</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => { onApprove(); onClose(); }}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.pink }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Approve plan →</Text>
          </AnimatedPressable>
        </View>
      </View>
    </OverlayPage>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: RHYTHM.card,
    borderWidth: 1,
    gap: 4,
  },
  overline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
});
