import { getLocationAPI } from './location';
import { supabase } from './supabase';
import { usesImperial } from './units';

export type WeatherWarningSeverity = 'watch' | 'warning' | 'extreme';

export interface WeatherWarning {
  type: 'heatwave' | 'thunderstorm' | 'snow' | 'rain' | 'wind';
  label: string;
  description?: string;       // full text shown when user taps advisory
  percent?: number;           // precipitation / probability %
  severity: WeatherWarningSeverity;
  emoji: string;
}

export interface Weather {
  temperature: number;
  feelsLike: number;
  unit: '°F' | '°C';
  condition: string;
  icon: string;
  description: string;
  city?: string;
  humidity?: number;
  windSpeed?: number;         // km/h or mph
  windGusts?: number;
  precipProb?: number;        // % chance of precipitation next hour
  warnings: WeatherWarning[];
}

export interface HomeInfo {
  weather: Weather | null;
  nextAppointment: {
    date: string;
    time: string;
    description: string;
  } | null;
  lastActivity: {
    timeAgo: string;
    description: string;
  } | null;
  loading: boolean;
  error: string | null;
}

// Cache weather for 30 min so every screen focus doesn't re-fetch
let weatherCache: { data: Weather; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export function clearWeatherCache() { weatherCache = null; }

// ── NWS event → our warning type ─────────────────────────────────────────────
const NWS_TYPE_MAP: { pattern: RegExp; type: WeatherWarning['type']; emoji: string }[] = [
  { pattern: /heat|excessive heat|heat wave/i,                        type: 'heatwave',    emoji: '🔥'  },
  { pattern: /tornado|severe thunderstorm|thunderstorm/i,             type: 'thunderstorm', emoji: '⛈️' },
  { pattern: /winter storm|blizzard|ice storm|snow|freezing/i,        type: 'snow',        emoji: '❄️'  },
  { pattern: /flood|rain|tropical|hurricane/i,                        type: 'rain',        emoji: '🌧️' },
  { pattern: /wind|gale/i,                                            type: 'wind',        emoji: '💨'  },
];

function nwsSeverity(s: string): WeatherWarningSeverity {
  if (s === 'Extreme') return 'extreme';
  if (s === 'Severe')  return 'warning';
  return 'watch';
}

/**
 * Fetch real NWS alerts for a US coordinate.
 * Returns null if outside the US or the request fails — caller falls back to calculated.
 */
async function fetchNWSWarnings(lat: number, lon: number): Promise<WeatherWarning[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}&status=actual&message_type=alert,update`,
      { signal: ctrl.signal, headers: { Accept: 'application/geo+json' } }
    ).finally(() => clearTimeout(timer));

    if (!res.ok) return null;           // non-US coordinate → 404 or error
    const json = await res.json();
    const features: any[] = json.features ?? [];
    if (features.length === 0) return [];  // US but no active alerts

    const warnings: WeatherWarning[] = [];
    for (const f of features) {
      const p = f.properties ?? {};
      const event: string    = p.event    ?? '';
      const severity: string = p.severity ?? 'Minor';
      const headline: string = p.headline ?? event;

      const match = NWS_TYPE_MAP.find(m => m.pattern.test(event));
      if (!match) continue;

      const description: string | undefined = p.description ?? p.instruction ?? undefined;
      warnings.push({ type: match.type, emoji: match.emoji, severity: nwsSeverity(severity), label: headline, description });
    }

    // Dedup by type — keep the most severe alert per category
    const SEVERITY_RANK: Record<string, number> = { extreme: 3, warning: 2, watch: 1 };
    const best = new Map<string, WeatherWarning>();
    for (const w of warnings) {
      const existing = best.get(w.type);
      if (!existing || (SEVERITY_RANK[w.severity] ?? 0) > (SEVERITY_RANK[existing.severity] ?? 0)) {
        best.set(w.type, w);
      }
    }
    return Array.from(best.values());
  } catch {
    return null;  // timeout / network error → fall back to calculated
  }
}

/** Calculated warnings from Open-Meteo forecast data (non-US fallback) */
function buildCalculatedWarnings(p: {
  maxTempF: number; windGustsMax: number; windGustsMaxMph: number;
  snowfallSum: number; precipProbMax: number; precipProb?: number;
  isStormy: boolean; isSnowy: boolean; isRainy: boolean;
  daily: any; imperial: boolean; temp: number;
}): WeatherWarning[] {
  const { maxTempF, windGustsMax, windGustsMaxMph, snowfallSum, precipProbMax,
          isStormy, isSnowy, isRainy, daily, imperial, temp } = p;
  const unit = imperial ? '°F' : '°C';
  const warnings: WeatherWarning[] = [];

  const highTemp = Math.round(daily.temperature_2m_max?.[0] ?? temp);
  if (maxTempF >= 104) {
    warnings.push({ type: 'heatwave', emoji: '🔥', severity: 'extreme',
      label: `Extreme heat · high ${highTemp}${unit}`,
      description: `High of ${highTemp}${unit} expected today. Extreme heat can be life-threatening for pets. Walk only before 8 AM or after 7 PM. Check pavement temperature with your hand — if it's too hot to hold for 5 seconds, it's too hot for paws. Always carry water and never leave pets in a parked vehicle.` });
  } else if (maxTempF >= 95) {
    warnings.push({ type: 'heatwave', emoji: '🌡️', severity: 'warning',
      label: `Heat warning · high ${highTemp}${unit}`,
      description: `High of ${highTemp}${unit} expected today. Hot pavement can burn paw pads — test with your hand first. Limit walks to early morning or evening and provide plenty of fresh water. Watch for signs of heat exhaustion: heavy panting, drooling, or weakness.` });
  } else if (maxTempF >= 88) {
    warnings.push({ type: 'heatwave', emoji: '☀️', severity: 'watch',
      label: `Hot day · high ${highTemp}${unit}`,
      description: `High of ${highTemp}${unit} expected. Avoid midday walks when pavement is hottest. Bring water on any outdoor activity and watch for signs of overheating.` });
  }

  if (isStormy || windGustsMaxMph >= 58) {
    warnings.push({ type: 'thunderstorm', emoji: '⛈️', severity: isStormy ? 'warning' : 'watch',
      label: isStormy ? 'Thunderstorm warning' : `Damaging wind gusts · ${Math.round(windGustsMax)}${imperial ? 'mph' : 'km/h'}`,
      description: isStormy
        ? 'Thunderstorms are active in the area. Keep pets indoors — thunder and lightning can cause panic and dangerous bolting. Ensure ID tags and microchip details are current.'
        : `Wind gusts up to ${Math.round(windGustsMax)}${imperial ? 'mph' : 'km/h'} possible. Keep pets on a lead and avoid walks near trees or loose structures.` });
  } else if (windGustsMaxMph >= 39) {
    warnings.push({ type: 'wind', emoji: '💨', severity: 'watch',
      label: `Strong winds · ${Math.round(windGustsMax)}${imperial ? 'mph' : 'km/h'}`,
      description: `Gusty winds up to ${Math.round(windGustsMax)}${imperial ? 'mph' : 'km/h'} forecast. Keep pets on a short lead outdoors and be aware of debris.` });
  }

  if (isSnowy || snowfallSum > 0) {
    const sev: WeatherWarningSeverity = snowfallSum > 10 ? 'extreme' : snowfallSum > 2 ? 'warning' : 'watch';
    warnings.push({ type: 'snow', emoji: '❄️', severity: sev,
      label: snowfallSum > 0 ? `Snow · ${snowfallSum.toFixed(1)}${imperial ? '"' : 'cm'}` : 'Snow expected',
      description: `${snowfallSum > 0 ? `${snowfallSum.toFixed(1)}${imperial ? '"' : 'cm'} of snow expected.` : 'Snow forecast.'} Rinse and dry paws after walks to remove ice-melt chemicals. Short-haired breeds may need a coat. Avoid letting pets eat snow — it may contain salt or toxins.` });
  }

  if (precipProbMax >= 30 && !isStormy && !isSnowy) {
    const sev: WeatherWarningSeverity = precipProbMax >= 80 ? 'warning' : 'watch';
    warnings.push({ type: 'rain', emoji: '🌧️', severity: sev, percent: precipProbMax,
      label: isRainy ? `Rain · ${precipProbMax}% chance` : `Rain chance · ${precipProbMax}%`,
      description: `${precipProbMax}% chance of rain today. Dry pets thoroughly after wet walks to prevent skin irritation and odour. Avoid walking near flooded drains or standing water.` });
  }

  return warnings;
}

/**
 * Get current weather for user's location using Open-Meteo (no API key needed)
 */
export async function getCurrentWeather(): Promise<Weather | null> {
  try {
    // Return cached result if still fresh
    if (weatherCache && Date.now() - weatherCache.ts < CACHE_TTL) {
      return weatherCache.data;
    }

    const locationAPI = getLocationAPI();
    if (!locationAPI) return null;

    const { status } = await locationAPI.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // Accuracy 1 = Lowest (wifi/cell — near-instant, good enough for weather)
    const location = await locationAPI.getCurrentPositionAsync({ accuracy: 1 });
    const { latitude, longitude } = location.coords;

    const imperial = usesImperial();
    const tempUnit = imperial ? 'fahrenheit' : 'celsius';

    const windUnit = imperial ? 'mph' : 'kmh';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation` +
      `&hourly=precipitation_probability,snowfall,wind_gusts_10m&forecast_hours=24` +
      `&daily=precipitation_probability_max,snowfall_sum,wind_gusts_10m_max,temperature_2m_max` +
      `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto&forecast_days=1`,
      { signal: controller.signal }
    ).finally(() => clearTimeout(timer));

    if (!response.ok) return null;

    const data = await response.json();
    const current = data.current;
    const daily   = data.daily   ?? {};
    const hourly  = data.hourly  ?? {};

    const temp      = Math.round(current.temperature_2m);
    const feelsLike = Math.round(current.apparent_temperature ?? temp);
    const tempF     = imperial ? temp : temp * 9 / 5 + 32;
    const maxTempF  = daily.temperature_2m_max?.[0] != null
      ? (imperial ? daily.temperature_2m_max[0] : daily.temperature_2m_max[0] * 9 / 5 + 32)
      : tempF;

    const { condition, icon } = getWeatherCondition(current.weather_code);

    // ── Next-hour precipitation probability ─────────────────────────────────
    const currentHourIdx = new Date().getHours();
    const precipProb: number = hourly.precipitation_probability?.[currentHourIdx] ?? 0;

    // ── Daily totals ─────────────────────────────────────────────────────────
    const precipProbMax: number  = daily.precipitation_probability_max?.[0] ?? precipProb;
    const snowfallSum: number    = daily.snowfall_sum?.[0] ?? 0;
    const windGustsMax: number   = daily.wind_gusts_10m_max?.[0] ?? current.wind_gusts_10m ?? 0;
    const windGustsMaxMph        = imperial ? windGustsMax : windGustsMax * 0.621371;

    const code = current.weather_code as number;
    const isStormy = code === 95 || code === 96 || code === 99;
    const isSnowy  = (code >= 71 && code <= 77) || code === 85 || code === 86;
    const isRainy  = code === 51 || code === 53 || code === 55
                  || code === 61 || code === 63 || code === 65
                  || code === 80 || code === 81 || code === 82;

    // ── Warnings: try NWS for US, fall back to calculated ────────────────────
    const warnings: WeatherWarning[] =
      await fetchNWSWarnings(latitude, longitude) ??
      buildCalculatedWarnings({ maxTempF, windGustsMax, windGustsMaxMph, snowfallSum, precipProbMax, isStormy, isSnowy, isRainy, daily, imperial, temp });


    // ── Reverse geocode for city name (best-effort, non-blocking) ────────────
    let city: string | undefined;
    try {
      const [place] = await locationAPI.reverseGeocodeAsync({ latitude, longitude });
      city = place?.city || place?.subregion || place?.region || undefined;
    } catch { /* ignore — city is optional */ }

    const result: Weather = {
      temperature: temp,
      feelsLike,
      unit: imperial ? '°F' : '°C',
      condition,
      icon,
      description: getWeatherDescription(code, temp, imperial),
      city,
      humidity:    current.relative_humidity_2m ?? undefined,
      windSpeed:   current.wind_speed_10m       ?? undefined,
      windGusts:   current.wind_gusts_10m       ?? undefined,
      precipProb,
      warnings,
    };

    weatherCache = { data: result, ts: Date.now() };
    return result;
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      console.error('Weather fetch failed:', error);
    }
    return weatherCache?.data ?? null; // return stale cache on failure
  }
}

/**
 * Get next upcoming appointment for active pet, falling back to the most recent past one.
 */
export async function getNextAppointment(petId: string): Promise<(HomeInfo['nextAppointment'] & { isPast?: boolean; apptId?: string }) | null> {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Try future first (exclude completed/cancelled)
    const { data: future } = await supabase
      .from('appointments')
      .select('id, type, title, scheduled_at')
      .eq('pet_id', petId)
      .not('status', 'in', '("completed","cancelled")')
      .gte('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .single();

    const data = future ?? null;
    let isPast = false;

    // Fall back to most recent OVERDUE appointment (past but not completed/cancelled)
    if (!data) {
      const { data: past } = await supabase
        .from('appointments')
        .select('id, type, title, scheduled_at')
        .eq('pet_id', petId)
        .not('status', 'in', '("completed","cancelled")')
        .lt('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .single();

      if (!past) return null;

      const aptDate = new Date(past.scheduled_at);
      const timeStr = aptDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        date: aptDate.toLocaleDateString(),
        time: timeStr,
        description: past.type || 'Appointment',
        isPast: true,
        apptId: past.id,
      };
    }

    const appointmentDate = new Date(data.scheduled_at);
    const isToday    = appointmentDate.toDateString() === now.toDateString();
    const isTomorrow = appointmentDate.toDateString() === tomorrow.toDateString();
    const dateStr    = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : appointmentDate.toLocaleDateString();
    const timeStr    = appointmentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return { date: dateStr, time: timeStr, description: data.type || 'Appointment', isPast, apptId: data.id };
  } catch (error) {
    console.error('Appointment fetch failed:', error);
    return null;
  }
}

/**
 * Get last logged activity for pet with cascading fallbacks.
 * All sources fetched in parallel; highest-priority non-null result wins.
 * Priority: Walk → Meal → Vet → Grooming → Weight → Vaccine → Pet Age
 */
export async function getLastActivity(petId: string): Promise<HomeInfo['lastActivity'] | null> {
  try {
    const todayIso = new Date().toISOString();

    const [
      { data: walks },
      { data: meals },
      { data: vetVisits },
      { data: grooming },
      { data: weights },
      { data: vaccines },
      { data: pet },
    ] = await Promise.all([
      supabase
        .from('daily_checklist')
        .select('completed_at')
        .eq('pet_id', petId)
        .eq('type', 'walk')
        .eq('completed', true)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('feeding_logs')
        .select('fed_at')
        .eq('pet_id', petId)
        .order('fed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('vet_visits')
        .select('visit_date')
        .eq('pet_id', petId)
        .order('visit_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('grooming_logs')
        .select('done_at')
        .eq('pet_id', petId)
        .order('done_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('weight_logs')
        .select('created_at, weight_kg')
        .eq('pet_id', petId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('vaccines')
        .select('due_date')
        .eq('pet_id', petId)
        .gte('due_date', todayIso)
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('pets')
        .select('birthdate')
        .eq('id', petId)
        .single(),
    ]);

    if (walks) {
      return { timeAgo: getTimeAgo(new Date(walks.completed_at)), description: '🚶 Walk' };
    }
    if (meals) {
      return { timeAgo: getTimeAgo(new Date(meals.fed_at)), description: '🍽️ Meal logged' };
    }
    if (vetVisits) {
      return { timeAgo: getTimeAgo(new Date(vetVisits.visit_date)), description: '🏥 Vet visit' };
    }
    if (grooming) {
      return { timeAgo: getTimeAgo(new Date(grooming.done_at)), description: '✂️ Groomed' };
    }
    if (weights) {
      return {
        timeAgo: getTimeAgo(new Date(weights.created_at)),
        description: `⚖️ Weight: ${weights.weight_kg}lbs`,
      };
    }
    if (vaccines) {
      const dueDate = new Date(vaccines.due_date);
      const daysUntil = Math.floor((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return { timeAgo: daysUntil <= 0 ? 'Due now' : `In ${daysUntil}d`, description: '💉 Vaccine due' };
    }
    if (pet?.birthdate) {
      const age = calculateAge(new Date(pet.birthdate));
      return { timeAgo: 'Member since', description: `${age.years}y ${age.months}m old` };
    }

    return null;
  } catch (error) {
    console.error('Activity fetch failed:', error);
    return null;
  }
}

/**
 * Helper: Calculate age from birthdate
 */
function calculateAge(birthdate: Date): { years: number; months: number } {
  const today = new Date();
  let years = today.getFullYear() - birthdate.getFullYear();
  let months = today.getMonth() - birthdate.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months };
}

/**
 * Helper: Convert WMO weather code to condition and emoji
 */
function getWeatherCondition(code: number): { condition: string; icon: string } {
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 20;
  // WMO Weather interpretation codes
  if (code === 0 || code === 1) return { condition: isNight ? 'Clear Night' : 'Clear', icon: isNight ? '🌙' : '☀️' };
  if (code === 2) return { condition: isNight ? 'Partly Cloudy Night' : 'Partly Cloudy', icon: isNight ? '🌙' : '⛅' };
  if (code === 3) return { condition: 'Overcast', icon: '☁️' };
  if (code === 45 || code === 48) return { condition: 'Foggy', icon: '🌫️' };
  if (code === 51 || code === 53 || code === 55) return { condition: 'Drizzle', icon: '🌧️' };
  if (code === 61 || code === 63 || code === 65) return { condition: 'Rainy', icon: '🌧️' };
  if (code === 71 || code === 73 || code === 75) return { condition: 'Snowy', icon: '❄️' };
  if (code === 77) return { condition: 'Snow', icon: '❄️' };
  if (code === 80 || code === 81 || code === 82) return { condition: 'Rain Showers', icon: '🌧️' };
  if (code === 85 || code === 86) return { condition: 'Snow Showers', icon: '❄️' };
  if (code === 95 || code === 96 || code === 99) return { condition: 'Thunderstorm', icon: '⛈️' };
  return { condition: 'Unknown', icon: '🌤️' };
}

/**
 * Helper: Get user-friendly weather description — time + temperature aware
 */
function getWeatherDescription(code: number, tempRaw: number, imperial: boolean): string {
  const hour      = new Date().getHours();
  const isNight   = hour < 6 || hour >= 20;
  const isEvening = hour >= 17 && hour < 20;
  const isMorning = hour >= 6  && hour < 10;

  // Normalise to °F for thresholds
  const tempF = imperial ? tempRaw : tempRaw * 9 / 5 + 32;

  // ── Extreme heat override (trumps all condition codes) ────────────────────
  // Pavement burns paws above 95°F; heatstroke risk above 100°F
  if (tempF >= 104) return '🚨 Extreme heat — keep pets indoors, pavement can burn paws';
  if (tempF >= 100) return '🌡️ Dangerous heat — stay home, limit to bathroom breaks only';
  if (tempF >= 95)  return '🌡️ Very hot — quick outdoor trips only, wet paws & water always';

  const isHot  = tempF >= 85;
  const isCold = tempF < 40;

  if (code === 0 || code === 1) {
    if (isNight && isHot)  return 'Warm clear night — windows open 🌙';
    if (isNight && isCold) return 'Cold clear night — warm beds 🌙';
    if (isNight)           return 'Clear night — perfect rest time 🌙';
    if (isEvening && isHot) return 'Hot evening — wait for cooler air after sunset';
    if (isEvening)         return 'Nice evening for a stroll';
    if (isMorning && isHot) return 'Get that walk in early — heat coming 🌡️';
    if (isMorning)         return 'Great morning for outdoor play';
    if (isHot)             return 'Hot day — early walks, plenty of water 🌡️';
    return 'Perfect for outdoor play';
  }
  if (code === 2) {
    if (isNight && isHot)  return 'Warm cloudy night — good sleeping weather';
    if (isNight)           return 'Cloudy night — stay cozy 🌙';
    if (isHot)             return 'Partly cloudy — still hot, hydrate pets';
    return 'Mild conditions — good for a walk';
  }
  if (code === 3) {
    if (isNight && isHot)  return 'Warm overcast night — leave windows cracked';
    if (isNight)           return 'Overcast night — cozy time indoors';
    if (isEvening)         return 'Overcast evening — skip the walk tonight';
    if (isHot)             return 'Overcast but hot — limit outdoor time 🌡️';
    return 'Overcast — indoor play day';
  }
  if (code === 45 || code === 48) {
    if (isNight) return 'Foggy night — keep pets close 🌫️';
    return 'Foggy — short leash walks only';
  }
  if (code === 51 || code === 53 || code === 55) {
    if (isNight) return 'Light drizzle — dry paws before bed';
    return 'Light drizzle — quick trips only';
  }
  if (code === 61 || code === 63 || code === 65) {
    if (isNight) return 'Raining overnight — indoor snuggles 🌧️';
    return 'Rainy — indoor play day 🌧️';
  }
  if (code === 71 || code === 73 || code === 75) {
    if (isNight) return 'Snowing — warm beds tonight ❄️';
    return 'Snow — wipe paws after walks ❄️';
  }
  if (code === 80 || code === 81 || code === 82) {
    if (isNight) return 'Rain showers overnight — stay in';
    return 'Rain showers — stay dry';
  }
  if (code === 85 || code === 86) {
    if (isNight) return 'Snow showers overnight ❄️';
    return 'Snow showers — bundle up ❄️';
  }
  if (code === 95 || code === 96 || code === 99) {
    if (isNight) return 'Thunderstorm — comfort anxious pets 🌩️';
    return 'Thunderstorm — keep pets inside 🌩️';
  }
  return 'Check local weather';
}

/**
 * Helper: Convert timestamp to relative time string
 */
// ── Today's schedule across all pets ────────────────────────────────────────

export interface TodayItem {
  id: string;
  type: 'appointment' | 'medication';
  title: string;
  subtitle: string;
  sortTime: number; // Unix ms for sorting; medications with no time get end-of-day
  timeLabel: string;
  petId: string;
  petName: string;
  petEmoji: string;
  isOverdue: boolean;
  apptId?: string;
  medId?: string;
  // Appointment detail fields
  apptType?: string;
  apptVetName?: string;
  apptVetPhone?: string;
  apptClinicName?: string;
  apptClinicAddress?: string;
  apptNotes?: string;
  apptStatus?: string;
  apptCost?: number | null;
  // Medication detail fields
  medDosage?: string;
  medFrequency?: string;
  medNotes?: string;
  medStartDate?: string;
  medEndDate?: string;
  medIsActive?: boolean;
}

export function isMedDueToday(frequency: string | null, startDate: string | null, today: Date): boolean {
  const f = (frequency ?? '').toLowerCase().trim();

  // Daily / multiple times a day / as needed → always show
  if (!f || f.includes('daily') || f.includes('day') || f.includes('twice')
    || f.includes('every') || f.includes('as needed') || f.includes('prn')) return true;

  const anchor = startDate ? new Date(startDate + 'T00:00:00') : today;

  // Weekly → show on the same day of the week as start_date
  if (f.includes('week')) {
    return today.getDay() === anchor.getDay();
  }

  // Every N weeks
  const everyNWeeks = f.match(/every\s*(\d+)\s*week/);
  if (everyNWeeks) {
    const n = parseInt(everyNWeeks[1], 10);
    const daysDiff = Math.floor((today.getTime() - anchor.getTime()) / 86400000);
    return daysDiff >= 0 && daysDiff % (n * 7) === 0;
  }

  // Monthly → show on the same day-of-month as start_date
  if (f.includes('month')) {
    const anchorDay = anchor.getDate();
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    // If anchor day > days in current month, show on last day of month
    return today.getDate() === Math.min(anchorDay, lastDayOfMonth);
  }

  // Every N months
  const everyNMonths = f.match(/every\s*(\d+)\s*month/);
  if (everyNMonths) {
    const n = parseInt(everyNMonths[1], 10);
    const monthsDiff = (today.getFullYear() - anchor.getFullYear()) * 12
      + (today.getMonth() - anchor.getMonth());
    return monthsDiff >= 0 && monthsDiff % n === 0 && today.getDate() === anchor.getDate();
  }

  // Unknown frequency — show it (safe default)
  return true;
}

// Session-scoped set of item IDs the user has marked done this session.
// Filters them out immediately on refetch, regardless of DB write timing.
const _sessionDoneIds = new Set<string>();

export function markScheduleItemDone(id: string): void {
  _sessionDoneIds.add(id);
}

export async function getTodayScheduleAllPets(
  petIds: string[],
  pets: { id: string; name: string; emoji: string }[],
): Promise<TodayItem[]> {
  if (!petIds.length) return [];

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const todayDate  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const petMap = new Map(pets.map(p => [p.id, p]));

  const [apptResult, medResult, doneResult] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, pet_id, title, type, scheduled_at, clinic_name, clinic_address, vet_name, vet_phone, status, notes, cost')
      .in('pet_id', petIds)
      .gte('scheduled_at', todayStart.toISOString())
      .lte('scheduled_at', todayEnd.toISOString())
      .in('status', ['upcoming', 'scheduled', 'confirmed'])
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('medications')
      .select('id, pet_id, name, dosage, frequency, start_date, end_date, notes, is_active')
      .in('pet_id', petIds)
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${todayDate}`)
      .or(`end_date.is.null,end_date.gte.${todayDate}`),
    // Which medications have already been marked done today via daily_checklist?
    supabase
      .from('daily_checklist')
      .select('label, pet_id')
      .in('pet_id', petIds)
      .eq('type', 'medicine')
      .eq('date', todayDate)
      .eq('completed', true),
  ]);

  const items: TodayItem[] = [];

  // Build a set of "petId:medName" keys already marked done today
  const doneKeys = new Set(
    (doneResult.data ?? []).map((r: { pet_id: string; label: string }) => `${r.pet_id}:${r.label}`)
  );

  for (const a of apptResult.data ?? []) {
    const pet = petMap.get(a.pet_id);
    if (!pet) continue;
    const d = new Date(a.scheduled_at);
    const timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sub = [a.clinic_name, a.vet_name].filter(Boolean).join(' · ') || a.type || 'Appointment';
    items.push({
      id: `appt-${a.id}`,
      type: 'appointment',
      title: a.title,
      subtitle: sub,
      sortTime: d.getTime(),
      timeLabel,
      petId: a.pet_id,
      petName: pet.name,
      petEmoji: pet.emoji,
      isOverdue: d < now,
      apptId: a.id,
      apptType: a.type,
      apptVetName: a.vet_name ?? undefined,
      apptVetPhone: a.vet_phone ?? undefined,
      apptClinicName: a.clinic_name ?? undefined,
      apptClinicAddress: a.clinic_address ?? undefined,
      apptNotes: a.notes ?? undefined,
      apptStatus: a.status ?? undefined,
      apptCost: a.cost ?? null,
    });
  }

  for (const m of medResult.data ?? []) {
    const pet = petMap.get(m.pet_id);
    if (!pet) continue;
    // Skip meds already marked done today
    if (doneKeys.has(`${m.pet_id}:${m.name}`)) continue;
    // Skip meds not due today based on frequency
    if (!isMedDueToday(m.frequency, m.start_date, now)) continue;
    const sub = [m.dosage, m.frequency].filter(Boolean).join(' · ') || 'Medication';
    items.push({
      id: `med-${m.id}`,
      type: 'medication',
      title: m.name,
      subtitle: sub,
      sortTime: todayEnd.getTime() - 1, // medications sort after timed appointments
      timeLabel: 'Today',
      petId: m.pet_id,
      petName: pet.name,
      petEmoji: pet.emoji,
      isOverdue: false,
      medId: m.id,
      medDosage: m.dosage ?? undefined,
      medFrequency: m.frequency ?? undefined,
      medNotes: m.notes ?? undefined,
      medStartDate: m.start_date ?? undefined,
      medEndDate: m.end_date ?? undefined,
      medIsActive: m.is_active ?? true,
    });
  }

  // Filter out anything the user already acted on this session
  const filtered = items.filter(i => !_sessionDoneIds.has(i.id));

  filtered.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.sortTime - b.sortTime;
  });

  return filtered;
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
