import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, Modal,  StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

function initials(name: string) {
  return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

export interface AttendeeItem {
  user_id: string;
  created_at: string;
  profile: { full_name: string; handle?: string | null; avatar_url: string | null } | null;
}

interface EventAttendeeModalProps {
  visible: boolean;
  attendees: AttendeeItem[];
  organizer: { full_name: string; handle?: string | null } | null;
  organizerId: string;
  onClose: () => void;
  colors: any;
}

function EventAttendeeModalBase({ visible, attendees, organizer, organizerId, onClose, colors }: EventAttendeeModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[{ flex: 1, backgroundColor: colors.background }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <Text style={[s.title, { color: colors.textPrimary }]}>
            Attendees · {attendees.length}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <FlashList
          data={attendees}
          keyExtractor={a => a.user_id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => {
            const name = item.profile?.handle ? `@${item.profile.handle}` : 'PawBond user';
            const isOrganizer = item.user_id === organizerId;
            return (
              <View style={[s.row, { borderBottomColor: colors.border }]}>
                <View style={[s.avatar, { backgroundColor: `${colors.textTertiary}20` }]}>
                  <Text style={[s.avatarText, { color: colors.textSecondary }]}>{initials(name)}</Text>
                </View>
                <Text style={[s.name, { color: colors.textPrimary }]}>{name}</Text>
                {isOrganizer && (
                  <View style={[s.badge, { backgroundColor: '#FF8C5520' }]}>
                    <Text style={[s.badgeText, { color: '#FF8C55' }]}>Organizer</Text>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[s.empty, { color: colors.textSecondary }]}>No attendees yet</Text>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

export const EventAttendeeModal = React.memo(EventAttendeeModalBase);

const s = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title:      { fontSize: TYPO.subheading, fontWeight: '700' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20,
                paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: TYPO.body, fontWeight: '700' },
  name:       { flex: 1, fontSize: TYPO.body },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText:  { fontSize: TYPO.body, fontWeight: '700' },
  empty:      { textAlign: 'center', marginTop: 40, fontSize: TYPO.body },
});
