// Localization utilities for currency, temperature, weight based on country

export type Country = 'US' | 'IN';

export const COUNTRIES = {
  US: { name: 'United States', code: 'US', flag: '🇺🇸' },
  IN: { name: 'India', code: 'IN', flag: '🇮🇳' },
};

export interface LocaleSettings {
  currency: string;
  currencySymbol: string;
  temperature: 'F' | 'C';
  weight: 'LB' | 'KG';
  distance: 'MI' | 'KM';
}

export function getLocaleSettings(country: Country): LocaleSettings {
  switch (country) {
    case 'US':
      return {
        currency: 'USD',
        currencySymbol: '$',
        temperature: 'F',
        weight: 'LB',
        distance: 'MI',
      };
    case 'IN':
      return {
        currency: 'INR',
        currencySymbol: '₹',
        temperature: 'C',
        weight: 'KG',
        distance: 'KM',
      };
    default:
      return {
        currency: 'USD',
        currencySymbol: '$',
        temperature: 'F',
        weight: 'LB',
        distance: 'MI',
      };
  }
}

// Temperature conversion
export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

// Weight conversion
export function lbToKg(lb: number): number {
  return lb * 0.453592;
}

export function kgToLb(kg: number): number {
  return kg * 2.20462;
}

// Distance conversion
export function miToKm(mi: number): number {
  return mi * 1.60934;
}

export function kmToMi(km: number): number {
  return km / 1.60934;
}

// Format currency
export function formatCurrency(amount: number, country: Country): string {
  const settings = getLocaleSettings(country);
  return `${settings.currencySymbol}${amount.toFixed(2)}`;
}

// Format temperature
export function formatTemperature(value: number, country: Country): string {
  const settings = getLocaleSettings(country);
  return `${value.toFixed(1)}°${settings.temperature}`;
}

// Format weight
export function formatWeight(value: number, country: Country): string {
  const settings = getLocaleSettings(country);
  return `${value.toFixed(1)} ${settings.weight}`;
}

// Format distance
export function formatDistance(value: number, country: Country): string {
  const settings = getLocaleSettings(country);
  return `${value.toFixed(1)} ${settings.distance}`;
}
