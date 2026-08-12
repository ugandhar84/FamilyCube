/**
 * HelpQueueSection — Family Support & Help Queue
 *
 * Matches the gemini-code HelpDispatchQueue pattern with FamilyCube BRAND colors.
 * Clean card-per-request layout: no clutter, status-based tinting.
 *
 * Parent/Senior:
 *   pending  → Self-Assign | assign-to dropdown | ❌ Decline
 *   assigned → "Helper: X" + Mark Completed | Reassign dropdown
 *
 * Kid:
 *   pending  → "Waiting..." + Withdraw
 *   declined → reason + "Resubmit" CTA
 *   assigned → "In progress — [helper]" + helper note
 *   completed→ compact ✓ row
 */
import React, { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useHelpStore, HelpRequest } from '@/store/helpStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';

// ─── Category badge ───────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  Ride: BRAND.teal, Homework: BRAND.purple, Childcare: BRAND.pink,
  Errand: BRAND.amber, Chore: '#10B981', Advice: '#3B82F6', General: '#64748B',
};

function CatBadge({ cat }: { cat: string }) {
  const c = CAT_COLOR[cat] ?? '#64748B';
  return (
    <View style={{ backgroundColor: c + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: c + '45' }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: c }}>{cat}</Text>
    </View>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color }}>{label}</Text>
    </View>
  );
}

// ─── Assign picker (horizontal scroll of adult name chips) ────────────────────

function AssignPicker({ adults, selected, onSelect }: {
  adults: string[]; selected: string; onSelect: (name: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {adults.map(name => {
          const sel = selected === name;
          return (
            <Pressable key={name} onPress={() => onSelect(sel ? '' : name)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1,
                backgroundColor: sel ? BRAND.purple : 'transparent',
                borderColor: sel ? BRAND.purple : BRAND.purple + '50',
              }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: sel ? '#fff' : BRAND.purple }}>
                {name.split(' ')[0]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Pending card (parent/senior) ─────────────────────────────────────────────

function PendingCard({ req, activeName, adults, colors, isDark, onDecline, onAssign, onSelfAssign }: {
  req: HelpRequest; activeName: string; adults: string[];
  colors: any; isDark: boolean;
  onDecline: (id: string, reason: string) => void;
  onAssign: (id: string, helper: string, note?: string) => void;
  onSelfAssign: (id: string) => void;
}) {
  const [showDecline, setShowDecline] = useState(false);
  const [declineText, setDeclineText] = useState('');
  const [assignTo, setAssignTo]       = useState('');

  const isHigh = req.urgency === 'High';
  const accent = isHigh ? '#EF4444' : BRAND.amber;
  const cardBg = isDark
    ? (isHigh ? '#2A0A0A' : '#1A1200')
    : (isHigh ? '#FFF5F5' : '#FFFBEB');

  return (
    <View style={{
      borderRadius: 16, borderWidth: 1, borderColor: accent + '40',
      backgroundColor: cardBg, overflow: 'hidden',
    }}>
      {/* Left accent bar */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: accent }} />

      <View style={{ padding: 14, paddingLeft: 17, gap: 8 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: accent }}>
            {req.requesterName.split(' ')[0]} needs help:
          </Text>
          <CatBadge cat={req.category} />
          {req.rewardCoins && (
            <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: BRAND.amber + '40' }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.amber }}>+{req.rewardCoins}🪙</Text>
            </View>
          )}
        </View>

        {/* Description */}
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 }}>
          "{req.description}"
        </Text>

        {/* Scheduling info */}
        {(req.date || req.time) && (
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>
            📅 {req.date ?? ''}{req.time ? ` · ${req.time}` : ''}
            {req.fromLoc ? ` · From: ${req.fromLoc}` : ''}
            {req.toLoc ? ` → ${req.toLoc}` : ''}
          </Text>
        )}

        {/* Decline panel */}
        {showDecline ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={declineText}
              onChangeText={setDeclineText}
              placeholder="Reason for declining..."
              placeholderTextColor={colors.textTertiary}
              style={{
                fontSize: TYPO.label, color: colors.textPrimary, borderRadius: 10,
                borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
                paddingHorizontal: 12, paddingVertical: 8,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setShowDecline(false)}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (declineText.trim()) { onDecline(req.id, declineText.trim()); setShowDecline(false); } }}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 12, backgroundColor: '#EF4444', alignItems: 'center', opacity: declineText.trim() ? 1 : 0.4 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Confirm Decline</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            {/* Assign / decline label row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: accent, opacity: 0.8 }}>
                Assign Tutor / Helper or Decline:
              </Text>
              <Pressable onPress={() => setShowDecline(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: TYPO.label, color: '#EF4444', fontWeight: '700' }}>❌ Decline Request</Text>
              </Pressable>
            </View>

            {/* Single row: Self-Assign | chip picker | Assign button */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => onSelfAssign(req.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>⚡ Self-Assign ({activeName.split(' ')[0]})</Text>
              </Pressable>
              {adults.filter(a => a !== activeName).length > 0 && (
                <>
                  <View style={{ flex: 1 }}>
                    <AssignPicker
                      adults={adults.filter(a => a !== activeName)}
                      selected={assignTo}
                      onSelect={setAssignTo}
                    />
                  </View>
                  <Pressable
                    onPress={() => { if (assignTo) { onAssign(req.id, assignTo); setAssignTo(''); } }}
                    style={{ backgroundColor: assignTo ? BRAND.purple : BRAND.purple + '40', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}>
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Assign</Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Assigned card (parent/senior) ────────────────────────────────────────────

function AssignedCard({ req, activeName, adults, colors, isDark, onComplete, onReassign }: {
  req: HelpRequest; activeName: string; adults: string[];
  colors: any; isDark: boolean;
  onComplete: (id: string) => void;
  onReassign: (id: string, helper: string, note?: string) => void;
}) {
  const [reassignTo, setReassignTo] = useState('');
  const cardBg = isDark ? '#160D22' : '#F5F3FF';

  return (
    <View style={{
      borderRadius: 16, borderWidth: 1, borderColor: BRAND.purple + '40',
      backgroundColor: cardBg, overflow: 'hidden',
    }}>
      {/* Left accent bar */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: BRAND.purple }} />

      <View style={{ padding: 14, paddingLeft: 17, gap: 8 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }}>
            {req.requesterName.split(' ')[0]}'s Request
          </Text>
          <CatBadge cat={req.category} />
          <StatusBadge label="In Progress" color={BRAND.purple} />
        </View>

        {/* Description */}
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 }}>
          "{req.description}"
        </Text>

        {/* Assigned helper + complete button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="person" size={13} color={BRAND.purple} />
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple, flex: 1 }}>
            Assigned Tutor/Helper: <Text style={{ fontWeight: '900' }}>{req.assignedHelper}</Text>
          </Text>
          <Pressable onPress={() => onComplete(req.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BRAND.purple, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Mark Completed</Text>
          </Pressable>
        </View>

        {/* Reassign row */}
        {req.helperNote ? (
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontStyle: 'italic' }}>
            Note: {req.helperNote}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary }}>Reassign Tutor:</Text>
          <View style={{ flex: 1 }}>
            <AssignPicker
              adults={adults.filter(a => a !== req.assignedHelper)}
              selected={reassignTo}
              onSelect={setReassignTo}
            />
          </View>
          {reassignTo.length > 0 && (
            <Pressable onPress={() => { onReassign(req.id, reassignTo); setReassignTo(''); }}
              style={{ backgroundColor: BRAND.purple + '20', borderWidth: 1, borderColor: BRAND.purple + '60', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.purple }}>Reassign</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Completed row (compact) ──────────────────────────────────────────────────

function CompletedRow({ req, colors, isDark }: { req: HelpRequest; colors: any; isDark: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 14, borderWidth: 1, borderColor: BRAND.teal + '35',
      backgroundColor: isDark ? '#001A18' : '#F0FDFC',
      padding: 12, paddingLeft: 15,
    }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: BRAND.teal, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }} />
      <Ionicons name="checkmark-circle" size={14} color={BRAND.teal} />
      <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textSecondary, flexShrink: 1 }} numberOfLines={1}>
        <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{req.requesterName.split(' ')[0]}: </Text>
        "{req.description}"
      </Text>
      {req.assignedHelper && (
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.teal }}>
          ✓ {req.assignedHelper.split(' ')[0]}
        </Text>
      )}
    </View>
  );
}

// ─── Kid's view of their own request ─────────────────────────────────────────

function KidRequestCard({ req, requesterId, colors, isDark, onWithdraw, onResubmit }: {
  req: HelpRequest; requesterId: string;
  colors: any; isDark: boolean;
  onWithdraw: (id: string) => void;
  onResubmit: () => void;
}) {
  if (req.status === 'pending') {
    return (
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: BRAND.amber + '40', backgroundColor: isDark ? '#1A1200' : '#FFFBEB', padding: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CatBadge cat={req.category} />
          <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{req.title}</Text>
        </View>
        <Text style={{ fontSize: TYPO.label, color: BRAND.amber, fontWeight: '600' }}>⏳ Waiting for approval...</Text>
        <Pressable onPress={() => onWithdraw(req.id)} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontWeight: '600' }}>Withdraw request</Text>
        </Pressable>
      </View>
    );
  }

  if (req.status === 'declined') {
    return (
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: '#EF444440', backgroundColor: isDark ? '#2A0A0A' : '#FFF5F5', padding: 12, gap: 6 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#EF4444' }}>❌ Declined: {req.title}</Text>
        {req.declineReason && (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.declineReason}"</Text>
        )}
        <Pressable onPress={onResubmit}
          style={{ backgroundColor: BRAND.amber, borderRadius: 12, paddingVertical: 9, alignItems: 'center', marginTop: 4 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>↩ Resubmit Request</Text>
        </Pressable>
      </View>
    );
  }

  if (req.status === 'assigned') {
    return (
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: BRAND.purple + '40', backgroundColor: isDark ? '#160D22' : '#F5F3FF', padding: 12, gap: 4 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{req.title}</Text>
        <Text style={{ fontSize: TYPO.label, color: BRAND.purple, fontWeight: '700' }}>
          In progress — {req.assignedHelper}
        </Text>
        {req.helperNote && (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.helperNote}"</Text>
        )}
      </View>
    );
  }

  // completed
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: BRAND.teal + '40', backgroundColor: isDark ? '#001A18' : '#F0FDFC', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="checkmark-circle" size={16} color={BRAND.teal} />
      <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textSecondary, fontWeight: '600' }} numberOfLines={1}>{req.title}</Text>
      {req.rewardCoins && <Text style={{ fontSize: TYPO.label, color: BRAND.amber, fontWeight: '800' }}>+{req.rewardCoins}🪙</Text>}
    </View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
  onRequestHelp: () => void;
  hideAskButton?: boolean;
}

export default function HelpQueueSection({ onRequestHelp, hideAskButton = false }: Props) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const { requests, assignRequest, declineRequest, reassignRequest, completeRequest, withdrawRequest } = useHelpStore();

  const active  = members.find(m => m.id === activeMemberId) ?? members[0];
  if (!active) return null;

  const isAdult = active.role === 'parent' || active.role === 'senior';
  const allNames = members.map(m => m.name);
  const adults   = members.filter(m => m.role !== 'kid').map(m => m.name);

  // Adults see all active requests; kids see only their own
  const activeReqs = isAdult
    ? requests.filter(r => r.status === 'pending' || r.status === 'assigned')
    : requests.filter(r => r.requesterId === active.id && r.status !== 'withdrawn');

  const recentCompleted = isAdult
    ? requests.filter(r => r.status === 'completed').slice(0, 3)
    : [];

  const hasSomething = activeReqs.length > 0 || recentCompleted.length > 0;

  return (
    <View style={{ gap: 8 }}>
      {/* Ask for Help button — hidden when parent SectionCard owns the action */}
      {!hideAskButton && (
        <Pressable onPress={onRequestHelp}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            backgroundColor: BRAND.purple, borderRadius: 14, paddingVertical: 12,
          }}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Ask for Help</Text>
        </Pressable>
      )}

      {!hasSomething && (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <Text style={{ fontSize: 24 }}>✨</Text>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary, marginTop: 4 }}>All caught up — no open requests</Text>
        </View>
      )}

      {/* Active requests */}
      {isAdult ? (
        <>
          {activeReqs.filter(r => r.status === 'pending').map(req => (
            <PendingCard
              key={req.id} req={req} activeName={active.name} adults={adults}
              colors={colors} isDark={isDark}
              onDecline={(id, reason) => declineRequest(id, reason, active.name)}
              onAssign={(id, helper, note) => assignRequest(id, helper, note)}
              onSelfAssign={(id) => assignRequest(id, active.name)}
            />
          ))}
          {activeReqs.filter(r => r.status === 'assigned').map(req => (
            <AssignedCard
              key={req.id} req={req} activeName={active.name} adults={adults}
              colors={colors} isDark={isDark}
              onComplete={(id) => completeRequest(id)}
              onReassign={(id, helper, note) => reassignRequest(id, helper, note)}
            />
          ))}
          {recentCompleted.map(req => (
            <CompletedRow key={req.id} req={req} colors={colors} isDark={isDark} />
          ))}
        </>
      ) : (
        activeReqs.map(req => (
          <KidRequestCard
            key={req.id} req={req} requesterId={active.id}
            colors={colors} isDark={isDark}
            onWithdraw={(id) => withdrawRequest(id, active.id)}
            onResubmit={onRequestHelp}
          />
        ))
      )}
    </View>
  );
}
