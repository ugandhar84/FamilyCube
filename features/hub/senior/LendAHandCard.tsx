import { View, Text, Pressable, TextInput } from 'react-native';
import { Car, ChevronDown, ChevronUp, Hand, PartyPopper } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from './seniorTheme';

// Amber accent for the dispatch icon/badge — distinct hue from BRAND.amber
// used for other chrome in this tree, kept as a local constant instead of a
// repeated bare hex.
const DISPATCH_AMBER = '#F59E0B';
import { OpenRideRequestsList } from './OpenRideRequestsList';
import { QuestInvitationsSection } from './QuestInvitationsSection';
import { ActiveErrandsSection, ErrandsAwaitingReviewSection, PendingOffersSection } from './ActiveErrandsSection';
import { FamilyNeedsHandSection } from './FamilyNeedsHandSection';
import type { FamilyMember } from '@/store/familyStore';
import type { FamilyEvent } from '@/store/eventStore';
import type { ChoreTask } from '@/store/choreStore';
import type { KidRequest } from '@/store/kidRequestStore';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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
          onPress={() => { console.log(`[UserAction] screen=Hub role=senior member=${active.name} tapped "Lend a Hand header" (expand/collapse) → setHelperDispatchExpanded [features/hub/senior/LendAHandCard.tsx:77]`); setHelperDispatchExpanded(v => !v); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20,
            backgroundColor: DISPATCH_AMBER + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Car size={20} color={DISPATCH_AMBER} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: GP.title, fontWeight: '900', color: colors.textPrimary }}>
                Lend a Hand
              </Text>
              {hasDispatchItems && (
                <View style={{ backgroundColor: DISPATCH_AMBER, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>
                    {dispatchBadgeCount}
                  </Text>
                </View>
              )}
              {cheerleaderMode && (
                <View style={{ backgroundColor: BRAND.purple + '20', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: BRAND.purple + '40' }}>
                  <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: BRAND.purple }}>Cheerleader Mode</Text>
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
          <Pressable onPress={(e) => { e.stopPropagation(); console.log(`[UserAction] screen=Hub role=senior member=${active.name} tapped "Ask" on "Lend a Hand" → onHelpRequest [features/hub/senior/LendAHandCard.tsx:111]`); onHelpRequest(); }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: BRAND.amber, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Hand size={14} color="#fff" />
            <Text style={{ fontSize: GP.body, fontWeight: '800', color: '#fff' }}>Ask</Text>
          </Pressable>
          <Pressable onPress={(e) => { e.stopPropagation(); console.log(`[UserAction] screen=Hub role=senior member=${active.name} tapped "Availability Settings toggle" on "Lend a Hand" → setAvailSettingsOpen [features/hub/senior/LendAHandCard.tsx:118]`); setAvailSettingsOpen(o => !o); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {availSettingsOpen ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
          </Pressable>
        </Pressable>

        {/* Availability Settings (collapsible) */}
        {availSettingsOpen && (
          <View style={{ marginHorizontal: 14, marginBottom: 14, padding: 14, borderRadius: 16,
            backgroundColor: isDark ? colors.surface : '#F8FAFC',
            borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0', gap: 14 }}>

            {/* Cheerleader Mode toggle */}
            <Pressable onPress={() => { console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} toggled "Cheerleader Mode" on "Lend a Hand" → setCheerleaderMode [features/hub/senior/LendAHandCard.tsx:130]`); setCheerleaderMode(m => !m); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                padding: 12, borderRadius: 12, borderWidth: 1.5,
                borderColor: cheerleaderMode ? BRAND.purple : (isDark ? colors.border : '#E2E8F0'),
                backgroundColor: cheerleaderMode ? BRAND.purple + '12' : 'transparent' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <PartyPopper size={14} color={cheerleaderMode ? BRAND.purple : colors.textPrimary} />
                  <Text style={{ fontSize: GP.sub, fontWeight: '800',
                    color: cheerleaderMode ? BRAND.purple : colors.textPrimary }}>
                    Cheerleader Mode
                  </Text>
                </View>
                <Text style={{ fontSize: GP.tiny, color: colors.textSecondary, marginTop: 2 }}>
                  Hide all driving requests — I only want the celebration feed
                </Text>
              </View>
              <View style={{ width: 40, height: 24, borderRadius: 12,
                backgroundColor: cheerleaderMode ? BRAND.purple : (isDark ? '#334155' : '#CBD5E1'),
                justifyContent: 'center', paddingHorizontal: 3 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                  alignSelf: cheerleaderMode ? 'flex-end' : 'flex-start' }} />
              </View>
            </Pressable>

            {/* Drive window days */}
            {!cheerleaderMode && (
              <>
                <View>
                  <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
                    Drive Days
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {DAY_LABELS.map((d, i) => (
                      <Pressable key={i}
                        onPress={() => { console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} selected "${d}" for "Drive Days" on "Lend a Hand" [features/hub/senior/LendAHandCard.tsx:165]`); setDriveWindowDays(prev =>
                          prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                        ); }}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                          borderWidth: 1.5,
                          borderColor: driveWindowDays.includes(i) ? DISPATCH_AMBER : (isDark ? colors.border : '#E2E8F0'),
                          backgroundColor: driveWindowDays.includes(i) ? '#FEF3C7' : 'transparent' }}>
                        <Text style={{ fontSize: GP.tiny, fontWeight: '800',
                          color: driveWindowDays.includes(i) ? '#92400E' : colors.textSecondary }}>{d}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Time window */}
                <View>
                  <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
                    Available Hours
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TextInput
                      style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, padding: 9, textAlign: 'center',
                        fontSize: GP.body, fontWeight: '700', color: colors.textPrimary,
                        borderColor: isDark ? colors.border : '#E2E8F0',
                        backgroundColor: isDark ? colors.card : '#fff' }}
                      value={driveWindowStart} onChangeText={setDriveWindowStart}
                      onBlur={() => console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} field="Available Hours start" on "Lend a Hand" newValue=${driveWindowStart} [features/hub/senior/LendAHandCard.tsx:191]`)}
                      placeholder="14:00" placeholderTextColor={colors.textTertiary}
                    />
                    <Text style={{ fontSize: GP.sub, color: colors.textTertiary, fontWeight: '700' }}>to</Text>
                    <TextInput
                      style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, padding: 9, textAlign: 'center',
                        fontSize: GP.body, fontWeight: '700', color: colors.textPrimary,
                        borderColor: isDark ? colors.border : '#E2E8F0',
                        backgroundColor: isDark ? colors.card : '#fff' }}
                      value={driveWindowEnd} onChangeText={setDriveWindowEnd}
                      onBlur={() => console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} field="Available Hours end" on "Lend a Hand" newValue=${driveWindowEnd} [features/hub/senior/LendAHandCard.tsx:200]`)}
                      placeholder="17:30" placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                </View>

                {/* Weekly cap */}
                <View>
                  <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>
                    Max Rides / Week ({ridesThisWeek} taken this week)
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Pressable key={n} onPress={() => { console.log(`[UserAction] FORM screen=Hub role=senior member=${active.name} selected "${n}" for "Max Rides / Week" on "Lend a Hand" [features/hub/senior/LendAHandCard.tsx:212]`); setWeeklyRideCap(n); }}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                          borderWidth: 1.5,
                          borderColor: weeklyRideCap === n ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                          backgroundColor: weeklyRideCap === n ? BRAND.teal + '18' : 'transparent' }}>
                        <Text style={{ fontSize: GP.sub, fontWeight: '900',
                          color: weeklyRideCap === n ? BRAND.teal : colors.textSecondary }}>{n}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </>
            )}
          </View>
        )}

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
