import { PageHeading } from '@/components/PageHeading';
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView,
  StyleSheet, Animated, Easing, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Send, ShoppingBag, ChefHat } from 'lucide-react-native';
import { useChatStore } from '@/store/chatStore';
import { useFamilyStore } from '@/store/familyStore';
import { Meal } from './types';
import SwipeBackWrapper from '@/components/SwipeBackWrapper';
import { GEMINI } from '@/constants/geminiRhythm';

// ─── Recipe Detail — full-page overlay ────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');

export default function RecipeModal({ meal, visible, onClose, onEdit, onAddToGrocery, senderId, colors, isDark, hideAddToGrocery }: {
  meal: Meal | null; visible: boolean; onClose: () => void;
  onEdit?: (meal: Meal) => void;
  onAddToGrocery: (items: string[]) => Promise<void>;
  senderId: string; colors: any; isDark: boolean;
  hideAddToGrocery?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { members } = useFamilyStore();
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const activeMember = members.find(m => (m as any).id === senderId) ?? members[0];

  const [addingCart, setAddingCart] = useState(false);
  const [cartDone,   setCartDone]   = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  // Animation — slide in/out from the right, matching FullPageOverlay's
  // rhythm (every other full-page screen in the app), instead of the old
  // vertical slide-up this component hand-rolled on its own.
  const slideAnim = useRef(new Animated.Value(SCREEN_W)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const closing   = useRef(false);
  useEffect(() => {
    if (visible) {
      closing.current = false;
      setCartDone(false);
      slideAnim.setValue(SCREEN_W); fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const animatedClose = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: SCREEN_W, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 0,         duration: 200, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onClose(); });
  };

  if (!meal || !visible) return null;

  const P = colors.primary;

  const steps = meal.prep_steps?.length ? meal.prep_steps : [
    `Gather all ingredients: ${meal.ingredients.slice(0, 3).join(', ')}${meal.ingredients.length > 3 ? ' and more' : ''}.`,
    `Prep and chop any vegetables. Season protein if applicable.`,
    `Cook for approximately ${Math.round((meal.prep_minutes ?? 30) * 0.6)} minutes.`,
    `Combine all components and cook ${Math.round((meal.prep_minutes ?? 30) * 0.3)} more minutes until done.`,
    `Plate and serve hot. Enjoy your ${meal.title}!`,
  ];

  const handleAddToCart = async () => {
    setAddingCart(true);
    await onAddToGrocery(meal.ingredients);
    setAddingCart(false);
    setCartDone(true);
    closeTimer.current = setTimeout(() => animatedClose(), 1200);
  };

  const shareRecipe = () => {
    const msg = `@[Everyone|everyone] 🍽️ *${meal.title}* ${meal.emoji ?? ''}\n⏱ ${meal.prep_minutes ?? '?'} min\n\n*Ingredients:*\n${meal.ingredients.map(i => `• ${i}`).join('\n')}\n\n*Steps:*\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    useChatStore.getState().sendMessage('all', senderId, msg);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    animatedClose();
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }}>
      <SwipeBackWrapper onDismiss={onClose} backgroundColor={isDark ? colors.background : GEMINI.canvas}>
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
          <View style={{ flex: 1, backgroundColor: isDark ? colors.background : GEMINI.canvas }}>

            {/* ── Header — canvas + "tap title to go back" pattern, same as
                the rest of the Meals module
                [live-requested: "make the gemini rythem everywhere in the
                meals"]. ── */}
            <PageHeading
              eyebrow="FAMILY CUBE · MEALS"
              title={meal.title}
              subtitle={`Planned · ${meal.day}${meal.ai_generated ? ' · Cube' : ''}`}
              accent="teal"
              Icon={ChefHat}
              onTitlePress={animatedClose}
              topInset={insets.top}
            />

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 32, gap: 24 }}>

              {/* Info card */}
              <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1,
                borderColor: colors.border, padding: 16, gap: 6,
                shadowColor: isDark ? 'transparent' : '#172337',
                shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 }, elevation: isDark ? 0 : 1,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 22 }}>{meal.emoji ?? '🍽️'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }}>
                      {meal.start_time ?? 'No time set'} · {meal.chef_id
                        ? `${(members.find(m => (m as any).id === meal.chef_id) as any)?.name?.split(' ')[0] ?? 'Chef'} cooks`
                        : 'No chef assigned'}
                    </Text>
                    <Text style={{ fontSize: 13, color: (isDark ? colors.textSecondary : GEMINI.bodyColor), marginTop: 2 }}>
                      {[
                        meal.prep_minutes ? `about ${meal.prep_minutes} minutes` : null,
                        (meal as any).recipe_text ? 'Family recipe' : null,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>

                {/* Dietary tags */}
                {(meal.dietary_tags ?? []).length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {(meal.dietary_tags ?? []).map(tag => (
                      <View key={tag} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
                        backgroundColor: colors.teal + '20' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.teal }}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Edit meal button — only shown when caller provides onEdit */}
                {!!onEdit && (
                  <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                    marginTop: 8, overflow: 'hidden' }}>
                    <TouchableOpacity onPress={() => { onClose(); onEdit(meal); }}
                      style={{ paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: P }}>Edit meal</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Full recipe text if present */}
              {!!(meal as any).recipe_text && (
                <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1,
                  borderColor: colors.border, padding: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: (isDark ? colors.textPrimary : GEMINI.titleColor), marginBottom: 8 }}>
                    Recipe notes
                  </Text>
                  <Text style={{ fontSize: 14, color: (isDark ? colors.textSecondary : GEMINI.bodyColor), lineHeight: 22 }}>
                    {(meal as any).recipe_text}
                  </Text>
                </View>
              )}

              {/* Ingredients */}
              <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1,
                borderColor: colors.border, padding: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: (isDark ? colors.textPrimary : GEMINI.titleColor), marginBottom: 12 }}>
                  Ingredients · serves {(meal as any).servings ?? members.length}
                </Text>
                <View style={{ gap: 10 }}>
                  {meal.ingredients.map((ing, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal, marginTop: 1 }} />
                      <Text style={{ fontSize: 15, color: (isDark ? colors.textPrimary : GEMINI.titleColor), fontWeight: '500', flex: 1 }}>{ing}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Steps */}
              <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1,
                borderColor: colors.border, padding: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: (isDark ? colors.textPrimary : GEMINI.titleColor), marginBottom: 12 }}>
                  How to make it
                </Text>
                <View style={{ gap: 16 }}>
                  {steps.map((step, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: P + '18',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: P }}>{i + 1}</Text>
                      </View>
                      <Text style={{ fontSize: 14, color: (isDark ? colors.textSecondary : GEMINI.bodyColor), flex: 1, lineHeight: 22, paddingTop: 3 }}>
                        {step}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* ── Action buttons — scroll with content ── */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {!hideAddToGrocery && (
                  <TouchableOpacity onPress={handleAddToCart} disabled={addingCart || cartDone}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      borderRadius: 14, paddingVertical: 15,
                      backgroundColor: cartDone ? colors.success : colors.teal }}>
                    {addingCart
                      ? <ActivityIndicator size="small" color="#fff" />
                      : cartDone
                        ? <><Check size={16} color="#fff" /><Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Added!</Text></>
                        : <><ShoppingBag size={16} color="#fff" /><Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Add to grocery</Text></>}
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={shareRecipe}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    borderRadius: 14, paddingVertical: 15, backgroundColor: colors.accent }}>
                  <Send size={16} color="#fff" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Share recipe</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>

          </View>
        </Animated.View>
      </SwipeBackWrapper>
    </View>
  );
}
