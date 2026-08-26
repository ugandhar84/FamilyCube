import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X, Send, Star, ShoppingBag } from 'lucide-react-native';
import { useChatStore } from '@/store/chatStore';
import { Meal } from './types';
import { rm } from './styles';

// ─── Recipe Modal ─────────────────────────────────────────────────────────────

export default function RecipeModal({ meal, visible, onClose, onAddToGrocery, senderId, colors, isDark }: {
  meal: Meal | null; visible: boolean; onClose: () => void;
  onAddToGrocery: (items: string[]) => Promise<void>;
  senderId: string; colors: any; isDark: boolean;
}) {
  const [addingCart, setAddingCart] = useState(false);
  const [cartDone,   setCartDone]   = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) { setCartDone(false); }
  }, [visible]);

  if (!meal) return null;

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
    setTimeout(() => onClose(), 1200);
  };

  const shareRecipe = () => {
    const stars = '⭐'.repeat(meal.kid_friendly_rating ?? 3);
    const msg = `@all 🍽️ *${meal.title}* ${meal.emoji ?? ''}\n⏱ ${meal.prep_minutes ?? '?'} min · ${stars}\n\n*Ingredients:*\n${meal.ingredients.map(i => `• ${i}`).join('\n')}`;
    useChatStore.getState().sendMessage('all', senderId, msg);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[rm.modal, { backgroundColor: isDark ? colors.background : colors.pinkLight }]}>
        {/* Header */}
        <View style={[rm.header, { borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}>
            {meal.emoji ? <Text style={{ fontSize: 36, lineHeight: 44 }}>{meal.emoji}</Text> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary, lineHeight: 23 }} numberOfLines={3}>
                {meal.title}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.pink, marginTop: 3 }}>
                {meal.day} · {meal.prep_minutes ?? '?'} min prep
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4, marginLeft: 8 }}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
          {/* Tags */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {(meal.kid_friendly_rating ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                {Array.from({ length: meal.kid_friendly_rating! }).map((_, i) => (
                  <Star key={i} size={13} fill={colors.pink} color={colors.pink} />
                ))}
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.pink, marginLeft: 3 }}>Kid Approved</Text>
              </View>
            )}
            {(meal.dietary_tags ?? []).map(tag => (
              <View key={tag} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.teal + '20' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.teal }}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Ingredients */}
          <View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary, marginBottom: 8 }}>Ingredients</Text>
            <View style={{ gap: 6 }}>
              {meal.ingredients.map((ing, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal }} />
                  <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '600' }}>{ing}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Steps */}
          <View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: colors.textPrimary, marginBottom: 8 }}>Step-by-Step</Text>
            <View style={{ gap: 10 }}>
              {steps.map((step, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Footer buttons */}
        <View style={{ position: 'absolute', bottom: insets.bottom + 16, left: 16, right: 16, flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={handleAddToCart} disabled={addingCart || cartDone}
            style={[rm.fab, { backgroundColor: cartDone ? colors.success : colors.teal, flex: 1 }]}>
            {addingCart
              ? <ActivityIndicator size="small" color="#fff" />
              : cartDone
                ? <><Check size={15} color="#fff" /><Text style={rm.fabTxt}>Added to Grocery!</Text></>
                : <><ShoppingBag size={15} color="#fff" /><Text style={rm.fabTxt}>Add to Grocery</Text></>}
          </TouchableOpacity>
          <TouchableOpacity onPress={shareRecipe} style={[rm.fab, { backgroundColor: colors.accent, flex: 1 }]}>
            <Send size={15} color="#fff" />
            <Text style={rm.fabTxt}>Share Recipe</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
