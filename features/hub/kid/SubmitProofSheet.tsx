import { useState } from 'react';
import { View, Text, Pressable, TextInput, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AppBottomSheet from '@/components/AppBottomSheet';
import type { Quest } from '@/store/questStore';

// Photo capture for a quest that requires proof — "Take Photo to Get Paid"
// must actually collect one before submitting, not just relabel the button.
export function SubmitProofSheet({ quest, colors, isDark, onClose, submitQuest }: {
  quest: Quest | null; colors: any; isDark: boolean;
  onClose: () => void;
  submitQuest: (id: string, opts?: { photoUrl?: string; note?: string }) => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const close = () => { setUri(null); setNote(''); onClose(); };

  const pickPhoto = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to attach proof.`);
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setUri(result.assets[0].uri);
  };

  return (
    <AppBottomSheet
      visible={!!quest}
      onClose={close}
      title="📸 Photo Proof"
      subtitle={quest?.title}
      accentColor="#10B981"
      minHeight="55%"
      bodyPaddingBottom={16}
    >
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 13, color: colors.textSecondary }}>
          This quest needs a photo before it can be marked done.
        </Text>
        {uri ? (
          <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: '#10B98150' }}>
            <Image source={{ uri }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
            <Pressable onPress={() => pickPhoto(true)}
              style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#00000090', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Retake</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => pickPhoto(true)}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 20, alignItems: 'center', gap: 6,
                borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#10B98160', backgroundColor: '#10B98110' }}>
              <Text style={{ fontSize: 24 }}>📷</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#10B981' }}>Take Photo</Text>
            </Pressable>
            <Pressable onPress={() => pickPhoto(false)}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 20, alignItems: 'center', gap: 6,
                borderWidth: 1.5, borderStyle: 'dashed', borderColor: isDark ? colors.border : '#E2E8F0', backgroundColor: isDark ? colors.surface : '#FAFAFA' }}>
              <Text style={{ fontSize: 24 }}>🖼️</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textSecondary }}>Choose Photo</Text>
            </Pressable>
          </View>
        )}
        <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E8E8F0',
          backgroundColor: isDark ? colors.surface : '#FAFAFA', paddingHorizontal: 12, paddingVertical: 10 }}>
          <TextInput value={note} onChangeText={setNote}
            placeholder="Add a note (optional)…" placeholderTextColor={colors.textTertiary}
            style={{ fontSize: 14, color: colors.textPrimary, minHeight: 40 }} multiline />
        </View>
        <Pressable
          disabled={!uri}
          onPress={() => {
            if (!quest || !uri) return;
            submitQuest(quest.id, { photoUrl: uri, note: note.trim() || undefined });
            close();
          }}
          style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center',
            backgroundColor: uri ? '#10B981' : colors.border,
            opacity: uri ? 1 : 0.5 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>✅ Submit for Review</Text>
        </Pressable>
      </View>
    </AppBottomSheet>
  );
}
