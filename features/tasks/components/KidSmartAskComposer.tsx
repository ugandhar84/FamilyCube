/**
 * KidSmartAskComposer — a Kid's "just describe it" composer, sibling to
 * SmartTaskComposer but NOT a fork of it. Kid-facing "ask" categories
 * (ride/birthday/tutor/grocery/supplies/permission/question/medication) are
 * all genuinely different concepts from Parent/Teen/Senior's event/quest
 * creation — reusing SmartTaskComposer's 1292 lines here would mean bolting
 * an isKid branch onto every one of its quest/event/coin/GP-pool fields,
 * none of which apply. This component reuses only the free-text + voice
 * input UX (detectLocalTask/useVoiceDictation) and has its own small
 * routing table into the EXISTING kid mechanisms:
 *   - Ride/Birthday       → useEventStore().addEvent(...) with
 *                            approvalPending:true, same shape
 *                            KidRequestModal.tsx already writes.
 *   - Tutor/Permission/
 *     Question/Medication → useKidRequestStore().sendRequest({ type, ... })
 *   - Grocery/Supplies    → sendRequest({ type:'delegation', detail: ... })
 *                            using KidModals.tsx's own encode helpers.
 *   - Chore               → supabase.rpc('propose_kid_chore', ...) — the one
 *                            genuinely new capability, gated to kid/teen
 *                            recipients only (server also rejects a parent
 *                            target). No coins field anywhere here — a
 *                            parent sets the real reward at approval time
 *                            (KidProposedChoreCard.tsx).
 *
 * This directly replaces AskParentSheet's manual 6-button chooser for Kid
 * (removed from KidView.tsx in the same change) — every category it offered
 * is covered here, plus free-text/voice entry and the new Chore option.
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
import { useKidRequestStore, type RequestType } from '@/store/kidRequestStore';
import { encodeGroceryRequest, SUPPLIES_PREFIX } from '@/features/hub/KidModals';
import { supabase } from '@/lib/supabase';
import type { FamilyMember } from '@/store/familyStore';

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

// Best-effort local-detection → AskCategory guess, purely a starting
// suggestion the kid can always override with a chip tap below.
function guessCategory(d: LocalDetectionResult | null): AskCategory | null {
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

  const dictation = useVoiceDictation();

  const reset = () => {
    setInput(''); setDetection(null); setCategory(null); setTouchedCategory(false);
    setError(null); setSubmitting(false); setChoreForId(active.id);
    dictation.reset();
  };
  const close = () => { reset(); onClose(); };

  useEffect(() => {
    if (input.trim().length < MIN_CHARS) { setDetection(null); return; }
    const d = detectLocalTask(input, members.map(m => ({ id: m.id, name: m.name, role: m.role })));
    setDetection(d);
    if (!touchedCategory) {
      const guess = guessCategory(d);
      if (guess) setCategory(guess);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const detectedTitle = (detection?.title || input).trim();
  const catMeta = category ? CATEGORY_CHIPS.find(c => c.key === category) : undefined;

  const submit = async () => {
    if (!category || !detectedTitle || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (category === 'ride' || category === 'birthday') {
        // Same shape KidRequestModal.tsx writes for both ride requests and
        // birthday-party help — approvalPending:true, rideRequired only
        // for an actual ride.
        addEvent({
          title: detectedTitle,
          date: detection?.when.date ?? new Date().toISOString().slice(0, 10),
          time: detection?.when.time ?? undefined,
          type: category === 'birthday' ? 'birthday' : 'event',
          category: category === 'birthday' ? 'Birthday' : 'Ride',
          allDay: !detection?.when.time,
          memberId: active.id,
          approvalPending: true,
          conflict: false,
          helperRequestedBy: active.name,
          ...(category === 'ride' ? {
            rideRequired: true,
            driverStatus: 'pending' as const,
            ...(detection?.locations.pickup ? { pickupLocation: detection.locations.pickup } : {}),
            ...(detection?.locations.dropoff ? { dropLocation: detection.locations.dropoff } : {}),
          } : {}),
        });
      } else if (category === 'grocery') {
        sendRequest({
          type: 'delegation',
          fromMemberId: active.id,
          urgency: 'normal',
          detail: encodeGroceryRequest({ name: detectedTitle, qty: '', category: 'Multi', notes: '' }),
        });
      } else if (category === 'supplies') {
        sendRequest({
          type: 'delegation',
          fromMemberId: active.id,
          urgency: 'normal',
          detail: `${SUPPLIES_PREFIX}${JSON.stringify({ items: [{ name: detectedTitle, qty: '1' }], notes: '', urgency: 'normal' })}`,
        });
      } else if (category === 'tutor' || category === 'permission' || category === 'question' || category === 'medication') {
        const type: RequestType = category === 'tutor' ? 'tutor' : category;
        sendRequest({
          type,
          fromMemberId: active.id,
          detail: detectedTitle,
          urgency: category === 'medication' ? 'urgent' : 'normal',
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
    <AppBottomSheet visible={visible} onClose={close} title="Ask Parent" subtitle="Describe it — we'll figure out where it goes"
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
          <Pressable onPress={submit} disabled={!category || !detectedTitle || submitting}
            style={{ flex: 2, borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center',
              backgroundColor: catMeta?.color ?? colors.primary, opacity: (!category || !detectedTitle || submitting) ? 0.5 : 1 }}>
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>
                Send to {members.filter(m => m.role === 'parent').length > 0 ? 'Parent' : 'Family'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </AppBottomSheet>
  );
}
