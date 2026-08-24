import { create } from 'zustand';

// Lightweight cross-screen UI signals that don't warrant their own domain
// store. Currently just: is a full-bleed screen (e.g. the GPS map) active,
// so the globally-mounted Ask Cube FAB in app/(tabs)/_layout.tsx can hide
// itself — that screen never changes the route/pathname (it's client-side
// state inside VaultScreen), so usePathname() can't detect it.
interface UIState {
  fullBleedScreenActive: boolean;
  setFullBleedScreenActive: (active: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  fullBleedScreenActive: false,
  setFullBleedScreenActive: (active) => set({ fullBleedScreenActive: active }),
}));
