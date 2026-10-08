/**
 * ReviewCategoryQueueScreen — a category's own pending-items list, the
 * screen each landing card on ReviewInboxScreen opens into.
 *
 * Live direction: "review inbox should contain the high-level cards, land
 * then open those chore box, schedule box ... why are we directly adding
 * the review inbox with real content?" — the inbox previously flattened
 * every pending chore/quest/redemption into one combined list up front.
 * It's now a landing page of category cards (counts only); this screen is
 * what a card opens into — one category's real list, each row still
 * routing to its own existing single-item detail screen
 * (ChoreProofReviewScreen/QuestReviewScreen/RewardReviewScreen). Kid
 * requests don't use this screen — HelpDispatchQueue is already its own
 * real queue UI with per-request decline-reason/helper-assignment
 * controls that don't reduce to a simple row.
 */
import React from 'react';
import {
  View, Text, ScrollView, Pressable, TouchableOpacity, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';

export interface QueueRow {
  id: string;
  title: string;
  detail: string;
}

export function ReviewCategoryQueueScreen({
  title, icon, accentColor, accentBg, rows, onSelectRow, onClose,
}: {
  title: string;
  icon?: React.ReactNode;
  accentColor: string;
  accentBg: string;
  rows: QueueRow[];
  onSelectRow: (id: string) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardWhiteBg = isDark ? colors.card : '#FFFFFF';

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{
        paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas, gap: 8,
      }}>
        <View style={{ gap: 4 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: accentColor, lineHeight: 18 }}>← Review inbox</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{
          backgroundColor: cardWhiteBg, borderRadius: 16, padding: 16, gap: 12,
          ...Platform.select({
            ios: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.18 : 0.07, shadowRadius: 8 },
            android: { elevation: 2 },
          }),
        }}>
          {rows.length === 0 ? (
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary, lineHeight: 25 }}>
              Nothing pending in this category right now.
            </Text>
          ) : (
            rows.map((row, i) => (
              <Pressable
                key={row.id}
                onPress={() => onSelectRow(row.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 4 })}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 21 }} numberOfLines={1}>
                  {row.title}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                  {row.detail}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: accentColor, lineHeight: 18 }}>
                  Open for review →
                </Text>
                {i < rows.length - 1 && (
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 6 }} />
                )}
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
