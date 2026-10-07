import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import type { FamilyEvent } from '@/store/eventStore';

/**
 * ReviewConflictModal — the "review" detail/compare screen NeedsYouCard's
 * "Review options" button opens, matching the Figma Make prototype's own
 * DetailPageView for route="review" exactly (design/Scrollable Content
 * Design/src/App.tsx lines 851-860, 983-1034, src/index.css lines
 * 1855-1933): a TopBar-style header, a `.detail-panel` of selectable rows
 * (title/detail/meta), and a fixed `.decision-bar` with Not now / Approve
 * plan.
 *
 * Built as an in-app modal rather than a new route — this is the
 * conflict-review flow specifically (not the prototype's full 13-page
 * generic DetailPageView system, which covers rides/groceries/meals/health/
 * etc. too — out of scope for this pass, see ParentView's own "Home page
 * only" direction). Real data: the SAME conflictEvents/conflictReasons
 * AlertBanner and OverlappingPlansCard-era cards already read — this
 * doesn't invent a new urgency computation.
 *
 * "Approve plan" resolves the row the parent selected by calling back to
 * onApprove, which ParentView wires to the real resolution it already has
 * (same reassign/dispatch logic AlertBanner's own cards use) — never a
 * no-op button. "Not now" just closes, same as the prototype's own
 * secondary action (no hidden state change).
 */
export function ReviewConflictModal({
  colors, isDark, visible, onClose,
  conflictEvent, relatedContext, onApprove,
}: {
  colors: any; isDark: boolean;
  visible: boolean;
  onClose: () => void;
  // The primary conflicting event (same one NeedsYouCard showed).
  conflictEvent: FamilyEvent | null;
  // Other events/context rows that explain the conflict — e.g. the
  // overlapping ride, the synced work-calendar block. Built by the caller
  // from its own already-loaded events, same data AlertBanner reads.
  relatedContext: { title: string; detail: string; meta: string }[];
  onApprove: () => void;
}) {
  if (!conflictEvent) return null;

  const rows = [
    { title: conflictEvent.title, detail: conflictEvent.time ? `${conflictEvent.time}${conflictEvent.location ? ` · ${conflictEvent.location}` : ''}` : (conflictEvent.location ?? ''), meta: 'This event' },
    ...relatedContext,
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.amberLight : '#F9E2DC' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 }}>
          <View>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>Needs you before 16:00</Text>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginTop: 2 }}>One decision</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={{ padding: 6 }}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
          <View style={{
            padding: 8, borderRadius: 24,
            backgroundColor: isDark ? colors.card : 'rgba(255,255,255,0.5)',
          }}>
            {rows.map((r, i) => (
              <View
                key={`${r.title}-${i}`}
                style={{
                  minHeight: 88, padding: 13,
                  borderBottomWidth: i === rows.length - 1 ? 0 : 1,
                  borderBottomColor: 'rgba(112,118,136,0.13)',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>{r.title}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>{r.detail}</Text>
                <Text style={{ fontSize: 10, color: colors.primary, marginTop: 4 }}>{r.meta}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={{
          position: 'absolute', left: 14, right: 14, bottom: 24,
          flexDirection: 'row', gap: 8, padding: 10,
          borderWidth: 1, borderColor: 'rgba(220,221,229,0.92)', borderRadius: 18,
          backgroundColor: isDark ? colors.card : 'rgba(255,255,255,0.96)',
          shadowColor: 'rgba(44,50,68,0.3)', shadowOffset: { width: 0, height: 12 }, shadowOpacity: isDark ? 0 : 0.3, shadowRadius: 32,
        }}>
          <AnimatedPressable
            onPress={onClose}
            style={{ flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>Not now</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => { onApprove(); onClose(); }}
            style={{ flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primary }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Approve plan</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
