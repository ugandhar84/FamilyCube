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
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { GEMINI } from '@/constants/geminiRhythm';
import { OverlayHeading } from '@/components/OverlayPage';

export interface QueueRow {
  id: string;
  title: string;
  detail: string;
}

export function ReviewCategoryQueueScreen({
  title, subtitle, accentColor, accentBg, rows, onSelectRow, onClose,
}: {
  title: string;
  subtitle?: string;
  // Raw color for the row "Open for review →" link — this sub-page header
  // omits the PageHeading icon badge/accent entirely (title + subtitle
  // only), so accentColor is just the row-level link tint now.
  accentColor?: string;
  accentBg?: string;
  rows: QueueRow[];
  onSelectRow: (id: string) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const canvas = isDark ? '#0E0C13' : GEMINI.canvas;
  const cardWhiteBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  const linkColor = accentColor ?? colors.amber;

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ backgroundColor: canvas }}>
        <OverlayHeading
          eyebrow="FAMILY CUBE · REVIEW"
          title={title}
          subtitle={subtitle}
          onTitlePress={onClose}
          topInset={insets.top}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, gap: 12, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{
          backgroundColor: cardWhiteBg, borderRadius: 16, padding: 16, gap: 12,
          ...cardShadow,
        }}>
          {rows.length === 0 ? (
            <Text style={{ fontSize: 15, fontWeight: '500', color: (isDark ? colors.textSecondary : GEMINI.bodyColor), lineHeight: 25 }}>
              Nothing pending in this category right now.
            </Text>
          ) : (
            rows.map((row, i) => (
              <Pressable
                key={row.id}
                onPress={() => onSelectRow(row.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 4 })}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: (isDark ? colors.textPrimary : GEMINI.titleColor), lineHeight: 21 }} numberOfLines={1}>
                  {row.title}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: (isDark ? colors.textSecondary : GEMINI.bodyColor), lineHeight: 18 }}>
                  {row.detail}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: linkColor, lineHeight: 18 }}>
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
