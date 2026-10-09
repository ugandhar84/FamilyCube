/**
 * App-wide double-tap protection. Wraps Pressable / TouchableOpacity /
 * TouchableHighlight so a second press on the SAME button within WINDOW_MS is
 * ignored, and an async onPress blocks further presses on that button until it
 * settles (capped at MAX_BUSY_MS so a never-resolving handler can't kill it).
 *
 * Installed once from index.js, before any screen module evaluates, by
 * redefining the lazy getters on react-native's exports — so every existing
 * `import { Pressable } from 'react-native'` gets the guarded version with no
 * per-screen edits. Controls that need rapid taps (PIN keypad, prev/next
 * arrows) opt out with `allowRapidPress`.
 */
import React, { forwardRef, useCallback, useRef } from 'react';

const WINDOW_MS = 500;
const MAX_BUSY_MS = 10_000;

declare module 'react-native' {
  interface PressableProps { allowRapidPress?: boolean }
  interface TouchableWithoutFeedbackProps { allowRapidPress?: boolean }
}

function guarded(Orig: any, name: string) {
  const Guarded = forwardRef<any, any>((props, ref) => {
    const { onPress, allowRapidPress, ...rest } = props;
    const last = useRef(0);
    const busy = useRef(false);

    const handle = useCallback((...args: any[]) => {
      if (allowRapidPress) return onPress?.(...args);
      const now = Date.now();
      if (busy.current || now - last.current < WINDOW_MS) return undefined;
      last.current = now;
      const result = onPress?.(...args);
      if (result && typeof result.then === 'function') {
        busy.current = true;
        const release = () => { busy.current = false; };
        const cap = setTimeout(release, MAX_BUSY_MS);
        result.then(() => { clearTimeout(cap); release(); }, () => { clearTimeout(cap); release(); });
      }
      return result;
    }, [onPress, allowRapidPress]);

    return <Orig ref={ref} {...rest} onPress={onPress ? handle : undefined} />;
  });
  Guarded.displayName = `Guarded(${name})`;
  return Guarded;
}

let installed = false;

export function installPressGuard() {
  if (installed) return;
  installed = true;
  const RN = require('react-native');
  for (const key of ['Pressable', 'TouchableOpacity', 'TouchableHighlight']) {
    const Orig = RN[key];
    if (!Orig) continue;
    const G = guarded(Orig, key);
    try {
      Object.defineProperty(RN, key, { configurable: true, enumerable: true, get: () => G });
    } catch (e) {
      console.warn('[pressGuard] could not wrap', key, e);
    }
  }
}
