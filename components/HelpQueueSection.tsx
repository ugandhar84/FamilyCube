/**
 * HelpQueueSection — live help-request queue shown on the Hub.
 *
 * RBAC:
 *   Parent/Senior:
 *     pending  → Self-assign | Assign-to-other (with optional note) | Decline (with reason)
 *     assigned → Reassign (with note) | Mark Completed
 *   Kid:
 *     pending  → "Waiting for approval" + Withdraw button
 *     declined → "❌ Declined: [reason]" — Awaiting your response + Resubmit button
 *     assigned → "In progress — [helper]"
 *     completed→ ✓ row
 *
 * Decline always requires a reason (preset chips or custom text).
 * Reassign shows dynamic note input only when a different helper is selected.
 * Decline → status='declined', requester sees reason and can resubmit (opens modal).
 */
import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useHelpStore, HelpRequest } from '@/store/helpStore';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

const DECLINE_PRESETS = [
  'Ask again after homework',
  'Try asking someone else first',
  'Parents busy right now',
  'Do your chores first',
  'Not appropriate right now',
];

// ─── Section header ───────────────────────────────────────────────────────────
function SLabel({ text, colors }: { text: string; colors: any }) {
  return (
    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: colors.textTertiary, marginBottom: 8, marginTop: 4 }}>
      {text}
    </Text>
  );
}

// ─── Category color dot ───────────────────────────────────────────────────────
function CatBadge({ cat, colors }: { cat: string; colors: any }) {
  const BG: Record<string, string> = {
    Ride: BRAND.teal, Homework: BRAND.purple, Childcare: BRAND.pink,
    Errand: BRAND.amber, Chore: '#10B981', Advice: '#3B82F6', General: '#64748B',
  };
  const bg = BG[cat] ?? '#64748B';
  return (
    <View style={{ backgroundColor: bg + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: bg + '40' }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: bg }}>{cat}</Text>
    </View>
  );
}

// ─── Pending card (parent/senior view) ───────────────────────────────────────
function PendingCard({ req, activeName, adults, colors, isDark, onDecline, onAssign, onSelfAssign }: {
  req: HelpRequest; activeName: string; adults: string[];
  colors: any; isDark: boolean;
  onDecline: (id: string, reason: string) => void;
  onAssign: (id: string, helper: string, note?: string) => void;
  onSelfAssign: (id: string) => void;
}) {
  const [showDecline, setShowDecline]   = useState(false);
  const [declineReason, setDeclineR]    = useState('');
  const [selectedHelper, setSelHelper]  = useState('');
  const [assignNote, setAssignNote]     = useState('');

  const isHighUrgency = req.urgency === 'High';
  const borderCol = isHighUrgency ? '#EF4444' : BRAND.amber;

  return (
    <View style={[c.card, { backgroundColor: isDark ? '#1A1000' : '#FFFBEB', borderColor: borderCol + '50' }]}>
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: BRAND.amber }}>
              🙋 {req.onBehalfOf ? `${req.onBehalfOf} → ${req.requesterName}` : req.requesterName} needs help:
            </Text>
            <CatBadge cat={req.category} colors={colors} />
            {isHighUrgency && (
              <View style={{ backgroundColor: '#EF444420', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#EF4444' }}>🔴 URGENT</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, marginTop: 4 }}>
            "{req.title}"
          </Text>
          {req.description ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 3 }} numberOfLines={2}>
              {req.description}
            </Text>
          ) : null}
          {req.date ? (
            <Text style={{ fontSize: TYPO.label, color: BRAND.teal, fontWeight: '700', marginTop: 4 }}>
              📅 {req.date}{req.time ? ` at ${req.time}` : ''}
            </Text>
          ) : null}
        </View>
        {req.rewardCoins ? (
          <View style={{ backgroundColor: BRAND.amber + '20', borderRadius: 12, padding: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: TYPO.body }}>🪙</Text>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: BRAND.amber }}>+{req.rewardCoins}</Text>
          </View>
        ) : null}
      </View>

      {/* Decline panel */}
      {showDecline && (
        <View style={[c.declineBox, { backgroundColor: isDark ? '#3F0000' : '#FFF5F5', borderColor: '#EF444440' }]}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444', marginBottom: 8 }}>
            Select or type a reason for declining:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {DECLINE_PRESETS.map(p => (
              <Pressable key={p} onPress={() => setDeclineR(p)}
                style={[c.chip, {
                  backgroundColor: declineReason === p ? '#EF444430' : colors.surface,
                  borderColor: declineReason === p ? '#EF4444' : colors.border,
                }]}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: declineReason === p ? '#EF4444' : colors.textSecondary }}>{p}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            value={declineReason}
            onChangeText={t => setDeclineR(t.slice(0, 150))}
            placeholder="Custom reason (max 150 chars)..."
            placeholderTextColor={colors.textTertiary}
            style={[c.noteInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'right', marginTop: 3 }}>{declineReason.length}/150</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable onPress={() => setShowDecline(false)}
              style={[c.smBtn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => { if (declineReason.trim()) { onDecline(req.id, declineReason.trim()); setShowDecline(false); } }}
              style={[c.smBtn, { flex: 2, backgroundColor: declineReason.trim() ? '#EF4444' : colors.border }]}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Confirm Decline</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Assign actions */}
      {!showDecline && (
        <View style={{ borderTopWidth: 1, borderTopColor: BRAND.amber + '30', paddingTop: 10, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.amber }}>⚡ Assign helper or decline:</Text>
            <Pressable onPress={() => { setShowDecline(true); setDeclineR(''); }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>❌ Decline</Text>
            </Pressable>
          </View>
          {/* Self-assign */}
          <Pressable onPress={() => onSelfAssign(req.id)}
            style={[c.smBtn, { backgroundColor: '#10B981', paddingHorizontal: 16 }]}>
            <Ionicons name="flash" size={13} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>
              ⚡ I'll do it ({activeName.split(' ')[0]})
            </Text>
          </Pressable>
          {/* Assign-to-other picker + note */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              {adults.filter(n => n !== activeName).map(n => (
                <Pressable key={n} onPress={() => setSelHelper(n === selectedHelper ? '' : n)}
                  style={[c.chip, {
                    backgroundColor: selectedHelper === n ? BRAND.purple + '20' : colors.surface,
                    borderColor: selectedHelper === n ? BRAND.purple : colors.border,
                  }]}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: selectedHelper === n ? BRAND.purple : colors.textSecondary }}>
                    👤 {n.split(' ')[0]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {selectedHelper ? (
              <Pressable onPress={() => { onAssign(req.id, selectedHelper, assignNote); setSelHelper(''); setAssignNote(''); }}
                style={[c.smBtn, { backgroundColor: BRAND.purple, paddingHorizontal: 16 }]}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Assign</Text>
              </Pressable>
            ) : null}
          </View>
          {/* Dynamic note for assigning someone else */}
          {selectedHelper && selectedHelper !== activeName && (
            <View>
              <TextInput
                value={assignNote}
                onChangeText={t => setAssignNote(t.slice(0, 150))}
                placeholder={`Note for ${selectedHelper.split(' ')[0]} (optional)...`}
                placeholderTextColor={colors.textTertiary}
                style={[c.noteInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: BRAND.purple + '60' }]}
              />
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'right', marginTop: 2 }}>{assignNote.length}/150</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Assigned card (parent/senior view) ──────────────────────────────────────
function AssignedCard({ req, adults, colors, isDark, onReassign, onComplete }: {
  req: HelpRequest; adults: string[];
  colors: any; isDark: boolean;
  onReassign: (id: string, helper: string, note?: string) => void;
  onComplete: (id: string) => void;
}) {
  const [selHelper, setSelHelper] = useState('');
  const [note, setNote]           = useState('');

  return (
    <View style={[c.card, { backgroundColor: isDark ? '#0F0A2A' : '#F5F3FF', borderColor: BRAND.purple + '40' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: BRAND.purple }}>🤝 {req.requesterName}'s request</Text>
            <CatBadge cat={req.category} colors={colors} />
            <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: BRAND.purple }}>In Progress</Text>
            </View>
          </View>
          <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary, marginTop: 3 }}>"{req.title}"</Text>
          {req.helperNote ? (
            <View style={{ backgroundColor: BRAND.purple + '15', borderRadius: 10, padding: 8, marginTop: 6 }}>
              <Text style={{ fontSize: TYPO.label, color: BRAND.purple, fontStyle: 'italic' }}>📝 "{req.helperNote}"</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: BRAND.purple + '30', paddingTop: 10, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#10B981' }}>
            👤 Helper: <Text style={{ fontWeight: '900', color: BRAND.purple }}>{req.assignedHelper ?? '—'}</Text>
          </Text>
          <Pressable onPress={() => onComplete(req.id)}
            style={[c.smBtn, { backgroundColor: BRAND.purple, paddingHorizontal: 14 }]}>
            <Ionicons name="checkmark-circle" size={13} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Done ✓</Text>
          </Pressable>
        </View>
        {/* Reassign */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>Reassign to:</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              {adults.filter(n => n !== req.assignedHelper).map(n => (
                <Pressable key={n} onPress={() => setSelHelper(n === selHelper ? '' : n)}
                  style={[c.chip, { backgroundColor: selHelper === n ? BRAND.purple + '20' : colors.surface, borderColor: selHelper === n ? BRAND.purple : colors.border }]}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: selHelper === n ? BRAND.purple : colors.textSecondary }}>
                    👤 {n.split(' ')[0]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {selHelper ? (
              <Pressable onPress={() => { onReassign(req.id, selHelper, note); setSelHelper(''); setNote(''); }}
                style={[c.smBtn, { backgroundColor: BRAND.purple, paddingHorizontal: 14 }]}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Reassign</Text>
              </Pressable>
            ) : null}
          </View>
          {selHelper && selHelper !== req.assignedHelper && (
            <View>
              <TextInput
                value={note}
                onChangeText={t => setNote(t.slice(0, 150))}
                placeholder={`Note for ${selHelper.split(' ')[0]} (optional)...`}
                placeholderTextColor={colors.textTertiary}
                style={[c.noteInput, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: BRAND.purple + '60' }]}
              />
              <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'right', marginTop: 2 }}>{note.length}/150</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Kid / requester view cards ───────────────────────────────────────────────
function MyRequestCard({ req, currentId, colors, isDark, onWithdraw, onResubmit }: {
  req: HelpRequest; currentId: string;
  colors: any; isDark: boolean;
  onWithdraw: (id: string) => void;
  onResubmit: () => void;
}) {
  const isPending   = req.status === 'pending';
  const isDeclined  = req.status === 'declined';
  const isAssigned  = req.status === 'assigned';
  const isCompleted = req.status === 'completed';

  const borderCol = isDeclined ? '#EF4444' : isAssigned ? BRAND.purple : isCompleted ? '#10B981' : BRAND.amber;
  const bgCol     = isDark
    ? (isDeclined ? '#2D0000' : isAssigned ? '#0F0A2A' : isCompleted ? '#001F12' : '#1A1000')
    : (isDeclined ? '#FFF5F5' : isAssigned ? '#F5F3FF' : isCompleted ? '#F0FDF4' : '#FFFBEB');

  return (
    <View style={[c.card, { backgroundColor: bgCol, borderColor: borderCol + '50' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <CatBadge cat={req.category} colors={colors} />
            {req.urgency === 'High' && (
              <View style={{ backgroundColor: '#EF444418', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: '#EF4444' }}>🔴 URGENT</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>"{req.title}"</Text>
          {req.description ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>{req.description}</Text>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: borderCol + '30' }}>
        {isPending && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="time-outline" size={14} color={BRAND.amber} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>Waiting for approval...</Text>
            </View>
            {req.requesterId === currentId && (
              <Pressable onPress={() => onWithdraw(req.id)}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>Withdraw 🗑️</Text>
              </Pressable>
            )}
          </View>
        )}
        {isDeclined && (
          <View style={{ gap: 8 }}>
            <View style={{ backgroundColor: '#EF444415', borderRadius: 10, padding: 10 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>❌ Declined</Text>
              {req.declineReason ? (
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                  Reason: "{req.declineReason}"
                </Text>
              ) : null}
            </View>
            <View style={{ backgroundColor: BRAND.amber + '15', borderRadius: 10, padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.amber }}>Awaiting your response →</Text>
              <Pressable onPress={onResubmit}
                style={[c.smBtn, { backgroundColor: BRAND.purple, paddingHorizontal: 14 }]}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Resubmit</Text>
              </Pressable>
            </View>
          </View>
        )}
        {isAssigned && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="person-circle" size={16} color={BRAND.purple} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: BRAND.purple }}>
              In progress — {req.assignedHelper ?? 'Family member'}
            </Text>
            {req.helperNote ? (
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic', flex: 1 }} numberOfLines={1}>
                · "{req.helperNote}"
              </Text>
            ) : null}
          </View>
        )}
        {isCompleted && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#10B981' }}>
              Completed by {req.assignedHelper ?? 'family'}
            </Text>
            {req.rewardCoins ? (
              <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: BRAND.amber }}>+{req.rewardCoins}🪙 earned!</Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────
interface Props {
  onRequestHelp: () => void;
  /** Hide "Ask for Help" button when the active adult is the only adult in the family */
  hideAskButton?: boolean;
}

export default function HelpQueueSection({ onRequestHelp, hideAskButton = false }: Props) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const { requests, assignRequest, declineRequest, reassignRequest, completeRequest, withdrawRequest } = useHelpStore();

  const active  = members.find(m => m.id === activeMemberId) ?? members[0];
  const isAdult = active?.role === 'parent' || active?.role === 'senior';
  const adults  = members.filter(m => m.role === 'parent' || m.role === 'senior').map(m => m.name);

  // Visible requests: non-withdrawn, non-completed (recent completed shown briefly)
  const active_reqs = requests.filter(r => r.status !== 'withdrawn');

  // Adult sees all pending + assigned; their own completed (last 3)
  const pending    = active_reqs.filter(r => r.status === 'pending');
  const assigned   = active_reqs.filter(r => r.status === 'assigned');
  const completed  = active_reqs.filter(r => r.status === 'completed').slice(0, 3);

  // Kid sees only their own requests
  const myRequests = active_reqs.filter(r =>
    r.requesterId === active?.id || r.onBehalfOf === active?.name
  );

  const isEmpty = isAdult
    ? (pending.length + assigned.length + completed.length) === 0
    : myRequests.length === 0;

  return (
    <View style={[c.section, { backgroundColor: isDark ? '#0D1117' : '#FFFFFF', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
      {/* Header */}
      <View style={c.sectionHdr}>
        <View style={[c.hdrIcon, { backgroundColor: BRAND.amber + '20' }]}>
          <Ionicons name="help-circle" size={18} color={BRAND.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[c.hdrTitle, { color: colors.textPrimary }]}>Family Help Queue</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
            {isAdult ? 'Approve & assign help requests' : 'Ask anyone in the family for help'}
          </Text>
        </View>
        {!hideAskButton && (
          <Pressable onPress={onRequestHelp}
            style={[c.askBtn, { backgroundColor: BRAND.purple }]}>
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Ask for Help</Text>
          </Pressable>
        )}
      </View>

      {isEmpty && (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: TYPO.body }}>🤝</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 6 }}>
            {isAdult ? 'No help requests right now.' : 'Need help with anything? Tap "Ask for Help"!'}
          </Text>
        </View>
      )}

      {/* ── Adult view ── */}
      {isAdult && !isEmpty && (
        <>
          {pending.length > 0 && (
            <>
              <SLabel text={`Pending (${pending.length})`} colors={colors} />
              {pending.map(r => (
                <PendingCard
                  key={r.id} req={r} activeName={active?.name ?? ''} adults={adults}
                  colors={colors} isDark={isDark}
                  onDecline={(id, reason) => declineRequest(id, reason, active?.name ?? '')}
                  onAssign={(id, helper, note) => assignRequest(id, helper, note)}
                  onSelfAssign={id => assignRequest(id, active?.name ?? '')}
                />
              ))}
            </>
          )}
          {assigned.length > 0 && (
            <>
              <SLabel text={`In Progress (${assigned.length})`} colors={colors} />
              {assigned.map(r => (
                <AssignedCard
                  key={r.id} req={r} adults={adults}
                  colors={colors} isDark={isDark}
                  onReassign={(id, helper, note) => reassignRequest(id, helper, note)}
                  onComplete={id => completeRequest(id)}
                />
              ))}
            </>
          )}
          {completed.length > 0 && (
            <>
              <SLabel text="Recently Completed" colors={colors} />
              {completed.map(r => (
                <View key={r.id} style={[c.completedRow, { backgroundColor: isDark ? '#001F12' : '#F0FDF4', borderColor: '#10B981' + '40' }]}>
                  <Ionicons name="checkmark-circle" size={15} color="#10B981" />
                  <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>
                    <Text style={{ fontWeight: '800', color: colors.textPrimary }}>{r.requesterName}:</Text> {r.title}
                  </Text>
                  {r.assignedHelper ? (
                    <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#10B981' }}>✓ {r.assignedHelper.split(' ')[0]}</Text>
                  ) : null}
                </View>
              ))}
            </>
          )}
        </>
      )}

      {/* ── Kid / non-approver view ── */}
      {!isAdult && myRequests.length > 0 && (
        <>
          <SLabel text="My Requests" colors={colors} />
          {myRequests.map(r => (
            <MyRequestCard
              key={r.id} req={r} currentId={active?.id ?? ''}
              colors={colors} isDark={isDark}
              onWithdraw={id => withdrawRequest(id, active?.id ?? '')}
              onResubmit={onRequestHelp}
            />
          ))}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const c = StyleSheet.create({
  section:     { borderRadius: 24, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  sectionHdr:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 12 },
  hdrIcon:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  hdrTitle:    { fontSize: TYPO.caption, fontWeight: '900' },
  askBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  card:        { borderRadius: 18, borderWidth: 1, padding: 14, marginHorizontal: 16, marginBottom: 10 },
  chip:        { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginRight: 7 },
  smBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  noteInput:   { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: TYPO.label, marginTop: 4 },
  declineBox:  { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8 },
  completedRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 10, marginHorizontal: 16, marginBottom: 8 },
});
