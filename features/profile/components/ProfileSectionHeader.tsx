import React, { memo } from 'react';
import { TYPO } from '@/constants/theme';
import { Text } from 'react-native';

type Props = { label: string; colors: any; first?: boolean };

const ProfileSectionHeader = memo(function ProfileSectionHeader({ label, colors, first }: Props) {
  return (
    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary ?? colors.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.9, paddingHorizontal: 20,
      marginTop: first ? 12 : 20, marginBottom: 6 }}>
      {label}
    </Text>
  );
});

export default ProfileSectionHeader;
