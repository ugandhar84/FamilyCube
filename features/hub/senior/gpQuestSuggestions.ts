/**
 * gpQuestSuggestions — category/suggestion bank for GP-sponsored quests.
 *
 * Deliberately separate from features/quests/components/questFormShared.ts
 * (QUEST_SUGGESTIONS/ALL_CATEGORIES) — that bank is household chores at the
 * parent's house ("Wash the car", "Clean the toilet"). A grandparent-
 * sponsored quest is a shared bonding activity, often at the GP's own home
 * or over a video call (CreateQuestModal's own mode picker), not a chore —
 * reusing the household list would suggest the wrong kind of thing entirely.
 */

export type GpQuestCategory = 'Cooking' | 'Garden' | 'Stories' | 'Skills';

export const GP_QUEST_CATEGORIES: { key: GpQuestCategory; emoji: string; label: string }[] = [
  { key: 'Cooking', emoji: '🍳', label: 'Cooking' },
  { key: 'Garden',  emoji: '🌱', label: 'Garden & Outdoors' },
  { key: 'Stories', emoji: '📖', label: 'Stories & Learning' },
  { key: 'Skills',  emoji: '🧶', label: 'Skills & Legacy' },
];

export const GP_QUEST_SUGGESTIONS: {
  title: string; category: GpQuestCategory; mode: 'local' | 'virtual'; desc: string;
}[] = [
  // Cooking & baking together
  { title: 'Bake grandma\'s cookie recipe', category: 'Cooking', mode: 'local',   desc: 'Bake a family recipe together, step by step, from scratch.' },
  { title: 'Cook a family recipe together', category: 'Cooking', mode: 'local',   desc: 'Cook a dish that\'s been passed down in the family, together.' },
  { title: 'Make bread from scratch',       category: 'Cooking', mode: 'local',   desc: 'Mix, knead, and bake a loaf of bread together.' },
  { title: 'Decorate cupcakes together',    category: 'Cooking', mode: 'local',   desc: 'Bake and decorate a batch of cupcakes together.' },
  { title: 'Learn a recipe over video call',category: 'Cooking', mode: 'virtual', desc: 'Walk through a recipe together over video call, each cooking in your own kitchen.' },

  // Garden & outdoors
  { title: 'Plant something together',      category: 'Garden',  mode: 'local',   desc: 'Pick out and plant a flower, vegetable, or herb together.' },
  { title: 'Weed the flower garden',        category: 'Garden',  mode: 'local',   desc: 'Weed and tidy up a garden bed together.' },
  { title: 'Go on a nature walk',           category: 'Garden',  mode: 'local',   desc: 'Take a walk outside together — spot birds, leaves, bugs.' },
  { title: 'Water and check on the plants', category: 'Garden',  mode: 'local',   desc: 'Water the garden and check how everything is growing.' },
  { title: 'Start a mini herb garden',      category: 'Garden',  mode: 'local',   desc: 'Plant a small herb garden together — indoors or on a windowsill.' },

  // Stories, learning & video calls
  { title: '15-minute bedtime story call',  category: 'Stories', mode: 'virtual', desc: 'Read a bedtime story together over video call.' },
  { title: 'State capitals quiz',           category: 'Stories', mode: 'virtual', desc: 'Quiz each other on state capitals or another fun topic.' },
  { title: 'Practice a language together',  category: 'Stories', mode: 'virtual', desc: 'Practice vocabulary or conversation in a language together.' },
  { title: 'Share a story from when I was young', category: 'Stories', mode: 'local', desc: 'Tell a story from your own childhood or family history.' },
  { title: 'Help with homework over video', category: 'Stories', mode: 'virtual', desc: 'Help with a homework assignment over video call.' },

  // Skills & legacy
  { title: 'Teach a craft or hobby',        category: 'Skills',  mode: 'local',   desc: 'Teach knitting, drawing, woodworking, or another hobby together.' },
  { title: 'Practice an instrument together', category: 'Skills', mode: 'local',  desc: 'Practice music together — sing along or play an instrument.' },
  { title: 'Share a family heirloom story', category: 'Skills',  mode: 'local',   desc: 'Show a family heirloom or old photo and share its story.' },
  { title: 'Learn a life skill together',   category: 'Skills',  mode: 'local',   desc: 'Teach a practical skill — sewing a button, basic repairs, etc.' },
  { title: 'Build or fix something together', category: 'Skills', mode: 'local',  desc: 'Work on a small building or repair project together.' },
];
