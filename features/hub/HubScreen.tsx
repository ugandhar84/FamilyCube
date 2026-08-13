/**
 * HubScreen — Family OS command centre.
 *
 * RBAC:
 *   parent  — full authority: approve quests/rides, create events/quests, en-route, wallet audit
 *   kid     — request-only: ask ride/tutor, see own events/quests/wallet, cheer siblings
 *   senior  — caregiver: claim/decline rides, send GP tips, read-only family timeline
 *
 * Card-in-card layout (gemini-code pattern):
 *   SectionCard    — outer rounded card with a section header row (always open)
 *   CollapsibleCard — individual item card inside a section (tap header to expand/collapse)
 *   SubCard        — non-collapsible simple inner row/block
 *
 * Parent order: Quick Actions → Conflict Alerts → Family Help Q → En Route → Today's Schedule
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  RefreshControl, Alert, Dimensions, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Sparkles, PlusCircle, Calendar, ShoppingCart, Navigation,
  ChevronDown, ChevronUp, ChevronRight, X, Pencil,
  MessageSquare, Car, BookOpen, ThumbsUp,
  AlertTriangle, HelpCircle, Clock, Zap,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useQuestStore } from '@/store/questStore';
import { useEventStore, FamilyEvent } from '@/store/eventStore';
import { useRewardStore } from '@/store/rewardStore';
import { useGroceryStore } from '@/store/groceryStore';
import { TYPO } from '@/constants/theme';
import type { FamilyMember } from '@/store/familyStore';
import PinEntryModal from '@/components/PinEntryModal';
import AppHeader from '@/components/AppHeader';
import FamilyAvatar from '@/components/FamilyAvatar';
import HelpQueueSection from '@/components/HelpQueueSection';
import HelpRequestModal from '@/components/HelpRequestModal';
import FlyerScannerModal from '@/components/FlyerScannerModal';
import { BRAND } from '@/components/FamilyCubeLogo';

const { width: W } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtClock() {
  const now = new Date();
  const h = now.getHours();
  return `${h % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtTime(t?: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtHumanDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function hoursUntilEvent(dateStr: string, timeStr?: string): number {
  if (!timeStr) return 999;
  // Parse date components manually to avoid UTC-shift bug ("YYYY-MM-DD" → UTC midnight)
  const [year, month, day] = dateStr.split('-').map(Number);
  const [h, m] = timeStr.split(':').map(Number);
  const ev = new Date(year, month - 1, day, h, m, 0, 0); // local time
  return (ev.getTime() - Date.now()) / 3600000;
}

const CAT_COLOR: Record<string, string> = {
  Medical: '#EF4444', Work: BRAND.purple, Sports: '#10B981',
  School: BRAND.amber, Study: '#3B82F6', Event: BRAND.teal,
};
function catColor(cat?: string) { return cat ? (CAT_COLOR[cat] ?? BRAND.teal) : BRAND.teal; }

// ─── Shared components ────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return <Text style={[sc.sectionLabel, { color: colors.textTertiary }]}>{label}</Text>;
}

/**
 * SectionCard — outer rounded container card (always open, NOT collapsible).
 * Shows a header row: icon + title + optional badge + optional "See All →" link.
 * Children go into the padded body below the header.
 */
function SectionCard({
  icon, title, subtitle, badge, badgeColor, seeAll, seeAllLabel, actionBtn, children, colors, isDark,
}: {
  icon: string; title: string; subtitle?: string; badge?: number; badgeColor?: string;
  seeAll?: () => void; seeAllLabel?: string;
  actionBtn?: { label: string; onPress: () => void; color?: string };
  children: React.ReactNode; colors: any; isDark: boolean;
}) {
  return (
    <View style={{
      borderRadius: 24, borderWidth: 1, borderColor: colors.border,
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Section header row — always visible */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
            {title}
          </Text>
          {subtitle && (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>
              {subtitle}
            </Text>
          )}
        </View>
        {badge !== undefined && badge > 0 && (
          <View style={{
            backgroundColor: badgeColor ?? BRAND.purple, borderRadius: 10,
            paddingHorizontal: 8, paddingVertical: 2, minWidth: 22, alignItems: 'center',
          }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff' }}>{badge}</Text>
          </View>
        )}
        {actionBtn && (
          <Pressable onPress={actionBtn.onPress}
            style={{ backgroundColor: actionBtn.color ?? BRAND.purple, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>{actionBtn.label}</Text>
          </Pressable>
        )}
        {seeAll && (
          <Pressable onPress={seeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>
              {seeAllLabel ?? 'See All →'}
            </Text>
          </Pressable>
        )}
      </View>
      {/* Body */}
      <View style={{ padding: 10, gap: 8 }}>
        {children}
      </View>
    </View>
  );
}

/**
/**
 * AlertBanner — red/amber fire-strip at the very top of the Hub for conflicts
 * and declined helpers. High-visibility, can't be missed.
 */
function AlertBanner({ conflictEvents, rejectedEvents, members, colors, isDark, updateEvent }: {
  conflictEvents: FamilyEvent[]; rejectedEvents: FamilyEvent[];
  members: FamilyMember[]; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, gap: 8 }}>
      {/* Declined driver cards — only when event is within 4 hours */}
      {rejectedEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) < 4).map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        const isOpen = openId === ev.id;
        return (
          <View key={ev.id} style={{
            backgroundColor: isDark ? '#2d0a0a' : '#FEF2F2',
            borderRadius: 16, borderWidth: 1.5, borderColor: '#EF444450',
            overflow: 'hidden',
          }}>
            {/* Urgent strip */}
            <View style={{ backgroundColor: '#EF4444', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ fontSize: 15 }}>🚨</Text>
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                Driver Declined — {ev.title}
              </Text>
              <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>{fmtTime(ev.time)}</Text>
            </View>
            <View style={{ padding: 14, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                  <Text style={{ fontWeight: '700', color: '#EF4444' }}>{ev.helper}</Text> declined
                  {ev.declineReason ? `: "${ev.declineReason}"` : ''}
                </Text>
              </View>
              {kid && ev.location && (
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>📍 {ev.location} · For {kid.name.split(' ')[0]}</Text>
              )}
              <Pressable onPress={() => setOpenId(isOpen ? null : ev.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF444415', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#EF444430' }}>
                {isOpen ? <ChevronUp size={14} color="#EF4444" /> : <ChevronRight size={14} color="#EF4444" />}
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>
                  {isOpen ? 'Cancel' : 'Reassign Driver Now'}
                </Text>
              </Pressable>
              {isOpen && (
                <InlineReassignPanel ev={ev} members={members} colors={colors} isDark={isDark}
                  onDone={(name, note) => {
                    updateEvent(ev.id, { helper: name, helperStatus: 'pending', notes: note || undefined });
                    setOpenId(null);
                  }} />
              )}
            </View>
          </View>
        );
      })}

      {/* Scheduling conflict cards */}
      {conflictEvents.map(ev => (
        <View key={ev.id} style={{
          backgroundColor: isDark ? '#1c1400' : '#FFFBEB',
          borderRadius: 16, borderWidth: 1.5, borderColor: BRAND.amber + '60',
          overflow: 'hidden',
        }}>
          <View style={{ backgroundColor: BRAND.amber, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ fontSize: 15 }}>⚡</Text>
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
              Schedule Conflict — {ev.title}
            </Text>
            <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.9)', fontWeight: '700' }}>{fmtTime(ev.time)}</Text>
          </View>
          <View style={{ padding: 14, gap: 8 }}>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
              This event overlaps with another commitment. Review in Schedule to resolve.
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/calendar')}
              style={{ backgroundColor: BRAND.amber, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} color="#fff" />
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Open Schedule →</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * InlineReassignPanel — member picker that opens inside the Hub alert card.
 * No navigation needed — pick a new driver, add a note, confirm.
 */
function InlineReassignPanel({ ev, members, colors, isDark, onDone }: {
  ev: FamilyEvent; members: FamilyMember[]; colors: any; isDark: boolean;
  onDone: (driverName: string, note: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [note,   setNote]   = useState('');
  const adults = members.filter(m => m.role !== 'kid');

  const statusIcon = (m: FamilyMember) => {
    if (ev.helper === m.name) {
      if (ev.helperStatus === 'rejected')  return { icon: '✕', color: '#EF4444', label: 'Declined' };
      if (ev.helperStatus === 'pending')   return { icon: '⏳', color: BRAND.amber, label: 'Awaiting' };
      if (ev.helperStatus === 'confirmed') return { icon: '✓', color: '#10B981',  label: 'Confirmed' };
    }
    return { icon: '○', color: colors.textTertiary, label: 'Available' };
  };

  return (
    <View style={{ gap: 10, marginTop: 4 }}>
      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Pick a helper
      </Text>
      {adults.map(m => {
        const st  = statusIcon(m);
        const sel = picked === m.name;
        return (
          <Pressable key={m.id} onPress={() => setPicked(m.name)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12,
              borderWidth: 1.5, borderColor: sel ? BRAND.teal : colors.border,
              backgroundColor: sel ? BRAND.teal + '18' : (isDark ? colors.card : '#F8FAFC') }}>
            <FamilyAvatar name={m.name} emoji={m.emoji} size={34} ringColor={sel ? BRAND.teal : colors.border} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? BRAND.teal : colors.textPrimary }}>{m.name}</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, textTransform: 'capitalize' }}>{m.role}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: st.color + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, color: st.color, fontWeight: '800' }}>{st.icon} {st.label}</Text>
            </View>
          </Pressable>
        );
      })}
      {picked && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: isDark ? colors.card : '#F1F5F9',
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border }}>
            <Pencil size={13} color={colors.textTertiary} />
            <TextInput value={note} onChangeText={setNote} placeholder="Add a note (optional)…"
              placeholderTextColor={colors.placeholder}
              style={{ flex: 1, fontSize: TYPO.label, color: colors.textPrimary }} maxLength={100} />
          </View>
          <Pressable onPress={() => onDone(picked, note)}
            style={{ backgroundColor: BRAND.teal, borderRadius: 12, paddingVertical: 11, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>✓ Assign {picked} — Awaiting Response</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/**
 * CollapsibleCard — individual item card inside a SectionCard.
 * Header row is always visible; tap it to expand/collapse the body.
 */
function CollapsibleCard({
  summary, accent, colors, isDark, defaultExpanded = false, children,
}: {
  summary: React.ReactNode; accent?: string; colors: any; isDark: boolean;
  defaultExpanded?: boolean; children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const bg = accent
    ? isDark ? accent + '18' : accent + '10'
    : isDark ? colors.surface : '#F8FAFC';
  const border = accent ? accent + '40' : colors.border;

  return (
    <View style={{ borderRadius: 16, borderWidth: 1, backgroundColor: bg, borderColor: border, overflow: 'hidden' }}>
      <Pressable
        onPress={() => children && setExpanded(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
        <View style={{ flex: 1 }}>{summary}</View>
        {children && (expanded
          ? <ChevronUp size={14} color={accent ?? colors.textTertiary} />
          : <ChevronDown size={14} color={accent ?? colors.textTertiary} />
        )}
      </Pressable>
      {expanded && children && (
        <View style={{ padding: 12, paddingTop: 0, gap: 8 }}>
          {children}
        </View>
      )}
    </View>
  );
}

/**
 * SubCard — simple non-collapsible inner block.
 */
function SubCard({ children, accent, colors, isDark, style }: {
  children: React.ReactNode; accent?: string; colors: any; isDark: boolean; style?: any;
}) {
  return (
    <View style={[{
      borderRadius: 16, borderWidth: 1, padding: 12,
      backgroundColor: accent ? (isDark ? accent + '18' : accent + '10') : (isDark ? colors.surface : '#F8FAFC'),
      borderColor: accent ? accent + '40' : colors.border,
    }, style]}>
      {children}
    </View>
  );
}

function UrgencyBadge({ hours, hasIssue }: { hours: number; hasIssue: boolean }) {
  if (!hasIssue) return null;
  if (hours > 24) return (
    <View style={{ backgroundColor: '#6B728020', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: '#6B7280' }}>Sort later</Text>
    </View>
  );
  if (hours >= 4) return (
    <View style={{ backgroundColor: BRAND.amber + '25', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.amber }}>⚠ Today</Text>
    </View>
  );
  if (hours >= 0) return (
    <View style={{ backgroundColor: '#EF444425', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#EF4444' }}>🔴 Now</Text>
    </View>
  );
  return null;
}

/**
 * TimelineCard — a single event row in the hero timeline.
 * Shows urgency badge, kid avatar, Fix → / Remind inline actions.
 */
function TimelineCard({ ev, members, allNames, colors, isDark, updateEvent }: {
  ev: FamilyEvent; members: FamilyMember[]; allNames: string[];
  colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
}) {
  const [fixOpen, setFixOpen] = useState(false);
  const kid = members.find(m => m.id === ev.memberId);
  const hours = hoursUntilEvent(ev.date, ev.time);
  const isPast = hours < 0;

  const hasHelper = !!ev.helper;
  const hasLocation = !!ev.location;
  const helperMissing = !hasHelper && hasLocation;
  const helperRejected = ev.helperStatus === 'rejected';
  const hasIssue = helperMissing || helperRejected;
  const showFixBtn = hasIssue && hours < 24 && hours >= 0;
  const showRemind = hasHelper && ev.helperStatus === 'pending';
  const isConfirmed = hasHelper && ev.helperStatus === 'confirmed';
  const chipColor = catColor(ev.category);

  // Red left border for imminent issues
  const leftBorderColor = (hasIssue && hours < 4 && hours >= 0) ? '#EF4444' : 'transparent';

  return (
    <View style={{
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderRadius: 18, borderWidth: 1,
      borderColor: isPast ? colors.border : (hasIssue && hours < 4) ? '#EF444440' : (isDark ? colors.border : '#EBEBF0'),
      borderLeftWidth: 4, borderLeftColor: leftBorderColor,
      overflow: 'hidden', opacity: isPast ? 0.45 : 1,
      marginBottom: 10,
      shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: isPast ? 0 : 2,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', padding: 14, gap: 12 }}>

        {/* Left — time column */}
        <View style={{ alignItems: 'center', minWidth: 48, gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: isPast ? colors.textTertiary : chipColor, lineHeight: 16 }}>
            {ev.time ? fmtTime(ev.time).replace(' ', '\n') : '—'}
          </Text>
          {kid && (
            <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
              siblings={allNames} size={30} ringColor={isPast ? colors.border : chipColor} ringWidth={1.5} />
          )}
        </View>

        {/* Right — content */}
        <View style={{ flex: 1, gap: 4 }}>
          {/* Category chip + title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: chipColor + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: chipColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {ev.category ?? 'Event'}
              </Text>
            </View>
            {isPast && (
              <View style={{ backgroundColor: '#10B98118', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>✓ Done</Text>
              </View>
            )}
          </View>

          <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: isPast ? colors.textTertiary : colors.textPrimary, lineHeight: 22 }} numberOfLines={1}>
            {ev.title}
          </Text>

          {/* For + Location row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {kid && (
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                👤 For <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{kid.name.split(' ')[0]}</Text>
              </Text>
            )}
            {!kid && (
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                👨‍👩‍👧 <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Family</Text>
              </Text>
            )}
            {ev.location && (
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }} numberOfLines={1}>
                📍 {ev.location}
              </Text>
            )}
          </View>

          {/* Helper row — label + emoji based on event type/category */}
          {ev.helper && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <Text style={{ fontSize: 13 }}>
                {ev.category === 'Sports'  ? '🏅' :
                 ev.category === 'Medical' ? '🏥' :
                 ev.category === 'School'  ? (ev.title?.toLowerCase().includes('ride') ? '🚗' : '📚') :
                 ev.category === 'Study'   ? '📚' :
                 ev.category === 'Work'    ? '💼' : '🚗'}
              </Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                {isPast
                  ? (ev.category === 'Sports'  ? 'Coached by '   :
                     ev.category === 'Medical' ? 'Accompanied by ' :
                     ev.category === 'Study' || ev.title?.toLowerCase().includes('tutor') ? 'Tutored by ' :
                     ev.title?.toLowerCase().includes('ride') ? 'Driven by ' : 'Assisted by ')
                  : (ev.title?.toLowerCase().includes('ride') ? 'Driver: ' :
                     ev.category === 'Medical' ? 'Escort: ' :
                     ev.category === 'Sports'  ? 'Coach: '  :
                     ev.category === 'Study'   ? 'Tutor: '  : 'Helper: ')}
                <Text style={{ fontWeight: '700', color: isPast ? '#10B981' : colors.textPrimary }}>{ev.helper}</Text>
                {!isPast && isConfirmed && <Text style={{ color: '#10B981' }}> · Confirmed ✓</Text>}
                {!isPast && showRemind && <Text style={{ color: BRAND.amber }}> · Awaiting ⏳</Text>}
                {!isPast && helperRejected && <Text style={{ color: '#EF4444' }}> · Declined ✕</Text>}
              </Text>
            </View>
          )}

          {/* Status badge row (right-aligned) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
            {showRemind && !helperRejected && (
              <Pressable style={{ backgroundColor: BRAND.amber + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: BRAND.amber + '40' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>Remind</Text>
              </Pressable>
            )}
            {hasIssue && !isPast && <UrgencyBadge hours={hours} hasIssue={true} />}
            {showFixBtn && (
              <Pressable onPress={() => setFixOpen(o => !o)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: '#EF444412', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
                  borderWidth: 1, borderColor: '#EF444435' }}>
                <ChevronRight size={12} color="#EF4444" />
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>
                  {fixOpen ? 'Cancel' : 'Assign helper'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Inline reassign panel */}
      {fixOpen && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
          <InlineReassignPanel ev={ev} members={members} colors={colors} isDark={isDark}
            onDone={(name, note) => {
              updateEvent(ev.id, { helper: name, helperStatus: 'pending', notes: note || undefined });
              setFixOpen(false);
            }} />
        </View>
      )}
    </View>
  );
}

const sc = StyleSheet.create({
  sectionLabel: {
    fontSize: TYPO.label, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 10,
  },
});

// ─── En Route Modal ───────────────────────────────────────────────────────────
function EnRouteModal({ visible, onClose, kids, onDispatch }: {
  visible: boolean; onClose: () => void;
  kids: FamilyMember[]; onDispatch: (kid: string, eta: string) => void;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [eta, setEta] = useState('10 min');
  const ETAS = ['5 min', '10 min', '15 min', '20 min', '30 min', '45 min'];
  const allNames = kids.map(k => k.name);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, borderTopWidth: 1, borderColor: colors.border }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 }} />
        <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, marginBottom: 4 }}>🚗 Dispatch En Route</Text>
        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginBottom: 20 }}>Notify your kids you're on the way</Text>
        <SectionLabel label="Picking up" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {kids.map(k => {
            const sel = selected === k.id;
            return (
              <Pressable key={k.id} onPress={() => setSelected(sel ? null : k.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: sel ? '#10B981' : colors.card,
                  borderColor: sel ? '#10B981' : colors.border }}>
                <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl}
                  siblings={allNames} size={24} ringColor={sel ? '#fff' : '#10B981'} ringWidth={1} />
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? '#fff' : colors.textPrimary }}>
                  {k.name.split(' ')[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <SectionLabel label="ETA" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {ETAS.map(e => (
            <Pressable key={e} onPress={() => setEta(e)}
              style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, borderWidth: 1,
                backgroundColor: eta === e ? '#10B981' : colors.card,
                borderColor: eta === e ? '#10B981' : colors.border }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: eta === e ? '#fff' : colors.textSecondary }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => {
          const kidName = selected ? kids.find(k => k.id === selected)?.name.split(' ')[0] ?? 'kids' : 'kids';
          onDispatch(kidName, eta);
          onClose();
        }} style={{ backgroundColor: '#10B981', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>🚗 Send En Route Ping</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── PARENT VIEW ──────────────────────────────────────────────────────────────
/**
 * Redesigned layout:
 *  1. Today's Timeline (hero) — urgency-gated cards with inline Fix/Remind
 *  2. Alert Banner — ONLY fires when hoursUntil < 4 AND helper missing/rejected
 *  3. Quick Action Tiles
 *  4. Action Needed — quest approvals + ride requests (no no-helper alerts)
 *  5. Dispatch En Route
 *  6. Family Support (collapsible)
 */
function ParentView({ active, members, colors, isDark, onScanFlyer, onHelpRequest, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onScanFlyer: () => void;
  onHelpRequest: () => void;
  onEnRoute: () => void;
}) {
  const { quests, approveQuest } = useQuestStore();
  const { events, updateEvent } = useEventStore();
  const { items: groceryItems, load: loadGrocery } = useGroceryStore();
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => { loadGrocery('family-1'); }, []);

  const allNames = members.map(m => m.name);
  const today = localToday();

  const todayEvents = events
    .filter(e => e.date === today)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  // Ride requests from kids awaiting parent approval
  const pendingRequests = events.filter(e => e.approvalPending);

  const awaitingApproval = quests.filter(q => q.status === 'pending_approval');

  const rejectedHelperEvents = todayEvents.filter(e => e.helperStatus === 'rejected');
  const conflictEvents       = todayEvents.filter(e => e.conflict);

  // Action Needed: quest approvals + ride requests only (no-helper alerts live on timeline)
  const actionCount = pendingRequests.length + awaitingApproval.length;

  // Banner fires only when hoursUntil < 4 AND helper missing/rejected
  const urgentRejected = rejectedHelperEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) < 4);
  const showBanner = conflictEvents.length > 0 || urgentRejected.length > 0;

  const pad = { paddingHorizontal: 16 };

  return (
    <>
      {/* ── 1. Today's Timeline — HERO ── */}
      <View style={pad}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary }}>Today</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 1 }}>{fmtHumanDate(localToday())}</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/calendar')}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>Full schedule →</Text>
          </Pressable>
        </View>

        {(() => {
          const upcoming = todayEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) > -0.5);
          const past     = todayEvents.filter(ev => hoursUntilEvent(ev.date, ev.time) <= -0.5);

          if (todayEvents.length === 0) return (
            <View style={{ backgroundColor: isDark ? colors.card : '#fff', borderRadius: 16, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', alignItems: 'center', paddingVertical: 28, marginBottom: 12 }}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>📅</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary }}>All clear — no events today</Text>
            </View>
          );

          return (
            <>
              {/* Upcoming events */}
              {upcoming.length === 0 ? (
                <View style={{ backgroundColor: isDark ? colors.card : '#f0fdf4', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 20 }}>🎉</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#10B981' }}>All done for today!</Text>
                </View>
              ) : upcoming.map(ev => (
                <TimelineCard key={ev.id} ev={ev} members={members} allNames={allNames}
                  colors={colors} isDark={isDark} updateEvent={updateEvent} />
              ))}

              {/* Past events — collapsed by default */}
              {past.length > 0 && (
                <>
                  <Pressable onPress={() => setShowPast(v => !v)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>
                      {showPast ? 'Hide' : `${past.length} completed`} {showPast ? '▴' : '▾'}
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  </Pressable>
                  {showPast && past.map(ev => (
                    <TimelineCard key={ev.id} ev={ev} members={members} allNames={allNames}
                      colors={colors} isDark={isDark} updateEvent={updateEvent} />
                  ))}
                </>
              )}
            </>
          );
        })()}
      </View>

      {/* ── 2. Alert Banner — only when imminent (< 4h) AND helper issue ── */}
      {showBanner && (
        <AlertBanner
          conflictEvents={conflictEvents}
          rejectedEvents={urgentRejected}
          members={members}
          colors={colors}
          isDark={isDark}
          updateEvent={updateEvent}
        />
      )}

      {/* ── 3. Quick Action Tiles ── */}
      <View style={{
        flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12,
        backgroundColor: isDark ? colors.card : '#FFFFFF',
        borderRadius: 24, padding: 10,
        borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
      }}>
        {/* Scan Flyer — primary filled */}
        <Pressable onPress={onScanFlyer} style={{
          flex: 1, backgroundColor: BRAND.purple, borderRadius: 18,
          paddingVertical: 12, alignItems: 'center', gap: 5,
        }}>
          <Sparkles size={18} color="#fff" />
          <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>Scan Flyer</Text>
        </Pressable>

        {/* + Quest — neutral tile */}
        <Pressable onPress={() => router.push('/(tabs)/quests')} style={{
          flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 18,
          paddingVertical: 12, alignItems: 'center', gap: 5,
          borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
        }}>
          <PlusCircle size={18} color="#10B981" />
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155' }}>+ Quest</Text>
        </Pressable>

        {/* + Event — neutral tile */}
        <Pressable onPress={() => router.push('/(tabs)/calendar')} style={{
          flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 18,
          paddingVertical: 12, alignItems: 'center', gap: 5,
          borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
        }}>
          <Calendar size={18} color={BRAND.purple} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155' }}>+ Event</Text>
        </Pressable>

        {/* Grocery — neutral tile */}
        <Pressable onPress={() => router.push('/(tabs)/grocery' as any)} style={{
          flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 18,
          paddingVertical: 12, alignItems: 'center', gap: 5,
          borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
        }}>
          <ShoppingCart size={18} color="#0ea5e9" />
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155' }} numberOfLines={1}>
            {groceryItems.length > 0 ? `${groceryItems.length} items` : 'Grocery'}
          </Text>
        </Pressable>
      </View>

      {/* ── 4. Action Needed — quest approvals + ride requests from kids ── */}
      {actionCount > 0 && (
        <View style={pad}>
          <SectionCard icon="⚡" title="Action Needed"
            badge={actionCount} badgeColor="#EF4444"
            colors={colors} isDark={isDark}>

            {/* Pending ride requests from kids */}
            {pendingRequests.map(ev => {
              const requester = ev.helperRequestedBy ?? members.find(m => m.id === ev.memberId)?.name ?? 'Kid';
              return (
                <CollapsibleCard key={ev.id} accent={BRAND.amber} colors={colors} isDark={isDark} defaultExpanded={false}
                  summary={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 16 }}>🙋</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }} numberOfLines={1}>
                          Ride requested · {ev.title}
                        </Text>
                        <Text style={{ fontSize: TYPO.label, color: BRAND.amber, opacity: 0.8 }}>
                          {requester} · {fmtTime(ev.time)}{ev.location ? ` · ${ev.location}` : ''}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: BRAND.amber + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.amber }}>Pending</Text>
                      </View>
                    </View>
                  }>
                  {ev.notes && (
                    <View style={{ backgroundColor: isDark ? '#1e293b' : '#fefce8', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: BRAND.amber }}>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>"{ev.notes}"</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, helperStatus: 'confirmed', helper: active.name })}
                      style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>✓ I'll Drive</Text>
                    </Pressable>
                    <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, helperStatus: 'rejected', declineReason: "Can't make it", declinedBy: active.name })}
                      style={{ flex: 1, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>✕ Can't Do It</Text>
                    </Pressable>
                  </View>
                  <InlineReassignPanel ev={ev} members={members} colors={colors} isDark={isDark}
                    onDone={(name, note) => updateEvent(ev.id, { approvalPending: false, helper: name, helperStatus: 'pending', notes: note || undefined })} />
                </CollapsibleCard>
              );
            })}

            {/* Quest approvals */}
            {awaitingApproval.map(q => {
              const kid = members.find(m => m.id === q.assignedToId);
              return (
                <CollapsibleCard key={q.id} accent={BRAND.purple} colors={colors} isDark={isDark} defaultExpanded={false}
                  summary={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 16 }}>📸</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }} numberOfLines={1}>
                          Quest done — {q.title}
                        </Text>
                        {kid && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                            <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                              siblings={allNames} size={14} ringColor={BRAND.purple} ringWidth={1} />
                            <Text style={{ fontSize: TYPO.label, color: BRAND.purple, fontWeight: '600' }}>
                              {kid.name.split(' ')[0]} wants 🪙{q.coins}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ backgroundColor: BRAND.purple + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>Review</Text>
                      </View>
                    </View>
                  }>
                  <Pressable onPress={() => approveQuest(q.id, active.id)}
                    style={{ backgroundColor: BRAND.purple, paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>✅ Approve & Pay 🪙{q.coins}</Text>
                  </Pressable>
                </CollapsibleCard>
              );
            })}
          </SectionCard>
        </View>
      )}

      {/* ── 5. Dispatch En Route — standalone teal card ── */}
      <View style={pad}>
        <View style={{
          backgroundColor: isDark ? '#0D2B1F' : '#ECFDF5',
          borderRadius: 24, borderWidth: 1, borderColor: isDark ? '#10B98140' : '#A7F3D0',
          padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12,
        }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? '#10B98130' : '#D1FAE5', alignItems: 'center', justifyContent: 'center' }}>
            <Navigation size={22} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isDark ? '#34D399' : '#065F46' }}>Start Pickup / Trip</Text>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Broadcast "En Route" with ETA to family chat</Text>
          </View>
          <Pressable onPress={onEnRoute} style={{
            backgroundColor: '#10B981', borderRadius: 14,
            paddingHorizontal: 14, paddingVertical: 9,
          }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>En Route</Text>
          </Pressable>
        </View>
      </View>

      {/* ── 6. Family Support — collapsed by default ── */}
      <View style={pad}>
        <View style={{
          backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12,
        }}>
          <Pressable onPress={() => setSupportExpanded(e => !e)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18 }}>?</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>
                Family Support &amp; Help Queue
              </Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>
                Kids ask for assistance · parents approve
              </Text>
            </View>
            {supportExpanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>

          {supportExpanded && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
              <Pressable onPress={onHelpRequest}
                style={{ backgroundColor: BRAND.purple, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: 16, color: '#fff' }}>+</Text>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Ask for Help</Text>
              </Pressable>
              <HelpQueueSection onRequestHelp={onHelpRequest} hideAskButton />
            </View>
          )}
        </View>
      </View>
    </>
  );
}

// ─── KID VIEW ─────────────────────────────────────────────────────────────────
function KidView({ active, members, colors, isDark, onHelpRequest }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onHelpRequest: () => void;
}) {
  const { quests, submitQuest } = useQuestStore();
  const { events } = useEventStore();

  const today = localToday();
  const myEvents = events.filter(e => e.memberId === active.id || !e.memberId);
  const todayMyEvents = myEvents.filter(e => e.date === today).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  const parentWorkConflict = events.find(e => e.date === today && e.category === 'Work' && e.conflict);
  const myPendingRides   = events.filter(e => e.memberId === active.id && e.approvalPending);
  const myDeclinedRides  = events.filter(e => e.memberId === active.id && e.helperStatus === 'rejected' && !e.approvalPending);
  const myConfirmedRides = todayMyEvents.filter(e => e.helper && e.helperStatus === 'confirmed');

  const myQuests   = quests.filter(q => q.assignedToId === active.id);
  const inProgress = myQuests.filter(q => q.status === 'todo' || q.status === 'claimed').length;
  const inReview   = myQuests.filter(q => q.status === 'pending_approval').length;
  const available  = quests.filter(q => !q.assignedToId && q.status === 'todo').length;

  const mainCoins = active.mainCoins ?? active.coins ?? 0;
  const gpCoins   = active.gpCoins ?? 0;
  const streak    = active.streak ?? 0;
  const COIN_VAL  = 0.10;
  const nextTier  = Math.ceil((mainCoins + 1) / 100) * 100;
  const coinsToTier = nextTier - mainCoins;
  const showMilestone = coinsToTier <= 30 && mainCoins > 0;

  const pad = { paddingHorizontal: 16 };

  const ACTIONS: { Icon: any; label: string; color: string; action: () => void }[] = [
    { Icon: MessageSquare, label: 'Parent Chat',   color: BRAND.purple, action: () => router.push('/(tabs)/chat') },
    { Icon: Car,           label: 'Ask a Ride',    color: '#10B981',    action: () => Alert.alert('Ride Request', 'Your parent will be notified to confirm.') },
    { Icon: BookOpen,      label: 'Ask Tutor',     color: BRAND.amber,  action: () => Alert.alert('Tutor Request', 'Requesting tutor — a parent will schedule.') },
    { Icon: ThumbsUp,      label: 'Cheer Sibling', color: '#6366F1',    action: () => router.push('/(tabs)/quests') },
  ];

  const rideAlerts = myDeclinedRides.length + myPendingRides.length;

  return (
    <>
      {/* ── Quick Actions 4-col ── */}
      <View style={pad}>
        <View style={{
          backgroundColor: isDark ? colors.card : '#FFFFFF',
          borderRadius: 24, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          padding: 12, marginBottom: 12, gap: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Zap size={14} color={BRAND.amber} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Quick Actions</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {ACTIONS.map(a => (
              <Pressable key={a.label} onPress={a.action} style={{
                flex: 1, backgroundColor: isDark ? colors.surface : '#F8FAFC',
                borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 5,
                borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
              }}>
                <a.Icon size={20} color={a.color} />
                <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155', textAlign: 'center' }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* ── Ride & Conflict Alerts ── */}
      {(parentWorkConflict || rideAlerts > 0 || myConfirmedRides.length > 0) && (
        <View style={pad}>
          <SectionCard icon="🚗" title="Ride Status"
            badge={rideAlerts || undefined}
            badgeColor={myDeclinedRides.length > 0 ? '#EF4444' : BRAND.amber}
            colors={colors} isDark={isDark}>
            {parentWorkConflict && (
              <CollapsibleCard accent={BRAND.amber} colors={colors} isDark={isDark} defaultExpanded={false}
                summary={
                  <View>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }}>⚠️ Parent busy during your activities</Text>
                    <Text style={{ fontSize: TYPO.label, color: BRAND.amber, opacity: 0.75, marginTop: 2 }}>Check with Dad or Grandma for pickup</Text>
                  </View>
                } />
            )}
            {myDeclinedRides.map(ev => (
              <CollapsibleCard key={ev.id} accent="#EF4444" colors={colors} isDark={isDark} defaultExpanded={false}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>❌</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#EF4444' }} numberOfLines={1}>
                        Declined: {ev.title}
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: '#EF4444', opacity: 0.75 }}>
                        {ev.declineReason ?? `Declined by ${ev.declinedBy ?? 'parent'}`}
                      </Text>
                    </View>
                  </View>
                }>
                <Pressable onPress={() => router.push('/(tabs)/calendar')}
                  style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Request Again</Text>
                </Pressable>
              </CollapsibleCard>
            ))}
            {myPendingRides.map(ev => (
              <CollapsibleCard key={ev.id} accent={BRAND.amber} colors={colors} isDark={isDark} defaultExpanded={false}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>⏳</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }} numberOfLines={1}>
                        Pending: {ev.title}
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: BRAND.amber, opacity: 0.75 }}>
                        {fmtTime(ev.time)} · Waiting for a parent
                      </Text>
                    </View>
                  </View>
                } />
            ))}
            {myConfirmedRides.map(ev => (
              <CollapsibleCard key={ev.id} accent="#10B981" colors={colors} isDark={isDark}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>✅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#10B981' }} numberOfLines={1}>
                        {ev.helper} is picking you up!
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: '#10B981', opacity: 0.75 }}>
                        {ev.title} · {fmtTime(ev.time)}{ev.location ? ` · ${ev.location}` : ''}
                      </Text>
                    </View>
                  </View>
                } />
            ))}
          </SectionCard>
        </View>
      )}

      {/* ── Family Help Queue ── */}
      <View style={pad}>
        <SectionCard icon="🆘" title="Family Help Queue"
          subtitle="Kids ask for help · parents assign or self-assign"
          actionBtn={{ label: '+ Ask', onPress: onHelpRequest }}
          colors={colors} isDark={isDark}>
          <HelpQueueSection onRequestHelp={onHelpRequest} hideAskButton />
        </SectionCard>
      </View>

      {/* ── My Quests ── */}
      <View style={pad}>
        <SectionCard icon="🎯" title="My Quests"
          badge={(inProgress + inReview) || undefined} badgeColor={BRAND.purple}
          seeAll={() => router.push('/(tabs)/quests')} seeAllLabel="All →"
          colors={colors} isDark={isDark}>
          {/* Status strip */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { n: inProgress, label: 'In Progress', color: BRAND.purple, icon: '⚡' },
              { n: inReview,   label: 'In Review',   color: BRAND.amber,  icon: '⏳' },
              { n: available,  label: 'Open Tasks',  color: '#10B981',    icon: '🏆' },
            ].map(b => (
              <Pressable key={b.label} onPress={() => router.push('/(tabs)/quests')}
                style={{ flex: 1, backgroundColor: b.color + '15', borderRadius: 16, borderWidth: 1, borderColor: b.color + '40', paddingVertical: 12, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 16 }}>{b.icon}</Text>
                <Text style={{ fontSize: TYPO.subheading, fontWeight: '900', color: b.color }}>{b.n}</Text>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: b.color, textAlign: 'center' }}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
          {/* Streak */}
          {streak > 0 && (
            <SubCard colors={colors} isDark={isDark} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 22 }}>🔥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{streak} Day Streak!</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Keep completing quests daily</Text>
              </View>
              <Text style={{ fontSize: 22 }}>🏅</Text>
            </SubCard>
          )}
          {/* Milestone hint */}
          {showMilestone && (
            <SubCard accent={BRAND.teal} colors={colors} isDark={isDark}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.teal }}>
                🎯 {coinsToTier} coins to your next milestone!
              </Text>
              <Text style={{ fontSize: TYPO.label, color: BRAND.teal, opacity: 0.8, marginTop: 2 }}>
                Complete a quest to reach {nextTier} coins
              </Text>
            </SubCard>
          )}
          {/* Active quest list — each a CollapsibleCard */}
          {myQuests.filter(q => q.status !== 'done').length === 0 ? (
            <SubCard colors={colors} isDark={isDark} style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ fontSize: 22 }}>🎉</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary, marginTop: 4 }}>All done! Check for new quests.</Text>
            </SubCard>
          ) : myQuests.filter(q => q.status !== 'done').slice(0, 5).map(q => {
            const isPending = q.status === 'pending_approval';
            const isClaimed = q.status === 'claimed';
            return (
              <CollapsibleCard key={q.id} colors={colors} isDark={isDark}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isPending ? BRAND.amber + '20' : isClaimed ? '#10B98120' : colors.background,
                      borderColor: isPending ? BRAND.amber : isClaimed ? '#10B981' : colors.border }}>
                      {isPending && <Clock size={12} color={BRAND.amber} />}
                      {isClaimed && <Zap size={12} color="#10B981" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{q.title}</Text>
                      <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
                        {isPending ? '⏳ Awaiting approval' : isClaimed ? '✓ Submitted' : q.category ?? ''}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: BRAND.amber + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.amber }}>🪙{q.coins}</Text>
                    </View>
                  </View>
                }>
                {!isPending && (
                  <Pressable onPress={() => submitQuest(q.id)}
                    style={{ backgroundColor: BRAND.teal, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Mark Complete</Text>
                  </Pressable>
                )}
              </CollapsibleCard>
            );
          })}
        </SectionCard>
      </View>

      {/* ── My Wallet ── */}
      <View style={pad}>
        <SectionCard icon="💰" title="My Wallet" seeAll={() => router.push('/(tabs)/store' as any)} seeAllLabel="Store →" colors={colors} isDark={isDark}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SubCard accent={BRAND.amber} colors={colors} isDark={isDark} style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>🪙 Store Wallet</Text>
              <Text style={{ fontSize: TYPO.hero, fontWeight: '900', color: BRAND.amber }}>{mainCoins}</Text>
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>${(mainCoins * COIN_VAL).toFixed(2)} value</Text>
            </SubCard>
            {gpCoins > 0 ? (
              <SubCard accent={BRAND.purple} colors={colors} isDark={isDark} style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>⭐ GP Bonus</Text>
                <Text style={{ fontSize: TYPO.hero, fontWeight: '900', color: BRAND.purple }}>{gpCoins}</Text>
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>from Grandma</Text>
              </SubCard>
            ) : (
              <SubCard colors={colors} isDark={isDark} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Text style={{ fontSize: 26 }}>⭐</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, textAlign: 'center', fontWeight: '600' }}>No GP bonus yet</Text>
              </SubCard>
            )}
          </View>
        </SectionCard>
      </View>

      {/* ── My Schedule Today ── */}
      <View style={pad}>
        <SectionCard icon="📅" title="My Schedule Today"
          badge={todayMyEvents.length || undefined}
          seeAll={() => router.push('/(tabs)/calendar')} seeAllLabel="Full →"
          colors={colors} isDark={isDark}>
          {todayMyEvents.length === 0 ? (
            <SubCard colors={colors} isDark={isDark} style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ fontSize: 22 }}>☀️</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary, marginTop: 4 }}>Nothing on your calendar today</Text>
            </SubCard>
          ) : todayMyEvents.map(ev => (
            <CollapsibleCard key={ev.id} colors={colors} isDark={isDark}
              summary={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor(ev.category) }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{fmtTime(ev.time)}</Text>
                  </View>
                </View>
              }>
              {ev.location && <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>📍 {ev.location}</Text>}
              {ev.helper && ev.helperStatus === 'confirmed' && (
                <Text style={{ fontSize: TYPO.label, color: '#10B981', fontWeight: '600' }}>🚗 {ev.helper} confirmed</Text>
              )}
              {ev.helper && ev.helperStatus === 'pending' && (
                <Text style={{ fontSize: TYPO.label, color: BRAND.amber, fontWeight: '600' }}>🚗 {ev.helper} (confirming...)</Text>
              )}
            </CollapsibleCard>
          ))}
        </SectionCard>
      </View>
    </>
  );
}

// ─── SENIOR VIEW ──────────────────────────────────────────────────────────────
function SeniorView({ active, members, colors, isDark, onHelpRequest, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onHelpRequest: () => void;
  onEnRoute: () => void;
}) {
  const { events, updateEvent } = useEventStore();
  const kids    = members.filter(m => m.role === 'kid');
  const allNames = members.map(m => m.name);
  const today   = localToday();

  const myDrivingToday = events.filter(e =>
    e.date === today && e.helper === active.name && e.helperStatus === 'confirmed'
  );
  const openRequests = events.filter(e => e.approvalPending);
  const todayEvents = events
    .filter(e => e.date === today && e.category !== 'Work')
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  const RECEIPTS = [
    { kid: 'Leo',  amount: 2.50, date: 'Today',     reason: 'Bonus for A+ grade 🌟' },
    { kid: 'Maya', amount: 1.50, date: 'Yesterday',  reason: 'Helped with chores' },
    { kid: 'Sam',  amount: 1.00, date: '2 days ago', reason: 'Reading 20 mins daily' },
  ];

  const pad = { paddingHorizontal: 16 };
  const driveAlerts = myDrivingToday.length + openRequests.length;

  return (
    <>
      {/* Identity banner */}
      <View style={[pad, { marginBottom: 4 }]}>
        <SubCard accent={BRAND.purple} colors={colors} isDark={isDark}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
            👵 Senior Caregiver & Driver HQ
          </Text>
          <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 20 }}>
            You can send bonus tips to grandchildren and help with carpool duties.
          </Text>
        </SubCard>
      </View>

      {/* ── Driving Duty ── */}
      <View style={pad}>
        <SectionCard icon="🚗" title="Driving Duty"
          badge={driveAlerts || undefined} badgeColor="#10B981"
          colors={colors} isDark={isDark}>
          {myDrivingToday.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            return (
              <CollapsibleCard key={ev.id} accent="#10B981" colors={colors} isDark={isDark} defaultExpanded={false}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>🚗</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#10B981' }} numberOfLines={1}>
                        {ev.title}
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: '#10B981', opacity: 0.75 }}>
                        {kid?.name.split(' ')[0] ?? 'Kid'} · {fmtTime(ev.time)}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#10B98120', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#10B981' }}>Assigned</Text>
                    </View>
                  </View>
                }>
                {ev.location && <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>📍 {ev.location}</Text>}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>✓ I'm On It</Text>
                  </Pressable>
                  <Pressable onPress={() => updateEvent(ev.id, { helperStatus: 'rejected', helper: undefined, declinedBy: active.name, declineReason: 'Unavailable' })}
                    style={{ flex: 1, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>Can't Make It</Text>
                  </Pressable>
                </View>
              </CollapsibleCard>
            );
          })}
          {openRequests.map(ev => {
            const kid = members.find(m => m.id === ev.memberId);
            return (
              <CollapsibleCard key={ev.id} accent={BRAND.amber} colors={colors} isDark={isDark} defaultExpanded={false}
                summary={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>🙋</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: BRAND.amber }} numberOfLines={1}>
                        {ev.title}
                      </Text>
                      <Text style={{ fontSize: TYPO.label, color: BRAND.amber, opacity: 0.75 }}>
                        {fmtTime(ev.time)}{ev.location ? ` · ${ev.location}` : ''}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: BRAND.amber + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.amber }}>Open</Text>
                    </View>
                  </View>
                }>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {kid && <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl} siblings={allNames} size={28} ringColor={BRAND.amber} />}
                  <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, helper: active.name, helperStatus: 'confirmed' })}
                    style={{ flex: 1, backgroundColor: BRAND.purple, paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Drive</Text>
                  </Pressable>
                </View>
              </CollapsibleCard>
            );
          })}
          {myDrivingToday.length === 0 && openRequests.length === 0 && (
            <SubCard colors={colors} isDark={isDark} style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ fontSize: 26 }}>🌿</Text>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary, marginTop: 4 }}>No driving duties today</Text>
            </SubCard>
          )}
        </SectionCard>
      </View>

      {/* ── Family Help Queue ── */}
      <View style={pad}>
        <SectionCard icon="🆘" title="Family Help Queue"
          subtitle="Kids ask for help · parents assign or self-assign"
          actionBtn={{ label: '+ Ask', onPress: onHelpRequest }}
          colors={colors} isDark={isDark}>
          <HelpQueueSection onRequestHelp={onHelpRequest} hideAskButton />
        </SectionCard>
      </View>

      {/* ── Dispatch En Route ── */}
      <View style={pad}>
        <SectionCard icon="🗺️" title="Dispatch En Route" colors={colors} isDark={isDark}>
          <Pressable onPress={onEnRoute}>
            <SubCard accent="#10B981" colors={colors} isDark={isDark}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#10B98125', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>🚗</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#10B981' }}>Broadcast your ETA</Text>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Notify kids you're on the way</Text>
                </View>
                <ChevronRight size={18} color="#10B981" />
              </View>
            </SubCard>
          </Pressable>
        </SectionCard>
      </View>

      {/* ── GP Tips ── */}
      <View style={pad}>
        <SectionCard icon="🎁" title="Send GP Bonus Tips"
          badge={kids.length || undefined} badgeColor={BRAND.purple}
          colors={colors} isDark={isDark}>
          {kids.length === 0 ? (
            <SubCard colors={colors} isDark={isDark} style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No grandchildren added yet.</Text>
            </SubCard>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {kids.map(kid => (
                  <Pressable key={kid.id} onPress={() => Alert.alert('Send Bonus', `Sending bonus coins to ${kid.name.split(' ')[0]}...`)}
                    style={{ backgroundColor: BRAND.purple, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                      siblings={allNames} size={26} ringColor="#fff" ringWidth={1} bgColor={BRAND.purple + '60'} />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>{kid.name.split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </View>
              <SubCard colors={colors} isDark={isDark}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>Recent Receipts</Text>
                {RECEIPTS.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6,
                    borderBottomWidth: i < RECEIPTS.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 18 }}>🧾</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>${r.amount.toFixed(2)} → {r.kid}</Text>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{r.reason}</Text>
                    </View>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>{r.date}</Text>
                  </View>
                ))}
              </SubCard>
            </>
          )}
        </SectionCard>
      </View>

      {/* ── Family Timeline (read-only) ── */}
      {todayEvents.length > 0 && (
        <View style={pad}>
          <SectionCard icon="📅" title="Family Timeline"
            badge={todayEvents.length}
            colors={colors} isDark={isDark}>
            {todayEvents.map(ev => {
              const member = members.find(m => m.id === ev.memberId);
              return (
                <CollapsibleCard key={ev.id} colors={colors} isDark={isDark}
                  summary={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor(ev.category) }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{ev.title}</Text>
                        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                          {fmtTime(ev.time)}{member ? ` · ${member.name.split(' ')[0]}` : ''}
                        </Text>
                      </View>
                    </View>
                  }>
                  {ev.location && <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>📍 {ev.location}</Text>}
                </CollapsibleCard>
              );
            })}
          </SectionCard>
        </View>
      )}
    </>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function HubScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, setActiveMember, loaded, loadFromStorage } = useFamilyStore();
  const { loadFromStorage: loadQuests } = useQuestStore();
  const { loadFromStorage: loadEvents } = useEventStore();
  const { loadFromStorage: loadRewards } = useRewardStore();

  const [refreshing, setRefreshing]        = useState(false);
  const [pinTarget, setPinTarget]          = useState<FamilyMember | null>(null);
  const [clock, setClock]                  = useState(fmtClock()); // kept for potential sub-components
  const [helpModalVisible, setHelpModal]    = useState(false);
  const [flyerVisible, setFlyerVisible]     = useState(false);
  const [enRouteVisible, setEnRouteVisible] = useState(false);
  const [transitBanner, setTransitBanner]  = useState<{ kid: string; eta: string } | null>(null);

  useEffect(() => {
    if (!loaded) loadFromStorage();
    loadQuests();
    loadEvents();
    loadRewards();
  }, [loaded]);

  useEffect(() => {
    const id = setInterval(() => setClock(fmtClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadQuests(), loadEvents()]);
    setRefreshing(false);
  }, []);

  const active   = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = active?.role === 'parent';
  const isSenior = active?.role === 'senior';
  const isKid    = !isParent && !isSenior;

  if (!active) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>

      <AppHeader
        memberName={active.name.split(' ')[0]}
        memberRole={active.role as 'parent' | 'kid' | 'senior'}
        onBellPress={() => Alert.alert('Nudge Center', 'Dinner ready · Meds · Pickup · Chore check')}
      />

      {/* En Route live transit banner */}
      {transitBanner && (
        <View style={{ backgroundColor: '#065F46', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 16 }}>🚗</Text>
          <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: '#6EE7B7' }}>
            En Route to pick up {transitBanner.kid} · ETA {transitBanner.eta}
          </Text>
          <Pressable onPress={() => setTransitBanner(null)}
            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#10B98130', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} color="#6EE7B7" />
          </Pressable>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: isDark ? colors.background : '#F1F5F9' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 60 }}
      >
        {isParent && (
          <ParentView
            active={active} members={members} colors={colors} isDark={isDark}
            onScanFlyer={() => setFlyerVisible(true)}
            onHelpRequest={() => setHelpModal(true)}
            onEnRoute={() => setEnRouteVisible(true)}
          />
        )}
        {isKid && (
          <KidView
            active={active} members={members} colors={colors} isDark={isDark}
            onHelpRequest={() => setHelpModal(true)}
          />
        )}
        {isSenior && (
          <SeniorView
            active={active} members={members} colors={colors} isDark={isDark}
            onHelpRequest={() => setHelpModal(true)}
            onEnRoute={() => setEnRouteVisible(true)}
          />
        )}
      </ScrollView>

      <HelpRequestModal
        visible={helpModalVisible}
        onClose={() => setHelpModal(false)}
      />
      <FlyerScannerModal
        visible={flyerVisible}
        onClose={() => setFlyerVisible(false)}
      />
      <EnRouteModal
        visible={enRouteVisible}
        onClose={() => setEnRouteVisible(false)}
        kids={members.filter(m => m.role === 'kid')}
        onDispatch={(kid, eta) => { setTransitBanner({ kid, eta }); }}
      />
      <PinEntryModal
        visible={pinTarget !== null}
        member={pinTarget}
        onSuccess={() => { if (pinTarget) setActiveMember(pinTarget.id); setPinTarget(null); }}
        onCancel={() => setPinTarget(null)}
      />
    </SafeAreaView>
  );
}
