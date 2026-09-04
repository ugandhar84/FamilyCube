import { useState } from 'react';
import {
  View, Text, Pressable, TextInput, Image, Alert,
  Modal, KeyboardAvoidingView, ScrollView, Platform, Keyboard, StyleSheet, TouchableOpacity,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, CheckCircle2, X } from 'lucide-react-native';
import { KID } from './kidTheme';
import type { Quest } from '@/store/questStore';
import { useFamilyStore } from '@/store/familyStore';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

// Money-green — "photo proof / submit" positive accent, distinct from
// brand teal used elsewhere in the kid hub. Not colors.success (which IS
// brand teal in this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

// Photo capture for a quest that requires proof — "Take Photo to Get Paid"
// must actually collect one before submitting, not just relabel the button.
export function SubmitProofSheet({ quest, colors, isDark, onClose, submitQuest }: {
  quest: Quest | null; colors: any; isDark: boolean;
  onClose: () => void;
  submitQuest: (id: string, opts?: { photoUrl?: string; note?: string }, memberId?: string) => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const activeMemberId = useFamilyStore(s => s.activeMemberId);

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

  const dismiss = () => { Keyboard.dismiss(); close(); };
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(75, 90);

  return (
    <Modal visible={!!quest} transparent animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '75%', backgroundColor: colors.card }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.3, color: colors.textPrimary }}>Photo Proof</Text>
                {quest?.title ? (
                  <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 2, color: MONEY_GREEN }}>{quest.title}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={dismiss}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ padding: 20, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: KID.sub, color: colors.textSecondary }}>
          This quest needs a photo before it can be marked done.
        </Text>
        {uri ? (
          <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: `${MONEY_GREEN}50` }}>
            <Image source={{ uri }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
            <Pressable onPress={() => { pickPhoto(true); }}
              style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#00000090', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: KID.tiny, fontWeight: '800', color: '#fff' }}>Retake</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => { pickPhoto(true); }}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 20, alignItems: 'center', gap: 6,
                borderWidth: 1.5, borderStyle: 'dashed', borderColor: `${MONEY_GREEN}60`, backgroundColor: `${MONEY_GREEN}10` }}>
              <Camera size={26} color={MONEY_GREEN} />
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: MONEY_GREEN }}>Take Photo</Text>
            </Pressable>
            <Pressable onPress={() => { pickPhoto(false); }}
              style={{ flex: 1, borderRadius: 14, paddingVertical: 20, alignItems: 'center', gap: 6,
                borderWidth: 1.5, borderStyle: 'dashed', borderColor: isDark ? colors.border : '#E2E8F0', backgroundColor: isDark ? colors.surface : '#FAFAFA' }}>
              <ImageIcon size={26} color={colors.textSecondary} />
              <Text style={{ fontSize: KID.sub, fontWeight: '800', color: colors.textSecondary }}>Choose Photo</Text>
            </Pressable>
          </View>
        )}
        <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E8E8F0',
          backgroundColor: isDark ? colors.surface : '#FAFAFA', paddingHorizontal: 12, paddingVertical: 10 }}>
          <TextInput value={note} onChangeText={setNote}
            onBlur={() => { }}
            placeholder="Add a note (optional)…" placeholderTextColor={colors.textTertiary}
            style={{ fontSize: KID.body, color: colors.textPrimary, minHeight: 40 }} multiline />
        </View>
      </View>
            </ScrollView>

            {/* Sticky footer — was inside the ScrollView, could end up
                below the keyboard once the note field is focused. */}
            <View style={{ padding: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Pressable
                disabled={!uri}
                onPress={() => {
                  if (!quest || !uri) return;
                  submitQuest(quest.id, { photoUrl: uri, note: note.trim() || undefined }, activeMemberId ?? undefined);
                  close();
                }}
                style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  backgroundColor: uri ? MONEY_GREEN : colors.border,
                  opacity: uri ? 1 : 0.5 }}>
                <CheckCircle2 size={17} color="#fff" />
                <Text style={{ fontSize: KID.body, fontWeight: '900', color: '#fff' }}>Submit for Review</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
