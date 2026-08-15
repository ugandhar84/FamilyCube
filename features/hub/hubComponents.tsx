/**
 * Shared primitive components for the Hub feature.
 * SectionCard, CollapsibleCard, SubCard, AlertBanner, TimelineCard, EnRouteModal.
 */
import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert, ScrollView, Platform, Linking, TouchableOpacity } from 'react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import {
  ChevronDown, ChevronUp, ChevronRight, Pencil, Calendar,
  MapPin, AlertOctagon, Car, Navigation, AlertTriangle, X,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import { fmtTime, hoursUntilEvent, catColor, isWorkEvent, isHomeLocation } from './hubUtils';
import { fmtTimeParts } from '@/lib/dates';

// ─── SectionLabel ─────────────────────────────────────────────────────────────

export function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return <Text style={[sc.sectionLabel, { color: colors.textTertiary }]}>{label}</Text>;
}

// ─── SectionCard ──────────────────────────────────────────────────────────────
// icon is a ReactNode so callers pass a Lucide icon component, not an emoji string.

export function SectionCard({
  icon, title, subtitle, badge, badgeColor, seeAll, seeAllLabel, actionBtn, children, colors, isDark,
}: {
  icon: React.ReactNode; title: string; subtitle?: string; badge?: number; badgeColor?: string;
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
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>{title}</Text>
          {subtitle && (
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>{subtitle}</Text>
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
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>{seeAllLabel ?? 'See All →'}</Text>
          </Pressable>
        )}
      </View>
      <View style={{ padding: 10, gap: 8 }}>{children}</View>
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

// ─── UrgencyBadge ─────────────────────────────────────────────────────────────

export function UrgencyBadge({ hours, hasIssue }: { hours: number; hasIssue: boolean }) {
  if (!hasIssue) return null;
  if (hours > 24) return (
    <View style={{ backgroundColor: '#6B728020', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: '#6B7280' }}>Sort later</Text>
    </View>
  );
  if (hours >= 4) return (
    <View style={{ backgroundColor: BRAND.amber + '25', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <AlertTriangle size={10} color={BRAND.amber} />
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.amber }}>Today</Text>
    </View>
  );
  if (hours >= 0) return (
    <View style={{ backgroundColor: '#EF444425', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <AlertOctagon size={10} color="#EF4444" />
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#EF4444' }}>Now</Text>
    </View>
  );
  return null;
}

// ─── InlineReassignPanel ──────────────────────────────────────────────────────

export function InlineReassignPanel({ ev, members, colors, isDark, onDone, isReassign = false }: {
  ev: FamilyEvent; members: FamilyMember[]; colors: any; isDark: boolean;
  isReassign?: boolean;
  onDone: (driverName: string, note: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote]     = useState('');
  const adults = members.filter(m => m.role !== 'kid');

  const statusLabel = (m: FamilyMember) => {
    // Check current helper status
    if (ev.helper === m.name) {
      if (ev.helperStatus === 'rejected')  return { label: 'Declined',  color: '#EF4444' };
      if (ev.helperStatus === 'pending')   return { label: 'Awaiting',  color: BRAND.amber };
      if (ev.helperStatus === 'confirmed') return { label: 'Confirmed', color: '#10B981' };
    }
    // Also flag the person who declined even if helper was cleared
    if (ev.declinedBy === m.name && ev.helperStatus === 'rejected') {
      return { label: 'Declined', color: '#EF4444' };
    }
    return { label: 'Available', color: colors.textTertiary };
  };

  return (
    <View style={{ gap: 10, marginTop: 4 }}>
      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Pick a helper
      </Text>
      {adults.map(m => {
        const st = statusLabel(m);
        const sel = picked === m.name;
        const isDeclined = st.label === 'Declined';
        return (
          <Pressable key={m.id} onPress={() => setPicked(m.name)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12,
              borderWidth: 1.5,
              borderColor: sel ? BRAND.teal : isDeclined ? '#EF444440' : colors.border,
              backgroundColor: sel ? BRAND.teal + '18' : isDeclined ? '#EF444408' : (isDark ? colors.card : '#F8FAFC') }}>
            {/* Avatar with ! badge for declined */}
            <View style={{ position: 'relative' }}>
              <FamilyAvatar name={m.name} emoji={m.emoji} size={34}
                ringColor={sel ? BRAND.teal : isDeclined ? '#EF4444' : colors.border} />
              {isDeclined && (
                <View style={{
                  position: 'absolute', top: -3, right: -3,
                  backgroundColor: '#EF4444', borderRadius: 8,
                  width: 15, height: 15,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: isDark ? colors.card : '#fff',
                }}>
                  <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>!</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? BRAND.teal : isDeclined ? '#EF4444' : colors.textPrimary }}>{m.name}</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, textTransform: 'capitalize' }}>{m.role}</Text>
              {isDeclined && ev.declineReason && (
                <Text style={{ fontSize: TYPO.micro, color: '#EF4444', marginTop: 1 }} numberOfLines={1}>
                  "{ev.declineReason}"
                </Text>
              )}
            </View>
            <View style={{ backgroundColor: st.color + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, color: st.color, fontWeight: '800' }}>{st.label}</Text>
            </View>
          </Pressable>
        );
      })}
      {picked && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: isDark ? colors.card : '#F1F5F9',
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5,
            borderColor: note.trim() ? BRAND.teal + '60' : colors.border }}>
            <Pencil size={13} color={colors.textTertiary} style={{ marginTop: 3 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: isReassign ? '#EF4444' : BRAND.teal, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {isReassign ? 'Reason for reassigning *' : 'Add a note (optional)'}
              </Text>
              <TextInput value={note} onChangeText={setNote}
                placeholder={isReassign ? 'e.g. Conflict with other pickup…' : 'e.g. Pick up from main entrance'}
                placeholderTextColor={colors.placeholder}
                style={{ fontSize: TYPO.label, color: colors.textPrimary, minHeight: 32 }}
                maxLength={120} multiline />
            </View>
          </View>
          <Pressable onPress={() => onDone(picked, note)} disabled={isReassign && !note.trim()}
            style={{ backgroundColor: (isReassign && !note.trim()) ? colors.border : BRAND.teal, borderRadius: 12, paddingVertical: 11, alignItems: 'center', opacity: (isReassign && !note.trim()) ? 0.5 : 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: (isReassign && !note.trim()) ? colors.textTertiary : '#fff' }}>Assign {picked} — Awaiting Response</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ─── AlertBanner ──────────────────────────────────────────────────────────────

export function AlertBanner({
  conflictEvents, rejectedEvents, pendingNoResponseEvents = [], unassignedUrgentEvents = [],
  conflictReasons, members, colors, isDark, updateEvent,
}: {
  conflictEvents: FamilyEvent[]; rejectedEvents: FamilyEvent[];
  pendingNoResponseEvents?: FamilyEvent[]; unassignedUrgentEvents?: FamilyEvent[];
  conflictReasons?: Map<string, string>;
  members: FamilyMember[]; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, gap: 8 }}>
      {rejectedEvents.filter(ev => { const h = hoursUntilEvent(ev.date, ev.time); return h >= 0 && h < 4; }).map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        const isOpen = openId === ev.id;
        return (
          <View key={ev.id} style={{
            backgroundColor: isDark ? '#2d0a0a' : '#FEF2F2',
            borderRadius: 16, borderWidth: 1.5, borderColor: '#EF444450', overflow: 'hidden',
          }}>
            <View style={{ backgroundColor: '#EF4444', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <AlertOctagon size={15} color="#fff" />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                Driver Declined — {ev.title}
              </Text>
              <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>{fmtTime(ev.time)}</Text>
            </View>
            <View style={{ padding: 14, gap: 8 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                <Text style={{ fontWeight: '700', color: '#EF4444' }}>{ev.helper}</Text> declined
                {ev.declineReason ? `: "${ev.declineReason}"` : ''}
              </Text>
              {kid && ev.location && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{ev.location} · For {kid.name.split(' ')[0]}</Text>
                </View>
              )}
              <Pressable onPress={() => setOpenId(isOpen ? null : ev.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF444415', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#EF444430' }}>
                {isOpen ? <ChevronUp size={14} color="#EF4444" /> : <ChevronRight size={14} color="#EF4444" />}
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>
                  {isOpen ? 'Cancel' : 'Reassign Driver Now'}
                </Text>
              </Pressable>
              {isOpen && (
                <InlineReassignPanel ev={ev} members={members} colors={colors} isDark={isDark} isReassign
                  onDone={(name, note) => {
                    updateEvent(ev.id, { helper: name, helperStatus: 'pending', notes: note || undefined });
                    setOpenId(null);
                  }} />
              )}
            </View>
          </View>
        );
      })}

      {/* Pending no-response urgent (< 1 hr, helper not replied) */}
      {pendingNoResponseEvents.map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        const isOpen = openId === `pnr-${ev.id}`;
        return (
          <View key={`pnr-${ev.id}`} style={{
            backgroundColor: isDark ? '#2d1a00' : '#FFFBEB',
            borderRadius: 16, borderWidth: 1.5, borderColor: '#F59E0B60', overflow: 'hidden',
          }}>
            <View style={{ backgroundColor: '#F59E0B', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <AlertTriangle size={15} color="#fff" />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                No Reply — {ev.title}
              </Text>
              <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.9)', fontWeight: '700' }}>{fmtTime(ev.time)}</Text>
            </View>
            <View style={{ padding: 14, gap: 8 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
                <Text style={{ fontWeight: '700', color: '#F59E0B' }}>{ev.helper}</Text> hasn't replied.
                {kid ? ` Pickup for ${kid.name.split(' ')[0]} is in under an hour.` : ' Event is in under an hour.'}
              </Text>
              <Pressable onPress={() => setOpenId(isOpen ? null : `pnr-${ev.id}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B15', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#F59E0B30' }}>
                {isOpen ? <ChevronUp size={14} color="#F59E0B" /> : <ChevronRight size={14} color="#F59E0B" />}
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#F59E0B' }}>
                  {isOpen ? 'Cancel' : 'Reassign Driver Now'}
                </Text>
              </Pressable>
              {isOpen && (
                <InlineReassignPanel ev={ev} members={members} colors={colors} isDark={isDark} isReassign
                  onDone={(name, note) => {
                    updateEvent(ev.id, { helper: name, helperStatus: 'pending', notes: note });
                    setOpenId(null);
                  }} />
              )}
            </View>
          </View>
        );
      })}

      {/* Unassigned urgent (transport event < 2 hr, no driver) */}
      {unassignedUrgentEvents.map(ev => {
        const kid = members.find(m => m.id === ev.memberId);
        const isOpen = openId === `ua-${ev.id}`;
        return (
          <View key={`ua-${ev.id}`} style={{
            backgroundColor: isDark ? '#1a1200' : '#FFFBEB',
            borderRadius: 16, borderWidth: 1.5, borderColor: '#F59E0B60', overflow: 'hidden',
          }}>
            <View style={{ backgroundColor: '#D97706', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
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
              <Pressable onPress={() => setOpenId(isOpen ? null : `ua-${ev.id}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D9770615', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#D9770630' }}>
                {isOpen ? <ChevronUp size={14} color="#D97706" /> : <ChevronRight size={14} color="#D97706" />}
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#D97706' }}>
                  {isOpen ? 'Cancel' : 'Assign Driver Now'}
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

      {conflictEvents.map(ev => {
        const reason = conflictReasons?.get(ev.id);
        return (
        <View key={ev.id} style={{
          backgroundColor: isDark ? '#1c1400' : '#FFFBEB',
          borderRadius: 16, borderWidth: 1.5, borderColor: BRAND.amber + '60', overflow: 'hidden',
        }}>
          <View style={{ backgroundColor: BRAND.amber, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
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
              style={{ backgroundColor: BRAND.amber, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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

// ─── EventDetailSheet — bottom-sheet modal for full event details + actions ───

function EventDetailSheet({ ev, members, colors, isDark, activeName, updateEvent, onClose }: {
  ev: FamilyEvent; members: FamilyMember[]; colors: any; isDark: boolean;
  activeName?: string;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  onClose: () => void;
}) {
  const [reassignOpen, setReassignOpen] = useState(false);
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
  const helperMissing  = !ev.helper && !!ev.location && !isWork && !isHomeLocation(ev.location);
  const helperPending  = ev.helperStatus === 'pending';
  const helperRejected = ev.helperStatus === 'rejected';
  const isSelfAssigned = !!activeName && ev.helper === activeName;
  const hadPriorHelper = !!ev.helper;

  const showRemind   = !isPast && !isWork && !!ev.helper && helperPending && !isSelfAssigned;
  const showReassign = !isPast && !isWork && (helperMissing || helperPending || helperRejected);

  return (
    <AppBottomSheet
      visible
      onClose={onClose}
      title={ev.title}
      maxHeight="82%"
    >
        <View style={{ gap: 14 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ backgroundColor: cc + '20', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: cc + '45' }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: cc, textTransform: 'uppercase', letterSpacing: 0.6 }}>{cat}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: TYPO.subheading, fontWeight: '900', color: isDark ? colors.textPrimary : '#1E2D6B', lineHeight: 24 }}>
              {ev.title}
            </Text>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color={colors.textTertiary} />
            </Pressable>
          </View>

          {/* Time */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calendar size={14} color={cc} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
              {fmtTime(ev.time)}
            </Text>
            {isPast && (
              <View style={{ backgroundColor: '#10B98118', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#10B981' }}>Done</Text>
              </View>
            )}
          </View>

          {/* For / assignees — bumped */}
          {forLabel && allAssignees.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{forLabel}:</Text>
              {allAssignees.map(m => (
                <View key={m.id} style={{ backgroundColor: cc + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: cc + '30' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '900', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
                    {m.emoji ? `${m.emoji} ` : ''}{m.name.split(' ')[0]}
                  </Text>
                </View>
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
              🩺 Doctor: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.doctorName}</Text>
            </Text>
          )}
          {cat === 'Study' && ev.subject && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              📖 Subject: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.subject}</Text>
            </Text>
          )}
          {cat === 'Sports' && ev.coachName && (
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              🏅 Coach: <Text style={{ fontWeight: '700', color: isDark ? colors.textPrimary : '#1E2D6B' }}>{ev.coachName}</Text>
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
            const borderCol  = isRejected ? '#EF444440' : isPending ? '#FCD34D' : '#6EE7B7';
            const bgCol      = isRejected ? (isDark ? '#2d0a0a' : '#FEF2F2') : isPending ? (isDark ? '#1C1700' : '#FFFBEB') : (isDark ? '#0F172A' : '#F8FAFC');
            return (
            <View style={{ backgroundColor: bgCol, borderRadius: 14, borderWidth: 1, borderColor: borderCol, paddingHorizontal: 14, paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {/* Avatar with warning badge */}
                <View style={{ position: 'relative' }}>
                  <FamilyAvatar
                    name={ev.helper} emoji={helperMember?.emoji} avatarUrl={helperMember?.avatarUrl}
                    siblings={members.map(m => m.name)} size={36}
                    ringColor={isRejected ? '#EF4444' : isPending ? BRAND.amber : '#10B981'}
                    ringWidth={2}
                  />
                  {isRejected && (
                    <View style={{
                      position: 'absolute', top: -3, right: -3,
                      backgroundColor: '#EF4444', borderRadius: 8,
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
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isRejected ? '#EF4444' : (isDark ? colors.textPrimary : '#1E2D6B') }}>
                    {ev.helper}
                  </Text>
                  {isRejected && ev.declineReason && (
                    <Text style={{ fontSize: TYPO.label, color: '#EF4444', marginTop: 2 }}>
                      "{ev.declineReason}"
                    </Text>
                  )}
                </View>

                {ev.helperStatus === 'confirmed' && (
                  <View style={{ backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#6EE7B7' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#10B981' }}>Confirmed ✓</Text>
                  </View>
                )}
                {isPending && (
                  <View style={{ backgroundColor: isDark ? '#1C1700' : '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#FCD34D' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#D97706' }}>⏳ Awaiting</Text>
                  </View>
                )}
                {isRejected && (
                  <View style={{ backgroundColor: '#EF444425', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#EF444440' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#EF4444' }}>Declined ✕</Text>
                  </View>
                )}
              </View>
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

          {/* Actions */}
          {!isPast && (
            <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
              {showRemind && (
                <Pressable
                  onPress={() => { Alert.alert('Reminder Sent', `A nudge was sent to ${ev.helper}.`); onClose(); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: BRAND.amber + '18', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: BRAND.amber + '40' }}>
                  <AlertTriangle size={15} color={BRAND.amber} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.amber }}>Send Reminder to {ev.helper?.split(' ')[0]}</Text>
                </Pressable>
              )}
              {showReassign && !reassignOpen && (
                <Pressable onPress={() => setReassignOpen(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: helperRejected ? '#EF444412' : BRAND.teal + '12',
                    borderRadius: 14, paddingVertical: 12, borderWidth: 1,
                    borderColor: helperRejected ? '#EF444435' : BRAND.teal + '35' }}>
                  <ChevronRight size={15} color={helperRejected ? '#EF4444' : BRAND.teal} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: helperRejected ? '#EF4444' : BRAND.teal }}>
                    {helperMissing ? 'Assign Helper' : 'Reassign Helper'}
                  </Text>
                </Pressable>
              )}
              {reassignOpen && (
                <View>
                  <Pressable onPress={() => setReassignOpen(false)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10, alignSelf: 'flex-start' }}>
                    <ChevronDown size={14} color={colors.textTertiary} />
                    <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontWeight: '700' }}>Cancel</Text>
                  </Pressable>
                  <InlineReassignPanel ev={ev} members={members} colors={colors} isDark={isDark}
                    isReassign={hadPriorHelper}
                    onDone={(name, note) => {
                      updateEvent(ev.id, { helper: name, helperStatus: 'pending', notes: note || undefined });
                      setReassignOpen(false);
                      onClose();
                    }} />
                </View>
              )}
            </View>
          )}
        </View>
    </AppBottomSheet>
  );
}

// ─── TimelineCard ─────────────────────────────────────────────────────────────
// Compact schedule-list row: time text on the left + thin connecting line,
// category-accented card on the right. Tap opens the detail bottom sheet.

export function TimelineCard({ ev, members, allNames, colors, isDark, updateEvent, activeName, isFirst, isLast }: {
  ev: FamilyEvent; members: FamilyMember[]; allNames: string[];
  colors: any; isDark: boolean;
  activeName?: string;
  isFirst?: boolean; isLast?: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
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
  const hasIssue       = helperMissing || helperRejected;

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

  const LINE_COLOR = isDark ? BRAND.purple + '35' : BRAND.purple + '25';

  return (
    <>
      <View style={{ flexDirection: 'row', minHeight: 64, opacity: isPast ? 0.45 : 1 }}>

        {/* Col 1: time + AM/PM + line, all centered on the same axis */}
        <View style={{ width: 54, alignItems: 'center', paddingTop: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: '900', color: isPast ? colors.textTertiary : cc, lineHeight: 15, textAlign: 'center' }}>{time}</Text>
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
            borderColor: (hasIssue && !isPast) ? '#EF444445'
                       : (helperPending && !isPast) ? BRAND.amber + '45'
                       : (isDark ? colors.border : '#E8E6F0'),
            borderLeftWidth: 3,
            borderLeftColor: (hasIssue && !isPast) ? '#EF4444'
                           : (helperPending && !isPast) ? BRAND.amber
                           : cc,
            paddingHorizontal: 12, paddingVertical: 10, gap: 5,
          }}>

          {/* Row 1: category chip + title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ backgroundColor: cc + '1A', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: cc + '44' }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: cc, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {isPast ? '✓ Done' : cat}
              </Text>
            </View>
            <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '800', color: isDark ? colors.textPrimary : '#1E2D6B' }} numberOfLines={1}>
              {ev.title}
            </Text>
          </View>

          {/* Row 2: For label + assignee chips + location */}
          {forLabel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>{forLabel}:</Text>
              {allAssignees.length > 0 ? allAssignees.map(m => (
                <View key={m.id} style={{ backgroundColor: cc + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: cc + '30' }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: isDark ? colors.textPrimary : '#1E2D6B' }}>
                    {m.emoji ? `${m.emoji} ` : ''}{m.name.split(' ')[0]}
                  </Text>
                </View>
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
                  ringColor={helperRejected ? '#EF4444' : helperPending ? BRAND.amber : '#10B981'}
                  ringWidth={2}
                />
                {helperRejected && (
                  <View style={{
                    position: 'absolute', top: -3, right: -3,
                    backgroundColor: '#EF4444', borderRadius: 7,
                    width: 14, height: 14,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: isDark ? colors.card : '#fff',
                  }}>
                    <Text style={{ fontSize: 8, color: '#fff', fontWeight: '900', lineHeight: 10 }}>!</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: TYPO.label, color: helperRejected ? '#EF4444' : colors.textSecondary, flex: 1 }}>
                {helperLabel}{' '}
                <Text style={{ fontWeight: '700', color: helperRejected ? '#EF4444' : (isDark ? colors.textPrimary : '#1E2D6B') }}>{ev.helper}</Text>
              </Text>
              {ev.helperStatus === 'confirmed' && (
                <View style={{ backgroundColor: '#10B98118', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#10B981' }}>Confirmed ✓</Text>
                </View>
              )}
              {ev.helperStatus === 'pending' && (
                <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#D97706' }}>⏳ Awaiting</Text>
                </View>
              )}
              {ev.helperStatus === 'rejected' && (
                <View style={{ backgroundColor: '#EF444425', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#EF444440' }}>
                  <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#EF4444' }}>Declined ✕</Text>
                </View>
              )}
            </View>
            {helperRejected && ev.declineReason && (
              <Text style={{ fontSize: TYPO.micro, color: '#EF4444', fontStyle: 'italic' }}>
                "{ev.declineReason}"
              </Text>
            )}
            </View>
            );
          })()}

          {/* Needs driver warning — no helper assigned at all */}
          {!isPast && helperMissing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: '#EF444412', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
              borderWidth: 1, borderColor: '#EF444430' }}>
              <AlertTriangle size={11} color="#EF4444" />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#EF4444' }}>No driver assigned — tap to fix</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {sheetOpen && (
        <EventDetailSheet
          ev={ev} members={members} colors={colors} isDark={isDark}
          activeName={activeName} updateEvent={updateEvent}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

// ─── EnRouteModal ─────────────────────────────────────────────────────────────

export function EnRouteModal({ visible, onClose, kids, onDispatch }: {
  visible: boolean; onClose: () => void;
  kids: FamilyMember[]; onDispatch: (kid: string, eta: string) => void;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [eta, setEta] = useState('10 min');
  const ETAS = ['5 min', '10 min', '15 min', '20 min', '30 min', '45 min'];
  const allNames = kids.map(k => k.name);

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Dispatch En Route"
      subtitle="Notify your kids you're on the way"
      accentColor="#10B981"
      footer={
        <Pressable onPress={() => {
          const kidName = selected ? kids.find(k => k.id === selected)?.name.split(' ')[0] ?? 'kids' : 'kids';
          onDispatch(kidName, eta);
          onClose();
        }} style={{ backgroundColor: '#10B981', borderRadius: 16, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Navigation size={18} color="#fff" />
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Send En Route Ping</Text>
        </Pressable>
      }
    >
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
    </AppBottomSheet>
  );
}

const sc = StyleSheet.create({
  sectionLabel: {
    fontSize: TYPO.label, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 10,
  },
});
