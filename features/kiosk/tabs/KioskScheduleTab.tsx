/**
 * KioskScheduleTab — Month/Week/Day switcher, per-person colored (assigneeStyle/
 * MultiPersonTimeFill, the same system Calendar/Agenda use on the phone).
 *
 * Previously a fixed 7-day week strip only, reasoning "there's room here to
 * just always show the week" — live-reported as a real gap ("calendar no
 * month date weekly views"), so this now offers all three, each redesigned
 * for a kiosk's arm's-length, tap-not-scroll-tiny-rows context rather than
 * a shrunk copy of the phone's own MonthGridView/WeekView/DaySlotView.
 * Reuses calendarDateHelpers' pure date math (buildMonthGrid/toDateStr/
 * addDays) so month-grid generation can't drift from the phone's own.
 *
 * Was also missing an explicit loadRange() call — CalendarScreen.tsx always
 * fetches its own range per view; this tab read rangeEvents directly with
 * nothing guaranteeing that range had ever been populated for a kiosk
 * session that never mounted the phone's own calendar screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight, Plus, CalendarDays as CalendarIcon } from 'lucide-react-native';
import { useEventStore, eventAssignee, canViewSensitiveEventDetail } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { FamilyMember } from '@/store/familyStore';
import { localDateStr, fmtTime } from '@/lib/dates';
import { buildMonthGrid, toDateStr, parseDate, addDays, MONTH_LABELS } from '../../calendar/components/calendarDateHelpers';
import { assigneeStyle, MultiPersonTimeFill } from '@/features/calendar/components/EventCard';
import { KioskEventEditor } from '../components/KioskEventEditor';
import SmartTaskComposer from '@/features/tasks/components/SmartTaskComposer';
import { AddQuestModal } from '@/features/quests/components/AddQuestModal';
import { AddEventModal } from '@/features/calendar/EventFormModal';
import { AskParentSheet } from '@/features/hub/kid/AskParentSheet';
import { KidChoreProposalModal } from '@/features/hub/kid/KidChoreProposalModal';
import { GroceryModal, SuppliesModal, AskModal, QuestProposalModal } from '@/features/hub/KidModals';
import { KidRequestModal } from '@/features/calendar/KidRequestModal';
import { DayEventsSummaryCard } from '@/features/calendar/components/MonthGridView';
import { useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';

/**
 * Four modes, per the updated reference mockup. `agenda` is new and is the
 * DEFAULT: a flat chronological list is the right opening state for a
 * kitchen display, because the question a kiosk actually answers as you
 * walk past is "what's next", not "what does this month look like". A grid
 * is for planning; a list is for glancing.
 */
type ViewMode = 'agenda' | 'day' | 'week' | 'month';
const VIEW_MODES: ViewMode[] = ['agenda', 'day', 'week', 'month'];

/** How far forward Agenda looks. Two weeks is enough to cover "what's
 *  coming up" without turning the list into a scroll marathon. */
const AGENDA_DAYS = 14;

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

export function KioskScheduleTab({ active, members, colors, isDark }: { active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean }) {
  const rangeEvents = useEventStore(s => s.rangeEvents);
  const rangeLoading = useEventStore(s => s.rangeLoading);
  const loadRange = useEventStore(s => s.loadRange);
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('agenda');
  const [cursor, setCursor] = useState(() => new Date());
  // Live-reported: "in kiosk monthly view is not use right as per current
  // design we are not showing anything if we click on date taking us to day
  // view for that date .. we should show similar to the mobile app" —
  // mobile's own Month view (CalendarScreen.tsx's MonthGridView +
  // DayEventsSummaryCard) never navigates away on a day tap; it just
  // updates which day's events render in a summary card BELOW the grid,
  // so the month stays visible the whole time. Kiosk's month grid was
  // jumping straight to Day view instead, which is a real behavior
  // mismatch, not a deliberate kiosk-scale redesign choice (the grid's own
  // bigger cells/dots ARE a deliberate kiosk redesign per this file's
  // header comment, and stay as-is — only the tap behavior changes here).
  const [selectedDate, setSelectedDate] = useState(() => localDateStr(new Date()));

  // Creation flow — ported verbatim from TasksScreen.tsx's own wiring
  // (features/tasks/TasksScreen.tsx lines ~213-234, ~474-540; same wiring
  // also lives in KioskTasksTab.tsx's KioskBoardView — see its top-of-
  // function comment for the full source mapping). Mobile's real Tasks tab
  // unifies Schedule + Chores creation into this ONE free-text
  // SmartTaskComposer regardless of which segment is active (TasksScreen.tsx
  // line ~208's own "one + regardless of segment" comment) — there is no
  // per-day-anchored "+" in the live unified Tasks tab; CalendarScreen's own
  // inline "+Event" (which used to take a selectedDate) is hidden via
  // hideCreateButton whenever it's embedded there. That means the old
  // KioskEventComposer's per-day prefill (tapping a specific day's "+"
  // pre-filled that date) has NO equivalent once routed through the real
  // SmartTaskComposer, which takes no date-context prop at all — this is a
  // genuine, unavoidable behavior loss from matching mobile exactly, not an
  // oversight. Kid gets the same Kid-safe AskParentSheet mobile uses.
  const isKidCreator = active.role === 'kid';
  // Mobile's real Tasks tab shared FAB (app/(tabs)/_layout.tsx, the button
  // that actually opens SmartTaskComposer) is gated role === 'parent' only
  // — a teen currently has NO creation entry point on the live unified
  // Tasks/Schedule tab at all (its own inline "+Event"/"+Quest" fallback
  // buttons exist in CalendarScreen/QuestsScreen but are hidden via
  // hideCreateButton whenever embedded there, which is always, on the live
  // nav). That's a real, pre-existing gap in mobile itself, not something
  // to invent a fix for here — kiosk must match it exactly rather than
  // quietly granting teen a capability mobile doesn't actually give them.
  const canCreate = active.role === 'parent' || isKidCreator;
  const [showComposer, setShowComposer] = useState(false);
  const [manualQuestPrefill, setManualQuestPrefill] = useState<{
    title?: string; coins?: number; assignedToId?: string; photoRequired?: boolean; dueDate?: string;
  } | undefined>(undefined);
  const [manualEventPrefill, setManualEventPrefill] = useState<{
    title?: string; category?: string; memberId?: string; startAt?: string; notes?: string;
    recurFreq?: 'daily' | 'weekly' | 'monthly'; recurDays?: number[];
    pickupLocation?: string; dropLocation?: string; returnTime?: string; helperId?: string;
  } | undefined>(undefined);
  const [showManualQuest, setShowManualQuest] = useState(false);
  const [showManualEvent, setShowManualEvent] = useState(false);

  const [showAskParentSheet, setShowAskParentSheet] = useState(false);
  const [groceryModal, setGroceryModal] = useState(false);
  const [suppliesModal, setSuppliesModal] = useState(false);
  const [askModal, setAskModal] = useState<null | 'permission' | 'question' | 'medication'>(null);
  const [questProposalModal, setQuestProposalModal] = useState(false);
  const [choreProposalModal, setChoreProposalModal] = useState(false);
  const [rideRequestModal, setRideRequestModal] = useState(false);
  const openCreator = () => { if (isKidCreator) setShowAskParentSheet(true); else setShowComposer(true); };

  // Same idle-lock hold as KioskTasksTab — these creation sheets all
  // render into their own native Modal, so their touches never reach
  // KioskScreen's root onTouchStart and the lock would otherwise fire
  // mid-form and discard the draft. See KioskActivityContext.
  useKioskLockSuspended(
    showComposer || showManualQuest || showManualEvent || showAskParentSheet ||
    groceryModal || suppliesModal || !!askModal || questProposalModal ||
    choreProposalModal || rideRequestModal || editingEvent !== null,
  );

  const todayStr = localDateStr(new Date());

  // Fetch exactly the window the active view needs — a month grid spans up
  // to 6 weeks either side of the calendar month, week/day only need their
  // own narrow slice. Re-fetches whenever the mode or cursor moves.
  useEffect(() => {
    if (viewMode === 'month') {
      const gridStart = buildMonthGrid(cursor.getFullYear(), cursor.getMonth()).find(c => c) ?? toDateStr(cursor);
      const grid = buildMonthGrid(cursor.getFullYear(), cursor.getMonth());
      const gridEnd = [...grid].reverse().find(c => c) ?? gridStart;
      loadRange(gridStart, gridEnd);
    } else if (viewMode === 'week') {
      const ws = startOfWeek(cursor);
      loadRange(toDateStr(ws), toDateStr(addDays(ws, 6)));
    } else if (viewMode === 'agenda') {
      // Agenda looks FORWARD from the cursor rather than around it — its
      // job is "what's coming", so days already past carry no information.
      loadRange(toDateStr(cursor), toDateStr(addDays(cursor, AGENDA_DAYS)));
    } else {
      loadRange(toDateStr(cursor), toDateStr(cursor));
    }
  }, [viewMode, cursor, loadRange]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, FamilyEvent[]> = {};
    for (const ev of rangeEvents) {
      if (filterMemberId) {
        const involved = ev.memberIds?.length ? ev.memberIds : (ev.memberId ? [ev.memberId] : []);
        if (!involved.includes(filterMemberId)) continue;
      }
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [rangeEvents, filterMemberId]);

  const involvedFor = (ev: FamilyEvent) => {
    const ids = ev.memberIds?.length ? ev.memberIds : (ev.memberId ? [ev.memberId] : []);
    return ids.map(id => members.find(m => m.id === id)).filter(Boolean) as FamilyMember[];
  };

  const shiftCursor = (dir: 1 | -1) => {
    if (viewMode === 'month') setCursor(c => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    // Agenda pages by its own window length, so Next/Prev step to the next
    // and previous fortnight rather than nudging one day at a time through
    // a two-week list.
    else if (viewMode === 'week') setCursor(c => addDays(c, dir * 7));
    else if (viewMode === 'agenda') setCursor(c => addDays(c, dir * AGENDA_DAYS));
    else setCursor(c => addDays(c, dir));
  };

  const headerLabel = viewMode === 'month'
    ? `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : viewMode === 'week'
    ? (() => {
        const ws = startOfWeek(cursor);
        const we = addDays(ws, 6);
        return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      })()
    : viewMode === 'agenda'
    ? (() => {
        const ae = addDays(cursor, AGENDA_DAYS);
        const from = toDateStr(cursor) === todayStr
          ? 'Today'
          : cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${from} – ${ae.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      })()
    : cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.navRow}>
            <Pressable onPress={() => shiftCursor(-1)} style={[s.navBtn, { backgroundColor: colors.surface }]} hitSlop={8}
              accessibilityRole="button" accessibilityLabel={`Previous ${viewMode}`}>
              <ChevronLeft size={26} color={colors.textSecondary} />
            </Pressable>
            <View>
              <Text style={[s.title, { color: colors.textPrimary }]}>Schedule</Text>
              <Text style={[s.range, { color: colors.textSecondary }]}>{headerLabel}</Text>
            </View>
            <Pressable onPress={() => shiftCursor(1)} style={[s.navBtn, { backgroundColor: colors.surface }]} hitSlop={8}
              accessibilityRole="button" accessibilityLabel={`Next ${viewMode}`}>
              <ChevronRight size={26} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => setCursor(new Date())} style={[s.todayBtn, { borderColor: colors.border }]}
              accessibilityRole="button" accessibilityLabel="Jump to today">
              <Text style={[s.todayBtnText, { color: colors.textSecondary }]}>Today</Text>
            </Pressable>
          </View>

          <View style={[s.modeSwitch, { backgroundColor: colors.surface }]}>
            {VIEW_MODES.map(mode => {
              const on = viewMode === mode;
              return (
                <Pressable key={mode} onPress={() => setViewMode(mode)}
                  style={[s.modeBtn, on && { backgroundColor: colors.primary }]}
                  accessibilityRole="tab" accessibilityState={{ selected: on }}
                  accessibilityLabel={`${mode[0].toUpperCase() + mode.slice(1)} view`}>
                  <Text style={[s.modeBtnText, { color: on ? '#fff' : colors.textSecondary }]} numberOfLines={1}>
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRowOuter} contentContainerStyle={s.filterRow}>
          <Pressable onPress={() => setFilterMemberId(null)}
            accessibilityRole="button" accessibilityLabel="Show everyone's events"
            accessibilityState={{ selected: !filterMemberId }}
            style={[s.filterChip, { backgroundColor: !filterMemberId ? colors.primary : colors.surface, borderColor: !filterMemberId ? colors.primary : colors.border }]}>
            <Text style={[s.filterText, { color: !filterMemberId ? '#fff' : colors.textSecondary }]}>Everyone</Text>
          </Pressable>
          {members.map(m => {
            const rs = assigneeStyle(m, colors, isDark);
            const on = filterMemberId === m.id;
            return (
              <Pressable key={m.id} onPress={() => setFilterMemberId(on ? null : m.id)}
                accessibilityRole="button"
                accessibilityLabel={`Filter to ${m.name.split(' ')[0]}`}
                accessibilityState={{ selected: on }}
                style={[s.filterChip, { backgroundColor: on ? rs.dot : colors.surface, borderColor: on ? rs.dot : colors.border }]}>
                <Text style={{ fontSize: 20 }}>{m.emoji ?? '👤'}</Text>
                <Text style={[s.filterText, { color: on ? '#fff' : colors.textSecondary }]}>{m.name.split(' ')[0]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {rangeLoading && eventsByDate && Object.keys(eventsByDate).length === 0 && (
        // Only shown while the FIRST fetch for this range is still in
        // flight and nothing's rendered yet — a background refetch (e.g.
        // after switching filters) shouldn't flash this over an already-
        // populated grid. Was previously indistinguishable from "no events
        // this range" (blank grid either way) while a fetch failed or was
        // still loading.
        <View style={s.loadingStrip}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[s.loadingText, { color: colors.textSecondary }]}>Loading schedule…</Text>
        </View>
      )}

      {viewMode === 'month' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <MonthView cursor={cursor} eventsByDate={eventsByDate} todayStr={todayStr} selected={selectedDate} colors={colors} isDark={isDark}
            involvedFor={involvedFor}
            onDayPress={setSelectedDate} />
          <View style={{ paddingHorizontal: 4, paddingTop: 14, gap: 10 }}>
            <DayEventsSummaryCard
              dateLabel={selectedDate === todayStr ? 'Today' : parseDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              events={eventsByDate[selectedDate] ?? []}
              members={members}
              colors={colors} isDark={isDark}
              onSelectEvent={setEditingEvent}
            />
            {/* DayEventsSummaryCard is a pure display component (mobile's
                own Month view has no card-embedded "+" either — creation
                there goes through the screen's own FAB) — Week/Day views in
                this tab both expose their own onAddDay/onAdd "+" already,
                so Month gets the same reachable entry point rather than
                being the one mode with no way to open the composer at all. */}
            {canCreate && (
              <Pressable onPress={openCreator} style={[s.monthAddBtn, { backgroundColor: colors.primary }]}
                accessibilityRole="button" accessibilityLabel="Add for this day">
                <Plus size={24} color="#fff" />
                <Text style={s.monthAddBtnText}>Add for this day</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}
      {viewMode === 'week' && (
        <WeekView cursor={cursor} eventsByDate={eventsByDate} todayStr={todayStr} colors={colors} isDark={isDark}
          involvedFor={involvedFor} onEventPress={setEditingEvent}
          onAddDay={canCreate ? openCreator : undefined} />
      )}
      {viewMode === 'day' && (
        <DayView cursor={cursor} eventsByDate={eventsByDate} colors={colors} isDark={isDark}
          involvedFor={involvedFor} onEventPress={setEditingEvent}
          onAdd={canCreate ? openCreator : undefined} />
      )}
      {viewMode === 'agenda' && (
        <AgendaView
          cursor={cursor} eventsByDate={eventsByDate} todayStr={todayStr}
          colors={colors} isDark={isDark} members={members} active={active}
          involvedFor={involvedFor} onEventPress={setEditingEvent}
          onAdd={canCreate ? openCreator : undefined}
        />
      )}

      <KioskEventEditor event={editingEvent} active={active} onClose={() => setEditingEvent(null)} colors={colors} isDark={isDark} />

      {/* Real creation flow, ported from TasksScreen.tsx lines ~474-540 —
          see this file's top-of-function comment for the full mapping. */}
      <AskParentSheet
        visible={showAskParentSheet} onClose={() => setShowAskParentSheet(false)} colors={colors} isDark={isDark}
        onPick={(choice) => {
          setShowAskParentSheet(false);
          setTimeout(() => {
            if (choice === 'ride') setRideRequestModal(true);
            else if (choice === 'grocery') setGroceryModal(true);
            else if (choice === 'supplies') setSuppliesModal(true);
            else if (choice === 'quest') setQuestProposalModal(true);
            else if (choice === 'chore') setChoreProposalModal(true);
            else setAskModal(choice);
          }, 300);
        }}
      />
      <GroceryModal visible={groceryModal} onClose={() => setGroceryModal(false)} active={active} />
      <SuppliesModal visible={suppliesModal} onClose={() => setSuppliesModal(false)} active={active} />
      {askModal && <AskModal visible={!!askModal} onClose={() => setAskModal(null)} type={askModal} active={active} />}
      <QuestProposalModal visible={questProposalModal} onClose={() => setQuestProposalModal(false)} active={active} />
      <KidChoreProposalModal
        visible={choreProposalModal} onClose={() => setChoreProposalModal(false)}
        active={active} members={members} familyId={active.familyId ?? ''}
      />
      <KidRequestModal visible={rideRequestModal} onClose={() => setRideRequestModal(false)} activeMemberId={active.id} />

      <SmartTaskComposer
        visible={showComposer}
        members={members}
        activeMemberId={active.id}
        familyId={active.familyId ?? ''}
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
          activeMemberId={active.id}
          prefill={manualQuestPrefill}
          initialStep={manualQuestPrefill ? 'review' : undefined}
        />
      )}

      {showManualEvent && (
        <AddEventModal
          visible={showManualEvent}
          onClose={() => { setShowManualEvent(false); setManualEventPrefill(undefined); }}
          activeMemberId={active.id}
          prefill={manualEventPrefill as any}
          initialStep="review"
        />
      )}
    </View>
  );
}

// ── Agenda ───────────────────────────────────────────────────────────────
/**
 * A flat chronological list of what's coming, grouped by day — the updated
 * mockup's new default view, and the right opening state for a kitchen
 * display: as you walk past, the question is "what's next", not "what does
 * this month look like."
 *
 * Two things the mockup's version couldn't do, added here because the real
 * data supports them:
 *
 *  · REAL RIDE STATE. The mockup models a ride as two hand-written linked
 *    rows ("Drop-off" / "Pickup" legs with a `driver` string that may read
 *    "Awaiting Claim"). This app already represents exactly that for real:
 *    eventStore pairs a ride with its pickup leg (linkedEventId /
 *    pickup-leg pairing, see its own recent fixes), and driver state is a
 *    real (driverId, driverName, driverStatus) triple read through the
 *    shared eventAssignee() helper. So the "Claim Ride" button is wired to
 *    claimHelperSlot — a race-safe compare-and-set, NOT a plain
 *    updateEvent. That distinction matters precisely here: two parents can
 *    tap Claim on two devices in the same second, and the loser has to be
 *    told rather than silently overwriting the winner. Routing through the
 *    store action is also what keeps this view from regressing the recent
 *    ride-assignment fixes, since they live inside it.
 *
 *  · SENSITIVITY. A kiosk agenda is legible from across a room. An event
 *    the app itself marks sensitive renders as a neutral busy block for a
 *    viewer who isn't entitled to its detail, using the SAME shared
 *    predicate every other calendar surface calls (canViewSensitiveEventDetail)
 *    rather than a kiosk-local reimplementation of the rule.
 */
function AgendaView({
  cursor, eventsByDate, todayStr, colors, isDark, members, active, involvedFor, onEventPress, onAdd,
}: {
  cursor: Date;
  eventsByDate: Record<string, FamilyEvent[]>;
  todayStr: string;
  colors: any; isDark: boolean;
  members: FamilyMember[];
  active: FamilyMember;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onEventPress: (ev: FamilyEvent) => void;
  onAdd?: () => void;
}) {
  const claimHelperSlot = useEventStore(s => s.claimHelperSlot);
  const [claimNote, setClaimNote] = useState<Record<string, string>>({});

  // Only days that actually have something, forward from the cursor. A
  // fourteen-row list of "No events" is noise, not a calendar.
  const days = useMemo(() => {
    const out: { dateStr: string; events: FamilyEvent[] }[] = [];
    for (let i = 0; i <= AGENDA_DAYS; i++) {
      const dateStr = toDateStr(addDays(cursor, i));
      const evs = eventsByDate[dateStr];
      if (evs?.length) out.push({ dateStr, events: evs });
    }
    return out;
  }, [cursor, eventsByDate]);

  // Claiming writes, so it follows the same rule every other writing action
  // on this shared device does: parents only. A kiosk stays on an active
  // profile for the whole idle window, and anyone walking past the counter
  // would otherwise be able to assign a family driver.
  const canClaim = active.role === 'parent';

  if (days.length === 0) {
    return (
      <ScrollView contentContainerStyle={s.agendaEmptyWrap} showsVerticalScrollIndicator={false}>
        <CalendarIcon size={30} color={colors.textTertiary} />
        <Text style={[s.agendaEmptyText, { color: colors.textTertiary }]} numberOfLines={2}>
          Nothing scheduled in the next two weeks.
        </Text>
        {onAdd && (
          <Pressable
            onPress={onAdd}
            style={[s.monthAddBtn, { backgroundColor: colors.primary, alignSelf: 'center' }]}
            accessibilityRole="button" accessibilityLabel="Add an event"
          >
            <Plus size={22} color="#fff" />
            <Text style={s.monthAddBtnText}>Add an event</Text>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.agendaScroll} showsVerticalScrollIndicator={false}>
      {days.map(({ dateStr, events }) => {
        const d = parseDate(dateStr);
        const isToday = dateStr === todayStr;
        return (
          <View key={dateStr} style={s.agendaGroup}>
            <View style={s.agendaDayHead}>
              <View style={[s.agendaDayBar, { backgroundColor: isToday ? colors.primary : colors.border }]} />
              <Text style={[s.agendaDayLabel, { color: isToday ? colors.primary : colors.textPrimary }]} numberOfLines={1}>
                {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long' })}
              </Text>
              <Text style={[s.agendaDayDate, { color: colors.textTertiary }]} numberOfLines={1}>
                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>

            {events.map(ev => {
              // The shared visibility predicate, not a local copy — see the
              // component header. 'busy-block' means "show that the slot is
              // taken, without the detail"; 'hidden' means omit entirely.
              const vis = canViewSensitiveEventDetail(ev, active.role as any, active.id, active.name);
              if (vis === 'hidden') return null;
              const redacted = vis === 'busy-block';

              const assignee = eventAssignee(ev);
              const primary = involvedFor(ev)[0];
              const rs = assigneeStyle(primary, colors, isDark);
              const isRide = !!assignee.name || /pick ?up|drop ?off|ride/i.test(ev.title);
              const needsDriver = isRide && !assignee.name;
              const note = claimNote[ev.id];

              return (
                <Pressable
                  key={ev.id}
                  onPress={() => !redacted && onEventPress(ev)}
                  disabled={redacted}
                  style={({ pressed }) => [
                    s.agendaRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      borderLeftColor: needsDriver ? colors.primary : rs.dot,
                    },
                    pressed && !redacted && { opacity: 0.75 },
                  ]}
                  accessibilityRole={redacted ? 'text' : 'button'}
                  accessibilityLabel={
                    redacted
                      ? `${ev.time ? fmtTime(ev.time) : 'All day'}, busy`
                      : `${ev.time ? fmtTime(ev.time) : 'All day'}, ${ev.title}` +
                        (assignee.name ? `, ${assignee.name}` : needsDriver ? ', needs a driver' : '')
                  }
                  accessibilityHint={redacted ? undefined : 'Open this event'}
                >
                  <View style={[s.agendaTime, { backgroundColor: colors.amberLight }]}>
                    <Text style={[s.agendaTimeText, { color: colors.amber }]} numberOfLines={1}>
                      {ev.time ? fmtTime(ev.time) : 'All day'}
                    </Text>
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.agendaTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                      {redacted ? 'Busy' : ev.title}
                    </Text>
                    {!redacted && (
                      <Text style={[s.agendaMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {[
                          ev.category || null,
                          primary ? primary.name.split(' ')[0] : null,
                          assignee.name
                            ? `Driver: ${assignee.name.split(' ')[0]}${assignee.status === 'confirmed' ? ' ✓' : ''}`
                            : needsDriver ? 'No driver yet' : null,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    {!!note && (
                      <Text style={[s.agendaNote, { color: colors.textSecondary }]} numberOfLines={2} accessibilityLiveRegion="polite">
                        {note}
                      </Text>
                    )}
                  </View>

                  {/* The mockup's "Claim Ride" — wired to the real race-safe
                      claim, and only offered when there is genuinely an open
                      slot to claim. */}
                  {!redacted && needsDriver && canClaim ? (
                    <Pressable
                      onPress={() => {
                        claimHelperSlot(
                          ev.id, 'driver', active.name, undefined,
                          () => setClaimNote(n => ({ ...n, [ev.id]: 'You have this ride.' })),
                          (msg) => setClaimNote(n => ({ ...n, [ev.id]: msg || 'Someone else claimed it first.' })),
                        );
                      }}
                      style={[s.agendaClaim, { backgroundColor: colors.primary }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Claim the ride for ${ev.title}`}
                      accessibilityHint="Assigns this ride to you"
                    >
                      <Text style={s.agendaClaimText} numberOfLines={1}>Claim ride</Text>
                    </Pressable>
                  ) : !redacted && assignee.status ? (
                    <View style={[s.agendaStatus, {
                      backgroundColor: assignee.status === 'confirmed' ? colors.tealLight : colors.amberLight,
                    }]}>
                      <Text style={[s.agendaStatusText, {
                        color: assignee.status === 'confirmed' ? colors.teal : colors.amber,
                      }]} numberOfLines={1}>
                        {assignee.status === 'confirmed' ? 'Confirmed' : assignee.status === 'rejected' ? "Can't do" : 'Pending'}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {onAdd && (
        <Pressable
          onPress={onAdd}
          style={[s.monthAddBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button" accessibilityLabel="Add an event"
        >
          <Plus size={22} color="#fff" />
          <Text style={s.monthAddBtnText}>Add an event</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ── Month grid ───────────────────────────────────────────────────────────
function MonthView({ cursor, eventsByDate, todayStr, selected, colors, isDark, involvedFor, onDayPress }: {
  cursor: Date; eventsByDate: Record<string, FamilyEvent[]>; todayStr: string; selected: string; colors: any; isDark: boolean;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onDayPress: (dateStr: string) => void;
}) {
  const cells = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const weeks = useMemo(() => {
    const rows: string[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);

  return (
    <View style={s.monthRoot}>
      <View style={s.monthDow}>
        {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => (
          <Text key={d} style={[s.monthDowText, { color: colors.textTertiary }]}>{d}</Text>
        ))}
      </View>
      <View style={s.monthGrid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={s.monthWeekRow}>
            {week.map((dateStr, di) => {
              if (!dateStr) return <View key={di} style={s.monthCell} />;
              const isToday = dateStr === todayStr;
              const dayEvents = eventsByDate[dateStr] ?? [];
              const dayNum = parseDate(dateStr).getDate();
              return (
                <Pressable key={dateStr} onPress={() => onDayPress(dateStr)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: dateStr === selected }}
                  accessibilityLabel={
                    `${parseDate(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}` +
                    (isToday ? ', today' : '') +
                    (dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ', no events')
                  }
                  style={[s.monthCell, s.monthCellFilled, { borderColor: colors.border },
                    isToday && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                  <Text style={[s.monthDayNum, { color: isToday ? colors.primary : colors.textPrimary }]}>{dayNum}</Text>
                  <View style={s.monthDots}>
                    {dayEvents.slice(0, 4).map(ev => {
                      const primary = involvedFor(ev)[0];
                      const rs = assigneeStyle(primary, colors, isDark);
                      return <View key={ev.id} style={[s.monthDot, { backgroundColor: rs.dot }]} />;
                    })}
                    {dayEvents.length > 4 && (
                      <Text style={[s.monthMore, { color: colors.textTertiary }]}>+{dayEvents.length - 4}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Week strip (original design, extracted) ─────────────────────────────
function WeekView({ cursor, eventsByDate, todayStr, colors, isDark, involvedFor, onEventPress, onAddDay }: {
  cursor: Date; eventsByDate: Record<string, FamilyEvent[]>; todayStr: string; colors: any; isDark: boolean;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onEventPress: (ev: FamilyEvent) => void; onAddDay?: () => void;
}) {
  const days = useMemo(() => {
    const ws = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [cursor]);

  return (
    <View style={s.week}>
      {days.map(d => {
        const dateStr = toDateStr(d);
        const isToday = dateStr === todayStr;
        const dayEvents = eventsByDate[dateStr] ?? [];
        return (
          <View key={dateStr} style={s.dayCol}>
            <View style={[s.dayHead, isToday && { borderBottomColor: colors.primary }]}>
              <Text style={[s.dow, { color: colors.textTertiary }]}>{d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</Text>
              <Text style={[s.dnum, { color: isToday ? colors.primary : colors.textPrimary }]}>{d.getDate()}</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {dayEvents.map(ev => {
                const involved = involvedFor(ev);
                const primary = involved[0];
                const rs = assigneeStyle(primary, colors, isDark);
                const multiColors = involved.length > 1 ? involved.map(m => assigneeStyle(m, colors, isDark).dot) : null;
                return (
                  <Pressable key={ev.id} onPress={() => onEventPress(ev)}
                    accessibilityRole="button"
                    accessibilityLabel={`${ev.title}${ev.time ? `, ${fmtTime(ev.time)}` : ', all day'}`}
                    style={[s.evChip, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: rs.dot, overflow: 'hidden' }]}>
                    {multiColors && <MultiPersonTimeFill hexColors={multiColors} scrimColor={colors.card} size={60} radius={0} />}
                    <Text style={[s.evTitle, { color: colors.textPrimary }]} numberOfLines={2}>{ev.title}</Text>
                    {/* Live-reported: raw ev.time ("HH:MM" 24h, the DB's
                        actual stored format) was rendered directly instead
                        of through fmtTime — mobile's own event cards always
                        format via fmtTime (lib/dates.ts), which always
                        produces 12h AM/PM regardless of device locale. */}
                    {!!ev.time && <Text style={[s.evTime, { color: colors.textSecondary }]}>{fmtTime(ev.time)}</Text>}
                    {involved.length > 0 && (
                      <Text style={[s.evWho, { color: rs.dot }]} numberOfLines={1}>
                        {involved.map(m => m.name.split(' ')[0]).join(', ')}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            {onAddDay && (
              <Pressable onPress={onAddDay} style={[s.addDay, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={`Add something on ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}>
                <Plus size={22} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Day — hour-by-hour agenda, richer than a single strip column since a
// day view has the whole kiosk width to spend on it. ──────────────────────
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;

function DayView({ cursor, eventsByDate, colors, isDark, involvedFor, onEventPress, onAdd }: {
  cursor: Date; eventsByDate: Record<string, FamilyEvent[]>; colors: any; isDark: boolean;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onEventPress: (ev: FamilyEvent) => void; onAdd?: () => void;
}) {
  const dateStr = toDateStr(cursor);
  const dayEvents = useMemo(
    () => (eventsByDate[dateStr] ?? []).slice().sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [eventsByDate, dateStr],
  );
  const timed = dayEvents.filter(ev => !!ev.time);
  const allDay = dayEvents.filter(ev => !ev.time);
  const hours = useMemo(() => Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i), []);

  const eventsAtHour = (h: number) => timed.filter(ev => {
    const hr = parseInt(ev.time!.split(':')[0], 10);
    return hr === h;
  });

  return (
    <ScrollView style={s.dayRoot} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {allDay.length > 0 && (
        <View style={s.dayAllDayRow}>
          {allDay.map(ev => {
            const involved = involvedFor(ev);
            const rs = assigneeStyle(involved[0], colors, isDark);
            return (
              <Pressable key={ev.id} onPress={() => onEventPress(ev)}
                accessibilityRole="button"
                accessibilityLabel={`${ev.title}, all day`}
                style={[s.dayAllDayChip, { backgroundColor: rs.badge, borderColor: rs.dot + '55' }]}>
                <Text style={[s.dayAllDayText, { color: rs.text }]} numberOfLines={1}>{ev.title}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {hours.map(h => {
        const hourEvents = eventsAtHour(h);
        const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
        return (
          <View key={h} style={[s.dayHourRow, { borderTopColor: colors.border }]}>
            <Text style={[s.dayHourLabel, { color: colors.textTertiary }]}>{label}</Text>
            <View style={s.dayHourEvents}>
              {hourEvents.map(ev => {
                const involved = involvedFor(ev);
                const rs = assigneeStyle(involved[0], colors, isDark);
                const multiColors = involved.length > 1 ? involved.map(m => assigneeStyle(m, colors, isDark).dot) : null;
                return (
                  <Pressable key={ev.id} onPress={() => onEventPress(ev)}
                    accessibilityRole="button"
                    accessibilityLabel={`${ev.title}, ${fmtTime(ev.time)}`}
                    style={[s.dayEventCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: rs.dot, overflow: 'hidden' }]}>
                    {multiColors && <MultiPersonTimeFill hexColors={multiColors} scrimColor={colors.card} size={60} radius={0} />}
                    <Text style={[s.dayEventTitle, { color: colors.textPrimary }]} numberOfLines={1}>{ev.title}</Text>
                    <Text style={[s.dayEventTime, { color: colors.textSecondary }]}>{fmtTime(ev.time)}{ev.endTime ? ` – ${fmtTime(ev.endTime)}` : ''}</Text>
                    {involved.length > 0 && (
                      <Text style={[s.evWho, { color: rs.dot }]} numberOfLines={1}>
                        {involved.map(m => m.name.split(' ')[0]).join(', ')}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      {onAdd && (
        <Pressable onPress={onAdd} style={[s.dayAddBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button" accessibilityLabel="Add event">
          <Plus size={24} color="#fff" />
          <Text style={s.dayAddBtnText}>Add Event</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ── Rescaled to the kiosk ladder ────────────────────────────────────────
// This tab was the most phone-shaped surface in kiosk: the week strip's
// event chips carried 11px titles, 9.5px times and 9px name lists, and the
// month grid's day numbers were 13px with 7px dots. That is a phone
// calendar rendered wide, not a wall display — none of it is legible from
// where a kitchen tablet is actually read. Every size below moves onto
// KIOSK_TYPO, every control onto KIOSK_HIT, and the month cells gain a
// real minimum height so a 6-week grid doesn't collapse into thin bands.
const s = StyleSheet.create({
  root: { flex: 1, padding: KIOSK_SPACE.lg },
  loadingStrip: { alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xxl },
  loadingText: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  header: { marginBottom: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: KIOSK_SPACE.sm, flexWrap: 'wrap' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  navBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  todayBtn: {
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.min, justifyContent: 'center',
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1.5,
  },
  todayBtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  title: { fontSize: KIOSK_TYPO.title, fontWeight: '800', textAlign: 'center' },
  range: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  // Four modes now, not three (Agenda was added). Horizontal padding
  // tightened from KIOSK_SPACE.lg and the group allowed to shrink, so the
  // switcher fits a narrow/portrait content pane instead of pushing the
  // Add button off the row — the same "let it reflow rather than compute a
  // width" principle the prior pass applied after the Hub clipping bug.
  modeSwitch: {
    flexDirection: 'row', borderRadius: KIOSK_RADIUS.md, padding: 4, gap: 3,
    flexShrink: 1, minWidth: 0,
  },
  modeBtn: {
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.min,
    justifyContent: 'center', borderRadius: KIOSK_RADIUS.sm,
    flexShrink: 1, minWidth: 0,
  },
  modeBtnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  // Horizontal ScrollView needs flexGrow:0 on the ScrollView itself or it
  // stretches to fill leftover vertical space instead of hugging its pills.
  filterRowOuter: { flexGrow: 0 },
  filterRow: { flexDirection: 'row', gap: KIOSK_SPACE.xs, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.min, justifyContent: 'center',
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1.5,
  },
  filterText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },

  // Week
  week: { flex: 1, flexDirection: 'row', gap: KIOSK_SPACE.xs },
  dayCol: { flex: 1, minWidth: 0 },
  dayHead: {
    alignItems: 'center', paddingBottom: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.xs,
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  dow: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1 },
  dnum: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', marginTop: 2 },
  evChip: {
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, borderLeftWidth: 4,
    padding: KIOSK_SPACE.sm, position: 'relative', minHeight: 56,
  },
  evTitle: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  evTime: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 3 },
  evWho: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', marginTop: 4 },
  addDay: {
    marginTop: KIOSK_SPACE.xs, borderWidth: 1.5, borderStyle: 'dashed',
    borderRadius: KIOSK_RADIUS.sm, alignItems: 'center', justifyContent: 'center', minHeight: KIOSK_HIT.min,
  },

  // Month
  monthRoot: { flex: 1 },
  monthDow: { flexDirection: 'row', marginBottom: KIOSK_SPACE.xs },
  monthDowText: { flex: 1, textAlign: 'center', fontSize: KIOSK_TYPO.label, fontWeight: '800', letterSpacing: 1 },
  monthGrid: { flex: 1, gap: KIOSK_SPACE.xs },
  monthWeekRow: { flex: 1, flexDirection: 'row', gap: KIOSK_SPACE.xs },
  monthCell: { flex: 1, minWidth: 0 },
  // minHeight so a 6-row month keeps genuinely tappable day cells rather
  // than six thin bands — this is the primary control in Month view.
  monthCellFilled: { borderRadius: KIOSK_RADIUS.sm, borderWidth: 1, padding: KIOSK_SPACE.sm, minHeight: 88 },
  monthDayNum: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  monthDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: KIOSK_SPACE.xs },
  monthDot: { width: 11, height: 11, borderRadius: 6 },
  monthMore: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },

  // Day
  dayRoot: { flex: 1 },
  dayAllDayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.xs, marginBottom: KIOSK_SPACE.md },
  dayAllDayChip: {
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.min, justifyContent: 'center',
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
  },
  dayAllDayText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  dayHourRow: {
    flexDirection: 'row', minHeight: 72, borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: KIOSK_SPACE.sm, gap: KIOSK_SPACE.md,
  },
  dayHourLabel: { width: 76, fontSize: KIOSK_TYPO.caption, fontWeight: '700', paddingTop: 2 },
  dayHourEvents: { flex: 1, gap: KIOSK_SPACE.xs, minWidth: 0 },
  dayEventCard: {
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1, borderLeftWidth: 5,
    padding: KIOSK_SPACE.md, position: 'relative', minHeight: KIOSK_HIT.control,
  },
  dayEventTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  dayEventTime: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: 4 },
  dayAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.md, minHeight: KIOSK_HIT.primary, marginTop: KIOSK_SPACE.lg,
  },
  dayAddBtnText: { color: '#fff', fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  monthAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.md, minHeight: KIOSK_HIT.primary,
  },
  monthAddBtnText: { color: '#fff', fontSize: KIOSK_TYPO.body, fontWeight: '800' },

  // ── Agenda ─────────────────────────────────────────────────────────────
  agendaScroll: { paddingHorizontal: 4, paddingBottom: 40, gap: KIOSK_SPACE.lg },
  agendaEmptyWrap: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    gap: KIOSK_SPACE.md, padding: KIOSK_SPACE.xl,
  },
  agendaEmptyText: { fontSize: KIOSK_TYPO.subheading, fontWeight: '600', textAlign: 'center' },
  agendaGroup: { gap: KIOSK_SPACE.sm },
  agendaDayHead: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  // A bar rather than a dot: at kiosk distance a dot disappears while a bar
  // still reads as structure. Same device the zone headers use.
  agendaDayBar: { width: 4, height: 18, borderRadius: 2 },
  agendaDayLabel: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', letterSpacing: -0.3 },
  agendaDayDate: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  agendaRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1, borderLeftWidth: 4,
    padding: KIOSK_SPACE.md, minHeight: KIOSK_HIT.primary,
  },
  agendaTime: {
    minWidth: 82, alignItems: 'center',
    borderRadius: KIOSK_RADIUS.sm, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs,
  },
  agendaTimeText: { fontSize: KIOSK_TYPO.caption, fontWeight: '900', fontVariant: ['tabular-nums'] },
  agendaTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  agendaMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 3 },
  agendaNote: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: 4 },
  agendaClaim: {
    borderRadius: KIOSK_RADIUS.md, minHeight: KIOSK_HIT.control,
    paddingHorizontal: KIOSK_SPACE.md, alignItems: 'center', justifyContent: 'center',
  },
  agendaClaimText: { color: '#fff', fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  agendaStatus: {
    borderRadius: KIOSK_RADIUS.full,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.xs,
  },
  agendaStatusText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
});
