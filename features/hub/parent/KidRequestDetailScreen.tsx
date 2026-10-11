/**
 * KidRequestDetailScreen — full-page action-center detail for a single kid
 * request (Part F of the Kid Requests review-screen plan).
 *
 * Mirrors QuestDetailModal's header pattern exactly: a "‹ Back" text link
 * (not PageHeading, not an X button), wrapped in FullPageOverlay, with
 * hideTabBar()/showTabBar() on mount/unmount. All the lifecycle action
 * logic (decline, self-assign, assign helper, complete, reassign, withdraw,
 * per-item grocery/supplies approve/reject) is relocated here verbatim from
 * the old HelpDispatchQueue.tsx inline cards — not duplicated, not
 * reinvented.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useKidRequestStore, REQUEST_META } from '@/store/kidRequestStore';
import type { KidRequest, KidRequestEvent, RequestEventType } from '@/store/kidRequestStore';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';
import { GEMINI } from '@/constants/geminiRhythm';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { fmtDateShort, fmtTime } from '@/lib/dates';
import { humanDetail, isItemRequest, addApprovedItemsToStore } from '../HelpDispatchQueue';

const DECLINE_PRESETS = [
  'Kid playing with system',
  'Do homework first',
  'Ask again after chores',
  'Parents busy right now',
];

const EVENT_LABEL: Record<RequestEventType, string> = {
  created:        'sent the request',
  approved:       'approved the request',
  declined:       'declined the request',
  assigned:       'assigned a helper',
  reassigned:     'reassigned the helper',
  completed:      'marked completed',
  cancelled:      'cancelled the request',
  gp_toggled:     'updated grandparent visibility',
  read:           'viewed the request',
  items_approved: 'approved items',
  items_rejected: 'rejected items',
  items_appended: 'added more items',
};

function fmt12h(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

export function KidRequestDetailScreen({ requestId, onClose }: {
  requestId: string;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const {
    requests, declineRequest, assignRequest, completeRequest,
    approveItems, rejectItems, approveAllItems, rejectAllItems,
  } = useKidRequestStore();

  const activeMember = members.find(m => m.id === activeMemberId);
  const isParentOrSenior = activeMember?.role === 'parent' || activeMember?.role === 'senior';

  const req = requests.find(r => r.id === requestId);

  const canvas = isDark ? '#0E0C13' : GEMINI.canvas;

  useEffect(() => {
    hideTabBar();
    return () => showTabBar();
  }, []);

  // ── History timeline ──────────────────────────────────────────────────────
  const [events, setEvents] = useState<KidRequestEvent[]>([]);
  useEffect(() => {
    let cancelled = false;
    useKidRequestStore.getState().getEventsForRequest(requestId).then(rows => {
      if (!cancelled) setEvents(rows);
    });
    return () => { cancelled = true; };
  }, [requestId]);

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? id;
  const helperName = (id: string) => id === 'ai-tutor' ? 'AI Family Tutor' : memberName(id);

  const adultHelpers = [
    ...members.filter(m => m.role === 'parent' || m.role === 'senior'),
    { id: 'ai-tutor', name: '🤖 AI Family Tutor', role: 'parent', emoji: '🤖' } as any,
  ];

  // Action state (relocated from HelpDispatchQueue.tsx)
  const [declineOpen,    setDeclineOpen]    = useState(false);
  const [declineReason,  setDeclineReason]  = useState('');
  const [selectedHelper, setSelectedHelper] = useState<string | null>(null);
  const [assignNote,     setAssignNote]     = useState('');
  const [helperOpen,     setHelperOpen]     = useState(false);

  const [processingDecline,  setProcessingDecline]  = useState(false);
  const [processingAssign,   setProcessingAssign]   = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [processingWithdraw, setProcessingWithdraw] = useState(false);

  const [itemNote, setItemNote] = useState('');

  if (!req) {
    return (
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 8 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.teal }}>‹ Back</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ fontSize: 15, color: colors.textSecondary }}>Request not found</Text>
        </View>
      </View>
    );
  }

  const meta = REQUEST_META[req.type];
  const requester = members.find(m => m.id === req.fromMemberId);
  const itemRequest = isItemRequest(req);
  const isViewerKidSender = req.fromMemberId === activeMemberId;

  const doDecline = async () => {
    if (processingDecline) return;
    setProcessingDecline(true);
    await new Promise(r => setTimeout(r, 700));
    declineRequest(req.id, activeMemberId ?? '', declineReason || 'Request dismissed by parent');
    setDeclineOpen(false);
    setProcessingDecline(false);
  };

  const doSelfAssign = async () => {
    if (!activeMemberId || processingAssign) return;
    setProcessingAssign(true);
    await new Promise(r => setTimeout(r, 800));
    addApprovedItemsToStore(req, activeMember, members);
    assignRequest(req.id, activeMemberId, assignNote, activeMemberId);
    setProcessingAssign(false);
  };

  const doAssignHelper = async (helperId?: string) => {
    const hId = helperId ?? selectedHelper;
    if (!hId || processingAssign) return;
    setProcessingAssign(true);
    await new Promise(r => setTimeout(r, 800));
    addApprovedItemsToStore(req, activeMember, members);
    assignRequest(req.id, hId, assignNote, activeMemberId ?? undefined);
    setProcessingAssign(false);
    setHelperOpen(false);
  };

  const doComplete = async () => {
    if (processingComplete) return;
    setProcessingComplete(true);
    await new Promise(r => setTimeout(r, 800));
    completeRequest(req.id, activeMemberId ?? '');
    setProcessingComplete(false);
  };

  const doWithdraw = async () => {
    if (processingWithdraw) return;
    setProcessingWithdraw(true);
    await new Promise(r => setTimeout(r, 700));
    useKidRequestStore.getState().cancelRequest(req.id);
    setProcessingWithdraw(false);
  };

  const chipBg = isDark ? '#1E1E2A' : '#EEECF2';

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      {/* Top bar — "‹ Back" link, matching QuestDetailModal exactly */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 8 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.teal }}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* ── Context block ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 6, marginBottom: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.heroBadge, { backgroundColor: meta.bgColor }]}>
              <Text style={{ fontSize: 30 }}>{meta.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>
                {requester?.name ?? 'Member'}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 1 }}>
                {meta.label} · {fmt12h(req.requestedAt)}
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 15, color: colors.textPrimary, lineHeight: 22 }}>
            {humanDetail(req)}
          </Text>

          {/* Type-specific fields shown only when present */}
          <View style={{ gap: 8 }}>
            {req.location ? (
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>📍 {req.location}</Text>
            ) : null}
            {(req.scheduledDate || req.scheduledTime) ? (
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                📅 {[req.scheduledDate ? fmtDateShort(req.scheduledDate) : null, req.scheduledTime ? fmtTime(req.scheduledTime) : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {req.attachmentUrl ? (
              <Image source={{ uri: req.attachmentUrl }} style={{ width: '100%', height: 180, borderRadius: 14, backgroundColor: chipBg }} />
            ) : null}
            {!!req.rewardCoins && req.rewardCoins > 0 ? (
              <View style={[styles.coinBadge, { backgroundColor: colors.amberLight, alignSelf: 'flex-start' }]}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.amber }}>+{req.rewardCoins} 🪙</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>

          {/* ── Per-item approve/reject panel — grocery/supplies ── */}
          {itemRequest && req.items && req.items.length > 0 && (
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: colors.amber, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                📦 {req.items.length} item{req.items.length === 1 ? '' : 's'} requested
              </Text>
              {req.items.map(item => {
                const isPending  = item.status === 'pending';
                const isApproved = item.status === 'approved';
                const isRejected = item.status === 'rejected';
                return (
                  <View key={item.id} style={{
                    borderRadius: 10, borderWidth: 1.5, padding: 8, gap: 4,
                    backgroundColor: isApproved ? colors.tealLight : isRejected ? colors.primaryLight : colors.card,
                    borderColor: isApproved ? colors.teal : isRejected ? colors.danger : colors.border,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13 }}>{item.emoji ?? '🛒'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>
                          {item.name}{item.qty ? <Text style={{ fontWeight: '400', color: colors.textSecondary }}> × {item.qty}</Text> : null}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.textTertiary }}>{item.category}</Text>
                      </View>
                      {isPending && isParentOrSenior ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            onPress={() => { approveItems(req.id, [item.id], activeMemberId ?? '', itemNote); addApprovedItemsToStore({ ...req, items: [item] }, activeMember, members); }}
                            style={{ borderRadius: 8, backgroundColor: colors.teal, paddingHorizontal: 10, paddingVertical: 5 }}>
                            <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>✓ OK</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => rejectItems(req.id, [item.id], activeMemberId ?? '', itemNote)}
                            style={{ borderRadius: 8, backgroundColor: colors.danger, paddingHorizontal: 10, paddingVertical: 5 }}>
                            <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>✗ No</Text>
                          </TouchableOpacity>
                        </View>
                      ) : !isPending ? (
                        <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                          backgroundColor: isApproved ? colors.tealLight : colors.primaryLight }}>
                          <Text style={{ fontSize: 12, fontWeight: '900', color: isApproved ? colors.teal : colors.danger }}>
                            {isApproved ? '✓ Approved' : '✗ Rejected'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {item.parentNote ? (
                      <Text style={{ fontSize: 12, fontStyle: 'italic', color: colors.textTertiary, paddingLeft: 20 }}>
                        "{item.parentNote}"
                      </Text>
                    ) : null}
                  </View>
                );
              })}

              {isParentOrSenior && req.items.some(it => it.status === 'pending') && (
                <>
                  <TextInput
                    style={[styles.noteInput, { color: colors.textPrimary, borderColor: colors.amber, backgroundColor: colors.card }]}
                    placeholder="Comment for all items (optional)…"
                    placeholderTextColor={colors.textTertiary}
                    maxLength={150}
                    value={itemNote}
                    onChangeText={setItemNote}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => { approveAllItems(req.id, activeMemberId ?? '', itemNote); addApprovedItemsToStore(req, activeMember, members, new Set(req.items!.filter(i => i.status === 'pending').map(i => i.id))); }}
                      style={{ flex: 1, borderRadius: 12, backgroundColor: colors.teal, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>✓ Approve All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => rejectAllItems(req.id, activeMemberId ?? '', itemNote)}
                      style={{ flex: 1, borderRadius: 12, backgroundColor: colors.danger, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>✗ Reject All</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── Action center ── */}

          {/* Kid is the sender, still pending → waiting + withdraw, replaces parent actions */}
          {isViewerKidSender && req.status === 'pending' ? (
            <View style={{ backgroundColor: colors.amberLight, borderRadius: 16, padding: 16, gap: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.amber }}>Waiting for parent approval…</Text>
              <TouchableOpacity onPress={doWithdraw} disabled={processingWithdraw} style={{ opacity: processingWithdraw ? 0.5 : 1 }}>
                {processingWithdraw
                  ? <ActivityIndicator color={colors.danger} size="small" />
                  : <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>🗑️ Withdraw Request</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Parent/senior actions — pending, non-item type */}
          {!isViewerKidSender && isParentOrSenior && req.status === 'pending' && !itemRequest && (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: colors.amber }}>Assign Tutor / Helper or Decline:</Text>
                <TouchableOpacity onPress={() => setDeclineOpen(v => !v)}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: colors.danger }}>❌ Decline Request</Text>
                </TouchableOpacity>
              </View>

              {declineOpen ? (
                <View style={{ borderRadius: 14, borderWidth: 1, padding: 10, gap: 8, backgroundColor: colors.surface, borderColor: colors.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: colors.danger }}>Select or Type Reason to Decline:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {DECLINE_PRESETS.map(preset => (
                      <TouchableOpacity
                        key={preset}
                        style={{ borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7,
                          backgroundColor: declineReason === preset ? colors.danger : colors.card,
                          borderColor: declineReason === preset ? colors.danger : colors.border }}
                        onPress={() => setDeclineReason(preset)}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: declineReason === preset ? '#fff' : colors.textSecondary }}>
                          {preset}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.noteInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.card }]}
                    placeholder="Custom reason (max 150 chars)..."
                    placeholderTextColor={colors.textTertiary}
                    maxLength={150}
                    value={declineReason}
                    onChangeText={v => setDeclineReason(v.slice(0, 150))}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      style={{ borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: colors.card }}
                      onPress={() => setDeclineOpen(false)}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '900', color: colors.textSecondary }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: colors.danger, opacity: processingDecline ? 0.5 : 1 }}
                      onPress={doDecline}
                      disabled={processingDecline}
                    >
                      {processingDecline
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>Confirm Decline</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <TouchableOpacity
                    style={{ borderRadius: 14, padding: 13, backgroundColor: colors.teal, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: processingAssign ? 0.5 : 1 }}
                    onPress={doSelfAssign}
                    disabled={processingAssign}
                  >
                    {processingAssign
                      ? <><ActivityIndicator color="#fff" size="small" /><Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>Assigning...</Text></>
                      : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>⚡ Self-Assign ({activeMember?.name?.split(' ')[0]})</Text>}
                  </TouchableOpacity>

                  <View style={{ position: 'relative' }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={{ borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: colors.amber, backgroundColor: colors.surface, flex: 1 }}
                        onPress={() => setHelperOpen(v => !v)}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: selectedHelper ? colors.textPrimary : colors.textTertiary }} numberOfLines={1}>
                          {selectedHelper ? helperName(selectedHelper) : 'Assign helper...'}
                        </Text>
                        <Text style={{ color: colors.textTertiary }}>▾</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ backgroundColor: colors.pink, borderRadius: 14, padding: 13, alignItems: 'center', justifyContent: 'center', minWidth: 72, opacity: (!selectedHelper || processingAssign) ? 0.4 : 1 }}
                        onPress={() => doAssignHelper()}
                        disabled={!selectedHelper || processingAssign}
                      >
                        {processingAssign
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>Assign</Text>}
                      </TouchableOpacity>
                    </View>

                    {helperOpen && (
                      <View style={withAndroidShadowFix([styles.helperDropdown, { backgroundColor: colors.card, borderColor: colors.surface }])}>
                        {adultHelpers.filter(h => h.id !== req.assignedHelper).map(h => (
                          <TouchableOpacity
                            key={h.id}
                            style={[{ padding: 10 }, selectedHelper === h.id && { backgroundColor: colors.pinkLight }]}
                            onPress={() => { setSelectedHelper(h.id); setHelperOpen(false); }}
                          >
                            <Text style={{ fontSize: 14, fontWeight: '600', color: selectedHelper === h.id ? colors.pink : colors.textPrimary }}>
                              {h.emoji ?? '👤'} {h.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {selectedHelper && selectedHelper !== activeMemberId && (
                    <TextInput
                      style={[styles.noteInput, { color: colors.textPrimary, borderColor: colors.amber, backgroundColor: colors.surface }]}
                      placeholder={`Reason / Note for ${helperName(selectedHelper)} (optional)...`}
                      placeholderTextColor={colors.textTertiary}
                      maxLength={150}
                      value={assignNote}
                      onChangeText={v => setAssignNote(v.slice(0, 150))}
                    />
                  )}
                </View>
              )}
            </View>
          )}

          {/* Approved, non-item type → complete + reassign */}
          {!isViewerKidSender && req.status === 'approved' && !itemRequest && (
            <View style={{ gap: 10 }}>
              {req.parentNote ? (
                <View style={{ backgroundColor: colors.pinkLight, borderRadius: 14, padding: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', fontStyle: 'italic', color: colors.pink }}>📝 Note: "{req.parentNote}"</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  Assigned: <Text style={{ fontWeight: '900', color: colors.pink }}>{req.assignedHelper ? helperName(req.assignedHelper) : 'Parent'}</Text>
                </Text>
                {(isParentOrSenior || req.assignedHelper === activeMemberId || req.fromMemberId === activeMemberId) && (
                  <TouchableOpacity
                    style={{ backgroundColor: colors.pink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: processingComplete ? 0.5 : 1 }}
                    onPress={doComplete}
                    disabled={processingComplete}
                  >
                    {processingComplete
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>Mark Completed</Text>}
                  </TouchableOpacity>
                )}
              </View>

              {isParentOrSenior && (
                <View style={{ backgroundColor: colors.pinkLight, borderRadius: 12, padding: 10, gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.pink }}>Reassign Tutor:</Text>
                    <View style={{ flex: 1, position: 'relative' }}>
                      <TouchableOpacity
                        style={{ borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: colors.pink, backgroundColor: colors.surface, flex: 1 }}
                        onPress={() => setHelperOpen(v => !v)}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: selectedHelper ? colors.textPrimary : colors.textTertiary, flex: 1 }} numberOfLines={1}>
                          {selectedHelper ? helperName(selectedHelper) : 'Reassign to...'}
                        </Text>
                        <Text style={{ color: colors.textTertiary }}>▾</Text>
                      </TouchableOpacity>
                      {helperOpen && (
                        <View style={withAndroidShadowFix([styles.helperDropdown, { top: 50, backgroundColor: colors.card, borderColor: colors.surface }])}>
                          {adultHelpers.filter(h => h.id !== req.assignedHelper).map(h => (
                            <TouchableOpacity
                              key={h.id}
                              style={[{ padding: 10 }, selectedHelper === h.id && { backgroundColor: colors.pinkLight }]}
                              onPress={() => { setSelectedHelper(h.id); setHelperOpen(false); }}
                            >
                              <Text style={{ fontSize: 14, fontWeight: '600', color: selectedHelper === h.id ? colors.pink : colors.textPrimary }}>
                                {h.emoji ?? '👤'} {h.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: colors.pink, borderRadius: 14, padding: 13, alignItems: 'center', justifyContent: 'center', minWidth: 72, opacity: !selectedHelper ? 0.4 : 1 }}
                      onPress={() => doAssignHelper()}
                      disabled={!selectedHelper}
                    >
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>Reassign</Text>
                    </TouchableOpacity>
                  </View>
                  {selectedHelper && selectedHelper !== req.assignedHelper && (
                    <TextInput
                      style={[styles.noteInput, { color: colors.textPrimary, borderColor: colors.pink, backgroundColor: colors.surface }]}
                      placeholder={`Reason / Note for ${helperName(selectedHelper)} (optional)...`}
                      placeholderTextColor={colors.textTertiary}
                      maxLength={150}
                      value={assignNote}
                      onChangeText={v => setAssignNote(v.slice(0, 150))}
                    />
                  )}
                </View>
              )}
            </View>
          )}

          {/* Approved + item request → read-only note */}
          {req.status === 'approved' && itemRequest && (
            <View style={{ backgroundColor: colors.tealLight, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>✓ Added to the grocery list</Text>
            </View>
          )}

          {/* Declined → read-only */}
          {req.status === 'declined' && (
            <View style={{ backgroundColor: colors.primaryLight, borderRadius: 14, padding: 14, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.danger }}>Declined</Text>
              {req.parentNote ? (
                <Text style={{ fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' }}>"{req.parentNote}"</Text>
              ) : null}
            </View>
          )}

          {/* ── History timeline ── */}
          {events.length > 0 && (
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textTertiary }}>
                HISTORY
              </Text>
              {events.map(ev => {
                const actorFirst = memberName(ev.actorId).split(' ')[0];
                const label = EVENT_LABEL[ev.eventType] ?? ev.eventType;
                return (
                  <View key={ev.id} style={{ gap: 1 }}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      {fmt12h(ev.createdAt)} · {actorFirst} {label}
                      {ev.note ? ` (${ev.note})` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heroBadge:  { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  coinBadge:  { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  noteInput:  { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
  helperDropdown: {
    position: 'absolute', top: 44, left: 0, right: 0, borderWidth: 1, borderRadius: 12, zIndex: 999,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8,
  },
});
