import { create } from 'zustand';

// Lightweight cross-screen UI signals that don't warrant their own domain
// store. Currently just: is a full-bleed screen (e.g. the GPS map) active,
// so the globally-mounted Ask Cube FAB in app/(tabs)/_layout.tsx can hide
// itself — that screen never changes the route/pathname (it's client-side
// state inside VaultScreen), so usePathname() can't detect it.
interface UIState {
  fullBleedScreenActive: boolean;
  setFullBleedScreenActive: (active: boolean) => void;
  // Set by the tab bar the instant Tasks is tapped (CustomTabBar in
  // app/(tabs)/_layout.tsx) — TasksScreen reads it once on focus to
  // auto-open SmartTaskComposer, then clears it immediately so a later
  // plain remount/focus (e.g. backgrounding and returning) doesn't
  // re-trigger the composer. A one-shot signal, not persistent state.
  autoOpenTaskComposer: boolean;
  setAutoOpenTaskComposer: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  fullBleedScreenActive: false,
  setFullBleedScreenActive: (active) => set({ fullBleedScreenActive: active }),
  autoOpenTaskComposer: false,
  setAutoOpenTaskComposer: (v) => set({ autoOpenTaskComposer: v }),
}));
