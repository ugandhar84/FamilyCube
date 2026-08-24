/**
 * TasksScreen — unified "Tasks" tab, merging the former Quests and Schedule
 * tabs into one nav slot (see app/(tabs)/_layout.tsx).
 *
 * Deliberately a thin composition shell, not a rewrite: CalendarScreen and
 * QuestsScreen each carry ~1700/1200 lines of dense, safety-critical RBAC
 * and privacy logic (medical-event redaction, GP visibility rules, pool
 * claiming, two-bounce delegation). Re-deriving that inline here to produce
 * one truly interleaved list would risk silently regressing behavior that's
 * already correct and well-tested. Instead this renders one of the two
 * screens full-bleed and lets a small floating segmented control switch
 * between them — "one tab in the nav bar," without touching either
 * screen's internals. A deeper interleaved-list merge can build on this
 * shell later without another navigation change.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import CalendarScreen from '@/features/calendar/CalendarScreen';
import QuestsScreen from '@/features/quests/QuestsScreen';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { AddEventModal } from '@/features/calendar/EventFormModal';

type Segment = 'schedule' | 'chores';

export default function TasksScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  // Matches QuestsScreen's own quest-creation gate (parent/teen only — a
  // senior sponsors chores through a separate, distinct "Sponsor Chore"
  // flow inside QuestsScreen that this FAB deliberately doesn't fold in,
  // and a kid gets "Ask Help" via KidRequestModal instead of creating
  // directly). Both segments share this one gate so switching segments
  // never changes whether the "+" is there.
  const canCreate = activeMember?.role === 'parent' || activeMember?.role === 'teen';
  const [segment, setSegment] = useState<Segment>('schedule');
  // Measured per-segment via AppHeader's own onLayout (each screen mounts
  // its own AppHeader instance beneath this overlay) — docks the pill right
  // under the real header instead of guessing a fixed offset that would
  // overlap taller headers (long family/member names wrap the switcher row).
  const [headerHeight, setHeaderHeight] = useState(0);

  // Smart creator — one "+" regardless of segment. SmartTaskComposer
  // classifies free text live as the user types (via extractResponsibility)
  // into Event vs Quest, auto-fills category/assignee/coins, and creates
  // directly; "Adjust in full form" falls back to the real manual modals
  // below, pre-filled with whatever was already extracted.
  const [showComposer, setShowComposer] = useState(false);
  const [manualQuestPrefill, setManualQuestPrefill] = useState<{
    title?: string; coins?: number; assignedToId?: string; photoRequired?: boolean; dueDate?: string;
  } | undefined>(undefined);
  const [manualEventPrefill, setManualEventPrefill] = useState<{
    title?: string; category?: string; memberId?: string; startAt?: string; notes?: string;
  } | undefined>(undefined);
  const [showManualQuest, setShowManualQuest] = useState(false);
  const [showManualEvent, setShowManualEvent] = useState(false);

  const openCreator = () => setShowComposer(true);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {segment === 'schedule'
        ? <CalendarScreen onHeaderHeight={setHeaderHeight} />
        : <QuestsScreen onHeaderHeight={setHeaderHeight} />}

      {/* Floating segmented control — docked just below whichever screen's
          own AppHeader is mounted beneath it (measured live via
          onHeaderHeight, since header height varies with name/badge
          wrapping), not pinned to the status bar where it used to overlap
          the header row entirely. */}
      <View pointerEvents="box-none" style={[styles.overlayWrap, { top: insets.top + headerHeight + 4 }]}>
        <View style={[styles.pillTrack, {
          backgroundColor: isDark ? 'rgba(30,22,45,0.92)' : 'rgba(255,255,255,0.94)',
          borderColor: colors.border,
        }]}>
          {(['schedule', 'chores'] as Segment[]).map(seg => {
            const active = segment === seg;
            return (
              <TouchableOpacity
                key={seg}
                onPress={() => setSegment(seg)}
                style={[styles.pillBtn, active && { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Text style={[
                  styles.pillText,
                  { color: active ? '#fff' : colors.textSecondary, fontWeight: active ? '800' : '600' },
                ]}>
                  {seg === 'schedule' ? '📅 Schedule' : '✅ Chores'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {canCreate && (
        <TouchableOpacity
          onPress={openCreator}
          activeOpacity={0.88}
          style={[styles.fab, {
            bottom: insets.bottom + 20,
            backgroundColor: colors.primary,
          }]}
        >
          <Plus size={26} color="#fff" />
        </TouchableOpacity>
      )}

      <SmartTaskComposer
        visible={showComposer}
        members={members}
        activeMemberId={activeMemberId ?? ''}
        familyId={activeMember?.familyId ?? ''}
        onClose={() => setShowComposer(false)}
        onCreated={() => setShowComposer(false)}
        onOpenFullForm={(kind, prefill) => {
          setShowComposer(false);
          if (kind === 'quest') {
            setManualQuestPrefill(prefill as typeof manualQuestPrefill);
            setShowManualQuest(true);
          } else {
            setManualEventPrefill(prefill as typeof manualEventPrefill);
            setShowManualEvent(true);
          }
        }}
      />

      {showManualQuest && (
        <AddQuestModal
          visible={showManualQuest}
          onClose={() => { setShowManualQuest(false); setManualQuestPrefill(undefined); }}
          activeMemberId={activeMemberId ?? ''}
          prefill={manualQuestPrefill}
        />
      )}

      {showManualEvent && (
        <AddEventModal
          visible={showManualEvent}
          onClose={() => { setShowManualEvent(false); setManualEventPrefill(undefined); }}
          activeMemberId={activeMemberId ?? ''}
          prefill={manualEventPrefill as any}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20,
  },
  pillTrack: {
    flexDirection: 'row', borderRadius: RADIUS.full ?? 999, borderWidth: 1,
    padding: 3, gap: 2,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  pillBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full ?? 999,
  },
  pillText: {
    fontSize: TYPO.caption,
  },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
});
