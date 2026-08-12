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
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, FamilyEvent, EventType } from '@/store/eventStore';
import AppHeader from '@/components/AppHeader';
import { BRAND } from '@/components/FamilyCubeLogo';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function timeParts(t?: string) {
  if (!t) return { time: '--', ampm: '' };
  const [h, m] = t.split(':').map(Number);
  return { time: `${h % 12 || 12}:${String(m).padStart(2,'0')}`, ampm: h >= 12 ? 'PM' : 'AM' };
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
    const pending    = events.filter(e => e.driverStatus === 'pending');
    const rejected   = events.filter(e => e.driverStatus === 'rejected');

    const conflicts: AiConflict[] = [];

    if (conflicted.length > 0) {
      conflicted.forEach(ev => {
        conflicts.push({
          description: `"${ev.title}" at ${ev.time} overlaps with another commitment — driver gap detected`,
          eventsInvolved: [ev.title, 'Parent schedule'],
          suggestedFix: 'Swap driver to available adult family member',
          recommendedDriverSwap: 'Grandma Mary',
        });
      });
    }

    if (rejected.length > 0) {
      rejected.forEach(ev => {
        conflicts.push({
          description: `"${ev.title}" driver declined — no confirmed driver assigned`,
          eventsInvolved: [ev.title],
          suggestedFix: `Reassign driver to available parent or grandparent`,
          recommendedDriverSwap: 'Priya (Mom)',
        });
      });
    }

    if (pending.length > 0) {
      conflicts.push({
        description: `${pending.length} ride request(s) still awaiting driver confirmation`,
        eventsInvolved: pending.map(e => e.title),
        suggestedFix: 'Follow up with pending drivers or reassign',
      });
    }

    res({
      summary: conflicts.length === 0
        ? 'All events are covered with confirmed drivers. No time overlaps detected. Family logistics look smooth for the selected period!'
        : `Detected ${conflicts.length} logistics issue(s): ${conflicted.length} time conflict(s), ${rejected.length} declined driver(s), ${pending.length} pending confirmation(s). Immediate attention recommended.`,
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

// ─── Day Strip ────────────────────────────────────────────────────────────────
function DayStrip({ selected, events, colors, isDark, onSelect }: {
  selected: string; events: FamilyEvent[]; colors: any; isDark: boolean;
  onSelect: (d: string) => void;
}) {
  const today = toDateStr(new Date());
  const days  = get15Days(selected);

  return (
    <View style={[ds.wrap, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingVertical: 10 }}>
        {days.map(d => {
          const date    = parseDate(d);
          const dayEvs  = events.filter(e => e.date === d);
          const isSel   = d === selected;
          const isToday = d === today;
          const hasMed  = dayEvs.some(e => e.category === 'Medical');
          const hasWork = dayEvs.some(e => e.category === 'Work');
          const hasSpo  = dayEvs.some(e => e.category === 'Sports');
          const hasSch  = dayEvs.some(e => e.category === 'School' || e.category === 'Study');
          const hasOth  = dayEvs.length > 0 && !hasMed && !hasWork && !hasSpo && !hasSch;

          return (
            <TouchableOpacity key={d} onPress={() => onSelect(d)}
              style={[ds.cell, {
                backgroundColor: isSel ? BRAND.purple : isDark ? colors.surface : '#F5F4FA',
                borderColor: isSel ? BRAND.purple : isDark ? colors.border : 'rgba(146,97,199,0.12)',
                borderWidth: isSel ? 2 : 1.5,
              }]}>
              <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5,
                color: isSel ? '#fff' : isToday ? BRAND.purple : colors.textTertiary }}>
                {DAY_SHORT[(date.getDay() + 6) % 7]}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '900',
                color: isSel ? '#fff' : isToday ? BRAND.purple : colors.textPrimary }}>
                {date.getDate()}
              </Text>
              {/* Category fill bars */}
              <View style={{ gap: 2, width: '100%', paddingHorizontal: 6, minHeight: 22 }}>
                {hasMed  && <View style={[ds.bar, { backgroundColor: isSel ? 'rgba(255,255,255,0.8)' : '#EF4444' }]} />}
                {hasWork && <View style={[ds.bar, { backgroundColor: isSel ? 'rgba(255,255,255,0.7)' : '#A855F7' }]} />}
                {hasSpo  && <View style={[ds.bar, { backgroundColor: isSel ? 'rgba(255,255,255,0.7)' : '#F59E0B' }]} />}
                {hasSch  && <View style={[ds.bar, { backgroundColor: isSel ? 'rgba(255,255,255,0.7)' : '#3B82F6' }]} />}
                {hasOth  && <View style={[ds.bar, { backgroundColor: isSel ? 'rgba(255,255,255,0.6)' : '#10B981' }]} />}
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
  cell: { width: 52, borderRadius: 18, paddingVertical: 10, alignItems: 'center', gap: 2 },
  dot:  { width: 5, height: 5, borderRadius: 3 },
  bar:  { height: 4, borderRadius: 3, width: '100%' },
});

// ─── Pending Driver Flow sub-component ───────────────────────────────────────
function PendingDriverFlow({ ev, activeMemberName, isParent, isSenior, colors, isDark, onAccept, onDecline, onWithdraw, onReassign }: {
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

  const isRequestor = activeMemberName === ev.driverRequestedBy || activeMemberName === ev.taskOwner;
  const isAssignedDriver = ev.driver && (
    ev.driver.includes(activeMemberName) || activeMemberName.includes(ev.driver.split(' ')[0])
  );

  return (
    <View style={[pf.box, { backgroundColor: isDark ? '#1C1700' : '#FFFBEB', borderColor: '#F59E0B60' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: '#D97706' }}>
          Awaiting confirmation from {ev.driver}
        </Text>
        <Text style={{ fontSize: 9, color: '#D97706', opacity: 0.7 }}>
          Owner: {ev.taskOwner ?? ev.driverRequestedBy ?? 'Parent'}
        </Text>
      </View>

      {showDecInput ? (
        <View style={[pf.decBox, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderColor: '#FCA5A5' }]}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF4444', marginBottom: 6 }}>Select or type decline reason:</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {RIDE_DECLINE_PRESETS.map(p => (
              <TouchableOpacity key={p}
                style={[pf.presetChip, { backgroundColor: decReason === p ? '#EF4444' : isDark ? '#1E293B' : '#fff', borderColor: decReason === p ? '#EF4444' : '#FCA5A5' }]}
                onPress={() => setDecReason(p)}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: decReason === p ? '#fff' : '#EF4444' }}>{p}</Text>
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
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[pf.btn, { flex: 2, backgroundColor: decReason ? '#EF4444' : colors.border }]}
              onPress={() => decReason && onDecline(decReason)} disabled={!decReason}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>Confirm Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View>
          <TextInput
            style={[pf.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#fff' }]}
            placeholder="Add note for driver (optional, max 150 chars)..."
            placeholderTextColor={colors.textTertiary}
            value={note} onChangeText={t => setNote(t.slice(0, 150))}
            maxLength={150}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }}>
            {/* Accept — shown to assigned driver (any role) */}
            {(isAssignedDriver || isParent || isSenior) && (
              <TouchableOpacity style={[pf.btn, { flex: 2, backgroundColor: '#059669' }]}
                onPress={() => onAccept(note)}>
                <I.Check c="#fff" size={13} />
                <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>Accept Ride</Text>
              </TouchableOpacity>
            )}
            {/* Decline — assigned driver or parent/senior */}
            {(isAssignedDriver || isParent || isSenior) && (
              <TouchableOpacity style={[pf.btn, { backgroundColor: isDark ? '#450A0A' : '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }]}
                onPress={() => setShowDecInput(true)}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>Decline</Text>
              </TouchableOpacity>
            )}
            {/* Reassign — parent only */}
            {isParent && (
              <TouchableOpacity style={[pf.btn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                onPress={onReassign}>
                <I.Arrows c={colors.textSecondary} size={12} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>Reassign</Text>
              </TouchableOpacity>
            )}
            {/* Withdraw — only the requestor */}
            {isRequestor && (
              <TouchableOpacity style={[pf.btn, { paddingHorizontal: 8 }]} onPress={onWithdraw}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#EF4444' }}>🗑️ Withdraw</Text>
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

// ─── Reassign Driver Modal ─────────────────────────────────────────────────────
function ReassignModal({ visible, ev, members, onAssign, onClose, colors, isDark }: {
  visible: boolean; ev: FamilyEvent | null;
  members: any[]; onAssign: (name: string) => void;
  onClose: () => void; colors: any; isDark: boolean;
}) {
  const adults = members.filter(m => m.role === 'parent' || m.role === 'senior');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={rm.backdrop}>
        <View style={[rm.sheet, { backgroundColor: colors.card }]}>
          <View style={[rm.handle, { backgroundColor: colors.border }]} />
          <Text style={[rm.title, { color: colors.textPrimary }]}>Reassign Driver</Text>
          {ev && <Text style={[rm.sub, { color: colors.textSecondary }]} numberOfLines={1}>"{ev.title}"</Text>}
          <Text style={[rm.label, { color: colors.textSecondary }]}>Select available adult:</Text>
          {adults.map(m => (
            <TouchableOpacity key={m.id} style={[rm.option, { backgroundColor: isDark ? colors.surface : '#F8FAFC', borderColor: colors.border }]}
              onPress={() => onAssign(m.name)}>
              <Text style={{ fontSize: 13 }}>{m.emoji ?? '👤'}</Text>
              <Text style={[rm.optionText, { color: colors.textPrimary }]}>{m.name}</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginLeft: 'auto' as any }}>
                {m.role === 'senior' ? '👵 Senior' : '👨‍👩 Parent'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[rm.cancel, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onClose}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
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
  label:      { fontSize: 11, fontWeight: '700', marginBottom: 8 },
  option:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8 },
  optionText: { fontSize: 13, fontWeight: '700' },
  cancel:     { borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', marginTop: 4 },
});

// ─── Add Event Modal ──────────────────────────────────────────────────────────
const EVENT_TYPES: EventType[] = ['event', 'reminder', 'appointment', 'birthday'];
const EVENT_TYPE_LABEL: Record<EventType, string> = {
  event: '🎉 Event', reminder: '🔔 Reminder', appointment: '📋 Appointment', birthday: '🎂 Birthday',
};
const EVENT_CATS = ['Event', 'Medical', 'Work', 'Sports', 'School', 'Study'];

function AddEventModal({ visible, selectedDate, colors, isDark, onClose, onSave }: {
  visible: boolean; selectedDate: string;
  colors: any; isDark: boolean; onClose: () => void; onSave: (d: any) => void;
}) {
  const [title,    setTitle]    = useState('');
  const [time,     setTime]     = useState('');
  const [date,     setDate]     = useState(selectedDate);
  const [type,     setType]     = useState<EventType>('event');
  const [category, setCategory] = useState('Event');
  const [location, setLocation] = useState('');
  const [driver,   setDriver]   = useState('');
  const [saving,   setSaving]   = useState(false);

  React.useEffect(() => { if (visible) setDate(selectedDate); }, [visible, selectedDate]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 500));
    onSave({
      title: title.trim(), date, time: time || undefined, type, category,
      location: location || undefined, driver: driver || undefined,
      driverStatus: driver ? 'pending' : undefined,
      approvalPending: false, conflict: false,
    });
    setSaving(false);
    onClose();
    setTitle(''); setTime(''); setLocation(''); setDriver('');
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
                <Text style={[ae.label, { color: colors.textSecondary }]}>TIME (HH:MM)</Text>
                <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD', marginBottom: 0 }]}
                  placeholder="15:30" placeholderTextColor={colors.textTertiary} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
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
                      <Text style={{ fontSize: 11, fontWeight: '700', color: category === c ? cs.text : colors.textTertiary }}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={[ae.label, { color: colors.textSecondary }]}>LOCATION (optional)</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
              placeholder="e.g. Riverside Park" placeholderTextColor={colors.textTertiary} value={location} onChangeText={setLocation} />

            <Text style={[ae.label, { color: colors.textSecondary }]}>DRIVER / TUTOR (optional)</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
              placeholder="e.g. Priya (Mom)" placeholderTextColor={colors.textTertiary} value={driver} onChangeText={setDriver} />

            <TouchableOpacity style={[ae.submitBtn, { backgroundColor: title.trim() ? BRAND.purple : colors.border, opacity: saving ? 0.7 : 1 }]}
              onPress={submit} disabled={saving || !title.trim()}>
              {saving ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>Add to Family Schedule</Text>}
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
  label:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6, marginTop: 8 },
  input:     { borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, marginBottom: 10 },
  catChip:   { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6 },
  submitBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8, flexDirection: 'row', justifyContent: 'center', gap: 8 },
});

// ─── Ask Help / Ride Modal (kid) ──────────────────────────────────────────────
function AskHelpModal({ visible, selectedDate, activeMemberId, colors, isDark, onClose, onSave }: {
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
      type: 'event' as EventType, category: 'School',
      memberId: activeMemberId, approvalPending: true, conflict: false,
      driverRequestedBy: 'Kid',
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
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 14 }}>
              Tell a parent what you need — they'll get a notification to approve and assign a driver.
            </Text>

            <Text style={[ae.label, { color: colors.textSecondary }]}>WHAT DO YOU NEED? *</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: what.trim() ? colors.border : '#F59E0B80', backgroundColor: isDark ? colors.surface : '#FFFBEB' }]}
              placeholder="e.g. Ride to soccer practice" placeholderTextColor={colors.textTertiary} value={what} onChangeText={setWhat} />

            <Text style={[ae.label, { color: colors.textSecondary }]}>TIME (HH:MM)</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
              placeholder="15:30" placeholderTextColor={colors.textTertiary} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />

            <Text style={[ae.label, { color: colors.textSecondary }]}>LOCATION (optional)</Text>
            <TextInput style={[ae.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: isDark ? colors.surface : '#F9F8FD' }]}
              placeholder="e.g. Riverside Park" placeholderTextColor={colors.textTertiary} value={location} onChangeText={setLocation} />

            <TouchableOpacity style={[ae.submitBtn, { backgroundColor: what.trim() ? BRAND.amber : colors.border, opacity: saving ? 0.7 : 1 }]}
              onPress={submit} disabled={saving || !what.trim()}>
              {saving ? <ActivityIndicator color="#0F172A" size="small" />
                : <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '900' }}>Send Request to Parent</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const { events, addEvent, updateEvent } = useEventStore();

  const activeMember = members.find(m => m.id === activeMemberId)
    ?? members.find(m => m.role === 'parent') ?? members[0];
  const isParent         = activeMember?.role === 'parent';
  const isSenior         = activeMember?.role === 'senior';
  const isKid            = activeMember?.role === 'kid';
  const isParentOrSenior = isParent || isSenior;
  const activeMemberName = activeMember?.name ?? '';

  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [filterMember, setFilterMember] = useState<string | null>(null);
  const [showAdd,       setShowAdd]       = useState(false);
  const [showAskHelp,   setShowAskHelp]   = useState(false);
  const [showReassign,  setShowReassign]  = useState(false);
  const [reassignEv,    setReassignEv]    = useState<FamilyEvent | null>(null);
  const [showRange,     setShowRange]     = useState(false);
  const weekBounds = useMemo(() => currentWeekBounds(), []);
  const [rangeStart,    setRangeStart]    = useState(weekBounds.start);
  const [rangeEnd,      setRangeEnd]      = useState(weekBounds.end);

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
    const targetEv = events.find(e => e.conflict || e.driverStatus === 'rejected') ?? events[0];
    if (targetEv) {
      updateEvent(targetEv.id, { driver: conflict.recommendedDriverSwap, driverStatus: 'pending', conflict: false });
    }
    setAppliedSwaps(p => ({ ...p, [`swap_${idx}`]: true }));
  };

  const handleAcceptRide = (evId: string, note: string) => {
    updateEvent(evId, { driverStatus: 'confirmed', notes: note || undefined });
  };

  const handleDeclineRide = (evId: string, reason: string) => {
    updateEvent(evId, { driverStatus: 'rejected', declineReason: reason, declinedBy: activeMemberName });
  };

  const handleWithdrawRide = (evId: string) => {
    updateEvent(evId, { approvalPending: false, driver: undefined, driverStatus: undefined });
  };

  const handleReassignDriver = (name: string) => {
    if (reassignEv) {
      updateEvent(reassignEv.id, { driver: name, driverStatus: 'pending' });
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

  const selectedDateLabel = parseDate(selectedDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

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

      {/* ── Title row ── */}
      <View style={[sc.titleRow, { backgroundColor: isDark ? colors.card : '#fff', borderBottomColor: colors.border }]}>
        <View>
          <Text style={[sc.title, { color: isDark ? colors.textPrimary : '#1E2D6B' }]}>
            {isKid ? 'My Schedule' : 'Family Schedule'}
          </Text>
          {(rangeStart || rangeEnd) ? (
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
              onPress={() => { setRangeStart(''); setRangeEnd(''); }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: BRAND.purple }}>
                📅 {rangeStart || '…'} → {rangeEnd || '…'}
              </Text>
              <View style={{ backgroundColor: '#EDE9FE', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: BRAND.purple }}>✕ clear</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.purple, marginTop: 1 }}>{selectedDateLabel}</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isKid ? (
            <TouchableOpacity style={[sc.headerBtn, { backgroundColor: BRAND.amber }]} onPress={() => setShowAskHelp(true)}>
              <I.HelpCircle c="#0F172A" size={14} />
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#0F172A' }}>+ Ask Help / Ride</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={[sc.headerBtnOutline, { borderColor: rangeStart || rangeEnd ? BRAND.purple : colors.border, backgroundColor: rangeStart || rangeEnd ? '#EDE9FE' : isDark ? colors.surface : '#F5F4FA' }]}
                onPress={() => setShowRange(true)}>
                <I.Calendar c={BRAND.purple} size={14} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.purple }}>
                  {rangeStart || rangeEnd ? `${rangeStart || '…'}→${rangeEnd || '…'}` : 'Range'}
                </Text>
              </TouchableOpacity>
              {isParent && (
                <TouchableOpacity style={[sc.headerBtn, { backgroundColor: BRAND.purple }]} onPress={() => setShowAdd(true)}>
                  <I.Plus c="#fff" size={14} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Event</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>

      {/* ── AI Conflict Banner (parent only) — matches gemini-code dark card style ── */}
      {isParent && (
        <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: isDark ? colors.card : '#fff', borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={[sc.aiBannerCard]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <I.Bot c="#C4B5FD" size={16} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#DDD6FE' }}>AI Conflict & Driver Logistics Agent</Text>
            </View>
            <TouchableOpacity style={[sc.aiScanBtn]} onPress={runAiScan}>
              <I.AlertTriangle c="#FCD34D" size={11} />
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>Run AI Conflict Scan</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── AI Results Panel (outside scroll, fixed below banner) ── */}
      {showAiPanel && (
        <View style={[sc.aiPanel, { backgroundColor: '#0F172A', borderColor: '#6D28D940', marginHorizontal: 12, marginTop: 10 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <I.Bot c="#C4B5FD" size={15} />
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#C4B5FD' }}>AI Conflict & Driver Swap Recommendations</Text>
            </View>
            <TouchableOpacity onPress={() => setShowAiPanel(false)}>
              <Text style={{ fontSize: 10, color: '#A78BFA' }}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          {isAnalyzing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }}>
              <ActivityIndicator color="#A78BFA" size="small" />
              <Text style={{ fontSize: 11, color: '#A78BFA', fontWeight: '700' }}>
                Scanning for time overlaps, missing drivers, and travel conflicts...
              </Text>
            </View>
          ) : aiResult ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, color: '#CBD5E1', lineHeight: 16 }}>{aiResult.summary}</Text>
              {aiResult.conflictsFound ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <I.Shield c="#FCD34D" size={13} />
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#FCD34D' }}>
                      {aiResult.conflicts.length} Logistics Conflict(s) Detected:
                    </Text>
                  </View>
                  {aiResult.conflicts.map((c, idx) => (
                    <View key={idx} style={[sc.conflictCard]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#FDE68A', marginBottom: 3 }}>{c.description}</Text>
                      <Text style={{ fontSize: 10, color: '#F59E0B80' }}>Affected: {c.eventsInvolved.join(' & ')}</Text>
                      {c.suggestedFix && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                          <Text style={{ fontSize: 10, color: '#6EE7B7', fontWeight: '700', flex: 1 }}>
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
                <View style={[sc.allClearBox]}>
                  <Text style={sc.allClearText}>✅ No schedule conflicts! All drivers and events smoothly covered.</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      )}

      {/* ── Main Scroll (member filter + day strip + timeline all inside) ── */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}
        stickyHeaderIndices={[0]}>

        {/* Sticky: Member filter */}
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
        <DayStrip selected={selectedDate} events={events} colors={colors} isDark={isDark} onSelect={setSelectedDate} />

        {/* ── Timeline ── */}
        <View style={{ paddingTop: 16 }}>
        {dayEvents.length === 0 ? (
          <View style={[sc.emptyBox, { backgroundColor: cardBg, borderColor: cardBord }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>📅</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B', marginBottom: 4 }}>
              No events scheduled
            </Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center' }}>
              {isKid ? 'Tap "+ Ask Help / Ride" above to request parent assistance.'
                     : 'Tap "+ Event" to add one for the family.'}
            </Text>
          </View>
        ) : (
          <View style={{ paddingLeft: 36, paddingRight: 14, gap: 16 }}>
            {dayEvents.map((ev, i) => {
              const { time, ampm } = timeParts(ev.time);
              const cs     = catStyle(ev.category, isDark);
              const isConf = ev.conflict;
              const assignee = members.find(m => m.id === ev.memberId);
              const memberLabel = assignee ? assignee.name.split(' ')[0] : 'Family';

              // RBAC checks
              const canApproveRequest = isParent && ev.approvalPending;
              const hasPendingDriver  = ev.driver && ev.driverStatus === 'pending';
              const hasRejectedDriver = ev.driver && ev.driverStatus === 'rejected';

              return (
                <View key={ev.id} style={{ position: 'relative' }}>
                  {/* Time label */}
                  <View style={sc.timeLabel}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: BRAND.purple, lineHeight: 15 }}>{time}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textTertiary }}>{ampm}</Text>
                  </View>

                  {/* Timeline dot */}
                  <View style={[sc.timelineDot, {
                    backgroundColor: isConf ? '#F59E0B' : cs.dot,
                    borderColor: isDark ? colors.background : '#F5F4FA',
                  }]} />

                  {/* Event Card */}
                  <View style={[sc.evCard, { borderColor: isConf ? '#F59E0B60' : cardBord,
                    backgroundColor: isConf ? (isDark ? '#1C1700' : '#FFFBEB') : cardBg }]}>

                    {/* Header row */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <View style={[sc.catBadge, { backgroundColor: cs.badge, borderColor: cs.dot + '60' }]}>
                        <Text style={[sc.catText, { color: cs.text }]}>{(ev.category ?? ev.type).toUpperCase()}</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>
                        {time} {ampm}
                      </Text>
                    </View>

                    {/* Conflict flag */}
                    {isConf && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <I.AlertTriangle c="#F59E0B" size={12} />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#F59E0B' }}>Scheduling Conflict Detected</Text>
                      </View>
                    )}

                    {/* Title */}
                    <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B', marginBottom: 5 }}>
                      {ev.title}
                    </Text>

                    {/* For + location row */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        For: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{memberLabel}</Text>
                      </Text>
                      {ev.location && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <I.MapPin c={colors.textTertiary} size={11} />
                          <Text style={{ fontSize: 10, color: colors.textTertiary }}>{ev.location}</Text>
                        </View>
                      )}
                    </View>

                    {/* Parent: Assign member to event */}
                    {isParent && (
                      <View style={[sc.assignRow, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary }}>Assign to:</Text>
                        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
                          {members.filter(m => m.role === 'kid').map(k => (
                            <TouchableOpacity key={k.id}
                              style={[sc.assignChip, { backgroundColor: ev.memberId === k.id ? BRAND.purple : isDark ? '#1E293B' : '#F1F5F9', borderColor: ev.memberId === k.id ? BRAND.purple : isDark ? '#334155' : '#E2E8F0' }]}
                              onPress={() => updateEvent(ev.id, { memberId: k.id })}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: ev.memberId === k.id ? '#fff' : colors.textSecondary }}>
                                {k.emoji ?? ''} {k.name.split(' ')[0]}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Kid approval pending — parent sees approve button */}
                    {canApproveRequest && (
                      <View style={[sc.approvalRow, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <I.AlertTriangle c="#F59E0B" size={12} />
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#F59E0B' }}>Kid Request Pending</Text>
                        </View>
                        <TouchableOpacity style={[sc.approveBtn]}
                          onPress={() => updateEvent(ev.id, { approvalPending: false, driverStatus: 'pending' })}>
                          <I.Check c="#fff" size={13} />
                          <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>Approve & Claim</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Kid: sees their own pending request */}
                    {isKid && ev.approvalPending && (
                      <View style={[sc.approvalRow, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9', justifyContent: 'flex-start', gap: 6 }]}>
                        <I.AlertTriangle c="#F59E0B" size={12} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#F59E0B' }}>Awaiting parent approval…</Text>
                      </View>
                    )}

                    {/* Driver section */}
                    {ev.driver && !ev.approvalPending && (
                      <View style={[sc.driverSection, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <I.Car c={colors.textTertiary} size={13} />
                            <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                              Driver: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.driver}</Text>
                            </Text>
                          </View>
                          {/* Status badges */}
                          {ev.driverStatus === 'confirmed' && (
                            <View style={[sc.statusBadge, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderColor: '#6EE7B7' }]}>
                              <Text style={[sc.statusText, { color: '#10B981' }]}>✓ Confirmed</Text>
                            </View>
                          )}
                          {ev.driverStatus === 'pending' && (
                            <View style={[sc.statusBadge, { backgroundColor: isDark ? '#1C1700' : '#FEF3C7', borderColor: '#FCD34D' }]}>
                              <Text style={[sc.statusText, { color: '#D97706' }]}>⏳ Pending</Text>
                            </View>
                          )}
                          {ev.driverStatus === 'rejected' && (
                            <View style={[sc.statusBadge, { backgroundColor: isDark ? '#450A0A' : '#FEE2E2', borderColor: '#FCA5A5' }]}>
                              <Text style={[sc.statusText, { color: '#EF4444' }]}>❌ Declined</Text>
                            </View>
                          )}
                        </View>

                        {/* Pending driver flow */}
                        {hasPendingDriver && (
                          <PendingDriverFlow
                            ev={ev}
                            activeMemberName={activeMemberName}
                            isParent={isParent}
                            isSenior={isSenior}
                            colors={colors}
                            isDark={isDark}
                            onAccept={note => handleAcceptRide(ev.id, note)}
                            onDecline={reason => handleDeclineRide(ev.id, reason)}
                            onWithdraw={() => handleWithdrawRide(ev.id)}
                            onReassign={() => openReassign(ev)}
                          />
                        )}

                        {/* Rejected driver info */}
                        {hasRejectedDriver && (
                          <View style={[sc.rejectedBox, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2', borderColor: '#FCA5A5' }]}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444', marginBottom: 4 }}>
                              ❌ Declined by {ev.declinedBy ?? ev.driver}:
                            </Text>
                            <Text style={{ fontSize: 11, color: '#EF4444', fontStyle: 'italic' }}>
                              "{ev.declineReason ?? 'No reason provided'}"
                            </Text>
                            {isParentOrSenior && (
                              <TouchableOpacity style={[sc.reassignBtn, { marginTop: 8 }]} onPress={() => openReassign(ev)}>
                                <I.Arrows c="#0F172A" size={12} />
                                <Text style={{ fontSize: 11, fontWeight: '900', color: '#0F172A' }}>Reassign Driver Now</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}

                        {/* Conflict + confirmed: parent can still swap */}
                        {isConf && isParent && ev.driverStatus !== 'pending' && (
                          <TouchableOpacity style={[sc.reassignBtn, { marginTop: 8 }]} onPress={() => openReassign(ev)}>
                            <I.Arrows c="#0F172A" size={12} />
                            <Text style={{ fontSize: 11, fontWeight: '900', color: '#0F172A' }}>Assign New Driver / Swap</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* Notes */}
                    {ev.notes && (
                      <Text style={[sc.notesText, { backgroundColor: isDark ? '#1E1B4B' : '#F0F0FE', color: isDark ? '#C4B5FD' : '#4338CA', borderColor: isDark ? '#4338CA50' : '#C7D2FE' }]}>
                        📝 "{ev.notes}"
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        </View>{/* end timeline View */}
      </ScrollView>

      {/* Modals */}
      {isParent && (
        <AddEventModal visible={showAdd} selectedDate={selectedDate} colors={colors} isDark={isDark}
          onClose={() => setShowAdd(false)}
          onSave={d => { addEvent(d); setShowAdd(false); }}
        />
      )}
      {isKid && (
        <AskHelpModal visible={showAskHelp} selectedDate={selectedDate} activeMemberId={activeMember?.id ?? ''}
          colors={colors} isDark={isDark}
          onClose={() => setShowAskHelp(false)}
          onSave={d => { addEvent(d); setShowAskHelp(false); }}
        />
      )}
      <ReassignModal visible={showReassign} ev={reassignEv} members={members}
        onAssign={handleReassignDriver} onClose={() => { setShowReassign(false); setReassignEv(null); }}
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
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 14 }}>
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
                    <Text style={{ fontSize: 12, fontWeight: '700', color: rangeStart === p.start && rangeEnd === p.end ? '#fff' : colors.textSecondary }}>{p.label}</Text>
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
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>Clear Filter</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ae.submitBtn, { flex: 2, backgroundColor: BRAND.purple }]}
                  onPress={() => setShowRange(false)}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>Apply Range</Text>
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
  title:        { fontSize: 20, fontWeight: '900' },
  headerBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  headerBtnOutline: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },

  aiBannerCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0F172A', borderRadius: 18, borderWidth: 1, borderColor: '#6D28D950', paddingHorizontal: 14, paddingVertical: 12 },
  aiScanBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: BRAND.purple },
  aiPanel:      { borderRadius: 24, borderWidth: 1, padding: 14, marginBottom: 4 },
  conflictCard: { borderRadius: 18, borderWidth: 1, borderColor: '#F59E0B40', backgroundColor: '#1C1000', padding: 10 },
  allClearBox:  { borderRadius: 14, borderWidth: 1, borderColor: '#10B98160', backgroundColor: '#064E3B40', padding: 10 },
  allClearText: { fontSize: 11, fontWeight: '700', color: '#10B981', textAlign: 'center' },
  swapBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  swapBtnText:  { fontSize: 10, fontWeight: '900', color: '#0F172A' },
  swapApplied:  { backgroundColor: '#059669', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  swapAppliedText: { fontSize: 10, fontWeight: '900', color: '#fff' },

  pill:         { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 22, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  pillText:     { fontSize: 12, fontWeight: '700' },

  timeLabel:    { position: 'absolute', left: -30, top: 14, alignItems: 'flex-end', width: 26 },
  timelineDot:  { position: 'absolute', left: -6, top: 18, width: 12, height: 12, borderRadius: 6, borderWidth: 3 },

  evCard:       { borderRadius: 24, borderWidth: 1, padding: 14, gap: 8 },
  catBadge:     { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  catText:      { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

  assignRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8, flexWrap: 'wrap' },
  assignChip:   { borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },

  approvalRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8 },
  approveBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#059669', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },

  driverSection:{ borderTopWidth: 1, paddingTop: 8, gap: 6 },
  statusBadge:  { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:   { fontSize: 10, fontWeight: '800' },
  rejectedBox:  { borderRadius: 14, borderWidth: 1, padding: 10 },
  reassignBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BRAND.amber, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-end' as any },

  notesText:    { fontSize: 11, fontWeight: '600', fontStyle: 'italic', borderRadius: 12, borderWidth: 1, padding: 8, lineHeight: 16 },

  emptyBox:     { borderRadius: 24, borderWidth: 1, padding: 48, alignItems: 'center', marginHorizontal: 14 },
});
