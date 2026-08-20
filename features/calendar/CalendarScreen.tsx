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
import { useEventStore, FamilyEvent, EventType, StripMap, isEventSensitive, canViewSensitiveEventDetail } from '@/store/eventStore';
import { supabase } from '@/lib/supabase';
import AppHeader from '@/components/AppHeader';
import NotificationPanel from '@/components/NotificationPanel';
import { useNotifStore } from '@/store/notifStore';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { TYPO } from '@/constants/theme';
import { fmtDate, fmtDateShort, fmtTimeParts } from '@/lib/dates';
import { AddEventModal as EventFormAdd, EditEventModal } from './EventFormModal';
import { EventDetailSheet } from '@/features/hub/hubComponents';
import AddIntakeChooser from '@/components/AddIntakeChooser';
import { useChatStore } from '@/store/chatStore';
import { relationalNameByName } from '@/lib/format';
import { EventCardTimeline, roleStyle, catStyle, LocationLink } from './components/EventCard';
import { s as calCardStyles } from './components/calendarCardStyles';
import { AiConflictBanner, type AiConflict, type AiResult } from './components/AiConflictBanner';
import { CalendarSearchBar } from './components/CalendarSearchBar';
import { toDateStr, parseDate, addDays, DAY_SHORT, CAT_DOT, buildMonthGrid, isEventPast } from './components/calendarDateHelpers';
import MonthGridView, { DayEventsSummaryCard } from './components/MonthGridView';
import WeekView from './components/WeekView';
import AgendaView from './components/AgendaView';
import DaySlotView from './components/DaySlotView';

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

function simulateConflictDetection(events: FamilyEvent[]): Promise<AiResult> {
  return new Promise(res => setTimeout(() => {
    const conflicted = events.filter(e => e.conflict);
    const pending    = events.filter(e => e.helperStatus === 'pending');
    const rejected   = events.filter(e => e.helperStatus === 'rejected');

    const conflicts: AiConflict[] = [];

    if (conflicted.length > 0) {
      conflicted.forEach(ev => {
        conflicts.push({
          description: `"${ev.title}" at ${ev.time} overlaps with another commitment — assistant gap detected`,
          eventsInvolved: [ev.title, 'Parent schedule'],
          suggestedFix: 'Assign an available adult family member to assist',
          recommendedDriverSwap: 'Grandma Mary',
        });
      });
    }

    if (rejected.length > 0) {
      rejected.forEach(ev => {
        conflicts.push({
          description: `"${ev.title}" assistant declined — no confirmed helper assigned`,
          eventsInvolved: [ev.title],
          suggestedFix: 'Find another available parent or grandparent',
          recommendedDriverSwap: 'Priya (Mom)',
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

    res({
      summary: conflicts.length === 0
        ? 'All events have confirmed assistants. No time overlaps detected. Family schedule looks smooth for the selected period!'
        : `Detected ${conflicts.length} logistics issue(s): ${conflicted.length} time conflict(s), ${rejected.length} declined assistant(s), ${pending.length} pending confirmation(s). Immediate attention recommended.`,
      conflictsFound: conflicts.length > 0,
      conflicts,
    });
  }, 1800));
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
export default function CalendarScreen() {
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
    if (!claimantName) return;
    const msg = `🗑️ ${relationalNameByName(activeMemberName, members)} removed "${ev.title}" — ${relationalNameByName(claimantName, members)} is no longer needed for it.`;
    const claimantMember = members.find(m => m.name === claimantName);
    if (claimantMember) {
      useChatStore.getState().sendMessage(claimantMember.id, activeMemberId ?? '', msg);
    } else {
      // Free-text helper/driver name that isn't a real family member (e.g.
      // an external tutor/coach) — no member id to DM, fall back to the
      // family channel so the cancellation is still visible somewhere.
      useChatStore.getState().sendMessage('all', activeMemberId ?? '', msg);
    }
  };

  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const todayStr = toDateStr(new Date());
  const goToToday = () => {
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
  const [showAddChooser, setShowAddChooser] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{
    title: string; category?: string; memberId?: string; startAt?: string; notes?: string;
  } | undefined>(undefined);
  const [showAskHelp,   setShowAskHelp]   = useState(false);
  const [editEv,        setEditEv]        = useState<FamilyEvent | null>(null);

  const calScrollRef = useRef<ScrollView>(null);

  const prevCalMemberRef = useRef(activeMemberId);
  React.useEffect(() => {
    if (prevCalMemberRef.current === activeMemberId) return;
    prevCalMemberRef.current = activeMemberId;
    setFilterMember(null);
    setScheduleFilter(isParent ? 'all' : 'mine');
    setCompact(isKid);
    setShowAdd(false);
    setShowAskHelp(false);
    setEditEv(null);
    setShowAiPanel(false);
    setIsAnalyzing(false);
    calScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeMemberId]);
  const [compact,       setCompact]       = useState(isKid);
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
  const [searchQuery,   setSearchQuery]   = useState('');

  // AI state
  const [aiResult,       setAiResult]       = useState<AiResult | null>(null);
  const [isAnalyzing,    setIsAnalyzing]    = useState(false);
  const [showAiPanel,    setShowAiPanel]    = useState(false);
  const [appliedSwaps,   setAppliedSwaps]   = useState<Record<string, boolean>>({});

  const switchMember = () => {
    const idx = members.findIndex(m => m.id === activeMember?.id);
    const next = members[(idx + 1) % members.length];
    if (next) setActiveMember(next.id);
  };

  const runAiScan = async () => {
    setIsAnalyzing(true);
    setShowAiPanel(true);
    const todayStr = toDateStr(new Date());
    const futureEvents = events.filter(e => e.date >= todayStr);
    const result = await simulateConflictDetection(futureEvents);
    setAiResult(result);
    setIsAnalyzing(false);
  };

  const handleApplySwap = (idx: number, conflict: AiConflict) => {
    if (!conflict.recommendedDriverSwap) return;
    const targetEv = events.find(e => e.conflict || e.helperStatus === 'rejected') ?? events[0];
    if (targetEv) {
      updateEvent(targetEv.id, { helper: conflict.recommendedDriverSwap, helperStatus: 'pending', conflict: false });
    }
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
    if (!filterMember) return stripMap;
    const first = filterMemberName?.split(' ')[0];
    const map: StripMap = {};
    for (const r of stripRows) {
      const matches = !r.memberId
        || r.memberId === filterMember
        || (filterMemberName && r.helper && (r.helper.includes(filterMemberName) || (first && r.helper.includes(first))))
        || (filterMemberName && r.driverName && (r.driverName.includes(filterMemberName) || (first && r.driverName.includes(first))));
      if (!matches) continue;
      if (!map[r.date]) map[r.date] = [];
      if (!map[r.date].includes(r.category)) map[r.date].push(r.category);
    }
    return map;
  }, [stripMap, stripRows, filterMember, filterMemberName]);

  // Filtered events for selected day
  const dayEvents = useMemo(() => {
    return events
      .filter(e => e.date === selectedDate &&
        e.category !== 'Holiday' &&
        // Scenarios 2.6/2.10/5.4/5.5 — a sensitive/private/Medical event is
        // hidden entirely from a sibling kid/teen and from GP (unless
        // explicitly shared for care) BEFORE any of the ordinary
        // assignee-based visibility rules below even apply. Both parents
        // and the event's own subject always pass this check.
        (!isEventSensitive(e) || canViewSensitiveEventDetail(e, isSenior ? 'senior' : isKid ? 'kid' : isTeen ? 'teen' : isParent ? 'parent' : undefined, activeMemberId ?? undefined)) &&
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
          (e.helper && (e.helper.includes(activeMemberName) || activeMemberName.includes(e.helper.split(' ')[0]))) ||
          (!e.memberId && !e.memberIds?.length)
        )) &&
        // My Schedule / All tabs (kid/teen/senior only — parents always see all)
        (isParent || scheduleFilter === 'all' ||
          e.memberId === activeMemberId ||
          e.memberIds?.includes(activeMemberId ?? '') ||
          (!e.memberId && !e.memberIds?.length)) &&
        matchesMemberFilter(e) &&
        matchesSearch(e))
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  }, [events, selectedDate, filterMember, filterMemberName, scheduleFilter, isSenior, isKid, isTeen, isParent, activeMemberId, activeMemberName, searchQuery]);

  // Same RBAC shape as dayEvents but across rangeEvents' multi-date window
  // — feeds Week/Agenda, both parent/senior-only views (same gate as
  // Family). Kids get full visibility here too — same reasoning as
  // dayEvents above.
  const scopedRangeEvents = useMemo(() => {
    return rangeEvents.filter(e =>
      e.category !== 'Holiday' &&
      // Same sensitivity gate as dayEvents above.
      (!isEventSensitive(e) || canViewSensitiveEventDetail(e, isSenior ? 'senior' : isKid ? 'kid' : isTeen ? 'teen' : isParent ? 'parent' : undefined, activeMemberId ?? undefined)) &&
      // Same memberIds fix as dayEvents above — a senior/GP who's one of a
      // multi-member event's assignees (not the sole e.memberId) previously
      // never matched here either, so a shared event silently vanished from
      // their Week/Agenda views too.
      (!isSenior || (
        e.memberId === activeMemberId ||
        e.memberIds?.includes(activeMemberId ?? '') ||
        (e.helper && (e.helper.includes(activeMemberName) || activeMemberName.includes(e.helper.split(' ')[0]))) ||
        (!e.memberId && !e.memberIds?.length)
      )) &&
      matchesMemberFilter(e) &&
      matchesSearch(e)
    );
  }, [rangeEvents, isSenior, isKid, isTeen, isParent, activeMemberName, activeMemberId, filterMember, filterMemberName, searchQuery]);

  // Events where senior can volunteer as helper (has a pending/no helper, dated today or future)
  // seniorOpenRides removed — ride volunteering now lives in Hub > Helper Dispatch

  const selectedDateLabel = fmtDate(selectedDate);

  const cardBg   = isDark ? '#131927' : '#FFFFFF';
  const cardBord = isDark ? '#1E293B' : '#E2E8F0';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name}
        memberRole={isKid ? 'kid' : isSenior ? 'senior' : 'parent'}
        notifCount={unreadNotifCount}
        onPersonaPress={switchMember}
        onBellPress={() => setNotifPanelOpen(true)}
      />
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

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

        {/* [0] Scrollable: Title row + AI banner + AI panel */}
        <View>
          <View style={[sc.titleRow, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}>
            <View>
              <Text style={[sc.title, { color: isDark ? colors.textPrimary : '#1E2D6B' }]}>
                {isKid ? 'My Schedule' : 'Family Schedule'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>
                  {selectedDateLabel}
                </Text>
                {selectedDate !== todayStr && (
                  <TouchableOpacity onPress={goToToday}
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
                onClosePanel={() => setShowAiPanel(false)}
                onApplySwap={handleApplySwap}
                colors={colors} isDark={isDark}
              />
            )}
            <CalendarSearchBar query={searchQuery} onQueryChange={setSearchQuery} colors={colors} isDark={isDark} />
            {isKid ? (
              <>
                {/* List view toggle — defaults on for kids */}
                <TouchableOpacity
                  onPress={() => setCompact(v => !v)}
                  style={[calCardStyles.headerBtnOutline, { borderColor: compact ? BRAND.purple : colors.border, backgroundColor: compact ? BRAND.purple + '15' : 'transparent' }]}>
                  <I.List c={compact ? BRAND.purple : colors.textTertiary} size={14} />
                </TouchableOpacity>
                <TouchableOpacity style={[calCardStyles.headerBtn, { backgroundColor: BRAND.amber }]} onPress={() => setShowAskHelp(true)}>
                  <I.HelpCircle c="#0F172A" size={14} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#0F172A' }}>+ Ask Help</Text>
                </TouchableOpacity>
              </>
            ) : (
              isParentOrSenior && (
                <TouchableOpacity style={[calCardStyles.headerBtn, { backgroundColor: BRAND.purple }]} onPress={() => setShowAddChooser(true)}>
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
              onClosePanel={() => setShowAiPanel(false)}
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
                style={[sc.pill, !filterMember ? { backgroundColor: BRAND.purple, borderColor: BRAND.purple } : { backgroundColor: isDark ? colors.surface : '#F5F4FA', borderColor: isDark ? colors.border : 'rgba(146,97,199,0.2)' }]}
                onPress={() => setFilterMember(null)}>
                <Text style={[sc.pillText, { color: !filterMember ? '#fff' : colors.textSecondary }]}>All Family</Text>
              </TouchableOpacity>
              {members.map(m => {
                const rs = roleStyle(m.role, colors);
                const isSel = filterMember === m.id;
                return (
                  <TouchableOpacity key={m.id}
                    style={[sc.pill, isSel ? { backgroundColor: BRAND.purple, borderColor: BRAND.purple } : { backgroundColor: isDark ? colors.surface : '#F5F4FA', borderColor: isDark ? colors.border : 'rgba(146,97,199,0.2)' }]}
                    onPress={() => setFilterMember(isSel ? null : m.id)}>
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
              single date" is still the relevant question. Parent/senior
              only — kids keep the simpler single Day view with no toolbar
              at all. */}
          {isParentOrSenior && (
            <View style={{ marginTop: 10, gap: 8 }}>
              {/* Mock's segmented control: equal-width tabs in one pill-shaped
                  bar, active tab lifted on a white/card chip — not a
                  scrolling row of separate pills. */}
              <View style={{ flexDirection: 'row', marginHorizontal: 14, backgroundColor: colors.surface, borderRadius: 12, padding: 3 }}>
                {([
                  { key: 'agenda' as const, label: 'Agenda' },
                  { key: 'month' as const,  label: 'Month' },
                  { key: 'week' as const,   label: 'Week' },
                  { key: 'day' as const,    label: 'Day' },
                ]).map(v => (
                  <TouchableOpacity key={v.key} onPress={() => setViewMode(v.key)}
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

        {/* My Schedule / All — kid/teen/senior scope toggle, not in the
            reference (it has no kid-mode concept), so this stays scoped
            to Day only, where "whose day am I looking at" is relevant. */}
        {viewMode === 'day' && !isParent && (
          <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: 'row', marginHorizontal: 14, marginTop: 10, marginBottom: 10,
              backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 12, padding: 3 }}>
              {([{ key: 'mine', label: 'My Schedule' }, { key: 'all', label: 'All' }] as const).map(t => (
                <TouchableOpacity key={t.key}
                  onPress={() => { setScheduleFilter(t.key); if (t.key === 'mine') setFilterMember(null); }}
                  style={{ flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center',
                    backgroundColor: scheduleFilter === t.key ? BRAND.purple : 'transparent' }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800',
                    color: scheduleFilter === t.key ? '#fff' : colors.textSecondary }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {!isKid && viewMode === 'month' && (
          <FadeInView>
            <MonthGridView
              monthDate={monthCursor}
              selected={selectedDate}
              stripMap={filteredStripMap}
              colors={colors} isDark={isDark}
              onSelectDay={(d) => { setSelectedDate(d); storeSelectDate(d); }}
              onChangeMonth={(delta) => setMonthCursor(prev => {
                const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
                return next;
              })}
            />
          </FadeInView>
        )}

        {!isKid && viewMode === 'week' && (
          <FadeInView>
            <WeekView
              weekStart={weekCursor}
              events={scopedRangeEvents}
              members={members}
              colors={colors} isDark={isDark}
              onSelectEvent={(ev) => setDetailEv(ev)}
              onNavigateWeek={(delta) => setWeekCursor(prev => addDays(prev, delta * 7))}
              onAddDay={(d) => { setSelectedDate(d); storeSelectDate(d); setShowAdd(true); }}
            />
          </FadeInView>
        )}

        {!isKid && viewMode === 'agenda' && (
          <FadeInView>
            {rangeLoading && scopedRangeEvents.length === 0 ? (
              <View style={{ paddingHorizontal: 14, gap: 10, paddingTop: 8 }}>
                {[70, 70, 70].map((h, i) => (
                  <View key={i} style={{ height: h, borderRadius: 16, backgroundColor: isDark ? '#1E293B' : '#E8E6F0', opacity: 0.5 + i * 0.1 }} />
                ))}
              </View>
            ) : (
              <AgendaView
                events={scopedRangeEvents}
                members={members}
                colors={colors} isDark={isDark}
                onSelectEvent={(ev) => setDetailEv(ev)}
                isViewerParent={isParent}
              />
            )}
          </FadeInView>
        )}

        {/* ── Holiday banner — quiet amber strip, not a full card ── */}
        {viewMode === 'day' && dayEvents.filter(ev => ev.category === 'Holiday').map(ev => (
          <View key={ev.id} style={{ marginHorizontal: 14, marginTop: 10, borderRadius: 12,
            backgroundColor: isDark ? '#451A03' : '#FEF3C7',
            borderWidth: 1, borderColor: isDark ? '#92400E' : '#F59E0B',
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}>
            <Text style={{ fontSize: 15 }}>🎌</Text>
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700',
              color: isDark ? '#FDE68A' : '#92400E' }} numberOfLines={1}>{ev.title}</Text>
            {ev.notes ? <Text style={{ fontSize: TYPO.micro, color: isDark ? '#FCD34D' : '#B45309' }}
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
        {!isKid && viewMode === 'month' ? (
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
              onSelectEvent={(ev) => setDetailEv(ev)}
            />
          </View>
        ) : viewMode === 'day' && isParentOrSenior ? (
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
                <TouchableOpacity onPress={() => { const d = toDateStr(addDays(parseDate(selectedDate), -1)); setSelectedDate(d); storeSelectDate(d); loadStrip(get15Days(d)); }}
                  style={{ padding: 6 }}>
                  <I.ChevronLeft c={colors.textSecondary} size={15} />
                </TouchableOpacity>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
                  {selectedDateLabel}
                </Text>
                <TouchableOpacity onPress={() => { const d = toDateStr(addDays(parseDate(selectedDate), 1)); setSelectedDate(d); storeSelectDate(d); loadStrip(get15Days(d)); }}
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
                <TouchableOpacity onPress={() => { const d = toDateStr(addDays(parseDate(selectedDate), -1)); setSelectedDate(d); storeSelectDate(d); loadStrip(get15Days(d)); }}
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
                <TouchableOpacity onPress={() => { const d = toDateStr(addDays(parseDate(selectedDate), 1)); setSelectedDate(d); storeSelectDate(d); loadStrip(get15Days(d)); }}
                  style={{ padding: 6 }}>
                  <I.ChevronRight c={colors.textSecondary} size={16} />
                </TouchableOpacity>
              </View>

              <DaySlotView
                dayEvents={dayEvents.filter(ev => ev.category !== 'Holiday')}
                members={members}
                colors={colors} isDark={isDark}
                onSelect={(ev) => setDetailEv(ev)}
                onAddAtTime={() => setShowAdd(true)}
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
              {isKid ? 'Tap "+ Ask Help / Ride" above to request parent assistance.'
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

                    {/* Right col: card */}
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={() => setDetailEv(ev)}
                      onLongPress={() => setEditEv(ev)}
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

              const handleEvDelete = () => Alert.alert(
                ev.approvalPending ? 'Withdraw Request' : 'Remove Event',
                `${ev.approvalPending ? 'Withdraw' : 'Remove'} "${ev.title}"?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: ev.approvalPending ? 'Withdraw' : 'Delete', style: 'destructive', onPress: () => {
                    notifyDeleteIfAssigned(ev);
                    deleteEvent(ev.id);
                  }},
                ]
              );

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
                  <SwipeableEventCard
                    canDelete={canDelete}
                    onDelete={handleEvDelete}
                    onLongPress={() => setEditEv(ev)}
                    onPress={() => setDetailEv(ev)}
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
                      onPress={() => setDetailEv(ev)}
                      onLongPress={() => setEditEv(ev)}
                      onAssignMember={(memberId) => updateEvent(ev.id, { memberId })}
                      onApprove={() => updateEvent(ev.id, { approvalPending: false, helperStatus: 'pending' })}
                      canDelete={canDelete}
                    />
                  </SwipeableEventCard>
                </View>
              );
            })}
            </View>

            {/* Load more — only on days with 30+ events */}
            {hasMore && (
              <TouchableOpacity
                style={{ marginHorizontal: 14, marginTop: 4, paddingVertical: 12, borderRadius: 16,
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9', alignItems: 'center' }}
                onPress={loadMoreDay}
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
      {/* Full event form — parent/senior create; kid requests Ride/Study */}
      <EventFormAdd
        visible={showAdd || showAskHelp}
        activeMemberId={activeMember?.id ?? ''}
        onClose={() => { setShowAdd(false); setShowAskHelp(false); setAddPrefill(undefined); }}
        prefill={addPrefill as any}
      />

      {/* Header "+ Event" button opens the Speak it/Type it chooser first —
          the contextual entry points (tap an empty day/time slot) still go
          straight to the manual form since the date is already implied. */}
      {isParentOrSenior && (
        <AddIntakeChooser
          visible={showAddChooser}
          kind="event"
          members={members}
          activeMemberId={activeMember?.id ?? ''}
          onClose={() => setShowAddChooser(false)}
          onTypeManually={(prefill) => {
            setShowAddChooser(false);
            setAddPrefill(prefill);
            setShowAdd(true);
          }}
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
          ev={events.find(e => e.id === detailEv.id) ?? detailEv}
          members={members}
          colors={colors} isDark={isDark}
          activeName={activeMemberName}
          updateEvent={updateEvent}
          onClose={() => setDetailEv(null)}
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
