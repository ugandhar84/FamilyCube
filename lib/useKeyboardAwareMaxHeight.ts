import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

// Shared by every hand-rolled bottom sheet in the app (AppBottomSheet.tsx,
// BottomSheet.tsx, and each one-off Modal-based sheet) — a sheet's own
// `maxHeight: 'NN%'` style is computed against the FULL, keyboard-agnostic
// screen height. KeyboardAvoidingView's 'padding' behavior (wrapping every
// one of these) shrinks the space actually available once the keyboard
// opens, without the sheet's own height budget shrinking to match — a
// sheet already close to its percentage ceiling has nowhere to go but up,
// overflowing past the top of the screen (live-reported on several sheets
// this session, first fixed in AppBottomSheet.tsx).
//
// Returns the keyboard-clamped max height in px once the keyboard is open,
// or `undefined` when it's closed — callers should fall through to their
// own existing `maxHeight: 'NN%'` style in the undefined case, so nothing
// changes about a sheet's normal (keyboard-closed) height budget.
export function useKeyboardAwareMaxHeight(configuredPercent: number, topSafeMargin = 60): number | undefined {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardHeight <= 0) return undefined;
  const screenHeight = Dimensions.get('window').height;
  return Math.min(screenHeight * (configuredPercent / 100), screenHeight - keyboardHeight - topSafeMargin);
}
