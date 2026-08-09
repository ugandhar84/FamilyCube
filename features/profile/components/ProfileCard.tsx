import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';

type Props = { children: React.ReactNode; colors: any };

const ProfileCard = memo(function ProfileCard({ children, colors }: Props) {
  return (
    <View style={{ marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 20,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
      {children}
    </View>
  );
});

export default ProfileCard;
