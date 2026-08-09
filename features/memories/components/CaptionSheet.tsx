/**
 * CaptionSheet — modal bottom sheet for adding a caption before uploading photos.
 * Lets the user type a short event label or pick from recently used captions.
 */

import React from 'react';
import { TYPO } from '@/constants/theme';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

interface CaptionSheetProps {
  visible: boolean;
  pendingAssets: ImagePicker.ImagePickerAsset[] | null;
  captionInput: string;
  existingCaptions: string[];
  colors: any;
  onChangeCaption: (t: string) => void;
  onSubmit: (skip?: boolean) => void;
}

const CaptionSheet = React.memo(function CaptionSheet({
  visible, pendingAssets, captionInput, existingCaptions,
  colors, onChangeCaption, onSubmit,
}: CaptionSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onSubmit(true)}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => onSubmit(true)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          {visible && (
            <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
              {/* Handle */}
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 }} />

              {/* Title row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.textPrimary }}>Add a caption</Text>
                {pendingAssets && pendingAssets.length > 1 && (
                  <View style={{ backgroundColor: `${colors.primary}18`, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.primaryText ?? colors.primary }}>{pendingAssets.length} photos</Text>
                  </View>
                )}
              </View>

              {/* Input */}
              <TextInput
                value={captionInput}
                onChangeText={t => onChangeCaption(t.replace(/[^a-zA-Z ]/g, '').slice(0, 25))}
                placeholder="e.g. Beach day, Vet visit…"
                placeholderTextColor={colors.textTertiary ?? colors.textSecondary}
                style={{ backgroundColor: colors.inputBg ?? colors.background, borderRadius: 12,
                  borderWidth: 1, borderColor: colors.border,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: TYPO.body, color: colors.textPrimary }}
                autoFocus maxLength={25} returnKeyType="done"
                onSubmitEditing={() => onSubmit(false)}
              />
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'right', marginTop: 4 }}>
                {captionInput.length}/25
              </Text>

              {/* Recent event chips */}
              {existingCaptions.length > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Recent events
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row' }}>
                    {existingCaptions.map(c => (
                      <TouchableOpacity key={c} onPress={() => onChangeCaption(c)}
                        style={{ backgroundColor: captionInput === c ? colors.primary : (colors.inputBg ?? colors.background),
                          borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                          borderWidth: 1, borderColor: captionInput === c ? colors.primary : colors.border }}>
                        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: captionInput === c ? '#fff' : colors.textPrimary }}>
                          {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => onSubmit(true)}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onSubmit(false)}
                  style={{ flex: 2, borderRadius: 14, backgroundColor: colors.primary, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>
                    Upload{pendingAssets && pendingAssets.length > 1 ? ` ${pendingAssets.length} photos` : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
});

export default CaptionSheet;
