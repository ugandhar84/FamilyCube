/**
 * Shared primitive components for the Hub feature.
 * SectionCard, CollapsibleCard, SubCard, AlertBanner, TimelineCard, EnRouteModal.
 */
import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert, ScrollView, Platform, Linking, TouchableOpacity, Modal, KeyboardAvoidingView, Animated, Easing, Keyboard } from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import {
  ChevronDown, ChevronUp, Pencil, Calendar,
  MapPin, AlertOctagon, Car, Navigation, AlertTriangle, X, User,
  Users, Backpack, Bell, Repeat, Check,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, LETTER_SPACING } from '@/constants/theme';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';
import { eventAssignee } from '@/store/eventStore';
import type { FamilyEvent } from '@/store/eventStore';
import { fmtTime, hoursUntilEvent, catColor, isWorkEvent, isHomeLocation } from './hubUtils';
import { EventCardRow } from '@/features/calendar/components/EventCard';
import { fmtDateShort } from '@/lib/dates';
import { relationalNameByName } from '@/lib/format';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/lib/supabase';
import { decryptLocationText } from '@/lib/locationCrypto';

// ─── LiveDot ──────────────────────────────────────────────────────────────────
// Pulsing dot for "LIVE NOW" indicators — a soft outward ring pulse behind a
// solid center dot, looping, so the marker reads as actually live rather
// than a static status icon.
export function LiveDot({ color, size = 7 }: { color: string; size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.15, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity: ringOpacity, transform: [{ scale: ringScale }],
      }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

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

// Was a no-op — the previous assignee, the kid, and any other parent got
// zero signal when a ride was reassigned out from under the current
// assignee (QA sweep High Finding H1). Shared at module level since two
// separate components (AlertBanner and EventDetailSheet) both drive
// DriverChipRow's onAssign. Call BEFORE updateEvent so `ev` still holds
// the outgoing assignee's name.
function notifyTakeover(ev: FamilyEvent, newName: string, members: FamilyMember[], activeName?: string) {
  const prevName = ev.helper ?? ev.driverName;
  if (!prevName || prevName === newName) return;
  const actor = members.find(m => m.name === activeName);
  const prevMember = members.find(m => m.name === prevName);
  const msg = `🔄 ${relationalNameByName(newName, members)} is now driving "${ev.title}" instead of ${relationalNameByName(prevName, members)}.`;
  const recipients = new Set<string>();
  if (prevMember && prevMember.id !== actor?.id) recipients.add(prevMember.id);
  if (ev.memberId && ev.memberId !== actor?.id) recipients.add(ev.memberId);
  for (const recipientId of recipients) {
    useChatStore.getState().sendMessage(recipientId, actor?.id ?? recipientId, msg);
  }
}

export function AlertBanner({
  conflictEvents, rejectedEvents, pendingNoResponseEvents = [], unassignedUrgentEvents = [],
  neverDispatchedEvents = [],
  conflictReasons, members, colors, isDark, updateEvent, activeName, onDispatch,
}: {
  conflictEvents: FamilyEvent[]; rejectedEvents: FamilyEvent[];
  pendingNoResponseEvents?: FamilyEvent[]; unassignedUrgentEvents?: FamilyEvent[];
  neverDispatchedEvents?: FamilyEvent[];
  conflictReasons?: Map<string, string>;
  members: FamilyMember[]; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  // Viewer's own name — lets each urgent card offer a direct "Assign to Me"
  // instead of routing the common "I'll just take it" case through the full
  // reassign picker.
  activeName?: string;
  // Lets the confirmed driver start the trip directly from their own
  // never-dispatched card, instead of having to scroll down to Pick-up
  // Radar and find the right nextRide slot themselves.
  onDispatch?: (memberId: string | undefined, etaMinutes: number) => void;
}) {
  const viewer = members.find(m => m.name === activeName);

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, gap: 8 }}>
      {rejectedEvents.filter(ev => { const h = hoursUntilEvent(ev.date, ev.time); return h >= 0 && h < 4; }).map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        // These 3 cards previously read/wrote ev.helper unconditionally —
        // now that pendingNoResponse/unassignedUrgent/rejectedHelperEvents
        // (ParentView.tsx) are field-pair-aware via eventAssignee(), these
        // lists actually include driverName-based events (every kid ride
        // request), so the cards themselves need to match (QA sweep,
        // kid-role audit finding, extended to all 3 AlertBanner cards).
        const assignee = eventAssignee(ev);
        const assigneeRole: 'helper' | 'driver' = ev.driverName || (ev.rideRequired && !ev.helper) ? 'driver' : 'helper';
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
                <Text style={{ fontWeight: '700', color: colors.danger }}>{relationalNameByName(assignee.name, members)}</Text> declined
                {ev.declineReason ? `: "${ev.declineReason}"` : ''}
              </Text>
              {kid && ev.location && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{ev.location} · For {kid.name.split(' ')[0]}</Text>
                </View>
              )}
              <DriverChipRow ev={ev} members={members} colors={colors} isDark={isDark}
                activeName={activeName} excludeName={assignee.name} allowGpTeen
                onOpenPool={(kind) => {
                  updateEvent(ev.id, kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true });
                }}
                onAssign={(name, reason) => {
                  notifyTakeover(ev, name, members, activeName);
                  // Assigning it to yourself IS the confirmation — no separate
                  // "accept" step needed, unlike handing it to someone else
                  // who still needs to acknowledge before it's settled.
                  updateEvent(ev.id, {
                    ...(assigneeRole === 'driver'
                      ? { driverName: name, driverStatus: name === activeName ? 'confirmed' as const : 'pending' as const }
                      : { helper: name, helperStatus: name === activeName ? 'confirmed' as const : 'pending' as const }),
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
        const assignee = eventAssignee(ev);
        const assigneeRole: 'helper' | 'driver' = ev.driverName || (ev.rideRequired && !ev.helper) ? 'driver' : 'helper';
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
                <Text style={{ fontWeight: '700', color: colors.warning }}>{relationalNameByName(assignee.name, members)}</Text> hasn't replied.
                {kid ? ` Pickup for ${kid.name.split(' ')[0]} is in under an hour.` : ' Event is in under an hour.'}
              </Text>
              <DriverChipRow ev={ev} members={members} colors={colors} isDark={isDark}
                activeName={activeName} excludeName={assignee.name} allowGpTeen
                onOpenPool={(kind) => {
                  updateEvent(ev.id, kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true });
                }}
                onAssign={(name, reason) => {
                  notifyTakeover(ev, name, members, activeName);
                  // Assigning it to yourself IS the confirmation — no separate
                  // "accept" step needed, unlike handing it to someone else
                  // who still needs to acknowledge before it's settled.
                  updateEvent(ev.id, {
                    ...(assigneeRole === 'driver'
                      ? { driverName: name, driverStatus: name === activeName ? 'confirmed' as const : 'pending' as const }
                      : { helper: name, helperStatus: name === activeName ? 'confirmed' as const : 'pending' as const }),
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
        const assigneeRole: 'helper' | 'driver' = ev.driverName || (ev.rideRequired && !ev.helper) ? 'driver' : 'helper';
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
                activeName={activeName} excludeName={eventAssignee(ev).name} allowGpTeen
                onOpenPool={(kind) => {
                  updateEvent(ev.id, kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true });
                }}
                onAssign={(name, reason) => {
                  notifyTakeover(ev, name, members, activeName);
                  // Assigning it to yourself IS the confirmation — no separate
                  // "accept" step needed, unlike handing it to someone else
                  // who still needs to acknowledge before it's settled.
                  updateEvent(ev.id, {
                    ...(assigneeRole === 'driver'
                      ? { driverName: name, driverStatus: name === activeName ? 'confirmed' as const : 'pending' as const }
                      : { helper: name, helperStatus: name === activeName ? 'confirmed' as const : 'pending' as const }),
                    notes: reason || undefined,
                  });
                }} />
            </View>
          </View>
        );
      })}

      {/* Confirmed driver, scheduled time already passed, no trip ever
          dispatched — the gap between "nobody answered" (No Reply, above)
          and "someone's actually en route" (Pick-up Radar, below). Visible
          to every parent, not just the confirmed driver, so a forgotten
          pickup doesn't sit invisible until the kid themselves notices and
          taps their own manual alert. */}
      {neverDispatchedEvents.map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        const assignee = eventAssignee(ev);
        const isMe = assignee.name === activeName;
        return (
          <View key={`nd-${ev.id}`} style={{
            backgroundColor: isDark ? colors.danger + '14' : colors.dangerLight,
            borderRadius: 16, borderWidth: 1.5, borderColor: colors.danger + '50', overflow: 'hidden',
          }}>
            <View style={{ backgroundColor: colors.danger, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Car size={15} color="#fff" />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                Trip Never Started — {ev.title}
              </Text>
              <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>{fmtTime(ev.time)}</Text>
            </View>
            <View style={{ padding: 14, gap: 8 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                <Text style={{ fontWeight: '700', color: colors.danger }}>{relationalNameByName(assignee.name, members)}</Text> confirmed
                {kid ? ` ${kid.name.split(' ')[0]}'s pickup` : ' this ride'} for {fmtTime(ev.time)}, but never started the trip.
              </Text>
              {isMe && onDispatch ? (
                <Pressable onPress={() => onDispatch(ev.memberId, 10)}
                  style={{ backgroundColor: colors.danger, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Car size={13} color="#fff" />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Start Trip Now</Text>
                </Pressable>
              ) : (
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontStyle: 'italic' }}>
                  Check in with {relationalNameByName(assignee.name, members)} — the pickup may already be handled but never marked En Route.
                </Text>
              )}
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
  // Was never seeded from the event's actual persisted state — reopening
  // this row on an already-assigned or already-open-to-pool event showed
  // NOTHING highlighted, even though the DB already had a real answer.
  // Confirmed/named-driver and open-pool are deliberately different visual
  // treatments (user-confirmed direction): a confirmed specific driver gets
  // the same solid fill a fresh tap would; an open GP/Teen pool gets a
  // distinct "open/pending" outline style instead, since nobody has
  // actually committed yet.
  const assignee = eventAssignee(ev);
  const initialPicked = assignee.name
    ? (assignee.name === activeName ? 'me' : members.find(m => m.name === assignee.name && m.role === 'parent')?.id ?? null)
    : null;
  const [picked, setPicked] = useState<string | null>(initialPicked);
  const [reason, setReason] = useState('');
  const viewer = members.find(m => m.name === activeName);
  const viewerCanDrive = !!viewer && viewer.hasCar !== false && viewer.name !== excludeName;
  const otherParents = members.filter(m =>
    m.role === 'parent' && m.hasCar !== false && m.name !== excludeName && m.name !== activeName
  );
  const gpOpen = !!ev.isOpenToGrandparents && !assignee.name;
  const teenOpen = !!ev.isOpenToTeens && !assignee.name;

  const chip = (key: string, label: string, Icon: typeof User, onPress: () => void, tone: 'primary' | 'neutral' | 'open' = 'neutral') => {
    const sel = picked === key;
    const isOpenTone = tone === 'open' && !sel;
    const fg = sel ? '#fff' : isOpenTone ? colors.warningDark : tone === 'primary' ? colors.parent : colors.textPrimary;
    return (
      <Pressable key={key} onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9,
          borderRadius: 999, borderWidth: 1.5,
          backgroundColor: sel ? colors.parent : isOpenTone ? colors.warning + '18' : tone === 'primary' ? colors.parent + '14' : (isDark ? colors.surface : '#F8FAFC'),
          borderColor: sel ? colors.parent : isOpenTone ? colors.warning : tone === 'primary' ? colors.parent + '50' : colors.border,
          borderStyle: isOpenTone ? 'dashed' : 'solid' }}>
        <Icon size={14} color={fg} />
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: fg }}>
          {label}{isOpenTone ? ' · Open' : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
        {viewerCanDrive && chip('me', 'Me', User, () => setPicked('me'), 'primary')}
        {otherParents.map(m => chip(m.id, m.name.split(' ')[0], User, () => setPicked(m.id)))}
        {allowGpTeen && chip('gp', 'Grandparent', Users, () => onOpenPool('gp'), gpOpen ? 'open' : 'neutral')}
        {allowGpTeen && chip('teen', 'Teen', Backpack, () => onOpenPool('teen'), teenOpen ? 'open' : 'neutral')}
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

export function EventDetailSheet({ ev, members, colors, isDark, activeName, updateEvent, onClose, conflictReason, onEditFull }: {
  ev: FamilyEvent; members: FamilyMember[]; colors: any; isDark: boolean;
  activeName?: string;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  onClose: () => void;
  // Reason string from ParentView's own conflict detection (double-booked
  // kid/helper, or overlap with a work event) — shown as a warning banner
  // when this specific event has one.
  conflictReason?: string;
  // Opens the full edit form (date/time/recurrence/driver/delete) — this
  // sheet previously had NO path there at all, only the narrow accept/
  // decline/reassign actions below. A parent tapping any event card (the
  // default entry point on every calendar view) landed here with no way
  // to actually edit or delete it, only a hidden long-press elsewhere
  // provided that — this makes it a visible, discoverable button instead.
  // Optional + parent-gated by the caller: only CalendarScreen actually
  // has EditEventModal to hand off to; Hub timeline call sites don't pass
  // this and simply don't show the button.
  onEditFull?: () => void;
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
  // QA sweep Critical Finding #1 — this whole section was ev.helper/
  // ev.helperStatus-only, so ANY driverName-based ride (every kid ride
  // request now uses this pair) rendered as if it had no driver at all
  // here, regardless of role — hiding the true state and every action
  // (confirm/decline/take-over/remind) a role should have been able to
  // take from this, the single most common entry point (tapping any event
  // card, on both Hub and Schedule). eventAssignee() normalizes both pairs;
  // assigneeRole tracks which pair to actually write back to.
  const assignee       = eventAssignee(ev);
  const assigneeRole: 'helper' | 'driver' = ev.driverName || (ev.rideRequired && !ev.helper) ? 'driver' : 'helper';
  const helperMissing  = !assignee.name && !!ev.location && !isWork && !isHomeLocation(ev.location);
  const helperPending  = assignee.status === 'pending';
  const helperRejected = assignee.status === 'rejected';
  const isSelfAssigned = !!activeName && assignee.name === activeName;
  const hadPriorHelper = !!assignee.name;

  const helperConfirmed = assignee.status === 'confirmed';
  const showRemind    = !isPast && !isWork && isViewerParent && !!assignee.name && helperPending && !isSelfAssigned;
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
  const showReassign   = !isPast && !isWork && isViewerParent && (!assignee.name || (helperPending && !isSelfAssigned) || helperRejected);
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
  // Decline (Can't Make It) already existed for a self-assigned pending
  // helper, but there was no counterpart accept — the ONLY action a
  // pending assignee could take from this shared detail sheet was to say
  // no. A GP or teen tapping their own event in the Calendar tab, or via
  // their Hub timeline, saw "⏳ Awaiting" with a decline button and
  // nothing else (QA Round 11, High Finding H3).
  const showConfirm = !isPast && !isWork && isSelfAssigned && helperPending;

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
              {onEditFull && isViewerParent && (
                <Pressable onPress={onEditFull} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isDark ? '#1E293B' : '#F1F5F9', marginRight: 8 }}>
                  <Pencil size={16} color={colors.textSecondary} />
                </Pressable>
              )}
              <Pressable onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ gap: 14 }}>
          {/* Category pill — the title itself already lives in AppBottomSheet's
              own fixed header, so it isn't repeated here. */}
          <View style={{ flexDirection: 'row' }}>
            <View style={{ backgroundColor: cc + '20', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: cc + '45' }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: cc, textTransform: 'uppercase', letterSpacing: 0.6 }}>{cat}</Text>
            </View>
          </View>

          {/* Date + Time */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calendar size={14} color={cc} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
              {fmtDateShort(ev.date)} · {fmtTime(ev.time)}
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

          {/* For / assignees — bumped. A plain attendee (not the named
              driver/helper, who already gets a full accept/decline flow
              elsewhere on this sheet) has no ownership of the event, so
              this is informational + a lightweight Acknowledge, not a
              decision. */}
          {forLabel && allAssignees.length > 0 && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{forLabel}:</Text>
                {allAssignees.map(m => {
                  const acked = ev.acknowledgedBy?.includes(m.id);
                  return (
                    <View key={m.id} style={{ alignItems: 'center' }}>
                      <FamilyAvatar name={m.name} emoji={m.emoji} size={24} ringColor={acked ? '#10B981' : cc} ringWidth={1.5} />
                      {acked && (
                        <View style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6,
                          backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.card }}>
                          <Check size={7} color="#fff" />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
              {!isPast && viewerMember && allAssignees.some(m => m.id === viewerMember.id) &&
                !ev.acknowledgedBy?.includes(viewerMember.id) && !ev.isOptionalRsvp && (
                <Pressable
                  onPress={() => updateEvent(ev.id, { acknowledgedBy: [...(ev.acknowledgedBy ?? []), viewerMember.id] })}
                  style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
                    borderRadius: 10, borderWidth: 1, borderColor: cc + '50', backgroundColor: cc + '12',
                    paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Check size={12} color={cc} />
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: cc }}>Acknowledge</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* RSVP (scenario 2.11) — a real Going/Not-Going/Maybe headcount
              for an event the creator explicitly marked optional, distinct
              from the plain Acknowledge above (which this event type
              doesn't use — see the !ev.isOptionalRsvp guard above). */}
          {ev.isOptionalRsvp && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>
                RSVP{' '}
                <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
                  {(() => {
                    const responses = Object.values(ev.rsvps ?? {});
                    const going = responses.filter(r => r === 'going').length;
                    const maybe = responses.filter(r => r === 'maybe').length;
                    return `${going} going${maybe > 0 ? `, ${maybe} maybe` : ''}`;
                  })()}
                </Text>
              </Text>
              {!isPast && viewerMember && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {([
                    { key: 'going',     label: 'Going',     color: '#10B981' },
                    { key: 'maybe',     label: 'Maybe',     color: colors.warningDark ?? '#D97706' },
                    { key: 'not_going', label: 'Not Going', color: colors.danger },
                  ] as const).map(opt => {
                    const mine = ev.rsvps?.[viewerMember.id] === opt.key;
                    return (
                      <Pressable key={opt.key}
                        onPress={() => updateEvent(ev.id, { rsvps: { ...(ev.rsvps ?? {}), [viewerMember.id]: opt.key } })}
                        style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10,
                          backgroundColor: mine ? opt.color + '20' : colors.surface,
                          borderWidth: 1.5, borderColor: mine ? opt.color : colors.border }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: mine ? opt.color : colors.textPrimary }}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {/* Per-person headcount, visible to everyone (spec: "sees live
                  headcount as others respond"). */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {allAssignees.map(m => {
                  const r = ev.rsvps?.[m.id];
                  const badgeColor = r === 'going' ? '#10B981' : r === 'not_going' ? colors.danger : r === 'maybe' ? (colors.warningDark ?? '#D97706') : colors.textTertiary;
                  return (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                      borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: badgeColor + '15' }}>
                      <FamilyAvatar name={m.name} emoji={m.emoji} size={14} ringColor={badgeColor} ringWidth={1} />
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: badgeColor }}>
                        {m.name.split(' ')[0]} · {r === 'going' ? 'Going' : r === 'not_going' ? 'Not going' : r === 'maybe' ? 'Maybe' : 'Awaiting'}
                      </Text>
                    </View>
                  );
                })}
              </View>
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
          {assignee.name && !ev.approvalPending && (() => {
            const helperMember = members.find(m => m.name === assignee.name);
            const isRejected = assignee.status === 'rejected';
            const isPending  = assignee.status === 'pending';
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
                    name={assignee.name} emoji={helperMember?.emoji} avatarUrl={helperMember?.avatarUrl}
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
                    {relationalNameByName(assignee.name, members)}
                  </Text>
                  {showAlarm && ev.declineReason && (
                    <Text style={{ fontSize: TYPO.label, color: colors.danger, marginTop: 2 }}>
                      "{ev.declineReason}"
                    </Text>
                  )}
                </View>

                {assignee.status === 'confirmed' && (
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
                      onPress={() => { Alert.alert('Reminder Sent', `A nudge was sent to ${relationalNameByName(assignee.name, members)}.`); onClose(); }}
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
                          `${relationalNameByName(assignee.name, members)} already confirmed this. Only change it if there's a real problem.`,
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

          {/* Paired leg indicator — a both-ways ride fork creates 2
              independent rows; without this, opening just one leg's detail
              sheet gives no cue the other half exists (QA sweep UI pass,
              High Finding #4). */}
          {!!ev.linkedLegId && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6366F118', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
              <Repeat size={13} color="#6366F1" />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#6366F1' }}>
                {ev.title.includes('Pickup') ? 'This is the Pickup half of a both-ways ride — there\'s a Drop-off event too.'
                  : ev.title.includes('Drop-off') ? 'This is the Drop-off half of a both-ways ride — there\'s a Pickup event too.'
                  : 'This is paired with another ride leg.'}
              </Text>
            </View>
          )}

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
              {(showConfirm || (showCantMakeIt && !changeOpen)) && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {showConfirm && (
                    <Pressable
                      onPress={() => {
                        supabase.rpc('confirm_event_assignment', {
                          p_event_id: ev.id, p_member_id: viewerMember?.id, p_role: assigneeRole,
                        }).then(({ error }) => {
                          if (error) console.warn('[EventDetailSheet] confirm_event_assignment failed', error.message);
                        });
                      }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        backgroundColor: colors.success + '15', borderRadius: 14, paddingVertical: 12,
                        borderWidth: 1, borderColor: colors.success + '40' }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.success }}>Confirm</Text>
                    </Pressable>
                  )}
                  {showCantMakeIt && !changeOpen && (
                    <Pressable
                      onPress={() => {
                        setCancelledSelfName(activeName);
                        setChangeOpen(true);
                      }}
                      style={{ flex: showConfirm ? 1 : undefined, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        backgroundColor: colors.danger + '12', borderRadius: 14, paddingVertical: 12,
                        borderWidth: 1, borderColor: colors.danger + '35' }}>
                      <X size={15} color={colors.danger} />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>Can't Make It</Text>
                    </Pressable>
                  )}
                </View>
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
                      if (cancelledSelfName && viewerMember) {
                        supabase.rpc('decline_event_assignment', {
                          p_event_id: ev.id, p_member_id: viewerMember.id, p_role: assigneeRole, p_reason: null,
                        }).then(({ error }) => {
                          if (error) console.warn('[EventDetailSheet] decline_event_assignment failed', error.message);
                        });
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
                    excludeName={cancelledSelfName ?? assignee.name}
                    allowGpTeen={cat !== 'Work'}
                    onOpenPool={(kind) => {
                      // Coming from Can't Make It — opening the pool IS the
                      // decline in this path, since no replacement was
                      // picked. decline_event_assignment already
                      // auto-opens BOTH GP and Teen pools for a Ride/
                      // rideRequired event, so route through it whenever
                      // this is genuinely a decline; otherwise it's just a
                      // parent manually opening one specific pool kind with
                      // no decline involved — a plain scoped write, no RPC
                      // needed for that narrower case yet.
                      if (cancelledSelfName && viewerMember) {
                        supabase.rpc('decline_event_assignment', {
                          p_event_id: ev.id, p_member_id: viewerMember.id, p_role: assigneeRole, p_reason: null,
                        }).then(({ error }) => {
                          if (error) console.warn('[EventDetailSheet] decline_event_assignment (open pool) failed', error.message);
                        });
                      } else {
                        updateEvent(ev.id, kind === 'gp' ? { isOpenToGrandparents: true } : { isOpenToTeens: true });
                      }
                      Alert.alert(kind === 'gp' ? 'Opened to Grandparents' : 'Opened to Teens',
                        `Any eligible ${kind === 'gp' ? 'grandparent' : 'teen'} can now claim "${ev.title}" from their own Hub.`);
                      onClose();
                    }}
                    onAssign={(name, reason) => {
                      notifyTakeover(ev, name, members, activeName);
                      // Assigning it to yourself IS the confirmation — no
                      // separate "accept" step needed (see HelperEventCard's
                      // backlog card, which otherwise asks for one).
                      // onAssign gives a NAME, not a member id — reassign_event
                      // takes a member id, so resolve it first. An external
                      // name with no matching member row (e.g. someone typed
                      // into a free-text driver field) has no RPC path yet;
                      // falls back to the old direct write for that case only.
                      const targetMember = members.find(m => m.name === name);
                      if (targetMember) {
                        supabase.rpc('reassign_event', {
                          p_event_id: ev.id, p_new_member_id: targetMember.id, p_role: assigneeRole, p_actor_id: viewerMember?.id ?? targetMember.id,
                        }).then(({ error }) => {
                          if (error) console.warn('[EventDetailSheet] reassign_event failed', error.message);
                        });
                      } else {
                        updateEvent(ev.id, assigneeRole === 'driver'
                          ? { driverName: name, driverStatus: name === activeName ? 'confirmed' as const : 'pending' as const }
                          : { helper: name, helperStatus: name === activeName ? 'confirmed' as const : 'pending' as const });
                      }
                      if (reason) {
                        updateEvent(ev.id, { notes: `${cancelledSelfName ?? activeName ?? 'Parent'} can't do "${helperLabel}" — "${reason}"` });
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

  const isPast = hoursUntilEvent(ev.date, ev.time) < 0;
  const isViewerParent = members.find(m => m.name === activeName)?.role === 'parent';

  return (
    <>
      {/* Card sits flush with the section's own 16px frame — the card's
          own time chip (from EventCardRow) replaces the old separate
          time-axis column, so nothing needs to be inset for it. */}
      <View style={{ marginBottom: isLast ? 4 : 10, opacity: isPast ? 0.45 : 1 }}>
        <EventCardRow
          ev={ev} members={members} colors={colors} isDark={isDark}
          onPress={() => setSheetOpen(true)}
          timeStyle="boxed" showCategory showLocation
          showHelperStatus isViewerParent={isViewerParent}
        />
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
  activeTrip: { kidName: string; kidEmoji?: string; driverName: string; driverEmoji?: string; driverMemberId?: string; etaMinutes: number; startedAtMs?: number };
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Driver's live position, if they're sharing — same member_locations read
  // EnRouteBanner's active-driver view already has, just never ported to
  // this read-only counterpart. Without this, the driver was the only
  // person who ever saw "near {address}" on their own Pick-up Radar card —
  // the other parent, the kid being picked up, and any GP watching the same
  // trip only ever got a synthetic ETA countdown with zero live location,
  // even though the underlying GPS data was being written the whole time
  // (QA launch-readiness sweep — reported by the user as "the other parent
  // and kids aren't seeing the driver's live location").
  const [driverAddress, setDriverAddress] = useState<string | null>(null);
  const driverMemberId = activeTrip.driverMemberId;
  useEffect(() => {
    if (!driverMemberId) { setDriverAddress(null); return; }
    let cancelled = false;
    const loadDriverLocation = async () => {
      const { data } = await supabase.from('member_locations')
        .select('address, lat, lng').eq('member_id', driverMemberId).maybeSingle();
      if (cancelled) return;
      if (!data || data.lat == null || data.lng == null) { setDriverAddress(null); return; }
      setDriverAddress(data.address ? await decryptLocationText(driverMemberId, data.address) : null);
    };
    loadDriverLocation();
    // Randomized suffix, not just driverMemberId — this component mounts
    // once per VIEWER (every parent/kid/teen/GP watching the same trip on
    // their own Hub), so a fixed channel name would collide the instant two
    // viewers on the same device/session (or React Strict Mode's dev-only
    // double-invoke) both target the same driverMemberId, same class of bug
    // FamilyRadarSection/GpsTab already fix this way elsewhere.
    const channelName = `pickup_radar_driver_${driverMemberId}_${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations', filter: `member_id=eq.${driverMemberId}` }, loadDriverLocation)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [driverMemberId]);

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
          {driverAddress && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -6 }}>
              <MapPin size={11} color={activeColor} style={{ marginLeft: 1 }} />
              <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>
                {activeTrip.driverName} is near {driverAddress}
              </Text>
            </View>
          )}
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
