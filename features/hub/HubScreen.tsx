import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore } from '@/store/eventStore';
import { useKidRequestStore, REQUEST_META, RequestType } from '@/store/kidRequestStore';
import AppHeader from '@/components/AppHeader';
import { BRAND } from '@/components/FamilyCubeLogo';

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function ScanIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Rect x={3} y={3} width={7} height={7} rx={1} stroke={color} strokeWidth={2} fill="none" />
      <Rect x={14} y={3} width={7} height={7} rx={1} stroke={color} strokeWidth={2} fill="none" />
      <Rect x={3} y={14} width={7} height={7} rx={1} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M14,14 L14,17 M17,14 L21,14 M21,17 L17,17 M17,17 L17,21 M21,21 L14,21" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function PlusIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M12,5 L12,19 M5,12 L19,12" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function CalIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Rect x={3} y={4} width={18} height={18} rx={2} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M16,2 L16,6 M8,2 L8,6 M3,10 L21,10" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function ChevronIcon({ color, up = false }: { color: string; up?: boolean }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d={up ? 'M6,15 L12,9 L18,15' : 'M6,9 L12,15 L18,9'}
        stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
    </Svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M5,13 L10,18 L19,7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function CarIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M5,11 L7,6 L17,6 L19,11" stroke={color} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Rect x={2} y={11} width={20} height={7} rx={2} fill={color} opacity={0.15} stroke={color} strokeWidth={1.5} />
      <Circle cx={7} cy={18} r={2} fill={color} />
      <Circle cx={17} cy={18} r={2} fill={color} />
      <Path d="M9,11 L15,11" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function HelpCircleIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M9,9 C9,6.2 15,6.2 15,9 C15,11 13,11.5 12,13" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={12} cy={17} r={1} fill={color} />
    </Svg>
  );
}

// ─── Category chip colors ─────────────────────────────────────────────────────

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  Sports:    { bg: '#D1FAE5', text: '#065F46' },
  Medical:   { bg: '#FEE2E2', text: '#991B1B' },
  School:    { bg: '#EEF2FF', text: '#3730A3' },
  Work:      { bg: '#EDE9FE', text: '#5B21B6' },
  Event:     { bg: '#FEF3C7', text: '#92400E' },
  Study:     { bg: '#DBEAFE', text: '#1E3A8A' },
  Birthday:  { bg: '#FCE7F3', text: '#9D174D' },
};

// ─── DECLINE PRESET REASONS ───────────────────────────────────────────────────

const DECLINE_REASONS = [
  'Too busy right now',
  'Not available today',
  'Ask someone else',
  'Already handled',
  'Not appropriate',
];

// ─── REQUEST HELP MODAL ───────────────────────────────────────────────────────

const REQUEST_TYPES: { type: RequestType; label: string; emoji: string }[] = [
  { type: 'ride',        label: 'Ride',       emoji: '🚗' },
  { type: 'tutor',       label: 'Tutor',      emoji: '🎒' },
  { type: 'cheer',       label: 'Cheer',      emoji: '✋' },
  { type: 'question',    label: 'Question',   emoji: '❓' },
  { type: 'permission',  label: 'Permission', emoji: '🔓' },
  { type: 'appointment', label: 'Appt',       emoji: '📅' },
  { type: 'emergency',   label: 'Emergency',  emoji: '🚨' },
];

function RequestHelpModal({ visible, onClose, activeMemberId }: {
  visible: boolean;
  onClose: () => void;
  activeMemberId: string;
}) {
  const { colors } = useTheme();
  const sendRequest = useKidRequestStore(s => s.sendRequest);
  const [selectedType, setSelectedType] = useState<RequestType>('ride');
  const [detail, setDetail] = useState('');

  const submit = () => {
    if (!detail.trim()) { Alert.alert('Add a detail'); return; }
    sendRequest({ type: selectedType, fromMemberId: activeMemberId, detail: detail.trim() });
    setDetail('');
    setSelectedType('ride');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity style={ms.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[ms.sheet, { backgroundColor: colors.card }]}>
          <View style={[ms.handle, { backgroundColor: colors.border }]} />
          <Text style={[ms.title, { color: colors.textPrimary }]}>Ask Family for Help</Text>

          {/* Type chips */}
          <View style={ms.chips}>
            {REQUEST_TYPES.map(rt => (
              <TouchableOpacity
                key={rt.type}
                onPress={() => setSelectedType(rt.type)}
                style={[ms.chip, selectedType === rt.type && { backgroundColor: BRAND.purple + '22', borderColor: BRAND.purple }]}
              >
                <Text style={{ fontSize: 11 }}>{rt.emoji} {rt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={[ms.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Describe what you need…"
            placeholderTextColor={colors.textTertiary}
            value={detail}
            onChangeText={setDetail}
            multiline
          />

          <TouchableOpacity style={[ms.submitBtn, { backgroundColor: BRAND.purple }]} onPress={submit}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Send Request</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 50,
    borderWidth: 1, borderColor: '#DDD',
  },
  input: {
    borderWidth: 1, borderRadius: 12, padding: 12,
    fontSize: 14, minHeight: 80, textAlignVertical: 'top',
    marginBottom: 16,
  },
  submitBtn: {
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
});

// ─── HELP QUEUE CARD ──────────────────────────────────────────────────────────

function HelpQueueCard({ activeMemberId }: { activeMemberId: string }) {
  const { colors, isDark } = useTheme();
  const { requests, approveRequest, declineRequest, assignRequest, completeRequest } = useKidRequestStore();
  const members = useFamilyStore(s => s.members);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDeclineId, setShowDeclineId] = useState<string | null>(null);
  const [declineReasonMap, setDeclineReasonMap] = useState<Record<string, string>>({});
  const [customReasonMap, setCustomReasonMap] = useState<Record<string, string>>({});
  const [selectedHelperMap, setSelectedHelperMap] = useState<Record<string, string>>({});
  const [assignNoteMap, setAssignNoteMap] = useState<Record<string, string>>({});
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const activeRequests = useMemo(() =>
    requests.filter(r => r.status !== 'cancelled' && r.status !== 'expired')
      .sort((a, b) => {
        const order = { pending: 0, approved: 1, completed: 2, declined: 3 };
        return (order[a.status as keyof typeof order] ?? 9) - (order[b.status as keyof typeof order] ?? 9);
      }),
    [requests]
  );

  const helpers = members.filter(m => m.role === 'parent' || m.role === 'senior');

  const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const doDecline = async (id: string) => {
    const reason = declineReasonMap[id] || customReasonMap[id] || 'Not available';
    setProcessingId(id);
    declineRequest(id, activeMemberId, reason);
    setShowDeclineId(null);
    setProcessingId(null);
    setExpandedId(null);
  };

  const doSelfAssign = async (id: string) => {
    const note = assignNoteMap[id];
    setProcessingId(id);
    assignRequest(id, activeMemberId, note);
    setProcessingId(null);
    setExpandedId(null);
  };

  const doAssignOther = async (id: string) => {
    const helperId = selectedHelperMap[id];
    if (!helperId) { Alert.alert('Select a helper'); return; }
    const note = assignNoteMap[id];
    setProcessingId(id);
    assignRequest(id, helperId, note);
    setProcessingId(null);
    setExpandedId(null);
  };

  const doComplete = async (id: string) => {
    setProcessingId(id);
    completeRequest(id, activeMemberId);
    setProcessingId(null);
  };

  const bg = isDark ? colors.card : '#FFFFFF';
  const cardBorder = isDark ? colors.border : '#E5E7EB';

  return (
    <View style={[hq.card, { backgroundColor: bg, borderColor: cardBorder }]}>
      {/* Card header */}
      <View style={hq.cardHeader}>
        <View style={[hq.iconWrap, { backgroundColor: BRAND.amber + '25' }]}>
          <HelpCircleIcon color={BRAND.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[hq.cardTitle, { color: colors.textPrimary }]}>Family Support & Help Queue</Text>
          <Text style={[hq.cardSub, { color: colors.textSecondary }]}>Kids ask for assistance & parents approve/self-assign</Text>
        </View>
        <TouchableOpacity
          style={[hq.askBtn, { backgroundColor: BRAND.purple }]}
          onPress={() => setShowRequestModal(true)}
        >
          <Text style={hq.askBtnText}>+ Ask for Help</Text>
        </TouchableOpacity>
      </View>

      <View style={[hq.divider, { backgroundColor: cardBorder }]} />

      {activeRequests.length === 0 && (
        <Text style={[hq.empty, { color: colors.textTertiary }]}>No active requests — family is doing great! 🎉</Text>
      )}

      {activeRequests.map(req => {
        const meta = REQUEST_META[req.type];
        const isExpanded = expandedId === req.id;
        const isPending = req.status === 'pending';
        const isAssigned = req.status === 'approved';
        const isCompleted = req.status === 'completed';
        const isDeclined = req.status === 'declined';
        const requester = members.find(m => m.id === req.fromMemberId);
        const helper = req.assignedHelper ? members.find(m => m.id === req.assignedHelper) : null;
        const respondedByMember = req.respondedBy ? members.find(m => m.id === req.respondedBy) : null;

        const rowBg = isPending
          ? (isDark ? '#78350F22' : '#FFFBEB')
          : isAssigned
            ? (isDark ? '#064E3B22' : '#F0FDF4')
            : isCompleted
              ? (isDark ? '#1E3A5F22' : '#EFF6FF')
              : isDark ? colors.surface : '#F9FAFB';

        const rowBorder = isPending ? BRAND.amber + '60'
          : isAssigned ? '#10B981' + '60'
          : isCompleted ? '#3B82F6' + '60'
          : cardBorder;

        return (
          <View key={req.id} style={[hq.reqRow, { backgroundColor: rowBg, borderColor: rowBorder }]}>
            {/* Row header — always visible, tap to expand */}
            <TouchableOpacity style={hq.reqHeader} onPress={() => isPending || isAssigned ? toggle(req.id) : null} activeOpacity={0.7}>
              <View style={[hq.reqInitial, { backgroundColor: meta.color + '22' }]}>
                <Text style={{ fontSize: 16 }}>{requester?.emoji ?? meta.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={[hq.reqName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {requester?.name ?? 'Member'} needs help:
                  </Text>
                  <View style={[hq.badge, { backgroundColor: meta.color + '22' }]}>
                    <Text style={[hq.badgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  {isPending && <Text style={{ color: colors.textTertiary, fontSize: 11 }}>↓</Text>}
                </View>
                <Text style={[hq.reqDetail, { color: colors.textSecondary }]} numberOfLines={isExpanded ? undefined : 1}>
                  {req.detail}
                  {req.scheduledDate ? ` — ${req.scheduledDate}${req.scheduledTime ? ` at ${req.scheduledTime}` : ''}` : ''}
                </Text>
              </View>
              {isCompleted && <CheckIcon color="#3B82F6" />}
              {isAssigned && (
                <View style={hq.assignedPill}>
                  <Text style={hq.assignedText}>✓ {helper?.name ?? 'Assigned'}</Text>
                </View>
              )}
              {(isPending || isAssigned) && (
                <ChevronIcon color={colors.textTertiary} up={isExpanded} />
              )}
            </TouchableOpacity>

            {/* Expanded actions */}
            {isExpanded && isPending && (
              <View style={hq.actions}>
                {/* Decline flow */}
                {showDeclineId === req.id ? (
                  <View style={hq.declinePanel}>
                    <Text style={[hq.declineLabel, { color: colors.textSecondary }]}>Reason for declining:</Text>
                    <View style={hq.declineChips}>
                      {DECLINE_REASONS.map(r => (
                        <TouchableOpacity
                          key={r}
                          style={[hq.declineChip,
                            declineReasonMap[req.id] === r && { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }
                          ]}
                          onPress={() => setDeclineReasonMap(prev => ({ ...prev, [req.id]: r }))}
                        >
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>{r}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={[hq.noteInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                      placeholder="Or type a custom reason…"
                      placeholderTextColor={colors.textTertiary}
                      value={customReasonMap[req.id] ?? ''}
                      onChangeText={v => setCustomReasonMap(prev => ({ ...prev, [req.id]: v }))}
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity style={[hq.actionPill, { backgroundColor: '#EF4444', flex: 1 }]} onPress={() => doDecline(req.id)}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Confirm Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[hq.actionPill, { backgroundColor: colors.border, flex: 1 }]} onPress={() => setShowDeclineId(null)}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={hq.declineLink} onPress={() => setShowDeclineId(req.id)}>
                    <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>✕  Decline</Text>
                  </TouchableOpacity>
                )}

                {showDeclineId !== req.id && (
                  <>
                    {/* Self assign */}
                    <TouchableOpacity
                      style={[hq.actionPill, { backgroundColor: BRAND.teal, marginTop: 8 }]}
                      onPress={() => doSelfAssign(req.id)}
                      disabled={processingId === req.id}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓  I'll Handle This</Text>
                    </TouchableOpacity>

                    {/* Assign to another */}
                    <Text style={[hq.assignLabel, { color: colors.textSecondary }]}>Or assign to:</Text>
                    <View style={hq.helperRow}>
                      {helpers.map(h => (
                        <TouchableOpacity
                          key={h.id}
                          style={[hq.helperPill,
                            selectedHelperMap[req.id] === h.id && { backgroundColor: BRAND.purple + '22', borderColor: BRAND.purple }
                          ]}
                          onPress={() => setSelectedHelperMap(prev => ({ ...prev, [req.id]: h.id }))}
                        >
                          <Text style={{ fontSize: 11, color: colors.textPrimary }}>{h.emoji ?? '👤'} {h.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {selectedHelperMap[req.id] && (
                      <>
                        <TextInput
                          style={[hq.noteInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                          placeholder="Note for them (optional)…"
                          placeholderTextColor={colors.textTertiary}
                          value={assignNoteMap[req.id] ?? ''}
                          onChangeText={v => setAssignNoteMap(prev => ({ ...prev, [req.id]: v }))}
                        />
                        <TouchableOpacity
                          style={[hq.actionPill, { backgroundColor: BRAND.purple, marginTop: 6 }]}
                          onPress={() => doAssignOther(req.id)}
                          disabled={processingId === req.id}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                            Assign to {members.find(m => m.id === selectedHelperMap[req.id])?.name}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Assigned expanded — mark complete / reassign */}
            {isExpanded && isAssigned && (
              <View style={hq.actions}>
                <TouchableOpacity
                  style={[hq.actionPill, { backgroundColor: '#10B981' }]}
                  onPress={() => doComplete(req.id)}
                  disabled={processingId === req.id}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓ Mark as Completed</Text>
                </TouchableOpacity>
                {req.parentNote ? (
                  <Text style={[hq.noteText, { color: colors.textSecondary }]}>Note: {req.parentNote}</Text>
                ) : null}
              </View>
            )}
          </View>
        );
      })}

      <RequestHelpModal
        visible={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        activeMemberId={activeMemberId}
      />
    </View>
  );
}

const hq = StyleSheet.create({
  card: {
    borderRadius: 16, borderWidth: 1,
    marginHorizontal: 14, marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', lineHeight: 18 },
  cardSub:   { fontSize: 11, lineHeight: 15, marginTop: 1 },
  askBtn:    { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginTop: 2 },
  askBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  divider:   { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  empty:     { fontSize: 13, textAlign: 'center', padding: 16 },

  reqRow:    { margin: 10, marginTop: 8, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  reqHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  reqInitial:{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reqName:   { fontSize: 12, fontWeight: '700', flex: 1 },
  reqDetail: { fontSize: 11, marginTop: 2 },
  badge:     { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  assignedPill: {
    backgroundColor: '#D1FAE5', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  assignedText: { fontSize: 10, fontWeight: '700', color: '#065F46' },

  actions:     { padding: 12, paddingTop: 0 },
  declineLink: { paddingVertical: 6 },
  declinePanel: { marginBottom: 4 },
  declineLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  declineChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  declineChip:  { borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 10, paddingVertical: 4 },
  assignLabel:  { fontSize: 11, fontWeight: '600', marginTop: 10, marginBottom: 6, color: '#6B7280' },
  helperRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  helperPill:   { borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 10, paddingVertical: 5 },
  noteInput:    { borderWidth: 1, borderRadius: 10, padding: 8, fontSize: 12, marginTop: 6 },
  actionPill:   { borderRadius: 10, padding: 10, alignItems: 'center' },
  noteText:     { fontSize: 11, marginTop: 8, fontStyle: 'italic' },
});

// ─── DISPATCH EN ROUTE ────────────────────────────────────────────────────────

function DispatchCard({ colors }: { colors: any }) {
  return (
    <TouchableOpacity
      style={[dc.card, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }]}
      activeOpacity={0.8}
    >
      <View style={dc.left}>
        <CarIcon color="#DC2626" />
        <View>
          <Text style={dc.title}>Dispatch En Route</Text>
          <Text style={dc.sub}>Notify kids you're on your way home</Text>
        </View>
      </View>
      <ChevronIcon color="#10B981" />
    </TouchableOpacity>
  );
}

const dc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 14, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 14, fontWeight: '800', color: '#065F46' },
  sub:   { fontSize: 11, color: '#6EE7B7', marginTop: 2, fontWeight: '500' },
});

// ─── TODAY'S TIMELINE ─────────────────────────────────────────────────────────

function TodayTimeline() {
  const { colors } = useTheme();
  const events = useEventStore(s => s.events);
  const today = new Date().toISOString().split('T')[0];
  const todayEvents = events
    .filter(e => e.date === today && !e.allDay)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

  if (todayEvents.length === 0) return null;

  return (
    <View style={{ marginHorizontal: 14, marginBottom: 20 }}>
      <Text style={[tl.sectionLabel, { color: colors.textTertiary }]}>TODAY'S TIMELINE</Text>
      {todayEvents.map(ev => {
        const cat = ev.category ?? 'Event';
        const chip = CAT_COLORS[cat] ?? { bg: '#E5E7EB', text: '#374151' };
        const timeStr = ev.time
          ? new Date(`2000-01-01T${ev.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : '';

        return (
          <View key={ev.id} style={[tl.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Colored left accent */}
            <View style={[tl.accent, { backgroundColor: ev.color ?? BRAND.teal }]} />
            <View style={{ flex: 1 }}>
              <View style={tl.topRow}>
                <View style={[tl.chip, { backgroundColor: chip.bg }]}>
                  <Text style={[tl.chipText, { color: chip.text }]}>{cat.toUpperCase()}</Text>
                </View>
                {ev.conflict && (
                  <View style={[tl.chip, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[tl.chipText, { color: '#EF4444' }]}>⚠ CONFLICT</Text>
                  </View>
                )}
                <Text style={[tl.time, { color: colors.textTertiary }]}>{timeStr}</Text>
              </View>
              <Text style={[tl.evTitle, { color: colors.textPrimary }]}>{ev.title}</Text>
              {ev.driver && (
                <Text style={[tl.driver, { color: colors.textSecondary }]}>🚗 {ev.driver}</Text>
              )}
              {ev.location && (
                <Text style={[tl.driver, { color: colors.textTertiary }]}>📍 {ev.location}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const tl = StyleSheet.create({
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10 },
  card: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1,
    marginBottom: 8, overflow: 'hidden',
  },
  accent: { width: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, paddingBottom: 0, flexWrap: 'wrap' },
  chip: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  time: { fontSize: 11, fontWeight: '600', marginLeft: 'auto' },
  evTitle: { fontSize: 13, fontWeight: '700', paddingHorizontal: 10, paddingTop: 4 },
  driver: { fontSize: 11, paddingHorizontal: 10, paddingBottom: 6, marginTop: 2 },
});

// ─── KID VIEW ─────────────────────────────────────────────────────────────────

function KidView({ member, colors }: { member: any; colors: any }) {
  const requests = useKidRequestStore(s => s.getForMember(member.id));
  const events = useEventStore(s => s.events);
  const today = new Date().toISOString().split('T')[0];
  const myEvents = events.filter(e => e.date === today && e.memberId === member.id).slice(0, 3);

  const QUICK_ACTIONS = [
    { emoji: '🚗', label: 'Need a Ride', type: 'ride' as RequestType },
    { emoji: '🎒', label: 'Need Help', type: 'tutor' as RequestType },
    { emoji: '✋', label: 'Cheer Me', type: 'cheer' as RequestType },
    { emoji: '🔓', label: 'Permission', type: 'permission' as RequestType },
  ];
  const sendRequest = useKidRequestStore(s => s.sendRequest);

  return (
    <View>
      {/* My Requests status */}
      {requests.length > 0 && (
        <View style={[kv.card, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 14, marginBottom: 10 }]}>
          <Text style={[kv.cardTitle, { color: colors.textPrimary }]}>My Requests</Text>
          {requests.slice(0, 3).map(r => {
            const meta = REQUEST_META[r.type];
            const statusColor = r.status === 'approved' ? '#10B981' : r.status === 'declined' ? '#EF4444' : BRAND.amber;
            return (
              <View key={r.id} style={kv.requestRow}>
                <Text style={{ fontSize: 14 }}>{meta.emoji}</Text>
                <Text style={[kv.reqDetail, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{r.detail}</Text>
                <View style={[kv.statusPill, { backgroundColor: statusColor + '22' }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{r.status.toUpperCase()}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Quick launcher 2x2 */}
      <View style={kv.grid}>
        {QUICK_ACTIONS.map(action => (
          <TouchableOpacity
            key={action.type}
            style={[kv.gridBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Alert.prompt
                ? Alert.prompt(`${action.emoji} ${action.label}`, 'What do you need?', text => {
                    if (text) sendRequest({ type: action.type, fromMemberId: member.id, detail: text });
                  })
                : Alert.alert(action.label, 'Open the Help Queue to make a request');
            }}
          >
            <Text style={{ fontSize: 28 }}>{action.emoji}</Text>
            <Text style={[kv.gridLabel, { color: colors.textPrimary }]}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Today's events for this kid */}
      {myEvents.length > 0 && (
        <View style={[kv.card, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 14 }]}>
          <Text style={[kv.cardTitle, { color: colors.textPrimary }]}>📅 Today</Text>
          {myEvents.map(ev => (
            <View key={ev.id} style={kv.requestRow}>
              <View style={[kv.evDot, { backgroundColor: ev.color ?? BRAND.teal }]} />
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }]}>{ev.title}</Text>
                {ev.time && <Text style={{ fontSize: 11, color: colors.textSecondary }}>{ev.time}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Wallet strip */}
      <View style={[kv.walletRow, { marginHorizontal: 14, marginTop: 10 }]}>
        <View style={[kv.walletCard, { backgroundColor: BRAND.amber + '18', borderColor: BRAND.amber + '40', flex: 1 }]}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: BRAND.amber }}>{member.coins}</Text>
          <Text style={{ fontSize: 10, color: BRAND.amber, fontWeight: '700' }}>⭐ My Coins</Text>
        </View>
        <View style={[kv.walletCard, { backgroundColor: BRAND.purple + '18', borderColor: BRAND.purple + '40', flex: 1 }]}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: BRAND.purple }}>{member.xp}</Text>
          <Text style={{ fontSize: 10, color: BRAND.purple, fontWeight: '700' }}>✨ XP Points</Text>
        </View>
      </View>
    </View>
  );
}

const kv = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10 },
  cardTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  reqDetail: { fontSize: 12 },
  statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 14, marginBottom: 10 },
  gridBtn: {
    width: '47%', borderRadius: 14, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 6,
  },
  gridLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  evDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  walletRow: { flexDirection: 'row', gap: 10 },
  walletCard: { borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center' },
});

// ─── SENIOR VIEW ──────────────────────────────────────────────────────────────

function SeniorView({ member, colors }: { member: any; colors: any }) {
  const events = useEventStore(s => s.events);
  const today = new Date().toISOString().split('T')[0];
  const todayAll = events.filter(e => e.date === today).slice(0, 4);

  return (
    <View style={{ marginHorizontal: 14 }}>
      {/* Caregiver HQ card */}
      <View style={[sv.card, { backgroundColor: BRAND.purple + '12', borderColor: BRAND.purple + '40' }]}>
        <Text style={[sv.cardTitle, { color: BRAND.purple }]}>🏥 Caregiver HQ — {member.name}</Text>
        <Text style={{ fontSize: 12, color: BRAND.purple, marginTop: 4, opacity: 0.8 }}>
          Monitor family health events and medication schedules
        </Text>

        {todayAll.filter(e => e.category === 'Medical').length > 0 ? (
          todayAll.filter(e => e.category === 'Medical').map(ev => (
            <View key={ev.id} style={sv.evRow}>
              <Text style={{ fontSize: 18 }}>💊</Text>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND.purple }}>{ev.title}</Text>
                {ev.time && <Text style={{ fontSize: 11, color: BRAND.purple, opacity: 0.7 }}>{ev.time}</Text>}
              </View>
            </View>
          ))
        ) : (
          <Text style={{ fontSize: 12, color: BRAND.purple, marginTop: 8, opacity: 0.7 }}>
            No medical events today ✓
          </Text>
        )}
      </View>

      {/* Family pulse */}
      <View style={[sv.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[sv.cardTitle, { color: colors.textPrimary }]}>📋 Family Schedule Today</Text>
        {todayAll.length > 0 ? todayAll.map(ev => (
          <View key={ev.id} style={sv.evRow}>
            <View style={[sv.dot, { backgroundColor: ev.color ?? BRAND.teal }]} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>{ev.title}</Text>
              {ev.time && <Text style={{ fontSize: 11, color: colors.textSecondary }}>{ev.time}</Text>}
            </View>
          </View>
        )) : (
          <Text style={{ fontSize: 12, color: colors.textTertiary }}>All clear today</Text>
        )}
      </View>
    </View>
  );
}

const sv = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

// ─── MAIN HUB SCREEN ──────────────────────────────────────────────────────────

export default function HubScreen() {
  const { colors } = useTheme();
  const { members, activeMemberId, setActiveMember } = useFamilyStore();
  const requests = useKidRequestStore(s => s.requests);
  const loadRequests = useKidRequestStore(s => s.loadFromStorage);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const unreadCount = useKidRequestStore(s => s.getUnread().length);

  const switchMember = () => {
    const idx = members.findIndex(m => m.id === activeMember?.id);
    const next = members[(idx + 1) % members.length];
    if (next) setActiveMember(next.id);
  };

  const role = activeMember?.role ?? 'parent';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name}
        memberRole={role === 'kid' ? 'kid' : role === 'senior' ? 'senior' : 'parent'}
        notifCount={unreadCount}
        onPersonaPress={switchMember}
        onBellPress={() => {}}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      >
        {/* ─ Quick Action Buttons ─ */}
        <View style={main.actionRow}>
          <TouchableOpacity style={[main.actionBtn, { backgroundColor: BRAND.purple }]}>
            <ScanIcon color="#fff" />
            <Text style={main.actionBtnText}>Scan Flyer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[main.actionBtn, { backgroundColor: BRAND.teal }]}>
            <PlusIcon color="#fff" />
            <Text style={main.actionBtnText}>Quest</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[main.actionBtn, { backgroundColor: BRAND.amber }]}>
            <CalIcon color="#fff" />
            <Text style={main.actionBtnText}>Event</Text>
          </TouchableOpacity>
        </View>

        {/* ─ Parent / Senior: Help Queue + Timeline ─ */}
        {(role === 'parent' || role === 'senior') && (
          <>
            <HelpQueueCard activeMemberId={activeMember?.id ?? ''} />
            <DispatchCard colors={colors} />
            <TodayTimeline />
          </>
        )}

        {/* ─ Senior: Caregiver HQ ─ */}
        {role === 'senior' && activeMember && (
          <SeniorView member={activeMember} colors={colors} />
        )}

        {/* ─ Kid View ─ */}
        {role === 'kid' && activeMember && (
          <KidView member={activeMember} colors={colors} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const main = StyleSheet.create({
  actionRow: {
    flexDirection: 'row', gap: 10, marginHorizontal: 14, marginBottom: 12,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 14,
  },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
