import { useCallback, useRef, useState } from 'react';

/**
 * Guards an async submit handler (create/send/save) against double-fire
 * from a fast double-tap. A `useState` flag alone (the pattern every
 * screen in this app rolled independently before this hook) isn't
 * synchronous — React can batch/delay the re-render that disables the
 * button, so a second tap landing in the same event-loop tick calls the
 * handler again before `disabled` ever takes effect. That's exactly how
 * a double-tap on "Create Trip" created two identical grocery trips
 * [live-reported: "why did we create 2" — fixed first in
 * CreateRunSheet.tsx, then asked for app-wide: "We should avoid double
 * tab submit for all the app wide"].
 *
 * `guardRef` is checked and set synchronously before anything async runs,
 * closing that gap; `submitting` is still real React state for the UI
 * (spinner text, `disabled` prop) — the state alone was never the actual
 * protection, the ref is.
 *
 * Usage:
 *   const { submitting, guard } = useSubmitGuard();
 *   const handleSave = guard(async () => { await createThing(...); });
 *   <Button disabled={submitting} onPress={handleSave} />
 */
export function useSubmitGuard() {
  const [submitting, setSubmitting] = useState(false);
  const guardRef = useRef(false);

  const guard = useCallback(<Args extends unknown[]>(
    fn: (...args: Args) => Promise<void> | void,
  ) => {
    return async (...args: Args) => {
      if (guardRef.current) return;
      guardRef.current = true;
      setSubmitting(true);
      try {
        await fn(...args);
      } finally {
        guardRef.current = false;
        setSubmitting(false);
      }
    };
  }, []);

  return { submitting, guard };
}
