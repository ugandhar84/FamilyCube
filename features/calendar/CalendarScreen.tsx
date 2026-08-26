/**
 * CalendarScreen — 100% port of gemini-code ScheduleView to React Native.
 *
 * RBAC rules:
 *  - Parent:  + Event, Range, AI Conflict Scan, approve/reject kid requests,
 *             assign member to event, reassign/swap driver
 *  - Senior:  Accept / Decline rides assigned to them; view all events; no AI banner
 *  - Kid:     + Ask Help/Ride button; Accept/Decline rides where they're the named driver;
 *             Withdraw their own requests; NO event creation
 *
 * Real-world edge cases:
 *  - Driver declines → amber "Declined" badge + parent sees Reassign Driver button
 *  - Conflict flag → amber-bordered card + AI surfaces it with 1-click swap
 *  - approvalPending → parent sees Approve & Claim; kid sees "Awaiting parent approval"
 *  - Pending ride request → note field + Accept / Decline / Reassign / Withdraw
 *  - Decline input: 4 presets + custom 150-char field (real decline reason saved to event)
 *  - AI runs simulated conflict detection; 1-click driver swap stored back into event
 *  - Category dots on day strip: Medical=red, Work=purple, Sports=amber, School=blue
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Pressable,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Animated, PanResponder, Linking, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType, StripMap, StripRow, isEventSensitive, canViewSensitiveEventDetail, SensitiveEventVisibility } from '@/store/eventStore';
import { supabase } from '@/lib/supabase';
import AppHeader from '@/components/AppHeader';
import NotificationPanel from '@/components/NotificationPanel';
import { useNotifStore } from '@/store/notifStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { TYPO } from '@/constants/theme';
import { fmtDate, fmtDateShort, fmtTimeParts } from '@/lib/dates';
import { AddEventModal as EventFormAdd, EditEventModal } from './EventFormModal';
import { KidRequestModal } from './KidRequestModal';
import { EventDetailSheet } from '@/features/hub/hubComponents';
import { useChatStore } from '@/store/chatStore';
import { relationalNameByName } from '@/lib/format';
import { EventCardTimeline, BusyBlockCard, roleStyle, catStyle, LocationLink } from './components/EventCard';
import { s as calCardStyles } from './components/calendarCardStyles';
import { AiConflictBanner, type AiConflict, type AiResult } from './components/AiConflictBanner';
import { CalendarSearchBar } from './components/CalendarSearchBar';
import { toDateStr, parseDate, addDays, DAY_SHORT, CAT_DOT, buildMonthGrid, isEventPast, collapseSeries } from './components/calendarDateHelpers';
import MonthGridView, { DayEventsSummaryCard } from './components/MonthGridView';
import WeekView from './components/WeekView';
import AgendaView from './components/AgendaView';
import DaySlotView from './components/DaySlotView';
import { eventAssigneeRole } from '@/features/tasks/lib/deriveCardActions';

// ─── Date helpers ─────────────────────────────────────────────────────────────
// Minutes until a today-dated event starts; Infinity for other days / no time set
function minutesUntilEvent(date: string, time?: string | null): number {
  const today = toDateStr(new Date());
  if (date !== today || !time) return Infinity;
  const [h, m] = time.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  return Math.round((target.getTime() - Date.now()) / 60000);
}

// ─── Urgency pulse — gradient glow that breathes for time-sensitive cards ──────
function UrgentPulse() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity, borderRadius: 16 }]}>
      <LinearGradient
        colors={['#F59E0B', '#EF4444']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ flex: 1, borderRadius: 16, opacity: 0.16 }}
      />
    </Animated.View>
  );
}
function get15Days(center: string): string[] {
  const base = parseDate(center);
  // Mon-first: start from Monday of the week containing center, show 15 days
  const dayOfWeek = (base.getDay() + 6) % 7; // Mon=0
  return Array.from({ length: 15 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate() - dayOfWeek + i); return toDateStr(d);
  });
}

function currentWeekBounds() {
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7;
  const mon = new Date(today); mon.setDate(today.getDate() - dayOfWeek);
  const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
  return { start: toDateStr(mon), end: toDateStr(sun) };
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  Bot: ({ c, size=16 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 8h18a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2v-9a2 2 0 012-2z" stroke={c} strokeWidth={2} fill="none" />
      <Path d="M9 3h6M12 3v5" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={9} cy={14} r={1.5} fill={c} />
      <Circle cx={15} cy={14} r={1.5} fill={c} />
      <Path d="M9 18c0-1 1.3-2 3-2s3 1 3 2" stroke={c} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  AlertTriangle: ({ c, size=12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10.3 3.5L1.5 19a2 2 0 001.7 3h19.6a2 2 0 001.7-3L15.7 3.5a2 2 0 00-3.4 0z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M12 9v5M12 17v1" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Shield: ({ c, size=13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 22C12 22 4 18 4 12V5l8-3 8 3v7c0 6-8 10-8 10z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M9 12l2 2 4-4" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Check: ({ c, size=13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 13l4 4L19 7" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Car: ({ c, size=13 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 11l1.5-4.5h11L19 11M3 11h18v7H3v-7z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Circle cx={7} cy={18} r={2} stroke={c} strokeWidth={2} fill="none" />
      <Circle cx={17} cy={18} r={2} stroke={c} strokeWidth={2} fill="none" />
    </Svg>
  ),
  MapPin: ({ c, size=11 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" stroke={c} strokeWidth={2} fill="none" />
      <Circle cx={12} cy={10} r={3} stroke={c} strokeWidth={2} fill="none" />
    </Svg>
  ),
  Arrows: ({ c, size=12 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  Plus: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" stroke={c} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  ChevronDown: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 9l6 6 6-6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  ChevronUp: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 15l-6-6-6 6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  ChevronLeft: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 18l-6-6 6-6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  ChevronRight: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  HelpCircle: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Calendar: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M3 6a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" stroke={c} strokeWidth={2} fill="none" />
        <Path d="M8 2v4M16 2v4M3 10h18" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      </Svg>
    </Svg>
  ),
  X: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  List: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  User: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={12} cy={7} r={4} stroke={c} strokeWidth={2} fill="none" />
    </Svg>
  ),
  FileText: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
  Refresh: ({ c, size=14 }: { c: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M23 4v6h-6M1 20v-6h6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M3.5 9A9 9 0 0121 15M20.5 15A9 9 0 013 9" stroke={c} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  ),
};

// ─── AI Simulation ────────────────────────────────────────────────────────────
// AiConflict/AiResult types now live in ./components/AiConflictBanner
// (imported above) — role/category color helpers moved to ./components/EventCard.

// Minutes-since-midnight for a "h:mm AM/PM" or "HH:mm" time string — returns
// null for anything unparsable (all-day events, missing time) so callers can
// skip those rather than treating them as a false midnight overlap.
function parseTimeToMinutes(t?: string): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function eventMemberIds(e: FamilyEvent): string[] {
  if (e.memberIds?.length) return e.memberIds;
  return e.memberId ? [e.memberId] : [];
}

// Real overlap detection replacing the old fake version, which only ever
// read a manually-set `conflict` boolean flag (never computed from actual
// times, so it could only "detect" a conflict someone had separately
// hand-flagged) and recommended hardcoded names ("Grandma Mary", "Priya
// (Mom)") regardless of who was actually free that day. This now computes
// genuine start/end-time overlaps between same-day events sharing a family
// member, and suggests a real adult who has no conflicting event in that
// window instead of a fixed name.
function detectRealConflicts(events: FamilyEvent[], members: { id: string; name: string; role: string }[]): Promise<AiResult> {
  return new Promise(res => {
    const byDate = new Map<string, FamilyEvent[]>();
    for (const e of events) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date)!.push(e);
    }

    const conflicts: AiConflict[] = [];
    const seenPairs = new Set<string>();

    for (const dayEvents of byDate.values()) {
      for (let i = 0; i < dayEvents.length; i++) {
        for (let j = i + 1; j < dayEvents.length; j++) {
          const a = dayEvents[i], b = dayEvents[j];
          const sharedMembers = eventMemberIds(a).filter(id => eventMemberIds(b).includes(id));
          if (sharedMembers.length === 0) continue;

          const aStart = parseTimeToMinutes(a.time);
          const aEnd = parseTimeToMinutes(a.endTime) ?? (aStart !== null ? aStart + 60 : null);
          const bStart = parseTimeToMinutes(b.time);
          const bEnd = parseTimeToMinutes(b.endTime) ?? (bStart !== null ? bStart + 60 : null);
          if (aStart === null || aEnd === null || bStart === null || bEnd === null) continue;
          if (aStart >= bEnd || bStart >= aEnd) continue; // no actual overlap

          const pairKey = [a.id, b.id].sort().join('_');
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);

          const conflictedMember = members.find(m => m.id === sharedMembers[0]);
          const busyIds = new Set([...eventMemberIds(a), ...eventMemberIds(b)]);
          const freeAdult = members.find(m => (m.role === 'parent' || m.role === 'senior') && !busyIds.has(m.id));

          conflicts.push({
            description: `"${a.title}" at ${a.time} overlaps with "${b.title}" at ${b.time}${conflictedMember ? ` — both need ${conflictedMember.name.split(' ')[0]}` : ''}`,
            eventsInvolved: [a.title, b.title],
            eventIds: [a.id, b.id],
            suggestedFix: freeAdult
              ? `${freeAdult.name.split(' ')[0]} is free during this window and can help`
              : 'No adult is currently free during this window — consider rescheduling one event',
            recommendedDriverSwap: freeAdult?.name,
          });
        }
      }
    }

    const pending  = events.filter(e => e.helperStatus === 'pending');
    const rejected = events.filter(e => e.helperStatus === 'rejected');

    if (rejected.length > 0) {
      rejected.forEach(ev => {
        const busyIds = new Set(eventMemberIds(ev));
        const freeAdult = members.find(m => (m.role === 'parent' || m.role === 'senior') && !busyIds.has(m.id));
        conflicts.push({
          description: `"${ev.title}" assistant declined — no confirmed helper assigned`,
          eventsInvolved: [ev.title],
          eventIds: [ev.id],
          suggestedFix: freeAdult ? `${freeAdult.name.split(' ')[0]} is available to help instead` : 'Find another available parent or grandparent',
          recommendedDriverSwap: freeAdult?.name,
        });
      });
    }

    if (pending.length > 0) {
      conflicts.push({
        description: `${pending.length} event(s) still awaiting assistant confirmation`,
        eventsInvolved: pending.map(e => e.title),
        suggestedFix: 'Follow up or reassign to someone available',
      });
    }

    const timeConflictCount = conflicts.length - rejected.length - (pending.length > 0 ? 1 : 0);
    res({
      summary: conflicts.length === 0
        ? 'All events have confirmed assistants. No time overlaps detected. Family schedule looks smooth for the selected period!'
        : `Detected ${conflicts.length} logistics issue(s): ${timeConflictCount} time conflict(s), ${rejected.length} declined assistant(s), ${pending.length} pending confirmation(s).`,
      conflictsFound: conflicts.length > 0,
      conflicts,
    });
  });
}

// Gentle mount-fade — used so Month view arrives as a soft continuation of
// the pull-to-reveal gesture in Day view rather than an abrupt hard cut.
function FadeInView({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}

// ─── Swipeable event card wrapper ────────────────────────────────────────────
// Swipe left to reveal delete. Only shown for future events (per RBAC).
function SwipeableEventCard({ children, onDelete, onLongPress, onPress, canDelete }: {
  children: React.ReactNode; onDelete: () => void; onLongPress: () => void; onPress?: () => void; canDelete: boolean;
}) {
  const tx      = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  const DELETE_W = 84;

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => canDelete && Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderMove: (_, g) => {
      if (!canDelete) return;
      const base = open ? -DELETE_W : 0;
      const clamped = Math.max(-DELETE_W, Math.min(0, base + g.dx));
      tx.setValue(clamped);
    },
    onPanResponderRelease: (_, g) => {
      if (!canDelete) return;
      const dest = (open ? g.dx < DELETE_W / 2 : g.dx < -(DELETE_W / 2)) ? -DELETE_W : 0;
      setOpen(dest !== 0);
      Animated.spring(tx, { toValue: dest, useNativeDriver: true, friction: 7, tension: 60 }).start();
    },
  })).current;

  const close = () => {
    setOpen(false);
    Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
  };

  // Slide whole row left so delete zone slides in from right (overflow clipped by parent)
  return (
    <View style={{ flexDirection: 'row', overflow: 'hidden' }}>
      <Animated.View
        {...pan.panHandlers}
        style={{ flexDirection: 'row', transform: [{ translateX: tx }], width: '100%' }}
      >
        {/* Card content — takes full width, slides left */}
        <View style={{ width: '100%' }}>
          <TouchableOpacity
            activeOpacity={0.88}
            onLongPress={onLongPress}
            onPress={open ? close : onPress}
            delayLongPress={450}
          >
            {children}
          </TouchableOpacity>
        </View>

        {/* Delete zone — revealed when slid left */}
        {canDelete && (
          <TouchableOpacity
            onPress={() => { close(); onDelete(); }}
            style={{
              width: DELETE_W, alignItems: 'center', justifyContent: 'center', gap: 4,
              backgroundColor: '#EF4444', borderRadius: 18,
              marginLeft: 8, flexShrink: 0,
            }}
          >
            <Text style={{ fontSize: 22 }}>🗑️</Text>
            <Text style={{ fontSize: 10, color: '#fff', fontWeight: '900', letterSpacing: 0.5 }}>
              Delete
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CalendarScreen({ hideHeader, hideCreateButton, headerContent, hideSearchBar, externalSearchQuery }: {
  hideHeader?: boolean; hideCreateButton?: boolean; headerContent?: React.ReactNode;
  // TasksScreen hosts its own search icon on the tab-card and drives this
  // screen's existing title/notes filter externally, instead of duplicating
  // a second search affordance inline here.
  hideSearchBar?: boolean; externalSearchQuery?: string;
} = {}) {
  const { colors, isDark } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const {
    events, dayLoading, hasMore,
    stripMap, stripRows,
    rangeEvents, rangeLoading,
    addEvent, updateEvent, deleteEvent,
    selectDate: storeSelectDate, loadMoreDay, loadStrip, loadRange,
  } = useEventStore();

  const activeMember = members.find(m => m.id === activeMemberId)
    ?? members.find(m => m.role === 'parent') ?? members[0];
  const isParent         = activeMember?.role === 'parent';
  const isSenior         = activeMember?.role === 'senior';
  const isTeen           = activeMember?.role === 'teen';
  const isKid            = activeMember?.role === 'kid';
  const isParentOrSenior = isParent || isSenior;
  // Full Month/Week/Day/Agenda toolbar + day-nav — was isParentOrSenior
  // only, leaving teens AND kids with no way to browse any date but today
  // (teens had neither this toolbar nor the separate kid-only day-nav bar;
  // kids had only that day-nav bar, permanently locked to Agenda/day view
  // with no Month/Week even though those views render correctly for any
  // non-parent role). Both were dead zones — a kid's own ride request for
  // tomorrow, or any future event, was invisible on this tab (QA sweep,
  // full-app per-role audit, Critical for both roles). Deliberately
  // separate from isParentOrSenior itself — that flag also gates the
  // "+ Event" create button and other parent/senior-only PERMISSIONS
  // elsewhere on this screen, which neither teens nor kids should get.
  const canUseFullCalendarToolbar = isParentOrSenior || isTeen || isKid;
  const activeMemberName = activeMember?.name ?? '';

  // Whoever had committed to drive/help only finds out an event vanished by
  // noticing it's gone from their own Hub unless we say so — same reasoning
  // as the takeover broadcast added for reassignment this session.
  //
  // Spec 6.4's literal scenario is a DRIVER claim ("GP had already claimed
  // the driving slot") — driverName/driverStatus is a separate claim
  // channel from helper/helperStatus (see eventStore's claimHelperSlot,
  // which branches on role === 'driver' vs everything else). This
  // previously only ever checked `helper`, so a driver-only claim (the
  // exact case the spec describes) got no notice at all. Also switches
  // from a family-wide broadcast to a direct DM to the claimant when their
  // name resolves to a real member id — spec explicitly wants this to be
  // an active, targeted notice ("should never have to discover a
  // cancellation by silently watching the pickup time pass"), not
  // something that arrives passively in a group channel.
  const notifyDeleteIfAssigned = (ev: FamilyEvent) => {
    const claimantName =
      (ev.driverName && ev.driverName !== activeMemberName && (ev.driverStatus === 'pending' || ev.driverStatus === 'confirmed'))
        ? ev.driverName
        : (ev.helper && ev.helper !== activeMemberName && (ev.helperStatus === 'pending' || ev.helperStatus === 'confirmed'))
          ? ev.helper
          : undefined;
    const actorLabel = relationalNameByName(activeMemberName, members);
    if (claimantName) {
      const msg = `🗑️ ${actorLabel} removed "${ev.title}" — ${relationalNameByName(claimantName, members)} is no longer needed for it.`;
      const claimantMember = members.find(m => m.name === claimantName);
      if (claimantMember) {
        useChatStore.getState().sendMessage(claimantMember.id, activeMemberId ?? '', msg);
      } else {
        // Free-text helper/driver name that isn't a real family member (e.g.
        // an external tutor/coach) — no member id to DM, fall back to the
        // family channel so the cancellation is still visible somewhere.
        useChatStore.getState().sendMessage('all', activeMemberId ?? '', msg);
      }
    }
    // The kid whose event this was previously got NO notice at all when a
    // parent deleted/cancelled their ride — only the assigned driver did.
    // A kid who requested a ride should never have to discover it's gone
    // by silently watching their schedule, same reasoning the driver-side
    // notice above already documents (user report: parent deletions
    // should notify the kid, and say which parent did it).
    if (ev.memberId && ev.memberId !== activeMemberId) {
      const kidMsg = `🗑️ ${actorLabel} removed "${ev.title}" from your schedule.`;
      useChatStore.getState().sendMessage(ev.memberId, activeMemberId ?? '', kidMsg);
    }
  };

  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const todayStr = toDateStr(new Date());
  const goToToday = () => {
    console.log(`[UserAction] screen=Schedule role=${isParent ? 'parent' : isSenior ? 'senior' : isTeen ? 'teen' : isKid ? 'kid' : 'unknown'} member=${activeMemberName} tapped "Today" → selectedDate=${todayStr} [features/calendar/CalendarScreen.tsx:509]`);
    setSelectedDate(todayStr);
    storeSelectDate(todayStr);
    loadStrip(get15Days(todayStr));
    setMonthCursor(parseDate(todayStr));
  };

  // On mount: load today's events + strip for visible 15-day window
  React.useEffect(() => {
    storeSelectDate(selectedDate);
    const days = get15Days(selectedDate);
    loadStrip(days);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recurring series only materialize occurrences up to a rolling window
  // (RECURRENCE_WINDOW_DAYS in eventStore.ts) — without something to push
  // that window forward, an ongoing "every Mon/Wed/Fri" class would
  // eventually run out of future rows for a family that just hasn't
  // recently opened the Calendar tab. Opening it is the natural, reliable
  // trigger for that extension (nobody expects a perfectly-populated
  // calendar from an app they haven't opened in months with zero
  // interaction) — check for any anchor whose last materialized occurrence
  // is getting close to today and extend it.
  React.useEffect(() => {
    const soon = toDateStr(addDays(new Date(), 21)); // extend once <3 weeks of runway remains
    supabase.from('calendar_events')
      .select('id, series_id')
      .eq('is_series_anchor', true)
      .is('deleted_at', null)
      .then(({ data: anchors, error }) => {
        if (error || !anchors?.length) return;
        for (const a of anchors) {
          if (!a.series_id) continue;
          supabase.from('calendar_events')
            .select('date')
            .eq('series_id', a.series_id)
            .is('deleted_at', null)
            .order('date', { ascending: false })
            .limit(1)
            .then(({ data: latest }) => {
              if (latest?.[0]?.date && latest[0].date < soon) {
                useEventStore.getState().extendRecurringSeries(a.series_id as string);
              }
            });
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const unreadNotifCount = useNotifStore(s => s.unreadCount);
  const [filterMember, setFilterMember] = useState<string | null>(null);
  // Parents keep the pre-existing behavior — see everyone by default, filter
  // per family member. My Schedule/All is only a kid/teen/senior concept.
  const [scheduleFilter, setScheduleFilter] = useState<'mine' | 'all'>(isParent ? 'all' : 'mine');
  const [showAdd,       setShowAdd]       = useState(false);
  const [addPrefill, setAddPrefill] = useState<{
    title: string; category?: string; memberId?: string; startAt?: string; notes?: string;
  } | undefined>(undefined);
  const [showAskHelp,   setShowAskHelp]   = useState(false);
  const [editEv,        setEditEv]        = useState<FamilyEvent | null>(null);
  // A kid editing their OWN still-pending request goes through
  // KidRequestModal (in edit mode) instead of the adult EditEventModal —
  // separate state so the two never fight over which sheet is open.
  const [kidEditEv,      setKidEditEv]     = useState<FamilyEvent | null>(null);

  // Every long-press call site below used to route unconditionally to
  // setEditEv — a kid long-pressing ANY event (their own pending request,
  // a sibling's event, an already-approved event) landed in the full adult
  // edit form, dead isKid branches and all, with no gate at all (the exact
  // form KidRequestModal was built to replace). Once a parent has approved
  // a kid's request, per the established rule, only a parent manages
  // further changes (time/driver/recurrence/delete) — a kid long-pressing
  // anything else now does nothing.
  const routeLongPress = (ev: FamilyEvent) => {
    if (!isKid) { setEditEv(ev); return; }
    // A still-unapproved request whose own time has already passed is no
    // longer something a kid should be able to edit — the parent never
    // acted on it in time, and it's about to be swept up by the 24hr
    // stale-cleanup job anyway, so re-editing it here would just recreate
    // a request nobody's going to see before it's deleted.
    if (ev.memberId === activeMemberId && ev.approvalPending && !isEventPast(ev.date, ev.time)) setKidEditEv(ev);
  };

  const calScrollRef = useRef<ScrollView>(null);

  const prevCalMemberRef = useRef(activeMemberId);
  React.useEffect(() => {
    if (prevCalMemberRef.current === activeMemberId) return;
    prevCalMemberRef.current = activeMemberId;
    setFilterMember(null);
    setScheduleFilter(isParent ? 'all' : 'mine');
    setCompact(false);
    setShowAdd(false);
    setShowAskHelp(false);
    setEditEv(null);
    setShowAiPanel(false);
    setIsAnalyzing(false);
    calScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeMemberId]);
  // Kid's Schedule now matches Parent's default view exactly (card view,
  // not compact) — the standalone list/compact toggle that used to live
  // next to "+ Ask Help" is gone (see the toolbar row below), so this
  // never needs to differ by role.
  const [compact,       setCompact]       = useState(false);
  // 'month' — Apple-style month sheet, tap a day to load its agenda below.
  // 'week' — one card per day, chronological events inside. 'day' — the
  // chronological single-day timeline. 'agenda' — grouped-by-date list
  // spanning many upcoming days. Defaults to 'agenda' — the most useful
  // at-a-glance view across the whole family's upcoming schedule.
  const [viewMode,      setViewMode]      = useState<'month' | 'week' | 'day' | 'agenda'>('agenda');
  const [monthCursor,   setMonthCursor]   = useState(() => parseDate(toDateStr(new Date())));
  const [weekCursor,    setWeekCursor]    = useState(() => {
    const b = currentWeekBounds();
    return parseDate(b.start);
  });

  // Day view auto-scroll-to-now — Day owns its own ScrollView (dayScrollRef)
  // now, so this scrolls directly within that, relative offset 0, instead
  // of computing a position inside the outer page scroll. hourYRef collects
  // each hour row's offset as DaySlotView lays out (row heights vary since
  // a row with events is taller than an empty dashed placeholder, so this
  // can't be precomputed from a fixed row height); once the current hour's
  // row is known, scroll there once per Day-view-mount (dedup via
  // scrolledRef so re-renders don't re-trigger).
  const dayScrollRef = useRef<ScrollView>(null);
  const dayHeaderHeightRef = useRef(0);
  // Day's own scroller needs a real bounded height (a ScrollView inside an
  // unbounded outer ScrollView gets no height from flex:1 alone). Measured
  // at runtime via onLayout on Day's wrapper — pageY is where that wrapper
  // actually starts on screen, so windowHeight minus that (minus a little
  // breathing room for the tab bar) is exactly the space left to scroll in,
  // regardless of device size or how tall the chrome above it happens to be.
  const [dayViewportHeight, setDayViewportHeight] = useState(560);
  const dayWrapperRef = useRef<View>(null);
  // Collapsing-header state: the full date card scrolls away as ordinary
  // content; this compact docked bar fades/slides in once scroll position
  // has passed the card's own height, and back out when scrolled to top.
  // Day view opens at the very top (no auto-scroll) so the full card is
  // always seen first, matching Month/Week/Agenda.
  const [dayDockedVisible, setDayDockedVisible] = useState(false);
  const dayDockAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    setDayDockedVisible(false);
    dayDockAnim.setValue(0);
  }, [viewMode, selectedDate]);


  // Month grid's dots need strip data for every visible cell (including the
  // lead/trail days from adjoining months), not just the 15-day window
  // the Day/Family toolbar loads around selectedDate.
  React.useEffect(() => {
    const cells = buildMonthGrid(monthCursor.getFullYear(), monthCursor.getMonth()).filter(Boolean);
    if (cells.length) loadStrip(cells);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthCursor]);

  // Week view loads full rows for its visible 7-day window; Agenda loads a
  // wider forward-looking window (today → +60 days) since it's meant to
  // answer "what's coming up", not just this week.
  React.useEffect(() => {
    if (viewMode !== 'week') return;
    const from = toDateStr(weekCursor);
    const to = toDateStr(addDays(weekCursor, 6));
    loadRange(from, to);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, weekCursor]);

  React.useEffect(() => {
    if (viewMode !== 'agenda') return;
    const from = toDateStr(new Date());
    const to = toDateStr(addDays(new Date(), 60));
    loadRange(from, to);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const [detailEv,      setDetailEv]      = useState<FamilyEvent | null>(null);
  // Net-new title/notes search — layers on top of the existing date/member/
  // role filters below, never replaces them.
  const [internalSearchQuery, setSearchQuery] = useState('');
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;

  // AI state
  const [aiResult,       setAiResult]       = useState<AiResult | null>(null);
  const [isAnalyzing,    setIsAnalyzing]    = useState(false);
  const [showAiPanel,    setShowAiPanel]    = useState(false);
  const [appliedSwaps,   setAppliedSwaps]   = useState<Record<string, boolean>>({});

  const roleLabel = isParent ? 'parent' : isSenior ? 'senior' : isTeen ? 'teen' : isKid ? 'kid' : 'unknown';

  const switchMember = () => {
    const idx = members.findIndex(m => m.id === activeMember?.id);
    const next = members[(idx + 1) % members.length];
    console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped persona avatar → switch active member to "${next?.name}" (id=${next?.id}) [features/calendar/CalendarScreen.tsx:695]`);
    if (next) setActiveMember(next.id);
  };

  const runAiScan = async () => {
    console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "AI Conflict Scan" → runAiScan [features/calendar/CalendarScreen.tsx:701]`);
    setIsAnalyzing(true);
    setShowAiPanel(true);
    const todayStr = toDateStr(new Date());
    const futureEvents = events.filter(e => e.date >= todayStr);
    console.log(`[UserAction] FILTER screen=Schedule role=${roleLabel} member=${activeMemberName} list=futureEvents(AI scan) totalSource=${events.length} afterFilter=${futureEvents.length} [features/calendar/CalendarScreen.tsx:705]`);
    const result = await detectRealConflicts(futureEvents, members);
    setAiResult(result);
    setIsAnalyzing(false);
  };

  const handleApplySwap = (idx: number, conflict: AiConflict) => {
    if (!conflict.recommendedDriverSwap) return;
    // Uses the real event id(s) the scan attached to this specific conflict
    // — previously this guessed at "the first event with .conflict set or a
    // rejected helper", which could patch the wrong event entirely once more
    // than one conflict was in play.
    const targetIds = conflict.eventIds?.length ? conflict.eventIds : [events[0]?.id].filter(Boolean) as string[];
    console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Apply Swap" on conflict idx=${idx} (eventIds=${targetIds.join(',')}) → updateEvent helper=${conflict.recommendedDriverSwap} [features/calendar/CalendarScreen.tsx:718]`);
    const targetMember = members.find(m => m.name === conflict.recommendedDriverSwap);
    targetIds.forEach(id => {
      if (targetMember) {
        const targetEvent = events.find(e => e.id === id);
        const role = targetEvent ? eventAssigneeRole(targetEvent) : 'helper';
        supabase.rpc('reassign_event', {
          p_event_id: id, p_new_member_id: targetMember.id, p_role: role, p_actor_id: activeMemberId,
        }).then(({ error }) => {
          if (error) console.warn('[CalendarScreen] handleApplySwap reassign_event failed', error.message);
        });
      } else {
        // No matching member row for the suggested name — fall back to the
        // old direct write rather than silently drop the swap.
        updateEvent(id, { helper: conflict.recommendedDriverSwap, helperStatus: 'pending' });
      }
      updateEvent(id, { conflict: false });
    });
    setAppliedSwaps(p => ({ ...p, [`swap_${idx}`]: true }));
  };

  // Net-new title/notes search, layered on top of the RBAC/date/member
  // filters below — never replaces them, just narrows further.
  const matchesSearch = (e: FamilyEvent) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (e.title ?? '').toLowerCase().includes(q) || (e.notes ?? '').toLowerCase().includes(q);
  };

  // Tapping a member's filter pill should surface events they're INVOLVED
  // in, not just events that are FOR them — e.g. Priya pending as the
  // helper/driver on an event that's for Maya should still show under
  // Priya's pill. e.helper/e.driverName are free-text names, not ids, so
  // this resolves the filtered member's name once and checks both fields.
  const filterMemberName = filterMember ? members.find(m => m.id === filterMember)?.name : undefined;
  const matchesMemberFilter = (e: FamilyEvent) => {
    if (!filterMember) return true;
    if (!e.memberId && !e.memberIds?.length) return true; // family-wide events always show
    if (e.memberId === filterMember) return true;
    // Multi-member assignment — e.memberIds carries every assignee for an
    // event assigned to 2+ family members (EventFormModal's multi-select
    // "For" picker). This was previously unchecked here, so the 2nd/3rd+
    // assignee on a shared event never matched their own filter pill.
    if (e.memberIds?.includes(filterMember)) return true;
    if (filterMemberName) {
      const first = filterMemberName.split(' ')[0];
      if (e.helper && (e.helper.includes(filterMemberName) || e.helper.includes(first))) return true;
      if (e.driverName && (e.driverName.includes(filterMemberName) || e.driverName.includes(first))) return true;
    }
    return false;
  };

  // Same matching rule as matchesMemberFilter above, applied to the
  // lightweight strip rows so the month grid's per-day dots respect
  // whichever member chip is selected instead of always showing every
  // family event's dot regardless of filter — dots used to be entirely
  // unfiltered since stripMap only ever carried date+category.
  const filteredStripMap = useMemo(() => {
    // StripRow is a lightweight {date, category, memberId, helper,
    // driverName} projection, not a full FamilyEvent — it has no
    // privacyLevel/rideRequired to run through isEventSensitive/
    // canViewSensitiveEventDetail directly. Approximates the same rule via
    // category alone: a Medical or Ride dot for someone else's event is
    // withheld from a kid/teen sibling, same as the full event is (was
    // previously unfiltered — the Month grid's dots leaked a sibling's
    // private Medical appointment or ride request as a category-labeled
    // dot even though the day-detail card below correctly withheld it, QA
    // sweep kid-role audit, High).
    const hideForSibling = (isKid || isTeen) ? (r: StripRow) => {
      const isOwn = !r.memberId || r.memberId === activeMemberId;
      if (isOwn) return false;
      return r.category === 'Medical' || r.category === 'Ride';
    } : () => false;
    if (!filterMember && scheduleFilter !== 'mine' && !(isKid || isTeen)) return stripMap;
    const first = filterMemberName?.split(' ')[0];
    const map: StripMap = {};
    for (const r of stripRows) {
      if (hideForSibling(r)) continue;
      const memberMatches = !filterMember || !r.memberId
        || r.memberId === filterMember
        || (filterMemberName && r.helper && (r.helper.includes(filterMemberName) || (first && r.helper.includes(first))))
        || (filterMemberName && r.driverName && (r.driverName.includes(filterMemberName) || (first && r.driverName.includes(first))));
      if (!memberMatches) continue;
      // My Schedule / All — same rule dayEvents/scopedRangeEvents apply;
      // was entirely unapplied here, so Month's dots stayed family-wide
      // regardless of the toggle (QA sweep, kid-role audit, Critical).
      const scheduleMatches = isParent || scheduleFilter === 'all'
        || !r.memberId || r.memberId === activeMemberId;
      if (!scheduleMatches) continue;
      if (!map[r.date]) map[r.date] = [];
      if (!map[r.date].includes(r.category)) map[r.date].push(r.category);
    }
    console.log(`[UserAction] FILTER screen=Schedule role=${roleLabel} member=${activeMemberName} list=filteredStripMap totalSource=${stripRows.length} afterFilter=${Object.keys(map).length} dates [features/calendar/CalendarScreen.tsx:800]`);
    return map;
  }, [stripMap, stripRows, filterMember, filterMemberName, scheduleFilter, isKid, isTeen, isParent, activeMemberId]);

  // Live QA audit found the busy-block promise (GP sees a stripped
  // placeholder for a sensitive event, not nothing) was never implemented —
  // the old filter used the visibility check as a hard include/exclude,
  // collapsing 'busy-block' into the same "excluded" bucket as 'hidden'.
  // This resolves the mode once per event so the filter can correctly
  // INCLUDE a busy-block event (rather than drop it) and EventCard can
  // render the stripped variant instead of full detail.
  const sensitiveVisibility = (e: FamilyEvent): SensitiveEventVisibility =>
    !isEventSensitive(e) ? 'full' : canViewSensitiveEventDetail(e, isSenior ? 'senior' : isKid ? 'kid' : isTeen ? 'teen' : isParent ? 'parent' : undefined, activeMemberId ?? undefined, activeMemberName);

  // Filtered events for selected day
  const dayEvents = useMemo(() => {
    const filtered = events
      .filter(e => e.date === selectedDate &&
        e.category !== 'Holiday' &&
        // Scenarios 2.6/2.10/5.4/5.5 — a sensitive/private/Medical event is
        // hidden entirely from a sibling kid/teen, OR shown as a busy-block
        // stub to a GP without care-sharing, BEFORE any of the ordinary
        // assignee-based visibility rules below even apply. Both parents
        // and the event's own subject always pass this check.
        sensitiveVisibility(e) !== 'hidden' &&
        // Kid: full family visibility, same as parent/teen — kids can see
        // siblings' events (e.g. "what's Leo up to today"), not just their
        // own. Kids just don't get the member-filter/view-mode toolbar UI.
        // Senior/GP: restricted to only schedules they're actually part of
        // — assigned to them, they're the named helper/driver, they're one
        // of a multi-member event's assignees (e.memberIds — previously
        // unchecked here, so a senior who was the 2nd/3rd assignee on a
        // shared event never saw it at all), or the event has no assignee
        // at all (family-wide). Previously this also OR'd in
        // `!(e as any).isPrivate`, a field that doesn't exist on
        // FamilyEvent — that condition was always true, silently giving
        // every senior full visibility regardless of the other checks.
        (!isSenior || (
          e.memberId === activeMemberId ||
          e.memberIds?.includes(activeMemberId ?? '') ||
          (e.helper && e.helper === activeMemberName) ||
          (e.driverName && e.driverName === activeMemberName) ||
          // "No assignee → family-wide, visible to every GP" only holds for
          // an ordinary shared event. A Ride-category/rideRequired event
          // with nobody explicitly tagged (e.g. the "For" picker left
          // empty) is NOT a family-wide event — it's an ungated ride that
          // must still respect isOpenToGrandparents like every other ride
          // visibility check in the app (SeniorView's openRides/
          // myClaimedRides). Without this, a ride explicitly marked
          // isOpenToGrandparents:false was still fully visible — including
          // to a GP with zero connection to it — the instant its memberId
          // happened to be unset (QA launch-readiness sweep, live-DB
          // reproduction: ride with is_open_to_grandparents=false and no
          // memberId was fully visible on Schedule to an uninvolved GP).
          (!e.memberId && !e.memberIds?.length &&
            (e.category !== 'Ride' && !e.rideRequired ? true : !!e.isOpenToGrandparents))
        )) &&
        // My Schedule / All tabs (kid/teen/senior only — parents always see all)
        // Was checking only memberId/memberIds (the event's SUBJECT) —
        // never helper/driverName (who's actually ASSIGNED, e.g. a teen
        // who claimed an open ride pool). A teen's own claimed ride never
        // matched here, so it silently vanished from their default "My
        // Schedule" view even though the claim itself wrote correctly
        // (live-reported: "teen's schedule tab in tasks is not showing
        // that entry"). Same helper/driverName OR already applied to the
        // senior-visibility gate directly above — this mirrors it into
        // the scoping gate it was never propagated to.
        (isParent || scheduleFilter === 'all' ||
          e.memberId === activeMemberId ||
          e.memberIds?.includes(activeMemberId ?? '') ||
          (e.helper && e.helper === activeMemberName) ||
          (e.driverName && e.driverName === activeMemberName) ||
          (!e.memberId && !e.memberIds?.length)) &&
        matchesMemberFilter(e) &&
        matchesSearch(e))
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
      // Was missing entirely — unlike scopedRangeEvents (Week/Agenda),
      // dayEvents only ever included/excluded events, never stripped
      // detail for the 'busy-block' case. DayEventsSummaryCard (Month
      // view's day-detail card) has no busy-block handling of its own, so
      // it always rendered the real title for anything that passed the
      // include check — a senior who's one of several assignees on a
      // sensitive event saw full detail here even when every other view
      // correctly stripped it (QA sweep, grandparent-role audit,
      // Critical C5).
      .map(e => {
        if (sensitiveVisibility(e) !== 'busy-block') return e;
        return {
          ...e,
          title: 'Busy', notes: undefined, location: undefined,
          doctorName: undefined, subject: undefined, coachName: undefined,
          helper: undefined, driverName: undefined,
        };
      });
    console.log(`[UserAction] FILTER screen=Schedule role=${roleLabel} member=${activeMemberName} list=dayEvents(${selectedDate}) totalSource=${events.length} afterFilter=${filtered.length} scheduleFilter=${scheduleFilter} filterMember=${filterMember ?? 'none'} [features/calendar/CalendarScreen.tsx:883]`);
    return filtered;
  }, [events, selectedDate, filterMember, filterMemberName, scheduleFilter, isSenior, isKid, isTeen, isParent, activeMemberId, activeMemberName, searchQuery]);

  // Same RBAC shape as dayEvents but across rangeEvents' multi-date window
  // — feeds Week/Agenda, both parent/senior-only views (same gate as
  // Family). Kids get full visibility here too — same reasoning as
  // dayEvents above.
  const scopedRangeEvents = useMemo(() => {
    const filtered = rangeEvents.filter(e =>
      e.category !== 'Holiday' &&
      // Same sensitivity gate as dayEvents above.
      sensitiveVisibility(e) !== 'hidden' &&
      // Same memberIds fix as dayEvents above — a senior/GP who's one of a
      // multi-member event's assignees (not the sole e.memberId) previously
      // never matched here either, so a shared event silently vanished from
      // their Week/Agenda views too.
      (!isSenior || (
        e.memberId === activeMemberId ||
        e.memberIds?.includes(activeMemberId ?? '') ||
        (e.helper && e.helper === activeMemberName) ||
        (e.driverName && e.driverName === activeMemberName) ||
        // Same isOpenToGrandparents gate as dayEvents above — see its
        // comment for the reproduced leak this closes.
        (!e.memberId && !e.memberIds?.length &&
          (e.category !== 'Ride' && !e.rideRequired ? true : !!e.isOpenToGrandparents))
      )) &&
      // My Schedule / All — was missing entirely here, so switching the
      // toggle in Week/Agenda showed "My Schedule" selected while every
      // sibling's event stayed fully visible underneath, a false promise of
      // scoping (QA sweep, kid-role audit, Critical). Same rule dayEvents
      // already applies. Also missing helper/driverName (see dayEvents'
      // identical gate above for the teen-claimed-ride bug this closes).
      (isParent || scheduleFilter === 'all' ||
        e.memberId === activeMemberId ||
        e.memberIds?.includes(activeMemberId ?? '') ||
        (e.helper && e.helper === activeMemberName) ||
        (e.driverName && e.driverName === activeMemberName) ||
        (!e.memberId && !e.memberIds?.length)) &&
      matchesMemberFilter(e) &&
      matchesSearch(e)
    ).map(e => {
      // Week/Agenda render through the shared, reusable EventCardRow, which
      // always shows full detail — unlike the Day view above, which swaps
      // in a dedicated BusyBlockCard component, sanitizing the row's OWN
      // detail-bearing fields here is simpler than teaching a shared card
      // renderer a new busy-block mode. Only a senior/GP can ever get
      // 'busy-block' (kid/teen siblings get 'hidden' and are already
      // filtered out above), so this only ever strips detail for that role.
      if (sensitiveVisibility(e) !== 'busy-block') return e;
      return {
        ...e,
        title: 'Busy', notes: undefined, location: undefined,
        doctorName: undefined, subject: undefined, coachName: undefined,
        helper: undefined, driverName: undefined,
      };
    });
    console.log(`[UserAction] FILTER screen=Schedule role=${roleLabel} member=${activeMemberName} list=scopedRangeEvents totalSource=${rangeEvents.length} afterFilter=${filtered.length} scheduleFilter=${scheduleFilter} filterMember=${filterMember ?? 'none'} [features/calendar/CalendarScreen.tsx:934]`);
    return filtered;
  }, [rangeEvents, isSenior, isKid, isTeen, isParent, activeMemberName, activeMemberId, filterMember, filterMemberName, searchQuery, scheduleFilter]);

  // Agenda only — collapse a recurring series (up to 84 individual rows for
  // a daily rule) down to one representative card, the next upcoming
  // occurrence (or most recent past one if the series has fully elapsed).
  // Week view is NOT collapsed here — its 7-day grid needs each occurrence
  // on its own actual day column (it was never the "85 cards in one list"
  // problem to begin with, since it only ever shows one week at a time).
  // Month's day-strip dots also need every real occurrence to mark the
  // right days.
  const collapsedRangeEvents = useMemo(() => collapseSeries(scopedRangeEvents), [scopedRangeEvents]);

  // Events where senior can volunteer as helper (has a pending/no helper, dated today or future)
  // seniorOpenRides removed — ride volunteering now lives in Hub > Helper Dispatch

  const selectedDateLabel = fmtDate(selectedDate);

  const cardBg   = isDark ? '#131927' : '#FFFFFF';
  const cardBord = isDark ? '#1E293B' : '#E2E8F0';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={hideHeader ? [] : ['top']}>
      {!hideHeader && (
        <AppHeader
          memberName={activeMember?.name}
          memberRole={isKid ? 'kid' : isTeen ? 'teen' : isSenior ? 'senior' : 'parent'}
          notifCount={unreadNotifCount}
          onPersonaPress={switchMember}
          onBellPress={() => setNotifPanelOpen(true)}
        />
      )}
      {!hideHeader && <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />}

      {/* ── Main Scroll: title + AI + member filter + timeline ──
          No stickyHeaderIndices here anymore — it was pinned to index 1,
          which for most views is a conditional block that renders to
          nothing (false), and RN's sticky-header math got confused by a
          collapsing pinned child: it both failed to actually stick
          anything meaningful AND corrupted the scrollable content height,
          which is what caused Day view's scroll to dead-stop partway
          through instead of reaching 8pm. Day view now owns its own
          correctly-scoped sticky header inside its own branch below. */}
      <ScrollView ref={calScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}
        scrollEnabled={viewMode !== 'day'} bounces={viewMode !== 'day'}>

        {headerContent}

        {/* [0] Scrollable: Title row + AI banner + AI panel */}
        <View>
          <View style={[sc.titleRow, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }, hideHeader && { paddingTop: 0, paddingBottom: 2 }]}>
            <View>
              {!hideHeader && (
                <Text style={[sc.title, { color: isDark ? colors.textPrimary : '#1E2D6B' }]}>
                  {isKid ? 'My Schedule' : 'Family Schedule'}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 }}>
                {!hideHeader && (
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>
                    {selectedDateLabel}
                  </Text>
                )}
                {selectedDate !== todayStr && (
                  <TouchableOpacity onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Today" pill [features/calendar/CalendarScreen.tsx:984]`); goToToday(); }}
                    style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: BRAND.purple + '15' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND.purple }}>Today</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Shared wrapping toolbar row — mirrors QuestsScreen's AI-pill +
              search + "+Quest" pill composition: AI conflict pill (parent
              only, renders nothing when there's nothing to flag), search,
              then the role-appropriate action pill(s). */}
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 14, gap: 8 }}>
            {isParent && (
              <AiConflictBanner
                hasConflicts={dayEvents.some(e => e.conflict || e.helperStatus === 'rejected')}
                isAnalyzing={isAnalyzing}
                showAiPanel={false}
                aiResult={aiResult}
                appliedSwaps={appliedSwaps}
                onRunScan={runAiScan}
                onClosePanel={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Close" on AI conflict panel [features/calendar/CalendarScreen.tsx:1006]`); setShowAiPanel(false); }}
                onApplySwap={handleApplySwap}
                colors={colors} isDark={isDark}
              />
            )}
            {!hideSearchBar && <CalendarSearchBar query={searchQuery} onQueryChange={setSearchQuery} colors={colors} isDark={isDark} />}
            {isKid ? null : (
              isParentOrSenior && !hideCreateButton && (
                <TouchableOpacity style={[calCardStyles.headerBtn, { backgroundColor: BRAND.purple }]} onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "+ Event" → open AddEventModal [features/calendar/CalendarScreen.tsx:1027]`); setShowAdd(true); }}>
                  <I.Plus c="#fff" size={14} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Event</Text>
                </TouchableOpacity>
              )
            )}
          </View>

          {/* Standalone AI results panel — kept separate from the pill row
              above (it expands full-width below the toolbar, same spot the
              old inline panel occupied) since AiConflictBanner's own pill
              is rendered with showAiPanel forced false above to avoid
              double-rendering the panel inline in the wrapping row. */}
          {isParent && showAiPanel && (
            <AiConflictBanner
              hasConflicts={false}
              isAnalyzing={isAnalyzing}
              showAiPanel={showAiPanel}
              aiResult={aiResult}
              appliedSwaps={appliedSwaps}
              onRunScan={runAiScan}
              onClosePanel={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Close" on standalone AI conflict panel [features/calendar/CalendarScreen.tsx:1048]`); setShowAiPanel(false); }}
              onApplySwap={handleApplySwap}
              colors={colors} isDark={isDark}
            />
          )}

          {/* Member filter bar — matches the reference's persistent header
              row (always visible above the view tabs, not tucked inside
              one specific view). "All Family" + one pill per member,
              colored dot per role. Parent/senior only. */}
          {isParentOrSenior && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingTop: 10 }}>
              <TouchableOpacity
                style={[sc.pill, !filterMember ? { backgroundColor: colors.accent, borderColor: colors.accent } : { backgroundColor: isDark ? colors.surface : '#F5F4FA', borderColor: isDark ? colors.border : colors.accent + '30' }]}
                onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "All Family" for "member filter" [features/calendar/CalendarScreen.tsx:1063]`); setFilterMember(null); }}>
                <Text style={[sc.pillText, { color: !filterMember ? '#fff' : colors.textSecondary }]}>All Family</Text>
              </TouchableOpacity>
              {members.map(m => {
                const rs = roleStyle(m.role, colors);
                const isSel = filterMember === m.id;
                return (
                  <TouchableOpacity key={m.id}
                    style={[sc.pill, isSel ? { backgroundColor: BRAND.purple, borderColor: BRAND.purple } : { backgroundColor: isDark ? colors.surface : '#F5F4FA', borderColor: isDark ? colors.border : 'rgba(146,97,199,0.2)' }]}
                    onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${m.name}" (id=${m.id}) for "member filter" newValue=${isSel ? 'cleared' : m.id} [features/calendar/CalendarScreen.tsx:1072]`); setFilterMember(isSel ? null : m.id); }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isSel ? '#fff' : rs.dot }} />
                    <Text style={[sc.pillText, { color: isSel ? '#fff' : colors.textSecondary }]}>{m.name.split(' ')[0]}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Toolbar — Month / Week / Day / Agenda segmented switch. Month/
              Week own their own prev/next chevrons inside the view itself;
              Agenda has no single-date concept at all; so the day-step
              chevrons + Range button only show for Day, where "which
              single date" is still the relevant question. Available to
              every role (parent/senior/teen/kid) — the "+ Event" create
              button above and other genuine permission gates stay on
              isParentOrSenior specifically; this is pure navigation, not a
              permission. */}
          {canUseFullCalendarToolbar && (
            <View style={{ marginTop: 10, gap: 8 }}>
              {/* Mock's segmented control: equal-width tabs in one pill-shaped
                  bar, active tab lifted on a white/card chip — not a
                  scrolling row of separate pills. */}
              <View style={{ flexDirection: 'row', marginHorizontal: 14, backgroundColor: colors.surface, borderRadius: 12, padding: 3,
                borderWidth: 1, borderColor: colors.border }}>
                {([
                  { key: 'agenda' as const, label: 'Agenda' },
                  { key: 'month' as const,  label: 'Month' },
                  { key: 'week' as const,   label: 'Week' },
                  { key: 'day' as const,    label: 'Day' },
                ]).map(v => (
                  <TouchableOpacity key={v.key} onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${v.label}" for "view mode" [features/calendar/CalendarScreen.tsx:1102]`); setViewMode(v.key); }}
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9,
                      backgroundColor: viewMode === v.key ? colors.card : 'transparent',
                      shadowColor: colors.textPrimary, shadowOpacity: viewMode === v.key && !isDark ? 0.06 : 0, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
                    }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                      color: viewMode === v.key ? colors.textPrimary : colors.textSecondary }}>
                      {v.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

        </View>

        {/* My Schedule / All — kid/teen/senior scope toggle. Was gated to
            viewMode==='day', which a kid never reaches (no toolbar exists
            to set it) — silently hid this toggle from kids entirely. */}
        {(viewMode === 'day' || isKid) && !isParent && (
          <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: 'row', marginHorizontal: 14, marginTop: 10, marginBottom: 10,
              backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 12, padding: 3 }}>
              {([{ key: 'mine', label: 'My Schedule' }, { key: 'all', label: 'All' }] as const).map(t => (
                <TouchableOpacity key={t.key}
                  onPress={() => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${t.label}" for "schedule scope" [features/calendar/CalendarScreen.tsx:1129]`); setScheduleFilter(t.key); if (t.key === 'mine') setFilterMember(null); }}
                  style={{ flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center',
                    backgroundColor: scheduleFilter === t.key ? BRAND.purple : 'transparent' }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                    color: scheduleFilter === t.key ? '#fff' : colors.textSecondary }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {viewMode === 'month' && (
          <FadeInView>
            <MonthGridView
              monthDate={monthCursor}
              selected={selectedDate}
              stripMap={filteredStripMap}
              colors={colors} isDark={isDark}
              onSelectDay={(d) => { console.log(`[UserAction] FORM screen=Schedule role=${roleLabel} member=${activeMemberName} selected day "${d}" for "month grid" [features/calendar/CalendarScreen.tsx:1147]`); setSelectedDate(d); storeSelectDate(d); }}
              onChangeMonth={(delta) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped month nav delta=${delta} [features/calendar/CalendarScreen.tsx:1148]`); setMonthCursor(prev => {
                const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
                return next;
              }); }}
            />
          </FadeInView>
        )}

        {viewMode === 'week' && (
          <FadeInView>
            <WeekView
              weekStart={weekCursor}
              events={scopedRangeEvents}
              members={members}
              colors={colors} isDark={isDark}
              onSelectEvent={(ev) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped event "${ev.title}" (id=${ev.id}) in Week view → open detail sheet [features/calendar/CalendarScreen.tsx:1163]`); setDetailEv(ev); }}
              onLongPressEvent={(ev) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} long-pressed event "${ev.title}" (id=${ev.id}) in Week view → routeLongPress [features/calendar/CalendarScreen.tsx:1164]`); routeLongPress(ev); }}
              onNavigateWeek={(delta) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped week nav delta=${delta} [features/calendar/CalendarScreen.tsx:1165]`); setWeekCursor(prev => addDays(prev, delta * 7)); }}
              // showAdd opens the parent/senior EventFormAdd modal — a kid
              // now reaching WeekView (widened from !isKid) should use
              // KidRequestModal via "+ Ask Help" instead, not this.
              onAddDay={isKid ? undefined : (d) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "+" on day "${d}" in Week view → open EventFormAdd [features/calendar/CalendarScreen.tsx:1169]`); setSelectedDate(d); storeSelectDate(d); setShowAdd(true); }}
            />
          </FadeInView>
        )}

        {viewMode === 'agenda' && (
          <FadeInView>
            {rangeLoading && scopedRangeEvents.length === 0 ? (
              <View style={{ paddingHorizontal: 14, gap: 10, paddingTop: 8 }}>
                {[70, 70, 70].map((h, i) => (
                  <View key={i} style={{ height: h, borderRadius: 16, backgroundColor: isDark ? '#1E293B' : '#E8E6F0', opacity: 0.5 + i * 0.1 }} />
                ))}
              </View>
            ) : (
              <AgendaView
                events={collapsedRangeEvents}
                members={members}
                colors={colors} isDark={isDark}
                onSelectEvent={(ev) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped event "${ev.title}" (id=${ev.id}) in Agenda view → open detail sheet [features/calendar/CalendarScreen.tsx:1187]`); setDetailEv(ev); }}
                onLongPressEvent={(ev) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} long-pressed event "${ev.title}" (id=${ev.id}) in Agenda view → routeLongPress [features/calendar/CalendarScreen.tsx:1188]`); routeLongPress(ev); }}
                isViewerParent={isParent}
              />
            )}
          </FadeInView>
        )}

        {/* ── Holiday banner — quiet amber strip, not a full card ── */}
        {viewMode === 'day' && dayEvents.filter(ev => ev.category === 'Holiday').map(ev => (
          <View key={ev.id} style={{ marginHorizontal: 14, marginTop: 10, borderRadius: 12,
            backgroundColor: isDark ? colors.warning + '18' : colors.warningLight,
            borderWidth: 1, borderColor: colors.warning,
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}>
            <Text style={{ fontSize: 15 }}>🎌</Text>
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700',
              color: colors.warningDark }} numberOfLines={1}>{ev.title}</Text>
            {ev.notes ? <Text style={{ fontSize: TYPO.micro, color: colors.warningDark }}
              numberOfLines={1}>{ev.notes}</Text> : null}
          </View>
        ))}

        {/* Senior ride volunteering lives in the Hub > Helper Dispatch section, not here */}

        {/* This whole block (month's day-summary card, day's parent/senior
            hour-slot list, and day's kid/fallback timeline) only applies to
            Month and Day views — Week/Agenda render entirely through their
            own WeekView/AgendaView components above. Without this guard the
            final unconditional else branch below renders its dayEvents
            timeline underneath every other view too (the bug where a Day-
            style detail card kept appearing under Agenda/Week). */}
        {(viewMode === 'month' || viewMode === 'day') && (<React.Fragment>
        {viewMode === 'month' ? (
          // Selected-day card below the month grid — matches the reference
          // exactly: white rounded card, title + count badge header, each
          // event a colored-left-bar + light-tint row (role color, not
          // category) with the member's name as a pill on the right.
          <View style={{ paddingHorizontal: 14, paddingTop: 8 }}>
            <DayEventsSummaryCard
              dateLabel={selectedDate === todayStr ? 'Today' : selectedDateLabel}
              events={dayEvents}
              members={members}
              colors={colors} isDark={isDark}
              onSelectEvent={(ev) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped event "${ev.title}" (id=${ev.id}) in Month day-summary card → open detail sheet [features/calendar/CalendarScreen.tsx:1230]`); setDetailEv(ev); }}
              onLongPressEvent={(ev) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} long-pressed event "${ev.title}" (id=${ev.id}) in Month day-summary card → routeLongPress [features/calendar/CalendarScreen.tsx:1231]`); routeLongPress(ev); }}
            />
          </View>
        ) : viewMode === 'day' && canUseFullCalendarToolbar ? (
          // Simple hour-slot list — matches the reference's Day view.
          // The full date card scrolls away normally as part of the
          // content (no stickyHeaderIndices — that fought this row's
          // flexDirection layout and only ever pins something in place
          // immediately, not the "scroll away, then dock" behavior this
          // needed). Instead a slim compact bar sits fixed under the app
          // header, hidden until the full card has scrolled out of view,
          // then fades/slides in — the standard iOS collapsing-header
          // pattern, driven by tracking scroll position against the
          // card's own measured height.
          <View ref={dayWrapperRef} style={{ paddingTop: 12, height: dayViewportHeight, position: 'relative' }}
            onLayout={() => {
              dayWrapperRef.current?.measureInWindow((_x, pageY) => {
                const available = windowHeight - pageY - 90; // ~90px breathing room above the tab bar
                if (available > 200) setDayViewportHeight(available);
              });
            }}>
            {/* Docked compact bar — absolutely positioned over the top of
                the scroller, invisible/non-interactive until scrolled past
                the full card. Sits flush at true top:0 (not offset by the
                wrapper's paddingTop, which only affects the ScrollView's
                content below it) with its own full-bleed opaque background
                so no sliver of the scrolled-away card can show through
                behind or beside it. */}
            <Animated.View pointerEvents={dayDockedVisible ? 'auto' : 'none'} style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
              paddingTop: 12, paddingBottom: 8,
              backgroundColor: isDark ? colors.background : '#F5F4FA',
              opacity: dayDockAnim,
              transform: [{ translateY: dayDockAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
            }}>
              <View style={{ marginHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : '#F1F5F9',
                backgroundColor: isDark ? colors.card : '#fff', paddingVertical: 8, paddingHorizontal: 14,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
                <TouchableOpacity onPress={() => { const d = toDateStr(addDays(parseDate(selectedDate), -1)); console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "prev day" (docked bar) → selectedDate=${d} [features/calendar/CalendarScreen.tsx:1270]`); setSelectedDate(d); storeSelectDate(d); loadStrip(get15Days(d)); }}
                  style={{ padding: 6 }}>
                  <I.ChevronLeft c={colors.textSecondary} size={15} />
                </TouchableOpacity>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
                  {selectedDateLabel}
                </Text>
                <TouchableOpacity onPress={() => { const d = toDateStr(addDays(parseDate(selectedDate), 1)); console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "next day" (docked bar) → selectedDate=${d} [features/calendar/CalendarScreen.tsx:1277]`); setSelectedDate(d); storeSelectDate(d); loadStrip(get15Days(d)); }}
                  style={{ padding: 6 }}>
                  <I.ChevronRight c={colors.textSecondary} size={15} />
                </TouchableOpacity>
              </View>
            </Animated.View>

            <ScrollView ref={dayScrollRef} showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const y = e.nativeEvent.contentOffset.y;
                const threshold = dayHeaderHeightRef.current;
                const shouldShow = threshold > 0 && y > threshold;
                if (shouldShow !== dayDockedVisible) {
                  setDayDockedVisible(shouldShow);
                  Animated.timing(dayDockAnim, { toValue: shouldShow ? 1 : 0, duration: 180, useNativeDriver: true }).start();
                }
              }}>
              <View onLayout={(e) => { dayHeaderHeightRef.current = e.nativeEvent.layout.height; }}
                style={{ marginHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: isDark ? colors.border : '#F1F5F9',
                backgroundColor: isDark ? colors.card : '#fff', paddingVertical: 10, paddingHorizontal: 14,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => { const d = toDateStr(addDays(parseDate(selectedDate), -1)); console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "prev day" (full header) → selectedDate=${d} [features/calendar/CalendarScreen.tsx:1299]`); setSelectedDate(d); storeSelectDate(d); loadStrip(get15Days(d)); }}
                  style={{ padding: 6 }}>
                  <I.ChevronLeft c={colors.textSecondary} size={16} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
                    {selectedDateLabel}
                  </Text>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '600', color: colors.textTertiary, marginTop: 1 }}>
                    {dayEvents.filter(ev => ev.category !== 'Holiday').length} Scheduled Activit{dayEvents.filter(ev => ev.category !== 'Holiday').length === 1 ? 'y' : 'ies'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => { const d = toDateStr(addDays(parseDate(selectedDate), 1)); console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "next day" (full header) → selectedDate=${d} [features/calendar/CalendarScreen.tsx:1311]`); setSelectedDate(d); storeSelectDate(d); loadStrip(get15Days(d)); }}
                  style={{ padding: 6 }}>
                  <I.ChevronRight c={colors.textSecondary} size={16} />
                </TouchableOpacity>
              </View>

              <DaySlotView
                dayEvents={dayEvents.filter(ev => ev.category !== 'Holiday')}
                members={members}
                colors={colors} isDark={isDark}
                onSelect={(ev) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped event "${ev.title}" (id=${ev.id}) in Day slot view → open detail sheet [features/calendar/CalendarScreen.tsx:1321]`); setDetailEv(ev); }}
                onLongPressEvent={(ev) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} long-pressed event "${ev.title}" (id=${ev.id}) in Day slot view → routeLongPress [features/calendar/CalendarScreen.tsx:1322]`); routeLongPress(ev); }}
                onAddAtTime={(hourTimeKey) => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "+ Tap to add event" at hour=${hourTimeKey} in Day slot view → open EventFormAdd [features/calendar/CalendarScreen.tsx:1323]`); setShowAdd(true); }}
              />
            </ScrollView>
          </View>
        ) : (
        <>
        {/* ── Timeline ── */}
        <View style={{ paddingTop: 16 }}>
        {dayLoading && dayEvents.length === 0 ? (
          // Skeleton loader — 3 placeholder cards while fetching
          <View style={{ paddingHorizontal: 14, gap: 12 }}>
            {[80, 110, 70].map((h, i) => (
              <View key={i} style={{ height: h, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#E8E6F0', opacity: 0.5 + i * 0.1 }} />
            ))}
          </View>
        ) : dayEvents.length === 0 ? (
          <View style={[sc.emptyBox, { backgroundColor: cardBg, borderColor: cardBord }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>📅</Text>
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B', marginBottom: 4 }}>
              No events scheduled
            </Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center' }}>
              {isKid ? 'Tap "+" below to ask for a ride or anything else.'
                : isSenior ? 'No rides or events assigned to you today.'
                : 'Tap "+ Event" to add one for the family.'}
            </Text>
          </View>
        ) : (
          compact ? (
            /* ── Compact time-grid — Google Calendar style ── */
            <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
              {dayEvents.map((ev, idx) => {
                const { time, ampm } = fmtTimeParts(ev.time);
                const cs = catStyle(ev.category, isDark);
                const isConf = ev.conflict;
                const assignee = members.find(m => m.id === ev.memberId);
                const isLast = idx === dayEvents.length - 1;
                const isPast = isEventPast(ev.date, ev.time);
                // Helper role reads by event category — a tutor isn't "the ride"
                const helperEmoji =
                  ev.category === 'Medical' ? '🏥' :
                  ev.category === 'Study'   ? '📚' :
                  ev.category === 'Ride' || ev.category === 'Sports' ? '🚗' : '🤝';
                // Time-sensitive: starting within the hour and still unresolved —
                // pulses a gradient glow instead of a static amber border
                const minsUntil = minutesUntilEvent(ev.date, ev.time);
                const isUrgent = !isPast && minsUntil >= 0 && minsUntil <= 60 &&
                  (isConf || (!!ev.helper && ev.helperStatus !== 'confirmed') || (!!ev.rideRequired && (!ev.driverName || ev.driverStatus !== 'confirmed')));
                const isBusyBlock = sensitiveVisibility(ev) === 'busy-block';

                return (
                  <View key={ev.id} style={{ flexDirection: 'row', minHeight: 56, opacity: isPast ? 0.45 : 1 }}>

                    {/* Left col: time label + connecting line */}
                    <View style={{ width: 40, alignItems: 'flex-end', paddingRight: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '900', color: isDark ? '#C4B5FD' : BRAND.purple, lineHeight: 14 }}>{time}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? '#A78BFA' : '#7C3AED', lineHeight: 11 }}>{ampm}</Text>
                      {/* Connecting line to next event */}
                      {!isLast && (
                        <View style={{
                          flex: 1, width: 1.5, marginTop: 4, marginRight: 4,
                          backgroundColor: isDark ? BRAND.purple + '35' : BRAND.purple + '25',
                          alignSelf: 'flex-end',
                        }} />
                      )}
                    </View>

                    {/* Right col: card — busy-block for a sensitive event the
                        viewer isn't shared into (see BusyBlockCard's own
                        comment), full detail otherwise. */}
                    {isBusyBlock ? (
                      <View style={{ flex: 1, marginBottom: isLast ? 0 : 8 }}>
                        <BusyBlockCard time={ev.time} endTime={ev.endTime} colors={colors} isDark={isDark} />
                      </View>
                    ) : (
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped event "${ev.title}" (id=${ev.id}) in compact day timeline → open detail sheet [features/calendar/CalendarScreen.tsx:1400]`); setDetailEv(ev); }}
                      onLongPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} long-pressed event "${ev.title}" (id=${ev.id}) in compact day timeline → routeLongPress [features/calendar/CalendarScreen.tsx:1401]`); routeLongPress(ev); }}
                      style={{
                        flex: 1, marginBottom: isLast ? 0 : 8, position: 'relative', overflow: 'hidden',
                        backgroundColor: cardBg, borderRadius: 16,
                        borderWidth: isUrgent ? 1.5 : 1, borderColor: isUrgent ? '#EF444490' : isConf ? '#F59E0B55' : cardBord,
                        borderLeftWidth: 4, borderLeftColor: isUrgent ? '#EF4444' : isConf ? '#F59E0B' : cs.dot,
                        paddingHorizontal: 14, paddingVertical: 12, gap: 8,
                      }}>
                      {isUrgent && <UrgentPulse />}
                      {/* Row 1: title + category */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ flex: 1, fontSize: TYPO.heading - 2, fontWeight: '900', color: isDark ? colors.textPrimary : '#1E2D6B' }} numberOfLines={1}>
                          {ev.title}
                        </Text>
                        {isConf && <I.AlertTriangle c="#F59E0B" size={15} />}
                        <View style={{ backgroundColor: cs.dot + '1A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: cs.dot + '44' }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: cs.dot }}>{isPast ? '✓ Done' : ev.category}</Text>
                        </View>
                      </View>
                      {/* Row 2: person/location (left) ↔ helper/status (right) — spread across the full width */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                          {(() => {
                            const all = ev.memberIds?.length ? members.filter(m => ev.memberIds!.includes(m.id)) : assignee ? [assignee] : [];
                            return all.length > 0 ? all.map(m => (
                              <FamilyAvatar key={m.id} name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={members.map(x => x.name)} size={24} ringColor={BRAND.purple} ringWidth={1.5} />
                            )) : null;
                          })()}
                          {ev.location ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                              <I.MapPin c={isDark ? '#34D399' : '#059669'} size={15} />
                              <LocationLink addr={ev.location} color={isDark ? '#34D399' : '#059669'} fontSize={TYPO.body} fontWeight="700" />
                            </View>
                          ) : null}
                        </View>
                        {ev.helper ? (() => {
                          const stColor = ev.helperStatus === 'confirmed' ? '#10B981' : ev.helperStatus === 'rejected' ? '#EF4444' : '#D97706';
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: stColor + '15', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 12 }}>{helperEmoji}</Text>
                              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isDark ? '#FBBF24' : '#D97706' }}>{ev.helper.split(' ')[0]}</Text>
                              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: stColor }} />
                            </View>
                          );
                        })() : null}
                      </View>
                    </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
          /* Full view: solid vertical line on left, cards on right */
          <View style={{ flexDirection: 'row', paddingRight: 14 }}>

            {/* Vertical timeline spine */}
            <View style={{ width: 56, alignItems: 'center', position: 'relative' }}>
              {/* Solid line through all events */}
              <View style={{ position: 'absolute', top: 22, bottom: 22, left: 27,
                width: 2, backgroundColor: isDark ? BRAND.purple + '40' : BRAND.purple + '25' }} />
            </View>

            {/* Event cards column */}
            <View style={{ flex: 1, gap: 16, paddingBottom: 8 }}>
            {dayEvents.map((ev, i) => {
              const { time, ampm } = fmtTimeParts(ev.time);
              const cs     = catStyle(ev.category, isDark);
              const isConf = ev.conflict;
              const assignee = members.find(m => m.id === ev.memberId);

              // Context-aware "for" label per category
              const cat = ev.category ?? 'Event';
              const forLabel =
                cat === 'Medical' ? 'Patient'  :
                cat === 'Sports'  ? 'Player'   :
                cat === 'Study'   ? 'Student'  :
                cat === 'Ride'    ? 'Passenger':
                cat === 'Work'    ? null        : // no "for" row on own tasks
                'For';

              // Context-aware helper label
              const helperLabel =
                cat === 'Medical' ? '🏥 Accompanied by' :
                cat === 'Study'   ? '📚 Tutored by'     :
                cat === 'Sports'  ? '🚗 Drop-off by'    :
                cat === 'Ride'    ? '🚗 Driven by'      :
                '🤝 Organised by';

              // Past events: read-only except notes
              const isPast     = isEventPast(ev.date, ev.time);

              // RBAC checks (all blocked for past events)
              const canApproveRequest = !isPast && isParent && ev.approvalPending;

              // Which members to show in the picker depends on category
              const pickerMembers = (cat === 'Work')
                ? members.filter(m => m.role === 'parent' || m.role === 'senior')
                : members.filter(m => m.role === 'kid');

              // Swipe-delete eligibility: future event + parent (any) or kid own pending
              // Spec 2.7: a teen who created a still-pending event needs the
              // same Withdraw ability a kid gets for their own pending
              // request — this was isKid-only, leaving a teen's own pending
              // event with no way to cancel it themselves.
              const canDelete    = !isPast && (isParent || ((isKid || isTeen) && !!ev.approvalPending && ev.memberId === activeMemberId));

              const handleEvDelete = () => {
                console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "${ev.approvalPending ? 'Withdraw' : 'Delete'}" (swipe reveal) on "${ev.title}" (id=${ev.id}) [features/calendar/CalendarScreen.tsx:1508]`);
                Alert.alert(
                ev.approvalPending ? 'Withdraw Request' : 'Remove Event',
                `${ev.approvalPending ? 'Withdraw' : 'Remove'} "${ev.title}"?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: ev.approvalPending ? 'Withdraw' : 'Delete', style: 'destructive', onPress: () => {
                    console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} confirmed "${ev.approvalPending ? 'Withdraw' : 'Delete'}" on "${ev.title}" (id=${ev.id}) → deleteEvent [features/calendar/CalendarScreen.tsx:1513]`);
                    notifyDeleteIfAssigned(ev);
                    deleteEvent(ev.id);
                  }},
                ]
              ); };

              return (
                <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'flex-start', opacity: isPast ? 0.5 : 1 }}>
                  {/* Left: time-dot on spine */}
                  <View style={{ width: 56, alignItems: 'center', paddingTop: 10, marginLeft: -56, zIndex: 2 }}>
                    <View style={{
                      width: 42, height: 42, borderRadius: 21,
                      backgroundColor: isConf ? '#F59E0B' : cs.dot,
                      borderWidth: 3, borderColor: isDark ? colors.background : '#F0EEFF',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff', lineHeight: 12 }}>{time}</Text>
                      <Text style={{ fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.8)', lineHeight: 10 }}>{ampm}</Text>
                    </View>
                  </View>

                  {/* Event Card (swipeable + long-press to edit) — swipe-to-
                      delete stays owned here (SwipeableEventCard), the card
                      body itself now renders through the shared
                      EventCardTimeline so this matches DaySlotView's card
                      treatment 1:1. */}
                  {sensitiveVisibility(ev) === 'busy-block' ? (
                    <BusyBlockCard time={ev.time} endTime={ev.endTime} colors={colors} isDark={isDark} />
                  ) : (
                    <SwipeableEventCard
                      canDelete={canDelete}
                      onDelete={handleEvDelete}
                      onLongPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} long-pressed event "${ev.title}" (id=${ev.id}) in full day timeline → routeLongPress [features/calendar/CalendarScreen.tsx:1546]`); routeLongPress(ev); }}
                      onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped event "${ev.title}" (id=${ev.id}) in full day timeline → open detail sheet [features/calendar/CalendarScreen.tsx:1547]`); setDetailEv(ev); }}
                    >
                      <EventCardTimeline
                        ev={ev}
                        members={members}
                        colors={colors} isDark={isDark}
                        isPast={isPast}
                        isConf={!!isConf}
                        cs={cs}
                        forLabel={forLabel}
                        helperLabel={helperLabel}
                        pickerMembers={pickerMembers}
                        isParent={isParent}
                        isKid={isKid}
                        canApproveRequest={!!canApproveRequest}
                        onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped event "${ev.title}" (id=${ev.id}) card body → open detail sheet [features/calendar/CalendarScreen.tsx:1562]`); setDetailEv(ev); }}
                        onLongPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} long-pressed event "${ev.title}" (id=${ev.id}) card body → routeLongPress [features/calendar/CalendarScreen.tsx:1563]`); routeLongPress(ev); }}
                        onAssignMember={(memberId) => { const m = members.find(x => x.id === memberId); console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} selected "${m?.name}" (id=${memberId}) to assign on "${ev.title}" (id=${ev.id}) → updateEvent memberId [features/calendar/CalendarScreen.tsx:1564]`); updateEvent(ev.id, { memberId }); }}
                        onApprove={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Approve & Assign" on "${ev.title}" (id=${ev.id}) → updateEvent approvalPending=false [features/calendar/CalendarScreen.tsx:1565]`); updateEvent(ev.id, { approvalPending: false, helperStatus: 'pending' }); }}
                        canDelete={canDelete}
                      />
                    </SwipeableEventCard>
                  )}
                </View>
              );
            })}
            </View>

            {/* Load more — only on days with 30+ events */}
            {hasMore && (
              <TouchableOpacity
                style={{ marginHorizontal: 14, marginTop: 4, paddingVertical: 12, borderRadius: 16,
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9', alignItems: 'center' }}
                onPress={() => { console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Load more events" for date=${selectedDate} [features/calendar/CalendarScreen.tsx:1583]`); loadMoreDay(); }}
                disabled={dayLoading}
              >
                {dayLoading
                  ? <ActivityIndicator size="small" color={BRAND.purple} />
                  : <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.purple }}>Load more events</Text>}
              </TouchableOpacity>
            )}
          </View>
          )
        )}
        </View>
        </>
        )}
        </React.Fragment>)}
      </ScrollView>

      {/* Modals */}
      {/* Full event form — parent/senior/teen create only. A kid's own
          "+ Ask Help" button (showAskHelp) now opens KidRequestModal
          instead — the purpose-built 3-step kid flow, not this shared
          adult form's isKid branch (removed; see KidRequestModal's own
          header comment for why). */}
      <EventFormAdd
        visible={showAdd}
        activeMemberId={activeMember?.id ?? ''}
        onClose={() => { setShowAdd(false); setAddPrefill(undefined); }}
        prefill={addPrefill as any}
      />
      <KidRequestModal
        visible={showAskHelp}
        activeMemberId={activeMember?.id ?? ''}
        onClose={() => setShowAskHelp(false)}
      />
      {/* Kid editing their own still-pending request — see routeLongPress
          above for the gating (own event, approvalPending only). */}
      {kidEditEv && (
        <KidRequestModal
          visible
          activeMemberId={activeMember?.id ?? ''}
          editEvent={kidEditEv}
          onClose={() => setKidEditEv(null)}
        />
      )}

      {/* Edit event — long-press on any card opens this */}
      {editEv && (
        <EditEventModal
          event={editEv}
          activeMemberId={activeMember?.id ?? ''}
          onClose={() => setEditEv(null)}
          onDelete={(scope) => {
            notifyDeleteIfAssigned(editEv);
            if (scope) useEventStore.getState().deleteEventScoped(editEv.id, scope);
            else deleteEvent(editEv.id);
            setEditEv(null);
          }}
        />
      )}

      {/* Event detail + ride/helper-assignment actions — same EventDetailSheet
          Hub uses (Accept/Decline/Take-Over/Swap all live there now), so
          Calendar and Hub share one action surface instead of maintaining
          duplicate accept/decline/reassign UI. */}
      {detailEv && (
        <EventDetailSheet
          // Was `events.find(...) ?? detailEv` — events is the raw,
          // unsanitized day cache, so this silently reintroduced full
          // title/notes/location/doctorName for a "busy block" a senior
          // had just been shown as stripped, the moment its id happened to
          // also be present in that raw array (e.g. selected date
          // matches, or it was prefetched). Re-applies the same
          // sensitivity stripping scopedRangeEvents/dayEvents already do,
          // instead of trusting the raw lookup (QA sweep, grandparent-role
          // audit, Critical C4).
          ev={(() => {
            const fresh = events.find(e => e.id === detailEv.id) ?? detailEv;
            if (sensitiveVisibility(fresh) !== 'busy-block') return fresh;
            return {
              ...fresh,
              title: 'Busy', notes: undefined, location: undefined,
              doctorName: undefined, subject: undefined, coachName: undefined,
              helper: undefined, driverName: undefined,
            };
          })()}
          members={members}
          colors={colors} isDark={isDark}
          activeName={activeMemberName}
          updateEvent={updateEvent}
          onClose={() => setDetailEv(null)}
          onEditFull={() => { const ev = detailEv; console.log(`[UserAction] screen=Schedule role=${roleLabel} member=${activeMemberName} tapped "Edit full details" on "${ev.title}" (id=${ev.id}) → open EditEventModal [features/calendar/CalendarScreen.tsx:1691]`); setDetailEv(null); setEditEv(ev); }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  titleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  title:        { fontSize: TYPO.heading, fontWeight: '900' },

  pill:         { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 22, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  pillText:     { fontSize: TYPO.caption, fontWeight: '700' },

  timeLabel:    { position: 'absolute', left: -30, top: 14, alignItems: 'flex-end', width: 26 },
  timelineDot:  { position: 'absolute', left: -6, top: 18, width: 12, height: 12, borderRadius: 6, borderWidth: 3 },

  assignRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8, flexWrap: 'wrap' },
  assignChip:   { borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },

  driverSection:{ borderTopWidth: 1, paddingTop: 8, gap: 6 },
  statusBadge:  { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:   { fontSize: TYPO.label, fontWeight: '800' },
  rejectedBox:  { borderRadius: 14, borderWidth: 1, padding: 10 },
  reassignBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BRAND.amber, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-end' as any },

  emptyBox:     { borderRadius: 24, borderWidth: 1, padding: 48, alignItems: 'center', marginHorizontal: 14 },
});
