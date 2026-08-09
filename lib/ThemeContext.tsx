import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ThemeColors } from '@/constants/colors';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  mode: 'system',
  setMode: () => {},
  colors: lightColors,
});

const THEME_STORAGE_KEY        = '@pawbond_theme_mode';
const THEME_STORAGE_KEY_LEGACY = '@furever_theme_mode';

// Synchronous initial dark check — never null, works before hooks resolve.
// useColorScheme() can return null on first render in some RN/Expo builds;
// Appearance.getColorScheme() is always synchronous and correct on iOS.
function getSystemIsDark(): boolean {
  return (Appearance.getColorScheme() ?? 'light') === 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  // Pre-seed isDark from Appearance so the very first render is already correct.
  // AsyncStorage may override this if the user has an explicit preference stored,
  // but for the common case (system default) this renders correctly immediately.
  const [storedMode, setStoredMode] = useState<ThemeMode | null>(null);

  useEffect(() => {
    (async () => {
      let stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (!stored) {
        // One-time migration from the old key used before the app was renamed
        const legacy = await AsyncStorage.getItem(THEME_STORAGE_KEY_LEGACY);
        if (legacy) {
          stored = legacy;
          await AsyncStorage.setItem(THEME_STORAGE_KEY, legacy);
          await AsyncStorage.removeItem(THEME_STORAGE_KEY_LEGACY);
        }
      }
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
        setStoredMode(stored);
      } else {
        setStoredMode('system');
      }
    })();
  }, []);

  const setMode = async (m: ThemeMode) => {
    setModeState(m);
    setStoredMode(m);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, m);
  };

  const isDark = useMemo(() => {
    // Use the resolved system scheme from hook; fall back to Appearance if null.
    const resolvedSystem = systemScheme ?? (getSystemIsDark() ? 'dark' : 'light');
    if (mode === 'system') return resolvedSystem === 'dark';
    return mode === 'dark';
  }, [mode, systemScheme]);

  const colors = isDark ? darkColors : lightColors;

  // Render immediately with system default — don't block on AsyncStorage.
  // storedMode being null means AsyncStorage hasn't resolved yet; in that window
  // we use mode='system' which already reflects the device color scheme correctly.
  // Once storedMode resolves, mode updates if the user had an explicit preference.
  return (
    <ThemeContext.Provider value={{ isDark, mode: storedMode ?? 'system', setMode, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
