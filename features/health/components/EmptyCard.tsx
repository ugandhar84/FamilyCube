/**
 * EmptyCard / FieldLabel — shared micro-components used throughout the Health screen.
 *
 * `EmptyCard` is a dashed-border placeholder shown when a health section has no records.
 * It displays an icon, a descriptive label, and an "Add" CTA button.
 *
 * `FieldLabel` is a small form label rendered above TextInput fields in modal sheets.
 * Both components are memoized and accept a `colors` prop rather than reading from the
 * theme hook directly so they can be used in modal contexts where the provider may differ.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

// ─── EmptyCard ────────────────────────────────────────────────────────────────

interface EmptyCardProps {
  /** Ionicons icon name displayed above the label. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Descriptive text, e.g. "No weight logs yet". */
  label: string;
  /** Called when the user taps the Add button. */
  onPress: () => void;
  /** Theme colour tokens for border, background, and text. */
  colors: any;
  /** Text for the CTA button — defaults to "Add". */
  addLabel?: string;
}

export const EmptyCard = React.memo(function EmptyCard({
  icon, label, onPress, colors, addLabel = 'Add',
}: EmptyCardProps) {
  return (
    <View style={{
      borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed',
      borderColor: colors.border, borderRadius: 16,
      paddingVertical: 20, paddingHorizontal: 16,
      alignItems: 'center', gap: 12,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon} size={18} color={colors.textTertiary} />
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>{label}</Text>
      </View>
      <TouchableOpacity
        onPress={onPress}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingVertical: 8, paddingHorizontal: 18,
          borderRadius: 20, borderWidth: 1.5,
          borderColor: colors.border, backgroundColor: colors.card,
        }}>
        <Ionicons name="add" size={16} color={colors.textSecondary} />
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── FieldLabel ───────────────────────────────────────────────────────────────

interface FieldLabelProps {
  /** Label text shown above the form field, e.g. "Date" or "Notes (optional)". */
  label: string;
  /** Theme colour tokens. */
  colors: any;
}

export const FieldLabel = React.memo(function FieldLabel({ label, colors }: FieldLabelProps) {
  return (
    <Text style={{ fontSize: TYPO.body, fontWeight: '500', color: colors.textSecondary, marginBottom: 6, marginTop: 14 }}>
      {label}
    </Text>
  );
});
