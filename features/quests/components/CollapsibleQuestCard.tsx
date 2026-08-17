import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { I } from './icons';
import { s } from './questCardStyles';

// ─── Collapsible quest card — header always visible, body expands on tap ─────
export function CollapsibleQuestCard({
  accentColor, cardBg, cardBord, header, children, onDoubleTap, onLongPress, initiallyExpanded = false,
}: {
  accentColor: string; cardBg: string; cardBord: string;
  header: React.ReactNode; children: React.ReactNode;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const lastTap = React.useRef(0);
  const handlePress = () => {
    const now = Date.now();
    if (onDoubleTap && now - lastTap.current < 320) {
      onDoubleTap();
    } else {
      setExpanded(e => !e);
    }
    lastTap.current = now;
  };
  return (
    <View style={[s.questCard, { backgroundColor: cardBg, borderColor: cardBord }]}>
      <View style={[s.accentBar, { backgroundColor: accentColor }]} />
      <View style={{ flex: 1 }}>
        <Pressable onPress={handlePress} onLongPress={onLongPress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, paddingBottom: expanded ? 0 : 14 }}>
          <View style={{ flex: 1 }}>{header}</View>
          {expanded ? <I.ChevronUp c={accentColor} /> : <I.ChevronDown c={accentColor} />}
        </Pressable>
        {expanded && (
          <Pressable onLongPress={onLongPress} style={{ padding: 14, paddingTop: 10 }}>
            {children}
          </Pressable>
        )}
      </View>
    </View>
  );
}
