import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

interface LostPetModalProps {
  visible: boolean;
  petName: string;
  onClose: () => void;
  onSubmit: (description: string, phone: string, reward: string) => Promise<void>;
}

export function LostPetModal({ visible, petName, onClose, onSubmit }: LostPetModalProps) {
  const { colors } = useTheme();
  const [description, setDescription] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [reward, setReward] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    setSending(true);
    try {
      await onSubmit(description, contactPhone, reward);
      setDescription('');
      setContactPhone('');
      setReward('');
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`🚨 Report ${petName} lost`}>
      <View style={s.form}>
        <Text style={[s.label, { color: colors.textPrimary }]}>Description</Text>
        <TextInput
          style={[s.input, { color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="Where were they last seen? What are they wearing?"
          placeholderTextColor={colors.placeholder}
          multiline
          value={description}
          onChangeText={setDescription}
        />

        <Text style={[s.label, { color: colors.textPrimary }]}>Your contact phone</Text>
        <TextInput
          style={[s.input, { color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="+1 (555) 123-4567"
          placeholderTextColor={colors.placeholder}
          keyboardType="phone-pad"
          value={contactPhone}
          onChangeText={setContactPhone}
        />

        <Text style={[s.label, { color: colors.textPrimary }]}>Reward (optional)</Text>
        <TextInput
          style={[s.input, { color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="$100"
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          value={reward}
          onChangeText={setReward}
        />

        <View style={s.row}>
          <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
            <Text style={{ color: colors.textPrimary }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSubmit} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Report Lost</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  form: { paddingHorizontal: 16, paddingBottom: 20 },
  label: { fontSize: TYPO.body, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 4, minHeight: 100 },
  row: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '600' },
});
