import { supabase } from '@/lib/supabase';

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
};
