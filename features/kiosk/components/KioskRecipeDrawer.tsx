/**
 * KioskRecipeDrawer — one meal's full recipe detail (ingredients + prep
 * steps), opened by tapping one of the three Breakfast/Lunch/Dinner cards
 * on the kiosk Overview hero, or a meal line on the Meals tab. Deliberately
 * self-contained (its own Modal + KioskModalHost, not built on
 * KioskFormDrawer) so it doesn't collide with the shared-shell dialog/
 * drawer sizing work landing on this branch at the same time — this is
 * mostly display content, closer in shape to KioskAskFamDrawer (also
 * self-contained) than to the Ask-Parent forms.
 *
 * Shape: the narrow right-anchored, full-height drawer — the same shell
 * KioskAskFamDrawer uses (width ~480, height 100%, slide-in, scrim,
 * KeyboardAvoidingView, KioskModalHost). This was briefly a centered
 * content-sized dialog; the owner asked for it back to the drawer shape
 * specifically for this one, since a recipe's ingredients + numbered
 * steps can genuinely run long (unlike a single-textarea alert, where the
 * "why fill the whole screen for one field" complaint actually applies).
 *
 * Edit/Delete header actions — real mobile-parity affordances (DayCard.tsx's
 * own onEdit/onDelete), added on request: "there should be manual
 * addition/view/edit/delete right similar to the mobile but side forms
 * here in kiosk". Both optional/parent-gated by the caller (KioskMealsTab
 * passes them only when !isKid, matching every other write affordance on
 * that tab) — omit either to fall back to the original view-only drawer.
 * Edit opens KioskMealFormDrawer (this drawer closes itself first, same
 * "swap one drawer for another" pattern KioskGroceryItemSheet's own
 * edit-from-a-row flow uses); Delete asks to confirm inline rather than a
 * native Alert, matching this drawer's own visual language.
 *
 * Data: the caller passes one already-loaded Meal (from useKioskMeals'
 * week, the same source the Overview's meal-type cards and the Meals tab
 * both read) — no new query.
 *
 * Add to Grocery / Share Recipe footer actions — real mobile-parity
 * affordances ported from RecipeModal.tsx's own identically-named
 * handleAddToCart/shareRecipe (read in full before writing this): "Add to
 * Grocery" writes each ingredient to the real grocery store (same
 * addItem/categorizeItem the Meals tab's own quick-add row already calls),
 * skipping any name already on the list; "Share Recipe" posts the same
 * formatted family-chat message (title/emoji/prep time/rating stars/
 * ingredient list) via useChatStore.sendMessage('all', ...). Both optional
 * per caller — omit `familyId`/`onShare` context to fall back to the
 * original display-only drawer. RecipeModal.tsx itself is untouched.
 */
import { useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { ChefHat, Clock3, UserRound, Sparkles, X, Pencil, Trash2, ShoppingBag, Send, Check, Star } from 'lucide-react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { Meal } from '@/features/vault/tabs/meals/types';
import { useGroceryStore } from '@/store/groceryStore';
import { useChatStore } from '@/store/chatStore';
import { categorizeItem } from '@/features/vault/tabs/meals/types';
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
  visible, onClose, meal, members, k, onEdit, onDelete, familyId, senderId, hideAddToGrocery,
}: {
  visible: boolean;
  onClose: () => void;
  meal: Meal | null;
  members: FamilyMember[];
  k: KioskColors;
  /** Parent-only, per caller — omit to keep this a view-only drawer. */
  onEdit?: (meal: Meal) => void;
  onDelete?: (meal: Meal) => void;
  /** Both required together to show the Add to Grocery / Share Recipe
   *  footer — familyId for the grocery write, senderId (the active
   *  member) as the chat message's sender. Omit either to hide the
   *  footer entirely (matches every other optional-affordance prop here). */
  familyId?: string;
  senderId?: string;
  /** Hides just the "Add to Grocery" button, keeping "Share Recipe" —
   * kid/teen [live-requested: "remove add to grocey for the teens and
   * kids from recipie strip"], since grocery add is parent-only now but
   * recipe sharing was never an edit action. */
  hideAddToGrocery?: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [addingCart, setAddingCart] = useState(false);
  const [cartDone, setCartDone] = useState(false);
  if (!meal) return null;
  const accent = typeAccent(k, meal.type);
  const chef = members.find(m => m.id === meal.chef_id)?.name?.trim().split(' ')[0];

  const handleAddToCart = async () => {
    if (!familyId || addingCart || cartDone) return;
    setAddingCart(true);
    const { addItem, items: existing } = useGroceryStore.getState();
    const existingNames = new Set(existing.map(i => i.name.toLowerCase().trim()));
    // Same source-note convention as MealsTab.tsx's own addGroceryItems —
    // ItemCard.tsx/GroceryRow's subtitle line already renders item.notes,
    // this is just what actually gets written into it (live-requested:
    // "we should show the who added ai , which meal in the tiny text
    // under that groceries... what is the source of this.. in groceries").
    const source = `From ${meal.title}`;
    for (const name of meal.ingredients ?? []) {
      if (!existingNames.has(name.toLowerCase().trim())) {
        await addItem({ familyId, name, quantity: '1', category: categorizeItem(name), addedBy: senderId ?? '', aiGenerated: true, notes: source });
      }
    }
    setAddingCart(false);
    setCartDone(true);
  };

  const shareRecipe = () => {
    if (!senderId) return;
    // Real fixes, same as RecipeModal.tsx's own shareRecipe (mobile):
    //  1. "@all" was literal, unresolved text — now uses the app's actual
    //     @[Name|id] token format with the real, first-class synthetic id
    //     'everyone' (MentionText.tsx renders it as a genuine highlighted
    //     mention chip; mention-notify resolves 'everyone' server-side to
    //     every real member of the channel) — live-requested: "@all it
    //     should be alieas to mention evenryone in the chat" / "lets make
    //     that as @ everyone".
    //  2. Only ingredients were included — not a complete recipe. Now
    //     includes prep steps too, with the same generated-steps fallback
    //     RecipeModal.tsx uses when prep_steps is empty (live-requested:
    //     "oh when i share it should show the complete receipe in the
    //     chat").
    const ingredients = meal.ingredients ?? [];
    const steps = meal.prep_steps?.length ? meal.prep_steps : [
      `Gather all ingredients: ${ingredients.slice(0, 3).join(', ')}${ingredients.length > 3 ? ' and more' : ''}.`,
      `Prep and chop any vegetables. Season protein if applicable.`,
      `Cook for approximately ${Math.round((meal.prep_minutes ?? 30) * 0.6)} minutes.`,
      `Combine all components and cook ${Math.round((meal.prep_minutes ?? 30) * 0.3)} more minutes until done.`,
      `Plate and serve hot. Enjoy your ${meal.title}!`,
    ];
    const stars = '⭐'.repeat(meal.kid_friendly_rating ?? 3);
    const msg = `@[Everyone|everyone] 🍽️ *${meal.title}* ${meal.emoji ?? ''}\n⏱ ${meal.prep_minutes ?? '?'} min · ${stars}\n\n*Ingredients:*\n${ingredients.map(i => `• ${i}`).join('\n')}\n\n*Steps:*\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    useChatStore.getState().sendMessage('all', senderId, msg);
    onClose();
  };

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
              {!!onEdit && (
                <Pressable
                  onPress={() => onEdit(meal)} hitSlop={12}
                  style={[s.iconBtn, { backgroundColor: k.well }]}
                  accessibilityRole="button" accessibilityLabel="Edit meal"
                >
                  <Pencil size={17} color={k.textMuted} />
                </Pressable>
              )}
              {!!onDelete && (
                <Pressable
                  onPress={() => setConfirmingDelete(true)} hitSlop={12}
                  style={[s.iconBtn, { backgroundColor: k.well }]}
                  accessibilityRole="button" accessibilityLabel="Delete meal"
                >
                  <Trash2 size={17} color={k.danger} />
                </Pressable>
              )}
              <Pressable
                onPress={onClose} hitSlop={16}
                style={[s.closeBtn, { backgroundColor: k.well }]}
                accessibilityRole="button" accessibilityLabel="Close"
              >
                <X size={20} color={k.textMuted} />
              </Pressable>
            </View>

            {confirmingDelete && !!onDelete && (
              <View style={[s.confirmBar, { backgroundColor: k.dangerSoft, borderColor: k.dangerEdge }]}>
                <Text style={[s.confirmText, { color: k.danger }]}>Delete this meal?</Text>
                <View style={{ flexDirection: 'row', gap: KIOSK_SPACE.sm }}>
                  <Pressable
                    onPress={() => setConfirmingDelete(false)}
                    style={[s.confirmBtn, { borderColor: k.cardBorder }]}
                    accessibilityRole="button" accessibilityLabel="Cancel delete"
                  >
                    <Text style={[s.confirmBtnText, { color: k.textMuted }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setConfirmingDelete(false); onDelete(meal); }}
                    style={[s.confirmBtn, { backgroundColor: k.danger, borderColor: k.danger }]}
                    accessibilityRole="button" accessibilityLabel="Confirm delete"
                  >
                    <Text style={[s.confirmBtnText, { color: '#fff' }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            )}

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

            {/* Add to Grocery / Share Recipe — real mobile-parity footer,
                ported from RecipeModal.tsx's own FAB row. Requires both
                familyId and senderId (the caller omits them to keep this a
                pure display drawer, e.g. anywhere it's mounted without a
                real active member/family in scope). */}
            {!!familyId && !!senderId && (
              <View style={[s.footer, { borderTopColor: k.cardBorder }]}>
                {/* Add to Grocery — parent-only [live-requested: "remove
                    add to grocey for the teens and kids from recipie
                    strip"]. Share Recipe stays for everyone below — it
                    was never a grocery-edit action. */}
                {!hideAddToGrocery && (
                  <Pressable
                    onPress={handleAddToCart}
                    disabled={addingCart || cartDone}
                    style={[s.footerBtn, { backgroundColor: cartDone ? k.sage : k.blue }]}
                    accessibilityRole="button"
                    accessibilityLabel={cartDone ? 'Added to grocery list' : 'Add ingredients to grocery list'}
                  >
                    {addingCart
                      ? <ActivityIndicator size="small" color={k.onAccent} />
                      : cartDone
                        ? <><Check size={15} color={k.onAccent} /><Text style={[s.footerBtnText, { color: k.onAccent }]}>Added!</Text></>
                        : <><ShoppingBag size={15} color={k.onAccent} /><Text style={[s.footerBtnText, { color: k.onAccent }]}>Add to Grocery</Text></>}
                  </Pressable>
                )}
                <Pressable
                  onPress={shareRecipe}
                  style={[s.footerBtn, { backgroundColor: accent }]}
                  accessibilityRole="button"
                  accessibilityLabel="Share this recipe to family chat"
                >
                  <Send size={15} color={k.onAccent} />
                  <Text style={[s.footerBtnText, { color: k.onAccent }]}>Share Recipe</Text>
                </Pressable>
              </View>
            )}
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
  iconBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: KIOSK_SPACE.lg, marginTop: KIOSK_SPACE.md,
    padding: KIOSK_SPACE.md, borderRadius: KIOSK_RADIUS.md, borderWidth: 1,
  },
  confirmText: { fontSize: KIOSK_TYPO.caption, fontWeight: '700', flex: 1 },
  confirmBtn: {
    paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.xs,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
  },
  confirmBtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  footer: {
    flexDirection: 'row', gap: KIOSK_SPACE.sm,
    padding: KIOSK_SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: KIOSK_RADIUS.md, paddingVertical: KIOSK_SPACE.md,
  },
  footerBtnText: { fontSize: KIOSK_TYPO.label, fontWeight: '900' },
  body: { padding: KIOSK_SPACE.lg, gap: KIOSK_SPACE.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  section: { gap: 4 },
  sectionTitle: { fontSize: KIOSK_TYPO.label, fontWeight: '900', marginBottom: 2 },
  line: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', lineHeight: KIOSK_TYPO.caption * 1.4 },
});
