import { supabase } from '@/lib/supabase';

export interface ExtractedTask {
  title: string;
  category: string;       // responsibility_categories domain, e.g. 'transport', 'medical', 'household'
  kind: 'event' | 'quest';
  startAt: string | null; // ISO 8601
  requirements: string[];
  forMemberName: string | null;
}

export interface ExtractedErrand {
  category: string;        // responsibility_categories errand subcategory
  storeName: string | null;
  items: string[];
}

export interface ExtractResponsibilityResult {
  task: ExtractedTask | null;
  errand: ExtractedErrand | null;
  ambiguous: boolean;
}

export const familyAi = {
  async suggestRewards(kids: { name: string; coins: number }[]) {
    const { data, error } = await supabase.functions.invoke('family-ai', {
      body: {
        action: 'suggest_rewards',
        kids,
      },
    });
    if (error) throw error;
    return data as { name: string; description: string; coinCost: number; emoji: string }[];
  },

  // Shared free-text/voice intake — one input may produce an event/quest-
  // shaped task, an errand, both, or neither. Used by both the typed-title
  // category nudge and (once built) voice event/quest creation, so the
  // classification logic only lives in one place.
  async extractResponsibility(text: string, existingMembers?: { id: string; name: string }[]) {
    // Client's own local date, not the edge function's server clock — so
    // "this weekend"/"tonight" resolve against the day the user is actually
    // living in, matching parse-appointment-voice's same pattern.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const { data, error } = await supabase.functions.invoke('family-ai', {
      body: { action: 'extract_responsibility', text, existingMembers, today: todayStr },
    });
    if (error) throw error;
    return (data as { ok: boolean; result: ExtractResponsibilityResult }).result;
  },
};
