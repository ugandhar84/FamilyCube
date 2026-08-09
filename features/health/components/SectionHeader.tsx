/**
 * SectionHeader — labelled section divider used throughout the Health screen.
 *
 * Renders an icon + title row with an optional chevron toggle. When `onToggle`
 * is provided the whole row becomes a TouchableOpacity that calls it on press,
 * making the section collapsible. When omitted the header is a plain View.
 *
 * `children` is rendered between the title and the chevron, e.g. a badge count.
 *
 * Memoized: only re-renders when props change.
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

interface SectionHeaderProps {
  /** Ionicons icon name shown to the left of the title. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Section label text — rendered in uppercase-style bold. */
  title: string;
  /** Theme colour tokens. */
  colors: any;
  /** Whether the section is currently expanded — controls the chevron direction. */
  isExpanded?: boolean;
  /** When provided, makes the header a toggle button and calls this on press. */
  onToggle?: () => void;
  /** Optional slot between the title and the chevron (e.g. a record count badge). */
  children?: React.ReactNode;
}

const SectionHeader = React.memo(function SectionHeader({
  icon, title, colors, isExpanded, onToggle, children,
}: SectionHeaderProps) {
  const inner = (
    <>
      <Ionicons name={icon} size={14} color={colors.textTertiary} />
      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.8, marginLeft: 6 }}>
        {title}
      </Text>
      <View style={{ flex: 1 }} />
      {children}
      {onToggle && (
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
          style={{ marginLeft: 8 }}
        />
      )}
    </>
  );

  if (onToggle) {
    return (
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: isExpanded ? 10 : 0, paddingVertical: 8 }}>
        {inner}
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10, paddingVertical: 8 }}>
      {inner}
    </View>
  );
});

export default SectionHeader;
