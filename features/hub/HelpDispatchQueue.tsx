/**
 * HelpDispatchQueue
 * 100% port of gemini-code HelpDispatchQueue.tsx to React Native.
 * Pending → Assigned → Completed sections with full RBAC actions.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useKidRequestStore, REQUEST_META } from '@/store/kidRequestStore';
import type { KidRequest, KidRequestItem } from '@/store/kidRequestStore';
import { useGroceryStore } from '@/store/groceryStore';
import { decodeGroceryRequest, GROCERY_PREFIX, SUPPLIES_PREFIX } from './KidView';
import { BRAND } from '@/components/FamilyCubeLogo';

// ─── Icons ────────────────────────────────────────────────────────────────────

function HelpCircleIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M9,9 C9,6.2 15,6.2 15,9 C15,11 13,11.5 12,13" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={12} cy={17} r={1} fill={color} />
    </Svg>
  );
}

function CheckCircle({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M8,13 L11,16 L16,8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function UserCheckIcon({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M16,21 V19 C16,16.8 14.2,15 12,15 H5 C2.8,15 1,16.8 1,19 V21" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={8.5} cy={7} r={4} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M17,11 L19,13 L23,9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function ShieldCheck({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12,22 C12,22 4,18 4,12 V5 L12,2 L20,5 V12 C20,18 12,22 12,22 Z" stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M9,12 L11,14 L15,10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function ClockIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M12,7 L12,12 L16,14" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function PlusIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12,5 L12,19 M5,12 L19,12" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ─── Urgency helpers ──────────────────────────────────────────────────────────

const URGENCY_LABEL: Record<string, string> = {
  urgent:    'High',
  soon:      'Medium',
  normal:    'Low',
  emergency: 'High',
};

// ─── Preset decline reasons ───────────────────────────────────────────────────

const DECLINE_PRESETS = [
  'Kid playing with system',
  'Do homework first',
  'Ask again after chores',
  'Parents busy right now',
];

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onRequestHelpOpen: () => void;
}

export default function HelpDispatchQueue({ onRequestHelpOpen }: Props) {
  const { colors, isDark } = useTheme();
  const members = useFamilyStore(s => s.members);
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const {
    requests, declineRequest, assignRequest, completeRequest,
    approveItems, rejectItems, approveAllItems, rejectAllItems,
  } = useKidRequestStore();
  const { addItem: addGroceryItem } = useGroceryStore();

  const activeMember = members.find(m => m.id === activeMemberId);
  const isParentOrSenior = activeMember?.role === 'parent' || activeMember?.role === 'senior';

  const pending   = useMemo(() => requests.filter(r => r.status === 'pending'),    [requests]);
  const assigned  = useMemo(() => requests.filter(r => r.status === 'approved'),   [requests]);
  const completed = useMemo(() => requests.filter(r => r.status === 'completed').slice(0, 3), [requests]);

  const adultHelpers = [
    ...members.filter(m => m.role === 'parent' || m.role === 'senior'),
    { id: 'ai-tutor', name: '🤖 AI Family Tutor', role: 'parent', emoji: '🤖' } as any,
  ];

  // Per-card state
  const [declineOpen,    setDeclineOpen]    = useState<Record<string, boolean>>({});
  const [declineReason,  setDeclineReason]  = useState<Record<string, string>>({});
  const [selectedHelper, setSelectedHelper] = useState<Record<string, string>>({});
  const [assignNote,     setAssignNote]     = useState<Record<string, string>>({});
  const [helperOpen,     setHelperOpen]     = useState<Record<string, boolean>>({});

  const [processingDecline,  setProcessingDecline]  = useState<Record<string, boolean>>({});
  const [processingAssign,   setProcessingAssign]   = useState<Record<string, boolean>>({});
  const [processingComplete, setProcessingComplete] = useState<Record<string, boolean>>({});
  const [processingWithdraw, setProcessingWithdraw] = useState<Record<string, boolean>>({});

  // Per-item approval state (keyed by requestId)
  const [itemNote,      setItemNote]      = useState<Record<string, string>>({});    // requestId → shared comment
  const [itemExpanded,  setItemExpanded]  = useState<Record<string, boolean>>({});   // requestId → show item list

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? id;
  const helperName = (id: string) => id === 'ai-tutor' ? 'AI Family Tutor' : memberName(id);

  // Returns a human-readable summary for grocery/supplies delegation requests
  const humanDetail = (req: KidRequest): string => {
    if (req.type !== 'delegation') return req.detail;
    if (req.detail.startsWith(GROCERY_PREFIX)) {
      const p = decodeGroceryRequest(req.detail);
      if (!p) return req.detail;
      return `🛒 Grocery: ${p.name}${p.qty ? ` × ${p.qty}` : ''} [${p.category}]${p.notes ? ` — "${p.notes}"` : ''}`;
    }
    if (req.detail.startsWith(SUPPLIES_PREFIX)) {
      try {
        const p = JSON.parse(req.detail.slice(SUPPLIES_PREFIX.length)) as { items: { name: string; qty: string }[]; notes: string; urgency: string };
        const list = p.items.map(i => `${i.name}${i.qty ? ` ×${i.qty}` : ''}`).join(', ');
        return `📚 School Supplies: ${list}${p.notes ? ` — "${p.notes}"` : ''}`;
      } catch { return req.detail; }
    }
    return req.detail;
  };

  // Add approved items to the grocery store
  const addApprovedItemsToStore = (req: KidRequest, approvedItemIds?: Set<string>) => {
    if (req.type !== 'delegation') return;
    const familyId    = activeMember?.familyId ?? members[0]?.familyId ?? 'family-1';
    const approverName = memberName(activeMemberId ?? '');
    const approvedNote = `Approved by ${approverName} · Requested by ${memberName(req.fromMemberId)}`;

    if (req.items && req.items.length > 0) {
      // New multi-item format — only add the approved subset
      req.items
        .filter(it => !approvedItemIds || approvedItemIds.has(it.id))
        .forEach(item => {
          addGroceryItem({
            familyId,
            name: item.name,
            quantity: item.qty || undefined,
            category: item.category,
            addedBy: req.fromMemberId,
            notes: approvedNote,
          });
        });
    } else if (req.detail.startsWith(GROCERY_PREFIX)) {
      const parsed = decodeGroceryRequest(req.detail);
      if (parsed) addGroceryItem({ familyId, name: parsed.name, quantity: parsed.qty || undefined, category: parsed.category, addedBy: req.fromMemberId, notes: [approvedNote, parsed.notes].filter(Boolean).join(' · ') || undefined });
    } else if (req.detail.startsWith(SUPPLIES_PREFIX)) {
      try {
        const parsed = JSON.parse(req.detail.slice(SUPPLIES_PREFIX.length)) as { items: { name: string; qty: string }[]; notes: string };
        parsed.items.forEach(item => addGroceryItem({ familyId, name: item.name, quantity: item.qty || undefined, category: 'School Supplies', addedBy: req.fromMemberId, notes: [approvedNote, parsed.notes].filter(Boolean).join(' · ') || undefined }));
      } catch { /* ignore */ }
    }
  };

  // Legacy single-approve (non-item requests)
  const handleGroceryApproval = (req: KidRequest, approverId: string) => addApprovedItemsToStore(req);

  const doDecline = async (id: string) => {
    if (processingDecline[id]) return;
    setProcessingDecline(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 700));
    declineRequest(id, activeMemberId ?? '', declineReason[id] || 'Request dismissed by parent');
    setDeclineOpen(p => ({ ...p, [id]: false }));
    setProcessingDecline(p => ({ ...p, [id]: false }));
  };

  const doSelfAssign = async (id: string) => {
    if (!activeMemberId || processingAssign[id]) return;
    setProcessingAssign(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 800));
    const req = requests.find(r => r.id === id);
    if (req) handleGroceryApproval(req, activeMemberId);
    assignRequest(id, activeMemberId, assignNote[id]);
    setProcessingAssign(p => ({ ...p, [id]: false }));
  };

  const doAssignHelper = async (id: string, helperId?: string) => {
    const hId = helperId ?? selectedHelper[id];
    if (!hId || processingAssign[id]) return;
    setProcessingAssign(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 800));
    const req = requests.find(r => r.id === id);
    if (req) handleGroceryApproval(req, hId);
    assignRequest(id, hId, assignNote[id]);
    setProcessingAssign(p => ({ ...p, [id]: false }));
    setHelperOpen(p => ({ ...p, [id]: false }));
  };

  const doComplete = async (id: string) => {
    if (processingComplete[id]) return;
    setProcessingComplete(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 800));
    completeRequest(id, activeMemberId ?? '');
    setProcessingComplete(p => ({ ...p, [id]: false }));
  };

  const doWithdraw = async (id: string) => {
    if (processingWithdraw[id]) return;
    setProcessingWithdraw(p => ({ ...p, [id]: true }));
    await new Promise(r => setTimeout(r, 700));
    useKidRequestStore.getState().cancelRequest(id);
    setProcessingWithdraw(p => ({ ...p, [id]: false }));
  };

  const cardBg   = isDark ? '#131927' : '#FFFFFF';
  const divider  = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9';
  const allReqs  = [...pending, ...assigned, ...completed];

  return (
    <View style={[q.card, { backgroundColor: cardBg, borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
      {/* Header */}
      <View style={[q.header, { borderBottomColor: divider }]}>
        <View style={[q.iconWrap, { backgroundColor: BRAND.amber + '25' }]}>
          <HelpCircleIcon color={BRAND.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[q.title, { color: colors.textPrimary }]}>Family Support & Help Queue</Text>
          <Text style={[q.subtitle, { color: colors.textSecondary }]}>
            Kids ask for assistance & parents approve/self-assign
          </Text>
        </View>
        <TouchableOpacity style={[q.askBtn, { backgroundColor: BRAND.purple }]} onPress={onRequestHelpOpen}>
          <PlusIcon color="#fff" size={14} />
          <Text style={q.askBtnText}>Ask for Help</Text>
        </TouchableOpacity>
      </View>

      {/* Empty state */}
      {allReqs.length === 0 && (
        <View style={[q.emptyBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
          <Text style={[q.emptyText, { color: colors.textTertiary }]}>
            No active help requests. Kids can click "Ask for Help" anytime!
          </Text>
        </View>
      )}

      {/* ── Pending requests ── */}
      {pending.map(req => {
        const meta      = REQUEST_META[req.type];
        const requester = members.find(m => m.id === req.fromMemberId);
        const urgLabel  = URGENCY_LABEL[req.urgency] ?? 'Normal';
        const isDeclineOpen = declineOpen[req.id];
        const selHelper = selectedHelper[req.id];
        const isSelf    = selHelper === activeMemberId;

        return (
          <View key={req.id} style={[q.reqCard, { backgroundColor: BRAND.amber + '18', borderColor: BRAND.amber + '33' }]}>
            {/* Top row */}
            <View style={q.reqTop}>
              <View style={{ flex: 1 }}>
                <View style={q.badges}>
                  <Text style={[q.reqName, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                    🙋 {requester?.name ?? 'Member'} needs help:
                  </Text>
                  <View style={[q.badge, { backgroundColor: isDark ? '#78350F' : '#FDE68A' }]}>
                    <Text style={[q.badgeText, { color: isDark ? '#FCD34D' : '#92400E' }]}>{meta.label}</Text>
                  </View>
                  {req.urgency === 'urgent' || req.urgency === 'emergency' ? (
                    <View style={[q.badge, { backgroundColor: isDark ? '#450A0A' : '#FEE2E2' }]}>
                      <Text style={[q.badgeText, { color: '#EF4444' }]}>🔴 Urgent</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[q.reqDetail, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>"{humanDetail(req)}"</Text>
              </View>
              {req.rewardCoins ? (
                <View style={[q.coinBadge, { backgroundColor: BRAND.amber + '33' }]}>
                  <Text style={[q.coinText, { color: BRAND.amber }]}>+{req.rewardCoins} 🪙</Text>
                </View>
              ) : null}
            </View>

            {/* ── Per-item approval panel (grocery/supplies with items[]) ── */}
            {isParentOrSenior && req.type === 'delegation' && req.items && req.items.length > 0 && (
              <View style={{ borderTopWidth: 1, borderTopColor: BRAND.amber + '33', paddingTop: 10, gap: 8 }}>
                {/* Bulk actions header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: isDark ? '#FCD34D' : '#B45309' }}>
                    📦 {req.items.length} items requested by {memberName(req.fromMemberId)}:
                  </Text>
                  <TouchableOpacity onPress={() => setItemExpanded(p => ({ ...p, [req.id]: !p[req.id] }))}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: BRAND.purple }}>
                      {itemExpanded[req.id] ? '▲ collapse' : '▼ review items'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {itemExpanded[req.id] && (
                  <>
                    {/* Per-item rows */}
                    {req.items.map(item => {
                      const isPending  = item.status === 'pending';
                      const isApproved = item.status === 'approved';
                      const isRejected = item.status === 'rejected';
                      return (
                        <View key={item.id} style={{
                          borderRadius: 10, borderWidth: 1.5, padding: 8, gap: 4,
                          backgroundColor: isApproved ? '#10B98112' : isRejected ? '#EF444412' : (isDark ? colors.surface : '#FAFAFA'),
                          borderColor: isApproved ? '#10B98150' : isRejected ? '#EF444450' : colors.border,
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 13 }}>{item.emoji ?? '🛒'}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary }}>
                                {item.name}{item.qty ? <Text style={{ fontWeight: '400', color: colors.textSecondary }}> × {item.qty}</Text> : null}
                              </Text>
                              <Text style={{ fontSize: 10, color: colors.textTertiary }}>{item.category}</Text>
                            </View>
                            {isPending ? (
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                <TouchableOpacity
                                  onPress={() => { approveItems(req.id, [item.id], activeMemberId ?? '', itemNote[req.id]); addApprovedItemsToStore({ ...req, items: [item] }); }}
                                  style={{ borderRadius: 8, backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 5 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>✓ OK</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => rejectItems(req.id, [item.id], activeMemberId ?? '', itemNote[req.id])}
                                  style={{ borderRadius: 8, backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 5 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>✗ No</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                                backgroundColor: isApproved ? '#10B98120' : '#EF444420' }}>
                                <Text style={{ fontSize: 10, fontWeight: '900', color: isApproved ? '#10B981' : '#EF4444' }}>
                                  {isApproved ? '✓ Approved' : '✗ Rejected'}
                                </Text>
                              </View>
                            )}
                          </View>
                          {(item.parentNote) && (
                            <Text style={{ fontSize: 10, fontStyle: 'italic', color: colors.textTertiary, paddingLeft: 20 }}>
                              "{item.parentNote}"
                            </Text>
                          )}
                        </View>
                      );
                    })}

                    {/* Comment for this batch */}
                    <TextInput
                      style={[q.noteInput, { color: colors.textPrimary, borderColor: isDark ? '#4B2E00' : '#D97706', backgroundColor: isDark ? '#0F172A' : '#fff' }]}
                      placeholder="Comment for all items (optional)…"
                      placeholderTextColor={colors.textTertiary}
                      maxLength={150}
                      value={itemNote[req.id] ?? ''}
                      onChangeText={v => setItemNote(p => ({ ...p, [req.id]: v }))}
                    />

                    {/* Bulk approve / reject all pending */}
                    {req.items.some(it => it.status === 'pending') && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => { approveAllItems(req.id, activeMemberId ?? '', itemNote[req.id]); addApprovedItemsToStore(req, new Set(req.items!.filter(i => i.status === 'pending').map(i => i.id))); }}
                          style={{ flex: 1, borderRadius: 12, backgroundColor: '#10B981', paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>✓ Approve All</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => rejectAllItems(req.id, activeMemberId ?? '', itemNote[req.id])}
                          style={{ flex: 1, borderRadius: 12, backgroundColor: '#EF4444', paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>✗ Reject All</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Parent actions */}
            {isParentOrSenior && !(req.type === 'delegation' && req.items && req.items.length > 0) ? (
              <View style={[q.actionsWrap, { borderTopColor: BRAND.amber + '33' }]}>
                <View style={q.actionHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck color={isDark ? '#FCD34D' : '#92400E'} />
                    <Text style={[q.actionHeaderText, { color: isDark ? '#FCD34D' : '#B45309' }]}>
                      Assign Tutor / Helper or Decline:
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setDeclineOpen(p => ({ ...p, [req.id]: !p[req.id] }))}>
                    <Text style={q.declineLink}>❌ Decline Request</Text>
                  </TouchableOpacity>
                </View>

                {/* Decline panel */}
                {isDeclineOpen && (
                  <View style={[q.declinePanel, { backgroundColor: isDark ? '#450A0A' : '#FFF1F2', borderColor: isDark ? '#7F1D1D' : '#FDA4AF' }]}>
                    <Text style={[q.declinePanelTitle, { color: isDark ? '#FCA5A5' : '#9F1239' }]}>
                      Select or Type Reason to Decline:
                    </Text>
                    <View style={q.presets}>
                      {DECLINE_PRESETS.map(preset => (
                        <TouchableOpacity
                          key={preset}
                          style={[q.presetChip,
                            declineReason[req.id] === preset
                              ? { backgroundColor: '#EF4444', borderColor: '#EF4444' }
                              : { backgroundColor: isDark ? '#0F172A' : '#fff', borderColor: isDark ? '#374151' : '#D1D5DB' }
                          ]}
                          onPress={() => setDeclineReason(p => ({ ...p, [req.id]: preset }))}
                        >
                          <Text style={[q.presetText, { color: declineReason[req.id] === preset ? '#fff' : colors.textSecondary }]}>
                            {preset}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={[q.declineInput, { color: colors.textPrimary, borderColor: isDark ? '#374151' : '#D1D5DB', backgroundColor: isDark ? '#0F172A' : '#fff' }]}
                      placeholder="Custom reason (max 150 chars)..."
                      placeholderTextColor={colors.textTertiary}
                      maxLength={150}
                      value={declineReason[req.id] ?? ''}
                      onChangeText={v => setDeclineReason(p => ({ ...p, [req.id]: v.slice(0, 150) }))}
                    />
                    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                      <TouchableOpacity
                        style={[q.declineBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                        onPress={() => setDeclineOpen(p => ({ ...p, [req.id]: false }))}
                      >
                        <Text style={[q.declineBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[q.declineBtn, { backgroundColor: '#EF4444', opacity: processingDecline[req.id] ? 0.5 : 1 }]}
                        onPress={() => doDecline(req.id)}
                        disabled={processingDecline[req.id]}
                      >
                        {processingDecline[req.id]
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={[q.declineBtnText, { color: '#fff' }]}>Confirm Decline</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Self-assign + helper selector */}
                {!isDeclineOpen && (
                  <View style={{ gap: 8 }}>
                    <TouchableOpacity
                      style={[q.selfAssignBtn, { opacity: processingAssign[req.id] ? 0.5 : 1 }]}
                      onPress={() => doSelfAssign(req.id)}
                      disabled={processingAssign[req.id]}
                    >
                      {processingAssign[req.id]
                        ? <><ActivityIndicator color="#fff" size="small" /><Text style={q.selfAssignText}>Assigning...</Text></>
                        : <Text style={q.selfAssignText}>⚡ Self-Assign ({activeMember?.name?.split(' ')[0]})</Text>}
                    </TouchableOpacity>

                    {/* Helper picker row */}
                    <View style={{ position: 'relative' }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[q.helperTrigger, { borderColor: isDark ? '#78350F' : '#F59E0B', backgroundColor: isDark ? '#0F172A' : '#fff', flex: 1 }]}
                          onPress={() => setHelperOpen(p => ({ ...p, [req.id]: !p[req.id] }))}
                        >
                          <Text style={[q.helperTriggerText, { color: selHelper ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
                            {selHelper ? helperName(selHelper) : 'Assign helper...'}
                          </Text>
                          <Text style={{ color: colors.textTertiary }}>▾</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[q.assignBtn, { opacity: (!selHelper || processingAssign[req.id]) ? 0.4 : 1 }]}
                          onPress={() => doAssignHelper(req.id)}
                          disabled={!selHelper || processingAssign[req.id]}
                        >
                          {processingAssign[req.id]
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={q.assignBtnText}>Assign</Text>}
                        </TouchableOpacity>
                      </View>

                      {helperOpen[req.id] && (
                        <View style={[q.helperDropdown, { backgroundColor: isDark ? '#131927' : '#fff', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                          {adultHelpers
                            .filter(h => h.id !== req.assignedHelper)
                            .map(h => (
                              <TouchableOpacity
                                key={h.id}
                                style={[q.helperOption, selHelper === h.id && { backgroundColor: BRAND.purple + '18' }]}
                                onPress={() => { setSelectedHelper(p => ({ ...p, [req.id]: h.id })); setHelperOpen(p => ({ ...p, [req.id]: false })); }}
                              >
                                <Text style={[q.helperOptionText, { color: selHelper === h.id ? BRAND.purple : colors.textPrimary }]}>
                                  {h.emoji ?? '👤'} {h.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </View>
                      )}
                    </View>

                    {/* Notes input — only when assigning to someone else */}
                    {selHelper && selHelper !== activeMemberId && (
                      <View>
                        <TextInput
                          style={[q.noteInput, { color: colors.textPrimary, borderColor: isDark ? '#4B2E00' : '#D97706', backgroundColor: isDark ? '#0F172A' : '#fff' }]}
                          placeholder={`Reason / Note for ${helperName(selHelper)} (optional)...`}
                          placeholderTextColor={colors.textTertiary}
                          maxLength={150}
                          value={assignNote[req.id] ?? ''}
                          onChangeText={v => setAssignNote(p => ({ ...p, [req.id]: v.slice(0, 150) }))}
                        />
                        <Text style={[q.charCount, { color: BRAND.purple }]}>{(assignNote[req.id] ?? '').length}/150 chars</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : null}

            {/* Kid view — waiting / withdraw */}
            {!isParentOrSenior && (
              <View style={[q.actionsWrap, { borderTopColor: BRAND.amber + '33', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ClockIcon color={isDark ? '#FCD34D' : '#92400E'} />
                  <Text style={[q.waitText, { color: isDark ? '#FCD34D' : '#B45309' }]}>Waiting for parent approval...</Text>
                </View>
                {req.fromMemberId === activeMemberId && (
                  <TouchableOpacity
                    onPress={() => doWithdraw(req.id)}
                    disabled={processingWithdraw[req.id]}
                    style={{ opacity: processingWithdraw[req.id] ? 0.5 : 1 }}
                  >
                    {processingWithdraw[req.id]
                      ? <ActivityIndicator color="#EF4444" size="small" />
                      : <Text style={q.withdrawText}>🗑️ Withdraw Request</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}

      {/* ── Assigned / In-Progress ── */}
      {assigned.map(req => {
        const requester   = members.find(m => m.id === req.fromMemberId);
        const aHelper     = req.assignedHelper;
        const selHelper   = selectedHelper[req.id];
        const canComplete = isParentOrSenior || req.assignedHelper === activeMemberId || req.fromMemberId === activeMemberId;

        return (
          <View key={req.id} style={[q.reqCard, { backgroundColor: BRAND.purple + '18', borderColor: BRAND.purple + '30' }]}>
            <View style={q.reqTop}>
              <View style={{ flex: 1 }}>
                <View style={q.badges}>
                  <Text style={[q.reqName, { color: isDark ? '#C4B5FD' : '#5B21B6' }]}>
                    🤝 {requester?.name ?? 'Member'}'s Request
                  </Text>
                  <View style={[q.badge, { backgroundColor: isDark ? '#4C1D95' : '#EDE9FE' }]}>
                    <Text style={[q.badgeText, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>In Progress</Text>
                  </View>
                </View>
                <Text style={[q.reqDetail, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>"{humanDetail(req)}"</Text>
              </View>
            </View>

            {req.parentNote ? (
              <View style={[q.noteBox, { backgroundColor: BRAND.purple + '20' }]}>
                <Text style={[q.noteBoxText, { color: isDark ? '#C4B5FD' : '#5B21B6' }]}>📝 Note: "{req.parentNote}"</Text>
              </View>
            ) : null}

            <View style={[q.actionsWrap, { borderTopColor: BRAND.purple + '30', gap: 10 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <UserCheckIcon color="#10B981" />
                  <Text style={[q.assignedText, { color: colors.textSecondary }]}>
                    Assigned:{' '}
                    <Text style={{ fontWeight: '900', color: isDark ? '#C4B5FD' : '#5B21B6' }}>
                      {aHelper ? helperName(aHelper) : 'Parent'}
                    </Text>
                  </Text>
                </View>
                {canComplete && (
                  <TouchableOpacity
                    style={[q.completeBtn, { opacity: processingComplete[req.id] ? 0.5 : 1 }]}
                    onPress={() => doComplete(req.id)}
                    disabled={processingComplete[req.id]}
                  >
                    {processingComplete[req.id]
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><CheckCircle color="#fff" size={12} /><Text style={q.completeBtnText}>Mark Completed</Text></>}
                  </TouchableOpacity>
                )}
              </View>

              {/* Reassign — parents only */}
              {isParentOrSenior && (
                <View style={[q.reassignBox, { backgroundColor: BRAND.purple + '15', borderRadius: 12, padding: 10, gap: 8 }]}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Text style={[q.reassignLabel, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>Reassign Tutor:</Text>
                    <View style={{ flex: 1, position: 'relative' }}>
                      <TouchableOpacity
                        style={[q.helperTrigger, { borderColor: isDark ? '#4C1D95' : '#A78BFA', backgroundColor: isDark ? '#0F172A' : '#fff', flex: 1 }]}
                        onPress={() => setHelperOpen(p => ({ ...p, [req.id]: !p[req.id] }))}
                      >
                        <Text style={[q.helperTriggerText, { color: selHelper ? colors.textPrimary : colors.textTertiary, flex: 1 }]} numberOfLines={1}>
                          {selHelper ? helperName(selHelper) : 'Reassign to...'}
                        </Text>
                        <Text style={{ color: colors.textTertiary }}>▾</Text>
                      </TouchableOpacity>
                      {helperOpen[req.id] && (
                        <View style={[q.helperDropdown, { top: 36, backgroundColor: isDark ? '#131927' : '#fff', borderColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                          {adultHelpers.filter(h => h.id !== aHelper).map(h => (
                            <TouchableOpacity
                              key={h.id}
                              style={[q.helperOption, selHelper === h.id && { backgroundColor: BRAND.purple + '18' }]}
                              onPress={() => { setSelectedHelper(p => ({ ...p, [req.id]: h.id })); setHelperOpen(p => ({ ...p, [req.id]: false })); }}
                            >
                              <Text style={[q.helperOptionText, { color: selHelper === h.id ? BRAND.purple : colors.textPrimary }]}>
                                {h.emoji ?? '👤'} {h.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[q.assignBtn, { opacity: !selHelper ? 0.4 : 1 }]}
                      onPress={() => doAssignHelper(req.id)}
                      disabled={!selHelper}
                    >
                      <Text style={q.assignBtnText}>Reassign</Text>
                    </TouchableOpacity>
                  </View>
                  {selHelper && selHelper !== aHelper && (
                    <View>
                      <TextInput
                        style={[q.noteInput, { color: colors.textPrimary, borderColor: isDark ? '#4C1D95' : '#A78BFA', backgroundColor: isDark ? '#0F172A' : '#fff' }]}
                        placeholder={`Reason / Note for ${helperName(selHelper)} (optional)...`}
                        placeholderTextColor={colors.textTertiary}
                        maxLength={150}
                        value={assignNote[req.id] ?? ''}
                        onChangeText={v => setAssignNote(p => ({ ...p, [req.id]: v.slice(0, 150) }))}
                      />
                      <Text style={[q.charCount, { color: BRAND.purple }]}>{(assignNote[req.id] ?? '').length}/150 chars</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        );
      })}

      {/* ── Completed (last 3) ── */}
      {completed.map(req => {
        const requester = members.find(m => m.id === req.fromMemberId);
        return (
          <View key={req.id} style={[q.completedRow, { backgroundColor: '#10B981' + '18', borderColor: '#10B981' + '30' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <CheckCircle color="#10B981" size={14} />
              <Text style={[q.completedText, { color: isDark ? '#6EE7B7' : '#065F46' }]} numberOfLines={1}>
                <Text style={{ fontWeight: '800' }}>{requester?.name ?? 'Member'}:</Text>
                {' '}"{humanDetail(req)}"
              </Text>
            </View>
            <Text style={[q.helperTag, { color: '#10B981' }]}>
              ✓ Helper: {req.assignedHelper ? helperName(req.assignedHelper) : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const q = StyleSheet.create({
  card:        { borderRadius: 24, borderWidth: 1, padding: 14, gap: 10, marginHorizontal: 14, marginBottom: 12 },
  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: 10, borderBottomWidth: 1 },
  iconWrap:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 13, fontWeight: '900' },
  subtitle:    { fontSize: 10, marginTop: 1 },
  askBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  askBtnText:  { color: '#fff', fontSize: 11, fontWeight: '900' },
  emptyBox:    { padding: 16, borderRadius: 16, alignItems: 'center' },
  emptyText:   { fontSize: 11, textAlign: 'center' },

  reqCard:     { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10 },
  reqTop:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  badges:      { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 4 },
  reqName:     { fontSize: 11, fontWeight: '900' },
  reqDetail:   { fontSize: 12, fontWeight: '700', marginTop: 2 },
  badge:       { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:   { fontSize: 9, fontWeight: '900' },
  coinBadge:   { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  coinText:    { fontSize: 12, fontWeight: '900' },

  actionsWrap: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  actionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionHeaderText: { fontSize: 10, fontWeight: '900' },
  declineLink: { fontSize: 10, fontWeight: '900', color: '#F43F5E' },

  declinePanel:{ borderRadius: 14, borderWidth: 1, padding: 10, gap: 8, marginTop: 4 },
  declinePanelTitle: { fontSize: 10, fontWeight: '900' },
  presets:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetChip:  { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  presetText:  { fontSize: 9, fontWeight: '700' },
  declineInput:{ borderWidth: 1, borderRadius: 10, padding: 8, fontSize: 11 },
  declineBtn:  { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  declineBtnText: { fontSize: 10, fontWeight: '900' },

  selfAssignBtn:  { borderRadius: 14, padding: 10, backgroundColor: '#059669', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  selfAssignText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  helperTrigger:     { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  helperTriggerText: { fontSize: 11, fontWeight: '700' },
  helperDropdown:    { position: 'absolute', top: 44, left: 0, right: 0, borderWidth: 1, borderRadius: 12, zIndex: 999, elevation: 20 },
  helperOption:      { padding: 10 },
  helperOptionText:  { fontSize: 12, fontWeight: '600' },

  assignBtn:     { backgroundColor: BRAND.purple, borderRadius: 14, padding: 10, alignItems: 'center', justifyContent: 'center', minWidth: 72, flexDirection: 'row', gap: 4 },
  assignBtnText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  noteInput:   { borderWidth: 1, borderRadius: 10, padding: 8, fontSize: 11, marginTop: 2 },
  charCount:   { fontSize: 9, textAlign: 'right', marginTop: 2, fontWeight: '500' },
  waitText:    { fontSize: 10, fontWeight: '700' },
  withdrawText:{ fontSize: 10, fontWeight: '700', color: '#EF4444' },

  noteBox:     { borderRadius: 12, padding: 10 },
  noteBoxText: { fontSize: 11, fontWeight: '600', fontStyle: 'italic' },

  assignedText:  { fontSize: 11, fontWeight: '600' },
  completeBtn:   { backgroundColor: BRAND.purple, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  completeBtnText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  reassignBox:   {},
  reassignLabel: { fontSize: 10, fontWeight: '800', whiteSpace: 'nowrap' } as any,

  completedRow:  { borderRadius: 16, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completedText: { fontSize: 11, fontWeight: '600', flex: 1 },
  helperTag:     { fontSize: 10, fontWeight: '900', marginLeft: 8 },
});
