/**
 * questFormShared — constants and formatters shared by AddQuestModal,
 * EditQuestModal, and the QuestsScreen orchestrator.
 */
import type { QuestCategory } from '@/store/questStore';

// ─── Add Quest Modal ──────────────────────────────────────────────────────────
// 'Other' leads the list — AddQuestModal now defaults to it (nothing
// selected yet is represented as Other, not an arbitrary built-in category
// like Kitchen), so it needs to be the first, most reachable chip rather
// than buried at the end of a 20-item horizontal scroll.
export const ALL_CATEGORIES: QuestCategory[] = ['Other', 'Kitchen', 'Room', 'Yard', 'School', 'Pet', 'Living Room', 'Garage', 'Bathroom', 'Laundry', 'Errand', 'Tech', 'Finance', 'Health', 'Garden', 'Car', 'Shopping', 'Cooking', 'Social', 'Creative'];

// Separate from ALL_CATEGORIES (kept as a plain string array since
// EditQuestModal also consumes it directly) — emoji+color per category,
// matching EventFormModal's CATEGORIES chip styling exactly (stacked
// emoji-over-label, per-category accent color instead of one flat purple).
export const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  Kitchen:      { emoji: '🍽️', color: '#F59E0B' },
  Room:         { emoji: '🛏️', color: '#6C5CE7' },
  Yard:         { emoji: '🌳', color: '#10B981' },
  School:       { emoji: '📚', color: '#3B82F6' },
  Pet:          { emoji: '🐾', color: '#A855F7' },
  'Living Room':{ emoji: '🛋️', color: '#0EA5E9' },
  Garage:       { emoji: '🚪', color: '#64748B' },
  Bathroom:     { emoji: '🚿', color: '#06B6D4' },
  Laundry:      { emoji: '🧺', color: '#EC4899' },
  Errand:       { emoji: '🛒', color: '#0EA5E9' },
  Tech:         { emoji: '💻', color: '#6366F1' },
  Finance:      { emoji: '💰', color: '#059669' },
  Health:       { emoji: '💪', color: '#EF4444' },
  Garden:       { emoji: '🌱', color: '#22C55E' },
  Car:          { emoji: '🚗', color: '#F97316' },
  Shopping:     { emoji: '🛍️', color: '#EC4899' },
  Cooking:      { emoji: '🍳', color: '#F59E0B' },
  Social:       { emoji: '🎉', color: '#6C5CE7' },
  Creative:     { emoji: '🎨', color: '#A855F7' },
  Other:        { emoji: '✨', color: '#64748B' },
};

// ─── Quest title suggestion bank (category-tagged for auto-select) ────────────
// subcategoryId maps each suggestion to a real responsibility_categories row
// so picking a suggestion also sets the Responsibility Engine's scoring
// input directly — this is what replaced the old separate "Specifically…"
// taxonomy chip row: instead of a second, parallel decision, the taxonomy
// signal now rides along with the suggestion pick itself. Left undefined
// only where nothing in the taxonomy genuinely fits (falls back to the
// domain resolved from the loose category label, same as before).
export const QUEST_SUGGESTIONS: { title: string; category: QuestCategory; coins: number; desc: string; subcategoryId?: string }[] = [
  // Kitchen
  { title: 'Wash the dishes',          category: 'Kitchen',     coins: 20, desc: 'Wash all dishes in the sink, rinse and leave them to dry.', subcategoryId: 'household.kitchen' },
  { title: 'Load the dishwasher',      category: 'Kitchen',     coins: 15, desc: 'Load all dirty dishes and run the dishwasher.', subcategoryId: 'household.kitchen' },
  { title: 'Unload the dishwasher',    category: 'Kitchen',     coins: 15, desc: 'Put away all clean dishes from the dishwasher.', subcategoryId: 'household.kitchen' },
  { title: 'Wipe down the counters',   category: 'Kitchen',     coins: 15, desc: 'Wipe all kitchen counters clean with a cloth.', subcategoryId: 'household.kitchen' },
  { title: 'Clean the stovetop',       category: 'Kitchen',     coins: 25, desc: 'Scrub and wipe the stovetop until grease-free.', subcategoryId: 'household.kitchen' },
  { title: 'Empty the trash',          category: 'Kitchen',     coins: 10, desc: 'Empty the kitchen trash bin and replace the bag.', subcategoryId: 'household.cleaning' },
  { title: 'Take out recycling',       category: 'Kitchen',     coins: 10, desc: 'Collect and take out all recyclables to the bin.', subcategoryId: 'household.cleaning' },
  { title: 'Mop the kitchen floor',    category: 'Kitchen',     coins: 30, desc: 'Sweep then mop the kitchen floor until clean.', subcategoryId: 'household.kitchen' },
  { title: 'Clean the microwave',      category: 'Kitchen',     coins: 20, desc: 'Wipe inside and outside the microwave thoroughly.', subcategoryId: 'household.kitchen' },
  { title: 'Refill the water filter',  category: 'Kitchen',     coins: 10, desc: 'Refill the water filter pitcher and put it back.', subcategoryId: 'household.kitchen' },
  // Room / Bedroom
  { title: 'Make your bed',            category: 'Room',        coins: 10, desc: 'Make the bed neatly with pillows in place.', subcategoryId: 'household.cleaning' },
  { title: 'Tidy your room',           category: 'Room',        coins: 20, desc: 'Pick up clutter, put items away, and straighten up the room.', subcategoryId: 'household.cleaning' },
  { title: 'Vacuum your bedroom',      category: 'Room',        coins: 25, desc: 'Vacuum the entire bedroom floor including under the bed.', subcategoryId: 'household.cleaning' },
  { title: 'Organize your closet',     category: 'Room',        coins: 30, desc: 'Sort and organize clothes and items in the closet.', subcategoryId: 'household.cleaning' },
  { title: 'Put away clean clothes',   category: 'Room',        coins: 15, desc: 'Fold and put away all clean laundry in the right places.', subcategoryId: 'household.laundry' },
  // Living Room
  { title: 'Vacuum the living room',   category: 'Living Room', coins: 25, desc: 'Vacuum the entire living room including under cushions.', subcategoryId: 'household.cleaning' },
  { title: 'Dust the shelves',         category: 'Living Room', coins: 20, desc: 'Dust all shelves, surfaces, and decorative items.', subcategoryId: 'household.cleaning' },
  { title: 'Tidy the couch cushions',  category: 'Living Room', coins: 10, desc: 'Fluff and arrange all couch cushions neatly.', subcategoryId: 'household.cleaning' },
  { title: 'Wipe down the TV stand',   category: 'Living Room', coins: 15, desc: 'Wipe the TV stand and tidy up cables.', subcategoryId: 'household.cleaning' },
  // Bathroom
  { title: 'Clean the toilet',         category: 'Bathroom',    coins: 30, desc: 'Scrub and disinfect the toilet bowl, seat, and exterior.', subcategoryId: 'household.cleaning' },
  { title: 'Scrub the bathtub',        category: 'Bathroom',    coins: 35, desc: 'Scrub the bathtub and rinse until clean.', subcategoryId: 'household.cleaning' },
  { title: 'Wipe the bathroom mirror', category: 'Bathroom',    coins: 15, desc: 'Clean the bathroom mirror until streak-free.', subcategoryId: 'household.cleaning' },
  { title: 'Replace toilet paper',     category: 'Bathroom',    coins: 5,  desc: 'Replace empty rolls and stock spare toilet paper.', subcategoryId: 'household.cleaning' },
  { title: 'Empty bathroom trash',     category: 'Bathroom',    coins: 10, desc: 'Empty the bathroom bin and replace the bag.', subcategoryId: 'household.cleaning' },
  // Laundry
  { title: 'Do a load of laundry',     category: 'Laundry',     coins: 25, desc: 'Sort, wash, and start a full load of laundry.', subcategoryId: 'household.laundry' },
  { title: 'Move laundry to dryer',    category: 'Laundry',     coins: 10, desc: 'Transfer wet clothes from washer to dryer and start it.', subcategoryId: 'household.laundry' },
  { title: 'Fold the laundry',         category: 'Laundry',     coins: 20, desc: 'Fold all clean dry laundry and set aside for putting away.', subcategoryId: 'household.laundry' },
  { title: 'Iron the clothes',         category: 'Laundry',     coins: 30, desc: 'Iron all clothes that need it and hang them up.', subcategoryId: 'household.laundry' },
  // Yard / Garden
  { title: 'Mow the lawn',             category: 'Yard',        coins: 50, desc: 'Mow the entire lawn and collect the clippings.', subcategoryId: 'household.yard' },
  { title: 'Rake the leaves',          category: 'Yard',        coins: 40, desc: 'Rake all fallen leaves and bag them for disposal.', subcategoryId: 'household.yard' },
  { title: 'Water the plants',         category: 'Garden',      coins: 15, desc: 'Water all indoor and outdoor plants thoroughly.', subcategoryId: 'household.yard' },
  { title: 'Pull out weeds',           category: 'Garden',      coins: 35, desc: 'Pull weeds from the garden beds and dispose of them.', subcategoryId: 'household.yard' },
  { title: 'Sweep the porch',          category: 'Yard',        coins: 20, desc: 'Sweep the front and back porch clean.', subcategoryId: 'household.yard' },
  { title: 'Take out the garbage bins',category: 'Yard',        coins: 15, desc: 'Wheel garbage and recycling bins to the curb for pickup.', subcategoryId: 'household.yard' },
  // Pet
  { title: 'Feed the dog',             category: 'Pet',         coins: 15, desc: 'Give the dog the correct portion of food and fresh water.', subcategoryId: 'household.pet_care' },
  { title: 'Walk the dog',             category: 'Pet',         coins: 25, desc: 'Take the dog for a 20–30 minute walk.', subcategoryId: 'household.pet_care' },
  { title: 'Clean the litter box',     category: 'Pet',         coins: 20, desc: 'Scoop and clean the litter box, replace litter if needed.', subcategoryId: 'household.pet_care' },
  { title: 'Bathe the dog',            category: 'Pet',         coins: 40, desc: 'Give the dog a bath and dry them off properly.', subcategoryId: 'household.pet_care' },
  { title: 'Refill pet water bowl',    category: 'Pet',         coins: 10, desc: 'Clean and refill the pet water bowl with fresh water.', subcategoryId: 'household.pet_care' },
  // School
  { title: 'Finish homework',          category: 'School',      coins: 30, desc: 'Complete all assigned homework and pack it in the school bag.', subcategoryId: 'school.homework_help' },
  { title: 'Read for 20 minutes',      category: 'School',      coins: 20, desc: 'Read a book or assignment for at least 20 minutes.', subcategoryId: 'school.homework_help' },
  { title: 'Study for the test',       category: 'School',      coins: 35, desc: 'Study the relevant material for the upcoming test.', subcategoryId: 'school.homework_help' },
  { title: 'Organize school bag',      category: 'School',      coins: 10, desc: 'Pack the school bag with everything needed for tomorrow.', subcategoryId: 'school.supplies' },
  // Errands / Shopping
  { title: 'Grocery run',              category: 'Shopping',    coins: 40, desc: 'Go to the grocery store and pick up the items on the list.', subcategoryId: 'errand.grocery' },
  { title: 'Pick up dry cleaning',     category: 'Errand',      coins: 20, desc: 'Pick up the dry cleaning and bring it home.', subcategoryId: 'errand.dry_cleaning' },
  { title: 'Drop off package',         category: 'Errand',      coins: 15, desc: 'Drop off the package at the post office or shipping location.', subcategoryId: 'errand.package' },
  { title: 'Return library books',     category: 'Errand',      coins: 15, desc: 'Return all overdue or finished library books.', subcategoryId: 'errand.return' },
  // Cooking
  { title: 'Cook dinner tonight',      category: 'Cooking',     coins: 50, desc: 'Plan and cook a full dinner for the family.', subcategoryId: 'household.kitchen' },
  { title: 'Make breakfast',           category: 'Cooking',     coins: 25, desc: 'Prepare a proper breakfast for everyone.', subcategoryId: 'household.kitchen' },
  { title: 'Pack school lunches',      category: 'Cooking',     coins: 20, desc: 'Pack healthy lunches for school tomorrow.', subcategoryId: 'household.kitchen' },
  { title: 'Bake something special',   category: 'Cooking',     coins: 40, desc: 'Bake a treat or dessert for the family to enjoy.', subcategoryId: 'household.kitchen' },
  // Car / Garage
  { title: 'Wash the car',             category: 'Car',         coins: 40, desc: 'Wash and rinse the exterior of the car thoroughly.', subcategoryId: 'household.maintenance' },
  { title: 'Vacuum the car interior',  category: 'Car',         coins: 30, desc: 'Vacuum all seats and floor mats inside the car.', subcategoryId: 'household.maintenance' },
  { title: 'Organize the garage',      category: 'Garage',      coins: 50, desc: 'Sort and organize items in the garage, clear walkways.', subcategoryId: 'household.garage' },
  // Tech / Finance / Health — no clean taxonomy match for Tech, left
  // unmapped (falls back to the resolved domain, same as before this change)
  { title: 'Charge all devices',       category: 'Tech',        coins: 10, desc: 'Plug in and charge all family devices overnight.' },
  { title: 'Back up family photos',    category: 'Tech',        coins: 20, desc: 'Back up recent photos to the cloud or external drive.' },
  { title: 'Pay a bill online',        category: 'Finance',     coins: 15, desc: 'Log in and pay the specified bill before the due date.', subcategoryId: 'financial.bill_pay' },
  { title: 'Go for a 30-min walk',     category: 'Health',      coins: 25, desc: 'Go outside for a brisk 30-minute walk.' },
  // Social / Creative
  { title: 'Write a thank-you card',   category: 'Social',      coins: 20, desc: 'Write a heartfelt thank-you card and send or deliver it.', subcategoryId: 'social.family_event' },
  { title: 'Draw or paint something',  category: 'Creative',    coins: 20, desc: 'Create a drawing or painting to share with the family.' },
];

// Format a Date as "June 25, 2026"
export function fmtDateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
// Format a Date as "3:30 PM"
export function fmtTimeLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
