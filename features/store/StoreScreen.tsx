import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Animated,
  TextInput, Alert, Platform, Modal, KeyboardAvoidingView, Keyboard, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, LETTER_SPACING } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyMember } from '@/store/familyStore';
import { useRewardStore, Reward } from '@/store/rewardStore';
import { useChoreStore } from '@/store/choreStore';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';
import { BRAND } from '@/components/FamilyCubeLogo';
import NotificationPanel from '@/components/NotificationPanel';
import { useNotifStore } from '@/store/notifStore';
import { Flame } from 'lucide-react-native';
import { showToast } from '@/components/AppToast';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';
import { fmtDateShort } from '@/lib/dates';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import FullPageOverlay from '@/components/FullPageOverlay';

// ─── Figma rhythm tokens ──────────────────────────────────────────────────────
const PAGE_BG   = '#F3F5F2';
const TITLE_CLR = '#172337';
const BODY_CLR  = '#657185';
const BORDER    = '#DFE5EF';
const AMBER_TXT = '#B5720A';
const BLUE_BTN  = '#345DE3';

// School's flat field-card rhythm (SchoolHomeScreen.tsx/CreateScheduleScreen.tsx)
// — used by PerkDetailScreen/PerkModal below, kept distinct from the browse
// grid's own PAGE_BG/BORDER/BLUE_BTN tokens above since School's canvas is
// pure white (not PAGE_BG's cashmere tint) with a slightly different border
// hex [live-requested: "make rewards module similar to school ... also forms too"].
const FORM_TITLE_CLR = '#172337';
const FORM_BODY_CLR  = '#657185';
const FORM_BLUE      = '#345DE3';
const FORM_LINK_BLUE = '#294FC7';
const FORM_BORDER    = '#E8EBF0';
const FORM_CARD_BG   = '#FFFFFF';
const FORM_SURFACE   = '#F5F7FB';

// ─── Category config ──────────────────────────────────────────────────────────
// Each category maps to a brand token (not raw hex) so the badge always
// agrees with PerkCard's icon-chip accent for the same category — Treats/
// amber, Experiences/lavender, Screen Time/info-blue, Privileges/sage,
// Special/danger.

const CAT_LABELS: Record<string, string> = {
  Treats:        '🟡 Treats',
  Experiences:   '🟣 Experiences',
  'Screen Time': '🔵 Screen Time',
  Privileges:    '🟢 Privileges',
  Special:       '⭐ Special',
};

// 'Special' is the catch-all most user-created perks end up tagged as (no
// dedicated category fits), so a fixed color for it made a grid of mostly-
// Special perks look like one repeated card. Special (and anything
// unmapped) instead cycles through the brand palette by grid position —
// real categories (Treats/Experiences/Screen Time/Privileges) stay fixed
// since those already carry distinct meaning.
const SPECIAL_CYCLE = ['danger', 'accent', 'teal', 'amber'] as const;

function categoryAccent(category: string | undefined, colors: any, index = 0): string {
  const map: Record<string, string> = {
    Treats: colors.amber, Experiences: colors.accent, 'Screen Time': colors.info,
    Privileges: colors.teal,
  };
  if (category && map[category]) return map[category];
  return colors[SPECIAL_CYCLE[index % SPECIAL_CYCLE.length]];
}

function CategoryBadge({ category, index = 0, colors, isDark }: { category?: string; index?: number; colors: any; isDark: boolean }) {
  const accent = categoryAccent(category, colors, index);
  const label = CAT_LABELS[category ?? 'Special'] ?? CAT_LABELS.Special;
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
      backgroundColor: isDark ? accent + '28' : accent + '20', marginBottom: 6 }}>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: isDark ? colors.textPrimary : accent, letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

// ─── AI suggestion card ───────────────────────────────────────────────────────

interface AiSuggestion {
  emoji: string; title: string; category: string; cost: number;
  targetKid: string; reason: string;
}

const MOCK_SUGGESTIONS: AiSuggestion[] = [
  { emoji: '🎮', title: 'Extra Gaming Hour',  category: 'Screen Time', cost: 80,
    targetKid: 'Kids', reason: 'Great for hitting streak milestones' },
  { emoji: '🍕', title: 'Pizza Night Pick',   category: 'Treats',      cost: 60,
    targetKid: 'All',  reason: 'Popular food reward for completed chores' },
  { emoji: '🎬', title: 'Movie Night Choice', category: 'Experiences', cost: 100,
    targetKid: 'All',  reason: 'High-value weekend reward' },
  { emoji: '📱', title: 'Phone Time +30min',  category: 'Screen Time', cost: 50,
    targetKid: 'Teens', reason: 'Works well as a daily bonus' },
  { emoji: '🏖️', title: 'Day Trip Choice',   category: 'Experiences', cost: 200,
    targetKid: 'All',  reason: 'Save up for a bigger reward' },
  { emoji: '🛍️', title: 'Small Toy/Book',    category: 'Treats',      cost: 120,
    targetKid: 'Kids', reason: 'Tangible reward under $20' },
];

function AiPerksPanel({ onAdd, onClose, colors, isDark }: {
  onAdd: (s: AiSuggestion) => void; onClose: () => void; colors: any; isDark: boolean;
}) {
  return (
    <View style={{ backgroundColor: colors.pinkLight,
      borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 14, borderRadius: 18, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>✨</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.accent }}>
            AI Perk Suggestions
          </Text>
        </View>
        <Pressable onPress={onClose}>
          <Ionicons name="close" size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
        {MOCK_SUGGESTIONS.map((s, i) => (
          <View key={i} style={withAndroidShadowFix({ width: 160, backgroundColor: colors.card,
            borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12,
            shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 })}>
            <Text style={{ fontSize: 26, marginBottom: 4 }}>{s.emoji}</Text>
            <CategoryBadge category={s.category} colors={colors} isDark={isDark} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>
              {s.title}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '900', color: colors.amber, marginBottom: 4 }}>
              {s.cost} 🪙
            </Text>
            <Text style={{ fontSize: 10, color: colors.textSecondary, marginBottom: 8, lineHeight: 14 }}>
              {s.reason}
            </Text>
            <Pressable onPress={() => onAdd(s)}
              style={{ backgroundColor: colors.accent,
                borderRadius: 10, paddingVertical: 6, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
              <Text style={{ fontSize: 12 }}>⚡</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Add</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Perk Card ────────────────────────────────────────────────────────────────

function PerkCard({ reward, index = 0, myCoins, myMaxAffordable, isKid, isParent, canRedeemSelf, colors, isDark, onRedeem, onEdit, onOpenDetail, isGoal, onToggleGoal }: {
  reward: Reward; index?: number; myCoins: number;
  // Logged QA gap, fixed: a single redemption only ever spends from ONE
  // jar, never a pooled sum across mainCoins+gpCoins — this is the larger
  // of the two jars alone, the signal that actually matches real
  // redemption behavior. myCoins (the true pooled total) is still used
  // for the "need N more" copy below, which is honest about the real gap
  // even though it can't be closed by combining both jars in one purchase.
  myMaxAffordable: number;
  isKid: boolean; isParent: boolean;
  // Was isKid-only, so teen and senior roles — both of whom earn coins
  // elsewhere in the app with nowhere else to spend them — got a
  // permanently-disabled card with no redeem action at all (QA sweep,
  // full-app per-role audit, Critical for both roles).
  canRedeemSelf: boolean;
  colors: any; isDark: boolean;
  onRedeem: (r: Reward) => void; onEdit: (r: Reward) => void;
  // A plain tap now opens a read-only detail sheet (last-updated-by info,
  // Edit button inside) instead of doing nothing for non-parents and
  // requiring a long-press for parents — live-requested: "one tap
  // bottomsheet for read only details, with edit button to open the edit
  // model." Long-press-to-edit stays as a parent shortcut on top of that.
  onOpenDetail: (r: Reward) => void;
  isGoal?: boolean; onToggleGoal?: (r: Reward) => void;
}) {
  const canRedeem = canRedeemSelf && myMaxAffordable >= reward.cost;
  // Each category gets its own brand tint instead of every card defaulting
  // to amber — see categoryAccent() — so the grid reads as distinct
  // categories at a glance instead of one repeated tan tile.
  const accent = categoryAccent(reward.category, colors, index);
  return (
    <Pressable
      onPress={() => onOpenDetail(reward)}
      onLongPress={isParent ? () => onEdit(reward) : undefined}
      delayLongPress={350}
      style={withAndroidShadowFix([s.perkCard, { backgroundColor: isDark ? accent + '20' : accent + '1E', borderColor: accent + (isDark ? '55' : '40'), shadowColor: accent, overflow: 'hidden' }])}>

      {/* Icon circle — solid-tint chip matching the Hub quick-action tiles'
          bold "badge" treatment, not a bare floating emoji on a wash.
          ~85% opacity rather than fully solid — a 44px block at full
          opacity on every card read as a heavy dark square. */}
      <View style={{ width: 44, height: 44, borderRadius: 14, marginBottom: 8,
        backgroundColor: accent + 'D9',
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 22 }}>{reward.emoji ?? '🎁'}</Text>
      </View>
      <CategoryBadge category={reward.category} index={index} colors={colors} isDark={isDark} />
      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>
        {reward.title}
      </Text>
      <Text style={{ fontSize: TYPO.micro, fontWeight: '900', color: colors.amber, marginBottom: 4 }}>
        {reward.cost} Coins 🪙
      </Text>
      {reward.description ? (
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, lineHeight: 14, marginBottom: 4 }}>
          {reward.description}
        </Text>
      ) : null}

      {canRedeemSelf ? (
        <>
          <Pressable onPress={() => onRedeem(reward)} disabled={!canRedeem}
            style={[s.redeemBtn, { backgroundColor: canRedeem ? colors.teal : colors.border, marginTop: 8 }]}>
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: canRedeem ? colors.textInverse : colors.textTertiary }}>
              {canRedeem ? 'Redeem Perk' : `Need ${reward.cost - myMaxAffordable} more 🪙`}
            </Text>
          </Pressable>
          {isKid && onToggleGoal && (
            <Pressable onPress={() => onToggleGoal(reward)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
              <Ionicons name={isGoal ? 'star' : 'star-outline'} size={13} color={isGoal ? colors.amber : colors.textTertiary} />
              <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: isGoal ? colors.amber : colors.textTertiary }}>
                {isGoal ? 'My Goal' : 'Set as My Goal'}
              </Text>
            </Pressable>
          )}
        </>
      ) : isParent ? (
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
          Tap for details · Hold to edit
        </Text>
      ) : (
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, textAlign: 'center', marginTop: 8 }}>
          Not available for your role
        </Text>
      )}
    </Pressable>
  );
}

// ─── Perk detail screen — read-only, Edit opens the real form ─────────────────
// Live-requested: a plain tap on a perk should show its details (including
// who last changed it and when) without immediately dropping the viewer
// into edit mode — Edit is a deliberate second step, not the only option.
// Full-page (FullPageOverlay), not a bottom sheet — same detail-then-edit
// rhythm as features/vault/tabs/homeowner/NoteDetailSheet.tsx
// [live-requested: "Add edit details forms should be full pages"]. Rebuilt
// onto School's flat FieldCard rhythm — was pill badges + a loose text
// block, now grouped bordered field cards matching PerkModal/School's own
// detail screens [live-requested: "Detail page not in the rhythm of figma"].
function DetailField({ label, value, colors, isDark }: {
  label: string; value: string; colors: any; isDark: boolean;
}) {
  return (
    <View style={{ borderWidth: 1, borderColor: isDark ? colors.border : FORM_BORDER, borderRadius: 14,
      backgroundColor: isDark ? colors.card : FORM_CARD_BG, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : FORM_BODY_CLR, marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 15, color: isDark ? colors.textPrimary : FORM_TITLE_CLR, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

function PerkDetailScreen({ reward, allMembers, colors, isDark, isParent, onClose, onEdit }: {
  reward: Reward | null; allMembers: FamilyMember[]; colors: any; isDark: boolean; isParent: boolean;
  onClose: () => void; onEdit: (r: Reward) => void;
}) {
  const insets = useSafeAreaInsets();
  const updater = reward?.updatedById ? allMembers.find(m => m.id === reward.updatedById) : undefined;
  const creator = reward?.createdById ? allMembers.find(m => m.id === reward.createdById) : undefined;
  const canvas = isDark ? colors.background : FORM_CARD_BG;
  const titleC = isDark ? colors.textPrimary : FORM_TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : FORM_BODY_CLR;
  const border = isDark ? colors.border : FORM_BORDER;

  return (
    <FullPageOverlay visible={!!reward} onDismiss={onClose} zIndex={65}>
      <View style={{ flex: 1, backgroundColor: canvas }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? FORM_BLUE : FORM_LINK_BLUE }}>‹ Store</Text>
          </TouchableOpacity>

          {reward && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? colors.surface : FORM_SURFACE,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>{reward.emoji ?? '🎁'}</Text>
              </View>
              <Text style={{ fontSize: 26, fontWeight: '700', color: titleC, flex: 1, lineHeight: 32 }}>{reward.title}</Text>
            </View>
          )}

          {reward && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {reward.category ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: isDark ? colors.surface : FORM_SURFACE }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC }}>{reward.category}</Text>
                </View>
              ) : null}
              <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: isDark ? colors.surface : FORM_SURFACE }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: reward.available ? '#1B7A54' : bodyC }}>
                  {reward.available ? 'Available' : 'Unavailable'}
                </Text>
              </View>
              {reward.requiresApproval && (
                <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: isDark ? colors.surface : FORM_SURFACE }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: bodyC }}>Needs approval</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {reward && (
          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 48, gap: 10 }}>

            <DetailField label="Coin cost" value={`${reward.cost} coins 🪙`} colors={colors} isDark={isDark} />

            {reward.description ? (
              <DetailField label="Description" value={reward.description} colors={colors} isDark={isDark} />
            ) : null}

            {typeof reward.stock === 'number' ? (
              <DetailField label="Stock" value={`${reward.stock} in stock`} colors={colors} isDark={isDark} />
            ) : null}

            <DetailField
              label="Last updated"
              value={reward.updatedAt
                ? `${updater?.name?.split(' ')[0] ?? 'a parent'} · ${fmtDateShort(reward.updatedAt.slice(0, 10))} at ${new Date(reward.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                : 'Not edited since it was created'}
              colors={colors} isDark={isDark}
            />

            {reward.createdAt && (
              <DetailField
                label="Added"
                value={`${creator?.name?.split(' ')[0] ?? 'a parent'} · ${fmtDateShort(reward.createdAt.slice(0, 10))}`}
                colors={colors} isDark={isDark}
              />
            )}

            {isParent && (
              <TouchableOpacity onPress={() => onEdit(reward)}
                style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: FORM_BLUE, marginTop: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Edit perk</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>
    </FullPageOverlay>
  );
}

// ─── Create / Edit Perk form — School's flat field-card rhythm ────────────────
// (SchoolHomeScreen.tsx/CreateScheduleScreen.tsx): bordered flat cards, no
// shadows, labeled rows, blue fill action button [live-requested: "make
// rewards module similar to school ... also forms too"].

const CATEGORIES = ['Treats', 'Experiences', 'Screen Time', 'Privileges', 'Special'];
const EMOJIS = ['🎮','🎬','🍕','🎂','🏖️','🎪','📱','🛍️','🎁','⭐','🏆','🎵','🎨','🎯','🚀'];

function FieldCard({ label, children, colors, isDark }: {
  label: string; children: React.ReactNode; colors: any; isDark: boolean;
}) {
  return (
    <View style={{ borderWidth: 1, borderColor: isDark ? colors.border : FORM_BORDER, borderRadius: 14,
      backgroundColor: isDark ? colors.card : FORM_CARD_BG, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : FORM_BODY_CLR, marginBottom: 3 }}>{label}</Text>
      {children}
    </View>
  );
}

function PerkModal({ visible, editing, colors, isDark, onClose, onSave, onDelete }: {
  visible: boolean; editing?: Reward | null; colors: any; isDark: boolean;
  onClose: () => void; onSave: (data: any) => void; onDelete?: (r: Reward) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name,  setName]  = useState('');
  const [desc,  setDesc]  = useState('');
  const [cost,  setCost]  = useState('50');
  const [emoji, setEmoji] = useState('🎁');
  const [cat,   setCat]   = useState('Special');

  const canvas = isDark ? colors.background : FORM_CARD_BG;
  const titleC = isDark ? colors.textPrimary : FORM_TITLE_CLR;
  const bodyC = isDark ? colors.textSecondary : FORM_BODY_CLR;
  const border = isDark ? colors.border : FORM_BORDER;
  const cardBg = isDark ? colors.card : FORM_CARD_BG;

  useEffect(() => {
    if (visible) {
      setName(editing?.title ?? '');
      setDesc(editing?.description ?? '');
      setCost(String(editing?.cost ?? 50));
      setEmoji(editing?.emoji ?? '🎁');
      setCat(editing?.category ?? 'Special');
    }
  }, [visible, editing]);

  const submit = () => {
    if (!name.trim()) { showToast('Perk title is required'); return; }
    onSave({ title: name.trim(), description: desc.trim() || undefined,
      cost: parseInt(cost) || 50, emoji, category: cat });
    onClose();
  };

  return (
    <FullPageOverlay visible={visible} onDismiss={onClose} zIndex={70}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: canvas }}>
          {/* Header */}
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? FORM_BLUE : FORM_LINK_BLUE }}>‹ Store</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 29, fontWeight: '700', color: titleC, marginTop: 8, lineHeight: 36 }}>
              {editing ? 'Edit Perk' : 'New Perk'}
            </Text>
            <Text style={{ fontSize: 14, color: bodyC, marginTop: 4, lineHeight: 20 }}>
              {editing ? 'Update perk details below.' : 'Build a new reward for your family.'}
            </Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="always"
            onScrollBeginDrag={Keyboard.dismiss}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: insets.bottom + 48, gap: 12 }}
            style={{ flex: 1, backgroundColor: canvas }}>

            <FieldCard label="Perk title" colors={colors} isDark={isDark}>
              <TextInput value={name} onChangeText={setName}
                placeholder="e.g. Movie Night Choice"
                placeholderTextColor="#C0C7D4"
                style={{ fontSize: 15, color: titleC, padding: 0 }} />
            </FieldCard>

            <FieldCard label="Coin cost" colors={colors} isDark={isDark}>
              <TextInput value={cost} onChangeText={setCost} keyboardType="number-pad"
                placeholderTextColor="#C0C7D4"
                style={{ fontSize: 15, color: titleC, padding: 0 }} />
            </FieldCard>

            <FieldCard label="Description (optional)" colors={colors} isDark={isDark}>
              <TextInput value={desc} onChangeText={setDesc} placeholder="Brief description…"
                placeholderTextColor="#C0C7D4" multiline numberOfLines={2}
                style={{ fontSize: 15, color: titleC, padding: 0, minHeight: 50, textAlignVertical: 'top' }} />
            </FieldCard>

            {/* Category */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
              paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 12, color: bodyC, marginBottom: 8 }}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORIES.map(c => {
                  const active = cat === c;
                  return (
                    <TouchableOpacity key={c} onPress={() => setCat(c)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                        borderColor: active ? FORM_BLUE : border,
                        backgroundColor: active ? (isDark ? colors.surface : '#EEF3FB') : cardBg }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? FORM_BLUE : bodyC }}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Icon */}
            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 14, backgroundColor: cardBg,
              paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 12, color: bodyC, marginBottom: 8 }}>Icon</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {EMOJIS.map(e => {
                  const active = emoji === e;
                  return (
                    <TouchableOpacity key={e} onPress={() => setEmoji(e)}
                      style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1.5,
                        alignItems: 'center', justifyContent: 'center',
                        borderColor: active ? FORM_BLUE : border,
                        backgroundColor: active ? (isDark ? colors.surface : '#EEF3FB') : cardBg }}>
                      <Text style={{ fontSize: 20 }}>{e}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Save */}
            <TouchableOpacity onPress={submit} disabled={!name.trim()}
              style={{ height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                backgroundColor: name.trim() ? FORM_BLUE : (isDark ? colors.surface : FORM_SURFACE) }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: name.trim() ? '#FFFFFF' : bodyC }}>
                {editing ? 'Save changes' : 'Publish to family store'}
              </Text>
            </TouchableOpacity>

            {editing && onDelete && (
              <TouchableOpacity onPress={() => onDelete(editing)}
                style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>Remove perk</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </FullPageOverlay>
  );
}

// ─── StoreScreen ──────────────────────────────────────────────────────────────

export default function StoreScreen({
  hideHeader = false,
  onClose,
}: {
  hideHeader?: boolean;
  onClose?: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId, loaded, loadFromStorage, awardCoins } = useFamilyStore();
  const { rewards, redemptions, loadFromStorage: loadRewards, addReward, updateReward, deleteReward, redeemReward, approveRedemption, rejectRedemption } = useRewardStore();
  const pointsToFiatRatio = useChoreStore(s => s.householdSettings.pointsToFiatRatio);
  const currencySymbol = useChoreStore(s => s.householdSettings.currencySymbol);

  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const unreadNotifCount = useNotifStore(s => s.unreadCount);
  const [showCreate,  setShowCreate]  = useState(false);
  const [editing,     setEditing]     = useState<Reward | null>(null);
  const [detailPerk,  setDetailPerk]  = useState<Reward | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  // Jar picker — only shown when the kid actually has a choice (both
  // wallets non-zero and at least one alone can't cover it, or both can).
  const [jarPickerTarget, setJarPickerTarget] = useState<Reward | null>(null);
  // Grant Coins — relocated here from the now-removed standalone Ledger
  // tab; Send Coins (peer-to-peer transfer) was dropped, this is the one
  // parent action kept alongside the balance/goal display.
  const [grantTarget, setGrantTarget] = useState<{ id: string; name: string } | null>(null);
  const [grantAmount, setGrantAmount] = useState('');

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadRewards(); }, []);
  useEffect(() => { hideTabBar(); return () => { showTabBar(); }; }, []);

  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isParent = activeMember?.role === 'parent';
  const isKid    = activeMember?.role === 'kid';
  // Was isKid/isParent-only, so teen AND senior both fell through to the
  // else-branch: a bare title with no balance, and every perk card showing
  // the literal text "Kid Mode Required" with no redeem action — despite
  // both roles genuinely earning coins elsewhere (teens via quests,
  // seniors via gpCoins/Send Bonus in SeniorView's Hub) and having no other
  // place in the app to spend them (QA sweep, full-app per-role audit,
  // Critical for both roles). redeemFrom/handleRedeem below already sum
  // BOTH wallets and are fully role-agnostic — only the UI gating was
  // narrow.
  const canRedeemSelf = isKid || activeMember?.role === 'teen' || activeMember?.role === 'senior';
  const myMainCoins = (activeMember as any)?.mainCoins ?? 0;
  const myGpCoins   = (activeMember as any)?.gpCoins ?? 0;
  const myCoins  = myMainCoins + myGpCoins;
  // Logged QA gap, fixed: every "can you afford this" signal in the Store
  // (this header balance display excepted — that one honestly shows the
  // true combined total) used to compare against the POOLED sum of both
  // jars — but a single redemption only ever spends from ONE jar
  // (redeem_reward and JarPickerModal both require one jar alone to cover
  // the full cost, never a split purchase across both). A kid with, say,
  // 60 mainCoins and 60 gpCoins could be shown as "you can afford this
  // 100-coin reward" everywhere (header, perk-card styling, the Hub's own
  // goal-progress bar), then open the redeem flow and find both jar
  // choices in JarPickerModal disabled, since neither jar alone covers
  // 100. myMaxAffordable — the larger of the two jars alone — is the
  // signal that actually matches real redemption behavior.
  const myMaxAffordable = Math.max(myMainCoins, myGpCoins);
  const kids     = members.filter(m => m.role === 'kid' || m.role === 'teen');

  // A kid's own chosen goal (goalRewardId, set via "Set as My Goal" on their
  // own Perk card) takes priority. Falls back to "whichever perk they're
  // closest to affording" only if they haven't picked one — so the card
  // never shows nothing just because a kid hasn't engaged with the goal
  // feature yet.
  const goalForKid = (kidId: string, kidCoins: number) => {
    const kid = members.find(m => m.id === kidId);
    if (kid?.goalRewardId) {
      const chosen = rewards.find(r => r.id === kid.goalRewardId && r.available);
      if (chosen) return chosen;
    }
    const affordable = rewards
      .filter(r => r.available && r.cost > 0 && (!r.eligibleMemberIds || r.eligibleMemberIds.includes(kidId)))
      .sort((a, b) => a.cost - b.cost);
    return affordable.find(r => r.cost >= kidCoins) ?? affordable[affordable.length - 1];
  };

  // Live QA finding: this used to call redeemReward's RPC (grant the
  // reward, decrement stock) and THEN deductCoins as a second, entirely
  // separate real database write — a failure between the two (app killed,
  // connection dropped, a stale-balance race on deductCoins' own .gte()
  // guard) could leave a reward granted with the coins never actually
  // taken, with nothing anywhere to catch or reverse it. redeem_reward
  // (20260930390000) now checks the balance and deducts it atomically in
  // the SAME transaction that grants the reward — one commit, no window.
  // Only a LOCAL optimistic balance update is needed here now; calling
  // deductCoins for real would double-charge on top of what the RPC
  // already took.
  const redeemFrom = async (r: Reward, wallet: 'mainCoins' | 'gpCoins') => {
    if (!activeMember) return;
    const ok = await redeemReward(r.id, activeMember.id, wallet);
    if (!ok) { showToast('This perk is no longer available'); return; }
    useFamilyStore.setState(s => ({
      members: s.members.map(m => m.id === activeMember.id ? { ...m, [wallet]: Math.max(0, (m[wallet] ?? 0) - r.cost) } : m),
    }));
    showToast(r.requiresApproval
      ? `${r.emoji} Requested — waiting for parent approval`
      : `🎉 ${r.title} redeemed!`);
  };

  const handleRedeem = (r: Reward) => {
    if (myCoins < r.cost) {
      showToast(`Need ${r.cost - myCoins} more coins for this perk`);
      return;
    }
    if (myGpCoins === 0 || myMainCoins >= r.cost) {
      redeemFrom(r, 'mainCoins');
      return;
    }
    if (myMainCoins === 0) {
      redeemFrom(r, 'gpCoins');
      return;
    }
    // Genuine choice — show jar picker
    setJarPickerTarget(r);
  };

  const handleDelete = (r: Reward) => {
    deleteReward?.(r.id);
    showToast(`"${r.title}" removed from store`);
  };

  const handleAddAiSuggestion = (s: { title: string; category: string; cost: number; emoji: string; reason: string }) => {
    // Guards against duplicate perks from double-tapping "Add" (or any other
    // repeat call with the same suggestion) — live-reported: the Store
    // showed two identical "Extra Gaming Hour"/"Pizza Night Pick" cards
    // after a rapid double-tap, since addReward itself has no dedup at any
    // level (not in this handler, not in the store, not as a DB constraint).
    // Matching on title (case-insensitive) within the CURRENT catalog is
    // enough here — this suggestion list is small and title collisions are
    // exactly the "same suggestion added twice" case this guards against,
    // not a general uniqueness rule for user-typed perks elsewhere.
    const alreadyExists = rewards.some(
      (r) => r.title.trim().toLowerCase() === s.title.trim().toLowerCase(),
    );
    if (alreadyExists) {
      showToast(`"${s.title}" is already in the store`);
      return;
    }
    addReward?.({
      title: s.title, category: s.category, cost: s.cost, emoji: s.emoji,
      description: s.reason, available: true, requiresApproval: true,
      createdAt: new Date().toISOString(),
    } as any);
    showToast(`"${s.title}" added to the store`);
  };

  const [switcherOpen, setSwitcherOpen] = useState(false);

  const canvas = isDark ? colors.background : PAGE_BG;
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const P = colors.primary;

  // Pulsing dot for AI banner
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(pulseScale,   { toValue: 2.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(pulseScale,   { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
      ]),
      Animated.delay(400),
    ])).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

      {/* ── ReviewInbox-style header ── */}
      {!hideHeader && (
        <View style={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
          paddingBottom: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
          backgroundColor: canvas,
          gap: 6,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
              FAMILY CUBE / {familyName.toUpperCase()}
            </Text>
            {canRedeemSelf && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
                backgroundColor: isDark ? colors.card : '#FDF3D8' }}>
                <Text style={{ fontSize: 13, fontWeight: '900',
                  color: isDark ? colors.amber : AMBER_TXT }}>
                  {myCoins}
                </Text>
                <Text style={{ fontSize: 13 }}>🪙</Text>
              </View>
            )}
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Rewards</Text>
            </TouchableOpacity>
          )}
          <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34,
            letterSpacing: -0.5, color: colors.textPrimary }}>
            Perks Store
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
            {isParent
              ? 'Manage your family perks catalog.'
              : 'Browse and redeem perks with your coins.'}
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: canvas }}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 48 }}>

        {/* ── AI Perks banner (parent) ── */}
        {isParent && (
          <TouchableOpacity onPress={() => setShowAiPanel(v => !v)}
            style={{ borderRadius: 18, overflow: 'hidden',
              backgroundColor: isDark ? colors.card : '#fff',
              ...Platform.select({ ios: { shadowColor: '#102347', shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } }, android: { elevation: isDark ? 0 : 2 } }) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 18, paddingVertical: 16, gap: 14 }}>
              {/* Animated sparkle icon */}
              <View style={{ width: 48, height: 48 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14,
                  backgroundColor: colors.accent + '18',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="sparkles" size={24} color={colors.accent} />
                </View>
                <View style={{ position: 'absolute', top: 0, right: 0, width: 14, height: 14,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5,
                    backgroundColor: colors.success, opacity: pulseOpacity,
                    transform: [{ scale: pulseScale }] }} />
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  CubeAI Perk Ideas
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                  AI-suggested perks tailored for your family
                </Text>
              </View>
              <Ionicons
                name={showAiPanel ? 'chevron-up' : 'chevron-down'}
                size={18} color={colors.textTertiary} />
            </View>
            {/* Expanded suggestion cards */}
            {showAiPanel && (
              <View style={{ borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: isDark ? colors.border : BORDER }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ padding: 14, gap: 10 }}>
                  {MOCK_SUGGESTIONS.map((s, i) => (
                    <View key={i} style={{ width: 160, borderRadius: 16,
                      backgroundColor: isDark ? colors.surface : '#F6F8FC',
                      borderWidth: 1, borderColor: isDark ? colors.border : BORDER,
                      padding: 14 }}>
                      <Text style={{ fontSize: 26, marginBottom: 6 }}>{s.emoji}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 }}>
                        {s.title}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.amber : AMBER_TXT, marginBottom: 4 }}>
                        {s.cost} 🪙
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 15, marginBottom: 10 }}>
                        {s.reason}
                      </Text>
                      <TouchableOpacity onPress={() => { handleAddAiSuggestion(s); }}
                        style={{ backgroundColor: BLUE_BTN, borderRadius: 10,
                          paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>+ Add</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* ── Add Perk button (parent) ── */}
        {isParent && (
          <TouchableOpacity onPress={() => { setEditing(null); setShowCreate(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, paddingVertical: 15, borderRadius: 14,
              backgroundColor: BLUE_BTN,
              ...Platform.select({ ios: { shadowColor: BLUE_BTN, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 4 } }) }}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Add New Perk</Text>
          </TouchableOpacity>
        )}

        {/* ── Kids' Piggy Banks (parent) ── */}
        {isParent && kids.length > 0 && (
          <View style={{ borderRadius: 22, overflow: 'hidden',
            backgroundColor: isDark ? colors.card : '#fff',
            ...Platform.select({ ios: { shadowColor: '#102347', shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }, android: { elevation: isDark ? 0 : 3 } }) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 }}>
              <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: colors.teal }} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.teal,
                textTransform: 'uppercase', letterSpacing: 0.7 }}>
                Kids' Piggy Banks
              </Text>
            </View>
            {kids.map((kid, i) => {
              const kidMainCoins = (kid as any).mainCoins ?? 0;
              const kidGpCoins   = (kid as any).gpCoins   ?? 0;
              const kidCoins     = kidMainCoins + kidGpCoins;
              const dollars      = (kidCoins * pointsToFiatRatio).toFixed(2);
              const goal         = goalForKid(kid.id, kidCoins);
              const kidMaxAffordable = Math.max(kidMainCoins, kidGpCoins);
              const pct          = goal ? Math.min(kidMaxAffordable / goal.cost, 1) : 0;
              const streak       = (kid as any).streak ?? 0;
              return (
                <View key={kid.id}>
                  {i > 0 && <View style={{ height: StyleSheet.hairlineWidth,
                    backgroundColor: isDark ? colors.border : BORDER, marginHorizontal: 18 }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 18, paddingVertical: 14, gap: 14 }}>
                    <View style={{ width: 50, height: 50, borderRadius: 15,
                      backgroundColor: isDark ? colors.tealLight : '#D5EFE4',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 26 }}>{kid.emoji ?? '🙂'}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>
                          {kid.name.split(' ')[0]}
                        </Text>
                        {streak > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                            borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
                            backgroundColor: colors.amberLight }}>
                            <Flame size={10} color={colors.amber} />
                            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.amber }}>
                              {streak}-day
                            </Text>
                          </View>
                        )}
                      </View>
                      {goal ? (
                        <>
                          <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                            Goal: {goal.title}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ flex: 1, height: 5, borderRadius: 3,
                              backgroundColor: isDark ? colors.surface : '#DCF0E8', overflow: 'hidden' }}>
                              <View style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 3,
                                backgroundColor: colors.teal }} />
                            </View>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.teal, minWidth: 32 }}>
                              {Math.round(pct * 100)}%
                            </Text>
                          </View>
                        </>
                      ) : (
                        <Text style={{ fontSize: 12, color: colors.textTertiary }}>No goal set</Text>
                      )}
                    </View>
                    {/* Coin total + Grant */}
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                        <Text style={{ fontSize: 20, fontWeight: '900',
                          color: isDark ? colors.amber : AMBER_TXT }}>
                          {kidCoins}
                        </Text>
                        <Text style={{ fontSize: 13 }}>🪙</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (grantTarget?.id === kid.id) { setGrantTarget(null); setGrantAmount(''); return; }
                          setGrantAmount(''); setGrantTarget({ id: kid.id, name: kid.name });
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9,
                          backgroundColor: grantTarget?.id === kid.id ? colors.amber : colors.amberLight }}>
                        <Ionicons name="gift-outline" size={12} color={grantTarget?.id === kid.id ? '#fff' : colors.amber} />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: grantTarget?.id === kid.id ? '#fff' : colors.amber }}>Grant</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* ── Inline Grant Coins row — expands directly under this
                      kid's own row when tapped, not a sheet/overlay panel
                      [live-requested: "Grant coins should be inline edits
                      not a bottom sheet"]. ── */}
                  {grantTarget?.id === kid.id && (
                    <View style={{ paddingHorizontal: 18, paddingBottom: 14, gap: 8 }}>
                      <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : BODY_CLR }}>
                        Give {kid.name.split(' ')[0]} a bonus, no chore required.
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TextInput
                          value={grantAmount}
                          onChangeText={setGrantAmount}
                          keyboardType="numeric"
                          placeholder="Coins to grant…"
                          placeholderTextColor={colors.textTertiary}
                          autoFocus
                          style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
                            color: colors.textPrimary, backgroundColor: colors.surface,
                            paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontWeight: '700' }}
                        />
                        <TouchableOpacity
                          onPress={() => {
                            const n = parseInt(grantAmount, 10);
                            if (!n || n <= 0) { showToast('Enter a valid coin amount'); return; }
                            awardCoins(kid.id, n, 'mainCoins');
                            showToast(`🪙 ${n} coins granted to ${kid.name.split(' ')[0]}`);
                            setGrantTarget(null);
                            setGrantAmount('');
                          }}
                          style={{ paddingHorizontal: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: colors.amber }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Grant</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 8 }} />
          </View>
        )}

        {/* ── Perks catalog — full-width rows ── */}
        {rewards.length === 0 ? (
          <View style={{ borderRadius: 22, padding: 40, alignItems: 'center',
            backgroundColor: isDark ? colors.card : '#fff',
            ...Platform.select({ ios: { shadowColor: '#102347', shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }, android: { elevation: isDark ? 0 : 2 } }) }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🎁</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
              No perks yet
            </Text>
            {isParent && (
              <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                Tap "+ Add Perk" above or try "✨ AI Perks" for ideas
              </Text>
            )}
          </View>
        ) : (
          <View style={{ borderRadius: 22, overflow: 'hidden',
            backgroundColor: isDark ? colors.card : '#fff',
            ...Platform.select({ ios: { shadowColor: '#102347', shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } }, android: { elevation: isDark ? 0 : 3 } }) }}>
            {/* Section heading inside card */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: colors.primary }} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary,
                  textTransform: 'uppercase', letterSpacing: 0.7 }}>
                  Available Perks · {rewards.filter(r => r.available).length}
                </Text>
              </View>
              {!isParent && (
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : BODY_CLR }}>
                  Balance: <Text style={{ fontWeight: '800', color: isDark ? colors.amber : AMBER_TXT }}>{myCoins} 🪙</Text>
                </Text>
              )}
            </View>

            {rewards.map((r, i) => {
              const accent = categoryAccent(r.category, colors, i);
              const canAfford = canRedeemSelf && myMaxAffordable >= r.cost;
              const isGoalReward = isKid && activeMember?.goalRewardId === r.id;

              return (
                <View key={r.id}>
                  {i > 0 && <View style={{ height: StyleSheet.hairlineWidth,
                    backgroundColor: isDark ? colors.border : BORDER,
                    marginHorizontal: 18 }} />}
                  <TouchableOpacity
                    onPress={() => setDetailPerk(r)}
                    onLongPress={isParent ? () => { setEditing(r); setShowCreate(true); } : undefined}
                    delayLongPress={350}
                    style={{ flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 18, paddingVertical: 14, gap: 14 }}>
                    {/* Emoji chip */}
                    <View style={{ width: 48, height: 48, borderRadius: 14,
                      backgroundColor: accent + (isDark ? '30' : '22'),
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 24 }}>{r.emoji ?? '🎁'}</Text>
                    </View>
                    {/* Text */}
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700',
                          color: colors.textPrimary, flex: 1 }} numberOfLines={1}>
                          {r.title}
                        </Text>
                        {isGoalReward && (
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
                            backgroundColor: colors.amberLight }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.amber }}>⭐ Goal</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800',
                          color: isDark ? colors.amber : AMBER_TXT }}>
                          {r.cost} 🪙
                        </Text>
                        {r.requiresApproval && (
                          <Text style={{ fontSize: 11, color: isDark ? colors.textTertiary : BODY_CLR }}>
                            · parent approval
                          </Text>
                        )}
                        {typeof r.stock === 'number' && (
                          <Text style={{ fontSize: 11, color: isDark ? colors.textTertiary : BODY_CLR }}>
                            · {r.stock} left
                          </Text>
                        )}
                      </View>
                    </View>
                    {/* Right action */}
                    {canRedeemSelf ? (
                      <TouchableOpacity onPress={() => handleRedeem(r)}
                        disabled={!canAfford}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11,
                          backgroundColor: canAfford ? BLUE_BTN : (isDark ? colors.surface : '#EAEDF4'),
                          opacity: canAfford ? 1 : 0.7 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800',
                          color: canAfford ? '#fff' : (isDark ? colors.textTertiary : BODY_CLR) }}>
                          {canAfford ? 'Redeem' : `−${r.cost - myMaxAffordable}`}
                        </Text>
                      </TouchableOpacity>
                    ) : isParent ? (
                      <TouchableOpacity onPress={() => { setEditing(r); setShowCreate(true); }}
                        style={{ padding: 8, borderRadius: 10,
                          backgroundColor: isDark ? colors.surface : '#F0F2F7' }}>
                        <Ionicons name="pencil-outline" size={16} color={isDark ? colors.textSecondary : BODY_CLR} />
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                </View>
              );
            })}
            <View style={{ height: 8 }} />
          </View>
        )}

        {/* Coin wallet info */}
        <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center', lineHeight: 18 }}>
          Perks are redeemed from your Main Wallet.{'\n'}Grandparent Bonus coins are cashed out via parents.
        </Text>

      </ScrollView>

      <PerkModal
        visible={showCreate}
        editing={editing}
        colors={colors}
        isDark={isDark}
        onClose={() => { setShowCreate(false); setEditing(null); }}
        onSave={data => {
          if (editing) { updateReward?.(editing.id, data, activeMemberId ?? undefined); showToast('Reward updated'); }
          else { addReward?.({ available: true, requiresApproval: true,
            createdAt: new Date().toISOString(), ...data } as any); showToast('Reward added'); }
        }}
        onDelete={r => { setShowCreate(false); setEditing(null); handleDelete(r); }}
      />

      <PerkDetailScreen
        reward={detailPerk}
        allMembers={members}
        colors={colors}
        isDark={isDark}
        isParent={isParent}
        onClose={() => setDetailPerk(null)}
        onEdit={r => { setDetailPerk(null); setEditing(r); setShowCreate(true); }}
      />

      <JarPickerModal
        reward={jarPickerTarget}
        mainCoins={myMainCoins}
        gpCoins={myGpCoins}
        colors={colors}
        isDark={isDark}
        onClose={() => setJarPickerTarget(null)}
        onPick={wallet => {
          if (jarPickerTarget) redeemFrom(jarPickerTarget, wallet);
          setJarPickerTarget(null);
        }}
      />

    </View>
  );
}

// ─── Jar picker ────────────────────────────────────────────────────────────────
// Only shown when the kid genuinely has a choice — neither wallet alone
// covers the cost, or both do. Redeeming used to always silently pool
// mainCoins + gpCoins together; this makes the two jars actually separate
// and spendable on purpose, not just a cosmetic split.
function JarPickerModal({ reward, mainCoins, gpCoins, colors, isDark, onClose, onPick }: {
  reward: Reward | null; mainCoins: number; gpCoins: number; colors: any; isDark: boolean;
  onClose: () => void; onPick: (wallet: 'mainCoins' | 'gpCoins') => void;
}) {
  if (!reward) return null;
  const jars: { key: 'mainCoins' | 'gpCoins'; label: string; balance: number; emoji: string; color: string }[] = [
    { key: 'mainCoins', label: 'Main Coins', balance: mainCoins, emoji: '🪙', color: BRAND.amber },
    { key: 'gpCoins', label: 'Grandparent Bonus', balance: gpCoins, emoji: '⭐', color: BRAND.purple },
  ];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
        activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}
          style={withAndroidShadowFix({ backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 14,
            borderWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 })}>
          <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary }}>Pay with which jar?</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            "{reward.title}" costs {reward.cost} 🪙
          </Text>
          {jars.map(j => {
            const affordable = j.balance >= reward.cost;
            return (
              <TouchableOpacity key={j.key} disabled={!affordable} onPress={() => onPick(j.key)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14,
                  borderWidth: 1.5, borderColor: affordable ? j.color + '60' : colors.border,
                  backgroundColor: affordable ? j.color + '12' : colors.surface,
                  padding: 14, opacity: affordable ? 1 : 0.5 }}>
                <Text style={{ fontSize: 22 }}>{j.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{j.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
                    {j.balance} 🪙 available{!affordable ? ' — not enough' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  createBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 12,
               paddingVertical: 7, paddingHorizontal: 12 },
  coinBadge: { borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  perkCard:  { flex: 1, borderRadius: 20, borderWidth: 1, padding: 14,
               shadowColor: '#000', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 2 },
               shadowRadius: 6, elevation: 3 },
  redeemBtn: { borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  emptyBox:  { borderRadius: 20, borderWidth: 1, padding: 40, alignItems: 'center' },
  overlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1,
               padding: 20, paddingBottom: 40 },
  handle:    { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  label:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input:     { borderWidth: 1.5, borderRadius: 12, padding: 10, fontSize: 13, marginBottom: 10 },
  emojiBtn:  { width: 44, height: 44, borderRadius: 12, borderWidth: 1,
               alignItems: 'center', justifyContent: 'center' },
  submitBtn: { borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
});
