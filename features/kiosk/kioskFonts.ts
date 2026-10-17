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
import { useEffect } from 'react';
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
import { Caveat_600SemiBold, Caveat_700Bold } from '@expo-google-fonts/caveat';
import { Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold } from '@expo-google-fonts/figtree';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { StyleSheet, Text } from 'react-native';

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
  // Handwriting for sticky notes and the family board, like a note on the fridge.
  hand: { semibold: 'Caveat_600SemiBold', bold: 'Caveat_700Bold' },
} as const;

/** Call once, high in the kiosk tree (KioskScreen) — see that file's usage. */
export function useKioskFonts(): boolean {
  installKioskTextFont();
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
    Caveat_600SemiBold,
    Caveat_700Bold,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  useEffect(() => {
    kioskTextFontOn = loaded;
    return () => { kioskTextFontOn = false; };
  }, [loaded]);
  return loaded;
}

/**
 * The kiosk design uses Figtree for text and Bricolage Grotesque for headlines and big numbers.
 * Most kiosk styles set only fontWeight, so while the kiosk is mounted every <Text> without its own
 * fontFamily is given the matching Figtree weight (and Bricolage for large, heavy text). Anything that
 * already sets a fontFamily (Caveat handwriting, Inter, Fraunces) is left alone, and the patch is
 * switched off again when the kiosk unmounts so the phone screens are unaffected.
 */
let kioskTextFontOn = false;
let patched = false;
export function installKioskTextFont() {
  if (patched) return;
  patched = true;
  const T: any = Text;
  const orig = T.render;
  if (typeof orig !== 'function') return;
  T.render = function (...args: any[]) {
    const el = orig.apply(this, args);
    if (!kioskTextFontOn || !el?.props) return el;
    const flat: any = StyleSheet.flatten(el.props.style) ?? {};
    if (flat.fontFamily) return el;
    const w = String(flat.fontWeight ?? '400');
    const n = w === 'bold' ? 700 : parseInt(w, 10) || 400;
    const size = flat.fontSize ?? 14;
    const display = size >= 20 && n >= 700;
    const family = display
      ? (n >= 800 ? 'BricolageGrotesque_800ExtraBold' : 'BricolageGrotesque_700Bold')
      : n >= 800 ? 'Figtree_800ExtraBold' : n >= 700 ? 'Figtree_700Bold' : n >= 600 ? 'Figtree_600SemiBold' : 'Figtree_500Medium';
    return { ...el, props: { ...el.props, style: [el.props.style, { fontFamily: family, fontWeight: undefined }] } };
  };
}
