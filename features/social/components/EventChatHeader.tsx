import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PetHeaderChip from '@/components/PetHeaderChip';

interface EventChatHeaderProps {
  title: string;
  attendeeCount: number;
  ac: string;
  pet: any;
  colors: any;
  onShowAttendees: () => void;
  onEdit?: () => void;
}

function EventChatHeaderBase({ title, attendeeCount, ac, pet, colors, onShowAttendees, onEdit }: EventChatHeaderProps) {
  return (
    <View style={[s.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={[s.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={[s.title, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
            {title}
          </Text>
          <PetHeaderChip pet={pet as any} />
        </View>
        <TouchableOpacity onPress={onShowAttendees} style={s.attendeeRow}>
          <Ionicons name="people-outline" size={12} color={ac} />
          <Text style={[s.attendeeCount, { color: ac }]}>
            {attendeeCount} attending · tap to see
          </Text>
        </TouchableOpacity>
      </View>

      {onEdit && (
        <TouchableOpacity onPress={onEdit} style={[s.attendeeBtn, { backgroundColor: `${ac}18` }]}>
          <Ionicons name="create-outline" size={18} color={ac} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={onShowAttendees}
        style={[s.attendeeBtn, { backgroundColor: `${ac}18` }]}>
        <Ionicons name="people" size={18} color={ac} />
      </TouchableOpacity>
    </View>
  );
}

export const EventChatHeader = React.memo(EventChatHeaderBase);

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                  paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  backBtn:      { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
                  alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: TYPO.subheading, fontWeight: '700' },
  attendeeRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  attendeeCount:{ fontSize: TYPO.body, fontWeight: '600' },
  attendeeBtn:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
