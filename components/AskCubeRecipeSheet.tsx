/**
 * AskCubeRecipeSheet — full recipe detail when a meal proposal card is
 * tapped. Uses the same real-photo-or-emoji hero as the card (MealHero),
 * just bigger. Offers the same Add action as the inline card, plus Share —
 * posts the meal as a structured, read-only card into the family group
 * chat (ChatScreen.tsx renders systemEvent 'shared_card' payloads
 * specially, not as a plain text bubble).
 */
import { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { X, Clock, User, Send, Check } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { MealHero } from './AskCubeProposalCard';

export type RecipeData = {
  title: string; day?: string; mealType?: string; emoji?: string;
  imageUrl?: string | null; prepMinutes?: number; ingredients?: string[]; prepSteps?: string[];
};

export default function AskCubeRecipeSheet({
  visible, data, chefName, onClose, onAdd, onShare, added,
}: {
  visible: boolean;
  data: RecipeData | null;
  chefName?: string;
  onClose: () => void;
  // Omit both to render read-only (no footer at all) — used when a family
  // Chat message shows a shared meal card and there's nothing to
  // add/re-share from that view, just the recipe to read.
  onAdd?: () => void;
  onShare?: () => void;
  added?: boolean;
}) {
  const { colors } = useTheme();
  const [shared, setShared] = useState(false);
  useEffect(() => { if (visible) setShared(false); }, [visible, data?.title]);
  if (!data) return null;
  const accent = colors.amber;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
        <Pressable style={{ ...{ position: 'absolute' as const }, top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.card, borderRadius: 22, overflow: 'hidden', maxHeight: '80%' }}>
          <View>
            <MealHero imageUrl={data.imageUrl} emoji={data.emoji} accent={accent} height={170} />
            <Pressable onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: 15,
                backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#fff" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>{data.title}</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>
              {data.day}{data.mealType ? ` · ${data.mealType}` : ''}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {!!data.prepMinutes && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: accent + '14',
                  borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Clock size={13} color={accent} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: accent }}>{data.prepMinutes} min</Text>
                </View>
              )}
              {!!chefName && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <User size={13} color={colors.textSecondary} />
                  <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary }}>{chefName} cooking</Text>
                </View>
              )}
            </View>

            {!!data.ingredients?.length && (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Ingredients
                </Text>
                {data.ingredients.map((ing, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent }} />
                    <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary }}>{ing}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!data.prepSteps?.length && (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Steps
                </Text>
                {data.prepSteps.map((step, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: accent + '18',
                      alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: accent }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.textPrimary, lineHeight: 19 }}>{step}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {(onShare || onAdd) && (
            <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              {onShare && (
                <Pressable onPress={() => { onShare(); setShared(true); }} disabled={shared}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    flex: 1, borderRadius: 10, paddingVertical: 11, borderWidth: 1,
                    borderColor: shared ? colors.success : colors.border,
                    backgroundColor: shared ? colors.success + '14' : 'transparent' }}>
                  {shared ? <Check size={14} color={colors.success} /> : <Send size={14} color={colors.textSecondary} />}
                  <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: shared ? colors.success : colors.textSecondary }}>
                    {shared ? 'Sent to Chat' : 'Share to Chat'}
                  </Text>
                </Pressable>
              )}
              {onAdd && (
                <Pressable onPress={onAdd} disabled={added}
                  style={{ flex: 1.4, borderRadius: 10, paddingVertical: 11, alignItems: 'center',
                    backgroundColor: added ? colors.border : accent }}>
                  <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: added ? colors.textTertiary : '#fff' }}>
                    {added ? '✓ Added to plan' : 'Add to Meal Plan'}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
