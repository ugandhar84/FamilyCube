/**
 * kioskFonts — the two real Google Fonts docs/kitchen-hub-mockup.html's own
 * design actually specifies, per that file's own footer note: "Fraunces
 * (serif) carries the clock, headlines, and big numbers... Inter handles
 * dense schedule/chore text." Kiosk had no font-loading infrastructure at
 * all before this — every screen rendered in the OS system font — so this
 * follows the one existing precedent in the app for a sub-brand's own
 * typeface (features/games/arcade/ArcadeScreen.tsx's scoped `useFonts` for
 * Baloo 2): loaded once, locally, where the feature that needs it renders,
 * not wired into the app's global startup path in app/_layout.tsx.
 *
 * Weights match exactly what the mock's own <link> tag requests — no more,
 * no less: Inter 400/500/600/700/800/900, Fraunces 400/500/600/700
 * (non-italic; the mock never uses an italic weight).
 */
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import {
  Fraunces_400Regular,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';

/**
 * Family name strings for use in `fontFamily` style props. Every consumer
 * should branch on `useKioskFonts()`'s returned boolean before applying
 * these — using one before its face has loaded silently falls back to the
 * OS default font with no error, which is correct behavior but easy to
 * mistake for these constants "not working."
 */
export const KIOSK_FONT = {
  inter: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
    black: 'Inter_900Black',
  },
  fraunces: {
    regular: 'Fraunces_400Regular',
    medium: 'Fraunces_500Medium',
    semibold: 'Fraunces_600SemiBold',
    bold: 'Fraunces_700Bold',
  },
} as const;

/** Call once, high in the kiosk tree (KioskScreen) — see that file's usage. */
export function useKioskFonts(): boolean {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });
  return loaded;
}
