import { useState, useCallback, useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Owns multi-select UI state and the toolbar slide animation.
 * Selection/deselect wiring and selectAll are handled in the screen
 * since allIds come from the data hook (avoids circular hook dep).
 */
export function useNotifSelection() {
  const [selecting, setSelecting] = useState(false);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const toolbarY = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    Animated.spring(toolbarY, { toValue: selecting ? 0 : 100, useNativeDriver: true, tension: 80, friction: 12 }).start();
    if (!selecting) setSelected(new Set());
  }, [selecting]);

  const toggleItem = useCallback((id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  return { selecting, setSelecting, selected, setSelected, toggleItem, toolbarY };
}
