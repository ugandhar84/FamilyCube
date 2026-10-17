/**
 * SentConfirmation — the Figma "Sent · awaiting a reply" green confirmation
 * card shown by every Ask-Parent form after submit, replacing each form's
 * old Alert.alert()+immediate-onClose() pattern. Originated as
 * RideRequestPage.tsx's inline checkmark success block — promoted here so
 * every form shares one implementation.
 */
import { View, Text, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';

export function SentConfirmation({ title, message, onReturn, colors }: {
  title: string; message: string; onReturn: () => void; colors: any;
}) {
  return (
    <View style={{ gap: 16 }}>
      <View style={{ backgroundColor: colors.tealLight, borderRadius: 18, padding: 20, alignItems: 'center', gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success + '20',
          alignItems: 'center', justifyContent: 'center' }}>
          <Check size={28} color={colors.success} />
        </View>
        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: colors.teal, textTransform: 'uppercase' }}>
          Sent · awaiting a reply
        </Text>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, textAlign: 'center' }}>
          {title}
        </Text>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center' }}>
          {message}
        </Text>
      </View>

      <Pressable onPress={onReturn}
        style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>Return to Kid Hub</Text>
      </Pressable>
    </View>
  );
}
