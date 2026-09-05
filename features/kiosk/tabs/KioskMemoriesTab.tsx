/**
 * KioskMemoriesTab — family photo album for kiosk mode.
 *
 * Previously reimplemented a bespoke read-only `family_memories` query with
 * no posting and no heart/like reaction, per its own now-stale header
 * comment. That was a real parity gap, not a deliberate scope decision: the
 * real screen (features/vault/tabs/MemoriesTab.tsx) supports posting a
 * memory (ComposeMemoryModal, MemoriesTab.tsx:173-550, wired to the real
 * postMemory function at MemoriesTab.tsx:926) and hearting one
 * (heartMemory, MemoriesTab.tsx:974-1001) — nothing about either action is
 * phone-specific, and the standing "exact alignment" rule means kiosk must
 * offer the same capabilities, not a read-only subset.
 *
 * Reuses the real MemoriesTab component directly (same approach already
 * used for chat's MessageBubble/VoiceComponents) rather than
 * reimplementing its query/realtime/heart/delete/post logic — MemoriesTab
 * already renders as inline content meant to sit inside a host ScrollView
 * (see its own header comment: "MemoriesTab itself just renders a plain
 * list inside it"), which is exactly what's needed here. The senior/
 * grandparent read-only rule (MemoriesScreen.tsx:29's `readOnly = role ===
 * 'senior'`) carries over unchanged since KioskMemoriesTab is only ever
 * rendered for a senior profile (KioskScreen.tsx: `effectiveTab ===
 * 'memories' && isSenior`) — matching mobile's own gate exactly rather than
 * inventing a kiosk-specific permission rule.
 *
 * Composing has no shared FAB on kiosk (unlike the phone's app/(tabs)/
 * _layout.tsx FAB that flips openMemoryComposerRequested for
 * MemoriesTab.tsx to consume) — a kiosk-native "+" button in the header
 * flips that exact same useUIStore flag instead, so MemoriesTab's own
 * existing effect (MemoriesTab.tsx:814-819) opens its own real
 * ComposeMemoryModal — no new business logic, just a different trigger for
 * the same flag mobile already reads.
 *
 * ── Hub-OS migration ────────────────────────────────────────────────────
 * The header is now a TabTitle with an ActionButton, and the feed sits in a
 * WidgetCard — same chrome as every other migrated tab. Above it sits the
 * ambient slideshow (KioskMemorySlideshow), which is the genuinely
 * kiosk-native part of this screen: a countertop display glanced at from
 * across a room wants a large, slowly-advancing photo, not a scroll feed.
 * The feed stays below it, unchanged, for anyone actually standing at the
 * device. The embedded MemoriesTab is a shared phone component styled from
 * the app's `colors`; see KioskSchoolTab's header for why that's threaded
 * through rather than forked.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { Plus, Images } from 'lucide-react-native';
import { KIOSK_SPACE } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, TabTitle, ActionButton } from '../components/KioskOS';
import { useKioskActivity } from '../KioskActivityContext';
import { KioskMemorySlideshow } from '../components/KioskMemorySlideshow';
import { useUIStore } from '@/store/uiStore';
import MemoriesTab from '@/features/vault/tabs/MemoriesTab';

export function KioskMemoriesTab({ colors, isDark, readOnly = false }: {
  colors: any; isDark: boolean; readOnly?: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScrollBeginDrag={registerActivity}
      >
        <TabTitle
          title="Family Memories"
          subtitle="The album, and what the household has been up to"
          k={k}
          right={!readOnly ? (
            <ActionButton
              label="Add Memory"
              Icon={Plus}
              accent={k.primary}
              k={k}
              isDark={kioskDark}
              variant="solid"
              accessibilityHint="Opens the memory composer"
              onPress={() => {
                registerActivity();
                useUIStore.getState().setOpenMemoryComposerRequested(true);
              }}
            />
          ) : undefined}
        />

        <KioskMemorySlideshow style={s.slideshow} />

        <WidgetCard k={k} isDark={kioskDark}>
          <WidgetHeader
            Icon={Images} eyebrow="Album" title="All memories"
            accent={k.purple} k={k} isDark={kioskDark}
          />
          <MemoriesTab colors={colors} isDark={isDark} readOnly={readOnly} />
        </WidgetCard>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  slideshow: { marginBottom: KIOSK_SPACE.md },
});
