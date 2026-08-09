import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@/components/BottomSheet';
import { TYPO } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPickPhoto: (useCamera: boolean) => void;
  colors: any;
}

export const PhotoPickerSheet = React.memo(function PhotoPickerSheet({
  visible, onClose, onPickPhoto, colors,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 20 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryLight ?? colors.card,
          alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Ionicons name="camera-outline" size={26} color={colors.primaryText ?? colors.primary} />
        </View>
        <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }}>Add a photo</Text>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 2 }}>Help FurAI see what you're describing</Text>
      </View>

      <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 12 }}>
        <TouchableOpacity onPress={() => onPickPhoto(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.card }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="camera" size={19} color={colors.primaryText ?? colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>Take a photo</Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>Use your camera</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary ?? colors.textSecondary} />
        </TouchableOpacity>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

        <TouchableOpacity onPress={() => onPickPhoto(false)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.card }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="images" size={19} color={colors.primaryText ?? colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>Choose from library</Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>Pick from your photos</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary ?? colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={onClose}
        style={{ height: 50, borderRadius: 14, backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
          alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
});
