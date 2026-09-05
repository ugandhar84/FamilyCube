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
 *
 * KID PARITY. Sensitivity redaction already ran through the shared
 * canViewSensitiveEventDetail predicate, but the other kid-specific
 * behaviors CalendarScreen.tsx applies did not carry over. Now mirrored,
 * each against its phone source: the "My Schedule" title (CalendarScreen
 * .tsx:1070), the default-to-own-events scope (its scheduleFilter 'mine'
 * default, :549) expressed through this tab's existing member-filter pills,
 * the always-on hideForSibling withholding of a sibling's Medical/Ride rows
 * (:835-839), the "ask, don't schedule" empty-state framing (:1432), and
 * routing a kid's own still-pending request to KidRequestModal's edit mode
 * (:569-577, :1709-1713) so they can withdraw it. Creation was already
 * correct (AskParentSheet, never the adult composer), and edit/delete was
 * already gated by the shared deriveEventEditPermission inside
 * KioskEventEditor — so no over-permissioning existed there to close.
 *
 * EVENT-CARD PARITY. The tab's Agenda and Day views each rendered their own
 * simplified event row while the phone's Calendar mounts the full
 * EventCardTimeline (features/calendar/components/EventCard.tsx:499) in its
 * Day timeline (CalendarScreen.tsx:1642). Both now render one shared
 * KioskEventCard carrying every field that card does — category badge,
 * conflict banner, sync-source badge, multi-assignee avatar row (and a
 * parent's assign picker on an unassigned event), driver avatar,
 * Doctor/Subject/Coach, tappable pickup/drop locations, notes, and a real
 * "Approve & Assign" for a kid's pending request. Week and Month stay
 * compact BY DESIGN, matching the phone (its Week uses the compact
 * EventCardRow, its Month a dot grid), and gained only the sensitivity
 * redaction they were missing.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, Platform, Linking } from 'react-native';
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays as CalendarIcon,
  MapPin, AlertTriangle, Stethoscope, BookOpen, Trophy, StickyNote,
  Check, Lock, RefreshCw, Car,
} from 'lucide-react-native';
import FamilyAvatar from '@/components/FamilyAvatar';
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
import { isEventPast } from '@/features/calendar/components/calendarDateHelpers';
import { DayEventsSummaryCard } from '@/features/calendar/components/MonthGridView';
import { useKioskLockSuspended } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, type KioskColors } from '../kioskPalette';

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
  // Mirrors CalendarScreen.tsx's own kid/teen scoping. On the phone that
  // screen defaults scheduleFilter to 'mine' for anyone who isn't a parent
  // (CalendarScreen.tsx:549) and additionally hides a SIBLING's Medical/Ride
  // rows outright from a kid/teen (its hideForSibling, CalendarScreen.tsx:
  // 835-839). Kiosk already has its own member-filter pills, so the cleanest
  // structural equivalent of "My Schedule by default" is to pre-select the
  // kid's own pill instead of Everyone — same effect, kiosk's existing UI
  // pattern, and the kid can still tap Everyone the way phone's "All" tab
  // lets them. The hideForSibling half is NOT expressible via a pill (it's
  // an always-on rule that survives switching to All), so it's applied
  // separately in eventsByDate below.
  const isKidViewer = active.role === 'kid' || active.role === 'teen';
  const [filterMemberId, setFilterMemberId] = useState<string | null>(
    isKidViewer ? active.id : null,
  );
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

  // A kid/teen editing their OWN still-pending request goes through
  // KidRequestModal in edit mode — the same split CalendarScreen.tsx keeps
  // between setEditEv and setKidEditEv (CalendarScreen.tsx:559, 1709-1713).
  // That modal is also the ONLY place a kid gets a delete: its "Withdraw
  // this request" button (KidRequestModal.tsx:581-587). KioskEventEditor
  // deliberately offers a kid no delete at all — deriveEventEditPermission
  // gives them canEditRestricted (notes only), never canEditFull, so its
  // Trash button never renders for them. Kiosk previously routed a kid to
  // that notes-only editor for their own pending request too, which meant a
  // kid could not retract a request from the kiosk the way they can on
  // their phone. Anything else a kid taps — an approved event of their own,
  // any sibling's event, anything already past — still falls through to
  // KioskEventEditor, which renders it read-only for them.
  const [kidEditEvent, setKidEditEvent] = useState<FamilyEvent | null>(null);
  const routeEventPress = (ev: FamilyEvent) => {
    if (isKidViewer
      && ev.memberId === active.id
      && ev.approvalPending
      && !isEventPast(ev.date, ev.time)) {
      setKidEditEvent(ev);
      return;
    }
    setEditingEvent(ev);
  };

  // Same idle-lock hold as KioskTasksTab — these creation sheets all
  // render into their own native Modal, so their touches never reach
  // KioskScreen's root onTouchStart and the lock would otherwise fire
  // mid-form and discard the draft. See KioskActivityContext.
  useKioskLockSuspended(
    showComposer || showManualQuest || showManualEvent || showAskParentSheet ||
    groceryModal || suppliesModal || !!askModal || questProposalModal ||
    choreProposalModal || rideRequestModal || editingEvent !== null ||
    kidEditEvent !== null,
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
      // hideForSibling, ported from CalendarScreen.tsx:835-839. Always-on for
      // a kid/teen regardless of which filter pill is selected — a sibling's
      // Medical appointment or Ride request is withheld even when the kid
      // taps "Everyone", exactly as the phone withholds it even on the "All"
      // tab. This is a privacy rule, not a filter, so it can't live in the
      // pill state above.
      if (isKidViewer) {
        const isOwn = !ev.memberId || ev.memberId === active.id
          || !!ev.memberIds?.includes(active.id);
        if (!isOwn && (ev.category === 'Medical' || ev.category === 'Ride')) continue;
      }
      if (filterMemberId) {
        const involved = ev.memberIds?.length ? ev.memberIds : (ev.memberId ? [ev.memberId] : []);
        // Family-wide events (no assignee at all) always show, matching
        // CalendarScreen's matchesMemberFilter (CalendarScreen.tsx:804) —
        // otherwise a kid defaulted to their own pill would lose every
        // household-wide event (school closure, family dinner) from view.
        if (involved.length > 0 && !involved.includes(filterMemberId)) continue;
      }
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [rangeEvents, filterMemberId, isKidViewer, active.id]);

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
              {/* "My Schedule" for a kid, matching CalendarScreen.tsx:1070's
                  own isKid title swap — the kiosk's default view is now
                  scoped to them, so a "Family Schedule"-style label would
                  misdescribe what's actually on screen. */}
              <Text style={[s.title, { color: colors.textPrimary }]}>
                {active.role === 'kid' ? 'My Schedule' : 'Schedule'}
              </Text>
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
            // The kid's own pill is the one pre-selected for them, so it
            // reads "Mine" rather than their own first name — the same
            // wording as the phone's "My Schedule" tab it stands in for.
            const label = isKidViewer && m.id === active.id ? 'Mine' : m.name.split(' ')[0];
            return (
              <Pressable key={m.id} onPress={() => setFilterMemberId(on ? null : m.id)}
                accessibilityRole="button"
                accessibilityLabel={isKidViewer && m.id === active.id ? 'Show only my events' : `Filter to ${m.name.split(' ')[0]}`}
                accessibilityState={{ selected: on }}
                style={[s.filterChip, { backgroundColor: on ? rs.dot : colors.surface, borderColor: on ? rs.dot : colors.border }]}>
                <Text style={{ fontSize: 20 }}>{m.emoji ?? '👤'}</Text>
                <Text style={[s.filterText, { color: on ? '#fff' : colors.textSecondary }]}>{label}</Text>
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
            active={active}
            involvedFor={involvedFor}
            onDayPress={setSelectedDate} />
          <View style={{ paddingHorizontal: 4, paddingTop: 14, gap: 10 }}>
            <DayEventsSummaryCard
              dateLabel={selectedDate === todayStr ? 'Today' : parseDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              // Month's summary card is the phone's own DayEventsSummaryCard,
              // reused verbatim — it takes an already-filtered list (on the
              // phone CalendarScreen filters before passing) and applies no
              // sensitivity rule of its own, so kiosk must not hand it a raw
              // list. Only 'full' events go in: a busy-block placeholder
              // can't be expressed through this component's props without
              // forking it, and this is a secondary summary beneath the
              // grid, not the surface a viewer relies on to spot a taken
              // slot — Agenda and Day both render the real busy block.
              events={(eventsByDate[selectedDate] ?? []).filter(
                ev => canViewSensitiveEventDetail(ev, active.role as any, active.id, active.name) === 'full',
              )}
              members={members}
              colors={colors} isDark={isDark}
              isViewerParent={active.role === 'parent'}
              onSelectEvent={routeEventPress}
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
          active={active}
          involvedFor={involvedFor} onEventPress={routeEventPress}
          onAddDay={canCreate ? openCreator : undefined} />
      )}
      {viewMode === 'day' && (
        <DayView cursor={cursor} eventsByDate={eventsByDate} colors={colors} isDark={isDark}
          members={members} active={active}
          involvedFor={involvedFor} onEventPress={routeEventPress}
          onAdd={canCreate ? openCreator : undefined} />
      )}
      {viewMode === 'agenda' && (
        <AgendaView
          cursor={cursor} eventsByDate={eventsByDate} todayStr={todayStr}
          colors={colors} isDark={isDark} members={members} active={active}
          onEventPress={routeEventPress}
          onAdd={canCreate ? openCreator : undefined}
        />
      )}

      <KioskEventEditor event={editingEvent} active={active} onClose={() => setEditingEvent(null)} colors={colors} isDark={isDark} />

      {/* A kid/teen's own still-pending request, in the same KidRequestModal
          edit mode CalendarScreen.tsx:1709-1713 uses — carries the
          "Withdraw this request" action, the only delete a kid ever gets.
          Routed here by routeEventPress; see its comment for the gating. */}
      {kidEditEvent && (
        <KidRequestModal
          visible
          onClose={() => setKidEditEvent(null)}
          activeMemberId={active.id}
          editEvent={kidEditEvent}
        />
      )}

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

// ── The rich event card ──────────────────────────────────────────────────
/**
 * KioskEventCard — kiosk's equivalent of the phone's EventCardTimeline
 * (features/calendar/components/EventCard.tsx:499-702), the full "detail
 * density" card CalendarScreen.tsx mounts in its Day timeline
 * (CalendarScreen.tsx:1642-1660).
 *
 * Kiosk's Schedule tab previously rendered a much simpler row: a time chip,
 * the title, and ONE meta line joining category/assignee/driver as plain
 * text. Every detail-bearing element of the phone card was missing. This
 * closes each of them, translated to kiosk's own tokens rather than copied
 * at phone scale:
 *
 *   phone EventCard.tsx:538   category badge          → catBadge below
 *   phone EventCard.tsx:571   conflict banner (isConf)→ conflictRow
 *   phone EventCard.tsx:554   "Synced from …" badge   → syncRow
 *   phone EventCard.tsx:579   For/patient avatar row +
 *                             parent's assign picker  → forRow / picker
 *   phone EventCard.tsx:617   driver/helper avatar    → helperRow
 *   phone EventCard.tsx:634   Doctor/Subject/Coach    → catFields
 *   phone EventCard.tsx:649   pickup/drop LocationLink→ KioskLocationLink
 *   phone EventCard.tsx:667   notes banner            → notesRow
 *   phone EventCard.tsx:674   Approve & Assign        → approvalRow
 *   phone EventCard.tsx:686   kid "awaiting approval" → kidPendingRow
 *
 * Deliberately NOT ported from the phone card:
 *   · The frosted BlurView/LinearGradient glass shell. Kiosk's design layer
 *     (kioskPalette's fill-based elevation, see its header) carries depth
 *     with solid fills and borders precisely because blur/shadow reads as
 *     mud on the kiosk's warm near-black dark ground. Every other kiosk
 *     card on this branch is solid-filled; a glass one here would be the
 *     odd one out.
 *   · The "Hold to edit · Swipe ← to delete" hint line, because kiosk has
 *     no long-press or swipe affordance (see AgendaView's own note on
 *     SwipeableEventCard) — a hint for gestures that don't exist is worse
 *     than none.
 *
 * The card keeps kiosk's OWN existing ride-claim button and status pill,
 * which the phone card has no equivalent of (the phone claims a ride from
 * its detail sheet, not the card) — those are additions kiosk already had
 * and are not regressed here.
 */

// ── LocationLink, kiosk-scaled ───────────────────────────────────────────
// Same behavior as the phone's LocationLink (EventCard.tsx:122-137) — a
// tappable address that opens the platform maps app. Not imported from
// there because that component hardcodes phone-scale type (13px) and an
// icon puck sized for it; at kiosk distance both are illegible and the tap
// target is under KIOSK_HIT. The URL/shortening logic is reproduced
// exactly so the two can't drift on behavior, only on scale.
function shortAddress(addr: string, maxLen = 26): string {
  if (addr.length <= maxLen) return addr;
  const parts = addr.split(',');
  const short = parts.length > 1 ? `${parts[0].trim()}, ${parts[1].trim()}` : addr;
  return short.length <= maxLen + 6 ? short : addr.slice(0, maxLen).trimEnd() + '…';
}
function KioskLocationLink({ addr, k, label }: { addr: string; k: KioskColors; label?: string }) {
  return (
    <Pressable
      onPress={() => {
        const encoded = encodeURIComponent(addr);
        const url = Platform.OS === 'ios'
          ? `https://maps.apple.com/?q=${encoded}`
          : `https://maps.google.com/?q=${encoded}`;
        Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${encoded}`));
      }}
      hitSlop={8}
      style={s.locLink}
      accessibilityRole="link"
      accessibilityLabel={`${label ? `${label}: ` : ''}${addr}`}
      accessibilityHint="Opens this address in Maps"
    >
      <View style={[s.locPuck, { backgroundColor: k.blue }]}>
        <MapPin size={13} color={k.onAccent} />
      </View>
      <Text style={[s.locText, { color: k.blue }]} numberOfLines={1}>{shortAddress(addr)}</Text>
    </Pressable>
  );
}

/**
 * KioskBusyBlock — kiosk's BusyBlockCard (EventCard.tsx:715-731). Same
 * structural guarantee as the phone's: it can only ever render the time,
 * because the time is the only thing it is given. Kiosk previously showed
 * the redacted state as an ordinary event row whose title read "Busy",
 * which meant a redacted event looked identical to a real event actually
 * titled "Busy" and still carried the row's own accent border and time
 * chip colouring derived from the (hidden) assignee.
 */
function KioskBusyBlock({ time, endTime, k }: { time?: string; endTime?: string; k: KioskColors }) {
  const label = `Busy${time ? ` · ${fmtTime(time)}${endTime ? `–${fmtTime(endTime)}` : ''}` : ''}`;
  return (
    <View
      style={[s.busyBlock, { backgroundColor: k.well, borderColor: k.cardBorder }]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Lock size={18} color={k.textFaint} />
      <Text style={[s.busyText, { color: k.textMuted }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Context-aware "for" label, verbatim from CalendarScreen.tsx:1564-1570. */
function forLabelFor(cat: string): string | null {
  return cat === 'Medical' ? 'Patient'
    : cat === 'Sports' ? 'Player'
    : cat === 'Study' ? 'Student'
    : cat === 'Ride' ? 'Passenger'
    : cat === 'Work' ? null // no "for" row on own tasks
    : 'For';
}
/** Context-aware helper label, from CalendarScreen.tsx:1573-1578, minus the
 *  emoji prefixes — kiosk puts a real icon beside the row instead. */
function helperLabelFor(cat: string): string {
  return cat === 'Medical' ? 'Accompanied by'
    : cat === 'Study' ? 'Tutored by'
    : cat === 'Sports' ? 'Drop-off by'
    : cat === 'Ride' ? 'Driven by'
    : 'Organised by';
}

/**
 * Category accent, mapped onto the kiosk palette rather than the phone's
 * raw CAT_COLOR hexes (EventCard.tsx:166-176). Those are fixed Tailwind
 * values chosen against the phone's light ground; several of them (the
 * #3B82F6 School blue, the #10B981 default green) fail contrast on kiosk's
 * warm near-black. Each category is mapped to the nearest kiosk accent,
 * which is contrast-verified in both modes by kioskPalette.
 */
function kioskCatAccent(cat: string, k: KioskColors): { fg: string; soft: string; edge: string } {
  switch (cat) {
    case 'Medical': return { fg: k.danger, soft: k.dangerSoft, edge: k.dangerEdge };
    case 'Work':    return { fg: k.purple, soft: k.purpleSoft, edge: k.purpleEdge };
    case 'Sports':
    case 'Birthday':
    case 'Holiday': return { fg: k.gold, soft: k.goldSoft, edge: k.goldEdge };
    case 'School':
    case 'Study':   return { fg: k.blue, soft: k.blueSoft, edge: k.blueEdge };
    // Live-reported: with Ride mapped to k.primary here, a schedule that's
    // mostly ride/pickup events (the common case) read as almost entirely
    // one reddish color, card after card — worse, k.primary is also the
    // app's main brand/primary-ACTION color, so a Ride card's accent was
    // ambiguous with "this needs attention" rather than reading as its own
    // category. The phone's own CAT_COLOR map (EventCard.tsx) has no
    // 'Ride' entry at all — it falls through to the same default green
    // every uncategorized event gets — so this now matches that exactly
    // instead of inventing a kiosk-only special case.
    default:        return { fg: k.sage, soft: k.sageSoft, edge: k.sageEdge };
  }
}

interface KioskEventCardProps {
  ev: FamilyEvent;
  members: FamilyMember[];
  active: FamilyMember;
  colors: any; isDark: boolean;
  k: KioskColors;
  /** 'agenda' shows the leading time chip; 'day' omits it because the Day
   *  view's own hour gutter already states the hour and the card carries
   *  its own start–end line. */
  density: 'agenda' | 'day';
  onPress: () => void;
  claimNote?: string;
  onClaim?: () => void;
}

function KioskEventCard({
  ev, members, active, colors, isDark, k, density, onPress, claimNote, onClaim,
}: KioskEventCardProps) {
  const updateEvent = useEventStore(st => st.updateEvent);

  const cat = ev.category ?? 'Event';
  const cs = kioskCatAccent(cat, k);
  const isParent = active.role === 'parent';
  const isKid = active.role === 'kid' || active.role === 'teen';
  const isPast = isEventPast(ev.date, ev.time);
  // Read straight off the persisted `conflict` column, exactly as the phone
  // card's caller does (CalendarScreen.tsx:1559 `const isConf = ev.conflict`).
  // The phone's detectRealConflicts (CalendarScreen.tsx:258) is what WRITES
  // that flag via its own AI-panel scan — pure local overlap math, not a
  // model call, but it belongs to the phone's scan-and-resolve panel (Apply
  // Swap, Dismiss), which kiosk has no equivalent of and shouldn't grow
  // here. Kiosk therefore DISPLAYS the conflict the phone detected rather
  // than running its own scan — the flag is a real DB column
  // (eventStore.ts:79, hydrated at :656), so the badge is real data.
  const isConf = !!ev.conflict;
  const accent = isConf ? k.gold : cs.fg;

  const assignee = members.find(m => m.id === ev.memberId);
  const allAssignees = ev.memberIds?.length
    ? members.filter(m => ev.memberIds!.includes(m.id))
    : assignee ? [assignee] : [];
  const forLabel = forLabelFor(cat);

  // Same id-first, name-fallback resolution the phone card uses
  // (EventCard.tsx:512-516).
  const helperAssignee = eventAssignee(ev);
  const helperName = helperAssignee.name;
  const helperMember = helperAssignee.id
    ? members.find(m => m.id === helperAssignee.id)
    : (helperName ? members.find(m => m.name === helperName || m.name.split(' ')[0] === helperName) : undefined);

  // Which members the parent's assign-picker offers, from
  // CalendarScreen.tsx:1587-1589.
  const pickerMembers = cat === 'Work'
    ? members.filter(m => m.role === 'parent' || m.role === 'senior')
    : members.filter(m => m.role === 'kid');
  const canApproveRequest = !isPast && isParent && !!ev.approvalPending;

  const needsDriver = (!!ev.rideRequired || cat === 'Ride' || /pick ?up|drop ?off|ride/i.test(ev.title)) && !helperName;
  const rs = assigneeStyle(allAssignees[0], colors, isDark);
  const siblingNames = members.map(m => m.name);

  const badgeProvider = ev.sourceProvider ?? ev.lastExternalSyncProvider;
  const showSync = !!badgeProvider && badgeProvider !== 'app';
  const providerLabel = badgeProvider === 'google' ? 'Google Calendar'
    : badgeProvider === 'apple' ? 'Apple Calendar' : 'Outlook';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: pressed ? k.cardHover : k.card,
          borderColor: isConf ? k.goldEdge : k.cardBorder,
          // Was `needsDriver ? k.primary : accent` — a kiosk-only override
          // with no phone equivalent (EventCardTimeline's own accent is
          // always cs.dot, category only, regardless of driver status).
          // Combined with Ride's own since-removed k.primary mapping above,
          // a schedule that's mostly driverless rides — the common real
          // case — read as almost every card sharing one reddish accent.
          // The "no driver yet" state is still communicated, just via the
          // existing text label (needsDriver && !isPast below) rather than
          // overriding the card's own category color.
          borderLeftColor: accent,
        },
        isPast && { opacity: 0.55 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        `${ev.time ? fmtTime(ev.time) : 'All day'}, ${ev.title}, ${cat}` +
        (isConf ? ', scheduling conflict' : '') +
        (allAssignees.length ? `, for ${allAssignees.map(m => m.name.split(' ')[0]).join(', ')}` : '') +
        (helperName ? `, ${helperLabelFor(cat).toLowerCase()} ${helperName}` : needsDriver ? ', needs a driver' : '')
      }
      accessibilityHint="Opens this event"
    >
      <View style={s.cardBody}>
        {/* Header — time chip (agenda only), category badge, conflict flag,
            title. Phone: EventCard.tsx:536-546. */}
        <View style={s.cardHead}>
          {density === 'agenda' && (
            <View style={[s.timeChip, { backgroundColor: cs.soft, borderColor: cs.edge }]}>
              <Text style={[s.timeChipText, { color: cs.fg }]} numberOfLines={1}>
                {ev.time ? fmtTime(ev.time) : 'All day'}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={s.badgeRow}>
              <View style={[s.catBadge, { backgroundColor: cs.soft, borderColor: cs.edge }]}>
                <Text style={[s.catBadgeText, { color: cs.fg }]} numberOfLines={1}>{cat.toUpperCase()}</Text>
              </View>
              {isConf && <AlertTriangle size={16} color={k.gold} />}
              {showSync && (
                <View
                  style={[s.syncBadge, { backgroundColor: k.well, borderColor: k.cardBorder }]}
                  accessibilityRole="text"
                  accessibilityLabel={`Synced from ${ev.lastExternalSyncAccount ?? providerLabel}`}
                >
                  <RefreshCw size={12} color={k.textFaint} />
                  <Text style={[s.syncText, { color: k.textFaint }]} numberOfLines={1}>
                    {ev.lastExternalSyncAccount ?? providerLabel}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[s.cardTitle, { color: k.text }]} numberOfLines={2}>{ev.title}</Text>
            {density === 'day' && !!ev.time && (
              <Text style={[s.cardTime, { color: k.textMuted }]} numberOfLines={1}>
                {fmtTime(ev.time)}{ev.endTime ? ` – ${fmtTime(ev.endTime)}` : ''}
              </Text>
            )}
          </View>

          {/* Kiosk's own ride-claim / helper-status affordance. Pre-existing
              behavior, kept as-is and still routed through the race-safe
              claimHelperSlot — see AgendaView's header note. */}
          {onClaim ? (
            <Pressable
              onPress={onClaim}
              style={({ pressed }) => [s.claimBtn, { backgroundColor: pressed ? k.primaryPress : k.primary }]}
              accessibilityRole="button"
              accessibilityLabel={`Claim the ride for ${ev.title}`}
              accessibilityHint="Assigns this ride to you"
            >
              <Car size={16} color={k.onPrimary} />
              <Text style={[s.claimBtnText, { color: k.onPrimary }]} numberOfLines={1}>Claim ride</Text>
            </Pressable>
          ) : helperAssignee.status ? (
            <View style={[s.statusPill, {
              backgroundColor: helperAssignee.status === 'confirmed' ? k.sageSoft
                : helperAssignee.status === 'rejected' ? k.dangerSoft : k.goldSoft,
            }]}
              accessibilityRole="text"
              accessibilityLabel={
                helperAssignee.status === 'confirmed' ? 'Driver confirmed'
                  : helperAssignee.status === 'rejected' ? 'Driver declined' : 'Driver pending'
              }
            >
              <Text style={[s.statusPillText, {
                color: helperAssignee.status === 'confirmed' ? k.sage
                  : helperAssignee.status === 'rejected' ? k.danger : k.gold,
              }]} numberOfLines={1}>
                {helperAssignee.status === 'confirmed' ? 'Confirmed' : helperAssignee.status === 'rejected' ? "Can't do" : 'Pending'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Scheduling conflict banner. Phone: EventCard.tsx:571-576. */}
        {isConf && (
          <View
            style={[s.conflictRow, { backgroundColor: k.goldSoft, borderColor: k.goldEdge }]}
            accessibilityRole="alert"
            accessibilityLabel="Scheduling conflict detected"
          >
            <AlertTriangle size={15} color={k.gold} />
            <Text style={[s.conflictText, { color: k.gold }]} numberOfLines={2}>Scheduling conflict detected</Text>
          </View>
        )}

        {/* For/passenger + driver on ONE row when both are the simple case
            (real assignees, not the parent's assign picker, which still
            gets its own row below — a row of tappable avatar targets reads
            better with room to breathe). Live-reported: each of these used
            to be its own full-width row with a lot of empty space either
            side of one small avatar+name cluster, on a card that already
            has plenty of horizontal room — wasteful, not glanceable.
            Phone: EventCard.tsx:579-613 (for/patient), :617-631 (driver). */}
        {(forLabel && allAssignees.length > 0) || !!helperName ? (
          <View style={s.metaCombinedRow}>
            {forLabel && allAssignees.length > 0 && (
              <View style={s.forCluster}>
                <Text style={[s.metaLabel, { color: k.textFaint }]} numberOfLines={1}>{forLabel}:</Text>
                {allAssignees.map(m => (
                  <View key={m.id} style={s.avatarWithName}>
                    <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl}
                      siblings={siblingNames} size={26} ringColor={rs.dot} ringWidth={2} />
                    <Text style={[s.avatarName, { color: k.textMuted }]} numberOfLines={1}>{m.name.split(' ')[0]}</Text>
                  </View>
                ))}
              </View>
            )}
            {!!helperName && (
              <View style={s.forCluster}>
                <Text style={[s.metaLabel, { color: k.textFaint }]} numberOfLines={1}>{helperLabelFor(cat)}:</Text>
                {helperMember ? (
                  <View style={s.avatarWithName}>
                    <FamilyAvatar name={helperMember.name} emoji={helperMember.emoji} avatarUrl={(helperMember as any).avatarUrl}
                      siblings={siblingNames} size={26} ringColor={k.blue} ringWidth={2} />
                    <Text style={[s.avatarName, { color: k.text }]} numberOfLines={1}>{helperMember.name.split(' ')[0]}</Text>
                  </View>
                ) : (
                  // A genuinely external non-member (a coach, a neighbour) has
                  // no avatar to draw — same fallback the phone card takes.
                  <Text style={[s.helperName, { color: k.text }]} numberOfLines={1}>{helperName}</Text>
                )}
              </View>
            )}
            {!!ev.location && <KioskLocationLink addr={ev.location} k={k} label="Location" />}
          </View>
        ) : null}

        {/* Unassigned event: either a parent's assign picker (its own row —
            a row of tappable targets needs its own room) or a plain dash.
            Phone: EventCard.tsx:592-607. */}
        {forLabel && allAssignees.length === 0 && (
          <View style={s.forRow}>
            {!isPast && isParent && pickerMembers.length > 0 ? (
              <View style={s.forCluster}>
                <Text style={[s.metaLabel, { color: k.textMuted }]} numberOfLines={1}>{forLabel}:</Text>
                {pickerMembers.map(m => {
                  const on = ev.memberId === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      // Same store write the phone's picker makes
                      // (CalendarScreen.tsx:1657 → updateEvent(id,{memberId})).
                      onPress={() => updateEvent(ev.id, { memberId: m.id })}
                      hitSlop={6}
                      style={s.pickerCell}
                      accessibilityRole="button"
                      accessibilityLabel={`Assign this event to ${m.name.split(' ')[0]}`}
                      accessibilityState={{ selected: on }}
                    >
                      <FamilyAvatar name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl}
                        siblings={pickerMembers.map(x => x.name)} size={36}
                        ringColor={on ? k.primary : k.cardBorderStrong} ringWidth={on ? 3 : 1.5} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={[s.metaLabel, { color: k.textFaint }]} numberOfLines={1}>{forLabel}: —</Text>
            )}
            {!!ev.location && <KioskLocationLink addr={ev.location} k={k} label="Location" />}
          </View>
        )}
        {needsDriver && !isPast && (
          <Text style={[s.needsDriver, { color: k.primary }]} numberOfLines={1}>No driver yet</Text>
        )}
        {helperAssignee.status === 'rejected' && !!ev.declineReason && (
          <Text style={[s.declineReason, { color: k.danger }]} numberOfLines={2}>"{ev.declineReason}"</Text>
        )}

        {/* Category-specific fields. Phone: EventCard.tsx:634-664. */}
        {cat === 'Medical' && !!ev.doctorName && (
          <View style={s.fieldRow}>
            <Stethoscope size={15} color={k.textMuted} />
            <Text style={[s.fieldLabel, { color: k.textMuted }]} numberOfLines={1}>Doctor:</Text>
            <Text style={[s.fieldValue, { color: k.text }]} numberOfLines={1}>{ev.doctorName}</Text>
          </View>
        )}
        {cat === 'Study' && !!ev.subject && (
          <View style={s.fieldRow}>
            <BookOpen size={15} color={k.textMuted} />
            <Text style={[s.fieldLabel, { color: k.textMuted }]} numberOfLines={1}>Subject:</Text>
            <Text style={[s.fieldValue, { color: k.text }]} numberOfLines={1}>{ev.subject}</Text>
          </View>
        )}
        {cat === 'Sports' && !!ev.coachName && (
          <View style={s.fieldRow}>
            <Trophy size={15} color={k.textMuted} />
            <Text style={[s.fieldLabel, { color: k.textMuted }]} numberOfLines={1}>Coached by:</Text>
            <Text style={[s.fieldValue, { color: k.text }]} numberOfLines={1}>{ev.coachName}</Text>
          </View>
        )}
        {(cat === 'Ride' || cat === 'Sports') && (!!ev.pickupLocation || !!ev.dropLocation) && (
          <View style={s.legRow}>
            {!!ev.pickupLocation && (
              <View style={s.legCell}>
                <Text style={[s.fieldLabel, { color: k.textMuted }]} numberOfLines={1}>From</Text>
                <KioskLocationLink addr={ev.pickupLocation} k={k} label="Pickup" />
              </View>
            )}
            {!!ev.dropLocation && (
              <View style={s.legCell}>
                <Text style={[s.fieldLabel, { color: k.textMuted }]} numberOfLines={1}>To</Text>
                <KioskLocationLink addr={ev.dropLocation} k={k} label="Drop-off" />
              </View>
            )}
          </View>
        )}

        {/* Notes banner. Phone: EventCard.tsx:667-671. */}
        {!!ev.notes && (
          <View style={[s.notesRow, { backgroundColor: k.primarySoft, borderColor: k.primaryEdge }]}>
            <StickyNote size={15} color={k.primary} />
            <Text style={[s.notesText, { color: k.primary }]} numberOfLines={3}>"{ev.notes}"</Text>
          </View>
        )}

        {/* Kid request awaiting a parent's approval — the parent's side.
            Phone: EventCard.tsx:674-684, whose onApprove is wired at
            CalendarScreen.tsx:1658 to exactly this updateEvent call. This is
            a DIFFERENT flow from kiosk's existing ride-CLAIMING (which
            assigns a driver to an already-approved event); a kid's own
            request had no approval path on the kiosk at all. */}
        {canApproveRequest && (
          <View style={[s.approvalRow, { borderTopColor: k.cardBorder }]}>
            <View style={s.approvalLabel}>
              <AlertTriangle size={15} color={k.gold} />
              <Text style={[s.approvalText, { color: k.gold }]} numberOfLines={1}>Request pending</Text>
            </View>
            <Pressable
              onPress={() => updateEvent(ev.id, { approvalPending: false, helperStatus: 'pending' })}
              style={({ pressed }) => [s.approveBtn, { backgroundColor: pressed ? k.primaryPress : k.sage }]}
              accessibilityRole="button"
              accessibilityLabel={`Approve and assign ${ev.title}`}
              accessibilityHint="Approves this request and puts it on the schedule"
            >
              <Check size={16} color={k.onAccent} />
              <Text style={[s.approveBtnText, { color: k.onAccent }]} numberOfLines={1}>Approve &amp; Assign</Text>
            </Pressable>
          </View>
        )}

        {/* The kid's own side of the same state. Phone: EventCard.tsx:686-691. */}
        {!isPast && isKid && !!ev.approvalPending && (
          <View style={[s.approvalRow, { borderTopColor: k.cardBorder, justifyContent: 'flex-start' }]}>
            <AlertTriangle size={15} color={k.gold} />
            <Text style={[s.approvalText, { color: k.gold }]} numberOfLines={2}>Awaiting parent approval…</Text>
          </View>
        )}

        {!!claimNote && (
          <Text style={[s.claimNote, { color: k.textMuted }]} numberOfLines={2} accessibilityLiveRegion="polite">
            {claimNote}
          </Text>
        )}
      </View>
    </Pressable>
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
  cursor, eventsByDate, todayStr, colors, isDark, members, active, onEventPress, onAdd,
}: {
  cursor: Date;
  eventsByDate: Record<string, FamilyEvent[]>;
  todayStr: string;
  colors: any; isDark: boolean;
  members: FamilyMember[];
  active: FamilyMember;
  onEventPress: (ev: FamilyEvent) => void;
  onAdd?: () => void;
}) {
  const { k } = useKioskColors();
  const claimHelperSlot = useEventStore(st => st.claimHelperSlot);
  const [claimNote, setClaimNote] = useState<Record<string, string>>({});
  const isKidViewer = active.role === 'kid' || active.role === 'teen';

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
        {/* Kid-specific framing, ported from CalendarScreen.tsx:1432 — a kid
            doesn't schedule, they ASK, and the button below opens
            AskParentSheet rather than an event form, so generic "Add an
            event" copy would promise authority they don't have. */}
        <Text style={[s.agendaEmptyText, { color: colors.textTertiary }]} numberOfLines={3}>
          {isKidViewer
            ? 'Nothing on your schedule for the next two weeks. Tap below to ask for a ride or anything else.'
            : 'Nothing scheduled in the next two weeks.'}
        </Text>
        {onAdd && (
          <Pressable
            onPress={onAdd}
            style={[s.monthAddBtn, { backgroundColor: colors.primary, alignSelf: 'center' }]}
            accessibilityRole="button"
            accessibilityLabel={isKidViewer ? 'Ask a parent' : 'Add an event'}
          >
            <Plus size={22} color="#fff" />
            <Text style={s.monthAddBtnText}>{isKidViewer ? 'Ask a parent' : 'Add an event'}</Text>
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
              // Redacted rows go through KioskBusyBlock, which — like the
              // phone's BusyBlockCard (EventCard.tsx:715) — structurally
              // cannot leak a detail because the time is all it receives.
              // Previously this rendered the ordinary row with its title
              // swapped to "Busy", which still exposed the (assignee-
              // derived) accent colour and looked identical to a real event
              // genuinely titled "Busy".
              if (vis === 'busy-block') {
                return <KioskBusyBlock key={ev.id} time={ev.time} endTime={ev.endTime} k={k} />;
              }

              const assignee = eventAssignee(ev);
              const isRide = !!ev.rideRequired || ev.category === 'Ride' || /pick ?up|drop ?off|ride/i.test(ev.title);
              const needsDriver = isRide && !assignee.name;

              return (
                <KioskEventCard
                  key={ev.id}
                  ev={ev}
                  members={members}
                  active={active}
                  colors={colors} isDark={isDark}
                  k={k}
                  density="agenda"
                  onPress={() => onEventPress(ev)}
                  claimNote={claimNote[ev.id]}
                  // The mockup's "Claim Ride" — wired to the real race-safe
                  // claim, and only offered when there is genuinely an open
                  // slot to claim.
                  onClaim={needsDriver && canClaim ? () => {
                    claimHelperSlot(
                      ev.id, 'driver', active.name, undefined,
                      () => setClaimNote(n => ({ ...n, [ev.id]: 'You have this ride.' })),
                      (msg) => setClaimNote(n => ({ ...n, [ev.id]: msg || 'Someone else claimed it first.' })),
                    );
                  } : undefined}
                />
              );
            })}
          </View>
        );
      })}

      {onAdd && (
        <Pressable
          onPress={onAdd}
          style={[s.monthAddBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={isKidViewer ? 'Ask a parent' : 'Add an event'}
        >
          <Plus size={22} color="#fff" />
          <Text style={s.monthAddBtnText}>{isKidViewer ? 'Ask a parent' : 'Add an event'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ── Month grid ───────────────────────────────────────────────────────────
// Month stays a GRID of dots by design — the phone's own Month view is a
// grid too (MonthGridView), and a rich card inside a 7-across day cell
// would be unreadable. The only parity work it needs is the sensitivity
// rule: a 'hidden' event must not contribute a dot (that leaks that
// something exists), while a 'busy-block' one must (its whole purpose is
// signalling the slot is taken).
function MonthView({ cursor, eventsByDate, todayStr, selected, colors, isDark, active, involvedFor, onDayPress }: {
  cursor: Date; eventsByDate: Record<string, FamilyEvent[]>; todayStr: string; selected: string; colors: any; isDark: boolean;
  active: FamilyMember;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onDayPress: (dateStr: string) => void;
}) {
  const { k } = useKioskColors();
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
              const dayEvents = (eventsByDate[dateStr] ?? []).filter(
                ev => canViewSensitiveEventDetail(ev, active.role as any, active.id, active.name) !== 'hidden',
              );
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
                      // A busy-block event still gets a dot (the slot IS
                      // taken) but a NEUTRAL one — its assignee-derived
                      // colour would identify who the hidden event belongs
                      // to, which is exactly the detail redaction withholds.
                      const redacted = canViewSensitiveEventDetail(ev, active.role as any, active.id, active.name) !== 'full';
                      const primary = involvedFor(ev)[0];
                      const rs = assigneeStyle(primary, colors, isDark);
                      return <View key={ev.id} style={[s.monthDot, { backgroundColor: redacted ? k.textFaint : rs.dot }]} />;
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
function WeekView({ cursor, eventsByDate, todayStr, colors, isDark, active, involvedFor, onEventPress, onAddDay }: {
  cursor: Date; eventsByDate: Record<string, FamilyEvent[]>; todayStr: string; colors: any; isDark: boolean;
  active: FamilyMember;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onEventPress: (ev: FamilyEvent) => void; onAddDay?: () => void;
}) {
  const { k } = useKioskColors();
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
                // Week stays deliberately COMPACT — a seven-column strip is
                // a glance surface, and the phone's own Week view uses the
                // compact EventCardRow (EventCard.tsx:208), never the rich
                // EventCardTimeline. It does, however, need the same
                // sensitivity redaction Agenda/Day apply; it previously had
                // none, so a sensitive title leaked here.
                const vis = canViewSensitiveEventDetail(ev, active.role as any, active.id, active.name);
                if (vis === 'hidden') return null;
                if (vis === 'busy-block') {
                  return (
                    <View key={ev.id} style={[s.evChip, { backgroundColor: k.well, borderColor: k.cardBorder, borderLeftColor: k.cardBorderStrong }]}
                      accessibilityRole="text" accessibilityLabel={`Busy${ev.time ? `, ${fmtTime(ev.time)}` : ''}`}>
                      <Text style={[s.evTitle, { color: k.textMuted }]} numberOfLines={1}>🔒 Busy</Text>
                      {!!ev.time && <Text style={[s.evTime, { color: k.textFaint }]} numberOfLines={1}>{fmtTime(ev.time)}</Text>}
                    </View>
                  );
                }
                const involved = involvedFor(ev);
                const primary = involved[0];
                const rs = assigneeStyle(primary, colors, isDark);
                const multiColors = involved.length > 1 ? involved.map(m => assigneeStyle(m, colors, isDark).dot) : null;
                return (
                  <Pressable key={ev.id} onPress={() => onEventPress(ev)}
                    accessibilityRole="button"
                    accessibilityLabel={`${ev.title}${ev.time ? `, ${fmtTime(ev.time)}` : ', all day'}`}
                    accessibilityHint="Opens this event"
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

function DayView({ cursor, eventsByDate, colors, isDark, members, active, involvedFor, onEventPress, onAdd }: {
  cursor: Date; eventsByDate: Record<string, FamilyEvent[]>; colors: any; isDark: boolean;
  members: FamilyMember[]; active: FamilyMember;
  involvedFor: (ev: FamilyEvent) => FamilyMember[];
  onEventPress: (ev: FamilyEvent) => void; onAdd?: () => void;
}) {
  const { k } = useKioskColors();
  const claimHelperSlot = useEventStore(st => st.claimHelperSlot);
  const [claimNote, setClaimNote] = useState<Record<string, string>>({});
  const canClaim = active.role === 'parent';
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
            // Day view previously applied NO sensitivity redaction at all —
            // only Agenda did — so a sensitive event a viewer isn't
            // entitled to read leaked its full title here. Same shared
            // predicate, same three states.
            const vis = canViewSensitiveEventDetail(ev, active.role as any, active.id, active.name);
            if (vis === 'hidden') return null;
            if (vis === 'busy-block') {
              return (
                <View key={ev.id} style={[s.dayAllDayChip, { backgroundColor: k.well, borderColor: k.cardBorder, flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs }]}
                  accessibilityRole="text" accessibilityLabel="Busy, all day">
                  <Lock size={15} color={k.textFaint} />
                  <Text style={[s.dayAllDayText, { color: k.textMuted }]} numberOfLines={1}>Busy</Text>
                </View>
              );
            }
            const involved = involvedFor(ev);
            const rs = assigneeStyle(involved[0], colors, isDark);
            return (
              <Pressable key={ev.id} onPress={() => onEventPress(ev)}
                accessibilityRole="button"
                accessibilityLabel={`${ev.title}, all day`}
                accessibilityHint="Opens this event"
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
                const vis = canViewSensitiveEventDetail(ev, active.role as any, active.id, active.name);
                if (vis === 'hidden') return null;
                if (vis === 'busy-block') {
                  return <KioskBusyBlock key={ev.id} time={ev.time} endTime={ev.endTime} k={k} />;
                }
                const assignee = eventAssignee(ev);
                const isRide = !!ev.rideRequired || ev.category === 'Ride' || /pick ?up|drop ?off|ride/i.test(ev.title);
                const needsDriver = isRide && !assignee.name;
                return (
                  // Day is the phone's own "detail density" — CalendarScreen
                  // .tsx mounts the full EventCardTimeline in exactly this
                  // view (:1642) — so it gets the same rich card Agenda now
                  // does, minus the leading time chip (the hour gutter to
                  // the left already states the hour).
                  <KioskEventCard
                    key={ev.id}
                    ev={ev}
                    members={members}
                    active={active}
                    colors={colors} isDark={isDark}
                    k={k}
                    density="day"
                    onPress={() => onEventPress(ev)}
                    claimNote={claimNote[ev.id]}
                    onClaim={needsDriver && canClaim ? () => {
                      claimHelperSlot(
                        ev.id, 'driver', active.name, undefined,
                        () => setClaimNote(n => ({ ...n, [ev.id]: 'You have this ride.' })),
                        (msg) => setClaimNote(n => ({ ...n, [ev.id]: msg || 'Someone else claimed it first.' })),
                      );
                    } : undefined}
                  />
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
  // Day's own per-hour event card is gone — that view now renders the
  // shared KioskEventCard (`card`/`cardBody` below) at 'day' density.
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
  // Agenda's own simplified row (time chip + title + one joined meta line)
  // is gone — it now renders the shared KioskEventCard below at 'agenda'
  // density, which carries every field the phone's EventCardTimeline does.

  // ── The rich event card (Agenda + Day) ─────────────────────────────────
  // Solid-filled, not the phone card's frosted glass — see KioskEventCard's
  // own header for why. The 5px left edge is the accent carrier, matching
  // every other kiosk card on this branch.
  // Live-reported: on a wide landscape kiosk, this card had no width cap
  // at all and stretched edge-to-edge — a lot of bare card background
  // either side of what's usually just a time chip, a title and a couple
  // of badges. Capped, not removed: a card still fills a narrower/portrait
  // width naturally (maxWidth only bites once the scroll container is
  // wider than this), so this doesn't regress the narrow-width layout.
  card: {
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1, borderLeftWidth: 5,
    minHeight: KIOSK_HIT.primary, width: '100%', maxWidth: 720, alignSelf: 'center',
  },
  cardBody: { padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.md },
  timeChip: {
    minWidth: 86, alignItems: 'center', justifyContent: 'center',
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs,
  },
  timeChipText: { fontSize: KIOSK_TYPO.caption, fontWeight: '900', fontVariant: ['tabular-nums'] },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, flexWrap: 'wrap' },
  catBadge: {
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 2,
  },
  catBadgeText: { fontSize: KIOSK_TYPO.micro, fontWeight: '900', letterSpacing: 0.6 },
  syncBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.xs, paddingVertical: 2, maxWidth: 180,
  },
  syncText: { fontSize: KIOSK_TYPO.micro, fontWeight: '700', flexShrink: 1 },
  cardTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', letterSpacing: -0.2 },
  cardTime: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', fontVariant: ['tabular-nums'] },
  claimBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.md, minHeight: KIOSK_HIT.control,
    paddingHorizontal: KIOSK_SPACE.md, flexShrink: 0,
  },
  claimBtnText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  statusPill: {
    borderRadius: KIOSK_RADIUS.full, flexShrink: 0,
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.xs,
  },
  statusPillText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  conflictRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs,
  },
  conflictText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', flexShrink: 1 },
  forRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: KIOSK_SPACE.sm,
  },
  // Passenger + driver clusters share this one row (with a wider gap
  // between the two clusters than within one), instead of each getting
  // its own full-width row — see the render-site comment for why.
  metaCombinedRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    columnGap: KIOSK_SPACE.lg, rowGap: KIOSK_SPACE.xs,
  },
  forCluster: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, flexWrap: 'wrap', flexShrink: 1 },
  avatarWithName: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatarName: { fontSize: KIOSK_TYPO.label, fontWeight: '800', maxWidth: 110 },
  // The picker's own cells are the tap target, so they carry the padding
  // that brings a 36px avatar up to a kiosk-legal hit area.
  pickerCell: { padding: 6, borderRadius: KIOSK_RADIUS.full },
  metaLabel: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  helperRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, flexWrap: 'wrap' },
  helperName: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', flexShrink: 1 },
  needsDriver: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  declineReason: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', fontStyle: 'italic' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, flexWrap: 'wrap' },
  fieldLabel: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  fieldValue: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', flexShrink: 1 },
  legRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  legCell: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, flexShrink: 1 },
  locLink: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, flexShrink: 1 },
  locPuck: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  locText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', flexShrink: 1 },
  notesRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm,
  },
  notesText: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', fontStyle: 'italic', flexShrink: 1 },
  approvalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: KIOSK_SPACE.sm,
    borderTopWidth: 1, paddingTop: KIOSK_SPACE.sm, marginTop: 2,
  },
  approvalLabel: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs, flexShrink: 1 },
  approvalText: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', flexShrink: 1 },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.md, minHeight: KIOSK_HIT.control,
    paddingHorizontal: KIOSK_SPACE.md, flexShrink: 0,
  },
  approveBtnText: { fontSize: KIOSK_TYPO.body, fontWeight: '900' },
  claimNote: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  busyBlock: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.md, minHeight: KIOSK_HIT.control,
  },
  busyText: { fontSize: KIOSK_TYPO.body, fontWeight: '800', flexShrink: 1 },
});
