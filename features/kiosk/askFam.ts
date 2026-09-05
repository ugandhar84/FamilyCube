/**
 * askFam — the answer engine behind the kiosk's "Ask Fam" drawer.
 *
 * ══ READ THIS BEFORE EXTENDING ═════════════════════════════════════════
 * This is NOT an LLM and does not call one. It is a small, deliberate
 * rule-based lookup: it matches a question against a handful of intents by
 * keyword, then answers from the app's REAL stores (events, chores,
 * rewards, meals, grocery, locations). Nothing here is generated, invented
 * or predicted — every sentence it returns is assembled from a value that
 * actually exists in the family's data right now, and when the data isn't
 * there it says so rather than filling the gap.
 *
 * That's a deliberate choice, not a placeholder for a "real" AI:
 *   · The reference mockup's version faked its answers with hardcoded
 *     strings ("Tonight's dinner is Paneer Butter Masala") that would be
 *     confidently wrong for every family but the one in the mock. A
 *     lookup that reads the actual meal row is strictly more useful AND
 *     more honest than a generated sentence about data it can't see.
 *   · A kitchen kiosk is a shared, always-on device in a room with kids.
 *     A free-form model answering household questions out loud is a much
 *     bigger product decision than a widget, and needs the owner's call.
 *
 * The drawer's UI states this in plain language to the person using it —
 * see KioskAskFamDrawer's subtitle. It must keep saying so. If a real
 * model is wired up later, that label is what changes first.
 *
 * The app DOES have a real AI surface already (components/AskCubeChat,
 * backed by the `family-ai` edge function, which KioskScreen still opens
 * for parents). This drawer is the fast, glanceable, no-network sibling of
 * it, not a replacement.
 */
import { useEventStore, eventAssignee } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useRewardStore } from '@/store/rewardStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useFamilyStore } from '@/store/familyStore';
import { fmtTime } from '@/lib/dates';
import type { Meal } from '@/features/vault/tabs/meals/types';

export interface AskFamTurn {
  id: string;
  role: 'you' | 'fam';
  text: string;
}

/** The quick-ask chips offered in the drawer, mirroring the mockup's. */
export const ASK_FAM_SUGGESTIONS = [
  "What's for dinner?",
  "What's on today?",
  'Who has chores left?',
  "What's on the grocery list?",
  'How many coins do the kids have?',
] as const;

/** Today's weekday in the 'Mon'|'Tue'|… form family_meals.day uses. */
function todayMealDay(): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
}

function firstName(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return useFamilyStore.getState().members.find(m => m.id === id)?.name?.trim().split(' ')[0];
}

function list(items: string[], max = 3): string {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  const joined = shown.length > 1
    ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
    : shown[0] ?? '';
  return rest > 0 ? `${joined}, plus ${rest} more` : joined;
}

/**
 * Answer a question from real store state.
 *
 * `meals` is passed in rather than read from a store because meal data
 * lives in the `family_meals` Supabase table with no Zustand store in front
 * of it (features/vault/tabs/MealsTab.tsx fetches it into local component
 * state) — the drawer's host loads the current week once and hands it here,
 * rather than this module opening a second, competing fetch path.
 */
export function answerAskFam(question: string, meals: Meal[]): string {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.some(w => q.includes(w));

  // ── Meals ────────────────────────────────────────────────────────────
  if (has('dinner', 'lunch', 'breakfast', 'eat', 'meal', 'cooking', 'cook', 'menu')) {
    const day = todayMealDay();
    const wanted = has('breakfast') ? 'breakfast' : has('lunch') ? 'lunch' : 'dinner';
    const today = meals.filter(m => m.day === day);
    const match = today.find(m => (m.type ?? '').toLowerCase() === wanted) ?? today[0];
    if (!match) {
      return today.length === 0 && meals.length === 0
        ? "There's no meal plan saved for this week yet. You can add one on the Meals tab."
        : `Nothing is planned for ${wanted} today. The Meals tab has the rest of the week.`;
    }
    const chef = firstName(match.chef_id ?? undefined);
    const bits = [
      `${match.emoji ? match.emoji + ' ' : ''}${match.title}`,
      chef ? `${chef} is cooking` : null,
      match.prep_minutes ? `about ${match.prep_minutes} minutes to make` : null,
      match.start_time ? `planned for ${match.start_time}` : null,
    ].filter(Boolean);
    return `${bits[0]}${bits.length > 1 ? ' — ' + bits.slice(1).join(', ') : ''}.`;
  }

  // ── Today's schedule / rides ─────────────────────────────────────────
  if (has('today', 'schedule', 'calendar', 'event', 'ride', 'pickup', 'pick up', 'drop off', 'driving', 'drive')) {
    const events = useEventStore.getState().dayEvents;
    if (events.length === 0) return 'Nothing is on the calendar for today.';

    // A ride-specific question gets a ride-specific answer.
    if (has('ride', 'pickup', 'pick up', 'drop off', 'driving', 'drive')) {
      const rides = events.filter(e => !!eventAssignee(e).name || /pick ?up|drop ?off|ride/i.test(e.title));
      if (rides.length === 0) return 'No rides are on the calendar for today.';
      const lines = rides.slice(0, 3).map(e => {
        const a = eventAssignee(e);
        const when = e.time ? fmtTime(e.time) : 'all day';
        if (!a.name) return `${e.title} at ${when} — nobody has claimed it yet`;
        const state = a.status === 'confirmed' ? 'confirmed' : a.status === 'rejected' ? "can't do it" : 'not confirmed yet';
        return `${e.title} at ${when} — ${a.name}, ${state}`;
      });
      const unclaimed = rides.filter(e => !eventAssignee(e).name).length;
      return `${lines.join('. ')}.${unclaimed > 0 ? ` ${unclaimed} still ${unclaimed === 1 ? 'needs' : 'need'} a driver.` : ''}`;
    }

    const lines = events.slice(0, 4).map(e => `${e.time ? fmtTime(e.time) : 'All day'} — ${e.title}`);
    const rest = events.length - lines.length;
    return `${events.length} ${events.length === 1 ? 'thing' : 'things'} today. ${lines.join('. ')}.${rest > 0 ? ` And ${rest} more.` : ''}`;
  }

  // ── Chores ───────────────────────────────────────────────────────────
  if (has('chore', 'task', 'quest', 'trash', 'dishes', 'laundry', 'clean', 'left to do', 'to do')) {
    const quests = useQuestStore.getState().quests;
    const open = quests.filter(x => x.status === 'todo' || x.status === 'claimed' || x.status === 'in_progress');
    const review = quests.filter(x => x.status === 'pending_approval');

    // A named-chore question ("has anyone done the trash?") — match on
    // title, so the answer is about the thing they actually asked about.
    const keyword = ['trash', 'dishes', 'laundry', 'recycling', 'vacuum', 'garbage'].find(w => q.includes(w));
    if (keyword) {
      const matches = quests.filter(x => x.title.toLowerCase().includes(keyword));
      if (matches.length === 0) return `There's no chore on the board mentioning "${keyword}".`;
      const lines = matches.slice(0, 3).map(x => {
        const who = firstName(x.assignedToId);
        switch (x.status) {
          case 'approved':         return `${x.title} is done and approved${who ? ` — ${who}` : ''}`;
          case 'pending_approval': return `${x.title} is done and waiting on a parent to check it${who ? ` — ${who}` : ''}`;
          case 'in_progress':
          case 'claimed':          return `${x.title} is in progress${who ? ` — ${who}` : ''}`;
          case 'declined':         return `${x.title} was sent back for a redo`;
          default:                 return `${x.title} is still open${who ? ` — assigned to ${who}` : ' and unclaimed'}`;
        }
      });
      return lines.join('. ') + '.';
    }

    if (open.length === 0 && review.length === 0) return 'Every chore is done. Nothing open and nothing waiting on approval.';
    const parts: string[] = [];
    if (open.length) {
      const names = [...new Set(open.map(x => firstName(x.assignedToId)).filter((n): n is string => !!n))];
      parts.push(`${open.length} ${open.length === 1 ? 'chore is' : 'chores are'} still open${names.length ? ` (${list(names)})` : ''}`);
    }
    if (review.length) parts.push(`${review.length} ${review.length === 1 ? 'is' : 'are'} waiting on a parent to approve`);
    return parts.join(', and ') + '.';
  }

  // ── Coins / allowance ────────────────────────────────────────────────
  if (has('coin', 'allowance', 'piggy', 'money', 'earn', 'saved', 'balance')) {
    const kids = useFamilyStore.getState().members.filter(m =>
      !m.deletedAt && m.inviteStatus !== 'pending' && (m.role === 'kid' || m.role === 'teen'));
    if (kids.length === 0) return "There aren't any kid profiles set up yet.";
    const lines = kids.map(m => {
      const total = ((m as any).mainCoins ?? 0) + ((m as any).gpCoins ?? 0);
      return `${m.name.trim().split(' ')[0]} has ${total} ${total === 1 ? 'coin' : 'coins'}`;
    });
    return lines.join(', ') + '.';
  }

  // ── Rewards ──────────────────────────────────────────────────────────
  if (has('reward', 'perk', 'store', 'redeem', 'prize')) {
    const { rewards, redemptions } = useRewardStore.getState();
    const pending = redemptions.filter(r => r.status === 'pending');
    const available = rewards.filter(r => r.available);
    const parts: string[] = [];
    if (available.length) parts.push(`${available.length} ${available.length === 1 ? 'perk is' : 'perks are'} in the store`);
    if (pending.length) parts.push(`${pending.length} ${pending.length === 1 ? 'redemption is' : 'redemptions are'} waiting on a parent`);
    return parts.length ? parts.join(', and ') + '.' : 'The reward store is empty right now.';
  }

  // ── Grocery ──────────────────────────────────────────────────────────
  if (has('grocery', 'groceries', 'shopping', 'store list', 'buy', 'need from')) {
    const items = useGroceryStore.getState().items.filter(i => !i.isBought);
    if (items.length === 0) return 'The grocery list is empty.';
    return `${items.length} ${items.length === 1 ? 'item' : 'items'} on the grocery list: ${list(items.map(i => i.name), 4)}.`;
  }

  // ── Where is someone ─────────────────────────────────────────────────
  // Deliberately routes to the Find tab rather than answering: locations
  // are decrypted per-member (lib/locationCrypto) and are the most
  // sensitive thing on this device, which sits in a room that may have
  // guests in it. A spoken/typed answer read by anyone standing nearby is
  // the wrong default for that data.
  if (has('where is', "where's", 'location', 'home yet', 'on the way')) {
    return "Open the Find tab to see where everyone is — I don't read out locations here, since anyone in the room can see this screen.";
  }

  // ── Fallback ─────────────────────────────────────────────────────────
  // Honest about what it is and what it can do, rather than the mockup's
  // "Everything is running smoothly today!" — which is a confident claim
  // about data it never looked at.
  return "I can only look things up in your family's own data — try asking about today's schedule, chores, meals, the grocery list, coins, or rewards.";
}
