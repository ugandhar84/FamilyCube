import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

// Shared by every hand-rolled bottom sheet in the app (AppBottomSheet.tsx,
// BottomSheet.tsx, TaskFormShell.tsx, and each one-off Modal-based sheet) —
// a sheet's own `maxHeight: 'NN%'` style is computed against the FULL,
// keyboard-agnostic screen height. KeyboardAvoidingView's 'padding'
// behavior (wrapping every one of these) shrinks the space actually
// available once the keyboard opens, without the sheet's own height budget
// shrinking to match — a sheet already close to its percentage ceiling has
// nowhere to go but up, overflowing past the top of the screen
// (live-reported on several sheets this session, first fixed in
// AppBottomSheet.tsx).
//
// Simplified to a flat 80%-of-screen cap once the keyboard is open —
// live-requested, replacing the earlier per-pixel keyboard-height/top-
// margin math (Math.min(configuredPercent%, screen - keyboardHeight -
// topSafeMargin)), which was more precise but not worth the complexity
// once a flat 80% comfortably clears every real keyboard height in
// practice. A sheet's normal (keyboard-closed) height budget — its own
// `maxHeight: 'NN%'` — is completely untouched; this only ever kicks in
// once the keyboard is actually open.
//
// Returns the clamped max height in px once the keyboard is open, or
// `undefined` when it's closed — callers should fall through to their own
// existing `maxHeight: 'NN%'` style in the undefined case.
export function useKeyboardAwareMaxHeight(configuredPercent: number): number | undefined {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (!keyboardOpen) return undefined;
  const screenHeight = Dimensions.get('window').height;
  return Math.min(screenHeight * (configuredPercent / 100), screenHeight * 0.8);
}
