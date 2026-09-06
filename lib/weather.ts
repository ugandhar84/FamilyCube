// Real current-weather fetch via Open-Meteo — no API key required, device
// GPS only. Ported from the proven Petkoinia implementation
// (lib/weather.ts there), trimmed to what a glance-only display needs
// (temperature/condition/icon) — Petkoinia's pet-specific NWS severe-
// weather alerts and description copy are out of scope here.
//
// Previously this file was a stub: the real weather-fetch code was
// PawBond-era pet-app functionality with zero real callers in Family Cube
// and had been removed, leaving only clearWeatherCache() (still called from
// authStore.ts on sign-out) as a placeholder. This restores a real
// implementation for the kiosk header's clock/weather refresh — see that
// file's own header comment for why a fabricated temperature was
// deliberately never shown there before this.
import { getLocationAPI } from './location';
import { usesImperial } from './units';

export interface Weather {
  temperature: number;
  unit: '°F' | '°C';
  condition: string;
  icon: string;
}

// 30 min — a household kitchen display doesn't need fresher-than-this, and
// it keeps a screen that's rarely backgrounded from re-fetching constantly.
let weatherCache: { data: Weather; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export function clearWeatherCache() { weatherCache = null; }

/**
 * Get current weather for the device's location using Open-Meteo (no API
 * key needed). Returns null on any failure — permission denied, no native
 * location module, network/timeout — so callers can omit the display
 * cleanly rather than show a stale or fabricated reading.
 */
export async function getCurrentWeather(): Promise<Weather | null> {
  try {
    if (weatherCache && Date.now() - weatherCache.ts < CACHE_TTL) {
      return weatherCache.data;
    }

    const locationAPI = getLocationAPI();
    if (!locationAPI) return null;

    const { status } = await locationAPI.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // Accuracy 1 = Lowest (wifi/cell — near-instant, good enough for weather,
    // and a wall-mounted kiosk isn't moving between calls anyway).
    const location = await locationAPI.getCurrentPositionAsync({ accuracy: 1 });
    const { latitude, longitude } = location.coords;

    const imperial = usesImperial();
    const tempUnit = imperial ? 'fahrenheit' : 'celsius';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code&temperature_unit=${tempUnit}&timezone=auto&forecast_days=1`,
      { signal: controller.signal },
    ).finally(() => clearTimeout(timer));

    if (!response.ok) return null;

    const data = await response.json();
    const current = data.current;
    if (!current) return null;

    const temperature = Math.round(current.temperature_2m);
    const { condition, icon } = getWeatherCondition(current.weather_code);

    const result: Weather = {
      temperature,
      unit: imperial ? '°F' : '°C',
      condition,
      icon,
    };

    weatherCache = { data: result, ts: Date.now() };
    return result;
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      console.warn('[weather] fetch failed', error?.message ?? error);
    }
    return weatherCache?.data ?? null; // stale cache beats nothing on a transient failure
  }
}

/** WMO weather code -> a short condition label + emoji icon. */
function getWeatherCondition(code: number): { condition: string; icon: string } {
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 20;
  if (code === 0 || code === 1) return { condition: isNight ? 'Clear' : 'Clear', icon: isNight ? '🌙' : '☀️' };
  if (code === 2) return { condition: 'Partly Cloudy', icon: isNight ? '🌙' : '⛅' };
  if (code === 3) return { condition: 'Overcast', icon: '☁️' };
  if (code === 45 || code === 48) return { condition: 'Foggy', icon: '🌫️' };
  if (code === 51 || code === 53 || code === 55) return { condition: 'Drizzle', icon: '🌧️' };
  if (code === 61 || code === 63 || code === 65) return { condition: 'Rainy', icon: '🌧️' };
  if (code === 71 || code === 73 || code === 75 || code === 77) return { condition: 'Snowy', icon: '❄️' };
  if (code === 80 || code === 81 || code === 82) return { condition: 'Rain Showers', icon: '🌧️' };
  if (code === 85 || code === 86) return { condition: 'Snow Showers', icon: '❄️' };
  if (code === 95 || code === 96 || code === 99) return { condition: 'Thunderstorm', icon: '⛈️' };
  return { condition: 'Unknown', icon: '🌤️' };
}
