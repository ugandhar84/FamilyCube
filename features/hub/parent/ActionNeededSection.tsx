import { View, Text, Pressable } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import { SectionCard } from '../hubComponents';
import { decodeRideLate, SUPPLIES_PREFIX } from '../KidModals';
import { InlineReplyCard } from './InlineReplyCard';
import { RideRequestCard } from './RideRequestCard';
import { QuestApprovalCard } from './QuestApprovalCard';
import { RideLateAlertCard } from './RideLateAlertCard';
import { ServiceRequestCard } from './ServiceRequestCard';
import { GroceryRequestCard } from './GroceryRequestCard';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { Quest } from '@/store/questStore';

// A pending check-in ("I'm home" / "running late") — an acknowledgment, not
// an approval, so it's a single tap-and-done row rather than a full card.
function CheckinRow({ req, kidName, colors, isDark, active, approveRequest }: {
  req: any; kidName: string; colors: any; isDark: boolean; active: FamilyMember;
  approveRequest: (id: string, by: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: isDark ? '#1e293b' : '#F0FDF4', borderRadius: 14, padding: 12,
      borderLeftWidth: 3, borderLeftColor: BRAND.teal }}>
      <Text style={{ fontSize: 22 }}>{req.detail.includes('late') || req.detail.includes('Late') ? '🏃' : req.detail.includes('home') || req.detail.includes('Home') ? '🏠' : '🎒'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: BRAND.teal }}>{kidName}</Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }} numberOfLines={2}>{req.detail}</Text>
      </View>
      <Pressable onPress={() => approveRequest(req.id, active.id)}
        style={{ backgroundColor: BRAND.teal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Got it 👍</Text>
      </Pressable>
    </View>
  );
}

export function ActionNeededSection({
  actionCount, pendingRequests, awaitingApproval, pendingKidRequests, events,
  active, members, allNames, colors, isDark,
  updateEvent, addEvent, approveQuest, declineQuest,
  approveRequest, declineRequest, toggleGPWelcome, approveItemsAndSync, rejectItems,
}: {
  actionCount: number;
  pendingRequests: FamilyEvent[];
  awaitingApproval: Quest[];
  pendingKidRequests: any[];
  events: FamilyEvent[];
  active: FamilyMember; members: FamilyMember[]; allNames: string[];
  colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  addEvent: (ev: Omit<FamilyEvent, 'id'>) => void;
  approveQuest: (id: string, by: string) => void;
  declineQuest: (id: string, by: string, reason: string) => void;
  approveRequest: (id: string, by: string, note?: string) => void;
  declineRequest: (id: string, by: string, note?: string) => void;
  toggleGPWelcome: (id: string, open: boolean) => void;
  approveItemsAndSync: (reqId: string, itemIds: string[], isSupplies: boolean) => void;
  rejectItems: (reqId: string, itemIds: string[], by: string) => void;
}) {
  if (actionCount === 0) return null;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <SectionCard
        icon={<Sparkles size={16} color="#EF4444" />}
        title="Action Needed" badge={actionCount} badgeColor="#EF4444"
        collapsible defaultExpanded
        colors={colors} isDark={isDark}>

        {pendingRequests.map(ev => (
          <RideRequestCard key={ev.id} ev={ev} active={active} members={members} colors={colors} isDark={isDark}
            updateEvent={updateEvent} addEvent={addEvent} />
        ))}

        {awaitingApproval.map(q => (
          <QuestApprovalCard key={q.id} q={q} active={active} members={members} allNames={allNames}
            colors={colors} isDark={isDark} approveQuest={approveQuest} declineQuest={declineQuest} />
        ))}

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

          if (isCheckin) {
            return <CheckinRow key={req.id} req={req} kidName={kidName} colors={colors} isDark={isDark} active={active} approveRequest={approveRequest} />;
          }

          // "My driver hasn't arrived" — a stranded kid, not an approval.
          // Without this branch an emergency request falls through to the
          // grocery/supplies fallback and renders as "Supplies — 0 items".
          const rideLate = decodeRideLate(req.detail)
            ?? (req.type === 'emergency'
              ? { eventId: '', title: req.detail.replace(/^My driver.*?for /i, '').replace(/^"|"$/g, '') || 'a ride',
                  time: undefined, driver: undefined, location: req.location,
                  dropLocation: undefined, sentAt: req.requestedAt }
              : null);
          if (rideLate) {
            const ev = events.find(e => e.id === rideLate.eventId);
            return (
              <RideLateAlertCard key={req.id} req={req} rideLate={rideLate} kidName={kidName} ev={ev}
                active={active} colors={colors} isDark={isDark}
                approveRequest={approveRequest} updateEvent={updateEvent} />
            );
          }

          if (req.type === 'ride' || req.type === 'tutor' || req.type === 'cheer') {
            return (
              <ServiceRequestCard key={req.id} req={req} kidName={kidName} active={active} colors={colors} isDark={isDark}
                approveRequest={approveRequest} declineRequest={declineRequest} toggleGPWelcome={toggleGPWelcome} />
            );
          }

          if (isQuestion || isPermission || isMedical) {
            return (
              <InlineReplyCard
                key={req.id} req={req} kidName={kidName}
                isPermission={isPermission} isQuestion={isQuestion} isMedical={isMedical}
                accent={accent} colors={colors} isDark={isDark}
                onApprove={(reply) => approveRequest(req.id, active.id, reply || undefined)}
                onDecline={(reply) => declineRequest(req.id, active.id, reply || undefined)}
              />
            );
          }

          return (
            <GroceryRequestCard key={req.id} req={req} kidName={kidName} isGrocery={isGrocery} isSupplies={isSupplies}
              accent={accent} active={active} colors={colors} isDark={isDark}
              approveItemsAndSync={approveItemsAndSync} rejectItems={rejectItems}
              approveRequest={approveRequest} declineRequest={declineRequest} />
          );
        })}
      </SectionCard>
    </View>
  );
}
