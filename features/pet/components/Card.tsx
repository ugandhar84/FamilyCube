import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  colors: any;
  style?: any;
}

export const Card = React.memo(function Card({ children, colors, style }: CardProps) {
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
});

interface CardLabelProps {
  title: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}

export const CardLabel = React.memo(function CardLabel({ title, iconName, color }: CardLabelProps) {
  return (
    <View style={[cardStyles.cardLabel, { borderBottomColor: `${color}28`, backgroundColor: `${color}08` }]}>
      <Ionicons name={iconName} size={13} color={color} />
      <Text style={[cardStyles.cardLabelText, { color }]}>{title}</Text>
    </View>
  );
});

export const cardStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16, borderRadius: 20, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardLabelText: { fontSize: TYPO.body, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
});
