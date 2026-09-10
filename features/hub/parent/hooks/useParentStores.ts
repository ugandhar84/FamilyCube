import { useEffect } from 'react';
import { useGroceryStore } from '@/store/groceryStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useTemporaryApproverStore } from '@/store/temporaryApproverStore';
import { useChoreStore } from '@/store/choreStore';
import type { FamilyMember } from '@/store/familyStore';

// Loads/subscribes to the various stores ParentView needs beyond the core
// quest/event/subscription stores — grocery, kid requests, temporary
// approver grants, and chores — plus their one-shot load effects. Extracted
// verbatim from ParentView.tsx; see inline comments for why each effect is
// shaped the way it is (they document real, previously-live bugs).
export function useParentStores(active: FamilyMember) {
  const { items: groceryItems, load: loadGrocery, addItem: addGroceryItem } = useGroceryStore();
  const { requests: kidRequests, loaded: kidRequestsLoaded, loadFromStorage: loadKidRequests,
          approveRequest, declineRequest, approveItems, rejectItems, toggleGPWelcome } = useKidRequestStore();
  const { grants: approverGrants, loaded: approverGrantsLoaded, loadFromStorage: loadApproverGrants,
          grantTemporaryApprover, revokeTemporaryApprover, getActiveGrantsForFamily } = useTemporaryApproverStore();

  const {
    parentAssignments, createAndAddParentQuest, addParentQuest,
    respondToParentQuest, completeParentQuest, cancelLockedAssignment, recallParentQuest, appreciationPing, getParentQuestPool,
    getPendingCashOuts, chores, addChore, getParentReviewDeck,
    approveGrandparentQuestAsParent, declineGrandparentQuestAsParent, grandparentApproveAndCheer,
    approveTeenReward, adjustTeenReward, declineTeenReward,
    acceptGPOffer, declineGPOffer,
    approveKidProposedChore, declineKidProposedChore,
    resolveRedoDispute,
    flagApprovalForDiscussion, standByApproval, requestApprovalReversal, coSignReversal,
    acknowledgeRecentApproval,
    getMyDirectPending, getMyLockedItems, getMyOutgoingPending, getActiveAssignmentChoreIds,
    loadFromStorage: loadChores, syncFromDB: syncChores,
  } = useChoreStore();
  const pendingReviews = getParentReviewDeck();

  useEffect(() => { loadGrocery((active as any).familyId ?? 'family-1'); }, [(active as any).familyId]);
  useEffect(() => { if (!kidRequestsLoaded) loadKidRequests(); }, [kidRequestsLoaded]);
  useEffect(() => { if (!approverGrantsLoaded) loadApproverGrants(); }, [approverGrantsLoaded]);
  const activeApproverGrants = getActiveGrantsForFamily();
  // This must run even when the review section starts collapsed. Otherwise a
  // parent who opens the Hub after a grandparent creates a quest never joins
  // the chore realtime channel and cannot see the safety-review request.
  useEffect(() => {
    loadChores().then(() => { void syncChores(); });
  }, [loadChores, syncChores]);

  return {
    groceryItems, loadGrocery, addGroceryItem,
    kidRequests, kidRequestsLoaded, loadKidRequests,
    approveRequest, declineRequest, approveItems, rejectItems, toggleGPWelcome,
    approverGrants, approverGrantsLoaded, loadApproverGrants,
    grantTemporaryApprover, revokeTemporaryApprover, getActiveGrantsForFamily,
    activeApproverGrants,
    parentAssignments, createAndAddParentQuest, addParentQuest,
    respondToParentQuest, completeParentQuest, cancelLockedAssignment, recallParentQuest, appreciationPing, getParentQuestPool,
    getPendingCashOuts, chores, addChore, getParentReviewDeck,
    approveGrandparentQuestAsParent, declineGrandparentQuestAsParent, grandparentApproveAndCheer,
    approveTeenReward, adjustTeenReward, declineTeenReward,
    acceptGPOffer, declineGPOffer,
    approveKidProposedChore, declineKidProposedChore,
    resolveRedoDispute,
    flagApprovalForDiscussion, standByApproval, requestApprovalReversal, coSignReversal,
    acknowledgeRecentApproval,
    getMyDirectPending, getMyLockedItems, getMyOutgoingPending, getActiveAssignmentChoreIds,
    loadChores, syncChores,
    pendingReviews,
  };
}
