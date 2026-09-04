/**
 * DraggableItemRow — wraps ItemCard with a drag handle that lets a user move
 * an item between store sections by dragging with their finger, per user
 * request ("drag and drop between the stores move with finger"). A separate
 * grip icon (not long-press on the row itself) triggers the drag, since
 * long-press on the row is already bulk-select's own trigger.
 *
 * Cross-SECTION dragging (not just reordering within one list) means the
 * usual "swap index in a flat array" trick doesn't apply — this row only
 * tracks its own translateY for the visual "lift" effect and reports the
 * finger's absolute page Y (dragAbsoluteY, shared with the parent) plus a
 * final drop callback. GroceryItemsSection owns the actual section-bounds
 * measurement, hit-testing, and the parent ScrollView's auto-scroll near
 * viewport edges — this component has no knowledge of sections at all.
 */
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS, type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ItemCard } from './ItemCard';
import type { GroceryItem } from '@/store/groceryStore';

export function DraggableItemRow({
  item, members, selected, selecting, isLast, priceInfo,
  onPress, onBuy, onLongPress, onToggleSelect, onEdit, onDelete, onMoveStore,
  colors, isDark,
  dragEnabled, draggingId, dragAbsoluteY, onDrop,
}: {
  item: GroceryItem; members: any[];
  selected: boolean; selecting: boolean; isLast?: boolean;
  priceInfo?: { price: number | null; unit: string | null; source: 'kroger' | 'receipt' | 'estimate' | 'unrecognized' | 'unknown' };
  onPress: () => void; onBuy: () => void; onLongPress: () => void; onToggleSelect: () => void;
  onEdit: () => void; onDelete?: () => void; onMoveStore?: () => void;
  colors: any; isDark: boolean;
  // Drag is off entirely during bulk-select (selecting) or when the caller
  // has no drop targets to offer (e.g. kid view) — dragEnabled covers both.
  dragEnabled: boolean;
  draggingId: SharedValue<string | null>;
  dragAbsoluteY: SharedValue<number>;
  onDrop: (itemId: string, pageY: number) => void;
}) {
  const isActive = useSharedValue(false);
  const translateY = useSharedValue(0);
  // Was: handleDrop's own store mutation (updateItem) can shrink
  // groupedItems down to one store section, collapsing the parent's
  // dragEnabled to false and unmounting this row's GestureDetector — but
  // that mutation is triggered BY the drop itself, so it was possible for
  // the unmount to land while the native gesture handler was still mid-
  // callback for that very drop. Crashed live (SIGSEGV inside
  // RNGestureHandler handleGesture: → Reanimated worklet dispatch — a
  // stale/torn-down JSI function pointer, "possible pointer authentication
  // failure") while dragging a grocery item between stores. inFlight keeps
  // the GestureDetector mounted for the remainder of this row's OWN drag
  // even if dragEnabled goes false mid-gesture as a side effect of it,
  // only actually unmounting once onDrop has fully returned.
  const [inFlight, setInFlight] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const finishDrop = (id: string, y: number) => {
    try {
      onDropRef.current(id, y);
    } finally {
      setInFlight(false);
    }
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      isActive.value = true;
      draggingId.value = item.id;
      runOnJS(setInFlight)(true);
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
      dragAbsoluteY.value = e.absoluteY;
    })
    .onEnd((e) => {
      const finalY = e.absoluteY;
      isActive.value = false;
      draggingId.value = null;
      translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      runOnJS(finishDrop)(item.id, finalY);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: isActive.value ? 1.03 : 1 }],
    zIndex: isActive.value ? 10 : 0,
    opacity: isActive.value ? 0.92 : 1,
    shadowColor: '#000',
    shadowOpacity: isActive.value ? 0.25 : 0,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: isActive.value ? 6 : 0,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {(dragEnabled || inFlight) && (
          <GestureDetector gesture={pan}>
            <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }} hitSlop={{ left: 6, right: 2 }}>
              <Ionicons name="reorder-two" size={16} color={colors.textTertiary} />
            </View>
          </GestureDetector>
        )}
        <View style={{ flex: 1 }}>
          <ItemCard
            item={item} members={members} selected={selected} selecting={selecting} isLast={isLast}
            priceInfo={priceInfo} onPress={onPress} onBuy={onBuy} onLongPress={onLongPress}
            onToggleSelect={onToggleSelect} onEdit={onEdit} onDelete={onDelete} onMoveStore={onMoveStore}
            colors={colors} isDark={isDark}
          />
        </View>
      </View>
    </Animated.View>
  );
}
