/**
 * KioskActivityContext — lets anything rendered inside kiosk mode report
 * touch activity and hold off the idle lock, including things rendered
 * into a native Modal.
 *
 * Why this exists (the bug it fixes): KioskScreen wires registerActivity
 * to its root SafeAreaView's onTouchStart, which is the only activity
 * signal the idle lock ever gets. A React Native <Modal> renders into a
 * separate native window and is NOT a descendant of that SafeAreaView in
 * the touch hierarchy, so touches inside one never bubble to it. Kiosk
 * puts most of its real interaction behind modals (KioskQuestEditor,
 * KioskEventEditor, SmartTaskComposer, AddQuestModal, AddEventModal,
 * AskCubeChat, the chat attach menu/lightboxes) — meaning the busiest
 * moments on the device registered as total inactivity, and the idle lock
 * would fire on someone in the middle of typing.
 *
 * Prop-drilling registerActivity into every one of those call sites isn't
 * viable: several are shared phone components (SmartTaskComposer,
 * AddEventModal) that must not grow a kiosk-only prop. A context read by
 * a small wrapper at each kiosk modal site keeps the coupling entirely
 * inside features/kiosk/.
 *
 * Outside kiosk mode the context is simply absent and both hooks below
 * no-op, so a shared component wrapped in <KioskModalHost> on the kiosk
 * side behaves identically when rendered on a phone.
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export interface KioskActivityApi {
  registerActivity: () => void;
  suspendLock: () => void;
  resumeLock: () => void;
}

const noop = () => {};
const FALLBACK: KioskActivityApi = { registerActivity: noop, suspendLock: noop, resumeLock: noop };

const KioskActivityContext = createContext<KioskActivityApi>(FALLBACK);

export function KioskActivityProvider({ value, children }: { value: KioskActivityApi; children: ReactNode }) {
  return <KioskActivityContext.Provider value={value}>{children}</KioskActivityContext.Provider>;
}

export function useKioskActivity(): KioskActivityApi {
  return useContext(KioskActivityContext);
}

/**
 * Wraps a kiosk modal's content so that (a) every touch inside it counts
 * as kiosk activity, and (b) the idle lock is held off for as long as it
 * stays mounted — so a half-filled form is never discarded by the timer.
 * The hold is capped inside useKioskIdleLock (SUSPEND_MAX_MS), so leaving
 * a sheet open on the counter still eventually locks the device.
 *
 * Mount this only while the modal is actually open — the suspension is
 * tied to this component's lifetime. Rendering it permanently with a
 * `visible` flag inside would hold the lock off forever.
 */
export function KioskModalHost({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { registerActivity, suspendLock, resumeLock } = useKioskActivity();

  useEffect(() => {
    suspendLock();
    return resumeLock;
  }, [suspendLock, resumeLock]);

  return (
    <View style={[{ flex: 1 }, style]} onTouchStart={registerActivity}>
      {children}
    </View>
  );
}

/**
 * Suspension without a wrapping view — for a modal whose own root can't be
 * wrapped (a shared phone component rendered directly, e.g.
 * SmartTaskComposer). Call it from a component mounted only while that
 * modal is open.
 */
export function useKioskLockSuspended(activeWhile: boolean) {
  const { suspendLock, resumeLock } = useKioskActivity();
  useEffect(() => {
    if (!activeWhile) return;
    suspendLock();
    return resumeLock;
  }, [activeWhile, suspendLock, resumeLock]);
}
