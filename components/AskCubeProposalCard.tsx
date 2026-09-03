/**
 * AskCubeProposalCard — type-specific confirm cards for Ask Cube's inline
 * proposals (event / quest / grocery / meal). Each kind gets its own
 * layout instead of one generic title+date card, since the fields and
 * "what am I confirming" mental model differ a lot per type (a grocery
 * proposal is a list of items, a meal is a recipe-style hero, etc).
 */
import { useState } from 'react';
import { View, Text, Pressable, Image, TextInput } from 'react-native';
import { Calendar, ClipboardList, ShoppingCart, ChefHat, Coins, Clock, User, Camera, X, Repeat, Store, Trash2, Users } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import type { AskCubeProposal } from '@/lib/askCubeService';
import type { FamilyMember } from '@/store/familyStore';
import { useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { fmtDate, fmtTime } from '@/lib/dates';
import { DueDateTimePicker } from '@/features/tasks/components/forms/DueDateTimePicker';
import { RADIUS } from '@/constants/theme';

// Shared hero for meal cards/sheets — a real dish photo when the model gave
// one (Wikimedia Commons only, enforced server-side), falling back to the
// large emoji treatment if there's no URL or the image fails to load.
export function MealHero({ imageUrl, emoji, accent, height }: { imageUrl?: string | null; emoji?: string | null; accent: string; height: number }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      <Image source={{ uri: imageUrl }} onError={() => setFailed(true)}
        style={{ height, width: '100%', backgroundColor: accent + '18' }} resizeMode="cover" />
    );
  }
  return (
    <View style={{ height, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: height * 0.55 }}>{emoji || '🍽️'}</Text>
    </View>
  );
}

const KIND_META: Record<AskCubeProposal['kind'], { label: string; icon: any; accent: string }> = {
  event:        { label: 'Event draft',      icon: Calendar,      accent: 'primary' },
  quest:        { label: 'Quest draft',      icon: ClipboardList, accent: 'kid' },
  grocery:      { label: 'Grocery draft',    icon: ShoppingCart,  accent: 'teal' },
  meal:         { label: 'Meal draft',       icon: ChefHat,       accent: 'danger' },
  update_event: { label: 'Update draft',     icon: Clock,         accent: 'primary' },
  update_chore: { label: 'Update draft',     icon: Clock,         accent: 'kid' },
  redemption:   { label: 'Redemption draft', icon: Coins,         accent: 'amber' },
  chore_action: { label: 'Action draft',     icon: ClipboardList, accent: 'kid' },
  cancel_event: { label: 'Cancel draft',     icon: Trash2,        accent: 'danger' },
};

// Plain-English label per action kind — shown as the card's main line
// instead of a generic "Update" verb, since each one reads very differently
// ("Claim" vs "Approve" vs "Cancel").
const CHORE_ACTION_LABEL: Record<string, string> = {
  claim: 'Claim',
  approve: 'Approve',
  decline: 'Decline',
  complete: 'Mark complete',
  cancel: 'Cancel',
};

// Human-readable label per changeable field, shared by both update_event and
// update_chore cards — keeps "what's actually changing" legible regardless
// of which fields happen to be present, instead of a raw key/value dump.
const CHANGE_FIELD_LABEL: Record<string, string> = {
  title: 'Title',
  date: 'Date',
  time: 'Time',
  dueDate: 'Due date',
  dueTime: 'Due time',
  notes: 'Note',
  description: 'Note',
  coinsReward: 'Coins',
  alertCallLeadMinutes: 'Reminder',
};

function formatChangeValue(field: string, value: any): string {
  if (field === 'alertCallLeadMinutes') return value === 0 ? 'On time' : `${value} min before`;
  if (field === 'coinsReward') return `${value} coins`;
  // dueDate/date are YYYY-MM-DD; dueTime/time are 24h "HH:MM" — both come
  // straight from the model's tool-call args, so they need the same
  // app-wide display formatting every other date/time field in the app
  // uses (fmtDate → "Aug 27, 2026", fmtTime → "9:00 PM"), not the raw
  // machine-readable string.
  if (field === 'dueDate' || field === 'date') return fmtDate(value, String(value));
  if (field === 'dueTime' || field === 'time') return fmtTime(value, String(value));
  return String(value);
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The reply text could already say "recurring every Thursday" while the
// card itself showed only a single date with nothing marking it as
// repeating — a user has no way to confirm from the card alone (the thing
// they're actually about to confirm) that it's really a series, not a
// one-off, without just trusting the chat text.
function formatRecurrence(rule: { frequency?: string; days?: number[] } | null | undefined): string | null {
  if (!rule?.frequency) return null;
  if (rule.frequency === 'daily') return 'Repeats daily';
  if (rule.frequency === 'monthly') return 'Repeats monthly';
  if (rule.frequency === 'weekly') {
    const days = (rule.days ?? []).map(d => WEEKDAY_SHORT[d]).filter(Boolean);
    return days.length ? `Repeats weekly on ${days.join(', ')}` : 'Repeats weekly';
  }
  return null;
}

function memberName(members: FamilyMember[], id?: string | null) {
  return id ? members.find(m => m.id === id)?.name : undefined;
}

// Matches the manual Add Event/Chore forms' own lead-time picker exactly
// (EventFormModal.tsx/AddQuestModal.tsx/EditQuestModal.tsx) — same 4
// options everywhere a reminder can be set, so there's no behavior
// difference between typing an event manually and asking Cube for one.
const REMINDER_LEAD_OPTIONS = [0, 10, 15, 30];

// The reminder chip was previously read-only — showing whatever lead time
// the AI happened to pick with no way to adjust it before confirming.
// Renders as a row of tappable pills when onChange is provided (a still-
// pending proposal), or falls back to the old plain-text chip otherwise
// (e.g. inside a compact/already-decided card that never gets this prop).
function ReminderPicker({ leadMinutes, hasReminder, accent, colors, onChange }: {
  leadMinutes?: number | null; hasReminder?: boolean; accent: string; colors: any; onChange?: (mins: number) => void;
}) {
  if (!onChange) {
    // Editing isn't available here (no onChangeReminder passed) — fall back
    // to the old read-only chip, and only show it at all if a reminder was
    // actually set, same as before this feature existed.
    if (!hasReminder) return null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Clock size={12} color={colors.textSecondary} />
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
          📞 {leadMinutes ? `${leadMinutes} min before` : 'On time'}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Clock size={12} color={colors.textSecondary} />
      {REMINDER_LEAD_OPTIONS.map(mins => {
        const active = (leadMinutes ?? 0) === mins;
        return (
          <Pressable key={mins} onPress={() => onChange(mins)}
            style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
              backgroundColor: active ? accent + '20' : 'transparent',
              borderWidth: 1, borderColor: active ? accent : colors.border }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: active ? accent : colors.textSecondary }}>
              {mins === 0 ? 'On time' : `${mins}m`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Turns a "date and time" edit on a proposal card from "discard and re-ask
// Cube in plain English" into a direct tap — reuses the exact same native
// spinner picker the manual Add/Edit Quest and Add Event forms use
// (DueDateTimePicker), so adjusting a date Cube got slightly wrong feels
// identical to editing it anywhere else in the app, with zero extra AI
// round-trip. Only rendered when the caller supplies onChange (a still-
// pending proposal) — same opt-in pattern as ReminderPicker/StorePicker.
export function DateTimeEditRow({ dateStr, timeStr, accent, colors, isDark, onChange }: {
  dateStr?: string | null; timeStr?: string | null;
  accent: string; colors: any; isDark: boolean;
  onChange?: (next: { date: string; time?: string }) => void;
}) {
  const [showDatePick, setShowDatePick] = useState(false);
  const [showTimePick, setShowTimePick] = useState(false);

  if (!onChange) {
    // Read-only fallback (e.g. an already-decided/discarded card) — plain
    // text, no picker affordance.
    if (!dateStr) return null;
    return (
      <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
        {fmtDate(dateStr, dateStr)}{timeStr ? ` · ${fmtTime(timeStr, timeStr)}` : ''}
      </Text>
    );
  }

  // DueDateTimePicker owns one Date object covering both fields — parse the
  // separate dateStr ("YYYY-MM-DD")/timeStr ("HH:MM") props into it, and
  // split the merged Date back into those same two string shapes on change
  // (matching exactly what propose_update/propose_event/propose_quest's own
  // dueDate/dueTime or date/time fields expect).
  const [y, m, d] = (dateStr ?? new Date().toISOString().slice(0, 10)).split('-').map(Number);
  const [hh, mm] = (timeStr ?? '09:00').split(':').map(Number);
  const asDate = new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1, hh || 9, mm || 0);

  const setValue: React.Dispatch<React.SetStateAction<Date>> = (updater) => {
    const next = typeof updater === 'function' ? (updater as (prev: Date) => Date)(asDate) : updater;
    const pad = (n: number) => String(n).padStart(2, '0');
    onChange({
      date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
      time: `${pad(next.getHours())}:${pad(next.getMinutes())}`,
    });
  };

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <DueDateTimePicker
        value={asDate}
        setValue={setValue}
        showDatePick={showDatePick} setShowDatePick={setShowDatePick}
        showTimePick={showTimePick} setShowTimePick={setShowTimePick}
        fmtDateLabel={(dt) => fmtDate(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)}
        fmtTimeLabel={(dt) => fmtTime(`${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`)}
        accentColor={accent} colors={colors} isDark={isDark}
        label=""
        pillStyle={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}
        overlayStyle={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 20 }}
        cardStyle={{ borderRadius: RADIUS.lg, overflow: 'hidden', paddingBottom: 12 }}
      />
    </View>
  );
}

// Lets the user pick an existing store (past runs + this item's own
// storePreference field + the app's default list) or type a new one for a
// still-pending grocery proposal's whole item batch — reuses the same two
// data sources AddItemSheet's own store field pulls from (pastStores +
// DEFAULT_GROCERY_STORES), just rendered as tappable chips instead of a
// suggestions dropdown since this card is a compact chat bubble, not a form.
function StorePicker({ store, accent, colors, onChange }: {
  store?: string | null; accent: string; colors: any; onChange: (store: string) => void;
}) {
  const pastStores = useGroceryStore(s => s.pastStores);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState(store ?? '');
  const options = [...new Set([...pastStores, ...DEFAULT_GROCERY_STORES])].slice(0, 6);

  if (typing) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Store size={12} color={colors.textSecondary} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Store name"
          placeholderTextColor={colors.textTertiary}
          autoFocus
          onBlur={() => { setTyping(false); onChange(text.trim()); }}
          onSubmitEditing={() => { setTyping(false); onChange(text.trim()); }}
          style={{ flex: 1, fontSize: TYPO.label, color: colors.textPrimary, paddingVertical: 2 }}
        />
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Store size={12} color={colors.textSecondary} />
      {options.map(s => {
        const active = store === s;
        return (
          <Pressable key={s} onPress={() => onChange(active ? '' : s)}
            style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
              backgroundColor: active ? accent + '20' : 'transparent',
              borderWidth: 1, borderColor: active ? accent : colors.border }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: active ? accent : colors.textSecondary }}>{s}</Text>
          </Pressable>
        );
      })}
      <Pressable onPress={() => { setText(store ?? ''); setTyping(true); }}
        style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
        <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textSecondary }}>
          {store && !options.includes(store) ? store : 'Other…'}
        </Text>
      </Pressable>
    </View>
  );
}

export default function AskCubeProposalCard({
  proposal, members, onDiscard, onCreate, onExpand, compact, onChangeReminder, onChangeStore, onChangeDateTime, added, discarded,
}: {
  proposal: AskCubeProposal;
  members: FamilyMember[];
  onDiscard: () => void;
  onCreate: () => void;
  onExpand?: () => void;
  // Tight grid layout — used when several meal options are shown side by
  // side (2 per row) instead of stacked full-width, so picking between
  // options doesn't mean scrolling through 3 tall cards in a row.
  compact?: boolean;
  // Lets the reminder chip become an editable picker instead of read-only
  // display — omitted entirely for proposal kinds with no reminder concept
  // (grocery/meal), so those never render a picker.
  onChangeReminder?: (leadMinutes: number) => void;
  // Lets the grocery card's store row become an editable picker — same
  // pending-proposal-in-place-edit pattern as onChangeReminder, only ever
  // passed for proposal.kind === 'grocery'.
  onChangeStore?: (store: string) => void;
  // Lets the date/due-date and time/due-time row become a tappable native
  // picker instead of read-only text — same in-place-edit pattern as
  // onChangeReminder/onChangeStore, for quest/event/update_chore/
  // update_event proposals. Skips a whole extra chat round-trip when the
  // AI's guessed date/time just needs a small correction.
  onChangeDateTime?: (next: { date: string; time?: string }) => void;
  // Once accepted, the card previously vanished entirely — replaced by a
  // single bare "✓ Title" text line, which read as the meal/event itself
  // disappearing rather than a confirmation (user-reported: "it just
  // briefly disappears"). Keep rendering the full card (photo, prep time,
  // recipe) with a checkmark instead of the discard/create actions.
  added?: boolean;
  // Same treatment as `added`, for the opposite outcome — a discarded
  // proposal previously collapsed to a single italic text line ("Title —
  // discarded"), losing all the detail the user was just looking at. Keep
  // the full card visible but grayed out and non-interactive, with a
  // "Discarded" pill in place of the action buttons, matching the pattern
  // `added` already established for the confirm path.
  discarded?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const meta = KIND_META[proposal.kind];
  const accent = (colors as any)[meta.accent] ?? colors.primary;
  const Icon = meta.icon;
  const d = proposal.data;

  if (compact && proposal.kind === 'meal') {
    return (
      <View style={{ backgroundColor: colors.card, borderRadius: 14,
        borderWidth: 1.5, borderColor: (added ? colors.success : accent) + '40', overflow: 'hidden',
        opacity: added ? 0.85 : 1 }}>
        <Pressable onPress={onExpand} disabled={!onExpand}>
          <MealHero imageUrl={d.imageUrl} emoji={d.emoji} accent={accent} height={72} />
          {added ? (
            <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
              backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>✓</Text>
            </View>
          ) : (
            <Pressable onPress={onDiscard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
                backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={12} color="#fff" />
            </Pressable>
          )}
        </Pressable>
        <Pressable onPress={onExpand} disabled={!onExpand} style={{ padding: 10, gap: 4 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>{d.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!!d.prepMinutes && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Clock size={10} color={accent} />
                <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: accent }}>{d.prepMinutes}m</Text>
              </View>
            )}
            <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }} numberOfLines={1}>
              {d.day}{d.mealType ? ` · ${d.mealType}` : ''}
            </Text>
          </View>
        </Pressable>
        <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
          {added ? (
            <View style={{ borderRadius: 8, paddingVertical: 7, alignItems: 'center', backgroundColor: colors.successLight }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.success }}>✓ Added</Text>
            </View>
          ) : (
            <Pressable onPress={onCreate}
              style={{ borderRadius: 8, paddingVertical: 7, alignItems: 'center', backgroundColor: accent }}>
              <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: '#fff' }}>Pick this</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const Header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon size={14} color={accent} />
      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {meta.label}
      </Text>
    </View>
  );

  const Actions = added ? (
    <View style={{ borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.successLight, marginTop: 4 }}>
      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.success }}>✓ Added</Text>
    </View>
  ) : discarded ? (
    <View style={{ borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.surface, marginTop: 4 }}>
      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary }}>Discarded</Text>
    </View>
  ) : (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
      <Pressable onPress={onDiscard}
        style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>Discard</Text>
      </Pressable>
      <Pressable onPress={onCreate}
        style={{ flex: 2, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: accent }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>
          {proposal.kind === 'grocery' ? `Add ${d.items?.length ?? ''} item${d.items?.length === 1 ? '' : 's'}`
            : (proposal.kind === 'update_event' || proposal.kind === 'update_chore') ? 'Confirm update'
            : proposal.kind === 'redemption' ? 'Redeem'
            : proposal.kind === 'chore_action' ? (CHORE_ACTION_LABEL[d.action] ?? 'Confirm')
            : proposal.kind === 'cancel_event' ? 'Cancel event'
            : 'Create'}
        </Text>
      </Pressable>
    </View>
  );

  // Discarded cards render fully (same detail as a live proposal) but dimmed
  // and non-interactive — matches `added`'s "keep showing the real card"
  // precedent instead of collapsing to a bare text line, which lost all the
  // detail the user was just reviewing and read as the item vanishing
  // outright rather than a recorded decision.
  const cardBase = {
    marginTop: 8, maxWidth: '90%' as const, backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1.5, borderColor: (discarded ? colors.border : accent + '40'), padding: 14, gap: 8,
    opacity: discarded ? 0.55 : 1,
  };
  // Was discarded-only — an ADDED card's date/time picker and lead-time
  // chips stayed fully interactive after confirmation, letting the user
  // edit a proposal that had already been acted on (live-reported: the
  // "✓ Added" checkmark showed, but the New date/On time/10m/15m/30m
  // controls above it were still tappable). Both terminal states
  // (created and discarded) are decisions already recorded — neither
  // should still accept edits, matching this file's own established
  // "added gets the same treatment as discarded" pattern everywhere else
  // in this card.
  const cardPointerEvents = (discarded || added) ? ('none' as const) : undefined;

  if (proposal.kind === 'meal') {
    const chef = memberName(members, d.chefId);
    return (
      <View style={{ marginTop: 8, maxWidth: '90%', backgroundColor: colors.card,
        borderRadius: 16, borderWidth: 1.5, borderColor: accent + '40', overflow: 'hidden' }}>
        {/* Real dish photo when the model supplied one, else the emoji hero.
            The whole card (not just the hero band) opens the recipe detail
            sheet — a bigger, more obvious tap target than the image alone. */}
        <Pressable onPress={onExpand} disabled={!onExpand}>
          <MealHero imageUrl={d.imageUrl} emoji={d.emoji} accent={accent} height={110} />
        </Pressable>
        <Pressable onPress={onExpand} disabled={!onExpand} style={{ padding: 14, gap: 8 }}>
          {Header}
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }} numberOfLines={2}>{d.title}</Text>
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: -4 }}>
            {d.day}{d.mealType ? ` · ${d.mealType}` : ''} · tap to view recipe
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {!!d.prepMinutes && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: accent + '14',
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Clock size={12} color={accent} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: accent }}>{d.prepMinutes} min</Text>
              </View>
            )}
            {!!chef && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <User size={12} color={colors.textSecondary} />
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{chef} cooking</Text>
              </View>
            )}
          </View>
          {!!d.ingredients?.length && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {d.ingredients.slice(0, 6).map((ing: string, i: number) => (
                <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: TYPO.micro, color: colors.textSecondary }}>{ing}</Text>
                </View>
              ))}
            </View>
          )}
        </Pressable>
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          {Actions}
        </View>
      </View>
    );
  }

  if (proposal.kind === 'grocery') {
    const items: { name: string; quantity?: string; category?: string; store?: string | null }[] = d.items ?? [];
    // Only shown when no item already carries its own explicit store (the
    // model only ever fills that in when the user named one per-item) — a
    // batch picker for a per-item field would be misleading otherwise.
    const anyItemHasStore = items.some(it => !!it.store);
    return (
      <View style={cardBase} pointerEvents={cardPointerEvents}>
        {Header}
        <View style={{ gap: 6 }}>
          {items.slice(0, 8).map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                {it.name}
              </Text>
              {!!it.store && (
                <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{it.store}</Text>
              )}
              {!!it.quantity && (
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{it.quantity}</Text>
              )}
            </View>
          ))}
        </View>
        {!anyItemHasStore && onChangeStore && (
          <StorePicker store={d.store} accent={accent} colors={colors} onChange={onChangeStore} />
        )}
        {Actions}
      </View>
    );
  }

  if (proposal.kind === 'quest') {
    const assignee = memberName(members, d.memberId);
    const assignedToAdult = !!d.memberId && members.find(m => m.id === d.memberId)?.role === 'parent';
    return (
      <View style={cardBase} pointerEvents={cardPointerEvents}>
        {Header}
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{d.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {!assignedToAdult && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Coins size={12} color={accent} />
              <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: accent }}>{d.coins ?? 20} coins</Text>
            </View>
          )}
          {!!assignee && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <User size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{assignee}</Text>
            </View>
          )}
          {!!d.dueDate && (
            <DateTimeEditRow dateStr={d.dueDate} timeStr={d.dueTime} accent={accent} colors={colors} isDark={isDark} onChange={onChangeDateTime} />
          )}
          {!!d.photoRequired && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Camera size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Photo required</Text>
            </View>
          )}
          {!!formatRecurrence(d.recurrenceRule) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Repeat size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{formatRecurrence(d.recurrenceRule)}</Text>
            </View>
          )}
        </View>
        <ReminderPicker leadMinutes={d.alertCallLeadMinutes} hasReminder={!!d.alertCall} accent={accent} colors={colors} onChange={onChangeReminder} />
        {Actions}
      </View>
    );
  }

  if (proposal.kind === 'chore_action') {
    const actionColors: Record<string, string> = {
      claim: colors.kid, approve: colors.success, decline: colors.danger,
      complete: colors.success, cancel: colors.danger,
    };
    const actionColor = actionColors[d.action] ?? accent;
    return (
      <View style={cardBase} pointerEvents={cardPointerEvents}>
        {Header}
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{d.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ backgroundColor: actionColor + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: actionColor, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {CHORE_ACTION_LABEL[d.action] ?? d.action}
            </Text>
          </View>
          {!!d.status && (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>currently {d.status.replace(/_/g, ' ')}</Text>
          )}
        </View>
        {!!d.reason && (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>"{d.reason}"</Text>
        )}
        {Actions}
      </View>
    );
  }

  if (proposal.kind === 'cancel_event') {
    return (
      <View style={cardBase} pointerEvents={cardPointerEvents}>
        {Header}
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{d.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {!!d.date && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Calendar size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{fmtDate(d.date)}</Text>
            </View>
          )}
          {!!d.time && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{fmtTime(d.time)}</Text>
            </View>
          )}
        </View>
        <View style={{ backgroundColor: colors.danger + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: colors.danger, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Cancel this event
          </Text>
        </View>
        {!!d.reason && (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontStyle: 'italic' }}>"{d.reason}"</Text>
        )}
        {Actions}
      </View>
    );
  }

  if (proposal.kind === 'redemption') {
    const redeemerName = memberName(members, d.memberId) ?? d.memberAlias;
    const balanceAfter = typeof d.currentBalance === 'number' ? d.currentBalance - d.cost : null;
    return (
      <View style={cardBase} pointerEvents={cardPointerEvents}>
        {Header}
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{d.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Coins size={12} color={accent} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: accent }}>{d.cost} coins</Text>
          </View>
          {!!redeemerName && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <User size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{redeemerName}</Text>
            </View>
          )}
        </View>
        {balanceAfter != null && (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>
            {d.currentBalance} coins now → {balanceAfter} after redeeming
          </Text>
        )}
        {Actions}
      </View>
    );
  }

  if (proposal.kind === 'update_event' || proposal.kind === 'update_chore') {
    const changes: Record<string, any> = d.changes ?? {};
    const isChore = proposal.kind === 'update_chore';
    // Date/time get pulled out of the generic key-value list and rendered
    // as one interactive DateTimeEditRow instead — same "give the user a
    // real picker, not another AI round-trip" treatment as the plain quest/
    // event cards get, just adapted to this card's field-pair naming
    // (dueDate/dueTime for chores, date/time for events).
    const dateField = isChore ? 'dueDate' : 'date';
    const timeField = isChore ? 'dueTime' : 'time';
    const hasDateTimeChange = dateField in changes;
    const changeEntries = Object.entries(changes).filter(([k]) => k !== 'alertCall' && k !== 'alertCallLeadMinutes' && k !== dateField && k !== timeField);
    return (
      <View style={cardBase} pointerEvents={cardPointerEvents}>
        {Header}
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{d.title}</Text>
        {!isChore && !!d.date && (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: -4 }}>
            Currently {new Date(`${d.date}T${d.time ?? '00:00'}`).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </Text>
        )}
        {isChore && !!d.currentDueDate && (
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: -4 }}>
            Currently due {fmtDate(d.currentDueDate, d.currentDueDate)}{d.currentDueTime ? ` · ${fmtTime(d.currentDueTime, d.currentDueTime)}` : ''}
          </Text>
        )}
        {hasDateTimeChange && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>
              {isChore ? 'New due date:' : 'New date:'}
            </Text>
            <DateTimeEditRow
              dateStr={changes[dateField]} timeStr={changes[timeField]}
              accent={accent} colors={colors} isDark={isDark}
              onChange={onChangeDateTime}
            />
          </View>
        )}
        {!!changeEntries.length && (
          <View style={{ gap: 6 }}>
            {changeEntries.map(([field, value]) => (
              <View key={field} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary }}>
                  {CHANGE_FIELD_LABEL[field] ?? field}:
                </Text>
                <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '600', color: colors.textPrimary }} numberOfLines={2}>
                  {formatChangeValue(field, value)}
                </Text>
              </View>
            ))}
          </View>
        )}
        <ReminderPicker leadMinutes={changes.alertCallLeadMinutes} hasReminder={!!changes.alertCall} accent={accent} colors={colors} onChange={onChangeReminder} />
        {Actions}
      </View>
    );
  }

  // event
  const assignee = memberName(members, d.memberId);
  // startAt is a plain local-wall-clock ISO string with no "Z"/offset (see
  // propose_event's own tool description) — `new Date(...)` here parses it
  // via the device's local getters, same as createProposal's own comment
  // on this exact field. DateTimeEditRow wants separate date/time strings
  // (matching quest/update_event's own dueDate+dueTime / date+time pairs),
  // so split startAt into those two shapes purely for the picker; onChange
  // recombines them back into one startAt string (updateProposalDateTime's
  // existing 'event' branch already does this).
  let startAtDate: string | undefined;
  let startAtTime: string | undefined;
  if (d.startAt) {
    const dt = new Date(d.startAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    startAtDate = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    startAtTime = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }
  return (
    <View style={cardBase} pointerEvents={cardPointerEvents}>
      {Header}
      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>{d.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {!!startAtDate && (
          <DateTimeEditRow dateStr={startAtDate} timeStr={startAtTime} accent={accent} colors={colors} isDark={isDark} onChange={onChangeDateTime} />
        )}
        {!!assignee && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <User size={12} color={colors.textSecondary} />
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{assignee}</Text>
          </View>
        )}
        {!!d.category && (
          <View style={{ backgroundColor: accent + '16', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: accent }}>{d.category}</Text>
          </View>
        )}
        {!!formatRecurrence(d.recurrenceRule) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Repeat size={12} color={colors.textSecondary} />
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>{formatRecurrence(d.recurrenceRule)}</Text>
          </View>
        )}
      </View>
      {/* A second named person ("accompanied by X", "X is driving/helping")
          — shown here so the user can see the real assignment being made
          before confirming, not just discover it after the fact. Was
          previously invisible on this card entirely since the field didn't
          exist (see helperName's own comment in ask-cube/index.ts). */}
      {!!d.helperName && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Users size={12} color={colors.textSecondary} />
          <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>with {d.helperName}</Text>
        </View>
      )}
      {!!d._unresolvedHelperName && (
        <Text style={{ fontSize: TYPO.micro, color: colors.danger }}>
          Couldn't find "{d._unresolvedHelperName}" — no helper assigned
        </Text>
      )}
      <ReminderPicker leadMinutes={d.alertCallLeadMinutes} hasReminder={!!d.alertCall} accent={accent} colors={colors} onChange={onChangeReminder} />
      {Actions}
    </View>
  );
}
