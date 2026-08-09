import React, { memo, useState } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LazyImage from '@/components/LazyImage';

type Props = {
  eg: { eventLabel: string | null; photos: any[] };
  isLast: boolean;
  colors: any;
  GRID_GAP: number;
  THUMB4: number;
  onOpen: (p: any) => void;
  MOOD_EMOJI: Record<string, string>;
  s: any;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
};

const TimelineEventGroup = memo(function TimelineEventGroup({
  eg, isLast, colors, GRID_GAP, THUMB4, onOpen, MOOD_EMOJI, s,
  selectionMode, selectedIds, onToggleSelect,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const MAX_SHOW = 8;
  const shown = eg.photos.slice(0, MAX_SHOW);
  const extra = eg.photos.length - MAX_SHOW;

  return (
    <View style={{ flexDirection: 'row' }}>
      {/* Timeline column */}
      <View style={{ width: 28, alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => eg.eventLabel && setCollapsed(c => !c)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={eg.eventLabel ? 0.7 : 1}>
          <View style={{
            width: 10, height: 10, borderRadius: 5, marginTop: 4,
            backgroundColor: eg.eventLabel ? colors.primary : colors.border,
            borderWidth: 2, borderColor: eg.eventLabel ? `${colors.primary}40` : colors.border,
          }} />
        </TouchableOpacity>
        {!isLast && (
          <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginTop: 4, marginBottom: 4, borderRadius: 1 }} />
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingLeft: 8, paddingBottom: isLast ? 0 : 16 }}>
        {eg.eventLabel && (
          <TouchableOpacity onPress={() => setCollapsed(c => !c)} activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: collapsed ? 4 : 10 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>Event</Text>
              <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.2 }}>{eg.eventLabel}</Text>
            </View>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>{eg.photos.length}</Text>
            <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {!collapsed && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
            {shown.map((p: any, i: number) => {
              const isMoreThumb = i === MAX_SHOW - 1 && extra > 0;
              const isSelected = selectedIds.has(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={{ width: THUMB4, height: THUMB4, borderRadius: 8, overflow: 'hidden',
                    borderWidth: isSelected ? 3 : 0, borderColor: colors.primary }}
                  activeOpacity={0.85}
                  onLongPress={() => onToggleSelect(p.id)}
                  onPress={() => {
                    if (selectionMode) { onToggleSelect(p.id); return; }
                    onOpen(isMoreThumb ? eg.photos[MAX_SHOW - 1] : p);
                  }}>
                  <LazyImage uri={p.url} style={s.thumbImg} resizeMode="cover" />
                  {isMoreThumb && !selectionMode && (
                    <View style={[s.thumbOverlay, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                      <Text style={s.thumbMoreText}>+{extra}</Text>
                    </View>
                  )}
                  {!isMoreThumb && p.mood_label ? (
                    <View style={s.thumbBadge}><Text style={s.thumbEmoji}>{MOOD_EMOJI[p.mood_label] ?? '🐾'}</Text></View>
                  ) : null}
                  {selectionMode && (
                    <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: isSelected ? `${colors.primary}30` : 'rgba(0,0,0,0.15)', alignItems: 'flex-end', padding: 5 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                        borderColor: isSelected ? colors.primary : '#fff',
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                        alignItems: 'center', justifyContent: 'center' }}>
                        {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
});

export default TimelineEventGroup;
