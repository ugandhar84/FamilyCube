// Admin Pricing screen — edit the paywall's DISPLAY pricing (fallback
// price text + strikethrough "was" price + discount badge)
// [live-requested: "admin should be able to change the price in future
// both monthly and yearly with discount showing" / "I would be able to
// edit the display price of our plan monthly and yearly (with
// discounted strike value to show)" / "we can also add % badge too"].
//
// Big, non-dismissable warning up top: this does NOT change what Apple/
// Google actually charge. See pricing_config's own migration comment.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { useFamilyStore } from '@/store/familyStore';
import { getPricingConfig, updatePricingConfig, type PricingConfigRow } from '@/lib/db/admin';
import { showAlert } from '@/components/AppAlert';

function Field({ label, value, onChangeText, colors, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (t: string) => void; colors: any;
  placeholder?: string; keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        style={{
          borderWidth: 1.5, borderColor: colors.border, borderRadius: RADIUS.md,
          paddingHorizontal: 14, paddingVertical: 10, color: colors.textPrimary, fontSize: TYPO.body,
          backgroundColor: colors.card,
        }}
      />
    </View>
  );
}

export default function PricingScreen() {
  const { colors } = useTheme();
  const activeMemberId = useFamilyStore(s => s.activeMemberId);
  const [row, setRow] = useState<PricingConfigRow | null>(null);
  const [monthly, setMonthly] = useState('');
  const [yearly, setYearly] = useState('');
  const [monthlyWas, setMonthlyWas] = useState('');
  const [yearlyWas, setYearlyWas] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [badgeText, setBadgeText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getPricingConfig();
      if (data) {
        setRow(data);
        setMonthly(data.monthlyPriceDisplay);
        setYearly(data.yearlyPriceDisplay);
        setMonthlyWas(data.monthlyWasPriceDisplay ?? '');
        setYearlyWas(data.yearlyWasPriceDisplay ?? '');
        setDiscountPct(data.yearlyDiscountPct != null ? String(data.yearlyDiscountPct) : '');
        setBadgeText(data.yearlyDiscountBadgeText ?? '');
      }
    } catch (e: any) {
      showAlert("Couldn't load pricing config", e?.message ?? 'Something went wrong.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSave = async () => {
    if (!monthly.trim() || !yearly.trim()) {
      showAlert('Prices required', 'Monthly and yearly display prices cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updatePricingConfig('family_plan', {
        monthlyPriceDisplay: monthly.trim(),
        yearlyPriceDisplay: yearly.trim(),
        monthlyWasPriceDisplay: monthlyWas.trim() || null,
        yearlyWasPriceDisplay: yearlyWas.trim() || null,
        yearlyDiscountPct: discountPct.trim() ? parseFloat(discountPct.trim()) : null,
        yearlyDiscountBadgeText: badgeText.trim() || null,
      }, activeMemberId ?? null);
      setRow(updated);
      showAlert('Saved', 'Paywall display pricing is updated for every user.');
    } catch (e: any) {
      showAlert("Couldn't save", e?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (!row) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <View style={{
          flexDirection: 'row', gap: 10, backgroundColor: colors.danger + '14', borderRadius: RADIUS.md,
          borderWidth: 1, borderColor: colors.danger + '40', padding: 14, marginBottom: 20,
        }}>
          <Ionicons name="warning-outline" size={20} color={colors.danger} />
          <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.textPrimary, lineHeight: 18 }}>
            This is DISPLAY TEXT ONLY. It does not change what Apple/Google actually charge — that's set in App Store Connect / Google Play Console. Update the real price there first, then reflect it here so the fallback text and discount badge stay accurate.
          </Text>
        </View>

        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Current prices
        </Text>
        <Field label="Monthly price" value={monthly} onChangeText={setMonthly} colors={colors} placeholder="$3.99" />
        <Field label="Yearly price" value={yearly} onChangeText={setYearly} colors={colors} placeholder="$47.88" />

        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6, marginBottom: 10 }}>
          Strikethrough "was" price (optional)
        </Text>
        <Field label="Monthly was-price" value={monthlyWas} onChangeText={setMonthlyWas} colors={colors} placeholder="e.g. $5.99" />
        <Field label="Yearly was-price" value={yearlyWas} onChangeText={setYearlyWas} colors={colors} placeholder="e.g. $71.88" />

        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6, marginBottom: 10 }}>
          Discount badge (optional)
        </Text>
        <Field label="Discount %" value={discountPct} onChangeText={setDiscountPct} colors={colors} placeholder="e.g. 40" keyboardType="decimal-pad" />
        <Field label="Badge text override" value={badgeText} onChangeText={setBadgeText} colors={colors} placeholder="e.g. 2 months free (overrides the % text if set)" />

        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          style={{ backgroundColor: colors.primary, borderRadius: RADIUS.md, padding: 14, alignItems: 'center', marginTop: 8 }}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : (
            <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Save</Text>
          )}
        </TouchableOpacity>

        <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', marginTop: 12 }}>
          Last updated {new Date(row.updatedAt).toLocaleString()}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
