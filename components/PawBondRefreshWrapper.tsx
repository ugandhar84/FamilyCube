/**
 * Wrap any ScrollView / FlatList / SectionList that has a RefreshControl.
 * When refreshing=true, PawBondLoader floats absolutely at the top of the
 * scroll area — visible in the iOS over-scroll bounce zone, on top of
 * scroll content. The background overlay completely covers the native OS
 * spinner. Set tintColor="transparent" colors={['transparent']} on the
 * RefreshControl to hide it.
 */
import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import PawBondLoader from './PawBondLoader';
import { useTheme } from '@/lib/ThemeContext';

interface Props {
  refreshing: boolean;
  children: React.ReactNode;
  topOffset?: number;
  minDuration?: number;
}

export default function PawBondRefreshWrapper({ refreshing, children, topOffset = 12, minDuration = 600 }: Props) {
  const { isDark, colors } = useTheme();
  const [showLoader, setShowLoader] = useState(false);
  const [startTimeRef] = useState({ time: 0 });

  useEffect(() => {
    if (refreshing) {
      // Refresh started — record time and show loader
      startTimeRef.time = Date.now();
      setShowLoader(true);
    } else {
      // Refresh ended — enforce minimum duration
      const elapsed = Date.now() - startTimeRef.time;
      const remaining = Math.max(0, minDuration - elapsed);

      if (remaining > 0) {
        const timeout = setTimeout(() => setShowLoader(false), remaining);
        return () => clearTimeout(timeout);
      } else {
        setShowLoader(false);
      }
    }
  }, [refreshing, minDuration]);
  return (
    <View style={{ flex: 1 }}>
      {children}
      {showLoader && (
        <>
          {/* Background overlay — covers system RefreshControl spinner */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 180,
              backgroundColor: isDark ? 'rgba(17, 13, 31, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              zIndex: 98,
            }}
          />
          {/* PawBondLoader on top */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: topOffset,
              left: 0,
              right: 0,
              alignItems: 'center',
              zIndex: 99,
            }}>
            <PawBondLoader size={48} isDark={isDark} />
          </View>
        </>
      )}
    </View>
  );
}
