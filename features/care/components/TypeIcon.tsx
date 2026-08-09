import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { type EntryType, TYPE_ICON } from './journalTypes';

export const TypeIcon = React.memo(function TypeIcon({ type, color, size = 20 }: { type: EntryType; color: string; size?: number }) {
  return <Ionicons name={TYPE_ICON[type]} size={size} color={color} />;
});
