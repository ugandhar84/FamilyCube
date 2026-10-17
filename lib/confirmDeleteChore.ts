/**
 * confirmDeleteChore — one delete prompt for every place a chore can be removed, shaped like the event calendar's
 * "this one / this and following / all" choice. A repeating chore is a single row that rolls to its next date after each
 * round, so the two real choices are: skip just this time (it keeps repeating), or delete it and every future round.
 * A chore that does not repeat just asks to delete.
 */
import { Alert } from 'react-native';

type ChoreLike = { id: string; title: string; recurrence?: string };

export function confirmDeleteChore(opts: {
  quest: ChoreLike;
  deleteQuest: (id: string) => void;
  skipQuestOccurrence?: (id: string) => Promise<boolean> | boolean;
  /** Shown first, e.g. "Maya is working on it right now." */
  intro?: string;
  onDeleted?: () => void;
  onSkipped?: () => void;
  /** Runs right before a real delete (e.g. tell the assignee). */
  beforeDelete?: () => void;
}) {
  const { quest, deleteQuest, skipQuestOccurrence, intro, onDeleted, onSkipped, beforeDelete } = opts;
  const repeats = !!quest.recurrence && quest.recurrence !== 'once' && quest.recurrence !== 'none';
  const del = () => { beforeDelete?.(); deleteQuest(quest.id); onDeleted?.(); };

  if (!repeats || !skipQuestOccurrence) {
    Alert.alert('Delete chore', `${intro ? intro + ' ' : ''}Remove "${quest.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: del },
    ]);
    return;
  }
  Alert.alert(
    `Delete "${quest.title}"?`,
    `${intro ? intro + ' ' : ''}This chore repeats ${quest.recurrence}. Skip just this time and it comes back next time, or delete it for good, including every future round.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Just this time', onPress: async () => { await skipQuestOccurrence(quest.id); onSkipped?.(); } },
      { text: 'This and all future', style: 'destructive', onPress: del },
    ],
  );
}
