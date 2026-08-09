import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MoodResult } from './moodCameraUtils';
import { makeStyles, PHOTO_SIZE } from './moodCameraStyles';
import { TYPO } from '@/constants/theme';

interface Props {
  photo: string | null;
  scanning: boolean;
  result: MoodResult | null;
  ac: string;
  isDark: boolean;
  colors: any;
  onRetake: () => void;
  scanOverlay: React.ReactNode;
}

export const MoodPhotoFrame = React.memo(function MoodPhotoFrame({
  photo, scanning, result, ac, isDark, colors, onRetake, scanOverlay,
}: Props) {
  const s = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const moodBorderColor = scanning ? ac : result ? ac : (isDark ? colors.border : `${ac}30`);

  return (
    <View style={s.photoWrap}>
      <View style={[s.photoFrame, {
        borderColor: moodBorderColor,
        backgroundColor: isDark ? colors.surface : `${ac}08`,
      }]}>
        {photo ? (
          <>
            <Image source={{ uri: photo }} cachePolicy="memory-disk" style={s.photo} contentFit="cover" />
            {scanning && scanOverlay}
            {!scanning && !result && (
              <TouchableOpacity
                style={[s.retakeOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
                onPress={onRetake}>
                <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
                <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '700', marginTop: 4 }}>Retake</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={s.emptyState}>
            <LinearGradient colors={[`${ac}25`, `${ac}08`]} style={s.emptyCircle}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="camera-outline" size={48} color={ac} />
            </LinearGradient>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Scan your pet's mood</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>
              Take a clear photo of your pet's face{'\n'}for an AI mood analysis
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});
