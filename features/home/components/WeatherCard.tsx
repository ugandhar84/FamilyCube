import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '@/components/AppAlert';
import { WeatherAnimation } from '@/components/home/WeatherAnimation';
import { getWeatherGradient } from '@/lib/homeUtils';
import type { Weather } from '@/lib/weather';
import { TYPO } from '@/constants/theme';

interface WeatherCardProps {
  weather: Weather;
  isDark: boolean;
  /** When true renders as a compact side-by-side widget tile */
  compact?: boolean;
}

function getPetSuggestion(condition: string, tempF: number): string | null {
  const wc = condition.toLowerCase();
  if (wc.includes('storm') || wc.includes('thunder')) return '⚡ Skip outdoor walks';
  if (wc.includes('rain') || wc.includes('drizzle'))  return '🌧 Great day for indoor training';
  if (wc.includes('snow') || wc.includes('sleet'))    return '❄️ Check paws after walks';
  if (tempF >= 95) return '🔥 Extreme heat — walk early or late';
  if (tempF >= 85) return '☀️ Hot pavement risk — test first';
  if (tempF <= 32) return '🧊 Short walks, rinse paws after';
  if (tempF <= 45) return '🧥 Your baby may want a jacket';
  if (wc.includes('clear') || wc.includes('sunny')) return '🐾 Perfect walk weather!';
  if (wc.includes('cloud')) return '🌥 Comfortable for a relaxed walk';
  return null;
}

export const WeatherCard = React.memo(function WeatherCard({ weather, isDark, compact }: WeatherCardProps) {
  const tempF = weather.unit === '°F' ? weather.temperature : weather.temperature * 9 / 5 + 32;
  const suggestion = getPetSuggestion(weather.condition ?? '', tempF);

  if (!compact) {
    // ── Legacy full-width card (kept for backward compat if ever needed) ──
    return (
      <LinearGradient
        colors={getWeatherGradient(weather.condition, tempF, isDark)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          marginHorizontal: 16, marginTop: 8, marginBottom: 12,
          borderRadius: 18, padding: 16, minHeight: 170, overflow: 'hidden',
        }}
      >
        <WeatherAnimation condition={weather.condition} />
        {weather.city && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={{ fontSize: TYPO.body, color: '#fff', fontWeight: '800' }} numberOfLines={1}>
              {weather.city}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 }}>
          <Text style={{ fontSize: 36, fontWeight: '900', color: '#fff', lineHeight: 40 }}>
            {weather.temperature}{weather.unit}
          </Text>
          <View style={{ marginBottom: 5, gap: 2 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>
              {weather.condition}
            </Text>
            {weather.feelsLike != null && weather.feelsLike !== weather.temperature && (
              <Text style={{ fontSize: TYPO.body, color: 'rgba(255,255,255,0.6)' }}>
                Feels {weather.feelsLike}{weather.unit}
              </Text>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
          {weather.humidity != null && (
            <Text style={{ fontSize: TYPO.body, color: 'rgba(255,255,255,0.65)' }}>💧 {weather.humidity}%</Text>
          )}
          {weather.windSpeed != null && (
            <Text style={{ fontSize: TYPO.body, color: 'rgba(255,255,255,0.65)' }}>
              💨 {Math.round(weather.windSpeed)}{weather.unit === '°F' ? 'mph' : 'km/h'}
            </Text>
          )}
          {weather.precipProb != null && weather.precipProb > 0 && (
            <Text style={{ fontSize: TYPO.body, color: 'rgba(255,255,255,0.65)' }}>🌧 {weather.precipProb}%</Text>
          )}
        </View>
        {suggestion && weather.warnings.length === 0 && (
          <View style={{
            backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10,
            paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start',
          }}>
            <Text style={{ fontSize: TYPO.body, color: 'rgba(255,255,255,0.92)', fontWeight: '500' }}>
              {suggestion}
            </Text>
          </View>
        )}
        {weather.warnings.length > 0 && (
          <View style={{ gap: 5, marginTop: 6 }}>
            {weather.warnings.map((w, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => showAlert('Advisory', [w.description ?? w.label, suggestion].filter(Boolean).join('\n\n'))}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: w.severity === 'extreme' ? 'rgba(220,38,38,0.8)' : w.severity === 'warning' ? 'rgba(217,119,6,0.8)' : 'rgba(180,100,0,0.7)',
                  borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
                }}
              >
                <Text numberOfLines={1} style={{ fontSize: TYPO.caption, fontWeight: '600', color: '#fff', flex: 1 }}>{w.label}</Text>
                <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.7)', fontWeight: '500' }}>Read more</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </LinearGradient>
    );
  }

  // ── Compact widget tile — sits in the left column of the weather+status row ──
  const walkOk = weather.warnings.length === 0 && tempF < 90 && tempF > 32 &&
    !(weather.condition ?? '').toLowerCase().match(/storm|thunder|snow|sleet|rain/);
  const walkLabel = weather.warnings.length > 0 ? '🔴 Stay in'
    : tempF >= 90 ? '🔴 Too hot'
    : tempF <= 32 ? '🔴 Too cold'
    : walkOk ? '🟢 Walk ready'
    : '🟡 Check first';

  return (
    <LinearGradient
      colors={getWeatherGradient(weather.condition, tempF, isDark)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1, borderRadius: 16, padding: 12, overflow: 'hidden', justifyContent: 'space-between' }}
    >
      <WeatherAnimation condition={weather.condition} />

      {/* Header: label only — badge moved below temp so it doesn't cover the animation */}
      <View>
        <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>WEATHER</Text>
        {weather.city ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
            <Ionicons name="location-outline" size={10} color="rgba(255,255,255,0.65)" />
            <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.8)', fontWeight: '700' }} numberOfLines={1}>
              {weather.city}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Big temp */}
      <View style={{ marginVertical: 4 }}>
        <Text style={{ fontSize: TYPO.hero, fontWeight: '900', color: '#fff', lineHeight: 34 }}>
          {weather.temperature}{weather.unit}
        </Text>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 1 }} numberOfLines={1}>
          {weather.condition}
        </Text>
        {weather.feelsLike != null && weather.feelsLike !== weather.temperature && (
          <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
            Feels {weather.feelsLike}{weather.unit}
          </Text>
        )}
      </View>

      {/* Humidity + wind + walk badge */}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {weather.humidity != null && (
          <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.65)' }}>💧{weather.humidity}%</Text>
        )}
        {weather.windSpeed != null && (
          <Text style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.65)' }}>
            💨{Math.round(weather.windSpeed)}{weather.unit === '°F' ? 'mph' : 'km/h'}
          </Text>
        )}
        <View style={{
          backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 6,
          paddingHorizontal: 6, paddingVertical: 3,
        }}>
          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>{walkLabel}</Text>
        </View>
      </View>

      {/* Pet suggestion or warning */}
      {weather.warnings.length > 0 ? (
        <TouchableOpacity
          onPress={() => showAlert('Advisory', weather.warnings[0].description ?? weather.warnings[0].label)}
          activeOpacity={0.8}
          style={{
            marginTop: 6,
            backgroundColor: 'rgba(220,38,38,0.7)', borderRadius: 8,
            paddingHorizontal: 8, paddingVertical: 5,
          }}
        >
          <Text numberOfLines={2} style={{ fontSize: TYPO.label, fontWeight: '600', color: '#fff' }}>
            ⚠ {weather.warnings[0].label}
          </Text>
        </TouchableOpacity>
      ) : suggestion ? (
        <View style={{
          marginTop: 6,
          backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 8,
          paddingHorizontal: 8, paddingVertical: 5,
        }}>
          <Text numberOfLines={2} style={{ fontSize: TYPO.label, color: 'rgba(255,255,255,0.88)', fontWeight: '500' }}>
            {suggestion}
          </Text>
        </View>
      ) : null}
    </LinearGradient>
  );
});
