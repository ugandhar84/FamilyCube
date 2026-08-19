/**
 * Shared primitive components for the Hub feature.
 * SectionCard, CollapsibleCard, SubCard, AlertBanner, TimelineCard, EnRouteModal.
 */
import { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert, ScrollView, Platform, Linking, TouchableOpacity, Modal, KeyboardAvoidingView } from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import {
  ChevronDown, ChevronUp, Pencil, Calendar,
  MapPin, AlertOctagon, Car, Navigation, AlertTriangle, X, User,
  Users, Backpack, Bell, Repeat,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, LETTER_SPACING, MONO_FONT } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import { fmtTime, hoursUntilEvent, catColor, isWorkEvent, isHomeLocation } from './hubUtils';
import { fmtTimeParts } from '@/lib/dates';
import { relationalNameByName } from '@/lib/format';
import { useChatStore } from '@/store/chatStore';

// ─── SectionLabel ─────────────────────────────────────────────────────────────

export function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return <Text style={[sc.sectionLabel, { color: colors.textTertiary }]}>{label}</Text>;
}

// ─── SectionCard ──────────────────────────────────────────────────────────────
// icon is a ReactNode so callers pass a Lucide icon component, not an emoji string.
// Kinfolk mock pattern: flat header (icon chip + uppercase label + count pill +
// text "Collapse/Expand" control) divided by a hairline — NOT a bordered card box.
// Only the individual item rows inside get the boxed/shadowed "tactile card" look.

export function SectionCard({
  icon, title, subtitle, badge, badgeLabel, badgeColor, statusBadge, headerAccessory, accent, seeAll, seeAllLabel, actionBtn, children, colors, isDark,
  collapsible = false, defaultExpanded = true, large = false,
}: {
  icon: React.ReactNode; title: string; subtitle?: string; badge?: number; badgeColor?: string;
  /** Word appended after the count — mock's "5 Events" / "2 Pending" / "3 Active", not a bare digit. */
  badgeLabel?: string;
  /** Text-only status pill instead of a count — mock's "EN ROUTE". Takes priority over badge/badgeLabel. */
  statusBadge?: string;
  /** Small emoji/avatar shown in the header, e.g. who's currently on duty or up next. */
  headerAccessory?: React.ReactNode;
  /** Section accent (icon chip bg/fg + count pill). Defaults to colors.primary. */
  accent?: string;
  seeAll?: () => void; seeAllLabel?: string;
  actionBtn?: { label: string; onPress: () => void; color?: string };
  collapsible?: boolean; defaultExpanded?: boolean;
  /** Senior Hub sizing — bigger header type, roomier tap area. */
  large?: boolean;
  children: React.ReactNode; colors: any; isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const open = !collapsible || expanded;
  const tint = accent ?? colors.primary;
  const Header = collapsible ? Pressable : View;

  return (
    <View style={{ marginBottom: 18 }}>
      <Header
        onPress={collapsible ? () => setExpanded(v => !v) : undefined}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: large ? 12 : 10,
          paddingVertical: 4,
        }}>
        <View style={{
          width: large ? 34 : 28, height: large ? 34 : 28, borderRadius: large ? 11 : 9,
          backgroundColor: tint + '18', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{
              fontSize: large ? 16 : TYPO.sectionLabel, fontWeight: '800', color: colors.textSecondary,
              textTransform: large ? 'none' : 'uppercase', letterSpacing: large ? 0 : LETTER_SPACING.sectionLabel,
            }}>{title}</Text>
            {headerAccessory}
          </View>
          {subtitle && (
            <Text style={{ fontSize: large ? 14 : TYPO.label, color: colors.textTertiary, marginTop: 2 }}>{subtitle}</Text>
          )}
        </View>
        {actionBtn && (
          <Pressable onPress={actionBtn.onPress}
            style={{ backgroundColor: actionBtn.color ?? tint, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>{actionBtn.label}</Text>
          </Pressable>
        )}
        {seeAll && (
          <Pressable onPress={seeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: tint }}>{seeAllLabel ?? 'See All →'}</Text>
          </Pressable>
        )}
        {statusBadge ? (
          <View style={{
            backgroundColor: badgeColor ?? tint, borderRadius: 12,
            paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center',
          }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>
              {statusBadge}
            </Text>
          </View>
        ) : badge !== undefined && badge > 0 && (
          <View style={{
            backgroundColor: badgeColor ?? tint, borderRadius: 12,
            paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center',
          }}>
            <Text style={{ fontSize: large ? 14 : TYPO.label, fontWeight: '800', color: '#fff' }}>
              {badge}{badgeLabel ? ` ${badgeLabel}` : ''}
            </Text>
          </View>
        )}
        {collapsible && (
          open
            ? <ChevronUp size={16} color={colors.textTertiary} />
            : <ChevronDown size={16} color={colors.textTertiary} />
        )}
      </Header>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
      {open && <View style={{ gap: 10 }}>{children}</View>}
    </View>
  );
}

// ─── CollapsibleCard ──────────────────────────────────────────────────────────

export function CollapsibleCard({
  summary, accent, colors, isDark, defaultExpanded = false, children, flat = false,
}: {
  summary: React.ReactNode; accent?: string; colors: any; isDark: boolean;
  defaultExpanded?: boolean; children?: React.ReactNode; flat?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const bg = accent ? (isDark ? accent + '18' : accent + '10') : (isDark ? colors.surface : '#F8FAFC');
  const border = accent ? accent + '40' : colors.border;

  if (flat) {
    return (
      <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Pressable
          onPress={() => children && setExpanded(e => !e)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4 }}>
          <View style={{ flex: 1 }}>{summary}</View>
          {children && (expanded
            ? <ChevronUp size={14} color={accent ?? colors.textTertiary} />
            : <ChevronDown size={14} color={accent ?? colors.textTertiary} />
          )}
        </Pressable>
        {expanded && children && (
          <View style={{ paddingBottom: 12, paddingHorizontal: 4, gap: 8 }}>{children}</View>
        )}
      </View>
    );
  }

  return (
    <View style={{
      borderRadius: 16, borderWidth: 1, backgroundColor: bg, borderColor: border, overflow: 'hidden',
      shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
      shadowOpacity: isDark ? 0.4 : 1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      elevation: isDark ? 3 : 2,
    }}>
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
        <View style={{ padding: 12, paddingTop: 0, gap: 8 }}>{children}</View>
      )}
    </View>
  );
}

// ─── SubCard ──────────────────────────────────────────────────────────────────

export function SubCard({ children, accent, colors, isDark, style }: {
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

// ─── QuestLiveness ────────────────────────────────────────────────────────────
// One shared "who did what, when" line for a Quest, built from quest.history —
// the one data source in the app with a real, always-live, per-actor audit
// trail (unlike kid_requests/calendar events, which don't sync live or don't
// record an actor per transition). Rendered identically across Parent, Kid,
// Teen, and Senior Hub cards so the same quest tells the same story no matter
// whose screen it's on.

function relTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const HISTORY_VERB: Record<string, string> = {
  created: 'Posted', assigned: 'Assigned', claimed: 'Claimed', submitted: 'Submitted for review',
  approved: 'Approved', declined: 'Sent back', reassigned: 'Reassigned', reopened: 'Reopened',
  cancelled: 'Cancelled', archived: 'Archived',
};

export function QuestLiveness({ history, members, colors }: {
  history: { at: string; action: string; by?: string; note?: string }[] | undefined;
  members: { id: string; name: string }[];
  colors: any;
}) {
  if (!history || history.length === 0) return null;
  const last = history[history.length - 1];
  const actor = last.by ? members.find(m => m.id === last.by)?.name.split(' ')[0] : undefined;
  const verb = HISTORY_VERB[last.action] ?? last.action;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.textTertiary }} />
      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }} numberOfLines={1}>
        {actor ? `${verb} by ${actor}` : verb} · {relTime(last.at)}
      </Text>
    </View>
  );
}

// ─── UrgencyBadge ─────────────────────────────────────────────────────────────

export function UrgencyBadge({ hours, hasIssue }: { hours: number; hasIssue: boolean }) {
  const { colors } = useTheme();
  if (!hasIssue) return null;
  if (hours > 24) return (
    <View style={{ backgroundColor: colors.textTertiary + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary }}>Sort later</Text>
    </View>
  );
  if (hours >= 4) return (
    <View style={{ backgroundColor: colors.warning + '25', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <AlertTriangle size={10} color={colors.warning} />
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.warning }}>Today</Text>
    </View>
  );
  if (hours >= 0) return (
    <View style={{ backgroundColor: colors.danger + '25', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <AlertOctagon size={10} color={colors.danger} />
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger }}>Now</Text>
    </View>
  );
  return null;
}


// ─── AlertBanner ──────────────────────────────────────────────────────────────

export function AlertBanner({
  conflictEvents, rejectedEvents, pendingNoResponseEvents = [], unassignedUrgentEvents = [],
  conflictReasons, members, colors, isDark, updateEvent, activeName,
}: {
  conflictEvents: FamilyEvent[]; rejectedEvents: FamilyEvent[];
  pendingNoResponseEvents?: FamilyEvent[]; unassignedUrgentEvents?: FamilyEvent[];
  conflictReasons?: Map<string, string>;
  members: FamilyMember[]; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  // Viewer's own name — lets each urgent card offer a direct "Assign to Me"
  // instead of routing the common "I'll just take it" case through the full
  // reassign picker.
  activeName?: string;
}) {
  const viewer = members.find(m => m.name === activeName);
  // Whoever had the slot (declined or gone quiet) only finds out someone
  // else took it by checking their own Hub again unless we say so out loud.
  const notifyTakeover = (ev: FamilyEvent) => {
    if (ev.helper && ev.helper !== activeName && viewer) {
      useChatStore.getState().sendMessage('all', viewer.id,
        `🔄 ${relationalNameByName(activeName, members)} took over "${ev.title}" (was ${relationalNameByName(ev.helper, members)}'s)`);
    }
  };

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, gap: 8 }}>
      {rejectedEvents.filter(ev => { const h = hoursUntilEvent(ev.date, ev.time); return h >= 0 && h < 4; }).map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        return (
          <View key={ev.id} style={{
            backgroundColor: isDark ? colors.danger + '14' : colors.dangerLight,
            borderRadius: 16, borderWidth: 1.5, borderColor: colors.danger + '50', overflow: 'hidden',
          }}>
            <View style={{ backgroundColor: colors.danger, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <AlertOctagon size={15} color="#fff" />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                Driver Declined — {ev.title}
              </Text>
              <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>{fmtTime(ev.time)}</Text>
            </View>
            <View style={{ padding: 14, gap: 8 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                <Text style={{ fontWeight: '700', color: colors.danger }}>{relationalNameByName(ev.helper, members)}</Text> declined
                {ev.declineReason ? `: "${ev.declineReason}"` : ''}
              </Text>
              {kid && ev.location && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{ev.location} · For {kid.name.split(' ')[0]}</Text>
                </View>
              )}
              <DriverChipRow ev={ev} members={members} colors={colors} isDark={isDark}
                activeName={activeName} excludeName={ev.helper} allowGpTeen
                onOpenPool={(kind) => {
                  updateEvent(ev.id, kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true });
                }}
                onAssign={(name, reason) => {
                  notifyTakeover(ev);
                  // Assigning it to yourself IS the confirmation — no separate
                  // "accept" step needed, unlike handing it to someone else
                  // who still needs to acknowledge before it's settled.
                  updateEvent(ev.id, {
                    helper: name, helperStatus: name === activeName ? 'confirmed' : 'pending',
                    notes: reason || undefined,
                  });
                }} />
            </View>
          </View>
        );
      })}

      {/* Pending no-response urgent (< 1 hr, helper not replied) */}
      {pendingNoResponseEvents.map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        return (
          <View key={`pnr-${ev.id}`} style={{
            backgroundColor: isDark ? colors.warning + '14' : colors.warningLight,
            borderRadius: 16, borderWidth: 1.5, borderColor: colors.warning + '60', overflow: 'hidden',
          }}>
            <View style={{ backgroundColor: colors.warning, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <AlertTriangle size={15} color="#fff" />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                No Reply — {ev.title}
              </Text>
              <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.9)', fontWeight: '700' }}>{fmtTime(ev.time)}</Text>
            </View>
            <View style={{ padding: 14, gap: 8 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                <Text style={{ fontWeight: '700', color: colors.warning }}>{relationalNameByName(ev.helper, members)}</Text> hasn't replied.
                {kid ? ` Pickup for ${kid.name.split(' ')[0]} is in under an hour.` : ' Event is in under an hour.'}
              </Text>
              <DriverChipRow ev={ev} members={members} colors={colors} isDark={isDark}
                activeName={activeName} excludeName={ev.helper} allowGpTeen
                onOpenPool={(kind) => {
                  updateEvent(ev.id, kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true });
                }}
                onAssign={(name, reason) => {
                  notifyTakeover(ev);
                  // Assigning it to yourself IS the confirmation — no separate
                  // "accept" step needed, unlike handing it to someone else
                  // who still needs to acknowledge before it's settled.
                  updateEvent(ev.id, {
                    helper: name, helperStatus: name === activeName ? 'confirmed' : 'pending',
                    notes: reason || undefined,
                  });
                }} />
            </View>
          </View>
        );
      })}

      {/* Unassigned urgent (transport event < 2 hr, no driver) */}
      {unassignedUrgentEvents.map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        return (
          <View key={`ua-${ev.id}`} style={{
            backgroundColor: isDark ? colors.warningDark + '14' : colors.warningLight,
            borderRadius: 16, borderWidth: 1.5, borderColor: colors.warning + '60', overflow: 'hidden',
          }}>
            <View style={{ backgroundColor: colors.warningDark, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Car size={15} color="#fff" />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                No Driver Assigned — {ev.title}
              </Text>
              <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.9)', fontWeight: '700' }}>{fmtTime(ev.time)}</Text>
            </View>
            <View style={{ padding: 14, gap: 8 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                {kid ? `${kid.name.split(' ')[0]}'s pickup` : 'This event'} needs a driver and no one is assigned.
              </Text>
              <DriverChipRow ev={ev} members={members} colors={colors} isDark={isDark}
                activeName={activeName} excludeName={ev.helper} allowGpTeen
                onOpenPool={(kind) => {
                  updateEvent(ev.id, kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true });
                }}
                onAssign={(name, reason) => {
                  notifyTakeover(ev);
                  // Assigning it to yourself IS the confirmation — no separate
                  // "accept" step needed, unlike handing it to someone else
                  // who still needs to acknowledge before it's settled.
                  updateEvent(ev.id, {
                    helper: name, helperStatus: name === activeName ? 'confirmed' : 'pending',
                    notes: reason || undefined,
                  });
                }} />
            </View>
          </View>
        );
      })}

      {conflictEvents.map(ev => {
        const reason = conflictReasons?.get(ev.id);
        return (
        <View key={ev.id} style={{
          backgroundColor: isDark ? colors.warning + '14' : colors.warningLight,
          borderRadius: 16, borderWidth: 1.5, borderColor: colors.warning + '60', overflow: 'hidden',
        }}>
          <View style={{ backgroundColor: colors.warning, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
            <AlertTriangle size={15} color="#fff" />
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
              {reason ?? 'Schedule Conflict'} — {ev.title}
            </Text>
            <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.9)', fontWeight: '700' }}>{fmtTime(ev.time)}</Text>
          </View>
          <View style={{ padding: 14, gap: 8 }}>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
              {reason ?? 'This event overlaps with another commitment.'}  Review in Schedule to resolve.
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/calendar')}
              style={{ backgroundColor: colors.warning, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} color="#fff" />
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Open Schedule</Text>
            </Pressable>
          </View>
        </View>
        );
      })}
    </View>
  );
}

// ─── LocationLink (local copy for hub, no external CDN) ───────────────────────

function shortAddress(addr: string, maxLen = 22): string {
  if (addr.length <= maxLen) return addr;
  const parts = addr.split(',');
  const short = parts.length > 1 ? `${parts[0].trim()}, ${parts[1].trim()}` : addr;
  return short.length <= maxLen + 6 ? short : addr.slice(0, maxLen).trimEnd() + '…';
}

function openInMaps(addr: string) {
  const encoded = encodeURIComponent(addr);
  const url = Platform.OS === 'ios'
    ? `https://maps.apple.com/?q=${encoded}`
    : `https://maps.google.com/?q=${encoded}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${encoded}`));
}

function LocationLink({ addr, color, fontSize = 13 }: { addr: string; color: string; fontSize?: number }) {
  return (
    <TouchableOpacity onPress={() => openInMaps(addr)} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize, fontWeight: '600', color, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }} numberOfLines={1}>
        {shortAddress(addr)}
      </Text>
      <Text style={{ fontSize: fontSize - 2, color, opacity: 0.7 }}>↗</Text>
    </TouchableOpacity>
  );
}

// ─── DriverChipRow ────────────────────────────────────────────────────────────
// One horizontal row replacing the old stacked-button flow (Assign to Me /
// Reassign to Someone Else / open picker / pick a name / confirm — up to 4
// taps for the single decision "who's driving"). Tapping any chip commits
// immediately; a reason field only appears afterward, and only when there
// was a prior helper to explain the swap to. "Me" leads when the viewer can
// drive, since taking it yourself is the most common real case.
function DriverChipRow({ ev, members, colors, isDark, activeName, excludeName, allowGpTeen, onAssign, onOpenPool }: {
  ev: FamilyEvent; members: FamilyMember[]; colors: any; isDark: boolean;
  activeName?: string;
  excludeName?: string;
  allowGpTeen: boolean;
  onAssign: (name: string, reason: string) => void;
  onOpenPool: (kind: 'gp' | 'teen') => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const viewer = members.find(m => m.name === activeName);
  const viewerCanDrive = !!viewer && viewer.hasCar !== false && viewer.name !== excludeName;
  const otherParents = members.filter(m =>
    m.role === 'parent' && m.hasCar !== false && m.name !== excludeName && m.name !== activeName
  );

  const chip = (key: string, label: string, Icon: typeof User, onPress: () => void, tone: 'primary' | 'neutral' = 'neutral') => {
    const sel = picked === key;
    const fg = sel ? '#fff' : tone === 'primary' ? colors.parent : colors.textPrimary;
    return (
      <Pressable key={key} onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9,
          borderRadius: 999, borderWidth: 1.5,
          backgroundColor: sel ? colors.parent : tone === 'primary' ? colors.parent + '14' : (isDark ? colors.surface : '#F8FAFC'),
          borderColor: sel ? colors.parent : tone === 'primary' ? colors.parent + '50' : colors.border }}>
        <Icon size={14} color={fg} />
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: fg }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
        {viewerCanDrive && chip('me', 'Me', User, () => setPicked('me'), 'primary')}
        {otherParents.map(m => chip(m.id, m.name.split(' ')[0], User, () => setPicked(m.id)))}
        {allowGpTeen && chip('gp', 'Grandparent', Users, () => onOpenPool('gp'))}
        {allowGpTeen && chip('teen', 'Teen', Backpack, () => onOpenPool('teen'))}
      </ScrollView>
      {picked && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: isDark ? colors.card : '#F1F5F9',
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: colors.border }}>
            <Pencil size={13} color={colors.textTertiary} style={{ marginTop: 3 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Note (optional)
              </Text>
              <TextInput value={reason} onChangeText={setReason}
                placeholder="e.g. Conflict with other pickup…"
                placeholderTextColor={colors.placeholder}
                style={{ fontSize: TYPO.label, color: colors.textPrimary, minHeight: 32 }}
                maxLength={120} multiline />
            </View>
          </View>
          <Pressable
            onPress={() => {
              const name = picked === 'me' ? activeName! : otherParents.find(m => m.id === picked)!.name;
              onAssign(name, reason.trim());
            }}
            style={{ backgroundColor: colors.parent, borderRadius: 12, paddingVertical: 11, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
              Confirm {picked === 'me' ? 'Me' : otherParents.find(m => m.id === picked)?.name.split(' ')[0]}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ─── EventDetailSheet — bottom-sheet modal for full event details + actions ───

export function EventDetailSheet({ ev, members, colors, isDark, activeName, updateEvent, onClose, conflictReason }: {
  ev: FamilyEvent; members: FamilyMember[]; colors: any; isDark: boolean;
  activeName?: string;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  onClose: () => void;
  // Reason string from ParentView's own conflict detection (double-booked
  // kid/helper, or overlap with a work event) — shown as a warning banner
  // when this specific event has one.
  conflictReason?: string;
}) {
  // Whether the driver-chip row is showing — replaces the old multi-button
  // stack (Assign to Me / Reassign to Someone Else / open picker / pick a
  // name / confirm) with one row the viewer taps directly.
  const [changeOpen, setChangeOpen] = useState(false);
  // "Can't Make It" clears ev.helper before the chip row opens, so
  // isSelfAssigned is already false by the time we'd check it here —
  // this remembers who just backed out so the row can exclude them.
  const [cancelledSelfName, setCancelledSelfName] = useState<string | undefined>(undefined);
  const cat          = ev.category ?? 'Event';
  const hours        = hoursUntilEvent(ev.date, ev.time);
  const isPast       = hours < 0;
  const cc           = catColor(cat);

  const allAssignees = ev.memberIds?.length
    ? members.filter(m => ev.memberIds!.includes(m.id))
    : ev.memberId ? members.filter(m => m.id === ev.memberId) : [];

  const forLabel =
    cat === 'Medical' ? 'Patient'   :
    cat === 'Sports'  ? 'Athlete'   :
    cat === 'Study'   ? 'Student'   :
    cat === 'School'  ? 'Student'   :
    cat === 'Ride'    ? 'Attending' :
    cat === 'Work'    ? null        : 'For';

  const helperLabel =
    cat === 'Medical' ? 'Accompanied by' :
    cat === 'Study'   ? 'Tutored by'     :
    cat === 'School'  ? 'Dropped off by' :
    cat === 'Sports'  ? 'Dropped off by' :
    cat === 'Ride'    ? 'Driven by'      :
    'Organised by';

  const isWork         = isWorkEvent(ev);
  // TimelineCard/EventDetailSheet render for every role (kid/teen Hubs use
  // it via HubTimelineSection too, not just ParentView) — but reassigning a
  // helper, opening a slot to GP/Teen, or backing out of one are all parent
  // actions. Derived from members rather than threading a new activeRole
  // prop through three call sites just for this one gate.
  const isViewerParent = members.find(m => m.name === activeName)?.role === 'parent';
  const helperMissing  = !ev.helper && !!ev.location && !isWork && !isHomeLocation(ev.location);
  const helperPending  = ev.helperStatus === 'pending';
  const helperRejected = ev.helperStatus === 'rejected';
  const isSelfAssigned = !!activeName && ev.helper === activeName;
  const hadPriorHelper = !!ev.helper;

  const helperConfirmed = ev.helperStatus === 'confirmed';
  const showRemind    = !isPast && !isWork && isViewerParent && !!ev.helper && helperPending && !isSelfAssigned;
  // helperMissing's "has a real away-from-home location" check exists to
  // avoid flagging events that never needed a helper in the first place —
  // but once someone explicitly backs out via "Can't Make It", the event
  // needs to be reassignable regardless of that heuristic (the helper slot
  // is now genuinely empty by a real action, not just "never set"). "Can't
  // Make It" clears helper AND helperStatus together in one tap, so
  // !ev.helper alone is enough of a signal here.
  // Self-assigned+pending is excluded here — showCantMakeIt already covers
  // that case with clearer "Can't Make It" wording instead of the generic
  // "Reassign to a Parent" label, which would read oddly pointed at yourself.
  // Reassigning/opening-to-GP/opening-to-Teen are parent-only actions —
  // a kid or teen viewing their own event (e.g. their own dentist
  // appointment) shouldn't see controls for picking who drives them.
  const showReassign   = !isPast && !isWork && isViewerParent && (!ev.helper || (helperPending && !isSelfAssigned) || helperRejected);
  // A parent viewing someone ELSE's still-open/pending/rejected slot can take
  // it directly in one tap instead of opening the reassign picker and finding
  // their own name in a list of everyone else — the common case shouldn't be
  // routed through UI built for handing it to a different person. Only makes
  // sense when the viewer themselves has a "Can Drive" flag (hasCar !== false).
  const viewerMember   = members.find(m => m.name === activeName);
  const showAssignToMe = showReassign && !isSelfAssigned && viewerMember?.hasCar !== false;
  // A CONFIRMED slot isn't reassignable through the normal one-tap flow —
  // someone already committed, so overriding them needs a deliberate
  // acknowledgment step, not the same ease as claiming an empty slot. This
  // is the only path back to reassignability besides the confirmed person
  // backing out themselves via Can't Make It.
  const showOverride   = !isPast && !isWork && isViewerParent && helperConfirmed && !isSelfAssigned;
  // Backing out ("I can't make it") applies whether you're confirmed OR
  // still pending on your own assignment — either way it's the same move:
  // clear your own claim, which then unlocks the normal reassign flow
  // (including Open to GP/Teen) for whoever picks it up next.
  const showCantMakeIt = !isPast && !isWork && isSelfAssigned && (helperConfirmed || helperPending);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          {/* Same sheet shape as EventFormModal's own Modal (maxHeight only,
              no minHeight floor) — that's what lets it size to content and
              never fight the keyboard the way AppBottomSheet's measured-
              height layout did for this specific sheet. */}
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingTop: 12, maxHeight: '75%' }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12, backgroundColor: colors.border }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <Text style={{ flex: 1, fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>{ev.title}</Text>
              <Pressable onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ gap: 14 }}>
          {/* Category pill — the title itself already lives in AppBottomSheet's
              own fixed header, so it isn't repeated here. */}
          <View style={{ flexDirection: 'row' }}>
            <View style={{ backgroundColor: cc + '20', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: cc + '45' }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: cc, textTransform: 'uppercase', letterSpacing: 0.6 }}>{cat}</Text>
            </View>
          </View>

          {/* Time */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calendar size={14} color={cc} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
              {fmtTime(ev.time)}
            </Text>
            {isPast && (
              <View style={{ backgroundColor: colors.success + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.success }}>Done</Text>
              </View>
            )}
          </View>

          {/* Conflict banner — same detection ParentView already runs for the
              top-of-Hub AlertBanner, surfaced here too so the reason is
              visible right where the reassign action lives. */}
          {conflictReason && !isPast && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: colors.danger + '12', borderRadius: 12, padding: 10,
              borderWidth: 1, borderColor: colors.danger + '35' }}>
              <AlertTriangle size={15} color={colors.danger} />
              <Text style={{ flex: 1, fontSize: TYPO.label, fontWeight: '700', color: colors.danger }}>{conflictReason}</Text>
            </View>
          )}

          {/* For / assignees — bumped */}
          {forLabel && allAssignees.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{forLabel}:</Text>
              {allAssignees.map(m => (
                <FamilyAvatar key={m.id} name={m.name} emoji={m.emoji} size={24} ringColor={cc} ringWidth={1.5} />
              ))}
            </View>
          )}

          {/* Location */}
          {ev.location && !isHomeLocation(ev.location) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MapPin size={14} color={isDark ? '#34D399' : '#059669'} />
              <LocationLink addr={ev.location} color={isDark ? '#34D399' : '#059669'} fontSize={TYPO.caption} />
            </View>
          )}

          {/* Category-specific fields */}
          {cat === 'Medical' && ev.doctorName && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              🩺 Doctor: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{ev.doctorName}</Text>
            </Text>
          )}
          {cat === 'Study' && ev.subject && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              📖 Subject: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{ev.subject}</Text>
            </Text>
          )}
          {cat === 'Sports' && ev.coachName && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              🏅 Coach: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{ev.coachName}</Text>
            </Text>
          )}
          {(cat === 'Ride' || cat === 'Sports') && (ev.pickupLocation || ev.dropLocation) && (
            <View style={{ gap: 4 }}>
              {ev.pickupLocation && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={13} color={isDark ? '#34D399' : '#059669'} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>From: </Text>
                  <LocationLink addr={ev.pickupLocation} color={isDark ? '#34D399' : '#059669'} fontSize={TYPO.label} />
                </View>
              )}
              {ev.dropLocation && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={13} color={isDark ? '#34D399' : '#059669'} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>To: </Text>
                  <LocationLink addr={ev.dropLocation} color={isDark ? '#34D399' : '#059669'} fontSize={TYPO.label} />
                </View>
              )}
            </View>
          )}

          {/* Helper section */}
          {ev.helper && !ev.approvalPending && (() => {
            const helperMember = members.find(m => m.name === ev.helper);
            const isRejected = ev.helperStatus === 'rejected';
            const isPending  = ev.helperStatus === 'pending';
            // A declined driver is a scheduling problem for a PARENT to
            // solve — to a kid it should read as "no driver yet," not a
            // five-alarm fire on their own Hub. Only the parent-facing
            // treatment gets the red/danger styling, "!" badge, and reason.
            const showAlarm  = isRejected && isViewerParent;
            const borderCol  = showAlarm ? colors.danger + '40' : isPending ? colors.warning : isRejected ? colors.border : colors.success;
            const bgCol      = showAlarm ? (isDark ? colors.danger + '14' : colors.dangerLight) : isPending ? (isDark ? colors.warning + '14' : colors.warningLight) : (isDark ? colors.surface : '#F8FAFC');
            return (
            <View style={{ backgroundColor: bgCol, borderRadius: 14, borderWidth: 1, borderColor: borderCol, paddingHorizontal: 14, paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {/* Avatar with warning badge */}
                <View style={{ position: 'relative' }}>
                  <FamilyAvatar
                    name={ev.helper} emoji={helperMember?.emoji} avatarUrl={helperMember?.avatarUrl}
                    siblings={members.map(m => m.name)} size={36}
                    ringColor={showAlarm ? colors.danger : isPending ? colors.warning : isRejected ? colors.border : colors.success}
                    ringWidth={2}
                  />
                  {showAlarm && (
                    <View style={{
                      position: 'absolute', top: -3, right: -3,
                      backgroundColor: colors.danger, borderRadius: 8,
                      width: 16, height: 16,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 2, borderColor: isDark ? colors.card : '#fff',
                    }}>
                      <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>!</Text>
                    </View>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{helperLabel}</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: showAlarm ? colors.danger : colors.textPrimary }}>
                    {relationalNameByName(ev.helper, members)}
                  </Text>
                  {showAlarm && ev.declineReason && (
                    <Text style={{ fontSize: TYPO.label, color: colors.danger, marginTop: 2 }}>
                      "{ev.declineReason}"
                    </Text>
                  )}
                </View>

                {ev.helperStatus === 'confirmed' && (
                  <View style={{ backgroundColor: isDark ? colors.successDark + '30' : colors.successLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.success }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.success }}>Confirmed ✓</Text>
                  </View>
                )}
                {isPending && (
                  <View style={{ backgroundColor: isDark ? colors.warning + '18' : colors.warningLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.warning }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.warningDark }}>⏳ Awaiting</Text>
                  </View>
                )}
                {isRejected && !showAlarm && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary }}>No driver yet</Text>
                  </View>
                )}
                {showAlarm && (
                  <View style={{ backgroundColor: colors.danger + '25', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.danger + '40' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.danger }}>Declined ✕</Text>
                  </View>
                )}
              </View>
              {/* Compact icon row — remind / take over / swap all live right on
                  the helper card instead of as separate full-width buttons
                  below, so managing an already-assigned slot is a tap on the
                  card itself, not a scroll down to a second section. */}
              {!isPast && !isSelfAssigned && (showRemind || showAssignToMe || showReassign || showOverride) && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: borderCol }}>
                  {showRemind && (
                    <Pressable
                      onPress={() => { Alert.alert('Reminder Sent', `A nudge was sent to ${relationalNameByName(ev.helper, members)}.`); onClose(); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.warning + '18' }}>
                      <Bell size={13} color={colors.warningDark} />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.warningDark }}>Remind</Text>
                    </Pressable>
                  )}
                  {(showAssignToMe || showReassign) && (
                    <Pressable onPress={() => setChangeOpen(v => !v)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                        backgroundColor: helperRejected ? colors.danger + '18' : colors.parent + '14' }}>
                      {helperRejected ? <Repeat size={13} color={colors.danger} /> : <User size={13} color={colors.parent} />}
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: helperRejected ? colors.danger : colors.parent }}>
                        {helperRejected ? 'Swap' : 'Take Over'}
                      </Text>
                    </Pressable>
                  )}
                  {/* Overriding a CONFIRMED commitment needs a deliberate
                      acknowledgment, unlike taking an empty/pending slot —
                      Alert.alert forces a second tap before changeOpen. */}
                  {showOverride && (
                    <Pressable
                      onPress={() => {
                        Alert.alert(
                          'Override Confirmed Ride?',
                          `${relationalNameByName(ev.helper, members)} already confirmed this. Only change it if there's a real problem.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Yes, Reassign', style: 'destructive', onPress: () => setChangeOpen(true) },
                          ]
                        );
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.danger + '18' }}>
                      <Repeat size={13} color={colors.danger} />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.danger }}>Override</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
            );
          })()}

          {/* Notes */}
          {ev.notes && (
            <View style={{ backgroundColor: isDark ? '#1E1B4B' : '#F0F0FE', borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#4338CA50' : '#C7D2FE', padding: 12 }}>
              <Text style={{ fontSize: TYPO.caption, color: isDark ? '#C4B5FD' : '#4338CA', lineHeight: 20 }}>
                📝 "{ev.notes}"
              </Text>
            </View>
          )}

          {/* Actions — a single decision ("who's driving") surfaced as one
              chip row instead of a stack of buttons that each led to their
              own sub-screen. Empty/rejected slots show the row immediately;
              an already-assigned slot only shows it after tapping Take
              Over/Swap on the helper card above. */}
          {!isPast && (
            <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
              {/* "Can't Make It" opens the chip row WITHOUT writing anything
                  yet — no DB write means no other device can briefly see
                  "you declined yourself" flash by before a replacement is
                  picked. Two resolutions: pick a replacement → one combined
                  write (helper changes, never touches 'rejected' at all);
                  back out of the row without picking → THEN write the
                  decline, which routes through eventStore's auto-open-to-
                  GP/Teen-pool-on-decline as the fallback. */}
              {showCantMakeIt && !changeOpen && (
                <Pressable
                  onPress={() => {
                    setCancelledSelfName(activeName);
                    setChangeOpen(true);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: colors.danger + '12', borderRadius: 14, paddingVertical: 12,
                    borderWidth: 1, borderColor: colors.danger + '35' }}>
                  <X size={15} color={colors.danger} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>Can't Make It</Text>
                </Pressable>
              )}
              {/* Empty/missing slot with no prior helper — show the chip row
                  directly, no extra tap to reveal it first. Rejected/taken-
                  over cases route through changeOpen (set by the helper
                  card's Take Over/Swap button above). Confirmed slots only
                  reach here via showOverride, after the Alert.alert
                  acknowledgment already fired. cancelledSelfName also opens
                  it directly for the Can't Make It path above, even though
                  ev.helper hasn't actually changed yet at that point. */}
              {(showReassign || showOverride || (changeOpen && !!cancelledSelfName)) && (!hadPriorHelper ? true : changeOpen) && (
                <View style={{ gap: 10 }}>
                  {changeOpen && (
                    <Pressable onPress={() => {
                      // Backing out of the chip row without picking anyone
                      // is the actual decline — write it now, not before.
                      if (cancelledSelfName) {
                        updateEvent(ev.id, { helperStatus: 'rejected', declinedBy: cancelledSelfName });
                      }
                      setChangeOpen(false);
                      setCancelledSelfName(undefined);
                    }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
                      <ChevronDown size={14} color={colors.textTertiary} />
                      <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontWeight: '700' }}>
                        {cancelledSelfName ? "I can't make it — no replacement yet" : 'Cancel'}
                      </Text>
                    </Pressable>
                  )}
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    {helperMissing || !hadPriorHelper || cancelledSelfName ? 'Who\'s driving?' : 'Reassign to'}
                  </Text>
                  <DriverChipRow ev={ev} members={members} colors={colors} isDark={isDark}
                    activeName={activeName}
                    excludeName={cancelledSelfName ?? ev.helper}
                    allowGpTeen={cat !== 'Work'}
                    onOpenPool={(kind) => {
                      updateEvent(ev.id, {
                        ...(kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true }),
                        // Coming from Can't Make It — opening the pool IS
                        // the decline in this path, since no replacement was
                        // picked. Without this, ev.helper would still show
                        // the person who just said they can't make it.
                        ...(cancelledSelfName ? { helperStatus: 'rejected' as const, declinedBy: cancelledSelfName } : {}),
                      });
                      Alert.alert(kind === 'gp' ? 'Opened to Grandparents' : 'Opened to Teens',
                        `Any eligible ${kind === 'gp' ? 'grandparent' : 'teen'} can now claim "${ev.title}" from their own Hub.`);
                      onClose();
                    }}
                    onAssign={(name, reason) => {
                      const priorHelperName = ev.helper;
                      // Assigning it to yourself IS the confirmation — no
                      // separate "accept" step needed (see HelperEventCard's
                      // backlog card, which otherwise asks for one).
                      updateEvent(ev.id, {
                        helper: name, helperStatus: name === activeName ? 'confirmed' : 'pending',
                        notes: reason
                          ? `${cancelledSelfName ?? activeName ?? 'Parent'} can't do "${helperLabel}" — "${reason}"`
                          : undefined,
                      });
                      // Whoever had it (especially a GP/teen who claimed it
                      // through the open pool) only finds out it moved by
                      // checking their own Hub again unless we say so out
                      // loud — a chat post covers every viewer at once, same
                      // as the En Route hand-off broadcasts.
                      if (priorHelperName && priorHelperName !== name && viewerMember) {
                        useChatStore.getState().sendMessage('all', viewerMember.id,
                          `🔄 ${relationalNameByName(name, members)} took over "${ev.title}" (was ${relationalNameByName(priorHelperName, members)}'s)`);
                      }
                      setChangeOpen(false);
                      setCancelledSelfName(undefined);
                      onClose();
                    }} />
                </View>
              )}
            </View>
          )}
        </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── TimelineCard ─────────────────────────────────────────────────────────────
// Compact schedule-list row: time text on the left + thin connecting line,
// category-accented card on the right. Tap opens the detail bottom sheet.

export function TimelineCard({ ev, members, allNames, colors, isDark, updateEvent, activeName, isFirst, isLast, conflictReason }: {
  ev: FamilyEvent; members: FamilyMember[]; allNames: string[];
  colors: any; isDark: boolean;
  activeName?: string;
  isFirst?: boolean; isLast?: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  // Reason string from ParentView's conflict detection, if this event has one.
  conflictReason?: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const cat    = ev.category ?? 'Event';
  const hours  = hoursUntilEvent(ev.date, ev.time);
  const isPast = hours < 0;
  const cc     = catColor(cat);
  const { time, ampm } = fmtTimeParts(ev.time);

  const isWork         = isWorkEvent(ev);
  const helperMissing  = !ev.helper && !!ev.location && !isWork && !isHomeLocation(ev.location);
  const helperPending  = ev.helperStatus === 'pending';
  const helperRejected = ev.helperStatus === 'rejected';
  // A declined driver is a parent-level scheduling problem — to a kid/teen
  // it should read as "no driver yet," not an alarming red flag on their
  // own timeline. Only the parent-facing card gets the loud treatment;
  // helperMissing (no driver ever set) stays neutral for everyone already.
  const isViewerParent = members.find(m => m.name === activeName)?.role === 'parent';
  const showAlarm      = helperRejected && isViewerParent;
  const hasIssue        = helperMissing || showAlarm;

  const forLabel =
    cat === 'Medical' ? 'Patient'   :
    cat === 'Sports'  ? 'Athlete'   :
    cat === 'Study'   ? 'Student'   :
    cat === 'School'  ? 'Student'   :
    cat === 'Ride'    ? 'Attending' :
    cat === 'Work'    ? null        : 'For';

  const helperLabel =
    cat === 'Medical' ? 'Accompanied by' :
    cat === 'Study'   ? 'Tutored by'     :
    cat === 'School'  ? 'Dropped off by' :
    cat === 'Sports'  ? 'Dropped off by' :
    cat === 'Ride'    ? 'Driven by'      :
    'Organised by';

  const allAssignees = ev.memberIds?.length
    ? members.filter(m => ev.memberIds!.includes(m.id))
    : ev.memberId ? members.filter(m => m.id === ev.memberId) : [];

  const LINE_COLOR = isDark ? colors.primary + '35' : colors.primary + '25';

  return (
    <>
      <View style={{ flexDirection: 'row', minHeight: 64, opacity: isPast ? 0.45 : 1 }}>

        {/* Col 1: time + AM/PM + line, all centered on the same axis */}
        <View style={{ width: 54, alignItems: 'center', paddingTop: 14 }}>
          <Text style={{ fontFamily: MONO_FONT, fontSize: 12, fontWeight: '900', color: isPast ? colors.textTertiary : cc, lineHeight: 15, textAlign: 'center' }}>{time}</Text>
          <Text style={{ fontSize: 9, fontWeight: '700', color: isPast ? colors.textTertiary : cc + 'CC', lineHeight: 11, textAlign: 'center' }}>{ampm}</Text>
          {!isLast && (
            <View style={{ flex: 1, width: 1.5, marginTop: 6, backgroundColor: LINE_COLOR }} />
          )}
        </View>

        {/* Col 2: event card */}
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => setSheetOpen(true)}
          style={{
            flex: 1, marginLeft: 8, marginBottom: isLast ? 4 : 10,
            backgroundColor: isDark ? colors.card : '#FFFFFF',
            borderRadius: 14, borderWidth: 1,
            borderColor: (hasIssue && !isPast) ? colors.danger + '45'
                       : (helperPending && !isPast) ? colors.warning + '45'
                       : (isDark ? colors.border : 'rgba(225,218,203,0.7)'),
            borderLeftWidth: 3,
            borderLeftColor: (hasIssue && !isPast) ? colors.danger
                           : (helperPending && !isPast) ? colors.warning
                           : cc,
            paddingHorizontal: 12, paddingVertical: 10, gap: 5,
            // Kinfolk "tactile card" elevation — flat borders alone read too
            // plain against the warm cashmere background on a real device.
            shadowColor: isDark ? '#000' : 'rgba(80,60,40,0.10)',
            shadowOpacity: isPast ? 0 : (isDark ? 0.4 : 1),
            shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
            elevation: isPast ? 0 : (isDark ? 3 : 2),
          }}>

          {/* Row 1: category chip + title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ backgroundColor: cc + '1A', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: cc + '44' }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: cc, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {isPast ? '✓ Done' : cat}
              </Text>
            </View>
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
              {ev.title}
            </Text>
          </View>

          {/* Row 2: For label + assignee chips + location */}
          {forLabel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>{forLabel}:</Text>
              {allAssignees.length > 0 ? allAssignees.map(m => (
                <FamilyAvatar key={m.id} name={m.name} emoji={m.emoji} size={18} ringColor={cc} ringWidth={1.5} />
              )) : (
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>—</Text>
              )}
              {ev.location && !isHomeLocation(ev.location) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <MapPin size={11} color={isDark ? '#34D399' : '#059669'} />
                  <LocationLink addr={ev.location} color={isDark ? '#34D399' : '#059669'} fontSize={TYPO.label} />
                </View>
              )}
            </View>
          )}

          {/* Row 3: helper status */}
          {ev.helper && !ev.approvalPending && (() => {
            const helperMember = members.find(m => m.name === ev.helper);
            return (
            <View style={{ gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Avatar with warning badge overlay when declined */}
              <View style={{ position: 'relative' }}>
                <FamilyAvatar
                  name={ev.helper} emoji={helperMember?.emoji} avatarUrl={helperMember?.avatarUrl}
                  siblings={allNames} size={26}
                  ringColor={showAlarm ? colors.danger : helperPending ? colors.warning : helperRejected ? colors.border : colors.success}
                  ringWidth={2}
                />
                {showAlarm && (
                  <View style={{
                    position: 'absolute', top: -3, right: -3,
                    backgroundColor: colors.danger, borderRadius: 7,
                    width: 14, height: 14,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: isDark ? colors.card : '#fff',
                  }}>
                    <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900', lineHeight: 10 }}>!</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: TYPO.label, color: showAlarm ? colors.danger : colors.textSecondary, flex: 1 }}>
                {helperLabel}{' '}
                <Text style={{ fontWeight: '700', color: showAlarm ? colors.danger : colors.textPrimary }}>{relationalNameByName(ev.helper, members)}</Text>
              </Text>
              {ev.helperStatus === 'confirmed' && (
                <View style={{ backgroundColor: colors.success + '18', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.success }}>Confirmed ✓</Text>
                </View>
              )}
              {ev.helperStatus === 'pending' && (
                <View style={{ backgroundColor: colors.warning + '20', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.warningDark }}>⏳ Awaiting</Text>
                </View>
              )}
              {ev.helperStatus === 'rejected' && !showAlarm && (
                <View style={{ backgroundColor: colors.surface, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.textTertiary }}>No driver yet</Text>
                </View>
              )}
              {showAlarm && (
                <View style={{ backgroundColor: colors.danger + '25', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.danger + '40' }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.danger }}>Declined ✕</Text>
                </View>
              )}
            </View>
            {showAlarm && ev.declineReason && (
              <Text style={{ fontSize: TYPO.micro, color: colors.danger, fontStyle: 'italic' }}>
                "{ev.declineReason}"
              </Text>
            )}
            </View>
            );
          })()}

          {/* Needs driver warning — no helper assigned at all */}
          {!isPast && helperMissing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: colors.danger + '12', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
              borderWidth: 1, borderColor: colors.danger + '30' }}>
              <AlertTriangle size={11} color={colors.danger} />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger }}>No driver assigned — tap to fix</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {sheetOpen && (
        <EventDetailSheet
          ev={ev} members={members} colors={colors} isDark={isDark}
          activeName={activeName} updateEvent={updateEvent}
          onClose={() => setSheetOpen(false)}
          conflictReason={conflictReason}
        />
      )}
    </>
  );
}

// ─── PickupRadarStatus ────────────────────────────────────────────────────────
// Read-only view of an active trip, for whoever isn't the driver — the kid
// being picked up, other parents, siblings. Same visual language as
// EnRouteBanner's active state (driver/kid emojis, countdown, overdue
// styling) but no ETA slider or Pickup Done button, since only the driver
// controls those.

export function PickupRadarStatus({ colors, isDark, activeTrip }: {
  colors: any; isDark: boolean;
  activeTrip: { kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; etaMinutes: number; startedAtMs?: number };
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const elapsedMin = activeTrip.startedAtMs ? (now - activeTrip.startedAtMs) / 60_000 : 0;
  const remainingMin = Math.max(0, Math.ceil(activeTrip.etaMinutes - elapsedMin));
  const progress = Math.max(0, Math.min(1, elapsedMin / Math.max(activeTrip.etaMinutes, 1)));
  const isOverdue = elapsedMin - activeTrip.etaMinutes >= 5;
  const activeColor = isOverdue ? colors.danger : colors.success;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        icon={<Car size={16} color={colors.success} />}
        title="Pick-up Radar"
        accent={colors.success}
        headerAccessory={activeTrip.kidEmoji ? <Text style={{ fontSize: 14 }}>{activeTrip.kidEmoji}</Text> : undefined}
        statusBadge={isOverdue ? 'Overdue' : 'En Route'}
        badgeColor={activeColor}
        colors={colors} isDark={isDark}>
        <View style={{
          backgroundColor: isDark ? activeColor + '15' : (isOverdue ? colors.dangerLight : colors.successLight),
          borderRadius: 16, borderWidth: 1, borderColor: activeColor + '40',
          padding: 14, gap: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 22 }}>{activeTrip.driverEmoji ?? '🚗'}</Text>
            <Navigation size={14} color={activeColor} />
            <Text style={{ fontSize: 22 }}>{activeTrip.kidEmoji ?? '🧒'}</Text>
            <Text style={{ flex: 1, marginLeft: 2, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
              {activeTrip.driverName} picking up {activeTrip.kidName}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: activeColor + '25', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: activeColor, borderRadius: 3 }} />
          </View>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: activeColor, textAlign: 'right' }}>
            {remainingMin > 0 ? `${remainingMin} min left` : isOverdue ? 'Overdue' : 'Arriving now'}
          </Text>
        </View>
      </SectionCard>
    </View>
  );
}

// ─── EnRouteModal ─────────────────────────────────────────────────────────────

export function EnRouteModal({ visible, onClose, pickups, driverName, prefillMemberId, onDispatch }: {
  visible: boolean; onClose: () => void;
  // Every family member En Route could be picking up — kids AND adults
  // (e.g. one parent picking up another, or a grandparent).
  pickups: FamilyMember[]; driverName: string;
  // Pre-select a person when opening from a known ride (Pick-up Radar's
  // "Up Next" card) instead of making the driver pick from scratch.
  prefillMemberId?: string;
  onDispatch: (person: FamilyMember | null, etaMinutes: number) => void;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [etaMinutes, setEtaMinutes] = useState(10);
  const ETAS = [5, 10, 15, 20, 30, 45];
  const allNames = pickups.map(k => k.name);

  useEffect(() => {
    if (visible) setSelected(prefillMemberId ?? null);
  }, [visible, prefillMemberId]);

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Dispatch En Route"
      subtitle={`Notify family ${driverName} is on the way`}
      accentColor={colors.success}
      footer={
        <Pressable onPress={() => {
          const person = selected ? pickups.find(k => k.id === selected) ?? null : null;
          onDispatch(person, etaMinutes);
          onClose();
        }} style={{ backgroundColor: colors.success, borderRadius: 16, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Navigation size={18} color="#fff" />
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Send En Route Ping</Text>
        </Pressable>
      }
    >
        <SectionLabel label="Picking up" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {pickups.map(k => {
            const sel = selected === k.id;
            return (
              <Pressable key={k.id} onPress={() => setSelected(sel ? null : k.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5,
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: sel ? colors.success : colors.card,
                  borderColor: sel ? colors.success : colors.border }}>
                <FamilyAvatar name={k.name} emoji={k.emoji} avatarUrl={k.avatarUrl}
                  siblings={allNames} size={24} ringColor={sel ? '#fff' : colors.success} ringWidth={1} />
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
            <Pressable key={e} onPress={() => setEtaMinutes(e)}
              style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, borderWidth: 1,
                backgroundColor: etaMinutes === e ? colors.success : colors.card,
                borderColor: etaMinutes === e ? colors.success : colors.border }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: etaMinutes === e ? '#fff' : colors.textSecondary }}>{e} min</Text>
            </Pressable>
          ))}
        </View>
    </AppBottomSheet>
  );
}

const sc = StyleSheet.create({
  sectionLabel: {
    fontSize: TYPO.label, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 10,
  },
});
