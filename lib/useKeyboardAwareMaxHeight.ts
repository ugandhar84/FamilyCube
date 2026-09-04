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
// Was briefly simplified to a flat 80%-of-screen cap once the keyboard is
// open (Math.min(configuredPercent%, screen * 0.8)) — but almost every
// sheet in the app is configured well UNDER 80% (75%, 55%, 45%, etc.), so
// that min() almost never actually did anything: the sheet kept its full
// keyboard-closed height budget while KeyboardAvoidingView's padding ate
// space from the bottom for the keyboard, pushing the whole sheet up and
// off the top of the screen — live-reported regression ("sheets are going
// up top high") right after that simplification shipped. Restored to
// subtracting the REAL keyboard height (+ a small top safety margin) from
// the screen, so the sheet genuinely shrinks to fit in the space actually
// left above the keyboard, same as before the simplification.
//
// Returns the clamped max height in px once the keyboard is open, or
// `undefined` when it's closed — callers should fall through to their own
// existing `maxHeight: 'NN%'` style in the undefined case, so a sheet's
// normal (keyboard-closed) height budget is completely unaffected either
// way.
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
