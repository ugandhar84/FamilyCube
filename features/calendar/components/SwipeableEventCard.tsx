/**
 * SwipeableEventCard — swipe left to reveal delete. Extracted from
 * CalendarScreen.tsx (previously Day-view-local) so AgendaView can reuse
 * the exact same interaction instead of Agenda having no delete gesture at
 * all — live-reported: "i want swipe left to delete these events" while
 * looking at the Agenda tab specifically, which never had this.
 *
 * `selectMode` swaps the swipe gesture for a plain checkbox tap — used by
 * AgendaView's explicit "Select" header toggle for bulk delete. The two
 * modes are mutually exclusive per card (selectMode disables the pan
 * responder entirely) so a stray horizontal drag while selecting rows
 * can't also trigger the swipe-delete reveal underneath.
 */
import React, { useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, TouchableOpacity } from 'react-native';

export default function SwipeableEventCard({
  children, onDelete, onLongPress, onPress, canDelete,
  selectMode = false, selected = false, onToggleSelect,
}: {
  children: React.ReactNode; onDelete: () => void; onLongPress: () => void; onPress?: () => void; canDelete: boolean;
  selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void;
}) {
  const tx      = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  const DELETE_W = 84;

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => canDelete && !selectMode && Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderMove: (_, g) => {
      if (!canDelete || selectMode) return;
      const base = open ? -DELETE_W : 0;
      const clamped = Math.max(-DELETE_W, Math.min(0, base + g.dx));
      tx.setValue(clamped);
    },
    onPanResponderRelease: (_, g) => {
      if (!canDelete || selectMode) return;
      const dest = (open ? g.dx < DELETE_W / 2 : g.dx < -(DELETE_W / 2)) ? -DELETE_W : 0;
      setOpen(dest !== 0);
      Animated.spring(tx, { toValue: dest, useNativeDriver: true, friction: 7, tension: 60 }).start();
    },
  })).current;

  const close = () => {
    setOpen(false);
    Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
  };

  return (
    <View style={{ flexDirection: 'row', overflow: 'hidden', alignItems: 'center', gap: 8 }}>
      {selectMode && (
        <TouchableOpacity
          onPress={onToggleSelect}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 4 }}
          style={{
            width: 24, height: 24, borderRadius: 7, borderWidth: 2,
            borderColor: selected ? '#7B5EA7' : '#C4C0CC',
            backgroundColor: selected ? '#7B5EA7' : 'transparent',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {selected && <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>✓</Text>}
        </TouchableOpacity>
      )}
      <Animated.View
        {...(selectMode ? {} : pan.panHandlers)}
        style={{ flexDirection: 'row', transform: [{ translateX: tx }], flex: 1 }}
      >
        {/* Card content — takes full width, slides left */}
        <View style={{ width: '100%' }}>
          <TouchableOpacity
            activeOpacity={0.88}
            onLongPress={selectMode ? onToggleSelect : onLongPress}
            onPress={selectMode ? onToggleSelect : (open ? close : onPress)}
            delayLongPress={450}
          >
            {children}
          </TouchableOpacity>
        </View>

        {/* Delete zone — revealed when slid left */}
        {canDelete && !selectMode && (
          <TouchableOpacity
            onPress={() => { close(); onDelete(); }}
            style={{
              width: DELETE_W, alignItems: 'center', justifyContent: 'center', gap: 4,
              backgroundColor: '#EF4444', borderRadius: 18,
              marginLeft: 8, flexShrink: 0,
            }}
          >
            <Text style={{ fontSize: 22 }}>🗑️</Text>
            <Text style={{ fontSize: 10, color: '#fff', fontWeight: '900', letterSpacing: 0.5 }}>
              Delete
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}
