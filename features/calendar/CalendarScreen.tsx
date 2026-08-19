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
import { useEventStore, FamilyEvent, EventType } from '@/store/eventStore';
import AppHeader from '@/components/AppHeader';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import { TYPO } from '@/constants/theme';
import { fmtDate, fmtDateShort, fmtTimeParts } from '@/lib/dates';
import { AddEventModal as EventFormAdd, EditEventModal } from './EventFormModal';
import { EventDetailSheet } from '@/features/hub/hubComponents';
import AddIntakeChooser from '@/components/AddIntakeChooser';
import { useChatStore } from '@/store/chatStore';
import { relationalNameByName } from '@/lib/format';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isEventPast(date: string, time?: string | null): boolean {
  const today = toDateStr(new Date());
  if (date < today) return true;
  if (date > today) return false;
  if (!time) return false;
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
}
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
function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
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
// Mon-first ordering
const DAY_SHORT = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

// ─── Location helpers ─────────────────────────────────────────────────────────
function shortAddress(addr: string, maxLen = 22): string {
  if (addr.length <= maxLen) return addr;
  // Keep up to the second comma segment (street + city), then ellipsis
  const parts = addr.split(',');
  const short = parts.length > 1 ? `${parts[0].trim()}, ${parts[1].trim()}` : addr;
  return short.length <= maxLen + 6 ? short : addr.slice(0, maxLen).trimEnd() + '…';
}

function openInMaps(addr: string) {
  const encoded = encodeURIComponent(addr);
  // Use web URLs — these open the native Maps app but stay in search/pin mode,
  // not turn-by-turn directions (which the maps:// scheme can trigger).
  const url = Platform.OS === 'ios'
    ? `https://maps.apple.com/?q=${encoded}`
    : `https://maps.google.com/?q=${encoded}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://maps.google.com/?q=${encoded}`)
  );
}

function LocationLink({ addr, color, fontSize = 13, iconSize = 12, fontWeight = '600' }: {
  addr: string; color: string; fontSize?: number; iconSize?: number; fontWeight?: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => openInMaps(addr)}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize, fontWeight: fontWeight as any, color, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }} numberOfLines={1}>
        {shortAddress(addr)}
      </Text>
      <Text style={{ fontSize: fontSize - 2, color, opacity: 0.7 }}>↗</Text>
    </TouchableOpacity>
  );
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

// ─── Category color system ────────────────────────────────────────────────────
const CAT_COLOR: Record<string, { dot: string; badge: string; text: string }> = {
  Medical:  { dot: '#EF4444', badge: '#FEE2E2', text: '#DC2626' },
  Work:     { dot: '#A855F7', badge: '#F3E8FF', text: '#7C3AED' },
  Sports:   { dot: '#F59E0B', badge: '#FEF3C7', text: '#D97706' },
  School:   { dot: '#3B82F6', badge: '#DBEAFE', text: '#1D4ED8' },
  Study:    { dot: '#3B82F6', badge: '#DBEAFE', text: '#1D4ED8' },
  Birthday: { dot: '#F59E0B', badge: '#FEF3C7', text: '#D97706' },
  Holiday:  { dot: '#F59E0B', badge: '#FEF3C7', text: '#D97706' },
  Event:    { dot: '#10B981', badge: '#D1FAE5', text: '#059669' },
  default:  { dot: '#10B981', badge: '#D1FAE5', text: '#059669' },
};
function catStyle(category?: string, isDark = false) {
  const c = CAT_COLOR[category ?? 'default'] ?? CAT_COLOR.default;
  if (isDark) return { dot: c.dot, badge: c.dot + '25', text: c.dot };
  return c;
}

// ─── Role color system — WHO the event is for, not what it's about ────────────
// Month/Week/Day/Agenda cards color by member role (teal=parent,
// amber=kid, purple=teen, pink=senior) rather than event category — matches
// the "whose event is this" scanning pattern from the Month/Week/Agenda
// reference design. Only `parent`/`kid` have dedicated tokens in
// constants/colors.ts; teen/senior reuse `primary`(purple)/`accent`(pink),
// the same fallback pairing DayGridView's LANE_ACCENTS already established.
function roleStyle(role: string | undefined, colors: any) {
  const dot =
    role === 'parent' ? colors.parent :
    role === 'kid'    ? colors.kid :
    role === 'teen'   ? colors.primary :
    role === 'senior' ? colors.accent :
    colors.textTertiary;
  return { dot, badge: dot + '20', text: dot };
}

// ─── AI Simulation ────────────────────────────────────────────────────────────
interface AiConflict {
  description: string;
  eventsInvolved: string[];
  suggestedFix?: string;
  recommendedDriverSwap?: string;
}
interface AiResult {
  summary: string;
  conflictsFound: boolean;
  conflicts: AiConflict[];
}

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

// Category → dot color map (used only in strip — no full event objects needed)
const CAT_DOT: Record<string, string> = {
  Medical:  '#EF4444',
  Work:     '#A855F7',
  Sports:   '#F59E0B',
  Study:    '#3B82F6',
  Ride:     '#10B981',
  Event:    '#10B981',
  Birthday: '#F59E0B',
  Holiday:  '#F59E0B',
};

// ─── Month grid — Apple Calendar style ─────────────────────────────────────
// A real month sheet: weekday header, 6-row grid, up to 3 category dots per
// day from the lightweight stripMap (no full event fetch needed to paint
// it). Tapping a day sets selectedDate, which drives the agenda list
// rendered below by the caller — the grid itself never renders events.
const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function buildMonthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Mon-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: string[] = [];
  for (let i = 0; i < startOffset; i++) cells.push('');
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateStr(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push('');
  return cells;
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

// Compact "Events for X" card — used both as Month's selected-day summary
// below the grid, and as the Day-first intro shown above the grid when
// Month opens on today (before the user has scrolled into the full grid).
function DayEventsSummaryCard({
  dateLabel, events, members, colors, isDark, onSelectEvent,
}: {
  dateLabel: string; events: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelectEvent: (ev: FamilyEvent) => void;
}) {
  const shown = events.filter(ev => ev.category !== 'Holiday');
  return (
    <View style={{ borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#F1F5F9', backgroundColor: isDark ? colors.card : '#fff', padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
          Events for {dateLabel}
        </Text>
        <View style={{ backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textSecondary }}>
            {shown.length} item{shown.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {shown.length === 0 ? (
        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontStyle: 'italic', paddingVertical: 8 }}>
          No scheduled events for this day. Tap + to add one.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {shown.map(ev => {
            const assignee = members.find(m => m.id === ev.memberId);
            const rs = roleStyle(assignee?.role, colors);
            const { time, ampm } = fmtTimeParts(ev.time);
            return (
              <TouchableOpacity key={ev.id} onPress={() => onSelectEvent(ev)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14,
                  borderWidth: 1, borderColor: rs.dot + '35',
                  backgroundColor: isDark ? rs.dot + '1A' : rs.badge,
                  paddingHorizontal: 10, paddingVertical: 9 }}>
                <View style={{ width: 3, height: 30, borderRadius: 2, backgroundColor: rs.dot }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }} numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textSecondary }}>{time}{ampm.toLowerCase()}</Text>
                    {ev.location && (
                      <>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>·</Text>
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>{ev.location}</Text>
                      </>
                    )}
                  </View>
                </View>
                {assignee && (
                  <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: rs.dot + '40' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: rs.text }}>{assignee.name.split(' ')[0]}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

function MonthGridView({
  monthDate, selected, stripMap, colors, isDark, onSelectDay, onChangeMonth,
}: {
  monthDate: Date; selected: string; stripMap: Record<string, string[]>; colors: any; isDark: boolean;
  onSelectDay: (d: string) => void;
  onChangeMonth: (delta: number) => void;
}) {
  const todayStr = toDateStr(new Date());
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <TouchableOpacity onPress={() => onChangeMonth(-1)} style={{ padding: 8 }}>
          <I.ChevronLeft c={colors.textSecondary} size={18} />
        </TouchableOpacity>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
          {MONTH_LABELS[month]} {year}
        </Text>
        <TouchableOpacity onPress={() => onChangeMonth(1)} style={{ padding: 8 }}>
          <I.ChevronRight c={colors.textSecondary} size={18} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {DAY_SHORT.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, letterSpacing: 0.4 }}>
            {d[0]}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100/7}%`, aspectRatio: 1 }} />;
          const date = parseDate(d);
          const isSel = d === selected;
          const isToday = d === todayStr;
          const cats = stripMap[d] ?? [];
          const dotColors = cats.map(c => CAT_DOT[c] ?? '#10B981').filter((c, idx, a) => a.indexOf(c) === idx).slice(0, 3);
          return (
            <TouchableOpacity key={d} onPress={() => onSelectDay(d)}
              style={{ width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{
                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isSel ? BRAND.purple : isToday ? BRAND.purple + '18' : 'transparent',
              }}>
                <Text style={{
                  fontSize: TYPO.body, fontWeight: isToday || isSel ? '900' : '600',
                  color: isSel ? '#fff' : isToday ? BRAND.purple : (isDark ? colors.textPrimary : '#1E2D6B'),
                }}>
                  {date.getDate()}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 3, height: 8, marginTop: 2, alignItems: 'center' }}>
                {dotColors.map((c, idx) => (
                  <View key={idx} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c }} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Week view — one card per day, chronological events inside ────────────────
// Simple day-cards rather than an hour grid (that's what Family view is
// for) — this is the "what's the shape of the week" overview: 7 cards,
// today highlighted, each showing its events as compact rows colored by
// who they're for.
function WeekView({
  weekStart, events, members, colors, isDark, onSelectEvent, onNavigateWeek, onAddDay,
}: {
  weekStart: Date; events: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelectEvent: (ev: FamilyEvent) => void;
  onNavigateWeek: (delta: number) => void;
  onAddDay?: (dateKey: string) => void;
}) {
  const todayStr = toDateStr(new Date());
  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 4, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={() => onNavigateWeek(-1)} style={{ padding: 8 }}>
          <I.ChevronLeft c={colors.textSecondary} size={16} />
        </TouchableOpacity>
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textSecondary }}>
          {fmtDateShort(toDateStr(weekStart))} – {fmtDateShort(toDateStr(weekEnd))}
        </Text>
        <TouchableOpacity onPress={() => onNavigateWeek(1)} style={{ padding: 8 }}>
          <I.ChevronRight c={colors.textSecondary} size={16} />
        </TouchableOpacity>
      </View>

      {days.map(day => {
        const dateKey = toDateStr(day);
        const isToday = dateKey === todayStr;
        const dayEvs = events.filter(e => e.date === dateKey && e.category !== 'Holiday')
          .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

        return (
          <View key={dateKey} style={{
            borderRadius: 18, padding: 12, gap: 8,
            backgroundColor: isToday ? (isDark ? BRAND.purple + '18' : BRAND.purple + '0C') : (isDark ? colors.card : '#fff'),
            borderWidth: 1, borderColor: isToday ? BRAND.purple + '50' : (isDark ? colors.border : '#F1F5F9'),
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: isToday ? BRAND.purple : colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {DAY_SHORT[(day.getDay() + 6) % 7]}
                </Text>
                {isToday ? (
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>{day.getDate()}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{day.getDate()}</Text>
                )}
              </View>
              {onAddDay ? (
                <TouchableOpacity onPress={() => onAddDay(dateKey)}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>+ Add</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary }}>
                  {dayEvs.length === 0 ? 'No events' : `${dayEvs.length} event${dayEvs.length === 1 ? '' : 's'}`}
                </Text>
              )}
            </View>

            {/* Reference's per-event row: border + light tint together
                (not just a tinted background), same role-color pairing. */}
            {dayEvs.length === 0 ? (
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontStyle: 'italic' }}>No events</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {dayEvs.map(ev => {
                  const assignee = members.find(m => m.id === ev.memberId);
                  const rs = roleStyle(assignee?.role, colors);
                  const { time, ampm } = fmtTimeParts(ev.time);
                  return (
                    <TouchableOpacity key={ev.id} onPress={() => onSelectEvent(ev)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
                        borderWidth: 1, borderColor: rs.dot + '35',
                        backgroundColor: isDark ? rs.dot + '1A' : rs.badge,
                      }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: rs.text, width: 46 }}>{time}{ampm.toLowerCase()}</Text>
                      <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }} numberOfLines={1}>
                        {ev.title}
                      </Text>
                      {assignee && <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: rs.text }}>{assignee.name.split(' ')[0]}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Agenda view — chronological list grouped by date, sticky headers ─────────
// Spans many upcoming days (not just one selected date) — the "what's
// coming up" view, matching the reference's grouped-by-date list pattern.
function AgendaView({
  events, members, colors, isDark, onSelectEvent,
}: {
  events: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelectEvent: (ev: FamilyEvent) => void;
}) {
  const todayStr = toDateStr(new Date());

  const grouped = useMemo(() => {
    const byDate: Record<string, FamilyEvent[]> = {};
    for (const ev of events) {
      if (ev.category === 'Holiday') continue;
      (byDate[ev.date] ??= []).push(ev);
    }
    const dates = Object.keys(byDate).sort();
    return dates.map(date => ({
      date,
      events: byDate[date].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    }));
  }, [events]);

  if (grouped.length === 0) {
    return (
      <View style={{ paddingHorizontal: 14, paddingTop: 8 }}>
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: isDark ? colors.border : '#F1F5F9', backgroundColor: isDark ? colors.card : '#fff', padding: 28, alignItems: 'center' }}>
          <Text style={{ fontSize: 26, marginBottom: 6 }}>📋</Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No upcoming events in this window</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 4, gap: 14 }}>
      {grouped.map(group => {
        const date = parseDate(group.date);
        const isToday = group.date === todayStr;
        return (
          <View key={group.date} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: isToday ? BRAND.purple : colors.textSecondary }}>
                {isToday ? 'TODAY · ' : ''}{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary }}>
                {group.events.length} event{group.events.length === 1 ? '' : 's'}
              </Text>
            </View>
            {group.events.map(ev => {
              const assignee = members.find(m => m.id === ev.memberId);
              const rs = roleStyle(assignee?.role, colors);
              const { time, ampm } = fmtTimeParts(ev.time);
              return (
                <TouchableOpacity key={ev.id} onPress={() => onSelectEvent(ev)}
                  style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                    borderRadius: 16, borderWidth: 1, borderColor: rs.dot + '35',
                    backgroundColor: isDark ? colors.card : '#fff',
                    paddingHorizontal: 10, paddingVertical: 10,
                  }}>
                  {/* Reference's boxed time chip (tinted square, member-
                      bordered) rather than a plain left-bar accent. */}
                  <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isDark ? rs.dot + '1A' : rs.badge, borderWidth: 1, borderColor: rs.dot + '40' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: rs.text }}>{time}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: rs.text, opacity: 0.8 }}>{ampm}</Text>
                  </View>
                  <View style={{ flex: 1, paddingTop: 2 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }} numberOfLines={1}>
                      {ev.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {ev.category && (
                        <View style={{ backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary }}>{ev.category}</Text>
                        </View>
                      )}
                      {ev.location && (
                        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>📍 {ev.location}</Text>
                      )}
                    </View>
                  </View>
                  {assignee && (
                    <View style={{ backgroundColor: rs.dot, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff' }}>{assignee.name.split(' ')[0]}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ─── Day view — simple hour-slot list, matching the reference exactly ─────────
// One fixed-height row per hour (5am–11pm), not a proportional time-block
// grid — an empty hour shows a dashed "+ tap to add" placeholder, a filled
// hour shows its event(s) as role-colored cards. This intentionally drops
// the proportional positioning/now-line/pull-to-month gesture the previous
// hour-grid Day view had, in favor of matching the reference's simpler
// slot-list pattern 1:1.
const DAY_SLOT_START_HOUR = 5;
const DAY_SLOT_END_HOUR = 23;

function DaySlotView({
  dayEvents, members, colors, isDark, onSelect, onAddAtTime,
}: {
  dayEvents: FamilyEvent[]; members: FamilyMember[]; colors: any; isDark: boolean;
  onSelect: (ev: FamilyEvent) => void;
  onAddAtTime: (hourTimeKey: string) => void;
}) {
  const hours = Array.from({ length: DAY_SLOT_END_HOUR - DAY_SLOT_START_HOUR + 1 }, (_, i) => DAY_SLOT_START_HOUR + i);

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 8 }}>
      {hours.map(hour => {
        const hourLabel = hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`;
        const hourTimeKey = `${String(hour).padStart(2, '0')}:00`;
        const matching = dayEvents.filter(ev => {
          const t = timeToMinutes(ev.time);
          return t !== null && Math.floor(t / 60) === hour;
        });

        return (
          <View key={hour}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 54, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : '#F1F5F9' }}>
            <View style={{ width: 64, paddingTop: 4 }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary, textAlign: 'right' }}>{hourLabel}</Text>
            </View>

            {matching.length > 0 ? (
              <View style={{ flex: 1, gap: 6 }}>
                {matching.map(ev => {
                  const assignee = members.find(m => m.id === ev.memberId);
                  const rs = roleStyle(assignee?.role, colors);
                  return (
                    <TouchableOpacity key={ev.id} onPress={() => onSelect(ev)}
                      style={{ borderRadius: 14, backgroundColor: isDark ? rs.dot + '1A' : rs.badge, padding: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }} numberOfLines={1}>
                          {ev.title}
                        </Text>
                        {assignee && (
                          <View style={{ backgroundColor: rs.dot, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff' }}>{assignee.name.split(' ')[0]}</Text>
                          </View>
                        )}
                      </View>
                      {(ev.location || ev.category) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          {ev.location && <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>📍 {ev.location}</Text>}
                          {ev.location && ev.category && <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>·</Text>}
                          {ev.category && <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>🏷️ {ev.category}</Text>}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TouchableOpacity onPress={() => onAddAtTime(hourTimeKey)}
                style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
                  borderColor: isDark ? colors.border : '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, fontWeight: '600' }}>+ Tap to add event</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}


// ─── Add Event Modal ──────────────────────────────────────────────────────────
const EVENT_TYPES: EventType[] = ['event', 'reminder', 'appointment', 'birthday'];
const EVENT_TYPE_LABEL: Record<EventType, string> = {
  event: '🎉 Event', reminder: '🔔 Reminder', appointment: '📋 Appointment', birthday: '🎂 Birthday',
};
const EVENT_CATS = ['Event', 'Medical', 'Work', 'Sports', 'Study', 'Ride'];

// AddEventModal and AskHelpModal replaced by EventFormAdd / EditEventModal from EventFormModal.tsx

function _OldAddEventModal({ visible, selectedDate, colors, isDark, onClose, onSave }: {
  visible: boolean; selectedDate: string;
  colors: any; isDark: boolean; onClose: () => void; onSave: (d: any) => void;
}) {
  const [title,    setTitle]    = useState('');
  const [time,     setTime]     = useState('');
  const [date,     setDate]     = useState(selectedDate);
  const [type,     setType]     = useState<EventType>('event');
  const [category, setCategory] = useState('Event');
  const [location, setLocation] = useState('');
  const [helper,   setHelper]   = useState('');
  const [saving,   setSaving]   = useState(false);

  React.useEffect(() => { if (visible) setDate(selectedDate); }, [visible, selectedDate]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 500));
    onSave({
      title: title.trim(), date, time: time || undefined, type, category,
      location: location || undefined,
      helper: helper || undefined,
      helperStatus: helper ? 'pending' : undefined,
      approvalPending: false, conflict: false,
    });
    setSaving(false);
    onClose();
    setTitle(''); setTime(''); setLocation(''); setHelper('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={ae.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[ae.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[ae.handle, { backgroundColor: colors.border }]} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[ae.title, { color: colors.textPrimary }]}>+ Add Event</Text>
              <TouchableOpacity onPress={onClose}><I.X c={colors.textSecondary} /></TouchableOpacity>
            </View>

            <Text style={[ae.label, { color: colors.textSecondary }]}>TITLE *</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: title.trim() ? colors.border : '#EF444480', backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
              placeholder="e.g. Soccer Practice" placeholderTextColor={colors.textTertiary} value={title} onChangeText={setTitle} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[ae.label, { color: colors.textSecondary }]}>DATE</Text>
                <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD', marginBottom: 0 }]}
                  value={date} onChangeText={setDate} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ae.label, { color: colors.textSecondary }]}>TIME (e.g. 3:30 PM)</Text>
                <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD', marginBottom: 0 }]}
                  placeholder="3:30 PM" placeholderTextColor={colors.textTertiary} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
              </View>
            </View>

            <Text style={[ae.label, { color: colors.textSecondary, marginTop: 12 }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                {EVENT_CATS.map(c => {
                  const cs = catStyle(c, isDark);
                  return (
                    <TouchableOpacity key={c} onPress={() => setCategory(c)}
                      style={[ae.catChip, { backgroundColor: category === c ? cs.badge : isDark ? colors.surface : '#F5F4FA', borderColor: category === c ? cs.dot : isDark ? colors.border : '#E2E8F0' }]}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: category === c ? cs.text : colors.textTertiary }}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={[ae.label, { color: colors.textSecondary }]}>LOCATION (optional)</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
              placeholder="e.g. Riverside Park" placeholderTextColor={colors.textTertiary} value={location} onChangeText={setLocation} />

            <Text style={[ae.label, { color: colors.textSecondary }]}>
              {category === 'Medical' ? '🏥 ACCOMPANIED BY (optional)'
                : category === 'Study'  ? '📚 TUTOR NAME (optional)'
                : category === 'Sports' ? '🚗 DROP-OFF BY (optional)'
                : category === 'Ride'   ? '🚗 DRIVEN BY (optional)'
                : '🤝 ORGANISED BY (optional)'}
            </Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
              placeholder="e.g. Priya (Mom)" placeholderTextColor={colors.textTertiary} value={helper} onChangeText={setHelper} />

            <TouchableOpacity style={[ae.submitBtn, { backgroundColor: title.trim() ? BRAND.purple : colors.border, opacity: saving ? 0.7 : 1 }]}
              onPress={submit} disabled={saving || !title.trim()}>
              {saving ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontSize: TYPO.caption, fontWeight: '900' }}>Add to Family Schedule</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const ae = StyleSheet.create({
  overlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, padding: 20, paddingBottom: 44 },
  handle:    { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  title:     { fontSize: 16, fontWeight: '900' },
  label:     { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6, marginTop: 8 },
  input:     { borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, marginBottom: 10 },
  catChip:   { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6 },
  submitBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8, flexDirection: 'row', justifyContent: 'center', gap: 8 },
});

// AskHelpModal replaced by EventFormAdd (kid path shows simplified Ride/Study form)
function _OldAskHelpModal({ visible, selectedDate, activeMemberId, colors, isDark, onClose, onSave }: {
  visible: boolean; selectedDate: string; activeMemberId: string;
  colors: any; isDark: boolean; onClose: () => void; onSave: (d: any) => void;
}) {
  const [what,    setWhat]    = useState('');
  const [time,    setTime]    = useState('');
  const [location,setLocation]= useState('');
  const [saving,  setSaving]  = useState(false);

  const submit = async () => {
    if (!what.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 500));
    onSave({
      title: what.trim(), date: selectedDate, time: time || undefined,
      location: location || undefined,
      type: 'event' as EventType, category: 'Ride',
      memberId: activeMemberId, approvalPending: true, conflict: false,
      helperRequestedBy: 'Kid',
    });
    setSaving(false);
    onClose(); setWhat(''); setTime(''); setLocation('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={ae.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[ae.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[ae.handle, { backgroundColor: colors.border }]} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[ae.title, { color: colors.textPrimary }]}>🚗 Ask for Help / Ride</Text>
              <TouchableOpacity onPress={onClose}><I.X c={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginBottom: 14 }}>
              Tell a parent what you need — they'll get a notification to approve and assign a driver.
            </Text>

            <Text style={[ae.label, { color: colors.textSecondary }]}>WHAT DO YOU NEED? *</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: what.trim() ? colors.border : '#F59E0B80', backgroundColor: isDark ? colors.surface : '#FFFBEB' }]}
              placeholder="e.g. Ride to soccer practice" placeholderTextColor={colors.textTertiary} value={what} onChangeText={setWhat} />

            <Text style={[ae.label, { color: colors.textSecondary }]}>TIME (e.g. 3:30 PM)</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
              placeholder="3:30 PM" placeholderTextColor={colors.textTertiary} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />

            <Text style={[ae.label, { color: colors.textSecondary }]}>LOCATION (optional)</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
              placeholder="e.g. Riverside Park" placeholderTextColor={colors.textTertiary} value={location} onChangeText={setLocation} />

            <TouchableOpacity style={[ae.submitBtn, { backgroundColor: what.trim() ? BRAND.amber : colors.border, opacity: saving ? 0.7 : 1 }]}
              onPress={submit} disabled={saving || !what.trim()}>
              {saving ? <ActivityIndicator color="#0F172A" size="small" />
                : <Text style={{ color: '#0F172A', fontSize: TYPO.caption, fontWeight: '900' }}>Send Request to Parent</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

// Shared by DaySlotView (hour-slot placement) — parses "HH:MM" into
// minutes-since-midnight.
function timeToMinutes(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const {
    events, dayLoading, hasMore,
    stripMap,
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
  const notifyDeleteIfAssigned = (ev: FamilyEvent) => {
    if (ev.helper && ev.helper !== activeMemberName &&
        (ev.helperStatus === 'pending' || ev.helperStatus === 'confirmed')) {
      useChatStore.getState().sendMessage('all', activeMemberId ?? '',
        `🗑️ ${relationalNameByName(activeMemberName, members)} removed "${ev.title}" — ${relationalNameByName(ev.helper, members)} is no longer needed for it.`);
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

  // Filtered events for selected day
  const dayEvents = useMemo(() => {
    return events
      .filter(e => e.date === selectedDate &&
        e.category !== 'Holiday' &&
        // Kid: only their own events or family-wide
        (!isKid || e.memberId === activeMemberId || !e.memberId) &&
        // Teen: sees all family events (like parent) — full schedule awareness
        // Senior: only events they're the helper on, or family-wide with no assigned member
        (!isSenior || (
          (e.helper && (e.helper.includes(activeMemberName) || activeMemberName.includes(e.helper.split(' ')[0]))) ||
          (!e.memberId && !e.helper) ||
          !(e as any).isPrivate
        )) &&
        // My Schedule / All tabs (kid/teen/senior only — parents always see all)
        (isParent || scheduleFilter === 'all' || e.memberId === activeMemberId || !e.memberId) &&
        (!filterMember || e.memberId === filterMember || !e.memberId))
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  }, [events, selectedDate, filterMember, scheduleFilter, isKid, isSenior, isParent, activeMemberId, activeMemberName]);

  // Same RBAC shape as dayEvents but across rangeEvents' multi-date window
  // — feeds Week/Agenda, both parent/senior-only views (same gate as
  // Family), so this skips the kid/teen My-Schedule branch entirely.
  const scopedRangeEvents = useMemo(() => {
    return rangeEvents.filter(e =>
      e.category !== 'Holiday' &&
      (!isSenior || (
        (e.helper && (e.helper.includes(activeMemberName) || activeMemberName.includes(e.helper.split(' ')[0]))) ||
        (!e.memberId && !e.helper) ||
        !(e as any).isPrivate
      )) &&
      (!filterMember || e.memberId === filterMember || !e.memberId)
    );
  }, [rangeEvents, isSenior, activeMemberName, filterMember]);

  // Events where senior can volunteer as helper (has a pending/no helper, dated today or future)
  // seniorOpenRides removed — ride volunteering now lives in Hub > Helper Dispatch

  const selectedDateLabel = fmtDate(selectedDate);

  const cardBg   = isDark ? '#131927' : '#FFFFFF';
  const cardBord = isDark ? '#1E293B' : '#E2E8F0';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.background : '#F5F4FA' }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name}
        memberRole={isKid ? 'kid' : isSenior ? 'senior' : 'parent'}
        notifCount={0}
        onPersonaPress={switchMember}
        onBellPress={() => {}}
      />

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
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {isKid ? (
                <>
                  {/* List view toggle — defaults on for kids */}
                  <TouchableOpacity
                    onPress={() => setCompact(v => !v)}
                    style={[sc.headerBtnOutline, { borderColor: compact ? BRAND.purple : colors.border, backgroundColor: compact ? BRAND.purple + '15' : 'transparent' }]}>
                    <I.List c={compact ? BRAND.purple : colors.textTertiary} size={14} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[sc.headerBtn, { backgroundColor: BRAND.amber }]} onPress={() => setShowAskHelp(true)}>
                    <I.HelpCircle c="#0F172A" size={14} />
                    <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#0F172A' }}>+ Ask Help</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {isParentOrSenior && (
                    <TouchableOpacity style={[sc.headerBtn, { backgroundColor: BRAND.purple }]} onPress={() => setShowAddChooser(true)}>
                      <I.Plus c="#fff" size={14} />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Event</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>

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
              <View style={{ flexDirection: 'row', marginHorizontal: 14, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 12, padding: 3 }}>
                {([
                  { key: 'month' as const,  label: 'Month' },
                  { key: 'week' as const,   label: 'Week' },
                  { key: 'day' as const,    label: 'Day' },
                  { key: 'agenda' as const, label: 'Agenda' },
                ]).map(v => (
                  <TouchableOpacity key={v.key} onPress={() => setViewMode(v.key)}
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9,
                      backgroundColor: viewMode === v.key ? (isDark ? colors.card : '#fff') : 'transparent',
                      shadowColor: '#000', shadowOpacity: viewMode === v.key && !isDark ? 0.06 : 0, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
                    }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700',
                      color: viewMode === v.key ? (isDark ? colors.textPrimary : '#0F172A') : colors.textSecondary }}>
                      {v.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* AI Conflict Banner — parent only, and only when there's
              actually something to flag. Permanent "agent is active" chrome
              read as prototype filler; a real conflict earns the space,
              nothing to report shouldn't take up a row every time the
              screen loads. */}
          {isParent && dayEvents.some(e => e.conflict || e.helperStatus === 'rejected') && (
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
              <TouchableOpacity onPress={runAiScan} style={{
                borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
                backgroundColor: isDark ? '#0D1B2A' : '#0F2027',
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <I.AlertTriangle c="#5EEAD4" size={15} />
                <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>
                  Schedule conflict detected
                </Text>
                {isAnalyzing
                  ? <ActivityIndicator size={12} color="#5EEAD4" />
                  : <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#5EEAD4' }}>Review →</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* AI Results Panel */}
          {showAiPanel && (
            <View style={[sc.aiPanel, {
              backgroundColor: isDark ? '#1E1B4B' : '#F5F0FF',
              borderColor: isDark ? '#6D28D940' : 'rgba(146,97,199,0.25)',
              marginHorizontal: 12, marginTop: 10,
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <I.Bot c={isDark ? '#C4B5FD' : BRAND.purple} size={15} />
                <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '900', color: isDark ? '#C4B5FD' : BRAND.purple }} numberOfLines={1}>
                  Schedule Conflicts & Recommendations
                </Text>
                <TouchableOpacity
                  onPress={() => setShowAiPanel(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: isDark ? 'rgba(167,139,250,0.18)' : 'rgba(146,97,199,0.12)' }}>
                  <I.X c={isDark ? '#A78BFA' : BRAND.purple} size={11} />
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: isDark ? '#A78BFA' : BRAND.purple }}>Close</Text>
                </TouchableOpacity>
              </View>
              {isAnalyzing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }}>
                  <ActivityIndicator color={BRAND.purple} size="small" />
                  <Text style={{ fontSize: TYPO.label, color: isDark ? '#A78BFA' : BRAND.purple, fontWeight: '700' }}>
                    Scanning for time overlaps, missing drivers, and travel conflicts...
                  </Text>
                </View>
              ) : aiResult ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: TYPO.label, color: isDark ? '#CBD5E1' : '#374151', lineHeight: 16 }}>{aiResult.summary}</Text>
                  {aiResult.conflictsFound ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <I.Shield c="#F59E0B" size={13} />
                        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#D97706' }}>
                          {aiResult.conflicts.length} Logistics Conflict(s) Detected:
                        </Text>
                      </View>
                      {aiResult.conflicts.map((c, idx) => (
                        <View key={idx} style={[sc.conflictCard, { backgroundColor: isDark ? '#1C1000' : '#FFF7ED' }]}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: isDark ? '#FDE68A' : '#92400E', marginBottom: 3 }}>{c.description}</Text>
                          <Text style={{ fontSize: TYPO.label, color: isDark ? '#F59E0B80' : '#D97706' }}>Affected: {c.eventsInvolved.join(' & ')}</Text>
                          {c.suggestedFix && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                              <Text style={{ fontSize: TYPO.label, color: '#6EE7B7', fontWeight: '700', flex: 1 }}>
                                💡 {c.suggestedFix}
                              </Text>
                              {c.recommendedDriverSwap && (
                                appliedSwaps[`swap_${idx}`] ? (
                                  <View style={sc.swapApplied}>
                                    <Text style={sc.swapAppliedText}>✓ Swapped to {c.recommendedDriverSwap}</Text>
                                  </View>
                                ) : (
                                  <TouchableOpacity style={sc.swapBtn} onPress={() => handleApplySwap(idx, c)}>
                                    <I.Arrows c="#0F172A" size={11} />
                                    <Text style={sc.swapBtnText}>⚡ Apply Swap to {c.recommendedDriverSwap}</Text>
                                  </TouchableOpacity>
                                )
                              )}
                            </View>
                          )}
                        </View>
                      ))}
                    </>
                  ) : (
                    <View style={[sc.allClearBox, { backgroundColor: isDark ? '#064E3B40' : '#F0FDF4' }]}>
                      <Text style={sc.allClearText}>✅ No schedule conflicts! All drivers and events smoothly covered.</Text>
                    </View>
                  )}
                </View>
              ) : null}
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
              stripMap={stripMap}
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
              const canDelete    = !isPast && (isParent || (isKid && !!ev.approvalPending && ev.memberId === activeMemberId));

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

                  {/* Event Card (swipeable + long-press to edit) */}
                  <SwipeableEventCard
                    canDelete={canDelete}
                    onDelete={handleEvDelete}
                    onLongPress={() => setEditEv(ev)}
                    onPress={() => setDetailEv(ev)}
                  >
                  <View style={[sc.evCard, { flex: 1, borderColor: isConf ? '#F59E0B60' : cardBord,
                    backgroundColor: isConf ? (isDark ? '#1C1700' : '#FFFBEB') : cardBg,
                    overflow: 'hidden' }]}>

                    {/* Header: always visible */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View style={[sc.catBadge, { backgroundColor: cs.badge, borderColor: cs.dot + '60' }]}>
                          <Text style={[sc.catText, { color: cs.text }]}>{cat.toUpperCase()}</Text>
                        </View>
                        {isConf && <I.AlertTriangle c="#F59E0B" size={12} />}
                        <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B', flex: 1 }}>
                          {ev.title}
                        </Text>
                      </View>
                    </View>

                    {isConf && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4, marginTop: 2 }}>
                        <I.AlertTriangle c="#F59E0B" size={12} />
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#F59E0B' }}>Scheduling Conflict Detected</Text>
                      </View>
                    )}

                    {/* Always-visible: for / patient row — shows ALL assigned members */}
                    {forLabel && (() => {
                      const allAssignees = ev.memberIds?.length
                        ? members.filter(m => ev.memberIds!.includes(m.id))
                        : assignee ? [assignee] : [];
                      return (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 }}>
                          {allAssignees.length > 0 ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>{forLabel}:</Text>
                              {allAssignees.map(m => (
                                <FamilyAvatar key={m.id} name={m.name} emoji={m.emoji} avatarUrl={(m as any).avatarUrl} siblings={members.map(x => x.name)} size={24} ringColor={cs.dot} ringWidth={1.5} />
                              ))}
                            </View>
                          ) : !isPast && isParent && pickerMembers.length > 0 ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>{forLabel}:</Text>
                              {pickerMembers.map(k => (
                                <TouchableOpacity key={k.id}
                                  style={{ padding: 2 }}
                                  onPress={() => updateEvent(ev.id, { memberId: k.id })}>
                                  <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={(k as any).avatarUrl} siblings={pickerMembers.map(x => x.name)} size={30} ringColor={ev.memberId === k.id ? BRAND.purple : colors.border} ringWidth={ev.memberId === k.id ? 2.5 : 1} bgColor={ev.memberId === k.id ? BRAND.purple + '20' : undefined} />
                                </TouchableOpacity>
                              ))}
                            </View>
                          ) : (
                            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>
                              {forLabel}: <Text style={{ fontWeight: '700' }}>—</Text>
                            </Text>
                          )}
                          {ev.location && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <I.MapPin c={isDark ? '#34D399' : '#059669'} size={11} />
                              <LocationLink addr={ev.location} color={isDark ? '#34D399' : '#059669'} fontSize={TYPO.label} fontWeight="600" />
                            </View>
                          )}
                        </View>
                      );
                    })()}

                    {/* Always-visible: category-specific extra fields */}
                    {cat === 'Medical' && ev.doctorName && (
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                        🩺 Doctor: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.doctorName}</Text>
                      </Text>
                    )}
                    {cat === 'Study' && ev.subject && (
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                        📖 Subject: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.subject}</Text>
                      </Text>
                    )}
                    {cat === 'Sports' && ev.coachName && (
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                        🏅 Coached by: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.coachName}</Text>
                      </Text>
                    )}
                    {(cat === 'Ride' || cat === 'Sports') && (ev.pickupLocation || ev.dropLocation) && (
                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                        {ev.pickupLocation && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <I.MapPin c={isDark ? '#34D399' : '#059669'} size={11} />
                            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>From: </Text>
                            <LocationLink addr={ev.pickupLocation} color={isDark ? '#34D399' : '#059669'} fontSize={TYPO.label} fontWeight="700" />
                          </View>
                        )}
                        {ev.dropLocation && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>→ To: </Text>
                            <LocationLink addr={ev.dropLocation} color={isDark ? '#34D399' : '#059669'} fontSize={TYPO.label} fontWeight="700" />
                          </View>
                        )}
                      </View>
                    )}

                    {/* Read-only helper/driver status now lives in the shared
                        EventDetailSheet (opened on tap) — Accept/Decline/
                        Take-Over/Swap are handled there so Calendar doesn't
                        maintain a second copy of that logic. */}

                    {/* Always-visible: notes */}
                    {ev.notes && (
                      <Text style={[sc.notesText, { backgroundColor: isDark ? '#1E1B4B' : '#F0F0FE', color: isDark ? '#C4B5FD' : '#4338CA', borderColor: isDark ? '#4338CA50' : '#C7D2FE' }]}>
                        📝 "{ev.notes}"
                      </Text>
                    )}

                    {/* Kid help/ride request awaiting parent approval — a
                        separate concern from ride/helper-assignment (that
                        part is handled by EventDetailSheet); kept inline
                        since it gates whether a helper can even be assigned
                        yet. */}
                    {canApproveRequest && (
                      <View style={[sc.approvalRow, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <I.AlertTriangle c="#F59E0B" size={12} />
                          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#F59E0B' }}>Request Pending</Text>
                        </View>
                        <TouchableOpacity style={[sc.approveBtn]}
                          onPress={() => updateEvent(ev.id, { approvalPending: false, helperStatus: 'pending' })}>
                          <I.Check c="#fff" size={13} />
                          <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Approve & Assign</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {!isPast && isKid && ev.approvalPending && (
                      <View style={[sc.approvalRow, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9', justifyContent: 'flex-start', gap: 6 }]}>
                        <I.AlertTriangle c="#F59E0B" size={12} />
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#F59E0B' }}>Awaiting parent approval…</Text>
                      </View>
                    )}

                    {/* Long-press hint (only on non-past events) */}
                    {!isPast && (
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 4, textAlign: 'right', opacity: 0.6 }}>
                        Hold to edit{canDelete ? ' · Swipe ← to delete' : ''}{ev.helper ? ' · Tap for driver actions' : ''}
                      </Text>
                    )}
                  </View>
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
          onDelete={() => { notifyDeleteIfAssigned(editEv); deleteEvent(editEv.id); setEditEv(null); }}
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
  headerBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  headerBtnOutline: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },

  aiBannerCard: { borderRadius: 24, padding: 14, borderWidth: 1, borderColor: '#6D28D940' },
  aiIconBox:    { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(139,92,246,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  activePill:   { backgroundColor: 'rgba(16,185,129,0.3)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(52,211,153,0.4)' },
  aiScanBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  aiPanel:      { borderRadius: 24, borderWidth: 1, padding: 14, marginBottom: 4 },
  conflictCard: { borderRadius: 18, borderWidth: 1, borderColor: '#F59E0B40', padding: 10 },
  allClearBox:  { borderRadius: 14, borderWidth: 1, borderColor: '#10B98160', padding: 10 },
  allClearText: { fontSize: TYPO.label, fontWeight: '700', color: '#059669', textAlign: 'center' },
  swapBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  swapBtnText:  { fontSize: TYPO.label, fontWeight: '900', color: '#0F172A' },
  swapApplied:  { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  swapAppliedText: { fontSize: TYPO.label, fontWeight: '900', color: '#fff' },

  pill:         { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 22, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  pillText:     { fontSize: TYPO.caption, fontWeight: '700' },

  timeLabel:    { position: 'absolute', left: -30, top: 14, alignItems: 'flex-end', width: 26 },
  timelineDot:  { position: 'absolute', left: -6, top: 18, width: 12, height: 12, borderRadius: 6, borderWidth: 3 },

  evCard:       { borderRadius: 24, borderWidth: 1, padding: 14, gap: 8 },
  catBadge:     { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  catText:      { fontSize: TYPO.micro, fontWeight: '900', letterSpacing: 0.5 },

  assignRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8, flexWrap: 'wrap' },
  assignChip:   { borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },

  approvalRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8 },
  approveBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#059669', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },

  driverSection:{ borderTopWidth: 1, paddingTop: 8, gap: 6 },
  statusBadge:  { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:   { fontSize: TYPO.label, fontWeight: '800' },
  rejectedBox:  { borderRadius: 14, borderWidth: 1, padding: 10 },
  reassignBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BRAND.amber, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-end' as any },

  notesText:    { fontSize: 11, fontWeight: '600', fontStyle: 'italic', borderRadius: 12, borderWidth: 1, padding: 8, lineHeight: 16 },

  emptyBox:     { borderRadius: 24, borderWidth: 1, padding: 48, alignItems: 'center', marginHorizontal: 14 },
});
