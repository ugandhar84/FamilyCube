import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { I } from './icons';
import { s } from './questCardStyles';

// ─── Collapsible quest card — header always visible, body expands on tap ─────
export function CollapsibleQuestCard({
  accentColor, cardBg, cardBord, header, children, onDoubleTap, onLongPress, initiallyExpanded = false, dimmed = false, pinnedFooter,
}: {
  accentColor: string; cardBg: string; cardBord: string;
  header: React.ReactNode; children: React.ReactNode;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  initiallyExpanded?: boolean;
  // Final-approved quests read as settled, past business — everything about
  // them is locked except the parent's private note, so the card itself
  // should look done, not equally "live" as an in-progress one.
  dimmed?: boolean;
  // Rendered inside the card but OUTSIDE the dimmed wrapper — RN opacity
  // cascades to every descendant with no per-child override, so anything
  // that must stay fully legible on a dimmed card (the parent's private
  // note) has to live in its own sibling section, not inside `children`.
  pinnedFooter?: React.ReactNode;
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
    <View style={[s.questCard, { backgroundColor: cardBg, borderColor: cardBord, flexDirection: 'column' }]}>
      <View style={{ flexDirection: 'row', opacity: dimmed ? 0.55 : 1 }}>
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
      {pinnedFooter && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: dimmed ? 0 : 4 }}>
          {pinnedFooter}
        </View>
      )}
    </View>
  );
}
