import { useState } from 'react';

// Bundles ParentView's modal/sheet open-state and the one-shot UI flags that
// go with it. Extracted verbatim from ParentView.tsx; see inline comments
// for why the addPrefill handoff is shaped the way it is.
export function useParentModals() {
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  // Unified "Add Task" quick-action tile opens this first — same
  // SmartTaskComposer/"just describe it" entry point the Tasks tab's FAB
  // uses. Its own "adjust in full form" handoff falls through to the
  // existing showAddTask/showAddEvent manual modals below via the same
  // addPrefill state HouseholdBacklog's voice-intake handoff already uses.
  const [showTaskComposer, setShowTaskComposer] = useState(false);
  // Quick-action entry points go through the Speak it/Type it chooser first
  // (matching the existing pet-appointment voice flow) — HouseholdBacklog's
  // own "add task" trigger below still opens the manual quest form directly,
  // since that's a narrower, already-scoped-to-backlog action.
  // "Adjust in full form" handoff from VoiceIntakeReviewSheet — seeds
  // whichever manual modal opens next with the AI-extracted fields.
  const [addPrefill, setAddPrefill] = useState<{
    title: string; category?: string; memberId?: string; startAt?: string;
    notes?: string; coins?: number; photoRequired?: boolean;
  } | undefined>(undefined);
  const [pushbackSheet, setPushbackSheet] = useState<{ assignmentId: string; choreTitle: string; assignedBy: string; assignedTo: string } | null>(null);
  const [delegateSheet, setDelegateSheet] = useState<{ choreId: string; choreTitle: string } | null>(null);

  return {
    showAddTask, setShowAddTask,
    showAddEvent, setShowAddEvent,
    showTaskComposer, setShowTaskComposer,
    addPrefill, setAddPrefill,
    pushbackSheet, setPushbackSheet,
    delegateSheet, setDelegateSheet,
  };
}
