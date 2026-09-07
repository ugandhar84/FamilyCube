/**
 * KioskDraggableItemRow — kiosk-native port of
 * features/grocery/components/DraggableItemRow.tsx: a drag handle that lets
 * a finger move a grocery item between store sections, live-requested on
 * top of the tap-based KioskStoreMoveSheet already shipped ("Yes, add real
 * drag-and-drop").
 *
 * This is the first GestureDetector/react-native-reanimated usage anywhere
 * in kiosk code — worth flagging because the phone's own version of this
 * exact feature has a documented native crash history (see below), so this
 * port reproduces every hardening fix from that history, not just the
 * surface behavior. GestureHandlerRootView is already mounted at the true
 * app root (app/_layout.tsx wraps the whole app, kiosk included), so no
 * additional root-level wiring is needed for this to work.
 *
 * ── Ported crash fix #1: inFlight keeps the row mounted through its own
 * drop ── A drop's own store mutation (KioskStoreMoveSheet's updateItem
 * call, or here the parent's handleDrop) can shrink the store-grouped list
 * down to one section, collapsing dragEnabled to false and unmounting this
 * row's GestureDetector — but that unmount is triggered BY the drop itself,
 * so without this guard it was possible (SIGSEGV, live-reported on the
 * phone) for React to tear the row down while the native gesture handler
 * was still mid-callback for that very drop. inFlight keeps the
 * GestureDetector mounted for the remainder of THIS row's own drag even if
 * dragEnabled goes false mid-gesture as a side effect of it, only actually
 * unmounting once onDrop has fully returned.
 *
 * ── Ported crash fix #2: stable runOnJS reference ── finishDrop is a
 * useCallback with an empty dep array (only ever reads onDropRef.current,
 * never a stale closed-over value) rather than a fresh closure allocated
 * every render. The parent's own hover/auto-scroll worklet has the sibling
 * fix for the SAME underlying crash class (a freshly-allocated closure
 * crossing the JSI/worklet boundary inside runOnJS) — see
 * KioskMealsTab.tsx's updateHoveredStore for that half.
 */
import { useCallback, useRef, useState } from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS, type SharedValue,
} from 'react-native-reanimated';
import { GripVertical } from 'lucide-react-native';
import type { KioskColors } from '../kioskPalette';

export function KioskDraggableItemRow({
  itemId, k, dragEnabled, draggingId, dragAbsoluteY, onDrop, children, style,
}: {
  itemId: string;
  k: KioskColors;
  // Off entirely during bulk operations or when there's only one store
  // section to drop into (the parent computes this the same way
  // GroceryItemsSection.tsx's own dragEnabled does).
  dragEnabled: boolean;
  draggingId: SharedValue<string | null>;
  dragAbsoluteY: SharedValue<number>;
  onDrop: (itemId: string, pageY: number) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const isActive = useSharedValue(false);
  const translateY = useSharedValue(0);
  const [inFlight, setInFlight] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const finishDrop = useCallback((id: string, y: number) => {
    try {
      onDropRef.current(id, y);
    } finally {
      setInFlight(false);
    }
  }, []);

  const pan = Gesture.Pan()
    .onStart(() => {
      isActive.value = true;
      draggingId.value = itemId;
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
      runOnJS(finishDrop)(itemId, finalY);
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
    <Animated.View style={[animatedStyle, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {(dragEnabled || inFlight) && (
          <GestureDetector gesture={pan}>
            <View style={{ width: 24, alignItems: 'center', justifyContent: 'center' }} hitSlop={{ left: 6, right: 2, top: 10, bottom: 10 }}>
              <GripVertical size={15} color={k.textFaint} />
            </View>
          </GestureDetector>
        )}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </Animated.View>
  );
}
