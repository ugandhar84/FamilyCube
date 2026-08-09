import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

interface FoundPetModalProps {
  visible: boolean;
  petName: string;
  onClose: () => void;
  onSubmit: (message: string) => Promise<void>;
}

export function FoundPetModal({ visible, petName, onClose, onSubmit }: FoundPetModalProps) {
  const { colors } = useTheme();
  const [foundMessage, setFoundMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    setSending(true);
    try {
      await onSubmit(foundMessage);
      setFoundMessage('');
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`🎉 ${petName} found!`}>
      <View style={s.form}>
        <Text style={[s.desc, { color: colors.textSecondary }]}>
          Great news! Share this with your network to help {petName} get home.
        </Text>

        <Text style={[s.label, { color: colors.textPrimary }]}>Share a message</Text>
        <TextInput
          style={[s.input, { color: colors.textPrimary, borderColor: colors.border }]}
          placeholder={`Found ${petName}! If this is your pet, please contact...`}
          placeholderTextColor={colors.placeholder}
          multiline
          value={foundMessage}
          onChangeText={setFoundMessage}
        />

        <View style={s.row}>
          <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
            <Text style={{ color: colors.textPrimary }}>Close</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSubmit} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Share Found Post</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  form: { paddingHorizontal: 16, paddingBottom: 20 },
  desc: { fontSize: TYPO.body, marginBottom: 16, lineHeight: 20 },
  label: { fontSize: TYPO.body, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 4, minHeight: 100 },
  row: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '600' },
});
