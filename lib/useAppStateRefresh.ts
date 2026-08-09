import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Calls `onForeground` whenever the app returns to the foreground,
 * but no more than once per `minIntervalMs` (default 60 s).
 */
export function useAppStateRefresh(onForeground: () => void, minIntervalMs = 60_000) {
  const lastRefresh = useRef(0);
  const appState    = useRef<AppStateStatus>(AppState.currentState);
  const cb          = useRef(onForeground);
  cb.current = onForeground; // keep ref current without re-subscribing

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = next;
      if (wasBackground && next === 'active') {
        if (Date.now() - lastRefresh.current >= minIntervalMs) {
          lastRefresh.current = Date.now();
          cb.current();
        }
      }
    });
    return () => sub.remove();
  }, [minIntervalMs]);
}
