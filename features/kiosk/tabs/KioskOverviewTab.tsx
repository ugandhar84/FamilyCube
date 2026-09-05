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
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import {
  Car, PiggyBank, MapPin, UtensilsCrossed, Bell, Check, ShoppingCart,
  CalendarPlus, Megaphone, BatteryLow, ChefHat,
} from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import { useFamilyStore } from '@/store/familyStore';
import { useEventStore, eventAssignee, type FamilyEvent } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useGroceryStore } from '@/store/groceryStore';
import { supabase } from '@/lib/supabase';
import { decryptLocationText } from '@/lib/locationCrypto';
import { fmtTime } from '@/lib/dates';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { useKioskColors, kioskRoleAccent, kioskOnAccent, type KioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, Well, Chip, ActionButton, EmptyNote } from '../components/KioskOS';
import { KioskMemorySlideshow } from '../components/KioskMemorySlideshow';
import { useKioskMeals, todayMealDay } from '../useKioskMeals';
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
  const isParent = active.role === 'parent';

  const dayEvents = useEventStore(s => s.dayEvents);
  const remindEventAssignee = useEventStore(s => s.remindEventAssignee);
  const claimHelperSlot = useEventStore(s => s.claimHelperSlot);
  const { quests } = useQuestStore();
  const groceryItems = useGroceryStore(s => s.items);
  const { meals } = useKioskMeals();

  // ── Tonight's meal (real family_meals row) ───────────────────────────
  const tonight = useMemo(() => {
    const today = meals.filter(m => m.day === todayMealDay());
    return today.find(m => (m.type ?? '').toLowerCase() === 'dinner') ?? today[0] ?? null;
  }, [meals]);

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
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* ══ HERO ROW ═══════════════════════════════════════════════════ */}
      <View style={s.heroRow}>
        <WidgetCard k={k} isDark={isDark} style={s.hero}>
          <View style={s.heroTop}>
            <Chip label="Kitchen display" accent={k.primary} isDark={isDark} k={k} />
            <View style={s.liveRow}>
              <View style={[s.liveDot, { backgroundColor: k.sage }]} />
              <Text style={[s.liveText, { color: k.sage }]} numberOfLines={1}>Live</Text>
            </View>
          </View>

          <Text style={[s.heroTitle, { color: k.text }]} numberOfLines={2}>
            {greeting}, {active.name?.trim().split(' ')[0]}
          </Text>
          <Text style={[s.heroSub, { color: k.textMuted }]} numberOfLines={2}>
            {summarize(dayEvents.length, openChores, unclaimedRides)}
          </Text>

          {/* Quick actions. The mockup's four; each goes somewhere real
              rather than firing a toast. "Scan Flyer" is dropped — there is
              no flyer-scanner feature in this app to route to. */}
          <View style={s.quickRow}>
            <QuickAction
              Icon={CalendarPlus} label="Schedule" accent={k.blue} k={k} isDark={isDark}
              onPress={() => onNavigate('schedule')}
              hint="Open the family schedule"
            />
            <QuickAction
              Icon={ShoppingCart} label="Grocery" accent={k.sage} k={k} isDark={isDark}
              onPress={() => onNavigate('meals')}
              badge={groceryItems.length || undefined}
              hint="Open meals and the grocery list"
            />
            <QuickAction
              Icon={UtensilsCrossed} label="Meals" accent={k.gold} k={k} isDark={isDark}
              onPress={() => onNavigate('meals')}
              hint="Open the weekly meal plan"
            />
            <QuickAction
              Icon={Megaphone} label="Intercom" accent={k.primary} k={k} isDark={isDark}
              onPress={onIntercom}
              hint="Broadcast an announcement to every family phone"
            />
          </View>
        </WidgetCard>

        {/* Tonight's dinner — the mockup's photo-frame slot, given instead
            to the one piece of information a kitchen display should lead
            with. The photo frame itself now lives in the widget deck below
            (KioskMemorySlideshow), so both are on the screen rather than
            one displacing the other. */}
        <WidgetCard k={k} isDark={isDark} style={s.heroSide}>
          <WidgetHeader
            Icon={ChefHat} eyebrow="Tonight" title="What's for dinner"
            accent={k.gold} k={k} isDark={isDark}
          />
          {tonight ? (
            <Well k={k} accent={k.gold} style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={s.mealEmoji}>{tonight.emoji ?? '🍽️'}</Text>
              <Text style={[s.mealTitle, { color: k.text }]} numberOfLines={2}>{tonight.title}</Text>
              <Text style={[s.mealMeta, { color: k.textMuted }]} numberOfLines={2}>
                {mealMeta(tonight.prep_minutes, tonight.chef_id, members, tonight.start_time)}
              </Text>
            </Well>
          ) : (
            <Pressable
              onPress={() => onNavigate('meals')}
              style={({ pressed }) => [
                s.mealEmpty,
                { backgroundColor: pressed ? k.cardHover : k.well, borderColor: k.cardBorder },
              ]}
              accessibilityRole="button"
              accessibilityLabel="No dinner planned for tonight"
              accessibilityHint="Open the meal planner"
            >
              <UtensilsCrossed size={26} color={k.textFaint} />
              <EmptyNote text="No dinner planned for tonight — tap to plan the week." k={k} style={{ textAlign: 'center' }} />
            </Pressable>
          )}
        </WidgetCard>
      </View>

      {/* ══ WIDGET DECK ════════════════════════════════════════════════ */}
      <View style={s.deck}>
        {/* ── Ride & pickup radar ── */}
        <WidgetCard k={k} isDark={isDark} style={s.widget}>
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

        {/* ── Kids' coin jars ──
            Parent-only: a kiosk sits where anyone can see it, and one
            child's balance is not another child's business — the phone
            applies the same rule (a kid sees only their own wallet). */}
        {isParent && kids.length > 0 && (
          <WidgetCard k={k} isDark={isDark} style={s.widget}>
            <WidgetHeader
              Icon={PiggyBank} eyebrow="Allowance" title="Coin jars"
              accent={k.purple} k={k} isDark={isDark}
            />
            <View style={{ gap: KIOSK_SPACE.sm }}>
              {kids.map(kid => {
                const main = (kid as any).mainCoins ?? 0;
                const gp = (kid as any).gpCoins ?? 0;
                const total = main + gp;
                const accent = kioskRoleAccent(k, kid.role);
                return (
                  <Well key={kid.id} k={k} style={s.jarRow}>
                    <View style={[s.jarAvatar, { backgroundColor: accent + (isDark ? '24' : '1A') }]}>
                      <Text style={s.jarEmoji}>{kid.emoji ?? '🧒'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.jarName, { color: k.text }]} numberOfLines={1}>
                        {kid.name?.trim().split(' ')[0]}
                      </Text>
                      {gp > 0 && (
                        <Text style={[s.jarSplit, { color: k.textFaint }]} numberOfLines={1}>
                          {main} main · {gp} grandparent
                        </Text>
                      )}
                    </View>
                    <Text style={[s.jarTotal, { color: accent }]} numberOfLines={1}>
                      {total}
                      <Text style={[s.jarUnit, { color: k.textMuted }]}> coins</Text>
                    </Text>
                  </Well>
                );
              })}
            </View>
            <ActionButton
              label="Open reward store" accent={k.primary} k={k} isDark={isDark}
              onPress={() => onNavigate('store')}
              style={{ marginTop: KIOSK_SPACE.sm }}
              accessibilityHint="See perks the kids can spend coins on"
            />
          </WidgetCard>
        )}

        {/* ── Grocery snapshot ── */}
        <WidgetCard k={k} isDark={isDark} style={s.widget}>
          <WidgetHeader
            Icon={ShoppingCart} eyebrow="Kitchen" title="Grocery list"
            accent={k.sage} k={k} isDark={isDark}
            right={groceryItems.length > 0
              ? <Chip label={`${groceryItems.length}`} accent={k.sage} isDark={isDark} k={k} />
              : undefined}
          />
          {groceryItems.length === 0 ? (
            <EmptyNote text="The grocery list is empty." k={k} />
          ) : (
            <View style={{ gap: KIOSK_SPACE.xs }}>
              {groceryItems.slice(0, 4).map(it => (
                <View key={it.id} style={s.groceryLine}>
                  <View style={[s.groceryDot, { backgroundColor: k.sage }]} />
                  <Text style={[s.groceryName, { color: k.text }]} numberOfLines={1}>{it.name}</Text>
                  {!!it.quantity && (
                    <Text style={[s.groceryQty, { color: k.textFaint }]} numberOfLines={1}>{it.quantity}</Text>
                  )}
                </View>
              ))}
              {groceryItems.length > 4 && (
                <Text style={[s.groceryMore, { color: k.textFaint }]} numberOfLines={1}>
                  and {groceryItems.length - 4} more
                </Text>
              )}
            </View>
          )}
          <ActionButton
            label="Open list" accent={k.sage} k={k} isDark={isDark}
            onPress={() => onNavigate('meals')}
            style={{ marginTop: KIOSK_SPACE.sm }}
            accessibilityHint="Open the meals and grocery screen"
          />
        </WidgetCard>

        {/* ── Kept: the photo frame ──
            The mockup's photo-frame widget, deferred by the prior pass and
            picked up here. Every frame is a real `family_memories` row via
            useKioskPhotos — there is no stock image anywhere in this path,
            and a household with no photos yet gets a clean empty state
            rather than a stranger's stock family on its kitchen wall.
            The compact form: shorter frame, no counter chip. It advances
            on its own without ever reporting that as kiosk activity, so a
            rotating frame still lets the idle lock fire. */}
        <KioskMemorySlideshow compact height={200} style={s.widget} />
      </View>

      {/* ══ FINDFAM RADAR STRIP ═══════════════════════════════════════ */}
      <RadarStrip
        members={members} k={k} isDark={isDark}
        onOpen={() => onNavigate('findfam')}
      />
    </ScrollView>
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

function mealMeta(
  prep: number | null | undefined,
  chefId: string | null | undefined,
  members: FamilyMember[],
  startTime: string | null | undefined,
): string {
  const chef = members.find(m => m.id === chefId)?.name?.trim().split(' ')[0];
  const bits = [
    startTime || null,
    prep ? `${prep} min prep` : null,
    chef ? `Chef: ${chef}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'Tap Meals to add details';
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
      <Icon size={22} color={accent} />
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
function RadarStrip({ members, k, isDark, onOpen }: {
  members: FamilyMember[]; k: KioskColors; isDark: boolean; onOpen: () => void;
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
    <WidgetCard k={k} isDark={isDark} style={{ marginTop: KIOSK_SPACE.md }}>
      <WidgetHeader
        Icon={MapPin} eyebrow="FindFam" title="Where everyone is"
        accent={k.sage} k={k} isDark={isDark}
        right={
          <Pressable
            onPress={onOpen} hitSlop={10}
            accessibilityRole="button" accessibilityLabel="Open the map"
            accessibilityHint="See everyone on the family map"
          >
            <Chip
              label={`${sharing}/${visible.length} sharing`}
              accent={sharing > 0 ? k.sage : k.textFaint}
              isDark={isDark} k={k}
            />
          </Pressable>
        }
      />
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
            <Well key={m.id} k={k} style={s.radarCell}>
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
                  <BatteryLow size={15} color={k.danger} />
                  <Text style={[s.radarBatteryText, { color: k.danger }]} numberOfLines={1}>
                    {loc!.battery_level}%
                  </Text>
                </View>
              )}
            </Well>
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
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  hero: { flexGrow: 3, flexBasis: 460, minWidth: 0 },
  heroSide: { flexGrow: 1, flexBasis: 280, minWidth: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: KIOSK_SPACE.sm },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 0.6 },
  heroTitle: { fontSize: KIOSK_TYPO.hero, fontWeight: '800', letterSpacing: -0.8, marginTop: KIOSK_SPACE.md },
  heroSub: { fontSize: KIOSK_TYPO.body, fontWeight: '600', marginTop: 4 },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.lg },
  quick: {
    flexGrow: 1, flexBasis: 110, minWidth: 0,
    minHeight: 76, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.xs,
    paddingHorizontal: KIOSK_SPACE.sm,
  },
  quickLabel: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  quickBadge: {
    position: 'absolute', top: 6, right: 8, minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  quickBadgeText: { fontSize: KIOSK_TYPO.micro, fontWeight: '900' },

  mealEmoji: { fontSize: 34 },
  mealTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', marginTop: KIOSK_SPACE.xs, letterSpacing: -0.3 },
  mealMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 4 },
  mealEmpty: {
    flex: 1, minHeight: 130, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: KIOSK_SPACE.sm, padding: KIOSK_SPACE.md,
  },

  // Widget deck.
  deck: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  widget: { flexGrow: 1, flexBasis: 320, minWidth: 0 },

  rideTop: { flexDirection: 'row', alignItems: 'flex-start', gap: KIOSK_SPACE.sm },
  rideTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  rideMeta: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 3 },
  rideActions: { flexDirection: 'row', gap: KIOSK_SPACE.sm, marginTop: KIOSK_SPACE.sm },
  rideNote: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', marginTop: KIOSK_SPACE.xs },

  jarRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, paddingVertical: KIOSK_SPACE.sm },
  jarAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  jarEmoji: { fontSize: 20 },
  jarName: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  jarSplit: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', marginTop: 2 },
  jarTotal: { fontSize: KIOSK_TYPO.heading, fontWeight: '900', fontVariant: ['tabular-nums'] },
  jarUnit: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },

  groceryLine: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, minHeight: 26 },
  groceryDot: { width: 6, height: 6, borderRadius: 3 },
  groceryName: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  groceryQty: { fontSize: KIOSK_TYPO.caption, fontWeight: '700' },
  groceryMore: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 2 },

  radarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  radarCell: {
    flexGrow: 1, flexBasis: 220, minWidth: 0,
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
