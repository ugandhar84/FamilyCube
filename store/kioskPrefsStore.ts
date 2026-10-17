import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-device kiosk preferences. `navSide`: put the navigation on the left as a floating side pill instead of
 * the floating pill along the bottom. Remembered on this device only.
 */
const KEY = '@familycube_kiosk_prefs_v1';

interface KioskPrefs {
  navSide: boolean;
  loaded: boolean;
  setNavSide: (v: boolean) => void;
  load: () => Promise<void>;
}

export const useKioskPrefsStore = create<KioskPrefs>((set, get) => ({
  navSide: false,
  loaded: false,
  setNavSide: (v) => {
    set({ navSide: v });
    AsyncStorage.setItem(KEY, JSON.stringify({ navSide: v })).catch(() => {});
  },
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) set({ navSide: !!JSON.parse(raw).navSide });
    } catch { /* keep default */ }
    set({ loaded: true });
  },
}));
