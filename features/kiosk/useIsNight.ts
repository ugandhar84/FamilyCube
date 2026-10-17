import { useEffect, useState } from 'react';

/** Quiet hours for the wall display: 9 PM to 6 AM. */
export const NIGHT_START_HOUR = 21;
export const NIGHT_END_HOUR = 6;

const nightNow = () => { const h = new Date().getHours(); return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR; };

/** True during quiet hours, re-checked every minute, so the idle and lock screens can dim for sleeping kids. */
export function useIsNight(): boolean {
  const [night, setNight] = useState(nightNow);
  useEffect(() => {
    const t = setInterval(() => setNight(nightNow()), 60_000);
    return () => clearInterval(t);
  }, []);
  return night;
}
