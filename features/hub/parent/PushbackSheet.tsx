import { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Clock, Construction, Repeat, MessageCircle } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import AppBottomSheet from '@/components/AppBottomSheet';

// Violet — "Snooze" action accent, deliberately distinct from BRAND.purple
// (#9261C7) so each of these four response actions reads as its own color;
// kept as one local constant instead of a repeated bare hex.
const SNOOZE_VIOLET = '#8B5CF6';

export function PushbackSheet({ target, colors, isDark, onClose, respondToParentQuest }: {
  target: { assignmentId: string; choreTitle: string } | null;
  colors: any; isDark: boolean;
  onClose: () => void;
  respondToParentQuest: (assignmentId: string, response: { action: 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS'; details?: string }) => void;
}) {
  const [detail, setDetail] = useState('');

  const handle = (action: 'SNOOZE' | 'BLOCKER' | 'TRADE' | 'DISCUSS') => {
    if (!target) return;
    respondToParentQuest(target.assignmentId, { action, details: detail.trim() || undefined });
    setDetail('');
    onClose();
  };

  return (
    <AppBottomSheet
      visible={!!target}
      onClose={() => { setDetail(''); onClose(); }}
      title={`Respond: ${target?.choreTitle ?? ''}`}
      subtitle="2 bounces locks this task for an offline chat"
      accentColor={BRAND.amber}
      minHeight="45%"
      maxHeight="75%">
      <View style={{ gap: 16 }}>
        <TextInput
          style={{
            borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
            backgroundColor: isDark ? colors.surface : '#F8FAFC',
            padding: 12, fontSize: TYPO.caption, color: colors.textPrimary,
            minHeight: 60,
          }}
          placeholder="Add details (optional)…"
          placeholderTextColor={colors.textTertiary}
          value={detail}
          onChangeText={setDetail}
          multiline
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {([
            { action: 'SNOOZE',  label: 'Snooze 48h',   Icon: Clock,        color: SNOOZE_VIOLET },
            { action: 'BLOCKER', label: 'Blocker',       Icon: Construction, color: colors.danger },
            { action: 'TRADE',   label: 'Trade tasks',   Icon: Repeat,       color: BRAND.amber },
            { action: 'DISCUSS', label: 'Discuss later', Icon: MessageCircle, color: BRAND.teal },
          ] as const).map(({ action, label, Icon, color }) => (
            <Pressable key={action} onPress={() => handle(action)}
              style={{
                flex: 1, minWidth: '45%', borderRadius: 14, paddingVertical: 14,
                alignItems: 'center', gap: 5, borderWidth: 1.5,
                borderColor: color + '50', backgroundColor: color + '12',
              }}>
              <Icon size={16} color={color} />
              <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </AppBottomSheet>
  );
}
