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
  // Same one-shot pattern, for the shared FAB's School-tab "+" face —
  // SchoolTab reads it once on focus to open SchoolScheduleModal for the
  // currently-selected kid, then clears it immediately.
  openSchoolScheduleComposerRequested: boolean;
  setOpenSchoolScheduleComposerRequested: (v: boolean) => void;
  // Same one-shot pattern, for the shared FAB's Grocery-tab "+" face —
  // GroceryScreen previously had its OWN separate always-"+" local FAB
  // instead of joining the shared sparkle-everywhere-else/+-on-this-tab
  // pattern every other composer tab already uses (live-requested:
  // "Grocery + FAB should be similar like in the other pages"). Reads this
  // once on focus to open AddItemSheet, then clears it immediately.
  openGroceryComposerRequested: boolean;
  // One-shot: Grocery/Meals are no longer real tab routes — they're opened
  // as Hub-owned FullPageOverlay state (same pattern as ReviewInboxScreen)
  // to fix a stale-Reanimated-shared-value blank-screen bug that came from
  // Expo Router's tab navigator keeping them mounted forever. Anything
  // outside HubScreen (a notification tap, a deep link) that used to
  // router.push('/(tabs)/grocery')/('/(tabs)/meals') now navigates to Hub
  // and flips this flag instead; HubScreen consumes it once and clears it,
  // same one-shot shape as openGroceryComposerRequested above.
  openGroceryScreenRequested: boolean;
  openMealsScreenRequested: boolean;
  setOpenGroceryScreenRequested: (v: boolean) => void;
  setOpenMealsScreenRequested: (v: boolean) => void;
  // One-shot: a screen asks Chat to open this channel on next focus (e.g. co-parent dispute -> parents' DM).
  pendingChatChannelId: string | null;
  // One-shot: a Hub row asks HubScreen to open the approval action center for this chore.
  openApprovalDetailChoreId: string | null;
  setOpenApprovalDetailChoreId: (id: string | null) => void;
  setPendingChatChannelId: (id: string | null) => void;
  setOpenGroceryComposerRequested: (v: boolean) => void;
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
  // One-shot pattern, same as openTaskComposerRequested above — set by a
  // screen outside Tasks (e.g. the Hub's Next Up timeline) before
  // navigating to the Tasks tab, so TasksScreen opens on a specific segment
  // (Schedule/Chores/Queue) instead of always defaulting to Chores. Read
  // once on focus, then cleared immediately so a later plain remount
  // doesn't re-trigger it.
  requestedTasksSegment: 'schedule' | 'chores' | 'queue' | undefined;
  setRequestedTasksSegment: (v: 'schedule' | 'chores' | 'queue' | undefined) => void;
  // Same one-shot pattern — set by the Hub's Next Up timeline before
  // navigating to Tasks so tapping an event opens its full detail page
  // directly (EventDetailScreen) instead of just landing on the Schedule
  // segment's own default day view, leaving the user to find and tap the
  // event again themselves.
  requestedEventDetailId: string | undefined;
  setRequestedEventDetailId: (v: string | undefined) => void;
  // One-shot, same pattern as openHealthRecordsComposerRequested — set by
  // HealthRecordsScreen.tsx's flat "Scan prescription / vaccine record →"
  // bottom button (which has no direct handle to HealthTab's own
  // showScanSheet/scanMode state) so HealthTab can open the SAME real
  // ScanReviewSheet its AI banner's scan buttons already trigger, instead
  // of a second scan implementation. Value is the scan mode to open with
  // ('rx' | 'vaccine'), undefined when idle.
  openHealthScanRequested: 'rx' | 'vaccine' | undefined;
  setOpenHealthScanRequested: (v: 'rx' | 'vaccine' | undefined) => void;
  // One-shot, same pattern — set by HealthRecordsScreen.tsx's flat
  // "Export PDF →" bottom button so HealthTab (the only place that holds
  // the real vaccine array) can run the existing shareVaccineRecordsPdf
  // export instead of this screen re-querying/duplicating that logic.
  openHealthPdfExportRequested: boolean;
  setOpenHealthPdfExportRequested: (v: boolean) => void;
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
  requestedTasksSegment: undefined,
  setRequestedTasksSegment: (v) => set({ requestedTasksSegment: v }),
  requestedEventDetailId: undefined,
  setRequestedEventDetailId: (v) => set({ requestedEventDetailId: v }),
  openSchoolScheduleComposerRequested: false,
  setOpenSchoolScheduleComposerRequested: (v) => set({ openSchoolScheduleComposerRequested: v }),
  openGroceryComposerRequested: false,
  openGroceryScreenRequested: false,
  openMealsScreenRequested: false,
  setOpenGroceryScreenRequested: (v) => set({ openGroceryScreenRequested: v }),
  setOpenMealsScreenRequested: (v) => set({ openMealsScreenRequested: v }),
  pendingChatChannelId: null,
  openApprovalDetailChoreId: null,
  setOpenApprovalDetailChoreId: (id) => set({ openApprovalDetailChoreId: id }),
  setPendingChatChannelId: (id) => set({ pendingChatChannelId: id }),
  setOpenGroceryComposerRequested: (v) => set({ openGroceryComposerRequested: v }),
  healthRecordsActiveSegment: 'health',
  setHealthRecordsActiveSegment: (v) => set({ healthRecordsActiveSegment: v }),
  activeTabName: undefined,
  setActiveTabName: (name) => set({ activeTabName: name }),
  openHealthScanRequested: undefined,
  setOpenHealthScanRequested: (v) => set({ openHealthScanRequested: v }),
  openHealthPdfExportRequested: false,
  setOpenHealthPdfExportRequested: (v) => set({ openHealthPdfExportRequested: v }),
}));
