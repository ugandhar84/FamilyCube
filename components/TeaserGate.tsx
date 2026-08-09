import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import PaywallSheet from '@/components/PaywallSheet';

interface TeaserGateProps {
  locked: boolean;
  headline: string;
  body: string;
  ctaLabel?: string;
  petName?: string;
  perks?: string[];
  minHeight?: number;
  autoOpen?: boolean;
  onSheetClose?: () => void;
  children: React.ReactNode;
}

const DEFAULT_PERKS = [
  'Full health history — unlimited',
  'Up to 5 pets',
  'Family & caretaker sharing',
  'Unlimited health records & documents',
  'Unlimited posts, videos & playdates',
];

export default function TeaserGate({
  locked,
  headline,
  body,
  petName,
  perks = DEFAULT_PERKS,
  minHeight = 180,
  autoOpen = false,
  onSheetClose,
  children,
}: TeaserGateProps) {
  const { colors, isDark } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (locked && autoOpen) setSheetOpen(true);
  }, [locked, autoOpen]);

  const handleClose = () => {
    setSheetOpen(false);
    onSheetClose?.();
  };

  if (!locked) return <>{children}</>;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setSheetOpen(true)}
        style={[s.root, { minHeight }]}
      >
        <View style={{ opacity: 0.35 }} pointerEvents="none">
          {children}
        </View>

        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={16}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(15,13,20,0.72)' : 'rgba(247,246,242,0.72)' }]}
            pointerEvents="none"
          />
        )}

        <View style={s.tapHint} pointerEvents="none">
          <View style={[s.lockCircle, { backgroundColor: isDark ? 'rgba(124,92,191,0.25)' : 'rgba(124,92,191,0.12)' }]}>
            <Ionicons name="lock-closed" size={22} color="#7C5CBF" />
          </View>
          <Text style={[s.tapHintText, { color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(28,27,34,0.65)' }]}>
            Tap to unlock
          </Text>
        </View>
      </TouchableOpacity>

      <PaywallSheet
        visible={sheetOpen}
        onClose={handleClose}
        headline={headline}
        body={body}
        petName={petName}
        perks={perks}
      />
    </>
  );
}

const s = StyleSheet.create({
  root:        { position: 'relative', overflow: 'hidden' },
  tapHint:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  lockCircle:  { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tapHintText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
});
