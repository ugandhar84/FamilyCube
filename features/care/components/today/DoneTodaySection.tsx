import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime } from '@/lib/units';
import { showAlert } from '@/components/AppAlert';
import type { DoneEntry } from './todayTypes';
import type { Pet } from '@/lib/types';
import { TYPO } from '@/constants/theme';

interface Props {
  entries: DoneEntry[];
  colors: any;
  petColor: (p: Pet) => string;
  multiPet: boolean;
  onUndo?: (entry: DoneEntry) => Promise<void>;
}

export default function DoneTodaySection({ entries, colors, petColor, multiPet, onUndo }: Props) {
  const [expanded, setExpanded]       = useState(false);
  const [undoing,  setUndoing]        = useState<string | null>(null);

  const confirmUndo = (entry: DoneEntry) => {
    showAlert(
      'Undo this entry?',
      `"${entry.label}" will be removed from today's log.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setUndoing(entry.id);
            await onUndo?.(entry).catch(() => {});
            setUndoing(null);
          },
        },
      ],
    );
  };
  const PREVIEW = 4;
  const shown = expanded ? entries : entries.slice(0, PREVIEW);
  const hasMore = entries.length > PREVIEW;

  return (
    <View style={tl.section}>
      <View style={tl.sectionHeader}>
        <Text style={[tl.sectionLabel, { color: colors.textSecondary }]}>Done today</Text>
        {entries.length > 0 && (
          <View style={[tl.badge, { backgroundColor: colors.success + '22' }]}>
            <Text style={[tl.badgeText, { color: colors.success }]}>{entries.length}</Text>
          </View>
        )}
      </View>

      {entries.length === 0 ? (
        <View style={[tl.allGood, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: TYPO.title }}>🌅</Text>
          <View style={{ flex: 1 }}>
            <Text style={[tl.allGoodTitle, { color: colors.textPrimary }]}>Nothing yet</Text>
            <Text style={[tl.allGoodSub, { color: colors.textSecondary }]}>Completed items will show up here</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={[tl.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {shown.map((entry, idx) => {
              const pc = petColor(entry.pet);
              const isLast = idx === shown.length - 1;
              return (
                <View key={entry.id} style={tl.row}>
                  <View style={tl.timelineCol}>
                    <View style={[tl.dot, { backgroundColor: pc, borderColor: colors.card }]} />
                    {!isLast && <View style={[tl.line, { backgroundColor: colors.border }]} />}
                  </View>
                  <View style={[tl.content, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <Text style={{ fontSize: TYPO.heading, marginRight: 8 }}>{entry.emoji}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[tl.label, { color: colors.textPrimary }]} numberOfLines={1}>
                        {entry.label}
                      </Text>
                      {multiPet && (
                        <Text style={[tl.petName, { color: pc }]} numberOfLines={1}>
                          {(entry.pet as any).emoji ?? '🐾'} {entry.pet.name}
                        </Text>
                      )}
                    </View>
                    <Text style={[tl.time, { color: colors.textSecondary }]}>
                      {formatTime(new Date(entry.time))}
                    </Text>
                    {onUndo && (
                      <TouchableOpacity
                        onPress={() => confirmUndo(entry)}
                        activeOpacity={0.65}
                        disabled={undoing === entry.id}
                        style={[tl.undoBtn, { opacity: undoing === entry.id ? 0.4 : 0.6 }]}>
                        <Ionicons name="arrow-undo" size={14} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {hasMore && (
            <TouchableOpacity
              onPress={() => setExpanded(e => !e)}
              activeOpacity={0.7}
              style={tl.showMore}>
              <Text style={[tl.showMoreText, { color: colors.primaryText ?? colors.primary }]}>
                {expanded ? 'Show less ↑' : `Show ${entries.length - PREVIEW} more ↓`}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const tl = StyleSheet.create({
  section:      { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel:  { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  badge:        { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText:    { fontSize: TYPO.label, fontWeight: '800' },
  allGood:      { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  allGoodTitle: { fontSize: TYPO.body, fontWeight: '700' },
  allGoodSub:   { fontSize: TYPO.caption, marginTop: 2 },
  card:         { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row:          { flexDirection: 'row', minHeight: 52 },
  timelineCol:  { width: 36, alignItems: 'center', paddingTop: 16 },
  dot:          { width: 12, height: 12, borderRadius: 6, borderWidth: 2, zIndex: 1 },
  line:         { width: 2, flex: 1, marginTop: 2 },
  content:      { flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 14, paddingVertical: 12, gap: 0 },
  label:        { fontSize: TYPO.caption, fontWeight: '600' },
  petName:      { fontSize: TYPO.label, fontWeight: '700', marginTop: 2 },
  time:         { fontSize: TYPO.label, flexShrink: 0, fontWeight: '500', marginLeft: 8 },
  undoBtn:      { padding: 6, marginLeft: 4 },
  showMore:     { alignItems: 'center', paddingVertical: 12 },
  showMoreText: { fontSize: TYPO.caption, fontWeight: '700' },
});
