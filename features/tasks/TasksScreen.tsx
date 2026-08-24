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
 * screens full-bleed below a single shared header, and lets 2 square
 * status-count tab-cards switch between them — "one tab in the nav bar,"
 * without touching either screen's internals. A deeper interleaved-list
 * merge can build on this shell later without another navigation change.
 *
 * The header used to be duplicated (each of CalendarScreen/QuestsScreen
 * mounted its own AppHeader) with a floating pill overlaid on top of it —
 * that pill visually overlapped the header row instead of sitting below
 * it. Both screens now accept hideHeader to suppress their own AppHeader
 * when embedded here, so there's exactly one header.
 *
 * The title + tab-cards are passed into each screen's own ScrollView via
 * headerContent so they scroll away with the rest of the page instead of
 * staying pinned — CalendarScreen/QuestsScreen already scroll their own
 * content independently, so a second outer ScrollView around them isn't
 * reliable in React Native; injecting header content into the existing
 * scroller is the correct way to get everything to scroll as one unit.
 * The redundant "+Event"/"+Quest" pills are hidden (hideCreateButton) since
 * the shared FAB below already covers creation for both segments; each
 * screen's own inline search bar is hidden too (hideSearchBar) — search now
 * lives as one icon on the active tab-card, expanding into a bar docked
 * right under that card, driven into whichever screen is active via
 * externalSearchQuery.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ListChecks, Plus, Search, X, Bot, Sparkles, Flame, Award } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, eventAssignee } from '@/store/eventStore';
import { useChoreStore } from '@/store/choreStore';
import { useNotifStore } from '@/store/notifStore';
import { localDateStr } from '@/lib/dates';
import AppHeader from '@/components/AppHeader';
import NotificationPanel from '@/components/NotificationPanel';
import CalendarScreen from '@/features/calendar/CalendarScreen';
import QuestsScreen from '@/features/quests/QuestsScreen';
import type { AiTool } from '@/features/quests/components/AiEngineBanner';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { AddEventModal } from '@/features/calendar/EventFormModal';

type Segment = 'schedule' | 'chores';

export default function TasksScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const events = useEventStore(s => s.events);
  const chores = useChoreStore(s => s.chores);
  const unreadNotifCount = useNotifStore(s => s.unreadCount);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  // Matches QuestsScreen's own quest-creation gate (parent/teen only — a
  // senior sponsors chores through a separate, distinct "Sponsor Chore"
  // flow inside QuestsScreen that this FAB deliberately doesn't fold in,
  // and a kid gets "Ask Help" via KidRequestModal instead of creating
  // directly). Both segments share this one gate so switching segments
  // never changes whether the "+" is there.
  const canCreate = activeMember?.role === 'parent' || activeMember?.role === 'teen';
  const [segment, setSegment] = useState<Segment>('schedule');

  // One search query per segment — kept separate so switching tabs doesn't
  // carry a Schedule search term into Chores' unrelated result set.
  const [scheduleQuery, setScheduleQuery] = useState('');
  const [choreQuery, setChoreQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchAnim = useState(() => new Animated.Value(0))[0];

  const toggleSearch = (next: boolean) => {
    setSearchOpen(next);
    Animated.timing(searchAnim, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: false }).start();
    if (!next) { setScheduleQuery(''); setChoreQuery(''); }
  };

  // CubeAI trigger — moved off the page and onto the Chores card's own
  // top-right corner (was QuestsScreen's own inline pill). QuestsScreen
  // still owns the actual AI call (needs its internal quest/cache state);
  // this only hosts the trigger icon + the dropdown of 3 tool buttons,
  // driven through the exposed runAI function and reported showAiTool/
  // isAiLoading state.
  const isParent = activeMember?.role === 'parent';
  const [aiOpen, setAiOpen] = useState(false);
  const [aiState, setAiState] = useState<{ showAiTool: AiTool; isAiLoading: boolean }>({ showAiTool: 'none', isAiLoading: false });
  const runAIRef = useRef<((tool: AiTool) => void) | null>(null);
  const exposeAiRunner = useCallback((runAI: (tool: AiTool) => void) => { runAIRef.current = runAI; }, []);
  const runAiTool = (tool: AiTool) => { runAIRef.current?.(tool); setAiOpen(false); };

  // Status counts shown on each tab-card — a lightweight summary, not a
  // role-scoped visibility filter (that RBAC logic lives deep inside
  // CalendarScreen/QuestsScreen and shouldn't be re-derived here, per this
  // file's own header comment). Pending = waiting on someone to act;
  // Active = already claimed/in progress. Good enough for a glance-count
  // badge, not a substitute for either screen's own filtered list.
  const scheduleCounts = useMemo(() => {
    const upcoming = events.filter(e => e.date >= localDateStr());
    let pending = 0, active = 0;
    for (const e of upcoming) {
      const a = eventAssignee(e);
      if (!a.status) continue;
      if (a.status === 'pending') pending++;
      else if (a.status === 'confirmed') active++;
    }
    return { pending, active };
  }, [events]);

  const choreCounts = useMemo(() => {
    let pending = 0, active = 0;
    for (const c of chores) {
      if (c.status === 'todo' || c.status === 'gp_offer_pending') pending++;
      else if (c.status === 'in_progress' || c.status === 'pending_approval' || c.status === 'pending_grandparent_approval' || c.status === 'pending_parent_approval') active++;
    }
    return { pending, active };
  }, [chores]);

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

  const activeQuery = segment === 'schedule' ? scheduleQuery : choreQuery;
  const setActiveQuery = segment === 'schedule' ? setScheduleQuery : setChoreQuery;

  // Page title + the 2 status-count tab-cards + the collapsible search bar
  // that drops down from whichever card is active — passed into
  // CalendarScreen/QuestsScreen as headerContent so it scrolls away with
  // the rest of the page instead of staying pinned above it.
  const tasksHeader = (
    <View>
      <Text style={{ fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary, paddingHorizontal: 14, paddingTop: 10 }}>
        Tasks
      </Text>

      {/* Two square tab-cards. Each reads as a small stat tile (big count,
          not a sentence) so "does anything need me right now" is
          answerable at a glance, with a dot on the inactive tab when it's
          carrying pending items the parent hasn't switched over to see
          yet. The active card's own search icon sits bottom-right; tapping
          it drops the search bar down directly beneath the card row. */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 }}>
        {([
          { key: 'schedule' as const, label: 'Schedule', Icon: CalendarDays, counts: scheduleCounts, accent: colors.teal, accentLight: colors.tealLight },
          { key: 'chores' as const, label: 'Chores', Icon: ListChecks, counts: choreCounts, accent: colors.amber, accentLight: colors.amberLight },
        ]).map(({ key, label, Icon, counts, accent, accentLight }) => {
          const active = segment === key;
          const needsAttention = !active && counts.pending > 0;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => { setSegment(key); if (searchOpen) toggleSearch(false); }}
              activeOpacity={0.85}
              style={[
                styles.tabCard,
                {
                  backgroundColor: active ? accent : (isDark ? colors.card : '#FFFFFF'),
                  borderColor: active ? accent : colors.border,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? 'rgba(255,255,255,0.22)' : accentLight,
                }}>
                  <Icon size={14} color={active ? '#fff' : accent} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {key === 'chores' && active && isParent && (
                    <TouchableOpacity
                      onPress={() => { setAiOpen(v => !v); if (searchOpen) toggleSearch(false); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{
                        width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: aiOpen ? '#fff' : 'rgba(255,255,255,0.22)',
                      }}
                    >
                      {aiState.isAiLoading
                        ? <ActivityIndicator size="small" color={aiOpen ? accent : '#fff'} />
                        : <Bot size={13} color={aiOpen ? accent : '#fff'} />}
                    </TouchableOpacity>
                  )}
                  {needsAttention && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
                  )}
                </View>
              </View>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', marginTop: 8, color: active ? 'rgba(255,255,255,0.85)' : colors.textSecondary }}>
                {label}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: active ? '#fff' : colors.textPrimary }}>
                    {counts.pending}
                  </Text>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: active ? 'rgba(255,255,255,0.75)' : colors.textTertiary }}>
                    pending
                  </Text>
                  {counts.active > 0 && (
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: active ? 'rgba(255,255,255,0.75)' : colors.textTertiary, marginLeft: 2 }}>
                      · {counts.active} active
                    </Text>
                  )}
                </View>
                {active && (
                  <TouchableOpacity
                    onPress={() => { toggleSearch(!searchOpen); if (aiOpen) setAiOpen(false); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{
                      width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: searchOpen ? '#fff' : 'rgba(255,255,255,0.22)',
                    }}
                  >
                    {searchOpen
                      ? <X size={13} color={accent} />
                      : <Search size={13} color="#fff" />}
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {searchOpen && (
        <Animated.View style={{
          marginHorizontal: 14, marginTop: 10, marginBottom: 6,
          opacity: searchAnim,
          transform: [{ translateY: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: colors.border,
            backgroundColor: isDark ? colors.surface : '#F8FAFC',
            paddingHorizontal: 12, paddingVertical: 13,
          }}>
            <Search size={15} color={colors.textTertiary} />
            <TextInput
              value={activeQuery}
              onChangeText={setActiveQuery}
              placeholder={segment === 'schedule' ? 'Search events…' : 'Search chores…'}
              placeholderTextColor={colors.textTertiary}
              autoFocus
              style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, padding: 0 }}
            />
            {activeQuery.length > 0 && (
              <TouchableOpacity onPress={() => setActiveQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={15} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}

      {/* CubeAI tool dropdown — opens directly under the card row when the
          Chores card's bot icon is tapped, mirroring the search bar's own
          drop-down pattern. Same 3 tools/tints as the inline pill this
          replaces (AiEngineBanner), just relocated. */}
      {aiOpen && (
        <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 10, marginBottom: 6 }}>
          {([
            { key: 'autobalance' as const, label: 'Balance', Icon: Sparkles, tint: colors.primary },
            { key: 'spark' as const, label: 'Spark', Icon: Flame, tint: colors.kid },
            { key: 'advice' as const, label: 'Advice', Icon: Award, tint: colors.pink },
          ]).map(({ key, label, Icon, tint }) => {
            const toolActive = aiState.showAiTool === key;
            return (
              <TouchableOpacity key={key}
                onPress={() => runAiTool(key)}
                activeOpacity={0.8}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                  paddingVertical: 13, borderRadius: RADIUS.lg,
                  backgroundColor: toolActive ? tint : tint + '18',
                  borderWidth: 1, borderColor: tint + (toolActive ? '' : '40'),
                }}
              >
                <Icon size={13} color={toolActive ? '#fff' : tint} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: toolActive ? '#fff' : tint }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name}
        memberRole={activeMember?.role === 'kid' ? 'kid' : activeMember?.role === 'teen' ? 'teen' : activeMember?.role === 'senior' ? 'senior' : 'parent'}
        notifCount={unreadNotifCount}
        onPersonaPress={undefined}
        onBellPress={() => setNotifPanelOpen(true)}
      />
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

      {segment === 'schedule'
        ? <CalendarScreen hideHeader hideCreateButton hideSearchBar externalSearchQuery={scheduleQuery} headerContent={tasksHeader} />
        : (
          <QuestsScreen
            hideHeader hideCreateButton hideSearchBar hideAiTrigger
            externalSearchQuery={choreQuery} headerContent={tasksHeader}
            onAiStateChange={setAiState} onExposeAiRunner={exposeAiRunner}
          />
        )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tabCard: {
    flex: 1, borderRadius: RADIUS.lg, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 13,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
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
