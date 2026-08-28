/**
 * TrialNagBanner — days 8-14 of the paywall gating timeline (see
 * docs/paywall_setup_and_implementation.md): the trial has ended but the
 * app stays fully usable, with a dismissible nag shown at most once per
 * app session rather than on every Hub visit. Day 15+ is a separate, real
 * soft-lock enforced at each create-action's call site, not here.
 *
 * "Once per session" is a plain module-level flag, not persisted storage —
 * it resets on app restart, matching "at most once per session" exactly
 * (a persisted flag would instead mean "once ever," which is a different,
 * weaker nag than what's specced).
 */
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, TYPO } from '@/constants/theme';
import { usePaywallSheetStore } from '@/store/paywallSheetStore';

let shownThisSession = false;

export function TrialNagBanner({ colors, isDark }: { colors: any; isDark: boolean }) {
  const [dismissed, setDismissed] = useState(shownThisSession);

  if (dismissed) return null;

  return (
    <View style={{
      marginHorizontal: 16, marginBottom: 12, borderRadius: RADIUS.lg,
      backgroundColor: isDark ? colors.primary + '1A' : colors.primaryLight,
      borderWidth: 1, borderColor: colors.primary + '40',
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, paddingHorizontal: 14,
    }}>
      <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
          Your free trial has ended
        </Text>
        <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>
          Subscribe to Family Plan to keep everything running smoothly.
        </Text>
      </View>
      <Pressable
        onPress={() => usePaywallSheetStore.getState().show({
          headline: 'Family Plan',
          body: 'Unlock full access for your whole family.',
        })}
        style={{
          paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.md,
          backgroundColor: colors.primary,
        }}
      >
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: '#fff' }}>Subscribe</Text>
      </Pressable>
      <Pressable
        onPress={() => { shownThisSession = true; setDismissed(true); }}
        hitSlop={8}
      >
        <Ionicons name="close" size={18} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}
