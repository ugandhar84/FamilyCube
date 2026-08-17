import { View, Text, Pressable, TextInput } from 'react-native';
import { GP, DECLINE_PRESETS } from './seniorTheme';

// "Reason for declining" panel — preset chips + free-text + cancel/confirm.
// Was copy-pasted verbatim between the pending-assignment card and the
// driving-today card in the original SeniorView; now shared by both call
// sites in YourRidesSection.
export function DeclineReasonPanel({ declineText, setDeclineText, onCancel, onConfirm, colors, isDark }: {
  declineText: string;
  setDeclineText: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  colors: any; isDark: boolean;
}) {
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <Text style={{ fontSize: GP.sub, fontWeight: '800', color: colors.danger }}>Reason for declining *</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {DECLINE_PRESETS.map(p => (
          <Pressable key={p} onPress={() => setDeclineText(p)}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
              backgroundColor: declineText === p ? colors.danger : (isDark ? colors.card : '#fff'),
              borderColor: declineText === p ? colors.danger : '#FCA5A5' }}>
            <Text style={{ fontSize: GP.sub, fontWeight: '700', color: declineText === p ? '#fff' : colors.danger }}>{p}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={declineText} onChangeText={setDeclineText} maxLength={120} multiline
        placeholder="Or type your reason…" placeholderTextColor={colors.textTertiary}
        style={{ borderWidth: 1, borderColor: declineText.trim() ? colors.danger + '60' : colors.border,
          borderRadius: 10, padding: 10, fontSize: GP.sub, color: colors.textPrimary,
          backgroundColor: isDark ? colors.card : '#FEF2F2', minHeight: 36 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={onCancel}
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
          <Text style={{ fontSize: GP.sub, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
        </Pressable>
        <Pressable
          disabled={!declineText.trim()}
          onPress={onConfirm}
          style={{ flex: 2, backgroundColor: declineText.trim() ? colors.danger : colors.border,
            borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: declineText.trim() ? 1 : 0.5 }}>
          <Text style={{ fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>Confirm Decline</Text>
        </Pressable>
      </View>
    </View>
  );
}
