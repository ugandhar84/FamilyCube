import { useState } from 'react';
import { Alert } from 'react-native';
import FullPageOverlay from '@/components/FullPageOverlay';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useRewardStore } from '@/store/rewardStore';
import type { FamilyMember } from '@/store/familyStore';
import { MyChoresScreen } from './MyChoresScreen';
import { PiggyBankScreen } from './PiggyBankScreen';
import { AskParentHubScreen, type AskParentDestination } from './AskParentHubScreen';
import { AskParentUnifiedPage, type AskFormType } from './forms/AskParentUnifiedPage';
import { TeenTutorPage } from '../teen/TeenTutorPage';
import { TeenCashOutPage } from '../teen/TeenCashOutPage';
import { TeenGasVehiclePage } from '../teen/TeenGasVehiclePage';
import type { KidRequest } from '@/store/kidRequestStore';

/**
 * KidOverlays — the kid role's three FullPageOverlay screens (My Chores,
 * Piggy Bank, Ask Parent + its 8 forms), rendered by HubScreen.tsx as a
 * TOP-LEVEL sibling OUTSIDE the ScrollView — same position Parent Hub's own
 * Meals/Rides Room overlays already use. They used to live inside
 * KidView.tsx, itself mounted inside HubScreen's ScrollView; a
 * FullPageOverlay's position:absolute there is still laid out within the
 * ScrollView's (transform-scrolled) content box, so opening a tile while
 * the Hub was scrolled down opened the new page ALREADY scrolled to match
 * [live-reported, screenshot: My Chores opening on "Completed" instead of
 * the top; "All new pages opened with some pre scroll"]. Moving the
 * overlay rendering (not just the trigger) outside the ScrollView fixes it
 * the same way Parent's already-correct overlays are structured.
 *
 * Re-derives its own quest/coin/reward data straight from the Zustand
 * stores instead of receiving it as props from KidView — cheap (just a
 * second subscription to stores KidView already reads) and avoids
 * threading a long prop list across the HubScreen/KidView boundary for
 * values that already live in global state.
 */
export function KidOverlays({
  active, members, familyId,
  showMyChores, setShowMyChores, myChoresInitialTab, setMyChoresInitialTab,
  piggyBankModal, setPiggyBankModal,
  showAskParentHub, closeAskParentHub,
  askParentDestination, setAskParentDestination,
  teenTutorOpen, closeTeenTutor, teenSiblings, teenPendingOffers, onSendTutorOffer, onCancelTutorOffer,
  teenCashOutOpen, closeTeenCashOut, teenBalance, onRequestCashOut, teenCashOuts,
  teenGasVehicleOpen, closeTeenGasVehicle, teenToday, onReportVehicleIssue,
}: {
  active: FamilyMember; members: FamilyMember[]; familyId?: string;
  showMyChores: boolean; setShowMyChores: (v: boolean) => void;
  myChoresInitialTab?: 'todo' | 'review' | 'done' | 'bounty';
  setMyChoresInitialTab?: (v: 'todo' | 'review' | 'done' | 'bounty' | undefined) => void;
  piggyBankModal: boolean; setPiggyBankModal: (v: boolean) => void;
  showAskParentHub: boolean; closeAskParentHub: () => void;
  askParentDestination: null | AskParentDestination;
  setAskParentDestination: (v: null | AskParentDestination) => void;
  // Teen-only — Tutor/Cash-Out full-page overlays. Optional since KidView
  // (the kid role) never passes these.
  teenTutorOpen?: boolean; closeTeenTutor?: () => void;
  teenSiblings?: FamilyMember[]; teenPendingOffers?: KidRequest[];
  onSendTutorOffer?: (kid: FamilyMember, subject: string, note: string) => void;
  onCancelTutorOffer?: (id: string) => void;
  teenCashOutOpen?: boolean; closeTeenCashOut?: () => void;
  teenBalance?: number; onRequestCashOut?: (amount: string, method: string) => void;
  teenCashOuts?: KidRequest[];
  teenGasVehicleOpen?: boolean; closeTeenGasVehicle?: () => void;
  teenToday?: string; onReportVehicleIssue?: (detail: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const kidAskCanvas = isDark ? colors.background : GEMINI.canvas;

  const { quests, submitQuest, claimQuest } = useQuestStore();
  const { startGrandparentQuest, chores } = useChoreStore();
  const { rewards } = useRewardStore();

  const [declineQuest, setDeclineQuest] = useState<any>(null);

  const myQuests = quests.filter(q =>
    q.assignedToId === active.id || (Array.isArray((q as any).assignedToIds) && (q as any).assignedToIds.includes(active.id)));
  const todoQuests       = myQuests.filter(q => q.status === 'todo' && !q.isPool);
  const inProgressQuests = myQuests.filter(q => ['claimed', 'in_progress'].includes(q.status));
  const reviewQuests     = myQuests.filter(q => q.status === 'pending_approval');
  const declinedQuests   = myQuests.filter(q => q.status === 'declined');
  const approvedQuests   = myQuests.filter(q => ['approved', 'done'].includes(q.status));
  const poolQuests       = quests.filter(q => q.isPool && q.status === 'todo' && !(q as any).isAdultTask && !q.awaitingParentApproval && !(q as any).inviteGrandparents && !(q as any).isOpenToTeens);

  const mainCoins = (active as any).mainCoins ?? (active as any).coins ?? 0;
  const gpCoins   = (active as any).gpCoins ?? 0;
  const streak    = (active as any).streak ?? 0;
  const xp        = (active as any).xp ?? 0;
  const level = (() => {
    let n = 1;
    while (xp >= 100 * n * (n + 1) / 2) n++;
    return n;
  })();
  const doneToday = myQuests.filter(q => ['approved', 'done'].includes(q.status)).length;
  const eligibleRewardIds = new Set(rewards.filter(r => r.cost <= mainCoins).map(r => r.id));
  const almostAffordable = rewards.filter(r => !eligibleRewardIds.has(r.id) && r.cost > 0 && r.cost - mainCoins <= 30 && r.cost - mainCoins > 0);
  const goalReward = (active as any).goalRewardId
    ? rewards.find(r => r.id === (active as any).goalRewardId && r.available)
    : undefined;

  // A photoRequired quest's "Take Photo to Get Paid" button is handled
  // entirely inline inside KidQuestDetailScreen/KidQuestCard's own
  // onOpenDetail routing now (a plain View compose block, not a Modal
  // sheet) [live-corrected: "I said don't use bottom sheets use inline
  // photo proof similar to parent" — the earlier SubmitProofSheet modal
  // was the wrong shape]. This handler only ever reaches a non-photo
  // submit, so it just calls submitQuest directly.
  const handleSubmitTap = (q: any) => submitQuest(q.id, undefined, active.id);

  return (
    <>
      <FullPageOverlay visible={piggyBankModal} onDismiss={() => setPiggyBankModal(false)} zIndex={50} backgroundColor={kidAskCanvas}>
{(close) => (
        <PiggyBankScreen
          onClose={close} colors={colors} isDark={isDark}
          mainCoins={mainCoins} gpCoins={gpCoins} almostAffordable={almostAffordable} goalReward={goalReward}
          doneToday={doneToday} streak={streak} level={level} memberId={active.id}
        />
)}
      </FullPageOverlay>

      <FullPageOverlay visible={showMyChores} onDismiss={() => { setShowMyChores(false); setMyChoresInitialTab?.(undefined); }} zIndex={50} backgroundColor={kidAskCanvas}>
{(close) => (
        <MyChoresScreen
          onClose={close}
          active={active} members={members} familyId={familyId ?? ''}
          todoQuests={todoQuests} inProgressQuests={inProgressQuests} reviewQuests={reviewQuests}
          declinedQuests={declinedQuests} approvedQuests={approvedQuests} poolQuests={poolQuests} allQuests={quests}
          colors={colors} isDark={isDark}
          initialTab={myChoresInitialTab}
          onClaim={(id) => claimQuest(id, active.id, (reason) => {
            Alert.alert(
              reason === 'deleted' ? 'No longer available' : 'Someone beat you to it!',
              reason === 'deleted'
                ? 'This chore was just removed by a parent.'
                : 'Someone else already claimed this chore — check the pool for others.',
            );
          })}
          onStart={(id) => submitQuest(id, undefined, active.id)}
          onSubmit={handleSubmitTap}
          onAcceptGpQuest={(id) => startGrandparentQuest(id, active.id)}
          onDeclineGpQuest={(q) => {
            const chore = chores.find(c => c.id === q.id);
            if (chore) setDeclineQuest(chore);
          }}
        />
)}
      </FullPageOverlay>

      {/* Ask Parent — full-page landing hub, stacked sibling. Picking a
          destination opens the matching full-page form ABOVE it (zIndex 51)
          without closing the hub underneath. */}
      <FullPageOverlay visible={showAskParentHub} onDismiss={closeAskParentHub} zIndex={50} backgroundColor={kidAskCanvas}>
{(close) => (
        <AskParentHubScreen
          onClose={close}
          onSelect={(destination) => setAskParentDestination(destination)}
          activeMemberId={active.id}
        />
)}
      </FullPageOverlay>
      <FullPageOverlay visible={!!askParentDestination} onDismiss={() => setAskParentDestination(null)} zIndex={51} backgroundColor={kidAskCanvas}>
{(close) => (
        askParentDestination ? (
          <AskParentUnifiedPage
            active={active} members={members} familyId={familyId ?? ''}
            initialType={askParentDestination as AskFormType}
            onClose={close}
          />
        ) : null
)}
      </FullPageOverlay>

      {/* Teen-only — Tutor / Cash-Out, converted from TeenTileSheet bottom
          sheets to full-page overlays matching the Ask-Parent rhythm
          ["touturing and cashout should be full page overlay with figma
          /gemini rythem"]. */}
      {/* zIndex 55 (above every other top-level-50 Hub overlay, e.g.
          HubScreen's showGrocery/showMeals/showRewards/showMemories) —
          these three were tied at 50 with those unrelated overlays, so if
          one of those was ever left `true` underneath (state not reset on
          its own dismiss path), swiping back out of a Teen overlay could
          reveal it instead of the Hub [live-reported: "back swipe or close
          of gas log page is going to [Grocery]"]. */}
      <FullPageOverlay visible={!!teenTutorOpen} onDismiss={() => closeTeenTutor?.()} zIndex={55} backgroundColor={kidAskCanvas}>
{(close) => (
        <TeenTutorPage
          siblings={teenSiblings ?? []} pendingOffers={teenPendingOffers ?? []}
          onSend={(kid, subject, note) => onSendTutorOffer?.(kid, subject, note)}
          onCancel={(id) => onCancelTutorOffer?.(id)}
          onClose={close}
        />
)}
      </FullPageOverlay>
      <FullPageOverlay visible={!!teenCashOutOpen} onDismiss={() => closeTeenCashOut?.()} zIndex={55} backgroundColor={kidAskCanvas}>
{(close) => (
        <TeenCashOutPage
          balance={teenBalance ?? 0}
          cashOuts={teenCashOuts ?? []}
          onRequest={(amount, method) => onRequestCashOut?.(amount, method)}
          onClose={close}
        />
)}
      </FullPageOverlay>
      <FullPageOverlay visible={!!teenGasVehicleOpen} onDismiss={() => closeTeenGasVehicle?.()} zIndex={55} backgroundColor={kidAskCanvas}>
{(close) => (
        <TeenGasVehiclePage
          activeId={active.id} today={teenToday ?? ''}
          onReportIssue={(detail) => onReportVehicleIssue?.(detail)}
          onClose={close}
        />
)}
      </FullPageOverlay>
    </>
  );
}
