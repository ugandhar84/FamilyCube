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
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType } from '@/store/eventStore';
import AppHeader from '@/components/AppHeader';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';
import { fmtDate, fmtDateShort, fmtTimeParts } from '@/lib/dates';
import { AddEventModal as EventFormAdd, EditEventModal } from './EventFormModal';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
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
  Event:    { dot: '#10B981', badge: '#D1FAE5', text: '#059669' },
  default:  { dot: '#10B981', badge: '#D1FAE5', text: '#059669' },
};
function catStyle(category?: string, isDark = false) {
  const c = CAT_COLOR[category ?? 'default'] ?? CAT_COLOR.default;
  if (isDark) return { dot: c.dot, badge: c.dot + '25', text: c.dot };
  return c;
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

// ─── Decline presets ──────────────────────────────────────────────────────────
const RIDE_DECLINE_PRESETS = [
  'Schedule conflict',
  'Work meeting I can\'t move',
  'Vehicle unavailable',
  'Kid playing with the system',
];

// Category → dot color map (used only in strip — no full event objects needed)
const CAT_DOT: Record<string, string> = {
  Medical:  '#EF4444',
  Work:     '#A855F7',
  Sports:   '#F59E0B',
  Study:    '#3B82F6',
  Ride:     '#10B981',
  Event:    '#10B981',
  Birthday: '#F59E0B',
};

// ─── Day Strip ────────────────────────────────────────────────────────────────
// Uses lightweight stripMap (date→category[]) — no full event objects.
function DayStrip({ selected, stripMap, colors, isDark, onSelect }: {
  selected: string; stripMap: Record<string, string[]>; colors: any; isDark: boolean;
  onSelect: (d: string) => void;
}) {
  const todayStr = toDateStr(new Date());
  const days     = get15Days(selected);

  return (
    <View style={[ds.wrap, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 5, paddingVertical: 8 }}>
        {days.map(d => {
          const date    = parseDate(d);
          const cats    = stripMap[d] ?? [];
          const isSel   = d === selected;
          const isToday = d === todayStr;

          // Up to 3 distinct dot colors from the strip map
          const dotColors = cats
            .map(c => CAT_DOT[c] ?? '#10B981')
            .filter((c, i, a) => a.indexOf(c) === i)
            .slice(0, 3);

          return (
            <TouchableOpacity key={d} onPress={() => onSelect(d)}
              style={[ds.cell, {
                backgroundColor: isSel ? BRAND.purple : isDark ? '#1E293B' : '#FFFFFF',
                borderColor: isSel ? BRAND.purple : isToday ? BRAND.purple + '80' : (isDark ? '#334155' : '#E2E8F0'),
                borderWidth: 1,
                shadowColor: '#000',
                shadowOpacity: isSel ? 0.18 : isDark ? 0 : 0.04,
                shadowRadius: isSel ? 6 : 2,
                shadowOffset: { width: 0, height: 2 },
                elevation: isSel ? 3 : 1,
              }]}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4,
                color: isSel ? 'rgba(255,255,255,0.8)' : isToday ? BRAND.purple : colors.textTertiary }}>
                {DAY_SHORT[(date.getDay() + 6) % 7]}
              </Text>
              <Text style={{ fontSize: 17, fontWeight: '900', lineHeight: 22,
                color: isSel ? '#fff' : isToday ? BRAND.purple : colors.textPrimary }}>
                {date.getDate()}
              </Text>
              <View style={{ flexDirection: 'row', gap: 3, minHeight: 7, alignItems: 'center' }}>
                {dotColors.map((col, i) => (
                  <View key={i} style={[ds.dot, { backgroundColor: isSel ? 'rgba(255,255,255,0.85)' : col }]} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
const ds = StyleSheet.create({
  wrap: { borderBottomWidth: 1 },
  cell: { width: 44, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 2, alignItems: 'center', gap: 1 },
  dot:  { width: 5, height: 5, borderRadius: 3 },
});

// ─── Pending Helper Flow sub-component ───────────────────────────────────────
function PendingHelperFlow({ ev, activeMemberName, isParent, isSenior, colors, isDark, onAccept, onDecline, onWithdraw, onReassign }: {
  ev: FamilyEvent; activeMemberName: string;
  isParent: boolean; isSenior: boolean;
  colors: any; isDark: boolean;
  onAccept: (note: string) => void;
  onDecline: (reason: string) => void;
  onWithdraw: () => void;
  onReassign: () => void;
}) {
  const [note,         setNote]         = useState('');
  const [showDecInput, setShowDecInput] = useState(false);
  const [decReason,    setDecReason]    = useState('');

  const isRequestor   = activeMemberName === ev.helperRequestedBy;
  const isNamedHelper = ev.helper && (
    ev.helper.includes(activeMemberName) || activeMemberName.includes(ev.helper.split(' ')[0])
  );

  return (
    <View style={[pf.box, { backgroundColor: isDark ? '#1C1700' : '#FFFBEB', borderColor: '#F59E0B60' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#D97706' }}>
          Awaiting confirmation from {ev.helper}
        </Text>
        <Text style={{ fontSize: TYPO.micro, color: '#D97706', opacity: 0.7 }}>
          Requested by: {ev.helperRequestedBy ?? 'Parent'}
        </Text>
      </View>

      {showDecInput ? (
        <View style={[pf.decBox, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderColor: '#FCA5A5' }]}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444', marginBottom: 6 }}>Select or type decline reason:</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {RIDE_DECLINE_PRESETS.map(p => (
              <TouchableOpacity key={p}
                style={[pf.presetChip, { backgroundColor: decReason === p ? '#EF4444' : isDark ? '#1E293B' : '#fff', borderColor: decReason === p ? '#EF4444' : '#FCA5A5' }]}
                onPress={() => setDecReason(p)}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: decReason === p ? '#fff' : '#EF4444' }}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[pf.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Reason (max 150 chars)..."
            placeholderTextColor={colors.textTertiary}
            value={decReason} onChangeText={t => setDecReason(t.slice(0, 150))}
            maxLength={150}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity style={[pf.btn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setShowDecInput(false)}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[pf.btn, { flex: 2, backgroundColor: decReason ? '#EF4444' : colors.border }]}
              onPress={() => decReason && onDecline(decReason)} disabled={!decReason}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Confirm Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View>
          <TextInput
            style={[pf.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#fff' }]}
            placeholder="Add a note (optional, max 150 chars)..."
            placeholderTextColor={colors.textTertiary}
            value={note} onChangeText={t => setNote(t.slice(0, 150))}
            maxLength={150}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }}>
            {(isNamedHelper || isParent || isSenior) && (
              <TouchableOpacity style={[pf.btn, { flex: 2, backgroundColor: '#059669' }]}
                onPress={() => onAccept(note)}>
                <I.Check c="#fff" size={13} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Accept</Text>
              </TouchableOpacity>
            )}
            {(isNamedHelper || isParent || isSenior) && (
              <TouchableOpacity style={[pf.btn, { backgroundColor: isDark ? '#450A0A' : '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }]}
                onPress={() => setShowDecInput(true)}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>Decline</Text>
              </TouchableOpacity>
            )}
            {isParent && (
              <TouchableOpacity style={[pf.btn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                onPress={onReassign}>
                <I.Arrows c={colors.textSecondary} size={12} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Find Another</Text>
              </TouchableOpacity>
            )}
            {isRequestor && (
              <TouchableOpacity style={[pf.btn, { paddingHorizontal: 8 }]} onPress={onWithdraw}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444' }}>🗑️ Withdraw</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
const pf = StyleSheet.create({
  box:       { borderRadius: 16, borderWidth: 1, padding: 10, marginTop: 8 },
  decBox:    { borderRadius: 14, borderWidth: 1, padding: 10 },
  presetChip:{ borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  input:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 11, marginBottom: 4 },
  btn:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
});

// ─── Find Helper Modal ────────────────────────────────────────────────────────
function FindHelperModal({ visible, ev, members, onAssign, onClose, colors, isDark }: {
  visible: boolean; ev: FamilyEvent | null;
  members: any[]; onAssign: (name: string) => void;
  onClose: () => void; colors: any; isDark: boolean;
}) {
  const adults = members.filter(m => m.role === 'parent' || m.role === 'senior');
  const helperLabel = ev?.category === 'Medical' ? '🏥 Accompanied by'
    : ev?.category === 'Study'   ? '📚 Tutored by'
    : ev?.category === 'Sports'  ? '🚗 Drop-off by'
    : '🚗 Driven by';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={rm.backdrop}>
        <View style={[rm.sheet, { backgroundColor: colors.card }]}>
          <View style={[rm.handle, { backgroundColor: colors.border }]} />
          <Text style={[rm.title, { color: colors.textPrimary }]}>{helperLabel}</Text>
          {ev && <Text style={[rm.sub, { color: colors.textSecondary }]} numberOfLines={1}>"{ev.title}"</Text>}
          <Text style={[rm.label, { color: colors.textSecondary }]}>Pick an available adult:</Text>
          {adults.map(m => (
            <TouchableOpacity key={m.id} style={[rm.option, { backgroundColor: isDark ? colors.surface : '#F8FAFC', borderColor: colors.border }]}
              onPress={() => onAssign(m.name)}>
              <Text style={{ fontSize: 13 }}>{m.emoji ?? '👤'}</Text>
              <Text style={[rm.optionText, { color: colors.textPrimary }]}>{m.name}</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginLeft: 'auto' as any }}>
                {m.role === 'senior' ? '👵 Senior' : '👨‍👩 Parent'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[rm.cancel, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onClose}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const rm = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:      { fontSize: 16, fontWeight: '900', marginBottom: 2 },
  sub:        { fontSize: 11, marginBottom: 14 },
  label:      { fontSize: TYPO.label, fontWeight: '700', marginBottom: 8 },
  option:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8 },
  optionText: { fontSize: TYPO.caption, fontWeight: '700' },
  cancel:     { borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', marginTop: 4 },
});

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
function SwipeableEventCard({ children, onDelete, onLongPress, canDelete }: {
  children: React.ReactNode; onDelete: () => void; onLongPress: () => void; canDelete: boolean;
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
            onPress={open ? close : undefined}
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
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const {
    events, dayLoading, hasMore,
    stripMap,
    addEvent, updateEvent, deleteEvent,
    selectDate: storeSelectDate, loadMoreDay, loadStrip,
  } = useEventStore();

  const activeMember = members.find(m => m.id === activeMemberId)
    ?? members.find(m => m.role === 'parent') ?? members[0];
  const isParent         = activeMember?.role === 'parent';
  const isSenior         = activeMember?.role === 'senior';
  const isKid            = activeMember?.role === 'kid';
  const isParentOrSenior = isParent || isSenior;
  const activeMemberName = activeMember?.name ?? '';

  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));

  // On mount: load today's events + strip for visible 15-day window
  React.useEffect(() => {
    storeSelectDate(selectedDate);
    const days = get15Days(selectedDate);
    loadStrip(days);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [filterMember, setFilterMember] = useState<string | null>(null);
  const [showAdd,       setShowAdd]       = useState(false);
  const [showAskHelp,   setShowAskHelp]   = useState(false);
  const [showReassign,  setShowReassign]  = useState(false);
  const [reassignEv,    setReassignEv]    = useState<FamilyEvent | null>(null);
  const [editEv,        setEditEv]        = useState<FamilyEvent | null>(null);

  const calScrollRef = useRef<ScrollView>(null);
  const prevCalMemberRef = useRef(activeMemberId);
  React.useEffect(() => {
    if (prevCalMemberRef.current === activeMemberId) return;
    prevCalMemberRef.current = activeMemberId;
    setFilterMember(null);
    setShowAdd(false);
    setShowAskHelp(false);
    setShowReassign(false);
    setReassignEv(null);
    setEditEv(null);
    setShowAiPanel(false);
    setIsAnalyzing(false);
    calScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeMemberId]);
  const [showRange,     setShowRange]     = useState(false);
  const weekBounds = useMemo(() => currentWeekBounds(), []);
  const [compact,       setCompact]       = useState(false);
  const [rangeStart,    setRangeStart]    = useState('');  // no default filter
  const [rangeEnd,      setRangeEnd]      = useState('');

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
    const result = await simulateConflictDetection(events);
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

  const handleAccept = (evId: string, note: string) => {
    updateEvent(evId, { helperStatus: 'confirmed', notes: note || undefined });
  };

  const handleDecline = (evId: string, reason: string) => {
    updateEvent(evId, { helperStatus: 'rejected', declineReason: reason, declinedBy: activeMemberName });
  };

  const handleWithdraw = (evId: string) => {
    updateEvent(evId, { approvalPending: false, helper: undefined, helperStatus: undefined });
  };

  const handleFindHelper = (name: string) => {
    if (reassignEv) {
      updateEvent(reassignEv.id, { helper: name, helperStatus: 'pending' });
    }
    setShowReassign(false);
    setReassignEv(null);
  };

  const openReassign = (ev: FamilyEvent) => {
    setReassignEv(ev);
    setShowReassign(true);
  };

  const isInRange = (date: string) => {
    if (!rangeStart && !rangeEnd) return true;
    if (rangeStart && !rangeEnd) return date >= rangeStart;
    if (!rangeStart && rangeEnd) return date <= rangeEnd;
    return date >= rangeStart && date <= rangeEnd;
  };

  // Filtered events for selected day (also respects range filter)
  const dayEvents = useMemo(() => {
    return events
      .filter(e => e.date === selectedDate &&
        (!filterMember || e.memberId === filterMember || !e.memberId) &&
        isInRange(e.date))
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  }, [events, selectedDate, filterMember, rangeStart, rangeEnd]);

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

      {/* ── Main Scroll: title + AI + member filter + timeline ── */}
      <ScrollView ref={calScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}
        stickyHeaderIndices={[1]}>

        {/* [0] Scrollable: Title row + AI banner + AI panel */}
        <View>
          <View style={[sc.titleRow, { backgroundColor: 'transparent', borderBottomColor: 'transparent' }]}>
            <View>
              <Text style={[sc.title, { color: isDark ? colors.textPrimary : '#1E2D6B' }]}>
                {isKid ? 'My Schedule' : 'Family Schedule'}
              </Text>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple, marginTop: 1 }}>
                {rangeStart || rangeEnd ? `${rangeStart || '…'} → ${rangeEnd || '…'}` : selectedDateLabel}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {isKid ? (
                <TouchableOpacity style={[sc.headerBtn, { backgroundColor: BRAND.amber }]} onPress={() => setShowAskHelp(true)}>
                  <I.HelpCircle c="#0F172A" size={14} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#0F172A' }}>+ Ask Help</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {rangeStart || rangeEnd ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0,
                      backgroundColor: BRAND.purple + '18', borderRadius: 14, borderWidth: 1.5, borderColor: BRAND.purple + '55', overflow: 'hidden' }}>
                      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6 }}
                        onPress={() => setShowRange(true)}>
                        <I.Calendar c={BRAND.purple} size={12} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.purple }}>
                          {rangeStart || '…'} → {rangeEnd || '…'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 6,
                        borderLeftWidth: 1, borderLeftColor: BRAND.purple + '40' }}
                        onPress={() => { setRangeStart(''); setRangeEnd(''); }}>
                        <I.X c={BRAND.purple} size={12} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={[sc.headerBtnOutline, { borderColor: colors.border }]}
                      onPress={() => setShowRange(true)}>
                      <I.Calendar c={BRAND.purple} size={14} />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>Range</Text>
                    </TouchableOpacity>
                  )}
                  {/* Compact toggle */}
                  <TouchableOpacity
                    onPress={() => setCompact(v => !v)}
                    style={[sc.headerBtnOutline, { borderColor: compact ? BRAND.purple : colors.border, backgroundColor: compact ? BRAND.purple + '15' : 'transparent' }]}>
                    <I.List c={compact ? BRAND.purple : colors.textTertiary} size={14} />
                  </TouchableOpacity>
                  {isParentOrSenior && (
                    <TouchableOpacity style={[sc.headerBtn, { backgroundColor: BRAND.purple }]} onPress={() => setShowAdd(true)}>
                      <I.Plus c="#fff" size={14} />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Event</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>

          {/* AI Conflict Banner (parent only) */}
          {isParent && (
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
              <View style={{
                borderRadius: 20, padding: 12,
                backgroundColor: isDark ? '#0D1B2A' : '#0F2027',
                borderWidth: 1, borderColor: isDark ? '#1E3A4A' : '#1A3346',
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <View style={{ width: 32, height: 32, borderRadius: 10,
                  backgroundColor: 'rgba(20,184,166,0.25)', borderWidth: 1, borderColor: 'rgba(20,184,166,0.4)',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <I.Bot c="#5EEAD4" size={16} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>CubeAI Schedule Agent</Text>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' }} />
                  </View>
                  <Text style={{ fontSize: TYPO.micro, color: '#94A3B8', marginTop: 1 }}>
                    Conflict detection &amp; swap suggestions active
                  </Text>
                </View>
                <TouchableOpacity style={{
                  backgroundColor: 'rgba(20,184,166,0.2)', borderWidth: 1, borderColor: 'rgba(20,184,166,0.35)',
                  borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7,
                  flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  onPress={runAiScan}>
                  {isAnalyzing
                    ? <ActivityIndicator size={11} color="#5EEAD4" />
                    : <I.AlertTriangle c="#5EEAD4" size={11} />}
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#5EEAD4' }}>Scan</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* AI Results Panel */}
          {showAiPanel && (
            <View style={[sc.aiPanel, {
              backgroundColor: isDark ? '#1E1B4B' : '#F5F0FF',
              borderColor: isDark ? '#6D28D940' : 'rgba(146,97,199,0.25)',
              marginHorizontal: 12, marginTop: 10,
            }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <I.Bot c={isDark ? '#C4B5FD' : BRAND.purple} size={15} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: isDark ? '#C4B5FD' : BRAND.purple }}>CubeAI Schedule Conflict & Helper Recommendations</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowAiPanel(false)}
                  hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? 'rgba(167,139,250,0.15)' : 'rgba(146,97,199,0.1)' }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: isDark ? '#A78BFA' : BRAND.purple }}>✕ Close</Text>
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

        {/* [1] Sticky: Member filter */}
        <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 10 }}>
            <TouchableOpacity
              style={[sc.pill, !filterMember ? { backgroundColor: BRAND.purple, borderColor: BRAND.purple } : { backgroundColor: isDark ? colors.surface : '#F5F4FA', borderColor: isDark ? colors.border : 'rgba(146,97,199,0.2)' }]}
              onPress={() => setFilterMember(null)}>
              <Text style={[sc.pillText, { color: !filterMember ? '#fff' : colors.textSecondary }]}>All Members</Text>
            </TouchableOpacity>
            {members.map(m => (
              <TouchableOpacity key={m.id}
                style={[sc.pill, filterMember === m.id ? { backgroundColor: BRAND.purple, borderColor: BRAND.purple } : { backgroundColor: isDark ? colors.surface : '#F5F4FA', borderColor: isDark ? colors.border : 'rgba(146,97,199,0.2)' }]}
                onPress={() => setFilterMember(filterMember === m.id ? null : m.id)}>
                <Text style={{ fontSize: 13 }}>{m.emoji ?? '👤'}</Text>
                <Text style={[sc.pillText, { color: filterMember === m.id ? '#fff' : colors.textSecondary }]}>{m.name.split(' ')[0]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Day strip (scrolls with content) */}
        <DayStrip
          selected={selectedDate}
          stripMap={stripMap}
          colors={colors}
          isDark={isDark}
          onSelect={(d) => {
            setSelectedDate(d);
            storeSelectDate(d);
            // Expand strip window if user scrolls near the edge
            const days = get15Days(d);
            loadStrip(days);
          }}
        />

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
                     : 'Tap "+ Event" to add one for the family.'}
            </Text>
          </View>
        ) : (
          compact ? (
            /* Compact list — no spine, just dot + pill rows */
            <View style={{ paddingHorizontal: 14, gap: 8, paddingBottom: 8 }}>
            {dayEvents.map((ev, i) => {
              const { time, ampm } = fmtTimeParts(ev.time);
              const cs = catStyle(ev.category, isDark);
              const isConf = ev.conflict;
              const assignee = members.find(m => m.id === ev.memberId);
              return (
                <TouchableOpacity key={ev.id} onPress={() => setCompact(false)} onLongPress={() => setEditEv(ev)}
                  activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: isConf ? '#F59E0B' : cs.dot,
                    borderWidth: 3, borderColor: isDark ? colors.background : '#F0EEFF',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff', lineHeight: 12 }}>{time}</Text>
                    <Text style={{ fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.8)', lineHeight: 10 }}>{ampm}</Text>
                  </View>
                  <View style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center',
                    backgroundColor: cardBg, borderRadius: 14,
                    borderWidth: 1, borderColor: isConf ? '#F59E0B60' : cardBord,
                    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
                  }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isConf ? '#F59E0B' : cs.dot, flexShrink: 0 }} />
                    <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }} numberOfLines={1}>{ev.title}</Text>
                    {ev.location ? <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>📍 {ev.location}</Text> : null}
                    {assignee && <Text style={{ fontSize: 13 }}>{assignee.emoji ?? '👤'}</Text>}
                    {ev.helperStatus === 'confirmed' && <View style={{ backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#10B981' }}>✓</Text></View>}
                    {ev.helperStatus === 'pending'   && <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#D97706' }}>⏳</Text></View>}
                    {ev.helperStatus === 'rejected'  && <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#EF4444' }}>✕</Text></View>}
                    {isConf && <I.AlertTriangle c="#F59E0B" size={12} />}
                  </View>
                </TouchableOpacity>
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

              // RBAC checks
              const canApproveRequest = isParent && ev.approvalPending;
              const hasPendingHelper  = ev.helper && ev.helperStatus === 'pending';
              const hasRejectedHelper = ev.helper && ev.helperStatus === 'rejected';

              // Which members to show in the picker depends on category
              const pickerMembers = (cat === 'Work')
                ? members.filter(m => m.role === 'parent' || m.role === 'senior')
                : members.filter(m => m.role === 'kid');

              // Swipe-delete eligibility: future event + parent (any) or kid own pending
              const isPast     = ev.date < toDateStr(new Date());
              const canDelete  = !isPast && (isParent || (isKid && !!ev.approvalPending && ev.memberId === activeMemberId));

              const handleEvDelete = () => Alert.alert(
                ev.approvalPending ? 'Withdraw Request' : 'Remove Event',
                `${ev.approvalPending ? 'Withdraw' : 'Remove'} "${ev.title}"?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: ev.approvalPending ? 'Withdraw' : 'Delete', style: 'destructive', onPress: () => deleteEvent(ev.id) },
                ]
              );

              return (
                <View key={ev.id} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
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
                  >
                  <View style={[sc.evCard, { flex: 1, borderColor: isConf ? '#F59E0B60' : cardBord,
                    backgroundColor: isConf ? (isDark ? '#1C1700' : '#FFFBEB') : cardBg,
                    overflow: 'hidden' }]}>

                    {/* Header: category badge — time lives in the dot now */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <View style={[sc.catBadge, { backgroundColor: cs.badge, borderColor: cs.dot + '60' }]}>
                        <Text style={[sc.catText, { color: cs.text }]}>{cat.toUpperCase()}</Text>
                      </View>
                    </View>

                    {isConf && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <I.AlertTriangle c="#F59E0B" size={12} />
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#F59E0B' }}>Scheduling Conflict Detected</Text>
                      </View>
                    )}

                    {/* Title */}
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B', marginBottom: 5 }}>
                      {ev.title}
                    </Text>

                    {/* Context-aware "For / Patient / Player" — chips when assignee missing, text when set */}
                    {forLabel && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        {assignee ? (
                          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
                            {forLabel}:{' '}
                            <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
                              {assignee.name.split(' ')[0]}
                            </Text>
                          </Text>
                        ) : isParent && pickerMembers.length > 0 ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>{forLabel}:</Text>
                            {pickerMembers.map(k => (
                              <TouchableOpacity key={k.id}
                                style={[sc.assignChip, { backgroundColor: ev.memberId === k.id ? BRAND.purple : isDark ? '#1E293B' : '#F1F5F9', borderColor: ev.memberId === k.id ? BRAND.purple : isDark ? '#334155' : '#E2E8F0' }]}
                                onPress={() => updateEvent(ev.id, { memberId: k.id })}>
                                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: ev.memberId === k.id ? '#fff' : colors.textSecondary }}>
                                  {k.emoji ?? ''} {k.name.split(' ')[0]}
                                </Text>
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
                            <I.MapPin c={colors.textTertiary} size={11} />
                            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }} numberOfLines={1}>{ev.location}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Category-specific extra fields */}
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
                          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                            📍 From: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.pickupLocation}</Text>
                          </Text>
                        )}
                        {ev.dropLocation && (
                          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                            → To: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.dropLocation}</Text>
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Kid approval pending */}
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

                    {isKid && ev.approvalPending && (
                      <View style={[sc.approvalRow, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9', justifyContent: 'flex-start', gap: 6 }]}>
                        <I.AlertTriangle c="#F59E0B" size={12} />
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#F59E0B' }}>Awaiting parent approval…</Text>
                      </View>
                    )}

                    {/* Helper section */}
                    {ev.helper && !ev.approvalPending && (
                      <View style={[sc.driverSection, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                        {/* Inset driver row — mockup inner-box pattern */}
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                          borderRadius: 14, borderWidth: 1,
                          borderColor: isDark ? '#1E293B' : '#E2E8F0',
                          paddingHorizontal: 12, paddingVertical: 8,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <I.Car c={colors.textSecondary} size={13} />
                            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
                              {helperLabel.replace(/^[^\s]+\s/, '')}{' '}
                              <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.helper}</Text>
                            </Text>
                          </View>
                          {ev.helperStatus === 'confirmed' && (
                            <View style={{ backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#6EE7B7' }}>
                              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#10B981' }}>Confirmed ✓</Text>
                            </View>
                          )}
                          {ev.helperStatus === 'pending' && (
                            <View style={{ backgroundColor: isDark ? '#1C1700' : '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FCD34D' }}>
                              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#D97706' }}>⏳ Pending</Text>
                            </View>
                          )}
                          {ev.helperStatus === 'rejected' && isParent && (
                            <TouchableOpacity onPress={() => openReassign(ev)}
                              style={{ backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#fff' }}>Swap Driver</Text>
                            </TouchableOpacity>
                          )}
                          {ev.helperStatus === 'rejected' && !isParent && (
                            <View style={{ backgroundColor: isDark ? '#450A0A' : '#FEE2E2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FCA5A5' }}>
                              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#EF4444' }}>Declined ✕</Text>
                            </View>
                          )}
                        </View>

                        {hasPendingHelper && (
                          <PendingHelperFlow
                            ev={ev}
                            activeMemberName={activeMemberName}
                            isParent={isParent}
                            isSenior={isSenior}
                            colors={colors}
                            isDark={isDark}
                            onAccept={note => handleAccept(ev.id, note)}
                            onDecline={reason => handleDecline(ev.id, reason)}
                            onWithdraw={() => handleWithdraw(ev.id)}
                            onReassign={() => openReassign(ev)}
                          />
                        )}

                        {hasRejectedHelper && (
                          <View style={[sc.rejectedBox, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderColor: '#FCA5A5' }]}>
                            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#EF4444', marginBottom: 4 }}>
                              ❌ Declined by {ev.declinedBy ?? ev.helper}:
                            </Text>
                            <Text style={{ fontSize: TYPO.label, color: '#EF4444', fontStyle: 'italic' }}>
                              "{ev.declineReason ?? 'No reason provided'}"
                            </Text>
                            {isParentOrSenior && (
                              <TouchableOpacity style={[sc.reassignBtn, { marginTop: 8 }]} onPress={() => openReassign(ev)}>
                                <I.Arrows c="#0F172A" size={12} />
                                <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#0F172A' }}>Find Someone Else</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}

                        {isConf && isParent && ev.helperStatus !== 'pending' && !['Study', 'Work'].includes(ev.category ?? '') && (
                          <TouchableOpacity style={[sc.reassignBtn, { marginTop: 8 }]} onPress={() => openReassign(ev)}>
                            <I.Arrows c="#0F172A" size={12} />
                            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#0F172A' }}>Reassign / Swap</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {ev.notes && (
                      <Text style={[sc.notesText, { backgroundColor: isDark ? '#1E1B4B' : '#F0F0FE', color: isDark ? '#C4B5FD' : '#4338CA', borderColor: isDark ? '#4338CA50' : '#C7D2FE' }]}>
                        📝 "{ev.notes}"
                      </Text>
                    )}

                    {/* Long-press hint (only on non-past events) */}
                    {!isPast && (
                      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 4, textAlign: 'right', opacity: 0.6 }}>
                        Hold to edit{canDelete ? ' · Swipe ← to delete' : ''}
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
      </ScrollView>

      {/* Modals */}
      {/* Full event form — parent/senior create; kid requests Ride/Study */}
      <EventFormAdd
        visible={showAdd || showAskHelp}
        activeMemberId={activeMember?.id ?? ''}
        onClose={() => { setShowAdd(false); setShowAskHelp(false); }}
      />

      {/* Edit event — long-press on any card opens this */}
      {editEv && (
        <EditEventModal
          event={editEv}
          activeMemberId={activeMember?.id ?? ''}
          onClose={() => setEditEv(null)}
          onDelete={() => { deleteEvent(editEv.id); setEditEv(null); }}
        />
      )}

      <FindHelperModal visible={showReassign} ev={reassignEv} members={members}
        onAssign={handleFindHelper} onClose={() => { setShowReassign(false); setReassignEv(null); }}
        colors={colors} isDark={isDark}
      />

      {/* Date Range Picker Modal */}
      <Modal visible={showRange} transparent animationType="slide" onRequestClose={() => setShowRange(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowRange(false)} />
            <View style={[ae.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[ae.handle, { backgroundColor: colors.border }]} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Text style={[ae.title, { color: colors.textPrimary }]}>📅 Filter Date Range</Text>
                <TouchableOpacity onPress={() => setShowRange(false)}><I.X c={colors.textSecondary} /></TouchableOpacity>
              </View>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginBottom: 14 }}>
                Filter events in the timeline between two dates. Leave blank to show all.
              </Text>

              {/* Quick presets */}
              <Text style={[ae.label, { color: colors.textSecondary }]}>QUICK SELECT</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'This week', ...currentWeekBounds() },
                  { label: 'Today', start: toDateStr(new Date()), end: toDateStr(new Date()) },
                  { label: 'Next 7 days', start: toDateStr(new Date()), end: (() => { const d=new Date(); d.setDate(d.getDate()+6); return toDateStr(d); })() },
                  { label: 'This month', start: (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; })(), end: (() => { const d=new Date(new Date().getFullYear(), new Date().getMonth()+1, 0); return toDateStr(d); })() },
                ].map(p => (
                  <TouchableOpacity key={p.label}
                    style={[ae.catChip, { backgroundColor: rangeStart === p.start && rangeEnd === p.end ? BRAND.purple : isDark ? colors.surface : '#F5F4FA', borderColor: rangeStart === p.start && rangeEnd === p.end ? BRAND.purple : isDark ? colors.border : '#E2E8F0' }]}
                    onPress={() => { setRangeStart(p.start); setRangeEnd(p.end); }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: rangeStart === p.start && rangeEnd === p.end ? '#fff' : colors.textSecondary }}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[ae.label, { color: colors.textSecondary }]}>FROM (YYYY-MM-DD)</Text>
                  <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
                    placeholder={toDateStr(new Date())} placeholderTextColor={colors.textTertiary}
                    value={rangeStart} onChangeText={setRangeStart} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ae.label, { color: colors.textSecondary }]}>TO (YYYY-MM-DD)</Text>
                  <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
                    placeholder={toDateStr(new Date())} placeholderTextColor={colors.textTertiary}
                    value={rangeEnd} onChangeText={setRangeEnd} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[ae.submitBtn, { flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => { setRangeStart(''); setRangeEnd(''); setShowRange(false); }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Clear Filter</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ae.submitBtn, { flex: 2, backgroundColor: BRAND.purple }]}
                  onPress={() => setShowRange(false)}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>Apply Range</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
