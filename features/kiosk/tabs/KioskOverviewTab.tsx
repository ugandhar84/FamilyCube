/**
 * KioskOverviewTab — the "Hub Overview" dashboard from the reference
 * mockup, rebuilt as real React Native against real data.
 *
 * Layout follows the mockup exactly: a hero card (greeting + live status +
 * quick actions) paired with a summary panel, then a widget deck, then a
 * full-width FindFam radar strip. What each widget SHOWS is different in
 * one important way — every number on this screen is read from a real
 * store, and any widget with nothing real behind it is not rendered rather
 * than shown with placeholder content.
 *
 * Mapping from the mockup's widgets to this app's actual features:
 *
 *   mockup                     here                       source
 *   ─────────────────────────────────────────────────────────────────────
 *   Pickup Radar               Ride & pickup              eventStore
 *                              (Remind / Take over)       (eventAssignee,
 *                                                          remindEventAssignee,
 *                                                          claimHelperSlot)
 *   Kitchen Stove Timers       — REMOVED —                (owner: out of scope)
 *   Kids Piggy Banks           Kids' coin jars            familyStore
 *                                                          (mainCoins/gpCoins)
 *   Tonight's dinner           Tonight's dinner           family_meals
 *                              (part of the hero panel)   (useKioskMeals)
 *   FindFam GPS Radar          Family radar strip         member_locations
 *   Kept photo frame           Kept (photo frame)         family_memories
 *                              (widget deck)              (useKioskPhotos)
 *   Weather 72°F Sunny         — omitted —                no weather API
 *                                                          exists; a fake
 *                                                          temperature on a
 *                                                          kitchen wall is
 *                                                          worse than none
 *
 * Role scoping is not decorative here. A kiosk is a shared surface in a
 * room anyone can walk into, so the coin-jar widget (other people's
 * balances) and the ride actions (which write) are parent-only, matching
 * how the phone already gates the same capabilities.
 *
 * ── The kid Overview ────────────────────────────────────────────────────
 * Role scoping used to mean only SUBTRACTION — a kid got the parent's
 * dashboard with the parent-only pieces missing, which left them looking
 * at rides they can't drive and a grocery list they aren't shopping for,
 * with nothing of their own anywhere on the screen. `isKid` below turns
 * that into a real composition instead. Top to bottom, a kid now sees:
 *
 *   1. the hero — greeting + today's summary, then a single non-wrapping
 *      quick-action strip: Intercom (everyone) plus, for kid, Check In /
 *      Piggy Bank / Cheer Squad / My Requests — the "glance at my own
 *      state, tap once" actions, promoted to the same prominence as the
 *      household's own Intercom button
 *   2. "Your stuff" — the eight-way Ask-a-Parent menu (Ride / Permission /
 *      Question / Medication Alert / Grocery / Supplies / Suggest a Chore /
 *      Propose a Chore), each its own directly-tappable tile with no
 *      picker step, kept as its own labeled card because a browse-then-
 *      pick menu is a different shape from the hero row's five
 *   3. My schedule — today's events that are theirs, resting on now
 *      (replaces Ride & pickup in that slot)
 *   4. My chores — their status breakdown in the Chores board's own
 *      vocabulary plus the up-for-grabs pool (replaces Grocery list)
 *   5. the photo frame and the FindFam strip — unchanged, shared family
 *      content that reads the same to everyone
 *
 * Teen and parent are deliberately untouched by all of the kid-specific
 * composition above; the owner's ask was specifically about kids, and
 * inventing a narrower teen variant nobody asked for is how role gating
 * drifts.
 *
 * ── The senior/grandparent Overview ─────────────────────────────────────
 * Senior got a smaller version of the same fix, for the same underlying
 * problem: before this, a grandparent's widget deck was the parent's deck
 * with the parent-gated pieces silently missing (no coin jars, rides shown
 * read-only with no actions) plus a household grocery list that isn't
 * theirs either — subtraction, not composition, same anti-pattern kid used
 * to have. Unlike kid, this is NOT a denser replacement: the design brief
 * is explicit that Grandparent keeps its own "one-decision-at-a-time"
 * simplicity even as the other roles' Hubs get more visually dense, so
 * `isSenior` swaps the Rides + Grocery slots for exactly one calm summary
 * card (SeniorTasksWidget: what's open, up to three titles, a link to the
 * full board — no inline actions) and gives the photo feed a taller,
 * more generous frame as this role's warm centerpiece, rather than adding
 * more widgets.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Image, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import {
  Car, UtensilsCrossed, Bell, Check, ChevronRight,
  Megaphone, BatteryLow, ChefHat, CheckSquare, X,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, eventAssignee, type FamilyEvent } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { REJECTION_PRESETS, type RejectionPresetKey } from '@/store/choreStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useRewardStore } from '@/store/rewardStore';
import { useKidRequestStore, REQUEST_META } from '@/store/kidRequestStore';
import { supabase } from '@/lib/supabase';
import { decryptLocationText } from '@/lib/locationCrypto';
import { fmtTime } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors, kioskRoleAccent, kioskOnAccent, type KioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, Well, Chip, ActionButton, EmptyNote } from '../components/KioskOS';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from '../components/KioskFormDrawer';
import { KioskMemorySlideshow } from '../components/KioskMemorySlideshow';
import { useKioskPhotos } from '../useKioskPhotos';
import { KioskRecipeDrawer } from '../components/KioskRecipeDrawer';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { useKioskMeals, todayMealDay, daysFromToday } from '../useKioskMeals';
import { KioskKidQuickActions, KioskKidCheckInTile, KioskKidMineTile } from '../components/KioskKidQuickActions';
import { KidTodayWidget, KidChoresWidget } from '../components/KioskKidWidgets';
import type { KioskTabKey } from '../kioskTabs';

interface RadarRow {
  member_id: string;
  status: string;
  status_text: string | null;
  neighborhood: string | null;
  battery_level: number | null;
  share_location_enabled?: boolean;
  lat: number | null;
  lng: number | null;
}

/**
 * One row in the unified Approvals widget — the shared shape a chore
 * review, a store redemption, and a kid request all get normalized into so
 * the three real systems behind them can sit in one ranked list instead of
 * three separate badges the parent has to check separately.
 */
interface ApprovalItem {
  id: string;
  kind: 'chore' | 'redemption' | 'request';
  /** ISO timestamp used to order within the same urgency tier — oldest first. */
  sortAt: string;
  title: string;
  who?: string;
  emoji: string;
  meta: string;
  /** Coins on the line, matching the mockup's .task-coin figure. Requests
   *  carry no coin value, same as the mockup (t.coin is 0 there too). */
  coins?: number;
  /** Higher sorts first. Only a kid request's real urgency ever exceeds 1. */
  urgencyRank: 1 | 2 | 3 | 4;
}

const STATUS_LABEL: Record<string, string> = {
  at_home: 'At home',
  at_school: 'At school',
  at_work: 'At work',
  in_transit: 'On the move',
  at_activity: 'At an activity',
};

export function KioskOverviewTab({
  active, members, onNavigate, onIntercom,
}: {
  active: FamilyMember;
  members: FamilyMember[];
  /** Jump to another kiosk tab — the mockup's quick-action buttons. */
  onNavigate: (tab: KioskTabKey) => void;
  onIntercom: () => void;
}) {
  const { k, isDark } = useKioskColors();
  // Live-requested: "card sizes and text adjust based on rotation without
  // cutting and trimming or over-zooming." Parent's page is a real 3-column
  // grid (stats rail + centerCol flex + sideCol fixed 340px, matching the
  // mockup's own `.layout{grid-template-columns: 300px 1fr 340px}`) — on a
  // narrower window (a portrait-rotated iPad, roughly 834-1024pt vs.
  // ~1194-1366pt landscape, or any kiosk device smaller than what this was
  // designed against) a fixed 340px sidebar plus a real rail leaves
  // centerCol's Rides/Approvals rows (title+meta+coin+two buttons)
  // genuinely cramped. Below the threshold, centerCol/sideCol stack
  // vertically instead — 1080px, the SAME breakpoint the mock's own
  // @media(max-width:1080px) rule uses to collapse its 3-column grid to
  // `1fr`, not an arbitrary value. Same useWindowDimensions-driven pattern
  // KioskFindFamTab/KioskHubTab/KioskMemoryGrid already use elsewhere in
  // this codebase, not a new one invented for this screen alone.
  const { width: winWidth } = useWindowDimensions();
  const isNarrowParentLayout = winWidth < 1080;
  const isParent = active.role === 'parent';
  // Kid role gets a genuinely different Overview, not the parent's with
  // pieces missing. All swaps below are scoped to `kid` alone — teen,
  // senior and parent are untouched:
  //
  //   parent/others          kid                     why
  //   ───────────────────────────────────────────────────────────────────
  //   Schedule quick tile    — dropped —             Schedule is already a
  //   Grocery quick tile     — dropped —             persistent rail tab,
  //   Meals quick tile       — dropped —             same as Store/Meals —
  //                                                  a second entry point
  //                                                  in the hero row is
  //                                                  redundant, not just
  //                                                  for kid but this cut
  //                                                  applies to everyone
  //   Ride & pickup widget   My schedule             ride coordination is
  //                          (KidTodayWidget)        a co-parent job; the
  //                                                  actions were already
  //                                                  parent-gated, so the
  //                                                  widget was read-only
  //                                                  noise for a kid
  //   Grocery snapshot       My chores               a kid's own board +
  //                          (KidChoresWidget)       the up-for-grabs pool
  //
  // plus the kid Hub's own actions with no rail equivalent, as a labeled
  // "Your stuff" card (KioskKidQuickActions) directly under the hero:
  // Piggy Bank, Cheer Squad, My Requests, and all eight Ask-a-Parent
  // destinations flattened into individual tiles (no picker step — each
  // tile opens its real modal). Check In is the one promoted up into the
  // hero's own quick row next to Intercom.
  const isKid = active.role === 'kid';
  // Senior/grandparent gets its own calm composition too, for the same
  // reason kid did: the parent's widget deck (rides to drive, coin jars for
  // OTHER kids, a household grocery list) is either not theirs to act on or
  // not theirs at all — before this it just silently disappeared piece by
  // piece (parent-gated widgets hide themselves), leaving a sparser deck
  // with nothing of the grandparent's own in its place. Unlike kid, this is
  // deliberately NOT a denser replacement: the design brief calls for
  // Grandparent to keep "one-decision-at-a-time simplicity" rather than the
  // parent/kid Hub's full density, so the swap here is a single calm
  // summary card (SeniorTasksWidget below) plus a taller, more generous
  // photo feed — not a multi-widget board with inline actions.
  const isSenior = active.role === 'senior';

  const dayEvents = useEventStore(s => s.dayEvents);

  // "Happening now" — the mockup's compact top strip (a live dot, an
  // uppercase eyebrow, the current/next event, a right-aligned time), NOT
  // a greeting hero. Real derivation: an event actually in progress right
  // now (time <= now < endTime) wins; otherwise the next timed event later
  // today; otherwise null (renders "Nothing on the calendar today" instead
  // of a fabricated placeholder).
  const nowHappening = useMemo(() => {
    const nowHHMM = new Date().toTimeString().slice(0, 5);
    const timed = dayEvents.filter(e => !!e.time && !e.allDay);
    const inProgress = timed.find(e => e.time! <= nowHHMM && (!e.endTime || e.endTime > nowHHMM));
    if (inProgress) return { event: inProgress, isNow: true };
    const upcoming = timed.filter(e => e.time! > nowHHMM).sort((a, b) => a.time!.localeCompare(b.time!))[0];
    return upcoming ? { event: upcoming, isNow: false } : null;
  }, [dayEvents]);
  const remindEventAssignee = useEventStore(s => s.remindEventAssignee);
  const claimHelperSlot = useEventStore(s => s.claimHelperSlot);
  const { quests, approveQuest, declineQuest } = useQuestStore();
  const groceryItems = useGroceryStore(s => s.items);
  const buyGroceryItem = useGroceryStore(s => s.buyItem);
  const restoreGroceryItem = useGroceryStore(s => s.restoreItem);
  const { meals, week: mealWeek } = useKioskMeals();
  const redemptions = useRewardStore(s => s.redemptions);
  const approveRedemption = useRewardStore(s => s.approveRedemption);
  const rejectRedemption = useRewardStore(s => s.rejectRedemption);
  const kidRequests = useKidRequestStore(s => s.requests);
  const approveRequest = useKidRequestStore(s => s.approveRequest);
  const declineRequest = useKidRequestStore(s => s.declineRequest);

  // ── Today's meals (real family_meals rows) ───────────────────────────
  // Was a single "Tonight's dinner" summary that, once fixed to be
  // tappable at all, opened a day-overview popup. The owner then asked
  // for breakfast/lunch/dinner as their own three cards right on the
  // hero, each opening its own recipe directly — see the hero render
  // below and KioskRecipeDrawer.
  const todayMeals = useMemo(() => meals.filter(m => m.day === todayMealDay()), [meals]);
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);

  // ── Rides needing attention ──────────────────────────────────────────
  // The mockup's "Co-Parent Pending Rides" card. A ride needs attention if
  // it has no assignee at all, or has one who hasn't confirmed. Confirmed
  // rides are deliberately excluded — the widget's job is "what still needs
  // a human", not "list every ride".
  const rides = useMemo(() => {
    return dayEvents
      .filter(e => {
        const a = eventAssignee(e);
        const looksLikeRide = !!a.name || /pick ?up|drop ?off|ride/i.test(e.title);
        if (!looksLikeRide) return false;
        return !a.name || a.status !== 'confirmed';
      })
      .slice(0, 2);
  }, [dayEvents]);

  // ── Kids' coin jars (real balances) ──────────────────────────────────
  const kids = useMemo(
    () => members.filter(m =>
      !m.deletedAt && m.inviteStatus !== 'pending' && (m.role === 'kid' || m.role === 'teen')),
    [members],
  );

  // "N/M chores this week" per kid — matches the mockup's own jar-meta line
  // exactly, derived from real quest data (assigned + approved this week)
  // rather than invented copy. Monday-start week boundary, same weekOf()
  // convention useKioskMeals already uses, so both this and the meals
  // widget agree on what "this week" means.
  const weekChoreCounts = useMemo(() => {
    const [wy, wm, wd] = mealWeek.split('-').map(Number);
    const weekStart = new Date(wy, wm - 1, wd);
    const counts = new Map<string, { done: number; total: number }>();
    for (const q of quests) {
      if (!q.assignedToId) continue;
      const at = q.approvedAt ?? q.submittedAt ?? q.claimedAt;
      // "This week" = assigned or already acted on since Monday — a quest
      // with no timestamp at all (freshly created, still 'todo') still
      // counts toward the denominator via its dueDate/startedAt falling in
      // range isn't tracked separately here, so anything currently
      // assigned to this kid with no completion yet also counts as open
      // this week rather than being silently excluded.
      const relevant = q.status !== 'cancelled' && q.status !== 'archived'
        && (!at || new Date(at) >= weekStart);
      if (!relevant) continue;
      const c = counts.get(q.assignedToId) ?? { done: 0, total: 0 };
      c.total += 1;
      if (q.status === 'approved' || q.status === 'done') c.done += 1;
      counts.set(q.assignedToId, c);
    }
    return counts;
  }, [quests, mealWeek]);

  // ── Unified approvals queue (parent-only) ────────────────────────────
  // Three genuinely separate systems today — chore reviews, store
  // redemptions, kid requests — each with their own screen and their own
  // "pending" badge, nowhere merged into one ranked list a parent can clear
  // from the Overview. Built here rather than reusing the now-unreachable
  // KioskHubTab (its pendingReview/pendingRedemptions memos were the right
  // reference for the underlying queries, but that tab never merged the
  // three, and it's dead code besides).
  const pendingChoreReviews = useMemo(
    () => quests.filter(q => q.status === 'pending_approval'),
    [quests],
  );
  const pendingRedemptions = useMemo(
    () => isParent ? redemptions.filter(r => r.status === 'pending') : [],
    [redemptions, isParent],
  );
  const pendingKidRequests = useMemo(
    () => isParent
      ? kidRequests.filter(r => r.status === 'pending' && (!r.toMemberId || r.toMemberId === active.id))
      : [],
    [kidRequests, isParent, active.id],
  );
  const approvals = useMemo(() => {
    if (!isParent) return [] as ApprovalItem[];
    const memberFirst = (id?: string) => members.find(m => m.id === id)?.name?.trim().split(' ')[0];
    const memberEmoji = (id?: string) => members.find(m => m.id === id)?.emoji ?? '🙂';
    const items: ApprovalItem[] = [
      ...pendingChoreReviews.map((q): ApprovalItem => ({
        id: `quest:${q.id}`, kind: 'chore', sortAt: q.submittedAt ?? '',
        title: q.title, who: memberFirst(q.assignedToId) ?? memberFirst(q.sponsorUserId), emoji: memberEmoji(q.assignedToId ?? q.sponsorUserId),
        meta: 'Ready for review', coins: q.coins || undefined,
        urgencyRank: 1,
      })),
      ...pendingRedemptions.map((r): ApprovalItem => ({
        id: `redemption:${r.id}`, kind: 'redemption', sortAt: r.redeemedAt,
        title: r.rewardTitle ?? 'Reward redemption', who: r.memberName ?? memberFirst(r.memberId), emoji: memberEmoji(r.memberId),
        meta: r.wallet === 'gpCoins' ? 'Grandparent jar' : 'Reward redemption',
        coins: -r.deductedCoins,
        urgencyRank: 1,
      })),
      ...pendingKidRequests.map((req): ApprovalItem => ({
        id: `request:${req.id}`, kind: 'request', sortAt: req.requestedAt,
        title: req.detail, who: memberFirst(req.fromMemberId), emoji: memberEmoji(req.fromMemberId),
        meta: REQUEST_META[req.type]?.label ?? 'Request',
        urgencyRank: req.urgency === 'emergency' ? 4 : req.urgency === 'urgent' ? 3 : req.urgency === 'soon' ? 2 : 1,
      })),
    ];
    // Most urgent first; within the same urgency, oldest first — the one
    // that's been waiting longest surfaces before a just-arrived duplicate
    // at the same rank, so nothing quietly ages at the bottom of its tier.
    return items.sort((a, b) => b.urgencyRank - a.urgencyRank || a.sortAt.localeCompare(b.sortAt));
  }, [isParent, pendingChoreReviews, pendingRedemptions, pendingKidRequests, members]);

  // ── Chore counts for the hero line ───────────────────────────────────
  const openChores = useMemo(
    () => quests.filter(q => q.status === 'todo' || q.status === 'claimed' || q.status === 'in_progress').length,
    [quests],
  );

  const unclaimedRides = useMemo(
    () => dayEvents.filter(e => {
      const a = eventAssignee(e);
      return !a.name && /pick ?up|drop ?off|ride/i.test(e.title);
    }).length,
    [dayEvents],
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  return (
    <>
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      {!isParent && (
      <>
      <View style={s.heroRow}>
        <WidgetCard k={k} isDark={isDark} style={s.hero}>
          <View style={s.heroTop}>
            <Chip label="Kitchen display" accent={k.primary} isDark={isDark} k={k} />
            <View style={s.liveRow}>
              <View style={[s.liveDot, { backgroundColor: k.sage }]} />
              <Text style={[s.liveText, { color: k.sage }]} numberOfLines={1}>Live</Text>
            </View>
          </View>

          {/* Avatar + greeting — was a plain text line with nothing to
              anchor the eye (live-reported: the Hub should have "real
              presence," not just a text row). The active member's own
              emoji in a role-tinted disc gives the greeting a face, the
              same "who is this for" signal the coin-jar and radar rows
              already give everyone else on this screen. */}
          <View style={s.heroGreetRow}>
            <View style={[s.heroAvatar, { backgroundColor: kioskRoleAccent(k, active.role) + (isDark ? '26' : '18') }]}>
              <Text style={s.heroAvatarEmoji}>{active.emoji ?? '👤'}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.heroTitle, { color: k.text }]} numberOfLines={2}>
                {greeting}, {active.name?.trim().split(' ')[0]}
              </Text>
              <Text style={[s.heroSub, { color: k.textMuted }]} numberOfLines={2}>
                {summarize(dayEvents.length, openChores, unclaimedRides)}
              </Text>
            </View>
          </View>

          {/* Quick actions. Schedule/Grocery/Meals were dropped for
              everyone — each already has its own persistent rail tab, so a
              second entry point here was redundant, not just extra taps.
              Intercom has no rail equivalent, so it stays.

              For kid, four of their own tiles join Intercom here — Check
              In, Piggy Bank, Cheer Squad, My Requests — the "glance at my
              own state, tap once" actions, promoted to hero prominence.
              The eight-way Ask-a-Parent MENU stays in its own labeled
              "Your stuff" card below instead: it's a browse-then-pick list,
              a different shape from these five, and mixing all thirteen
              into one row would defeat the point of a separate section.
              The row is nowrap (see s.quickRow) so all five fit one single
              strip rather than wrapping to a second line. */}
          <View style={s.quickRow}>
            <QuickAction
              Icon={Megaphone} label="Intercom" accent={k.primary} k={k} isDark={isDark}
              onPress={onIntercom}
              hint="Broadcast an announcement to every family phone"
            />
            {isKid && (
              <>
                <KioskKidCheckInTile active={active} />
                <KioskKidMineTile kind="piggy" active={active} members={members} />
                <KioskKidMineTile kind="cheer" active={active} members={members} />
                <KioskKidMineTile kind="requests" active={active} members={members} />
              </>
            )}
          </View>
        </WidgetCard>

        {/* Today's Meals — was a single "Tonight's dinner" card (the
            mockup's photo-frame slot); the owner asked for the day's three
            meal types as their own scrollable cards, each opening its real
            recipe directly, rather than one dinner summary that opened a
            day-overview popup. The photo frame itself lives in the widget
            deck below (KioskMemorySlideshow), unaffected by this. */}
        <WidgetCard k={k} isDark={isDark} style={s.heroSide}>
          <WidgetHeader
            Icon={ChefHat} eyebrow="Today" title="Today's Meals"
            accent={k.gold} k={k} isDark={isDark}
          />
          {todayMeals.length === 0 ? (
            <Pressable
              onPress={() => onNavigate('meals')}
              style={({ pressed }) => [
                s.mealEmpty,
                { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
              ]}
              accessibilityRole="button"
              accessibilityLabel="No meals planned for today"
              accessibilityHint="Open the meal planner"
            >
              <UtensilsCrossed size={26} color={k.textFaint} />
              <EmptyNote text="No meals planned for today — tap to plan the week." k={k} style={{ textAlign: 'center' }} />
            </Pressable>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.mealTypeRow}
              style={{ flex: 1 }}
            >
              {(['breakfast', 'lunch', 'dinner'] as const).map(type => {
                const meal = todayMeals.find(m => (m.type ?? '').toLowerCase() === type);
                const accent = type === 'breakfast' ? k.gold : type === 'lunch' ? k.sage : k.purple;
                return (
                  <Pressable
                    key={type}
                    onPress={() => meal ? setOpenMeal(meal) : onNavigate('meals')}
                    style={({ pressed }) => [
                      s.mealTypeCard,
                      { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={meal ? `${type}: ${meal.title}` : `No ${type} planned`}
                    accessibilityHint={meal ? 'See the recipe' : 'Open the meal planner'}
                  >
                    <Text style={[s.mealTypeLabel, { color: accent }]} numberOfLines={1}>
                      {type[0].toUpperCase()}{type.slice(1)}
                    </Text>
                    {meal ? (
                      <>
                        <Text style={s.mealTypeEmoji}>{meal.emoji ?? '🍽️'}</Text>
                        <Text style={[s.mealTypeTitle, { color: k.text }]} numberOfLines={2}>{meal.title}</Text>
                      </>
                    ) : (
                      <Text style={[s.mealTypeEmpty, { color: k.textFaint }]} numberOfLines={2}>Not planned</Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </WidgetCard>
      </View>

      <KioskRecipeDrawer
        visible={!!openMeal}
        onClose={() => setOpenMeal(null)}
        meal={openMeal}
        members={members}
        k={k}
      />
      </>
      )}

      {/* ══ YOUR STUFF (kid only) ══════════════════════════════════════
          The kid's own actions, as one labeled full-width card directly
          under the hero — prominent, but visually distinct from the hero's
          household Intercom action, and above the widget deck so it is not
          buried among the read-only widgets. Kid-only, matching the phone's
          own gate: KidCheckinRow and AskParentSheet are mounted from
          KidView alone, and the kiosk Tasks tab's creation gate is likewise
          `active.role === 'kid'` (not teen). */}
      {isKid && <KioskKidQuickActions active={active} members={members} />}

      {/* ══ PARENT: two-column page (matches the reference mockup's own
          layout exactly — a wide center column of "things to act on"
          stacked full-width, next to a narrower sidebar of "glanceable
          household state" stacked full-width) — NOT the flex-wrap grid of
          equal-width cards every other role still uses below. Kid/senior/
          teen are unaffected: their compositions were never part of what
          the mockup depicted for this screen, and stay on the original
          deck. */}
      {isParent ? (
        <View style={[s.twoColRow, isNarrowParentLayout && s.twoColRowStacked]}>
          <View style={[s.centerCol, isNarrowParentLayout && s.colFullWidth]}>
            {/* ══ HAPPENING NOW ═══════════════════════════════════════════
                Matches the mockup's own .now-strip exactly: a compact
                single-line panel (live dot, uppercase eyebrow, current/
                next event, a right-aligned time) — NOT a greeting hero.
                Lives INSIDE centerCol as its first child (a real bug fix:
                an earlier version rendered this as a sibling of the whole
                twoColRow instead, spanning the combined center+sidebar
                width — visibly wider than Family Schedule right below it,
                which only spans centerCol's own share). */}
            <WidgetCard k={k} isDark={isDark} style={s.nowStrip}>
              {/* Live-requested (kept, final call): green (k.sage) for the
                  dot AND the label, matching this app's own established
                  "live" color everywhere else it appears (KioskHeader's
                  own live dot, the kid/senior hero's Live chip) — a
                  deliberate real-app choice over the mock's own role-
                  accent (navy for Parent). Halo stays a static soft ring
                  (box-shadow: 0 0 0 4px accent at 18% opacity in the mock)
                  — NOT animated; the mock's one @keyframes pulse belongs
                  to an unrelated kid-request "waiting" status dot
                  elsewhere. A plain View can't express a symmetric CSS
                  box-shadow ring, so the halo is a second, larger, tinted
                  circle layered behind the solid dot. */}
              <View style={s.nowStripDotWrap}>
                <View style={[s.nowStripDotHalo, { backgroundColor: k.sage + (isDark ? '30' : '2E') }]} />
                <View style={[s.nowStripDot, { backgroundColor: k.sage }]} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* Mock's own now-label is a literal, always-on "Happening
                    now" — not derived from any state. Matched exactly per
                    live confirmation, rather than the richer isNow/upcoming
                    distinction this file computed on its own. */}
                <Text style={[s.nowStripLabel, { color: k.sage }]}>HAPPENING NOW</Text>
                <Text style={[s.nowStripWhat, { color: k.text }]} numberOfLines={1}>
                  {nowHappening ? nowHappening.event.title : 'Nothing on the calendar today'}
                </Text>
              </View>
              {nowHappening && (
                <Text style={[s.nowStripTime, { color: k.textFaint }]} numberOfLines={1}>
                  {nowHappening.isNow && nowHappening.event.endTime
                    ? `until ${fmtTime(nowHappening.event.endTime)}`
                    : fmtTime(nowHappening.event.time!)}
                </Text>
              )}
            </WidgetCard>

            <FamilySchedulePanel dayEvents={dayEvents} k={k} isDark={isDark} />

            <WidgetCard k={k} isDark={isDark}>
              <WidgetHeader
                Icon={Car} eyebrow="Pickup radar" title="Rides needing a driver"
                accent={k.sage} k={k} isDark={isDark}
                right={rides.length > 0
                  ? <Chip label={`${rides.length}`} accent={k.gold} isDark={isDark} k={k} />
                  : undefined}
              />
              {rides.length === 0 ? (
                <EmptyNote text="Every ride today has a confirmed driver." k={k} />
              ) : (
                <View style={{ gap: KIOSK_SPACE.sm }}>
                  {rides.map(ev => (
                    <RideRow
                      key={ev.id} ev={ev} k={k} isDark={isDark} members={members}
                      canAct={isParent} actorId={active.id} actorName={active.name}
                      onRemind={remindEventAssignee}
                      onClaim={claimHelperSlot}
                    />
                  ))}
                </View>
              )}
            </WidgetCard>

            <ParentApprovalsWidget
              approvals={approvals} k={k} isDark={isDark}
              onApproveChore={(id) => approveQuest(id, active.id)}
              onDeclineChore={(id, reason, presetKey) => declineQuest(id, active.id, reason, presetKey)}
              onApproveRedemption={(id) => approveRedemption(id, active.id)}
              onRejectRedemption={(id) => rejectRedemption(id, active.id)}
              onApproveRequest={(id) => approveRequest(id, active.id)}
              onDeclineRequest={(id) => declineRequest(id, active.id)}
            />

            {/* Find — mounted here (parent-only) so it genuinely shares
                centerCol's own width with Rides/Approvals above it by
                construction, the same fix that resolved Happening Now's
                width mismatch earlier. Kid/teen get their own separate
                mount of this same component in the flex-wrap deck below
                (s.widget-sized, matching its siblings there) — not a
                duplicated implementation, just two mount points for one
                component with a caller-supplied width. */}
            <RadarStrip
              members={members} k={k} isDark={isDark}
              onOpen={() => onNavigate('findfam')}
            />
          </View>

          <View style={[s.sideCol, isNarrowParentLayout && s.colFullWidth]}>
            {/* Mockup's .jar row exactly: a colored square with the kid's
                INITIAL (not an emoji), name + a real "N/M chores this week"
                progress line (not the coin-source split this used to show),
                a bare gold number on the right (no "coins" unit label). */}
            {kids.length > 0 && (
              <WidgetCard k={k} isDark={isDark}>
                <View style={s.panelHead}>
                  <Text style={[s.panelTitle, { color: k.textFaint }]}>COIN JARS</Text>
                </View>
                <View>
                  {kids.map((kid, i) => {
                    const main = (kid as any).mainCoins ?? 0;
                    const gp = (kid as any).gpCoins ?? 0;
                    const total = main + gp;
                    const accent = kioskRoleAccent(k, kid.role);
                    const progress = weekChoreCounts.get(kid.id);
                    const streak = (kid as any).streak ?? 0;
                    const firstName = kid.name?.trim().split(' ')[0] ?? '';
                    return (
                      <View key={kid.id} style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
                        <View style={[s.jarAvatar, { backgroundColor: accent }]}>
                          <Text style={s.jarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>{firstName}</Text>
                          <Text style={[s.jarMeta, { color: k.textFaint }]} numberOfLines={1}>
                            {progress ? `${progress.done}/${progress.total} chores this week` : 'No chores this week'}
                            {streak > 0 ? ` · ${streak} day streak` : ''}
                          </Text>
                        </View>
                        <Text style={[s.jarAmt, { color: k.gold }]} numberOfLines={1}>{total}</Text>
                      </View>
                    );
                  })}
                </View>
                {/* Live-requested: a quiet text link, not a full button —
                    the mockup's own Coin Jars panel has no footer action
                    at all, so this stays the smallest real affordance
                    rather than the heaviest one. */}
                <Pressable
                  onPress={() => onNavigate('store')}
                  style={({ pressed }) => [s.panelTextLink, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open reward store"
                  accessibilityHint="See perks the kids can spend coins on"
                >
                  <Text style={[s.panelTextLinkText, { color: k.primary }]}>Open reward store</Text>
                  <ChevronRight size={14} color={k.primary} />
                </Pressable>
              </WidgetCard>
            )}

            {/* Mockup's "Meals This Week" reuses the SAME .jar row shape as
                Coin Jars (no avatar, no amount) — a real weekly plan from
                the same family_meals data the Meals tab itself uses, not a
                separate "today only" summary. */}
            <WidgetCard k={k} isDark={isDark}>
              <View style={s.panelHead}>
                <Text style={[s.panelTitle, { color: k.textFaint }]}>MEALS THIS WEEK</Text>
              </View>
              {meals.length === 0 ? (
                <EmptyNote text="No meals planned for this week." k={k} />
              ) : (
                // Live-requested: "focus from today to rest of the week
                // with scrollable view" — every remaining day (today
                // through the week's last day), not a fixed 3-day slice,
                // in a bounded-height scroller so a full week's rows don't
                // push the rest of the sidebar down.
                <ScrollView style={s.mealsWeekScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {daysFromToday().map((day, i) => {
                    const dayMeals = meals.filter(m => m.day === day);
                    const dinner = dayMeals.find(m => (m.type ?? '').toLowerCase() === 'dinner') ?? dayMeals[0];
                    const dayLabel = day === todayMealDay() ? 'Tonight' : day;
                    const chef = dinner?.chef_id ? members.find(mm => mm.id === dinner.chef_id)?.name?.trim().split(' ')[0] : undefined;
                    return (
                      <View key={day} style={[s.jarRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>
                            {dayLabel}{dinner ? ` — ${dinner.title}` : ''}
                          </Text>
                          <Text style={[s.jarMeta, { color: k.textFaint }]} numberOfLines={1}>
                            {dinner
                              ? [chef ? `${chef} cooking` : null, dinner.prep_minutes ? `${dinner.prep_minutes} min` : null].filter(Boolean).join(' · ') || 'Planned'
                              : 'Not planned yet'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </WidgetCard>

            {/* Mockup's checkable .grocery-row exactly: a square check that
                fills sage-green when bought, item text strikes through —
                wired to the real buyItem/restoreItem toggle rather than the
                previous read-only dot-and-quantity line. */}
            <WidgetCard k={k} isDark={isDark}>
              <View style={s.panelHead}>
                <Text style={[s.panelTitle, { color: k.textFaint }]}>GROCERY LIST</Text>
              </View>
              {groceryItems.length === 0 ? (
                <EmptyNote text="The grocery list is empty." k={k} />
              ) : (
                // Live-requested: "show 6 items and then rest are in scroll
                // view" — was a hard slice(0,5) with a static "and N more"
                // text and no way to reach the rest at all. Same bounded-
                // ScrollView pattern as Approvals/Meals This Week/Family
                // Schedule: every real item renders, capped to ~6 rows
                // visible before it scrolls.
                <ScrollView style={s.groceryScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {groceryItems.map((it, i) => (
                    <Pressable
                      key={it.id}
                      onPress={() => it.isBought ? restoreGroceryItem(it.id) : buyGroceryItem(it.id, active.id)}
                      style={[s.groceryRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: it.isBought }}
                      accessibilityLabel={it.name}
                    >
                      <View style={[s.groceryCheck, { borderColor: it.isBought ? k.sage : k.cardBorder, backgroundColor: it.isBought ? k.sage : 'transparent' }]}>
                        {it.isBought && <Check size={11} color={k.onAccent} />}
                      </View>
                      <Text
                        style={[s.groceryItemText, { color: it.isBought ? k.textFaint : k.text, textDecorationLine: it.isBought ? 'line-through' : 'none' }]}
                        numberOfLines={1}
                      >
                        {it.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {/* Live-requested: a quiet text link, not a full button —
                  same treatment as Coin Jars' "Open reward store" link
                  right above it, reusing the identical style rather than a
                  second near-duplicate. */}
              <Pressable
                onPress={() => onNavigate('meals')}
                style={({ pressed }) => [s.panelTextLink, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel="Open list"
                accessibilityHint="Open the meals and grocery screen"
              >
                <Text style={[s.panelTextLinkText, { color: k.sage }]}>Open list</Text>
                <ChevronRight size={14} color={k.sage} />
              </Pressable>
            </WidgetCard>

            <FamilyFeedStrip k={k} isDark={isDark} onOpen={() => onNavigate('memories')} />
          </View>
        </View>
      ) : (
      /* ══ WIDGET DECK (kid / senior / teen) ═══════════════════════════ */
      <View style={s.deck}>
        {/* ── Ride & pickup radar (kid: their own day instead) ──
            A kid can neither remind nor take over a ride — both actions
            were already parent-gated — so for them this slot was a
            read-only household-logistics feed with nothing to do about it.
            Same slot, their own schedule. */}
        {isKid ? (
          <KidTodayWidget
            active={active} k={k} isDark={isDark} style={s.widget}
            onOpenSchedule={() => onNavigate('schedule')}
          />
        ) : isSenior ? (
          <SeniorTasksWidget
            active={active} quests={quests} k={k} isDark={isDark} style={s.widget}
            onOpenTasks={() => onNavigate('tasks')}
          />
        ) : null}

        {/* ── Grocery snapshot (kid: their own chore board instead) ──
            The household grocery list is a shopping concern. In its slot a
            kid gets the thing a shared kitchen surface is actually best
            at: their chore status at a glance plus the pool bounties
            anyone can claim. */}
        {isKid ? (
          <KidChoresWidget
            active={active} members={members} k={k} isDark={isDark} style={s.widget}
            onOpenTasks={() => onNavigate('tasks')}
          />
        ) : null}

        {/* ── Family Feed ──
            Renamed from "Family photos" and changed from a single auto-
            advancing cross-fade to a vertically scrollable strip of recent
            photos, latest on top — live-reported request, applies to every
            role's Overview since this one compact widget was already
            shared by all of them (parent/kid/teen/senior). Every card is a
            real `family_memories` row via useKioskPhotos — there is no
            stock image anywhere in this path, and a household with no
            photos yet gets a clean empty state rather than a stranger's
            stock family on its kitchen wall. See KioskMemorySlideshow's
            compact branch (FeedList) for the layout itself.

            Taller for senior — with only one other widget in their deck
            (SeniorTasksWidget) instead of the parent/kid deck's three, the
            photo feed is deliberately the generous, warm centerpiece of
            their Overview rather than a small compact strip squeezed in
            among logistics widgets that aren't theirs. */}
        <KioskMemorySlideshow compact height={isSenior ? 340 : 200} style={isSenior ? s.widgetWide : s.widget} />

        {/* ── Find (kid/teen only — no equivalent rail tab for senior) ──
            Previously a full-width strip shared by every role, below the
            whole page. Split into two mount points instead: this one for
            kid/teen (own s.widget-sized card, same as its siblings in
            this flex-wrap deck), a separate one inside centerCol for
            parent (see that mount's own comment for why). Not duplicated
            logic — the same RadarStrip component, just two call sites
            with different widths. */}
        {!isSenior && (
          <RadarStrip
            members={members} k={k} isDark={isDark} style={s.widget}
            onOpen={() => onNavigate('findfam')}
          />
        )}
      </View>
      )}
    </ScrollView>
    </>
  );
}

// ── Hero summary line ───────────────────────────────────────────────────
// Only mentions what's actually non-zero, so a calm day reads as calm
// rather than as three zeroes.
function summarize(events: number, chores: number, unclaimedRides: number): string {
  const parts: string[] = [];
  parts.push(events === 0 ? 'Nothing on the calendar today' : `${events} ${events === 1 ? 'event' : 'events'} today`);
  if (chores > 0) parts.push(`${chores} ${chores === 1 ? 'chore' : 'chores'} open`);
  if (unclaimedRides > 0) parts.push(`${unclaimedRides} ${unclaimedRides === 1 ? 'ride needs' : 'rides need'} a driver`);
  return parts.join(' · ');
}


// ── Quick action tile ───────────────────────────────────────────────────
function QuickAction({
  Icon, label, accent, k, isDark, onPress, badge, hint,
}: {
  Icon: typeof Car; label: string; accent: string; k: KioskColors; isDark: boolean;
  onPress: () => void; badge?: number; hint: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.quick,
        {
          backgroundColor: accent + (isDark ? '1F' : '14'),
          borderColor: accent + (isDark ? '45' : '38'),
        },
        pressed && { opacity: 0.72 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} items` : label}
      accessibilityHint={hint}
    >
      <Icon size={18} color={accent} />
      <Text style={[s.quickLabel, { color: accent }]} numberOfLines={1}>{label}</Text>
      {badge !== undefined && (
        <View style={[s.quickBadge, { backgroundColor: accent }]}>
          <Text style={[s.quickBadgeText, { color: kioskOnAccent(k, accent) }]} numberOfLines={1}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── One ride row ────────────────────────────────────────────────────────
/**
 * The mockup's Remind / Take Over pair, wired to the real actions.
 *
 * Both are parent-gated (`canAct`) because both WRITE, and this device
 * stays on an active profile for the whole idle window — anyone walking
 * past the counter would otherwise be able to reassign a ride. That is the
 * same reasoning the prior audit pass applied to reward approvals in
 * KioskStoreTab.
 *
 * "Take over" goes through claimHelperSlot rather than a plain updateEvent:
 * it is a race-safe compare-and-set, which matters precisely here — two
 * parents can be looking at two devices at the same moment, and the loser
 * of that race must be told, not silently overwrite the winner. The recent
 * ride-assignment fixes (see git log on eventStore/tripStore) live inside
 * these store actions, so routing through them is also what keeps kiosk
 * from regressing them.
 */
function RideRow({
  ev, k, isDark, members, canAct, actorId, actorName, onRemind, onClaim,
}: {
  ev: FamilyEvent;
  k: KioskColors;
  isDark: boolean;
  members: FamilyMember[];
  canAct: boolean;
  actorId: string;
  actorName: string;
  onRemind: (eventId: string, assigneeId: string, assigneeName: string, fromMemberId: string) => Promise<boolean>;
  onClaim: (
    id: string, role: 'helper' | 'driver', claimantName: string,
    extra?: Partial<FamilyEvent>, onWon?: () => void, onError?: (m: string) => void,
  ) => void;
}) {
  const a = eventAssignee(ev);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const forWhom = members.find(m => m.id === ev.memberId)?.name?.trim().split(' ')[0];
  const when = ev.time ? fmtTime(ev.time) : 'All day';

  return (
    <Well k={k} accent={a.name ? k.gold : k.primary}>
      <View style={s.rideTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.rideTitle, { color: k.text }]} numberOfLines={2}>{ev.title}</Text>
          <Text style={[s.rideMeta, { color: k.textMuted }]} numberOfLines={1}>
            {when}{forWhom ? ` · for ${forWhom}` : ''}
          </Text>
        </View>
        <Chip
          label={a.name ? `${a.name.split(' ')[0]} · unconfirmed` : 'No driver'}
          accent={a.name ? k.gold : k.primary}
          isDark={isDark} k={k}
        />
      </View>

      {canAct && (
        <View style={s.rideActions}>
          {/* Remind only exists when there IS someone to remind. */}
          {a.name && a.id && (
            <ActionButton
              label="Remind" Icon={Bell} accent={k.gold} k={k} isDark={isDark}
              disabled={busy}
              style={{ flex: 1 }}
              accessibilityHint={`Send ${a.name.split(' ')[0]} a reminder about this ride`}
              onPress={async () => {
                setBusy(true);
                const ok = await onRemind(ev.id, a.id!, a.name!, actorId);
                setNote(ok ? `Reminder sent to ${a.name!.split(' ')[0]}.` : 'Could not send the reminder.');
                setBusy(false);
              }}
            />
          )}
          <ActionButton
            label={a.name ? 'Take over' : "I'll drive"}
            Icon={Check} accent={k.sage} k={k} isDark={isDark}
            variant="solid" disabled={busy}
            style={{ flex: 1 }}
            accessibilityHint="Assign this ride to yourself"
            onPress={() => {
              setBusy(true);
              onClaim(
                ev.id, 'driver', actorName, undefined,
                () => { setNote('You have this ride.'); setBusy(false); },
                (msg) => { setNote(msg || 'Someone else took this ride first.'); setBusy(false); },
              );
            }}
          />
        </View>
      )}

      {!!note && (
        <Text style={[s.rideNote, { color: k.textMuted }]} numberOfLines={2} accessibilityLiveRegion="polite">
          {note}
        </Text>
      )}
    </Well>
  );
}

// ── Unified approvals ─────────────────────────────────────────────────────
/**
 * The genuinely new piece of this screen: chore reviews, store redemptions,
 * and kid requests are three separate systems on the phone today (Tasks'
 * review lane, the Store screen's redemption queue, and the Requests inbox),
 * each with its own badge, nowhere merged. A parent standing at the kiosk
 * had no single place to see "everything waiting on me" ranked by what
 * actually needs attention first — an emergency request could be sitting
 * unseen behind three routine chore photos. This widget is that one place.
 *
 * Matches the reference mockup's own Approvals panel, not just its colors:
 * filter chips to narrow the merged list by kind, and flat list rows (a
 * checkbox-style status dot, inline title/meta/who-badge, a coin figure,
 * small text-button pairs) rather than the card-in-card Well rows every
 * other widget on this screen uses. Renders full-width of the parent
 * Overview's centerCol (see the twoColRow layout above) — the mockup's own
 * Approvals panel is full-width of its page's center column too, not a
 * small card sharing a row with the sidebar's Coin Jars/Meals/Grocery.
 */
type ApprovalFilterKey = 'all' | ApprovalItem['kind'];
const APPROVAL_FILTERS: { key: ApprovalFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'chore', label: 'Chores' },
  { key: 'redemption', label: 'Redemptions' },
  { key: 'request', label: 'Kid requests' },
];

function ParentApprovalsWidget({
  approvals, k, isDark, onApproveChore, onDeclineChore, onApproveRedemption, onRejectRedemption,
  onApproveRequest, onDeclineRequest,
}: {
  approvals: ApprovalItem[];
  k: KioskColors;
  isDark: boolean;
  onApproveChore: (questId: string) => void;
  /** Matches the phone's requestRedo(id, reviewerId, reason, presetKey?). */
  onDeclineChore: (questId: string, reason: string, presetKey?: RejectionPresetKey) => void;
  onApproveRedemption: (id: string) => void;
  onRejectRedemption: (id: string) => void;
  onApproveRequest: (id: string) => void;
  onDeclineRequest: (id: string) => void;
}) {
  const [filter, setFilter] = useState<ApprovalFilterKey>('all');
  const filtered = filter === 'all' ? approvals : approvals.filter(a => a.kind === filter);
  const hasUrgent = approvals.some(a => a.urgencyRank >= 3);
  // One shared redo sheet for the whole panel rather than one per row — a
  // parent only ever declines one chore at a time, and this matches the
  // phone's own RedoSheet, which is a single sheet at the deck level too.
  const [redoTarget, setRedoTarget] = useState<{ id: string; title: string } | null>(null);

  return (
    <WidgetCard k={k} isDark={isDark} accent={hasUrgent ? k.danger : undefined}>
      {/* Local header, not the shared WidgetHeader — the mockup's own
          .panel-head is a single line (uppercase eyebrow-style title + a
          small faint count, no separate large title underneath), not
          WidgetHeader's fixed icon-chip + two-line eyebrow/title shape.
          WidgetHeader is right for every card-shaped widget on this
          screen; this panel is deliberately the mockup's own denser list-
          panel style instead. */}
      <View style={s.panelHead}>
        <Text style={[s.panelTitle, { color: k.textFaint }]}>APPROVALS</Text>
        {approvals.length > 0 && (
          <Text style={[s.panelCount, { color: k.textFaint }]}>{approvals.length} pending</Text>
        )}
      </View>
      <View style={s.filterRow}>
        {/* Local chip, not the shared KioskPill — the mockup's .chip.active
            is a solid dark-fill/inverted-text pill (background:var(--text),
            color:var(--ink)), not KioskPill's accent-tinted-wash selected
            state. KioskPill's own look is correct for its other consumers
            (request-form presets); changing it there to match this one
            panel would be the same mistake as editing a shared radius
            token for one card's sake. */}
        {APPROVAL_FILTERS.map(f => {
          const count = f.key === 'all' ? approvals.length : approvals.filter(a => a.kind === f.key).length;
          const selected = filter === f.key;
          return (
            <Pressable
              key={f.key} onPress={() => setFilter(f.key)}
              style={[s.filterChip, {
                backgroundColor: selected ? k.text : k.well,
                borderColor: selected ? k.text : k.cardBorder,
              }]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={f.label}
            >
              <Text style={[s.filterChipText, { color: selected ? k.card : k.textMuted }]} numberOfLines={1}>
                {f.label} <Text style={{ opacity: 0.6 }}>({count})</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>
      {filtered.length === 0 ? (
        <EmptyNote text="Nothing waiting on a decision right now." k={k} />
      ) : (
        // Live-requested: "show max 5 and scrollable" — same bounded-
        // ScrollView pattern already used for Meals This Week's own
        // remaining-week list, so a big pending queue scrolls inside this
        // card instead of pushing Rides/Family Schedule further down or
        // running unbounded off the screen.
        <ScrollView style={s.approvalsScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {filtered.map((item, i) => (
            <ApprovalRow
              key={item.id} item={item} k={k} isDark={isDark}
              isFirst={i === 0}
              onApproveChore={onApproveChore}
              onDeclineChore={() => setRedoTarget({ id: item.id.slice(item.id.indexOf(':') + 1), title: item.title })}
              onApproveRedemption={onApproveRedemption}
              onRejectRedemption={onRejectRedemption}
              onApproveRequest={onApproveRequest}
              onDeclineRequest={onDeclineRequest}
            />
          ))}
        </ScrollView>
      )}
      <RedoReasonSheet
        target={redoTarget} k={k}
        onClose={() => setRedoTarget(null)}
        onSend={(reason, presetKey) => {
          if (redoTarget) onDeclineChore(redoTarget.id, reason, presetKey);
          setRedoTarget(null);
        }}
      />
    </WidgetCard>
  );
}

/**
 * A flat list row — the mockup's `.task` (a plain bordered checkbox square,
 * title + inline meta/who-badge, coin amount, small filled text-button
 * pair) — rather than the bordered `Well` card ApprovalRow used before this
 * rewrite. Every other widget's rows are cards because every other widget
 * is a small grid card; this panel is a list, so its rows are list rows.
 */
function ApprovalRow({
  item, k, isDark, isFirst, onApproveChore, onDeclineChore, onApproveRedemption, onRejectRedemption, onApproveRequest, onDeclineRequest,
}: {
  item: ApprovalItem;
  k: KioskColors;
  isDark: boolean;
  isFirst: boolean;
  onApproveChore: (questId: string) => void;
  /** Opens the shared redo-reason sheet — never a direct decline. */
  onDeclineChore: () => void;
  onApproveRedemption: (id: string) => void;
  onRejectRedemption: (id: string) => void;
  onApproveRequest: (id: string) => void;
  onDeclineRequest: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const rawId = item.id.slice(item.id.indexOf(':') + 1);
  const urgent = item.urgencyRank >= 3;

  const approve = () => {
    setBusy(true);
    if (item.kind === 'chore') onApproveChore(rawId);
    else if (item.kind === 'redemption') onApproveRedemption(rawId);
    else onApproveRequest(rawId);
  };
  const decline = () => {
    // Chore decline opens the reason sheet instead of firing immediately —
    // never sets busy here, since the row stays interactive until the sheet
    // itself sends or is cancelled.
    if (item.kind === 'chore') { onDeclineChore(); return; }
    setBusy(true);
    if (item.kind === 'redemption') onRejectRedemption(rawId);
    else onDeclineRequest(rawId);
  };

  return (
    <View style={[s.approvalRow, !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
      {/* Mockup's .task-check: a plain bordered square, not a colored
          icon-in-circle — the row's own accent already reads through the
          card's left-edge Well accent elsewhere in this app; here it stays
          neutral, matching the mockup's own quiet checkbox exactly. */}
      <View style={[s.approvalCheck, { borderColor: k.cardBorder }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.approvalTitle, { color: k.text }]} numberOfLines={1}>{item.title}</Text>
        <View style={s.approvalMetaRow}>
          <Text style={[s.approvalMeta, { color: k.textFaint }]} numberOfLines={1}>{item.meta}</Text>
          {!!item.who && (
            <View style={[s.approvalBadge, { backgroundColor: k.well }]}>
              <Text style={[s.approvalBadgeText, { color: k.textMuted }]} numberOfLines={1}>{item.who}</Text>
            </View>
          )}
        </View>
      </View>
      {/* Mock's .task-coin always occupies this slot, even with nothing to
          show — a real coin figure, or an em-dash at reduced opacity for a
          kid request (which never carries coins). Keeps every row's coin
          column aligned instead of requests alone losing their right edge. */}
      <Text
        style={[s.approvalCoin, typeof item.coins === 'number' ? { color: k.gold } : { color: k.textFaint, opacity: 0.35 }]}
        numberOfLines={1}
      >
        {typeof item.coins === 'number' ? (item.coins > 0 ? `+${item.coins}` : item.coins) : '—'}
      </Text>
      <View style={s.approvalActions}>
        {/* Visually sized off the mockup's compact .task-action spec, but
            hitSlop keeps the REAL tappable extent at kiosk's documented
            48px floor (KIOSK_HIT.min) — the mockup is a cursor-driven web
            page with no such floor; this is a tablet a kid or grandparent
            taps at an angle, so the visual size and the tap target are
            deliberately different here. Filled (not outline) — the
            mockup's own .task-action is a filled surface-2 rectangle, not
            a transparent/bordered button. */}
        {/* Same neutral fill on both — the mockup's .task-action background
            never changes per action, only the LABEL color does
            (.task-action.deny{color:var(--danger)}), so Decline/Redo isn't
            a red button, it's a neutral button with red text. */}
        <Pressable
          onPress={decline} disabled={busy}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={({ pressed }) => [s.approvalTextBtn, { backgroundColor: k.well, borderColor: k.cardBorder }, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={item.kind === 'chore' ? 'Redo' : 'Decline'}
        >
          <Text style={[s.approvalTextBtnLabel, { color: k.danger }]}>
            {item.kind === 'chore' ? 'Redo' : 'Decline'}
          </Text>
        </Pressable>
        <Pressable
          onPress={approve} disabled={busy}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={({ pressed }) => [s.approvalTextBtn, { backgroundColor: k.well, borderColor: k.cardBorder }, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Approve"
        >
          <Text style={[s.approvalTextBtnLabel, { color: k.text }]}>Approve</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Kiosk equivalent of the phone's RedoSheet (ParentReviewDeck.tsx) — same
 * REJECTION_PRESETS list, same "pick a preset or write your own" shape, same
 * requestRedo(id, reviewerId, reason, presetKey) call underneath. Built on
 * KioskFormDrawer/KioskPill rather than a hand-rolled Modal so it matches
 * every other kiosk form sheet's chrome (scrim, keyboard-aware height,
 * KioskModalHost idle-lock participation) instead of copying the phone's
 * raw Modal styling verbatim.
 */
function RedoReasonSheet({ target, k, onClose, onSend }: {
  target: { id: string; title: string } | null;
  k: KioskColors;
  onClose: () => void;
  onSend: (reason: string, presetKey?: RejectionPresetKey) => void;
}) {
  const [preset, setPreset] = useState<RejectionPresetKey | null>(null);
  const [customMsg, setCustomMsg] = useState('');

  const reason = preset === 'CUSTOM' ? customMsg.trim() : REJECTION_PRESETS.find(p => p.key === preset)?.label ?? '';

  const close = () => { setPreset(null); setCustomMsg(''); onClose(); };

  return (
    <KioskFormDrawer
      visible={!!target} title="Request redo" subtitle={target?.title}
      accent={k.danger} Icon={X} k={k} onClose={close}
      submitLabel="Send redo" canSubmit={!!reason} onSubmit={() => { onSend(reason, preset ?? undefined); setPreset(null); setCustomMsg(''); }}
      footerNote="The kid sees this note on their chore card."
    >
      <KioskFieldLabel k={k}>What needs fixing?</KioskFieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, marginBottom: KIOSK_SPACE.md }}>
        {REJECTION_PRESETS.map(p => (
          <KioskPill
            key={p.key} label={p.label} selected={preset === p.key}
            onPress={() => setPreset(p.key)} accent={k.danger} k={k}
          />
        ))}
      </View>
      {preset === 'CUSTOM' && (
        <TextInput
          value={customMsg} onChangeText={setCustomMsg}
          placeholder="Describe what needs to be fixed…" placeholderTextColor={k.textFaint}
          multiline numberOfLines={3}
          style={[kioskInputStyle(k), { minHeight: 90, textAlignVertical: 'top' }]}
        />
      )}
    </KioskFormDrawer>
  );
}

// ── Senior's own tasks — one calm summary card, not a board ──────────────
/**
 * Replaces the parent's Rides widget in a senior/grandparent's Overview
 * (see the isSenior comment above for why the parent deck doesn't apply
 * here). Deliberately the simplest widget on this screen: a single number
 * ("what's open"), up to three titles, and a link into Tasks for anything
 * beyond that — no inline claim/submit/approve actions, no status lanes,
 * no board. The design brief is explicit that Grandparent keeps
 * "one-decision-at-a-time simplicity" even as the other roles' Hubs get
 * denser, so this stays a glance-and-go summary rather than growing into
 * its own copy of KidChoresWidget's action-button machinery.
 *
 * "Yours" mirrors the one senior-scoped filter this app already shipped
 * for exactly this purpose (the now-unreachable KioskHubTab's openPool/
 * inProgress memos): a chore this senior is either assigned to directly or
 * sponsoring (sponsorUserId), open or in flight — not the whole household's
 * board.
 */
function SeniorTasksWidget({ active, quests, k, isDark, onOpenTasks, style }: {
  active: FamilyMember;
  quests: import('@/store/questStore').Quest[];
  k: KioskColors;
  isDark: boolean;
  onOpenTasks: () => void;
  style?: any;
}) {
  const mine = useMemo(
    () => quests.filter(q =>
      (q.assignedToId === active.id || q.sponsorUserId === active.id) &&
      (q.status === 'todo' || q.status === 'claimed' || q.status === 'in_progress' || q.status === 'pending_approval'),
    ),
    [quests, active.id],
  );
  const inReview = useMemo(() => mine.filter(q => q.status === 'pending_approval').length, [mine]);

  return (
    <WidgetCard k={k} isDark={isDark} style={style}>
      <WidgetHeader
        Icon={CheckSquare} eyebrow="Your list" title="Chores & errands"
        accent={k.purple} k={k} isDark={isDark}
        right={mine.length > 0
          ? <Chip label={`${mine.length}`} accent={k.purple} isDark={isDark} k={k} />
          : undefined}
      />
      {mine.length === 0 ? (
        <EmptyNote text="Nothing open on your list right now." k={k} />
      ) : (
        <View>
          {mine.slice(0, 3).map((q, i) => (
            <View
              key={q.id}
              style={[s.seniorTaskRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}
            >
              <View style={[s.seniorTaskDot, { backgroundColor: q.status === 'pending_approval' ? k.gold : k.purple }]} />
              <Text style={[s.seniorTaskTitle, { color: k.text }]} numberOfLines={1}>{q.title}</Text>
              {q.status === 'pending_approval' && (
                <Text style={[s.seniorTaskMeta, { color: k.gold }]}>Awaiting review</Text>
              )}
            </View>
          ))}
          {mine.length > 3 && (
            <Text style={[s.seniorTaskMeta, { color: k.textFaint, marginTop: KIOSK_SPACE.xs }]}>
              and {mine.length - 3} more
            </Text>
          )}
        </View>
      )}
      <ActionButton
        label={inReview > 0 ? `See full list · ${inReview} awaiting review` : 'See full list'}
        accent={k.purple} k={k} isDark={isDark}
        onPress={onOpenTasks}
        style={{ marginTop: KIOSK_SPACE.sm }}
        accessibilityHint="Open the chores and tasks board"
      />
    </WidgetCard>
  );
}

// ── FindFam radar strip ─────────────────────────────────────────────────
/**
 * The mockup's full-width GPS banner. Reads the SAME `member_locations`
 * table + per-member decryptLocationText path the phone's GPS tab and
 * KioskFindFamTab already use — no second source, no invented coordinates.
 *
 * Deliberately shows status/neighborhood text only, never coordinates or a
 * street address: this strip is on the always-visible overview of a screen
 * a guest can stand in front of. The Find tab (a deliberate act of
 * navigation) is where precise location lives.
 */
/**
 * Mockup's "Family Feed" sidebar panel: a horizontal scroller of recent
 * photo thumbnails with a caption below each. KioskMemorySlideshow's own
 * `compact` mode is a VERTICAL strip (the shape every other role's Overview
 * already uses) — this is a separate small component rather than a new mode
 * bolted onto that shared one, since only this parent sidebar needs the
 * horizontal shape.
 *
 * Caption is the memory's title alone, not "Who · caption" the way the
 * mockup shows it — family_memories (useKioskPhotos' real source) has no
 * uploader/member field at all, and inventing a name would be exactly the
 * kind of fabricated content this app's own real-data-or-nothing rule
 * (see this file's header) exists to prevent.
 */
function FamilyFeedStrip({ k, isDark, onOpen }: { k: KioskColors; isDark: boolean; onOpen: () => void }) {
  const { photos } = useKioskPhotos();
  return (
    <WidgetCard k={k} isDark={isDark} padded={false}>
      <View style={[s.panelHead, { paddingHorizontal: KIOSK_SPACE.md, paddingTop: KIOSK_SPACE.md, marginBottom: KIOSK_SPACE.sm }]}>
        <Text style={[s.panelTitle, { color: k.textFaint }]}>FAMILY FEED</Text>
      </View>
      {photos.length === 0 ? (
        <EmptyNote text="No family photos kept yet." k={k} style={{ paddingHorizontal: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md }} />
      ) : (
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open Memories">
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingHorizontal: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md }}
          >
            {photos.slice(0, 8).map(p => (
              <View key={p.key} style={s.feedItem}>
                <Image source={{ uri: p.url }} style={[s.feedThumb, { borderColor: k.cardBorder }]} />
                <Text style={[s.feedCap, { color: k.textFaint }]} numberOfLines={2}>{p.title}</Text>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      )}
    </WidgetCard>
  );
}

/**
 * FamilySchedulePanel — the mock's own center-column timeline
 * (Now-strip -> Schedule -> Approvals), extracted into its own component
 * per the "make it modular" direction rather than staying inline JSX in
 * the main render.
 *
 * Live-requested: "always show ongoing onwards, remaining scroll to" —
 * bounded to a real height (same "N rows before it scrolls" pattern as
 * Meals This Week/Approvals) AND auto-scrolled, once, to the first not-yet-
 * done event on mount/data-change, so a parent glancing at this panel
 * mid-afternoon sees the current/next event first rather than having to
 * scroll past a morning's worth of already-finished rows. Measured via
 * each row's own onLayout (its real rendered position) rather than a
 * guessed fixed row height, since row height genuinely varies (a row with
 * a "who" line or a location line is taller than one without either).
 */
function FamilySchedulePanel({ dayEvents, k, isDark }: {
  dayEvents: FamilyEvent[]; k: KioskColors; isDark: boolean;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsets = useRef<Map<string, number>>(new Map());
  const hasScrolled = useRef(false);

  const sorted = useMemo(
    () => [...dayEvents].sort((a, b) => (a.allDay ? '' : a.time ?? '').localeCompare(b.allDay ? '' : b.time ?? '')),
    [dayEvents],
  );
  const nowHHMM = new Date().toTimeString().slice(0, 5);
  const rowState = (ev: FamilyEvent) => {
    const isCurrent = !ev.allDay && !!ev.time && ev.time <= nowHHMM && (!ev.endTime || ev.endTime > nowHHMM);
    const isDone = !ev.allDay && !!ev.time && (ev.endTime ? ev.endTime <= nowHHMM : ev.time < nowHHMM);
    return { isCurrent, isDone };
  };
  // Re-run once new layout measurements come in (each row's onLayout fires
  // after this render commits) — cheap no-op once already scrolled for
  // this data set, guarded by hasScrolled so a later re-render (e.g. the
  // clock ticking a done row into being) doesn't keep re-snapping the
  // scroll position out from under someone reading it.
  useEffect(() => {
    hasScrolled.current = false;
  }, [dayEvents]);
  const maybeScrollToOngoing = () => {
    if (hasScrolled.current) return;
    const firstOpenIdx = sorted.findIndex(ev => !rowState(ev).isDone);
    if (firstOpenIdx <= 0) { hasScrolled.current = true; return; } // nothing done above it — no scroll needed
    const target = sorted[firstOpenIdx];
    const y = rowOffsets.current.get(target.id);
    if (y == null) return; // that row hasn't reported its layout yet
    hasScrolled.current = true;
    scrollRef.current?.scrollTo({ y, animated: false });
  };

  return (
    <WidgetCard k={k} isDark={isDark}>
      {/* Family Schedule — genuinely missing until now: the mockup's own
          center-column timeline (Now-strip -> Schedule -> Approvals) had
          no real equivalent on this screen at all. Parent-only (this
          whole branch is), so the real per-event sensitivity redaction
          (canViewSensitiveEventDetail) doesn't apply here — a parent
          already gets full detail on every event unconditionally, same
          rule KioskScheduleTab enforces elsewhere on this device for
          other roles. All-day events (no time slot) list first, timed
          events after in order — same convention every other real
          calendar surface in this app already uses for all-day items. */}
      <View style={[s.panelHead, { marginBottom: 4 }]}>
        <Text style={[s.panelTitle, { color: k.textFaint }]}>FAMILY SCHEDULE</Text>
        <Text style={[s.panelCount, { color: k.textFaint }]}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      </View>
      {dayEvents.length === 0 ? (
        <EmptyNote text="Nothing on the calendar today." k={k} />
      ) : (
        <ScrollView ref={scrollRef} style={s.scheduleScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {sorted.map((ev, i) => {
            const a = eventAssignee(ev);
            // Mock's exact .tl-item.done / .tl-item.current states: an
            // all-day event is neither (no time to compare); a timed
            // event is "current" while nowHHMM falls inside
            // [time, endTime), "done" once its end (or, if it has none,
            // its start) has already passed.
            const { isCurrent, isDone } = rowState(ev);
            return (
              <View
                key={ev.id}
                onLayout={(e) => {
                  rowOffsets.current.set(ev.id, e.nativeEvent.layout.y);
                  // Checked after EVERY row's layout, not just the last —
                  // RN doesn't guarantee child onLayout firing order, so
                  // the target row (which comes before the last one in
                  // the list) might not have reported its own y yet by
                  // the time the last row does. hasScrolled + the y==null
                  // bail inside maybeScrollToOngoing make this cheap to
                  // call opportunistically until it actually succeeds.
                  maybeScrollToOngoing();
                }}
                style={[
                  s.tlItem,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder },
                ]}
              >
                {/* Mock's .tl-item.current::before is absolutely
                    positioned (left:-20px, no width/margin effect on the
                    row itself) — a real borderLeftWidth here would shift
                    this ONE row 1px out of alignment with every other row
                    in the list (confirmed: an earlier version did exactly
                    that with a marginLeft:-1 hack). This overlay approach
                    matches the mock exactly AND never touches layout. */}
                {isCurrent && <View style={[s.tlCurrentBar, { backgroundColor: k.primary }]} />}
                <Text style={[s.tlTime, { color: k.textFaint }]} numberOfLines={1}>
                  {ev.allDay || !ev.time ? 'All day' : fmtTime(ev.time)}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {!!a.name && (
                    <Text style={[s.tlWho, { color: k.textFaint }]} numberOfLines={1}>{a.name}</Text>
                  )}
                  <Text
                    style={[s.tlTitle, { color: isCurrent ? k.primary : isDone ? k.textFaint : k.text }, isDone && { textDecorationLine: 'line-through' }]}
                    numberOfLines={1}
                  >
                    {ev.title}
                  </Text>
                  {!!ev.location && (
                    <Text
                      style={[s.tlMeta, { color: isDone ? k.textFaint : k.textMuted }, isDone && { textDecorationLine: 'line-through' }]}
                      numberOfLines={1}
                    >
                      {ev.location}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </WidgetCard>
  );
}

function RadarStrip({ members, k, isDark, onOpen, style }: {
  members: FamilyMember[]; k: KioskColors; isDark: boolean; onOpen: () => void;
  /** Caller-controlled outer width — parent mounts this inside centerCol
   *  (no extra style needed, stretches to match Approvals/Rides exactly);
   *  kid/teen mount it in their own flex-wrap deck (s.widget, same as
   *  every sibling card there). Same component either way, not a
   *  duplicated one — only the mount point and this one prop differ. */
  style?: StyleProp<ViewStyle>;
}) {
  const [rows, setRows] = useState<RadarRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('member_locations').select('*').order('member_id');
      if (cancelled || !data) return;
      const decrypted = await Promise.all((data as any[]).map(async r => ({
        ...r,
        neighborhood: r.neighborhood ? await decryptLocationText(r.member_id, r.neighborhood) : null,
      })));
      if (!cancelled) setRows(decrypted as RadarRow[]);
    };
    load();
    // Debounced for the same native-map/burst reason KioskFindFamTab
    // documents — and because a whole family moving at school pickup time
    // is exactly a burst.
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`kiosk_radar_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_locations' }, () => {
        if (t) clearTimeout(t);
        t = setTimeout(load, 400);
      })
      .subscribe();
    return () => { cancelled = true; if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, []);

  const visible = members.filter(m => !m.deletedAt && m.inviteStatus !== 'pending');
  const sharing = visible.filter(m => {
    const r = rows.find(x => x.member_id === m.id);
    return !!r && r.share_location_enabled !== false;
  }).length;

  return (
    <WidgetCard k={k} isDark={isDark} style={style}>
      {/* Local panelHead, matching every other rebuilt panel this session
          (Approvals, Coin Jars, Meals, Grocery, Family Feed, Family
          Schedule) — this was the one widget still using the old
          WidgetHeader icon-chip + two-line title, visibly out of step
          with the rest of the screen. */}
      <View style={s.panelHead}>
        <Text style={[s.panelTitle, { color: k.textFaint }]}>FIND FAM</Text>
        <Pressable
          onPress={onOpen} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Open the map"
          accessibilityHint="See everyone on the family map"
        >
          <Text style={[s.panelCount, { color: sharing > 0 ? k.sage : k.textFaint }]}>
            {sharing}/{visible.length} sharing
          </Text>
        </Pressable>
      </View>
      {/* Real fixed 3-per-row grid (flexGrow:0/flexBasis:33.333%, same
          pattern established earlier this session for the kid/senior
          deck) rather than the old flexGrow:1/flexBasis:220 combination,
          which produced a variable 2-4 column count depending on width
          instead of a consistent 3. */}
      <View style={s.radarGrid}>
        {visible.map(m => {
          const raw = rows.find(x => x.member_id === m.id);
          // A member who turned sharing off keeps their last-known row in
          // the table — showing it would misrepresent stale data as live,
          // the exact bug KioskFindFamTab's own comment records fixing.
          const loc = raw && raw.share_location_enabled !== false ? raw : null;
          const accent = kioskRoleAccent(k, m.role);
          const low = loc?.battery_level != null && loc.battery_level <= 20;
          return (
            <View key={m.id} style={s.radarCell}>
              <View style={[s.radarAvatar, { borderColor: loc ? accent : k.cardBorder }]}>
                <Text style={s.radarEmoji}>{m.emoji ?? '👤'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.radarName, { color: k.text }]} numberOfLines={1}>
                  {m.name?.trim().split(' ')[0]}
                </Text>
                <Text
                  style={[s.radarStatus, { color: loc ? accent : k.textFaint }]}
                  numberOfLines={1}
                >
                  {loc
                    ? (loc.status_text || STATUS_LABEL[loc.status] || 'Sharing')
                    : 'Not sharing'}
                </Text>
              </View>
              {low && (
                <View style={s.radarBattery} accessibilityLabel={`Battery ${loc!.battery_level} percent`}>
                  <BatteryLow size={13} color={k.danger} />
                  <Text style={[s.radarBatteryText, { color: k.danger }]} numberOfLines={1}>
                    {loc!.battery_level}%
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </WidgetCard>
  );
}

const s = StyleSheet.create({
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl, gap: KIOSK_SPACE.md },

  // Hero. Wraps to stacked on a narrow/portrait pane — flexBasis with
  // flexWrap rather than a measured breakpoint, so it reflows by
  // construction and can't drift the way an arithmetic width can.
  // Mockup's .now-strip exactly: 18/20px padding, 16px gap, single row.
  nowStrip: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  nowStripDotWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nowStripDotHalo: { position: 'absolute', width: 16, height: 16, borderRadius: 8 },
  nowStripDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  nowStripLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  nowStripWhat: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  nowStripTime: { fontSize: 12, flexShrink: 0 },

  heroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  hero: { flexGrow: 3, flexBasis: 460, minWidth: 0 },
  heroSide: { flexGrow: 1, flexBasis: 280, minWidth: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: KIOSK_SPACE.sm },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 0.6 },
  heroGreetRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md, marginTop: KIOSK_SPACE.md },
  heroAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  heroAvatarEmoji: { fontSize: 28 },
  heroTitle: { fontSize: KIOSK_TYPO.hero, fontWeight: '800', letterSpacing: -0.8 },
  heroSub: { fontSize: KIOSK_TYPO.body, fontWeight: '600', marginTop: 4 },

  // nowrap, not wrap: with Check In / Piggy Bank / Cheer Squad / My
  // Requests all promoted alongside Intercom, this row can hold 5 tiles —
  // it should read as one single strip, shrinking each tile rather than
  // wrapping to a second row.
  quickRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: KIOSK_SPACE.xs, marginTop: KIOSK_SPACE.lg },
  // Shrunk to fit alongside 4 kid tiles in one non-wrapping strip
  // (quickRow above) — flexShrink lets 5 tiles compress evenly rather than
  // wrap, flexBasis is a starting point, not a floor.
  quick: {
    flexGrow: 1, flexShrink: 1, flexBasis: 76, minWidth: 0,
    minHeight: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 6,
  },
  quickLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', textAlign: 'center' },
  quickBadge: {
    position: 'absolute', top: 4, right: 6, minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  quickBadgeText: { fontSize: KIOSK_TYPO.micro, fontWeight: '900' },

  mealEmpty: {
    flex: 1, minHeight: 130, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.sm, padding: KIOSK_SPACE.md,
  },

  // Breakfast/Lunch/Dinner — three scrollable cards, one per type, each
  // opening its own recipe (KioskRecipeDrawer) instead of one dinner
  // summary that opened a day-overview popup.
  mealTypeRow: { flexDirection: 'row', gap: KIOSK_SPACE.sm, paddingRight: KIOSK_SPACE.xs },
  mealTypeCard: {
    width: 132, minHeight: 130, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: 4, padding: KIOSK_SPACE.sm,
  },
  mealTypeLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  mealTypeEmoji: { fontSize: 28, marginTop: 2 },
  mealTypeTitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  mealTypeEmpty: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', textAlign: 'center', marginTop: 4 },

  // Parent's two-column page — center column (Rides, Approvals) full-width
  // of its own column, sidebar column (Coin jars, Grocery, Photo feed)
  // full-width of ITS column — matching the mockup's actual page grid
  // EXACTLY: `.layout{grid-template-columns: 300px 1fr 340px}` (rail,
  // center, right-col) — the rail and sidebar are FIXED pixel columns,
  // only the center column is flexible. Full re-read of the mock's own
  // CSS corrected an earlier approximation here that used a 1.9:1 flex
  // ratio between center and sidebar instead of matching this real grid.
  // Cards inside each column render with no explicit width style of their
  // own (WidgetCard's default) — the column itself sets the width, so a
  // card doesn't also need flexBasis fighting its container.
  twoColRow: { flexDirection: 'row', gap: KIOSK_SPACE.md, alignItems: 'flex-start' },
  // Below isNarrowParentLayout's threshold: stack instead of split — a
  // fractional flex share of an already-narrow row is what actually causes
  // cramped/clipped content on rotation, not any single component's own
  // sizing. Matches the mock's own @media(max-width:1080px) rule, which
  // collapses its whole 3-column grid to `1fr` at the same width this
  // file's own isNarrowParentLayout threshold uses.
  twoColRowStacked: { flexDirection: 'column' },
  colFullWidth: { flex: undefined, width: '100%' },
  centerCol: { flex: 1, gap: KIOSK_SPACE.md, minWidth: 0 },
  sideCol: { flex: undefined, width: 340, gap: KIOSK_SPACE.md, minWidth: 0 },

  // Widget deck.
  //
  // A real fixed grid rather than flexGrow-stretched flex-wrap. The
  // previous flexGrow:1/flexBasis:320 combination let each row's cards
  // stretch to fill whatever space was left in that row, so column count
  // and column width both drifted row to row depending on which widgets
  // happened to land together — reported as the deck looking "random"
  // rather than matching the mockup's own aligned grid sections.
  // flexGrow:0/flexShrink:0 here is what actually fixes it: every widget
  // is EXACTLY one third of the deck's width regardless of its neighbors'
  // content, so columns line up top to bottom the way a real grid would.
  // RN's Yoga engine resolves gap before splitting the percentage basis
  // (unlike older web flexbox engines), so '33.333%' alongside the deck's
  // own `gap` needs no manual gap-subtraction math.
  //
  // Tradeoff, accepted: a short widget (e.g. Grocery) now leaves empty
  // space below it in its own column rather than a later card flowing up
  // into that gap — the cost of every column being a true fixed width.
  deck: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  // No minWidth alongside flexShrink:0/a percentage basis — that pairing
  // would force a fixed pixel floor per column and overflow horizontally
  // on any kiosk device narrower than 3 columns' worth, instead of letting
  // flexWrap reflow down to 2 or 1 columns the way it does today.
  widget: { flexGrow: 0, flexShrink: 0, flexBasis: '33.333%' },
  // Senior's photo feed — two grid columns wide (still grid-aligned, unlike
  // the old flexGrow:3 ratio) so it reads as the deck's centerpiece next to
  // the one-column SeniorTasksWidget beside it.
  widgetWide: { flexGrow: 0, flexShrink: 0, flexBasis: '66.666%' },

  seniorTaskRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm,
  },
  seniorTaskDot: { width: 6, height: 6, borderRadius: 3 },
  seniorTaskTitle: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  seniorTaskMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },

  rideTop: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.sm },
  rideTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  rideMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 3 },
  rideActions: { flexDirection: 'row', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.sm },
  rideNote: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: KIOSK_SPACE.xs },

  // Approvals panel — sized directly off the mockup's own .task/.task-*
  // literal pixel values rather than translated through the wider kiosk
  // type/space scale, since this panel is deliberately denser and more
  // list-like than every card-shaped widget around it.
  // Mockup's .panel-head/.panel-title exactly: single row, 11px/700/
  // uppercase/0.12em-tracked title, small faint count on the right.
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  panelTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase' },
  panelCount: { fontSize: 11 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  // Mockup's .chip exactly: 999px pill, 1px border, 7x13 padding, 12px/700 text.
  filterChip: {
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 7,
  },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  approvalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
  },
  // Mockup's .task-check exactly: 22px, 6px radius, 2px border, no fill.
  approvalCheck: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, flexShrink: 0,
  },
  approvalTitle: { fontSize: 14, fontWeight: '700' },
  approvalMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3,
  },
  approvalMeta: { fontSize: 11.5, fontWeight: '600' },
  approvalBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  approvalBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  approvalCoin: { fontSize: 14, fontWeight: '700', flexShrink: 0 },
  approvalActions: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  approvalTextBtn: {
    borderWidth: 1, borderRadius: 7,
    paddingHorizontal: 12, paddingVertical: 8,
    minHeight: 0,
  },
  approvalTextBtnLabel: { fontSize: 11.5, fontWeight: '700' },

  // Mockup's .jar/.jar-avatar/.jar-name/.jar-meta/.jar-amt exactly.
  jarRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  jarAvatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  jarInitial: { fontSize: 15, fontWeight: '700', color: '#fff' },
  jarName: { fontSize: 13.5, fontWeight: '700' },
  jarMeta: { fontSize: 11.5, marginTop: 2 },
  jarAmt: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  // Shared quiet "see more" link for any sidebar panel (Coin Jars' "Open
  // reward store", Grocery's "Open list") — not named after either card
  // specifically, since a third panel could reuse it the same way.
  panelTextLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.xs, minHeight: KIOSK_HIT.min,
  },
  panelTextLinkText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },

  // Mockup's .tl-item exactly: 58px time column + flexible body, 14px gap,
  // 13px vertical padding, hairline top border between rows.
  tlItem: { flexDirection: 'row', gap: 14, paddingVertical: 13, position: 'relative' },
  // Mock's .tl-item.current::before: a 3px accent bar overlaid at the
  // panel's own left edge, absolutely positioned so it never affects the
  // row's own layout/width.
  tlCurrentBar: { position: 'absolute', left: -KIOSK_SPACE.md, top: 0, bottom: 0, width: 3 },
  tlTime: { width: 58, fontSize: 12, fontWeight: '600', marginTop: 2 },
  tlWho: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 1 },
  tlTitle: { fontSize: 14, fontWeight: '700' },
  tlMeta: { fontSize: 12, marginTop: 2 },

  // Mockup's .grocery-row/.grocery-check/.grocery-item exactly.
  groceryRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, minHeight: KIOSK_HIT.control },
  groceryCheck: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  groceryItemText: { fontSize: 13, fontWeight: '600' },

  // Mockup's .feed-item/.feed-thumb/.feed-cap exactly: 96px square thumb,
  // 9px radius, 10.5px caption with a 5px top margin.
  feedItem: { width: 96 },
  feedThumb: { width: 96, height: 96, borderRadius: 9, borderWidth: 1, backgroundColor: '#0002' },
  feedCap: { fontSize: 10.5, lineHeight: 13.5, marginTop: 5 },
  // Bounded so a full remaining-week list scrolls inside the sidebar card
  // rather than pushing Grocery/Family Feed further down — 4 rows'
  // (~180px) worth before it scrolls.
  mealsWeekScroll: { maxHeight: 200 },
  // 5 rows' worth (~65px each incl. padding) before it scrolls, same
  // bounded-ScrollView reasoning as Meals This Week's own list.
  approvalsScroll: { maxHeight: 320 },
  // 5 rows' worth (~64px each: 13px vertical padding x2 + ~38px of
  // stacked time/who/title/meta text), same bounded-ScrollView reasoning.
  scheduleScroll: { maxHeight: 320 },
  // 6 rows' worth (each a single-line KIOSK_HIT.control-height checkable
  // row, 52px) before it scrolls, same bounded-ScrollView reasoning.
  groceryScroll: { maxHeight: 312 },

  // Real fixed 3-per-row grid — flexGrow:0/flexShrink:0/flexBasis:33.333%,
  // the same "every cell is exactly one third regardless of neighbors'
  // content" pattern established earlier this session for the kid/senior
  // widget deck (RN's Yoga resolves gap before splitting a percentage
  // basis, so no manual gap-subtraction math is needed alongside it).
  radarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  radarCell: {
    flexGrow: 0, flexShrink: 0, flexBasis: '33.333%', minWidth: 0,
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    minHeight: KIOSK_HIT.primary,
  },
  radarAvatar: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  radarEmoji: { fontSize: 19 },
  radarName: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  radarStatus: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: 2 },
  radarBattery: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  radarBatteryText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
});
