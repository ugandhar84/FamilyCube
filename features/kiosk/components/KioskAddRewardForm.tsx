/**
 * KioskAddRewardForm — kiosk-native create/edit shell for a Store perk,
 * matching mobile's real PerkModal (features/store/StoreScreen.tsx) field
 * for field: title, coin cost, category, description, emoji [live-reported:
 * "i figured out lot of things are missing par with Mobile app store add
 * /mod /del" / "please aling those 2 pages with the exact mobile
 * functionality"] — kiosk's Store tab had ZERO add/edit/delete UI at all
 * before this, a real feature gap versus mobile's own reward-catalog CRUD.
 *
 * Same real store actions as the phone: addReward/updateReward (both from
 * useRewardStore()) are called by the caller (KioskStoreTab), not this
 * file — this component only collects the same fields PerkModal does and
 * hands back the same `data` shape, matching StoreScreen.tsx's own
 * onSave(data) contract exactly (title, description, cost, emoji,
 * category — the caller fills in available/requiresApproval/createdAt on
 * create, same as StoreScreen.tsx's own addReward call). Delete is a
 * separate confirm-and-delete affordance on the caller's reward row, same
 * pattern as every other kiosk list (chores, events) — not duplicated here.
 *
 * Shell is KioskFormDrawer like every other kiosk form (KioskAddMedForm,
 * KioskAddVaxForm, KioskGroceryItemSheet) — the 'drawer' (side-sheet)
 * variant, matching how every other kiosk form presents itself
 * [live-requested: "use the side sheet to show forms"].
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Gift } from 'lucide-react-native';
import type { Reward, RewardCategory } from '@/store/rewardStore';
import { KioskFormDrawer, KioskFieldLabel, KioskPill, kioskInputStyle } from './KioskFormDrawer';
import { useKioskColors } from '../kioskPalette';
import { KIOSK_SPACE, KIOSK_TYPO } from '../kioskTheme';
import { useSubmitGuard } from '@/lib/hooks/useSubmitGuard';

// Same real catalog PerkModal.tsx offers — CATEGORIES/EMOJIS constants.
const CATEGORIES: RewardCategory[] = ['Screen Time', 'Food', 'Activity', 'Shopping', 'Special', 'Experience'];
const EMOJIS = ['🎮','🎬','🍕','🎂','🏖️','🎪','📱','🛍️','🎁','⭐','🏆','🎵','🎨','🎯','🚀'];

export interface RewardFormData {
  title: string;
  description?: string;
  cost: number;
  emoji: string;
  category: RewardCategory;
}

export function KioskAddRewardForm({ visible, editing, onClose, onSave }: {
  visible: boolean;
  editing?: Reward | null;
  onClose: () => void;
  onSave: (data: RewardFormData) => void;
}) {
  const { k } = useKioskColors();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [cost, setCost] = useState('50');
  const [emoji, setEmoji] = useState('🎁');
  const [cat, setCat] = useState<RewardCategory>('Special');

  useEffect(() => {
    if (visible) {
      setName(editing?.title ?? '');
      setDesc(editing?.description ?? '');
      setCost(String(editing?.cost ?? 50));
      setEmoji(editing?.emoji ?? '🎁');
      setCat((editing?.category as RewardCategory) ?? 'Special');
    }
  }, [visible, editing]);

  const error = useMemo(() => (!name.trim() ? 'Perk title is required' : null), [name]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const canSubmit = !!name.trim();
  // Had no double-tap guard and hardcoded submitting={false} below — a fast
  // double-tap on "Publish Perk"/"Save Changes" could fire onSave (a
  // synchronous addReward/updateReward with no dedup) twice, creating a
  // duplicate reward [live-requested app-wide: "We should avoid double tab
  // submit for all the app wide"].
  const { submitting, guard } = useSubmitGuard();

  const submit = guard(async () => {
    setSubmitAttempted(true);
    if (!canSubmit) return;
    onSave({
      title: name.trim(),
      description: desc.trim() || undefined,
      cost: parseInt(cost, 10) || 50,
      emoji,
      category: cat,
    });
    onClose();
  });

  const input = kioskInputStyle(k);

  return (
    <KioskFormDrawer
      visible={visible} title={editing ? 'Edit Perk' : 'Create Custom Perk'}
      subtitle="Same real form as the phone app"
      accent={k.primary} Icon={Gift} k={k} onClose={onClose}
      variant="drawer"
      submitLabel={editing ? 'Save Changes' : 'Publish Perk to Family Store'}
      onSubmit={submit} canSubmit={canSubmit} submitting={submitting}
      error={submitAttempted && !canSubmit ? error : null}
    >
      <KioskFieldLabel k={k}>PERK TITLE</KioskFieldLabel>
      <TextInput
        value={name} onChangeText={setName}
        placeholder="e.g. Movie Night Choice" placeholderTextColor={k.textFaint}
        style={[input, { marginBottom: KIOSK_SPACE.md, borderColor: submitAttempted && error ? k.danger : input.borderColor }]}
      />

      <KioskFieldLabel k={k}>COIN COST</KioskFieldLabel>
      <TextInput
        value={cost} onChangeText={setCost} keyboardType="number-pad"
        placeholderTextColor={k.textFaint}
        style={[input, { marginBottom: KIOSK_SPACE.md, maxWidth: 160 }]}
      />

      <KioskFieldLabel k={k}>CATEGORY</KioskFieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: KIOSK_SPACE.md }}>
        <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs }}>
          {CATEGORIES.map(c => (
            <KioskPill key={c} label={c} selected={cat === c}
              onPress={() => setCat(c)} accent={k.primary} k={k} />
          ))}
        </View>
      </ScrollView>

      <KioskFieldLabel k={k}>DESCRIPTION (OPTIONAL)</KioskFieldLabel>
      <TextInput
        value={desc} onChangeText={setDesc}
        placeholder="Brief description…" placeholderTextColor={k.textFaint}
        style={[input, { marginBottom: KIOSK_SPACE.md }]}
      />

      <KioskFieldLabel k={k}>EMOJI ICON</KioskFieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.xs }}>
          {EMOJIS.map(e => (
            <Pressable key={e} onPress={() => setEmoji(e)}
              style={{
                width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5,
                backgroundColor: emoji === e ? k.primary + '20' : k.well,
                borderColor: emoji === e ? k.primary : k.cardBorder,
              }}>
              <Text style={{ fontSize: 20 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </KioskFormDrawer>
  );
}
