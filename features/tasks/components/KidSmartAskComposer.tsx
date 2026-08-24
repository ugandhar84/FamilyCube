/**
 * KidSmartAskComposer — a Kid's "just describe it" entry point, sibling to
 * SmartTaskComposer but NOT a fork of it. It free-text-detects (or lets the
 * kid tap) a category from a short description, then routes:
 *
 *   - Ride     → stays INLINE (this component's own pickup/dropoff fields,
 *                writes useEventStore().addEvent(...) with
 *                approvalPending:true, same shape KidRequestModal.tsx
 *                already writes) — the one category with real structured
 *                data worth extracting from free text.
 *   - Chore    → stays INLINE (recipient picker + supabase.rpc
 *                ('propose_kid_chore', ...)) — the one genuinely new
 *                capability, gated to kid/teen recipients only (server also
 *                rejects a parent target). No coins field anywhere here — a
 *                parent sets the real reward at approval time
 *                (KidProposedChoreCard.tsx).
 *   - Grocery/Supplies → hands off to the real GroceryModal/SuppliesModal
 *                (KidModals.tsx) — multi-item entry with always-visible
 *                smart suggestion chips.
 *   - Birthday → hands off to KidRequestModal.tsx's own category grid
 *                (already covers Birthday as one of its cards).
 *   - Tutor/Permission/Question/Medication → hands off to AskModal
 *                (KidModals.tsx) — a short free-text sentence ("Do I need
 *                to go to the park?") genuinely can't be reliably
 *                classified between these by keyword scoring the way Ride
 *                (has locations/times) or Chore (has an imperative verb)
 *                can; rather than guess wrong, the composer's job for these
 *                is just picking which dedicated ask-form to open, not
 *                submitting on their behalf.
 *
 * This directly replaces AskParentSheet's manual 6-button chooser for Kid
 * (removed from KidView.tsx in the same change) — every category it offered
 * is covered here, plus free-text/voice category detection and the new
 * Chore option.
 */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, Keyboard, Alert } from 'react-native';
import {
  Mic, Sparkles, X, Car, Cake, BookOpen, ShoppingCart, Backpack,
  Unlock, HelpCircle, Pill, ClipboardList,
} from 'lucide-react-native';
import AppBottomSheet from '@/components/AppBottomSheet';
import { TYPO, RADIUS, SPACING } from '@/constants/theme';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { detectLocalTask, type LocalDetectionResult } from '../lib/localTaskDetection';
import { useEventStore } from '@/store/eventStore';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';
import { GroceryModal, SuppliesModal, AskModal } from '@/features/hub/KidModals';
import { KidRequestModal } from '@/features/calendar/KidRequestModal';

const MIN_CHARS = 4;

type AskCategory = 'ride' | 'birthday' | 'tutor' | 'grocery' | 'supplies' | 'permission' | 'question' | 'medication' | 'chore';

const CATEGORY_CHIPS: { key: AskCategory; label: string; emoji: string; Icon: any; color: string }[] = [
  { key: 'ride',        label: 'Ride',        emoji: '🚗', Icon: Car,          color: '#F59E0B' },
  { key: 'birthday',    label: 'Birthday',    emoji: '🎂', Icon: Cake,         color: '#F59E0B' },
  { key: 'tutor',       label: 'Tutor',       emoji: '🎒', Icon: BookOpen,     color: '#6366F1' },
  { key: 'grocery',     label: 'Grocery',     emoji: '🛒', Icon: ShoppingCart, color: '#00BBA4' },
  { key: 'supplies',    label: 'Supplies',    emoji: '📚', Icon: Backpack,     color: '#6366F1' },
  { key: 'permission',  label: 'Permission',  emoji: '🔓', Icon: Unlock,       color: '#9261C7' },
  { key: 'question',    label: 'Question',    emoji: '❓', Icon: HelpCircle,   color: '#3B82F6' },
  { key: 'medication',  label: 'Medication',  emoji: '💊', Icon: Pill,         color: '#EF4444' },
  { key: 'chore',       label: 'Chore',       emoji: '✅', Icon: ClipboardList, color: '#9261C7' },
];

// A literal question ("Do/Can/Should/Am I ...?", or just ending in "?")
// reads as a QUEST_VERB_RE imperative to localTaskDetection.ts (e.g. "Do I
// NEED TO go to the park?" hits its "need to" to-do phrase) and gets
// classified quest-kind, which guessCategory below would otherwise turn
// into a wrongly-guessed Chore. Checked first, ahead of the quest-kind
// fallback, so a plain question never gets offered as a chore proposal.
const QUESTION_PHRASING_RE = /^(?:do|does|did|can|could|should|would|will|may|am|is|are|was|were)\b.*\?\s*$|\?\s*$/i;

// Best-effort local-detection → AskCategory guess, purely a starting
// suggestion the kid can always override with a chip tap below.
function guessCategory(d: LocalDetectionResult | null, rawInput: string): AskCategory | null {
  if (!d) return null;
  const key = d.category.key?.toLowerCase() ?? '';
  const label = d.category.label?.toLowerCase() ?? '';
  const eventCat = d.category.kind === 'event' ? d.category.eventCategory : undefined;
  if (eventCat === 'Ride') return 'ride';
  if (eventCat === 'Birthday') return 'birthday';
  if (eventCat === 'Study' || /tutor|homework|study/.test(key + label)) return 'tutor';
  if (/grocery|groceries/.test(key + label)) return 'grocery';
  if (/supplies|school supply/.test(key + label)) return 'supplies';
  if (/permission/.test(key + label)) return 'permission';
  if (/medication|medicine/.test(key + label)) return 'medication';
  if (QUESTION_PHRASING_RE.test(rawInput.trim())) return 'question';
  // A plain chore-sounding sentence (quest-kind local detection, not an
  // event) — offer the new sibling-chore path rather than guessing wrong.
  if (d.category.kind === 'quest') return 'chore';
  return null;
}

export default function KidSmartAskComposer({
  visible, onClose, active, members, familyId, colors, isDark,
}: {
  visible: boolean;
  onClose: () => void;
  active: FamilyMember;
  members: FamilyMember[];
  familyId: string;
  colors: any;
  isDark: boolean;
}) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const addEvent = useEventStore(s => s.addEvent);
  const sendRequest = useKidRequestStore(s => s.sendRequest);

  // Grocery/Supplies/Birthday/Permission/Question/Medication all hand off
  // to their own dedicated, already-built modal instead of guessing from a
  // short sentence — see the top-of-file comment for why. Only one of
  // these is ever open at once. Tutor has no dedicated kid-facing form
  // anywhere in the app (only a card on the parent side renders it) — it
  // stays on the inline free-text → sendRequest path since there's nothing
  // to hand off to.
  const [groceryModalOpen, setGroceryModalOpen] = useState(false);
  const [suppliesModalOpen, setSuppliesModalOpen] = useState(false);
  const [birthdayModalOpen, setBirthdayModalOpen] = useState(false);
  const [askModalType, setAskModalType] = useState<'permission' | 'question' | 'medication' | null>(null);

  const [input, setInput] = useState('');
  const [detection, setDetection] = useState<LocalDetectionResult | null>(null);
  const [category, setCategory] = useState<AskCategory | null>(null);
  const [touchedCategory, setTouchedCategory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chore-only: recipient (self or a sibling kid/teen — never a parent/
  // senior, mirrored client-side for UX even though the RPC also rejects
  // it server-side).
  const [choreForId, setChoreForId] = useState<string>(active.id);
  const pickableMembers = members.filter(m => m.role === 'kid' || m.role === 'teen');

  // Ride-only: pickup/dropoff, pre-filled from local detection when
  // present (e.g. "from soccer to home") but always editable — a parent
  // acting on a ride request needs to know where, not just when.
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation, setDropLocation] = useState('');

  const dictation = useVoiceDictation();

  const reset = () => {
    setInput(''); setDetection(null); setCategory(null); setTouchedCategory(false);
    setError(null); setSubmitting(false); setChoreForId(active.id);
    setPickupLocation(''); setDropLocation('');
    dictation.reset();
  };
  const close = () => { reset(); onClose(); };

  useEffect(() => {
    if (input.trim().length < MIN_CHARS) { setDetection(null); return; }
    const d = detectLocalTask(input, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
    setDetection(d);
    if (!touchedCategory) {
      const guess = guessCategory(d, input);
      if (guess) setCategory(guess);
    }
    if (d?.locations.pickup && !pickupLocation) setPickupLocation(d.locations.pickup);
    if (d?.locations.dropoff && !dropLocation) setDropLocation(d.locations.dropoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const detectedTitle = (detection?.title || input).trim();
  const catMeta = category ? CATEGORY_CHIPS.find(c => c.key === category) : undefined;
  // Only Ride/Chore/Tutor actually submit from this component's own title —
  // every other category hands off to a dedicated modal that owns its own
  // input, so a title typed here is just a routing hint for them, not
  // required to proceed.
  const needsTitle = category === 'ride' || category === 'chore' || category === 'tutor';
  const canSubmit = !!category && (!needsTitle || !!detectedTitle) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (category === 'ride') {
        // Same shape KidRequestModal.tsx writes for a ride request —
        // approvalPending:true, rideRequired:true.
        addEvent({
          title: detectedTitle,
          date: detection?.when.date ?? new Date().toISOString().slice(0, 10),
          time: detection?.when.time ?? undefined,
          type: 'event',
          category: 'Ride',
          allDay: !detection?.when.time,
          memberId: active.id,
          approvalPending: true,
          conflict: false,
          helperRequestedBy: active.name,
          rideRequired: true,
          driverStatus: 'pending' as const,
          ...(pickupLocation.trim() ? { pickupLocation: pickupLocation.trim() } : {}),
          ...(dropLocation.trim() ? { dropLocation: dropLocation.trim() } : {}),
        });
      } else if (category === 'grocery' || category === 'supplies' || category === 'birthday'
        || category === 'permission' || category === 'question' || category === 'medication') {
        // Hand off to the real dedicated modal (GroceryModal/SuppliesModal's
        // multi-item entry, KidRequestModal's own category grid, or
        // AskModal) instead of guessing/submitting from a short sentence.
        // Two RN <Modal> components can't reliably present back-to-back in
        // the same tick — iOS's UIKit presentation can't queue a second
        // `present` before the first `dismiss` finishes — so this sheet is
        // closed first (full reset via close()) and the target modal opens
        // after a beat, matching the delay the old AskParentSheet handoff
        // used for the same reason.
        setSubmitting(false);
        const openTarget = category === 'grocery' ? () => setGroceryModalOpen(true)
          : category === 'supplies' ? () => setSuppliesModalOpen(true)
          : category === 'birthday' ? () => setBirthdayModalOpen(true)
          : () => setAskModalType(category);
        close();
        setTimeout(openTarget, 300);
        return;
      } else if (category === 'tutor') {
        sendRequest({
          type: 'tutor',
          fromMemberId: active.id,
          detail: detectedTitle,
          urgency: 'normal',
        });
      } else if (category === 'chore') {
        const target = members.find(m => m.id === choreForId);
        if (!target || (target.role !== 'kid' && target.role !== 'teen')) {
          setError("Chores can only be for you or a brother/sister.");
          setSubmitting(false);
          return;
        }
        const { error: rpcError } = await supabase.rpc('propose_kid_chore', {
          p_family_id: familyId,
          p_proposer_id: active.id,
          p_for_member_id: choreForId,
          p_title: detectedTitle,
          p_description: null,
          p_category: 'other',
        });
        if (rpcError) throw rpcError;
      }
      close();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't send that — try again.");
      setSubmitting(false);
    }
  };

  return (
    <>
    <AppBottomSheet visible={visible && !groceryModalOpen && !suppliesModalOpen && !birthdayModalOpen && !askModalType} onClose={close} title="Ask Parent" subtitle="Describe it — we'll figure out where it goes"
      minHeight="45%" maxHeight={keyboardOpen ? '55%' : '85%'} bodyPaddingBottom={40}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
        <View style={{ position: 'relative' }}>
          <TextInput
            value={dictation.state === 'listening' ? dictation.liveTranscript : input}
            onChangeText={setInput}
            editable={dictation.state !== 'listening'}
            placeholder={`"Pick me up from soccer at 4" or "wash the car for Leo"`}
            placeholderTextColor={colors.textTertiary}
            multiline
            style={{
              fontSize: TYPO.body, color: colors.textPrimary, minHeight: 64,
              backgroundColor: isDark ? colors.surface : colors.card,
              borderRadius: RADIUS.md, borderWidth: 1.5,
              borderColor: dictation.state === 'listening' ? colors.danger : colors.border,
              padding: SPACING.md, paddingRight: 56, paddingBottom: 40,
            }}
          />
          <View style={{ position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!!input && dictation.state !== 'listening' && (
              <Pressable
                onPress={() => { setInput(''); setDetection(null); dictation.reset(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ width: 28, height: 28, borderRadius: 14,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? colors.card : '#fff', borderWidth: 1, borderColor: colors.border }}>
                <X size={13} color={colors.textSecondary} />
              </Pressable>
            )}
            <Pressable
              onPress={async () => {
                if (dictation.state === 'listening') {
                  const finalTranscript = await dictation.stop();
                  if (finalTranscript) setInput(finalTranscript);
                } else {
                  dictation.start();
                }
              }}
              style={{ width: 28, height: 28, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: dictation.state === 'listening' ? colors.danger : colors.primary + '18' }}>
              {dictation.state === 'listening'
                ? <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#fff' }} />
                : <Mic size={14} color={colors.primary} />}
            </Pressable>
          </View>
        </View>

        {dictation.state === 'listening' && (
          <Text style={{ fontSize: TYPO.label, color: colors.danger, fontWeight: '700' }}>
            Listening… tap ■ to stop and edit
          </Text>
        )}
        {(error || dictation.error) && (
          <Text style={{ fontSize: TYPO.label, color: colors.danger, fontWeight: '600' }}>{error ?? dictation.error}</Text>
        )}

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} color={colors.primary} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              What is this?
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORY_CHIPS.map(c => {
              const sel = category === c.key;
              return (
                <Pressable key={c.key} onPress={() => { setCategory(c.key); setTouchedCategory(true); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.full,
                    borderWidth: 1.5, backgroundColor: sel ? c.color + '20' : (isDark ? colors.surface : colors.card),
                    borderColor: sel ? c.color : colors.border }}>
                  <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? c.color : colors.textSecondary }}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {category === 'ride' && (
          <View style={{ gap: 8 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Pickup <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
              <TextInput
                value={pickupLocation}
                onChangeText={setPickupLocation}
                placeholder="e.g. Soccer practice"
                placeholderTextColor={colors.textTertiary}
                style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                  backgroundColor: isDark ? colors.surface : colors.card, borderRadius: RADIUS.md,
                  paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }}
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Drop-off <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
              <TextInput
                value={dropLocation}
                onChangeText={setDropLocation}
                placeholder="e.g. Home"
                placeholderTextColor={colors.textTertiary}
                style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary,
                  backgroundColor: isDark ? colors.surface : colors.card, borderRadius: RADIUS.md,
                  paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }}
              />
            </View>
          </View>
        )}

        {category === 'chore' && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Who's this for?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {pickableMembers.map(m => {
                const sel = choreForId === m.id;
                return (
                  <Pressable key={m.id} onPress={() => setChoreForId(m.id)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1.5,
                      backgroundColor: sel ? colors.primary + '20' : (isDark ? colors.surface : colors.card),
                      borderColor: sel ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: sel ? colors.primary : colors.textSecondary }}>
                      {m.id === active.id ? 'Me' : m.name.split(' ')[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, fontStyle: 'italic' }}>
              A parent will set the coin reward when they approve it.
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Pressable onPress={close}
            style={{ flex: 1, borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={submit} disabled={!canSubmit}
            style={{ flex: 2, borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center',
              backgroundColor: catMeta?.color ?? colors.primary, opacity: canSubmit ? 1 : 0.5 }}>
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
                {category === 'grocery' ? 'Open Grocery List'
                  : category === 'supplies' ? 'Open Supplies List'
                  : category === 'birthday' ? 'Open Birthday Form'
                  : category === 'permission' ? 'Open Ask Permission'
                  : category === 'question' ? 'Open Ask a Question'
                  : category === 'medication' ? 'Open Medication Alert'
                  : `Send to ${members.filter(m => m.role === 'parent').length > 0 ? 'Parent' : 'Family'}`}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </AppBottomSheet>

    {/* Rendered as a sibling, not nested inside AppBottomSheet's own
        Modal — that Modal unmounts its children entirely once `visible`
        goes false, which would tear this down mid-handoff right as it's
        meant to take over. */}
    <GroceryModal visible={groceryModalOpen} onClose={() => { setGroceryModalOpen(false); close(); }} active={active} />
    <SuppliesModal visible={suppliesModalOpen} onClose={() => { setSuppliesModalOpen(false); close(); }} active={active} />
    <KidRequestModal visible={birthdayModalOpen} onClose={() => { setBirthdayModalOpen(false); close(); }} activeMemberId={active.id} />
    {askModalType && (
      <AskModal visible={!!askModalType} onClose={() => { setAskModalType(null); close(); }} type={askModalType} active={active} />
    )}
    </>
  );
}
