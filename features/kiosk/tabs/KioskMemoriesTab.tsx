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
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { useUIStore } from '@/store/uiStore';
import MemoriesTab from '@/features/vault/tabs/MemoriesTab';

export function KioskMemoriesTab({ colors, isDark, readOnly = false }: { colors: any; isDark: boolean; readOnly?: boolean }) {
  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Family Memories</Text>
        {!readOnly && (
          <Pressable
            onPress={() => useUIStore.getState().setOpenMemoryComposerRequested(true)}
            style={[s.addBtn, { backgroundColor: colors.primary }]}>
            <Plus size={18} color="#fff" />
            <Text style={s.addBtnText}>Add Memory</Text>
          </Pressable>
        )}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        <MemoriesTab colors={colors} isDark={isDark} readOnly={readOnly} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16 },
  addBtnText: { fontSize: TYPO.body, fontWeight: '800', color: '#fff' },
  scrollContent: { paddingBottom: 40 },
});
