/**
 * BeforeYouSendBox — the Figma "Before you send" light-blue box shown above
 * every Ask-Parent form's submit button: who the request goes to, and a
 * reminder that sending doesn't itself grant permission or award coins.
 */
import { View, Text } from 'react-native';
import { TYPO } from '@/constants/theme';

export function BeforeYouSendBox({ recipientLabel, note, colors }: {
  recipientLabel: string;
  note?: string;
  colors: any;
}) {
  return (
    <View style={{ backgroundColor: colors.primaryLight, borderRadius: 16, padding: 14, gap: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.4, color: colors.primary, textTransform: 'uppercase' }}>
        Before you send
      </Text>
      <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 18 }}>
        {recipientLabel} · {note ?? 'Sending keeps a dated request; it does not grant permission or award coins.'}
      </Text>
    </View>
  );
}
