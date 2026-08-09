import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraIcon } from '@/components/ui/FureverIcons';
import { RADIUS, TYPO} from '@/constants/theme';

type Props = {
  Icon: React.FC<any>;
  title: string;
  sub: string;
  ctaLabel?: string;
  onCta?: () => void;
  colors: any;
  isDark: boolean;
};

const EmptyState = memo(function EmptyState({ Icon, title, sub, ctaLabel, onCta, colors, isDark }: Props) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 56, gap: 12 }}>
      <LinearGradient
        colors={[`${colors.primary}18`, `${colors.primary}08`]}
        style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Icon color={colors.primaryText ?? colors.primary} size={32} strokeWidth={1.5} />
      </LinearGradient>
      <Text style={{ fontSize: TYPO.subheading, fontWeight: '700', color: colors.textPrimary }}>{title}</Text>
      <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 240 }}>{sub}</Text>
      {ctaLabel && onCta ? (
        <TouchableOpacity
          onPress={onCta}
          style={{ backgroundColor: colors.primary, borderRadius: RADIUS.full, paddingHorizontal: 22, paddingVertical: 11, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CameraIcon color="#fff" size={16} strokeWidth={2.2} />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

export default EmptyState;
