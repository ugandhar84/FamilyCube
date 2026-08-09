import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  emoji: string;
  is_24h: boolean;
}

interface EmergencyContactsSectionProps {
  contacts: EmergencyContact[];
}

export function EmergencyContactsSection({ contacts }: EmergencyContactsSectionProps) {
  const { colors } = useTheme();

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Emergency Contacts</Text>
      {contacts.map(contact => (
        <TouchableOpacity
          key={contact.id}
          style={[s.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => handleCall(contact.phone)}
        >
          <View style={s.contactInfo}>
            <Text style={s.contactEmoji}>{contact.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.contactName, { color: colors.textPrimary }]}>{contact.name}</Text>
              <Text style={[s.contactPhone, { color: colors.textSecondary }]}>{contact.phone}</Text>
            </View>
            {contact.is_24h && <Text style={[s.badge, { color: '#22C55E' }]}>24/7</Text>}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginHorizontal: 16, marginTop: 12 },
  sectionTitle: { fontSize: TYPO.body, fontWeight: '700', marginBottom: 8 },
  contactCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contactInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  contactEmoji: { fontSize: TYPO.title },
  contactName: { fontSize: TYPO.body, fontWeight: '600' },
  contactPhone: { fontSize: TYPO.caption, marginTop: 2 },
  badge: { fontSize: TYPO.label, fontWeight: '600' },
});
