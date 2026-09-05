/**
 * KioskRecipeDrawer — one meal's full recipe detail (ingredients + prep
 * steps), opened by tapping one of the three Breakfast/Lunch/Dinner cards
 * on the kiosk Overview hero. Deliberately self-contained (its own Modal +
 * KioskModalHost, not built on KioskFormDrawer) so it doesn't collide with
 * the shared-shell dialog/drawer sizing work landing on this branch at the
 * same time — this is display-only content with no form/submit concern,
 * closer in shape to KioskAskFamDrawer (also self-contained) than to the
 * Ask-Parent forms.
 *
 * Shape: the narrow right-anchored, full-height drawer — the same shell
 * KioskAskFamDrawer uses (width ~480, height 100%, slide-in, scrim,
 * KeyboardAvoidingView, KioskModalHost). This was briefly a centered
 * content-sized dialog; the owner asked for it back to the drawer shape
 * specifically for this one, since a recipe's ingredients + numbered
 * steps can genuinely run long (unlike a single-textarea alert, where the
 * "why fill the whole screen for one field" complaint actually applies).
 *
 * Data: the caller passes one already-loaded Meal (from useKioskMeals'
 * week, the same source the Overview's meal-type cards and the Meals tab
 * both read) — no new query.
 */
import { Modal, View, Text, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { ChefHat, Clock3, UserRound, Sparkles, X } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { KioskModalHost } from '../KioskActivityContext';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT } from '../kioskTheme';
import { type KioskColors } from '../kioskPalette';
import { Well, EmptyNote } from './KioskOS';

const TYPE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

export function typeAccent(k: KioskColors, type: string): string {
  return type === 'breakfast' ? k.gold
    : type === 'lunch' ? k.sage
    : type === 'snack' ? k.blue
    : k.purple; // dinner, and anything unrecognized
}

export function KioskRecipeDrawer({
  visible, onClose, meal, members, k,
}: {
  visible: boolean;
  onClose: () => void;
  meal: Meal | null;
  members: FamilyMember[];
  k: KioskColors;
}) {
  if (!meal) return null;
  const accent = typeAccent(k, meal.type);
  const chef = members.find(m => m.id === meal.chef_id)?.name?.trim().split(' ')[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KioskModalHost style={s.host}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close recipe"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.right}
          pointerEvents="box-none"
        >
          <View
            style={[s.panel, { backgroundColor: k.card, borderLeftColor: k.cardBorder }]}
            accessibilityViewIsModal
            accessibilityLabel={`${meal.title} recipe`}
          >
            <View style={[s.header, { borderBottomColor: k.cardBorder }]}>
              <View style={[s.headIcon, { backgroundColor: accent + '22', borderColor: accent + '45' }]}>
                <Text style={{ fontSize: 24 }}>{meal.emoji ?? '🍽️'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.eyebrow, { color: accent }]} numberOfLines={1}>
                  {TYPE_LABEL[meal.type] ?? meal.type}
                </Text>
                <Text style={[s.title, { color: k.text }]} numberOfLines={2}>{meal.title}</Text>
              </View>
              <Pressable
                onPress={onClose} hitSlop={16}
                style={[s.closeBtn, { backgroundColor: k.well }]}
                accessibilityRole="button" accessibilityLabel="Close"
              >
                <X size={20} color={k.textMuted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
              <View style={s.metaRow}>
                {!!meal.start_time && (
                  <View style={s.metaChip}>
                    <Clock3 size={14} color={k.textMuted} />
                    <Text style={[s.metaText, { color: k.textMuted }]} numberOfLines={1}>{meal.start_time}</Text>
                  </View>
                )}
                {!!meal.prep_minutes && (
                  <View style={s.metaChip}>
                    <Sparkles size={14} color={k.textMuted} />
                    <Text style={[s.metaText, { color: k.textMuted }]} numberOfLines={1}>{meal.prep_minutes} min prep</Text>
                  </View>
                )}
                {!!chef && (
                  <View style={s.metaChip}>
                    <UserRound size={14} color={k.textMuted} />
                    <Text style={[s.metaText, { color: k.textMuted }]} numberOfLines={1}>{chef}</Text>
                  </View>
                )}
              </View>

              {meal.ingredients?.length > 0 ? (
                <Well k={k} accent={accent} style={s.section}>
                  <Text style={[s.sectionTitle, { color: accent }]} numberOfLines={1}>Ingredients</Text>
                  {meal.ingredients.map((ing, i) => (
                    <Text key={i} style={[s.line, { color: k.text }]} numberOfLines={2}>• {ing}</Text>
                  ))}
                </Well>
              ) : (
                <EmptyNote text="No ingredients listed for this meal." k={k} />
              )}

              {meal.prep_steps?.length ? (
                <Well k={k} accent={accent} style={s.section}>
                  <Text style={[s.sectionTitle, { color: accent }]} numberOfLines={1}>Steps</Text>
                  {meal.prep_steps.map((step, i) => (
                    <Text key={i} style={[s.line, { color: k.text }]} numberOfLines={6}>{i + 1}. {step}</Text>
                  ))}
                </Well>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </KioskModalHost>
    </Modal>
  );
}

const s = StyleSheet.create({
  // Narrow right-anchored drawer — the same shape KioskAskFamDrawer uses.
  host: { flex: 1 },
  right: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  panel: { width: 480, maxWidth: '100%', height: '100%', borderLeftWidth: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.md,
    padding: KIOSK_SPACE.lg, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headIcon: {
    width: 48, height: 48, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: { fontSize: KIOSK_TYPO.micro, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', marginTop: 2 },
  closeBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  section: { gap: 4 },
  sectionTitle: { fontSize: KIOSK_TYPO.label, fontWeight: '900', marginBottom: 2 },
  line: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', lineHeight: KIOSK_TYPO.caption * 1.4 },
});
