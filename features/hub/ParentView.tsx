import { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import {
  Sparkles, PlusCircle, Calendar, ShoppingCart, Navigation,
  ChevronUp, ChevronDown, Camera, Coins, Car, Hand,
  Unlock, HelpCircle, Pill, Check, X, MessageSquare,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import FamilyAvatar from '@/components/FamilyAvatar';
import HelpQueueSection from '@/components/HelpQueueSection';
import { useQuestStore } from '@/store/questStore';
import { useEventStore } from '@/store/eventStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { SUPPLIES_PREFIX } from '@/features/hub/KidModals';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import {
  SectionCard, CollapsibleCard, AlertBanner, TimelineCard, InlineReassignPanel,
} from './hubComponents';
import { localToday, fmtHumanDate, fmtTime, hoursUntilEvent, isWorkEvent, minutesBetween } from './hubUtils';

// ─── Inline reply card — question/permission/medical (collapsible) ───────────
function InlineReplyCard({ req, kidName, isPermission, isQuestion, isMedical, accent, colors, isDark, onApprove, onDecline }: {
  req: any; kidName: string;
  isPermission: boolean; isQuestion: boolean; isMedical: boolean;
  accent: string; colors: any; isDark: boolean;
  onApprove: (reply: string) => void;
  onDecline: (reply: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const canSubmit = !isQuestion || reply.trim().length > 0;

  const TypeIcon = isMedical ? Pill : isPermission ? Unlock : HelpCircle;
  const typeLabel = isMedical ? 'Medical Alert' : isPermission ? 'Permission' : 'Question';

  return (
    <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: accent + '40', backgroundColor: isDark ? colors.card : accent + '06', overflow: 'hidden' }}>
      {/* Always-visible header row — tap to expand */}
      <Pressable onPress={() => setExpanded(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
          <TypeIcon size={16} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: accent }}>{typeLabel} — {kidName}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
            {req.detail.length > 55 ? req.detail.slice(0, 55) + '…' : req.detail}
          </Text>
        </View>
        <View style={{ backgroundColor: accent + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 }}>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: accent }}>Pending</Text>
        </View>
        {expanded ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
      </Pressable>

      {expanded && (
        <>
          {/* Divider */}
          <View style={{ height: 1, backgroundColor: accent + '20', marginHorizontal: 14 }} />

          {/* Full message */}
          <View style={{ marginHorizontal: 14, marginTop: 10, borderRadius: 12, padding: 12,
            backgroundColor: isDark ? '#1e293b' : '#fff',
            borderLeftWidth: 3, borderLeftColor: accent }}>
            <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary, lineHeight: 19 }}>
              "{req.detail}"
            </Text>
          </View>

          {/* Reply input */}
          <View style={{ marginHorizontal: 14, marginTop: 10, borderRadius: 12, borderWidth: 1.5,
            borderColor: reply.trim() ? accent + '60' : colors.border,
            backgroundColor: isDark ? colors.surface : '#fff',
            flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10 }}>
            <MessageSquare size={14} color={reply.trim() ? accent : colors.textTertiary} style={{ marginTop: 2 }} />
            <TextInput
              style={{ flex: 1, fontSize: TYPO.caption, color: colors.textPrimary, minHeight: 36 }}
              placeholder={isQuestion ? 'Type your reply… (required)' : 'Add a reply (optional)'}
              placeholderTextColor={colors.textTertiary}
              value={reply}
              onChangeText={setReply}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
            <Pressable
              onPress={() => onApprove(reply.trim())}
              disabled={!canSubmit}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: canSubmit ? '#10B981' : (isDark ? '#374151' : '#D1D5DB'),
                paddingVertical: 11, borderRadius: 12 }}>
              <Check size={14} color="#fff" />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '900', color: '#fff' }}>
                {isPermission ? 'Allow' : isMedical ? 'Acknowledged' : 'Reply'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onDecline(reply.trim())}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: isDark ? '#EF444420' : '#FEF2F2',
                borderWidth: 1.5, borderColor: '#EF444430',
                paddingVertical: 11, borderRadius: 12 }}>
              <X size={14} color="#EF4444" />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>
                {isPermission ? 'No' : 'Dismiss'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

export function ParentView({ active, members, colors, isDark, onScanFlyer, onHelpRequest, onEnRoute }: {
  active: FamilyMember; members: FamilyMember[];
  colors: any; isDark: boolean;
  onScanFlyer: () => void;
  onHelpRequest: () => void;
  onEnRoute: () => void;
}) {
  const { quests, approveQuest } = useQuestStore();
  const { events, updateEvent, addEvent }  = useEventStore();
  const { items: groceryItems, load: loadGrocery, addItem: addGroceryItem } = useGroceryStore();
  const { requests: kidRequests, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests,
          approveRequest, declineRequest, approveItems, rejectItems } = useKidRequestStore();
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  useEffect(() => { loadGrocery((active as any).familyId ?? 'family-1'); }, [(active as any).familyId]);
  useEffect(() => { if (!kidRequestsLoaded) loadKidRequests(); }, [kidRequestsLoaded]);

  const allNames  = members.map(m => m.name);
  const today     = localToday();

  // All events today (sorted) — Work events hidden from timeline but used for conflict detection
  const allTodayEvents = events
    .filter(e => e.date === today)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  const workEvents    = allTodayEvents.filter(e => isWorkEvent(e));
  const todayEvents   = allTodayEvents.filter(e => !isWorkEvent(e));

  const pendingRequests  = events.filter(e =>
    e.approvalPending && !isWorkEvent(e) && hoursUntilEvent(e.date, e.time) >= 0
  );
  const awaitingApproval = quests.filter(q => q.status === 'pending_approval');

  const rejectedHelperEvents = todayEvents.filter(e => e.helperStatus === 'rejected');

  // ── Conflict detection ────────────────────────────────────────────────────
  const conflictReasons = new Map<string, string>(); // eventId → reason label

  // Only check upcoming events — past conflicts are irrelevant and unactionable
  const upcomingEvents = todayEvents.filter(e => hoursUntilEvent(e.date, e.time) >= 0);

  // A: kid double-booked (same memberId, same date, <30 min, non-Work)
  const timedMemberEvents = upcomingEvents.filter(e => !!e.time && !!e.memberId);
  for (let i = 0; i < timedMemberEvents.length; i++) {
    for (let j = i + 1; j < timedMemberEvents.length; j++) {
      const a = timedMemberEvents[i], b = timedMemberEvents[j];
      if (a.memberId !== b.memberId) continue;
      if (minutesBetween(a.time!, b.time!) < 30) {
        const kidName = members.find(m => m.id === a.memberId)?.name.split(' ')[0] ?? 'Kid';
        const label = `${kidName} double-booked`;
        if (!conflictReasons.has(a.id)) conflictReasons.set(a.id, label);
        if (!conflictReasons.has(b.id)) conflictReasons.set(b.id, label);
      }
    }
  }

  // B: helper/driver double-booked (same helper name, <30 min, not rejected, non-Work)
  const timedHelperEvents = upcomingEvents.filter(e => !!e.time && !!e.helper && e.helperStatus !== 'rejected');
  for (let i = 0; i < timedHelperEvents.length; i++) {
    for (let j = i + 1; j < timedHelperEvents.length; j++) {
      const a = timedHelperEvents[i], b = timedHelperEvents[j];
      if (a.helper !== b.helper) continue;
      if (minutesBetween(a.time!, b.time!) < 30) {
        const label = `${a.helper!.split(' ')[0]} assigned to 2 events`;
        if (!conflictReasons.has(a.id)) conflictReasons.set(a.id, label);
        if (!conflictReasons.has(b.id)) conflictReasons.set(b.id, label);
      }
    }
  }

  // C: family event vs. Work event overlap — only for upcoming work events too
  const upcomingWorkEvents = workEvents.filter(e => hoursUntilEvent(e.date, e.time) >= 0);
  for (const familyEv of timedMemberEvents) {
    for (const workEv of upcomingWorkEvents) {
      if (familyEv.memberId !== workEv.memberId) continue;
      if (!workEv.time) continue;
      if (minutesBetween(familyEv.time!, workEv.time) < 30) {
        const memberName = members.find(m => m.id === familyEv.memberId)?.name.split(' ')[0] ?? 'their';
        if (!conflictReasons.has(familyEv.id)) {
          conflictReasons.set(familyEv.id, `Conflicts with ${memberName}'s work`);
        }
      }
    }
  }

  const conflictEventIds = new Set(conflictReasons.keys());
  const conflictEvents   = todayEvents.filter(e => e.conflict || conflictEventIds.has(e.id));

  // Escalation: helper pending + no response + < 1 hr away
  const pendingNoResponse = todayEvents.filter(e =>
    !!e.helper && e.helperStatus === 'pending' &&
    hoursUntilEvent(e.date, e.time) < 1 && hoursUntilEvent(e.date, e.time) >= 0
  );

  // Escalation: transport event unassigned + < 2 hr away
  // Exclude events already shown in urgentRejected (declined driver) to avoid duplicate banners
  const unassignedUrgent = todayEvents.filter(e => {
    if (!e.location || e.approvalPending || e.helper || e.declinedBy) return false;
    if (e.helperStatus === 'rejected') return false;
    const h = hoursUntilEvent(e.date, e.time);
    return h >= 0 && h < 2;
  });

  const urgentRejected = rejectedHelperEvents.filter(ev => {
    const h = hoursUntilEvent(ev.date, ev.time);
    return h >= 0 && h < 4;
  });
  const showBanner     = conflictEvents.length > 0 || urgentRejected.length > 0 ||
                         pendingNoResponse.length > 0 || unassignedUrgent.length > 0;
  const pendingKidRequests = kidRequests.filter(r => {
    if (r.status !== 'pending') return false;
    // Auto-expire checkin requests older than 2 hours — they're time-sensitive and have no actionable response
    if (r.type === 'checkin') {
      const ageHours = (Date.now() - new Date(r.requestedAt).getTime()) / 3_600_000;
      if (ageHours > 2) return false;
    }
    return true;
  });
  const actionCount    = pendingRequests.length + awaitingApproval.length + pendingKidRequests.length;

  const familyId = (active as any).familyId ?? 'family-1';

  const approveItemsAndSync = async (reqId: string, itemIds: string[], isSuppliesReq: boolean) => {
    const req = kidRequests.find(r => r.id === reqId);
    approveItems(reqId, itemIds, active.id);
    if (req?.items) {
      const approved = req.items.filter(it => itemIds.includes(it.id));
      for (const item of approved) {
        await addGroceryItem({
          familyId,
          name: item.name,
          quantity: item.qty || undefined,
          category: isSuppliesReq ? 'Supplies' : (item.category ?? 'Other'),
          addedBy: req.fromMemberId,
        });
      }
    }
  };
  const pad            = { paddingHorizontal: 16 };

  return (
    <>
      {/* 1. Today's Timeline */}
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
              <Calendar size={28} color={colors.textTertiary} />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: colors.textTertiary, marginTop: 8 }}>All clear — no events today</Text>
            </View>
          );

          return (
            <>
              {upcoming.length === 0 ? (
                <View style={{ backgroundColor: isDark ? colors.card : '#f0fdf4', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Sparkles size={20} color="#10B981" />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#10B981' }}>All done for today!</Text>
                </View>
              ) : upcoming.map((ev, idx) => (
                <TimelineCard key={ev.id} ev={ev} members={members} allNames={allNames}
                  colors={colors} isDark={isDark} updateEvent={updateEvent} activeName={active.name}
                  isFirst={idx === 0} isLast={idx === upcoming.length - 1} />
              ))}

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
                  {showPast && past.map((ev, idx) => (
                    <TimelineCard key={ev.id} ev={ev} members={members} allNames={allNames}
                      colors={colors} isDark={isDark} updateEvent={updateEvent}
                      isFirst={idx === 0} isLast={idx === past.length - 1} />
                  ))}
                </>
              )}
            </>
          );
        })()}
      </View>

      {/* 2. Alert Banner */}
      {showBanner && (
        <AlertBanner
          conflictEvents={conflictEvents} rejectedEvents={urgentRejected}
          pendingNoResponseEvents={pendingNoResponse} unassignedUrgentEvents={unassignedUrgent}
          conflictReasons={conflictReasons}
          members={members} colors={colors} isDark={isDark} updateEvent={updateEvent}
        />
      )}

      {/* 3. Quick Action Tiles */}
      <View style={{
        flexDirection: 'row', gap: 8,
        marginHorizontal: 16, marginBottom: 12,
        backgroundColor: isDark ? colors.card : '#FFFFFF',
        borderRadius: 24, padding: 10,
        borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
      }}>
        <Pressable onPress={onScanFlyer} style={{ flex: 1, backgroundColor: BRAND.purple, borderRadius: 18, paddingVertical: 12, alignItems: 'center', gap: 5 }}>
          <Sparkles size={18} color="#fff" />
          <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>Scan Flyer</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/quests')} style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 18, paddingVertical: 12, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0' }}>
          <PlusCircle size={18} color="#10B981" />
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155' }}>Quest</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/calendar')} style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 18, paddingVertical: 12, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0' }}>
          <Calendar size={18} color={BRAND.purple} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155' }}>Event</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/grocery' as any)} style={{ flex: 1, backgroundColor: isDark ? colors.surface : '#F1F5F9', borderRadius: 18, paddingVertical: 12, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0' }}>
          <ShoppingCart size={18} color="#0ea5e9" />
          <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? colors.textPrimary : '#334155' }} numberOfLines={1}>
            {groceryItems.length > 0 ? `${groceryItems.length} items` : 'Grocery'}
          </Text>
        </Pressable>
      </View>

      {/* 4. Action Needed — ride approvals + quest reviews + kid requests unified */}
      {actionCount > 0 && (
        <View style={pad}>
          <SectionCard
            icon={<Sparkles size={16} color="#EF4444" />}
            title="Action Needed" badge={actionCount} badgeColor="#EF4444"
            colors={colors} isDark={isDark}>

            {/* ── Ride requests ── */}
            {pendingRequests.map(ev => {
              const requester = ev.helperRequestedBy ?? members.find(m => m.id === ev.memberId)?.name ?? 'Kid';
              return (
                <CollapsibleCard key={ev.id} flat accent={BRAND.amber} colors={colors} isDark={isDark} defaultExpanded={true}
                  summary={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Hand size={16} color={BRAND.amber} />
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
                    <Pressable onPress={() => {
                      updateEvent(ev.id, { approvalPending: false, helperStatus: 'confirmed', helper: active.name });
                      // Auto-create return ride if kid requested both drop-off + pickup
                      if (ev.notes?.includes('Drop-off + Pickup')) {
                        addEvent({
                          title:        `${ev.title} — Return Ride`,
                          date:         ev.date,
                          time:         ev.returnTime ?? ev.time,
                          type:         'event',
                          category:     'Ride',
                          allDay:       false,
                          memberId:     ev.memberId,
                          helper:       active.name,
                          helperStatus: 'confirmed',
                          approvalPending: false,
                          conflict:     false,
                          notes:        `Auto-created return ride for "${ev.title}"`,
                          color:        '#10B981',
                        });
                      }
                    }}
                      style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                      <Car size={14} color="#fff" />
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>I'll Drive</Text>
                    </Pressable>
                    <Pressable onPress={() => updateEvent(ev.id, { approvalPending: false, helperStatus: 'rejected', declineReason: "Can't make it", declinedBy: active.name })}
                      style={{ flex: 1, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440', paddingVertical: 10, borderRadius: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#EF4444' }}>Can't Do It</Text>
                    </Pressable>
                  </View>
                  <InlineReassignPanel ev={ev} members={members} colors={colors} isDark={isDark}
                    onDone={(name, note) => updateEvent(ev.id, { approvalPending: false, helper: name, helperStatus: 'pending', notes: note || undefined })} />
                </CollapsibleCard>
              );
            })}

            {/* ── Quest approvals ── */}
            {awaitingApproval.map(q => {
              const kid = members.find(m => m.id === q.assignedToId);
              return (
                <CollapsibleCard key={q.id} flat accent={BRAND.purple} colors={colors} isDark={isDark} defaultExpanded={true}
                  summary={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Camera size={16} color={BRAND.purple} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.purple }} numberOfLines={1}>
                          Quest done — {q.title}
                        </Text>
                        {kid && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                            <FamilyAvatar name={kid.name} emoji={kid.emoji} avatarUrl={kid.avatarUrl}
                              siblings={allNames} size={14} ringColor={BRAND.purple} ringWidth={1} />
                            <Coins size={11} color={BRAND.amber} />
                            <Text style={{ fontSize: TYPO.label, color: BRAND.purple, fontWeight: '600' }}>
                              {kid.name.split(' ')[0]} wants {q.coins} coins
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
                    style={{ backgroundColor: BRAND.purple, paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                    <Coins size={14} color="#fff" />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Approve & Pay {q.coins} Coins</Text>
                  </Pressable>
                </CollapsibleCard>
              );
            })}

            {/* ── Kid requests: checkins, questions, permissions, grocery, supplies ── */}
            {pendingKidRequests.map(req => {
              const kid = members.find(m => m.id === req.fromMemberId);
              const kidName = kid?.name.split(' ')[0] ?? 'Kid';
              const isSupplies   = req.detail.startsWith(SUPPLIES_PREFIX);
              const isGrocery    = req.type === 'delegation' && !isSupplies && (req.items?.length ?? 0) > 0;
              const isPermission = req.type === 'permission';
              const isQuestion   = req.type === 'question';
              const isMedical    = req.type === 'medication';
              const isCheckin    = req.type === 'checkin';
              const accent = isMedical ? '#EF4444' : isGrocery ? '#10B981' : isSupplies ? '#6366F1' : isPermission ? BRAND.amber : isQuestion ? BRAND.purple : BRAND.teal;
              const pendingItems = (req.items ?? []).filter(it => it.status === 'pending');

              // ── Check-in: acknowledgment row (not a permission) ──
              if (isCheckin) {
                return (
                  <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: isDark ? '#1e293b' : '#F0FDF4', borderRadius: 14, padding: 12,
                    borderLeftWidth: 3, borderLeftColor: BRAND.teal }}>
                    <Text style={{ fontSize: 22 }}>{req.detail.includes('late') || req.detail.includes('Late') ? '🏃' : req.detail.includes('home') || req.detail.includes('Home') ? '🏠' : '🎒'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.teal }}>{kidName}</Text>
                      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }} numberOfLines={2}>{req.detail}</Text>
                    </View>
                    <Pressable onPress={() => approveRequest(req.id, active.id)}
                      style={{ backgroundColor: BRAND.teal, borderRadius: 10,
                        paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Got it 👍</Text>
                    </Pressable>
                  </View>
                );
              }

              // ── Question / Permission / Medical: inline reply card ──
              if (isQuestion || isPermission || isMedical) {
                return (
                  <InlineReplyCard
                    key={req.id}
                    req={req}
                    kidName={kidName}
                    isPermission={isPermission}
                    isQuestion={isQuestion}
                    isMedical={isMedical}
                    accent={accent}
                    colors={colors}
                    isDark={isDark}
                    onApprove={(reply) => approveRequest(req.id, active.id, reply || undefined)}
                    onDecline={(reply) => declineRequest(req.id, active.id, reply || undefined)}
                  />
                );
              }

              // ── Grocery / Supplies: collapsible with item-level approve ──
              return (
                <CollapsibleCard key={req.id} flat accent={accent} colors={colors} isDark={isDark} defaultExpanded={true}
                  summary={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                        {isGrocery ? <ShoppingCart size={14} color={accent} /> : <Sparkles size={14} color={accent} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: accent }} numberOfLines={1}>
                          {isGrocery ? 'Grocery' : 'Supplies'} — {kidName}
                        </Text>
                        <Text style={{ fontSize: TYPO.label, color: accent, opacity: 0.8 }}>
                          {req.items?.length ?? 0} items · {pendingItems.length} pending
                        </Text>
                      </View>
                      <View style={{ backgroundColor: accent + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: accent }}>Pending</Text>
                      </View>
                    </View>
                  }>
                  <View style={{ gap: 6, marginBottom: 8 }}>
                    {(req.items ?? []).map(item => (
                      <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: isDark ? '#1e293b' : '#F8FAFC', borderRadius: 10, padding: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{item.name}</Text>
                          {item.qty ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Qty: {item.qty}</Text> : null}
                        </View>
                        {item.status === 'pending' ? (
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <Pressable onPress={() => approveItemsAndSync(req.id, [item.id], isSupplies)}
                              style={{ backgroundColor: accent + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>✓ Add</Text>
                            </Pressable>
                            <Pressable onPress={() => rejectItems(req.id, [item.id], active.id)}
                              style={{ backgroundColor: '#EF444420', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>✕</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <View style={{ backgroundColor: item.status === 'approved' ? '#10B98120' : '#EF444420', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: item.status === 'approved' ? '#10B981' : '#EF4444' }}>
                              {item.status === 'approved' ? '✓ Added' : '✕ No'}
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                  {pendingItems.length > 1 && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => approveItemsAndSync(req.id, pendingItems.map(i => i.id), isSupplies)}
                        style={{ flex: 1, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '40', paddingVertical: 8, borderRadius: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>Add All</Text>
                      </Pressable>
                      <Pressable onPress={() => rejectItems(req.id, pendingItems.map(i => i.id), active.id)}
                        style={{ flex: 1, backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444430', paddingVertical: 8, borderRadius: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>Reject All</Text>
                      </Pressable>
                    </View>
                  )}
                </CollapsibleCard>
              );
            })}

          </SectionCard>
        </View>
      )}

      {/* 5. Dispatch En Route */}
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
          <Pressable onPress={onEnRoute} style={{ backgroundColor: '#10B981', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>En Route</Text>
          </Pressable>
        </View>
      </View>

      {/* 6. Family Support */}
      <View style={pad}>
        <View style={{
          backgroundColor: isDark ? colors.card : '#fff',
          borderRadius: 20, borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
          overflow: 'hidden', marginBottom: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.purple + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Hand size={20} color={BRAND.purple} />
            </View>
            <Pressable onPress={() => setSupportExpanded(e => !e)} style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.textPrimary }}>Who Needs Help?</Text>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Claim or assign open family requests</Text>
            </Pressable>
            <Pressable onPress={onHelpRequest} style={{ backgroundColor: BRAND.purple, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Ask for Help</Text>
            </Pressable>
            <Pressable onPress={() => setSupportExpanded(e => !e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {supportExpanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
            </Pressable>
          </View>
          {supportExpanded && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <HelpQueueSection onRequestHelp={onHelpRequest} hideAskButton />
            </View>
          )}
        </View>
      </View>
    </>
  );
}
