import { create } from 'zustand';

// Lightweight cross-screen UI signals that don't warrant their own domain
// store. Currently just: is a full-bleed screen (e.g. the GPS map) active,
// so the globally-mounted Ask Cube FAB in app/(tabs)/_layout.tsx can hide
// itself — that screen never changes the route/pathname (it's client-side
// state inside VaultScreen), so usePathname() can't detect it.
interface UIState {
  fullBleedScreenActive: boolean;
  setFullBleedScreenActive: (active: boolean) => void;
  // Tapped on the single shared FAB in app/(tabs)/_layout.tsx while it's
  // showing its Tasks-tab "+" face — TasksScreen reads it once on focus to
  // open SmartTaskComposer, then clears it immediately so a later plain
  // remount/focus (e.g. backgrounding and returning) doesn't re-trigger
  // it. A one-shot signal, not persistent state.
  openTaskComposerRequested: boolean;
  setOpenTaskComposerRequested: (v: boolean) => void;
  // Same one-shot pattern as openTaskComposerRequested above, for the
  // shared FAB's Memories-tab "+" face — MemoriesTab reads it once on
  // focus to open ComposeMemoryModal, then clears it immediately.
  openMemoryComposerRequested: boolean;
  setOpenMemoryComposerRequested: (v: boolean) => void;
  // Same one-shot pattern, for the shared FAB's family-health-tab "+" face.
  // HealthRecordsScreen's two segments (Health/Records) are never both
  // mounted at once, so both HealthTab and RecordsTab safely consume this
  // same flag — whichever segment is actually showing opens its own add
  // modal (AddMedModal / AddRecordModal) and clears the flag.
  openHealthRecordsComposerRequested: boolean;
  setOpenHealthRecordsComposerRequested: (v: boolean) => void;
  // Live-updated (not one-shot) by HealthRecordsScreen/HealthTab so the
  // shared FAB's own background color in app/(tabs)/_layout.tsx can track
  // which inner segment (Health/Medications vs. Immunizations) is actually
  // selected — Health & Records has its OWN segmented switch nested inside
  // one route, which activeTabName (route-level only) can't see.
  healthRecordsActiveSegment: 'health' | 'records' | 'immunizations';
  setHealthRecordsActiveSegment: (v: 'health' | 'records' | 'immunizations') => void;
  // The currently-focused bottom-tab route name, written by CustomTabBar
  // (app/(tabs)/_layout.tsx) from React Navigation's own `state` prop —
  // the authoritative, synchronous source. TabLayout reads this instead of
  // expo-router's usePathname() for the shared FAB's tab-aware icon/action,
  // since usePathname() lagged/mismatched the real focused tab on Expo
  // Router's lazy+frozen tab screens (live-reported: FAB sometimes showed
  // "+" on Hub/Apps and sparkle on Tasks — backwards).
  activeTabName: string | undefined;
  setActiveTabName: (name: string | undefined) => void;
}

export const useUIStore = create<UIState>((set) => ({
  fullBleedScreenActive: false,
  setFullBleedScreenActive: (active) => set({ fullBleedScreenActive: active }),
  openTaskComposerRequested: false,
  setOpenTaskComposerRequested: (v) => set({ openTaskComposerRequested: v }),
  openMemoryComposerRequested: false,
  setOpenMemoryComposerRequested: (v) => set({ openMemoryComposerRequested: v }),
  openHealthRecordsComposerRequested: false,
  setOpenHealthRecordsComposerRequested: (v) => set({ openHealthRecordsComposerRequested: v }),
  healthRecordsActiveSegment: 'health',
  setHealthRecordsActiveSegment: (v) => set({ healthRecordsActiveSegment: v }),
  activeTabName: undefined,
  setActiveTabName: (name) => set({ activeTabName: name }),
}));
