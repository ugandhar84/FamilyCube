import { View, Text, Pressable } from 'react-native';
import { Car, ChevronDown, ChevronUp, Hand } from 'lucide-react-native';
import { GP } from './seniorTheme';
import { AvailabilitySettingsSheet } from './AvailabilitySettingsSheet';
import { OpenRideRequestsList } from './OpenRideRequestsList';
import { QuestInvitationsSection } from './QuestInvitationsSection';
import { ActiveErrandsSection, ErrandsAwaitingReviewSection, PendingOffersSection } from './ActiveErrandsSection';
import { FamilyNeedsHandSection } from './FamilyNeedsHandSection';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { ChoreTask } from '@/store/choreStore';
import type { KidRequest } from '@/store/kidRequestStore';

// "Lend a Hand" — the volunteer dispatch card. Owns its own expand/collapse
// and the Availability Settings drawer (Cheerleader Mode, drive days/hours,
// weekly cap), then composes the four dispatch sub-lists.
export function LendAHandCard({
  cheerleaderMode, setCheerleaderMode,
  driveWindowDays, setDriveWindowDays,
  driveWindowStart, setDriveWindowStart,
  driveWindowEnd, setDriveWindowEnd,
  weeklyRideCap, setWeeklyRideCap,
  ridesThisWeek, atWeeklyCap,
  helperDispatchExpanded, setHelperDispatchExpanded,
  availSettingsOpen, setAvailSettingsOpen,
  hasDispatchItems, dispatchBadgeCount,
  openRides, gpInvitations,
  myActiveErrands, onOpenReceiptModal, onMarkDoneNoReceipt, onBackoutErrand,
  myErrandsAwaitingReview,
  myPendingOffers, onWithdrawOffer,
  openRequests, gpWelcomeRequests, gpWelcomeChores, volunteerPool,
  active, members, allNames, colors, isDark,
  updateEvent, updateChore, assignRequest, claimGPErrand,
  onClaimRide, onPassRide, onHelpRequest,
}: {
  cheerleaderMode: boolean; setCheerleaderMode: (fn: (prev: boolean) => boolean) => void;
  driveWindowDays: number[]; setDriveWindowDays: (fn: (prev: number[]) => number[]) => void;
  driveWindowStart: string; setDriveWindowStart: (v: string) => void;
  driveWindowEnd: string; setDriveWindowEnd: (v: string) => void;
  weeklyRideCap: number; setWeeklyRideCap: (v: number) => void;
  ridesThisWeek: number; atWeeklyCap: boolean;
  helperDispatchExpanded: boolean; setHelperDispatchExpanded: (fn: (prev: boolean) => boolean) => void;
  availSettingsOpen: boolean; setAvailSettingsOpen: (fn: (prev: boolean) => boolean) => void;
  hasDispatchItems: boolean; dispatchBadgeCount: number;
  openRides: FamilyEvent[]; gpInvitations: ChoreTask[];
  myActiveErrands: ChoreTask[]; onOpenReceiptModal: (choreId: string) => void; onMarkDoneNoReceipt: (choreId: string) => void;
  onBackoutErrand: (choreId: string) => void;
  myErrandsAwaitingReview: ChoreTask[];
  myPendingOffers: ChoreTask[]; onWithdrawOffer: (choreId: string) => void;
  openRequests: FamilyEvent[]; gpWelcomeRequests: KidRequest[]; gpWelcomeChores: ChoreTask[]; volunteerPool: FamilyEvent[];
  active: FamilyMember; members: FamilyMember[]; allNames: string[]; colors: any; isDark: boolean;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  updateChore: (id: string, patch: Partial<ChoreTask>) => void;
  assignRequest: (id: string, memberId: string) => void;
  claimGPErrand: (choreId: string, gpMemberId: string) => void;
  onClaimRide: (evId: string) => void;
  onPassRide: (evId: string) => void;
  onHelpRequest: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{
        backgroundColor: isDark ? colors.card : '#fff',
        borderRadius: 20, borderWidth: 1,
        borderColor: isDark ? colors.border : '#E8E8F0',
        overflow: 'hidden', marginBottom: 12,
      }}>
        {/* Header — tap to expand/collapse the dispatch list */}
        <Pressable
          onPress={() => { setHelperDispatchExpanded(v => !v); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20,
            backgroundColor: colors.amber + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Car size={20} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: GP.title, fontWeight: '900', color: colors.textPrimary }}>
                Lend a Hand
              </Text>
              {hasDispatchItems && (
                <View style={{ backgroundColor: colors.amber, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>
                    {dispatchBadgeCount}
                  </Text>
                </View>
              )}
              {cheerleaderMode && (
                <View style={{ backgroundColor: colors.accent + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.accent + '40' }}>
                  <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: colors.accent }}>Cheerleader Mode</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: GP.body, color: colors.textSecondary, marginTop: 3 }}>
              {cheerleaderMode
                ? 'Driving requests are hidden for now'
                : hasDispatchItems
                ? `You've taken ${ridesThisWeek} of ${weeklyRideCap} rides this week`
                : 'Nothing needs you right now'}
            </Text>
          </View>
          {/* GP can raise their own request here — the standalone Help Queue
              section was removed, this is the one entry point left. */}
          <Pressable onPress={(e) => { e.stopPropagation(); onHelpRequest(); }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: colors.amber, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Hand size={14} color="#fff" />
            <Text style={{ fontSize: GP.body, fontWeight: '800', color: '#fff' }}>Ask</Text>
          </Pressable>
          <Pressable onPress={(e) => { e.stopPropagation(); setAvailSettingsOpen(o => !o); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {availSettingsOpen ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>
        </Pressable>

        {/* Availability Settings — now a bottom sheet instead of an inline
            expand-in-place panel, which used to push every dispatch
            section below it down the page whenever opened. */}
        <AvailabilitySettingsSheet
          visible={availSettingsOpen} onClose={() => setAvailSettingsOpen(() => false)}
          cheerleaderMode={cheerleaderMode} setCheerleaderMode={setCheerleaderMode}
          driveWindowDays={driveWindowDays} setDriveWindowDays={setDriveWindowDays}
          driveWindowStart={driveWindowStart} setDriveWindowStart={setDriveWindowStart}
          driveWindowEnd={driveWindowEnd} setDriveWindowEnd={setDriveWindowEnd}
          weeklyRideCap={weeklyRideCap} setWeeklyRideCap={setWeeklyRideCap}
          ridesThisWeek={ridesThisWeek}
          active={active} colors={colors} isDark={isDark}
        />

        {/* Collapsible dispatch content */}
        {helperDispatchExpanded && <>
          {!cheerleaderMode && (
            <OpenRideRequestsList openRides={openRides} members={members} atWeeklyCap={atWeeklyCap}
              onClaim={onClaimRide} onPass={onPassRide} colors={colors} isDark={isDark} active={active} />
          )}

          {!cheerleaderMode && (
            <QuestInvitationsSection invitations={gpInvitations} active={active} members={members}
              colors={colors} isDark={isDark} claimGPErrand={claimGPErrand} />
          )}

          <ActiveErrandsSection errands={myActiveErrands} onOpenReceiptModal={onOpenReceiptModal} onMarkDoneNoReceipt={onMarkDoneNoReceipt} onBackout={onBackoutErrand} colors={colors} isDark={isDark} />
          <ErrandsAwaitingReviewSection errands={myErrandsAwaitingReview} colors={colors} isDark={isDark} />

          <PendingOffersSection offers={myPendingOffers} onWithdraw={onWithdrawOffer} colors={colors} isDark={isDark} />

          <FamilyNeedsHandSection
            openRequests={openRequests} gpWelcomeRequests={gpWelcomeRequests}
            gpWelcomeChores={gpWelcomeChores} volunteerPool={volunteerPool}
            active={active} members={members} allNames={allNames} colors={colors} isDark={isDark}
            updateEvent={updateEvent} updateChore={updateChore} assignRequest={assignRequest}
            claimGPErrand={claimGPErrand} />
        </>}
      </View>
    </View>
  );
}
