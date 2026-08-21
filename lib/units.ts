// Device locale as a BCP-47 tag (e.g. "es-ES", "hi-IN") for on-device speech
// recognition (@react-native-voice/voice's Voice.start(locale)) — every
// voice-capture hook in the app used to hardcode 'en-US' regardless of the
// user's actual language, silently producing poor/garbage transcripts for
// any non-English speaker. Falls back to 'en-US' only if Intl can't resolve
// a usable region-qualified locale.
export function resolveSpeechLocale(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale && locale.includes('-') ? locale : (locale || 'en-US');
  } catch {
    return 'en-US';
  }
}

// expo-speech defaults to the OS's "compact" voice when no `voice` id is
// passed, which is the flat/robotic-sounding one — iOS ships noticeably
// better-sounding "Enhanced"/"Premium" voices (e.g. Ava, Nathan) for the
// same language, but only if the device has actually downloaded that voice
// pack (Settings > Accessibility > Spoken Content > Voices); on a device
// that hasn't, no Enhanced voice will be present in the list and this
// falls back to whatever Default voice matches the locale, same as before.
// Cached per-process since the installed voice list doesn't change mid-session.
let _cachedVoiceId: string | null | undefined;

export async function resolveBestVoiceId(): Promise<string | undefined> {
  if (_cachedVoiceId !== undefined) return _cachedVoiceId ?? undefined;
  try {
    const Speech = await import('expo-speech');
    const voices = await Speech.getAvailableVoicesAsync();
    const locale = resolveSpeechLocale();
    const lang = locale.split('-')[0].toLowerCase();
    const matches = voices.filter(v => v.language?.toLowerCase().startsWith(lang));
    const pool = matches.length > 0 ? matches : voices;
    const enhanced = pool.find(v => v.quality === Speech.VoiceQuality.Enhanced && v.language?.toLowerCase() === locale.toLowerCase())
      ?? pool.find(v => v.quality === Speech.VoiceQuality.Enhanced);
    _cachedVoiceId = enhanced?.identifier ?? null;
  } catch {
    _cachedVoiceId = null;
  }
  return _cachedVoiceId ?? undefined;
}

// Detect whether the device locale uses imperial (miles) or metric (km).
// Imperial countries: US, Liberia (LR), Myanmar (MM), UK (GB) uses miles for road distances.
const IMPERIAL_COUNTRIES = new Set(['US', 'LR', 'MM', 'GB']);

export function usesImperial(): boolean {
  try {
    const locale  = Intl.DateTimeFormat().resolvedOptions().locale; // e.g. "en-US"
    const country = locale.split('-')[1]?.toUpperCase() ?? '';
    return IMPERIAL_COUNTRIES.has(country);
  } catch {
    return false;
  }
}

// Format a distance in km using the correct unit for the device locale.
export function formatDist(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (usesImperial()) {
    const mi = km / 1.60934;
    if (mi < 0.1)  return `${Math.round(mi * 5280)} ft`;
    if (mi < 10)   return `${mi.toFixed(1)} mi`;
    return `${Math.round(mi)} mi`;
  }
  if (km < 1)  return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// Detect whether the device locale uses 24-hour time.
export function uses24HourClock(): boolean {
  try {
    const sample = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2000, 0, 1, 13));
    return !sample.includes('PM') && !sample.includes('AM') && !sample.includes('pm') && !sample.includes('am');
  } catch {
    return false;
  }
}

// Format a Date to a time string respecting the device's 12/24-hour preference.
// Replaces all inline format(d, 'h:mm a') calls so 24-hour locales (India, Europe, etc.)
// get "13:30" instead of "1:30 PM".
export function formatTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: !uses24HourClock() }).format(date);
  } catch {
    // Fallback: manual 12-hour
    const h = date.getHours(), m = date.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
}

// Returns "3 miles" or "5 km" for use in prose (e.g. "within 3 miles")
export function radiusLabel(radiusKm: number): string {
  if (usesImperial()) {
    const mi = Math.round(radiusKm / 1.60934);
    return `${mi} mile${mi !== 1 ? 's' : ''}`;
  }
  return `${radiusKm} km`;
}
